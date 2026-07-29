# Performance Operations — Phase 2 Report

**Date:** 2026-07-29 · **Baseline:** Phase 1 commit `4efe5d2` · **Branch:** `main`

## Summary

Phase 2 converted the foundation into a live, authenticated development
application against the dedicated Supabase project
**performance-operations-dev** (`yoolmtleaezprjmfasku`): invite-based
authentication, user/access management with escalation guards, trainer and
service configuration, reporting-period management with a functional header
selector, versioned compensation configuration (no calculation), a real
configuration hub with per-organization readiness, a filterable audit
viewer, and a live overview. No CSV import, no payroll calculation, no fake
financial data, no production deployment.

## Environment

- Dedicated project confirmed empty before use (0 tables, 0 migrations);
  Built For Her, G3 Performance, and novakore-dev were never touched.
- 10 migrations applied live (foundation_schema, rls_policies,
  invitations_and_auth, trainer_fields, services, reporting_period_fields,
  compensation, public_rpc_wrappers, anon_app_schema_usage,
  move_btree_gist). Phase 1 files applied verbatim, unmodified.
- Seed verified live: 2 organizations, 9 departments, 6 roles,
  33 permissions, 95 role grants, 22 service categories.
- Generated TypeScript types replaced the hand-written generics; clients
  re-typed.
- Bootstrap users (platform admins): the owner account and an E2E account;
  passwords generated locally, bcrypt-hashed locally (only hashes were
  transmitted), stored in `.env.local` only.

## Verification (exact, all executed this session)

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 1 warning (React-Compiler note: TanStack `useReactTable` not memoizable — informational) |
| `npm run typecheck` | clean |
| `npm test` | 5 files, **71/71 passed** |
| Playwright offline suite (:3100) | **36 passed, 2 skipped** (intentional viewport-specific skips) |
| Playwright live suite (:3000, real auth + DB) | **11/11 passed** |
| `npm run build` | clean; 28 routes + proxy |
| Live RLS suite (executed against performance-operations-dev) | **All Phase 1 + Phase 2 assertions passed**, transaction rolled back |
| Supabase security advisor | 1 remaining WARN: leaked-password protection (dashboard toggle; documented) |

Live RLS assertions covered: outsider deny-by-default (orgs, departments,
audit, invitations, services, compensation), workspace-admin org scoping,
platform-admin full visibility, cross-org insert rejection, append-only
audit, escalation guards (platform_admin invitation and membership minting
blocked for workspace admins), published-version immutability (trigger),
and locked-period protection.

## Known limitations

- Email delivery uses Supabase's rate-limited dev mailer; invite links are
  shown once in the UI for manual delivery until SMTP is configured.
- Organization/location management UI and the client registry are deferred
  (orgs are seeded; clients first matter in the Import Center).
- Trainer/audit lists filter client-side / cap at 100 events — fine at
  configuration scale, revisit with real volume.
- The default-organization toggle updates only memberships the acting
  manager can see under RLS (cross-org defaults need a platform admin).
- E2E mutation coverage is deliberately net-zero (invitation create+revoke);
  period/trainer/compensation mutations are covered by unit + live RLS
  layers instead of persistent e2e fixtures.

## Manual dashboard actions still required

1. Auth → URL Configuration: set Site URL (`http://localhost:3000`) and
   redirect URLs.
2. Auth → Passwords: enable leaked-password protection (advisor WARN).
3. Auth → SMTP: configure a real sender before inviting real users.
4. Owner: sign in with the bootstrap credentials from `.env.local` and
   change the password (Forgot password flow works).

## Business inputs still required (unchanged)

Everything in docs/INPUTS_REQUIRED.md, most urgently: Setmore + Acuity
sample exports, both payroll workbooks, trainer roster, service list,
compensation rules, appointment-status/cancellation rules, payroll
schedules, revenue-recognition rules. Unresolved decisions are enumerated
in docs/DECISION_LOG.md (U1a–U1i) and are represented as configuration
gaps, never as coded assumptions.

## Recommended Phase 3

**Import Center**: CSV upload for Setmore/Acuity, immutable raw rows,
normalization, trainer/client/service matching against the aliases and
source identifiers configured in this phase, resolution queue, and
transactional posting to immutable appointments — prerequisite for payroll
calculation (Phase 4). Blocked primarily on sample export files.
