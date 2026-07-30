/**
 * Comparison-window resolution — pure calendar/period math shared by every
 * analytics surface. Windows are EXPLICIT: each resolver either returns a
 * fully-specified window (dates, label, finality, partial flag) or a
 * deterministic refusal reason. Nothing here evaluates a metric.
 *
 * Reuses the trend engine's date helpers — one date-math implementation.
 */

import {
  daysBetweenInclusive,
  parseDate,
  previousPeriodRange,
  previousYearRange,
} from "@/lib/intelligence/trends/engine";
import type {
  AnalyticsWindow,
  ComparisonWindowKind,
  PeriodFinality,
} from "../shared/types";

/** Reporting-period facts the resolver needs (loaded once per request). */
export interface PeriodFacts {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  /** reporting_periods.status — 'closed' periods are final. */
  status: string;
}

export type WindowResolution =
  | { ok: true; window: AnalyticsWindow }
  | { ok: false; reason: string };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function periodFinality(period: PeriodFacts): PeriodFinality {
  return period.status === "closed" ? "final" : "not_final";
}

/** True when the window is still accumulating data as of `today`. */
export function isPartial(dateTo: string, today: string): boolean {
  return dateTo >= today;
}

export function windowFromPeriod(
  period: PeriodFacts,
  kind: string,
  today: string,
): AnalyticsWindow {
  return {
    kind,
    label: period.label,
    dateFrom: period.startDate,
    dateTo: period.endDate,
    reportingPeriodId: period.id,
    finality: periodFinality(period),
    partial: isPartial(period.endDate, today),
  };
}

function calendarWindow(
  kind: string,
  label: string,
  dateFrom: string,
  dateTo: string,
  today: string,
): AnalyticsWindow {
  return {
    kind,
    label,
    dateFrom,
    dateTo,
    reportingPeriodId: null,
    finality: "not_final", // calendar windows are never close artifacts
    partial: isPartial(dateTo, today),
  };
}

function monthLabel(y: number, m: number): string {
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function monthRange(y: number, m: number): { dateFrom: string; dateTo: string } {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    dateFrom: `${y}-${mm}-01`,
    dateTo: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

function quarterRange(y: number, q: number): { dateFrom: string; dateTo: string } {
  const firstMonth = (q - 1) * 3 + 1;
  const lastMonth = firstMonth + 2;
  const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate();
  return {
    dateFrom: `${y}-${String(firstMonth).padStart(2, "0")}-01`,
    dateTo: `${y}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Match a calendar range to a reporting period (exact date match) so
 * derived windows inherit period identity/finality when one exists.
 */
function matchPeriod(
  periods: readonly PeriodFacts[],
  dateFrom: string,
  dateTo: string,
): PeriodFacts | null {
  return (
    periods.find((p) => p.startDate === dateFrom && p.endDate === dateTo) ?? null
  );
}

function derivedOrMatched(
  periods: readonly PeriodFacts[],
  kind: string,
  label: string,
  dateFrom: string,
  dateTo: string,
  today: string,
): AnalyticsWindow {
  const matched = matchPeriod(periods, dateFrom, dateTo);
  if (matched) {
    return { ...windowFromPeriod(matched, kind, today), label };
  }
  return calendarWindow(kind, label, dateFrom, dateTo, today);
}

/**
 * Resolve ONE comparison window relative to the anchor window.
 *
 * `periods` is the organization's reporting-period list ordered by start
 * date DESCENDING (as the period selector loads it); it powers
 * previous_period (the actual preceding reporting period when the anchor
 * IS a period) and rolling_4_periods.
 */
export function resolveComparisonWindow(
  kind: ComparisonWindowKind,
  anchor: AnalyticsWindow,
  periods: readonly PeriodFacts[],
  today: string,
  custom?: { dateFrom: string; dateTo: string; label?: string },
): WindowResolution {
  switch (kind) {
    case "previous_period": {
      if (anchor.reportingPeriodId) {
        const ordered = [...periods].sort((a, b) =>
          b.startDate.localeCompare(a.startDate),
        );
        const index = ordered.findIndex((p) => p.id === anchor.reportingPeriodId);
        const previous = index >= 0 ? ordered[index + 1] : undefined;
        if (previous) {
          return { ok: true, window: windowFromPeriod(previous, kind, today) };
        }
        return {
          ok: false,
          reason: "No earlier reporting period exists to compare against.",
        };
      }
      const range = previousPeriodRange(anchor.dateFrom, anchor.dateTo);
      return {
        ok: true,
        window: derivedOrMatched(
          periods,
          kind,
          `Previous ${daysBetweenInclusive(anchor.dateFrom, anchor.dateTo)} days`,
          range.dateFrom,
          range.dateTo,
          today,
        ),
      };
    }

    case "same_period_last_year":
    case "year_over_year": {
      const range = previousYearRange(anchor.dateFrom, anchor.dateTo);
      return {
        ok: true,
        window: derivedOrMatched(
          periods,
          kind,
          `${anchor.label} — prior year`,
          range.dateFrom,
          range.dateTo,
          today,
        ),
      };
    }

    case "month_over_month": {
      const from = parseDate(anchor.dateFrom);
      const to = parseDate(anchor.dateTo);
      if (from.y !== to.y || from.m !== to.m) {
        return {
          ok: false,
          reason:
            "Month-over-month requires the current window to sit inside one calendar month.",
        };
      }
      const py = from.m === 1 ? from.y - 1 : from.y;
      const pm = from.m === 1 ? 12 : from.m - 1;
      const range = monthRange(py, pm);
      return {
        ok: true,
        window: derivedOrMatched(
          periods, kind, monthLabel(py, pm), range.dateFrom, range.dateTo, today,
        ),
      };
    }

    case "quarter_over_quarter": {
      const from = parseDate(anchor.dateFrom);
      const to = parseDate(anchor.dateTo);
      const fromQ = Math.floor((from.m - 1) / 3) + 1;
      const toQ = Math.floor((to.m - 1) / 3) + 1;
      if (from.y !== to.y || fromQ !== toQ) {
        return {
          ok: false,
          reason:
            "Quarter-over-quarter requires the current window to sit inside one calendar quarter.",
        };
      }
      const py = fromQ === 1 ? from.y - 1 : from.y;
      const pq = fromQ === 1 ? 4 : fromQ - 1;
      const range = quarterRange(py, pq);
      return {
        ok: true,
        window: derivedOrMatched(
          periods, kind, `Q${pq} ${py}`, range.dateFrom, range.dateTo, today,
        ),
      };
    }

    case "rolling_12_months": {
      // 12 whole calendar months ending with the anchor's end month.
      const to = parseDate(anchor.dateTo);
      const endRange = monthRange(to.y, to.m);
      const startY = to.m === 12 ? to.y : to.y - 1;
      const startM = to.m === 12 ? 1 : to.m + 1;
      const startRange = monthRange(startY, startM);
      return {
        ok: true,
        window: calendarWindow(
          kind,
          `Rolling 12 months to ${monthLabel(to.y, to.m)}`,
          startRange.dateFrom,
          endRange.dateTo,
          today,
        ),
      };
    }

    case "year_to_date": {
      const to = parseDate(anchor.dateTo);
      return {
        ok: true,
        window: calendarWindow(
          kind,
          `${to.y} year to date`,
          `${to.y}-01-01`,
          anchor.dateTo,
          today,
        ),
      };
    }

    case "prior_year_to_date": {
      const to = parseDate(anchor.dateTo);
      const shifted = previousYearRange(anchor.dateTo, anchor.dateTo);
      return {
        ok: true,
        window: calendarWindow(
          kind,
          `${to.y - 1} year to date (same span)`,
          `${to.y - 1}-01-01`,
          shifted.dateTo,
          today,
        ),
      };
    }

    case "rolling_4_periods":
      return {
        ok: false,
        reason:
          "Rolling periods resolve to a window LIST — use resolveRollingPeriods.",
      };

    case "custom": {
      if (!custom || !custom.dateFrom || !custom.dateTo) {
        return { ok: false, reason: "Custom comparison requires explicit dates." };
      }
      if (custom.dateFrom > custom.dateTo) {
        return { ok: false, reason: "Custom comparison start is after its end." };
      }
      return {
        ok: true,
        window: derivedOrMatched(
          periods,
          kind,
          custom.label ?? `${custom.dateFrom} – ${custom.dateTo}`,
          custom.dateFrom,
          custom.dateTo,
          today,
        ),
      };
    }
  }
}

/**
 * The anchor period plus up to `count − 1` immediately preceding reporting
 * periods (newest first). Requires the anchor to BE a reporting period —
 * rolling reporting-period analysis has no meaning for ad-hoc ranges.
 */
export function resolveRollingPeriods(
  anchor: AnalyticsWindow,
  periods: readonly PeriodFacts[],
  count: number,
  today: string,
): { ok: true; windows: AnalyticsWindow[] } | { ok: false; reason: string } {
  if (!anchor.reportingPeriodId) {
    return {
      ok: false,
      reason: "Rolling period analysis requires a reporting period selection.",
    };
  }
  const ordered = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const index = ordered.findIndex((p) => p.id === anchor.reportingPeriodId);
  if (index < 0) {
    return { ok: false, reason: "The selected reporting period was not found." };
  }
  const slice = ordered.slice(index, index + count);
  return {
    ok: true,
    windows: slice.map((p) => windowFromPeriod(p, "rolling_period", today)),
  };
}

/** Today's local calendar date (YYYY-MM-DD, UTC-stable for tests). */
export function localToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
