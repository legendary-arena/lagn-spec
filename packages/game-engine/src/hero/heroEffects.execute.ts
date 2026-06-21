/**
 * Hero effect execution for the Legendary Arena game engine.
 *
 * Executes a safe MVP subset of hero ability keywords when a hero card
 * is played. Only unconditional effects with valid magnitude are executed.
 * Conditional effects and unsupported keywords are safely skipped.
 *
 * Dispatch is data-driven (WP-251 / D-24022): each keyword maps to a handler
 * in HERO_EFFECT_HANDLERS (an ImplementationMap mirroring WP-009B) instead of a
 * switch. Handlers hold no state and live outside G.
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 * Uses existing helpers only: moveCardFromZone, moveAllCards, shuffleDeck,
 * addResources, koCard.
 */

import type { LegendaryGameState, PendingHeroChoice } from '../types.js';
import type { CardExtId, PlayerZones } from '../state/zones.types.js';
import type { CardStatEntry } from '../economy/economy.types.js';
import type { HeroKeyword } from '../rules/heroKeywords.js';
import { HERO_KEYWORDS } from '../rules/heroKeywords.js';
import type { HeroAbilityHook, HeroEffectDescriptor } from '../rules/heroAbility.types.js';
import { getHooksForCard } from '../rules/heroAbility.types.js';
import type { EffectExecutionReason } from '../diagnostics/hollowEffect.types.js';
import { isHollowReason, DEFERRED_BY_DESIGN_MECHANICS } from '../diagnostics/hollowEffect.types.js';
import { recordHollowEffect } from '../diagnostics/hollowEffect.record.js';
import type { RevealRule, RevealAction, RevealPredicate, RevealActionKind } from '../rules/revealRule.js';
import { evaluateAllConditions } from './heroConditions.evaluate.js';
import type { HeroEffectResult } from './heroEffects.types.js';
import type { ShuffleProvider } from '../setup/shuffle.js';
import { shuffleDeck } from '../setup/shuffle.js';
import { moveCardFromZone, moveAllCards } from '../moves/zoneOps.js';
import { addResources } from '../economy/economy.logic.js';
import { koCard } from '../board/ko.logic.js';
import { resolveCountSource } from './heroCountSource.resolve.js';
import { interpretHeroPrimitiveEffect } from './effectPrimitive.interpret.js';

// ---------------------------------------------------------------------------
// MVP keyword set
// ---------------------------------------------------------------------------

// why: WP-215 adds 'rescue' and 'reveal' to the executed set. WP-217 adds
// 'reveal-ko' and 'reveal-min'. WP-218 adds 'reveal-ko-or-draw' (D-21802).
// WP-219 adds 'reveal-cost-attack' (D-21901) and 'reveal-odd-draw' (D-21902).
// WP-220 adds 'reveal-attack-choose' (D-22003).
// WP-223 adds 'reveal-ko-attack' (D-22301).
// WP-247 adds 'attack-per-count' (D-24016) — count-scaled attack.
// WP-248 adds 'optional-ko-reward' (D-24019) — parks a "you may KO a card; if
// you do, <reward>" interactive choice.
// 'wound' and 'conditional' remain deferred — they require targeting UI or
// additional game systems not yet implemented.
//
// why (WP-251 / re-spec WP-253 D-24024): the registry-drift test splits into two
// concerns. HANDLED_KEYWORDS is the keywords with a HERO_EFFECT_HANDLERS entry — the
// single handler-completeness authority (the drift test asserts the handler keys
// deep-equal it bidirectionally). After the reveal collapse there are 8 handlers:
// the 7 legacy reveal-* keywords lost their dedicated handlers (folded into the one
// 'reveal' handler) but stay executable via revealRulesForLegacyKeyword translation.
export const HANDLED_KEYWORDS = new Set<HeroKeyword>([
  'draw', 'attack', 'recruit', 'ko', 'rescue', 'reveal', 'attack-per-count', 'optional-ko-reward',
]);

// why: the 7 frozen legacy reveal keywords (REVEAL_KEYWORDS minus 'reveal') keep NO
// handler — they translate to a 'reveal' descriptor at parse time. They remain in
// the executable-coverage set so the drift test still recognizes them as reachable.
const FROZEN_REVEAL_TRANSLATED: readonly HeroKeyword[] = [
  'reveal-ko', 'reveal-min', 'reveal-ko-or-draw', 'reveal-cost-attack', 'reveal-odd-draw', 'reveal-attack-choose', 'reveal-ko-attack',
];

// why (WP-251 / D-24024): MVP_KEYWORDS = HANDLED_KEYWORDS ∪ the frozen-translated
// reveal keywords — the set of keywords that execute (directly via a handler, or via
// reveal translation). The executeSingleEffect pre-gate keys on it; the coverage
// drift test asserts every member is handled directly OR resolves through
// revealRulesForLegacyKeyword. Do not duplicate this set elsewhere (the coverage
// probe's EXECUTED_KEYWORDS is a separate, informational copy).
export const MVP_KEYWORDS = new Set<string>([...HANDLED_KEYWORDS, ...FROZEN_REVEAL_TRANSLATED]);

// why: D-24019 — the reward of an optional-ko-reward effect is dispatched to an
// ALREADY-BUILT reward executor; only these four are seeded. Defensive guard at
// the park site: the parser already filters unseeded rewards, so an unseeded
// type here is a logged no-op that never reaches the pending queue. Mirrors the
// same constant in setup/heroAbility.setup.ts (two copies, per duplicate-first).
const OPTIONAL_KO_REWARD_SEEDED_REWARDS: ReadonlySet<HeroKeyword> = new Set<HeroKeyword>([
  'rescue',
  'draw',
  'attack',
  'recruit',
]);

// why: these keywords bypass the executeSingleEffect pre-check magnitude gate.
// 'rescue' defaults its magnitude to 1. 'reveal' is here because the collapsed
// reveal handler (D-24024) routes ALL 8 legacy reveal-* variants — including the
// no-magnitude ones (reveal-ko / reveal-odd-draw / reveal-cost-attack) and the
// M=0-valid ones (reveal / reveal-min) — so ALL reveal magnitude gating now lives
// in revealRulesForLegacyKeyword + the per-rule predicates, NEVER at this top-level
// gate. The 7 legacy reveal-* keywords no longer reach the pre-gate (they are
// translated to 'reveal' at parse time), so their former entries are dropped.
// (D-24024 / pre-flight PS-1)
const NO_MAGNITUDE_KEYWORDS = new Set<string>([
  'rescue', 'reveal',
]);

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
      // why: WP-257 — a hook whose conditions failed reached a real (condition)
      // handler and intentionally did not execute — a `condition-failed` reachable
      // outcome, NOT hollow. Skip detection entirely (no record), reproducing the
      // existing `continue`.
      continue;
    }

    // why: effects is optional on HeroAbilityHook. A hook may carry legacy `effects`,
    // composition `primitiveEffects`, or both — run whichever are present. (The former
    // early-`continue` on absent `effects` is gone because it would skip a Berserk hook,
    // which carries only primitiveEffects.)
    if (hook.effects !== undefined) {
      for (const effect of hook.effects) {
        executeSingleEffect(G, ctx, playerID, cardId, effect);
      }
    }

    // why: D-24031 / RISK-2 — primitiveEffects run AFTER the legacy `effects` loop, in
    // array order, inside the same conditions-passed gate. The legacy-then-primitive
    // order is locked for determinism: a line carrying both a legacy effect (e.g. an
    // [icon:recruit]) and the Berserk composition applies them in a fixed order. Each
    // top-level node gets its own fresh, never-persisted execution context.
    if (hook.primitiveEffects !== undefined) {
      for (const primitiveEffect of hook.primitiveEffects) {
        interpretHeroPrimitiveEffect(G, ctx, playerID, primitiveEffect);
      }
    }

    // why: WP-257 / D-24033 — AFTER the hook ran, classify whether the whole hook was
    // hollow (per-hook rule, NOT state-diff): the detector asks "did any declared
    // mechanic on this line reach an executable handler?" — never whether G changed.
    // recordHollowEffect fires only when NO declared effect was reachable AND ≥1 was a
    // hollow reason (mixed-hook lines with ≥1 reachable effect never flag).
    detectHollowHeroHook(G, ctx, cardId, hook);
  }
}

// ---------------------------------------------------------------------------
// Hollow-effect detection (WP-257 / D-24033 + D-24034)
// ---------------------------------------------------------------------------

/**
 * Reads the boardgame.io turn number off the (unknown-typed) ctx, defaulting
 * to 0 when absent.
 *
 * The executor narrows ctx only where it needs a specific field (the draw
 * handler narrows to ShuffleProvider). The turn is read here for the
 * HollowEffectRecord. Test mocks (makeMockCtx, the villain CTX object) carry no
 * top-level `turn`, so a missing or non-numeric value falls back to 0 — never a
 * throw.
 *
 * @param ctx - The boardgame.io context, typed unknown to avoid a framework import.
 * @returns The turn number, or 0 when unavailable.
 */
function readTurnNumber(ctx: unknown): number {
  if (ctx !== null && typeof ctx === 'object') {
    const turn = (ctx as { turn?: unknown }).turn;
    if (typeof turn === 'number' && Number.isFinite(turn)) {
      return turn;
    }
  }
  return 0;
}

/**
 * Classifies one declared hero effect by handler REACHABILITY (never by diffing
 * G). Returns the EffectExecutionReason the per-hook rule aggregates.
 *
 * Mirrors executeSingleEffect's gating, but answers "is a handler reachable for
 * this mechanic?" rather than mutating: a deferred-by-design mechanic is
 * `deferred`; any MVP keyword (a direct handler OR a reveal translation exists)
 * is reachable (`applied`); a recognized HeroKeyword with no handler is
 * `no-handler`; a token that is not even a recognized keyword is
 * `unsupported-keyword`. Magnitude validity is a within-handler concern, not a
 * missing handler, so it does not change reachability.
 *
 * @param effect - The declared hero effect descriptor.
 * @returns The reachability classification reason.
 */
function classifyHeroEffectReason(effect: HeroEffectDescriptor): EffectExecutionReason {
  const keyword: string = effect.type;
  // why: D-24033 — the explicit deferred allowlist is consulted BEFORE the
  // MVP/handler check. `wound`/`conditional` have no handler today (absent from
  // MVP_KEYWORDS), so without this they would classify `no-handler` → hollow even
  // though they are implemented-as-deferred by design.
  if (DEFERRED_BY_DESIGN_MECHANICS.has(keyword)) {
    return 'deferred';
  }
  // why: any MVP keyword has a reachable handler — either a direct
  // HERO_EFFECT_HANDLERS entry or a reveal translation (revealRulesForLegacyKeyword).
  // Reaching a handler is the not-hollow condition; the magnitude pre-gate inside
  // executeSingleEffect is internal handler logic, not a missing handler.
  if (MVP_KEYWORDS.has(keyword)) {
    return 'applied';
  }
  // why: a recognized HeroKeyword with neither a handler nor a deferred entry is
  // `no-handler` (recognized-but-unimplemented). A token that is not even a valid
  // HeroKeyword (only reachable via a malformed hook / test cast) is
  // `unsupported-keyword` — dispatch cannot execute it.
  if (isValidHeroKeyword(keyword)) {
    return 'no-handler';
  }
  return 'unsupported-keyword';
}

/**
 * Returns whether a string is a valid HeroKeyword.
 *
 * Local copy of the setup-parser guard (duplicate-first per §16.1; a third
 * appearance would justify extracting it). Used to split `no-handler`
 * (recognized keyword) from `unsupported-keyword` (unrecognized token).
 *
 * @param value - The candidate keyword string.
 * @returns Whether the value is a member of HERO_KEYWORDS.
 */
function isValidHeroKeyword(value: string): value is HeroKeyword {
  for (const keyword of HERO_KEYWORDS) {
    if (keyword === value) {
      return true;
    }
  }
  return false;
}

/**
 * Records a HollowEffectRecord for a hero hook iff the whole hook is hollow.
 *
 * Per-hook rule (D-24033): a hook flags hollow when (1) it declared ≥1 effect
 * (a legacy effect, a composition primitive, or an unresolved marker), AND
 * (2) NO declared effect reached a handler (no `applied`/`handler-noop`/
 * `condition-failed`/`deferred` outcome), AND (3) ≥1 declared effect resolved to
 * a hollow reason. A mixed hook with even one reachable effect never flags.
 *
 * Conditions are evaluated by the caller; this runs only for a conditions-passed
 * hook, so a failed-condition hook is already excluded (it `continue`d, a
 * `condition-failed` reachable outcome). primitiveEffects always reach the
 * interpreter (a recognized composition), so they count as reachable.
 *
 * @param G - Game state (mutated under Immer draft only via recordHollowEffect).
 * @param ctx - The boardgame.io context (read for the turn number only).
 * @param cardId - The played hero card's CardExtId.
 * @param hook - The hero ability hook that just ran.
 */
function detectHollowHeroHook(
  G: LegendaryGameState,
  ctx: unknown,
  cardId: CardExtId,
  hook: HeroAbilityHook,
): void {
  const effects = hook.effects ?? [];
  const primitiveEffects = hook.primitiveEffects ?? [];
  const unresolvedMarkers = hook.unresolvedMarkers ?? [];

  // why: "declared ≥1 effect" — a hook with no legacy effect, no composition, and
  // no unresolved marker declares nothing executable (e.g. a keyword-only or
  // empty hook), so it can never be hollow.
  if (effects.length === 0 && primitiveEffects.length === 0 && unresolvedMarkers.length === 0) {
    return;
  }

  // why: a composition primitive always reaches the interpreter (a recognized
  // open-mechanic handler), so its presence makes the hook reachable — it is
  // never hollow. Short-circuit before classifying the legacy effects.
  if (primitiveEffects.length > 0) {
    return;
  }

  let hasReachable = false;
  let firstHollow: { reason: EffectExecutionReason; mechanic: string } | null = null;

  for (const effect of effects) {
    const reason = classifyHeroEffectReason(effect);
    if (!isHollowReason(reason)) {
      hasReachable = true;
    } else if (firstHollow === null) {
      firstHollow = { reason, mechanic: effect.type };
    }
  }

  // why: each unresolved marker is a `parse-unrecognized` hollow reason (the
  // parser saw a marker token and resolved it to nothing). Flavor text leaves
  // unresolvedMarkers empty, so it never reaches here.
  for (const marker of unresolvedMarkers) {
    if (firstHollow === null) {
      firstHollow = { reason: 'parse-unrecognized', mechanic: marker };
    }
  }

  // why: per-hook rule — flag ONLY when no declared effect was reachable AND ≥1
  // was hollow. A mixed hook (≥1 reachable) is not hollow even if another effect
  // is unhandled.
  if (hasReachable || firstHollow === null) {
    return;
  }

  // why: the reason field is one of the three hollow reasons (isHollowReason
  // gated firstHollow). The cast narrows EffectExecutionReason to the
  // HollowEffectRecord.reason subset for the record contract.
  recordHollowEffect(G, {
    cardId,
    cardType: 'hero',
    timing: hook.timing,
    mechanic: firstHollow.mechanic,
    reason: firstHollow.reason as 'parse-unrecognized' | 'no-handler' | 'unsupported-keyword',
    turn: readTurnNumber(ctx),
  });
}

// ---------------------------------------------------------------------------
// Effect handlers + ImplementationMap (WP-251 / D-24022)
// ---------------------------------------------------------------------------

/**
 * A single hero effect handler — the per-keyword contract that was formerly one
 * `switch` arm. Mutates G for one effect; returns void. `ctx` is narrowed to
 * ShuffleProvider only where deck reshuffle is needed (the `draw` handler).
 */
type HeroEffectHandler = (
  G: LegendaryGameState,
  ctx: unknown,
  playerID: string,
  cardId: CardExtId,
  effect: HeroEffectDescriptor,
) => void;

function heroEffectDraw(
  G: LegendaryGameState,
  ctx: unknown,
  playerID: string,
  _cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  // why: ctx is narrowed to ShuffleProvider here because deck reshuffle
  // needs ctx.random.Shuffle. boardgame.io ctx satisfies ShuffleProvider
  // structurally — this is the established pattern from WP-005B/008B.
  drawFromPlayerDeck(G, playerID, effect.magnitude as number, ctx as ShuffleProvider);
}

function heroEffectAttack(
  G: LegendaryGameState,
  _ctx: unknown,
  _playerID: string,
  _cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  G.turnEconomy = addResources(G.turnEconomy, effect.magnitude as number, 0);
}

function heroEffectRecruit(
  G: LegendaryGameState,
  _ctx: unknown,
  _playerID: string,
  _cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  G.turnEconomy = addResources(G.turnEconomy, 0, effect.magnitude as number);
}

function heroEffectKo(
  G: LegendaryGameState,
  _ctx: unknown,
  playerID: string,
  cardId: CardExtId,
  _effect: HeroEffectDescriptor,
): void {
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
}

function heroEffectRescue(
  G: LegendaryGameState,
  _ctx: unknown,
  playerID: string,
  _cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  const rescueMagnitude = effect.magnitude ?? 1;
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return;
  }
  if (G.piles.bystanders.length === 0) {
    // why: D-24017 — an empty Bystander supply is a legitimate no-op, but a
    // silent skip reads as "the hero card did nothing" (player confusion,
    // per the live diagnostic). Log it so the reason is observable in the
    // game log (UIState.log), mirroring how fight rescues are logged.
    G.messages.push(
      `Player ${playerID} could not rescue a Bystander via a hero ability — the Bystander supply is empty.`,
    );
    return;
  }
  const rescueCount = Math.min(rescueMagnitude, G.piles.bystanders.length);
  let rescuedCount = 0;
  for (let rescued = 0; rescued < rescueCount; rescued++) {
    // why: top-of-pile convention — pile[0] is the first available bystander (D-21501)
    const topBystander = G.piles.bystanders[0];
    if (!topBystander) {
      break;
    }
    const moveResult = moveCardFromZone(G.piles.bystanders, playerZones.victory, topBystander);
    G.piles.bystanders = moveResult.from;
    playerZones.victory = moveResult.to;
    rescuedCount++;
  }
  // why: D-24017 — surface the hero-ability rescue in the game log the same
  // way fight rescues are (fightVillain/fightMastermind), so a successful
  // rescue is observable to the player rather than a silent zone move.
  G.messages.push(
    `Player ${playerID} rescued ${rescuedCount} bystander(s) via a hero ability.`,
  );
}

// ---------------------------------------------------------------------------
// Parameterized reveal handler + per-action helpers (WP-253 / D-24024)
//
// The 8 legacy reveal-* handlers collapsed into ONE 'reveal' handler that peeks
// the deck top (× revealCount, =1 today) and evaluates an ordered RevealRule
// branch-list. The per-action helpers hold the verbatim zone-mutation bodies the
// legacy handlers used; revealRulesForLegacyKeyword (rules/revealRule.ts) maps the
// 8 card markers onto these rules, so behavior is byte-identical.
// ---------------------------------------------------------------------------

function heroEffectReveal(
  G: LegendaryGameState,
  _ctx: unknown,
  playerID: string,
  _cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  const playerZones = G.playerZones[playerID];
  if (!playerZones) {
    return;
  }
  const rules = effect.revealRules ?? [];
  // why: reveal-attack-choose's reject-second guard (D-22001) aborts the WHOLE
  // effect — no peek, no attack, no second park — when a choice is already pending.
  // Only the choose action parks a choice, so the guard is hoisted above the peek
  // loop; other reveal rules never read pendingHeroChoice. (D-24024)
  if (revealRulesContainAnyAction(rules, ['choose-discard-or-return']) && G.pendingHeroChoice !== undefined) {
    return;
  }
  // why: reveal-cost-attack / reveal-attack-choose / reveal-ko-attack all guarded
  // G.turnEconomy BEFORE any mutation (including reveal-ko-attack's KO). Reproduce
  // that: when the rules grant attack and turnEconomy is undefined the whole effect
  // no-ops, never partially KOing first. (D-24024 / D-22003 AC-9 / D-22301)
  if (revealRulesContainAnyAction(rules, ['attack-by-cost', 'attack-fixed']) && !G.turnEconomy) {
    return;
  }
  const revealCount = effect.revealCount ?? 1;
  // why (D-24024 → D-24027): this is the multi-peek WP-253 deferred. peekOffset indexes
  // the live deck; peekIndex counts iterations. DUAL BOUND — iterate at most revealCount
  // times (peekIndex) AND stop at the deck end (peekOffset >= deck.length); an offset-only
  // loop would reveal the WHOLE deck. count=1 is BYTE-IDENTICAL to the WP-253 deck[0] peek:
  // a single iteration runs at offset 0, and the skip-and-advance + the deck-end stop both
  // reduce to the WP-253 no-op `return`.
  let peekOffset = 0;
  for (let peekIndex = 0; peekIndex < revealCount; peekIndex++) {
    // why: re-read the live deck each iteration (do NOT snapshot) — a prior draw/ko shifts
    // the deck. The offset overrunning the deck end is the ONLY whole-loop exit; an empty
    // deck / exhausted window is a silent no-op (no reshuffle, D-21502).
    if (peekOffset >= playerZones.deck.length) {
      return;
    }
    const topCardId = playerZones.deck[peekOffset];
    // why: a peek with no card id OR no cardStats entry (a S.H.I.E.L.D. starter has no
    // G.cardStats entry, D-21502) SKIPS-AND-ADVANCES — leave the card on the deck and peek
    // the next — it MUST NOT `return`/abort the rest of the reveal (copilot #22). At count=1
    // this is observably the same no-op as the WP-253 `return`; at count>1 it stops one
    // starter in the top N from silently killing the reveal of the cards beneath it (the
    // exact "the card did nothing" failure D-24017 exists to stamp out). A cost-0 starter in
    // the window is therefore revealed-but-not-drawn (no stats to evaluate its cost) — the
    // accepted MVP limitation; aborting would be far worse.
    if (!topCardId) {
      peekOffset++;
      continue;
    }
    const cardStats = G.cardStats[topCardId];
    if (cardStats === undefined) {
      peekOffset++;
      continue;
    }
    const deckLengthBeforeRules = playerZones.deck.length;
    applyRevealRules(G, playerID, playerZones, topCardId, cardStats.cost, rules);
    // why: advance the offset ONLY when the deck length is unchanged (the card stayed on the
    // deck). A draw/ko shrank the deck and slid the next card into the same index, so the
    // offset must NOT advance — this is what keeps the WP-253 count=2 test (each iteration
    // re-reads deck[0] after a draw) byte-identical.
    if (playerZones.deck.length === deckLengthBeforeRules) {
      peekOffset++;
    }
  }
}

/**
 * Evaluates a reveal branch-list against one peeked card's cost. Applies the first
 * matching rule's actions and stops, unless the matched rule sets `continue: true`,
 * in which case it keeps evaluating later rules.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerID - Active player ID.
 * @param playerZones - The active player's zones (resolved once by the handler).
 * @param topCardId - The peeked deck-top card's CardExtId.
 * @param cost - The peeked card's cost (the predicate input).
 * @param rules - The ordered RevealRule branch-list.
 */
function applyRevealRules(
  G: LegendaryGameState,
  playerID: string,
  playerZones: PlayerZones,
  topCardId: CardExtId,
  cost: number,
  rules: RevealRule[],
): void {
  for (const rule of rules) {
    if (!revealPredicateMatches(G, rule.predicate, cost)) {
      continue;
    }
    applyRevealRuleActions(G, playerID, playerZones, topCardId, cost, rule.actions);
    // why: first-match-wins unless the rule opts into `continue` — the
    // reveal-attack-choose attack rule sets continue so the always→choose rule still
    // parks the choice after the attack. (D-24024)
    if (rule.continue !== true) {
      return;
    }
  }
}

/**
 * Returns whether the peeked card's cost satisfies a reveal predicate.
 *
 * @param G - Game state (for logging an unknown/malformed predicate; never throws).
 * @param predicate - The RevealPredicate to test.
 * @param cost - The peeked card's cost.
 * @returns Whether the predicate matches.
 */
function revealPredicateMatches(
  G: LegendaryGameState,
  predicate: RevealPredicate,
  cost: number,
): boolean {
  if (predicate.kind === 'always') {
    return true;
  }
  if (predicate.kind === 'cost-zero') {
    return cost === 0;
  }
  if (predicate.kind === 'cost-odd') {
    return cost % 2 !== 0;
  }
  if (predicate.kind === 'cost-lte') {
    // why: a threshold of 0 is legitimate (reveal M=0 → cost-lte 0), so test for
    // undefined explicitly rather than a falsy `?? default`.
    if (predicate.threshold === undefined) {
      G.messages.push('A reveal rule used a cost-lte predicate with no threshold and was skipped. Check the reveal rule markup.');
      return false;
    }
    return cost <= predicate.threshold;
  }
  if (predicate.kind === 'cost-gte') {
    if (predicate.threshold === undefined) {
      G.messages.push('A reveal rule used a cost-gte predicate with no threshold and was skipped. Check the reveal rule markup.');
      return false;
    }
    return cost >= predicate.threshold;
  }
  // why: unknown predicate kind → warn to G.messages and do not match, never throw
  // (the rule-execution-pipeline unknown-effect posture). (D-24024)
  G.messages.push(`A reveal rule used an unknown predicate kind "${String(predicate.kind)}" and was skipped. Check the reveal rule markup.`);
  return false;
}

/**
 * Applies a matched rule's actions in order. Stops the rule early when a
 * deck-mutating action (draw / ko) reports it did not apply, so a follow-on action
 * (reveal-ko-attack's fixed attack) fires only after the KO succeeded.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerID - Active player ID.
 * @param playerZones - The active player's zones.
 * @param topCardId - The peeked deck-top card's CardExtId.
 * @param cost - The peeked card's cost (for attack-by-cost).
 * @param actions - The matched rule's actions, applied in order.
 */
function applyRevealRuleActions(
  G: LegendaryGameState,
  playerID: string,
  playerZones: PlayerZones,
  topCardId: CardExtId,
  cost: number,
  actions: RevealAction[],
): void {
  for (const action of actions) {
    const applied = applyRevealAction(G, playerID, playerZones, topCardId, cost, action);
    // why: only a deck-mutating action (ko / draw) gates the rest of the rule —
    // reveal-ko-attack's [ko, attack-fixed] grants the fixed attack ONLY after the
    // KO move returned found (no partial mutation). A non-mutating action that
    // no-ops (e.g. attack with no turnEconomy) does NOT abort the rule. (D-24024 / D-22301)
    if (!applied && isDeckMutatingRevealAction(action.kind)) {
      return;
    }
  }
}

/**
 * Dispatches one reveal action to its helper. Returns whether the action applied
 * its intended mutation (true for non-deck actions that succeeded; false when a
 * helper's guard fired). Unknown action kinds warn and return true (not a
 * deck-mutation failure, so they do not break the rule).
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerID - Active player ID.
 * @param playerZones - The active player's zones.
 * @param topCardId - The peeked deck-top card's CardExtId.
 * @param cost - The peeked card's cost (for attack-by-cost).
 * @param action - The RevealAction to apply.
 * @returns Whether the action applied.
 */
function applyRevealAction(
  G: LegendaryGameState,
  playerID: string,
  playerZones: PlayerZones,
  topCardId: CardExtId,
  cost: number,
  action: RevealAction,
): boolean {
  if (action.kind === 'draw') {
    return applyRevealDraw(playerZones, topCardId);
  }
  if (action.kind === 'ko') {
    return applyRevealKo(G, playerZones, topCardId);
  }
  if (action.kind === 'attack-by-cost') {
    return applyRevealAttackByCost(G, cost);
  }
  if (action.kind === 'attack-fixed') {
    return applyRevealAttackFixed(G, action.amount);
  }
  if (action.kind === 'choose-discard-or-return') {
    return applyRevealChoose(G, playerID, topCardId);
  }
  // why: unknown action kind → warn to G.messages and skip, never throw. Treated as
  // a no-op that is NOT a deck-mutation failure, so it does not break the rule. (D-24024)
  G.messages.push(`A reveal rule used an unknown action kind "${String(action.kind)}" and was skipped. Check the reveal rule markup.`);
  return true;
}

/**
 * Returns whether a reveal action mutates the deck (draw / ko). Only these gate the
 * rest of a rule's action list when they fail to apply.
 *
 * @param kind - The reveal action kind.
 * @returns Whether the action is deck-mutating.
 */
function isDeckMutatingRevealAction(kind: RevealActionKind): boolean {
  return kind === 'draw' || kind === 'ko';
}

/**
 * Returns whether any rule's action list contains one of the given action kinds.
 * Used to hoist the reject-second (choose) and turnEconomy (attack) guards above
 * the peek loop, reproducing the legacy handlers' whole-effect guard ordering.
 *
 * @param rules - The reveal branch-list.
 * @param kinds - The action kinds to look for.
 * @returns Whether any action in any rule matches one of the kinds.
 */
function revealRulesContainAnyAction(rules: RevealRule[], kinds: RevealActionKind[]): boolean {
  for (const rule of rules) {
    for (const action of rule.actions) {
      for (const kind of kinds) {
        if (action.kind === kind) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Draw action — moves the peeked deck-top card into the player's hand. Verbatim
 * from the legacy reveal / reveal-min / reveal-odd-draw draw bodies.
 *
 * @param playerZones - The active player's zones.
 * @param topCardId - The peeked deck-top card's CardExtId.
 * @returns Whether the card was found and moved (false leaves zones unchanged).
 */
function applyRevealDraw(playerZones: PlayerZones, topCardId: CardExtId): boolean {
  const moveResult = moveCardFromZone(playerZones.deck, playerZones.hand, topCardId);
  if (!moveResult.found) {
    return false;
  }
  playerZones.deck = moveResult.from;
  playerZones.hand = moveResult.to;
  return true;
}

/**
 * KO action — removes the peeked deck-top card from the deck and adds it to the KO
 * pile. Verbatim from the legacy reveal-ko / reveal-ko-or-draw / reveal-ko-attack
 * KO bodies (card removed from deck before being added to KO — D-21801 zone integrity).
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerZones - The active player's zones.
 * @param topCardId - The peeked deck-top card's CardExtId.
 * @returns Whether the card was found and KO'd (false leaves zones unchanged).
 */
function applyRevealKo(G: LegendaryGameState, playerZones: PlayerZones, topCardId: CardExtId): boolean {
  const moveResult = moveCardFromZone(playerZones.deck, [], topCardId);
  if (!moveResult.found) {
    return false;
  }
  playerZones.deck = moveResult.from;
  G.ko = koCard(G.ko, topCardId);
  return true;
}

/**
 * Attack-by-cost action — grants attack equal to the peeked card's cost; no zone
 * mutation (the card stays on the deck). Verbatim from reveal-cost-attack /
 * reveal-attack-choose; keeps the turnEconomy guard (D-21901 / D-22003).
 *
 * @param G - Game state (mutated under Immer draft).
 * @param cost - The peeked card's cost.
 * @returns Whether the grant applied (false when turnEconomy is undefined).
 */
function applyRevealAttackByCost(G: LegendaryGameState, cost: number): boolean {
  if (!G.turnEconomy) {
    return false;
  }
  G.turnEconomy.attack += cost;
  return true;
}

/**
 * Attack-fixed action — grants a fixed attack amount (the reveal-ko-attack
 * magnitude). Verbatim from reveal-ko-attack's `G.turnEconomy.attack += magnitude`.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param amount - The fixed attack grant.
 * @returns Whether the grant applied (false when turnEconomy is undefined or amount
 *   is missing).
 */
function applyRevealAttackFixed(G: LegendaryGameState, amount: number | undefined): boolean {
  if (!G.turnEconomy) {
    return false;
  }
  if (amount === undefined) {
    return false;
  }
  G.turnEconomy.attack += amount;
  return true;
}

/**
 * Choose-discard-or-return action — parks the existing PendingHeroChoice the player
 * resolves via resolveHeroChoice. Verbatim from reveal-attack-choose: the
 * turnEconomy guard fires BEFORE the park (an undefined turnEconomy means NO park);
 * the reject-second (a choice already pending) is hoisted to the handler top, so a
 * pending choice aborts the whole effect. (D-22001 / D-22003)
 *
 * @param G - Game state (mutated under Immer draft).
 * @param playerID - Active player ID.
 * @param topCardId - The peeked deck-top card's CardExtId.
 * @returns Whether the choice was parked (false when turnEconomy is undefined).
 */
function applyRevealChoose(G: LegendaryGameState, playerID: string, topCardId: CardExtId): boolean {
  if (!G.turnEconomy) {
    return false;
  }
  const pendingChoice: PendingHeroChoice = {
    choiceType: 'discard-or-return',
    cardId: topCardId,
    playerID,
  };
  G.pendingHeroChoice = pendingChoice;
  return true;
}

function heroEffectAttackPerCount(
  G: LegendaryGameState,
  _ctx: unknown,
  playerID: string,
  _cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  // why: D-24016 — magnitude is the per-unit rate; resolveCountSource resolves
  // the count it scales by, so the grant is magnitude × count. The resolver is
  // pure/total (unknown source → 0), so the grant is deterministic at play time.
  const playerZones = G.playerZones[playerID];
  if (!playerZones) { return; }
  if (!G.turnEconomy) { return; }
  // why: a count-scaled attack effect with no count source is a skipped no-op
  // (mirrors the magnitude gate) — there is nothing to scale by.
  if (effect.countSource === undefined) { return; }
  const count = resolveCountSource(G, playerID, effect.countSource);
  const grant = (effect.magnitude as number) * count;
  G.turnEconomy = addResources(G.turnEconomy, grant, 0);
  // why: record the source, count, and grant so the count-scaled attack is
  // observable in replay inspection (no implicit side effects).
  G.messages.push(`Count-scaled attack: +${grant} (${effect.magnitude as number} per ${effect.countSource}, count ${count}).`);
}

function heroEffectOptionalKoReward(
  G: LegendaryGameState,
  _ctx: unknown,
  playerID: string,
  cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  // why: D-24019 — parks an interactive choice (mirrors WP-242); the reward
  // is granted on resolve (resolveOptionalKoReward), not at play time. The
  // player either declines (no KO, no reward) or KOs exactly one card from
  // their hand or discard pile, in which case the reward fires.
  const playerZones = G.playerZones[playerID];
  if (!playerZones) { return; }
  // why: eligible = discard ∪ hand, ANY card INCLUDING wounds (the printed
  // text is "a card", not "a Hero") — no type/cost/keyword filtering. 0
  // eligible (both zones empty) → skipped no-op + a G.messages line (mirrors
  // the D-24017 empty-supply rescue logging), so the player can see why the
  // ability did nothing.
  const eligibleCount = playerZones.discard.length + playerZones.hand.length;
  if (eligibleCount === 0) {
    G.messages.push(
      `Player ${playerID} could not KO a card for a hero ability — both hand and discard pile are empty, so no reward was granted.`,
    );
    return;
  }
  // why: defensive — the parser only emits a seeded rewardType, but an
  // unseeded reward here is a logged no-op that never reaches the queue
  // (no reward executor exists for it).
  const rewardType = effect.rewardType;
  if (rewardType === undefined || !OPTIONAL_KO_REWARD_SEEDED_REWARDS.has(rewardType)) {
    G.messages.push(
      `Player ${playerID} played a hero ability whose optional-KO reward is not yet supported, so the choice was skipped.`,
    );
    return;
  }
  // why: lazy-init at the park site (mirrors villainEffects.execute.ts:190
  // pendingKoHeroChoices) — NEVER in Game.setup; the optional field tolerates
  // older snapshots. The park itself is SILENT (no G.messages line), mirroring
  // the WP-242 park; the reward grant is logged by the dispatched executor.
  if (!G.pendingOptionalKoRewards) { G.pendingOptionalKoRewards = []; }
  G.pendingOptionalKoRewards.push({
    playerID,
    rewardType,
    rewardMagnitude: effect.magnitude ?? 1,
    sourceCardId: cardId,
  });
}

// why: D-24022 — the hero-effect ImplementationMap (mirrors WP-009B's pattern).
// Handlers are plain functions held OUTSIDE G; a new effect is a registry entry
// + a drift-test entry, not a `switch` edit. Keyed by HeroKeyword and `Partial`
// because 'wound'/'conditional' are intentionally unmapped (the deferred set);
// the union therefore stays typed + drift-detected. Exported so the registry
// drift test can assert its keys == HANDLED_KEYWORDS bidirectionally.
// why: WP-253 / D-24024 — the 7 legacy reveal-* entries are gone; ALL 8 reveal
// keywords now dispatch through the single parameterized `reveal` handler (their
// markers are translated to a `reveal` descriptor with revealRules at parse time).
export const HERO_EFFECT_HANDLERS: Partial<Record<HeroKeyword, HeroEffectHandler>> = {
  draw: heroEffectDraw,
  attack: heroEffectAttack,
  recruit: heroEffectRecruit,
  ko: heroEffectKo,
  rescue: heroEffectRescue,
  reveal: heroEffectReveal,
  'attack-per-count': heroEffectAttackPerCount,
  'optional-ko-reward': heroEffectOptionalKoReward,
};

// ---------------------------------------------------------------------------
// Single effect dispatch
// ---------------------------------------------------------------------------

/**
 * Executes a single hero effect descriptor.
 *
 * Validates magnitude, checks keyword support, then dispatches to the
 * registered handler in HERO_EFFECT_HANDLERS. Returns without mutation for
 * unsupported keywords or invalid magnitudes.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param ctx - Context (narrowed to ShuffleProvider for draw).
 * @param playerID - Active player ID.
 * @param cardId - The played hero card's CardExtId.
 * @param effect - The effect descriptor to execute.
 */
// why: D-24019 — exported so resolveOptionalKoReward can dispatch the reward to
// the existing executor (rescue / draw / attack / recruit) instead of
// re-implementing it. The KO-then-reward path passes a synthesized
// { type: rewardType, magnitude: rewardMagnitude } descriptor.
export function executeSingleEffect(
  G: LegendaryGameState,
  ctx: unknown,
  playerID: string,
  cardId: CardExtId,
  effect: HeroEffectDescriptor,
): void {
  const keyword = effect.type;

  // why: unsupported keywords are safely ignored in MVP. Only the keywords in
  // MVP_KEYWORDS execute; 'wound' and 'conditional' are deferred.
  if (!MVP_KEYWORDS.has(keyword)) {
    return;
  }

  // why: 'ko' and NO_MAGNITUDE_KEYWORDS members ('rescue', 'reveal') bypass the
  // pre-check magnitude gate — 'ko' targets the played card (no magnitude), 'rescue'
  // defaults its magnitude to 1, and 'reveal' moves ALL its magnitude gating into the
  // translation (revealRulesForLegacyKeyword) + the per-rule predicates, so the
  // no-magnitude and M=0-valid reveals still fire (D-24024 / pre-flight PS-1). Every
  // other MVP keyword requires a valid magnitude here.
  if (keyword !== 'ko' && !NO_MAGNITUDE_KEYWORDS.has(keyword)) {
    if (!isValidMagnitude(effect.magnitude)) {
      return;
    }
  }

  // why: data-driven dispatch (WP-251 / D-24022). An undefined handler reproduces
  // the former `default` arm exactly — a silent skip with no throw. Because the
  // pre-gate above already filters to MVP_KEYWORDS and the drift test pins the
  // registry keys == MVP_KEYWORDS, this branch is unreachable in practice.
  const handler = HERO_EFFECT_HANDLERS[keyword];
  if (handler === undefined) {
    return;
  }
  handler(G, ctx, playerID, cardId, effect);
}

// ---------------------------------------------------------------------------
// Deterministic bot/sim default for an optional-KO-reward choice (WP-248)
// ---------------------------------------------------------------------------

/**
 * A single optional-KO-reward default target: the zone and the card ext_id.
 *
 * Unlike WP-242's KoHeroTarget, the zone union is only discard | hand — the
 * optional-ko-reward effect KOs from hand or discard, never inPlay.
 */
export interface OptionalKoTarget {
  zone: 'discard' | 'hand';
  cardId: CardExtId;
}

/**
 * Selects the card the deterministic bot/sim KOs when an optional-KO-reward
 * choice is pending.
 *
 * Tie-break ORDER (D-24019, locked — its OWN policy, NOT a reuse of WP-242's
 * selectDefaultKoTarget; it does not exclude wounds and does not prefer
 * S.H.I.E.L.D. cards): (1) lowest cost; then (2) discard-zone before hand-zone;
 * then (3) lowest array index within the chosen zone. ANY card is eligible
 * (the printed text says "a card", not "a Hero").
 *
 * The bot ALWAYS returns a target and NEVER declines — decline is a human-only
 * option. Returns null only when both zones are empty (an engine-invariant
 * violation while a choice is pending, since the park requires ≥1 eligible
 * card and the block-all guard freezes the board).
 *
 * @param zones - The player's card zones (only discard + hand are scanned).
 * @param cardStats - Card stat lookup for the cost tie-break (?.cost ?? 0).
 * @returns The default KO target, or null when both zones are empty.
 */
export function selectDefaultOptionalKoTarget(
  zones: PlayerZones,
  cardStats: Record<CardExtId, CardStatEntry>,
): OptionalKoTarget | null {
  // why: iterate discard fully (index ascending) then hand (index ascending),
  // replacing the candidate ONLY on a STRICTLY lower cost. Because the scan
  // order is discard-before-hand and lowest-index-first, the retained candidate
  // for the minimum cost is automatically the discard-before-hand, lowest-index
  // one — exactly the locked tie-break, without an explicit rank comparison.
  let bestZone: 'discard' | 'hand' | null = null;
  let bestCardId: CardExtId | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const orderedZones: ('discard' | 'hand')[] = ['discard', 'hand'];
  for (const zoneName of orderedZones) {
    const zoneArray = zones[zoneName];
    for (let cardIndex = 0; cardIndex < zoneArray.length; cardIndex++) {
      const cardId = zoneArray[cardIndex]!;
      const cost = cardStats[cardId]?.cost ?? 0;
      if (cost < bestCost) {
        bestCost = cost;
        bestZone = zoneName;
        bestCardId = cardId;
      }
    }
  }
  if (bestZone === null || bestCardId === null) {
    return null;
  }
  return { zone: bestZone, cardId: bestCardId };
}
