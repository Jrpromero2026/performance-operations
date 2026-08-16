/**
 * Setmore CSV/report FIELD EXTRACTION. This module knows which column
 * holds which value and nothing else — every business rule lives in
 * `./canonical`.
 *
 * Column names come from three inspected real exports
 * (docs/schemas/setmore-observed-schema.md): 20 columns, three of which
 * carry trailing spaces, so all header matching is on trimmed names.
 */

import type { SetmoreCanonicalRecord } from "./canonical";

export const SETMORE_CSV_REQUIRED_HEADERS = [
  "Appointment date",
  "Appointment time",
  "Service/class/event",
  "Team member",
  "Status",
  "Booking ID",
] as const;

export const SETMORE_CSV_OPTIONAL_HEADERS = [
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
] as const;

const KNOWN_HEADERS = new Set<string>([
  ...SETMORE_CSV_REQUIRED_HEADERS,
  ...SETMORE_CSV_OPTIONAL_HEADERS,
]);

/**
 * Map one parsed CSV row onto the canonical record. Absent columns stay
 * absent; present-but-blank columns are preserved as "" so the canonical
 * layer can tell "not provided" from "provided empty".
 */
export function setmoreCsvRowToCanonical(
  row: Record<string, string>
): SetmoreCanonicalRecord {
  const get = (key: string): string | undefined => (key in row ? row[key] : undefined);

  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!KNOWN_HEADERS.has(key) && value !== "") extra[key] = value;
  }

  const status = get("Status");

  return {
    origin: "csv",
    appointmentDateRaw: get("Appointment date"),
    appointmentTimeRangeRaw: get("Appointment time"),
    costRaw: get("Cost"),
    currencyRaw: "USD",
    trainerNameRaw: get("Team member"),
    serviceNameRaw: get("Service/class/event"),
    clientNameRaw: get("Customer name"),
    clientEmailRaw: get("Email"),
    clientPhoneRaw: get("Phone"),
    // The CSV export DOES carry a Status column — that is precisely the
    // field the API is missing, and the reason CSV stays authoritative
    // for status until the API is proven otherwise.
    statusRaw: status,
    statusAvailability: status === undefined || status.trim() === "" ? "blank" : "provided",
    externalIdRaw: get("Booking ID"),
    bookedOnRaw: get("Booked on"),
    commentsRaw: get("Comments"),
    bookedViaRaw: get("Booked via"),
    labelRaw: get("Label"),
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

/** Unrecognized columns are preserved, and their presence is reported. */
export function unrecognizedCsvColumns(row: Record<string, string>): string[] {
  return Object.entries(row)
    .filter(([key, value]) => !KNOWN_HEADERS.has(key) && value !== "")
    .map(([key]) => key);
}
