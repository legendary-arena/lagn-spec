import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  useDailyChecklist,
  formatPeriodKey,
  deriveStorageKey,
  CHECKLIST_CADENCES,
  type ChecklistCadence,
} from './useDailyChecklist.js';

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

// ============================================================================
// WP-198 / EC-224a — additive tests for cadence horizons (D-19801).
// The 9 tests above are the WP-162 baseline preserved byte-identical per
// EC-224a §Guardrails ("MUST NOT modify the 9 existing useDailyChecklist
// tests"). Everything below is additive coverage for the cadence union
// extension, per-cadence storage-key shapes, prune branches, and drift
// gates.
// ============================================================================

test('CHECKLIST_CADENCES drift gate: array deep-equals the union members in locked order', () => {
  // why: mirrors MATCH_PHASES / TURN_STAGES canonical-array pattern from
  // `.claude/rules/code-style.md §Drift Detection`. Adding a 6th cadence to
  // the union without updating CHECKLIST_CADENCES (or vice versa) fails
  // this assertion loudly. The type-level lock at the bottom catches the
  // union-side drift; the deepEqual catches the array-side drift.
  assert.deepEqual(CHECKLIST_CADENCES, [
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'as-scheduled',
  ]);
  assert.equal(CHECKLIST_CADENCES.length, 5);
  const unionCheck: ReadonlyArray<ChecklistCadence> = CHECKLIST_CADENCES;
  assert.equal(unionCheck.length, 5);
});

test('formatPeriodKey monthly returns YYYY-MM zero-padded across month boundaries', () => {
  assert.equal(formatPeriodKey(new Date(2026, 0, 1), 'monthly'), '2026-01');
  assert.equal(formatPeriodKey(new Date(2026, 0, 31), 'monthly'), '2026-01');
  assert.equal(formatPeriodKey(new Date(2026, 1, 1), 'monthly'), '2026-02');
  assert.equal(formatPeriodKey(new Date(2026, 11, 31), 'monthly'), '2026-12');
});

test('formatPeriodKey quarterly returns YYYY-Q[1-4] across quarter boundaries', () => {
  assert.equal(formatPeriodKey(new Date(2026, 0, 1), 'quarterly'), '2026-Q1');
  assert.equal(formatPeriodKey(new Date(2026, 2, 31), 'quarterly'), '2026-Q1');
  assert.equal(formatPeriodKey(new Date(2026, 3, 1), 'quarterly'), '2026-Q2');
  assert.equal(formatPeriodKey(new Date(2026, 5, 30), 'quarterly'), '2026-Q2');
  assert.equal(formatPeriodKey(new Date(2026, 6, 1), 'quarterly'), '2026-Q3');
  assert.equal(formatPeriodKey(new Date(2026, 8, 30), 'quarterly'), '2026-Q3');
  assert.equal(formatPeriodKey(new Date(2026, 9, 1), 'quarterly'), '2026-Q4');
  assert.equal(formatPeriodKey(new Date(2026, 11, 31), 'quarterly'), '2026-Q4');
});

test('formatPeriodKey monthly + quarterly respect year boundaries', () => {
  assert.equal(formatPeriodKey(new Date(2026, 11, 31), 'monthly'), '2026-12');
  assert.equal(formatPeriodKey(new Date(2027, 0, 1), 'monthly'), '2027-01');
  assert.equal(formatPeriodKey(new Date(2026, 11, 31), 'quarterly'), '2026-Q4');
  assert.equal(formatPeriodKey(new Date(2027, 0, 1), 'quarterly'), '2027-Q1');
});

test('daily storage-key drift gate: WP-162 shape byte-identical for cadence === daily', () => {
  // why: D-19801 locked the daily storage-key shape to WP-162's exact form so
  // operator-persisted state migrates silently across the WP-198 boundary.
  // This is the auditable invariant — a manually-constructed reference
  // string must match the derived key byte-for-byte.
  const referenceDate = new Date(2026, 5, 1);
  assert.equal(
    deriveStorageKey('u1', 'daily', referenceDate),
    'la-dashboard-checklist-u1-2026-06-01',
  );
  assert.equal(
    deriveStorageKey('mock-user', 'daily', referenceDate),
    'la-dashboard-checklist-mock-user-2026-06-01',
  );
});

test('as-scheduled cadence shares the daily storage-key shape (renders under Today)', () => {
  const referenceDate = new Date(2026, 5, 1);
  const dailyKey = deriveStorageKey('u1', 'daily', referenceDate);
  const asScheduledKey = deriveStorageKey('u1', 'as-scheduled', referenceDate);
  assert.equal(dailyKey, asScheduledKey);
});

test('weekly storage-key shape uses ISO-8601 week-numbered periodKey', () => {
  // 2026-06-02 is a Tuesday inside ISO week 23 (2026-W23 starts Mon 2026-06-01).
  assert.equal(
    deriveStorageKey('u1', 'weekly', new Date(2026, 5, 2)),
    'la-dashboard-checklist-u1-weekly-2026-W23',
  );
  // 2026-01-04 is a Sunday — still inside ISO week 1 (which starts Mon 2025-12-29).
  // Per ISO 8601: the week's year is the year of its Thursday (2026-01-01 = Thu).
  assert.equal(
    deriveStorageKey('u1', 'weekly', new Date(2026, 0, 4)),
    'la-dashboard-checklist-u1-weekly-2026-W01',
  );
});

test('monthly storage-key shape uses YYYY-MM periodKey', () => {
  assert.equal(
    deriveStorageKey('u1', 'monthly', new Date(2026, 5, 1)),
    'la-dashboard-checklist-u1-monthly-2026-06',
  );
  assert.equal(
    deriveStorageKey('u1', 'monthly', new Date(2026, 0, 1)),
    'la-dashboard-checklist-u1-monthly-2026-01',
  );
});

test('quarterly storage-key shape uses YYYY-Q[1-4] periodKey', () => {
  assert.equal(
    deriveStorageKey('u1', 'quarterly', new Date(2026, 0, 1)),
    'la-dashboard-checklist-u1-quarterly-2026-Q1',
  );
  assert.equal(
    deriveStorageKey('u1', 'quarterly', new Date(2026, 5, 1)),
    'la-dashboard-checklist-u1-quarterly-2026-Q2',
  );
  assert.equal(
    deriveStorageKey('u1', 'quarterly', new Date(2026, 11, 31)),
    'la-dashboard-checklist-u1-quarterly-2026-Q4',
  );
});

test('weekly prune branch removes weekly keys older than 90 days; recent weekly keys survive', () => {
  // Reference date: 2026-05-21 (FIXED_NOW). 90-day cutoff: 2026-02-20.
  // Stale weekly key: 2026-W01 (Mon 2025-12-29 — before cutoff).
  // Recent weekly key: 2026-W20 (Mon 2026-05-11 — after cutoff).
  const staleWeeklyKey = 'la-dashboard-checklist-mock-user-weekly-2026-W01';
  const recentWeeklyKey = 'la-dashboard-checklist-mock-user-weekly-2026-W20';
  seed(staleWeeklyKey, { newsletter: { completed: true, completedAt: 1 } });
  seed(recentWeeklyKey, { newsletter: { completed: true, completedAt: 1 } });

  useDailyChecklist({ now: fixedClock });

  assert.equal(globalThis.localStorage.getItem(staleWeeklyKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentWeeklyKey), null);
});

test('monthly prune branch removes monthly keys older than 365 days; recent monthly keys survive', () => {
  // Reference date: 2026-05-21. 365-day cutoff: ~2025-05-21.
  // Stale monthly key: 2024-12 (Dec 1, 2024 — well before cutoff).
  // Recent monthly key: 2026-04 (April 1, 2026 — after cutoff).
  const staleMonthlyKey = 'la-dashboard-checklist-mock-user-monthly-2024-12';
  const recentMonthlyKey = 'la-dashboard-checklist-mock-user-monthly-2026-04';
  seed(staleMonthlyKey, {});
  seed(recentMonthlyKey, {});

  useDailyChecklist({ now: fixedClock });

  assert.equal(globalThis.localStorage.getItem(staleMonthlyKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentMonthlyKey), null);
});

test('quarterly prune branch removes quarterly keys older than 730 days; recent quarterly keys survive', () => {
  // Reference date: 2026-05-21. 730-day cutoff: ~2024-05-21.
  // Stale quarterly key: 2023-Q1 (Jan 1, 2023 — well before cutoff).
  // Recent quarterly key: 2025-Q4 (Oct 1, 2025 — after cutoff).
  const staleQuarterlyKey = 'la-dashboard-checklist-mock-user-quarterly-2023-Q1';
  const recentQuarterlyKey = 'la-dashboard-checklist-mock-user-quarterly-2025-Q4';
  seed(staleQuarterlyKey, {});
  seed(recentQuarterlyKey, {});

  useDailyChecklist({ now: fixedClock });

  assert.equal(globalThis.localStorage.getItem(staleQuarterlyKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentQuarterlyKey), null);
});

test('per-cadence prune branches leave the other cadences alone (no cross-cadence prune)', () => {
  // A stale daily key (well outside the 30-day window) and a recent key for
  // each of weekly/monthly/quarterly. The daily branch removes ONLY the
  // stale daily key; the recent weekly/monthly/quarterly keys are not in
  // any prune branch's window and must survive.
  const staleDailyKey = 'la-dashboard-checklist-mock-user-2026-01-01';
  const recentWeeklyKey = 'la-dashboard-checklist-mock-user-weekly-2026-W20';
  const recentMonthlyKey = 'la-dashboard-checklist-mock-user-monthly-2026-05';
  const recentQuarterlyKey = 'la-dashboard-checklist-mock-user-quarterly-2026-Q2';
  seed(staleDailyKey, {});
  seed(recentWeeklyKey, {});
  seed(recentMonthlyKey, {});
  seed(recentQuarterlyKey, {});

  useDailyChecklist({ now: fixedClock });

  assert.equal(globalThis.localStorage.getItem(staleDailyKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentWeeklyKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentMonthlyKey), null);
  assert.notEqual(globalThis.localStorage.getItem(recentQuarterlyKey), null);
});

test('toggle on a daily item writes the WP-162-shape daily key byte-identical', () => {
  // End-to-end gate: through the public API (toggle), the localStorage key
  // for a daily item under mock auth (mock-user) on FIXED_NOW (2026-05-21)
  // must exactly equal the manually-constructed reference key.
  const checklist = useDailyChecklist({ now: fixedClock });
  checklist.toggle('youtube-video');

  const expectedDailyKey = 'la-dashboard-checklist-mock-user-2026-05-21';
  const persistedRaw = globalThis.localStorage.getItem(expectedDailyKey);
  assert.notEqual(persistedRaw, null);
  const persisted = JSON.parse(persistedRaw as string) as Record<string, { completed: boolean }>;
  assert.equal(persisted['youtube-video']?.completed, true);
});

test('toggle on a weekly item writes to the weekly-cadence key, not the daily key', () => {
  const checklist = useDailyChecklist({ now: fixedClock });
  checklist.toggle('newsletter');

  // 2026-05-21 is a Thursday → ISO week 21 of 2026.
  const expectedWeeklyKey = 'la-dashboard-checklist-mock-user-weekly-2026-W21';
  const weeklyRaw = globalThis.localStorage.getItem(expectedWeeklyKey);
  assert.notEqual(weeklyRaw, null);
  const weeklyPersisted = JSON.parse(weeklyRaw as string) as Record<string, { completed: boolean }>;
  assert.equal(weeklyPersisted['newsletter']?.completed, true);

  // Daily key MUST NOT contain the weekly newsletter entry — the per-cadence
  // split is what allows weekly state to outlive a single calendar day.
  const dailyRaw = globalThis.localStorage.getItem('la-dashboard-checklist-mock-user-2026-05-21');
  assert.notEqual(dailyRaw, null);
  const dailyPersisted = JSON.parse(dailyRaw as string) as Record<string, unknown>;
  assert.equal('newsletter' in dailyPersisted, false);
});
