# LeadFlow (Next.js rewrite) — v2, feature parity with FastAPI

> **AI assistants (Copilot, Claude Code, Cursor, etc.) working in this
> repo: read `CLAUDE.md` at the repo root before making any changes.** It
> has the branch state, what's verified vs. not, and hard rules about
> what not to touch.

This version ports everything that was built in the FastAPI/Supabase
version: niche-specific replies, per-tenant reply template overrides,
business hours awareness, opt-out handling, media message acknowledgment,
debounce, lead reopening, lead detail views, and full PayFast payments.

**One deliberate architectural correction during the port**: the FastAPI
debounce logic used an in-memory Python dict, which does not work
correctly in a serverless environment — Vercel functions don't share
memory between invocations, and a cold-started instance would have no
knowledge of a message that arrived 3 seconds ago on a different instance.
Debounce here is implemented against the database instead (checking the
timestamp of the last outbound message for a lead), which is correct
regardless of how many function instances are running.

**One deliberate improvement beyond parity**: opt-out is now persistent.
The FastAPI version only suppressed the reply to the STOP message itself;
nothing stopped future auto-replies to that number. Here, `leads.optedOut`
is checked on every inbound message before any reply logic runs.

**One known gap carried over unchanged**: PayFast ITN source-IP
verification is still not implemented (signature, amount, and
server-to-server confirmation are all done — IP allowlisting isn't).

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
    dashboard/                       # Admin UI (Server Components)
    api/
      v1/tenants/                     # Onboarding, QR, leads, orders, reply templates
        [id]/leads/[leadId]/          #   detail view + status update
        [id]/reply-templates/         #   list/upsert + seed defaults
        [id]/orders/                  #   create PayFast orders
      webhooks/evolution/             # Shared inbound WhatsApp webhook
      payments/payfast/               # checkout, itn, success, cancel
  modules/
    tenants/                          # Onboarding, reply templates, business hours
    leads/                            # Lead tracking, opt-out, reopening
    messages/                         # Intent classification, reply resolution, logging
    payments/                         # Order creation, ITN verification
  lib/
    integrations/evolution/           # The ONLY place Evolution API is called
    integrations/payfast/             # The ONLY place PayFast is called
    db/                               # Drizzle schema + client
    events/                           # Domain event log (audit + idempotency)
    business-hours.ts                 # After-hours check, handles overnight ranges
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

Seed niche-appropriate reply templates (do this for every new tenant —
otherwise they start on generic global replies):
```bash
curl -X POST http://localhost:3000/api/v1/tenants/{id}/reply-templates/seed \
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

This applies to the newly-ported code too (payments module, reply
templates, business hours, opt-out) — none of it has been compiled or
executed, same caveat as the original rewrite.

## Deliberately deferred (per the standard's own "escalate only when
proven necessary" principle — see §11)

- Better Auth / real tenant login — single shared admin key is enough
  while you're the only operator
- AI-based intent classification — keyword matching first, swap later
- Full Sesotho/multi-language keyword coverage (greetings only — the same
  gap the FastAPI version had)
- Quote PDF generation
- PayFast ITN source-IP verification
- Dashboard UI for reply templates, business hours, lead detail/message
  thread, and orders — all exist as API endpoints, none have a UI yet
  (same gap the FastAPI version had — arguably the highest-leverage next
  build, since the backend logic is now ahead of what you can see/use)
- Queues/workers for background processing — nothing here is slow enough
  yet to need it

## Migrating off the old FastAPI version

The Supabase schema (`tenants`, `leads`, `messages`, `quotes`) maps almost
1:1 to the new Drizzle schema, plus one addition: an `events` table for
the idempotency/audit-log pattern the new standard requires. If you have
existing data in Supabase, it can be exported and imported into Neon —
ask if you want a migration script for that specifically.
