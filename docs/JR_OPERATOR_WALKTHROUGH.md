# JR Operator Walkthrough

Exact browser walkthrough for operating Performance Operations during
the internal pilot. Route paths and button labels are the real current
ones.

## Initial setup

- **Start the app**: `npm run dev` in
  `C:\Users\JR\performance-operations`, then open
  http://localhost:3000. Requires `.env.local` (already present, never
  committed) with the `performance-operations-dev` Supabase values.
- **Sign in**: `/login` with **jrpromero16@gmail.com**. If you still use
  the bootstrap password from `.env.local`, change it now via **Forgot
  password?**.
- **Do not use** `e2e-admin@perfops.local` — that account belongs to the
  automated test suite.
- **Workspace**: header → Workspace selector. Pilot work happens ONLY in
  workspaces whose names end in **"(Pilot)"** (created via
  `supabase/pilot/seed-pilot-organizations.sql` after you confirm the
  names). "Timberhill Athletic Club" and "G3 Sports & Fitness" WITHOUT
  the suffix are the test sandboxes — everything inside them (trainers
  like "Payton E2E Payroll", service "E2E Signature 60", 2090-dated
  periods) is synthetic.
- **Reporting period**: header → Reporting period selector. Almost every
  surface computes for the selected period; "No period selected" shows
  prompts instead of data.

## Organization setup (per pilot org)

| What | Where |
| --- | --- |
| Departments | seeded by the pilot script; department-scoped access via `/configuration/users` |
| Users / invites | `/configuration/users` → fill Invite form → send; roles: workspace_admin, payroll_manager, department_manager, trainer, viewer |
| Trainers/coaches | `/trainers` → **New trainer**; then on the trainer page: department assignment (+ effective date) |
| Trainer pay plan | `/trainers/<trainer>/compensation` → assign a published plan + effective date |
| Services | `/configuration/services` → **New service** (department, duration, price, payroll/session/evaluation flags) |
| Compensation plans | `/configuration/compensation` → **New plan** → add version → percentage tiers for the commission ladder → **Publish** the version |
| Reporting periods | `/configuration/reporting-periods` → **New period** (label, type, start/end) |
| Integrations (later) | `/configuration/integrations` — Setmore/Acuity API stay blocked until credentials exist; the pilot uses CSV |

## Import workflow (full detail: PILOT_IMPORT_RUNBOOK.md)

`/imports/new` → choose source (**Setmore** / **Acuity** / **Manual
CSV**) → choose file → **Upload & inspect** → batch page → **Review**
queues (map trainers, **Map service**, **Save mapping** for statuses,
check duplicates/blocked) → **Approval** → verify **Posting summary**
totals → **Acknowledge N warnings** → **Approve batch** → batch page →
**Post N rows…** → **Confirm post**. Undo = **Reverse batch…** (reason
required, whole batch, audited).

## Payroll workflow (full detail: FIRST_PAYROLL_VALIDATION.md)

`/payroll` → **New payroll run** (`/payroll/new`, pick the period) → run
page → **Calculate** → open **Review** (lines, exclusions, traces;
blocking issues must be resolved — an unassigned trainer is a blocking
issue by design) → adjustments at `/payroll/adjustments` (**Submit
adjustment** → **Approve**), manual time at `/payroll/time` → *Calculate*
again after changes → **Submit for approval** → **Approve run** → **Post
run** (freezes the snapshot) → statements at `/payroll/<run>/statements`
(print = browser print), register CSV at `/payroll/<run>/export` →
optionally **Lock run**. Undo before lock = **Reopen** (reason recorded);
replacement = **Void run** on the superseded draft.

## Reporting workflow

- `/overview` — Operations Center: readiness, alerts, pipeline state,
  recent activity.
- `/analytics` — landing; `/analytics/executive` (scorecard +
  comparisons + analytical summaries), `/analytics/scorecards` (six
  cards with department/trainer pickers), `/analytics/goals`,
  `/analytics/benchmarks`, `/analytics/cohorts`,
  `/analytics/dashboards`, `/analytics/presentation` (**Print / PDF**),
  `/analytics/datasets` (CSV downloads).
- `/reports` — Quick report (+ **Download report CSV**), Saved views,
  Scheduled (definitions + **Run now**; deliveries stay TEST MODE until
  a real provider is configured), Export history.

## Period close

`/period-close` → **Start period close** (`/period-close/new`, pick
period → **Start close review**) → close run page:
- **Readiness**: every check with live state; waivable warnings get
  **Acknowledge…** + a note (recorded); blocking checks must actually be
  fixed (e.g. approved-but-unposted batch).
- **Reports**: generate required packages (e.g. **Executive period
  package**).
- **Exports**: generate required CSVs (hash-verified downloads).
- **Approval**: **Complete review** → **Approve close** → execute.
  NOTE: with only you as operator, approval needs the org's
  self-approval close policy enabled — an explicit decision recorded in
  PILOT_INPUTS_REQUIRED.md, applied per organization on request.
- **Manifest**: frozen artifact list with hashes.
- Reopen: from the closed run, reopen with a recorded reason; close
  again produces a superseding close version.

## Operating cadence

- **Daily**: `/overview` — alerts, import batches awaiting action,
  notification bell.
- **Weekly**: import the week's export (or per your cadence);
  `/analytics/executive` with previous-period comparison; resolve any
  new unmapped aliases.
- **Each payroll period**: complete imports for the period → payroll run
  per the workflow above → statements + register export → reconcile
  against expectations BEFORE approving.
- **Before closing**: `/period-close` readiness green or acknowledged;
  payroll posted and reconciled; required packages + exports generated;
  then approve + execute; verify the manifest.
