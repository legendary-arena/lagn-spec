/**
 * Villain & henchman ability execution for the Legendary Arena game engine.
 *
 * executeVillainAbilities applies the locked 5-keyword MVP effect vocabulary
 * for a card at a given timing (onAmbush / onFight). It mutates G directly via
 * existing zone helpers and returns void — it does NOT return RuleEffect[] and
 * is deliberately separate from the global rule-hook pipeline (D-18501).
 * Out-of-vocabulary effects safe-skip silently.
 *
 * Imports no game framework and no registry package. No .reduce().
 * Uses existing helpers only: gainWound, koCard, moveCardFromZone,
 * attachBystanderToVillain, awardAttachedBystanders.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import type {
  VillainAbilityTiming,
  VillainEffectKeyword,
} from '../rules/villainAbility.types.js';
import { getVillainHooksForCard } from '../rules/villainAbility.types.js';
import { gainWound } from '../board/wounds.logic.js';
import { koCard } from '../board/ko.logic.js';
import {
  attachBystanderToVillain,
  awardAttachedBystanders,
} from '../board/bystanders.logic.js';
import { moveCardFromZone } from '../moves/zoneOps.js';
import { WOUND_EXT_ID } from '../setup/pilesInit.js';

// ---------------------------------------------------------------------------
// executeVillainAbilities — main entry point
// ---------------------------------------------------------------------------

/**
 * Applies villain/henchman ability effects for a card at a given timing.
 *
 * Called from the Fight fire site (fightVillain.ts, 'onFight') and the Ambush
 * fire site (villainDeck.reveal.ts, 'onAmbush'). Looks up the card's hooks for
 * the timing and applies each effect in left-to-right array order.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param ctx - framework context passed as unknown to avoid a game-framework
 *   import. Only ctx.currentPlayer is read.
 * @param cardId - The villain/henchman card-instance ext_id that triggered.
 * @param timing - Which timing fired ('onAmbush' or 'onFight').
 */
export function executeVillainAbilities(
  G: LegendaryGameState,
  ctx: unknown,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
): void {
  // why: guard against older test mocks (and pre-WP-185 G states) that lack
  // villainAbilityHooks — mirrors the WP-022 heroAbilityHooks guard. No hooks
  // means no effects.
  if (!G.villainAbilityHooks || G.villainAbilityHooks.length === 0) {
    return;
  }

  // why: ctx is typed `unknown` and narrowed via `as` to the one field this
  // executor reads — the active player id. The executor is barred from
  // importing the framework's Ctx / FnContext types, exactly as
  // heroEffects.execute.ts narrows `ctx as ShuffleProvider`. All other
  // iteration derives from G.
  const currentPlayer = (ctx as { currentPlayer: string }).currentPlayer;

  const hooks = getVillainHooksForCard(G.villainAbilityHooks, cardId, timing);
  for (const hook of hooks) {
    for (const effect of hook.effects) {
      applyVillainEffect(G, currentPlayer, cardId, timing, effect);
    }
  }
}

// ---------------------------------------------------------------------------
// Single effect dispatch
// ---------------------------------------------------------------------------

/**
 * Applies one villain effect keyword deterministically.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param currentPlayer - The active player id.
 * @param cardId - The triggering villain/henchman card-instance ext_id.
 * @param timing - The timing that fired (changes captureBystander behavior).
 * @param effect - The effect keyword to apply.
 */
function applyVillainEffect(
  G: LegendaryGameState,
  currentPlayer: string,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
  effect: VillainEffectKeyword,
): void {
  switch (effect) {
    case 'gainWoundEachPlayer': {
      // why: every player gains 1 wound (subject to wound-pile availability),
      // mirroring the existing escape-wound no-op-on-empty semantics.
      for (const playerId of Object.keys(G.playerZones)) {
        const zones = G.playerZones[playerId];
        if (!zones) continue;
        if (G.piles.wounds.length === 0) continue;
        const result = gainWound(G.piles.wounds, zones.discard);
        G.piles.wounds = result.woundsPile;
        zones.discard = result.playerDiscard;
        if (playerId === currentPlayer) {
          // why: woundsDrawn projects the current player's wounds only (UI
          // economy), matching escape-wound and the deleted Ambush loop.
          G.turnEconomy.woundsDrawn += 1;
        }
      }
      break;
    }
    case 'gainWoundCurrentPlayer': {
      const zones = G.playerZones[currentPlayer];
      if (!zones) break;
      if (G.piles.wounds.length === 0) break;
      const result = gainWound(G.piles.wounds, zones.discard);
      G.piles.wounds = result.woundsPile;
      zones.discard = result.playerDiscard;
      G.turnEconomy.woundsDrawn += 1;
      break;
    }
    case 'koHeroCurrentPlayer': {
      koHeroForCurrentPlayer(G, currentPlayer);
      break;
    }
    case 'heroDeckTopToEscape': {
      // why: WP-185 §Scope wrote "G.piles.heroDeck[0]" but the engine's hero
      // reservoir is the top-level G.heroDeck (GlobalPiles has no heroDeck);
      // this moves the top of that reservoir to the escaped pile. Silent no-op
      // when the reservoir is empty.
      if (G.heroDeck.length === 0) break;
      const topCard = G.heroDeck[0]!;
      G.heroDeck = G.heroDeck.slice(1);
      G.escapedPile = [...G.escapedPile, topCard];
      break;
    }
    case 'captureBystander': {
      const attachResult = attachBystanderToVillain(
        G.piles.bystanders,
        cardId,
        G.attachedBystanders,
      );
      G.piles.bystanders = attachResult.bystandersPile;
      G.attachedBystanders = attachResult.attachedBystanders;
      if (timing === 'onFight') {
        // why: the Fight fire site is post-award, so a bystander attached now
        // to a card already in the victory pile would be stranded (never
        // awarded). Award it immediately to preserve tabletop "rescue on
        // defeat" semantics (D-18506). No-op when the pile was empty (nothing
        // was attached).
        const zones = G.playerZones[currentPlayer];
        if (zones) {
          const awardResult = awardAttachedBystanders(
            cardId,
            G.attachedBystanders,
            zones.victory,
          );
          G.attachedBystanders = awardResult.attachedBystanders;
          zones.victory = awardResult.playerVictory;
        }
      }
      break;
    }
    default: {
      // why: out-of-vocabulary effects safe-skip silently — moves never throw,
      // no console output, no message push (matches the WP-022 hero-effects
      // precedent for unsupported keywords). Reachable only via a malformed
      // hook; the parser validates markers against VILLAIN_EFFECT_KEYWORDS.
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// koHeroCurrentPlayer resolver
// ---------------------------------------------------------------------------

/**
 * KOs one hero card from the current player's discard (priority) then hand.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param currentPlayer - The active player id.
 */
// why: deterministic auto-resolution — zone priority (discard before hand),
// then ext_id lexical ascending. It is explicitly NOT VP-based: per-card hero
// VP is not in engine runtime state (G.cardStats carries attack/recruit/cost/
// fightCost only) and a runtime registry read would be a layer violation
// (D-18503). The printed card grants player choice; interactive targeting is
// deferred to a future UI WP (WP-185 §Out of Scope).
function koHeroForCurrentPlayer(
  G: LegendaryGameState,
  currentPlayer: string,
): void {
  const zones = G.playerZones[currentPlayer];
  if (!zones) return;

  const discardTarget = selectKoHeroTarget(zones.discard);
  if (discardTarget !== null) {
    const moveResult = moveCardFromZone(zones.discard, [], discardTarget);
    if (moveResult.found) {
      zones.discard = moveResult.from;
      G.ko = koCard(G.ko, discardTarget);
    }
    // why: discard has strict priority — once a discard hero is chosen we stop
    // and never fall through to the hand.
    return;
  }

  const handTarget = selectKoHeroTarget(zones.hand);
  if (handTarget !== null) {
    const moveResult = moveCardFromZone(zones.hand, [], handTarget);
    if (moveResult.found) {
      zones.hand = moveResult.from;
      G.ko = koCard(G.ko, handTarget);
    }
  }
}

/**
 * Selects the lexically-smallest hero card ext_id in a zone, or null.
 *
 * @param zone - A player's hand or discard zone.
 * @returns The KO target ext_id, or null when the zone has no hero card.
 */
// why: a "hero card" for KO purposes is any card that is NOT a wound token.
// Wounds are not Heroes — KO-a-Hero must not remove a wound (that would invert
// the penalty into a benefit). The wound token is the only non-hero card that
// can sit in a player's hand/discard (bystanders go to the victory zone), so a
// non-wound predicate is the minimal correct hero filter without a registry
// read (D-18503).
function selectKoHeroTarget(zone: CardExtId[]): CardExtId | null {
  let selected: CardExtId | null = null;
  for (const candidate of zone) {
    if (candidate === WOUND_EXT_ID) continue;
    if (selected === null || candidate < selected) {
      selected = candidate;
    }
  }
  return selected;
}
