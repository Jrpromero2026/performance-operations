"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions/shared";

/**
 * Setup step 1. Four questions, then the wizard moves on — everything
 * else the old configuration path asked for is either derived from the
 * schedule upload (trainers, services, aliases, departments) or deferred
 * to Settings (members, integrations).
 */

const TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const FREQUENCIES = [
  { value: "semi_monthly", label: "Twice a month (1st–15th, 16th–end)" },
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "custom", label: "Something else — I'll set the dates myself" },
];

export function OrganizationForm({
  action,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent";
  const labelClass = "mb-1 block text-sm font-medium text-ink";
  const hintClass = "mt-1 text-sm text-ink-muted";

  return (
    <form action={formAction} className="max-w-xl space-y-6" data-testid="setup-organization-form">
      {state.error && (
        <p
          role="alert"
          className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative"
        >
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="org-name" className={labelClass}>
          What is your gym called?
        </label>
        <input
          id="org-name"
          name="name"
          required
          maxLength={120}
          autoComplete="organization"
          className={inputClass}
          placeholder="Timberhill Athletic Club"
        />
        <p className={hintClass}>This is the workspace name your team will see.</p>
      </div>

      <div>
        <label htmlFor="org-timezone" className={labelClass}>
          Time zone
        </label>
        <select id="org-timezone" name="timezone" required defaultValue="America/Los_Angeles" className={inputClass}>
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className={hintClass}>
          Appointment times in your schedule exports are read in this zone.
        </p>
      </div>

      <div>
        <label htmlFor="org-frequency" className={labelClass}>
          How often do you run payroll?
        </label>
        <select
          id="org-frequency"
          name="payrollFrequency"
          required
          defaultValue="semi_monthly"
          className={inputClass}
        >
          {FREQUENCIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className={hintClass}>
          We generate your pay periods from this. Reporting uses the same
          periods, so your reports and your payroll always cover the same
          dates. You can change the dates later.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-[--radius-control] bg-accent px-4 text-sm font-medium text-surface shadow-sm hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}
