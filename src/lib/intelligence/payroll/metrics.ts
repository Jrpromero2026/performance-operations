/**
 * Payroll metrics. Source of truth: FINALIZED (posted/locked) payroll runs
 * — draft calculations are never reported. All values derive from the ONE
 * `summarizePayroll` aggregation; per-session/per-hour ratios use the
 * payroll engine's own counted sessions/minutes so they reconcile exactly
 * to posted payroll.
 */

import { growthBp, perHour, perUnit, ratioBp } from "../shared/math";
import {
  healthyValue,
  payrollGate,
  type EvalContext,
  type MetricEvaluator,
  type MetricOutcome,
} from "../shared/evaluate";
import {
  INTELLIGENCE_VERSION,
  type MetricDefinition,
} from "../shared/types";

function def(
  partial: Omit<MetricDefinition, "version" | "requiredPermission" | "selfPermission" | "scopes"> &
    Partial<Pick<MetricDefinition, "scopes">>,
): MetricDefinition {
  return {
    requiredPermission: "payroll:read",
    selfPermission: "payroll:read_self",
    scopes: ["organization", "trainer"],
    version: INTELLIGENCE_VERSION,
    ...partial,
  };
}

export const PAYROLL_METRICS: MetricDefinition[] = [
  def({
    id: "payroll_gross_cents",
    name: "Gross payroll",
    category: "payroll",
    definition:
      "Final gross compensation from finalized payroll runs whose periods overlap the range.",
    formula: "Σ final_gross_compensation_cents(finalized runs)",
    unit: "cents",
    dependencies: ["dataset:payroll"],
  }),
  def({
    id: "payroll_pct_of_revenue_bp",
    name: "Payroll %",
    category: "payroll",
    definition: "Gross payroll as a share of listed revenue.",
    formula: "payroll_gross_cents ÷ revenue_listed_cents × 10000",
    unit: "rate_bp",
    dependencies: ["payroll_gross_cents", "revenue_listed_cents"],
  }),
  def({
    id: "payroll_per_session_cents",
    name: "Payroll per session",
    category: "payroll",
    definition:
      "Gross payroll divided by the sessions the payroll engine counted (reconciles to posted payroll, not the ledger).",
    formula: "payroll_gross_cents ÷ payroll_completed_sessions",
    unit: "cents_per_session",
    dependencies: ["payroll_gross_cents", "dataset:payroll"],
  }),
  def({
    id: "payroll_per_hour_cents",
    name: "Payroll per hour",
    category: "payroll",
    definition: "Gross payroll per compensated hour from finalized runs.",
    formula: "payroll_gross_cents × 60 ÷ compensated_minutes",
    unit: "cents_per_hour",
    dependencies: ["payroll_gross_cents", "dataset:payroll"],
  }),
  def({
    id: "payroll_bonus_cents",
    name: "Payroll bonuses",
    category: "payroll",
    definition: "Bonus totals (evaluation bonuses + positive adjustments).",
    formula: "Σ bonus_total_cents(finalized runs)",
    unit: "cents",
    dependencies: ["dataset:payroll"],
  }),
  def({
    id: "payroll_deduction_cents",
    name: "Payroll deductions",
    category: "payroll",
    definition: "Deduction magnitudes from finalized runs.",
    formula: "Σ deduction_total_cents(finalized runs)",
    unit: "cents",
    dependencies: ["dataset:payroll"],
  }),
  def({
    id: "payroll_adjustment_net_cents",
    name: "Payroll adjustments (net)",
    category: "payroll",
    definition: "Signed adjustment total from finalized runs.",
    formula: "Σ adjustment_total_cents(finalized runs)",
    unit: "cents",
    dependencies: ["dataset:payroll"],
  }),
  def({
    id: "payroll_growth_bp",
    name: "Payroll growth",
    category: "growth",
    definition:
      "Change in gross payroll vs finalized runs of the previous equal-length window.",
    formula: "(gross − previous_gross) ÷ previous_gross × 10000",
    unit: "rate_bp",
    dependencies: ["payroll_gross_cents"],
  }),
  def({
    id: "payroll_variance_cents",
    name: "Payroll variance",
    category: "payroll",
    definition:
      "Signed cents difference between this window's gross payroll and the previous window's.",
    formula: "payroll_gross_cents − previous_payroll_gross_cents",
    unit: "cents",
    dependencies: ["payroll_gross_cents"],
  }),
];

function gated(compute: (ctx: EvalContext) => MetricOutcome): MetricEvaluator {
  return (ctx) => payrollGate(ctx) ?? compute(ctx);
}

export const PAYROLL_EVALUATORS: Record<string, MetricEvaluator> = {
  payroll_gross_cents: gated((c) =>
    healthyValue(c.payrollSummary.grossCents, {
      runs: c.payrollSummary.runCount,
      trainers: c.payrollSummary.trainerCount,
    }),
  ),
  payroll_pct_of_revenue_bp: gated((c) => {
    const gate = c.dataset.flags.hasPostedImports
      ? null
      : ({
          value: null,
          health: "waiting_for_imports",
          reasons: ["Listed revenue requires posted imports."],
        } satisfies MetricOutcome);
    if (gate) return gate;
    return healthyValue(
      ratioBp(c.payrollSummary.grossCents, c.summary.completedListedCents),
      {
        payroll_cents: c.payrollSummary.grossCents,
        revenue_cents: c.summary.completedListedCents,
      },
    );
  }),
  payroll_per_session_cents: gated((c) =>
    healthyValue(
      perUnit(c.payrollSummary.grossCents, c.payrollSummary.completedSessionCount),
      {
        payroll_cents: c.payrollSummary.grossCents,
        payroll_sessions: c.payrollSummary.completedSessionCount,
      },
    ),
  ),
  payroll_per_hour_cents: gated((c) =>
    healthyValue(
      perHour(c.payrollSummary.grossCents, c.payrollSummary.compensatedMinutes),
      {
        payroll_cents: c.payrollSummary.grossCents,
        compensated_minutes: c.payrollSummary.compensatedMinutes,
      },
    ),
  ),
  payroll_bonus_cents: gated((c) => healthyValue(c.payrollSummary.bonusCents)),
  payroll_deduction_cents: gated((c) =>
    healthyValue(c.payrollSummary.deductionCents),
  ),
  payroll_adjustment_net_cents: gated((c) =>
    healthyValue(c.payrollSummary.adjustmentCents),
  ),
  payroll_growth_bp: gated((c) => {
    if (c.previousPayroll.length === 0) {
      return {
        value: null,
        health: "incomplete",
        reasons: [
          "No finalized payroll run overlaps the previous window — growth is undefined.",
        ],
      };
    }
    return healthyValue(
      growthBp(c.payrollSummary.grossCents, c.previousPayrollSummary.grossCents),
      {
        current_cents: c.payrollSummary.grossCents,
        previous_cents: c.previousPayrollSummary.grossCents,
      },
    );
  }),
  payroll_variance_cents: gated((c) => {
    if (c.previousPayroll.length === 0) {
      return {
        value: null,
        health: "incomplete",
        reasons: [
          "No finalized payroll run overlaps the previous window — variance is undefined.",
        ],
      };
    }
    return healthyValue(
      c.payrollSummary.grossCents - c.previousPayrollSummary.grossCents,
      {
        current_cents: c.payrollSummary.grossCents,
        previous_cents: c.previousPayrollSummary.grossCents,
      },
    );
  }),
};
