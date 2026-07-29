import { describe, expect, it } from "vitest";
import {
  daysBetweenInclusive,
  generateBuckets,
  previousPeriodRange,
  previousYearRange,
  shiftDays,
} from "@/lib/intelligence/trends/engine";

describe("date primitives", () => {
  it("shiftDays crosses month and year boundaries", () => {
    expect(shiftDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });
  it("daysBetweenInclusive counts both endpoints", () => {
    expect(daysBetweenInclusive("2026-07-01", "2026-07-01")).toBe(1);
    expect(daysBetweenInclusive("2026-07-01", "2026-07-31")).toBe(31);
    expect(daysBetweenInclusive("2026-02-01", "2026-03-01")).toBe(29);
  });
});

describe("generateBuckets", () => {
  it("daily buckets cover every date", () => {
    const buckets = generateBuckets("2026-07-30", "2026-08-02", "daily");
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
  it("weekly buckets are ISO weeks clamped to the range", () => {
    // 2026-07-01 is a Wednesday; ISO week starts Monday 2026-06-29.
    const buckets = generateBuckets("2026-07-01", "2026-07-14", "weekly");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].dateFrom).toBe("2026-07-01"); // clamped
    expect(buckets[0].dateTo).toBe("2026-07-05");
    expect(buckets[1].dateFrom).toBe("2026-07-06");
    expect(buckets[1].dateTo).toBe("2026-07-12");
    expect(buckets[2].dateTo).toBe("2026-07-14"); // clamped
  });
  it("monthly buckets clamp partial edge months", () => {
    const buckets = generateBuckets("2026-07-10", "2026-09-05", "monthly");
    expect(buckets.map((b) => b.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(buckets[0].dateFrom).toBe("2026-07-10");
    expect(buckets[0].dateTo).toBe("2026-07-31");
    expect(buckets[2].dateTo).toBe("2026-09-05");
  });
  it("quarterly and yearly bucket correctly", () => {
    const quarters = generateBuckets("2026-02-01", "2026-08-31", "quarterly");
    expect(quarters.map((b) => b.key)).toEqual(["2026-Q1", "2026-Q2", "2026-Q3"]);
    const years = generateBuckets("2025-11-01", "2026-02-01", "yearly");
    expect(years.map((b) => b.key)).toEqual(["2025", "2026"]);
  });
  it("returns empty for inverted ranges", () => {
    expect(generateBuckets("2026-07-02", "2026-07-01", "daily")).toEqual([]);
  });
});

describe("comparison ranges", () => {
  it("previous period is the equal-length window immediately before", () => {
    expect(previousPeriodRange("2026-07-01", "2026-07-31")).toEqual({
      dateFrom: "2026-05-31",
      dateTo: "2026-06-30",
    });
    expect(previousPeriodRange("2026-07-10", "2026-07-10")).toEqual({
      dateFrom: "2026-07-09",
      dateTo: "2026-07-09",
    });
  });
  it("previous year keeps the calendar range and clamps Feb 29", () => {
    expect(previousYearRange("2026-07-01", "2026-07-31")).toEqual({
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });
    expect(previousYearRange("2024-02-29", "2024-02-29")).toEqual({
      dateFrom: "2023-02-28",
      dateTo: "2023-02-28",
    });
  });
});
