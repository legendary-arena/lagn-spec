/**
 * Mastermind strike handler dispatcher for the ImplementationMap.
 *
 * The exported `mastermindStrikeHandler` is a dispatcher that branches on
 * `G.selection.mastermindId`. Per-mastermind handlers implement card-text
 * effects (e.g., Magneto forces each player to discard down to four cards).
 * The generic strike-counter increment and the D-15401 bystander capture
 * run for every mastermind so card-specific handlers stay focused on the
 * card text.
 *
 * No boardgame.io imports. No registry imports.
 */

import type { RuleEffect } from './ruleHooks.types.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';
import type { LegendaryGameState } from '../types.js';

// why: mastermind ext_id constants — matching against
// G.selection.mastermindId for per-mastermind dispatch. Strings come from
// the registry; the runtime loadout
// (apps/arena-client/public/loadout-test.json) and tests use
// `core/<slug>`.
const MASTERMIND_MAGNETO = 'core/magneto';

// why: Magneto Master Strike text: "Each player reveals an [team:x-men]
// Hero or discards down to four cards." MVP takes the punitive branch —
// each player discards down to four — because the engine has no
// reveal-and-choose UI mechanic yet and G.cardKeywords does not carry
// team affiliation. A future WP can add team-aware reveal logic.
const MAGNETO_HAND_SIZE_LIMIT = 4;

/**
 * Captures one bystander from the top of the bystander supply onto the
 * mastermind per D-15401. If the supply is empty, logs a message and
 * skips. Mutates G directly so callers do not need a new effect type.
 *
 * @param gameState - The game state to mutate.
 */
function captureBystanderOntoMastermind(gameState: LegendaryGameState): void {
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
}

/**
 * Builds the shared counter-increment effects that fire for every
 * mastermind strike regardless of the card-specific text.
 *
 * @returns Generic RuleEffect[] applied to every strike.
 */
function buildGenericStrikeEffects(): RuleEffect[] {
  return [
    {
      type: 'modifyCounter',
      counter: 'masterStrikeCount',
      delta: 1,
    },
    {
      type: 'queueMessage',
      message: 'Mastermind strike revealed — strike count incremented.',
    },
  ];
}

/**
 * Resolves Magneto's Master Strike (MVP punitive branch).
 *
 * Strike text: "Each player reveals an [team:x-men] Hero or discards
 * down to four cards." MVP simplification: every player simply discards
 * down to four cards. Cards are moved from the top of each player's
 * hand into their discard pile until the hand has four or fewer cards.
 *
 * Mutates G directly. Per-player messages are appended to G.messages so
 * replay tooling can observe the effect.
 *
 * @param gameState - The game state to mutate.
 */
function resolveMagnetoStrike(gameState: LegendaryGameState): void {
  const playerIds = Object.keys(gameState.playerZones).sort();

  for (const playerId of playerIds) {
    const playerZones = gameState.playerZones[playerId]!;
    const startingHandSize = playerZones.hand.length;

    if (startingHandSize <= MAGNETO_HAND_SIZE_LIMIT) {
      gameState.messages.push(
        `[Magneto Master Strike] Player ${playerId} already has ${startingHandSize} card(s) in hand — no discard.`,
      );
      continue;
    }

    const discardCount = startingHandSize - MAGNETO_HAND_SIZE_LIMIT;
    // why: discard from the front of the hand (top-of-hand convention)
    // so the kept cards are the most recently drawn. The choice is
    // arbitrary for MVP; future WP may let the player choose.
    const discarded = playerZones.hand.slice(0, discardCount);
    const kept = playerZones.hand.slice(discardCount);
    playerZones.hand = kept;
    playerZones.discard = [...playerZones.discard, ...discarded];

    gameState.messages.push(
      `[Magneto Master Strike] Player ${playerId} discarded ${discardCount} card(s) down to ${MAGNETO_HAND_SIZE_LIMIT}.`,
    );
  }
}

/**
 * Mastermind strike handler dispatcher.
 *
 * Branches on `G.selection.mastermindId`. The generic bystander capture
 * (D-15401) runs for every strike. Per-mastermind text effects mutate G
 * directly. The returned RuleEffect[] carries only the shared counter
 * increment and message — card-specific work is done inline.
 *
 * @param gameState - Current game state (mutated for bystander capture and per-mastermind effects).
 * @param _ctx - Context (unused — chained reveals are scheme-side for now).
 * @param _payload - Trigger payload ({ cardId } from villain reveal).
 * @param _implementationMap - Handler map (unused; reserved for future cascading strikes).
 * @returns Array of RuleEffect descriptions to apply.
 */
export function mastermindStrikeHandler(
  gameState: LegendaryGameState,
  _ctx: unknown,
  _payload: unknown,
  _implementationMap: ImplementationMap,
): RuleEffect[] {
  captureBystanderOntoMastermind(gameState);

  const mastermindId = gameState.selection.mastermindId;
  if (mastermindId === MASTERMIND_MAGNETO) {
    resolveMagnetoStrike(gameState);
  }

  return buildGenericStrikeEffects();
}
