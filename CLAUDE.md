# Instructions for AI assistants working on this repo

**Read this before writing, running, or suggesting any code changes.**
This file is the source of truth for how to work on this repository —
`.github/copilot-instructions.md` and `AGENTS.md` both point back here.

---

## What this repo actually is

**LeadFlow** — a multi-tenant WhatsApp automation SaaS for South African
service businesses (plumbers, electricians, salons, cleaners). One shared
backend serves many client businesses ("tenants"), each with their own
WhatsApp number via a dedicated Evolution API instance.

## Branch state — READ THIS FIRST

- **`nextjs-rewrite`** — the ACTIVE, CURRENT direction. Next.js App
  Router + TypeScript + Drizzle ORM + Neon Postgres. This is what you
  should be working on and building against.
- **`master`** — an OLDER, ABANDONED FastAPI + Supabase implementation.
  It has more battle-tested logic in places (it was built and iterated on
  before the Next.js rewrite), but the project has moved off this stack
  entirely. **Do not build on `master`. Do not merge `master` into
  `nextjs-rewrite`.** If you need to reference how a piece of logic
  worked in the old version, look but don't copy-paste Python patterns
  into TypeScript uncritically — several things were deliberately
  changed during the port (see "Deliberate corrections" below).

If you're not sure which branch you're on: `git branch --show-current`.
It should say `nextjs-rewrite` for any new work.

## CRITICAL: this codebase has never been built or run

No `npm install`, `npx tsc --noEmit`, or `npm run build` has been executed
against this code yet. It was written against the documented Next.js 15 /
Drizzle / Neon APIs, but is **unverified by actual execution**.

**Your first task, before any feature work**, is:
```bash
npm install
npx tsc --noEmit
npm run build
```
Fix only what's broken by these commands — likely small things like
Next.js 15's async `params` API in route handlers, or minor type
mismatches. Do **not** use a compile error as a reason to restructure,
rewrite, or "improve" working logic you don't fully understand yet. Fix
the specific error, verify the fix, move on.

## Absolute rules — do not do these things

1. **Do not scaffold a new Next.js project over this one.** Don't run
   `create-next-app` or any generator that would overwrite existing
   files. This project's structure is intentional (see below).
2. **Do not add new frameworks, ORMs, or major libraries** without being
   asked. The stack is fixed: Next.js App Router, Drizzle, Neon,
   Tailwind, Zod. No Prisma, no tRPC, no separate Express/Fastify
   backend, no switching Neon for another Postgres host, unless
   explicitly instructed.
3. **Do not touch `master`.** Don't merge it, don't cherry-pick from it
   without flagging what you're doing and why, don't push to it.
4. **Do not remove or "simplify" these three things** — they're
   deliberate corrections made during the FastAPI→Next.js port, not
   accidental complexity:
   - **DB-backed debounce** (`modules/messages/service.ts`,
     `secondsSinceLastOutbound`) — NOT an in-memory cache/dict. Vercel
     serverless functions don't share memory between invocations; an
     in-memory debounce would silently fail in production. If you think
     you should "optimize" this to an in-memory Map for speed, don't.
   - **Persistent opt-out** (`leads.optedOut` column, checked on every
     inbound webhook message) — this must stay checked before any reply
     logic runs, on every message, not just the message containing the
     opt-out keyword.
   - **Three-tier reply resolution** (`modules/messages/replies.ts`,
     `resolveReply()`) — tenant override → niche default → global
     default, in that order. Don't collapse this to a single flat
     lookup.
5. **Do not commit secrets.** `.env` is gitignored — keep it that way.
   Only `.env.example` (with placeholder values) belongs in git.
6. **Do not invent your own architecture opinions mid-task.** If you
   think something should be restructured, say so and ask, don't just do
   it while fixing an unrelated bug.

## Architecture — how this repo is organized

Modular by business domain, not by technical layer:

```
src/
  app/
    dashboard/                       # Admin UI (Server Components)
    api/
      v1/tenants/                     # Onboarding, QR, leads, orders, reply templates
      webhooks/evolution/             # Shared inbound WhatsApp webhook (ALL tenants route through here)
      payments/payfast/               # checkout, itn, success, cancel
  modules/                            # Business logic lives here, NOT in route handlers
    tenants/    leads/    messages/    payments/
  lib/
    integrations/evolution/           # The ONLY place Evolution API is called from
    integrations/payfast/             # The ONLY place PayFast is called from
    db/                               # Drizzle schema (single source of truth) + client
    events/                           # Domain event log — audit trail + webhook idempotency
    business-hours.ts
```

**Route handlers stay thin**: authenticate → validate (Zod) → call a
service function → return a typed response. Business logic belongs in
`modules/*/service.ts`, not in `app/api/**/route.ts`.

**Every external system goes through exactly one client**: Evolution API
calls only happen in `lib/integrations/evolution/client.ts`. PayFast calls
only happen in `lib/integrations/payfast/client.ts`. Never add a raw
`fetch()` call to either service anywhere else in the codebase.

## Required environment variables

See `.env.example` for the full list. In short: `DATABASE_URL` (Neon),
`EVO_BASE_URL` / `EVO_GLOBAL_API_KEY` (Evolution), `PUBLIC_BASE_URL`,
`ADMIN_API_KEY`, `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` /
`PAYFAST_PASSPHRASE` / `PAYFAST_MODE`.

## Known, intentional gaps (not bugs — don't "fix" silently)

- **PayFast ITN source-IP verification is not implemented.** Signature,
  amount, and server-to-server confirmation checks are all done. IP
  allowlisting against PayFast's published ranges isn't. If you add
  this, don't remove the other three checks while you're in there.
- **No dashboard UI yet** for reply-template editing, business-hours
  configuration, lead detail/message thread, or orders — all exist as
  API endpoints (`/api/v1/tenants/{id}/reply-templates`, etc.) with no
  frontend. This is arguably the highest-value next build.
- **Sesotho/Zulu keyword coverage is greeting-only.** Booking/quote/
  pricing classification is English-only. A real, known limitation, not
  an oversight to "clean up" by deleting the partial coverage.
- **Auth is a single shared admin key** (`ADMIN_API_KEY` header), not per-
  user login. This is intentional for a single-operator MVP — don't
  swap in a full auth system unless asked.

## When adding a new feature

Follow the existing pattern: Zod schema in `modules/<domain>/schema.ts` →
service function in `modules/<domain>/service.ts` → thin route handler in
`app/api/...`. Add or update the module's `README.md` if one exists for
that domain. Match existing naming and error-response shape
(`{ error: { code, message, details? } }`).

## Verification checklist before considering any change "done"

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] The specific thing that was asked for is present — not a superset,
      not a subset
- [ ] Nothing in the "absolute rules" list above was violated
- [ ] Anything explicitly deferred is *stated* as deferred, not silently
      dropped
