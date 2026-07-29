# Performance Operations — Source Adapters

## Contract

Each adapter ([src/lib/imports/types.ts](../src/lib/imports/types.ts))
declares source id, version, required/optional headers, a `detect(headers)`
confidence score, and `normalizeRow(row, ctx)` returning a normalized
staging row + explicit issues. Parsing stays isolated in
`src/lib/imports/` — no source-specific column names leak into the app.
Value parsing is strict: invalid dates/times/money produce blocking issues,
never silent coercion. Unknown columns are preserved verbatim in
`normalized.extra` and flagged. Missing vs blank vs invalid vs
not-provided-by-source are distinguished (absent key / empty value /
issue-with-absent-field / adapter documentation respectively).

## setmore (setmore-v1) — SUPPORTED

Built from three inspected real exports (2,883 / 418 / 208 rows) —
see [schemas/setmore-observed-schema.md](schemas/setmore-observed-schema.md).
Key behaviors: trimmed header matching (three real headers carry trailing
spaces), `D MMM YYYY` dates, `hh:mm AM - hh:mm PM` ranges (duration
derived; end ≤ start treated as next-day with a warning), `Cost` parsed to
integer cents as LISTED price only (an info issue notes that no payment
data exists in this report variant), statuses trimmed (`"Cancelled "`),
Booking ID as series identifier, `Booked on` → source_created_at,
Comments retained in staging evidence only (not posted — source-notes
policy is an open business decision). Organization timezone is assumed and
recorded batch-level.

## acuity — BLOCKED (support NOT claimed)

No sample export exists; no schema was invented. Acuity CSVs run through
the generic mapping adapter meanwhile. Unblocking requires a sanitized
sample (see [schemas/acuity-observed-schema.md](schemas/acuity-observed-schema.md)).

## manual_csv (generic-v1) — SUPPORTED

Mapping-driven: an authorized user maps columns to canonical fields in the
UI ([schemas/generic-csv-schema.md](schemas/generic-csv-schema.md)).
Mappings are saved as `import_schema_profiles`: organization-scoped,
source-scoped, versioned, audited, keyed by a sha256 **header signature**
(trimmed, lowercased, order-sensitive). A saved profile is auto-applied
only to files with the exact same signature; materially different schemas
always re-enter the mapping workflow. Structural minimums (date, trainer,
service, time range or start+end/duration) are enforced at save time and
re-validated per row.

## Adding a new source or variant

1. Obtain a sanitized sample; record it in `docs/schemas/`.
2. Implement `<source>-vN` against the observed schema with unit tests on
   synthetic fixtures.
3. Register it in `src/lib/imports/adapters/index.ts`.
   Variants get explicit new versions — existing versions never change
   semantics. The schema-profile mechanism covers one-off files without
   code changes.
