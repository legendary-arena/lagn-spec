/**
 * Tests for the user-id hash helper (WP-205 / EC-233 — Sub-task B).
 *
 * Six test cases inside one describe block (≥5 per EC-233 §After
 * Completing → Sub-task B close):
 *
 *   1. Deterministic hash — same input + same salt → byte-identical
 *      output across two consecutive calls.
 *   2. Salt influence — different salts produce different hashes for
 *      the same input.
 *   3. Null passthrough — `hashUserId(null, salt)` returns `null`
 *      (anonymous-event short-circuit per D-20502).
 *   4. 64-char lowercase hex format — output is always 64 lowercase
 *      hex characters (matches the DB CHECK constraint shape).
 *   5. Production missing-salt loud-fail — `getAnalyticsUserIdSalt()`
 *      throws a full-sentence error in `NODE_ENV === 'production'`
 *      when the env var is unset OR is the empty string.
 *   6. One-shot warning guard — test/dev fallback emits exactly one
 *      `console.warn` per process; the second call emits zero
 *      warnings (module-level boolean guard).
 *
 * Authority: WP-205 §Acceptance Criteria → Hash / PII Posture;
 * EC-233 §Locked Values + §After Completing → Sub-task B close;
 * D-20502 (PII posture; production loud-fail; one-shot warning).
 */

import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  __getOneShotWarningMessageForTests,
  __getTestFallbackSaltForTests,
  __resetSaltWarningGuardForTests,
  getAnalyticsUserIdSalt,
  hashUserId,
} from './userIdHash.js';

const SHA_256_HEX_REGEX = /^[0-9a-f]{64}$/;

describe('hashUserId (WP-205 / D-20502)', () => {
  test('produces a deterministic byte-identical hash across two consecutive calls with the same arguments', () => {
    const firstCall = hashUserId('alice@example.com', 'salt-A');
    const secondCall = hashUserId('alice@example.com', 'salt-A');
    assert.equal(firstCall, secondCall);
    assert.equal(
      typeof firstCall,
      'string',
      'A non-null input MUST produce a string output; the null-passthrough branch fires only when rawUserId === null.',
    );
  });

  test('different salts produce different hashes for the same input (salt-influence invariant)', () => {
    const hashWithSaltA = hashUserId('alice@example.com', 'salt-A');
    const hashWithSaltB = hashUserId('alice@example.com', 'salt-B');
    assert.notEqual(
      hashWithSaltA,
      hashWithSaltB,
      'Salts MUST influence the output; if two different salts produce the same hash, the salt parameter is being silently dropped from the hash input.',
    );
  });

  test('returns null for the anonymous-event passthrough (rawUserId === null)', () => {
    assert.equal(hashUserId(null, 'any-salt'), null);
    // why: even with an empty salt the null-passthrough branch must
    // short-circuit BEFORE the SHA-256 call site; this protects the
    // contract that anonymous events write `user_id_hash = NULL` to
    // the DB unconditionally.
    assert.equal(hashUserId(null, ''), null);
  });

  test('non-null input produces a 64-character lowercase hex string (matches DB CHECK constraint shape)', () => {
    const hash = hashUserId('alice@example.com', 'test-salt');
    assert.equal(typeof hash, 'string');
    assert.match(
      hash as string,
      SHA_256_HEX_REGEX,
      'hashUserId output MUST be 64 lowercase hex characters; the DB CHECK constraint analytics_events_user_id_hash_format rejects any other shape as defense-in-depth per D-20502.',
    );
  });
});

describe('getAnalyticsUserIdSalt (WP-205 / D-20502)', () => {
  // why: each test case captures and restores NODE_ENV +
  // ANALYTICS_USER_ID_SALT so cases run in isolation regardless of
  // the harness's ambient environment. The one-shot warning guard
  // is reset between cases via the test-only helper so each case
  // sees a fresh process-lifetime guard.

  test('throws a full-sentence error in production when ANALYTICS_USER_ID_SALT is unset', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSalt = process.env.ANALYTICS_USER_ID_SALT;
    process.env.NODE_ENV = 'production';
    delete process.env.ANALYTICS_USER_ID_SALT;
    try {
      assert.throws(
        () => getAnalyticsUserIdSalt(),
        (caught: unknown) => {
          if (caught instanceof Error === false) {
            return false;
          }
          const message = (caught as Error).message;
          return (
            message.includes('ANALYTICS_USER_ID_SALT') &&
            message.includes('refusing to start') &&
            message.includes('high-entropy secret string')
          );
        },
        'Production salt-missing path MUST throw a full-sentence error citing the env var name + remediation per D-20502 locked text.',
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalSalt === undefined) {
        delete process.env.ANALYTICS_USER_ID_SALT;
      } else {
        process.env.ANALYTICS_USER_ID_SALT = originalSalt;
      }
    }
  });

  test('throws a full-sentence error in production when ANALYTICS_USER_ID_SALT is the empty string', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSalt = process.env.ANALYTICS_USER_ID_SALT;
    process.env.NODE_ENV = 'production';
    process.env.ANALYTICS_USER_ID_SALT = '';
    try {
      assert.throws(
        () => getAnalyticsUserIdSalt(),
        /refusing to start/,
        'Production empty-string salt MUST be treated as unset and trigger the loud-fail throw per D-20502 — an empty salt would defeat the PII posture.',
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalSalt === undefined) {
        delete process.env.ANALYTICS_USER_ID_SALT;
      } else {
        process.env.ANALYTICS_USER_ID_SALT = originalSalt;
      }
    }
  });

  test('test/dev fallback returns the EC-233 locked test salt and emits exactly ONE console.warn across two consecutive calls (one-shot guard)', () => {
    __resetSaltWarningGuardForTests();
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSalt = process.env.ANALYTICS_USER_ID_SALT;
    process.env.NODE_ENV = 'test';
    delete process.env.ANALYTICS_USER_ID_SALT;
    const warnSpy = mock.method(console, 'warn', () => {});
    try {
      const firstSalt = getAnalyticsUserIdSalt();
      const secondSalt = getAnalyticsUserIdSalt();
      assert.equal(
        firstSalt,
        __getTestFallbackSaltForTests(),
        'Test/dev fallback MUST return the EC-233 §Locked Values test salt literal.',
      );
      assert.equal(
        secondSalt,
        firstSalt,
        'The second call MUST return the same test salt (process-lifetime constant).',
      );
      assert.equal(
        warnSpy.mock.calls.length,
        1,
        'One-shot guard MUST emit exactly one console.warn per process; two consecutive calls produced ' +
          String(warnSpy.mock.calls.length) +
          ' warnings. The module-level boolean guard has regressed.',
      );
      const warnCall = warnSpy.mock.calls[0];
      const warnArg = warnCall?.arguments?.[0];
      assert.equal(
        warnArg,
        __getOneShotWarningMessageForTests(),
        'The console.warn message MUST equal the EC-233 §Locked Values one-shot warning byte-identical.',
      );
    } finally {
      warnSpy.mock.restore();
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalSalt === undefined) {
        delete process.env.ANALYTICS_USER_ID_SALT;
      } else {
        process.env.ANALYTICS_USER_ID_SALT = originalSalt;
      }
      __resetSaltWarningGuardForTests();
    }
  });
});
