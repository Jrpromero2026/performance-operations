import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv, rowToObject } from "@/lib/imports/csv";
import { detectAdapter, headerSignature } from "@/lib/imports/adapters";
import { setmoreAdapter } from "@/lib/imports/adapters/setmore";
import { createGenericAdapter } from "@/lib/imports/adapters/generic";
import {
  parseDayMonthYear,
  parseMoneyToCents,
  parseTimeOfDay,
  parseTimeRange,
  zonedDateTimeToUtcIso,
} from "@/lib/imports/values";

const CTX = { organizationTimezone: "America/Los_Angeles" };
const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "fixtures", name), "utf8");

function setmoreRows(name: string) {
  const parsed = parseCsv(fixture(name));
  return parsed.rows.map((row) => rowToObject(parsed.headers, row));
}

describe("value parsers", () => {
  it("parses D MMM YYYY dates strictly", () => {
    expect(parseDayMonthYear("1 Dec 2025")).toBe("2025-12-01");
    expect(parseDayMonthYear("23 Dec 2024")).toBe("2024-12-23");
    expect(parseDayMonthYear("32 Dec 2025")).toBeNull();
    expect(parseDayMonthYear("1 Foo 2025")).toBeNull();
    expect(parseDayMonthYear("2025-12-01")).toBeNull();
  });

  it("parses 12-hour and 24-hour times", () => {
    expect(parseTimeOfDay("05:30 AM")).toBe(330);
    expect(parseTimeOfDay("12:00 AM")).toBe(0);
    expect(parseTimeOfDay("12:30 PM")).toBe(750);
    expect(parseTimeOfDay("17:45")).toBe(1065);
    expect(parseTimeOfDay("25:00")).toBeNull();
    expect(parseTimeOfDay("junk")).toBeNull();
  });

  it("parses time ranges and flags midnight rollover", () => {
    const range = parseTimeRange("05:30 AM - 06:30 AM");
    expect(range).toMatchObject({ durationMinutes: 60, crossesMidnight: false });
    const overnight = parseTimeRange("11:30 PM - 12:30 AM");
    expect(overnight).toMatchObject({ durationMinutes: 60, crossesMidnight: true });
    expect(parseTimeRange("junk time")).toBeNull();
  });

  it("parses money to integer cents strictly", () => {
    expect(parseMoneyToCents("80.75")).toBe(8075);
    expect(parseMoneyToCents("64")).toBe(6400);
    expect(parseMoneyToCents("$1,234.50")).toBe(123450);
    expect(parseMoneyToCents("not-money")).toBeNull();
    expect(parseMoneyToCents("1.234")).toBeNull();
  });

  it("converts zoned wall time to UTC across DST", () => {
    // PST (UTC-8): Dec 1 2025 05:30 → 13:30Z
    expect(zonedDateTimeToUtcIso("2025-12-01", 330, "America/Los_Angeles")).toBe(
      "2025-12-01T13:30:00.000Z"
    );
    // PDT (UTC-7): Aug 1 2025 05:30 → 12:30Z
    expect(zonedDateTimeToUtcIso("2025-08-01", 330, "America/Los_Angeles")).toBe(
      "2025-08-01T12:30:00.000Z"
    );
  });
});

describe("setmore adapter (setmore-v1)", () => {
  it("detects the observed 20-column schema with high confidence", () => {
    const parsed = parseCsv(fixture("setmore-valid.csv"));
    const detection = detectAdapter(parsed.headers);
    expect(detection.adapter?.version).toBe("setmore-v1");
    expect(detection.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("does not claim generic files", () => {
    const parsed = parseCsv(fixture("generic-valid.csv"));
    expect(detectAdapter(parsed.headers).adapter).toBeNull();
  });

  it("normalizes a valid row completely", () => {
    const [row] = setmoreRows("setmore-valid.csv");
    const { normalized, issues } = setmoreAdapter.normalizeRow(row, CTX);
    expect(normalized.appointmentDate).toBe("2025-12-01");
    expect(normalized.startAt).toBe("2025-12-01T13:30:00.000Z");
    expect(normalized.durationMinutes).toBe(60);
    expect(normalized.sourceTrainerName).toBe("Alex Fixture");
    expect(normalized.sourceClientName).toBe("Casey Sample");
    expect(normalized.sourceClientEmail).toBe("casey.sample@example.test");
    expect(normalized.sourceServiceName).toContain("Signature Package");
    expect(normalized.listedPriceCents).toBe(6400);
    expect(normalized.externalAppointmentId).toBe("FIXAA001");
    expect(normalized.sourceStatus).toBe("Confirmed");
    expect(issues.filter((i) => i.severity === "blocking")).toEqual([]);
  });

  it("trims trailing-space statuses (`Cancelled `)", () => {
    const rows = setmoreRows("setmore-valid.csv");
    const cancelled = rows[2];
    const { normalized } = setmoreAdapter.normalizeRow(cancelled, CTX);
    expect(normalized.sourceStatus).toBe("Cancelled");
  });

  it("treats blank optional fields as warnings, not blockers", () => {
    const rows = setmoreRows("setmore-valid.csv");
    const noEmail = rows[4]; // Sam Placeholder has no phone/email
    const { issues } = setmoreAdapter.normalizeRow(noEmail, CTX);
    expect(issues.some((i) => i.code === "missing_client_email" && i.severity === "warning")).toBe(true);
    expect(issues.filter((i) => i.severity === "blocking")).toEqual([]);
  });

  it("raises blocking issues for invalid dates, times, and money", () => {
    const rows = setmoreRows("setmore-edge.csv");
    const badDate = setmoreAdapter.normalizeRow(rows[1], CTX);
    expect(badDate.issues.some((i) => i.code === "invalid_date" && i.severity === "blocking")).toBe(true);
    const badTime = setmoreAdapter.normalizeRow(rows[2], CTX);
    expect(badTime.issues.some((i) => i.code === "invalid_time" && i.severity === "blocking")).toBe(true);
    const badMoney = setmoreAdapter.normalizeRow(rows[3], CTX);
    expect(badMoney.issues.some((i) => i.code === "invalid_money" && i.severity === "blocking")).toBe(true);
  });

  it("preserves quoted commas/newlines and unknown statuses", () => {
    const rows = setmoreRows("setmore-edge.csv");
    const quoted = setmoreAdapter.normalizeRow(rows[0], CTX);
    expect(quoted.normalized.sourceServiceName).toBe("Coaching, Advanced | With, Commas");
    expect(quoted.normalized.sourceClientName).toBe("Sample, Casey");
    const unknownStatus = setmoreAdapter.normalizeRow(rows[4], CTX);
    expect(unknownStatus.normalized.sourceStatus).toBe("Rescheduled by staff");
  });

  it("stores formula-like cells as inert text", () => {
    const rows = setmoreRows("setmore-edge.csv");
    const formulaRow = setmoreAdapter.normalizeRow(rows[5], CTX);
    // stored verbatim, never evaluated; export escaping handles neutralization
    expect(formulaRow.normalized.sourceServiceName).toBe('=HYPERLINK("https://evil.example/x")');
  });

  it("flags midnight-crossing ranges as next-day with a warning", () => {
    const rows = setmoreRows("setmore-edge.csv");
    const overnight = setmoreAdapter.normalizeRow(rows[6], CTX);
    expect(overnight.normalized.durationMinutes).toBe(60);
    expect(overnight.issues.some((i) => i.code === "time_crosses_midnight")).toBe(true);
  });
});

describe("generic adapter (generic-v1)", () => {
  const mappings = {
    Date: "appointment_date",
    Start: "start_time",
    End: "end_time",
    Coach: "trainer_name",
    "Coach Email": "trainer_email",
    Member: "client_name",
    "Member Email": "client_email",
    "Session Type": "service_name",
    State: "status",
    Price: "listed_price",
    Ref: "external_appointment_id",
  } as const;

  function genericRows() {
    const parsed = parseCsv(fixture("generic-valid.csv"));
    return parsed.rows.map((row) => rowToObject(parsed.headers, row));
  }

  it("normalizes through a column mapping", () => {
    const adapter = createGenericAdapter({ ...mappings });
    const [row] = genericRows();
    const { normalized, issues } = adapter.normalizeRow(row, CTX);
    expect(normalized.appointmentDate).toBe("2025-12-01");
    expect(normalized.durationMinutes).toBe(60);
    expect(normalized.sourceTrainerName).toBe("Alex Fixture");
    expect(normalized.sourceServiceName).toBe("Signature 60");
    expect(normalized.listedPriceCents).toBe(6400);
    expect(normalized.externalAppointmentId).toBe("GEN-001");
    expect(issues.filter((i) => i.severity === "blocking")).toEqual([]);
  });

  it("blocks rows when required mappings are missing", () => {
    const adapter = createGenericAdapter({ Date: "appointment_date" });
    const [row] = genericRows();
    const { issues } = adapter.normalizeRow(row, CTX);
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("missing_trainer");
    expect(codes).toContain("missing_service");
    expect(codes).toContain("unsupported_schema");
  });

  it("requires an end time or duration alongside a start time", () => {
    const adapter = createGenericAdapter({
      Date: "appointment_date",
      Start: "start_time",
      Coach: "trainer_name",
      "Session Type": "service_name",
    });
    const [row] = genericRows();
    const { issues } = adapter.normalizeRow(row, CTX);
    expect(issues.some((i) => i.code === "missing_duration" && i.severity === "blocking")).toBe(true);
  });
});

describe("header signatures", () => {
  it("is stable under whitespace/case but order-sensitive", () => {
    expect(headerSignature(["A ", "b"])).toBe(headerSignature(["a", "B"]));
    expect(headerSignature(["a", "b"])).not.toBe(headerSignature(["b", "a"]));
  });
});
