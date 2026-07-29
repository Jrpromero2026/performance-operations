import { describe, expect, it } from "vitest";
import { calculatePayroll } from "@/lib/payroll/engine";
import type {
  EngineAppointment,
  EngineInput,
  EnginePlanAssignment,
  EnginePlanVersion,
  EngineRule,
} from "@/lib/payroll/types";

/* --------------------------------------------------------------- builders */

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

const completedOnly = {
  conditions: [{ field: "canonical_status", op: "in", value: ["completed"] }],
};

function rule(overrides: Partial<EngineRule> & Pick<EngineRule, "ruleType">): EngineRule {
  return {
    id: uid("rule"),
    amountCents: null,
    rateBasisPoints: null,
    basisType: null,
    criteria: completedOnly,
    ...overrides,
  };
}

function plan(overrides: Partial<EnginePlanVersion>): EnginePlanVersion {
  return {
    id: uid("plan"),
    planName: "Test Plan",
    method: "percentage_of_revenue",
    tierBehavior: "not_applicable",
    roundingScope: "per_line",
    rules: [],
    tiers: [],
    ...overrides,
  };
}

function assign(
  trainerId: string,
  planVersion: EnginePlanVersion,
  purpose: EnginePlanAssignment["purpose"] = "primary",
): EnginePlanAssignment {
  return { trainerId, purpose, assignmentId: uid("assign"), planVersion };
}

function appointment(
  trainerId: string,
  overrides: Partial<EngineAppointment> = {},
): EngineAppointment {
  const id = overrides.id ?? uid("appt");
  return {
    id,
    serviceId: "svc-pt",
    departmentId: "dept-pt",
    canonicalStatus: "completed",
    startAt: "2026-07-01T10:00:00Z",
    durationMinutes: 60,
    participantCount: 1,
    listedAmountCents: 8500,
    paidAmountCents: 8500,
    paymentStatus: "paid",
    participations: [
      { assignmentId: null, trainerId, role: "primary", compensatedMinutes: null },
    ],
    ...overrides,
  };
}

function engineInput(overrides: Partial<EngineInput>): EngineInput {
  return {
    organizationId: "org-1",
    payrollRunId: "run-1",
    appointments: [],
    planAssignments: [],
    timeEntries: [],
    adjustments: [],
    trainerIds: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ tests */

describe("percentage of revenue (G3-shaped split)", () => {
  const pctPlan = plan({
    method: "percentage_of_revenue",
    rules: [
      rule({
        ruleType: "revenue_rate",
        rateBasisPoints: 5500,
        basisType: "source_listed_amount",
      }),
    ],
  });

  it("pays the split on completed sessions and excludes others transparently", () => {
    const result = calculatePayroll(
      engineInput({
        appointments: [
          appointment("t1", { listedAmountCents: 8500 }),
          appointment("t1", { listedAmountCents: 10000 }),
          appointment("t1", { canonicalStatus: "cancelled", listedAmountCents: 8500 }),
        ],
        planAssignments: [assign("t1", pctPlan)],
      }),
    );

    const trainer = result.trainers[0];
    expect(trainer.calculationStatus).toBe("calculated");
    const calculated = trainer.lines.filter((l) => l.calculationStatus === "calculated");
    const excluded = trainer.lines.filter((l) => l.calculationStatus === "excluded");
    expect(calculated).toHaveLength(2);
    expect(excluded).toHaveLength(1);
    // 55% of 85.00 = 46.75; 55% of 100.00 = 55.00
    expect(trainer.totals.commissionCents).toBe(4675 + 5500);
    expect(trainer.totals.finalGrossCents).toBe(10175);
    expect(trainer.totals.eligibleBasisTotalCents).toBe(18500);
    expect(excluded[0].roundedAmountCents).toBe(0);
    expect(excluded[0].exclusionReason).toContain("canonical_status");
    expect(result.runTotals.finalCompensationCents).toBe(10175);
    expect(result.runTotals.blockingIssueCount).toBe(0);
  });

  it("every calculated line carries a versioned trace", () => {
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1")],
        planAssignments: [assign("t1", pctPlan)],
      }),
    );
    for (const line of result.trainers[0].lines) {
      expect(line.trace.version).toBe("calc-v1");
      expect(line.trace.steps.length).toBeGreaterThan(0);
    }
  });
});

describe("fail-closed configuration policy", () => {
  it("blocks percentage rules without basis_type", () => {
    const badPlan = plan({
      rules: [rule({ ruleType: "revenue_rate", rateBasisPoints: 5500 })], // no basisType
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1")],
        planAssignments: [assign("t1", badPlan)],
      }),
    );
    expect(result.trainers[0].calculationStatus).toBe("blocked");
    expect(result.trainers[0].totals.finalGrossCents).toBe(0);
    expect(result.issues.some((i) => i.code === "basis_type_unresolved")).toBe(true);
  });

  it("blocks rules that do not declare eligible statuses", () => {
    const badPlan = plan({
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5500,
          basisType: "source_listed_amount",
          criteria: {}, // no status constraint → cancellation policy unresolved
        }),
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1")],
        planAssignments: [assign("t1", badPlan)],
      }),
    );
    expect(result.issues.some((i) => i.code === "rule_missing_status_criteria")).toBe(true);
    expect(result.trainers[0].totals.finalGrossCents).toBe(0);
  });

  it("blocks percentage plans without a rounding scope", () => {
    const badPlan = plan({
      roundingScope: null,
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5500,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1")],
        planAssignments: [assign("t1", badPlan)],
      }),
    );
    expect(result.issues.some((i) => i.code === "rounding_scope_unresolved")).toBe(true);
    expect(result.trainers[0].totals.finalGrossCents).toBe(0);
  });

  it("blocks trainers with appointments but no plan", () => {
    const result = calculatePayroll(
      engineInput({ appointments: [appointment("t1")] }),
    );
    expect(
      result.issues.some((i) => i.code === "trainer_missing_compensation_plan"),
    ).toBe(true);
    expect(result.trainers[0].calculationStatus).toBe("blocked");
  });

  it("blocks missing basis amounts on imported rows", () => {
    const pctPlan = plan({
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5500,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1", { listedAmountCents: null })],
        planAssignments: [assign("t1", pctPlan)],
      }),
    );
    expect(result.issues.some((i) => i.code === "missing_basis_amount")).toBe(true);
  });
});

describe("flat per session and hourly", () => {
  it("pays flat session rates", () => {
    const flatPlan = plan({
      method: "flat_per_session",
      rules: [rule({ ruleType: "session_rate", amountCents: 2500 })],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1"), appointment("t1")],
        planAssignments: [assign("t1", flatPlan)],
      }),
    );
    expect(result.trainers[0].totals.flatRateCents).toBe(5000);
    expect(result.trainers[0].totals.finalGrossCents).toBe(5000);
  });

  it("pays hourly sessions honoring compensated-minute overrides", () => {
    const hourlyPlan = plan({
      method: "hourly",
      rules: [rule({ ruleType: "hourly_rate", amountCents: 3000 })],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [
          appointment("t1", {
            durationMinutes: 60,
            participations: [
              {
                assignmentId: "ata-1",
                trainerId: "t1",
                role: "primary",
                compensatedMinutes: 90,
              },
            ],
          }),
        ],
        planAssignments: [assign("t1", hourlyPlan)],
      }),
    );
    // 90 min at $30/h = $45.00
    expect(result.trainers[0].totals.hourlyCents).toBe(4500);
    expect(result.trainers[0].totals.compensatedMinutes).toBe(90);
  });
});

describe("commission tiers", () => {
  const tiers = [
    { id: "tier-1", sequence: 1, minRevenueCents: 0, maxRevenueCents: 500000, rateBasisPoints: 4000 },
    { id: "tier-2", sequence: 2, minRevenueCents: 500000, maxRevenueCents: 1000000, rateBasisPoints: 5000 },
    { id: "tier-3", sequence: 3, minRevenueCents: 1000000, maxRevenueCents: null, rateBasisPoints: 6000 },
  ];
  const baseRules = [
    rule({
      ruleType: "revenue_rate",
      rateBasisPoints: 0,
      basisType: "source_listed_amount",
    }),
  ];
  // Three sessions totalling $6,000 of listed value.
  const sessions = [
    appointment("t1", { listedAmountCents: 200000 }),
    appointment("t1", { listedAmountCents: 200000 }),
    appointment("t1", { listedAmountCents: 200000 }),
  ];

  it("cliff tiers pay the landing tier's rate on the whole basis", () => {
    const cliffPlan = plan({
      method: "revenue_commission",
      tierBehavior: "cliff",
      rules: baseRules,
      tiers,
    });
    const result = calculatePayroll(
      engineInput({
        appointments: sessions.map((s) => ({ ...s })),
        planAssignments: [assign("t1", cliffPlan)],
      }),
    );
    // $6,000 lands in tier 2 → 50% of 600000 = 300000.
    expect(result.trainers[0].totals.commissionCents).toBe(300000);
    const tierLine = result.trainers[0].lines.find(
      (l) => l.lineType === "commission_tier" && l.appointmentId === null,
    );
    expect(tierLine?.basisAmountCents).toBe(600000);
    expect(tierLine?.trace.method).toBe("revenue_commission:cliff");
  });

  it("marginal tiers pay each tier only on its slice", () => {
    const marginalPlan = plan({
      method: "revenue_commission",
      tierBehavior: "marginal",
      rules: baseRules,
      tiers,
    });
    const result = calculatePayroll(
      engineInput({
        appointments: sessions.map((s) => ({ ...s })),
        planAssignments: [assign("t1", marginalPlan)],
      }),
    );
    // 40% of first 5000.00 + 50% of next 1000.00 = 200000 + 50000 = 250000.
    expect(result.trainers[0].totals.commissionCents).toBe(250000);
  });

  it("cliff and marginal differ on identical inputs (U1c matters)", () => {
    expect(300000).not.toBe(250000); // documented by the two tests above
  });

  it("blocks when tiers have gaps", () => {
    const gappy = [
      { id: "g1", sequence: 1, minRevenueCents: 0, maxRevenueCents: 100000, rateBasisPoints: 4000 },
      { id: "g2", sequence: 2, minRevenueCents: 200000, maxRevenueCents: null, rateBasisPoints: 5000 },
    ];
    const cliffPlan = plan({
      method: "revenue_commission",
      tierBehavior: "cliff",
      rules: baseRules,
      tiers: gappy,
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1", { listedAmountCents: 150000 })],
        planAssignments: [assign("t1", cliffPlan)],
      }),
    );
    expect(result.issues.some((i) => i.code === "tier_gap")).toBe(true);
    expect(result.trainers[0].totals.commissionCents).toBe(0);
  });
});

describe("team roles", () => {
  it("pays the fixed team split for primary and role rates for coaches", () => {
    const teamPlan = plan({
      method: "team_training_rate",
      rules: [
        rule({
          ruleType: "team_training_rate",
          rateBasisPoints: 6000,
          basisType: "source_listed_amount",
        }),
        rule({ ruleType: "assistant_coach_rate", amountCents: 2000 }),
      ],
    });
    const group = appointment("t1", {
      listedAmountCents: 40000,
      participations: [
        { assignmentId: "a1", trainerId: "t1", role: "primary", compensatedMinutes: null },
        { assignmentId: "a2", trainerId: "t2", role: "assistant_coach", compensatedMinutes: null },
        { assignmentId: "a3", trainerId: "t3", role: "observer", compensatedMinutes: null },
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [group],
        planAssignments: [
          assign("t1", teamPlan),
          assign("t2", teamPlan, "team_training"),
        ],
      }),
    );
    const t1 = result.trainers.find((t) => t.trainerId === "t1")!;
    const t2 = result.trainers.find((t) => t.trainerId === "t2")!;
    const t3 = result.trainers.find((t) => t.trainerId === "t3")!;
    expect(t1.totals.teamCents).toBe(24000); // 60% of $400
    expect(t2.totals.teamCents).toBe(2000); // flat assistant rate
    expect(t3.lines).toHaveLength(0); // observers are never compensated
    expect(result.runTotals.blockingIssueCount).toBe(0);
  });

  it("fails closed on roles without a rule mapping", () => {
    const teamPlan = plan({
      method: "team_training_rate",
      rules: [
        rule({
          ruleType: "team_training_rate",
          rateBasisPoints: 6000,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const group = appointment("t1", {
      participations: [
        { assignmentId: "a1", trainerId: "t1", role: "support_coach", compensatedMinutes: null },
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [group],
        planAssignments: [assign("t1", teamPlan)],
      }),
    );
    expect(result.issues.some((i) => i.code === "unsupported_assignment_role")).toBe(true);
  });
});

describe("manual time and adjustments", () => {
  it("pays approved time at the purpose-assigned hourly rate", () => {
    const adminPlan = plan({
      method: "admin_hourly",
      rules: [rule({ ruleType: "admin_hourly_rate", amountCents: 2200, criteria: {} })],
    });
    const result = calculatePayroll(
      engineInput({
        planAssignments: [assign("t1", adminPlan, "administrative")],
        timeEntries: [
          {
            id: "time-1",
            trainerId: "t1",
            workDate: "2026-07-03",
            workCategory: "admin",
            approvedMinutes: 150,
            compensationPurpose: "administrative",
          },
        ],
        trainerIds: ["t1"],
      }),
    );
    // 150 min at $22/h = $55.00
    expect(result.trainers[0].totals.hourlyCents).toBe(5500);
  });

  it("blocks approved time without an hourly plan for the purpose", () => {
    const result = calculatePayroll(
      engineInput({
        timeEntries: [
          {
            id: "time-1",
            trainerId: "t1",
            workDate: "2026-07-03",
            workCategory: "admin",
            approvedMinutes: 60,
            compensationPurpose: "administrative",
          },
        ],
        trainerIds: ["t1"],
      }),
    );
    expect(result.issues.some((i) => i.code === "missing_hourly_rate")).toBe(true);
    expect(result.trainers[0].totals.hourlyCents).toBe(0);
  });

  it("applies adjustment signs by type and totals them", () => {
    const result = calculatePayroll(
      engineInput({
        adjustments: [
          { id: "adj-1", trainerId: "t1", adjustmentType: "bonus", amountCents: 5000, reason: "Great month" },
          { id: "adj-2", trainerId: "t1", adjustmentType: "deduction", amountCents: 1500, reason: "Equipment" },
          { id: "adj-3", trainerId: "t1", adjustmentType: "carry_forward", amountCents: 700, reason: "Prior period" },
        ],
        trainerIds: ["t1"],
      }),
    );
    const totals = result.trainers[0].totals;
    expect(totals.adjustmentCents).toBe(5000 - 1500 + 700);
    expect(totals.deductionCents).toBe(1500);
    expect(totals.bonusCents).toBe(5700);
    expect(totals.finalGrossCents).toBe(4200);
    const carry = result.trainers[0].lines.find((l) => l.lineType === "carry_forward");
    expect(carry?.roundedAmountCents).toBe(700);
  });
});

describe("rounding scope", () => {
  it("per_trainer scope makes the total equal round(sum) not sum(round)", () => {
    // Three sessions of $33.33 at 33.33%: each = 11108.889/1000 ... use values
    // with .5-cent lines: $10.01 at 50% = 500.5 → per-line 501 each.
    const pctPlan = plan({
      roundingScope: "per_trainer",
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5000,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [
          appointment("t1", { listedAmountCents: 1001 }),
          appointment("t1", { listedAmountCents: 1001 }),
          appointment("t1", { listedAmountCents: 1001 }),
        ],
        planAssignments: [assign("t1", pctPlan)],
      }),
    );
    // Exact: 3 × 500.5 = 1501.5 → 1502. Per-line would be 501×3 = 1503.
    expect(result.trainers[0].totals.commissionCents).toBe(1502);
    const adjusted = result.trainers[0].lines.find((l) =>
      l.trace.steps.some((s) => s.step === "per_trainer_rounding"),
    );
    expect(adjusted).toBeDefined();
  });

  it("per_line scope keeps independent line rounding", () => {
    const pctPlan = plan({
      roundingScope: "per_line",
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5000,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [
          appointment("t1", { listedAmountCents: 1001 }),
          appointment("t1", { listedAmountCents: 1001 }),
          appointment("t1", { listedAmountCents: 1001 }),
        ],
        planAssignments: [assign("t1", pctPlan)],
      }),
    );
    expect(result.trainers[0].totals.commissionCents).toBe(1503);
  });
});

describe("determinism and reconciliation", () => {
  it("identical inputs produce identical results; input order is irrelevant", () => {
    const pctPlan = plan({
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5500,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const a1 = appointment("t1", { id: "appt-a", startAt: "2026-07-01T09:00:00Z" });
    const a2 = appointment("t1", { id: "appt-b", startAt: "2026-07-01T08:00:00Z" });
    const base = engineInput({
      appointments: [a1, a2],
      planAssignments: [assign("t1", pctPlan)],
    });
    const shuffled = { ...base, appointments: [a2, a1] };
    const r1 = calculatePayroll(base);
    const r2 = calculatePayroll(shuffled);
    expect(r1).toEqual(r2);
    // Ordered by startAt regardless of input order.
    expect(r1.trainers[0].lines[0].appointmentId).toBe("appt-b");
  });

  it("run totals always equal the sum of trainer line sums", () => {
    const pctPlan = plan({
      rules: [
        rule({
          ruleType: "revenue_rate",
          rateBasisPoints: 5500,
          basisType: "source_listed_amount",
        }),
      ],
    });
    const result = calculatePayroll(
      engineInput({
        appointments: [appointment("t1"), appointment("t2")],
        planAssignments: [assign("t1", pctPlan), assign("t2", pctPlan)],
        adjustments: [
          { id: "adj-1", trainerId: "t1", adjustmentType: "deduction", amountCents: 100, reason: "test" },
        ],
      }),
    );
    const lineSum = result.trainers
      .flatMap((t) => t.lines)
      .filter((l) => l.calculationStatus === "calculated")
      .reduce((sum, l) => sum + l.roundedAmountCents, 0);
    expect(result.runTotals.finalCompensationCents).toBe(lineSum);
    expect(
      result.runTotals.grossCompensationCents + result.runTotals.adjustmentCents,
    ).toBe(result.runTotals.finalCompensationCents);
  });
});
