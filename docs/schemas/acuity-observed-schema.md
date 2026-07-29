# Acuity Scheduling — Observed Export Schema

**Adapter:** `acuity` · **Status:** **BLOCKED — no sample file provided**

## Provenance

No Acuity export sample was available in `business-inputs/` or anywhere on
the machine as of 2026-07-29. Per the phase rules, no schema has been
invented and **Acuity support is NOT claimed**.

## What exists instead

- The source-adapter interface and schema-inspection tooling are
  source-agnostic and ready to host an `acuity-v1` adapter.
- Until a sample arrives, Acuity CSV exports can be imported through the
  **generic CSV adapter** with a saved, organization-scoped column mapping
  (see `generic-csv-schema.md`). The mapping is versioned and reusable for
  files with the same header signature.

## To unblock

Provide a sanitized Acuity appointments/export CSV covering at least one
reporting period, plus a note on how it was generated (which report,
which filters). The observed headers, date/time formats, status values,
IDs, and payment fields will be recorded here and an `acuity-v1` adapter
built and tested against synthetic fixtures derived from it.
