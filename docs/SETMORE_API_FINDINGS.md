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
- `GET /o/oauth2/token?refreshToken={refresh_token}` → bearer
  `access_token` (`token_type: BEARER`, `expires_in: 604799` ≈ 7 days).
- All API calls: `Authorization: Bearer {access_token}`.

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

## Implementation status: **BLOCKED**

Native `setmore-api-v1` is NOT implemented. Blocking inputs:

1. No credentials — beta access must be granted by Setmore to the
   organization's Pro account (application email required).
2. No documented appointment status → cannot map to canonical
   statuses without live evidence.
3. Recurrence/occurrence identity unverified.
4. Cost unit ambiguity.

The provider is registered as `blocked` with this capability matrix;
`src/lib/integrations/providers/setmore.ts` carries the setup
checklist. **Manual CSV import remains the supported Setmore path.**
When credentials arrive: validate token exchange, capture real
appointment payloads (recurring + cancelled cases) as synthetic-ized
fixtures, resolve the gaps above, then implement `setmore-api-v1`
against verified shapes only.
