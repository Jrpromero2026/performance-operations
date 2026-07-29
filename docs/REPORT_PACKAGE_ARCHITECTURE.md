# Report Package Architecture

Report packages are versioned, hash-frozen renderings of engine output
for a reporting period. Widgets/pages never recompute package numbers —
`src/lib/close/packages.ts` calls the Intelligence Engine (and reads
posted payroll tables) once at generation time and freezes the payload.

## Types

| Type | Contents |
| --- | --- |
| `executive` | 21 catalog metrics (incl. explicitly `unavailable` eligible/recognized revenue — never $0.00), readiness metrics, department + trainer breakdowns, payroll snapshot reference, import reconciliation rows, deterministic summaries |
| `department` | One per active department: dept-scoped metrics, trainers, services, weekly trend |
| `payroll` | Register from `payroll_trainer_summaries`, adjustment + time registers, run history, open warnings, register-vs-run-total reconciliation |
| `trainer_statements` | Versioned register with per-trainer statement sha256 hashes (combined PDF/ZIP bundle is documented as not built) |
| `import_reconciliation` | Every batch touching the period with counts and history |

## Lifecycle

`draft → generating → ready | failed`; `ready → finalized` (close
execution only), `ready|finalized → superseded` (regeneration /
reopen), `draft|failed|ready → voided`. Enforced by
`app.report_package_guard`, which ALSO freezes content: once `ready`,
`payload`, `package_sha256`, payroll references, and `version` are
immutable — regeneration inserts a NEW version row (unique on
org/period/type/department/version) and supersedes the prior `ready`
one.

## Generation harness

A shared `generate` wrapper: computes next version → inserts
`generating` → builds the payload → marks `ready` with sha256
(superseding the previous ready version) or `failed` with a reason —
always audited. Failures are honest (`failed` + `failure_reason`), never
empty payloads.

## Close integration

The close run links exactly one executive package
(`period_close_runs.report_package_id`). The execute RPC requires it to
be `ready` and finalizes it in the closing transaction; reopen marks
finalized packages `superseded`. The readiness check
`package_regenerated` (warning) surfaces multi-version histories for
explicit acknowledgement.

## Access

RLS: read requires `period_close:read`, and `department` packages
additionally require department access
(`app.can_access_department`). Generation requires
`report_package:create`. Rendering (web + print) and the CSV appendix
derive from the frozen payload — see `/period-close/[id]/reports`.
