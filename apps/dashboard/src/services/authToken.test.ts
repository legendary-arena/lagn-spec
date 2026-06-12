import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import {
  __testHooks,
  buildLiveRequestOptions,
  handleMissingAuthToken,
  readAuthToken,
  registerAuthTokenReader,
} from './authToken.js';
import type { ServiceResponse } from '../types/index.js';

// ============================================================================
// WP-241 / EC-272 / D-24005 — authToken seam coverage.
//
// Covers the three exported surfaces: the registered-reader lifecycle
// (pre-registration null, registered value, signed-out null, overwrite), the
// single header producer (`buildLiveRequestOptions` — Bearer present, no
// cookie), and the single fail-silent path (`handleMissingAuthToken` returns
// the prior cache/sentinel unchanged, fires no request). Network-free,
// Pinia-free, DOM-free — runs under `node --import tsx --test`.
// ============================================================================

afterEach(() => {
  // why: clear the registered reader so cross-test state cannot leak — the
  // reader is module-level and persists for the process otherwise.
  __testHooks.setAuthToken(null);
});

// ----------------------------------------------------------------------------
// readAuthToken / registerAuthTokenReader — reader lifecycle
// ----------------------------------------------------------------------------

test('readAuthToken returns null before any reader is registered', () => {
  __testHooks.setAuthToken(null);
  assert.equal(readAuthToken(), null);
});

test('readAuthToken returns the registered reader value', () => {
  registerAuthTokenReader(() => 'jwt-abc');
  assert.equal(readAuthToken(), 'jwt-abc');
});

test('readAuthToken returns null when the registered reader reports no session', () => {
  registerAuthTokenReader(() => null);
  assert.equal(readAuthToken(), null);
});

test('readAuthToken reflects a later reader registration (overwrite wins)', () => {
  registerAuthTokenReader(() => 'first');
  registerAuthTokenReader(() => 'second');
  assert.equal(readAuthToken(), 'second');
});

test('readAuthToken reflects live reader mutation (reads through, does not snapshot)', () => {
  let current: string | null = 'a';
  registerAuthTokenReader(() => current);
  assert.equal(readAuthToken(), 'a');
  current = 'b';
  assert.equal(readAuthToken(), 'b');
  current = null;
  assert.equal(readAuthToken(), null);
});

// ----------------------------------------------------------------------------
// buildLiveRequestOptions — the single header producer
// ----------------------------------------------------------------------------

test('buildLiveRequestOptions attaches Authorization: Bearer <token> and Accept', () => {
  const options = buildLiveRequestOptions('jwt-xyz');
  const headers = options.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer jwt-xyz');
  assert.equal(headers.Accept, 'application/json');
});

test('buildLiveRequestOptions does NOT set credentials (cookie path dropped, D-24003)', () => {
  const options = buildLiveRequestOptions('jwt-xyz');
  assert.equal(options.credentials, undefined);
});

// ----------------------------------------------------------------------------
// handleMissingAuthToken — the single fail-silent path
// ----------------------------------------------------------------------------

test('handleMissingAuthToken returns the cache ref value unchanged', () => {
  const sentinel: ServiceResponse<readonly number[]> = {
    data: [],
    updatedAt: 1_700_000_000_000,
    source: 'LIVE',
  };
  const cacheRef = ref<ServiceResponse<readonly number[]>>(sentinel);
  const warnOnce = new Set<string>();
  const result = handleMissingAuthToken(cacheRef, warnOnce);
  // why: `ref(object).value` is a reactive proxy, not the raw input object, so
  // the contract is "returns exactly cacheRef.value" (the prior cache/sentinel),
  // asserted by reference against the ref's own value + structurally below.
  assert.equal(result, cacheRef.value);
  assert.deepEqual(result, { data: [], updatedAt: 1_700_000_000_000, source: 'LIVE' });
});

test('handleMissingAuthToken records its one-shot key in the warn set', () => {
  const cacheRef = ref<ServiceResponse<readonly number[]>>({
    data: [],
    updatedAt: 0,
    source: 'LIVE',
  });
  const warnOnce = new Set<string>();
  handleMissingAuthToken(cacheRef, warnOnce);
  handleMissingAuthToken(cacheRef, warnOnce);
  // why: one key is added regardless of the DEV gate, so repeated calls stay
  // one-shot. (Under the test runner `import.meta.env` is undefined, so the
  // actual console.warn never fires — the guard is what we assert here.)
  assert.equal(warnOnce.size, 1);
});

test('handleMissingAuthToken does not emit console.warn under the test runner (DEV undefined)', () => {
  const cacheRef = ref<ServiceResponse<readonly number[]>>({
    data: [],
    updatedAt: 0,
    source: 'LIVE',
  });
  const warnOnce = new Set<string>();
  const original = console.warn;
  let warnCalls = 0;
  console.warn = () => {
    warnCalls += 1;
  };
  try {
    handleMissingAuthToken(cacheRef, warnOnce);
  } finally {
    console.warn = original;
  }
  assert.equal(warnCalls, 0);
});
