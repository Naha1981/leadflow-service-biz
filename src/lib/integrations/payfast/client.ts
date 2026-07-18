/**
 * PayFast checkout integration. The ONLY place this app talks to PayFast
 * directly — matches the payfast-integration skill's verified algorithm.
 *
 * Critical: checkout signature uses FIELD ORDER, not alphabetical order.
 * Alphabetical is the separate API-based integration's rule, not this one.
 */
import crypto from "crypto";

const PAYFAST_MODE = process.env.PAYFAST_MODE ?? "sandbox";
export const PAYFAST_HOST = PAYFAST_MODE === "sandbox" ? "sandbox.payfast.co.za" : "www.payfast.co.za";

const CHECKOUT_FIELD_ORDER = [
  "merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url",
  "name_first", "name_last", "email_address", "cell_number",
  "m_payment_id", "amount", "item_name", "item_description",
  "custom_int1", "custom_int2", "custom_int3", "custom_int4", "custom_int5",
  "custom_str1", "custom_str2", "custom_str3", "custom_str4", "custom_str5",
  "email_confirmation", "confirmation_address",
  "payment_method",
  "subscription_type", "billing_date", "recurring_amount", "frequency", "cycles",
] as const;

function urlEncodePlus(value: string): string {
  // PayFast expects '+' for spaces (application/x-www-form-urlencoded
  // style), not %20 — encodeURIComponent gives %20, so convert.
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

export function generateSignature(data: Record<string, string>, passphrase?: string | null): string {
  const pairs: string[] = [];

  for (const key of CHECKOUT_FIELD_ORDER) {
    const val = data[key];
    if (val !== undefined && val !== null && val !== "") {
      pairs.push(`${key}=${urlEncodePlus(String(val))}`);
    }
  }

  let paramString = pairs.join("&");

  // Only append passphrase if one is actually set — never append an
  // empty passphrase param (a known cause of signature mismatch bugs).
  if (passphrase) {
    paramString += `&passphrase=${urlEncodePlus(passphrase)}`;
  }

  return crypto.createHash("md5").update(paramString).digest("hex");
}

