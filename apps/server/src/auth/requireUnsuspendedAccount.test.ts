/**
 * Tests for `requireUnsuspendedAccount` (WP-107).
 *
 * Eight unit tests covering the six control-flow branches plus the
 * bidirectional drift-detection assertion per
 * `00.6-code-style.md §Drift Detection`. All DB interactions use
 * injected fakes — no live database required.
 *
 * The static `reason` strings are intentionally re-stated as literal
 * constants here rather than imported from
 * `requireUnsuspendedAccount.ts`, so the assertions prove the
 * helper's output against the spec rather than self-referencing.
 * Mirrors the WP-159 `adminSession.test.ts` pattern verbatim.
 *
 * Authority: WP-107 §Acceptance Criteria; EC-195 §Locked Values
 * (helper closed-union code split); WP-159 / EC-173 §Locked Values
 * (test-fixture string-literal precedent).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES,
  requireUnsuspendedAccount,
} from './requireUnsuspendedAccount.js';
import type { RequireUnsuspendedAccountErrorCode } from './requireUnsuspendedAccount.js';
import type {
  AccountId,
  DatabaseClient,
} from '../identity/identity.types.js';

const TEST_ACCOUNT_ID = 'b4c2d3e5-2222-4555-aaaa-bbbbbbbbbbbb' as AccountId;

const SUSPENDED_REASON = 'Account is suspended.';
const LOOKUP_FAILED_ZERO_ROW_REASON =
  'No legendary.players row matches the supplied accountId; the account row may have been deleted between session validation and this intake check.';
const LOOKUP_FAILED_DB_THROW_REASON =
  'Failed to read suspension state for the supplied accountId.';
const LOOKUP_FAILED_MULTI_ROW_REASON =
  'Supplied accountId resolves to multiple legendary.players rows (data integrity fault).';
const LOOKUP_FAILED_ROW_SCHEMA_REASON =
  'Suspension flag on the matched legendary.players row is missing or not a boolean (row-schema fault).';

function makeDatabase(rowsFactory: () => readonly unknown[]): DatabaseClient {
  return {
    query: async () => ({ rows: rowsFactory() }),
  } as unknown as DatabaseClient;
}

function makeThrowingDatabase(): DatabaseClient {
  return {
    query: async () => {
      throw new Error('simulated DB fault (test fixture)');
    },
  } as unknown as DatabaseClient;
}

describe('requireUnsuspendedAccount (WP-107)', () => {
  test('1. happy path: row exists, is_suspended=false -> ok:true', async () => {
    const database = makeDatabase(() => [{ is_suspended: false }]);
    const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
    assert.deepStrictEqual(result, { ok: true });
  });

  test('2. row exists, is_suspended=true -> suspended with canonical reason', async () => {
    const database = makeDatabase(() => [{ is_suspended: true }]);
    const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'suspended',
      reason: SUSPENDED_REASON,
    });
  });

  test('3. zero rows -> lookup_failed with zero-row canonical reason', async () => {
    const database = makeDatabase(() => []);
    const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_ZERO_ROW_REASON,
    });
  });

  test('4. DB throws -> lookup_failed with DB-throw canonical reason', async () => {
    const database = makeThrowingDatabase();
    const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_DB_THROW_REASON,
    });
  });

  test('5. multi-row -> lookup_failed with multi-row canonical reason', async () => {
    const database = makeDatabase(() => [
      { is_suspended: false },
      { is_suspended: false },
    ]);
    const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_MULTI_ROW_REASON,
    });
  });

  test('6. truthy non-boolean is_suspended (three distinct shapes) -> lookup_failed (no coercion)', async () => {
    // why: at least two distinct non-boolean truthy values prove
    // absence of coercion. First shape: number `1`. Second shape:
    // string `"true"`. Third shape: empty object (truthy reference,
    // provably not strict-equal to `true` or `false`). Either of the
    // first two, if truthy-coerced via `if (row.is_suspended)` or
    // `Boolean(...)` or `!!row.is_suspended`, would bypass the typeof
    // guard and silently route through the suspended-grant path.
    // Mirrors WP-159 / adminSession.test.ts Test 8 strictness lock.
    const truthyShapes: ReadonlyArray<unknown> = [1, 'true', {}];
    for (const shape of truthyShapes) {
      const database = makeDatabase(() => [{ is_suspended: shape }]);
      const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
      assert.deepStrictEqual(result, {
        ok: false,
        code: 'lookup_failed',
        reason: LOOKUP_FAILED_ROW_SCHEMA_REASON,
      });
    }
  });

  test('7. missing is_suspended key -> lookup_failed (row-schema reason)', async () => {
    const database = makeDatabase(() => [{}]);
    const result = await requireUnsuspendedAccount(database, TEST_ACCOUNT_ID);
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_ROW_SCHEMA_REASON,
    });
  });

  test('8. REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES matches RequireUnsuspendedAccountErrorCode union (forward + backward inclusion + size)', () => {
    // why: bidirectional drift-detection check per
    // `00.6-code-style.md §Drift Detection`. Adding a value to the
    // union without updating the canonical array (or vice versa)
    // fails one of the three assertions below. Mirrors the WP-159
    // ADMIN_SESSION_ERROR_CODES drift-detection test (test 9) pattern
    // verbatim.
    const expected: ReadonlySet<RequireUnsuspendedAccountErrorCode> = new Set([
      'suspended',
      'lookup_failed',
    ]);
    assert.equal(REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES.length, expected.size);
    for (const code of REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES contains ${code} which is missing from RequireUnsuspendedAccountErrorCode union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES.includes(value),
        `RequireUnsuspendedAccountErrorCode union value ${value} missing from REQUIRE_UNSUSPENDED_ACCOUNT_ERROR_CODES array`,
      );
    }
  });
});
