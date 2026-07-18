import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

export type DomainEventType =
  | "TenantOnboarded"
  | "MessageReceived"
  | "MessageSent"
  | "LeadCreated"
  | "LeadStatusChanged";

/**
 * Persists a domain event. This is intentionally simple — not a queue,
 * not pub/sub — just an append-only log that gives us:
 *  - an audit trail
 *  - a dedupe key for webhook idempotency (providerEventId)
 *  - a seam for later analytics or module extraction
 * Escalate to a real event bus / queue only when something actually
 * needs to react to these asynchronously (see architecture standard §10).
 */
export async function emitEvent(params: {
  tenantId?: string;
  type: DomainEventType;
  providerEventId?: string;
  payload?: unknown;
}) {
  await db.insert(events).values({
    tenantId: params.tenantId,
    type: params.type,
    providerEventId: params.providerEventId,
    payload: params.payload as object,
  });
}

/**
 * Idempotency check: has this exact provider event already been processed?
 * Used by the Evolution webhook to dedupe retried deliveries.
 */
export async function eventAlreadyProcessed(providerEventId: string): Promise<boolean> {
  const { eq } = await import("drizzle-orm");
  const existing = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.providerEventId, providerEventId))
    .limit(1);
  return existing.length > 0;
}
