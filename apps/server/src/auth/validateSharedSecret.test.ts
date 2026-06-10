/**
 * Tests for the shared-secret validator — WP-231 / EC-263.
 *
 * Exercises the real `node:crypto.timingSafeEqual` path through the helper;
 * the critical assertion is that an unequal-length token returns `false`
 * (NOT a thrown `RangeError`) so the route layer maps it cleanly to 401.
 *
 * Authority: WP-231 §Acceptance Criteria #5 + #26; EC-263 §Guardrails
 * (shared-secret via the single helper, length pre-check before
 * `timingSafeEqual`); D-20702 (auth posture this generalizes).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSharedSecret } from './validateSharedSecret.js';

const ENV_TOKEN = 'unit-test-shared-secret-with-32b';

describe('validateSharedSecret (WP-231 / D-20702 carry-forward)', () => {
  test('should_return_true_when_header_byte_equals_env_token', () => {
    assert.equal(validateSharedSecret(ENV_TOKEN, ENV_TOKEN), true);
  });

  test('should_return_false_when_header_is_strictly_shorter_without_RangeError', () => {
    // why: the length pre-check MUST short-circuit before timingSafeEqual;
    // a shorter buffer would otherwise throw RangeError and surface as a 500.
    assert.doesNotThrow(() => validateSharedSecret('short', ENV_TOKEN));
    assert.equal(validateSharedSecret('short', ENV_TOKEN), false);
  });

  test('should_return_false_when_header_is_strictly_longer_without_RangeError', () => {
    assert.doesNotThrow(() => validateSharedSecret(`${ENV_TOKEN}-extra`, ENV_TOKEN));
    assert.equal(validateSharedSecret(`${ENV_TOKEN}-extra`, ENV_TOKEN), false);
  });

  test('should_return_false_when_header_matches_length_but_differs_byte_for_byte', () => {
    const equalLengthMismatch = 'x'.repeat(ENV_TOKEN.length);
    assert.equal(equalLengthMismatch.length, ENV_TOKEN.length);
    assert.equal(validateSharedSecret(equalLengthMismatch, ENV_TOKEN), false);
  });

  test('should_return_false_for_undefined_null_and_empty_header', () => {
    assert.equal(validateSharedSecret(undefined, ENV_TOKEN), false);
    assert.equal(validateSharedSecret(null, ENV_TOKEN), false);
    assert.equal(validateSharedSecret('', ENV_TOKEN), false);
  });
});
