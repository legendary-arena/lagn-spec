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

// why: "cardAbilities" appended under EC-127 §0 pre-execution amendment
// (2026-05-01) — mechanical dependency of cardAbilitiesClient.ts which
// mirrors cardTypesClient.ts line-for-line per the duplicate-first rule.
// WP-086 (commit ccc6d0e) is the precedent: the same audit-trail extension
// added "cardTypes" when WP-086 introduced cardTypesClient.ts. D-12501
// records the lock.
type Category = "registry" | "theme" | "filter" | "render" | "glossary" | "cardTypes" | "cardAbilities";

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
