/**
 * Revenue metrics. ONLY approved definitions are computed:
 *  - source listed amount (session's listed value at import time)
 *  - source paid amount (amount the source reported as paid)
 * Eligible/recognized revenue have NO approved business definition yet and
 * are permanently "unavailable" until one exists — nothing is inferred.
 *
 * Revenue is measured over COMPLETED appointments (uncompleted sessions
 * have no earned value under any approved definition).
 */

import { growthBp, mean, perHour, perUnit } from "../shared/math";
import { scopeAppointments } from "../shared/facts";
import {
  appointmentGate,
  healthyValue,
  NOT_YET_APPROVED,
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
    requiredPermission: "appointment:read",
    selfPermission: "trainer:read_self",
    scopes: ["organization", "department", "trainer", "service", "client"],
    version: INTELLIGENCE_VERSION,
    ...partial,
  };
}

export const REVENUE_METRICS: MetricDefinition[] = [
  def({
    id: "revenue_listed_cents",
    name: "Revenue (source listed)",
    category: "revenue",
    definition:
      "Sum of source listed amounts over completed appointments. This is listed session value, not collected cash.",
    formula: "Σ source_listed_price_cents(completed)",
    unit: "cents",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "revenue_paid_cents",
    name: "Revenue (source paid)",
    category: "revenue",
    definition:
      "Sum of source-reported paid amounts over completed appointments. Incomplete when the source omitted paid data.",
    formula: "Σ source_amount_paid_cents(completed)",
    unit: "cents",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "revenue_eligible_cents",
    name: "Eligible revenue (future)",
    category: "revenue",
    definition:
      "Payroll-eligible revenue. The business definition is not approved yet.",
    formula: "NOT APPROVED — never inferred",
    unit: "cents",
    dependencies: [],
    notYetApproved: true,
  }),
  def({
    id: "revenue_recognized_cents",
    name: "Recognized revenue (future)",
    category: "revenue",
    definition:
      "Accounting-recognized revenue. The business definition is not approved yet.",
    formula: "NOT APPROVED — never inferred",
    unit: "cents",
    dependencies: [],
    notYetApproved: true,
  }),
  def({
    id: "revenue_per_session_cents",
    name: "Revenue per session",
    category: "revenue",
    definition:
      "Listed revenue divided by completed session-counting appointments.",
    formula: "revenue_listed_cents ÷ completed_sessions",
    unit: "cents_per_session",
    dependencies: ["revenue_listed_cents", "dataset:appointments"],
  }),
  def({
    id: "revenue_per_hour_cents",
    name: "Revenue per hour",
    category: "revenue",
    definition: "Listed revenue per coaching hour.",
    formula: "revenue_listed_cents × 60 ÷ coaching_minutes",
    unit: "cents_per_hour",
    dependencies: ["revenue_listed_cents", "coaching_minutes"],
  }),
  def({
    id: "average_session_value_cents",
    name: "Average session value",
    category: "revenue",
    definition:
      "Unweighted mean of listed values across completed appointments that carry one.",
    formula: "mean(source_listed_price_cents of completed)",
    unit: "cents",
    dependencies: ["dataset:appointments"],
  }),
  def({
    id: "revenue_growth_bp",
    name: "Revenue growth",
    category: "growth",
    definition:
      "Change in listed revenue vs the previous equal-length window.",
    formula: "(revenue − previous_revenue) ÷ previous_revenue × 10000",
    unit: "rate_bp",
    dependencies: ["revenue_listed_cents"],
  }),
  def({
    id: "rolling_revenue_30d_cents",
    name: "Rolling revenue (30 days)",
    category: "revenue",
    definition:
      "Listed revenue over the 30 days ending at the range end (uses the current and previous windows; incomplete if they cover less).",
    formula: "Σ source_listed_price_cents(completed, dateTo−29 … dateTo)",
    unit: "cents",
    dependencies: ["dataset:appointments"],
  }),
];

function gated(compute: (ctx: EvalContext) => MetricOutcome): MetricEvaluator {
  return (ctx) => appointmentGate(ctx) ?? compute(ctx);
}

function listedWithWarnings(ctx: EvalContext): {
  cents: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (ctx.summary.completedListedMissing > 0) {
    warnings.push(
      `${ctx.summary.completedListedMissing} completed appointment(s) have no listed amount and are excluded.`,
    );
  }
  return { cents: ctx.summary.completedListedCents, warnings };
}

/** Shift a YYYY-MM-DD date by whole days (pure calendar math, UTC-safe). */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const REVENUE_EVALUATORS: Record<string, MetricEvaluator> = {
  revenue_listed_cents: gated((c) => {
    const { cents, warnings } = listedWithWarnings(c);
    return {
      value: cents,
      health: c.summary.completedListedMissing > 0 ? "incomplete" : "healthy",
      warnings,
      metadata: {
        completed_missing_amount: c.summary.completedListedMissing,
      },
    };
  }),
  revenue_paid_cents: gated((c) => {
    if (!c.dataset.flags.paidAmountsPresent) {
      return {
        value: null,
        health: "incomplete",
        reasons: [
          "The import source did not provide paid amounts for this range — paid revenue cannot be reported.",
        ],
      };
    }
    return {
      value: c.summary.completedPaidCents,
      health: c.summary.completedPaidMissing > 0 ? "incomplete" : "healthy",
      warnings:
        c.summary.completedPaidMissing > 0
          ? [
              `${c.summary.completedPaidMissing} completed appointment(s) have no paid amount and are excluded.`,
            ]
          : undefined,
    };
  }),
  revenue_eligible_cents: () => NOT_YET_APPROVED,
  revenue_recognized_cents: () => NOT_YET_APPROVED,
  revenue_per_session_cents: gated((c) => {
    const { cents, warnings } = listedWithWarnings(c);
    return healthyValue(
      perUnit(cents, c.summary.completedSessionCount),
      {
        revenue_cents: cents,
        completed_sessions: c.summary.completedSessionCount,
      },
      warnings,
    );
  }),
  revenue_per_hour_cents: gated((c) => {
    const { cents, warnings } = listedWithWarnings(c);
    return healthyValue(
      perHour(cents, c.summary.coachingMinutes),
      { revenue_cents: cents, coaching_minutes: c.summary.coachingMinutes },
      warnings,
    );
  }),
  average_session_value_cents: gated((c) => {
    const values = c.appointments
      .filter((a) => a.canonicalStatus === "completed" && a.listedCents !== null)
      .map((a) => a.listedCents!);
    return healthyValue(mean(values), { sample_size: values.length });
  }),
  revenue_growth_bp: gated((c) =>
    healthyValue(
      growthBp(c.summary.completedListedCents, c.previousSummary.completedListedCents),
      {
        current_cents: c.summary.completedListedCents,
        previous_cents: c.previousSummary.completedListedCents,
      },
      c.previousSummary.completedListedCents === 0
        ? ["No revenue in the previous window — growth is undefined."]
        : undefined,
    ),
  ),
  rolling_revenue_30d_cents: gated((c) => {
    const from = shiftDate(c.filters.dateTo, -29);
    const windowFacts = scopeAppointments(c.dataset.appointments, c.scope, {
      ...c.filters,
      dateFrom: from,
    });
    const cents = windowFacts
      .filter((a) => a.canonicalStatus === "completed")
      .reduce((s, a) => s + (a.listedCents ?? 0), 0);
    const fullyCovered = c.dataset.loadedFrom <= from;
    return {
      value: cents,
      health: fullyCovered ? "healthy" : "incomplete",
      reasons: fullyCovered
        ? undefined
        : ["The loaded windows cover fewer than 30 days before the range end."],
      metadata: { window_from: from, window_to: c.filters.dateTo },
    };
  }),
};
