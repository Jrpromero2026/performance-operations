import { describe, expect, it } from "vitest";
import {
  CLOSE_STATUSES,
  CLOSE_STATUS_LABEL,
  canTransition,
  isMutable,
} from "@/lib/close/transitions";

/**
 * TS mirror of app.period_close_transition_guard. The database trigger is
 * authoritative; the live SQL suite (tests/rls/phase7-live-checks.sql)
 * exercises the trigger itself. This matrix keeps the mirror honest.
 */
describe("close transition matrix", () => {
  const allowed: [string, string][] = [
    ["close_review", "ready_to_close"],
    ["close_review", "voided"],
    ["ready_to_close", "close_review"],
    ["ready_to_close", "closing"],
    ["ready_to_close", "voided"],
    ["closing", "closed"],
    ["closing", "ready_to_close"],
    ["closed", "superseded"],
  ];

  it("permits exactly the documented transitions", () => {
    for (const from of CLOSE_STATUSES) {
      for (const to of CLOSE_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("terminal states permit nothing", () => {
    for (const to of CLOSE_STATUSES) {
      expect(canTransition("superseded", to)).toBe(false);
      expect(canTransition("voided", to)).toBe(false);
    }
  });

  it("never allows skipping straight to closed", () => {
    expect(canTransition("close_review", "closed")).toBe(false);
    expect(canTransition("close_review", "closing")).toBe(false);
  });

  it("closing can abort back to ready_to_close but never to review", () => {
    expect(canTransition("closing", "ready_to_close")).toBe(true);
    expect(canTransition("closing", "close_review")).toBe(false);
    expect(canTransition("closing", "voided")).toBe(false);
  });

  it("rejects unknown statuses without throwing", () => {
    expect(canTransition("bogus", "closed")).toBe(false);
    expect(canTransition("close_review", "bogus")).toBe(false);
  });

  it("marks only pre-approval statuses as mutable", () => {
    expect(CLOSE_STATUSES.filter(isMutable)).toEqual([
      "close_review",
      "ready_to_close",
    ]);
  });

  it("labels every status", () => {
    for (const status of CLOSE_STATUSES) {
      expect(CLOSE_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});
