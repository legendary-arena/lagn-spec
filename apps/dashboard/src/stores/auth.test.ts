import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';

import { useAuthStore } from './auth.js';

// why: each test creates its own Pinia so cross-test state cannot leak (the
// store reactive refs are owned by the active Pinia instance). Mirrors the
// arena-client stores/auth.test.ts precedent (WP-241 §H).

test('initial state has null token, null accountId, isAuthenticated false', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  assert.equal(store.token, null);
  assert.equal(store.accountId, null);
  assert.equal(store.isAuthenticated, false);
});

test('setSession populates all three fields with a non-null accountId', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  store.setSession('jwt-abc', 'acc-123');
  assert.equal(store.token, 'jwt-abc');
  assert.equal(store.accountId, 'acc-123');
  assert.equal(store.isAuthenticated, true);
});

test('setSession with null accountId still flips isAuthenticated to true', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  store.setSession('jwt-abc', null);
  assert.equal(store.token, 'jwt-abc');
  assert.equal(store.accountId, null);
  assert.equal(store.isAuthenticated, true);
});

test('clearSession resets all three fields to the initial values', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  store.setSession('jwt-abc', 'acc-123');
  store.clearSession();
  assert.equal(store.token, null);
  assert.equal(store.accountId, null);
  assert.equal(store.isAuthenticated, false);
});

test('bootstrapFromCachedToken with a non-null token populates token only', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  store.bootstrapFromCachedToken('jwt-abc');
  assert.equal(store.token, 'jwt-abc');
  assert.equal(store.accountId, null);
  assert.equal(store.isAuthenticated, true);
});

test('bootstrapFromCachedToken(null) on a fresh store is a no-op', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  store.bootstrapFromCachedToken(null);
  assert.equal(store.token, null);
  assert.equal(store.accountId, null);
  assert.equal(store.isAuthenticated, false);
});

test('bootstrapFromCachedToken(null) on a populated store does NOT clobber the existing session', () => {
  setActivePinia(createPinia());
  const store = useAuthStore();
  store.setSession('jwt-existing', 'acc-existing');
  store.bootstrapFromCachedToken(null);
  assert.equal(store.token, 'jwt-existing');
  assert.equal(store.accountId, 'acc-existing');
  assert.equal(store.isAuthenticated, true);
});

// why: type-only assertion — no runtime equivalent. The store exposes
// `isAuthenticated` as `ComputedRef<boolean>`, NOT `Ref<boolean>`. An attempt to
// write `store.isAuthenticated = true` would fail TypeScript at compile time
// (ComputedRef has no setter). The compile-time gate is the load-bearing check.
