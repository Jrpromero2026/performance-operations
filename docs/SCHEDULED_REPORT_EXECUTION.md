# Scheduled Report Execution

Phase 7 shipped definitions with execution hard-off; Phase 8 enables
CONTROLLED execution now that a verified worker exists (the CHECK
constraint was dropped in migration 23; each definition still defaults
to `execution_enabled = false` and is toggled only by
`scheduled_report:execute` holders).

## Triggers

Daily / weekly / monthly (UTC-normalized occurrences via the scheduler
tick), plus **Run now** (manual). `period_close` and `custom`
frequencies have no wall-clock occurrence yet (recorded intent only).

## Execution flow (`executeScheduledReport`)

1. Resolve the definition; **re-verify authorization at execution
   time** (`scheduled_report:execute` in the org); disabled or
   execution-off definitions do not run (schedule trigger).
2. **One execution per occurrence, DB-enforced**: inserting the
   `scheduled_report_runs` row (definition + intended_run_at UNIQUE) is
   the gate — a duplicate fire records `skipped`.
3. Resolve the reporting period: the definition's saved view's stored
   period (validated to the org; an inaccessible or stale view FAILS
   SAFELY — no silent substitution), else the most recent period that
   has started.
4. Generate the artifact from current AUTHORIZED sources:
   - `quick_report` → the shared metric-report CSV builder (identical
     bytes to the interactive export), hash recorded;
   - `executive_package` / `payroll_package` → Phase 7 generators
     (versioned, hash-frozen packages);
   - **closed periods deliver the FROZEN finalized package**
     (`is_final = true`) — financial artifacts are never regenerated
     for a closed period; a closed period without one fails explicitly;
   - active-period artifacts are labeled **NOT FINAL** in the artifact,
     the run row, and the UI.
5. Re-resolve recipients against CURRENT members (recipient governance
   — see EMAIL_DELIVERY_ARCHITECTURE.md); deactivated/removed users are
   excluded and recorded as skipped; no silent expansion.
6. Create one `email_delivery_events` row per recipient (DB-idempotent)
   and enqueue a delivery job each.
7. Record the run (artifact refs + hash + finality + skipped
   recipients), update definition bookkeeping, audit, and notify
   `report_delivery:read` holders in-app.

## Scheduler

`enqueueDueSchedules` (worker tick) computes the current occurrence per
frequency and enqueues `scheduled_report_generation` jobs with
occurrence-scoped idempotency keys — repeated ticks are no-ops. The
Phase 7 "execution unavailable" UI was replaced only after this path
was live-verified end-to-end (worker → generation → delivery event →
test-channel acceptance).
