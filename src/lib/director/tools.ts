/**
 * Timberhill PT Director — tool registry.
 *
 * The ONLY surface the model can touch. Every tool is deterministic,
 * read-only, and runs through the caller's RLS client plus the
 * intelligence session's per-metric permission gating — the model never
 * widens anyone's access, because the tools cannot.
 *
 * Design rules (Phase F §26/§28, unchanged):
 *  - Domain-level tools, never table-level. No SQL surface exists.
 *  - Every quantitative payload carries health + reasons; an empty
 *    pipeline reads as "no data", never as zero.
 *  - Revenue is NEVER unqualified: the four variants are distinct outputs
 *    with their variant names attached.
 *  - Client contact details are excluded from every output by
 *    construction.
 *  - Imported free text (notes, labels) is DATA and never reaches the
 *    model as instructions — tools simply do not return it.
 */

import type { ActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { METRIC_DEFINITIONS } from "@/lib/intelligence/catalog";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { assessDataQuality, summarizeDataQuality } from "@/lib/freshness/data-quality";
import { loadDataQualityCounts, loadFreshnessReport } from "@/lib/freshness/service";
import {
  listSnapshots,
  latestRecordedSnapshot,
  toProvenance,
} from "@/lib/snapshots/service";
import { describeProvenance } from "@/lib/snapshots/provenance";

export interface DirectorToolContext {
  actor: ActorContext;
  organizationId: string;
  todayIsoDate: string;
}

/** JSON-schema'd tool the model may call. */
export interface DirectorTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(ctx: DirectorToolContext, args: Record<string, unknown>): Promise<unknown>;
}

const ISO_DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Default window: the latest reporting period, else the current month. */
async function resolveWindow(
  ctx: DirectorToolContext,
  args: Record<string, unknown>
): Promise<{ dateFrom: string; dateTo: string; windowLabel: string }> {
  const dateFrom = str(args, "date_from");
  const dateTo = str(args, "date_to");
  if (dateFrom && dateTo) {
    return { dateFrom, dateTo, windowLabel: `${dateFrom} to ${dateTo}` };
  }

  const { data } = await ctx.actor.supabase
    .from("reporting_periods")
    .select("label, start_date, end_date")
    .eq("organization_id", ctx.organizationId)
    .order("end_date", { ascending: false })
    .limit(1);
  const period = data?.[0];
  if (period) {
    return {
      dateFrom: period.start_date,
      dateTo: period.end_date,
      windowLabel: `${period.label} (${period.start_date} to ${period.end_date})`,
    };
  }
  const month = ctx.todayIsoDate.slice(0, 7);
  return {
    dateFrom: `${month}-01`,
    dateTo: ctx.todayIsoDate,
    windowLabel: "current month to date",
  };
}

interface CompactableResult {
  metricId: string;
  value: number | null;
  unit: string;
  health: string;
  reasons: string[];
  metadata: Record<string, string | number | null>;
}

function compactResult(r: CompactableResult) {
  return {
    metric: r.metricId,
    value: r.value,
    unit: r.unit,
    health: r.health,
    reasons: r.reasons.length > 0 ? r.reasons : undefined,
    metadata: Object.keys(r.metadata).length > 0 ? r.metadata : undefined,
  };
}

/* ------------------------------------------------------------- tools */

const getDataFreshness: DirectorTool = {
  name: "get_data_freshness",
  description:
    "How current each data source is (Setmore appointments, GMS club snapshots, payroll, Everfit). Call this FIRST for any quantitative question; every numeric answer must state its freshness basis.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(ctx) {
    return loadFreshnessReport(ctx.actor, ctx.organizationId, ctx.todayIsoDate);
  },
};

const getDataQuality: DirectorTool = {
  name: "get_data_quality",
  description:
    "Operational data-quality checks: unmatched mappings, unknown statuses, open exceptions, missing compensation configuration. Use when data looks incomplete or a number needs a caveat.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(ctx) {
    const [freshness, counts] = await Promise.all([
      loadFreshnessReport(ctx.actor, ctx.organizationId, ctx.todayIsoDate),
      loadDataQualityCounts(ctx.actor, ctx.organizationId),
    ]);
    const checks = assessDataQuality(counts, freshness);
    return { summary: summarizeDataQuality(checks), checks };
  },
};

const listMetrics: DirectorTool = {
  name: "list_metrics",
  description:
    "The deterministic metric catalog: every metric id, its definition, unit and category. Use to find the right metric id before calling get_metric.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Optional filter, e.g. revenue, payroll, clients, appointments, utilization",
      },
    },
    additionalProperties: false,
  },
  async run(_ctx, args) {
    const category = str(args, "category");
    return [...METRIC_DEFINITIONS.values()]
      .filter((d) => !category || d.category === category)
      .map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        definition: d.definition,
        unit: d.unit,
      }));
  },
};

const getMetric: DirectorTool = {
  name: "get_metric",
  description:
    "Evaluate one catalog metric for a window and scope. Permission-gated per metric: a denied result explains why. Values are metric-native units (currency in CENTS, rates in basis points where 10000 = 100%).",
  parameters: {
    type: "object",
    properties: {
      metric_id: { type: "string", description: "A metric id from list_metrics" },
      date_from: {
        ...ISO_DATE,
        description: "Window start (defaults to the latest reporting period)",
      },
      date_to: { ...ISO_DATE, description: "Window end" },
      trainer_id: { type: "string", description: "Optional trainer scope" },
      department_id: { type: "string", description: "Optional department scope" },
    },
    required: ["metric_id"],
    additionalProperties: false,
  },
  async run(ctx, args) {
    const metricId = str(args, "metric_id");
    if (!metricId) return { error: "metric_id is required" };
    const window = await resolveWindow(ctx, args);
    const session = await IntelligenceSession.create(
      ctx.actor,
      ctx.organizationId,
      window.dateFrom,
      window.dateTo
    );
    const result = session.getMetric(metricId, {
      trainerId: str(args, "trainer_id"),
      departmentId: str(args, "department_id"),
    });
    return { window: window.windowLabel, ...compactResult(result) };
  },
};

const listTrainers: DirectorTool = {
  name: "list_trainers",
  description:
    "Trainers assigned to the organization (id + display name). Requires trainer:read; trainers see themselves.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(ctx) {
    const canReadAll = hasPermissionInOrganization(
      ctx.actor.memberships,
      ctx.organizationId,
      "trainer:read"
    );
    if (!canReadAll) {
      const { data: self } = await ctx.actor.supabase
        .from("trainers")
        .select("id, display_name")
        .eq("profile_id", ctx.actor.userId);
      return (self ?? []).map((t) => ({ id: t.id, name: t.display_name }));
    }
    const { data } = await ctx.actor.supabase
      .from("trainer_organization_assignments")
      .select("trainer_id, trainers ( id, display_name )")
      .eq("organization_id", ctx.organizationId)
      .is("effective_to", null);
    interface Row {
      trainers: { id: string; display_name: string } | null;
    }
    return ((data ?? []) as unknown as Row[]).flatMap((r) =>
      r.trainers ? [{ id: r.trainers.id, name: r.trainers.display_name }] : []
    );
  },
};

const KPI_SET = [
  "appointments_completed",
  "appointments_cancelled",
  "appointments_no_show",
  "cancellation_rate_bp",
  "completed_minutes",
  "revenue_listed_cents",
  "revenue_eligible_cents",
  "revenue_per_session_cents",
  "active_clients",
  "schedule_utilization_bp",
];

const getTrainerKpis: DirectorTool = {
  name: "get_trainer_kpis",
  description:
    "The standard KPI bundle for one trainer over a window: sessions, cancellations, revenue (listed AND eligible, labelled), utilization, active clients.",
  parameters: {
    type: "object",
    properties: {
      trainer_id: { type: "string" },
      date_from: ISO_DATE,
      date_to: ISO_DATE,
    },
    required: ["trainer_id"],
    additionalProperties: false,
  },
  async run(ctx, args) {
    const trainerId = str(args, "trainer_id");
    if (!trainerId) return { error: "trainer_id is required" };
    const window = await resolveWindow(ctx, args);
    const session = await IntelligenceSession.create(
      ctx.actor,
      ctx.organizationId,
      window.dateFrom,
      window.dateTo
    );
    return {
      window: window.windowLabel,
      trainerId,
      kpis: KPI_SET.map((id) => compactResult(session.getMetric(id, { trainerId }))),
    };
  },
};

const REVENUE_SET = [
  "revenue_listed_cents",
  "revenue_eligible_cents",
  "revenue_recognized_cents",
  "revenue_paid_cents",
  "average_session_value_cents",
  "revenue_per_session_cents",
];

const getRevenueSummary: DirectorTool = {
  name: "get_revenue_summary",
  description:
    "All four revenue concepts for a window — listed, eligible, recognized, paid — which are DIFFERENT numbers and must be named when quoted. Values in cents.",
  parameters: {
    type: "object",
    properties: {
      date_from: ISO_DATE,
      date_to: ISO_DATE,
      trainer_id: { type: "string" },
    },
    additionalProperties: false,
  },
  async run(ctx, args) {
    const window = await resolveWindow(ctx, args);
    const session = await IntelligenceSession.create(
      ctx.actor,
      ctx.organizationId,
      window.dateFrom,
      window.dateTo
    );
    const trainerId = str(args, "trainer_id");
    return {
      window: window.windowLabel,
      variants: REVENUE_SET.map((id) =>
        compactResult(session.getMetric(id, { trainerId }))
      ),
    };
  },
};

const PAYROLL_SET = [
  "payroll_gross_cents",
  "payroll_per_session_cents",
  "payroll_per_hour_cents",
  "payroll_pct_of_revenue_bp",
  "payroll_variance_cents",
  "payroll_adjustment_net_cents",
];

const getPayrollSummary: DirectorTool = {
  name: "get_payroll_summary",
  description:
    "Payroll metrics for a window, from FINALIZED runs only. Trainers see their own; payroll:read sees the organization. If no run is finalized the health explains that — never report zero pay as a fact.",
  parameters: {
    type: "object",
    properties: {
      date_from: ISO_DATE,
      date_to: ISO_DATE,
      trainer_id: { type: "string" },
    },
    additionalProperties: false,
  },
  async run(ctx, args) {
    const window = await resolveWindow(ctx, args);
    const session = await IntelligenceSession.create(
      ctx.actor,
      ctx.organizationId,
      window.dateFrom,
      window.dateTo
    );
    const trainerId = str(args, "trainer_id");
    return {
      window: window.windowLabel,
      metrics: PAYROLL_SET.map((id) =>
        compactResult(session.getMetric(id, { trainerId }))
      ),
    };
  },
};

const getClubSnapshot: DirectorTool = {
  name: "get_club_snapshot",
  description:
    "Latest manually-entered GMS club snapshot (membership counts). ALWAYS quote its as-of date — this is manual data, never live.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(ctx) {
    if (
      !hasPermissionInOrganization(
        ctx.actor.memberships,
        ctx.organizationId,
        "org_snapshot:read"
      )
    ) {
      return { denied: "You do not have permission to view club snapshots." };
    }
    const snapshots = await listSnapshots(ctx.actor, ctx.organizationId, {
      recordedOnly: true,
    });
    const latest = latestRecordedSnapshot(snapshots, "gym_management_solutions");
    if (!latest) {
      return { available: false, statement: "No GMS snapshot has been recorded." };
    }
    return {
      available: true,
      statement: describeProvenance(
        toProvenance(latest, latest.sourceLabel, latest.sourceKey),
        ctx.todayIsoDate
      ),
      asOfDate: latest.asOfDate,
      period: { start: latest.periodStart, end: latest.periodEnd },
      values: latest.values,
    };
  },
};

const listReportingPeriods: DirectorTool = {
  name: "list_reporting_periods",
  description: "Reporting periods (label + dates + status) for choosing metric windows.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  async run(ctx) {
    const { data } = await ctx.actor.supabase
      .from("reporting_periods")
      .select("id, label, period_type, start_date, end_date, status")
      .eq("organization_id", ctx.organizationId)
      .order("start_date", { ascending: false })
      .limit(24);
    return data ?? [];
  },
};

export const DIRECTOR_TOOLS: DirectorTool[] = [
  getDataFreshness,
  getDataQuality,
  listMetrics,
  getMetric,
  listTrainers,
  getTrainerKpis,
  getRevenueSummary,
  getPayrollSummary,
  getClubSnapshot,
  listReportingPeriods,
];

export function getDirectorTool(name: string): DirectorTool | null {
  return DIRECTOR_TOOLS.find((t) => t.name === name) ?? null;
}
