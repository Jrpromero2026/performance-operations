import { describe, expect, it } from "vitest";
import type { NormalizedRow } from "@/lib/imports/types";
import {
  assessApiReadiness,
  occurrenceKeyFor,
  reconcileSetmoreSources,
  type ReconciliationInput,
} from "@/lib/sources/setmore/reconcile";

function row(overrides: Partial<NormalizedRow> = {}): NormalizedRow {
  return {
    externalAppointmentId: "ABCDE123",
    startAt: "2025-12-01T13:30:00.000Z",
    endAt: "2025-12-01T14:30:00.000Z",
    durationMinutes: 60,
    sourceTrainerName: "Jo Trainer",
    sourceServiceName: "Private Training",
    sourceClientName: "Sample Client",
    sourceClientEmail: "sample.client@example.com",
    listedPriceCents: 8075,
    ...overrides,
  };
}

/** CSV rows carry a status; API rows structurally cannot. */
const csvRow = (o: Partial<NormalizedRow> = {}) => row({ sourceStatus: "Confirmed", ...o });
const apiRow = (o: Partial<NormalizedRow> = {}) => row(o);

const input = (reference: string, r: NormalizedRow): ReconciliationInput => ({
  reference,
  row: r,
});

describe("occurrenceKeyFor", () => {
  it("requires both an external id and a start instant", () => {
    expect(occurrenceKeyFor(row())).toBe("abcde123|2025-12-01T13:30:00.000Z");
    expect(occurrenceKeyFor(row({ externalAppointmentId: undefined }))).toBeNull();
    expect(occurrenceKeyFor(row({ startAt: undefined }))).toBeNull();
  });

  it("is case-insensitive on the external id", () => {
    expect(occurrenceKeyFor(row({ externalAppointmentId: "abcde123" }))).toBe(
      occurrenceKeyFor(row({ externalAppointmentId: "ABCDE123" }))
    );
  });
});

describe("reconcileSetmoreSources", () => {
  it("reports MATCH when every comparable field agrees", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow())],
      csv: [input("csv-1", csvRow())],
    });
    expect(report.summary.match).toBe(1);
    expect(report.summary.mismatch).toBe(0);
    expect(report.entries[0].verdict).toBe("match");
    expect(report.entries[0].apiReference).toBe("api-1");
    expect(report.entries[0].csvReference).toBe("csv-1");
  });

  it("does NOT treat the API's missing status as a mismatch", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow())],
      csv: [input("csv-1", csvRow({ sourceStatus: "Cancelled" }))],
    });
    expect(report.entries[0].verdict).toBe("match");
    const status = report.entries[0].fields.find((f) => f.field === "status")!;
    expect(status.verdict).toBe("unavailable_in_api");
    expect(status.csvValue).toBe("cancelled");
    expect(report.summary.statusUnverifiable).toBe(1);
  });

  it("reports MISMATCH with the differing field names", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow({ listedPriceCents: 6400, durationMinutes: 45 }))],
      csv: [input("csv-1", csvRow())],
    });
    expect(report.entries[0].verdict).toBe("mismatch");
    expect(report.entries[0].differingFields.sort()).toEqual([
      "duration_minutes",
      "listed_price_cents",
    ]);
    expect(report.summary.differingFieldCounts.listed_price_cents).toBe(1);
  });

  it("classifies records present in only one source", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow({ externalAppointmentId: "ONLYAPI1" }))],
      csv: [input("csv-1", csvRow({ externalAppointmentId: "ONLYCSV1" }))],
    });
    expect(report.summary.apiOnly).toBe(1);
    expect(report.summary.csvOnly).toBe(1);
    expect(report.summary.match).toBe(0);
    const verdicts = report.entries.map((e) => e.verdict).sort();
    expect(verdicts).toEqual(["api_only", "csv_only"]);
  });

  it("distinguishes occurrences of one recurring series", () => {
    const week1 = "2025-12-01T13:30:00.000Z";
    const week2 = "2025-12-08T13:30:00.000Z";
    const report = reconcileSetmoreSources({
      api: [
        input("api-1", apiRow({ startAt: week1, endAt: "2025-12-01T14:30:00.000Z" })),
        input("api-2", apiRow({ startAt: week2, endAt: "2025-12-08T14:30:00.000Z" })),
      ],
      csv: [
        input("csv-1", csvRow({ startAt: week1, endAt: "2025-12-01T14:30:00.000Z" })),
        input("csv-2", csvRow({ startAt: week2, endAt: "2025-12-08T14:30:00.000Z" })),
      ],
    });
    // Same Booking ID, two occurrences — both align, neither collapses.
    expect(report.summary.match).toBe(2);
    expect(report.summary.ambiguousKeys).toEqual([]);
  });

  it("surfaces duplicate occurrence identity instead of silently de-duplicating", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow()), input("api-2", apiRow())],
      csv: [input("csv-1", csvRow())],
    });
    expect(report.summary.ambiguousKeys).toEqual(["abcde123|2025-12-01T13:30:00.000Z"]);
  });

  it("counts records that have no usable occurrence identity", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow({ externalAppointmentId: undefined }))],
      csv: [input("csv-1", csvRow({ startAt: undefined }))],
    });
    expect(report.summary.unkeyedApi).toBe(1);
    expect(report.summary.unkeyedCsv).toBe(1);
    expect(report.entries).toEqual([]);
  });

  it("is deterministic and order-independent", () => {
    const a = apiRow({ externalAppointmentId: "AAA" });
    const b = apiRow({ externalAppointmentId: "BBB" });
    const first = reconcileSetmoreSources({
      api: [input("1", a), input("2", b)],
      csv: [input("3", csvRow({ externalAppointmentId: "BBB" })), input("4", csvRow({ externalAppointmentId: "AAA" }))],
    });
    const second = reconcileSetmoreSources({
      api: [input("2", b), input("1", a)],
      csv: [input("4", csvRow({ externalAppointmentId: "AAA" })), input("3", csvRow({ externalAppointmentId: "BBB" }))],
    });
    expect(first.entries.map((e) => e.occurrenceKey)).toEqual(
      second.entries.map((e) => e.occurrenceKey)
    );
    expect(first.summary).toEqual(second.summary);
  });

  it("treats a field absent from both sources as neither equal nor different", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow({ sourceClientEmail: undefined, listedPriceCents: undefined }))],
      csv: [input("csv-1", csvRow({ sourceClientEmail: undefined, listedPriceCents: undefined }))],
    });
    const email = report.entries[0].fields.find((f) => f.field === "client_email")!;
    expect(email.verdict).toBe("absent_in_both");
    expect(report.entries[0].verdict).toBe("match");
  });
});

describe("assessApiReadiness", () => {
  it("requires a hybrid strategy while status is unavailable from the API", () => {
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow())],
      csv: [input("csv-1", csvRow())],
    });
    const assessment = assessApiReadiness(report);
    expect(assessment.hybridRequired).toBe(true);
    expect(assessment.apiCanReplaceCsv).toBe(false);
    expect(assessment.reasons[0]).toMatch(/Status is unavailable/);
  });

  it("refuses to declare readiness when nothing aligned", () => {
    const assessment = assessApiReadiness(
      reconcileSetmoreSources({ api: [], csv: [] })
    );
    expect(assessment.apiCanReplaceCsv).toBe(false);
    expect(assessment.reasons).toContain(
      "No appointments aligned between the two sources; nothing was verified."
    );
  });

  it("clears only when every source of doubt is resolved", () => {
    // A hypothetical future in which the API DOES carry status: both
    // sources agree on every field, so nothing blocks replacement.
    const report = reconcileSetmoreSources({
      api: [input("api-1", apiRow({ sourceStatus: "Confirmed" }))],
      csv: [input("csv-1", csvRow())],
    });
    const assessment = assessApiReadiness(report);
    expect(assessment.hybridRequired).toBe(false);
    expect(assessment.apiCanReplaceCsv).toBe(true);
    expect(assessment.reasons).toEqual([]);
  });

  it("names every unresolved problem, not just the first", () => {
    const report = reconcileSetmoreSources({
      api: [
        input("api-1", apiRow({ listedPriceCents: 1 })),
        input("api-2", apiRow({ externalAppointmentId: "ONLYAPI" })),
      ],
      csv: [
        input("csv-1", csvRow()),
        input("csv-2", csvRow({ externalAppointmentId: "ONLYCSV" })),
      ],
    });
    const { reasons } = assessApiReadiness(report);
    expect(reasons.some((r) => /only in the CSV/.test(r))).toBe(true);
    expect(reasons.some((r) => /only in the API/.test(r))).toBe(true);
    expect(reasons.some((r) => /disagree on/.test(r))).toBe(true);
    expect(reasons.some((r) => /Status is unavailable/.test(r))).toBe(true);
  });
});
