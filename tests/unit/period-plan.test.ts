import { describe, expect, it } from "vitest";
import {
  MAX_PLANNED_PERIODS,
  describePlan,
  planPeriods,
} from "@/lib/dates/period-plan";

/**
 * Period planning turns a payroll cadence plus the date span of an
 * uploaded schedule into the periods that cover it. Pure date
 * arithmetic; the existing createPeriod action remains the authority on
 * validation and permissions.
 */

describe("planPeriods: monthly", () => {
  it("covers a span with whole calendar months", () => {
    const periods = planPeriods("2026-01-15", "2026-03-02", "monthly");
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([
      ["2026-01-01", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-31"],
    ]);
  });

  it("labels periods in owner-readable language", () => {
    const periods = planPeriods("2026-01-15", "2026-01-20", "monthly");
    expect(periods[0].label).toBe("January 2026");
  });

  it("handles leap years from the calendar, not a guess", () => {
    const periods = planPeriods("2028-02-05", "2028-02-06", "monthly");
    expect(periods[0].endDate).toBe("2028-02-29");
  });

  it("crosses a year boundary", () => {
    const periods = planPeriods("2026-12-10", "2027-01-05", "monthly");
    expect(periods.map((p) => p.label)).toEqual(["December 2026", "January 2027"]);
  });
});

describe("planPeriods: semi-monthly", () => {
  it("splits each month at the 15th", () => {
    const periods = planPeriods("2026-01-01", "2026-01-31", "semi_monthly");
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([
      ["2026-01-01", "2026-01-15"],
      ["2026-01-16", "2026-01-31"],
    ]);
  });

  it("omits halves that fall entirely outside the span", () => {
    const periods = planPeriods("2026-01-20", "2026-02-10", "semi_monthly");
    expect(periods.map((p) => [p.startDate, p.endDate])).toEqual([
      ["2026-01-16", "2026-01-31"],
      ["2026-02-01", "2026-02-15"],
    ]);
  });
});

describe("planPeriods: biweekly", () => {
  it("produces 14-day blocks", () => {
    const periods = planPeriods("2026-01-01", "2026-02-15", "biweekly");
    for (const period of periods) {
      const start = Date.parse(`${period.startDate}T00:00:00Z`);
      const end = Date.parse(`${period.endDate}T00:00:00Z`);
      expect((end - start) / 86_400_000).toBe(13);
    }
  });

  it("is reproducible for a span regardless of when setup runs", () => {
    const first = planPeriods("2026-03-10", "2026-04-20", "biweekly");
    const second = planPeriods("2026-03-10", "2026-04-20", "biweekly");
    expect(first).toEqual(second);
    // Anchored to the month start containing `from`, not to "today". The
    // first block (Mar 1–14) overlaps the span, so it is kept.
    expect(first[0].startDate).toBe("2026-03-01");
    expect(first[0].endDate).toBe("2026-03-14");
  });

  it("does not emit blocks that end before the span starts", () => {
    const periods = planPeriods("2026-03-20", "2026-03-25", "biweekly");
    expect(periods.every((p) => p.endDate >= "2026-03-20")).toBe(true);
  });
});

describe("planPeriods: custom", () => {
  it("makes exactly one period and invents no cadence", () => {
    const periods = planPeriods("2026-01-07", "2026-02-19", "custom");
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      periodType: "custom",
      startDate: "2026-01-07",
      endDate: "2026-02-19",
    });
  });
});

describe("planPeriods: guards", () => {
  it("returns nothing when the span is inverted", () => {
    expect(planPeriods("2026-03-01", "2026-01-01", "monthly")).toEqual([]);
  });

  it("caps pathological spans rather than generating thousands", () => {
    const periods = planPeriods("2000-01-01", "2030-01-01", "monthly");
    expect(periods.length).toBe(MAX_PLANNED_PERIODS);
  });

  it("rejects values that are not ISO dates", () => {
    expect(() => planPeriods("1 Mar 2026", "2026-03-02", "monthly")).toThrow();
  });
});

describe("describePlan", () => {
  it("summarizes an empty, single, and multi-period plan", () => {
    expect(describePlan([])).toBe("No periods needed.");
    expect(describePlan(planPeriods("2026-01-05", "2026-01-06", "monthly"))).toBe(
      "1 period: January 2026"
    );
    expect(describePlan(planPeriods("2026-01-05", "2026-03-06", "monthly"))).toBe(
      "3 periods: January 2026 through March 2026"
    );
  });
});
