/**
 * Evaluation plumbing shared by every metric module: the per-request
 * context (facts pre-scoped ONCE), outcome shape, and pipeline-health
 * helpers so "no data yet" is always explained, never a fake zero.
 */

import type {
  AppointmentSummary,
  AppointmentFact,
  IntelligenceDataset,
  PayrollSummary,
  PayrollTrainerFact,
} from "./facts";
import type { MetricFilters, MetricHealth, MetricScope } from "./types";

export interface MetricOutcome {
  value: number | null;
  health: MetricHealth;
  reasons?: string[];
  warnings?: string[];
  metadata?: Record<string, string | number | null>;
}

export interface EvalContext {
  dataset: IntelligenceDataset;
  scope: MetricScope;
  filters: MetricFilters;
  /** Current-window facts, already narrowed to scope + filters. */
  appointments: AppointmentFact[];
  summary: AppointmentSummary;
  payroll: PayrollTrainerFact[];
  payrollSummary: PayrollSummary;
  /** Previous equal-length window, same scope + filters. */
  previousAppointments: AppointmentFact[];
  previousSummary: AppointmentSummary;
  previousPayroll: PayrollTrainerFact[];
  previousPayrollSummary: PayrollSummary;
}

export type MetricEvaluator = (ctx: EvalContext) => MetricOutcome;

/* -------------------------------------------------------- health gates */

/**
 * Appointment-pipeline gate: metrics over the ledger are only meaningful
 * once at least one import batch has been posted for the organization.
 */
export function appointmentGate(ctx: EvalContext): MetricOutcome | null {
  if (!ctx.dataset.flags.hasPostedImports) {
    return {
      value: null,
      health: "waiting_for_imports",
      reasons: [
        "No import batch has been posted for this organization yet — appointment data is not available.",
      ],
    };
  }
  return null;
}

/**
 * Payroll-pipeline gate: payroll metrics use FINALIZED (posted/locked)
 * runs only; draft numbers are never reported.
 */
export function payrollGate(ctx: EvalContext): MetricOutcome | null {
  if (!ctx.dataset.flags.hasAnyFinalizedPayroll) {
    return {
      value: null,
      health: "waiting_for_payroll",
      reasons: [
        "No payroll run has been posted for this organization yet — payroll metrics use finalized runs only.",
      ],
    };
  }
  if (ctx.payroll.length === 0) {
    return {
      value: null,
      health: "waiting_for_payroll",
      reasons: [
        "No finalized payroll run overlaps the selected date range for this scope.",
      ],
    };
  }
  return null;
}

/** Wrap a healthy numeric outcome; null values keep health but warn. */
export function healthyValue(
  value: number | null,
  metadata?: Record<string, string | number | null>,
  warnings?: string[],
): MetricOutcome {
  return {
    value,
    health: "healthy",
    metadata,
    warnings:
      value === null
        ? [...(warnings ?? []), "Denominator is zero for this scope — the ratio is undefined."]
        : warnings,
  };
}

export const NOT_YET_APPROVED: MetricOutcome = {
  value: null,
  health: "unavailable",
  reasons: [
    "The business definition for this metric has not been approved yet (see docs/business-rules). Nothing is inferred.",
  ],
};
