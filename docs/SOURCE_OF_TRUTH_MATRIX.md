# Source-of-Truth Matrix

**Status:** authoritative as of Phase G (2026-08-15). Verified against the
repository and the hosted pilot database, not against planning documents.

Performance Operations is **not** a replacement for Timberhill Athletic
Club's operational software. Staff continue to work in Setmore, GMS,
Everfit and Slack. Performance Operations is the **PT intelligence and
operations data layer**: it consolidates only what is needed for
department management, revenue intelligence, trainer production, payroll,
client activity, utilization, KPI tracking and historical comparison.

The practical consequence of that positioning is the rule below.

> **A domain has exactly one authority.** Where an external system is the
> authority, Performance Operations holds a *mirror* and never edits it.
> Where Performance Operations is the authority, no external system is
> consulted.

---

## 1. The matrix

| Domain | Authority | How it reaches Performance Operations | Verified in code |
| --- | --- | --- | --- |
| Scheduling (creating/changing bookings) | **Setmore** | Not mirrored. Performance Operations has no write path to Setmore and no scheduling UI. | `src/lib/sources/setmore/api-client.ts` is read-only by construction |
| Appointment history | **Setmore** → mirrored | CSV export (today) and API (implemented, not live-verified), both through one normalizer | `src/lib/sources/setmore/canonical.ts` |
| Appointment **status** | **Setmore CSV export only** | The API has no status field. API-sourced rows land as `unknown`. | `api-fields.ts` (`statusAvailability: "not_provided_by_source"`) |
| Setmore customers | **Setmore** → mirrored, minimally | Name/email/phone + external key, from appointment participation | `clients`, `client_source_identifiers` |
| Setmore staff / calendars | **Setmore** → reconciled | Matched to internal trainers by alias and external key, never permanently by display name | `trainer_source_aliases`, `src/lib/imports/matching.ts` |
| PT services | **Setmore** → normalized | Vendor names map to a canonical service via stored aliases | `services`, `service_source_aliases` |
| Service taxonomy (category, department, revenue/payroll treatment) | **Performance Operations** | Per-organization configuration data | `service_categories`, `service_department_assignments` |
| Club membership | **GMS** | Not mirrored at record level | — |
| Club membership aggregates | **GMS** → manual snapshots | Owner/manager types aggregate values periodically | `organizational_snapshots` |
| Historical club figures | **Performance Operations** | Immutable dated snapshots; corrections supersede, never overwrite | `organizational_snapshots`, `organizational_snapshot_values` |
| Coaching / programming / adherence | **Everfit** | **Not connected.** Declared absent in the freshness model so the gap is stated, not assumed covered. | `src/lib/freshness/model.ts` |
| Communication | **Slack** | **Not connected.** Future output channel only; never a source of truth. | — |
| Trainer identity | **Performance Operations** | `trainers` + effective-dated assignments | `trainers`, `trainer_organization_assignments` |
| Trainer ↔ client relationship | **Performance Operations, derived** | Derived from active appointment history; no stored assignment exists or should | `app.trainer_client_ids()`, `src/lib/authz/trainer-client-scope.ts` |
| Trainer compensation configuration | **Performance Operations** | Plans → versions → rules/tiers, assigned by effective date. Never inferred from Setmore. | `compensation_plans`, `compensation_plan_versions` |
| Payroll calculation | **Performance Operations** | Deterministic engine over the ledger | `src/lib/payroll/engine.ts` |
| PT KPI calculations | **Performance Operations** | One catalog, one evaluator per metric, per-metric permission gating | `src/lib/intelligence/catalog.ts` |
| Historical intelligence | **Performance Operations** | Reporting periods, payroll runs, period close, snapshots | — |
| Data freshness | **Performance Operations** | Unified model across every source | `src/lib/freshness/model.ts` |
| AI intelligence | **Timberhill PT Director**, over Performance Operations only | Not built (Phase G stop gate) | — |

## 2. Refinements the codebase forced on the proposed matrix

The matrix in the phase brief was mostly right. Four rows changed after
checking the code, and each change matters:

1. **"Appointment status → Setmore" split into two rows.** The CSV export
   carries a `Status` column; the documented API does not carry status at
   all. Treating "Setmore" as a single authority for status would have
   licensed inferring status from the API's free-form `label`. The split
   makes the hybrid strategy structural rather than a caveat.

2. **"Setmore customers → mirrored" narrowed to "mirrored, minimally".**
   PT intelligence needs identity and activity, not a customer database.
   Address, city, state, country and postal code exist in the export and
   are deliberately not promoted to the ledger.

3. **"PT services → Setmore, normalized" split.** Setmore is authoritative
   for *which service was sold*. It knows nothing about department,
   revenue treatment, or payroll treatment — those are Performance
   Operations configuration and must not be inferred from a vendor name.

4. **"Trainer ↔ client" added as its own row.** The brief did not name it;
   Phase F found it was the one authorization question with no answer.
   It is now explicitly a *derived* Performance Operations domain — not a
   Setmore mirror, and deliberately not a stored assignment.

## 3. Automate vs. enter by hand

The owner's principle, applied:

| Source | Decision | Why |
| --- | --- | --- |
| **Setmore** | **Automate** | Transaction-level detail matters, volume is high (≈2,900 rows in one December export), and it changes daily. Manual entry is not viable. |
| **GMS** | **Manual snapshots** | Four aggregate numbers a month. An API integration would add a credential, a sync job, failure modes and drift monitoring to save about a minute of typing. |
| **Everfit** | **Defer** | No business case has been stated that would change a management decision. Do not integrate software merely because an API exists. |
| **Slack** | **Defer** | An output channel, not a source. Worth building once the Director has production data to report. |

## 4. What "mirror" obliges

A mirrored domain carries three obligations, all enforced in code:

- **Provenance is immutable.** `appointments` freezes source evidence
  (`app.protect_appointment()`); snapshots freeze figures and provenance
  (`app.protect_organizational_snapshot()`).
- **Provenance is stated.** Every quantitative answer must be able to name
  its source and its as-of date (`src/lib/freshness/model.ts`,
  `src/lib/snapshots/provenance.ts`).
- **Manual is never presented as automated.** `ingest_mode` distinguishes
  them at the database level and is surfaced on every card that shows a
  snapshot figure.
