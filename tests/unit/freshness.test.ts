import { describe, expect, it } from "vitest";
import {
  buildFreshnessReport,
  freshnessStatement,
  mayReportQuantitatively,
  type FreshnessInputs,
} from "@/lib/freshness/model";
import {
  assessDataQuality,
  summarizeDataQuality,
  type DataQualityCounts,
} from "@/lib/freshness/data-quality";
import {
  assessStaleness,
  daysBetween,
  describeProvenance,
  isAutomated,
} from "@/lib/snapshots/provenance";
import { calculatePtPenetration, formatBp } from "@/lib/snapshots/penetration";

const TODAY = "2026-08-15";

function inputs(overrides: Partial<FreshnessInputs> = {}): FreshnessInputs {
  return {
    todayIsoDate: TODAY,
    appointments: {
      latestAppointmentDate: null,
      lastImportAt: null,
      lastSyncAt: null,
      connectionActive: false,
      postedAppointmentCount: 0,
    },
    clubMembership: {
      latestSnapshotAsOf: null,
      latestSnapshotEnteredAt: null,
      snapshotCount: 0,
    },
    payroll: {
      latestFinalizedPeriodEnd: null,
      latestFinalizedAt: null,
      finalizedRunCount: 0,
    },
    ...overrides,
  };
}

describe("an empty system reads as 'no data', never as zero", () => {
  it("reports every source as never_loaded or not_connected", () => {
    const report = buildFreshnessReport(inputs());
    expect(report.isEmpty).toBe(true);
    expect(report.sources.map((s) => s.state).sort()).toEqual([
      "never_loaded",
      "never_loaded",
      "never_loaded",
      "not_connected",
    ]);
  });

  it("refuses quantitative reporting for every source", () => {
    const report = buildFreshnessReport(inputs());
    expect(mayReportQuantitatively(report, "appointments")).toBe(false);
    expect(mayReportQuantitatively(report, "club_membership")).toBe(false);
    expect(mayReportQuantitatively(report, "payroll")).toBe(false);
    expect(mayReportQuantitatively(report, "coaching")).toBe(false);
  });

  it("says so in words, so a reader cannot mistake it for a real total", () => {
    const report = buildFreshnessReport(inputs());
    expect(freshnessStatement(report, "appointments")).toBe(
      "No appointment data has been loaded."
    );
  });
});

describe("appointment freshness", () => {
  const loaded = (latest: string, connectionActive = false) =>
    buildFreshnessReport(
      inputs({
        appointments: {
          latestAppointmentDate: latest,
          lastImportAt: `${latest}T12:00:00.000Z`,
          lastSyncAt: null,
          connectionActive,
          postedAppointmentCount: 120,
        },
      })
    );

  it("is current within the automated-cadence tolerance", () => {
    const source = loaded("2026-08-14").sources.find((s) => s.key === "setmore")!;
    expect(source.state).toBe("current");
    expect(source.dataThroughDate).toBe("2026-08-14");
    expect(source.summary).toBe("Appointment data is current through 2026-08-14.");
  });

  it("ages after a few days and goes stale after ten", () => {
    expect(loaded("2026-08-11").sources[0].state).toBe("aging");
    expect(loaded("2026-08-01").sources[0].state).toBe("stale");
  });

  it("names manual import as the reason currency depends on a person", () => {
    const source = loaded("2026-08-14", false).sources[0];
    expect(source.ingest).toBe("manual_snapshot");
    expect(source.detail).toMatch(/manual CSV import/);
  });

  it("allows quantitative reporting once data exists", () => {
    expect(mayReportQuantitatively(loaded("2026-08-14"), "appointments")).toBe(true);
  });
});

describe("club membership freshness follows a monthly cadence", () => {
  const withSnapshot = (asOf: string) =>
    buildFreshnessReport(
      inputs({
        clubMembership: {
          latestSnapshotAsOf: asOf,
          latestSnapshotEnteredAt: `${asOf}T18:00:00.000Z`,
          snapshotCount: 3,
        },
      })
    ).sources.find((s) => s.key === "gym_management_solutions")!;

  it("tolerates a month, not a week", () => {
    expect(withSnapshot("2026-07-31").state).toBe("current");
    expect(withSnapshot("2026-06-30").state).toBe("aging");
    expect(withSnapshot("2026-05-01").state).toBe("stale");
  });

  it("always names the snapshot date", () => {
    expect(withSnapshot("2026-07-31").summary).toBe(
      "Latest GMS snapshot is as of 2026-07-31."
    );
  });
});

describe("Everfit is declared absent rather than silently missing", () => {
  it("appears in every report as not_connected", () => {
    const everfit = buildFreshnessReport(inputs()).sources.find((s) => s.key === "everfit")!;
    expect(everfit.state).toBe("not_connected");
    expect(everfit.detail).toMatch(/cannot be answered from this system/);
  });
});

describe("provenance", () => {
  const manual = {
    mode: "manual_snapshot" as const,
    sourceKey: "gym_management_solutions",
    sourceLabel: "Gym Management Solutions (GMS)",
    asOfDate: "2026-07-31",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    enteredByName: "JR Romero",
    enteredAt: "2026-08-02T17:00:00.000Z",
    note: null,
  };

  it("states the source and the as-of date, not just 'latest'", () => {
    expect(describeProvenance(manual, TODAY)).toBe(
      "Based on the Gym Management Solutions (GMS) snapshot as of 2026-07-31, entered by JR Romero."
    );
  });

  it("warns when the reading is old enough to mislead", () => {
    expect(describeProvenance({ ...manual, asOfDate: "2026-04-30" }, TODAY)).toMatch(
      /may no longer reflect the club/
    );
  });

  it("never calls manual data automated", () => {
    expect(isAutomated(manual)).toBe(false);
    expect(isAutomated({ ...manual, mode: "live_automated" })).toBe(true);
  });

  it("handles an absent snapshot without inventing a date", () => {
    expect(describeProvenance({ ...manual, mode: "unavailable" }, TODAY)).toBe(
      "No Gym Management Solutions (GMS) snapshot has been recorded."
    );
  });

  it("treats an unknown as-of date as unknown, not current", () => {
    expect(assessStaleness(null, TODAY)).toBe("unknown");
    expect(daysBetween("not-a-date", TODAY)).toBeNull();
  });
});

describe("PT penetration", () => {
  const provenance = {
    mode: "manual_snapshot" as const,
    sourceKey: "gym_management_solutions",
    sourceLabel: "GMS",
    asOfDate: "2026-07-31",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    enteredByName: null,
    enteredAt: "2026-08-01T00:00:00.000Z",
    note: null,
  };

  it("computes a basis-point rate from the eligible population", () => {
    const result = calculatePtPenetration({
      activePtClients: 210,
      eligibleMembers: 4200,
      provenance,
      todayIsoDate: TODAY,
    });
    expect(result.health).toBe("healthy");
    expect(result.valueBp).toBe(500);
    expect(formatBp(result.valueBp)).toBe("5.00%");
  });

  it("REFUSES to substitute total members for the eligible population", () => {
    const result = calculatePtPenetration({
      activePtClients: 210,
      eligibleMembers: null,
      totalActiveMembers: 5000,
      provenance,
      todayIsoDate: TODAY,
    });
    expect(result.health).toBe("configuration_missing");
    expect(result.valueBp).toBeNull();
    expect(result.reasons[0]).toMatch(/is NOT substituted/);
  });

  it("reports insufficient data when the numerator is unavailable", () => {
    const result = calculatePtPenetration({
      activePtClients: null,
      eligibleMembers: 4200,
      provenance,
      todayIsoDate: TODAY,
    });
    expect(result.health).toBe("insufficient_data");
    expect(result.valueBp).toBeNull();
  });

  it("explains a rate above 100% rather than letting it look like a bug", () => {
    const result = calculatePtPenetration({
      activePtClients: 50,
      eligibleMembers: 40,
      provenance,
      todayIsoDate: TODAY,
    });
    expect(result.valueBp).toBe(12_500);
    expect(result.reasons.some((r) => /may not be club members/.test(r))).toBe(true);
  });

  it("carries the denominator's staleness with the result", () => {
    const result = calculatePtPenetration({
      activePtClients: 210,
      eligibleMembers: 4200,
      provenance: { ...provenance, asOfDate: "2026-01-31" },
      todayIsoDate: TODAY,
    });
    expect(result.denominatorStaleness).toBe("stale");
    expect(result.reasons.some((r) => /no longer current/.test(r))).toBe(true);
  });

  it("never divides by zero", () => {
    const result = calculatePtPenetration({
      activePtClients: 5,
      eligibleMembers: 0,
      provenance,
      todayIsoDate: TODAY,
    });
    expect(result.valueBp).toBeNull();
    expect(result.health).toBe("insufficient_data");
  });
});

describe("data quality panel", () => {
  const clean: DataQualityCounts = {
    unresolvedTrainerMappings: 0,
    unresolvedClientMappings: 0,
    unmatchedServices: 0,
    unknownStatuses: 0,
    unknownStatusAppointments: 0,
    openImportExceptions: 0,
    openPayrollExceptions: 0,
    trainersMissingCompensation: 0,
    failedConnections: 0,
  };

  const loadedFreshness = buildFreshnessReport(
    inputs({
      appointments: {
        latestAppointmentDate: "2026-08-14",
        lastImportAt: "2026-08-14T12:00:00.000Z",
        lastSyncAt: null,
        connectionActive: true,
        postedAppointmentCount: 100,
      },
      clubMembership: {
        latestSnapshotAsOf: "2026-07-31",
        latestSnapshotEnteredAt: "2026-08-01T00:00:00.000Z",
        snapshotCount: 1,
      },
    })
  );

  it("is clear when everything is clear", () => {
    const checks = assessDataQuality(clean, loadedFreshness);
    expect(checks.every((c) => c.severity === "ok")).toBe(true);
    expect(summarizeDataQuality(checks)).toEqual({
      severity: "ok",
      message: "All operational data checks are clear.",
    });
  });

  it("treats an empty appointment ledger as blocking", () => {
    const checks = assessDataQuality(clean, buildFreshnessReport(inputs()));
    const connection = checks.find((c) => c.key === "setmore_connection")!;
    expect(connection.severity).toBe("blocking");
    expect(connection.detail).toMatch(/No appointment data has been loaded/);
  });

  it("blocks on a single unmatched service, because those rows cannot post", () => {
    const checks = assessDataQuality(
      { ...clean, unmatchedServices: 1 },
      loadedFreshness
    );
    expect(checks.find((c) => c.key === "unmatched_services")!.severity).toBe("blocking");
  });

  it("treats a handful of unmatched clients as attention, not blocking", () => {
    const checks = assessDataQuality(
      { ...clean, unresolvedClientMappings: 3 },
      loadedFreshness
    );
    expect(checks.find((c) => c.key === "client_mappings")!.severity).toBe("attention");
  });

  it("sums unknown statuses across staging and the ledger", () => {
    const checks = assessDataQuality(
      { ...clean, unknownStatuses: 2, unknownStatusAppointments: 5 },
      loadedFreshness
    );
    const check = checks.find((c) => c.key === "unknown_statuses")!;
    expect(check.count).toBe(7);
    expect(check.detail).toMatch(/excluded from completed counts/);
  });

  it("names the blocking items in its one-line verdict", () => {
    const checks = assessDataQuality(
      { ...clean, unmatchedServices: 4, unresolvedTrainerMappings: 2 },
      loadedFreshness
    );
    const summary = summarizeDataQuality(checks);
    expect(summary.severity).toBe("blocking");
    expect(summary.message).toMatch(/unmatched services/);
    expect(summary.message).toMatch(/unresolved trainer mappings/);
  });
});
