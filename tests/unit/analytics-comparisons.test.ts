import { describe, expect, it } from "vitest";
import {
  isPartial,
  localToday,
  resolveComparisonWindow,
  resolveRollingPeriods,
  windowFromPeriod,
  type PeriodFacts,
} from "@/lib/analytics/comparisons/windows";
import {
  buildMetricComparison,
  percentChangeBp,
} from "@/lib/analytics/comparisons/compare";
import {
  getMetricAnalyticsMetadata,
  listUnassignedMetricIds,
} from "@/lib/analytics/shared/metadata";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import type { MetricResult } from "@/lib/intelligence/shared/types";
import type { AnalyticsWindow } from "@/lib/analytics/shared/types";

const TODAY = "2026-07-15";

const PERIODS: PeriodFacts[] = [
  { id: "p-2026-07", label: "July 2026", startDate: "2026-07-01", endDate: "2026-07-31", status: "active" },
  { id: "p-2026-06", label: "June 2026", startDate: "2026-06-01", endDate: "2026-06-30", status: "closed" },
  { id: "p-2026-05", label: "May 2026", startDate: "2026-05-01", endDate: "2026-05-31", status: "closed" },
  { id: "p-2025-07", label: "July 2025", startDate: "2025-07-01", endDate: "2025-07-31", status: "closed" },
];

function anchorJuly(): AnalyticsWindow {
  return windowFromPeriod(PERIODS[0], "current", TODAY);
}

function result(overrides: Partial<MetricResult> = {}): MetricResult {
  return {
    metricId: "appointments_completed",
    scope: { organizationId: "org" },
    filters: { dateFrom: "2026-07-01", dateTo: "2026-07-31" },
    value: 120,
    unit: "count",
    health: "healthy",
    reasons: [],
    warnings: [],
    metadata: {},
    dependencies: [],
    calculatedAt: "2026-07-15T00:00:00Z",
    version: "intel-v1",
    ...overrides,
  } as MetricResult;
}

/* ------------------------------------------------------------- metadata */

describe("analytics metadata registry", () => {
  it("assigns a direction to every catalog metric", () => {
    expect(listUnassignedMetricIds()).toEqual([]);
  });

  it("never marks a rate metric percent-change compatible", () => {
    for (const [id, definition] of METRIC_DEFINITIONS) {
      if (definition.unit === "rate_bp") {
        expect(getMetricAnalyticsMetadata(id)?.percentChangeCompatible).toBe(false);
      }
    }
  });

  it("marks readiness metrics as point-in-time (not historically comparable)", () => {
    expect(
      getMetricAnalyticsMetadata("organization_readiness_bp")?.historicallyComparable,
    ).toBe(false);
    expect(
      getMetricAnalyticsMetadata("appointments_completed")?.historicallyComparable,
    ).toBe(true);
  });

  it("refuses targets and benchmarks for date metrics", () => {
    const meta = getMetricAnalyticsMetadata("client_first_visit");
    expect(meta?.targetCompatible).toBe(false);
    expect(meta?.benchmarkCompatible).toBe(false);
  });

  it("does not assume higher is better for payroll amounts", () => {
    expect(getMetricAnalyticsMetadata("payroll_gross_cents")?.direction).toBe(
      "context_dependent",
    );
  });
});

/* --------------------------------------------------------------- windows */

describe("comparison window resolution", () => {
  it("previous_period uses the actual preceding reporting period", () => {
    const resolution = resolveComparisonWindow("previous_period", anchorJuly(), PERIODS, TODAY);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.window.reportingPeriodId).toBe("p-2026-06");
      expect(resolution.window.finality).toBe("final");
      expect(resolution.window.partial).toBe(false);
    }
  });

  it("previous_period refuses when no earlier period exists", () => {
    const anchor = windowFromPeriod(PERIODS[3], "current", TODAY);
    const resolution = resolveComparisonWindow("previous_period", anchor, PERIODS, TODAY);
    expect(resolution.ok).toBe(false);
  });

  it("same_period_last_year matches an existing reporting period when dates align", () => {
    const resolution = resolveComparisonWindow(
      "same_period_last_year", anchorJuly(), PERIODS, TODAY,
    );
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.window.reportingPeriodId).toBe("p-2025-07");
      expect(resolution.window.dateFrom).toBe("2025-07-01");
      expect(resolution.window.dateTo).toBe("2025-07-31");
    }
  });

  it("handles leap-day year shifts (Feb 29 → Feb 28)", () => {
    const anchor: AnalyticsWindow = {
      kind: "current", label: "Feb 2028", dateFrom: "2028-02-01", dateTo: "2028-02-29",
      reportingPeriodId: null, finality: "not_final", partial: false,
    };
    const resolution = resolveComparisonWindow("year_over_year", anchor, [], TODAY);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.window.dateTo).toBe("2027-02-28");
  });

  it("month_over_month crosses the January boundary", () => {
    const anchor: AnalyticsWindow = {
      kind: "current", label: "Jan 2026", dateFrom: "2026-01-01", dateTo: "2026-01-31",
      reportingPeriodId: null, finality: "not_final", partial: false,
    };
    const resolution = resolveComparisonWindow("month_over_month", anchor, [], TODAY);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.window.dateFrom).toBe("2025-12-01");
      expect(resolution.window.dateTo).toBe("2025-12-31");
    }
  });

  it("month_over_month refuses a multi-month window", () => {
    const anchor: AnalyticsWindow = {
      kind: "current", label: "H1", dateFrom: "2026-01-01", dateTo: "2026-06-30",
      reportingPeriodId: null, finality: "not_final", partial: false,
    };
    expect(resolveComparisonWindow("month_over_month", anchor, [], TODAY).ok).toBe(false);
  });

  it("quarter_over_quarter resolves the prior quarter", () => {
    const anchor: AnalyticsWindow = {
      kind: "current", label: "Q3", dateFrom: "2026-07-01", dateTo: "2026-09-30",
      reportingPeriodId: null, finality: "not_final", partial: false,
    };
    const resolution = resolveComparisonWindow("quarter_over_quarter", anchor, [], TODAY);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.window.dateFrom).toBe("2026-04-01");
      expect(resolution.window.dateTo).toBe("2026-06-30");
    }
  });

  it("year_to_date and prior_year_to_date share the same span", () => {
    const anchor = anchorJuly();
    const ytd = resolveComparisonWindow("year_to_date", anchor, PERIODS, TODAY);
    const prior = resolveComparisonWindow("prior_year_to_date", anchor, PERIODS, TODAY);
    expect(ytd.ok && prior.ok).toBe(true);
    if (ytd.ok && prior.ok) {
      expect(ytd.window.dateFrom).toBe("2026-01-01");
      expect(ytd.window.dateTo).toBe("2026-07-31");
      expect(prior.window.dateFrom).toBe("2025-01-01");
      expect(prior.window.dateTo).toBe("2025-07-31");
    }
  });

  it("rolling_12_months covers 12 whole calendar months", () => {
    const resolution = resolveComparisonWindow("rolling_12_months", anchorJuly(), PERIODS, TODAY);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.window.dateFrom).toBe("2025-08-01");
      expect(resolution.window.dateTo).toBe("2026-07-31");
    }
  });

  it("rolling periods require a reporting-period anchor and preserve order", () => {
    const rolling = resolveRollingPeriods(anchorJuly(), PERIODS, 4, TODAY);
    expect(rolling.ok).toBe(true);
    if (rolling.ok) {
      expect(rolling.windows.map((w) => w.reportingPeriodId)).toEqual([
        "p-2026-07", "p-2026-06", "p-2026-05", "p-2025-07",
      ]);
    }
    const custom: AnalyticsWindow = {
      kind: "current", label: "ad hoc", dateFrom: "2026-07-01", dateTo: "2026-07-31",
      reportingPeriodId: null, finality: "not_final", partial: false,
    };
    expect(resolveRollingPeriods(custom, PERIODS, 4, TODAY).ok).toBe(false);
  });

  it("labels open periods not final and marks in-progress windows partial", () => {
    const anchor = anchorJuly();
    expect(anchor.finality).toBe("not_final");
    expect(anchor.partial).toBe(true); // ends 2026-07-31, today is 2026-07-15
    expect(isPartial("2026-06-30", TODAY)).toBe(false);
  });

  it("custom windows validate their dates", () => {
    const anchor = anchorJuly();
    expect(
      resolveComparisonWindow("custom", anchor, PERIODS, TODAY, {
        dateFrom: "2026-02-01", dateTo: "2026-01-01",
      }).ok,
    ).toBe(false);
    const good = resolveComparisonWindow("custom", anchor, PERIODS, TODAY, {
      dateFrom: "2026-05-01", dateTo: "2026-05-31",
    });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.window.reportingPeriodId).toBe("p-2026-05"); // matched
  });

  it("localToday returns a YYYY-MM-DD string", () => {
    expect(localToday(new Date("2026-07-15T12:00:00Z"))).toBe("2026-07-15");
  });
});

/* ---------------------------------------------------------- percent math */

describe("percentChangeBp", () => {
  it("computes signed change in basis points", () => {
    expect(percentChangeBp(120, 100)).toBe(2000);
    expect(percentChangeBp(80, 100)).toBe(-2000);
    expect(percentChangeBp(100, 100)).toBe(0);
  });
  it("refuses zero and negative denominators", () => {
    expect(percentChangeBp(50, 0)).toBeNull();
    expect(percentChangeBp(50, -10)).toBeNull();
  });
});

/* ------------------------------------------------------------ comparison */

describe("buildMetricComparison", () => {
  const currentWindow = anchorJuly();
  const juneWindow = windowFromPeriod(PERIODS[1], "previous_period", TODAY);

  it("produces variances and interpretation for an eligible comparison", () => {
    const comparison = buildMetricComparison({
      current: result({ value: 120 }),
      currentWindow,
      comparison: result({ value: 100, filters: { dateFrom: "2026-06-01", dateTo: "2026-06-30" } }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("eligible");
    expect(comparison.absoluteVariance).toBe(20);
    expect(comparison.percentVarianceBp).toBe(2000);
    expect(comparison.direction).toBe("higher_is_better");
    expect(comparison.interpretation).toBe("improved");
  });

  it("interprets lower-is-better movement correctly", () => {
    const comparison = buildMetricComparison({
      current: result({ metricId: "appointments_no_show", value: 3 }),
      currentWindow,
      comparison: result({ metricId: "appointments_no_show", value: 8 }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.interpretation).toBe("improved");
    expect(comparison.absoluteVariance).toBe(-5);
  });

  it("gives no interpretation for neutral or context-dependent metrics", () => {
    const comparison = buildMetricComparison({
      current: result({ metricId: "payroll_gross_cents", value: 500_000, unit: "cents" }),
      currentWindow,
      comparison: result({ metricId: "payroll_gross_cents", value: 400_000, unit: "cents" }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("eligible");
    expect(comparison.interpretation).toBeNull();
  });

  it("shows absolute but not percent variance when the denominator is zero", () => {
    const comparison = buildMetricComparison({
      current: result({ value: 12 }),
      currentWindow,
      comparison: result({ value: 0 }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("eligible");
    expect(comparison.absoluteVariance).toBe(12);
    expect(comparison.percentVarianceBp).toBeNull();
  });

  it("handles negative values without a percentage", () => {
    const comparison = buildMetricComparison({
      current: result({ metricId: "payroll_adjustment_net_cents", value: -500, unit: "cents" }),
      currentWindow,
      comparison: result({ metricId: "payroll_adjustment_net_cents", value: -1500, unit: "cents" }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.absoluteVariance).toBe(1000);
    expect(comparison.percentVarianceBp).toBeNull();
  });

  it("shows bp delta but never percent for rate metrics", () => {
    const comparison = buildMetricComparison({
      current: result({ metricId: "completed_rate_bp", value: 9_000, unit: "rate_bp" }),
      currentWindow,
      comparison: result({ metricId: "completed_rate_bp", value: 8_500, unit: "rate_bp" }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("eligible");
    expect(comparison.absoluteVariance).toBe(500);
    expect(comparison.percentVarianceBp).toBeNull();
  });

  it("refuses comparison when the current value is unavailable — never zero", () => {
    const comparison = buildMetricComparison({
      current: result({ value: null, health: "waiting_for_payroll", reasons: ["No finalized payroll run."] }),
      currentWindow,
      comparison: result({ value: 100 }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("current_unavailable");
    expect(comparison.absoluteVariance).toBeNull();
    expect(comparison.percentVarianceBp).toBeNull();
    expect(comparison.interpretation).toBeNull();
  });

  it("refuses comparison when the comparison side is unavailable", () => {
    const comparison = buildMetricComparison({
      current: result(),
      currentWindow,
      comparison: result({ value: null, health: "unavailable", reasons: ["No data."] }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("comparison_unavailable");
  });

  it("refuses unit mismatches", () => {
    const comparison = buildMetricComparison({
      current: result(),
      currentWindow,
      comparison: result({ unit: "cents" }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("unit_mismatch");
  });

  it("refuses version mismatches", () => {
    const comparison = buildMetricComparison({
      current: result(),
      currentWindow,
      comparison: { ...result(), version: "intel-v0" } as unknown as MetricResult,
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("version_mismatch");
  });

  it("marks readiness metrics point-in-time instead of comparing", () => {
    const comparison = buildMetricComparison({
      current: result({ metricId: "organization_readiness_bp", value: 9500, unit: "rate_bp" }),
      currentWindow,
      comparison: result({ metricId: "organization_readiness_bp", value: 9000, unit: "rate_bp" }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.eligibility).toBe("point_in_time_metric");
    expect(comparison.absoluteVariance).toBeNull();
  });

  it("carries the missing-window reason through", () => {
    const comparison = buildMetricComparison({
      current: result(),
      currentWindow,
      comparison: null,
      comparisonWindow: null,
      missingReason: "No earlier reporting period exists to compare against.",
    });
    expect(comparison.eligibility).toBe("missing_comparison_period");
    expect(comparison.eligibilityReason).toContain("No earlier reporting period");
  });

  it("preserves period finality on both sides", () => {
    const comparison = buildMetricComparison({
      current: result(),
      currentWindow,
      comparison: result({ value: 100 }),
      comparisonWindow: juneWindow,
    });
    expect(comparison.current.window.finality).toBe("not_final");
    expect(comparison.comparison?.window.finality).toBe("final");
  });
});
