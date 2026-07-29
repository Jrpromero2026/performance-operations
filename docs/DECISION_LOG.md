# Performance Operations — Decision Log

## Confirmed Decisions

| # | Date | Decision |
| --- | --- | --- |
| C1 | 2026-07-28 | Stack: Next.js (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Postgres, Auth, RLS) + Zod + React Hook Form + TanStack Table + Recharts + Vitest + Playwright, npm. No ORM. |
| C2 | 2026-07-28 | Multi-organization architecture; organizations and departments are database records, never hard-coded. |
| C3 | 2026-07-28 | Initial organizations: Timberhill Athletic Club (Personal Training, PACK Training, Nutrition Coaching) and G3 Sports & Fitness (Athlete Performance, Adult Human Performance, Tactical Performance, Team Performance, Performance Evaluations, G3 Volleyball). |
| C4 | 2026-07-28 | Money stored as integer cents (`bigint`); rates as integer basis points; no floating-point financial arithmetic. |
| C5 | 2026-07-28 | Deny-by-default authorization in three layers (UI, server helpers, RLS). Client-supplied organization IDs are never trusted. |
| C6 | 2026-07-28 | Workspace selection persisted in a cookie, validated server-side on every request; "All Workspaces" only with `org:read_all`. |
| C7 | 2026-07-28 | Compensation plans versioned; assignments effective-dated; payroll snapshots inputs; posted payroll immutable (corrections via audited adjustments). |
| C8 | 2026-07-28 | Payroll states: Draft, In Review, Approved, Posted, Locked, Reopened (audited). |
| C9 | 2026-07-28 | Additive-only migrations; UUID PKs; timestamptz; RLS helper functions are security definer with pinned search_path. |
| C10 | 2026-07-28 | This repository, its Supabase project, and its deployment are fully independent of every other application (G3 Performance Testing, Built For Her, NovaKore, etc.). |
| C11 | 2026-07-28 | No fake financial data anywhere — seeds and UI show real structure and explicit "waiting for imported data" states instead. |

| C12 | 2026-07-29 | Live development database: dedicated Supabase project `performance-operations-dev` (yoolmtleaezprjmfasku). All migrations applied there verbatim; no other project is ever touched. |
| C13 | 2026-07-29 | Invite-only authentication (no public self-registration). Invite tokens stored as sha256 hashes; acceptance is atomic via a documented security-definer function. |
| C14 | 2026-07-29 | Role-grant escalation guards at both layers: server logic + RESTRICTIVE RLS (`app.can_grant_role`). Workspace admins cannot mint platform admins; self role-change and self-deactivation are blocked. |
| C15 | 2026-07-29 | Reporting periods: same-type overlap forbidden by DB exclusion constraint; different types may coexist over the same dates. Locked periods require `payroll:reopen` (trigger-enforced). |
| C16 | 2026-07-29 | Compensation versions freeze on publish (DB trigger); edits create new versions; assignments reference specific published versions with DB-level overlap exclusion per trainer/org/purpose. |
| C17 | 2026-07-29 | Offline preview requires explicit `NEXT_PUBLIC_DEV_OFFLINE_PREVIEW=true` AND absent Supabase vars; it can never activate alongside real environment variables. |
| C18 | 2026-07-29 | Service aliases are source-specific (setmore/acuity/manual_csv), normalized lowercase, unique per source+organization. |

| C19 | 2026-07-30 | Import architecture is staged (file → raw rows → normalize → match → review → approval → transactional posting); batch state machine is DB-trigger-enforced; posting/reversal are atomic security-definer RPCs. |
| C20 | 2026-07-30 | Setmore Booking IDs identify recurring SERIES; occurrence identity = (org, source, booking id, start). One active ledger row per occurrence (partial unique index). |
| C21 | 2026-07-30 | Original uploads are immutable evidence: private bucket, sha256, no update/delete storage policies; a posted file can never be posted again. |
| C22 | 2026-07-30 | Source financial columns are named source_*_cents and are never labeled revenue; recognized/payroll-eligible revenue are future, separately named concepts. |
| C23 | 2026-07-30 | Acuity support NOT claimed — no sample exists; Acuity files use the generic mapping adapter until a sample unblocks a dedicated versioned adapter. |
| C24 | 2026-07-30 | Sign-out is device-local (scope 'local'): signing out of one browser does not revoke a user's other sessions. |

| C25 | 2026-07-29 | Payroll is PREPARATION only: gross compensation. Net pay, taxes, and withholdings are permanently out of scope; every statement/export says so. |
| C26 | 2026-07-29 | The calculation engine fails closed: unresolved configuration (basis type, status criteria, rounding scope, tier gaps, missing plans/rates, unknown roles) produces blocked 0¢ lines + blocking issues, never a payment. No Timberhill/G3 official plans are seeded until owner confirmations arrive (business-rules docs). |
| C27 | 2026-07-29 | Engine determinism is versioned (`calc-v1`, stamped on runs and lines); rounding is integer-rational with declared method + scope; per_trainer scope reconciles on the last percentage line with a trace step. |
| C28 | 2026-07-29 | Reopen mutates the SAME run (clearing approval + posting marks — migration 16) while every posted snapshot is preserved per version; supersession creates a linked replacement run and flags distributed exports. Posted work is never voided or deleted. |
| C29 | 2026-07-29 | Appointment/import dependency guard: material appointment changes and batch reversals are DB-blocked while approved/posted/locked payroll references them (`payroll_dependency_exists:` lists run ids); the UI surfaces dependencies before the attempt. |
| C30 | 2026-07-29 | Late-arriving appointments: the run freezes an appointment cutoff at first calculation; later imports surface as a warning and are only included by an explicit, audited cutoff refresh. |
| C31 | 2026-07-29 | Separation of duties: no self-approval of time entries or adjustments; approved adjustment amounts are DB-immutable (corrections are new adjustments); reopening posted payroll is platform-admin only. |
| C32 | 2026-07-29 | Trainer self-scope on payroll rows requires the run to be posted/locked, enforced via security-definer status helper (migration 17) — draft figures are never trainer-visible. |
| C33 | 2026-07-29 | Statements/exports use masked client references (date + service only); CSV via route handlers with export records; PDF = browser print; XLSX deferred as not practical this phase. |

| C34 | 2026-07-29 | Every operational metric lives in the intelligence catalog (`intel-v1`) with a unique id, formula, dependencies, scopes, permissions, and version; the catalog enforces 1:1 definition⟷evaluator at load. No surface computes a metric itself. |
| C35 | 2026-07-29 | Metric health states replace fake zeros: waiting_for_imports / waiting_for_payroll / configuration_missing / incomplete / unavailable, with reasons. A numeric 0 always means "pipeline has data, scope has none"; undefined ratios are null. |
| C36 | 2026-07-29 | Intelligence revenue = source listed/paid over completed appointments only; eligible/recognized revenue stay `unavailable` until a business definition is approved. Payroll metrics read posted/locked runs only. Capacity utilization is configuration_missing until availability config exists. |
| C37 | 2026-07-29 | Intelligence access narrows to org / department-scoped / self(none); trainer self scope is forced by the service and breakdowns are denied for self access; RLS re-enforces underneath (loader uses the actor's client). |
| C38 | 2026-07-29 | Metrics calculate live; the dataset loader's fact shape is the designed cache/materialization boundary (client lifetime history first candidate). No caching built until needed. |

| C39 | 2026-07-29 | The reporting-period status model (draft/open/closed/locked) is preserved; the fine-grained close lifecycle lives on `period_close_runs` (close_review → ready_to_close → closing → closed; superseded/voided terminal). `reporting_periods.status='closed'` is settable ONLY inside the close RPCs (GUC-gated trigger, cleared immediately after use — migration 21). |
| C40 | 2026-07-29 | Close readiness is COMPUTED live, never persisted as checklist rows; the run stores only the latest summary snapshot, and full results freeze into the manifest. Readiness regression on a ready run revokes readiness and clears review/approval. Missing information never passes. |
| C41 | 2026-07-29 | Separation of duties on close fails closed: approver ≠ initiator unless `organization_close_policies.allow_self_approval` is explicitly true (org-configurable; default false; enforced in the action AND the execute RPC). Reopen is platform-admin only; void authority = `period_close:review` (no separate void permission) and applies to unfinalized runs only. |
| C42 | 2026-07-29 | The close manifest stores references + hashes (never operational datasets or client PII), serialized with recursively sorted keys and sha256-hashed; volatile execution fields stay out of the hashed payload. Reopen supersedes but never deletes manifests, packages, or exports. |
| C43 | 2026-07-29 | Export storage strategy: NO storage bucket. Exports regenerate deterministically from frozen sources and every download re-verifies the recorded sha256 (409 on mismatch). Regeneration cost accepted in exchange for tamper-evidence and no second copy of payroll data. |
| C44 | 2026-07-29 | Accounting CSVs: deterministic columns, UTF-8 + CRLF, integer cents raw alongside USD presentation columns, empty cells for missing values (never fake zeros), and formula-injection protection (`'` prefix on `=+-@`/tab/CR cells — negative numbers included, fail-safe over cosmetics). |
| C45 | 2026-07-29 | Payroll is required for close ONLY when the period has active appointments (zero-activity periods close without payroll, with an acknowledged warning); the payroll-register export requirement follows the same condition. Required-before-close exports are provisionally payroll register + executive summary pending business confirmation. |
| C46 | 2026-07-29 | Scheduled reports are DEFINITIONS only: `execution_enabled` is CHECK-constrained false at the database; recipients must be organization members; every surface states execution is not enabled. No cron/email/webhook infrastructure exists. |
| C47 | 2026-07-29 | Saved-view sharing: owner-only scope changes; non-personal scopes require `saved_report:share`; one default per scope target (partial unique indexes); default views auto-apply their reporting period only after validating it still exists in the organization. |

## Working Assumptions

| # | Assumption | Revisit when |
| --- | --- | --- |
| A1 | Single currency (USD) initially; a `currency` column is carried anyway. | An organization needs another currency. |
| A2 | Reporting periods are defined per organization (likely monthly or semi-monthly) and may differ between organizations. | Payroll workbooks are received. |
| A3 | Trainers may exist before they have a login, so `trainers.profile_id` is nullable. | Trainer onboarding flow is designed. |
| A4 | Department membership is only required for department-limited roles; org-wide roles see all departments in their organizations. | Client confirms department privacy rules. |
| A5 | Setmore and Acuity CSV exports contain enough columns (trainer, client, service, datetime, status, price) to drive matching. | Sample exports are provided. |
| A6 | Audit events for Phase 1 cover membership/assignment/period changes; financial audit expands in later phases. | Import center begins. |
| A7 | Roles are global catalog entries; organization-specific custom roles are not needed yet. | An organization requests custom roles. |

## Unresolved Decisions

Do not encode assumptions for any of these into calculation logic.

| # | Question | Needed from |
| --- | --- | --- |
| U1 | Exact commission structures, session rates, and tiers for each organization. | Compensation rules documents (see INPUTS_REQUIRED.md). |
| U1a | Exact Timberhill payroll schedule (period boundaries, cutoffs, pay dates). | Business owners. |
| U1b | Exact G3 payroll schedule. | Business owners. |
| U1c | Whether Timberhill commission tiers are cliff or marginal. | Business owners. |
| U1d | Which revenue counts toward commission tiers. | Business owners / accountant. |
| U1e | Cancellation, late-cancellation, and no-show pay rules. | Business owners. |
| U1f | Package revenue recognition. | Business owners / accountant. |
| U1g | Team-training, PACK, and nutrition compensation structures. | Business owners. |
| U1h | Evaluation bonuses and administrative-hour rates. | Business owners. |
| U1i | Payroll adjustment approval rules. | Business owners. |
| U2a | Should source notes/comments be imported into the ledger, excluded, or redacted? (Currently: staging evidence only.) | Business owners. |
| U2b | Client identity matching rules — when may name+phone auto-link vs require review? May clients be marked anonymous/untracked? | Business owners. |
| U2c | Which roles may create clients during import resolution? (Currently client:manage holders.) | Business owners. |
| U2d | Data-retention duration for raw import rows and original files. | Business owners / compliance. |
| U2e | Reversal approval rules — should reversal require a second approver? | Business owners. |
| U2f | Separation of duties: must uploader ≠ approver ≠ poster? (Supported, not enforced.) | Business owners. |
| U2g | Source-update behavior: auto-supersede posted appointments on re-import, or always require manual confirmation? (Currently manual.) | Business owners. |
| U2h | Group-session participant handling — how do Setmore class rows represent multiple attendees, if ever? | Sample exports. |
| U2i | Multi-coach appointments (head/assistant) — do they occur, and how are they exported? | Business owners. |
| U2j | May excluded rows be reopened later? (Currently: excluded is final within a batch; re-import is the path back.) | Business owners. |
| U2k | Operational file-size/row-count limits beyond the initial 10 MB / 10,000 rows. | Business owners. |
| U2 | Which appointment statuses count as payable/billable, and cancellation/no-show pay rules. | Business owners. |
| U3 | Reporting-period boundaries and lock cadence per organization. | Business owners. |
| U4 | Revenue recognition: session-date vs payment-date, package/membership allocation. | Business owners / accountant. |
| U5 | Whether clients are shared across organizations or strictly per-organization records. | Business owners. |
| U6 | Auth provider details: email/password vs magic link vs SSO; invite flow. | Business owners. |
| U7 | Hosting/deployment target details (dedicated Vercel project name, environments). | Owner (must be a brand-new project). |
| U8 | Data retention and export obligations for payroll records. | Business owners / compliance. |
| U9a | Payroll finalization policy per organization for close: is `posted` sufficient or must runs be `locked`? (Configurable via `organization_close_policies.payroll_required_state`; default posted.) | Business owners. |
| U9b | Approver requirements: which roles may approve a close, is a second approver ever required, and should self-approval ever be allowed outside dev? (Currently fails closed; org policy escape hatch exists.) | Business owners. |
| U9c | Which report packages and exports are MANDATORY before close? (Provisional: executive package + payroll register [when payroll exists] + executive summary CSV.) | Business owners / accountant. |
| U9d | Accounting export column requirements and GL account mapping for the club's bookkeeping system. | Accountant. |
| U9e | Retention periods for close manifests, packages, exports, and acknowledgement notes. | Business owners / compliance. |
| U9f | Should compensation-plan/assignment changes be blocked while a period is closed? (Currently unguarded: posted payroll is frozen, but a re-close after reopen would see the new plans.) | Business owners. |
| U9g | Failed-import disposition workflow: is acknowledging a failed batch at close sufficient, or does a formal disposition process need to exist? | Business owners. |
| U9h | Scheduled-report delivery expectations (medium, cadence, recipients) once execution infrastructure is built. | Business owners. |
