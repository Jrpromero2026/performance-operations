import { describe, expect, it } from "vitest";
import {
  instantToZonedDate,
  normalizeSetmoreRecord,
  parseSetmoreApiInstant,
  setmoreOccurrenceKey,
  type SetmoreCanonicalRecord,
} from "@/lib/sources/setmore/canonical";
import { setmoreCsvRowToCanonical } from "@/lib/sources/setmore/csv-fields";
import { setmoreApiAppointmentToCanonical } from "@/lib/sources/setmore/api-fields";
import { setmoreAdapter as setmoreCsvAdapter } from "@/lib/imports/adapters/setmore";

const TZ = "America/Los_Angeles";
const ctx = { organizationTimezone: TZ };

/** A complete, realistic Setmore export row (shape from three real exports). */
function csvRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "Appointment date": "1 Dec 2025",
    "Appointment time": "05:30 AM - 06:30 AM",
    "Service/class/event": "Private Training",
    Cost: "80.75",
    "Team member": "Jo Trainer",
    "Customer name": "Sample Client",
    Phone: "5415550100",
    Email: "Sample.Client@example.com",
    Label: "No Label",
    Status: "Confirmed",
    Comments: "",
    "Booking ID": "ABCDE123",
    "Booked via": "Staff",
    "Booked on": "7 May 2025 10:36 AM",
    ...overrides,
  };
}

describe("parseSetmoreApiInstant", () => {
  it("parses the documented minute-precision UTC format", () => {
    expect(parseSetmoreApiInstant("2025-12-01T13:30Z")).toBe("2025-12-01T13:30:00.000Z");
  });

  it("accepts an optional seconds component", () => {
    expect(parseSetmoreApiInstant("2025-12-01T13:30:45Z")).toBe("2025-12-01T13:30:45.000Z");
  });

  it("rejects formats the docs do not define rather than guessing", () => {
    expect(parseSetmoreApiInstant("2025-12-01T13:30+00:00")).toBeNull();
    expect(parseSetmoreApiInstant("2025-12-01 13:30Z")).toBeNull();
    expect(parseSetmoreApiInstant("01-12-2025T13:30Z")).toBeNull();
    expect(parseSetmoreApiInstant("")).toBeNull();
  });

  it("rejects impossible calendar values instead of rolling them over", () => {
    expect(parseSetmoreApiInstant("2025-13-01T13:30Z")).toBeNull();
    expect(parseSetmoreApiInstant("2025-02-30T13:30Z")).toBeNull();
  });
});

describe("canonical CSV normalization", () => {
  it("zones wall-clock date and time into UTC instants", () => {
    const { normalized } = normalizeSetmoreRecord(setmoreCsvRowToCanonical(csvRow()), ctx);
    expect(normalized.appointmentDate).toBe("2025-12-01");
    // 05:30 PST = 13:30 UTC
    expect(normalized.startAt).toBe("2025-12-01T13:30:00.000Z");
    expect(normalized.endAt).toBe("2025-12-01T14:30:00.000Z");
    expect(normalized.durationMinutes).toBe(60);
    expect(normalized.timezone).toBe(TZ);
  });

  it("parses decimal Cost as listed price in cents and says so", () => {
    const { normalized, issues } = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(csvRow()),
      ctx
    );
    expect(normalized.listedPriceCents).toBe(8075);
    expect(normalized.currency).toBe("USD");
    expect(issues.find((i) => i.code === "listed_price_only")?.severity).toBe("info");
  });

  it("carries the source status through without interpreting it", () => {
    const { normalized } = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(csvRow({ Status: "Cancelled " })),
      ctx
    );
    // Trimmed, but NOT translated — canonical mapping is org-scoped data.
    expect(normalized.sourceStatus).toBe("Cancelled");
  });

  it("flags a blank status instead of assuming confirmed", () => {
    const { normalized, issues } = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(csvRow({ Status: "" })),
      ctx
    );
    expect(normalized.sourceStatus).toBeUndefined();
    expect(issues.some((i) => i.code === "missing_status")).toBe(true);
  });

  it("blocks on unparseable date, time, trainer, service and money", () => {
    const codes = (row: Record<string, string>) =>
      normalizeSetmoreRecord(setmoreCsvRowToCanonical(row), ctx).issues.map((i) => i.code);
    expect(codes(csvRow({ "Appointment date": "Dec 1st" }))).toContain("invalid_date");
    expect(codes(csvRow({ "Appointment time": "5:30" }))).toContain("invalid_time");
    expect(codes(csvRow({ "Team member": "" }))).toContain("missing_trainer");
    expect(codes(csvRow({ "Service/class/event": "" }))).toContain("missing_service");
    expect(codes(csvRow({ Cost: "eighty" }))).toContain("invalid_money");
  });

  it("lower-cases client email and warns when it is absent", () => {
    const withEmail = normalizeSetmoreRecord(setmoreCsvRowToCanonical(csvRow()), ctx);
    expect(withEmail.normalized.sourceClientEmail).toBe("sample.client@example.com");
    const without = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(csvRow({ Email: "" })),
      ctx
    );
    expect(without.issues.some((i) => i.code === "missing_client_email")).toBe(true);
  });

  it("preserves unrecognized columns through the transport adapter", () => {
    const result = setmoreCsvAdapter.normalizeRow(
      csvRow({ "Mystery Column": "keep me" }),
      ctx
    );
    expect(result.normalized.extra?.["Mystery Column"]).toBe("keep me");
    expect(result.issues.some((i) => i.code === "unrecognized_columns")).toBe(true);
  });
});

describe("canonical API normalization", () => {
  const apiAppointment = {
    key: "APIKEY01",
    start_time: "2025-12-01T13:30Z",
    end_time: "2025-12-01T14:30Z",
    duration: 60,
    staff_key: "staff_jo",
    service_key: "svc_private",
    customer_key: "cust_1",
    cost: "1000",
    currency: "USD",
    label: "No Label",
  };

  it("derives the organization-local date from the UTC instant", () => {
    const { normalized } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical(apiAppointment),
      ctx
    );
    expect(normalized.startAt).toBe("2025-12-01T13:30:00.000Z");
    expect(normalized.appointmentDate).toBe("2025-12-01");
    expect(normalized.durationMinutes).toBe(60);
  });

  it("NEVER infers a status the API does not provide", () => {
    const { normalized, issues } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical(apiAppointment),
      ctx
    );
    expect(normalized.sourceStatus).toBeUndefined();
    const issue = issues.find((i) => i.code === "status_not_provided_by_source");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
    // The label must not leak into status.
    expect(normalized.extra?.setmore_label).toBe("No Label");
  });

  it("refuses to map cost while the unit is unverified", () => {
    const { normalized, issues } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical(apiAppointment),
      ctx
    );
    expect(normalized.listedPriceCents).toBeUndefined();
    expect(issues.some((i) => i.code === "unverified_cost_unit")).toBe(true);
    // The raw value survives as evidence.
    expect(normalized.extra?.setmore_api_cost_raw).toBe("1000");
  });

  it("maps cost once an operator declares the unit", () => {
    const asCents = normalizeSetmoreRecord(setmoreApiAppointmentToCanonical(apiAppointment), {
      ...ctx,
      apiCostUnit: "cents",
    });
    expect(asCents.normalized.listedPriceCents).toBe(1000);

    const asDollars = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical(apiAppointment),
      { ...ctx, apiCostUnit: "dollars" }
    );
    expect(asDollars.normalized.listedPriceCents).toBe(100_000);
  });

  it("keeps external keys for alias-based identity resolution", () => {
    const { normalized, issues } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical(apiAppointment),
      ctx
    );
    expect(normalized.extra?.setmore_staff_key).toBe("staff_jo");
    expect(normalized.extra?.setmore_service_key).toBe("svc_private");
    expect(normalized.externalClientId).toBe("cust_1");
    // A key without a name is resolvable, so it warns rather than blocks.
    expect(issues.some((i) => i.code === "trainer_name_absent")).toBe(true);
    expect(issues.some((i) => i.code === "missing_trainer")).toBe(false);
  });

  it("blocks when neither a name nor an external key identifies the trainer", () => {
    const { issues } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({ ...apiAppointment, staff_key: undefined }),
      ctx
    );
    expect(issues.some((i) => i.code === "missing_trainer")).toBe(true);
  });

  it("prefers instants over the reported duration and reports disagreement", () => {
    const { normalized, issues } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({ ...apiAppointment, duration: 45 }),
      ctx
    );
    expect(normalized.durationMinutes).toBe(60);
    expect(issues.some((i) => i.code === "duration_disagreement")).toBe(true);
  });

  it("falls back to duration when end_time is missing", () => {
    const { normalized } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({ ...apiAppointment, end_time: undefined }),
      ctx
    );
    expect(normalized.durationMinutes).toBe(60);
    expect(normalized.endAt).toBe("2025-12-01T14:30:00.000Z");
  });

  it("blocks when neither end_time nor duration is usable", () => {
    const { issues } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({
        ...apiAppointment,
        end_time: undefined,
        duration: undefined,
      }),
      ctx
    );
    expect(issues.some((i) => i.code === "missing_duration")).toBe(true);
  });

  it("reads embedded customer details when customerDetails was requested", () => {
    const { normalized } = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({
        ...apiAppointment,
        customer: {
          firstname: "Sample",
          lastname: "Client",
          email_id: "Sample.Client@example.com",
          cell_phone: "5415550100",
        },
      }),
      ctx
    );
    expect(normalized.sourceClientName).toBe("Sample Client");
    expect(normalized.sourceClientEmail).toBe("sample.client@example.com");
    expect(normalized.sourceClientPhone).toBe("5415550100");
  });
});

describe("the two origins agree where they can", () => {
  it("produces the same instant, duration and date for the same appointment", () => {
    const fromCsv = normalizeSetmoreRecord(setmoreCsvRowToCanonical(csvRow()), ctx).normalized;
    const fromApi = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({
        key: "ABCDE123",
        start_time: "2025-12-01T13:30Z",
        end_time: "2025-12-01T14:30Z",
        staff_key: "staff_jo",
        service_key: "svc_private",
      }),
      ctx
    ).normalized;

    expect(fromApi.startAt).toBe(fromCsv.startAt);
    expect(fromApi.endAt).toBe(fromCsv.endAt);
    expect(fromApi.durationMinutes).toBe(fromCsv.durationMinutes);
    expect(fromApi.appointmentDate).toBe(fromCsv.appointmentDate);
    expect(fromApi.externalAppointmentId).toBe(fromCsv.externalAppointmentId);
  });

  it("keeps status asymmetric — CSV has it, the API does not", () => {
    const fromCsv = normalizeSetmoreRecord(setmoreCsvRowToCanonical(csvRow()), ctx).normalized;
    const fromApi = normalizeSetmoreRecord(
      setmoreApiAppointmentToCanonical({
        key: "ABCDE123",
        start_time: "2025-12-01T13:30Z",
        end_time: "2025-12-01T14:30Z",
        staff_key: "s",
        service_key: "v",
      }),
      ctx
    ).normalized;
    expect(fromCsv.sourceStatus).toBe("Confirmed");
    expect(fromApi.sourceStatus).toBeUndefined();
  });
});

describe("occurrence identity", () => {
  it("keys on external id plus start, because Booking IDs identify series", () => {
    const a = setmoreOccurrenceKey({ externalAppointmentId: "ABCDE123", startAt: "2025-12-01T13:30:00.000Z" });
    const b = setmoreOccurrenceKey({ externalAppointmentId: "ABCDE123", startAt: "2025-12-08T13:30:00.000Z" });
    expect(a).not.toBe(b);
    expect(a).toBe("abcde123|2025-12-01T13:30:00.000Z");
  });

  it("returns null when identity is incomplete", () => {
    expect(setmoreOccurrenceKey({ startAt: "2025-12-01T13:30:00.000Z" })).toBeNull();
    expect(setmoreOccurrenceKey({ externalAppointmentId: "ABCDE123" })).toBeNull();
  });
});

describe("instantToZonedDate", () => {
  it("assigns the organization-local calendar date across a UTC day boundary", () => {
    // 2026-01-01T02:00Z is still 2025-12-31 in Los Angeles.
    expect(instantToZonedDate("2026-01-01T02:00:00.000Z", TZ)).toBe("2025-12-31");
    expect(instantToZonedDate("2026-01-01T02:00:00.000Z", "UTC")).toBe("2026-01-01");
  });
});

describe("statusAvailability is a property of the transport", () => {
  it("marks a record whose origin cannot supply status", () => {
    const record: SetmoreCanonicalRecord = {
      origin: "api",
      startInstantRaw: "2025-12-01T13:30Z",
      durationMinutesRaw: 60,
      staffKeyRaw: "s",
      serviceKeyRaw: "v",
      statusAvailability: "not_provided_by_source",
    };
    const { issues } = normalizeSetmoreRecord(record, ctx);
    expect(issues.some((i) => i.code === "status_not_provided_by_source")).toBe(true);
    expect(issues.some((i) => i.code === "missing_status")).toBe(false);
  });
});

describe("the August 2026 export format (23 columns)", () => {
  it("maps Customer ID to the external client identity", () => {
    const { normalized } = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(csvRow({ "Customer ID": "CUST00042" })),
      ctx
    );
    expect(normalized.externalClientId).toBe("CUST00042");
  });

  it("recognizes the three new columns instead of warning on every row", () => {
    const { issues } = normalizeSetmoreRecord(
      setmoreCsvRowToCanonical(
        csvRow({ "Customer ID": "C1", "Company Name": "", "Meeting Type": "1 on 1" })
      ),
      ctx
    );
    expect(issues.some((i) => i.code === "unrecognized_columns")).toBe(false);
  });

  it("still detects the 20-column December format unchanged", () => {
    const detect = setmoreCsvAdapter.detect(Object.keys(csvRow()));
    expect(detect).toBeGreaterThan(0.7);
  });
});
