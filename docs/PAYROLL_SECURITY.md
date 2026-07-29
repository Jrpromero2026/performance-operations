# Payroll Security Model

Deny-by-default, enforced three times: RLS policies (authoritative),
security-definer RPCs (re-validate inside the transaction), and server
actions (friendly errors; never trusted alone).

## Permissions (migration 14 + Phase 2)

| Permission | platform_admin | workspace_admin | payroll_manager | trainer |
| --- | :-: | :-: | :-: | :-: |
| payroll:read / review / create / calculate / approve / post / export / view_calculation_trace | ✓ | ✓ | ✓ | – |
| payroll:manage_adjustments / approve_adjustments / manage_time / approve_time | ✓ | ✓ | ✓ | manage_time only |
| payroll:lock / void | ✓ | ✓ | – | – |
| payroll:reopen | ✓ | – | – | – |
| payroll:read_self | ✓ | – | – | ✓ |

`src/lib/authz/permissions.ts` mirrors the database grants and is
unit-tested; the database remains the source of truth.

## Row-level security

- All ten payroll tables: RLS **enabled + forced**, org-scoped through
  `app.has_permission_in(organization_id, …)`.
- Trainer self-scope on summaries and calculation lines requires BOTH
  `trainer_id = app.current_trainer_id()` AND the run being posted/locked,
  checked via the security-definer `app.payroll_run_is_finalized()`
  (migration 17 — a plain EXISTS on `payroll_runs` was itself RLS-filtered
  and never granted; caught by the live checks). Draft numbers are never
  visible to trainers.
- `payroll_snapshots` has **no** user insert/update/delete policy — rows
  exist only via the posting RPC.
- Manual time: trainers may insert/update only their own rows; approvers
  (payroll:approve_time) manage all.

## Separation of duties

- Nobody approves or rejects their **own** time entry or adjustment
  (submitter/requester and trainer identity both checked).
- Review (payroll:review), approval (payroll:approve), posting
  (payroll:post), locking, and reopening are separately grantable;
  reopening posted payroll is platform-admin only.
- Approved adjustments freeze amount/type/trainer at the database level
  (`app.protect_adjustment`); corrections are new adjustments, not edits.
- `included` time/adjustments are immutable while their run is frozen
  (`app.protect_time_entry` / `app.protect_adjustment`).

## Immutability and evidence

- Calculation lines are frozen the moment a run leaves mutable states
  (`app.protect_payroll_line` on update AND delete).
- Posting writes `payroll_snapshots(payload, lines_sha256)` — a
  tamper-evident, versioned record of what was posted.
- Every lifecycle action, issue resolution, export, and assignment change
  is audited with actor identity; failure messages stored on runs are
  sanitized codes, never raw SQL or amounts.

## Privacy

Statements and exports identify sessions by date/time and service only —
client identities never appear in payroll statements, CSVs, or traces.
Payroll pages never expose Supabase errors directly; RPC errors map to
fixed friendly strings.

## Live verification

`tests/rls/phase4-live-checks.sql` (23 steps, impersonation, rolls back)
executed against the dev project: cross-org denial, unauthorized RPC
rejection, self-scope timing, freeze triggers, dependency guards, reopen
authority, terminal states. It caught the two real defects fixed by
migrations 16 and 17.
