import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLeadById } from "@/modules/leads/service";
import { getMessagesForLead } from "@/modules/messages/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const { id: tenantId, leadId } = await params;
  const lead = await getLeadById(tenantId, leadId);
  if (!lead) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Lead not found" } }, { status: 404 });
  }

  const messages = await getMessagesForLead(leadId);
  return NextResponse.json({ lead, messages });
}
