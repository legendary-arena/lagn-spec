/**
 * Villain deck reveal move for the Legendary Arena game engine.
 *
 * revealVillainCard draws the top card from the villain deck, looks up its
 * classification in G.villainDeckCardTypes, emits the appropriate rule
 * triggers via the WP-009B pipeline, applies the resulting effects, and
 * places the card in discard.
 *
 * This move assumes the deck already exists in G. It does not construct
 * or validate deck composition — that is WP-014B's responsibility.
 *
 * No registry imports. No .reduce(). Moves never throw.
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import type { RuleEffect } from '../rules/ruleHooks.types.js';
import { executeRuleHooks } from '../rules/ruleRuntime.execute.js';
import { applyRuleEffects } from '../rules/ruleRuntime.effects.js';
import { DEFAULT_IMPLEMENTATION_MAP } from '../rules/ruleRuntime.impl.js';
import { shuffleDeck } from '../setup/shuffle.js';
import { pushVillainIntoCity } from '../board/city.logic.js';
import { validateCityShape } from '../board/city.validate.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';
import { gainWound } from '../board/wounds.logic.js';
import {
  attachBystanderToVillain,
  resolveEscapedBystanders,
} from '../board/bystanders.logic.js';
import { hasAmbush } from '../board/boardKeywords.logic.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Reveals the top card from the villain deck.
 *
 * Pipeline: draw → classify → City routing (villain/henchman) → trigger →
 * apply effects → discard routing (bystander/scheme-twist/mastermind-strike).
 *
 * Handles edge cases:
 * - Empty deck + non-empty discard: reshuffles discard into deck first.
 * - Empty deck + empty discard: logs a message and returns.
 * - Missing card type: fail-closed — logs a message, card stays in deck.
 *
 * @param context - boardgame.io move context with G, ctx, random, playerID.
 */
export function revealVillainCard({ G, ctx, ...context }: MoveContext): void {
  // Step 0: Stage gate (non-core move contract)
  // why: villain reveal is a start-of-turn action per tabletop Legendary
  if (G.currentStage !== 'start') return;

  const deck = G.villainDeck.deck;
  const discard = G.villainDeck.discard;

  // Step 1: Handle empty deck
  if (deck.length === 0 && discard.length === 0) {
    G.messages.push(
      'Villain deck reveal skipped: both deck and discard are empty.',
    );
    return;
  }

  if (deck.length === 0 && discard.length > 0) {
    // why: reshuffling empty deck from discard is standard Legendary behaviour.
    // When the villain deck runs out, the discard pile is shuffled to form a
    // new deck. This ensures the game can continue as long as cards exist.
    const reshuffled = shuffleDeck([...discard], { random: context.random });
    G.villainDeck.deck = reshuffled;
    G.villainDeck.discard = [];
  }

  // Step 2: Draw the top card (top-of-deck = deck[0], locked convention)
  const cardId = G.villainDeck.deck[0];

  if (!cardId) {
    G.messages.push(
      'Villain deck reveal skipped: deck is empty after reshuffle attempt.',
    );
    return;
  }

  // Step 3: Look up classification — fail-closed if missing
  const cardType = G.villainDeckCardTypes[cardId];

  if (!cardType) {
    G.messages.push(
      `Villain deck reveal failed: card "${cardId}" has no entry in villainDeckCardTypes. No removal or trigger occurred.`,
    );
    return;
  }

  // Step 4: City routing for villain and henchman cards
  // why: City placement before triggers so hooks observe post-placement state.
  // This ordering is contractual — rule hooks see the physical board state that
  // players would see immediately after a reveal (Legendary tabletop semantics).
  // why: Deck removal is deferred until placement destination is confirmed.
  // If city validation fails, the card must remain on top of the deck — removing
  // it before validation would silently lose the card (WP-015A fix).
  if (cardType === 'villain' || cardType === 'henchman') {
    const cityValidation = validateCityShape(G.city);
    if (!cityValidation.ok) {
      G.messages.push(
        `Villain city placement skipped: G.city is malformed. Card "${cardId}" remains in deck.`,
      );
      return;
    }

    // Remove card from deck only after city validation succeeds
    G.villainDeck.deck = G.villainDeck.deck.slice(1);

    const pushResult = pushVillainIntoCity(G.city, cardId);
    G.city = pushResult.city;

    if (pushResult.escapedCard !== null) {
      // why: ENDGAME_CONDITIONS.ESCAPED_VILLAINS is the canonical counter key
      // for escape tracking. evaluateEndgame reads this counter to determine
      // scheme-wins loss condition.
      const currentEscaped = G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0;
      G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] = currentEscaped + 1;

      // why: escaped card pushed to G.escapedPile only when non-null (null
      // means no card was displaced). Counter increments regardless — the
      // counter tracks escape events, the pile tracks card identity.
      G.escapedPile = [...G.escapedPile, pushResult.escapedCard];

      G.messages.push(
        `Villain "${pushResult.escapedCard}" escaped from the city.`,
      );

      // why: escape causes wound — MVP rule linking escapes to player penalty.
      // Current player gains 1 wound when a villain escapes the City.
      const woundPileBefore = G.piles.wounds.length;
      const woundResult = gainWound(
        G.piles.wounds,
        G.playerZones[ctx.currentPlayer]!.discard,
      );
      G.piles.wounds = woundResult.woundsPile;
      G.playerZones[ctx.currentPlayer]!.discard = woundResult.playerDiscard;
      if (woundPileBefore > 0) {
        // why: track current player wound for UI economy projection
        G.turnEconomy.woundsDrawn += 1;
        G.messages.push(
          `Player ${ctx.currentPlayer} gained a wound from villain escape.`,
        );
      }

      // why: escaped villain releases bystanders back to supply to prevent
      // memory leaks and bystander depletion
      const bystanderPileBefore = G.piles.bystanders.length;
      const escapeBystanderResult = resolveEscapedBystanders(
        pushResult.escapedCard,
        G.attachedBystanders,
        G.piles.bystanders,
      );
      G.attachedBystanders = escapeBystanderResult.attachedBystanders;
      G.piles.bystanders = escapeBystanderResult.bystandersPile;
      if (escapeBystanderResult.bystandersPile.length > bystanderPileBefore) {
        G.messages.push(
          `Bystanders from escaped villain "${pushResult.escapedCard}" returned to supply.`,
        );
      }
    }

    // why: Ambush fires on City entry, not on fight. When a villain with
    // Ambush enters the City, each player gains 1 wound. Wound gain is
    // inline (not RuleEffect) because no 'gainWound' RuleEffect type exists
    // — same pattern as escape wounds above (D-2403 safe-skip for effect
    // type gaps).
    const cardKeywords = G.cardKeywords ?? {};
    if (hasAmbush(cardId, cardKeywords)) {
      const playerIds = Object.keys(G.playerZones);
      for (const playerId of playerIds) {
        if (G.piles.wounds.length > 0) {
          const ambushWoundResult = gainWound(
            G.piles.wounds,
            G.playerZones[playerId]!.discard,
          );
          G.piles.wounds = ambushWoundResult.woundsPile;
          G.playerZones[playerId]!.discard = ambushWoundResult.playerDiscard;
          // why: woundsDrawn tracks current player only — other players' Ambush wounds are not projected
          if (playerId === ctx.currentPlayer) {
            G.turnEconomy.woundsDrawn += 1;
          }
          G.messages.push(
            `Player ${playerId} gained a wound from Ambush on "${cardId}".`,
          );
        }
      }
    }

    // why: bystander appears with villain on City entry; rule hooks must
    // observe post-attachment state (tabletop Legendary semantics)
    const attachResult = attachBystanderToVillain(
      G.piles.bystanders,
      cardId,
      G.attachedBystanders,
    );
    G.piles.bystanders = attachResult.bystandersPile;
    G.attachedBystanders = attachResult.attachedBystanders;
  } else {
    // Non-city card types: remove from deck before trigger/discard routing
    G.villainDeck.deck = G.villainDeck.deck.slice(1);
  }

  // Step 5: Collect rule effects via the WP-009B pipeline
  const allEffects: RuleEffect[] = [];

  // Always emit onCardRevealed
  const cardRevealedEffects = executeRuleHooks(
    G,
    ctx,
    'onCardRevealed',
    { cardId, cardTypeSlug: cardType },
    G.hookRegistry,
    DEFAULT_IMPLEMENTATION_MAP,
  );

  for (const effect of cardRevealedEffects) {
    allEffects.push(effect);
  }

  // Conditionally emit type-specific triggers
  if (cardType === 'scheme-twist') {
    const schemeTwistEffects = executeRuleHooks(
      G,
      ctx,
      'onSchemeTwistRevealed',
      { cardId },
      G.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );

    for (const effect of schemeTwistEffects) {
      allEffects.push(effect);
    }
  }

  if (cardType === 'mastermind-strike') {
    const mastermindStrikeEffects = executeRuleHooks(
      G,
      ctx,
      'onMastermindStrikeRevealed',
      { cardId },
      G.hookRegistry,
      DEFAULT_IMPLEMENTATION_MAP,
    );

    for (const effect of mastermindStrikeEffects) {
      allEffects.push(effect);
    }
  }

  // Step 6: Apply all collected effects
  applyRuleEffects(G, ctx, allEffects);

  // Step 7: Route card to final destination based on type
  // Villain and henchman cards are already in the City (step 4b above).
  // All other card types go to discard.
  if (cardType === 'villain' || cardType === 'henchman') {
    // Already placed in City in step 4b — do not also place in discard
  } else if (cardType === 'bystander') {
    // why: per Legendary tabletop rules, a bystander revealed from the
    // villain deck is captured by the frontmost villain in the City (the
    // one that will escape next — highest occupied index, since index 4
    // is the escape edge per pushVillainIntoCity). If the City has no
    // villains, the Mastermind captures the bystander instead. The
    // bystander is NOT routed to villainDeck.discard.
    let captorCardId = G.mastermind.baseCardId;
    for (let cityIndex = G.city.length - 1; cityIndex >= 0; cityIndex--) {
      const occupant = G.city[cityIndex];
      if (occupant !== null && occupant !== undefined) {
        captorCardId = occupant;
        break;
      }
    }
    const existingAttached = G.attachedBystanders[captorCardId] ?? [];
    G.attachedBystanders = {
      ...G.attachedBystanders,
      [captorCardId]: [...existingAttached, cardId],
    };
    G.messages.push(
      `Bystander "${cardId}" revealed and captured by "${captorCardId}".`,
    );
  } else if (cardType === 'scheme-twist') {
    // why: scheme-twist cards route to G.scheme.twistPile (not discard)
    // so the game tracks resolved twists for UI projection and future
    // scheme-loss evaluation
    G.scheme.twistPile = [...G.scheme.twistPile, cardId];
  } else if (cardType === 'mastermind-strike') {
    // why: mastermind-strike cards route to G.mastermind.strikePile (not
    // discard) so the game tracks resolved strikes for UI projection
    G.mastermind.strikePile = [...G.mastermind.strikePile, cardId];
  }
}
