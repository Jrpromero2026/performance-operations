# Analytics Architecture (Phase 9)

The analytics layer is a **composition layer** over the Performance
Intelligence Engine. It adds multi-period analysis, scorecards, goals,
benchmarks, dashboards, cohorts, presentation, and governed exports —
without owning a single operational formula.

## The one rule

```
Canonical operational data
  → Performance Intelligence Engine   (the ONLY metric calculator)
    → Analytics query layer           (windows, comparisons, memoized batching)
      → Scorecards and dashboards     (composition per viewer)
        → Reports and subscriptions   (Phase 7 packages, Phase 8 scheduling)
```

The analytics layer **requests** metrics, breakdowns, and trends; it
**derives presentation-only values** (variances, goal gaps, cohort
counts); it **never** recalculates operational metrics, queries canonical
tables from pages, renames source amounts as revenue, converts
unavailable metrics to zero, or bypasses metric health.

## Domain layout (`src/lib/analytics/`)

| Directory | Contents |
| --- | --- |
| `shared/` | `analytics-v1` types, per-metric analytics metadata registry, page context loader |
| `comparisons/` | window resolution (pure calendar/period math) + comparison math |
| `queries/` | `AnalyticsService` — the one entry point per request |
| `scorecards/` | code-defined default scorecards + per-viewer composition |
| `goals/` | goal progress derivation (pure) + server actions |
| `benchmarks/` | benchmark server actions (engine-computed internal values) |
| `dashboards/` | closed widget schema (zod), per-viewer renderer, actions |
| `cohorts/` | first-visit cohort composition over engine facts |
| `presentations/` | analytics report packages + deterministic analytical summaries |
| `exports/` | forecast-ready historical datasets + subscription artifact mapping |

Engine code stays untouched except for two **additive** session methods
(`getMetricForWindow`, `getBreakdownForWindow`) that evaluate the same
single evaluator per metric over a sub-window of the loaded dataset —
exactly the mechanism trend buckets already used. Windows outside the
session's primary range return `unavailable` rather than silently
partial numbers.

## AnalyticsService

`AnalyticsService.create(actor, organizationId)`:

- gates entry on `analytics:read` (each metric additionally narrows
  through the engine's own permission scoping and RLS underneath);
- loads the organization's reporting periods once (window resolution and
  finality labels);
- maintains **at most one IntelligenceSession per loaded span** — a
  request needing wider dates creates one wider session covering the
  union, so every window evaluation shares one batched fact load;
- **memoizes** every metric and breakdown request (identical requests
  never evaluate twice — `cacheHits` is exposed for diagnostics);
- resolves comparison windows explicitly and refuses non-derivable ones
  with a reason (never a guess).

Pages never call `IntelligenceSession` directly for analytics — they go
through `loadAnalyticsContext()` (workspace + actor + period + service)
and the service.

## Finality and partiality

Every window carries:

- `finality`: `final` (reporting period status `closed`) or `not_final`
  (open periods and all calendar-derived windows);
- `partial`: the window extends into the future (still accumulating).

Analytics packages and subscriptions label artifacts FINAL / NOT FINAL
from this. Closed-period **financial** artifacts remain the Phase 7
frozen close packages; analytics packages are compositions and always
record which they are.

## What was deliberately not built

- No AI, forecasting, anomaly detection, recommendations, or
  natural-language querying (Phase 10+ decisions).
- No materialized analytics tables: measured dev-database latencies (see
  `docs/PHASE_9_REPORT.md`) do not justify one; the dataset loader
  comment marks the cache boundary where a governed materialization
  would slot in without touching a metric.
- No scorecard_definitions table: default scorecards are code-defined;
  custom compositions live in the dashboard builder. Recorded in
  `docs/DECISION_LOG.md`.
