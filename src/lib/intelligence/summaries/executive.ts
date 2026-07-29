/**
 * Executive summary generators — deterministic, structured outputs derived
 * from catalog metrics (never re-implemented formulas, never AI). Ties
 * break alphabetically by label so output is stable.
 */

import { computeBreakdown } from "../shared/breakdowns";
import { buildContext } from "../shared/context";
import type { IntelligenceDataset } from "../shared/facts";
import { METRIC_DEFINITIONS, METRIC_EVALUATORS } from "../catalog";
import type {
  ExecutiveSummaryItem,
  MetricBreakdownRow,
  MetricFilters,
  MetricScope,
  MetricUnit,
} from "../shared/types";

function pick(
  rows: MetricBreakdownRow[],
  direction: "max" | "min",
  minimumMeta?: { key: string; atLeast: number },
): MetricBreakdownRow | null {
  const candidates = rows.filter((r) => {
    if (r.value === null) return false;
    if (minimumMeta) {
      const meta = r.metadata?.[minimumMeta.key];
      if (typeof meta !== "number" || meta < minimumMeta.atLeast) return false;
    }
    return true;
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const diff = direction === "max" ? b.value! - a.value! : a.value! - b.value!;
    return diff !== 0 ? diff : a.label.localeCompare(b.label);
  })[0];
}

function item(
  code: string,
  headline: string,
  winner: MetricBreakdownRow | null,
  unit: MetricUnit,
  basisMetricIds: string[],
  emptyDetail: string,
): ExecutiveSummaryItem {
  if (!winner) {
    return {
      code,
      headline,
      subject: null,
      value: null,
      unit,
      basisMetricIds,
      health: "incomplete",
      detail: emptyDetail,
    };
  }
  return {
    code,
    headline,
    subject: winner.label,
    value: winner.value,
    unit,
    basisMetricIds,
    health: "healthy",
    detail: "",
  };
}

const READINESS_COMPONENTS = [
  "trainer_assignment_coverage_bp",
  "compensation_coverage_bp",
  "service_alias_coverage_bp",
  "reporting_period_coverage_bp",
  "import_health_bp",
  "payroll_readiness_bp",
] as const;

/** Generate the executive summary for an organization scope. */
export function generateExecutiveSummary(
  dataset: IntelligenceDataset,
  scope: MetricScope,
  filters: MetricFilters,
): ExecutiveSummaryItem[] {
  const byDeptRevenue = computeBreakdown(dataset, scope, filters, "revenue_listed_cents", "department");
  const byDeptGrowth = computeBreakdown(dataset, scope, filters, "revenue_growth_bp", "department");
  const byTrainerSessions = computeBreakdown(dataset, scope, filters, "appointments_completed", "trainer");
  const byTrainerCancel = computeBreakdown(dataset, scope, filters, "cancellation_rate_bp", "trainer");
  const byTrainerRph = computeBreakdown(dataset, scope, filters, "revenue_per_hour_cents", "trainer");
  const byTrainerPayrollGrowth = computeBreakdown(dataset, scope, filters, "payroll_growth_bp", "trainer");
  const byTrainerPayrollVariance = computeBreakdown(dataset, scope, filters, "payroll_variance_cents", "trainer");
  const byTrainerSessionGrowth = computeBreakdown(dataset, scope, filters, "session_growth_bp", "trainer");

  const items: ExecutiveSummaryItem[] = [
    item(
      "top_revenue_department",
      "Top revenue department",
      pick(byDeptRevenue.rows, "max"),
      "cents",
      ["revenue_listed_cents"],
      "No department revenue in this window.",
    ),
    item(
      "largest_revenue_increase",
      "Largest revenue increase",
      pick(byDeptGrowth.rows, "max"),
      "rate_bp",
      ["revenue_growth_bp"],
      "No department has comparable revenue in both windows.",
    ),
    item(
      "most_sessions",
      "Most sessions",
      pick(byTrainerSessions.rows, "max"),
      "count",
      ["appointments_completed"],
      "No completed sessions in this window.",
    ),
    item(
      "lowest_cancellation_rate",
      "Lowest cancellation rate",
      // At least 5 booked appointments so tiny samples don't win.
      pick(byTrainerCancel.rows, "min", { key: "denominator", atLeast: 5 }),
      "rate_bp",
      ["cancellation_rate_bp"],
      "No trainer has 5+ booked appointments in this window.",
    ),
    item(
      "highest_revenue_per_hour",
      "Highest revenue per hour",
      pick(byTrainerRph.rows, "max"),
      "cents_per_hour",
      ["revenue_per_hour_cents"],
      "No coaching hours with revenue in this window.",
    ),
    item(
      "highest_payroll_growth",
      "Highest payroll growth",
      pick(byTrainerPayrollGrowth.rows, "max"),
      "rate_bp",
      ["payroll_growth_bp"],
      "Finalized payroll is not available for both windows.",
    ),
    item(
      "largest_payroll_change",
      "Largest payroll change",
      // Largest absolute variance; sort by |value| via mapped rows.
      pick(
        byTrainerPayrollVariance.rows.map((r) => ({
          ...r,
          value: r.value === null ? null : Math.abs(r.value),
        })),
        "max",
      ),
      "cents",
      ["payroll_variance_cents"],
      "Finalized payroll is not available for both windows.",
    ),
    item(
      "most_improved_trainer",
      "Most improved trainer (sessions)",
      pick(byTrainerSessionGrowth.rows, "max", { key: "previous", atLeast: 1 }),
      "rate_bp",
      ["session_growth_bp"],
      "No trainer has sessions in both windows.",
    ),
  ];

  // Biggest configuration gap: the readiness component with the LOWEST value.
  const ctx = buildContext(dataset, scope, filters);
  let gap: { id: string; name: string; value: number } | null = null;
  for (const id of READINESS_COMPONENTS) {
    const evaluator = METRIC_EVALUATORS.get(id);
    const definition = METRIC_DEFINITIONS.get(id);
    if (!evaluator || !definition) continue;
    const outcome = evaluator(ctx);
    if (outcome.value === null) continue;
    if (gap === null || outcome.value < gap.value ||
        (outcome.value === gap.value && definition.name.localeCompare(gap.name) < 0)) {
      gap = { id, name: definition.name, value: outcome.value };
    }
  }
  items.push(
    gap
      ? {
          code: "biggest_configuration_gap",
          headline: "Biggest configuration gap",
          subject: gap.name,
          value: gap.value,
          unit: "rate_bp",
          basisMetricIds: [gap.id],
          health: gap.value === 10_000 ? "healthy" : "incomplete",
          detail: gap.value === 10_000 ? "All readiness checks pass." : "",
        }
      : {
          code: "biggest_configuration_gap",
          headline: "Biggest configuration gap",
          subject: null,
          value: null,
          unit: "rate_bp",
          basisMetricIds: [...READINESS_COMPONENTS],
          health: "waiting_for_configuration",
          detail: "No readiness component is measurable yet.",
        },
  );

  return items;
}
