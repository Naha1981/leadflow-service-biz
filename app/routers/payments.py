import logging

import httpx
from fastapi import APIRouter, Request, Header
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import (
    PAYFAST_MERCHANT_ID,
    PAYFAST_MERCHANT_KEY,
    PAYFAST_PASSPHRASE,
    PAYFAST_MODE,
    PUBLIC_BASE_URL,
    ADMIN_API_KEY,
)
from app.services import db as db_service
from app.services.payfast import generate_signature, PAYFAST_HOST

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/payments/payfast", tags=["payfast"])


def _check_admin(x_admin_key: str | None):
    if x_admin_key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


class CreateOrder(BaseModel):
    tenant_id: str
    lead_id: str | None = None
    amount: float
    description: str
    business_name: str = ""


@router.post("/orders")
def create_order(payload: CreateOrder, x_admin_key: str = Header(default=None)):
    _check_admin(x_admin_key)
    db = db_service.get_db()
    result = db.table("orders").insert({
        "tenant_id": payload.tenant_id,
        "lead_id": payload.lead_id,
        "amount": payload.amount,
        "description": payload.description,
        "business_name": payload.business_name,
    }).execute()
    return {"order": result.data[0]}


@router.get("/checkout/{order_id}")
def checkout(order_id: str):
    db = db_service.get_db()

    order = (
        db.table("orders")
        .select("*")
        .eq("id", order_id)
        .single()
        .execute()
        .data
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    data = {
        "merchant_id": PAYFAST_MERCHANT_ID,
        "merchant_key": PAYFAST_MERCHANT_KEY,
        "return_url": f"{PUBLIC_BASE_URL}/payments/payfast/success",
        "cancel_url": f"{PUBLIC_BASE_URL}/payments/payfast/cancel",
        "notify_url": f"{PUBLIC_BASE_URL}/payments/payfast/itn",
        "m_payment_id": order_id,
        "amount": f"{order['amount']:.2f}",
        "item_name": order["description"],
        "item_description": order.get("item_description", ""),
        "custom_int1": str(order.get("tenant_id", "")),
        "custom_str1": order.get("business_name", ""),
    }
    signature = generate_signature(data, PAYFAST_PASSPHRASE if PAYFAST_PASSPHRASE else None)
    data["signature"] = signature

    inputs = "".join(f'<input type="hidden" name="{k}" value="{v}">' for k, v in data.items())
    html = f"""
    <html>
      <body onload="document.getElementById('pf').submit();">
        <form id="pf" action="https://{PAYFAST_HOST}/eng/process" method="post">
            {inputs}
        </form>
      </body>
    </html>
    """
    return HTMLResponse(html)


@router.post("/itn")
async def payfast_itn(request: Request):
    form = await request.form()
    data = dict(form)

    received_sig = data.pop("signature", None)
    expected_sig = generate_signature(data, PAYFAST_PASSPHRASE if PAYFAST_PASSPHRASE else None)
    if received_sig != expected_sig:
        logger.warning("PayFast ITN rejected: signature mismatch")
        return JSONResponse({"status": "rejected", "reason": "signature mismatch"}, status_code=400)

    order_id = data.get("m_payment_id")
    amount_gross = data.get("amount_gross")

    db = db_service.get_db()
    order = (
        db.table("orders")
        .select("*")
        .eq("id", order_id)
        .single()
        .execute()
        .data
    )
    if not order:
        logger.warning(f"PayFast ITN rejected: order {order_id} not found")
        return JSONResponse({"status": "rejected", "reason": "order not found"}, status_code=404)

    if abs(float(amount_gross or 0) - order["amount"]) > 0.01:
        logger.warning(f"PayFast ITN rejected: amount mismatch for {order_id}")
        return JSONResponse({"status": "rejected", "reason": "amount mismatch"}, status_code=400)

    validate_host = "sandbox.payfast.co.za" if PAYFAST_MODE == "sandbox" else "www.payfast.co.za"
    async with httpx.AsyncClient() as client:
        confirm = await client.post(
            f"https://{validate_host}/eng/query/validate",
            data=form,
            timeout=15,
        )
    if confirm.text.strip() != "VALID":
        logger.warning(f"PayFast ITN rejected: not confirmed by PayFast for {order_id}")
        return JSONResponse({"status": "rejected", "reason": "not confirmed by PayFast"}, status_code=400)

    db.table("orders").update({
        "status": "paid",
        "pf_payment_id": data.get("pf_payment_id"),
        "payment_data": dict(data),
    }).eq("id", order_id).execute()

    logger.info(f"PayFast ITN accepted: order {order_id} marked paid")
    return {"status": "ok"}


@router.get("/success")
def payfast_success():
    return {"status": "success", "message": "Payment completed. You may close this tab."}


@router.get("/cancel")
def payfast_cancel():
    return {"status": "cancelled", "message": "Payment was cancelled."}
