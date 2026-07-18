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
