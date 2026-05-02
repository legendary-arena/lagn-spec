/**
 * Tests for the session-token validation orchestrator (WP-112 / EC-112).
 *
 * Logic-pure suite: fakes are injected at construction time; no
 * live database, no live Hanko, no network. Drift-detection tests
 * (1-3) assert each closed-union error-code array matches its
 * corresponding union by forward and backward inclusion. Functional
 * tests (4-14) exercise `extractBearerToken`,
 * `requireAuthenticatedSession`, and `configureSessionValidation`
 * via fake `SessionVerifier` and fake `AccountResolver` injections
 * per WP-112 §Scope (In) §C.
 *
 * Authority: WP-112 §Scope (In) §C; EC-112 §1; D-11202..D-11204;
 * `.claude/rules/code-style.md §"Drift Detection"`.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  requireAuthenticatedSession,
  configureSessionValidation,
  extractBearerToken,
} from './sessionToken.logic.js';
import {
  SESSION_VERIFICATION_ERROR_CODES,
  SESSION_VALIDATION_ERROR_CODES,
  ACCOUNT_LOOKUP_ERROR_CODES,
  type SessionVerificationErrorCode,
  type SessionValidationErrorCode,
  type AccountLookupErrorCode,
  type SessionVerifier,
  type AccountResolver,
  type VerifiedSessionClaim,
  type SessionTokenRequest,
  type AccountId,
  type DatabaseClient,
  type Result,
} from './sessionToken.types.js';

// why: a stand-in DatabaseClient that throws on use. The
// orchestrator must never read the database directly; the resolver
// is the only seam that touches `legendary.players`. If a future
// regression has the orchestrator query the database before
// delegating to the resolver, every test below will fail loudly.
const NEVER_QUERY_DATABASE: DatabaseClient = {
  query: () => {
    throw new Error(
      'Test database client query() must never be invoked directly by requireAuthenticatedSession; the resolver owns all DB access.',
    );
  },
} as unknown as DatabaseClient;

const FAKE_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001' as AccountId;

function makeRequest(authorization?: string | string[]): SessionTokenRequest {
  if (authorization === undefined) {
    return { headers: {} };
  }
  return { headers: { authorization } };
}

function farFutureExpiresAt(): string {
  // 10 minutes from now — well within the orchestrator's expiry window.
  return new Date(Date.now() + 10 * 60 * 1000).toISOString();
}

function pastExpiresAt(): string {
  // 10 minutes ago — well past the orchestrator's expiry boundary.
  return new Date(Date.now() - 10 * 60 * 1000).toISOString();
}

function makeOkVerifier(claim: VerifiedSessionClaim): SessionVerifier {
  return {
    verify: async () => ({ ok: true, value: claim }),
  };
}

function makeFailingVerifier(
  code: SessionVerificationErrorCode,
  reason: string,
): SessionVerifier {
  return {
    verify: async () => ({ ok: false, reason, code: code as never }),
  };
}

function makeOkResolver(value: AccountId | null): AccountResolver {
  return async () => ({ ok: true, value });
}

function makeFailingResolver(
  code: SessionValidationErrorCode,
  reason: string,
): AccountResolver {
  return async () => ({ ok: false, reason, code: code as never });
}

describe('requireAuthenticatedSession (WP-112)', () => {
  test('SESSION_VERIFICATION_ERROR_CODES matches the union by forward and backward inclusion', () => {
    const expected: ReadonlySet<SessionVerificationErrorCode> = new Set([
      'invalid_token',
      'expired_token',
      'unknown_provider',
      'verification_failed',
    ]);
    assert.equal(SESSION_VERIFICATION_ERROR_CODES.length, expected.size);
    for (const code of SESSION_VERIFICATION_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `SESSION_VERIFICATION_ERROR_CODES carries ${code} which is missing from the union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        SESSION_VERIFICATION_ERROR_CODES.includes(value),
        `Union value ${value} missing from SESSION_VERIFICATION_ERROR_CODES`,
      );
    }
  });

  test('SESSION_VALIDATION_ERROR_CODES matches the union by forward and backward inclusion', () => {
    const expected: ReadonlySet<SessionValidationErrorCode> = new Set([
      'missing_token',
      'invalid_token',
      'expired_token',
      'unknown_account',
      'session_verifier_not_configured',
      'lookup_failed',
    ]);
    assert.equal(SESSION_VALIDATION_ERROR_CODES.length, expected.size);
    for (const code of SESSION_VALIDATION_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `SESSION_VALIDATION_ERROR_CODES carries ${code} which is missing from the union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        SESSION_VALIDATION_ERROR_CODES.includes(value),
        `Union value ${value} missing from SESSION_VALIDATION_ERROR_CODES`,
      );
    }
  });

  test('ACCOUNT_LOOKUP_ERROR_CODES matches the union by forward and backward inclusion', () => {
    const expected: ReadonlySet<AccountLookupErrorCode> = new Set([
      'lookup_failed',
    ]);
    assert.equal(ACCOUNT_LOOKUP_ERROR_CODES.length, expected.size);
    for (const code of ACCOUNT_LOOKUP_ERROR_CODES) {
      assert.ok(
        expected.has(code),
        `ACCOUNT_LOOKUP_ERROR_CODES carries ${code} which is missing from the union`,
      );
    }
    for (const value of expected) {
      assert.ok(
        ACCOUNT_LOOKUP_ERROR_CODES.includes(value),
        `Union value ${value} missing from ACCOUNT_LOOKUP_ERROR_CODES`,
      );
    }
  });

  test('extractBearerToken returns null for missing, malformed, or empty-token Authorization headers; returns the token slice when well-formed', () => {
    assert.equal(extractBearerToken(makeRequest()), null);
    assert.equal(extractBearerToken(makeRequest('Basic dXNlcjpwYXNz')), null);
    assert.equal(extractBearerToken(makeRequest('Bearer    ')), null);
    assert.equal(
      extractBearerToken(makeRequest('Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig')),
      'eyJhbGciOiJSUzI1NiJ9.payload.sig',
    );
  });

  test('happy path returns Result.ok(accountId) when verifier and resolver both succeed', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'alice-subject-001',
      expiresAt: farFutureExpiresAt(),
    };
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-001'),
      {
        verifier: makeOkVerifier(claim),
        accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === true);
    assert.equal(result.value, FAKE_ACCOUNT_ID);
  });

  test('missing token returns Result.fail with code missing_token', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'alice-subject-001',
      expiresAt: farFutureExpiresAt(),
    };
    const result = await requireAuthenticatedSession(makeRequest(), {
      verifier: makeOkVerifier(claim),
      accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
      database: NEVER_QUERY_DATABASE,
    });
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'missing_token');
  });

  test('verifier failure with invalid_token translates to validation invalid_token', async () => {
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-002'),
      {
        verifier: makeFailingVerifier(
          'invalid_token',
          'Token signature does not match any key in the JWKS cache.',
        ),
        accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'invalid_token');
  });

  test('verifier failure with verification_failed maps to invalid_token (verifier codes never leak verbatim)', async () => {
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-003'),
      {
        verifier: makeFailingVerifier(
          'verification_failed',
          'JWKS endpoint returned 503 — verifier could not establish trust in the token.',
        ),
        accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'invalid_token');
  });

  test('verifier failure with expired_token translates to expired_token', async () => {
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-004'),
      {
        verifier: makeFailingVerifier(
          'expired_token',
          'Verifier rejected token whose exp claim has elapsed.',
        ),
        accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'expired_token');
  });

  test('orchestrator-side expiresAt check rejects a verifier-accepted but expired claim with code expired_token', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'alice-subject-001',
      expiresAt: pastExpiresAt(),
    };
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-005'),
      {
        verifier: makeOkVerifier(claim),
        accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'expired_token');
  });

  test('resolver returns Result.ok(null) — orchestrator translates to Result.fail with code unknown_account', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'discord',
      authProviderSub: 'discord-sub-fresh-callback',
      expiresAt: farFutureExpiresAt(),
    };
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-006'),
      {
        verifier: makeOkVerifier(claim),
        accountResolver: makeOkResolver(null),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'unknown_account');
  });

  test('resolver failure forwards lookup_failed code verbatim', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'google',
      authProviderSub: 'google-sub-002',
      expiresAt: farFutureExpiresAt(),
    };
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-007'),
      {
        verifier: makeOkVerifier(claim),
        accountResolver: makeFailingResolver(
          'lookup_failed',
          'Database connection lost while resolving claim to AccountId.',
        ),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal((result as { code: string }).code, 'lookup_failed');
  });

  test('unconfigured-default fires when options.verifier is undefined (per D-11204)', async () => {
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-008'),
      {
        verifier: undefined,
        accountResolver: makeOkResolver(FAKE_ACCOUNT_ID),
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal(
      (result as { code: string }).code,
      'session_verifier_not_configured',
    );
  });

  test('unconfigured-default also fires when options.accountResolver is undefined', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'discord',
      authProviderSub: 'discord-sub-001',
      expiresAt: farFutureExpiresAt(),
    };
    const result = await requireAuthenticatedSession(
      makeRequest('Bearer fake-token-009'),
      {
        verifier: makeOkVerifier(claim),
        accountResolver: undefined,
        database: NEVER_QUERY_DATABASE,
      },
    );
    assert.ok(result.ok === false);
    assert.equal(
      (result as { code: string }).code,
      'session_verifier_not_configured',
    );
  });

  test('configureSessionValidation returns a closure that delegates to requireAuthenticatedSession on every invocation', async () => {
    const claim: VerifiedSessionClaim = {
      authProvider: 'email',
      authProviderSub: 'alice-subject-001',
      expiresAt: farFutureExpiresAt(),
    };
    let resolverCallCount = 0;
    const trackingResolver: AccountResolver = async () => {
      resolverCallCount += 1;
      const ok: Result<AccountId | null> = { ok: true, value: FAKE_ACCOUNT_ID };
      return ok;
    };
    const bound = configureSessionValidation({
      verifier: makeOkVerifier(claim),
      accountResolver: trackingResolver,
      database: NEVER_QUERY_DATABASE,
    });
    const first = await bound(makeRequest('Bearer fake-token-010'));
    const second = await bound(makeRequest('Bearer fake-token-011'));
    assert.ok(first.ok === true);
    assert.equal(first.value, FAKE_ACCOUNT_ID);
    assert.ok(second.ok === true);
    assert.equal(second.value, FAKE_ACCOUNT_ID);
    assert.equal(
      resolverCallCount,
      2,
      'configureSessionValidation closure must delegate to the bound resolver on every invocation',
    );
  });
});
