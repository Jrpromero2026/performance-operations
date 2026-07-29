import { describe, expect, it } from "vitest";
import {
  applyRateRounded,
  minutesTimesHourlyRate,
  roundRational,
  RoundingError,
} from "@/lib/payroll/rounding";

describe("roundRational", () => {
  it("returns exact quotients unchanged for every method", () => {
    for (const method of [
      "half_away_from_zero",
      "half_up",
      "half_even",
      "floor",
      "ceiling",
      "truncate",
    ] as const) {
      expect(roundRational(100, 4, method)).toBe(25);
      expect(roundRational(-100, 4, method)).toBe(-25);
      expect(roundRational(0, 7, method)).toBe(0);
    }
  });

  it("half_away_from_zero rounds ties away from zero", () => {
    expect(roundRational(5, 2, "half_away_from_zero")).toBe(3);
    expect(roundRational(-5, 2, "half_away_from_zero")).toBe(-3);
    expect(roundRational(3, 2, "half_away_from_zero")).toBe(2);
    expect(roundRational(-3, 2, "half_away_from_zero")).toBe(-2);
    expect(roundRational(49, 100, "half_away_from_zero")).toBe(0);
    expect(roundRational(50, 100, "half_away_from_zero")).toBe(1);
  });

  it("half_up rounds ties toward positive infinity", () => {
    expect(roundRational(5, 2, "half_up")).toBe(3);
    expect(roundRational(-5, 2, "half_up")).toBe(-2);
  });

  it("half_even rounds ties to the even neighbor", () => {
    expect(roundRational(5, 2, "half_even")).toBe(2);
    expect(roundRational(7, 2, "half_even")).toBe(4);
    expect(roundRational(-5, 2, "half_even")).toBe(-2);
    expect(roundRational(-7, 2, "half_even")).toBe(-4);
    expect(roundRational(51, 2, "half_even")).toBe(26);
  });

  it("floor, ceiling, truncate behave on negatives", () => {
    expect(roundRational(-7, 2, "floor")).toBe(-4);
    expect(roundRational(-7, 2, "ceiling")).toBe(-3);
    expect(roundRational(-7, 2, "truncate")).toBe(-3);
    expect(roundRational(7, 2, "floor")).toBe(3);
    expect(roundRational(7, 2, "ceiling")).toBe(4);
  });

  it("rejects non-integer and non-positive denominators", () => {
    expect(() => roundRational(1.5, 2, "floor")).toThrow(RoundingError);
    expect(() => roundRational(1, 0, "floor")).toThrow(RoundingError);
    expect(() => roundRational(1, -2, "floor")).toThrow(RoundingError);
  });
});

describe("applyRateRounded", () => {
  it("computes percentage splits exactly", () => {
    // $85.00 at 55% = $46.75 exactly.
    expect(applyRateRounded(8500, 5500, "half_away_from_zero")).toBe(4675);
    // $99.99 at 60% = $59.994 → rounds to $59.99.
    expect(applyRateRounded(9999, 6000, "half_away_from_zero")).toBe(5999);
    // $0.01 at 50% = half a cent → away from zero = 1 cent.
    expect(applyRateRounded(1, 5000, "half_away_from_zero")).toBe(1);
    expect(applyRateRounded(1, 5000, "half_even")).toBe(0);
  });
});

describe("minutesTimesHourlyRate", () => {
  it("prorates partial hours without floats", () => {
    // 90 minutes at $20/h = $30.00.
    expect(minutesTimesHourlyRate(90, 2000, "half_away_from_zero")).toBe(3000);
    // 50 minutes at $17.50/h = 1750*50/60 = 1458.33... → 1458.
    expect(minutesTimesHourlyRate(50, 1750, "half_away_from_zero")).toBe(1458);
    // 1 minute at $0.30/h = 0.5 cents → 1 cent away from zero.
    expect(minutesTimesHourlyRate(1, 30, "half_away_from_zero")).toBe(1);
  });

  it("rejects negative minutes", () => {
    expect(() => minutesTimesHourlyRate(-5, 2000, "floor")).toThrow(RoundingError);
  });
});
