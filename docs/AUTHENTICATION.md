# Performance Operations — Authentication

## Model

- **Supabase Auth** (email + password) with server-side session handling via
  `@supabase/ssr` cookies. No public self-registration: accounts become
  usable only through **invitations**.
- Route protection lives in [src/proxy.ts](../src/proxy.ts) (Next 16 proxy
  convention): when Supabase is configured, every non-public route requires a
  validated session (`auth.getUser()`, never the raw cookie). Unauthenticated
  requests redirect to `/login?next=…` (destination preserved, open-redirect
  guarded); authenticated users are bounced off `/login`. The app layout
  re-checks server-side as a backstop.
- An auth user **without** an accepted invitation has no profile and no
  memberships; deny-by-default RLS yields nothing. Orphaned signups are inert.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Password sign-in; shows notices for expired/invalid links |
| `/forgot-password` | Reset request — response never reveals whether an email exists |
| `/reset-password` | New password (requires the recovery session); expired links get a re-request screen |
| `/accept-invite?token=…` | Invitation preview + acceptance (new-user signup or signed-in accept) |
| `/auth/confirm` | Server endpoint verifying emailed one-time tokens (`verifyOtp`), routing recovery → reset, signup → invite completion |

## Invitation lifecycle

1. An authorized manager creates an invitation (`/configuration/users`):
   email, organization, role, optional departments. Server action checks
   `member:manage` **and** role grantability; a 32-byte token is generated,
   its **sha256 hash** stored (never the raw token), expiry 14 days. The link
   is displayed once for the manager to send.
2. The invitee opens `/accept-invite?token=…`. A security-definer preview
   function returns only safe fields (email, org name, role name, status).
3. New users choose a name + password → `signUp`. If email confirmation is
   enabled, the token is kept in an httpOnly cookie and acceptance completes
   automatically at `/auth/confirm`; otherwise acceptance runs immediately.
   Already-signed-in users (matching email) accept with one click.
4. `app.accept_invitation` (security definer, documented in migration 3)
   atomically validates (pending, unexpired, email match), creates the
   profile + organization membership (+ department memberships), marks the
   invitation accepted, and writes an audit event — no orphaned halves.
5. Managers can revoke pending invitations; expired ones are marked expired
   on first use attempt. Failure recovery: a failed acceptance leaves the
   invitation pending; the invitee just reopens the link.

## Failure and edge handling

- Invalid token → "invitation not found"; revoked/accepted → explicit state;
  expired → marked and messaged; email mismatch → explicit error telling the
  user to sign out first.
- Session refresh happens in the proxy on every request; expired sessions
  redirect to `/login` with the destination preserved.
- Password reset links are one-time; reusing/expiring them lands on a
  re-request screen — never a broken state.

## Offline preview containment

The UI-only offline preview requires **both** unset Supabase variables and
`NEXT_PUBLIC_DEV_OFFLINE_PREVIEW=true`. With production-style env vars
present it can never activate; unconfigured environments without the flag get
an explicit setup-required screen.

## Manual dashboard settings (dev project)

- **Site URL / redirect URLs**: set `http://localhost:3000` (and later real
  domains) under Auth → URL Configuration so emailed links resolve.
- **Email confirmation**: ON by default. For faster local invite testing you
  may disable "Confirm email"; the flow works either way.
- **Leaked-password protection**: enable under Auth → Passwords (flagged by
  the security advisor; cannot be set via SQL).
- **SMTP**: the built-in dev mailer is heavily rate-limited; configure real
  SMTP before inviting real users.
