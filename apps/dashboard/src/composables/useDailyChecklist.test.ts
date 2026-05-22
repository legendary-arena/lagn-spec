import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useDailyChecklist } from './useDailyChecklist.js';

/**
 * Minimal in-memory localStorage used because the node:test runtime has no DOM.
 * It implements the enumeration surface (length / key) the composable relies on
 * for stale-key pruning, which a plain object would not expose.
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

// why: the composable resolves the local calendar day through the injected
// clock; a fixed date keeps every key and assertion deterministic without
// mocking the global Date.
const FIXED_NOW = new Date(2026, 4, 21, 10, 0, 0);
const fixedClock = (): Date => FIXED_NOW;
const TODAY_KEY = 'la-dashboard-checklist-mock-user-2026-05-21';

function seed(key: string, value: unknown): void {
  globalThis.localStorage.setItem(key, JSON.stringify(value));
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

test('initializes with 9 items in the locked category distribution', () => {
  const checklist = useDailyChecklist({ now: fixedClock });

  assert.equal(checklist.items.value.length, 9);
  assert.equal(checklist.totalCount.value, 9);

  const contentCount = checklist.items.value.filter((item) => item.category === 'content').length;
  const communityCount = checklist.items.value.filter((item) => item.category === 'community').length;
  const growthCount = checklist.items.value.filter((item) => item.category === 'growth').length;
  assert.equal(contentCount, 4);
  assert.equal(communityCount, 3);
  assert.equal(growthCount, 2);

  // every item starts unchecked when nothing is persisted
  assert.equal(checklist.completedCount.value, 0);
});

test('toggle flips completed and sets then clears completedAt', () => {
  const checklist = useDailyChecklist({ now: fixedClock });

  checklist.toggle('youtube-video');
  const toggledOn = checklist.items.value.find((item) => item.id === 'youtube-video');
  assert.equal(toggledOn?.completed, true);
  assert.equal(toggledOn?.completedAt, FIXED_NOW.getTime());

  checklist.toggle('youtube-video');
  const toggledOff = checklist.items.value.find((item) => item.id === 'youtube-video');
  assert.equal(toggledOff?.completed, false);
  assert.equal(toggledOff?.completedAt, null);
});

test('completedCount stays accurate across multiple toggles', () => {
  const checklist = useDailyChecklist({ now: fixedClock });

  checklist.toggle('youtube-video');
  checklist.toggle('facebook-post');
  checklist.toggle('newsletter');
  assert.equal(checklist.completedCount.value, 3);

  checklist.toggle('facebook-post');
  assert.equal(checklist.completedCount.value, 2);
});

test('state survives a localStorage round-trip on re-init', () => {
  const first = useDailyChecklist({ now: fixedClock });
  first.toggle('discord-unanswered');

  const second = useDailyChecklist({ now: fixedClock });
  const restored = second.items.value.find((item) => item.id === 'discord-unanswered');
  assert.equal(restored?.completed, true);
  assert.equal(restored?.completedAt, FIXED_NOW.getTime());
  assert.equal(second.completedCount.value, 1);
});

test('a new calendar day produces a fresh unchecked list', () => {
  const dayOne = useDailyChecklist({ now: () => new Date(2026, 4, 21, 10, 0, 0) });
  dayOne.toggle('strategy-content');
  assert.equal(dayOne.completedCount.value, 1);

  const dayTwo = useDailyChecklist({ now: () => new Date(2026, 4, 22, 9, 0, 0) });
  assert.equal(dayTwo.completedCount.value, 0);
  assert.equal(dayTwo.items.value.every((item) => item.completed === false), true);
});

test('keys older than 30 days are pruned on init; recent and unrelated keys survive', () => {
  const staleKey = 'la-dashboard-checklist-mock-user-2026-03-01';
  const recentKey = 'la-dashboard-checklist-mock-user-2026-05-20';
  seed(staleKey, { 'youtube-video': { completed: true, completedAt: 1 } });
  seed(recentKey, { 'youtube-video': { completed: true, completedAt: 1 } });
  globalThis.localStorage.setItem('la-dashboard-theme', 'dark');

  useDailyChecklist({ now: fixedClock });

  assert.equal(globalThis.localStorage.getItem(staleKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentKey), null);
  assert.equal(globalThis.localStorage.getItem('la-dashboard-theme'), 'dark');
});

test('toggle with an unknown id mutates nothing and does not throw', () => {
  const checklist = useDailyChecklist({ now: fixedClock });

  assert.doesNotThrow(() => checklist.toggle('not-a-real-item'));
  assert.equal(checklist.completedCount.value, 0);
  assert.equal(checklist.items.value.length, 9);
});

test('persisted ids absent from config are ignored and missing config ids stay unchecked', () => {
  seed(TODAY_KEY, {
    'youtube-video': { completed: true, completedAt: 123 },
    'ghost-item': { completed: true, completedAt: 456 },
  });

  const checklist = useDailyChecklist({ now: fixedClock });

  assert.equal(checklist.items.value.length, 9);
  assert.equal(checklist.items.value.some((item) => item.id === 'ghost-item'), false);

  const youtube = checklist.items.value.find((item) => item.id === 'youtube-video');
  assert.equal(youtube?.completed, true);

  const newsletter = checklist.items.value.find((item) => item.id === 'newsletter');
  assert.equal(newsletter?.completed, false);
});

test('shape-invalid persisted entries fall back to unchecked without throwing', () => {
  seed(TODAY_KEY, {
    'youtube-video': { completed: 'yes', completedAt: null },
    'facebook-post': 5,
    'newsletter': { completed: true, completedAt: 'soon' },
  });

  let checklist!: ReturnType<typeof useDailyChecklist>;
  assert.doesNotThrow(() => {
    checklist = useDailyChecklist({ now: fixedClock });
  });

  assert.equal(checklist.loadError.value, false);
  assert.equal(checklist.items.value.length, 9);
  assert.equal(checklist.completedCount.value, 0);
});
