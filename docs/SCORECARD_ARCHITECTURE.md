# Scorecard Architecture

Code-defined default scorecards composed per viewer —
`src/lib/analytics/scorecards/` and `/analytics/scorecards`.

## Defaults

Six scorecards ship as code (`definitions.ts`): Organization Executive,
Department, Trainer, Payroll Operations, Period Close, Integration
Operations. Every item references a **catalog metric id** with a display
label — nothing else. Custom compositions belong to the dashboard
builder; an org-managed `scorecard_definitions` table is deferred until
a business owner asks for one (decision log).

Naming discipline: source amounts are labeled "Source-listed amount" /
"Source-paid amount" — never "revenue".

## Composition (`compose.ts`)

`composeScorecard(service, definition, window, scope, goals)` produces
per row:

- current engine value + health,
- previous-period and prior-year comparisons (full eligibility
  semantics — see MULTI_PERIOD_COMPARISONS.md),
- the matching **active** goal for the metric + scope with derived
  progress (goal owner shown),
- direction metadata, unit, deep link.

One `getMultiPeriodComparison` call batches every metric over one
session; goal rows reuse the same memoized results.

## Permission behavior

Scope selection narrows through the engine:

- the executive card composes at organization scope — each metric the
  viewer cannot read renders `unavailable` with the engine's reason;
- the department card requires a department pick; department-scoped
  managers can only resolve their own departments (engine denial
  otherwise);
- the trainer card offers a roster picker to org-read roles; a
  trainer-role viewer has no roster and composes with the engine's
  forced self-scope — **their own slice only**. Peer payroll and peer
  performance are never reachable through composition.
- Payroll rows use posted/locked runs only (`waiting_for_payroll`
  otherwise); trainers see only their own posted payroll via
  `payroll:read_self`.

No public trainer ranking is rendered by default and no composite
trainer score exists (explicitly out of scope until approved).

## Close / integration sections

The Period Close and Integration Operations scorecards compose readiness
and import-health **metrics** from the catalog; live pipeline state
(close runs, connections, jobs, deliveries) remains on the operations
surfaces (`/period-close`, `/integrations`) that already render it —
scorecards link rather than duplicate.
