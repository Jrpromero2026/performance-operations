# Close Manifest

The manifest is the immutable, hashed record of exactly what a period
close contained. It stores **references and hashes**, never full
operational datasets and never client PII.

## Contents (`buildManifestPayload`, `src/lib/close/manifest.ts`)

- Identity: organization, reporting period (id/label/dates), close run
  id, close version, source cutoff.
- Approvals: initiated/reviewed/approved by + timestamps.
- Warning acknowledgements: check code, actor, note, time (sorted by
  code).
- Engine versions: `intel-v1`, payroll `calc-v1` (null when the period
  had no payroll).
- Payroll reference: run id, snapshot version, snapshot sha256 — never
  the compensation rows themselves.
- Appointment count and import batches (included + reversed ids,
  sorted).
- Report package reference (id/type/version/sha256) and export
  references (id/type/file/version/sha256/row count, sorted).
- Trainer statement versions (per-trainer statement sha256), when a
  trainer-statements package exists.
- Full readiness results (code/category/severity/status/resolution/
  explanation, sorted by code).
- Supersession: `supersedes_close_run_id` + reopen history
  (version/when/why per superseded cycle).

## Determinism and hashing

`stableStringify` serializes with recursively sorted object keys and
drops `undefined` values; every embedded collection is sorted by the
builder. Identical inputs therefore produce byte-identical JSON, and
`hashManifest` = sha256 over that serialization. Volatile execution
fields (`closed_by`, `closed_at`) live on the run/manifest ROW, not in
the hashed payload, so the hash is reproducible from frozen sources.

## Freezing and validation

The TS coordinator assembles the manifest from frozen references,
hashes it, and passes both to `app.execute_period_close`, which
validates: manifest run id matches the locked run; the linked report
package is `ready`, org/period-matched, and matches the manifest; every
listed export exists, is non-superseded, and its stored sha256 matches.
The row in `period_close_manifests` is inserted inside the same
transaction; the table has a SELECT-only RLS policy (no
insert/update/delete for users), and reopen does NOT delete it — the
superseded cycle's manifest remains frozen history.

## Access

- Web: `/period-close/[id]/manifest` (print-ready summary + raw JSON).
- File: the `close_manifest_json` export — `stableStringify(payload)`,
  hash-verified on download like every export.

Verified by `tests/unit/close-manifest.test.ts` (determinism, ordering
insensitivity, tamper detection, volatile-field exclusion) and live SQL
sections 8–9 and 12 (validation failures, atomic insert, immutability).
