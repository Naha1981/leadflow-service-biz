# LeadFlow (Next.js rewrite)

Rebuilt per the AI-Native Enterprise Full-Stack Architecture Standard v4.1:
one repo, one deployment, one backend (Next.js Route Handlers), one database
(Neon Postgres via Drizzle), modular by business domain, thin route handlers,
rich services, webhook-first integrations, event log for audit + idempotency.

This replaces the previous FastAPI + Supabase version — same product, same
Evolution API integration, different stack.

## Structure

```
src/
  app/
    dashboard/              # Admin UI (Server Components)
    api/
      v1/tenants/            # Tenant onboarding + management
      webhooks/evolution/    # Shared inbound WhatsApp webhook
  modules/
    tenants/                 # Business logic: onboarding, lookup
    leads/                   # Business logic: lead tracking
    messages/                 # Intent classification, message logging
  lib/
    integrations/evolution/  # The ONLY place Evolution API is called
    db/                       # Drizzle schema + client
    events/                   # Domain event log (audit + idempotency)
```

## Setup

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL (Neon), EVO_BASE_URL, EVO_GLOBAL_API_KEY,
# PUBLIC_BASE_URL, ADMIN_API_KEY
```

Push the schema to your Neon database:
```bash
npm run db:generate
npm run db:migrate
```

Run locally:
```bash
npm run dev
```

Dashboard: `http://localhost:3000/dashboard`

## Onboarding a tenant

```bash
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"businessName": "Alpha Plumbing", "niche": "plumber", "monthlyFee": 700}'
```

Then fetch the QR to pair WhatsApp:
```bash
curl http://localhost:3000/api/v1/tenants/{id}/qr \
  -H "x-admin-key: YOUR_ADMIN_KEY"
```

## What's verified vs. what isn't (read this before deploying)

**Not yet run in this environment**: `npm install`, `npm run build`, or a
live Neon/Evolution connection — this sandbox doesn't have Node package
installation set up for a full Next.js build, so I wrote this against the
documented Next.js 15 / Drizzle / Neon APIs rather than a compiled,
executed build. Before you trust this in production:

```bash
npm install
npx tsc --noEmit        # confirms TypeScript compiles cleanly
npm run build            # confirms Next.js build succeeds
```

Run these and paste me any errors — TypeScript/Next.js version drift
(especially Next 15's async `params` API, used throughout the route
handlers here) is the most likely source of small compile errors to fix.

## Deliberately deferred (per the standard's own "escalate only when
proven necessary" principle — see §11)

- Better Auth / real tenant login — single shared admin key is enough
  while you're the only operator
- AI-based intent classification — keyword matching first, swap later
- Niche-specific reply templates — global replies for now
- Media message handling, debounce, POPIA opt-out — see messages module
  README for the full list
- Queues/workers for background processing — nothing here is slow enough
  yet to need it

## Migrating off the old FastAPI version

The Supabase schema (`tenants`, `leads`, `messages`, `quotes`) maps almost
1:1 to the new Drizzle schema, plus one addition: an `events` table for
the idempotency/audit-log pattern the new standard requires. If you have
existing data in Supabase, it can be exported and imported into Neon —
ask if you want a migration script for that specifically.
