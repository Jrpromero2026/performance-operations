# Hosted Internal Pilot — Go / No-Go

**Verdict: CONDITIONAL GO** — 2026-07-31, deployment
`dpl_APBYpYR2AX48AW9dxnofBbYEgLsT`.

The hosted environment is verified and working. The conditions are owner
inputs, not defects: a password only the owner can set, authentication
URL configuration, and the business rules that were deliberately left
unseeded.

This is a **Hosted Internal Pilot**, not a production system.

## What is verified

| Area | Result |
| --- | --- |
| Schema parity with development | 84 tables, 219 policies, all migrations 1–32 |
| Permission matrix parity | 6 roles / 99 permissions / 279 grants, per-role fingerprints identical |
| RLS coverage | Enabled **and** forced on all 84 public tables |
| Security advisors | 1 WARN (leaked-password protection); no RLS or definer findings |
| Database identity | Hosted app provably reads the pilot project, not development |
| Unauthenticated access | Every protected route redirects to `/login`; worker endpoint blocked |
| Authentication lifecycle | Wrong password rejected; correct password issues a session |
| Session handling | Valid session renders `/overview`; `/login` redirects away |
| Workspace isolation (UI) | A Timberhill-only viewer saw only Timberhill; G3 absent |
| Permission gating (UI) | The same viewer was refused `/payroll` |
| RLS enforcement (API) | Cross-workspace reads empty; unauthorized writes rejected 403 |
| Secret hygiene | No service-role key, no test credentials, nothing secret under `NEXT_PUBLIC_*` |
| Pilot data state | Two organizations, nine departments, one user, zero operational records |

Full evidence is in
[HOSTED_PILOT_DEPLOYMENT.md](HOSTED_PILOT_DEPLOYMENT.md).

## Conditions before real use

1. **Set the account password.** The account was created with a random
   password that was never recorded. Nobody can sign in until the owner
   sets one from the Supabase dashboard. *(Blocking.)*
2. **Configure authentication URLs.** Site URL and redirect allowlist in
   the Supabase dashboard. Password sign-in works without this; password
   reset and invitation links do not. *(Blocking for those flows only.)*
3. **Confirm the compensation rules.** The historical Timberhill ladder
   remains unactivated, and cliff-versus-marginal is still unanswered. No
   payroll figure is trustworthy until this is settled.
   *(Blocking for payroll.)*
4. **Configure the pilot organizations.** Reporting periods, services,
   trainers, and compensation plans are all unseeded by design.
   *(Blocking for any metric.)*
5. **Reconcile the first payroll by hand** against
   `docs/FIRST_PAYROLL_VALIDATION.md` before trusting any output.
   *(Blocking for reliance.)*

## Accepted limitations

- Email delivery is test-mode; nothing is sent. Scheduled report
  execution stays off.
- Setmore and Acuity remain blocked — no credentials, and for Setmore no
  documented appointment status field, so canonical status mapping cannot
  be verified. Nothing about external provider validation has been
  assumed or fabricated.
- The Vault worker key is intentionally unprovisioned, leaving the
  integration credential path unreachable by construction.
- No custom domain; the app is on its `vercel.app` hostname.
- Leaked-password protection is off (one-click fix in the dashboard).
- `/revenue` and `/clients` remain placeholder routes, unchanged from the
  internal pilot assessment and not pilot-relevant.
- No backup, retention, or uptime commitments beyond platform defaults.

## Risk notes

**A healthy-looking deployment can be disconnected from its database.**
This happened here and was caught only by asserting on data known to
exist in the intended project. Pages rendered, routes were protected, TLS
was valid — and the app was in "not configured" mode, which would have
made login impossible. After any environment or deployment change, verify
that the workspace selector shows the two `(Pilot)` organizations rather
than assuming a 200 response means success.

**Fresh-database seeding has an ordering trap.** Five migrations grant
role permissions by joining `public.roles`; on a new project those run
before roles exist and grant nothing, silently. The count check in the
runbook (6 / 99 / 279) is the guard.

**Development activity must stay out.** The pilot has its own Supabase
project specifically because the worker claims jobs globally, e2e
fixtures hold platform-admin, and cleanup SQL is destructive wherever it
is pointed. Keep the two projects separate.

## Recommendation

Proceed with hosted internal pilot use once conditions 1 and 2 are done.
Treat every number as unverified until conditions 3–5 are complete. Do
not describe this environment as production, and do not put anyone else's
data in it until the first payroll has been reconciled by hand.
