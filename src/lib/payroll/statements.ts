/**
 * Trainer payroll-preparation statements and department summaries: shared
 * loaders for the web views, print view, and CSV exports.
 *
 * Privacy: statements identify sessions by date/time, service, and status —
 * client identities are intentionally never included in statements or
 * exports (masked client references).
 */

import type { ActorContext } from "@/lib/actions/shared";
import type { Tables } from "@/lib/supabase/types";
import { formatCents } from "@/lib/money/money";

export interface StatementLine {
  id: string;
  lineType: string;
  calculationStatus: string;
  eligibilityResult: string;
  exclusionReason: string | null;
  appointmentDate: string | null;
  appointmentStart: string | null;
  serviceName: string | null;
  canonicalStatus: string | null;
  inputQuantity: number | null;
  inputUnit: string | null;
  basisAmountCents: number | null;
  rateAmountCents: number | null;
  rateBasisPoints: number | null;
  roundedAmountCents: number;
  roundingMethod: string;
  trace: unknown;
}

export interface TrainerStatement {
  summary: Tables<"payroll_trainer_summaries">;
  trainerName: string;
  lines: StatementLine[];
}

export interface RunStatementContext {
  run: Tables<"payroll_runs">;
  organizationName: string;
  periodLabel: string;
  periodRange: string;
  summaries: (Tables<"payroll_trainer_summaries"> & { trainerName: string })[];
}

export async function loadRunStatementContext(
  actor: ActorContext,
  runId: string,
): Promise<RunStatementContext | null> {
  const { data: run } = await actor.supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return null;

  const [{ data: org }, { data: period }, { data: summaries }] = await Promise.all([
    actor.supabase
      .from("organizations")
      .select("name")
      .eq("id", run.organization_id)
      .maybeSingle(),
    actor.supabase
      .from("reporting_periods")
      .select("label, start_date, end_date")
      .eq("id", run.reporting_period_id)
      .maybeSingle(),
    actor.supabase
      .from("payroll_trainer_summaries")
      .select("*")
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

  const named = (summaries ?? [])
    .map((s) => ({
      ...s,
      trainerName: trainerNames.get(s.trainer_id) ?? "(unknown trainer)",
    }))
    .sort((a, b) => a.trainerName.localeCompare(b.trainerName));

  return {
    run,
    organizationName: org?.name ?? "",
    periodLabel: period?.label ?? "",
    periodRange: period ? `${period.start_date} – ${period.end_date}` : "",
    summaries: named,
  };
}

export async function loadTrainerStatement(
  actor: ActorContext,
  runId: string,
  trainerId: string,
): Promise<TrainerStatement | null> {
  const { data: summary } = await actor.supabase
    .from("payroll_trainer_summaries")
    .select("*")
    .eq("payroll_run_id", runId)
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (!summary) return null;

  const [{ data: trainer }, { data: lineRows }] = await Promise.all([
    actor.supabase.from("trainers").select("display_name").eq("id", trainerId).maybeSingle(),
    actor.supabase
      .from("payroll_calculation_lines")
      .select("*")
      .eq("payroll_run_id", runId)
      .eq("trainer_id", trainerId)
      .order("created_at")
      .order("id"),
  ]);
  const lines = lineRows ?? [];

  // Appointment context (dates, services) — never client identities.
  const appointmentIds = [...new Set(lines.flatMap((l) => (l.appointment_id ? [l.appointment_id] : [])))];
  const appointmentById = new Map<
    string,
    { appointment_date: string; start_at: string; service_id: string; canonical_status: string }
  >();
  for (let i = 0; i < appointmentIds.length; i += 500) {
    const { data } = await actor.supabase
      .from("appointments")
      .select("id, appointment_date, start_at, service_id, canonical_status")
      .in("id", appointmentIds.slice(i, i + 500));
    for (const a of data ?? []) appointmentById.set(a.id, a);
  }
  const serviceIds = [...new Set([...appointmentById.values()].map((a) => a.service_id))];
  const serviceNames = new Map<string, string>();
  if (serviceIds.length > 0) {
    const { data } = await actor.supabase
      .from("services")
      .select("id, display_name")
      .in("id", serviceIds);
    for (const s of data ?? []) serviceNames.set(s.id, s.display_name);
  }

  const statementLines: StatementLine[] = lines
    .map((l) => {
      const appt = l.appointment_id ? appointmentById.get(l.appointment_id) : undefined;
      return {
        id: l.id,
        lineType: l.line_type,
        calculationStatus: l.calculation_status,
        eligibilityResult: l.eligibility_result,
        exclusionReason: l.exclusion_reason,
        appointmentDate: appt?.appointment_date ?? null,
        appointmentStart: appt?.start_at ?? null,
        serviceName: appt ? (serviceNames.get(appt.service_id) ?? null) : null,
        canonicalStatus: appt?.canonical_status ?? null,
        inputQuantity: l.input_quantity,
        inputUnit: l.input_unit,
        basisAmountCents: l.basis_amount_cents,
        rateAmountCents: l.rate_amount_cents,
        rateBasisPoints: l.rate_basis_points,
        roundedAmountCents: l.rounded_amount_cents,
        roundingMethod: l.rounding_method,
        trace: l.calculation_trace,
      };
    })
    .sort((a, b) => {
      const ka = `${a.appointmentStart ?? "9999"}:${a.lineType}:${a.id}`;
      const kb = `${b.appointmentStart ?? "9999"}:${b.lineType}:${b.id}`;
      return ka.localeCompare(kb);
    });

  return {
    summary,
    trainerName: trainer?.display_name ?? "(unknown trainer)",
    lines: statementLines,
  };
}

/* ----------------------------------------------------------------- CSV */

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function dollars(cents: number | null): string {
  return cents === null ? "" : formatCents(cents).replace("$", "");
}

export function buildDepartmentSummaryCsv(context: RunStatementContext): string {
  const rows = [
    csvRow([
      "Trainer",
      "Calculation Status",
      "Appointments",
      "Completed Sessions",
      "Compensated Minutes",
      "Eligible Basis (USD)",
      "Commission (USD)",
      "Flat Rate (USD)",
      "Hourly (USD)",
      "Team (USD)",
      "Bonuses (USD)",
      "Deductions (USD)",
      "Adjustments Net (USD)",
      "Final Gross (USD)",
    ]),
    ...context.summaries.map((s) =>
      csvRow([
        s.trainerName,
        s.calculation_status,
        s.appointment_count,
        s.completed_session_count,
        s.compensated_minutes,
        dollars(s.eligible_basis_total_cents),
        dollars(s.commission_compensation_cents),
        dollars(s.flat_rate_compensation_cents),
        dollars(s.hourly_compensation_cents),
        dollars(s.team_compensation_cents),
        dollars(s.bonus_total_cents),
        dollars(s.deduction_total_cents),
        dollars(s.adjustment_total_cents),
        dollars(s.final_gross_compensation_cents),
      ]),
    ),
    csvRow([]),
    csvRow([
      "TOTAL",
      "",
      context.summaries.reduce((n, s) => n + s.appointment_count, 0),
      context.summaries.reduce((n, s) => n + s.completed_session_count, 0),
      context.summaries.reduce((n, s) => n + s.compensated_minutes, 0),
      dollars(context.summaries.reduce((n, s) => n + s.eligible_basis_total_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.commission_compensation_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.flat_rate_compensation_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.hourly_compensation_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.team_compensation_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.bonus_total_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.deduction_total_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.adjustment_total_cents, 0)),
      dollars(context.summaries.reduce((n, s) => n + s.final_gross_compensation_cents, 0)),
    ]),
  ];
  const header = [
    csvRow(["Payroll Department Summary"]),
    csvRow(["Organization", context.organizationName]),
    csvRow(["Period", context.periodLabel, context.periodRange]),
    csvRow(["Run", context.run.name, `status: ${context.run.status}`]),
    csvRow(["Calculation Version", context.run.calculation_version]),
    csvRow([]),
  ];
  return [...header, ...rows].join("\r\n") + "\r\n";
}

export function buildTrainerStatementCsv(
  context: RunStatementContext,
  statement: TrainerStatement,
): string {
  const header = [
    csvRow(["Trainer Payroll Preparation Statement"]),
    csvRow(["Trainer", statement.trainerName]),
    csvRow(["Organization", context.organizationName]),
    csvRow(["Period", context.periodLabel, context.periodRange]),
    csvRow(["Run", context.run.name, `status: ${context.run.status}`]),
    csvRow([]),
    csvRow([
      "Date",
      "Line Type",
      "Service",
      "Session Status",
      "Quantity",
      "Unit",
      "Basis (USD)",
      "Rate (USD)",
      "Rate (%)",
      "Amount (USD)",
      "Line Status",
      "Exclusion Reason",
    ]),
  ];
  const rows = statement.lines.map((l) =>
    csvRow([
      l.appointmentDate ?? "",
      l.lineType,
      l.serviceName ?? "",
      l.canonicalStatus ?? "",
      l.inputQuantity,
      l.inputUnit,
      dollars(l.basisAmountCents),
      dollars(l.rateAmountCents),
      l.rateBasisPoints === null ? "" : (l.rateBasisPoints / 100).toFixed(2),
      dollars(l.roundedAmountCents),
      l.calculationStatus,
      l.exclusionReason ?? "",
    ]),
  );
  const s = statement.summary;
  const totals = [
    csvRow([]),
    csvRow(["Commission (USD)", dollars(s.commission_compensation_cents)]),
    csvRow(["Flat Rate (USD)", dollars(s.flat_rate_compensation_cents)]),
    csvRow(["Hourly (USD)", dollars(s.hourly_compensation_cents)]),
    csvRow(["Team (USD)", dollars(s.team_compensation_cents)]),
    csvRow(["Bonuses (USD)", dollars(s.bonus_total_cents)]),
    csvRow(["Deductions (USD)", dollars(s.deduction_total_cents)]),
    csvRow(["Adjustments Net (USD)", dollars(s.adjustment_total_cents)]),
    csvRow(["FINAL GROSS (USD)", dollars(s.final_gross_compensation_cents)]),
    csvRow([]),
    csvRow([
      "Note",
      "Gross compensation preparation only — not net pay; taxes and withholdings are out of scope.",
    ]),
  ];
  return [...header, ...rows, ...totals].join("\r\n") + "\r\n";
}

/** Record an export event (best effort; viewing rights already verified). */
export async function recordExport(
  actor: ActorContext,
  run: Tables<"payroll_runs">,
  exportType: "department_csv" | "trainer_statement_csv" | "statement_view" | "summary_view",
  trainerId: string | null,
): Promise<void> {
  const { data: snapshot } = await actor.supabase
    .from("payroll_snapshots")
    .select("snapshot_version")
    .eq("payroll_run_id", run.id)
    .order("snapshot_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  await actor.supabase.from("payroll_exports").insert({
    payroll_run_id: run.id,
    organization_id: run.organization_id,
    export_type: exportType,
    trainer_id: trainerId,
    snapshot_version: snapshot?.snapshot_version ?? null,
    generated_by: actor.userId,
  });
}
