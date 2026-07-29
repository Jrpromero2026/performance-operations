# Search Architecture

ONE permission-aware search implementation (`searchApp` in
`src/lib/actions/operations.ts`) serves both the global search box and
the command palette — there is no second code path to drift.

## How it works

- Input: selected organization + query (min 2 chars; `%_` stripped).
- Per entity type, the search runs ONLY if the actor holds the matching
  permission in the organization (trainer:read, client:read,
  department:read, service:read, import:read, payroll:read, org:read).
  All queries execute on the actor's own Supabase client, so RLS
  re-filters rows even if a gate were wrong — permissions are never
  bypassed and restricted areas are never revealed.
- Results are grouped (People, Clients, Departments, Services, Imports,
  Payroll, Organizations), capped per group (5) and overall (30), each
  with label, sublabel (type + status), and deep link.

## Indexing

Searches are live `ilike` lookups on the canonical tables — at current
scale this is exact, permission-fresh, and index-friendly (name columns).
A dedicated search index (materialized tsvector) is a future
optimization that would slot behind the same `searchApp` signature.

## Consumers

- **Command palette** (Ctrl/Cmd+K): merges static pages/actions
  (permission-filtered client-side from the granted-permission list the
  server computed) with debounced entity results from `searchApp`.
- Any future standalone search page reuses `searchApp` unchanged.
