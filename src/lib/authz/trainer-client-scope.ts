/**
 * Trainer → client authorization scope, derived from appointment history.
 *
 * This is the application-side twin of `app.trainer_client_ids()`. The
 * database function is the enforcement backstop; this module is the same
 * rule expressed as a pure function so it can be exhaustively tested
 * without a live database, and so server code can reason about scope
 * before issuing a query.
 *
 * The two implementations must agree. `deriveTrainerClientScope` is
 * written to mirror the SQL branch for branch, and the live RLS checks in
 * tests/rls/phaseG-live-checks.sql assert the database behaves the same
 * way on real rows.
 *
 * Design rules, all of which exist because getting this wrong leaks one
 * trainer's clients to another:
 *   1. FAIL CLOSED. No trainer identity → empty scope. Unknown → empty.
 *   2. Organization-bounded. An appointment only grants access inside an
 *      organization the user is actually a member of.
 *   3. Live ledger only. Reversed, voided and superseded appointments
 *      grant nothing.
 *   4. Additive only. This never removes access someone already has via
 *      `client:read`, and never grants beyond the derived set.
 */

export type AppointmentRecordState = "active" | "superseded" | "reversed" | "voided";

/** The minimum an appointment must expose for scope derivation. */
export interface ScopeAppointment {
  id: string;
  organizationId: string;
  recordState: AppointmentRecordState;
  /** Primary trainer on the appointment row. */
  trainerId: string | null;
  /** Additional trainers via appointment_trainer_assignments. */
  assignedTrainerIds?: string[];
  /** Primary client on the appointment row. */
  clientId: string | null;
  /** Additional clients via appointment_participants. */
  participantClientIds?: string[];
}

export interface TrainerClientScopeInput {
  /** The trainer row linked to the acting user, or null when there is none. */
  trainerId: string | null;
  /** Organizations where the user holds an ACTIVE membership. */
  memberOrganizationIds: readonly string[];
  appointments: readonly ScopeAppointment[];
}

export interface TrainerClientScope {
  /** organizationId → the client ids visible in that organization. */
  byOrganization: Map<string, Set<string>>;
  /** Flat set, for the common "may I see this client at all?" question. */
  clientIds: Set<string>;
}

export const EMPTY_TRAINER_CLIENT_SCOPE: TrainerClientScope = {
  byOrganization: new Map(),
  clientIds: new Set(),
};

function emptyScope(): TrainerClientScope {
  return { byOrganization: new Map(), clientIds: new Set() };
}

/**
 * Derive the set of clients a trainer is authorized to see.
 *
 * Returns an empty scope — never a permissive one — for every degenerate
 * input: no trainer identity, no memberships, no appointments.
 */
export function deriveTrainerClientScope(
  input: TrainerClientScopeInput
): TrainerClientScope {
  const scope = emptyScope();
  if (!input.trainerId) return scope;

  const memberOrgs = new Set(input.memberOrganizationIds);
  if (memberOrgs.size === 0) return scope;

  for (const appointment of input.appointments) {
    // (3) only the live ledger grants access
    if (appointment.recordState !== "active") continue;
    // (2) tenant boundary
    if (!memberOrgs.has(appointment.organizationId)) continue;

    const delivered =
      appointment.trainerId === input.trainerId ||
      (appointment.assignedTrainerIds ?? []).includes(input.trainerId);
    if (!delivered) continue;

    const clients = new Set<string>();
    if (appointment.clientId) clients.add(appointment.clientId);
    for (const participant of appointment.participantClientIds ?? []) {
      clients.add(participant);
    }
    if (clients.size === 0) continue;

    const bucket = scope.byOrganization.get(appointment.organizationId) ?? new Set<string>();
    for (const clientId of clients) {
      bucket.add(clientId);
      scope.clientIds.add(clientId);
    }
    scope.byOrganization.set(appointment.organizationId, bucket);
  }

  return scope;
}

/**
 * The authorization question itself. Deliberately takes the organization,
 * so "this trainer worked with this client somewhere" can never be
 * mistaken for "this trainer may see this client here".
 */
export function trainerMayReadClient(
  scope: TrainerClientScope,
  organizationId: string,
  clientId: string
): boolean {
  return scope.byOrganization.get(organizationId)?.has(clientId) ?? false;
}

/**
 * Narrow a candidate list to what the trainer may see. Used to filter
 * results the database has already returned, as defence in depth — RLS
 * is the primary control, and this is the second one.
 */
export function filterClientsToScope<T extends { id: string; organizationId: string }>(
  scope: TrainerClientScope,
  clients: readonly T[]
): T[] {
  return clients.filter((client) =>
    trainerMayReadClient(scope, client.organizationId, client.id)
  );
}
