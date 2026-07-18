import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { updateLeadStatus } from "@/modules/leads/service";

const statusSchema = z.object({
  status: z.enum(["new", "contacted", "quoted", "booked", "won", "lost"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const { id: tenantId, leadId } = await params;
  const body = await req.json();
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid status value" } }, { status: 400 });
  }

  const updated = await updateLeadStatus(tenantId, leadId, parsed.data.status);
  if (!updated) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Lead not found" } }, { status: 404 });
  }

  return NextResponse.json({ ok: true, lead: updated });
}
