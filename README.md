# LeadFlow — WhatsApp Lead-to-Quote SaaS

One backend, unlimited tenants. Each client business gets their own WhatsApp
number (via their own Evolution instance) but shares your FastAPI + Supabase
infrastructure. This is what makes it a SaaS instead of N separate client deploys.

## How it works

1. You onboard a business → `POST /tenants` creates a Supabase row + spins up
   a dedicated Evolution instance + points its webhook at your one shared
   `/webhook/evolution/{instance_name}` endpoint.
2. Business owner scans a QR code (`GET /tenants/{id}/qr`) to link their
   WhatsApp number to that instance.
3. Every inbound WhatsApp message hits your single webhook. The instance
   name in the URL tells you which tenant it belongs to — so you look up
   the tenant, classify intent, log the lead, and reply — all in one shared
   codebase.
4. You (or the business) view leads in `dashboard/admin.html` — no build
   step, just open the file and point it at your deployed backend.

## Setup

```bash
cd leadflow
pip install -r requirements.txt --break-system-packages
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, EVO_BASE_URL, EVO_GLOBAL_API_KEY, ADMIN_API_KEY
```

Run the Supabase schema once against your project:
```bash
# paste supabase_schema.sql into the Supabase SQL editor and run it
```

Start the backend:
```bash
uvicorn app.main:app --reload --port 8000
```

Open `dashboard/admin.html` directly in a browser (no server needed),
point the "Backend URL" field at your running instance, paste your admin key.

## Onboarding a new paying client (your actual sales workflow)

```bash
curl -X POST https://yourdomain.com/tenants \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name": "Alpha Plumbing",
    "niche": "plumber",
    "owner_name": "Thabo",
    "owner_phone": "27821234567",
    "monthly_fee": 700
  }'
```

Response includes the tenant id. Then:

```bash
curl https://yourdomain.com/tenants/{tenant_id}/qr \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

Show that QR to the business owner, they scan it in WhatsApp Linked Devices,
and their bot is live. Total time: under 10 minutes per client.

## What's rule-based today, and the upgrade path

- **Intent classification** (`app/services/intent.py`): keyword matching now.
  Swap to a Claude API call later (prompt sketch is in the file's docstring)
  once volume justifies the extra latency/cost — signature stays identical
  so nothing else changes.
- **Quotes**: not yet automated — `quotes` table exists in the schema, but
  PDF generation + payment links (PayFast/SnapScan) are the next build,
  not in this MVP.
- **Auth**: admin endpoints are protected by a single shared `ADMIN_API_KEY`
  header — fine for you operating this solo. A tenant-facing login (Supabase
  JWT with `tenant_id` claim) is scaffolded in the RLS policies but not wired
  up to an actual login flow yet.
- **Hosting**: designed for Replit/any small VM — no GPU or heavy compute
  needed, matches your CPU-only constraint.

## Pricing you're already using

Setup: R2,000–R5,000 once. Monthly: R700–R1,500. That's tracked per-tenant
in the `monthly_fee` column so you can eventually build a billing report.

## Folder structure

```
leadflow/
├── app/
│   ├── main.py              # FastAPI entrypoint
│   ├── config.py            # env vars
│   ├── routers/
│   │   ├── tenants.py       # onboarding, QR, admin views
│   │   └── webhook.py       # the actual bot logic
│   └── services/
│       ├── db.py            # Supabase client
│       ├── evolution.py     # Evolution API wrapper
│       └── intent.py        # keyword classifier (upgrade path: Claude API)
├── dashboard/
│   └── admin.html           # standalone, no-build dashboard
├── supabase_schema.sql
├── requirements.txt
├── .env.example
└── README.md
```
