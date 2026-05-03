/**
 * Tests for the public profile composition (WP-102 / EC-117).
 *
 * Eight tests inside one describe block per WP-102 §Scope (In) §D.
 * Tests 1-3 are drift assertions on PROFILE_ERROR_CODES /
 * PublicProfileView shape / PublicReplaySummary shape. Tests 4-8
 * exercise getPublicProfileByHandle against a real PostgreSQL test
 * database; each uses node:test's options-based non-silent skip
 * when process.env.TEST_DATABASE_URL is unset (locked WP-052 §3.1
 * post-mortem pattern — see the inline conditional on each
 * DB-dependent test below for the exact form).
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_ERROR_CODES,
  type ProfileErrorCode,
  type PublicProfileView,
  type PublicReplaySummary,
} from './profile.types.js';
import { getPublicProfileByHandle } from './profile.logic.js';

import { createPlayerAccount } from '../identity/identity.logic.js';
import { claimHandle } from '../identity/handle.logic.js';

import pg from 'pg';

const { Pool } = pg;

const hasTestDatabase = process.env.TEST_DATABASE_URL !== undefined;

describe('public profile logic (WP-102)', () => {
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

  beforeEach(async () => {
    if (testPool !== null) {
      // why: legendary.competitive_scores and legendary.replay_ownership
      // both FK to legendary.players(player_id); delete dependents
      // first to avoid FK violations during cleanup. legendary.replay_blobs
      // has no FK to legendary.players but is cleared for hygiene.
      // FK-safe four-table ordering mirrors WP-101 handle.logic.test.ts.
      await testPool.query('DELETE FROM legendary.competitive_scores');
      await testPool.query('DELETE FROM legendary.replay_ownership');
      await testPool.query('DELETE FROM legendary.replay_blobs');
      await testPool.query('DELETE FROM legendary.players');
    }
  });

  test('PROFILE_ERROR_CODES matches ProfileErrorCode union (forward and backward inclusion)', () => {
    const expected: ReadonlySet<ProfileErrorCode> = new Set([
      'player_not_found',
    ]);
    assert.equal(PROFILE_ERROR_CODES.length, expected.size);
    for (const code of PROFILE_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `PROFILE_ERROR_CODES contains ${code} which is missing from ProfileErrorCode union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        PROFILE_ERROR_CODES.includes(value),
        `ProfileErrorCode union value ${value} missing from PROFILE_ERROR_CODES array`,
      );
    }
  });

  test('PublicProfileView shape contains exactly the five locked fields and no others', () => {
    const fixture: PublicProfileView = {
      handleCanonical: 'alice',
      displayHandle: 'Alice',
      displayName: 'Alice Example',
      publicReplays: [],
      teamAffiliations: [],
    };
    const keys = Object.keys(fixture).sort();
    assert.deepEqual(keys, [
      'displayHandle',
      'displayName',
      'handleCanonical',
      'publicReplays',
      'teamAffiliations',
    ]);
  });

  test('PublicReplaySummary shape contains exactly the four locked fields and no others', () => {
    const fixture: PublicReplaySummary = {
      replayHash: '0123456789abcdef',
      scenarioKey: 'scheme-portal-of-doom',
      visibility: 'public',
      createdAt: '2026-04-28T12:00:00.000Z',
    };
    const keys = Object.keys(fixture).sort();
    assert.deepEqual(keys, [
      'createdAt',
      'replayHash',
      'scenarioKey',
      'visibility',
    ]);
  });

  test(
    'getPublicProfileByHandle returns 404 player_not_found for an unclaimed handle',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      const result = await getPublicProfileByHandle('ghost', testPool);
      assert.equal(result.ok, false);
      if (result.ok === false) {
        assert.equal(result.code, 'player_not_found');
        assert.ok(
          result.reason.includes('ghost'),
          'reason string should name the canonical handle that was not found',
        );
      }
    },
  );

  test(
    'getPublicProfileByHandle returns four-field view with empty publicReplays for a claimed handle that has no replay rows',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      let counter = 0;
      const idProvider = () =>
        `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

      const accountResult = await createPlayerAccount(
        {
          email: 'alice@example.com',
          displayName: 'Alice Example',
          authProvider: 'email',
          authProviderId: 'alice@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);
      const claimResult = await claimHandle(
        accountResult.value.accountId,
        'Alice',
        testPool,
      );
      assert.ok(claimResult.ok === true);

      const result = await getPublicProfileByHandle('alice', testPool);
      assert.equal(result.ok, true);
      if (result.ok === true) {
        assert.equal(result.value.handleCanonical, 'alice');
        assert.equal(result.value.displayHandle, 'Alice');
        assert.equal(result.value.displayName, 'Alice Example');
        assert.deepEqual(result.value.publicReplays, []);
        // why: WP-109 PS-3 — PublicProfileView extends from 4 to 5
        // keys with teamAffiliations[]. Empty for a player with no
        // memberships.
        assert.deepEqual(result.value.teamAffiliations, []);
        assert.deepEqual(Object.keys(result.value).sort(), [
          'displayHandle',
          'displayName',
          'handleCanonical',
          'publicReplays',
          'teamAffiliations',
        ]);
      }
    },
  );

  test(
    'getPublicProfileByHandle returns empty teamAffiliations when player has no team memberships (WP-109 fixture)',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      let counter = 0;
      const idProvider = () =>
        `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

      const accountResult = await createPlayerAccount(
        {
          email: 'noteam@example.com',
          displayName: 'No Team',
          authProvider: 'email',
          authProviderId: 'noteam@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);
      const claimResult = await claimHandle(
        accountResult.value.accountId,
        'noteam',
        testPool,
      );
      assert.ok(claimResult.ok === true);

      const result = await getPublicProfileByHandle('noteam', testPool);
      assert.equal(result.ok, true);
      if (result.ok === true) {
        assert.deepEqual(
          result.value.teamAffiliations,
          [],
          'player with zero team memberships must yield empty teamAffiliations[]',
        );
      }
    },
  );

  test(
    "getPublicProfileByHandle exposes 'public'-visibility team affiliations and hides 'private' / 'friends' (no friend graph) (WP-109 fixture)",
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      let counter = 0;
      const idProvider = () =>
        `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

      // Provision the subject (handle owner).
      const subjectResult = await createPlayerAccount(
        {
          email: 'subject@example.com',
          displayName: 'Subject',
          authProvider: 'email',
          authProviderId: 'subject@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(subjectResult.ok === true);
      const claim = await claimHandle(subjectResult.value.accountId, 'subject', testPool);
      assert.ok(claim.ok === true);
      const subjectLookup = await testPool.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1',
        [subjectResult.value.accountId],
      );
      const subjectPlayerId = String(subjectLookup.rows[0].player_id);

      // Provision two other players for founders.
      const f1 = await createPlayerAccount(
        {
          email: 'f1@example.com',
          displayName: 'F1',
          authProvider: 'email',
          authProviderId: 'f1@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(f1.ok === true);
      const f2 = await createPlayerAccount(
        {
          email: 'f2@example.com',
          displayName: 'F2',
          authProvider: 'email',
          authProviderId: 'f2@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(f2.ok === true);
      const f1Lookup = await testPool.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1',
        [f1.value.accountId],
      );
      const f2Lookup = await testPool.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1',
        [f2.value.accountId],
      );
      const f1PlayerId = String(f1Lookup.rows[0].player_id);
      const f2PlayerId = String(f2Lookup.rows[0].player_id);

      // Insert a 'public'-visibility team and a 'private'-visibility
      // team with the subject as captain. (Direct INSERTs are used
      // here rather than calling team.logic.createTeam to keep the
      // test independent of the team module's roster validator —
      // these fixtures are about the visibility filter on the read
      // composer.)
      await testPool.query(
        "INSERT INTO legendary.teams (team_id, name, cohort_label, team_size, start_date, end_date, status, captain_player_id, visibility) " +
          "VALUES ('00000000-0000-4000-8000-aaaaaaaaaaaa', 'Pub', '2026', 3, '2026-01-01', '2026-12-31', 'active', $1, 'public'), " +
          "       ('00000000-0000-4000-8000-bbbbbbbbbbbb', 'Priv', '2026', 3, '2026-01-01', '2026-12-31', 'active', $1, 'private')",
        [subjectPlayerId],
      );
      await testPool.query(
        'INSERT INTO legendary.team_member_events (team_id, player_id, team_size, role, joined_at, actor_id) ' +
          "VALUES ('00000000-0000-4000-8000-aaaaaaaaaaaa', $1, 3, 'member', now(), $1), " +
          "       ('00000000-0000-4000-8000-aaaaaaaaaaaa', $2, 3, 'member', now(), $1), " +
          "       ('00000000-0000-4000-8000-bbbbbbbbbbbb', $1, 3, 'member', now(), $1), " +
          "       ('00000000-0000-4000-8000-bbbbbbbbbbbb', $3, 3, 'member', now(), $1)",
        [subjectPlayerId, f1PlayerId, f2PlayerId],
      );

      const result = await getPublicProfileByHandle('subject', testPool);
      assert.equal(result.ok, true);
      if (result.ok === true) {
        // Public profile read = anonymous viewer = only 'public' visible.
        assert.equal(result.value.teamAffiliations.length, 1);
        assert.equal(
          result.value.teamAffiliations[0].teamId,
          '00000000-0000-4000-8000-aaaaaaaaaaaa',
        );
      }
    },
  );

  test(
    'getPublicProfileByHandle excludes private replays and returns only public + link visibility rows',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      let counter = 0;
      const idProvider = () =>
        `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

      const accountResult = await createPlayerAccount(
        {
          email: 'bob@example.com',
          displayName: 'Bob Example',
          authProvider: 'email',
          authProviderId: 'bob@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);
      const claimResult = await claimHandle(
        accountResult.value.accountId,
        'bob',
        testPool,
      );
      assert.ok(claimResult.ok === true);

      const playerLookup = await testPool.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1',
        [accountResult.value.accountId],
      );
      const playerId = playerLookup.rows[0].player_id;

      await testPool.query(
        'INSERT INTO legendary.replay_ownership ' +
          '(player_id, replay_hash, scenario_key, visibility, expires_at) ' +
          "VALUES ($1, 'hash-private', 'scheme-private', 'private', NULL), " +
          "       ($1, 'hash-public', 'scheme-public', 'public', NULL), " +
          "       ($1, 'hash-link',   'scheme-link',   'link',   NULL)",
        [playerId],
      );

      const result = await getPublicProfileByHandle('bob', testPool);
      assert.equal(result.ok, true);
      if (result.ok === true) {
        assert.equal(result.value.publicReplays.length, 2);
        const hashes = result.value.publicReplays.map((r) => r.replayHash).sort();
        assert.deepEqual(hashes, ['hash-link', 'hash-public']);
        for (const summary of result.value.publicReplays) {
          assert.notEqual(summary.visibility, 'private');
        }
        assert.ok(
          JSON.stringify(result.value).includes('private') === false,
          "the response JSON must never contain the literal string 'private'",
        );
      }
    },
  );

  test(
    'getPublicProfileByHandle excludes expired replays whose expires_at is in the past',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      let counter = 0;
      const idProvider = () =>
        `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

      const accountResult = await createPlayerAccount(
        {
          email: 'carol@example.com',
          displayName: 'Carol Example',
          authProvider: 'email',
          authProviderId: 'carol@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);
      const claimResult = await claimHandle(
        accountResult.value.accountId,
        'carol',
        testPool,
      );
      assert.ok(claimResult.ok === true);

      const playerLookup = await testPool.query(
        'SELECT player_id FROM legendary.players WHERE ext_id = $1',
        [accountResult.value.accountId],
      );
      const playerId = playerLookup.rows[0].player_id;

      await testPool.query(
        'INSERT INTO legendary.replay_ownership ' +
          '(player_id, replay_hash, scenario_key, visibility, expires_at) ' +
          "VALUES ($1, 'hash-expired', 'scheme-expired', 'public', now() - INTERVAL '1 day'), " +
          "       ($1, 'hash-future',  'scheme-future',  'public', now() + INTERVAL '1 day')",
        [playerId],
      );

      const result = await getPublicProfileByHandle('carol', testPool);
      assert.equal(result.ok, true);
      if (result.ok === true) {
        assert.equal(result.value.publicReplays.length, 1);
        assert.equal(result.value.publicReplays[0].replayHash, 'hash-future');
      }
    },
  );

  test(
    'getPublicProfileByHandle resolves case-insensitively against the canonical handle',
    hasTestDatabase ? {} : { skip: 'requires test database' },
    async () => {
      assert.ok(testPool !== null);
      let counter = 0;
      const idProvider = () =>
        `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`;

      const accountResult = await createPlayerAccount(
        {
          email: 'dave@example.com',
          displayName: 'Dave Example',
          authProvider: 'email',
          authProviderId: 'dave@example.com',
        },
        testPool,
        idProvider,
      );
      assert.ok(accountResult.ok === true);
      const claimResult = await claimHandle(
        accountResult.value.accountId,
        'Dave',
        testPool,
      );
      assert.ok(claimResult.ok === true);

      const lower = await getPublicProfileByHandle('dave', testPool);
      const upper = await getPublicProfileByHandle('DAVE', testPool);
      const mixed = await getPublicProfileByHandle('  DaVe  ', testPool);

      assert.equal(lower.ok, true);
      assert.equal(upper.ok, true);
      assert.equal(mixed.ok, true);
      if (lower.ok === true && upper.ok === true && mixed.ok === true) {
        assert.equal(lower.value.handleCanonical, 'dave');
        assert.equal(upper.value.handleCanonical, 'dave');
        assert.equal(mixed.value.handleCanonical, 'dave');
        assert.equal(lower.value.displayHandle, 'Dave');
        assert.equal(upper.value.displayHandle, 'Dave');
        assert.equal(mixed.value.displayHandle, 'Dave');
      }
    },
  );
});
