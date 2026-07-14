import time
from collections import defaultdict
from datetime import datetime, time as dtime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Request, HTTPException

from app.services.db import get_db
from app.services import evolution
from app.services.intent import classify

router = APIRouter(prefix="/webhook", tags=["webhook"])

GLOBAL_REPLIES = {
    "greeting": "Hi! Reply with one of these:\n1) Quote\n2) Book\n3) Prices\n4) Call back",
    "quote": "Great — send us: service needed, suburb, and preferred time. We'll quote you today.",
    "booking": "Let's get you booked. What day and time works best, and what's the job?",
    "pricing": "Our starting rates depend on the job — tell us what you need and we'll send exact pricing.",
    "callback": "Got it — we'll call you back shortly. What's the best time to reach you?",
    "other": "Thanks for your message! Reply MENU to see options.",
}

NICHE_REPLIES = {
    "plumber": {
        "quote": "For a plumbing quote, tell us: suburb, the issue (burst pipe / geyser / drain), and when you need it.",
        "booking": "We'll dispatch a plumber. What suburb are you in and is this an emergency?",
        "pricing": "Plumbing call-outs start at a standard rate — send your suburb and issue for an exact quote.",
    },
    "salon": {
        "quote": "For pricing, tell us the service (haircut / colour / wash & blow) and preferred stylist.",
        "booking": "Which service, which day, and preferred time?",
        "pricing": "Prices depend on service and length — tell us what you need and we'll confirm rates.",
    },
    "cleaner": {
        "quote": "Tell us: property type, number of rooms, and preferred day for a deep-clean quote.",
        "booking": "Which day works for you, and is this a once-off or regular clean?",
        "pricing": "Rates vary by size and frequency — send details and we'll price it.",
    },
    "electrician": {
        "quote": "Tell us: suburb, the electrical issue, and when you need it. We'll quote within the hour.",
        "booking": "Is this an emergency or planned work? Tell us suburb and job type.",
        "pricing": "Electrical call-out rates depend on the job — send suburb + issue for an exact quote.",
    },
    "aircon": {
        "quote": "Tell us: type of unit (split / cassette / ducted), suburb, and service needed.",
        "booking": "Which day suits you? We service all major brands.",
        "pricing": "Send your AC type and suburb for an instant quote.",
    },
}

OPT_OUT_KEYWORDS = {"stop", "unsubscribe", "remove me", "opt out", "opt-out", "end"}
DEBOUNCE_SECONDS = 10

_last_reply_ts: dict[str, float] = {}


def _tenant_reply(tenant: dict, intent: str) -> str:
    niche = (tenant.get("niche") or "").lower()
    templates = tenant.get("reply_templates")
    if templates and isinstance(templates, dict) and intent in templates:
        return templates[intent]
    if niche in NICHE_REPLIES and intent in NICHE_REPLIES[niche]:
        return NICHE_REPLIES[niche][intent]
    return GLOBAL_REPLIES.get(intent, GLOBAL_REPLIES["other"])


def _is_after_hours(tenant: dict) -> bool:
    hours = tenant.get("business_hours")
    if not hours or not isinstance(hours, dict):
        return False
    tz_name = hours.get("timezone", "Africa/Johannesburg")
    try:
        tz = ZoneInfo(tz_name)
        now = datetime.now(tz)
        current = now.time()
        open_str = hours.get("open", "08:00")
        close_str = hours.get("close", "17:00")
        open_time = dtime.fromisoformat(open_str)
        close_time = dtime.fromisoformat(close_str)
        if open_time <= close_time:
            return not (open_time <= current <= close_time)
        return not (current >= open_time or current <= close_time)
    except Exception:
        return False


def _after_hours_reply(tenant: dict, intent: str) -> str:
    base = _tenant_reply(tenant, intent)
    return f"(After-hours) We'll reply during business hours. {base}"


@router.post("/evolution/{instance_name}")
async def evolution_webhook(instance_name: str, req: Request):
    data = await req.json()
    db = get_db()

    tenant = (
        db.table("tenants")
        .select("*")
        .eq("evolution_instance_name", instance_name)
        .single()
        .execute()
        .data
    )
    if not tenant:
        return {"ok": True, "ignored": True}

    try:
        msg = data.get("data", {}) if isinstance(data, dict) else {}
        key = msg.get("key", {})
        remote_jid = key.get("remoteJid") or msg.get("remoteJid")
        if not remote_jid:
            return {"ok": True}

        if key.get("fromMe"):
            return {"ok": True}

        number = remote_jid.split("@")[0]
        text = (msg.get("message", {}) or {}).get("conversation") or ""
        has_media = bool(
            (msg.get("message", {}) or {}).get("imageMessage")
            or (msg.get("message", {}) or {}).get("documentMessage")
            or (msg.get("message", {}) or {}).get("audioMessage")
            or (msg.get("message", {}) or {}).get("videoMessage")
        )

        lower_text = (text or "").strip().lower()
        if any(k in lower_text for k in OPT_OUT_KEYWORDS):
            db.table("messages").insert({
                "tenant_id": tenant["id"],
                "direction": "outbound",
                "body": "You've been removed from our list. Message START to re-subscribe.",
            }).execute()
            evolution.send_text(instance_name, number, "You've been removed from our list. Message START to re-subscribe.")
            return {"ok": True, "action": "opt_out"}

        intent = classify(text) if not has_media else "other"

        existing = (
            db.table("leads")
            .select("*")
            .eq("tenant_id", tenant["id"])
            .eq("phone", number)
            .limit(1)
            .execute()
            .data
        )
        lead_id = None
        if existing:
            lead = existing[0]
            if lead.get("status") in ("won", "lost"):
                db.table("leads").update({
                    "intent": intent,
                    "last_message": text,
                    "status": "new",
                    "reopened_at": datetime.utcnow().isoformat(),
                }).eq("id", lead["id"]).execute()
            else:
                db.table("leads").update({
                    "intent": intent,
                    "last_message": text,
                }).eq("id", lead["id"]).execute()
            lead_id = lead["id"]
        else:
            new_lead = (
                db.table("leads")
                .insert({
                    "tenant_id": tenant["id"],
                    "phone": number,
                    "intent": intent,
                    "last_message": text,
                    "status": "new",
                })
                .execute()
                .data[0]
            )
            lead_id = new_lead["id"]

        db.table("messages").insert({
            "tenant_id": tenant["id"],
            "lead_id": lead_id,
            "direction": "inbound",
            "body": text or "[media message]",
            "raw_payload": data,
        }).execute()

        if has_media:
            media_ack = "Thanks for sending that — we'll review it and get back to you shortly."
            evolution.send_text(instance_name, number, media_ack)
            db.table("messages").insert({
                "tenant_id": tenant["id"],
                "lead_id": lead_id,
                "direction": "outbound",
                "body": media_ack,
            }).execute()
            return {"ok": True, "intent": intent, "media": True}

        batch_key = f"{instance_name}:{number}"
        now = time.time()
        last_ts = _last_reply_ts.get(batch_key, 0)
        if now - last_ts < DEBOUNCE_SECONDS:
            return {"ok": True, "intent": intent, "debounced": True}

        _last_reply_ts[batch_key] = now

        reply_text = _after_hours_reply(tenant, intent) if _is_after_hours(tenant) else _tenant_reply(tenant, intent)
        evolution.send_text(instance_name, number, reply_text)

        db.table("messages").insert({
            "tenant_id": tenant["id"],
            "lead_id": lead_id,
            "direction": "outbound",
            "body": reply_text,
        }).execute()

        return {"ok": True, "intent": intent}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
