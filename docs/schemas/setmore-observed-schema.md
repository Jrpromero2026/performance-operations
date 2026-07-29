# Setmore — Observed Export Schema (v1)

**Adapter:** `setmore` · **Adapter version:** `setmore-v1` · **Status:** SUPPORTED

## Provenance

- Three real business exports inspected locally on 2026-07-29 (stored in
  gitignored `business-inputs/`; never committed):
  - `Complete_December_Setmore Report.xlsx` — 2,883 data rows (Dec 2025)
  - `JR_December_Setmore Report.xlsx` — 418 rows (Dec 2025, single trainer)
  - `Jo August 2025 Setmore.xlsx` — 208 rows (Aug 2025, single trainer)
- Generation method: Setmore "Report" export (delivered as `.xlsx`,
  single sheet named `Sheet 1`). Export dates unknown.
- All three files share an **identical 20-column header row** → one schema
  variant so far (`setmore-v1`).

## Headers (exact, in order — note trailing spaces)

| # | Header | Notes |
| --- | --- | --- |
| 0 | `Appointment date` | required |
| 1 | `Appointment time` | required |
| 2 | `Service/class/event` | required |
| 3 | `Cost` | required (0 blank in samples) |
| 4 | `Team member` | required — trainer display name |
| 5 | `Customer name` | PII |
| 6 | `Country code ` | **trailing space**; mostly `1`, often blank |
| 7 | `Phone` | PII |
| 8 | `Email` | PII |
| 9 | `Label` | `No label` / `no label` / `No Label` variants |
| 10 | `Status` | see statuses below |
| 11 | `Comments ` | **trailing space**; PII / free text |
| 12 | `Booking ID` | 8-char alphanumeric, e.g. `XXXXX###` |
| 13 | `Booked via` | booking channel |
| 14 | `Booked on ` | **trailing space**; booking creation timestamp |
| 15 | `Address` | PII; mostly blank |
| 16 | `City` | blank in all sampled rows |
| 17 | `State` | blank in all sampled rows |
| 18 | `Country` | `United States` or blank |
| 19 | `Zipcode / Postal code` | blank in all sampled rows |

Header matching must trim whitespace (three headers carry trailing spaces).

## Observed formats

- **Appointment date:** `D MMM YYYY` (e.g. `1 Dec 2025`, `23 Dec 2024`).
- **Appointment time:** 12-hour range `hh:mm AM - hh:mm PM`
  (e.g. `05:30 AM - 06:30 AM`). Duration is derived from the range; no
  separate duration column. No cross-midnight ranges observed; adapter
  treats end < start as next-day with a warning.
- **Cost:** plain decimal, no currency symbol (`80.75`, `64`, `30`).
  Interpreted as USD **listed price** — NOT amount paid, NOT revenue.
- **Booked on:** `D MMM YYYY h:mm AM/PM` (e.g. `7 May 2025 10:36 AM`).
- **Timezone:** none in the file. Organization timezone is assumed and
  recorded as a batch-level assumption.
- **Statuses observed:** `Confirmed`, `Cancelled ` (with trailing space —
  values must be trimmed). No completed/no-show/late-cancel values appear;
  whether `Confirmed` implies completion is an unresolved business decision
  (mapped via org-scoped status mappings, never hard-coded).

## External identifiers

- `Booking ID` identifies the **booking/series, not the occurrence**:
  204 duplicate-ID groups in the December file are all the *same customer*
  at *different date/times* (recurring series). Occurrence identity is
  therefore `(source, Booking ID, start timestamp)`.
- No external client ID and no external trainer ID are provided — matching
  falls back to email/phone/name (client) and name/alias (trainer).

## Known variations / unsupported cases

- Native `.xlsx` upload is NOT supported in this phase (CSV-only pipeline).
  Users export/save the report as CSV with identical columns; this is the
  documented operational step until XLSX ingestion is added.
- Only `Confirmed`/`Cancelled` statuses observed; other Setmore statuses
  (no-show etc.), if they exist, will surface as unknown-status review items.
- Amount-paid / payment status / tips / taxes are NOT present in this
  report variant — only listed `Cost`.
- Multi-participant class rows were not observed (every duplicate-ID group
  was single-customer), but the ledger schema still supports participants.
