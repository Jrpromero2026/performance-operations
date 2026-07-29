import { NextResponse } from "next/server";
import { getActorContext } from "@/lib/actions/shared";
import { hasPermissionInOrganization } from "@/lib/authz/authz";
import { getWorkspaceContext } from "@/lib/workspace/server";
import { getPeriodContext } from "@/lib/period/server";
import { IntelligenceSession } from "@/lib/intelligence/service";
import { formatMetricValue } from "@/lib/intelligence/format";

const REPORT_METRICS = [
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

/**
 * Report CSV export — serializes engine MetricResults verbatim (raw value +
 * formatted value + health + version). Records an export_events row.
 */
export async function GET() {
  const actor = await getActorContext();
  if (!actor) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  // Resolve workspace + period exactly like the app shell (validated
  // server-side; cookies are requests, never trusted).
  const workspace = await getWorkspaceContext();
  if (workspace.mode !== "live" || workspace.selection.kind !== "organization") {
    return NextResponse.json({ error: "no_workspace_selected" }, { status: 400 });
  }
  const organizationId = workspace.selection.organizationId;
  if (!hasPermissionInOrganization(workspace.memberships, organizationId, "appointment:read")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const periods = await getPeriodContext(workspace);
  const selected = periods.selected;
  if (!selected) {
    return NextResponse.json({ error: "no_period_selected" }, { status: 400 });
  }
  const period = {
    id: selected.id,
    label: selected.label,
    start_date: selected.startDate,
    end_date: selected.endDate,
  };

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

  await actor.supabase.from("export_events").insert({
    organization_id: organizationId,
    export_type: "metric_report",
    source_page: "reports",
    format: "csv",
    engine_version: "intel-v1",
    metadata: { period_id: period.id, metric_count: results.length },
    generated_by: actor.userId,
  });

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="metric-report-${period.start_date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
