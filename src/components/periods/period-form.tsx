"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/shared";

interface Option {
  id: string;
  name: string;
}

export interface PeriodFormDefaults {
  organizationId?: string;
  label?: string;
  periodType?: string;
  startDate?: string;
  endDate?: string;
  paymentDate?: string;
  notes?: string;
}

export function PeriodForm({
  action,
  submitLabel,
  periodId,
  organizations,
  defaults = {},
  organizationLocked = false,
  disabled = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  periodId?: string;
  organizations: Option[];
  defaults?: PeriodFormDefaults;
  organizationLocked?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );
  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent disabled:bg-surface-sunken disabled:text-ink-muted";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {state.error && (
        <p role="alert" className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-[--radius-control] bg-positive-soft px-3 py-2 text-sm text-positive">
          {state.message}
        </p>
      )}
      {periodId && <input type="hidden" name="periodId" value={periodId} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="period-org" className={labelClass}>Organization</label>
          {organizationLocked ? (
            <>
              <input type="hidden" name="organizationId" value={defaults.organizationId} />
              <input id="period-org" readOnly disabled
                value={organizations.find((o) => o.id === defaults.organizationId)?.name ?? ""}
                className={inputClass} />
            </>
          ) : (
            <select id="period-org" name="organizationId" defaultValue={defaults.organizationId}
              disabled={disabled} className={inputClass}>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label htmlFor="period-label" className={labelClass}>Name</label>
          <input id="period-label" name="label" required maxLength={120}
            placeholder="e.g. July 2026" defaultValue={defaults.label}
            disabled={disabled} className={inputClass} />
        </div>
        <div>
          <label htmlFor="period-type" className={labelClass}>Period type</label>
          <select id="period-type" name="periodType" defaultValue={defaults.periodType ?? "monthly"}
            disabled={disabled} className={inputClass}>
            <option value="monthly">Monthly (reporting)</option>
            <option value="semi_monthly">Semi-monthly (payroll)</option>
            <option value="biweekly">Biweekly (payroll)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label htmlFor="period-payment" className={labelClass}>Payment date (optional)</label>
          <input id="period-payment" name="paymentDate" type="date"
            defaultValue={defaults.paymentDate} disabled={disabled} className={inputClass} />
        </div>
        <div>
          <label htmlFor="period-start" className={labelClass}>Start date</label>
          <input id="period-start" name="startDate" type="date" required
            defaultValue={defaults.startDate} disabled={disabled} className={inputClass} />
        </div>
        <div>
          <label htmlFor="period-end" className={labelClass}>End date</label>
          <input id="period-end" name="endDate" type="date" required
            defaultValue={defaults.endDate} disabled={disabled} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="period-notes" className={labelClass}>Notes</label>
        <textarea id="period-notes" name="notes" rows={2} maxLength={2000}
          defaultValue={defaults.notes} disabled={disabled}
          className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-accent disabled:bg-surface-sunken" />
      </div>
      <p className="text-xs text-ink-muted">
        Periods of the same type may never overlap within an organization. A
        monthly reporting period and a semi-monthly payroll period may cover
        the same dates (documented rule).
      </p>
      {!disabled && (
        <button type="submit" disabled={pending}
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
          {pending ? "Saving…" : submitLabel}
        </button>
      )}
    </form>
  );
}

export function StatusTransitionButtons({
  periodId,
  status,
  canReopen,
  action,
}: {
  periodId: string;
  status: string;
  canReopen: boolean;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );

  const buttons: { label: string; newStatus: string; danger?: boolean; show: boolean }[] = [
    { label: "Open period", newStatus: "open", show: status === "draft" },
    { label: "Close period", newStatus: "closed", show: status === "open" },
    { label: "Re-open period", newStatus: "open", show: status === "closed" },
    { label: "Lock period", newStatus: "locked", danger: true, show: status === "closed" },
    { label: "Unlock (reopen)", newStatus: "closed", danger: true, show: status === "locked" && canReopen },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {buttons.filter((b) => b.show).map((button) => (
          <form key={button.label} action={formAction}>
            <input type="hidden" name="periodId" value={periodId} />
            <input type="hidden" name="newStatus" value={button.newStatus} />
            <button type="submit" disabled={pending}
              className={`h-9 rounded-[--radius-control] px-3.5 text-sm font-semibold disabled:opacity-60 ${
                button.danger
                  ? "bg-negative text-white hover:opacity-90"
                  : "border border-border bg-surface text-ink hover:bg-surface-sunken"
              }`}>
              {pending ? "Working…" : button.label}
            </button>
          </form>
        ))}
        {status === "locked" && !canReopen && (
          <p className="text-sm text-ink-muted">
            Locked. Only a platform admin can unlock this period.
          </p>
        )}
      </div>
      {state.error && <p role="alert" className="text-sm text-negative">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-positive">{state.message}</p>}
    </div>
  );
}
