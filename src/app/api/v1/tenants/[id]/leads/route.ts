import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listLeadsForTenant } from "@/modules/leads/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const { id } = await params;
  const leads = await listLeadsForTenant(id);
  return NextResponse.json(leads);
}
