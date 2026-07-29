/**
 * Configuration-readiness metrics — executive setup indicators. These read
 * configuration facts (not the ledger) and never gate on imports: their
 * whole point is showing what is missing BEFORE data can flow.
 */

import { mean, ratioBp } from "../shared/math";
import type { EvalContext, MetricEvaluator, MetricOutcome } from "../shared/evaluate";
import {
  INTELLIGENCE_VERSION,
  type MetricDefinition,
} from "../shared/types";

function def(
  partial: Omit<MetricDefinition, "version" | "requiredPermission" | "scopes">,
): MetricDefinition {
  return {
    requiredPermission: "report:manage",
    scopes: ["organization"],
    version: INTELLIGENCE_VERSION,
    ...partial,
  };
}

export const READINESS_METRICS: MetricDefinition[] = [
  def({
    id: "trainer_assignment_coverage_bp",
    name: "Trainer assignment complete",
    category: "readiness",
    definition:
      "Share of roster trainers (active org assignment) that also have an active department assignment.",
    formula: "trainers_with_department ÷ roster_trainers × 10000",
    unit: "rate_bp",
    dependencies: ["configuration:trainers"],
  }),
  def({
    id: "compensation_coverage_bp",
    name: "Compensation complete",
    category: "readiness",
    definition:
      "Share of active trainers with an active compensation plan assignment.",
    formula: "trainers_with_compensation ÷ active_trainers × 10000",
    unit: "rate_bp",
    dependencies: ["configuration:compensation"],
  }),
  def({
    id: "service_alias_coverage_bp",
    name: "Import alias coverage",
    category: "readiness",
    definition:
      "Share of active services with at least one import source alias (imports auto-match only via aliases).",
    formula: "services_with_alias ÷ active_services × 10000",
    unit: "rate_bp",
    dependencies: ["configuration:services"],
  }),
  def({
    id: "reporting_period_coverage_bp",
    name: "Reporting period coverage",
    category: "readiness",
    definition:
      "Whether reporting periods fully cover the selected date range (10000 = fully covered).",
    formula: "range fully covered by periods ? 10000 : 0",
    unit: "rate_bp",
    dependencies: ["configuration:periods"],
  }),
  def({
    id: "import_health_bp",
    name: "Import health",
    category: "readiness",
    definition:
      "Import pipeline state: full health requires zero open blocking issues and no batches stuck awaiting action.",
    formula: "passed_checks ÷ 2 × 10000 (checks: no open blocking issues; no waiting batches)",
    unit: "rate_bp",
    dependencies: ["dataset:import_state"],
  }),
  def({
    id: "payroll_readiness_bp",
    name: "Payroll readiness",
    category: "readiness",
    definition:
      "Payroll pipeline state: full readiness requires compensation coverage, zero open blocking payroll issues, and no unfinished active runs.",
    formula:
      "passed_checks ÷ 3 × 10000 (checks: compensation complete; no blocking issues; no unfinished runs)",
    unit: "rate_bp",
    dependencies: ["compensation_coverage_bp", "dataset:payroll_state"],
  }),
  def({
    id: "organization_readiness_bp",
    name: "Organization readiness",
    category: "readiness",
    definition:
      "Mean of the readiness indicators above — the executive setup score.",
    formula:
      "mean(trainer_assignment, compensation, alias, period coverage, import health, payroll readiness)",
    unit: "rate_bp",
    dependencies: [
      "trainer_assignment_coverage_bp",
      "compensation_coverage_bp",
      "service_alias_coverage_bp",
      "reporting_period_coverage_bp",
      "import_health_bp",
      "payroll_readiness_bp",
    ],
  }),
];

function coverage(
  numerator: number,
  denominator: number,
  emptyReason: string,
): MetricOutcome {
  if (denominator === 0) {
    return {
      value: null,
      health: "waiting_for_configuration",
      reasons: [emptyReason],
    };
  }
  const value = ratioBp(numerator, denominator);
  return {
    value,
    health: value === 10_000 ? "healthy" : "incomplete",
    metadata: { numerator, denominator },
    reasons:
      value === 10_000
        ? undefined
        : [`${denominator - numerator} of ${denominator} still unconfigured.`],
  };
}

function trainerAssignment(ctx: EvalContext): MetricOutcome {
  return coverage(
    ctx.dataset.readiness.trainersWithDepartment,
    ctx.dataset.readiness.trainersActive,
    "No active trainers exist yet.",
  );
}

function compensationCoverage(ctx: EvalContext): MetricOutcome {
  return coverage(
    ctx.dataset.readiness.trainersWithCompensation,
    ctx.dataset.readiness.trainersActive,
    "No active trainers exist yet.",
  );
}

function aliasCoverage(ctx: EvalContext): MetricOutcome {
  return coverage(
    ctx.dataset.readiness.servicesWithAlias,
    ctx.dataset.readiness.servicesActive,
    "No active services exist yet.",
  );
}

function periodCoverage(ctx: EvalContext): MetricOutcome {
  const covered = ctx.dataset.readiness.rangeCoveredByPeriods;
  return {
    value: covered ? 10_000 : 0,
    health: covered ? "healthy" : "incomplete",
    reasons: covered
      ? undefined
      : ["Reporting periods do not fully cover the selected date range."],
  };
}

function importHealth(ctx: EvalContext): MetricOutcome {
  const r = ctx.dataset.readiness;
  const checks = [
    r.openImportBlockingIssues === 0,
    r.importBatchesAwaitingAction === 0,
  ];
  const passed = checks.filter(Boolean).length;
  return {
    value: ratioBp(passed, checks.length),
    health: passed === checks.length ? "healthy" : "incomplete",
    metadata: {
      open_blocking_issues: r.openImportBlockingIssues,
      batches_awaiting_action: r.importBatchesAwaitingAction,
    },
    reasons:
      passed === checks.length
        ? undefined
        : ["Import batches or blocking issues are awaiting action."],
  };
}

function payrollReadiness(ctx: EvalContext): MetricOutcome {
  const r = ctx.dataset.readiness;
  if (r.trainersActive === 0) {
    return {
      value: null,
      health: "waiting_for_configuration",
      reasons: ["No active trainers exist yet."],
    };
  }
  const checks = [
    r.trainersWithCompensation === r.trainersActive,
    r.openPayrollBlockingIssues === 0,
    r.activePayrollRunsNotFinalized === 0,
  ];
  const passed = checks.filter(Boolean).length;
  return {
    value: ratioBp(passed, checks.length),
    health: passed === checks.length ? "healthy" : "incomplete",
    metadata: {
      compensation_gap: r.trainersActive - r.trainersWithCompensation,
      open_blocking_issues: r.openPayrollBlockingIssues,
      unfinished_runs: r.activePayrollRunsNotFinalized,
    },
    reasons:
      passed === checks.length
        ? undefined
        : ["Compensation gaps, blocking issues, or unfinished runs remain."],
  };
}

function organizationReadiness(ctx: EvalContext): MetricOutcome {
  const components = [
    trainerAssignment(ctx),
    compensationCoverage(ctx),
    aliasCoverage(ctx),
    periodCoverage(ctx),
    importHealth(ctx),
    payrollReadiness(ctx),
  ];
  const values = components
    .map((c) => c.value)
    .filter((v): v is number => v !== null);
  if (values.length === 0) {
    return {
      value: null,
      health: "waiting_for_configuration",
      reasons: ["No readiness component is measurable yet."],
    };
  }
  const value = mean(values);
  return {
    value,
    health: value === 10_000 ? "healthy" : "incomplete",
    metadata: { measurable_components: values.length },
  };
}

export const READINESS_EVALUATORS: Record<string, MetricEvaluator> = {
  trainer_assignment_coverage_bp: trainerAssignment,
  compensation_coverage_bp: compensationCoverage,
  service_alias_coverage_bp: aliasCoverage,
  reporting_period_coverage_bp: periodCoverage,
  import_health_bp: importHealth,
  payroll_readiness_bp: payrollReadiness,
  organization_readiness_bp: organizationReadiness,
};
