import { describe, expect, it } from "vitest";
import {
  growthBp,
  mean,
  median,
  MetricMathError,
  perHour,
  perUnit,
  ratioBp,
  roundRatio,
} from "@/lib/intelligence/shared/math";

describe("roundRatio", () => {
  it("rounds half away from zero, both signs", () => {
    expect(roundRatio(5, 2)).toBe(3);
    expect(roundRatio(-5, 2)).toBe(-3);
    expect(roundRatio(49, 100)).toBe(0);
    expect(roundRatio(50, 100)).toBe(1);
    expect(roundRatio(-50, 100)).toBe(-1);
  });
  it("rejects invalid input", () => {
    expect(() => roundRatio(1.5, 2)).toThrow(MetricMathError);
    expect(() => roundRatio(1, 0)).toThrow(MetricMathError);
  });
});

describe("ratios and rates", () => {
  it("ratioBp returns basis points and null on zero denominator", () => {
    expect(ratioBp(1, 4)).toBe(2500);
    expect(ratioBp(2, 3)).toBe(6667);
    expect(ratioBp(0, 5)).toBe(0);
    expect(ratioBp(5, 0)).toBeNull();
  });
  it("perUnit and perHour handle exact and undefined cases", () => {
    expect(perUnit(10175, 2)).toBe(5088); // 5087.5 → away from zero
    expect(perUnit(100, 0)).toBeNull();
    expect(perHour(8200, 120)).toBe(4100);
    expect(perHour(1000, 90)).toBe(667);
    expect(perHour(1000, 0)).toBeNull();
  });
});

describe("mean and median", () => {
  it("mean rounds and returns null on empty", () => {
    expect(mean([60, 30])).toBe(45);
    expect(mean([1, 2])).toBe(2); // 1.5 away from zero
    expect(mean([])).toBeNull();
  });
  it("median handles odd, even, and empty", () => {
    expect(median([30, 60, 90])).toBe(60);
    expect(median([30, 60])).toBe(45);
    expect(median([30, 61])).toBe(46); // 45.5 → 46
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
  });
});

describe("growthBp", () => {
  it("computes signed growth in basis points of previous", () => {
    expect(growthBp(150, 100)).toBe(5000);
    expect(growthBp(50, 100)).toBe(-5000);
    expect(growthBp(100, 100)).toBe(0);
  });
  it("is undefined (null) from zero or missing previous", () => {
    expect(growthBp(100, 0)).toBeNull();
    expect(growthBp(100, null)).toBeNull();
    expect(growthBp(null, 100)).toBeNull();
  });
  it("uses |previous| so negative bases keep direction", () => {
    expect(growthBp(-50, -100)).toBe(5000); // improved by half
  });
});
