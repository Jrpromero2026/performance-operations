/**
 * Date-range utilities for reporting periods and effective-dated records.
 * All dates are ISO `YYYY-MM-DD` strings interpreted as calendar dates
 * (timezone-free), matching the `date` columns in Postgres.
 */

export interface DateRange {
  /** Inclusive start, ISO date. */
  start: string;
  /** Inclusive end, ISO date. */
  end: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeError extends Error {}

export function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new DateRangeError(`Not an ISO date (YYYY-MM-DD): ${value}`);
  }
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new DateRangeError(`Not a real calendar date: ${value}`);
  }
}

export function makeRange(start: string, end: string): DateRange {
  assertIsoDate(start);
  assertIsoDate(end);
  if (end < start) {
    throw new DateRangeError(`Range end ${end} precedes start ${start}`);
  }
  return { start, end };
}

/** Is `date` inside the inclusive range? */
export function isDateInRange(date: string, range: DateRange): boolean {
  assertIsoDate(date);
  return date >= range.start && date <= range.end;
}

/** Do two inclusive ranges overlap? */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Inclusive day count of the range. */
export function daysInRange(range: DateRange): number {
  const ms =
    Date.UTC(...dateParts(range.end)) - Date.UTC(...dateParts(range.start));
  return Math.round(ms / 86_400_000) + 1;
}

function dateParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m - 1, d];
}

/** Calendar-month range containing the given date. */
export function monthRangeOf(date: string): DateRange {
  assertIsoDate(date);
  const [y, m] = date.split("-").map(Number);
  const start = `${pad(y)}-${pad2(m)}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${pad(y)}-${pad2(m)}-${pad2(lastDay)}`;
  return { start, end };
}

/**
 * Semi-monthly ranges for the month containing the date:
 * the 1st–15th and the 16th–end-of-month.
 */
export function semiMonthlyRangesOf(date: string): [DateRange, DateRange] {
  const month = monthRangeOf(date);
  const [y, m] = month.start.split("-").map(Number);
  return [
    { start: month.start, end: `${pad(y)}-${pad2(m)}-15` },
    { start: `${pad(y)}-${pad2(m)}-16`, end: month.end },
  ];
}

/**
 * Effective-dated activity check: active on `date` when
 * effectiveFrom <= date and (no effectiveTo or effectiveTo >= date).
 */
export function isActiveOn(
  date: string,
  effectiveFrom: string,
  effectiveTo: string | null
): boolean {
  assertIsoDate(date);
  assertIsoDate(effectiveFrom);
  if (effectiveTo !== null) assertIsoDate(effectiveTo);
  return effectiveFrom <= date && (effectiveTo === null || effectiveTo >= date);
}

function pad(year: number): string {
  return String(year).padStart(4, "0");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
