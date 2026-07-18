import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createOrderSchema } from "@/modules/payments/schema";
import { createOrder } from "@/modules/payments/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid admin key" } }, { status: auth.status });

  const { id: tenantId } = await params;
  const body = await req.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      { status: 400 },
    );
  }

  const order = await createOrder(tenantId, parsed.data);
  return NextResponse.json({ order }, { status: 201 });
}
