/**
 * Setmore API FIELD EXTRACTION. Like the CSV extractor, this module knows
 * only which JSON key holds which value; every rule lives in `./canonical`.
 *
 * Payload shape verified from official documentation on 2026-07-29
 * (docs/SETMORE_API_FINDINGS.md). Fields the docs do NOT define are not
 * invented here — most importantly there is **no appointment status
 * field**, only a free-form `label`.
 */

import type { SetmoreCanonicalRecord } from "./canonical";

/** Documented Setmore appointment payload (all fields optional in practice). */
export interface SetmoreApiAppointment {
  key?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  duration?: unknown;
  staff_key?: unknown;
  service_key?: unknown;
  customer_key?: unknown;
  cost?: unknown;
  currency?: unknown;
  comment?: unknown;
  label?: unknown;
  /** Present only when the request asked for `customerDetails=true`. */
  customer?: unknown;
  [key: string]: unknown;
}

/**
 * Names/emails are only available when the caller requested
 * `customerDetails=true`; staff and service names require a separate
 * lookup. Callers pass what they have resolved, and anything missing
 * simply falls through to key-based alias matching.
 */
export interface SetmoreApiLookups {
  staffNameByKey?: ReadonlyMap<string, string>;
  serviceNameByKey?: ReadonlyMap<string, string>;
}

function str(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function int(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return undefined;
}

/** Extract embedded customer details when `customerDetails=true` was used. */
function readCustomer(value: unknown): {
  name?: string;
  email?: string;
  phone?: string;
} {
  if (typeof value !== "object" || value === null) return {};
  const c = value as Record<string, unknown>;
  const first = str(c.firstname) ?? str(c.first_name) ?? "";
  const last = str(c.lastname) ?? str(c.last_name) ?? "";
  const combined = `${first} ${last}`.trim();
  return {
    name: combined === "" ? str(c.name) : combined,
    email: str(c.email_id) ?? str(c.email),
    phone: str(c.cell_phone) ?? str(c.phone) ?? str(c.work_phone),
  };
}

const KNOWN_KEYS = new Set([
  "key",
  "start_time",
  "end_time",
  "duration",
  "staff_key",
  "service_key",
  "customer_key",
  "cost",
  "currency",
  "comment",
  "label",
  "customer",
]);

/**
 * Map one API appointment onto the canonical record.
 *
 * `statusAvailability` is hardcoded to `not_provided_by_source` because
 * the documented payload has no status field. If a live account is later
 * proven to return one, that is a contract change — update this mapping
 * deliberately, with evidence, rather than inferring status from `label`.
 */
export function setmoreApiAppointmentToCanonical(
  appointment: SetmoreApiAppointment,
  lookups: SetmoreApiLookups = {}
): SetmoreCanonicalRecord {
  const staffKey = str(appointment.staff_key);
  const serviceKey = str(appointment.service_key);
  const customer = readCustomer(appointment.customer);

  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(appointment)) {
    if (KNOWN_KEYS.has(key)) continue;
    const asString = str(value);
    if (asString !== undefined && asString !== "") extra[`setmore_api_${key}`] = asString;
  }

  return {
    origin: "api",
    startInstantRaw: str(appointment.start_time),
    endInstantRaw: str(appointment.end_time),
    durationMinutesRaw: int(appointment.duration),
    costRaw: str(appointment.cost),
    currencyRaw: str(appointment.currency),
    trainerNameRaw: staffKey ? lookups.staffNameByKey?.get(staffKey) : undefined,
    staffKeyRaw: staffKey,
    serviceNameRaw: serviceKey ? lookups.serviceNameByKey?.get(serviceKey) : undefined,
    serviceKeyRaw: serviceKey,
    clientNameRaw: customer.name,
    clientEmailRaw: customer.email,
    clientPhoneRaw: customer.phone,
    customerKeyRaw: str(appointment.customer_key),
    // No status in the documented contract — see module header.
    statusAvailability: "not_provided_by_source",
    externalIdRaw: str(appointment.key),
    commentsRaw: str(appointment.comment),
    labelRaw: str(appointment.label),
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
