/**
 * Shared quick-report CSV builder — serializes engine MetricResults
 * verbatim (raw value + formatted value + health + version). Used by the
 * interactive /reports/export route AND scheduled report execution, so
 * both paths emit byte-identical artifacts for identical inputs.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { formatMetricValue } from "@/lib/intelligence/format";
import { sha256Hex } from "@/lib/close/manifest";

export const REPORT_METRICS = [
  "appointments_completed",
  "completed_rate_bp",
  "cancellation_rate_bp",
  "no_show_rate_bp",
  "coaching_minutes",
  "schedule_utilization_bp",
  "revenue_listed_cents",
  "revenue_per_session_cents",
  "revenue_per_hour_cents",
  "payroll_gross_cents",
  "payroll_pct_of_revenue_bp",
  "active_clients",
  "new_clients",
  "client_retention_rate_bp",
];

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export interface MetricReportArtifact {
  content: string;
  sha256: string;
  fileName: string;
  metricCount: number;
}

export async function buildMetricReportCsv(
  actor: ActorContext,
  organizationId: string,
  period: { id: string; label: string; start_date: string; end_date: string },
  options?: { finalityNote?: string },
): Promise<MetricReportArtifact> {
  const session = await IntelligenceSession.create(
    actor,
    organizationId,
    period.start_date,
    period.end_date,
  );
  const results = session.getMetrics(REPORT_METRICS);

  const lines = [
    ["Performance Operations — Metric Report"].map(csvCell).join(","),
    ["Period", period.label, `${period.start_date} – ${period.end_date}`].map(csvCell).join(","),
    ["Engine", "intel-v1"].map(csvCell).join(","),
    ...(options?.finalityNote
      ? [["Finality", options.finalityNote].map(csvCell).join(",")]
      : []),
    "",
    ["Metric", "Value (raw)", "Value (formatted)", "Unit", "Health", "Notes"].map(csvCell).join(","),
    ...results.map((r) =>
      [
        r.metricId,
        r.value,
        formatMetricValue(r.value, r.unit),
        r.unit,
        r.health,
        r.reasons[0] ?? r.warnings[0] ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  const content = lines.join("\r\n") + "\r\n";
  return {
    content,
    sha256: sha256Hex(content),
    fileName: `metric-report-${period.start_date}.csv`,
    metricCount: results.length,
  };
}
