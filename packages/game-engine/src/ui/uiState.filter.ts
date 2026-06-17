/**
 * Audience-based filter for UIState projections.
 *
 * filterUIStateForAudience is a pure post-processing function that takes
 * the authoritative UIState (from buildUIState) and produces an
 * audience-appropriate view by redacting or replacing fields.
 *
 * One UIState, filtered views — no alternate game states.
 * Implements D-0302 (Single UIState, Multiple Audiences).
 *
 * No boardgame.io imports. No registry imports. No LegendaryGameState.
 * No .reduce(). No mutation of input. No I/O.
 *
 * WP-128 / EC-131 — extends the redaction matrix for the new per-player
 * fields. `inPlayCards` / `inPlayDisplay` redacted for `audience !==
 * ownPlayerId` and for `'spectator'` (D-12803). `discardTopCard` /
 * `victoryCards` / `victoryVP` are public and pass through every
 * audience (D-12803). Shared-board fields (mastermind / scheme / city /
 * decks / piles / koPile) are public and pass through unchanged with
 * per-entry shallow copies (WP-111 D-11105 aliasing-defense).
 */

import type {
  UIState,
  UIPlayerState,
  UITurnEconomyState,
  UICityCard,
  UIHQCard,
  UIDisplayEntry,
  UIKoPileState,
} from './uiState.types.js';
import type { UIAudience } from './uiAudience.types.js';
// why: WP-258 — the filtered hollow-effect records are the engine's canonical
// HollowEffectRecord (WP-257); the public pass-through copies them value-for-value.
import type { HollowEffectRecord } from '../diagnostics/hollowEffect.types.js';

// why: non-active players and spectators must not see the active player's
// remaining resources (attack/recruit/piercing/woundsDrawn). Zeroed
// economy prevents strategic information leakage while maintaining type
// stability. WP-128 extends the sentinel with the new `piercing` and
// `woundsDrawn` fields that follow the same active-player-only redaction.
const REDACTED_ECONOMY: UITurnEconomyState = {
  attack: 0,
  recruit: 0,
  availableAttack: 0,
  availableRecruit: 0,
  piercing: 0,
  woundsDrawn: 0,
};

/**
 * Builds a per-element shallow-copy of City spaces, including the
 * additive `display` payload, to prevent aliasing with the input
 * UIState. Public information — not redacted.
 */
// why: WP-214 — villainAttachedHeroes is public; per-entry spread copies
// prevent aliasing with the input UIState
function buildVillainAttachedHeroesFilterCopy(
  villainAttachedHeroes: Record<string, string[]> | undefined,
): Record<string, string[]> {
  if (!villainAttachedHeroes) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const villainId of Object.keys(villainAttachedHeroes)) {
    const heroes = villainAttachedHeroes[villainId];
    if (heroes !== undefined) {
      result[villainId] = [...heroes];
    }
  }
  return result;
}

// why: WP-111 — City display is public; shallow copies at every level
// prevent aliasing with the input UIState's card objects. Mirrors the
// WP-028 cardKeywords post-mortem aliasing-prevention precedent.
function deepCopyCitySpaces(
  spaces: (UICityCard | null)[],
): (UICityCard | null)[] {
  const result: (UICityCard | null)[] = [];
  for (const space of spaces) {
    if (space === null) {
      result.push(null);
    } else {
      result.push({
        extId: space.extId,
        type: space.type,
        keywords: [...space.keywords],
        display: { ...space.display },
        attachedHeroes: [...space.attachedHeroes],
        fightCost: space.fightCost,
      });
    }
  }
  return result;
}

/**
 * Builds a per-element shallow-copy of HQ slotDisplay entries to
 * prevent aliasing with the input UIState. Public information — not
 * redacted.
 */
// why: WP-111 — HQ slotDisplay is public; per-entry shallow copies at
// the filter boundary mirror the projection-time aliasing-prevention
// pattern (WP-028 cardKeywords post-mortem precedent).
function deepCopyHqSlotDisplay(
  slotDisplay: (UIHQCard | null)[],
): (UIHQCard | null)[] {
  const result: (UIHQCard | null)[] = [];
  for (const entry of slotDisplay) {
    if (entry === null) {
      result.push(null);
    } else {
      result.push({
        extId: entry.extId,
        display: { ...entry.display },
      });
    }
  }
  return result;
}

// why: WP-128 / D-12805 — per-entry shallow copy of UIDisplayEntry[] at
// the filter boundary. Mirrors deepCopyCitySpaces / deepCopyHqSlotDisplay
// pattern: every entry is a fresh `{ extId, display }` object with
// display itself shallow-cloned. Used by victoryCards / strikePile /
// twistPile / escapedPile / koPile.cards / attachedBystanders.
/**
 * Per-entry shallow copy of UIDisplayEntry[] for filter aliasing-defense.
 */
function deepCopyDisplayEntries(
  entries: UIDisplayEntry[],
): UIDisplayEntry[] {
  const result: UIDisplayEntry[] = [];
  for (const entry of entries) {
    result.push({ extId: entry.extId, display: { ...entry.display } });
  }
  return result;
}

// why: WP-128 / D-12804 — shallow-copy the koPile shape; topCard is
// either null or a freshly-cloned UIDisplayEntry; cards is per-entry
// cloned via deepCopyDisplayEntries.
/**
 * Builds a deep-copied UIKoPileState from the source.
 */
function deepCopyKoPile(koPile: UIKoPileState): UIKoPileState {
  let topCard: UIDisplayEntry | null;
  if (koPile.topCard === null) {
    topCard = null;
  } else {
    topCard = {
      extId: koPile.topCard.extId,
      display: { ...koPile.topCard.display },
    };
  }
  return {
    count: koPile.count,
    topCard,
    cards: deepCopyDisplayEntries(koPile.cards),
  };
}

/**
 * Builds a redacted copy of a UIPlayerState with private fields removed.
 *
 * Redacted fields (omitted): handCards, handDisplay, inPlayCards,
 * inPlayDisplay, discardCards, discardDisplay. Preserved fields (public
 * information): all counts, discardTopCard, victoryCards, victoryVP.
 *
 * @param player - The source player state. Not mutated.
 * @returns A new UIPlayerState with private fields omitted.
 */
function redactHandCards(player: UIPlayerState): UIPlayerState {
  const base: UIPlayerState = {
    playerId: player.playerId,
    deckCount: player.deckCount,
    handCount: player.handCount,
    discardCount: player.discardCount,
    inPlayCount: player.inPlayCount,
    victoryCount: player.victoryCount,
    woundCount: player.woundCount,
    // why: hand card ext_ids redacted — this player's hand contents are
    // hidden from the viewing audience. Only handCount remains visible.
    // why: WP-111 / EC-118 — handDisplay omitted alongside handCards
    // (privacy symmetry). Leaking display data is identical to leaking
    // the CardExtId for opponent privacy purposes. Conditional
    // assignment is moot here because we simply do not assign the
    // field at all (mirrors the existing handCards omission pattern).
    // why: WP-128 / D-12803 — inPlayCards / inPlayDisplay redacted
    // for non-self / spectator audiences. Same omit-don't-assign
    // pattern as handCards for `exactOptionalPropertyTypes` discipline.
    // why: WP-243 / D-24010 — discardCards / discardDisplay redacted for
    // non-self / spectator audiences (same handCards privacy posture). The
    // full discard list carries card identities the owning player may act on
    // (KO-a-Hero); opponents and spectators see discardCount + discardTopCard
    // only. Omit-don't-assign, both fields together.
  };

  // why: WP-128 / D-12803 — discardTopCard is public information (face-up
  // at the physical table). Pass through with per-entry shallow copy
  // to prevent aliasing. Distinguish optional (undefined = redacted by
  // some other layer) from null (visible-but-empty: `discardCount === 0`).
  if (player.discardTopCard !== undefined) {
    if (player.discardTopCard === null) {
      base.discardTopCard = null;
    } else {
      base.discardTopCard = {
        extId: player.discardTopCard.extId,
        display: { ...player.discardTopCard.display },
      };
    }
  }

  // why: WP-128 / D-12803 — victoryCards is public knowledge by design
  // (VP is built from face-up resolved cards). Per-entry shallow copy
  // mirrors the projection-time aliasing-defense.
  if (player.victoryCards !== undefined) {
    base.victoryCards = deepCopyDisplayEntries(player.victoryCards);
  }

  // why: WP-128 / D-12801 — victoryVP is public; primitive number, no
  // aliasing concern.
  if (player.victoryVP !== undefined) {
    base.victoryVP = player.victoryVP;
  }

  return base;
}

/**
 * Builds a copy of a UIPlayerState preserving all hand/in-play/public fields.
 *
 * @param player - The source player state. Not mutated.
 * @returns A new UIPlayerState with all fields preserved (per-entry shallow-copied).
 */
function preserveHandCards(player: UIPlayerState): UIPlayerState {
  const base: UIPlayerState = {
    playerId: player.playerId,
    deckCount: player.deckCount,
    handCount: player.handCount,
    discardCount: player.discardCount,
    inPlayCount: player.inPlayCount,
    victoryCount: player.victoryCount,
    woundCount: player.woundCount,
  };

  // why: active player sees own hand card ext_ids for gameplay.
  // Spread copy prevents aliasing with input UIState.
  if (player.handCards !== undefined) {
    base.handCards = [...player.handCards];
  }

  // why: WP-111 / EC-118 — conditional assignment per WP-029 D-2902
  // exactOptionalPropertyTypes precedent (do NOT assign undefined
  // literally; do NOT use inline ternary that returns T[] | undefined).
  // Per-entry shallow copy of each UICardDisplay prevents aliasing with
  // the input UIState's display objects (same WP-028 cardKeywords
  // post-mortem precedent applied at the filter boundary).
  if (player.handDisplay !== undefined) {
    const copiedHandDisplay = [];
    for (const display of player.handDisplay) {
      copiedHandDisplay.push({ ...display });
    }
    base.handDisplay = copiedHandDisplay;
  }

  // why: WP-128 / D-12803 — active player sees own inPlayCards /
  // inPlayDisplay; same conditional-assignment pattern as handCards.
  // Spread copy prevents aliasing with input UIState.
  if (player.inPlayCards !== undefined) {
    base.inPlayCards = [...player.inPlayCards];
  }

  if (player.inPlayDisplay !== undefined) {
    const copiedInPlayDisplay = [];
    for (const display of player.inPlayDisplay) {
      copiedInPlayDisplay.push({ ...display });
    }
    base.inPlayDisplay = copiedInPlayDisplay;
  }

  // why: WP-243 / D-24010 — active player sees own full discard contents
  // (needed for the KO-a-Hero prompt + the "View all" discard view); same
  // conditional-assignment pattern as handCards. discardCards + discardDisplay
  // are preserved together (both or neither) and spread/per-entry copied to
  // prevent aliasing with the input UIState.
  if (player.discardCards !== undefined) {
    base.discardCards = [...player.discardCards];
  }
  if (player.discardDisplay !== undefined) {
    const copiedDiscardDisplay = [];
    for (const display of player.discardDisplay) {
      copiedDiscardDisplay.push({ ...display });
    }
    base.discardDisplay = copiedDiscardDisplay;
  }

  // why: WP-128 / D-12803 — discardTopCard is public information; same
  // copy treatment as in redactHandCards above. Optional+nullable combo
  // distinguishes redacted (`undefined`) from visible-but-empty (`null`).
  if (player.discardTopCard !== undefined) {
    if (player.discardTopCard === null) {
      base.discardTopCard = null;
    } else {
      base.discardTopCard = {
        extId: player.discardTopCard.extId,
        display: { ...player.discardTopCard.display },
      };
    }
  }

  // why: WP-128 / D-12803 — victoryCards is public; per-entry shallow
  // copy mirrors the projection-time aliasing-defense.
  if (player.victoryCards !== undefined) {
    base.victoryCards = deepCopyDisplayEntries(player.victoryCards);
  }

  // why: WP-128 / D-12801 — victoryVP is public; primitive number.
  if (player.victoryVP !== undefined) {
    base.victoryVP = player.victoryVP;
  }

  return base;
}

/**
 * Filters a UIState for a specific audience.
 *
 * Pure function: no I/O, no mutation of input UIState, no side effects.
 * Same inputs always produce the same output.
 *
 * One UIState, filtered views — no alternate game states.
 * Implements D-0302 (Single UIState, Multiple Audiences).
 *
 * Forbidden behaviors (do not add later):
 * - mutation of the input uiState
 * - accessing G, ctx, or any engine internals
 * - caching or memoization
 * - any form of side effect
 *
 * @param uiState - The authoritative UIState from buildUIState. Not mutated.
 * @param audience - Who is viewing: player (with playerId) or spectator.
 * @returns A new UIState with audience-appropriate visibility.
 */
export function filterUIStateForAudience(
  uiState: UIState,
  audience: UIAudience,
): UIState {
  // --- 1. Filter players based on audience ---
  const filteredPlayers: UIPlayerState[] = [];

  if (audience.kind === 'player') {
    for (const player of uiState.players) {
      if (player.playerId === audience.playerId) {
        // why: viewing player sees own hand card ext_ids
        filteredPlayers.push(preserveHandCards(player));
      } else {
        // why: other players' hand contents are hidden — count only
        filteredPlayers.push(redactHandCards(player));
      }
    }
  } else {
    // why: spectators see hand counts only — no hand card ext_ids for any player
    for (const player of uiState.players) {
      filteredPlayers.push(redactHandCards(player));
    }
  }

  // --- 2. Determine economy visibility ---
  let economy: UITurnEconomyState;

  if (audience.kind === 'player' && audience.playerId === uiState.game.activePlayerId) {
    // why: only the active player sees their own economy. WP-128 extends
    // with `piercing` / `woundsDrawn` — same active-player-only posture.
    economy = {
      attack: uiState.economy.attack,
      recruit: uiState.economy.recruit,
      availableAttack: uiState.economy.availableAttack,
      availableRecruit: uiState.economy.availableRecruit,
      piercing: uiState.economy.piercing,
      woundsDrawn: uiState.economy.woundsDrawn,
    };
  } else {
    // why: non-active players and spectators do not see economy details
    economy = { ...REDACTED_ECONOMY };
  }

  // --- 3. Build new UIState with all fields copied (no references to input) ---
  // why: deck contents/order are already hidden by buildUIState (WP-028) —
  // decks are projected as counts only, never as card arrays. The filter
  // does not need to redact deck data because it was never included.
  // why: WP-111 — City `display`, HQ `slotDisplay`, and Mastermind
  // `display` are public information and pass through. Per-entry
  // shallow copies (via deepCopyCitySpaces / deepCopyHqSlotDisplay)
  // prevent aliasing with the input UIState's card display objects.
  // Mastermind is shallow-copied with a nested {...display} to copy
  // the display payload alongside id / tacticsRemaining / tacticsDefeated.
  // why: WP-128 / D-12806 — `mastermind.attachedBystanders`,
  // `mastermind.strikePile`, `scheme.twistPile`, `city.escapedPile`,
  // `koPile` are public and pass through with per-entry shallow copies.
  // `decks` and `piles` are primitive-only; plain shallow copy.
  const result: UIState = {
    game: { ...uiState.game },
    players: filteredPlayers,
    city: {
      spaces: deepCopyCitySpaces(uiState.city.spaces),
      escapedPile: deepCopyDisplayEntries(uiState.city.escapedPile),
    },
    hq: {
      slots: [...uiState.hq.slots],
      ...(uiState.hq.slotDisplay !== undefined
        ? { slotDisplay: deepCopyHqSlotDisplay(uiState.hq.slotDisplay) }
        : {}),
    },
    mastermind: {
      id: uiState.mastermind.id,
      tacticsRemaining: uiState.mastermind.tacticsRemaining,
      tacticsDefeated: uiState.mastermind.tacticsDefeated,
      display: { ...uiState.mastermind.display },
      attachedBystanders: deepCopyDisplayEntries(
        uiState.mastermind.attachedBystanders,
      ),
      strikePile: deepCopyDisplayEntries(uiState.mastermind.strikePile),
    },
    scheme: {
      id: uiState.scheme.id,
      twistCount: uiState.scheme.twistCount,
      twistPile: deepCopyDisplayEntries(uiState.scheme.twistPile),
    },
    economy,
    log: [...uiState.log],
    // why: WP-200 — mirror the `log` filter clone. Spread copy prevents
    // the audience-filtered UIState from aliasing the input UIState's
    // notableEvents array; per-entry payloads are plain JSON objects so
    // top-level copy is sufficient (mirrors `log`).
    notableEvents: [...uiState.notableEvents],
    // why: WP-214 — villainAttachedHeroes is public (visible to all players);
    // per-entry spread copy prevents aliasing with the input UIState
    villainAttachedHeroes: buildVillainAttachedHeroesFilterCopy(uiState.villainAttachedHeroes),
    // why: progress counters are public (no redaction needed) — passed through
    // unchanged via fresh object copy to avoid aliasing with the input UIState.
    // Forced cascade from WP-067 making `progress` a required UIState field.
    progress: { ...uiState.progress },
    decks: { ...uiState.decks },
    piles: { ...uiState.piles },
    koPile: deepCopyKoPile(uiState.koPile),
  };

  if (uiState.gameOver !== undefined) {
    result.gameOver = { ...uiState.gameOver };
  }

  // why: D-22202 — pendingHeroChoice passes through for all audiences without
  // redaction. The revealed card is face-up at the physical table; all players
  // and spectators see it. Conditional-assignment pattern matches gameOver above
  // — do NOT assign `pendingHeroChoice: undefined` on the result literal
  // (exactOptionalPropertyTypes).
  if (uiState.pendingHeroChoice !== undefined) {
    result.pendingHeroChoice = {
      ...uiState.pendingHeroChoice,
      display: { ...uiState.pendingHeroChoice.display },
    };
  }

  // why: D-24011 — pendingKoHeroChoice is redacted for EVERY audience except
  // the choosing player. Unlike the public pendingHeroChoice (the revealed
  // card is face-up on the table), the KO eligible list carries the chooser's
  // HAND identities; passing it through to opponents or spectators would leak
  // the hand. Present only when audience is a player whose playerId equals the
  // chooser's playerID; omitted (conditional assignment, never an `undefined`
  // literal) for opponents AND spectators. Per-entry display spread prevents
  // aliasing with the input UIState.
  if (
    uiState.pendingKoHeroChoice !== undefined &&
    audience.kind === 'player' &&
    audience.playerId === uiState.pendingKoHeroChoice.playerID
  ) {
    const eligibleCopy = [];
    for (const entry of uiState.pendingKoHeroChoice.eligible) {
      eligibleCopy.push({
        zone: entry.zone,
        cardId: entry.cardId,
        display: { ...entry.display },
      });
    }
    result.pendingKoHeroChoice = {
      choiceType: uiState.pendingKoHeroChoice.choiceType,
      playerID: uiState.pendingKoHeroChoice.playerID,
      eligible: eligibleCopy,
      remaining: uiState.pendingKoHeroChoice.remaining,
    };
  }

  // why: D-24020 — hand/discard are private to the chooser. pendingOptionalKoReward
  // is redacted for EVERY audience except the choosing player (the D-24011
  // hand-privacy analog). Its eligibleHand and eligibleDiscard lists carry the
  // chooser's PRIVATE hand and discard identities; passing them through to
  // opponents or spectators would leak both zones. Present only when the audience
  // is a player whose playerId equals the chooser's playerID; omitted (conditional
  // assignment, never an `undefined` literal) for opponents AND spectators.
  // Per-entry display spread prevents aliasing with the input UIState.
  if (
    uiState.pendingOptionalKoReward !== undefined &&
    audience.kind === 'player' &&
    audience.playerId === uiState.pendingOptionalKoReward.playerID
  ) {
    const eligibleHandCopy = [];
    for (const entry of uiState.pendingOptionalKoReward.eligibleHand) {
      eligibleHandCopy.push({
        zone: entry.zone,
        cardId: entry.cardId,
        display: { ...entry.display },
      });
    }
    const eligibleDiscardCopy = [];
    for (const entry of uiState.pendingOptionalKoReward.eligibleDiscard) {
      eligibleDiscardCopy.push({
        zone: entry.zone,
        cardId: entry.cardId,
        display: { ...entry.display },
      });
    }
    result.pendingOptionalKoReward = {
      playerID: uiState.pendingOptionalKoReward.playerID,
      rewardLabel: uiState.pendingOptionalKoReward.rewardLabel,
      eligibleHand: eligibleHandCopy,
      eligibleDiscard: eligibleDiscardCopy,
    };
  }

  // why: WP-258 / D-12803 — hollowEffects is PUBLIC card/mechanic data, not
  // hidden info. The filter passes it through value-unchanged for EVERY
  // audience (own-player AND other-player AND spectator) — it redacts /
  // reorders / rewrites / drops NOTHING. A per-record fresh-object copy
  // (aliasing defense, mirroring the notableEvents / victoryCards posture)
  // prevents the audience-filtered UIState from aliasing the input array, while
  // every field value is preserved so both audiences deep-equal the source.
  // Conditional assignment (never a `hollowEffects: undefined` literal) keeps
  // the absent-channel case omitting the field under exactOptionalPropertyTypes.
  if (uiState.hollowEffects !== undefined) {
    const hollowEffectsCopy: HollowEffectRecord[] = [];
    for (const record of uiState.hollowEffects) {
      hollowEffectsCopy.push({
        cardId: record.cardId,
        cardType: record.cardType,
        timing: record.timing,
        mechanic: record.mechanic,
        reason: record.reason,
        turn: record.turn,
      });
    }
    result.hollowEffects = hollowEffectsCopy;
  }

  return result;
}
