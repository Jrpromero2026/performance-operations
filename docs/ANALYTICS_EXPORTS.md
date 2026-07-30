# Analytics Exports

Forecast-ready historical datasets and analytics subscriptions —
`src/lib/analytics/exports/`, `/analytics/datasets`,
`analytics_dataset:export`.

## "Forecast-ready" means structured history

The label is exact: versioned, stable-schema HISTORICAL engine output a
future forecasting phase could consume. **No projected values exist
anywhere.** The note is embedded in every file header.

## Datasets (`analytics-export-v1`)

| Key | Rows |
| --- | --- |
| `metric_time_series` | Org-scope metric set × rolling reporting periods |
| `department_period_summary` | Core metrics per department for the selected period |
| `trainer_period_summary` | Operational metrics per trainer — **no payroll amounts** (payroll exports stay in the payroll domain with their own controls) |
| `service_period_summary` | Sessions, coaching time, listed amounts per service |
| `goal_progress` | Active/completed goals with current engine values and derived progress |
| `benchmark_comparison` | Approved benchmarks vs current engine values |

Every row carries: organization, scope level + id + label, metric id /
name / version, period id + label + dates, value, unit, health, reason,
**finality**, generated timestamp. Machine currency is integer cents;
human-readable currency appears only in presentation surfaces (en-US).

## Protections

- CSV cells flow through the Phase 7 builder — RFC 4180 quoting plus
  formula-injection protection (`=`, `+`, `-`, `@` prefixed).
- Deterministic ordering (windows by date, groups by label) — identical
  inputs give byte-identical files.
- Every export returns `X-Export-Sha256`, records an `export_events`
  row (dataset key, hash, row count, byte size) and an audit event.
- Client-level datasets deliberately do not exist; no unnecessary PII.
- Route authorization: workspace → actor → `analytics_dataset:export` →
  analytics service (which re-gates `analytics:read`).

## Subscriptions (Phase 8 engine, Phase 9 artifacts)

`scheduled_report_definitions.report_type` now also accepts:
`executive_scorecard`, `department_scorecard`, `trainer_self_scorecard`,
`goal_progress_report`, `benchmark_report`, `cohort_report`,
`analytics_dashboard`, `board_presentation_package`.

Execution (`lib/analytics/exports/subscriptions.ts` wired into the
Phase 8 executor) generates the matching **versioned analytics package**
per occurrence and reuses everything else unchanged: recipient
governance against current members, one-execution-per-occurrence
(DB-enforced), FINAL / NOT FINAL labeling from period status, test-mode
email delivery (no real provider configured), no financial amounts in
email bodies. Analytics packages are compositions, not close financial
artifacts — closed periods regenerate them with the FINAL label rather
than referencing frozen close packages (which remain the authority for
financial close evidence).
