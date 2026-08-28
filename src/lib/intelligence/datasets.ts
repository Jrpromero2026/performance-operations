/**
 * Dataset loader — the ONLY SQL the intelligence engine issues. Loads the
 * pooled facts once per request (current + previous-period + previous-year
 * windows), always through the actor's own Supabase client so RLS is the
 * final authority underneath the service's permission scoping.
 *
 * Future caching/materialization slots in here without touching a single
 * metric: the loader's output shape IS the cache boundary.
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";
import {
  previousPeriodRange,
  previousYearRange,
} from "./trends/engine";
import type {
  AppointmentFact,
  ClientHistoryFacts,
  IntelligenceDataset,
  PayrollLineFact,
  PayrollTrainerFact,
  ReadinessFacts,
} from "./shared/facts";

const PAGE_SIZE = 1000;

interface ServiceFlags {
  name: string;
  countsAsSession: boolean;
  countsAsCoachingHours: boolean;
  isGroupTraining: boolean;
  isEvaluation: boolean;
}

async function loadAppointmentWindow(
  actor: ActorContext,
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  services: Map<string, ServiceFlags>,
): Promise<AppointmentFact[]> {
  const facts: AppointmentFact[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await actor.supabase
      .from("appointments")
      .select(
        "id, organization_id, department_id, trainer_id, service_id, client_id, appointment_date, duration_minutes, canonical_status, source_listed_price_cents, source_amount_paid_cents",
      )
      .eq("organization_id", organizationId)
      .eq("record_state", "active")
      .gte("appointment_date", dateFrom)
      .lte("appointment_date", dateTo)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`intelligence_load_failed:${error.message}`);
    for (const a of data ?? []) {
      const service = services.get(a.service_id);
      facts.push({
        id: a.id,
        organizationId: a.organization_id,
        departmentId: a.department_id,
        trainerId: a.trainer_id,
        serviceId: a.service_id,
        clientId: a.client_id,
        date: a.appointment_date,
        durationMinutes: a.duration_minutes,
        canonicalStatus: a.canonical_status,
        listedCents: a.source_listed_price_cents,
        paidCents: a.source_amount_paid_cents,
        countsAsSession: service?.countsAsSession ?? true,
        countsAsCoachingHours: service?.countsAsCoachingHours ?? true,
        isGroupTraining: service?.isGroupTraining ?? false,
        isEvaluation: service?.isEvaluation ?? false,
      });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return facts;
}

export async function loadIntelligenceDataset(
  actor: ActorContext,
  organizationId: string,
  dateFrom: string,
  dateTo: string,
): Promise<IntelligenceDataset> {
  const { supabase } = actor;
  const previousPeriod = previousPeriodRange(dateFrom, dateTo);
  const previousYear = previousYearRange(dateFrom, dateTo);
  const loadedFrom = [previousPeriod.dateFrom, previousYear.dateFrom, dateFrom].sort()[0];

  // ---- configuration lookups (names + flags) --------------------------
  const [servicesRes, departmentsRes, rosterRes, snapshotRes] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, display_name, status, counts_as_session, counts_as_coaching_hours, is_group_training, is_evaluation",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId),
    supabase
      .from("trainer_organization_assignments")
      .select("trainer_id, trainers ( id, display_name, status )")
      .eq("organization_id", organizationId)
      .is("effective_to", null),
    supabase
      .from("organizational_snapshots")
      .select(
        "as_of_date, period_start, period_end, organizational_snapshot_values ( metric_key, value )",
      )
      .eq("organization_id", organizationId)
      .eq("source_key", "gym_management_solutions")
      .eq("status", "recorded")
      .order("as_of_date", { ascending: false })
      .limit(1),
  ]);

  interface SnapshotRow {
    as_of_date: string;
    period_start: string;
    period_end: string;
    organizational_snapshot_values: { metric_key: string; value: number }[] | null;
  }
  const snapshotRow = (snapshotRes.data ?? [])[0] as unknown as SnapshotRow | undefined;
  const clubSnapshot = snapshotRow
    ? {
        asOfDate: snapshotRow.as_of_date,
        periodStart: snapshotRow.period_start,
        periodEnd: snapshotRow.period_end,
        values: new Map(
          (snapshotRow.organizational_snapshot_values ?? []).map((v) => [
            v.metric_key,
            Number(v.value),
          ]),
        ),
      }
    : null;

  const services = new Map<string, ServiceFlags>();
  const serviceNames = new Map<string, string>();
  let servicesActive = 0;
  for (const s of servicesRes.data ?? []) {
    services.set(s.id, {
      name: s.display_name,
      countsAsSession: s.counts_as_session,
      countsAsCoachingHours: s.counts_as_coaching_hours,
      isGroupTraining: s.is_group_training,
      isEvaluation: s.is_evaluation,
    });
    serviceNames.set(s.id, s.display_name);
    if (s.status === "active") servicesActive++;
  }

  const departmentNames = new Map<string, string>();
  for (const d of departmentsRes.data ?? []) departmentNames.set(d.id, d.name);

  const trainerNames = new Map<string, string>();
  const rosterTrainerIds: string[] = [];
  for (const row of rosterRes.data ?? []) {
    const trainer = row.trainers as unknown as {
      id: string;
      display_name: string;
      status: string;
    } | null;
    if (!trainer) continue;
    trainerNames.set(trainer.id, trainer.display_name);
    if (trainer.status === "active") rosterTrainerIds.push(trainer.id);
  }

  // ---- appointment pool (three windows; ranges may overlap → dedupe) --
  const windows: { from: string; to: string }[] = [
    { from: dateFrom, to: dateTo },
    { from: previousPeriod.dateFrom, to: previousPeriod.dateTo },
    { from: previousYear.dateFrom, to: previousYear.dateTo },
  ];
  const pooled = new Map<string, AppointmentFact>();
  for (const window of windows) {
    const facts = await loadAppointmentWindow(
      actor,
      organizationId,
      window.from,
      window.to,
      services,
    );
    for (const f of facts) pooled.set(f.id, f);
  }
  const appointments = [...pooled.values()];
  for (const f of appointments) {
    if (!trainerNames.has(f.trainerId)) trainerNames.set(f.trainerId, f.trainerId);
  }

  // ---- finalized payroll pool ----------------------------------------
  const { data: runRows, error: runsError } = await supabase
    .from("payroll_runs")
    .select("id, organization_id, reporting_period_id, status, reporting_periods ( start_date, end_date )")
    .eq("organization_id", organizationId)
    .in("status", ["posted", "locked"]);
  if (runsError) throw new Error(`intelligence_load_failed:${runsError.message}`);
  interface RunRow {
    id: string;
    organization_id: string;
    reporting_period_id: string;
    status: "posted" | "locked";
    reporting_periods: { start_date: string; end_date: string } | null;
  }
  const finalizedRuns = ((runRows ?? []) as unknown as RunRow[]).filter((r) => {
    const period = r.reporting_periods;
    return period && period.start_date <= dateTo && period.end_date >= loadedFrom;
  });

  const payroll: PayrollTrainerFact[] = [];
  const payrollLines: PayrollLineFact[] = [];
  if (finalizedRuns.length > 0) {
    const runIds = finalizedRuns.map((r) => r.id);
    const runById = new Map(finalizedRuns.map((r) => [r.id, r]));
    const [summariesRes, linesRes] = await Promise.all([
      supabase
        .from("payroll_trainer_summaries")
        .select("*")
        .in("payroll_run_id", runIds),
      supabase
        .from("payroll_calculation_lines")
        .select(
          "payroll_run_id, organization_id, trainer_id, line_type, rounded_amount_cents, calculation_status, appointment_id, compensation_plan_version_id",
        )
        .in("payroll_run_id", runIds)
        .eq("calculation_status", "calculated"),
    ]);

    // Compensation method per plan version (for by-method breakdowns).
    const versionIds = new Set<string>();
    for (const s of summariesRes.data ?? []) {
      if (s.compensation_plan_version_id) versionIds.add(s.compensation_plan_version_id);
    }
    for (const l of linesRes.data ?? []) {
      if (l.compensation_plan_version_id) versionIds.add(l.compensation_plan_version_id);
    }
    const methodByVersion = new Map<string, string>();
    if (versionIds.size > 0) {
      const { data: versions } = await supabase
        .from("compensation_plan_versions")
        .select("id, compensation_method")
        .in("id", [...versionIds]);
      for (const v of versions ?? []) methodByVersion.set(v.id, v.compensation_method);
    }

    for (const s of (summariesRes.data ?? []) as Tables<"payroll_trainer_summaries">[]) {
      const run = runById.get(s.payroll_run_id);
      if (!run?.reporting_periods) continue;
      payroll.push({
        runId: run.id,
        organizationId: run.organization_id,
        reportingPeriodId: run.reporting_period_id,
        periodStart: run.reporting_periods.start_date,
        periodEnd: run.reporting_periods.end_date,
        runStatus: run.status,
        trainerId: s.trainer_id,
        finalGrossCents: s.final_gross_compensation_cents,
        commissionCents: s.commission_compensation_cents,
        flatCents: s.flat_rate_compensation_cents,
        hourlyCents: s.hourly_compensation_cents,
        teamCents: s.team_compensation_cents,
        bonusCents: s.bonus_total_cents,
        deductionCents: s.deduction_total_cents,
        adjustmentCents: s.adjustment_total_cents,
        compensatedMinutes: s.compensated_minutes,
        appointmentCount: s.appointment_count,
        completedSessionCount: s.completed_session_count,
        compensationMethod: s.compensation_plan_version_id
          ? (methodByVersion.get(s.compensation_plan_version_id) ?? null)
          : null,
      });
    }

    const appointmentById = new Map(appointments.map((a) => [a.id, a]));
    for (const l of linesRes.data ?? []) {
      const appointment = l.appointment_id
        ? appointmentById.get(l.appointment_id)
        : undefined;
      payrollLines.push({
        runId: l.payroll_run_id,
        organizationId: l.organization_id,
        trainerId: l.trainer_id,
        lineType: l.line_type,
        amountCents: l.rounded_amount_cents,
        serviceId: appointment?.serviceId ?? null,
        departmentId: appointment?.departmentId ?? null,
        compensationMethod: l.compensation_plan_version_id
          ? (methodByVersion.get(l.compensation_plan_version_id) ?? null)
          : null,
      });
    }
  }

  // ---- client lifetime history (materialization candidate) ------------
  const firstVisit = new Map<string, string>();
  const lastVisit = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("appointments")
      .select("client_id, appointment_date")
      .eq("organization_id", organizationId)
      .eq("record_state", "active")
      .eq("canonical_status", "completed")
      .not("client_id", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`intelligence_load_failed:${error.message}`);
    for (const row of data ?? []) {
      const id = row.client_id!;
      const date = row.appointment_date;
      const first = firstVisit.get(id);
      if (first === undefined || date < first) firstVisit.set(id, date);
      const last = lastVisit.get(id);
      if (last === undefined || date > last) lastVisit.set(id, date);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  const previousWindowActive = new Set<string>();
  for (const a of appointments) {
    if (
      a.canonicalStatus === "completed" &&
      a.clientId !== null &&
      a.date >= previousPeriod.dateFrom &&
      a.date <= previousPeriod.dateTo
    ) {
      previousWindowActive.add(a.clientId);
    }
  }
  const clientHistory: ClientHistoryFacts = {
    firstVisit,
    lastVisit,
    previousWindowActive,
  };

  // ---- pipeline flags -------------------------------------------------
  const [{ count: postedBatches }, { count: finalizedRunCount }] = await Promise.all([
    supabase
      .from("import_batches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("posted_at", "is", null),
    supabase
      .from("payroll_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["posted", "locked"]),
  ]);
  const flags = {
    hasPostedImports: (postedBatches ?? 0) > 0,
    hasAnyFinalizedPayroll: (finalizedRunCount ?? 0) > 0,
    hasFinalizedPayrollInRange: payroll.some(
      (p) => p.periodStart <= dateTo && p.periodEnd >= dateFrom,
    ),
    paidAmountsPresent: appointments.some(
      (a) => a.date >= dateFrom && a.date <= dateTo && a.paidCents !== null,
    ),
  };

  // ---- readiness facts ------------------------------------------------
  const readiness = await loadReadinessFacts(
    actor,
    organizationId,
    rosterTrainerIds,
    servicesActive,
    dateFrom,
    dateTo,
  );

  return {
    organizationId,
    dateFrom,
    dateTo,
    appointments,
    loadedFrom,
    payroll,
    payrollLines,
    clientHistory,
    flags,
    readiness,
    clubSnapshot,
    names: {
      trainers: trainerNames,
      departments: departmentNames,
      services: serviceNames,
    },
  };
}

async function loadReadinessFacts(
  actor: ActorContext,
  organizationId: string,
  rosterTrainerIds: string[],
  servicesActive: number,
  dateFrom: string,
  dateTo: string,
): Promise<ReadinessFacts> {
  const { supabase } = actor;
  const [
    deptAssignRes,
    compAssignRes,
    aliasRes,
    periodsRes,
    importIssuesRes,
    pendingBatchesRes,
    activeRunsRes,
  ] = await Promise.all([
    supabase
      .from("trainer_department_assignments")
      .select("trainer_id")
      .eq("organization_id", organizationId)
      .is("effective_to", null),
    supabase
      .from("trainer_compensation_assignments")
      .select("trainer_id")
      .eq("organization_id", organizationId)
      .or(`effective_to.is.null,effective_to.gte.${dateFrom}`),
    supabase
      .from("service_source_aliases")
      .select("service_id")
      .eq("organization_id", organizationId),
    supabase
      .from("reporting_periods")
      .select("start_date, end_date")
      .eq("organization_id", organizationId)
      .lte("start_date", dateTo)
      .gte("end_date", dateFrom),
    supabase
      .from("import_row_issues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("severity", "blocking")
      .eq("resolution_status", "open"),
    supabase
      .from("import_batches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["uploaded", "parsing", "validating", "needs_review", "ready_for_approval", "approved"]),
    supabase
      .from("payroll_runs")
      .select("id")
      .eq("organization_id", organizationId)
      .in("status", [
        "draft",
        "calculating",
        "needs_review",
        "ready_for_approval",
        "approved",
        "reopened",
        "failed",
      ]),
  ]);

  const roster = new Set(rosterTrainerIds);
  const withDepartment = new Set(
    (deptAssignRes.data ?? [])
      .map((r) => r.trainer_id)
      .filter((id) => roster.has(id)),
  );
  const withCompensation = new Set(
    (compAssignRes.data ?? [])
      .map((r) => r.trainer_id)
      .filter((id) => roster.has(id)),
  );
  const servicesWithAlias = new Set((aliasRes.data ?? []).map((r) => r.service_id));

  // Period coverage: merge sorted period ranges; range covered iff no gap.
  const ranges = ((periodsRes.data ?? []) as { start_date: string; end_date: string }[])
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  let covered = false;
  {
    let cursor = dateFrom;
    for (const range of ranges) {
      if (range.start_date > cursor) break;
      if (range.end_date >= cursor) {
        // extend cursor to the day after this range ends
        const d = new Date(`${range.end_date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        cursor = d.toISOString().slice(0, 10);
        if (cursor > dateTo) {
          covered = true;
          break;
        }
      }
    }
  }

  const activeRunIds = (activeRunsRes.data ?? []).map((r) => r.id);
  let openPayrollBlocking = 0;
  if (activeRunIds.length > 0) {
    const { count } = await supabase
      .from("payroll_issues")
      .select("id", { count: "exact", head: true })
      .in("payroll_run_id", activeRunIds)
      .eq("severity", "blocking")
      .eq("resolution_status", "open");
    openPayrollBlocking = count ?? 0;
  }

  return {
    trainersActive: roster.size,
    trainersWithDepartment: withDepartment.size,
    trainersWithCompensation: withCompensation.size,
    servicesActive,
    servicesWithAlias: [...servicesWithAlias].filter((id) => id).length,
    rangeCoveredByPeriods: covered,
    openImportBlockingIssues: importIssuesRes.count ?? 0,
    importBatchesAwaitingAction: pendingBatchesRes.count ?? 0,
    openPayrollBlockingIssues: openPayrollBlocking,
    activePayrollRunsNotFinalized: activeRunIds.length,
  };
}
