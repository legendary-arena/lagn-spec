/**
 * Notable game event type definitions for the Legendary Arena game engine.
 *
 * `NotableGameEvent` is the engine-emitted, JSON-serialisable, append-only
 * record of high-level player-visible outcomes. The discriminated union
 * carries five locked variants — `fightResolved`, `ambushResolved`,
 * `schemeTwistResolved`, `mastermindStrikeResolved`, `mastermindDefeated`
 * — each composed at its fire site via a pure narrative helper from
 * `notableEvents.compose.ts`.
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
 * Five variants in fixed canonical order: a Fight resolution, an Ambush
 * resolution at city entry, a Scheme Twist resolution, a Mastermind
 * Strike resolution, and a Mastermind defeat. `'mastermindDefeated'` was
 * added per D-20008 (citing D-20001) so the arena-client overlay can
 * report the win + bystander rescue — G.messages is not projected to
 * clients. Adding a sixth variant requires a new `DECISIONS.md` entry
 * (e.g., WP-186's eventual `'escapeResolved'` per D-20001).
 */
export type NotableGameEventType =
  | 'fightResolved'
  | 'ambushResolved'
  | 'schemeTwistResolved'
  | 'mastermindStrikeResolved'
  | 'mastermindDefeated';

// why: drift-detection array — must match `NotableGameEventType` exactly
// (the `notableEvents.types.test.ts` drift test asserts bidirectional
// parity + length + uniqueness). The five-entry canonical order is locked:
// `fightResolved` (Fight fire site), `ambushResolved` (Ambush fire site),
// `schemeTwistResolved` (Scheme Twist resolver terminal),
// `mastermindStrikeResolved` (Mastermind Strike handler terminal), and
// `mastermindDefeated` (fightMastermind vanquish fire site, D-20008).
// Adding `'escapeResolved'` for WP-186's onEscape fire site requires a
// new DECISIONS entry per D-20001.
/**
 * All notable game event types in canonical order. Single source of truth.
 */
export const NOTABLE_EVENT_TYPES: readonly NotableGameEventType[] = [
  'fightResolved',
  'ambushResolved',
  'schemeTwistResolved',
  'mastermindStrikeResolved',
  'mastermindDefeated',
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
 * Emitted by `moves/fightMastermind.ts` when a player defeats the final
 * tactic and vanquishes the Mastermind. Payload observes post-mutation
 * state: every bystander the Mastermind had captured has already been
 * moved into the defeating player's victory pile and `bystandersRescued`
 * is that count (>= 0). Added per D-20008 so the arena-client overlay can
 * surface the win + rescue — `G.messages` is not projected to clients.
 */
export interface MastermindDefeatedEvent {
  /** Discriminator. */
  type: 'mastermindDefeated';
  /** boardgame.io player-index string ("0", "1", ...) of the defeating player. */
  playerId: string;
  /** Config ext_id of the defeated mastermind (`G.mastermind.id`). */
  mastermindId: CardExtId;
  /** Bystanders rescued into the player's victory pile on defeat (>= 0). */
  bystandersRescued: number;
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
  | MastermindStrikeResolvedEvent
  | MastermindDefeatedEvent;
