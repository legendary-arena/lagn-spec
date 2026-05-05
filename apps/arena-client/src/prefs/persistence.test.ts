import '../testing/jsdom-setup';

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadActiveSkin, saveActiveSkin, PLAYMAT_STORAGE_KEY } from './persistence';
import { DEFAULT_SKIN_NAME } from './playmatSchema';

describe('WP-130 prefs/persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('loadActiveSkin returns DEFAULT_SKIN_NAME when the key is absent', () => {
    assert.equal(loadActiveSkin(), DEFAULT_SKIN_NAME);
  });

  test('loadActiveSkin returns DEFAULT_SKIN_NAME when the stored blob is corrupt', () => {
    localStorage.setItem(PLAYMAT_STORAGE_KEY, 'not-a-real-skin');
    assert.equal(loadActiveSkin(), DEFAULT_SKIN_NAME);
  });

  test('loadActiveSkin round-trips an in-set value written by saveActiveSkin', () => {
    saveActiveSkin('comic');
    assert.equal(loadActiveSkin(), 'comic');
    assert.equal(localStorage.getItem(PLAYMAT_STORAGE_KEY), 'comic');
  });

  test('saveActiveSkin overwrites a prior value with the supplied skin name', () => {
    saveActiveSkin('comic');
    saveActiveSkin('minimal');
    assert.equal(localStorage.getItem(PLAYMAT_STORAGE_KEY), 'minimal');
  });

  test('PLAYMAT_STORAGE_KEY matches the WP-130 locked contract value', () => {
    assert.equal(PLAYMAT_STORAGE_KEY, 'arenaClientPlaymatSkin');
  });
});
