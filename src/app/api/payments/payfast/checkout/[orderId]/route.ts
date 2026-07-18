import { NextRequest, NextResponse } from "next/server";
import { getOrderById, buildCheckoutHtml } from "@/modules/payments/service";

// Intentionally public — this is the link a customer clicks from
// WhatsApp, not an admin-only endpoint.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Order not found" } }, { status: 404 });
  }

  const html = buildCheckoutHtml(order);
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
