from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.config import CORS_ORIGINS
from app.routers import tenants, webhook, payments

logger = logging.getLogger("uvicorn")

app = FastAPI(title="LeadFlow — WhatsApp Lead-to-Quote SaaS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tenants.router)
app.include_router(webhook.router)
app.include_router(payments.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
async def on_startup():
    logger.info("LeadFlow backend started")
