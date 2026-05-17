/**
 * Tests for `requireAdminSession` (WP-159 / EC-173).
 *
 * Nine unit tests covering the §A control-flow table plus the
 * bidirectional drift-detection assertion per `00.6-code-style.md
 * §Drift Detection`. All DB interactions use injected fakes — no
 * live database required.
 *
 * The five canonical reason strings (per EC-173 §Locked Values) are
 * intentionally re-stated as literal constants here rather than
 * imported from `adminSession.ts`, so the assertions prove the
 * helper's output against the spec rather than self-referencing.
 *
 * Authority: WP-159 §B (test list); EC-173 §Locked Values +
 * §Guardrails (Test 8 strictness, bidirectional drift check).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_SESSION_ERROR_CODES,
  requireAdminSession,
} from './adminSession.js';
import type { AdminSessionErrorCode } from './adminSession.js';
import type {
  AccountId,
  AccountResolver,
  DatabaseClient,
  RequireAuthenticatedSessionOptions,
  SessionTokenRequest,
  SessionVerifier,
  VerifiedSessionClaim,
} from './sessionToken.types.js';

const TEST_ACCOUNT_ID = 'a3b1c4d8-1111-4444-9999-aaaaaaaaaaaa' as AccountId;
const VALID_BEARER_HEADER = 'Bearer test-token-value';

const UNAUTHORIZED_REASON =
  'Admin session validation failed: upstream session check rejected the request.';
const FORBIDDEN_REASON =
  'Authenticated account does not have admin privileges.';
const LOOKUP_FAILED_ZERO_ROW_REASON =
  'Authenticated account is not present in the players table.';
const LOOKUP_FAILED_DB_THROW_REASON =
  'Failed to read admin authorization for the authenticated account.';
const LOOKUP_FAILED_MULTI_ROW_REASON =
  'Authenticated account resolves to multiple players rows (data integrity fault).';

function makeRequest(
  headers: Record<string, string> = {},
): SessionTokenRequest {
  return { headers };
}

function makeAcceptingVerifier(
  expiresAtMs: number = Date.now() + 60_000,
): SessionVerifier {
  const claim: VerifiedSessionClaim = {
    authProvider: 'email',
    authProviderSub: 'test-subject-id',
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  return {
    verify: async () => ({ ok: true, value: claim }),
  };
}

function makeRejectingVerifier(
  verifierCode: 'invalid_token' | 'expired_token',
): SessionVerifier {
  return {
    verify: async () => ({
      ok: false,
      reason: 'verifier-side rejection (test fixture)',
      // why: verifier-side codes are typed structurally per WP-112's
      // single-parameter `Result<T>` contract; the orchestrator casts
      // and translates them at exactly one site. The test casts via
      // `as never` to satisfy the structural shape without re-importing
      // the upstream `IdentityErrorCode` union.
      code: verifierCode as never,
    }),
  };
}

const acceptingResolver: AccountResolver = async () => ({
  ok: true,
  value: TEST_ACCOUNT_ID,
});

function makeOptions(
  database: DatabaseClient,
  verifier: SessionVerifier = makeAcceptingVerifier(),
): RequireAuthenticatedSessionOptions {
  return {
    verifier,
    accountResolver: acceptingResolver,
    database,
  };
}

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

describe('requireAdminSession (WP-159 / EC-173)', () => {
  test('1. happy path: valid session + admin flag true → ok: true with accountId', async () => {
    const database = makeDatabase(() => [{ is_admin: true }]);
    const request = makeRequest({ authorization: VALID_BEARER_HEADER });
    const result = await requireAdminSession(request, makeOptions(database));
    assert.deepStrictEqual(result, {
      ok: true,
      accountId: TEST_ACCOUNT_ID,
    });
  });

  test('2. upstream failure (missing token) → unauthorized with canonical reason', async () => {
    const database = makeDatabase(() => [{ is_admin: true }]);
    const request = makeRequest(); // no Authorization header
    const result = await requireAdminSession(request, makeOptions(database));
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'unauthorized',
      reason: UNAUTHORIZED_REASON,
    });
  });

  test('3. upstream failure (expired token) → unauthorized with same canonical reason', async () => {
    const database = makeDatabase(() => [{ is_admin: true }]);
    const request = makeRequest({ authorization: VALID_BEARER_HEADER });
    const options = makeOptions(
      database,
      makeRejectingVerifier('expired_token'),
    );
    const result = await requireAdminSession(request, options);
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'unauthorized',
      reason: UNAUTHORIZED_REASON,
    });
  });

  test('4. valid session + admin flag false → forbidden with canonical reason', async () => {
    const database = makeDatabase(() => [{ is_admin: false }]);
    const request = makeRequest({ authorization: VALID_BEARER_HEADER });
    const result = await requireAdminSession(request, makeOptions(database));
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'forbidden',
      reason: FORBIDDEN_REASON,
    });
  });

  test('5. valid session + zero matching rows → lookup_failed with zero-row canonical reason', async () => {
    const database = makeDatabase(() => []);
    const request = makeRequest({ authorization: VALID_BEARER_HEADER });
    const result = await requireAdminSession(request, makeOptions(database));
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_ZERO_ROW_REASON,
    });
  });

  test('6. valid session + DB throws → lookup_failed with DB-throw canonical reason', async () => {
    const database = makeThrowingDatabase();
    const request = makeRequest({ authorization: VALID_BEARER_HEADER });
    const result = await requireAdminSession(request, makeOptions(database));
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_DB_THROW_REASON,
    });
  });

  test('7. valid session + multiple matching rows → lookup_failed with multi-row canonical reason', async () => {
    const database = makeDatabase(() => [
      { is_admin: true },
      { is_admin: true },
    ]);
    const request = makeRequest({ authorization: VALID_BEARER_HEADER });
    const result = await requireAdminSession(request, makeOptions(database));
    assert.deepStrictEqual(result, {
      ok: false,
      code: 'lookup_failed',
      reason: LOOKUP_FAILED_MULTI_ROW_REASON,
    });
  });

  test('8. truthy non-boolean admin flag (two distinct shapes) → lookup_failed (row-schema reject, no coercion)', async () => {
    // why: per EC-173 §Guardrails "Test 8 strictness" — at least two
    // distinct non-boolean truthy values prove absence of coercion.
    // First shape: number `1`. Second shape: string `"true"`. Either,
    // if truthy-coerced via `if (row.is_admin)` or `Boolean(...)` or
    // `!!row.is_admin`, would bypass the typeof guard and silently
    // route through the admin-grant path. Third shape (empty object)
    // adds an even stricter no-coercion proof — an object reference
    // is truthy in JS but provably not strict-equal to `true`.
    const truthyShapes: ReadonlyArray<unknown> = [1, 'true', {}];
    for (const shape of truthyShapes) {
      const database = makeDatabase(() => [{ is_admin: shape }]);
      const request = makeRequest({ authorization: VALID_BEARER_HEADER });
      const result = await requireAdminSession(request, makeOptions(database));
      assert.deepStrictEqual(
        result,
        {
          ok: false,
          code: 'lookup_failed',
          reason: LOOKUP_FAILED_DB_THROW_REASON,
        },
        `truthy non-boolean shape ${JSON.stringify(shape)} (typeof ${typeof shape}) must route to lookup_failed — never forbidden, never ok: true`,
      );
    }
  });

  test('9. drift detection: ADMIN_SESSION_ERROR_CODES exactly matches AdminSessionErrorCode (bidirectional Set equality)', () => {
    const arraySet = new Set(ADMIN_SESSION_ERROR_CODES);
    const unionSet = new Set<AdminSessionErrorCode>([
      'unauthorized',
      'forbidden',
      'lookup_failed',
    ]);
    assert.strictEqual(
      arraySet.size,
      unionSet.size,
      'cardinality mismatch — array and union are out of sync',
    );
    for (const code of arraySet) {
      assert.ok(
        unionSet.has(code),
        `array entry ${code} is not in the union (extra array value)`,
      );
    }
    for (const code of unionSet) {
      assert.ok(
        arraySet.has(code),
        `union member ${code} is not in the array (missing array entry)`,
      );
    }
  });
});
