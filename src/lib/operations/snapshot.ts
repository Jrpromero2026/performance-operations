/**
 * Operations snapshot — ONE batched load for the executive overview. All
 * metric values come from the IntelligenceSession; everything else here is
 * pipeline STATE (statuses, counts) and the audit feed. No widget issues
 * its own queries; nothing here re-implements a formula.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { IntelligenceSession } from "@/lib/intelligence/service";
import type { MetricResult } from "@/lib/intelligence/shared/types";
import {
  deriveAlerts,
  type AlertImportBatch,
  type AlertPayrollRun,
  type OperationalAlert,
} from "./alerts";

export const READINESS_METRIC_IDS = [
  "organization_readiness_bp",
  "trainer_assignment_coverage_bp",
  "compensation_coverage_bp",
  "service_alias_coverage_bp",
  "reporting_period_coverage_bp",
  "import_health_bp",
  "payroll_readiness_bp",
] as const;

export interface TimelineEntry {
  id: string;
  action: string;
  entityType: string;
  actorName: string;
  createdAt: string;
}

export interface PayrollStatusRow {
  id: string;
  name: string;
  status: string;
  blockingIssueCount: number;
  finalTotalCents: number;
}

export interface ImportStatusRow {
  id: string;
  filename: string;
  status: string;
  blockedRows: number;
}

export interface OperationsSnapshot {
  organizationId: string;
  /** Null when no reporting period is selected (metrics need a window). */
  session: IntelligenceSession | null;
  readiness: MetricResult[];
  alerts: OperationalAlert[];
  activeRuns: PayrollStatusRow[];
  recentFinalizedRuns: PayrollStatusRow[];
  pendingBatches: ImportStatusRow[];
  recentPostedBatches: ImportStatusRow[];
  timeline: TimelineEntry[];
  unreadNotifications: number;
}

export async function loadOperationsSnapshot(
  actor: ActorContext,
  organizationId: string,
  period: { id: string; startDate: string; endDate: string } | null,
): Promise<OperationsSnapshot> {
  const { supabase } = actor;

  const [
    activeRunsRes,
    finalizedRunsRes,
    pendingBatchesRes,
    postedBatchesRes,
    auditRes,
    unreadRes,
  ] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id, name, status, blocking_issue_count, final_compensation_total_cents")
      .eq("organization_id", organizationId)
      .in("status", [
        "draft",
        "calculating",
        "needs_review",
        "ready_for_approval",
        "approved",
        "reopened",
        "failed",
      ])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("payroll_runs")
      .select("id, name, status, blocking_issue_count, final_compensation_total_cents")
      .eq("organization_id", organizationId)
      .in("status", ["posted", "locked"])
      .order("posted_at", { ascending: false })
      .limit(5),
    supabase
      .from("import_batches")
      .select("id, original_filename, status, blocked_row_count")
      .eq("organization_id", organizationId)
      .in("status", ["uploaded", "parsing", "validating", "needs_review", "ready_for_approval", "approved", "failed"])
      .order("uploaded_at", { ascending: false })
      .limit(10),
    supabase
      .from("import_batches")
      .select("id, original_filename, status, blocked_row_count")
      .eq("organization_id", organizationId)
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(5),
    supabase
      .from("audit_events")
      .select("id, action, entity_type, created_at, profiles:actor_id ( full_name, email )")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", actor.userId)
      .is("read_at", null)
      .is("archived_at", null),
  ]);

  const activeRuns: PayrollStatusRow[] = (activeRunsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    blockingIssueCount: r.blocking_issue_count,
    finalTotalCents: r.final_compensation_total_cents,
  }));
  const recentFinalizedRuns: PayrollStatusRow[] = (finalizedRunsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    blockingIssueCount: r.blocking_issue_count,
    finalTotalCents: r.final_compensation_total_cents,
  }));
  const pendingBatches: ImportStatusRow[] = (pendingBatchesRes.data ?? []).map((b) => ({
    id: b.id,
    filename: b.original_filename,
    status: b.status,
    blockedRows: b.blocked_row_count,
  }));
  const recentPostedBatches: ImportStatusRow[] = (postedBatchesRes.data ?? []).map((b) => ({
    id: b.id,
    filename: b.original_filename,
    status: b.status,
    blockedRows: b.blocked_row_count,
  }));

  // Open late-arrival warnings per active run (engine-generated issues).
  const lateByRun = new Map<string, number>();
  if (activeRuns.length > 0) {
    const { data: lateIssues } = await supabase
      .from("payroll_issues")
      .select("payroll_run_id")
      .in("payroll_run_id", activeRuns.map((r) => r.id))
      .eq("code", "late_arriving_appointments")
      .eq("resolution_status", "open");
    for (const issue of lateIssues ?? []) {
      lateByRun.set(
        issue.payroll_run_id,
        (lateByRun.get(issue.payroll_run_id) ?? 0) + 1,
      );
    }
  }

  // Intelligence session (period-scoped) + readiness results.
  let session: IntelligenceSession | null = null;
  let readiness: MetricResult[] = [];
  if (period) {
    session = await IntelligenceSession.create(
      actor,
      organizationId,
      period.startDate,
      period.endDate,
    );
    readiness = READINESS_METRIC_IDS.map((id) => session!.getMetric(id));
  }

  const alertRuns: AlertPayrollRun[] = activeRuns.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    blockingIssueCount: r.blockingIssueCount,
    openLateArrivals: lateByRun.get(r.id) ?? 0,
  }));
  const alertBatches: AlertImportBatch[] = pendingBatches.map((b) => ({
    id: b.id,
    filename: b.filename,
    status: b.status,
  }));

  interface AuditRow {
    id: string;
    action: string;
    entity_type: string;
    created_at: string;
    profiles: { full_name: string | null; email: string } | null;
  }
  const timeline: TimelineEntry[] = ((auditRes.data ?? []) as unknown as AuditRow[]).map(
    (e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entity_type,
      actorName: e.profiles?.full_name || e.profiles?.email || "system",
      createdAt: e.created_at,
    }),
  );

  return {
    organizationId,
    session,
    readiness,
    alerts: deriveAlerts({
      organizationId,
      readiness,
      activePayrollRuns: alertRuns,
      pendingImportBatches: alertBatches,
      periodSelected: period !== null,
    }),
    activeRuns,
    recentFinalizedRuns,
    pendingBatches,
    recentPostedBatches,
    timeline,
    unreadNotifications: unreadRes.count ?? 0,
  };
}
