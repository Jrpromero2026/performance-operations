# Phase 5 Report — Performance Intelligence Engine

Date: 2026-07-29 · Engine version: `intel-v1` · Project:
`performance-operations-dev` (yoolmtleaezprjmfasku)

## 1. Executive status

The Performance Intelligence Engine is built, tested, and live-verified.
It is the single source of truth for every operational metric: 60
uniquely-identified, versioned, permission-scoped metric definitions with
exactly one evaluator each, served through one reporting service that the
`/reports` surface (and every future dashboard/export/API) consumes. No
page computes a formula; no SQL is duplicated; missing business data is
always explained by a health state instead of a fake zero.

## 2. Metrics implemented

**60 metrics** across all primary categories:
- Appointments/scheduling (18): status counts (scheduled/completed/
  cancelled/late-cancelled/no-show/rescheduled/total), completed/
  cancellation/no-show rates, average + median durations, coaching/
  completed/booked minutes, group + evaluation sessions, session growth.
- Revenue (9): source listed, source paid, per session, per hour, average
  session value, growth, rolling 30-day, and eligible/recognized held
  `unavailable` (no approved definition — never inferred).
- Payroll (9): gross, payroll %, per session, per hour, bonuses,
  deductions, adjustments net, growth, variance — finalized runs only.
- Clients & retention (13): active/inactive/new/returning, sessions per
  client, revenue per client, average spend (paid), retention rate, visit
  frequency, first/last visit (client scope), client growth, repeat
  clients.
- Departments/organizations (2): active trainers, active departments —
  every other metric rolls up to department/organization scope through
  the shared scoping (Timberhill, G3, and any future organization).
- Utilization (2): schedule utilization (completed ÷ booked time);
  capacity utilization honestly `configuration_missing`.
- Readiness (7): trainer assignment, compensation, alias, period
  coverage, import health, payroll readiness, organization readiness.

## 3. Metric catalog

`docs/METRIC_CATALOG.md` and `docs/METRIC_DEFINITIONS.md` are GENERATED
from the live catalog (id, name, category, unit, scopes, permissions,
definition, exact formula, dependencies, version) so documentation cannot
drift from code. Catalog integrity (unique ids, 1:1 evaluators, formulas
present, category coverage) is enforced at module load AND unit-tested.

## 4. Intelligence architecture

`src/lib/intelligence/` with module-owned definitions: `appointments/`,
`revenue/`, `payroll/`, `trainers/`, `clients/`, `departments/`,
`organizations/`, `utilization/`, `readiness/`, `trends/`, `summaries/`,
and `shared/` (the only shared math). One dataset loader (the only SQL),
one scope/filter narrowing function pair, one context builder, pooled
facts covering current + previous-period + previous-year windows. Filters:
organization, department, trainer, service, reporting period, date range,
appointment status, client, compensation method. Trend engine: daily/
weekly/monthly/quarterly/yearly buckets (clamped edges), previous-period
and previous-year comparisons; no forecasting. Executive summary engine:
nine deterministic structured generators (top revenue department, largest
revenue increase, most sessions, lowest cancellation rate with a 5-booking
floor, highest revenue per hour, highest payroll growth, largest payroll
change, most improved trainer, biggest configuration gap). No new
database tables were needed — everything computes from the canonical
ledger, finalized payroll, and configuration; nothing is duplicated.

## 5. Reporting API

`IntelligenceSession`: `getMetric` / `getMetrics` / `getBreakdown` /
`getTrend` / `getExecutiveSummary`, each returning structured results with
metric id, scope, filters, value, unit, health, reasons/warnings,
metadata, dependencies, calculatedAt, and version. `/reports` consumes it
exclusively (cards, department/trainer tables, readiness panel, executive
summary, trainer self-service view); `format.ts` does display-only unit
conversion. Cache strategy designed, not built: the dataset fact shape is
the cache/materialization boundary.

## 6. Security verification

- Access resolution: org / department-scoped (own departments only) /
  self (scope FORCED to the actor's trainer; breakdowns denied) / none
  (`unavailable` result) — unit-tested across platform_admin,
  workspace_admin, payroll_manager, department_manager, trainer, viewer.
- A trainer can never retrieve another trainer's metrics: the service
  rejects foreign trainer scope AND the loader runs on the actor's own
  RLS-scoped client (Phase 3/4 policies re-enforce row access, including
  posted/locked-only payroll self-scope).
- Department managers see no payroll metrics (no payroll:read);
  readiness/executive summaries require report:manage.
- Live e2e verified workspace switching leaks nothing across
  organizations.

## 7. Unit test counts

**222 total** (15 files), of which **58 new intelligence tests**: math
(rounding/ratios/medians/growth incl. negatives and zero denominators),
trends (buckets, clamping, boundary dates, leap-year previous-year,
inclusive day counts), metric correctness per category, health gates
(waiting_for_imports/payroll, configuration_missing, incomplete), real
zero vs fake zero, aggregation reconciliation (org totals ≡ Σ trainer
rows ≡ Σ department rows; trainer scope isolation; cross-org exclusion),
catalog integrity, access matrix, executive summary determinism and
honest empty states. Cross-checks: payroll metrics reconcile to posted
payroll's own session/minute counts; appointment metrics to the ledger
summary.

## 8. Playwright counts

**74 e2e tests, all passing**: 36 offline + 38 live. New
`live-intelligence.spec.ts` (7 incl. setup): import → period-gated
/reports → engine metrics verified to the cent ($164.00 listed, $82.00 per
session, 66.67% completed rate, 2h coaching) → payroll waiting-state
honesty → trainer breakdown + readiness + executive summary → workspace
switching with zero cross-org leakage → reversal proving the engine reads
only active ledger rows.

## 9. Build results

`lint` ✓ (one pre-existing TanStack warning) · `typecheck` ✓ ·
`vitest` 222/222 ✓ · Playwright 74/74 ✓ · `next build` ✓ (all routes).

## 10. Documentation added

- docs/PERFORMANCE_INTELLIGENCE_ENGINE.md (architecture, principles,
  health model, security, cache strategy, limitations)
- docs/METRIC_CATALOG.md (generated — 60 metrics)
- docs/METRIC_DEFINITIONS.md (generated — definition/formula/dependencies
  per metric)
- docs/REPORTING_ARCHITECTURE.md (service API, consumers, trends,
  summaries, dashboard readiness)
- DECISION_LOG C34–C38.

## 11. Known limitations

Client lifetime history scans all completed appointments per request
(first materialization candidate); payroll facts are period-grained (no
daily proration — payroll has no daily grain); paid revenue depends on the
source providing it (Setmore usually doesn't → `incomplete`); department
attribution follows service→department assignment at posting; trends use
the appointment's local calendar date (source timezone at import);
eligible/recognized revenue and capacity utilization stay unavailable
until business definitions/configuration exist.

## 12. Future dashboard readiness

A dashboard (or mobile app, public API, AI layer) needs only
`getMetrics` for tiles, `getBreakdown` for rankings, and `getTrend` for
charts — all shipped, permission-scoped, health-annotated, and versioned.
Zero new business logic will be required; only presentation.

## Commits (Phase 5)

| Commit | Content |
| --- | --- |
| a2488f6 | feat: performance intelligence engine (intel-v1) + 58 unit tests |
| b523965 | feat: intelligence-driven /reports surface |
| 66849e7 | test: live intelligence e2e verification |
| (this) | docs: Phase 5 documentation and report |
