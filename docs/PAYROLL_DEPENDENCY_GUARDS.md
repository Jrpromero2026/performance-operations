# Payroll Dependency Guards

Phase 3 documented a hard obligation: once payroll depends on imported
appointments, those appointments and their import batch must not be
mutated or reversed out from under it. Phase 4 implements the guard at
three levels (migration 15).

## 1. Appointment update guard

`appointments_payroll_dependency_guard` (before-update trigger) blocks
**material** changes — `canonical_status`, `record_state`, `trainer_id`,
`department_id`, `start_at`, `duration_minutes` — to any appointment
referenced by calculation lines of an **approved, posted, or locked** run
(`app.payroll_protects_appointment`). Non-material fields (notes,
payment_status) stay editable. Error: `appointment_protected_by_payroll`
with the hint to reopen or supersede the run first.

## 2. Import reversal guard (fail closed)

`app.reverse_import_batch` was **redefined additively** (the applied
Phase 3 migration is untouched; the new definition lives in migration 15).
Before reversing, it collects every approved/posted/locked run that
references any appointment of the batch and, if any exist, raises

```
payroll_dependency_exists:<run-id>[,<run-id>…]   (errcode P0009)
```

listing the dependent runs, with a hint to reopen or supersede them.
Reversal proceeds only when no protecting runs remain (draft/needs_review/
reopened/superseded/voided/failed runs do not protect).

## 3. UI surfacing before the attempt

`payroll_dependencies_for_batch(batch_id)` (security definer + public
wrapper, import:read scoped) returns the dependent runs' id/name/status.
The import batch page calls it for posted batches: when dependencies
exist, the Reverse button is hidden and a warning panel links to each
dependent payroll run, so operators see the constraint before ever
attempting a reversal. The RPC remains the authoritative enforcement.

## Release path

Reopening (platform admin, reasoned, audited) or superseding a run removes
its protection; the appointment can then be corrected and the batch
reversed, after which recalculation reflects the corrected ledger. The
posted snapshots of the reopened/superseded run remain as the historical
record of what had been posted.

## Verification

- Live SQL checks 12–13 and 17–20: material update blocked, non-material
  allowed; reversal blocked with the run id in the error and 1 row from
  the dependencies function; guard released after reopen and after
  supersession (reversed_count = 2).
- Live Playwright steps 8 and 10: the batch page shows "Reversal blocked
  by payroll" with a link to the run and no Reverse button while posted;
  after supersession + void, reversal succeeds through the UI.
