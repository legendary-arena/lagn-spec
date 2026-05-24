/**
 * Tests for the admin-profile logic (WP-107 / EC-195).
 *
 * Logic-pure suite: every test uses an injected fake `DatabaseClient`
 * (or a transaction-scoped fake pool client) — no live database, no
 * network. Tests cover:
 *
 *   - Drift detection on `ADMIN_PROFILE_ERROR_CODES` +
 *     `ADMIN_PLAYER_ACTION_TYPES` (forward + backward inclusion + size)
 *   - Closed-shape assertion on `AdminProfileResponse`
 *   - `suspendPlayer` happy path: transaction order is
 *     `BEGIN -> UPDATE players -> INSERT admin_actions -> COMMIT`;
 *     audit row carries trimmed reason; returns ok with actionId
 *   - `unsuspendPlayer` happy path (same transaction shape; mutation
 *     uses targetFlag=false)
 *   - Idempotent re-suspend: column UPDATE is unconditional set; audit
 *     row IS still written (idempotent at column, observable at log)
 *   - Reason validation: empty / whitespace-only / over-cap rejected
 *     BEFORE any DB call fires
 *   - Audit-INSERT failure -> ROLLBACK; returns internal_error; no
 *     COMMIT fires
 *   - `getAdminProfileView`: handle not found returns `'not_found'`
 *   - `getAdminProfileView`: profile + audit-log SELECTs share a
 *     single REPEATABLE READ transaction (transaction order verified)
 *   - `getAdminActionsForPlayer`: query includes LIMIT 100 and
 *     `ORDER BY created_at DESC, action_id DESC` (verbatim)
 *
 * Authority: WP-107 §Acceptance Criteria + §Verification Steps;
 * EC-195 §Locked Values + §Guardrails; D-10701..D-10703.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdminActionsForPlayer,
  getAdminProfileView,
  resolveHandleToAccountId,
  suspendPlayer,
  unsuspendPlayer,
} from './adminProfile.logic.js';
import {
  ADMIN_PLAYER_ACTION_TYPES,
  ADMIN_PROFILE_ERROR_CODES,
} from './adminProfile.types.js';
import type {
  AdminPlayerActionType,
  AdminProfileErrorCode,
  AdminProfileResponse,
} from './adminProfile.types.js';
import type {
  AccountId,
  DatabaseClient,
} from '../../identity/identity.types.js';

const ACTING_ADMIN_ID = 'aaaaaaaa-1111-4444-9999-aaaaaaaaaaaa' as AccountId;
const TARGET_PLAYER_ID = 'bbbbbbbb-2222-4444-9999-bbbbbbbbbbbb' as AccountId;
const TARGET_HANDLE_CANONICAL = 'targetplayer';
const TARGET_HANDLE_DISPLAY = 'TargetPlayer';

interface QueryCall {
  readonly sql: string;
  readonly params: unknown;
}

interface FakeQueryResult {
  rows: readonly unknown[];
}

/**
 * Pool-client fake (the value returned by `pool.connect()`). Records
 * every `query` call in the supplied `calls` array; consults
 * `responseQueue` for the per-call response; explicit `throwAtIndex`
 * causes the n-th query (0-based) to throw a synthetic error.
 */
function makePoolClient(
  calls: QueryCall[],
  responseQueue: readonly FakeQueryResult[],
  throwAtIndex: number = -1,
): {
  query: (sql: string, params?: unknown) => Promise<FakeQueryResult>;
  release: () => void;
  released: { value: boolean };
} {
  const released = { value: false };
  let nextIndex = 0;
  return {
    async query(sql: string, params?: unknown): Promise<FakeQueryResult> {
      const index = nextIndex;
      nextIndex += 1;
      calls.push({ sql, params });
      if (index === throwAtIndex) {
        throw new Error(`simulated DB fault at query #${index}`);
      }
      // why: fall back to an empty-rows response if the queue is
      // shorter than the call sequence. The tests below always seed
      // an explicit response for every meaningful query; the fallback
      // protects against off-by-one errors in test setup without
      // crashing the production code.
      return responseQueue[index] ?? { rows: [] };
    },
    release(): void {
      released.value = true;
    },
    released,
  };
}

/**
 * Fake `DatabaseClient` (a `pg.Pool` alias). Supports both the
 * `database.query(...)` direct-call shape (consumed by
 * `getAdminActionsForPlayer` and `resolveHandleToAccountId`) AND the
 * `database.connect()` -> client shape (consumed by
 * `getAdminProfileView` and the two mutation helpers).
 */
function makeFakeDatabase(args: {
  directQueueCalls?: QueryCall[];
  directQueue?: readonly FakeQueryResult[];
  poolCalls?: QueryCall[];
  poolQueue?: readonly FakeQueryResult[];
  throwAtIndex?: number;
}): DatabaseClient & {
  released: { value: boolean };
} {
  const directCalls = args.directQueueCalls ?? [];
  const directQueue = args.directQueue ?? [];
  const poolCalls = args.poolCalls ?? [];
  const poolQueue = args.poolQueue ?? [];
  const throwAtIndex = args.throwAtIndex ?? -1;
  const poolClient = makePoolClient(poolCalls, poolQueue, throwAtIndex);
  let directIndex = 0;
  const fake = {
    async query(sql: string, params?: unknown): Promise<FakeQueryResult> {
      const index = directIndex;
      directIndex += 1;
      directCalls.push({ sql, params });
      return directQueue[index] ?? { rows: [] };
    },
    async connect() {
      return poolClient;
    },
    released: poolClient.released,
  };
  return fake as unknown as DatabaseClient & { released: { value: boolean } };
}

describe('adminProfile.logic (WP-107) — drift detection', () => {
  test('ADMIN_PROFILE_ERROR_CODES matches AdminProfileErrorCode union (forward + backward + size)', () => {
    const expected: ReadonlySet<AdminProfileErrorCode> = new Set([
      'unauthorized',
      'forbidden',
      'not_found',
      'invalid_request',
      'internal_error',
    ]);
    assert.equal(ADMIN_PROFILE_ERROR_CODES.length, expected.size);
    for (const code of ADMIN_PROFILE_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `ADMIN_PROFILE_ERROR_CODES contains ${code} which is missing from AdminProfileErrorCode union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        ADMIN_PROFILE_ERROR_CODES.includes(value),
        `AdminProfileErrorCode union value ${value} missing from ADMIN_PROFILE_ERROR_CODES array`,
      );
    }
  });

  test('ADMIN_PLAYER_ACTION_TYPES matches AdminPlayerActionType union (forward + backward + size)', () => {
    const expected: ReadonlySet<AdminPlayerActionType> = new Set([
      'suspend',
      'unsuspend',
    ]);
    assert.equal(ADMIN_PLAYER_ACTION_TYPES.length, expected.size);
    for (const code of ADMIN_PLAYER_ACTION_TYPES) {
      assert.ok(expected.has(code));
    }
    for (const value of expected) {
      assert.ok(ADMIN_PLAYER_ACTION_TYPES.includes(value));
    }
  });

  test('AdminProfileResponse shape carries exactly four fields', () => {
    const response: AdminProfileResponse = {
      accountId: TARGET_PLAYER_ID,
      handle: TARGET_HANDLE_CANONICAL,
      isSuspended: false,
      recentAuditLog: [],
    };
    const keys = Object.keys(response).sort();
    assert.deepEqual(keys, ['accountId', 'handle', 'isSuspended', 'recentAuditLog']);
  });
});

describe('adminProfile.logic (WP-107) — suspendPlayer + unsuspendPlayer happy paths', () => {
  test('suspendPlayer happy path: transaction order is BEGIN -> UPDATE -> INSERT RETURNING -> COMMIT; audit row carries trimmed reason; returns ok with actionId', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] }, // BEGIN
        { rows: [] }, // UPDATE
        { rows: [{ action_id: '42' }] }, // INSERT ... RETURNING
        { rows: [] }, // COMMIT
      ],
    });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      '   Score fraud confirmed via replay audit   ',
    );
    assert.deepStrictEqual(result, {
      ok: true,
      value: { actionId: '42' },
    });
    assert.equal(poolCalls.length, 4);
    assert.equal(poolCalls[0].sql, 'BEGIN');
    assert.ok(poolCalls[1].sql.includes('UPDATE legendary.players SET is_suspended'));
    assert.ok(poolCalls[1].sql.includes('WHERE ext_id = $2'));
    assert.deepStrictEqual(poolCalls[1].params, [true, TARGET_PLAYER_ID]);
    assert.ok(poolCalls[2].sql.includes('INSERT INTO legendary.admin_actions'));
    assert.ok(poolCalls[2].sql.includes('RETURNING action_id'));
    // Audit row carries the trimmed reason (leading/trailing spaces stripped)
    assert.deepStrictEqual(poolCalls[2].params, [
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'suspend',
      'Score fraud confirmed via replay audit',
    ]);
    assert.equal(poolCalls[3].sql, 'COMMIT');
    assert.equal(database.released.value, true);
  });

  test('unsuspendPlayer happy path: same transaction shape, UPDATE targetFlag=false, action_type=unsuspend', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] },
        { rows: [] },
        { rows: [{ action_id: 99 }] },
        { rows: [] },
      ],
    });
    const result = await unsuspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'False positive — appeal upheld',
    );
    assert.deepStrictEqual(result, {
      ok: true,
      value: { actionId: '99' }, // bigserial coerced to string at JSON boundary
    });
    assert.deepStrictEqual(poolCalls[1].params, [false, TARGET_PLAYER_ID]);
    assert.deepStrictEqual(poolCalls[2].params, [
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'unsuspend',
      'False positive — appeal upheld',
    ]);
  });

  test('Idempotent re-suspend: UPDATE is unconditional set (no SELECT first); audit row STILL written', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] },
        { rows: [] },
        { rows: [{ action_id: '101' }] },
        { rows: [] },
      ],
    });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'Re-issuing suspension after policy clarification',
    );
    assert.equal(result.ok, true);
    // The UPDATE is the SECOND call (after BEGIN); there is no SELECT
    // before it. Any read-modify-write would surface as an extra
    // SELECT query in the trace.
    assert.equal(poolCalls.length, 4);
    assert.equal(poolCalls[0].sql, 'BEGIN');
    assert.ok(poolCalls[1].sql.startsWith('UPDATE legendary.players SET is_suspended'));
    assert.ok(poolCalls[2].sql.startsWith('INSERT INTO legendary.admin_actions'));
    assert.equal(poolCalls[3].sql, 'COMMIT');
  });
});

describe('adminProfile.logic (WP-107) — reason validation', () => {
  test('Empty reason rejected before any DB call', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({ poolCalls });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      '',
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'invalid_request');
    }
    // ZERO DB calls fired
    assert.equal(poolCalls.length, 0);
  });

  test('Whitespace-only reason rejected (trim-then-validate)', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({ poolCalls });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      '       ',
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'invalid_request');
    }
    assert.equal(poolCalls.length, 0);
  });

  test('Reason exceeding 500 chars (post-trim) rejected', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({ poolCalls });
    const over500 = 'a'.repeat(501);
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      over500,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'invalid_request');
    }
    assert.equal(poolCalls.length, 0);
  });

  test('Reason exactly 500 chars (post-trim) accepted', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] },
        { rows: [] },
        { rows: [{ action_id: '7' }] },
        { rows: [] },
      ],
    });
    const exactly500 = 'b'.repeat(500);
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      exactly500,
    );
    assert.equal(result.ok, true);
  });

  test('Non-string reason rejected', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({ poolCalls });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      42 as unknown,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'invalid_request');
    }
    assert.equal(poolCalls.length, 0);
  });
});

describe('adminProfile.logic (WP-107) — transactional rollback on audit-INSERT failure', () => {
  test('Audit INSERT throws -> ROLLBACK fires; returns internal_error; no COMMIT', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] }, // BEGIN
        { rows: [] }, // UPDATE
        // INSERT throws (configured via throwAtIndex=2)
      ],
      throwAtIndex: 2,
    });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'Triggering injected fault',
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'internal_error');
    }
    // Expected call sequence: BEGIN, UPDATE, INSERT (throws),
    // ROLLBACK. No COMMIT.
    assert.equal(poolCalls.length, 4);
    assert.equal(poolCalls[0].sql, 'BEGIN');
    assert.ok(poolCalls[1].sql.startsWith('UPDATE legendary.players'));
    assert.ok(poolCalls[2].sql.startsWith('INSERT INTO legendary.admin_actions'));
    assert.equal(poolCalls[3].sql, 'ROLLBACK');
    assert.equal(database.released.value, true);
  });

  test('UPDATE throws -> ROLLBACK fires; audit INSERT never attempted', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [{ rows: [] }],
      throwAtIndex: 1, // UPDATE throws
    });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'Triggering UPDATE fault',
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'internal_error');
    }
    // BEGIN, UPDATE (throws), ROLLBACK
    assert.equal(poolCalls.length, 3);
    assert.equal(poolCalls[0].sql, 'BEGIN');
    assert.ok(poolCalls[1].sql.startsWith('UPDATE legendary.players'));
    assert.equal(poolCalls[2].sql, 'ROLLBACK');
  });

  test('INSERT RETURNING zero rows -> ROLLBACK fires; returns internal_error', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] }, // BEGIN
        { rows: [] }, // UPDATE
        { rows: [] }, // INSERT returns 0 rows (impossible in practice; defensive)
      ],
    });
    const result = await suspendPlayer(
      database,
      ACTING_ADMIN_ID,
      TARGET_PLAYER_ID,
      'Defensive zero-row test',
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'internal_error');
    }
    assert.equal(poolCalls.length, 4);
    assert.equal(poolCalls[3].sql, 'ROLLBACK');
  });
});

describe('adminProfile.logic (WP-107) — getAdminProfileView snapshot consistency', () => {
  test('Profile + audit-log SELECTs share single REPEATABLE READ transaction', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] }, // BEGIN ISOLATION LEVEL REPEATABLE READ
        {
          rows: [
            {
              ext_id: TARGET_PLAYER_ID,
              handle_canonical: TARGET_HANDLE_CANONICAL,
              display_handle: TARGET_HANDLE_DISPLAY,
              is_suspended: true,
            },
          ],
        }, // profile SELECT
        {
          rows: [
            {
              action_id: '7',
              acting_account_id: ACTING_ADMIN_ID,
              action_type: 'suspend',
              reason: 'Score fraud',
              created_at: new Date('2026-05-24T12:00:00Z'),
            },
          ],
        }, // audit SELECT
        { rows: [] }, // COMMIT
      ],
    });
    const result = await getAdminProfileView(database, TARGET_HANDLE_CANONICAL);
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.deepStrictEqual(result.value, {
        accountId: TARGET_PLAYER_ID,
        handle: TARGET_HANDLE_CANONICAL,
        isSuspended: true,
        recentAuditLog: [
          {
            actionId: '7',
            actingAccountId: ACTING_ADMIN_ID,
            actionType: 'suspend',
            reason: 'Score fraud',
            createdAt: '2026-05-24T12:00:00.000Z',
          },
        ],
      });
    }
    assert.equal(poolCalls.length, 4);
    assert.equal(poolCalls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ');
    assert.ok(poolCalls[1].sql.includes('FROM legendary.players'));
    assert.ok(poolCalls[1].sql.includes('WHERE handle_canonical = $1'));
    assert.ok(poolCalls[2].sql.includes('FROM legendary.admin_actions'));
    assert.ok(poolCalls[2].sql.includes('ORDER BY created_at DESC, action_id DESC'));
    assert.ok(poolCalls[2].sql.includes('LIMIT $2'));
    assert.equal(poolCalls[3].sql, 'COMMIT');
  });

  test('Handle not found returns not_found (audit-log SELECT never fires)', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [
        { rows: [] }, // BEGIN
        { rows: [] }, // profile SELECT — zero rows
        { rows: [] }, // COMMIT
      ],
    });
    const result = await getAdminProfileView(database, 'nonexistent');
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'not_found');
    }
    // BEGIN, profile SELECT, COMMIT — no audit-log SELECT (only 3
    // calls, not 4)
    assert.equal(poolCalls.length, 3);
    assert.equal(poolCalls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ');
    assert.ok(poolCalls[1].sql.includes('FROM legendary.players'));
    assert.equal(poolCalls[2].sql, 'COMMIT');
  });

  test('Profile SELECT throws -> ROLLBACK fires; returns internal_error', async () => {
    const poolCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      poolCalls,
      poolQueue: [{ rows: [] }],
      throwAtIndex: 1,
    });
    const result = await getAdminProfileView(database, TARGET_HANDLE_CANONICAL);
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.code, 'internal_error');
    }
    assert.equal(poolCalls[poolCalls.length - 1].sql, 'ROLLBACK');
  });
});

describe('adminProfile.logic (WP-107) — getAdminActionsForPlayer', () => {
  test('Query includes LIMIT and ORDER BY (verbatim) with action_id tiebreaker', async () => {
    const directCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      directQueueCalls: directCalls,
      directQueue: [
        {
          rows: [
            {
              action_id: '12',
              acting_account_id: ACTING_ADMIN_ID,
              action_type: 'unsuspend',
              reason: 'Appeal granted',
              created_at: '2026-05-24T11:00:00.000Z',
            },
          ],
        },
      ],
    });
    const entries = await getAdminActionsForPlayer(database, TARGET_PLAYER_ID);
    assert.equal(entries.length, 1);
    assert.deepStrictEqual(entries[0], {
      actionId: '12',
      actingAccountId: ACTING_ADMIN_ID,
      actionType: 'unsuspend',
      reason: 'Appeal granted',
      createdAt: '2026-05-24T11:00:00.000Z',
    });
    assert.equal(directCalls.length, 1);
    assert.ok(
      directCalls[0].sql.includes('ORDER BY created_at DESC, action_id DESC'),
      'audit-log query must include verbatim ORDER BY created_at DESC, action_id DESC',
    );
    assert.ok(directCalls[0].sql.includes('LIMIT $2'));
    assert.deepStrictEqual(directCalls[0].params, [TARGET_PLAYER_ID, 100]);
  });

  test('Custom limit parameter overrides default 100', async () => {
    const directCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      directQueueCalls: directCalls,
      directQueue: [{ rows: [] }],
    });
    await getAdminActionsForPlayer(database, TARGET_PLAYER_ID, 25);
    assert.deepStrictEqual(directCalls[0].params, [TARGET_PLAYER_ID, 25]);
  });
});

describe('adminProfile.logic (WP-107) — resolveHandleToAccountId', () => {
  test('Returns AccountId when handle resolves; null otherwise', async () => {
    const directCalls: QueryCall[] = [];
    const database = makeFakeDatabase({
      directQueueCalls: directCalls,
      directQueue: [
        { rows: [{ ext_id: TARGET_PLAYER_ID }] },
        { rows: [] },
      ],
    });
    const found = await resolveHandleToAccountId(database, 'TargetPlayer');
    assert.equal(found, TARGET_PLAYER_ID);
    const missing = await resolveHandleToAccountId(database, 'nobody');
    assert.equal(missing, null);
    assert.equal(directCalls.length, 2);
    // Canonicalization: input is lowercased + trimmed before the SELECT
    assert.deepStrictEqual(directCalls[0].params, [TARGET_HANDLE_CANONICAL]);
  });
});
