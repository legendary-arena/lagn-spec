#!/usr/bin/env node
/**
 * CLI recorder for the complete-game regression harness (WP-158).
 *
 * Produces a `*.replay.json` fixture from either an explicit
 * input-block JSON file or a recorded existing fixture's input block.
 * The recorder calls `runFixture` for dispatch — duplicating the
 * dispatch loop is FORBIDDEN by EC-172 §Guardrails (Determinism
 * integrity). The recorder's only loop is over CLI argument parsing
 * and the final write step; the engine-state advancement happens
 * inside `runFixture`.
 *
 * Required CLI flags:
 *   --name <fixture-name>          (REQUIRED)
 *   --seed <seed-string>           (REQUIRED; or inherited from --input fixture)
 *   --created-at <ISO 8601>        (REQUIRED; or inherited from --input fixture meta)
 *   --engine-version <string>      (REQUIRED; or inherited from --input fixture meta)
 *   --input <path>                 (one of two modes)
 *   --policy random|heuristic --setup <path>   (CURRENTLY ACCEPTED + DEFERRED)
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
 * `packages/game-engine/dist/test/fixtures/runFixture.js`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFixture } from '../packages/game-engine/dist/test/fixtures/runFixture.js';
import { validateFixture } from '../packages/game-engine/dist/test/fixtures/fixtureSchema.js';

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
 * for actionable forensic triage when autoplay-mode (deferred to a
 * follow-up WP) eventually wires through.
 */
// why: infinite-loop guard for autoplay policies that fail to
// terminate. Hand-written fixtures rarely trip this (they are
// finite by construction), but the guard is a forward-compatibility
// rail for the --policy mode the follow-up WP will land.
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
 * Main entry point. Parses CLI args, dispatches to --input mode (the
 * sole fully-implemented mode for this WP), writes the fixture, and
 * prints the output path for operator confirmation.
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
  if (hasPolicy) {
    // why: --policy mode is CLI-accepted for forward compatibility per
    // WP-158 AC #6, but the autoplay implementation is deferred to a
    // follow-up corpus-expansion WP. Implementing it inline would
    // either require exporting harness internals (widening
    // runFixture.ts's public API) or replicating the dispatch loop
    // (forbidden by EC-172 §Guardrails — Determinism integrity). The
    // sentinel fixture and any near-term corpus growth use --input
    // mode with hand-crafted move lists. Documented as a known
    // limitation in docs/ai/REFERENCE/complete-game-tests.md.
    throw new Error(
      'Recorder --policy mode is accepted by the CLI for forward compatibility but is deferred to a follow-up WP (functional autoplay requires exporting runFixture internals or duplicating the dispatch loop, both of which the WP-158 guardrails reject). Use --input mode with a hand-crafted input-block JSON file or an existing fixture whose input block can be re-recorded.',
    );
  }

  const sourcePath = parsedArgs['--input'];
  const parsedJson = await readJsonFile(sourcePath, 'input source');
  const inherited = extractInputAndInheritedMeta(parsedJson, sourcePath);
  assertInputShape(inherited.input, sourcePath);

  const operatorMeta = resolveOperatorMeta(parsedArgs, inherited);
  const maxMoves = resolveMaxMoves(parsedArgs);
  assertMoveCountUnderCap(inherited.input, operatorMeta.name, maxMoves);

  const fixture = recordFromInput(inherited.input, operatorMeta);
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
