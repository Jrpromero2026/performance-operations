/**
 * Analytics report packages — Phase 9 package types generated through the
 * Phase 7 report-package harness (versioning, supersede chain, sha256,
 * audit). Payloads freeze ANALYTICS COMPOSITIONS of engine output:
 * scorecard views, comparisons, goal progress, benchmark status — with
 * every value's health, unit, version, and finality carried verbatim.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { writeAudit } from "@/lib/actions/shared";
import type { Json } from "@/lib/supabase/types";
import { INTELLIGENCE_VERSION } from "@/lib/intelligence/shared/types";
import { sha256Hex, stableStringify } from "@/lib/close/manifest";
import { AnalyticsService } from "../queries/service";
import { ANALYTICS_VERSION } from "../shared/types";
import {
  composeScorecard,
  type GoalRecord,
  type ScorecardView,
} from "../scorecards/compose";
import {
  DEPARTMENT_SCORECARD,
  ORGANIZATION_EXECUTIVE_SCORECARD,
  TRAINER_SCORECARD,
} from "../scorecards/definitions";
import { deriveGoalProgress } from "../goals/progress";
import { buildCohortTable } from "../cohorts/cohorts";

export type AnalyticsPackageType =
  | "executive_analytics"
  | "department_scorecard"
  | "trainer_scorecard"
  | "goal_progress"
  | "benchmark"
  | "cohort_analysis"
  | "board_presentation";

interface PackageParams {
  organizationId: string;
  period: { id: string; label: string; start_date: string; end_date: string; status: string };
  departmentId?: string | null;
  dashboardId?: string | null;
}

export interface AnalyticsPackageResult {
  id: string;
  version: number;
  status: "ready" | "failed";
  failureReason?: string;
}

/** Load active goals for scorecard/goal packages (names + owner labels). */
export async function loadGoalRecords(
  actor: ActorContext,
  organizationId: string,
  statuses: readonly string[] = ["active"],
): Promise<GoalRecord[]> {
  const { data: goals } = await actor.supabase
    .from("performance_goals")
    .select("*, owner:profiles!performance_goals_owner_id_fkey ( full_name, email )")
    .eq("organization_id", organizationId)
    .in("status", [...statuses]);
  return (goals ?? []).map((g) => {
    const owner = g.owner as unknown as { full_name: string | null; email: string } | null;
    return {
      id: g.id,
      name: g.name,
      metricId: g.metric_id,
      metricVersion: g.metric_version,
      metricUnit: g.metric_unit,
      scopeLevel: g.scope_level,
      departmentId: g.department_id,
      trainerId: g.trainer_id,
      goalType: g.goal_type as GoalRecord["goalType"],
      targetValue: g.target_value,
      targetLow: g.target_low,
      targetHigh: g.target_high,
      baselineValue: g.baseline_value,
      startDate: g.start_date,
      endDate: g.end_date,
      status: g.status,
      ownerName: owner?.full_name || owner?.email || null,
    };
  });
}

function scorecardPayload(view: ScorecardView): Record<string, unknown> {
  return {
    key: view.key,
    name: view.name,
    window: view.window,
    sections: view.sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => ({
        metric_id: row.metricId,
        label: row.label,
        unit: row.unit,
        direction: row.direction,
        current_value: row.current.value,
        current_health: row.current.health,
        previous_period: row.previousPeriod
          ? {
              value: row.previousPeriod.comparison?.value ?? null,
              absolute_variance: row.previousPeriod.absoluteVariance,
              percent_variance_bp: row.previousPeriod.percentVarianceBp,
              eligibility: row.previousPeriod.eligibility,
            }
          : null,
        prior_year: row.priorYear
          ? {
              value: row.priorYear.comparison?.value ?? null,
              absolute_variance: row.priorYear.absoluteVariance,
              percent_variance_bp: row.priorYear.percentVarianceBp,
              eligibility: row.priorYear.eligibility,
            }
          : null,
        goal: row.goal
          ? {
              goal_id: row.goal.goalId,
              name: row.goal.name,
              status: row.goal.progress.status,
              absolute_gap: row.goal.progress.absoluteGap,
              percent_to_target_bp: row.goal.progress.percentToTargetBp,
            }
          : null,
      })),
    })),
  };
}

/** Shared harness mirror of close/packages.generate for analytics types. */
async function generateAnalyticsPackage(
  actor: ActorContext,
  params: PackageParams,
  packageType: AnalyticsPackageType,
  build: () => Promise<{ payload: Record<string, unknown>; warnings: string[] }>,
): Promise<AnalyticsPackageResult | { error: string }> {
  let query = actor.supabase
    .from("report_packages")
    .select("id, version, status")
    .eq("organization_id", params.organizationId)
    .eq("reporting_period_id", params.period.id)
    .eq("package_type", packageType)
    .order("version", { ascending: false });
  query = params.departmentId
    ? query.eq("department_id", params.departmentId)
    : query.is("department_id", null);
  const { data: existing } = await query.limit(5);
  const version = (existing?.[0]?.version ?? 0) + 1;
  const priorReadyId = (existing ?? []).find((p) => p.status === "ready")?.id ?? null;

  const { data: created, error: insertError } = await actor.supabase
    .from("report_packages")
    .insert({
      organization_id: params.organizationId,
      reporting_period_id: params.period.id,
      package_type: packageType,
      department_id: params.departmentId ?? null,
      dashboard_id: params.dashboardId ?? null,
      version,
      status: "generating",
      generated_by: actor.userId,
      intelligence_version: INTELLIGENCE_VERSION,
      supersedes_package_id: priorReadyId,
      filters: {
        period_id: params.period.id,
        department_id: params.departmentId ?? null,
        analytics_version: ANALYTICS_VERSION,
      } as Json,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    return { error: `Could not start package generation (${insertError?.code ?? "?"}).` };
  }

  try {
    const { payload, warnings } = await build();
    const packageSha = sha256Hex(stableStringify(payload));
    const { error: readyError } = await actor.supabase
      .from("report_packages")
      .update({
        status: "ready",
        payload: payload as Json,
        warnings: warnings as unknown as Json,
        package_sha256: packageSha,
      })
      .eq("id", created.id)
      .eq("status", "generating");
    if (readyError) throw new Error(`package_finalize_failed:${readyError.code}`);
    if (priorReadyId) {
      await actor.supabase
        .from("report_packages")
        .update({ status: "superseded", superseded_by_package_id: created.id })
        .eq("id", priorReadyId)
        .eq("status", "ready");
    }
    await writeAudit(actor, {
      organizationId: params.organizationId,
      entityType: "report_package",
      entityId: created.id,
      action: "report_package_generated",
      metadata: { package_type: packageType, version, sha256: packageSha },
    });
    return { id: created.id, version, status: "ready" };
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "generation_failed";
    await actor.supabase
      .from("report_packages")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", created.id)
      .eq("status", "generating");
    await writeAudit(actor, {
      organizationId: params.organizationId,
      entityType: "report_package",
      entityId: created.id,
      action: "report_package_failed",
      metadata: { package_type: packageType, version, reason },
    });
    return { id: created.id, version, status: "failed", failureReason: reason };
  }
}

export async function generateExecutiveAnalyticsPackage(
  actor: ActorContext,
  params: PackageParams,
): Promise<AnalyticsPackageResult | { error: string }> {
  return generateAnalyticsPackage(actor, params, "executive_analytics", async () => {
    const serviceOrDenied = await AnalyticsService.create(actor, params.organizationId);
    if ("denied" in serviceOrDenied) throw new Error(serviceOrDenied.denied);
    const service = serviceOrDenied;
    const window = service.periodWindow(params.period.id);
    if (!window) throw new Error("reporting_period_not_found");
    const goals = await loadGoalRecords(actor, params.organizationId);
    const scorecard = await composeScorecard(
      service, ORGANIZATION_EXECUTIVE_SCORECARD, window, {}, goals,
    );
    const departmentBreakdown = await service.getBreakdownComparison(
      "appointments_completed", "department", window, "previous_period",
    );
    const warnings: string[] = [];
    if (window.finality !== "final") {
      warnings.push("NOT FINAL — the reporting period is not closed; figures may change.");
    }
    return {
      payload: {
        finality: window.finality,
        period: { id: params.period.id, label: params.period.label },
        scorecard: scorecardPayload(scorecard),
        department_comparison: {
          metric_id: departmentBreakdown.metricId,
          unit: departmentBreakdown.unit,
          eligibility: departmentBreakdown.eligibility,
          rows: departmentBreakdown.rows,
        },
        analytics_version: ANALYTICS_VERSION,
      },
      warnings,
    };
  });
}

export async function generateDepartmentScorecardPackage(
  actor: ActorContext,
  params: PackageParams & { departmentId: string },
): Promise<AnalyticsPackageResult | { error: string }> {
  return generateAnalyticsPackage(actor, params, "department_scorecard", async () => {
    const serviceOrDenied = await AnalyticsService.create(actor, params.organizationId);
    if ("denied" in serviceOrDenied) throw new Error(serviceOrDenied.denied);
    const service = serviceOrDenied;
    const window = service.periodWindow(params.period.id);
    if (!window) throw new Error("reporting_period_not_found");
    const goals = await loadGoalRecords(actor, params.organizationId);
    const scorecard = await composeScorecard(
      service,
      DEPARTMENT_SCORECARD,
      window,
      { departmentId: params.departmentId },
      goals,
    );
    return {
      payload: {
        finality: window.finality,
        period: { id: params.period.id, label: params.period.label },
        department_id: params.departmentId,
        scorecard: scorecardPayload(scorecard),
        analytics_version: ANALYTICS_VERSION,
      },
      warnings:
        window.finality === "final"
          ? []
          : ["NOT FINAL — the reporting period is not closed; figures may change."],
    };
  });
}

export async function generateTrainerScorecardPackage(
  actor: ActorContext,
  params: PackageParams & { trainerId: string },
): Promise<AnalyticsPackageResult | { error: string }> {
  return generateAnalyticsPackage(actor, params, "trainer_scorecard", async () => {
    const serviceOrDenied = await AnalyticsService.create(actor, params.organizationId);
    if ("denied" in serviceOrDenied) throw new Error(serviceOrDenied.denied);
    const service = serviceOrDenied;
    const window = service.periodWindow(params.period.id);
    if (!window) throw new Error("reporting_period_not_found");
    const goals = await loadGoalRecords(actor, params.organizationId);
    // Metric access narrows through the engine: a trainer generating their
    // own scorecard only ever composes their own slice.
    const scorecard = await composeScorecard(
      service,
      TRAINER_SCORECARD,
      window,
      { trainerId: params.trainerId },
      goals,
    );
    return {
      payload: {
        finality: window.finality,
        period: { id: params.period.id, label: params.period.label },
        trainer_id: params.trainerId,
        scorecard: scorecardPayload(scorecard),
        analytics_version: ANALYTICS_VERSION,
      },
      warnings:
        window.finality === "final"
          ? []
          : ["NOT FINAL — the reporting period is not closed; figures may change."],
    };
  });
}

export async function generateBenchmarkPackage(
  actor: ActorContext,
  params: PackageParams,
): Promise<AnalyticsPackageResult | { error: string }> {
  return generateAnalyticsPackage(actor, params, "benchmark", async () => {
    const serviceOrDenied = await AnalyticsService.create(actor, params.organizationId);
    if ("denied" in serviceOrDenied) throw new Error(serviceOrDenied.denied);
    const service = serviceOrDenied;
    const window = service.periodWindow(params.period.id);
    if (!window) throw new Error("reporting_period_not_found");
    const { data: benchmarks } = await actor.supabase
      .from("performance_benchmarks")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("status", "approved");
    const rows = [];
    for (const benchmark of benchmarks ?? []) {
      const result = await service.getMetricResult(benchmark.metric_id, window, {
        departmentId: benchmark.department_id ?? undefined,
        trainerId: benchmark.trainer_id ?? undefined,
      });
      rows.push({
        benchmark_id: benchmark.id,
        name: benchmark.name,
        metric_id: benchmark.metric_id,
        metric_version: benchmark.metric_version,
        source_type: benchmark.source_type,
        evidence: benchmark.evidence,
        benchmark_value: benchmark.value,
        current_value: result.value,
        current_health: result.health,
        variance: result.value !== null ? result.value - benchmark.value : null,
      });
    }
    return {
      payload: {
        finality: window.finality,
        period: { id: params.period.id, label: params.period.label },
        benchmark_count: rows.length,
        benchmarks: rows,
        analytics_version: ANALYTICS_VERSION,
      },
      warnings: rows.length === 0 ? ["No approved benchmarks exist."] : [],
    };
  });
}

export async function generateGoalProgressPackage(
  actor: ActorContext,
  params: PackageParams,
): Promise<AnalyticsPackageResult | { error: string }> {
  return generateAnalyticsPackage(actor, params, "goal_progress", async () => {
    const serviceOrDenied = await AnalyticsService.create(actor, params.organizationId);
    if ("denied" in serviceOrDenied) throw new Error(serviceOrDenied.denied);
    const service = serviceOrDenied;
    const window = service.periodWindow(params.period.id);
    if (!window) throw new Error("reporting_period_not_found");
    const goals = await loadGoalRecords(actor, params.organizationId, [
      "active", "achieved", "missed",
    ]);
    const rows = [];
    for (const goal of goals) {
      const result = await service.getMetricResult(goal.metricId, window, {
        departmentId: goal.departmentId ?? undefined,
        trainerId: goal.trainerId ?? undefined,
      });
      const progress = deriveGoalProgress(goal, result, service.today);
      rows.push({
        goal_id: goal.id,
        name: goal.name,
        metric_id: goal.metricId,
        metric_version: goal.metricVersion,
        scope_level: goal.scopeLevel,
        goal_status: goal.status,
        progress_status: progress.status,
        current_value: progress.currentValue,
        metric_health: progress.metricHealth,
        absolute_gap: progress.absoluteGap,
        percent_to_target_bp: progress.percentToTargetBp,
        on_track: progress.onTrack,
        owner: goal.ownerName,
      });
    }
    // Freeze snapshots so the package's numbers stay reproducible evidence.
    for (const row of rows) {
      await actor.supabase.from("performance_goal_progress_snapshots").insert({
        goal_id: row.goal_id,
        organization_id: params.organizationId,
        as_of_date: service.today,
        metric_value: row.current_value,
        metric_health: row.metric_health ?? "unavailable",
        progress_status: row.progress_status,
        detail: {
          absolute_gap: row.absolute_gap,
          percent_to_target_bp: row.percent_to_target_bp,
          period_id: params.period.id,
        } as Json,
        created_by: actor.userId,
      });
    }
    return {
      payload: {
        finality: window.finality,
        period: { id: params.period.id, label: params.period.label },
        goal_count: rows.length,
        goals: rows,
        analytics_version: ANALYTICS_VERSION,
      },
      warnings: window.finality === "final" ? [] : ["NOT FINAL — open-period goal progress may change."],
    };
  });
}

export async function generateCohortAnalysisPackage(
  actor: ActorContext,
  params: PackageParams,
): Promise<AnalyticsPackageResult | { error: string }> {
  return generateAnalyticsPackage(actor, params, "cohort_analysis", async () => {
    const serviceOrDenied = await AnalyticsService.create(actor, params.organizationId);
    if ("denied" in serviceOrDenied) throw new Error(serviceOrDenied.denied);
    const service = serviceOrDenied;
    const window = service.periodWindow(params.period.id);
    if (!window) throw new Error("reporting_period_not_found");
    const dataset = await service.datasetFor(window);
    const table = buildCohortTable(dataset, window, {}, 0);
    return {
      payload: {
        finality: window.finality,
        period: { id: params.period.id, label: params.period.label },
        months: table.months,
        rows: table.rows,
        clients_unidentified: table.clientsUnidentified,
        privacy_note:
          "Counts of distinct clients only — no client identities are included in this package.",
        analytics_version: ANALYTICS_VERSION,
      },
      warnings: [],
    };
  });
}
