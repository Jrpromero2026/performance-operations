# Presentation Mode

`/analytics/presentation` — full-screen, print-ready rendering of the
saved executive scorecard composition. Permission:
`analytics:presentation`.

## One calculation path

Presentation mode composes the SAME `AnalyticsService` +
`composeScorecard` output as `/analytics/executive` — same numbers,
same health, same finality. There is no presentation-specific
calculation or report path.

## What it renders

- Title block: organization, period, **Confidential — internal use
  only**, generated timestamp, engine/analytics versions, and an
  explicit **Final (closed period)** or **Not final — figures may
  change** status.
- Deterministic analytical summaries (template statements from engine
  results — see the Analytical Summaries section of
  ANALYTICS_ARCHITECTURE.md; never AI).
- Scorecard sections as print-typeset tables (current / previous period
  / prior year), unavailable metrics labeled inline.
- Rolling-period and department charts from the chart system.

## Chrome and output

A client overlay provides Exit, Fullscreen (Fullscreen API), and
**Print / PDF** — PDF export is the browser's print dialog. Sections use
`print:break-inside-avoid` for page-break control; the control bar hides
in print. Organization branding beyond the name awaits assets
(INPUTS_REQUIRED).

Board/executive distribution flows through the report-package and
subscription machinery (`board_presentation_package`), which freezes the
same composition as a versioned, hashed analytics package.
