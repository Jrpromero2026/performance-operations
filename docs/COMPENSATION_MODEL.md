# Performance Operations — Compensation Model (configuration only)

Phase 2 models compensation **configuration**. No payroll amount is computed
anywhere; the tables and invariants below exist so the Phase 4 engine can
calculate against immutable, versioned, effective-dated inputs.

## Structure

```
compensation_plans (org-scoped container)
└── compensation_plan_versions (the immutable unit of record)
    ├── compensation_rules   (structured amount/rate parameters)
    └── commission_tiers     (ordered revenue tiers)
trainer_compensation_assignments (trainer ↔ specific plan VERSION,
                                  per purpose, effective-dated)
```

## Versioning and immutability

- A plan's substance lives in **versions**: `draft → published → archived`.
- Drafts are freely editable (rules/tiers add/remove).
- **Publishing freezes substance.** A database trigger
  (`app.protect_published_version`) rejects changes to method, tier
  behavior, effective dates, version number, or plan linkage on
  published/archived versions — even for platform admins. RLS additionally
  blocks tier/rule writes on non-draft versions (`app.version_is_draft`).
- "Editing" an active plan = **new draft version** copied from the latest,
  with a new effective date. Historical payroll will keep referencing the
  version it was calculated under; changing current plans can never rewrite
  history.
- Assignments reference a **specific published version**, not the plan.

## Money and rates

- Money: `bigint` integer cents. `$45.00` → `4500`. Parsing
  (`parseCents`) is string-based; floats never touch amounts.
- Rates: integer **basis points**. `50% = 5000 bp`, `55% = 5500 bp`,
  `50.25% = 5025 bp` (`parseBasisPoints`, max 10000).
- DB checks enforce non-negative cents, 0–10000 bp, and integer types.

## Commission tiers

- Per version, ordered by `sequence`, with `[min_revenue_cents,
  max_revenue_cents)` ranges (null max = unbounded) and a bp rate.
- DB-level guarantees: unique sequence per version and a **range-overlap
  exclusion constraint** (int8range `&&`). Pure validation
  ([src/lib/compensation/tiers.ts](../src/lib/compensation/tiers.ts)) mirrors
  these rules for forms and tests.
- `tier_behavior` records **cliff** (whole eligible revenue pays the reached
  tier's rate) vs **marginal** (each slice pays its own rate) vs
  not-applicable. Which one Timberhill actually uses is an **unresolved
  business decision** — recorded, not assumed, and no calculation encodes
  either.

## Rules

`compensation_rules` hold structured parameters (one row per rule type per
version; exactly one of `amount_cents` / `rate_basis_points` — DB check
`num_nonnulls(...) = 1`). Rule types cover every future method: session
rate, hourly, revenue rate, team-training, head/assistant coach, evaluation
bonus, package-sale rate, nutrition client rate, admin hourly, manual
bonus/deduction. No free-form JSON.

## Trainer assignments

- `trainer_compensation_assignments`: trainer + organization + published
  version + `purpose` (`primary`, `team_training`, `evaluations`,
  `nutrition`, `administrative`) + effective dates.
- A trainer may hold different plans in different organizations, and
  different plans per purpose within one organization.
- **DB exclusion constraint** forbids overlapping date ranges for the same
  trainer/org/purpose; the server maps violations to a friendly error.
- No retroactive mutation: assignments are closed (effective_to), never
  edited into the past. Ending an assignment is audited.
- The trainer must have an active organization assignment in the plan's
  organization; only `compensation:manage` holders may assign.

## Explicitly not in this phase

Payroll runs, calculation traces, adjustment records, payroll states, and
any interpretation of tiers/rules into dollar amounts. Examples shown in the
UI are labeled as examples and create no records. No trainer compensation
was seeded — business rules in docs/INPUTS_REQUIRED.md remain outstanding.
