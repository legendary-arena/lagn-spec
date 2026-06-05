/**
 * Economy logic for the Legendary Arena game engine.
 *
 * Pure helpers for parsing card stat values, building the card stats
 * lookup at setup time, and managing per-turn attack/recruit economy.
 *
 * No boardgame.io imports. No .reduce(). No throws. Setup-time only
 * for buildCardStats; runtime-safe for economy helpers.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { TurnEconomy, CardStatEntry } from './economy.types.js';
// why: D-13702 / D-18706 fan-out — economy.logic.ts must resolve hero AND
// villain card-instance ext_ids identically to the deck builders so
// G.cardStats keys equal the zone-instance grammar (a superset of the hero
// deck reservoir and the exact set of villain zone instances). The shared
// emitters enforce parity by construction; divergence between sites is the
// silent lookup-miss class WP-191 fixes. Per the D-13702 RS-4 lock the
// emitters are imported (not re-implemented) from their canonical homes.
import { heroCardInstanceExtIds } from '../setup/buildHeroDeck.js';
import { villainCardInstanceExtIds } from '../villainDeck/villainDeck.setup.js';

// ---------------------------------------------------------------------------
// CardStatsRegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: game-engine must not import @legendary-arena/registry; this interface
// is satisfied structurally by CardRegistry. It exposes the minimum methods
// needed for card stat resolution at setup time.

/**
 * Minimal structural type for one hero card-instance entry inside
 * SetData.heroes[i].cards[j]. Used by the WP-135 hero card-instance walk
 * that populates slash-format ext_id entries (D-13502) into G.cardStats.
 */
interface HeroCardInstanceEntry {
  /** Card-level slug within the hero (e.g., 'mission-accomplished'). */
  slug: string;
  /**
   * Display name from the upstream patch. Optional in the registry schema
   * (HeroCardSchema.name is .optional()); read by the WP-137 cardCounts
   * resolution helper for name-keyed copy-count lookup.
   */
  name?: string;
  /**
   * Per-card rarity label. Read by the WP-137 cardCounts resolution
   * helper as the fallback when the cardCounts entry is absent or
   * malformed.
   */
  rarityLabel?: string;
  /** Per-card attack value; raw from registry. Undefined for non-attack cards. */
  attack?: string | number | null | undefined;
  /** Per-card recruit value; raw from registry. Undefined for non-recruit cards. */
  recruit?: string | number | null | undefined;
  /** Per-card recruit cost; raw from registry. */
  cost?: string | number | null | undefined;
}

/**
 * Minimal structural type for a hero entry inside SetData.heroes[i].
 *
 * The optional `cardCounts` field is the WP-137 data-driven copy-count
 * authority (D-13701). Read by buildCardCountsNameLookup at the top of
 * each hero loop in the per-copy fan-out branch.
 */
interface HeroInstanceEntry {
  /** Hero-level slug within the set (e.g., 'black-widow'). */
  slug: string;
  /** Per-card data. */
  cards: HeroCardInstanceEntry[];
  /**
   * Per-physical-card deck-composition data (D-13801). The D-14102
   * migration reads count and sides from this array.
   */
  physicalCards?: unknown;
  /** Optional name-keyed copy-count map (WP-137; see HeroSchema.cardCounts). */
  cardCounts?: unknown;
}

/**
 * Minimal structural type for a flat card returned by listCards().
 * Matches a subset of FlatCard from the registry package.
 *
 * Hero cards carry attack, recruit, and cost fields.
 * Villain/henchman vAttack is NOT on FlatCard — it comes from getSet().
 */
export interface CardStatsFlatCard {
  /** Unique key in format {setAbbr}-{cardType}-{groupSlug}-{cardSlug}. */
  key: string;
  /** Coarse card type: "hero", "mastermind", "villain", or "scheme". */
  cardType: string;
  /** Card-level slug within its parent entity. */
  slug: string;
  /** Set abbreviation (e.g., "core", "2099"). */
  setAbbr: string;
  /** Hero printed attack value. Undefined for non-hero cards. */
  attack?: string | number | null | undefined;
  /** Hero printed recruit value. Undefined for non-hero cards. */
  recruit?: string | number | null | undefined;
  /** Hero recruit cost. Undefined for non-hero cards. */
  cost?: string | number | undefined;
}

/**
 * Minimal structural type for a villain card entry in SetData.
 *
 * `vAttack` drives the fightCost; `copies` (WP-167 / D-16701) is read by the
 * shared villain instance-id emitter so §2 fans out one stat row per copy
 * instance, matching the zone-instance grammar.
 */
interface VillainCardEntry {
  slug: string;
  vAttack: string | number | null;
  copies?: number;
}

/**
 * Minimal structural type for a villain group in SetData.
 */
interface VillainGroupEntry {
  slug: string;
  cards: VillainCardEntry[];
}

/**
 * Minimal structural type for set data returned by getSet().
 * Only the fields needed for villain/henchman vAttack resolution.
 */
interface CardStatsSetData {
  abbr: string;
  villains: VillainGroupEntry[];
  henchmen: unknown[];
}

/**
 * Minimal structural type for a henchman group entry in SetData.
 */
interface HenchmanGroupEntry {
  slug: string;
  vAttack?: string | number | null;
}

/**
 * Setup-time registry interface for card stat resolution.
 *
 * Satisfied structurally by the real CardRegistry from the registry
 * package. Defined locally to respect the layer boundary (same pattern
 * as VillainDeckRegistryReader in villainDeck.setup.ts).
 */
export interface CardStatsRegistryReader {
  /** All flat cards across all loaded sets. */
  listCards(): CardStatsFlatCard[];
  /** All loaded set index entries. */
  listSets(): Array<{ abbr: string }>;
  /** Full set data for one set. */
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// parseCardStatValue — deterministic parser
// ---------------------------------------------------------------------------

// why: ARCHITECTURE.md "Card Field Data Quality" — hero card fields
// contain modifier strings like "2+" and "2*"; strip modifier, parse
// integer base only. Conditional bonus semantics are WP-022.
/**
 * Parses a card stat value into a non-negative integer.
 *
 * Handles the real-world variety in card data: integers, strings with
 * trailing modifiers ("2+", "2*"), null, and undefined. Returns 0 for
 * any input that cannot be parsed to a valid non-negative integer.
 *
 * @param value - Raw card stat value from the registry.
 * @returns Non-negative integer base value.
 */
export function parseCardStatValue(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    const floored = Math.floor(value);
    // why: negative card data values are treated as 0 — all economy
    // values must be integers >= 0
    if (floored < 0) {
      return 0;
    }
    return floored;
  }

  // String: strip trailing '+' or '*' modifier, parse integer base
  const trimmed = value.replace(/[+*]$/, '');
  const parsed = parseInt(trimmed, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// buildCardStats — setup-time card stat resolution
// ---------------------------------------------------------------------------

// why: mirrors G.villainDeckCardTypes pattern — resolve registry data
// at setup so moves never query registry at runtime
/**
 * Builds a card stats lookup from registry data at setup time.
 *
 * Iterates hero, villain, and henchman cards reachable from the match
 * config and parses their stat values into CardStatEntry records.
 *
 * @param registry - Setup-time registry reader. Accepts unknown to support
 *   narrow test mocks (CardRegistryReader). If the registry does not satisfy
 *   CardStatsRegistryReader structurally (missing listSets/getSet/full
 *   listCards), returns an empty record gracefully.
 * @param matchConfig - Match setup configuration with selected entity IDs.
 * @returns Record keyed by CardExtId with parsed stat values.
 */
export function buildCardStats(
  registry: unknown,
  matchConfig: MatchSetupConfig,
): Record<CardExtId, CardStatEntry> {
  // why: narrow test mocks (CardRegistryReader) only have listCards() returning
  // { key: string }[]. We check for the full CardStatsRegistryReader interface
  // at runtime. If the registry doesn't have the required methods, we return
  // an empty record — moves handle missing cardStats entries gracefully (0/0).
  if (!isCardStatsRegistryReader(registry)) {
    return {};
  }
  const stats: Record<CardExtId, CardStatEntry> = {};

  // --- 1. Hero cards (from listCards — FlatCard has attack/recruit/cost) ---
  // why: WP-113 PS-7 mid-execution amendment — buildCardStats consumes
  //   set-qualified <setAbbr>/<slug> entity IDs; filter setAbbr first to
  //   avoid cross-set slug collisions (51/307 hero-slug instances collide
  //   per the PS-8 probe). Graceful-skip on parse failure: the validator
  //   is the authoritative format-error reporter, this builder is
  //   defense-in-depth (per D-10014).
  const allFlatCards = registry.listCards();
  const heroFlatCards = filterCardsByType(allFlatCards, 'hero');

  for (const heroDeckId of matchConfig.heroDeckIds) {
    const parsed = parseQualifiedIdForSetup(heroDeckId);
    if (parsed === null) continue;
    const deckCards = filterHeroCardsByDeckSlug(heroFlatCards, parsed.setAbbr, parsed.slug);

    for (const card of deckCards) {
      const extId = card.key as CardExtId;
      stats[extId] = {
        attack: parseCardStatValue(card.attack),
        recruit: parseCardStatValue(card.recruit),
        cost: parseCardStatValue(card.cost),
        // why: heroes are never fought; fightCost is for villains only
        fightCost: 0,
        fightCostMode: 'static',
        fightCostBase: 0,
      };
    }
  }

  // --- 1b. Hero card instances (slash-format ext_id with #<copyIndex>) ---
  // why: D-18706 — §1b sources its instance ids from the shared
  // heroCardInstanceExtIds emitter rather than re-walking physicalCards
  // locally, so §1b and buildHeroAbilityHooks provably share one emitter and
  // can never key heroes differently. Output is byte-identical to the prior
  // inline walk: the emitter yields canonical-face slugs (sides[0], or the
  // card slug on the rarity-fallback path), and the per-copy stat fields are
  // still resolved from heroEntry.cards by matching that slug.
  for (const heroDeckId of matchConfig.heroDeckIds) {
    const parsed = parseQualifiedIdForSetup(heroDeckId);
    if (parsed === null) continue;

    const setData = registry.getSet(parsed.setAbbr);
    if (!setData || typeof setData !== 'object') continue;

    const heroEntry = findHeroEntry(setData, parsed.slug);
    if (heroEntry === null) continue;

    const instances = heroCardInstanceExtIds(parsed.setAbbr, parsed.slug, heroEntry);
    for (const instance of instances) {
      const cardEntry = findEconomyCardEntryBySlug(heroEntry.cards, instance.cardSlug);
      const attack = cardEntry !== null ? parseCardStatValue(cardEntry.attack) : 0;
      const recruit = cardEntry !== null ? parseCardStatValue(cardEntry.recruit) : 0;
      const cost = cardEntry !== null ? parseCardStatValue(cardEntry.cost) : 0;
      // why: per-copy fresh object literal — no aliasing across keys
      // (WP-028 D-2802 aliasing prevention extended to setup-time
      // sibling-snapshot fan-out).
      stats[instance.extId] = {
        attack,
        recruit,
        cost,
        // why: heroes are never fought; fightCost is for villains only.
        fightCost: 0,
        fightCostMode: 'static',
        fightCostBase: 0,
      };
    }
  }

  // --- 2. Villain cards (from getSet — vAttack is not on FlatCard) ---
  // why: WP-113 PS-7 mid-execution amendment — set-qualified ID + named-set
  //   filter (per D-10014).
  // why: D-18704 — fan out one stat row per copy instance via the shared
  // villainCardInstanceExtIds emitter, keyed by the exact zone-instance
  // ext_id. Before WP-191 this section keyed villains by the single
  // definition FlatCard key while zones were copy-indexed, so the runtime
  // `G.cardStats[cardId]` lookup (cardId = a copy-indexed city id) always
  // missed and fightCost defaulted to 0. The FlatCard existence gate is
  // dropped: the deck builder emits an instance for every group card, so
  // keying off the same emitter guarantees cardStats covers every villain
  // zone instance (no FlatCard prerequisite).
  for (const villainGroupId of matchConfig.villainGroupIds) {
    const parsed = parseQualifiedIdForSetup(villainGroupId);
    if (parsed === null) continue;
    const villainCards = findVillainGroupCards(registry, parsed.setAbbr, parsed.slug);

    for (const villainCard of villainCards) {
      if (typeof villainCard.slug !== 'string') continue;

      // Detect dynamic vAttack patterns BEFORE calling parseCardStatValue.
      // Guard: vAttack may be undefined/null for villains without an attack
      // stat — check for falsy before pattern matching to avoid TypeError.
      const rawVAttack = villainCard.vAttack;
      let fightCostMode: 'static' | 'dynamic' = 'static';
      let fightCostBase = 0;
      let fightCost = 0;

      if (!rawVAttack) {
        // why: villains without vAttack (e.g. some henchmen) default to static 0
        fightCost = 0;
      } else if (rawVAttack === '*') {
        // why: "*" = fight cost is entirely determined by captured hero recruit costs
        fightCostMode = 'dynamic';
        fightCostBase = 0;
        fightCost = 0;
      } else if (typeof rawVAttack === 'string' && rawVAttack.endsWith('+')) {
        // why: "N+" = base N plus captured hero costs; parseCardStatValue strips the "+"
        fightCostMode = 'dynamic';
        fightCostBase = parseCardStatValue(rawVAttack);
        fightCost = fightCostBase;
      } else {
        // why: static villain — fightCostMode defaults to 'static'
        fightCost = parseCardStatValue(rawVAttack);
      }

      const instanceExtIds = villainCardInstanceExtIds(
        parsed.setAbbr,
        parsed.slug,
        villainCard.slug,
        villainCard,
      );
      for (const extId of instanceExtIds) {
        // why: per-copy fresh object literal — no aliasing across keys.
        stats[extId] = {
          // why: villains do not generate resources or have recruit costs
          attack: 0,
          recruit: 0,
          cost: 0,
          fightCost,
          fightCostMode,
          fightCostBase,
        };
      }
    }
  }

  // --- 3. Henchman cards (from getSet — group-level vAttack) ---
  // why: henchmen are virtual copies (WP-014B). Their ext_id format is
  // henchman-{groupSlug}-{index}. vAttack comes from the group definition,
  // not individual cards, because henchmen are identical within a group.
  // why: WP-113 PS-7 mid-execution amendment — set-qualified ID + named-set
  //   filter (per D-10014).
  for (const henchmanGroupId of matchConfig.henchmanGroupIds) {
    const parsed = parseQualifiedIdForSetup(henchmanGroupId);
    if (parsed === null) continue;
    const henchmanResult = findHenchmanGroupVAttack(registry, parsed.setAbbr, parsed.slug);

    if (henchmanResult !== null) {
      const parsedFightCost = parseCardStatValue(henchmanResult.vAttack);

      // why: henchman virtual copies use index 00-09 (10 per group, per
      // WP-014B HENCHMAN_COPIES_PER_GROUP). Build stats for all copies.
      for (let copyIndex = 0; copyIndex < 10; copyIndex++) {
        const paddedIndex = String(copyIndex).padStart(2, '0');
        const extId = `henchman-${henchmanResult.groupSlug}-${paddedIndex}` as CardExtId;
        stats[extId] = {
          // why: henchmen do not generate resources or have recruit costs
          attack: 0,
          recruit: 0,
          cost: 0,
          fightCost: parsedFightCost,
          fightCostMode: 'static',
          fightCostBase: 0,
        };
      }
    }
  }

  return stats;
}

/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on any malformed input — empty string, missing slash,
 * multiple slashes, empty parts, or leading/trailing whitespace.
 *
 * Locally duplicated per WP-113 §6 (mid-execution amendment) — keeps
 * `economy.logic.ts` free of validator coupling. Identical rejection
 * rules to the validator's `parseQualifiedId`. Test seam.
 */
// why: WP-113 PS-7 mid-execution amendment — duplicated locally to avoid
//   validator coupling at the economy layer (per D-10014).
function parseQualifiedIdForSetup(input: string): { setAbbr: string; slug: string } | null {
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
// Economy helpers — pure functions, return new objects
// ---------------------------------------------------------------------------

/**
 * Returns available (unspent) attack points.
 *
 * @param economy - Current turn economy state.
 * @returns Available attack points (attack minus spentAttack).
 */
export function getAvailableAttack(economy: TurnEconomy): number {
  return economy.attack - economy.spentAttack;
}

/**
 * Returns available (unspent) recruit points.
 *
 * @param economy - Current turn economy state.
 * @returns Available recruit points (recruit minus spentRecruit).
 */
export function getAvailableRecruit(economy: TurnEconomy): number {
  return economy.recruit - economy.spentRecruit;
}

/**
 * Adds attack and recruit resources to the economy.
 *
 * @param economy - Current turn economy state.
 * @param attack - Attack points to add.
 * @param recruit - Recruit points to add.
 * @returns New TurnEconomy with updated totals.
 */
export function addResources(
  economy: TurnEconomy,
  attack: number,
  recruit: number,
): TurnEconomy {
  return {
    attack: economy.attack + attack,
    recruit: economy.recruit + recruit,
    spentAttack: economy.spentAttack,
    spentRecruit: economy.spentRecruit,
    piercing: economy.piercing,
    woundsDrawn: economy.woundsDrawn,
  };
}

/**
 * Records an attack point spend.
 *
 * @param economy - Current turn economy state.
 * @param amount - Attack points to spend.
 * @returns New TurnEconomy with incremented spentAttack.
 */
export function spendAttack(
  economy: TurnEconomy,
  amount: number,
): TurnEconomy {
  return {
    attack: economy.attack,
    recruit: economy.recruit,
    spentAttack: economy.spentAttack + amount,
    spentRecruit: economy.spentRecruit,
    piercing: economy.piercing,
    woundsDrawn: economy.woundsDrawn,
  };
}

/**
 * Records a recruit point spend.
 *
 * @param economy - Current turn economy state.
 * @param amount - Recruit points to spend.
 * @returns New TurnEconomy with incremented spentRecruit.
 */
export function spendRecruit(
  economy: TurnEconomy,
  amount: number,
): TurnEconomy {
  return {
    attack: economy.attack,
    recruit: economy.recruit,
    spentAttack: economy.spentAttack,
    spentRecruit: economy.spentRecruit + amount,
    piercing: economy.piercing,
    woundsDrawn: economy.woundsDrawn,
  };
}

/**
 * Returns a fresh TurnEconomy with all values at zero.
 *
 * Called at the start of each player turn and during initial setup.
 *
 * @returns TurnEconomy with all fields set to 0.
 */
export function resetTurnEconomy(): TurnEconomy {
  return { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0, piercing: 0, woundsDrawn: 0 };
}

// ---------------------------------------------------------------------------
// Runtime type guard
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for CardStatsRegistryReader.
 *
 * Returns true if the registry object has the required methods (listCards,
 * listSets, getSet). Narrow test mocks that only implement
 * CardRegistryReader will return false.
 */
function isCardStatsRegistryReader(
  registry: unknown,
): registry is CardStatsRegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;
  return (
    typeof candidate.listCards === 'function' &&
    typeof candidate.listSets === 'function' &&
    typeof candidate.getSet === 'function'
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Filters flat cards to only those with the given cardType.
 */
function filterCardsByType(
  cards: CardStatsFlatCard[],
  cardType: string,
): CardStatsFlatCard[] {
  const result: CardStatsFlatCard[] = [];
  for (const card of cards) {
    if (card.cardType === cardType) {
      result.push(card);
    }
  }
  return result;
}

/**
 * Filters hero flat cards by setAbbr first, then by hero deck slug.
 *
 * Hero FlatCard key format: {setAbbr}-hero-{heroSlug}-{slot}.
 * Per WP-113 PS-7 (mid-execution amendment): filter by setAbbr first to
 * avoid cross-set hero-slug collisions (51/307 instances).
 */
// why: WP-113 PS-7 mid-execution amendment — Builder Filtering Order —
//   iterate named set only (per D-10014).
function filterHeroCardsByDeckSlug(
  heroCards: CardStatsFlatCard[],
  targetSetAbbr: string,
  heroDeckSlug: string,
): CardStatsFlatCard[] {
  const result: CardStatsFlatCard[] = [];
  for (const card of heroCards) {
    if (card.setAbbr !== targetSetAbbr) continue;
    const heroSlug = extractHeroSlug(card);
    if (heroSlug === heroDeckSlug) {
      result.push(card);
    }
  }
  return result;
}

/**
 * Extracts the hero slug from a hero FlatCard.
 *
 * Key format: {setAbbr}-hero-{heroSlug}-{slot}
 * The heroSlug is between "hero-" and the last "-{slot}" segment.
 */
function extractHeroSlug(card: CardStatsFlatCard): string {
  const prefix = `${card.setAbbr}-hero-`;
  if (!card.key.startsWith(prefix)) {
    return '';
  }

  // why: slot is always the last segment after the final "-"
  const afterPrefix = card.key.slice(prefix.length);
  const lastDashIndex = afterPrefix.lastIndexOf('-');
  if (lastDashIndex === -1) {
    return '';
  }

  return afterPrefix.slice(0, lastDashIndex);
}

/**
 * Finds a hero entry within a set's heroes[] array by slug.
 *
 * Returns null if the set data is malformed (missing heroes array) or
 * the named hero is not present. Used by the WP-135 hero card-instance
 * walk inside buildCardStats.
 */
function findHeroEntry(
  setData: unknown,
  heroSlug: string,
): HeroInstanceEntry | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { heroes?: unknown };
  if (!Array.isArray(candidate.heroes)) return null;

  for (const entry of candidate.heroes) {
    if (!entry || typeof entry !== 'object') continue;
    const heroEntry = entry as HeroInstanceEntry;
    if (typeof heroEntry.slug !== 'string') continue;
    if (heroEntry.slug !== heroSlug) continue;
    if (!Array.isArray(heroEntry.cards)) continue;
    return heroEntry;
  }
  return null;
}

/**
 * Finds a hero card entry by slug within the cards array.
 *
 * Used by the physicalCards migration to resolve stat fields for the
 * canonical face slug (sides[0] per D-14101).
 */
function findEconomyCardEntryBySlug(
  cards: HeroCardInstanceEntry[],
  slug: string,
): HeroCardInstanceEntry | null {
  for (const cardEntry of cards) {
    if (!cardEntry || typeof cardEntry !== 'object') continue;
    if (cardEntry.slug === slug) return cardEntry;
  }
  return null;
}

/**
 * Finds villain cards for a group within the named set's villains[].
 *
 * No cross-set fallback exists — returns [] if the named set is not
 * loaded or the group slug is not present in it.
 */
// why: WP-113 PS-7 mid-execution amendment — Builder Filtering Order —
//   iterate named set only (per D-10014).
function findVillainGroupCards(
  registry: CardStatsRegistryReader,
  setAbbr: string,
  villainGroupSlug: string,
): VillainCardEntry[] {
  const setData = registry.getSet(setAbbr) as CardStatsSetData | undefined;
  if (!setData || !Array.isArray(setData.villains)) return [];

  for (const group of setData.villains) {
    if (group.slug === villainGroupSlug && Array.isArray(group.cards)) {
      return group.cards;
    }
  }
  return [];
}

/**
 * Finds henchman group vAttack within the named set's henchmen[].
 *
 * No cross-set fallback exists — returns null if the named set is not
 * loaded or the group slug is not present in it.
 */
// why: WP-113 PS-7 mid-execution amendment — Builder Filtering Order —
//   iterate named set only (per D-10014).
function findHenchmanGroupVAttack(
  registry: CardStatsRegistryReader,
  setAbbr: string,
  henchmanGroupSlug: string,
): { groupSlug: string; vAttack: string | number | null } | null {
  const setData = registry.getSet(setAbbr);
  if (!setData || typeof setData !== 'object') return null;

  const castSetData = setData as { henchmen?: unknown[] };
  if (!Array.isArray(castSetData.henchmen)) return null;

  for (const entry of castSetData.henchmen) {
    if (!entry || typeof entry !== 'object') continue;

    const henchmanEntry = entry as HenchmanGroupEntry;
    if (henchmanEntry.slug === henchmanGroupSlug) {
      return {
        groupSlug: henchmanEntry.slug,
        vAttack: henchmanEntry.vAttack ?? null,
      };
    }
  }
  return null;
}
