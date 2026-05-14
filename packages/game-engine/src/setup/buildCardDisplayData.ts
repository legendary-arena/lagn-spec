/**
 * Setup-time card display data resolution for the Legendary Arena game
 * engine.
 *
 * Builds a Readonly<Record<CardExtId, UICardDisplay>> snapshot at
 * Game.setup() so UIState can surface card name / imageUrl / cost without
 * granting the client a runtime registry import. Sibling snapshot to
 * G.cardStats (WP-018), G.villainDeckCardTypes (WP-014B), and
 * G.cardKeywords (WP-025).
 *
 * Walks four card surfaces:
 *   - heroes      via registry.listCards() filtered to cardType === 'hero'
 *   - villains    via registry.getSet(setAbbr).villains[i].cards[j]
 *                 (FlatCard supplies name/imageUrl; SetData supplies vAttack)
 *   - henchmen    via registry.getSet(setAbbr).henchmen[i] (group-level)
 *                 — henchmen are NOT in FlatCard; flattenSet() omits them
 *   - mastermind  base card via registry.getSet(setAbbr).masterminds[i]
 *                 (FlatCard supplies name/imageUrl; SetData supplies vAttack)
 *
 * No @legendary-arena/registry import. No boardgame.io import. Setup-time
 * only. No randomness, no clocks, no I/O.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { UICardDisplay } from '../ui/uiState.types.js';
import { parseCardStatValue } from '../economy/economy.logic.js';
// why: D-13702 fan-out — buildCardDisplayData must resolve hero card-instance
// copy counts identically to buildHeroDeckCards so G.cardDisplayData keys
// form a superset of the hero deck reservoir. The shared helper enforces
// byte-for-byte parity by construction; divergence between the three
// sites would cause silent display lookup misses for HQ slot rendering
// and hand display under specific RNG seeds. Per RS-4 lock, the helper
// is imported (not duplicated) from the canonical emitter site.
import {
  buildCardCountsNameLookup,
  resolveHeroCardCopyCount,
} from './buildHeroDeck.js';

// ---------------------------------------------------------------------------
// parseCostNullable — null-distinction wrapper around parseCardStatValue
// ---------------------------------------------------------------------------

// why: pre-flight 2026-04-29 PS-4 — registry data uses null/undefined to
// signal "no cost shown" (e.g., bystanders, scheme cards have no printed
// cost; villain/henchman vAttack is occasionally null on data-quality
// edge cases); parseCardStatValue returns 0 for both null and undefined,
// which conflates "no cost" with "free". This guard preserves the UX
// distinction. NOT a parallel parser — parseCardStatValue is still the
// only widener-handler for non-null values (star modifiers, plus
// modifiers, integers).
/**
 * Parses a registry cost / vAttack value into the UICardDisplay.cost
 * shape `number | null`.
 *
 * - `null` / `undefined` -> `null` (registry says "no cost shown")
 * - everything else -> `parseCardStatValue(value)` (handles "2*", "2+",
 *   integers, etc., returning a non-negative integer; never throws)
 *
 * @param value - Raw registry cost / vAttack value.
 * @returns Parsed cost as number, or null when the registry value is
 *   genuinely absent.
 */
function parseCostNullable(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseCardStatValue(value);
}

// ---------------------------------------------------------------------------
// Local structural registry reader interface
// ---------------------------------------------------------------------------

// why: layer-boundary precedent — engine setup files cannot import
// CardRegistry from @legendary-arena/registry (mirrors buildCardStats and
// buildCardKeywords). The local interface is satisfied structurally by
// the real CardRegistry. Methods exposed: listCards (heroes + villain /
// mastermind name/imageUrl matching) and getSet (villain / henchman /
// mastermind SetData walks for vAttack and group-level fields).

/**
 * Minimal structural type for a flat card returned by listCards().
 * Matches a subset of FlatCard from the registry package.
 *
 * Heroes carry cost; villains and masterminds carry name / imageUrl
 * matched by key. Henchmen are NOT in FlatCard.
 */
interface DisplayDataFlatCard {
  /** Unique key in format {setAbbr}-{cardType}-{groupSlug}-{cardSlug}. */
  key: string;
  /** Coarse card type: "hero", "mastermind", "villain", or "scheme". */
  cardType: string;
  /** Card-level slug within its parent entity. */
  slug: string;
  /** Set abbreviation (e.g., "core", "2099"). */
  setAbbr: string;
  /** Display name preserved verbatim from the registry. */
  name: string;
  /** Full image URL preserved verbatim from the registry. */
  imageUrl: string;
  /** Hero recruit cost. Undefined for non-hero card types. */
  cost?: string | number | undefined;
}

/**
 * Minimal structural type for one hero card-instance entry inside
 * SetData.heroes[i].cards[j]. Used by the WP-135 hero card-instance walk
 * that populates slash-format ext_id entries (D-13502) into
 * G.cardDisplayData. Mirrors HeroCardInstanceEntry in economy.logic.ts.
 */
interface DisplayDataHeroCardEntry {
  /** Card-level slug within the hero. */
  slug: string;
  /** Display name preserved verbatim from the registry. */
  name?: string;
  /**
   * Per-card rarity label. Read by the WP-137 cardCounts resolution
   * helper as the fallback when the cardCounts entry is absent or
   * malformed.
   */
  rarityLabel?: string;
  /** Full image URL preserved verbatim from the registry. */
  imageUrl?: string;
  /** Per-card recruit cost; raw from registry. Null/undefined → "no cost shown". */
  cost?: string | number | null | undefined;
}

/**
 * Minimal structural type for one physical card in SetData.heroes[i].physicalCards[j].
 *
 * Introduced by WP-138 Phase 1a (D-13801). Used by the D-14102 deck-size
 * migration to read count and imageUrl from the physical card rather than
 * per-side card entries.
 */
interface DisplayDataPhysicalCardEntry {
  /** Physical card identifier within the hero (e.g., 'p1'). */
  id: string;
  /** Number of copies of this physical card in the deck. */
  count: number;
  /** Canonical image URL for this physical card. */
  imageUrl: string;
  /** Ordered side slugs. sides[0] is the canonical face per D-14101. */
  sides: string[];
}

/**
 * Minimal structural type for a hero entry in SetData.heroes[i].
 *
 * The optional `cardCounts` field is the WP-137 data-driven copy-count
 * authority (D-13701). Read by buildCardCountsNameLookup at the top of
 * each hero loop in the per-copy fan-out branch.
 */
interface DisplayDataHeroEntry {
  slug: string;
  cards: DisplayDataHeroCardEntry[];
  /**
   * Per-physical-card deck-composition data (D-13801). The D-14102
   * migration reads count, imageUrl, and sides from this array.
   */
  physicalCards?: unknown;
  /** Optional name-keyed copy-count map (WP-137; see HeroSchema.cardCounts). */
  cardCounts?: unknown;
}

/**
 * Minimal structural type for a villain card entry in SetData.
 * Only vAttack is needed for display cost.
 */
interface DisplayDataVillainCardEntry {
  slug: string;
  vAttack: string | number | null;
}

/**
 * Minimal structural type for a villain group in SetData.
 */
interface DisplayDataVillainGroupEntry {
  slug: string;
  cards: DisplayDataVillainCardEntry[];
}

/**
 * Minimal structural type for a mastermind card entry in SetData.
 */
interface DisplayDataMastermindCardEntry {
  slug: string;
  tactic?: boolean;
  vAttack?: string | number | null;
}

/**
 * Minimal structural type for a mastermind entry in SetData.
 */
interface DisplayDataMastermindEntry {
  slug: string;
  cards: DisplayDataMastermindCardEntry[];
}

/**
 * Minimal structural type for a henchman group entry in SetData.
 *
 * Per registry rules, henchmen are stored as `z.unknown()` in the schema
 * and resolved structurally at runtime — group-level name, imageUrl, and
 * vAttack are read defensively.
 */
interface DisplayDataHenchmanGroupEntry {
  slug: string;
  name?: string;
  imageUrl?: string;
  vAttack?: string | number | null;
}

/**
 * Setup-time registry interface for card display data resolution.
 *
 * Satisfied structurally by the real CardRegistry from the registry
 * package. Defined locally to respect the layer boundary.
 */
export interface CardDisplayDataRegistryReader {
  /** All flat cards across all loaded sets. */
  listCards(): DisplayDataFlatCard[];
  /** Full set data for one set. Returns undefined if the set was not loaded. */
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// Runtime type guard (orchestration-side detection seam per D-10014)
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for CardDisplayDataRegistryReader.
 *
 * Returns true if the registry object exposes the required methods
 * (listCards, getSet). Narrow test mocks that only implement
 * CardRegistryReader (listCards-only) will return false. Used by
 * buildInitialGameState as the orchestration-side diagnostic detection
 * seam (mirrors isVillainDeckRegistryReader / isMastermindRegistryReader
 * / isSchemeRegistryReader / isHeroAbilityRegistryReader per WP-113
 * D-10014).
 */
// why: D-10014 — orchestration-side diagnostic detection seam mirrors the
// four existing builder guards. Builder-internal `isXRegistryReader →
// empty` paths remain unchanged for defense-in-depth; this orchestration
// site is the primary detection seam.
export function isCardDisplayDataRegistryReader(
  registry: unknown,
): registry is CardDisplayDataRegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;
  return (
    typeof candidate.listCards === 'function' &&
    typeof candidate.getSet === 'function'
  );
}

// ---------------------------------------------------------------------------
// parseQualifiedIdForSetup — local duplicate (WP-113 §6 precedent)
// ---------------------------------------------------------------------------

// why: WP-113 §6 step 1 — `import or duplicate locally — author choice`.
// Duplicating locally avoids a circular import between builders and
// matchSetup.validate.ts (per D-10014). Identical rejection rules to
// the validator's `parseQualifiedId`.
/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on any malformed input.
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
// buildCardDisplayData — sibling-snapshot builder
// ---------------------------------------------------------------------------

// why: sibling-snapshot pattern (sibling to G.cardStats per WP-018,
// G.villainDeckCardTypes per WP-014B, G.cardKeywords per WP-025) —
// resolve registry data at setup so moves and projections never query the
// registry at runtime. Returns Readonly<...> as a documentational signal
// at the type boundary (TypeScript does not enforce runtime immutability
// for Record values, but the type signal makes accidental writes
// grep-able in review).
/**
 * Builds a card display data lookup from registry data at setup time.
 *
 * Iterates heroes, villains, henchmen, and the mastermind base card
 * reachable from the match config and projects their display fields
 * (name, imageUrl, cost) into UICardDisplay records keyed by CardExtId.
 *
 * @param registry - Setup-time registry reader. Accepts unknown to
 *   support narrow test mocks (CardRegistryReader). When the registry
 *   does not satisfy CardDisplayDataRegistryReader structurally
 *   (listCards / getSet missing), returns an empty record gracefully —
 *   moves and projections handle missing entries via the
 *   UNKNOWN_DISPLAY_PLACEHOLDER fallback in uiState.build.ts.
 * @param matchConfig - Match setup configuration with selected entity IDs.
 * @returns Readonly record keyed by CardExtId with display payloads.
 */
export function buildCardDisplayData(
  registry: unknown,
  matchConfig: MatchSetupConfig,
): Readonly<Record<CardExtId, UICardDisplay>> {
  // why: layer-boundary precedent — narrow test mocks may only implement
  // a subset of the registry interface. Mirror buildCardStats:170–172
  // empty-record fallback. The orchestration site
  // (buildInitialGameState.ts) emits a single deterministic diagnostic
  // when the guard fails so the empty result is still observable in
  // G.messages without per-card noise.
  if (!isCardDisplayDataRegistryReader(registry)) {
    return {};
  }

  const result: Record<CardExtId, UICardDisplay> = {};
  const allFlatCards = registry.listCards();
  const heroFlatCards = filterFlatCardsByType(allFlatCards, 'hero');

  // --- 1. Heroes (FlatCard supplies name / imageUrl / cost) ---
  for (const heroDeckId of matchConfig.heroDeckIds) {
    const parsed = parseQualifiedIdForSetup(heroDeckId);
    if (parsed === null) continue;
    const deckCards = filterHeroCardsByDeckSlug(
      heroFlatCards,
      parsed.setAbbr,
      parsed.slug,
    );

    for (const heroFlatCard of deckCards) {
      const extId = heroFlatCard.key as CardExtId;
      result[extId] = {
        extId,
        name: heroFlatCard.name,
        imageUrl: heroFlatCard.imageUrl,
        cost: parseCostNullable(heroFlatCard.cost),
      };
    }
  }

  // --- 1b. Hero card instances (WP-135 / WP-137 — slash-format ext_id with #<copyIndex>) ---
  // why: D-14102 — the per-copy fan-out now iterates physicalCards[].count
  // instead of summing per-side cardCounts via resolveHeroCardCopyCount.
  // Each physicalCard carries count, imageUrl, and ordered sides[];
  // sides[0] is the canonical face slug per D-14101. Card data (name,
  // cost) is resolved from heroEntry.cards by matching sides[0] to
  // card.slug. Falls back to the old per-card resolveHeroCardCopyCount
  // path when physicalCards is absent (defense-in-depth).
  for (const heroDeckId of matchConfig.heroDeckIds) {
    const parsed = parseQualifiedIdForSetup(heroDeckId);
    if (parsed === null) continue;

    const setData = registry.getSet(parsed.setAbbr);
    const heroEntry = findHeroEntryForDisplay(setData, parsed.slug);
    if (heroEntry === null) continue;

    const physicalCards = parseDisplayDataPhysicalCards(heroEntry.physicalCards);
    if (physicalCards.length > 0) {
      for (const physicalCard of physicalCards) {
        const canonicalSlug = physicalCard.sides[0] as string;
        const cardEntry = findCardEntryBySlug(heroEntry.cards, canonicalSlug);
        const name = cardEntry !== null && typeof cardEntry.name === 'string' ? cardEntry.name : '';
        const cost = cardEntry !== null ? parseCostNullable(cardEntry.cost ?? null) : null;
        const imageUrl = physicalCard.imageUrl;
        const baseExtId = `${parsed.setAbbr}/${parsed.slug}/${canonicalSlug}`;
        for (let copyIndex = 0; copyIndex < physicalCard.count; copyIndex++) {
          const extId = `${baseExtId}#${copyIndex}` as CardExtId;
          // why: per-copy fresh object literal — no aliasing across keys
          // (WP-028 D-2802 aliasing prevention extended to setup-time
          // sibling-snapshot fan-out).
          result[extId] = {
            extId,
            name,
            imageUrl,
            cost,
          };
        }
      }
    } else {
      // why: fallback to per-card resolveHeroCardCopyCount when
      // physicalCards is absent or empty — preserves backward
      // compatibility with data that has not been curated yet.
      const nameLookup = buildCardCountsNameLookup(heroEntry.cardCounts);

      for (const heroCardEntry of heroEntry.cards) {
        if (!heroCardEntry || typeof heroCardEntry !== 'object') continue;
        if (typeof heroCardEntry.slug !== 'string') continue;

        const rarityLabel = typeof heroCardEntry.rarityLabel === 'string' ? heroCardEntry.rarityLabel : '';
        const copyCount = resolveHeroCardCopyCount({ name: heroCardEntry.name, rarityLabel }, nameLookup);
        if (copyCount === null) continue;

        const baseExtId = `${parsed.setAbbr}/${parsed.slug}/${heroCardEntry.slug}`;
        const name = typeof heroCardEntry.name === 'string' ? heroCardEntry.name : '';
        const imageUrl = typeof heroCardEntry.imageUrl === 'string' ? heroCardEntry.imageUrl : '';
        const cost = parseCostNullable(heroCardEntry.cost ?? null);
        for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
          const extId = `${baseExtId}#${copyIndex}` as CardExtId;
          // why: per-copy fresh object literal — no aliasing across keys
          result[extId] = {
            extId,
            name,
            imageUrl,
            cost,
          };
        }
      }
    }
  }

  // --- 2. Villains (FlatCard supplies name/imageUrl; SetData vAttack) ---
  for (const villainGroupId of matchConfig.villainGroupIds) {
    const parsed = parseQualifiedIdForSetup(villainGroupId);
    if (parsed === null) continue;
    const villainCards = findVillainGroupCards(
      registry,
      parsed.setAbbr,
      parsed.slug,
    );

    for (const villainCard of villainCards) {
      const matchingFlatCard = findFlatCardForVillain(
        allFlatCards,
        parsed.setAbbr,
        parsed.slug,
        villainCard.slug,
      );

      if (matchingFlatCard === undefined) continue;

      const extId = matchingFlatCard.key as CardExtId;
      result[extId] = {
        extId,
        name: matchingFlatCard.name,
        imageUrl: matchingFlatCard.imageUrl,
        cost: parseCostNullable(villainCard.vAttack),
      };
    }
  }

  // --- 3. Henchmen (group-level name/imageUrl/vAttack; 10 virtual copies) ---
  // why: henchmen are NOT in FlatCard — flattenSet() emits only
  // hero / mastermind / villain / scheme. Walk getSet().henchmen[*]
  // directly. All 10 virtual copies share the group-level fields. Ext_id
  // format `henchman-{groupSlug}-NN` (zero-padded 00..09) mirrors
  // buildCardStats:248–260 exactly so the join key matches G.cardStats.
  for (const henchmanGroupId of matchConfig.henchmanGroupIds) {
    const parsed = parseQualifiedIdForSetup(henchmanGroupId);
    if (parsed === null) continue;
    const henchmanGroup = findHenchmanGroup(
      registry,
      parsed.setAbbr,
      parsed.slug,
    );

    if (henchmanGroup === null) continue;

    const groupName = henchmanGroup.name ?? '';
    const groupImageUrl = henchmanGroup.imageUrl ?? '';
    const groupCost = parseCostNullable(henchmanGroup.vAttack ?? null);

    for (let copyIndex = 0; copyIndex < 10; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const extId = `henchman-${henchmanGroup.slug}-${paddedIndex}` as CardExtId;
      result[extId] = {
        extId,
        name: groupName,
        imageUrl: groupImageUrl,
        cost: groupCost,
      };
    }
  }

  // --- 4. Mastermind base card (FlatCard name/imageUrl; SetData vAttack) ---
  // why: tactic cards deferred — UIMastermindState exposes tactics as
  // counts only. Base-card classification (`tactic !== true`) mirrors
  // mastermind.setup.ts:findMastermindCards exactly so the projected
  // ext_id matches G.mastermind.baseCardId.
  const mastermindParsed = parseQualifiedIdForSetup(matchConfig.mastermindId);
  if (mastermindParsed !== null) {
    const baseCardEntry = findMastermindBaseCard(
      registry,
      mastermindParsed.setAbbr,
      mastermindParsed.slug,
    );

    if (baseCardEntry !== null) {
      const baseCardKey = `${mastermindParsed.setAbbr}-mastermind-${mastermindParsed.slug}-${baseCardEntry.slug}`;
      const matchingFlatCard = findFlatCardByKey(allFlatCards, baseCardKey);

      if (matchingFlatCard !== undefined) {
        const extId = matchingFlatCard.key as CardExtId;
        result[extId] = {
          extId,
          name: matchingFlatCard.name,
          imageUrl: matchingFlatCard.imageUrl,
          cost: parseCostNullable(baseCardEntry.vAttack ?? null),
        };
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Filters flat cards to only those with the given cardType.
 */
function filterFlatCardsByType(
  cards: DisplayDataFlatCard[],
  cardType: string,
): DisplayDataFlatCard[] {
  const result: DisplayDataFlatCard[] = [];
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
 * Mirrors filterHeroCardsByDeckSlug in economy.logic.ts.
 */
function filterHeroCardsByDeckSlug(
  heroCards: DisplayDataFlatCard[],
  targetSetAbbr: string,
  heroDeckSlug: string,
): DisplayDataFlatCard[] {
  const result: DisplayDataFlatCard[] = [];
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
 * Key format: {setAbbr}-hero-{heroSlug}-{slot}. The heroSlug sits
 * between "hero-" and the final "-{slot}" segment.
 */
function extractHeroSlug(card: DisplayDataFlatCard): string {
  const prefix = `${card.setAbbr}-hero-`;
  if (!card.key.startsWith(prefix)) return '';

  const afterPrefix = card.key.slice(prefix.length);
  const lastDashIndex = afterPrefix.lastIndexOf('-');
  if (lastDashIndex === -1) return '';

  return afterPrefix.slice(0, lastDashIndex);
}

/**
 * Finds a hero entry within the named set's heroes[] by slug.
 *
 * Returns null if the named set is not loaded, malformed, or the hero
 * slug is not present. Used by the WP-135 hero card-instance walk for
 * G.cardDisplayData.
 */
function findHeroEntryForDisplay(
  setData: unknown,
  heroSlug: string,
): DisplayDataHeroEntry | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { heroes?: unknown };
  if (!Array.isArray(candidate.heroes)) return null;

  for (const entry of candidate.heroes) {
    if (!entry || typeof entry !== 'object') continue;
    const heroEntry = entry as DisplayDataHeroEntry;
    if (typeof heroEntry.slug !== 'string') continue;
    if (heroEntry.slug !== heroSlug) continue;
    if (!Array.isArray(heroEntry.cards)) continue;
    return heroEntry;
  }
  return null;
}

/**
 * Finds villain cards for a group within the named set's villains[].
 *
 * No cross-set fallback — returns [] if the named set is not loaded or
 * the group slug is not present in it.
 */
function findVillainGroupCards(
  registry: CardDisplayDataRegistryReader,
  setAbbr: string,
  villainGroupSlug: string,
): DisplayDataVillainCardEntry[] {
  const setData = registry.getSet(setAbbr);
  if (!setData || typeof setData !== 'object') return [];

  const candidate = setData as { villains?: unknown };
  if (!Array.isArray(candidate.villains)) return [];

  for (const group of candidate.villains as DisplayDataVillainGroupEntry[]) {
    if (group.slug === villainGroupSlug && Array.isArray(group.cards)) {
      return group.cards;
    }
  }
  return [];
}

/**
 * Finds a FlatCard matching a villain card by setAbbr first, then group
 * slug, then card slug.
 *
 * Villain FlatCard key format: {setAbbr}-villain-{groupSlug}-{cardSlug}.
 */
function findFlatCardForVillain(
  allFlatCards: DisplayDataFlatCard[],
  setAbbr: string,
  villainGroupSlug: string,
  cardSlug: string,
): DisplayDataFlatCard | undefined {
  const expectedKey = `${setAbbr}-villain-${villainGroupSlug}-${cardSlug}`;
  for (const card of allFlatCards) {
    if (card.cardType !== 'villain') continue;
    if (card.key === expectedKey) return card;
  }
  return undefined;
}

/**
 * Finds a henchman group within the named set's henchmen[].
 *
 * Returns null if the named set is not loaded, the group slug is not
 * present, or the entry shape is malformed. No cross-set fallback.
 */
function findHenchmanGroup(
  registry: CardDisplayDataRegistryReader,
  setAbbr: string,
  henchmanGroupSlug: string,
): DisplayDataHenchmanGroupEntry | null {
  const setData = registry.getSet(setAbbr);
  if (!setData || typeof setData !== 'object') return null;

  const candidate = setData as { henchmen?: unknown };
  if (!Array.isArray(candidate.henchmen)) return null;

  for (const entry of candidate.henchmen) {
    if (!entry || typeof entry !== 'object') continue;
    const henchmanEntry = entry as DisplayDataHenchmanGroupEntry;
    if (henchmanEntry.slug === henchmanGroupSlug) {
      return henchmanEntry;
    }
  }
  return null;
}

/**
 * Finds the base mastermind card within the named set's masterminds[].
 *
 * Mirrors mastermind.setup.ts:findMastermindCards classification: a
 * card with `tactic !== true` is the base; cards with `tactic === true`
 * are tactics (deferred — not projected by this builder).
 *
 * Returns null when the named set is not loaded, the slug is not
 * present, or the mastermind has no base card.
 */
function findMastermindBaseCard(
  registry: CardDisplayDataRegistryReader,
  setAbbr: string,
  mastermindSlug: string,
): DisplayDataMastermindCardEntry | null {
  const setData = registry.getSet(setAbbr);
  if (!setData || typeof setData !== 'object') return null;

  const candidate = setData as { masterminds?: unknown };
  if (!Array.isArray(candidate.masterminds)) return null;

  for (const mastermindRaw of candidate.masterminds) {
    if (!mastermindRaw || typeof mastermindRaw !== 'object') continue;
    const mastermind = mastermindRaw as DisplayDataMastermindEntry;
    if (mastermind.slug !== mastermindSlug) continue;
    if (!Array.isArray(mastermind.cards)) continue;

    for (const card of mastermind.cards) {
      if (card.tactic !== true) {
        return card;
      }
    }
    return null;
  }
  return null;
}

/**
 * Finds a FlatCard by exact key match.
 */
function findFlatCardByKey(
  allFlatCards: DisplayDataFlatCard[],
  key: string,
): DisplayDataFlatCard | undefined {
  for (const flatCard of allFlatCards) {
    if (flatCard.key === key) return flatCard;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Physical card helpers (D-14102 migration)
// ---------------------------------------------------------------------------

/**
 * Defensively parses raw physicalCards data into typed entries.
 *
 * Mirrors parsePhysicalCards in buildHeroDeck.ts but also validates and
 * extracts the imageUrl field needed by the display data builder.
 * Malformed entries are silently skipped (defense-in-depth).
 */
function parseDisplayDataPhysicalCards(raw: unknown): DisplayDataPhysicalCardEntry[] {
  if (!Array.isArray(raw)) return [];

  const result: DisplayDataPhysicalCardEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) continue;
    if (typeof candidate.count !== 'number' || !Number.isInteger(candidate.count) || candidate.count < 1) continue;
    if (typeof candidate.imageUrl !== 'string') continue;
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
      imageUrl: candidate.imageUrl,
      sides: candidate.sides as string[],
    });
  }
  return result;
}

/**
 * Finds a hero card entry by slug within the cards array.
 *
 * Used by the physicalCards migration to resolve name and cost for the
 * canonical face slug (sides[0] per D-14101).
 */
function findCardEntryBySlug(
  cards: DisplayDataHeroCardEntry[],
  slug: string,
): DisplayDataHeroCardEntry | null {
  for (const cardEntry of cards) {
    if (!cardEntry || typeof cardEntry !== 'object') continue;
    if (cardEntry.slug === slug) return cardEntry;
  }
  return null;
}
