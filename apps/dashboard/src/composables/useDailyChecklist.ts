import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useAuthStore } from '../stores/auth.js';

export type ChecklistCategory = 'content' | 'community' | 'growth';
export type ChecklistCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'as-scheduled';

/**
 * Canonical readonly array mirroring the `ChecklistCadence` union. Drift-pinned
 * via a `node:test` assertion so adding a 6th cadence to the union without
 * updating this array (or vice versa) fails loudly. Pattern mirrors
 * `MATCH_PHASES` / `TURN_STAGES` from `.claude/rules/code-style.md §Drift
 * Detection`.
 */
export const CHECKLIST_CADENCES: readonly ChecklistCadence[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'as-scheduled',
];

export interface DailyChecklistItem {
  id: string;
  label: string;
  category: ChecklistCategory;
  cadence: ChecklistCadence;
  completed: boolean;
  completedAt: number | null;
}

interface ChecklistConfigItem {
  id: string;
  label: string;
  category: ChecklistCategory;
  cadence: ChecklistCadence;
}

interface PersistedEntry {
  completed: boolean;
  completedAt: number | null;
}

interface UseDailyChecklistOptions {
  now?: () => Date;
}

interface UseDailyChecklistReturn {
  items: Ref<DailyChecklistItem[]>;
  completedCount: ComputedRef<number>;
  totalCount: ComputedRef<number>;
  loadError: Ref<boolean>;
  loadedAt: Ref<number>;
  toggle: (id: string) => void;
  resetAll: () => void;
}

const STORAGE_KEY_PREFIX = 'la-dashboard-checklist-';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_USER_ID = 'mock-user';

const DAILY_RETENTION_DAYS = 30;
const WEEKLY_RETENTION_DAYS = 90;
const MONTHLY_RETENTION_DAYS = 365;
const QUARTERLY_RETENTION_DAYS = 730;

/**
 * Static configuration for the Daily Execution Panel. The render order here is
 * the displayed order (content, then community, then growth); the UI never
 * sorts or re-derives it. Adding or removing an item is a deliberate code
 * change, not a runtime concern. The current 9-item set is the WP-162
 * baseline; the cadence union now admits `monthly` and `quarterly` but no
 * example items at those cadences are added in WP-198 — adding any would
 * break the 9-existing-test byte-identity invariant (test 1 asserts the
 * exact item count and per-category distribution). Monthly + quarterly
 * horizon tabs surface as empty-state until a follow-up WP curates items.
 */
const CHECKLIST_CONFIG: readonly ChecklistConfigItem[] = [
  { id: 'youtube-video', label: 'YouTube video published', category: 'content', cadence: 'daily' },
  { id: 'youtube-short', label: 'YouTube Short posted', category: 'content', cadence: 'daily' },
  { id: 'facebook-post', label: 'Facebook post published', category: 'content', cadence: 'daily' },
  {
    id: 'newsletter',
    label: 'Newsletter drafted / scheduled',
    category: 'content',
    cadence: 'weekly',
  },
  {
    id: 'discord-response-sla',
    label: 'Discord response time < 4h',
    category: 'community',
    cadence: 'daily',
  },
  {
    id: 'discord-unanswered',
    label: 'Unanswered Discord threads < 5',
    category: 'community',
    cadence: 'daily',
  },
  {
    id: 'player-acknowledgment',
    label: 'Top active players acknowledged',
    category: 'community',
    cadence: 'daily',
  },
  {
    id: 'tournament-promotion',
    label: 'Tournament announced / promoted',
    category: 'growth',
    cadence: 'as-scheduled',
  },
  {
    id: 'strategy-content',
    label: 'Strategy/deck content posted',
    category: 'growth',
    cadence: 'as-scheduled',
  },
];

/**
 * Resolves the user id used in the localStorage key. Under mock mode (the
 * current default) every browser shares the stable 'mock-user' id so the
 * checklist persists across reloads. Under live auth (WP-241) the key is the
 * operator's `accountId` (server-provisioned `ext_id`); until that surfaces on
 * the first authenticated profile call it is `null`, so the stable fallback id
 * is used — the checklist is operator-local persistence, not security state.
 */
function resolveUserId(): string {
  // why: import.meta.env is injected by Vite at build time; in the node:test
  // runtime it is absent, so widen the type and guard before reading it.
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const isMockMode = viteEnv?.VITE_USE_MOCKS === 'true';
  if (isMockMode) {
    return FALLBACK_USER_ID;
  }
  try {
    const authStore = useAuthStore();
    return authStore.accountId ?? FALLBACK_USER_ID;
  } catch {
    // why: outside an active Pinia instance (e.g. unit tests, or before the
    // app mounts) there is no auth store to read; fall back to the stable
    // mock id rather than throwing, which would blank the panel.
    return FALLBACK_USER_ID;
  }
}

/**
 * Builds a 'YYYY-MM-DD' date string from the browser's local calendar fields.
 * Local fields (not toISOString / toLocaleDateString) are required so the
 * checklist resets at local midnight rather than at a UTC boundary.
 */
function formatLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns an ISO-8601 week-numbered key (`YYYY-Www`) for a local date. ISO
 * weeks belong to the year of their Thursday; week 1 is the week containing
 * the first Thursday of the year. The week-count math runs in UTC to avoid
 * DST boundary drift — a local-timestamp subtraction across the
 * spring-forward day is off by one hour and rounds the week number down.
 */
function formatIsoWeek(date: Date): string {
  // why: feed the local calendar fields into Date.UTC so the subsequent
  // millisecond subtraction is DST-free. The returned token is still
  // correct for the date the operator sees on their local calendar.
  const reference = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOffsetFromMonday = (reference.getUTCDay() + 6) % 7;
  reference.setUTCDate(reference.getUTCDate() - dayOffsetFromMonday + 3);
  const isoYear = reference.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursdayOffset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayOffset + 3);
  const weekNumber =
    Math.floor((reference.getTime() - firstThursday.getTime()) / (7 * MILLISECONDS_PER_DAY)) + 1;
  return `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Returns the period key string for a monthly or quarterly cadence. Pure;
 * never reads `Date.now()` so tests can pass a fixed date and assert
 * byte-identical output. Daily and weekly cadences use their own dedicated
 * formatters (`formatLocalDateString`, `formatIsoWeek`) and do NOT route
 * through this function.
 */
export function formatPeriodKey(date: Date, cadence: 'monthly' | 'quarterly'): string {
  if (cadence === 'monthly') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Derives the localStorage key for an item with the given cadence on the given
 * reference date. Daily and as-scheduled items share the daily key (the WP-162
 * shape, byte-identical). Weekly / monthly / quarterly items use their own
 * cadence-tagged shape. Exported so the per-cadence storage-key drift gates
 * (per EC-224a §After Completing) can assert byte-identical shapes against
 * manually-constructed reference strings.
 */
export function deriveStorageKey(
  userId: string,
  cadence: ChecklistCadence,
  referenceDate: Date,
): string {
  // why: D-19801 — the daily key shape is byte-identical to WP-162 so
  // operator-persisted state migrates silently across the WP-198 boundary.
  // The `as-scheduled` cadence reuses the daily key per the WP-198 §Locked
  // Contract Values (those items render under the Today tab).
  if (cadence === 'daily' || cadence === 'as-scheduled') {
    return `${STORAGE_KEY_PREFIX}${userId}-${formatLocalDateString(referenceDate)}`;
  }
  if (cadence === 'weekly') {
    return `${STORAGE_KEY_PREFIX}${userId}-weekly-${formatIsoWeek(referenceDate)}`;
  }
  if (cadence === 'monthly') {
    return `${STORAGE_KEY_PREFIX}${userId}-monthly-${formatPeriodKey(referenceDate, 'monthly')}`;
  }
  return `${STORAGE_KEY_PREFIX}${userId}-quarterly-${formatPeriodKey(referenceDate, 'quarterly')}`;
}

/**
 * Type guard for a single persisted entry. A persisted value is only applied
 * to an item when it has the exact expected shape; malformed values are
 * ignored (the item stays unchecked) rather than coerced.
 */
function isValidPersistedEntry(value: unknown): value is PersistedEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const hasValidCompleted = typeof candidate.completed === 'boolean';
  const hasValidCompletedAt =
    typeof candidate.completedAt === 'number' || candidate.completedAt === null;
  return hasValidCompleted && hasValidCompletedAt;
}

interface PersistedStateReadResult {
  entries: Record<string, unknown>;
  hadParseError: boolean;
}

/**
 * Reads and parses the persisted state for a single storage key. A missing
 * key is an empty (unchecked) state. A non-object payload is treated as empty.
 * A JSON parse failure is surfaced as a parse error so the panel can render
 * its error state instead of crashing.
 */
function readPersistedState(storageKey: string): PersistedStateReadResult {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) {
    return { entries: {}, hadParseError: false };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { entries: parsed as Record<string, unknown>, hadParseError: false };
    }
    // why: a syntactically valid but non-object payload (a bare number, string,
    // or array) is corrupt for this key, but it is not a parse failure; render
    // an unchecked list rather than the error state.
    return { entries: {}, hadParseError: false };
  } catch {
    // why: malformed JSON must surface as the panel's error state per the
    // widget contract, not throw and blank the UI.
    return { entries: {}, hadParseError: true };
  }
}

interface CadenceEntries {
  readonly daily: Record<string, unknown>;
  readonly weekly: Record<string, unknown>;
  readonly monthly: Record<string, unknown>;
  readonly quarterly: Record<string, unknown>;
}

/**
 * Picks the entries record that holds the persisted state for an item with the
 * given cadence. Daily and as-scheduled items share the daily entries record;
 * the rest map one-to-one.
 */
function entriesForCadence(
  allEntries: CadenceEntries,
  cadence: ChecklistCadence,
): Record<string, unknown> {
  if (cadence === 'daily' || cadence === 'as-scheduled') {
    return allEntries.daily;
  }
  if (cadence === 'weekly') {
    return allEntries.weekly;
  }
  if (cadence === 'monthly') {
    return allEntries.monthly;
  }
  return allEntries.quarterly;
}

/**
 * Merges per-cadence persisted entries onto the static config. Iterates the
 * static array only: every config item produces exactly one rendered item, so
 * the rendered count always equals the config length. Persisted ids absent
 * from the config are ignored; config ids absent from persisted state stay
 * unchecked.
 */
function buildItems(allEntries: CadenceEntries): DailyChecklistItem[] {
  const result: DailyChecklistItem[] = [];
  for (const configItem of CHECKLIST_CONFIG) {
    const entries = entriesForCadence(allEntries, configItem.cadence);
    const persistedEntry = entries[configItem.id];
    if (isValidPersistedEntry(persistedEntry)) {
      result.push({
        ...configItem,
        completed: persistedEntry.completed,
        completedAt: persistedEntry.completedAt,
      });
    } else {
      result.push({ ...configItem, completed: false, completedAt: null });
    }
  }
  return result;
}

/**
 * Extracts the trailing date from a daily storage key (`...-YYYY-MM-DD`). Keys
 * that carry a cadence marker (`-weekly-`, `-monthly-`, `-quarterly-`) are
 * NOT classified as daily and return null. The user id segment may itself
 * contain hyphens (e.g., 'mock-user'), so the date is always the final three
 * hyphen-separated groups.
 */
function parseDailyKeyDate(key: string): Date | null {
  if (!key.startsWith(STORAGE_KEY_PREFIX)) {
    return null;
  }
  const suffix = key.slice(STORAGE_KEY_PREFIX.length);
  const segments = suffix.split('-');
  if (segments.length < 4) {
    return null;
  }
  const cadenceMarker = segments[segments.length - 3];
  if (cadenceMarker === 'weekly' || cadenceMarker === 'monthly' || cadenceMarker === 'quarterly') {
    return null;
  }
  const dayPart = segments[segments.length - 1];
  const monthPart = segments[segments.length - 2];
  const yearPart = segments[segments.length - 3];
  if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
    return null;
  }
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/**
 * Extracts the reference date (Monday of the ISO week) from a weekly storage
 * key (`...-weekly-YYYY-Www`). Returns null for any key that does not carry
 * the `weekly` marker as its 4th-from-last hyphen segment.
 */
function parseWeeklyKeyDate(key: string): Date | null {
  if (!key.startsWith(STORAGE_KEY_PREFIX)) {
    return null;
  }
  const segments = key.slice(STORAGE_KEY_PREFIX.length).split('-');
  if (segments.length < 4) {
    return null;
  }
  if (segments[segments.length - 3] !== 'weekly') {
    return null;
  }
  const yearPart = segments[segments.length - 2];
  const weekToken = segments[segments.length - 1];
  if (yearPart === undefined || weekToken === undefined || !weekToken.startsWith('W')) {
    return null;
  }
  const year = Number(yearPart);
  const weekNumber = Number(weekToken.slice(1));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(weekNumber) ||
    weekNumber < 1 ||
    weekNumber > 53
  ) {
    return null;
  }
  const firstThursday = new Date(year, 0, 4);
  const firstThursdayOffset = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayOffset + 3);
  const weekStartMs =
    firstThursday.getTime() +
    (weekNumber - 1) * 7 * MILLISECONDS_PER_DAY -
    3 * MILLISECONDS_PER_DAY;
  return new Date(weekStartMs);
}

/**
 * Extracts the reference date (first day of the month) from a monthly storage
 * key (`...-monthly-YYYY-MM`). Returns null for any key that does not carry
 * the `monthly` marker as its 4th-from-last hyphen segment.
 */
function parseMonthlyKeyDate(key: string): Date | null {
  if (!key.startsWith(STORAGE_KEY_PREFIX)) {
    return null;
  }
  const segments = key.slice(STORAGE_KEY_PREFIX.length).split('-');
  if (segments.length < 4) {
    return null;
  }
  if (segments[segments.length - 3] !== 'monthly') {
    return null;
  }
  const yearPart = segments[segments.length - 2];
  const monthPart = segments[segments.length - 1];
  if (yearPart === undefined || monthPart === undefined) {
    return null;
  }
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return new Date(year, month - 1, 1);
}

/**
 * Extracts the reference date (first day of the quarter) from a quarterly
 * storage key (`...-quarterly-YYYY-Qn`). Returns null for any key that does
 * not carry the `quarterly` marker as its 4th-from-last hyphen segment.
 */
function parseQuarterlyKeyDate(key: string): Date | null {
  if (!key.startsWith(STORAGE_KEY_PREFIX)) {
    return null;
  }
  const segments = key.slice(STORAGE_KEY_PREFIX.length).split('-');
  if (segments.length < 4) {
    return null;
  }
  if (segments[segments.length - 3] !== 'quarterly') {
    return null;
  }
  const yearPart = segments[segments.length - 2];
  const quarterToken = segments[segments.length - 1];
  if (yearPart === undefined || quarterToken === undefined || !quarterToken.startsWith('Q')) {
    return null;
  }
  const year = Number(yearPart);
  const quarter = Number(quarterToken.slice(1));
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    return null;
  }
  return new Date(year, (quarter - 1) * 3, 1);
}

/**
 * Deletes stale checklist keys per cadence-specific retention. Each retention
 * branch is its own `for...of` loop with descriptive variables so the prune
 * logic is explicit and a future reader can trace exactly which cadence
 * removed which key. Theme and other non-checklist keys are left untouched.
 */
function pruneStaleKeys(referenceDate: Date): void {
  const allChecklistKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const candidate = localStorage.key(index);
    if (candidate !== null && candidate.startsWith(STORAGE_KEY_PREFIX)) {
      allChecklistKeys.push(candidate);
    }
  }

  // why: D-19801 — per-cadence prune branches without shared dynamic-prefix
  // logic prevent accidental cross-cadence prune. Each loop classifies its
  // own keys via a dedicated parser; an unrecognized key shape returns null
  // and the loop skips it without removing.

  const dailyCutoffMs = referenceDate.getTime() - DAILY_RETENTION_DAYS * MILLISECONDS_PER_DAY;
  for (const dailyKey of allChecklistKeys) {
    const dailyDate = parseDailyKeyDate(dailyKey);
    if (dailyDate !== null && dailyDate.getTime() < dailyCutoffMs) {
      localStorage.removeItem(dailyKey);
    }
  }

  const weeklyCutoffMs = referenceDate.getTime() - WEEKLY_RETENTION_DAYS * MILLISECONDS_PER_DAY;
  for (const weeklyKey of allChecklistKeys) {
    const weeklyDate = parseWeeklyKeyDate(weeklyKey);
    if (weeklyDate !== null && weeklyDate.getTime() < weeklyCutoffMs) {
      localStorage.removeItem(weeklyKey);
    }
  }

  const monthlyCutoffMs = referenceDate.getTime() - MONTHLY_RETENTION_DAYS * MILLISECONDS_PER_DAY;
  for (const monthlyKey of allChecklistKeys) {
    const monthlyDate = parseMonthlyKeyDate(monthlyKey);
    if (monthlyDate !== null && monthlyDate.getTime() < monthlyCutoffMs) {
      localStorage.removeItem(monthlyKey);
    }
  }

  const quarterlyCutoffMs =
    referenceDate.getTime() - QUARTERLY_RETENTION_DAYS * MILLISECONDS_PER_DAY;
  for (const quarterlyKey of allChecklistKeys) {
    const quarterlyDate = parseQuarterlyKeyDate(quarterlyKey);
    if (quarterlyDate !== null && quarterlyDate.getTime() < quarterlyCutoffMs) {
      localStorage.removeItem(quarterlyKey);
    }
  }
}

/**
 * Provides the Daily Execution Panel's checklist state, persisted in
 * localStorage per user per cadence period. Daily and as-scheduled items
 * share one storage key (per local calendar day); weekly / monthly /
 * quarterly items each ride their own cadence-tagged storage key.
 * Persistence happens through explicit writes in toggle() and resetAll()
 * only — there are no watchers.
 *
 * @param options.now Injectable clock returning the current Date. Tests pass a
 *   fixed clock here instead of mocking the global Date; production omits it.
 */
export function useDailyChecklist(options?: UseDailyChecklistOptions): UseDailyChecklistReturn {
  const now = options?.now ?? (() => new Date());

  const userId = resolveUserId();
  const referenceDate = now();
  const dailyKey = deriveStorageKey(userId, 'daily', referenceDate);
  const weeklyKey = deriveStorageKey(userId, 'weekly', referenceDate);
  const monthlyKey = deriveStorageKey(userId, 'monthly', referenceDate);
  const quarterlyKey = deriveStorageKey(userId, 'quarterly', referenceDate);

  const dailyState = readPersistedState(dailyKey);
  const weeklyState = readPersistedState(weeklyKey);
  const monthlyState = readPersistedState(monthlyKey);
  const quarterlyState = readPersistedState(quarterlyKey);

  const allEntries: CadenceEntries = {
    daily: dailyState.entries,
    weekly: weeklyState.entries,
    monthly: monthlyState.entries,
    quarterly: quarterlyState.entries,
  };

  const items = ref<DailyChecklistItem[]>(buildItems(allEntries));
  const loadError = ref(
    dailyState.hadParseError ||
      weeklyState.hadParseError ||
      monthlyState.hadParseError ||
      quarterlyState.hadParseError,
  );
  const loadedAt = ref(referenceDate.getTime());

  pruneStaleKeys(referenceDate);

  const totalCount = computed(() => items.value.length);
  const completedCount = computed(() => items.value.filter((item) => item.completed).length);

  /**
   * Persists the current item state. Each cadence's items are written to that
   * cadence's storage key — daily and as-scheduled items co-locate under the
   * daily key (WP-162 byte-identical shape), the others ride their own keys.
   * A write failure (for example, exceeding the storage quota) must not break
   * the toggle, so it is caught and ignored.
   */
  function persist(): void {
    const dailySnapshot: Record<string, PersistedEntry> = {};
    const weeklySnapshot: Record<string, PersistedEntry> = {};
    const monthlySnapshot: Record<string, PersistedEntry> = {};
    const quarterlySnapshot: Record<string, PersistedEntry> = {};

    for (const item of items.value) {
      const entry: PersistedEntry = { completed: item.completed, completedAt: item.completedAt };
      if (item.cadence === 'daily' || item.cadence === 'as-scheduled') {
        dailySnapshot[item.id] = entry;
      } else if (item.cadence === 'weekly') {
        weeklySnapshot[item.id] = entry;
      } else if (item.cadence === 'monthly') {
        monthlySnapshot[item.id] = entry;
      } else {
        quarterlySnapshot[item.id] = entry;
      }
    }

    try {
      localStorage.setItem(dailyKey, JSON.stringify(dailySnapshot));
      localStorage.setItem(weeklyKey, JSON.stringify(weeklySnapshot));
      localStorage.setItem(monthlyKey, JSON.stringify(monthlySnapshot));
      localStorage.setItem(quarterlyKey, JSON.stringify(quarterlySnapshot));
    } catch {
      // why: a localStorage write can fail when the quota is exceeded or
      // storage is disabled; the in-memory checklist remains usable for the
      // session, so swallow the write error rather than crashing the panel.
    }
  }

  /**
   * Flips the completed state of one item and stamps or clears its completion
   * time using the injected clock. An unknown id is a silent no-op.
   */
  function toggle(id: string): void {
    const target = items.value.find((item) => item.id === id);
    if (target === undefined) {
      return;
    }
    target.completed = !target.completed;
    target.completedAt = target.completed ? now().getTime() : null;
    persist();
  }

  /**
   * Clears every item back to unchecked. This is destructive; the calling
   * component is responsible for confirming intent before invoking it.
   */
  function resetAll(): void {
    for (const item of items.value) {
      item.completed = false;
      item.completedAt = null;
    }
    persist();
  }

  return { items, completedCount, totalCount, loadError, loadedAt, toggle, resetAll };
}
