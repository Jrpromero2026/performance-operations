/**
 * Appointment + scheduling metrics. All values derive from the ONE
 * `summarizeAppointments` aggregation — no metric re-reads the ledger.
 */

import { growthBp, mean, median, ratioBp } from "../shared/math";
import {
  appointmentGate,
  healthyValue,
  type EvalContext,
  type MetricEvaluator,
  type MetricOutcome,
} from "../shared/evaluate";
import {
  INTELLIGENCE_VERSION,
  type MetricDefinition,
} from "../shared/types";

const SCOPES: MetricDefinition["scopes"] = [
  "organization",
  "department",
  "trainer",
  "service",
  "client",
];

function def(
  partial: Omit<MetricDefinition, "version" | "requiredPermission" | "selfPermission" | "scopes"> &
    Partial<Pick<MetricDefinition, "scopes">>,
): MetricDefinition {
  return {
    requiredPermission: "appointment:read",
    selfPermission: "trainer:read_self",
    scopes: SCOPES,
    version: INTELLIGENCE_VERSION,
    ...partial,
  };
}

export const APPOINTMENT_METRICS: MetricDefinition[] = [
  def({
    id: "appointments_total",
    name: "Appointments (all statuses)",
    category: "appointments",
    definition: "All active ledger appointments in scope, any status.",
    formula: "count(appointments)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "appointments_scheduled",
    name: "Appointments scheduled",
    category: "appointments",
    definition: "Appointments currently in canonical status 'scheduled'.",
    formula: "count(status = scheduled)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "appointments_completed",
    name: "Appointments completed",
    category: "appointments",
    definition: "Appointments in canonical status 'completed'.",
    formula: "count(status = completed)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "appointments_cancelled",
    name: "Appointments cancelled",
    category: "appointments",
    definition: "Appointments in canonical status 'cancelled'.",
    formula: "count(status = cancelled)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "appointments_late_cancelled",
    name: "Appointments late-cancelled",
    category: "appointments",
    definition: "Appointments in canonical status 'late_cancelled'.",
    formula: "count(status = late_cancelled)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "appointments_no_show",
    name: "No-shows",
    category: "appointments",
    definition: "Appointments in canonical status 'no_show'.",
    formula: "count(status = no_show)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "appointments_rescheduled",
    name: "Appointments rescheduled",
    category: "appointments",
    definition: "Appointments in canonical status 'rescheduled'.",
    formula: "count(status = rescheduled)",
    unit: "count",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "completed_rate_bp",
    name: "Completed %",
    category: "appointments",
    definition:
      "Share of booked appointments (scheduled/completed/cancelled/late_cancelled/no_show) that completed.",
    formula: "completed ÷ booked × 10000",
    unit: "rate_bp",
    dependencies: ["appointments_completed", "dataset:appointments"],
  }),
  def({
    id: "cancellation_rate_bp",
    name: "Cancellation %",
    category: "appointments",
    definition:
      "Share of booked appointments cancelled or late-cancelled.",
    formula: "(cancelled + late_cancelled) ÷ booked × 10000",
    unit: "rate_bp",
    dependencies: ["appointments_cancelled", "appointments_late_cancelled"],
  }),
  def({
    id: "no_show_rate_bp",
    name: "No-show %",
    category: "appointments",
    definition: "Share of booked appointments that were no-shows.",
    formula: "no_show ÷ booked × 10000",
    unit: "rate_bp",
    dependencies: ["appointments_no_show"],
  }),
  def({
    id: "average_session_duration_minutes",
    name: "Average session duration",
    category: "appointments",
    definition: "Mean duration of completed appointments.",
    formula: "mean(duration_minutes of completed)",
    unit: "minutes",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "median_session_duration_minutes",
    name: "Median session duration",
    category: "appointments",
    definition: "Median duration of completed appointments.",
    formula: "median(duration_minutes of completed)",
    unit: "minutes",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "coaching_minutes",
    name: "Coaching time",
    category: "appointments",
    definition:
      "Minutes of completed appointments whose service counts as coaching hours (display as hours = minutes ÷ 60).",
    formula: "Σ duration_minutes(completed AND service.counts_as_coaching_hours)",
    unit: "minutes",
    dependencies: ["dataset:appointments", "configuration:services"],
  }),
  def({
    id: "completed_minutes",
    name: "Completed time (all services)",
    category: "appointments",
    definition: "Minutes of all completed appointments.",
    formula: "Σ duration_minutes(completed)",
    unit: "minutes",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "scheduled_minutes",
    name: "Booked time",
    category: "scheduling",
    definition:
      "Minutes of booked appointments regardless of outcome (scheduled/completed/cancelled/late_cancelled/no_show).",
    formula: "Σ duration_minutes(booked statuses)",
    unit: "minutes",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "group_sessions_completed",
    name: "Group sessions completed",
    category: "appointments",
    definition: "Completed appointments on group-training services.",
    formula: "count(completed AND service.is_group_training)",
    unit: "count",
    dependencies: ["dataset:appointments", "configuration:services"],
  }),
  def({
    id: "evaluation_sessions_completed",
    name: "Evaluations completed",
    category: "appointments",
    definition: "Completed appointments on evaluation services.",
    formula: "count(completed AND service.is_evaluation)",
    unit: "count",
    dependencies: ["dataset:appointments", "configuration:services"],
  }),
  def({
    id: "session_growth_bp",
    name: "Session growth",
    category: "growth",
    definition:
      "Change in completed appointments vs the previous equal-length window.",
    formula: "(completed − previous_completed) ÷ previous_completed × 10000",
    unit: "rate_bp",
    dependencies: ["appointments_completed"],
  }),
];

function gated(
  compute: (ctx: EvalContext) => MetricOutcome,
): MetricEvaluator {
  return (ctx) => appointmentGate(ctx) ?? compute(ctx);
}

export const APPOINTMENT_EVALUATORS: Record<string, MetricEvaluator> = {
  appointments_total: gated((c) => healthyValue(c.summary.total)),
  appointments_scheduled: gated((c) => healthyValue(c.summary.scheduled)),
  appointments_completed: gated((c) => healthyValue(c.summary.completed)),
  appointments_cancelled: gated((c) => healthyValue(c.summary.cancelled)),
  appointments_late_cancelled: gated((c) => healthyValue(c.summary.lateCancelled)),
  appointments_no_show: gated((c) => healthyValue(c.summary.noShow)),
  appointments_rescheduled: gated((c) => healthyValue(c.summary.rescheduled)),
  completed_rate_bp: gated((c) =>
    healthyValue(ratioBp(c.summary.completed, c.summary.booked), {
      numerator: c.summary.completed,
      denominator: c.summary.booked,
    }),
  ),
  cancellation_rate_bp: gated((c) =>
    healthyValue(
      ratioBp(c.summary.cancelled + c.summary.lateCancelled, c.summary.booked),
      {
        numerator: c.summary.cancelled + c.summary.lateCancelled,
        denominator: c.summary.booked,
      },
    ),
  ),
  no_show_rate_bp: gated((c) =>
    healthyValue(ratioBp(c.summary.noShow, c.summary.booked), {
      numerator: c.summary.noShow,
      denominator: c.summary.booked,
    }),
  ),
  average_session_duration_minutes: gated((c) =>
    healthyValue(mean(c.summary.completedDurations)),
  ),
  median_session_duration_minutes: gated((c) =>
    healthyValue(median(c.summary.completedDurations)),
  ),
  coaching_minutes: gated((c) => healthyValue(c.summary.coachingMinutes)),
  completed_minutes: gated((c) => healthyValue(c.summary.completedMinutes)),
  scheduled_minutes: gated((c) => healthyValue(c.summary.bookedMinutes)),
  group_sessions_completed: gated((c) => healthyValue(c.summary.groupSessions)),
  evaluation_sessions_completed: gated((c) =>
    healthyValue(c.summary.evaluationSessions),
  ),
  session_growth_bp: gated((c) =>
    healthyValue(
      growthBp(c.summary.completed, c.previousSummary.completed),
      {
        current: c.summary.completed,
        previous: c.previousSummary.completed,
      },
      c.previousSummary.completed === 0
        ? ["No completed sessions in the previous window — growth is undefined."]
        : undefined,
    ),
  ),
};
