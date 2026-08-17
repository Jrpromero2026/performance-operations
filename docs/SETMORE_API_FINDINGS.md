# Setmore API Findings

Official documentation inspected **2026-07-29**:
- https://setmore.docs.apiary.io/ (full API reference, rendered)
- https://www.setmore.com/developers
- https://support.setmore.com/en/articles/579360-request-access-to-the-setmore-api

## Access model (VERIFIED from docs)

- The API is a **limited beta**: access requires a **Setmore Pro
  account** plus an emailed application to `api@setmore.com` (name,
  registered email, use case); requests are reviewed "one-by-one,
  first-come-first-serve". Credentials are issued by Setmore as a
  **refresh token** — there is no self-service key generation.
- **No sandbox**: "All API requests use live accounts."

## Authentication (verified)

- Base URL: `https://developer.setmore.com/api/v1`
- Booking API server: `https://developer.setmore.com/api/v1/bookingapi`
- `GET /o/oauth2/token?refreshToken={refresh_token}` → bearer
  `access_token` (`token_type: BEARER`, `expires_in: 604799` ≈ 7 days).
- All API calls: `Authorization: Bearer {access_token}`.

**Re-confirmed 2026-08-17** against the quickstart supplied with the
granted API access. The response envelope is:

```
{ "response": true,
  "data": { "token": { "access_token", "token_type", "expires_in", "user_id" } } }
```

`user_id` was not in the earlier reference and is not consumed — we have no
use for it and do not store it. The quickstart also states explicitly that
integrations must "proactively call this endpoint to refresh tokens before
they lapse," which is why `getAccessToken` holds a token for its lifetime
rather than minting one per request.

Access was granted as a **permanent refresh token issued by email**,
exactly as documented. No OAuth client-id/secret flow is involved.

## Endpoints (verified)

| Capability | Endpoint | Notes |
| --- | --- | --- |
| Appointments by date range | `GET /bookingapi/appointments?startDate=dd-mm-yyyy&endDate=dd-mm-yyyy` | max **150**/request; `cursor` param for next batch; optional `staff_key`, `customerDetails=true` |
| Create appointment | `POST /bookingapi/appointment/create` | write — not used by us |
| Update appointment label | `PUT /bookingapi/appointments/{key}/label` | label is a free-form string |
| Staff | `GET /bookingapi/staffs` | max **50**/request + `cursor` |
| Services | `GET /bookingapi/services`, `/services/categories`, `/services/categories/{key}` | key, name, staff_keys, duration, cost, currency |
| Customers | `POST /bookingapi/customer/create`, `GET /bookingapi/customer?firstname=&email=&phone=` | fetch is name-keyed search only |
| Time slots | `POST /bookingapi/slots` | availability, not history |

Appointment object fields (verified example): `key`, `start_time` /
`end_time` (format `yyyy-MM-ddTHH:mmZ` — UTC-suffixed, minute
precision), `duration`, `staff_key`, `service_key`, `customer_key`,
`cost`, `currency`, `comment`, `label`.

## Capability gaps (verified ABSENT from official docs)

- **No appointment status field.** The fetch payload exposes only a
  free-form `label` (e.g. "No Label"). The canonical statuses our
  ledger requires (completed / cancelled / no-show) are **not
  documented** in the API response. The CSV export's `Status`-bearing
  columns have no documented API equivalent.

  **Re-confirmed 2026-08-17.** The quickstart supplied with the granted
  access lists exactly three appointment operations —
  `POST /appointment/create`, `GET /appointments`, and
  `PUT /appointments/{appointment-id}/label`. The only per-appointment
  annotation Setmore exposes for *writing* is the label, which is the
  strongest documentary signal yet that no status concept exists in the
  API surface at all. Still not proof about the read payload: only the
  live probe settles that.
- **No modified-since / incremental sync.** Only date-range windows;
  changed-record detection would require re-fetch + diff.
- **No webhooks documented.**
- **No cancellation/deletion semantics documented** for fetched
  appointments (whether cancelled appointments appear, and how).
- **Rate limits unspecified**: "rate-limited… we monitor usage and
  reserve the right to allow or restrict a certain number of requests
  per minute" — no numbers, no documented headers.
- **Recurring series identity unresolved.** Phase 3 established from
  real CSV exports that Setmore *Booking IDs identify recurring series,
  not occurrences*. The API's appointment `key` may or may not be
  occurrence-unique — the docs never address recurrence. **Do not
  assume the API resolves this without live verification.**
- `cost` appears as an integer (`1000` alongside `"currency": "USD"`)
  in examples while services use small numbers (`10`, `20`) — the unit
  (cents vs dollars) is **ambiguous in the docs** and must be verified
  against a live account before any financial mapping.

## Implementation status (updated Phase G, 2026-08-15)

**TRANSPORT IMPLEMENTED — NOT LIVE-VERIFIED.**

What changed in Phase G: `setmore-api-v1` is now written against the
verified documented contract. Token exchange, cursor-paginated
appointments/staff/services, customer search, header-driven rate-limit
observation, and failure classification all exist in
`src/lib/sources/setmore/api-client.ts` (server-only), and API payloads
flow through the SAME canonical normalizer as the CSV export
(`src/lib/sources/setmore/canonical.ts`).

What has NOT changed: **no live account has ever been exercised.** The
adapter therefore stays fail-closed. The gate is a single reviewed
constant, `SETMORE_API_LIVE_VERIFIED` in
`src/lib/integrations/providers/setmore.ts`, currently `false`; while it
is false `adapter.status === "blocked"`, the sync engine refuses to run,
and every credential-touching method throws `ProviderBlockedError`.
Offline normalization of already-captured evidence is deliberately
allowed, because it touches no credential and gains nothing from being
blocked.

Remaining blockers, unchanged in substance:

1. **No credentials** — beta access must be granted by Setmore to the
   organization's Pro account (application email required).
2. **No documented appointment status.** Handled rather than assumed:
   API-sourced appointments land as `unknown` and are excluded from
   production and revenue. See `docs/SETMORE_STATUS_MAPPING.md`.
3. **Recurrence/occurrence identity unverified.** Occurrence identity is
   `(external id + start instant)` for both origins; whether the API's
   `key` is occurrence-unique is testable by the reconciliation report.
4. **Cost unit ambiguity.** Handled rather than assumed: API `cost` is
   preserved as evidence and NOT mapped to a price until an operator
   declares `cost_unit` on the connection.

To flip the gate, complete `SETMORE_LIVE_VERIFICATION_CHECKLIST` in the
provider module, run `reconcileSetmoreSources` over one full historical
month against the CSV export for the same period, review every MISMATCH
and API_ONLY/CSV_ONLY row, and record the verified shapes and date here.

**Manual CSV import remains the supported Setmore path.**
