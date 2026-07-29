# Performance Operations — Implementation Roadmap

## Phase 1 — Foundation ✅ (complete)

- Next.js application shell: sidebar, header, workspace selector, user menu,
  mobile navigation, loading/empty/error states
- Route skeleton: /overview, /imports, /appointments, /revenue, /payroll,
  /trainers, /clients, /reports, /configuration, /audit
- Design token system (charcoal navigation, light data surfaces, G3 red
  accent)
- Database migrations for the 14 foundation tables + deny-by-default RLS
- Seed data: organizations, departments, roles, permissions
- Workspace resolver with server-validated persistence
- Overview page with real organization/department data and clearly labeled
  "waiting for imported data" KPI placeholders
- Unit tests (workspace, authz, money, date ranges) and Playwright shell
  coverage
- Documentation set and environment setup

## Phase 2 — Configuration ✅ (complete except noted)

- ✅ Live dedicated Supabase dev project; migrations + seed applied; live RLS verified
- ✅ Supabase Auth flows (invite-based onboarding, sign in/out, password reset)
- ✅ Member management (roles, department scoping, deactivation, escalation guards)
- ✅ Trainer registry and organization/department assignments (effective-dated)
- ✅ Service catalog, department mapping, and source aliases
- ✅ Reporting-period management + functional header period selector
- ✅ Compensation plans/versions/tiers/rules + trainer assignments (config only)
- ✅ Configuration hub with per-org readiness; real audit viewer; live overview
- ⏳ Organization/location management UI (deferred; orgs seeded, platform-admin SQL/managed)
- ⏳ Client registry (deferred to Import Center phase, where clients first matter)

## Phase 3 — Import Center ✅ (complete except noted)

- ✅ CSV upload with private evidence storage, sha256, immutable raw rows
- ✅ Setmore adapter from real observed exports; generic mapping adapter with
  versioned schema profiles; strict normalization (nothing coerced)
- ✅ Trainer/client/service matching with alias learning + review candidates
- ✅ Resolution queues (blocking/warnings/trainers/services/clients/statuses/
  duplicates) with audited, bulk-capable resolutions
- ✅ Approval (auto-revoked on change) + transactional posting to the
  canonical appointments ledger + controlled reversal with preserved history
- ✅ Duplicate/overlap detection across batches (series-aware occurrence keys)
- ✅ Full audit trail of import decisions
- ⏳ Acuity adapter BLOCKED pending a sample export (generic mapping is the
  interim path); native .xlsx ingestion deferred (save-as-CSV documented)

## Phase 4 — Payroll Engine

- Compensation plans + immutable versions (session rates, commission tiers,
  hourly, salary components) in integer cents/basis points
- Effective-dated trainer compensation assignments
- Payroll runs per organization + reporting period
- Calculation engine with per-line traces; state machine
  Draft → In Review → Approved → Posted → Locked (+ audited Reopen)
- Adjustments with reasons and approvals
- Input snapshotting for historical integrity

## Phase 5 — Analytics

- KPI computation from posted data: revenue, payroll, sessions, active
  clients, revenue per session, payroll percentage
- Department dashboards and period-over-period comparisons
- Trainer scorecards (sessions, retention, utilization, revenue)
- Workspace-level rollups for All Workspaces users

## Phase 6 — Reports

- Payroll register and payroll statement exports (CSV/PDF)
- Department KPI reports and trainer scorecard exports
- Period close-out package
- Saved report definitions and history

## Phase 7 — Integrations

- Direct Setmore/Acuity API sync (replacing manual CSV where possible)
- Accounting/payroll-provider export formats
- Scheduled report delivery (email)

## Phase 8 — Production Hardening

- RLS test suite expansion and security review
- Performance passes (indexes, query plans, caching of posted aggregates)
- Backup/restore and disaster-recovery runbooks
- Observability (structured logs, error tracking, uptime monitoring)
- Rate limiting and abuse protection
- Accessibility audit and mobile polish
- Deployment pipeline with preview environments (dedicated Vercel project;
  never shared with any other application)
