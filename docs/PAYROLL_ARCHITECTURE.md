# Payroll Architecture

Phase 4 adds a payroll **preparation** engine on top of the canonical
appointment ledger (Phase 3) and the compensation configuration (Phase 2).
It computes **gross compensation only** — never net pay, taxes, or
withholdings — and never invents amounts: every cent traces to a canonical
appointment, an approved manual time entry, or an approved adjustment.

## Layers

```
canonical ledger (appointments, assignments)      configuration (plans,
approved manual time + adjustments                 rules, tiers, periods)
        │                                                  │
        └────────────► loader (src/lib/payroll/run.ts) ◄───┘
                              │  EngineInput (plain data)
                              ▼
              pure engine (src/lib/payroll/engine.ts)
              rounding · eligibility · typed evaluators
                              │  EngineResult (lines/issues/totals)
                              ▼
            persister (run.ts) — chunked writes, stable recalc
                              │
                              ▼
   payroll_runs / payroll_trainer_summaries / payroll_calculation_lines
   payroll_issues / payroll_snapshots / payroll_exports  (RLS + triggers)
```

- **Loader** (`loadEngineData`): reads active in-period appointments up to
  the run's *appointment cutoff*, explicit multi-trainer assignments (with
  the ledger's primary trainer as fallback participation), published plan
  versions with rules/tiers, approved manual time, and approved adjustments.
  Unresolvable configuration (overlapping assignments, unpublished plans,
  missing approved minutes) becomes **loader-level blocking issues**, never
  a silent guess.
- **Engine** (`calculatePayroll`): pure and deterministic — same inputs,
  same outputs, stable ordering, integer-only money, versioned as
  `calc-v1`. See PAYROLL_CALCULATION_ENGINE.md.
- **Persister** (`persistEngineResult`): replaces summaries/lines/issues in
  ≤500-row chunks, marks consumed time/adjustments `included` (and releases
  ones no longer consumed), updates run totals, and appends run events.

## Data model (migrations 14–17)

| Table | Purpose |
| --- | --- |
| `payroll_runs` | One prep cycle per org+period; DB-enforced state machine; totals; supersession links; partial unique index = one non-terminated run per org+period |
| `payroll_run_events` | Append-only transition log |
| `payroll_trainer_summaries` | Per-trainer category totals + review status |
| `payroll_calculation_lines` | Every atom of pay (or exclusion) with inputs, rates, rounding, and a JSON trace; frozen once the run leaves mutable states |
| `payroll_issues` | Blocking/warning/info findings with reasoned resolution |
| `manual_time_entries` | Non-session work; draft→submitted→approved→included lifecycle |
| `payroll_adjustments` | Bonuses/deductions/corrections/reimbursements/carry-forwards; approval + immutability once approved |
| `payroll_snapshots` | Immutable posted payloads, versioned, with a sha256 over ordered line ids:amounts |
| `payroll_exports` | Record of statement/CSV generation (with snapshot version) |
| `appointment_trainer_assignments` | Multi-trainer session roles (primary, head/assistant/support coach, observer, non_compensated) |

`compensation_plan_versions.rounding_scope` and
`compensation_rules.basis_type` / `criteria` (structured eligibility JSON)
were added additively to the Phase 2 configuration.

## Late-arriving appointments

The first calculation freezes `source_appointment_cutoff_at`. Appointments
posted to the ledger after the cutoff are **counted and surfaced as a
warning issue** but not paid; an operator explicitly recalculates with a
refreshed cutoff (audited) or leaves them for the next period's run. This
keeps recalculation reproducible and makes "the numbers changed" an
explicit, attributable event.

## Run orchestration

Server actions (`src/lib/actions/payroll.ts`) re-derive the actor's
permissions per request, use optimistic status-checked updates (a
transition raced by another user fails cleanly), and delegate the
dangerous transitions — post, lock, reopen, void, supersede — to
security-definer RPCs that re-validate permission, state, and blocking
issues inside the database transaction. Calculation failures are recorded
as `failed` with a sanitized failure code; partial results are never
presented as complete.
