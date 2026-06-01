#!/usr/bin/env node
/**
 * Operator-facing setup-matrix sweep runner (WP-194).
 *
 * Enumerates the schemeId × mastermindId cross-product over a base setup
 * envelope, dispatches `simulateOneGameAndCaptureMoves` per cell (WP-193's
 * capture primitive), and appends one canonical-JSON line per cell to
 * `sweep-output/<run-id>/manifest.jsonl`. The script is resumable: re-running
 * with the same `--run-id` reads any existing manifest, builds a skip-set
 * keyed on `(schemeId, mastermindId)`, and dispatches only the missing cells.
 *
 * Required CLI flags:
 *   --run-id <id>                   matches /^[A-Za-z0-9._-]+$/; subdir name
 *   --seed <seed-string>            run-level seed (combined with cell coords)
 *   --setup <path>                  canonical envelope JSON (EC-220 shape)
 *   --scheme-ids <path>             JSON array of non-empty unique strings
 *   --mastermind-ids <path>         JSON array of non-empty unique strings
 *   --policy random|heuristic       policy family (no fallback)
 *   [--max-cells <N>]               cap; default MAX_CELLS_DEFAULT (10000)
 *
 * Output: `sweep-output/<run-id>/manifest.jsonl`. The directory is
 * gitignored (D-19403); the bulk artifact never enters the repo.
 *
 * On a thrown cell, the script appends a fatal-record JSONL line
 * (`{ cellSeed, error, mastermindId, schemeId, type: "fatal" }`,
 * canonical-JSON, sorted keys), emits the error to stderr, and exits
 * non-zero. A resumed run treats fatal records the same way as success
 * records for skip-set purposes — to retry a fatal cell, the operator must
 * either remove the fatal record from the manifest or run under a new
 * `--run-id`. No `--retry-fatal` flag in v1.
 *
 * Run from the repository root after `pnpm -r build` has produced
 * `packages/game-engine/dist/simulation/sweep.runner.js`.
 */

import { readFile, mkdir, access } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  sweepSetupMatrix,
  CELL_SEED_SEPARATOR,
} from '../packages/game-engine/dist/simulation/sweep.runner.js';
import { createRandomPolicy } from '../packages/game-engine/dist/simulation/ai.random.js';
import { createCompetentHeuristicPolicy } from '../packages/game-engine/dist/simulation/ai.competent.js';

// why: __dirname is unavailable in ESM; reconstruct via import.meta.url
// to anchor the sweep-output directory relative to the script regardless
// of the cwd it is invoked from.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const SWEEP_OUTPUT_ROOT = join(REPO_ROOT, 'sweep-output');

// why: 10000 is well above the expected production load (~32 schemes ×
// ~32 masterminds ≈ 1024 cells), giving a ~10× safety margin. The cap
// exists to surface configuration errors (typo'd axis files, a 10K-entry
// list) BEFORE the dispatcher consumes an hour of wall-clock.
const MAX_CELLS_DEFAULT = 10000;

// why: 5000 is the soft-warning threshold. Above this point the sweep is
// likely an unusual run (well past the ~1K expected baseline) and worth
// surfacing to the operator without aborting. The substring `exceeds soft
// threshold 5000` is grep-pinned by EC-221.
const SOFT_CELL_WARNING_THRESHOLD = 5000;

// why (D-19303): per-seat seeds nest on top of the per-cell seed via the
// literal `::seat:` separator carried verbatim in this constant. WP-193
// locks `SEAT_SEED_SEPARATOR` for the recorder; the sweep mirrors the same
// convention so the two-domain PRNG invariant (D-3604) holds at every
// level of the (runSeed → cellSeed → seatSeed) nesting.
const SEAT_SEED_SEPARATOR = '::seat:';

/**
 * Parses argv into a flag map. Accepts `--flag value` pairs only. Unrecognised
 * flags raise a full-sentence error before any work begins.
 */
function parseArguments(argv) {
  const recognisedFlags = new Set([
    '--run-id',
    '--seed',
    '--setup',
    '--scheme-ids',
    '--mastermind-ids',
    '--policy',
    '--max-cells',
  ]);
  const parsed = {};
  let cursor = 0;
  while (cursor < argv.length) {
    const flag = argv[cursor];
    if (!recognisedFlags.has(flag)) {
      throw new Error(
        `Sweep received unrecognised CLI flag "${flag}"; expected one of ${[...recognisedFlags].join(', ')}.`,
      );
    }
    const value = argv[cursor + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(
        `Sweep flag "${flag}" requires a value; received ${value === undefined ? 'end-of-arguments' : `another flag "${value}"`}.`,
      );
    }
    parsed[flag] = value;
    cursor += 2;
  }
  return parsed;
}

/**
 * Reads a JSON file and parses it. Throws a full-sentence error on missing
 * file, unreadable file, or invalid JSON.
 */
async function readJsonFile(filePath, description) {
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Sweep failed to read ${description} from "${filePath}": ${error.message}. Verify the path is correct and the file is readable.`,
    );
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(
      `Sweep failed to parse ${description} at "${filePath}" as JSON: ${error.message}. Verify the file contains valid JSON.`,
    );
  }
}

/**
 * Validates `--run-id` against the locked sanitisation pattern.
 *
 * Only ASCII alphanumerics, dot, underscore, and hyphen are accepted. Any
 * other character (path separators, spaces, shell metacharacters) is a
 * full-sentence error so the run-id can be used verbatim as a subdirectory
 * name without further escaping.
 */
function assertRunIdShape(runId) {
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error(
      'Sweep --run-id is required and must be a non-empty string matching /^[A-Za-z0-9._-]+$/.',
    );
  }
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(
      `Sweep --run-id "${runId}" contains characters outside /^[A-Za-z0-9._-]+$/; restrict to ASCII alphanumerics, dot, underscore, and hyphen.`,
    );
  }
}

/**
 * Validates the base setup envelope JSON. Mirrors the canonical shape locked
 * by EC-220 (`{ schemaVersion: "1.0", playerCount, heroSelectionMode,
 * composition }`). Returns `{ composition, playerCount }`.
 */
function validateSetupEnvelope(parsed, sourcePath) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Sweep setup envelope at "${sourcePath}" is not a JSON object at the top level; expected the canonical { schemaVersion, playerCount, heroSelectionMode, composition } shape.`,
    );
  }
  if (parsed.schemaVersion !== '1.0') {
    throw new Error(
      `Sweep setup envelope at "${sourcePath}" has schemaVersion ${JSON.stringify(parsed.schemaVersion)}; only schemaVersion "1.0" is supported.`,
    );
  }
  if (
    typeof parsed.playerCount !== 'number' ||
    !Number.isInteger(parsed.playerCount) ||
    parsed.playerCount < 1 ||
    parsed.playerCount > 5
  ) {
    throw new Error(
      `Sweep setup envelope at "${sourcePath}" has playerCount ${JSON.stringify(parsed.playerCount)}; expected an integer between 1 and 5.`,
    );
  }
  if (typeof parsed.composition !== 'object' || parsed.composition === null || Array.isArray(parsed.composition)) {
    throw new Error(
      `Sweep setup envelope at "${sourcePath}" is missing a composition object (the 9-field MatchSetupConfig); buildInitialGameState requires this payload.`,
    );
  }
  return {
    composition: parsed.composition,
    playerCount: parsed.playerCount,
  };
}

/**
 * Validates an axis file: must parse to a JSON array of non-empty unique
 * strings. Empty arrays are permitted (yield a zero-cell no-op sweep);
 * duplicates within an axis are a full-sentence error.
 */
function validateAxisArray(parsed, axisName, sourcePath) {
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Sweep ${axisName} axis at "${sourcePath}" is not a JSON array; expected an array of non-empty unique strings.`,
    );
  }
  const seen = new Set();
  for (const item of parsed) {
    if (typeof item !== 'string' || item.length === 0) {
      throw new Error(
        `Sweep ${axisName} axis at "${sourcePath}" contains a non-string or empty entry (${JSON.stringify(item)}); every entry must be a non-empty string.`,
      );
    }
    if (seen.has(item)) {
      throw new Error(
        `Sweep ${axisName} axis at "${sourcePath}" contains duplicate entry "${item}"; every entry must appear at most once.`,
      );
    }
    seen.add(item);
  }
  return parsed;
}

/**
 * Resolves `--max-cells` from the parsed args. Defaults to
 * `MAX_CELLS_DEFAULT` (10000) when the flag is absent. The value must be a
 * positive integer.
 */
function resolveMaxCells(parsedArgs) {
  if (parsedArgs['--max-cells'] === undefined) {
    return MAX_CELLS_DEFAULT;
  }
  const parsed = Number(parsedArgs['--max-cells']);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `Sweep received --max-cells "${parsedArgs['--max-cells']}" which is not a positive integer; supply a value like --max-cells ${MAX_CELLS_DEFAULT}.`,
    );
  }
  return parsed;
}

/**
 * Minimal `CardRegistryReader` stub. The sweep MUST NOT import
 * `@legendary-arena/registry`; the script constructs the same empty-result
 * stub used by the WP-193 recorder. `buildInitialGameState` accepts this
 * stub gracefully (per the four `isXRegistryReader` guards) and emits a
 * deterministic set of "skipped: registry-reader interface incomplete"
 * diagnostics that land in `G.messages` and never escape this process.
 */
const EMPTY_REGISTRY = {
  listCards: () => [],
  listSets: () => [],
  getSet: () => undefined,
};

/**
 * Builds the per-seat policy list for a single cell using the WP-193 nested
 * seed convention.
 */
// why (D-19303 preserved): per-seat seeds nest on top of the per-cell seed
// via `${cellSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`. The literal `::seat:`
// is carried verbatim by `SEAT_SEED_SEPARATOR`. This nesting preserves the
// D-3604 two-domain PRNG invariant — policy PRNG state never shares with
// run-level shuffle PRNG state — at every level of the
// (runSeed → cellSeed → seatSeed) chain.
function buildPolicyListForCell(policyName, cellSeed, playerCount) {
  const policies = [];
  if (policyName === 'random') {
    for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
      const seatSeed = `${cellSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`;
      policies.push(createRandomPolicy(seatSeed));
    }
    return policies;
  }
  if (policyName === 'heuristic') {
    for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
      const seatSeed = `${cellSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`;
      policies.push(createCompetentHeuristicPolicy(seatSeed));
    }
    return policies;
  }
  throw new Error(
    `Sweep --policy received unrecognised value "${policyName}"; expected exactly one of "random" or "heuristic" (no fallback).`,
  );
}

/**
 * Canonical-JSON `JSON.stringify` replacer that sorts object keys
 * lexicographically. Arrays preserve order. Mirrors the rule used by
 * `hashGameState.ts` and the WP-193 recorder so manifest lines have stable
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
 * Serialises a manifest record to one canonical JSONL line (no pretty
 * printing, trailing newline included).
 */
function serialiseManifestLine(record) {
  return `${JSON.stringify(record, canonicalReplacer)}\n`;
}

/**
 * Parses an existing manifest file (if any) and extracts the
 * `(schemeId, mastermindId)` pair from each line into a skip-set. Malformed
 * lines emit a full-sentence warning to stderr but do not abort the resume
 * (the corresponding cells are re-run).
 */
// why (D-19403): the resume skip-set is keyed on `(schemeId, mastermindId)`
// rather than `cellIndex`. `cellIndex` is informational only — adding a new
// schemeId that lex-sorts earlier would shift every subsequent cellIndex
// across runs, breaking resume. The identity pair is stable. Fatal records
// participate in the skip-set verbatim: to retry a fatal cell the operator
// must remove the record or use a new `--run-id`.
async function buildResumeSkipSet(manifestPath) {
  const skipSet = new Set();
  let contents;
  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return skipSet;
    }
    throw new Error(
      `Sweep failed to read existing manifest at "${manifestPath}": ${error.message}. Verify the file is readable.`,
    );
  }
  const lines = contents.split('\n');
  let lineNumber = 0;
  for (const rawLine of lines) {
    lineNumber++;
    if (rawLine.length === 0) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(rawLine);
    } catch (parseError) {
      process.stderr.write(
        `Sweep warning: manifest line ${lineNumber} at "${manifestPath}" is not valid JSON (${parseError.message}); the corresponding cell will be re-run.\n`,
      );
      continue;
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof parsed.schemeId !== 'string' ||
      typeof parsed.mastermindId !== 'string'
    ) {
      process.stderr.write(
        `Sweep warning: manifest line ${lineNumber} at "${manifestPath}" is missing schemeId or mastermindId; the corresponding cell will be re-run.\n`,
      );
      continue;
    }
    skipSet.add(`${parsed.schemeId}||${parsed.mastermindId}`);
  }
  return skipSet;
}

/**
 * Returns true if the manifest path already exists on disk.
 */
async function manifestExists(manifestPath) {
  try {
    await access(manifestPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Main entry point. Parses CLI args, validates inputs, runs the sweep,
 * appends success / fatal manifest records, and prints a one-line summary
 * to stdout on success.
 */
async function main() {
  const argv = process.argv.slice(2);
  const parsedArgs = parseArguments(argv);

  const runId = parsedArgs['--run-id'];
  assertRunIdShape(runId);

  const runSeed = parsedArgs['--seed'];
  if (typeof runSeed !== 'string' || runSeed.length === 0) {
    throw new Error(
      'Sweep --seed is required and must be a non-empty string; the per-cell seed is derived by appending the schemeId + mastermindId to this value.',
    );
  }

  const setupPath = parsedArgs['--setup'];
  if (typeof setupPath !== 'string' || setupPath.length === 0) {
    throw new Error(
      'Sweep --setup is required and must be a path to a JSON file carrying the canonical setup envelope.',
    );
  }
  const schemeIdsPath = parsedArgs['--scheme-ids'];
  if (typeof schemeIdsPath !== 'string' || schemeIdsPath.length === 0) {
    throw new Error(
      'Sweep --scheme-ids is required and must be a path to a JSON file containing an array of non-empty unique scheme ext_ids.',
    );
  }
  const mastermindIdsPath = parsedArgs['--mastermind-ids'];
  if (typeof mastermindIdsPath !== 'string' || mastermindIdsPath.length === 0) {
    throw new Error(
      'Sweep --mastermind-ids is required and must be a path to a JSON file containing an array of non-empty unique mastermind ext_ids.',
    );
  }
  const policyName = parsedArgs['--policy'];
  if (policyName !== 'random' && policyName !== 'heuristic') {
    throw new Error(
      `Sweep --policy received "${policyName}"; expected exactly one of "random" or "heuristic" (no fallback).`,
    );
  }

  const maxCells = resolveMaxCells(parsedArgs);

  const parsedEnvelope = await readJsonFile(setupPath, 'setup envelope');
  const envelope = validateSetupEnvelope(parsedEnvelope, setupPath);

  const parsedSchemeIds = await readJsonFile(schemeIdsPath, 'scheme ids axis');
  const schemeIds = validateAxisArray(parsedSchemeIds, 'scheme-ids', schemeIdsPath);

  const parsedMastermindIds = await readJsonFile(mastermindIdsPath, 'mastermind ids axis');
  const mastermindIds = validateAxisArray(
    parsedMastermindIds,
    'mastermind-ids',
    mastermindIdsPath,
  );

  const cellCount = schemeIds.length * mastermindIds.length;
  if (cellCount > maxCells) {
    throw new Error(
      `Sweep cell count ${cellCount} exceeds --max-cells cap ${maxCells}; raise the cap or shrink the axis files. No manifest written.`,
    );
  }
  if (cellCount > SOFT_CELL_WARNING_THRESHOLD && cellCount <= maxCells) {
    process.stderr.write(
      `Sweep warning: ${cellCount} cells exceeds soft threshold ${SOFT_CELL_WARNING_THRESHOLD} — verify axis files are not a misconfiguration.\n`,
    );
  }

  const runDirectory = join(SWEEP_OUTPUT_ROOT, runId);
  const manifestPath = join(runDirectory, 'manifest.jsonl');
  await mkdir(runDirectory, { recursive: true });

  let skipSet = new Set();
  if (await manifestExists(manifestPath)) {
    skipSet = await buildResumeSkipSet(manifestPath);
  }

  let processedCount = 0;
  let skippedCount = 0;

  // why (D-19402): the per-cell seed is built by `sweepSetupMatrix` itself
  // using the imported `CELL_SEED_SEPARATOR`. The script does NOT echo the
  // literal `::cell:` — the literal lives only in `sweep.runner.ts`. The
  // script consumes the projected `cell.cellSeed` from the dispatcher's
  // callback.
  // why (D-19403): manifest-only output — per-cell `.replay.json` fixtures
  // are NOT written under any flag in v1. The script appends one canonical
  // JSONL line per dispatched cell.
  // why (idempotency contract): same args + same axis files + non-truncated
  // existing manifest → byte-identical final manifest as a single-pass run.
  // The identity key for skip / dedup is the `(schemeId, mastermindId)`
  // pair (D-19403 explicit constraint), not `cellIndex`.
  const skipForResume = (schemeId, mastermindId) => {
    if (skipSet.has(`${schemeId}||${mastermindId}`)) {
      skippedCount++;
      return true;
    }
    return false;
  };
  // why (durability): the manifest is appended synchronously per cell so
  // pre-failure cells are on disk before the fatal-record path runs. An
  // async-buffered approach would lose every queued cell if the
  // dispatcher threw mid-sweep — the outer try/catch would fire before
  // the drain loop emptied the buffer.
  const onCellComplete = (cell) => {
    const record = {
      cellIndex: cell.cellIndex,
      cellSeed: cell.cellSeed,
      endgameReached: cell.endgameReached,
      mastermindId: cell.mastermindId,
      moveCount: cell.moveCount,
      outcome: {
        escapedVillains: cell.outcome.escapedVillains,
        winner: cell.outcome.winner,
      },
      schemeId: cell.schemeId,
    };
    appendFileSync(manifestPath, serialiseManifestLine(record), 'utf8');
    processedCount++;
  };

  // why (D-19403 / fatal-record contract): the entire dispatcher call is
  // wrapped in a single OUTER try/catch. The dispatcher itself does NOT
  // swallow exceptions per cell (per EC-221 §Guardrails). On a thrown cell
  // the catch block synthesises a canonical-JSON fatal record with the
  // closed five-key shape and the discriminator `"type": "fatal"`
  // (canonical JSON, sorted keys, JSONL single-line, e.g.
  // `{"cellSeed":"...","error":"...","mastermindId":"...","schemeId":"...","type": "fatal"}`),
  // appends it to the manifest, emits the error to stderr, and exits
  // non-zero. The retry posture is: remove the fatal record or run
  // under a new `--run-id` (NO `--retry-fatal` flag).
  let lastCellCoords = null;
  try {
    sweepSetupMatrix(
      envelope.composition,
      envelope.playerCount,
      schemeIds,
      mastermindIds,
      EMPTY_REGISTRY,
      (cellSeed, playerCount) => buildPolicyListForCell(policyName, cellSeed, playerCount),
      runSeed,
      (cell) => {
        lastCellCoords = {
          schemeId: cell.schemeId,
          mastermindId: cell.mastermindId,
          cellSeed: cell.cellSeed,
        };
        onCellComplete(cell);
      },
      skipForResume,
    );
  } catch (caughtError) {
    const fallbackCellSeed =
      lastCellCoords?.cellSeed ?? `${runSeed}${CELL_SEED_SEPARATOR}<unknown>:<unknown>`;
    const fatalRecord = {
      cellSeed: fallbackCellSeed,
      error: caughtError instanceof Error ? caughtError.message : String(caughtError),
      mastermindId: lastCellCoords?.mastermindId ?? '<unknown>',
      schemeId: lastCellCoords?.schemeId ?? '<unknown>',
      type: 'fatal',
    };
    appendFileSync(manifestPath, serialiseManifestLine(fatalRecord), 'utf8');
    process.stderr.write(
      `Sweep aborted: ${fatalRecord.error}\nFatal record appended to ${manifestPath}; to retry this cell remove the record or run under a new --run-id.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `${processedCount} cells processed, ${skippedCount} skipped, 0 errors\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`sweep-setup-matrix: ${error.message}\n`);
  process.exit(1);
});
