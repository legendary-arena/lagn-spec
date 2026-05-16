/**
 * Mastermind setup for the Legendary Arena game engine.
 *
 * buildMastermindState resolves the mastermind from registry data at
 * setup time, constructs the tactics deck, and adds the mastermind
 * base card to G.cardStats so fightMastermind can read the fight
 * requirement without registry access.
 *
 * Per WP-113 / D-10014, mastermindId is the set-qualified form
 * `<setAbbr>/<mastermindSlug>`. The builder parses the qualified form,
 * then iterates ONLY the named set's masterminds[] — no cross-set
 * fallback exists.
 *
 * No @legendary-arena/registry imports. No .reduce(). Setup-time only.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { SetupContext } from '../types.js';
import type { CardStatEntry } from '../economy/economy.types.js';
import type { MastermindState } from './mastermind.types.js';
import { parseCardStatValue } from '../economy/economy.logic.js';
import { shuffleDeck } from '../setup/shuffle.js';

// ---------------------------------------------------------------------------
// Structural types for registry access
// ---------------------------------------------------------------------------

// why: game-engine must not import @legendary-arena/registry; these types
// are satisfied structurally by the real CardRegistry/SetData. Defined
// locally to respect the layer boundary (same pattern as
// VillainDeckRegistryReader in villainDeck.setup.ts).

/**
 * Minimal structural type for a mastermind card entry in SetData.
 */
interface MastermindCardEntry {
  slug: string;
  tactic?: boolean;
  vAttack?: string | number | null;
}

/**
 * Minimal structural type for a mastermind entry in SetData.
 */
interface MastermindEntry {
  slug: string;
  cards: MastermindCardEntry[];
}

/**
 * Minimal structural type for set data returned by getSet().
 * Only the fields needed for mastermind resolution.
 */
interface MastermindSetData {
  abbr: string;
  masterminds: MastermindEntry[];
}

/**
 * Setup-time registry interface for mastermind resolution.
 *
 * Satisfied structurally by the real CardRegistry from the registry
 * package. Defined locally to respect the layer boundary.
 */
export interface MastermindRegistryReader {
  /** All loaded set index entries. */
  listSets(): Array<{ abbr: string }>;
  /** Full set data for one set. */
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// Runtime type guard
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for MastermindRegistryReader.
 *
 * Returns true if the registry object has the required methods (listSets,
 * getSet). Narrow test mocks that only implement CardRegistryReader will
 * return false.
 */
// why: D-10014 — orchestration-side diagnostic detection seam. The
// orchestration layer (buildInitialGameState) imports this guard to detect
// registry-reader interface mismatches and emit G.messages diagnostics.
export function isMastermindRegistryReader(
  registry: unknown,
): registry is MastermindRegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;
  return (
    typeof candidate.listSets === 'function' &&
    typeof candidate.getSet === 'function'
  );
}

/**
 * Enumerates mastermind slugs in a single set's data.
 *
 * Reads `setData.masterminds[].slug` defensively. Returns an empty array
 * on any malformed shape — never throws. Used by the validator's
 * `buildKnownMastermindQualifiedIds` (Class B: set-data slug enumerator)
 * as the single source of truth for mastermind slug semantics.
 */
// why: D-10014 — single source of truth — set-data slug enumerator.
export function listMastermindSlugsInSet(setData: unknown): string[] {
  if (!setData || typeof setData !== 'object') return [];
  const candidate = setData as { masterminds?: unknown };
  if (!Array.isArray(candidate.masterminds)) return [];

  const slugs: string[] = [];
  for (const entry of candidate.masterminds) {
    if (entry && typeof entry === 'object') {
      const mastermind = entry as { slug?: unknown };
      if (typeof mastermind.slug === 'string' && mastermind.slug.length > 0) {
        slugs.push(mastermind.slug);
      }
    }
  }
  return slugs;
}

/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on malformed input. Locally duplicated per WP-113 §6 step 1
 * — `// why: import or duplicate locally — author choice`.
 */
// why: D-10014 — duplicated locally to avoid a circular import between
// builders and matchSetup.validate.ts.
function parseQualifiedId(input: string): { setAbbr: string; slug: string } | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  if (input !== input.trim()) return null;
  const slashIndex = input.indexOf('/');
  if (slashIndex === -1) return null;
  if (input.indexOf('/', slashIndex + 1) !== -1) return null;
  const setAbbr = input.slice(0, slashIndex);
  const slug = input.slice(slashIndex + 1);
  if (setAbbr.length === 0 || slug.length === 0) return null;
  return { setAbbr, slug };
}

// ---------------------------------------------------------------------------
// buildMastermindState
// ---------------------------------------------------------------------------

/**
 * Builds the mastermind state from registry data at setup time.
 *
 * Resolves the mastermind by slug, classifies cards as base or tactic,
 * adds the base card's fight cost to cardStats, and returns a shuffled
 * tactics deck.
 *
 * @param mastermindId - Mastermind ext_id from MatchSetupConfig.
 * @param registry - Setup-time registry reader. Accepts unknown to support
 *   narrow test mocks. If the registry does not satisfy the interface,
 *   returns a minimal empty state gracefully.
 * @param context - Setup context providing random.Shuffle for deterministic
 *   tactics deck shuffling.
 * @param cardStats - Mutable cardStats record from buildCardStats. This
 *   function adds the mastermind base card entry to it.
 * @returns The mastermind state with shuffled tactics deck.
 */
export function buildMastermindState(
  mastermindId: CardExtId,
  registry: unknown,
  context: SetupContext,
  cardStats: Record<CardExtId, CardStatEntry>,
): MastermindState {
  // why: narrow test mocks (CardRegistryReader) only have listCards()
  // returning { key: string }[]. We check for the full interface at
  // runtime. If the registry doesn't have the required methods, we
  // return a minimal empty state — moves handle gracefully.
  if (!isMastermindRegistryReader(registry)) {
    return {
      id: mastermindId,
      baseCardId: mastermindId,
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    };
  }

  // why: D-10014 — Builder Filtering Order — iterate named set only.
  // mastermindId is `<setAbbr>/<mastermindSlug>`; parse the qualified form
  // and constrain mastermind iteration to the named set's masterminds[].
  const parsed = parseQualifiedId(mastermindId);
  if (parsed === null) {
    return {
      id: mastermindId,
      baseCardId: mastermindId,
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    };
  }

  const resolved = findMastermindCards(registry, parsed.setAbbr, parsed.slug);

  if (!resolved) {
    return {
      id: mastermindId,
      baseCardId: mastermindId,
      tacticsDeck: [],
      tacticsDefeated: [],
      strikePile: [],
      attachedBystanders: [],
    };
  }

  const { setAbbr, mastermindSlug, baseCard, tacticCards } = resolved;

  // Build base card ext_id
  const baseCardId = `${setAbbr}-mastermind-${mastermindSlug}-${baseCard.slug}` as CardExtId;

  // why: mastermind fight cost resolved at setup so fightMastermind can
  // read G.cardStats[baseCardId].fightCost without registry access —
  // same pattern as villain fightCost in buildCardStats (WP-018)
  cardStats[baseCardId] = {
    // why: masterminds do not generate resources or have recruit costs
    // — same semantics as villains/henchmen per D-1805
    attack: 0,
    recruit: 0,
    cost: 0,
    fightCost: parseCardStatValue(baseCard.vAttack),
  };

  // Build tactic ext_ids
  const tacticExtIds: CardExtId[] = [];
  for (const tactic of tacticCards) {
    const tacticExtId = `${setAbbr}-mastermind-${mastermindSlug}-${tactic.slug}` as CardExtId;
    tacticExtIds.push(tacticExtId);
  }

  // Sort lexically for deterministic pre-shuffle ordering
  const sortedTactics = [...tacticExtIds].sort();

  // why: ctx.random.Shuffle provides deterministic shuffling seeded by
  // boardgame.io's PRNG, ensuring replay reproducibility
  const shuffledTactics = shuffleDeck(sortedTactics, context);

  return {
    id: mastermindId,
    baseCardId,
    tacticsDeck: shuffledTactics,
    tacticsDefeated: [],
    strikePile: [],
    attachedBystanders: [],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Finds and classifies mastermind cards within the named set's masterminds[].
 *
 * Returns null if the named set is not loaded, the slug is not present in
 * it, or the mastermind has no base card. No cross-set fallback exists.
 */
// why: D-10014 — Builder Filtering Order — iterate named set only.
function findMastermindCards(
  registry: MastermindRegistryReader,
  setAbbr: string,
  mastermindSlug: string,
): {
  setAbbr: string;
  mastermindSlug: string;
  baseCard: MastermindCardEntry;
  tacticCards: MastermindCardEntry[];
} | null {
  const setData = registry.getSet(setAbbr) as MastermindSetData | undefined;
  if (!setData || !Array.isArray(setData.masterminds)) return null;

  for (const mastermind of setData.masterminds) {
    if (typeof mastermind.slug !== 'string') continue;
    if (mastermind.slug !== mastermindSlug) continue;
    if (!Array.isArray(mastermind.cards)) continue;

    let baseCard: MastermindCardEntry | null = null;
    const tacticCards: MastermindCardEntry[] = [];

    for (const card of mastermind.cards) {
      // why: tactic !== true identifies the base card; tactic === true
      // identifies tactic cards. This is a registry schema contract
      // (D-1413), not a heuristic.
      if (card.tactic === true) {
        tacticCards.push(card);
      } else {
        baseCard = card;
      }
    }

    if (!baseCard) {
      return null;
    }

    return {
      setAbbr,
      mastermindSlug: mastermind.slug,
      baseCard,
      tacticCards,
    };
  }

  return null;
}
