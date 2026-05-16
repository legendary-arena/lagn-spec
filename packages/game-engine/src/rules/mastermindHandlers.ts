/**
 * Mastermind strike handler for the ImplementationMap.
 *
 * Produces RuleEffect[] when a mastermind strike card is revealed from
 * the villain deck. Captures one bystander from the supply onto the
 * mastermind per D-15401. Also increments a strike counter and queues
 * a message.
 *
 * No boardgame.io imports. No registry imports.
 */

import type { RuleEffect } from './ruleHooks.types.js';
import type { LegendaryGameState } from '../types.js';

/**
 * Mastermind strike handler for the ImplementationMap.
 *
 * Captures one bystander from the top of the bystander supply onto
 * G.mastermind.attachedBystanders. If the supply is empty, logs a
 * message and skips capture. Also increments the strike counter.
 *
 * @param gameState - Current game state (mutated for bystander capture).
 * @param _ctx - Context (unused — handlers produce effects, not phase transitions).
 * @param _payload - Trigger payload ({ cardId } from villain reveal).
 * @returns Array of RuleEffect descriptions to apply.
 */
export function mastermindStrikeHandler(
  gameState: LegendaryGameState,
  _ctx: unknown,
  _payload: unknown,
): RuleEffect[] {
  const effects: RuleEffect[] = [];

  if (gameState.piles.bystanders.length > 0) {
    const [captured, ...remainingBystanders] = gameState.piles.bystanders;
    gameState.piles.bystanders = remainingBystanders;
    gameState.mastermind.attachedBystanders = [
      ...gameState.mastermind.attachedBystanders,
      captured!,
    ];
  } else {
    // why: bystander supply exhausted, no capture per D-15401
    gameState.messages = [
      ...gameState.messages,
      '[Master Strike] Bystander supply is empty — no bystander captured.',
    ];
  }

  effects.push({
    type: 'modifyCounter',
    counter: 'masterStrikeCount',
    delta: 1,
  });

  effects.push({
    type: 'queueMessage',
    message: 'Mastermind strike revealed — strike count incremented.',
  });

  return effects;
}
