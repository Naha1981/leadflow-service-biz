import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

export async function logMessage(params: {
  tenantId: string;
  leadId: string;
  direction: "inbound" | "outbound";
  body: string;
  rawPayload?: unknown;
}) {
  await db.insert(messages).values({
    tenantId: params.tenantId,
    leadId: params.leadId,
    direction: params.direction,
    body: params.body,
    rawPayload: params.rawPayload as object | undefined,
  });
}

export async function getMessagesForLead(leadId: string) {
  return db.select().from(messages).where(eq(messages.leadId, leadId)).orderBy(asc(messages.createdAt));
}

/**
 * DB-backed debounce check. The FastAPI version used an in-memory dict,
 * which doesn't survive serverless function invocations on Vercel — each
 * invocation can be a cold instance with no shared memory. This queries
 * the actual last outbound message timestamp instead, which is correct
 * regardless of how many function instances are running concurrently.
 */
export async function secondsSinceLastOutbound(leadId: string): Promise<number | null> {
  const [last] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.leadId, leadId), eq(messages.direction, "outbound")))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (!last) return null;
  return (Date.now() - last.createdAt.getTime()) / 1000;
}
