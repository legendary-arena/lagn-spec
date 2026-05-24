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
 *
 * `copies` (WP-167 / D-16701) is the per-card copy count read by the
 * WP-172 per-copy fan-out (D-16802). Absent means a single instance —
 * mirrors `readVillainCopyCount` in `villainDeck.setup.ts:389–394`.
 */
interface DisplayDataVillainCardEntry {
  slug: string;
  vAttack: string | number | null;
  copies?: number;
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
 * Iterates heroes, villains, henchmen, the mastermind base card, the
 * generic Master Strikes, the scheme-twist virtual cards, and the
 * villain-deck bystander virtual cards reachable from the match config
 * and projects their display fields (name, imageUrl, cost) into
 * UICardDisplay records keyed by CardExtId.
 *
 * @param registry - Setup-time registry reader. Accepts unknown to
 *   support narrow test mocks (CardRegistryReader). When the registry
 *   does not satisfy CardDisplayDataRegistryReader structurally
 *   (listCards / getSet missing), returns an empty record gracefully —
 *   moves and projections handle missing entries via the
 *   UNKNOWN_DISPLAY_PLACEHOLDER fallback in uiState.build.ts.
 * @param matchConfig - Match setup configuration with selected entity IDs.
 * @param numPlayers - Number of players in the match. Read only by
 *   section 7 as the bystander-count fallback when the scheme does not
 *   carry `villainDeckBystanderCount`. DO NOT replace `numPlayers`
 *   usage with `matchConfig.bystandersCount`; these represent different
 *   domains:
 *
 *   - `numPlayers` → virtual villain-deck bystanders (D-1412, setup-time
 *     composition); section 7 reads this.
 *   - `matchConfig.bystandersCount` → shared rescue-pile supply in
 *     `G.sharedPiles.bystanders`.
 *
 *   Conflating them will silently break villain-deck composition
 *   correctness (both are `number`; no type error). Mirrors
 *   `context.ctx.numPlayers` read in `villainDeck.setup.ts:262`.
 *   `MatchSetupConfig` does not carry `numPlayers` (9-field composition
 *   lock per `.claude/rules/code-style.md`), so `Game.setup()` passes
 *   `ctx.numPlayers` through here.
 * @returns Readonly record keyed by CardExtId with display payloads.
 */
// why: WP-172 — `numPlayers` is the third parameter (not the whole
// `SetupContext`) so the builder keeps its pure-helper posture intact
// (no `boardgame.io` import, no `ctx.random` exposure). See JSDoc
// `@param numPlayers` above for the load-bearing two-domain distinction
// from `matchConfig.bystandersCount`.
export function buildCardDisplayData(
  registry: unknown,
  matchConfig: MatchSetupConfig,
  numPlayers: number,
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

      // why: WP-172 / D-16802 — villain copies are virtual-instanced;
      // each suffixed ext_id needs its own display entry so the UIState
      // projection's resolveDisplay does not fall through to
      // UNKNOWN_DISPLAY_PLACEHOLDER (the literal `<unknown>`) for
      // city-revealed villains. Mirrors the WP-135 hero card-instance
      // per-copy fan-out at section 1b and the WP-168 villain instancing
      // at `villainDeck.setup.ts:203`. Grammar byte-identity with that
      // emitter site is the regression-guard the §C cross-builder
      // superset test asserts. `copies` default is 1 — inlined verbatim
      // from `readVillainCopyCount` (`villainDeck.setup.ts:389–394`);
      // Rule §16.1 forbids helper extraction across two files / two
      // call sites.
      let copyCount = 1;
      if (typeof villainCard.copies === 'number' && villainCard.copies >= 1) {
        copyCount = villainCard.copies;
      }
      for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
        const paddedIndex = String(copyIndex).padStart(2, '0');
        const copyExtId = `${parsed.setAbbr}-villain-${parsed.slug}-${villainCard.slug}-${paddedIndex}` as CardExtId;
        // why: per-copy fresh object literal — no aliasing across keys
        // (D-2802 / D-13502 / D-14102 precedent already in this file at
        // section 1b lines 383–388).
        result[copyExtId] = {
          extId: copyExtId,
          name: matchingFlatCard.name,
          imageUrl: matchingFlatCard.imageUrl,
          cost: parseCostNullable(villainCard.vAttack),
        };
      }
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

  // --- 5. Master Strikes (5 generic virtual cards per D-16801) ---
  // why: D-16801 — exactly 5 generic Master Strikes per villain deck.
  // The literal `5` is inlined verbatim from `villainDeck.setup.ts:130`
  // (MASTER_STRIKE_COUNT). RS-1 lock: tabletop rule invariant, not a
  // tuning knob; the two-file duplication mirrors the
  // HENCHMAN_COPIES_PER_GROUP precedent (literal `10` at section 3
  // line 474). Soft-skip on mastermind parse failure (mirrors the
  // section-4 mastermind soft-skip — only `Game.setup()` may throw).
  if (mastermindParsed !== null) {
    let strikeName = 'Master Strike';
    let strikeImageUrl = '';
    const mastermindSetData = registry.getSet(mastermindParsed.setAbbr);
    const tierOneStrike = findOtherEntryByCardType(mastermindSetData, 'mastermind-strike');
    if (tierOneStrike !== null) {
      strikeName = tierOneStrike.name;
      strikeImageUrl = tierOneStrike.imageUrl;
    } else {
      // why: D-17201 — empirically only 5 of 40 sets carry a
      // `mastermind-strike` entry in their per-set `other[]` (core,
      // msp1, vill, wtif, ssw1 as of 2026-05-23). The `core` set is the
      // canonical Marvel Legendary visual source for the generic Master
      // Strike; without this tier-2 cross-set fallback, 35/40 matches
      // would render the tier-3 broken-image placeholder.
      const coreSetData = registry.getSet('core');
      const tierTwoStrike = findOtherEntryByCardType(coreSetData, 'mastermind-strike');
      if (tierTwoStrike !== null) {
        strikeName = tierTwoStrike.name;
        strikeImageUrl = tierTwoStrike.imageUrl;
      }
    }

    for (let strikeIndex = 0; strikeIndex < 5; strikeIndex++) {
      const paddedIndex = String(strikeIndex).padStart(2, '0');
      const strikeExtId = `master-strike-${paddedIndex}` as CardExtId;
      // why: per-copy fresh object literal — no aliasing across keys
      // (D-2802 / D-13502 / D-14102 precedent). `cost: null` — Master
      // Strikes have no printed cost on the physical card.
      result[strikeExtId] = {
        extId: strikeExtId,
        name: strikeName,
        imageUrl: strikeImageUrl,
        cost: null,
      };
    }
  }

  // --- 6. Scheme Twists + 7. Villain-Deck Bystanders (shared scheme lookup) ---
  // why: D-10014 — Builder Filtering Order — iterate named set only.
  // Sections 6 + 7 share the scheme parse + `getSet(schemeSetAbbr)`
  // lookup; the WP §Scope-B section ordering groups by display-source
  // scope (mastermind-set → scheme-set) rather than mirroring
  // `villainDeck.setup.ts`'s 3-4-5 ordering. Soft-skip on parse /
  // lookup failure (mirrors section-4 mastermind soft-skip — only
  // `Game.setup()` may throw).
  const parsedScheme = parseQualifiedIdForSetup(matchConfig.schemeId);
  if (parsedScheme !== null) {
    const schemeSetData = registry.getSet(parsedScheme.setAbbr);
    const scheme = findSchemeInSetForDisplay(schemeSetData, parsedScheme.slug);
    if (scheme !== null) {
      // why: D-16702 — twist count from scheme metadata; fallback `8`
      // inlined verbatim from `villainDeck.setup.ts:124` SCHEME_TWIST_COUNT
      // (D-1411 default). Two-file literal duplication is the RS-1 / Rule
      // §16.1 pattern; do not extract a helper across files.
      let twistCount = 8;
      if (typeof scheme.villainDeckTwistCount === 'number') {
        twistCount = scheme.villainDeckTwistCount;
      }

      let twistImageUrl = '';
      const tierOneTwist = findOtherEntryByCardType(schemeSetData, 'scheme-twist');
      if (tierOneTwist !== null) {
        twistImageUrl = tierOneTwist.imageUrl;
      } else {
        // why: D-17201 — empirically only 4 of 40 sets carry a
        // `scheme-twist` entry in their per-set `other[]` (core, msp1,
        // vill, wtif as of 2026-05-23). The `core` set is the canonical
        // Marvel Legendary visual source; tier-2 prevents 36/40 broken-
        // image tiles. The repeated `registry.getSet('core')` call (also
        // made in section 5) is negligible at setup time and keeps the
        // two sections independent of execution order.
        const coreSetData = registry.getSet('core');
        const tierTwoTwist = findOtherEntryByCardType(coreSetData, 'scheme-twist');
        if (tierTwoTwist !== null) {
          twistImageUrl = tierTwoTwist.imageUrl;
        }
      }

      for (let twistIndex = 0; twistIndex < twistCount; twistIndex++) {
        const paddedIndex = String(twistIndex).padStart(2, '0');
        const twistExtId = `scheme-twist-${scheme.slug}-${paddedIndex}` as CardExtId;
        // why: per-copy fresh object literal — no aliasing across keys.
        // `name` is always the literal `'Scheme Twist'` (printed-card
        // name is fixed — `core.json:2570` `name: "Scheme Twist"`).
        result[twistExtId] = {
          extId: twistExtId,
          name: 'Scheme Twist',
          imageUrl: twistImageUrl,
          cost: null,
        };
      }

      // --- 7. Villain-Deck Bystanders ---
      // why: D-1412 — bystander count from scheme metadata
      // (`villainDeckBystanderCount`); fallback to `numPlayers` (the new
      // 3rd parameter — see function JSDoc for why this is NOT
      // `matchConfig.bystandersCount`). Mirrors the
      // `villainDeck.setup.ts:262` read of `context.ctx.numPlayers`.
      let bystanderCount = numPlayers;
      if (typeof scheme.villainDeckBystanderCount === 'number') {
        bystanderCount = scheme.villainDeckBystanderCount;
      }

      let bystanderName = 'Bystander';
      let bystanderImageUrl = '';
      // why: tier-1 slug-match MUST beat positional `bystanders[0]`
      // because msp1 / vill / wtif / wpnx carry the generic
      // `slug === 'bystander'` entry mixed with named characters at
      // non-zero array positions; reading `bystanders[0]` blindly would
      // silently mis-render those sets.
      const tierOneBystander = findGenericBystanderEntry(schemeSetData);
      if (tierOneBystander !== null) {
        bystanderName = tierOneBystander.name;
        bystanderImageUrl = tierOneBystander.imageUrl;
      } else {
        // why: tier-2 acknowledged-imperfect named-character fallback —
        // cvwr / ssw2 / xmen `bystanders[]` carry ONLY named characters
        // (no `slug === 'bystander'` entry), so `bystanders[0]` becomes
        // the displayed art (e.g. "Aspiring Hero" for cvwr) — least-bad
        // choice until upstream registry data backfills the generic
        // entry. NO `core`-set cross-set fallback for bystanders because
        // bystander identity is conceptually per-scheme; a generic
        // `core` bystander would be a misleading visual for a Civil War
        // or Secret Wars II match. dstr has `bystanders: []` and falls
        // through to tier-3 literal `{ name: 'Bystander', imageUrl: '' }`.
        const tierTwoBystander = findFirstBystanderEntry(schemeSetData);
        if (tierTwoBystander !== null) {
          bystanderName = tierTwoBystander.name;
          bystanderImageUrl = tierTwoBystander.imageUrl;
        }
      }

      for (let bystanderIndex = 0; bystanderIndex < bystanderCount; bystanderIndex++) {
        const paddedIndex = String(bystanderIndex).padStart(2, '0');
        const bystanderExtId = `bystander-villain-deck-${paddedIndex}` as CardExtId;
        // why: per-copy fresh object literal — no aliasing across keys.
        result[bystanderExtId] = {
          extId: bystanderExtId,
          name: bystanderName,
          imageUrl: bystanderImageUrl,
          cost: null,
        };
      }
    }
  }

  // --- 8. Well-Known Generic Cards (D-17301) ---
  // why: D-17301 — terminal augmentation pass — ensures well-known
  // ext_ids always resolve. Extends the WP-172 / D-17201 tiered display
  // resolution pattern to the six generic game-component ext_ids that
  // exist independent of any match composition (the four pile tokens
  // exported from `pilesInit.ts` + the two starting cards from
  // `buildInitialGameState.ts`). Production symptom (2026-05-23 match
  // `WT_9sGMLmdG`): the RevealOverlay popup surfaced `<unknown>` for
  // `pile-bystander` (captured-from-supply, ending in the victory pile)
  // and the hand row surfaced `<unknown>` for `starting-shield-trooper`.
  //
  // Section 8 is the LAST logical pass in this builder — it covers cards
  // that aren't part of any match-configuration-driven composition, so
  // it has no shared state with prior sections and must sit immediately
  // before `return result;` to preserve the "always-applied augmentation"
  // semantic. Re-ordering would silently change its role to "one of
  // many builder steps" which would invite mis-classification.
  //
  // why: the six ext_id literal strings below are INLINED rather than
  // imported from their source-of-truth (`pilesInit.ts:22/25/28/31` +
  // `buildInitialGameState.ts:74/77`). `buildInitialGameState.ts`
  // imports `buildCardDisplayData`, so a reverse value import would
  // form a true ESM circular import path — tolerated for value-only
  // cycles in lazy contexts but brittle and a layering smell. Drift
  // detection lives in `buildCardDisplayData.test.ts`: it imports the
  // six constants from the source modules (test file is a different
  // module — no cycle) and asserts `result[CONSTANT]` matches each
  // inlined literal below.
  const coreSetData = registry.getSet('core');
  // why: `ssw1` is the ONLY set carrying a `cardType === 'sidekick'`
  // entry in `other[]` as of 2026-05-23 (verified against
  // `data/cards/ssw1.json:2356-2362`). Single call site keeps Rule §16.1
  // (no premature abstraction). Future-proofing: if a later set
  // introduces a second sidekick entry, a separate WP must explicitly
  // broaden this lookup (e.g. a tiered cross-set fallback mirroring the
  // D-17201 pattern for Master Strike + Scheme Twist); silent widening
  // is forbidden.
  const ssw1SetData = registry.getSet('ssw1');

  // pile-bystander
  let wellKnownBystanderName = 'Bystander';
  let wellKnownBystanderImageUrl = '';
  const wellKnownBystanderEntry = findBystanderArrayEntry(coreSetData, 'bystander');
  if (wellKnownBystanderEntry !== null) {
    wellKnownBystanderName = wellKnownBystanderEntry.name;
    wellKnownBystanderImageUrl = wellKnownBystanderEntry.imageUrl;
  }
  result['pile-bystander' as CardExtId] = {
    extId: 'pile-bystander' as CardExtId,
    name: wellKnownBystanderName,
    imageUrl: wellKnownBystanderImageUrl,
    cost: null,
  };

  // pile-wound
  let wellKnownWoundName = 'Wound';
  let wellKnownWoundImageUrl = '';
  const wellKnownWoundEntry = findWoundArrayEntry(coreSetData);
  if (wellKnownWoundEntry !== null) {
    wellKnownWoundName = wellKnownWoundEntry.name;
    wellKnownWoundImageUrl = wellKnownWoundEntry.imageUrl;
  }
  result['pile-wound' as CardExtId] = {
    extId: 'pile-wound' as CardExtId,
    name: wellKnownWoundName,
    imageUrl: wellKnownWoundImageUrl,
    cost: null,
  };

  // pile-shield-officer
  // why: `cost: null` for SHIELD Officer — printed-cost surface only;
  // gameplay cost resolved elsewhere. `UICardDisplay.cost` is the
  // printed card cost, and the SHIELD Officer pile token has no printed
  // cost on its physical face. Officer's recruit-cost-3 lives in
  // `G.cardStats[SHIELD_OFFICER_EXT_ID]` (`buildInitialGameState.ts:293`),
  // a separate sibling-snapshot surface read by the supply-pile UI.
  let wellKnownOfficerName = 'S.H.I.E.L.D. Officer';
  let wellKnownOfficerImageUrl = '';
  const wellKnownOfficerEntry = findHeroByExactSlug(coreSetData, 'officer');
  if (wellKnownOfficerEntry !== null) {
    wellKnownOfficerName = wellKnownOfficerEntry.name;
    wellKnownOfficerImageUrl = wellKnownOfficerEntry.imageUrl;
  }
  result['pile-shield-officer' as CardExtId] = {
    extId: 'pile-shield-officer' as CardExtId,
    name: wellKnownOfficerName,
    imageUrl: wellKnownOfficerImageUrl,
    cost: null,
  };

  // pile-sidekick
  let wellKnownSidekickName = 'Sidekick';
  let wellKnownSidekickImageUrl = '';
  const wellKnownSidekickEntry = findOtherEntryByCardType(ssw1SetData, 'sidekick');
  if (wellKnownSidekickEntry !== null) {
    wellKnownSidekickName = wellKnownSidekickEntry.name;
    wellKnownSidekickImageUrl = wellKnownSidekickEntry.imageUrl;
  }
  result['pile-sidekick' as CardExtId] = {
    extId: 'pile-sidekick' as CardExtId,
    name: wellKnownSidekickName,
    imageUrl: wellKnownSidekickImageUrl,
    cost: null,
  };

  // starting-shield-agent
  let wellKnownAgentName = 'S.H.I.E.L.D. Agent';
  let wellKnownAgentImageUrl = '';
  const wellKnownAgentEntry = findHeroByExactSlug(coreSetData, 'agent');
  if (wellKnownAgentEntry !== null) {
    wellKnownAgentName = wellKnownAgentEntry.name;
    wellKnownAgentImageUrl = wellKnownAgentEntry.imageUrl;
  }
  result['starting-shield-agent' as CardExtId] = {
    extId: 'starting-shield-agent' as CardExtId,
    name: wellKnownAgentName,
    imageUrl: wellKnownAgentImageUrl,
    cost: null,
  };

  // starting-shield-trooper
  let wellKnownTrooperName = 'S.H.I.E.L.D. Trooper';
  let wellKnownTrooperImageUrl = '';
  const wellKnownTrooperEntry = findHeroByExactSlug(coreSetData, 'trooper');
  if (wellKnownTrooperEntry !== null) {
    wellKnownTrooperName = wellKnownTrooperEntry.name;
    wellKnownTrooperImageUrl = wellKnownTrooperEntry.imageUrl;
  }
  result['starting-shield-trooper' as CardExtId] = {
    extId: 'starting-shield-trooper' as CardExtId,
    name: wellKnownTrooperName,
    imageUrl: wellKnownTrooperImageUrl,
    cost: null,
  };

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

// ---------------------------------------------------------------------------
// WP-172 helpers — per-set `other[]` and `bystanders[]` defensive readers
// ---------------------------------------------------------------------------

// why: `SetDataSchema.other` and `SetDataSchema.bystanders` are both
// `z.array(z.unknown())` in the registry (verified at
// `packages/registry/src/schema.ts:334–336`); values pass through
// verbatim and must be read defensively. Every iteration gates on
// `typeof entry === 'object' && entry !== null` first, then reads
// `cardType` / `slug` / `name` / `imageUrl` with `typeof === 'string'`
// guards. The §C defensive parsing test asserts that null / primitive /
// missing-field entries are silently skipped.

/**
 * Display payload extracted from a per-set `other[]` entry (used by
 * sections 5 + 6 for Master Strike + Scheme Twist art resolution).
 */
interface OtherEntryDisplay {
  /** Display name preserved verbatim from the registry. */
  name: string;
  /** Full image URL preserved verbatim from the registry. */
  imageUrl: string;
}

/**
 * Finds the first entry in `setData.other[]` whose `cardType` field
 * matches the supplied value AND carries well-formed string `name` and
 * `imageUrl` fields.
 *
 * Used by section 5 (`cardType === 'mastermind-strike'`) and section 6
 * (`cardType === 'scheme-twist'`) under the D-17201 tiered-lookup
 * pattern (tier-1 source set; tier-2 `core` set; tier-3 literal
 * fallback handled by caller).
 *
 * Returns null when the set is not loaded, `other[]` is absent or not
 * an array, or no well-formed matching entry exists. Malformed entries
 * (null, primitives, missing string fields) are silently skipped per
 * the §C defensive parsing test.
 */
function findOtherEntryByCardType(
  setData: unknown,
  cardType: string,
): OtherEntryDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { other?: unknown };
  if (!Array.isArray(candidate.other)) return null;

  for (const entry of candidate.other) {
    if (!entry || typeof entry !== 'object') continue;
    const otherEntry = entry as Record<string, unknown>;
    if (otherEntry.cardType !== cardType) continue;
    if (typeof otherEntry.name !== 'string') continue;
    if (typeof otherEntry.imageUrl !== 'string') continue;
    return { name: otherEntry.name, imageUrl: otherEntry.imageUrl };
  }
  return null;
}

/**
 * Display payload extracted from a per-set `bystanders[]` entry (used
 * by section 7 for villain-deck bystander art resolution).
 */
interface BystanderEntryDisplay {
  /** Display name preserved verbatim from the registry. */
  name: string;
  /** Full image URL preserved verbatim from the registry. */
  imageUrl: string;
}

/**
 * Finds the first entry in `setData.bystanders[]` whose `slug` field
 * equals the canonical generic-bystander literal `'bystander'` AND
 * carries well-formed string `name` and `imageUrl` fields. The
 * slug-match must beat positional `bystanders[0]` because msp1 / vill /
 * wtif / wpnx carry the generic entry mixed with named characters at
 * non-zero positions.
 *
 * Returns null when no slug-match exists; the caller falls through to
 * the tier-2 positional fallback (`findFirstBystanderEntry`).
 */
function findGenericBystanderEntry(
  setData: unknown,
): BystanderEntryDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { bystanders?: unknown };
  if (!Array.isArray(candidate.bystanders)) return null;

  for (const entry of candidate.bystanders) {
    if (!entry || typeof entry !== 'object') continue;
    const bystanderEntry = entry as Record<string, unknown>;
    if (bystanderEntry.slug !== 'bystander') continue;
    if (typeof bystanderEntry.name !== 'string') continue;
    if (typeof bystanderEntry.imageUrl !== 'string') continue;
    return {
      name: bystanderEntry.name,
      imageUrl: bystanderEntry.imageUrl,
    };
  }
  return null;
}

/**
 * Finds the first well-formed entry in `setData.bystanders[]` (tier-2
 * acknowledged-imperfect named-character fallback for section 7).
 *
 * The first entry that carries both string `name` and `imageUrl` is
 * returned. Returns null when `bystanders[]` is absent / empty / all
 * malformed; the caller falls through to the tier-3 literal
 * `{ name: 'Bystander', imageUrl: '' }`.
 */
function findFirstBystanderEntry(
  setData: unknown,
): BystanderEntryDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { bystanders?: unknown };
  if (!Array.isArray(candidate.bystanders)) return null;

  for (const entry of candidate.bystanders) {
    if (!entry || typeof entry !== 'object') continue;
    const bystanderEntry = entry as Record<string, unknown>;
    if (typeof bystanderEntry.name !== 'string') continue;
    if (typeof bystanderEntry.imageUrl !== 'string') continue;
    return {
      name: bystanderEntry.name,
      imageUrl: bystanderEntry.imageUrl,
    };
  }
  return null;
}

/**
 * Scheme metadata read from a per-set `schemes[]` entry for sections
 * 6 + 7.
 */
interface SchemeForDisplay {
  /** Scheme slug used to build the scheme-twist ext_id grammar. */
  slug: string;
  /**
   * Optional twist count override. Absent ⇒ use the engine default
   * literal `8` (D-1411 fallback, mirrors `villainDeck.setup.ts:124`).
   */
  villainDeckTwistCount?: number;
  /**
   * Optional villain-deck bystander count override. Absent ⇒ use the
   * `numPlayers` parameter (D-1412 fallback, mirrors
   * `villainDeck.setup.ts:262`).
   */
  villainDeckBystanderCount?: number;
}

/**
 * Finds a scheme entry within the named set's `schemes[]` by slug.
 *
 * Returns null when the set is not loaded, `schemes[]` is absent or
 * not an array, the slug is not present, or the entry shape is
 * malformed. Optional `villainDeckTwistCount` /
 * `villainDeckBystanderCount` are passed through when present and a
 * `number`; absent fields surface as `undefined` so the caller can
 * apply the engine default.
 */
function findSchemeInSetForDisplay(
  setData: unknown,
  schemeSlug: string,
): SchemeForDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { schemes?: unknown };
  if (!Array.isArray(candidate.schemes)) return null;

  for (const entry of candidate.schemes) {
    if (!entry || typeof entry !== 'object') continue;
    const schemeEntry = entry as Record<string, unknown>;
    if (schemeEntry.slug !== schemeSlug) continue;

    const result: SchemeForDisplay = { slug: schemeEntry.slug };
    if (typeof schemeEntry.villainDeckTwistCount === 'number') {
      result.villainDeckTwistCount = schemeEntry.villainDeckTwistCount;
    }
    if (typeof schemeEntry.villainDeckBystanderCount === 'number') {
      result.villainDeckBystanderCount = schemeEntry.villainDeckBystanderCount;
    }
    return result;
  }
  return null;
}

// ---------------------------------------------------------------------------
// WP-173 helpers — well-known generic ext_id defensive readers (D-17301)
// ---------------------------------------------------------------------------

// why: SetDataSchema.heroes / .bystanders / .wounds are read defensively
// in this WP because Section 8 emissions are an augmentation layer over
// data that may be partially or fully absent in narrow test mocks. The
// three helpers below mirror the WP-172 `findOtherEntryByCardType` /
// `findGenericBystanderEntry` defensive-read pattern: gate on
// `typeof entry === 'object' && entry !== null`, then read fields with
// `typeof === 'string'` guards. The §C defensive parsing test asserts
// that null / primitive / wrong-type entries are silently skipped (only
// `Game.setup()` may throw — these helpers must soft-skip).

/**
 * Hero display payload extracted from a `setData.heroes[]` entry by
 * exact slug match (used by Section 8 for SHIELD Agent / Trooper /
 * Officer well-known ext_id resolution).
 */
interface HeroByExactSlugDisplay {
  /** Canonical face name read from `heroes[i].cards[0].name`. */
  name: string;
  /** Canonical image URL read from `heroes[i].physicalCards[0].imageUrl`. */
  imageUrl: string;
}

/**
 * Finds a hero in `setData.heroes[]` whose `slug` matches exactly and
 * returns the canonical face name + image URL.
 *
 * Name is read from `cards[0].name`; imageUrl is read from
 * `physicalCards[0].imageUrl` (the D-14102 canonical-face source per
 * the existing section-1b walk). All field reads gate with
 * `typeof === 'string'` guards before use.
 *
 * Returns null when the set is not loaded, `heroes[]` is absent or not
 * an array, no slug match exists, or the matching entry's `cards[0]` /
 * `physicalCards[0]` does not carry both required string fields.
 * Malformed entries (null, primitive, wrong-type fields) are silently
 * skipped — defensive read of registry data (unknown shape per
 * ARCHITECTURE.md); only `Game.setup()` may throw.
 *
 * Distinct from `findHeroEntryForDisplay` (the existing section-1b
 * helper, which returns the whole `DisplayDataHeroEntry` for the
 * per-copy physicalCards walk). This helper returns only `name` +
 * `imageUrl` for the Section 8 well-known ext_id emission — different
 * call site, different return shape, kept separate per Rule §16.1.
 *
 * @param setData - Per-set data object from the registry (unknown shape).
 * @param heroSlug - The hero slug to match exactly (`'agent'` /
 *   `'trooper'` / `'officer'` for the WP-173 well-known SHIELD ext_ids).
 * @returns Hero display payload, or null on lookup / parse failure.
 */
function findHeroByExactSlug(
  setData: unknown,
  heroSlug: string,
): HeroByExactSlugDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { heroes?: unknown };
  if (!Array.isArray(candidate.heroes)) return null;

  for (const entry of candidate.heroes) {
    if (!entry || typeof entry !== 'object') continue;
    const heroEntry = entry as Record<string, unknown>;
    if (heroEntry.slug !== heroSlug) continue;

    if (!Array.isArray(heroEntry.cards)) continue;
    const firstCard = heroEntry.cards[0];
    if (!firstCard || typeof firstCard !== 'object') continue;
    const cardCandidate = firstCard as Record<string, unknown>;
    if (typeof cardCandidate.name !== 'string') continue;

    if (!Array.isArray(heroEntry.physicalCards)) continue;
    const firstPhysical = heroEntry.physicalCards[0];
    if (!firstPhysical || typeof firstPhysical !== 'object') continue;
    const physicalCandidate = firstPhysical as Record<string, unknown>;
    if (typeof physicalCandidate.imageUrl !== 'string') continue;

    return {
      name: cardCandidate.name,
      imageUrl: physicalCandidate.imageUrl,
    };
  }
  return null;
}

/**
 * Bystander display payload extracted from a `setData.bystanders[]`
 * entry by exact slug match (used by Section 8 for the `pile-bystander`
 * well-known ext_id resolution).
 */
interface BystanderArrayEntryDisplay {
  /** Display name preserved verbatim from the registry. */
  name: string;
  /** Full image URL preserved verbatim from the registry. */
  imageUrl: string;
}

/**
 * Finds the first entry in `setData.bystanders[]` whose `slug` field
 * matches the supplied value exactly AND carries well-formed string
 * `name` and `imageUrl` fields.
 *
 * Used by Section 8 for `pile-bystander` (target slug `'bystander'`).
 *
 * Returns null when the set is not loaded, `bystanders[]` is absent or
 * not an array, no slug match exists, or the matching entry lacks the
 * required string fields. Malformed entries are silently skipped —
 * defensive read of registry data (unknown shape per ARCHITECTURE.md);
 * only `Game.setup()` may throw.
 *
 * Kept distinct from the WP-172 `findGenericBystanderEntry` (which
 * hard-codes `slug === 'bystander'`) per Rule §16.1 — two-call-site
 * duplication is preferred over a parameterized merge that would
 * obscure the section-7 vs section-8 call sites' different fallback
 * semantics. Section 7's bystander resolution has a tier-2 positional
 * fallback (`findFirstBystanderEntry`) reflecting per-scheme bystander
 * identity; Section 8's `pile-bystander` is the generic supply-pile
 * token and falls back to a tier-2 literal only.
 *
 * @param setData - Per-set data object from the registry (unknown shape).
 * @param targetSlug - The bystander slug to match exactly.
 * @returns Bystander display payload, or null on lookup / parse failure.
 */
function findBystanderArrayEntry(
  setData: unknown,
  targetSlug: string,
): BystanderArrayEntryDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { bystanders?: unknown };
  if (!Array.isArray(candidate.bystanders)) return null;

  for (const entry of candidate.bystanders) {
    if (!entry || typeof entry !== 'object') continue;
    const bystanderEntry = entry as Record<string, unknown>;
    if (bystanderEntry.slug !== targetSlug) continue;
    if (typeof bystanderEntry.name !== 'string') continue;
    if (typeof bystanderEntry.imageUrl !== 'string') continue;
    return {
      name: bystanderEntry.name,
      imageUrl: bystanderEntry.imageUrl,
    };
  }
  return null;
}

/**
 * Wound display payload extracted from a `setData.wounds[]` entry
 * (used by Section 8 for the `pile-wound` well-known ext_id resolution).
 */
interface WoundArrayEntryDisplay {
  /** Display name preserved verbatim from the registry. */
  name: string;
  /** Full image URL preserved verbatim from the registry. */
  imageUrl: string;
}

/**
 * Finds the first entry in `setData.wounds[]` whose `slug` field equals
 * the canonical wound literal `'wound'` AND carries well-formed string
 * `name` and `imageUrl` fields.
 *
 * Single call site (Section 8 / `pile-wound`); the literal `'wound'` is
 * inlined per Rule §16.1 — parameterization would imply other wound
 * slugs exist, which they do not in any of the 40 registered sets as
 * of 2026-05-23.
 *
 * Returns null when the set is not loaded, `wounds[]` is absent or not
 * an array, no slug match exists, or the matching entry lacks the
 * required string fields. Malformed entries are silently skipped —
 * defensive read of registry data (unknown shape per ARCHITECTURE.md);
 * only `Game.setup()` may throw.
 *
 * @param setData - Per-set data object from the registry (unknown shape).
 * @returns Wound display payload, or null on lookup / parse failure.
 */
function findWoundArrayEntry(
  setData: unknown,
): WoundArrayEntryDisplay | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { wounds?: unknown };
  if (!Array.isArray(candidate.wounds)) return null;

  for (const entry of candidate.wounds) {
    if (!entry || typeof entry !== 'object') continue;
    const woundEntry = entry as Record<string, unknown>;
    if (woundEntry.slug !== 'wound') continue;
    if (typeof woundEntry.name !== 'string') continue;
    if (typeof woundEntry.imageUrl !== 'string') continue;
    return {
      name: woundEntry.name,
      imageUrl: woundEntry.imageUrl,
    };
  }
  return null;
}
