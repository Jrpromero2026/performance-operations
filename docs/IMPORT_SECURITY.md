# Performance Operations — Import Security & Data Handling

## Permissions (added additively; not granted broadly)

| Permission | platform_admin | workspace_admin | payroll_manager | dept_manager | trainer | viewer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| import:upload | ✓ | ✓ | ✓ | – | – | – |
| import:resolve | ✓ | ✓ | ✓ | – | – | – |
| import:approve *(phase 2)* | ✓ | ✓ | ✓ | – | – | – |
| import:post | ✓ | ✓ | ✓ | – | – | – |
| import:reverse | ✓ | ✓ | – | – | – | – |
| import:download | ✓ | ✓ | ✓ | – | – | – |
| appointment:read | ✓ | ✓ | ✓ | ✓ (dept-scoped) | own rows only | ✓ |
| appointment:correct | ✓ | ✓ | ✓ | – | – | – |

Separation of duties (different uploader vs approver) is supported by the
permission split but not mandatory — recorded as an open configuration
decision. Application logic checks exact permissions, never role names.

## RLS posture

Every Phase 3 table: RLS enabled AND forced, deny-by-default, org-scoped
policies, no broad authenticated grants, no DELETE policies on evidence
(batches, rows, issues→update-only, resolutions/events/links/history/
corrections append-only). Live-verified: cross-org batches/rows/
appointments invisible; unauthorized posting/reversal rejected; trainer
self-scope; append-only audit.

## Original file storage

Private bucket `performance-operations-imports`; path
`organization_id/year/month/batch_id/filename`; 10 MB limit; CSV MIME
allowlist; filenames sanitized server-side; sha256 computed server-side;
object PATH stored (never a public URL); downloads via 60-second signed
URLs gated by `import:download` and audited; storage policies key on the
org-id path segment; NO update or delete policies — originals are
evidence, and reversal never deletes them. Service-role keys are never
exposed to the browser (the app does not even hold one). Retention policy
is an unresolved business decision (see DECISION_LOG).

## PII handling

- Aggregate issue lists never include client names/emails/phones
  (`original_value` is null for client-identity issues).
- Raw rows are stored once in `import_rows.original_row` and shown only on
  row/appointment detail to `import:read` / `appointment:read` holders.
- Audit metadata carries sanitized summaries only — never full rows,
  tokens, or credentials; failure messages are sanitized codes + neutral
  text.
- CSV formula injection: cells are stored inert and never evaluated;
  `escapeCsvCell` prefixes formula-like values on any future export.
- Setmore Comments stay in staging evidence, not the posted ledger,
  pending the source-notes business decision.
- Address/city/state/zip columns are preserved in raw evidence but not
  normalized (not needed for operations).
- This system does not intentionally import medical records or clinical
  notes, and makes no HIPAA-compliance claim.

## Limits and abuse controls

10 MB / 10,000 rows per file; per-file duplicate-hash gate; posting/
reversal single-flight via row locks; review pagination caps result
windows. Rate limiting beyond Supabase's built-in auth limits is deferred
to production hardening (documented, not claimed).
