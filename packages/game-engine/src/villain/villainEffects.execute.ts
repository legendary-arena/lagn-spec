/**
 * Villain & henchman ability execution for the Legendary Arena game engine.
 *
 * executeVillainAbilities applies the locked 6-keyword MVP effect vocabulary
 * for a card at a given timing (onAmbush / onFight / onEscape). It mutates G
 * directly via existing zone helpers and returns the applied
 * `VillainEffectKeyword[]` in dispatch order (WP-200) so the four fire-site
 * emissions can record which effects actually ran. It is deliberately
 * separate from the global rule-hook pipeline (D-18501). Out-of-vocabulary
 * effects safe-skip silently and are NOT included in the return array.
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
import { captureHeroFromHq } from '../board/heroCapture.logic.js';
import { moveCardFromZone } from '../moves/zoneOps.js';
import { WOUND_EXT_ID } from '../setup/pilesInit.js';
import {
  SHIELD_AGENT_EXT_ID,
  SHIELD_TROOPER_EXT_ID,
} from '../setup/buildInitialGameState.js';

// ---------------------------------------------------------------------------
// executeVillainAbilities — main entry point
// ---------------------------------------------------------------------------

/**
 * Applies villain/henchman ability effects for a card at a given timing.
 *
 * Called from the Fight fire site (fightVillain.ts, 'onFight'), the Ambush
 * fire site (villainDeck.reveal.ts, 'onAmbush'), and the Escape fire site
 * (villainDeck.reveal.ts, 'onEscape' — WP-186). Looks up the card's hooks
 * for the timing and applies each effect in left-to-right array order.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param ctx - framework context passed as unknown to avoid a game-framework
 *   import. Only ctx.currentPlayer is read.
 * @param cardId - The villain/henchman card-instance ext_id that triggered.
 * @param timing - Which timing fired ('onAmbush', 'onFight', or 'onEscape').
 * @returns The applied effect keywords in dispatch order (post-safe-skip).
 *   WP-200 widening (D-20003): the return value lets the four fire-site
 *   emissions record which Fight: / Ambush: effects actually ran. Body
 *   behaviour is unchanged from WP-185 — only the return signature
 *   widens from `void` to `VillainEffectKeyword[]`. Out-of-vocabulary
 *   effects safe-skip and are NOT included. Callers that ignore the
 *   return value compile unchanged.
 */
export function executeVillainAbilities(
  G: LegendaryGameState,
  ctx: unknown,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
): VillainEffectKeyword[] {
  // why: WP-200 — accumulator captures the effect keywords whose case
  // branches actually ran, in dispatch order. Returned to the caller so
  // emissions can record exactly which Fight/Ambush effects fired.
  // Out-of-vocab effects (the default case) are NOT appended; the
  // emission sites see only effects whose state mutation was attempted.
  const appliedEffects: VillainEffectKeyword[] = [];

  // why: guard against older test mocks (and pre-WP-185 G states) that lack
  // villainAbilityHooks — mirrors the WP-022 heroAbilityHooks guard. No hooks
  // means no effects.
  if (!G.villainAbilityHooks || G.villainAbilityHooks.length === 0) {
    return appliedEffects;
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
      const applied = applyVillainEffect(G, currentPlayer, cardId, timing, effect);
      if (applied) {
        appliedEffects.push(effect);
      }
    }
  }

  return appliedEffects;
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
 * @returns `true` when an in-vocab case branch ran (regardless of whether
 *   mutation guards short-circuited inside it); `false` only on the
 *   out-of-vocab default. WP-200 D-20003: drives the `appliedEffects`
 *   array returned by `executeVillainAbilities` — only effects whose
 *   dispatch branch reached the body are listed (the post-safe-skip
 *   contract). Mutation-guarded short-circuits (e.g., empty wound pile)
 *   still count as "applied" because the keyword was attempted.
 */
function applyVillainEffect(
  G: LegendaryGameState,
  currentPlayer: string,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
  effect: VillainEffectKeyword,
): boolean {
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
      return true;
    }
    case 'gainWoundCurrentPlayer': {
      const zones = G.playerZones[currentPlayer];
      // why: WP-200 — mutation-guarded short-circuit still counts as
      // "applied" per the post-safe-skip contract (the keyword was
      // attempted; the empty-pile / missing-zone guards short-circuit
      // body work, not the dispatch). Returning true here keeps the
      // emission accurate to which effect tokens fired their case branch.
      if (!zones) return true;
      if (G.piles.wounds.length === 0) return true;
      const result = gainWound(G.piles.wounds, zones.discard);
      G.piles.wounds = result.woundsPile;
      zones.discard = result.playerDiscard;
      G.turnEconomy.woundsDrawn += 1;
      return true;
    }
    case 'koHeroCurrentPlayer': {
      koOneHeroForPlayer(G, currentPlayer);
      return true;
    }
    case 'koHeroEachPlayer': {
      // why: iterate every player and delegate to the shared resolver. The
      // iteration order is derived from `Object.keys(G.playerZones).sort()`
      // — default JavaScript string compare → lexical ascending — NOT from
      // `Object.keys`'s natural insertion order and NOT from a `Number()`
      // numeric sort (D-18902). For 1-5-player boardgame.io string ids
      // ('0'..'N-1') lexical equals numeric equals insertion order, so this
      // is observationally equal to the pre-existing `gainWoundEachPlayer`
      // iteration (which does not sort); the explicit `.sort()` here makes
      // the determinism contract auditable and robust to future setup-order
      // changes. The branch body is a thin loop — the shared resolver owns
      // target selection AND the `koCard` mutation; this caller MUST NOT
      // post-process or modify the resolver's output (D-18902 mutation-
      // location lock). The resolver is the same one called by the
      // `koHeroCurrentPlayer` case above, ensuring identical per-player
      // resolution (pinned by the shared-resolver parity test on a
      // single-player G). Auto-resolved, not interactive, not VP-based
      // (D-18503 carries forward from `koHeroCurrentPlayer`).
      const playerIds = Object.keys(G.playerZones).sort();
      for (const playerId of playerIds) {
        koOneHeroForPlayer(G, playerId);
      }
      return true;
    }
    case 'koHeroEachPlayerMag2': {
      // why: magnitude-2 each-player hero KO — iterate every player
      // (lexically sorted, D-18902 inherited from the `koHeroEachPlayer`
      // branch above) and run a literal-2 inner loop per player, each
      // iteration delegating to the same shared per-player KO resolver
      // (`koOneHeroForPlayer`). The literal `2` is intentional and NOT a
      // parameter (D-20201 closed-union-per-magnitude): magnitude lives in
      // the keyword name, not in a runtime field — parameterizing the
      // magnitude would force a parser regex change + a dispatch-contract
      // shape change (`effect` becomes `{ keyword, args }`) + every drift
      // test, which is the larger blast radius D-20201 rejects for v1.
      // The shared resolver owns target selection AND the `koCard`
      // mutation; this caller MUST NOT post-process or modify the
      // resolver's output (D-18902 mutation-location lock extends here).
      // Per-iteration semantics inherit from D-18503: discard before
      // hand, ext_id lexical tie-break, silent no-op for zero eligible
      // heroes — auto-resolved, not interactive, not VP-based. A player
      // with exactly 1 eligible hero loses 1 (the second iteration silent
      // no-ops); a player with 0 eligible heroes loses 0 (both iterations
      // silent no-op). Magnitude-2 ≡ magnitude-1-twice parity is pinned
      // by the shared-resolver parity test on a single-player G.
      //
      // Future magnitude-N expansion (e.g., `koHeroEachPlayerMag3`): copy
      // this entire case body, rename to `MagN`, change the literal `2`
      // to `N`, append the new keyword at the next position in
      // `VILLAIN_EFFECT_KEYWORDS`. No parser/regex/dispatch contract
      // change — closed-union-per-magnitude (D-20201) is the seam, and
      // the inner-loop bound is intentionally literal (not extracted to
      // a helper) because parameterization would re-introduce the shape
      // D-20201 rejects.
      const playerIds = Object.keys(G.playerZones).sort();
      for (const playerId of playerIds) {
        for (let iteration = 0; iteration < 2; iteration++) {
          koOneHeroForPlayer(G, playerId);
        }
      }
      return true;
    }
    case 'heroDeckTopToEscape': {
      // why: WP-185 §Scope wrote "G.piles.heroDeck[0]" but the engine's hero
      // reservoir is the top-level G.heroDeck (GlobalPiles has no heroDeck);
      // this moves the top of that reservoir to the escaped pile. Silent no-op
      // when the reservoir is empty.
      if (G.heroDeck.length === 0) return true;
      const topCard = G.heroDeck[0]!;
      G.heroDeck = G.heroDeck.slice(1);
      G.escapedPile = [...G.escapedPile, topCard];
      return true;
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
      return true;
    }
    case 'captureHqHeroRightmost': {
      // why: captures the rightmost non-null hero from the HQ (index 4 → 0)
      captureHeroFromHq(G, cardId, 'rightmost');
      return true;
    }
    case 'captureHqHeroHighestCost': {
      // why: captures the highest-cost hero from the HQ; ties resolved by
      // rightmost index per selector determinism contract (WP-214)
      captureHeroFromHq(G, cardId, 'highestCost');
      return true;
    }
    case 'captureHqHeroLowestCost': {
      // why: captures the lowest-cost hero from the HQ; ties resolved by
      // rightmost index per selector determinism contract (WP-214)
      captureHeroFromHq(G, cardId, 'lowestCost');
      return true;
    }
    default: {
      // why: out-of-vocabulary effects safe-skip silently — moves never throw,
      // no console output, no message push (matches the WP-022 hero-effects
      // precedent for unsupported keywords). Reachable only via a malformed
      // hook; the parser validates markers against VILLAIN_EFFECT_KEYWORDS.
      // WP-200 D-20003: returning false excludes the effect from the
      // executor's `appliedEffects[]` return value — the post-safe-skip
      // contract means emission sites only see effects whose dispatch
      // branch ran (not parsed-but-unknown tokens).
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared per-player KO resolver
// ---------------------------------------------------------------------------

/**
 * KOs one hero card from the given player's discard (priority) then hand.
 *
 * Shared per-player resolver called by BOTH the `koHeroCurrentPlayer` and
 * `koHeroEachPlayer` effect cases — the latter iterates every player in
 * `Object.keys(G.playerZones).sort()` order and calls this helper once per
 * player. There is no duplicated KO logic anywhere else in the executor
 * (D-18902); the per-player KO semantics live here and nowhere else.
 *
 * Originally introduced as `koHeroForCurrentPlayer` by WP-185 with a
 * misleading name (the parameter is any player id, not specifically the
 * current player); WP-189 renamed it to make the shared-helper intent
 * obvious and added the `koHeroEachPlayer` second call site.
 *
 * The resolver performs the `koCard` mutation itself — callers MUST NOT
 * post-process or modify its output. Both branches reach byte-identical
 * post-state on a single-player G (pinned by the shared-resolver parity
 * test).
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerId - The target player id (any player; for the
 *   `koHeroCurrentPlayer` case this is `ctx.currentPlayer`, for the
 *   `koHeroEachPlayer` case it is each entry of the sorted player-ids
 *   iteration).
 */
// why: deterministic auto-resolution — zone priority is discard → hand →
// inPlay per D-20603 (which adds the third tier on top of D-18503's
// original discard-then-hand contract; the third tier closes the
// turn-1 autoplay no-op where every starter card the bot just played
// sits in inPlay while hand and discard are both empty). Within each
// tier, the D-20602 two-tier ext_id rule applies: starting SHIELD
// cards (`starting-shield-trooper`, `starting-shield-agent`) ahead of
// everything else, with ext_id lexical ascending as the tie-break.
// Starting-first preserves replay determinism and remains NOT VP-based
// — the starter set is a closed enum, no registry read (D-18503
// carries forward). The printed card grants player choice; interactive
// targeting is deferred to a future UI WP (WP-185 §Out of Scope). This
// function owns the `koCard` mutation site for the per-player KO —
// callers in both the `koHeroCurrentPlayer` and `koHeroEachPlayer`
// dispatch cases delegate to it and do not post-process its output, so
// the mutation site is uniform across branches (D-18902
// mutation-location lock; single source of truth for KO targeting +
// replay determinism).
function koOneHeroForPlayer(
  G: LegendaryGameState,
  playerId: string,
): void {
  const zones = G.playerZones[playerId];
  if (!zones) return;

  const discardTarget = selectKoHeroTarget(zones.discard);
  if (discardTarget !== null) {
    const moveResult = moveCardFromZone(zones.discard, [], discardTarget);
    if (moveResult.found) {
      zones.discard = moveResult.from;
      G.ko = koCard(G.ko, discardTarget);
    }
    // why: discard has strict priority — once a discard hero is chosen we stop
    // and never fall through to hand or inPlay.
    return;
  }

  const handTarget = selectKoHeroTarget(zones.hand);
  if (handTarget !== null) {
    const moveResult = moveCardFromZone(zones.hand, [], handTarget);
    if (moveResult.found) {
      zones.hand = moveResult.from;
      G.ko = koCard(G.ko, handTarget);
    }
    // why: hand wins over inPlay once a hand hero is chosen.
    return;
  }

  // why: D-20603 — inPlay is the third tier. The autoplay flow runs
  // `playCard` for every hand card (hand → inPlay) BEFORE the spend
  // phase that calls `fightVillain`, so on turn 1 (when nothing has
  // cycled into discard yet) both hand and discard are empty while
  // inPlay holds every starter SHIELD card the bot just played.
  // Without this third tier, a Sentinel Fight: KO no-ops silently
  // even though the printed text "KO one of your Heroes" clearly has
  // 6 eligible targets sitting in inPlay. Same starter-first priority
  // applies (D-20602 carries forward via selectKoHeroTarget).
  const inPlayTarget = selectKoHeroTarget(zones.inPlay);
  if (inPlayTarget !== null) {
    const moveResult = moveCardFromZone(zones.inPlay, [], inPlayTarget);
    if (moveResult.found) {
      zones.inPlay = moveResult.from;
      G.ko = koCard(G.ko, inPlayTarget);
    }
  }
}

/**
 * Selects the highest-priority hero card ext_id in a zone, or null.
 *
 * Priority (D-20602 amends D-18503):
 *   1. Starting SHIELD cards (Trooper / Agent) — KO the worst cards first
 *      so auto-resolution acts as deck-thinning, not as a penalty.
 *   2. Among non-starting non-wound cards, fall back to ext_id lexical
 *      ascending (the original D-18503 tie-break).
 *
 * @param zone - A player's hand or discard zone.
 * @returns The KO target ext_id, or null when the zone has no hero card.
 */
// why: a "hero card" for KO purposes is any card that is NOT a wound token.
// Wounds are not Heroes — KO-a-Hero must not remove a wound (that would
// invert the penalty into a benefit). Starting SHIELD cards (cost 0, +1
// attack OR +1 recruit each) are the worst cards in any deck; preferring
// them first turns the auto-resolution into deck-thinning instead of
// silently KO-ing the player's best recruited heroes (recruited ext_ids
// like 'core/spider-man/...' sort lex-before 'starting-shield-...' under
// pure lex-asc, so the pre-D-20602 heuristic always picked good cards).
// Membership check uses a closed enum, so the rule remains NOT VP-based
// and reads no registry at runtime (D-18503 carries forward).
function selectKoHeroTarget(zone: CardExtId[]): CardExtId | null {
  let startingSelected: CardExtId | null = null;
  let otherSelected: CardExtId | null = null;
  for (const candidate of zone) {
    if (candidate === WOUND_EXT_ID) continue;
    if (candidate === SHIELD_AGENT_EXT_ID || candidate === SHIELD_TROOPER_EXT_ID) {
      if (startingSelected === null || candidate < startingSelected) {
        startingSelected = candidate;
      }
    } else {
      if (otherSelected === null || candidate < otherSelected) {
        otherSelected = candidate;
      }
    }
  }
  return startingSelected ?? otherSelected;
}
