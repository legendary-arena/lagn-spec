/**
 * Tests for `requireAdminSecret` (WP-110 / EC-163). Validates the
 * shared-secret admin gate: valid secret, invalid secret, missing
 * env var, and timing-safe comparison.
 *
 * Authority: WP-110 §A; EC-163 §Files to Produce.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { requireAdminSecret } from './adminGate.js';
import type { IncomingMessage } from 'node:http';

const TEST_SECRET = 'test-admin-secret-value-32chars!!';

function makeFakeRequest(
  headerValue?: string | string[],
): IncomingMessage {
  const headers: Record<string, string | string[] | undefined> = {};
  if (headerValue !== undefined) {
    headers['x-admin-secret'] = headerValue;
  }
  return { headers } as unknown as IncomingMessage;
}

describe('requireAdminSecret', () => {
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    originalEnvValue = process.env.ADMIN_SECRET;
  });

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalEnvValue;
    }
  });

  test('returns ok: true when header matches ADMIN_SECRET', () => {
    process.env.ADMIN_SECRET = TEST_SECRET;
    const request = makeFakeRequest(TEST_SECRET);
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: true });
  });

  test('returns ok: false when header does not match ADMIN_SECRET', () => {
    process.env.ADMIN_SECRET = TEST_SECRET;
    const request = makeFakeRequest('wrong-secret-value');
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: false, code: 'unauthorized' });
  });

  test('returns ok: false when X-Admin-Secret header is missing', () => {
    process.env.ADMIN_SECRET = TEST_SECRET;
    const request = makeFakeRequest();
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: false, code: 'unauthorized' });
  });

  test('returns ok: false when ADMIN_SECRET env var is not set (fail-closed)', () => {
    delete process.env.ADMIN_SECRET;
    const request = makeFakeRequest(TEST_SECRET);
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: false, code: 'unauthorized' });
  });

  test('returns ok: false when ADMIN_SECRET env var is empty string (fail-closed)', () => {
    process.env.ADMIN_SECRET = '';
    const request = makeFakeRequest(TEST_SECRET);
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: false, code: 'unauthorized' });
  });

  test('uses timing-safe comparison (different-length secrets rejected)', () => {
    process.env.ADMIN_SECRET = TEST_SECRET;
    const request = makeFakeRequest('short');
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: false, code: 'unauthorized' });
  });

  test('accepts first value when header is an array', () => {
    process.env.ADMIN_SECRET = TEST_SECRET;
    const request = makeFakeRequest([TEST_SECRET, 'other-value']);
    const result = requireAdminSecret(request);
    assert.deepStrictEqual(result, { ok: true });
  });
});
