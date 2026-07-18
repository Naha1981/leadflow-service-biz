import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTenantById } from "@/modules/tenants/service";
import { getQr } from "@/lib/integrations/evolution/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const { id } = await params;
  const tenant = await getTenantById(id);
  if (!tenant || !tenant.evolutionInstanceName) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Tenant not found" } }, { status: 404 });
  }

  const qr = await getQr(tenant.evolutionInstanceName);
  return NextResponse.json({ tenant: tenant.businessName, qr });
}
