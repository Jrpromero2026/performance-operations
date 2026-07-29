# Accounting Exports

Accounting-friendly CSV exports rendered from frozen sources by pure
builders (`src/lib/close/exports.ts` over `csv.ts`); assembled and
loaded by `export-data.ts`. No recalculation: every number was computed
by its owning engine (payroll `calc-v1`, intelligence `intel-v1`).

## Files

| Export type | Source | Notes |
| --- | --- | --- |
| `payroll_register_csv` | posted `payroll_trainer_summaries` | one row per trainer: component cents columns + final gross (cents AND USD) |
| `payroll_detail_csv` | posted `payroll_calculation_lines` | one row per line: reference, basis, rate, amount, rule, eligibility, exclusion reason |
| `department_summary_csv` | frozen executive package payload | sessions/minutes/payroll/listed per department; paid amounts stay EMPTY with an explicit health column |
| `executive_summary_csv` | frozen executive package payload | every metric with value, unit, health, reason, engine version — unavailable metrics keep their reason, never $0.00 |
| `trainer_statement_register_csv` | Phase 4 statement builders | per-trainer final gross + statement sha256 |
| `close_manifest_json` | `period_close_manifests` | stable-stringified manifest |

## Format guarantees

- **Deterministic columns** — exported `*_COLUMNS` constants; order
  never depends on data. Rows sort deterministically (trainer/date/
  reference, metric id, department).
- **Integer cents raw + USD presentation** — cents columns export the
  integer; a formatted `$` column sits alongside (single `usd()`
  helper). Missing values export as EMPTY cells, never fake zeros.
- **Formula-injection protection** — any cell starting with
  `= + - @ TAB CR` is prefixed with `'` before RFC 4180
  quoting/escaping. Cost accepted: negative numbers also receive the
  prefix (fail-safe over cosmetics; documented for the accountant).
- **Encoding** — UTF-8, CRLF line endings, trailing newline; metadata
  header block (title, organization, period, payroll run/snapshot)
  precedes the column row.
- **Hashes** — every document carries sha256 + byte size, recorded in
  `close_exports` and re-verified on download (EXPORT_MANIFEST.md).

## Unresolved business inputs (recorded, not guessed)

- Required accounting columns / GL account mapping for the club's
  bookkeeping system are unknown — current columns are a reasonable
  register/detail set pending accountant review.
- XLSX was not built: CSV opens in Excel directly; PDF = browser print
  views. Revisit only on explicit request.
- Which exports are MANDATORY before close is provisional
  (`REQUIRED_EXPORT_TYPES` = payroll register [only when the period has
  payroll] + executive summary) — awaiting business confirmation.

Verified by `tests/unit/close-csv.test.ts` + `close-exports.test.ts`
and live e2e step 4 (honest no-payroll failure + verified download).
