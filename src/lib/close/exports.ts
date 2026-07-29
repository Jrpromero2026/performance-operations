/**
 * Accounting-friendly close exports — PURE builders over frozen source
 * rows (posted payroll tables, ready package payloads, manifests). No
 * recalculation: every number was computed by its owning engine. Columns
 * are deterministic; integer cents are exported raw with formatted USD
 * presentation columns alongside. Files are regenerated deterministically
 * on download and verified against the recorded sha256.
 */

import { buildCsvDocument, usd, type CsvDocument } from "./csv";

export interface ExportMeta {
  organizationName: string;
  periodLabel: string;
  periodRange: string;
  payrollRunId?: string | null;
  payrollSnapshotVersion?: number | null;
}

function metaHeader(title: string, meta: ExportMeta): (string | number | null)[][] {
  return [
    [title],
    ["Organization", meta.organizationName],
    ["Reporting period", meta.periodLabel, meta.periodRange],
    ...(meta.payrollRunId
      ? [
          [
            "Payroll run",
            meta.payrollRunId,
            meta.payrollSnapshotVersion != null
              ? `snapshot v${meta.payrollSnapshotVersion}`
              : "",
          ] as (string | number | null)[],
        ]
      : []),
  ];
}

/* ------------------------------------------------- payroll register CSV */

export interface RegisterRow {
  trainerId: string;
  trainerName: string;
  department: string;
  compensationPlan: string;
  compensationMethod: string;
  sessionCents: number;
  hourlyCents: number;
  commissionCents: number;
  teamCents: number;
  bonusCents: number;
  deductionCents: number;
  adjustmentCents: number;
  finalGrossCents: number;
}

export const PAYROLL_REGISTER_COLUMNS = [
  "Trainer ID",
  "Trainer",
  "Department",
  "Compensation Plan",
  "Compensation Method",
  "Session Compensation (cents)",
  "Hourly Compensation (cents)",
  "Commission Compensation (cents)",
  "Team Compensation (cents)",
  "Bonuses (cents)",
  "Deductions (cents)",
  "Adjustments Net (cents)",
  "Final Gross (cents)",
  "Final Gross (USD)",
];

export function buildPayrollRegisterCsv(
  meta: ExportMeta,
  rows: RegisterRow[],
): CsvDocument {
  const sorted = [...rows].sort(
    (a, b) => a.trainerName.localeCompare(b.trainerName) || a.trainerId.localeCompare(b.trainerId),
  );
  return buildCsvDocument(
    metaHeader("Payroll Register", meta),
    PAYROLL_REGISTER_COLUMNS,
    sorted.map((r) => [
      r.trainerId,
      r.trainerName,
      r.department,
      r.compensationPlan,
      r.compensationMethod,
      r.sessionCents,
      r.hourlyCents,
      r.commissionCents,
      r.teamCents,
      r.bonusCents,
      r.deductionCents,
      r.adjustmentCents,
      r.finalGrossCents,
      usd(r.finalGrossCents),
    ]),
  );
}

/* --------------------------------------------------- payroll detail CSV */

export interface DetailRow {
  trainerName: string;
  reference: string; // appointment/time-entry/adjustment id (masked source)
  date: string;
  department: string;
  service: string;
  lineType: string;
  basisCents: number | null;
  rate: string;
  amountCents: number;
  ruleId: string;
  eligibility: string;
  exclusionReason: string;
}

export const PAYROLL_DETAIL_COLUMNS = [
  "Trainer",
  "Reference",
  "Date",
  "Department",
  "Service",
  "Line Type",
  "Basis (cents)",
  "Rate",
  "Amount (cents)",
  "Amount (USD)",
  "Rule",
  "Eligibility",
  "Exclusion Reason",
];

export function buildPayrollDetailCsv(
  meta: ExportMeta,
  rows: DetailRow[],
): CsvDocument {
  const sorted = [...rows].sort(
    (a, b) =>
      a.trainerName.localeCompare(b.trainerName) ||
      a.date.localeCompare(b.date) ||
      a.reference.localeCompare(b.reference),
  );
  return buildCsvDocument(
    metaHeader("Payroll Detail", meta),
    PAYROLL_DETAIL_COLUMNS,
    sorted.map((r) => [
      r.trainerName,
      r.reference,
      r.date,
      r.department,
      r.service,
      r.lineType,
      r.basisCents,
      r.rate,
      r.amountCents,
      usd(r.amountCents),
      r.ruleId,
      r.eligibility,
      r.exclusionReason,
    ]),
  );
}

/* ----------------------------------------------- department summary CSV */

export interface DepartmentSummaryRow {
  department: string;
  sessions: number | null;
  coachingMinutes: number | null;
  payrollCents: number | null;
  listedCents: number | null;
  paidCents: number | null;
  paidHealth: string;
}

export const DEPARTMENT_SUMMARY_COLUMNS = [
  "Department",
  "Sessions",
  "Coaching Minutes",
  "Payroll (cents)",
  "Payroll (USD)",
  "Source Listed (cents)",
  "Source Listed (USD)",
  "Source Paid (cents)",
  "Source Paid Health",
];

export function buildDepartmentSummaryCsv(
  meta: ExportMeta,
  rows: DepartmentSummaryRow[],
): CsvDocument {
  const sorted = [...rows].sort((a, b) => a.department.localeCompare(b.department));
  return buildCsvDocument(
    metaHeader("Department Summary", meta),
    DEPARTMENT_SUMMARY_COLUMNS,
    sorted.map((r) => [
      r.department,
      r.sessions,
      r.coachingMinutes,
      r.payrollCents,
      usd(r.payrollCents),
      r.listedCents,
      usd(r.listedCents),
      r.paidCents,
      r.paidHealth,
    ]),
  );
}

/* ------------------------------------------------ executive summary CSV */

export interface ExecutiveMetricRow {
  metricId: string;
  name: string;
  value: number | null;
  unit: string;
  health: string;
  reason: string;
  scope: string;
  period: string;
  version: string;
}

export const EXECUTIVE_SUMMARY_COLUMNS = [
  "Metric ID",
  "Metric Name",
  "Value",
  "Unit",
  "Health",
  "Reason",
  "Scope",
  "Period",
  "Engine Version",
];

export function buildExecutiveSummaryCsv(
  meta: ExportMeta,
  rows: ExecutiveMetricRow[],
): CsvDocument {
  const sorted = [...rows].sort((a, b) => a.metricId.localeCompare(b.metricId));
  return buildCsvDocument(
    metaHeader("Executive Metric Summary", meta),
    EXECUTIVE_SUMMARY_COLUMNS,
    sorted.map((r) => [
      r.metricId,
      r.name,
      r.value,
      r.unit,
      r.health,
      r.reason,
      r.scope,
      r.period,
      r.version,
    ]),
  );
}

/* --------------------------------------- trainer statement register CSV */

export interface StatementRegisterRow {
  trainerId: string;
  trainerName: string;
  finalGrossCents: number;
  statementSha256: string;
}

export const STATEMENT_REGISTER_COLUMNS = [
  "Trainer ID",
  "Trainer",
  "Final Gross (cents)",
  "Final Gross (USD)",
  "Statement SHA-256",
];

export function buildStatementRegisterCsv(
  meta: ExportMeta,
  rows: StatementRegisterRow[],
): CsvDocument {
  const sorted = [...rows].sort(
    (a, b) => a.trainerName.localeCompare(b.trainerName) || a.trainerId.localeCompare(b.trainerId),
  );
  return buildCsvDocument(
    metaHeader("Trainer Statement Register", meta),
    STATEMENT_REGISTER_COLUMNS,
    sorted.map((r) => [
      r.trainerId,
      r.trainerName,
      r.finalGrossCents,
      usd(r.finalGrossCents),
      r.statementSha256,
    ]),
  );
}
