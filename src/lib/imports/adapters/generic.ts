import {
  parseFlexibleDate,
  parseMoneyToCents,
  parseTimeOfDay,
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
 * Generic manual-CSV adapter (generic-v1) — mapping-driven. An authorized
 * user maps source columns to canonical fields; the mapping is stored as a
 * versioned, org-scoped import_schema_profile keyed by header signature.
 * Also the interim path for Acuity exports until a sample unblocks a
 * dedicated adapter.
 */

export const CANONICAL_FIELDS = [
  "appointment_date",
  "start_time",
  "end_time",
  "time_range",
  "duration_minutes",
  "trainer_name",
  "trainer_email",
  "client_name",
  "client_email",
  "client_phone",
  "service_name",
  "status",
  "listed_price",
  "amount_paid",
  "external_appointment_id",
  "external_client_id",
  "notes",
  "location",
  "ignore",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export type ColumnMappings = Record<string, CanonicalField>;

export function createGenericAdapter(mappings: ColumnMappings): SourceAdapter {
  const mappedFields = new Set(Object.values(mappings));

  return {
    source: "manual_csv",
    version: "generic-v1",
    displayName: "Generic CSV (column mapping)",
    requiredHeaders: [],
    optionalHeaders: [],

    detect(): number {
      return 0.1; // fallback adapter; explicit choice, never auto-preferred
    },

    normalizeRow(row: Record<string, string>, ctx: AdapterContext): NormalizeResult {
      const issues: RowIssue[] = [];
      const normalized: NormalizedRow = { timezone: ctx.organizationTimezone };
      const byField = new Map<CanonicalField, string>();
      const extra: Record<string, string> = {};

      for (const [column, value] of Object.entries(row)) {
        const field = mappings[column];
        if (!field || field === "ignore") {
          if (value !== "" && !field) extra[column] = value;
          continue;
        }
        byField.set(field, value);
      }
      if (Object.keys(extra).length > 0) normalized.extra = extra;

      const val = (field: CanonicalField): string | undefined => {
        const v = byField.get(field);
        return v === undefined ? undefined : v.trim();
      };

      // date
      const rawDate = val("appointment_date");
      const isoDate = rawDate ? parseFlexibleDate(rawDate) : null;
      if (!rawDate) {
        issues.push({
          code: "missing_date",
          severity: "blocking",
          field: "appointment_date",
          message: "No appointment date after mapping.",
        });
      } else if (!isoDate) {
        issues.push({
          code: "invalid_date",
          severity: "blocking",
          field: "appointment_date",
          message: "Appointment date could not be parsed.",
          originalValue: rawDate,
        });
      } else {
        normalized.appointmentDate = isoDate;
      }

      // time: range OR start(+end|duration)
      let startMinutes: number | null = null;
      let durationMinutes: number | null = null;
      const rawRange = val("time_range");
      if (rawRange) {
        const range = parseTimeRange(rawRange);
        if (!range) {
          issues.push({
            code: "invalid_time",
            severity: "blocking",
            field: "start_at",
            message: "Time range could not be parsed.",
            originalValue: rawRange,
          });
        } else {
          startMinutes = range.startMinutes;
          durationMinutes = range.durationMinutes;
        }
      } else {
        const rawStart = val("start_time");
        startMinutes = rawStart ? parseTimeOfDay(rawStart) : null;
        if (!rawStart) {
          issues.push({
            code: "missing_time",
            severity: "blocking",
            field: "start_at",
            message: "No start time after mapping.",
          });
        } else if (startMinutes === null) {
          issues.push({
            code: "invalid_time",
            severity: "blocking",
            field: "start_at",
            message: "Start time could not be parsed.",
            originalValue: rawStart,
          });
        }
        const rawEnd = val("end_time");
        const rawDuration = val("duration_minutes");
        if (rawEnd) {
          const endMinutes = parseTimeOfDay(rawEnd);
          if (endMinutes === null) {
            issues.push({
              code: "invalid_time",
              severity: "blocking",
              field: "end_at",
              message: "End time could not be parsed.",
              originalValue: rawEnd,
            });
          } else if (startMinutes !== null) {
            durationMinutes =
              endMinutes > startMinutes
                ? endMinutes - startMinutes
                : endMinutes + 24 * 60 - startMinutes;
          }
        } else if (rawDuration) {
          const parsed = parseInt(rawDuration, 10);
          if (!Number.isInteger(parsed) || String(parsed) !== rawDuration || parsed <= 0 || parsed > 1440) {
            issues.push({
              code: "invalid_duration",
              severity: "blocking",
              field: "duration_minutes",
              message: "Duration must be whole minutes between 1 and 1440.",
              originalValue: rawDuration,
            });
          } else {
            durationMinutes = parsed;
          }
        } else if (startMinutes !== null) {
          issues.push({
            code: "missing_duration",
            severity: "blocking",
            field: "duration_minutes",
            message: "Map either an end time or a duration column.",
          });
        }
      }

      if (isoDate && startMinutes !== null && durationMinutes !== null) {
        const startAt = zonedDateTimeToUtcIso(isoDate, startMinutes, ctx.organizationTimezone);
        const endAt = zonedDateTimeToUtcIso(
          isoDate,
          startMinutes + durationMinutes,
          ctx.organizationTimezone
        );
        if (startAt && endAt) {
          normalized.startAt = startAt;
          normalized.endAt = endAt;
          normalized.durationMinutes = durationMinutes;
        } else {
          issues.push({
            code: "invalid_timezone_conversion",
            severity: "blocking",
            field: "start_at",
            message: "Could not resolve the organization timezone for this time.",
          });
        }
      }

      // people & service
      const trainer = val("trainer_name");
      if (!trainer) {
        issues.push({
          code: "missing_trainer",
          severity: "blocking",
          field: "trainer",
          message: "No trainer name after mapping.",
        });
      } else {
        normalized.sourceTrainerName = trainer;
      }
      const trainerEmail = val("trainer_email");
      if (trainerEmail) normalized.sourceTrainerEmail = trainerEmail.toLowerCase();

      const service = val("service_name");
      if (!service) {
        issues.push({
          code: "missing_service",
          severity: "blocking",
          field: "service",
          message: "No service name after mapping.",
        });
      } else {
        normalized.sourceServiceName = service;
      }

      const clientName = val("client_name");
      if (clientName) normalized.sourceClientName = clientName;
      const clientEmail = val("client_email");
      if (clientEmail) normalized.sourceClientEmail = clientEmail.toLowerCase();
      else {
        issues.push({
          code: "missing_client_email",
          severity: "warning",
          field: "client_email",
          message: "No client email (weakens client matching).",
        });
      }
      const clientPhone = val("client_phone");
      if (clientPhone) normalized.sourceClientPhone = clientPhone;

      const status = val("status");
      if (status) normalized.sourceStatus = status;

      const listed = val("listed_price");
      if (listed) {
        const cents = parseMoneyToCents(listed);
        if (cents === null) {
          issues.push({
            code: "invalid_money",
            severity: "blocking",
            field: "listed_price_cents",
            message: "Listed price could not be parsed.",
            originalValue: listed,
          });
        } else {
          normalized.listedPriceCents = cents;
          normalized.currency = "USD";
        }
      }
      const paid = val("amount_paid");
      if (paid) {
        const cents = parseMoneyToCents(paid);
        if (cents === null) {
          issues.push({
            code: "invalid_money",
            severity: "blocking",
            field: "amount_paid_cents",
            message: "Amount paid could not be parsed.",
            originalValue: paid,
          });
        } else {
          normalized.amountPaidCents = cents;
          normalized.currency = "USD";
        }
      }

      const externalId = val("external_appointment_id");
      if (externalId) normalized.externalAppointmentId = externalId;
      const externalClientId = val("external_client_id");
      if (externalClientId) normalized.externalClientId = externalClientId;
      const notes = val("notes");
      if (notes) normalized.notes = notes;
      const location = val("location");
      if (location) normalized.location = location;

      // structural sanity: mapping must at least target trainer+service+date
      if (!mappedFields.has("trainer_name") || !mappedFields.has("service_name")) {
        issues.push({
          code: "unsupported_schema",
          severity: "blocking",
          message: "The column mapping does not cover trainer and service.",
        });
      }

      return { normalized, issues };
    },
  };
}
