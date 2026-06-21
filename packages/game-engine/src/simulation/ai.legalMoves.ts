/**
 * Legal-move enumeration for the Legendary Arena balance simulation
 * framework.
 *
 * getLegalMoves is a pure function that enumerates every move currently
 * available to the active player. The AI policy can only choose from the
 * returned list — the same constraint a human player faces.
 *
 * No boardgame.io imports. No registry imports. No Math.random(). No
 * .reduce(). No IO.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { LegalMove } from './ai.types.js';
import { getAvailableAttack, getAvailableRecruit } from '../economy/economy.logic.js';
import { isGuardBlocking, getPatrolModifier } from '../board/boardKeywords.logic.js';
import { hasPendingKoHeroChoice } from '../moves/koHeroChoice.resolve.js';
import { selectDefaultKoTarget } from '../villain/villainEffects.execute.js';
import { hasPendingOptionalKoReward } from '../moves/optionalKoReward.resolve.js';
import { selectDefaultOptionalKoTarget } from '../hero/heroEffects.execute.js';

// why: simulation covers the play-phase only; lobby moves (setPlayerReady,
// startMatchIfReady) are excluded because runSimulation starts the per-game
// loop post-lobby via buildInitialGameState + an externally tracked
// phase = 'play'. Local constant per WP-032 D-3202 precedent — NOT a
// drift-pinned canonical array. Adding a new play-phase move in a future
// WP requires updating this constant explicitly.
const SIMULATION_MOVE_NAMES = [
  'drawCards',
  'playCard',
  'endTurn',
  'advanceStage',
  'revealVillainCard',
  'fightVillain',
  'recruitHero',
  'fightMastermind',
  'resolveKoHeroChoice',
  'resolveOptionalKoReward',
] as const;

// why: type is exported implicitly via the const array above; external
// consumers can derive it from the string literals in SIMULATION_MOVE_NAMES.
type SimulationMoveName = typeof SIMULATION_MOVE_NAMES[number];

// why: silence the unused-type diagnostic while keeping the type alias
// available for future maintainers who want to narrow LegalMove.name.
void (0 as unknown as SimulationMoveName);

/**
 * Minimum lifecycle context for legal-move enumeration.
 *
 * // why: getLegalMoves needs phase + currentStage + turn to decide which
 * moves are legal. Smaller analog of SimulationMoveContext.ctx. Local per
 * D-2801 (local structural interface pattern).
 */
export interface SimulationLifecycleContext {
  readonly phase: string;
  readonly turn: number;
  readonly currentPlayer: string;
  readonly numPlayers: number;
}

/**
 * Enumerates all legal moves for the active player.
 *
 * Pure function — deterministic, no side effects, no G mutation. The
 * returned array follows the canonical enumeration order locked by
 * pre-flight RS-13 so seeded selection is stable across refactors:
 *
 *   1. playCard intents — hand zone index ascending (if stage === 'main')
 *   2. recruitHero intents — HQ slot 0..4 ascending (if stage === 'main'
 *      and availableRecruit covers the slot's cost)
 *   3. fightVillain intents — City slot 0..4 ascending (if stage === 'main'
 *      and availableAttack covers baseFightCost + patrolModifier and the
 *      slot is not Guard-blocked)
 *   4. fightMastermind — one entry (if stage === 'main', tactics remain,
 *      and availableAttack covers the base-card fightCost)
 *   5. revealVillainCard — one entry if stage === 'start'
 *   6. advanceStage — one entry if stage !== 'cleanup'
 *   7. endTurn — one entry if stage === 'cleanup'
 *
 * // why: AI can only choose from legal moves — same constraint as human
 * players. Pre-flight RS-13 locks enumeration order; reordering silently
 * flips every seeded decision output. WP-032 D-3202 precedent: stage
 * gating is authoritative on the engine side, simulation mirrors it
 * read-only.
 *
 * @param gameState - The engine state. Not mutated.
 * @param context - Minimal lifecycle context (phase, turn, currentPlayer,
 *   numPlayers).
 * @returns LegalMove array in canonical enumeration order.
 */
export function getLegalMoves(
  gameState: LegendaryGameState,
  context: SimulationLifecycleContext,
): LegalMove[] {
  const legalMoves: LegalMove[] = [];
  const activePlayer = context.currentPlayer;
  const zones = gameState.playerZones[activePlayer];
  if (zones === undefined) {
    // why: fail-closed — active player has no zones (malformed state).
    // Return empty list; the runner's zero-legal-moves fallback handles
    // the degenerate case.
    return legalMoves;
  }

  // why: pending optional-KO-reward short-circuit (D-24019) — inserted BEFORE
  // the KO-hero short-circuit per the fixed precedence lock. While an
  // optional-KO-reward choice is pending the engine block-all guard freezes
  // every other move, so the bot must resolve it first. The single legal move
  // is resolveOptionalKoReward with the deterministic default target
  // (selectDefaultOptionalKoTarget: lowest cost, discard-before-hand, lowest
  // index) — the bot KOs and takes the reward and NEVER declines (decline is
  // human-only). defaultTarget is non-null here because the park requires ≥1
  // eligible card and the board is frozen. Returns a list of length EXACTLY 1.
  if (hasPendingOptionalKoReward(gameState)) {
    const defaultTarget = selectDefaultOptionalKoTarget(zones, gameState.cardStats);
    if (defaultTarget !== null) {
      return [{ name: 'resolveOptionalKoReward', args: defaultTarget }];
    }
    // why: defensive — if no target exists (engine-invariant violation), fail
    // closed with an empty list rather than emit an unresolvable move.
    return legalMoves;
  }

  // why: pending-KO short-circuit (D-24009) — when a KO-a-Hero choice is
  // pending the engine block-all guard freezes every other move, so the bot
  // must resolve it before anything else. The single legal move is
  // resolveKoHeroChoice with the legacy auto-resolution target
  // (selectDefaultKoTarget reuses selectKoHeroTarget over discard → hand →
  // inPlay), keeping the bot KO target byte-identical to the prior
  // auto-resolution for replay determinism. selectDefaultKoTarget is non-null
  // here because a choice is appended only when ≥2 eligible targets exist and
  // the board is frozen. Returns a list of length EXACTLY 1 — no other move
  // is appended or merged.
  if (hasPendingKoHeroChoice(gameState)) {
    const defaultTarget = selectDefaultKoTarget(zones);
    if (defaultTarget !== null) {
      return [{ name: 'resolveKoHeroChoice', args: defaultTarget }];
    }
    // why: defensive — if no target exists (engine-invariant violation), fail
    // closed with an empty list rather than emit an unresolvable move.
    return legalMoves;
  }

  const stage = gameState.currentStage;
  const availableAttack = getAvailableAttack(gameState.turnEconomy);
  const availableRecruit = getAvailableRecruit(gameState.turnEconomy);

  // 1. playCard intents — one entry per hand card, in hand order.
  // why: playCard args use cardId (ext_id), not hand index, per PlayCardArgs
  // in moves/coreMoves.types.ts. Duplicate ext_ids in hand (e.g., multiple
  // S.H.I.E.L.D. Agents) produce duplicate LegalMove entries; the policy may
  // select any, and the move dispatcher removes the first match from hand.
  if (stage === 'main') {
    for (const cardId of zones.hand) {
      legalMoves.push({ name: 'playCard', args: { cardId } });
    }
  }

  // 2. recruitHero intents — HQ slot 0..4 ascending (if affordable).
  if (stage === 'main') {
    for (let hqIndex = 0; hqIndex < gameState.hq.length; hqIndex++) {
      const slot: CardExtId | null = gameState.hq[hqIndex] ?? null;
      if (slot === null) continue;
      const requiredCost = gameState.cardStats[slot]?.cost ?? 0;
      if (availableRecruit >= requiredCost) {
        legalMoves.push({ name: 'recruitHero', args: { hqIndex } });
      }
    }
  }

  // 3. fightVillain intents — City slot 0..4 ascending (if affordable and
  //    not Guard-blocked).
  if (stage === 'main') {
    const cardKeywords = gameState.cardKeywords ?? {};
    for (let cityIndex = 0; cityIndex < gameState.city.length; cityIndex++) {
      const cityCard: CardExtId | null = gameState.city[cityIndex] ?? null;
      if (cityCard === null) continue;
      if (isGuardBlocking(gameState.city, cityIndex, cardKeywords)) continue;
      const baseFightCost = gameState.cardStats[cityCard]?.fightCost ?? 0;
      const patrolModifier = getPatrolModifier(cityCard, cardKeywords);
      const requiredFightCost = baseFightCost + patrolModifier;
      if (availableAttack >= requiredFightCost) {
        legalMoves.push({ name: 'fightVillain', args: { cityIndex } });
      }
    }
  }

  // 4. fightMastermind — at most one entry (affordable + tactics remain).
  if (stage === 'main' && gameState.mastermind.tacticsDeck.length > 0) {
    const mastermindFightCost =
      gameState.cardStats[gameState.mastermind.baseCardId]?.fightCost ?? 0;
    if (availableAttack >= mastermindFightCost) {
      legalMoves.push({ name: 'fightMastermind', args: {} });
    }
  }

  // 5. revealVillainCard — one entry if stage === 'start' AND the once-per-turn
  //    reveal allowance has not been consumed. The !villainRevealedThisTurn
  //    guard mirrors the move-level guard in villainDeck.reveal.ts so a bot
  //    policy that scores reveal highly cannot re-pick a guaranteed no-op reveal
  //    every move-step and spin the turn forever (never advancing to 'main').
  if (stage === 'start' && !gameState.villainRevealedThisTurn) {
    legalMoves.push({ name: 'revealVillainCard', args: {} });
  }

  // why: drawCards is no longer enumerated — the start-of-turn hand is drawn
  // automatically by the play-phase onBegin auto-draw (WP-236). Emitting
  // drawCards would only produce a guarded no-op (G.hasDrawnThisTurn is already
  // true after onBegin) and waste a bot move choice.

  // 6. advanceStage — one entry if not at cleanup.
  if (stage !== 'cleanup') {
    legalMoves.push({ name: 'advanceStage', args: {} });
  }

  // 7. endTurn — one entry if at cleanup.
  if (stage === 'cleanup') {
    legalMoves.push({ name: 'endTurn', args: {} });
  }

  // why: ordering locked by pre-flight RS-13 for deterministic seeded
  // selection; reordering silently flips every seeded decision output.
  return legalMoves;
}
