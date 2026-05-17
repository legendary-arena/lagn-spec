/**
 * Scheme twist handler dispatcher for the ImplementationMap.
 *
 * The exported `schemeTwistHandler` is a dispatcher that branches on
 * `G.selection.schemeId`. Per-scheme handlers implement card-text effects
 * (e.g., Midtown Bank Robbery captures bystanders in the Bank and chains
 * another villain-deck reveal). The generic counter increment +
 * scheme-loss threshold check runs for every scheme so card-specific
 * handlers stay focused on card text.
 *
 * No boardgame.io imports. No registry imports.
 */

import type { RuleEffect } from './ruleHooks.types.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';
import type { LegendaryGameState } from '../types.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';
import { attachBystanderToVillain } from '../board/bystanders.logic.js';
import {
  performVillainReveal,
  type RevealContext,
} from '../villainDeck/villainDeck.reveal.js';

// why: MVP uses a fixed threshold. Most standard Legendary schemes trigger
// loss at 7 twists. A future WP will parameterize per-scheme thresholds
// resolved from registry data at setup time.
const MVP_SCHEME_TWIST_THRESHOLD = 7;

// why: scheme ext_id constants — matching against G.selection.schemeId for
// per-scheme dispatch. Strings come from the registry; the runtime loadout
// (apps/arena-client/public/loadout-test.json) and tests use `core/<slug>`.
const SCHEME_MIDTOWN_BANK_ROBBERY = 'core/midtown-bank-robbery';

// why: Midtown Bank Robbery twist text: "Any Villain in the Bank captures
// 2 Bystanders." The Bank is engine city index 1 per the engine→visual
// mapping in apps/arena-client/src/composables/useCityRow.ts (engine 0 =
// Sewers entry edge; engine 4 = Bridge escape edge). Do not change this
// index without re-verifying useCityRow.ts and city.logic.ts.
const BANK_CITY_INDEX = 1;
const MIDTOWN_BYSTANDERS_PER_TWIST = 2;

/**
 * Builds the shared counter-increment + scheme-loss effects that fire for
 * every scheme twist regardless of the card-specific text.
 *
 * @param gameState - Current game state (read-only).
 * @returns Generic RuleEffect[] applied to every twist.
 */
function buildGenericTwistEffects(gameState: LegendaryGameState): RuleEffect[] {
  const effects: RuleEffect[] = [];

  effects.push({
    type: 'modifyCounter',
    counter: 'schemeTwistCount',
    delta: 1,
  });

  effects.push({
    type: 'queueMessage',
    message: 'Scheme twist revealed — twist count incremented.',
  });

  // why: scheme-loss is mediated through counters, not direct endgame
  // calls. The endgame evaluator reads G.counters to determine loss.
  // We predict the post-effect count by adding 1 to the current value
  // because applyRuleEffects has not yet applied the increment above.
  const predictedTwistCount =
    (gameState.counters.schemeTwistCount ?? 0) + 1;

  if (predictedTwistCount >= MVP_SCHEME_TWIST_THRESHOLD) {
    effects.push({
      type: 'modifyCounter',
      counter: ENDGAME_CONDITIONS.SCHEME_LOSS,
      delta: 1,
    });

    effects.push({
      type: 'queueMessage',
      message: 'Scheme loss triggered — twist threshold reached.',
    });
  }

  return effects;
}

/**
 * Resolves the Midtown Bank Robbery twist card text by direct G mutation.
 *
 * Twist text: "Any Villain in the Bank captures 2 Bystanders. Then play
 * the top card of the Villain Deck."
 *
 * 1. If a villain occupies the Bank (city index 1), attach up to 2
 *    bystanders to it from the supply (fewer if the supply runs out).
 * 2. Chain another villain-deck reveal via performVillainReveal, which
 *    runs the full reveal pipeline (city routing, triggers, effects).
 *
 * The generic counter increment is returned separately by the dispatcher
 * and applied after this function returns.
 *
 * @param gameState - The game state to mutate.
 * @param context - RevealContext (random + ctx.currentPlayer).
 * @param implementationMap - Handler map threaded into the chained reveal.
 */
function resolveMidtownBankRobberyTwist(
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
): void {
  const bankOccupant = gameState.city[BANK_CITY_INDEX];

  if (bankOccupant === null || bankOccupant === undefined) {
    gameState.messages.push(
      '[Midtown Bank Robbery] Twist: Bank is empty — no bystander capture.',
    );
  } else {
    let captured = 0;
    while (
      captured < MIDTOWN_BYSTANDERS_PER_TWIST &&
      gameState.piles.bystanders.length > 0
    ) {
      const attachResult = attachBystanderToVillain(
        gameState.piles.bystanders,
        bankOccupant,
        gameState.attachedBystanders,
      );
      gameState.piles.bystanders = attachResult.bystandersPile;
      gameState.attachedBystanders = attachResult.attachedBystanders;
      captured = captured + 1;
    }

    if (captured === 0) {
      gameState.messages.push(
        `[Midtown Bank Robbery] Twist: villain "${bankOccupant}" in Bank found no bystanders to capture (supply empty).`,
      );
    } else {
      gameState.messages.push(
        `[Midtown Bank Robbery] Twist: villain "${bankOccupant}" in Bank captured ${captured} bystander(s).`,
      );
    }
  }

  gameState.messages.push(
    '[Midtown Bank Robbery] Twist: playing the next villain-deck card.',
  );
  performVillainReveal(gameState, context, implementationMap);
}

/**
 * Scheme twist handler dispatcher.
 *
 * Branches on `G.selection.schemeId`. For known schemes, runs the
 * card-specific resolver (which may mutate G directly). For unknown
 * schemes, runs the generic MVP fallback (counter increment only).
 *
 * @param gameState - Current game state (mutated by per-scheme resolvers).
 * @param ctx - boardgame.io context (passed through to chained reveals).
 * @param _payload - Trigger payload ({ cardId } from villain reveal).
 * @param implementationMap - Handler map threaded through chained reveals.
 * @returns Array of RuleEffect descriptions to apply.
 */
export function schemeTwistHandler(
  gameState: LegendaryGameState,
  ctx: unknown,
  _payload: unknown,
  implementationMap: ImplementationMap,
): RuleEffect[] {
  const schemeId = gameState.selection.schemeId;

  if (schemeId === SCHEME_MIDTOWN_BANK_ROBBERY) {
    // why: ctx satisfies RevealContext structurally — boardgame.io's
    // FnContext exposes both `random` and `ctx.currentPlayer`. Cast is
    // safe because executeRuleHooks always forwards the engine-supplied
    // FnContext, and performVillainReveal only reads the narrow shape.
    resolveMidtownBankRobberyTwist(
      gameState,
      ctx as RevealContext,
      implementationMap,
    );
  }

  return buildGenericTwistEffects(gameState);
}
