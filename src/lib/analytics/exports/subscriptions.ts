/**
 * Analytics subscriptions — maps Phase 9 scheduled-report types onto the
 * analytics package generators so the Phase 8 execution engine (recipient
 * governance, one-run-per-occurrence, test-mode delivery, finality
 * labels) carries analytics artifacts without a parallel path.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";
import { IntegrationFailure } from "@/lib/integrations/shared/failures";
import {
  generateBenchmarkPackage,
  generateCohortAnalysisPackage,
  generateDepartmentScorecardPackage,
  generateExecutiveAnalyticsPackage,
  generateGoalProgressPackage,
  generateTrainerScorecardPackage,
  type AnalyticsPackageResult,
} from "../presentations/packages";

export const ANALYTICS_REPORT_TYPES = new Set([
  "executive_scorecard",
  "department_scorecard",
  "trainer_self_scorecard",
  "goal_progress_report",
  "benchmark_report",
  "cohort_report",
  "analytics_dashboard",
  "board_presentation_package",
]);

export async function generateAnalyticsSubscriptionArtifact(
  actor: ActorContext,
  definition: Tables<"scheduled_report_definitions">,
  period: { id: string; label: string; start_date: string; end_date: string; status: string },
): Promise<AnalyticsPackageResult> {
  const params = { organizationId: definition.organization_id, period };
  let result: AnalyticsPackageResult | { error: string };

  switch (definition.report_type) {
    case "executive_scorecard":
    case "board_presentation_package":
    case "analytics_dashboard":
      // Board packages and dashboard subscriptions deliver the executive
      // analytics composition; presentation layout and dashboard identity
      // are references, not separate calculation paths.
      result = await generateExecutiveAnalyticsPackage(actor, {
        ...params,
        dashboardId: definition.dashboard_id,
      });
      break;
    case "department_scorecard": {
      if (!definition.department_id) {
        throw new IntegrationFailure(
          "permanent_configuration_failure",
          "Department scorecard subscriptions need a department on the definition.",
        );
      }
      result = await generateDepartmentScorecardPackage(actor, {
        ...params,
        departmentId: definition.department_id,
      });
      break;
    }
    case "trainer_self_scorecard": {
      const { data: trainer } = await actor.supabase
        .from("trainers")
        .select("id")
        .eq("profile_id", definition.owner_id)
        .maybeSingle();
      if (!trainer) {
        throw new IntegrationFailure(
          "permanent_configuration_failure",
          "The definition owner has no trainer record — a self-scorecard needs one.",
        );
      }
      result = await generateTrainerScorecardPackage(actor, {
        ...params,
        trainerId: trainer.id,
      });
      break;
    }
    case "goal_progress_report":
      result = await generateGoalProgressPackage(actor, params);
      break;
    case "benchmark_report":
      result = await generateBenchmarkPackage(actor, params);
      break;
    case "cohort_report":
      result = await generateCohortAnalysisPackage(actor, params);
      break;
    default:
      throw new IntegrationFailure(
        "permanent_configuration_failure",
        `Unknown analytics report type: ${definition.report_type}`,
      );
  }

  if ("error" in result) {
    throw new IntegrationFailure("permanent_configuration_failure", result.error);
  }
  if (result.status !== "ready") {
    throw new IntegrationFailure(
      "internal_transaction_failure",
      result.failureReason ?? "Analytics package generation failed.",
    );
  }
  return result;
}
