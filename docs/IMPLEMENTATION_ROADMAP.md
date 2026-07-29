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

## Phase 4 — Payroll Engine ✅ (complete; official org rules evidence-blocked)

- ✅ Deterministic calc-v1 engine (typed evaluators, traces, fail-closed)
- ✅ DB-enforced run state machine, posting snapshots + sha256, reopen/
  supersede/void, dependency guards on appointments + import reversal
- ✅ Manual time + adjustments with separation of duties
- ✅ Statements, department summaries, CSV exports (masked client refs)
- ⏳ Official Timberhill/G3 plan seeding BLOCKED on owner confirmations
  (docs/business-rules/payroll-rule-gaps.md)

## Phase 5 — Performance Intelligence Engine ✅ (complete)

- ✅ 60-metric catalog (intel-v1), one formula each, health states
- ✅ Reporting service (metrics/breakdowns/trends/summaries), permission
  narrowing (org/department/self), RLS-backed datasets
- ✅ Trend engine + deterministic executive summaries; /reports surface
- ⏳ Eligible/recognized revenue + capacity utilization awaiting business
  definitions/config

## Phase 6 — Executive Operations Center ✅ (complete)

- ✅ Premium shell: command palette + global search (Ctrl+K), notification
  center (in-app), collapsible sidebar, role-aware executive overview
- ✅ Widget framework (engine-consuming, health-aware, no UI math)
- ✅ Operational alerts from engine readiness + pipeline states
- ✅ Report Center (quick report, saved views, export history + CSV),
  department/trainer overviews
- ✅ Saved-view sharing + scheduled reports (delivered in Phase 7)

## Phase 7 — Period Close, Report Packages, Export Automation ✅ (complete)

- ✅ Close readiness checklist (~29 checks) consuming existing engines
  only; missing information never passes; deep links + acknowledgements
- ✅ DB-enforced close lifecycle (close_review → ready_to_close →
  closing → closed; reopen → superseded + versioned new cycle; void)
- ✅ Separation of duties failing closed (org policy can allow
  self-approval); atomic close RPC with full re-validation
- ✅ Immutable hashed close manifest (references + hashes, no PII)
- ✅ Versioned, hash-frozen report packages (executive, department,
  payroll, trainer statements, import reconciliation)
- ✅ Accounting CSV exports (injection-protected, deterministic,
  integer cents + USD) with regenerate-and-verify downloads (no bucket)
- ✅ Post-close change guards on appointments/payroll/time/adjustments/
  periods with reopen deep links
- ✅ Saved-view sharing (personal/organization/department) + defaults
  with period auto-apply; scheduled-report DEFINITIONS (execution
  constrained off at the DB)
- ⏳ Accounting column mapping, mandatory-artifact policy, retention
  windows, and revenue definitions await business decisions
  (docs/DECISION_LOG.md, docs/INPUTS_REQUIRED.md)

## Phase 8 — Integrations

- Direct Setmore/Acuity API sync (replacing manual CSV where possible)
- Accounting/payroll-provider export formats (column mapping confirmed)
- Scheduled report delivery (email/webhooks — enables the Phase 7
  definitions)

## Phase 9 — Production Hardening

- RLS test suite expansion and security review
- Performance passes (indexes, query plans, caching of posted aggregates)
- Backup/restore and disaster-recovery runbooks
- Observability (structured logs, error tracking, uptime monitoring)
- Rate limiting and abuse protection
- Accessibility audit and mobile polish
- Deployment pipeline with preview environments (dedicated Vercel project;
  never shared with any other application)
