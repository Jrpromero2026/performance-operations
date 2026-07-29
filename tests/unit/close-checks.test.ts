import { describe, expect, it } from "vitest";
import {
  classifyCloseChecks,
  summarizeChecks,
  REQUIRED_EXPORT_TYPES,
  type CloseReadinessInputs,
} from "@/lib/close/checks";

/**
 * Readiness classification matrix. classifyCloseChecks is PURE — every
 * scenario is a plain input mutation. The baseline below is a fully clean
 * period; the only failing check is revenue_definitions_unapproved, which
 * fails permanently (no approved business definition) and is acknowledged
 * in the baseline so readyToClose starts true.
 */

function baseline(): CloseReadinessInputs {
  return {
    now: "2026-07-29T12:00:00Z",
    organizationId: "org-1",
    closeRunId: "run-1",
    period: {
      id: "period-1",
      organizationId: "org-1",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      status: "open",
      label: "June 2026",
    },
    policy: { allowSelfApproval: false, payrollRequiredState: "posted" },
    imports: {
      processing: 0,
      needsReview: 0,
      readyForApproval: 0,
      approvedUnposted: 0,
      failed: 0,
      reversedTouchingPeriod: 0,
    },
    appointments: { activeInPeriod: 42, correctionsInPeriod: 0 },
    payroll: {
      finalizedRun: {
        id: "payroll-1",
        name: "June payroll",
        status: "posted",
        snapshotVersion: 1,
        totalsReconcile: true,
        wasReopened: false,
      },
      activeRuns: [],
      openLateArrivalIssues: 0,
      stale: false,
      pendingAdjustments: 0,
      pendingTimeEntries: 0,
    },
    configuration: {
      readiness: [
        "compensation_coverage_bp",
        "trainer_assignment_coverage_bp",
        "service_alias_coverage_bp",
        "reporting_period_coverage_bp",
      ].map((metricId) => ({
        metricId,
        value: 10_000,
        health: "healthy",
        reason: null,
      })),
      paidAmountsPresent: true,
    },
    reporting: {
      executivePackage: { id: "pkg-1", version: 1, status: "ready" },
      exportTypesPresent: [...REQUIRED_EXPORT_TYPES],
    },
    acknowledgements: new Set(["revenue_definitions_unapproved"]),
  };
}

function checkByCode(inputs: CloseReadinessInputs, code: string) {
  const check = classifyCloseChecks(inputs).find((c) => c.code === code);
  if (!check) throw new Error(`check ${code} not produced`);
  return check;
}

describe("classifyCloseChecks baseline", () => {
  it("is ready to close when everything is clean and the permanent warning is acknowledged", () => {
    const summary = summarizeChecks(classifyCloseChecks(baseline()));
    expect(summary.blockingOpen).toBe(0);
    expect(summary.warningsOpen).toBe(0);
    expect(summary.warningsAcknowledged).toBe(1);
    expect(summary.readyToClose).toBe(true);
  });

  it("produces a stable checklist shape", () => {
    const checks = classifyCloseChecks(baseline());
    expect(checks).toHaveLength(29);
    // Codes are unique.
    expect(new Set(checks.map((c) => c.code)).size).toBe(checks.length);
    for (const check of checks) {
      expect(check.definition).toBeTruthy();
      expect(check.source).toBeTruthy();
      expect(check.action).toBeTruthy();
      expect(check.link.startsWith("/")).toBe(true);
      expect(check.lastEvaluatedAt).toBe("2026-07-29T12:00:00Z");
    }
  });

  it("is NOT ready when the permanent warning is unacknowledged", () => {
    const inputs = baseline();
    inputs.acknowledgements = new Set();
    const summary = summarizeChecks(classifyCloseChecks(inputs));
    expect(summary.warningsOpen).toBe(1);
    expect(summary.warningCodes).toContain("revenue_definitions_unapproved");
    expect(summary.readyToClose).toBe(false);
  });
});

describe("reporting period checks", () => {
  it("fails everything period-related when the period is missing (missing info never passes)", () => {
    const inputs = baseline();
    inputs.period = null;
    expect(checkByCode(inputs, "period_exists").status).toBe("fail");
    expect(checkByCode(inputs, "period_open").status).toBe("fail");
    expect(summarizeChecks(classifyCloseChecks(inputs)).readyToClose).toBe(false);
  });

  it("fails when the period belongs to another organization", () => {
    const inputs = baseline();
    inputs.period!.organizationId = "org-2";
    expect(checkByCode(inputs, "period_exists").status).toBe("fail");
  });

  it("fails on inverted dates and non-open statuses", () => {
    const inverted = baseline();
    inverted.period!.startDate = "2026-07-01";
    expect(checkByCode(inverted, "period_dates_valid").status).toBe("fail");

    for (const status of ["draft", "closed", "locked"]) {
      const inputs = baseline();
      inputs.period!.status = status;
      expect(checkByCode(inputs, "period_open").status, status).toBe("fail");
    }
  });
});

describe("import checks", () => {
  const blockingByField: [keyof CloseReadinessInputs["imports"], string][] = [
    ["processing", "imports_processing"],
    ["needsReview", "imports_awaiting_review"],
    ["readyForApproval", "imports_awaiting_approval"],
    ["approvedUnposted", "imports_approved_unposted"],
  ];

  it.each(blockingByField)("blocks on %s > 0", (field, code) => {
    const inputs = baseline();
    inputs.imports[field] = 2;
    const check = checkByCode(inputs, code);
    expect(check.status).toBe("fail");
    expect(check.severity).toBe("blocking");
    expect(check.waivable).toBe(false);
    expect(summarizeChecks(classifyCloseChecks(inputs)).readyToClose).toBe(false);
  });

  it("treats failed batches and reversed imports as acknowledgeable warnings", () => {
    const inputs = baseline();
    inputs.imports.failed = 1;
    inputs.imports.reversedTouchingPeriod = 3;
    let summary = summarizeChecks(classifyCloseChecks(inputs));
    expect(summary.blockingOpen).toBe(0);
    expect(summary.warningsOpen).toBe(2);
    expect(summary.readyToClose).toBe(false);

    inputs.acknowledgements = new Set([
      "revenue_definitions_unapproved",
      "imports_failed_disposition",
      "import_reversed_in_period",
    ]);
    summary = summarizeChecks(classifyCloseChecks(inputs));
    expect(summary.warningsOpen).toBe(0);
    expect(summary.warningsAcknowledged).toBe(3);
    expect(summary.readyToClose).toBe(true);
  });
});

describe("appointment and payroll checks", () => {
  it("blocks on open late-arrival issues", () => {
    const inputs = baseline();
    inputs.payroll.openLateArrivalIssues = 1;
    const check = checkByCode(inputs, "late_arrivals_reviewed");
    expect(check.status).toBe("fail");
    expect(check.severity).toBe("blocking");
  });

  it("warns on a zero-activity period and skips the payroll requirement", () => {
    const inputs = baseline();
    inputs.appointments.activeInPeriod = 0;
    inputs.payroll.finalizedRun = null;
    expect(checkByCode(inputs, "zero_activity_period").status).toBe("fail");
    // Payroll is only required when the period has activity.
    expect(checkByCode(inputs, "payroll_finalized").status).toBe("pass");
  });

  it("blocks when activity exists but no payroll run is finalized", () => {
    const inputs = baseline();
    inputs.payroll.finalizedRun = null;
    const check = checkByCode(inputs, "payroll_finalized");
    expect(check.status).toBe("fail");
    expect(check.severity).toBe("blocking");
  });

  it("enforces the locked-payroll policy when configured", () => {
    const inputs = baseline();
    inputs.policy.payrollRequiredState = "locked";
    expect(checkByCode(inputs, "payroll_finalized").status).toBe("fail");
    inputs.payroll.finalizedRun!.status = "locked";
    expect(checkByCode(inputs, "payroll_finalized").status).toBe("pass");
  });

  it("blocks on unfinished runs, staleness, reconciliation, and pending items", () => {
    const active = baseline();
    active.payroll.activeRuns = [
      { id: "r2", name: "Rerun", status: "in_review", blockingIssueCount: 0 },
    ];
    expect(checkByCode(active, "payroll_no_active_runs").status).toBe("fail");

    const stale = baseline();
    stale.payroll.stale = true;
    expect(checkByCode(stale, "payroll_not_stale").status).toBe("fail");

    const drift = baseline();
    drift.payroll.finalizedRun!.totalsReconcile = false;
    expect(checkByCode(drift, "payroll_totals_reconcile").status).toBe("fail");

    const pending = baseline();
    pending.payroll.pendingAdjustments = 1;
    pending.payroll.pendingTimeEntries = 2;
    expect(checkByCode(pending, "payroll_no_pending_adjustments").status).toBe("fail");
    expect(checkByCode(pending, "payroll_no_pending_time").status).toBe("fail");
  });

  it("warns (waivable) when the finalized run was reopened", () => {
    const inputs = baseline();
    inputs.payroll.finalizedRun!.wasReopened = true;
    const check = checkByCode(inputs, "payroll_was_reopened");
    expect(check.status).toBe("fail");
    expect(check.severity).toBe("warning");
    expect(check.waivable).toBe(true);
  });
});

describe("configuration checks (engine readiness)", () => {
  it("fails a coverage check when the metric is below 100% (10000 bp)", () => {
    const inputs = baseline();
    inputs.configuration.readiness[0]!.value = 9_500;
    expect(checkByCode(inputs, "compensation_coverage").status).toBe("fail");
  });

  it("fails when the metric was never evaluated (missing info never passes)", () => {
    const inputs = baseline();
    inputs.configuration.readiness = inputs.configuration.readiness.filter(
      (r) => r.metricId !== "trainer_assignment_coverage_bp",
    );
    expect(checkByCode(inputs, "trainer_assignment_coverage").status).toBe("fail");
  });

  it("fails a null-valued metric unless the engine reports it healthy", () => {
    const inputs = baseline();
    inputs.configuration.readiness[3] = {
      metricId: "reporting_period_coverage_bp",
      value: null,
      health: "unavailable",
      reason: "not evaluable",
    };
    expect(checkByCode(inputs, "reporting_period_coverage").status).toBe("fail");
  });

  it("warns when paid amounts are absent from the source", () => {
    const inputs = baseline();
    inputs.configuration.paidAmountsPresent = false;
    const check = checkByCode(inputs, "paid_amounts_available");
    expect(check.status).toBe("fail");
    expect(check.waivable).toBe(true);
  });
});

describe("reporting checks", () => {
  it("blocks until the executive package is ready", () => {
    const none = baseline();
    none.reporting.executivePackage = null;
    expect(checkByCode(none, "report_package_ready").status).toBe("fail");

    const generating = baseline();
    generating.reporting.executivePackage!.status = "generating";
    expect(checkByCode(generating, "report_package_ready").status).toBe("fail");
  });

  it.each(REQUIRED_EXPORT_TYPES.map((t) => [t] as const))(
    "blocks when required export %s is missing",
    (exportType) => {
      const inputs = baseline();
      inputs.reporting.exportTypesPresent = inputs.reporting.exportTypesPresent.filter(
        (t) => t !== exportType,
      );
      const check = checkByCode(inputs, `export_${exportType}`);
      expect(check.status).toBe("fail");
      expect(check.severity).toBe("blocking");
    },
  );

  it("warns (waivable) when the package was regenerated", () => {
    const inputs = baseline();
    inputs.reporting.executivePackage!.version = 3;
    const check = checkByCode(inputs, "package_regenerated");
    expect(check.status).toBe("fail");
    expect(check.waivable).toBe(true);
  });
});

describe("acknowledgement semantics", () => {
  it("never lets an acknowledgement waive a blocking check", () => {
    const inputs = baseline();
    inputs.imports.processing = 1;
    inputs.acknowledgements = new Set([
      "revenue_definitions_unapproved",
      "imports_processing", // ignored: not waivable
    ]);
    const check = checkByCode(inputs, "imports_processing");
    expect(check.acknowledged).toBe(false);
    expect(summarizeChecks(classifyCloseChecks(inputs)).readyToClose).toBe(false);
  });

  it("does not mark passing checks as acknowledged", () => {
    const inputs = baseline();
    inputs.acknowledgements = new Set([
      "revenue_definitions_unapproved",
      "imports_failed_disposition", // passing — ack is moot
    ]);
    expect(checkByCode(inputs, "imports_failed_disposition").resolutionState).toBe(
      "resolved",
    );
  });
});
