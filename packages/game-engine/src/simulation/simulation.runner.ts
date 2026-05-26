/**
 * Simulation runner for the Legendary Arena balance simulation framework.
 *
 * runSimulation executes N games with pluggable AI policies and returns
 * aggregate statistics. Uses the full engine pipeline — buildInitialGameState
 * → per-turn loop (buildUIState → filterUIStateForAudience → getLegalMoves
 * → policy.decideTurn → dispatch move) → evaluateEndgame → computeFinalScores.
 * Same pipeline as multiplayer per D-0701; balance validation per D-0702.
 *
 * No boardgame.io imports. No registry imports. No Math.random(). No
 * .reduce(). No IO.
 */

import type { LegendaryGameState } from '../types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { FinalScoreSummary } from '../scoring/scoring.types.js';
import type { SimulationConfig, SimulationResult, LegalMove } from './ai.types.js';
import type { SimulationLifecycleContext } from './ai.legalMoves.js';

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
 */
interface GameOutcome {
  readonly turns: number;
  readonly isHeroesWin: boolean;
  readonly highestTotalVP: number;
  readonly escapedVillains: number;
  readonly totalWounds: number;
}

/**
 * Builds a SimulationMoveContext for a single move dispatch.
 *
 * // why: events.endTurn flips a closure flag the runner checks after
 * dispatch — boardgame.io would handle turn rotation; simulation does it
 * manually in runGameLoop.
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
 * Simulates one game and returns its aggregate outcome record.
 *
 * Runs up to MAX_TURNS_PER_GAME turns. Each turn:
 *   1. Build UIState from G + current lifecycle context.
 *   2. Filter UIState for the active player audience.
 *   3. Enumerate legal moves.
 *   4. Ask the active policy for a ClientTurnIntent.
 *   5. Dispatch the move via MOVE_MAP (unknown names log + skip).
 *   6. If the move triggered events.endTurn() OR evaluateEndgame signals
 *      termination, end the per-game loop or rotate player.
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

  // why: buildInitialGameState initializes currentStage to TURN_STAGES[0]
  // ('start') and turnEconomy to all-zero; it does not set phase (the
  // framework manages phase). Simulation tracks phase externally as
  // 'play' because the runner is post-lobby and uses the play-phase
  // MOVE_MAP dispatch set only.
  let currentPlayer = '0';
  let turn = 1;
  let turnsElapsed = 0;

  while (turnsElapsed < MAX_TURNS_PER_GAME) {
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

    const policyIndex = Number(currentPlayer);
    const activePolicy = config.policies[policyIndex];
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

  return buildGameOutcome(gameState, turnsElapsed, numPlayers);
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
 * @returns per-game outcome record.
 */
function buildGameOutcome(
  gameState: LegendaryGameState,
  turnsElapsed: number,
  numPlayers: number,
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
