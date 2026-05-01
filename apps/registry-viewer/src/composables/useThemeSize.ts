/**
 * useThemeSize.ts
 * Shared state for the theme-grid zoom slider.
 *
 * Components call setThemeSize(next) to change the grid's column min-width
 * in pixels. The selection is persisted to localStorage under the key
 * 'themeGridSize' so it survives page reloads. The ref is module-scoped so
 * all consumers of the composable share a single source of truth across
 * the app.
 *
 * Range and default are locked under WP-124 / EC-126 / D-12401:
 *   - MIN_THEME_WIDTH_PX     = 80   (smallest tile that keeps tile-info legible)
 *   - MAX_THEME_WIDTH_PX     = 260  (largest tile that fits a 1024px viewport)
 *   - DEFAULT_THEME_WIDTH_PX = 150  (matches pre-packet ThemeGrid.vue baseline)
 *   - THEME_WIDTH_STEP_PX    = 10   (slider step granularity)
 *
 * Public API (exactly two names plus four constants):
 *   - themeSize: Ref<number>                 // current column min-width in px
 *   - setThemeSize: (next: number) => void   // clamped + persisted setter
 *   - MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX,
 *     DEFAULT_THEME_WIDTH_PX, THEME_WIDTH_STEP_PX
 *
 * Mirrors useCardSize.ts shape line-for-line per the *duplicate first* rule
 * (.claude/rules/code-style.md §"Abstraction & Control Flow"). With two
 * copies in the codebase post-WP-124, any future abstraction is deferred
 * to a third zoom-slider WP per D-12401.
 */

import { ref, type Ref } from "vue";

// why: the localStorage key is a flat, camelCase, non-abbreviated string
// matching the existing viewer convention (mirrors the storage-key shape
// used by useCardViewMode.ts, useResizable.ts, and the cards-side zoom
// composable). No product-wide namespace prefix is used because the
// viewer is a single-origin SPA with no key collisions.
const STORAGE_KEY = "themeGridSize";

// why: locked range and default per WP-124 / EC-126 / D-12401. The minimum
// keeps .tile-name and .tile-mastermind legible at the smallest tile (same
// legibility-floor analysis as cards because the theme tile structure
// mirrors the card tile structure: same aspect-ratio: 3/4 img-wrap, same
// ellipsis pattern on .tile-name); the maximum fits a 1024px viewport
// without grid reflow; the default matches ThemeGrid.vue's existing
// `minmax(150px, 1fr)` rule exactly so a zero-config first run is visually
// identical to the pre-packet baseline (asymmetric with cards' 130 default
// per D-12401 — each default matches its view's pre-packet rule); the step
// matches WP-121's granularity for keyboard-arrow consistency across the
// two sliders.
export const MIN_THEME_WIDTH_PX = 80;
export const MAX_THEME_WIDTH_PX = 260;
export const DEFAULT_THEME_WIDTH_PX = 150;
export const THEME_WIDTH_STEP_PX = 10;

// why: localStorage.getItem returns string | null; Number.parseInt may
// yield NaN; out-of-range values would poison the downstream
// --theme-grid-min-width CSS variable on .grid. Anything that does not
// cleanly clamp into [MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX] defaults to
// DEFAULT_THEME_WIDTH_PX — including null, empty string, 'abc', and any
// future malformed value. parseInt('150px', 10) yields 150 (acceptable);
// Number('150px') would yield NaN (rejected — and would also reject a
// stored '150' on whitespace irregularities).
const storedRaw = readStoredRawSafely();
const storedNumber = storedRaw !== null ? Number.parseInt(storedRaw, 10) : Number.NaN;
const initialSize = clampToRange(storedNumber);

// why: self-heal malformed or absent localStorage values by writing the
// narrowed initial value back on first load, ensuring the
// [MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX] invariant holds on every
// subsequent read from any tab or reload.
persistSafely(initialSize);

const themeSize: Ref<number> = ref<number>(initialSize);

/**
 * Returns the shared theme-size state and the setter. Both names are
 * module-scoped singletons, so all components see the same value.
 */
export function useThemeSize(): {
  themeSize: Ref<number>;
  setThemeSize: (next: number) => void;
} {
  return {
    themeSize,
    setThemeSize,
  };
}

/**
 * Updates the theme size, clamping to the locked range and persisting the
 * new value to localStorage. The in-memory ref updates before persistence
 * so that a setItem failure leaves the UI in the correct state for the
 * rest of the session.
 *
 * @param next - The requested column min-width in pixels.
 */
function setThemeSize(next: number): void {
  const clampedSize = clampToRange(next);
  themeSize.value = clampedSize;
  persistSafely(clampedSize);
}

/**
 * Clamps a candidate size into the locked
 * [MIN_THEME_WIDTH_PX, MAX_THEME_WIDTH_PX] range, falling back to
 * DEFAULT_THEME_WIDTH_PX when the input is not a finite number.
 *
 * @param candidate - Any number, including NaN or out-of-range values.
 * @returns A number guaranteed to lie within the locked range.
 */
function clampToRange(candidate: number): number {
  if (!Number.isFinite(candidate)) {
    return DEFAULT_THEME_WIDTH_PX;
  }
  if (candidate < MIN_THEME_WIDTH_PX) {
    return MIN_THEME_WIDTH_PX;
  }
  if (candidate > MAX_THEME_WIDTH_PX) {
    return MAX_THEME_WIDTH_PX;
  }
  return candidate;
}

/**
 * Reads the raw localStorage value for the theme-size key. Returns null
 * if the key is absent. getItem does not throw in modern browsers even
 * when storage is fully inaccessible, so no try/catch is required here.
 */
function readStoredRawSafely(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Writes the theme size to localStorage as a decimal string, swallowing
 * any failure. Called both at mount-time (self-heal) and from
 * setThemeSize().
 *
 * @param size - The theme size in pixels to persist.
 */
function persistSafely(size: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // why: localStorage.setItem may throw in iOS Safari private browsing
    // mode or when the storage quota is exceeded (enterprise group-policy
    // restrictions also surface as throws on some platforms). The
    // in-memory themeSize ref has already been updated by the caller, so
    // the UI remains fully functional for the rest of the session — only
    // cross-reload persistence is lost. Silent swallow preserves UX per
    // 00.6 Rule 11 (full-sentence swallow documentation required).
  }
}
