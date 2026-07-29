import { describe, expect, it } from "vitest";
import {
  classifyDuplicate,
  matchClient,
  matchService,
  matchTrainer,
  occurrenceKey,
  type ClientLookup,
  type ExistingOccurrence,
  type ServiceLookup,
  type TrainerLookup,
} from "@/lib/imports/matching";
import type { NormalizedRow } from "@/lib/imports/types";

const trainer = (over: Partial<TrainerLookup>): TrainerLookup => ({
  id: "t1",
  displayName: "Alex Fixture",
  email: null,
  sourceId: null,
  aliases: [],
  ...over,
});
const service = (over: Partial<ServiceLookup>): ServiceLookup => ({
  id: "s1",
  internalName: "signature-60",
  displayName: "Signature 60",
  aliases: [],
  departmentId: null,
  ...over,
});
const client = (over: Partial<ClientLookup>): ClientLookup => ({
  id: "c1",
  displayName: "Casey Sample",
  email: null,
  phone: null,
  sourceId: null,
  ...over,
});

describe("trainer matching priority", () => {
  it("matches an approved alias before name", () => {
    const trainers = [
      trainer({ id: "t1", displayName: "Alexandra Fixture", aliases: ["alex fixture"] }),
      trainer({ id: "t2", displayName: "Alex Other" }),
    ];
    const outcome = matchTrainer({ sourceTrainerName: "Alex Fixture" }, trainers);
    expect(outcome.matched?.id).toBe("t1");
    expect(outcome.method).toBe("alias");
  });

  it("matches exact email over name", () => {
    const trainers = [
      trainer({ id: "t1", displayName: "Someone Else", email: "a@x.test" }),
      trainer({ id: "t2", displayName: "Alex Fixture" }),
    ];
    const outcome = matchTrainer(
      { sourceTrainerName: "Nobody", sourceTrainerEmail: "A@x.test" },
      trainers
    );
    expect(outcome.matched?.id).toBe("t1");
    expect(outcome.method).toBe("email");
  });

  it("matches a unique exact name", () => {
    const outcome = matchTrainer({ sourceTrainerName: "alex  fixture" }, [
      trainer({}),
      trainer({ id: "t2", displayName: "Morgan Coach" }),
    ]);
    expect(outcome.matched?.id).toBe("t1");
    expect(outcome.method).toBe("exact_name");
  });

  it("sends ambiguous names to review with candidates, never auto-matching", () => {
    const trainers = [
      trainer({ id: "t1" }),
      trainer({ id: "t2", displayName: "Alex Fixture" }),
    ];
    const outcome = matchTrainer({ sourceTrainerName: "Alex Fixture" }, trainers);
    expect(outcome.matched).toBeNull();
    expect(outcome.requiresReview).toBe(true);
    expect(outcome.candidates).toHaveLength(2);
  });

  it("weak last-name similarity yields candidates only", () => {
    const outcome = matchTrainer({ sourceTrainerName: "Sam Fixture" }, [trainer({})]);
    expect(outcome.matched).toBeNull();
    expect(outcome.candidates.map((c) => c.id)).toEqual(["t1"]);
  });

  it("cross-organization matching is structurally impossible (empty lookup)", () => {
    // Lookups are built per organization; another org's trainers never appear.
    const outcome = matchTrainer({ sourceTrainerName: "Alex Fixture" }, []);
    expect(outcome.matched).toBeNull();
    expect(outcome.requiresReview).toBe(true);
  });
});

describe("service matching priority", () => {
  it("matches alias first", () => {
    const services = [
      service({ id: "s1", aliases: ["personal coaching | signature package - 12x60 min."] }),
      service({ id: "s2", displayName: "Other" }),
    ];
    const outcome = matchService(
      { sourceServiceName: "Personal Coaching | Signature Package - 12x60 min." },
      services
    );
    expect(outcome.matched?.id).toBe("s1");
    expect(outcome.method).toBe("alias");
  });

  it("falls back to exact internal/display name", () => {
    const outcome = matchService({ sourceServiceName: "Signature 60" }, [service({})]);
    expect(outcome.matched?.id).toBe("s1");
  });

  it("unknown services stay unmatched with suggestions", () => {
    const outcome = matchService({ sourceServiceName: "Signature Session Deluxe" }, [service({})]);
    expect(outcome.matched).toBeNull();
    expect(outcome.requiresReview).toBe(true);
    expect(outcome.candidates.map((c) => c.id)).toContain("s1");
  });
});

describe("client matching priority", () => {
  it("matches external source id first", () => {
    const clients = [client({ id: "c1", sourceId: "EXT9" }), client({ id: "c2" })];
    const outcome = matchClient({ externalClientId: "EXT9" }, clients);
    expect(outcome.matched?.id).toBe("c1");
    expect(outcome.method).toBe("source_id");
  });

  it("matches unique email, then phone", () => {
    const byEmail = matchClient(
      { sourceClientEmail: "casey.sample@example.test" },
      [client({ email: "Casey.Sample@example.test" })]
    );
    expect(byEmail.method).toBe("email");
    const byPhone = matchClient(
      { sourceClientPhone: "1-555-000-0001" },
      [client({ phone: "(555) 000-0001" })]
    );
    expect(byPhone.method).toBe("phone");
  });

  it("name alone never auto-matches — corroboration required", () => {
    const nameOnly = matchClient({ sourceClientName: "Casey Sample" }, [client({})]);
    expect(nameOnly.matched).toBeNull();
    expect(nameOnly.requiresReview).toBe(true);
    expect(nameOnly.candidates).toHaveLength(1);

    const corroborated = matchClient(
      { sourceClientName: "Casey Sample", sourceClientEmail: "c@x.test" },
      [client({ email: "c@x.test" })]
    );
    expect(corroborated.method).toBe("email");
  });

  it("ambiguous names go to review", () => {
    const outcome = matchClient({ sourceClientName: "Casey Sample" }, [
      client({ id: "c1" }),
      client({ id: "c2" }),
    ]);
    expect(outcome.matched).toBeNull();
    expect(outcome.candidates).toHaveLength(2);
  });
});

describe("duplicate classification", () => {
  const active = (over: Partial<ExistingOccurrence>): ExistingOccurrence => ({
    externalAppointmentId: "BK1",
    startAt: "2025-12-01T13:30:00.000Z",
    trainerId: "t1",
    serviceId: "s1",
    canonicalStatus: "scheduled",
    durationMinutes: 60,
    recordState: "active",
    ...over,
  });
  const staged = (over: Partial<Parameters<typeof classifyDuplicate>[0]> = {}) => ({
    externalAppointmentId: "BK1",
    startAt: "2025-12-01T13:30:00.000Z",
    matchedTrainerId: "t1",
    matchedServiceId: "s1",
    canonicalStatus: "scheduled",
    durationMinutes: 60,
    ...over,
  });

  it("classifies fresh rows as new", () => {
    expect(classifyDuplicate(staged(), [], new Set())).toBe("new");
  });

  it("same series id at a DIFFERENT start is NEW (recurring occurrences)", () => {
    const result = classifyDuplicate(
      staged({ startAt: "2025-12-08T13:30:00.000Z" }),
      [active({})],
      new Set()
    );
    expect(result).toBe("new");
  });

  it("identical posted occurrence is an exact duplicate", () => {
    expect(classifyDuplicate(staged(), [active({})], new Set())).toBe("exact_duplicate");
  });

  it("repeat within the same file is an exact duplicate", () => {
    const seen = new Set<string>([occurrenceKey(staged())!]);
    expect(classifyDuplicate(staged(), [], seen)).toBe("exact_duplicate");
  });

  it("same identity with changed status/duration is a source update", () => {
    const result = classifyDuplicate(
      staged({ canonicalStatus: "cancelled" }),
      [active({})],
      new Set()
    );
    expect(result).toBe("source_update");
  });

  it("same identity with a different trainer or service is a conflict", () => {
    expect(
      classifyDuplicate(staged({ matchedTrainerId: "t2" }), [active({})], new Set())
    ).toBe("conflict");
    expect(
      classifyDuplicate(staged({ matchedServiceId: "s2" }), [active({})], new Set())
    ).toBe("conflict");
  });

  it("re-import of a reversed occurrence is flagged previously_reversed", () => {
    const result = classifyDuplicate(
      staged(),
      [active({ recordState: "reversed" })],
      new Set()
    );
    expect(result).toBe("previously_reversed");
  });

  it("fingerprint fallback flags possible duplicates without external ids", () => {
    const result = classifyDuplicate(
      staged({ externalAppointmentId: undefined }),
      [active({ externalAppointmentId: null })],
      new Set()
    );
    expect(result).toBe("possible_duplicate");
  });
});
