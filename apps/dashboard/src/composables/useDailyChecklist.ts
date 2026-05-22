import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { useAuthStore } from '../stores/auth.js';

export type ChecklistCategory = 'content' | 'community' | 'growth';
export type ChecklistCadence = 'daily' | 'weekly' | 'as-scheduled';

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
const STALE_KEY_MAX_AGE_DAYS = 30;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const FALLBACK_USER_ID = 'mock-user';

/**
 * Static configuration for the Daily Execution Panel. The render order here is
 * the displayed order (content, then community, then growth); the UI never
 * sorts or re-derives it. Adding or removing an item is a deliberate code
 * change, not a runtime concern.
 */
const CHECKLIST_CONFIG: readonly ChecklistConfigItem[] = [
  { id: 'youtube-video', label: 'YouTube video published', category: 'content', cadence: 'daily' },
  { id: 'youtube-short', label: 'YouTube Short posted', category: 'content', cadence: 'daily' },
  { id: 'facebook-post', label: 'Facebook post published', category: 'content', cadence: 'daily' },
  { id: 'newsletter', label: 'Newsletter drafted / scheduled', category: 'content', cadence: 'weekly' },
  { id: 'discord-response-sla', label: 'Discord response time < 4h', category: 'community', cadence: 'daily' },
  { id: 'discord-unanswered', label: 'Unanswered Discord threads < 5', category: 'community', cadence: 'daily' },
  { id: 'player-acknowledgment', label: 'Top active players acknowledged', category: 'community', cadence: 'daily' },
  { id: 'tournament-promotion', label: 'Tournament announced / promoted', category: 'growth', cadence: 'as-scheduled' },
  { id: 'strategy-content', label: 'Strategy/deck content posted', category: 'growth', cadence: 'as-scheduled' },
];

/**
 * Resolves the user id used in the localStorage key. Under mock auth (the
 * current default) every browser shares the stable 'mock-user' id so the
 * checklist persists across reloads. The real-auth branch reads the
 * authenticated id once a real auth backend ships.
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
    return authStore.user?.id ?? FALLBACK_USER_ID;
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
  const hasValidCompletedAt = typeof candidate.completedAt === 'number' || candidate.completedAt === null;
  return hasValidCompleted && hasValidCompletedAt;
}

interface PersistedStateReadResult {
  entries: Record<string, unknown>;
  hadParseError: boolean;
}

/**
 * Reads and parses the persisted state for a single day's key. A missing key
 * is an empty (unchecked) state. A non-object payload is treated as empty. A
 * JSON parse failure is surfaced as a parse error so the panel can render its
 * error state instead of crashing.
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

/**
 * Merges persisted entries onto the static config. Iterates the static array
 * only: every config item produces exactly one rendered item, so the rendered
 * count always equals the config length. Persisted ids absent from the config
 * are ignored; config ids absent from the persisted state stay unchecked.
 */
function buildItems(entries: Record<string, unknown>): DailyChecklistItem[] {
  const result: DailyChecklistItem[] = [];
  for (const configItem of CHECKLIST_CONFIG) {
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
 * Extracts the trailing 'YYYY-MM-DD' date from a checklist storage key. The
 * user id segment may itself contain hyphens (e.g. 'mock-user'), so the date
 * is always the final three hyphen-separated groups.
 */
function parseDateFromKey(key: string): Date | null {
  const suffix = key.slice(STORAGE_KEY_PREFIX.length);
  const segments = suffix.split('-');
  if (segments.length < 3) {
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
 * Deletes checklist keys whose date is more than 30 days before the reference
 * date. Only keys with the checklist prefix are inspected; every other
 * localStorage key (including the theme preference) is left untouched.
 */
function pruneStaleKeys(referenceDate: Date): void {
  const checklistKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== null && key.startsWith(STORAGE_KEY_PREFIX)) {
      checklistKeys.push(key);
    }
  }
  const cutoffTime = referenceDate.getTime() - STALE_KEY_MAX_AGE_DAYS * MILLISECONDS_PER_DAY;
  for (const key of checklistKeys) {
    const keyDate = parseDateFromKey(key);
    if (keyDate !== null && keyDate.getTime() < cutoffTime) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Provides the Daily Execution Panel's checklist state, persisted in
 * localStorage per user per local calendar day. Persistence happens through
 * explicit writes in toggle() and resetAll() only — there are no watchers.
 *
 * @param options.now Injectable clock returning the current Date. Tests pass a
 *   fixed clock here instead of mocking the global Date; production omits it.
 */
export function useDailyChecklist(options?: UseDailyChecklistOptions): UseDailyChecklistReturn {
  const now = options?.now ?? (() => new Date());

  const userId = resolveUserId();
  const dateString = formatLocalDateString(now());
  const storageKey = `${STORAGE_KEY_PREFIX}${userId}-${dateString}`;

  const { entries, hadParseError } = readPersistedState(storageKey);
  const items = ref<DailyChecklistItem[]>(buildItems(entries));
  const loadError = ref(hadParseError);
  const loadedAt = ref(now().getTime());

  pruneStaleKeys(now());

  const totalCount = computed(() => items.value.length);
  const completedCount = computed(
    () => items.value.filter((item) => item.completed).length,
  );

  /**
   * Persists the current item state for today's key. A write failure (for
   * example, exceeding the storage quota) must not break the toggle, so it is
   * caught and ignored.
   */
  function persist(): void {
    const snapshot: Record<string, PersistedEntry> = {};
    for (const item of items.value) {
      snapshot[item.id] = { completed: item.completed, completedAt: item.completedAt };
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
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
