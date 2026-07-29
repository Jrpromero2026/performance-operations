# Payroll Calculation Engine (`calc-v1`)

`src/lib/payroll/` — pure TypeScript, no database access, 100% unit-testable.

## Principles

1. **Deterministic.** Same ledger + configuration → identical lines,
   issues, and totals. Inputs are sorted (appointments by start/id,
   trainers by id); traces contain no timestamps; the engine version is
   stamped on every line (`calculation_formula_version`).
2. **Integer-only money.** Cents and basis points everywhere. Rounding
   happens on exact integer rationals (`roundRational(numerator,
   denominator, method)`) — floats never touch money.
3. **Fail closed.** Anything unresolved produces a `blocked` line (0¢) and
   a blocking issue: missing plan, missing rule, missing `basis_type`,
   criteria that don't constrain `canonical_status` (cancellation/no-show
   pay is an unresolved business rule — see
   business-rules/payroll-rule-gaps.md), malformed criteria, missing
   source amounts, tier gaps, unresolved rounding scope, roles without a
   rule mapping, methods that cannot be paid from the ledger.
4. **Transparent.** Every line carries a JSON trace (`{version, method,
   steps[]}`) with the basis, rate, rounding method, and each derivation
   step — including exclusions ("excluded: canonical_status in
   [completed]") and per-trainer rounding reconciliation.

## Rounding (`rounding.ts`)

Methods: `half_away_from_zero` (default), `half_up`, `half_even`, `floor`,
`ceiling`, `truncate`. Scope (`per_line` default | `per_trainer`) is
declared on the plan version; percentage-method plans with **no** declared
scope are blocked. `per_trainer` scope keeps per-line roundings and lets
the **last** percentage line absorb the difference so the trainer total
equals `round(Σ exact)` — recorded in that line's trace.

## Eligibility (`eligibility.ts`)

Rule criteria are structured JSON, not free-form logic:

```json
{ "conditions": [
    { "field": "canonical_status", "op": "in",  "value": ["completed"] },
    { "field": "duration_minutes", "op": "gte", "value": 30 }
] }
```

Fields: canonical_status, service_id, department_id, duration_minutes,
participant_count, payment_status. Operators: eq, neq, in, not_in, gte,
lte. All conditions AND together. Unknown fields/operators/type mismatches
**block** (never silently pass); a failing condition **excludes** with the
failing condition recorded. Revenue-based rules must positively constrain
`canonical_status` (`eq`/`in`) or the line blocks.

## Typed evaluators (`evaluators.ts`)

One evaluator per method — no generic untyped fallback:

| Method | Evaluator | Basis |
| --- | --- | --- |
| flat_per_session | `evaluateFlatPerSession` | session_rate amount × 1 |
| hourly | `evaluateHourlySession` | minutes (assignment override wins) × hourly_rate ÷ 60 |
| percentage_of_revenue | `evaluatePercentageSession` | declared basis × revenue_rate bp |
| revenue_commission (tier_behavior = not_applicable) | `evaluatePercentageSession` | same |
| revenue_commission (cliff / marginal) | `evaluateTierBasisSession` + period-level `computeCliffCommission` / `computeMarginalCommission` | per-session eligible basis accumulates; ONE commission_tier summary line per trainer |
| team_training_rate / head_coach_rate / assistant_coach_rate | `evaluateTeamRole` | flat per session or % of declared basis, per assignment role |
| evaluation_bonus | `evaluateEvaluationBonus` | flat per eligible session |
| manual time | engine (purpose → hourly/admin_hourly plan) | approved minutes × rate ÷ 60 |
| adjustments | engine | amount ≥ 0; sign carried by type (deduction negative) |
| package_sale_commission, nutrition_client_rate, admin_hourly/manual_* as session methods | — | blocked: not evaluable from the appointment ledger |

### Cliff vs marginal (U1c)

- **Cliff**: the single tier containing the period basis applies its rate
  to the **entire** basis. A basis not covered by any tier blocks.
- **Marginal**: each tier's rate applies only to the basis inside its
  range; slices are summed as exact numerators and rounded **once**. Gaps
  in coverage block.
- The two produce different pay on identical inputs (unit-tested); which
  one an organization uses is configuration (`tier_behavior`), and
  Timberhill's answer is still an open intake item — nothing is seeded.

## Multi-trainer sessions

Explicit `appointment_trainer_assignments` replace the ledger's implicit
primary trainer. Roles map to plans: coach roles prefer the trainer's
`team_training`-purpose plan (falling back to `primary`); `observer` and
`non_compensated` are never paid; `support_coach` has no rule mapping and
blocks (fail closed). Per-participant `compensated_minutes` override the
appointment duration for hourly evaluation.

## Reconciliation

Per trainer: `finalGross = commission + flat + hourly + team +
evaluation bonuses + signed adjustments`, and the engine throws
(`EngineReconciliationError` → run `failed`) if that ever differs from the
sum of its calculated lines. Run totals are the sum of trainer totals and
are re-verified in tests (`grossTotal + adjustmentTotal = finalTotal =
Σ lines`).
