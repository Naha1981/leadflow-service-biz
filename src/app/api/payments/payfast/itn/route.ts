import { NextRequest, NextResponse } from "next/server";
import { processItn } from "@/modules/payments/service";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const data: Record<string, string> = {};
  form.forEach((value, key) => {
    data[key] = String(value);
  });

  const result = await processItn(data);

  if (!result.ok) {
    // PayFast doesn't need a specific error body, but logging server-side
    // is what actually matters for catching fraud attempts or bugs.
    console.warn("PayFast ITN rejected:", result.reason, { m_payment_id: data.m_payment_id });
    return NextResponse.json({ status: "rejected", reason: result.reason }, { status: 400 });
  }

  return NextResponse.json({ status: "ok" });
}
