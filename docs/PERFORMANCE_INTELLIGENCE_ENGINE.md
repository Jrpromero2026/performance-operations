# Performance Intelligence Engine (`intel-v1`)

Phase 5 adds `src/lib/intelligence/` — the ONLY source of truth for every
operational metric. No dashboard calculates metrics directly, no page
invents formulas, no report duplicates business logic: every surface asks
the reporting service (`IntelligenceSession`) for metric results.

## Architecture

```
canonical ledger · finalized payroll · configuration
        │  (RLS-scoped, actor's own client)
        ▼
 datasets.ts — the ONE SQL site; loads pooled facts once per request:
   appointments (current + previous-period + previous-year windows),
   finalized payroll summaries/lines, client lifetime history,
   pipeline flags, readiness facts, display names
        ▼
 shared/context.ts — the ONE narrowing point (scope + date filters)
        ▼
 catalog.ts — 60 metric definitions ⟷ 60 evaluators (1:1, enforced)
   appointments/ revenue/ payroll/ clients/ trainers/ departments/
   organizations/ utilization/ readiness/   (module-owned definitions)
   shared/ (math, facts, evaluate, breakdowns — the only shared math)
        ▼
 service.ts — IntelligenceSession: permission narrowing, metrics,
   breakdowns, trends (trends/engine.ts), executive summaries
   (summaries/executive.ts)
        ▼
 consumers: /reports page today; exports, dashboards, mobile, API, AI
   tomorrow — all through the same service.
```

## Core principles

1. **One formula, one place.** Every metric has a unique id, name,
   business definition, exact formula string, dependency list, scope list,
   permission requirements, and version (`intel-v1`) in the catalog. The
   catalog throws at load on duplicate ids, missing evaluators, or orphan
   evaluators — and unit tests assert the same.
2. **Deterministic.** Pure evaluators over loaded facts; integer math
   (cents, minutes, basis points) with half-away-from-zero rounding shared
   with the payroll engine; stable ordering; identical inputs produce
   identical outputs (unit-tested, including the executive summaries).
3. **No fake data.** Missing business data is never rendered as 0/null/[]
   without a reason. Every result carries a health state:
   `healthy · incomplete · unavailable · configuration_missing ·
   waiting_for_payroll · waiting_for_imports · waiting_for_configuration`
   plus human-readable reasons and warnings. A numeric 0 always means "the
   pipeline has data and this scope truly has none". Undefined ratios
   (zero denominators) are null with a warning, never 0.
4. **Approved definitions only.** Revenue = source listed / source paid
   amounts over completed appointments. Eligible and recognized revenue
   have no approved business definition and are permanently `unavailable`
   until one exists. Payroll metrics read FINALIZED (posted/locked) runs
   only — draft numbers are never reported. Capacity utilization reports
   `configuration_missing` because availability configuration does not
   exist; nothing invents capacity.

## Filters and scopes

Every metric evaluates at any of its declared scopes (organization,
department, trainer, service, client) and under the shared filters: date
range (from the reporting period or custom), appointment statuses,
service, client, compensation method. Scope + filter narrowing happens in
exactly one function pair (`scopeAppointments` / `scopePayroll`).

## Security

`resolveAccess` maps the actor's memberships to one of: **org** access
(full scope choice inside the organization), **department** access
(department-scoped roles may only request their own departments), **self**
access (trainers: scope is FORCED to their own trainer record; breakdowns
denied — no peer visibility), or **none** (result is `unavailable`, never
data). Underneath, all loading runs on the actor's own Supabase client, so
RLS re-enforces every row: a trainer's client physically cannot read other
trainers' payroll rows, and payroll self-scope remains posted/locked-only
(Phase 4 policies). Verified by unit tests (access matrix) and live
Playwright (workspace switching shows zero cross-org leakage).

## Cache strategy (designed, not prematurely built)

Metrics calculate live today. The loader's output
(`IntelligenceDataset`) is deliberately the cache boundary: a cached or
materialized implementation only has to produce the same fact shape —
evaluators, service, and consumers never change. The client lifetime
history scan is the first materialization candidate (documented in
datasets.ts); scheduled refresh and materialized views can be added behind
the same interface. `calculatedAt` + `version` are already on every
result for future cache validation.

## Known limitations

- Client-history lifetime scan is O(completed appointments) per request —
  fine at current scale, first to materialize.
- Payroll facts are reporting-period-grained: a payroll run overlapping a
  requested window contributes whole-period amounts (no daily proration —
  payroll simply has no daily grain).
- `revenue_paid_cents` depends on the import source providing paid
  amounts; Setmore exports often do not (reported as `incomplete`).
- Department attribution of appointments depends on service→department
  assignment at posting time; unassigned appointments are surfaced in
  metadata/warnings rather than guessed.
- Trends bucket by the appointment's LOCAL calendar date (the source
  timezone captured at import); no cross-timezone re-normalization is
  attempted.
