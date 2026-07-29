# Post-Close Change Guards

Once a period is closed, material operational changes inside it are
blocked at the DATABASE level (migrations 20–21). Every guard error
carries the dependent close-run id and a reopen deep link hint
(`/period-close/<run-id>`), so the failure explains its own remedy.

## Guarded entities

| Entity | Trigger | Blocked in a closed period | Still allowed |
| --- | --- | --- | --- |
| `appointments` | `app.appointments_close_guard` | INSERT dated inside the period; UPDATE of material fields (`canonical_status`, `record_state`, trainer/department/service, `start_at`, `duration_minutes`, `appointment_date`, source listed/paid cents) — checked against OLD and NEW dates | `notes`, `payment_status` (harmless metadata) |
| `payroll_runs` | `app.payroll_close_guard` | INSERT for the period; any status transition | non-lifecycle column touches |
| `manual_time_entries` | `app.period_scoped_close_guard` | INSERT/UPDATE for the period | — |
| `payroll_adjustments` | `app.period_scoped_close_guard` | INSERT/UPDATE for the period | — |
| `reporting_periods` | `app.protect_closed_period` | any transition into/out of `closed` outside the close RPCs; date/type changes while closed | label/other metadata |

Errors: `appointment_in_closed_period:<runid>`,
`payroll_in_closed_period:<runid>`, `record_in_closed_period:<runid>`,
`period_close_controlled`, `closed_period_immutable` — all errcode
42501.

## The GUC gate

`reporting_periods.status = 'closed'` is settable/clearable ONLY while
the transaction-local GUC `app.period_close_op = '1'` is active. The
close RPCs set it immediately before their period update and **clear it
immediately after** (migration 21): the Phase 7 live SQL suite showed
that a transaction-scoped GUC would otherwise leave the bypass active
for later statements in the same transaction. Not exploitable through
PostgREST (one transaction per RPC), fixed as defense in depth.

## Layering with payroll guards

Phase 4 guards (appointments protected by frozen payroll, import
reversal blocked by payroll dependencies) remain active and independent.
An appointment inside a closed period that also backs posted payroll is
protected by BOTH; reopening the period releases only the close guard —
payroll protection persists until payroll itself is reopened/superseded
(coordinated, never automatic).

## Documented gap

Compensation-assignment and plan-version changes are NOT close-guarded:
posted payroll is already frozen, so historical results cannot drift,
but a plan changed after close would affect a future RE-close of the
same period. Recorded as an open business decision (DECISION_LOG.md)
rather than guessed.

Verified by live SQL section 11 (every guard, run-id in errors, notes
allowed) and section 14 (guards release after reopen).
