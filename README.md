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

Open http://localhost:3000. The app is connected to the dedicated
**performance-operations-dev** Supabase project via `.env.local` (never
committed). Access is invite-only; the initial platform-admin credentials
live in `.env.local` (`BOOTSTRAP_ADMIN_*` — change the password after first
sign-in via Forgot password).

Without Supabase configured, the app renders a setup-required screen. A
UI-only **offline preview** exists strictly for development and E2E: it
requires `NEXT_PUBLIC_DEV_OFFLINE_PREVIEW=true` *and* unset Supabase
variables — it can never activate alongside real environment values.

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
| `npm run test:e2e` | Playwright E2E — offline shell suite (:3100) then live suite (:3000), sequential because Next allows one dev server per directory |
| `npm run test:e2e:offline` / `:live` | Run one E2E suite |

## Documentation

Start with [docs/PROJECT_CHARTER.md](docs/PROJECT_CHARTER.md), then
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DATA_MODEL_DRAFT.md](docs/DATA_MODEL_DRAFT.md),
[docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md),
[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md),
[docs/INPUTS_REQUIRED.md](docs/INPUTS_REQUIRED.md),
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md),
[docs/CONFIGURATION_MODEL.md](docs/CONFIGURATION_MODEL.md),
[docs/COMPENSATION_MODEL.md](docs/COMPENSATION_MODEL.md),
[docs/PHASE_2_REPORT.md](docs/PHASE_2_REPORT.md),
[docs/IMPORT_ARCHITECTURE.md](docs/IMPORT_ARCHITECTURE.md),
[docs/SOURCE_ADAPTERS.md](docs/SOURCE_ADAPTERS.md),
[docs/APPOINTMENT_LEDGER.md](docs/APPOINTMENT_LEDGER.md),
[docs/IMPORT_SECURITY.md](docs/IMPORT_SECURITY.md),
[docs/PHASE_3_REPORT.md](docs/PHASE_3_REPORT.md), the Phase 4 payroll
docs (PAYROLL_*.md + [docs/PHASE_4_REPORT.md](docs/PHASE_4_REPORT.md)),
the Phase 5 intelligence docs
([docs/PERFORMANCE_INTELLIGENCE_ENGINE.md](docs/PERFORMANCE_INTELLIGENCE_ENGINE.md),
[docs/METRIC_CATALOG.md](docs/METRIC_CATALOG.md),
[docs/METRIC_DEFINITIONS.md](docs/METRIC_DEFINITIONS.md),
[docs/REPORTING_ARCHITECTURE.md](docs/REPORTING_ARCHITECTURE.md),
[docs/PHASE_5_REPORT.md](docs/PHASE_5_REPORT.md)), and the Phase 6
operations docs
([docs/EXECUTIVE_OPERATIONS_CENTER.md](docs/EXECUTIVE_OPERATIONS_CENTER.md),
[docs/DASHBOARD_ARCHITECTURE.md](docs/DASHBOARD_ARCHITECTURE.md),
[docs/WIDGET_SYSTEM.md](docs/WIDGET_SYSTEM.md),
[docs/NOTIFICATION_MODEL.md](docs/NOTIFICATION_MODEL.md),
[docs/SEARCH_ARCHITECTURE.md](docs/SEARCH_ARCHITECTURE.md),
[docs/COMMAND_PALETTE.md](docs/COMMAND_PALETTE.md),
[docs/PHASE_6_REPORT.md](docs/PHASE_6_REPORT.md)). Observed source-export
schemas live in [docs/schemas/](docs/schemas/); real business exports stay
in gitignored `business-inputs/` and are never committed.

## Operations Center (Phase 6)

`/overview` is the role-aware executive operations center; `Ctrl+K` opens
the permission-aware command palette and global search; the header bell
carries in-app notifications; `/reports` is the Report Center (quick
report, saved views, export history). Every number on every dashboard
comes from the Performance Intelligence Engine (Phase 5) — the UI
computes nothing.

## Imports (Phase 3)

Upload Setmore report CSVs (save the .xlsx report as CSV first) or any
CSV via column mapping at `/imports/new`. Files stage through review and
approval before transactional posting to the canonical `/appointments`
ledger; posted history is immutable, corrections and reversals are
audited, and originals are preserved as evidence. Acuity has no dedicated
adapter yet (no sample export) — use the mapping workflow meanwhile.

## Security & financial integrity

- Deny-by-default authorization at three layers (UI, server, database RLS).
- Client-provided organization IDs are never trusted.
- Money is integer cents; rates are basis points; no floating-point money.
- Posted payroll will be immutable; every governed change is audit-logged.
- Never put secrets in code, docs, or logs.
