/**
 * Trend engine: pure calendar bucketing (daily/weekly/monthly/quarterly/
 * yearly + custom ranges) and previous-period / previous-year comparisons.
 * All date math is on YYYY-MM-DD strings via UTC — no timezone drift.
 * Forecasting is intentionally out of scope.
 */

import { growthBp } from "../shared/math";
import type {
  TrendBucket,
  TrendComparison,
  TrendGranularity,
} from "../shared/types";

export function parseDate(date: string): { y: number; m: number; d: number } {
  return {
    y: Number(date.slice(0, 4)),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10)),
  };
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysBetweenInclusive(dateFrom: string, dateTo: string): number {
  return Math.round((toUtc(dateTo).getTime() - toUtc(dateFrom).getTime()) / 86_400_000) + 1;
}

function clamp(date: string, min: string, max: string): string {
  return date < min ? min : date > max ? max : date;
}

/** ISO week key (YYYY-Www) and Monday of the week containing `date`. */
function isoWeekStart(date: string): string {
  const d = toUtc(date);
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return fromUtc(d);
}

function isoWeekKey(monday: string): string {
  // ISO week number of the Thursday in this week.
  const d = toUtc(monday);
  d.setUTCDate(d.getUTCDate() + 3);
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week =
    1 +
    Math.round(
      (toUtc(isoWeekStart(fromUtc(d))).getTime() -
        toUtc(isoWeekStart(fromUtc(jan4))).getTime()) /
        (7 * 86_400_000),
    );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Generate calendar buckets covering [dateFrom, dateTo]. Edge buckets are
 * clamped to the range (a monthly trend for Jul 10–Sep 5 yields partial
 * July and September buckets — reported as their true clamped ranges).
 */
export function generateBuckets(
  dateFrom: string,
  dateTo: string,
  granularity: TrendGranularity,
): TrendBucket[] {
  if (dateFrom > dateTo) return [];
  const buckets: TrendBucket[] = [];

  if (granularity === "daily") {
    for (let d = dateFrom; d <= dateTo; d = shiftDays(d, 1)) {
      buckets.push({ key: d, dateFrom: d, dateTo: d });
    }
    return buckets;
  }

  if (granularity === "weekly") {
    let start = isoWeekStart(dateFrom);
    while (start <= dateTo) {
      const end = shiftDays(start, 6);
      buckets.push({
        key: isoWeekKey(start),
        dateFrom: clamp(start, dateFrom, dateTo),
        dateTo: clamp(end, dateFrom, dateTo),
      });
      start = shiftDays(start, 7);
    }
    return buckets;
  }

  if (granularity === "monthly") {
    let { y, m } = parseDate(dateFrom);
    for (;;) {
      const first = `${y}-${String(m).padStart(2, "0")}-01`;
      if (first > dateTo) break;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      buckets.push({
        key: `${y}-${String(m).padStart(2, "0")}`,
        dateFrom: clamp(first, dateFrom, dateTo),
        dateTo: clamp(last, dateFrom, dateTo),
      });
      m++;
      if (m === 13) {
        m = 1;
        y++;
      }
    }
    return buckets;
  }

  if (granularity === "quarterly") {
    const { m } = parseDate(dateFrom);
    let { y } = parseDate(dateFrom);
    let q = Math.floor((m - 1) / 3) + 1;
    for (;;) {
      const firstMonth = (q - 1) * 3 + 1;
      const first = `${y}-${String(firstMonth).padStart(2, "0")}-01`;
      if (first > dateTo) break;
      const lastDay = new Date(Date.UTC(y, firstMonth + 2, 0)).getUTCDate();
      const last = `${y}-${String(firstMonth + 2).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      buckets.push({
        key: `${y}-Q${q}`,
        dateFrom: clamp(first, dateFrom, dateTo),
        dateTo: clamp(last, dateFrom, dateTo),
      });
      q++;
      if (q === 5) {
        q = 1;
        y++;
      }
    }
    return buckets;
  }

  // yearly
  let { y } = parseDate(dateFrom);
  for (;;) {
    const first = `${y}-01-01`;
    if (first > dateTo) break;
    buckets.push({
      key: String(y),
      dateFrom: clamp(first, dateFrom, dateTo),
      dateTo: clamp(`${y}-12-31`, dateFrom, dateTo),
    });
    y++;
  }
  return buckets;
}

/** The equal-length window immediately before [dateFrom, dateTo]. */
export function previousPeriodRange(
  dateFrom: string,
  dateTo: string,
): { dateFrom: string; dateTo: string } {
  const days = daysBetweenInclusive(dateFrom, dateTo);
  return {
    dateFrom: shiftDays(dateFrom, -days),
    dateTo: shiftDays(dateFrom, -1),
  };
}

/** The same calendar range one year earlier (handles Feb 29 → Feb 28). */
export function previousYearRange(
  dateFrom: string,
  dateTo: string,
): { dateFrom: string; dateTo: string } {
  const shiftYear = (date: string): string => {
    const { y, m, d } = parseDate(date);
    const lastDay = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
    return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
  };
  return { dateFrom: shiftYear(dateFrom), dateTo: shiftYear(dateTo) };
}

/** Build the comparison structure from current/previous values. */
export function buildComparison(
  kind: TrendComparison["kind"],
  current: number | null,
  previous: number | null,
): TrendComparison {
  return { kind, current, previous, changeBp: growthBp(current, previous) };
}
