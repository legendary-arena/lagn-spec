/**
 * Villain deck construction for the Legendary Arena game engine.
 *
 * buildVillainDeck resolves cards from the registry at setup time and
 * produces a shuffled villain deck with type classifications. This is
 * the only point where registry data enters the villain deck subsystem —
 * moves operate solely on G.villainDeck and G.villainDeckCardTypes.
 *
 * Per WP-113 / D-10014, all four entity-ID inputs (villainGroupIds,
 * henchmanGroupIds, schemeId, mastermindId) are set-qualified
 * `<setAbbr>/<slug>` strings. Builders parse the qualified form, then
 * iterate ONLY the named set's data — no cross-set fallback exists.
 *
 * No @legendary-arena/registry imports. No array-reduce in deck assembly
 * (00.6 Rule 7). Setup-time only.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { RevealedCardType, VillainDeckState } from './villainDeck.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { SetupContext } from '../types.js';
import { shuffleDeck } from '../setup/shuffle.js';

// ---------------------------------------------------------------------------
// VillainDeckRegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: game-engine must not import @legendary-arena/registry; this interface
// is satisfied structurally by CardRegistry. It exposes the minimum methods
// needed for villain deck construction.

/**
 * Minimal structural type for a flat card returned by listCards().
 * Matches a subset of FlatCard from the registry package.
 */
export interface VillainDeckFlatCard {
  /** Unique key in format {setAbbr}-{cardType}-{groupSlug}-{cardSlug}. */
  key: string;
  /** Coarse card type: "hero", "mastermind", "villain", or "scheme". */
  cardType: string;
  /** Card-level slug within its parent entity. */
  slug: string;
  /** Set abbreviation (e.g., "core", "2099"). */
  setAbbr: string;
}

/**
 * Minimal structural type for a henchman group entry in SetData.
 * SetData.henchmen is z.array(z.unknown()); we validate structurally.
 */
interface HenchmanGroupEntry {
  slug: string;
}

/**
 * Minimal structural type for a single villain card within a group.
 *
 * `copies` (WP-167 / D-16701) is the number of identical copies of this
 * card in the villain deck; absent means a single instance.
 */
interface VillainCardEntry {
  slug: string;
  copies?: number;
}

/**
 * Minimal structural type for a villain group entry in SetData.
 */
interface VillainGroupEntry {
  slug: string;
  cards: VillainCardEntry[];
}

/**
 * Minimal structural type for a scheme entry in SetData.
 *
 * `villainDeckTwistCount` / `villainDeckBystanderCount` (WP-167) drive the
 * scheme-twist and villain-deck-bystander counts; absent means the engine
 * default applies (see SCHEME_TWIST_COUNT and context.ctx.numPlayers).
 */
interface SchemeEntry {
  slug: string;
  villainDeckTwistCount?: number;
  villainDeckBystanderCount?: number;
}

/**
 * Minimal structural type for set data returned by getSet().
 * Only the fields needed for villain deck construction are included.
 */
interface SetDataSubset {
  abbr: string;
  henchmen: unknown[];
  villains: VillainGroupEntry[];
  schemes: SchemeEntry[];
}

/**
 * Setup-time registry interface for villain deck construction.
 *
 * Satisfied structurally by the real CardRegistry from the registry
 * package. Defined locally to respect the layer boundary.
 */
export interface VillainDeckRegistryReader {
  /** All flat cards across all loaded sets. */
  listCards(): VillainDeckFlatCard[];
  /** All loaded set index entries. */
  listSets(): Array<{ abbr: string }>;
  /** Full set data for one set. */
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// Count constants (MVP base rules)
// ---------------------------------------------------------------------------

// why: standard Legendary base rule (MVP); see D-1412.
// These are rule invariants, not tuning knobs.

/** Number of identical copies per henchman group in the villain deck. */
const HENCHMAN_COPIES_PER_GROUP = 10;

/** Default scheme twist count when the scheme omits villainDeckTwistCount. */
const SCHEME_TWIST_COUNT = 8;

// why: standard Marvel Legendary core rule — exactly 5 generic Master Strikes
// are shuffled into the villain deck (D-16801). This is a rule invariant, not
// a tuning knob, and carries no mastermind identity.
/** Number of generic Master Strikes added to the villain deck. */
const MASTER_STRIKE_COUNT = 5;

// Bystander count = scheme villainDeckBystanderCount, else context.ctx.numPlayers

// ---------------------------------------------------------------------------
// buildVillainDeck
// ---------------------------------------------------------------------------

/**
 * Result of building the villain deck at setup time.
 */
export interface BuildVillainDeckResult {
  /** The villain deck state (shuffled deck + empty discard). */
  state: VillainDeckState;
  /** Card type classification for every card in the deck. */
  cardTypes: Record<CardExtId, RevealedCardType>;
}

/**
 * Builds the villain deck from registry data at setup time.
 *
 * Instances villain copies, generates virtual henchman/scheme-twist/bystander
 * cards, adds generic Master Strikes, sorts lexically, shuffles the combined
 * deck, and returns the deck state with type classifications.
 *
 * @param config - The match setup config providing entity IDs.
 * @param registry - Setup-time registry reader. Accepts unknown to support
 *   narrow test mocks (CardRegistryReader). If the registry does not satisfy
 *   VillainDeckRegistryReader structurally (missing listSets/getSet/full
 *   listCards), returns an empty deck gracefully.
 * @param context - Setup context providing numPlayers and random.Shuffle.
 * @returns The villain deck state and card type classifications.
 */
export function buildVillainDeck(
  config: MatchSetupConfig,
  registry: unknown,
  context: SetupContext,
): BuildVillainDeckResult {
  // why: narrow test mocks (CardRegistryReader) only have listCards() returning
  // { key: string }[]. We check for the full VillainDeckRegistryReader interface
  // at runtime. If the registry doesn't have the required methods, we return
  // an empty deck — the reveal pipeline handles this gracefully (WP-014A).
  if (!isVillainDeckRegistryReader(registry)) {
    return { state: { deck: [], discard: [] }, cardTypes: {} };
  }
  const deck: CardExtId[] = [];
  const cardTypes: Record<CardExtId, RevealedCardType> = {};

  // --- 1. Villain cards (from getSet — copies live in per-set card data) ---
  // why: D-10014 — Builder Filtering Order — iterate named set only.
  // Each villainGroupIds entry is `<setAbbr>/<groupSlug>`. We resolve the
  // group through getSet(setAbbr) (not listCards) because the FlatCard key
  // carries no copy count; copies live on the per-set villain card data.
  //
  // Soft-skip on missing data per the validator-is-authoritative model:
  // when validateMatchSetup passes, the data IS present; when tests bypass
  // the validator with empty mocks, the builder produces an empty deck
  // (defense-in-depth). The validator emits format and existence errors with
  // full remediation guidance; the builder never duplicates that.
  for (const villainGroupId of config.villainGroupIds) {
    const parsed = parseQualifiedId(villainGroupId);
    if (parsed === null) continue;
    const groupCards = findVillainGroupCards(registry, parsed.setAbbr, parsed.slug);
    if (groupCards === null) continue;

    for (const card of groupCards) {
      if (typeof card.slug !== 'string') continue;
      // why: the shared emitter is the single source of villain instance
      // ext_ids — the deck builder and every per-card lookup builder
      // (cardStats §2, cardKeywords, villainAbilityHooks) call it so their
      // keys can never drift from the zone-instance grammar (D-18704 /
      // D-18706; import-not-duplicate per the D-13702 RS-4 precedent).
      const instanceExtIds = villainCardInstanceExtIds(
        parsed.setAbbr,
        parsed.slug,
        card.slug,
        card,
      );
      for (const extId of instanceExtIds) {
        deck.push(extId);
        cardTypes[extId] = 'villain';
      }
    }
  }

  // --- 2. Henchman virtual cards (from getSet — not in FlatCard) ---
  // why: D-10014 — Builder Filtering Order — iterate named set only.
  // config.henchmanGroupIds values are `<setAbbr>/<groupSlug>`; the helper
  // constrains the henchmen[] iteration to the named set. Soft-skip on
  // missing data — validator is the authoritative format/existence reporter.
  for (const henchmanGroupId of config.henchmanGroupIds) {
    const parsed = parseQualifiedId(henchmanGroupId);
    if (parsed === null) continue;
    const groupSlug = findHenchmanGroupSlug(registry, parsed.setAbbr, parsed.slug);
    if (groupSlug === null) continue;

    for (let copyIndex = 0; copyIndex < HENCHMAN_COPIES_PER_GROUP; copyIndex++) {
      const paddedIndex = String(copyIndex).padStart(2, '0');
      const extId = `henchman-${groupSlug}-${paddedIndex}` as CardExtId;
      deck.push(extId);
      cardTypes[extId] = 'henchman';
    }
  }

  // Resolve the scheme once; sections 3 and 4 read its counts.
  // why: D-10014 — Builder Filtering Order — iterate named set only.
  // Soft-skip on missing data per the validator-is-authoritative model.
  const parsedScheme = parseQualifiedId(config.schemeId);
  const scheme =
    parsedScheme === null
      ? null
      : findSchemeInSet(registry, parsedScheme.setAbbr, parsedScheme.slug);

  // --- 3. Scheme twist virtual cards ---
  if (scheme !== null) {
    // why: the twist count comes from the scheme's villainDeckTwistCount; the
    // SCHEME_TWIST_COUNT default applies only when the scheme omits the field.
    const twistFromScheme = readSchemeTwistCount(scheme);
    const twistCount = twistFromScheme === null ? SCHEME_TWIST_COUNT : twistFromScheme;

    for (let twistIndex = 0; twistIndex < twistCount; twistIndex++) {
      const paddedIndex = String(twistIndex).padStart(2, '0');
      const extId = `scheme-twist-${scheme.slug}-${paddedIndex}` as CardExtId;
      deck.push(extId);
      cardTypes[extId] = 'scheme-twist';
    }
  }

  // --- 4. Bystander virtual cards ---
  // why: bystander-villain-deck-{index} format chosen for consistency with
  // henchman and scheme twist patterns. Enables replay targeting of individual
  // bystander reveal events. The count comes from the scheme's
  // villainDeckBystanderCount; the numPlayers default applies only when the
  // scheme omits the field (or no scheme resolved). This is separate from
  // config.bystandersCount which sizes the bystander pile (supply).
  const bystanderFromScheme = scheme === null ? null : readSchemeBystanderCount(scheme);
  const bystanderCount =
    bystanderFromScheme === null ? context.ctx.numPlayers : bystanderFromScheme;

  for (let bystanderIndex = 0; bystanderIndex < bystanderCount; bystanderIndex++) {
    const paddedIndex = String(bystanderIndex).padStart(2, '0');
    const extId = `bystander-villain-deck-${paddedIndex}` as CardExtId;
    deck.push(extId);
    cardTypes[extId] = 'bystander';
  }

  // --- 5. Master Strikes (generic virtual instanced cards) ---
  // why: the villain deck contains MASTER_STRIKE_COUNT generic Master Strikes
  // (D-16801). They carry no mastermind identity in their ext_id; the
  // mastermind's own cards are no longer added to the villain deck. Index is
  // zero-based and zero-padded to two digits, matching the henchman / twist /
  // bystander instancing grammar so every instanced ext_id shares one form.
  for (let strikeIndex = 0; strikeIndex < MASTER_STRIKE_COUNT; strikeIndex++) {
    const paddedIndex = String(strikeIndex).padStart(2, '0');
    const extId = `master-strike-${paddedIndex}` as CardExtId;
    deck.push(extId);
    cardTypes[extId] = 'mastermind-strike';
  }

  // --- 6. Sort lexically for deterministic pre-shuffle ordering ---
  // why: registry list ordering may vary depending on load order. Stable
  // pre-shuffle ordering ensures the same inputs always generate the same
  // pre-shuffle sequence, making shuffleDeck fully deterministic.
  const sortedDeck = [...deck].sort();

  // --- 7. Shuffle ---
  // why: ctx.random.Shuffle provides deterministic shuffling seeded by the
  // framework PRNG via context.random, ensuring replay reproducibility.
  const shuffledDeck = shuffleDeck(sortedDeck, context);

  return {
    state: { deck: shuffledDeck, discard: [] },
    cardTypes,
  };
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for VillainDeckRegistryReader.
 *
 * Returns true if the registry object has the required methods (listCards
 * with full FlatCard shape, listSets, getSet). Narrow test mocks that only
 * implement CardRegistryReader will return false.
 */
// why: D-10014 — orchestration-side diagnostic detection seam. The
// orchestration layer (buildInitialGameState) imports this guard to detect
// registry-reader interface mismatches and emit G.messages diagnostics.
export function isVillainDeckRegistryReader(
  registry: unknown,
): registry is VillainDeckRegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;
  return (
    typeof candidate.listCards === 'function' &&
    typeof candidate.listSets === 'function' &&
    typeof candidate.getSet === 'function'
  );
}

/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on any malformed input — empty string, missing slash,
 * multiple slashes, empty parts, or leading/trailing whitespace. Builders
 * throw on null parse results; the validator emits a structured error.
 *
 * Locally duplicated per WP-113 §6 step 1 — `// why: import or duplicate
 * locally — author choice`. The same parser logic lives in
 * `matchSetup.validate.ts` and the four builders that consume qualified
 * IDs. Keeping these copies byte-identical is enforced by tests.
 */
// why: D-10014 — duplicated locally to avoid a circular import between
// builders and matchSetup.validate.ts. The validator imports the four
// Class A/B helpers + guards from the builders; the builders cannot
// reciprocally import from the validator.
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

/**
 * Finds the villain cards for one group within the named set's villains[].
 *
 * Returns null if the named set is not loaded or the group slug is not
 * present in it — no cross-set fallback exists. The validator emits
 * actionable errors upfront; this helper soft-skips so test paths bypassing
 * the validator can produce empty decks rather than throwing.
 */
// why: D-10014 — Builder Filtering Order — iterate named set only.
function findVillainGroupCards(
  registry: VillainDeckRegistryReader,
  setAbbr: string,
  villainGroupSlug: string,
): VillainCardEntry[] | null {
  const setData = registry.getSet(setAbbr) as SetDataSubset | undefined;
  if (!setData || !Array.isArray(setData.villains)) return null;

  for (const group of setData.villains) {
    if (typeof group.slug !== 'string') continue;
    if (group.slug !== villainGroupSlug) continue;
    if (!Array.isArray(group.cards)) return null;
    return group.cards;
  }

  return null;
}

/**
 * Reads a villain card's copy count, defaulting to 1 when absent.
 *
 * @param card - Any villain-card-shaped object; only the optional `copies`
 *   field is read, so the per-card lookup builders can pass their own
 *   structural card types.
 * @returns The declared copy count (>= 1), or 1 when `copies` is absent.
 */
// why: a villain card with no `copies` field is a single-instance card
// (D-16802 / D-16701 default). Returning 1 keeps the section-1 loop uniform
// whether or not the card declares a copy count. Exported as the single
// copy-count resolver so the lookup builders import it rather than
// re-implementing the default rule locally (D-13702 RS-4 — divergent copy
// counts across sites are exactly the silent lookup-miss class this WP fixes).
export function readVillainCopyCount(card: { copies?: number }): number {
  if (typeof card.copies === 'number' && card.copies >= 1) {
    return card.copies;
  }
  return 1;
}

/**
 * Returns the copy-indexed instance ext_ids for one villain card.
 *
 * The returned ids are the exact strings the card carries in `G` zones
 * (deck, City, etc.): `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` where
 * NN is the zero-padded two-digit copy index from `00` to `copies - 1`.
 *
 * Pure and copyIndex-ascending: it performs no sorting and is safe to call
 * repeatedly. Consumers (the deck builder and the cardStats / cardKeywords /
 * villainAbilityHooks builders) use the returned array order directly.
 *
 * @param setAbbr - Set abbreviation (e.g., "core").
 * @param groupSlug - Villain group slug (e.g., "brotherhood").
 * @param cardSlug - Villain card slug within the group (e.g., "magneto").
 * @param card - The villain card object; only its `copies` field is read.
 * @returns Copy-indexed instance ext_ids in ascending copy order.
 */
// why: villain per-card lookups must fan out one entry per copy to match the
// zone-instance grammar the deck builder emits (D-18704). Before WP-191 the
// lookup builders keyed villains by the single definition id while zones were
// copy-indexed, so every villain fightCost / Ambush / Fight lookup silently
// missed. Centralizing emission here (consumed by the deck builder AND the
// lookup builders) mirrors the henchman per-copy fan-out that already works
// and guarantees the keys agree by construction (D-18706; D-16802 per-copy
// attributability preserved — zones remain the source of truth).
export function villainCardInstanceExtIds(
  setAbbr: string,
  groupSlug: string,
  cardSlug: string,
  card: { copies?: number },
): CardExtId[] {
  const copyCount = readVillainCopyCount(card);
  const instanceExtIds: CardExtId[] = [];
  for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
    const paddedIndex = String(copyIndex).padStart(2, '0');
    instanceExtIds.push(
      `${setAbbr}-villain-${groupSlug}-${cardSlug}-${paddedIndex}` as CardExtId,
    );
  }
  return instanceExtIds;
}

/**
 * Extracts the villain group slug from a villain FlatCard.
 *
 * Key format: {setAbbr}-villain-{groupSlug}-{cardSlug}
 * We know setAbbr and cardSlug (card.slug), so groupSlug is the middle part.
 *
 * Promoted to a named export for WP-113 — the validator's
 * `buildKnownVillainGroupQualifiedIds` consumes this as the single source
 * of truth for villain-group-slug grammar (Class A: flat-card-key decoder).
 * Inventing a parallel decoder is contract drift per D-10014 Authority Lock.
 */
// why: D-10014 — single source of truth — flat-card-key decoder.
export function extractVillainGroupSlug(card: VillainDeckFlatCard): string {
  const prefix = `${card.setAbbr}-villain-`;
  const suffix = `-${card.slug}`;

  if (!card.key.startsWith(prefix) || !card.key.endsWith(suffix)) {
    return '';
  }

  return card.key.slice(prefix.length, card.key.length - suffix.length);
}

/**
 * Enumerates henchman-group slugs in a single set's data.
 *
 * Reads `setData.henchmen[].slug` defensively. Returns an empty array on
 * any malformed shape — never throws. Used by the validator's
 * `buildKnownHenchmanGroupQualifiedIds` (Class B: set-data slug
 * enumerator) as the single source of truth for henchman-group slug
 * semantics.
 */
// why: D-10014 — single source of truth — set-data slug enumerator.
export function listHenchmanGroupSlugsInSet(setData: unknown): string[] {
  if (!setData || typeof setData !== 'object') return [];
  const candidate = setData as { henchmen?: unknown };
  if (!Array.isArray(candidate.henchmen)) return [];

  const slugs: string[] = [];
  for (const entry of candidate.henchmen) {
    if (entry && typeof entry === 'object') {
      const henchman = entry as { slug?: unknown };
      if (typeof henchman.slug === 'string' && henchman.slug.length > 0) {
        slugs.push(henchman.slug);
      }
    }
  }
  return slugs;
}

/**
 * Finds a henchman group slug within the named set's henchmen[].
 *
 * Returns null if the named set is not loaded or the slug is not present
 * in it — no cross-set fallback exists. The validator emits actionable
 * errors upfront; this helper soft-skips so test paths bypassing the
 * validator can produce empty decks rather than throwing.
 */
// why: D-10014 — Builder Filtering Order — iterate named set only.
function findHenchmanGroupSlug(
  registry: VillainDeckRegistryReader,
  setAbbr: string,
  henchmanGroupSlug: string,
): string | null {
  const setData = registry.getSet(setAbbr) as SetDataSubset | undefined;
  if (!setData || !Array.isArray(setData.henchmen)) return null;

  for (const entry of setData.henchmen) {
    const henchman = entry as HenchmanGroupEntry;
    if (typeof henchman.slug !== 'string') continue;
    if (henchman.slug === henchmanGroupSlug) {
      return henchman.slug;
    }
  }

  return null;
}

/**
 * Finds a scheme entry within the named set's schemes[].
 *
 * Returns null if the named set is not loaded or the slug is not present
 * in it — no cross-set fallback exists. The returned entry carries the
 * optional villainDeckTwistCount / villainDeckBystanderCount counts.
 */
// why: D-10014 — Builder Filtering Order — iterate named set only.
function findSchemeInSet(
  registry: VillainDeckRegistryReader,
  setAbbr: string,
  schemeSlug: string,
): SchemeEntry | null {
  const setData = registry.getSet(setAbbr) as SetDataSubset | undefined;
  if (!setData || !Array.isArray(setData.schemes)) return null;

  for (const scheme of setData.schemes) {
    if (typeof scheme.slug !== 'string') continue;
    if (scheme.slug === schemeSlug) {
      return scheme;
    }
  }

  return null;
}

/**
 * Reads a scheme's villainDeckTwistCount, returning null when absent so the
 * caller applies the SCHEME_TWIST_COUNT default.
 */
function readSchemeTwistCount(scheme: SchemeEntry): number | null {
  if (typeof scheme.villainDeckTwistCount === 'number') {
    return scheme.villainDeckTwistCount;
  }
  return null;
}

/**
 * Reads a scheme's villainDeckBystanderCount, returning null when absent so
 * the caller falls back to context.ctx.numPlayers.
 */
function readSchemeBystanderCount(scheme: SchemeEntry): number | null {
  if (typeof scheme.villainDeckBystanderCount === 'number') {
    return scheme.villainDeckBystanderCount;
  }
  return null;
}
