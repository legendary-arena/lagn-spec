/**
 * Builds the initial LegendaryGameState (G) from a validated MatchSetupConfig.
 *
 * Called by Game.setup() after validation succeeds. Resolves config fields
 * into zone arrays of CardExtId strings and constructs the full initial
 * game state.
 *
 * After this function returns, the engine operates solely on G and ctx.
 * No further registry access occurs at runtime.
 */

import type {
  LegendaryGameState,
  SetupContext,
  PlayerZones,
  MatchSelection,
  CardExtId,
  LobbyState,
  ScenarioScoringConfig,
} from '../types.js';
import { TURN_STAGES } from '../turn/turnPhases.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import { buildPlayerState } from './playerInit.js';
import {
  buildGlobalPiles,
  BYSTANDER_EXT_ID,
  WOUND_EXT_ID,
  SHIELD_OFFICER_EXT_ID,
  SIDEKICK_EXT_ID,
} from './pilesInit.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import {
  buildVillainDeck,
  isVillainDeckRegistryReader,
} from '../villainDeck/villainDeck.setup.js';
import { initializeCity, fillHqFromDeck } from '../board/city.logic.js';
import { buildCardStats, resetTurnEconomy } from '../economy/economy.logic.js';
import { buildHeroDeck } from './buildHeroDeck.js';
import {
  buildMastermindState,
  isMastermindRegistryReader,
} from '../mastermind/mastermind.setup.js';
import {
  buildHeroAbilityHooks,
  isHeroAbilityRegistryReader,
} from './heroAbility.setup.js';
import { buildCardKeywords } from './buildCardKeywords.js';
import {
  buildSchemeSetupInstructions,
  isSchemeRegistryReader,
} from './buildSchemeSetupInstructions.js';
import {
  buildCardDisplayData,
  isCardDisplayDataRegistryReader,
} from './buildCardDisplayData.js';
import type { UICardDisplay } from '../ui/uiState.types.js';
import type { CardStatEntry } from '../economy/economy.types.js';
import { executeSchemeSetup } from '../scheme/schemeSetup.execute.js';

// why: Pile ext_id constants are re-exported from pilesInit.ts for backward
// compatibility. The canonical definitions live in pilesInit.ts — importing
// them here prevents silent drift from duplicate string literals.
export { BYSTANDER_EXT_ID, WOUND_EXT_ID, SHIELD_OFFICER_EXT_ID, SIDEKICK_EXT_ID };

// ── Well-known ext_ids for generic game component cards ─────────────────────

// why: Starting cards (S.H.I.E.L.D. Agents and Troopers) are standard game
// components that exist in every Legendary game. They are not set-specific
// cards and do not appear in the registry's per-set card data. These ext_id
// constants provide well-known identifiers for zone tracking.

/** Well-known ext_id for S.H.I.E.L.D. Agent starting cards. */
export const SHIELD_AGENT_EXT_ID: CardExtId = 'starting-shield-agent';

/** Well-known ext_id for S.H.I.E.L.D. Trooper starting cards. */
export const SHIELD_TROOPER_EXT_ID: CardExtId = 'starting-shield-trooper';

// ── Starting deck composition ───────────────────────────────────────────────

// why: Per Legendary board game rules, each player starts with 12 cards:
// 8 S.H.I.E.L.D. Agents (recruit 1) and 4 S.H.I.E.L.D. Troopers (attack 1).

/** Number of S.H.I.E.L.D. Agent cards in each player's starting deck. */
const STARTING_AGENTS_COUNT = 8;

/** Number of S.H.I.E.L.D. Trooper cards in each player's starting deck. */
const STARTING_TROOPERS_COUNT = 4;

// why: D-12903 — HQ slot count is 5 for MVP (graceful extension to 6 reserved
// for set-specific variants). WP-135 reads the same constant when populating
// the HQ from the front of the shuffled hero deck reservoir; recruitHero
// refills exactly one slot per success via refillHqSlot.
/** Number of HQ slots populated from the hero deck at setup time (MVP). */
const HQ_SLOT_COUNT = 5;

/**
 * Builds an unshuffled starting deck of CardExtId strings for one player.
 *
 * @returns Array of 12 CardExtId strings (8 agents + 4 troopers).
 */
function buildStartingDeckCards(): CardExtId[] {
  const cards: CardExtId[] = [];

  for (let i = 0; i < STARTING_AGENTS_COUNT; i++) {
    cards.push(SHIELD_AGENT_EXT_ID);
  }

  for (let i = 0; i < STARTING_TROOPERS_COUNT; i++) {
    cards.push(SHIELD_TROOPER_EXT_ID);
  }

  return cards;
}

/**
 * Extracts the match selection metadata from a validated config.
 *
 * @param config - Validated match setup config.
 * @returns MatchSelection with the selected entity ext_ids.
 */
function buildMatchSelection(config: MatchSetupConfig): MatchSelection {
  return {
    schemeId: config.schemeId,
    mastermindId: config.mastermindId,
    villainGroupIds: [...config.villainGroupIds],
    henchmanGroupIds: [...config.henchmanGroupIds],
    heroDeckIds: [...config.heroDeckIds],
  };
}

// ── Main orchestrator ───────────────────────────────────────────────────────

/**
 * Builds the complete initial LegendaryGameState from a validated config.
 *
 * Delegates player zone construction to buildPlayerState and global pile
 * construction to buildGlobalPiles.
 *
 * @param config - Validated MatchSetupConfig (all 9 fields).
 * @param registry - Card registry for resolving ext_ids. Used by
 *   buildVillainDeck (WP-014B) to resolve villain, henchman, scheme, and
 *   mastermind data at setup time. Satisfies VillainDeckRegistryReader
 *   structurally.
 * @param context - Setup context with ctx.numPlayers and random.Shuffle.
 * @param scoringConfig - Optional setup-time PAR scoring configuration. When
 *   provided, assigned to G.activeScoringConfig to mark the match as
 *   PAR-scored. When undefined, the field stays unset.
 * @returns The fully populated initial LegendaryGameState.
 */
// why: 4th positional optional parameter per D-6703; narrowest additive change
// that keeps the 9-field MatchSetupConfig lock (D-1244) and D-4805
// scenario-config separation intact.
export function buildInitialGameState(
  config: MatchSetupConfig,
  registry: CardRegistryReader,
  context: SetupContext,
  scoringConfig?: ScenarioScoringConfig,
): LegendaryGameState {
  // why: Helpers were extracted from this function to satisfy the 30-line
  // function limit (code-style Rule 5) and to improve testability. Each
  // helper is independently testable with its own shape tests.

  const numPlayers = context.ctx.numPlayers;

  // why: D-10014 — Uniformity Rule + builder signatures don't accept G +
  // remediation pointer to setRegistryForSetup. Per Q3 LOCKED
  // orchestration-only, all four setup-builder diagnostic emissions live
  // here. Each guard returns false on incomplete registry-reader interface
  // (test mocks, server-not-wired). On false, push a full-sentence
  // diagnostic naming (a) which builder was skipped, (b) why, (c) how to
  // fix. Builder-internal `isXRegistryReader → empty` paths remain
  // unchanged for defense-in-depth; this orchestration site is the
  // primary detection seam.
  const setupMessages: string[] = [];

  if (!isVillainDeckRegistryReader(registry)) {
    setupMessages.push(
      'buildVillainDeck skipped: the registry-reader interface is incomplete (listCards / listSets / getSet missing or not functions). Verify that setRegistryForSetup(registry) was called at server startup, or that the test mock implements the full reader interface.',
    );
  }
  if (!isMastermindRegistryReader(registry)) {
    setupMessages.push(
      'buildMastermindState skipped: the registry-reader interface is incomplete (listSets / getSet missing or not functions). Verify that setRegistryForSetup(registry) was called at server startup, or that the test mock implements the full reader interface.',
    );
  }
  if (!isSchemeRegistryReader(registry)) {
    setupMessages.push(
      'buildSchemeSetupInstructions skipped: the registry-reader interface is incomplete (listSets / getSet missing or not functions). Verify that setRegistryForSetup(registry) was called at server startup, or that the test mock implements the full reader interface.',
    );
  }
  if (!isHeroAbilityRegistryReader(registry)) {
    setupMessages.push(
      'buildHeroAbilityHooks skipped: the registry-reader interface is incomplete (listCards missing or not a function). Verify that setRegistryForSetup(registry) was called at server startup, or that the test mock implements the full reader interface.',
    );
  }
  // why: WP-111 / EC-118 / D-10014 — orchestration-side detection seam
  // for the new buildCardDisplayData builder. Mirrors the four guards
  // above. Builder-internal `isCardDisplayDataRegistryReader → empty`
  // path remains unchanged for defense-in-depth; this site is the
  // primary detection seam (per the WP-113 D-10014 single-detection-seam
  // pattern). Single full-sentence diagnostic naming (a) which builder
  // skipped, (b) why, (c) how to fix.
  if (!isCardDisplayDataRegistryReader(registry)) {
    setupMessages.push(
      'buildCardDisplayData skipped: the registry-reader interface is incomplete (listCards / getSet missing or not functions). Verify that setRegistryForSetup(registry) was called at server startup, or that the test mock implements the full reader interface.',
    );
  }

  // Build per-player state with shuffled starting decks
  const playerZones: Record<string, PlayerZones> = {};

  for (let playerIndex = 0; playerIndex < numPlayers; playerIndex++) {
    const playerId = String(playerIndex);
    const startingDeck = buildStartingDeckCards();
    const playerState = buildPlayerState(playerId, startingDeck, context);
    playerZones[playerId] = playerState.zones;
  }

  // Build global piles sized from config count fields
  const piles = buildGlobalPiles(config, context);

  // Build selection metadata from config
  const selection = buildMatchSelection(config);

  // Build villain deck from registry data
  // why: villain deck built from registry data at setup time; see D-1410
  // through D-1413 for ext_id conventions and composition rules. The real
  // CardRegistry satisfies VillainDeckRegistryReader structurally. Test mocks
  // that only implement CardRegistryReader (listCards with {key} only) will
  // lack listSets/getSet — buildVillainDeck handles this gracefully by
  // producing an empty deck, which the reveal pipeline already supports.
  const villainDeckResult = buildVillainDeck(config, registry, context);

  // why: cardStats extracted to local variable so buildMastermindState
  // can add the mastermind base card entry to it. buildMastermindState
  // MUST execute after buildCardStats (ordering invariant — EC-019).
  const cardStats = buildCardStats(registry as unknown, config);

  // why: card keywords resolved at setup from registry so moves never query
  // registry at runtime — same pattern as G.cardStats (WP-018) and
  // G.villainDeckCardTypes (WP-014B).
  const cardKeywords = buildCardKeywords(registry as unknown, config);

  // why: scheme setup runs after base construction, before first turn.
  // Instructions configure the board (counters, keywords, city state).
  // Separate from scheme twist execution (WP-024).
  const schemeSetupInstructions = buildSchemeSetupInstructions(
    config.schemeId as CardExtId,
    registry as unknown,
  );

  // why: mastermind state built from registry at setup time; base card
  // fightCost added to cardStats so fightMastermind reads it without
  // registry access. Narrow test mocks produce empty state gracefully.
  const mastermindState = buildMastermindState(
    config.mastermindId as CardExtId,
    registry as unknown,
    context,
    cardStats,
  );

  // why: WP-111 / EC-118 — sibling-snapshot to G.cardStats / G.cardKeywords /
  // G.villainDeckCardTypes. Surfaces card display fields (name, imageUrl,
  // cost) into UIState so arena-client renders real cards instead of
  // CardExtId strings — without granting the client a runtime registry
  // import. Placed after buildMastermindState because the completeness
  // sweep below uses cardStats (which now contains the mastermind base
  // card entry) as the expected-key set.
  const cardDisplayData = buildCardDisplayData(registry as unknown, config);

  // why: WP-111 / EC-118 / PS-8 — setup-time diagnostic surface for missing
  // display entries. Preserves WP-028 D-2801 projection-purity contract:
  // buildUIState MUST NOT mutate G.messages. The diagnostic surface lives
  // here at setup time, mirroring the WP-113 D-10014 single-detection-seam
  // pattern. One consolidated diagnostic per setup, never per-card.
  // Projection-time placeholder fallback (UNKNOWN_DISPLAY_PLACEHOLDER) is
  // a pure render path with no G interaction.
  const completenessMessage = auditCardDisplayDataCompleteness(
    cardStats,
    cardDisplayData,
  );
  if (completenessMessage !== null) {
    setupMessages.push(completenessMessage);
  }

  // why: WP-135 — build the per-match hero deck reservoir from
  // MatchSetupConfig.heroDeckIds via the locked rarity → copy-count map
  // (D-13501; 5/3/3/3 = 14 cards per hero across the four-label set).
  // Single ctx.random.Shuffle call inside buildHeroDeck — the determinism
  // envelope is locked here; no per-turn reshuffle. fillHqFromDeck takes
  // the first 5 cards into G.hq slots 0..4 (deck top → slot 0); the
  // remainder lives at G.heroDeck. Narrow test mocks → empty reservoir →
  // empty HQ (mirrors sibling builders).
  const shuffledHeroDeck = buildHeroDeck(
    [...config.heroDeckIds],
    registry,
    context,
  );
  const filledHqResult = fillHqFromDeck(shuffledHeroDeck, HQ_SLOT_COUNT);

  // why: build the base state first, then apply scheme setup instructions.
  // executeSchemeSetup returns updated state — pure function, no mutation.
  // At MVP, schemeSetupInstructions is always [], so this is a no-op passthrough.
  const baseState: LegendaryGameState = {
    matchConfiguration: config,
    selection,
    // why: currentStage is initialized to the first canonical turn stage.
    // The play phase onBegin hook resets it on each new turn. During setup
    // and lobby phases, currentStage is not meaningful but must be present
    // because LegendaryGameState requires it for JSON-serializability.
    // why: TURN_STAGES is a readonly array with known contents. The non-null
    // assertion is safe because TURN_STAGES always has at least one element
    // (enforced by drift-detection tests in WP-007A).
    currentStage: TURN_STAGES[0]!,
    playerZones,
    piles,
    messages: setupMessages,
    counters: {},
    hookRegistry: buildDefaultHookDefinitions(config),
    // why: villain deck built from registry data at setup time; see D-1410
    // through D-1413 for ext_id conventions and composition rules.
    villainDeck: villainDeckResult.state,
    villainDeckCardTypes: villainDeckResult.cardTypes,
    // why: KO pile starts empty; cards enter via koCard helper (WP-017)
    ko: [],
    // why: no bystanders attached at game start; populated during reveals (WP-017)
    attachedBystanders: {},
    // why: City initialized empty; villains enter via revealVillainCard (WP-015)
    city: initializeCity(),
    // why: HQ filled from first 5 of the shuffled hero deck via
    // fillHqFromDeck; remainder stored at G.heroDeck per WP-135.
    hq: filledHqResult.hq,
    // why: G.heroDeck holds the post-shuffle, post-HQ-fill remainder of
    // the per-match hero deck reservoir. Single source for refilling
    // vacated HQ slots inside recruitHero (FIFO via refillHqSlot;
    // empty-deck branch leaves the slot null per D-13503).
    heroDeck: filledHqResult.remainingDeck,
    // why: mastermind state built at setup from registry; tactics deck
    // shuffled deterministically; base card fightCost in G.cardStats
    mastermind: mastermindState,
    // why: scheme runtime state holds the twist pile for resolved
    // scheme-twist cards. Separate from schemeSetupInstructions (D-2601).
    scheme: { twistPile: [] },
    // why: escaped pile is top-level because CityZone is a fixed 5-tuple
    // that cannot host named fields. Append-only, chronological order.
    escapedPile: [],
    // why: card stats resolved at setup from registry so moves never query
    // registry at runtime — same pattern as G.villainDeckCardTypes (WP-014).
    // Read-only after setup (mastermind base card added by buildMastermindState).
    cardStats,
    // why: board keywords resolved at setup from registry — same pattern as
    // cardStats and villainDeckCardTypes. Immutable during gameplay.
    cardKeywords,
    // why: WP-111 / EC-118 — sibling-snapshot for UI display data
    // (name / imageUrl / cost). Built once at setup; read only by
    // uiState.build.ts. Gameplay reads G.cardStats — never
    // G.cardDisplayData (presentation-vs-gameplay separation lock).
    cardDisplayData,
    // why: scheme setup instructions stored for replay observability (D-2601).
    // Empty at MVP — no structured scheme metadata in registry yet.
    schemeSetupInstructions,
    // why: economy starts at zero; reset again at each turn start
    turnEconomy: resetTurnEconomy(),
    // why: hero ability hooks built from registry at setup time — same
    // pattern as hookRegistry and cardStats. Immutable during gameplay.
    // Execution deferred to WP-022+.
    heroAbilityHooks: buildHeroAbilityHooks(registry, config),
    // why: lobby state initialized at setup time from ctx.numPlayers. All
    // players start as not ready. G.lobby.started is false until
    // startMatchIfReady succeeds.
    lobby: {
      requiredPlayers: context.ctx.numPlayers,
      ready: {},
      started: false,
    } satisfies LobbyState,
    // why: conditional spread per WP-029 exactOptionalPropertyTypes pattern —
    // the field is included only when scoringConfig was supplied; never written
    // as `activeScoringConfig: undefined` literally (D-6703).
    ...(scoringConfig !== undefined ? { activeScoringConfig: scoringConfig } : {}),
  };

  return executeSchemeSetup(baseState, schemeSetupInstructions);
}

// ---------------------------------------------------------------------------
// auditCardDisplayDataCompleteness — pure helper for PS-8 diagnostic
// ---------------------------------------------------------------------------

/**
 * Audits whether every CardExtId expected by gameplay has a matching
 * display entry. Returns a single consolidated diagnostic string when
 * any expected key is missing; returns null when every key is covered.
 *
 * Expected-key set is taken from `cardStats` because both builders
 * iterate the same four card-type surfaces (heroes / villains /
 * henchmen / mastermind base card) and use the same CardExtId join key
 * conventions. After buildMastermindState runs, cardStats contains
 * every gameplay-relevant ext_id; cardDisplayData should contain a
 * superset (display data for the same set, no extra entries).
 *
 * The completeness sweep is the PS-8 setup-time diagnostic surface that
 * preserves WP-028 D-2801 projection-purity (buildUIState never mutates
 * G.messages). One consolidated diagnostic per setup; never per-card.
 *
 * @param cardStats - Populated card stats record (gameplay source of
 *   truth for which ext_ids should exist).
 * @param cardDisplayData - Populated card display data record.
 * @returns Single consolidated diagnostic string, or null when every
 *   expected key is present.
 */
// why: WP-113 D-10014 single-detection-seam pattern; aggregate the
// missing list into one message rather than emitting per-card noise.
function auditCardDisplayDataCompleteness(
  cardStats: Record<CardExtId, CardStatEntry>,
  cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>,
): string | null {
  const missing: string[] = [];
  for (const expectedKey of Object.keys(cardStats)) {
    if (cardDisplayData[expectedKey as CardExtId] === undefined) {
      missing.push(expectedKey);
    }
  }
  if (missing.length === 0) return null;

  const plural = missing.length === 1 ? 'entry' : 'entries';
  return `buildCardDisplayData under-emitted: ${String(missing.length)} expected display ${plural} missing. Missing extIds: ${missing.join(', ')}. Fix: verify the registry-reader interface (listCards / getSet) is fully wired via setRegistryForSetup(registry), and that the test mock implements both methods.`;
}
