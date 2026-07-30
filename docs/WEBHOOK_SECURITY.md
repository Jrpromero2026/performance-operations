# Webhook Security

`POST /api/webhooks/[token]` — provider-neutral ingestion, built only
for providers with DOCUMENTED webhook support (Acuity: verified
contract; test provider: synthetic). Never a generic unauthenticated
ingestion endpoint.

## Defense layers (in order)

1. **Endpoint identity**: the URL token is an unguessable credential;
   only its sha256 lives in `integration_webhook_endpoints`
   (invitation-token pattern). Unknown/inactive tokens → 404.
2. **Content-type allowlist** (json / form-urlencoded) → 415 otherwise.
3. **Payload size limit** (64 KB) → 413.
4. **Provider signature verification** through the adapter:
   - Acuity: base64 HMAC-SHA256 of the raw body with the API key
     (`x-acuity-signature`), constant-time comparison — exactly the
     documented contract.
   - Test provider: HMAC-SHA256 + a ±5-minute timestamp window
     (Acuity documents NO timestamp mechanism, so replay defense there
     is event-id idempotency — recorded honestly in the findings).
   The signing secret resolves server-side via the worker-key gate;
   endpoints without a resolvable secret REJECT (fail closed).
5. **Replay/duplicate protection**: `(endpoint, provider_event_id)` is
   DB-unique; duplicates acknowledge 200 `duplicate` without work.
6. **Fast acknowledgement, async processing**: the raw event is
   preserved (payload + sha256) and a `webhook_processing` job is
   enqueued (idempotent key `webhook:<endpoint>:<event>`); the request
   returns 202 immediately.
7. **No canonical writes**: webhook processing only triggers a SYNC of
   the connection's definition — the fetched data flows through the
   standard import review pipeline like any other sync.
8. Errors are sanitized (`signature_invalid`, `unparseable_event` — no
   payload echoes).

## Dev limitation (recorded)

Ingestion resolves RLS context from the ambient server session; without
a session (a real external provider posting from the internet) the
route returns 503 in this environment. Production enablement pairs the
route with a service-role server client — part of the worker-hosting
decision (U10i). The verification path (signature, idempotency,
size/type limits, enqueue) is fully unit-tested against synthetic
vectors.
