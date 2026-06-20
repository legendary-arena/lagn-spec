/**
 * cardMechanicsClient.ts — Fetches the hero-mechanic metadata feed
 * (`card-mechanics.json`, published by WP-269) from R2 for the registry
 * viewer's mechanic filter ribbon (WP-270).
 *
 * The feed is a normalized, viewer-safe hero-mechanic index: a `mechanics[]`
 * list (slug, label, source, cardCount, hidden) plus a per-card
 * `cards{ extId: { mechanics } }` mapping the producer already computed from
 * the hero ledger. The viewer never re-derives mechanics from ability text —
 * the per-card mapping is the sole source for filtering (WP-270 Scope).
 *
 * Shape and discipline mirror cardTypesClient.ts: module-scope singleton
 * promise, devLog instrumentation, `.safeParse` at the fetch boundary, and a
 * non-blocking fallback so a missing or malformed R2 publish degrades to an
 * empty index (the ribbon hides, the card grid stays fully functional). This
 * fetcher never throws — fully non-blocking at the boundary.
 *
 * Note on the devLog category: the four sibling taxonomy clients each own a
 * dedicated devLog category, but the category union (`devLog.ts`) is closed
 * and adding `"cardMechanics"` to it would touch an eighth file, which the
 * WP-270 scope gate forbids (exactly 7 files). This client therefore reuses
 * the pre-existing `"filter"` category — semantically apt (the feed exists
 * solely to power the mechanic filter) and otherwise unused, so no sibling
 * domain's logs are polluted.
 */

// why: import the schema from the `@legendary-arena/registry/schema` subpath
// rather than the barrel. The barrel re-exports a Node-only local-file
// registry factory (`node:fs/promises`, `node:path`); Rollup resolves the
// import graph before tree-shaking can prune it, so the browser build fails on
// `__vite-browser-external`. The dedicated `./schema` subpath has zero
// Node-module dependencies and sidesteps the issue. Established by
// cardTypesClient.ts:22–31 (WP-082 / WP-083 precedent).
import {
  CardMechanicsIndexSchema,
  type CardMechanicsIndex,
} from "@legendary-arena/registry/schema";
import { devLog } from "./devLog";

// why: the ONE non-blocking empty fallback. A missing or invalid feed must
// never break the card grid, so every HTTP / schema / fetch failure path
// returns THIS single module-level constant rather than reconstructing a
// literal per branch. The shape is the WP-270 precondition-H literal: it
// validates against CardMechanicsIndexSchema, in which `generatedAt` is a
// REQUIRED field — the `1970-01-01T00:00:00.000Z` sentinel marks "no real
// feed loaded" while keeping the fallback schema-compatible.
const EMPTY_MECHANICS_INDEX: CardMechanicsIndex = {
  version:     1,
  scope:       "hero",
  generatedAt: "1970-01-01T00:00:00.000Z",
  mechanics:   [],
  cards:       {},
};

// ── Singleton loader ────────────────────────────────────────────────────────

let _promise: Promise<CardMechanicsIndex> | null = null;

/**
 * Fetches the hero-mechanic feed from R2. Results are cached for the session.
 *
 * Non-blocking at the boundary: HTTP failure or schema rejection resolves to
 * `EMPTY_MECHANICS_INDEX`, never throws. App.vue's MechanicFilter stays hidden
 * when the returned index has no visible mechanics.
 *
 * @param metadataBaseUrl - The base URL for R2 metadata (same as card data).
 */
export function getCardMechanics(
  metadataBaseUrl: string,
): Promise<CardMechanicsIndex> {
  if (_promise) return _promise;
  _promise = (async () => {
    const url = `${metadataBaseUrl}/metadata/card-mechanics.json`;
    const startedAt = performance.now();
    devLog("filter", "mechanics load start", { baseUrl: metadataBaseUrl });
    try {
      const response = await fetch(url);
      if (!response.ok) {
        devLog("filter", "mechanics load failed", {
          baseUrl:    metadataBaseUrl,
          durationMs: Math.round(performance.now() - startedAt),
          status:     response.status,
          message:    `HTTP ${response.status}`,
        });
        // why: non-blocking — a missing feed hides the ribbon, never breaks
        // the grid. Return the single empty-index constant.
        return EMPTY_MECHANICS_INDEX;
      }
      const rawPayload = await response.json();
      const result = CardMechanicsIndexSchema.safeParse(rawPayload);
      if (!result.success) {
        const issue = result.error.issues[0]!;
        // why: dot-joined path keeps viewer logs operator-readable; default
        // array paths are noisy. Mirrors cardTypesClient.ts.
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        console.warn(
          `[CardMechanics] Rejected card-mechanics.json from ${url}: ${path} — ${issue.message}. ` +
          "Mechanic filter ribbon will stay hidden until the feed is corrected.",
        );
        // why: schema rejection is non-blocking, same as an HTTP failure.
        return EMPTY_MECHANICS_INDEX;
      }
      devLog("filter", "mechanics load complete", {
        baseUrl:        metadataBaseUrl,
        durationMs:     Math.round(performance.now() - startedAt),
        mechanicCount:  result.data.mechanics.length,
        mappedCardCount: Object.keys(result.data.cards).length,
      });
      return result.data;
    } catch (error) {
      devLog("filter", "mechanics load failed", {
        baseUrl:    metadataBaseUrl,
        durationMs: Math.round(performance.now() - startedAt),
        message:    error instanceof Error ? error.message : String(error),
      });
      // why: never throw — the mechanic ribbon is an additive affordance; the
      // card view must stay functional when the feed is unreachable.
      return EMPTY_MECHANICS_INDEX;
    }
  })();
  return _promise;
}

export function resetCardMechanics(): void {
  _promise = null;
}

/**
 * Pure predicate: does the card identified by `cardExtId` satisfy the active
 * mechanic selection?
 *
 * Returns `true` when no mechanic is selected (the filter is inactive, so
 * every card passes), or when the card's feed mapping
 * (`index.cards[cardExtId].mechanics`) includes ANY selected slug. The "ANY"
 * is the OR-within-selected-mechanics semantics; App.vue composes the result
 * with the text query + other filters as an AND by applying this predicate to
 * the already-queried result set.
 *
 * @param index         - The parsed (or empty-fallback) mechanic index.
 * @param cardExtId      - The card's set-qualified ext id (`{setAbbr}/{slug}`),
 *                         matching the feed's `cards{}` keys.
 * @param selectedSlugs - The set of mechanic slugs the user has selected.
 */
export function cardMatchesMechanics(
  index: CardMechanicsIndex,
  cardExtId: string,
  selectedSlugs: ReadonlySet<string>,
): boolean {
  // why: an empty selection means the filter is off — every card passes so the
  // grid is unchanged until the user picks a mechanic.
  if (selectedSlugs.size === 0) return true;
  // why: card→mechanic membership comes ONLY from the producer's per-card
  // mapping (the feed already classified each hero's mechanics). The viewer
  // never parses ability text at runtime. A card absent from the mapping
  // (e.g. a non-hero card, or a hero with no detected mechanics) cannot match.
  const cardEntry = index.cards[cardExtId];
  if (!cardEntry) return false;
  for (const slug of cardEntry.mechanics) {
    if (selectedSlugs.has(slug)) return true;
  }
  return false;
}
