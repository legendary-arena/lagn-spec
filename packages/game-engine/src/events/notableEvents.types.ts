/**
 * Notable game event type definitions for the Legendary Arena game engine.
 *
 * `NotableGameEvent` is the engine-emitted, JSON-serialisable, append-only
 * record of high-level player-visible outcomes. The discriminated union
 * carries four locked variants — `fightResolved`, `ambushResolved`,
 * `schemeTwistResolved`, `mastermindStrikeResolved` — each composed at
 * its fire site via a pure narrative helper from `notableEvents.compose.ts`.
 *
 * Consumed by `UIState.notableEvents` for descriptive "what happened"
 * overlays in the arena client. WP-200 ships the engine half; WP-201
 * (paired follow-on) consumes it.
 *
 * No `boardgame.io` import. No `@legendary-arena/registry` import. Pure
 * types only — no runtime behaviour lives in this module.
 */

import type { CardExtId } from '../state/zones.types.js';
import type { VillainEffectKeyword } from '../rules/villainAbility.types.js';

// ---------------------------------------------------------------------------
// NotableGameEventType
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of notable game event types.
 *
 * Four variants in fixed canonical order: a Fight resolution, an Ambush
 * resolution at city entry, a Scheme Twist resolution, and a Mastermind
 * Strike resolution. Adding a fifth variant requires a new WP and a
 * `DECISIONS.md` entry (e.g., WP-186's eventual `'escapeResolved'` per
 * D-20001).
 */
export type NotableGameEventType =
  | 'fightResolved'
  | 'ambushResolved'
  | 'schemeTwistResolved'
  | 'mastermindStrikeResolved';

// why: drift-detection array — must match `NotableGameEventType` exactly
// (the `notableEvents.types.test.ts` drift test asserts bidirectional
// parity + length + uniqueness). The four-entry canonical order is locked:
// `fightResolved` (Fight fire site), `ambushResolved` (Ambush fire site),
// `schemeTwistResolved` (Scheme Twist resolver terminal), and
// `mastermindStrikeResolved` (Mastermind Strike handler terminal). Adding
// `'escapeResolved'` for WP-186's onEscape fire site requires WP-186's
// follow-up WP per D-20001 — not this WP.
/**
 * All notable game event types in canonical order. Single source of truth.
 */
export const NOTABLE_EVENT_TYPES: readonly NotableGameEventType[] = [
  'fightResolved',
  'ambushResolved',
  'schemeTwistResolved',
  'mastermindStrikeResolved',
] as const;

// ---------------------------------------------------------------------------
// SchemeTwistResolverKey
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of camelCase scheme-twist resolver keys.
 *
 * Locked to the five WP-182 resolver framework entries. Each key maps to a
 * resolver function in `schemeTwistResolvers.ts`. The resolver registry
 * keys are hyphen-case identifiers (`'reveal-or-punish'`, etc.) — this
 * union is the camelCase form embedded in `SchemeTwistResolvedEvent.resolverKey`
 * so UI consumers receive a JavaScript-idiomatic key.
 */
export type SchemeTwistResolverKey =
  | 'revealOrPunish'
  | 'chainedReveals'
  | 'woundAll'
  | 'koFromHq'
  | 'midtownBankRobbery';

// why: drift-detection array — must match `SchemeTwistResolverKey` exactly.
// The five-entry canonical order tracks WP-182's resolver framework
// byte-for-byte. Adding a sixth (e.g., a new scheme's resolver) tracks with
// WP-182, not WP-200 — the resolver framework owns its own vocabulary.
/**
 * All scheme-twist resolver keys in canonical order. Single source of truth.
 */
export const SCHEME_TWIST_RESOLVER_KEYS: readonly SchemeTwistResolverKey[] = [
  'revealOrPunish',
  'chainedReveals',
  'woundAll',
  'koFromHq',
  'midtownBankRobbery',
] as const;

// ---------------------------------------------------------------------------
// Event payload interfaces
// ---------------------------------------------------------------------------

/**
 * Emitted by `moves/fightVillain.ts` when a player defeats a villain or
 * henchman in the City. Payload observes post-mutation state: the card is
 * already in the player's victory pile, bystanders have been awarded, and
 * `appliedEffects` lists the Fight: effects that actually mutated G
 * (dispatch order from the executor).
 */
export interface FightResolvedEvent {
  /** Discriminator. */
  type: 'fightResolved';
  /** boardgame.io player-index string ("0", "1", ...) of the defeating player. */
  playerId: string;
  /** Zone-instance ext_id of the defeated villain or henchman. */
  cardId: CardExtId;
  /** City space the defeated card occupied (0..4). */
  citySpace: number;
  /** Count of bystanders rescued into the player's victory pile by this fight. */
  bystandersRescued: number;
  /** Fight: effect keywords that the executor actually applied, in dispatch order. */
  appliedEffects: VillainEffectKeyword[];
  /** Engine-composed single-sentence English narrative. */
  narrative: string;
}

/**
 * Emitted by `villainDeck/villainDeck.reveal.ts` when a villain with at
 * least one Ambush: marker enters the City. Fires AFTER
 * `executeVillainAbilities(...,'onAmbush')` and BEFORE the unrelated
 * unconditional city-entry bystander attach. The unconditional attach is
 * NOT an Ambush effect — it is the MVP city-entry rule and is excluded
 * from `appliedEffects` and from the narrative.
 */
export interface AmbushResolvedEvent {
  /** Discriminator. */
  type: 'ambushResolved';
  /** Zone-instance ext_id of the villain that entered the City. */
  revealedCardId: CardExtId;
  /** City space the villain entered (0..4). */
  citySpace: number;
  /** Ambush: effect keywords the executor applied, in dispatch order. */
  appliedEffects: VillainEffectKeyword[];
  /** Engine-composed single-sentence English narrative. */
  narrative: string;
}

/**
 * Emitted by each resolver in `rules/schemeTwistResolvers.ts` after the
 * resolver finishes mutating G. `resolverKey` identifies which of the five
 * resolver implementations ran (camelCase per `SchemeTwistResolverKey`).
 */
export interface SchemeTwistResolvedEvent {
  /** Discriminator. */
  type: 'schemeTwistResolved';
  /** Zone-instance ext_id of the scheme-twist card that triggered. */
  twistCardId: CardExtId;
  /** Which of the five locked resolvers handled the twist. */
  resolverKey: SchemeTwistResolverKey;
  /** Engine-composed single-sentence English narrative. */
  narrative: string;
}

/**
 * Emitted by `rules/mastermindHandlers.ts:mastermindStrikeHandler` after
 * the strike's state mutations (bystander-onto-mastermind capture +
 * per-mastermind text effects). `strikeCardId` is the trigger payload's
 * ext_id (the generic `master-strike-NN` token in MVP).
 */
export interface MastermindStrikeResolvedEvent {
  /** Discriminator. */
  type: 'mastermindStrikeResolved';
  /** Zone-instance ext_id of the strike card that triggered. */
  strikeCardId: CardExtId;
  /** Engine-composed single-sentence English narrative. */
  narrative: string;
}

/**
 * Closed discriminated union of every notable game event variant.
 *
 * Append-only on `G.notableEvents` at runtime. JSON-serialisable. Event
 * identity is implicit by index position in the array — no `eventId`,
 * `seq`, or `timestamp` field exists per D-20001 minimal-payload contract.
 */
export type NotableGameEvent =
  | FightResolvedEvent
  | AmbushResolvedEvent
  | SchemeTwistResolvedEvent
  | MastermindStrikeResolvedEvent;
