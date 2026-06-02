/**
 * Core types for the Legendary Arena game engine.
 *
 * LegendaryGameState is the shape of boardgame.io game state (G).
 * MatchConfiguration is the match setup payload passed to Game.setup().
 *
 * Zone and player state types are defined canonically in
 * src/state/zones.types.ts and re-exported here for backward compatibility.
 */

import type { MatchSetupConfig } from './matchSetup.types.js';
import type { BoardKeyword } from './board/boardKeywords.types.js';
import type { SchemeSetupInstruction } from './scheme/schemeSetup.types.js';

// why: Persistence boundary types (PERSISTENCE_CLASSES, MatchSnapshot,
// PersistableMatchConfig) are defined canonically in
// src/persistence/persistence.types.ts (WP-013). Re-exported here so that
// consumers importing from './types.js' have access.
export type {
  MatchSnapshot,
  MatchSnapshotPlayer,
  MatchSnapshotOutcome,
  PersistableMatchConfig,
} from './persistence/persistence.types.js';
export { PERSISTENCE_CLASSES } from './persistence/persistence.types.js';

// why: LobbyState is defined canonically in src/lobby/lobby.types.ts (WP-011).
// Re-exported here so that consumers importing from './types.js' have access.
export type { LobbyState, SetPlayerReadyArgs } from './lobby/lobby.types.js';

// why: Versioning types (EngineVersion, DataVersion, ContentVersion,
// VersionedArtifact, CompatibilityStatus, CompatibilityResult) are defined
// canonically in src/versioning/versioning.types.ts (WP-034 / D-3401).
// Re-exported here so consumers importing from './types.js' have access.
export type {
  EngineVersion,
  DataVersion,
  ContentVersion,
  VersionedArtifact,
  CompatibilityStatus,
  CompatibilityResult,
} from './versioning/versioning.types.js';

// Ops metadata (WP-035 / D-3501)
// why: Operational metadata types (OpsCounters, DeploymentEnvironment,
// IncidentSeverity) are defined canonically in src/ops/ops.types.ts
// (WP-035 / D-3501). Re-exported here so consumers importing from
// './types.js' have access. These types are passive metadata — the engine
// never constructs or mutates instances (RS-1 option (a)).
export type {
  OpsCounters,
  DeploymentEnvironment,
  IncidentSeverity,
} from './ops/ops.types.js';

// why: Villain deck types (VillainDeckState, RevealedCardType) are defined
// canonically in src/villainDeck/villainDeck.types.ts (WP-014A). Re-exported
// here so that consumers importing from './types.js' have access.
export type { VillainDeckState, RevealedCardType } from './villainDeck/villainDeck.types.js';
export { REVEALED_CARD_TYPES } from './villainDeck/villainDeck.types.js';

// why: City and HQ zone types are defined canonically in
// src/board/city.types.ts (WP-015). Re-exported here so that consumers
// importing from './types.js' have access.
export type { CityZone, CitySpace, HqZone, HqSlot } from './board/city.types.js';

// why: Turn phase types (MatchPhase, TurnStage, TurnPhaseError) are defined
// canonically in src/turn/turnPhases.types.ts (WP-007A). They are re-exported
// here so that consumers importing from './types.js' have access.
export type {
  MatchPhase,
  TurnStage,
  TurnPhaseError,
} from './turn/turnPhases.types.js';

// why: Move contracts (MoveResult, MoveError, CoreMoveName) are the engine-wide
// result contract defined canonically in src/moves/coreMoves.types.ts (WP-008A).
// Re-exported here so that consumers importing from './types.js' have access.
export type {
  MoveResult,
  MoveError,
  CoreMoveName,
} from './moves/coreMoves.types.js';

// why: Rule hook contracts (RuleTriggerName, RuleEffect, HookDefinition,
// HookRegistry) are defined canonically in src/rules/ruleHooks.types.ts
// (WP-009A). Re-exported here so that consumers importing from './types.js'
// have access.
export type {
  RuleTriggerName,
  RuleEffect,
  HookDefinition,
  HookRegistry,
} from './rules/ruleHooks.types.js';

// why: Endgame types (EndgameResult, EndgameOutcome) are defined canonically
// in src/endgame/endgame.types.ts (WP-010). Re-exported here so that
// consumers importing from './types.js' have access. ENDGAME_CONDITIONS is
// a value export (const), not a type, so it uses a separate export statement.
export type {
  EndgameResult,
  EndgameOutcome,
} from './endgame/endgame.types.js';
export { ENDGAME_CONDITIONS } from './endgame/endgame.types.js';

// why: Scoring types (FinalScoreSummary, PlayerScoreBreakdown) and VP
// constants are defined canonically in src/scoring/scoring.types.ts (WP-020).
// Re-exported here so that consumers importing from './types.js' have access.
export type { FinalScoreSummary, PlayerScoreBreakdown } from './scoring/scoring.types.js';
export {
  VP_VILLAIN,
  VP_HENCHMAN,
  VP_BYSTANDER,
  VP_TACTIC,
  VP_WOUND,
} from './scoring/scoring.types.js';

// why: PAR scoring types (WP-048) are defined canonically in
// src/scoring/parScoring.types.ts. Re-exported here so that consumers
// importing from './types.js' have access to the full scoring surface.
// No LegendaryGameState field addition — the setup-time scoring config
// field is deferred to WP-067 per D-4802.
export type {
  ScenarioKey,
  TeamKey,
  ScoringWeights,
  ScoringCaps,
  PenaltyEventType,
  PenaltyEventWeights,
  ParBaseline,
  ScenarioScoringConfig,
  ScoringInputs,
  ScoreBreakdown,
  LeaderboardEntry,
  ScoringConfigValidationResult,
} from './scoring/parScoring.types.js';
export { PENALTY_EVENT_TYPES } from './scoring/parScoring.types.js';

// why: MastermindState is defined canonically in
// src/mastermind/mastermind.types.ts (WP-019). Re-exported here so that
// consumers importing from './types.js' have access.
export type { MastermindState } from './mastermind/mastermind.types.js';

// why: Economy types (TurnEconomy, CardStatEntry) are defined canonically
// in src/economy/economy.types.ts (WP-018). Re-exported here so that
// consumers importing from './types.js' have access.
export type { TurnEconomy, CardStatEntry } from './economy/economy.types.js';

// why: CardTraitEntry is defined canonically in src/state/cardTraits.types.ts
// (WP-179). Re-exported here so consumers importing from './types.js' have access.
export type { CardTraitEntry } from './state/cardTraits.types.js';

// why: Hero ability hook contracts (HeroAbilityHook, HeroCondition,
// HeroEffectDescriptor) are defined canonically in
// src/rules/heroAbility.types.ts (WP-021). HeroKeyword and HeroAbilityTiming
// are defined in src/rules/heroKeywords.ts. Re-exported here so that
// consumers importing from './types.js' have access.
export type {
  HeroAbilityHook,
  HeroCondition,
  HeroEffectDescriptor,
} from './rules/heroAbility.types.js';
export type {
  HeroKeyword,
  HeroAbilityTiming,
} from './rules/heroKeywords.js';

// why: Villain/henchman ability hook contracts (VillainAbilityHook,
// VillainAbilityTiming, VillainEffectKeyword) are defined canonically in
// src/rules/villainAbility.types.ts (WP-185). Re-exported here so consumers
// importing from './types.js' have access. The canonical drift-detection
// arrays are value exports, so they use a separate export statement.
export type {
  VillainAbilityHook,
  VillainAbilityTiming,
  VillainEffectKeyword,
} from './rules/villainAbility.types.js';
export {
  VILLAIN_ABILITY_TIMINGS,
  VILLAIN_EFFECT_KEYWORDS,
} from './rules/villainAbility.types.js';

// why: WP-200 — notable game event contracts (NotableGameEvent,
// NotableGameEventType, SchemeTwistResolverKey, FightResolvedEvent,
// AmbushResolvedEvent, SchemeTwistResolvedEvent, MastermindStrikeResolvedEvent)
// are defined canonically in src/events/notableEvents.types.ts. Re-exported
// here so consumers importing from './types.js' have access. The canonical
// drift-detection arrays are value exports.
export type {
  NotableGameEvent,
  NotableGameEventType,
  SchemeTwistResolverKey,
  FightResolvedEvent,
  AmbushResolvedEvent,
  SchemeTwistResolvedEvent,
  MastermindStrikeResolvedEvent,
} from './events/notableEvents.types.js';
export {
  NOTABLE_EVENT_TYPES,
  SCHEME_TWIST_RESOLVER_KEYS,
} from './events/notableEvents.types.js';

// why: Zone types (CardExtId, PlayerZones, GlobalPiles) were originally
// defined inline in this file during WP-005B. WP-006A consolidated them
// into src/state/zones.types.ts as the canonical source. They are
// re-exported here so that existing imports from './types.js' continue
// to work without modification.
export type {
  CardExtId,
  Zone,
  PlayerZones,
  PlayerState,
  GlobalPiles,
  ZoneValidationError,
  GameStateShape,
} from './state/zones.types.js';

export type { BoardKeyword } from './board/boardKeywords.types.js';
export { BOARD_KEYWORDS } from './board/boardKeywords.types.js';
export type { SchemeSetupInstruction, SchemeSetupType } from './scheme/schemeSetup.types.js';
export type { SchemeState } from './scheme/schemeState.types.js';
export { SCHEME_SETUP_TYPES } from './scheme/schemeSetup.types.js';

// Replay types (WP-027)
export type { ReplayInput, ReplayMove, ReplayResult } from './replay/replay.types.js';

// Replay snapshot sequence types (WP-063)
export type {
  ReplaySnapshotSequence,
  ReplayInputsFile,
} from './replay/replaySnapshot.types.js';

// why: UI state types defined canonically in src/ui/uiState.types.ts
// (WP-028). Re-exported here so that consumers importing from './types.js'
// have access. UICardDisplay and UIHQCard added by WP-111 (sibling
// snapshot pattern shared with cardStats / villainDeckCardTypes /
// cardKeywords; surfaced through UIState additive shape changes).
export type {
  UIState,
  UIPlayerState,
  UICityCard,
  UICityState,
  UIHQState,
  UIMastermindState,
  UISchemeState,
  UITurnEconomyState,
  UIGameOverState,
  UICardDisplay,
  UIHQCard,
} from './ui/uiState.types.js';

// why: Campaign types (ScenarioDefinition, CampaignDefinition,
// CampaignState, ScenarioOutcome, and sub-types) are defined canonically
// in src/campaign/campaign.types.ts (WP-030). Re-exported here so that
// consumers importing from './types.js' have access. CampaignState is
// NOT a field of LegendaryGameState — campaign state is Class 2 data,
// external to the engine per D-0502.
export type {
  ScenarioOutcome,
  ScenarioOutcomeCondition,
  ScenarioReward,
  ScenarioDefinition,
  CampaignUnlockRule,
  CampaignDefinition,
  CampaignState,
} from './campaign/campaign.types.js';

// why: Invariant types (InvariantCategory, InvariantViolation,
// InvariantCheckContext) are defined canonically in
// src/invariants/invariants.types.ts (WP-031). The canonical
// INVARIANT_CATEGORIES array is a const export (not a type), so it
// uses a separate export statement. Re-exported here so that
// consumers importing from './types.js' have access.
export type {
  InvariantCategory,
  InvariantViolation,
  InvariantCheckContext,
} from './invariants/invariants.types.js';
export { INVARIANT_CATEGORIES } from './invariants/invariants.types.js';

// why: network intent contracts are engine-category types (D-3201)
// consumed by the server layer for transport wiring.
export type {
  ClientTurnIntent,
  IntentValidationResult,
  IntentRejectionCode,
  IntentValidationContext,
} from './network/intent.types.js';

// why: content validation types (WP-033) are engine-category types
// (D-3301) consumed by content-authoring tools. They are a pre-engine
// gate — NOT part of the boardgame.io lifecycle. Never wire them
// into game.ts, moves, or phase hooks.
export type {
  ContentValidationResult,
  ContentValidationError,
  ContentValidationContext,
} from './content/content.validate.js';

// why: Simulation types (WP-036 / D-3601) are engine-category types
// consumed by external balance tooling (D-0702). They live in src/simulation/
// under D-3601. Re-exported here so consumers importing from './types.js'
// have access to the pluggable AIPolicy interface and the SimulationResult
// contract.
export type {
  AIPolicy,
  LegalMove,
  SimulationConfig,
  SimulationResult,
} from './simulation/ai.types.js';

// why: PAR simulation types (WP-049) ship the T2 Competent Heuristic
// calibration pipeline. Pure types and the error-code union live in
// par.aggregator.ts; the tier taxonomy lives in ai.tiers.ts. Re-exported
// here so consumers importing from './types.js' have access to the full
// PAR surface.
export type {
  ParSimulationConfig,
  ParSimulationResult,
  ParValidationIssue,
  ParValidationSeverity,
  ParValidationResult,
  TierOrderingResult,
  ParAggregationErrorCode,
} from './simulation/par.aggregator.js';
export type {
  AIPolicyTier,
  AIPolicyTierDefinition,
} from './simulation/ai.tiers.js';

// Beta metadata (WP-037 / D-3701)
// why: Beta metadata types (BetaFeedback, BetaCohort, FeedbackCategory)
// are defined canonically in src/beta/beta.types.ts (WP-037 / D-3701).
// Re-exported here so consumers importing from './types.js' have access.
// These types are metadata-not-state — the engine never constructs or
// mutates instances, and BetaFeedback is never a field of
// LegendaryGameState. Construction lives in the server layer or future
// ops tooling per the D-3701 sub-rule.
export type {
  BetaFeedback,
  BetaCohort,
  FeedbackCategory,
} from './beta/beta.types.js';

// Governance metadata (WP-040 / D-4001)
// why: Governance metadata types (ChangeCategory, ChangeBudget,
// ChangeClassification) are defined canonically in
// src/governance/governance.types.ts (WP-040 / D-4001). Re-exported here
// so consumers importing from './types.js' have access. These types are
// out-of-band metadata — the engine never constructs or mutates instances,
// and none of them are fields of LegendaryGameState. See
// `docs/governance/CHANGE_GOVERNANCE.md` for the reader-facing prose.
export type {
  ChangeCategory,
  ChangeBudget,
  ChangeClassification,
} from './governance/governance.types.js';

import type { TurnStage } from './turn/turnPhases.types.js';
import type { CardExtId, PlayerZones, GlobalPiles } from './state/zones.types.js';
import type { TurnEconomy, CardStatEntry } from './economy/economy.types.js';
import type { CardTraitEntry } from './state/cardTraits.types.js';
import type { MastermindState } from './mastermind/mastermind.types.js';
import type { SchemeState } from './scheme/schemeState.types.js';
import type { HookDefinition } from './rules/ruleHooks.types.js';
import type { HeroAbilityHook } from './rules/heroAbility.types.js';
import type { VillainAbilityHook } from './rules/villainAbility.types.js';
import type { NotableGameEvent } from './events/notableEvents.types.js';
import type { LobbyState } from './lobby/lobby.types.js';
import type { VillainDeckState, RevealedCardType } from './villainDeck/villainDeck.types.js';
import type { CityZone, HqZone } from './board/city.types.js';
import type { ScenarioScoringConfig } from './scoring/parScoring.types.js';
import type { UICardDisplay } from './ui/uiState.types.js';

// why: MatchConfiguration (WP-002) and MatchSetupConfig (WP-005A) have
// identical 9-field shapes. MatchSetupConfig in matchSetup.types.ts is now
// the canonical definition with full validation support. MatchConfiguration
// is retained as a type alias for backward compatibility with game.ts and
// existing tests. Both names refer to the same type. See DECISIONS.md for
// the consolidation rationale.

/**
 * Match configuration payload sent to boardgame.io Game.setup().
 *
 * This is a type alias for MatchSetupConfig — the canonical match setup
 * contract defined in matchSetup.types.ts. Both names are exported for
 * backward compatibility.
 *
 * All card references use ext_id strings from the card registry. Field names
 * are locked by 00.2 section 8.1 — do not rename, abbreviate, or reorder.
 */
export type MatchConfiguration = MatchSetupConfig;

// why: boardgame.io 0.50.x uses the string player-index convention
// ("0" | "1" | "2" | ... — the index of the seat within a match's
// playerOrder array) for every G-scoped player key. This alias names
// that convention without narrowing it — deliberately non-branded to
// avoid rippling into every test factory. A future WP may upgrade to
// `string & { readonly __brand: unique symbol }` or
// `` `${number}` `` if the ripple cost becomes justified.
export type PlayerId = string;

/**
 * Minimal setup-time context interface for deterministic operations.
 *
 * Captures what buildInitialGameState needs from the boardgame.io setup
 * context. Satisfied by the real boardgame.io context (via structural
 * typing) and by makeMockCtx (in tests).
 *
 * Defined locally to avoid importing boardgame.io in pure helpers.
 *
 * boardgame.io 0.50.x setup signature is:
 *   setup(context: { ctx: Ctx, random: RandomAPI, events, log }, setupData?)
 * The `ctx` sub-object carries match metadata (numPlayers, currentPlayer,
 * phase, turn). The `random` plugin API lives on the context itself, NOT
 * on ctx. This interface mirrors that nesting so that the real boardgame.io
 * context is structurally assignable without casting.
 */
export interface SetupContext {
  /** boardgame.io context metadata — numPlayers lives here, not at top level. */
  ctx: { numPlayers: number };
  /** Deterministic RNG provided by boardgame.io's random plugin. */
  random: { Shuffle: <T>(deck: T[]) => T[] };
}

/**
 * Resolved match selection metadata copied from the validated config.
 *
 * Stores the ext_id references for the scheme, mastermind, villain groups,
 * henchman groups, and hero decks selected for this match.
 */
export interface MatchSelection {
  /** Scheme ext_id selected for this match. */
  readonly schemeId: string;
  /** Mastermind ext_id selected for this match. */
  readonly mastermindId: string;
  /** Villain group ext_ids selected for this match. */
  readonly villainGroupIds: readonly string[];
  /** Henchman group ext_ids selected for this match. */
  readonly henchmanGroupIds: readonly string[];
  /** Hero deck ext_ids selected for this match. */
  readonly heroDeckIds: readonly string[];
}

/**
 * The shape of boardgame.io game state (G).
 *
 * Invariant: G must be JSON-serializable at all times. No functions, classes,
 * Maps, Sets, Dates, or Symbols may appear anywhere in this type or its
 * descendants.
 */
export interface LegendaryGameState {
  /** The match configuration used to set up this game. Immutable after setup. */
  readonly matchConfiguration: MatchConfiguration;

  // why: selection extracts the entity reference fields from matchConfiguration
  // for convenient read access. matchConfiguration is the full 9-field input;
  // selection holds just the scheme, mastermind, and group ext_ids.
  /** Resolved match selection metadata (scheme, mastermind, groups, heroes). */
  readonly selection: MatchSelection;

  // why: boardgame.io's ctx does not expose the inner turn stage in a form
  // that move functions can read. Storing currentStage in G makes it observable
  // to moves (for stage gating) and JSON-serializable (for replay and snapshots).
  // Reset to the first TURN_STAGES entry on each new turn by the play phase
  // onBegin hook.
  /** Current turn stage within the play phase (start, main, cleanup). */
  currentStage: TurnStage;

  // why: playerZones is keyed by player ID string (boardgame.io uses "0", "1",
  // etc.). Each player has exactly 5 zone arrays. Only deck is non-empty after
  // setup — cards enter other zones via moves only.
  /** Per-player card zones, keyed by player ID ("0", "1", ...). */
  playerZones: Record<PlayerId, PlayerZones>;

  // why: piles contains the shared global card piles sized from config count
  // fields. Each pile array contains CardExtId strings. Piles are consumed by
  // game moves (e.g., gaining a wound, rescuing a bystander).
  /** Shared global card piles (bystanders, wounds, officers, sidekicks). */
  piles: GlobalPiles;

  // why: messages is a deterministic event log that records rule effects,
  // warnings, and diagnostic entries. It is append-only during gameplay and
  // supports replay inspection and debugging.
  /** Deterministic event log populated by rule effects. */
  messages: string[];

  // why: counters tracks named numeric values used by endgame conditions and
  // scheme/mastermind rules. Counters are modified by modifyCounter effects
  // and read by evaluateEndgame.
  /** Named numeric counters for endgame conditions and rule tracking. */
  counters: Record<string, number>;

  // why: hookRegistry stores data-only HookDefinition entries that describe
  // which triggers each hook subscribes to and its execution priority. Handler
  // functions live in the ImplementationMap outside of G — they are never
  // stored here. This keeps G JSON-serializable.
  /** Data-only rule hook definitions (no functions). */
  hookRegistry: HookDefinition[];

  // why: classification stored at setup so moves never access registry at runtime.
  // G.villainDeckCardTypes maps each card in the villain deck to its
  // RevealedCardType. Populated by buildVillainDeck (WP-014B) at setup time;
  // revealVillainCard reads it in O(1) without registry access.
  /** Villain deck zone (deck + discard). */
  villainDeck: VillainDeckState;
  /** Card type classification for O(1) lookup during reveal. */
  villainDeckCardTypes: Record<CardExtId, RevealedCardType>;

  // why: City is a 5-space row where revealed villains and henchmen are placed
  // via pushVillainIntoCity. Cards shift rightward; space 4 is the escape edge.
  // Initialized to all nulls at setup; populated during play by revealVillainCard.
  /** City zone: 5 spaces for villain/henchman cards. */
  city: CityZone;

  // why: HQ is a 5-slot row for hero recruit cards. Populated at setup time
  // from the first 5 cards of the shuffled hero deck reservoir
  // (G.heroDeck) via fillHqFromDeck per WP-135. Refilled on each
  // successful recruitHero via refillHqSlot; empty-deck branch leaves the
  // vacated slot null per D-13503 (no auto-reshuffle).
  /** HQ zone: 5 hero recruit slots. */
  hq: HqZone;

  // why: WP-135 — sibling pattern with G.villainDeck.deck. CardExtId-strings-only
  // array seeded once at Game.setup() by buildHeroDeck (single ctx.random.Shuffle
  // call) from MatchSetupConfig.heroDeckIds and the locked rarity → copy-count
  // map (D-13501; 5/3/3/3 = 14 cards per hero across the four-label set
  // { 'Common 1', 'Common 2', 'Uncommon', 'Rare' }). The first 5 cards of the
  // shuffled reservoir populate G.hq; the remainder lives here. Front-popped on
  // every successful recruitHero (FIFO via shift through refillHqSlot). Closes
  // the WP-128 D-12806 safe-skip for decks.heroDeckCount projection — the count
  // graduates from the constant 0 to gameState.heroDeck.length.
  /** Shared hero deck reservoir (post-shuffle, post-HQ-fill remainder). */
  heroDeck: CardExtId[];

  // why: KO pile stores cards permanently removed from the game. Destination-only
  // zone — cards enter via koCard helper and never return in MVP. Initialized
  // empty at setup.
  /** Cards removed from the game (knocked out). Destination-only zone. */
  ko: CardExtId[];

  // why: attachedBystanders maps villains/henchmen in the City to their captured
  // bystanders. Plain Record (not Map) for JSON serializability. Entries are
  // created on City entry and removed on defeat (award) or escape (return to
  // supply). See D-1703.
  /** Bystanders attached to villains/henchmen currently in the City. */
  attachedBystanders: Record<CardExtId, CardExtId[]>;

  // why: mastermind state with identity, tactics deck, and defeated list.
  // Built at setup from registry data. tacticsDeck drawn from index 0;
  // tacticsDefeated append-only. All fields are CardExtId or CardExtId[].
  /** Mastermind state for boss fight resolution. */
  mastermind: MastermindState;

  // why: scheme runtime state holds the twist pile destination for resolved
  // scheme-twist cards. Separate from G.schemeSetupInstructions (D-2601).
  /** Scheme runtime state (twist pile for resolved scheme-twist cards). */
  scheme: SchemeState;

  // why: append-only destination pile for villains that escaped the City.
  // Top-level on G because CityZone is a fixed 5-tuple that cannot host
  // named fields. Order is chronological (insertion order); no reshuffle in MVP.
  /** Escaped villain cards — append-only, chronological. */
  escapedPile: CardExtId[];

  // why: per-turn attack/recruit point accumulation and spend tracking.
  // Reset at start of each player turn. Values are integers >= 0.
  /** Per-turn economy tracking (attack/recruit points accumulated and spent). */
  turnEconomy: TurnEconomy;

  // why: card stat values resolved at setup time from registry so moves
  // can look up attack, recruit, cost, and fightCost without registry
  // access — same pattern as G.villainDeckCardTypes (WP-014).
  // Read-only after setup.
  /** Card stat lookup keyed by CardExtId. Built at setup, read-only at runtime. */
  cardStats: Record<CardExtId, CardStatEntry>;

  // why: WP-179 — categorical traits (heroClass, team) resolved at setup time
  // from registry. Sibling snapshot to G.cardStats, G.cardKeywords,
  // G.cardDisplayData. Keyed by copy-suffixed CardExtId. Read-only at runtime.
  /** Card trait lookup keyed by CardExtId. Built at setup, read-only at runtime. */
  cardTraits: Record<CardExtId, CardTraitEntry>;

  // why: board keyword data resolved at setup time from registry so moves
  // never query registry at runtime — same setup-time resolution pattern as
  // G.cardStats and G.villainDeckCardTypes. No runtime registry access.
  /** Board keywords for villain/henchman cards. Built at setup, read-only at runtime. */
  cardKeywords: Record<CardExtId, BoardKeyword[]>;

  // why: WP-111 / EC-118 sibling snapshot to G.cardStats (WP-018),
  // G.villainDeckCardTypes (WP-014B), and G.cardKeywords (WP-025). Built
  // once at setup from the registry; surfaced through buildUIState as
  // additive `display` / `slotDisplay?` / `handDisplay?` fields on
  // UICityCard / UIHQState / UIPlayerState / UIMastermindState. The
  // Readonly<...> wrapper is a documentational signal at the type
  // boundary — TypeScript does not enforce runtime immutability for
  // Record values, but the type signal makes accidental writes
  // grep-able in review. Read only by uiState.build.ts; gameplay reads
  // G.cardStats (presentation-vs-gameplay separation lock).
  /**
   * Card display data lookup keyed by CardExtId. Built at setup,
   * read-only at runtime, projected through UIState. Sourced from the
   * registry once at Game.setup(); never queried at runtime.
   */
  cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>;

  // why: scheme instructions follow the "Representation Before Execution"
  // decision (D-2601). Stored for replay observability. Empty at MVP until
  // structured metadata exists in the registry.
  /**
   * Scheme setup instructions applied during Game.setup().
   *
   * Stores the instruction list (empty at MVP until structured metadata
   * exists) for replay observability. Setup-only — never modified after
   * initial construction.
   */
  schemeSetupInstructions: SchemeSetupInstruction[];

  // why: hero ability hooks are built at setup time and immutable during
  // gameplay. Data-only — no functions or closures. Execution is WP-022+.
  /** Hero ability hook declarations (data-only, inert in WP-021). */
  heroAbilityHooks: HeroAbilityHook[];

  // why: villain/henchman ability hooks built from registry at setup time —
  // same pattern as heroAbilityHooks/hookRegistry/cardStats. Data-only,
  // immutable during gameplay; executed at the Fight/Ambush fire sites by
  // villainEffects.execute.ts (WP-185).
  /** Villain/henchman ability hook declarations (data-only). */
  villainAbilityHooks: Readonly<VillainAbilityHook[]>;

  // why: WP-200 — append-only structured event log emitted at four fire
  // sites (fightVillain.ts, villainDeck.reveal.ts ambush branch,
  // schemeTwistResolvers.ts × 5 resolvers, mastermindHandlers.ts). Each
  // entry is a JSON-serialisable NotableGameEvent (discriminated union —
  // see events/notableEvents.types.ts). Append-only via `.push(...)` —
  // never spliced, reassigned, sorted, or mutated. Replay determinism: same
  // setup + same moves produces a byte-identical sequence. Projected
  // through UIState.notableEvents so the arena client (WP-201) renders
  // descriptive "what happened" overlays without parsing G.messages
  // strings. Empty array initialiser lives in
  // setup/buildInitialGameState.ts.
  /** Append-only typed event log for player-visible outcomes (WP-200). */
  notableEvents: NotableGameEvent[];

  // why: lobby state is stored in G so the UI can observe lobby completion
  // and readiness status. Initialized at setup time from ctx.numPlayers.
  /** Lobby phase state (player readiness and match start flag). */
  lobby: LobbyState;

  // why: runtime-only — never persisted (see ARCHITECTURE.md Section 3); its
  // presence marks the match as PAR-scored for future `buildUIState` gating
  // once D-6701's follow-up WP lands. WP-067 adds the field; WP-048
  // explicitly deferred it per D-4802.
  /** Optional setup-time scoring config; presence marks the match as PAR-scored. */
  readonly activeScoringConfig?: ScenarioScoringConfig;
}

// why: PAR artifact storage types (WP-050) ship the immutable artifact +
// index layer. Pure types and the error class live in par.storage.ts.
// Re-exported here so consumers importing from './types.js' have access to
// the full PAR storage surface.
export type {
  ParArtifactSource,
  SeedParArtifact,
  SimulationParArtifact,
  ParArtifact,
  ParResolution,
  ParIndex,
  ParStorageConfig,
  ParStoreValidationResult,
  ParStoreValidationError,
  ParCoverageResult,
} from './simulation/par.storage.js';
