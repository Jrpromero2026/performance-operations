/**
 * Utilization metrics. Schedule utilization is derivable from the ledger
 * (completed vs booked time). CAPACITY utilization needs configured
 * availability, which does not exist yet — it reports
 * configuration_missing rather than inventing capacity.
 */

import { ratioBp } from "../shared/math";
import { assessStaleness } from "@/lib/snapshots/provenance";
import {
  appointmentGate,
  healthyValue,
  type MetricEvaluator,
} from "../shared/evaluate";
import {
  INTELLIGENCE_VERSION,
  type MetricDefinition,
} from "../shared/types";

export const UTILIZATION_METRICS: MetricDefinition[] = [
  {
    id: "schedule_utilization_bp",
    name: "Schedule utilization",
    category: "utilization",
    definition:
      "Share of booked time that was actually delivered (completed minutes over booked minutes).",
    formula: "completed_minutes ÷ scheduled_minutes × 10000",
    unit: "rate_bp",
    dependencies: ["completed_minutes", "scheduled_minutes"],
    scopes: ["organization", "department", "trainer", "service"],
    requiredPermission: "appointment:read",
    selfPermission: "trainer:read_self",
    version: INTELLIGENCE_VERSION,
  },
  {
    id: "capacity_utilization_bp",
    name: "Capacity utilization",
    category: "utilization",
    definition:
      "Coached time against configured availability. Availability/capacity configuration does not exist yet.",
    formula: "coaching_minutes ÷ configured_capacity_minutes × 10000",
    unit: "rate_bp",
    dependencies: ["coaching_minutes", "configuration:capacity"],
    scopes: ["organization", "department", "trainer"],
    requiredPermission: "appointment:read",
    selfPermission: "trainer:read_self",
    version: INTELLIGENCE_VERSION,
  },
  {
    id: "pt_penetration_bp",
    name: "PT penetration",
    category: "utilization",
    definition:
      "Share of the club's PT-eligible membership actively training: distinct clients with a completed session in the window ÷ PT-eligible members from the latest GMS snapshot. NOT schedule or capacity utilization — a different question with an external denominator.",
    formula: "active_clients ÷ club_pt_eligible_members × 10000",
    unit: "rate_bp",
    dependencies: ["dataset:appointments", "snapshot:club_pt_eligible_members"],
    scopes: ["organization"],
    requiredPermission: "org_snapshot:read",
    version: INTELLIGENCE_VERSION,
  },
];

export const UTILIZATION_EVALUATORS: Record<string, MetricEvaluator> = {
  schedule_utilization_bp: (ctx) => {
    const gate = appointmentGate(ctx);
    if (gate) return gate;
    return healthyValue(
      ratioBp(ctx.summary.completedMinutes, ctx.summary.bookedMinutes),
      {
        completed_minutes: ctx.summary.completedMinutes,
        scheduled_minutes: ctx.summary.bookedMinutes,
      },
    );
  },
  pt_penetration_bp: (ctx) => {
    const gate = appointmentGate(ctx);
    if (gate) return gate;
    const snapshot = ctx.dataset.clubSnapshot;
    const eligible = snapshot?.values.get("club_pt_eligible_members") ?? null;
    if (!snapshot || eligible === null) {
      return {
        value: null,
        health: "configuration_missing",
        reasons: [
          "No GMS snapshot records the PT-eligible member count. Total active members is deliberately NOT substituted — eligibility is an owner-defined population. Enter it at Club snapshots.",
        ],
      };
    }
    if (eligible <= 0) {
      return {
        value: null,
        health: "unavailable",
        reasons: ["The recorded PT-eligible member count is zero; a ratio cannot be formed."],
      };
    }
    // Distinct clients with a completed appointment in the CURRENT window.
    const active = new Set<string>();
    for (const a of ctx.appointments) {
      if (a.canonicalStatus === "completed" && a.clientId) active.add(a.clientId);
    }
    const staleness = assessStaleness(snapshot.asOfDate, ctx.filters.dateTo);
    const reasons = [
      `Denominator: ${eligible} PT-eligible members from the GMS snapshot as of ${snapshot.asOfDate} (manual entry).`,
    ];
    if (staleness === "stale") {
      reasons.push("That snapshot is no longer current; refresh it before relying on this rate.");
    }
    return {
      value: ratioBp(active.size, eligible),
      health: "healthy",
      reasons,
      metadata: {
        active_pt_clients: active.size,
        club_pt_eligible_members: eligible,
        snapshot_as_of: snapshot.asOfDate,
      },
    };
  },
  capacity_utilization_bp: () => ({
    value: null,
    health: "configuration_missing",
    reasons: [
      "Trainer availability/capacity is not configured anywhere in the system — capacity utilization cannot be computed without inventing capacity.",
    ],
  }),
};
