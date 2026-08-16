/**
 * Gather the live inputs for the freshness and data-quality models.
 *
 * Every query runs through the caller's RLS client, so an operator only
 * ever sees health for organizations they can already access. The models
 * themselves are pure; this module is the only part that touches I/O.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { buildFreshnessReport, type FreshnessInputs, type FreshnessReport } from "./model";
import type { DataQualityCounts } from "./data-quality";

/** Issue codes that mean "this row cannot resolve to a trainer". */
const TRAINER_ISSUE_CODES = ["unmatched_trainer", "ambiguous_trainer"];
const CLIENT_ISSUE_CODES = ["unmatched_client", "ambiguous_client"];
const SERVICE_ISSUE_CODES = ["unmatched_service"];
const STATUS_ISSUE_CODES = ["unknown_source_status", "status_not_provided_by_source"];

export async function loadFreshnessReport(
  actor: ActorContext,
  organizationId: string,
  todayIsoDate: string
): Promise<FreshnessReport> {
  const [latestAppointment, lastBatch, lastSync, activeConnection, latestSnapshot, snapshotCount, latestPayroll] =
    await Promise.all([
      actor.supabase
        .from("appointments")
        .select("appointment_date", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("record_state", "active")
        .order("appointment_date", { ascending: false })
        .limit(1),
      actor.supabase
        .from("import_batches")
        .select("posted_at")
        .eq("organization_id", organizationId)
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(1),
      actor.supabase
        .from("integration_sync_runs")
        .select("completed_at")
        .eq("organization_id", organizationId)
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false })
        .limit(1),
      actor.supabase
        .from("integration_connections")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      actor.supabase
        .from("organizational_snapshots")
        .select("as_of_date, entered_at")
        .eq("organization_id", organizationId)
        .eq("source_key", "gym_management_solutions")
        .eq("status", "recorded")
        .order("as_of_date", { ascending: false })
        .limit(1),
      actor.supabase
        .from("organizational_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "recorded"),
      actor.supabase
        .from("payroll_runs")
        .select("posted_at, reporting_periods ( end_date )")
        .eq("organization_id", organizationId)
        .in("status", ["posted", "locked"])
        .order("posted_at", { ascending: false })
        .limit(1),
    ]);

  interface PayrollRow {
    posted_at: string | null;
    reporting_periods: { end_date: string } | null;
  }
  const payrollRow = (latestPayroll.data ?? [])[0] as unknown as PayrollRow | undefined;

  const inputs: FreshnessInputs = {
    todayIsoDate,
    appointments: {
      latestAppointmentDate: latestAppointment.data?.[0]?.appointment_date ?? null,
      lastImportAt: lastBatch.data?.[0]?.posted_at ?? null,
      lastSyncAt: lastSync.data?.[0]?.completed_at ?? null,
      connectionActive: (activeConnection.count ?? 0) > 0,
      postedAppointmentCount: latestAppointment.count ?? 0,
    },
    clubMembership: {
      latestSnapshotAsOf: latestSnapshot.data?.[0]?.as_of_date ?? null,
      latestSnapshotEnteredAt: latestSnapshot.data?.[0]?.entered_at ?? null,
      snapshotCount: snapshotCount.count ?? 0,
    },
    payroll: {
      latestFinalizedPeriodEnd: payrollRow?.reporting_periods?.end_date ?? null,
      latestFinalizedAt: payrollRow?.posted_at ?? null,
      finalizedRunCount: payrollRow ? 1 : 0,
    },
  };

  return buildFreshnessReport(inputs);
}

export async function loadDataQualityCounts(
  actor: ActorContext,
  organizationId: string
): Promise<DataQualityCounts> {
  const openIssues = (codes: string[]) =>
    actor.supabase
      .from("import_row_issues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("resolution_status", "open")
      .in("code", codes);

  const [
    trainerIssues,
    clientIssues,
    serviceIssues,
    statusIssues,
    unknownAppointments,
    blockingIssues,
    payrollIssues,
    trainerAssignments,
    compensationAssignments,
    failedConnections,
  ] = await Promise.all([
    openIssues(TRAINER_ISSUE_CODES),
    openIssues(CLIENT_ISSUE_CODES),
    openIssues(SERVICE_ISSUE_CODES),
    openIssues(STATUS_ISSUE_CODES),
    actor.supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("record_state", "active")
      .eq("canonical_status", "unknown"),
    actor.supabase
      .from("import_row_issues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("resolution_status", "open")
      .eq("severity", "blocking"),
    actor.supabase
      .from("payroll_issues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("resolution_status", "open"),
    actor.supabase
      .from("trainer_organization_assignments")
      .select("trainer_id")
      .eq("organization_id", organizationId)
      .is("effective_to", null),
    actor.supabase
      .from("trainer_compensation_assignments")
      .select("trainer_id")
      .eq("organization_id", organizationId)
      .is("effective_to", null),
    actor.supabase
      .from("integration_connections")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["failed", "degraded"]),
  ]);

  const compensated = new Set((compensationAssignments.data ?? []).map((r) => r.trainer_id));
  const trainersMissingCompensation = (trainerAssignments.data ?? []).filter(
    (r) => !compensated.has(r.trainer_id)
  ).length;

  return {
    unresolvedTrainerMappings: trainerIssues.count ?? 0,
    unresolvedClientMappings: clientIssues.count ?? 0,
    unmatchedServices: serviceIssues.count ?? 0,
    unknownStatuses: statusIssues.count ?? 0,
    unknownStatusAppointments: unknownAppointments.count ?? 0,
    openImportExceptions: blockingIssues.count ?? 0,
    openPayrollExceptions: payrollIssues.count ?? 0,
    trainersMissingCompensation,
    failedConnections: failedConnections.count ?? 0,
  };
}
