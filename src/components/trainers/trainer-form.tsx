"use client";

import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  trainerClientSchema,
  type TrainerFormValues,
} from "@/lib/schemas/trainer";
import type { ActionState } from "@/lib/actions/shared";

interface Option {
  id: string;
  name: string;
}

interface Props {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  defaults?: Partial<TrainerFormValues>;
  trainerId?: string;
  /** Create-mode only: organization + title + departments. */
  organizations?: Option[];
  departmentsByOrg?: Record<string, Option[]>;
}

export function TrainerForm({
  action,
  submitLabel,
  defaults,
  trainerId,
  organizations,
  departmentsByOrg,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {}
  );

  const {
    register,
    watch,
    formState: { errors, isDirty },
  } = useForm<TrainerFormValues>({
    resolver: zodResolver(trainerClientSchema),
    mode: "onBlur",
    defaultValues: {
      firstName: "",
      lastName: "",
      displayName: "",
      email: "",
      phone: "",
      employmentStatus: "active",
      hireDate: "",
      separationDate: "",
      notes: "",
      setmoreId: "",
      acuityId: "",
      ...defaults,
    },
  });

  // Unsaved-change protection.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const selectedOrg = watch("firstName"); // keep RHF subscribed; org handled natively
  void selectedOrg;

  const isCreate = Boolean(organizations && organizations.length > 0);
  const duplicateWarning = state.data?.duplicateWarning === "true";

  const inputClass =
    "h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm focus:border-accent";
  const labelClass = "mb-1 block text-sm font-medium text-ink";
  const errorClass = "mt-1 text-xs text-negative";

  return (
    <form action={formAction} className="max-w-3xl space-y-5">
      {state.error && (
        <p
          role="alert"
          className={`rounded-[--radius-control] px-3 py-2 text-sm ${
            duplicateWarning
              ? "bg-warning-soft text-warning"
              : "bg-negative-soft text-negative"
          }`}
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-[--radius-control] bg-positive-soft px-3 py-2 text-sm text-positive">
          {state.message}
        </p>
      )}
      {duplicateWarning && (
        <label className="flex items-center gap-2 rounded-[--radius-control] border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          <input type="checkbox" name="confirmDuplicate" value="true" className="h-4 w-4" />
          I reviewed the possible duplicates — create this trainer anyway.
        </label>
      )}
      {trainerId && <input type="hidden" name="trainerId" value={trainerId} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={labelClass}>First name</label>
          <input id="firstName" {...register("firstName")} name="firstName" className={inputClass} />
          {errors.firstName && <p className={errorClass}>{errors.firstName.message}</p>}
        </div>
        <div>
          <label htmlFor="lastName" className={labelClass}>Last name</label>
          <input id="lastName" {...register("lastName")} name="lastName" className={inputClass} />
          {errors.lastName && <p className={errorClass}>{errors.lastName.message}</p>}
        </div>
        <div>
          <label htmlFor="displayName" className={labelClass}>
            Display name <span className="font-normal text-ink-muted">(as it appears on schedules)</span>
          </label>
          <input id="displayName" {...register("displayName")} name="displayName" className={inputClass} />
          {errors.displayName && <p className={errorClass}>{errors.displayName.message}</p>}
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" type="email" {...register("email")} name="email" className={inputClass} />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input id="phone" {...register("phone")} name="phone" className={inputClass} />
        </div>
        <div>
          <label htmlFor="employmentStatus" className={labelClass}>Employment status</label>
          <select id="employmentStatus" {...register("employmentStatus")} name="employmentStatus" className={inputClass}>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="separated">Separated</option>
          </select>
        </div>
        <div>
          <label htmlFor="hireDate" className={labelClass}>Hire date</label>
          <input id="hireDate" type="date" {...register("hireDate")} name="hireDate" className={inputClass} />
        </div>
        <div>
          <label htmlFor="separationDate" className={labelClass}>Separation date</label>
          <input id="separationDate" type="date" {...register("separationDate")} name="separationDate" className={inputClass} />
        </div>
        <div>
          <label htmlFor="setmoreId" className={labelClass}>Setmore staff ID</label>
          <input id="setmoreId" {...register("setmoreId")} name="setmoreId" className={inputClass} />
        </div>
        <div>
          <label htmlFor="acuityId" className={labelClass}>Acuity calendar ID</label>
          <input id="acuityId" {...register("acuityId")} name="acuityId" className={inputClass} />
        </div>
      </div>

      {isCreate && organizations && (
        <fieldset className="space-y-4 rounded-[--radius-card] border border-border bg-surface-subtle p-4">
          <legend className="px-1 text-sm font-semibold text-ink">
            Initial organization assignment
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="organizationId" className={labelClass}>Organization</label>
              <select id="organizationId" name="organizationId" className={inputClass}>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="title" className={labelClass}>Role / title in organization</label>
              <input id="title" name="title" defaultValue="Trainer" className={inputClass} />
            </div>
          </div>
          {departmentsByOrg && (
            <div>
              <p className={labelClass}>Departments</p>
              {organizations.map((org) => (
                <div key={org.id} className="mb-2">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {org.name}
                  </p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {(departmentsByOrg[org.id] ?? []).map((dept) => (
                      <label key={dept.id} className="flex items-center gap-2 text-sm text-ink-secondary">
                        <input type="checkbox" name="departmentIds" value={dept.id} className="h-4 w-4" />
                        {dept.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-ink-muted">
                Department checkboxes apply to the selected organization only;
                cross-organization selections are rejected server-side.
              </p>
            </div>
          )}
        </fieldset>
      )}

      <div>
        <label htmlFor="notes" className={labelClass}>Notes</label>
        <textarea id="notes" rows={3} {...register("notes")} name="notes"
          className="w-full rounded-[--radius-control] border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm focus:border-accent" />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-[--radius-control] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {isDirty && !pending && (
          <span className="text-xs text-ink-muted">Unsaved changes</span>
        )}
      </div>
    </form>
  );
}
