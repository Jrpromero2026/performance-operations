/**
 * Analytics metadata registry — presentation metadata layered OVER the
 * metric catalog without modifying any metric definition. Directions are
 * assigned explicitly per metric (never assumed from the unit); a unit
 * test asserts every catalog metric has an assignment so a new metric
 * cannot ship without a deliberate direction decision.
 *
 * Version: any material change to an assignment bumps ANALYTICS_METADATA_VERSION
 * and is recorded in docs/DECISION_LOG.md.
 */

import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import type { MetricDirection, MetricAnalyticsMetadata } from "./types";

export const ANALYTICS_METADATA_VERSION = "analytics-meta-v1";

/**
 * Explicit direction per metric id.
 *
 * Rationale (full reasoning in docs/MULTI_PERIOD_COMPARISONS.md):
 *  - completed volume/coaching/revenue/client-activity metrics: higher is better
 *  - cancellation/no-show/inactive metrics: lower is better
 *  - payroll amounts: context_dependent — paying more is neither good nor
 *    bad without margin context this system does not calculate
 *  - durations, mixes, headcounts, dates: neutral (no defensible direction)
 *  - readiness coverage: higher is better (configuration completeness)
 */
const DIRECTION: Record<string, MetricDirection> = {
  // appointments
  appointments_total: "context_dependent",
  appointments_scheduled: "context_dependent",
  appointments_completed: "higher_is_better",
  appointments_cancelled: "lower_is_better",
  appointments_late_cancelled: "lower_is_better",
  appointments_no_show: "lower_is_better",
  appointments_rescheduled: "neutral",
  completed_rate_bp: "higher_is_better",
  cancellation_rate_bp: "lower_is_better",
  no_show_rate_bp: "lower_is_better",
  average_session_duration_minutes: "neutral",
  median_session_duration_minutes: "neutral",
  coaching_minutes: "higher_is_better",
  completed_minutes: "higher_is_better",
  scheduled_minutes: "context_dependent",
  group_sessions_completed: "neutral",
  evaluation_sessions_completed: "neutral",
  session_growth_bp: "higher_is_better",
  // revenue (source amounts — never renamed)
  revenue_listed_cents: "higher_is_better",
  revenue_paid_cents: "higher_is_better",
  revenue_eligible_cents: "higher_is_better",
  revenue_recognized_cents: "higher_is_better",
  revenue_per_session_cents: "higher_is_better",
  revenue_per_hour_cents: "higher_is_better",
  average_session_value_cents: "higher_is_better",
  revenue_growth_bp: "higher_is_better",
  rolling_revenue_30d_cents: "higher_is_better",
  // payroll — amounts are context-dependent; variances neutral
  payroll_gross_cents: "context_dependent",
  payroll_pct_of_revenue_bp: "context_dependent",
  payroll_per_session_cents: "context_dependent",
  payroll_per_hour_cents: "context_dependent",
  payroll_bonus_cents: "context_dependent",
  payroll_deduction_cents: "context_dependent",
  payroll_adjustment_net_cents: "neutral",
  payroll_growth_bp: "context_dependent",
  payroll_variance_cents: "neutral",
  // clients
  active_clients: "higher_is_better",
  inactive_clients: "lower_is_better",
  new_clients: "higher_is_better",
  returning_clients: "higher_is_better",
  sessions_per_client_x100: "higher_is_better",
  revenue_per_client_cents: "higher_is_better",
  average_client_spend_cents: "higher_is_better",
  client_retention_rate_bp: "higher_is_better",
  visit_frequency_per_week_x100: "higher_is_better",
  client_first_visit: "neutral",
  client_last_visit: "neutral",
  client_growth_bp: "higher_is_better",
  // trainers / departments / organizations
  repeat_client_count: "higher_is_better",
  active_trainers: "neutral",
  active_departments: "neutral",
  // utilization
  schedule_utilization_bp: "higher_is_better",
  capacity_utilization_bp: "context_dependent",
  pt_penetration_bp: "higher_is_better",
  // readiness (point-in-time configuration state)
  trainer_assignment_coverage_bp: "higher_is_better",
  compensation_coverage_bp: "higher_is_better",
  service_alias_coverage_bp: "higher_is_better",
  reporting_period_coverage_bp: "higher_is_better",
  import_health_bp: "higher_is_better",
  payroll_readiness_bp: "higher_is_better",
  organization_readiness_bp: "higher_is_better",
};

/** Metric ids whose value is point-in-time state, not period history. */
const POINT_IN_TIME_CATEGORIES = new Set(["readiness"]);

export function getMetricAnalyticsMetadata(
  metricId: string,
): MetricAnalyticsMetadata | null {
  const definition = METRIC_DEFINITIONS.get(metricId);
  if (!definition) return null;
  const direction = DIRECTION[metricId];
  if (!direction) return null; // unassigned = no analytics interpretation
  const numeric = definition.unit !== "date";
  const approved = !definition.notYetApproved;
  return {
    metricId,
    direction,
    // Targets/benchmarks require an approved numeric metric.
    targetCompatible: numeric && approved,
    benchmarkCompatible: numeric && approved,
    // Approved display rule: rates and growth (rate_bp) show absolute
    // basis-point deltas, never percent-of-percent.
    percentChangeCompatible: numeric && approved && definition.unit !== "rate_bp",
    historicallyComparable: !POINT_IN_TIME_CATEGORIES.has(definition.category),
  };
}

/** Registry coverage check used by unit tests and the catalog doc build. */
export function listUnassignedMetricIds(): string[] {
  return [...METRIC_DEFINITIONS.keys()].filter((id) => !DIRECTION[id]);
}
