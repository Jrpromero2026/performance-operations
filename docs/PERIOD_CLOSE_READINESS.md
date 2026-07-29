# Period Close Readiness

Readiness is a structured checklist computed by
`classifyCloseChecks` (`src/lib/close/checks.ts`, pure) over inputs
assembled by `evaluateCloseReadiness` (`src/lib/close/readiness.ts`).
Numbers come from their owning engines — the loader batches pipeline
queries and opens exactly ONE `IntelligenceSession` for the four
engine readiness metrics. **Missing information never passes**: absent
inputs fail their checks.

## Check anatomy

Every check carries: `code`, `category`, `severity`
(`blocking`/`warning`/`info`), `status` (`pass`/`fail`), `definition`,
`source` (system of record), `entityId`, `explanation`, `action`,
deep `link`, `waivable`, `acknowledged`, `resolutionState`
(`resolved`/`open`/`acknowledged`), `lastEvaluatedAt`.

- **Blocking** checks are never waivable — they must be resolved.
- **Warning** checks are waivable via an acknowledgement with a note
  (`require_ack_note` policy) recorded into the manifest.
- **Info** checks inform; they never block readiness.

## Categories and checks (~29)

- **Reporting period**: exists/org-match, valid dates, status `open`.
- **Imports** (org-scoped): none processing / awaiting review / awaiting
  approval / approved-unposted (blocking); failed batches dispositioned
  and reversed-in-period (warnings).
- **Appointments**: open late-arrival payroll issues (blocking); manual
  corrections reviewed and zero-activity period (warnings).
- **Payroll**: finalized run per policy (`posted` or `locked`) —
  required ONLY when the period has active appointments; no unfinished
  runs; not stale vs the ledger; snapshot totals reconcile; no pending
  adjustments/time entries (all blocking); was-reopened history
  (warning).
- **Configuration** (engine readiness): compensation coverage, trainer
  assignment coverage, reporting-period coverage (warnings),
  service-alias coverage (info), paid-amounts availability (warning),
  and the **permanent** `revenue_definitions_unapproved` warning —
  eligible/recognized revenue have no approved business definition, so
  every close explicitly acknowledges that limitation.
- **Reporting**: executive package ready (blocking); required exports
  present (blocking — the payroll register is required only when the
  period has activity, since it derives from posted payroll);
  package-regenerated (warning).

## Evaluation semantics

- Every readiness page visit re-evaluates against live state; nothing is
  read from a stored checklist. Results persist only as a summary
  snapshot on the run (`readiness_snapshot` with `evaluated_at`,
  `blocking_codes`, `warning_codes`, counts) while the run is mutable.
- `summarizeChecks` → `readyToClose` = zero blocking AND zero
  unacknowledged warnings. Info failures never block.
- Re-evaluation of a `ready_to_close` run that regressed REVOKES
  readiness (back to `close_review`, review/approval cleared).
- The execute RPC independently re-validates the race-sensitive subset
  (pending imports, payroll state, unacknowledged snapshot warnings,
  artifact integrity) inside the closing transaction.

## Verification

Unit matrix: `tests/unit/close-checks.test.ts` (baseline ready state,
every mutation, acknowledgement semantics, missing-info-never-passes).
Live: SQL suite sections 4–8; e2e steps 2 and 5.
