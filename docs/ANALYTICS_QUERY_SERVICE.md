# Analytics Query Service

`src/lib/analytics/queries/service.ts` — the one permission-aware entry
point every analytics surface uses.

## Interface

| Method | Purpose |
| --- | --- |
| `AnalyticsService.create(actor, orgId)` | Gate on `analytics:read`; load reporting periods once |
| `periodWindow(periodId)` | Window for a reporting period (label, dates, finality, partial) |
| `customWindow(from, to, label?)` | Explicit ad-hoc window (never final) |
| `resolveComparison(kind, anchor, custom?)` | One comparison window or a refusal reason |
| `rollingPeriods(anchor, count)` | Anchor period + preceding reporting periods |
| `getMetricSeries(metricId, windows, scope)` | One metric across ordered windows |
| `getMetricComparison(metricId, anchor, kind, scope)` | Anchor vs one comparison window |
| `getMultiPeriodComparison(ids, anchor, kinds, scope)` | Many metrics × many kinds, batched |
| `getBreakdownComparison(metricId, groupBy, anchor, kind, scope)` | Grouped rows across two windows (no N+1) |
| `getMetricResult(metricId, window, scope, filters)` | Raw engine result (memoized) |
| `datasetFor(window)` | The loaded dataset (cohort composition) |

Scorecards (`scorecards/compose.ts`), goal progress, cohorts,
presentation, packages, and dataset exports all take the service — none
of them create their own sessions.

## Guarantees

- **Batched loading**: one `IntelligenceSession` per loaded span; the
  span is the union of every window in the request, so the engine's
  pooled fact load happens once. Widening reuses the memo caches
  (results are window-exact).
- **No duplicate metric requests**: results are memoized by
  `metricId | scope | window | filters`.
- **Scope narrowing**: scope inputs pass through to the engine, which
  narrows org → department → trainer-self per metric and returns denial
  reasons — the service never widens anything.
- **Health, version, unit preserved**: `MetricResult` passes through
  verbatim; comparisons carry both sides' health and refuse on version
  or unit mismatch.
- **Deterministic**: no wall-clock reads besides `today` (injectable for
  tests); identical inputs give identical outputs.
- **Defensive cap**: more than 26 windows per request throws
  (`analytics_too_many_windows`) instead of degrading quietly.

## Entry permissions vs metric permissions

`analytics:read` opens the analytics surfaces. What a viewer actually
sees is decided per metric by the engine (`requiredPermission`,
`selfPermission`, department scoping) plus RLS on the underlying rows.
A trainer with `analytics:read` composing the executive scorecard gets
their own slice or honest `unavailable` rows — composition never widens
access.
