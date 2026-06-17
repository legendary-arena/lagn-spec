export {
  LegendaryGame,
  setRegistryForSetup,
  clearRegistryForSetup,
} from "./game.js";
export type {
  MatchConfiguration,
  LegendaryGameState,
  CardExtId,
  SetupContext,
  PlayerZones,
  GlobalPiles,
  MatchSelection,
  PendingKoHeroChoice,
} from "./types.js";
export type {
  Zone,
  PlayerState,
  ZoneValidationError,
  GameStateShape,
} from "./state/zones.types.js";
export type {
  MatchSetupConfig,
  MatchSetupError,
  ValidateMatchSetupResult,
} from "./matchSetup.types.js";
export { validateMatchSetup } from "./matchSetup.validate.js";
export type { CardRegistryReader } from "./matchSetup.validate.js";
export { buildInitialGameState } from "./setup/buildInitialGameState.js";
export {
  SHIELD_AGENT_EXT_ID,
  SHIELD_TROOPER_EXT_ID,
  BYSTANDER_EXT_ID,
  WOUND_EXT_ID,
  SHIELD_OFFICER_EXT_ID,
  SIDEKICK_EXT_ID,
} from "./setup/buildInitialGameState.js";
export { shuffleDeck } from "./setup/shuffle.js";
export type { ShuffleProvider } from "./setup/shuffle.js";
export {
  validateGameStateShape,
  validatePlayerStateShape,
} from "./state/zones.validate.js";
export type {
  MatchPhase,
  TurnStage,
  TurnPhaseError,
} from "./turn/turnPhases.types.js";
export { MATCH_PHASES, TURN_STAGES } from "./turn/turnPhases.types.js";
export {
  getNextTurnStage,
  isValidTurnStageTransition,
  isValidMatchPhase,
  isValidTurnStage,
} from "./turn/turnPhases.logic.js";
export { validateTurnStageTransition } from "./turn/turnPhases.validate.js";
export { advanceTurnStage } from "./turn/turnLoop.js";
export type { TurnLoopContext, TurnLoopState } from "./turn/turnLoop.js";
export type {
  CoreMoveName,
  DrawCardsArgs,
  PlayCardArgs,
  EndTurnArgs,
  MoveError,
  MoveResult,
} from "./moves/coreMoves.types.js";
export { CORE_MOVE_NAMES } from "./moves/coreMoves.types.js";
export {
  MOVE_ALLOWED_STAGES,
  isMoveAllowedInStage,
} from "./moves/coreMoves.gating.js";
export {
  validateDrawCardsArgs,
  validatePlayCardArgs,
  validateEndTurnArgs,
  validateMoveAllowedInStage,
} from "./moves/coreMoves.validate.js";
export { moveCardFromZone, moveAllCards } from "./moves/zoneOps.js";
export type { MoveCardResult, MoveAllResult } from "./moves/zoneOps.js";
export type {
  RuleTriggerName,
  RuleEffect,
  HookDefinition,
  HookRegistry,
  OnTurnStartPayload,
  OnTurnEndPayload,
  OnCardRevealedPayload,
  OnSchemeTwistRevealedPayload,
  OnMastermindStrikeRevealedPayload,
  TriggerPayloadMap,
} from "./rules/ruleHooks.types.js";
export {
  RULE_TRIGGER_NAMES,
  RULE_EFFECT_TYPES,
} from "./rules/ruleHooks.types.js";
export {
  validateTriggerPayload,
  validateRuleEffect,
  validateHookDefinition,
} from "./rules/ruleHooks.validate.js";
export {
  createHookRegistry,
  getHooksForTrigger,
} from "./rules/ruleHooks.registry.js";
export type { ImplementationMap } from "./rules/ruleRuntime.execute.js";
export { executeRuleHooks } from "./rules/ruleRuntime.execute.js";
export { applyRuleEffects } from "./rules/ruleRuntime.effects.js";
export { buildDefaultHookDefinitions } from "./rules/ruleRuntime.impl.js";
export { schemeTwistHandler } from "./rules/schemeHandlers.js";
export { mastermindStrikeHandler } from "./rules/mastermindHandlers.js";
export type { EndgameResult, EndgameOutcome } from "./endgame/endgame.types.js";
export { ENDGAME_CONDITIONS, ESCAPE_LIMIT } from "./endgame/endgame.types.js";
export { evaluateEndgame } from "./endgame/endgame.evaluate.js";
export type { LobbyState, SetPlayerReadyArgs } from "./lobby/lobby.types.js";
export {
  validateSetPlayerReadyArgs,
  validateCanStartMatch,
} from "./lobby/lobby.validate.js";
export type {
  MatchSnapshot,
  MatchSnapshotPlayer,
  MatchSnapshotOutcome,
  PersistableMatchConfig,
} from "./persistence/persistence.types.js";
export { PERSISTENCE_CLASSES } from "./persistence/persistence.types.js";
export type {
  VillainDeckState,
  RevealedCardType,
} from "./villainDeck/villainDeck.types.js";
export { REVEALED_CARD_TYPES } from "./villainDeck/villainDeck.types.js";
export { revealVillainCard } from "./villainDeck/villainDeck.reveal.js";
export { fightVillain } from "./moves/fightVillain.js";
export { recruitHero } from "./moves/recruitHero.js";
export { buildVillainDeck } from "./villainDeck/villainDeck.setup.js";
export type { VillainDeckRegistryReader } from "./villainDeck/villainDeck.setup.js";
export type {
  CityZone,
  CitySpace,
  HqZone,
  HqSlot,
} from "./board/city.types.js";
export {
  pushVillainIntoCity,
  initializeCity,
  initializeHq,
  fillHqFromDeck,
  refillHqSlot,
} from "./board/city.logic.js";
export type {
  PushVillainResult,
  FillHqFromDeckResult,
  RefillHqSlotResult,
} from "./board/city.logic.js";
export {
  buildHeroDeck,
  buildHeroDeckCards,
  shuffleHeroDeck,
} from "./setup/buildHeroDeck.js";
export type { RegistryReader as HeroDeckRegistryReader } from "./setup/buildHeroDeck.js";
export { validateCityShape } from "./board/city.validate.js";
export type { ValidateCityShapeResult } from "./board/city.validate.js";
export { koCard } from "./board/ko.logic.js";
export { gainWound } from "./board/wounds.logic.js";
export type { GainWoundResult } from "./board/wounds.logic.js";
export {
  attachBystanderToVillain,
  awardAttachedBystanders,
  resolveEscapedBystanders,
} from "./board/bystanders.logic.js";
export type {
  AttachBystanderResult,
  AwardBystandersResult,
  ResolveEscapedBystandersResult,
} from "./board/bystanders.logic.js";
export { computeFinalScores } from "./scoring/scoring.logic.js";
export type {
  FinalScoreSummary,
  PlayerScoreBreakdown,
} from "./scoring/scoring.types.js";
export {
  VP_VILLAIN,
  VP_HENCHMAN,
  VP_BYSTANDER,
  VP_TACTIC,
  VP_WOUND,
} from "./scoring/scoring.types.js";

// PAR scenario scoring (WP-048)
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
} from "./scoring/parScoring.types.js";
export { PENALTY_EVENT_TYPES } from "./scoring/parScoring.types.js";
export { buildScenarioKey, buildTeamKey } from "./scoring/parScoring.keys.js";
export {
  deriveScoringInputs,
  computeRawScore,
  computeParScore,
  computeFinalScore,
  buildScoreBreakdown,
  validateScoringConfig,
} from "./scoring/parScoring.logic.js";

// why: scoringConfigLoader value exports were moved to the Setup-Tooling
// Surface under WP-144 / D-14401 (subpath `./setup` = src/setup-tooling/index.ts).
// Importers reach them via `@legendary-arena/game-engine/setup`. arena-client
// never imports from `/setup`; apps/server is the sole sanctioned consumer.
export type { MastermindState } from "./mastermind/mastermind.types.js";
export { buildMastermindState } from "./mastermind/mastermind.setup.js";
export {
  defeatTopTactic,
  areAllTacticsDefeated,
} from "./mastermind/mastermind.logic.js";
export { fightMastermind } from "./moves/fightMastermind.js";
export type { TurnEconomy, CardStatEntry } from "./economy/economy.types.js";
export type {
  HeroAbilityHook,
  HeroCondition,
  HeroEffectDescriptor,
} from "./rules/heroAbility.types.js";
export type { HeroKeyword, HeroAbilityTiming } from "./rules/heroKeywords.js";
export { HERO_KEYWORDS, HERO_ABILITY_TIMINGS } from "./rules/heroKeywords.js";
export {
  filterHooksByTiming,
  filterHooksByKeyword,
  getHooksForCard,
} from "./rules/heroAbility.types.js";
export { buildHeroAbilityHooks } from "./setup/heroAbility.setup.js";
export type { HeroEffectResult } from "./hero/heroEffects.types.js";
export { executeHeroEffects } from "./hero/heroEffects.execute.js";
export {
  evaluateCondition,
  evaluateAllConditions,
} from "./hero/heroConditions.evaluate.js";
export {
  parseCardStatValue,
  buildCardStats,
  getAvailableAttack,
  getAvailableRecruit,
  addResources,
  spendAttack,
  spendRecruit,
  resetTurnEconomy,
} from "./economy/economy.logic.js";
export type {
  CardStatsRegistryReader,
  CardStatsFlatCard,
} from "./economy/economy.logic.js";
export { createSnapshot } from "./persistence/snapshot.create.js";
export type { SnapshotContext } from "./persistence/snapshot.create.js";
export { validateSnapshotShape } from "./persistence/snapshot.validate.js";
export type { BoardKeyword } from "./board/boardKeywords.types.js";
export { BOARD_KEYWORDS } from "./board/boardKeywords.types.js";
export { buildCardKeywords } from "./setup/buildCardKeywords.js";
export { buildSchemeSetupInstructions } from "./setup/buildSchemeSetupInstructions.js";
export { executeSchemeSetup } from "./scheme/schemeSetup.execute.js";
export type {
  SchemeSetupInstruction,
  SchemeSetupType,
} from "./scheme/schemeSetup.types.js";
export { SCHEME_SETUP_TYPES } from "./scheme/schemeSetup.types.js";
export {
  getPatrolModifier,
  isGuardBlocking,
  hasAmbush,
} from "./board/boardKeywords.logic.js";

// Replay harness (WP-027)
export type {
  ReplayInput,
  ReplayMove,
  ReplayResult,
} from "./replay/replay.types.js";
export { replayGame } from "./replay/replay.execute.js";
export { computeStateHash } from "./replay/replay.hash.js";
export { verifyDeterminism } from "./replay/replay.verify.js";
export type { DeterminismResult } from "./replay/replay.verify.js";
export { applyReplayStep } from "./replay/replay.execute.js";

// Replay snapshot sequence (WP-063)
export type {
  ReplaySnapshotSequence,
  ReplayInputsFile,
} from "./replay/replaySnapshot.types.js";
export type { BuildSnapshotSequenceParams } from "./replay/buildSnapshotSequence.js";
export { buildSnapshotSequence } from "./replay/buildSnapshotSequence.js";

// UI state contract (WP-028; progress + PAR breakdown added WP-067)
// why: WP-166 / D-16502 — the six sub-types below complete the WP-128 UI
// projection surface the client consumes. They were authored in WP-128 on
// uiState.types.ts and made required on UIState (decks/piles/koPile), but
// never published from this barrel, so arena-client could not import them by
// name and vue-tsc went red. Additive, type-only re-export — no value export.
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
  UIProgressCounters,
  UIParBreakdown,
  UICardDisplay,
  UIHQCard,
  UIDisplayEntry,
  UIDecksState,
  UISharedPilesState,
  UIKoPileState,
  UIPendingHeroChoice,
  UIPendingKoHeroChoice,
  UIPendingOptionalKoReward,
  UIEligibleKoHeroCard,
} from "./ui/uiState.types.js";
// why: WP-258 / D-16502 — the arena-client HollowEffectsPanel imports BOTH
// HollowEffectRecord (UIState.hollowEffects element type) AND EffectExecutionReason
// (the panel renders the `reason` field). Both MUST be re-exported from this
// barrel by name or vue-tsc goes red (the barrel-publish gap, same class as the
// WP-166 UI sub-types above). Additive, type-only re-export — no value export.
export type {
  HollowEffectRecord,
  EffectExecutionReason,
} from "./diagnostics/hollowEffect.types.js";
export { buildUIState } from "./ui/uiState.build.js";

// Audience & filter (WP-029)
export type { UIAudience } from "./ui/uiAudience.types.js";
export { filterUIStateForAudience } from "./ui/uiState.filter.js";

// Campaign / scenario framework (WP-030)
export type {
  ScenarioOutcome,
  ScenarioOutcomeCondition,
  ScenarioReward,
  ScenarioDefinition,
  CampaignUnlockRule,
  CampaignDefinition,
  CampaignState,
} from "./campaign/campaign.types.js";
export {
  applyScenarioOverrides,
  evaluateScenarioOutcome,
  advanceCampaignState,
} from "./campaign/campaign.logic.js";

// WP-031 invariant API
export {
  assertInvariant,
  InvariantViolationError,
} from "./invariants/assertInvariant.js";
export { runAllInvariantChecks } from "./invariants/runAllChecks.js";
export {
  checkCitySize,
  checkZoneArrayTypes,
  checkCountersAreFinite,
  checkGIsSerializable,
} from "./invariants/structural.checks.js";
export {
  checkNoCardInMultipleZones,
  checkZoneCountsNonNegative,
  checkCountersUseConstants,
} from "./invariants/gameRules.checks.js";
export {
  checkNoFunctionsInG,
  checkSerializationRoundtrip,
} from "./invariants/determinism.checks.js";
export {
  checkValidPhase,
  checkValidStage,
  checkTurnCounterMonotonic,
} from "./invariants/lifecycle.checks.js";
export type {
  InvariantCategory,
  InvariantViolation,
  InvariantCheckContext,
} from "./invariants/invariants.types.js";
export { INVARIANT_CATEGORIES } from "./invariants/invariants.types.js";

// Network intent validation (WP-032)
export type {
  ClientTurnIntent,
  IntentValidationResult,
  IntentRejectionCode,
  IntentValidationContext,
} from "./network/intent.types.js";
export { validateIntent } from "./network/intent.validate.js";
export { detectDesync } from "./network/desync.detect.js";

// Content authoring toolkit (WP-033)
export {
  validateContent,
  validateContentBatch,
} from "./content/content.validate.js";
export type {
  ContentValidationResult,
  ContentValidationError,
  ContentValidationContext,
} from "./content/content.validate.js";

// Versioning & save migration strategy (WP-034 / D-3401)
export type {
  EngineVersion,
  DataVersion,
  ContentVersion,
  VersionedArtifact,
  CompatibilityStatus,
  CompatibilityResult,
} from "./versioning/versioning.types.js";
export {
  CURRENT_DATA_VERSION,
  checkCompatibility,
  formatEngineVersion,
  getCurrentEngineVersion,
} from "./versioning/versioning.check.js";
export type {
  MigrationKey,
  MigrationFn,
} from "./versioning/versioning.migrate.js";
export {
  migrateArtifact,
  migrationRegistry,
} from "./versioning/versioning.migrate.js";
export { stampArtifact } from "./versioning/versioning.stamp.js";

// Ops metadata (WP-035 / D-3501)
export type {
  OpsCounters,
  DeploymentEnvironment,
  IncidentSeverity,
} from "./ops/ops.types.js";

// AI playtesting & balance simulation framework (WP-036 / D-3601)
export type {
  AIPolicy,
  LegalMove,
  SimulationConfig,
  SimulationResult,
} from "./simulation/ai.types.js";
export { createRandomPolicy } from "./simulation/ai.random.js";
export { getLegalMoves } from "./simulation/ai.legalMoves.js";
export type { SimulationLifecycleContext } from "./simulation/ai.legalMoves.js";
export { runSimulation } from "./simulation/simulation.runner.js";

// PAR simulation engine (WP-049 / D-4901+)
export { createCompetentHeuristicPolicy } from "./simulation/ai.competent.js";
export {
  aggregateParFromSimulation,
  generateScenarioPar,
  validateParResult,
  validateTierOrdering,
  generateSeedSet,
  computeSeedSetHash,
  ParAggregationError,
  PAR_PERCENTILE_DEFAULT,
  PAR_MIN_SAMPLE_SIZE,
  IQR_THRESHOLD,
  STDEV_THRESHOLD,
  MULTIMODALITY_BIN_COUNT,
} from "./simulation/par.aggregator.js";
export type {
  ParSimulationConfig,
  ParSimulationResult,
  ParValidationIssue,
  ParValidationSeverity,
  ParValidationResult,
  TierOrderingResult,
  ParAggregationErrorCode,
} from "./simulation/par.aggregator.js";
export {
  AI_POLICY_TIERS,
  AI_POLICY_TIER_DEFINITIONS,
} from "./simulation/ai.tiers.js";
export type {
  AIPolicyTier,
  AIPolicyTierDefinition,
} from "./simulation/ai.tiers.js";

// Sweep setup-matrix runner + manifest anomaly oracle (WP-194 / WP-195;
// barrel-exposed under WP-209 so apps/server can import the closed
// SweepAnomalyClass taxonomy + classifier without deep-importing dist/).
// Both modules are pure (no node:* imports, no IO, no Math.random); safe
// to keep on the Runtime-Safe Engine Surface per D-14401.
export type {
  SweepAnomalyClass,
  ParsedSuccessRecord,
  ParsedFatalRecord,
  ParsedManifestRecord,
  ClassifiedCell,
  NumericDistributionStats,
  FatalErrorBucket,
  MalformedLine,
  ManifestSummary,
  ManifestClassification,
  ParseRecordResult,
} from "./simulation/sweep.analyze.js";
export {
  SWEEP_ANOMALY_CLASSES,
  parseManifestLine,
  classifyManifestRecords,
} from "./simulation/sweep.analyze.js";

// Beta metadata (WP-037 / D-3701)
export type {
  BetaFeedback,
  BetaCohort,
  FeedbackCategory,
} from "./beta/beta.types.js";

// Governance metadata (WP-040 / D-4001)
export type {
  ChangeCategory,
  ChangeBudget,
  ChangeClassification,
} from "./governance/governance.types.js";

// why: par.storage value exports were moved to the Setup-Tooling Surface
// under WP-144 / D-14401 (subpath `./setup` = src/setup-tooling/index.ts).
// Importers reach them via `@legendary-arena/game-engine/setup`. arena-client
// never imports from `/setup`; apps/server is the sole sanctioned consumer.
// The pure-type re-exports below stay in the runtime barrel — they are
// compile-time-only and produce no runtime imports.
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
} from "./simulation/par.storage.js";
