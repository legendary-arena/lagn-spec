import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLastVisit } from './useLastVisit.js';

/**
 * Minimal in-memory localStorage used because the node:test runtime has no
 * DOM. Mirrors the pattern from `useDailyChecklist.test.ts`.
 */
class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

const STORAGE_KEY = 'la-dashboard-last-visit';
const SAMPLE_GENERATED_AT = '2026-06-02T09:00:00-07:00';
const SECOND_GENERATED_AT = '2026-06-03T10:30:00-07:00';

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

test('1. first visit returns null lastVisit', () => {
  const { lastVisit } = useLastVisit();
  assert.equal(lastVisit.value, null);
});

test('2. markVisited writes the snapshot generatedAt to localStorage', () => {
  const { markVisited } = useLastVisit();
  markVisited(SAMPLE_GENERATED_AT);
  assert.equal(localStorage.getItem(STORAGE_KEY), SAMPLE_GENERATED_AT);
});

test('3. markVisited updates the reactive lastVisit ref', () => {
  const { lastVisit, markVisited } = useLastVisit();
  markVisited(SAMPLE_GENERATED_AT);
  assert.equal(lastVisit.value, SAMPLE_GENERATED_AT);
});

test('4. subsequent useLastVisit() reads the persisted value', () => {
  const first = useLastVisit();
  first.markVisited(SAMPLE_GENERATED_AT);
  const second = useLastVisit();
  assert.equal(second.lastVisit.value, SAMPLE_GENERATED_AT);
});

test('5. corrupted localStorage value returns null without throwing', () => {
  localStorage.setItem(STORAGE_KEY, 'not-an-iso-string');
  const { lastVisit } = useLastVisit();
  assert.equal(lastVisit.value, null);
});

test('6. ISO with offset zone is accepted (matches git log --format=%cI shape)', () => {
  localStorage.setItem(STORAGE_KEY, '2026-06-02T09:00:00-07:00');
  const { lastVisit } = useLastVisit();
  assert.equal(lastVisit.value, '2026-06-02T09:00:00-07:00');
});

test('7. ISO with Z suffix is accepted', () => {
  localStorage.setItem(STORAGE_KEY, '2026-06-02T16:00:00Z');
  const { lastVisit } = useLastVisit();
  assert.equal(lastVisit.value, '2026-06-02T16:00:00Z');
});

test('8. markVisited is a single-call invariant per composable instance (D-19910)', () => {
  // why: D-19910 — the single-call guard prevents reactive re-renders from
  // re-triggering markVisited mid-mount. Two consecutive calls with
  // different values must keep the FIRST write intact.
  const { lastVisit, markVisited } = useLastVisit();
  markVisited(SAMPLE_GENERATED_AT);
  markVisited(SECOND_GENERATED_AT);
  assert.equal(lastVisit.value, SAMPLE_GENERATED_AT);
  assert.equal(localStorage.getItem(STORAGE_KEY), SAMPLE_GENERATED_AT);
});

test('9. persisted value matches the ISO regex (PII gate — no email/id/IP)', () => {
  const { markVisited } = useLastVisit();
  markVisited(SAMPLE_GENERATED_AT);
  const stored = localStorage.getItem(STORAGE_KEY);
  assert.notEqual(stored, null);
  assert.match(stored ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  // Reject anything that looks like an email, an account id, or an IP.
  assert.doesNotMatch(stored ?? '', /@|password|token|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/);
});

test('10. localStorage key is exactly la-dashboard-last-visit (D-19903)', () => {
  const { markVisited } = useLastVisit();
  markVisited(SAMPLE_GENERATED_AT);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k !== null) {
      keys.push(k);
    }
  }
  assert.deepEqual(keys, [STORAGE_KEY]);
});
