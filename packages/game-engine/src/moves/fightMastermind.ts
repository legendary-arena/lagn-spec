/**
 * Fight mastermind move for the Legendary Arena game engine.
 *
 * fightMastermind defeats the top tactic card from the mastermind's
 * tactics deck when the player has sufficient attack points. When all
 * tactics are defeated, the victory counter is set. Follows the
 * three-step validation contract: validate args, check stage gate,
 * mutate G.
 *
 * This is a non-core move that gates internally (same pattern as
 * fightVillain and recruitHero from WP-016). It is NOT added to
 * CoreMoveName, CORE_MOVE_NAMES, or MOVE_ALLOWED_STAGES.
 *
 * No registry imports. No .reduce(). Moves never throw.
 */

import type { FnContext, PlayerID } from 'boardgame.io';
import type { LegendaryGameState } from '../types.js';
import { getAvailableAttack, spendAttack } from '../economy/economy.logic.js';
import { defeatTopTactic, areAllTacticsDefeated } from '../mastermind/mastermind.logic.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';
import { composeMastermindDefeatedNarrative } from '../events/notableEvents.compose.js';
import { hasPendingKoHeroChoice } from './koHeroChoice.resolve.js';
import { hasPendingOptionalKoReward } from './optionalKoReward.resolve.js';

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Fights the mastermind by defeating the top tactic card.
 *
 * Validates available attack against the mastermind's fight requirement,
 * defeats exactly one tactic per successful fight, and checks for
 * victory when all tactics are defeated.
 *
 * @param context - boardgame.io move context with G, ctx.
 */
// why: MVP defeats exactly 1 tactic per fight; multi-tactic defeat
// and tactic text effects are WP-024
export function fightMastermind(
  { G, ctx }: MoveContext,
): void {
  // Step 1: Validate
  if (G.mastermind.tacticsDeck.length === 0) {
    return;
  }

  // why: baseCardId is the canonical stats key; fightCost is the fight
  // requirement field per WP-018 D-1805; never use G.mastermind.id or
  // any tactic card ID for stat lookup
  const requiredFightCost = G.cardStats[G.mastermind.baseCardId]?.fightCost ?? 0;
  const availableAttack = getAvailableAttack(G.turnEconomy);

  // why: silent failure preserves deterministic move contract —
  // insufficient attack points means the mastermind fight cannot proceed
  if (availableAttack < requiredFightCost) {
    return;
  }

  // Step 2: Stage gate (non-core move, internal gating)
  // why: boss fight during action window; non-core moves gate internally
  // per WP-014A precedent (same pattern as fightVillain/recruitHero)
  if (G.currentStage !== 'main') return;

  // why: block-all guard (D-24008) — while a KO-a-Hero choice is pending the
  // board is frozen; fightMastermind returns with no side effects. Placed
  // immediately after the stage gate, before any G/zone write.
  if (hasPendingKoHeroChoice(G)) return;
  // why: block-all guard (D-24019) — optional-KO-reward choice pending; the
  // board is frozen until resolved (beside the D-24008 KO-hero check above).
  if (hasPendingOptionalKoReward(G)) return;

  // Step 3: Mutate G
  // why: capture the tactic card ID before defeatTopTactic moves it from
  // tacticsDeck to tacticsDefeated — the player earns this card in their
  // victory pile (tabletop Legendary: defeated tactics are VP cards).
  const defeatedTacticId = G.mastermind.tacticsDeck[0]!;
  G.mastermind = defeatTopTactic(G.mastermind);
  G.playerZones[ctx.currentPlayer]!.victory.push(defeatedTacticId);
  G.turnEconomy = spendAttack(G.turnEconomy, requiredFightCost);

  G.messages.push(
    `Player ${ctx.currentPlayer} fought mastermind "${G.mastermind.id}" and defeated a tactic.`,
  );

  // why: EVERY tactic defeat rescues all bystanders the Mastermind is
  // currently holding — NOT only the vanquishing blow. Universal Rules v23
  // §"When you fight a Mastermind/Commander" step 1: "put that Tactic into
  // your Victory Pile ... (Also rescue any Bystanders the Mastermind was
  // holding, putting them all into your Victory Pile.)". The Mastermind is
  // "not truly defeated until all four Tactics are defeated" (rules
  // §Mastermind Card), but that gates the WIN, not the rescue. Earlier code
  // awarded captured bystanders only on the final tactic — the bug reported
  // on play.legendary-arena.com. G.mastermind.attachedBystanders is the
  // complete capture set as of this fight: Master Strike captures (D-15401,
  // stored only here) plus bystanders revealed while the City was empty
  // (villainDeck.reveal mirrors those into this field too). The fighting
  // player earns all of them in their victory pile (rescued bystanders are
  // VP cards). `?? []` guards legacy test fixtures that omit the field;
  // production setup always populates it. The store is cleared after the
  // award so a later Master Strike re-capture is rescued by the next fight.
  const mastermindBaseCardId = G.mastermind.baseCardId;
  const rescuedBystanders = G.mastermind.attachedBystanders ?? [];
  for (const bystanderCardId of rescuedBystanders) {
    G.playerZones[ctx.currentPlayer]!.victory.push(bystanderCardId);
  }
  G.mastermind = { ...G.mastermind, attachedBystanders: [] };

  // why: bystanders revealed while the City was empty are mirrored into
  // BOTH G.mastermind.attachedBystanders (awarded above) and the
  // city-villain G.attachedBystanders map keyed by the mastermind's base
  // card. Drop that mirror entry so no dangling attachment survives the
  // award and the same bystander is never counted in two stores.
  if (G.attachedBystanders[mastermindBaseCardId] !== undefined) {
    const remainingAttachments = { ...G.attachedBystanders };
    delete remainingAttachments[mastermindBaseCardId];
    G.attachedBystanders = remainingAttachments;
  }

  if (rescuedBystanders.length > 0) {
    G.messages.push(
      `Player ${ctx.currentPlayer} rescued ${rescuedBystanders.length} bystander(s) from the mastermind into their victory pile.`,
    );
  }

  if (areAllTacticsDefeated(G.mastermind)) {
    // why: setting MASTERMIND_DEFEATED counter to 1 triggers the endgame
    // evaluator from WP-010 — use constant, never string literal
    G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED] = 1;
    G.messages.push(
      `All tactics defeated — mastermind "${G.mastermind.id}" is vanquished!`,
    );

    // why: D-20008 parity with fightVillain's fightResolved event — surface
    // a player-visible "mastermind defeated + bystanders rescued" notable
    // event so the arena-client overlay reports the outcome. G.messages is
    // NOT projected to clients (UIState carries notableEvents only), so
    // without this the rescue is invisible on the client. Emitted last so it
    // observes fully-settled state. Defensive cardDisplayData access mirrors
    // the mastermind-strike handler — production setup always builds it;
    // legacy test fixtures may omit it, in which case the id is the fallback.
    const mastermindDisplay = G.cardDisplayData?.[G.mastermind.baseCardId];
    const mastermindName =
      mastermindDisplay && typeof mastermindDisplay.name === 'string' && mastermindDisplay.name.length > 0
        ? mastermindDisplay.name
        : G.mastermind.id;
    G.notableEvents.push({
      type: 'mastermindDefeated',
      playerId: ctx.currentPlayer,
      mastermindId: G.mastermind.id,
      bystandersRescued: rescuedBystanders.length,
      narrative: composeMastermindDefeatedNarrative(
        mastermindName,
        rescuedBystanders.length,
      ),
    });
  }
}
