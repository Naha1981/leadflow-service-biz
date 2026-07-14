import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

EVO_BASE_URL = os.getenv("EVO_BASE_URL", "http://localhost:8080")
EVO_GLOBAL_API_KEY = os.getenv("EVO_GLOBAL_API_KEY", "")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://yourdomain.com")

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "change-me")

PAYFAST_MERCHANT_ID = os.getenv("PAYFAST_MERCHANT_ID", "")
PAYFAST_MERCHANT_KEY = os.getenv("PAYFAST_MERCHANT_KEY", "")
PAYFAST_PASSPHRASE = os.getenv("PAYFAST_PASSPHRASE", "")
PAYFAST_MODE = os.getenv("PAYFAST_MODE", "sandbox")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
