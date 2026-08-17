import { describe, expect, it } from "vitest";
import {
  assessCostUnit,
  assessOccurrenceIdentity,
  assessStatus,
  buildVerificationReport,
  observeFields,
} from "@/lib/sources/setmore/verify";

const appt = (over: Record<string, unknown> = {}) => ({
  key: "APT001",
  start_time: "2025-12-01T17:30Z",
  end_time: "2025-12-01T18:30Z",
  duration: 60,
  staff_key: "staff_1",
  service_key: "svc_1",
  customer_key: "cust_1",
  cost: 80.75,
  currency: "USD",
  label: "No Label",
  comment: "Client mentioned a knee injury and their home address",
  ...over,
});

describe("redaction — the property that must never regress", () => {
  it("never emits values for identifying or free-text fields", () => {
    const fields = observeFields([
      appt({
        customer: { firstname: "Jane", lastname: "Doe", email_id: "jane@example.com" },
        phone: "5415550100",
      }),
    ]);
    const byName = new Map(fields.map((f) => [f.field, f]));
    for (const field of ["customer_key", "staff_key", "service_key", "key", "comment", "customer", "phone"]) {
      expect(byName.get(field)?.sampleValues, `${field} must be redacted`).toBeNull();
    }
  });

  it("emits values only for the structural allowlist", () => {
    const fields = observeFields([appt()]);
    const withValues = fields.filter((f) => f.sampleValues !== null).map((f) => f.field);
    expect(withValues.sort()).toEqual([
      "cost",
      "currency",
      "duration",
      "end_time",
      "label",
      "start_time",
    ]);
  });

  it("redacts an unrecognized new field by default rather than failing open", () => {
    // The allowlist must default to hiding, so a future Setmore field
    // carrying PII cannot leak simply because we did not anticipate it.
    const fields = observeFields([appt({ client_home_address: "12 Elm St" })]);
    const field = fields.find((f) => f.field === "client_home_address")!;
    expect(field.sampleValues).toBeNull();
    expect(field.presentInRecords).toBe(1);
  });

  it("still reports structure for redacted fields", () => {
    const fields = observeFields([appt({ customer_key: "a" }), appt({ customer_key: "b" })]);
    const field = fields.find((f) => f.field === "customer_key")!;
    expect(field.distinctCount).toBe(2);
    expect(field.types).toEqual(["string"]);
  });
});

describe("status detection", () => {
  it("confirms the documented gap when no status-like field exists", () => {
    const finding = assessStatus(observeFields([appt()]));
    expect(finding.verdict).toBe("no_status_field");
    expect(finding.statusFieldPresent).toBe(false);
    expect(finding.explanation).toMatch(/CSV export stays authoritative/);
    expect(finding.explanation).toMatch(/Do NOT map `label`/);
  });

  it("flags a candidate status field as a contract change, not a green light", () => {
    const finding = assessStatus(observeFields([appt({ appointment_status: "completed" })]));
    expect(finding.verdict).toBe("possible_status_field");
    expect(finding.statusLikeFields).toContain("appointment_status");
    expect(finding.explanation).toMatch(/CONTRACT CHANGE/);
    expect(finding.explanation).toMatch(/must be confirmed/);
  });

  it("does not mistake start_time or end_time for status", () => {
    const finding = assessStatus(observeFields([appt()]));
    expect(finding.statusLikeFields).toEqual([]);
  });

  it("surfaces label values without treating them as status", () => {
    const finding = assessStatus(observeFields([appt({ label: "No Label" })]));
    expect(finding.labelValues).toContain("No Label");
    expect(finding.statusFieldPresent).toBe(false);
  });
});

describe("occurrence identity", () => {
  it("detects a series-level key when one key spans two starts", () => {
    const finding = assessOccurrenceIdentity([
      appt({ key: "SERIES1", start_time: "2025-12-01T17:30Z" }),
      appt({ key: "SERIES1", start_time: "2025-12-08T17:30Z" }),
    ]);
    expect(finding.verdict).toBe("series_level");
    expect(finding.keysWithMultipleStarts).toBe(1);
    expect(finding.explanation).toMatch(/must remain \(key \+ start instant\)/);
  });

  it("refuses to conclude occurrence-uniqueness from a window with no recurrence", () => {
    const finding = assessOccurrenceIdentity([
      appt({ key: "A", start_time: "2025-12-01T17:30Z" }),
      appt({ key: "B", start_time: "2025-12-02T17:30Z" }),
    ]);
    // The honest answer: consistent with, but not proof of.
    expect(finding.verdict).toBe("inconclusive");
    expect(finding.explanation).toMatch(/does not prove it/);
  });

  it("is inconclusive rather than confident on an empty window", () => {
    const finding = assessOccurrenceIdentity([]);
    expect(finding.verdict).toBe("inconclusive");
    expect(finding.distinctKeys).toBe(0);
  });
});

describe("cost unit inference", () => {
  it("treats a fractional value as decisive proof of dollars", () => {
    const finding = assessCostUnit([appt({ cost: 80.75 })], [{ cost: 80.75 }]);
    expect(finding.recommendation).toBe("dollars");
    expect(finding.explanation).toMatch(/integer-cents representation cannot produce/);
  });

  it("infers cents from a ~100x gap against the service catalogue", () => {
    const finding = assessCostUnit(
      [appt({ cost: 8000 }), appt({ cost: 6400 })],
      [{ cost: 80 }, { cost: 64 }]
    );
    expect(finding.recommendation).toBe("cents");
    expect(finding.explanation).toMatch(/signature of appointments in cents/);
  });

  it("infers dollars when both endpoints agree in magnitude", () => {
    const finding = assessCostUnit([appt({ cost: 80 })], [{ cost: 80 }]);
    expect(finding.recommendation).toBe("dollars");
  });

  it("stays inconclusive rather than guessing when the signal is weak", () => {
    const finding = assessCostUnit([appt({ cost: 8000 })], []);
    expect(finding.recommendation).toBe("inconclusive");
    expect(finding.explanation).toMatch(/NOT mapped to a price/);
  });

  it("is inconclusive when no positive cost was returned", () => {
    const finding = assessCostUnit([appt({ cost: 0 })], [{ cost: 80 }]);
    expect(finding.recommendation).toBe("inconclusive");
  });
});

describe("assembled report", () => {
  const build = (appointments: Record<string, unknown>[], services: Record<string, unknown>[] = []) =>
    buildVerificationReport({
      window: { startDate: "2025-12-01", endDate: "2025-12-31" },
      appointments,
      staff: [{ key: "staff_1" }],
      services,
      pagesFetched: 1,
      moreAvailable: false,
      observedPageSize: appointments.length,
      servicesTruncated: false,
      staffTruncated: false,
      rateLimitHeadersObserved: false,
      tokenLifetimeSeconds: 604_739,
    });

  it("warns loudly that an empty window proves nothing", () => {
    const report = build([]);
    expect(report.appointmentCount).toBe(0);
    expect(report.nextActions[0]).toMatch(/an empty window proves nothing/);
  });

  it("always ends by requiring reconciliation before lifting the gate", () => {
    const report = build([appt()]);
    const last = report.nextActions[report.nextActions.length - 1];
    expect(last).toMatch(/SETMORE_API_LIVE_VERIFIED/);
    expect(report.nextActions.some((a) => /reconciliation over one full historical month/.test(a))).toBe(
      true
    );
  });

  it("recommends keeping the hybrid strategy when status is absent", () => {
    const report = build([appt()]);
    expect(report.nextActions.some((a) => /CSV export remains authoritative/.test(a))).toBe(true);
  });

  it("names the cost unit to set once it is confident", () => {
    const report = build([appt({ cost: 8000 })], [{ cost: 80 }]);
    expect(report.nextActions.some((a) => /`cost_unit` = "cents"/.test(a))).toBe(true);
  });

  it("carries no client identity anywhere in the serialized report", () => {
    const report = build([
      appt({
        customer: { firstname: "Jane", lastname: "Doe", email_id: "jane@example.com" },
        comment: "lives at 12 Elm St",
      }),
    ]);
    const serialized = JSON.stringify(report);
    for (const secret of ["Jane", "Doe", "jane@example.com", "Elm St", "cust_1"]) {
      expect(serialized, `report leaked ${secret}`).not.toContain(secret);
    }
  });
});

describe("partial reads must never look complete", () => {
  const buildPartial = (over: Partial<Parameters<typeof buildVerificationReport>[0]> = {}) =>
    buildVerificationReport({
      window: { startDate: "2025-12-01", endDate: "2025-12-31" },
      appointments: [appt()],
      staff: [{ key: "s" }],
      services: [{ key: "v" }],
      pagesFetched: 5,
      moreAvailable: false,
      observedPageSize: 50,
      servicesTruncated: false,
      staffTruncated: false,
      rateLimitHeadersObserved: false,
      tokenLifetimeSeconds: 3_540,
      ...over,
    });

  it("says the counts are a floor when the cursor was still set", () => {
    const report = buildPartial({ moreAvailable: true });
    const warning = report.nextActions.find((a) => /floor, not a total/.test(a));
    expect(warning).toBeDefined();
    expect(warning).toMatch(/stopped after 5 page\(s\)/);
    // The exact confusion this prevents: reading a short page as evidence
    // that the API is missing data.
    expect(warning).toMatch(/before concluding anything about API completeness/);
  });

  it("does not cry wolf when the read was complete", () => {
    const report = buildPartial({ moreAvailable: false });
    expect(report.nextActions.some((a) => /floor, not a total/.test(a))).toBe(false);
  });

  it("warns separately when the service catalogue was truncated", () => {
    const report = buildPartial({ servicesTruncated: true });
    expect(report.nextActions.some((a) => /service catalogue was truncated/.test(a))).toBe(true);
  });

  it("carries the window through to the report", () => {
    const report = buildPartial();
    expect(report.window).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  });

  it("preserves the observed page size, which the docs never state", () => {
    expect(buildPartial({ observedPageSize: 50 }).observedPageSize).toBe(50);
  });
});
