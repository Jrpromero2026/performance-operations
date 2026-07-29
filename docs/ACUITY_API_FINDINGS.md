# Acuity Scheduling API Findings

Official documentation inspected **2026-07-29**:
- https://developers.acuityscheduling.com/docs
- https://developers.acuityscheduling.com/reference (v1 API reference)
- https://developers.acuityscheduling.com/reference/get-appointments
- https://developers.acuityscheduling.com/docs/webhooks

## Authentication (verified)

- **HTTP Basic Auth**: numeric **User ID** as username + **API Key** as
  password (`curl -u ACUITY_USER_ID:ACUITY_API_KEY`).
- **OAuth2** exists for multi-account integrations; single-account
  server integrations use the API key.
- Base URL: `https://acuityscheduling.com/api/v1`.
- "You must make API requests from your own or an external server" —
  no CORS/browser access.

## Endpoints (verified)

`GET /appointments` query parameters (verified list):
`max` (int, default 100), `minDate`, `maxDate`, `calendarID`,
`appointmentTypeID`, `canceled` (default false), `showall` (canceled +
scheduled), `firstName`, `lastName`, `email`, `phone`, `field:id`,
`excludeForms`, `direction` (ASC/DESC, default DESC).

Also: `GET/PUT /appointments/:id`, `PUT /appointments/:id/cancel`,
`GET /calendars`, `GET /appointment-types`,
`GET/POST/PUT/DELETE /clients`.

- **Pagination**: no offset/cursor documented — paging is
  `max` + date windows (`minDate`/`maxDate`). Deterministic windowed
  sync is the viable strategy.
- **Timezones**: IANA identifiers; datetime parameters are interpreted
  "in the business or calendar timezone" (PHP `strtotime` semantics).
- **Cancellation**: cancelled appointments are excluded by default and
  retrievable via `canceled=true` / `showall` — cancellations are
  visible, not silently deleted.

## Webhooks (verified)

- Events: `appointment.scheduled`, `appointment.rescheduled`,
  `appointment.canceled`, `appointment.changed` (catch-all), plus
  `order.completed`.
- Subscription: static (Integrations settings UI) or dynamic (Webhooks
  API).
- Payload: `application/x-www-form-urlencoded` with `action`, `id`,
  `calendarID`, `appointmentTypeID` — a **thin notification**; the
  record must be re-fetched via the API (fits our
  webhook-enqueues-sync model exactly).
- Signature: base64 **HMAC-SHA256** of the raw request body with the
  **API key** as secret, sent in the `x-acuity-signature` header.
- Retries: exponential backoff over 24 h on 500/network failure;
  webhook auto-disabled after 5 days of continuous failures.
- **No timestamp/replay protection documented** — replay defense must
  come from our own event-ID idempotency + freshness checks.

## Unverified / missing

- **Rate limits**: not found in the documentation inspected (the
  rate-limits page 404s). Treat limits as unknown; rely on 429/
  `Retry-After` handling generically. Do not hardcode numbers.
- **No representative sample data**: the Phase 3 blocker stands — we
  have never seen a real Timberhill/G3 Acuity export or API payload, so
  status semantics, appointment identifier stability across
  reschedules, the trainer↔calendar mapping, and the service↔
  appointment-type mapping are all unconfirmed for THIS business.
- **No credentials**: no Acuity account access is available.
- Appointment object field-level shape (id/datetime/canceled fields)
  not captured verbatim from the reference — required before fixture
  creation.

## Implementation status: **BLOCKED**

Native `acuity-api-v1` is NOT implemented. Missing inputs: valid
account credentials, representative sample data, confirmed status
semantics, confirmed identifier stability, confirmed calendar/trainer
and appointment-type/service models. The provider is registered as
`blocked` with the verified capability matrix above (auth model,
endpoints, webhook mechanics are documented and ready);
`src/lib/integrations/providers/acuity.ts` carries the setup
checklist. **Generic CSV mapping remains the supported Acuity
fallback.** Acuity is closer to implementable than Setmore: the API
contract is public and complete except rate limits — only credentials
and representative data block it.
