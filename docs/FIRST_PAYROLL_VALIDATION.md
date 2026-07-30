# First Payroll Validation

The first payroll run in each pilot organization is a **reconciliation
exercise, not an authoritative payroll**. Nothing is treated as correct
until it matches known real payroll or every difference is formally
accepted in writing.

## Choosing the validation period

Pick a **completed historical period with known, already-paid results**
(recommendation: the most recent fully-paid month with a clean Setmore
export — recent enough that rules haven't changed, old enough that the
real payroll numbers are settled). Do the same later for G3 with a known
coach-payout period.

## Workflow

1. Create the reporting period for those exact dates
   (`/configuration/reporting-periods` → New period).
2. Import the exact source export for the period per
   [PILOT_IMPORT_RUNBOOK.md](PILOT_IMPORT_RUNBOOK.md) — resolve
   mappings, validate totals, approve, **Post rows**.
3. Confirm compensation plans/assignments cover every paid trainer with
   the correct **effective dates** (a plan effective after the period
   start pays nothing for earlier sessions — that's intended).
4. `/payroll/new` → create the run for the period → run page →
   **Calculate**.
5. Treat the calculated run as the **preview**. Open **Review**: every
   line, exclusion, and calculation trace is visible per trainer.
6. Build the reconciliation table (keep it in your pilot log):

   | Trainer | Expected (real payroll) | Calculated | Variance | Reason |
   | --- | --- | --- | --- | --- |

7. **Investigate every non-zero variance.** Known causes to check, in
   order:
   - rule effective dates (step 3);
   - tier behavior — cliff vs marginal (open decision U1c; if the
     variance pattern matches the other interpretation, that IS the
     answer to U1c — record it and update the plan);
   - commission basis (listed vs paid amount);
   - split/multi-coach sessions (G3: sessions credited to one coach
     until split rules are configured);
   - cancellations / late-cancellations / no-shows (status mappings and
     whether the real payroll paid them);
   - missing or double rows (import Duplicates/exclusions);
   - adjustments and manual time (`/payroll/adjustments`,
     `/payroll/time` — enter real ones, approve them, **Calculate**
     again).
8. Iterate: fix configuration → **Calculate** again (recalculation is
   cheap and versioned) until the table reconciles.
9. Only then: **Submit for approval** → **Approve run** → **Post run**.
   Posting freezes the payroll snapshot; statements and the register
   CSV export become the frozen evidence.
10. Compare the exported register (`/payroll/<run>/export`) totals to
    the reconciliation table one final time.
11. **Do not close the period** until payroll matches or every
    difference carries a written, accepted reason (period close will
    reference this run as frozen evidence).

## Go / No-Go criteria

**GO** when ALL of:
- material totals reconcile trainer-by-trainer;
- every variance has a written, accepted explanation;
- no unresolved authorization issue (nobody saw or approved what they
  shouldn't);
- no unresolved posting issue (ledger counts match the source export);
- exported register and statements match the frozen posted run.

**NO-GO** if ANY of:
- unexplained payroll variance of any size;
- a paid trainer with no compensation assignment (fail-closed blocking
  issue) or an unconfirmed trainer-specific rule;
- incorrect service mapping discovered post-hoc;
- duplicate appointments posted;
- unresolved status mapping (e.g. late-cancel treated as completed);
- any sign of cross-organization data (sandbox fixtures appearing in
  pilot surfaces);
- close artifacts that don't match the frozen payroll.

On NO-GO: reverse/void through the governed paths (Reverse batch…,
Reopen/Void run with recorded reasons), fix configuration, and repeat.
The system is built for exactly this loop — nothing is lost by
iterating.
