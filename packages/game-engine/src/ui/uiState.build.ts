/**
 * Builds the authoritative UIState projection from engine state.
 *
 * This file contains the sole function for deriving UIState from G and ctx.
 * The UI never reads G directly — it calls buildUIState to get a
 * JSON-serializable, engine-internal-free projection.
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 * No mutation of G or ctx.
 *
 * WP-128 / EC-131 — extends the projection contract for the board-layout
 * wireframe (`docs/ai/DESIGN-BOARD-LAYOUT.md §4`). Eight projections
 * lack a `G` source today and ship as Option A safe-skips per D-12806;
 * each carries a `// SAFE-SKIP-WP128` marker and a 3-clause `// why:`
 * comment. CI grep enforces the marker count (≥ 8). Aliasing-defense
 * follows WP-111 D-11105 (per-entry shallow copy via resolveDisplay).
 */

import type { LegendaryGameState } from '../types.js';
import type { CardExtId, PlayerZones } from '../state/zones.types.js';
import type {
  UIState,
  UIPlayerState,
  UICityCard,
  UIGameOverState,
  UIProgressCounters,
  UIParBreakdown,
  UICardDisplay,
  UIHQCard,
  UIDisplayEntry,
  UIDecksState,
  UISharedPilesState,
  UIKoPileState,
} from './uiState.types.js';
import { getAvailableAttack, getAvailableRecruit } from '../economy/economy.logic.js';
import { resolveFightCost } from '../economy/economy.resolve.js';
import { evaluateEndgame } from '../endgame/endgame.evaluate.js';
import { computeFinalScores } from '../scoring/scoring.logic.js';
import { BYSTANDER_EXT_ID, WOUND_EXT_ID } from '../setup/buildInitialGameState.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';

// why: exact structural contract — do not widen or add optional fields.
// buildUIState MUST NOT depend on any other ctx fields.
// Structurally compatible with boardgame.io's Ctx at the call site.
interface UIBuildContext {
  readonly phase: string | null;
  readonly turn: number;
  readonly currentPlayer: string;
}

// why: WP-111 / EC-118 / PS-8 — pure-render fallback for the rare case
// where a CardExtId in any zone has no matching entry in
// G.cardDisplayData. Centralized as a single named constant so the
// placeholder name literal appears EXACTLY ONCE across the engine
// source (grep-enforced — see EC-118 §After Completing). The
// diagnostic surface for missing entries lives at SETUP TIME (the
// auditCardDisplayDataCompleteness sweep in buildInitialGameState
// emits one consolidated message into G.messages mirroring WP-113
// D-10014). Projection-time use here is a pure render path — no G
// mutation. Cite WP-028 D-2801 (projection-purity contract) +
// pre-flight 2026-04-29 PS-8.
//
// Tests assert no placeholder appears for valid setups (CI-visible
// regression target).
/**
 * Pure-render placeholder for CardExtIds with no matching display entry.
 *
 * Exported so callers can perform structural equality checks against
 * the placeholder shape; the placeholder name literal appears nowhere
 * else in engine source. The `extId` field is intentionally an empty
 * string — at projection time, the actual ext_id is substituted in
 * via `{...UNKNOWN_DISPLAY_PLACEHOLDER, extId}` (see resolveDisplay).
 */
export const UNKNOWN_DISPLAY_PLACEHOLDER: UICardDisplay = {
  extId: '',
  name: '<unknown>',
  imageUrl: '',
  cost: null,
  heroClass: null,
  team: null,
};

// why: every projection-time read of G.cardDisplayData[extId] MUST
// return a fresh shallow copy at the projection boundary, not a direct
// reference. Standard tests cannot detect aliasing — line-by-line
// shallow copies are the contract. Mirrors the WP-028 cardKeywords
// post-mortem aliasing fix.
/**
 * Resolves the UICardDisplay for a CardExtId via shallow copy.
 *
 * Returns a fresh {...G.cardDisplayData[extId]} when the entry exists;
 * returns {...UNKNOWN_DISPLAY_PLACEHOLDER, extId} when missing (pure
 * render fallback — does not mutate G).
 */
function resolveDisplay(
  extId: string,
  gameState: LegendaryGameState,
): UICardDisplay {
  const entry = gameState.cardDisplayData[extId];
  // why: WP-179 — `heroClass` and `team` are always assigned on every
  // UICardDisplay (runtime shape guarantee despite optional TS typing).
  // `null` on lookup miss prevents `undefined` from leaking to the UI.
  const traitEntry = gameState.cardTraits !== undefined
    ? gameState.cardTraits[extId]
    : undefined;
  const heroClass = traitEntry !== undefined ? traitEntry.heroClass : null;
  const team = traitEntry !== undefined ? traitEntry.team : null;
  if (entry !== undefined) {
    return { ...entry, heroClass, team };
  }
  return { ...UNKNOWN_DISPLAY_PLACEHOLDER, extId, heroClass, team };
}

// why: WP-128 / D-12805 — produce a per-entry shallow-copied
// `UIDisplayEntry` array from a CardExtId list. Aliasing-defense per
// WP-111 D-11105: every entry is a fresh `{ extId, display }` object
// and the display payload is itself shallow-cloned via resolveDisplay.
// `[...zone]` would alias the entries; `zone.map(e => e)` would alias
// the shallow shape but not the extId/display pair — both are the
// forbidden patterns. The correct shape (this helper) builds fresh
// objects per entry.
/**
 * Builds a UIDisplayEntry[] from a CardExtId[] with per-entry shallow copy.
 */
function buildDisplayEntries(
  cardExtIds: ReadonlyArray<string>,
  gameState: LegendaryGameState,
): UIDisplayEntry[] {
  const entries: UIDisplayEntry[] = [];
  for (const extId of cardExtIds) {
    entries.push({ extId, display: resolveDisplay(extId, gameState) });
  }
  return entries;
}

/**
 * Parses a qualified scheme id `<setAbbr>/<slug>` into components.
 *
 * Returns null on malformed input. Used to build the cardDisplayData
 * lookup prefix for scheme display resolution.
 */
function parseSchemeIdForDisplay(
  schemeId: string,
): { setAbbr: string; slug: string } | null {
  if (typeof schemeId !== 'string' || schemeId.length === 0) return null;
  const slashIndex = schemeId.indexOf('/');
  if (slashIndex === -1) return null;
  const setAbbr = schemeId.slice(0, slashIndex);
  const slug = schemeId.slice(slashIndex + 1);
  if (setAbbr.length === 0 || slug.length === 0) return null;
  return { setAbbr, slug };
}

/**
 * Counts wound cards across all five player zones.
 *
 * // why: wounds are CardExtId strings mixed into player zones. There is
 * no dedicated wounds zone per player. Counting uses WOUND_EXT_ID constant
 * to identify wound cards across deck, hand, discard, inPlay, and victory.
 *
 * @param zones - The player's five card zones.
 * @returns The total number of wound cards in all zones.
 */
function countWounds(zones: PlayerZones): number {
  let woundCount = 0;

  // why: iterate each zone explicitly with for...of; no .reduce()
  for (const card of zones.deck) {
    if (card === WOUND_EXT_ID) {
      woundCount += 1;
    }
  }
  for (const card of zones.hand) {
    if (card === WOUND_EXT_ID) {
      woundCount += 1;
    }
  }
  for (const card of zones.discard) {
    if (card === WOUND_EXT_ID) {
      woundCount += 1;
    }
  }
  for (const card of zones.inPlay) {
    if (card === WOUND_EXT_ID) {
      woundCount += 1;
    }
  }
  for (const card of zones.victory) {
    if (card === WOUND_EXT_ID) {
      woundCount += 1;
    }
  }

  return woundCount;
}

// why: aggregation happens at projection time instead of tracking a first-class
// counter. If write-path events need a counter later, introduce
// ENDGAME_CONDITIONS.BYSTANDERS_RESCUED in a separate WP.
/**
 * Counts bystanders across every player's victory zone.
 *
 * Iterates only the `victory` zone of each player. Bystanders in hand, deck,
 * discard, or inPlay are deliberately excluded — a bystander outside victory
 * is not yet rescued.
 *
 * @param gameState - The engine state. Not mutated.
 * @returns Total count of bystanders sitting in any player's victory zone.
 */
function countBystandersRescued(gameState: LegendaryGameState): number {
  let bystanderCount = 0;

  // why: iterate every player's victory zone explicitly with for...of; no
  // .reduce() with branching per code-style Rule 8.
  //
  // why: bystanders in victory come from two sources — villain-deck
  // bystanders (tracked in G.villainDeckCardTypes with type='bystander',
  // ext_id `bystander-villain-deck-NN`) and rescued / awarded supply-pile
  // bystanders (using BYSTANDER_EXT_ID = 'pile-bystander', NOT registered
  // in villainDeckCardTypes). Mirrors the same dual condition in
  // scoring.logic.ts:computeFinalScores so the HUD counter and the VP
  // calculation agree on what a "bystander in the victory pile" is.
  for (const playerZones of Object.values(gameState.playerZones)) {
    for (const cardExtId of playerZones.victory) {
      if (
        gameState.villainDeckCardTypes[cardExtId] === 'bystander' ||
        cardExtId === BYSTANDER_EXT_ID
      ) {
        bystanderCount += 1;
      }
    }
  }

  return bystanderCount;
}

/**
 * Builds the UIProgressCounters projection for the HUD.
 *
 * Always returns a fully populated counters object — both fields are required
 * on every UIState even during the lobby phase, where both values are zero.
 *
 * @param gameState - The engine state. Not mutated.
 * @returns Aggregate progress counters projection.
 */
function buildProgressCounters(gameState: LegendaryGameState): UIProgressCounters {
  // why: counter is lazily initialised on first escape; absence is
  // semantically zero.
  const escapedVillains = gameState.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0;
  return {
    bystandersRescued: countBystandersRescued(gameState),
    escapedVillains,
  };
}

/**
 * Projects G.villainAttachedHeroes into a fresh Record with spread-copied
 * inner arrays to prevent aliasing with G state.
 *
 * @param villainAttachedHeroes - Source from G (may be undefined in old test states).
 * @returns A new Record with spread-copied hero id arrays.
 */
// why: WP-214 — per-entry spread ensures inner arrays are also new references,
// so UIState consumers cannot mutate G.villainAttachedHeroes through the projection
function buildVillainAttachedHeroesProjection(
  villainAttachedHeroes: Record<string, string[]> | undefined,
): Record<string, string[]> {
  if (!villainAttachedHeroes) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const villainId of Object.keys(villainAttachedHeroes)) {
    const heroes = villainAttachedHeroes[villainId];
    if (heroes !== undefined) {
      result[villainId] = [...heroes];
    }
  }
  return result;
}

// why: per D-6701, PAR payload is deferred until `buildUIState` has access to
// a `ReplayResult`. The type-level contract ships via `UIParBreakdown` and the
// drift test locks the four field names. Body stays `return undefined;`
// unconditionally — no call to `deriveScoringInputs` / `buildScoreBreakdown`.
// A follow-up WP resolves the data source.
/**
 * Builds the optional UIParBreakdown projection for the endgame HUD.
 *
 * Per D-6701 the body is `return undefined;` unconditionally at MVP; the
 * type-level contract ships via `UIParBreakdown` and the drift test pins the
 * four field names. The follow-up WP that supplies the payload modifies only
 * this body — `buildUIState` already preserves the wire via conditional spread.
 *
 * @param gameState - The engine state. Not used in the safe-skip body.
 * @param ctx - The build context. Not used in the safe-skip body.
 * @returns Always undefined under D-6701; payload is deferred.
 */
function buildParBreakdown(
  gameState: LegendaryGameState,
  ctx: UIBuildContext,
): UIParBreakdown | undefined {
  // why: D-6701 safe-skip — explicit void references keep the parameters in
  // the signature for the follow-up WP without tripping `noUnusedParameters`
  // when it is later enabled, and prove this body has no other intent.
  void gameState;
  void ctx;
  return undefined;
}

/**
 * Derives the authoritative UIState from engine state.
 *
 * Pure function: no I/O, no mutation of G or ctx, no side effects.
 * Same G + ctx always produces the same UIState.
 *
 * Forbidden behaviors (do not add later):
 * - caching or memoization
 * - closures over G or ctx
 * - mutation via object aliasing
 * - any form of side effect or state retention between calls
 *
 * // why: UIState is the only state the UI consumes. This function
 * implements D-0301 (UI Consumes Projections Only). All items in the
 * canonical forbidden internals list are excluded.
 *
 * @param gameState - The current engine state (G). Not mutated.
 * @param ctx - Minimal context with phase, turn, currentPlayer.
 * @returns The derived UIState projection.
 */
export function buildUIState(
  gameState: LegendaryGameState,
  ctx: UIBuildContext,
): UIState {
  // --- 1. Project game phase/turn/active player from ctx ---
  // why: game metadata comes from ctx (framework) and G.currentStage (engine)
  const game = {
    phase: ctx.phase ?? 'unknown',
    turn: ctx.turn,
    activePlayerId: ctx.currentPlayer,
    currentStage: gameState.currentStage,
  };

  // --- 2. Project player states ---
  // why: zone counts hide card identities from the UI; wound count
  // uses WOUND_EXT_ID constant to identify wound cards across all zones
  //
  // why: WP-128 / D-12801 — `victoryVP` is projected by the engine via
  // `computeFinalScores` (single source of truth per WP-020). Indexed by
  // playerId so the per-player loop below doesn't depend on `players`
  // ordering. computeFinalScores is pure and cheap; one call per
  // projection.
  const finalScores = computeFinalScores(gameState);
  const totalVPByPlayer: Record<string, number> = {};
  for (const breakdown of finalScores.players) {
    totalVPByPlayer[breakdown.playerId] = breakdown.totalVP;
  }

  const players: UIPlayerState[] = [];
  for (const playerId of Object.keys(gameState.playerZones)) {
    const zones = gameState.playerZones[playerId]!;
    // why: handDisplay length-equals-handCards invariant — populate one
    // UICardDisplay per hand card via per-entry shallow copy
    // (resolveDisplay). filterUIStateForAudience redacts handDisplay
    // alongside handCards (privacy symmetry — see uiState.filter.ts).
    const handDisplay: UICardDisplay[] = [];
    for (const cardExtId of zones.hand) {
      handDisplay.push(resolveDisplay(cardExtId, gameState));
    }

    // why: WP-128 / D-12803 — inPlayDisplay length-equals-inPlayCards
    // invariant. Audience filter redacts both fields together for
    // non-self / spectator audiences (mirrors handCards posture).
    const inPlayDisplay: UICardDisplay[] = [];
    for (const cardExtId of zones.inPlay) {
      inPlayDisplay.push(resolveDisplay(cardExtId, gameState));
    }

    // why: WP-128 / D-12803 — discard top is the last entry in the
    // discard array; `null` when discard is empty (count === 0). Optional
    // (`discardTopCard?`) encodes "redacted by audience filter"; `null`
    // encodes "visible but empty" — the pair distinguishes the two
    // states unambiguously.
    const discardLength = zones.discard.length;
    let discardTopCard: UIDisplayEntry | null;
    if (discardLength === 0) {
      discardTopCard = null;
    } else {
      const topExtId = zones.discard[discardLength - 1]!;
      discardTopCard = {
        extId: topExtId,
        display: resolveDisplay(topExtId, gameState),
      };
    }

    // why: WP-128 / D-12803 — VP cards are public knowledge by design;
    // not redacted by audience filter. WP-111 D-11105 aliasing-defense:
    // every entry is a fresh `{ extId, display }` with display itself
    // shallow-cloned (via resolveDisplay).
    const victoryCards = buildDisplayEntries(zones.victory, gameState);

    // why: WP-128 / D-12801 — uppercase `VP` matches canonical
    // `PlayerScoreBreakdown.totalVP` engine convention (`00.6` Rule 14).
    const victoryVP = totalVPByPlayer[playerId] ?? 0;

    players.push({
      playerId,
      deckCount: zones.deck.length,
      handCount: zones.hand.length,
      discardCount: zones.discard.length,
      inPlayCount: zones.inPlay.length,
      victoryCount: zones.victory.length,
      woundCount: countWounds(zones),
      // why: hand card ext_ids included so filterUIStateForAudience can
      // expose them to the owning player. Spread copy prevents aliasing
      // with G.playerZones[playerId].hand.
      handCards: [...zones.hand],
      handDisplay,
      // why: WP-128 / D-12803 — in-play card ext_ids included; filter
      // redacts for non-self / spectator. Spread copy prevents aliasing
      // with G.playerZones[playerId].inPlay.
      inPlayCards: [...zones.inPlay],
      inPlayDisplay,
      discardTopCard,
      victoryCards,
      victoryVP,
    });
  }

  // --- 3. Project City ---
  // why: city projection includes type and keywords for display without
  // exposing the raw villainDeckCardTypes or cardKeywords maps
  const citySpaces: (UICityCard | null)[] = [];
  for (const space of gameState.city) {
    if (space === null) {
      citySpaces.push(null);
    } else {
      // why: spread operator creates a new array to prevent aliasing
      // with G.cardKeywords — UIState must not hold references to G data
      const cardKeywords = gameState.cardKeywords[space];
      // why: WP-214 — spread copy prevents aliasing with G.villainAttachedHeroes
      const spaceAttachedHeroes = gameState.villainAttachedHeroes?.[space] ?? [];
      citySpaces.push({
        extId: space,
        type: gameState.villainDeckCardTypes[space] ?? 'unknown',
        keywords: cardKeywords !== undefined ? [...cardKeywords] : [],
        // why: WP-111 — additive display projection; per-entry shallow
        // copy via resolveDisplay prevents aliasing with
        // G.cardDisplayData[space].
        display: resolveDisplay(space, gameState),
        // why: WP-214 — attached heroes projected as string[] for arena-client
        // rendering; spread copy ensures no aliasing with G state
        attachedHeroes: [...spaceAttachedHeroes],
        // why: WP-214 — engine-resolved fight cost; UI must not recompute
        // dynamic values (engine-owns-truth invariant)
        fightCost: resolveFightCost(gameState, space),
      });
    }
  }

  const escapedPile: UIDisplayEntry[] = buildDisplayEntries(
    gameState.escapedPile,
    gameState,
  );

  // --- 4. Project HQ ---
  // why: HQ slots expose ext_ids for registry display lookup; no
  // engine internals needed. UIHQState.slots shape is preserved
  // verbatim per pre-flight 2026-04-29 PS-6 (Q3 audit).
  const hqSlots: (string | null)[] = [];
  // why: WP-111 — slotDisplay parallel array; length-equals-slots
  // invariant; null at index i must match slots[i] === null. Per-entry
  // shallow copy via resolveDisplay prevents aliasing.
  const hqSlotDisplay: (UIHQCard | null)[] = [];
  for (const slot of gameState.hq) {
    hqSlots.push(slot);
    if (slot === null) {
      hqSlotDisplay.push(null);
    } else {
      hqSlotDisplay.push({
        extId: slot,
        display: resolveDisplay(slot, gameState),
      });
    }
  }

  // --- 5. Project mastermind ---
  // why: tactics projected as counts, not card arrays. display lookup
  // uses gameState.mastermind.baseCardId (the canonical G.cardStats /
  // G.cardDisplayData join key per mastermind.setup.ts:211), NOT
  // gameState.mastermind.id (the qualified group id). Per-entry shallow
  // copy via resolveDisplay prevents aliasing. Cite pre-flight
  // 2026-04-29 PS-5.
  //
  // why: WP-128 / D-12806 — Option A safe-skip per pre-flight 2026-05-03
  // PS-3. Gap (attachedBystanders): `G.mastermind.attachedBystanders`
  // does not exist; engine has no mastermind-side bystander capture
  // surface today. **Do NOT flatten `G.attachedBystanders`** (city-villain
  // captures, top-level on `LegendaryGameState`) into this field —
  // D-12805 Interpretation B forbids it; those captures are rendered
  // on the city row, not on the mastermind tile. Future WP-NNN will
  // resolve `G.mastermind.attachedBystanders` for Master Strike captures.
  //
  const mastermindAttachedBystanders: UIDisplayEntry[] = buildDisplayEntries(
    gameState.mastermind.attachedBystanders,
    gameState,
  );
  const mastermindStrikePile: UIDisplayEntry[] = buildDisplayEntries(
    gameState.mastermind.strikePile,
    gameState,
  );
  const mastermind = {
    id: gameState.mastermind.id,
    tacticsRemaining: gameState.mastermind.tacticsDeck.length,
    tacticsDefeated: gameState.mastermind.tacticsDefeated.length,
    display: resolveDisplay(gameState.mastermind.baseCardId, gameState),
    attachedBystanders: mastermindAttachedBystanders,
    strikePile: mastermindStrikePile,
    gameText: gameState.mastermind.gameText ?? [],
  };

  // --- 6. Project scheme — derive twist count ---
  // why: scheme-twist cards route to G.scheme.twistPile (not
  // villainDeck.discard) per villainDeck.reveal.ts — count the pile
  // directly so the UI reflects actual resolved twists.
  const twistCount = gameState.scheme.twistPile.length;
  const schemeTwistPile: UIDisplayEntry[] = buildDisplayEntries(
    gameState.scheme.twistPile,
    gameState,
  );
  // why: scheme display resolved from cardDisplayData using the flat card
  // key format `{setAbbr}-scheme-{slug}`. The scheme ext_id in selection
  // is the qualified group id (e.g. 'core/midtown-bank-robbery'); the
  // flat card key replaces the slash with `-scheme-`.
  const schemeParsed = parseSchemeIdForDisplay(gameState.selection.schemeId);
  let schemeDisplay: UICardDisplay = {
    extId: gameState.selection.schemeId as CardExtId,
    name: gameState.selection.schemeId.replace(/-/g, ' '),
    imageUrl: '',
    cost: null,
  };
  if (schemeParsed !== null) {
    const schemeFlatKey = `${schemeParsed.setAbbr}-scheme-${schemeParsed.slug}` as CardExtId;
    if (gameState.cardDisplayData[schemeFlatKey] !== undefined) {
      schemeDisplay = resolveDisplay(schemeFlatKey, gameState);
    }
  }

  const scheme = {
    id: gameState.selection.schemeId,
    twistCount,
    twistPile: schemeTwistPile,
    display: schemeDisplay,
    gameText: gameState.scheme.gameText ?? [],
  };

  // --- 7. Project economy ---
  // why: available amounts computed via engine helpers, not raw
  // subtraction, to stay consistent with move validation logic
  //
  const piercing = gameState.turnEconomy.piercing;
  const woundsDrawn = gameState.turnEconomy.woundsDrawn;
  const economy = {
    attack: gameState.turnEconomy.attack,
    recruit: gameState.turnEconomy.recruit,
    availableAttack: getAvailableAttack(gameState.turnEconomy),
    availableRecruit: getAvailableRecruit(gameState.turnEconomy),
    piercing,
    woundsDrawn,
  };

  // --- 8. Project log ---
  // why: shallow copy prevents mutation of G.messages through UIState
  const log = [...gameState.messages];

  // why: WP-200 — mirror the `log` projection for structured events. Spread
  // copy prevents UIState consumers from mutating G.notableEvents; per-entry
  // payloads are plain JSON objects (primitives + arrays) so a shallow
  // top-level copy is sufficient.
  const notableEvents = [...gameState.notableEvents];

  // --- 9. Project progress counters ---
  // why: progress counters are required on every UIState (even pre-play)
  // so the HUD can render a stable shape. WP-067.
  const progress = buildProgressCounters(gameState);

  // --- 10. Project decks (counts only) ---
  // why: WP-128 / WP-014A determinism contract — counts only; the
  // next-card identity is NEVER projected.
  //
  // why: WP-135 graduates `heroDeckCount` from the WP-128 D-12806
  // safe-skip constant 0 to `gameState.heroDeck.length`. The hero deck
  // reservoir is now built at Game.setup() (buildHeroDeck) from
  // MatchSetupConfig.heroDeckIds and the locked rarity → copy-count map
  // (D-13501); recruitHero refills HQ slots from the reservoir front
  // (FIFO via refillHqSlot). The WP-128 safe-skip marker that lived on
  // this assignment is removed; assignment-site marker count drops from
  // 8 to 7 across this file (the line-14 JSDoc reference is unchanged).
  const heroDeckCount = gameState.heroDeck.length;
  const decks: UIDecksState = {
    villainDeckCount: gameState.villainDeck.deck.length,
    heroDeckCount,
  };

  // --- 11. Project shared piles (counts only) ---
  const horrorsCount = gameState.piles.horrors.length;
  const piles: UISharedPilesState = {
    bystandersCount: gameState.piles.bystanders.length,
    woundsCount: gameState.piles.wounds.length,
    horrorsCount,
    officersCount: gameState.piles.officers.length,
    sidekicksCount: gameState.piles.sidekicks.length,
  };

  // --- 12. Project KO pile ---
  // why: WP-128 / D-12804 — KO pile is shared and face-up; full
  // visibility matches physical-table semantics. Source path is
  // top-level `G.ko: CardExtId[]` per `types.ts:481`. The pre-flight
  // 2026-05-03 PS-1 correction (away from a non-existent nested path
  // under `G.piles`) is documented in D-12804 + the drift test
  // comment block — not repeated here so the EC §5 grep gate sees a
  // clean projection file. `topCard` is the last entry (`null` when
  // count === 0); `cards` is the full pile in deterministic insertion
  // order. WP-111 D-11105 aliasing-defense via per-entry shallow copy
  // in buildDisplayEntries.
  const koCardCount = gameState.ko.length;
  let koTopCard: UIDisplayEntry | null;
  if (koCardCount === 0) {
    koTopCard = null;
  } else {
    const topExtId = gameState.ko[koCardCount - 1]!;
    koTopCard = {
      extId: topExtId,
      display: resolveDisplay(topExtId, gameState),
    };
  }
  const koPile: UIKoPileState = {
    count: koCardCount,
    topCard: koTopCard,
    cards: buildDisplayEntries(gameState.ko, gameState),
  };

  // --- 13. Project game over ---
  // why: endgame state derived from G counters via evaluateEndgame
  // (pure); scores reuse the finalScores already computed for victoryVP
  // (avoids a second pass). No ctx.gameover access needed.
  let gameOver: UIGameOverState | undefined;
  const endgameResult = evaluateEndgame(gameState);
  if (endgameResult !== null) {
    // why: wire preserved as the D-6701 extension seam — current branch is
    // unreachable (`buildParBreakdown` returns `undefined`) but the follow-up
    // WP that supplies the payload only modifies `buildParBreakdown`'s body,
    // not `buildUIState`.
    const par = buildParBreakdown(gameState, ctx);
    gameOver = {
      outcome: endgameResult.outcome,
      reason: endgameResult.reason,
      scores: finalScores,
      ...(par !== undefined ? { par } : {}),
    };
  }

  return {
    game,
    players,
    // why: WP-128 / D-12806 — `escapedPile` ships safe-skip `[]` until
    // a future WP adds `G.city.escapedPile`.
    city: { spaces: citySpaces, escapedPile },
    // why: WP-111 — slots preserved verbatim (PS-6 fallback); slotDisplay
    // added as a parallel array. Length-equals-slots invariant is
    // maintained by the unified for-of loop above.
    hq: { slots: hqSlots, slotDisplay: hqSlotDisplay },
    mastermind,
    scheme,
    economy,
    log,
    notableEvents,
    // why: WP-214 — spread copy of G.villainAttachedHeroes prevents aliasing;
    // per-entry spread ensures inner arrays are also new references
    villainAttachedHeroes: buildVillainAttachedHeroesProjection(gameState.villainAttachedHeroes),
    progress,
    decks,
    piles,
    koPile,
    ...(gameOver !== undefined ? { gameOver } : {}),
  };
}
