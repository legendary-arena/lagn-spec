/**
 * persistence.ts
 *
 * Sync `localStorage` round-trip helpers for the active playmat skin
 * preference. Mirrors the WP-121 `useCardSize.ts` / WP-124
 * `useThemeSize.ts` shape line-for-line — `STORAGE_KEY` constant,
 * safe-read helper, narrowed initial value, sync write with
 * Rule-11-documented swallow on failure — wrapping a different value
 * type (`SkinName` enum) instead of a clamped number.
 *
 * No `await`, no fetch, no network round-trip. Per D-13004 the active
 * skin is persisted exclusively to `localStorage`; server-side sync to
 * `legendary.player_profiles` is deferred to a future WP per the
 * WP-104 column-additive precedent.
 *
 * @see WP-130 §A "Pinia preferences store"
 * @see DECISIONS.md D-13004 (`localStorage`-only persistence)
 * @see DECISIONS.md D-13005 (asset-failure / corrupt-blob fallback)
 */

import { parseSkinName, DEFAULT_SKIN_NAME } from './playmatSchema';
import type { SkinName } from './skinManifest';

// why: the localStorage key is a flat camelCase non-abbreviated string
// matching the existing viewer-side preferences naming convention
// (`useCardSize.ts:33` → `'cardGridSize'`; `useThemeSize.ts:36` →
// `'themeGridSize'`). Arena-client adds the `arenaClient` prefix
// because it shares the browser origin with the registry-viewer in
// dev (both served by Vite on `localhost`) and an unprefixed
// `'playmatSkin'` would collide with any future viewer-side key of
// the same shape. Locked under WP-130 §"Locked contract values".
const STORAGE_KEY = 'arenaClientPlaymatSkin';

/**
 * Reads the active skin from `localStorage` with a corruption-safe
 * fallback to `DEFAULT_SKIN_NAME` (`'classic'`) per D-13005. Missing
 * keys, non-string values, and unknown skin names all collapse to the
 * same recovery path; the narrower in `playmatSchema.parseSkinName`
 * emits the diagnostic.
 */
export function loadActiveSkin(): SkinName {
  const raw = readStoredRawSafely();
  return parseSkinName(raw);
}

/**
 * Writes the active skin to `localStorage` synchronously, swallowing
 * any failure with a Rule-11 full-sentence comment. The in-memory
 * Pinia ref has already been updated by the caller, so a `setItem`
 * failure leaves the UI fully functional for the rest of the session;
 * only cross-reload persistence is lost.
 *
 * @param name - The skin name to persist; assumed already validated
 *   by the caller against the closed `SkinName` set.
 */
export function saveActiveSkin(name: SkinName): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // why: `localStorage.setItem` may throw in iOS Safari private
    // browsing mode, when the storage quota is exceeded, or under
    // enterprise group-policy restrictions on some platforms. The
    // Pinia ref has already been updated by the caller in the same
    // tick, so the UI remains fully functional for the rest of the
    // session — only cross-reload persistence is lost. Silent
    // swallow preserves UX per `00.6` Rule 11 (full-sentence swallow
    // documentation required). Mirrors `useCardSize.ts:130-141`
    // posture verbatim.
  }
}

/**
 * Reads the raw `localStorage` value for the playmat-skin key. Returns
 * `null` when the key is absent or when `localStorage` is wholly
 * unavailable (server-side rendering, very old browser, sandboxed
 * iframe with `Storage` blocked). `getItem` does not throw in modern
 * browsers, so no try/catch is required around the read itself.
 */
function readStoredRawSafely(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Exported for tests so they can pin the storage key without
 * duplicating the literal string. Production callers should not need
 * to read this directly.
 */
export const PLAYMAT_STORAGE_KEY = STORAGE_KEY;
