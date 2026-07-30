# Email Delivery Architecture

Provider-neutral delivery with NO real provider configured or claimed
(unresolved decision: Resend / Postmark / SES / org SMTP). The only
executable provider is the TEST provider (channel status `test_mode`):
sends are recorded and accepted internally; nothing leaves the system.
`none_configured` fails closed with `delivery_not_configured`.

## Channel model (`delivery_channels`, one email channel per org)

Provider + status (`unconfigured` / `test_mode` / `active` /
`disabled`), sender identity (informational until a real provider),
non-secret config, Vault `secret_ref` slot for future provider keys,
and the ORGANIZATION POLICIES — both default OFF:
`allow_external_recipients`, `allow_trainer_statements`. A
`none_configured` provider can never carry an active status (CHECK).
Managed via `email_policy:manage`; every change audited.

## Lifecycle honesty (`email_delivery_events`)

States: pending → sending → delivered_to_provider / accepted →
(deferred) → delivered / bounced / rejected / failed / cancelled.
**We never claim `delivered` without provider-level confirmation** —
the test provider terminates at `accepted`. Finalized events
(delivered/bounced/rejected/failed/cancelled) are immutable evidence
(trigger); a manual retry creates a NEW attempt-scoped event. Rows
store recipient (+type +profile), template, artifact reference + hash,
provider + message id, attempt count, sanitized last error, and
timestamps. Recipients are masked (`k***@domain`) wherever shown
broadly. Subjects never contain amounts or payroll figures
(`safeSubject`).

## Recipient governance

Re-resolved AT EXECUTION TIME against current memberships
(`resolveRecipients`): every address must belong to an ACTIVE member of
the organization; removed/deactivated users are excluded (recorded as
skipped, never emailed); cross-org recipients are rejected; external
addresses require the channel policy (default off); addresses are
never inferred from names (Phase 7 already restricts definition
recipients to member emails at creation — execution re-checks).
**Trainer payroll statements are NOT emailed**: the
`allow_trainer_statements` policy gate exists, but no statement
delivery path is implemented this phase (explicit organization policy
decision pending — U10h). Attachments above 2 MB fall back to a deep
link; signed expiring download links are future work tied to a real
provider (no signed-link infrastructure is claimed).

## What enabling real email requires (manual configuration)

1. Business chooses a provider + sender domain (U10d/U10e) and
   completes domain verification there.
2. Provider API key stored in Vault via the channel's `secret_ref`
   path; channel set `active`.
3. A provider implementation of `EmailDeliveryProvider` (send +
   bounce/rejection ingestion) — currently intentionally absent;
   selecting an unimplemented provider fails closed.
4. Delivery-state webhooks/polling to advance `delivered_to_provider` →
   `delivered`/`bounced` honestly.
