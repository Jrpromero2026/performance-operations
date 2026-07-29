# Period Close State Machine

Authoritative in the database (`app.period_close_transition_guard`,
BEFORE UPDATE on `period_close_runs`); mirrored in TypeScript
(`src/lib/close/transitions.ts`) for friendly errors and unit tests.

## States

| Status | Meaning |
| --- | --- |
| `close_review` | Working state: readiness evaluation, acknowledgements, artifact generation |
| `ready_to_close` | Review completed with zero blocking and zero unacknowledged warnings |
| `closing` | Transient — exists only inside the execute transaction |
| `closed` | Period closed; manifest frozen; run immutable |
| `superseded` | A closed run replaced through the controlled reopen |
| `voided` | An abandoned pre-close run (terminal) |

## Transitions

```
close_review   → ready_to_close | voided
ready_to_close → close_review | closing | voided
closing        → closed | ready_to_close      (RPC-internal)
closed         → superseded                   (reopen RPC only)
superseded     → (terminal)
voided         → (terminal)
```

Everything else raises `invalid_close_transition_<from>_to_<to>`
(errcode 42501). There is no path that skips review or approval, and no
path out of `superseded`/`voided`.

## Guards on top of the transition matrix

- **One active run per period** — partial unique index over runs not in
  (`superseded`,`voided`). A `closed` run blocks new cycles until the
  reopen RPC supersedes it.
- **Closed-run immutability** — `app.protect_closed_close_run`: once
  `closed`, the ONLY permitted update is the reopen RPC's supersession
  (status→`superseded` with `reopened_by` set), and even then the
  identity/approval/manifest columns must be unchanged.
- **Readiness regression** — if a re-evaluation of a `ready_to_close`
  run finds new blocking issues or unacknowledged warnings, the
  coordinator reverts it to `close_review` and clears
  `reviewed_by/approved_by` (event reason
  `readiness_revoked_by_reevaluation`).
- **Acknowledgement freeze** — acknowledgements reject UPDATE/DELETE
  once their run is `closed` or `superseded`.
- **Reopen ordering** — the reopen RPC supersedes the old run FIRST
  (so the one-active-run index admits the replacement), inserts the new
  `close_review` run with `close_version + 1`, then backfills
  `superseded_by_close_run_id`.

## Verification

- Unit: `tests/unit/close-transitions.test.ts` (full matrix).
- Live SQL: `tests/rls/phase7-live-checks.sql` sections 2–3, 10, 12–15
  (DB trigger, index, immutability, reopen, void) — executed against the
  dev project, rollback-safe.
- Live e2e: `e2e/live-close.spec.ts` walks the full happy path plus
  reopen and void through the UI.
