import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { seedReplyTemplates } from "@/modules/tenants/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const seeded = await seedReplyTemplates(id, body?.niche);
  return NextResponse.json({ ok: true, seeded });
}
