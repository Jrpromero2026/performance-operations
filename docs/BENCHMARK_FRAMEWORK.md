# Benchmark Framework

Evidence-backed reference values — migration 30
(`performance_benchmarks`), `src/lib/analytics/benchmarks/actions.ts`.

## No invented numbers

Every benchmark records an explicit `source_type` and non-empty
`evidence`:

| Source | Value comes from | Evidence |
| --- | --- | --- |
| `org_historical_median` / `org_historical_best` | Engine results per reporting period over a cited source range (median / best) | Generated citation: engine version, period list, rule |
| `department_historical_median`, `trainer_historical_baseline` | Same, scope-narrowed | Same |
| `internal_standard` | Owner-entered | Required written justification (who set it, why) |
| `external_reference` | Owner-entered | Required citation of the owner-provided source document |

Internal-historical values are computed **at creation** from healthy
engine results only — if the cited range has no healthy values, creation
refuses ("a benchmark cannot be built from unavailable data"). The
application never seeds an industry number, and internal targets are
never described as industry standards.

## Lifecycle

`draft → approved → deprecated → archived` (drafts may archive
directly). Trigger-enforced:

- approval requires `benchmark:approve` (recorded);
- **approved content is frozen** — metric, scope, value, evidence, and
  source citations cannot change; deprecate and create a new benchmark;
- deprecation/archival require `benchmark:archive`; deprecated
  benchmarks stay on record with their evidence (no deletes).

## Comparison rules

Only **approved** benchmarks participate. A comparison additionally
refuses when:

- the selected window falls outside the benchmark's effective dates;
- the pinned metric version no longer matches the live catalog
  (flagged, not silently compared);
- the engine value is unavailable (reason shown).

Labels rendered in the UI: internal historical, internal approved
standard, external approved reference — plus unavailable states.

## Permissions (live-verified)

`benchmark:read` — all analytics roles except trainer/viewer scope
rules; `benchmark:create` / `benchmark:approve` / `benchmark:archive` —
workspace admin (platform admin implicit). Department-scoped viewers see
organization-level and their departments' benchmarks; trainers see only
benchmarks pinned to their own trainer record. Cross-organization access
is denied by RLS.
