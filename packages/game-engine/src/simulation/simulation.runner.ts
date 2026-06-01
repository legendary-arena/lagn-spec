/**
 * Simulation runner for the Legendary Arena balance simulation framework.
 *
 * runSimulation executes N games with pluggable AI policies and returns
 * aggregate statistics. Uses the full engine pipeline — buildInitialGameState
 * → per-turn loop (buildUIState → filterUIStateForAudience → getLegalMoves
 * → policy.decideTurn → dispatch move) → evaluateEndgame → computeFinalScores.
 * Same pipeline as multiplayer per D-0701; balance validation per D-0702.
 *
 * simulateOneGameAndCaptureMoves (WP-193) reuses the same per-turn loop via
 * an `onMoveDispatched?` callback side-channel; it returns the dispatched
 * ReplayMove[] so the recorder can route that move list through `runFixture`
 * (the single oracle source — D-19301). No second execution path; no widening
 * of `runFixture`'s public API; the internal `GameOutcome` aggregate stays
 * unexported.
 *
 * No boardgame.io imports. No registry imports. No Math.random(). No
 * .reduce(). No IO.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { FinalScoreSummary } from '../scoring/scoring.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { SimulationConfig, SimulationResult, LegalMove, AIPolicy } from './ai.types.js';
import type { SimulationLifecycleContext } from './ai.legalMoves.js';
import type { ReplayMove } from '../replay/replay.types.js';
import type { EndgameOutcome } from '../endgame/endgame.types.js';

import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { buildUIState } from '../ui/uiState.build.js';
import { filterUIStateForAudience } from '../ui/uiState.filter.js';
import { getLegalMoves } from './ai.legalMoves.js';
import { computeFinalScores } from '../scoring/scoring.logic.js';
import { evaluateEndgame } from '../endgame/endgame.evaluate.js';
import { resetTurnEconomy } from '../economy/economy.logic.js';

// Move function imports — these files import boardgame.io types internally,
// but this file does NOT import boardgame.io directly. Same dispatch pattern
// as replay/replay.execute.ts (WP-027 D-2705 precedent).
import { drawCards, playCard, endTurn } from '../moves/coreMoves.impl.js';
import { revealVillainCard } from '../villainDeck/villainDeck.reveal.js';
import { fightVillain } from '../moves/fightVillain.js';
import { recruitHero } from '../moves/recruitHero.js';
import { fightMastermind } from '../moves/fightMastermind.js';
import { advanceTurnStage } from '../turn/turnLoop.js';

// why: 200-turn safety cap prevents infinite loops in degenerate states
// (e.g., a policy unable to find terminating moves). 200 is well above any
// realistic Legendary game length (~20–40 turns). Games hitting the cap are
// counted as "stuck" and contribute to averageTurns with value 200 and
// winRate contribution 0. Not a gameplay rule.
const MAX_TURNS_PER_GAME = 200;

// why: move functions destructure FnContext<LegendaryGameState> & { playerID }
// from boardgame.io. Simulation cannot import boardgame.io (engine category
// rule per D-3601), so a local structural interface provides the minimum
// fields moves actually destructure. events are no-ops because simulation
// tracks phase/turn externally; the runner inspects events.endTurn() via a
// closure flag to detect when a move wants to end the turn. random.Shuffle
// uses the run's mulberry32 instance for deterministic deck reshuffles.
// Pattern: D-2801 (local structural interface) + D-2705 (static MOVE_MAP) +
// D-2704 (PRNG capability gap).
interface SimulationMoveContext {
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

/** Move function type for the simulation move map. */
type MoveFn = (context: SimulationMoveContext, args?: unknown) => void;

/**
 * Deterministic 32-bit seed derived from a string via djb2.
 *
 * // why: djb2 is a tiny deterministic string hash with no crypto dependency.
 * Duplicated (not shared) from ai.random.ts per WP-036 Scope Lock: the
 * 4-file cap keeps simulation tightly scoped and avoids adding a 5th
 * helper file for ~20 lines of PRNG plumbing.
 *
 * @param seed - Arbitrary seed string.
 * @returns Non-negative 32-bit integer derived from the seed.
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
 *
 * // why: mulberry32 chosen for deterministic reproducibility + brevity; not
 * a cryptographic PRNG and simulation-internal only. Duplicated from
 * ai.random.ts per WP-036 Scope Lock (see hashSeedString comment above).
 *
 * @param seed - 32-bit integer seed.
 * @returns A nullary function returning a float in [0, 1) on each call.
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
 *
 * // why: simulation-internal deck shuffles go through a seeded mulberry32
 * so every reshuffle is reproducible from (config.seed, gameIndex). Input
 * array is not mutated — the move contract expects Shuffle to return a new
 * array.
 *
 * @param deck - The array to shuffle. Not mutated.
 * @param nextRandom - mulberry32 closure.
 * @returns A new array with deck entries in shuffled order.
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

/**
 * Wraps advanceTurnStage for the simulation MOVE_MAP dispatch slot.
 *
 * advanceStage is a local function in game.ts (not exported) — per WP-027
 * D-2705 precedent, we reconstruct the equivalent behavior by calling
 * advanceTurnStage directly.
 */
function simulationAdvanceStage(context: SimulationMoveContext): void {
  advanceTurnStage(context.G, { events: { endTurn: context.events.endTurn } });
}

/**
 * Static map from simulation move name strings to dispatch functions.
 *
 * Every play-phase move registered in LegendaryGame.moves has an entry
 * here. Lobby moves (setPlayerReady, startMatchIfReady) are deliberately
 * omitted — simulation starts post-lobby by initializing phase = 'play'.
 * Unknown move names are handled gracefully (warning + skip) in
 * dispatchMove.
 */
const MOVE_MAP: Record<string, MoveFn> = {
  drawCards: (context, args) => drawCards(context as never, args as never),
  playCard: (context, args) => playCard(context as never, args as never),
  endTurn: (context) => endTurn(context as never),
  advanceStage: (context) => simulationAdvanceStage(context),
  revealVillainCard: (context) => revealVillainCard(context as never),
  fightVillain: (context, args) => fightVillain(context as never, args as never),
  recruitHero: (context, args) => recruitHero(context as never, args as never),
  fightMastermind: (context) => fightMastermind(context as never),
};

/**
 * Zeroed SimulationResult for degenerate configurations.
 *
 * @param seed - seed to echo into the result.
 * @returns All six numeric fields zeroed, seed preserved verbatim.
 */
function zeroedResult(seed: string): SimulationResult {
  return {
    gamesPlayed: 0,
    winRate: 0,
    averageTurns: 0,
    averageScore: 0,
    escapedVillainsAverage: 0,
    woundsAverage: 0,
    seed,
  };
}

/**
 * Per-game outcome record used for runSimulation aggregation.
 *
 * `endgameReached` + `endgameWinner` are additive fields surfaced for the
 * WP-193 capture path (projected into `CapturedOutcomeSummary`). They are
 * NOT consumed by `runSimulation`'s aggregation (which uses `isHeroesWin`
 * exclusively) so the existing aggregate contract is byte-stable. This
 * interface stays internal — `simulateOneGameAndCaptureMoves` exposes only
 * the narrower `CapturedOutcomeSummary` projection (smallest-seam posture).
 */
interface GameOutcome {
  readonly turns: number;
  readonly isHeroesWin: boolean;
  readonly highestTotalVP: number;
  readonly escapedVillains: number;
  readonly totalWounds: number;
  readonly endgameReached: boolean;
  readonly endgameWinner: EndgameOutcome | null;
}

/**
 * Builds a SimulationMoveContext for a single move dispatch.
 *
 * // why: events.endTurn flips a closure flag the runner checks after
 * dispatch — boardgame.io would handle turn rotation; simulation does it
 * manually in runPerTurnLoop.
 */
function buildMoveContext(
  gameState: LegendaryGameState,
  playerId: string,
  phase: string,
  turn: number,
  numPlayers: number,
  endTurnFlag: { triggered: boolean },
  nextRandom: () => number,
): SimulationMoveContext {
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
        // why: phase transitions are tracked externally by the runner.
        // Moves that call setPhase become no-ops in simulation; this
        // matches replay.execute.ts behavior (D-0205 determinism-only
        // harness pattern).
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

/**
 * Aggregate signal returned by the extracted per-turn loop helper.
 *
 * The fields beyond `turnsElapsed` let `buildGameOutcome` thread the
 * loop-exit reason into `GameOutcome` so the WP-193 capture path can
 * project `endgameReached` + `endgameWinner` into `CapturedOutcomeSummary`
 * without re-deriving them from terminal G state.
 */
interface PerTurnLoopResult {
  readonly turnsElapsed: number;
  readonly endgameReached: boolean;
  readonly endgameWinner: EndgameOutcome | null;
}

/**
 * Runs the per-turn loop for a single game and returns the aggregate
 * loop-exit signal. Mutates `gameState` in place.
 *
 * Each turn:
 *   1. Evaluate endgame. If non-null, set `endgameReached` + `endgameWinner`
 *      and exit the loop.
 *   2. Build UIState from G + lifecycle context.
 *   3. Filter UIState for the active player audience.
 *   4. Enumerate legal moves.
 *   5. Ask the active policy for a ClientTurnIntent.
 *   6. Dispatch the move via MOVE_MAP (unknown names log + skip).
 *   7. Stuck-game check (endTurn outside cleanup → flag and exit).
 *   8. If endTurnFlag triggered: rotate player + reset stage / economy.
 *
 * The optional `onMoveDispatched` callback (WP-193) is the move-capture
 * side-channel: it fires AFTER successful dispatch and AFTER the stuck-game
 * check reads `endTurnFlag`, so a captured `ReplayMove` represents a
 * dispatched move that did not trigger a stuck-game exit. When
 * `onMoveDispatched === undefined` (the existing `simulateOneGame` path),
 * the loop's behaviour is byte-identical to the pre-WP-193 implementation.
 *
 * // why (callback fire site): per D-19301, `runFixture` is the single oracle
 * source — the recorder's `--policy` path captures moves here and hands
 * them off to `runFixture` for replay. Dispatch must be AFTER the move
 * function returns (so its effects on `endTurnFlag` / G are fully
 * realised) AND after the stuck-game check reads `endTurnFlag` (so a
 * stuck-endTurn dispatch is NOT captured — it represents a degenerate
 * loop-exit signal, not a replayable move that contributes to a fixture
 * trajectory). Skipped dispatches (unknown moveFn) are also NOT captured.
 * A callback-via-parameter side-channel is chosen over a mutable-array
 * parameter so the helper's signature stays read-only at the value layer
 * (the caller observes captures by writing the receiver inside the
 * closure) and so the helper composes with future consumers that need
 * non-array sinks.
 */
function runPerTurnLoop(
  gameState: LegendaryGameState,
  policies: readonly AIPolicy[],
  numPlayers: number,
  gameIndex: number,
  nextRandom: () => number,
  onMoveDispatched?: (move: ReplayMove) => void,
): PerTurnLoopResult {
  // why: buildInitialGameState initializes currentStage to TURN_STAGES[0]
  // ('start') and turnEconomy to all-zero; it does not set phase (the
  // framework manages phase). Simulation tracks phase externally as
  // 'play' because the runner is post-lobby and uses the play-phase
  // MOVE_MAP dispatch set only.
  let currentPlayer = '0';
  let turn = 1;
  let turnsElapsed = 0;
  let endgameReached = false;
  let endgameWinner: EndgameOutcome | null = null;

  while (turnsElapsed < MAX_TURNS_PER_GAME) {
    const endgameResult = evaluateEndgame(gameState);
    if (endgameResult !== null) {
      endgameReached = true;
      endgameWinner = endgameResult.outcome;
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

    const policyIndex = Number(currentPlayer);
    const activePolicy = policies[policyIndex];
    if (activePolicy === undefined) {
      gameState.messages.push(
        `Simulation warning: no AI policy for playerId "${currentPlayer}" (game ${gameIndex}). Ending this game as stuck.`,
      );
      break;
    }

    const intent = activePolicy.decideTurn(filteredState, legalMoves);

    // why: decision log is pushed before dispatching the move so bot
    // rationale appears in G.messages before the move's own messages.
    if (intent.decisionLog !== undefined) {
      for (const logLine of intent.decisionLog) {
        gameState.messages.push(logLine);
      }
    }

    const moveFn = MOVE_MAP[intent.move.name];
    const endTurnFlag = { triggered: false };

    if (moveFn === undefined) {
      gameState.messages.push(
        `Simulation warning: unknown move name "${intent.move.name}" — skipped (game ${gameIndex}).`,
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

    // why: zero-legal-moves + endTurn-illegal fallback (RS-6 second clause).
    // If the policy returned endTurn when the stage is not cleanup, the
    // move is a silent no-op and the loop would spin forever. Detect this
    // by checking whether an endTurn intent failed to advance the stage,
    // and break out as "stuck" — contributes 200 turns, 0 to winRate.
    if (
      intent.move.name === 'endTurn' &&
      !endTurnFlag.triggered &&
      gameState.currentStage !== 'cleanup'
    ) {
      gameState.messages.push(
        `Simulation warning: policy "${activePolicy.name}" returned endTurn outside cleanup — flagging game ${gameIndex} as stuck.`,
      );
      turnsElapsed = MAX_TURNS_PER_GAME;
      break;
    }

    // why (WP-193 / D-19301): capture the successfully-dispatched move into
    // the recorder's ReplayMove[] AFTER move dispatch returns AND AFTER
    // the stuck-game check reads `endTurnFlag`. A captured move is one
    // that `runFixture` can replay; the recorder's `--policy` path hands
    // this list off to `runFixture` as the single oracle source. Skipped
    // dispatches (unknown moveFn) and stuck-endTurn breaks are excluded
    // from the trace because they do not represent replayable progress.
    if (moveFn !== undefined && onMoveDispatched !== undefined) {
      onMoveDispatched({
        playerId: currentPlayer,
        moveName: intent.move.name,
        args: intent.move.args,
      });
    }

    if (endTurnFlag.triggered) {
      // why: boardgame.io would fire onTurnEnd hooks and then onBegin on
      // the next turn, resetting currentStage + turnEconomy. Simulation
      // mirrors the critical pieces manually. Rule hook firing is deferred
      // because simulation is observation-only and the hooks would not
      // alter the legal-moves shape in any MVP scenario; replay harness
      // omits them for the same reason (D-0205).
      currentPlayer = String((policyIndex + 1) % numPlayers);
      turn += 1;
      turnsElapsed += 1;
      gameState.currentStage = 'start';
      gameState.turnEconomy = resetTurnEconomy();
    }
  }

  return { turnsElapsed, endgameReached, endgameWinner };
}

/**
 * Simulates one game and returns its aggregate outcome record.
 *
 * Thin wrapper around `runPerTurnLoop` that constructs the per-game state
 * and projects the loop-exit signal + terminal state into `GameOutcome`.
 * Behaviour is byte-identical to the pre-WP-193 implementation when the
 * capture callback is omitted (which it always is here).
 *
 * @param config - simulation configuration (unchanged across games).
 * @param registry - card registry reader.
 * @param gameIndex - 0-based index of this game within the run.
 * @param nextRandom - the run's mulberry32 closure (shared across games).
 * @returns per-game outcome record.
 */
function simulateOneGame(
  config: SimulationConfig,
  registry: CardRegistryReader,
  gameIndex: number,
  nextRandom: () => number,
): GameOutcome {
  const numPlayers = config.policies.length;
  const setupContext = makeMockCtx({ numPlayers });
  const gameState = buildInitialGameState(config.setupConfig, registry, setupContext);

  const loopResult = runPerTurnLoop(
    gameState,
    config.policies,
    numPlayers,
    gameIndex,
    nextRandom,
  );

  return buildGameOutcome(
    gameState,
    loopResult.turnsElapsed,
    numPlayers,
    loopResult.endgameReached,
    loopResult.endgameWinner,
  );
}

/**
 * Builds a GameOutcome from the terminal engine state.
 *
 * Statistics are sampled from the post-endgame UIState projection (via
 * buildUIState) — NOT from FinalScoreSummary and NOT from direct G access —
 * for escapedVillains and woundCount per pre-flight RS-12. The highest
 * totalVP is sourced from FinalScoreSummary.players[i].totalVP because
 * UIState does not surface per-player VP outside UIGameOverState.scores.
 *
 * @param gameState - terminal game state (mutated during the per-game loop).
 * @param turnsElapsed - number of turns taken; capped at MAX_TURNS_PER_GAME.
 * @param numPlayers - number of players (for lifecycle context).
 * @param endgameReached - whether the loop exited via `evaluateEndgame`
 *   returning non-null (true) vs the cap / stuck-game break (false).
 * @param endgameWinner - the `EndgameOutcome` value `evaluateEndgame`
 *   returned on the exiting turn; `null` when the loop exited via cap or
 *   stuck. Threaded through into `CapturedOutcomeSummary.winner` for the
 *   WP-193 capture path.
 * @returns per-game outcome record.
 */
function buildGameOutcome(
  gameState: LegendaryGameState,
  turnsElapsed: number,
  numPlayers: number,
  endgameReached: boolean,
  endgameWinner: EndgameOutcome | null,
): GameOutcome {
  // why: 'end' phase + explicit currentPlayer '0' produces a stable
  // post-endgame projection; turn count is the elapsed count capped at
  // the safety limit. numPlayers informs nothing in buildUIState but is
  // kept as a lifecycle-context discipline; the build context shape is
  // { phase, turn, currentPlayer } only (D-2801).
  void numPlayers;
  const postEndgameUi = buildUIState(gameState, {
    phase: 'end',
    turn: turnsElapsed === 0 ? 1 : turnsElapsed,
    currentPlayer: '0',
  });

  const isHeroesWin = postEndgameUi.gameOver?.outcome === 'heroes-win';

  const finalScores: FinalScoreSummary =
    postEndgameUi.gameOver?.scores ?? computeFinalScores(gameState);

  let highestTotalVP = 0;
  for (const breakdown of finalScores.players) {
    if (breakdown.totalVP > highestTotalVP) {
      highestTotalVP = breakdown.totalVP;
    }
  }

  let totalWounds = 0;
  for (const player of postEndgameUi.players) {
    totalWounds += player.woundCount;
  }

  const effectiveTurns =
    turnsElapsed >= MAX_TURNS_PER_GAME ? MAX_TURNS_PER_GAME : turnsElapsed;

  return {
    turns: effectiveTurns,
    isHeroesWin,
    highestTotalVP,
    escapedVillains: postEndgameUi.progress.escapedVillains,
    totalWounds,
    endgameReached,
    endgameWinner,
  };
}

/**
 * Aggregates per-game outcomes into a SimulationResult.
 *
 * // why: aggregation uses for...of, never .reduce(). All six numeric
 * fields are computed from the perGame array; seed is copied verbatim
 * from config.seed for reproducibility.
 *
 * @param perGame - per-game outcome records (non-empty).
 * @param seed - simulation seed.
 * @returns SimulationResult with aggregate statistics.
 */
function aggregateOutcomes(
  perGame: GameOutcome[],
  seed: string,
): SimulationResult {
  let winCount = 0;
  let totalTurns = 0;
  let totalScore = 0;
  let totalEscapedVillains = 0;
  let totalWounds = 0;

  for (const outcome of perGame) {
    if (outcome.isHeroesWin) {
      winCount += 1;
    }
    totalTurns += outcome.turns;
    totalScore += outcome.highestTotalVP;
    totalEscapedVillains += outcome.escapedVillains;
    totalWounds += outcome.totalWounds;
  }

  const gamesPlayed = perGame.length;
  return {
    gamesPlayed,
    winRate: winCount / gamesPlayed,
    averageTurns: totalTurns / gamesPlayed,
    averageScore: totalScore / gamesPlayed,
    escapedVillainsAverage: totalEscapedVillains / gamesPlayed,
    woundsAverage: totalWounds / gamesPlayed,
    seed,
  };
}

/**
 * Executes the configured number of games with the supplied AI policies and
 * returns aggregate statistics.
 *
 * Pure function — deterministic, no side effects beyond returning the result
 * object. No IO. Given identical (config, registry) inputs the returned
 * SimulationResult is byte-identical across runs.
 *
 * Degenerate inputs return a zeroed SimulationResult with a warning
 * message appended to the internal log (not propagated outside, since
 * simulation is observation-only):
 * - config.games < 1
 * - config.policies.length !== number of players expected
 * - config.seed is the empty string
 *
 * // why: simulation uses the full engine pipeline — same as multiplayer.
 * AI decisions are validated the same way human decisions are. Balance
 * changes require simulation validation (D-0702). Registry is consumed at
 * setup time via CardRegistryReader (local structural interface per
 * PS-2 + D-2504), never imported as CardRegistry from the registry
 * package (D-3601 engine-category rule). Mulberry32 instance is per-run
 * (shuffle domain); policy PRNGs are per-policy (decision domain); the
 * two seed domains are deliberately independent so tests can reseed one
 * without perturbing the other (D-2704 capability gap).
 *
 * @param config - simulation parameters (games, seed, setupConfig, policies).
 * @param registry - card registry reader (setup-time resolution only).
 * @returns aggregate SimulationResult.
 */
export function runSimulation(
  config: SimulationConfig,
  registry: CardRegistryReader,
): SimulationResult {
  if (config.games < 1) {
    return zeroedResult(config.seed);
  }
  if (config.seed.length === 0) {
    return zeroedResult(config.seed);
  }
  if (config.policies.length < 1) {
    return zeroedResult(config.seed);
  }

  const seedNumber = hashSeedString(config.seed);
  const nextRandom = createMulberry32(seedNumber);

  const perGame: GameOutcome[] = [];
  for (let gameIndex = 0; gameIndex < config.games; gameIndex++) {
    perGame.push(simulateOneGame(config, registry, gameIndex, nextRandom));
  }

  return aggregateOutcomes(perGame, config.seed);
}

/**
 * Narrower outcome surface exposed to the WP-193 capture path.
 *
 * // why (CapturedOutcomeSummary definition): the recorder + future
 * WP-194/195 consumers need just enough to (a) compare against the
 * `runFixture` outcome for the round-trip determinism test and
 * (b) carry forward into downstream tooling. The narrower
 * `CapturedOutcomeSummary` (two fields) is the minimum sufficient
 * surface; widening simulation's public contract to include the
 * broader internal aggregate would violate this packet's
 * "smallest seam possible" theme — the internal aggregate stays
 * unexported. Adding a fourth field here later is a deliberate API
 * change rather than silent inheritance of internal-aggregate
 * evolution. `winner` is typed `EndgameOutcome | null` (not
 * `string | null`) so the type system rejects typos and any future
 * outcome value that would otherwise compile but fail replay matching
 * silently against the `FixtureOutcome.winner` oracle in
 * `fixtureSchema.ts`.
 */
export interface CapturedOutcomeSummary {
  readonly winner: EndgameOutcome | null;
  readonly escapedVillains: number;
}

/**
 * Result returned by `simulateOneGameAndCaptureMoves` (WP-193).
 *
 * // why (CapturedGameResult.endgameReached): the recorder does not
 * surface a "hit-cap" anomaly today — classification of cap-hit vs
 * endgame-reached vs stuck-game is WP-195's seam (anomaly oracle layer).
 * WP-193 exposes the raw signal so WP-195 has a stable hook to consume
 * without re-deriving it from terminal G state. `endgameReached === true`
 * iff the per-turn loop exited via `evaluateEndgame` returning non-null;
 * `endgameReached === false` iff the loop exited via the
 * `MAX_TURNS_PER_GAME` cap or the stuck-endTurn break.
 */
export interface CapturedGameResult {
  readonly moves: readonly ReplayMove[];
  readonly outcome: CapturedOutcomeSummary;
  readonly endgameReached: boolean;
}

/**
 * Simulates one game and captures the dispatched `ReplayMove[]` plus
 * outcome summary (WP-193).
 *
 * The captured move list is the recorder's input to `runFixture` — the
 * single oracle source (D-19301). Simulation is the move generator; the
 * fixture's `expected` block is produced by `runFixture` on the captured
 * trace, NOT by this function. The narrower `CapturedOutcomeSummary` is
 * for round-trip determinism comparison + downstream consumers, not a
 * fixture oracle.
 *
 * PRNG semantics: this function constructs a fresh mulberry32 from
 * `hashSeedString(seed)` and advances it through `gameIndex` prior
 * `simulateOneGame` invocations (with no callback) before capturing game
 * `gameIndex`. The PRNG stream the captured game observes is therefore
 * identical to game `gameIndex` of a `runSimulation` call with the same
 * `(seed, setupConfig, policies)`. The recorder always passes
 * `gameIndex === 0`, which collapses the warm-up loop to a no-op and
 * makes the captured stream identical to a one-game `runSimulation`.
 *
 * Captured trace contains play-phase moves only (D-19302) — simulation
 * starts post-lobby at `phase = 'play'`, and `runFixture` also starts
 * from `buildInitialGameState`'s output; lobby moves are not in the
 * MOVE_MAP and are not emitted.
 *
 * @param setupConfig - validated 9-field MatchSetupConfig.
 * @param registry - card registry reader (setup-time resolution only).
 * @param policies - one policy per seat; `policies[i]` is applied when
 *   the active player's `playerId === String(i)`.
 * @param seed - run-level seed string; hashed via djb2 → mulberry32.
 * @param gameIndex - 0-based per-game index for PRNG-stream parity with
 *   `runSimulation`.
 * @returns CapturedGameResult — moves, outcome summary, endgame-reached flag.
 */
export function simulateOneGameAndCaptureMoves(
  setupConfig: MatchSetupConfig,
  registry: CardRegistryReader,
  policies: readonly AIPolicy[],
  seed: string,
  gameIndex: number,
): CapturedGameResult {
  if (seed.length === 0) {
    return {
      moves: [],
      outcome: { winner: null, escapedVillains: 0 },
      endgameReached: false,
    };
  }
  if (policies.length < 1) {
    return {
      moves: [],
      outcome: { winner: null, escapedVillains: 0 },
      endgameReached: false,
    };
  }

  const seedNumber = hashSeedString(seed);
  const nextRandom = createMulberry32(seedNumber);

  // why: warm-up advances the run-level PRNG by `gameIndex` prior
  // simulateOneGame calls so the captured game observes the same PRNG
  // state runSimulation's game `gameIndex` would. Loop is a no-op when
  // `gameIndex === 0` (the recorder's only call site).
  const warmupConfig: SimulationConfig = {
    games: gameIndex + 1,
    seed,
    setupConfig,
    policies: [...policies],
  };
  for (let priorGameIndex = 0; priorGameIndex < gameIndex; priorGameIndex++) {
    simulateOneGame(warmupConfig, registry, priorGameIndex, nextRandom);
  }

  const numPlayers = policies.length;
  const setupContext = makeMockCtx({ numPlayers });
  const gameState = buildInitialGameState(setupConfig, registry, setupContext);

  const capturedMoves: ReplayMove[] = [];
  const loopResult = runPerTurnLoop(
    gameState,
    policies,
    numPlayers,
    gameIndex,
    nextRandom,
    (move) => {
      capturedMoves.push(move);
    },
  );

  const outcome = buildGameOutcome(
    gameState,
    loopResult.turnsElapsed,
    numPlayers,
    loopResult.endgameReached,
    loopResult.endgameWinner,
  );

  return {
    moves: capturedMoves,
    outcome: {
      winner: outcome.endgameWinner,
      escapedVillains: outcome.escapedVillains,
    },
    endgameReached: outcome.endgameReached,
  };
}
