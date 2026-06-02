import { ref, type Ref } from 'vue';

// why: D-19903 — PII-free contract. The localStorage key
// 'la-dashboard-last-visit' stores an ISO timestamp string only — never
// email, account ID, IP, or any other operator-identifying data. Per-browser
// only; no server-side mirror. The dashboard ships to a CF Pages CDN behind
// Access (WP-197) and localStorage is exposed to any in-browser script, so
// limiting the value to a syntactically-checked ISO string means no recovery
// path leaks identity even under a hypothetical XSS or Access-gate bypass.

const STORAGE_KEY = 'la-dashboard-last-visit';

// why: regex accepts both the offset-zoned form (`...Z`, `...+02:00`,
// `...-07:00`) that `git log --format=%cI` emits AND the optional millis
// segment some tooling adds. Anything else stored under the key is treated
// as corruption and the composable returns null.
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

interface UseLastVisitReturn {
  readonly lastVisit: Ref<string | null>;
  readonly markVisited: (snapshotGeneratedAt: string) => void;
}

/**
 * Reads the persisted last-visit ISO string from localStorage. Returns null
 * for first-visit (no value), corrupted values (does not match the ISO
 * pattern), or any failure mode (localStorage access throwing in private-
 * browsing or quota-exceeded states).
 */
function readPersistedLastVisit(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    if (!ISO_TIMESTAMP_PATTERN.test(raw)) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * LocalStorage-backed "since you last looked" anchor. Tracks the operator's
 * most recent visit so the Overview page can render a one-line diff against
 * the current snapshot. Exposes a reactive `lastVisit` ref and a
 * `markVisited(snapshotGeneratedAt)` writer.
 *
 * The reader returns `null` for first visit, corrupted localStorage value,
 * or any failure mode (localStorage access throws in private-browsing or
 * quota-exceeded states); a null `lastVisit` is the signal for the Overview
 * page to render the first-visit copy instead of the diff form.
 */
export function useLastVisit(): UseLastVisitReturn {
  const lastVisit = ref<string | null>(readPersistedLastVisit());
  let hasMarked = false;

  // why: D-19903 — `markVisited` writes the snapshot's `generatedAt` (the
  // HEAD commit's committer-date ISO from WP-198 D-19804), NEVER
  // `Date.now()`. Two operators opening the same build see byte-identical
  // "since you last looked" deltas regardless of when they clicked. The
  // multi-tab "race" of two tabs writing the same generatedAt is idempotent
  // by construction — both writes produce byte-identical localStorage state.
  //
  // why: D-19910 — single-call-per-mount guard. A naive watcher-driven
  // markVisited would re-fire on any downstream reactive change (e.g., a
  // DailyExecutionPanel checkbox toggle); the one-shot `hasMarked` flag
  // prevents that. The 4-step ordering (read → compute → render → mark)
  // is the caller's responsibility — this composable enforces only the
  // single-call invariant.
  function markVisited(snapshotGeneratedAt: string): void {
    if (hasMarked) {
      return;
    }
    hasMarked = true;
    try {
      localStorage.setItem(STORAGE_KEY, snapshotGeneratedAt);
      lastVisit.value = snapshotGeneratedAt;
    } catch {
      // why: localStorage writes may fail in private-browsing or quota-
      // exceeded states; falling back silently keeps the dashboard reachable.
      // Worst case the operator sees "First visit" again on the next reload.
    }
  }

  return { lastVisit, markVisited };
}
