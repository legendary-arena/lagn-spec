/**
 * Hero effect execution for the Legendary Arena game engine.
 *
 * Executes a safe MVP subset of hero ability keywords when a hero card
 * is played. Only unconditional effects with valid magnitude are executed.
 * Conditional effects and unsupported keywords are safely skipped.
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 * Uses existing helpers only: moveCardFromZone, moveAllCards, shuffleDeck,
 * addResources, koCard.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type { HeroAbilityHook, HeroEffectDescriptor } from '../rules/heroAbility.types.js';
import { getHooksForCard } from '../rules/heroAbility.types.js';
import { evaluateAllConditions } from './heroConditions.evaluate.js';
import type { HeroEffectResult } from './heroEffects.types.js';
import type { ShuffleProvider } from '../setup/shuffle.js';
import { shuffleDeck } from '../setup/shuffle.js';
import { moveCardFromZone, moveAllCards } from '../moves/zoneOps.js';
import { addResources } from '../economy/economy.logic.js';
import { koCard } from '../board/ko.logic.js';

// ---------------------------------------------------------------------------
// MVP keyword set
// ---------------------------------------------------------------------------

// why: WP-215 adds 'rescue' and 'reveal' to the executed set. WP-217 adds
// 'reveal-ko' and 'reveal-min'. WP-218 adds 'reveal-ko-or-draw' (D-21802).
// 'wound' and 'conditional' remain deferred — they require targeting UI or
// additional game systems not yet implemented.
const MVP_KEYWORDS = new Set(['draw', 'attack', 'recruit', 'ko', 'rescue', 'reveal', 'reveal-ko', 'reveal-min', 'reveal-ko-or-draw']);

// ---------------------------------------------------------------------------
// Magnitude validation
// ---------------------------------------------------------------------------

/**
 * Returns true if magnitude is a finite integer >= 0.
 *
 * @param magnitude - The magnitude value from a HeroEffectDescriptor.
 * @returns Whether the magnitude is valid for execution.
 */
function isValidMagnitude(magnitude: number | undefined): magnitude is number {
  if (magnitude === undefined) {
    return false;
  }
  if (!Number.isFinite(magnitude)) {
    return false;
  }
  if (magnitude < 0) {
    return false;
  }
  if (!Number.isInteger(magnitude)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Draw helper (extracted from drawCards move logic)
// ---------------------------------------------------------------------------

/**
 * Draws cards from a player's deck into their hand.
 *
 * Replicates the draw algorithm from drawCards (coreMoves.impl.ts:52-76)
 * without the move validation and stage gating — those are the move's
 * responsibility, already handled by playCard before this function runs.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerID - Active player whose zones to modify.
 * @param count - Number of cards to draw.
 * @param shuffleContext - ShuffleProvider for deterministic reshuffle.
 */
function drawFromPlayerDeck(
  G: LegendaryGameState,
  playerID: string,
  count: number,
  shuffleContext: ShuffleProvider,
): void {
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return;
  }

  for (let cardsDrawn = 0; cardsDrawn < count; cardsDrawn++) {
    // If deck is empty, attempt reshuffle from discard
    if (playerZones.deck.length === 0) {
      if (playerZones.discard.length === 0) {
        // No cards available anywhere — stop drawing
        return;
      }

      // why: Reshuffling discard into deck is the standard Legendary rule
      // when the draw pile is exhausted. Uses ShuffleProvider for
      // deterministic shuffling — same pattern as drawCards move.
      const reshuffled = moveAllCards(playerZones.discard, []);
      playerZones.discard = reshuffled.from;
      playerZones.deck = shuffleDeck(reshuffled.to, shuffleContext);
    }

    const topCard = playerZones.deck[0];
    if (!topCard) {
      return;
    }

    const result = moveCardFromZone(playerZones.deck, playerZones.hand, topCard);
    playerZones.deck = result.from;
    playerZones.hand = result.to;
  }
}

// ---------------------------------------------------------------------------
// executeHeroEffects — main entry point
// ---------------------------------------------------------------------------

/**
 * Executes hero ability effects for a played card.
 *
 * Called from playCard after the card is placed in inPlay and base stats
 * are applied. Iterates hooks in registration order, effects in descriptor
 * array order. Hooks with conditions are evaluated via evaluateAllConditions
 * (WP-023) — effects execute only when ALL conditions pass. Unsupported
 * keywords and invalid magnitudes are skipped.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param ctx - boardgame.io context passed as unknown to avoid importing
 *   boardgame.io. Narrowed to ShuffleProvider at the draw call site.
 * @param playerID - Active player ID (plain string, no framework import).
 * @param cardId - The CardExtId of the hero card that was just played.
 */
export function executeHeroEffects(
  G: LegendaryGameState,
  ctx: unknown,
  playerID: string,
  cardId: CardExtId,
): void {
  // why: guard against G states that predate WP-021 (e.g., older test
  // mocks that don't include heroAbilityHooks). No hooks means no effects.
  if (!G.heroAbilityHooks || G.heroAbilityHooks.length === 0) {
    return;
  }

  const hooks = getHooksForCard(G.heroAbilityHooks, cardId);

  for (const hook of hooks) {
    // why: cardId is threaded through to condition evaluation so heroClassMatch
    // and requiresTeam can exclude the triggering card from their inPlay scan
    // (self-exclusion rule — a card's own class/team does not satisfy its own
    // superpower).
    if (!evaluateAllConditions(G, playerID, hook.conditions, cardId)) {
      continue;
    }

    // why: effects is optional on HeroAbilityHook. A hook with no effects
    // produces no mutations.
    if (hook.effects === undefined || hook.effects.length === 0) {
      continue;
    }

    for (const effect of hook.effects) {
      executeSingleEffect(G, ctx, playerID, cardId, effect);
    }
  }
}

// ---------------------------------------------------------------------------
// Single effect dispatch
// ---------------------------------------------------------------------------

/**
 * Executes a single hero effect descriptor.
 *
 * Validates magnitude, checks keyword support, then dispatches to the
 * appropriate helper. Returns without mutation for unsupported keywords
 * or invalid magnitudes.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param ctx - Context (narrowed to ShuffleProvider for draw).
 * @param playerID - Active player ID.
 * @param cardId - The played hero card's CardExtId.
 * @param effect - The effect descriptor to execute.
 */
function executeSingleEffect(
  G: LegendaryGameState,
  ctx: unknown,
  playerID: string,
  cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  const keyword = effect.type;

  // why: unsupported keywords are safely ignored in MVP. Only 'draw',
  // 'attack', 'recruit', and 'ko' execute. The remaining 4 keywords
  // ('rescue', 'wound', 'reveal', 'conditional') are deferred to WP-023+.
  if (!MVP_KEYWORDS.has(keyword)) {
    return;
  }

  // why: 'ko', 'rescue', and 'reveal-ko' do not use the pre-check magnitude
  // gate — all three handle undefined magnitude internally. 'reveal-min' and
  // 'reveal-ko-or-draw' have their own magnitude gates inside their cases.
  // All other MVP keywords require a valid magnitude at this level.
  if (keyword !== 'ko' && keyword !== 'rescue' && keyword !== 'reveal-ko' && keyword !== 'reveal-min' && keyword !== 'reveal-ko-or-draw') {
    if (!isValidMagnitude(effect.magnitude)) {
      return;
    }
  }

  switch (keyword) {
    case 'draw': {
      // why: ctx is narrowed to ShuffleProvider here because deck reshuffle
      // needs ctx.random.Shuffle. boardgame.io ctx satisfies ShuffleProvider
      // structurally — this is the established pattern from WP-005B/008B.
      drawFromPlayerDeck(G, playerID, effect.magnitude as number, ctx as ShuffleProvider);
      break;
    }
    case 'attack': {
      G.turnEconomy = addResources(G.turnEconomy, effect.magnitude as number, 0);
      break;
    }
    case 'recruit': {
      G.turnEconomy = addResources(G.turnEconomy, 0, effect.magnitude as number);
      break;
    }
    case 'ko': {
      // why: MVP KO targets the played card itself. This models "KO this
      // card" text found on some heroes. No player choice — target selection
      // is deferred to future WPs. The card must be removed from inPlay
      // before being added to the KO pile.
      const playerZones = G.playerZones[playerID];
      if (playerZones) {
        const moveResult = moveCardFromZone(playerZones.inPlay, [], cardId);
        if (moveResult.found) {
          playerZones.inPlay = moveResult.from;
          G.ko = koCard(G.ko, cardId);
        }
      }
      break;
    }
    case 'rescue': {
      const rescueMagnitude = effect.magnitude ?? 1;
      const playerZones = G.playerZones[playerID];
      if (!playerZones) {
        break;
      }
      if (G.piles.bystanders.length === 0) {
        break;
      }
      const rescueCount = Math.min(rescueMagnitude, G.piles.bystanders.length);
      for (let rescued = 0; rescued < rescueCount; rescued++) {
        // why: top-of-pile convention — pile[0] is the first available bystander (D-21501)
        const topBystander = G.piles.bystanders[0];
        if (!topBystander) {
          break;
        }
        const moveResult = moveCardFromZone(G.piles.bystanders, playerZones.victory, topBystander);
        G.piles.bystanders = moveResult.from;
        playerZones.victory = moveResult.to;
      }
      break;
    }
    case 'reveal': {
      const playerZones = G.playerZones[playerID];
      if (!playerZones) {
        break;
      }
      // why: reveal does not trigger deck reshuffle; empty deck is a silent no-op (D-21502)
      if (playerZones.deck.length === 0) {
        break;
      }
      const topCardId = playerZones.deck[0];
      if (!topCardId) {
        break;
      }
      const cardStats = G.cardStats[topCardId];
      // why: G.cardStats has no entry for SHIELD starter cards; missing entry is a safe no-op (D-21502)
      if (cardStats === undefined) {
        break;
      }
      if (cardStats.cost <= (effect.magnitude as number)) {
        const moveResult = moveCardFromZone(playerZones.deck, playerZones.hand, topCardId);
        playerZones.deck = moveResult.from;
        playerZones.hand = moveResult.to;
      }
      break;
    }
    case 'reveal-ko': {
      // why: reveal-ko peeks one card and KOs it only when cost = 0; deck empty is a silent no-op per D-21502 precedent; D-21801 fixes zone integrity — card must be removed from deck before being added to KO
      const playerZones = G.playerZones[playerID];
      if (!playerZones) {
        break;
      }
      if (playerZones.deck.length === 0) {
        break;
      }
      const topCardId = playerZones.deck[0];
      if (!topCardId) {
        break;
      }
      const cardStats = G.cardStats[topCardId];
      if (cardStats === undefined) {
        break;
      }
      if (cardStats.cost === 0) {
        const moveResult = moveCardFromZone(playerZones.deck, [], topCardId);
        if (moveResult.found) {
          playerZones.deck = moveResult.from;
          G.ko = koCard(G.ko, topCardId);
        }
      }
      break;
    }
    case 'reveal-min': {
      // why: reveal-min draws the card only when cost >= threshold — opposite direction from 'reveal' which draws when cost <= threshold
      if (!isValidMagnitude(effect.magnitude)) {
        break;
      }
      const playerZones = G.playerZones[playerID];
      if (!playerZones) {
        break;
      }
      if (playerZones.deck.length === 0) {
        break;
      }
      const topCardId = playerZones.deck[0];
      if (!topCardId) {
        break;
      }
      const cardStats = G.cardStats[topCardId];
      if (cardStats === undefined) {
        break;
      }
      if (cardStats.cost >= (effect.magnitude as number)) {
        const moveResult = moveCardFromZone(playerZones.deck, playerZones.hand, topCardId);
        playerZones.deck = moveResult.from;
        playerZones.hand = moveResult.to;
      }
      break;
    }
    case 'reveal-ko-or-draw': {
      // why: reveal-ko-or-draw peeks deck top; KOs the card (removing it from deck)
      // when cost = 0; draws it when 0 < cost <= magnitude; no-op otherwise (D-21802)
      if (!isValidMagnitude(effect.magnitude) || effect.magnitude < 1) {
        break;
      }
      const playerZones = G.playerZones[playerID];
      if (!playerZones) {
        break;
      }
      if (playerZones.deck.length === 0) {
        break;
      }
      const topCardId = playerZones.deck[0];
      if (!topCardId) {
        break;
      }
      const cardStats = G.cardStats[topCardId];
      if (cardStats === undefined) {
        break;
      }
      // KO branch MUST be evaluated before draw branch.
      // cost === 0 MUST NOT reach the draw branch.
      if (cardStats.cost === 0) {
        const moveResult = moveCardFromZone(playerZones.deck, [], topCardId);
        if (moveResult.found) {
          playerZones.deck = moveResult.from;
          G.ko = koCard(G.ko, topCardId);
        }
      } else if (cardStats.cost <= (effect.magnitude as number)) {
        const moveResult = moveCardFromZone(playerZones.deck, playerZones.hand, topCardId);
        if (moveResult.found) {
          playerZones.deck = moveResult.from;
          playerZones.hand = moveResult.to;
        }
      }
      // cost > magnitude: no-op
      break;
    }
    default: {
      // why: unreachable — MVP_KEYWORDS check above filters unsupported keywords
      break;
    }
  }
}
