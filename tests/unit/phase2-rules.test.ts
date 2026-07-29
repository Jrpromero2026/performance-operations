import { describe, expect, it } from "vitest";
import {
  computeGrantableRoles,
  type MembershipGrant,
} from "@/lib/authz/authz";
import {
  canTransitionPeriod,
  periodsConflict,
  transitionRequiresReopen,
} from "@/lib/schemas/period-rules";
import { validateTier, validateTierSet } from "@/lib/compensation/tiers";
import {
  formatBasisPoints,
  MoneyError,
  parseBasisPoints,
} from "@/lib/money/money";

const ORG = "org-1";
const ROLES = [
  { id: "r1", key: "platform_admin" },
  { id: "r2", key: "workspace_admin" },
  { id: "r3", key: "payroll_manager" },
  { id: "r4", key: "trainer" },
];

function grant(roleKey: MembershipGrant["roleKey"], org = ORG): MembershipGrant {
  return { organizationId: org, roleKey, isDefault: false };
}

describe("role-grant escalation prevention", () => {
  it("platform admins may grant every role", () => {
    const grantable = computeGrantableRoles([grant("platform_admin")], ORG, ROLES);
    expect(grantable).toHaveLength(4);
  });

  it("workspace admins may grant everything except platform_admin", () => {
    const grantable = computeGrantableRoles([grant("workspace_admin")], ORG, ROLES);
    expect(grantable.map((r) => r.key)).not.toContain("platform_admin");
    expect(grantable.map((r) => r.key)).toContain("workspace_admin");
  });

  it("payroll managers cannot grant anything (no member:manage)", () => {
    expect(computeGrantableRoles([grant("payroll_manager")], ORG, ROLES)).toEqual([]);
  });

  it("department managers, trainers, and viewers grant nothing", () => {
    for (const role of ["department_manager", "trainer", "viewer"] as const) {
      expect(computeGrantableRoles([grant(role)], ORG, ROLES)).toEqual([]);
    }
  });

  it("management rights never leak across organizations", () => {
    const grantable = computeGrantableRoles(
      [grant("workspace_admin", "other-org")],
      ORG,
      ROLES
    );
    expect(grantable).toEqual([]);
  });

  it("no memberships means nothing is grantable (deny by default)", () => {
    expect(computeGrantableRoles([], ORG, ROLES)).toEqual([]);
  });
});

describe("reporting-period status machine", () => {
  it("permits only the documented transitions", () => {
    expect(canTransitionPeriod("draft", "open")).toBe(true);
    expect(canTransitionPeriod("open", "closed")).toBe(true);
    expect(canTransitionPeriod("closed", "open")).toBe(true);
    expect(canTransitionPeriod("closed", "locked")).toBe(true);
    expect(canTransitionPeriod("locked", "closed")).toBe(true);
  });

  it("denies illegal jumps", () => {
    expect(canTransitionPeriod("open", "locked")).toBe(false);
    expect(canTransitionPeriod("locked", "open")).toBe(false);
    expect(canTransitionPeriod("draft", "locked")).toBe(false);
    expect(canTransitionPeriod("open", "open")).toBe(false);
    expect(canTransitionPeriod("bogus", "open")).toBe(false);
  });

  it("touching a locked period requires reopen authority", () => {
    expect(transitionRequiresReopen("locked")).toBe(true);
    expect(transitionRequiresReopen("open")).toBe(false);
    expect(transitionRequiresReopen("closed")).toBe(false);
  });
});

describe("period same-type overlap rule", () => {
  const monthlyJuly = { periodType: "monthly", start: "2026-07-01", end: "2026-07-31" };

  it("rejects overlapping periods of the same type", () => {
    expect(
      periodsConflict(monthlyJuly, {
        periodType: "monthly",
        start: "2026-07-15",
        end: "2026-08-14",
      })
    ).toBe(true);
  });

  it("allows different types over the same dates (documented rule)", () => {
    expect(
      periodsConflict(monthlyJuly, {
        periodType: "semi_monthly",
        start: "2026-07-01",
        end: "2026-07-15",
      })
    ).toBe(false);
  });

  it("allows adjacent same-type periods", () => {
    expect(
      periodsConflict(monthlyJuly, {
        periodType: "monthly",
        start: "2026-08-01",
        end: "2026-08-31",
      })
    ).toBe(false);
  });
});

describe("basis-point parsing (no floating point)", () => {
  it("parses whole and fractional percentages exactly", () => {
    expect(parseBasisPoints("50")).toBe(5000);
    expect(parseBasisPoints("55")).toBe(5500);
    expect(parseBasisPoints("50.25")).toBe(5025);
    expect(parseBasisPoints("0.01")).toBe(1);
    expect(parseBasisPoints("100")).toBe(10000);
    expect(parseBasisPoints("33.3%")).toBe(3330);
  });

  it("rejects malformed and out-of-range values", () => {
    expect(() => parseBasisPoints("100.01")).toThrow(MoneyError);
    expect(() => parseBasisPoints("-5")).toThrow(MoneyError);
    expect(() => parseBasisPoints("50.123")).toThrow(MoneyError);
    expect(() => parseBasisPoints("abc")).toThrow(MoneyError);
    expect(() => parseBasisPoints("")).toThrow(MoneyError);
  });

  it("formats basis points for display", () => {
    expect(formatBasisPoints(5000)).toBe("50%");
    expect(formatBasisPoints(5025)).toBe("50.25%");
    expect(formatBasisPoints(5550)).toBe("55.5%");
    expect(formatBasisPoints(1)).toBe("0.01%");
  });
});

describe("commission tier validation", () => {
  const tier = (
    sequence: number,
    min: number,
    max: number | null,
    rate: number
  ) => ({
    sequence,
    minRevenueCents: min,
    maxRevenueCents: max,
    rateBasisPoints: rate,
  });

  it("accepts a well-formed marginal tier ladder", () => {
    expect(
      validateTierSet([
        tier(1, 0, 1_000_000, 5000),
        tier(2, 1_000_000, 2_000_000, 5500),
        tier(3, 2_000_000, null, 6000),
      ])
    ).toBeNull();
  });

  it("rejects non-integer cents and out-of-range rates", () => {
    expect(validateTier(tier(1, 10.5, null, 5000))).toMatch(/integer/);
    expect(validateTier(tier(1, 0, null, 10001))).toMatch(/basis points/);
    expect(validateTier(tier(1, 0, null, -1))).toMatch(/basis points/);
    expect(validateTier(tier(1, -100, null, 5000))).toMatch(/non-negative/);
  });

  it("rejects inverted ranges and duplicate sequences", () => {
    expect(validateTier(tier(1, 5000, 4000, 5000))).toMatch(/greater than/);
    expect(
      validateTierSet([tier(1, 0, 1000, 5000), tier(1, 1000, null, 5500)])
    ).toMatch(/unique/);
  });

  it("rejects overlapping revenue ranges", () => {
    expect(
      validateTierSet([tier(1, 0, 1_000_000, 5000), tier(2, 999_999, null, 5500)])
    ).toMatch(/overlap/);
  });

  it("rejects out-of-order revenue coverage", () => {
    expect(
      validateTierSet([tier(1, 1_000_000, 2_000_000, 5000), tier(2, 0, 999_999, 5500)])
    ).toMatch(/increasing/);
  });
});
