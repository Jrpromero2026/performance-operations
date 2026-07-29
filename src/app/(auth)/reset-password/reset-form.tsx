"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePassword, type AuthFormState } from "@/lib/auth/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-bits";

export function ResetPasswordForm({ hasSession }: { hasSession: boolean }) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    updatePassword,
    {}
  );

  if (!hasSession) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-ink">Link expired</h1>
        <p className="text-sm text-ink-secondary">
          This password-reset link is invalid or has expired. Request a new one
          from the sign-in page.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex h-10 w-full items-center justify-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          At least 10 characters.
        </p>
      </div>
      <FormAlert state={state} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={10}
      />
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
