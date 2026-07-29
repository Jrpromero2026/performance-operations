import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getActorContext } from "@/lib/actions/shared";
import {
  getConfigStats,
  readinessChecklist,
} from "@/lib/data/config-stats";
import { getOverviewData } from "@/lib/data/overview";
import { getPeriodContext } from "@/lib/period/server";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Overview" };

const FINANCIAL_KPIS = [
  { label: "Revenue", hint: "Awaiting Import Center" },
  { label: "Payroll", hint: "Not yet calculated" },
  { label: "Sessions", hint: "No imported data" },
  { label: "Active Clients", hint: "No imported data" },
  { label: "Revenue per Session", hint: "Awaiting Import Center" },
  { label: "Payroll Percentage", hint: "Not yet calculated" },
];

export default async function OverviewPage() {
  const context = await getWorkspaceContext();
  const periods = await getPeriodContext(context);
  const data = await getOverviewData(context);

  const workspaceName =
    context.selection.kind === "all"
      ? "All Workspaces"
      : context.selected?.name ?? "No workspace";

  const orgsInScope =
    context.selection.kind === "organization"
      ? context.options.filter(
          (o) =>
            context.selection.kind === "organization" &&
            o.id === context.selection.organizationId
        )
      : context.options;

  const actor = context.mode === "live" ? await getActorContext() : null;
  const stats = actor ? await getConfigStats(actor, orgsInScope) : [];
  const trainerCount = stats.reduce((n, s) => n + s.activeTrainers, 0);
  const serviceCount = stats.reduce((n, s) => n + s.activeServices, 0);
  const departmentCount = stats.reduce((n, s) => n + s.departments, 0);
  const compensated = stats.reduce((n, s) => n + s.trainersWithCompensation, 0);

  const warnings = stats.flatMap((orgStats) =>
    readinessChecklist(orgStats)
      .filter((item) => !item.done)
      .slice(0, 3)
      .map((item) => ({
        org: orgStats.organizationName,
        label: item.label,
        detail: item.detail,
      }))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={workspaceName}
        description={
          context.selection.kind === "all"
            ? "Cross-organization view. Metrics aggregate every organization you can access."
            : "Operational overview for the selected workspace."
        }
        actions={
          periods.selected ? (
            <span className="inline-flex h-9 items-center gap-2 rounded-[--radius-control] border border-border bg-surface px-3 text-sm font-medium text-ink">
              {periods.selected.label}
              <StatusBadge status={periods.selected.status} />
            </span>
          ) : (
            <span className="inline-flex h-9 items-center rounded-[--radius-control] border border-dashed border-border-strong bg-surface px-3 text-sm text-ink-muted">
              {periods.selectable
                ? "No reporting period selected"
                : "Reporting period: n/a"}
            </span>
          )
        }
      />

      {context.mode === "offline" && (
        <div className="rounded-[--radius-card] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <strong className="font-semibold">Offline preview.</strong> Explicit
          development mode with no Supabase connection — structure only, no
          real data.
        </div>
      )}

      <section aria-label="Financial indicators">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FINANCIAL_KPIS.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} hint={kpi.hint} />
          ))}
        </div>
      </section>

      {context.mode === "live" && (
        <section aria-label="Configuration counts">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Active Trainers" value={`${trainerCount}`}
              hint={`${compensated} with compensation assigned`} />
            <KpiCard label="Departments" value={`${departmentCount}`} />
            <KpiCard label="Active Services" value={`${serviceCount}`} />
            <KpiCard
              label="Comp. Completeness"
              value={trainerCount > 0 ? `${compensated}/${trainerCount}` : "—"}
              hint={
                trainerCount === 0
                  ? "No trainers yet"
                  : compensated === trainerCount
                    ? "All trainers covered"
                    : "Assignments missing"
              }
            />
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section aria-label="Department summary"
          className="xl:col-span-2 rounded-[--radius-card] border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Departments</h2>
            <span className="text-xs text-ink-muted">{data.departments.length} total</span>
          </div>
          {data.departments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              No departments visible in this workspace.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Organization</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((dept) => (
                  <tr key={dept.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-ink">{dept.name}</td>
                    <td className="px-4 py-2.5 text-ink-secondary">{dept.organizationName}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={dept.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-6">
          <section aria-label="Setup warnings"
            className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Setup warnings</h2>
              <Link href="/configuration" className="text-xs font-medium text-accent hover:text-accent-strong">
                Configuration →
              </Link>
            </div>
            {warnings.length === 0 && context.mode === "live" ? (
              <p className="px-4 py-5 text-sm text-positive">
                All tracked setup items are complete for this scope.
              </p>
            ) : (
              <ul className="px-4 py-3 space-y-2">
                {warnings.slice(0, 8).map((warning, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    <span className="text-ink-secondary">
                      <span className="font-medium text-ink">{warning.org}:</span>{" "}
                      {warning.label}
                      {warning.detail && (
                        <span className="font-mono text-xs text-ink-muted"> ({warning.detail})</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Import readiness"
            className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Import readiness</h2>
            </div>
            <div className="px-4 py-3 text-sm text-ink-secondary">
              <p>
                The Import Center (Phase 3) needs: sample Setmore and Acuity
                exports, service aliases mapped, trainer roster complete, and
                reporting-period rules confirmed.
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                Full list: <span className="font-mono">docs/INPUTS_REQUIRED.md</span>
              </p>
            </div>
          </section>
        </div>
      </div>

      <section aria-label="Recent audit activity"
        className="rounded-[--radius-card] border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Recent audit activity</h2>
          <Link href="/audit" className="text-xs font-medium text-accent hover:text-accent-strong">
            Full audit log →
          </Link>
        </div>
        {data.auditEvents.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-muted">
            No audit events recorded for this workspace yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.auditEvents.map((event) => (
              <li key={event.id} className="flex items-baseline gap-3 px-4 py-2">
                <span className="font-mono text-xs text-ink-muted">
                  {new Date(event.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span className="text-sm text-ink">
                  <span className="font-medium">{event.entityType}</span>{" "}
                  <span className="text-ink-secondary">
                    {event.action.replaceAll("_", " ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
