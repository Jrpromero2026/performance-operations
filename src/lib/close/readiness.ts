/**
 * Close-readiness coordinator: assembles system state in a handful of
 * batched queries + ONE IntelligenceSession, classifies via the pure
 * checks module, and persists the evaluation summary onto the close run.
 * A material regression (new blockers after review/approval) REVOKES
 * readiness: the run reverts to close_review and approvals are cleared.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";
import { IntelligenceSession } from "@/lib/intelligence/service";
import {
  classifyCloseChecks,
  summarizeChecks,
  type ChecklistSummary,
  type CloseCheck,
  type CloseReadinessInputs,
} from "./checks";

export interface CloseEvaluation {
  run: Tables<"period_close_runs">;
  period: Tables<"reporting_periods"> | null;
  checks: CloseCheck[];
  summary: ChecklistSummary;
  /** The session used for readiness — reusable by callers on the same request. */
  session: IntelligenceSession | null;
  policy: { allowSelfApproval: boolean; payrollRequiredState: "posted" | "locked" };
  finalizedPayrollRun: Tables<"payroll_runs"> | null;
  payrollSnapshot: { version: number; linesSha256: string } | null;
}

const READINESS_METRIC_IDS = [
  "compensation_coverage_bp",
  "trainer_assignment_coverage_bp",
  "service_alias_coverage_bp",
  "reporting_period_coverage_bp",
] as const;

export async function evaluateCloseReadiness(
  actor: ActorContext,
  runId: string,
  options: { persist?: boolean } = {},
): Promise<CloseEvaluation | null> {
  const { supabase } = actor;
  const persist = options.persist ?? true;
  const now = new Date().toISOString();

  const { data: run } = await supabase
    .from("period_close_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;

  const [{ data: period }, { data: policyRow }, { data: ackRows }] = await Promise.all([
    supabase
      .from("reporting_periods")
      .select("*")
      .eq("id", run.reporting_period_id)
      .maybeSingle(),
    supabase
      .from("organization_close_policies")
      .select("*")
      .eq("organization_id", run.organization_id)
      .maybeSingle(),
    supabase
      .from("period_close_acknowledgements")
      .select("check_code")
      .eq("period_close_run_id", run.id),
  ]);
  const policy = {
    allowSelfApproval: policyRow?.allow_self_approval ?? false,
    payrollRequiredState: (policyRow?.payroll_required_state ?? "posted") as
      | "posted"
      | "locked",
  };
  const acknowledgements = new Set((ackRows ?? []).map((a) => a.check_code));

  // ---- pipeline states, batched ----------------------------------------
  const [
    batchStatusRes,
    reversedRes,
    apptCountRes,
    correctionsRes,
    payrollRunsRes,
    pendingAdjRes,
    pendingTimeRes,
    packagesRes,
    exportsRes,
  ] = await Promise.all([
    supabase
      .from("import_batches")
      .select("status")
      .eq("organization_id", run.organization_id)
      .in("status", [
        "uploaded",
        "parsing",
        "validating",
        "needs_review",
        "ready_for_approval",
        "approved",
        "failed",
      ]),
    period
      ? supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", run.organization_id)
          .eq("record_state", "reversed")
          .gte("appointment_date", period.start_date)
          .lte("appointment_date", period.end_date)
      : Promise.resolve({ count: 0 } as never),
    period
      ? supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", run.organization_id)
          .eq("record_state", "active")
          .gte("appointment_date", period.start_date)
          .lte("appointment_date", period.end_date)
      : Promise.resolve({ count: 0 } as never),
    period
      ? supabase
          .from("appointment_corrections")
          .select("id, appointments!inner ( appointment_date, organization_id )", {
            count: "exact",
            head: true,
          })
          .eq("appointments.organization_id", run.organization_id)
          .gte("appointments.appointment_date", period.start_date)
          .lte("appointments.appointment_date", period.end_date)
      : Promise.resolve({ count: 0 } as never),
    supabase
      .from("payroll_runs")
      .select("*")
      .eq("reporting_period_id", run.reporting_period_id),
    supabase
      .from("payroll_adjustments")
      .select("id", { count: "exact", head: true })
      .eq("reporting_period_id", run.reporting_period_id)
      .in("status", ["draft", "submitted"]),
    supabase
      .from("manual_time_entries")
      .select("id", { count: "exact", head: true })
      .eq("reporting_period_id", run.reporting_period_id)
      .in("status", ["draft", "submitted"]),
    supabase
      .from("report_packages")
      .select("id, version, status, package_type")
      .eq("organization_id", run.organization_id)
      .eq("reporting_period_id", run.reporting_period_id)
      .eq("package_type", "executive")
      .in("status", ["ready", "finalized"])
      .order("version", { ascending: false })
      .limit(1),
    supabase
      .from("close_exports")
      .select("export_type")
      .eq("organization_id", run.organization_id)
      .eq("reporting_period_id", run.reporting_period_id)
      .eq("superseded", false),
  ]);

  const statusCounts = new Map<string, number>();
  for (const row of batchStatusRes.data ?? []) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const payrollRuns = payrollRunsRes.data ?? [];
  const finalizedPayrollRun =
    payrollRuns.find((r) => ["posted", "locked"].includes(r.status)) ?? null;
  const activePayrollRuns = payrollRuns.filter((r) =>
    [
      "draft",
      "calculating",
      "needs_review",
      "ready_for_approval",
      "approved",
      "reopened",
      "failed",
    ].includes(r.status),
  );

  // Payroll snapshot reconciliation + reopen history + late arrivals.
  let payrollSnapshot: { version: number; linesSha256: string } | null = null;
  let totalsReconcile = true;
  let wasReopened = false;
  let openLateArrivals = 0;
  let stale = false;
  if (finalizedPayrollRun) {
    const [snapshotRes, reopenEventsRes, lateRes, lateApptRes] = await Promise.all([
      supabase
        .from("payroll_snapshots")
        .select("snapshot_version, lines_sha256, payload")
        .eq("payroll_run_id", finalizedPayrollRun.id)
        .order("snapshot_version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payroll_run_events")
        .select("id", { count: "exact", head: true })
        .eq("payroll_run_id", finalizedPayrollRun.id)
        .eq("to_status", "reopened"),
      supabase
        .from("payroll_issues")
        .select("id", { count: "exact", head: true })
        .eq("payroll_run_id", finalizedPayrollRun.id)
        .eq("code", "late_arriving_appointments")
        .eq("resolution_status", "open"),
      period && finalizedPayrollRun.source_appointment_cutoff_at
        ? supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", run.organization_id)
            .eq("record_state", "active")
            .gte("appointment_date", period.start_date)
            .lte("appointment_date", period.end_date)
            .gt("posted_at", finalizedPayrollRun.source_appointment_cutoff_at)
        : Promise.resolve({ count: 0 } as never),
    ]);
    if (snapshotRes.data) {
      payrollSnapshot = {
        version: snapshotRes.data.snapshot_version,
        linesSha256: snapshotRes.data.lines_sha256,
      };
      const payload = snapshotRes.data.payload as {
        run?: { final_compensation_total_cents?: number };
      };
      totalsReconcile =
        payload?.run?.final_compensation_total_cents ===
        finalizedPayrollRun.final_compensation_total_cents;
    } else {
      totalsReconcile = false; // missing information never passes
    }
    wasReopened = (reopenEventsRes.count ?? 0) > 0;
    openLateArrivals = lateRes.count ?? 0;
    stale = (lateApptRes.count ?? 0) > 0;
  }

  // ---- intelligence readiness (ONE session) ----------------------------
  let session: IntelligenceSession | null = null;
  let readiness: CloseReadinessInputs["configuration"]["readiness"] = [];
  let paidAmountsPresent = false;
  if (period) {
    session = await IntelligenceSession.create(
      actor,
      run.organization_id,
      period.start_date,
      period.end_date,
    );
    readiness = READINESS_METRIC_IDS.map((id) => {
      const result = session!.getMetric(id);
      return {
        metricId: id,
        value: result.value,
        health: result.health,
        reason: result.reasons[0] ?? null,
      };
    });
    paidAmountsPresent = session.dataset.flags.paidAmountsPresent;
  }

  const executivePackage = packagesRes.data?.[0] ?? null;

  const inputs: CloseReadinessInputs = {
    now,
    organizationId: run.organization_id,
    closeRunId: run.id,
    period: period
      ? {
          id: period.id,
          organizationId: period.organization_id,
          startDate: period.start_date,
          endDate: period.end_date,
          status: period.status,
          label: period.label,
        }
      : null,
    policy,
    imports: {
      processing:
        (statusCounts.get("uploaded") ?? 0) +
        (statusCounts.get("parsing") ?? 0) +
        (statusCounts.get("validating") ?? 0),
      needsReview: statusCounts.get("needs_review") ?? 0,
      readyForApproval: statusCounts.get("ready_for_approval") ?? 0,
      approvedUnposted: statusCounts.get("approved") ?? 0,
      failed: statusCounts.get("failed") ?? 0,
      reversedTouchingPeriod: reversedRes.count ?? 0,
    },
    appointments: {
      activeInPeriod: apptCountRes.count ?? 0,
      correctionsInPeriod: correctionsRes.count ?? 0,
    },
    payroll: {
      finalizedRun: finalizedPayrollRun
        ? {
            id: finalizedPayrollRun.id,
            name: finalizedPayrollRun.name,
            status: finalizedPayrollRun.status,
            snapshotVersion: payrollSnapshot?.version ?? null,
            totalsReconcile,
            wasReopened,
          }
        : null,
      activeRuns: activePayrollRuns.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        blockingIssueCount: r.blocking_issue_count,
      })),
      openLateArrivalIssues: openLateArrivals,
      stale,
      pendingAdjustments: pendingAdjRes.count ?? 0,
      pendingTimeEntries: pendingTimeRes.count ?? 0,
    },
    configuration: { readiness, paidAmountsPresent },
    reporting: {
      executivePackage,
      exportTypesPresent: [
        ...new Set((exportsRes.data ?? []).map((e) => e.export_type)),
      ],
    },
    acknowledgements,
  };

  const checks = classifyCloseChecks(inputs);
  const summary = summarizeChecks(checks);

  if (persist && ["close_review", "ready_to_close"].includes(run.status)) {
    const snapshot = {
      evaluated_at: now,
      blocking_codes: summary.blockingCodes,
      warning_codes: summary.warningCodes,
      blocking_open: summary.blockingOpen,
      warnings_open: summary.warningsOpen,
    };
    await supabase
      .from("period_close_runs")
      .update({
        readiness_snapshot: snapshot,
        blocking_issue_count: summary.blockingOpen,
        warning_count: summary.warningsOpen + summary.warningsAcknowledged,
        ...(executivePackage && executivePackage.status === "ready"
          ? { report_package_id: executivePackage.id }
          : {}),
      })
      .eq("id", run.id);

    // Material regression revokes readiness AND approvals.
    if (run.status === "ready_to_close" && !summary.readyToClose) {
      await supabase
        .from("period_close_runs")
        .update({
          status: "close_review",
          reviewed_by: null,
          reviewed_at: null,
          approved_by: null,
          approved_at: null,
        })
        .eq("id", run.id)
        .eq("status", "ready_to_close");
      await supabase.from("period_close_events").insert({
        period_close_run_id: run.id,
        organization_id: run.organization_id,
        from_status: "ready_to_close",
        to_status: "close_review",
        actor_id: actor.userId,
        reason: "readiness_revoked_by_reevaluation",
      });
      run.status = "close_review";
      run.reviewed_by = null;
      run.approved_by = null;
    }
    run.blocking_issue_count = summary.blockingOpen;
    run.warning_count = summary.warningsOpen + summary.warningsAcknowledged;
  }

  return {
    run,
    period: period ?? null,
    checks,
    summary,
    session,
    policy,
    finalizedPayrollRun,
    payrollSnapshot,
  };
}
