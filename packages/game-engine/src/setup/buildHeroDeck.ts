/**
 * Hero deck reservoir construction for the Legendary Arena game engine.
 *
 * buildHeroDeck resolves hero card instances from the registry at setup time,
 * applies the locked rarity → copy-count map (D-13501; 5/3/3/3 = 14 cards per
 * hero across the four-label set { 'Common 1', 'Common 2', 'Uncommon',
 * 'Rare' }), shuffles the flat array via ctx.random.Shuffle, and produces
 * the per-match hero deck reservoir. Sibling pattern with buildVillainDeck
 * (WP-014B): registry walk → flat array → single shuffle → consumed by the
 * orchestrator to populate G.hq (first 5) and G.heroDeck (remainder).
 *
 * No @legendary-arena/registry import. No boardgame.io import. Setup-time
 * only. Pure helper. The single ctx.random.Shuffle call is the only
 * randomness in this module.
 *
 * Loud-fail surface (D-13501 Option A): when a hero card carries a
 * rarityLabel outside the four-label set, buildHeroDeck throws a
 * full-sentence Error inside Game.setup() (the canonical loud-fail surface
 * per .claude/rules/game-engine.md §Throwing Convention). Cross-set rarity
 * support (e.g., 'Common 3' / 'Uncommon 2' observed in amwp.json) is
 * deferred to the Pending follow-up WP recorded in WORK_INDEX.md.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { ShuffleProvider } from './shuffle.js';

// ---------------------------------------------------------------------------
// RegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: layer-boundary precedent (.claude/rules/architecture.md §Layer
// Boundary) — engine setup files cannot import CardRegistry from
// @legendary-arena/registry. The local interface mirrors
// economy/economy.logic.ts CardStatsRegistryReader (lines 89-100, with
// isCardStatsRegistryReader runtime type guard at line 395) and is
// satisfied structurally by the real CardRegistry. Only getSet is needed
// here — the rarityLabel + cardSlug pairs come from setData.heroes[i].cards[j].

/**
 * Minimal structural type for one hero card entry in SetData.heroes[i].cards[j].
 *
 * The four-label rarity set is locked by D-13501 Option A. The cardCounts
 * lookup added by WP-137 is name-keyed, so the optional `name` field is
 * read at the count-resolution site; absence falls through to the rarity
 * map (per D-13701).
 */
interface HeroCardEntry {
  /** Card-level slug within the hero (e.g., 'mission-accomplished'). */
  slug: string;
  /**
   * Display name from the upstream patch. Optional in the registry schema
   * (HeroCardSchema.name is .optional()); when undefined, the cardCounts
   * lookup yields undefined and falls through to the rarity-map branch.
   */
  name?: string;
  /** Per-card rarity label. Must be one of the four locked values. */
  rarityLabel: string;
}

/**
 * Minimal structural type for one physical card in SetData.heroes[i].physicalCards[j].
 *
 * Introduced by WP-138 Phase 1a (D-13801). Each physicalCard represents
 * one printable card in the deck. Split-side heroes have physicalCards
 * with two sides; solo heroes have one side per physicalCard.
 */
interface PhysicalCardEntry {
  /** Physical card identifier within the hero (e.g., 'p1'). */
  id: string;
  /** Number of copies of this physical card in the deck. */
  count: number;
  /** Ordered side slugs. sides[0] is the canonical face per D-14101. */
  sides: string[];
}

/**
 * Minimal structural type for a hero entry in SetData.heroes[i].
 *
 * The optional `cardCounts` field is the WP-137 data-driven copy-count
 * authority (D-13701). Keys are card display names; values are positive
 * integers; missing/null/malformed entries fall through to the rarity-map
 * fallback per D-13501.
 */
interface HeroEntry {
  /** Hero-level slug within the set (e.g., 'black-widow'). */
  slug: string;
  /** Per-card data; one entry per distinct hero card template. */
  cards: HeroCardEntry[];
  /**
   * Per-physical-card deck-composition data (D-13801). Each entry
   * carries a count and ordered side slugs. The deck reservoir
   * iterates this array (D-14102) instead of summing per-side
   * cardCounts.
   */
  physicalCards?: unknown;
  /**
   * Optional name-keyed copy-count map populated by the upstream
   * conversion pipeline. Read by buildCardCountsNameLookup at the top
   * of each hero loop.
   */
  cardCounts?: unknown;
}

/**
 * Minimal structural type for set data returned by getSet().
 *
 * Only the heroes[] field is read by buildHeroDeck — other fields
 * (villains, henchmen, masterminds, schemes) are consumed by sibling
 * setup builders.
 */
interface HeroDeckSetData {
  abbr: string;
  heroes: HeroEntry[];
}

/**
 * Setup-time registry interface for hero deck reservoir construction.
 *
 * Satisfied structurally by the real CardRegistry from the registry
 * package. Defined locally to respect the layer boundary (same pattern
 * as VillainDeckRegistryReader in villainDeck.setup.ts and
 * CardStatsRegistryReader in economy.logic.ts).
 */
export interface RegistryReader {
  /** Full set data for one set. Returns undefined if the set was not loaded. */
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// Locked rarity → copy-count map (D-13501)
// ---------------------------------------------------------------------------

// why: D-13501 — canonical Marvel Legendary tabletop rule of 14 cards per
// hero across the four-label rarity set { 'Common 1', 'Common 2',
// 'Uncommon', 'Rare' } yields the 5/3/3/3 split below. Any rarityLabel
// outside the four-label set triggers the Option A loud-fail throw at the
// throw site below — see the deferred follow-up WP placeholder in
// WORK_INDEX.md for cross-set extension (e.g., 'Common 3' / 'Uncommon 2'
// observed in amwp.json). Treat this map literal as the single source of
// truth — never duplicate it in tests or sidecar files.
/**
 * Locked rarity → copy-count map per D-13501.
 *
 * Coverage scope: { 'Common 1': 5, 'Common 2': 3, 'Uncommon': 3, 'Rare': 3 }.
 * Sum = 14 cards per hero across the four-label set.
 */
const RARITY_COPY_COUNT: Readonly<Record<string, number>> = {
  'Common 1': 5,
  'Common 2': 3,
  Uncommon: 3,
  Rare: 3,
};

/** The four locked rarity labels, in canonical iteration order. */
export const SUPPORTED_RARITY_LABELS: readonly string[] = [
  'Common 1',
  'Common 2',
  'Uncommon',
  'Rare',
];

// ---------------------------------------------------------------------------
// Shared cardCounts resolution helpers (WP-137 RS-4 lock)
// ---------------------------------------------------------------------------

// why: D-13701 — cardCounts is the authoritative per-hero copy-count source
// when populated; the locked rarity map (D-13501) is the fallback. The
// helpers are exported so the three setup-time fan-out sites
// (buildHeroDeckCards here, the hero branch of buildCardStats in
// economy.logic.ts, and the hero branch of buildCardDisplayData in
// buildCardDisplayData.ts) resolve copy counts identically by construction.
// Cross-site divergence would cause silent fan-out misses across
// G.cardStats and G.cardDisplayData under specific RNG seeds. The
// shared-helper choice also closes the deferred Phase 7 placeholder
// (D-13703) — promotes data-driven counts over rarity-map extension to
// AMWP-class labels.
/**
 * Builds a per-hero name-keyed copy-count lookup from the registry's
 * cardCounts field on a hero entry.
 *
 * Returns an empty Map when `cardCounts` is absent, null, not a plain
 * object, or contains no valid entries. A value is treated as valid only
 * when ALL three predicates hold:
 *
 *   1. typeof v === 'number'
 *   2. Number.isInteger(v)
 *   3. v >= 1
 *
 * Any other value (0, negative, non-integer float, NaN, string, object,
 * etc.) is silently dropped — the missing key in the returned Map causes
 * the caller to fall through to the rarity-map branch.
 *
 * @param cardCounts - Raw `cardCounts` value from a hero entry; unknown
 *   typed because the structural interfaces accept any shape.
 * @returns A Map of display name → positive integer copy count.
 */
export function buildCardCountsNameLookup(
  cardCounts: unknown,
): Map<string, number> {
  const lookup = new Map<string, number>();
  if (!cardCounts || typeof cardCounts !== 'object') {
    return lookup;
  }
  const candidate = cardCounts as Record<string, unknown>;
  for (const key of Object.keys(candidate)) {
    const value = candidate[key];
    if (typeof value !== 'number') continue;
    if (!Number.isInteger(value)) continue;
    if (value < 1) continue;
    lookup.set(key, value);
  }
  return lookup;
}

/**
 * Resolves a hero card's copy count via cardCounts (name-keyed) → rarity
 * map (label-keyed) fallback.
 *
 * Returns the resolved positive integer copy count when either source
 * succeeds; returns `null` when both sources fail. The caller in
 * buildHeroDeckCards throws on `null` (preserving the loud-fail surface
 * inside Game.setup() per D-13501 Option A — softened to require BOTH
 * sources missing per D-13701). Callers in the two fan-out sites
 * (buildCardStats, buildCardDisplayData) treat `null` as silent
 * fall-through because their throw surface is reserved for Game.setup()
 * proper.
 *
 * @param card - Hero card entry; only `name` and `rarityLabel` are read.
 * @param nameLookup - Per-hero map built by buildCardCountsNameLookup.
 * @returns Positive integer copy count, or null when both sources fail.
 */
export function resolveHeroCardCopyCount(
  card: { name?: string | undefined; rarityLabel: string },
  nameLookup: Map<string, number>,
): number | null {
  // why: D-13701 — cardCounts authoritative when present; D-13501 rarity
  // map fallback when absent; D-13703 closes the deferred Phase 7
  // placeholder by promoting data-driven counts over rarity-map extension.
  // Lookup is name-keyed against `card.name` because the upstream patch
  // ships cardCounts keyed by display name (NOT slug); `cardCounts[card.slug]`
  // is always wrong.
  if (typeof card.name === 'string') {
    const fromCardCounts = nameLookup.get(card.name);
    if (typeof fromCardCounts === 'number') {
      return fromCardCounts;
    }
  }
  const fromRarity = RARITY_COPY_COUNT[card.rarityLabel];
  if (typeof fromRarity === 'number') {
    return fromRarity;
  }
  return null;
}

// ---------------------------------------------------------------------------
// parseQualifiedIdForSetup — local duplicate (WP-113 §6 precedent)
// ---------------------------------------------------------------------------

// why: WP-113 §6 step 1 — `import or duplicate locally — author choice`.
// Duplicating locally avoids a circular import between builders and
// matchSetup.validate.ts (per D-10014). Identical rejection rules to the
// validator's parseQualifiedId.
/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on any malformed input — empty string, missing slash,
 * multiple slashes, empty parts, or leading/trailing whitespace.
 */
function parseQualifiedIdForSetup(
  input: string,
): { setAbbr: string; slug: string } | null {
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
// Runtime type guard
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for RegistryReader.
 *
 * Returns true when the registry object exposes the required methods
 * (getSet). Narrow test mocks that only implement listCards return false,
 * letting buildHeroDeck soft-skip with an empty reservoir (mirrors
 * isVillainDeckRegistryReader / isCardStatsRegistryReader / sibling
 * patterns).
 */
function isRegistryReader(registry: unknown): registry is RegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;
  return typeof candidate.getSet === 'function';
}

// ---------------------------------------------------------------------------
// parsePhysicalCards — defensive structural parser
// ---------------------------------------------------------------------------

/**
 * Parses the raw `physicalCards` field from a hero entry into validated
 * PhysicalCardEntry objects.
 *
 * Returns an empty array when the input is absent, null, not an array,
 * or contains no valid entries. Each entry must have a non-empty string
 * `id`, a positive integer `count`, and a non-empty `sides` array of
 * strings. Malformed entries are silently skipped (defense-in-depth;
 * the registry's Zod validation is the primary gate).
 *
 * @param raw - Raw `physicalCards` value from a hero entry.
 * @returns Array of validated PhysicalCardEntry objects.
 */
function parsePhysicalCards(raw: unknown): PhysicalCardEntry[] {
  if (!Array.isArray(raw)) return [];

  const result: PhysicalCardEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) continue;
    if (typeof candidate.count !== 'number' || !Number.isInteger(candidate.count) || candidate.count < 1) continue;
    if (!Array.isArray(candidate.sides) || candidate.sides.length === 0) continue;

    let sidesValid = true;
    for (const side of candidate.sides) {
      if (typeof side !== 'string' || side.length === 0) {
        sidesValid = false;
        break;
      }
    }
    if (!sidesValid) continue;

    result.push({
      id: candidate.id,
      count: candidate.count,
      sides: candidate.sides as string[],
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// buildHeroDeckCards — pure registry walk
// ---------------------------------------------------------------------------

/**
 * Builds the unshuffled flat array of hero card-instance ext_ids.
 *
 * For each hero in heroDeckIds, walks setData.heroes[i].cards[j], resolves
 * the per-card copy count via the cardCounts → rarity-map cascade (D-13701
 * → D-13501), and emits one ext_id per copy with a `#<copyIndex>` suffix
 * (D-13702). Card order: heroes per heroDeckIds order; cards per registry
 * cards[] order; copies appended in zero-indexed contiguous order
 * (`#0`, `#1`, …, `#(N-1)`).
 *
 * Throws a full-sentence Error (the surviving D-13501 Option A loud-fail
 * surface) when, for a given card, BOTH copy-count sources fail
 * simultaneously: the cardCounts entry is absent / malformed AND the
 * rarityLabel is not in the four-label set. The message enumerates both
 * attempted paths so the operator can fix the patch file or extend the
 * rarity map as appropriate.
 *
 * @param heroDeckIds - Array of qualified hero deck IDs `<setAbbr>/<heroSlug>`.
 * @param registry - Setup-time registry reader. Must satisfy RegistryReader.
 * @returns Unshuffled flat array of hero card-instance CardExtIds, each
 *   suffixed with `#<copyIndex>`.
 */
export function buildHeroDeckCards(
  heroDeckIds: string[],
  registry: RegistryReader,
): CardExtId[] {
  const cards: CardExtId[] = [];

  for (const heroDeckId of heroDeckIds) {
    const parsed = parseQualifiedIdForSetup(heroDeckId);
    if (parsed === null) continue;

    const setData = registry.getSet(parsed.setAbbr);
    if (!setData || typeof setData !== 'object') continue;

    const candidate = setData as { heroes?: unknown };
    if (!Array.isArray(candidate.heroes)) continue;

    let heroEntry: HeroEntry | null = null;
    for (const hero of candidate.heroes as HeroEntry[]) {
      if (hero && typeof hero === 'object' && hero.slug === parsed.slug) {
        heroEntry = hero;
        break;
      }
    }
    if (heroEntry === null) continue;
    if (!Array.isArray(heroEntry.cards)) continue;

    // why: D-14102 — the deck reservoir now iterates physicalCards[].count
    // instead of summing per-side cardCounts via resolveHeroCardCopyCount.
    // Each physicalCard carries a `count` and ordered `sides[]`; the
    // canonical face is sides[0] per D-14101. For solo heroes (D-13803
    // uniform model), each physicalCard has one side and count matches the
    // rarity-derived value. For split heroes (e.g., Falcon/Winter Soldier),
    // physicalCards group paired sides into one entry with the combined count.
    const physicalCards = parsePhysicalCards(heroEntry.physicalCards);
    if (physicalCards.length === 0) {
      // why: fallback to per-card resolveHeroCardCopyCount when
      // physicalCards is absent or empty — preserves backward
      // compatibility with data that has not been curated yet
      // (should not occur after WP-140 Phase 1b, but defense-in-depth).
      const nameLookup = buildCardCountsNameLookup(heroEntry.cardCounts);

      for (const card of heroEntry.cards) {
        if (!card || typeof card !== 'object') continue;
        if (typeof card.slug !== 'string' || typeof card.rarityLabel !== 'string') {
          continue;
        }

        const copyCount = resolveHeroCardCopyCount(card, nameLookup);
        if (copyCount === null) {
          const supportedList = SUPPORTED_RARITY_LABELS.map((label) => `'${label}'`).join(', ');
          const cardNameDisplay = typeof card.name === 'string' && card.name.length > 0 ? card.name : '<unnamed>';
          throw new Error(
            `buildHeroDeck refused to build hero '${parsed.setAbbr}/${parsed.slug}': ` +
              `card '${card.slug}' (display name '${cardNameDisplay}') has no resolvable copy count — ` +
              `the per-hero cardCounts map has no positive integer entry for display name '${cardNameDisplay}', ` +
              `and the card's rarityLabel '${card.rarityLabel}' is not in the supported four-label set ${supportedList}. ` +
              `Either populate cardCounts in the hero entry of data/cards/${parsed.setAbbr}.json with a positive integer keyed by '${cardNameDisplay}', ` +
              `or correct the card's rarityLabel to one of the supported labels.`,
          );
        }

        const baseExtId = `${parsed.setAbbr}/${parsed.slug}/${card.slug}`;
        for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
          cards.push(`${baseExtId}#${copyIndex}` as CardExtId);
        }
      }
      continue;
    }

    // why: D-14101 — for each physicalCard, emit `count` ext_ids using
    // sides[0] (declaration order) as the canonical face slug. D-13702
    // #<copyIndex> suffix preserved. Split heroes (2 sides) get one
    // ext_id per physical copy using the first side; solo heroes
    // (1 side) are unchanged because sides[0] === the only card slug.
    for (const physicalCard of physicalCards) {
      const canonicalSlug = physicalCard.sides[0];
      const baseExtId = `${parsed.setAbbr}/${parsed.slug}/${canonicalSlug}`;
      for (let copyIndex = 0; copyIndex < physicalCard.count; copyIndex++) {
        cards.push(`${baseExtId}#${copyIndex}` as CardExtId);
      }
    }
  }

  return cards;
}

// ---------------------------------------------------------------------------
// shuffleHeroDeck — single ctx.random.Shuffle call site
// ---------------------------------------------------------------------------

/**
 * Returns a new shuffled copy of the supplied hero card flat array using
 * the deterministic RNG provided by boardgame.io.
 *
 * Mirrors playerInit.ts:shuffleDeck — defensive copy of the input array
 * is passed to context.random.Shuffle so the caller's array is never
 * mutated.
 *
 * @param cards - Unshuffled flat array of hero card-instance ext_ids.
 * @param context - Any context that provides random.Shuffle.
 * @returns A new shuffled array; the input is never mutated.
 */
export function shuffleHeroDeck(
  cards: CardExtId[],
  context: ShuffleProvider,
): CardExtId[] {
  // why: WP-135 determinism guarantee — the single ctx.random.Shuffle call
  // for the hero deck reservoir lives here. Per-turn reshuffle, batched
  // pop, and deck reorder are forbidden; widening this envelope breaks
  // replay determinism. The replay-hash regression guard is the canary.
  return context.random.Shuffle([...cards]);
}

// ---------------------------------------------------------------------------
// buildHeroDeck — canonical entry point
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic per-match hero deck reservoir.
 *
 * Composes buildHeroDeckCards (registry walk + rarity-map expansion) and
 * shuffleHeroDeck (single ctx.random.Shuffle call) into the canonical
 * setup-time entry point. The orchestrator (buildInitialGameState) calls
 * this exactly once per match; the first 5 cards populate G.hq via
 * fillHqFromDeck, and the remainder is stored at G.heroDeck.
 *
 * Soft-skip on incomplete RegistryReader interface (mirrors
 * buildVillainDeck — narrow test mocks return an empty reservoir
 * gracefully). Loud-fail (Option A) on unknown rarityLabel inside
 * buildHeroDeckCards.
 *
 * @param heroDeckIds - Array of qualified hero deck IDs `<setAbbr>/<heroSlug>`.
 * @param registry - Setup-time registry reader. Accepts unknown to support
 *   narrow test mocks. When the registry does not satisfy RegistryReader
 *   structurally (missing getSet), returns an empty array gracefully.
 * @param context - Setup context with ctx.random.Shuffle.
 * @returns A new shuffled hero deck reservoir as CardExtId[].
 * @throws {Error} D-13501 Option A loud-fail — when any hero card carries
 *   a rarityLabel outside the four-label set.
 */
export function buildHeroDeck(
  heroDeckIds: string[],
  registry: unknown,
  context: ShuffleProvider,
): CardExtId[] {
  if (!isRegistryReader(registry)) {
    return [];
  }

  const unshuffled = buildHeroDeckCards(heroDeckIds, registry);
  return shuffleHeroDeck(unshuffled, context);
}
