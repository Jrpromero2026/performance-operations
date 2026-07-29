# Notification Model

In-app notifications only — no email, no push (out of scope by design).

## Storage (migration 18)

`public.notifications`: recipient, organization, category
(payroll/imports/configuration/reporting/system/ai-reserved), severity
(info/warning/critical), title/body, deep link, linked entity
(type + id), actor, created/read/pinned/archived timestamps.

- **RLS**: recipients see and manage ONLY their own rows; inserts require
  `actor_id = auth.uid()`.
- **Immutability**: a trigger rejects changes to content fields — a
  recipient can only flip read/pin/archive state.

## Emission

`notifyPermissionHolders(actor, org, permission, input)` resolves
recipients from REAL memberships (roles whose permission set includes the
target permission), excludes the actor, and inserts one row per
recipient. Failures log and never break the calling workflow.

Wired events:

| Event | Recipients (permission) | Severity |
| --- | --- | --- |
| Import posted | import:approve | info |
| Import reversed | import:approve | warning |
| Payroll approved | payroll:post | info |
| Payroll posted | payroll:approve + each trainer with a linked login (their statement link) | info |
| Payroll reopened | payroll:review | warning |

Future events (configuration drift, AI insights) reuse the same helper
and the reserved categories.

## Consumption

- Header bell: unread badge + eight most recent + mark-all-read.
- `/notifications`: unread / all / pinned / archived tabs; per-row mark
  read/unread, pin/unpin, archive; deep links to the linked object.
- Overview snapshot exposes the unread count for future widgets.

Pinned rows sort first; archiving implies read. Deleting is allowed
(recipient-owned) but the UI favors archive.
