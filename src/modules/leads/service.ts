import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import type { Intent } from "@/modules/messages/intent";
import { emitEvent } from "@/lib/events/emitter";

/**
 * Find the existing lead for this tenant+phone, or create a new one.
 * Repeat customers attach to one lead record rather than creating
 * duplicates — same behavior as the FastAPI version.
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
    const [updated] = await db
      .update(leads)
      .set({
        intent: params.intent,
        lastMessage: params.lastMessage,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, existing[0].id))
      .returning();
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
