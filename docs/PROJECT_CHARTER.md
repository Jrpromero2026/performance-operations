# Performance Operations — Project Charter

## Product Purpose

Performance Operations is an internal payroll, revenue, KPI, and department
analytics platform for gyms, personal training departments, and
sports-performance organizations. It replaces the manual spreadsheets and
worksheets currently used for:

- Trainer payroll
- Coach compensation
- Commission calculations
- Personal training department KPIs
- Revenue reporting
- Trainer scorecards
- Session reporting
- Department performance analysis

The platform ingests appointment exports from scheduling systems (Setmore,
Acuity), normalizes them, and turns them into auditable payroll and analytics.

## Target Users

| Role | Needs |
| --- | --- |
| Platform Admin | Operate the platform across every organization; configure compensation; approve payroll; manage audit trails |
| Workspace Admin | Run one or more organizations end-to-end: trainers, departments, services, imports, payroll, reports |
| Payroll Manager | Review imports, calculate/approve/export payroll, create adjustments |
| Department Manager | Manage assigned departments; monitor trainers, appointments, and KPIs |
| Trainer | View their own scorecard and payroll statements |
| Viewer | Read-only access to approved dashboards and reports |

## Initial Organizations

1. **Timberhill Athletic Club** — departments: Personal Training, PACK
   Training, Nutrition Coaching
2. **G3 Sports & Fitness** — departments: Athlete Performance, Adult Human
   Performance, Tactical Performance, Team Performance, Performance
   Evaluations, G3 Volleyball

The architecture supports additional organizations, locations, and departments
without rebuild. Organizations and departments are database records, never
hard-coded values.

## Primary Workflow (target state)

1. Select an organization or workspace.
2. Select a reporting period.
3. Upload a Setmore or Acuity CSV export.
4. Validate and normalize appointment records.
5. Match trainers, clients, services, and departments.
6. Resolve unmatched or invalid records.
7. Approve and post the import.
8. Calculate KPIs.
9. Calculate payroll.
10. Export payroll and analytics reports.

## MVP Scope (Phase 1 — this phase)

- Production-grade Next.js application shell with workspace-aware navigation
- Multi-organization data foundation (organizations, locations, departments,
  people, roles, permissions, memberships, trainer assignments, reporting
  periods, audit events)
- Deny-by-default authorization model with Supabase RLS
- Workspace selector with server-validated persistence
- Overview page backed by real organization/department data
- Seed data for the two initial organizations and their departments
- Documentation, environment setup, and test foundation

## Out of Scope (this phase)

- CSV import center (Setmore/Acuity parsing, matching, resolution)
- Payroll calculation engine and payroll state machine execution
- Compensation plan configuration UI
- KPI computation and analytics dashboards with real financial data
- Report exports (PDF/CSV)
- Notifications and integrations
- Any fake or placeholder financial figures

## Security Principles

- Deny by default: no access without an explicit grant.
- Authorization enforced in three layers: UI, server, and database RLS.
- Client-provided organization IDs are never trusted; every request
  re-validates membership server-side and in the database.
- Trainers see only their own records; department-scoped users see only
  assigned departments.
- Secrets live only in environment variables; never in code, docs, or logs.
- Every financially meaningful action is audit-logged.

## Financial Integrity Principles

- Money is stored as integer cents; floating-point arithmetic is never used
  for financial calculations.
- Compensation plans are versioned; assignments are effective-dated.
- Historical payroll is immutable with respect to later compensation changes.
- Payroll moves through explicit states: Draft → In Review → Approved →
  Posted → Locked, with audited Reopen.
- Posted payroll is never silently edited; corrections are new, audited
  records.
