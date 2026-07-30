# Multi-Period Comparisons

How the analytics layer compares engine results across periods —
`src/lib/analytics/comparisons/` (`windows.ts`, `compare.ts`).

## Windows

Every analysis window is explicit: `kind`, human label, inclusive local
dates, reporting-period id when it IS a period, `finality`
(`final` = closed period; everything else `not_final`), and `partial`
(extends into the future).

Supported comparison kinds:

| Kind | Resolution |
| --- | --- |
| `previous_period` | The actual preceding reporting period when the anchor is one; else the equal-length preceding window |
| `same_period_last_year` / `year_over_year` | Same calendar range one year earlier (Feb 29 → Feb 28) |
| `month_over_month` | Previous calendar month — refused unless the anchor sits inside one month |
| `quarter_over_quarter` | Previous quarter — refused unless the anchor sits inside one quarter |
| `rolling_4_periods` (via `resolveRollingPeriods`) | Anchor + preceding reporting periods — refused for ad-hoc ranges |
| `rolling_12_months` | 12 whole calendar months ending with the anchor's end month |
| `year_to_date` | Jan 1 → anchor end |
| `prior_year_to_date` | Jan 1 of prior year → same shifted span |
| `custom` | Explicit validated dates |

Non-derivable windows return a **reason**, which flows into the
comparison as `missing_comparison_period` — never a substitute window.
Calendar windows that exactly match a reporting period inherit its
identity and finality.

## Comparison eligibility

A comparison populates variances only when **eligible**:

- both sides carry a numeric value with health `healthy`/`incomplete`;
- units match; metric versions match;
- the metric is historically comparable (readiness metrics are
  point-in-time configuration state → `point_in_time_metric`).

Every other state names itself: `current_unavailable`,
`comparison_unavailable`, `missing_comparison_period`, `unit_mismatch`,
`version_mismatch`, `window_not_derivable`. Missing periods are
**unavailable, not zero**.

## Display rules (approved)

- **Absolute variance** — always shown when eligible, in the metric's
  native unit.
- **Percentage change** — `(current − previous) / previous` in basis
  points, only when the denominator is **strictly positive**. Zero and
  negative denominators never yield a percentage (absolute variance may
  still be shown).
- **Rates (`rate_bp`) never show percent-of-percent** — they display
  absolute basis-point deltas ("+250 bp"), the approved display rule.
- **Interpretation** (improved / declined / unchanged) exists only for
  metrics whose registry direction is `higher_is_better` or
  `lower_is_better`. Neutral and context-dependent metrics get no
  judgment.

## Direction metadata

`src/lib/analytics/shared/metadata.ts` assigns every catalog metric an
explicit direction — a unit test fails the build if a new metric ships
without one. Highlights: completed volume, coaching time, source
amounts, and client activity are `higher_is_better`; cancellations,
no-shows, and inactive clients are `lower_is_better`; payroll amounts
are `context_dependent` (paying more is neither good nor bad without
margin context this system does not calculate); durations, headcounts,
and dates are `neutral`. Registry version: `analytics-meta-v1`; material
changes bump it and land in `docs/DECISION_LOG.md`.

Targets and benchmarks are refused for `date`-unit and not-yet-approved
metrics (`targetCompatible` / `benchmarkCompatible`).

## Partial periods, leap years, irregular periods

- Windows ending on/after today are labeled `partial` and surfaces show
  "in progress".
- Year shifts clamp Feb 29 to Feb 28.
- Irregular custom reporting periods compare by the
  equal-length-preceding-window rule unless an actual preceding
  reporting period exists — which wins, because the business compares
  reporting periods, not day counts.
