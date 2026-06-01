#!/usr/bin/env node
/**
 * CLI recorder for the complete-game regression harness (WP-158, WP-193).
 *
 * Produces a `*.replay.json` fixture from either an explicit input-block
 * JSON file (`--input` mode, WP-158) or a captured simulation trace
 * (`--policy random|heuristic --setup <path>` mode, WP-193). Both modes
 * call `runFixture` for dispatch — duplicating the dispatch loop is
 * FORBIDDEN by EC-172 §Guardrails (Determinism integrity). The `--policy`
 * mode uses simulation as a move generator only and routes the captured
 * `ReplayMove[]` through `recordFromInput` so the path converges with
 * `--input` mode at `validateFixture → runFixture → writeFixtureFile`.
 *
 * Required CLI flags:
 *   --name <fixture-name>          (REQUIRED)
 *   --seed <seed-string>           (REQUIRED; or inherited from --input fixture)
 *   --created-at <ISO 8601>        (REQUIRED; or inherited from --input fixture meta)
 *   --engine-version <string>      (REQUIRED; or inherited from --input fixture meta)
 *   --input <path>                 (one of two modes)
 *   --policy random|heuristic --setup <path>   (the other mode; WP-193)
 *   --max-moves <N>                (optional; default 10000)
 *
 * Constraints honored: no Math randomness, no wall-clock reads, no
 * monotonic-clock reads, no Date construction, no `process.env`
 * reads, no `git` shell-outs. All time and version data flow through
 * `process.argv` (the standard Node CLI surface) or come from the
 * source fixture's meta block.
 *
 * Output: byte-stable canonical JSON written to
 * `packages/game-engine/src/test/fixtures/games/<name>.replay.json`.
 * Identical inputs produce byte-identical output across machines and
 * Node v22 patch versions.
 *
 * Run from the repository root after `pnpm -r build` has produced
 * `packages/game-engine/dist/test/fixtures/runFixture.js` and
 * `packages/game-engine/dist/simulation/simulation.runner.js`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFixture } from '../packages/game-engine/dist/test/fixtures/runFixture.js';
import { validateFixture } from '../packages/game-engine/dist/test/fixtures/fixtureSchema.js';
import { simulateOneGameAndCaptureMoves } from '../packages/game-engine/dist/simulation/simulation.runner.js';
import { createRandomPolicy } from '../packages/game-engine/dist/simulation/ai.random.js';
import { createCompetentHeuristicPolicy } from '../packages/game-engine/dist/simulation/ai.competent.js';

// why: __dirname is unavailable in ESM; reconstruct via import.meta.url
// to anchor the output directory relative to the recorder script
// regardless of the cwd it is invoked from.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const FIXTURES_DIRECTORY = join(
  REPO_ROOT,
  'packages',
  'game-engine',
  'src',
  'test',
  'fixtures',
  'games',
);

// why: 10000 is well above any plausible fixture length (a complete
// game is ~50–200 moves). The cap exists to surface infinite-loop
// autoplay policies and runaway hand-written move lists with a
// full-sentence error rather than running indefinitely.
const DEFAULT_MAX_MOVES = 10000;

// why (D-19303 locked separator): `::seat:` is the literal seat-derived
// seed separator. All four characters appear verbatim in the recorder
// source so the source-level grep gate from EC-220 passes; the recorder
// MUST NOT paraphrase or abbreviate this segment. Per-seat seeds are the
// decorrelation mechanism that preserves determinism while preventing
// correlated PRNG streams across seats (which would yield identical
// tie-breaks at identical filtered UIStates under one policy family).
const SEAT_SEED_SEPARATOR = '::seat:';

/**
 * Parses argv into a flag map. Accepts `--flag value` pairs only;
 * boolean flags are not used by this recorder. Unrecognised flags
 * raise a full-sentence error before any work begins.
 */
function parseArguments(argv) {
  const recognisedFlags = new Set([
    '--name',
    '--seed',
    '--created-at',
    '--engine-version',
    '--input',
    '--policy',
    '--setup',
    '--max-moves',
  ]);
  const parsed = {};
  let cursor = 0;
  while (cursor < argv.length) {
    const flag = argv[cursor];
    if (!recognisedFlags.has(flag)) {
      throw new Error(
        `Recorder received unrecognised CLI flag "${flag}"; expected one of ${[...recognisedFlags].join(', ')}.`,
      );
    }
    const value = argv[cursor + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(
        `Recorder flag "${flag}" requires a value; received ${value === undefined ? 'end-of-arguments' : `another flag "${value}"`}.`,
      );
    }
    parsed[flag] = value;
    cursor += 2;
  }
  return parsed;
}

/**
 * Reads a JSON file from disk and parses it. Throws a full-sentence
 * error on missing file, unreadable file, or invalid JSON.
 */
async function readJsonFile(filePath, description) {
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Recorder failed to read ${description} from "${filePath}": ${error.message}. Verify the path is correct and the file is readable.`,
    );
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Recorder failed to parse ${description} at "${filePath}" as JSON: ${error.message}. Verify the file contains valid JSON.`,
    );
  }
}

/**
 * Extracts the input block from either a bare-input file (top-level
 * fields are seed/playerCount/etc.) or a full fixture file (top-level
 * has `input` block + `meta` block). Returns the input block plus
 * any inheritable meta fields the source supplied.
 */
function extractInputAndInheritedMeta(parsedJson, sourcePath) {
  if (parsedJson === null || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
    throw new Error(
      `Recorder source file "${sourcePath}" is not a JSON object at the top level.`,
    );
  }
  const looksLikeFullFixture =
    typeof parsedJson.input === 'object' && parsedJson.input !== null;
  if (looksLikeFullFixture) {
    const inheritedMeta = (typeof parsedJson.meta === 'object' && parsedJson.meta !== null) ? parsedJson.meta : {};
    return {
      input: parsedJson.input,
      inheritedCreatedAt: typeof inheritedMeta.createdAt === 'string' ? inheritedMeta.createdAt : undefined,
      inheritedEngineVersion: typeof inheritedMeta.engineVersion === 'string' ? inheritedMeta.engineVersion : undefined,
      inheritedSeed: typeof parsedJson.input.seed === 'string' ? parsedJson.input.seed : undefined,
    };
  }
  return {
    input: parsedJson,
    inheritedCreatedAt: undefined,
    inheritedEngineVersion: undefined,
    inheritedSeed: typeof parsedJson.seed === 'string' ? parsedJson.seed : undefined,
  };
}

/**
 * Validates that the input block carries the four shape fields the
 * harness consumes (seed, playerCount, playerOrder, setupConfig,
 * moves). Detailed validation runs later inside `validateFixture`
 * once the full fixture is assembled; this is the early bail-out.
 */
function assertInputShape(input, sourcePath) {
  if (typeof input.seed !== 'string' || input.seed.length === 0) {
    throw new Error(
      `Recorder source at "${sourcePath}" is missing input.seed (non-empty string); a deterministic seed is required for replay.`,
    );
  }
  if (typeof input.playerCount !== 'number') {
    throw new Error(
      `Recorder source at "${sourcePath}" is missing input.playerCount (positive integer); the harness needs the seat count for setup.`,
    );
  }
  if (!Array.isArray(input.playerOrder)) {
    throw new Error(
      `Recorder source at "${sourcePath}" is missing input.playerOrder (string array of seat ids); the harness needs the seat order for rotation.`,
    );
  }
  if (typeof input.setupConfig !== 'object' || input.setupConfig === null) {
    throw new Error(
      `Recorder source at "${sourcePath}" is missing input.setupConfig (the 9-field MatchSetupConfig); the harness needs it to call buildInitialGameState.`,
    );
  }
  if (!Array.isArray(input.moves)) {
    throw new Error(
      `Recorder source at "${sourcePath}" is missing input.moves (array of ReplayMove records); a (possibly empty) array is required.`,
    );
  }
}

/**
 * Canonical-JSON `JSON.stringify` replacer that sorts object keys
 * lexicographically. Arrays preserve order. Mirrors the rule used by
 * `hashGameState.ts` so the fixture file written to disk has stable
 * byte order across machines.
 */
function canonicalReplacer(_key, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted;
}

/**
 * Serialises an assembled fixture to canonical pretty-printed JSON
 * suitable for `git diff` review. Two-space indent, sorted keys,
 * trailing newline.
 */
function serialiseFixture(fixture) {
  return `${JSON.stringify(fixture, canonicalReplacer, 2)}\n`;
}

/**
 * Resolves the four operator-supplied meta fields with this priority:
 *   1. CLI flag value, when present
 *   2. Inherited value from source-file meta or input.seed
 *   3. Throw a full-sentence error if neither path supplies it
 *
 * Why: the recorder is forbidden from reading the wall-clock,
 * constructing a Date, reading `process.env`, or shelling to git per
 * WP-158 §Non-Negotiable Constraints. The operator supplies these
 * values either via CLI flags or by passing an existing fixture
 * (whose meta block carries them) as `--input`. The latter path
 * covers the byte-stability verification scenario in WP-158
 * Verification Step 3.
 */
function resolveOperatorMeta(parsedArgs, inherited) {
  const name = parsedArgs['--name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(
      'Recorder is missing --name; supply a non-empty fixture name (it becomes both the file basename and the fixture.name field).',
    );
  }
  const seed = parsedArgs['--seed'] ?? inherited.inheritedSeed;
  if (typeof seed !== 'string' || seed.length === 0) {
    throw new Error(
      'Recorder is missing --seed; supply a non-empty seed string via --seed or pass an --input file whose input.seed is populated.',
    );
  }
  const createdAt = parsedArgs['--created-at'] ?? inherited.inheritedCreatedAt;
  if (typeof createdAt !== 'string' || createdAt.length === 0) {
    throw new Error(
      'Recorder is missing --created-at; supply an ISO 8601 timestamp via --created-at or pass an --input fixture whose meta.createdAt is populated. The recorder must NOT read the wall-clock.',
    );
  }
  const engineVersion =
    parsedArgs['--engine-version'] ?? inherited.inheritedEngineVersion;
  if (typeof engineVersion !== 'string' || engineVersion.length === 0) {
    throw new Error(
      'Recorder is missing --engine-version; supply a git SHA or semver string via --engine-version or pass an --input fixture whose meta.engineVersion is populated. The recorder must NOT shell out to git.',
    );
  }
  return { name, seed, createdAt, engineVersion };
}

/**
 * Resolves and validates `--max-moves`. Defaults to
 * `DEFAULT_MAX_MOVES` (10000). The cap is checked against the
 * fixture's actual move count after the fixture is assembled, so the
 * value only needs basic non-negative-integer shape validation here.
 */
function resolveMaxMoves(parsedArgs) {
  if (parsedArgs['--max-moves'] === undefined) {
    return DEFAULT_MAX_MOVES;
  }
  const parsed = Number(parsedArgs['--max-moves']);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `Recorder received --max-moves "${parsedArgs['--max-moves']}" which is not a positive integer; supply a value like --max-moves 10000.`,
    );
  }
  return parsed;
}

/**
 * Throws if the move list exceeds the operator-supplied cap. The
 * full-sentence error names the fixture, the seed, and the move count
 * for actionable forensic triage when autoplay policies fail to
 * terminate.
 */
// why: infinite-loop guard for autoplay policies that fail to
// terminate. Hand-written fixtures rarely trip this (they are finite by
// construction); under `--policy` mode (WP-193) it meaningfully fires
// when a policy + setup combination loops the simulation past the cap.
function assertMoveCountUnderCap(input, fixtureName, maxMoves) {
  if (input.moves.length > maxMoves) {
    throw new Error(
      `Recorder fixture "${fixtureName}" with seed "${input.seed}" has ${input.moves.length} moves at the current turn, exceeding --max-moves cap ${maxMoves}; raise the cap or shorten the move list.`,
    );
  }
}

/**
 * Minimal `CardRegistryReader` stub. The harness MUST NOT import
 * `@legendary-arena/registry`; the recorder constructs the same
 * empty-result stub used by `replay.execute.test.ts` and
 * `simulation.test.ts`. `buildInitialGameState` accepts this stub
 * gracefully (per the four `isXRegistryReader` guards) and emits a
 * deterministic set of "skipped: registry-reader interface
 * incomplete" diagnostics that land in `G.messages`.
 */
const EMPTY_REGISTRY = {
  listCards: () => [],
  listSets: () => [],
  getSet: () => undefined,
};

/**
 * Validates the setup envelope JSON loaded from `--setup`. Mirrors the
 * canonical shape `apps/arena-client/public/loadout-test.json` uses
 * (schemaVersion / playerCount / heroSelectionMode / composition).
 * Returns `{ composition, playerCount }`; `heroSelectionMode` is read
 * but not consumed by v1 (the engine's setup pipeline already handles
 * the `GROUP_STANDARD` default per D-9301).
 */
function validateSetupEnvelope(parsed, sourcePath) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Recorder setup envelope at "${sourcePath}" is not a JSON object at the top level; expected the canonical { schemaVersion, playerCount, heroSelectionMode, composition } shape.`,
    );
  }
  if (parsed.schemaVersion !== '1.0') {
    throw new Error(
      `Recorder setup envelope at "${sourcePath}" has schemaVersion ${JSON.stringify(parsed.schemaVersion)}; only schemaVersion "1.0" is supported.`,
    );
  }
  if (
    typeof parsed.playerCount !== 'number' ||
    !Number.isInteger(parsed.playerCount) ||
    parsed.playerCount < 1 ||
    parsed.playerCount > 5
  ) {
    throw new Error(
      `Recorder setup envelope at "${sourcePath}" has playerCount ${JSON.stringify(parsed.playerCount)}; expected an integer between 1 and 5.`,
    );
  }
  if (typeof parsed.composition !== 'object' || parsed.composition === null || Array.isArray(parsed.composition)) {
    throw new Error(
      `Recorder setup envelope at "${sourcePath}" is missing a composition object (the 9-field MatchSetupConfig); buildInitialGameState requires this payload.`,
    );
  }
  return {
    composition: parsed.composition,
    playerCount: parsed.playerCount,
  };
}

/**
 * Builds the per-seat policy list for `--policy` mode. One policy
 * family across all seats; each seat receives a deterministic
 * seat-derived seed.
 */
// why (D-19303): one policy *family* across all seats with seat-derived
// deterministic seeds. Per-seat policy *family* heterogeneity (random
// vs heuristic head-to-head) is WP-194's seam. The seat-derived seed
// `${operatorSeed}::seat:${i}` preserves determinism while decorrelating
// seat-local PRNG streams — identical legal-move sets at identical
// filtered UIStates would otherwise produce identical tie-breaks at every
// seat under one family. The literal separator `::seat:` is part of the
// locked contract (SEAT_SEED_SEPARATOR above carries the verbatim string).
function buildPolicyList(policyName, operatorSeed, playerCount) {
  const policies = [];
  if (policyName === 'random') {
    for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
      const seatSeed = `${operatorSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`;
      policies.push(createRandomPolicy(seatSeed));
    }
    return policies;
  }
  if (policyName === 'heuristic') {
    for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
      const seatSeed = `${operatorSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`;
      policies.push(createCompetentHeuristicPolicy(seatSeed));
    }
    return policies;
  }
  throw new Error(
    `Recorder --policy received unrecognised value "${policyName}"; expected exactly one of "random" or "heuristic" (no fallback).`,
  );
}

/**
 * Derives the deterministic playerOrder for `--policy` mode.
 */
// why: the locked seat-ordering convention is
// `["0", "1", …, String(playerCount - 1)]`. Simulation already starts
// post-lobby at `phase = 'play'` with `currentPlayer = '0'`, and
// `runFixture` rotates through this exact sequence; deriving playerOrder
// here matches both paths and keeps the captured fixture replayable
// without operator-supplied seat ids.
function derivePlayerOrder(playerCount) {
  const playerOrder = [];
  for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
    playerOrder.push(String(seatIndex));
  }
  return playerOrder;
}

/**
 * Records a fixture from a parsed input block and operator-supplied
 * meta. Calls `validateFixture` to confirm shape, then `runFixture` to
 * produce the trajectory oracle, then assembles and serialises the
 * fixture file.
 */
function recordFromInput(input, operatorMeta) {
  const fixtureSkeleton = {
    name: operatorMeta.name,
    meta: {
      version: 1,
      createdAt: operatorMeta.createdAt,
      engineVersion: operatorMeta.engineVersion,
    },
    input: {
      seed: operatorMeta.seed,
      playerCount: input.playerCount,
      playerOrder: input.playerOrder,
      setupConfig: input.setupConfig,
      moves: input.moves,
    },
    // why: placeholder expected block satisfies validateFixture's
    // shape check; the real expected block is built from the
    // runFixture result below and substituted before write.
    expected: {
      finalStateHash: '0000000000000000000000000000000000000000000000000000000000000000',
      messages: [],
      snapshotPerTurn: [],
      outcome: { winner: null, counters: {} },
    },
  };

  const validated = validateFixture(fixtureSkeleton, operatorMeta.name);
  const result = runFixture(validated, EMPTY_REGISTRY);

  return {
    name: validated.name,
    meta: validated.meta,
    input: validated.input,
    expected: {
      finalStateHash: result.finalStateHash,
      messages: result.messages,
      snapshotPerTurn: result.snapshotPerTurn,
      outcome: result.outcome,
    },
  };
}

/**
 * Executes `--policy` mode end-to-end: load + validate the setup
 * envelope, build per-seat policies, capture moves via
 * `simulateOneGameAndCaptureMoves`, assemble a bare-input block, and
 * hand off to `recordFromInput` for the convergence with `--input`
 * mode at `validateFixture → runFixture → writeFixtureFile`.
 */
async function recordFromPolicy(parsedArgs, operatorMeta, maxMoves) {
  const policyName = parsedArgs['--policy'];
  const setupPath = parsedArgs['--setup'];
  if (typeof setupPath !== 'string' || setupPath.length === 0) {
    throw new Error(
      'Recorder --policy mode requires --setup <path-to-setup-envelope.json>; the envelope carries playerCount + the 9-field composition (MatchSetupConfig) needed to call simulateOneGameAndCaptureMoves.',
    );
  }

  const parsedEnvelope = await readJsonFile(setupPath, 'setup envelope');
  const envelope = validateSetupEnvelope(parsedEnvelope, setupPath);
  const playerOrder = derivePlayerOrder(envelope.playerCount);
  const policies = buildPolicyList(
    policyName,
    operatorMeta.seed,
    envelope.playerCount,
  );

  const captured = simulateOneGameAndCaptureMoves(
    envelope.composition,
    EMPTY_REGISTRY,
    policies,
    operatorMeta.seed,
    0,
  );

  // why (D-19302): the captured trace contains play-phase moves only.
  // Simulation starts post-lobby at `phase = 'play'` after
  // `buildInitialGameState`, and `runFixture` also starts from
  // `buildInitialGameState`'s output and dispatches whatever `moves[]`
  // it receives. Lobby moves (`setPlayerReady`, `startMatchIfReady`)
  // are not in simulation's MOVE_MAP and would have to be synthesised
  // here; doing so would add a lobby-semantics dependency simulation
  // does not carry today. Hand-crafted fixtures via `--input` mode are
  // unaffected and may continue to include lobby moves.
  const input = {
    seed: operatorMeta.seed,
    playerCount: envelope.playerCount,
    playerOrder,
    setupConfig: envelope.composition,
    moves: [...captured.moves],
  };

  assertMoveCountUnderCap(input, operatorMeta.name, maxMoves);

  // why (WP-158 §Contract + EC-172 §Guardrails): the captured-moves
  // → `recordFromInput(input, operatorMeta)` handoff is the convergence
  // point that preserves the shared-loop invariant. From here the path
  // is byte-identical to `--input` mode:
  // `validateFixture → runFixture → writeFixtureFile`. `runFixture`
  // remains the single oracle source; the recorder never produces an
  // oracle directly.
  return recordFromInput(input, operatorMeta);
}

/**
 * Ensures the output directory exists, then writes the serialised
 * fixture. Uses `mkdir({ recursive: true })` so first-time invocations
 * create the `games/` directory without operator intervention.
 */
async function writeFixtureFile(fixture) {
  const outputPath = join(FIXTURES_DIRECTORY, `${fixture.name}.replay.json`);
  await mkdir(FIXTURES_DIRECTORY, { recursive: true });
  const serialised = serialiseFixture(fixture);
  await writeFile(outputPath, serialised, 'utf8');
  return outputPath;
}

/**
 * Main entry point. Parses CLI args, dispatches to --input mode or
 * --policy mode (mutually exclusive), writes the fixture, and prints
 * the output path for operator confirmation.
 */
async function main() {
  const argv = process.argv.slice(2);
  const parsedArgs = parseArguments(argv);

  const hasPolicy = parsedArgs['--policy'] !== undefined;
  const hasInput = parsedArgs['--input'] !== undefined;
  if (hasPolicy === hasInput) {
    throw new Error(
      'Recorder requires exactly one of --policy or --input; received both or neither.',
    );
  }

  let fixture;
  if (hasPolicy) {
    const operatorMeta = resolveOperatorMeta(parsedArgs, {
      inheritedCreatedAt: undefined,
      inheritedEngineVersion: undefined,
      inheritedSeed: undefined,
    });
    const maxMoves = resolveMaxMoves(parsedArgs);
    fixture = await recordFromPolicy(parsedArgs, operatorMeta, maxMoves);
  } else {
    const sourcePath = parsedArgs['--input'];
    const parsedJson = await readJsonFile(sourcePath, 'input source');
    const inherited = extractInputAndInheritedMeta(parsedJson, sourcePath);
    assertInputShape(inherited.input, sourcePath);

    const operatorMeta = resolveOperatorMeta(parsedArgs, inherited);
    const maxMoves = resolveMaxMoves(parsedArgs);
    assertMoveCountUnderCap(inherited.input, operatorMeta.name, maxMoves);

    fixture = recordFromInput(inherited.input, operatorMeta);
  }

  const outputPath = await writeFixtureFile(fixture);

  // why: stdout reporting confirms the output path so the operator can
  // diff or commit the new fixture without searching. Plain text only —
  // no JSON wrapping — to match the convention of the existing
  // scripts/* tooling.
  process.stdout.write(`Recorded fixture "${fixture.name}" to ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`record-game-fixture: ${error.message}\n`);
  process.exit(1);
});
