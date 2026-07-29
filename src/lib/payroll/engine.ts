/**
 * Deterministic payroll calculation orchestrator.
 *
 * Pure function of its inputs: same ledger + configuration always produces
 * the same lines, issues, and totals (stable ordering, integer-only money,
 * versioned as CALCULATION_VERSION). Unresolved configuration NEVER pays —
 * it produces blocked lines + blocking issues (fail closed).
 */

import {
  DEFAULT_ROUNDING_METHOD,
  roundRational,
  minutesTimesHourlyRate,
  type RoundingMethod,
} from "./rounding";
import {
  SESSION_EVALUATORS,
  evaluatePercentageSession,
  evaluateTierBasisSession,
  computeCliffCommission,
  computeMarginalCommission,
  type SessionEvalContext,
  type SessionEvalOutcome,
} from "./evaluators";
import {
  CALCULATION_VERSION,
  type EngineAppointment,
  type EngineInput,
  type EngineIssue,
  type EngineLine,
  type EngineParticipation,
  type EnginePlanAssignment,
  type EnginePlanVersion,
  type EngineResult,
  type EngineTrainerResult,
  type TrainerTotals,
} from "./types";

export class EngineReconciliationError extends Error {}

/** Methods whose amounts derive from percentages (rounding-scope sensitive). */
const PERCENTAGE_METHODS = new Set([
  "percentage_of_revenue",
  "revenue_commission",
]);

const zeroTotals = (): TrainerTotals => ({
  appointmentCount: 0,
  completedSessionCount: 0,
  compensatedMinutes: 0,
  eligibleBasisTotalCents: 0,
  commissionCents: 0,
  flatRateCents: 0,
  hourlyCents: 0,
  teamCents: 0,
  bonusCents: 0,
  deductionCents: 0,
  adjustmentCents: 0,
  finalGrossCents: 0,
});

interface TrainerWork {
  participations: { appointment: EngineAppointment; participation: EngineParticipation }[];
}

function issueOnce(issues: EngineIssue[], issue: EngineIssue): void {
  const exists = issues.some(
    (i) =>
      i.code === issue.code &&
      i.trainerId === issue.trainerId &&
      i.appointmentId === issue.appointmentId &&
      i.entityId === issue.entityId,
  );
  if (!exists) issues.push(issue);
}

function planForPurpose(
  assignments: EnginePlanAssignment[],
  trainerId: string,
  purpose: string,
): EnginePlanAssignment | null {
  return (
    assignments.find((a) => a.trainerId === trainerId && a.purpose === purpose) ??
    null
  );
}

/** Session plan resolution: coach roles prefer the team_training plan. */
function planForParticipation(
  assignments: EnginePlanAssignment[],
  participation: EngineParticipation,
): EnginePlanAssignment | null {
  if (
    participation.role === "head_coach" ||
    participation.role === "assistant_coach" ||
    participation.role === "support_coach"
  ) {
    return (
      planForPurpose(assignments, participation.trainerId, "team_training") ??
      planForPurpose(assignments, participation.trainerId, "primary")
    );
  }
  return planForPurpose(assignments, participation.trainerId, "primary");
}

/**
 * A percentage-method plan whose rounding scope is unresolved must not pay.
 * (docs/business-rules/payroll-rule-gaps.md item 16.)
 */
function roundingScopeBlocked(plan: EnginePlanVersion): boolean {
  return PERCENTAGE_METHODS.has(plan.method) && plan.roundingScope === null;
}

export function calculatePayroll(input: EngineInput): EngineResult {
  const issues: EngineIssue[] = [];

  // Deterministic ordering.
  const appointments = [...input.appointments].sort((a, b) =>
    a.startAt === b.startAt
      ? a.id.localeCompare(b.id)
      : a.startAt.localeCompare(b.startAt),
  );

  // Collect the trainer universe.
  const trainerIds = new Set<string>(input.trainerIds);
  for (const a of appointments) {
    for (const p of a.participations) trainerIds.add(p.trainerId);
  }
  for (const t of input.timeEntries) trainerIds.add(t.trainerId);
  for (const adj of input.adjustments) trainerIds.add(adj.trainerId);

  // Group session participations per trainer.
  const work = new Map<string, TrainerWork>();
  for (const id of trainerIds) work.set(id, { participations: [] });
  for (const appointment of appointments) {
    for (const participation of appointment.participations) {
      work.get(participation.trainerId)!.participations.push({
        appointment,
        participation,
      });
    }
  }

  const trainers: EngineTrainerResult[] = [];

  for (const trainerId of [...trainerIds].sort()) {
    const { participations } = work.get(trainerId)!;
    const lines: EngineLine[] = [];
    const trainerIssues: EngineIssue[] = [];
    const totals = zeroTotals();
    const primaryPlan = planForPurpose(input.planAssignments, trainerId, "primary");

    // Tier accumulation (per plan version — a trainer has at most one).
    let tierBasisCents = 0;
    let tierPlan: EnginePlanVersion | null = null;

    const seenAppointments = new Set<string>();
    const completedAppointments = new Set<string>();

    for (const { appointment, participation } of participations) {
      seenAppointments.add(appointment.id);
      if (appointment.canonicalStatus === "completed") {
        completedAppointments.add(appointment.id);
      }

      if (
        participation.role === "observer" ||
        participation.role === "non_compensated"
      ) {
        continue; // never compensated; not even an excluded line
      }

      const assignment = planForParticipation(input.planAssignments, participation);
      if (!assignment) {
        issueOnce(trainerIssues, {
          code: "trainer_missing_compensation_plan",
          severity: "blocking",
          message:
            "Trainer has appointments in the period but no active compensation plan assignment.",
          suggestedAction:
            "Assign a published compensation plan version to the trainer for purpose 'primary'.",
          trainerId,
          appointmentId: null,
          ruleId: null,
          entityType: "trainer",
          entityId: trainerId,
        });
        continue;
      }
      const plan = assignment.planVersion;

      if (roundingScopeBlocked(plan)) {
        issueOnce(trainerIssues, {
          code: "rounding_scope_unresolved",
          severity: "blocking",
          message: `Plan '${plan.planName}' uses percentages but does not declare a rounding scope.`,
          suggestedAction:
            "Set rounding_scope (per_line or per_trainer) on the plan version.",
          trainerId,
          appointmentId: null,
          ruleId: null,
          entityType: "compensation_plan_version",
          entityId: plan.id,
        });
        continue;
      }

      const ctx: SessionEvalContext = {
        appointment,
        participation,
        plan,
        rounding: DEFAULT_ROUNDING_METHOD,
      };

      let outcome: SessionEvalOutcome;
      if (plan.method === "revenue_commission") {
        if (plan.tierBehavior === "not_applicable") {
          outcome = evaluatePercentageSession(ctx);
        } else if (plan.tiers.length === 0) {
          issueOnce(trainerIssues, {
            code: "tiers_missing",
            severity: "blocking",
            message: `Plan '${plan.planName}' declares ${plan.tierBehavior} tiers but has none configured.`,
            suggestedAction: "Configure commission tiers on the plan version.",
            trainerId,
            appointmentId: null,
            ruleId: null,
            entityType: "compensation_plan_version",
            entityId: plan.id,
          });
          continue;
        } else {
          outcome = evaluateTierBasisSession(ctx);
          if (outcome.tierBasisCents !== undefined) {
            tierBasisCents += outcome.tierBasisCents;
            tierPlan = plan;
          }
        }
      } else {
        const evaluator = SESSION_EVALUATORS[plan.method];
        if (!evaluator) {
          issueOnce(trainerIssues, {
            code: "method_not_evaluable_from_ledger",
            severity: "blocking",
            message: `Compensation method '${plan.method}' cannot be paid from appointment data.`,
            suggestedAction:
              "Use manual time entries or adjustments for this compensation, or assign a session-based plan.",
            trainerId,
            appointmentId: null,
            ruleId: null,
            entityType: "compensation_plan_version",
            entityId: plan.id,
          });
          continue;
        }
        outcome = evaluator(ctx);
      }

      lines.push(outcome.line);
      for (const issue of outcome.issues) issueOnce(trainerIssues, issue);

      if (
        outcome.line.calculationStatus === "calculated" &&
        outcome.line.eligibilityResult === "eligible"
      ) {
        totals.compensatedMinutes +=
          participation.compensatedMinutes ?? appointment.durationMinutes;
        if (outcome.line.basisAmountCents !== null) {
          totals.eligibleBasisTotalCents += outcome.line.basisAmountCents;
        }
      }
    }

    // Period-level tiered commission line.
    if (tierPlan) {
      const computation =
        tierPlan.tierBehavior === "cliff"
          ? computeCliffCommission(tierBasisCents, tierPlan.tiers, DEFAULT_ROUNDING_METHOD)
          : computeMarginalCommission(tierBasisCents, tierPlan.tiers, DEFAULT_ROUNDING_METHOD);
      if ("blocked" in computation) {
        issueOnce(trainerIssues, {
          code: "tier_gap",
          severity: "blocking",
          message: `Commission tiers do not cover the trainer's eligible basis: ${computation.blocked}.`,
          suggestedAction:
            "Fix the tier ranges on the plan version so they cover all revenue without gaps.",
          trainerId,
          appointmentId: null,
          ruleId: null,
          entityType: "compensation_plan_version",
          entityId: tierPlan.id,
        });
      } else {
        lines.push({
          lineType: "commission_tier",
          calculationStatus: "calculated",
          trainerId,
          appointmentId: null,
          appointmentAssignmentId: null,
          manualTimeEntryId: null,
          payrollAdjustmentId: null,
          planVersionId: tierPlan.id,
          ruleId: null,
          inputQuantity: null,
          inputUnit: "period_basis",
          basisAmountCents: tierBasisCents,
          rateAmountCents: null,
          rateBasisPoints: null,
          calculatedAmountCents: computation.amountCents,
          roundedAmountCents: computation.amountCents,
          roundingMethod: DEFAULT_ROUNDING_METHOD,
          eligibilityResult: "eligible",
          exclusionReason: null,
          trace: {
            version: CALCULATION_VERSION,
            method: `revenue_commission:${tierPlan.tierBehavior}`,
            steps: computation.steps,
          },
        });
      }
    }

    // Per-trainer rounding scope reconciliation for percentage session lines.
    if (primaryPlan?.planVersion.roundingScope === "per_trainer") {
      reconcilePerTrainerRounding(lines, DEFAULT_ROUNDING_METHOD);
    }

    // Manual time entries.
    for (const entry of input.timeEntries
      .filter((t) => t.trainerId === trainerId)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const assignment = planForPurpose(
        input.planAssignments,
        trainerId,
        entry.compensationPurpose,
      );
      const rule = assignment
        ? assignment.planVersion.method === "admin_hourly"
          ? assignment.planVersion.rules.find((r) => r.ruleType === "admin_hourly_rate")
          : assignment.planVersion.method === "hourly"
            ? assignment.planVersion.rules.find((r) => r.ruleType === "hourly_rate")
            : undefined
        : undefined;
      if (!assignment || !rule || rule.amountCents === null) {
        lines.push({
          lineType: "manual_time",
          calculationStatus: "blocked",
          trainerId,
          appointmentId: null,
          appointmentAssignmentId: null,
          manualTimeEntryId: entry.id,
          payrollAdjustmentId: null,
          planVersionId: assignment?.planVersion.id ?? null,
          ruleId: null,
          inputQuantity: entry.approvedMinutes,
          inputUnit: "minutes",
          basisAmountCents: null,
          rateAmountCents: null,
          rateBasisPoints: null,
          calculatedAmountCents: 0,
          roundedAmountCents: 0,
          roundingMethod: DEFAULT_ROUNDING_METHOD,
          eligibilityResult: "blocked",
          exclusionReason: "missing_hourly_rate",
          trace: {
            version: CALCULATION_VERSION,
            method: "manual_time",
            steps: [
              {
                step: "blocked",
                detail: `No hourly-rate plan assigned for purpose '${entry.compensationPurpose}'.`,
              },
            ],
          },
        });
        issueOnce(trainerIssues, {
          code: "missing_hourly_rate",
          severity: "blocking",
          message: `Approved time entry (${entry.workCategory}, ${entry.workDate}) has no hourly-rate plan for purpose '${entry.compensationPurpose}'.`,
          suggestedAction:
            "Assign an hourly or admin_hourly plan version to the trainer for this purpose.",
          trainerId,
          appointmentId: null,
          ruleId: null,
          entityType: "manual_time_entry",
          entityId: entry.id,
        });
        continue;
      }
      const amount = minutesTimesHourlyRate(
        entry.approvedMinutes,
        rule.amountCents,
        DEFAULT_ROUNDING_METHOD,
      );
      lines.push({
        lineType: "manual_time",
        calculationStatus: "calculated",
        trainerId,
        appointmentId: null,
        appointmentAssignmentId: null,
        manualTimeEntryId: entry.id,
        payrollAdjustmentId: null,
        planVersionId: assignment.planVersion.id,
        ruleId: rule.id,
        inputQuantity: entry.approvedMinutes,
        inputUnit: "minutes",
        basisAmountCents: null,
        rateAmountCents: rule.amountCents,
        rateBasisPoints: null,
        calculatedAmountCents: amount,
        roundedAmountCents: amount,
        roundingMethod: DEFAULT_ROUNDING_METHOD,
        eligibilityResult: "eligible",
        exclusionReason: null,
        trace: {
          version: CALCULATION_VERSION,
          method: "manual_time",
          steps: [
            {
              step: "hourly",
              detail: `Approved ${entry.workCategory} time: minutes × hourly rate ÷ 60, rounded`,
              values: {
                work_date: entry.workDate,
                minutes: entry.approvedMinutes,
                hourly_rate_cents: rule.amountCents,
                amount_cents: amount,
              },
            },
          ],
        },
      });
      totals.compensatedMinutes += entry.approvedMinutes;
    }

    // Approved adjustments (sign carried by type; amounts stored >= 0).
    for (const adj of input.adjustments
      .filter((a) => a.trainerId === trainerId)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const signed =
        adj.adjustmentType === "deduction" ? -adj.amountCents : adj.amountCents;
      lines.push({
        lineType: adj.adjustmentType === "carry_forward" ? "carry_forward" : "adjustment",
        calculationStatus: "calculated",
        trainerId,
        appointmentId: null,
        appointmentAssignmentId: null,
        manualTimeEntryId: null,
        payrollAdjustmentId: adj.id,
        planVersionId: null,
        ruleId: null,
        inputQuantity: null,
        inputUnit: null,
        basisAmountCents: null,
        rateAmountCents: null,
        rateBasisPoints: null,
        calculatedAmountCents: signed,
        roundedAmountCents: signed,
        roundingMethod: DEFAULT_ROUNDING_METHOD,
        eligibilityResult: "eligible",
        exclusionReason: null,
        trace: {
          version: CALCULATION_VERSION,
          method: "adjustment",
          steps: [
            {
              step: adj.adjustmentType,
              detail: `Approved ${adj.adjustmentType}: ${adj.reason}`,
              values: { amount_cents: signed },
            },
          ],
        },
      });
    }

    // Category totals from the final line set.
    let evaluationBonusCents = 0;
    for (const line of lines) {
      if (line.calculationStatus !== "calculated") continue;
      switch (line.lineType) {
        case "session_percentage":
        case "commission_tier":
          totals.commissionCents += line.roundedAmountCents;
          break;
        case "session_flat":
          totals.flatRateCents += line.roundedAmountCents;
          break;
        case "hourly":
        case "manual_time":
          totals.hourlyCents += line.roundedAmountCents;
          break;
        case "team_role":
          totals.teamCents += line.roundedAmountCents;
          break;
        case "evaluation_bonus":
          evaluationBonusCents += line.roundedAmountCents;
          totals.bonusCents += line.roundedAmountCents;
          break;
        case "adjustment":
        case "carry_forward":
          totals.adjustmentCents += line.roundedAmountCents;
          if (line.roundedAmountCents < 0) {
            totals.deductionCents += -line.roundedAmountCents;
          } else {
            totals.bonusCents += line.roundedAmountCents;
          }
          break;
      }
    }
    totals.appointmentCount = seenAppointments.size;
    totals.completedSessionCount = completedAppointments.size;
    // bonusCents also contains positive adjustments (display); the gross sum
    // uses evaluationBonusCents + signed adjustmentCents so nothing double
    // counts.
    totals.finalGrossCents =
      totals.commissionCents +
      totals.flatRateCents +
      totals.hourlyCents +
      totals.teamCents +
      evaluationBonusCents +
      totals.adjustmentCents;

    // Reconciliation self-check: totals must equal the line sum exactly.
    const lineSum = lines.reduce(
      (sum, l) => (l.calculationStatus === "calculated" ? sum + l.roundedAmountCents : sum),
      0,
    );
    if (lineSum !== totals.finalGrossCents) {
      throw new EngineReconciliationError(
        `Trainer ${trainerId}: line sum ${lineSum} != computed total ${totals.finalGrossCents}`,
      );
    }

    const blockingCount = trainerIssues.filter((i) => i.severity === "blocking").length;
    const warningCount = trainerIssues.filter((i) => i.severity === "warning").length;
    issues.push(...trainerIssues);

    trainers.push({
      trainerId,
      planVersionId: primaryPlan?.planVersion.id ?? null,
      planAssignmentId: primaryPlan?.assignmentId ?? null,
      calculationStatus: blockingCount > 0 ? "blocked" : "calculated",
      lines,
      totals,
      blockingIssueCount: blockingCount,
      warningCount,
    });
  }

  const runAppointments = new Set<string>();
  for (const a of appointments) {
    if (a.participations.length > 0) runAppointments.add(a.id);
  }

  const runTotals = {
    grossCompensationCents: trainers.reduce(
      (sum, t) => sum + (t.totals.finalGrossCents - t.totals.adjustmentCents),
      0,
    ),
    adjustmentCents: trainers.reduce((sum, t) => sum + t.totals.adjustmentCents, 0),
    finalCompensationCents: trainers.reduce(
      (sum, t) => sum + t.totals.finalGrossCents,
      0,
    ),
    trainerCount: trainers.length,
    appointmentCount: runAppointments.size,
    blockingIssueCount: issues.filter((i) => i.severity === "blocking").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
  };

  return { calculationVersion: CALCULATION_VERSION, trainers, issues, runTotals };
}

/**
 * per_trainer rounding scope: the trainer's percentage-line total must equal
 * round(Σ exact values) rather than Σ round(each value). Each line keeps its
 * per-line rounded amount except the LAST percentage line, which absorbs the
 * (at most a few cents) difference — recorded in its trace.
 */
function reconcilePerTrainerRounding(
  lines: EngineLine[],
  method: RoundingMethod,
): void {
  const pctLines = lines.filter(
    (l) =>
      l.lineType === "session_percentage" &&
      l.calculationStatus === "calculated" &&
      l.basisAmountCents !== null &&
      l.rateBasisPoints !== null,
  );
  if (pctLines.length < 2) return;

  const exactNumerator = pctLines.reduce(
    (sum, l) => sum + l.basisAmountCents! * l.rateBasisPoints!,
    0,
  );
  const scopedTotal = roundRational(exactNumerator, 10_000, method);
  const lineSum = pctLines.reduce((sum, l) => sum + l.roundedAmountCents, 0);
  const diff = scopedTotal - lineSum;
  if (diff === 0) return;

  const last = pctLines[pctLines.length - 1];
  last.roundedAmountCents += diff;
  last.trace.steps.push({
    step: "per_trainer_rounding",
    detail:
      "Plan rounds per trainer: this line absorbs the difference between the rounded per-trainer total and the sum of per-line roundings.",
    values: { adjustment_cents: diff, per_trainer_total_cents: scopedTotal },
  });
}
