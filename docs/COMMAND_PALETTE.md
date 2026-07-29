# Command Palette

`Ctrl+K` / `Cmd+K` (or the header Search button) opens the global
palette (`src/components/layout/command-palette.tsx`).

## Content

1. **Pages** — every navigable surface (overview, imports, appointments,
   payroll + time + adjustments, trainers, clients, reports,
   configuration areas, audit, notifications).
2. **Actions** — create payroll run, upload import, add trainer/service,
   create reporting period, create compensation plan, log time.
3. **Entities** — trainers, clients, departments, services, import
   batches, payroll runs, organizations via the single server search
   (see SEARCH_ARCHITECTURE.md), debounced 250 ms with stale-response
   sequencing.

## Permission awareness

The static registry (`src/lib/operations/commands.ts`) declares the
permission each entry requires; `filterCommands` (pure, unit-tested)
filters against the granted-permission set the SERVER computed for the
selected organization. A trainer sees their pages and "Log time entry" —
never "Create payroll run" or configuration areas. Entity results are
permission-gated server-side and RLS-filtered. Selecting an entry
navigates; the palette performs no mutations and no business logic.

## Keyboard behavior

- `Ctrl/Cmd+K` toggle, `Escape` closes, click-outside closes.
- Input autofocuses; matching is case-insensitive over labels + keywords.
- Workspace-scoped: entity search uses the selected organization; without
  a single selected workspace only pages/actions appear.

Switch-organization remains in the always-visible header workspace
selector (one keystroke away, validated server-side).
