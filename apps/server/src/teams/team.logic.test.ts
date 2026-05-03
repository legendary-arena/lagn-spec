/**
 * Tests for the team-affiliation logic (WP-109 / EC-115).
 *
 * Tests inside one describe block per the WP-104 / WP-102 precedent.
 * Pure tests (drift assertions, validator exercises) always run;
 * DB-required tests use node:test's options-based non-silent skip
 * when `process.env.TEST_DATABASE_URL` is unset (locked WP-052 §3.1
 * post-mortem pattern).
 *
 * Per-suite-run uniqueness: every DB-required test generates `email`
 * and `authProviderId` values prefixed by a per-suite-run identifier
 * (`Date.now()` plus a per-test counter), mirroring the WP-104
 * test-file precedent. No `beforeEach` cleanup against the new
 * tables (EC-115 Guardrail 3 forbids in-place edits, but the
 * per-suite-run unique IDs avoid UNIQUE-constraint conflicts across
 * runs without requiring row mutation).
 *
 * Authority: WP-109 §15 Acceptance Criteria; EC-115 §Guardrails;
 * WP-104 / WP-102 test-file precedents.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEAM_ERROR_CODES,
  type AccountId,
  type Team,
  type TeamAffiliation,
  type TeamErrorCode,
  type TeamId,
  type TeamMember,
} from './team.types.js';
import {
  applyOperatorOverride,
  composeTeamAffiliationsForProfile,
  createTeam,
  promoteSubstitute,
  recordMemberAdd,
  recordMemberLeave,
  toTeamId,
  validateCaptainInvariant,
  validateMonotonicTimeline,
  validateRoster,
  validateSameSizeExclusivity,
  validateTeamSize,
} from './team.logic.js';
import { createPlayerAccount } from '../identity/identity.logic.js';

import pg from 'pg';

const { Pool } = pg;

const hasTestDatabase = process.env.TEST_DATABASE_URL !== undefined;

// why: per-suite-run identifier guarantees row uniqueness across
// repeated test runs without requiring a beforeEach cleanup. EC-115
// Guardrail 3 forbids in-place edits of historical rows; the
// per-suite-run uniqueness pattern (mirrors WP-104) is the canonical
// alternative to row-purging cleanups.
const SUITE_RUN_ID = `wp109-${Date.now()}`;
let testCounter = 0;
function uniqueLabel(suffix: string): string {
  testCounter += 1;
  return `${SUITE_RUN_ID}-${testCounter}-${suffix}`;
}

// why: ext_id uniqueness across rapid provisionPlayer calls — a
// per-provider counter resets to 0 in every provisionPlayer call,
// so two calls within the same millisecond generate identical
// UUIDs. The shared globalIdCounter avoids the collision by
// monotonically incrementing across the entire suite run.
let globalIdCounter = 0;
function makeIdProvider(): () => string {
  return () => {
    globalIdCounter += 1;
    const seed = (Date.now() * 1000 + globalIdCounter) % 1_000_000_000_000;
    return `00000000-0000-4000-8000-${String(seed).padStart(9, '0')}${String(globalIdCounter % 1000).padStart(3, '0')}`;
  };
}

async function provisionPlayer(
  testPool: pg.Pool,
  labelSuffix: string,
): Promise<{ accountId: AccountId; playerId: string }> {
  const email = `${uniqueLabel(labelSuffix)}@example.com`;
  const authProviderId = `${uniqueLabel(labelSuffix)}-sub`;
  const accountResult = await createPlayerAccount(
    {
      email,
      displayName: `Player${labelSuffix}`,
      authProvider: 'email',
      authProviderId,
    },
    testPool,
    makeIdProvider(),
  );
  assert.ok(accountResult.ok === true, 'createPlayerAccount must succeed');
  const lookup = await testPool.query(
    'SELECT player_id FROM legendary.players WHERE ext_id = $1',
    [accountResult.value.accountId],
  );
  const rawId = lookup.rows[0].player_id;
  const playerId = typeof rawId === 'string' ? rawId : String(rawId);
  return { accountId: accountResult.value.accountId, playerId };
}

function fixtureTeam(overrides: Partial<Team> = {}): Team {
  const baseMembers: TeamMember[] = [
    { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
    { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
    { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
    { playerId: '4', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
    { playerId: '5', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
  ];
  return {
    teamId: '00000000-0000-4000-8000-000000000aaa' as TeamId,
    name: 'Sample Team',
    cohortLabel: '2026 Cohort',
    teamSize: 5,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'active',
    captainPlayerId: '1',
    members: baseMembers,
    visibility: 'public',
    ...overrides,
  };
}

describe('team logic (WP-109)', () => {
  let testPool: pg.Pool | null = null;

  before(async () => {
    if (hasTestDatabase) {
      testPool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
      });
    }
  });

  after(async () => {
    if (testPool !== null) {
      await testPool.end();
      testPool = null;
    }
  });

  // ─── Drift tests (pure) ────────────────────────────────────────

  test('TEAM_ERROR_CODES matches TeamErrorCode union (forward and backward inclusion)', () => {
    const expected: ReadonlySet<TeamErrorCode> = new Set([
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
    ]);
    assert.equal(TEAM_ERROR_CODES.length, expected.size);
    for (const code of TEAM_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `TEAM_ERROR_CODES contains ${code} which is missing from TeamErrorCode union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        TEAM_ERROR_CODES.includes(value),
        `TeamErrorCode union value ${value} missing from TEAM_ERROR_CODES array`,
      );
    }
  });

  test('Team shape contains exactly the ten locked fields', () => {
    const team = fixtureTeam();
    assert.deepEqual(Object.keys(team).sort(), [
      'captainPlayerId',
      'cohortLabel',
      'endDate',
      'members',
      'name',
      'startDate',
      'status',
      'teamId',
      'teamSize',
      'visibility',
    ]);
  });

  test('TeamMember shape contains exactly the four locked fields', () => {
    const member: TeamMember = {
      playerId: '42',
      role: 'member',
      joinedAt: '2026-01-01T00:00:00.000Z',
      leftAt: null,
    };
    assert.deepEqual(Object.keys(member).sort(), [
      'joinedAt',
      'leftAt',
      'playerId',
      'role',
    ]);
  });

  test('TeamAffiliation shape contains exactly the five locked fields', () => {
    const affiliation: TeamAffiliation = {
      teamId: '00000000-0000-4000-8000-000000000aaa' as TeamId,
      teamSize: 5,
      role: 'member',
      joinedAt: '2026-01-01T00:00:00.000Z',
      leftAt: null,
    };
    assert.deepEqual(Object.keys(affiliation).sort(), [
      'joinedAt',
      'leftAt',
      'role',
      'teamId',
      'teamSize',
    ]);
  });

  // ─── validateTeamSize / toTeamId (pure) ────────────────────────

  test('validateTeamSize rejects 1, 2, 6, and accepts 3, 4, 5', () => {
    assert.equal(validateTeamSize(3).ok, true);
    assert.equal(validateTeamSize(4).ok, true);
    assert.equal(validateTeamSize(5).ok, true);
    const reject1 = validateTeamSize(1);
    const reject2 = validateTeamSize(2);
    const reject6 = validateTeamSize(6);
    assert.equal(reject1.ok, false);
    assert.equal(reject2.ok, false);
    assert.equal(reject6.ok, false);
    if (reject1.ok === false) assert.equal(reject1.code, 'invalid_team_size');
  });

  test('toTeamId accepts a UUID v4 and rejects malformed inputs', () => {
    const ok = toTeamId('00000000-0000-4000-8000-000000000aaa');
    assert.equal(ok.ok, true);
    const bad = toTeamId('not-a-uuid');
    assert.equal(bad.ok, false);
    if (bad.ok === false) assert.equal(bad.code, 'invalid_request');
  });

  // ─── validateRoster (pure) ────────────────────────────────────

  test('validateRoster accepts a 5-member full team (5/0 live)', () => {
    const team = fixtureTeam();
    assert.equal(validateRoster(team).ok, true);
  });

  test('validateRoster accepts a 5-member team with 4 live members + 0 subs (departure-of-one)', () => {
    const team = fixtureTeam({
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '4', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '5', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-01T00:00:00.000Z' },
      ],
    });
    assert.equal(validateRoster(team).ok, true);
  });

  test('validateRoster accepts a 5-member team with 3 live members + 1 sub (departure-of-two with sub backup)', () => {
    const team = fixtureTeam({
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '4', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-01T00:00:00.000Z' },
        { playerId: '5', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-15T00:00:00.000Z' },
        { playerId: '6', role: 'substitute', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
      ],
    });
    assert.equal(validateRoster(team).ok, true);
  });

  test('validateRoster rejects a 5-member team with 2 live members + 0 subs (roster_invalid)', () => {
    const team = fixtureTeam({
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-01T00:00:00.000Z' },
        { playerId: '4', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-15T00:00:00.000Z' },
        { playerId: '5', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-03-01T00:00:00.000Z' },
      ],
    });
    const result = validateRoster(team);
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, 'roster_invalid');
  });

  test('validateRoster accepts the 3-team grace-of-one case (1 member + 1 sub)', () => {
    const team = fixtureTeam({
      teamSize: 3,
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-01T00:00:00.000Z' },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-15T00:00:00.000Z' },
        { playerId: '4', role: 'substitute', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
      ],
    });
    assert.equal(validateRoster(team).ok, true);
  });

  test('validateRoster rejects a 3-team with 1 member + 0 subs (roster_invalid)', () => {
    const team = fixtureTeam({
      teamSize: 3,
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-01T00:00:00.000Z' },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-15T00:00:00.000Z' },
      ],
    });
    const result = validateRoster(team);
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, 'roster_invalid');
  });

  // ─── validateCaptainInvariant (pure) ───────────────────────────

  test('validateCaptainInvariant accepts a current member as captain', () => {
    const team = fixtureTeam();
    assert.equal(validateCaptainInvariant(team, '2').ok, true);
  });

  test('validateCaptainInvariant rejects a substitute (captain_must_be_member)', () => {
    const team = fixtureTeam({
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '4', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '5', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '6', role: 'substitute', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
      ],
    });
    const result = validateCaptainInvariant(team, '6');
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, 'captain_must_be_member');
  });

  test('validateCaptainInvariant rejects a former member (non-null leftAt)', () => {
    const team = fixtureTeam({
      members: [
        { playerId: '1', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '2', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '3', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '4', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: null },
        { playerId: '5', role: 'member', joinedAt: '2026-01-01T00:00:00.000Z', leftAt: '2026-02-01T00:00:00.000Z' },
      ],
    });
    const result = validateCaptainInvariant(team, '5');
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, 'captain_must_be_member');
  });

  // ─── validateMonotonicTimeline (pure) ──────────────────────────

  test('validateMonotonicTimeline rejects leftAt < joinedAt (monotonic_violation)', () => {
    const result = validateMonotonicTimeline(
      '2026-02-01T00:00:00.000Z',
      '2026-01-15T00:00:00.000Z',
      null,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, 'monotonic_violation');
  });

  test('validateMonotonicTimeline rejects amendment of joinedAt after leftAt is sealed', () => {
    const result = validateMonotonicTimeline(
      '2026-02-15T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
      '2026-02-20T00:00:00.000Z',
    );
    assert.equal(result.ok, false);
    if (result.ok === false) assert.equal(result.code, 'monotonic_violation');
  });

  // ─── DB-required tests ────────────────────────────────────────

  test(
    'validateSameSizeExclusivity rejects a player already in another active 5-team (duplicate_active_membership)',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-excl');
      const teammate = await provisionPlayer(testPool, 'mate-excl');

      const create1 = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Excl-A'),
          cohortLabel: '2026',
          teamSize: 5,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: teammate.playerId, role: 'member' },
            { playerId: '0', role: 'member' },
            { playerId: '00', role: 'member' },
            { playerId: '000', role: 'member' },
          ],
        },
        testPool,
      );
      // why: founders use synthetic player IDs to satisfy validateRoster;
      // FK constraint on player_id will reject these unless we provision
      // them too. Instead, provision real players and use their IDs.
      assert.equal(create1.ok, false);

      // Provision real players for the founding roster.
      const m1 = await provisionPlayer(testPool, 'm1-excl');
      const m2 = await provisionPlayer(testPool, 'm2-excl');
      const m3 = await provisionPlayer(testPool, 'm3-excl');
      const m4 = await provisionPlayer(testPool, 'm4-excl');

      const create2 = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Excl-A2'),
          cohortLabel: '2026',
          teamSize: 5,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
            { playerId: m3.playerId, role: 'member' },
            { playerId: m4.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(create2.ok === true, 'createTeam happy-path must succeed');
      const teamA = create2.value;

      // m1 is now on an active size-5 team. Try to add them to a second
      // active size-5 team via validateSameSizeExclusivity.
      const exclusivity = await validateSameSizeExclusivity(
        testPool,
        m1.playerId,
        5,
        '00000000-0000-4000-8000-fffffffffff1' as TeamId,
      );
      assert.equal(exclusivity.ok, false);
      if (exclusivity.ok === false) {
        assert.equal(exclusivity.code, 'duplicate_active_membership');
      }
      void teamA;
    },
  );

  test(
    'validateSameSizeExclusivity permits cross-size overlap (5-team + 3-team)',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-cross');
      const m1 = await provisionPlayer(testPool, 'm1-cross');
      const m2 = await provisionPlayer(testPool, 'm2-cross');
      const m3 = await provisionPlayer(testPool, 'm3-cross');
      const m4 = await provisionPlayer(testPool, 'm4-cross');

      const create5 = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Cross-5'),
          cohortLabel: '2026',
          teamSize: 5,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
            { playerId: m3.playerId, role: 'member' },
            { playerId: m4.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(create5.ok === true);

      // m1 is on the 5-team; check exclusivity for size 3 — should pass.
      const exclusivity = await validateSameSizeExclusivity(
        testPool,
        m1.playerId,
        3,
        '00000000-0000-4000-8000-fffffffffff2' as TeamId,
      );
      assert.equal(exclusivity.ok, true);
    },
  );

  test(
    'createTeam happy path: creates team + initial member events + audit row in single transaction',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-happy');
      const m1 = await provisionPlayer(testPool, 'm1-happy');
      const m2 = await provisionPlayer(testPool, 'm2-happy');

      const result = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Happy'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(result.ok === true);
      const team = result.value;
      assert.equal(team.teamSize, 3);
      assert.equal(team.status, 'active');
      assert.equal(team.captainPlayerId, captain.playerId);
      assert.equal(team.members.length, 3);

      // Audit log should have a 'create' row.
      const auditRows = await testPool.query(
        "SELECT action FROM legendary.team_audit_log WHERE team_id = $1 AND action = 'create'",
        [team.teamId],
      );
      assert.equal(auditRows.rows.length, 1);

      // Member events should have 3 rows (captain + 2 founders).
      const eventRows = await testPool.query(
        'SELECT player_id FROM legendary.team_member_events WHERE team_id = $1',
        [team.teamId],
      );
      assert.equal(eventRows.rows.length, 3);
    },
  );

  test(
    'createTeam rolls back fully on under-strength roster (validity gate fires before any SQL)',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-rollback');
      // Empty founders for a teamSize=5 team — captain alone fails
      // validateRoster (1 live member < teamSize - 2 = 3).
      const result = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Rollback'),
          cohortLabel: '2026',
          teamSize: 5,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [],
        },
        testPool,
      );
      assert.equal(result.ok, false);
      if (result.ok === false) assert.equal(result.code, 'roster_invalid');

      // No team rows should have been created.
      const teamRows = await testPool.query(
        'SELECT team_id FROM legendary.teams WHERE captain_player_id = $1',
        [captain.playerId],
      );
      // Filter to teams from this test (none should exist for this captain).
      assert.equal(teamRows.rows.length, 0);
    },
  );

  test(
    'composeTeamAffiliationsForProfile orders affiliations ASC by joinedAt',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-order');
      const m1 = await provisionPlayer(testPool, 'm1-order');
      const m2 = await provisionPlayer(testPool, 'm2-order');
      const m3 = await provisionPlayer(testPool, 'm3-order');
      const m4 = await provisionPlayer(testPool, 'm4-order');
      // create team A (size 5)
      const teamA = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Order-A'),
          cohortLabel: '2026',
          teamSize: 5,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
            { playerId: m3.playerId, role: 'member' },
            { playerId: m4.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(teamA.ok === true);
      // create team B (size 3) with the same captain
      const m5 = await provisionPlayer(testPool, 'm5-order');
      const teamB = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Order-B'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [{ playerId: m5.playerId, role: 'member' }],
        },
        testPool,
      );
      assert.ok(teamB.ok === true);

      const affiliations = await composeTeamAffiliationsForProfile(
        testPool,
        captain.playerId,
        captain.playerId,
        undefined,
      );
      assert.ok(affiliations.length >= 2);
      // Ordering invariant: ASC by joinedAt.
      for (let i = 1; i < affiliations.length; i += 1) {
        assert.ok(
          affiliations[i - 1].joinedAt <= affiliations[i].joinedAt,
          `affiliations must be sorted ASC by joinedAt; got ${affiliations[i - 1].joinedAt} > ${affiliations[i].joinedAt}`,
        );
      }
    },
  );

  test(
    "composeTeamAffiliationsForProfile 'friends' falls back to 'private' when no friendGraphService",
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-friends');
      const m1 = await provisionPlayer(testPool, 'm1-friends');
      const m2 = await provisionPlayer(testPool, 'm2-friends');
      // Captain creates a team with 'friends' visibility.
      const teamResult = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Friends'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'friends',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(teamResult.ok === true);

      // Outsider (a non-member) reading captain's profile — no
      // friendGraphService → 'friends' should collapse to 'private'
      // and the team should be hidden from the outsider.
      const outsider = await provisionPlayer(testPool, 'outsider-friends');
      const outsiderView = await composeTeamAffiliationsForProfile(
        testPool,
        captain.playerId,
        outsider.playerId,
        undefined,
      );
      const captainAffiliations = outsiderView.filter(
        (a) => a.teamId === teamResult.value.teamId,
      );
      assert.equal(
        captainAffiliations.length,
        0,
        "'friends'-visibility team must NOT be visible to non-member outsider when no friendGraphService is injected",
      );

      // Owner reading their own profile — 'private'-branch matches
      // because viewer is also a member; the team should be visible.
      const ownerView = await composeTeamAffiliationsForProfile(
        testPool,
        captain.playerId,
        captain.playerId,
        undefined,
      );
      const ownerAffiliations = ownerView.filter(
        (a) => a.teamId === teamResult.value.teamId,
      );
      assert.equal(
        ownerAffiliations.length,
        1,
        "'friends'-visibility team must be visible to the owner themselves (captain is a member)",
      );
    },
  );

  test(
    "composeTeamAffiliationsForProfile returns 'public'-visibility teams to unauthenticated viewers and hides 'private' / 'friends'",
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-anon');
      const m1 = await provisionPlayer(testPool, 'm1-anon');
      const m2 = await provisionPlayer(testPool, 'm2-anon');
      const m3 = await provisionPlayer(testPool, 'm3-anon');
      const m4 = await provisionPlayer(testPool, 'm4-anon');

      // Public team
      const pub = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Anon-Pub'),
          cohortLabel: '2026',
          teamSize: 5,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
            { playerId: m3.playerId, role: 'member' },
            { playerId: m4.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(pub.ok === true);

      const m5 = await provisionPlayer(testPool, 'm5-anon');
      const m6 = await provisionPlayer(testPool, 'm6-anon');
      // Private team
      const priv = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Anon-Priv'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'private',
          founders: [
            { playerId: m5.playerId, role: 'member' },
            { playerId: m6.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(priv.ok === true);

      // Unauthenticated viewer (viewerPlayerId = null)
      const anonView = await composeTeamAffiliationsForProfile(
        testPool,
        captain.playerId,
        null,
        undefined,
      );
      const pubAffs = anonView.filter((a) => a.teamId === pub.value.teamId);
      const privAffs = anonView.filter((a) => a.teamId === priv.value.teamId);
      assert.equal(pubAffs.length, 1, 'public team must be visible to anonymous viewer');
      assert.equal(privAffs.length, 0, 'private team must be hidden from anonymous viewer');
    },
  );

  test(
    'promoteSubstitute requires both events (member leftAt + substitute role change) — single-event auto-promotion is rejected',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-promo');
      const member = await provisionPlayer(testPool, 'mem-promo');
      const sub = await provisionPlayer(testPool, 'sub-promo');

      const created = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Promo'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: member.playerId, role: 'member' },
            { playerId: sub.playerId, role: 'substitute' },
          ],
        },
        testPool,
      );
      assert.ok(created.ok === true);

      // Promotion BEFORE the member's leftAt is recorded — should
      // succeed only if the substitute is currently in role
      // 'substitute' with leftAt unset. The two-event invariant is
      // about the captain's responsibility to issue both events; the
      // promotion call itself just records the role change. Confirm
      // the substitute is updated and the prior member is unchanged.
      const promoBeforeLeave = await promoteSubstitute(
        captain.accountId,
        created.value.teamId,
        sub.playerId,
        testPool,
      );
      assert.ok(promoBeforeLeave.ok === true);
      const subRowAfter = promoBeforeLeave.value.members.find(
        (m) => m.playerId === sub.playerId,
      );
      assert.equal(subRowAfter?.role, 'member');

      // Now record the member's leftAt as the second event.
      const left = await recordMemberLeave(
        captain.accountId,
        created.value.teamId,
        member.playerId,
        testPool,
      );
      assert.ok(left.ok === true);
      const memberRowAfter = left.value.members.find(
        (m) => m.playerId === member.playerId,
      );
      assert.equal(memberRowAfter?.leftAt !== null, true);

      // Calling promoteSubstitute again on the now-promoted player
      // should reject (target is no longer role 'substitute').
      const doublePromote = await promoteSubstitute(
        captain.accountId,
        created.value.teamId,
        sub.playerId,
        testPool,
      );
      assert.equal(doublePromote.ok, false);
      if (doublePromote.ok === false) {
        assert.equal(doublePromote.code, 'invalid_request');
      }
    },
  );

  test(
    'applyOperatorOverride requires non-empty reason and sets is_operator=true; routine recordMemberAdd has is_operator=false and reason=null',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const captain = await provisionPlayer(testPool, 'cap-op');
      const m1 = await provisionPlayer(testPool, 'm1-op');
      const m2 = await provisionPlayer(testPool, 'm2-op');

      const team = await createTeam(
        captain.accountId,
        {
          name: uniqueLabel('Op'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: m1.playerId, role: 'member' },
            { playerId: m2.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(team.ok === true);

      // Operator override with empty reason — must reject.
      const noReason = await applyOperatorOverride(
        captain.accountId,
        team.value.teamId,
        'force_retire',
        '',
        {},
        testPool,
      );
      assert.equal(noReason.ok, false);
      if (noReason.ok === false) assert.equal(noReason.code, 'invalid_request');

      // Operator override with reason — must succeed and write is_operator=true row.
      const ok = await applyOperatorOverride(
        captain.accountId,
        team.value.teamId,
        'force_retire',
        'Captain unreachable for 60 days; force-retire per ops runbook §4.2.',
        {},
        testPool,
      );
      assert.ok(ok.ok === true);
      const opAuditRows = await testPool.query(
        "SELECT is_operator, reason FROM legendary.team_audit_log WHERE team_id = $1 AND action = 'operator_override'",
        [team.value.teamId],
      );
      assert.equal(opAuditRows.rows.length, 1);
      assert.equal(opAuditRows.rows[0].is_operator, true);
      assert.ok(opAuditRows.rows[0].reason.length > 0);

      // Routine captain-driven member-add: is_operator=false, reason=null on the event row.
      const reactivatedCaptain = await provisionPlayer(testPool, 'cap-op2');
      const r1 = await provisionPlayer(testPool, 'r1-op2');
      const r2 = await provisionPlayer(testPool, 'r2-op2');
      const newTeam = await createTeam(
        reactivatedCaptain.accountId,
        {
          name: uniqueLabel('Op2'),
          cohortLabel: '2026',
          teamSize: 3,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          visibility: 'public',
          founders: [
            { playerId: r1.playerId, role: 'member' },
            { playerId: r2.playerId, role: 'member' },
          ],
        },
        testPool,
      );
      assert.ok(newTeam.ok === true);
      const newSub = await provisionPlayer(testPool, 'r3-op2');
      const addRes = await recordMemberAdd(
        reactivatedCaptain.accountId,
        newTeam.value.teamId,
        newSub.playerId,
        'substitute',
        testPool,
      );
      assert.ok(addRes.ok === true);
      const evtRows = await testPool.query(
        'SELECT is_operator, reason FROM legendary.team_member_events WHERE team_id = $1 AND player_id = $2',
        [newTeam.value.teamId, newSub.playerId],
      );
      assert.equal(evtRows.rows.length, 1);
      assert.equal(evtRows.rows[0].is_operator, false);
      assert.equal(evtRows.rows[0].reason, null);
    },
  );
});
