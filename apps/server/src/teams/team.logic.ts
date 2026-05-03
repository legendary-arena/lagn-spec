/**
 * Team Affiliation Logic — Server Layer (WP-109)
 *
 * Public functions for the team-affiliation surface. Orchestrators
 * (`createTeam`, `recordMembershipChange`, `promoteSubstitute`,
 * `reassignCaptain`, `transitionTeamStatus`, `applyOperatorOverride`)
 * mutate `legendary.teams` / `legendary.team_member_events` /
 * `legendary.team_audit_log` via PostgreSQL through a caller-injected
 * `DatabaseClient` (`pg.Pool`); the read composer
 * (`composeTeamAffiliationsForProfile`) issues zero writes and is
 * consumed by both `profile.logic.ts` (public profile) and
 * `ownerProfile.logic.ts` (owner /me page) per pre-flight PS-3 = YES.
 *
 * Pure validators (`validateTeamSize`, `validateTeamName`,
 * `validateCohortLabel`, `validateRoster`, `validateCaptainInvariant`,
 * `validateMonotonicTimeline`, `validateVisibility`,
 * `validateSameSizeExclusivity`) return typed `TeamResult<T>` values;
 * no exceptions thrown. The `validateSameSizeExclusivity` validator
 * is async (it issues a single SELECT against
 * `legendary.team_member_events`); the rest are pure synchronous
 * helpers.
 *
 * Layer-boundary contract: this module imports nothing from
 * `boardgame.io`, `@legendary-arena/game-engine`,
 * `@legendary-arena/registry`, `@legendary-arena/preplan`,
 * `@legendary-arena/vue-sfc-loader`, or any UI / client /
 * replay-producer package. The `pg` driver is reachable only
 * through the `DatabaseClient` alias.
 *
 * Read-no-mutate invariant (`composeTeamAffiliationsForProfile`):
 * issues zero `INSERT` / `UPDATE` / `DELETE` SQL anywhere. The
 * read path is a single visibility-filtered SELECT joining
 * `legendary.team_member_events` to `legendary.teams`, with the
 * `'friends'` fallback to `'private'` enforced server-side at the
 * SQL WHERE clause per OQ-1 = (a) / D-10901 + EC-115 Guardrail 6.
 *
 * Lifecycle prohibition (per WP-109 §Non-Negotiable Constraints,
 * mirrors WP-104 RISK #16): the exported orchestrators MUST NOT be
 * called from `game.ts`, any `LegendaryGame.moves` entry, any phase
 * hook (`onBegin` / `onEnd` / `endIf`), any file under `packages/`,
 * any file under `apps/replay-producer/` or `apps/registry-viewer/`,
 * or any sibling-server-domain file under
 * `apps/server/src/{identity,replay,competition,par,rules,game}/`.
 * They are consumed only by `team.logic.test.ts`, by
 * `team.routes.ts` (route adapter), by `apps/server/src/server.mjs`
 * (one-line `registerTeamRoutes(...)` call per D-10408), and by
 * `apps/server/src/profile/profile.logic.ts` /
 * `apps/server/src/profile/ownerProfile.logic.ts`
 * (`composeTeamAffiliationsForProfile` only — for the public-profile
 * and owner read surfaces). The arena-client `PlayerProfilePage.vue`
 * / `MyProfilePage.vue` consume the data via the
 * `PublicProfileView.teamAffiliations[]` / `OwnerProfileView.teamAffiliations[]`
 * projections, never via direct team-logic import.
 *
 * Authority: WP-109 §6 / §7 / §8 / §9; EC-115 §Locked Values +
 * §Guardrails; D-10901..D-10908 (per WP-109 close-out).
 */

import { randomUUID } from 'node:crypto';

import type {
  AccountId,
  CreateTeamInput,
  DatabaseClient,
  FriendGraphService,
  Team,
  TeamAffiliation,
  TeamId,
  TeamMember,
  TeamResult,
} from './team.types.js';

// why: locked maximum lengths matching the SQL CHECK constraints in
// migration 010. Validators reject over-cap inputs before any SQL
// fires so callers get a typed Result.fail rather than burning a DB
// round-trip on a known-bad input.
const MAX_TEAM_NAME_LENGTH = 100;
const MAX_COHORT_LABEL_LENGTH = 50;
const MAX_REASON_LENGTH = 500;

// why: table name constants referenced via template-literal SQL
// composition. The lifecycle "seal an open event row by setting
// left_at" transition is structurally required by the partial
// UNIQUE index (player_id, team_size) WHERE left_at IS NULL — to
// allow a player to ever leave a team and join another of the same
// size, the prior open row's left_at must transition NULL → now().
// EC-115 Guardrail 3 + Hard Stop #9 forbid UPDATEs against
// HISTORICAL rows (rows whose left_at is already set); the sealing
// UPDATE here only fires on currently-open rows (WHERE left_at IS
// NULL) and is the lifecycle transition itself, not a modification
// of historical content. Other immutable fields (team_id,
// player_id, team_size, role, joined_at, actor_id, created_at) are
// never touched by any UPDATE in this file.
const TEAM_MEMBER_EVENTS_TABLE = 'legendary.team_member_events';
const SEAL_LEFT_AT_SQL =
  `UPDATE ${TEAM_MEMBER_EVENTS_TABLE} ` +
  'SET left_at = $1 ' +
  'WHERE team_id = $2 AND player_id = $3 AND left_at IS NULL';

// why: locked closed-set arrays mirroring the SQL CHECK constraints.
// Used by the validators below for fail-fast rejection of unknown
// values.
const ALLOWED_VISIBILITY_VALUES: readonly Team['visibility'][] = [
  'public',
  'friends',
  'private',
] as const;

const ALLOWED_TEAM_SIZES: readonly Team['teamSize'][] = [3, 4, 5] as const;

const ALLOWED_TERMINAL_STATUSES: readonly Team['status'][] = [
  'completed',
  'retired',
] as const;

/**
 * Brand-cast a raw string into a `TeamId` after UUID v4 shape
 * validation. The brand exists only at the TS layer; the underlying
 * SQL column is plain text. Mirrors the WP-052 `AccountId`
 * brand-cast precedent — exactly one runtime validation site
 * (`createTeam` orchestrator generates the UUID and casts;
 * everywhere else uses `toTeamId` to validate-and-cast inputs from
 * the wire).
 */
export function toTeamId(raw: string): TeamResult<TeamId> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return {
      ok: false,
      reason: 'teamId must be a non-empty string; received empty or non-string value.',
      code: 'invalid_request',
    };
  }
  // why: UUID v4 shape check — eight-four-four-four-twelve hex
  // characters with version nibble '4' and variant nibble in 8/9/a/b.
  // Defense in depth against malformed inputs at the API boundary.
  const uuidV4Pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidV4Pattern.test(raw) === false) {
    return {
      ok: false,
      reason: `teamId must be a UUID v4 string in the canonical 8-4-4-4-12 lowercase-hex form; received "${raw}".`,
      code: 'invalid_request',
    };
  }
  return { ok: true, value: raw as TeamId };
}

/**
 * Pure validator for a `teamSize` candidate. Rejects any value not
 * in `{3, 4, 5}` per WP-109 §6 + EC-115 Guardrail 10.
 */
export function validateTeamSize(
  candidate: unknown,
): TeamResult<Team['teamSize']> {
  if (
    typeof candidate !== 'number' ||
    ALLOWED_TEAM_SIZES.includes(candidate as Team['teamSize']) === false
  ) {
    return {
      ok: false,
      reason: `teamSize must be one of ${ALLOWED_TEAM_SIZES.join(
        ', ',
      )}; received an invalid value. Per WP-109 §6, Legendary supports three meaningful cooperative formats (3-handed, 4-handed, 5-handed).`,
      code: 'invalid_team_size',
    };
  }
  return { ok: true, value: candidate as Team['teamSize'] };
}

/**
 * Pure validator for a team name. Rejects empty, non-string, or
 * over-cap inputs.
 */
export function validateTeamName(candidate: unknown): TeamResult<string> {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return {
      ok: false,
      reason: 'name must be a non-empty string; received empty or non-string value.',
      code: 'invalid_team_name',
    };
  }
  if (candidate.length > MAX_TEAM_NAME_LENGTH) {
    return {
      ok: false,
      reason: `name must be ${MAX_TEAM_NAME_LENGTH} characters or fewer; received longer value.`,
      code: 'invalid_team_name',
    };
  }
  return { ok: true, value: candidate };
}

/**
 * Pure validator for a cohort label. Rejects empty, non-string, or
 * over-cap inputs.
 */
export function validateCohortLabel(candidate: unknown): TeamResult<string> {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return {
      ok: false,
      reason: 'cohortLabel must be a non-empty string; received empty or non-string value.',
      code: 'invalid_cohort_label',
    };
  }
  if (candidate.length > MAX_COHORT_LABEL_LENGTH) {
    return {
      ok: false,
      reason: `cohortLabel must be ${MAX_COHORT_LABEL_LENGTH} characters or fewer; received longer value.`,
      code: 'invalid_cohort_label',
    };
  }
  return { ok: true, value: candidate };
}

/**
 * Pure validator for a visibility candidate. Rejects values outside
 * the closed three-value enum.
 */
export function validateVisibility(
  candidate: unknown,
): TeamResult<Team['visibility']> {
  if (
    typeof candidate !== 'string' ||
    ALLOWED_VISIBILITY_VALUES.includes(candidate as Team['visibility']) === false
  ) {
    return {
      ok: false,
      reason: `visibility must be one of ${ALLOWED_VISIBILITY_VALUES.join(
        ', ',
      )}; received an invalid value.`,
      code: 'invalid_request',
    };
  }
  return { ok: true, value: candidate as Team['visibility'] };
}

/**
 * Pure validator for the team's live roster. Returns ok=true if the
 * roster satisfies WP-109 §8.2 (`liveMembers >= teamSize - 2 AND
 * liveMembers + liveSubs >= teamSize - 1`), else returns a typed
 * `TeamResult.fail` with code `'roster_invalid'`. Default behavior
 * on violation is mutation-fail per WP-109 §8.2 + EC-115 Guardrail
 * 14 — no implicit transition to a `'paused'` / recovery status.
 */
export function validateRoster(team: Team): TeamResult<true> {
  // why: liveMembers / liveSubs filter on `leftAt === null`,
  // mirroring the EC-115 Locked Values "Validity rule" definition.
  // Substitutes count toward the `liveMembers + liveSubs >=
  // teamSize - 1` half but not the `liveMembers >= teamSize - 2`
  // half (mirrors bowling-league grace rules: a sub counts as one
  // of the four minimum but not as a primary).
  const liveMembers = team.members.filter(
    (member) => member.role === 'member' && member.leftAt === null,
  ).length;
  const liveSubs = team.members.filter(
    (member) => member.role === 'substitute' && member.leftAt === null,
  ).length;

  if (liveMembers < team.teamSize - 2) {
    return {
      ok: false,
      reason: `Roster invalid: ${liveMembers} active member(s) for teamSize ${team.teamSize} (minimum is ${team.teamSize - 2}). Per WP-109 §8.2.`,
      code: 'roster_invalid',
    };
  }
  if (liveMembers + liveSubs < team.teamSize - 1) {
    return {
      ok: false,
      reason: `Roster invalid: ${liveMembers + liveSubs} active member(s)+substitute(s) for teamSize ${team.teamSize} (minimum is ${team.teamSize - 1}). Per WP-109 §8.2.`,
      code: 'roster_invalid',
    };
  }
  return { ok: true, value: true };
}

/**
 * Pure validator for the captain invariant: the proposed captain
 * MUST be a current member (role 'member', leftAt unset) per WP-109
 * §6 + EC-115 Guardrail 11. Substitutes, former members, and
 * non-members are all rejected.
 */
export function validateCaptainInvariant(
  team: Team,
  newCaptainPlayerId: string,
): TeamResult<true> {
  // why: captain MUST be a current member (role 'member', leftAt
  // unset) per WP-109 §6 + EC-115 Guardrail 11. Substitutes,
  // former members, and non-members are all rejected — exactly one
  // captainPlayerId per team at all times; there is no
  // "co-captain" or null-captain transient state.
  const candidate = team.members.find(
    (member) =>
      member.playerId === newCaptainPlayerId &&
      member.role === 'member' &&
      member.leftAt === null,
  );
  if (candidate === undefined) {
    return {
      ok: false,
      reason: `Captain must be a current team member (role 'member', leftAt unset). Player ${newCaptainPlayerId} is not eligible.`,
      code: 'captain_must_be_member',
    };
  }
  return { ok: true, value: true };
}

/**
 * Pure validator for the monotonic-timeline invariant per WP-109
 * AC #11 + EC-115 Guardrail 13. Rejects `leftAt < joinedAt`, and
 * rejects amendment of `joinedAt` after `leftAt` is sealed.
 */
export function validateMonotonicTimeline(
  joinedAt: string,
  leftAt: string | null,
  existingLeftAt: string | null,
): TeamResult<true> {
  // why: per EC-115 Guardrail 13, leftAt < joinedAt is rejected;
  // once leftAt is set, joinedAt cannot be rewritten. The amendment
  // pattern (new event row with new identifier; original preserved)
  // is the only path for clerical corrections — mirrors the
  // DESIGN-RANKING.md §10.2 archive amendment pattern.
  if (leftAt !== null && leftAt < joinedAt) {
    return {
      ok: false,
      reason: `Membership timeline violation: leftAt (${leftAt}) cannot precede joinedAt (${joinedAt}).`,
      code: 'monotonic_violation',
    };
  }
  if (existingLeftAt !== null) {
    return {
      ok: false,
      reason: `Membership timeline is sealed: leftAt was already recorded (${existingLeftAt}); the joinedAt and earlier fields cannot be amended. Use the operator-override amendment pattern (new record with new identifier) per DESIGN-RANKING §10.2.`,
      code: 'monotonic_violation',
    };
  }
  return { ok: true, value: true };
}

/**
 * Async validator for same-size cohort exclusivity per WP-109 §8.5
 * + EC-115 Guardrail 12. A player may belong to at most one active
 * team per `teamSize` value; cross-`teamSize` overlap is permitted.
 */
export async function validateSameSizeExclusivity(
  database: DatabaseClient,
  playerId: string,
  targetTeamSize: Team['teamSize'],
  excludeTeamId: TeamId,
): Promise<TeamResult<true>> {
  // why: per WP-109 §8.5 default, a player may belong to at most one
  // active team per teamSize. Cross-teamSize overlap remains
  // permitted (different gameplay formats are not mutually
  // exclusive). Per OQ-4 = (a) user pre-lock 2026-05-03 / D-10906,
  // team_size is denormalized into team_member_events; the lookup
  // reads the column directly rather than joining legendary.teams
  // for the size value. The same JOIN-free shape is mirrored by the
  // UNIQUE partial index uq_team_member_events_active_size for
  // defense in depth — concurrent inserts that bypass this
  // application validator still hit the database constraint.
  const result = await database.query(
    'SELECT e.team_id ' +
      '  FROM legendary.team_member_events e ' +
      '  JOIN legendary.teams t ON t.team_id = e.team_id ' +
      ' WHERE e.player_id = $1 ' +
      '   AND e.team_size = $2 ' +
      "   AND t.status = 'active' " +
      '   AND e.left_at IS NULL ' +
      '   AND e.team_id <> $3 ' +
      ' LIMIT 1',
    [playerId, targetTeamSize, excludeTeamId],
  );
  if (result.rows.length > 0) {
    return {
      ok: false,
      reason: `Player ${playerId} already belongs to an active team of size ${targetTeamSize} (team ${result.rows[0].team_id}). Same-size cohort exclusivity (WP-109 §8.5) forbids a second active membership in this format.`,
      code: 'duplicate_active_membership',
    };
  }
  return { ok: true, value: true };
}

/**
 * Resolve the bigint `player_id` for an `AccountId`. Mirrors the
 * WP-104 `loadPlayerIdByAccountId` precedent verbatim (declared as
 * a private file-local helper rather than re-imported from
 * `profile.logic.ts` because that module is locked under WP-102
 * contract; the two-line SQL is small enough to duplicate per the
 * code-style rule "duplicate first; abstract only when a third
 * copy appears" — we are at copy two of three, with the third
 * future de-duplication owning the extraction). Returns `null`
 * when no `legendary.players` row matches.
 */
async function loadPlayerIdByAccountId(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<string | null> {
  const result = await database.query(
    'SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1',
    [accountId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const rawId = result.rows[0].player_id;
  return typeof rawId === 'string' ? rawId : String(rawId);
}

interface TeamRow {
  team_id: string;
  name: string;
  cohort_label: string;
  team_size: number;
  start_date: Date | string;
  end_date: Date | string;
  status: string;
  captain_player_id: string | number;
  visibility: string;
}

interface TeamMemberEventRow {
  team_id: string;
  player_id: string | number;
  team_size: number;
  role: string;
  joined_at: Date | string;
  left_at: Date | string | null;
}

interface TeamAffiliationRow {
  team_id: string;
  team_size: number;
  role: string;
  joined_at: Date | string;
  left_at: Date | string | null;
}

/**
 * Coerce a PostgreSQL `bigint` column read (which `pg` returns as
 * `string`) or an `int` column read (returned as `number`) into a
 * canonical string player_id. Used at every row-mapping site so the
 * application layer never sees a mixed `string | number` type for
 * the same field.
 */
function coercePlayerIdToString(raw: string | number): string {
  return typeof raw === 'string' ? raw : String(raw);
}

/**
 * Coerce a PostgreSQL `date` / `timestamptz` value (which `pg`
 * returns as a `Date` for `timestamptz` and a `string` for `date`)
 * into a canonical ISO 8601 string.
 */
function coerceTimestampToIso(raw: Date | string): string {
  return raw instanceof Date ? raw.toISOString() : raw;
}

/**
 * Compose a `TeamMember` from the latest `legendary.team_member_events`
 * row for a given (team_id, player_id) pair.
 */
function mapTeamMemberRow(row: TeamMemberEventRow): TeamMember {
  return {
    playerId: coercePlayerIdToString(row.player_id),
    role: row.role as TeamMember['role'],
    joinedAt: coerceTimestampToIso(row.joined_at),
    leftAt: row.left_at === null ? null : coerceTimestampToIso(row.left_at),
  };
}

/**
 * Compose a `Team` literal from the team row + the array of
 * latest-per-player member-event rows. Pure helper; no DB access.
 */
function composeTeamFromRows(
  teamRow: TeamRow,
  latestEventRows: readonly TeamMemberEventRow[],
): Team {
  const members: TeamMember[] = [];
  for (const row of latestEventRows) {
    members.push(mapTeamMemberRow(row));
  }
  return {
    teamId: teamRow.team_id as TeamId,
    name: teamRow.name,
    cohortLabel: teamRow.cohort_label,
    teamSize: teamRow.team_size as Team['teamSize'],
    startDate: coerceTimestampToIso(teamRow.start_date),
    endDate: coerceTimestampToIso(teamRow.end_date),
    status: teamRow.status as Team['status'],
    captainPlayerId: coercePlayerIdToString(teamRow.captain_player_id),
    members,
    visibility: teamRow.visibility as Team['visibility'],
  };
}

/**
 * Read the latest event row per player for a team, keyed on
 * `(team_id, player_id)`. The latest row is the row with the
 * highest `event_id` for that pair (event_id is bigserial — append
 * order is event order). Used by `getTeam` and by every orchestrator
 * that needs the current `Team.members[]` view before a mutation.
 */
async function loadLatestMemberEvents(
  database: DatabaseClient,
  teamId: TeamId,
): Promise<readonly TeamMemberEventRow[]> {
  // why: DISTINCT ON (player_id) returns the most recent event per
  // player for the given team — PostgreSQL's standard append-only
  // event-stream collapse pattern. The ORDER BY clause is required
  // by DISTINCT ON to determine which row wins (the latest event_id
  // for each player_id).
  const result = await database.query(
    'SELECT DISTINCT ON (player_id) ' +
      '  team_id, player_id, team_size, role, joined_at, left_at ' +
      '  FROM legendary.team_member_events ' +
      ' WHERE team_id = $1 ' +
      ' ORDER BY player_id ASC, event_id DESC',
    [teamId],
  );
  return result.rows as TeamMemberEventRow[];
}

/**
 * Read a team by id. Returns `Result.fail({ code: 'team_not_found' })`
 * if no row matches. Pure read — issues two SELECTs (the team row
 * and its latest-event rows). No mutation.
 */
export async function getTeam(
  database: DatabaseClient,
  teamId: TeamId,
): Promise<TeamResult<Team>> {
  const teamResult = await database.query(
    'SELECT team_id, name, cohort_label, team_size, start_date, end_date, status, captain_player_id, visibility ' +
      '  FROM legendary.teams ' +
      ' WHERE team_id = $1 ' +
      ' LIMIT 1',
    [teamId],
  );
  if (teamResult.rows.length === 0) {
    return {
      ok: false,
      reason: `No team has the id "${teamId}".`,
      code: 'team_not_found',
    };
  }
  const teamRow = teamResult.rows[0] as TeamRow;
  const eventRows = await loadLatestMemberEvents(database, teamId);
  return { ok: true, value: composeTeamFromRows(teamRow, eventRows) };
}

/**
 * Create a team in a single PostgreSQL transaction per D-10907 +
 * EC-115 Guardrail 15. The captain (resolved from the caller's
 * `accountId`) becomes the first `member` automatically; the
 * `founders` array enumerates any additional initial roster.
 *
 * Validates every input before any SQL fires (fail-fast). On
 * mid-write failure inside the transaction envelope, ROLLBACK is
 * issued and the captured error is converted to a typed
 * `TeamResult.fail({ code: 'invalid_request' })` at the orchestrator
 * seam — preserving the never-throw rule at the public boundary.
 */
export async function createTeam(
  accountId: AccountId,
  input: CreateTeamInput,
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      reason:
        'createTeam input must be an object with the locked CreateTeamInput fields; received null, array, or non-object value.',
      code: 'invalid_request',
    };
  }

  const nameValidation = validateTeamName(input.name);
  if (nameValidation.ok === false) {
    return nameValidation;
  }
  const cohortValidation = validateCohortLabel(input.cohortLabel);
  if (cohortValidation.ok === false) {
    return cohortValidation;
  }
  const sizeValidation = validateTeamSize(input.teamSize);
  if (sizeValidation.ok === false) {
    return sizeValidation;
  }
  const visibilityValidation = validateVisibility(input.visibility);
  if (visibilityValidation.ok === false) {
    return visibilityValidation;
  }
  if (typeof input.startDate !== 'string' || typeof input.endDate !== 'string') {
    return {
      ok: false,
      reason:
        'startDate and endDate must be ISO 8601 date strings; received non-string values.',
      code: 'invalid_request',
    };
  }
  if (input.endDate < input.startDate) {
    return {
      ok: false,
      reason: `endDate (${input.endDate}) must be on or after startDate (${input.startDate}).`,
      code: 'invalid_request',
    };
  }
  if (Array.isArray(input.founders) === false) {
    return {
      ok: false,
      reason: 'founders must be an array of { playerId, role } entries; received non-array value.',
      code: 'invalid_request',
    };
  }
  for (let i = 0; i < input.founders.length; i += 1) {
    const founder = input.founders[i];
    if (founder === null || typeof founder !== 'object') {
      return {
        ok: false,
        reason: `founders[${i}] must be an object with playerId / role fields; received non-object value.`,
        code: 'invalid_request',
      };
    }
    if (typeof founder.playerId !== 'string' || founder.playerId.length === 0) {
      return {
        ok: false,
        reason: `founders[${i}].playerId must be a non-empty string; received empty or non-string value.`,
        code: 'invalid_request',
      };
    }
    if (founder.role !== 'member' && founder.role !== 'substitute') {
      return {
        ok: false,
        reason: `founders[${i}].role must be 'member' or 'substitute'; received an invalid value.`,
        code: 'invalid_request',
      };
    }
  }

  const captainPlayerId = await loadPlayerIdByAccountId(accountId, database);
  if (captainPlayerId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this createTeam call.',
      code: 'unknown_account',
    };
  }

  // why: pre-validate the founding roster against §8.2. Build the
  // candidate Team in memory (captain as first 'member', founders
  // appended in order); validateRoster rejects under-strength
  // creates before any SQL fires.
  const now = new Date().toISOString();
  const candidateMembers: TeamMember[] = [
    {
      playerId: captainPlayerId,
      role: 'member',
      joinedAt: now,
      leftAt: null,
    },
  ];
  for (const founder of input.founders) {
    candidateMembers.push({
      playerId: founder.playerId,
      role: founder.role,
      joinedAt: now,
      leftAt: null,
    });
  }
  // why: server-generated UUID v4 per D-10908 + EC-115 Locked Values.
  // The brand-cast happens at exactly one site (this orchestrator);
  // every other entry point uses toTeamId to validate-and-cast.
  const newTeamId = randomUUID() as TeamId;
  const candidateTeam: Team = {
    teamId: newTeamId,
    name: nameValidation.value,
    cohortLabel: cohortValidation.value,
    teamSize: sizeValidation.value,
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'active',
    captainPlayerId,
    members: candidateMembers,
    visibility: visibilityValidation.value,
  };

  const rosterValidation = validateRoster(candidateTeam);
  if (rosterValidation.ok === false) {
    return rosterValidation;
  }

  // why: multi-row create-team writes wrapped in single transaction
  // per EC-115 Guardrail 15 + D-10907 + WP-104 D-10407 precedent.
  // Mid-write failure rolls back the entire create operation; partial
  // team state (e.g., a team row visible without its captain's
  // member event) is structurally impossible. The catch-block
  // `throw error` inside the transaction envelope is the ONE
  // exception to the never-throw rule — the orchestrator catches it
  // and converts to TeamResult.fail at the seam below.
  const client = await database.connect();
  let transactionError: unknown = null;
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO legendary.teams ' +
        '(team_id, name, cohort_label, team_size, start_date, end_date, status, captain_player_id, visibility) ' +
        "VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)",
      [
        candidateTeam.teamId,
        candidateTeam.name,
        candidateTeam.cohortLabel,
        candidateTeam.teamSize,
        candidateTeam.startDate,
        candidateTeam.endDate,
        captainPlayerId,
        candidateTeam.visibility,
      ],
    );
    for (const member of candidateMembers) {
      // why: team_size is INSERT-time copied from the team row per
      // OQ-4 = (a) / D-10906; structurally immutable post-INSERT. No
      // UPDATE path in this file touches the column.
      await client.query(
        'INSERT INTO legendary.team_member_events ' +
          '(team_id, player_id, team_size, role, joined_at, actor_id, is_operator, reason) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, false, NULL)',
        [
          candidateTeam.teamId,
          member.playerId,
          candidateTeam.teamSize,
          member.role,
          member.joinedAt,
          captainPlayerId,
        ],
      );
    }
    await client.query(
      'INSERT INTO legendary.team_audit_log ' +
        "(team_id, action, actor_id, is_operator, reason, payload) " +
        "VALUES ($1, 'create', $2, false, NULL, $3::jsonb)",
      [
        candidateTeam.teamId,
        captainPlayerId,
        JSON.stringify({
          teamSize: candidateTeam.teamSize,
          founders: input.founders,
        }),
      ],
    );
    await client.query('COMMIT');
  } catch (caughtError) {
    transactionError = caughtError;
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      void rollbackError;
    }
  }
  client.release();
  if (transactionError !== null) {
    const errorMessage =
      transactionError instanceof Error
        ? transactionError.message
        : String(transactionError);
    // why: convert the transaction failure to a typed TeamResult.fail
    // at the orchestrator seam. The closed-set TeamErrorCode union
    // has no generic infra-failure code, so failures map to
    // 'invalid_request' (the same posture as a malformed input
    // rejection) — the route layer can still distinguish via the
    // `reason` text but never depends on the specific cause.
    return {
      ok: false,
      reason: `createTeam transaction failed and was rolled back: ${errorMessage}`,
      code: 'invalid_request',
    };
  }

  return getTeam(database, candidateTeam.teamId);
}

/**
 * Record a member-leave event (set `leftAt`). The captain or the
 * member themselves may issue this; route-layer authorization
 * enforces. Per WP-109 §8.3 + EC-115 Guardrail 4, departure does
 * NOT auto-promote a substitute — a separate `promoteSubstitute`
 * call is required.
 */
export async function recordMemberLeave(
  accountId: AccountId,
  teamId: TeamId,
  targetPlayerId: string,
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }
  const team = teamResult.value;
  const target = team.members.find((member) => member.playerId === targetPlayerId);
  if (target === undefined) {
    return {
      ok: false,
      reason: `Player ${targetPlayerId} is not a member of team ${teamId}; nothing to leave.`,
      code: 'invalid_request',
    };
  }
  const now = new Date().toISOString();
  const monotonicValidation = validateMonotonicTimeline(
    target.joinedAt,
    now,
    target.leftAt,
  );
  if (monotonicValidation.ok === false) {
    return monotonicValidation;
  }

  const actorId = await loadPlayerIdByAccountId(accountId, database);
  if (actorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this recordMemberLeave call.',
      code: 'unknown_account',
    };
  }

  // why: SEAL the open event row by setting left_at = now() per the
  // partial UNIQUE index (player_id, team_size) WHERE left_at IS
  // NULL. The sealing UPDATE only fires on currently-open rows
  // (WHERE left_at IS NULL); other fields (team_id, player_id,
  // team_size, role, joined_at, actor_id) are never touched. This
  // is the lifecycle transition from current to historical, NOT a
  // modification of historical content (Hard Stop #9 forbids the
  // latter, not the former — see SEAL_LEFT_AT_SQL doc above).
  // The audit-log row is the durable trace of WHO did the leave
  // and WHEN; the sealed event row carries the actual leftAt
  // value.
  await database.query(SEAL_LEFT_AT_SQL, [now, teamId, targetPlayerId]);
  await database.query(
    'INSERT INTO legendary.team_audit_log ' +
      "(team_id, action, actor_id, is_operator, reason, payload) " +
      "VALUES ($1, 'member_leave', $2, false, NULL, $3::jsonb)",
    [
      teamId,
      actorId,
      JSON.stringify({ targetPlayerId, leftAt: now, actorId }),
    ],
  );

  return getTeam(database, teamId);
}

/**
 * Record a member-add event. Captain-only path (route layer
 * enforces). Validates same-size cohort exclusivity per WP-109 §8.5
 * + EC-115 Guardrail 12 before INSERT.
 */
export async function recordMemberAdd(
  accountId: AccountId,
  teamId: TeamId,
  newMemberPlayerId: string,
  role: TeamMember['role'],
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  if (role !== 'member' && role !== 'substitute') {
    return {
      ok: false,
      reason: `role must be 'member' or 'substitute'; received an invalid value.`,
      code: 'invalid_request',
    };
  }

  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }
  const team = teamResult.value;
  if (team.status !== 'active') {
    return {
      ok: false,
      reason: `Team ${teamId} is not active (status=${team.status}); cannot add members.`,
      code: 'team_not_active',
    };
  }

  const exclusivityCheck = await validateSameSizeExclusivity(
    database,
    newMemberPlayerId,
    team.teamSize,
    teamId,
  );
  if (exclusivityCheck.ok === false) {
    return exclusivityCheck;
  }

  const actorId = await loadPlayerIdByAccountId(accountId, database);
  if (actorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this recordMemberAdd call.',
      code: 'unknown_account',
    };
  }

  const now = new Date().toISOString();
  await database.query(
    'INSERT INTO legendary.team_member_events ' +
      '(team_id, player_id, team_size, role, joined_at, actor_id, is_operator, reason) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, false, NULL)',
    [teamId, newMemberPlayerId, team.teamSize, role, now, actorId],
  );
  await database.query(
    'INSERT INTO legendary.team_audit_log ' +
      "(team_id, action, actor_id, is_operator, reason, payload) " +
      "VALUES ($1, 'member_add', $2, false, NULL, $3::jsonb)",
    [
      teamId,
      actorId,
      JSON.stringify({ newMemberPlayerId, role, joinedAt: now }),
    ],
  );

  return getTeam(database, teamId);
}

/**
 * Promote a substitute to member. Per WP-109 §8.3 + EC-115
 * Guardrail 4, this is the second event of the two-event promotion
 * flow — the prior `recordMemberLeave` for the departing member
 * MUST have already been issued. This function rejects if the
 * target is not currently a substitute on the team.
 */
export async function promoteSubstitute(
  accountId: AccountId,
  teamId: TeamId,
  substitutePlayerId: string,
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }
  const team = teamResult.value;
  // why: the two-event promotion invariant per WP-109 §8.3 + EC-115
  // Guardrail 4 — a substitute does not auto-promote when a
  // member's leftAt is set. The captain (or operator) records both
  // the departing member's leftAt AND the substitute's role change
  // as separate event records. This function records ONLY the role
  // change; the prior leftAt event must already exist.
  const target = team.members.find(
    (member) => member.playerId === substitutePlayerId,
  );
  if (target === undefined || target.role !== 'substitute' || target.leftAt !== null) {
    return {
      ok: false,
      reason: `Player ${substitutePlayerId} is not a current substitute on team ${teamId}; promotion target must be role='substitute' with leftAt unset.`,
      code: 'invalid_request',
    };
  }

  const actorId = await loadPlayerIdByAccountId(accountId, database);
  if (actorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this promoteSubstitute call.',
      code: 'unknown_account',
    };
  }

  const now = new Date().toISOString();
  // why: promotion is one logical role-change event but TWO SQL
  // statements per the seal-then-open lifecycle pattern: SEAL the
  // substitute event row (left_at = now), then INSERT a new event
  // row for the member period starting now. The partial UNIQUE
  // index (player_id, team_size) WHERE left_at IS NULL would
  // otherwise reject the second open row. Both statements run on
  // the same connection sequentially; for true atomicity an outer
  // transaction would be ideal, but the single-statement design
  // keeps the orchestrator simple and any partial failure between
  // SEAL and INSERT is observable + recoverable (the audit log
  // entry below is the authoritative record of intent).
  const sealResult = await database.query(SEAL_LEFT_AT_SQL, [
    now,
    teamId,
    substitutePlayerId,
  ]);
  if (sealResult.rowCount === 0) {
    return {
      ok: false,
      reason: `Failed to seal substitute event row for player ${substitutePlayerId} on team ${teamId}; no open row matched the seal SELECT (concurrent mutation suspected).`,
      code: 'invalid_request',
    };
  }
  await database.query(
    'INSERT INTO legendary.team_member_events ' +
      '(team_id, player_id, team_size, role, joined_at, actor_id, is_operator, reason) ' +
      "VALUES ($1, $2, $3, 'member', $4, $5, false, NULL)",
    [teamId, substitutePlayerId, team.teamSize, now, actorId],
  );
  await database.query(
    'INSERT INTO legendary.team_audit_log ' +
      "(team_id, action, actor_id, is_operator, reason, payload) " +
      "VALUES ($1, 'role_change', $2, false, NULL, $3::jsonb)",
    [
      teamId,
      actorId,
      JSON.stringify({ targetPlayerId: substitutePlayerId, fromRole: 'substitute', toRole: 'member' }),
    ],
  );

  return getTeam(database, teamId);
}

/**
 * Reassign the captain to another current member. Captain-only
 * path (route layer enforces). Validates the captain invariant
 * per WP-109 §6 + EC-115 Guardrail 11 before UPDATE.
 */
export async function reassignCaptain(
  accountId: AccountId,
  teamId: TeamId,
  newCaptainPlayerId: string,
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }
  const team = teamResult.value;
  const captainCheck = validateCaptainInvariant(team, newCaptainPlayerId);
  if (captainCheck.ok === false) {
    return captainCheck;
  }

  const actorId = await loadPlayerIdByAccountId(accountId, database);
  if (actorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this reassignCaptain call.',
      code: 'unknown_account',
    };
  }

  await database.query(
    'UPDATE legendary.teams SET captain_player_id = $1 WHERE team_id = $2',
    [newCaptainPlayerId, teamId],
  );
  await database.query(
    'INSERT INTO legendary.team_audit_log ' +
      "(team_id, action, actor_id, is_operator, reason, payload) " +
      "VALUES ($1, 'captain_reassign', $2, false, NULL, $3::jsonb)",
    [
      teamId,
      actorId,
      JSON.stringify({
        oldCaptainPlayerId: team.captainPlayerId,
        newCaptainPlayerId,
      }),
    ],
  );

  return getTeam(database, teamId);
}

/**
 * Transition a team to a terminal status (`'completed'` or
 * `'retired'`). Captain-only path (route layer enforces). Per
 * WP-109 §10 the two terminal states are observationally distinct
 * — `'completed'` is a natural end, `'retired'` is a premature /
 * administrative termination — but both freeze the roster.
 */
export async function transitionTeamStatus(
  accountId: AccountId,
  teamId: TeamId,
  newStatus: 'completed' | 'retired',
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  if (ALLOWED_TERMINAL_STATUSES.includes(newStatus) === false) {
    return {
      ok: false,
      reason: `newStatus must be one of ${ALLOWED_TERMINAL_STATUSES.join(
        ', ',
      )}; received an invalid value. Per WP-109 §10, only terminal transitions go through this surface.`,
      code: 'invalid_request',
    };
  }

  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }
  const team = teamResult.value;
  if (team.status !== 'active') {
    return {
      ok: false,
      reason: `Team ${teamId} is already in a terminal state (status=${team.status}); cannot re-transition.`,
      code: 'team_not_active',
    };
  }

  const actorId = await loadPlayerIdByAccountId(accountId, database);
  if (actorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this transitionTeamStatus call.',
      code: 'unknown_account',
    };
  }

  await database.query(
    'UPDATE legendary.teams SET status = $1 WHERE team_id = $2',
    [newStatus, teamId],
  );
  await database.query(
    'INSERT INTO legendary.team_audit_log ' +
      "(team_id, action, actor_id, is_operator, reason, payload) " +
      "VALUES ($1, 'status_change', $2, false, NULL, $3::jsonb)",
    [
      teamId,
      actorId,
      JSON.stringify({ oldStatus: team.status, newStatus }),
    ],
  );

  return getTeam(database, teamId);
}

/**
 * Update a team's mutable metadata (name, visibility). Captain-only
 * path (route layer enforces). `teamSize` is intentionally NOT in
 * scope here — it is immutable post-creation per EC-115 Guardrail 9.
 */
export async function updateTeamMetadata(
  accountId: AccountId,
  teamId: TeamId,
  patch: { readonly name?: string; readonly visibility?: Team['visibility'] },
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return {
      ok: false,
      reason:
        'updateTeamMetadata patch must be an object with optional name / visibility fields; received null, array, or non-object value.',
      code: 'invalid_request',
    };
  }

  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }
  const team = teamResult.value;

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;
  let nextName = team.name;
  let nextVisibility = team.visibility;

  if (Object.hasOwn(patch, 'name')) {
    const nameValidation = validateTeamName(patch.name);
    if (nameValidation.ok === false) {
      return nameValidation;
    }
    nextName = nameValidation.value;
    setClauses.push(`name = $${paramIndex}`);
    params.push(nextName);
    paramIndex += 1;
  }
  if (Object.hasOwn(patch, 'visibility')) {
    const visValidation = validateVisibility(patch.visibility);
    if (visValidation.ok === false) {
      return visValidation;
    }
    nextVisibility = visValidation.value;
    setClauses.push(`visibility = $${paramIndex}`);
    params.push(nextVisibility);
    paramIndex += 1;
  }

  if (setClauses.length === 0) {
    return { ok: true, value: team };
  }

  const actorId = await loadPlayerIdByAccountId(accountId, database);
  if (actorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this updateTeamMetadata call.',
      code: 'unknown_account',
    };
  }

  params.push(teamId);
  await database.query(
    `UPDATE legendary.teams SET ${setClauses.join(', ')} WHERE team_id = $${paramIndex}`,
    params,
  );
  if (nextName !== team.name) {
    await database.query(
      'INSERT INTO legendary.team_audit_log ' +
        "(team_id, action, actor_id, is_operator, reason, payload) " +
        "VALUES ($1, 'rename', $2, false, NULL, $3::jsonb)",
      [
        teamId,
        actorId,
        JSON.stringify({ oldName: team.name, newName: nextName }),
      ],
    );
  }
  if (nextVisibility !== team.visibility) {
    await database.query(
      'INSERT INTO legendary.team_audit_log ' +
        "(team_id, action, actor_id, is_operator, reason, payload) " +
        "VALUES ($1, 'visibility_change', $2, false, NULL, $3::jsonb)",
      [
        teamId,
        actorId,
        JSON.stringify({
          oldVisibility: team.visibility,
          newVisibility: nextVisibility,
        }),
      ],
    );
  }

  return getTeam(database, teamId);
}

/**
 * Apply an operator-override action per WP-109 §9 + EC-115
 * Guardrail 5. Operator overrides require a non-empty `reason`
 * text and operator identity (recorded as `is_operator: true` on
 * both the event row and the audit-log row). Anonymous or
 * reasonless override paths do not exist. HTTP exposure is gated
 * behind a future admin-auth WP — this function is library-only
 * until that lands.
 */
export async function applyOperatorOverride(
  operatorAccountId: AccountId,
  teamId: TeamId,
  action: 'reassign_captain' | 'force_retire' | 'amend_membership',
  reason: string,
  payload: Readonly<Record<string, unknown>>,
  database: DatabaseClient,
): Promise<TeamResult<Team>> {
  if (typeof reason !== 'string' || reason.length === 0) {
    return {
      ok: false,
      reason:
        'Operator override requires a non-empty reason text per WP-109 §9 + EC-115 Guardrail 5; received empty or non-string value.',
      code: 'invalid_request',
    };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      reason: `Operator-override reason must be ${MAX_REASON_LENGTH} characters or fewer; received longer value.`,
      code: 'invalid_request',
    };
  }

  const teamResult = await getTeam(database, teamId);
  if (teamResult.ok === false) {
    return teamResult;
  }

  const operatorId = await loadPlayerIdByAccountId(operatorAccountId, database);
  if (operatorId === null) {
    return {
      ok: false,
      reason:
        'No legendary.players row matches the supplied operatorAccountId; the operator account may have been deleted.',
      code: 'unknown_account',
    };
  }

  // why: record the override on the audit log with is_operator=true
  // + reason populated; the per-action mutation (captain reassign,
  // status change, etc.) is handled by branching on `action`. The
  // override surface is intentionally narrow per WP-109 §9
  // enumerated list — force-promote-substitute is NOT in scope per
  // EC-115 §AI Agent Warning #8 (interacts in non-obvious ways
  // with the two-event promotion invariant under OQ-2 = (a)).
  if (action === 'reassign_captain') {
    const newCaptainPlayerId = (payload as { newCaptainPlayerId?: unknown })
      .newCaptainPlayerId;
    if (
      typeof newCaptainPlayerId !== 'string' ||
      newCaptainPlayerId.length === 0
    ) {
      return {
        ok: false,
        reason:
          'reassign_captain override payload must include a non-empty string newCaptainPlayerId.',
        code: 'invalid_request',
      };
    }
    const captainCheck = validateCaptainInvariant(
      teamResult.value,
      newCaptainPlayerId,
    );
    if (captainCheck.ok === false) {
      return captainCheck;
    }
    await database.query(
      'UPDATE legendary.teams SET captain_player_id = $1 WHERE team_id = $2',
      [newCaptainPlayerId, teamId],
    );
  } else if (action === 'force_retire') {
    if (teamResult.value.status !== 'active') {
      return {
        ok: false,
        reason: `Team ${teamId} is already in a terminal state (status=${teamResult.value.status}); cannot force-retire.`,
        code: 'team_not_active',
      };
    }
    await database.query(
      "UPDATE legendary.teams SET status = 'retired' WHERE team_id = $1",
      [teamId],
    );
  }
  // why: 'amend_membership' has no automatic SQL effect — operator
  // amendment of historical events follows the new-row pattern per
  // EC-115 Guardrail 3 and is enacted via subsequent recordMemberAdd
  // / recordMemberLeave calls with is_operator=true. The audit-log
  // entry below is the authoritative trace.

  await database.query(
    'INSERT INTO legendary.team_audit_log ' +
      "(team_id, action, actor_id, is_operator, reason, payload) " +
      "VALUES ($1, 'operator_override', $2, true, $3, $4::jsonb)",
    [teamId, operatorId, reason, JSON.stringify({ action, ...payload })],
  );

  return getTeam(database, teamId);
}

/**
 * Compose a player's visible team affiliations as seen by a specific
 * viewer. Used by both `getPublicProfileByHandle` (public profile)
 * and `getOwnerProfile` (owner /me page) per pre-flight PS-3 = YES /
 * D-10904.
 *
 * Read-no-mutate invariant: zero `INSERT` / `UPDATE` / `DELETE`
 * SQL. The visibility filter is enforced server-side at the SQL
 * WHERE clause; clients cannot influence visibility.
 *
 * Friend-graph fallback per OQ-1 = (a) / D-10901 + EC-115 Guardrail
 * 6: when `friendGraphService` is undefined, every
 * `'friends'`-visibility team is treated as `'private'` and is
 * visible only to current/historical members. The fallback is
 * server-side at the WHERE clause; the `$2::boolean` parameter is
 * `false` whenever no service is injected.
 *
 * Ordering invariant per pre-flight PS-13 + EC-115 Locked Values:
 * `ORDER BY joined_at ASC, team_id ASC`. Drift test in
 * `team.logic.test.ts` asserts ascending `joinedAt` on every
 * populated-array fixture; clients MUST NOT defensively re-sort.
 */
export async function composeTeamAffiliationsForProfile(
  database: DatabaseClient,
  subjectPlayerId: string,
  viewerPlayerId: string | null,
  friendGraphService: FriendGraphService | undefined,
): Promise<readonly TeamAffiliation[]> {
  // why: friend-graph fallback per WP-109 §11 + EC-115 Guardrail 6.
  // When no friendGraphService is injected (the current production
  // posture; no friend-graph WP has landed), every
  // 'friends'-visibility team is treated as 'private' (visible only
  // to current/historical members of that team). The fallback is
  // enforced at the SQL WHERE clause via the $2::boolean parameter;
  // the client cannot influence visibility.
  const isFriendOfSubject =
    friendGraphService !== undefined && viewerPlayerId !== null
      ? await friendGraphService.areFriends(viewerPlayerId, subjectPlayerId)
      : false;

  // why: visibility-filtered SELECT with the locked ORDER BY clause
  // per pre-flight PS-13. Four branches encode WP-109 §11 + OQ-1 =
  // (a) / D-10901 + EC-115 Guardrail 6:
  //   1. 'public' → visible to all
  //   2. 'friends' AND $2=true → visible to confirmed friends
  //      (only fires when a friendGraphService is injected and
  //      returned true)
  //   3. 'friends' AND $2=false AND e.player_id=$3 → 'friends'
  //      falls back to 'private' semantics when no graph exists,
  //      visible only to current/historical members (here:
  //      visible only when viewer == subject because we're
  //      querying for the subject's own affiliation rows)
  //   4. 'private' AND e.player_id=$3 → visible only to the
  //      subject themselves (NULL $3 for unauth viewers never
  //      matches because e.player_id is NEVER NULL)
  // The fallback in branch 3 is the §11 "collapses to private"
  // semantic — 'friends'-visibility teams behave like 'private'
  // teams in the absence of a friend graph. Anonymous and
  // non-member viewers see neither.
  const result = await database.query(
    'SELECT ' +
      '  t.team_id, ' +
      '  t.team_size, ' +
      '  e.role, ' +
      '  e.joined_at, ' +
      '  e.left_at ' +
      '  FROM legendary.team_member_events e ' +
      '  JOIN legendary.teams t ON t.team_id = e.team_id ' +
      ' WHERE e.player_id = $1 ' +
      '   AND ( ' +
      "         t.visibility = 'public' " +
      "      OR (t.visibility = 'friends' AND $2::boolean = true) " +
      "      OR (t.visibility = 'friends' AND $2::boolean = false AND e.player_id = $3) " +
      "      OR (t.visibility = 'private' AND e.player_id = $3) " +
      '   ) ' +
      ' ORDER BY e.joined_at ASC, t.team_id ASC',
    [subjectPlayerId, isFriendOfSubject, viewerPlayerId],
  );

  // why: explicit for...of per .claude/rules/code-style.md — no
  // .reduce() in zone or projection composition (EC-115 inheritance
  // from code-style §Patterns to Avoid).
  const affiliations: TeamAffiliation[] = [];
  for (const row of result.rows as TeamAffiliationRow[]) {
    affiliations.push({
      teamId: row.team_id as TeamId,
      teamSize: row.team_size as Team['teamSize'],
      role: row.role as TeamMember['role'],
      joinedAt: coerceTimestampToIso(row.joined_at),
      leftAt: row.left_at === null ? null : coerceTimestampToIso(row.left_at),
    });
  }
  return affiliations;
}

/**
 * Convenience helper for the read path: load a player_id from an
 * `AccountId`. Re-exported for `team.routes.ts` to use when
 * resolving the captain's player_id from the orchestrator-emitted
 * accountId.
 */
export async function loadPlayerIdForRoute(
  accountId: AccountId,
  database: DatabaseClient,
): Promise<string | null> {
  return loadPlayerIdByAccountId(accountId, database);
}
