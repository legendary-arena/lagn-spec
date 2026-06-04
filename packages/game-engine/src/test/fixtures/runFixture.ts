/**
 * Seed-faithful fixture replay loop for the complete-game regression
 * harness (WP-158).
 *
 * `runFixture` is the shared dispatch primitive consumed by both the
 * `replayFixtures.test.ts` driver and the `scripts/record-game-fixture.mjs`
 * CLI recorder. Duplicating the loop in the recorder is FORBIDDEN
 * (WP-158 §Contract / EC-172 §Guardrails — Determinism integrity).
 *
 * The harness is the separate seed-faithful pipeline anticipated by
 * D-0205. It does NOT modify or replace
 * `packages/game-engine/src/replay/replay.execute.ts`, which remains the
 * determinism-only forensic harness; both pipelines coexist with
 * distinct contracts.
 *
 * No framework runtime import. No `@legendary-arena/registry` import. No
 * randomness, no wall-clock, no `process.env`, no `git` shell-out.
 * Imports `node:crypto` indirectly via `hashGameState`.
 */

import type { LegendaryGameState } from '../../types.js';
import type { CardRegistryReader } from '../../matchSetup.validate.js';
import type { ReplayMove } from '../../replay/replay.types.js';
import type { MatchSnapshot } from '../../persistence/persistence.types.js';
import type { EndgameResult } from '../../endgame/endgame.types.js';
import type {
  FixtureFile,
  FixtureRunResult,
  FixtureOutcome,
} from './fixtureSchema.js';

import { buildInitialGameState } from '../../setup/buildInitialGameState.js';
import { makeMockCtx } from '../mockCtx.js';
import { createSnapshot } from '../../persistence/snapshot.create.js';
import { evaluateEndgame } from '../../endgame/endgame.evaluate.js';
import { resetTurnEconomy } from '../../economy/economy.logic.js';
import { TURN_STAGES } from '../../turn/turnPhases.types.js';
import { CORE_MOVE_NAMES } from '../../moves/coreMoves.types.js';
import { drawCards, playCard, endTurn } from '../../moves/coreMoves.impl.js';
import { revealVillainCard } from '../../villainDeck/villainDeck.reveal.js';
import { fightVillain } from '../../moves/fightVillain.js';
import { recruitHero } from '../../moves/recruitHero.js';
import { fightMastermind } from '../../moves/fightMastermind.js';
import { setPlayerReady, startMatchIfReady } from '../../lobby/lobby.moves.js';
import { advanceTurnStage } from '../../turn/turnLoop.js';
import { hashGameState } from './hashGameState.js';

/**
 * Minimal structural context shape that move functions destructure. The
 * harness defines this locally rather than importing `FnContext` from
 * the upstream framework (per WP-158 §Packet-Specific Constraints +
 * D-2801 local structural interface precedent). Mirrors the pattern
 * used by `simulation.runner.ts` and `replay.execute.ts`.
 */
interface FixtureMoveContext {
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

/** Static move-name → dispatch-function map type. */
type MoveDispatch = (context: FixtureMoveContext, args?: unknown) => void;

// why: djb2 string hash duplicated locally per WP-036 Scope Lock precedent.
// Identical to `simulation.runner.ts:hashSeedString` — the helper is small
// enough that local duplication is preferred over a cross-module shared
// helper (the WP-036 author chose duplication for the same reason).
/**
 * Deterministic 32-bit djb2 seed hash. Returns a non-negative 32-bit
 * integer suitable for seeding a mulberry32 PRNG.
 */
function hashSeedString(seedString: string): number {
  let hashAccumulator = 5381;
  for (const character of seedString) {
    hashAccumulator =
      ((hashAccumulator << 5) + hashAccumulator + character.charCodeAt(0)) >>> 0;
  }
  return hashAccumulator;
}

// why: mulberry32 duplicated locally per WP-036 Scope Lock precedent.
// Not cryptographic — deterministic reproducibility + brevity.
/**
 * Creates a deterministic mulberry32 PRNG bound to the given 32-bit
 * seed. Returns a nullary function producing a float in [0, 1) on each
 * call.
 */
function createMulberry32(seedInteger: number): () => number {
  let prngState = seedInteger >>> 0;
  return function nextRandom(): number {
    prngState = (prngState + 0x6d2b79f5) >>> 0;
    let accumulator = prngState;
    accumulator = Math.imul(accumulator ^ (accumulator >>> 15), accumulator | 1);
    accumulator ^=
      accumulator + Math.imul(accumulator ^ (accumulator >>> 7), accumulator | 61);
    return ((accumulator ^ (accumulator >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by a supplied PRNG. Returns a new array;
 * the input is not mutated. Move functions invoking `context.random.Shuffle`
 * receive a fresh array.
 */
function shuffleWithPrng<T>(deck: T[], nextRandom: () => number): T[] {
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    const currentValue = shuffled[index]!;
    const otherValue = shuffled[swapIndex]!;
    shuffled[index] = otherValue;
    shuffled[swapIndex] = currentValue;
  }
  return shuffled;
}

/**
 * Wraps `advanceTurnStage` so it can sit in the MOVE_MAP dispatch slot.
 * The engine's `advanceStage` is a local function in `game.ts` and is
 * not exported; the WP-027 / WP-036 precedent rebuilds the equivalent
 * by calling `advanceTurnStage` directly.
 */
function fixtureAdvanceStage(context: FixtureMoveContext): void {
  advanceTurnStage(context.G, {
    events: { endTurn: context.events.endTurn },
  });
}

// why: the three core move-name keys are sourced from CORE_MOVE_NAMES
// per WP-158 §Locked contract values. The non-null assertions are safe
// because the canonical array is locked at exactly three entries by the
// drift-detection test in coreMoves.types.test.ts; if a future packet
// extends it, this file refuses to compile rather than silently drift.
// The seven non-core entries (advanceStage / revealVillainCard /
// fightVillain / recruitHero / fightMastermind / setPlayerReady /
// startMatchIfReady) use string literals because no canonical move-name
// array covers them — same pragmatic gap that simulation.runner.ts and
// replay.execute.ts already exhibit. The closed set of dispatchable
// names is enforced by the type system anyway: every entry corresponds
// to a directly imported move function. Unknown names throw via the
// runtime check in `dispatchSingleMove` below (NOT the warn-and-continue
// pattern from replay.execute.ts — that pattern is intentionally NOT
// adopted here per EC-172 §Guardrails — Validator strictness).
const DRAW_CARDS_MOVE = CORE_MOVE_NAMES[0]!;
const PLAY_CARD_MOVE = CORE_MOVE_NAMES[1]!;
const END_TURN_MOVE = CORE_MOVE_NAMES[2]!;

const MOVE_MAP: Record<string, MoveDispatch> = {
  [DRAW_CARDS_MOVE]: (context, args) =>
    drawCards(context as never, args as never),
  [PLAY_CARD_MOVE]: (context, args) =>
    playCard(context as never, args as never),
  [END_TURN_MOVE]: (context) => endTurn(context as never),
  advanceStage: (context) => fixtureAdvanceStage(context),
  revealVillainCard: (context) => revealVillainCard(context as never),
  fightVillain: (context, args) => fightVillain(context as never, args as never),
  recruitHero: (context, args) => recruitHero(context as never, args as never),
  fightMastermind: (context) => fightMastermind(context as never),
  setPlayerReady: (context, args) =>
    setPlayerReady(context as never, args as never),
  startMatchIfReady: (context) => startMatchIfReady(context as never),
};

/**
 * Constructs a `FixtureMoveContext` for a single move dispatch. The
 * `endTurnFlag` closure is the harness's substitute for the framework's
 * own turn-rotation machinery: move functions invoke
 * `context.events.endTurn()`, which flips the flag, and the dispatch
 * loop checks the flag after the move returns.
 */
function buildMoveContext(
  gameState: LegendaryGameState,
  playerId: string,
  turn: number,
  numPlayers: number,
  endTurnFlag: { triggered: boolean },
  nextRandom: () => number,
): FixtureMoveContext {
  return {
    G: gameState,
    playerID: playerId,
    ctx: {
      phase: 'play',
      turn,
      currentPlayer: playerId,
      numPlayers,
    },
    events: {
      // why: phase transitions are tracked externally by the harness; move
      // functions that call setPhase become no-ops. Matches the
      // replay.execute.ts (D-0205) and simulation.runner.ts dispatch shape.
      setPhase: () => {},
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
 * Per-run mutable cursor tracking external turn state that the
 * framework would otherwise own (current seat, turn counter,
 * completed-turn counter, accumulated snapshots, terminal endgame
 * outcome).
 */
interface RunCursor {
  currentPlayer: string;
  turn: number;
  completedTurnCount: number;
  readonly snapshotPerTurn: MatchSnapshot[];
  endgameOutcome: EndgameResult | null;
}

/**
 * Captures and normalises a per-turn snapshot. The frozen
 * `Readonly<MatchSnapshot>` returned by `createSnapshot` carries a
 * wall-clock `snapshotAt` value (see `snapshot.create.ts` — permitted
 * because that file is not under `packages/game-engine/src/test/fixtures/**`),
 * which would defeat fixture determinism. The harness replaces it with
 * a deterministic value sourced from `fixture.meta.createdAt`, which
 * the operator supplied at record time and which is preserved verbatim
 * across runs. Per-turn snapshots therefore all share the same
 * `snapshotAt` — semantically "this is the wall-clock the fixture was
 * recorded at," not "this exact turn happened at."
 */
function captureNormalisedSnapshot(
  gameState: LegendaryGameState,
  cursor: RunCursor,
  fixture: FixtureFile,
): MatchSnapshot {
  const rawSnapshot = createSnapshot(
    gameState,
    {
      turn: cursor.turn,
      phase: 'play',
      currentPlayer: cursor.currentPlayer,
    },
    fixture.name,
  );
  return { ...rawSnapshot, snapshotAt: fixture.meta.createdAt };
}

/**
 * Rotates the cursor to the next seat in `playerOrder`, increments the
 * turn counter, resets `G.currentStage` to the first canonical stage,
 * and zeroes `G.turnEconomy`. Mirrors the work the framework's
 * play-phase `onBegin` hook performs at the start of each new turn.
 */
function rotateToNextTurn(
  gameState: LegendaryGameState,
  cursor: RunCursor,
  playerOrder: readonly string[],
  numPlayers: number,
): void {
  const currentSeatIndex = playerOrder.indexOf(cursor.currentPlayer);
  const nextSeatIndex = (currentSeatIndex + 1) % numPlayers;
  cursor.currentPlayer = playerOrder[nextSeatIndex]!;
  cursor.turn += 1;
  cursor.completedTurnCount += 1;
  gameState.currentStage = TURN_STAGES[0]!;
  gameState.turnEconomy = resetTurnEconomy();
  // why: mirror the play phase onBegin reset of the once-per-turn villain
  // reveal allowance (WP-212). Without it the harness leaves a stale true flag
  // across the turn boundary and the wrapper guard wrongly blocks the next
  // player's legitimate first-of-turn reveal, diverging from real play.
  gameState.villainRevealedThisTurn = false;
}

/**
 * Dispatches a single move and updates the cursor + game state. Returns
 * after the move completes and any post-move bookkeeping (turn rotation
 * + snapshot capture) has run. Endgame evaluation is the caller's
 * responsibility because the caller decides whether to terminate the
 * outer loop.
 */
function dispatchSingleMove(
  gameState: LegendaryGameState,
  move: ReplayMove,
  moveIndex: number,
  cursor: RunCursor,
  fixture: FixtureFile,
  numPlayers: number,
  nextRandom: () => number,
): void {
  const moveDispatch = MOVE_MAP[move.moveName];
  if (moveDispatch === undefined) {
    throw new Error(
      `Fixture "${fixture.name}" references unknown move name "${move.moveName}" at input.moves[${moveIndex}]; add the move to MOVE_MAP or correct the fixture's move list.`,
    );
  }
  const endTurnFlag = { triggered: false };
  const moveContext = buildMoveContext(
    gameState,
    move.playerId,
    cursor.turn,
    numPlayers,
    endTurnFlag,
    nextRandom,
  );
  moveDispatch(moveContext, move.args);

  if (endTurnFlag.triggered) {
    rotateToNextTurn(gameState, cursor, fixture.input.playerOrder, numPlayers);
    const snapshot = captureNormalisedSnapshot(gameState, cursor, fixture);
    cursor.snapshotPerTurn.push(snapshot);
  }
}

/**
 * Runs the dispatch loop once. Builds a fresh `LegendaryGameState` via
 * `buildInitialGameState`, constructs a single mulberry32 PRNG bound
 * to `fixture.input.seed`, and dispatches each `ReplayMove` opaquely.
 *
 * Loop termination semantics:
 *   - If `evaluateEndgame(G)` returns non-null after a move, the
 *     remaining moves cause a full-sentence error (fixture-corruption
 *     signal — extra moves past endgame).
 *   - If the move list is exhausted without triggering endgame, the
 *     loop exits with `endgameOutcome === null`.
 *
 * The snapshot-count invariant
 * (`snapshotPerTurn.length === completedTurnCount`) is asserted at
 * end-of-run; a mismatch indicates a harness bug.
 */
function executeOnce(
  fixture: FixtureFile,
  registry: CardRegistryReader,
): FixtureRunResult {
  const numPlayers = fixture.input.playerCount;

  // why: exactly one mulberry32 PRNG instance is constructed per
  // executeOnce invocation, seeded from `hashSeedString(input.seed)`.
  // The seed-faithful pipeline is the D-0205-anticipated separate
  // harness — NOT a modification of `replay.execute.ts`, which remains
  // contract-locked as the determinism-only forensic tool.
  const seedInteger = hashSeedString(fixture.input.seed);
  const nextRandom = createMulberry32(seedInteger);

  const setupContext = makeMockCtx({ numPlayers });
  const gameState = buildInitialGameState(
    fixture.input.setupConfig,
    registry,
    setupContext,
  );

  const cursor: RunCursor = {
    currentPlayer: fixture.input.playerOrder[0]!,
    turn: 1,
    completedTurnCount: 0,
    snapshotPerTurn: [],
    endgameOutcome: null,
  };

  for (let moveIndex = 0; moveIndex < fixture.input.moves.length; moveIndex++) {
    if (cursor.endgameOutcome !== null) {
      // why: extra moves past `evaluateEndgame` returning non-null are a
      // fixture-corruption signal, not a soft warning. The recorder
      // terminates immediately on endgame; any moves[] past that point
      // mean the fixture was hand-edited (or the recorder over-captured)
      // and the harness must refuse to run rather than mask the drift.
      const remainingMoves = fixture.input.moves.length - moveIndex;
      throw new Error(
        `Fixture "${fixture.name}" has ${remainingMoves} moves past endgame at turn ${cursor.turn}; the dispatch loop must terminate immediately on non-null evaluateEndgame and the recorder must not capture moves past that point.`,
      );
    }
    const move = fixture.input.moves[moveIndex]!;
    dispatchSingleMove(
      gameState,
      move,
      moveIndex,
      cursor,
      fixture,
      numPlayers,
      nextRandom,
    );
    cursor.endgameOutcome = evaluateEndgame(gameState);
  }

  if (cursor.snapshotPerTurn.length !== cursor.completedTurnCount) {
    throw new Error(
      `Fixture "${fixture.name}" snapshot-count invariant violated: snapshotPerTurn.length is ${cursor.snapshotPerTurn.length} but completedTurnCount is ${cursor.completedTurnCount}; the harness has a snapshot-capture bug.`,
    );
  }

  const outcome: FixtureOutcome = {
    winner: cursor.endgameOutcome !== null ? cursor.endgameOutcome.outcome : null,
    counters: { ...gameState.counters },
  };

  // why: defensive shallow copy of G.messages per WP-028 / D-2802
  // aliasing-defense precedent. The harness's gameState is unreachable
  // after this function returns, but a caller mutating
  // `result.messages` (e.g., to filter for display) would otherwise
  // mutate the unreachable G's array. Copying at the projection
  // boundary makes the projection a true value, not an alias.
  const messages: string[] = [...gameState.messages];

  const finalStateHash = hashGameState(gameState);

  return {
    finalStateHash,
    messages,
    snapshotPerTurn: cursor.snapshotPerTurn,
    outcome,
  };
}

/**
 * Stable string-comparison of two arbitrary JSON-compatible values
 * using canonical key order. Used by the within-run double-run guard
 * to detect divergence between two in-process replays.
 */
function canonicaliseForCompare(value: unknown): string {
  return JSON.stringify(value, (_key, raw): unknown => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return raw;
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(raw as Record<string, unknown>).sort()) {
      sorted[key] = (raw as Record<string, unknown>)[key];
    }
    return sorted;
  });
}

/**
 * Executes the within-run double-run guard. Compares the four oracle
 * layers of two independent `executeOnce` invocations and throws a
 * full-sentence error if any layer diverges. Returns silently on
 * agreement.
 */
function assertDoubleRunAgreement(
  fixtureName: string,
  firstRun: FixtureRunResult,
  secondRun: FixtureRunResult,
): void {
  if (firstRun.finalStateHash !== secondRun.finalStateHash) {
    throw new Error(
      `Fixture "${fixtureName}" within-run determinism guard failed: finalStateHash diverged between two in-process replays (${firstRun.finalStateHash} vs ${secondRun.finalStateHash}); investigate hidden mutable state leakage between dispatches.`,
    );
  }
  if (canonicaliseForCompare(firstRun.messages) !== canonicaliseForCompare(secondRun.messages)) {
    throw new Error(
      `Fixture "${fixtureName}" within-run determinism guard failed: messages diverged between two in-process replays; investigate hidden mutable state leakage between dispatches.`,
    );
  }
  if (canonicaliseForCompare(firstRun.snapshotPerTurn) !== canonicaliseForCompare(secondRun.snapshotPerTurn)) {
    throw new Error(
      `Fixture "${fixtureName}" within-run determinism guard failed: snapshotPerTurn diverged between two in-process replays; investigate hidden mutable state leakage between dispatches.`,
    );
  }
  if (canonicaliseForCompare(firstRun.outcome) !== canonicaliseForCompare(secondRun.outcome)) {
    throw new Error(
      `Fixture "${fixtureName}" within-run determinism guard failed: outcome diverged between two in-process replays; investigate hidden mutable state leakage between dispatches.`,
    );
  }
}

/**
 * Replays a fixture against the engine and returns the trajectory
 * oracle. Internally executes the dispatch loop twice in-process and
 * asserts byte-identical results before returning — the within-run
 * determinism guard described in EC-172 §Guardrails.
 *
 * @param fixture - The validated fixture file (typically the output of
 *   `validateFixture(parsedJson, filenameBasename)`).
 * @param registry - Minimal `CardRegistryReader` stub. The harness does
 *   NOT read registry data at runtime; the stub is consumed only by
 *   `buildInitialGameState` at setup time.
 * @returns The trajectory oracle: `finalStateHash`, `messages[]`,
 *   `snapshotPerTurn[]`, `outcome`.
 * @throws {Error} If the within-run double-run guard detects divergence,
 *   if a move name is not in MOVE_MAP, if extra moves appear past
 *   endgame, or if the snapshot-count invariant is violated.
 */
export function runFixture(
  fixture: FixtureFile,
  registry: CardRegistryReader,
): FixtureRunResult {
  const firstRun = executeOnce(fixture, registry);

  // why: second in-process replay is the within-run determinism guard
  // against PRNG state leakage between dispatches, accidental
  // module-level mutable state, or move functions that read process-wide
  // singletons. Catches bugs that would otherwise only surface on retry.
  const secondRun = executeOnce(fixture, registry);

  assertDoubleRunAgreement(fixture.name, firstRun, secondRun);

  return firstRun;
}
