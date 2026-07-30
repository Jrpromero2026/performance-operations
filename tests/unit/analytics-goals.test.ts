import { describe, expect, it } from "vitest";
import {
  deriveGoalProgress,
  goalTimeElapsedBp,
  type GoalFacts,
} from "@/lib/analytics/goals/progress";
import type { MetricResult } from "@/lib/intelligence/shared/types";

const TODAY = "2026-07-15";

function goal(overrides: Partial<GoalFacts> = {}): GoalFacts {
  return {
    goalType: "minimum",
    metricId: "appointments_completed",
    metricVersion: "intel-v1",
    metricUnit: "count",
    targetValue: 100,
    targetLow: null,
    targetHigh: null,
    baselineValue: null,
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    status: "active",
    ...overrides,
  };
}

function result(value: number | null, health = "healthy"): MetricResult {
  return {
    metricId: "appointments_completed",
    scope: { organizationId: "org" },
    filters: { dateFrom: "2026-07-01", dateTo: "2026-07-31" },
    value,
    unit: "count",
    health: health as MetricResult["health"],
    reasons: value === null ? ["No data."] : [],
    warnings: [],
    metadata: {},
    dependencies: [],
    calculatedAt: "2026-07-15T00:00:00Z",
    version: "intel-v1",
  };
}

describe("goal progress derivation", () => {
  it("minimum target: met, exceeded, in_progress, missed", () => {
    expect(deriveGoalProgress(goal(), result(100), TODAY).status).toBe("met");
    expect(deriveGoalProgress(goal(), result(150), TODAY).status).toBe("exceeded");
    expect(deriveGoalProgress(goal(), result(40), TODAY).status).toBe("in_progress");
    expect(deriveGoalProgress(goal(), result(40), "2026-08-01").status).toBe("missed");
  });

  it("maximum target: staying under the cap is met/exceeded", () => {
    const g = goal({ goalType: "maximum", targetValue: 10 });
    expect(deriveGoalProgress(g, result(10), TODAY).status).toBe("met");
    expect(deriveGoalProgress(g, result(4), TODAY).status).toBe("exceeded");
    expect(deriveGoalProgress(g, result(14), "2026-08-01").status).toBe("missed");
  });

  it("exact target: only equality meets", () => {
    const g = goal({ goalType: "exact", targetValue: 50 });
    expect(deriveGoalProgress(g, result(50), TODAY).status).toBe("met");
    expect(deriveGoalProgress(g, result(51), TODAY).status).toBe("in_progress");
    expect(deriveGoalProgress(g, result(51), "2026-08-02").status).toBe("missed");
  });

  it("range target: inside the band meets", () => {
    const g = goal({ goalType: "range", targetValue: null, targetLow: 40, targetHigh: 60 });
    expect(deriveGoalProgress(g, result(45), TODAY).status).toBe("met");
    expect(deriveGoalProgress(g, result(70), TODAY).status).toBe("in_progress");
  });

  it("maintain target: at-or-above the pinned baseline target", () => {
    const g = goal({ goalType: "maintain", targetValue: 80, baselineValue: 80 });
    expect(deriveGoalProgress(g, result(80), TODAY).status).toBe("met");
    expect(deriveGoalProgress(g, result(79), "2026-08-01").status).toBe("missed");
  });

  it("improvement target: signed delta vs baseline (both directions)", () => {
    const up = goal({ goalType: "improvement", targetValue: 10, baselineValue: 100 });
    expect(deriveGoalProgress(up, result(110), TODAY).status).toBe("met");
    expect(deriveGoalProgress(up, result(115), TODAY).status).toBe("exceeded");
    const down = goal({ goalType: "improvement", targetValue: -5, baselineValue: 100 });
    expect(deriveGoalProgress(down, result(95), TODAY).status).toBe("met");
    expect(deriveGoalProgress(down, result(90), TODAY).status).toBe("exceeded");
    expect(deriveGoalProgress(down, result(99), TODAY).status).toBe("in_progress");
  });

  it("an unavailable metric result NEVER counts as achieved", () => {
    const progress = deriveGoalProgress(goal(), result(null, "waiting_for_imports"), TODAY);
    expect(progress.status).toBe("unavailable");
    expect(progress.reason).toBeTruthy();
    const ended = deriveGoalProgress(goal(), result(null, "unavailable"), "2026-08-05");
    expect(ended.status).toBe("unavailable"); // not "missed" — no evidence either way
  });

  it("blocks goals whose pinned metric version drifted from the catalog", () => {
    const progress = deriveGoalProgress(
      goal({ metricVersion: "intel-v0" }),
      result(120),
      TODAY,
    );
    expect(progress.status).toBe("blocked");
    expect(progress.reason).toContain("version");
  });

  it("blocks goals whose pinned unit drifted from the catalog", () => {
    const progress = deriveGoalProgress(goal({ metricUnit: "cents" }), result(120), TODAY);
    expect(progress.status).toBe("blocked");
  });

  it("not_started before the window opens", () => {
    expect(deriveGoalProgress(goal(), result(0), "2026-06-30").status).toBe("not_started");
  });

  it("derives gap and percent-to-target only when valid", () => {
    const progress = deriveGoalProgress(goal(), result(80), TODAY);
    expect(progress.absoluteGap).toBe(-20);
    expect(progress.percentToTargetBp).toBe(8_000);
    const zeroTarget = deriveGoalProgress(goal({ targetValue: 0 }), result(5), TODAY);
    expect(zeroTarget.percentToTargetBp).toBeNull(); // zero denominator refused
  });

  it("on-track rule is the prorated cumulative minimum — nothing else", () => {
    // 2026-07-15 is day 15 of 31 → elapsed 4839bp → expected floor(100*0.4839)=48.
    const behind = deriveGoalProgress(goal(), result(40), TODAY);
    expect(behind.onTrack).toBe(false);
    const ahead = deriveGoalProgress(goal(), result(48), TODAY);
    expect(ahead.onTrack).toBe(true);
    // Only minimum goals get an on-track signal; others stay null.
    const exact = deriveGoalProgress(goal({ goalType: "exact", targetValue: 50 }), result(50), TODAY);
    expect(exact.onTrack).toBeNull();
    // After the window ends there is nothing to be "on track" for.
    const ended = deriveGoalProgress(goal(), result(120), "2026-08-01");
    expect(ended.onTrack).toBeNull();
  });

  it("time elapsed clamps to the goal window", () => {
    expect(goalTimeElapsedBp(goal(), "2026-06-01")).toBe(0);
    expect(goalTimeElapsedBp(goal(), "2026-07-31")).toBe(10_000);
    expect(goalTimeElapsedBp(goal(), "2026-09-01")).toBe(10_000);
    const mid = goalTimeElapsedBp(goal(), TODAY);
    expect(mid).toBeGreaterThan(4_500);
    expect(mid).toBeLessThan(5_100);
  });
});
