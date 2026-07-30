# Pilot Import Runbook

Operator workflow for importing real appointment exports. Applies to
both pilot organizations; source-specific notes below. **Never import
real files into the sandbox organizations** — always select the
"(Pilot)" workspace first.

## Before any import (both organizations)

1. Header → Workspace: select the **(Pilot)** organization.
2. Header → Reporting period: select the period covering the export
   window (create it first at `/configuration/reporting-periods` if
   missing).
3. Services exist with correct departments (`/configuration/services`).
4. Trainers exist with department assignments (`/trainers`).
5. Capture from the source system before uploading (used at step
   "Validate totals"): **row count**, **completed-session count**, and
   **total listed dollars** for the export window.

## Timberhill — Setmore CSV

1. In Setmore, export the appointment report for the exact date range
   (whole reporting period; note the account timezone — confirm it
   matches the value recorded in PILOT_INPUTS_REQUIRED.md).
2. Confirm the export columns match the Setmore report layout the
   adapter expects (`docs/IMPORT_ARCHITECTURE.md`): Appointment
   date/time, Service, Cost, Team member, Customer, Status, Booking ID,
   etc. Do not edit the file by hand.
3. Go to `/imports/new`. Source system: **Setmore (report export, saved
   as CSV)**. Choose the file. Click **Upload & inspect**.
4. You land on the batch page (`/imports/<batch>`): confirm total row
   count matches the source export. STOP if it does not.
5. Open **Review** and clear each queue:
   - **Trainers queue**: map each Setmore team-member name to the
     right trainer (creates a durable staff alias).
   - **Services queue**: map each Setmore service label to the right
     catalog service (**Map service** — durable alias).
   - **Statuses queue**: map each source status to
     completed / cancelled / late_cancelled / no_show / scheduled
     (**Save mapping**). Mapping decisions are business decisions —
     when unsure, stop and decide, don't guess.
   - **Duplicates queue**: rows matching already-posted appointments.
     Expected on overlapping re-exports; excluded automatically —
     review that nothing unexpected appears.
   - **Rejected/blocked rows**: read every one. A blocked row never
     posts; fix the mapping or accept the exclusion knowingly.
6. When the batch shows **ready for approval**, open **Approval**:
   - Read the **Posting summary** (to-post / excluded / duplicate /
     warning counts).
   - **Validate totals** against your step-0 numbers: to-post row count
     and listed-amount total must reconcile with the source export
     (small differences must be explained by exclusions you accepted).
     **STOP CONDITION: unexplained totals = do not approve.**
   - Click **Acknowledge N warnings** (each acknowledgement is
     recorded), then **Approve batch**.
7. Back on the batch page click **Post N rows…** then **Confirm post**.
   Posting writes the canonical ledger — it is governed and reversible
   only as a whole batch.
8. Verify: `/appointments` shows the new records; `/reports` Quick
   report for the period shows matching completed sessions and listed
   amounts.

## G3 Performance — Acuity CSV / generic CSV

Same workflow with these differences:

- `/imports/new` → Source system: **Acuity (via column mapping — no
  dedicated adapter yet)** or **Manual CSV (column mapping)**.
- After upload you first land in **column mapping**
  (`/imports/<batch>/mapping`): assign each CSV column (date, start
  time, duration/end, service, staff, client, price, status) to ledger
  fields. Save, then continue with the review queues exactly as above.
- Multi-coach team sessions: the CSV attributes each row to one staff
  member. If a session must credit multiple coaches, DO NOT invent
  splits at import time — import as exported, and handle coach payout
  splits in compensation configuration once the rule is confirmed
  (PILOT_INPUTS_REQUIRED.md). Until then those sessions pay only the
  attributed coach — flag totals accordingly during payroll validation.

## Safety procedures

- **Avoid duplicate imports**: files are content-addressed — re-uploading
  the identical file is refused; overlapping date ranges dedupe by
  booking identity into the Duplicates queue. Still: prefer
  whole-period exports over ad-hoc ranges.
- **Discard an invalid batch**: before approval, no ledger rows exist —
  leave the batch unapproved (it can sit in needs_review) or reject it
  from the approval page; nothing was posted.
- **Reversal (posted batch)**: batch page → **Reverse batch…** → type
  the reason → confirm. Reversal is whole-batch, audited, and blocked
  while a posted payroll run depends on the batch (the dependency guard
  will tell you — void/reopen that payroll first).
- **Correct a wrong mapping discovered late**: aliases are durable, so
  fix the alias (Configuration → Services → aliases, or remap in a new
  batch), reverse the affected batch, and re-import. Never hand-edit
  posted rows.
- **Compare with the source system after posting**: Reports → Quick
  report (period) → completed sessions + listed amount vs the source
  export; `/imports/<batch>` retains per-row provenance and the file
  hash as evidence.

## What to capture for the pilot log

For every batch: batch URL, file name + row count, source totals
(rows / completed / $ listed), posting summary counts, acknowledged
warnings, post confirmation, and the Quick-report totals after posting.
