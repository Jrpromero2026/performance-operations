/**
 * Typed per-method evaluators. Each compensation method has its own small
 * evaluator with explicit inputs and a transparent trace; there is no
 * generic untyped fallback. Anything the configuration does not resolve
 * explicitly produces a BLOCKED line + issue (fail closed) — see
 * docs/business-rules/payroll-rule-gaps.md.
 */

import type { RuleType } from "@/lib/schemas/compensation";
import {
  evaluateEligibility,
  criteriaConstrainsStatus,
  type EligibilityContext,
} from "./eligibility";
import {
  applyRateRounded,
  minutesTimesHourlyRate,
  roundRational,
  type RoundingMethod,
} from "./rounding";
import {
  CALCULATION_VERSION,
  type AssignmentRole,
  type CalculationTrace,
  type EngineAppointment,
  type EngineIssue,
  type EngineLine,
  type EngineParticipation,
  type EnginePlanVersion,
  type EngineRule,
  type EngineTier,
  type LineType,
  type TraceStep,
} from "./types";

export interface SessionEvalContext {
  appointment: EngineAppointment;
  participation: EngineParticipation;
  plan: EnginePlanVersion;
  rounding: RoundingMethod;
}

export interface SessionEvalOutcome {
  line: EngineLine;
  issues: EngineIssue[];
  /** Eligible revenue basis this line contributes to period commission tiers. */
  tierBasisCents?: number;
}

/* ------------------------------------------------------------- helpers */

function trace(method: string, steps: TraceStep[]): CalculationTrace {
  return { version: CALCULATION_VERSION, method, steps };
}

function eligibilityContext(a: EngineAppointment): EligibilityContext {
  return {
    canonical_status: a.canonicalStatus,
    service_id: a.serviceId,
    department_id: a.departmentId,
    duration_minutes: a.durationMinutes,
    participant_count: a.participantCount,
    payment_status: a.paymentStatus,
  };
}

function baseLine(
  ctx: SessionEvalContext,
  lineType: LineType,
): Omit<
  EngineLine,
  | "calculationStatus"
  | "calculatedAmountCents"
  | "roundedAmountCents"
  | "eligibilityResult"
  | "exclusionReason"
  | "trace"
> {
  return {
    lineType,
    trainerId: ctx.participation.trainerId,
    appointmentId: ctx.appointment.id,
    appointmentAssignmentId: ctx.participation.assignmentId,
    manualTimeEntryId: null,
    payrollAdjustmentId: null,
    planVersionId: ctx.plan.id,
    ruleId: null,
    inputQuantity: null,
    inputUnit: null,
    basisAmountCents: null,
    rateAmountCents: null,
    rateBasisPoints: null,
    roundingMethod: ctx.rounding,
  };
}

function blockedLine(
  ctx: SessionEvalContext,
  lineType: LineType,
  code: string,
  message: string,
  suggestedAction: string,
  ruleId: string | null = null,
): SessionEvalOutcome {
  return {
    line: {
      ...baseLine(ctx, lineType),
      ruleId,
      calculationStatus: "blocked",
      calculatedAmountCents: 0,
      roundedAmountCents: 0,
      eligibilityResult: "blocked",
      exclusionReason: code,
      trace: trace(ctx.plan.method, [
        { step: "blocked", detail: message },
      ]),
    },
    issues: [
      {
        code,
        severity: "blocking",
        message,
        suggestedAction,
        trainerId: ctx.participation.trainerId,
        appointmentId: ctx.appointment.id,
        ruleId,
        entityType: "appointment",
        entityId: ctx.appointment.id,
      },
    ],
  };
}

function excludedLine(
  ctx: SessionEvalContext,
  lineType: LineType,
  reason: string,
  ruleId: string | null,
  extraSteps: TraceStep[] = [],
): SessionEvalOutcome {
  return {
    line: {
      ...baseLine(ctx, lineType),
      ruleId,
      calculationStatus: "excluded",
      calculatedAmountCents: 0,
      roundedAmountCents: 0,
      eligibilityResult: "ineligible",
      exclusionReason: reason,
      trace: trace(ctx.plan.method, [
        ...extraSteps,
        { step: "excluded", detail: reason },
      ]),
    },
    issues: [],
  };
}

function findRule(plan: EnginePlanVersion, ruleType: RuleType): EngineRule | null {
  return plan.rules.find((r) => r.ruleType === ruleType) ?? null;
}

/**
 * Resolve the revenue basis for a rule. Fails closed when the basis type is
 * unresolved or the source amount is missing.
 */
function resolveBasis(
  rule: EngineRule,
  a: EngineAppointment,
): { cents: number; label: string } | { blocked: string } {
  switch (rule.basisType) {
    case "source_listed_amount":
      if (a.listedAmountCents === null) {
        return { blocked: "missing_source_listed_amount" };
      }
      return { cents: a.listedAmountCents, label: "source listed amount" };
    case "source_paid_amount":
      if (a.paidAmountCents === null) {
        return { blocked: "missing_source_paid_amount" };
      }
      return { cents: a.paidAmountCents, label: "source paid amount" };
    case null:
      return { blocked: "basis_type_unresolved" };
    default:
      return { blocked: `basis_type_unsupported:${rule.basisType}` };
  }
}

/** Shared gate: criteria eligibility with status-constraint enforcement. */
function gateEligibility(
  ctx: SessionEvalContext,
  rule: EngineRule,
  lineType: LineType,
  requireStatusCriteria: boolean,
): SessionEvalOutcome | null {
  if (requireStatusCriteria && !criteriaConstrainsStatus(rule.criteria)) {
    return blockedLine(
      ctx,
      lineType,
      "rule_missing_status_criteria",
      `Rule ${rule.ruleType} does not declare eligible appointment statuses; cancellation/no-show pay policy is unresolved.`,
      "Add a canonical_status condition to the rule criteria (e.g. in [completed]).",
      rule.id,
    );
  }
  const outcome = evaluateEligibility(rule.criteria, eligibilityContext(ctx.appointment));
  if (outcome.result === "blocked") {
    return blockedLine(
      ctx,
      lineType,
      "rule_criteria_malformed",
      `Rule ${rule.ruleType}: ${outcome.reason}`,
      "Fix the rule criteria JSON in compensation configuration.",
      rule.id,
    );
  }
  if (outcome.result === "ineligible") {
    return excludedLine(ctx, lineType, outcome.reason, rule.id, [
      {
        step: "eligibility",
        detail: `Appointment failed rule criteria: ${outcome.reason}`,
      },
    ]);
  }
  return null; // eligible
}

/* --------------------------------------------------- flat per session */

export function evaluateFlatPerSession(ctx: SessionEvalContext): SessionEvalOutcome {
  const rule = findRule(ctx.plan, "session_rate");
  if (!rule || rule.amountCents === null) {
    return blockedLine(
      ctx,
      "session_flat",
      "rule_missing_for_method",
      "flat_per_session plan has no session_rate amount.",
      "Add a session_rate rule with a flat amount to the plan version.",
    );
  }
  const gate = gateEligibility(ctx, rule, "session_flat", true);
  if (gate) return gate;

  const amount = rule.amountCents;
  return {
    line: {
      ...baseLine(ctx, "session_flat"),
      ruleId: rule.id,
      inputQuantity: 1,
      inputUnit: "session",
      rateAmountCents: amount,
      calculationStatus: "calculated",
      calculatedAmountCents: amount,
      roundedAmountCents: amount,
      eligibilityResult: "eligible",
      exclusionReason: null,
      trace: trace(ctx.plan.method, [
        {
          step: "flat_rate",
          detail: "1 session × flat session rate",
          values: { rate_cents: amount, amount_cents: amount },
        },
      ]),
    },
    issues: [],
  };
}

/* --------------------------------------------------------- hourly (session) */

export function evaluateHourlySession(ctx: SessionEvalContext): SessionEvalOutcome {
  const rule = findRule(ctx.plan, "hourly_rate");
  if (!rule || rule.amountCents === null) {
    return blockedLine(
      ctx,
      "hourly",
      "rule_missing_for_method",
      "hourly plan has no hourly_rate amount.",
      "Add an hourly_rate rule with an hourly amount to the plan version.",
    );
  }
  const gate = gateEligibility(ctx, rule, "hourly", true);
  if (gate) return gate;

  const minutes =
    ctx.participation.compensatedMinutes ?? ctx.appointment.durationMinutes;
  const amount = minutesTimesHourlyRate(minutes, rule.amountCents, ctx.rounding);
  return {
    line: {
      ...baseLine(ctx, "hourly"),
      ruleId: rule.id,
      inputQuantity: minutes,
      inputUnit: "minutes",
      rateAmountCents: rule.amountCents,
      calculationStatus: "calculated",
      calculatedAmountCents: amount,
      roundedAmountCents: amount,
      eligibilityResult: "eligible",
      exclusionReason: null,
      trace: trace(ctx.plan.method, [
        {
          step: "hourly",
          detail: "minutes × hourly rate ÷ 60, rounded",
          values: {
            minutes,
            hourly_rate_cents: rule.amountCents,
            rounding: ctx.rounding,
            amount_cents: amount,
          },
        },
      ]),
    },
    issues: [],
  };
}

/* ------------------------------------------- percentage of revenue basis */

export function evaluatePercentageSession(
  ctx: SessionEvalContext,
): SessionEvalOutcome {
  const rule = findRule(ctx.plan, "revenue_rate");
  if (!rule || rule.rateBasisPoints === null) {
    return blockedLine(
      ctx,
      "session_percentage",
      "rule_missing_for_method",
      `${ctx.plan.method} plan has no revenue_rate percentage.`,
      "Add a revenue_rate rule with a basis-point rate to the plan version.",
    );
  }
  const gate = gateEligibility(ctx, rule, "session_percentage", true);
  if (gate) return gate;

  const basis = resolveBasis(rule, ctx.appointment);
  if ("blocked" in basis) {
    return blockedLine(
      ctx,
      "session_percentage",
      basis.blocked.startsWith("missing_source")
        ? "missing_basis_amount"
        : "basis_type_unresolved",
      `Cannot resolve revenue basis for rule revenue_rate: ${basis.blocked}.`,
      basis.blocked === "basis_type_unresolved"
        ? "Set basis_type on the rule (source_listed_amount or source_paid_amount)."
        : "Correct the imported appointment amounts or exclude the appointment.",
      rule.id,
    );
  }

  const amount = applyRateRounded(basis.cents, rule.rateBasisPoints, ctx.rounding);
  return {
    line: {
      ...baseLine(ctx, "session_percentage"),
      ruleId: rule.id,
      inputQuantity: 1,
      inputUnit: "session",
      basisAmountCents: basis.cents,
      rateBasisPoints: rule.rateBasisPoints,
      calculationStatus: "calculated",
      calculatedAmountCents: amount,
      roundedAmountCents: amount,
      eligibilityResult: "eligible",
      exclusionReason: null,
      trace: trace(ctx.plan.method, [
        {
          step: "basis",
          detail: `Revenue basis = ${basis.label}`,
          values: { basis_cents: basis.cents },
        },
        {
          step: "rate",
          detail: "basis × rate (basis points ÷ 10000), rounded",
          values: {
            rate_basis_points: rule.rateBasisPoints,
            rounding: ctx.rounding,
            amount_cents: amount,
          },
        },
      ]),
    },
    issues: [],
  };
}

/* -------------------------------------- tiered commission (period level) */

/**
 * Per-session step for tiered revenue_commission: the session contributes
 * eligible basis; pay is computed once per period over the trainer's total.
 * The returned line is informational (zero amount) with the basis recorded.
 */
export function evaluateTierBasisSession(
  ctx: SessionEvalContext,
): SessionEvalOutcome {
  const rule = findRule(ctx.plan, "revenue_rate");
  if (!rule) {
    return blockedLine(
      ctx,
      "commission_tier",
      "rule_missing_for_method",
      "Tiered revenue_commission plan has no revenue_rate rule declaring basis and eligibility.",
      "Add a revenue_rate rule (rate may be 0 bp; tiers carry the rates) with basis_type and status criteria.",
    );
  }
  const gate = gateEligibility(ctx, rule, "commission_tier", true);
  if (gate) return gate;

  const basis = resolveBasis(rule, ctx.appointment);
  if ("blocked" in basis) {
    return blockedLine(
      ctx,
      "commission_tier",
      basis.blocked.startsWith("missing_source")
        ? "missing_basis_amount"
        : "basis_type_unresolved",
      `Cannot resolve tier basis: ${basis.blocked}.`,
      basis.blocked === "basis_type_unresolved"
        ? "Set basis_type on the revenue_rate rule."
        : "Correct the imported appointment amounts or exclude the appointment.",
      rule.id,
    );
  }

  return {
    tierBasisCents: basis.cents,
    line: {
      ...baseLine(ctx, "commission_tier"),
      ruleId: rule.id,
      inputQuantity: 1,
      inputUnit: "session",
      basisAmountCents: basis.cents,
      calculationStatus: "calculated",
      calculatedAmountCents: 0,
      roundedAmountCents: 0,
      eligibilityResult: "eligible",
      exclusionReason: null,
      trace: trace(ctx.plan.method, [
        {
          step: "tier_basis",
          detail:
            "Session contributes eligible basis; commission is computed on the period total (see the trainer's commission_tier summary line).",
          values: { basis_cents: basis.cents },
        },
      ]),
    },
    issues: [],
  };
}

export interface TierComputation {
  amountCents: number;
  steps: TraceStep[];
}

/** Cliff tiers: the single tier containing the total applies to ALL basis. */
export function computeCliffCommission(
  totalBasisCents: number,
  tiers: EngineTier[],
  rounding: RoundingMethod,
): TierComputation | { blocked: string } {
  const sorted = [...tiers].sort((a, b) => a.sequence - b.sequence);
  const match = sorted.find(
    (t) =>
      totalBasisCents >= t.minRevenueCents &&
      (t.maxRevenueCents === null || totalBasisCents < t.maxRevenueCents),
  );
  if (!match) {
    return { blocked: `tier_gap: no tier covers total basis ${totalBasisCents}` };
  }
  const amount = applyRateRounded(totalBasisCents, match.rateBasisPoints, rounding);
  return {
    amountCents: amount,
    steps: [
      {
        step: "cliff_tier",
        detail: `Total basis falls in tier ${match.sequence}; its rate applies to the entire basis.`,
        values: {
          total_basis_cents: totalBasisCents,
          tier_sequence: match.sequence,
          tier_min_cents: match.minRevenueCents,
          tier_max_cents: match.maxRevenueCents,
          rate_basis_points: match.rateBasisPoints,
          amount_cents: amount,
        },
      },
    ],
  };
}

/** Marginal tiers: each tier's rate applies only to basis inside its range. */
export function computeMarginalCommission(
  totalBasisCents: number,
  tiers: EngineTier[],
  rounding: RoundingMethod,
): TierComputation | { blocked: string } {
  const sorted = [...tiers].sort((a, b) => a.sequence - b.sequence);
  const steps: TraceStep[] = [];
  // Sum exact numerators (cents × bp) and round ONCE for determinism.
  let numerator = 0;
  let covered = 0;
  for (const tier of sorted) {
    if (totalBasisCents <= tier.minRevenueCents) break;
    if (tier.minRevenueCents !== covered) {
      return {
        blocked: `tier_gap: coverage stops at ${covered}, next tier starts at ${tier.minRevenueCents}`,
      };
    }
    const upper =
      tier.maxRevenueCents === null
        ? totalBasisCents
        : Math.min(tier.maxRevenueCents, totalBasisCents);
    const slice = upper - tier.minRevenueCents;
    numerator += slice * tier.rateBasisPoints;
    covered = upper;
    steps.push({
      step: "marginal_tier",
      detail: `Tier ${tier.sequence} rate applies to basis within its range.`,
      values: {
        tier_sequence: tier.sequence,
        slice_cents: slice,
        rate_basis_points: tier.rateBasisPoints,
        slice_pay_exact: `${slice * tier.rateBasisPoints}/10000`,
      },
    });
  }
  if (covered < totalBasisCents) {
    return {
      blocked: `tier_gap: tiers cover basis up to ${covered} of ${totalBasisCents}`,
    };
  }
  const amount = roundRational(numerator, 10_000, rounding);
  steps.push({
    step: "marginal_total",
    detail: "Tier slices summed exactly, rounded once.",
    values: {
      total_basis_cents: totalBasisCents,
      rounding,
      amount_cents: amount,
    },
  });
  return { amountCents: amount, steps };
}

/* ----------------------------------------------------- team / role rates */

const ROLE_RULE_TYPES: Partial<Record<AssignmentRole, RuleType>> = {
  head_coach: "head_coach_rate",
  assistant_coach: "assistant_coach_rate",
};

/**
 * Team-role evaluation. `primary` participations on a team_training_rate
 * plan use the team_training_rate rule; head/assistant coach roles use
 * their role-specific rules. Rules may be flat (amount per session) or a
 * percentage of a declared basis. Unknown roles fail closed.
 */
export function evaluateTeamRole(ctx: SessionEvalContext): SessionEvalOutcome {
  const role = ctx.participation.role;
  const ruleType: RuleType | null =
    role === "primary"
      ? "team_training_rate"
      : (ROLE_RULE_TYPES[role] ?? null);
  if (ruleType === null) {
    return blockedLine(
      ctx,
      "team_role",
      "unsupported_assignment_role",
      `No compensation rule mapping exists for assignment role '${role}'.`,
      "Assign a supported role (primary, head_coach, assistant_coach) or mark the participation non_compensated.",
    );
  }
  const rule = findRule(ctx.plan, ruleType);
  if (!rule) {
    return blockedLine(
      ctx,
      "team_role",
      "rule_missing_for_method",
      `Plan has no ${ruleType} rule for role '${role}'.`,
      `Add a ${ruleType} rule to the plan version.`,
    );
  }
  const gate = gateEligibility(ctx, rule, "team_role", true);
  if (gate) return gate;

  if (rule.amountCents !== null) {
    const amount = rule.amountCents;
    return {
      line: {
        ...baseLine(ctx, "team_role"),
        ruleId: rule.id,
        inputQuantity: 1,
        inputUnit: "session",
        rateAmountCents: amount,
        calculationStatus: "calculated",
        calculatedAmountCents: amount,
        roundedAmountCents: amount,
        eligibilityResult: "eligible",
        exclusionReason: null,
        trace: trace(ctx.plan.method, [
          {
            step: "role_flat_rate",
            detail: `Role '${role}': 1 session × flat ${ruleType}`,
            values: { rate_cents: amount, amount_cents: amount },
          },
        ]),
      },
      issues: [],
    };
  }

  // Percentage form.
  const basis = resolveBasis(rule, ctx.appointment);
  if ("blocked" in basis) {
    return blockedLine(
      ctx,
      "team_role",
      basis.blocked.startsWith("missing_source")
        ? "missing_basis_amount"
        : "basis_type_unresolved",
      `Cannot resolve basis for ${ruleType}: ${basis.blocked}.`,
      basis.blocked === "basis_type_unresolved"
        ? `Set basis_type on the ${ruleType} rule.`
        : "Correct the imported appointment amounts or exclude the appointment.",
      rule.id,
    );
  }
  const amount = applyRateRounded(
    basis.cents,
    rule.rateBasisPoints ?? 0,
    ctx.rounding,
  );
  return {
    line: {
      ...baseLine(ctx, "team_role"),
      ruleId: rule.id,
      inputQuantity: 1,
      inputUnit: "session",
      basisAmountCents: basis.cents,
      rateBasisPoints: rule.rateBasisPoints,
      calculationStatus: "calculated",
      calculatedAmountCents: amount,
      roundedAmountCents: amount,
      eligibilityResult: "eligible",
      exclusionReason: null,
      trace: trace(ctx.plan.method, [
        {
          step: "basis",
          detail: `Revenue basis = ${basis.label}`,
          values: { basis_cents: basis.cents },
        },
        {
          step: "role_rate",
          detail: `Role '${role}': basis × ${ruleType} (basis points ÷ 10000), rounded`,
          values: {
            rate_basis_points: rule.rateBasisPoints,
            rounding: ctx.rounding,
            amount_cents: amount,
          },
        },
      ]),
    },
    issues: [],
  };
}

/* ------------------------------------------------------ evaluation bonus */

export function evaluateEvaluationBonus(ctx: SessionEvalContext): SessionEvalOutcome {
  const rule = findRule(ctx.plan, "evaluation_bonus");
  if (!rule || rule.amountCents === null) {
    return blockedLine(
      ctx,
      "evaluation_bonus",
      "rule_missing_for_method",
      "evaluation_bonus plan has no evaluation_bonus amount.",
      "Add an evaluation_bonus rule with a flat amount to the plan version.",
    );
  }
  const gate = gateEligibility(ctx, rule, "evaluation_bonus", true);
  if (gate) return gate;

  const amount = rule.amountCents;
  return {
    line: {
      ...baseLine(ctx, "evaluation_bonus"),
      ruleId: rule.id,
      inputQuantity: 1,
      inputUnit: "session",
      rateAmountCents: amount,
      calculationStatus: "calculated",
      calculatedAmountCents: amount,
      roundedAmountCents: amount,
      eligibilityResult: "eligible",
      exclusionReason: null,
      trace: trace(ctx.plan.method, [
        {
          step: "evaluation_bonus",
          detail: "1 evaluation × flat bonus",
          values: { rate_cents: amount, amount_cents: amount },
        },
      ]),
    },
    issues: [],
  };
}

/* ------------------------------------------------------------- registry */

export type SessionEvaluator = (ctx: SessionEvalContext) => SessionEvalOutcome;

/**
 * Session-scope evaluator registry. Methods absent here are NOT payable from
 * the appointment ledger (package sales, nutrition clients, manual bonuses)
 * — the engine fails closed with an explicit issue instead of guessing.
 */
export const SESSION_EVALUATORS: Partial<Record<string, SessionEvaluator>> = {
  flat_per_session: evaluateFlatPerSession,
  hourly: evaluateHourlySession,
  percentage_of_revenue: evaluatePercentageSession,
  team_training_rate: evaluateTeamRole,
  head_coach_rate: evaluateTeamRole,
  assistant_coach_rate: evaluateTeamRole,
  evaluation_bonus: evaluateEvaluationBonus,
  // revenue_commission is dispatched by tier_behavior in the engine:
  //   not_applicable → evaluatePercentageSession
  //   cliff/marginal → evaluateTierBasisSession + period-level tier computation
};
