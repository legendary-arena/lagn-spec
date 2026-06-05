/**
 * Fight mastermind move for the Legendary Arena game engine.
 *
 * fightMastermind defeats the top tactic card from the mastermind's
 * tactics deck when the player has sufficient attack points. When all
 * tactics are defeated, the victory counter is set. Follows the
 * three-step validation contract: validate args, check stage gate,
 * mutate G.
 *
 * This is a non-core move that gates internally (same pattern as
 * fightVillain and recruitHero from WP-016). It is NOT added to
 * CoreMoveName, CORE_MOVE_NAMES, or MOVE_ALLOWED_STAGES.
 *
 * No registry imports. No .reduce(). Moves never throw.
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import { getAvailableAttack, spendAttack } from '../economy/economy.logic.js';
import { defeatTopTactic, areAllTacticsDefeated } from '../mastermind/mastermind.logic.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Fights the mastermind by defeating the top tactic card.
 *
 * Validates available attack against the mastermind's fight requirement,
 * defeats exactly one tactic per successful fight, and checks for
 * victory when all tactics are defeated.
 *
 * @param context - boardgame.io move context with G, ctx.
 */
// why: MVP defeats exactly 1 tactic per fight; multi-tactic defeat
// and tactic text effects are WP-024
export function fightMastermind(
  { G, ctx }: MoveContext,
): void {
  // Step 1: Validate
  if (G.mastermind.tacticsDeck.length === 0) {
    return;
  }

  // why: baseCardId is the canonical stats key; fightCost is the fight
  // requirement field per WP-018 D-1805; never use G.mastermind.id or
  // any tactic card ID for stat lookup
  const requiredFightCost = G.cardStats[G.mastermind.baseCardId]?.fightCost ?? 0;
  const availableAttack = getAvailableAttack(G.turnEconomy);

  // why: silent failure preserves deterministic move contract —
  // insufficient attack points means the mastermind fight cannot proceed
  if (availableAttack < requiredFightCost) {
    return;
  }

  // Step 2: Stage gate (non-core move, internal gating)
  // why: boss fight during action window; non-core moves gate internally
  // per WP-014A precedent (same pattern as fightVillain/recruitHero)
  if (G.currentStage !== 'main') return;

  // Step 3: Mutate G
  // why: capture the tactic card ID before defeatTopTactic moves it from
  // tacticsDeck to tacticsDefeated — the player earns this card in their
  // victory pile (tabletop Legendary: defeated tactics are VP cards).
  const defeatedTacticId = G.mastermind.tacticsDeck[0]!;
  G.mastermind = defeatTopTactic(G.mastermind);
  G.playerZones[ctx.currentPlayer]!.victory.push(defeatedTacticId);
  G.turnEconomy = spendAttack(G.turnEconomy, requiredFightCost);

  G.messages.push(
    `Player ${ctx.currentPlayer} fought mastermind "${G.mastermind.id}" and defeated a tactic.`,
  );

  if (areAllTacticsDefeated(G.mastermind)) {
    // why: setting MASTERMIND_DEFEATED counter to 1 triggers the endgame
    // evaluator from WP-010 — use constant, never string literal
    G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED] = 1;
    G.messages.push(
      `All tactics defeated — mastermind "${G.mastermind.id}" is vanquished!`,
    );
  }
}
