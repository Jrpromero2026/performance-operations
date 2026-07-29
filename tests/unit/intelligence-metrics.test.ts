import { describe, expect, it } from "vitest";
import { METRIC_DEFINITIONS, METRIC_EVALUATORS, listDefinitions } from "@/lib/intelligence/catalog";
import { buildContext } from "@/lib/intelligence/shared/context";
import { computeBreakdown } from "@/lib/intelligence/shared/breakdowns";
import { generateExecutiveSummary } from "@/lib/intelligence/summaries/executive";
import type {
  AppointmentFact,
  IntelligenceDataset,
  PayrollTrainerFact,
} from "@/lib/intelligence/shared/facts";
import type { MetricFilters, MetricScope } from "@/lib/intelligence/shared/types";

/* ---------------------------------------------------------- fixtures */

const ORG = "org-1";
let seq = 0;

function appt(overrides: Partial<AppointmentFact>): AppointmentFact {
  return {
    id: `appt-${++seq}`,
    organizationId: ORG,
    departmentId: "dept-a",
    trainerId: "t1",
    serviceId: "svc-1",
    clientId: "c1",
    date: "2026-07-10",
    durationMinutes: 60,
    canonicalStatus: "completed",
    listedCents: 8000,
    paidCents: 8000,
    countsAsSession: true,
    countsAsCoachingHours: true,
    isGroupTraining: false,
    isEvaluation: false,
    ...overrides,
  };
}

function payrollFact(overrides: Partial<PayrollTrainerFact>): PayrollTrainerFact {
  return {
    runId: "run-1",
    organizationId: ORG,
    reportingPeriodId: "period-1",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    runStatus: "posted",
    trainerId: "t1",
    finalGrossCents: 4000,
    commissionCents: 4000,
    flatCents: 0,
    hourlyCents: 0,
    teamCents: 0,
    bonusCents: 0,
    deductionCents: 0,
    adjustmentCents: 0,
    compensatedMinutes: 60,
    appointmentCount: 1,
    completedSessionCount: 1,
    compensationMethod: "percentage_of_revenue",
    ...overrides,
  };
}

function dataset(overrides: Partial<IntelligenceDataset> = {}): IntelligenceDataset {
  return {
    organizationId: ORG,
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    appointments: [],
    loadedFrom: "2025-07-01",
    payroll: [],
    payrollLines: [],
    clientHistory: {
      firstVisit: new Map(),
      lastVisit: new Map(),
      previousWindowActive: new Set(),
    },
    flags: {
      hasPostedImports: true,
      hasAnyFinalizedPayroll: true,
      hasFinalizedPayrollInRange: true,
      paidAmountsPresent: true,
    },
    readiness: {
      trainersActive: 2,
      trainersWithDepartment: 2,
      trainersWithCompensation: 2,
      servicesActive: 2,
      servicesWithAlias: 2,
      rangeCoveredByPeriods: true,
      openImportBlockingIssues: 0,
      importBatchesAwaitingAction: 0,
      openPayrollBlockingIssues: 0,
      activePayrollRunsNotFinalized: 0,
    },
    names: {
      trainers: new Map([
        ["t1", "Trainer One"],
        ["t2", "Trainer Two"],
      ]),
      departments: new Map([
        ["dept-a", "Dept A"],
        ["dept-b", "Dept B"],
      ]),
      services: new Map([["svc-1", "Service One"]]),
    },
    ...overrides,
  };
}

const FILTERS: MetricFilters = { dateFrom: "2026-07-01", dateTo: "2026-07-31" };
const ORG_SCOPE: MetricScope = { organizationId: ORG };

function evaluate(ds: IntelligenceDataset, metricId: string, scope: MetricScope = ORG_SCOPE, filters: MetricFilters = FILTERS) {
  const evaluator = METRIC_EVALUATORS.get(metricId);
  if (!evaluator) throw new Error(`no evaluator: ${metricId}`);
  return evaluator(buildContext(ds, scope, filters));
}

/* ------------------------------------------------------------ catalog */

describe("metric catalog", () => {
  it("every metric has a unique id, a definition, and exactly one evaluator", () => {
    const definitions = listDefinitions();
    const ids = definitions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(METRIC_EVALUATORS.size).toBe(METRIC_DEFINITIONS.size);
    for (const d of definitions) {
      expect(METRIC_EVALUATORS.has(d.id)).toBe(true);
      expect(d.formula.length).toBeGreaterThan(0);
      expect(d.version).toBe("intel-v1");
      expect(d.scopes.length).toBeGreaterThan(0);
    }
  });
  it("covers all primary categories", () => {
    const categories = new Set(listDefinitions().map((d) => d.category));
    for (const expected of [
      "appointments",
      "revenue",
      "payroll",
      "clients",
      "retention",
      "utilization",
      "growth",
      "readiness",
      "trainers",
      "departments",
      "organizations",
      "scheduling",
    ]) {
      expect(categories.has(expected as never)).toBe(true);
    }
  });
});

/* ------------------------------------------------- appointment metrics */

describe("appointment metrics", () => {
  const ds = dataset({
    appointments: [
      appt({ durationMinutes: 60 }),
      appt({ durationMinutes: 30, listedCents: 3000, paidCents: null, clientId: "c2" }),
      appt({ canonicalStatus: "cancelled" }),
      appt({ canonicalStatus: "late_cancelled" }),
      appt({ canonicalStatus: "no_show" }),
      appt({ canonicalStatus: "scheduled", date: "2026-07-20" }),
      appt({ canonicalStatus: "rescheduled" }),
      // outside range — must be excluded by date filtering
      appt({ date: "2026-08-01" }),
    ],
  });

  it("counts statuses within the window only", () => {
    expect(evaluate(ds, "appointments_total").value).toBe(7);
    expect(evaluate(ds, "appointments_completed").value).toBe(2);
    expect(evaluate(ds, "appointments_cancelled").value).toBe(1);
    expect(evaluate(ds, "appointments_late_cancelled").value).toBe(1);
    expect(evaluate(ds, "appointments_no_show").value).toBe(1);
    expect(evaluate(ds, "appointments_scheduled").value).toBe(1);
    expect(evaluate(ds, "appointments_rescheduled").value).toBe(1);
  });
  it("computes rates over booked appointments", () => {
    // booked = 6 (rescheduled excluded)
    expect(evaluate(ds, "completed_rate_bp").value).toBe(3333);
    expect(evaluate(ds, "cancellation_rate_bp").value).toBe(3333);
    expect(evaluate(ds, "no_show_rate_bp").value).toBe(1667);
  });
  it("computes durations and minutes", () => {
    expect(evaluate(ds, "average_session_duration_minutes").value).toBe(45);
    expect(evaluate(ds, "median_session_duration_minutes").value).toBe(45);
    expect(evaluate(ds, "completed_minutes").value).toBe(90);
    expect(evaluate(ds, "coaching_minutes").value).toBe(90);
    // booked minutes: 60+30+60+60+60+60 = 330
    expect(evaluate(ds, "scheduled_minutes").value).toBe(330);
  });
  it("waits for imports instead of reporting fake zeros", () => {
    const empty = dataset({
      flags: {
        hasPostedImports: false,
        hasAnyFinalizedPayroll: false,
        hasFinalizedPayrollInRange: false,
        paidAmountsPresent: false,
      },
    });
    const outcome = evaluate(empty, "appointments_completed");
    expect(outcome.value).toBeNull();
    expect(outcome.health).toBe("waiting_for_imports");
  });
  it("a true zero is healthy when the pipeline has data", () => {
    const ds2 = dataset({ appointments: [appt({ date: "2026-06-15" })] });
    const outcome = evaluate(ds2, "appointments_completed");
    expect(outcome.value).toBe(0);
    expect(outcome.health).toBe("healthy");
  });
});

/* ---------------------------------------------------- revenue metrics */

describe("revenue metrics", () => {
  const ds = dataset({
    appointments: [
      appt({ listedCents: 8000, paidCents: 8000 }),
      appt({ listedCents: 3000, paidCents: null, countsAsSession: true }),
      appt({ listedCents: null }), // missing listed → incomplete + excluded
      appt({ canonicalStatus: "cancelled", listedCents: 9999 }), // never revenue
    ],
  });

  it("sums listed revenue over completed only, flagging missing amounts", () => {
    const outcome = evaluate(ds, "revenue_listed_cents");
    expect(outcome.value).toBe(11000);
    expect(outcome.health).toBe("incomplete");
  });
  it("computes per-session, per-hour, and average values from ONE formula set", () => {
    expect(evaluate(ds, "revenue_per_session_cents").value).toBe(
      Math.round(11000 / 3),
    );
    // coaching minutes = 180 → per hour = 11000/3
    expect(evaluate(ds, "revenue_per_hour_cents").value).toBe(3667);
    expect(evaluate(ds, "average_session_value_cents").value).toBe(5500);
  });
  it("paid revenue is incomplete when the source omitted amounts entirely", () => {
    const noPaid = dataset({
      appointments: [appt({ paidCents: null })],
      flags: {
        hasPostedImports: true,
        hasAnyFinalizedPayroll: false,
        hasFinalizedPayrollInRange: false,
        paidAmountsPresent: false,
      },
    });
    const outcome = evaluate(noPaid, "revenue_paid_cents");
    expect(outcome.value).toBeNull();
    expect(outcome.health).toBe("incomplete");
  });
  it("future revenue definitions are unavailable, never inferred", () => {
    expect(evaluate(ds, "revenue_eligible_cents").health).toBe("unavailable");
    expect(evaluate(ds, "revenue_recognized_cents").health).toBe("unavailable");
    expect(METRIC_DEFINITIONS.get("revenue_eligible_cents")?.notYetApproved).toBe(true);
  });
  it("revenue growth compares the previous equal-length window", () => {
    const withHistory = dataset({
      appointments: [
        appt({ date: "2026-07-10", listedCents: 15000 }),
        appt({ date: "2026-06-10", listedCents: 10000 }), // previous window
      ],
    });
    expect(evaluate(withHistory, "revenue_growth_bp").value).toBe(5000);
  });
});

/* ---------------------------------------------------- payroll metrics */

describe("payroll metrics", () => {
  const ds = dataset({
    appointments: [appt({ listedCents: 10000 })],
    payroll: [
      payrollFact({ trainerId: "t1", finalGrossCents: 4000 }),
      payrollFact({
        trainerId: "t2",
        finalGrossCents: 2000,
        compensatedMinutes: 30,
        completedSessionCount: 1,
        bonusCents: 500,
        deductionCents: 100,
        adjustmentCents: 400,
      }),
    ],
  });

  it("aggregates finalized runs only and reconciles to payroll's own counts", () => {
    expect(evaluate(ds, "payroll_gross_cents").value).toBe(6000);
    expect(evaluate(ds, "payroll_per_session_cents").value).toBe(3000);
    expect(evaluate(ds, "payroll_per_hour_cents").value).toBe(4000); // 6000/90min
    expect(evaluate(ds, "payroll_bonus_cents").value).toBe(500);
    expect(evaluate(ds, "payroll_deduction_cents").value).toBe(100);
    expect(evaluate(ds, "payroll_adjustment_net_cents").value).toBe(400);
  });
  it("payroll % uses listed revenue", () => {
    expect(evaluate(ds, "payroll_pct_of_revenue_bp").value).toBe(6000);
  });
  it("waits for payroll when no finalized run overlaps", () => {
    const none = dataset({
      appointments: [appt({})],
      payroll: [],
      flags: {
        hasPostedImports: true,
        hasAnyFinalizedPayroll: false,
        hasFinalizedPayrollInRange: false,
        paidAmountsPresent: true,
      },
    });
    const outcome = evaluate(none, "payroll_gross_cents");
    expect(outcome.value).toBeNull();
    expect(outcome.health).toBe("waiting_for_payroll");
  });
  it("growth and variance compare previous-window finalized runs", () => {
    const withPrev = dataset({
      payroll: [
        payrollFact({ finalGrossCents: 6000 }),
        payrollFact({
          runId: "run-0",
          reportingPeriodId: "period-0",
          periodStart: "2026-06-01",
          periodEnd: "2026-06-30",
          finalGrossCents: 4000,
        }),
      ],
    });
    expect(evaluate(withPrev, "payroll_growth_bp").value).toBe(5000);
    expect(evaluate(withPrev, "payroll_variance_cents").value).toBe(2000);
  });
});

/* --------------------------------------------- clients and retention */

describe("client and retention metrics", () => {
  const ds = dataset({
    appointments: [
      appt({ clientId: "c1", date: "2026-07-05" }),
      appt({ clientId: "c1", date: "2026-07-12" }),
      appt({ clientId: "c2", date: "2026-07-15" }),
      appt({ clientId: null, date: "2026-07-16" }), // unlinked → warned
      // previous window activity:
      appt({ clientId: "c1", date: "2026-06-10" }),
      appt({ clientId: "c3", date: "2026-06-11" }),
    ],
    clientHistory: {
      firstVisit: new Map([
        ["c1", "2026-06-10"],
        ["c2", "2026-07-15"],
        ["c3", "2026-06-11"],
        ["c9", "2025-01-05"],
      ]),
      lastVisit: new Map([
        ["c1", "2026-07-12"],
        ["c2", "2026-07-15"],
        ["c3", "2026-06-11"],
        ["c9", "2025-01-05"],
      ]),
      previousWindowActive: new Set(["c1", "c3"]),
    },
  });

  it("counts active, new, returning, inactive with real history", () => {
    expect(evaluate(ds, "active_clients").value).toBe(2);
    expect(evaluate(ds, "new_clients").value).toBe(1); // c2
    expect(evaluate(ds, "returning_clients").value).toBe(1); // c1
    expect(evaluate(ds, "inactive_clients").value).toBe(2); // c3, c9
  });
  it("warns about unlinked appointments instead of hiding them", () => {
    const outcome = evaluate(ds, "active_clients");
    expect(outcome.warnings?.[0]).toContain("no linked client");
  });
  it("computes retention against the previous window's actives", () => {
    // previous active = {c1, c3}; retained = {c1} → 50%
    expect(evaluate(ds, "client_retention_rate_bp").value).toBe(5000);
  });
  it("sessions per client and revenue per client derive from shared sums", () => {
    expect(evaluate(ds, "sessions_per_client_x100").value).toBe(200); // 4/2×100
    expect(evaluate(ds, "revenue_per_client_cents").value).toBe(16000); // 32000/2
  });
  it("repeat clients require ≥2 completed sessions", () => {
    expect(evaluate(ds, "repeat_client_count").value).toBe(1); // c1
  });
  it("client first/last visit require client scope", () => {
    const scoped = evaluate(ds, "client_first_visit", {
      organizationId: ORG,
      clientId: "c1",
    });
    expect(scoped.metadata?.date).toBe("2026-06-10");
    expect(evaluate(ds, "client_first_visit").health).toBe("unavailable");
  });
});

/* --------------------------------------------------------- utilization */

describe("utilization", () => {
  it("schedule utilization = completed ÷ booked minutes", () => {
    const ds = dataset({
      appointments: [
        appt({ durationMinutes: 60 }),
        appt({ durationMinutes: 60, canonicalStatus: "no_show" }),
      ],
    });
    expect(evaluate(ds, "schedule_utilization_bp").value).toBe(5000);
  });
  it("capacity utilization reports missing configuration, never invents capacity", () => {
    const outcome = evaluate(dataset(), "capacity_utilization_bp");
    expect(outcome.value).toBeNull();
    expect(outcome.health).toBe("configuration_missing");
  });
});

/* ----------------------------------------------------------- readiness */

describe("readiness metrics", () => {
  it("full configuration scores 10000 and is healthy", () => {
    const outcome = evaluate(dataset(), "organization_readiness_bp");
    expect(outcome.value).toBe(10000);
    expect(outcome.health).toBe("healthy");
  });
  it("gaps lower coverage and mark incomplete", () => {
    const gappy = dataset({
      readiness: {
        trainersActive: 4,
        trainersWithDepartment: 4,
        trainersWithCompensation: 2,
        servicesActive: 2,
        servicesWithAlias: 2,
        rangeCoveredByPeriods: true,
        openImportBlockingIssues: 3,
        importBatchesAwaitingAction: 0,
        openPayrollBlockingIssues: 0,
        activePayrollRunsNotFinalized: 1,
      },
    });
    expect(evaluate(gappy, "compensation_coverage_bp").value).toBe(5000);
    expect(evaluate(gappy, "import_health_bp").value).toBe(5000);
    // payroll readiness: comp incomplete + unfinished run → 1/3 checks
    expect(evaluate(gappy, "payroll_readiness_bp").value).toBe(3333);
    expect(evaluate(gappy, "organization_readiness_bp").health).toBe("incomplete");
  });
  it("no configuration at all → waiting_for_configuration", () => {
    const empty = dataset({
      readiness: {
        trainersActive: 0,
        trainersWithDepartment: 0,
        trainersWithCompensation: 0,
        servicesActive: 0,
        servicesWithAlias: 0,
        rangeCoveredByPeriods: false,
        openImportBlockingIssues: 0,
        importBatchesAwaitingAction: 0,
        openPayrollBlockingIssues: 0,
        activePayrollRunsNotFinalized: 0,
      },
    });
    expect(evaluate(empty, "trainer_assignment_coverage_bp").health).toBe(
      "waiting_for_configuration",
    );
  });
});

/* ------------------------------------- aggregation and reconciliation */

describe("aggregation reconciliation", () => {
  const ds = dataset({
    appointments: [
      appt({ trainerId: "t1", departmentId: "dept-a", listedCents: 8000 }),
      appt({ trainerId: "t1", departmentId: "dept-a", listedCents: 3000 }),
      appt({ trainerId: "t2", departmentId: "dept-b", listedCents: 5000, clientId: "c2" }),
      appt({ trainerId: "t2", departmentId: "dept-b", canonicalStatus: "cancelled" }),
    ],
    payroll: [
      payrollFact({ trainerId: "t1", finalGrossCents: 4000 }),
      payrollFact({ trainerId: "t2", finalGrossCents: 2500 }),
    ],
  });

  const ADDITIVE = [
    "appointments_completed",
    "revenue_listed_cents",
    "coaching_minutes",
    "payroll_gross_cents",
  ];

  it("org totals equal the sum of trainer breakdown rows", () => {
    for (const metricId of ADDITIVE) {
      const total = evaluate(ds, metricId).value!;
      const rows = computeBreakdown(ds, ORG_SCOPE, FILTERS, metricId, "trainer").rows;
      const sum = rows.reduce((s, r) => s + (r.value ?? 0), 0);
      expect(sum, metricId).toBe(total);
    }
  });
  it("org totals equal the sum of department breakdown rows (ledger metrics)", () => {
    for (const metricId of ["appointments_completed", "revenue_listed_cents", "coaching_minutes"]) {
      const total = evaluate(ds, metricId).value!;
      const rows = computeBreakdown(ds, ORG_SCOPE, FILTERS, metricId, "department").rows;
      const sum = rows.reduce((s, r) => s + (r.value ?? 0), 0);
      expect(sum, metricId).toBe(total);
    }
  });
  it("trainer scope isolates that trainer's facts exactly", () => {
    expect(
      evaluate(ds, "revenue_listed_cents", { organizationId: ORG, trainerId: "t1" }).value,
    ).toBe(11000);
    expect(
      evaluate(ds, "payroll_gross_cents", { organizationId: ORG, trainerId: "t2" }).value,
    ).toBe(2500);
  });
  it("cross-organization facts never leak into scope", () => {
    const polluted = dataset({
      appointments: [
        appt({}),
        { ...appt({}), organizationId: "org-OTHER", id: "foreign" },
      ],
    });
    expect(evaluate(polluted, "appointments_completed").value).toBe(1);
  });
});

/* -------------------------------------------------- executive summary */

describe("executive summary", () => {
  it("produces deterministic structured winners from catalog metrics", () => {
    const ds = dataset({
      appointments: [
        appt({ trainerId: "t1", departmentId: "dept-a", listedCents: 9000 }),
        appt({ trainerId: "t2", departmentId: "dept-b", listedCents: 5000 }),
        appt({ trainerId: "t2", departmentId: "dept-b", listedCents: 5000 }),
      ],
      payroll: [payrollFact({})],
    });
    const items = generateExecutiveSummary(ds, ORG_SCOPE, FILTERS);
    const byCode = new Map(items.map((i) => [i.code, i]));
    expect(byCode.get("top_revenue_department")?.subject).toBe("Dept B");
    expect(byCode.get("top_revenue_department")?.value).toBe(10000);
    expect(byCode.get("most_sessions")?.subject).toBe("Trainer Two");
    expect(byCode.get("biggest_configuration_gap")?.health).toBe("healthy");
    // Deterministic: same input, same output.
    expect(generateExecutiveSummary(ds, ORG_SCOPE, FILTERS)).toEqual(items);
  });
  it("explains missing data instead of inventing winners", () => {
    const items = generateExecutiveSummary(dataset(), ORG_SCOPE, FILTERS);
    const most = items.find((i) => i.code === "most_sessions")!;
    expect(most.subject).toBeNull();
    expect(most.health).toBe("incomplete");
    expect(most.detail.length).toBeGreaterThan(0);
  });
});
