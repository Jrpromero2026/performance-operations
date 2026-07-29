import {
  parseDayMonthYear,
  parseMoneyToCents,
  parseSetmoreBookedOn,
  parseTimeRange,
  zonedDateTimeToUtcIso,
} from "../values";
import type {
  AdapterContext,
  NormalizeResult,
  NormalizedRow,
  RowIssue,
  SourceAdapter,
} from "../types";

/**
 * Setmore report adapter, version setmore-v1.
 * Built from three inspected real exports (docs/schemas/
 * setmore-observed-schema.md): 20 columns, D-MMM-YYYY dates, 12-hour time
 * ranges, decimal Cost (LISTED price only), Booking ID identifying a
 * recurring SERIES (occurrence = booking id + start), several headers with
 * trailing spaces (matching is on trimmed names).
 */

const REQUIRED = [
  "Appointment date",
  "Appointment time",
  "Service/class/event",
  "Team member",
  "Status",
  "Booking ID",
];

const OPTIONAL = [
  "Cost",
  "Customer name",
  "Country code",
  "Phone",
  "Email",
  "Label",
  "Comments",
  "Booked via",
  "Booked on",
  "Address",
  "City",
  "State",
  "Country",
  "Zipcode / Postal code",
];

export const setmoreAdapter: SourceAdapter = {
  source: "setmore",
  version: "setmore-v1",
  displayName: "Setmore report (v1)",
  requiredHeaders: REQUIRED,
  optionalHeaders: OPTIONAL,

  detect(headers: string[]): number {
    const set = new Set(headers.map((h) => h.trim()));
    const requiredHits = REQUIRED.filter((h) => set.has(h)).length;
    if (requiredHits < REQUIRED.length) return 0;
    const optionalHits = OPTIONAL.filter((h) => set.has(h)).length;
    return Math.min(1, 0.8 + optionalHits / (OPTIONAL.length * 5));
  },

  normalizeRow(row: Record<string, string>, ctx: AdapterContext): NormalizeResult {
    const issues: RowIssue[] = [];
    const normalized: NormalizedRow = { timezone: ctx.organizationTimezone };
    const known = new Set([...REQUIRED, ...OPTIONAL]);

    const get = (key: string): string | undefined =>
      key in row ? row[key] : undefined;

    // --- date + time range ---------------------------------------------
    const rawDate = get("Appointment date");
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

    const rawTime = get("Appointment time");
    const range = rawTime ? parseTimeRange(rawTime) : null;
    if (rawTime === undefined || rawTime.trim() === "") {
      issues.push({
        code: "missing_time",
        severity: "blocking",
        field: "start_at",
        message: "Appointment time is missing.",
      });
    } else if (!range) {
      issues.push({
        code: "invalid_time",
        severity: "blocking",
        field: "start_at",
        message:
          "Appointment time could not be parsed (expected e.g. `05:30 AM - 06:30 AM`).",
        originalValue: rawTime,
      });
    } else if (isoDate) {
      const startAt = zonedDateTimeToUtcIso(
        isoDate,
        range.startMinutes,
        ctx.organizationTimezone
      );
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
      } else {
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
    }

    // --- money (listed price only — never revenue, never amount paid) ---
    const rawCost = get("Cost");
    if (rawCost !== undefined && rawCost.trim() !== "") {
      const cents = parseMoneyToCents(rawCost);
      if (cents === null) {
        issues.push({
          code: "invalid_money",
          severity: "blocking",
          field: "listed_price_cents",
          message: "Cost could not be parsed as a monetary amount.",
          originalValue: rawCost,
        });
      } else {
        normalized.listedPriceCents = cents;
        normalized.currency = "USD";
        issues.push({
          code: "listed_price_only",
          severity: "info",
          field: "listed_price_cents",
          message:
            "Setmore provides listed price only; no payment data is present in this export.",
        });
      }
    }

    // --- people & service ----------------------------------------------
    const trainer = get("Team member");
    if (!trainer || trainer.trim() === "") {
      issues.push({
        code: "missing_trainer",
        severity: "blocking",
        field: "trainer",
        message: "Team member (trainer) is missing.",
      });
    } else {
      normalized.sourceTrainerName = trainer.trim();
    }

    const service = get("Service/class/event");
    if (!service || service.trim() === "") {
      issues.push({
        code: "missing_service",
        severity: "blocking",
        field: "service",
        message: "Service/class/event is missing.",
      });
    } else {
      normalized.sourceServiceName = service.trim();
    }

    const client = get("Customer name");
    if (client !== undefined) {
      if (client.trim() === "") {
        issues.push({
          code: "missing_client_name",
          severity: "warning",
          field: "client",
          message: "Customer name is blank.",
        });
      } else {
        normalized.sourceClientName = client.trim();
      }
    }
    const email = get("Email");
    if (email !== undefined && email.trim() !== "") {
      normalized.sourceClientEmail = email.trim().toLowerCase();
    } else {
      issues.push({
        code: "missing_client_email",
        severity: "warning",
        field: "client_email",
        message: "Customer email is blank (weakens client matching).",
      });
    }
    const phone = get("Phone");
    if (phone !== undefined && phone.trim() !== "") {
      normalized.sourceClientPhone = phone.trim();
    }

    // --- status / ids / metadata ----------------------------------------
    const status = get("Status");
    if (status !== undefined && status.trim() !== "") {
      normalized.sourceStatus = status.trim();
    } else {
      issues.push({
        code: "missing_status",
        severity: "warning",
        field: "status",
        message: "Status is blank; the row will map to `unknown` until resolved.",
      });
    }

    const bookingId = get("Booking ID");
    if (bookingId && bookingId.trim() !== "") {
      normalized.externalAppointmentId = bookingId.trim();
    } else {
      issues.push({
        code: "missing_external_id",
        severity: "warning",
        field: "external_appointment_id",
        message:
          "Booking ID is missing; duplicate detection falls back to fingerprinting.",
      });
    }

    const bookedOn = get("Booked on");
    if (bookedOn && bookedOn.trim() !== "") {
      const created = parseSetmoreBookedOn(bookedOn, ctx.organizationTimezone);
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

    const comments = get("Comments");
    if (comments && comments.trim() !== "") {
      // Retained in staging evidence only; NOT posted to the ledger
      // (source-notes policy is an unresolved business decision).
      normalized.notes = comments.trim();
    }
    const channel = get("Booked via");
    if (channel && channel.trim() !== "") normalized.bookingChannel = channel.trim();

    // --- unknown columns preserved --------------------------------------
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!known.has(key) && value !== "") extra[key] = value;
    }
    if (Object.keys(extra).length > 0) {
      normalized.extra = extra;
      issues.push({
        code: "unrecognized_columns",
        severity: "warning",
        message: `Unrecognized column(s) preserved: ${Object.keys(extra).join(", ")}.`,
      });
    }

    return { normalized, issues };
  },
};
