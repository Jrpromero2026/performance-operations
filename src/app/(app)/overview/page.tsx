import type { Metadata } from "next";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOverviewData } from "@/lib/data/overview";
import { getWorkspaceContext } from "@/lib/workspace/server";

export const metadata: Metadata = { title: "Overview" };

const KPI_CARDS = [
  { label: "Revenue", hint: "Posted appointment revenue for the period" },
  { label: "Payroll", hint: "Approved payroll for the period" },
  { label: "Sessions", hint: "Completed, payable sessions" },
  { label: "Active Clients", hint: "Clients with sessions in the period" },
  { label: "Revenue per Session", hint: "Revenue ÷ sessions" },
  { label: "Payroll Percentage", hint: "Payroll ÷ revenue" },
];

const SETUP_STEPS = [
  { label: "Application foundation", done: true },
  { label: "Database schema & security policies", done: true },
  { label: "Organizations & departments seeded", done: true },
  { label: "Supabase project connected", done: false },
  { label: "Users & roles invited", done: false },
  { label: "Trainer roster entered", done: false },
  { label: "Reporting periods defined", done: false },
  { label: "First appointment import", done: false },
];

const IMPORT_INPUTS = [
  "Setmore CSV export",
  "Acuity CSV export",
  "Trainer roster",
  "Service list",
  "Compensation rules",
  "Reporting-period rules",
];

export default async function OverviewPage() {
  const context = await getWorkspaceContext();
  const data = await getOverviewData(context);

  const workspaceName =
    context.selection.kind === "all"
      ? "All Workspaces"
      : context.selected?.name ?? "No workspace";

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
          <span className="inline-flex h-9 items-center rounded-[--radius-control] border border-dashed border-border-strong bg-surface px-3 text-sm text-ink-muted">
            Reporting period: not yet defined
          </span>
        }
      />

      {data.source === "offline" && (
        <div className="rounded-[--radius-card] border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <strong className="font-semibold">Offline preview.</strong> Supabase
          is not configured (or no user is signed in), so this page mirrors the
          seed structure. Connect the dedicated Supabase project per the README
          to load real data.
        </div>
      )}

      <section aria-label="Key performance indicators">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {KPI_CARDS.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} hint={kpi.hint} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Department summary — real data */}
        <section
          aria-label="Department summary"
          className="xl:col-span-2 rounded-[--radius-card] border border-border bg-surface shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Departments</h2>
            <span className="text-xs text-ink-muted">
              {data.departments.length} total
            </span>
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
                  <tr
                    key={dept.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {dept.name}
                    </td>
                    <td className="px-4 py-2.5 text-ink-secondary">
                      {dept.organizationName}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={dept.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-6">
          {/* Setup progress */}
          <section
            aria-label="Setup progress"
            className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
          >
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Setup progress</h2>
            </div>
            <ul className="px-4 py-3 space-y-2">
              {SETUP_STEPS.map((step) => (
                <li key={step.label} className="flex items-center gap-2.5">
                  {step.done ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-positive-soft">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-2.5 w-2.5 text-positive"
                        aria-hidden
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-border-strong" />
                  )}
                  <span
                    className={`text-sm ${step.done ? "text-ink" : "text-ink-muted"}`}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Reporting periods */}
          <section
            aria-label="Reporting periods"
            className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
          >
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">
                Reporting periods
              </h2>
            </div>
            {data.reportingPeriods.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-muted">
                No reporting periods defined yet. Period rules are collected in{" "}
                <span className="font-mono text-xs">
                  docs/INPUTS_REQUIRED.md
                </span>
                .
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.reportingPeriods.map((period) => (
                  <li
                    key={period.id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {period.label}
                      </p>
                      <p className="font-mono text-xs text-ink-muted">
                        {period.startDate} → {period.endDate}
                      </p>
                    </div>
                    <StatusBadge status={period.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Import readiness */}
        <section
          aria-label="Import readiness"
          className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Import readiness</h2>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm text-ink-secondary">
              The Import Center needs these business inputs before it can be
              built accurately:
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {IMPORT_INPUTS.map((input) => (
                <li
                  key={input}
                  className="flex items-center gap-2 text-sm text-ink-muted"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  {input}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">
              Full list: <span className="font-mono">docs/INPUTS_REQUIRED.md</span>
            </p>
          </div>
        </section>

        {/* Recent audit activity */}
        <section
          aria-label="Recent audit activity"
          className="rounded-[--radius-card] border border-border bg-surface shadow-sm"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">
              Recent audit activity
            </h2>
          </div>
          {data.auditEvents.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-muted">
              No audit events recorded for this workspace yet. Events appear
              automatically as memberships, assignments, and periods change.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.auditEvents.map((event) => (
                <li key={event.id} className="px-4 py-2.5">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{event.entityType}</span>{" "}
                    <span className="text-ink-secondary">{event.action}</span>
                  </p>
                  <p className="font-mono text-xs text-ink-muted">
                    {new Date(event.createdAt).toISOString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
