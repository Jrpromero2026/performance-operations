/**
 * Payroll run orchestration: loads canonical ledger + configuration into
 * engine inputs, and persists engine results back to the database. Heavy
 * writes are chunked; every unresolved configuration state becomes a
 * loader-level blocking issue instead of a silent assumption.
 */

import type { Json, Tables, TablesInsert } from "@/lib/supabase/types";
import type { ActorContext } from "@/lib/actions/shared";
import type { CompensationMethod } from "@/lib/schemas/compensation";
import { isRoundingScope } from "./rounding";
import type {
  AssignmentPurpose,
  AssignmentRole,
  EngineAppointment,
  EngineInput,
  EngineIssue,
  EnginePlanAssignment,
  EnginePlanVersion,
  EngineResult,
} from "./types";

const CHUNK_SIZE = 500;
const PAGE_SIZE = 1000;

export interface LoadedEngineData {
  input: EngineInput;
  /** Issues detected while loading (ambiguous config etc.) — merged with engine issues. */
  loaderIssues: EngineIssue[];
  /** Active in-period appointments posted AFTER the run's cutoff (not paid). */
  lateAppointmentCount: number;
  /** Time entries consumed by this calculation. */
  timeEntryIds: string[];
  /** Adjustments consumed by this calculation. */
  adjustmentIds: string[];
}

type PayrollRun = Tables<"payroll_runs">;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`load_failed:${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

/* -------------------------------------------------------------- loading */

export async function loadEngineData(
  actor: ActorContext,
  run: PayrollRun,
  cutoffAt: string,
): Promise<LoadedEngineData> {
  const { supabase } = actor;
  const loaderIssues: EngineIssue[] = [];

  const { data: period, error: periodError } = await supabase
    .from("reporting_periods")
    .select("*")
    .eq("id", run.reporting_period_id)
    .single();
  if (periodError || !period) throw new Error("period_not_found");

  // 1) Active canonical appointments inside the period window.
  const allAppointments = await loadAllPages<Tables<"appointments">>((from, to) =>
    supabase
      .from("appointments")
      .select("*")
      .eq("organization_id", run.organization_id)
      .eq("record_state", "active")
      .gte("appointment_date", period.start_date)
      .lte("appointment_date", period.end_date)
      .order("id")
      .range(from, to),
  );

  // Late-arriving handling: rows posted after the cutoff are visible but not
  // payable until the cutoff is refreshed (explicit, audited action).
  const inScope = allAppointments.filter((a) => a.posted_at <= cutoffAt);
  const lateAppointmentCount = allAppointments.length - inScope.length;

  // 2) Explicit multi-trainer assignments for those appointments.
  const assignmentRows: Tables<"appointment_trainer_assignments">[] = [];
  for (const ids of chunk(inScope.map((a) => a.id), CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("appointment_trainer_assignments")
      .select("*")
      .in("appointment_id", ids)
      .eq("status", "active");
    if (error) throw new Error(`load_failed:${error.message}`);
    assignmentRows.push(...(data ?? []));
  }
  const assignmentsByAppointment = new Map<string, Tables<"appointment_trainer_assignments">[]>();
  for (const row of assignmentRows) {
    const list = assignmentsByAppointment.get(row.appointment_id) ?? [];
    list.push(row);
    assignmentsByAppointment.set(row.appointment_id, list);
  }

  const appointments: EngineAppointment[] = inScope.map((a) => {
    const explicit = assignmentsByAppointment.get(a.id);
    return {
      id: a.id,
      serviceId: a.service_id,
      departmentId: a.department_id,
      canonicalStatus: a.canonical_status,
      startAt: a.start_at,
      durationMinutes: a.duration_minutes,
      participantCount: a.participant_count,
      listedAmountCents: a.source_listed_price_cents,
      paidAmountCents: a.source_amount_paid_cents,
      paymentStatus: a.payment_status,
      participations: explicit?.length
        ? explicit.map((row) => ({
            assignmentId: row.id,
            trainerId: row.trainer_id,
            role: row.role as AssignmentRole,
            compensatedMinutes: row.compensated_minutes,
          }))
        : [
            {
              assignmentId: null,
              trainerId: a.trainer_id,
              role: "primary" as const,
              compensatedMinutes: null,
            },
          ],
    };
  });

  // 3) Compensation plan assignments effective in the period. Overlapping
  //    assignments for the same purpose fail closed (mid-period changes are
  //    an unresolved business rule — gaps doc item 20).
  const { data: compAssignments, error: caError } = await supabase
    .from("trainer_compensation_assignments")
    .select("*")
    .eq("organization_id", run.organization_id)
    .lte("effective_from", period.end_date)
    .or(`effective_to.is.null,effective_to.gte.${period.start_date}`);
  if (caError) throw new Error(`load_failed:${caError.message}`);

  const byTrainerPurpose = new Map<string, Tables<"trainer_compensation_assignments">[]>();
  for (const row of compAssignments ?? []) {
    const key = `${row.trainer_id}:${row.purpose}`;
    const list = byTrainerPurpose.get(key) ?? [];
    list.push(row);
    byTrainerPurpose.set(key, list);
  }

  const versionIds = new Set<string>();
  const chosenAssignments: Tables<"trainer_compensation_assignments">[] = [];
  for (const [key, rows] of [...byTrainerPurpose.entries()].sort()) {
    if (rows.length > 1) {
      const [trainerId, purpose] = key.split(":");
      loaderIssues.push({
        code: "ambiguous_plan_assignment",
        severity: "blocking",
        message: `Trainer has ${rows.length} overlapping '${purpose}' compensation assignments in this period; mid-period plan changes are an unresolved business rule.`,
        suggestedAction:
          "End one assignment before the period starts or align effective dates so exactly one applies.",
        trainerId,
        appointmentId: null,
        ruleId: null,
        entityType: "trainer_compensation_assignment",
        entityId: rows[0].id,
      });
      continue;
    }
    chosenAssignments.push(rows[0]);
    versionIds.add(rows[0].plan_version_id);
  }

  // 4) Plan versions + rules + tiers (published only — fail closed otherwise).
  const versions = new Map<string, EnginePlanVersion>();
  if (versionIds.size > 0) {
    const { data: versionRows, error: vError } = await supabase
      .from("compensation_plan_versions")
      .select("*, compensation_plans ( name ), compensation_rules ( * ), commission_tiers ( * )")
      .in("id", [...versionIds]);
    if (vError) throw new Error(`load_failed:${vError.message}`);
    for (const row of versionRows ?? []) {
      const planName =
        (row.compensation_plans as unknown as { name: string } | null)?.name ??
        "(unnamed plan)";
      if (row.status !== "published") {
        loaderIssues.push({
          code: "plan_version_not_published",
          severity: "blocking",
          message: `Plan '${planName}' v${row.version_number} is assigned but not published (status: ${row.status}).`,
          suggestedAction: "Publish the plan version or assign a published one.",
          trainerId: null,
          appointmentId: null,
          ruleId: null,
          entityType: "compensation_plan_version",
          entityId: row.id,
        });
        continue;
      }
      const rules = (row.compensation_rules as unknown as Tables<"compensation_rules">[]) ?? [];
      const tiers = (row.commission_tiers as unknown as Tables<"commission_tiers">[]) ?? [];
      versions.set(row.id, {
        id: row.id,
        planName,
        method: row.compensation_method as CompensationMethod,
        tierBehavior: row.tier_behavior as EnginePlanVersion["tierBehavior"],
        roundingScope:
          row.rounding_scope && isRoundingScope(row.rounding_scope)
            ? row.rounding_scope
            : null,
        rules: rules
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((r) => ({
            id: r.id,
            ruleType: r.rule_type as EnginePlanVersion["rules"][number]["ruleType"],
            amountCents: r.amount_cents,
            rateBasisPoints: r.rate_basis_points,
            basisType: r.basis_type,
            criteria: r.criteria,
          })),
        tiers: tiers
          .sort((a, b) => a.sequence - b.sequence)
          .map((t) => ({
            id: t.id,
            sequence: t.sequence,
            minRevenueCents: t.min_revenue_cents,
            maxRevenueCents: t.max_revenue_cents,
            rateBasisPoints: t.rate_basis_points,
          })),
      });
    }
  }

  const planAssignments: EnginePlanAssignment[] = chosenAssignments.flatMap((row) => {
    const planVersion = versions.get(row.plan_version_id);
    if (!planVersion) return []; // unpublished — loader issue already recorded
    return [
      {
        trainerId: row.trainer_id,
        purpose: row.purpose as AssignmentPurpose,
        assignmentId: row.id,
        planVersion,
      },
    ];
  });

  // 5) Approved manual time (plus rows already included in THIS run, so
  //    recalculation is stable).
  const { data: timeRows, error: timeError } = await supabase
    .from("manual_time_entries")
    .select("*")
    .eq("organization_id", run.organization_id)
    .eq("reporting_period_id", run.reporting_period_id)
    .in("status", ["approved", "included"]);
  if (timeError) throw new Error(`load_failed:${timeError.message}`);
  const usableTime = (timeRows ?? []).filter(
    (t) => t.status === "approved" || t.payroll_run_id === run.id,
  );
  for (const t of usableTime) {
    if (t.approved_minutes === null) {
      loaderIssues.push({
        code: "time_entry_missing_approved_minutes",
        severity: "blocking",
        message: `Approved time entry (${t.work_category}, ${t.work_date}) has no approved minutes recorded.`,
        suggestedAction: "Re-approve the entry with an explicit approved duration.",
        trainerId: t.trainer_id,
        appointmentId: null,
        ruleId: null,
        entityType: "manual_time_entry",
        entityId: t.id,
      });
    }
  }
  const timeEntries = usableTime
    .filter((t) => t.approved_minutes !== null)
    .map((t) => ({
      id: t.id,
      trainerId: t.trainer_id,
      workDate: t.work_date,
      workCategory: t.work_category,
      approvedMinutes: t.approved_minutes!,
      compensationPurpose: t.compensation_purpose as AssignmentPurpose,
    }));

  // 6) Approved adjustments (same recalculation rule).
  const { data: adjRows, error: adjError } = await supabase
    .from("payroll_adjustments")
    .select("*")
    .eq("organization_id", run.organization_id)
    .eq("reporting_period_id", run.reporting_period_id)
    .in("status", ["approved", "included"]);
  if (adjError) throw new Error(`load_failed:${adjError.message}`);
  const usableAdjustments = (adjRows ?? []).filter(
    (a) => a.status === "approved" || a.payroll_run_id === run.id,
  );
  const adjustments = usableAdjustments.map((a) => ({
    id: a.id,
    trainerId: a.trainer_id,
    adjustmentType: a.adjustment_type as EngineInput["adjustments"][number]["adjustmentType"],
    amountCents: a.amount_cents,
    reason: a.reason,
  }));

  return {
    input: {
      organizationId: run.organization_id,
      payrollRunId: run.id,
      appointments,
      planAssignments,
      timeEntries,
      adjustments,
      trainerIds: [],
    },
    loaderIssues,
    lateAppointmentCount,
    timeEntryIds: timeEntries.map((t) => t.id),
    adjustmentIds: adjustments.map((a) => a.id),
  };
}

/* ----------------------------------------------------------- persisting */

export async function persistEngineResult(
  actor: ActorContext,
  run: PayrollRun,
  result: EngineResult,
  loaderIssues: EngineIssue[],
  lateAppointmentCount: number,
  consumed: { timeEntryIds: string[]; adjustmentIds: string[] },
): Promise<void> {
  const { supabase } = actor;

  // Release previously included time/adjustments no longer consumed, BEFORE
  // deleting lines (protect triggers allow release while the run is mutable).
  const { data: prevTime } = await supabase
    .from("manual_time_entries")
    .select("id")
    .eq("payroll_run_id", run.id)
    .eq("status", "included");
  const dropTime = (prevTime ?? [])
    .map((r) => r.id)
    .filter((id) => !consumed.timeEntryIds.includes(id));
  for (const ids of chunk(dropTime, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("manual_time_entries")
      .update({ status: "approved", payroll_run_id: null })
      .in("id", ids);
    if (error) throw new Error(`time_release_failed:${error.message}`);
  }

  const { data: prevAdj } = await supabase
    .from("payroll_adjustments")
    .select("id")
    .eq("payroll_run_id", run.id)
    .eq("status", "included");
  const dropAdj = (prevAdj ?? [])
    .map((r) => r.id)
    .filter((id) => !consumed.adjustmentIds.includes(id));
  for (const ids of chunk(dropAdj, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("payroll_adjustments")
      .update({ status: "approved", payroll_run_id: null })
      .in("id", ids);
    if (error) throw new Error(`adjustment_release_failed:${error.message}`);
  }

  // Replace previous calculation artifacts.
  {
    const { error } = await supabase
      .from("payroll_calculation_lines")
      .delete()
      .eq("payroll_run_id", run.id);
    if (error) throw new Error(`line_delete_failed:${error.message}`);
  }
  {
    const { error } = await supabase
      .from("payroll_issues")
      .delete()
      .eq("payroll_run_id", run.id);
    if (error) throw new Error(`issue_delete_failed:${error.message}`);
  }
  {
    const { error } = await supabase
      .from("payroll_trainer_summaries")
      .delete()
      .eq("payroll_run_id", run.id);
    if (error) throw new Error(`summary_delete_failed:${error.message}`);
  }

  // Trainer summaries (need generated ids for line FK).
  const summaryInserts: TablesInsert<"payroll_trainer_summaries">[] =
    result.trainers.map((t) => ({
      payroll_run_id: run.id,
      organization_id: run.organization_id,
      trainer_id: t.trainerId,
      compensation_assignment_id: t.planAssignmentId,
      compensation_plan_version_id: t.planVersionId,
      calculation_status: t.calculationStatus,
      appointment_count: t.totals.appointmentCount,
      completed_session_count: t.totals.completedSessionCount,
      compensated_minutes: t.totals.compensatedMinutes,
      eligible_basis_total_cents: t.totals.eligibleBasisTotalCents,
      commission_compensation_cents: t.totals.commissionCents,
      flat_rate_compensation_cents: t.totals.flatRateCents,
      hourly_compensation_cents: t.totals.hourlyCents,
      team_compensation_cents: t.totals.teamCents,
      bonus_total_cents: t.totals.bonusCents,
      deduction_total_cents: t.totals.deductionCents,
      adjustment_total_cents: t.totals.adjustmentCents,
      final_gross_compensation_cents: t.totals.finalGrossCents,
      blocking_issue_count: t.blockingIssueCount,
      warning_count: t.warningCount,
    }));

  const summaryIdByTrainer = new Map<string, string>();
  for (const batch of chunk(summaryInserts, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("payroll_trainer_summaries")
      .insert(batch)
      .select("id, trainer_id");
    if (error) throw new Error(`summary_insert_failed:${error.message}`);
    for (const row of data ?? []) summaryIdByTrainer.set(row.trainer_id, row.id);
  }

  // Calculation lines.
  const lineInserts: TablesInsert<"payroll_calculation_lines">[] =
    result.trainers.flatMap((t) =>
      t.lines.map((l) => ({
        payroll_run_id: run.id,
        trainer_summary_id: summaryIdByTrainer.get(t.trainerId)!,
        organization_id: run.organization_id,
        trainer_id: t.trainerId,
        appointment_id: l.appointmentId,
        appointment_trainer_assignment_id: l.appointmentAssignmentId,
        manual_time_entry_id: l.manualTimeEntryId,
        payroll_adjustment_id: l.payrollAdjustmentId,
        compensation_plan_version_id: l.planVersionId,
        compensation_rule_id: l.ruleId,
        line_type: l.lineType,
        calculation_status: l.calculationStatus,
        input_quantity: l.inputQuantity,
        input_unit: l.inputUnit,
        basis_amount_cents: l.basisAmountCents,
        rate_amount_cents: l.rateAmountCents,
        rate_basis_points: l.rateBasisPoints,
        calculated_amount_cents: l.calculatedAmountCents,
        rounded_amount_cents: l.roundedAmountCents,
        rounding_method: l.roundingMethod,
        eligibility_result: l.eligibilityResult,
        exclusion_reason: l.exclusionReason,
        calculation_formula_version: result.calculationVersion,
        calculation_trace: l.trace as unknown as Json,
      })),
    );
  for (const batch of chunk(lineInserts, CHUNK_SIZE)) {
    const { error } = await supabase.from("payroll_calculation_lines").insert(batch);
    if (error) throw new Error(`line_insert_failed:${error.message}`);
  }

  // Issues: engine + loader + late-arrival warning.
  const allIssues: EngineIssue[] = [...loaderIssues, ...result.issues];
  if (lateAppointmentCount > 0) {
    allIssues.push({
      code: "late_arriving_appointments",
      severity: "warning",
      message: `${lateAppointmentCount} active appointment(s) in this period were imported after the run's appointment cutoff and are NOT included.`,
      suggestedAction:
        "Refresh the appointment cutoff and recalculate to include them, or leave them for a supplemental run.",
      trainerId: null,
      appointmentId: null,
      ruleId: null,
      entityType: "payroll_run",
      entityId: run.id,
    });
  }
  const issueInserts: TablesInsert<"payroll_issues">[] = allIssues.map((i) => ({
    payroll_run_id: run.id,
    organization_id: run.organization_id,
    trainer_id: i.trainerId,
    appointment_id: i.appointmentId,
    compensation_rule_id: i.ruleId,
    code: i.code,
    severity: i.severity,
    entity_type: i.entityType,
    entity_id: i.entityId,
    message: i.message,
    suggested_action: i.suggestedAction,
  }));
  for (const batch of chunk(issueInserts, CHUNK_SIZE)) {
    const { error } = await supabase.from("payroll_issues").insert(batch);
    if (error) throw new Error(`issue_insert_failed:${error.message}`);
  }

  // Mark consumed inputs as included.
  for (const ids of chunk(consumed.timeEntryIds, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("manual_time_entries")
      .update({ status: "included", payroll_run_id: run.id })
      .in("id", ids);
    if (error) throw new Error(`time_include_failed:${error.message}`);
  }
  for (const ids of chunk(consumed.adjustmentIds, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("payroll_adjustments")
      .update({ status: "included", payroll_run_id: run.id })
      .in("id", ids);
    if (error) throw new Error(`adjustment_include_failed:${error.message}`);
  }

  // Run totals.
  const blockingCount = allIssues.filter((i) => i.severity === "blocking").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;
  const { error: totalsError } = await supabase
    .from("payroll_runs")
    .update({
      gross_compensation_total_cents: result.runTotals.grossCompensationCents,
      adjustment_total_cents: result.runTotals.adjustmentCents,
      final_compensation_total_cents: result.runTotals.finalCompensationCents,
      trainer_count: result.runTotals.trainerCount,
      appointment_count: result.runTotals.appointmentCount,
      blocking_issue_count: blockingCount,
      warning_count: warningCount,
      calculation_completed_at: new Date().toISOString(),
      failure_code: null,
      sanitized_failure_message: null,
    })
    .eq("id", run.id);
  if (totalsError) throw new Error(`run_totals_failed:${totalsError.message}`);
}
