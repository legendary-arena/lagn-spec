/**
 * Tests for `simulateOneGameAndCaptureMoves` (WP-193).
 *
 * Covers the move-capturing simulation entry point that the recorder's
 * `--policy` mode consumes. The captured `ReplayMove[]` is the recorder's
 * input to `runFixture` — the single oracle source (D-19301) — so these
 * tests pin (a) capture-path determinism, (b) PRNG-stream parity with
 * `runSimulation`'s game 0, (c) round-trip outcome equality through
 * `runFixture`, (d) `endgameReached` stability, (e) field-set drift on
 * both new exported types, and (f) the dispatch-order invariant via a
 * spy policy.
 *
 * No boardgame.io imports. No @legendary-arena/registry imports. No
 * `Math.random()`. No private-helper invocation (`hashSeedString` /
 * `createMulberry32` are NOT imported — cross-path determinism is proven
 * indirectly via the round-trip + outcome-equality test, per WP-193
 * §Non-Negotiable Constraints — "PRNG construction parity").
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import type { UIState } from '../ui/uiState.types.js';
import type { ClientTurnIntent } from '../network/intent.types.js';
import type { AIPolicy, LegalMove } from './ai.types.js';
import type { FixtureFile } from '../test/fixtures/fixtureSchema.js';
import type { ReplayMove } from '../replay/replay.types.js';
import type { LegendaryGameState } from '../types.js';
import type { HollowEffectRecord } from '../diagnostics/hollowEffect.types.js';

import { createRandomPolicy } from './ai.random.js';
import {
  runSimulation,
  simulateOneGameAndCaptureMoves,
  captureGameDiagnostics,
  type CapturedGameResult,
  type CapturedOutcomeSummary,
} from './simulation.runner.js';
import { runFixture } from '../test/fixtures/runFixture.js';
import { validateFixture } from '../test/fixtures/fixtureSchema.js';

/**
 * Builds a valid 9-field MatchSetupConfig fixture for capture tests.
 *
 * Mirrors `createTestConfig` in `simulation.test.ts` so the fixture
 * semantics stay aligned with the canonical simulation test pattern.
 */
function createTestConfig(): MatchSetupConfig {
  return {
    schemeId: 'test-scheme-001',
    mastermindId: 'test-mastermind-001',
    villainGroupIds: ['test-villain-group-001'],
    henchmanGroupIds: ['test-henchman-group-001'],
    heroDeckIds: ['test-hero-deck-001', 'test-hero-deck-002'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  };
}

/**
 * Minimal CardRegistryReader returning an empty card list.
 *
 * Same stub used by `simulation.test.ts`. `buildInitialGameState` handles
 * narrow mocks gracefully — the registry-guard branches emit deterministic
 * "skipped: registry-reader interface incomplete" diagnostics rather than
 * throwing.
 */
function createMockRegistry(): CardRegistryReader {
  return {
    listCards: () => [],
  };
}

/**
 * Comparable form of a ReplayMove for byte-equality assertions.
 *
 * JSON serialisation collapses `undefined` to omission, which matters for
 * the spy-vs-capture comparison: the spy stores raw `intent.move.args`
 * and the capture stores the same `intent.move.args` reference. Direct
 * `deepEqual` would already pass — `toComparable` is defensive so the
 * assertion remains robust if either side ever reshuffles fields.
 */
function toComparable(move: ReplayMove): string {
  return JSON.stringify({
    playerId: move.playerId,
    moveName: move.moveName,
    args: move.args ?? null,
  });
}

/**
 * Builds a recording-spy AIPolicy that wraps a backing policy and stores
 * every decision in the supplied sink. The wrapper preserves the backing
 * policy's behaviour byte-for-byte; recording happens after `decideTurn`
 * returns so the wrapped result reaches the simulation runner unchanged.
 */
function createSpyPolicy(
  backing: AIPolicy,
  sink: ReplayMove[],
): AIPolicy {
  return {
    name: `spy(${backing.name})`,
    decideTurn(view: UIState, legalMoves: LegalMove[]): ClientTurnIntent {
      const intent = backing.decideTurn(view, legalMoves);
      sink.push({
        playerId: intent.playerId,
        moveName: intent.move.name,
        args: intent.move.args,
      });
      return intent;
    },
  };
}

/**
 * Assembles a `FixtureFile` from a captured `ReplayMove[]` so the
 * round-trip test can hand it to `runFixture`. Mirrors the structure
 * `recordFromInput` in `scripts/record-game-fixture.mjs` produces, with
 * a placeholder `expected` block (the real expected block is what
 * `runFixture` produces — these tests do not write fixtures to disk).
 *
 * The fixture's `name` field MUST equal the `filenameBasename` argument
 * `validateFixture` is called with; the round-trip test uses
 * `"wp193-roundtrip"` for both.
 */
function buildFixtureFromCapture(
  capturedMoves: readonly ReplayMove[],
  seed: string,
  setupConfig: MatchSetupConfig,
  playerCount: number,
  fixtureName: string,
): FixtureFile {
  const playerOrder: string[] = [];
  for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
    playerOrder.push(String(seatIndex));
  }
  const skeleton = {
    name: fixtureName,
    meta: {
      version: 1 as const,
      createdAt: '2026-05-31T00:00:00.000Z',
      engineVersion: 'wp193-test',
    },
    input: {
      seed,
      playerCount,
      playerOrder,
      setupConfig,
      moves: capturedMoves.map((move) => ({
        playerId: move.playerId,
        moveName: move.moveName,
        args: move.args,
      })),
    },
    expected: {
      finalStateHash:
        '0000000000000000000000000000000000000000000000000000000000000000',
      messages: [] as string[],
      snapshotPerTurn: [],
      outcome: {
        winner: null,
        counters: {},
      },
    },
  };
  return validateFixture(skeleton, fixtureName);
}

describe('simulateOneGameAndCaptureMoves (WP-193)', () => {
  test('returns a non-empty moves array for the sentinel-style 2-seat random-policy setup', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-non-empty-trace-seed';
    const policies: AIPolicy[] = [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const captured = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      policies,
      seed,
      0,
    );

    assert.equal(
      captured.moves.length > 0,
      true,
      'captured trace must be non-empty for a runnable setup',
    );
  });

  test('is deterministic across two invocations with identical inputs', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-determinism-seed';
    const buildPolicies = (): AIPolicy[] => [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const first = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
    );
    const second = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
    );

    assert.deepEqual(
      first,
      second,
      'identical (setupConfig, registry, policies, seed, gameIndex) must produce deep-equal CapturedGameResult',
    );
  });

  test('PRNG-stream parity with runSimulation: one-game runSimulation aggregate fields agree with the captured outcome', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-prng-parity-seed';
    const policies: AIPolicy[] = [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const aggregate = runSimulation(
      { games: 1, seed, setupConfig, policies },
      registry,
    );
    const fresh: AIPolicy[] = [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];
    const captured = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      fresh,
      seed,
      0,
    );

    // why: the observable fields must agree because both paths construct
    // mulberry32 fresh from `hashSeedString(seed)` and dispatch through
    // the same per-turn loop. Disagreement means the capture side-channel
    // perturbed PRNG state.
    assert.equal(
      aggregate.winRate === 1,
      captured.outcome.winner === 'heroes-win',
      'aggregate winRate === 1 must iff captured.outcome.winner === "heroes-win"',
    );
    assert.equal(
      aggregate.escapedVillainsAverage,
      captured.outcome.escapedVillains,
      'aggregate escapedVillainsAverage must equal captured.outcome.escapedVillains for a one-game run',
    );
  });

  test('round-trip via runFixture: captured ReplayMove[] replays to a FixtureRunResult whose outcome equals the captured outcome', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-roundtrip-seed';
    const policies: AIPolicy[] = [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const captured = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      policies,
      seed,
      0,
    );

    const fixture = buildFixtureFromCapture(
      captured.moves,
      seed,
      setupConfig,
      2,
      'wp193-roundtrip',
    );
    const replay = runFixture(fixture, registry);

    // why: this is the load-bearing cross-path determinism contract. If
    // either path's PRNG construction drifts, the captured moves will
    // reference cards in zones runFixture has not drawn yet (or vice
    // versa), and runFixture will fail loudly. Outcome field-equality
    // confirms both sides reached the same terminal state.
    assert.equal(
      replay.outcome.winner,
      captured.outcome.winner,
      'runFixture outcome.winner must equal CapturedOutcomeSummary.winner after round-trip',
    );
  });

  test('endgameReached is stable across repeated runs with identical inputs', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-endgame-stability-seed';
    const buildPolicies = (): AIPolicy[] => [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const first = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
    );
    const second = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
    );

    // why: WP-193 does not pin a specific endgameReached value (the chosen
    // setup may or may not reach endgame under MAX_TURNS_PER_GAME = 200).
    // What it pins is determinism: same inputs → same value. The cap-hit
    // classification is WP-195's seam.
    assert.equal(
      first.endgameReached,
      second.endgameReached,
      'endgameReached must be deterministic across identical invocations',
    );
  });

  test('field-set drift: CapturedGameResult has exactly { endgameReached, hollowEffects, hollowEffectsDropped, moves, outcome }; CapturedOutcomeSummary has exactly { escapedVillains, winner }', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-field-set-drift-seed';
    const policies: AIPolicy[] = [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const captured: CapturedGameResult = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      policies,
      seed,
      0,
    );

    // why (Issue 4 fix): pins the exact field sets at runtime so a future
    // PR silently adding a fourth field fails this assertion. Mirrors the
    // canonical readonly-array drift-detection discipline used elsewhere
    // in the project.
    const capturedKeys = Object.keys(captured).sort();
    // why (WP-263): the two additive sibling fields join the drift gate so a
    // future silent field add still trips it. CapturedOutcomeSummary stays
    // narrow (diagnostics are siblings, never nested into it).
    assert.deepEqual(capturedKeys, [
      'endgameReached',
      'hollowEffects',
      'hollowEffectsDropped',
      'moves',
      'outcome',
    ]);

    const summary: CapturedOutcomeSummary = captured.outcome;
    const summaryKeys = Object.keys(summary).sort();
    assert.deepEqual(summaryKeys, ['escapedVillains', 'winner']);
  });

  test('dispatch-order invariant: captured moves are byte-equal to the spy policy decision sequence', () => {
    // why (Issue 11 fix): the round-trip + outcome-equality test catches
    // the gross failure where capture happens before dispatch. This
    // assertion catches the subtler regression where the capture order
    // diverges from the dispatch order (e.g., out-of-order callback
    // invocation, async drift). The spy wraps the random policy and
    // records each decision; the captured trace must equal that sequence
    // byte-for-byte.
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp193-dispatch-order-seed';

    const decisionLog: ReplayMove[] = [];
    const policies: AIPolicy[] = [
      createSpyPolicy(createRandomPolicy(`${seed}::seat:0`), decisionLog),
      createSpyPolicy(createRandomPolicy(`${seed}::seat:1`), decisionLog),
    ];

    const captured = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      policies,
      seed,
      0,
    );

    const capturedComparable = captured.moves.map(toComparable);
    const decisionComparable = decisionLog.map(toComparable);

    // why: must-never-happen: captured move order diverges from dispatch
    // order. A divergence shorter-than-decisions tail is acceptable (the
    // spy records all decisions, including a stuck-endTurn final
    // decision that the runner deliberately omits from the captured
    // trace); the captured prefix must equal the decision prefix.
    assert.equal(
      capturedComparable.length <= decisionComparable.length,
      true,
      'captured moves length must not exceed decision sequence length',
    );
    const decisionPrefix = decisionComparable.slice(
      0,
      capturedComparable.length,
    );
    assert.deepEqual(
      capturedComparable,
      decisionPrefix,
      'captured moves must byte-equal the dispatched-decision prefix',
    );
  });
});

describe('simulateOneGameAndCaptureMoves — hollow-effect diagnostics (WP-263)', () => {
  test('surfaces the finished game hollow diagnostics; empty under the mock registry', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();
    const seed = 'wp263-capture-hollow-seed';
    const policies: AIPolicy[] = [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const captured = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      policies,
      seed,
      0,
    );

    // why (WP-263): the mock registry has no real cards, so no hollow effect
    // is recorded — the additive fields exist and default to []/0. The
    // populated path is proven by the captureGameDiagnostics unit tests below.
    assert.deepEqual(captured.hollowEffects, []);
    assert.equal(captured.hollowEffectsDropped, 0);
  });

  test('both degenerate early returns carry []/0', () => {
    const setupConfig = createTestConfig();
    const registry = createMockRegistry();

    const emptySeed = simulateOneGameAndCaptureMoves(setupConfig, registry, [], '', 0);
    assert.deepEqual(emptySeed.hollowEffects, []);
    assert.equal(emptySeed.hollowEffectsDropped, 0);

    const noPolicies = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      [],
      'wp263-degenerate-seed',
      0,
    );
    assert.deepEqual(noPolicies.hollowEffects, []);
    assert.equal(noPolicies.hollowEffectsDropped, 0);
  });
});

describe('captureGameDiagnostics (WP-263)', () => {
  const makeRecord = (): HollowEffectRecord => ({
    cardId: 'core/hero-phantom',
    cardType: 'hero',
    timing: 'onPlay',
    mechanic: 'phantom-mechanic',
    reason: 'no-handler',
    turn: 3,
  });

  test('reads a populated G.diagnostics channel: exact records + dropped count', () => {
    const record = makeRecord();
    const gameState = {
      diagnostics: { hollowEffects: [record], hollowEffectsDropped: 2 },
    } as unknown as LegendaryGameState;

    const captured = captureGameDiagnostics(gameState);

    assert.deepEqual(captured.hollowEffects, [record]);
    assert.equal(captured.hollowEffectsDropped, 2);
  });

  test('an absent diagnostics channel reads as []/0 (lazy-init not yet triggered)', () => {
    const gameState = {} as unknown as LegendaryGameState;

    const captured = captureGameDiagnostics(gameState);

    assert.deepEqual(captured.hollowEffects, []);
    assert.equal(captured.hollowEffectsDropped, 0);
  });

  test('returns a fresh shallow copy — mutating the result leaves the source channel untouched', () => {
    const source = {
      hollowEffects: [makeRecord()],
      hollowEffectsDropped: 0,
    };
    const gameState = { diagnostics: source } as unknown as LegendaryGameState;

    const captured = captureGameDiagnostics(gameState);
    // why (WP-263): the projection must hold no reference into the sim G —
    // growing the returned array must not grow the source channel.
    (captured.hollowEffects as HollowEffectRecord[]).push(makeRecord());

    assert.equal(captured.hollowEffects.length, 2);
    assert.equal(
      source.hollowEffects.length,
      1,
      'the source diagnostics channel must be unmodified',
    );
  });
});

describe('simulateOneGameAndCaptureMoves — maxTurns turn cap (WP-264)', () => {
  const setupConfig = createTestConfig();
  const registry = createMockRegistry();

  test('a small maxTurns bounds the captured trace (moves.length <= the uncapped run)', () => {
    const seed = 'wp264-bound-respected-seed';
    const buildPolicies = (): AIPolicy[] => [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const capped = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
      5,
    );
    const uncapped = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
    );

    // why (WP-264): CapturedGameResult exposes no turn-count field (its set is
    // drift-locked to { endgameReached, hollowEffects, hollowEffectsDropped,
    // moves, outcome }), so the bound is asserted on moves.length only. The
    // 2-seat random fixture never reaches endgame under the mock registry, so
    // the uncapped run spins to the 200 safety cap and a cap of 5 bounds it.
    assert.equal(
      capped.moves.length <= uncapped.moves.length,
      true,
      'a maxTurns of 5 must bound the captured trace at or below the uncapped run',
    );
  });

  test('default-equivalence: omitting maxTurns deep-equals passing the literal 200 (gameIndex 0)', () => {
    const seed = 'wp264-default-equivalence-g0-seed';
    const buildPolicies = (): AIPolicy[] => [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    const omitted = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
    );
    // why (WP-264): MAX_TURNS_PER_GAME is module-local (not exported), so the
    // default-equivalence assertion uses the literal 200 rather than the const.
    const explicit = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      0,
      200,
    );

    assert.deepStrictEqual(omitted, explicit);
  });

  test('default-equivalence at gameIndex 1 exercises warm-up forwarding (omit === literal 200)', () => {
    const seed = 'wp264-default-equivalence-g1-seed';
    const buildPolicies = (): AIPolicy[] => [
      createRandomPolicy(`${seed}::seat:0`),
      createRandomPolicy(`${seed}::seat:1`),
    ];

    // why (WP-264): gameIndex = 1 runs one warm-up game before the captured
    // game, so this proves the warm-up loop forwards the same maxTurns and the
    // PRNG stream stays in parity (a gameIndex = 0 run collapses the warm-up to
    // a no-op and never exercises the forwarding path).
    const omitted = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      1,
    );
    const explicit = simulateOneGameAndCaptureMoves(
      setupConfig,
      registry,
      buildPolicies(),
      seed,
      1,
      200,
    );

    assert.deepStrictEqual(omitted, explicit);
  });
});
