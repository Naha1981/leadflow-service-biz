import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { generateSignature, PAYFAST_HOST } from "@/lib/integrations/payfast/client";
import { emitEvent } from "@/lib/events/emitter";
import type { CreateOrderInput } from "./schema";

const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID ?? "";
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY ?? "";
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || null;
const PAYFAST_MODE = process.env.PAYFAST_MODE ?? "sandbox";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";

export async function createOrder(tenantId: string, input: CreateOrderInput) {
  const [order] = await db
    .insert(orders)
    .values({
      tenantId,
      leadId: input.leadId,
      amount: String(input.amount),
      description: input.description,
      businessName: input.businessName,
    })
    .returning();
  return order;
}

export async function getOrderById(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

/**
 * Builds the auto-submitting HTML form that redirects the customer to
 * PayFast's hosted checkout page. Field order matters for the signature
 * (see payfast client) — never reorder alphabetically.
 */
export function buildCheckoutHtml(order: {
  id: string;
  tenantId: string;
  amount: string;
  description: string | null;
  businessName: string | null;
}): string {
  const data: Record<string, string> = {
    merchant_id: PAYFAST_MERCHANT_ID,
    merchant_key: PAYFAST_MERCHANT_KEY,
    return_url: `${PUBLIC_BASE_URL}/api/payments/payfast/success`,
    cancel_url: `${PUBLIC_BASE_URL}/api/payments/payfast/cancel`,
    notify_url: `${PUBLIC_BASE_URL}/api/payments/payfast/itn`,
    m_payment_id: order.id,
    amount: Number(order.amount).toFixed(2),
    item_name: order.description ?? "LeadFlow order",
    custom_int1: order.tenantId,
    custom_str1: order.businessName ?? "",
  };

  const signature = generateSignature(data, PAYFAST_PASSPHRASE);
  const allFields = { ...data, signature };

  const inputs = Object.entries(allFields)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
    .join("");

  return `<html><body onload="document.getElementById('pf').submit();">
    <form id="pf" action="https://${PAYFAST_HOST}/eng/process" method="post">${inputs}</form>
  </body></html>`;
}

export type ItnResult =
  | { ok: true }
  | { ok: false; reason: "signature_mismatch" | "order_not_found" | "amount_mismatch" | "not_confirmed_by_payfast" };

/**
 * Full ITN validation per the PayFast standard — checks performed:
 *  1. Signature match
 *  2. Amount matches our own order record
 *  3. Server-to-server confirmation with PayFast's validate endpoint
 *
 * NOTE: source-IP verification against PayFast's published IP ranges is
 * NOT implemented here — same gap the FastAPI version had. Flagged
 * explicitly rather than silently ported as if it were complete.
 */
export async function processItn(formData: Record<string, string>): Promise<ItnResult> {
  const { signature: receivedSig, ...rest } = formData;
  const expectedSig = generateSignature(rest, PAYFAST_PASSPHRASE);

  if (receivedSig !== expectedSig) {
    return { ok: false, reason: "signature_mismatch" };
  }

  const orderId = formData.m_payment_id;
  const order = await getOrderById(orderId);
  if (!order) {
    return { ok: false, reason: "order_not_found" };
  }

  const amountGross = parseFloat(formData.amount_gross ?? "0");
  if (Math.abs(amountGross - Number(order.amount)) > 0.01) {
    return { ok: false, reason: "amount_mismatch" };
  }

  const validateHost = PAYFAST_MODE === "sandbox" ? "sandbox.payfast.co.za" : "www.payfast.co.za";
  const body = new URLSearchParams(formData).toString();
  const confirmRes = await fetch(`https://${validateHost}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const confirmText = (await confirmRes.text()).trim();

  if (confirmText !== "VALID") {
    return { ok: false, reason: "not_confirmed_by_payfast" };
  }

  await db
    .update(orders)
    .set({
      status: "paid",
      pfPaymentId: formData.pf_payment_id,
      paymentData: formData,
    })
    .where(eq(orders.id, orderId));

  await emitEvent({
    tenantId: order.tenantId,
    type: "MessageSent",
    payload: { orderId, pfPaymentId: formData.pf_payment_id, event: "OrderPaid" },
  });

  return { ok: true };
}
