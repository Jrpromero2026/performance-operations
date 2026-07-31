# Hosted Internal Pilot — Operator Runbook

Day-to-day operation of the hosted pilot at
`https://performance-operations.vercel.app`.

Companion documents:
[HOSTED_PILOT_DEPLOYMENT.md](HOSTED_PILOT_DEPLOYMENT.md) (what was built
and verified), [HOSTED_PILOT_ENVIRONMENT.md](HOSTED_PILOT_ENVIRONMENT.md)
(configuration inventory),
[HOSTED_PILOT_GO_NO_GO.md](HOSTED_PILOT_GO_NO_GO.md) (readiness verdict).

## Before first use — owner steps

These require the Supabase dashboard and cannot be done from here.

### 1. Set your password (required)

Your account exists on the pilot project with a random password that was
never recorded, so nobody — including Claude — can sign in as you.

1. Open the Supabase dashboard → project **performance-operations-pilot**
2. **Authentication → Users → `jrpromero16@gmail.com`**
3. Use the row menu to set a new password
4. Choose a password you do not use anywhere else

### 2. Configure authentication URLs (required for email links)

**Authentication → URL Configuration**

- **Site URL**: `https://performance-operations.vercel.app`
- **Redirect URLs**: add
  `https://performance-operations.vercel.app/auth/confirm` and
  `https://performance-operations.vercel.app/reset-password`

Password sign-in works without this. Password-reset and invitation links
will point at the wrong host until it is set.

### 3. Enable leaked-password protection (recommended)

**Authentication → Policies** (or Providers → Email) → enable checking
passwords against HaveIBeenPwned. This is the single open security-advisor
warning on the project.

## Signing in

1. Go to `https://performance-operations.vercel.app`
2. You are redirected to `/login`
3. Sign in with `jrpromero16@gmail.com` and the password you set

You should land on `/overview` with the workspace selector showing
**Timberhill Athletic Club (Pilot)** and **G3 Performance (Pilot)**.

**If sign-in bounces you back to the login page**, the deployment has
lost its database configuration. This is the failure mode described in
the deployment record. Confirm it and fix it:

```bash
npx vercel env ls production
```

Every `NEXT_PUBLIC_*` variable must show as non-sensitive. If any is
Sensitive, remove and re-add it with `--no-sensitive`, then redeploy:

```bash
npx vercel deploy --prod --yes --force
```

## What you will find in the pilot

Both organizations are **operationally empty by design**: departments and
service-category headings only. There are no trainers, services,
compensation plans, reporting periods, clients, appointments, or payroll
runs, because those encode real business rules that only you can confirm.

Work through `docs/PILOT_INPUTS_REQUIRED.md` before expecting any metric
to compute. In particular, the historical Timberhill commission ladder
(50% / 55% at $3k / 60% at $4.5k / 65% at $5.5k / 70% at $7k) is recorded
as **historical** and must not be activated as a current rule until you
confirm it — including the still-open question of whether the tiers are
cliff or marginal.

Suggested order, using the existing runbooks:
1. Reporting periods — `docs/PILOT_CONFIGURATION_INVENTORY.md`
2. Services and categories
3. Trainers
4. Compensation plans (only after confirming the ladder)
5. First import — `docs/IMPORT_RUNBOOK.md`
6. First payroll — `docs/PAYROLL_RUNBOOK.md` and
   `docs/FIRST_PAYROLL_VALIDATION.md`

## Routine operations

### Deploying a change

```bash
npx vercel deploy --prod --yes
```

Deploy only from a clean tree. After any deploy that touches
configuration, re-run the health check below.

### Health check

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://performance-operations.vercel.app/overview
```

Expect `307` to `/login?next=%2Foverview` when signed out. A `200` here
would mean route protection is off.

To confirm the app is talking to the pilot database, sign in and check
that the workspace selector shows the two `(Pilot)` organizations. If it
shows sandbox organizations, the deployment is pointed at the development
project — stop and fix the environment variables before entering data.

### Reading logs

```bash
npx vercel logs https://performance-operations.vercel.app
```

Add `--json` for full error messages and digests. Runtime errors surface
here; there is no error-reporting service configured for the pilot.

### Rotating the worker secret

`WORKER_SECRET` is stored write-only in Vercel and cannot be read back.
To rotate, generate a new value and set it without displaying it:

```bash
npx vercel env rm WORKER_SECRET production --yes
```

Then add the new value from your shell's clipboard or a generated string,
and redeploy. If you ever activate an integration, the same value must
also be stored in the pilot project's Vault as `worker_server_key` — see
[HOSTED_PILOT_ENVIRONMENT.md](HOSTED_PILOT_ENVIRONMENT.md).

### Adding another user

There is no organization-creation UI, but member invitation works:
**Configuration → Users → invite**. The invitation link is shown once at
creation — copy it then, because only its hash is stored. Email delivery
is test-mode in the pilot, so the link must be delivered by hand.

## Project and cost arrangement

Two Supabase projects exist, deliberately, and only one is paid:

| Project | Organization | Plan | Purpose |
| --- | --- | --- | --- |
| `performance-operations-pilot` | `JRSTRENGTHANDFITNESS` | Pro (~$10/mo compute) | Backs the hosted app. Real data. Automated backups. Never auto-pauses. |
| `performance-operations-dev` | a separate **Free** organization | Free ($0) | Test fixtures only. Target for the 82 live end-to-end tests. |

Supabase bills per project and does not allow mixing free and paid
projects in one organization, so the development project lives in its own
Free-plan organization. At 25 MB of database and under 100 KB of storage
it sits well inside the free 500 MB / 1 GB limits.

Two consequences to remember:

- **The dev project auto-pauses after about 7 days of inactivity.**
  Before running the live e2e suite, resume it from the dashboard and
  wait for it to come back up. This is harmless — it is the mechanism
  that makes it free.
- **A paused project is restorable for 90 days.** If dev sits untouched
  longer than that, treat it as gone. That is acceptable: it holds
  nothing irreplaceable and can be rebuilt from the migrations plus
  `seed.sql` plus the fixture seeds.

Never transfer the **pilot** project to a free organization. It holds
real business data, needs automated backups, and must not auto-pause
while it is serving the hosted app.

## Boundaries of this environment

- **Not production.** No backup policy has been established beyond
  Supabase's defaults, no uptime commitment, no on-call.
- **Email is test-mode.** Nothing is actually delivered. Scheduled report
  execution stays off per definition.
- **Integrations are disabled.** Setmore and Acuity are `blocked` in the
  provider catalogue pending credentials and representative sample data;
  no credential is stored anywhere.
- **The development project is separate.** Never point the hosted app at
  `performance-operations-dev`; automated test activity there would
  operationally contaminate pilot data.
- **Cleanup SQL is dangerous.** The recipes in the phase memories and
  runbooks target the development project. Check which project you are
  connected to before running destructive SQL.

## If you need to start over

The pilot database can be re-seeded from scratch: apply the migrations in
order, run the roles/permissions sections of `supabase/seed.sql`,
**re-run the grant blocks from migrations 12, 14, 19, 22 and 28** (they
insert nothing when roles do not yet exist), then run
`supabase/pilot/seed-pilot-organizations.sql`. Confirm the result with:

```sql
select (select count(*) from public.roles) as roles,
       (select count(*) from public.permissions) as permissions,
       (select count(*) from public.role_permissions) as grants;
```

Expect 6 / 99 / 279. Anything lower means the grant blocks did not run.
