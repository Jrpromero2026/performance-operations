"use client";

import { useFormStatus } from "react-dom";
import type { AuthFormState } from "@/lib/auth/actions";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormAlert({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-[--radius-control] bg-negative-soft px-3 py-2 text-sm text-negative"
      >
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p
        role="status"
        className="rounded-[--radius-control] bg-positive-soft px-3 py-2 text-sm text-positive"
      >
        {state.message}
      </p>
    );
  }
  return null;
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  readOnly,
  required = true,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  readOnly?: boolean;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={`field-${name}`}
        className="mb-1 block text-sm font-medium text-ink"
      >
        {label}
      </label>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        readOnly={readOnly}
        required={required}
        minLength={minLength}
        className="h-10 w-full rounded-[--radius-control] border border-border bg-surface px-3 text-sm text-ink shadow-sm read-only:bg-surface-sunken read-only:text-ink-muted focus:border-accent"
      />
    </div>
  );
}
