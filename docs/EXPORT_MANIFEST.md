# Export Manifest

Every generated export is recorded in `close_exports` with its full
identity: `export_type`, `file_name`, `version` (unique per
org/period/type), `byte_size`, `sha256`, `row_count`, filters, payroll
run/snapshot reference, generator, and supersession state. This table IS
the export manifest — the separate `export_manifests`/items tables from
the proposal were folded into it (documented deviation).

## Storage strategy: regenerate, verify, serve

**No storage bucket holds export bytes** (documented deviation). Every
export is deterministic over frozen sources:

- payroll register/detail/statement register ← posted (frozen) payroll
  rows and snapshots;
- executive/department summaries ← the frozen `ready`/`finalized`
  executive package payload;
- `close_manifest_json` ← the immutable manifest row.

The download route
(`/period-close/[run]/exports/[export]/download`) regenerates the file
with the SAME builder used at generation time and **verifies the
recorded sha256 before serving**. A mismatch returns HTTP 409
`integrity_mismatch` with both hashes — corrupted or drifted data is
never served as if authentic. Successful downloads increment
`download_count`, are audited, and carry `X-Export-Sha256` /
`X-Export-Version` headers.

## Immutability and versions

`app.protect_close_export` rejects updates to identity fields — only
`superseded` and `download_count` may change after insert. Regeneration
inserts version n+1 and marks the prior version superseded; superseded
versions remain listed and downloadable *while their hash still
verifies* (an audit trail, not a delete).

## Close linkage

The close manifest lists the export ids + hashes it froze; the execute
RPC verifies each exists non-superseded with a matching hash, then
stamps `period_close_run_id`. Reopen marks those exports superseded.

Trade-off accepted: regeneration costs CPU per download and depends on
the frozen sources remaining readable; in exchange there is no second
copy of payroll data to secure, and tampering with EITHER the record or
the sources is detected at download time. Revisit if export volume or
external delivery requirements ever demand object storage.
