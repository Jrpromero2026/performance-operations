"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/actions/shared";

interface Option {
  id: string;
  name: string;
}

export interface ServiceFormDefaults {
  organizationId?: string;
  categoryId?: string;
  internalName?: string;
  displayName?: string;
  description?: string;
  defaultDurationMinutes?: number;
  status?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  flags?: Partial<Record<FlagName, boolean>>;
  departmentIds?: string[];
}

type FlagName =
  | "countsAsSession"
  | "countsAsCoachingHours"
  | "payrollEligible"
  | "revenueEligible"
  | "isEvaluation"
  | "isTeamTraining"
  | "isNutrition"
  | "isGroupTraining";

const FLAGS: { name: FlagName; label: string; hint?: string }[] = [
  { name: "countsAsSession", label: "Counts as a completed coaching session" },
  { name: "countsAsCoachingHours", label: "Counts toward coaching hours" },
  { name: "payrollEligible", label: "Potentially payroll eligible" },
  { name: "revenueEligible", label: "Potentially revenue eligible" },
  { name: "isEvaluation", label: "Represents an evaluation" },
  { name: "isTeamTraining", label: "Represents team training" },
  { name: "isNutrition", label: "Represents nutrition" },
  { name: "isGroupTraining", label: "Represents group training" },
];

export function ServiceForm({
  action,
  submitLabel,
  serviceId,
  organizations,
  categoriesByOrg,
  departmentsByOrg,
  defaults = {},
  organizationLocked = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  serviceId?: string;
  organizations: Option[];
  categoriesByOrg: Record<string, Option[]>;
  departmentsByOrg: Record<string, Option[]>;
  defaults?: ServiceFormDefaults;
  organizationLocked?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );
  const [orgId, setOrgId] = useState(
    defaults.organizationId ?? organizations[0]?.id ?? ""
  );

  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent";
  const labelClass = "mb-1 block text-sm font-medium text-ink";

  const categories = categoriesByOrg[orgId] ?? [];
  const departments = departmentsByOrg[orgId] ?? [];
  const flagDefaults: Record<FlagName, boolean> = {
    countsAsSession: true,
    countsAsCoachingHours: true,
    payrollEligible: true,
    revenueEligible: true,
    isEvaluation: false,
    isTeamTraining: false,
    isNutrition: false,
    isGroupTraining: false,
    ...defaults.flags,
  };

  return (
    <form action={formAction} className="max-w-3xl space-y-5">
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
      {serviceId && <input type="hidden" name="serviceId" value={serviceId} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="svc-org" className={labelClass}>Organization</label>
          {organizationLocked ? (
            <>
              <input type="hidden" name="organizationId" value={orgId} />
              <input
                id="svc-org"
                value={organizations.find((o) => o.id === orgId)?.name ?? ""}
                readOnly
                className={`${inputClass} bg-surface-sunken text-ink-muted`}
              />
            </>
          ) : (
            <select id="svc-org" name="organizationId" value={orgId}
              onChange={(e) => setOrgId(e.target.value)} className={inputClass}>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label htmlFor="svc-category" className={labelClass}>Category</label>
          <select id="svc-category" name="categoryId" defaultValue={defaults.categoryId}
            className={inputClass}>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="svc-internal" className={labelClass}>
            Internal name <span className="font-normal text-ink-muted">(unique per organization)</span>
          </label>
          <input id="svc-internal" name="internalName" required maxLength={200}
            defaultValue={defaults.internalName} className={inputClass} />
        </div>
        <div>
          <label htmlFor="svc-display" className={labelClass}>Display name</label>
          <input id="svc-display" name="displayName" required maxLength={200}
            defaultValue={defaults.displayName} className={inputClass} />
        </div>
        <div>
          <label htmlFor="svc-duration" className={labelClass}>Default duration (minutes)</label>
          <input id="svc-duration" name="defaultDurationMinutes" type="number" min={1} max={1440}
            required defaultValue={defaults.defaultDurationMinutes ?? 60} className={inputClass} />
        </div>
        <div>
          <label htmlFor="svc-status" className={labelClass}>Status</label>
          <select id="svc-status" name="status" defaultValue={defaults.status ?? "active"} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label htmlFor="svc-from" className={labelClass}>Effective from</label>
          <input id="svc-from" name="effectiveFrom" type="date" required
            defaultValue={defaults.effectiveFrom ?? new Date().toISOString().slice(0, 10)}
            className={inputClass} />
        </div>
        <div>
          <label htmlFor="svc-to" className={labelClass}>Effective to (optional)</label>
          <input id="svc-to" name="effectiveTo" type="date"
            defaultValue={defaults.effectiveTo} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="svc-description" className={labelClass}>Description</label>
        <textarea id="svc-description" name="description" rows={2} maxLength={2000}
          defaultValue={defaults.description}
          className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-accent" />
      </div>

      <fieldset className="rounded-[--radius-card] border border-border bg-surface-subtle p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Classification</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {FLAGS.map((flag) => (
            <label key={flag.name} className="flex items-center gap-2 text-sm text-ink-secondary">
              <input type="checkbox" name={flag.name}
                defaultChecked={flagDefaults[flag.name]} className="h-4 w-4" />
              {flag.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Classification describes what this service represents. Final payroll
          and revenue-recognition behavior is configured in later phases.
        </p>
      </fieldset>

      {!serviceId && (
        <fieldset className="rounded-[--radius-card] border border-border bg-surface-subtle p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Departments</legend>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {departments.map((dept) => (
              <label key={dept.id} className="flex items-center gap-2 text-sm text-ink-secondary">
                <input type="checkbox" name="departmentIds" value={dept.id}
                  defaultChecked={defaults.departmentIds?.includes(dept.id)} className="h-4 w-4" />
                {dept.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <button type="submit" disabled={pending}
        className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
