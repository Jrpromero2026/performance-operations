# Timberhill Athletic Club — Observed Payroll Rules

**Evidence:** Twelve monthly "Personal Training Payroll Tracker" Google
Sheets PDF exports (Mar 2024 – May 2026 available locally; Aug 2024,
Jun 2025, Feb 2026 inspected in depth in gitignored `business-inputs/` on
2026-07-30). Each export contains ONLY the summary sheet — the per-trainer
calculation tabs were not part of the exports. No identifiable per-person
amounts are reproduced here.

## Confirmed structure (consistent 2024 → 2026)

| Observation | Evidence | Status |
| --- | --- | --- |
| **Payroll period: monthly**, tracked within quarters | Every export is a month-end summary labeled with quarter | CONFIRMED |
| Per-trainer monthly payroll totals reported on a summary sheet | Trainer Analytics block (roster varies over time) | CONFIRMED (totals only — derivation not in exports) |
| Department analytics: Gross Revenue, Payroll, Gross/Net Profit, Overhead **12% of gross**, department Commission line (**2% in 2024–2025, 5% in Feb 2026**), flat **$500/month Salary** line | Department Analytics block, consistent formulas across years | Observed (analytics context; the commission line is department-level, not per-trainer) |
| Session stats: Total PT Sessions, Total Value, Average Value/Session | Summary block | CONFIRMED |
| **Free sessions carry a small flat payout** (avg payout/free session ≈ a single flat rate; value changed between years) | "Total Free Sessions / Total Value / Average Payout Per" block | CONFIRMED concept; current rate unconfirmed |
| **Consultations carry a small flat payout** (similar structure) | Consultations block | CONFIRMED concept; current rate unconfirmed |
| Gross Revenue equals Total Value of Sessions (listed value, not collected cash) | Cross-check within sheets | Observed |

## What the exports do NOT show (unresolved)

- **How each trainer's monthly total is calculated** — per-session rates,
  commission %, tiers, or a mix. The per-trainer tabs were not exported.
  U1c (cliff vs marginal) therefore remains OPEN; nothing in the summary
  proves tiers exist or not.
- Cancellation / late-cancel / no-show pay rules.
- PACK Training and Nutrition Coaching compensation (this tracker covers
  Personal Training only).
- Whether the department Commission line (2%→5%) is a manager commission,
  and who receives it.
- Rounding rules.

## Required owner inputs to unblock Timberhill validation

1. The full workbook (xlsx with per-trainer tabs and formulas), or a
   written statement of each trainer's compensation terms.
2. Current free-session and consultation flat payout amounts.
3. Cancellation/no-show pay policy.
4. PACK and Nutrition compensation documents.
5. Confirmation of the department commission recipient and basis.

## Implemented vs not implemented

- The engine supports every structure the summary implies (per-session
  flat rates, percentage of listed-value revenue, monthly periods, flat
  free-session/consult rates as flat_per_session rules on those services).
- NOTHING Timberhill-specific is seeded; Timberhill payroll is NOT
  claimed production-validated. Blocked on the per-trainer calculation
  evidence above.
