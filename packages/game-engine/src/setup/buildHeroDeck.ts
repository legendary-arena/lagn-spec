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
 * The four-label rarity set is locked by D-13501 Option A. Any rarityLabel
 * outside that set causes buildHeroDeck to throw a full-sentence Error.
 */
interface HeroCardEntry {
  /** Card-level slug within the hero (e.g., 'mission-accomplished'). */
  slug: string;
  /** Per-card rarity label. Must be one of the four locked values. */
  rarityLabel: string;
}

/**
 * Minimal structural type for a hero entry in SetData.heroes[i].
 */
interface HeroEntry {
  /** Hero-level slug within the set (e.g., 'black-widow'). */
  slug: string;
  /** Per-card data; one entry per distinct hero card template. */
  cards: HeroCardEntry[];
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
const SUPPORTED_RARITY_LABELS: readonly string[] = [
  'Common 1',
  'Common 2',
  'Uncommon',
  'Rare',
];

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
// buildHeroDeckCards — pure registry walk
// ---------------------------------------------------------------------------

/**
 * Builds the unshuffled flat array of hero card-instance ext_ids.
 *
 * For each hero in heroDeckIds, walks setData.heroes[i].cards[j], emits
 * one ext_id per card-copy according to the locked rarity → copy-count
 * map (D-13501), and appends to a flat array. Card order: heroes per
 * heroDeckIds order; cards per registry cards[] order; copies appended in
 * rarity-map iteration order (Common 1 → Common 2 → Uncommon → Rare).
 *
 * Throws a full-sentence Error (D-13501 Option A loud-fail) when any
 * hero card carries a rarityLabel outside the four-label set. The error
 * message names the offending hero ext_id, the unrecognized label, and
 * the supported four-label set.
 *
 * @param heroDeckIds - Array of qualified hero deck IDs `<setAbbr>/<heroSlug>`.
 * @param registry - Setup-time registry reader. Must satisfy RegistryReader.
 * @returns Unshuffled flat array of hero card-instance CardExtIds.
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

    for (const card of heroEntry.cards) {
      if (!card || typeof card !== 'object') continue;
      if (typeof card.slug !== 'string' || typeof card.rarityLabel !== 'string') {
        continue;
      }

      const copyCount = RARITY_COPY_COUNT[card.rarityLabel];
      if (copyCount === undefined) {
        // why: D-13501 Option A loud-fail — Game.setup() is the canonical
        // throw site (.claude/rules/game-engine.md §Throwing Convention).
        // Surfaces data drift the moment it is observed; cross-set support
        // is the deferred follow-up WP placeholder in WORK_INDEX.md.
        const supportedList = SUPPORTED_RARITY_LABELS.map((label) => `'${label}'`).join(', ');
        throw new Error(
          `buildHeroDeck refused to build hero '${parsed.setAbbr}/${parsed.slug}': ` +
            `card '${card.slug}' carries unrecognized rarityLabel '${card.rarityLabel}'. ` +
            `Supported rarity labels are ${supportedList}. ` +
            `Cross-set rarity support is deferred to a follow-up WP — see the ` +
            `'(deferred placeholder) Extend D-13501 hero rarity → copy-count map ` +
            `to AMWP-class sets' row in docs/ai/work-packets/WORK_INDEX.md. ` +
            `Until then, MatchSetupConfig.heroDeckIds must select heroes whose ` +
            `cards use only the four locked rarity labels.`,
        );
      }

      // why: D-13502 — set-qualified hero card-instance ext_id format
      // <setAbbr>/<heroSlug>/<cardSlug>. Distinct from the FlatCard hyphen
      // key emitted by registry.listCards(); slash form aligns with the
      // qualified-ID grammar already used in MatchSetupConfig.heroDeckIds.
      const extId = `${parsed.setAbbr}/${parsed.slug}/${card.slug}` as CardExtId;
      for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
        cards.push(extId);
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
