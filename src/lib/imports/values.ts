/**
 * Value parsers for import normalization. All parsers are strict: invalid
 * input returns null (the caller records an explicit issue) — nothing is
 * silently coerced. Money returns integer cents; no floating point.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= days;
}

/** "1 Dec 2025" | "23 Dec 2024" → "2025-12-01" (Setmore report format). */
export function parseDayMonthYear(value: string): string | null {
  const match = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  const year = parseInt(match[3], 10);
  if (!month || !isValidYmd(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO "2025-12-01" or US "12/1/2025" → ISO date. */
export function parseFlexibleDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return isValidYmd(+y, +m, +d) ? trimmed : null;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (us) {
    const [, m, d, y] = us;
    if (!isValidYmd(+y, +m, +d)) return null;
    return `${y}-${String(+m).padStart(2, "0")}-${String(+d).padStart(2, "0")}`;
  }
  return parseDayMonthYear(trimmed);
}

/** "05:30 AM" / "5:30 pm" / "17:45" → minutes since midnight. */
export function parseTimeOfDay(value: string): number | null {
  const trimmed = value.trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (ampm) {
    let hours = parseInt(ampm[1], 10);
    const minutes = parseInt(ampm[2], 10);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    const isPm = ampm[3].toUpperCase() === "PM";
    if (hours === 12) hours = 0;
    return (hours + (isPm ? 12 : 0)) * 60 + minutes;
  }
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (h24) {
    const hours = parseInt(h24[1], 10);
    const minutes = parseInt(h24[2], 10);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

export interface TimeRange {
  startMinutes: number;
  endMinutes: number;
  /** True when the end wrapped past midnight (end treated as next day). */
  crossesMidnight: boolean;
  durationMinutes: number;
}

/** "05:30 AM - 06:30 AM" → range. End <= start is treated as next-day. */
export function parseTimeRange(value: string): TimeRange | null {
  const parts = value.split(/\s*[-–]\s*/);
  if (parts.length !== 2) return null;
  const start = parseTimeOfDay(parts[0]);
  const end = parseTimeOfDay(parts[1]);
  if (start === null || end === null) return null;
  const crossesMidnight = end <= start;
  const durationMinutes = crossesMidnight ? end + 24 * 60 - start : end - start;
  if (durationMinutes <= 0 || durationMinutes > 24 * 60) return null;
  return { startMinutes: start, endMinutes: end, crossesMidnight, durationMinutes };
}

/**
 * "80.75" | "$1,234.50" | "64" → integer cents. Strict: max two decimals,
 * no negative amounts from imports.
 */
export function parseMoneyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[$,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents =
    parseInt(match[1], 10) * 100 + parseInt(((match[2] ?? "") + "00").slice(0, 2), 10);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "7 May 2025 10:36 AM" → ISO timestamp string in the given zone, or null. */
export function parseSetmoreBookedOn(value: string, timeZone: string): string | null {
  const match = /^(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))$/i.exec(
    value.trim()
  );
  if (!match) return null;
  const date = parseDayMonthYear(match[1]);
  const minutes = parseTimeOfDay(match[2]);
  if (!date || minutes === null) return null;
  return zonedDateTimeToUtcIso(date, minutes, timeZone);
}

/**
 * Convert a wall-clock date + minutes in an IANA timezone to a UTC ISO
 * instant, using Intl (no external library). Resolves DST by iterating the
 * offset to a fixed point.
 */
export function zonedDateTimeToUtcIso(
  isoDate: string,
  minutesSinceMidnight: number,
  timeZone: string
): string | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  const hours = Math.trunc(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  // initial guess: treat wall time as UTC
  let utcMs = Date.UTC(y, m - 1, d + Math.trunc(hours / 24), hours % 24, minutes);
  try {
    for (let pass = 0; pass < 3; pass++) {
      const offset = timeZoneOffsetMs(utcMs, timeZone);
      const next = Date.UTC(y, m - 1, d, hours, minutes) - offset;
      if (next === utcMs) break;
      utcMs = next;
    }
  } catch {
    return null;
  }
  return new Date(utcMs).toISOString();
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - utcMs;
}

/** Lowercased, whitespace-collapsed comparison key. */
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Digits-only phone key (US-centric; strips leading 1 on 11-digit numbers). */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
