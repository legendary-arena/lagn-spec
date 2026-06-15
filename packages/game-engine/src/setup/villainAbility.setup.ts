/**
 * Villain & henchman ability hook builder for setup-time resolution.
 *
 * Reads villain per-card and henchman group-level ability text from the
 * registry, detects the `Ambush:` / `Fight:` timing prefix and any
 * `[effect:<VillainEffectKeyword>]` markers, and produces the deterministic
 * VillainAbilityHook[] table stored in G.villainAbilityHooks.
 *
 * Mirrors the WP-021 heroAbility.setup.ts discipline: a local structural
 * registry reader (no registry-package import), markup validated against a
 * canonical union, no NL parsing, no .reduce(), no throws. Setup-time only.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type {
  VillainAbilityHook,
  VillainAbilityTiming,
  VillainEffectKeyword,
  VillainEffectDescriptor,
  VillainEffectPrimitive,
} from '../rules/villainAbility.types.js';
import {
  VILLAIN_ABILITY_TIMINGS,
  VILLAIN_EFFECT_KEYWORDS,
  VILLAIN_EFFECT_PRIMITIVES,
  LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR,
} from '../rules/villainAbility.types.js';
// why: D-18704 / D-18706 — villain hooks must key by the copy-indexed
// instance ext_id (matching the Fight/Ambush fire sites that pass a zone id),
// fanning out exactly like the henchman path already does. The shared emitter
// is imported, not re-implemented (D-13702 RS-4).
import { villainCardInstanceExtIds } from '../villainDeck/villainDeck.setup.js';

// ---------------------------------------------------------------------------
// VillainAbilityRegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: game-engine must not import the registry package; this interface is
// satisfied structurally by CardRegistry. It exposes only getSet — the single
// method needed to read villain and henchman ability text per the selected
// match groups (same getSet-per-group pattern as buildCardStats).

/**
 * Minimal structural type for a single villain card within a group.
 * Only the slug and ability text are needed for hook resolution.
 */
interface VillainAbilityVillainCard {
  slug: string;
  abilities: string[];
  /** Copy count (WP-167 / D-16701); read by the shared instance-id emitter. */
  copies?: number;
}

/**
 * Minimal structural type for a villain group entry in set data.
 */
interface VillainAbilityVillainGroup {
  slug: string;
  cards: VillainAbilityVillainCard[];
}

/**
 * Minimal structural type for a henchman group entry in set data.
 *
 * Henchman ability text is stored at the group level (`abilities[]`), shared
 * by every virtual copy in the group — the registry has no per-copy entry.
 */
interface VillainAbilityHenchmanGroup {
  slug: string;
  abilities: string[];
}

/**
 * Minimal structural type for set data returned by getSet().
 * Only the villain and henchman collections are read here.
 */
interface VillainAbilitySetData {
  villains: VillainAbilityVillainGroup[];
  henchmen: VillainAbilityHenchmanGroup[];
}

/**
 * Setup-time registry interface for villain/henchman ability resolution.
 *
 * Satisfied structurally by the real CardRegistry. Defined locally to respect
 * the layer boundary (same pattern as VillainDeckRegistryReader).
 */
export interface VillainAbilityRegistryReader {
  /** Full set data for one set. */
  getSet(abbr: string): unknown | undefined;
}

// why: standard Marvel Legendary base rule — 10 identical copies per henchman
// group in the villain deck (matches HENCHMAN_COPIES_PER_GROUP in
// villainDeck.setup.ts and the 10-copy cardStats loop in economy.logic.ts).
// One hook is fanned out per copy so each instance ext_id has its own entry.
/** Number of henchman virtual copies per group (instance ext_ids 00-09). */
const HENCHMAN_COPIES_PER_GROUP = 10;

// ---------------------------------------------------------------------------
// Internal collection entry (pre-sort)
// ---------------------------------------------------------------------------

/**
 * One pre-sort hook record carrying its source ability-line index so the
 * deterministic emission order can use it as the final tiebreaker.
 */
interface HookEntry {
  cardId: CardExtId;
  timing: VillainAbilityTiming;
  /** Index of the source ability line within its source abilities[] array. */
  lineIndex: number;
  /** Recognized legacy keywords on this line, in source order. */
  keywords: VillainEffectKeyword[];
  /** Executable descriptors on this line, in source order. */
  effects: VillainEffectDescriptor[];
}

// ---------------------------------------------------------------------------
// Marker + timing extraction (structured patterns only — no NL parsing)
// ---------------------------------------------------------------------------

/** Regex for [effect:X] effect-marker markup. */
const EFFECT_MARKER_PATTERN = /\[effect:([^\]]+)\]/g;

/**
 * Checks whether a string is a valid VillainEffectKeyword.
 *
 * @param value - The raw marker value to validate.
 * @returns True when value is one of the canonical effect keywords.
 */
function isValidVillainEffectKeyword(
  value: string,
): value is VillainEffectKeyword {
  for (const keyword of VILLAIN_EFFECT_KEYWORDS) {
    if (keyword === value) {
      return true;
    }
  }
  return false;
}

/**
 * Detects the timing label from an ability line's leading text prefix.
 *
 * Returns 'onAmbush' for an `Ambush:` prefix, 'onFight' for a `Fight:` prefix,
 * 'onEscape' for an `Escape:` or `Overrun:` prefix, or null when the line
 * matches none.
 *
 * @param abilityLine - One ability text line.
 * @returns The matched timing label, or null.
 */
// why: only the exact `Ambush:` / `Fight:` / `Escape:` / `Overrun:` prefixes
// (word immediately followed by a colon) match in v1, case-insensitive with
// leading whitespace trimmed. Variant forms like `Ambush —` or `Ambush :`
// (spaced colon) are intentionally excluded — matching them would require
// punctuation normalization and would break the no-inference rule. A future
// WP can add variants if a real card ever needs one. Both `Escape:` and
// `Overrun:` map to the same `onEscape` timing — they are v1 synonyms per
// D-18602; the engine collapses them at parse time and `'onOverrun'` is NOT
// in the VillainAbilityTiming union. Distinct overrun semantics are deferred
// to a future scheme-text WP. Effects on the matched line still come from
// `[effect:<VillainEffectKeyword>]` markers (same model as Ambush/Fight) —
// the prefix only determines timing, not effects.
function detectTiming(abilityLine: string): VillainAbilityTiming | null {
  const normalized = abilityLine.replace(/^\s+/, '').toLowerCase();
  if (normalized.startsWith('ambush:')) {
    return 'onAmbush';
  }
  if (normalized.startsWith('fight:')) {
    return 'onFight';
  }
  if (normalized.startsWith('escape:')) {
    return 'onEscape';
  }
  if (normalized.startsWith('overrun:')) {
    return 'onEscape';
  }
  return null;
}

/**
 * Checks whether a string is a valid VillainEffectPrimitive.
 *
 * @param value - The raw token to validate.
 * @returns True when value is one of the canonical primitives.
 */
function isVillainEffectPrimitive(
  value: string,
): value is VillainEffectPrimitive {
  for (const primitive of VILLAIN_EFFECT_PRIMITIVES) {
    if (primitive === value) {
      return true;
    }
  }
  return false;
}

/**
 * Parses a positive-integer magnitude token (1, 2, 3, …); rejects anything else.
 *
 * @param token - The raw magnitude token from a parameterized marker.
 * @returns The parsed integer, or null when the token is not a positive integer.
 */
// why: the magnitude grammar is intentionally strict — only bare positive
// decimal integers with no sign, decimal point, or leading zero. Rejecting
// loose forms keeps the descriptor output canonical so two spellings of the
// same magnitude can never produce two different descriptors.
function parsePositiveInteger(token: string): number | null {
  if (!/^[1-9][0-9]*$/.test(token)) {
    return null;
  }
  return Number.parseInt(token, 10);
}

/**
 * Parses a parameterized effect token `<primitive>[:<param>…]` into a
 * descriptor, or null when the token is not a valid parameterized effect.
 *
 * Forward-compatible grammar (WP-252 / D-24023): no real card uses it yet, but
 * accepting it now is what makes a future magnitude (e.g. `ko-hero:each:3`) or
 * selector data-only — no new keyword, no code change. Colon-delimited and
 * positional per primitive:
 *   - `ko-hero:current` | `ko-hero:each:<N>`
 *   - `gain-wound:current` | `gain-wound:each`
 *   - `capture-hq-hero:rightmost` | `:highest-cost` | `:lowest-cost`
 *   - `hero-deck-top-to-escape` | `capture-bystander`  (no params)
 *
 * @param value - The raw marker value (the text inside `[effect:…]`).
 * @returns The parsed descriptor, or null.
 */
function parseParameterizedEffect(
  value: string,
): VillainEffectDescriptor | null {
  const parts = value.split(':');
  const primitiveToken = parts[0] ?? '';
  if (!isVillainEffectPrimitive(primitiveToken)) {
    return null;
  }
  if (primitiveToken === 'ko-hero') {
    const target = parts[1];
    if (target === 'current' && parts.length === 2) {
      return { primitive: 'ko-hero', target: 'current' };
    }
    if (target === 'each' && parts.length === 3) {
      const magnitude = parsePositiveInteger(parts[2]!);
      if (magnitude === null) {
        return null;
      }
      return { primitive: 'ko-hero', target: 'each', magnitude };
    }
    return null;
  }
  if (primitiveToken === 'gain-wound') {
    const target = parts[1];
    if (parts.length === 2 && (target === 'current' || target === 'each')) {
      return { primitive: 'gain-wound', target };
    }
    return null;
  }
  if (primitiveToken === 'capture-hq-hero') {
    const selector = parts[1];
    if (
      parts.length === 2 &&
      (selector === 'rightmost' ||
        selector === 'highest-cost' ||
        selector === 'lowest-cost')
    ) {
      return { primitive: 'capture-hq-hero', selector };
    }
    return null;
  }
  // why: hero-deck-top-to-escape and capture-bystander take no params; reject
  // any trailing colon-separated tokens so a malformed marker does not silently
  // collapse to a param-less descriptor.
  if (parts.length === 1) {
    return { primitive: primitiveToken };
  }
  return null;
}

/**
 * Extracts the recognized effects from an ability line, in source order, as
 * parallel keyword + descriptor arrays.
 *
 * Reads only `[effect:<value>]` markers. A legacy keyword value (in
 * VILLAIN_EFFECT_KEYWORDS) yields BOTH a keyword and its translated descriptor;
 * a parameterized value (`<primitive>:…`) yields a descriptor only (no legacy
 * keyword); an unknown value is ignored. The `[keyword:]` and `[icon:]`
 * namespaces and free-text English are never read for effects.
 *
 * @param abilityLine - One ability text line.
 * @returns Recognized keywords and descriptors in left-to-right source order.
 */
function extractEffects(abilityLine: string): {
  keywords: VillainEffectKeyword[];
  effects: VillainEffectDescriptor[];
} {
  const keywords: VillainEffectKeyword[] = [];
  const effects: VillainEffectDescriptor[] = [];
  const regex = new RegExp(EFFECT_MARKER_PATTERN.source, 'g');
  let match: RegExpExecArray | null = regex.exec(abilityLine);
  while (match !== null) {
    const rawValue = match[1]!;
    if (isValidVillainEffectKeyword(rawValue)) {
      // why: legacy grammar — record the keyword AND its frozen-table
      // descriptor, spread into a fresh object so no two hooks alias the shared
      // LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR entry (D-13502).
      keywords.push(rawValue);
      effects.push({ ...LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR[rawValue] });
    } else {
      const descriptor = parseParameterizedEffect(rawValue);
      if (descriptor !== null) {
        // why: parameterized grammar — descriptor only, no legacy keyword. No
        // real card uses this yet; the executor's reverse-map yields undefined
        // for such a descriptor, so it is simply not recorded in appliedEffects
        // (descriptor-keyed narrative labels are deferred to WP-253).
        effects.push(descriptor);
      }
      // else: unknown value, ignored (matches the prior extractEffectKeywords).
    }
    match = regex.exec(abilityLine);
  }
  return { keywords, effects };
}

// ---------------------------------------------------------------------------
// Set-qualified ID parsing (local copy)
// ---------------------------------------------------------------------------

/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on malformed input — empty string, missing or multiple
 * slashes, empty parts, or surrounding whitespace.
 */
// why: D-10014 — duplicated locally to avoid a circular import between
// setup-time builders and matchSetup.validate.ts. Identical rejection rules
// to the copies in villainDeck.setup.ts and economy.logic.ts.
function parseQualifiedId(
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
// Registry shape guards + finders
// ---------------------------------------------------------------------------

/**
 * Runtime guard for the VillainAbilityRegistryReader interface.
 *
 * @param registry - Candidate registry object.
 * @returns True when getSet is callable.
 */
function isVillainAbilityRegistryReader(
  registry: unknown,
): registry is VillainAbilityRegistryReader {
  if (!registry || typeof registry !== 'object') return false;
  const candidate = registry as Record<string, unknown>;
  return typeof candidate.getSet === 'function';
}

/**
 * Finds a villain group's cards within a set's villains[].
 *
 * @param setData - Raw set data from getSet().
 * @param groupSlug - The villain group slug to match.
 * @returns The group's villain cards, or null when absent/malformed.
 */
function findVillainGroupCards(
  setData: unknown,
  groupSlug: string,
): VillainAbilityVillainCard[] | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { villains?: unknown };
  if (!Array.isArray(candidate.villains)) return null;

  for (const rawGroup of candidate.villains) {
    if (!rawGroup || typeof rawGroup !== 'object') continue;
    const group = rawGroup as Partial<VillainAbilityVillainGroup>;
    if (group.slug !== groupSlug) continue;
    if (!Array.isArray(group.cards)) return null;
    return group.cards as VillainAbilityVillainCard[];
  }
  return null;
}

/**
 * Finds a henchman group's ability text within a set's henchmen[].
 *
 * @param setData - Raw set data from getSet().
 * @param groupSlug - The henchman group slug to match.
 * @returns The group's ability lines, or null when absent/malformed.
 */
function findHenchmanGroupAbilities(
  setData: unknown,
  groupSlug: string,
): string[] | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { henchmen?: unknown };
  if (!Array.isArray(candidate.henchmen)) return null;

  for (const rawGroup of candidate.henchmen) {
    if (!rawGroup || typeof rawGroup !== 'object') continue;
    const group = rawGroup as Partial<VillainAbilityHenchmanGroup>;
    if (group.slug !== groupSlug) continue;
    if (!Array.isArray(group.abilities)) return null;
    return group.abilities as string[];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-source collectors
// ---------------------------------------------------------------------------

/**
 * Collects hook entries for the selected villain groups.
 *
 * Villain hooks are fanned out one per (copy-indexed instance ext_id ×
 * matched ability line) via the shared villainCardInstanceExtIds emitter, so
 * the keys equal the zone-instance grammar the Fight/Ambush fire sites pass
 * (D-18704). Before WP-191 these keyed the single definition id, so
 * getVillainHooksForCard (called with a copy-indexed zone id) always missed
 * and no villain onFight/onAmbush hook ever fired. Gate-consistency with
 * buildCardKeywords (D-18507) is preserved because that builder now emits the
 * `ambush` keyword under the same copy-indexed instance ids.
 *
 * @param registry - Setup-time registry reader.
 * @param matchConfig - Validated match config providing villainGroupIds.
 * @param entries - Accumulator appended in place.
 */
function collectVillainHookEntries(
  registry: VillainAbilityRegistryReader,
  matchConfig: MatchSetupConfig,
  entries: HookEntry[],
): void {
  for (const villainGroupId of matchConfig.villainGroupIds) {
    const parsed = parseQualifiedId(villainGroupId);
    if (parsed === null) continue;
    const setData = registry.getSet(parsed.setAbbr);
    const groupCards = findVillainGroupCards(setData, parsed.slug);
    if (groupCards === null) continue;

    for (const card of groupCards) {
      if (typeof card.slug !== 'string') continue;
      if (!Array.isArray(card.abilities)) continue;
      const instanceExtIds = villainCardInstanceExtIds(
        parsed.setAbbr,
        parsed.slug,
        card.slug,
        card,
      );

      for (let lineIndex = 0; lineIndex < card.abilities.length; lineIndex++) {
        const abilityLine = card.abilities[lineIndex];
        if (typeof abilityLine !== 'string') continue;
        const timing = detectTiming(abilityLine);
        if (timing === null) continue;
        const extracted = extractEffects(abilityLine);
        // why: fan out one freshly-constructed hook per copy instance so
        // copies never alias a shared keywords/effects array (D-13502),
        // mirroring the henchman fan-out below. The deterministic sort in
        // buildVillainAbilityHooks restores the locked total order
        // (cardId lexical, timing, lineIndex).
        for (const cardId of instanceExtIds) {
          entries.push({
            cardId,
            timing,
            lineIndex,
            keywords: [...extracted.keywords],
            effects: [...extracted.effects],
          });
        }
      }
    }
  }
}

/**
 * Collects hook entries for the selected henchman groups.
 *
 * Henchman ability text is group-level, so one hook is fanned out per virtual
 * copy ext_id `henchman-{groupSlug}-{NN}` (00-09).
 *
 * @param registry - Setup-time registry reader.
 * @param matchConfig - Validated match config providing henchmanGroupIds.
 * @param entries - Accumulator appended in place.
 */
function collectHenchmanHookEntries(
  registry: VillainAbilityRegistryReader,
  matchConfig: MatchSetupConfig,
  entries: HookEntry[],
): void {
  for (const henchmanGroupId of matchConfig.henchmanGroupIds) {
    const parsed = parseQualifiedId(henchmanGroupId);
    if (parsed === null) continue;
    const setData = registry.getSet(parsed.setAbbr);
    const abilities = findHenchmanGroupAbilities(setData, parsed.slug);
    if (abilities === null) continue;

    for (let lineIndex = 0; lineIndex < abilities.length; lineIndex++) {
      const abilityLine = abilities[lineIndex];
      if (typeof abilityLine !== 'string') continue;
      const timing = detectTiming(abilityLine);
      // why: henchman onAmbush hooks are intentionally NOT emitted in v1
      // (D-18507). buildCardKeywords never tags henchmen with the `ambush`
      // board keyword, so the reveal-site hasAmbush gate can never fire a
      // henchman onAmbush hook — emitting one would be unreachable and would
      // violate the gate-consistency invariant. Henchman Ambush effects are
      // deferred to a future WP that adds henchman keyword detection. The
      // same filter also defers henchman onEscape hooks (WP-186): no real
      // henchman card in the v1 data carries an `Escape:` line with an
      // `[effect:]` marker, so emitting henchman onEscape hooks would have
      // no consumer; the escape fire site still calls executeVillainAbilities
      // on a henchman escape, which safely no-ops via per-card hook lookup.
      if (timing !== 'onFight') continue;

      const extracted = extractEffects(abilityLine);
      // why: fan out one freshly-constructed hook per virtual copy ext_id so
      // copies never alias a shared keywords/effects array (D-13502).
      for (
        let copyIndex = 0;
        copyIndex < HENCHMAN_COPIES_PER_GROUP;
        copyIndex++
      ) {
        const paddedIndex = String(copyIndex).padStart(2, '0');
        const cardId =
          `henchman-${parsed.slug}-${paddedIndex}` as CardExtId;
        entries.push({
          cardId,
          timing,
          lineIndex,
          keywords: [...extracted.keywords],
          effects: [...extracted.effects],
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// buildVillainAbilityHooks — setup-time builder
// ---------------------------------------------------------------------------

/**
 * Builds the villain/henchman ability hook table from registry data at setup.
 *
 * Called during Game.setup() via buildInitialGameState. Reads villain per-card
 * and henchman group-level ability text for the selected match groups, emits
 * one hook per matched (card-instance × ability line), and returns the table
 * in a stable total order: (1) cardId lexical ascending, (2) timing per
 * VILLAIN_ABILITY_TIMINGS, (3) ability-line index.
 *
 * After setup, G.villainAbilityHooks is immutable — moves must never modify it.
 *
 * @param registry - Card registry for resolving ability text. Used at setup
 *   time only. Accepts unknown to support narrow test mocks; returns an empty
 *   array when the registry does not satisfy VillainAbilityRegistryReader.
 * @param matchConfig - Validated match setup config (villain + henchman group ids).
 * @returns The deterministic VillainAbilityHook table.
 */
export function buildVillainAbilityHooks(
  registry: unknown,
  matchConfig: MatchSetupConfig,
): VillainAbilityHook[] {
  if (!isVillainAbilityRegistryReader(registry)) {
    return [];
  }

  const entries: HookEntry[] = [];
  collectVillainHookEntries(registry, matchConfig, entries);
  collectHenchmanHookEntries(registry, matchConfig, entries);

  // why: stable total order for byte-identical hook tables across Node
  // versions and replay — cardId lexical, then timing per the canonical
  // array, then ability-line index. localeCompare is not used (locale-
  // sensitive); plain < / > gives stable codepoint ordering.
  entries.sort((left, right) => {
    if (left.cardId !== right.cardId) {
      return left.cardId < right.cardId ? -1 : 1;
    }
    const leftTimingRank = VILLAIN_ABILITY_TIMINGS.indexOf(left.timing);
    const rightTimingRank = VILLAIN_ABILITY_TIMINGS.indexOf(right.timing);
    if (leftTimingRank !== rightTimingRank) {
      return leftTimingRank - rightTimingRank;
    }
    return left.lineIndex - right.lineIndex;
  });

  const hooks: VillainAbilityHook[] = [];
  for (const entry of entries) {
    // why: keywords (legacy VillainEffectKeyword[]) and effects (descriptors)
    // are now DISTINCT arrays (D-24023 retyped effects to
    // VillainEffectDescriptor[]); both freshly built per entry — keywords as a
    // fresh string array, effects as freshly-spread descriptor objects — so no
    // two hooks (e.g., card copies sharing a source line) alias a mutable array
    // or descriptor object (D-13502).
    const hookKeywords: VillainEffectKeyword[] = [...entry.keywords];
    const hookEffects: VillainEffectDescriptor[] = [];
    for (const descriptor of entry.effects) {
      hookEffects.push({ ...descriptor });
    }
    hooks.push({
      cardId: entry.cardId,
      timing: entry.timing,
      keywords: hookKeywords,
      effects: hookEffects,
    });
  }

  return hooks;
}
