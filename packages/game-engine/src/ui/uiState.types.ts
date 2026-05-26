/**
 * UI state type definitions for the Legendary Arena game engine.
 *
 * UIState is the authoritative UI state contract. It is the only state
 * the UI consumes. The UI never reads G directly — it receives UIState,
 * a projection built from G and ctx by buildUIState.
 *
 * All types are JSON-serializable. No engine internals are exposed.
 *
 * Implements D-0301 (UI Consumes Projections Only).
 *
 * WP-128 / EC-131 — extends UIState with the projection contract for the
 * board-layout wireframe (`docs/ai/DESIGN-BOARD-LAYOUT.md §4`). New
 * top-level fields: `decks`, `piles`, `koPile`. New per-player optional
 * fields: `inPlayCards?`, `inPlayDisplay?`, `discardTopCard?`,
 * `victoryCards?`, `victoryVP?`. New required fields on existing types:
 * `mastermind.attachedBystanders`, `mastermind.strikePile`,
 * `scheme.twistPile`, `city.escapedPile`, `economy.piercing`,
 * `economy.woundsDrawn`. Eight projections lack a `G` source today and
 * ship as Option A safe-skips per D-12806 — see `uiState.build.ts`.
 */

import type { FinalScoreSummary } from '../scoring/scoring.types.js';

// why: UIState is the only data the UI sees. All items in the canonical
// forbidden internals list (hookRegistry, ImplementationMap, cardStats,
// heroAbilityHooks, villainDeckCardTypes, schemeSetupInstructions, registry
// objects, setup builders) are hidden to prevent logic leakage and maintain
// the Layer Boundary. Implements D-0301 (UI Consumes Projections Only).

/**
 * The authoritative UI state contract.
 *
 * Derived from G and ctx by buildUIState. The UI never reads G directly.
 * JSON-serializable. Contains no engine internals.
 *
 * // why: WP-128 / EC-131 — `decks`, `piles`, `koPile` added as required
 * top-level fields so the board-layout wireframe binds to a stable shape.
 * Each is always-present (deterministic safe-skip when the underlying G
 * source is absent — see D-12806).
 */
export interface UIState {
  game: {
    phase: string;
    turn: number;
    activePlayerId: string;
    currentStage: string;
  };
  players: UIPlayerState[];
  city: UICityState;
  hq: UIHQState;
  mastermind: UIMastermindState;
  scheme: UISchemeState;
  economy: UITurnEconomyState;
  log: string[];
  progress: UIProgressCounters;
  decks: UIDecksState;
  piles: UISharedPilesState;
  koPile: UIKoPileState;
  gameOver?: UIGameOverState;
}

/**
 * Display-safe card data projected once at setup time and surfaced through
 * UIState. Read-only. JSON-serializable. Contains only primitive fields.
 *
 * Field set is locked at exactly six entries — adding `setName`,
 * `cardType`, `attack`, `recruit`, or `keywords` here is scope creep
 * and requires a separate WP. The drift-detection test in
 * uiState.types.drift.test.ts pins the field set.
 *
 * // why: gives the UI enough to render a real card (name + image + cost)
 * without granting the client a runtime registry import. Mirrors the
 * G.cardStats / G.villainDeckCardTypes setup-snapshot pattern (sibling
 * to WP-018, WP-014B). Sourced once at Game.setup() from the registry
 * and never mutated thereafter.
 */
export interface UICardDisplay {
  extId: string;
  name: string;
  imageUrl: string;
  cost: number | null;
  heroClass?: string | null;
  team?: string | null;
}

/**
 * Display-bearing entry for an occupied HQ slot.
 *
 * Two-field shape locked: extId (the canonical join key, repeated for UI
 * convenience and drift-detection sanity) plus the display payload.
 */
export interface UIHQCard {
  extId: string;
  display: UICardDisplay;
}

/**
 * Generic display-bearing entry: the (extId, display) pair used by every
 * face-up pile / array projection in WP-128.
 *
 * // why: WP-128 / D-12805 — defined once and reused by `victoryCards`,
 * `strikePile`, `twistPile`, `escapedPile`, `koPile.cards`, `koPile.topCard`,
 * `discardTopCard`, and `attachedBystanders`. Repeating the inline literal
 * `{ extId: string; display: UICardDisplay }` at every consumer site is
 * a DRY violation; the shared alias keeps the projection contract uniform.
 */
export interface UIDisplayEntry {
  extId: string;
  display: UICardDisplay;
}

/**
 * Per-player state projection. Zones projected as counts — not card arrays.
 *
 * // why: zone counts prevent the UI from accessing card identities it
 * shouldn't see (other players' hands, decks). Card display resolution
 * is a separate UI concern using the registry.
 */
export interface UIPlayerState {
  playerId: string;
  deckCount: number;
  handCount: number;
  discardCount: number;
  inPlayCount: number;
  victoryCount: number;
  woundCount: number;
  /**
   * Hand card ext_ids. Present for the viewing player's own hand;
   * undefined (redacted) for other players and spectators.
   *
   * // why: active player needs to see their own hand cards for gameplay.
   * Other players and spectators see handCount only to prevent information
   * leakage. buildUIState always populates this; filterUIStateForAudience
   * redacts it based on audience.
   */
  handCards?: string[];
  /**
   * Per-hand-card display data, parallel-aligned with handCards by index.
   * Length matches handCards exactly when both are present. Redacted
   * (omitted) alongside handCards by filterUIStateForAudience.
   *
   * // why: parallel-array form preserves backwards compatibility on the
   * existing `handCards: string[]` shape — consumers that read handCards
   * continue to work; new consumers opt into handDisplay for display
   * fields. Mirrors the WP-029 D-2902 exactOptionalPropertyTypes
   * conditional-assignment pattern: the projection and filter never
   * write `handDisplay: undefined` literally.
   */
  handDisplay?: UICardDisplay[];
  /**
   * In-play card ext_ids for this player's currently-played cards.
   *
   * // why: WP-128 / D-12803 — redacted by `filterUIStateForAudience` for
   * `audience !== ownPlayerId` and for `'spectator'`. Mirrors the
   * `handCards` privacy posture: in-play cards are technically face-up
   * at the physical table, but the wireframe shows count-only in
   * opponent panels. Length matches `inPlayCount` exactly when present.
   */
  inPlayCards?: string[];
  /**
   * Per-in-play-card display data, parallel-aligned with `inPlayCards`.
   *
   * // why: WP-128 / D-12803 — privacy-symmetric with `inPlayCards`;
   * leaking display data is identical to leaking the CardExtId.
   * Redacted (omitted) alongside `inPlayCards` by the audience filter.
   */
  inPlayDisplay?: UICardDisplay[];
  /**
   * Top of this player's discard pile, or `null` when the discard is empty.
   *
   * // why: WP-128 / D-12803 — optional AND nullable encodes two distinct
   * states: optional (`undefined`) means "redacted by audience filter";
   * `null` means "visible but empty (`discardCount === 0`)". Without this
   * distinction the `?: T | null` shape reads ambiguous. Discard top is
   * face-up at the physical table — public to all audiences.
   */
  discardTopCard?: UIDisplayEntry | null;
  /**
   * Full victory-pile contents for this player.
   *
   * // why: WP-128 / D-12803 — VP cards are public knowledge by design
   * (VP is built from face-up resolved cards). NOT redacted by the
   * audience filter. Length matches `victoryCount` exactly when present.
   * Per-entry shallow copy via `resolveDisplay` per WP-111 D-11105
   * aliasing-defense.
   */
  victoryCards?: UIDisplayEntry[];
  /**
   * Total VP this player has accumulated, derived from
   * `computeFinalScores(G).players[i].totalVP`.
   *
   * // why: WP-128 / D-12801 — projected by the engine, not computed by
   * the UI. Field name uses uppercase `VP` to match the canonical
   * `PlayerScoreBreakdown.totalVP` engine convention (`00.6` Rule 14).
   * The `?` flags audience-redaction parity with `victoryCards?` (both
   * go together).
   */
  victoryVP?: number;
}

/**
 * Display-safe card info for a card in the City.
 *
 * // why: contains only display-safe data — ext_id for registry lookup,
 * type for visual classification, keywords for gameplay indicators, and
 * the setup-snapshotted display payload. No engine internals.
 */
export interface UICityCard {
  extId: string;
  type: string;
  keywords: string[];
  display: UICardDisplay;
}

/**
 * City zone projection with display-safe card info.
 *
 * // why: WP-128 / D-12806 — `escapedPile` ships as `[]` until a future
 * WP adds `G.city.escapedPile` for escaped-villain card preservation
 * (today only the counter `G.counters[ESCAPED_VILLAINS]` increments).
 * The composition counter is unaffected by this projection.
 */
export interface UICityState {
  spaces: (UICityCard | null)[];
  escapedPile: UIDisplayEntry[];
}

/**
 * HQ zone projection with ext_ids for display lookup.
 *
 * // why: `slots` shape preserved verbatim per pre-flight 2026-04-29 PS-6
 * (Q3 written audit blocked the breaking-change form — HQRow.vue and
 * HQRow.test.ts iterate `slots` as bare strings and live outside the
 * 9-file allowlist). The new `slotDisplay?` parallel array carries the
 * display payload aligned by index; `null` at position i in slotDisplay
 * matches `slots[i] === null` exactly. Mirrors the handCards / handDisplay
 * parallel-array pattern.
 */
export interface UIHQState {
  slots: (string | null)[];
  slotDisplay?: (UIHQCard | null)[];
}

/**
 * Mastermind projection with identity and tactics counts.
 *
 * // why: `display` is keyed internally by gameState.mastermind.baseCardId
 * (the canonical G.cardStats / G.cardDisplayData join key per pre-flight
 * 2026-04-29 PS-5); `id` continues to expose the qualified group id
 * (e.g., "core/dr-doom"). UI consumers never see the join key.
 *
 * // why: WP-128 / D-12805 — `attachedBystanders` represents bystanders
 * captured by the mastermind itself (Master Strike effects, per
 * Interpretation B). Engine has no source today; ships as `[]` per
 * D-12806 safe-skip. **Do NOT flatten `G.attachedBystanders`** (city-villain
 * captures, top-level on `LegendaryGameState`) — those captures are
 * rendered on the city row, not on the mastermind tile.
 *
 * // why: WP-128 / D-12806 — `strikePile` ships as `[]` until a future
 * WP adds `G.mastermind.strikePile` so resolved Master Strike cards are
 * preserved for replay (today they live in `G.villainDeck.discard`).
 */
export interface UIMastermindState {
  id: string;
  tacticsRemaining: number;
  tacticsDefeated: number;
  display: UICardDisplay;
  attachedBystanders: UIDisplayEntry[];
  strikePile: UIDisplayEntry[];
}

/**
 * Scheme projection with identity and twist count.
 *
 * // why: WP-128 / D-12806 — `twistPile` ships as `[]` until a future
 * WP adds `G.scheme.twistPile` so resolved Scheme Twist cards are
 * preserved for replay. The existing `twistCount` (already derived from
 * `villainDeck.discard`) is unaffected.
 */
export interface UISchemeState {
  id: string;
  twistCount: number;
  twistPile: UIDisplayEntry[];
}

/**
 * Economy projection with totals and available amounts.
 *
 * // why: WP-128 / D-12806 — `piercing` and `woundsDrawn` ship as `0`
 * until future WPs add `G.turnEconomy.piercing` (and the move logic
 * that increments it) and `G.turnEconomy.woundsDrawn` (and the
 * wound-draw tracking it requires).
 */
export interface UITurnEconomyState {
  attack: number;
  recruit: number;
  availableAttack: number;
  availableRecruit: number;
  piercing: number;
  woundsDrawn: number;
}

/**
 * Shared deck reservoirs surfaced as counts only.
 *
 * // why: WP-128 / WP-014A determinism contract — counts only; the
 * next-card identity is NEVER projected. Revealing future villain or
 * hero cards would break replay determinism. `heroDeckCount` ships as
 * `0` per D-12806 safe-skip until a future WP adds a hero-deck
 * reservoir on `G` (today HQ is static post-setup).
 */
export interface UIDecksState {
  villainDeckCount: number;
  heroDeckCount: number;
}

/**
 * Shared global pile counts (Bystanders / Wounds / Horrors / Officers /
 * Sidekicks).
 *
 * // why: WP-128 — counts only; pile contents are not card-identity-stable
 * sources for board-layout rendering. `horrorsCount` is always present
 * with `0` default per D-12802 (avoids `?: number` ergonomics tax) and
 * ships as the safe-skip default per D-12806.
 */
export interface UISharedPilesState {
  bystandersCount: number;
  woundsCount: number;
  horrorsCount: number;
  officersCount: number;
  sidekicksCount: number;
}

/**
 * KO pile projection — count, top card, and full contents.
 *
 * // why: WP-128 / D-12804 — KO pile is shared (NOT per-player) and
 * face-up; full visibility matches physical-table semantics. `topCard`
 * is the last entry (`null` when count === 0); `cards` is the full
 * pile in deterministic insertion order. Source path is top-level
 * `G.ko: CardExtId[]` per `types.ts:481` — NOT `G.piles.ko` (no such
 * path exists; pre-flight 2026-05-03 PS-1 corrected this).
 */
export interface UIKoPileState {
  count: number;
  topCard: UIDisplayEntry | null;
  cards: UIDisplayEntry[];
}

/**
 * Game-over projection with outcome, reason, and optional scores.
 */
export interface UIGameOverState {
  outcome: string;
  reason: string;
  scores?: FinalScoreSummary;
  par?: UIParBreakdown;
}

// why: projected for WP-062 HUD consumption; `bystandersRescued` aggregates
// from each player's victory pile, `escapedVillains` surfaces
// G.counters[ESCAPED_VILLAINS]. See WP-067.
/**
 * Aggregate progress counters projected from G for HUD display.
 *
 * Both fields are derived at projection time from authoritative G state and
 * are required on every UIState — even during the lobby phase, where both
 * values are zero.
 */
export interface UIProgressCounters {
  /** Aggregate count of bystanders in every player's victory zone. */
  bystandersRescued: number;
  /** Cumulative count of villains that escaped the City. */
  escapedVillains: number;
}

// why: verbatim name-for-name mirror of WP-048 ScoreBreakdown so WP-062
// aria-labels bind to a single contract. Optional on UIGameOverState because
// not every match is PAR-scored; under D-6701 MVP the payload is deferred and
// the field is always omitted at runtime.
/**
 * PAR scoring breakdown projection for the endgame HUD.
 *
 * Field names mirror WP-048's ScoreBreakdown verbatim so WP-062 aria-labels
 * bind to a single contract. Per D-6701 the payload is deferred until the
 * follow-up WP wires `ReplayResult` into `buildUIState`; the type-level
 * contract ships here so the drift test pins the four field names today.
 */
export interface UIParBreakdown {
  /** Raw score before applying PAR baseline. */
  rawScore: number;
  /** Baseline PAR score for the scenario. */
  parScore: number;
  /** Final score after applying PAR baseline and penalty events. */
  finalScore: number;
  /** Version stamp of the ScenarioScoringConfig used to compute the breakdown. */
  scoringConfigVersion: number;
}

export type { UIAudience } from './uiAudience.types.js';
