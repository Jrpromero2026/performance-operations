# Performance Operations — Import Architecture

## Staged flow (nothing writes to the ledger directly)

```
Uploaded file (private storage, sha256, original bytes preserved)
  → Parsed raw rows        (server-side RFC 4180 parser; originals verbatim)
  → Schema validation      (adapter detection / saved column mapping)
  → Normalized staging     (strict value parsing; nothing silently coerced)
  → Entity matching        (org-scoped lookups; no cross-org matches)
  → Exception review       (issue queues + audited resolutions)
  → Approval               (immutable record; auto-revoked on change)
  → Transactional posting  (security-definer RPC; all-or-nothing)
  → Canonical appointment ledger
```

The browser never parses authoritative data; the server parses, validates,
normalizes, and authorizes everything. Unresolved/provisional data never
affects official records.

## Batch lifecycle (DB-enforced state machine)

States: `uploaded → parsing → validating → needs_review →
ready_for_approval → approved → posting → posted`, with `failed` reachable
from processing states (`failed → parsing|validating|needs_review` for
retry), `approved → needs_review` (revocation), and `posted → reversed`
only via the reversal workflow. The transition matrix lives in a database
trigger (`app.import_batch_transition_guard`) — illegal jumps raise even
for direct SQL — plus double-post and double-reverse guards. Every
transition is appended to `import_batch_events` with actor and reason.

## Idempotency and duplicates

- **File level:** sha256 per upload; a file already POSTED for an
  organization is hard-blocked from re-upload (partial unique index on
  `(organization_id, file_hash)` in posted/posting states); re-uploading a
  non-posted duplicate requires explicit confirmation.
- **Occurrence level:** Setmore Booking IDs identify recurring SERIES, so
  occurrence identity is `(organization, source, external_id, start_at)` —
  a partial unique index guarantees one ACTIVE ledger row per occurrence.
- **Row classification:** `new`, `exact_duplicate` (posted twice —
  blocked), `possible_duplicate` (fingerprint: trainer+start+duration),
  `source_update` (same identity, changed substance), `conflict`
  (different trainer/service on the same identity), `previously_reversed`.
  Exact duplicates can never post; everything else requires an audited
  human decision. Re-importing a corrected export therefore surfaces
  controlled `source_update` proposals instead of silent overwrites.

## Issues and resolutions

Issues carry code, severity (`blocking`/`warning`/`info`), field, safe
original value (never client PII in aggregate lists), suggested action,
and a resolution status. Blocking issues prevent approval and posting;
warnings must be explicitly acknowledged; matching re-runs supersede their
own open issues and regenerate them. Every human decision is appended to
`import_resolutions` (and mirrored into `audit_events`) with the affected
row count; bulk actions apply only to identical source values.

## Approval and posting

Approval requires `import:approve`, zero open blocking issues, zero open
warnings, and zero unresolved duplicate classes; it records approver +
timestamp. Any material change afterwards revokes approval and returns
the batch to review (application logic + a row-lock trigger while
approved). Posting (`import:post`) calls `app.post_import_batch`: locks
the batch, re-validates state/authorization/issues/duplicates, inserts
appointments + source links + status history + participants, marks rows
and the batch posted, writes audit events — atomically. Any failure rolls
everything back; a failed posting leaves zero appointments.

## Performance posture

10,000-row / 10 MB caps; chunked DB writes (500/batch); org-scoped lookup
maps loaded once per matching pass (no N+1); server-paginated review
queues (the client never receives a whole batch); processing runs
synchronously inside the request against the local/Node runtime —
serverless chunk-resumption is documented as future work, not claimed.
