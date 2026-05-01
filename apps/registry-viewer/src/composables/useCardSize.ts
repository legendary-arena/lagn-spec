/**
 * useCardSize.ts
 * Shared state for the card-grid zoom slider.
 *
 * Components call setCardSize(next) to change the grid's column min-width
 * in pixels. The selection is persisted to localStorage under the key
 * 'cardGridSize' so it survives page reloads. The ref is module-scoped so
 * all consumers of the composable share a single source of truth across
 * the app.
 *
 * Range and default are locked under WP-121 / EC-122 / D-12101:
 *   - MIN_CARD_WIDTH_PX     = 80   (smallest tile that keeps tile-info legible)
 *   - MAX_CARD_WIDTH_PX     = 260  (largest tile that fits a 1024px viewport)
 *   - DEFAULT_CARD_WIDTH_PX = 130  (matches pre-packet production baseline)
 *   - CARD_WIDTH_STEP_PX    = 10   (slider step granularity)
 *
 * Public API (exactly two names plus four constants):
 *   - cardSize: Ref<number>                 // current column min-width in px
 *   - setCardSize: (next: number) => void   // clamped + persisted setter
 *   - MIN_CARD_WIDTH_PX, MAX_CARD_WIDTH_PX,
 *     DEFAULT_CARD_WIDTH_PX, CARD_WIDTH_STEP_PX
 *
 * Mirrors useCardViewMode.ts shape line-for-line with a number payload
 * instead of a string-literal union.
 */

import { ref, type Ref } from "vue";

// why: the localStorage key is a flat, camelCase, non-abbreviated string
// matching the existing viewer convention (useCardViewMode.ts → 'cardViewMode';
// useResizable.ts → 'cardDetailWidth'). No product-wide namespace prefix
// is used because the viewer is a single-origin SPA with no key collisions.
const STORAGE_KEY = "cardGridSize";

// why: locked range and default per WP-121 / EC-122 / D-12101. The
// minimum keeps .tile-name and .tile-meta legible at the smallest tile;
// the maximum fits a 1024px viewport without grid reflow; the default
// matches CardGrid.vue's existing `minmax(130px, 1fr)` rule exactly so a
// zero-config first run is visually identical to the pre-packet baseline.
export const MIN_CARD_WIDTH_PX = 80;
export const MAX_CARD_WIDTH_PX = 260;
export const DEFAULT_CARD_WIDTH_PX = 130;
export const CARD_WIDTH_STEP_PX = 10;

// why: localStorage.getItem returns string | null; Number.parseInt may
// yield NaN; out-of-range values would poison the downstream
// --card-grid-min-width CSS variable on .grid. Anything that does not
// cleanly clamp into [MIN_CARD_WIDTH_PX, MAX_CARD_WIDTH_PX] defaults to
// DEFAULT_CARD_WIDTH_PX — including null, empty string, 'abc', and any
// future malformed value. parseInt('80px', 10) yields 80 (acceptable);
// Number('80px') would yield NaN (rejected — and would also reject a
// stored '120' which is a valid value).
const storedRaw = readStoredRawSafely();
const storedNumber = storedRaw !== null ? Number.parseInt(storedRaw, 10) : Number.NaN;
const initialSize = clampToRange(storedNumber);

// why: self-heal malformed or absent localStorage values by writing the
// narrowed initial value back on first load, ensuring the
// [MIN_CARD_WIDTH_PX, MAX_CARD_WIDTH_PX] invariant holds on every
// subsequent read from any tab or reload.
persistSafely(initialSize);

const cardSize: Ref<number> = ref<number>(initialSize);

/**
 * Returns the shared card-size state and the setter. Both names are
 * module-scoped singletons, so all components see the same value.
 */
export function useCardSize(): {
  cardSize: Ref<number>;
  setCardSize: (next: number) => void;
} {
  return {
    cardSize,
    setCardSize,
  };
}

/**
 * Updates the card size, clamping to the locked range and persisting the
 * new value to localStorage. The in-memory ref updates before persistence
 * so that a setItem failure leaves the UI in the correct state for the
 * rest of the session.
 *
 * @param next - The requested column min-width in pixels.
 */
function setCardSize(next: number): void {
  const clampedSize = clampToRange(next);
  cardSize.value = clampedSize;
  persistSafely(clampedSize);
}

/**
 * Clamps a candidate size into the locked
 * [MIN_CARD_WIDTH_PX, MAX_CARD_WIDTH_PX] range, falling back to
 * DEFAULT_CARD_WIDTH_PX when the input is not a finite number.
 *
 * @param candidate - Any number, including NaN or out-of-range values.
 * @returns A number guaranteed to lie within the locked range.
 */
function clampToRange(candidate: number): number {
  if (!Number.isFinite(candidate)) {
    return DEFAULT_CARD_WIDTH_PX;
  }
  if (candidate < MIN_CARD_WIDTH_PX) {
    return MIN_CARD_WIDTH_PX;
  }
  if (candidate > MAX_CARD_WIDTH_PX) {
    return MAX_CARD_WIDTH_PX;
  }
  return candidate;
}

/**
 * Reads the raw localStorage value for the card-size key. Returns null
 * if the key is absent. getItem does not throw in modern browsers even
 * when storage is fully inaccessible, so no try/catch is required here.
 */
function readStoredRawSafely(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Writes the card size to localStorage as a decimal string, swallowing
 * any failure. Called both at mount-time (self-heal) and from
 * setCardSize().
 *
 * @param size - The card size in pixels to persist.
 */
function persistSafely(size: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // why: localStorage.setItem may throw in iOS Safari private browsing
    // mode or when the storage quota is exceeded (enterprise group-policy
    // restrictions also surface as throws on some platforms). The
    // in-memory cardSize ref has already been updated by the caller, so
    // the UI remains fully functional for the rest of the session — only
    // cross-reload persistence is lost. Silent swallow preserves UX per
    // 00.6 Rule 11 (full-sentence swallow documentation required).
  }
}
