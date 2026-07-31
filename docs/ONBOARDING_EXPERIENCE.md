# Onboarding Experience

The setup wizard: what an owner does, what the system does for them, and
which existing service each step calls.

Companion documents: `ONBOARDING_UX_AUDIT.md` (why the old flow failed),
`SERVICE_DISCOVERY.md` (how the file is read), `SETUP_READINESS.md`
(how "done" is decided).

## Shape

```
/setup                              step 1  create organization
/setup/[organizationId]             hub     progress + what's next
/setup/[organizationId]/upload      step 2  upload schedule
/setup/[organizationId]/trainers    step 3  review trainers
/setup/[organizationId]/services    step 4  review services
/setup/[organizationId]/compensation step 5 compensation          (pending)
/setup/[organizationId]/payroll     step 6  validate payroll      (pending)
/setup/[organizationId]/ready       step 7  ready                 (pending)
```

The wizard keeps **no progress state of its own**. Every step's
completion is derived from `readinessChecklist()` in
`src/lib/data/config-stats.ts`, whose items carry a `wizardStep`. Two
consequences worth stating plainly:

- The progress rail cannot drift out of sync with reality, because there
  is no second source of truth to drift from.
- Work done outside the wizard counts. An owner who adds a trainer from
  `/trainers` sees step 3 satisfied.

`nextIncompleteStep()` resolves where to resume, so an owner who leaves
mid-setup returns to the right place.

## Step 1 — Create organization

Asks four things: gym name, time zone, payroll frequency, and nothing
else. Creates the organization, gives the creator a platform-admin
membership so the workspace is reachable, and generates the reporting
period covering today.

Organization creation had **no UI before Phase 9.5** — `org:create` was
granted but organizations existed only as seed SQL. This is the one
genuinely new screen in the phase.

Authority stays with the database. `organizations_insert` requires
`app.is_platform_admin()`, and the action checks the same thing so it
fails closed in the UI rather than surfacing an RLS error.

### One deviation from the brief

The brief asked step 1 for both *reporting frequency* and *payroll
frequency*. The data model has a single `reporting_periods` table with
one `period_type`; there is no second period system. Asking two
questions would imply a capability that does not exist.

So the wizard asks **"How often do you run payroll?"**, maps the answer
onto `period_type`, and states in the help text that reporting uses the
same periods. Splitting reporting and payroll cycles would be a schema
change and a separate phase.

Period boundaries come from `planPeriods()`
(`src/lib/dates/period-plan.ts`), pure date arithmetic composing the
shipped `monthRangeOf` and `semiMonthlyRangesOf`. Monthly and
semi-monthly are calendar-derived. Biweekly has no natural calendar
anchor, so it generates forward in 14-day blocks from the month start
containing the span — reproducible for a given span rather than
dependent on when setup happened to run.

## Step 2 — Upload schedule

Reuses the shipped upload form and the shipped `uploadImportFile`
action. The wizard's upload **is** an ordinary import: duplicate-file
detection, adapter detection, staging, and matching all behave
identically, and the batch appears in `/imports` like any other.

What the wizard adds is framing — this upload exists to teach the system
your roster — and a path onward to the review steps.

Nothing posts to the ledger here. The file is parsed and held; approval
remains a separate, deliberate gate.

## Step 3 — Review trainers

Reads the staged rows of the most recent upload through
`getLatestBatchDiscovery()`, which reuses `loadLookups` for org-scoped
lookups and the shipped matcher for resolution. Nothing is
re-downloaded, re-parsed, or re-matched, so **a name shown as already
linked here is a name that will match at import time**.

Trainers already on the roster are listed but not selectable — there is
nothing to create. New names arrive pre-selected, with appointment
counts so the owner can see who matters.

### The mononym rule

A trainer record requires both a first and last name. A scheduling
export carries one display string. When that string has only one token
("Amanda"), no surname can be derived.

The wizard does not invent one. Those rows ask for a last name inline
and stay out of the selection until it is supplied, with the reason
stated: a fabricated surname would appear on payroll statements.
`splitTrainerName()` handles the ordinary cases — two-part names,
multi-part given names, generational suffixes, and the surname-first
comma form.

## Step 4 — Review services

Same source, same guarantees. The addition is **inline alias merging**,
which the audit identified as the sharpest case of implementation
leaking into the owner's job: `PT`, `Personal Training`, and `Personal
Training 60` are one service to an owner and several rows to the
database.

Groups arrive seeded from the discovery engine's conservative clusters,
which fold only duration and filler variants. Abbreviations are never
auto-grouped, because `PT` carries business meaning the code cannot
know. The owner checks "same as another service" on two or more rows and
merges them, choosing the canonical name.

Every observed spelling is recorded as a `service_source_alias`, so
matching is alias-driven from the first import onwards and the owner
never visits a separate alias screen.

## Bulk operations

`src/lib/actions/setup.ts` holds the bulk paths:
`bulkCreateTrainers`, `bulkCreateServices`, `bulkAssignCompensation`.

Each performs the same writes the existing single-entity screens
perform, in a loop, with the same permission checks and the same audit
events. **There is no bulk SQL path and no new business rule.** The
wizard's contribution is that the owner selects twenty rows once instead
of visiting twenty screens.

Failures are reported per row rather than failing the batch, so one bad
name cannot discard nineteen good ones.

Three schema facts these actions must respect, each verified against the
shipped actions rather than assumed:

- Services require a `category_id`. The wizard files new services under
  the organization's "Other" heading and leaves re-filing to the owner —
  guessing a taxonomy the export does not carry would be inventing
  business meaning.
- Service aliases use the `alias` column.
- Compensation assignments target a published plan **version** with a
  `purpose`, not a plan. `bulkAssignCompensation` verifies published
  status once per batch and ends any open `primary` assignment before
  inserting, because overlapping assignments are refused by the database
  and that constraint is the authority.

## What is still pending

Steps 5–7 are not built: the compensation plan library and bulk
assignment grid, the payroll validation wizard, and the ready state.
The bulk assignment action exists and is tested against the schema, but
has no screen yet.

Step 5 also carries a real business blocker rather than an engineering
one. The Timberhill commission ladder is recorded as *historical* in
`PILOT_INPUTS_REQUIRED.md`, and whether its tiers are cliff or marginal
(open question U1c) has never been answered. The wizard must offer the
ladder as a clearly-labelled template the owner confirms, and must never
preselect a tier method — `tier_behavior` is a first-class column the
payroll engine branches on, and defaulting it silently would produce
confident, wrong payroll.

`bulkAssignCompensation` already refuses unpublished plan versions, so
the path fails closed until that decision is made.
