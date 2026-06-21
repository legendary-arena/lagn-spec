/**
 * PAR aggregation pipeline for the Legendary Arena balance simulation
 * framework (WP-049).
 *
 * Implements Phase 2 (Simulation Calibration) of the three-phase PAR
 * derivation pipeline described in docs/12-SCORING-REFERENCE.md. The
 * aggregator runs the Competent Heuristic (T2) policy against a scenario
 * for a canonical seed set, collects Raw Scores via WP-048's
 * computeRawScore, and aggregates the distribution into an integer PAR
 * value using the 55th-percentile nearest-rank method.
 *
 * Exports:
 *   - Types: ParSimulationConfig, ParSimulationResult, ParValidationIssue,
 *     ParValidationSeverity, ParValidationResult, TierOrderingResult,
 *     ParAggregationErrorCode
 *   - Error class: ParAggregationError
 *   - Constants: PAR_PERCENTILE_DEFAULT, PAR_MIN_SAMPLE_SIZE,
 *     IQR_THRESHOLD, STDEV_THRESHOLD, MULTIMODALITY_BIN_COUNT
 *   - Functions: aggregateParFromSimulation, generateSeedSet,
 *     computeSeedSetHash, generateScenarioPar, validateParResult,
 *     validateTierOrdering
 *
 * No boardgame.io imports. No @legendary-arena/registry imports. No
 * Math.random(). No .reduce() with branching. No IO other than the locked
 * `new Date().toISOString()` fallback when config.generatedAtOverride is
 * absent. Replicates the WP-036 simulation.runner.ts per-game loop using
 * only engine primitives — does not call runSimulation because
 * SimulationResult aggregates averages rather than exposing the terminal
 * game state the PAR pipeline needs.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type {
  ScenarioKey,
  ScenarioScoringConfig,
  ScoringInputs,
  PenaltyEventType,
} from '../scoring/parScoring.types.js';
import type { UIState } from '../ui/uiState.types.js';
import type { ClientTurnIntent } from '../network/intent.types.js';

import type { AIPolicy, LegalMove } from './ai.types.js';
import type { SimulationLifecycleContext } from './ai.legalMoves.js';
import type { AIPolicyTier } from './ai.tiers.js';

import { getLegalMoves } from './ai.legalMoves.js';
import { createCompetentHeuristicPolicy } from './ai.competent.js';

import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { buildUIState } from '../ui/uiState.build.js';
import { filterUIStateForAudience } from '../ui/uiState.filter.js';
import { evaluateEndgame } from '../endgame/endgame.evaluate.js';
import { computeFinalScores } from '../scoring/scoring.logic.js';
import { computeRawScore, computeParScore } from '../scoring/parScoring.logic.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';
import { resetTurnEconomy } from '../economy/economy.logic.js';
import { applyOnBeginParity } from './onBeginParity.js';
import { advanceTurnStage } from '../turn/turnLoop.js';

// why: move function imports mirror the WP-036 runner (D-2705 static
// MOVE_MAP + D-2801 local structural interface). These files import
// boardgame.io types internally, but this file does not import
// boardgame.io directly — the layer-boundary grep gate verifies it.
import { drawCards, playCard, endTurn } from '../moves/coreMoves.impl.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import { fightVillain } from '../moves/fightVillain.js';
import { recruitHero } from '../moves/recruitHero.js';
import { fightMastermind } from '../moves/fightMastermind.js';

// ---------------------------------------------------------------------------
// Exported constants.
// ---------------------------------------------------------------------------

/** Default PAR percentile. Configurable range is [50, 60] inclusive. */
export const PAR_PERCENTILE_DEFAULT: number = 55;

/**
 * Minimum sample size enforced by validateParResult.
 *
 * generateScenarioPar does NOT enforce this — callers can bootstrap with
 * fewer runs during testing — validateParResult is the enforcement point
 * so a seeded 10-run smoke test can still produce a ParSimulationResult
 * for inspection.
 */
export const PAR_MIN_SAMPLE_SIZE: number = 500;

// why: IQR_THRESHOLD and STDEV_THRESHOLD are module-level deterministic
// constants — never configuration inputs — so that needsMoreSamples has a
// single authoritative definition. Values are centesimal units matching
// the Raw Score scale (which is already in centesimal-weighted integer
// units per WP-048 ScoringWeights). Chosen to be loose enough that a
// healthy ±20% distribution at Raw Score ~5000 does not flag, and tight
// enough that a bimodal distribution with IQR ~3000 does flag.

/** IQR threshold above which needsMoreSamples is set. */
export const IQR_THRESHOLD: number = 2000;

/** Standard-deviation threshold above which needsMoreSamples is set. */
export const STDEV_THRESHOLD: number = 1500;

/** Fixed histogram bin count for the multimodality smell test. */
export const MULTIMODALITY_BIN_COUNT: number = 20;

// why: minimum 55-percentile-specific rank index is derivable from
// PAR_PERCENTILE_DEFAULT + simulationCount, so no constant is exported.

// ---------------------------------------------------------------------------
// Exported types.
// ---------------------------------------------------------------------------

/**
 * The full PAR simulation configuration.
 *
 * simulationPolicyVersion + scoringConfigVersion are explicit provenance
 * inputs copied verbatim into the result. generatedAtOverride is optional
 * and exists solely to make reproducibility tests deterministic; in
 * production callers omit it so the result carries a true wall-clock
 * generation timestamp.
 */
export interface ParSimulationConfig {
  /** Canonical scenario identity key. */
  readonly scenarioKey: ScenarioKey;
  /** The 9-field setup config for every simulated game. */
  readonly setupConfig: MatchSetupConfig;
  /** Number of players the setup supports. */
  readonly playerCount: number;
  /** How many games to simulate; 500+ recommended per validateParResult. */
  readonly simulationCount: number;
  /** Base seed for deterministic seed-set derivation. */
  readonly baseSeed: string;
  /** Percentile to report; default 55, allowed [50, 60] inclusive. */
  readonly percentile: number;
  /** Scenario scoring config consumed by computeRawScore per-run. */
  readonly scoringConfig: ScenarioScoringConfig;
  /** Simulation policy version pin, e.g. 'CompetentHeuristic/v1'. */
  readonly simulationPolicyVersion: string;
  /** Scoring config version pin, copied verbatim into the result. */
  readonly scoringConfigVersion: number;
  /** Optional ISO timestamp override for reproducibility tests. */
  readonly generatedAtOverride?: string;
}

/**
 * Completed PAR simulation result.
 *
 * Every field is JSON-serializable and survives
 * JSON.parse(JSON.stringify(result)) with structural equality. Field
 * names are load-bearing — WP-050 pins them as the artifact schema.
 */
export interface ParSimulationResult {
  /** Canonical scenario identity key. */
  readonly scenarioKey: ScenarioKey;
  /** Integer PAR in Raw Score units (no float interpolation). */
  readonly parValue: number;
  /** Percentile reported (copied from config.percentile). */
  readonly percentileUsed: number;
  /** Sample size (equal to config.simulationCount — no seed is silently dropped). */
  readonly sampleSize: number;
  /** Canonical hash of the seed list used. */
  readonly seedSetHash: string;
  /** Summary statistics of the sorted-ascending Raw Score distribution. */
  readonly rawScoreDistribution: {
    readonly min: number;
    readonly p25: number;
    readonly median: number;
    readonly p55: number;
    readonly p75: number;
    readonly max: number;
    readonly standardDeviation: number;
    /** p75 - p25. */
    readonly interquartileRange: number;
  };
  /** True when IQR or stddev exceeds the module-level threshold. */
  readonly needsMoreSamples: boolean;
  /** parValue minus the seed PAR (computeParScore) for drift detection. */
  readonly seedParDelta: number;
  /** Simulation policy version pin, copied verbatim from config. */
  readonly simulationPolicyVersion: string;
  /** Scoring config version pin, copied verbatim from config. */
  readonly scoringConfigVersion: number;
  /** ISO timestamp; config.generatedAtOverride ?? new Date().toISOString(). */
  readonly generatedAt: string;
}

/** Severity flag for a single ParValidationResult issue. */
export type ParValidationSeverity = 'error' | 'warn';

/**
 * Single validation issue.
 *
 * `code` is a stable short string for programmatic dispatch; `message`
 * is a full sentence suitable for direct rendering (code-style Rule 11).
 */
export interface ParValidationIssue {
  readonly severity: ParValidationSeverity;
  readonly code: string;
  readonly message: string;
}

/**
 * Structured validation result.
 *
 * `valid` is false whenever any issue has severity 'error'. A lone
 * 'warn' (e.g., multimodality-suspicion flag) does NOT invalidate the
 * result but is still surfaced so publication workflows can decide how
 * to handle it.
 */
export interface ParValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ParValidationIssue[];
}

/**
 * Structured tier-ordering result.
 *
 * `passed` is true only when median(T3) < median(T2) < median(T1) <
 * median(T0) holds (lower Raw Score = stronger play).
 */
export interface TierOrderingResult {
  readonly passed: boolean;
  readonly medians: Readonly<Record<AIPolicyTier, number>>;
  readonly violations: readonly string[];
}

/**
 * Discriminated failure codes for ParAggregationError.
 *
 * // why: discriminated codes keep failure handling exhaustive and
 * survive JSON.stringify(error) as a readable name + code pair, which
 * matters because callers test `instanceof ParAggregationError` AND
 * `.code` — never by message substring.
 */
export type ParAggregationErrorCode =
  | 'EMPTY_DISTRIBUTION'
  | 'PERCENTILE_OUT_OF_RANGE';

/**
 * Typed error thrown by aggregateParFromSimulation for structural input
 * violations. generateScenarioPar propagates these without wrapping.
 *
 * Error messages are full sentences per code-style Rule 11.
 */
export class ParAggregationError extends Error {
  /** Static name for JSON round-trip debuggability. */
  readonly name = 'ParAggregationError';
  /** Discriminated failure code. */
  readonly code: ParAggregationErrorCode;

  constructor(code: ParAggregationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Internal PRNG helpers — duplicated per WP-036 Scope Lock (RS-10).
// ---------------------------------------------------------------------------

// why: RS-10 forbids importing from simulation.runner.ts because
// WP-036's internal helpers are not exported and the WP-036 contract is
// immutable. Duplicating ~20 lines keeps the aggregator self-contained
// and preserves the two-domain PRNG invariant (D-3604).

/**
 * Deterministic 32-bit seed for mulberry32 derived from a string via djb2.
 */
function hashSeedString(seed: string): number {
  let hash = 5381;
  for (const character of seed) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

/**
 * Creates a deterministic mulberry32 PRNG bound to the given 32-bit seed.
 */
function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let accumulator = state;
    accumulator = Math.imul(accumulator ^ (accumulator >>> 15), accumulator | 1);
    accumulator ^= accumulator + Math.imul(accumulator ^ (accumulator >>> 7), accumulator | 61);
    return ((accumulator ^ (accumulator >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by the supplied PRNG. Returns a new array.
 */
function shuffleWithPrng<T>(deck: T[], nextRandom: () => number): T[] {
  const result = [...deck];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(nextRandom() * (index + 1));
    const current = result[index]!;
    const other = result[swap]!;
    result[index] = other;
    result[swap] = current;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Seed set canonicalization.
// ---------------------------------------------------------------------------

/**
 * Derives a deterministic, order-stable list of seed strings from a base
 * seed.
 *
 * // why: canonical seed sets make PAR reproducibility auditable. Same
 * baseSeed + same count always yields the same array; independent index
 * derivation means reordering the array is impossible.
 *
 * @param baseSeed - Caller-supplied base seed.
 * @param count - How many seeds to derive. count <= 0 returns [].
 * @returns Array of seed strings of length max(0, count).
 */
export function generateSeedSet(baseSeed: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  const seeds: string[] = [];
  for (let index = 0; index < count; index++) {
    const derived = hashSeedString(`${baseSeed}:${index}`);
    seeds.push(`${baseSeed}-${index}-${derived}`);
  }
  return seeds;
}

/**
 * Computes a stable, order-sensitive hash of a seed list.
 *
 * // why: seedSetHash is stored in ParSimulationResult so downstream
 * auditors can prove which seeds produced a given PAR. djb2 over the
 * joined array is sufficient — no crypto library in simulation (D-3601).
 * Order-sensitive: reordering the array changes the hash.
 *
 * @param seeds - Seed array (any length). Not mutated.
 * @returns Hex-style 32-bit djb2 hash string.
 */
export function computeSeedSetHash(seeds: string[]): string {
  const joined = seeds.join('|');
  const hash = hashSeedString(joined);
  return `djb2-${hash.toString(16)}`;
}

// ---------------------------------------------------------------------------
// Aggregator move context — local structural interface per D-2801.
// ---------------------------------------------------------------------------

// why: move functions destructure FnContext<LegendaryGameState> & {
// playerID } from boardgame.io. Simulation cannot import boardgame.io
// (D-3601 engine-category rule). A local five-field structural interface
// provides the minimum surface moves actually destructure — same shape
// as SimulationMoveContext in simulation.runner.ts. Duplicated (not
// imported) per RS-10.

interface AggregatorMoveContext {
  readonly G: LegendaryGameState;
  readonly playerID: string;
  readonly ctx: {
    readonly phase: string;
    readonly turn: number;
    readonly currentPlayer: string;
    readonly numPlayers: number;
  };
  readonly events: {
    setPhase: (name: string) => void;
    endTurn: () => void;
  };
  readonly random: {
    Shuffle: <T>(deck: T[]) => T[];
  };
}

/** Move function type for the aggregator move map. */
type MoveFn = (context: AggregatorMoveContext, args?: unknown) => void;

/**
 * Wraps advanceTurnStage for the aggregator MOVE_MAP dispatch slot.
 */
function aggregatorAdvanceStage(context: AggregatorMoveContext): void {
  advanceTurnStage(context.G, { events: { endTurn: context.events.endTurn } });
}

/**
 * Static dispatch map from simulation move names to move functions.
 *
 * Every play-phase move enumerated by getLegalMoves has an entry. Lobby
 * moves are omitted — the aggregator starts post-lobby via
 * buildInitialGameState + an externally tracked phase === 'play'.
 */
const MOVE_MAP: Record<string, MoveFn> = {
  drawCards: (context, args) => drawCards(context as never, args as never),
  playCard: (context, args) => playCard(context as never, args as never),
  endTurn: (context) => endTurn(context as never),
  advanceStage: (context) => aggregatorAdvanceStage(context),
  revealVillainCard: (context) => revealVillainCard(context as never),
  fightVillain: (context, args) => fightVillain(context as never, args as never),
  recruitHero: (context, args) => recruitHero(context as never, args as never),
  fightMastermind: (context) => fightMastermind(context as never),
};

/** Builds an AggregatorMoveContext for a single move dispatch. */
function buildMoveContext(
  gameState: LegendaryGameState,
  playerId: string,
  phase: string,
  turn: number,
  numPlayers: number,
  endTurnFlag: { triggered: boolean },
  nextRandom: () => number,
): AggregatorMoveContext {
  return {
    G: gameState,
    playerID: playerId,
    ctx: {
      phase,
      turn,
      currentPlayer: playerId,
      numPlayers,
    },
    events: {
      setPhase: () => {
        // why: phase transitions are tracked externally by the aggregator.
        // Moves that call setPhase become no-ops in simulation, matching
        // the WP-036 runner and the replay harness (D-0205).
      },
      endTurn: () => {
        endTurnFlag.triggered = true;
      },
    },
    random: {
      Shuffle: <T>(deck: T[]): T[] => shuffleWithPrng(deck, nextRandom),
    },
  };
}

// ---------------------------------------------------------------------------
// Per-game loop replication (RS-10).
// ---------------------------------------------------------------------------

// why: 200-turn safety cap prevents infinite loops from policies that
// cannot find a terminating move. 200 is well above any realistic
// Legendary game length (~20–40 turns). Matches WP-036.
const MAX_TURNS_PER_GAME = 200;

// why: move-level safety cap prevents stall traps where a deterministic
// policy keeps choosing a no-op move (e.g., revealVillainCard against an
// exhausted deck in a mock-registry fixture). Each turn issues several
// moves before endTurn fires, but 2000 moves per game is an order of
// magnitude beyond realistic Legendary play (~100–200 moves). Hitting
// this cap flags the game as stuck in gameState.messages and breaks out.
const MAX_MOVES_PER_GAME = 2000;

/** Per-game outcome returned by simulateOneGame. */
interface PerGameOutcome {
  readonly finalState: LegendaryGameState;
  readonly turnCount: number;
}

/**
 * Runs one PAR simulation game using the supplied policy.
 *
 * // why: per-game loop replication avoids extending WP-036 runSimulation
 * (RS-10). runSimulation aggregates to SimulationResult which discards
 * the terminal G — the PAR pipeline needs that G for
 * deriveScoringInputsFromFinalState. Duplicating the loop keeps WP-036
 * immutable while letting PAR consume everything it needs.
 *
 * @param config - PAR simulation config (used for setupConfig + policyCount).
 * @param registry - Card registry reader (setup-time only).
 * @param perGameSeed - Seed for this game's shuffle PRNG domain.
 * @param policy - T2 policy for this game's decision PRNG domain.
 * @returns The terminal LegendaryGameState plus total turns elapsed.
 */
function simulateOneGame(
  config: ParSimulationConfig,
  registry: CardRegistryReader,
  perGameSeed: string,
  policy: AIPolicy,
): PerGameOutcome {
  const numPlayers = config.playerCount;
  const setupContext = makeMockCtx({ numPlayers });
  const gameState = buildInitialGameState(config.setupConfig, registry, setupContext);

  const nextRandom = createMulberry32(hashSeedString(perGameSeed));

  let currentPlayer = '0';
  let turn = 1;
  let turnsElapsed = 0;
  let movesDispatched = 0;

  // why (WP-266): the real onBegin runs at the start of every turn including
  // turn 1; mirror it before the first move-step so the opening hand is drawn
  // (buildInitialGameState defers the opening draw to onBegin, which this
  // observation-only loop never runs).
  applyOnBeginParity(gameState, currentPlayer, {
    random: { Shuffle: <T>(deck: T[]): T[] => shuffleWithPrng(deck, nextRandom) },
  });

  while (turnsElapsed < MAX_TURNS_PER_GAME) {
    if (movesDispatched >= MAX_MOVES_PER_GAME) {
      // why: move-level stall trap escape. A deterministic policy that
      // keeps choosing a no-op move would otherwise loop forever without
      // advancing turnsElapsed. Hitting this cap is recorded as a
      // structural warning in G.messages; the game counts as stuck.
      gameState.messages.push(
        `PAR aggregator warning: game exceeded MAX_MOVES_PER_GAME (${MAX_MOVES_PER_GAME}) without terminating — flagging as stuck.`,
      );
      turnsElapsed = MAX_TURNS_PER_GAME;
      break;
    }
    const endgameResult = evaluateEndgame(gameState);
    if (endgameResult !== null) {
      break;
    }

    const lifecycleContext: SimulationLifecycleContext = {
      phase: 'play',
      turn,
      currentPlayer,
      numPlayers,
    };
    const uiState = buildUIState(gameState, lifecycleContext);
    const filteredState = filterUIStateForAudience(uiState, {
      kind: 'player',
      playerId: currentPlayer,
    });
    const legalMoves: LegalMove[] = getLegalMoves(gameState, lifecycleContext);

    const intent: ClientTurnIntent = policy.decideTurn(filteredState, legalMoves);
    const moveFn = MOVE_MAP[intent.move.name];
    const endTurnFlag = { triggered: false };

    if (moveFn === undefined) {
      gameState.messages.push(
        `PAR aggregator warning: unknown move name "${intent.move.name}" — skipped.`,
      );
    } else {
      const moveContext = buildMoveContext(
        gameState,
        currentPlayer,
        'play',
        turn,
        numPlayers,
        endTurnFlag,
        nextRandom,
      );
      moveFn(moveContext, intent.move.args);
    }
    movesDispatched += 1;

    // why: zero-legal-moves fallback. If the policy returned endTurn
    // outside cleanup, the move is a silent no-op and the loop would
    // spin forever. Flag the game as stuck and break out.
    if (
      intent.move.name === 'endTurn' &&
      !endTurnFlag.triggered &&
      gameState.currentStage !== 'cleanup'
    ) {
      gameState.messages.push(
        `PAR aggregator warning: policy "${policy.name}" returned endTurn outside cleanup — flagging game as stuck.`,
      );
      turnsElapsed = MAX_TURNS_PER_GAME;
      break;
    }

    if (endTurnFlag.triggered) {
      // why: boardgame.io would fire onTurnEnd hooks and then onBegin on
      // the next turn, resetting currentStage + turnEconomy. Simulation
      // mirrors the critical pieces manually. Rule hooks are deferred
      // because the aggregator is observation-only (same as WP-036 /
      // replay harness D-0205).
      const policyIndex = Number(currentPlayer);
      currentPlayer = String((policyIndex + 1) % numPlayers);
      turn += 1;
      turnsElapsed += 1;
      gameState.currentStage = 'start';
      gameState.turnEconomy = resetTurnEconomy();
      // why (WP-266): mirror the rest of onBegin for the incoming player —
      // reset the once-per-turn flags and auto-draw their hand to HAND_SIZE so
      // the next turn can actually play cards.
      applyOnBeginParity(gameState, currentPlayer, {
        random: { Shuffle: <T>(deck: T[]): T[] => shuffleWithPrng(deck, nextRandom) },
      });
    }
  }

  return {
    finalState: gameState,
    turnCount: turnsElapsed === 0 ? 1 : turnsElapsed,
  };
}

// ---------------------------------------------------------------------------
// Scoring input derivation from terminal G.
// ---------------------------------------------------------------------------

/**
 * Builds a ScoringInputs record from the terminal engine state.
 *
 * Mirrors parScoring.logic.ts deriveScoringInputs but reads directly from
 * LegendaryGameState rather than a ReplayResult (WP-048's
 * deriveScoringInputs requires a ReplayResult — not available in this
 * pipeline). All five penalty-event types follow the WP-048 safe-skip
 * (D-4801) for categories with no engine producer today.
 *
 * // why: VP sum uses computeFinalScores per D-4803 team-aggregate rule
 * — the sum across all players, not a single player's total. Bystanders
 * rescued are counted from every player's victory pile, mirroring
 * WP-067's aggregation. Escapes read G.counters[ESCAPED_VILLAINS] with
 * `?? 0` because the counter is lazily initialised.
 */
function deriveScoringInputsFromFinalState(
  finalState: LegendaryGameState,
  turnCount: number,
): ScoringInputs {
  const rounds = turnCount;

  const finalScoreSummary = computeFinalScores(finalState);
  let victoryPoints = 0;
  for (const playerBreakdown of finalScoreSummary.players) {
    victoryPoints = victoryPoints + playerBreakdown.totalVP;
  }

  let bystandersRescued = 0;
  for (const zones of Object.values(finalState.playerZones)) {
    for (const cardExtId of zones.victory) {
      if (finalState.villainDeckCardTypes[cardExtId] === 'bystander') {
        bystandersRescued = bystandersRescued + 1;
      }
    }
  }

  const escapes = finalState.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0;

  // why: D-4801 safe-skip — the four penalty types without an engine
  // producer today are zeroed here. The PAR pipeline rides on whatever
  // engine producers exist; adding more producers is downstream work.
  const penaltyEventCounts: Record<PenaltyEventType, number> = {
    villainEscaped: escapes,
    bystanderLost: 0,
    schemeTwistNegative: 0,
    mastermindTacticUntaken: 0,
    scenarioSpecificPenalty: 0,
  };

  return {
    rounds,
    victoryPoints,
    bystandersRescued,
    escapes,
    penaltyEventCounts,
  };
}

// ---------------------------------------------------------------------------
// Distribution stats.
// ---------------------------------------------------------------------------

/**
 * Computes the nearest-rank percentile of a sorted-ascending array.
 *
 * // why: rankIndex = ceil((percentile / 100) * N) - 1 clamped to
 * [0, N - 1]. Input array is assumed pre-sorted ascending — callers pass
 * the already-sorted copy produced for distribution stats.
 */
function nearestRankPercentile(sortedAscending: number[], percentile: number): number {
  const size = sortedAscending.length;
  const rawIndex = Math.ceil((percentile / 100) * size) - 1;
  let index = rawIndex;
  if (index < 0) {
    index = 0;
  }
  if (index > size - 1) {
    index = size - 1;
  }
  return sortedAscending[index]!;
}

/**
 * Computes the population standard deviation of the supplied scores.
 */
function computeStandardDeviation(scores: number[]): number {
  const size = scores.length;
  if (size === 0) {
    return 0;
  }
  let sum = 0;
  for (const score of scores) {
    sum = sum + score;
  }
  const mean = sum / size;
  let squaredSum = 0;
  for (const score of scores) {
    const delta = score - mean;
    squaredSum = squaredSum + delta * delta;
  }
  return Math.sqrt(squaredSum / size);
}

// ---------------------------------------------------------------------------
// aggregateParFromSimulation (public).
// ---------------------------------------------------------------------------

/**
 * Computes the nearest-rank PAR value for a Raw Score distribution.
 *
 * Throws ParAggregationError on empty input or out-of-range percentile.
 * The input array is never mutated — a sorted copy is produced via an
 * explicit numeric comparator.
 *
 * // why: explicit (a, b) => a - b comparator is required — default
 * Array.prototype.sort is lexical, which would mis-order negative or
 * large integers across Node versions.
 * // why: percentile is robust to outliers; 55th is slightly conservative
 * (harder to beat than the median) while remaining close to "typical
 * competent play".
 *
 * @param rawScores - Raw Score array (integers). Not mutated.
 * @param percentile - Percentile to select (0..100 inclusive).
 * @returns Integer PAR value in Raw Score units.
 * @throws ParAggregationError when rawScores is empty or percentile is
 *   outside [0, 100].
 */
export function aggregateParFromSimulation(
  rawScores: number[],
  percentile: number,
): number {
  if (rawScores.length === 0) {
    throw new ParAggregationError(
      'EMPTY_DISTRIBUTION',
      'aggregateParFromSimulation requires at least one raw score to compute a percentile.',
    );
  }
  if (percentile < 0 || percentile > 100) {
    throw new ParAggregationError(
      'PERCENTILE_OUT_OF_RANGE',
      `aggregateParFromSimulation requires percentile in [0, 100]; got ${percentile}.`,
    );
  }

  const sortedAscending = [...rawScores].sort((left, right) => left - right);
  return nearestRankPercentile(sortedAscending, percentile);
}

// ---------------------------------------------------------------------------
// generateScenarioPar (public).
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full PAR pipeline for a single scenario.
 *
 * Steps:
 *   1. Derive canonical seed set from (baseSeed, simulationCount).
 *   2. Compute seedSetHash from the seed array.
 *   3. For each seed: build a fresh T2 policy (decision domain) and run
 *      one game with a fresh shuffle PRNG (shuffle domain), producing a
 *      terminal LegendaryGameState + turn count.
 *   4. For each game: derive ScoringInputs and compute Raw Score via
 *      computeRawScore(inputs, config.scoringConfig). Losses are included
 *      as first-class outcomes — no filtering.
 *   5. Assert rawScores.length === simulationCount (distribution integrity).
 *   6. Aggregate to PAR via aggregateParFromSimulation.
 *   7. Compute distribution stats (min/p25/median/p55/p75/max/stddev/IQR).
 *   8. Compute needsMoreSamples from module-level thresholds.
 *   9. Compute seedParDelta = parValue - computeParScore(scoringConfig).
 *   10. Return a fresh ParSimulationResult literal (no aliasing).
 *
 * // why: PAR is determined before players choose heroes — the hero pool
 * is consumed verbatim from config.setupConfig per §26 Layer A rule.
 * // why: two-domain PRNG (D-3604) — shuffle domain is per-game; decision
 * domain is per-policy instance. A change to one never perturbs the other.
 * // why: generateScenarioPar does NOT enforce PAR_MIN_SAMPLE_SIZE —
 * validateParResult is the enforcement point so bootstrap tests with
 * small N remain possible.
 *
 * @param config - Full PAR simulation config.
 * @param registry - Card registry reader (setup-time only).
 * @returns Complete ParSimulationResult (JSON-serializable).
 * @throws ParAggregationError when aggregation-level invariants fail
 *   (empty distribution, percentile out of range). Never swallows or wraps.
 */
export function generateScenarioPar(
  config: ParSimulationConfig,
  registry: CardRegistryReader,
): ParSimulationResult {
  const seeds = generateSeedSet(config.baseSeed, config.simulationCount);
  const seedSetHash = computeSeedSetHash(seeds);

  const rawScores: number[] = [];
  for (const seed of seeds) {
    const policy = createCompetentHeuristicPolicy(seed);
    const { finalState, turnCount } = simulateOneGame(config, registry, seed, policy);
    const inputs = deriveScoringInputsFromFinalState(finalState, turnCount);
    const score = computeRawScore(inputs, config.scoringConfig);
    rawScores.push(score);
  }

  if (rawScores.length !== config.simulationCount) {
    throw new ParAggregationError(
      'EMPTY_DISTRIBUTION',
      `Internal invariant violated: rawScores.length (${rawScores.length}) must equal config.simulationCount (${config.simulationCount}).`,
    );
  }

  const parValue = aggregateParFromSimulation(rawScores, config.percentile);

  // why: distribution stats are derived from a single sorted copy to
  // avoid repeated sorts. Explicit numeric comparator required — see
  // aggregateParFromSimulation comment.
  const sortedAscending = [...rawScores].sort((left, right) => left - right);
  const min = sortedAscending[0]!;
  const max = sortedAscending[sortedAscending.length - 1]!;
  const p25 = nearestRankPercentile(sortedAscending, 25);
  const median = nearestRankPercentile(sortedAscending, 50);
  const p55 = nearestRankPercentile(sortedAscending, 55);
  const p75 = nearestRankPercentile(sortedAscending, 75);
  const standardDeviation = computeStandardDeviation(sortedAscending);
  const interquartileRange = p75 - p25;

  const needsMoreSamples =
    interquartileRange > IQR_THRESHOLD || standardDeviation > STDEV_THRESHOLD;

  const seedPar = computeParScore(config.scoringConfig);
  const seedParDelta = parValue - seedPar;

  // why: `generatedAt` fallback — new Date().toISOString() is the only
  // non-deterministic write in the aggregator. Reproducibility tests
  // inject config.generatedAtOverride to pin it.
  const generatedAt = config.generatedAtOverride ?? new Date().toISOString();

  const result: ParSimulationResult = {
    scenarioKey: config.scenarioKey,
    parValue,
    percentileUsed: config.percentile,
    sampleSize: config.simulationCount,
    seedSetHash,
    // why: fresh object literal prevents aliasing — callers mutating
    // their input cannot affect the returned result (D-2801 precedent).
    rawScoreDistribution: {
      min,
      p25,
      median,
      p55,
      p75,
      max,
      standardDeviation,
      interquartileRange,
    },
    needsMoreSamples,
    seedParDelta,
    simulationPolicyVersion: config.simulationPolicyVersion,
    scoringConfigVersion: config.scoringConfigVersion,
    generatedAt,
  };
  return result;
}

// ---------------------------------------------------------------------------
// validateParResult (public).
// ---------------------------------------------------------------------------

/**
 * Validates a ParSimulationResult against publication invariants.
 *
 * Never throws. Returns a structured ParValidationResult. `valid` is
 * false when any issue has severity 'error'; 'warn' issues do not
 * invalidate the result but are still surfaced.
 *
 * Checks:
 *   - (error) sampleSize >= PAR_MIN_SAMPLE_SIZE
 *   - (error) monotonic distribution bounds min <= p25 <= median <= p75 <= max
 *   - (error) percentileUsed in [50, 60] inclusive
 *   - (warn) needsMoreSamples flag set
 *   - (warn) histogram multimodality smell test — 20 bins, >=2 peaks
 *     each >= 20% of the max bin count, peaks separated by >= 2 bins.
 *     Requires the rawScores array; when only the result is passed, the
 *     check is skipped and a 'warn' issue notes the omission.
 *
 * // why: validation is the enforcement point for N >= 500 so
 * generateScenarioPar remains usable for bootstrapping smoke tests.
 * // why: multimodality check uses only the rawScores array when supplied
 * — no external scenario-difficulty metadata. Catches degenerate exploit
 * loops that produce clustered Raw Scores.
 *
 * @param result - The PAR simulation result to validate.
 * @param rawScores - Optional raw score array for the multimodality
 *   smell test. When omitted, the check is skipped with a 'warn' issue.
 * @returns Structured validation result.
 */
export function validateParResult(
  result: ParSimulationResult,
  rawScores?: number[],
): ParValidationResult {
  const issues: ParValidationIssue[] = [];

  if (result.sampleSize < PAR_MIN_SAMPLE_SIZE) {
    issues.push({
      severity: 'error',
      code: 'SAMPLE_SIZE_BELOW_MINIMUM',
      message: `ParSimulationResult.sampleSize (${result.sampleSize}) is below the minimum PAR_MIN_SAMPLE_SIZE (${PAR_MIN_SAMPLE_SIZE}); re-run with at least ${PAR_MIN_SAMPLE_SIZE} simulated games before publishing.`,
    });
  }

  const distribution = result.rawScoreDistribution;
  if (
    distribution.min > distribution.p25 ||
    distribution.p25 > distribution.median ||
    distribution.median > distribution.p75 ||
    distribution.p75 > distribution.max
  ) {
    issues.push({
      severity: 'error',
      code: 'DISTRIBUTION_BOUNDS_NOT_MONOTONIC',
      message: `ParSimulationResult.rawScoreDistribution violated monotonic ordering; expected min <= p25 <= median <= p75 <= max but got min=${distribution.min}, p25=${distribution.p25}, median=${distribution.median}, p75=${distribution.p75}, max=${distribution.max}.`,
    });
  }

  if (result.percentileUsed < 50 || result.percentileUsed > 60) {
    issues.push({
      severity: 'error',
      code: 'PERCENTILE_OUT_OF_ALLOWED_RANGE',
      message: `ParSimulationResult.percentileUsed (${result.percentileUsed}) is outside the allowed publication range [50, 60] inclusive.`,
    });
  }

  if (result.needsMoreSamples) {
    issues.push({
      severity: 'warn',
      code: 'HIGH_VARIANCE',
      message: `ParSimulationResult.needsMoreSamples is true; variance exceeds module-level thresholds (IQR_THRESHOLD=${IQR_THRESHOLD}, STDEV_THRESHOLD=${STDEV_THRESHOLD}). Re-run with a larger simulationCount before publishing.`,
    });
  }

  if (rawScores !== undefined && rawScores.length > 0) {
    if (detectMultimodalSmell(rawScores)) {
      issues.push({
        severity: 'warn',
        code: 'MULTIMODAL_DISTRIBUTION',
        message: `ParSimulationResult raw score distribution exhibits multimodal-suspicion peaks; investigate for degenerate exploit loops before publishing.`,
      });
    }
  } else {
    issues.push({
      severity: 'warn',
      code: 'MULTIMODALITY_CHECK_SKIPPED',
      message: `validateParResult was invoked without the rawScores array; the multimodality smell test was skipped.`,
    });
  }

  let valid = true;
  for (const issue of issues) {
    if (issue.severity === 'error') {
      valid = false;
    }
  }
  return { valid, issues };
}

/**
 * Multimodality smell test — returns true when the fixed-bin histogram
 * exhibits >= 2 distinct peak clusters separated by a valley.
 *
 * A peak cluster is a maximal contiguous run of bins whose count is
 * >= 20% of the overall max bin count. Two clusters are "distinct"
 * when there is at least one sub-threshold bin (the valley) between
 * them. Unimodal distributions collapse into a single contiguous
 * cluster; bimodal distributions produce >= 2 clusters with at least
 * one low-count bin between them.
 *
 * // why: cluster-based detection is robust to narrow single-peak
 * distributions where many adjacent bins all exceed 20% of the peak —
 * they all belong to the same mode and should not flag as multimodal.
 */
function detectMultimodalSmell(rawScores: number[]): boolean {
  if (rawScores.length === 0) {
    return false;
  }

  let minValue = rawScores[0]!;
  let maxValue = rawScores[0]!;
  for (const score of rawScores) {
    if (score < minValue) {
      minValue = score;
    }
    if (score > maxValue) {
      maxValue = score;
    }
  }
  const range = maxValue - minValue;
  if (range === 0) {
    return false;
  }

  const bins: number[] = [];
  for (let index = 0; index < MULTIMODALITY_BIN_COUNT; index++) {
    bins.push(0);
  }
  for (const score of rawScores) {
    const fraction = (score - minValue) / range;
    let binIndex = Math.floor(fraction * MULTIMODALITY_BIN_COUNT);
    if (binIndex >= MULTIMODALITY_BIN_COUNT) {
      binIndex = MULTIMODALITY_BIN_COUNT - 1;
    }
    bins[binIndex] = (bins[binIndex] ?? 0) + 1;
  }

  let maxBinCount = 0;
  for (const binCount of bins) {
    if (binCount > maxBinCount) {
      maxBinCount = binCount;
    }
  }
  if (maxBinCount === 0) {
    return false;
  }

  // why: 20% of max is the peak threshold — bins below this are
  // treated as background / tail, not candidate peaks.
  const peakThreshold = maxBinCount * 0.2;

  // Walk the bin array accumulating contiguous peak clusters. Each
  // cluster is a maximal run of consecutive bins where every bin
  // meets the threshold.
  let clusterCount = 0;
  let insideCluster = false;
  for (const binCount of bins) {
    if (binCount >= peakThreshold) {
      if (!insideCluster) {
        clusterCount += 1;
        insideCluster = true;
      }
    } else {
      insideCluster = false;
    }
  }

  // why: >= 2 distinct clusters means there is at least one
  // sub-threshold bin (a valley) separating peaks. A single contiguous
  // cluster — even a wide one — is a unimodal distribution.
  return clusterCount >= 2;
}

// ---------------------------------------------------------------------------
// validateTierOrdering (public).
// ---------------------------------------------------------------------------

/**
 * Validates that T3 < T2 < T1 < T0 (lower Raw Score = stronger play).
 *
 * Each input is an array of Raw Scores for that tier; minimum 50 scores
 * per tier per WP-049 §B.validateTierOrdering. The median of each tier
 * is computed via nearest-rank on a sorted copy.
 *
 * // why: violated tier ordering means either the heuristics are
 * miscalibrated or the scenario exploits a degenerate pattern — in
 * either case, PAR publication must halt until investigated.
 *
 * @param tier0Scores - T0 (Random Legal) Raw Scores.
 * @param tier1Scores - T1 (Naive) Raw Scores.
 * @param tier2Scores - T2 (Competent Heuristic) Raw Scores.
 * @param tier3Scores - T3 (Strong Heuristic) Raw Scores.
 * @returns Structured TierOrderingResult with medians and violations.
 */
export function validateTierOrdering(
  tier0Scores: number[],
  tier1Scores: number[],
  tier2Scores: number[],
  tier3Scores: number[],
): TierOrderingResult {
  const violations: string[] = [];

  const medianT0 = safeMedian(tier0Scores);
  const medianT1 = safeMedian(tier1Scores);
  const medianT2 = safeMedian(tier2Scores);
  const medianT3 = safeMedian(tier3Scores);

  if (tier0Scores.length < 50) {
    violations.push(
      `Tier T0 has fewer than 50 samples (got ${tier0Scores.length}); collect more runs before validating ordering.`,
    );
  }
  if (tier1Scores.length < 50) {
    violations.push(
      `Tier T1 has fewer than 50 samples (got ${tier1Scores.length}); collect more runs before validating ordering.`,
    );
  }
  if (tier2Scores.length < 50) {
    violations.push(
      `Tier T2 has fewer than 50 samples (got ${tier2Scores.length}); collect more runs before validating ordering.`,
    );
  }
  if (tier3Scores.length < 50) {
    violations.push(
      `Tier T3 has fewer than 50 samples (got ${tier3Scores.length}); collect more runs before validating ordering.`,
    );
  }

  if (!(medianT3 < medianT2)) {
    violations.push(
      `Tier ordering violated: median(T3)=${medianT3} must be less than median(T2)=${medianT2}; T3 (Strong Heuristic) should outperform T2 (Competent Heuristic).`,
    );
  }
  if (!(medianT2 < medianT1)) {
    violations.push(
      `Tier ordering violated: median(T2)=${medianT2} must be less than median(T1)=${medianT1}; T2 (Competent Heuristic) should outperform T1 (Naive).`,
    );
  }
  if (!(medianT1 < medianT0)) {
    violations.push(
      `Tier ordering violated: median(T1)=${medianT1} must be less than median(T0)=${medianT0}; T1 (Naive) should outperform T0 (Random Legal).`,
    );
  }

  const medians: Readonly<Record<AIPolicyTier, number>> = {
    T0: medianT0,
    T1: medianT1,
    T2: medianT2,
    T3: medianT3,
    T4: 0,
  };

  return {
    passed: violations.length === 0,
    medians,
    violations,
  };
}

/**
 * Returns the nearest-rank median of an array, or 0 for an empty input.
 */
function safeMedian(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }
  const sortedAscending = [...scores].sort((left, right) => left - right);
  return nearestRankPercentile(sortedAscending, 50);
}
