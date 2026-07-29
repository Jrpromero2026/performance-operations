/**
 * Builds the evaluation context for a scope + filters from a loaded
 * dataset. The ONE place facts get narrowed and summarized — the service,
 * trend engine, breakdowns, and summaries all come through here.
 */

import { previousPeriodRange } from "../trends/engine";
import {
  scopeAppointments,
  scopePayroll,
  summarizeAppointments,
  summarizePayroll,
  type IntelligenceDataset,
} from "./facts";
import type { EvalContext } from "./evaluate";
import type { MetricFilters, MetricScope } from "./types";

export function buildContext(
  dataset: IntelligenceDataset,
  scope: MetricScope,
  filters: MetricFilters,
): EvalContext {
  const previous = previousPeriodRange(filters.dateFrom, filters.dateTo);
  const previousFilters: MetricFilters = {
    ...filters,
    dateFrom: previous.dateFrom,
    dateTo: previous.dateTo,
  };

  // Everything narrows from the SAME pooled facts — window selection is
  // purely the date filter.
  const appointments = scopeAppointments(dataset.appointments, scope, filters);
  const previousAppointments = scopeAppointments(
    dataset.appointments,
    scope,
    previousFilters,
  );
  const payroll = scopePayroll(dataset.payroll, scope, filters);
  const previousPayroll = scopePayroll(dataset.payroll, scope, previousFilters);

  return {
    dataset,
    scope,
    filters,
    appointments,
    summary: summarizeAppointments(appointments),
    payroll,
    payrollSummary: summarizePayroll(payroll),
    previousAppointments,
    previousSummary: summarizeAppointments(previousAppointments),
    previousPayroll,
    previousPayrollSummary: summarizePayroll(previousPayroll),
  };
}

/** Context for an arbitrary sub-window of the SAME loaded dataset (trends). */
export function buildWindowContext(
  dataset: IntelligenceDataset,
  scope: MetricScope,
  filters: MetricFilters,
  dateFrom: string,
  dateTo: string,
): EvalContext {
  return buildContext(dataset, scope, { ...filters, dateFrom, dateTo });
}
