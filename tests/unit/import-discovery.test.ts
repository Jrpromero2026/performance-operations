import { describe, expect, it } from "vitest";
import {
  discoverFromCsv,
  serviceAliasGroup,
  suggestColumnMappings,
} from "@/lib/imports/discovery";
import type { ServiceLookup, TrainerLookup } from "@/lib/imports/matching";

/**
 * Setup discovery is a READ-ONLY projection over the shipped parser,
 * adapter registry, and matching engine. These tests pin the projection
 * behaviour — aggregation, match resolution, conservative alias
 * clustering — and the guarantee that discovery never invents an entity
 * the file did not contain.
 */

const SETMORE_HEADERS =
  "Appointment date,Appointment time,Service/class/event,Team member,Status,Booking ID,Cost,Customer name,Email";

function setmoreCsv(rows: string[]): string {
  return [SETMORE_HEADERS, ...rows].join("\n");
}

/**
 * `D MMM YYYY` dates and 12-hour ranges, per the observed Setmore schema
 * (docs/schemas/setmore-observed-schema.md).
 */
const ROWS = [
  "1 Mar 2026,9:00 AM - 10:00 AM,Personal Training,JR Romero,Completed,B1,80.00,Alice,alice@example.com",
  "1 Mar 2026,10:00 AM - 11:00 AM,Personal Training,JR Romero,Completed,B2,80.00,Bob,bob@example.com",
  "2 Mar 2026,9:00 AM - 10:00 AM,Personal Training 60,Amanda,Completed,B3,80.00,Cara,cara@example.com",
  "3 Mar 2026,11:00 AM - 12:00 PM,Nutrition Coaching,Kyra,Completed,B4,60.00,Dan,dan@example.com",
  "4 Mar 2026,1:00 PM - 2:00 PM,PACK Training,JR Romero,Cancelled,B5,40.00,Eve,eve@example.com",
];

describe("discovery: source detection and shape", () => {
  it("detects the Setmore adapter and does not demand column mapping", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.adapter?.source).toBe("setmore");
    expect(report.requiresColumnMapping).toBe(false);
    expect(report.rowCount).toBe(5);
  });

  it("reports the date range covered by the export", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.dateRange).toEqual({ from: "2026-03-01", to: "2026-03-04" });
  });

  it("flags personal-data columns without exposing their values", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.sensitiveColumns).toContain("Email");
    // Discovery aggregates; it never carries client rows into its report.
    expect(JSON.stringify(report)).not.toContain("Alice");
    expect(JSON.stringify(report)).not.toContain("alice@example.com");
  });
});

describe("discovery: trainers", () => {
  it("aggregates appointment counts per trainer, busiest first", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.trainers.map((t) => [t.sourceName, t.appointmentCount])).toEqual([
      ["JR Romero", 3],
      ["Amanda", 1],
      ["Kyra", 1],
    ]);
  });

  it("suggests create for every trainer when the organization is empty", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.trainers.every((t) => t.suggestedAction === "create")).toBe(true);
    expect(report.totals.trainersNew).toBe(3);
  });

  it("links a trainer that already exists instead of proposing a duplicate", () => {
    const existing: TrainerLookup[] = [
      { id: "t1", displayName: "JR Romero", email: null, sourceId: null, aliases: [] },
    ];
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: existing,
      services: [],
    });
    const jr = report.trainers.find((t) => t.sourceName === "JR Romero");
    expect(jr?.existingId).toBe("t1");
    expect(jr?.suggestedAction).toBe("linked");
    expect(report.totals.trainersNew).toBe(2);
  });

  it("offers a merge candidate rather than auto-matching a weak name", () => {
    const existing: TrainerLookup[] = [
      { id: "t9", displayName: "Amanda Romero", email: null, sourceId: null, aliases: [] },
    ];
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: existing,
      services: [],
    });
    const jr = report.trainers.find((t) => t.sourceName === "JR Romero");
    // Shares the last token "romero" — a candidate, never an auto-match.
    expect(jr?.existingId).toBeNull();
    expect(jr?.suggestedAction).toBe("merge");
    expect(jr?.candidates.map((c) => c.id)).toContain("t9");
  });
});

describe("discovery: services and aliases", () => {
  it("aggregates services observed in the file", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.services.map((s) => s.sourceName).sort()).toEqual([
      "Nutrition Coaching",
      "PACK Training",
      "Personal Training",
      "Personal Training 60",
    ]);
  });

  it("clusters duration variants of one service as alias candidates", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    const cluster = report.aliasClusters.find((c) =>
      c.members.includes("Personal Training")
    );
    expect(cluster?.members).toEqual(["Personal Training", "Personal Training 60"]);
    expect(cluster?.suggestedCanonical).toBe("Personal Training 60");
    expect(cluster?.totalAppointments).toBe(3);
  });

  it("never clusters distinct services together", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    for (const cluster of report.aliasClusters) {
      expect(cluster.members).not.toContain("Nutrition Coaching");
      expect(cluster.members).not.toContain("PACK Training");
    }
  });

  it("links services that already exist by alias", () => {
    const existing: ServiceLookup[] = [
      {
        id: "s1",
        internalName: "personal-training",
        displayName: "Personal Training",
        aliases: ["personal training 60"],
        departmentId: null,
      },
    ];
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: existing,
    });
    const pt60 = report.services.find((s) => s.sourceName === "Personal Training 60");
    expect(pt60?.existingId).toBe("s1");
    expect(pt60?.suggestedAction).toBe("linked");
  });
});

describe("serviceAliasGroup", () => {
  it("reduces duration variants to the same core", () => {
    expect(serviceAliasGroup("Personal Training 60")).toBe(
      serviceAliasGroup("60 Min Personal Training")
    );
    expect(serviceAliasGroup("Personal Training")).toBe(
      serviceAliasGroup("Personal Training 90 minutes")
    );
  });

  it("keeps genuinely different services apart", () => {
    expect(serviceAliasGroup("Personal Training")).not.toBe(
      serviceAliasGroup("Nutrition Coaching")
    );
  });

  it("does not expand abbreviations, which carry business meaning", () => {
    // "PT" may or may not mean Personal Training at a given gym. Discovery
    // must not decide that; the owner merges these explicitly.
    expect(serviceAliasGroup("PT")).not.toBe(serviceAliasGroup("Personal Training"));
  });
});

describe("discovery: statuses and duplicates", () => {
  it("counts source statuses without canonicalizing them", () => {
    const report = discoverFromCsv({
      csvText: setmoreCsv(ROWS),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.statuses).toEqual([
      { sourceStatus: "Completed", count: 4 },
      { sourceStatus: "Cancelled", count: 1 },
    ]);
  });

  it("counts repeated occurrence keys within the file", () => {
    const withDuplicate = [...ROWS, ROWS[0]];
    const report = discoverFromCsv({
      csvText: setmoreCsv(withDuplicate),
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.duplicateCandidates).toBe(1);
  });
});

describe("discovery: generic CSV fallback", () => {
  const GENERIC = [
    "Date,Staff,Appointment Type,State,Client Email",
    "2026-03-01,Jane Doe,Strength Session,completed,a@example.com",
    "2026-03-02,Jane Doe,Strength Session,completed,b@example.com",
  ].join("\n");

  it("asks for column mapping when no adapter recognises the headers", () => {
    const report = discoverFromCsv({
      csvText: GENERIC,
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.adapter).toBeNull();
    expect(report.requiresColumnMapping).toBe(true);
  });

  it("still discovers trainers and services from the suggested mapping", () => {
    const report = discoverFromCsv({
      csvText: GENERIC,
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
    });
    expect(report.trainers.map((t) => t.sourceName)).toEqual(["Jane Doe"]);
    expect(report.services.map((s) => s.sourceName)).toEqual(["Strength Session"]);
  });

  it("treats a confirmed mapping as settled", () => {
    const report = discoverFromCsv({
      csvText: GENERIC,
      organizationTimezone: "America/Los_Angeles",
      trainers: [],
      services: [],
      mappings: suggestColumnMappings([
        "Date",
        "Staff",
        "Appointment Type",
        "State",
        "Client Email",
      ]),
    });
    expect(report.requiresColumnMapping).toBe(false);
  });
});

describe("suggestColumnMappings", () => {
  it("proposes canonical fields from header names", () => {
    const mappings = suggestColumnMappings([
      "Date",
      "Staff",
      "Appointment Type",
      "State",
      "Client Email",
    ]);
    expect(mappings["Date"]).toBe("appointment_date");
    expect(mappings["Staff"]).toBe("trainer_name");
    expect(mappings["Appointment Type"]).toBe("service_name");
    expect(mappings["State"]).toBe("status");
    expect(mappings["Client Email"]).toBe("client_email");
  });

  it("never proposes the same canonical field twice", () => {
    const mappings = suggestColumnMappings(["Trainer", "Coach", "Staff Member"]);
    const assigned = Object.values(mappings).filter((f) => f !== "ignore");
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it("marks unrecognised columns as ignore rather than guessing", () => {
    const mappings = suggestColumnMappings(["Whatever Column"]);
    expect(mappings["Whatever Column"]).toBe("ignore");
  });
});
