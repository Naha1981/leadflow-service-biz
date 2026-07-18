# GitHub Copilot instructions for this repo

**Full details: read `CLAUDE.md` at the repo root before making changes.**
This file is a condensed version for Copilot specifically — if anything
here conflicts with `CLAUDE.md`, `CLAUDE.md` wins.

## Fast facts

- Active branch: `nextjs-rewrite`. `master` is an abandoned FastAPI/
  Supabase version — do not build on it, do not merge it in.
- Stack is fixed: Next.js App Router, TypeScript, Drizzle ORM, Neon
  Postgres, Zod, Tailwind. Do not introduce new frameworks/ORMs.
- **This code has never been built.** First step on any session: run
  `npm install && npx tsc --noEmit && npm run build`, fix only what
  breaks, don't restructure working logic to "fix" a compile error.

## Do not touch these without understanding why they're built this way

- `secondsSinceLastOutbound()` in `modules/messages/service.ts` — DB-based
  debounce, not in-memory. Serverless functions don't share memory
  between invocations; an in-memory version would silently break in
  production.
- `leads.optedOut` check in the webhook route — must run on every inbound
  message, not just the one containing "STOP".
- `resolveReply()` in `modules/messages/replies.ts` — three-tier fallback
  (tenant override → niche default → global default). Keep the order.

## Architecture

Thin route handlers (`app/api/**/route.ts`) → rich services
(`modules/*/service.ts`) → single typed client per external integration
(`lib/integrations/*/client.ts`). Business logic never lives in a route
handler. See `CLAUDE.md` for the full folder map and known gaps list.

## Never

- Commit `.env` (it's gitignored — keep it that way)
- Push to or merge `master`
- Add a new backend framework or database alongside the existing one
- Silently "fix" a documented gap (e.g. missing PayFast IP verification)
  by removing the other working checks around it — add to it, don't
  simplify it away
