# Cohort Analysis

First-visit client cohorts — `src/lib/analytics/cohorts/cohorts.ts`,
`/analytics/cohorts`, `cohort:read`.

## Definitions reused, not invented

- **Cohort assignment**: the month of a client's first completed visit,
  from the engine's lifetime client-history map — the same
  `firstVisit` data behind `new_clients`. No new retention formula
  exists in the cohort layer.
- **Activity**: a client is active in a month when they have ≥ 1
  completed appointment in it. Cells count **distinct clients, never
  appointments** (documented in the UI).
- Cohort membership is organization-lifetime; a department filter
  narrows *activity* to that department while cohort identity stays
  org-level (stated on the page).

## Privacy

- No client names anywhere in cohort analytics — counts and month keys
  only. Row-level client access stays inside the Clients area for
  authorized roles.
- Appointments with missing client identity are excluded and the count
  is disclosed ("N appointment(s) excluded for missing client
  identity") — never silently dropped.
- **Small-cohort suppression** is built in (`suppressionThreshold`):
  cells with 1..threshold−1 clients render a suppression marker instead
  of the number. The production threshold is an open business decision
  (INPUTS_REQUIRED) — it currently defaults to off in the UI and the
  mechanism is unit-tested.

## Rendering

The heat map is an HTML **table** (screen-reader and keyboard accessible
by construction); shading intensity is redundant with the printed number
— color never carries meaning alone. Windows: 3–12 whole calendar months
ending with the selected period's end month.

## Client-history scan status

The engine's dataset loader still scans lifetime completed appointments
per session to build first/last-visit maps (flagged since Phase 5).
Measured against the dev database in Phase 9 (see PHASE_9_REPORT.md),
the scan stays well inside interactive latency, so no materialization
was added. If production volume changes that, the loader comment marks
the boundary where a governed, reconciled materialization slots in —
it would remain a cache of engine output, never independent truth.
