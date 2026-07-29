"use client";

import { useActionState } from "react";
import {
  acceptInviteSignUp,
  acceptInviteSignedIn,
  type AuthFormState,
} from "@/lib/auth/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-bits";

interface InvitePreview {
  email: string;
  organizationName: string;
  roleName: string;
}

/** New user: choose a name + password; email is fixed by the invitation. */
export function AcceptInviteSignUpForm({
  token,
  preview,
}: {
  token: string;
  preview: InvitePreview;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    acceptInviteSignUp,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <InviteHeading preview={preview} />
      <FormAlert state={state} />
      {!state.message && (
        <>
          <input type="hidden" name="token" value={token} />
          <Field
            label="Email"
            name="emailDisplay"
            type="email"
            defaultValue={preview.email}
            readOnly
            required={false}
          />
          <Field label="Your name" name="fullName" autoComplete="name" />
          <Field
            label="Choose a password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
          />
          <SubmitButton>Create account &amp; join</SubmitButton>
        </>
      )}
    </form>
  );
}

/** Already signed in with the matching email: one-click accept. */
export function AcceptInviteSignedInForm({
  token,
  preview,
  signedInEmail,
}: {
  token: string;
  preview: InvitePreview;
  signedInEmail: string;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    acceptInviteSignedIn,
    {}
  );
  const emailMatches =
    signedInEmail.toLowerCase() === preview.email.toLowerCase();

  return (
    <form action={action} className="space-y-4">
      <InviteHeading preview={preview} />
      <FormAlert state={state} />
      {emailMatches ? (
        <>
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-ink-secondary">
            You are signed in as{" "}
            <span className="font-medium text-ink">{signedInEmail}</span>.
          </p>
          <SubmitButton>Accept invitation</SubmitButton>
        </>
      ) : (
        <p
          role="alert"
          className="rounded-[--radius-control] bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          This invitation is for {preview.email}, but you are signed in as{" "}
          {signedInEmail}. Sign out first, then reopen the invite link.
        </p>
      )}
    </form>
  );
}

function InviteHeading({ preview }: { preview: InvitePreview }) {
  return (
    <div>
      <h1 className="text-lg font-semibold text-ink">
        Join {preview.organizationName}
      </h1>
      <p className="mt-1 text-sm text-ink-secondary">
        You&apos;ve been invited as{" "}
        <span className="font-medium text-ink">{preview.roleName}</span>.
      </p>
    </div>
  );
}
