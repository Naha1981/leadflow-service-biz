import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "cancelled", message: "Payment was cancelled." });
}
