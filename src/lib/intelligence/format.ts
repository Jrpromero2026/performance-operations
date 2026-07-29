/**
 * Display formatting for metric values. PRESENTATION ONLY — unit rendering
 * (cents → $, basis points → %, minutes → hours) with no business math:
 * every number formatted here came from the engine as-is.
 */

import { formatCents } from "@/lib/money/money";
import type { MetricHealth, MetricUnit } from "./shared/types";

export function formatMetricValue(
  value: number | null,
  unit: MetricUnit,
): string {
  if (value === null) return "—";
  switch (unit) {
    case "cents":
    case "cents_per_session":
    case "cents_per_hour":
    case "cents_per_client":
      return formatCents(value);
    case "rate_bp":
      return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
    case "minutes": {
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }
    case "hours":
      return `${value}h`;
    case "sessions_per_client":
    case "visits_per_week":
      return (value / 100).toFixed(2);
    case "count":
      return String(value);
    case "date":
      return "—"; // date metrics carry the date in metadata
  }
}

export const HEALTH_LABEL: Record<MetricHealth, string> = {
  healthy: "Healthy",
  incomplete: "Incomplete",
  unavailable: "Unavailable",
  configuration_missing: "Configuration missing",
  waiting_for_payroll: "Waiting for payroll",
  waiting_for_imports: "Waiting for imports",
  waiting_for_configuration: "Waiting for configuration",
};

export const HEALTH_CLASS: Record<MetricHealth, string> = {
  healthy: "bg-positive-soft text-positive",
  incomplete: "bg-warning-soft text-warning",
  unavailable: "bg-surface-sunken text-ink-muted",
  configuration_missing: "bg-warning-soft text-warning",
  waiting_for_payroll: "bg-info-soft text-info",
  waiting_for_imports: "bg-info-soft text-info",
  waiting_for_configuration: "bg-info-soft text-info",
};
