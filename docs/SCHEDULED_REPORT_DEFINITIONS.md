# Scheduled Report Definitions

**Definitions only — execution is NOT enabled.** There is no scheduler,
no cron, no email, and no webhook infrastructure in this system.
`scheduled_report_definitions.execution_enabled` is constrained
`CHECK (execution_enabled = false)` at the database level, so no code
path can silently activate delivery; a future background-jobs phase
relaxes the constraint behind a clean interface.

## Model

Per definition: organization (+ optional department), owner, optional
`saved_view_id`, `report_type` (`quick_report`, `executive_package`,
`department_package`, `payroll_package`), `frequency` (`daily`,
`weekly`, `monthly`, `period_close`, `custom`), `delivery_channel`
(`in_app` today; `email_planned` reserved), intended `recipients`,
IANA `timezone`, `active` flag, and intended-run bookkeeping columns
(`next_intended_run`/`last_intended_run`, unused until execution
exists).

## Validation (`createScheduledReport`)

- `scheduled_report:manage` required in the organization.
- Report type and frequency whitelisted; timezone validated via `Intl`.
- **Recipient scope**: every recipient email must belong to a current
  member of the organization — definitions cannot target outside
  addresses.
- Creation notifies `scheduled_report:manage` holders in-app with an
  explicit "Execution is NOT yet enabled" body; all mutations audited.

## UI

`/reports?tab=scheduled`: a prominent execution-not-enabled banner, the
definitions list (type, frequency, timezone, recipients, active state,
each row labeled `not executing`), and enable/disable/delete controls
for managers. Enabling a definition only records intent — the success
message repeats that execution is unavailable.

## Unresolved business inputs

Actual cadence expectations, delivery medium (email vs in-app digest),
and recipient policies are business decisions not yet made — the model
records intent without guessing them.
