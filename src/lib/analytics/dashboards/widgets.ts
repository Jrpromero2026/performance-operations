/**
 * Dashboard widget configuration — the CLOSED schema every widget must
 * satisfy. Widgets reference existing catalog metrics, analytics query
 * kinds, goals, and benchmarks; there is no formula editor, no SQL, no
 * script. Configs are validated here (zod) on every write AND re-validated
 * on render — an invalid stored config renders as unavailable.
 */

import { z } from "zod";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";

export const WIDGET_TYPES = [
  "metric",
  "comparison",
  "trend",
  "breakdown_table",
  "breakdown_chart",
  "goal_progress",
  "benchmark_comparison",
  "scorecard",
  "cohort_table",
  "cohort_heatmap",
  "readiness",
  "executive_summary",
  "operational_alert",
  "text_note",
  "report_link",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

const metricId = z
  .string()
  .refine((id) => METRIC_DEFINITIONS.has(id), { message: "Unknown metric id" });

const comparisonKind = z.enum([
  "previous_period",
  "same_period_last_year",
  "month_over_month",
  "quarter_over_quarter",
  "year_over_year",
  "year_to_date",
]);

const breakdownGroup = z.enum([
  "department",
  "trainer",
  "service",
  "compensation_method",
  "status",
]);

const scopeConfig = z
  .object({
    departmentId: z.string().uuid().optional(),
    trainerId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
  })
  .strict();

/** Per-type config schemas. Everything is references + display options. */
export const WIDGET_CONFIG_SCHEMAS: Record<WidgetType, z.ZodTypeAny> = {
  metric: z.object({ metricId, scope: scopeConfig.optional() }).strict(),
  comparison: z
    .object({
      metricId,
      comparison: comparisonKind,
      scope: scopeConfig.optional(),
    })
    .strict(),
  trend: z
    .object({
      metricId,
      granularity: z
        .enum(["daily", "weekly", "monthly", "quarterly"])
        .default("monthly"),
      chart: z.enum(["line", "area", "bar", "sparkline"]).default("line"),
      scope: scopeConfig.optional(),
    })
    .strict(),
  breakdown_table: z
    .object({
      metricId,
      groupBy: breakdownGroup,
      comparison: comparisonKind.optional(),
      scope: scopeConfig.optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  breakdown_chart: z
    .object({
      metricId,
      groupBy: breakdownGroup,
      chart: z.enum(["bar", "horizontal_bar"]).default("horizontal_bar"),
      scope: scopeConfig.optional(),
      limit: z.number().int().min(1).max(25).optional(),
    })
    .strict(),
  goal_progress: z.object({ goalId: z.string().uuid() }).strict(),
  benchmark_comparison: z
    .object({ benchmarkId: z.string().uuid(), scope: scopeConfig.optional() })
    .strict(),
  scorecard: z
    .object({
      scorecardKey: z.enum([
        "organization_executive",
        "department",
        "trainer",
        "payroll_operations",
        "period_close",
        "integration_operations",
      ]),
      scope: scopeConfig.optional(),
    })
    .strict(),
  cohort_table: z
    .object({
      months: z.number().int().min(3).max(24).default(6),
      scope: scopeConfig.optional(),
    })
    .strict(),
  cohort_heatmap: z
    .object({
      months: z.number().int().min(3).max(24).default(6),
      scope: scopeConfig.optional(),
    })
    .strict(),
  readiness: z.object({}).strict(),
  executive_summary: z.object({}).strict(),
  operational_alert: z.object({}).strict(),
  text_note: z
    .object({ text: z.string().min(1).max(2000) })
    .strict(),
  report_link: z
    .object({
      label: z.string().min(1).max(120),
      // Internal app paths only — never external URLs.
      path: z
        .string()
        .regex(/^\/(reports|analytics|period-close|payroll|departments|trainers)(\/|\?|$)/),
    })
    .strict(),
};

export interface WidgetValidation {
  ok: boolean;
  error?: string;
}

export function validateWidgetConfig(
  widgetType: string,
  config: unknown,
): WidgetValidation {
  const schema = WIDGET_CONFIG_SCHEMAS[widgetType as WidgetType];
  if (!schema) return { ok: false, error: `Unknown widget type: ${widgetType}` };
  const parsed = schema.safeParse(config ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid widget configuration",
    };
  }
  return { ok: true };
}
