# Timberhill PT Intelligence + Operations Data Foundation — Phase G Report

Date: 2026-08-15 · Scope: G1–G4 implemented; G5 engine built; G6–G9 blocked
on owner inputs · Stop gate observed: no Director, no Slack, no Everfit, no
GMS API, no Executive Agent.

---

## 1. Executive verdict

**FOUNDATION BUILT. STILL OPERATIONALLY EMPTY — AND NOW HONEST ABOUT IT.**

Phase F found a platform with excellent authorization architecture and no
data, and warned that an agent built on it would answer "$0, 0 clients, 0%"
truthfully but misleadingly. Phase G did not fix the data problem — that is
owner-dependent — but it did fix the three things that would have made
loading data dangerous, and it closed the one security gap Phase F flagged
as unresolvable from stored data.

What is now true that was not true before:

1. **There is one Setmore normalizer.** The CSV export and the API both
   reduce to a single canonical record and a single business-rule pass.
   There is no second implementation to drift, and no path by which the API
   could acquire looser rules than the export.
2. **Status can no longer be invented.** The Setmore API has no status
   field. Rather than mapping its free-form `label` onto `completed`, the
   system marks such records `unknown` structurally, and `unknown` is
   excluded from every production and revenue figure. The consequence — an
   API-only ingest reports zero completed sessions — is stated rather than
   papered over.
3. **Manual data is first-class and immutable.** GMS aggregates are entered
   by hand into dated, attributed, permanently-retained snapshots.
   Corrections supersede; nothing is overwritten. Verified against live
   rows: a recorded figure cannot be edited or deleted.
4. **Trainer↔client scope exists.** Phase F P1-1 is closed. A trainer sees
   exactly the clients they have active appointment history with, proven
   against real rows in an isolated organization, including the negative
   cases.
5. **The system knows what it does not know.** A unified freshness model
   reports `never_loaded` rather than zero, and an operations health panel
   says what is keeping data out of reports.

What is still true, and is the whole remaining story: **there are no
services, no clients, no appointments, no compensation plans and no payroll
runs in the Timberhill organization.** Every one of the remaining NO answers
below traces to that, or to a business rule only the owner can state.

Six of eleven owner dependencies are now the critical path. Engineering is
not the constraint.

## 2. Revised architecture

```
SETMORE ──────► canonical normalizer ──┐
  (CSV today,                          │
   API implemented,                    ▼
   fail-closed)              ┌───────────────────────────┐
                             │  PERFORMANCE OPERATIONS   │
GMS ──── manual snapshots ──►│  Timberhill PT            │
  (no integration,           │  intelligence layer       │
   by design)                │                           │
                             │  mirrors + snapshots      │
EVERFIT ── not connected ───►│  + deterministic calc     │
  (declared absent)          │  + payroll + history      │
                             └─────────────┬─────────────┘
SLACK ──── not connected                   │
  (future output only)          ┌──────────┼──────────┐
                                ▼          ▼          ▼
                            Dashboard   Reports   PT Director
                                                   (not built)
```

Two properties of this diagram are load-bearing:

- **Everything converges before it becomes data.** There is exactly one
  arrow into the ledger per source, and for Setmore both transports share
  it. New transports extract fields; they never add rules.
- **Nothing downstream queries an external system.** Reports, and any
  future Director, read Performance Operations only. This is why the
  freshness model has to be good: it is the only thing standing between a
  stale mirror and a confidently wrong answer.

## 3. Source-of-truth matrix

Full matrix: [`docs/SOURCE_OF_TRUTH_MATRIX.md`](SOURCE_OF_TRUTH_MATRIX.md).
It was verified against the repository and the live pilot database, and four
rows in the proposed matrix changed as a result:

| Proposed | Revised | Why the change matters |
| --- | --- | --- |
| Appointment status → Setmore | Split: **status → Setmore CSV only** | The API has no status field. A single row would have licensed inferring status from `label`. |
| Setmore customers → mirrored | **Mirrored minimally** | PT intelligence needs identity and activity, not a customer database. Address/city/state/postcode stay out of the ledger. |
| PT services → Setmore, normalized | Split: **Setmore = which service; Performance Ops = department, revenue treatment, payroll treatment** | Vendor names must never imply financial treatment. |
| *(absent)* | **Trainer ↔ client → Performance Ops, derived** | Phase F's one unanswerable authorization question; now explicitly a derived domain. |

## 4. Setmore architecture

| Layer | Module | Responsibility |
| --- | --- | --- |
| Transport (CSV) | `src/lib/sources/setmore/csv-fields.ts` | Which column holds which value |
| Transport (API) | `src/lib/sources/setmore/api-fields.ts` | Which JSON key holds which value |
| HTTP | `src/lib/sources/setmore/api-client.ts` | Token exchange, pagination, rate-limit observation, failure classification. **Server-only, read-only.** |
| **Canonical** | `src/lib/sources/setmore/canonical.ts` | **Every business rule: timing, money, status, identity** |
| Provider | `src/lib/integrations/providers/setmore.ts` | Capability matrix, live-verification gate, evidence CSV |
| Reconciliation | `src/lib/sources/setmore/reconcile.ts` | API ↔ CSV comparison |

The API adapter is implemented against the documented contract and is
**fail-closed**. The gate is one reviewed constant,
`SETMORE_API_LIVE_VERIFIED = false`; while false, the provider reports
`status: "blocked"`, the sync engine refuses to run, and every
credential-touching method throws. Offline normalization of captured
evidence is deliberately permitted — it touches no credential, and blocking
it would only prevent replaying evidence we already hold.

Two ambiguities in the official documentation are handled rather than
guessed:

- **Cost unit** (`cost: 1000` alongside services priced `10`) — API cost is
  preserved as evidence and **not** mapped to a price until an operator
  declares `cost_unit` on the connection. Guessing would misstate revenue by
  100×.
- **Occurrence identity** — identity is `(external id + start instant)` for
  both origins, because Phase 3 established from real exports that a Setmore
  Booking ID identifies a recurring *series*. Whether the API's `key` is
  occurrence-unique is a question the reconciliation report answers.

## 5. CSV architecture

The Phase 3 pipeline was reused, not rebuilt: upload → parse → normalize →
preview → exceptions → confirm → import → audit, with batches, rows, issues,
resolutions, schema profiles and an append-only event trail.

Phase G's change was surgical: `src/lib/imports/adapters/setmore.ts` is now
a transport that delegates to the canonical layer. The 28 existing adapter
and contract tests pass unchanged, which is the evidence that the refactor
preserved behaviour exactly.

**Idempotency** rests on two independent mechanisms, both pre-existing and
both tested:

- `appointments_occurrence_uidx` — a unique index on
  `(organization_id, source, external_appointment_id, start_at)` for active
  rows. The database physically cannot hold the same occurrence twice.
- `classifyDuplicate` — classifies a staged row as new / exact duplicate /
  possible duplicate / source update / conflict / previously reversed,
  against both already-posted appointments and rows earlier in the same
  file. Uploading a file twice produces `exact_duplicate` blocking issues,
  not duplicate appointments.

CSV's role has changed as the brief directs: historical backfill,
reconciliation, API validation, recovery — and, uniquely, **status**, which
the API cannot supply.

**Known limitation, unchanged:** the pipeline is CSV-only. The real
Timberhill exports are `.xlsx` and must be saved as CSV first. This is a
documented operational step, not a defect, but it is friction on the
critical path and is listed as a risk.

## 6. API/CSV reconciliation

`src/lib/sources/setmore/reconcile.ts` — pure, deterministic, 15 tests.

Aligns both sources on occurrence identity and classifies each occurrence
`MATCH` / `MISMATCH` / `API_ONLY` / `CSV_ONLY`, comparing start, end,
duration, external id, trainer, service, client name, client email and
listed price.

The design decision that matters: **a field the API structurally cannot
provide is not a mismatch.** Status gets its own field verdict,
`unavailable_in_api`, and its own line in the summary. Counting it as a
mismatch would have flagged every single row and buried the real
differences; more importantly it would have implied the sources *disagree*
when in fact one is silent. "The API cannot tell us this" is the single most
important thing the owner needs to know, so it is reported as its own fact.

Two further honesty features:

- **Ambiguous occurrence keys are surfaced, never de-duplicated.** If one
  source contains two records with the same occurrence identity, identity
  itself is wrong — exactly the recurring-series risk Phase F flagged.
- **`assessApiReadiness` returns reasons, not a boolean.** It declares
  `hybridRequired` whenever any status is unverifiable, and refuses to
  declare readiness when nothing aligned ("no appointments aligned; nothing
  was verified") — an empty comparison must never read as a clean pass.

Not yet run against real data: this requires API credentials.

## 7. Service model

`services` + `service_categories` + `service_source_aliases` +
`service_department_assignments` already model everything the brief asks
for: canonical internal service, external alias, department, duration,
price, revenue treatment, payroll treatment, class/category, active flag.

**Nothing was seeded.** `services` holds 0 rows for Timberhill. The service
names in earlier planning documents (Private Training, Premier Coaching,
Timberhill Rookies, Performance Lab, PACK…) are **not** present in
production configuration and were deliberately not created: the brief is
explicit that operational evidence wins over planning documents, and the
only operational evidence available is the gitignored Setmore exports, which
the owner has not yet run through the setup wizard.

The path is built and unblocked — the wizard's service-review step with
inline alias merging shipped in Phase 9.5. This is an owner action, not an
engineering task.

## 8. Trainer identity

`trainers` + `trainer_organization_assignments` +
`trainer_source_aliases`, with matching by external source id first, then
stored alias, then name (`src/lib/imports/matching.ts`). Ambiguous matches
become blocking `ambiguous_trainer` review items rather than guesses.

Phase G added the API side: `staff_key` is carried through the canonical
record into `extra.setmore_staff_key` and, when a name is absent but a key
is present, the row raises `trainer_name_absent` (warning, resolvable via
alias) rather than `missing_trainer` (blocking). Display-name matching
remains a fallback, never a permanent binding.

**Live state: 1 trainer, 0 department assignments, 0 compensation
assignments.** The roster is not loaded.

## 9. Client identity

`clients` + `client_organization_assignments` + `client_source_identifiers`,
all still empty.

PII is minimized by construction. The canonical normalizer promotes name,
email, phone and external customer key; the export's address, city, state,
country and postal-code columns are preserved as staging evidence and never
posted. Client free text (`Comments` / `comment`) is retained in staging
only — it is untrusted third-party content and does not enter the ledger.
Import review lists never print client PII in aggregate issue messages.

## 10. Appointment and status semantics

Full mapping: [`docs/SETMORE_STATUS_MAPPING.md`](SETMORE_STATUS_MAPPING.md).

Eight canonical statuses; vendor mappings are **organization-scoped data**
(`source_status_mappings`), never hardcoded. An unmapped value posts as
`unknown` and raises a review item naming the value.

| Source | Evidence | Result |
| --- | --- | --- |
| CSV `Cancelled` | Directly observed | `cancelled` |
| CSV blank | Directly observed | `unknown` |
| CSV `Confirmed` | **Ambiguous** | **No mapping seeded — owner decision** |
| API (any record) | **No status field exists** | `unknown`, structurally |

The `Confirmed` question is the one that matters financially: `Confirmed` is
a booking state, and the export carries no attendance signal. If staff mark
cancellations reliably, `Confirmed` on a past date evidences delivery; if
no-shows are sometimes left as `Confirmed`, mapping it to `completed`
overstates production, revenue and pay. Until the owner decides, rows land
as `unknown` — a visible empty report is a question the owner can answer;
a silently inflated one is not.

## 11. Trainer↔client scope

**Phase F P1-1 is closed.**

A trainer is authorized to see exactly the clients they have an *active*
appointment with. No stored assignment was created, deliberately: a
"primary trainer" column would be a second, hand-maintained source of truth
drifting alongside the ledger.

One derivation, two expressions that must agree:

- `app.trainer_client_ids()` — security-definer, pinned `search_path`, the
  RLS backstop. Referenced by the `clients` and
  `client_organization_assignments` select policies.
- `src/lib/authz/trainer-client-scope.ts` — the same rule as a pure
  function, exhaustively unit-tested (20 tests).

Properties, each tested: fails closed (no trainer row → empty scope, and an
empty scope grants nothing); organization-bounded; live-ledger-only
(reversed/voided/superseded grant nothing); both link paths on each side
(`appointments.trainer_id` and `appointment_trainer_assignments`;
`appointments.client_id` and `appointment_participants`); and **additive
only** — a role holding `client:read` is unaffected.

Verified against real rows in an isolated organization
(`tests/rls/phaseG-live-checks.sql`, assertions A1–A8, executed 2026-08-15):
Trainer A sees their own client and a participant of their own session;
Trainer A **cannot** see Trainer B's client; Trainer B cannot see Trainer
A's; neither sees a client whose only appointment was reversed; a
workspace admin in a *different* organization sees nothing; a workspace
admin in the same organization still sees all four clients; vendor client
identifiers stay behind full `client:read`; a non-trainer derives nothing.

A negative control was run in the same session to confirm a failing
assertion surfaces as an error rather than passing silently.

## 12. GMS snapshot architecture

Three tables, migration `20260815000033`:

- `external_data_sources` — code-controlled source vocabulary carrying
  `ingest_mode` (`manual_snapshot` | `automated`). This is what lets the
  intelligence layer distinguish typed data from synced data.
- `organizational_metric_definitions` — which values may be entered, each
  with a **rationale** column recording why it cannot be derived
  internally. That column exists to stop someone later adding a manual
  field that duplicates a catalog metric.
- `organizational_snapshots` + `organizational_snapshot_values` — dated,
  attributed, immutable readings.

Three permissions (`org_snapshot:read | enter | manage`). Trainers get
none: a club denominator entered by the wrong person silently distorts
every figure derived from it. Department managers read only.

UI at `/snapshots`: source, period, as-of date, four numbers, optional
note. Blank means *not entered*, not zero — enforced client-side and
server-side.

## 13. Snapshots, not overwrites

The rule the brief calls critical is enforced by database trigger, not by
convention. `app.protect_organizational_snapshot()` rejects every DELETE,
rejects any change to provenance or window, and permits only
`recorded → superseded | voided`. `app.protect_organizational_snapshot_value()`
rejects all UPDATE and DELETE outright: figures are write-once.

Corrections work by recording a **new** snapshot and superseding the old
one; both readings survive, linked by `superseded_by_id`.

Live-verified (assertions B1–B10): a recorded value could not be
overwritten; values could not be deleted; provenance could not be
rewritten; a snapshot could not be deleted; after supersession the original
5,000 was still readable alongside the corrected 5,100; a superseded
snapshot could not be changed again; a trainer could neither read nor
write; a department manager could read but not enter; a workspace admin in
another organization could do neither; `entered_by` could not be forged;
and the supersede RPC re-checked permission rather than trusting its
caller.

## 14. Snapshot metrics

Four seeded, each chosen by comparing against the 60-metric catalog and
keeping only values the catalog genuinely cannot compute:

| Key | Why it cannot be derived internally |
| --- | --- |
| `club_active_members` | Performance Operations only ever sees people who booked a PT appointment. The club-wide population is invisible to it. |
| `club_pt_eligible_members` | The PT-penetration denominator is an **owner-defined** population. Deliberately separate from total active members. |
| `club_new_memberships` | `new_clients` counts new *PT* clients; membership sales are invisible. |
| `club_cancelled_memberships` | `client_retention_rate_bp` measures PT retention; membership churn is invisible. |

The set is data, not a hardcoded form, and extends by migration.

## 15. Utilization

The existing definitions were reviewed and **their distinction is
preserved**. There are now three, and they answer different questions:

| Metric | Question | Status |
| --- | --- | --- |
| `schedule_utilization_bp` | Did the booked work happen? (completed ÷ booked minutes) | Implemented; ledger-only |
| `capacity_utilization_bp` | How full is a trainer's day? (coached ÷ configured availability) | Reports `configuration_missing` — capacity is not configured anywhere, and the evaluator refuses to invent it |
| **`pt_penetration_bp`** (new) | How much of the club buys training? (active PT clients ÷ eligible members) | Implemented as a pure calculation; needs a GMS snapshot |

`src/lib/snapshots/penetration.ts` is explicit that penetration is not a
third meaning of "utilization", and it **refuses to substitute total active
members for the eligible population** — returning `configuration_missing`
with a stated reason instead. It also carries the denominator's staleness
with every result and explains a rate above 100% rather than letting it
look like a bug.

**Deferred, and stated as such:** penetration is not yet registered in the
metric catalog, because catalog evaluators read from the appointment and
payroll datasets and a snapshot dataset is not wired into
`IntelligenceDataset`. Wiring it is straightforward and should happen once
real snapshots and real appointments coexist — validating a denominator
against no numerator would prove nothing.

## 16. Revenue semantics

The four concepts remain distinct and separately catalogued:
`revenue_listed_cents`, `revenue_eligible_cents`,
`revenue_recognized_cents`, `revenue_paid_cents`, plus per-session, per-hour
and per-client derivations.

Phase G added no code that collapses them, and reinforced the distinction at
the ingest boundary: Setmore supplies a **listed price only**, and every
priced row carries an explicit `listed_price_only` info issue saying so. The
Phase F rule stands — quoting "revenue" unqualified is a defect, not a
style preference.

**Scope of this claim:** the semantics are verified as preserved and
distinct. **No revenue figure has been validated**, because no revenue data
exists.

## 17. Compensation

Performance Operations remains authoritative, and nothing was inferred from
Setmore.

**The 50 / 55 / 60 / 65 / 70 ladder was NOT encoded.** This repository's own
evidence review (`docs/business-rules/timberhill-payroll-observed.md`)
inspected twelve monthly payroll trackers and found the per-trainer
derivation is not in the exports; cliff-vs-marginal (U1c) remains OPEN, and
"nothing in the summary proves tiers exist or not."

Confirmed from evidence: monthly periods; per-trainer monthly totals; flat
payouts for free sessions and consultations (amounts unconfirmed);
department analytics with 12% overhead and a department commission line
(2% in 2024–25, 5% in Feb 2026); a flat $500/month salary line.

`compensation_plans`, `compensation_plan_versions`, `compensation_rules`,
`commission_tiers` and `trainer_compensation_assignments` are all **empty**
for Timberhill. The owner decision workflow is the documented open-questions
list in the evidence file; five items must be resolved before a plan can be
configured honestly.

## 18. Payroll validation

**Not performed. Blocked on a data pairing that does not exist.**

Available locally in gitignored `business-inputs/`:

| Artifact | Period |
| --- | --- |
| `Complete_December_Setmore Report.xlsx` (2,883 rows) | Dec 2025 |
| `JR_December_Setmore Report.xlsx` (418 rows) | Dec 2025 |
| `Jo August 2025 Setmore.xlsx` (208 rows) | Aug 2025 |
| Payroll Tracker PDF | Aug 2024 |
| Payroll Tracker PDF | Jun 2025 |
| Payroll Tracker PDF | Feb 2026 |

**No Setmore export and payroll record share a period.** The truth-set
validation the brief specifies — load one period, run the engine, compare
source gross / system gross / variance and source pay / system pay /
variance per trainer, target $0.00 unexplained — cannot be run until the
owner supplies a matching pair. The natural ask is the **December 2025**
payroll tracker, since the most complete Setmore export already covers that
month.

Formulas were not altered to force agreement, because no comparison was
attempted.

## 19. 60-metric catalog validation

**Not performed. Deliberately.**

The catalog contains **60** metrics today (the brief's "57" is the earlier
count). Running them against an empty database would prove only that the
functions execute — which the existing unit tests already prove — while
producing a table of zeros that looks like validation and is not. The brief
is explicit: *"Do not simply test whether the function executes."*

What can be stated now, by construction rather than by execution:

- Every metric has exactly one evaluator and one definition; a duplicate id
  or a definition without an evaluator throws at module load, so a
  duplicated formula cannot ship.
- Pipeline gates already return `waiting_for_imports` / `waiting_for_payroll`
  rather than zero when data is absent.
- `capacity_utilization_bp` already returns `configuration_missing` rather
  than inventing capacity.

Classification into PASS / CONFIGURATION REQUIRED / INSUFFICIENT DATA /
NOT APPLICABLE / WRONG requires real appointments and a validated payroll
period. It is the first task of the next phase.

## 20. Data freshness

`src/lib/freshness/model.ts` — one model, four sources, 27 tests.

Each source reports `state`, `ingest` mode, **`dataThroughDate`** (the date
through which data is believed complete — not "last sync", which only says
when we last asked), `lastLoadedAt`, and a printable summary.

Tolerances match cadence: appointments age at 3 days and go stale at 10;
manual snapshots age at 45 and go stale at 75, matching a monthly rhythm.

The central behaviour: an empty source is `never_loaded`, `isEmpty` is true,
and `mayReportQuantitatively()` returns false. Callers that cannot produce a
freshness statement should not produce a number. Everfit appears in every
report as `not_connected` with an explicit note that coaching questions
**cannot be answered from this system** — its absence is a stated fact
rather than a gap someone assumes is covered.

Current live answer for Timberhill: three sources `never_loaded`, one
`not_connected`.

## 21. Data quality

`/data-health` — an operations panel, not an engineering dashboard. Every
row is a count, a severity, and what it means in operational terms.

Covered: Setmore connection status, last sync / data-through date, latest
GMS snapshot, unresolved trainer mappings, unresolved client mappings,
unmatched services, unknown statuses (staging + ledger), open import
exceptions, open payroll exceptions, trainers missing compensation.

Severity reflects consequence rather than volume. One unmatched service is
**blocking**, because those rows cannot post at all; a handful of unmatched
clients is **attention**, because sessions still post but client counts
understate. An empty appointment ledger is blocking, with the reason spelled
out: "a zero here means 'unknown', not 'none happened'."

## 22. Everfit — future seam

**Not integrated. Documented as a future source, as instructed.**

Potential value: coaching client status, program assignments, adherence,
nutrition coaching, last-active, engagement.

Precondition for revisiting: a specific business use case showing which
management decision changes with the data. The brief's rule is adopted
verbatim — *do not integrate software merely because an API exists.*

Everfit is nonetheless present in the freshness model as `not_connected`, so
its absence is visible rather than assumed.

## 23. Slack — future seam

**Not built. Architecture recorded.**

Three eventual roles: scheduled report delivery (Monday PT department
report); alert delivery ("3 trainers are pacing below production target");
and a Director interface (Slack → authenticated Director request →
Performance Operations deterministic tools → interpretation → reply).

Constraint: **Slack must never become a source of truth.** It is an output
channel and an input surface for questions, nothing more. Worth building
once the Director exists and has production data to report — which is at
least two phases away.

## 24. Performance Operations UI scope

No expansion into a Timberhill application. Two routes were added, both
inside the sanctioned scope:

| Route | Purpose |
| --- | --- |
| `/snapshots` | Manual club snapshots |
| `/data-health` | Imports / data health |

No CRM, no scheduling, no coaching, no club management. Staff continue to
work in Setmore, GMS and Everfit.

## 25. Director readiness

**Not built — the stop gate was observed.**

Phase F's nine-tool registry was re-evaluated against the new architecture.
Three changes:

- `get_trainer_clients` is **no longer blocked**. P1-1 is closed, so trainer
  self-scope for clients is enforceable and tested.
- `get_data_freshness` now has a real backing model, and its output should
  be mandatory on every quantitative answer rather than advisory.
- Two tools should be added: `get_club_snapshot` (returning figures *with*
  provenance and staleness, never bare numbers) and `get_data_quality`.

The prerequisites Phase F set are unchanged and unmet: appointments,
clients and services loaded; a compensation plan configured; at least one
payroll run. Building now would still produce a correct agent that can only
say "no data has been loaded."

## 26. Executive architecture implications

Direction preserved; **nothing built**. Timberhill should eventually expose
one curated, permission-aware capability
(`get_timberhill_executive_summary`) rather than its internal tools —
aggregate only, no client detail, no per-trainer compensation, freshness
mandatory, and no raw database access to any orchestrator ever.

Phase G strengthens the case for that shape: the freshness model and
provenance layer are exactly what an orchestrator needs to avoid presenting
a stale manual snapshot as a live figure across business boundaries.

## 27. Security results

| Check | Result | Evidence |
| --- | --- | --- |
| Setmore credentials server-only | **PASS** | Credentials resolve from Vault into `FetchContext.secret`; the refresh token and bearer header exist only inside `api-client.ts`. No credential is exported, cached to module scope, or returned in a validation result. |
| No secrets committed | **PASS** | No `.env` staged; no credential literals added. Failure messages pass through `sanitizeErrorMessage`. |
| No service-role use for domain reads | **PASS** | All new reads use the caller's RLS client. No new service-role path was added. |
| Trainer self-scope fails closed | **PASS** | 20 unit tests + live assertions A1–A8. No trainer row → empty scope; empty scope grants nothing. |
| Cross-org access fails closed | **PASS** | Live A4 (privileged admin in another org sees 0 clients) and B7 (0 snapshots, write rejected). |
| Payroll permissions intact | **PASS** | No payroll permission or policy was modified. |
| GMS snapshots permission-controlled | **PASS** | Live B1, B8, B9, B10. |
| Imports permission-controlled | **PASS** | Unchanged from Phase 3. |
| Provenance immutable | **PASS** | Live B4–B6; trigger-enforced. |
| Manual never shown as automated | **PASS** | `ingest_mode` at the database level; `isAutomated()` in code; "Manual entry" badge on every snapshot card and source card. |
| Supabase security advisors | **PASS with one accepted warning** | The new RPC is `SECURITY DEFINER` and callable by `authenticated` — intentional, and it re-checks permission internally (proven by B10). `anon` was explicitly revoked after the advisor flagged it. |

One change to a security-relevant default is worth calling out explicitly:
the Setmore adapter no longer throws from `normalizeSourceRecord`. That is a
deliberate narrowing of the fail-closed boundary to credential-touching
paths only. The corresponding test was rewritten to assert the new
behaviour rather than deleted.

## 28. Test results

| Gate | Result |
| --- | --- |
| Unit tests | **566 passed / 39 files** (was 476 / 35) |
| — Setmore canonical normalization | 27 new |
| — API/CSV reconciliation | 15 new |
| — Trainer↔client scope | 20 new |
| — Freshness, provenance, penetration, data quality | 27 new |
| Live RLS checks (`tests/rls/phaseG-live-checks.sql`) | **18/18 assertions passed** against the hosted pilot, in an isolated org, rolled back |
| Negative control | **Confirmed** — a failing assertion surfaces as an error |
| Typecheck (`tsc --noEmit`) | **PASS**, exit 0 |
| Lint (`eslint .`) | **PASS**, exit 0, 0 errors (1 pre-existing warning in `trainer-table.tsx`) |
| Production build | **PASS**, exit 0; `/snapshots` and `/data-health` both compile |

Not covered by automated tests: the two new server actions
(`recordOrganizationalSnapshot`, `supersedeSnapshot`) are exercised
indirectly — their authorization and immutability guarantees are proven at
the database layer by the live checks, but their form-parsing branches have
no unit test. Worth adding.

## 29. Owner dependencies

Ordered by what unblocks the most.

| # | Action | Unblocks |
| --- | --- | --- |
| 1 | Run the existing Setmore exports through the setup wizard (save as CSV first) | Services, trainers, clients, appointments — and with them the metric catalog, utilization, and every NO below that says "no data" |
| 2 | Decide whether Setmore `Confirmed` means **delivered** | Completed counts, eligible revenue, payroll eligibility. Until decided, everything lands as `unknown`. |
| 3 | Provide the **December 2025** payroll tracker (matching the complete Setmore export) | Historical payroll reconciliation |
| 4 | State each trainer's actual compensation terms, incl. cliff-vs-marginal (U1c), free-session and consultation rates, cancellation/no-show policy | Compensation configuration, payroll |
| 5 | Define **PT-eligible members** | PT penetration |
| 6 | Enter one GMS snapshot for the most recent completed month | Club denominators, snapshot history |
| 7 | Request Setmore API access (Pro account → `api@setmore.com`) | Live API verification, reconciliation, automated sync |
| 8 | Reconcile `.env.local` (points at dead project `yoolmtleaezprjmfasku`; live pilot is `uavwqtbnkirvfvdilcwy`) | Removes a footgun (Phase F P2-1, still open) |

Items 1, 2 and 6 need no credentials and no engineering. They are the
fastest route out of the empty state.

## 30. Remaining risks

**P0**

- **P0-1 — Operational dataset still empty.** Unchanged from Phase F in
  substance, but materially de-fanged: the freshness model now reports
  `never_loaded` rather than zero, and `mayReportQuantitatively()` gives
  every consumer a single honest gate. The risk is no longer "reports lie";
  it is "there is nothing to report."

**P1**

- **P1-A — `Confirmed` is unmapped.** Until the owner decides, a loaded
  ledger will show zero completed sessions and zero eligible revenue. This
  is correct behaviour that will look like a bug; expect to explain it.
- **P1-B — API status gap is permanent until disproven.** If Setmore's API
  genuinely never exposes status, the hybrid CSV-for-status strategy is not
  a transition state, it is the architecture. The reconciliation report is
  what settles this.
- **P1-C — Cost unit unverified.** API-sourced rows carry no price until an
  operator declares `cost_unit`. Declaring it wrong misstates revenue 100×
  in one direction or the other.

**P2**

- **P2-1 — `.env.local` points at a dead Supabase project.** Carried over
  from Phase F, still open, still a footgun.
- **P2-2 — Status *policy* lives in evaluators, not configuration.**
  Acceptable (evaluators are single-sourced and deterministic) but now
  documented rather than implicit.
- **P2-3 — XLSX is not ingestible.** Real exports are `.xlsx`; the operator
  must save as CSV. Friction on the critical path.
- **P2-4 — Consultation conversion remains unmodelled.** Any conversion
  rate would be inferred and must be labelled as such, or excluded.
- **P2-5 — PT penetration is not in the metric catalog.** Deliberately
  deferred; it needs a snapshot dataset wired into `IntelligenceDataset`.

**P3**

- Inactivity threshold should be organization-configurable and always
  stated when reported.
- Client status vocabulary (member / PT client / lead / former) is still
  undefined as data.
- The two new server actions lack unit tests for their parsing branches.
- Recurring-series occurrence identity in the API is still unverified.

## 31. Recommended next phase

**Phase H — Load the data.** Not an engineering phase; an operational one
with engineering support.

1. Owner runs the Setmore exports through the setup wizard (owner
   dependency 1) and decides the `Confirmed` mapping (dependency 2).
2. Load one full month. Run the data-health panel. Resolve every unmatched
   service and trainer until the panel is clear.
3. Owner enters one GMS snapshot (dependency 6). Wire the snapshot dataset
   into `IntelligenceDataset` and register `pt_penetration_bp` in the
   catalog.
4. Owner supplies the December 2025 payroll tracker (dependency 3) and the
   compensation terms (dependency 4). Configure the plan. Run the period.
   Compare per trainer to $0.00 unexplained variance.
5. **Then** run the 60-metric catalog against real data and classify every
   metric PASS / CONFIGURATION REQUIRED / INSUFFICIENT DATA / NOT
   APPLICABLE / WRONG.
6. Only after that, revisit the Director.

Setmore API work (dependency 7) proceeds in parallel and blocks none of the
above — which was the point of building the adapter now.

---

## Final readiness

**PERFORMANCE OPERATIONS ESTABLISHED AS TIMBERHILL INTELLIGENCE LAYER: YES**

**GMS MANUAL SNAPSHOTS READY: YES**

**SETMORE CSV INGEST READY: YES**

**SETMORE API ADAPTER READY: YES**

**SETMORE API LIVE VERIFIED: NO**

**SERVICES POPULATED: NO**

**TRAINERS RECONCILED: NO**

**CLIENTS POPULATED: NO**

**APPOINTMENTS POPULATED: NO**

**TRAINER CLIENT SCOPE VERIFIED: YES**

**DATA FRESHNESS VERIFIED: YES**

**REVENUE SEMANTICS VERIFIED: YES**

**COMPENSATION VERIFIED: NO**

**HISTORICAL PAYROLL RECONCILED: NO**

**57-METRIC CATALOG VALIDATED: NO**

**READY TO BUILD TIMBERHILL PT DIRECTOR: NO**

**READY TO BUILD JR EXECUTIVE AGENT: NO**

### Every NO explained

- **SETMORE API LIVE VERIFIED — NO.** No Setmore account has ever been
  called. The transport is implemented against the documented contract, but
  documentation is not evidence: status representation, recurring-occurrence
  identity and the cost unit are all unproven. `SETMORE_API_LIVE_VERIFIED`
  is `false`, so the provider is `blocked` and the sync engine refuses to
  run. Requires owner dependency 7.

- **SERVICES POPULATED — NO.** `services` holds 0 rows for Timberhill. The
  catalogue was deliberately not seeded from planning documents; operational
  evidence wins, and that evidence is in exports the owner has not yet
  loaded. Requires owner dependency 1.

- **TRAINERS RECONCILED — NO.** One trainer record exists, with 0 department
  and 0 compensation assignments. The reconciliation mechanism (external key
  → alias → name, ambiguity as an exception) is built and tested; there is
  simply no roster to reconcile. Requires owner dependency 1.

- **CLIENTS POPULATED — NO.** `clients`, `client_organization_assignments`
  and `client_source_identifiers` are all empty. Requires owner
  dependency 1.

- **APPOINTMENTS POPULATED — NO.** The ledger is empty; no import batch has
  been posted. This is the root cause of most other NOs. Requires owner
  dependency 1.

- **COMPENSATION VERIFIED — NO.** All four compensation tables are empty for
  Timberhill, and the 50/55/60/65/70 ladder remains **unverified** by this
  repository's own evidence review — the per-trainer derivation is not in
  the exported trackers, and cliff-vs-marginal (U1c) is still an open
  question. Encoding it would have been a guess with direct financial
  consequences. Requires owner dependency 4.

- **HISTORICAL PAYROLL RECONCILED — NO.** No Setmore export and approved
  payroll record cover the same period: the exports are Dec 2025 and Aug
  2025; the trackers are Aug 2024, Jun 2025 and Feb 2026. The comparison was
  not attempted, and no formula was adjusted. Requires owner dependency 3
  (December 2025 tracker).

- **57-METRIC CATALOG VALIDATED — NO.** The catalog now holds 60 metrics.
  Running them against an empty database would prove only that the functions
  execute, and would produce a table of zeros resembling validation. The
  brief explicitly forbids that. Requires owner dependency 1, then 3 and 4.

- **READY TO BUILD TIMBERHILL PT DIRECTOR — NO.** The security blocker is
  gone (P1-1 closed, self-scope live-verified) and the honesty
  infrastructure now exists (freshness, provenance, data quality). What
  remains is the same as Phase F: no appointments, no services, no clients,
  no compensation plan, no payroll run. A Director built today would be
  correct, secure, and able to say only "no data has been loaded."

- **READY TO BUILD JR EXECUTIVE AGENT — NO.** Mandated by the phase brief,
  and independently true: orchestration needs two stable production agent
  interfaces. Vera qualifies; G3's Director has correctness evidence but no
  operational track record; Timberhill's does not exist.
