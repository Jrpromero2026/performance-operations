"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthFormState } from "@/lib/auth/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-bits";

const NOTICES: Record<string, string> = {
  invalid_link: "That link was invalid. Sign in or request a new one.",
  expired_link: "That link has expired. Sign in or request a new one.",
  signed_out: "You have been signed out.",
};

export function LoginForm({
  next,
  notice,
}: {
  next: string | null;
  notice: string | null;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(signIn, {});
  const noticeText = notice ? NOTICES[notice] : null;

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Use the email address your administrator invited.
        </p>
      </div>
      {noticeText && !state.error && (
        <p className="rounded-[--radius-control] bg-info-soft px-3 py-2 text-sm text-info">
          {noticeText}
        </p>
      )}
      <FormAlert state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
      />
      <SubmitButton>Sign in</SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-accent hover:text-accent-strong"
        >
          Forgot password?
        </Link>
      </p>
    </form>
  );
}
