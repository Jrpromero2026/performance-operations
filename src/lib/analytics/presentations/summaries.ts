/**
 * Analytical summaries — deterministic comparison statements. NOT AI: every
 * statement is a template filled from engine results and analytics
 * comparisons, traceable to its basis metrics, unit-tested, and free of
 * causal claims, recommendations, anomaly labels, and projections.
 */

import { formatMetricValue } from "@/lib/intelligence/format";
import type { MetricComparison } from "../shared/types";
import type { GoalProgress } from "../goals/progress";

export interface AnalyticalSummary {
  /** Stable statement code, e.g. metric_changed / goals_unmet. */
  code: string;
  statement: string;
  basisMetricIds: string[];
}

/** Statement for one eligible comparison; null when nothing to say. */
export function summarizeComparison(
  comparison: MetricComparison,
): AnalyticalSummary | null {
  if (comparison.eligibility !== "eligible" || comparison.comparison === null) {
    return null;
  }
  const variance = comparison.absoluteVariance!;
  const formatted = formatMetricValue(Math.abs(variance), comparison.unit);
  const versus = comparison.comparison.window.label;
  if (variance === 0) {
    return {
      code: "metric_unchanged",
      statement: `${comparison.metricName} is unchanged compared with ${versus}.`,
      basisMetricIds: [comparison.metricId],
    };
  }
  const moved = variance > 0 ? "increased" : "decreased";
  return {
    code: "metric_changed",
    statement: `${comparison.metricName} ${moved} by ${formatted} compared with ${versus}.`,
    basisMetricIds: [comparison.metricId],
  };
}

/** Statements about a set of comparisons (unavailability is stated, not hidden). */
export function summarizeUnavailability(
  comparisons: readonly MetricComparison[],
): AnalyticalSummary | null {
  const unavailable = comparisons.filter(
    (c) => c.eligibility === "current_unavailable",
  );
  if (unavailable.length === 0) return null;
  return {
    code: "metrics_unavailable",
    statement:
      unavailable.length === 1
        ? `1 metric is unavailable: ${unavailable[0].metricName} (${unavailable[0].current.reason ?? "no reason recorded"}).`
        : `${unavailable.length} metrics are unavailable because required data or definitions are missing.`,
    basisMetricIds: unavailable.map((c) => c.metricId),
  };
}

/** Statement about active goals that are currently unmet. */
export function summarizeGoalStates(
  goals: readonly { name: string; progress: GoalProgress }[],
): AnalyticalSummary[] {
  const statements: AnalyticalSummary[] = [];
  const unmet = goals.filter(
    (g) => g.progress.status === "in_progress" || g.progress.status === "missed",
  );
  if (unmet.length > 0) {
    statements.push({
      code: "goals_unmet",
      statement:
        unmet.length === 1
          ? `1 active goal is currently unmet: ${unmet[0].name}.`
          : `${unmet.length} active goals are currently unmet.`,
      basisMetricIds: [],
    });
  }
  const met = goals.filter(
    (g) => g.progress.status === "met" || g.progress.status === "exceeded",
  );
  if (met.length > 0) {
    statements.push({
      code: "goals_met",
      statement:
        met.length === 1
          ? `1 goal has met its target: ${met[0].name}.`
          : `${met.length} goals have met their targets.`,
      basisMetricIds: [],
    });
  }
  const blocked = goals.filter((g) => g.progress.status === "blocked");
  if (blocked.length > 0) {
    statements.push({
      code: "goals_blocked",
      statement: `${blocked.length} goal(s) need review because their pinned metric definition changed.`,
      basisMetricIds: [],
    });
  }
  return statements;
}

/** Finality statement for the selected window. */
export function summarizeFinality(window: {
  label: string;
  finality: "final" | "not_final";
  partial: boolean;
}): AnalyticalSummary {
  if (window.finality === "final") {
    return {
      code: "period_final",
      statement: `${window.label} is closed — figures are final.`,
      basisMetricIds: [],
    };
  }
  return {
    code: "period_not_final",
    statement: window.partial
      ? `${window.label} is still in progress — figures are not final and will change as data arrives.`
      : `${window.label} is not closed — figures are not final.`,
    basisMetricIds: [],
  };
}
