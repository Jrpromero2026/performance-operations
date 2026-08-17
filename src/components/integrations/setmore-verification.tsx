"use client";

import { useActionState } from "react";
import type { VerificationState } from "@/lib/actions/setmore-verification";
import type { SetmoreVerificationReport } from "@/lib/sources/setmore/verify";

/**
 * Runs the Setmore live-verification probe and renders its findings.
 *
 * The report is structural by construction — the probe redacts before it
 * returns — so nothing rendered here can contain client identity.
 */
export function SetmoreVerificationPanel({
  action,
  connectionId,
  defaults,
}: {
  action: (prev: VerificationState, formData: FormData) => Promise<VerificationState>;
  connectionId: string;
  defaults: { startDate: string; endDate: string };
}) {
  const [state, formAction, pending] = useActionState<VerificationState, FormData>(action, {});

  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="connectionId" value={connectionId} />
        {state.error && (
          <p
            role="alert"
            className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative"
          >
            {state.error}
          </p>
        )}
        {state.message && (
          <p
            role="status"
            className="rounded-[--radius-control] bg-positive-soft px-3 py-2 text-sm text-positive"
          >
            {state.message}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="verify-start" className={labelClass}>
              Window start
            </label>
            <input
              id="verify-start"
              name="startDate"
              type="date"
              defaultValue={defaults.startDate}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="verify-end" className={labelClass}>
              Window end
            </label>
            <input
              id="verify-end"
              name="endDate"
              type="date"
              defaultValue={defaults.endDate}
              className={inputClass}
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 w-full items-center justify-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {pending ? "Probing…" : "Run probe"}
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          Read-only, one page, 31 days maximum. Setmore has no sandbox, so every request
          runs against the live account. Client details are deliberately not requested,
          and the report is structural only — no names, emails, phones or comments.
        </p>
      </form>

      {state.report && <VerificationReport report={state.report} />}
    </div>
  );
}

function Finding({
  title,
  verdict,
  tone,
  explanation,
  children,
}: {
  title: string;
  verdict: string;
  tone: "good" | "warn" | "unknown";
  explanation: string;
  children?: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "bg-positive-soft text-positive"
      : tone === "warn"
        ? "bg-warning-soft text-warning"
        : "bg-surface-sunken text-ink-muted";
  return (
    <article className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
          {verdict.replace(/_/g, " ")}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{explanation}</p>
      {children}
    </article>
  );
}

function VerificationReport({ report }: { report: SetmoreVerificationReport }) {
  return (
    <section className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Appointments", report.appointmentCount],
          ["Staff", report.staffCount],
          ["Services", report.serviceCount],
          [
            "Token lifetime",
            report.tokenLifetimeSeconds !== null
              ? `${Math.round(report.tokenLifetimeSeconds / 86_400)}d`
              : "—",
          ],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-[--radius-card] border border-border bg-surface p-3 shadow-sm"
          >
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <Finding
        title="Appointment status"
        verdict={report.status.verdict}
        tone={report.status.verdict === "no_status_field" ? "warn" : "good"}
        explanation={report.status.explanation}
      >
        {report.status.labelValues.length > 0 && (
          <p className="mt-2 text-xs text-ink-muted">
            Observed <code>label</code> values: {report.status.labelValues.join(", ")}
          </p>
        )}
      </Finding>

      <Finding
        title="Occurrence identity"
        verdict={report.occurrenceIdentity.verdict}
        tone={
          report.occurrenceIdentity.verdict === "inconclusive"
            ? "unknown"
            : report.occurrenceIdentity.verdict === "series_level"
              ? "warn"
              : "good"
        }
        explanation={report.occurrenceIdentity.explanation}
      >
        <p className="mt-2 text-xs text-ink-muted">
          {report.occurrenceIdentity.distinctKeys} distinct key(s) across{" "}
          {report.occurrenceIdentity.appointmentCount} appointment(s);{" "}
          {report.occurrenceIdentity.keysWithMultipleStarts} key(s) appeared at more than
          one start.
        </p>
      </Finding>

      <Finding
        title="Cost unit"
        verdict={report.costUnit.recommendation}
        tone={report.costUnit.recommendation === "inconclusive" ? "unknown" : "good"}
        explanation={report.costUnit.explanation}
      >
        <p className="mt-2 text-xs text-ink-muted">
          Appointment costs: {report.costUnit.appointmentCostSamples.join(", ") || "—"} ·
          Service costs: {report.costUnit.serviceCostSamples.join(", ") || "—"}
        </p>
      </Finding>

      <div className="overflow-x-auto rounded-[--radius-card] border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2 font-medium">Field</th>
              <th className="px-4 py-2 font-medium">Present</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Distinct</th>
              <th className="px-4 py-2 font-medium">Sample values</th>
            </tr>
          </thead>
          <tbody>
            {report.fields.map((field) => (
              <tr key={field.field} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-ink">
                  <code>{field.field}</code>
                  {field.statusLike && (
                    <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
                      status-like
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums text-ink">{field.presentInRecords}</td>
                <td className="px-4 py-2 text-xs text-ink-muted">{field.types.join(", ")}</td>
                <td className="px-4 py-2 tabular-nums text-ink">{field.distinctCount}</td>
                <td className="px-4 py-2 text-xs text-ink-muted">
                  {field.sampleValues ? field.sampleValues.join(", ") : <em>redacted</em>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-[--radius-card] border border-border bg-surface p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-ink">Next actions</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-muted">
          {report.nextActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
