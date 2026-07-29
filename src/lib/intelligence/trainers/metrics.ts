/**
 * Trainer-specific metrics. A trainer's sessions/hours/revenue/payroll
 * metrics are the shared appointment/revenue/payroll metrics evaluated at
 * trainer scope (single formulas, no duplication) — this module adds only
 * the metrics that exist BECAUSE the scope is a trainer.
 */

import {
  appointmentGate,
  healthyValue,
  type MetricEvaluator,
} from "../shared/evaluate";
import {
  INTELLIGENCE_VERSION,
  type MetricDefinition,
} from "../shared/types";

export const TRAINER_METRICS: MetricDefinition[] = [
  {
    id: "repeat_client_count",
    name: "Repeat clients",
    category: "trainers",
    definition:
      "Distinct clients with two or more completed appointments in the window for this scope.",
    formula: "count(clients with ≥2 completed)",
    unit: "count",
    dependencies: ["dataset:appointments"],
    scopes: ["organization", "department", "trainer"],
    requiredPermission: "client:read",
    selfPermission: "trainer:read_self",
    version: INTELLIGENCE_VERSION,
  },
];

export const TRAINER_EVALUATORS: Record<string, MetricEvaluator> = {
  repeat_client_count: (ctx) => {
    const gate = appointmentGate(ctx);
    if (gate) return gate;
    const counts = new Map<string, number>();
    for (const a of ctx.appointments) {
      if (a.canonicalStatus !== "completed" || a.clientId === null) continue;
      counts.set(a.clientId, (counts.get(a.clientId) ?? 0) + 1);
    }
    let repeat = 0;
    for (const n of counts.values()) if (n >= 2) repeat++;
    return healthyValue(repeat, { clients_with_sessions: counts.size });
  },
};
