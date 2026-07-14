"""
Thin wrapper around Evolution API so the rest of the app never touches
raw HTTP calls. Each tenant = one Evolution "instance".
"""
import requests
from app.config import EVO_BASE_URL, EVO_GLOBAL_API_KEY, PUBLIC_BASE_URL

HEADERS = {"apikey": EVO_GLOBAL_API_KEY, "Content-Type": "application/json"}


def create_instance(instance_name: str) -> dict:
    """Create a new Evolution instance for a new tenant. Returns QR/pairing info."""
    url = f"{EVO_BASE_URL}/instance/create"
    payload = {
        "instanceName": instance_name,
        "qrcode": True,
        "integration": "WHATSAPP-BAILEYS",
    }
    r = requests.post(url, json=payload, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def set_webhook(instance_name: str) -> dict:
    """Point this tenant's instance at our shared webhook endpoint."""
    url = f"{EVO_BASE_URL}/webhook/set/{instance_name}"
    payload = {
        "url": f"{PUBLIC_BASE_URL}/webhook/evolution/{instance_name}",
        "webhook_by_events": True,
        "webhook_base64": False,
        "events": ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"],
    }
    r = requests.post(url, json=payload, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def get_qr(instance_name: str) -> dict:
    """Fetch the QR code so the business owner can pair their WhatsApp number."""
    url = f"{EVO_BASE_URL}/instance/connect/{instance_name}"
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def send_text(instance_name: str, number: str, text: str) -> dict:
    url = f"{EVO_BASE_URL}/message/sendText/{instance_name}"
    payload = {"number": number, "textMessage": {"text": text}}
    r = requests.post(url, json=payload, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()


def instance_status(instance_name: str) -> dict:
    url = f"{EVO_BASE_URL}/instance/connectionState/{instance_name}"
    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()
    return r.json()
