# Onboarding UX Audit

Phase 9.5, first task. This audit measures what an owner must actually
do today to take a gym from "nothing" to "payroll I can trust", and
decides — screen by screen — what survives, what merges, what gets
inferred, and what moves behind Advanced.

**Nothing in this document proposes changing business logic.** Every
finding is about sequence, surfacing, and wording. The payroll engine,
import pipeline, matching engine, compensation engine, RLS policies, and
audit trail are treated as fixed assets to be *reused*, not revised.

## Method

Every route under `src/app/(app)` was inventoried, then traced to the
server action and data function behind it. For each screen the six
audit questions were answered from the code, not from assumption:
why it exists, who it serves, whether it can be inferred, delayed,
merged, or absorbed into a wizard.

## The current path, measured

To onboard one gym today an owner must complete **19 discrete steps
across 13 screens**, in an order the software never states:

| # | Step | Screen | Repeated per |
| --- | --- | --- | --- |
| 1 | Create organization | *(no UI — seed script)* | org |
| 2 | Create departments | *(no UI — seed script)* | department |
| 3 | Create reporting period | `/configuration/reporting-periods/new` | period |
| 4 | Create service | `/configuration/services/new` | **each service** |
| 5 | Add service alias | `/configuration/services/[serviceId]` | **each alias** |
| 6 | Create trainer | `/trainers/new` | **each trainer** |
| 7 | Assign trainer to org | `/trainers/[trainerId]/edit` | each trainer |
| 8 | Assign trainer to department | `/trainers/[trainerId]/edit` | each trainer |
| 9 | Create compensation plan | `/configuration/compensation/new` | plan |
| 10 | Add tiers | `/configuration/compensation/[planId]` | **each tier** |
| 11 | Add rules | `/configuration/compensation/[planId]` | **each rule** |
| 12 | Publish version | `/configuration/compensation/[planId]` | version |
| 13 | Assign plan to trainer | `/trainers/[trainerId]/compensation` | **each trainer** |
| 14 | Upload scheduling export | `/imports/new` | import |
| 15 | Map schema columns | `/imports/[batchId]/mapping` | import |
| 16 | Resolve trainer/service/client matches | `/imports/[batchId]/review` | **each unmatched row** |
| 17 | Approve batch | `/imports/[batchId]/approval` | import |
| 18 | Post batch | `/imports/[batchId]` | import |
| 19 | Create and calculate payroll run | `/payroll/new` → `/payroll/[runId]` | run |

Bolded rows are the ones that scale with the size of the gym. For a
20-trainer, 12-service organization this is not 19 actions — it is
roughly **120 form submissions**, every one of them typing information
that already exists inside the scheduling export the owner is about to
upload.

That is the whole problem in one sentence: **steps 4–13 ask the owner to
hand-type data that step 14 already contains.**

## Screen-by-screen audit

Legend — **Owner** = a gym owner has a reason to care; **Impl** =
exists because the data model needs it.

### Configuration hub

| Screen | Why it exists | Audience | Inferable | Delayable | Verdict |
| --- | --- | --- | --- | --- | --- |
| `/configuration` | Landing page listing config domains + setup readiness | Impl | — | — | **Merge.** Readiness becomes the wizard's progress model; the link farm is replaced by Settings → Advanced. |
| `/configuration/access` | Role/permission reference | Impl | — | Yes | **Move to Advanced.** Read-only reference; never needed to launch. |
| `/configuration/users` | Invite members, assign roles | Owner | No | Yes | **Delay.** A solo owner needs zero collaborators to run first payroll. Move to Settings; surface as an optional post-setup prompt. |

### Services

| Screen | Why it exists | Audience | Inferable | Delayable | Verdict |
| --- | --- | --- | --- | --- | --- |
| `/configuration/services` | List services | Owner | — | — | **Keep**, reframed as a review surface with bulk actions. |
| `/configuration/services/new` | Create one service | Impl | **Yes** | — | **Absorb into wizard Step 4.** Every service name is present in the export's service column. |
| `/configuration/services/[serviceId]` | Edit service, manage aliases, department links | Mixed | Partly | Yes | **Split.** Alias management moves inline into Step 4 as *Merge alias*; the rest becomes Advanced. |

Aliases are the sharpest example of implementation leaking into the
owner's job. `PT`, `Personal Training`, `Personal Training 60`, and
`60 Min PT` are one service to an owner and four rows to the database.
The owner should group them once, visually, at the moment they are
discovered — never on a separate screen reached later.

### Trainers

| Screen | Why it exists | Audience | Inferable | Delayable | Verdict |
| --- | --- | --- | --- | --- | --- |
| `/trainers` | Roster list | Owner | — | — | **Keep**, upgraded to operational cards with bulk actions. |
| `/trainers/new` | Create one trainer | Impl | **Yes** | — | **Absorb into wizard Step 3.** Names and appointment counts come from the export. |
| `/trainers/[trainerId]` | Trainer detail | Owner | — | — | **Redesign** into an operational dashboard (status, department, plan, imported appointments, current payroll, KPIs, source alias, last import, warnings). |
| `/trainers/[trainerId]/edit` | Edit identity + org/department assignment | Mixed | Partly | — | **Merge** into the trainer dashboard as inline edit. Department is bulk-assignable. |
| `/trainers/[trainerId]/compensation` | Assign a plan to one trainer | Impl | No | — | **Absorb into wizard Step 5** as a bulk assignment grid. This screen is the single worst offender: it is one navigation per trainer to set one dropdown. |

### Compensation

| Screen | Why it exists | Audience | Inferable | Delayable | Verdict |
| --- | --- | --- | --- | --- | --- |
| `/configuration/compensation` | Plan list | Owner | — | — | **Keep**, reframed as reusable plan library. |
| `/configuration/compensation/new` | Create plan shell | Owner | No | — | **Absorb into wizard Step 5.** |
| `/configuration/compensation/[planId]` | Tiers, rules, versions, publish | Owner | No | — | **Keep and elevate.** This is legitimately owner-facing and must show rules, effective dates, tier method, assigned trainers, payroll history, current version, publish, archive. |

Compensation is the one area where the owner's mental model and the
data model genuinely agree: a plan is a real business object, reused
across trainers. The failure today is not the plan editor — it is that
nothing makes plans feel reusable, so owners re-enter percentages per
trainer. The fix is assignment ergonomics, not a new engine.

**Tier method is already modeled.** `compensation_plans.tier_behavior`
is a constrained column (`cliff` | `marginal` | `not_applicable`) and
the payroll engine branches on it (`src/lib/payroll/engine.ts:277`). The
wizard surfaces it as an explicit, required choice with no default —
see Constraints.

### Reporting periods

| Screen | Why it exists | Audience | Inferable | Delayable | Verdict |
| --- | --- | --- | --- | --- | --- |
| `/configuration/reporting-periods` | Period list | Owner | — | — | **Keep** under Settings. |
| `/configuration/reporting-periods/new` | Create a period | Impl | **Partly** | — | **Absorb into wizard Step 1.** Asking for "reporting frequency" and "payroll frequency" once lets the system generate the periods covering the uploaded data's date range. |
| `/configuration/reporting-periods/[periodId]` | Edit/close a period | Owner | — | Yes | **Keep** under Settings. |

The export's own date range tells us which periods are needed. The
owner should answer *"how often do you pay?"* once, not draw calendar
boundaries by hand.

### Imports

| Screen | Why it exists | Audience | Inferable | Delayable | Verdict |
| --- | --- | --- | --- | --- | --- |
| `/imports` | Batch list | Owner | — | — | **Keep**, restyled as Upload → Review → Approve → Post → Done. |
| `/imports/new` | Upload | Owner | — | — | **Keep**, and reuse as wizard Step 2. |
| `/imports/[batchId]/mapping` | Column mapping | Impl | **Yes for Setmore** | — | **Auto-skip** when the adapter detects with confidence ≥ 0.8; show only on fallback. |
| `/imports/[batchId]/review` | Resolve matches, duplicates, statuses | Mixed | Partly | — | **Keep** — this is real reconciliation work — but pre-resolve everything the discovery step already created. |
| `/imports/[batchId]/approval` | Approve | Owner | No | — | **Keep.** Deliberate human gate before financial data lands. |

### Departments, integrations, and the rest

| Screen | Verdict |
| --- | --- |
| `/departments/[departmentId]` | **Keep** as a read surface; department creation is inferable from the export or answered once in Step 1. |
| `/configuration/integrations/*` (6 routes) | **Move to Advanced.** Setmore and Acuity are `blocked`; no owner can complete anything here today. |
| `/integrations/jobs`, `/integrations/deliveries` | **Move to Advanced.** Operator diagnostics, not owner tasks. |
| `/audit` | **Keep** where it is. Compliance surface, correctly separate. |
| `/revenue`, `/clients` | Placeholder routes. Out of scope for this phase; noted so they are not mistaken for regressions. |

## The asset this phase is built on

The single most important finding: **the discovery intelligence already
exists and is simply pointed at the wrong moment in time.**

`src/lib/imports/matching.ts` already derives, from an uploaded file:

- trainers (`matchTrainer`, `matchTrainerBySourceId`)
- services (`matchService`)
- clients (`matchClient`)
- duplicate candidates (`classifyDuplicate`, `occurrenceKey`)

`src/lib/imports/csv.ts` already derives delimiter, headers, and row
counts; `adapters/index.ts` already derives source format
(`detectAdapter`) and flags personal-data columns
(`detectSensitiveColumns`); `src/lib/actions/imports.ts` already
computes a content hash and detects re-uploads.

Today all of this runs **after** a batch exists, and its output is used
only to *complain* about things that do not match. The same functions,
run at upload time in read-only mode, produce exactly the discovery
lists Phase 9.5 wants: detected trainers with appointment counts,
detected services, alias clusters, statuses, and date range.

**No new parser. No new matching rules. No new SQL.** The discovery
engine is a read-only projection over functions that already ship.

## Findings

1. **Ten of nineteen steps ask for data the upload already contains.**
   Steps 4–13 are re-typing, not decisions.
2. **Five screens scale linearly with gym size.** Services, aliases,
   trainers, trainer assignment, and per-trainer plan assignment each
   cost one navigation per record.
3. **Per-trainer compensation assignment is the worst single screen.**
   One full page load to set one dropdown, repeated per trainer.
4. **Organization creation has no UI at all.** `org:create` exists as a
   permission and is unused; organizations are seeded by SQL script.
   Wizard Step 1 requires building this — it is the one genuinely new
   screen in the phase, and it is an orchestration screen, not new
   business logic.
5. **Schema mapping is shown even when it is already solved.** Setmore
   detects at ≥ 0.8 confidence, yet the owner still visits the mapping
   screen.
6. **Setup readiness is already a pure function.**
   `readinessChecklist()` in `src/lib/data/config-stats.ts:162` takes
   `OrgConfigStats` and returns labelled booleans. Re-wording it to
   owner language is a label change to a pure function — the safest
   possible edit, and no engine changes.
7. **Readiness currently contains a permanently false item.**
   "Scheduling export sample received" is hardcoded `done: false` with
   detail "awaiting business input", so no organization can ever reach
   100%. Under the new model this becomes a real, satisfiable check
   driven by upload state.
8. **Configuration is the app's front door.** The post-login landing
   experience should be operational — activity, imports, payroll,
   close, alerts — with configuration receding once setup is complete.

## Constraints this redesign must respect

These are not preferences; violating them would make the software lie.

- **The commission ladder is still unconfirmed.** The historical
  Timberhill ladder (50% / 55% @ $3k / 60% @ $4.5k / 65% @ $5.5k /
  70% @ $7k) is recorded as *historical* in
  `docs/PILOT_INPUTS_REQUIRED.md`, and whether tiers are cliff or
  marginal (open question U1c) has never been answered. The wizard may
  offer it as a **clearly-labelled starting template the owner must
  confirm**, and must never preselect a tier method. A wizard that
  silently defaults this would produce confident, wrong payroll.
- **Acuity has no adapter, deliberately.** `adapters/index.ts:10`
  registers Setmore only, because no sample export exists and no schema
  was invented. Step 2 accepts Acuity CSVs **through the generic
  mapping path**, and must not claim native Acuity support.
- **Discovery must never auto-post.** Discovery is read-only analysis.
  Creation of trainers, services, and aliases stays an explicit,
  reviewed owner action, and posting financial data keeps its existing
  approval gate.
- **Bulk actions call existing single-entity actions.** Bulk create is
  orchestration over `createTrainer`, `createService`,
  `addServiceAlias`, `assignTrainerCompensation` — preserving every
  validation, RLS check, and audit event those actions already emit.
  No bulk SQL path.

## Target: seven steps

| Step | Owner sees | Backed by |
| --- | --- | --- |
| 1 | Create Organization — name, time zone, reporting frequency, payroll frequency | new org action + `createPeriod` |
| 2 | Upload Scheduling Export | `uploadImportFile` + discovery projection |
| 3 | Review Trainers | `createTrainer` (bulk), `matchTrainer` |
| 4 | Review Services | `createService`, `addServiceAlias` (bulk) |
| 5 | Configure Compensation | `createPlan`, `addTier`, `publishVersion`, `assignTrainerCompensation` (bulk) |
| 6 | Validate Payroll | existing payroll run + preview |
| 7 | Ready | reworded `readinessChecklist` |

Nineteen steps become seven. The roughly 120 form submissions for a
20-trainer gym become **five review-and-confirm screens**, because the
per-record work turns into multi-select over lists the system derived.

Estimated setup time moves from hours to the 10–15 minutes the phase
brief targets — with the caveat that this measures *mechanical* effort.
It does not shorten the one genuinely slow part: an owner deciding what
their commission structure actually is.

## Out of scope

Deliberately unchanged: payroll calculation, import parsing and
matching rules, approval and posting workflow, period close, analytics,
RLS policies, audit events, and every database table. This phase adds
an orchestration layer above them and re-words what the owner reads.
