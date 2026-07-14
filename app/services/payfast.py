import hashlib
from urllib.parse import quote_plus

from app.config import PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE, PAYFAST_MODE, PUBLIC_BASE_URL

CHECKOUT_FIELD_ORDER = [
    "merchant_id",
    "merchant_key",
    "return_url",
    "cancel_url",
    "notify_url",
    "name_first",
    "name_last",
    "email_address",
    "cell_number",
    "m_payment_id",
    "amount",
    "item_name",
    "item_description",
    "custom_int1",
    "custom_int2",
    "custom_int3",
    "custom_int4",
    "custom_int5",
    "custom_str1",
    "custom_str2",
    "custom_str3",
    "custom_str4",
    "custom_str5",
    "email_confirmation",
    "confirmation_address",
    "payment_method",
    "subscription_type",
    "billing_date",
    "recurring_amount",
    "frequency",
    "cycles",
]

PAYFAST_HOST = "sandbox.payfast.co.za" if PAYFAST_MODE == "sandbox" else "www.payfast.co.za"


def generate_signature(data: dict, passphrase: str | None = None) -> str:
    pairs = []
    for key in CHECKOUT_FIELD_ORDER:
        val = data.get(key)
        if val not in (None, ""):
            pairs.append(f"{key}={quote_plus(str(val).strip())}")

    param_string = "&".join(pairs)

    if passphrase:
        param_string += f"&passphrase={quote_plus(passphrase.strip())}"

    return hashlib.md5(param_string.encode()).hexdigest()


def build_checkout_data(
    order_id: str,
    amount: float,
    item_name: str,
    item_description: str = "",
    custom_int1: str = "",
    custom_str1: str = "",
) -> dict:
    data = {
        "merchant_id": PAYFAST_MERCHANT_ID,
        "merchant_key": PAYFAST_MERCHANT_KEY,
        "return_url": f"{PUBLIC_BASE_URL}/payments/payfast/success",
        "cancel_url": f"{PUBLIC_BASE_URL}/payments/payfast/cancel",
        "notify_url": f"{PUBLIC_BASE_URL}/payments/payfast/itn",
        "m_payment_id": order_id,
        "amount": f"{amount:.2f}",
        "item_name": item_name,
        "item_description": item_description,
        "custom_int1": custom_int1,
        "custom_str1": custom_str1,
    }
    signature = generate_signature(data, PAYFAST_PASSPHRASE if PAYFAST_PASSPHRASE else None)
    data["signature"] = signature
    return data
