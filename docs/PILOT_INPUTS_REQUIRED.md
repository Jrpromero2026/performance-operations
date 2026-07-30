# Pilot Inputs Required — Owner Workbook

Every fact JR must provide before real operation, by organization.
Confidence: **CONFIRMED** (verified configuration), **HISTORICAL**
(known from past practice — must be re-confirmed, never auto-activated),
**UNKNOWN**. Nothing marked HISTORICAL or UNKNOWN is entered into the
system by Claude — JR enters or explicitly confirms each value.

Entry locations are live routes. Validation rules state what the app
enforces.

## 0. Shared / platform

| Field | Why it matters | Current value | Confidence | Required before pilot | Where JR enters it | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Pilot org names | Workspace identity; "(Pilot)" suffix prevents sandbox confusion | Proposed: "Timberhill Athletic Club (Pilot)", "G3 Performance (Pilot)" | UNKNOWN (proposal) | **Yes** | Confirm to Claude → seed script `supabase/pilot/seed-pilot-organizations.sql` | Unique slug |
| Email delivery provider | Real report delivery; otherwise test-mode only | none configured | CONFIRMED (absent) | No (in-app artifacts suffice) | `/integrations/deliveries` → Delivery channel | Provider + verified sender required before real sends |
| JR password rotation | Bootstrap credential hygiene | bootstrap password in `.env.local` | CONFIRMED | **Yes** | `/forgot-password` | — |

## 1. Timberhill Athletic Club (Pilot)

### Organization
| Field | Why it matters | Current value | Confidence | Required | Where | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Timezone | Import date interpretation + period boundaries | assumed America/Los_Angeles | HISTORICAL | **Yes** | Confirm; used on import upload + scheduled reports | IANA zone |
| Reporting calendar (monthly? semi-monthly?) | Period creation, payroll cadence, close cycle | unknown | UNKNOWN | **Yes** | `/configuration/reporting-periods` → New period | start ≤ end; no overlap |
| Payroll frequency + period start/end rules | Payroll runs are period-scoped | unknown | UNKNOWN | **Yes** | same | — |
| Primary admin | Accountability + notifications | JR | CONFIRMED | Yes | seeded | — |
| Close approval policy / self-approval | Single-operator pilot cannot approve its own close under the fail-closed default | default fail-closed; dev sandbox used allow_self_approval=true | UNKNOWN (decision) | **Yes, before first close** | Decision → Claude applies `organization_close_policies` row | Explicit org policy row |

### Departments
| Field | Current value | Confidence | Required | Where |
| --- | --- | --- | --- | --- |
| Department list | Personal Training, PACK Training, Nutrition Coaching (seeded) | HISTORICAL (structure looks right) | Confirm | Seed script; edits in DB config |
| Department managers + member scoping | none | UNKNOWN | Only if delegating | `/configuration/users` (department-scoped roles) |

### Trainers
Per trainer (pilot needs the Personal Training roster first):

| Field | Why | Confidence | Required | Where | Validation |
| --- | --- | --- | --- | --- | --- |
| Full name, email | Identity; email only if they log in | UNKNOWN | **Yes** | `/trainers/new` | — |
| Role (trainer login?) | Self-scorecard access | UNKNOWN | No (roster works without logins) | `/configuration/users` invite | Invite-only |
| Department + effective date | Scoping + KPIs | UNKNOWN | **Yes** | `/trainers/[id]` assignments | Active assignment required for readiness |
| Payroll eligibility + commission plan + effective date | Payroll fails closed without an assignment | UNKNOWN | **Yes for paid trainers** | `/trainers/[id]/compensation` | Unassigned trainers surface as blocking payroll issues — this is the intended fail-closed behavior |
| Setmore staff name (source alias) | Import row → trainer resolution | UNKNOWN | **Yes** | Resolved during first import review (`/imports/[batch]/review`) | Unresolved rows block approval |

### Services
| Field | Why | Current value | Confidence | Required | Where | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Service list (e.g. PT 60) + department | Session counting, KPIs | none real | UNKNOWN | **Yes** | `/configuration/services/new` | — |
| Listed price | Source amounts come from the import; the catalog price is reference only | $75/session | HISTORICAL | Confirm | same | Integer cents |
| Duration, payroll/session flags | Coaching-hour + payroll eligibility | UNKNOWN | **Yes** | same | — |
| Setmore service names (aliases) | Import row → service resolution | 19 aliases exist but on the e2e fixture service | UNKNOWN | **Yes** | First import review → Map service | Unresolved rows block approval |

### Payroll
| Field | Why | Current value | Confidence | Required | Where | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Commission ladder | Core compensation | HISTORICAL ladder: 50% base; $3,000→55%; $4,500→60%; $5,500→65%; $7,000→70% | HISTORICAL — **must not be activated without JR confirmation** | **Yes** | `/configuration/compensation/new` (percentage tiers) | Published version required |
| Cliff vs marginal tiers (U1c) | Changes every tiered paycheck | open since Phase 4 (`docs/business-rules/payroll-rule-gaps.md`) | UNKNOWN | **Yes before first tiered payroll** | Plan editor tier behavior | Fail closed until decided |
| Basis (listed vs paid amount) | Commission base | unknown | UNKNOWN | **Yes** | Plan editor | — |
| Per-trainer variations | "Payroll behavior may vary by trainer" | UNKNOWN | **Yes per trainer** | Separate plans or versions per trainer | Unassigned = fail closed |
| Cancellation/no-show/split rules, adjustments, rounding, approval chain | Correct pay | UNKNOWN | **Yes** | Plan editor + `/payroll/adjustments` | Documented in PAYROLL_* docs |

### Imports (Setmore)
| Field | Why | Confidence | Required | Where |
| --- | --- | --- | --- | --- |
| Export type/columns | Adapter expects the appointment-report CSV (columns in IMPORT_ARCHITECTURE.md) | CONFIRMED (adapter verified against real header shape) | Yes | Setmore → export |
| Date format + timezone | Correct appointment dates | HISTORICAL (verified format in adapter) | Confirm on first import | Upload form |
| Status mappings | Completed/cancelled/no-show semantics | Entered during first import | UNKNOWN | Yes | `/imports/[batch]/review?queue=statuses` |
| Duplicate expectations + historical window | Which months to backfill | UNKNOWN | **Yes** | Decision | Content-addressed dedupe protects re-uploads |

### Reporting
| Field | Confidence | Required | Where |
| --- | --- | --- | --- |
| Required KPIs / dashboards / exports / statements / close artifacts | UNKNOWN (defaults exist: executive scorecard, close packages, payroll register + statements) | Before first close | `/analytics`, `/reports`, `/period-close` |
| Goal + benchmark policy | UNKNOWN | No | `/analytics/goals`, `/analytics/benchmarks` |

## 2. G3 Performance (Pilot)

Organization/department tables mirror Timberhill (timezone, calendar,
frequency, approval policy all UNKNOWN and required). G3-specific items:

| Field | Why | Current value | Confidence | Required | Where |
| --- | --- | --- | --- | --- | --- |
| Trading name | Org identity | Sandbox says "G3 Sports & Fitness"; pilot brief says "G3 Performance" | UNKNOWN | **Yes** | Seed confirmation |
| Coach roster + assignments | KPIs + payouts | UNKNOWN | **Yes** | `/trainers/new` |
| Initial Performance Evaluation service | Evaluation flag drives evaluation metrics | 75–90 min, historically $90 | HISTORICAL | **Yes** | `/configuration/services/new` (`is_evaluation`) |
| Performance packages (Base / Momentum / Advanced / Apex) | Whether these are SERVICES, price points, or memberships determines catalog design | concept only | UNKNOWN — **do not infer prices or rules** | **Yes before related imports** | Owner decision → services config |
| Team training multi-coach sessions | One session, multiple coaches — payroll split rule needed | UNKNOWN | **Yes before team payroll** | Plan editor (team compensation) + per-import review; fail closed otherwise |
| Coach payout model | Payout calculation | UNKNOWN | **Yes** | `/configuration/compensation/new` |
| Import source | Acuity CSV (column mapping) or generic CSV until API credentials exist | CONFIRMED (no API path yet) | Yes | `/imports/new` → Acuity/manual |
| Acuity export columns, date format, timezone | Column mapping setup | UNKNOWN | **Yes at first import** | Mapping step |

## Rules

- Nothing HISTORICAL becomes active configuration until JR enters or
  confirms it in the app.
- Any trainer/coach whose pay rule is unresolved stays UNASSIGNED —
  payroll flags them as blocking issues rather than guessing.
- Do not close a period until FIRST_PAYROLL_VALIDATION.md reconciliation
  passes or variances are formally accepted.
