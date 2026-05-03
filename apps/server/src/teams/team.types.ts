/**
 * Team Affiliation Types — Server Layer (WP-109)
 *
 * Durable contracts for the team-affiliation surface introduced by
 * WP-109. These types form the wire shape consumed by
 * `apps/arena-client/src/pages/PlayerProfilePage.vue` and
 * `apps/arena-client/src/pages/MyProfilePage.vue` (via the
 * `teamAffiliations[]` projection on `PublicProfileView` /
 * `OwnerProfileView`) and by the eight new HTTP endpoints under
 * `/api/teams/`. Field shapes, names, and order are locked by EC-115
 * §Locked Values.
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`. The arena-client consumes the
 * `teamAffiliations[]` projection structurally via the existing
 * `PublicProfileView` / `OwnerProfileView` wire shapes; no direct
 * import of this module crosses into client code.
 *
 * `AccountId`, `PlayerAccount`, `DatabaseClient` are re-imported
 * from `../identity/identity.types.js` per the WP-052 D-5201
 * contract — never redeclared. `RequireAuthenticatedSessionOptions`,
 * `SessionTokenRequest`, `SessionVerifier`, `AccountResolver` are
 * re-imported from `../auth/sessionToken.types.js` for the route
 * handler signatures.
 *
 * `TeamResult<T>` is declared locally — `Result<T>` from
 * `../identity/identity.types.js` is keyed on `IdentityErrorCode`
 * which cannot carry the WP-109 codes; this mirrors the WP-102
 * `ProfileResult<T>` PS-5 + WP-104 `OwnerProfileResult<T>`
 * precedents verbatim.
 *
 * Authority: WP-109 §6 / §7 / §8 / §9; EC-115 §Locked Values;
 * D-10901 (OQ-1 friend-graph fallback); D-10902 (OQ-2 explicit
 * two-event promotion); D-10903 (OQ-3 explicit cohort rollover);
 * D-10904 (PS-3 = YES OwnerProfileView extension); D-10905
 * (`apps/server/src/teams/` server-layer classification); D-10906
 * (migration slot 010 + OQ-4 = (a) denormalization); D-10907
 * (single-transaction multi-row create-team); D-10908 (TeamId
 * branded type per AccountId precedent).
 */

import type {
  AccountId,
  DatabaseClient,
  PlayerAccount,
} from '../identity/identity.types.js';
import type {
  AccountResolver,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
} from '../auth/sessionToken.types.js';

// why: re-exported so other modules in this layer (and tests) can
// reference the identity-layer + auth-layer aliases through
// `./team.types.js` without re-importing from those modules
// directly, preserving the single import boundary documented above.
// Mirrors the WP-102 / WP-104 re-export precedent.
export type {
  AccountId,
  AccountResolver,
  DatabaseClient,
  PlayerAccount,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
};

// why: branded-type lock per pre-flight PS-14 / D-10908; mirrors the
// `AccountId` brand from `apps/server/src/identity/identity.types.ts`
// (WP-052 D-5201 precedent). Branding prevents accidental interchange
// with other string identifiers (handle, replay_hash, etc.) at
// compile time. The brand exists only at the TypeScript layer; the
// underlying SQL column on `legendary.teams.team_id` is plain text.
// Cast at exactly one site (`toTeamId` constructor below) which
// validates UUID v4 shape and brands the result.
/**
 * Stable identifier for a team, branded for type narrowing at every
 * API boundary that handles team identifiers. Generated as UUID v4
 * via `node:crypto.randomUUID()` at the `createTeam` orchestrator
 * site and validated via `toTeamId` everywhere else.
 */
export type TeamId = string & { readonly __brand: 'TeamId' };

// why: closed three-value enum per WP-109 §6 + EC-115 Locked Values.
// Legendary's three meaningful cooperative formats — 3-handed,
// 4-handed, 5-handed — map 1:1 to the literal values. Resizing is
// structurally forbidden (`teamSize` is immutable post-creation per
// EC-115 Guardrail 9); a captain who wants a different format
// retires the team and creates a new one. Adding 1 / 2 / 6+ would
// require both a Vision review and a closed-set CHECK update on
// `legendary.teams.team_size` and `legendary.team_member_events.team_size`.
type TeamSize = 3 | 4 | 5;

// why: closed three-value status enum per WP-109 §10. 'active' is
// the starting state; 'completed' is a natural terminal end (cohort
// finished its planned arc); 'retired' is a premature /
// administrative terminal end. Both terminal states make the roster
// read-only. EC-115 Guardrail 14 forbids adding a 'paused' /
// recovery state without a DECISIONS.md override.
type TeamStatus = 'active' | 'completed' | 'retired';

// why: closed three-value visibility enum per WP-109 §11. 'public'
// is visible to all; 'friends' currently collapses to 'private'
// server-side at read time per OQ-1 = (a) / D-10901 (no
// friend-graph surface yet); 'private' is the most-private
// fail-closed default visible only to current and historical
// members. The fallback is enforced at the SQL WHERE clause in
// `composeTeamAffiliationsForProfile` — clients cannot influence
// visibility.
type TeamVisibility = 'public' | 'friends' | 'private';

// why: closed two-value role enum per WP-109 §6. 'member' is the
// primary role; 'substitute' is the bench. Promotion is two events
// per WP-109 §8.3 + EC-115 Guardrail 4 — a substitute does not
// auto-promote when a member's leftAt is set. The captain (or
// operator) records both the departing member's leftAt AND the
// substitute's role change as separate event records.
type TeamMemberRole = 'member' | 'substitute';

/**
 * One team-membership entry on a `Team`. The current view of a
 * member's status, derived by the application layer from the latest
 * event row in `legendary.team_member_events` for the
 * (team_id, player_id) pair.
 */
export interface TeamMember {
  readonly playerId: string;
  readonly role: TeamMemberRole;
  readonly joinedAt: string;
  // why: `leftAt: string | null` is the live-membership signal. When
  // null, the member is still on the team; when set, the member has
  // departed (and the application layer rejects any attempt to
  // rewrite joinedAt on the same row — corrections follow the
  // amendment pattern). Per WP-109 §7 authoritative source note,
  // Team.members[] is the current view derived from immutable event
  // records; this field carries the latest event's leftAt value.
  readonly leftAt: string | null;
}

/**
 * One team entity per WP-109 §6 / §7. Carries the immutable
 * `teamSize` literal (3 | 4 | 5), the immutable `captainPlayerId`
 * (the captain MUST be a current `member` per EC-115 Guardrail 11),
 * the closed-set status / visibility enums, and the current
 * `members[]` view. The team-side data (`name`, `cohortLabel`, etc.)
 * is fetched separately by consumers when the affiliation block is
 * rendered.
 */
export interface Team {
  readonly teamId: TeamId;
  readonly name: string;
  // why: `cohortLabel` per DESIGN-RANKING.md §2 — the alternative
  // form documented in the EC-115 Common Failure Smells section is
  // intentionally rejected to avoid colliding with the bound
  // ranking-window concept. The Season concept is reserved for the
  // ranking layer; conflating the two would split the namespace.
  // Locked under EC-115 Locked Values + Common Failure Smells.
  readonly cohortLabel: string;
  // why: literal closed union `3 | 4 | 5` per WP-109 §6 — Legendary's
  // three meaningful cooperative formats. Immutable post-creation
  // per EC-115 Guardrail 9; resizing requires retire+recreate.
  readonly teamSize: TeamSize;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: TeamStatus;
  readonly captainPlayerId: string;
  readonly members: TeamMember[];
  readonly visibility: TeamVisibility;
}

/**
 * One immutable membership-event record (audit row) from
 * `legendary.team_member_events`. Append-only; corrections follow
 * the amendment pattern (new row, original preserved) per WP-109
 * §10 + EC-115 Guardrail 3. Carries the denormalized `teamSize`
 * column per OQ-4 = (a) / D-10906 — INSERT-time copied from
 * `legendary.teams.team_size`; structurally immutable post-INSERT.
 */
export interface TeamMemberEvent {
  readonly eventId: string;
  readonly teamId: TeamId;
  readonly playerId: string;
  readonly teamSize: TeamSize;
  readonly role: TeamMemberRole;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly actorId: string;
  readonly isOperator: boolean;
  readonly reason: string | null;
  readonly createdAt: string;
}

/**
 * One immutable audit-log entry from `legendary.team_audit_log`.
 * Append-only per EC-115 Guardrail 3; distinguishes operator-driven
 * mutations (`isOperator: true`, `reason` non-empty) from
 * captain-driven mutations (`isOperator: false`, `reason` may be
 * null) per EC-115 Guardrail 5.
 */
export interface TeamAuditEntry {
  readonly auditId: string;
  readonly teamId: TeamId;
  readonly action: TeamAuditAction;
  readonly actorId: string;
  readonly isOperator: boolean;
  readonly reason: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/**
 * Closed-set action enum mirroring the SQL CHECK constraint on
 * `legendary.team_audit_log.action`. Adding a value requires both
 * this union and the migration's CHECK clause to be updated
 * together.
 */
export type TeamAuditAction =
  | 'create'
  | 'rename'
  | 'visibility_change'
  | 'status_change'
  | 'captain_reassign'
  | 'member_add'
  | 'member_leave'
  | 'role_change'
  | 'operator_override';

/**
 * One affiliation entry on a player's profile, projected from the
 * latest `legendary.team_member_events` row for that (team_id,
 * player_id) pair. The wire shape excludes `name`, `cohortLabel`,
 * and `status` — those are fetched separately by the consumer when
 * the affiliation block is rendered.
 */
export interface TeamAffiliation {
  readonly teamId: TeamId;
  // why: `teamSize` is denormalized on the player-side projection
  // per WP-109 §7 — single-row read on the profile, vs. join across
  // the team-membership table for every render. Mirrors the
  // OQ-4 = (a) / D-10906 storage denormalization on
  // `legendary.team_member_events.team_size`.
  readonly teamSize: TeamSize;
  readonly role: TeamMemberRole;
  readonly joinedAt: string;
  readonly leftAt: string | null;
}

/**
 * Optional friend-graph oracle injected by the host app. When
 * undefined (per OQ-1 = (a) / D-10901), `'friends'`-visibility
 * teams collapse to `'private'` server-side and are visible only to
 * current and historical members. The fallback is enforced at the
 * SQL WHERE clause in `composeTeamAffiliationsForProfile`; clients
 * cannot influence visibility.
 */
export interface FriendGraphService {
  areFriends(viewerPlayerId: string, subjectPlayerId: string): Promise<boolean>;
}

/**
 * Programmatic error codes for fallible team operations. Closed
 * union: callers dispatch on `code` without parsing prose `reason`
 * strings.
 *
 * Adding a code requires updating both this union and
 * `TEAM_ERROR_CODES` in the same change; the drift-detection test
 * in `team.logic.test.ts` asserts forward and backward inclusion.
 */
export type TeamErrorCode =
  | 'invalid_request'
  | 'invalid_team_size'
  | 'invalid_team_name'
  | 'invalid_cohort_label'
  | 'team_not_found'
  | 'not_team_captain'
  | 'captain_must_be_member'
  | 'roster_invalid'
  | 'duplicate_active_membership'
  | 'monotonic_violation'
  | 'team_not_active'
  | 'team_not_visible'
  | 'unknown_account';

/**
 * Canonical readonly array mirroring the `TeamErrorCode` union.
 * Adding a value requires updating both the union and this array
 * in the same change (see code-style §Drift Detection). The
 * drift-detection test in `team.logic.test.ts` asserts forward
 * and backward inclusion.
 */
export const TEAM_ERROR_CODES: readonly TeamErrorCode[] = [
  'invalid_request',
  'invalid_team_size',
  'invalid_team_name',
  'invalid_cohort_label',
  'team_not_found',
  'not_team_captain',
  'captain_must_be_member',
  'roster_invalid',
  'duplicate_active_membership',
  'monotonic_violation',
  'team_not_active',
  'team_not_visible',
  'unknown_account',
] as const;

// why: declared locally rather than re-imported from
// `../identity/identity.types.js`. WP-052's `Result<T>` is keyed on
// `IdentityErrorCode` (a four-value union covering account-creation
// failures) and cannot carry the WP-109 codes. The shape mirrors
// WP-052's `Result<T>` exactly — same `ok` discriminant, same
// `value` / `reason` / `code` fields — but with the team error
// union per the WP-102 / WP-104 PS-5 precedent. `AccountId`,
// `PlayerAccount`, and `DatabaseClient` are still re-imported above
// (no parallel declarations) so the identity contract remains the
// single source of truth for those three aliases.
/**
 * Discriminated-union result type for fallible team operations.
 * The `ok: true` branch carries the success value; the `ok: false`
 * branch carries a full-sentence `reason` string (per code-style
 * Rule 11) and a programmatic `code` for caller-side dispatch
 * without prose parsing.
 */
export type TeamResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: TeamErrorCode };

/**
 * Input shape for `createTeam`. The captain becomes the first
 * `member` automatically; `founders` enumerates any additional
 * initial roster (members + substitutes). Acceptance is implicit
 * for the captain (the API caller); the wire path for invitee
 * acceptance lives in `recordMembershipChange` per WP-109 §8.4 —
 * but the locked initial-acceptance event records under WP-109's
 * single-transaction envelope per D-10907 still go in here when
 * the founders array is provided pre-accepted.
 */
export interface CreateTeamInput {
  readonly name: string;
  readonly cohortLabel: string;
  readonly teamSize: TeamSize;
  readonly startDate: string;
  readonly endDate: string;
  readonly visibility: TeamVisibility;
  readonly founders: readonly CreateTeamFounder[];
}

/**
 * One founding-roster entry on `CreateTeamInput`. The captain is
 * NOT included here (the captain is the API caller and is appended
 * by the orchestrator); `founders` enumerates members and
 * substitutes only.
 */
export interface CreateTeamFounder {
  readonly playerId: string;
  readonly role: TeamMemberRole;
}
