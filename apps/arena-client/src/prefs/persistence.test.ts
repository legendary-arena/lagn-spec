import '../testing/jsdom-setup';

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// why: the shared jsdom-setup creates an opaque-origin document
// (default URL `about:blank`); the WHATWG storage spec withholds
// `Storage` from opaque origins, so `window.localStorage` throws
// `SecurityError` on access. Production code reads bare `localStorage`,
// so we install a Map-backed shim on `globalThis` before importing
// the modules under test. Local to this file because `apps/arena-
// client/src/testing/` is outside the WP-130 modify-allowlist per
// EC-133 §1.
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}
const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  writable: true,
  configurable: true,
});

import { loadActiveSkin, saveActiveSkin, PLAYMAT_STORAGE_KEY } from './persistence';
import { DEFAULT_SKIN_NAME } from './playmatSchema';

describe('WP-130 prefs/persistence', () => {
  beforeEach(() => {
    memoryStorage.clear();
  });

  test('loadActiveSkin returns DEFAULT_SKIN_NAME when the key is absent', () => {
    assert.equal(loadActiveSkin(), DEFAULT_SKIN_NAME);
  });

  test('loadActiveSkin returns DEFAULT_SKIN_NAME when the stored blob is corrupt', () => {
    memoryStorage.setItem(PLAYMAT_STORAGE_KEY, 'not-a-real-skin');
    assert.equal(loadActiveSkin(), DEFAULT_SKIN_NAME);
  });

  test('loadActiveSkin round-trips an in-set value written by saveActiveSkin', () => {
    saveActiveSkin('comic');
    assert.equal(loadActiveSkin(), 'comic');
    assert.equal(memoryStorage.getItem(PLAYMAT_STORAGE_KEY), 'comic');
  });

  test('saveActiveSkin overwrites a prior value with the supplied skin name', () => {
    saveActiveSkin('comic');
    saveActiveSkin('minimal');
    assert.equal(memoryStorage.getItem(PLAYMAT_STORAGE_KEY), 'minimal');
  });

  test('PLAYMAT_STORAGE_KEY matches the WP-130 locked contract value', () => {
    assert.equal(PLAYMAT_STORAGE_KEY, 'arenaClientPlaymatSkin');
  });
});
