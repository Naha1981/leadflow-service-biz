import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createTenantSchema } from "@/modules/tenants/schema";
import { onboardTenant, listTenants } from "@/modules/tenants/service";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const body = await req.json();
  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const result = await onboardTenant(parsed.data);
  return NextResponse.json(result, { status: 201 });
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const tenants = await listTenants();
  return NextResponse.json(tenants);
}
