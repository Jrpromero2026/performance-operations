/**
 * Department-level metrics. Department revenue/payroll/sessions/hours are
 * the shared metrics evaluated at department scope; this module adds the
 * populations that exist because the scope is an organizational unit.
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

export const DEPARTMENT_METRICS: MetricDefinition[] = [
  {
    id: "active_trainers",
    name: "Active trainers",
    category: "departments",
    definition:
      "Distinct trainers with at least one completed appointment in the window for this scope.",
    formula: "count(distinct trainer_id of completed)",
    unit: "count",
    dependencies: ["dataset:appointments"],
    scopes: ["organization", "department", "service"],
    requiredPermission: "trainer:read",
    version: INTELLIGENCE_VERSION,
  },
];

export const DEPARTMENT_EVALUATORS: Record<string, MetricEvaluator> = {
  active_trainers: (ctx) => {
    const gate = appointmentGate(ctx);
    if (gate) return gate;
    const trainers = new Set<string>();
    for (const a of ctx.appointments) {
      if (a.canonicalStatus === "completed") trainers.add(a.trainerId);
    }
    return healthyValue(trainers.size);
  },
};
