# G3 Sports & Fitness — Observed Payroll Rules

**Evidence:** `G3 Payroll (7-11_7-24).pdf` (7-page real payroll workbook
export, inspected locally in gitignored `business-inputs/` on 2026-07-30).
Per-trainer worksheets + master summary + revenue/facility-net control +
approvals + checklist sections. No identifiable per-person amounts are
reproduced here; policy statements printed on the worksheet itself are.

## Confirmed rules (stated on the worksheet)

| Rule | Evidence | Status |
| --- | --- | --- |
| **Payroll period: biweekly** (observed window 7/11–7/24, 14 days) | Worksheet header "Payroll Period" | CONFIRMED (cadence anchor date needs owner confirmation) |
| **Personal Training: variable revenue split, 50%–70% by trainer tier** | Printed policy: "PT split range 50% - 70% based on trainer tier"; per-service lines compute Sessions × Rate = Gross Revenue × Split % = Trainer Pay | CONFIRMED structure; per-trainer tier % assignments require owner confirmation before seeding |
| **S&C groups: fixed 60% split** (Middle School, High School, Team Training, Volleyball, Adult S&C) | Printed policy: "S&C group split: fixed 60%"; lines use "Acuity Approved Value" as revenue source | CONFIRMED |
| **Flat-rate services: fixed amount per session** (Consultation, Group Exercise Class, Admin/Meeting) | Printed policy + section structure | CONFIRMED structure; amounts not printed in sample (blank section) |
| **Hourly/Admin/Programming pay: hours × rate with approval note** (Admin, Programming, Meeting, Facility Support, Floor Shift) | Section structure with "Approval / Notes" column | CONFIRMED structure; rates unconfirmed |
| **Adjustments: bonuses, corrections, reimbursements, deductions with Reason + Approved By** | Section structure | CONFIRMED |
| **Final pay = sum of category subtotals** (PT + S&C + Flat + Hourly + Adjustments) | Final Pay Summary section; master summary reconciles per-trainer categories | CONFIRMED |
| **Commission basis = appointment gross value ("Acuity Approved Value")**, i.e. sessions × listed rate, not collected cash | Revenue-source column | CONFIRMED for S&C; PT lines use the same sessions × rate structure |
| **No revenue-tier ladder** — splits are flat percentages per trainer tier/category | Whole document; no tier thresholds anywhere | CONFIRMED (for this period) |
| Facility net = gross revenue − trainer payout, tracked per category | Revenue & Facility Net Control section | Observed (analytics, not payroll input) |
| Approval flow: Prepared By → Reviewed By → Approved By | Approvals section | CONFIRMED structure (separation of duties not practiced in sample — same person all three) |

## Interpretation for the engine

G3 maps onto already-supported configuration: `percentage_of_revenue`
plan versions (one per tier %, e.g. 50/55/60/65/70) with
`basis = source_listed_amount` and completed-status eligibility;
`team_training_rate` at 6000 bp for S&C groups; `flat_per_session` rules
for flat-rate services; `hourly`/`admin_hourly` via approved manual time;
adjustments via the approval workflow. **No cliff/marginal tiers needed.**

## Potential inconsistencies observed

- Rounding: several PT lines show sub-cent implied rates (e.g. rate ×
  sessions not exactly matching printed gross) — per-line half-up rounding
  appears used but is not stated. Marked unresolved (rounding scope).
- One trainer's hybrid line splits at the PT % rather than a separate
  hybrid rate — confirm hybrid services follow the PT tier split.

## Required owner confirmations before official G3 seeding

1. Each trainer's current tier split % (50–70) and its effective date.
2. Biweekly anchor date (which Friday starts a period).
3. Flat-rate service amounts (consultation, group class, admin/meeting).
4. Hourly rates by work type.
5. Whether cancelled/no-show sessions ever pay (none appeared in sample).
6. Rounding scope (per line vs per trainer total).

## Implemented vs not implemented

- Implemented (generic engine + configurable plans): percentage split,
  fixed team split, flat rates, approved hourly, adjustments, category
  subtotals, master summary, approvals.
- NOT implemented/seeded: official per-trainer tier assignments, official
  rate amounts — blocked on confirmations above. G3 payroll is NOT
  claimed production-validated until then.
