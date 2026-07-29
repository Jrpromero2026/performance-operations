"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  requestPasswordReset,
  type AuthFormState,
} from "@/lib/auth/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-bits";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Enter your email and we&apos;ll send a reset link if an account
          exists.
        </p>
      </div>
      <FormAlert state={state} />
      {!state.message && (
        <>
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <SubmitButton>Send reset link</SubmitButton>
        </>
      )}
      <p className="text-center text-sm">
        <Link
          href="/login"
          className="font-medium text-accent hover:text-accent-strong"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
