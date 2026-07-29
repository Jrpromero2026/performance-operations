import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BOOTSTRAP_WORKSPACES } from "@/lib/workspace/constants";
import type { WorkspaceContext } from "@/lib/workspace/server";

/**
 * Data access for the Overview page. All reads are scoped by the validated
 * workspace context (never by raw client input); RLS re-enforces scope in
 * the database.
 */

export interface DepartmentSummary {
  id: string;
  name: string;
  organizationName: string;
  status: string;
}

export interface AuditEventSummary {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
}

export interface ReportingPeriodSummary {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface OverviewData {
  source: "database" | "offline";
  departments: DepartmentSummary[];
  reportingPeriods: ReportingPeriodSummary[];
  auditEvents: AuditEventSummary[];
}

export async function getOverviewData(
  context: WorkspaceContext
): Promise<OverviewData> {
  const supabase = await createSupabaseServerClient();

  if (!supabase || context.mode !== "live") {
    return offlineOverview(context);
  }

  const orgIds =
    context.selection.kind === "organization"
      ? [context.selection.organizationId]
      : context.options.map((o) => o.id);

  const orgNames = new Map(context.options.map((o) => [o.id, o.name]));

  const [departmentsRes, periodsRes, auditRes] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name, status, organization_id")
      .in("organization_id", orgIds)
      .order("name"),
    supabase
      .from("reporting_periods")
      .select("id, label, start_date, end_date, status")
      .in("organization_id", orgIds)
      .order("start_date", { ascending: false })
      .limit(6),
    supabase
      .from("audit_events")
      .select("id, action, entity_type, created_at")
      .in("organization_id", orgIds)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  type DeptRow = Pick<
    import("@/lib/supabase/types").DepartmentRow,
    "id" | "name" | "status" | "organization_id"
  >;
  type PeriodRow = Pick<
    import("@/lib/supabase/types").ReportingPeriodRow,
    "id" | "label" | "start_date" | "end_date" | "status"
  >;
  type AuditRow = Pick<
    import("@/lib/supabase/types").AuditEventRow,
    "id" | "action" | "entity_type" | "created_at"
  >;

  return {
    source: "database",
    departments: ((departmentsRes.data ?? []) as DeptRow[]).map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      organizationName: orgNames.get(d.organization_id) ?? "Unknown",
    })),
    reportingPeriods: ((periodsRes.data ?? []) as PeriodRow[]).map((p) => ({
      id: p.id,
      label: p.label,
      startDate: p.start_date,
      endDate: p.end_date,
      status: p.status,
    })),
    auditEvents: ((auditRes.data ?? []) as AuditRow[]).map((e) => ({
      id: e.id,
      action: e.action,
      entityType: e.entity_type,
      createdAt: e.created_at,
    })),
  };
}

function offlineOverview(context: WorkspaceContext): OverviewData {
  const selectedSlug =
    context.selection.kind === "organization"
      ? context.options.find(
          (o) =>
            context.selection.kind === "organization" &&
            o.id === context.selection.organizationId
        )?.slug
      : null;

  const workspaces = BOOTSTRAP_WORKSPACES.filter(
    (w) => selectedSlug == null || w.slug === selectedSlug
  );

  return {
    source: "offline",
    departments: workspaces.flatMap((w) =>
      w.departments.map((name) => ({
        id: `${w.slug}:${name}`,
        name,
        status: "active",
        organizationName: w.name,
      }))
    ),
    reportingPeriods: [],
    auditEvents: [],
  };
}
