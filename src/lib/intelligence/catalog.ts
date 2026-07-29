/**
 * The metric catalog — the single registry of every metric definition and
 * its ONE evaluator. Anything not in this catalog is not a metric; any id
 * collision throws at module load (a duplicated formula cannot ship).
 */

import type { MetricEvaluator } from "./shared/evaluate";
import type { MetricDefinition } from "./shared/types";
import { APPOINTMENT_EVALUATORS, APPOINTMENT_METRICS } from "./appointments/metrics";
import { REVENUE_EVALUATORS, REVENUE_METRICS } from "./revenue/metrics";
import { PAYROLL_EVALUATORS, PAYROLL_METRICS } from "./payroll/metrics";
import { CLIENT_EVALUATORS, CLIENT_METRICS } from "./clients/metrics";
import { TRAINER_EVALUATORS, TRAINER_METRICS } from "./trainers/metrics";
import { DEPARTMENT_EVALUATORS, DEPARTMENT_METRICS } from "./departments/metrics";
import {
  ORGANIZATION_EVALUATORS,
  ORGANIZATION_METRICS,
} from "./organizations/metrics";
import { UTILIZATION_EVALUATORS, UTILIZATION_METRICS } from "./utilization/metrics";
import { READINESS_EVALUATORS, READINESS_METRICS } from "./readiness/metrics";

const MODULES: { definitions: MetricDefinition[]; evaluators: Record<string, MetricEvaluator> }[] = [
  { definitions: APPOINTMENT_METRICS, evaluators: APPOINTMENT_EVALUATORS },
  { definitions: REVENUE_METRICS, evaluators: REVENUE_EVALUATORS },
  { definitions: PAYROLL_METRICS, evaluators: PAYROLL_EVALUATORS },
  { definitions: CLIENT_METRICS, evaluators: CLIENT_EVALUATORS },
  { definitions: TRAINER_METRICS, evaluators: TRAINER_EVALUATORS },
  { definitions: DEPARTMENT_METRICS, evaluators: DEPARTMENT_EVALUATORS },
  { definitions: ORGANIZATION_METRICS, evaluators: ORGANIZATION_EVALUATORS },
  { definitions: UTILIZATION_METRICS, evaluators: UTILIZATION_EVALUATORS },
  { definitions: READINESS_METRICS, evaluators: READINESS_EVALUATORS },
];

function buildCatalog(): {
  definitions: Map<string, MetricDefinition>;
  evaluators: Map<string, MetricEvaluator>;
} {
  const definitions = new Map<string, MetricDefinition>();
  const evaluators = new Map<string, MetricEvaluator>();
  for (const mod of MODULES) {
    for (const definition of mod.definitions) {
      if (definitions.has(definition.id)) {
        throw new Error(`Duplicate metric id in catalog: ${definition.id}`);
      }
      definitions.set(definition.id, definition);
    }
    for (const [id, evaluator] of Object.entries(mod.evaluators)) {
      if (evaluators.has(id)) {
        throw new Error(`Duplicate metric evaluator: ${id}`);
      }
      evaluators.set(id, evaluator);
    }
  }
  // Every definition needs exactly one evaluator and vice versa.
  for (const id of definitions.keys()) {
    if (!evaluators.has(id)) {
      throw new Error(`Metric ${id} has a definition but no evaluator`);
    }
  }
  for (const id of evaluators.keys()) {
    if (!definitions.has(id)) {
      throw new Error(`Metric ${id} has an evaluator but no definition`);
    }
  }
  return { definitions, evaluators };
}

const catalog = buildCatalog();

export const METRIC_DEFINITIONS: ReadonlyMap<string, MetricDefinition> =
  catalog.definitions;
export const METRIC_EVALUATORS: ReadonlyMap<string, MetricEvaluator> =
  catalog.evaluators;

export function getDefinition(metricId: string): MetricDefinition | null {
  return METRIC_DEFINITIONS.get(metricId) ?? null;
}

export function listDefinitions(): MetricDefinition[] {
  return [...METRIC_DEFINITIONS.values()];
}
