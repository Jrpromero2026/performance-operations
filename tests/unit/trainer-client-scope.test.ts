import { describe, expect, it } from "vitest";
import {
  deriveTrainerClientScope,
  filterClientsToScope,
  trainerMayReadClient,
  type ScopeAppointment,
} from "@/lib/authz/trainer-client-scope";

const ORG_A = "org-a";
const ORG_B = "org-b";
const TRAINER_A = "trainer-a";
const TRAINER_B = "trainer-b";
const CLIENT_1 = "client-1";
const CLIENT_2 = "client-2";
const CLIENT_3 = "client-3";

function appointment(overrides: Partial<ScopeAppointment> = {}): ScopeAppointment {
  return {
    id: "appt-1",
    organizationId: ORG_A,
    recordState: "active",
    trainerId: TRAINER_A,
    clientId: CLIENT_1,
    ...overrides,
  };
}

function scopeFor(
  appointments: ScopeAppointment[],
  trainerId: string | null = TRAINER_A,
  orgs: string[] = [ORG_A]
) {
  return deriveTrainerClientScope({
    trainerId,
    memberOrganizationIds: orgs,
    appointments,
  });
}

describe("the happy path", () => {
  it("grants exactly the clients the trainer has appointments with", () => {
    const scope = scopeFor([
      appointment({ id: "a1", clientId: CLIENT_1 }),
      appointment({ id: "a2", clientId: CLIENT_2 }),
    ]);
    expect([...scope.clientIds].sort()).toEqual([CLIENT_1, CLIENT_2]);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(true);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_2)).toBe(true);
  });

  it("includes clients linked only through participant rows", () => {
    const scope = scopeFor([
      appointment({ clientId: null, participantClientIds: [CLIENT_2, CLIENT_3] }),
    ]);
    expect([...scope.clientIds].sort()).toEqual([CLIENT_2, CLIENT_3]);
  });

  it("includes clients from multi-trainer sessions the trainer was assigned to", () => {
    const scope = scopeFor([
      appointment({ trainerId: TRAINER_B, assignedTrainerIds: [TRAINER_A], clientId: CLIENT_1 }),
    ]);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(true);
  });

  it("does not duplicate a client seen across many appointments", () => {
    const scope = scopeFor([
      appointment({ id: "a1" }),
      appointment({ id: "a2" }),
      appointment({ id: "a3", participantClientIds: [CLIENT_1] }),
    ]);
    expect(scope.clientIds.size).toBe(1);
    expect(scope.byOrganization.get(ORG_A)!.size).toBe(1);
  });
});

describe("isolation — the reason this module exists", () => {
  it("NEVER grants Trainer A access to Trainer B's clients", () => {
    const scope = scopeFor([
      appointment({ id: "mine", trainerId: TRAINER_A, clientId: CLIENT_1 }),
      appointment({ id: "theirs", trainerId: TRAINER_B, clientId: CLIENT_2 }),
    ]);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(true);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_2)).toBe(false);
    expect(scope.clientIds.has(CLIENT_2)).toBe(false);
  });

  it("does not leak the other trainer's participants either", () => {
    const scope = scopeFor([
      appointment({
        id: "theirs",
        trainerId: TRAINER_B,
        clientId: CLIENT_2,
        participantClientIds: [CLIENT_3],
      }),
    ]);
    expect(scope.clientIds.size).toBe(0);
  });

  it("an assignment to a DIFFERENT trainer grants nothing", () => {
    const scope = scopeFor([
      appointment({ trainerId: TRAINER_B, assignedTrainerIds: [TRAINER_B], clientId: CLIENT_2 }),
    ]);
    expect(scope.clientIds.size).toBe(0);
  });
});

describe("tenant boundary", () => {
  it("ignores appointments in organizations the user is not a member of", () => {
    const scope = scopeFor(
      [
        appointment({ id: "a", organizationId: ORG_A, clientId: CLIENT_1 }),
        appointment({ id: "b", organizationId: ORG_B, clientId: CLIENT_2 }),
      ],
      TRAINER_A,
      [ORG_A]
    );
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(true);
    expect(scope.clientIds.has(CLIENT_2)).toBe(false);
  });

  it("keeps scope per-organization even for the same client", () => {
    const scope = scopeFor(
      [
        appointment({ id: "a", organizationId: ORG_A, clientId: CLIENT_1 }),
        appointment({ id: "b", organizationId: ORG_B, clientId: CLIENT_2 }),
      ],
      TRAINER_A,
      [ORG_A, ORG_B]
    );
    // Visible in its own organization only — history in one tenant never
    // authorizes a read in another.
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(true);
    expect(trainerMayReadClient(scope, ORG_B, CLIENT_1)).toBe(false);
    expect(trainerMayReadClient(scope, ORG_B, CLIENT_2)).toBe(true);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_2)).toBe(false);
  });
});

describe("the live ledger only", () => {
  it.each(["reversed", "voided", "superseded"] as const)(
    "a %s appointment grants nothing",
    (recordState) => {
      const scope = scopeFor([appointment({ recordState })]);
      expect(scope.clientIds.size).toBe(0);
    }
  );

  it("reversing one appointment does not revoke access earned by another", () => {
    const scope = scopeFor([
      appointment({ id: "live", clientId: CLIENT_1 }),
      appointment({ id: "reversed", recordState: "reversed", clientId: CLIENT_1 }),
    ]);
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(true);
  });
});

describe("fails closed", () => {
  it("returns an empty scope when the user has no trainer record", () => {
    const scope = scopeFor([appointment()], null);
    expect(scope.clientIds.size).toBe(0);
    expect(scope.byOrganization.size).toBe(0);
  });

  it("returns an empty scope when the user has no active memberships", () => {
    const scope = scopeFor([appointment()], TRAINER_A, []);
    expect(scope.clientIds.size).toBe(0);
  });

  it("returns an empty scope when there is no appointment history at all", () => {
    const scope = scopeFor([]);
    expect(scope.clientIds.size).toBe(0);
    // An empty scope must never read as "everything".
    expect(trainerMayReadClient(scope, ORG_A, CLIENT_1)).toBe(false);
  });

  it("ignores appointments with no client on either link path", () => {
    const scope = scopeFor([appointment({ clientId: null, participantClientIds: [] })]);
    expect(scope.byOrganization.size).toBe(0);
  });

  it("denies an unknown organization even for a client in scope", () => {
    const scope = scopeFor([appointment()]);
    expect(trainerMayReadClient(scope, "org-never-seen", CLIENT_1)).toBe(false);
  });
});

describe("filterClientsToScope", () => {
  it("keeps only in-scope clients and drops everything else", () => {
    const scope = scopeFor([appointment({ clientId: CLIENT_1 })]);
    const filtered = filterClientsToScope(scope, [
      { id: CLIENT_1, organizationId: ORG_A },
      { id: CLIENT_2, organizationId: ORG_A },
      { id: CLIENT_1, organizationId: ORG_B },
    ]);
    expect(filtered).toEqual([{ id: CLIENT_1, organizationId: ORG_A }]);
  });

  it("returns nothing from an empty scope", () => {
    const scope = scopeFor([], null);
    expect(
      filterClientsToScope(scope, [{ id: CLIENT_1, organizationId: ORG_A }])
    ).toEqual([]);
  });
});
