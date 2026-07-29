import { describe, expect, it } from "vitest";
import {
  criteriaConstrainsStatus,
  evaluateEligibility,
  parseCriteria,
  type EligibilityContext,
} from "@/lib/payroll/eligibility";

const context: EligibilityContext = {
  canonical_status: "completed",
  service_id: "svc-1",
  department_id: "dept-1",
  duration_minutes: 60,
  participant_count: 1,
  payment_status: "paid",
};

describe("parseCriteria", () => {
  it("accepts empty criteria", () => {
    expect(parseCriteria({})).toEqual({ conditions: [] });
    expect(parseCriteria(null)).toEqual({ conditions: [] });
  });

  it("rejects unknown keys, fields, and operators", () => {
    expect(parseCriteria({ extra: true })).toHaveProperty("error");
    expect(
      parseCriteria({ conditions: [{ field: "made_up", op: "eq", value: "x" }] }),
    ).toHaveProperty("error");
    expect(
      parseCriteria({
        conditions: [{ field: "canonical_status", op: "matches", value: "x" }],
      }),
    ).toHaveProperty("error");
    expect(parseCriteria("completed")).toHaveProperty("error");
    expect(parseCriteria({ conditions: "completed" })).toHaveProperty("error");
  });
});

describe("evaluateEligibility", () => {
  it("passes when all conditions hold", () => {
    expect(
      evaluateEligibility(
        {
          conditions: [
            { field: "canonical_status", op: "in", value: ["completed"] },
            { field: "duration_minutes", op: "gte", value: 30 },
          ],
        },
        context,
      ),
    ).toEqual({ result: "eligible" });
  });

  it("returns ineligible with the failing condition", () => {
    const outcome = evaluateEligibility(
      { conditions: [{ field: "canonical_status", op: "in", value: ["completed"] }] },
      { ...context, canonical_status: "cancelled" },
    );
    expect(outcome.result).toBe("ineligible");
  });

  it("fails closed on malformed criteria instead of paying", () => {
    expect(
      evaluateEligibility({ conditions: [{ field: "canonical_status", op: "gte", value: 3 }] }, context)
        .result,
    ).toBe("blocked");
    expect(
      evaluateEligibility(
        { conditions: [{ field: "duration_minutes", op: "eq", value: "60" }] },
        context,
      ).result,
    ).toBe("blocked");
    expect(
      evaluateEligibility(
        { conditions: [{ field: "canonical_status", op: "in", value: [] }] },
        context,
      ).result,
    ).toBe("blocked");
    expect(evaluateEligibility("junk", context).result).toBe("blocked");
  });

  it("supports not_in and neq exclusions", () => {
    expect(
      evaluateEligibility(
        { conditions: [{ field: "canonical_status", op: "not_in", value: ["no_show"] }] },
        context,
      ),
    ).toEqual({ result: "eligible" });
    expect(
      evaluateEligibility(
        { conditions: [{ field: "service_id", op: "neq", value: "svc-1" }] },
        context,
      ).result,
    ).toBe("ineligible");
  });
});

describe("criteriaConstrainsStatus", () => {
  it("detects explicit status constraints", () => {
    expect(
      criteriaConstrainsStatus({
        conditions: [{ field: "canonical_status", op: "in", value: ["completed"] }],
      }),
    ).toBe(true);
    expect(
      criteriaConstrainsStatus({
        conditions: [{ field: "canonical_status", op: "eq", value: "completed" }],
      }),
    ).toBe(true);
  });

  it("treats missing/negative-only status constraints as unconstrained", () => {
    expect(criteriaConstrainsStatus({})).toBe(false);
    expect(
      criteriaConstrainsStatus({
        conditions: [{ field: "canonical_status", op: "not_in", value: ["no_show"] }],
      }),
    ).toBe(false);
    expect(
      criteriaConstrainsStatus({
        conditions: [{ field: "service_id", op: "eq", value: "svc-1" }],
      }),
    ).toBe(false);
  });
});
