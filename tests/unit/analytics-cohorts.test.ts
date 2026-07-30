import { describe, expect, it } from "vitest";
import { buildCohortTable } from "@/lib/analytics/cohorts/cohorts";
import type {
  AppointmentFact,
  IntelligenceDataset,
} from "@/lib/intelligence/shared/facts";

function appointment(overrides: Partial<AppointmentFact>): AppointmentFact {
  return {
    id: Math.random().toString(36).slice(2),
    organizationId: "org",
    departmentId: "dept-a",
    trainerId: "trainer-1",
    serviceId: "svc-1",
    clientId: "client-1",
    date: "2026-06-10",
    durationMinutes: 60,
    canonicalStatus: "completed",
    listedCents: 6400,
    paidCents: null,
    countsAsSession: true,
    countsAsCoachingHours: true,
    isGroupTraining: false,
    isEvaluation: false,
    ...overrides,
  };
}

function dataset(
  appointments: AppointmentFact[],
  firstVisits: Record<string, string>,
): IntelligenceDataset {
  return {
    organizationId: "org",
    dateFrom: "2026-05-01",
    dateTo: "2026-07-31",
    appointments,
    loadedFrom: "2026-01-01",
    payroll: [],
    payrollLines: [],
    clientHistory: {
      firstVisit: new Map(Object.entries(firstVisits)),
      lastVisit: new Map(),
      previousWindowActive: new Set(),
    },
    flags: {
      hasPostedImports: true,
      hasAnyFinalizedPayroll: false,
      hasFinalizedPayrollInRange: false,
      paidAmountsPresent: false,
    },
    readiness: {
      trainersActive: 1,
      trainersWithDepartment: 1,
      trainersWithCompensation: 1,
      servicesActive: 1,
      servicesWithAlias: 1,
      rangeCoveredByPeriods: true,
      openImportBlockingIssues: 0,
      importBatchesAwaitingAction: 0,
      openPayrollBlockingIssues: 0,
      activePayrollRunsNotFinalized: 0,
    },
    names: { trainers: new Map(), departments: new Map(), services: new Map() },
  };
}

const WINDOW = { dateFrom: "2026-05-01", dateTo: "2026-07-31" };

describe("cohort analysis", () => {
  it("assigns cohorts from the engine's first-visit map and counts clients, not appointments", () => {
    const table = buildCohortTable(
      dataset(
        [
          appointment({ clientId: "a", date: "2026-05-05" }),
          appointment({ clientId: "a", date: "2026-05-20" }), // 2nd appt, same client/month
          appointment({ clientId: "a", date: "2026-06-15" }),
          appointment({ clientId: "b", date: "2026-06-02" }),
        ],
        { a: "2026-05-05", b: "2026-06-02" },
      ),
      WINDOW,
    );
    expect(table.months).toEqual(["2026-05", "2026-06", "2026-07"]);
    const may = table.rows.find((r) => r.cohortMonth === "2026-05")!;
    expect(may.newClients).toBe(1);
    expect(may.cells.map((c) => c.activeClients)).toEqual([1, 1, 0]); // client-count, not 2 appts
    const june = table.rows.find((r) => r.cohortMonth === "2026-06")!;
    expect(june.newClients).toBe(1);
    expect(june.cells.map((c) => c.activeClients)).toEqual([null, 1, 0]); // pre-cohort cells empty
  });

  it("excludes appointments with missing client identity and discloses the count", () => {
    const table = buildCohortTable(
      dataset(
        [
          appointment({ clientId: null, date: "2026-05-05" }),
          appointment({ clientId: "a", date: "2026-06-02" }),
        ],
        { a: "2026-06-02" },
      ),
      WINDOW,
    );
    expect(table.clientsUnidentified).toBe(1);
    expect(table.totalClients).toBe(1);
  });

  it("respects date boundaries — activity outside the window never counts", () => {
    const table = buildCohortTable(
      dataset(
        [
          appointment({ clientId: "a", date: "2026-04-30" }), // before window
          appointment({ clientId: "a", date: "2026-08-01" }), // after window
        ],
        { a: "2026-04-30" },
      ),
      WINDOW,
    );
    expect(table.totalClients).toBe(0);
  });

  it("scopes by department without changing cohort identity", () => {
    const table = buildCohortTable(
      dataset(
        [
          appointment({ clientId: "a", date: "2026-05-05", departmentId: "dept-a" }),
          appointment({ clientId: "b", date: "2026-05-06", departmentId: "dept-b" }),
        ],
        { a: "2026-05-05", b: "2026-05-06" },
      ),
      WINDOW,
      { departmentId: "dept-a" },
    );
    expect(table.totalClients).toBe(1);
    expect(table.rows.find((r) => r.cohortMonth === "2026-05")!.newClients).toBe(1);
  });

  it("only completed appointments create activity", () => {
    const table = buildCohortTable(
      dataset(
        [appointment({ clientId: "a", date: "2026-05-05", canonicalStatus: "cancelled" })],
        { a: "2026-05-05" },
      ),
      WINDOW,
    );
    expect(table.totalClients).toBe(0);
  });

  it("suppresses small cells when a threshold is set — never silently zero", () => {
    const table = buildCohortTable(
      dataset(
        [
          appointment({ clientId: "a", date: "2026-05-05" }),
          appointment({ clientId: "b", date: "2026-05-06" }),
        ],
        { a: "2026-05-05", b: "2026-05-06" },
      ),
      WINDOW,
      {},
      3, // threshold: cells with 1–2 clients suppress
    );
    const may = table.rows.find((r) => r.cohortMonth === "2026-05")!;
    expect(may.newClients).toBeNull();
    expect(may.suppressed).toBe(true);
    expect(may.cells[0].suppressed).toBe(true);
    // zero cells stay zero (no suppression marker needed)
    expect(may.cells[2].activeClients).toBe(0);
  });
});
