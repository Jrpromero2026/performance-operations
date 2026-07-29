# Payroll Statements and Exports

All statement surfaces share the loaders in `src/lib/payroll/statements.ts`
so the web view, print view, and CSVs can never disagree.

## Trainer payroll-preparation statement

`/payroll/[runId]/statements/[trainerId]`

- Header: trainer, organization, period + range, run name/status, engine
  version, and a DRAFT banner until the run is posted.
- Line table: date, line type, service, session status (or
  `excluded:`/`blocked:` reason), basis, rate (cents or %), amount.
  **Sessions are identified by date and service only — client identities
  never appear** (masked client references).
- Category totals (commission, flat, hourly, team, bonuses, deductions,
  adjustments net) and FINAL GROSS, plus the fixed footer: *gross
  compensation preparation only — not net pay; taxes and withholdings are
  out of scope*.
- Print/save-PDF via the browser print button (print-friendly layout; the
  chrome is `print:hidden`). A dedicated PDF renderer was intentionally
  not added — browser print output is the deliverable; XLSX was likewise
  skipped as not practical this phase (CSV covers the spreadsheet need).
- Access: `payroll:read` holders any time; the trainer themself only when
  the run is posted/locked (same rule as RLS). Views record a
  `statement_view` row in `payroll_exports`.

## Department summary

`/payroll/[runId]/statements` — per-trainer category columns, session and
minute counts, eligible basis, final gross, and a TOTAL row; links into
each statement. Draft banner until posted.

## CSV exports (route handlers)

- `GET /payroll/[runId]/export` — department summary CSV
  (`payroll:export`).
- `GET /payroll/[runId]/statements/[trainerId]/export` — trainer statement
  CSV (`payroll:export`, or the trainer's own statement once
  posted/locked).

Both are permission-checked in the handler (RLS still applies underneath),
CRLF-formatted with proper quoting, headed by org/period/run/engine
metadata, carry the not-net-pay note, and record a `payroll_exports` row
with the latest snapshot version. `Cache-Control: no-store`.

## Supersession

`app.supersede_payroll_run` marks every export row of the superseded run
`superseded = true`, so distributed artifacts are identifiable as replaced.
