import { describe, expect, it } from "vitest";
import {
  assertIsoDate,
  DateRangeError,
  daysInRange,
  isActiveOn,
  isDateInRange,
  makeRange,
  monthRangeOf,
  rangesOverlap,
  semiMonthlyRangesOf,
} from "@/lib/dates/date-range";

describe("assertIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(() => assertIsoDate("2026-07-28")).not.toThrow();
    expect(() => assertIsoDate("2024-02-29")).not.toThrow(); // leap day
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => assertIsoDate("2026-7-28")).toThrow(DateRangeError);
    expect(() => assertIsoDate("07/28/2026")).toThrow(DateRangeError);
    expect(() => assertIsoDate("2026-02-30")).toThrow(DateRangeError);
    expect(() => assertIsoDate("2025-02-29")).toThrow(DateRangeError); // not a leap year
    expect(() => assertIsoDate("")).toThrow(DateRangeError);
  });
});

describe("makeRange / isDateInRange", () => {
  it("builds inclusive ranges and checks membership", () => {
    const range = makeRange("2026-07-01", "2026-07-31");
    expect(isDateInRange("2026-07-01", range)).toBe(true);
    expect(isDateInRange("2026-07-31", range)).toBe(true);
    expect(isDateInRange("2026-08-01", range)).toBe(false);
    expect(isDateInRange("2026-06-30", range)).toBe(false);
  });

  it("allows single-day ranges and rejects inverted ones", () => {
    expect(makeRange("2026-07-01", "2026-07-01")).toBeTruthy();
    expect(() => makeRange("2026-07-02", "2026-07-01")).toThrow(DateRangeError);
  });
});

describe("rangesOverlap (reporting-period integrity)", () => {
  const july = makeRange("2026-07-01", "2026-07-31");

  it("detects overlaps including single shared days", () => {
    expect(rangesOverlap(july, makeRange("2026-07-31", "2026-08-15"))).toBe(true);
    expect(rangesOverlap(july, makeRange("2026-06-15", "2026-07-01"))).toBe(true);
    expect(rangesOverlap(july, makeRange("2026-07-10", "2026-07-20"))).toBe(true);
  });

  it("reports adjacent periods as non-overlapping", () => {
    expect(rangesOverlap(july, makeRange("2026-08-01", "2026-08-31"))).toBe(false);
    expect(rangesOverlap(july, makeRange("2026-06-01", "2026-06-30"))).toBe(false);
  });
});

describe("daysInRange", () => {
  it("counts inclusive days", () => {
    expect(daysInRange(makeRange("2026-07-01", "2026-07-31"))).toBe(31);
    expect(daysInRange(makeRange("2026-07-01", "2026-07-01"))).toBe(1);
    expect(daysInRange(makeRange("2024-02-01", "2024-02-29"))).toBe(29);
  });
});

describe("month and semi-monthly period helpers", () => {
  it("computes the containing calendar month", () => {
    expect(monthRangeOf("2026-07-28")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
    expect(monthRangeOf("2024-02-10")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });

  it("computes semi-monthly halves", () => {
    const [first, second] = semiMonthlyRangesOf("2026-07-28");
    expect(first).toEqual({ start: "2026-07-01", end: "2026-07-15" });
    expect(second).toEqual({ start: "2026-07-16", end: "2026-07-31" });
  });
});

describe("isActiveOn (effective dating)", () => {
  it("applies effective_from/effective_to semantics", () => {
    expect(isActiveOn("2026-07-28", "2026-01-01", null)).toBe(true);
    expect(isActiveOn("2026-07-28", "2026-01-01", "2026-07-28")).toBe(true);
    expect(isActiveOn("2026-07-29", "2026-01-01", "2026-07-28")).toBe(false);
    expect(isActiveOn("2025-12-31", "2026-01-01", null)).toBe(false);
  });

  it("evaluates as-of the service date, not today", () => {
    // A compensation assignment that ended in March must still be active
    // when evaluating a February service date.
    expect(isActiveOn("2026-02-15", "2026-01-01", "2026-03-31")).toBe(true);
  });
});
