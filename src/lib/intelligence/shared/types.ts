/**
 * Performance Intelligence Engine — core types (`intel-v1`).
 *
 * The engine is the ONLY source of truth for operational metrics. Every
 * surface (reports page, exports, future dashboards/API) requests metric
 * results from the reporting service; nothing recalculates a formula.
 */

import type { Permission } from "@/lib/authz/permissions";

export const INTELLIGENCE_VERSION = "intel-v1";

/* ------------------------------------------------------------ categories */

export const METRIC_CATEGORIES = [
  "appointments",
  "revenue",
  "payroll",
  "trainers",
  "clients",
  "departments",
  "organizations",
  "services",
  "scheduling",
  "retention",
  "utilization",
  "growth",
  "readiness",
] as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

/* ----------------------------------------------------------------- units */

export type MetricUnit =
  | "count"
  | "cents"
  | "minutes"
  | "hours"
  | "rate_bp" // ratio in basis points (10000 = 100%)
  | "cents_per_session"
  | "cents_per_hour"
  | "cents_per_client"
  | "sessions_per_client"
  | "visits_per_week"
  | "date";

/* ----------------------------------------------------------------- scope */

/** Dimensions a metric can be evaluated AT (grouped by). */
export type ScopeLevel =
  | "organization"
  | "department"
  | "trainer"
  | "service"
  | "client";

export interface MetricScope {
  organizationId: string;
  departmentId?: string;
  trainerId?: string;
  serviceId?: string;
  clientId?: string;
}

/** Filters every metric supports (missing filter = no restriction). */
export interface MetricFilters {
  /** Inclusive local dates (YYYY-MM-DD), from the reporting period or custom. */
  dateFrom: string;
  dateTo: string;
  reportingPeriodId?: string;
  appointmentStatuses?: string[];
  compensationMethod?: string;
  serviceId?: string;
  clientId?: string;
}

/* ---------------------------------------------------------------- health */

export const METRIC_HEALTH = [
  "healthy",
  "incomplete",
  "unavailable",
  "configuration_missing",
  "waiting_for_payroll",
  "waiting_for_imports",
  "waiting_for_configuration",
] as const;

export type MetricHealth = (typeof METRIC_HEALTH)[number];

/* ------------------------------------------------------------ definition */

export interface MetricDefinition {
  /** Unique snake_case identifier, stable across versions. */
  id: string;
  name: string;
  category: MetricCategory;
  /** What the metric means, in business language. */
  definition: string;
  /** The exact formula, single-sourced here and implemented once. */
  formula: string;
  unit: MetricUnit;
  /** Other metric ids or dataset names this metric derives from. */
  dependencies: string[];
  /** Scope levels the metric can be grouped/evaluated at. */
  scopes: ScopeLevel[];
  /** Permission required to read this metric at org/department scope. */
  requiredPermission: Permission;
  /**
   * Permission that grants a trainer THEIR OWN value (self scope). Metrics
   * without self access simply omit this.
   */
  selfPermission?: Permission;
  /** Calculation version; bumped when the formula changes. */
  version: typeof INTELLIGENCE_VERSION;
  /**
   * True for metrics whose business definition is not yet approved — they
   * always return health "unavailable" and never a number.
   */
  notYetApproved?: boolean;
}

/* ---------------------------------------------------------------- result */

export interface MetricResult {
  metricId: string;
  scope: MetricScope;
  filters: MetricFilters;
  /**
   * The value in the metric's unit, or null when health ≠ healthy/incomplete.
   * A numeric 0 is a REAL zero (pipeline has data; scope has none).
   */
  value: number | null;
  unit: MetricUnit;
  health: MetricHealth;
  /** Human-readable reasons for non-healthy states or warnings. */
  reasons: string[];
  warnings: string[];
  /** Extra structured context (e.g. numerator/denominator, breakdowns). */
  metadata: Record<string, string | number | null>;
  dependencies: string[];
  calculatedAt: string;
  version: typeof INTELLIGENCE_VERSION;
}

/* ------------------------------------------------------------ breakdowns */

/** A metric evaluated per group member (e.g. revenue per trainer). */
export interface MetricBreakdownRow {
  key: string; // group id (trainer/department/service/method id or name)
  label: string;
  value: number | null;
  metadata?: Record<string, string | number | null>;
}

export interface MetricBreakdown {
  metricId: string;
  groupBy: ScopeLevel | "compensation_method" | "status";
  unit: MetricUnit;
  rows: MetricBreakdownRow[];
  health: MetricHealth;
  reasons: string[];
}

/* ---------------------------------------------------------------- trends */

export const TREND_GRANULARITIES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type TrendGranularity = (typeof TREND_GRANULARITIES)[number];

export interface TrendBucket {
  /** Bucket key, e.g. 2026-07-03 / 2026-W27 / 2026-07 / 2026-Q3 / 2026. */
  key: string;
  dateFrom: string;
  dateTo: string;
}

export interface TrendPoint extends TrendBucket {
  value: number | null;
  health: MetricHealth;
}

export interface TrendComparison {
  kind: "previous_period" | "previous_year";
  current: number | null;
  previous: number | null;
  /** Signed change in basis points of the previous value; null if undefined. */
  changeBp: number | null;
}

export interface TrendResult {
  metricId: string;
  granularity: TrendGranularity | "custom";
  points: TrendPoint[];
  comparisons: TrendComparison[];
  unit: MetricUnit;
  version: typeof INTELLIGENCE_VERSION;
}

/* ---------------------------------------------------- executive summary */

export interface ExecutiveSummaryItem {
  /** Stable code, e.g. top_revenue_department. */
  code: string;
  headline: string;
  /** The winning subject (department/trainer/… name). */
  subject: string | null;
  value: number | null;
  unit: MetricUnit;
  basisMetricIds: string[];
  health: MetricHealth;
  detail: string;
}
