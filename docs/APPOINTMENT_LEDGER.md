# Performance Operations — Canonical Appointment Ledger

## What a ledger row is

A posted, source-backed appointment occurrence: organization, department,
trainer, client (nullable), service, date/start/end/duration/timezone,
canonical status, record state, source identity (source + external id +
source timestamps), **source-provided financial facts** (listed price /
amount paid / amount due in integer cents, currency, payment status),
participant count, and immutable links to its import batch and row.

Appointments are created ONLY by `app.post_import_batch` — there is no
INSERT policy for users and no other write path.

## Naming discipline for money

Columns are prefixed `source_…_cents` deliberately: they are facts the
scheduling system exported, **not recognized revenue and not
payroll-eligible revenue**. Those concepts arrive in later phases with
their own explicitly named fields; nothing in this phase labels source
price as revenue.

## Immutability and change control

- **Trigger-frozen evidence:** source, external id, import linkage,
  posted_at, source timestamps, and all source amounts can never change
  (`app.protect_appointment`), and `record_state` can never return to
  active.
- **Status corrections** go through the correction workflow only:
  `appointment:correct` + mandatory reason → canonical_status update +
  append-only `appointment_corrections` + `appointment_status_history` +
  audit event. No free-form edits exist in the UI or the API surface.
- **No hard deletion:** no DELETE policies on any ledger table.
- **Record states:** `active`, `superseded` (reserved for future source
  updates), `reversed`, `voided`.

## Multi-participant / multi-coach readiness

`appointment_participants` exists from day one (the matched client also
gets a participant row at posting), with a role column, so group sessions,
classes, and multi-athlete or two-coach models can be added without a
schema break. The observed Setmore data contained no multi-participant
rows; the UI intentionally does not overbuild for them yet. Head/assistant
coach roles would extend participants (or a sibling trainer-assignment
table) — the data model does not preclude either.

## Reversal

`app.reverse_import_batch` (`import:reverse` + mandatory reason): marks the
batch's active appointments `reversed`, appends status-history entries,
sets the batch `reversed`, writes audit events — atomically, at most once.
Rows, files, matches, approvals, and audit records are all preserved.
**Phase 4 dependency guard (documented obligation):** once payroll tables
exist, reversal MUST refuse batches whose appointments are referenced by
payroll line items until a controlled dependency workflow releases them.
Reversed appointments must be excluded from all future payroll/KPI
calculations (`record_state = 'active'` is the only calculable state).

## Viewer

`/appointments` filters by date range, status, source, record state, batch,
and the selected reporting period; server-paginated. Detail pages show the
canonical record beside the verbatim original row, match methods, source
links, status history, and correction history. Trainer self-scope (a
trainer sees only their own posted rows) is enforced by RLS and
live-tested; department-scoped roles are narrowed to their departments.
