import { NextRequest, NextResponse } from "next/server";
import { getTenantByInstanceName } from "@/modules/tenants/service";
import { findOrCreateLead } from "@/modules/leads/service";
import { logMessage } from "@/modules/messages/service";
import { classifyIntent, REPLIES } from "@/modules/messages/intent";
import { sendText } from "@/lib/integrations/evolution/client";
import { emitEvent, eventAlreadyProcessed } from "@/lib/events/emitter";
import type { EvolutionInboundPayload } from "@/lib/integrations/evolution/client";

/**
 * Shared webhook for ALL tenants — Evolution tells us which tenant via
 * the instance name in the URL, so one route serves unlimited tenants.
 *
 * Follows the webhook rules from the architecture standard (§5):
 *  1. Normalize the payload
 *  2. Dedupe by provider event ID (Evolution will retry deliveries)
 *  3. Persist the raw event before processing (audit + replay)
 *  4. Respond fast; nothing here does slow/heavy work
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ instance: string }> }) {
  const { instance: instanceName } = await params;
  const payload: EvolutionInboundPayload = await req.json();

  const tenant = await getTenantByInstanceName(instanceName);
  if (!tenant) {
    // Unknown instance — ignore silently, don't error-retry-storm Evolution
    return NextResponse.json({ ok: true, ignored: true });
  }

  const key = payload.data?.key;
  const remoteJid = key?.remoteJid;
  if (!remoteJid) return NextResponse.json({ ok: true });

  // Ignore the bot's own sent messages (prevents reply loops)
  if (key?.fromMe) return NextResponse.json({ ok: true });

  // Idempotency: Evolution may deliver the same event twice
  const providerEventId = key?.id;
  if (providerEventId && (await eventAlreadyProcessed(providerEventId))) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Persist the raw event first, before any processing (audit + replay)
  await emitEvent({
    tenantId: tenant.id,
    type: "MessageReceived",
    providerEventId,
    payload,
  });

  const number = remoteJid.split("@")[0];
  const text = payload.data?.message?.conversation ?? "";
  const intent = classifyIntent(text);

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
    body: text,
    rawPayload: payload,
  });

  const replyText = REPLIES[intent];

  try {
    await sendText(instanceName, number, replyText);
    await logMessage({
      tenantId: tenant.id,
      leadId: lead.id,
      direction: "outbound",
      body: replyText,
    });
    await emitEvent({ tenantId: tenant.id, type: "MessageSent", payload: { leadId: lead.id, intent } });
  } catch (err) {
    // Reply failed — inbound message + lead are already safely persisted
    // above, so nothing is lost; just log for manual follow-up.
    console.error(`Failed to send reply to tenant ${tenant.id}:`, err);
  }

  return NextResponse.json({ ok: true, intent });
}
