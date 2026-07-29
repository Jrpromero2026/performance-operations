# Performance Operations

Internal payroll, revenue, KPI, and department analytics platform for gyms,
personal training departments, and sports-performance organizations.

**This repository is fully independent.** It must never connect to, reference,
or deploy over any other application, Supabase project, or Vercel project.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres,
Auth, RLS) · Zod · React Hook Form · TanStack Table · Recharts · Vitest ·
Playwright · npm

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase configured, the app runs in a
clearly labeled **offline preview** that mirrors the seed structure (no real
data, no authentication). This is fine for UI work and E2E tests.

## Supabase setup (dedicated project required)

1. Create a **brand-new** Supabase project used only by Performance
   Operations. Do not reuse an existing project.
2. Copy the environment template and fill in the values from
   *Project Settings → API*:

   ```bash
   cp .env.example .env.local
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is server-only and optional; leave it unset
   unless running admin scripts. Never commit `.env.local`.
3. Install the Supabase CLI and link the project (or run locally):

   ```bash
   npx supabase link --project-ref <your-new-project-ref>
   npx supabase db push          # applies supabase/migrations
   ```

   For a fully local stack instead: `npx supabase start` then
   `npx supabase db reset` (applies migrations + `supabase/seed.sql`).
4. Apply seed data to a hosted project by running `supabase/seed.sql` in the
   SQL editor (idempotent; contains organizations, departments, roles, and
   permissions only — no financial data).
5. Regenerate database types after schema changes:

   ```bash
   npx supabase gen types typescript --local > src/lib/supabase/types.ts
   ```

Authentication flows (sign-in, invites) arrive in Phase 2; until a user is
signed in, the app stays in offline preview even with Supabase configured.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E (needs `npx playwright install` once) |

## Documentation

Start with [docs/PROJECT_CHARTER.md](docs/PROJECT_CHARTER.md), then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DATA_MODEL_DRAFT.md](docs/DATA_MODEL_DRAFT.md),
[docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md),
[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md), and
[docs/INPUTS_REQUIRED.md](docs/INPUTS_REQUIRED.md).

## Security & financial integrity

- Deny-by-default authorization at three layers (UI, server, database RLS).
- Client-provided organization IDs are never trusted.
- Money is integer cents; rates are basis points; no floating-point money.
- Posted payroll will be immutable; every governed change is audit-logged.
- Never put secrets in code, docs, or logs.
