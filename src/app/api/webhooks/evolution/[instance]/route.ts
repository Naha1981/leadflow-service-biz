import { NextRequest, NextResponse } from "next/server";
import { getTenantByInstanceName, getReplyTemplateMap } from "@/modules/tenants/service";
import { findOrCreateLead, markOptedOut, isOptedOut } from "@/modules/leads/service";
import { logMessage, secondsSinceLastOutbound } from "@/modules/messages/service";
import { classifyIntent } from "@/modules/messages/intent";
import { resolveReply } from "@/modules/messages/replies";
import { isAfterHours } from "@/lib/business-hours";
import { sendText } from "@/lib/integrations/evolution/client";
import { emitEvent, eventAlreadyProcessed } from "@/lib/events/emitter";
import type { EvolutionInboundPayload } from "@/lib/integrations/evolution/client";

const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "remove me", "opt out", "opt-out", "end"];
const DEBOUNCE_SECONDS = 10;

function hasMedia(message: Record<string, unknown> | undefined): boolean {
  if (!message) return false;
  return Boolean(
    message.imageMessage || message.documentMessage || message.audioMessage || message.videoMessage,
  );
}

/**
 * Shared webhook for ALL tenants. Full parity with the FastAPI version's
 * logic, ported to this architecture — with one deliberate correction:
 * debounce is DB-backed here (see messages/service.ts), not an in-memory
 * dict, because serverless functions don't share memory between
 * invocations the way a single long-running Python process does.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ instance: string }> }) {
  const { instance: instanceName } = await params;
  const payload: EvolutionInboundPayload = await req.json();

  const tenant = await getTenantByInstanceName(instanceName);
  if (!tenant) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const key = payload.data?.key;
  const remoteJid = key?.remoteJid;
  if (!remoteJid) return NextResponse.json({ ok: true });
  if (key?.fromMe) return NextResponse.json({ ok: true });

  const providerEventId = key?.id;
  if (providerEventId && (await eventAlreadyProcessed(providerEventId))) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await emitEvent({ tenantId: tenant.id, type: "MessageReceived", providerEventId, payload });

  const number = remoteJid.split("@")[0];
  const text = payload.data?.message?.conversation ?? "";
  const lowerText = text.trim().toLowerCase();

  // --- Persistent opt-out check (closes the FastAPI gap: this now
  // suppresses ALL future replies, not just the STOP message itself) ---
  if (await isOptedOut(tenant.id, number)) {
    return NextResponse.json({ ok: true, action: "opted_out_ignored" });
  }

  const messageHasMedia = hasMedia(payload.data?.message as Record<string, unknown> | undefined);
  const intent = messageHasMedia ? "other" : classifyIntent(text);

  const lead = await findOrCreateLead({
    tenantId: tenant.id,
    phone: number,
    intent,
    lastMessage: text,
  });

  await logMessage({
    tenantId: tenant.id,
    leadId: lead.id,
    direction: "inbound",
    body: text || "[media message]",
    rawPayload: payload,
  });

  if (OPT_OUT_KEYWORDS.some((k) => lowerText.includes(k))) {
    await markOptedOut(tenant.id, number);
    const confirmText = "You've been removed from our list. Message START to re-subscribe.";
    await sendText(instanceName, number, confirmText);
    await logMessage({ tenantId: tenant.id, leadId: lead.id, direction: "outbound", body: confirmText });
    return NextResponse.json({ ok: true, action: "opt_out" });
  }

  // --- Media handling: acknowledge, don't attempt to classify content ---
  if (messageHasMedia) {
    const mediaAck = "Thanks for sending that — we'll review it and get back to you shortly.";
    await sendText(instanceName, number, mediaAck);
    await logMessage({ tenantId: tenant.id, leadId: lead.id, direction: "outbound", body: mediaAck });
    return NextResponse.json({ ok: true, intent, media: true });
  }

  // --- DB-backed debounce (see note above on why this differs from FastAPI) ---
  const secondsSince = await secondsSinceLastOutbound(lead.id);
  if (secondsSince !== null && secondsSince < DEBOUNCE_SECONDS) {
    return NextResponse.json({ ok: true, intent, debounced: true });
  }

  // --- Three-tier reply resolution + business hours ---
  const customTemplates = await getReplyTemplateMap(tenant.id);
  const baseReply = resolveReply({ niche: tenant.niche, intent, customTemplates });
  const replyText = isAfterHours(tenant.businessHours)
    ? `(After-hours) We'll reply during business hours. ${baseReply}`
    : baseReply;

  try {
    await sendText(instanceName, number, replyText);
    await logMessage({ tenantId: tenant.id, leadId: lead.id, direction: "outbound", body: replyText });
    await emitEvent({ tenantId: tenant.id, type: "MessageSent", payload: { leadId: lead.id, intent } });
  } catch (err) {
    console.error(`Failed to send reply to tenant ${tenant.id}:`, err);
  }

  return NextResponse.json({ ok: true, intent });
}
