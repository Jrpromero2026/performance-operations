/**
 * Comparison math — the ONE place a variance is derived. Pure functions
 * over engine MetricResults: no SQL, no formulas, no health invention.
 * Presentation-only derivation, deterministic and unit-tested.
 *
 * Display rules (documented in docs/MULTI_PERIOD_COMPARISONS.md):
 *  - A comparison is eligible only when BOTH sides carry a numeric value
 *    with health healthy/incomplete, units match, and versions match.
 *  - Percentage change requires a POSITIVE denominator — zero or negative
 *    comparison values never yield a percentage (absolute variance may
 *    still be shown).
 *  - Rates (rate_bp) show absolute basis-point deltas, never percent.
 *  - Interpretation (improved/declined) exists ONLY for metrics whose
 *    catalog metadata assigns higher_is_better / lower_is_better.
 */

import type { MetricResult } from "@/lib/intelligence/shared/types";
import { getMetricAnalyticsMetadata } from "../shared/metadata";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import type {
  AnalyticsWindow,
  ComparisonEligibility,
  MetricComparison,
} from "../shared/types";

/** Health states under which a value is usable in a comparison. */
const COMPARABLE_HEALTH = new Set(["healthy", "incomplete"]);

export function isComparableResult(result: MetricResult): boolean {
  return result.value !== null && COMPARABLE_HEALTH.has(result.health);
}

/**
 * Signed percent change in basis points of `previous` (10000 = +100%).
 * Null unless the denominator is strictly positive.
 */
export function percentChangeBp(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 10_000);
}

function eligibilityFor(
  current: MetricResult,
  comparison: MetricResult | null,
  historicallyComparable: boolean,
): { eligibility: ComparisonEligibility; reason: string | null } {
  if (!historicallyComparable) {
    return {
      eligibility: "point_in_time_metric",
      reason:
        "This metric reflects current configuration state; historical comparison is not meaningful.",
    };
  }
  if (comparison === null) {
    return {
      eligibility: "missing_comparison_period",
      reason: "No comparison period is available.",
    };
  }
  if (!isComparableResult(current)) {
    return {
      eligibility: "current_unavailable",
      reason: current.reasons[0] ?? "The current value is unavailable.",
    };
  }
  if (!isComparableResult(comparison)) {
    return {
      eligibility: "comparison_unavailable",
      reason: comparison.reasons[0] ?? "The comparison value is unavailable.",
    };
  }
  if (current.unit !== comparison.unit) {
    return {
      eligibility: "unit_mismatch",
      reason: `Units differ (${current.unit} vs ${comparison.unit}).`,
    };
  }
  if (current.version !== comparison.version) {
    return {
      eligibility: "version_mismatch",
      reason: `Metric versions differ (${current.version} vs ${comparison.version}).`,
    };
  }
  return { eligibility: "eligible", reason: null };
}

/**
 * Build the full deterministic comparison record from two engine results.
 * Pass `comparison: null` with a `missingReason` when the window itself
 * could not be resolved.
 */
export function buildMetricComparison(args: {
  current: MetricResult;
  currentWindow: AnalyticsWindow;
  comparison: MetricResult | null;
  comparisonWindow: AnalyticsWindow | null;
  missingReason?: string;
}): MetricComparison {
  const { current, currentWindow, comparison, comparisonWindow } = args;
  const definition = METRIC_DEFINITIONS.get(current.metricId);
  const metadata = getMetricAnalyticsMetadata(current.metricId);
  const direction = metadata?.direction ?? "neutral";

  const { eligibility, reason } = eligibilityFor(
    current,
    comparison,
    metadata?.historicallyComparable ?? true,
  );
  const effectiveReason =
    eligibility === "missing_comparison_period" && args.missingReason
      ? args.missingReason
      : reason;

  let absoluteVariance: number | null = null;
  let percentVarianceBp: number | null = null;
  let interpretation: MetricComparison["interpretation"] = null;

  if (eligibility === "eligible" && comparison) {
    absoluteVariance = current.value! - comparison.value!;
    if (metadata?.percentChangeCompatible) {
      percentVarianceBp = percentChangeBp(current.value!, comparison.value!);
    }
    if (direction === "higher_is_better" || direction === "lower_is_better") {
      if (absoluteVariance === 0) interpretation = "unchanged";
      else {
        const movedUp = absoluteVariance > 0;
        interpretation =
          movedUp === (direction === "higher_is_better") ? "improved" : "declined";
      }
    }
  }

  return {
    metricId: current.metricId,
    metricName: definition?.name ?? current.metricId,
    unit: current.unit,
    metricVersion: current.version,
    current: {
      value: current.value,
      health: current.health,
      reason: current.reasons[0] ?? null,
      window: currentWindow,
    },
    comparison:
      comparison && comparisonWindow
        ? {
            value: comparison.value,
            health: comparison.health,
            reason: comparison.reasons[0] ?? null,
            window: comparisonWindow,
          }
        : null,
    absoluteVariance,
    percentVarianceBp,
    eligibility,
    eligibilityReason: effectiveReason,
    direction,
    interpretation,
  };
}
