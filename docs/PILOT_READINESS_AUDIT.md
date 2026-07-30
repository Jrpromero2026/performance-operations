# Pilot Readiness Audit

Operator-perspective audit of every route and workflow at commit
`a422470`, 2026-07-30, against the internal-pilot objective (Timberhill +
G3). Statuses: READY · READY WITH CONFIGURATION (RWC) · OWNER ACTION
REQUIRED (OAR) · BLOCKED · NOT REQUIRED FOR PILOT (NRP). Severity:
BLOCKER · MAJOR · MINOR · COSMETIC. "Claude" = Claude-actionable,
"Owner" = requires JR in the browser or a business decision.

Evidence base: full route sweep during Phase 9 live verification (82
live Playwright tests exercising every workflow the same day), source
scans (zero TODO/FIXME/HACK in `src`), and the database inventory in
[PILOT_CONFIGURATION_INVENTORY.md](PILOT_CONFIGURATION_INVENTORY.md).

## Route-by-route classification

| Route | Workflow | Status | Notes |
| --- | --- | --- | --- |
| `/login`, `/forgot-password`, `/reset-password`, `/accept-invite` | Authentication | **READY** | Invite-only; bootstrap admin documented in README; e2e-verified |
| Workspace + period selectors (header) | Workspace switching | **READY** | Validated server-side; leak-prevention e2e-verified |
| `/configuration` | Config hub | **READY** | |
| `/configuration/access` | Roles overview | **READY** | |
| `/configuration/users` | Invites + membership | **RWC** | JR must invite real users; works (e2e-verified) |
| `/configuration/services` (+new/[id]) | Service catalog | **RWC** | Empty of real services; forms verified |
| `/configuration/compensation` (+new/[id]) | Comp plans, tiers, versions | **RWC** | Tier editor supports the ladder model; plans must be entered + published by JR (F-4) |
| `/configuration/reporting-periods` (+new/[id]) | Periods | **RWC** | JR must create real periods |
| `/configuration/integrations` (+ sub-routes) | Provider connections | **OAR** | Setmore/Acuity honestly blocked pending credentials; CSV path is the pilot route |
| `/trainers` (+new/[id]/edit/compensation) | Roster + assignments | **RWC** | Empty of real trainers; flows verified |
| `/imports` `/imports/new` `/imports/[batchId]` (+mapping/review/approval) | Import Center | **READY** | Setmore adapter + Acuity/manual column mapping; duplicate/reversal governance e2e-verified |
| `/appointments` (+[id]) | Ledger review | **READY** | |
| `/payroll` (+new/[runId]/review/statements/export, adjustments, time) | Payroll engine | **RWC** | Engine verified; needs real plans/assignments; rule gaps fail closed (F-4) |
| `/period-close` (+full sub-tree) | Close workflow | **RWC** | Verified incl. zero-activity rule; approval policy decision needed (F-2) |
| `/overview` | Operations Center | **READY** | |
| `/reports` (+export) | Report Center | **READY** | |
| `/analytics` (+executive/scorecards/goals/benchmarks/cohorts/dashboards/presentation/datasets) | Phase 9 BI | **READY** | Verified same-day by 14 live workflows |
| `/integrations` (+runs/jobs/deliveries) | Automation ops | **RWC** | Email stays test-mode until a provider is approved (documented) |
| `/notifications` | Notification center | **READY** | |
| `/audit` | Audit history | **READY** | Fixture noise visible in sandbox orgs; pilot orgs start clean |
| `/revenue` | Revenue placeholder | **NRP** | See F-5 |
| `/clients` | Client registry placeholder | **NRP** | See F-5 |
| Print/PDF views (statements, presentation) | Print output | **READY** | Browser-print based; verified |
| Error/empty/loading states | Cross-cutting | **READY** | Suspense skeletons + explicit empty states throughout; honest health labels |
| Responsive behavior | Cross-cutting | **READY** | e2e-verified (mobile drawer, responsive grids) |

## Findings

### F-1 — Development database contains only fixture business data
- **Route/workflow**: all data-bearing surfaces · **Severity: BLOCKER**
  (for real use as-is) · **Pilot blocker: yes**
- **Issue**: every trainer, service, plan, period, batch, and run in the
  dev project is a test artifact; Timberhill carries heavy synthetic
  history that surfaces in close readiness, import health, and audit.
- **Action**: adopt Option 2 — seed two clean "(Pilot)" organizations
  (evidence + names in the inventory doc). **Claude-actionable** (seed
  script) after JR confirms names; all business configuration inside
  them is **Owner** work.
- **Evidence**: PILOT_CONFIGURATION_INVENTORY.md.

### F-2 — Self-approval close policy is a silent dev fixture
- **Route**: `/period-close` approval · **Severity: MAJOR** · **Pilot
  blocker: decision required**
- **Issue**: `organization_close_policies.allow_self_approval = true`
  exists for sandbox Timberhill so one e2e account can close periods.
  Pilot orgs get the fail-closed default — but JR is a single operator,
  so WITHOUT the policy a real close cannot be approved at all. This
  must be an explicit owner decision, not an inherited fixture.
- **Action**: **Owner** decides (recorded in PILOT_INPUTS_REQUIRED.md);
  applying the policy row to a pilot org is **Claude-actionable** after
  the decision.
- **Evidence**: Phase 7 fixture notes; policy row in inventory.

### F-3 — No real delivery channel; scheduled emails stay test-mode
- **Route**: `/integrations/deliveries`, subscriptions · **Severity:
  MAJOR** (expectation risk) · **Pilot blocker: no**
- **Issue**: without an approved provider, deliveries record test-mode
  outcomes only. Correctly labeled everywhere, but JR must not expect
  real email during the pilot.
- **Action**: **Owner** (provider decision, U10d–e); until then use
  in-app artifacts. No code change.

### F-4 — Payroll commission ladder not configured; rules evidence-blocked
- **Route**: `/configuration/compensation`, `/payroll` · **Severity:
  MAJOR** · **Pilot blocker: yes (for payroll use)**
- **Issue**: the historical Timberhill ladder (50% → $3,000=55% →
  $4,500=60% → $5,500=65% → $7,000=70%) and the open cliff-vs-marginal
  question (`docs/business-rules/payroll-rule-gaps.md`, U1c) are NOT in
  configuration, per the no-guessing rule. Trainer-specific variations
  unknown. G3 splits/multi-coach rules unknown.
- **Action**: **Owner** enters plans in the compensation UI (which
  supports the ladder + effective dates); first run validated against
  known payroll per FIRST_PAYROLL_VALIDATION.md. Fail closed for
  unresolved trainers (leave them unassigned — the engine reports them
  as blocking issues instead of paying wrong amounts).

### F-5 — `/revenue` and `/clients` are placeholder pages in primary nav
- **Severity: MINOR** · **Pilot blocker: no**
- **Issue**: both render polished "later phase" placeholders. Revenue
  figures actually live in Reports/Analytics (as source-listed/paid
  amounts); client counts live in Analytics cohorts. The `/clients` copy
  ("nothing until real client records exist") is slightly misleading —
  client records DO get created by imports; the registry UI was simply
  deferred. Operator confusion risk only.
- **Action**: recorded; not fixed (placeholder copy is honest about
  being deferred, and both routes are NRP). Revisit at production.

### F-6 — Stray active e2e analytics records in sandbox Timberhill
- **Severity: MINOR** · **Pilot blocker: no**
- **Issue**: 2 active "E2E Goal *", 2 draft "E2E Dept Goal *", 2
  approved "E2E Bench *" left by sleep-interrupted test runs (their
  cleanup tests never ran).
- **Action**: **Claude-actionable** hygiene via the app UI or SQL;
  harmless to the pilot (wrong org) — sandbox-only noise.

### F-7 — Dev-phase jargon in empty states
- **Severity: COSMETIC** · **Pilot blocker: no**
- **Issue**: some empty states carry phase chips ("Phase 5 · Analytics")
  and references to repo docs (e.g. `docs/INPUTS_REQUIRED.md`) —
  developer-facing language in operator UI.
- **Action**: recorded; acceptable for an internal pilot run by the
  repo owner.

### F-8 — No organization-creation UI
- **Severity: MINOR** (by design) · **Pilot blocker: no (seed path
  exists)**
- **Issue**: `org:create` permission exists but no UI/action uses it;
  orgs are seeded. Fine for pilot (two known orgs), noted for
  production onboarding.

### Explicitly checked and clean
- Mock/demo/sample data in UI copy: none (one honest "no sample data"
  note in the blocked Acuity adapter description).
- TODO/FIXME/HACK markers in `src`: zero.
- Disabled primary actions, dead links, buttons without actions,
  unfinished forms: none found (all primary actions e2e-exercised).
- Unsafe defaults: none beyond F-2 (which is org-scoped and absent for
  new orgs); auto-approve/auto-post remain database-constrained OFF;
  external email recipients default OFF; execution flags default OFF.
- Developer-only instructions exposed: only F-7 phase chips.
- Committed secrets/PII: none (`.env.local` untracked; tracked tree
  scanned; only the synthetic e2e admin email appears in a spec).
