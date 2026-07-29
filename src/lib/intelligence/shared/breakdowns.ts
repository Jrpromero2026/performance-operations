/**
 * Breakdowns: ONE metric evaluated per group member (per trainer, per
 * department, per service, per compensation method, per status). Group
 * members are discovered from the scoped facts; each row is produced by
 * the metric's single evaluator — never a re-implementation.
 */

import { METRIC_DEFINITIONS, METRIC_EVALUATORS } from "../catalog";
import { buildContext } from "./context";
import { scopeAppointments, scopePayroll, type IntelligenceDataset } from "./facts";
import type {
  MetricBreakdown,
  MetricBreakdownRow,
  MetricFilters,
  MetricScope,
} from "./types";

export type BreakdownGroup =
  | "trainer"
  | "department"
  | "service"
  | "compensation_method"
  | "status";

export function computeBreakdown(
  dataset: IntelligenceDataset,
  scope: MetricScope,
  filters: MetricFilters,
  metricId: string,
  groupBy: BreakdownGroup,
): MetricBreakdown {
  const definition = METRIC_DEFINITIONS.get(metricId);
  const evaluator = METRIC_EVALUATORS.get(metricId);
  if (!definition || !evaluator) {
    return {
      metricId,
      groupBy,
      unit: "count",
      rows: [],
      health: "unavailable",
      reasons: [`Unknown metric: ${metricId}`],
    };
  }

  const scopedAppointments = scopeAppointments(dataset.appointments, scope, filters);
  const scopedPayroll = scopePayroll(dataset.payroll, scope, filters);

  // Discover group members present in scope.
  const keys = new Set<string>();
  if (groupBy === "trainer") {
    for (const a of scopedAppointments) keys.add(a.trainerId);
    for (const p of scopedPayroll) keys.add(p.trainerId);
  } else if (groupBy === "department") {
    for (const a of scopedAppointments) {
      if (a.departmentId) keys.add(a.departmentId);
    }
  } else if (groupBy === "service") {
    for (const a of scopedAppointments) keys.add(a.serviceId);
  } else if (groupBy === "compensation_method") {
    for (const p of scopedPayroll) {
      if (p.compensationMethod) keys.add(p.compensationMethod);
    }
  } else {
    for (const a of scopedAppointments) keys.add(a.canonicalStatus);
  }

  const rows: MetricBreakdownRow[] = [...keys].sort().map((key) => {
    const subScope: MetricScope = { ...scope };
    const subFilters: MetricFilters = { ...filters };
    if (groupBy === "trainer") subScope.trainerId = key;
    else if (groupBy === "department") subScope.departmentId = key;
    else if (groupBy === "service") subScope.serviceId = key;
    else if (groupBy === "compensation_method") subFilters.compensationMethod = key;
    else subFilters.appointmentStatuses = [key];

    const outcome = evaluator(buildContext(dataset, subScope, subFilters));
    const label =
      groupBy === "trainer"
        ? (dataset.names.trainers.get(key) ?? key)
        : groupBy === "department"
          ? (dataset.names.departments.get(key) ?? key)
          : groupBy === "service"
            ? (dataset.names.services.get(key) ?? key)
            : key.replaceAll("_", " ");
    return { key, label, value: outcome.value, metadata: outcome.metadata };
  });

  return {
    metricId,
    groupBy,
    unit: definition.unit,
    rows,
    health: rows.length === 0 ? "incomplete" : "healthy",
    reasons: rows.length === 0 ? ["No group members in scope."] : [],
  };
}
