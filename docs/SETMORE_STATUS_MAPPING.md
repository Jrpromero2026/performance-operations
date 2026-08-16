# Setmore → Performance Operations Status Mapping

**Status:** authoritative as of Phase G (2026-08-15).

Appointment status is the highest-risk field in the whole ingest. It
decides whether a session counts as production, whether it produces
revenue, and whether it pays a trainer. Everything below exists to make
one rule enforceable:

> **Status is never inferred.** If the evidence does not establish a
> status, the appointment is `unknown`, and `unknown` never counts as
> confirmed, completed, or revenue-bearing.

---

## 1. Canonical vocabulary

Eight statuses, seeded in `appointment_status_definitions` and referenced
by foreign key from `appointments.canonical_status` — a status outside
this list cannot physically be stored.

| Key | Meaning |
| --- | --- |
| `scheduled` | Booked, not yet delivered |
| `completed` | Delivered |
| `cancelled` | Cancelled within policy |
| `late_cancelled` | Cancelled inside the late window |
| `no_show` | Client did not attend |
| `rescheduled` | Moved to another occurrence |
| `deleted` | Removed at source |
| `unknown` | **Status not established by evidence** |

## 2. Setmore CSV export → canonical

Setmore's export carries a `Status` column. Three real exports
(docs/schemas/setmore-observed-schema.md) contained exactly two distinct
values, one of which had a trailing space:

| Setmore value (normalized) | Canonical | Confidence |
| --- | --- | --- |
| `confirmed` | **OWNER DECISION REQUIRED** — see §4 | Not established |
| `cancelled` | `cancelled` | Directly evidenced |
| *(blank)* | `unknown` | Directly evidenced |
| *(any other value)* | `unknown` + review item | By construction |

Mappings are **organization-scoped data**, not code:
`source_status_mappings (organization_id, source, source_value_normalized,
canonical_status)`. Nothing is hardcoded, so a mapping decision is an
auditable configuration act rather than a deploy.

An unmapped value does not fail the import and does not guess. It posts as
`unknown` and raises an `unknown_source_status` review item naming the
offending value.

## 3. Setmore API → canonical

**The documented API exposes no status field at all.** The appointment
payload carries `key`, `start_time`, `end_time`, `duration`, `staff_key`,
`service_key`, `customer_key`, `cost`, `currency`, `comment` and `label` —
where `label` is free-form text observed as "No Label".

| API evidence | Canonical | Rationale |
| --- | --- | --- |
| *(no status field exists)* | `unknown` | The API cannot establish status. |
| `label` = anything | **Never consulted for status** | A free-form field is not a status field. Mapping "No Label" or any other label to `completed` would be an invention with direct financial consequences. |

This is implemented structurally, not by convention:
`setmoreApiAppointmentToCanonical` hardcodes
`statusAvailability: "not_provided_by_source"`, the canonical normalizer
emits a `status_not_provided_by_source` warning, and no `sourceStatus` is
set — so matching maps the row to `unknown`.

**Consequence, stated plainly:** an API-only ingest produces a ledger in
which *every* appointment is `unknown`, and therefore a period with zero
completed sessions and zero eligible revenue. That is the correct,
honest outcome and the reason the hybrid strategy exists. It is also why
the API adapter remains fail-closed until reconciliation proves otherwise
(`SETMORE_API_LIVE_VERIFIED`).

## 4. The open owner decision

**Does Setmore `Confirmed` mean the session was delivered?**

This cannot be answered from the exports. `Confirmed` is a booking state,
and the export contains no attendance signal. Two readings are possible:

- If Timberhill marks cancellations reliably and never marks attendance,
  then `Confirmed` on a past date is *evidence of delivery* and should map
  to `completed`.
- If staff sometimes leave a no-show as `Confirmed`, then mapping it to
  `completed` overstates production, revenue, and pay.

Until the owner decides, `confirmed` has **no seeded mapping** and rows
land as `unknown`. This is deliberately visible rather than convenient:
an empty department report is a question the owner can answer, whereas a
silently-inflated one is not.

Related open questions, recorded in
`docs/business-rules/timberhill-payroll-observed.md`: whether Setmore
distinguishes late cancellation from cancellation, and how no-shows are
recorded operationally.

## 5. Where status policy is enforced

| Concern | Where |
| --- | --- |
| Vendor value → canonical | `source_status_mappings` (org-scoped data) |
| Unmapped value handling | `src/lib/imports/pipeline.ts` (`unknown_source_status`) |
| API absence of status | `src/lib/sources/setmore/api-fields.ts` + `canonical.ts` |
| Which statuses count as production | metric evaluators, e.g. `appointments_completed` |
| Which statuses produce revenue | `revenue_eligible_cents` and the revenue family |
| Which statuses pay | `src/lib/payroll/eligibility.ts` + compensation rule criteria |
| Status transitions | `appointment_status_history` (append-only) |

Phase F noted that `appointment_status_definitions` carries no columns
declaring which statuses count toward revenue, payroll or utilization —
that policy lives in evaluators. Phase G did not change this. It remains
acceptable because each evaluator is single-sourced and deterministic, but
it is recorded as **P2-2**: the honest statement is that status *policy*
is code, while status *vocabulary* and *mapping* are data.
