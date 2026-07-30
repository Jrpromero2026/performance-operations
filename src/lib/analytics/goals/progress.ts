/**
 * Goal progress derivation — pure, deterministic presentation math over an
 * engine MetricResult and an approved goal target. No forecasting: every
 * status is a statement about data that already exists.
 *
 * Documented rules (docs/GOALS_AND_TARGETS.md):
 *  - An unavailable metric result can NEVER count as achieved: progress is
 *    `unavailable`, health carried through.
 *  - `blocked` means the goal's pinned metric version or unit no longer
 *    matches the live catalog — the goal needs review, not evaluation.
 *  - Goal types are direction-agnostic: `minimum` always means "value must
 *    be at least the target", whatever the metric's better-direction is.
 *  - `on_track` is NOT a status. It is a separate boolean computed ONLY
 *    for minimum-type goals before their end date, and means exactly:
 *    current value ≥ floor(target × elapsed_days / total_days) — the
 *    linearly prorated cumulative target through today. No projection.
 */

import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import { daysBetweenInclusive } from "@/lib/intelligence/trends/engine";
import type { MetricResult } from "@/lib/intelligence/shared/types";

export type GoalProgressStatus =
  | "not_started"
  | "in_progress"
  | "met"
  | "exceeded"
  | "missed"
  | "unavailable"
  | "blocked";

export interface GoalFacts {
  goalType: "minimum" | "maximum" | "exact" | "range" | "maintain" | "improvement";
  metricId: string;
  metricVersion: string;
  metricUnit: string;
  targetValue: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  baselineValue: number | null;
  startDate: string;
  endDate: string;
  status: string;
}

export interface GoalProgress {
  status: GoalProgressStatus;
  /** Why the status is unavailable/blocked; null otherwise. */
  reason: string | null;
  currentValue: number | null;
  metricHealth: MetricResult["health"] | null;
  /** value − target (signed, metric-native units); null when not derivable. */
  absoluteGap: number | null;
  /** value ÷ target in basis points, only when target > 0 and value ≥ 0. */
  percentToTargetBp: number | null;
  /** Elapsed share of the goal window in basis points (calendar days). */
  timeElapsedBp: number;
  /** Deterministic prorated-cumulative check; null when rule not applicable. */
  onTrack: boolean | null;
}

const USABLE_HEALTH = new Set(["healthy", "incomplete"]);

function targetFor(goal: GoalFacts): number | null {
  if (goal.goalType === "range") return goal.targetHigh; // gap vs upper bound
  if (goal.goalType === "improvement") {
    return goal.baselineValue !== null && goal.targetValue !== null
      ? goal.baselineValue + goal.targetValue
      : null;
  }
  return goal.targetValue;
}

/** Elapsed basis points of the goal window as of `today`, clamped 0..10000. */
export function goalTimeElapsedBp(goal: GoalFacts, today: string): number {
  if (today < goal.startDate) return 0;
  if (today >= goal.endDate) return 10_000;
  const total = daysBetweenInclusive(goal.startDate, goal.endDate);
  const elapsed = daysBetweenInclusive(goal.startDate, today);
  return Math.min(10_000, Math.round((elapsed / total) * 10_000));
}

export function deriveGoalProgress(
  goal: GoalFacts,
  result: MetricResult | null,
  today: string,
): GoalProgress {
  const timeElapsedBp = goalTimeElapsedBp(goal, today);
  const base: GoalProgress = {
    status: "in_progress",
    reason: null,
    currentValue: result?.value ?? null,
    metricHealth: result?.health ?? null,
    absoluteGap: null,
    percentToTargetBp: null,
    timeElapsedBp,
    onTrack: null,
  };

  // Catalog drift: pinned metric must still exist with matching version+unit.
  const definition = METRIC_DEFINITIONS.get(goal.metricId);
  if (!definition) {
    return {
      ...base,
      status: "blocked",
      reason: `Metric ${goal.metricId} no longer exists in the catalog.`,
    };
  }
  if (definition.version !== goal.metricVersion) {
    return {
      ...base,
      status: "blocked",
      reason: `Metric version changed (goal pinned ${goal.metricVersion}, catalog is ${definition.version}) — review the goal.`,
    };
  }
  if (definition.unit !== goal.metricUnit) {
    return {
      ...base,
      status: "blocked",
      reason: `Metric unit changed (goal pinned ${goal.metricUnit}, catalog is ${definition.unit}) — review the goal.`,
    };
  }

  if (today < goal.startDate) return { ...base, status: "not_started" };

  if (!result || result.value === null || !USABLE_HEALTH.has(result.health)) {
    return {
      ...base,
      status: "unavailable",
      reason:
        result?.reasons[0] ??
        "The metric result is unavailable — an unavailable value never counts as achieved.",
    };
  }

  const value = result.value;
  const ended = today > goal.endDate;
  const target = targetFor(goal);

  let met = false;
  let exceeded = false;
  switch (goal.goalType) {
    case "minimum":
    case "maintain": // maintain = keep the metric at or above the target
      met = goal.targetValue !== null && value >= goal.targetValue;
      exceeded = goal.targetValue !== null && value > goal.targetValue;
      break;
    case "maximum":
      met = goal.targetValue !== null && value <= goal.targetValue;
      exceeded = goal.targetValue !== null && value < goal.targetValue;
      break;
    case "exact":
      met = goal.targetValue !== null && value === goal.targetValue;
      exceeded = false;
      break;
    case "range":
      met =
        goal.targetLow !== null &&
        goal.targetHigh !== null &&
        value >= goal.targetLow &&
        value <= goal.targetHigh;
      exceeded = false;
      break;
    case "improvement": {
      // targetValue is the SIGNED required delta from the baseline.
      if (goal.baselineValue === null || goal.targetValue === null) break;
      const delta = value - goal.baselineValue;
      met =
        goal.targetValue >= 0 ? delta >= goal.targetValue : delta <= goal.targetValue;
      exceeded =
        goal.targetValue >= 0 ? delta > goal.targetValue : delta < goal.targetValue;
      break;
    }
  }

  const absoluteGap = target !== null ? value - target : null;
  const percentToTargetBp =
    target !== null && target > 0 && value >= 0
      ? Math.round((value / target) * 10_000)
      : null;

  // Prorated cumulative on-track rule — minimum goals, before the end date.
  let onTrack: boolean | null = null;
  if (!ended && goal.goalType === "minimum" && goal.targetValue !== null) {
    const expected = Math.floor((goal.targetValue * timeElapsedBp) / 10_000);
    onTrack = value >= expected;
  }

  const status: GoalProgressStatus = met
    ? exceeded
      ? "exceeded"
      : "met"
    : ended
      ? "missed"
      : "in_progress";

  return { ...base, status, absoluteGap, percentToTargetBp, onTrack };
}
