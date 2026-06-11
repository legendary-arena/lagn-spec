#!/usr/bin/env node
/**
 * Weekly sweep rotation / shard plan (WP-234 / EC-267).
 *
 * The SINGLE source of the weekly sweep's rotation + shard arithmetic and its
 * locked constants. The math lives here (unit-tested) rather than as YAML bash
 * in the workflow, so it is evaluated ONCE in the workflow's `plan` job and
 * passed to the matrix shards + the combine job — never re-derived per shard,
 * never duplicated as untested shell arithmetic.
 *
 * Two CLI modes (the entry-point guard runs `main()` only when invoked
 * directly, so the pure helpers stay importable by the unit test):
 *
 *   1. Window mode  — `--iso-week <NN> --scheme-axis-length <L>`
 *      Emits `window_index` + `scheme_offset` to `GITHUB_OUTPUT`.
 *   2. Shard mode   — `--scheme-offset <N> --shard-index <K>`
 *      Emits `scheme_offset` + `scheme_limit` to `GITHUB_OUTPUT`.
 *
 * When `GITHUB_OUTPUT` is unset (a local calibration run) the key/value lines
 * are written to stdout instead.
 *
 * Determinism boundary: the only wall-clock input is the ISO week, read in the
 * workflow's `plan` job (`date -u +%V`) and passed in as `--iso-week`. NO
 * wall-clock value reaches the engine, the per-cell seed derivation, or any
 * simulation input — per-cell determinism is the D-19402 seed chain alone.
 *
 * No new npm dependency: built-in `node:*` only.
 *
 * Authority: WP-234 §Scope (C) + §Locked Contract Values (window / shards /
 * ISO week); EC-267 §Plan + topology; D-23401 (rotating-window posture) +
 * D-23402 (sharded topology).
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Locked rotation constants (WP-234 §Locked Contract Values; D-23401 / D-23402).
// why: 20 schemes × all 106 masterminds = ≤ 2,120 cells per weekly run; a
// 10-run cycle (ceil(191/20)) covers the full 191-scheme corpus; the window
// advances one step per ISO week.
const SCHEMES_PER_WINDOW = 20;
const CYCLE_LENGTH = 10;
// why: 4 GitHub-hosted matrix shards of 5 schemes each (20 / 4) keep every
// shard's cellCount ≤ 530 — far under the runner's 10000 --max-cells cap.
const SHARD_COUNT = 4;
const SCHEMES_PER_SHARD = 5;

/**
 * Computes the rotation window for a given ISO week.
 *
 * `windowIndex = isoWeek mod CYCLE_LENGTH`; `schemeOffset = windowIndex *
 * SCHEMES_PER_WINDOW`. The final window (index 9 → offset 180) covers schemes
 * [180, 200) clamped by the slice to [180, 191) = 11 schemes; the clamping
 * happens at slice time in `selectSchemeWindow`, not here.
 *
 * Pure — no IO, no process exit — so the rotation is unit-testable.
 *
 * @param {number} isoWeek - The ISO week number (already base-10 parsed).
 * @param {number} schemeAxisLength - Length of the committed scheme axis;
 *   validated as a positive integer (the offset is intentionally NOT clamped
 *   here — `selectSchemeWindow`'s `.slice()` clamps the tail).
 * @returns {{ windowIndex: number, schemeOffset: number }}
 */
export function computeWeeklyPlan(isoWeek, schemeAxisLength) {
  if (!Number.isInteger(isoWeek) || isoWeek < 0) {
    throw new Error(
      `Weekly plan received isoWeek "${isoWeek}" which is not a non-negative integer; pass the base-10 parsed output of "date -u +%V".`,
    );
  }
  if (!Number.isInteger(schemeAxisLength) || schemeAxisLength < 1) {
    throw new Error(
      `Weekly plan received schemeAxisLength "${schemeAxisLength}" which is not a positive integer; pass the length of the committed scheme axis fixture.`,
    );
  }
  const windowIndex = isoWeek % CYCLE_LENGTH;
  const schemeOffset = windowIndex * SCHEMES_PER_WINDOW;
  return { windowIndex, schemeOffset };
}

/**
 * Computes one shard's scheme sub-slice within a window.
 *
 * Shard `k` covers `--scheme-offset (schemeOffset + k * SCHEMES_PER_SHARD)
 * --scheme-limit SCHEMES_PER_SHARD`. A shard whose offset lands past the axis
 * end produces an empty 0-cell manifest (the slice clamps); that is not an
 * error.
 *
 * Pure — no IO, no process exit.
 *
 * @param {number} schemeOffset - The window's base scheme offset.
 * @param {number} shardIndex - The shard index (0 .. SHARD_COUNT - 1).
 * @returns {{ schemeOffset: number, schemeLimit: number }}
 */
export function computeShardSlice(schemeOffset, shardIndex) {
  if (!Number.isInteger(schemeOffset) || schemeOffset < 0) {
    throw new Error(
      `Weekly plan received schemeOffset "${schemeOffset}" which is not a non-negative integer; pass the window's scheme_offset from the plan job.`,
    );
  }
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= SHARD_COUNT) {
    throw new Error(
      `Weekly plan received shardIndex "${shardIndex}" which is not an integer in [0, ${SHARD_COUNT}); the matrix defines shards 0 .. ${SHARD_COUNT - 1}.`,
    );
  }
  return {
    schemeOffset: schemeOffset + shardIndex * SCHEMES_PER_SHARD,
    schemeLimit: SCHEMES_PER_SHARD,
  };
}

/**
 * Parses argv into a flag map (`--flag value` pairs only). Mirrors the
 * sweep runner's parser shape so the failure messages read the same.
 *
 * @param {readonly string[]} argv
 * @returns {Record<string, string>}
 */
function parseArguments(argv) {
  const recognisedFlags = new Set([
    '--iso-week',
    '--scheme-axis-length',
    '--scheme-offset',
    '--shard-index',
  ]);
  const parsed = {};
  let cursor = 0;
  while (cursor < argv.length) {
    const flag = argv[cursor];
    if (!recognisedFlags.has(flag)) {
      throw new Error(
        `Weekly plan received unrecognised CLI flag "${flag}"; expected one of ${[...recognisedFlags].join(', ')}.`,
      );
    }
    const value = argv[cursor + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(
        `Weekly plan flag "${flag}" requires a value; received ${value === undefined ? 'end-of-arguments' : `another flag "${value}"`}.`,
      );
    }
    parsed[flag] = value;
    cursor += 2;
  }
  return parsed;
}

/**
 * Parses a required integer flag as base-10. The base-10 parse is mandatory so
 * a zero-padded ISO week (`08` / `09`) is never read as octal.
 *
 * @param {Record<string, string>} parsedArgs
 * @param {string} flagName
 * @returns {number}
 */
function parseRequiredBaseTenInteger(parsedArgs, flagName) {
  const rawValue = parsedArgs[flagName];
  if (rawValue === undefined) {
    throw new Error(`Weekly plan requires the ${flagName} flag; it was not supplied.`);
  }
  // why: parseInt(value, 10) forces base-10 so a zero-padded ISO week such as
  // "08" or "09" is parsed as 8 / 9, never as an invalid octal literal.
  const parsedValue = parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue)) {
    throw new Error(
      `Weekly plan flag ${flagName} value "${rawValue}" is not a base-10 integer; supply a numeric value.`,
    );
  }
  return parsedValue;
}

/**
 * Writes the computed key/value pairs to `GITHUB_OUTPUT` (one `key=value` line
 * each). Falls back to stdout for a local run where `GITHUB_OUTPUT` is unset.
 *
 * @param {ReadonlyArray<[string, number]>} entries
 */
function writeGithubOutput(entries) {
  const serialized = `${entries.map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
  const githubOutputPath = process.env.GITHUB_OUTPUT;
  if (typeof githubOutputPath === 'string' && githubOutputPath.length > 0) {
    appendFileSync(githubOutputPath, serialized, 'utf8');
    return;
  }
  process.stdout.write(serialized);
}

/**
 * CLI entry point. Dispatches to window mode or shard mode based on the
 * supplied flags and emits the computed values.
 */
function main() {
  const parsedArgs = parseArguments(process.argv.slice(2));
  const isWindowMode = parsedArgs['--iso-week'] !== undefined;
  const isShardMode = parsedArgs['--shard-index'] !== undefined;
  if (isWindowMode === isShardMode) {
    throw new Error(
      'Weekly plan requires exactly one mode: window mode (--iso-week + --scheme-axis-length) OR shard mode (--scheme-offset + --shard-index).',
    );
  }
  if (isWindowMode) {
    const isoWeek = parseRequiredBaseTenInteger(parsedArgs, '--iso-week');
    const schemeAxisLength = parseRequiredBaseTenInteger(parsedArgs, '--scheme-axis-length');
    const { windowIndex, schemeOffset } = computeWeeklyPlan(isoWeek, schemeAxisLength);
    writeGithubOutput([
      ['window_index', windowIndex],
      ['scheme_offset', schemeOffset],
    ]);
    return;
  }
  const schemeOffset = parseRequiredBaseTenInteger(parsedArgs, '--scheme-offset');
  const shardIndex = parseRequiredBaseTenInteger(parsedArgs, '--shard-index');
  const shardSlice = computeShardSlice(schemeOffset, shardIndex);
  writeGithubOutput([
    ['scheme_offset', shardSlice.schemeOffset],
    ['scheme_limit', shardSlice.schemeLimit],
  ]);
}

// why: run main() only when this file is the process entry point so the unit
// test can import computeWeeklyPlan / computeShardSlice without emitting output.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  try {
    main();
  } catch (unhandledError) {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`sweep-weekly-plan: ${errorMessage}\n`);
    process.exit(1);
  }
}
