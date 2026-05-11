/**
 * theme.ts — Centralized color constants for the registry viewer.
 *
 * Single source of truth for card type colors, hero class colors, rarity
 * colors, and theme tag colors. Imported by CardGrid, CardDetail, ThemeGrid,
 * and any future component that renders colored badges or labels.
 *
 * why: these constants were previously duplicated across CardGrid.vue and
 * CardDetail.vue. Centralizing prevents color drift when values are updated.
 */

/** Card type badge colors (hero, mastermind, villain, scheme, etc.) */
export const TYPE_COLOR: Record<string, string> = {
  hero:       "#60a5fa",
  mastermind: "#f87171",
  villain:    "#f59e0b",
  scheme:     "#a78bfa",
  henchman:   "#94a3b8",
  bystander:  "#9ca3af",
  wound:      "#f87171",
  location:   "#34d399",
  other:      "#6b7280",
};

/**
 * Hero class (superpower) colors.
 *
 * why: per WP-007b §Step 5, class-color identity routes through the
 * v1 brand-tokens contract (--la-color-class-*, palette.md §4.4).
 * Values here are CSS `var(...)` references, not bare hex; consumers
 * (CardGrid, CardDetail, etc.) bind these strings to inline `:style`
 * properties — Vue passes them through to the DOM unmodified, and
 * the CSS engine resolves them against the cascade. This makes the
 * registry-viewer's class-badge color routing inherit any v1 → v2
 * brand-tokens evolution automatically via the cross-origin link
 * + bundled fallback in index.html.
 */
export const HC_COLOR: Record<string, string> = {
  covert:   "var(--la-color-class-covert)",
  instinct: "var(--la-color-class-instinct)",
  ranged:   "var(--la-color-class-ranged)",
  strength: "var(--la-color-class-strength)",
  tech:     "var(--la-color-class-tech)",
};

/** Rarity indicator dot colors */
export const RARITY_DOT: Record<number, string> = {
  1: "#9ca3af",
  2: "#34d399",
  3: "#60a5fa",
};

/** Rarity display labels */
export const RARITY_LABEL: Record<number, string> = {
  1: "Common",
  2: "Uncommon",
  3: "Rare",
};

/** Theme tag accent colors (used for left-border tinting in ThemeGrid) */
export const TAG_COLOR: Record<string, string> = {
  "x-men":         "#f472b6",
  "cosmic":        "#c084fc",
  "avengers":      "#60a5fa",
  "spider-man":    "#f87171",
  "street-level":  "#f59e0b",
  "noir":          "#f59e0b",
  "espionage":     "#34d399",
  "horror":        "#a78bfa",
  "supernatural":  "#a78bfa",
  "fantastic-four": "#60a5fa",
  "deep-cut":      "#94a3b8",
  "team-up":       "#94a3b8",
  "hulk":          "#34d399",
  "deadpool":      "#f87171",
  "inhumans":      "#c084fc",
};

/**
 * localStorage layout version. Increment this to force a width reset
 * for all users after a layout refactor (e.g. adding/removing panels).
 * why: prevents "panels are broken" reports when stored widths no longer
 * make sense after a structural change.
 */
export const LAYOUT_VERSION = 1;

/**
 * Reads a stored panel width, checking the layout version first.
 * Returns null if the version doesn't match (triggering a reset to default).
 */
export function loadStoredWidth(storageKey: string, minWidth: number, maxWidth: number): number | null {
  try {
    const storedVersion = localStorage.getItem("layoutVersion");
    if (storedVersion !== String(LAYOUT_VERSION)) {
      // why: version mismatch — clear all stored widths and reset
      localStorage.setItem("layoutVersion", String(LAYOUT_VERSION));
      return null;
    }
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!Number.isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
        return parsed;
      }
    }
  } catch {
    // why: localStorage may not be available (private mode, quota exceeded)
  }
  return null;
}
