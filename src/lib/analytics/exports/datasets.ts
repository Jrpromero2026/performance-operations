/**
 * Analytics dataset exports — "Forecast-ready historical datasets":
 * structured HISTORICAL engine output only, no projected values.
 *
 * Every export definition is versioned with a stable, documented schema;
 * every row carries scope, metric identity, unit, health, reason, and
 * finality; machine datasets keep currency in integer cents; CSV cells go
 * through the Phase 7 formula-injection-protected builder; every export
 * hashes its bytes and records an export + audit event.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { actorCan, writeAudit } from "@/lib/actions/shared";
import { buildCsvDocument, type CsvDocument } from "@/lib/close/csv";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import type { AnalyticsService } from "../queries/service";
import type { AnalyticsWindow } from "../shared/types";
import { ANALYTICS_VERSION } from "../shared/types";

export const DATASET_EXPORT_VERSION = "analytics-export-v1";

export const DATASET_DEFINITIONS = [
  {
    key: "metric_time_series",
    name: "Metric time series",
    description:
      "One row per metric per reporting period — the engine's value with health and finality.",
    requiredPermission: "analytics_dataset:export" as const,
  },
  {
    key: "department_period_summary",
    name: "Department-period summary",
    description: "Core metrics per department for the selected period windows.",
    requiredPermission: "analytics_dataset:export" as const,
  },
  {
    key: "trainer_period_summary",
    name: "Trainer-period summary",
    description:
      "Core operational metrics per trainer (no payroll amounts — payroll exports stay in the payroll domain).",
    requiredPermission: "analytics_dataset:export" as const,
  },
  {
    key: "service_period_summary",
    name: "Service-period summary",
    description: "Completed sessions and listed amounts per service.",
    requiredPermission: "analytics_dataset:export" as const,
  },
  {
    key: "goal_progress",
    name: "Goal progress",
    description: "Approved goals with current engine values and derived progress.",
    requiredPermission: "analytics_dataset:export" as const,
  },
  {
    key: "benchmark_comparison",
    name: "Benchmark comparison",
    description: "Approved benchmarks with current engine values.",
    requiredPermission: "analytics_dataset:export" as const,
  },
] as const;

export type DatasetKey = (typeof DATASET_DEFINITIONS)[number]["key"];

/** Metric set for the time-series and summary datasets (approved, numeric). */
export const TIME_SERIES_METRICS = [
  "appointments_total",
  "appointments_completed",
  "appointments_cancelled",
  "appointments_no_show",
  "completed_rate_bp",
  "cancellation_rate_bp",
  "no_show_rate_bp",
  "coaching_minutes",
  "schedule_utilization_bp",
  "revenue_listed_cents",
  "revenue_paid_cents",
  "active_clients",
  "new_clients",
  "returning_clients",
  "client_retention_rate_bp",
  "payroll_gross_cents",
] as const;

const DATASET_COLUMNS = [
  "organization_id",
  "scope_level",
  "scope_id",
  "scope_label",
  "metric_id",
  "metric_name",
  "metric_version",
  "period_id",
  "period_label",
  "date_from",
  "date_to",
  "value",
  "unit",
  "health",
  "reason",
  "finality",
  "generated_at",
];

interface DatasetRowInput {
  scopeLevel: string;
  scopeId: string | null;
  scopeLabel: string;
  metricId: string;
  window: AnalyticsWindow;
  value: number | null;
  health: string;
  reason: string | null;
}

function datasetRows(
  organizationId: string,
  generatedAt: string,
  rows: DatasetRowInput[],
): (string | number | null)[][] {
  return rows.map((row) => {
    const definition = METRIC_DEFINITIONS.get(row.metricId);
    return [
      organizationId,
      row.scopeLevel,
      row.scopeId,
      row.scopeLabel,
      row.metricId,
      definition?.name ?? row.metricId,
      definition?.version ?? "unknown",
      row.window.reportingPeriodId,
      row.window.label,
      row.window.dateFrom,
      row.window.dateTo,
      row.value,
      definition?.unit ?? "count",
      row.health,
      row.reason,
      row.window.finality,
      generatedAt,
    ];
  });
}

export interface DatasetExport {
  document: CsvDocument;
  fileName: string;
  rowCount: number;
}

/**
 * Build the metric time-series dataset over the given period windows.
 * Rows are ordered deterministically: window date, then metric id.
 */
export async function buildMetricTimeSeriesDataset(
  service: AnalyticsService,
  windows: readonly AnalyticsWindow[],
): Promise<DatasetExport> {
  const generatedAt = new Date().toISOString();
  const inputs: DatasetRowInput[] = [];
  const ordered = [...windows].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  for (const window of ordered) {
    for (const metricId of TIME_SERIES_METRICS) {
      const result = await service.getMetricResult(metricId, window);
      inputs.push({
        scopeLevel: "organization",
        scopeId: null,
        scopeLabel: "Organization",
        metricId,
        window,
        value: result.value,
        health: result.health,
        reason: result.reasons[0] ?? null,
      });
    }
  }
  const document = buildCsvDocument(
    [
      ["Performance Operations — Forecast-ready historical dataset"],
      ["Dataset", "metric_time_series", DATASET_EXPORT_VERSION, ANALYTICS_VERSION],
      ["Note", "Historical engine output only — no projected values. Currency in integer cents."],
    ],
    DATASET_COLUMNS,
    datasetRows(service.organizationId, generatedAt, inputs),
  );
  return {
    document,
    fileName: `analytics-metric-time-series-${ordered[0]?.dateFrom ?? "empty"}.csv`,
    rowCount: document.rowCount,
  };
}

/** Breakdown-based summaries (department/trainer/service) for one window. */
export async function buildBreakdownSummaryDataset(
  service: AnalyticsService,
  window: AnalyticsWindow,
  groupBy: "department" | "trainer" | "service",
  metricIds: readonly string[],
): Promise<DatasetExport> {
  const generatedAt = new Date().toISOString();
  const inputs: DatasetRowInput[] = [];
  for (const metricId of metricIds) {
    const breakdown = await service.getBreakdownComparison(
      metricId,
      groupBy,
      window,
      null,
    );
    for (const row of [...breakdown.rows].sort((a, b) => a.label.localeCompare(b.label))) {
      inputs.push({
        scopeLevel: groupBy,
        scopeId: row.key,
        scopeLabel: row.label,
        metricId,
        window,
        value: row.currentValue,
        health: breakdown.health,
        reason: breakdown.eligibilityReason,
      });
    }
  }
  const document = buildCsvDocument(
    [
      ["Performance Operations — Forecast-ready historical dataset"],
      [
        "Dataset",
        `${groupBy}_period_summary`,
        DATASET_EXPORT_VERSION,
        ANALYTICS_VERSION,
      ],
      ["Note", "Historical engine output only — no projected values. Currency in integer cents."],
    ],
    DATASET_COLUMNS,
    datasetRows(service.organizationId, generatedAt, inputs),
  );
  return {
    document,
    fileName: `analytics-${groupBy}-period-summary-${window.dateFrom}.csv`,
    rowCount: document.rowCount,
  };
}

/** Goal progress dataset — approved goals with current engine values. */
export async function buildGoalProgressDataset(
  service: AnalyticsService,
  actor: ActorContext,
  window: AnalyticsWindow,
): Promise<DatasetExport> {
  const { loadGoalRecords } = await import("../presentations/packages");
  const { deriveGoalProgress } = await import("../goals/progress");
  const generatedAt = new Date().toISOString();
  const goals = await loadGoalRecords(actor, service.organizationId, [
    "active",
    "achieved",
    "missed",
  ]);
  const rows: (string | number | null)[][] = [];
  for (const goal of [...goals].sort((a, b) => a.name.localeCompare(b.name))) {
    const result = await service.getMetricResult(goal.metricId, window, {
      departmentId: goal.departmentId ?? undefined,
      trainerId: goal.trainerId ?? undefined,
    });
    const progress = deriveGoalProgress(goal, result, service.today);
    rows.push([
      service.organizationId,
      goal.scopeLevel,
      goal.departmentId ?? goal.trainerId ?? null,
      goal.name,
      goal.metricId,
      METRIC_DEFINITIONS.get(goal.metricId)?.name ?? goal.metricId,
      goal.metricVersion,
      window.reportingPeriodId,
      window.label,
      window.dateFrom,
      window.dateTo,
      progress.currentValue,
      goal.metricUnit,
      progress.metricHealth ?? "unavailable",
      progress.reason ?? progress.status,
      window.finality,
      generatedAt,
    ]);
  }
  const document = buildCsvDocument(
    [
      ["Performance Operations — Forecast-ready historical dataset"],
      ["Dataset", "goal_progress", DATASET_EXPORT_VERSION, ANALYTICS_VERSION],
      ["Note", "Historical engine output only — no projected values. Currency in integer cents."],
    ],
    DATASET_COLUMNS,
    rows,
  );
  return {
    document,
    fileName: `analytics-goal-progress-${window.dateFrom}.csv`,
    rowCount: document.rowCount,
  };
}

/** Benchmark comparison dataset — approved benchmarks vs current values. */
export async function buildBenchmarkComparisonDataset(
  service: AnalyticsService,
  actor: ActorContext,
  window: AnalyticsWindow,
): Promise<DatasetExport> {
  const generatedAt = new Date().toISOString();
  const { data: benchmarks } = await actor.supabase
    .from("performance_benchmarks")
    .select("*")
    .eq("organization_id", service.organizationId)
    .eq("status", "approved")
    .order("name");
  const rows: (string | number | null)[][] = [];
  for (const benchmark of benchmarks ?? []) {
    const result = await service.getMetricResult(benchmark.metric_id, window, {
      departmentId: benchmark.department_id ?? undefined,
      trainerId: benchmark.trainer_id ?? undefined,
    });
    rows.push([
      service.organizationId,
      benchmark.scope_level,
      benchmark.department_id ?? benchmark.trainer_id ?? null,
      `${benchmark.name} (benchmark ${benchmark.value} — ${benchmark.source_type})`,
      benchmark.metric_id,
      METRIC_DEFINITIONS.get(benchmark.metric_id)?.name ?? benchmark.metric_id,
      benchmark.metric_version,
      window.reportingPeriodId,
      window.label,
      window.dateFrom,
      window.dateTo,
      result.value,
      benchmark.metric_unit,
      result.health,
      result.reasons[0] ?? null,
      window.finality,
      generatedAt,
    ]);
  }
  const document = buildCsvDocument(
    [
      ["Performance Operations — Forecast-ready historical dataset"],
      ["Dataset", "benchmark_comparison", DATASET_EXPORT_VERSION, ANALYTICS_VERSION],
      ["Note", "Historical engine output only — no projected values. Currency in integer cents."],
    ],
    DATASET_COLUMNS,
    rows,
  );
  return {
    document,
    fileName: `analytics-benchmark-comparison-${window.dateFrom}.csv`,
    rowCount: document.rowCount,
  };
}

/** Record the export event + audit trail (shared by the export route). */
export async function recordDatasetExport(
  actor: ActorContext,
  organizationId: string,
  datasetKey: string,
  document: CsvDocument,
): Promise<void> {
  await actor.supabase.from("export_events").insert({
    organization_id: organizationId,
    export_type: `analytics_dataset:${datasetKey}`,
    source_page: "analytics/datasets",
    format: "csv",
    engine_version: ANALYTICS_VERSION,
    metadata: {
      dataset_version: DATASET_EXPORT_VERSION,
      sha256: document.sha256,
      row_count: document.rowCount,
      byte_size: document.byteSize,
    },
    generated_by: actor.userId,
  });
  await writeAudit(actor, {
    organizationId,
    entityType: "analytics_dataset_export",
    entityId: null,
    action: "analytics_dataset_exported",
    metadata: {
      dataset: datasetKey,
      sha256: document.sha256,
      row_count: document.rowCount,
    },
  });
}

export function canExportDatasets(
  actor: ActorContext,
  organizationId: string,
): boolean {
  return actorCan(actor, organizationId, "analytics_dataset:export");
}
