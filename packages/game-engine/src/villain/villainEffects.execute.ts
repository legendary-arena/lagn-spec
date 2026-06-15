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
import type { CardExtId, PlayerZones } from '../state/zones.types.js';
import type {
  VillainAbilityTiming,
  VillainEffectKeyword,
  VillainEffectDescriptor,
  VillainEffectPrimitive,
} from '../rules/villainAbility.types.js';
import { getVillainHooksForCard, descriptorToLegacyKeyword } from '../rules/villainAbility.types.js';
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

/**
 * A single KO-a-Hero target: which zone the card sits in and its ext_id.
 *
 * Used by the interactive KO flow (WP-242) — the eligible-target builder, the
 * bot default-pick, and the auto-1 / single-target mutator all speak this
 * shape. The zone union matches resolveKoHeroChoice's payload (D-24006).
 */
export interface KoHeroTarget {
  zone: 'discard' | 'hand' | 'inPlay';
  cardId: CardExtId;
}

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
    for (const descriptor of hook.effects) {
      const applied = applyVillainEffect(G, currentPlayer, cardId, timing, descriptor);
      if (applied) {
        // why: D-24023 — the applied-effects accumulator stays
        // VillainEffectKeyword[] (reverse-mapped from the dispatched descriptor)
        // so notableEvents, EFFECT_KEYWORD_LABELS, the replay state-hash, and the
        // arena-client projection are byte-identical. Every dispatched descriptor
        // came from a legacy marker, so the reverse-map always resolves; an
        // unresolvable descriptor (none in this WP) is simply not recorded.
        const legacyKeyword = descriptorToLegacyKeyword(descriptor);
        if (legacyKeyword !== undefined) {
          appliedEffects.push(legacyKeyword);
        }
      }
    }
  }

  return appliedEffects;
}

// ---------------------------------------------------------------------------
// Single effect dispatch
// ---------------------------------------------------------------------------

/**
 * Handler signature for one villain effect primitive (WP-252 / D-24023).
 *
 * Mirrors the WP-251 HeroEffectHandler shape. Handlers mutate G directly and
 * return void; the dispatcher decides "applied" by primitive presence.
 */
type VillainEffectHandler = (
  G: LegendaryGameState,
  currentPlayer: string,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
  descriptor: VillainEffectDescriptor,
) => void;

/**
 * gain-wound primitive — every player or the current player gains 1 wound.
 *
 * `target: 'each'` is verbatim from the former gainWoundEachPlayer case;
 * `target: 'current'` is verbatim from gainWoundCurrentPlayer (WP-185 / WP-200).
 * Only the dispatch shape changed (WP-252).
 */
function villainEffectGainWound(
  G: LegendaryGameState,
  currentPlayer: string,
  _cardId: CardExtId,
  _timing: VillainAbilityTiming,
  descriptor: VillainEffectDescriptor,
): void {
  if (descriptor.target === 'each') {
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
    return;
  }
  // why: target === 'current'. WP-200 — mutation-guarded short-circuit still
  // counts as "applied" per the post-safe-skip contract (the dispatcher records
  // applied by primitive presence, not by mutation). The empty-pile /
  // missing-zone guards short-circuit body work, not the dispatch.
  const zones = G.playerZones[currentPlayer];
  if (!zones) return;
  if (G.piles.wounds.length === 0) return;
  const result = gainWound(G.piles.wounds, zones.discard);
  G.piles.wounds = result.woundsPile;
  zones.discard = result.playerDiscard;
  G.turnEconomy.woundsDrawn += 1;
}

/**
 * ko-hero primitive — KO a hero for the current player (interactive) or for
 * every player (auto-resolved, magnitude-many).
 *
 * `target: 'current'` is verbatim from the former koHeroCurrentPlayer case (the
 * WP-242 interactive park). `target: 'each'` is the koHeroEachPlayer (magnitude
 * 1) and koHeroEachPlayerMag2 (magnitude 2) cases generalized to
 * descriptor.magnitude (WP-252 / D-24023).
 */
function villainEffectKoHero(
  G: LegendaryGameState,
  currentPlayer: string,
  _cardId: CardExtId,
  _timing: VillainAbilityTiming,
  descriptor: VillainEffectDescriptor,
): void {
  if (descriptor.target === 'current') {
    // why: interactive KO for the current player (supersedes the WP-185
    // auto-resolution deferral, D-24006). 0 eligible → no-op; exactly 1 →
    // auto-KO (no decision to make, D-24007 decision C); ≥2 → append a
    // pending choice and KO nothing yet (the player picks via
    // resolveKoHeroChoice, D-24007).
    const zones = G.playerZones[currentPlayer];
    if (!zones) return;
    const eligible = buildKoEligibleTargets(zones);
    if (eligible.length === 0) return;
    if (eligible.length === 1) {
      koSingleTarget(G, zones, eligible[0]!);
      return;
    }
    if (!G.pendingKoHeroChoices) G.pendingKoHeroChoices = [];
    G.pendingKoHeroChoices.push({ choiceType: 'ko-hero', playerID: currentPlayer });
    return;
  }
  // why: target === 'each'. Iteration order is Object.keys(G.playerZones).sort()
  // — default JavaScript string compare → lexical ascending (D-18902), NOT
  // insertion order and NOT a numeric sort. The shared per-player resolver owns
  // target selection AND the koCard mutation; this caller MUST NOT post-process
  // or modify the resolver's output (D-18902 mutation-location lock).
  // descriptor.magnitude drives the per-player repetition: 1 == the former
  // koHeroEachPlayer, 2 == koHeroEachPlayerMag2. The literal-2 inner loop is now
  // a descriptor param (D-24023 retiring D-20201's closed-union-per-magnitude);
  // a future Mag3 is data-only (magnitude: 3), no code change. Per-iteration
  // semantics inherit D-18503 (discard→hand→inPlay, starter-first tie-break,
  // silent no-op for zero eligible). Magnitude-N ≡ magnitude-1 N times — pinned
  // by the shared-resolver parity test on a single-player G.
  const repetitions = descriptor.magnitude ?? 1;
  const playerIds = Object.keys(G.playerZones).sort();
  for (const playerId of playerIds) {
    for (let iteration = 0; iteration < repetitions; iteration++) {
      koOneHeroForPlayer(G, playerId);
    }
  }
}

/**
 * capture-hq-hero primitive — capture one HQ hero by the descriptor's selector.
 *
 * Verbatim from the former captureHqHeroRightmost / captureHqHeroHighestCost /
 * captureHqHeroLowestCost cases. The hyphenated descriptor selector maps to
 * captureHeroFromHq's camelCase selector union.
 */
function villainEffectCaptureHqHero(
  G: LegendaryGameState,
  _currentPlayer: string,
  cardId: CardExtId,
  _timing: VillainAbilityTiming,
  descriptor: VillainEffectDescriptor,
): void {
  if (descriptor.selector === 'rightmost') {
    // why: captures the rightmost non-null hero from the HQ (index 4 → 0)
    captureHeroFromHq(G, cardId, 'rightmost');
    return;
  }
  if (descriptor.selector === 'highest-cost') {
    // why: captures the highest-cost hero from the HQ; ties resolved by
    // rightmost index per selector determinism contract (WP-214)
    captureHeroFromHq(G, cardId, 'highestCost');
    return;
  }
  if (descriptor.selector === 'lowest-cost') {
    // why: captures the lowest-cost hero from the HQ; ties resolved by
    // rightmost index per selector determinism contract (WP-214)
    captureHeroFromHq(G, cardId, 'lowestCost');
  }
}

/**
 * hero-deck-top-to-escape primitive — move the top hero-deck card to escaped.
 *
 * Verbatim from the former heroDeckTopToEscape case (WP-185).
 */
function villainEffectHeroDeckTopToEscape(
  G: LegendaryGameState,
  _currentPlayer: string,
  _cardId: CardExtId,
  _timing: VillainAbilityTiming,
  _descriptor: VillainEffectDescriptor,
): void {
  // why: WP-185 §Scope wrote "G.piles.heroDeck[0]" but the engine's hero
  // reservoir is the top-level G.heroDeck (GlobalPiles has no heroDeck); this
  // moves the top of that reservoir to the escaped pile. Silent no-op when the
  // reservoir is empty.
  if (G.heroDeck.length === 0) return;
  const topCard = G.heroDeck[0]!;
  G.heroDeck = G.heroDeck.slice(1);
  G.escapedPile = [...G.escapedPile, topCard];
}

/**
 * capture-bystander primitive — attach a bystander to the triggering card,
 * awarding immediately on the Fight fire site.
 *
 * Verbatim from the former captureBystander case (WP-185 / D-18506).
 */
function villainEffectCaptureBystander(
  G: LegendaryGameState,
  currentPlayer: string,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
  _descriptor: VillainEffectDescriptor,
): void {
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
}

// why: D-24023 — the ImplementationMap keyed by primitive (mirrors WP-251's
// HERO_EFFECT_HANDLERS). Full Record over the 5 primitives; the drift test
// asserts the key set equals VILLAIN_EFFECT_PRIMITIVES. Replaces the former
// 10-arm switch on VillainEffectKeyword.
/** Villain effect handlers keyed by primitive. Single dispatch source. */
const VILLAIN_EFFECT_HANDLERS: Record<VillainEffectPrimitive, VillainEffectHandler> = {
  'ko-hero': villainEffectKoHero,
  'gain-wound': villainEffectGainWound,
  'capture-hq-hero': villainEffectCaptureHqHero,
  'hero-deck-top-to-escape': villainEffectHeroDeckTopToEscape,
  'capture-bystander': villainEffectCaptureBystander,
};

/**
 * Applies one villain effect descriptor deterministically by dispatching to its
 * primitive handler.
 *
 * @param G - Game state (mutated under Immer draft).
 * @param currentPlayer - The active player id.
 * @param cardId - The triggering villain/henchman card-instance ext_id.
 * @param timing - The timing that fired (changes capture-bystander behavior).
 * @param descriptor - The parameterized effect descriptor to apply.
 * @returns `true` when an in-vocab primitive handler ran (regardless of whether
 *   mutation guards short-circuited inside it); `false` only when no handler
 *   exists for the primitive (the former out-of-vocab default). WP-200 D-20003
 *   carries forward: drives the reverse-mapped `appliedEffects` array — only
 *   descriptors whose handler ran are recorded (post-safe-skip contract).
 */
function applyVillainEffect(
  G: LegendaryGameState,
  currentPlayer: string,
  cardId: CardExtId,
  timing: VillainAbilityTiming,
  descriptor: VillainEffectDescriptor,
): boolean {
  const handler = VILLAIN_EFFECT_HANDLERS[descriptor.primitive];
  if (handler === undefined) {
    // why: out-of-vocabulary primitives safe-skip silently — moves never throw,
    // no console output, no message push (matches the WP-022 hero-effects
    // precedent). Reachable only via a malformed hook; the parser validates
    // markers before building descriptors. Returning false excludes the
    // descriptor from the executor's appliedEffects[] (post-safe-skip contract).
    return false;
  }
  handler(G, currentPlayer, cardId, timing, descriptor);
  return true;
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

// ---------------------------------------------------------------------------
// Interactive KO-a-Hero helpers (WP-242)
// ---------------------------------------------------------------------------

/**
 * Builds the deduped eligible KO-a-Hero targets across a player's zones.
 *
 * Scans discard, then hand, then inPlay — each in array index order — emitting
 * one target per non-wound card. Deduped by `(zone, cardId)` keeping the first
 * occurrence: two copies of the same ext_id in the same zone collapse to one
 * option (KOing either is outcome-identical), but the same ext_id in two
 * different zones stays two options (a discard-KO and an inPlay-KO differ).
 *
 * Used by the parker (count), resolveKoHeroChoice has no need of it, and the
 * WP-243 projection. Fresh recompute every call — no snapshot (D-24007).
 *
 * @param zones - The player's card zones.
 * @returns The eligible KO targets in deterministic scan order.
 */
export function buildKoEligibleTargets(zones: PlayerZones): KoHeroTarget[] {
  // why: per-zone (zone, cardId) dedupe — the same ext_id can legitimately
  // appear twice within one zone (e.g., two starting-shield-agent in discard);
  // KOing any copy of that ext_id in that zone is outcome-identical, so one
  // option is shown per (zone, cardId) rather than N identical entries. Dedupe
  // is per-zone: the same ext_id in two zones stays two distinct options.
  const targets: KoHeroTarget[] = [];
  const seen = new Set<string>();
  const orderedZones: KoHeroTarget['zone'][] = ['discard', 'hand', 'inPlay'];
  for (const zoneName of orderedZones) {
    for (const cardId of zones[zoneName]) {
      // why: a wound is never a "hero" for KO purposes (D-18503 carries
      // forward); wounds are excluded even when sitting in an otherwise-valid zone.
      if (cardId === WOUND_EXT_ID) continue;
      const key = `${zoneName}:${cardId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ zone: zoneName, cardId });
    }
  }
  return targets;
}

/**
 * Selects the single default KO target the legacy auto-resolution would pick.
 *
 * Runs selectKoHeroTarget over discard, then hand, then inPlay, returning the
 * first non-null pick with its zone, or null when no zone has an eligible hero.
 *
 * This is the bot default pick AND the auto-1 pick, and it is the determinism
 * anchor (reuses the unchanged selectKoHeroTarget so the bot's KO target is
 * byte-identical to today's koOneHeroForPlayer resolution — D-24009).
 *
 * @param zones - The player's card zones.
 * @returns The default KO target, or null when no eligible hero exists.
 */
export function selectDefaultKoTarget(zones: PlayerZones): KoHeroTarget | null {
  // why: zone priority is discard → hand → inPlay (D-20603), identical to
  // koOneHeroForPlayer. selectKoHeroTarget owns the within-zone starter-first
  // tie-break (D-20602); reusing it verbatim keeps the bot KO target
  // byte-identical to the prior auto-resolution (D-24009 replay determinism).
  const discardTarget = selectKoHeroTarget(zones.discard);
  if (discardTarget !== null) {
    return { zone: 'discard', cardId: discardTarget };
  }
  const handTarget = selectKoHeroTarget(zones.hand);
  if (handTarget !== null) {
    return { zone: 'hand', cardId: handTarget };
  }
  const inPlayTarget = selectKoHeroTarget(zones.inPlay);
  if (inPlayTarget !== null) {
    return { zone: 'inPlay', cardId: inPlayTarget };
  }
  return null;
}

/**
 * KOs a single target card out of the named zone (the auto-1 mutation).
 *
 * The two-line mutation resolveKoHeroChoice also performs: moveCardFromZone the
 * cardId out of the zone, then koCard it on `found`. One copy here, one in the
 * move (§16.1 duplicate-twice — a third appearance would justify extracting it).
 *
 * @param G - Game state (mutated under Immer draft).
 * @param zones - The player's card zones (the source zone is shortened in place).
 * @param target - The { zone, cardId } to KO.
 */
function koSingleTarget(
  G: LegendaryGameState,
  zones: PlayerZones,
  target: KoHeroTarget,
): void {
  const moveResult = moveCardFromZone(zones[target.zone], [], target.cardId);
  if (moveResult.found) {
    zones[target.zone] = moveResult.from;
    G.ko = koCard(G.ko, target.cardId);
  }
}
