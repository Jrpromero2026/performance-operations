"use client";

import { useActionState } from "react";
import { createPlan } from "@/lib/actions/compensation";
import type { ActionState } from "@/lib/actions/shared";
import {
  COMPENSATION_METHODS,
  humanize,
} from "@/lib/schemas/compensation";

export function PlanForm({
  organizations,
  defaultOrganizationId,
}: {
  organizations: { id: string; name: string }[];
  defaultOrganizationId?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createPlan,
    {}
  );
  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  return (
    <form action={action} className="max-w-2xl space-y-4">
      {state.error && (
        <p role="alert" className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plan-org" className={labelClass}>Organization</label>
          <select id="plan-org" name="organizationId" defaultValue={defaultOrganizationId} className={inputClass}>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="plan-name" className={labelClass}>Plan name</label>
          <input id="plan-name" name="name" required maxLength={160}
            placeholder="e.g. Senior Trainer Commission" className={inputClass} />
        </div>
        <div>
          <label htmlFor="plan-method" className={labelClass}>Compensation method</label>
          <select id="plan-method" name="compensationMethod" className={inputClass}>
            {COMPENSATION_METHODS.map((method) => (
              <option key={method} value={method}>{humanize(method)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="plan-tier" className={labelClass}>Tier behavior</label>
          <select id="plan-tier" name="tierBehavior" defaultValue="not_applicable" className={inputClass}>
            <option value="not_applicable">Not applicable (no tiers)</option>
            <option value="cliff">Cliff — whole revenue pays the reached tier&apos;s rate</option>
            <option value="marginal">Marginal — each tier&apos;s slice pays its own rate</option>
          </select>
        </div>
        <div>
          <label htmlFor="plan-from" className={labelClass}>Version 1 effective from</label>
          <input id="plan-from" name="effectiveFrom" type="date" required
            defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="plan-desc" className={labelClass}>Description</label>
        <textarea id="plan-desc" name="description" rows={2} maxLength={2000}
          className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-accent" />
      </div>
      <p className="rounded-[--radius-control] bg-info-soft px-3 py-2 text-xs text-info">
        The plan is created with a <strong>draft</strong> version 1. Add rules
        and tiers, then publish. Published versions are frozen; changes always
        create a new version. Whether tiers are cliff or marginal for
        Timberhill is an unresolved business decision — configure only
        confirmed rules.
      </p>
      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Creating…" : "Create plan (draft v1)"}
      </button>
    </form>
  );
}
