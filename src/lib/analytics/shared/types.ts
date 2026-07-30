/**
 * Analytics layer — core types (`analytics-v1`).
 *
 * The analytics layer COMPOSES Performance Intelligence Engine output. It
 * never recalculates an operational metric: every value in these shapes is
 * a MetricResult the engine produced, carried verbatim together with its
 * health, unit, and version. What the layer adds is presentation-only
 * derivation — window resolution, variance against another engine result,
 * variance against an approved target, and deterministic eligibility.
 */

import type {
  MetricHealth,
  MetricUnit,
} from "@/lib/intelligence/shared/types";

export const ANALYTICS_VERSION = "analytics-v1";

/* ------------------------------------------------------------- direction */

/**
 * Better-or-worse interpretation for a metric. Assigned explicitly per
 * metric in the analytics metadata registry — NEVER assumed. Metrics
 * without a defensible direction are `neutral` or `context_dependent`
 * and receive no improved/declined interpretation.
 */
export type MetricDirection =
  | "higher_is_better"
  | "lower_is_better"
  | "neutral"
  | "context_dependent";

/** Presentation metadata the analytics layer adds per catalog metric. */
export interface MetricAnalyticsMetadata {
  metricId: string;
  direction: MetricDirection;
  /** May a goal target reference this metric? */
  targetCompatible: boolean;
  /** May a benchmark reference this metric? */
  benchmarkCompatible: boolean;
  /**
   * May percentage change be displayed for this metric? Rates (rate_bp)
   * and growth metrics show absolute basis-point deltas instead — the
   * approved display rule (percent-of-percent is not shown).
   */
  percentChangeCompatible: boolean;
  /**
   * False for point-in-time metrics (readiness/configuration state) whose
   * historical comparison would compare current configuration against
   * itself — such comparisons are ineligible, not zero.
   */
  historicallyComparable: boolean;
}

/* --------------------------------------------------------------- periods */

export type PeriodFinality = "final" | "not_final";

/**
 * A resolved analysis window. Reporting-period-backed windows carry the
 * period id and its close-derived finality; calendar-derived windows are
 * always not final (they are never close artifacts).
 */
export interface AnalyticsWindow {
  /** Stable window kind, e.g. current, previous_period, year_over_year. */
  kind: string;
  /** Human-readable label, e.g. "July 2026" or "Rolling 12 months". */
  label: string;
  dateFrom: string;
  dateTo: string;
  /** Set when the window IS a reporting period. */
  reportingPeriodId: string | null;
  finality: PeriodFinality;
  /** True when the window extends into the future (still accumulating). */
  partial: boolean;
}

export type ComparisonWindowKind =
  | "previous_period"
  | "same_period_last_year"
  | "month_over_month"
  | "quarter_over_quarter"
  | "year_over_year"
  | "rolling_4_periods"
  | "rolling_12_months"
  | "year_to_date"
  | "prior_year_to_date"
  | "custom";

/* ------------------------------------------------------------ comparison */

/**
 * Why a comparison is (in)eligible. `eligible` is the only value under
 * which variances are populated; every other value explains the refusal.
 */
export type ComparisonEligibility =
  | "eligible"
  | "current_unavailable"
  | "comparison_unavailable"
  | "missing_comparison_period"
  | "unit_mismatch"
  | "version_mismatch"
  | "point_in_time_metric"
  | "window_not_derivable";

/** One side of a comparison — an engine result plus its window. */
export interface ComparisonSide {
  value: number | null;
  health: MetricHealth;
  reason: string | null;
  window: AnalyticsWindow;
}

/** The full deterministic comparison record. */
export interface MetricComparison {
  metricId: string;
  metricName: string;
  unit: MetricUnit;
  metricVersion: string;
  current: ComparisonSide;
  comparison: ComparisonSide | null;
  /** current − comparison, in the metric's native unit; null if ineligible. */
  absoluteVariance: number | null;
  /**
   * Signed percentage change in basis points of the comparison value
   * (10000 = +100%). Null when ineligible, when the metric is not
   * percent-change compatible, or when the denominator is not positive
   * (zero/negative denominators never yield a percentage).
   */
  percentVarianceBp: number | null;
  eligibility: ComparisonEligibility;
  /** Human-readable reason accompanying non-eligible states. */
  eligibilityReason: string | null;
  direction: MetricDirection;
  /**
   * Only set when direction is higher_is_better/lower_is_better AND the
   * comparison is eligible: what the movement means.
   */
  interpretation: "improved" | "declined" | "unchanged" | null;
}

/* ---------------------------------------------------------------- series */

/** A metric evaluated over an ordered list of windows (multi-period). */
export interface MetricSeriesPoint {
  window: AnalyticsWindow;
  value: number | null;
  health: MetricHealth;
  reason: string | null;
}

export interface MetricSeries {
  metricId: string;
  metricName: string;
  unit: MetricUnit;
  metricVersion: string;
  direction: MetricDirection;
  points: MetricSeriesPoint[];
}

/* ------------------------------------------------------------ breakdowns */

/** A breakdown row compared across two windows (e.g. per department). */
export interface BreakdownComparisonRow {
  key: string;
  label: string;
  currentValue: number | null;
  comparisonValue: number | null;
  absoluteVariance: number | null;
  percentVarianceBp: number | null;
}

export interface BreakdownComparison {
  metricId: string;
  groupBy: string;
  unit: MetricUnit;
  currentWindow: AnalyticsWindow;
  comparisonWindow: AnalyticsWindow | null;
  eligibility: ComparisonEligibility;
  eligibilityReason: string | null;
  health: MetricHealth;
  rows: BreakdownComparisonRow[];
}
