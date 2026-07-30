# Performance Operations — Required Business Inputs

The following inputs are required before the Import Center and Payroll Engine
phases can be built accurately. Please provide current, real examples (with
any sensitive personal data redacted if necessary).

## 1. Setmore CSV Export

- A recent appointment export covering at least one full reporting period.
- Include every column Setmore produces (trainer/staff, client, service,
  date/time, duration, status, price, notes).
- Note any manual edits you routinely make to the export before using it.

## 2. Acuity CSV Export

- Same requirements as Setmore: full-period export, all columns, list of
  known quirks (time zones, cancelled-appointment rows, package redemptions).

## 3. Timberhill Payroll Workbook

- The current spreadsheet used to compute trainer payroll, including all
  tabs, formulas, and any hidden helper columns.
- One completed historical period plus a blank template if available.

## 4. G3 Payroll Workbook

- Same as above for G3 Sports & Fitness (all departments, including how
  Performance Evaluations and G3 Volleyball are compensated).

## 5. Current KPI Worksheet

- The worksheet used for department KPIs and trainer scorecards, with
  definitions for every metric (how "sessions", "active clients", "revenue
  per session", and "payroll percentage" are currently calculated).

## 6. Trainer Roster

- Every active trainer/coach: name, email, organizations, departments,
  role/title, start date, and (if applicable) end date.
- Note trainers who work in both organizations or multiple departments.

## 7. Service List

- Every bookable service per organization: name as it appears in
  Setmore/Acuity, department, duration, list price, and whether it is a
  single session, package redemption, or evaluation.

## 8. Compensation Rules

- For each trainer or trainer tier: pay type (per-session, hourly,
  commission, salary+commission), exact rates/percentages, tier thresholds,
  and any department-specific overrides or bonuses.
- Effective dates of the current rules and any known upcoming changes.

## 9. Appointment Statuses

- The complete list of statuses that appear in exports (completed, no-show,
  cancelled, late-cancel, rescheduled, …) and, for each: is it payable to
  the trainer, and does it count as revenue?

## 10. Cancellation Rules

- Late-cancel window and fees per organization/service.
- Whether trainers are paid for no-shows/late cancels, and at what rate.

## 11. Reporting-Period Rules

- Period boundaries per organization (monthly, semi-monthly, bi-weekly),
  cutoff times, and the payroll processing/lock schedule.
- Who is allowed to reopen a closed period and under what circumstances.

## 12. Revenue-Recognition Rules

- Whether revenue counts on the session date or the payment date.
- How packages and memberships are allocated across sessions/periods.
- Handling of refunds, comps, and employee-discounted sessions.

## 13. Setmore API Access (Phase 8 — unblocks native sync)

- Confirm the account is on the Pro tier, then apply for API access
  (api@setmore.com: name, registered account email, use case) and
  provide the issued refresh token THROUGH THE CREDENTIAL FORM in
  /configuration/integrations (never by email/file).
- Once live: sample API payloads for a completed, a cancelled, and a
  recurring appointment (to verify status representation, occurrence
  identity, and the cost unit).

## 14. Acuity API Access (Phase 8 — unblocks native sync)

- The account's numeric User ID + API key (Integrations → API),
  provided through the credential form.
- Representative appointment data covering completed / cancelled /
  rescheduled cases; confirmation of the calendar↔trainer and
  appointment-type↔service mappings.

## 15. Email Delivery Decisions (Phase 8)

- Approved provider (Resend / Postmark / Amazon SES / existing SMTP),
  sender domain + address, and who completes domain verification.
- External-recipient policy and trainer-statement email policy (both
  default OFF until explicitly approved).
- Retention expectations for delivery records.

## 16. Automation Policies (Phase 8)

- Desired sync frequency and date-window per provider.
- Whether integration batches may ever auto-approve/auto-post
  (currently impossible by database constraint — changing this is an
  explicit policy + migration decision).
- Worker hosting/scheduler choice for production (documented options in
  docs/BACKGROUND_JOB_ARCHITECTURE.md).

## 17. Analytics, Goals, and BI Decisions (Phase 9)

- Approved scorecard metric lists (executive / department / trainer) —
  current defaults are engineering-chosen from the approved catalog.
- Goal governance: approval policy, ownership conventions, cadences;
  whether goals ever carry consequences (none are automated today).
- Benchmark policy: acceptable evidence, approval workflow, and any
  external references the owners can substantiate.
- Small-cohort suppression threshold for production (mechanism exists,
  currently off in dev).
- Fiscal calendar + official year-to-date definition (currently
  calendar YTD).
- Presentation branding assets and preferred chart palette; required
  board-report sections and order.
- Trainer ranking/visibility policy (nothing ranked publicly today; no
  composite trainer score exists).
- Dashboard sharing defaults per role; external dashboard recipients
  (currently impossible).
- Required (vs available) report subscriptions per role once a real
  email provider is configured.
