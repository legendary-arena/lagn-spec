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
import type { ImplementationMap } from '../rules/ruleRuntime.execute.js';
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
import { executeVillainAbilities } from '../villain/villainEffects.execute.js';
import { composeAmbushNarrative } from '../events/notableEvents.compose.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

// why: narrow context interface for performVillainReveal so rule handlers
// can chain a reveal without importing boardgame.io. The real boardgame.io
// FnContext is structurally assignable to RevealContext.
/** Minimum context the inner reveal needs: deterministic shuffle + active player. */
export interface RevealContext {
  /** Deterministic RNG for villain-deck reshuffle. */
  random: { Shuffle: <T>(deck: T[]) => T[] };
  /** boardgame.io ctx fragment carrying the active player id. */
  ctx: { currentPlayer: string };
}

/**
 * Reveals the top card from the villain deck (boardgame.io move wrapper).
 *
 * Thin wrapper around performVillainReveal. The wrapper applies the
 * start-stage gate; performVillainReveal owns the draw → classify → route →
 * trigger → apply pipeline. Splitting the gate from the pipeline lets rule
 * handlers (e.g., Midtown Bank Robbery twist) chain another reveal without
 * re-asserting the stage gate or duplicating the body.
 *
 * @param context - boardgame.io move context with G, ctx, random, playerID.
 */
export function revealVillainCard({ G, ctx, ...context }: MoveContext): void {
  // Step 0: Stage gate (non-core move contract)
  // why: villain reveal is a start-of-turn action per tabletop Legendary
  if (G.currentStage !== 'start') return;

  performVillainReveal(
    G,
    { random: context.random, ctx: { currentPlayer: ctx.currentPlayer } },
    DEFAULT_IMPLEMENTATION_MAP,
  );
}

/**
 * Reveals the top card from the villain deck and runs the full trigger pipeline.
 *
 * Pipeline: draw → classify → City routing (villain/henchman) → trigger →
 * apply effects → discard routing (bystander/scheme-twist/mastermind-strike).
 *
 * Handles edge cases:
 * - Empty deck + non-empty discard: reshuffles discard into deck first.
 * - Empty deck + empty discard: logs a message and returns.
 * - Missing card type: fail-closed — logs a message, card stays in deck.
 *
 * @param G - The game state to mutate.
 * @param context - Narrow context with random + ctx.currentPlayer.
 * @param implementationMap - Handler map used by executeRuleHooks.
 */
export function performVillainReveal(
  G: LegendaryGameState,
  context: RevealContext,
  implementationMap: ImplementationMap,
): void {
  const ctx = context.ctx;
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

      // why: card-specific Escape:/Overrun: effects fire AFTER
      // resolveEscapedBystanders per D-18603 — a captureBystander effect
      // reached via an Escape: marker attaches to the escaped card now in
      // G.escapedPile (post-release), not the still-attached pre-release
      // state. The generic per-escape current-player wound above (WP-015
      // legacy system-level penalty) is PRESERVED; card-text effects layer
      // on top, they do not replace it. Overrun: is a v1 synonym of Escape:
      // (D-18602) — both prefixes resolve to onEscape at parse time, so this
      // single fire site covers both. Henchman escapes safely no-op here
      // (per-card hook lookup misses; D-18507-class filter). Per WP-191
      // (D-18704..D-18708), pushResult.escapedCard is the zone-instance
      // ext_id the per-card hook lookup expects, so villain onEscape effects
      // now fire end-to-end on real cards (D-18508 CLOSED).
      executeVillainAbilities(G, ctx, pushResult.escapedCard, 'onEscape');
    }

    // why: Ambush fires on City entry. The hardcoded "each player gains a
    // wound" loop previously here is deleted (D-18504; supersedes the D-2403
    // safe-skip note for the Ambush case) — it fired identical wrong behavior
    // for every Ambush card regardless of printed text. Dispatch now runs the
    // card's parsed [effect:] hooks via executeVillainAbilities, gated by the
    // existing hasAmbush fast pre-check (the keyword-detection invariant from
    // buildCardKeywords.ts). The keyword map is re-derived inline so this call
    // carries no dependency on a deleted binding.
    // why: WP-200 — capture the executor's return and emit `ambushResolved`
    // BEFORE the unconditional bystander-attach block below. The
    // unconditional attach is NOT an Ambush effect (it's the MVP
    // city-entry rule per D-18504); it must not appear in
    // `appliedEffects` and must not be described in the narrative as an
    // Ambush effect. Resolving the citySpace via `G.city.indexOf(cardId)`
    // after `pushVillainIntoCity` reflects the final placement index
    // (0..4); -1 falls back to 0 if the push collapsed the card off the
    // edge (a contract violation the move never hits in production but
    // the emission must remain defensive).
    if (hasAmbush(cardId, G.cardKeywords ?? {})) {
      const appliedAmbushEffects = executeVillainAbilities(G, ctx, cardId, 'onAmbush');
      // why: WP-200 — defensive access; legacy test states may leave
      // `cardDisplayData` undefined. Production setup always builds it.
      const ambushCardDisplay = G.cardDisplayData?.[cardId];
      const ambushCardName =
        ambushCardDisplay && typeof ambushCardDisplay.name === 'string' && ambushCardDisplay.name.length > 0
          ? ambushCardDisplay.name
          : cardId;
      const ambushCitySpace = (() => {
        const found = G.city.indexOf(cardId);
        return found >= 0 ? found : 0;
      })();
      G.notableEvents.push({
        type: 'ambushResolved',
        revealedCardId: cardId,
        citySpace: ambushCitySpace,
        appliedEffects: appliedAmbushEffects,
        narrative: composeAmbushNarrative(ambushCardName, appliedAmbushEffects),
      });
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
  // why: pass the full RevealContext (not just ctx) to executeRuleHooks /
  // applyRuleEffects so handlers/applicators that need `random` (e.g., the
  // Midtown Bank Robbery twist chaining another reveal, or the drawCards
  // effect's reshuffle path) can reach it via `context.random.Shuffle`.
  const allEffects: RuleEffect[] = [];

  // Always emit onCardRevealed
  const cardRevealedEffects = executeRuleHooks(
    G,
    context,
    'onCardRevealed',
    { cardId, cardTypeSlug: cardType },
    G.hookRegistry,
    implementationMap,
  );

  for (const effect of cardRevealedEffects) {
    allEffects.push(effect);
  }

  // Conditionally emit type-specific triggers
  if (cardType === 'scheme-twist') {
    const schemeTwistEffects = executeRuleHooks(
      G,
      context,
      'onSchemeTwistRevealed',
      { cardId },
      G.hookRegistry,
      implementationMap,
    );

    for (const effect of schemeTwistEffects) {
      allEffects.push(effect);
    }
  }

  if (cardType === 'mastermind-strike') {
    const mastermindStrikeEffects = executeRuleHooks(
      G,
      context,
      'onMastermindStrikeRevealed',
      { cardId },
      G.hookRegistry,
      implementationMap,
    );

    for (const effect of mastermindStrikeEffects) {
      allEffects.push(effect);
    }
  }

  // Step 6: Apply all collected effects
  applyRuleEffects(G, context, allEffects);

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
