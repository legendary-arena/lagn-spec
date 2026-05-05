import '../testing/jsdom-setup';

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { usePlaymat } from './playmatStore';
import { PLAYMAT_STORAGE_KEY } from './persistence';
import { DEFAULT_SKIN_NAME } from './playmatSchema';

describe('WP-130 prefs/playmatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  test('initial activeSkin is DEFAULT_SKIN_NAME when no localStorage value is present', () => {
    const store = usePlaymat();
    assert.equal(store.activeSkin, DEFAULT_SKIN_NAME);
  });

  test('initial activeSkin reads from localStorage when a valid value is present', () => {
    localStorage.setItem(PLAYMAT_STORAGE_KEY, 'comic');
    const store = usePlaymat();
    assert.equal(store.activeSkin, 'comic');
  });

  test('initial activeSkin falls back to DEFAULT_SKIN_NAME when the stored value is corrupt', () => {
    localStorage.setItem(PLAYMAT_STORAGE_KEY, 'not-a-real-skin');
    const store = usePlaymat();
    assert.equal(store.activeSkin, DEFAULT_SKIN_NAME);
  });

  test('setActiveSkin updates the ref AND writes localStorage synchronously in one tick', () => {
    const store = usePlaymat();
    store.setActiveSkin('minimal');
    assert.equal(store.activeSkin, 'minimal');
    assert.equal(localStorage.getItem(PLAYMAT_STORAGE_KEY), 'minimal');
  });

  test('availableSkins exposes the closed set in manifest insertion order', () => {
    const store = usePlaymat();
    assert.deepEqual([...store.availableSkins], ['classic', 'comic', 'minimal']);
  });

  test('availableSkins is the same closed set across repeated store accesses', () => {
    const a = usePlaymat();
    const b = usePlaymat();
    assert.equal(a, b, 'usePlaymat must return the same Pinia store singleton within one Pinia instance');
    assert.deepEqual([...a.availableSkins], [...b.availableSkins]);
  });
});
