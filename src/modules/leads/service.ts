import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import type { Intent } from "@/modules/messages/intent";
import { emitEvent } from "@/lib/events/emitter";

/**
 * Find the existing lead for this tenant+phone, or create a new one.
 * Repeat customers attach to one lead record rather than creating
 * duplicates — same behavior as the FastAPI version.
 *
 * Ported: if the existing lead's status is won/lost, reopening it —
 * resetting status to "new" and stamping reopenedAt — rather than
 * silently overwriting a closed lead with no record of re-engagement.
 */
export async function findOrCreateLead(params: {
  tenantId: string;
  phone: string;
  intent: Intent;
  lastMessage: string;
}) {
  const existing = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, params.tenantId), eq(leads.phone, params.phone)))
    .limit(1);

  if (existing.length > 0) {
    const wasClosed = existing[0].status === "won" || existing[0].status === "lost";

    const [updated] = await db
      .update(leads)
      .set({
        intent: params.intent,
        lastMessage: params.lastMessage,
        updatedAt: new Date(),
        ...(wasClosed ? { status: "new", reopenedAt: new Date() } : {}),
      })
      .where(eq(leads.id, existing[0].id))
      .returning();

    if (wasClosed) {
      await emitEvent({
        tenantId: params.tenantId,
        type: "LeadStatusChanged",
        payload: { leadId: existing[0].id, from: existing[0].status, to: "new", reason: "reopened" },
      });
    }

    return updated;
  }

  const [created] = await db
    .insert(leads)
    .values({
      tenantId: params.tenantId,
      phone: params.phone,
      intent: params.intent,
      lastMessage: params.lastMessage,
      status: "new",
    })
    .returning();

  await emitEvent({
    tenantId: params.tenantId,
    type: "LeadCreated",
    payload: { leadId: created.id, phone: params.phone },
  });

  return created;
}

export async function listLeadsForTenant(tenantId: string) {
  return db.select().from(leads).where(eq(leads.tenantId, tenantId)).orderBy(desc(leads.createdAt));
}

export async function getLeadById(tenantId: string, leadId: string) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .limit(1);
  return lead ?? null;
}

export async function updateLeadStatus(tenantId: string, leadId: string, status: string) {
  const [updated] = await db
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .returning();

  if (updated) {
    await emitEvent({
      tenantId,
      type: "LeadStatusChanged",
      payload: { leadId, to: status },
    });
  }

  return updated ?? null;
}

/**
 * Persistent opt-out — closes a gap the FastAPI version had. There, STOP
 * only suppressed the reply to the message it arrived in; nothing
 * prevented future auto-replies to that number. Here, the flag is
 * checked on every inbound message before any reply logic runs.
 */
export async function markOptedOut(tenantId: string, phone: string) {
  await db
    .update(leads)
    .set({ optedOut: true, updatedAt: new Date() })
    .where(and(eq(leads.tenantId, tenantId), eq(leads.phone, phone)));
}

export async function isOptedOut(tenantId: string, phone: string): Promise<boolean> {
  const [lead] = await db
    .select({ optedOut: leads.optedOut })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.phone, phone)))
    .limit(1);
  return lead?.optedOut ?? false;
}
