/**
 * Setup-time board keyword resolution for the Legendary Arena game engine.
 *
 * Resolves board keywords (Patrol, Ambush, Guard) from villain and henchman
 * card data at setup time. Follows the same setup-time resolution pattern
 * as buildCardStats (WP-018) and G.villainDeckCardTypes (WP-014B).
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 */

import type { CardExtId } from '../state/zones.types.js';
import type { BoardKeyword } from '../board/boardKeywords.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
// why: D-18704 / D-18706 — the `ambush` board keyword must be emitted under
// each copy-indexed villain instance ext_id (matching the zone grammar the
// reveal-site hasAmbush gate reads), not under the single definition key.
// The shared emitter is imported, not re-implemented (D-13702 RS-4).
import { villainCardInstanceExtIds } from '../villainDeck/villainDeck.setup.js';

// ---------------------------------------------------------------------------
// CardKeywordsRegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: game-engine must not import @legendary-arena/registry; this interface
// is satisfied structurally by CardRegistry. It exposes the minimum methods
// needed for keyword resolution at setup time.

/**
 * Minimal structural type for a villain card entry in SetData.
 * Only the abilities field is needed for keyword extraction.
 */
interface KeywordVillainCardEntry {
  slug: string;
  abilities: string[];
  /** Copy count (WP-167 / D-16701); read by the shared instance-id emitter. */
  copies?: number;
}

/**
 * Minimal structural type for a villain group in SetData.
 */
interface KeywordVillainGroupEntry {
  slug: string;
  cards: KeywordVillainCardEntry[];
}

/**
 * Minimal structural type for set data returned by getSet().
 * Only the fields needed for keyword extraction from villain data.
 */
interface KeywordSetData {
  villains: KeywordVillainGroupEntry[];
}

/**
 * Minimal structural type for a flat card entry from listCards().
 */
interface KeywordFlatCard {
  key: string;
  cardType: string;
  slug: string;
  setAbbr: string;
}

/**
 * Setup-time registry interface for keyword resolution.
 *
 * Satisfied structurally by the real CardRegistry from the registry
 * package. Defined locally to respect the layer boundary (same pattern
 * as CardStatsRegistryReader in economy.logic.ts).
 */
interface CardKeywordsRegistryReader {
  /** All flat cards across all loaded sets. */
  listCards(): KeywordFlatCard[];
  /** All loaded set index entries. */
  listSets(): Array<{ abbr: string }>;
  /** Full set data for one set. */
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for CardKeywordsRegistryReader.
 *
 * Returns true if the registry object has the required methods (listCards,
 * listSets, getSet). Narrow test mocks that only implement
 * CardRegistryReader will return false.
 */
// why: narrow test mocks (CardRegistryReader) may lack the required
// methods. We check at runtime. If the registry doesn't satisfy the
// interface, we return an empty record — moves handle missing
// cardKeywords entries gracefully (no keywords = no effects).
function isCardKeywordsRegistryReader(
  registry: unknown,
): registry is CardKeywordsRegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;

  return (
    typeof candidate.listCards === 'function' &&
    typeof candidate.listSets === 'function' &&
    typeof candidate.getSet === 'function'
  );
}

/**
 * Runtime type guard for KeywordSetData values returned by
 * CardKeywordsRegistryReader.getSet().
 *
 * Returns true when the candidate exposes a `villains` array — the only
 * field buildCardKeywords actually reads from set data.
 */
// why: the registry package is not imported at this layer, so shape
// must be validated structurally at runtime before the narrowed cast.
// Only the fields buildCardKeywords actually reads are checked —
// growing this guard to check additional fields would create
// false-negative `continue` paths on legitimate data.
function isKeywordSetData(x: unknown): x is KeywordSetData {
  if (!x || typeof x !== 'object') return false;
  const candidate = x as Record<string, unknown>;
  return Array.isArray(candidate.villains);
}

// ---------------------------------------------------------------------------
// buildCardKeywords — setup-time keyword resolution
// ---------------------------------------------------------------------------

/**
 * Resolves board keywords for all villain/henchman cards at setup time.
 *
 * // why: same setup-time resolution pattern as G.cardStats (WP-018) and
 * G.villainDeckCardTypes (WP-014B). Moves never query registry at runtime.
 *
 * MVP keyword extraction:
 * - Ambush: detected by "Ambush" prefix in ability text strings
 * - Patrol: no data source in current card data (safe-skip, D-2302)
 * - Guard: no data source in current card data (safe-skip, D-2302)
 *
 * @param registry - Setup-time registry reader. Accepts unknown to support
 *   narrow test mocks. Returns an empty record when the registry does not
 *   satisfy `CardKeywordsRegistryReader`; callers must treat a missing
 *   entry as no keywords.
 * @param _matchConfig - Match setup configuration (unused in MVP — all
 *   villain/henchman cards in the deck are scanned, not filtered by config).
 * @returns Record keyed by CardExtId with detected board keywords.
 */
export function buildCardKeywords(
  registry: unknown,
  _matchConfig: MatchSetupConfig,
): Record<CardExtId, BoardKeyword[]> {
  if (!isCardKeywordsRegistryReader(registry)) {
    return {};
  }

  const result: Record<CardExtId, BoardKeyword[]> = {};
  const allFlatCards = registry.listCards();

  // why: avoid O(V·F) rescan of allFlatCards for every villain-card member.
  // Scan once, build a Set<string>, look up O(1) inside the inner loop.
  // This Set is strictly function-local and never placed in G (D-8802;
  // JSON-serializability invariant). It ceases to exist when
  // buildCardKeywords returns.
  const villainExtIds = new Set<string>();
  for (const card of allFlatCards) {
    if (card.cardType === 'villain') {
      villainExtIds.add(card.key);
    }
  }

  // --- Villain cards: check ability text for keyword patterns ---
  for (const setEntry of registry.listSets()) {
    const rawSetData = registry.getSet(setEntry.abbr);
    if (!isKeywordSetData(rawSetData)) {
      continue;
    }
    const setData = rawSetData;

    for (const villainGroup of setData.villains) {
      if (typeof villainGroup.slug !== 'string') {
        continue;
      }
      if (!Array.isArray(villainGroup.cards)) {
        continue;
      }

      for (const villainCard of villainGroup.cards) {
        if (typeof villainCard.slug !== 'string') {
          continue;
        }

        const abilities: string[] | undefined = Array.isArray(
          villainCard.abilities,
        )
          ? villainCard.abilities
          : undefined;

        const hasAmbush = detectAmbush(abilities);
        // Patrol + Guard safe-skip per D-2302 — no hasPatrol / hasGuard
        // flags because they have no data source in current card data.
        // See detectAmbush() for the full verbatim rationale.

        if (!hasAmbush) {
          continue;
        }

        // why: the definition key gates emission to real listed villains
        // (a card present in listCards). The keyword itself is emitted under
        // the copy-indexed INSTANCE ids, not this definition key (D-18704).
        const definitionKey = `${setEntry.abbr}-villain-${villainGroup.slug}-${villainCard.slug}`;
        if (!villainExtIds.has(definitionKey)) {
          continue;
        }

        // why: canonical keyword emission order is locked to match
        // BOARD_KEYWORDS (['patrol', 'ambush', 'guard']) per D-8801 so
        // the engine carries one canonical order, not two. Adding a
        // new BoardKeyword requires revising both this array and
        // BOARD_KEYWORDS together — the drift-detection test fires on
        // mismatch. The canonical-order array is referenced for
        // iteration order only; each result[extId] below is a
        // freshly-constructed BoardKeyword[] per D-8802 (WP-028
        // cardKeywords aliasing precedent).
        const canonicalOrder: readonly BoardKeyword[] = [
          'patrol',
          'ambush',
          'guard',
        ];

        const keywords: BoardKeyword[] = [];
        for (const keyword of canonicalOrder) {
          if (keyword === 'ambush' && hasAmbush) {
            keywords.push('ambush');
          }
          // 'patrol' and 'guard' safe-skip — no flag, no push.
        }

        if (keywords.length > 0) {
          // why: D-18704 — fan out the keyword array under each copy-indexed
          // villain instance ext_id so the reveal-site hasAmbush gate
          // (keyed on the City card's instance id) resolves. Before WP-191
          // this keyed the single definition id, so hasAmbush was always
          // false at the copy-indexed City id and every villain Ambush was
          // suppressed. Each instance gets a freshly-constructed array (no
          // aliasing across copies, D-8802 / D-13502).
          const instanceExtIds = villainCardInstanceExtIds(
            setEntry.abbr,
            villainGroup.slug,
            villainCard.slug,
            villainCard,
          );
          for (const extId of instanceExtIds) {
            result[extId] = [...keywords];
          }
        }
      }
    }
  }

  // why: henchmen have no individual ability text in the registry data.
  // All henchman copies within a group share the same card text, which
  // is stored at the group level (not on individual entries). Henchman
  // keyword extraction would require a different data path — deferred
  // to a future WP that adds structured keyword classification.

  return result;
}

// ---------------------------------------------------------------------------
// Ambush detection from ability text
// ---------------------------------------------------------------------------

/**
 * Detects whether a card's ability text array indicates the Ambush keyword.
 *
 * MVP: only detects Ambush via "Ambush" prefix. Patrol and Guard have no
 * data source in current card data (safe-skip per D-2302); detection for
 * those keywords is deferred until a future WP adds structured keyword
 * classification to the registry.
 *
 * @param abilities - Array of ability text strings from card data, or
 *   undefined when the registry field was missing / non-array.
 * @returns true when at least one ability starts with "Ambush"
 *   (case-sensitive).
 */
function detectAmbush(abilities: string[] | undefined): boolean {
  if (!abilities || !Array.isArray(abilities)) {
    return false;
  }

  for (const ability of abilities) {
    if (typeof ability !== 'string') {
      continue;
    }

    // why: Ambush abilities consistently start with "Ambush" (capital A)
    // across all 304 occurrences in the card data. Case-sensitive match
    // avoids false positives from ability text mentioning ambush in
    // other contexts.
    if (ability.startsWith('Ambush')) {
      return true;
    }
  }

  // why: Patrol and Guard keywords have no data source in current card data.
  // Patrol in the data is a different mechanic (Secret Wars Vol 2 location
  // patrols). Guard has zero occurrences. Both mechanics are implemented
  // and tested with synthetic data but dormant with real cards until a
  // future WP adds structured keyword classification (safe-skip, D-2302).

  return false;
}
