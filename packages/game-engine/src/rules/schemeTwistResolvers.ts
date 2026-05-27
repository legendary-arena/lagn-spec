/**
 * Scheme twist resolver functions for the Legendary Arena game engine.
 *
 * Each resolver implements a reusable twist pattern that mutates G directly.
 * Resolvers push messages to gameState.messages for every significant action.
 * They never throw — invalid params produce a message and return.
 *
 * The SCHEME_TWIST_RESOLVERS registry maps resolver IDs to functions.
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 */

import type { SchemeTwistResolver, SchemeTwistResolverId } from './schemeTwistConfig.types.js';
import type { LegendaryGameState } from '../types.js';
import type { RevealContext } from '../villainDeck/villainDeck.reveal.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';
import { gainWound } from '../board/wounds.logic.js';
import { moveAllCards } from '../moves/zoneOps.js';
import { performVillainReveal } from '../villainDeck/villainDeck.reveal.js';
import { koCard } from '../board/ko.logic.js';
import { refillHqSlot } from '../board/city.logic.js';
import { attachBystanderToVillain } from '../board/bystanders.logic.js';

// -------------------------------------------------------------------------
// Constants (migrated from schemeHandlers.ts)
// -------------------------------------------------------------------------

// why: Midtown Bank Robbery twist text: "Any Villain in the Bank captures
// 2 Bystanders." The Bank is engine city index 1 per the engine→visual
// mapping in apps/arena-client/src/composables/useCityRow.ts (engine 0 =
// Sewers entry edge; engine 4 = Bridge escape edge).
const BANK_CITY_INDEX = 1;

// why: per printed card text, the Bank villain captures exactly 2
// bystanders per twist. Hardcoded because it comes from the physical card.
const MIDTOWN_BYSTANDERS_PER_TWIST = 2;

// -------------------------------------------------------------------------
// reveal-or-punish
// -------------------------------------------------------------------------

/**
 * "Each player reveals a [heroClass/team] hero or [suffers penalty]."
 *
 * Iterates players in canonical order. For each player, checks if any
 * card in hand matches the condition. If matched, pushes a message.
 * If not matched, applies the penalty (gainWound or discardHand).
 *
 * @param gameState - Game state to mutate.
 * @param _context - RevealContext (unused by this resolver).
 * @param _implementationMap - Handler map (unused by this resolver).
 * @param params - Expected: condition { field, value }, penalty.
 */
function revealOrPunish(
  gameState: LegendaryGameState,
  _context: RevealContext,
  _implementationMap: ImplementationMap,
  params: Record<string, unknown>,
): void {
  const condition = params['condition'] as { field?: string; value?: string } | undefined;
  const penalty = params['penalty'] as string | undefined;

  if (
    !condition ||
    typeof condition.field !== 'string' ||
    typeof condition.value !== 'string' ||
    typeof penalty !== 'string'
  ) {
    gameState.messages.push(
      '[Scheme Twist] reveal-or-punish resolver received invalid params — expected condition { field, value } and penalty string.',
    );
    return;
  }

  const playerIds = Object.keys(gameState.playerZones);

  for (const playerId of playerIds) {
    const playerHand = gameState.playerZones[playerId]!.hand;
    let matchFound = false;

    for (const cardId of playerHand) {
      const traits = gameState.cardTraits[cardId];
      if (!traits) continue;

      const traitValue = condition.field === 'heroClass' ? traits.heroClass : traits.team;
      if (traitValue === condition.value) {
        matchFound = true;
        gameState.messages.push(
          `[Scheme Twist] Player ${playerId} reveals "${cardId}" — ${condition.field} "${condition.value}" condition met.`,
        );
        break;
      }
    }

    if (!matchFound) {
      if (penalty === 'gainWound') {
        if (gameState.piles.wounds.length === 0) {
          gameState.messages.push(
            `[Scheme Twist] Player ${playerId} has no matching hero — wound supply empty, no wound gained.`,
          );
        } else {
          const woundResult = gainWound(
            gameState.piles.wounds,
            gameState.playerZones[playerId]!.discard,
          );
          gameState.piles.wounds = woundResult.woundsPile;
          gameState.playerZones[playerId]!.discard = woundResult.playerDiscard;
          gameState.messages.push(
            `[Scheme Twist] Player ${playerId} has no matching ${condition.field} "${condition.value}" hero — gained a wound.`,
          );
        }
      } else if (penalty === 'discardHand') {
        const moveResult = moveAllCards(
          gameState.playerZones[playerId]!.hand,
          gameState.playerZones[playerId]!.discard,
        );
        gameState.playerZones[playerId]!.hand = moveResult.from;
        gameState.playerZones[playerId]!.discard = moveResult.to;
        gameState.messages.push(
          `[Scheme Twist] Player ${playerId} has no matching ${condition.field} "${condition.value}" hero — discarded entire hand.`,
        );
      }
    }
  }
}

// -------------------------------------------------------------------------
// chained-reveals
// -------------------------------------------------------------------------

/**
 * "Play the top N cards of the Villain Deck."
 *
 * Calls performVillainReveal N times. Stops early if the villain deck
 * is exhausted.
 *
 * @param gameState - Game state to mutate.
 * @param context - RevealContext threaded into performVillainReveal.
 * @param implementationMap - Handler map threaded into performVillainReveal.
 * @param params - Expected: revealCount (integer >= 1).
 */
function chainedReveals(
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
  params: Record<string, unknown>,
): void {
  const revealCount = params['revealCount'] as number | undefined;

  if (typeof revealCount !== 'number' || revealCount < 1) {
    gameState.messages.push(
      '[Scheme Twist] chained-reveals resolver received invalid params — expected revealCount as a positive integer.',
    );
    return;
  }

  gameState.messages.push(
    `[Scheme Twist] Twist: revealing ${revealCount} card(s) from the villain deck.`,
  );

  for (let revealIndex = 0; revealIndex < revealCount; revealIndex++) {
    if (
      gameState.villainDeck.deck.length === 0 &&
      gameState.villainDeck.discard.length === 0
    ) {
      gameState.messages.push(
        `[Scheme Twist] Villain deck exhausted after ${revealIndex} of ${revealCount} reveals.`,
      );
      break;
    }
    performVillainReveal(gameState, context, implementationMap);
  }
}

// -------------------------------------------------------------------------
// wound-all
// -------------------------------------------------------------------------

/**
 * "Each player gains N Wound(s)."
 *
 * Iterates players in canonical order. Each player gains woundCount
 * wounds via gainWound. Stops early per-player if wound supply runs out.
 *
 * @param gameState - Game state to mutate.
 * @param _context - RevealContext (unused by this resolver).
 * @param _implementationMap - Handler map (unused by this resolver).
 * @param params - Expected: woundCount (integer >= 1).
 */
function woundAll(
  gameState: LegendaryGameState,
  _context: RevealContext,
  _implementationMap: ImplementationMap,
  params: Record<string, unknown>,
): void {
  const woundCount = params['woundCount'] as number | undefined;

  if (typeof woundCount !== 'number' || woundCount < 1) {
    gameState.messages.push(
      '[Scheme Twist] wound-all resolver received invalid params — expected woundCount as a positive integer.',
    );
    return;
  }

  const playerIds = Object.keys(gameState.playerZones);

  for (const playerId of playerIds) {
    let woundsGained = 0;
    for (let woundIndex = 0; woundIndex < woundCount; woundIndex++) {
      if (gameState.piles.wounds.length === 0) {
        gameState.messages.push(
          `[Scheme Twist] Wound supply exhausted — player ${playerId} gained ${woundsGained} of ${woundCount} wounds.`,
        );
        break;
      }
      const woundResult = gainWound(
        gameState.piles.wounds,
        gameState.playerZones[playerId]!.discard,
      );
      gameState.piles.wounds = woundResult.woundsPile;
      gameState.playerZones[playerId]!.discard = woundResult.playerDiscard;
      woundsGained = woundsGained + 1;
    }

    if (woundsGained > 0 && woundsGained === woundCount) {
      gameState.messages.push(
        `[Scheme Twist] Player ${playerId} gained ${woundsGained} wound(s).`,
      );
    }
  }
}

// -------------------------------------------------------------------------
// ko-from-hq
// -------------------------------------------------------------------------

/**
 * "KO N hero(es) from the HQ."
 *
 * Scans HQ for eligible heroes, sorts by cost ascending then slot index
 * for deterministic tie-breaking, KOs up to koCount, and refills each
 * vacated slot.
 *
 * @param gameState - Game state to mutate.
 * @param _context - RevealContext (unused by this resolver).
 * @param _implementationMap - Handler map (unused by this resolver).
 * @param params - Expected: koCount (integer >= 1), optional costThreshold.
 */
function koFromHq(
  gameState: LegendaryGameState,
  _context: RevealContext,
  _implementationMap: ImplementationMap,
  params: Record<string, unknown>,
): void {
  const koCount = params['koCount'] as number | undefined;
  const costThreshold = params['costThreshold'] as number | undefined;

  if (typeof koCount !== 'number' || koCount < 1) {
    gameState.messages.push(
      '[Scheme Twist] ko-from-hq resolver received invalid params — expected koCount as a positive integer.',
    );
    return;
  }

  const eligible: Array<{ cardId: string; slotIndex: number; cost: number }> = [];

  for (let slotIndex = 0; slotIndex < gameState.hq.length; slotIndex++) {
    const cardId = gameState.hq[slotIndex];
    if (cardId === null || cardId === undefined) continue;

    const stats = gameState.cardStats[cardId];
    const cardCost = stats ? stats.cost : 0;

    if (costThreshold !== undefined && typeof costThreshold === 'number') {
      if (cardCost > costThreshold) continue;
    }

    eligible.push({ cardId, slotIndex, cost: cardCost });
  }

  // why: sort cheapest-first (cost ascending) with ties broken by HQ slot
  // index left-to-right (lower index first) for deterministic selection
  eligible.sort((entryA, entryB) => {
    if (entryA.cost !== entryB.cost) return entryA.cost - entryB.cost;
    return entryA.slotIndex - entryB.slotIndex;
  });

  if (eligible.length === 0) {
    gameState.messages.push(
      '[Scheme Twist] No eligible heroes in the HQ to KO.',
    );
    return;
  }

  const actualKoCount = Math.min(koCount, eligible.length);

  if (eligible.length < koCount) {
    gameState.messages.push(
      `[Scheme Twist] Only ${eligible.length} eligible hero(es) in HQ — KO'ing all of them instead of ${koCount}.`,
    );
  }

  for (let koIndex = 0; koIndex < actualKoCount; koIndex++) {
    const target = eligible[koIndex]!;

    gameState.ko = koCard(gameState.ko, target.cardId);
    gameState.hq[target.slotIndex] = null;

    gameState.messages.push(
      `[Scheme Twist] KO'd "${target.cardId}" (cost ${target.cost}) from HQ slot ${target.slotIndex}.`,
    );

    const refillResult = refillHqSlot(
      gameState.hq,
      target.slotIndex,
      gameState.heroDeck,
    );
    gameState.hq = refillResult.hq;
    gameState.heroDeck = refillResult.heroDeck;
  }
}

// -------------------------------------------------------------------------
// midtown-bank-robbery (migrated from schemeHandlers.ts)
// -------------------------------------------------------------------------

/**
 * Resolves the Midtown Bank Robbery twist card text by direct G mutation.
 *
 * Twist text: "Any Villain in the Bank captures 2 Bystanders. Then play
 * the top card of the Villain Deck."
 *
 * 1. If a villain occupies the Bank (city index 1), attach up to 2
 *    bystanders to it from the supply (fewer if the supply runs out).
 * 2. Chain another villain-deck reveal via performVillainReveal.
 *
 * @param gameState - Game state to mutate.
 * @param context - RevealContext threaded into the chained reveal.
 * @param implementationMap - Handler map threaded into the chained reveal.
 * @param _params - Unused — Midtown Bank Robbery has no configurable params.
 */
function midtownBankRobbery(
  gameState: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
  _params: Record<string, unknown>,
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

// -------------------------------------------------------------------------
// Resolver Registry
// -------------------------------------------------------------------------

/**
 * Maps each SchemeTwistResolverId to its resolver function.
 *
 * Plain record — no factory, no class, no dynamic registration.
 */
export const SCHEME_TWIST_RESOLVERS: Record<SchemeTwistResolverId, SchemeTwistResolver> = {
  'reveal-or-punish': revealOrPunish,
  'chained-reveals': chainedReveals,
  'wound-all': woundAll,
  'ko-from-hq': koFromHq,
  'midtown-bank-robbery': midtownBankRobbery,
};
