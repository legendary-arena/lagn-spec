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
import type { HeroCountSource } from '../rules/heroCountSource.js';
import { HERO_COUNT_SOURCES } from '../rules/heroCountSource.js';
import type { RevealRule, RevealPredicate, RevealAction } from '../rules/revealRule.js';
import { revealRulesForLegacyKeyword, REVEAL_KEYWORDS } from '../rules/revealRule.js';
import type { EffectNode } from '../rules/effectPrimitive.types.js';
import {
  HERO_COMPOSITION_MARKERS,
  HERO_COMPOSITION_MARKER_NAMES,
  PARAMETERIZED_COMPOSITION_MARKER_NAMES,
  buildEmpoweredComposition,
} from '../rules/heroCompositions.js';
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

// why: optional :N suffix carries magnitude for rescue/reveal effects (D-21503)
// why: hyphen allowed in keyword names to support reveal-ko and reveal-min tokens (D-21701, D-21702)
/** Regex for [keyword:X] or [keyword:X:N] keyword markup (N = non-negative integer). */
const KEYWORD_PATTERN = /\[keyword:([a-zA-Z][a-zA-Z-]*)(?::(\d+))?\]/g;

// why: D-24044 — the ANCHORED Empowered parameter tail. The color must immediately follow
// the `[keyword:Empowered]` token as `by [hc:COLOR]` (the `^` anchors to the text right after
// the marker — a broad forward scan could wrongly bind a later, unrelated [hc:...] to
// Empowered). Non-global + stateless: a fresh `.exec` against the post-marker slice.
/** Regex for the anchored `by [hc:COLOR]` tail immediately after `[keyword:Empowered]`. */
const EMPOWERED_PARAM_TAIL_PATTERN = /^\s*by\s*\[hc:([a-z0-9-]+)\]/i;

// why: D-24016 — the count-scaled attack token has three segments
// ([keyword:attack-per-count:<source>:<perUnit>]); KEYWORD_PATTERN only captures
// keyword(:N)?, so the count source and per-unit rate need a dedicated pattern.
/** Regex for [keyword:attack-per-count:<source>:<perUnit>] count-scaled markup. */
const COUNT_SCALED_PATTERN = /\[keyword:attack-per-count:([a-z][a-z-]*):(\d+)\]/g;

// why: D-24019 — the optional-KO-reward token has three segments
// ([keyword:optional-ko-reward:<reward>:<n>]); KEYWORD_PATTERN cannot match it
// (it stops at the second colon), so the reward and magnitude need a dedicated
// pattern. The capture group is (\d+) — matching the COUNT_SCALED_PATTERN
// precedent, NOT [1-9]\d*. The strict [1-9]\d* gate is the apply-script's job
// (build time); here the parser captures the integer and the n ≥ 1 check is
// enforced downstream (isValidMagnitude at the reward executor).
/** Regex for [keyword:optional-ko-reward:<reward>:<n>] optional-KO-reward markup. */
const OPTIONAL_KO_REWARD_PATTERN = /\[keyword:optional-ko-reward:([a-z][a-z-]*):(\d+)\]/g;

// why: D-24024 — the forward-compat parameterized reveal token has 3+
// colon-separated segments ([keyword:reveal:<predicate>:<actions>(:continue)?]).
// KEYWORD_PATTERN stops at the second colon and cannot match it; the legacy
// [keyword:reveal:<n>] form is disambiguated because the predicate segment must
// START WITH A LETTER (so a bare digit magnitude routes to KEYWORD_PATTERN, not
// here). One token = one RevealRule (mirrors COUNT_SCALED_PATTERN's
// one-token-one-effect shape). predicate ∈ {always, cost-zero, cost-odd,
// cost-lte-<n>, cost-gte-<n>}; actions are '+'-joined ∈ {draw, ko, attack-by-cost,
// attack-fixed-<n>, choose-discard-or-return}; an optional trailing ':continue'.
// No card uses this grammar this WP — it makes a new reveal variant data-only.
/** Regex for [keyword:reveal:<predicate>:<actions>(:continue)?] parameterized reveal markup. */
const REVEAL_RULE_PATTERN = /\[keyword:reveal:([a-z][a-z0-9-]*):([a-z][a-z0-9+-]*)(?::(continue))?\]/g;

// why: D-24027 — how many deck-top cards a reveal descriptor peeks is DESCRIPTOR-level
// (the reveal handler's loop bound), NOT rule-level (the per-card predicate), so it rides
// a dedicated 2-segment token mirroring COUNT_SCALED_PATTERN's dedicated-token shape — not
// the legacy `[keyword:reveal:N]` magnitude (that is a draw threshold) nor a RevealRule
// segment. Disambiguation: `[keyword:reveal-count:N]` is NOT matched by REVEAL_RULE_PATTERN
// (which needs the literal `reveal:<predicate>`); KEYWORD_PATTERN matches it as keyword
// `reveal-count`, but isValidHeroKeyword('reveal-count') is false (it is a modifier marker,
// never a HeroKeyword — absent from HERO_KEYWORDS), so only REVEAL_COUNT_PATTERN consumes it.
/** Regex for [keyword:reveal-count:<n>] reveal-count modifier markup. */
const REVEAL_COUNT_PATTERN = /\[keyword:reveal-count:(\d+)\]/g;

// why: D-24024 — the 8 legacy reveal keywords whose markers translate to the
// collapsed `reveal` descriptor. Built from the canonical REVEAL_KEYWORDS array so
// the parser and the translation function share one source of truth.
const REVEAL_KEYWORD_SET: ReadonlySet<HeroKeyword> = new Set<HeroKeyword>(REVEAL_KEYWORDS);

// why: WP-257 / D-24034 — a `[keyword:X]` token whose X is NOT a HeroKeyword and
// NOT a composition marker is normally an unresolved marker (→ parse-unrecognized).
// But a few `[keyword:...]` tokens are recognized MODIFIER markers consumed by a
// dedicated pattern, not by KEYWORD_PATTERN's keyword arm. `reveal-count` is the
// one whose first segment (a bare hyphenated word + `:<n>`) ALSO matches
// KEYWORD_PATTERN, so the unresolved-marker scan must exclude it to avoid a false
// flag. (`attack-per-count` / `optional-ko-reward` / the parameterized `reveal:...`
// tokens carry extra colon segments that KEYWORD_PATTERN cannot match, so they
// never reach the keyword arm; only `reveal-count` needs listing here.)
const RECOGNIZED_NON_KEYWORD_MARKERS: ReadonlySet<string> = new Set<string>([
  'reveal-count',
]);

// why: D-24019 — the reward of an optional-ko-reward effect is dispatched to an
// ALREADY-BUILT reward executor; only these four are seeded. An unseeded reward
// (e.g. a not-yet-built gain-shard) emits no descriptor — such a marker can
// never reach the pending queue. Mirrored defensively in heroEffects.execute.ts.
const OPTIONAL_KO_REWARD_SEEDED_REWARDS: ReadonlySet<HeroKeyword> = new Set<HeroKeyword>([
  'rescue',
  'draw',
  'attack',
  'recruit',
]);

// why: extract magnitude from icon-adjacent integers — avoids per-card manual markup (D-21505)
/** Regex for attack/recruit icon-adjacent magnitude, e.g. "+2[icon:attack]". */
const ICON_MAGNITUDE_PATTERN = /\+?(\d+)\s*\[icon:(attack|recruit)\]/g;

// why: extract magnitude from icon-adjacent integers — avoids per-card manual markup (D-21505)
/** Regex for VP-cost-threshold in reveal lines: "2[icon:vp] or less". Non-global; first match only. */
const VP_COST_THRESHOLD_PATTERN = /(\d+)\s*\[icon:vp\]\s*or less/;

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
  primitiveEffects: EffectNode[];
  unresolvedMarkers: string[];
  timing: HeroAbilityTiming;
} {
  const keywords: HeroKeyword[] = [];
  const heroClassConditions: HeroCondition[] = [];
  const teamConditions: HeroCondition[] = [];
  const effects: HeroEffectDescriptor[] = [];
  // why: D-24031 — composition markers (Berserk) accumulate here as deep copies of their
  // registry AST, kept separate from `keywords`/`effects` (the open mechanic space).
  const primitiveEffects: EffectNode[] = [];
  // why: WP-257 / D-24034 — raw `[keyword:X]` tokens that resolve to no keyword,
  // composition, or recognized modifier. The hollow detector reads this so an
  // unresolved marker flags `parse-unrecognized` while flavor text (no marker) does not.
  const unresolvedMarkers: string[] = [];

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

  // Step 2: Extract [keyword:X] or [keyword:X:N] markup
  // Collect magnitudes keyed by keyword — explicit markup wins over icon-derived.
  const magnitudes: Map<string, number> = new Map();
  const keywordRegex = new RegExp(KEYWORD_PATTERN.source, 'g');
  let keywordMatch: RegExpExecArray | null = keywordRegex.exec(abilityText);
  while (keywordMatch !== null) {
    const normalizedKeyword = keywordMatch[1]!.toLowerCase();
    if (isValidHeroKeyword(normalizedKeyword)) {
      keywords.push(normalizedKeyword);
      // Capture optional :N magnitude suffix when present and valid integer
      const magnitudeString = keywordMatch[2];
      if (magnitudeString !== undefined && /^\d+$/.test(magnitudeString)) {
        magnitudes.set(normalizedKeyword, parseInt(magnitudeString, 10));
      }
    } else if (isParameterizedCompositionMarker(normalizedKeyword)) {
      // why: D-24044 — a PARAMETERIZED composition marker (empowered) whose AST is BUILT per
      // a parameter parsed from the text immediately after the marker, not a static
      // HERO_COMPOSITION_MARKERS row. It resolves to a built composition ONLY for the
      // unconditional core form (an anchored `by [hc:COLOR]` tail whose color is the line's
      // sole condition); any deferred variant (no anchored tail, a prefix gate, multi-class,
      // a team gate) instead records an unresolved marker so the WP-257 hollow detector still
      // flags it — the Honest-Partial Invariant. Checked BEFORE isHeroCompositionMarker since
      // `empowered` is in HERO_COMPOSITION_MARKER_NAMES (the deduped union) too.
      const textAfterMarker = abilityText.slice(keywordMatch.index + keywordMatch[0]!.length);
      const empoweredComposition = tryResolveEmpoweredCore(textAfterMarker, conditions);
      if (empoweredComposition !== undefined) {
        primitiveEffects.push(empoweredComposition);
        // why: D-24044 — suppress the consumed [hc:COLOR] param so it does not ALSO gate the
        // hook (it is the count parameter, not a condition). The resolve gate guarantees it is
        // the line's sole condition, so clearing `conditions` removes exactly it — which also
        // prevents the 'conditional' keyword being added downstream.
        conditions.splice(0, conditions.length);
      } else {
        unresolvedMarkers.push(normalizedKeyword);
      }
    } else if (isHeroCompositionMarker(normalizedKeyword)) {
      // why: D-24031 — a composition marker (berserk) attaches a DEEP COPY of its AST to
      // primitiveEffects, NEVER to hook.keywords (berserk is not a HeroKeyword;
      // isValidHeroKeyword stays false). structuredClone (a Node v22 global, deterministic
      // over the plain-JSON AST) forecloses both aliasing the shared registry const
      // (D-13502) and hand-literal drift. A cousin is a registry row, not an engine edit.
      const composition = HERO_COMPOSITION_MARKERS[normalizedKeyword];
      if (composition !== undefined) {
        primitiveEffects.push(structuredClone(composition));
      }
    } else if (!RECOGNIZED_NON_KEYWORD_MARKERS.has(normalizedKeyword)) {
      // why: WP-257 / D-24034 — a `[keyword:X]` token that is NOT a valid keyword,
      // NOT a composition marker, and NOT a recognized modifier (reveal-count) is a
      // SAW-a-marker-resolved-to-nothing case. Record the raw token so the hollow
      // detector can flag `parse-unrecognized` at runtime — distinct from flavor
      // text, which contains no marker token and so records nothing here.
      unresolvedMarkers.push(normalizedKeyword);
    }
    keywordMatch = keywordRegex.exec(abilityText);
  }

  // Step 2b: Extract icon-adjacent magnitudes for attack/recruit keywords.
  // Only sets magnitude if no explicit [keyword:X:N] markup already provided it.
  const iconMagnitudeRegex = new RegExp(ICON_MAGNITUDE_PATTERN.source, 'g');
  let iconMagnitudeMatch: RegExpExecArray | null = iconMagnitudeRegex.exec(abilityText);
  while (iconMagnitudeMatch !== null) {
    const iconKeyword = iconMagnitudeMatch[2]!.toLowerCase();
    const iconMagnitudeValue = parseInt(iconMagnitudeMatch[1]!, 10);
    if (!magnitudes.has(iconKeyword)) {
      magnitudes.set(iconKeyword, iconMagnitudeValue);
    }
    iconMagnitudeMatch = iconMagnitudeRegex.exec(abilityText);
  }

  // Step 2c: Extract VP-cost threshold for reveal lines.
  // Pattern: "N[icon:vp] or less" — non-global, first match only.
  // Only sets magnitude if no explicit [keyword:reveal:N] markup provided it.
  const vpThresholdMatch = VP_COST_THRESHOLD_PATTERN.exec(abilityText);
  if (vpThresholdMatch !== null && !magnitudes.has('reveal')) {
    const vpThresholdValue = parseInt(vpThresholdMatch[1]!, 10);
    magnitudes.set('reveal', vpThresholdValue);
  }

  // Step 2d: Extract [keyword:attack-per-count:<source>:<perUnit>] count-scaled
  // markup. The per-unit rate is stored in magnitudes; the count source is
  // stored in countSources so the effect builder can attach it. Only sources in
  // HERO_COUNT_SOURCES are accepted — an unrecognized source is ignored (no
  // 'attack-per-count' effect is emitted, so the icon-suppression below does not
  // fire and the line keeps its printed attack icon).
  // why: D-24016 — count-scaled attack tokens have three segments not matched by
  // KEYWORD_PATTERN; the per-unit rate is the magnitude, the source resolves the count.
  const countSources: Map<HeroKeyword, HeroCountSource> = new Map();
  const countScaledRegex = new RegExp(COUNT_SCALED_PATTERN.source, 'g');
  let countScaledMatch: RegExpExecArray | null = countScaledRegex.exec(abilityText);
  while (countScaledMatch !== null) {
    const countSourceCandidate = countScaledMatch[1]!;
    const perUnitString = countScaledMatch[2]!;
    if (isValidHeroCountSource(countSourceCandidate)) {
      keywords.push('attack-per-count');
      magnitudes.set('attack-per-count', parseInt(perUnitString, 10));
      countSources.set('attack-per-count', countSourceCandidate);
    }
    countScaledMatch = countScaledRegex.exec(abilityText);
  }

  // Step 2e: Extract [keyword:optional-ko-reward:<reward>:<n>] markup. The
  // reward is stored in rewardTypes; the reward magnitude is stored in
  // magnitudes so the effect builder can attach both. A descriptor is emitted
  // ONLY when the reward is in the seeded set AND n ≥ 1 — an unseeded reward
  // (e.g. a not-yet-built gain-shard) or a zero magnitude emits no effect, so
  // such a marker can never reach the pending queue.
  // why: D-24019 — the optional-KO-reward token has three segments not matched
  // by KEYWORD_PATTERN; the reward dispatches to the existing executor and the
  // magnitude is the reward magnitude.
  const rewardTypes: Map<HeroKeyword, HeroKeyword> = new Map();
  const optionalKoRewardRegex = new RegExp(OPTIONAL_KO_REWARD_PATTERN.source, 'g');
  let optionalKoRewardMatch: RegExpExecArray | null = optionalKoRewardRegex.exec(abilityText);
  while (optionalKoRewardMatch !== null) {
    const rewardCandidate = optionalKoRewardMatch[1]!;
    const rewardMagnitude = parseInt(optionalKoRewardMatch[2]!, 10);
    if (isValidHeroKeyword(rewardCandidate)
      && OPTIONAL_KO_REWARD_SEEDED_REWARDS.has(rewardCandidate)
      && rewardMagnitude >= 1) {
      keywords.push('optional-ko-reward');
      magnitudes.set('optional-ko-reward', rewardMagnitude);
      rewardTypes.set('optional-ko-reward', rewardCandidate);
    }
    optionalKoRewardMatch = optionalKoRewardRegex.exec(abilityText);
  }

  // Step 2f: Extract [keyword:reveal:<predicate>:<actions>(:continue)?] parameterized
  // reveal tokens (forward-compat — no card uses this grammar this WP). Each token is
  // ONE RevealRule, accumulated in source order. When at least one rule parses, the
  // base 'reveal' keyword is recorded so the effect builder emits a single collapsed
  // reveal descriptor carrying these rules.
  // why: D-24024 — the parameterized grammar makes a new reveal variant a data marker
  // rather than a new keyword + handler + drift-test + WP. A malformed predicate or
  // action voids that one rule token (safe-skip, no throw).
  const parameterizedRevealRules: RevealRule[] = [];
  const revealRuleRegex = new RegExp(REVEAL_RULE_PATTERN.source, 'g');
  let revealRuleMatch: RegExpExecArray | null = revealRuleRegex.exec(abilityText);
  while (revealRuleMatch !== null) {
    const parsedRule = parseRevealRuleToken(revealRuleMatch[1]!, revealRuleMatch[2]!, revealRuleMatch[3]);
    if (parsedRule !== null) {
      parameterizedRevealRules.push(parsedRule);
    }
    revealRuleMatch = revealRuleRegex.exec(abilityText);
  }
  if (parameterizedRevealRules.length > 0) {
    keywords.push('reveal');
  }

  // Step 2g: Extract the [keyword:reveal-count:<n>] modifier — how many deck-top
  // cards the reveal descriptor peeks. Absent ⇒ the WP-253 default of 1. Only the
  // first occurrence is read (one reveal descriptor per ability line).
  // why: D-24027 — the count is DESCRIPTOR-level (the reveal handler's peek-loop
  // bound), not rule-level (a per-card predicate); a dedicated 2-segment token
  // (mirrors COUNT_SCALED_PATTERN) keeps it distinct from the legacy
  // `[keyword:reveal:N]` draw threshold. `reveal-count` is a modifier marker, never
  // a HeroKeyword, so it contributes no keyword/effect of its own.
  let revealCount = 1;
  const revealCountRegex = new RegExp(REVEAL_COUNT_PATTERN.source, 'g');
  const revealCountMatch = revealCountRegex.exec(abilityText);
  if (revealCountMatch !== null) {
    const parsedRevealCount = parseInt(revealCountMatch[1]!, 10);
    // why: guard n ≥ 1 (mirrors the optional-ko-reward magnitude gate) — a 0 count
    // would build a reveal that peeks nothing, so fall back to the default.
    if (parsedRevealCount >= 1) {
      revealCount = parsedRevealCount;
    }
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
  let uniqueKeywords = deduplicateKeywords(keywords);

  // Icon-suppression: a count-scaled attack effect subsumes the printed attack
  // icon on the same line. Without this, "+N[icon:attack] for each X" would emit
  // BOTH a flat 'attack' effect (from the icon, Steps 2b/3) AND the
  // 'attack-per-count' effect — a double-count (N flat + N×count). Drop the plain
  // 'attack' keyword and its magnitude so only the count-scaled effect remains.
  // why: the count-scaled keyword subsumes the printed attack icon (D-24016;
  // mirrors the D-21901 reveal-cost-attack precedent).
  let lineHasCountScaledAttack = false;
  for (const keyword of uniqueKeywords) {
    if (keyword === 'attack-per-count') {
      lineHasCountScaledAttack = true;
      break;
    }
  }
  if (lineHasCountScaledAttack) {
    const keywordsWithoutAttackIcon: HeroKeyword[] = [];
    for (const keyword of uniqueKeywords) {
      if (keyword !== 'attack') {
        keywordsWithoutAttackIcon.push(keyword);
      }
    }
    uniqueKeywords = keywordsWithoutAttackIcon;
    magnitudes.delete('attack');
  }

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

  // Build effect descriptors from extracted keywords.
  // Apply magnitude from the magnitudes map when available.
  for (const keyword of uniqueKeywords) {
    if (keyword !== 'conditional') {
      const magnitude = magnitudes.get(keyword);
      if (keyword === 'attack-per-count') {
        // why: the count-scaled attack effect carries its count source so the
        // executor can resolve the count to scale the per-unit magnitude by.
        // Step 2d records both the per-unit magnitude and the source together,
        // so the guard both narrows the optional Map reads and is defensive.
        const countSource = countSources.get('attack-per-count');
        if (magnitude !== undefined && countSource !== undefined) {
          effects.push({ type: keyword, magnitude, countSource });
        }
      } else if (keyword === 'optional-ko-reward') {
        // why: D-24019 — the optional-KO-reward effect carries its rewardType so
        // the resolve move can dispatch the reward to the existing executor on
        // KO; magnitude is the reward magnitude. Step 2e records both together,
        // so the guard both narrows the optional Map reads and is defensive.
        const rewardType = rewardTypes.get('optional-ko-reward');
        if (magnitude !== undefined && rewardType !== undefined) {
          effects.push({ type: keyword, magnitude, rewardType });
        }
      } else if (REVEAL_KEYWORD_SET.has(keyword)) {
        // why: D-24024 — the dual-grammar seam. A legacy reveal-* keyword translates
        // through revealRulesForLegacyKeyword into the collapsed `reveal` descriptor;
        // the parameterized `[keyword:reveal:...]` grammar (Step 2f) supplies its rules
        // directly for the base `reveal` keyword. Either way the LEGACY keyword stays
        // on hook.keywords (narrative identity — no reverse-map), only the effect is
        // translated. An invalid magnitude yields empty revealRules (a no-op reveal),
        // reproducing the legacy pre-gate/self-guard skip while still emitting one effect.
        let revealRules: RevealRule[];
        if (keyword === 'reveal' && parameterizedRevealRules.length > 0) {
          revealRules = parameterizedRevealRules;
        } else {
          revealRules = revealRulesForLegacyKeyword(keyword, magnitude);
        }
        // why: D-24027 — the descriptor-level reveal-count (Step 2g; default 1) sets how
        // many deck-top cards the reveal handler peeks. Threaded onto the one collapsed
        // reveal descriptor this line emits, whether legacy-translated or parameterized.
        effects.push({ type: 'reveal', revealCount, revealRules });
      } else if (magnitude !== undefined) {
        effects.push({ type: keyword, magnitude });
      } else {
        effects.push({ type: keyword });
      }
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
    primitiveEffects,
    unresolvedMarkers,
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
 * Checks if a string is a hero composition marker (a key in HERO_COMPOSITION_MARKERS).
 *
 * Mirrors isValidHeroKeyword. A composition marker is the OPEN mechanic space (D-24031),
 * distinct from the closed HeroKeyword union — `berserk` is a marker, never a keyword.
 */
function isHeroCompositionMarker(value: string): boolean {
  for (const markerName of HERO_COMPOSITION_MARKER_NAMES) {
    if (markerName === value) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a string is a parameterized composition marker
 * (a name in PARAMETERIZED_COMPOSITION_MARKER_NAMES).
 *
 * Mirrors isHeroCompositionMarker, but for markers whose AST is BUILT per a parsed parameter
 * (empowered) rather than stored as a static HERO_COMPOSITION_MARKERS row (D-24044).
 */
function isParameterizedCompositionMarker(value: string): boolean {
  for (const markerName of PARAMETERIZED_COMPOSITION_MARKER_NAMES) {
    if (markerName === value) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves the unconditional core form of a parameterized Empowered marker, or undefined for
 * a deferred variant. Returns a built `gain-resource` composition ONLY when (a) the text
 * immediately after the marker is an anchored `by [hc:COLOR]` tail, AND (b) that color is the
 * line's SOLE condition (no prefix gate, no multi-class, no team gate). Any miss → undefined,
 * so the caller records an unresolved marker (the Honest-Partial Invariant). Does not mutate
 * `conditions`; the caller suppresses the consumed param on a match.
 *
 * @param textAfterMarker - The ability text immediately following the `[keyword:Empowered]` token.
 * @param conditions - The line's conditions (heroClassMatch + requiresTeam), in hook order.
 * @returns The built Empowered composition, or undefined for a deferred variant.
 */
function tryResolveEmpoweredCore(
  textAfterMarker: string,
  conditions: HeroCondition[],
): EffectNode | undefined {
  // why: D-24044 — anchored marker-tail match only; the color must immediately follow as
  // `by [hc:COLOR]`. A non-anchored scan would bind a later unrelated [hc:...] to Empowered.
  const tailMatch = EMPOWERED_PARAM_TAIL_PATTERN.exec(textAfterMarker);
  if (tailMatch === null) {
    return undefined;
  }
  const heroClass = normalizeTraitSlug(tailMatch[1]!);
  // why: D-24044 Honest-Partial — resolve ONLY when the consumed [hc:COLOR] param is the
  // line's sole condition. A residual condition (an [hc:X]:/[team:X]: prefix gate, a
  // multi-class `and [hc:Y]`, or a team gate) means a deferred variant → keep it hollow.
  const onlyCondition = conditions[0];
  if (
    conditions.length !== 1
    || onlyCondition === undefined
    || onlyCondition.type !== 'heroClassMatch'
    || onlyCondition.value !== heroClass
  ) {
    return undefined;
  }
  return buildEmpoweredComposition(heroClass);
}

// ---------------------------------------------------------------------------
// Parameterized reveal token parsing (forward-compat; D-24024)
// ---------------------------------------------------------------------------

/**
 * Parses a non-negative integer from a parameterized reveal token segment.
 *
 * @param value - The digit substring (e.g. the `2` of `cost-lte-2`).
 * @returns The parsed integer, or null when the segment is not all digits.
 */
function parseRevealTokenInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  return parseInt(value, 10);
}

/**
 * Parses a parameterized reveal predicate segment into a RevealPredicate.
 *
 * Grammar: `always` | `cost-zero` | `cost-odd` | `cost-lte-<n>` | `cost-gte-<n>`.
 *
 * @param token - The predicate segment of a `[keyword:reveal:...]` token.
 * @returns The RevealPredicate, or null when the segment is unrecognized.
 */
function parseRevealPredicateToken(token: string): RevealPredicate | null {
  if (token === 'always') {
    return { kind: 'always' };
  }
  if (token === 'cost-zero') {
    return { kind: 'cost-zero' };
  }
  if (token === 'cost-odd') {
    return { kind: 'cost-odd' };
  }
  if (token.startsWith('cost-lte-')) {
    const threshold = parseRevealTokenInteger(token.slice('cost-lte-'.length));
    return threshold === null ? null : { kind: 'cost-lte', threshold };
  }
  if (token.startsWith('cost-gte-')) {
    const threshold = parseRevealTokenInteger(token.slice('cost-gte-'.length));
    return threshold === null ? null : { kind: 'cost-gte', threshold };
  }
  return null;
}

/**
 * Parses a parameterized reveal action segment into a RevealAction.
 *
 * Grammar: `draw` | `ko` | `attack-by-cost` | `attack-fixed-<n>` |
 * `choose-discard-or-return`.
 *
 * @param token - One action segment (the `+`-joined parts are split by the caller).
 * @returns The RevealAction, or null when the segment is unrecognized.
 */
function parseRevealActionToken(token: string): RevealAction | null {
  if (token === 'draw') {
    return { kind: 'draw' };
  }
  if (token === 'ko') {
    return { kind: 'ko' };
  }
  if (token === 'attack-by-cost') {
    return { kind: 'attack-by-cost' };
  }
  if (token === 'choose-discard-or-return') {
    return { kind: 'choose-discard-or-return' };
  }
  if (token.startsWith('attack-fixed-')) {
    const amount = parseRevealTokenInteger(token.slice('attack-fixed-'.length));
    return amount === null ? null : { kind: 'attack-fixed', amount };
  }
  return null;
}

/**
 * Parses one parameterized reveal token (one RevealRule) from its captured
 * segments. Returns null when the predicate or any action segment is malformed —
 * a malformed token voids that one rule (safe-skip, no throw).
 *
 * @param predicateToken - The predicate segment.
 * @param actionsToken - The `+`-joined actions segment.
 * @param continueToken - The optional `continue` flag (undefined when absent).
 * @returns The RevealRule, or null when any segment is malformed.
 */
function parseRevealRuleToken(
  predicateToken: string,
  actionsToken: string,
  continueToken: string | undefined,
): RevealRule | null {
  const predicate = parseRevealPredicateToken(predicateToken);
  if (predicate === null) {
    return null;
  }
  const actions: RevealAction[] = [];
  for (const actionToken of actionsToken.split('+')) {
    const action = parseRevealActionToken(actionToken);
    if (action === null) {
      return null;
    }
    actions.push(action);
  }
  if (actions.length === 0) {
    return null;
  }
  const rule: RevealRule = { predicate, actions };
  if (continueToken === 'continue') {
    rule.continue = true;
  }
  return rule;
}

/**
 * Checks if a string is a valid HeroCountSource.
 *
 * Used to gate the count-scaled attack token: only a source in
 * HERO_COUNT_SOURCES produces an 'attack-per-count' effect; an unrecognized
 * source is ignored (no effect emitted).
 */
function isValidHeroCountSource(value: string): value is HeroCountSource {
  for (const source of HERO_COUNT_SOURCES) {
    if (source === value) {
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

        // why: D-24031 — assign primitiveEffects only when non-empty (mirror the
        // effects/conditions conditional construction — exactOptionalPropertyTypes
        // forbids `: x ?? undefined`). Each element is already a deep copy of its
        // registry AST, so the hook never aliases the shared HERO_COMPOSITION_MARKERS const.
        if (parsedAbility.primitiveEffects.length > 0) {
          hook.primitiveEffects = parsedAbility.primitiveEffects;
        }

        // why: WP-257 / D-24034 — assign unresolvedMarkers only when non-empty (same
        // exactOptionalPropertyTypes conditional-construction pattern). Absent means
        // "no unresolved marker" — flavor-text lines carry no markers and so omit it,
        // which is exactly what keeps flavor text from flagging hollow at runtime.
        if (parsedAbility.unresolvedMarkers.length > 0) {
          hook.unresolvedMarkers = parsedAbility.unresolvedMarkers;
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
