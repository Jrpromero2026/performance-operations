# Performance Operations — Architecture

## Application Architecture

- **Next.js (App Router, TypeScript)** — server components by default; client
  components only where interactivity requires them (workspace selector, user
  menu, mobile navigation, forms).
- **Tailwind CSS 4** — design tokens defined as CSS custom properties in
  `src/app/globals.css` under `@theme`.
- **Supabase** — Postgres, Auth, and Row-Level Security. Accessed through:
  - `src/lib/supabase/server.ts` — server client bound to the request cookie
    session (RLS enforced as the signed-in user).
  - `src/lib/supabase/client.ts` — browser client (RLS enforced).
  - Generated database types (`src/lib/supabase/types.ts`), regenerated from
    migrations via the Supabase CLI.
- **No ORM.** Domain-specific data-access modules under `src/lib/data/`
  wrap the Supabase client with typed, Zod-validated functions. UI code never
  builds queries directly.
- **Zod** validates all external input: environment variables, form input,
  route params, and (later) CSV rows.

### Layering

```
Route (server component / route handler)
  → workspace resolver (validated workspace context)
  → authorization helpers (permission checks, deny by default)
  → data-access module (typed Supabase queries)
  → Postgres with RLS (final enforcement)
```

Every layer re-checks scope. A bug in an upper layer cannot widen access
beyond what RLS permits.

## Multi-Organization Model

```
Platform
├── Organizations
│   ├── Locations
│   ├── Departments
│   ├── Trainers (via assignments)
│   ├── Clients (future)
│   ├── Services (future)
│   ├── Reporting Periods
│   ├── Compensation Plans (future)
│   ├── Imports (future)
│   ├── Payroll (future)
│   └── KPI Reports (future)
```

- Every organization-scoped table carries `organization_id` with a foreign
  key and an index.
- People exist once (`profiles`) and are connected to organizations through
  `organization_memberships` (role + active dates) and to departments through
  `department_memberships`.
- A trainer identity (`trainers`) is likewise linked to organizations and
  departments through effective-dated assignment tables, so one trainer can
  hold different roles, compensation plans, and access in different
  organizations simultaneously.

## Workspace-Resolution Flow

1. The user's selected workspace is stored in an HTTP cookie
   (`po-workspace`), so it survives navigation and refresh.
2. On every server render, the workspace resolver:
   - loads the user's organization memberships from the database (never from
     the client),
   - validates the cookie value against those memberships,
   - resolves `all` (All Workspaces) only when the user holds the
     cross-organization permission (`org:read_all`),
   - falls back to the user's default organization when the cookie is
     missing, invalid, or points to an organization the user can no longer
     access.
3. The resolved workspace — not the raw cookie — scopes every query issued by
   data-access modules.
4. RLS independently restricts rows to the user's organizations, so even a
   forged organization ID returns nothing.

Loss-of-access handling: if a stored selection is no longer permitted, the
resolver silently falls back (default organization or first accessible), and
the UI reflects the corrected selection.

## Database Boundaries

- All schema changes are additive Supabase migrations in
  `supabase/migrations/`; applied migrations are never edited.
- UUID primary keys, `timestamptz` timestamps, `created_at`/`updated_at`
  maintained by trigger.
- Helper functions used by RLS are `security definer` with `set search_path`
  pinned, and each is documented in the migration that creates it.
- Seed data (`supabase/seed.sql`) contains organizations, departments, roles,
  and permissions only — never financial data.

## Authorization Layers

1. **UI** — hides navigation and controls the user cannot use (convenience
   only, never trusted).
2. **Server** — `src/lib/authz/` helpers check permissions before any read or
   mutation; deny by default.
3. **Database (RLS)** — deny-by-default policies per table; platform admins
   see all organizations, workspace users only assigned organizations,
   department-scoped users only assigned departments, trainers only their own
   identity and permitted records.

See `AUTHORIZATION_MODEL.md` for the full model.

## Implemented Domain Layers (Phases 3–8)

The "future" sections below became reality with dedicated documents:

- **Imports (Phase 3)** — IMPORT_ARCHITECTURE.md, SOURCE_ADAPTERS.md,
  APPOINTMENT_LEDGER.md, IMPORT_SECURITY.md.
- **Payroll (Phase 4)** — PAYROLL_ARCHITECTURE.md,
  PAYROLL_CALCULATION_ENGINE.md, PAYROLL_STATE_MACHINE.md,
  PAYROLL_SECURITY.md, PAYROLL_DEPENDENCY_GUARDS.md,
  PAYROLL_STATEMENTS_AND_EXPORTS.md.
- **Intelligence (Phase 5)** — PERFORMANCE_INTELLIGENCE_ENGINE.md,
  METRIC_CATALOG.md, METRIC_DEFINITIONS.md, REPORTING_ARCHITECTURE.md.
  The engine (`src/lib/intelligence/`) is the ONLY source of metrics.
- **Executive Operations Center (Phase 6)** —
  EXECUTIVE_OPERATIONS_CENTER.md, DASHBOARD_ARCHITECTURE.md,
  WIDGET_SYSTEM.md, NOTIFICATION_MODEL.md, SEARCH_ARCHITECTURE.md,
  COMMAND_PALETTE.md. Dashboards, alerts, notifications, palette/search,
  and the Report Center all CONSUME the engine — no UI-side business
  math, no dashboard-specific SQL.
- **Period Close (Phase 7)** — PERIOD_CLOSE_ARCHITECTURE.md,
  PERIOD_CLOSE_STATE_MACHINE.md, PERIOD_CLOSE_READINESS.md,
  CLOSE_MANIFEST.md, REPORT_PACKAGE_ARCHITECTURE.md, EXPORT_MANIFEST.md,
  ACCOUNTING_EXPORTS.md, POST_CLOSE_CHANGE_GUARDS.md,
  SAVED_REPORT_VIEWS.md, SCHEDULED_REPORT_DEFINITIONS.md. The close is a
  workflow/packaging layer over the existing engines: readiness consumes
  pipeline state + intelligence, packages/exports freeze engine output
  with hashes, the close RPC atomically freezes an immutable manifest,
  and database guards block material changes in closed periods
  (`reporting_periods.status='closed'` is settable only inside the close
  RPCs).
- **Integrations & Automation (Phase 8)** — INTEGRATION_ARCHITECTURE.md,
  INTEGRATION_SECURITY.md, PROVIDER_ADAPTER_CONTRACT.md,
  BACKGROUND_JOB_ARCHITECTURE.md, JOB_STATE_MACHINE.md,
  IDEMPOTENCY_AND_RETRIES.md, WEBHOOK_SECURITY.md,
  SCHEDULED_REPORT_EXECUTION.md, EMAIL_DELIVERY_ARCHITECTURE.md,
  INTEGRATION_OBSERVABILITY.md, SETMORE_API_FINDINGS.md,
  ACUITY_API_FINDINGS.md. External systems provide SOURCE EVIDENCE only:
  provider → connection (Vault credentials) → sync job → immutable
  payloads → adapter → the EXISTING import pipeline. A background-job
  system (atomic claim, lease recovery, backoff, dead-letter) executes
  syncs, scheduled reports, and deliveries; nothing bypasses payroll,
  close, approval, or audit controls, and no sync can post to the
  ledger.

## Original Import Architecture Sketch (superseded by Phase 3 docs)

- An **import batch** records the file, source system (Setmore/Acuity),
  organization, reporting period, uploader, and state
  (`uploaded → validating → needs_resolution → approved → posted`).
- Raw rows are stored verbatim (immutable) alongside normalized appointment
  candidates; matching links candidates to trainers, clients, services, and
  departments with confidence levels.
- Unmatched/invalid rows enter a resolution queue; resolutions are recorded
  as explicit, audited decisions and can teach alias tables for future
  imports.
- Posting an import is transactional: it materializes appointments, snapshots
  the mapping used, and emits audit events. Posted imports are immutable;
  corrections happen via reversal batches.

## Future Payroll Architecture

- Payroll runs are per organization + reporting period, moving through
  `Draft → In Review → Approved → Posted → Locked` with audited `Reopened`.
- Calculation reads posted appointments and the compensation plan version in
  effect on each service date (effective-dated assignment), producing line
  items in integer cents with a full calculation trace.
- Approving/posting snapshots every input (plan version, rates, appointment
  set) so historical payroll never changes when current plans change.
- Adjustments are explicit line items with reasons and approvers — never
  edits to calculated values.

## Future Analytics Architecture

- KPIs (revenue, payroll, sessions, active clients, revenue per session,
  payroll percentage) are computed from posted, immutable data — never from
  unapproved imports.
- Aggregations are per organization → department → trainer, always scoped by
  the workspace context, and cache-friendly because posted data is immutable.
- Trainer scorecards derive from the same posted data with trainer-scoped
  RLS.

## Audit Strategy

- `audit_events` is an append-only table: actor, organization, entity type,
  entity ID, action, structured diff/metadata (JSONB), and timestamp.
- Writes happen server-side in data-access modules whenever a governed
  record changes (memberships, assignments, periods; later: imports, payroll
  transitions, compensation changes).
- No UPDATE or DELETE policies exist on `audit_events`; platform admins can
  read all events, workspace users only their organizations' events.
