# Agent instructions for this repo

**Read `CLAUDE.md` at the repo root first — it's the canonical, detailed
version of everything below.** This file exists because some tools look
for `AGENTS.md` specifically rather than `CLAUDE.md`.

## The five things that matter most

1. **Active branch is `nextjs-rewrite`.** `master` is an abandoned
   FastAPI/Supabase version — don't build on it or merge it in.
2. **This code has never been built or run.** Before any feature work:
   `npm install && npx tsc --noEmit && npm run build`. Fix only what
   breaks those commands.
3. **Stack is fixed**: Next.js App Router, TypeScript, Drizzle, Neon,
   Zod, Tailwind. Don't add new frameworks or swap the database.
4. **Three deliberate design choices, not accidental complexity** — don't
   simplify these away: DB-backed debounce (not in-memory — serverless
   has no shared memory between invocations), persistent opt-out checked
   on every message, and the three-tier reply resolution order (tenant →
   niche → global).
5. **Business logic lives in `modules/*/service.ts`, not in route
   handlers.** Every external API call goes through exactly one client
   file in `lib/integrations/`.

Full architecture map, environment variables, and known gaps: see
`CLAUDE.md`.
