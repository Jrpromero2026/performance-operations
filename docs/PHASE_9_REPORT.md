# Phase 9 Report — Analytics, Scorecards, Goals & Executive BI

Completed 2026-07-30 against the dedicated `performance-operations-dev`
Supabase project. Statuses below are exact; nothing is claimed beyond
what was executed.

## 1. Executive status

Complete. The analytics layer composes Performance Intelligence Engine
output into multi-period comparisons, six default scorecards, governed
goals and benchmarks, a closed-schema dashboard builder, cohort
analysis, presentation mode, analytics report packages + subscriptions,
and forecast-ready historical dataset exports — with zero duplicate
business logic, no AI, no forecasting, no deployment.

## 2. Baseline

Phase 8 verified baseline: commit `5e528f5`, clean tree, migrations
1–27 applied, 347 unit tests, 24 offline + 68 live Playwright tests,
73 routes, typecheck/lint/build clean except one pre-existing TanStack
warning. Baseline re-verification surfaced two operational findings
(§40, §42): the live e2e suite requires `--workers=1` (specs share
dev-database state), and interrupted runs leave fixtures that the
recorded cleanup recipes restore.

## 3. Migrations created and applied (additive only; 1–27 untouched)

| # | File | Contents |
| --- | --- | --- |
| 28 | `20260802000028_analytics_permissions.sql` | 21 analytics permissions + role grants |
| 29 | `20260802000029_goals_and_targets.sql` | `performance_goals`, `performance_goal_events` (append-only), `performance_goal_progress_snapshots`, lifecycle/immutability triggers, RLS |
| 30 | `20260802000030_benchmark_framework.sql` | `performance_benchmarks`, lifecycle trigger (frozen approved content), RLS |
| 31 | `20260802000031_analytics_dashboards.sql` | `analytics_dashboards` + sections/widgets/defaults, sharing triggers, RLS |
| 32 | `20260802000032_analytics_packages_subscriptions.sql` | analytics package types on `report_packages`, analytics subscription types on `scheduled_report_definitions`, `dashboard_id` linkage |

All five applied to the dev project; database types regenerated.

## 4–5. Architecture and query service

See `docs/ANALYTICS_ARCHITECTURE.md` and
`docs/ANALYTICS_QUERY_SERVICE.md`. One `AnalyticsService` per request:
`analytics:read` entry gate, one engine session per loaded span (union
of windows), memoized metric/breakdown requests, explicit window
resolution, deterministic outputs, defensive 26-window cap.

## 6. Intelligence Engine reuse

The engine is untouched except two additive session methods —
`getMetricForWindow` / `getBreakdownForWindow` — which run the same
single evaluator per metric over a sub-window of the loaded dataset
(the mechanism trend buckets already used) and refuse windows outside
the session's primary range. No formula was duplicated anywhere; pages
reach the engine only through the analytics service.

## 7–8. Multi-period comparisons and eligibility

`docs/MULTI_PERIOD_COMPARISONS.md`. Windows: previous reporting period
(the actual one when the anchor is a period), same period last year,
MoM/QoQ/YoY (refused when the anchor spans months/quarters), rolling
reporting periods, rolling 12 months, YTD, prior YTD, validated custom.
Eligibility refuses on unavailable sides, unit mismatch, version
mismatch, missing windows, and point-in-time (readiness) metrics —
with reasons, never zeros. Percentages require a strictly positive
denominator; rates show bp deltas, never percent-of-percent.

## 9. Metric catalog metadata

Metric definitions are UNCHANGED (no catalog regeneration needed). A
separate registry (`analytics-meta-v1`,
`src/lib/analytics/shared/metadata.ts`) assigns every metric an
explicit direction (higher/lower/neutral/context-dependent), target /
benchmark / percent-change compatibility, and historical comparability.
A unit test fails the build if any catalog metric lacks an assignment.
Payroll amounts are deliberately context-dependent — no "higher is
better" assumption.

## 10–14. Scorecards

`docs/SCORECARD_ARCHITECTURE.md`. Six code-defined defaults
(organization executive, department, trainer, payroll operations,
period close, integration operations) composed per viewer: current /
previous period / prior year, goal progress with owner, health,
finality, deep links. Trainer scorecards: roster pickers for org-read
roles; trainer-role viewers compose through the engine's forced
self-scope — peer payroll and peer performance are unreachable; source
amounts are never labeled revenue; no public ranking; no composite
score. Close/integration scorecards compose readiness metrics and link
to the operational surfaces rather than duplicating pipeline state.

## 15–17. Goals

`docs/GOALS_AND_TARGETS.md`. Data model with pinned metric
id/version/unit, CHECK-enforced scope and target shapes, metric-native
integer units. Lifecycle draft→active→achieved/missed/cancelled→archived
with `goal:approve` gates, frozen definitional fields, draft-only
target edits, immutable completed goals, append-only event trail, audit
events. Progress: engine result vs target, unavailable never achieved,
catalog drift blocks, zero-denominator percent refused, and exactly one
documented deterministic on-track rule (prorated cumulative minimum).
Baselines are engine-computed. No quotas, no compensation consequences.

## 18–19. Benchmarks

`docs/BENCHMARK_FRAMEWORK.md`. Explicit source types; internal
-historical values computed from healthy engine results with a generated
citation (median/best over a cited period range); internal standards and
external references require owner evidence; approval freezes content;
deprecation preserves history; effective dates and version drift guard
comparisons. No invented industry numbers.

## 20. Cohorts

`docs/COHORT_ANALYSIS.md`. First-completed-visit cohorts from the
engine's client-history map × monthly activity; distinct client counts
(never appointments, never names); missing identity disclosed;
suppression mechanism built (threshold = open business decision);
accessible heat-map table; department filters narrow activity while
cohort identity stays org-level (stated in the UI).

## 21–23. Dashboards

`docs/CUSTOM_DASHBOARDS.md`. Closed zod widget schema re-validated on
write and render; per-viewer resolution through the analytics service
(sharing never bypasses live permissions); personal → department → org
sharing with trigger-enforced gates; duplicates never inherit sharing;
archive-not-delete (packages reference dashboards); personal and
organization defaults under partial unique indexes; full audit trail
including denied sharing attempts.

## 24. Chart system

`docs/CHART_SYSTEM.md`. One pure-SVG server-rendered layer (line/area,
bar, horizontal bar, sparkline, goal progress, cohort heat-map table)
with theme tokens, unit-aware formatting through the single format
module, health badges, explicit empty/unavailable states, `<title>`
tooltips, and a real data-table fallback on every chart. No pie charts,
no color-only meaning, no page-side chart formatting.

## 25. Drill-down behavior

Organization → department → trainer drills via the scorecard scope
pickers (URL-addressable, back-button safe, shareable within permission
scope); executive rows deep-link with metric + scope params; goals link
to their metric context; evidence surfaces stay the existing
permission-gated pages (reports, payroll, appointments). Closed-period
labeling identifies frozen sources; open-period surfaces say live/not
final.

## 26. Executive analytics page

`/analytics/executive`: organization scorecard with dual comparisons,
rolling-period trend, department comparison, goal status, and
deterministic analytical summaries (template statements over engine
results — no AI, no causal claims, no recommendations; unit-tested).
No new executive formulas; no EBITDA/margin/profit/utilization
inventions.

## 27. Presentation mode

`docs/PRESENTATION_MODE.md`. `/analytics/presentation` renders the same
composition full-screen with confidentiality label, generated
timestamp, FINAL / NOT FINAL status, page-break-aware print (PDF via
browser print), fullscreen chrome. One calculation path.

## 28. Analytics report packages

Phase 7 harness reused (versioning, supersede chain, sha256, audit).
New types: `executive_analytics`, `department_scorecard`,
`trainer_scorecard`, `goal_progress` (freezes progress snapshots),
`benchmark`, `cohort_analysis`, `board_presentation`. No parallel
export system.

## 29. Subscriptions

Phase 8 engine reused unchanged (recipient governance, one execution
per occurrence, test-mode delivery, no financial amounts in email).
Eight analytics report types generate versioned packages per occurrence
with FINAL / NOT FINAL labels. Live-verified end to end (manual run →
succeeded → NOT FINAL label).

## 30. Analytics datasets

`docs/ANALYTICS_EXPORTS.md`. Six governed CSV datasets
(`analytics-export-v1`): metric time series, department/trainer/service
period summaries, goal progress, benchmark comparison. Stable ordered
schemas; every row carries scope, metric identity + version, unit,
health, reason, finality, timestamp; integer cents; formula-injection
protection; sha256 + export/audit events; no client-level rows; no
payroll in trainer datasets. "Forecast-ready" = structured history; the
no-projected-values note is embedded in every file.

## 31–33. Historical performance, materializations, reconciliation

Measured on the dev dataset (162 appointments, full client-history
scan): analytics landing ~0.6–0.8 s warm (~2.1 s cold compile),
executive analytics ~1.7–1.9 s warm (~4.3 s cold compile) on the dev
server — inside interactive latency, dominated by Next.js dev-mode
compilation rather than data volume. **No materializations were added**
(none justified by evidence at this volume); therefore no
materialization reconciliation exists. The engine dataset loader remains
the marked cache boundary where a governed, reconciled materialization
would slot in; the client-history scan limitation stays documented in
`docs/COHORT_ANALYSIS.md` with the reassessment recorded. No
historical-performance optimization is claimed.

## 34. Permissions added

21 permissions (migration 28) — see `docs/ANALYTICS_SECURITY.md` for
the exact role matrix (platform admin, workspace admin, payroll
manager, department manager, trainer, viewer), mirrored in
`src/lib/authz/permissions.ts`.

## 35. RLS verification

`tests/rls/phase9-live-checks.sql` executed against the dev project
(isolated throwaway organization, `request.jwt.claims` impersonation,
rollback): **all checks passed** — goal visibility scoping (org /
department / trainer-self / outsider), creation discipline, approval
permission, lifecycle transitions, completed-goal immutability,
append-only events, benchmark creation/approval/frozen-content/
deprecation, dashboard owner-only writes, sharing gates, shared
visibility, defaults governance, and cross-organization denial
throughout. FORCE RLS + deny-by-default on all five new tables.

## 36. Audit behavior

Application audit events for every goal/benchmark/dashboard mutation
(including denied sharing attempts), package generation, dataset
exports (with content hash), and subscription runs; the goal domain
adds a deterministic append-only event trail. Audit rows carry safe
summaries, never full datasets.

## 37. Unit tests

**411 passing, 0 failing, 0 skipped** (vitest, 30 files) — 64 new in
Phase 9: comparison windows + eligibility + percent rules + metadata
coverage (33), goal progress (13), benchmark compatibility (3), charts
(9), cohorts (6); the baseline 347 unchanged.

## 38–40. Playwright and full regression

Final full regression (`npm run test:e2e`, live serialized), 2026-07-30:

- **Offline: 24 passed** (chromium + mobile).
- **Live: 82 passed** — the complete Phase 1–8 regression (68,
  including auth setup and the hardened delivery-retry assertion) plus
  the 14 Phase 9 analytics workflow tests.
- **0 failed, 0 skipped** in the final run. (Two earlier full-suite
  attempts were invalidated by machine-sleep suspensions mid-run; the
  stranded state they left was disposed through legal batch/run state
  transitions before the clean run.)

Phase 9 analytics workflows cover items 1–48 of the phase's workflow
list except those requiring non-admin sessions in the browser
(trainer-login denials, permission loss, unauthorized-share denial) —
those controls are enforced and verified at the database layer by the
live SQL suite (§35), which is the stronger guarantee. Full Phase 1–8
regression = workflow 50.

## 41. Build results

`npm run build`: compiled clean; **85 routes** (73 + 12 analytics
routes); typecheck clean; eslint clean except the one pre-existing
TanStack `useReactTable` warning (unchanged from baseline).

## 42. Known limitations

- Live e2e requires serialized workers (now enforced by
  `scripts/run-e2e.mjs`); interrupted runs still need the recorded
  cleanup recipes.
- The delivery-events count cap (40 rows) made one Phase 8 assertion
  volume-dependent; it now anchors on the specific retried event.
- Analytics packages regenerate per occurrence (versioned + hashed);
  they are not close artifacts and say so.
- Cohort suppression threshold defaults to off pending the business
  decision; presentation branding is name-only pending assets.
- Board presentation / dashboard subscriptions deliver the executive
  analytics composition (references recorded); a bespoke board layout
  awaits owner-defined sections (U11g).
- No department/dashboard pickers on the subscription form yet —
  department-scorecard and dashboard subscriptions are executable via
  definitions created with those fields set (form exposes the
  parameterless types).

## 43. Manual configuration required

None for dev. Production still requires everything listed in Phase 8
(email provider, worker hosting, provider credentials) — unchanged.

## 44. Unresolved business decisions

Recorded as U11a–U11k in `docs/DECISION_LOG.md` and
`docs/INPUTS_REQUIRED.md` §17: approved scorecard metric lists, goal
approval policy/ownership/cadence, benchmark evidence + approval
policy, small-cohort suppression threshold, fiscal calendar + YTD
definition, chart palette/presentation branding, board-report sections,
ranking + trainer visibility policy, materialization threshold,
dashboard sharing defaults, external dashboard recipients, required
report subscriptions.

## 45–46. Git status and commits

Working tree clean at completion; all Phase 1–8 history preserved; no
force pushes; no deployment. Phase 9 commits on `main`:

1. `feat: add analytics query and comparison layer`
2. `feat: add goals and targets framework`
3. `feat: add governed benchmark framework`
4. `feat: add analytics chart system`
5. `feat: add executive and role scorecards`
6. `feat: add goals and benchmarks pages`
7. `feat: add custom analytics dashboards`
8. `feat: add cohort analysis`
9. `feat: add presentation mode`
10. `feat: add analytics exports and subscriptions`
11. `test: verify analytics and scorecard controls`
12. `docs: complete Phase 9 report`

## 47. Recommended Phase 10 scope

Provider activation & delivery hardening (roadmap): native Setmore /
Acuity adapters once credentials + representative data exist, real
email provider with domain verification and signed artifact links,
production worker hosting + webhook ingestion, accounting export
column mapping — followed by production hardening (RLS suite expansion,
performance passes, backups, observability, deployment pipeline).
Forecasting/AI remain out of scope until explicitly commissioned; the
forecast-ready datasets are their prepared input.

**Phase 9 stops here. No AI, no forecasting, no anomaly detection, no
natural-language querying, no recommendations, no accounting or
payroll-provider integrations, no production deployment.**
