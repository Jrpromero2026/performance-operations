import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AcceptInviteSignedInForm,
  AcceptInviteSignUpForm,
} from "./accept-forms";

export const metadata: Metadata = { title: "Accept invitation" };

interface PreviewRow {
  email: string;
  organization_name: string;
  role_name: string;
  status: string;
  expires_at: string;
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token || token.length < 20) {
    return (
      <InviteProblem
        title="Invalid invitation link"
        body="This link is missing its invitation token. Use the full link from your administrator."
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <InviteProblem
        title="Not available"
        body="Authentication is not configured in this environment."
      />
    );
  }

  const { data } = await supabase.rpc("get_invitation_preview", {
    p_token: token,
  });
  const rows = (data ?? []) as PreviewRow[];
  const preview = rows[0];

  if (!preview) {
    return (
      <InviteProblem
        title="Invitation not found"
        body="This invitation link is invalid. Ask your administrator to send a new one."
      />
    );
  }
  if (preview.status !== "pending") {
    return (
      <InviteProblem
        title="Invitation no longer active"
        body={
          preview.status === "accepted"
            ? "This invitation was already accepted. Sign in with your account instead."
            : "This invitation was revoked or expired. Ask your administrator for a new one."
        }
        showLogin
      />
    );
  }
  if (new Date(preview.expires_at) <= new Date()) {
    return (
      <InviteProblem
        title="Invitation expired"
        body="This invitation has expired. Ask your administrator to send a new one."
      />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const previewProps = {
    email: preview.email,
    organizationName: preview.organization_name,
    roleName: preview.role_name,
  };

  return user?.email ? (
    <AcceptInviteSignedInForm
      token={token}
      preview={previewProps}
      signedInEmail={user.email}
    />
  ) : (
    <AcceptInviteSignUpForm token={token} preview={previewProps} />
  );
}

function InviteProblem({
  title,
  body,
  showLogin = false,
}: {
  title: string;
  body: string;
  showLogin?: boolean;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      <p className="text-sm text-ink-secondary">{body}</p>
      {showLogin && (
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-[--radius-control] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Go to sign in
        </Link>
      )}
    </div>
  );
}
