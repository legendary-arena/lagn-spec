/**
 * Pure narrative-composition helpers for `NotableGameEvent` records.
 *
 * Each composer takes plain string / number / array inputs and returns a
 * single-sentence English narrative. Composers have no `G`/`ctx` dependency,
 * import no game framework, and import no registry package — they are pure
 * functions, replay-deterministic by construction, and testable in
 * isolation via golden strings.
 *
 * Format strings are byte-stable: identical inputs produce identical output.
 * No `toLocaleString`, no `Intl.*`, no locale-sensitive formatters. No
 * conditional punctuation, no optional clauses that reorder segments.
 * Any change to a format string is a replay-affecting change and requires
 * re-pinning `PRE_WP080_HASH` + the sentinel `finalStateHash`.
 *
 * No `boardgame.io` import. No `@legendary-arena/registry` import.
 */

import type { VillainEffectKeyword } from '../rules/villainAbility.types.js';
import type { SchemeTwistResolverKey } from './notableEvents.types.js';

// ---------------------------------------------------------------------------
// Effect-keyword → human label
// ---------------------------------------------------------------------------

// why: pure-string mapping from machine keyword to a short human phrase used
// inside the Fight / Ambush narratives. Stable byte-for-byte; replay-locked.
// Adding a new keyword to `VillainEffectKeyword` requires adding a matching
// label here AND re-pinning the replay hashes.
const EFFECT_KEYWORD_LABELS: Readonly<Record<VillainEffectKeyword, string>> = {
  gainWoundEachPlayer: 'every player gained a wound',
  gainWoundCurrentPlayer: 'the active player gained a wound',
  koHeroCurrentPlayer: 'the active player KO’d a hero',
  heroDeckTopToEscape: 'the top of the hero deck escaped',
  captureBystander: 'a bystander was captured',
  koHeroEachPlayer: 'every player KO’d a hero',
};

/**
 * Returns the human label for a single effect keyword.
 *
 * Falls back to the raw keyword string on out-of-vocabulary input (defensive
 * — `VillainEffectKeyword` is a closed union, but a future widening must not
 * cause emissions to throw).
 *
 * @param effect - The effect keyword to label.
 * @returns Human-readable phrase for narratives.
 */
function labelForEffect(effect: VillainEffectKeyword): string {
  const label = EFFECT_KEYWORD_LABELS[effect];
  if (typeof label === 'string' && label.length > 0) return label;
  return effect;
}

/**
 * Joins a list of effect labels into a single phrase using comma + final "and".
 *
 * Byte-stable: identical inputs produce identical output. Empty array
 * returns `''`. Single entry returns that entry verbatim. Two entries
 * use " and " between them. Three or more entries use ", " between
 * entries with " and " before the last.
 *
 * @param effects - Effect keywords in dispatch order.
 * @returns Joined human phrase or empty string when no effects applied.
 */
function joinEffectLabels(effects: VillainEffectKeyword[]): string {
  if (effects.length === 0) return '';
  if (effects.length === 1) return labelForEffect(effects[0]!);
  if (effects.length === 2) {
    return `${labelForEffect(effects[0]!)} and ${labelForEffect(effects[1]!)}`;
  }
  const head: string[] = [];
  for (let index = 0; index < effects.length - 1; index += 1) {
    head.push(labelForEffect(effects[index]!));
  }
  const tail = labelForEffect(effects[effects.length - 1]!);
  return `${head.join(', ')}, and ${tail}`;
}

// ---------------------------------------------------------------------------
// Fight narrative
// ---------------------------------------------------------------------------

/**
 * Composes the single-sentence narrative for a `fightResolved` event.
 *
 * Inputs are pure values; no `G`/`ctx` access. `cardName` is the resolved
 * display name (or the raw `cardId` if `cardDisplayData` had no entry).
 *
 * @param cardName - Human-facing name of the defeated card.
 * @param bystandersRescued - Bystanders rescued into the victory pile (>= 0).
 * @param appliedEffects - Fight: effect keywords the executor applied.
 * @returns Single English sentence describing the resolved fight.
 */
export function composeFightNarrative(
  cardName: string,
  bystandersRescued: number,
  appliedEffects: VillainEffectKeyword[],
): string {
  const bystanderClause =
    bystandersRescued > 0
      ? ` and rescued ${String(bystandersRescued)} bystander(s)`
      : '';
  if (appliedEffects.length === 0) {
    return `Fought "${cardName}"${bystanderClause}.`;
  }
  const effectClause = joinEffectLabels(appliedEffects);
  return `Fought "${cardName}"${bystanderClause}; Fight effect: ${effectClause}.`;
}

// ---------------------------------------------------------------------------
// Ambush narrative
// ---------------------------------------------------------------------------

/**
 * Composes the single-sentence narrative for an `ambushResolved` event.
 *
 * The unconditional city-entry bystander attach is NOT an Ambush effect
 * and is never described here — only `appliedEffects` returned by
 * `executeVillainAbilities(...,'onAmbush')` are referenced.
 *
 * @param cardName - Human-facing name of the revealed villain.
 * @param appliedEffects - Ambush: effect keywords the executor applied.
 * @returns Single English sentence describing the resolved ambush.
 */
export function composeAmbushNarrative(
  cardName: string,
  appliedEffects: VillainEffectKeyword[],
): string {
  if (appliedEffects.length === 0) {
    return `"${cardName}" entered the city with no Ambush effect.`;
  }
  const effectClause = joinEffectLabels(appliedEffects);
  return `"${cardName}" ambushed: ${effectClause}.`;
}

// ---------------------------------------------------------------------------
// Scheme twist narrative
// ---------------------------------------------------------------------------

// why: pure-string mapping from camelCase resolver key to a stable English
// phrase. Locked byte-for-byte (replay-affecting) — adding a sixth resolver
// key requires expanding both the `SchemeTwistResolverKey` union AND this
// map, then re-pinning the replay hashes.
const RESOLVER_KEY_PHRASES: Readonly<Record<SchemeTwistResolverKey, string>> = {
  revealOrPunish: 'players were forced to reveal a matching hero or suffer a penalty',
  chainedReveals: 'extra villain-deck cards were revealed',
  woundAll: 'every player gained wounds',
  koFromHq: 'heroes were KO’d from the HQ',
  midtownBankRobbery: 'the Bank villain captured bystanders and another card was revealed',
};

/**
 * Composes the single-sentence narrative for a `schemeTwistResolved` event.
 *
 * @param cardName - Human-facing name of the scheme-twist card.
 * @param resolverKey - Which of the five locked resolvers handled the twist.
 * @returns Single English sentence describing the resolved scheme twist.
 */
export function composeSchemeTwistNarrative(
  cardName: string,
  resolverKey: SchemeTwistResolverKey,
): string {
  const phrase = RESOLVER_KEY_PHRASES[resolverKey] ?? resolverKey;
  return `Scheme Twist "${cardName}": ${phrase}.`;
}

// ---------------------------------------------------------------------------
// Mastermind strike narrative
// ---------------------------------------------------------------------------

/**
 * Composes the single-sentence narrative for a `mastermindStrikeResolved` event.
 *
 * @param cardName - Human-facing name of the strike card.
 * @returns Single English sentence describing the resolved mastermind strike.
 */
export function composeMastermindStrikeNarrative(cardName: string): string {
  return `Master Strike: "${cardName}" resolved.`;
}
