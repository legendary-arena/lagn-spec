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
import type { CardExtId } from '../state/zones.types.js';
import type { RevealContext } from '../villainDeck/villainDeck.reveal.js';
import type { ImplementationMap } from './ruleRuntime.execute.js';
import { gainWound } from '../board/wounds.logic.js';
import { moveAllCards } from '../moves/zoneOps.js';
import { performVillainReveal } from '../villainDeck/villainDeck.reveal.js';
import { koCard } from '../board/ko.logic.js';
import { refillHqSlot } from '../board/city.logic.js';
import { attachBystanderToVillain } from '../board/bystanders.logic.js';
import { composeSchemeTwistNarrative } from '../events/notableEvents.compose.js';

// ---------------------------------------------------------------------------
// Internal — narrative name lookup
// ---------------------------------------------------------------------------

// why: WP-200 — pure helper used by every resolver's terminal emission to
// resolve a CardExtId to a display name (or fall back to the raw ext_id
// when no display entry exists — see the executor's defensive fallback in
// the WP §Non-Negotiable Constraints block). Centralised here so all five
// resolvers compose identically; replay-stable by construction.
function resolveCardName(
  gameState: LegendaryGameState,
  cardId: CardExtId,
): string {
  // why: WP-200 — defensive access; legacy test G states may leave
  // `cardDisplayData` undefined. Production setup always builds it.
  const display = gameState.cardDisplayData?.[cardId];
  if (display && typeof display.name === 'string' && display.name.length > 0) {
    return display.name;
  }
  return cardId;
}

// why: WP-200 — sentinel ext_id used when a legacy test calls a resolver
// directly without passing the 5th `twistCardId` argument. The production
// dispatch path (`schemeHandlers.ts:schemeTwistHandler`) always passes the
// real cardId from the trigger payload, so this fallback only surfaces in
// the unit-test surface that pre-dates WP-200. Stable string ensures
// emissions still produce a well-typed `schemeTwistResolved` event without
// requiring every legacy test call site to be updated.
const UNKNOWN_TWIST_CARD_ID: CardExtId = 'unknown-twist-card' as CardExtId;

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
  twistCardId?: CardExtId,
): void {
  const condition = params['condition'] as { field?: string; value?: string } | undefined;
  const penalty = params['penalty'] as string | undefined;

  // why: structure as branch-then-emit so the terminal event-emission call
  // fires once per call regardless of which branch ran. Invalid-params,
  // happy path, and partial-failure paths all converge on the single
  // emission site below — preserves D-20001's one-event-per-twist contract
  // AND keeps the EC grep gate at exactly 5 matches across the file.
  if (
    !condition ||
    typeof condition.field !== 'string' ||
    typeof condition.value !== 'string' ||
    typeof penalty !== 'string'
  ) {
    gameState.messages.push(
      '[Scheme Twist] reveal-or-punish resolver received invalid params — expected condition { field, value } and penalty string.',
    );
  } else {
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

  // why: WP-200 — terminal emission after all per-player mutations + message
  // pushes settle. One event per twist (D-20001 closed union); resolverKey
  // is the locked camelCase form of the resolverId. Pushed via `.push(...)`
  // (write-only invariant — never sort / splice / mutate prior entries).
  // Single push site per resolver — EC grep gate is exactly 5 across the file.
  // why: WP-200 — fallback to UNKNOWN_TWIST_CARD_ID when called via the
  // legacy test path without the 5th argument. Production dispatch always
  // passes a real cardId; the fallback only surfaces in pre-WP-200 unit
  // tests that exercise resolvers directly.
  const resolvedTwistCardId = twistCardId ?? UNKNOWN_TWIST_CARD_ID;
  gameState.notableEvents.push({
    type: 'schemeTwistResolved',
    twistCardId: resolvedTwistCardId,
    resolverKey: 'revealOrPunish',
    narrative: composeSchemeTwistNarrative(
      resolveCardName(gameState, resolvedTwistCardId),
      'revealOrPunish',
    ),
  });
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
  twistCardId?: CardExtId,
): void {
  const revealCount = params['revealCount'] as number | undefined;

  // why: branch-then-emit; the terminal emission below fires once whether
  // we run the chained reveals or short-circuit on invalid params.
  if (typeof revealCount !== 'number' || revealCount < 1) {
    gameState.messages.push(
      '[Scheme Twist] chained-reveals resolver received invalid params — expected revealCount as a positive integer.',
    );
  } else {
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

  // why: WP-200 — terminal emission AFTER the chained reveals settle. A
  // chained reveal that triggers another scheme-twist card recurses into
  // schemeTwistHandler with that card's own payload; this top-level
  // emission represents the originating twist, the recursive one pushes
  // its own event. Push order matches resolution order (outer-first).
  // Single push site per resolver — EC grep gate is exactly 5 across the file.
  const resolvedTwistCardId = twistCardId ?? UNKNOWN_TWIST_CARD_ID;
  gameState.notableEvents.push({
    type: 'schemeTwistResolved',
    twistCardId: resolvedTwistCardId,
    resolverKey: 'chainedReveals',
    narrative: composeSchemeTwistNarrative(
      resolveCardName(gameState, resolvedTwistCardId),
      'chainedReveals',
    ),
  });
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
  twistCardId?: CardExtId,
): void {
  const woundCount = params['woundCount'] as number | undefined;

  // why: branch-then-emit; single terminal push so the EC grep counts
  // exactly 5 event-emission calls across the file.
  if (typeof woundCount !== 'number' || woundCount < 1) {
    gameState.messages.push(
      '[Scheme Twist] wound-all resolver received invalid params — expected woundCount as a positive integer.',
    );
  } else {
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

  // why: WP-200 — terminal emission after every player's wound loop settles.
  // Single push site per resolver — EC grep gate is exactly 5 across the file.
  const resolvedTwistCardId = twistCardId ?? UNKNOWN_TWIST_CARD_ID;
  gameState.notableEvents.push({
    type: 'schemeTwistResolved',
    twistCardId: resolvedTwistCardId,
    resolverKey: 'woundAll',
    narrative: composeSchemeTwistNarrative(
      resolveCardName(gameState, resolvedTwistCardId),
      'woundAll',
    ),
  });
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
  twistCardId?: CardExtId,
): void {
  const koCount = params['koCount'] as number | undefined;
  const costThreshold = params['costThreshold'] as number | undefined;

  // why: branch-then-emit; single terminal push at the end so the EC grep
  // counts exactly 5 event-emission calls across the file.
  if (typeof koCount !== 'number' || koCount < 1) {
    gameState.messages.push(
      '[Scheme Twist] ko-from-hq resolver received invalid params — expected koCount as a positive integer.',
    );
  } else {
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
    } else {
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
  }

  // why: WP-200 — terminal emission after all KOs + refills settle.
  // Single push site per resolver — EC grep gate is exactly 5 across the file.
  const resolvedTwistCardId = twistCardId ?? UNKNOWN_TWIST_CARD_ID;
  gameState.notableEvents.push({
    type: 'schemeTwistResolved',
    twistCardId: resolvedTwistCardId,
    resolverKey: 'koFromHq',
    narrative: composeSchemeTwistNarrative(
      resolveCardName(gameState, resolvedTwistCardId),
      'koFromHq',
    ),
  });
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
  twistCardId?: CardExtId,
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

  // why: WP-200 — terminal emission after the chained villain reveal settles.
  // The chained reveal may itself emit a fightResolved / ambushResolved /
  // schemeTwistResolved depending on the next card's type; this twist's
  // event is pushed AFTER those, so the array's order reflects the
  // resolution sequence (outer-twist concludes last).
  const resolvedTwistCardId = twistCardId ?? UNKNOWN_TWIST_CARD_ID;
  gameState.notableEvents.push({
    type: 'schemeTwistResolved',
    twistCardId: resolvedTwistCardId,
    resolverKey: 'midtownBankRobbery',
    narrative: composeSchemeTwistNarrative(
      resolveCardName(gameState, resolvedTwistCardId),
      'midtownBankRobbery',
    ),
  });
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
