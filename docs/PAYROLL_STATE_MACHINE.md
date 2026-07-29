# Payroll Run State Machine

Enforced in the database (`app.payroll_run_transition_guard`, before-update
trigger on `payroll_runs`) — the application repeats the checks for
friendly errors, but the trigger is authoritative.

```
draft ──► calculating ──► needs_review ──► ready_for_approval ──► approved ──► posted ──► locked
  │            │             │  ▲   │              │  ▲              │           │  │        │
  ▼            ▼             ▼  │   ▼              ▼  │              ▼           │  ▼        ▼
voided       failed       voided └─ calculating  needs_review ◄──────┘           │ reopened ◄┘
               │  ▲        failed                (return)                        ▼   │
               ▼  │                                                        superseded│
           calculating ◄────────────────────────────── reopened ◄────────────────────┘
             (retry)                                  (calculating | needs_review | voided)
```

| From | Allowed to |
| --- | --- |
| draft | calculating, voided |
| calculating | needs_review, ready_for_approval, failed |
| needs_review | calculating, ready_for_approval, voided, failed |
| ready_for_approval | approved, needs_review, calculating |
| approved | posted, needs_review |
| posted | locked, reopened, superseded |
| locked | reopened, superseded |
| reopened | calculating, needs_review, voided |
| failed | calculating, voided |
| superseded / voided | **terminal** |

Additional guards: `locked` requires coming from `posted`; a transition to
`posted` with `posted_at` already set raises `payroll_already_posted`
(reopen clears the posting marks — see below). A partial unique index
allows only **one** run per org+period outside `superseded/voided/failed`.

## Workflow semantics

- **calculate** (`payroll:calculate`): draft/needs_review/reopened/failed →
  calculating → needs_review. First run freezes the appointment cutoff;
  "recalculate with refreshed cutoff" is an explicit choice.
- **review** (`payroll:review`): per-trainer summaries carry
  `review_status`; issues are resolved/acknowledged with a mandatory
  reason. Blocking issues can never be "acknowledged" away.
- **submit for approval** (`payroll:review`): requires zero open blocking
  issues AND every trainer summary reviewed.
- **approve** (`payroll:approve`): records approver identity/time.
- **post** (RPC, `payroll:post`): re-checks approved status and zero open
  blocking issues in-transaction, writes a versioned snapshot with a
  sha256 over ordered `line_id:amount` pairs, freezes all lines
  (`app.protect_payroll_line` blocks update/delete outside mutable
  states), and arms the dependency guards.
- **lock** (RPC, `payroll:lock`): posted → locked (export/read-only
  hardening; platform_admin + workspace_admin only).
- **reopen** (RPC, `payroll:reopen`, platform_admin only, reason ≥ 5
  chars): posted/locked → reopened. Clears approval AND posting/locking
  marks (migration 16 — otherwise the double-post guard would make
  re-posting impossible); **snapshots are preserved untouched**, so every
  previously posted state remains inspectable. The run must be
  recalculated, re-reviewed, re-approved, and re-posted (snapshot v2, v3…).
- **supersede** (RPC, `payroll:reopen` authority): posted/locked →
  superseded + atomically creates the replacement draft (`run_number + 1`,
  bidirectional links) and marks prior exports superseded. Use when the
  original was already distributed.
- **void** (RPC, `payroll:void`, reason required): draft/needs_review/
  reopened/failed only. Posted work can never be voided — only reopened or
  superseded.
- **failed**: calculation errors store a sanitized `failure_code`; no
  partial results are presented as complete, and the run is recalculable.

Every transition writes `payroll_run_events` (actor, from/to, reason) and
the high-risk ones also write `audit_events`.

## Choice: reopen mutates the same run; supersede replaces it

Reopening keeps one run identity per pay cycle with full snapshot history
per posting — right for "we posted, then found an error before paying
anyone". Supersession creates a new run and flags prior exports — right
for "statements already went out". Both paths preserve every posted
snapshot; nothing financial is ever destroyed.
