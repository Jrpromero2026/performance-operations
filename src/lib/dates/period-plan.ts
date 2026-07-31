import { assertIsoDate, monthRangeOf, semiMonthlyRangesOf } from "./date-range";
import type { DateRange } from "./date-range";

/**
 * Reporting-period planning — pure date arithmetic that turns "how often
 * do you pay?" plus a date span into the list of periods covering it.
 *
 * This exists so the setup wizard can generate periods from the date
 * range of an uploaded schedule instead of asking an owner to draw
 * calendar boundaries by hand. It composes the shipped range helpers
 * (`monthRangeOf`, `semiMonthlyRangesOf`) and introduces no new period
 * semantics: the output feeds the existing `createPeriod` action, whose
 * validation and RLS remain the authority.
 */

/** Mirrors the `period_type` check constraint on `reporting_periods`. */
export type PeriodType = "monthly" | "semi_monthly" | "biweekly" | "custom";

export interface PlannedPeriod {
  label: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
}

/** Guard against pathological spans producing thousands of periods. */
export const MAX_PLANNED_PERIODS = 60;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function nextMonthStart(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m, 1));
  return date.toISOString().slice(0, 10);
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function rangeToPeriod(
  range: DateRange,
  periodType: PeriodType,
  label: string
): PlannedPeriod {
  return {
    label,
    periodType,
    startDate: range.start,
    endDate: range.end,
  };
}

/**
 * Plan the periods of `periodType` that cover [from, to] inclusive.
 *
 * Monthly and semi-monthly boundaries are calendar-derived, so they are
 * stable regardless of where the span starts. Biweekly has no natural
 * calendar anchor — it is generated forward in 14-day blocks from the
 * first day of the month containing `from`, which keeps the sequence
 * reproducible for a given span rather than dependent on when setup ran.
 *
 * Returns at most `MAX_PLANNED_PERIODS` periods; a span needing more is
 * a sign the owner uploaded a multi-year export, and the wizard should
 * ask rather than silently generate.
 */
export function planPeriods(
  from: string,
  to: string,
  periodType: PeriodType
): PlannedPeriod[] {
  assertIsoDate(from);
  assertIsoDate(to);
  if (to < from) return [];

  const periods: PlannedPeriod[] = [];

  if (periodType === "monthly") {
    let cursor = monthRangeOf(from).start;
    while (cursor <= to && periods.length < MAX_PLANNED_PERIODS) {
      const range = monthRangeOf(cursor);
      periods.push(rangeToPeriod(range, "monthly", monthLabel(range.start)));
      cursor = nextMonthStart(cursor);
    }
    return periods;
  }

  if (periodType === "semi_monthly") {
    let cursor = monthRangeOf(from).start;
    while (cursor <= to && periods.length < MAX_PLANNED_PERIODS) {
      const [first, second] = semiMonthlyRangesOf(cursor);
      for (const half of [first, second]) {
        if (half.end < from || half.start > to) continue;
        if (periods.length >= MAX_PLANNED_PERIODS) break;
        const which = half === first ? "1–15" : "16–end";
        periods.push(
          rangeToPeriod(half, "semi_monthly", `${monthLabel(half.start)} (${which})`)
        );
      }
      cursor = nextMonthStart(cursor);
    }
    return periods;
  }

  if (periodType === "biweekly") {
    let start = monthRangeOf(from).start;
    // Skip whole blocks that end before the span begins.
    while (addDays(start, 13) < from) start = addDays(start, 14);
    let index = 1;
    while (start <= to && periods.length < MAX_PLANNED_PERIODS) {
      const end = addDays(start, 13);
      periods.push({
        label: `${monthLabel(start)} — period ${index}`,
        periodType: "biweekly",
        startDate: start,
        endDate: end,
      });
      start = addDays(start, 14);
      index += 1;
    }
    return periods;
  }

  // custom: one period spanning exactly what was uploaded. The owner
  // adjusts boundaries afterwards; we do not invent a cadence.
  return [
    {
      label: `${from} to ${to}`,
      periodType: "custom",
      startDate: from,
      endDate: to,
    },
  ];
}

/** Human summary of a plan, for the wizard's confirmation copy. */
export function describePlan(periods: PlannedPeriod[]): string {
  if (periods.length === 0) return "No periods needed.";
  if (periods.length === 1) {
    return `1 period: ${periods[0].label}`;
  }
  return `${periods.length} periods: ${periods[0].label} through ${periods[periods.length - 1].label}`;
}
