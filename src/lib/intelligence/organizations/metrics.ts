/**
 * Organization-level metrics. Every shared metric rolls up to organization
 * scope automatically; this module adds organization-population metrics.
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

export const ORGANIZATION_METRICS: MetricDefinition[] = [
  {
    id: "active_departments",
    name: "Active departments",
    category: "organizations",
    definition:
      "Distinct departments with at least one completed appointment in the window.",
    formula: "count(distinct department_id of completed)",
    unit: "count",
    dependencies: ["dataset:appointments"],
    scopes: ["organization"],
    requiredPermission: "department:read",
    version: INTELLIGENCE_VERSION,
  },
];

export const ORGANIZATION_EVALUATORS: Record<string, MetricEvaluator> = {
  active_departments: (ctx) => {
    const gate = appointmentGate(ctx);
    if (gate) return gate;
    const departments = new Set<string>();
    for (const a of ctx.appointments) {
      if (a.canonicalStatus === "completed" && a.departmentId !== null) {
        departments.add(a.departmentId);
      }
    }
    const missing = ctx.appointments.filter(
      (a) => a.canonicalStatus === "completed" && a.departmentId === null,
    ).length;
    return healthyValue(
      departments.size,
      { completed_without_department: missing },
      missing > 0
        ? [`${missing} completed appointment(s) have no department assigned.`]
        : undefined,
    );
  },
};
