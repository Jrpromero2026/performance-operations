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

| # | Question | Needed from |
| --- | --- | --- |
| U1 | Exact commission structures, session rates, and tiers for each organization. | Compensation rules documents (see INPUTS_REQUIRED.md). |
| U2 | Which appointment statuses count as payable/billable, and cancellation/no-show pay rules. | Business owners. |
| U3 | Reporting-period boundaries and lock cadence per organization. | Business owners. |
| U4 | Revenue recognition: session-date vs payment-date, package/membership allocation. | Business owners / accountant. |
| U5 | Whether clients are shared across organizations or strictly per-organization records. | Business owners. |
| U6 | Auth provider details: email/password vs magic link vs SSO; invite flow. | Business owners. |
| U7 | Hosting/deployment target details (dedicated Vercel project name, environments). | Owner (must be a brand-new project). |
| U8 | Data retention and export obligations for payroll records. | Business owners / compliance. |
