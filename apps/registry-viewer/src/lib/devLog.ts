/**
 * devLog.ts — Dev-only console logger gated on the unified `DEBUG_VIEWER`
 * flag. Signature and categories are locked by EC-104.
 *
 * Enable by running the dev server with `?debug` in the query string:
 *   http://localhost:5173/?debug
 *
 * In production builds `DEBUG_VIEWER` collapses to `false` and Vite's
 * DCE strips both this module's `console.*` calls and their call sites.
 */

import { DEBUG_VIEWER } from "./debugMode";

// why: devLog categories are the single-source-derived taxonomy here. Each
// new devLog-consuming domain appends ONE element to LOG_CATEGORIES; Category
// derives from it via (typeof LOG_CATEGORIES)[number], so the union can never
// drift from the array. This retires the hand-maintained closed-union chore
// recorded at D-12501 §7 (see D-21001). Extension history: "cardTypes"
// (WP-086), "cardAbilities" (WP-125), "cardPatterns" + "schemeTwist" (WP-208).
// To add a new domain "fooBar": append "fooBar", to the array (keep the as
// const) and nothing else — do NOT edit the Category line, do NOT reorder.
const LOG_CATEGORIES = [
  "registry",
  "theme",
  "filter",
  "render",
  "glossary",
  "cardTypes",
  "cardAbilities",
  "cardPatterns",
  "schemeTwist",
] as const;

type Category = (typeof LOG_CATEGORIES)[number];

/**
 * Logs a categorized dev event. No-op when `DEBUG_VIEWER` is false.
 *
 * Rules (EC-104):
 * - Never log full registry/theme payloads — keep to counts, durations,
 *   and 3-sample identifiers.
 * - Never log arrays larger than 20 elements; slice callers' arrays to
 *   3-sample IDs before passing them in.
 *
 * @param category - Fixed category tag (registry | theme | filter | render | glossary).
 * @param message  - Short human-readable event description.
 * @param fields   - Optional structured payload (small — counts, ids, ms).
 */
export function devLog(
  category: Category,
  message: string,
  fields?: Record<string, unknown>,
): void {
  if (!DEBUG_VIEWER) return;
  const label = `[${category}] ${message}`;
  if (fields && Object.keys(fields).length > 0) {
    console.groupCollapsed(label);
    for (const [key, value] of Object.entries(fields)) {
      console.log(`${key}:`, value);
    }
    console.groupEnd();
  } else {
    console.log(label);
  }
}
