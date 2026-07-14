import re
import uuid
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field

from app.services.db import get_db
from app.services import evolution
from app.config import ADMIN_API_KEY
from app.services.intent import GLOBAL_REPLIES

router = APIRouter(prefix="/tenants", tags=["tenants"])


def _check_admin(x_admin_key: str | None):
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{str(uuid.uuid4())[:6]}"


class NewTenant(BaseModel):
    business_name: str
    niche: str = Field(description="plumber | electrician | salon | cleaner | aircon | other")
    owner_name: str | None = None
    owner_email: str | None = None
    owner_phone: str | None = None
    monthly_fee: float = 700


@router.post("")
def create_tenant(payload: NewTenant, x_admin_key: str = Header(default=None)):
    """
    Onboard a new paying business:
    1. Create a row in Supabase
    2. Spin up their own Evolution instance
    3. Point that instance at our shared webhook
    4. Return the QR code payload for them to scan and go live
    """
    _check_admin(x_admin_key)
    db = get_db()

    instance_name = _slugify(payload.business_name)

    # 1. Save tenant first (status=trial)
    row = {
        "business_name": payload.business_name,
        "niche": payload.niche,
        "owner_name": payload.owner_name,
        "owner_email": payload.owner_email,
        "owner_phone": payload.owner_phone,
        "evolution_instance_name": instance_name,
        "monthly_fee": payload.monthly_fee,
        "status": "trial",
    }
    result = db.table("tenants").insert(row).execute()
    tenant = result.data[0]

    # 2 & 3. Create the Evolution instance + webhook (best-effort;
    # if Evolution isn't reachable yet, tenant row still exists so
    # you can retry via /tenants/{id}/connect)
    try:
        evolution.create_instance(instance_name)
        evolution.set_webhook(instance_name)
    except Exception as e:
        # Don't fail onboarding — just flag it for retry
        db.table("tenants").update({"status": "pending_connect"}).eq(
            "id", tenant["id"]
        ).execute()
        return {"tenant": tenant, "warning": f"Evolution setup failed, retry via /connect: {e}"}

    return {"tenant": tenant, "next_step": f"GET /tenants/{tenant['id']}/qr to pair WhatsApp"}


@router.get("/{tenant_id}/qr")
def get_qr(tenant_id: str, x_admin_key: str = Header(default=None)):
    """Fetch the QR pairing code for a tenant's Evolution instance."""
    _check_admin(x_admin_key)
    db = get_db()
    tenant = db.table("tenants").select("*").eq("id", tenant_id).single().execute().data
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    qr = evolution.get_qr(tenant["evolution_instance_name"])
    return {"tenant": tenant["business_name"], "qr": qr}


@router.get("")
def list_tenants(x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    return db.table("tenants").select("*").order("created_at", desc=True).execute().data


@router.get("/{tenant_id}/leads")
def get_tenant_leads(tenant_id: str, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    return (
        db.table("leads")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.get("/{tenant_id}/leads/{lead_id}")
def get_lead_detail(tenant_id: str, lead_id: str, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    lead = db.table("leads").select("*").eq("id", lead_id).eq("tenant_id", tenant_id).single().execute().data
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    messages = (
        db.table("messages")
        .select("*")
        .eq("lead_id", lead_id)
        .order("created_at", desc=False)
        .execute()
        .data
    )
    return {"lead": lead, "messages": messages}


class LeadStatusUpdate(BaseModel):
    status: str


@router.post("/{tenant_id}/leads/{lead_id}/status")
def update_lead_status(tenant_id: str, lead_id: str, payload: LeadStatusUpdate, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    lead = db.table("leads").select("*").eq("id", lead_id).eq("tenant_id", tenant_id).single().execute().data
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.table("leads").update({"status": payload.status}).eq("id", lead_id).execute()
    return {"ok": True, "status": payload.status}


class ReplyTemplate(BaseModel):
    intent: str
    body: str


@router.get("/{tenant_id}/reply-templates")
def list_reply_templates(tenant_id: str, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    rows = db.table("reply_templates").select("*").eq("tenant_id", tenant_id).execute().data
    return rows


@router.put("/{tenant_id}/reply-templates")
def upsert_reply_template(tenant_id: str, payload: ReplyTemplate, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    existing = db.table("reply_templates").select("*").eq("tenant_id", tenant_id).eq("intent", payload.intent).limit(1).execute().data
    if existing:
        db.table("reply_templates").update({"body": payload.body}).eq("id", existing[0]["id"]).execute()
        return {"ok": True, "action": "updated"}
    db.table("reply_templates").insert({"tenant_id": tenant_id, "intent": payload.intent, "body": payload.body}).execute()
    return {"ok": True, "action": "created"}


class SeedTemplatesRequest(BaseModel):
    niche: str = ""


@router.post("/{tenant_id}/reply-templates/seed")
def seed_reply_templates(tenant_id: str, payload: SeedTemplatesRequest, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    tenant = db.table("tenants").select("niche").eq("id", tenant_id).single().execute().data
    niche = (payload.niche or (tenant.get("niche") if tenant else "") or "").lower()

    defaults = {}
    for intent in GLOBAL_REPLIES:
        defaults[intent] = GLOBAL_REPLIES[intent]

    from app.routers.webhook import NICHE_REPLIES
    if niche in NICHE_REPLIES:
        for intent, body in NICHE_REPLIES[niche].items():
            defaults[intent] = body

    for intent, body in defaults.items():
        existing = db.table("reply_templates").select("*").eq("tenant_id", tenant_id).eq("intent", intent).limit(1).execute().data
        if existing:
            db.table("reply_templates").update({"body": body}).eq("id", existing[0]["id"]).execute()
        else:
            db.table("reply_templates").insert({"tenant_id": tenant_id, "intent": intent, "body": body}).execute()

    return {"ok": True, "seeded": list(defaults.keys())}


class CreateOrder(BaseModel):
    lead_id: str | None = None
    amount: float
    description: str
    business_name: str = ""


@router.post("/{tenant_id}/orders")
def create_order(tenant_id: str, payload: CreateOrder, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = get_db()
    result = db.table("orders").insert({
        "tenant_id": tenant_id,
        "lead_id": payload.lead_id,
        "amount": payload.amount,
        "description": payload.description,
        "business_name": payload.business_name,
    }).execute()
    return {"order": result.data[0]}
