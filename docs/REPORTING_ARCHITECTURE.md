# Reporting Architecture

## The one analytics service

`IntelligenceSession` (src/lib/intelligence/service.ts) is the internal
reporting API. A consumer creates a session for an organization + date
range (one dataset load), then requests:

| Call | Returns | Notes |
| --- | --- | --- |
| `getMetric(id, scope?, filters?)` | `MetricResult` | value + unit + health + reasons/warnings + metadata + dependencies + calculatedAt + version |
| `getMetrics(ids, …)` | `MetricResult[]` | batch of the above |
| `getBreakdown(id, groupBy, …)` | `MetricBreakdown` | ONE metric per group member (trainer/department/service/compensation_method/status); rows come from the metric's single evaluator |
| `getTrend(id, granularity, …)` | `TrendResult` | daily/weekly(ISO)/monthly/quarterly/yearly points (edge buckets clamped) + previous-period and previous-year comparisons with change in bp |
| `getExecutiveSummary()` | structured items | deterministic winners (top revenue department, most sessions, lowest cancellation rate with a 5-booking floor, biggest configuration gap, …); requires org-level `report:manage` |

Consumers today: the `/reports` page (full report + trainer self-service
view). Consumers tomorrow: exports, dashboards, the mobile app, a public
API, AI insights — all through this service, none with their own SQL or
formulas.

## /reports surface

- Requires a live workspace + selected organization + selected reporting
  period (the period defines the metric window; previous-period
  comparisons come free from the pooled dataset).
- Sections: appointments & utilization, revenue, payroll, clients &
  retention (metric cards with health badges and reasons); department and
  trainer breakdown tables; configuration readiness and executive summary
  (visible with `report:manage`).
- Trainers get "My performance": the same catalog metrics with scope
  forced to their own record by the service; payroll figures appear only
  once a run is posted (RLS + engine policy agree).
- The page contains zero business math — `format.ts` converts units for
  display (cents→$, bp→%, minutes→h) and nothing else.

## Trend engine

`trends/engine.ts` is pure calendar math over YYYY-MM-DD strings (UTC
internally — no timezone drift): bucket generation with clamped edges,
equal-length previous-period ranges, calendar previous-year ranges with
Feb-29 clamping. Comparisons express change in basis points of the
previous value; growth from zero/nothing is null (undefined), never ∞.
Forecasting is intentionally not built.

## Executive summary engine

`summaries/executive.ts` produces structured, deterministic outputs — not
AI. Each item: stable code, headline, subject, value + unit, basis metric
ids, health, and an honest empty-state detail when there is no valid
winner (e.g. "No trainer has 5+ booked appointments in this window").
Ties break alphabetically so output is reproducible.

## Future dashboard readiness

A dashboard needs exactly three things, all available today:
1. `getMetrics` for KPI tiles (health states included — tiles can render
   "waiting for imports" instead of fake zeros),
2. `getBreakdown` for tables/rankings,
3. `getTrend` for charts (points + comparisons).
No new business logic will be required — only presentation. The same is
true for CSV/PDF exports (serialize `MetricResult`s) and a future public
API (wrap the session in route handlers with the same permission model).
