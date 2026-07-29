/**
 * Close-export document assembly: loads FROZEN sources (posted payroll
 * rows, ready package payloads, close manifests) and renders the CSV/JSON
 * deterministically. Used by generation (records the close_exports row)
 * AND by download (regenerates and verifies the recorded sha256) — one
 * builder, so bytes cannot drift from the recorded hash unless a frozen
 * source was tampered with (which the verification then catches).
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";
import {
  buildTrainerStatementCsv,
  loadRunStatementContext,
  loadTrainerStatement,
} from "@/lib/payroll/statements";
import { formatBasisPoints, formatCents } from "@/lib/money/money";
import { sha256Hex, stableStringify } from "./manifest";
import type { CsvDocument } from "./csv";
import {
  buildDepartmentSummaryCsv,
  buildExecutiveSummaryCsv,
  buildPayrollDetailCsv,
  buildPayrollRegisterCsv,
  buildStatementRegisterCsv,
  type DepartmentSummaryRow,
  type DetailRow,
  type ExecutiveMetricRow,
  type ExportMeta,
  type RegisterRow,
  type StatementRegisterRow,
} from "./exports";

export type CloseExportType =
  | "payroll_register_csv"
  | "payroll_detail_csv"
  | "department_summary_csv"
  | "executive_summary_csv"
  | "trainer_statement_register_csv"
  | "close_manifest_json";

export interface BuiltExport {
  document: CsvDocument;
  fileName: string;
  mimeType: string;
  payrollRunId: string | null;
  payrollSnapshotVersion: number | null;
}

interface PeriodRef {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

async function finalizedPayroll(actor: ActorContext, periodId: string) {
  const { data: runs } = await actor.supabase
    .from("payroll_runs")
    .select("*")
    .eq("reporting_period_id", periodId)
    .in("status", ["posted", "locked"])
    .limit(1);
  const run = runs?.[0] ?? null;
  let snapshotVersion: number | null = null;
  if (run) {
    const { data: snapshot } = await actor.supabase
      .from("payroll_snapshots")
      .select("snapshot_version")
      .eq("payroll_run_id", run.id)
      .order("snapshot_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotVersion = snapshot?.snapshot_version ?? null;
  }
  return { run, snapshotVersion };
}

async function latestReadyPackage(
  actor: ActorContext,
  organizationId: string,
  periodId: string,
  packageType: string,
): Promise<Tables<"report_packages"> | null> {
  const { data } = await actor.supabase
    .from("report_packages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reporting_period_id", periodId)
    .eq("package_type", packageType)
    .in("status", ["ready", "finalized"])
    .order("version", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

function slug(label: string): string {
  return label.replaceAll(/[^\w.-]+/g, "_").slice(0, 40);
}

export async function buildCloseExport(
  actor: ActorContext,
  organizationId: string,
  organizationName: string,
  period: PeriodRef,
  exportType: CloseExportType,
): Promise<BuiltExport | { error: string }> {
  const meta: ExportMeta = {
    organizationName,
    periodLabel: period.label,
    periodRange: `${period.start_date} – ${period.end_date}`,
  };
  const base = `${slug(organizationName)}-${period.start_date}`;

  if (exportType === "payroll_register_csv" || exportType === "payroll_detail_csv" ||
      exportType === "trainer_statement_register_csv") {
    const { run, snapshotVersion } = await finalizedPayroll(actor, period.id);
    if (!run) return { error: "No posted or locked payroll run exists for this period." };
    meta.payrollRunId = run.id;
    meta.payrollSnapshotVersion = snapshotVersion;

    if (exportType === "payroll_register_csv") {
      const [{ data: summaries }, namesByTrainer, planByTrainer] = await registerContext(actor, run.id);
      const rows: RegisterRow[] = (summaries ?? []).map((s) => ({
        trainerId: s.trainer_id,
        trainerName: namesByTrainer.get(s.trainer_id)?.name ?? s.trainer_id,
        department: namesByTrainer.get(s.trainer_id)?.department ?? "",
        compensationPlan: planByTrainer.get(s.trainer_id)?.plan ?? "",
        compensationMethod: planByTrainer.get(s.trainer_id)?.method ?? "",
        sessionCents: s.flat_rate_compensation_cents,
        hourlyCents: s.hourly_compensation_cents,
        commissionCents: s.commission_compensation_cents,
        teamCents: s.team_compensation_cents,
        bonusCents: s.bonus_total_cents,
        deductionCents: s.deduction_total_cents,
        adjustmentCents: s.adjustment_total_cents,
        finalGrossCents: s.final_gross_compensation_cents,
      }));
      return {
        document: buildPayrollRegisterCsv(meta, rows),
        fileName: `payroll-register-${base}.csv`,
        mimeType: "text/csv",
        payrollRunId: run.id,
        payrollSnapshotVersion: snapshotVersion,
      };
    }

    if (exportType === "payroll_detail_csv") {
      const rows = await detailRows(actor, run.id);
      return {
        document: buildPayrollDetailCsv(meta, rows),
        fileName: `payroll-detail-${base}.csv`,
        mimeType: "text/csv",
        payrollRunId: run.id,
        payrollSnapshotVersion: snapshotVersion,
      };
    }

    // trainer_statement_register_csv
    const context = await loadRunStatementContext(actor, run.id);
    if (!context) return { error: "Statement context unavailable." };
    const rows: StatementRegisterRow[] = [];
    for (const summary of context.summaries) {
      const statement = await loadTrainerStatement(actor, run.id, summary.trainer_id);
      if (!statement) continue;
      rows.push({
        trainerId: summary.trainer_id,
        trainerName: summary.trainerName,
        finalGrossCents: summary.final_gross_compensation_cents,
        statementSha256: sha256Hex(buildTrainerStatementCsv(context, statement)),
      });
    }
    return {
      document: buildStatementRegisterCsv(meta, rows),
      fileName: `trainer-statement-register-${base}.csv`,
      mimeType: "text/csv",
      payrollRunId: run.id,
      payrollSnapshotVersion: snapshotVersion,
    };
  }

  if (exportType === "executive_summary_csv" || exportType === "department_summary_csv") {
    const pkg = await latestReadyPackage(actor, organizationId, period.id, "executive");
    if (!pkg) return { error: "Generate the executive report package first." };
    const payload = pkg.payload as {
      metrics?: {
        metric_id: string;
        value: number | null;
        unit: string;
        health: string;
        reason: string | null;
      }[];
      departments?: Record<string, { key: string; label: string; value: number | null }[]>;
      payroll?: { snapshot_version: number | null } | null;
    };

    if (exportType === "executive_summary_csv") {
      const rows: ExecutiveMetricRow[] = (payload.metrics ?? []).map((m) => ({
        metricId: m.metric_id,
        name: m.metric_id,
        value: m.value,
        unit: m.unit,
        health: m.health,
        reason: m.reason ?? "",
        scope: "organization",
        period: period.label,
        version: pkg.intelligence_version ?? "intel-v1",
      }));
      return {
        document: buildExecutiveSummaryCsv(meta, rows),
        fileName: `executive-summary-${base}.csv`,
        mimeType: "text/csv",
        payrollRunId: pkg.payroll_run_id,
        payrollSnapshotVersion: pkg.payroll_snapshot_version,
      };
    }

    const departments = payload.departments ?? {};
    const sessions = departments.sessions ?? [];
    const minutes = new Map((departments.coaching_minutes ?? []).map((r) => [r.key, r.value]));
    const listed = new Map(
      (departments.revenue_listed_cents ?? []).map((r) => [r.key, r.value]),
    );
    const rows: DepartmentSummaryRow[] = sessions.map((row) => ({
      department: row.label,
      sessions: row.value,
      coachingMinutes: minutes.get(row.key) ?? null,
      payrollCents: null, // payroll has no per-department grain in posted data
      listedCents: listed.get(row.key) ?? null,
      paidCents: null,
      paidHealth: "incomplete: source paid amounts are not reliably provided",
    }));
    return {
      document: buildDepartmentSummaryCsv(meta, rows),
      fileName: `department-summary-${base}.csv`,
      mimeType: "text/csv",
      payrollRunId: pkg.payroll_run_id,
      payrollSnapshotVersion: pkg.payroll_snapshot_version,
    };
  }

  // close_manifest_json
  const { data: run } = await actor.supabase
    .from("period_close_runs")
    .select("id, manifest_sha256")
    .eq("reporting_period_id", period.id)
    .eq("status", "closed")
    .maybeSingle();
  if (!run) return { error: "The period has no completed close yet." };
  const { data: manifest } = await actor.supabase
    .from("period_close_manifests")
    .select("payload, manifest_sha256")
    .eq("period_close_run_id", run.id)
    .maybeSingle();
  if (!manifest) return { error: "Close manifest not found." };
  const content = stableStringify(manifest.payload) + "\n";
  return {
    document: {
      content,
      rowCount: 1,
      sha256: sha256Hex(content),
      byteSize: Buffer.byteLength(content, "utf8"),
    },
    fileName: `close-manifest-${base}.json`,
    mimeType: "application/json",
    payrollRunId: null,
    payrollSnapshotVersion: null,
  };
}

/* ------------------------------------------------------- data helpers */

async function registerContext(
  actor: ActorContext,
  runId: string,
): Promise<
  [
    { data: Tables<"payroll_trainer_summaries">[] | null },
    Map<string, { name: string; department: string }>,
    Map<string, { plan: string; method: string }>,
  ]
> {
  const summariesRes = await actor.supabase
    .from("payroll_trainer_summaries")
    .select("*")
    .eq("payroll_run_id", runId);
  const trainerIds = (summariesRes.data ?? []).map((s) => s.trainer_id);
  const names = new Map<string, { name: string; department: string }>();
  const plans = new Map<string, { plan: string; method: string }>();
  if (trainerIds.length > 0) {
    const [{ data: trainers }, { data: deptAssignments }, { data: versions }] =
      await Promise.all([
        actor.supabase.from("trainers").select("id, display_name").in("id", trainerIds),
        actor.supabase
          .from("trainer_department_assignments")
          .select("trainer_id, departments ( name )")
          .in("trainer_id", trainerIds)
          .is("effective_to", null),
        actor.supabase
          .from("compensation_plan_versions")
          .select("id, compensation_method, compensation_plans ( name )")
          .in(
            "id",
            (summariesRes.data ?? [])
              .map((s) => s.compensation_plan_version_id)
              .filter((id): id is string => id !== null),
          ),
      ]);
    const deptByTrainer = new Map<string, string>();
    for (const row of deptAssignments ?? []) {
      const dept = row.departments as unknown as { name: string } | null;
      if (dept && !deptByTrainer.has(row.trainer_id)) {
        deptByTrainer.set(row.trainer_id, dept.name);
      }
    }
    for (const t of trainers ?? []) {
      names.set(t.id, {
        name: t.display_name,
        department: deptByTrainer.get(t.id) ?? "",
      });
    }
    const versionInfo = new Map(
      (versions ?? []).map((v) => [
        v.id,
        {
          plan: (v.compensation_plans as unknown as { name: string } | null)?.name ?? "",
          method: v.compensation_method,
        },
      ]),
    );
    for (const s of summariesRes.data ?? []) {
      if (s.compensation_plan_version_id) {
        const info = versionInfo.get(s.compensation_plan_version_id);
        if (info) plans.set(s.trainer_id, info);
      }
    }
  }
  return [summariesRes, names, plans];
}

async function detailRows(actor: ActorContext, runId: string): Promise<DetailRow[]> {
  const [{ data: lines }, { data: summaries }] = await Promise.all([
    actor.supabase
      .from("payroll_calculation_lines")
      .select("*")
      .eq("payroll_run_id", runId),
    actor.supabase
      .from("payroll_trainer_summaries")
      .select("trainer_id")
      .eq("payroll_run_id", runId),
  ]);
  const trainerIds = (summaries ?? []).map((s) => s.trainer_id);
  const trainerNames = new Map<string, string>();
  if (trainerIds.length > 0) {
    const { data: trainers } = await actor.supabase
      .from("trainers")
      .select("id, display_name")
      .in("id", trainerIds);
    for (const t of trainers ?? []) trainerNames.set(t.id, t.display_name);
  }
  const appointmentIds = [
    ...new Set(
      (lines ?? []).flatMap((l) => (l.appointment_id ? [l.appointment_id] : [])),
    ),
  ];
  const apptById = new Map<
    string,
    { date: string; serviceId: string; departmentId: string | null }
  >();
  for (let i = 0; i < appointmentIds.length; i += 500) {
    const { data } = await actor.supabase
      .from("appointments")
      .select("id, appointment_date, service_id, department_id")
      .in("id", appointmentIds.slice(i, i + 500));
    for (const a of data ?? []) {
      apptById.set(a.id, {
        date: a.appointment_date,
        serviceId: a.service_id,
        departmentId: a.department_id,
      });
    }
  }
  const serviceIds = [...new Set([...apptById.values()].map((a) => a.serviceId))];
  const departmentIds = [
    ...new Set(
      [...apptById.values()].flatMap((a) => (a.departmentId ? [a.departmentId] : [])),
    ),
  ];
  const [serviceNames, departmentNames] = await Promise.all([
    serviceIds.length
      ? actor.supabase.from("services").select("id, display_name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    departmentIds.length
      ? actor.supabase.from("departments").select("id, name").in("id", departmentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const serviceById = new Map((serviceNames.data ?? []).map((s) => [s.id, s.display_name]));
  const departmentById = new Map((departmentNames.data ?? []).map((d) => [d.id, d.name]));

  return (lines ?? []).map((l) => {
    const appt = l.appointment_id ? apptById.get(l.appointment_id) : undefined;
    return {
      trainerName: trainerNames.get(l.trainer_id) ?? l.trainer_id,
      reference:
        l.appointment_id ?? l.manual_time_entry_id ?? l.payroll_adjustment_id ?? l.id,
      date: appt?.date ?? "",
      department: appt?.departmentId ? (departmentById.get(appt.departmentId) ?? "") : "",
      service: appt ? (serviceById.get(appt.serviceId) ?? "") : "",
      lineType: l.line_type,
      basisCents: l.basis_amount_cents,
      rate:
        l.rate_amount_cents !== null
          ? formatCents(l.rate_amount_cents)
          : l.rate_basis_points !== null
            ? formatBasisPoints(l.rate_basis_points)
            : "",
      amountCents: l.rounded_amount_cents,
      ruleId: l.compensation_rule_id ?? "",
      eligibility: l.eligibility_result,
      exclusionReason: l.exclusion_reason ?? "",
    };
  });
}
