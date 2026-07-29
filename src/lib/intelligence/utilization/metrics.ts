/**
 * Utilization metrics. Schedule utilization is derivable from the ledger
 * (completed vs booked time). CAPACITY utilization needs configured
 * availability, which does not exist yet — it reports
 * configuration_missing rather than inventing capacity.
 */

import { ratioBp } from "../shared/math";
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
  capacity_utilization_bp: () => ({
    value: null,
    health: "configuration_missing",
    reasons: [
      "Trainer availability/capacity is not configured anywhere in the system — capacity utilization cannot be computed without inventing capacity.",
    ],
  }),
};
