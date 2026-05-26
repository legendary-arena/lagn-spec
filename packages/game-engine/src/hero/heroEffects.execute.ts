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

// why: only these 4 keywords are executed in WP-022 MVP. The remaining
// keywords ('rescue', 'wound', 'reveal', 'conditional') are safely
// ignored — they require conditional logic, targeting UI, or additional
// game systems that are deferred to WP-023+.
const MVP_KEYWORDS = new Set(['draw', 'attack', 'recruit', 'ko']);

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

  // why: 'ko' does not use magnitude — it targets the played card itself.
  // All other MVP keywords require a valid magnitude.
  if (keyword !== 'ko') {
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
    default: {
      // why: unreachable — MVP_KEYWORDS check above filters unsupported keywords
      break;
    }
  }
}
