import { describe, expect, it } from "vitest";
import {
  buildDepartmentSummaryCsv,
  buildExecutiveSummaryCsv,
  buildPayrollDetailCsv,
  buildPayrollRegisterCsv,
  buildStatementRegisterCsv,
  DEPARTMENT_SUMMARY_COLUMNS,
  EXECUTIVE_SUMMARY_COLUMNS,
  PAYROLL_DETAIL_COLUMNS,
  PAYROLL_REGISTER_COLUMNS,
  STATEMENT_REGISTER_COLUMNS,
  type ExportMeta,
  type RegisterRow,
} from "@/lib/close/exports";

const meta: ExportMeta = {
  organizationName: "Timberhill Athletic Club",
  periodLabel: "June 2026",
  periodRange: "2026-06-01 – 2026-06-30",
  payrollRunId: "run-123",
  payrollSnapshotVersion: 2,
};

function registerRow(overrides: Partial<RegisterRow> = {}): RegisterRow {
  return {
    trainerId: "t-1",
    trainerName: "Avery",
    department: "Strength",
    compensationPlan: "Standard",
    compensationMethod: "per_session",
    sessionCents: 100_00,
    hourlyCents: 0,
    commissionCents: 0,
    teamCents: 0,
    bonusCents: 0,
    deductionCents: 0,
    adjustmentCents: 0,
    finalGrossCents: 100_00,
    ...overrides,
  };
}

describe("payroll register CSV", () => {
  it("emits the deterministic column set with cents AND a USD presentation column", () => {
    const doc = buildPayrollRegisterCsv(meta, [registerRow()]);
    const lines = doc.content.split("\r\n");
    expect(lines[0]).toBe("Payroll Register");
    expect(lines[1]).toBe("Organization,Timberhill Athletic Club");
    expect(lines[3]).toBe("Payroll run,run-123,snapshot v2");
    expect(lines[5]).toBe(PAYROLL_REGISTER_COLUMNS.join(","));
    expect(lines[6]).toContain("10000,$100.00");
  });

  it("sorts rows by trainer name then id, regardless of input order", () => {
    const doc = buildPayrollRegisterCsv(meta, [
      registerRow({ trainerId: "t-9", trainerName: "Zara" }),
      registerRow({ trainerId: "t-2", trainerName: "Avery" }),
      registerRow({ trainerId: "t-1", trainerName: "Avery" }),
    ]);
    const dataLines = doc.content.split("\r\n").slice(6, 9);
    expect(dataLines.map((l) => l.split(",")[0])).toEqual(["t-1", "t-2", "t-9"]);
    expect(doc.rowCount).toBe(3);
  });

  it("neutralizes hostile trainer names end-to-end", () => {
    const doc = buildPayrollRegisterCsv(meta, [
      registerRow({ trainerName: "=HYPERLINK(evil)" }),
    ]);
    expect(doc.content).toContain("'=HYPERLINK(evil)");
    expect(doc.content).not.toContain(",=HYPERLINK");
  });

  it("hashes deterministically for identical inputs (shuffled or not)", () => {
    const rows = [
      registerRow({ trainerId: "t-1", trainerName: "Avery" }),
      registerRow({ trainerId: "t-2", trainerName: "Blake" }),
    ];
    const forward = buildPayrollRegisterCsv(meta, rows);
    const reversed = buildPayrollRegisterCsv(meta, [...rows].reverse());
    expect(forward.sha256).toBe(reversed.sha256);
  });
});

describe("payroll detail CSV", () => {
  it("sorts by trainer, date, then reference and keeps null basis empty", () => {
    const doc = buildPayrollDetailCsv(meta, [
      {
        trainerName: "Avery",
        reference: "b",
        date: "2026-06-02",
        department: "Strength",
        service: "PT 60",
        lineType: "session",
        basisCents: null,
        rate: "flat",
        amountCents: 5000,
        ruleId: "rule-1",
        eligibility: "eligible",
        exclusionReason: "",
      },
      {
        trainerName: "Avery",
        reference: "a",
        date: "2026-06-02",
        department: "Strength",
        service: "PT 60",
        lineType: "session",
        basisCents: 10000,
        rate: "50%",
        amountCents: 5000,
        ruleId: "rule-1",
        eligibility: "eligible",
        exclusionReason: "",
      },
    ]);
    const lines = doc.content.split("\r\n");
    expect(lines[5]).toBe(PAYROLL_DETAIL_COLUMNS.join(","));
    const [first, second] = [lines[6]!, lines[7]!];
    expect(first.split(",")[1]).toBe("a");
    expect(second.split(",")[1]).toBe("b");
    // null basis renders as empty cell, not 0.
    expect(second).toContain(",,flat,");
  });
});

describe("department summary CSV", () => {
  it("keeps unavailable paid amounts empty with an explicit health column", () => {
    const doc = buildDepartmentSummaryCsv(meta, [
      {
        department: "Strength",
        sessions: 10,
        coachingMinutes: 600,
        payrollCents: 50_000,
        listedCents: 120_000,
        paidCents: null,
        paidHealth: "unavailable",
      },
    ]);
    const lines = doc.content.split("\r\n");
    expect(lines[5]).toBe(DEPARTMENT_SUMMARY_COLUMNS.join(","));
    expect(lines[6]).toBe("Strength,10,600,50000,$500.00,120000,\"$1,200.00\",,unavailable");
  });
});

describe("executive summary CSV", () => {
  it("orders metrics by id and carries health/reason for unavailable metrics", () => {
    const doc = buildExecutiveSummaryCsv(meta, [
      {
        metricId: "z_metric",
        name: "Z",
        value: 5,
        unit: "count",
        health: "healthy",
        reason: "",
        scope: "organization",
        period: "June 2026",
        version: "intel-v1",
      },
      {
        metricId: "a_metric",
        name: "A",
        value: null,
        unit: "cents",
        health: "unavailable",
        reason: "no approved definition",
        scope: "organization",
        period: "June 2026",
        version: "intel-v1",
      },
    ]);
    const lines = doc.content.split("\r\n");
    expect(lines[5]).toBe(EXECUTIVE_SUMMARY_COLUMNS.join(","));
    expect(lines[6]!.startsWith("a_metric,A,,cents,unavailable,no approved definition")).toBe(
      true,
    );
    expect(lines[7]!.startsWith("z_metric")).toBe(true);
  });
});

describe("statement register CSV", () => {
  it("records one row per trainer with the statement hash", () => {
    const doc = buildStatementRegisterCsv(meta, [
      { trainerId: "t-2", trainerName: "Blake", finalGrossCents: 200, statementSha256: "h2" },
      { trainerId: "t-1", trainerName: "Avery", finalGrossCents: 100, statementSha256: "h1" },
    ]);
    const lines = doc.content.split("\r\n");
    expect(lines[5]).toBe(STATEMENT_REGISTER_COLUMNS.join(","));
    expect(lines[6]).toBe("t-1,Avery,100,$1.00,h1");
    expect(lines[7]).toBe("t-2,Blake,200,$2.00,h2");
  });
});
