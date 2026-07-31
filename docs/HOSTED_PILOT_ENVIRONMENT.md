# Hosted Pilot Environment

Environment-variable inventory for the Hosted Internal Pilot. Values are
never printed in docs, logs, or reports — names and classifications
only.

## Inventory

| Variable | Classification | Hosted pilot value policy |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe · Required · Pilot | The **pilot** Supabase project URL — never the dev project's |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe · Required · Pilot | Pilot project publishable key (RLS is the enforcement layer) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only · Optional · Development-only | **Unset in hosted pilot.** The app never requires it at runtime (admin/seeding scripts only); never `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_APP_URL` | Browser-safe · Required · Pilot | The hosted URL (absolute-URL generation) |
| `NEXT_PUBLIC_DEV_OFFLINE_PREVIEW` | Development-only · Test-only | **Unset/false in hosted pilot.** Double-gated: cannot activate when Supabase vars exist |
| `WORKER_SECRET` | Server-only · Required-for-worker · Pilot | **Fresh random value for the pilot** (never the dev value), generated in-shell and piped straight into Vercel — never displayed, stored, or committed. Header credential for `/api/worker`; also the key the DB compares against the `worker_server_key` Vault secret when decrypting integration credentials |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | Development-only · Test-only | **Never set in hosted environments** — local bootstrap convenience only |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Test-only | Never set in hosted environments; the e2e account exists only in the dev project |
| Email provider settings | Future production · Optional | None exist yet — delivery stays TEST MODE until a provider is approved (U10d/e) |
| Integration credentials (Setmore/Acuity) | Future production · Optional | None — stored in Supabase Vault via the credential form when they exist, never in env |
| Cron secret | Future production | Not applicable yet — no scheduler is configured; the worker is invoked on demand with `WORKER_SECRET` |
| Error-reporting DSN | Future production · Optional | None configured; Vercel runtime logs are the pilot's error surface |

## Validation behavior

`src/lib/env.ts` (zod): malformed present values **fail startup fast**
with variable names only (never values). Supabase variables are
optional-by-design so a misconfigured deployment degrades to the
explicit, safe "Supabase is not configured" shell instead of running
against a wrong database — there is no silent fallback and the offline
preview cannot activate while any Supabase variable is set.

## What JR must enter in Vercel (project → Settings → Environment Variables, Production)

1. `NEXT_PUBLIC_SUPABASE_URL` — from the pilot project (Settings → API).
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` — pilot publishable key.
3. `NEXT_PUBLIC_APP_URL` — the hosted URL.
4. `WORKER_SECRET` — the fresh pilot value.

(These were set via the authenticated Vercel CLI during the hosted
deployment; the list is the manual fallback and the audit record of
exactly which variables exist. All four are stored as Vercel
*Sensitive* variables, which are write-only — they cannot be read back
from the dashboard. Rotation is `vercel env rm <NAME> production`
followed by `vercel env add <NAME> production`.)

## Worker key posture (deliberate)

The `worker_server_key` Vault secret is **not provisioned** in the pilot
Supabase project. It exists only to let the server decrypt stored
*integration provider* credentials, and the pilot has none: Setmore and
Acuity are `blocked`, and no `integration_connections` rows exist. With
the Vault secret absent, `app.get_connection_secret_with_key` raises
`worker_key_not_provisioned` — the credential path is unreachable by
construction rather than by configuration.

To activate an integration later, provision the Vault secret with the
**same** value as `WORKER_SECRET`:

```sql
select vault.create_secret('<the WORKER_SECRET value>', 'worker_server_key',
  'Server-side worker key; must equal the WORKER_SECRET env value.');
```

Because `WORKER_SECRET` is write-only in Vercel, bringing the two into
lockstep means rotating both together: generate one new value, set it in
Vercel, and store that same value in Vault.

## Explicit exclusions

- No dev-project values are copied to hosted pilot (different Supabase
  project, different worker secret).
- No service-role key in any hosted environment.
- No test credentials in any hosted environment.
- No secret ever appears under a `NEXT_PUBLIC_*` name.
