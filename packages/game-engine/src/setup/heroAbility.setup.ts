/**
 * Hero ability hook builder for setup-time resolution.
 *
 * Resolves hero cards from the selected hero decks, extracts structured
 * ability metadata from markup patterns, and produces a list of
 * HeroAbilityHook entries stored in G.heroAbilityHooks.
 *
 * No boardgame.io imports. No .reduce(). No throws. Setup-time only.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type {
  HeroAbilityHook,
  HeroCondition,
  HeroEffectDescriptor,
} from '../rules/heroAbility.types.js';
import type { HeroKeyword, HeroAbilityTiming } from '../rules/heroKeywords.js';
import { HERO_KEYWORDS } from '../rules/heroKeywords.js';
import { normalizeTraitSlug } from '../state/traits.normalize.js';
// why: D-18705 / D-18706 — hero hooks must key by the canonical-face slash
// instance id (the id the played card carries in `G` zones), resolving
// ability text from the canonical face (sides[0]). The shared emitter is the
// single source of those instance ids (import-not-duplicate, D-13702 RS-4).
import { heroCardInstanceExtIds } from './buildHeroDeck.js';

// ---------------------------------------------------------------------------
// HeroAbilityRegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: game-engine must not import @legendary-arena/registry; this interface
// is satisfied structurally by CardRegistry. It exposes the minimum fields
// needed for hero ability hook resolution at setup time.

/**
 * Minimal structural type for a flat card with hero ability data.
 * Matches a subset of FlatCard from the registry package.
 */
export interface HeroAbilityFlatCard {
  /** Unique key in format {setAbbr}-{cardType}-{groupSlug}-{cardSlug}. */
  key: string;
  /** Coarse card type: "hero", "mastermind", "villain", or "scheme". */
  cardType: string;
  /** Set abbreviation (e.g., "core", "2099"). */
  setAbbr: string;
  /** Card ability text lines with structured markup. */
  abilities: string[];
}

/**
 * Setup-time registry interface for hero ability hook resolution.
 *
 * Satisfied structurally by the real CardRegistry. Defined locally to
 * respect the layer boundary (same pattern as CardStatsRegistryReader
 * in economy.logic.ts).
 */
export interface HeroAbilityRegistryReader {
  /** All flat cards across all loaded sets. */
  listCards(): HeroAbilityFlatCard[];
}

// why: hook resolution reads the per-card ability text and the canonical-face
// (sides[0]) mapping from the hero entry in set data — the same source the
// hero deck reservoir and buildCardStats §1b read. The local structural
// interfaces respect the layer boundary (no @legendary-arena/registry import).

/**
 * Minimal structural type for one hero card entry in SetData.heroes[i].cards[j].
 *
 * `slug` is matched against the canonical-face slug (`physicalCards[].sides[0]`)
 * to resolve the ability text the played-card instance carries. `abilities`
 * holds the structured markup lines parsed into hooks.
 */
interface HeroAbilityHeroCardEntry {
  slug: string;
  name?: string;
  rarityLabel?: string;
  abilities?: string[];
}

/**
 * Minimal structural type for a hero entry in SetData.heroes[i].
 *
 * Carries the per-card data (`cards`) plus the copy-count / canonical-face
 * sources (`physicalCards`, `cardCounts`) the shared instance-id emitter reads.
 */
interface HeroAbilityHeroEntry {
  slug: string;
  cards: HeroAbilityHeroCardEntry[];
  physicalCards?: unknown;
  cardCounts?: unknown;
}

// ---------------------------------------------------------------------------
// Markup extraction — structured patterns only, no NL parsing
// ---------------------------------------------------------------------------

/** Regex for [hc:X] hero class condition markup. */
const HERO_CLASS_PATTERN = /\[hc:([^\]]+)\]/g;

// why: mirrors the [hc:X] pattern — same extraction semantics, same consumption
// behavior (markup tokens removed from downstream text after extraction).
/** Regex for [team:X] team condition markup. */
const TEAM_PATTERN = /\[team:([^\]]+)\]/g;

/** Regex for [keyword:X] keyword markup. */
const KEYWORD_PATTERN = /\[keyword:([^\]]+)\]/g;

/** Regex for [icon:X] icon markup. */
const ICON_PATTERN = /\[icon:([^\]]+)\]/g;

/** Regex for [timing:X] explicit timing markup. */
const TIMING_PATTERN = /\[timing:([^\]]+)\]/;

/**
 * Maps icon markup values to HeroKeyword values.
 *
 * Only icons that directly correspond to a canonical keyword are mapped.
 * Unrecognized icon values are ignored.
 */
const ICON_TO_KEYWORD: Record<string, HeroKeyword> = {
  attack: 'attack',
  recruit: 'recruit',
  ko: 'ko',
};

/**
 * Maps timing markup values to HeroAbilityTiming values.
 */
const TIMING_MARKUP_MAP: Record<string, HeroAbilityTiming> = {
  onPlay: 'onPlay',
  onFight: 'onFight',
  onRecruit: 'onRecruit',
  onKO: 'onKO',
  onReveal: 'onReveal',
};

/**
 * Extracts structured hero ability metadata from a single ability text.
 *
 * Follows the authoritative parsing order:
 * 1. Extract [hc:X] -> HeroCondition entries
 * 2. Extract [keyword:X] -> HeroKeyword entries
 * 3. Extract [icon:X] -> HeroKeyword entries
 * 4. Normalize keywords (dedup, validate against union)
 * 5. Assign timing (explicit markup or default 'onPlay')
 *
 * No step depends on results of a later step.
 */
function parseAbilityText(abilityText: string): {
  keywords: HeroKeyword[];
  conditions: HeroCondition[];
  effects: HeroEffectDescriptor[];
  timing: HeroAbilityTiming;
} {
  const keywords: HeroKeyword[] = [];
  const heroClassConditions: HeroCondition[] = [];
  const teamConditions: HeroCondition[] = [];
  const effects: HeroEffectDescriptor[] = [];

  // Step 1a: Extract [hc:X] condition markup
  // why: defense-in-depth normalization on already-validated hc values — pipeline
  // produces lowercase, but a single authoring slip like [hc:Tech] should not
  // silently break superpowers.
  let heroClassMatch: RegExpExecArray | null = null;
  const heroClassRegex = new RegExp(HERO_CLASS_PATTERN.source, 'g');
  heroClassMatch = heroClassRegex.exec(abilityText);
  while (heroClassMatch !== null) {
    heroClassConditions.push({
      type: 'heroClassMatch',
      value: normalizeTraitSlug(heroClassMatch[1]!),
    });
    heroClassMatch = heroClassRegex.exec(abilityText);
  }

  // Step 1b: Extract [team:X] condition markup
  const teamRegex = new RegExp(TEAM_PATTERN.source, 'g');
  let teamMatch: RegExpExecArray | null = teamRegex.exec(abilityText);
  while (teamMatch !== null) {
    teamConditions.push({
      type: 'requiresTeam',
      value: normalizeTraitSlug(teamMatch[1]!),
    });
    teamMatch = teamRegex.exec(abilityText);
  }

  // Condition emission order: all heroClassMatch first, then requiresTeam
  // (deterministic, independent of markup position in text).
  const conditions: HeroCondition[] = [...heroClassConditions, ...teamConditions];

  // Step 2: Extract [keyword:X] markup
  const keywordRegex = new RegExp(KEYWORD_PATTERN.source, 'g');
  let keywordMatch: RegExpExecArray | null = keywordRegex.exec(abilityText);
  while (keywordMatch !== null) {
    const normalizedKeyword = keywordMatch[1]!.toLowerCase();
    if (isValidHeroKeyword(normalizedKeyword)) {
      keywords.push(normalizedKeyword);
    }
    keywordMatch = keywordRegex.exec(abilityText);
  }

  // Step 3: Extract [icon:X] markup
  const iconRegex = new RegExp(ICON_PATTERN.source, 'g');
  let iconMatch: RegExpExecArray | null = iconRegex.exec(abilityText);
  while (iconMatch !== null) {
    const iconValue = iconMatch[1]!.toLowerCase();
    const mappedKeyword = ICON_TO_KEYWORD[iconValue];
    if (mappedKeyword !== undefined) {
      keywords.push(mappedKeyword);
    }
    iconMatch = iconRegex.exec(abilityText);
  }

  // Step 4: Normalize keywords — dedup, validate against union
  const uniqueKeywords = deduplicateKeywords(keywords);

  // If conditions were found, add 'conditional' keyword
  if (conditions.length > 0) {
    let hasConditional = false;
    for (const keyword of uniqueKeywords) {
      if (keyword === 'conditional') {
        hasConditional = true;
        break;
      }
    }
    if (!hasConditional) {
      uniqueKeywords.push('conditional');
    }
  }

  // Build effect descriptors from extracted keywords (no magnitude from NL)
  for (const keyword of uniqueKeywords) {
    if (keyword !== 'conditional') {
      effects.push({ type: keyword });
    }
  }

  // Step 5: Assign timing — explicit markup or default 'onPlay'
  // why: timing defaults to 'onPlay' — no NL inference. Only explicit
  // [timing:X] markup overrides the default.
  let timing: HeroAbilityTiming = 'onPlay';
  const timingMatch = TIMING_PATTERN.exec(abilityText);
  if (timingMatch !== null) {
    const mappedTiming = TIMING_MARKUP_MAP[timingMatch[1]!];
    if (mappedTiming !== undefined) {
      timing = mappedTiming;
    }
  }

  return {
    keywords: uniqueKeywords,
    conditions,
    effects: effects.length > 0 ? effects : [],
    timing,
  };
}

/**
 * Checks if a string is a valid HeroKeyword.
 */
function isValidHeroKeyword(value: string): value is HeroKeyword {
  for (const keyword of HERO_KEYWORDS) {
    if (keyword === value) {
      return true;
    }
  }
  return false;
}

/**
 * Removes duplicate keywords while preserving order.
 */
function deduplicateKeywords(keywords: HeroKeyword[]): HeroKeyword[] {
  const seen = new Set<HeroKeyword>();
  const result: HeroKeyword[] = [];
  for (const keyword of keywords) {
    if (!seen.has(keyword)) {
      seen.add(keyword);
      result.push(keyword);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hero slug extraction (same pattern as economy.logic.ts)
// ---------------------------------------------------------------------------

/**
 * Extracts the hero slug from a hero FlatCard key.
 *
 * Key format: {setAbbr}-hero-{heroSlug}-{slot}
 * The heroSlug is between "hero-" and the last "-{slot}" segment.
 *
 * Promoted to a named export for WP-113 — the validator's
 * `buildKnownHeroQualifiedIds` consumes this as the single source of
 * truth for hero-slug grammar (Class A: flat-card-key decoder). Inventing
 * a parallel decoder is contract drift per D-10014 Authority Lock.
 */
// why: D-10014 — single source of truth — flat-card-key decoder.
export function extractHeroSlug(card: HeroAbilityFlatCard): string {
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
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on malformed input. Locally duplicated per WP-113 §6 step 1.
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
// Runtime type guard
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for HeroAbilityRegistryReader.
 *
 * Returns true if the registry object has the required listCards method
 * and returns cards with abilities arrays.
 */
// why: D-10014 — orchestration-side diagnostic detection seam. The
// orchestration layer (buildInitialGameState) imports this guard to detect
// registry-reader interface mismatches and emit G.messages diagnostics.
export function isHeroAbilityRegistryReader(
  registry: unknown,
): registry is HeroAbilityRegistryReader {
  if (!registry || typeof registry !== 'object') return false;

  const candidate = registry as Record<string, unknown>;
  return typeof candidate.listCards === 'function';
}

// ---------------------------------------------------------------------------
// buildHeroAbilityHooks — setup-time builder
// ---------------------------------------------------------------------------

// why: setup-time-only pattern — same as buildVillainDeck,
// buildCardStats. Registry data is consumed once and never accessed
// at runtime.

/**
 * Builds hero ability hooks from registry card data at setup time.
 *
 * Called during Game.setup() via buildInitialGameState. Resolves hero
 * cards from the selected hero decks, extracts structured ability
 * metadata, and produces a list of HeroAbilityHook entries.
 *
 * After setup, G.heroAbilityHooks is immutable — moves must never
 * modify it.
 *
 * @param registry - Card registry for resolving hero card data.
 *   Used at setup time only. Accepts unknown to support narrow test
 *   mocks. If the registry does not satisfy HeroAbilityRegistryReader
 *   structurally, returns an empty array gracefully.
 * @param matchConfig - Validated match setup config with heroDeckIds.
 * @returns Array of HeroAbilityHook entries for all selected hero cards.
 */
export function buildHeroAbilityHooks(
  registry: unknown,
  matchConfig: MatchSetupConfig,
): HeroAbilityHook[] {
  if (!isHeroAbilityRegistryReader(registry)) {
    return [];
  }

  // why: hook keys are the canonical-face slash instance ids emitted by
  // heroCardInstanceExtIds (D-18705), which reads the hero entry from set
  // data — so getSet is required here even though isHeroAbilityRegistryReader
  // guards only listCards (the guard's listCards-only contract is pinned by
  // buildInitialGameState.loadout.test.ts and the validator's
  // buildKnownHeroQualifiedIds). When getSet is absent (narrow listCards-only
  // test mocks), no hero entries are reachable, so no hooks are built —
  // identical to the empty-result path, no throw.
  const candidate = registry as { getSet?: unknown };
  if (typeof candidate.getSet !== 'function') {
    return [];
  }
  const getSet = candidate.getSet as (abbr: string) => unknown;

  const hooks: HeroAbilityHook[] = [];

  // Iterate selected hero decks deterministically.
  // why: D-10014 — Builder Filtering Order — iterate named set only. Each
  // heroDeckIds entry is `<setAbbr>/<heroSlug>`; resolve the hero entry from
  // that set's data only. Hero slugs collide across sets (51 / 307 instances
  // per the D-10014 PS-8 probe), so the named-set filter is non-negotiable.
  for (const heroDeckId of matchConfig.heroDeckIds) {
    const parsed = parseQualifiedId(heroDeckId);
    if (parsed === null) {
      // Malformed input: skip silently. The validator is the authoritative
      // format-error reporter; this builder is defense-in-depth.
      continue;
    }

    const heroEntry = findHeroAbilityHeroEntry(getSet(parsed.setAbbr), parsed.slug);
    if (heroEntry === null) continue;

    // why: D-18705 — emit one hook per (canonical-face slash instance id ×
    // ability line). The instance ids come from the shared emitter (matching
    // the played-card zone id getHooksForCard reads at the play site); the
    // ability text is resolved from the cards[] entry whose slug === the
    // canonical face (sides[0]). A copy with no resolvable canonical-face
    // card entry emits no hook (safe-skip, no throw) — non-canonical-face
    // ability text is out of scope.
    const instances = heroCardInstanceExtIds(parsed.setAbbr, parsed.slug, heroEntry);
    for (const instance of instances) {
      const cardEntry = findHeroAbilityCardBySlug(heroEntry.cards, instance.cardSlug);
      if (cardEntry === null) continue;
      if (!Array.isArray(cardEntry.abilities) || cardEntry.abilities.length === 0) {
        continue;
      }

      for (const abilityText of cardEntry.abilities) {
        if (typeof abilityText !== 'string' || abilityText.trim() === '') {
          continue;
        }

        const parsedAbility = parseAbilityText(abilityText);

        // why: freshly-constructed hook per instance — copies never alias a
        // shared object or arrays (D-13502).
        const hook: HeroAbilityHook = {
          cardId: instance.extId,
          timing: parsedAbility.timing,
          keywords: parsedAbility.keywords,
        };

        if (parsedAbility.conditions.length > 0) {
          hook.conditions = parsedAbility.conditions;
        }

        if (parsedAbility.effects.length > 0) {
          hook.effects = parsedAbility.effects;
        }

        hooks.push(hook);
      }
    }
  }

  return hooks;
}

/**
 * Finds a hero entry within set data's heroes[] by slug.
 *
 * Returns null when the set data is absent/malformed or the named hero is
 * not present (no cross-set fallback) — mirrors the soft-skip pattern in
 * buildHeroDeckCards and buildCardStats.
 *
 * @param setData - Raw set data from getSet().
 * @param heroSlug - Hero slug to match.
 * @returns The matching hero entry, or null.
 */
function findHeroAbilityHeroEntry(
  setData: unknown,
  heroSlug: string,
): HeroAbilityHeroEntry | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { heroes?: unknown };
  if (!Array.isArray(candidate.heroes)) return null;

  for (const entry of candidate.heroes) {
    if (!entry || typeof entry !== 'object') continue;
    const heroEntry = entry as HeroAbilityHeroEntry;
    if (typeof heroEntry.slug !== 'string') continue;
    if (heroEntry.slug !== heroSlug) continue;
    if (!Array.isArray(heroEntry.cards)) continue;
    return heroEntry;
  }
  return null;
}

/**
 * Finds the hero card entry whose slug matches the canonical-face slug.
 *
 * @param cards - The hero entry's cards array.
 * @param slug - The canonical-face slug (physicalCards[].sides[0]).
 * @returns The matching card entry, or null when none matches.
 */
function findHeroAbilityCardBySlug(
  cards: HeroAbilityHeroCardEntry[],
  slug: string,
): HeroAbilityHeroCardEntry | null {
  for (const cardEntry of cards) {
    if (!cardEntry || typeof cardEntry !== 'object') continue;
    if (cardEntry.slug === slug) return cardEntry;
  }
  return null;
}
