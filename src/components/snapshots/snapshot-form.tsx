"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/shared";

export interface SnapshotMetricField {
  key: string;
  label: string;
  definition: string;
}

export interface SnapshotSourceOption {
  key: string;
  label: string;
}

/**
 * Deliberately plain. This form is filled in once a month by an owner
 * reading numbers off another screen, so it optimizes for "type four
 * figures and leave", not for feature surface.
 *
 * Blank is meaningful: an untyped field records NO value, which is not
 * the same as recording zero. That distinction is enforced server-side
 * too, and it is why the inputs carry no default.
 */
export function SnapshotForm({
  action,
  organizations,
  sources,
  metrics,
  defaults,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: { id: string; name: string }[];
  sources: SnapshotSourceOption[];
  metrics: SnapshotMetricField[];
  defaults: { organizationId?: string; periodStart: string; periodEnd: string; asOfDate: string };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent disabled:bg-surface-sunken disabled:text-ink-muted";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="snapshot-org" className={labelClass}>
            Organization
          </label>
          <select
            id="snapshot-org"
            name="organizationId"
            defaultValue={defaults.organizationId ?? ""}
            className={inputClass}
            required
          >
            <option value="" disabled>
              Choose an organization
            </option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="snapshot-source" className={labelClass}>
            Source
          </label>
          <select
            id="snapshot-source"
            name="sourceKey"
            defaultValue={sources[0]?.key ?? ""}
            className={inputClass}
            required
          >
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="snapshot-start" className={labelClass}>
            Period start
          </label>
          <input
            id="snapshot-start"
            name="periodStart"
            type="date"
            defaultValue={defaults.periodStart}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="snapshot-end" className={labelClass}>
            Period end
          </label>
          <input
            id="snapshot-end"
            name="periodEnd"
            type="date"
            defaultValue={defaults.periodEnd}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="snapshot-asof" className={labelClass}>
            As-of date
          </label>
          <input
            id="snapshot-asof"
            name="asOfDate"
            type="date"
            defaultValue={defaults.asOfDate}
            className={inputClass}
            required
          />
          <p className="mt-1 text-xs text-ink-muted">
            The date you read the numbers — reports quote this.
          </p>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-[--radius-card] border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Values</legend>
        {metrics.map((metric) => (
          <div key={metric.key}>
            <label htmlFor={`metric-${metric.key}`} className={labelClass}>
              {metric.label}
            </label>
            <input
              id={`metric-${metric.key}`}
              name={`metric.${metric.key}`}
              type="text"
              inputMode="numeric"
              placeholder="Leave blank if unknown"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-ink-muted">{metric.definition}</p>
          </div>
        ))}
      </fieldset>

      <div>
        <label htmlFor="snapshot-note" className={labelClass}>
          Note (optional)
        </label>
        <textarea
          id="snapshot-note"
          name="note"
          rows={2}
          maxLength={1000}
          className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-accent"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save snapshot"}
      </button>
      <p className="text-xs text-ink-muted">
        Snapshots are permanent historical records. To correct a figure, record a new
        snapshot — the original is kept and marked superseded.
      </p>
    </form>
  );
}
