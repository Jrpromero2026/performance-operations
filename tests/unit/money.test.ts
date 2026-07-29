import { describe, expect, it } from "vitest";
import {
  addCents,
  applyBasisPoints,
  formatCents,
  MoneyError,
  multiplyCents,
  parseCents,
  splitCents,
  subtractCents,
} from "@/lib/money/money";

describe("integer-cent arithmetic", () => {
  it("adds and subtracts exactly", () => {
    expect(addCents(1050, 2575, 99)).toBe(3724);
    expect(subtractCents(10000, 3333)).toBe(6667);
    expect(addCents()).toBe(0);
  });

  it("rejects non-integer amounts (no floating point money)", () => {
    expect(() => addCents(10.5)).toThrow(MoneyError);
    expect(() => subtractCents(100, 0.1)).toThrow(MoneyError);
    expect(() => multiplyCents(100.01, 2)).toThrow(MoneyError);
    expect(() => applyBasisPoints(100, 3500.5)).toThrow(MoneyError);
  });

  it("multiplies rate by session count", () => {
    // 12 sessions at $45.00
    expect(multiplyCents(4500, 12)).toBe(54000);
    expect(multiplyCents(4500, 0)).toBe(0);
    expect(() => multiplyCents(4500, -1)).toThrow(MoneyError);
    expect(() => multiplyCents(4500, 1.5)).toThrow(MoneyError);
  });
});

describe("applyBasisPoints (commission math)", () => {
  it("computes exact percentages", () => {
    // 35% of $100.00
    expect(applyBasisPoints(10000, 3500)).toBe(3500);
    // 50% of $0.01 rounds half-up to $0.01
    expect(applyBasisPoints(1, 5000)).toBe(1);
    // 49.99% of $0.01 rounds down to $0.00
    expect(applyBasisPoints(1, 4999)).toBe(0);
  });

  it("avoids the classic float error (0.1 + 0.2 style cases)", () => {
    // 10% of $0.29 = 2.9 cents → 3 cents half-up; floats would give 2.9000000000000004
    expect(applyBasisPoints(29, 1000)).toBe(3);
    // 21.5% of $87.34
    expect(applyBasisPoints(8734, 2150)).toBe(1878);
  });

  it("handles negative amounts symmetrically (adjustments/refunds)", () => {
    expect(applyBasisPoints(-10000, 3500)).toBe(-3500);
    expect(applyBasisPoints(-29, 1000)).toBe(-3);
  });

  it("rejects negative rates", () => {
    expect(() => applyBasisPoints(100, -100)).toThrow(MoneyError);
  });
});

describe("splitCents", () => {
  it("splits without losing a cent", () => {
    expect(splitCents(100, 3)).toEqual([34, 33, 33]);
    expect(splitCents(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitCents(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it("splits negative amounts without losing a cent", () => {
    const shares = splitCents(-100, 3);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(-100);
  });

  it("rejects zero or negative part counts", () => {
    expect(() => splitCents(100, 0)).toThrow(MoneyError);
  });
});

describe("formatting and parsing", () => {
  it("formats cents as currency", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-5)).toBe("-$0.05");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("parses currency strings to cents", () => {
    expect(parseCents("$1,234.56")).toBe(123456);
    expect(parseCents("45")).toBe(4500);
    expect(parseCents("45.5")).toBe(4550);
    expect(parseCents("-12.34")).toBe(-1234);
  });

  it("round-trips parse(format(x))", () => {
    for (const cents of [0, 1, 99, 100, 123456, -978]) {
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });

  it("rejects malformed money strings", () => {
    expect(() => parseCents("12.345")).toThrow(MoneyError);
    expect(() => parseCents("abc")).toThrow(MoneyError);
    expect(() => parseCents("")).toThrow(MoneyError);
    expect(() => parseCents("1.2.3")).toThrow(MoneyError);
  });
});
