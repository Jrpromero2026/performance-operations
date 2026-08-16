/**
 * THE canonical Setmore normalization layer.
 *
 * Both Setmore ingest paths — the historical CSV/report export and the
 * (credential-blocked) REST API — converge on `SetmoreCanonicalRecord`
 * and are then normalized by `normalizeSetmoreRecord` into the shared
 * import `NormalizedRow`. Business rules live HERE and only here:
 *
 *   Setmore CSV ─┐
 *                ├─► SetmoreCanonicalRecord ─► normalizeSetmoreRecord ─► NormalizedRow
 *   Setmore API ─┘
 *
 * Neither transport may add, weaken, or re-implement a rule. Anything a
 * transport does on its own is limited to FIELD EXTRACTION (which column
 * or JSON key holds which value) and transport-specific parsing of the
 * literal wire format.
 *
 * Two rules matter more than the rest:
 *   1. Status is NEVER inferred. A record whose origin cannot supply a
 *      status carries `statusAvailability: "not_provided_by_source"`, and
 *      the row reaches the ledger as `unknown` via the org's status
 *      mappings — never as confirmed, completed, or revenue-bearing.
 *   2. Money is NEVER guessed. The CSV `Cost` column is a verified decimal
 *      listed price; the API `cost` field has an UNVERIFIED unit
 *      (docs/SETMORE_API_FINDINGS.md), so it is only converted when the
 *      operator has explicitly declared the unit after live verification.
 */

import {
  normalizeText,
  parseDayMonthYear,
  parseMoneyToCents,
  parseSetmoreBookedOn,
  parseTimeRange,
  zonedDateTimeToUtcIso,
} from "@/lib/imports/values";
import type {
  AdapterContext,
  NormalizeResult,
  NormalizedRow,
  RowIssue,
} from "@/lib/imports/types";

/** Which Setmore transport produced a record. */
export type SetmoreOrigin = "csv" | "api";

/**
 * Whether the ORIGIN exposes appointment status at all, and if so whether
 * this particular record carried one. `not_provided_by_source` is a
 * property of the transport (the API has no documented status field);
 * `blank` means the transport has the field but this record left it empty.
 */
export type SetmoreStatusAvailability = "provided" | "blank" | "not_provided_by_source";

/**
 * How the operator has declared the Setmore `cost` unit for an API
 * connection. `unverified` is the default and suppresses money mapping.
 */
export type SetmoreCostUnit = "unverified" | "dollars" | "cents";

/**
 * Provider-neutral Setmore record. Values are RAW — as they appeared on
 * the wire — because parsing is a canonical-layer responsibility. A field
 * the origin does not carry is absent, never an empty string.
 */
export interface SetmoreCanonicalRecord {
  origin: SetmoreOrigin;

  /** CSV: `Appointment date`, e.g. `1 Dec 2025` (organization wall time). */
  appointmentDateRaw?: string;
  /** CSV: `Appointment time`, e.g. `05:30 AM - 06:30 AM` (wall time). */
  appointmentTimeRangeRaw?: string;
  /** API: `start_time` / `end_time`, `yyyy-MM-ddTHH:mmZ` (UTC instants). */
  startInstantRaw?: string;
  endInstantRaw?: string;
  /** API: `duration` in minutes. Advisory — the instants are authoritative. */
  durationMinutesRaw?: number;

  /** CSV `Cost` (decimal dollars) or API `cost` (unit unverified). */
  costRaw?: string;
  currencyRaw?: string;

  trainerNameRaw?: string;
  /** API `staff_key` — the stable external staff identity. */
  staffKeyRaw?: string;

  serviceNameRaw?: string;
  /** API `service_key` — the stable external service identity. */
  serviceKeyRaw?: string;

  clientNameRaw?: string;
  clientEmailRaw?: string;
  clientPhoneRaw?: string;
  /** API `customer_key` — the stable external customer identity. */
  customerKeyRaw?: string;

  statusRaw?: string;
  statusAvailability: SetmoreStatusAvailability;

  /** CSV `Booking ID` (identifies a SERIES) or API appointment `key`. */
  externalIdRaw?: string;
  bookedOnRaw?: string;
  commentsRaw?: string;
  bookedViaRaw?: string;
  labelRaw?: string;

  /** Source fields with no canonical home, preserved verbatim. */
  extra?: Record<string, string>;
}

export interface SetmoreNormalizeContext extends AdapterContext {
  /**
   * Operator-declared meaning of the API `cost` field. Only consulted for
   * `origin: "api"`; the CSV unit is verified from real exports.
   */
  apiCostUnit?: SetmoreCostUnit;
}

/**
 * `2025-12-01T13:30Z` → UTC ISO instant. Setmore's documented API format
 * is minute-precision with a literal `Z`; a fractional-second or offset
 * form would be a contract change and is rejected rather than guessed.
 */
export function parseSetmoreApiInstant(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
  const iso = new Date(ms).toISOString();
  // Reject values that round-trip differently (e.g. month 13, day 32).
  if (iso.slice(0, 4) !== y || iso.slice(5, 7) !== mo || iso.slice(8, 10) !== d) {
    return null;
  }
  return iso;
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/* ------------------------------------------------------------------ time */

function normalizeTiming(
  record: SetmoreCanonicalRecord,
  ctx: SetmoreNormalizeContext,
  normalized: NormalizedRow,
  issues: RowIssue[]
): void {
  if (record.origin === "api") {
    normalizeApiTiming(record, normalized, issues);
    return;
  }
  normalizeCsvTiming(record, ctx, normalized, issues);
}

/** CSV carries organization WALL time and must be zoned into UTC. */
function normalizeCsvTiming(
  record: SetmoreCanonicalRecord,
  ctx: SetmoreNormalizeContext,
  normalized: NormalizedRow,
  issues: RowIssue[]
): void {
  const rawDate = record.appointmentDateRaw;
  const isoDate = rawDate ? parseDayMonthYear(rawDate) : null;
  if (rawDate === undefined || rawDate.trim() === "") {
    issues.push({
      code: "missing_date",
      severity: "blocking",
      field: "appointment_date",
      message: "Appointment date is missing.",
      suggestedAction: "Correct the source file or exclude the row.",
    });
  } else if (!isoDate) {
    issues.push({
      code: "invalid_date",
      severity: "blocking",
      field: "appointment_date",
      message: "Appointment date could not be parsed (expected e.g. `1 Dec 2025`).",
      originalValue: rawDate,
    });
  } else {
    normalized.appointmentDate = isoDate;
  }

  const rawTime = record.appointmentTimeRangeRaw;
  const range = rawTime ? parseTimeRange(rawTime) : null;
  if (rawTime === undefined || rawTime.trim() === "") {
    issues.push({
      code: "missing_time",
      severity: "blocking",
      field: "start_at",
      message: "Appointment time is missing.",
    });
    return;
  }
  if (!range) {
    issues.push({
      code: "invalid_time",
      severity: "blocking",
      field: "start_at",
      message:
        "Appointment time could not be parsed (expected e.g. `05:30 AM - 06:30 AM`).",
      originalValue: rawTime,
    });
    return;
  }
  if (!isoDate) return;

  const startAt = zonedDateTimeToUtcIso(isoDate, range.startMinutes, ctx.organizationTimezone);
  const endAt = zonedDateTimeToUtcIso(
    isoDate,
    range.startMinutes + range.durationMinutes,
    ctx.organizationTimezone
  );
  if (!startAt || !endAt) {
    issues.push({
      code: "invalid_timezone_conversion",
      severity: "blocking",
      field: "start_at",
      message: "Could not resolve the organization timezone for this time.",
    });
    return;
  }
  normalized.startAt = startAt;
  normalized.endAt = endAt;
  normalized.durationMinutes = range.durationMinutes;
  if (range.crossesMidnight) {
    issues.push({
      code: "time_crosses_midnight",
      severity: "warning",
      field: "end_at",
      message: "End time is before start time; treated as ending the next day.",
      originalValue: rawTime,
    });
  }
}

/**
 * API carries UTC instants. The organization date is DERIVED from the
 * instant in the organization timezone so that CSV-sourced and
 * API-sourced rows for the same appointment agree on `appointmentDate`.
 */
function normalizeApiTiming(
  record: SetmoreCanonicalRecord,
  normalized: NormalizedRow,
  issues: RowIssue[]
): void {
  const rawStart = record.startInstantRaw;
  if (rawStart === undefined || rawStart.trim() === "") {
    issues.push({
      code: "missing_time",
      severity: "blocking",
      field: "start_at",
      message: "Appointment start_time is missing from the API payload.",
    });
    return;
  }
  const startAt = parseSetmoreApiInstant(rawStart);
  if (!startAt) {
    issues.push({
      code: "invalid_time",
      severity: "blocking",
      field: "start_at",
      message:
        "Appointment start_time did not match the documented Setmore API format (`yyyy-MM-ddTHH:mmZ`).",
      originalValue: rawStart,
    });
    return;
  }
  normalized.startAt = startAt;

  const rawEnd = trimmedOrUndefined(record.endInstantRaw);
  const endAt = rawEnd ? parseSetmoreApiInstant(rawEnd) : null;
  if (rawEnd && !endAt) {
    issues.push({
      code: "invalid_time",
      severity: "warning",
      field: "end_at",
      message: "Appointment end_time did not match the documented Setmore API format.",
      originalValue: rawEnd,
    });
  }

  const durationFromInstants =
    endAt !== null
      ? Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000)
      : null;

  if (durationFromInstants !== null && durationFromInstants > 0) {
    normalized.endAt = endAt!;
    normalized.durationMinutes = durationFromInstants;
    // The API also reports `duration`; a disagreement is evidence the
    // payload is inconsistent and must not be silently reconciled.
    if (
      record.durationMinutesRaw !== undefined &&
      record.durationMinutesRaw !== durationFromInstants
    ) {
      issues.push({
        code: "duration_disagreement",
        severity: "warning",
        field: "duration_minutes",
        message: `API duration (${record.durationMinutesRaw} min) disagrees with start/end instants (${durationFromInstants} min); the instants were used.`,
        originalValue: String(record.durationMinutesRaw),
      });
    }
  } else if (record.durationMinutesRaw !== undefined && record.durationMinutesRaw > 0) {
    normalized.durationMinutes = record.durationMinutesRaw;
    normalized.endAt = new Date(
      Date.parse(startAt) + record.durationMinutesRaw * 60000
    ).toISOString();
  } else {
    issues.push({
      code: "missing_duration",
      severity: "blocking",
      field: "duration_minutes",
      message: "Neither a usable end_time nor a positive duration was present.",
    });
  }
}

/* ----------------------------------------------------------------- money */

function normalizeMoney(
  record: SetmoreCanonicalRecord,
  ctx: SetmoreNormalizeContext,
  normalized: NormalizedRow,
  issues: RowIssue[]
): void {
  const rawCost = trimmedOrUndefined(record.costRaw);
  if (rawCost === undefined) return;

  if (record.origin === "api") {
    const unit = ctx.apiCostUnit ?? "unverified";
    if (unit === "unverified") {
      // docs/SETMORE_API_FINDINGS.md: official examples show `cost: 1000`
      // alongside services priced `10`/`20`. Guessing the unit would
      // misstate revenue by 100x in one direction or the other.
      issues.push({
        code: "unverified_cost_unit",
        severity: "warning",
        field: "listed_price_cents",
        message:
          "Setmore API cost unit is unverified for this connection; the value was preserved as evidence but NOT mapped to a price.",
        originalValue: rawCost,
        suggestedAction:
          "Verify the cost unit against a known appointment price, then declare it on the connection.",
      });
      return;
    }
    const cents = unit === "cents" ? parseIntegerCents(rawCost) : parseMoneyToCents(rawCost);
    if (cents === null) {
      issues.push({
        code: "invalid_money",
        severity: "blocking",
        field: "listed_price_cents",
        message: `API cost could not be parsed as ${unit}.`,
        originalValue: rawCost,
      });
      return;
    }
    normalized.listedPriceCents = cents;
    normalized.currency = record.currencyRaw?.trim().toUpperCase() || "USD";
    issues.push(listedPriceOnlyIssue());
    return;
  }

  const cents = parseMoneyToCents(rawCost);
  if (cents === null) {
    issues.push({
      code: "invalid_money",
      severity: "blocking",
      field: "listed_price_cents",
      message: "Cost could not be parsed as a monetary amount.",
      originalValue: rawCost,
    });
    return;
  }
  normalized.listedPriceCents = cents;
  normalized.currency = record.currencyRaw?.trim().toUpperCase() || "USD";
  issues.push(listedPriceOnlyIssue());
}

function parseIntegerCents(value: string): number | null {
  const match = /^\d+$/.exec(value.trim());
  if (!match) return null;
  const cents = parseInt(value.trim(), 10);
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Setmore reports a LISTED price. It is not revenue, not recognized
 * revenue, and not cash collected — the distinction Phase F insists on.
 */
function listedPriceOnlyIssue(): RowIssue {
  return {
    code: "listed_price_only",
    severity: "info",
    field: "listed_price_cents",
    message:
      "Setmore provides listed price only; no payment data is present in this source.",
  };
}

/* ---------------------------------------------------------------- status */

function normalizeStatus(
  record: SetmoreCanonicalRecord,
  normalized: NormalizedRow,
  issues: RowIssue[]
): void {
  if (record.statusAvailability === "not_provided_by_source") {
    // The Setmore API exposes only a free-form `label`. Mapping a label to
    // completed/cancelled/no-show would be an invention, so the row is
    // left without a source status: matching maps it to `unknown`, and
    // `unknown` is excluded from every revenue and production metric.
    issues.push({
      code: "status_not_provided_by_source",
      severity: "warning",
      field: "status",
      message:
        "This Setmore source does not expose appointment status; the row will map to `unknown` and must not be counted as confirmed or completed.",
      suggestedAction:
        "Reconcile against a Setmore CSV export for the same period, or resolve the status manually.",
    });
    return;
  }

  const status = trimmedOrUndefined(record.statusRaw);
  if (status === undefined) {
    issues.push({
      code: "missing_status",
      severity: "warning",
      field: "status",
      message: "Status is blank; the row will map to `unknown` until resolved.",
    });
    return;
  }
  normalized.sourceStatus = status;
}

/* ------------------------------------------------------------- normalize */

/**
 * The single Setmore business-rule pass. Every Setmore row in the system
 * — historical export or live API — goes through this function.
 */
export function normalizeSetmoreRecord(
  record: SetmoreCanonicalRecord,
  ctx: SetmoreNormalizeContext
): NormalizeResult {
  const issues: RowIssue[] = [];
  const normalized: NormalizedRow = { timezone: ctx.organizationTimezone };

  normalizeTiming(record, ctx, normalized, issues);

  // The organization-local calendar date is authoritative for period
  // assignment and is derived identically for both origins.
  if (!normalized.appointmentDate && normalized.startAt) {
    const localDate = instantToZonedDate(normalized.startAt, ctx.organizationTimezone);
    if (localDate) normalized.appointmentDate = localDate;
  }

  normalizeMoney(record, ctx, normalized, issues);

  const trainer = trimmedOrUndefined(record.trainerNameRaw);
  const staffKey = trimmedOrUndefined(record.staffKeyRaw);
  if (trainer) normalized.sourceTrainerName = trainer;
  if (!trainer && !staffKey) {
    issues.push({
      code: "missing_trainer",
      severity: "blocking",
      field: "trainer",
      message: "Team member (trainer) is missing.",
    });
  } else if (!trainer && staffKey) {
    // An external key with no name is still resolvable via a stored
    // trainer source alias — it is not a blocking gap.
    issues.push({
      code: "trainer_name_absent",
      severity: "warning",
      field: "trainer",
      message:
        "No trainer name was supplied; matching depends on a stored Setmore staff-key alias.",
      originalValue: staffKey,
      suggestedAction: "Map this Setmore staff key to a trainer.",
    });
  }

  const service = trimmedOrUndefined(record.serviceNameRaw);
  const serviceKey = trimmedOrUndefined(record.serviceKeyRaw);
  if (service) normalized.sourceServiceName = service;
  if (!service && !serviceKey) {
    issues.push({
      code: "missing_service",
      severity: "blocking",
      field: "service",
      message: "Service/class/event is missing.",
    });
  } else if (!service && serviceKey) {
    issues.push({
      code: "service_name_absent",
      severity: "warning",
      field: "service",
      message:
        "No service name was supplied; matching depends on a stored Setmore service-key alias.",
      originalValue: serviceKey,
      suggestedAction: "Map this Setmore service key to a service.",
    });
  }

  normalizeClient(record, normalized, issues);
  normalizeStatus(record, normalized, issues);

  const externalId = trimmedOrUndefined(record.externalIdRaw);
  if (externalId) {
    normalized.externalAppointmentId = externalId;
  } else {
    issues.push({
      code: "missing_external_id",
      severity: "warning",
      field: "external_appointment_id",
      message: "Booking ID is missing; duplicate detection falls back to fingerprinting.",
    });
  }

  const bookedOn = trimmedOrUndefined(record.bookedOnRaw);
  if (bookedOn) {
    const created =
      record.origin === "api"
        ? parseSetmoreApiInstant(bookedOn)
        : parseSetmoreBookedOn(bookedOn, ctx.organizationTimezone);
    if (created) normalized.sourceCreatedAt = created;
    else {
      issues.push({
        code: "invalid_booked_on",
        severity: "info",
        field: "source_created_at",
        message: "Booked-on timestamp could not be parsed; ignored.",
        originalValue: bookedOn,
      });
    }
  }

  // Free text is retained as staging evidence only and never posted to the
  // ledger: it is untrusted third-party content.
  const comments = trimmedOrUndefined(record.commentsRaw);
  if (comments) normalized.notes = comments;
  const channel = trimmedOrUndefined(record.bookedViaRaw);
  if (channel) normalized.bookingChannel = channel;

  const extra: Record<string, string> = { ...(record.extra ?? {}) };
  if (staffKey) extra["setmore_staff_key"] = staffKey;
  if (serviceKey) extra["setmore_service_key"] = serviceKey;
  const customerKey = trimmedOrUndefined(record.customerKeyRaw);
  if (customerKey) {
    extra["setmore_customer_key"] = customerKey;
    normalized.externalClientId = customerKey;
  }
  const label = trimmedOrUndefined(record.labelRaw);
  if (label) extra["setmore_label"] = label;
  if (record.origin === "api" && record.costRaw !== undefined) {
    extra["setmore_api_cost_raw"] = record.costRaw;
  }
  if (Object.keys(extra).length > 0) normalized.extra = extra;

  return { normalized, issues };
}

function normalizeClient(
  record: SetmoreCanonicalRecord,
  normalized: NormalizedRow,
  issues: RowIssue[]
): void {
  const name = record.clientNameRaw;
  if (name !== undefined) {
    if (name.trim() === "") {
      issues.push({
        code: "missing_client_name",
        severity: "warning",
        field: "client",
        message: "Customer name is blank.",
      });
    } else {
      normalized.sourceClientName = name.trim();
    }
  }

  const email = trimmedOrUndefined(record.clientEmailRaw);
  if (email) {
    normalized.sourceClientEmail = email.toLowerCase();
  } else {
    issues.push({
      code: "missing_client_email",
      severity: "warning",
      field: "client_email",
      message: "Customer email is blank (weakens client matching).",
    });
  }

  const phone = trimmedOrUndefined(record.clientPhoneRaw);
  if (phone) normalized.sourceClientPhone = phone;
}

/** UTC instant → `YYYY-MM-DD` in the given IANA zone. */
export function instantToZonedDate(instantIso: string, timeZone: string): string | null {
  const ms = Date.parse(instantIso);
  if (Number.isNaN(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const y = get("year");
    const m = get("month");
    const d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}

/**
 * Occurrence identity for a Setmore appointment, shared by both origins.
 * Phase 3 established from real exports that a Setmore Booking ID
 * identifies a recurring SERIES, so identity is (external id + start).
 */
export function setmoreOccurrenceKey(row: {
  externalAppointmentId?: string;
  startAt?: string;
}): string | null {
  if (!row.externalAppointmentId || !row.startAt) return null;
  return `${normalizeText(row.externalAppointmentId)}|${row.startAt}`;
}
