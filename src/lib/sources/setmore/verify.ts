/**
 * Setmore live-verification probe.
 *
 * This exists to resolve a deliberate chicken-and-egg. The adapter is
 * fail-closed behind `SETMORE_API_LIVE_VERIFIED`, which blocks exactly the
 * calls needed to establish whether the API is trustworthy. Verification
 * must therefore be a SEPARATE, narrower capability from enablement:
 *
 *   probe  → evidence → human decision → flip the constant → sync
 *
 * The probe calls the transport directly rather than going through the
 * adapter. That is intentional and is the only place in the codebase
 * permitted to do so. It compensates with three hard limits:
 *
 *   1. READ ONLY. It calls fetch endpoints and nothing else. Setmore has
 *      no sandbox — every request hits the live account — so a probe that
 *      could write would be unacceptable.
 *   2. BOUNDED. One date window, at most MAX_PROBE_PAGES appointment
 *      pages, plus the staff and service directories. It cannot walk an
 *      account, and it reports when it stopped short rather than letting
 *      a partial read look like a complete one.
 *   3. REDACTED BY DEFAULT. The output is a STRUCTURAL report. Values are
 *      emitted only for an explicit allowlist of non-identifying fields;
 *      everything else is reduced to "present / absent / how many
 *      distinct". Client names, emails, phones, addresses and free-text
 *      comments never reach the report, the logs, or the screen.
 *
 * The report answers the four questions that block enablement, and it
 * RECOMMENDS rather than decides. A human reads it and sets the mappings.
 */

import {
  exchangeRefreshToken,
  fetchAppointmentsPage,
  fetchServices,
  fetchStaffPage,
} from "./api-client";

/* ---------------------------------------------------------- redaction */

/**
 * Fields whose VALUES may appear in the report. Everything else is
 * structural-only. This is an allowlist, not a blocklist, because a
 * blocklist silently fails open the moment Setmore adds a field.
 */
const VALUE_SAFE_FIELDS = new Set([
  "start_time",
  "end_time",
  "duration",
  "cost",
  "currency",
  "label",
]);

/**
 * Fields that are identifiers: their values are pseudonymous but still
 * identifying, so the report carries only counts and uniqueness.
 */
const IDENTIFIER_FIELDS = new Set(["key", "staff_key", "service_key", "customer_key"]);

/** Keys that might plausibly carry an appointment status, for detection. */
const STATUS_LIKE = /status|state|attend|complete|cancel|no.?show|show|outcome|disposition/i;

export interface FieldObservation {
  field: string;
  presentInRecords: number;
  types: string[];
  /** Distinct values, ONLY for allowlisted non-identifying fields. */
  sampleValues: string[] | null;
  distinctCount: number;
  /** True when the key name suggests it might carry status semantics. */
  statusLike: boolean;
}

export interface OccurrenceIdentityFinding {
  appointmentCount: number;
  distinctKeys: number;
  /** Keys appearing at more than one distinct start instant. */
  keysWithMultipleStarts: number;
  verdict: "occurrence_unique" | "series_level" | "inconclusive";
  explanation: string;
}

export interface CostUnitFinding {
  appointmentCostSamples: string[];
  serviceCostSamples: string[];
  recommendation: "cents" | "dollars" | "inconclusive";
  explanation: string;
}

export interface StatusFinding {
  statusFieldPresent: boolean;
  statusLikeFields: string[];
  labelValues: string[];
  verdict: "no_status_field" | "possible_status_field";
  explanation: string;
}

export interface SetmoreVerificationReport {
  window: { startDate: string; endDate: string };
  appointmentCount: number;
  staffCount: number;
  serviceCount: number;
  /** How many appointment pages the probe actually read. */
  pagesFetched: number;
  /** True when the cursor was still set after the last permitted page. */
  moreAvailable: boolean;
  /** Largest page returned — reveals the real server-side cap. */
  observedPageSize: number;
  /** The directory endpoints returned a cursor, so these lists are partial. */
  servicesTruncated: boolean;
  staffTruncated: boolean;
  rateLimitHeadersObserved: boolean;
  tokenLifetimeSeconds: number | null;
  fields: FieldObservation[];
  status: StatusFinding;
  occurrenceIdentity: OccurrenceIdentityFinding;
  costUnit: CostUnitFinding;
  /** What a human must do next, in order. */
  nextActions: string[];
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return "{object}";
  return String(value);
}

/* --------------------------------------------------------- observations */

export function observeFields(
  appointments: readonly Record<string, unknown>[]
): FieldObservation[] {
  const byField = new Map<
    string,
    { present: number; types: Set<string>; values: Set<string> }
  >();

  for (const appointment of appointments) {
    for (const [field, value] of Object.entries(appointment)) {
      const entry =
        byField.get(field) ?? { present: 0, types: new Set<string>(), values: new Set<string>() };
      entry.present += 1;
      entry.types.add(typeOf(value));
      entry.values.add(stringify(value));
      byField.set(field, entry);
    }
  }

  return [...byField.entries()]
    .map(([field, entry]) => ({
      field,
      presentInRecords: entry.present,
      types: [...entry.types].sort(),
      // The redaction decision, made once, here.
      sampleValues: VALUE_SAFE_FIELDS.has(field)
        ? [...entry.values].sort().slice(0, 5)
        : null,
      distinctCount: entry.values.size,
      statusLike:
        STATUS_LIKE.test(field) &&
        !IDENTIFIER_FIELDS.has(field) &&
        field !== "start_time" &&
        field !== "end_time",
    }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

export function assessStatus(fields: FieldObservation[]): StatusFinding {
  const statusLikeFields = fields.filter((f) => f.statusLike).map((f) => f.field);
  const label = fields.find((f) => f.field === "label");
  const labelValues = label?.sampleValues ?? [];

  if (statusLikeFields.length === 0) {
    return {
      statusFieldPresent: false,
      statusLikeFields: [],
      labelValues,
      verdict: "no_status_field",
      explanation:
        "No field resembling an appointment status was returned. This confirms the documented gap: API-sourced appointments must remain `unknown`, and the CSV export stays authoritative for status. Do NOT map `label` to a status — it is free-form text.",
    };
  }
  return {
    statusFieldPresent: true,
    statusLikeFields,
    labelValues,
    verdict: "possible_status_field",
    explanation: `Field(s) ${statusLikeFields.join(", ")} may carry status semantics. This is a CONTRACT CHANGE from the published documentation and must be confirmed against known completed and cancelled appointments before any mapping is created.`,
  };
}

/**
 * Does the appointment `key` identify an occurrence or a recurring series?
 *
 * Phase 3 established from real CSV exports that a Setmore Booking ID
 * identifies a SERIES. If the API's `key` behaves the same way, occurrence
 * identity must stay `(key + start instant)`.
 */
export function assessOccurrenceIdentity(
  appointments: readonly Record<string, unknown>[]
): OccurrenceIdentityFinding {
  const startsByKey = new Map<string, Set<string>>();
  for (const appointment of appointments) {
    const key = typeof appointment.key === "string" ? appointment.key : null;
    const start = typeof appointment.start_time === "string" ? appointment.start_time : null;
    if (!key || !start) continue;
    const set = startsByKey.get(key) ?? new Set<string>();
    set.add(start);
    startsByKey.set(key, set);
  }

  const keysWithMultipleStarts = [...startsByKey.values()].filter((s) => s.size > 1).length;

  if (keysWithMultipleStarts > 0) {
    return {
      appointmentCount: appointments.length,
      distinctKeys: startsByKey.size,
      keysWithMultipleStarts,
      verdict: "series_level",
      explanation:
        "At least one appointment key appears at more than one start instant, so the API key identifies a SERIES, exactly as the CSV Booking ID does. Occurrence identity must remain (key + start instant). This is already how the normalizer behaves.",
    };
  }
  if (startsByKey.size === 0) {
    return {
      appointmentCount: appointments.length,
      distinctKeys: 0,
      keysWithMultipleStarts: 0,
      verdict: "inconclusive",
      explanation:
        "No appointments with both a key and a start time were returned, so nothing could be concluded. Re-run over a window known to contain a recurring series.",
    };
  }
  return {
    appointmentCount: appointments.length,
    distinctKeys: startsByKey.size,
    keysWithMultipleStarts: 0,
    verdict: "inconclusive",
    explanation:
      "Every key in this window appeared at exactly one start instant. That is CONSISTENT with occurrence-unique keys but does not prove it — a window containing no recurring bookings would look identical. Re-run over a window known to contain a recurring series before concluding. Occurrence identity stays (key + start) either way, which is safe under both readings.",
  };
}

/**
 * Is the appointment `cost` in cents or dollars?
 *
 * The official examples are contradictory (`cost: 1000` on an appointment
 * alongside services priced `10`). The tell is comparing the two endpoints
 * for the same magnitude of price.
 */
export function assessCostUnit(
  appointments: readonly Record<string, unknown>[],
  services: readonly Record<string, unknown>[]
): CostUnitFinding {
  const numeric = (records: readonly Record<string, unknown>[]): number[] =>
    records
      .map((r) => Number(r.cost))
      .filter((n) => Number.isFinite(n) && n > 0);

  const apptCosts = numeric(appointments);
  const serviceCosts = numeric(services);

  const sample = (values: number[]) =>
    [...new Set(values)].sort((a, b) => a - b).slice(0, 5).map(String);

  if (apptCosts.length === 0) {
    return {
      appointmentCostSamples: [],
      serviceCostSamples: sample(serviceCosts),
      recommendation: "inconclusive",
      explanation:
        "No positive appointment cost was returned in this window, so the unit could not be inferred.",
    };
  }

  // A decimal point anywhere is decisive: cents are integers.
  const anyFractional = apptCosts.some((n) => !Number.isInteger(n));
  if (anyFractional) {
    return {
      appointmentCostSamples: sample(apptCosts),
      serviceCostSamples: sample(serviceCosts),
      recommendation: "dollars",
      explanation:
        "At least one appointment cost carries a fractional part, which an integer-cents representation cannot produce. Cost is denominated in dollars.",
    };
  }

  if (serviceCosts.length > 0) {
    const medianAppt = median(apptCosts);
    const medianService = median(serviceCosts);
    const ratio = medianService > 0 ? medianAppt / medianService : 0;
    if (ratio >= 50 && ratio <= 200) {
      return {
        appointmentCostSamples: sample(apptCosts),
        serviceCostSamples: sample(serviceCosts),
        recommendation: "cents",
        explanation: `Appointment costs are roughly ${Math.round(ratio)}× the service catalogue prices for the same account, which is the signature of appointments in cents and services in dollars.`,
      };
    }
    if (ratio > 0.5 && ratio < 2) {
      return {
        appointmentCostSamples: sample(apptCosts),
        serviceCostSamples: sample(serviceCosts),
        recommendation: "dollars",
        explanation:
          "Appointment costs and service catalogue prices are the same order of magnitude, so both are denominated in dollars.",
      };
    }
  }

  return {
    appointmentCostSamples: sample(apptCosts),
    serviceCostSamples: sample(serviceCosts),
    recommendation: "inconclusive",
    explanation:
      "The comparison was not decisive. Check one appointment's cost against its known sale price by hand, then declare the unit on the connection. Until it is declared, cost is preserved as evidence and NOT mapped to a price.",
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* ------------------------------------------------------------- assembly */

export function buildVerificationReport(args: {
  window: { startDate: string; endDate: string };
  appointments: readonly Record<string, unknown>[];
  staff: readonly Record<string, unknown>[];
  services: readonly Record<string, unknown>[];
  pagesFetched: number;
  moreAvailable: boolean;
  observedPageSize: number;
  servicesTruncated: boolean;
  staffTruncated: boolean;
  rateLimitHeadersObserved: boolean;
  tokenLifetimeSeconds: number | null;
}): SetmoreVerificationReport {
  const fields = observeFields(args.appointments);
  const status = assessStatus(fields);
  const occurrenceIdentity = assessOccurrenceIdentity(args.appointments);
  const costUnit = assessCostUnit(args.appointments, args.services);

  const nextActions: string[] = [];
  if (args.appointments.length === 0) {
    nextActions.push(
      "No appointments were returned. Re-run over a window known to contain bookings before drawing any conclusion — an empty window proves nothing."
    );
  }
  // A partial read must never be mistaken for the account's real contents.
  // Every count below is a floor, not a total, and saying so is the whole
  // difference between "the API is missing data" and "that was page one".
  if (args.moreAvailable) {
    nextActions.push(
      `The window has MORE appointments than the probe read: it stopped after ${args.pagesFetched} page(s). Every count here is a floor, not a total. Compare against the CSV export for the same period before concluding anything about API completeness.`
    );
  }
  if (args.servicesTruncated) {
    nextActions.push(
      "The service catalogue was truncated — more services exist than were listed. Do not treat the service list as complete when mapping."
    );
  }
  if (args.staffTruncated) {
    nextActions.push(
      "The staff directory was truncated — more staff exist than were listed."
    );
  }
  if (status.verdict === "no_status_field") {
    nextActions.push(
      "Keep the hybrid strategy: CSV export remains authoritative for appointment status, and API-sourced rows stay `unknown`."
    );
  } else {
    nextActions.push(
      "Confirm the candidate status field against appointments you KNOW were completed, cancelled and no-showed, then add org-scoped source_status_mappings. Do not map until confirmed."
    );
  }
  if (occurrenceIdentity.verdict === "inconclusive") {
    nextActions.push(
      "Re-run over a window containing a known recurring booking to settle occurrence identity."
    );
  }
  if (costUnit.recommendation === "inconclusive") {
    nextActions.push(
      "Determine the cost unit by hand against one known sale price, then set `cost_unit` on the connection."
    );
  } else {
    nextActions.push(
      `Set \`cost_unit\` = "${costUnit.recommendation}" on the connection config.`
    );
  }
  nextActions.push(
    "Run the API/CSV reconciliation over one full historical month and review every MISMATCH, API_ONLY and CSV_ONLY row."
  );
  nextActions.push(
    "Only then flip SETMORE_API_LIVE_VERIFIED, in a reviewed commit that also records the verified shapes and date in docs/SETMORE_API_FINDINGS.md."
  );

  return {
    window: args.window,
    appointmentCount: args.appointments.length,
    staffCount: args.staff.length,
    serviceCount: args.services.length,
    pagesFetched: args.pagesFetched,
    moreAvailable: args.moreAvailable,
    observedPageSize: args.observedPageSize,
    servicesTruncated: args.servicesTruncated,
    staffTruncated: args.staffTruncated,
    rateLimitHeadersObserved: args.rateLimitHeadersObserved,
    tokenLifetimeSeconds: args.tokenLifetimeSeconds,
    fields,
    status,
    occurrenceIdentity,
    costUnit,
    nextActions,
  };
}

/* ---------------------------------------------------------------- probe */

/**
 * Execute the probe against a live Setmore account.
 *
 * SERVER ONLY. `refreshToken` is resolved from Vault by the caller and is
 * never logged, never returned, and never placed in the report.
 *
 * `customerDetails` is deliberately NOT requested: the probe answers
 * structural questions, and there is no reason to pull client PII across
 * the wire to do it.
 */
/**
 * Bounded page budget. Still a probe, not a sync — but one page proved
 * too little: Setmore returned 50 records for a month whose CSV export
 * holds 2,883, which reads as "the API is missing data" when it may only
 * mean "that was page one". Several pages settle it while keeping the
 * call count small and predictable.
 */
export const MAX_PROBE_PAGES = 5;

export async function probeSetmore(args: {
  refreshToken: string;
  startDate: string;
  endDate: string;
}): Promise<SetmoreVerificationReport> {
  const token = await exchangeRefreshToken(args.refreshToken);
  const tokenLifetimeSeconds = Math.round((token.expiresAtMs - Date.now()) / 1000);

  const appointments: Record<string, unknown>[] = [];
  const pageSizes: number[] = [];
  let cursor: string | null = null;
  let pagesFetched = 0;
  let moreAvailable = false;
  let rateLimitSeen = false;

  for (let page = 0; page < MAX_PROBE_PAGES; page++) {
    const result = await fetchAppointmentsPage(token, {
      startDate: args.startDate,
      endDate: args.endDate,
      cursor,
      limit: 150,
      customerDetails: false,
    });
    appointments.push(...result.items);
    pageSizes.push(result.items.length);
    pagesFetched += 1;
    if (result.rateLimit !== undefined) rateLimitSeen = true;
    cursor = result.nextCursor;
    if (!cursor) break;
    // Cursor still set after the last permitted page → more data exists.
    if (page === MAX_PROBE_PAGES - 1) moreAvailable = true;
  }

  const staff = await fetchStaffPage(token);
  const services = await fetchServices(token);
  if (staff.rateLimit !== undefined || services.rateLimit !== undefined) rateLimitSeen = true;

  return buildVerificationReport({
    window: { startDate: args.startDate, endDate: args.endDate },
    appointments,
    staff: staff.items,
    services: services.items,
    pagesFetched,
    moreAvailable,
    // The largest page actually returned reveals the real server-side cap,
    // which the official docs never name.
    observedPageSize: pageSizes.length > 0 ? Math.max(...pageSizes) : 0,
    servicesTruncated: services.nextCursor !== null,
    staffTruncated: staff.nextCursor !== null,
    rateLimitHeadersObserved: rateLimitSeen,
    tokenLifetimeSeconds,
  });
}
