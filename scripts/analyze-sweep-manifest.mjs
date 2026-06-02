#!/usr/bin/env node
/**
 * Operator-facing sweep manifest analyzer (WP-195).
 *
 * Consumes WP-194's `sweep-output/<run-id>/manifest.jsonl` manifest and
 * renders a deterministic anomaly report in either markdown (default)
 * or JSON. The script reads the manifest synchronously, parses it
 * line-by-line via the engine's `parseManifestLine`, warns on
 * malformed lines (synchronous, ascending lineNumber per D-19505),
 * runs the engine's `classifyManifestRecords`, and emits the rendered
 * report to stdout with a UTF-8 byte-stream (single trailing `\n`, no
 * BOM).
 *
 * The analyzer is read-only over the manifest — no append, no
 * truncate, no re-emit. It never calls `sweepSetupMatrix`,
 * `simulateOneGameAndCaptureMoves`, `runSimulation`, `runFixture`, or
 * any other engine entry point that runs a game.
 *
 * Required CLI flags:
 *   --manifest <path-to-manifest.jsonl>  (required)
 *
 * Optional CLI flags:
 *   --format markdown|json               (default: markdown)
 *
 * Behavior:
 *   - Duplicate flags: last occurrence wins (no error on duplicates).
 *   - Flag without value: full-sentence stderr + exit non-zero.
 *   - Missing --manifest: full-sentence stderr + exit non-zero.
 *   - File not found: full-sentence stderr + exit non-zero.
 *   - Empty manifest: non-fatal; zero-cell report exits 0.
 *   - Malformed line: full-sentence stderr warning + count incremented
 *     + continue with the remaining lines.
 *
 * Run from the repository root after `pnpm -r build` has produced
 * `packages/game-engine/dist/simulation/sweep.analyze.js`.
 */

import { readFile } from 'node:fs/promises';

import {
  SWEEP_ANOMALY_CLASSES,
  classifyManifestRecords,
  parseManifestLine,
} from '../packages/game-engine/dist/simulation/sweep.analyze.js';

/**
 * Recognised CLI flag set. Order is significant only for error
 * messages; the parser allows any order on the command line.
 */
const RECOGNISED_FLAGS = new Set(['--manifest', '--format']);

/**
 * Recognised values for the `--format` flag. Markdown is the
 * operator-reading default; JSON is canonical for downstream tooling.
 */
const RECOGNISED_FORMATS = new Set(['markdown', 'json']);

/**
 * Parses argv into a flag map. Per D-19504's CLI shape lock, only
 * `--manifest` and `--format` are recognised. Duplicate flags follow
 * the last-occurrence-wins rule; a flag without a following value is
 * a full-sentence error.
 */
// why (CLI duplicate-flag last-wins rule, locked by EC-222 §Locked
// Values): the parser silently accepts repeated `--manifest` or
// `--format` flags and treats the FINAL occurrence as authoritative.
// This matches the POSIX-style argv-parse convention used by the
// WP-194 recorder and the WP-193 recorder, so operators have a
// uniform expectation across the simulation-tooling script family.
function parseArguments(argv) {
  const parsed = {};
  let cursor = 0;
  while (cursor < argv.length) {
    const flag = argv[cursor];
    if (!RECOGNISED_FLAGS.has(flag)) {
      throw new Error(
        `analyze-sweep-manifest received unrecognised CLI flag "${flag}"; expected one of ${[...RECOGNISED_FLAGS].join(', ')}.`,
      );
    }
    const value = argv[cursor + 1];
    if (value === undefined || value.startsWith('--')) {
      const valueDescription = value === undefined ? 'end-of-arguments' : `another flag "${value}"`;
      throw new Error(
        `analyze-sweep-manifest flag "${flag}" requires a value; received ${valueDescription}.`,
      );
    }
    parsed[flag] = value;
    cursor += 2;
  }
  return parsed;
}

/**
 * Resolves and validates the `--format` value. Default is `markdown`
 * when the flag is absent.
 */
function resolveFormat(parsedArgs) {
  const rawFormat = parsedArgs['--format'];
  if (rawFormat === undefined) {
    return 'markdown';
  }
  if (!RECOGNISED_FORMATS.has(rawFormat)) {
    throw new Error(
      `analyze-sweep-manifest received --format "${rawFormat}"; expected exactly one of ${[...RECOGNISED_FORMATS].join(', ')}.`,
    );
  }
  return rawFormat;
}

/**
 * Reads the manifest file synchronously into memory and splits it on
 * `\n`. Drops the final empty entry (canonical JSONL always ends with
 * `\n`). Returns the resulting array; each element is one line.
 */
// why (D-19504): full-file synchronous read posture — WP-194's 10K-cell
// cap bounds the manifest to ≤5 MB (~500 bytes per line × 10000 lines),
// well under any reasonable memory budget. A streaming parser would
// add complexity for no benefit at this size; the synchronous read +
// line split is the simplest deterministic path.
async function readManifestLines(manifestPath) {
  let contents;
  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (caughtError) {
    throw new Error(
      `analyze-sweep-manifest failed to read manifest at "${manifestPath}": ${caughtError.message}. Verify the path is correct and the file is readable.`,
    );
  }
  const splitLines = contents.split('\n');
  if (splitLines.length > 0 && splitLines[splitLines.length - 1] === '') {
    splitLines.pop();
  }
  return splitLines;
}

/**
 * Walks the manifest lines top-to-bottom, calling `parseManifestLine`
 * for each line. Pushes valid records to `records[]` and malformed
 * entries to `malformedLines[]` while emitting a full-sentence
 * stderr warning per malformed line in ascending `lineNumber` order.
 *
 * @returns `{ records, malformedLines }`.
 */
// why (D-19505): malformed-line warn-and-continue policy — a single
// corrupted line is a real failure mode (partial write during sweep
// abort, manual operator edit, disk corruption). Aborting on first
// malformed line would lose all the analysis for the rest of the
// manifest. The synchronous loop guarantees warnings emit in
// ascending lineNumber order with no batching, no asynchronous
// interleaving — replay-stability of stderr is part of the
// determinism contract.
function walkManifestLines(rawLines) {
  const records = [];
  const malformedLines = [];
  let lineNumber = 0;
  for (const rawLine of rawLines) {
    lineNumber++;
    const result = parseManifestLine(rawLine);
    if (result.record !== null) {
      records.push(result.record);
      continue;
    }
    const reason = result.malformedReason ?? 'Manifest line is malformed; reason unavailable.';
    malformedLines.push({ lineNumber, reason });
    process.stderr.write(`Manifest line ${lineNumber} is malformed: ${reason}\n`);
  }
  return { records, malformedLines };
}

/**
 * Formats a percentage with exactly one decimal place + `%` symbol.
 * Returns `0.0%` when the denominator is 0.
 */
function formatPercentage(numerator, denominator) {
  if (denominator === 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * Formats a numeric stat with 2 decimal places. Returns `null` for
 * null inputs (the markdown renderer substitutes `(none)` at the
 * section level rather than per-cell `null`).
 */
function formatStat(value) {
  if (value === null) {
    return 'null';
  }
  return value.toFixed(2);
}

/**
 * Renders the markdown report.
 */
// why (D-19504): markdown default — the operator's primary use case is
// reading the report in a terminal or pasting into a PR comment.
// Section order follows the locked sequence (Anomaly Distribution →
// Winner Distribution → Move Count → Escaped Villains → Fatal Error
// Signatures); the canonical anomaly classes drive the Anomaly row
// order.
function renderMarkdown(manifestPath, classification) {
  const lines = [];
  const summary = classification.summary;
  lines.push('# Sweep Manifest Analysis');
  lines.push('');
  lines.push(`**Manifest:** ${manifestPath}`);
  lines.push(`**Total cells:** ${summary.totalCells}`);
  lines.push(`**Malformed lines:** ${classification.malformedLines.length}`);
  lines.push('');
  lines.push('## Anomaly Distribution');
  lines.push('');
  if (summary.totalCells === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Class                | Count | % |');
    lines.push('|----------------------|-------|---|');
    for (const anomalyClass of SWEEP_ANOMALY_CLASSES) {
      const count = summary.anomalyCounts[anomalyClass];
      const percentage = formatPercentage(count, summary.totalCells);
      const paddedClass = anomalyClass.padEnd(20, ' ');
      lines.push(`| ${paddedClass} | ${count} | ${percentage} |`);
    }
  }
  lines.push('');
  lines.push('## Winner Distribution');
  lines.push('');
  if (summary.totalCells === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Winner       | Count | % |');
    lines.push('|--------------|-------|---|');
    const winnerKeys = ['heroes-win', 'scheme-wins', 'null'];
    for (const winnerKey of winnerKeys) {
      const count = summary.winnerCounts[winnerKey];
      const percentage = formatPercentage(count, summary.totalCells);
      const paddedKey = winnerKey.padEnd(12, ' ');
      lines.push(`| ${paddedKey} | ${count} | ${percentage} |`);
    }
  }
  lines.push('');
  lines.push('## Move Count (success records only)');
  lines.push('');
  if (summary.moveCountStats.count === 0) {
    lines.push('(none)');
  } else {
    const stats = summary.moveCountStats;
    lines.push(
      `Count: ${stats.count} | Min: ${formatStat(stats.min)} | Max: ${formatStat(stats.max)} | Mean: ${formatStat(stats.mean)} | Median: ${formatStat(stats.median)} | p95: ${formatStat(stats.p95)}`,
    );
  }
  lines.push('');
  lines.push('## Escaped Villains (success records only)');
  lines.push('');
  if (summary.escapedVillainStats.count === 0) {
    lines.push('(none)');
  } else {
    const stats = summary.escapedVillainStats;
    lines.push(
      `Count: ${stats.count} | Min: ${formatStat(stats.min)} | Max: ${formatStat(stats.max)} | Mean: ${formatStat(stats.mean)} | Median: ${formatStat(stats.median)} | p95: ${formatStat(stats.p95)}`,
    );
  }
  lines.push('');
  lines.push('## Fatal Error Signatures');
  lines.push('');
  if (summary.fatalErrorSignatures.length === 0) {
    lines.push('(none)');
  } else {
    lines.push('| Signature                       | Count | Cell Seeds (first 3) |');
    lines.push('|---------------------------------|-------|----------------------|');
    for (const bucket of summary.fatalErrorSignatures) {
      const seedPreview = bucket.cellSeeds.slice(0, 3).join(', ');
      lines.push(`| ${bucket.signature} | ${bucket.count} | ${seedPreview} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Builds a key-sorted intermediate object for canonical JSON
 * serialisation. Recurses through nested objects; preserves array
 * order verbatim. The comparator is Unicode code-unit order
 * (`Array.prototype.sort()` with no comparator), NOT
 * `localeCompare`.
 */
// why (JSON deep-sort intermediate object): JavaScript's object
// insertion order is not deterministic across Node runtime versions
// for non-string keys; relying on it for byte-stable output is
// fragile. Building a key-sorted intermediate object at every
// nesting level BEFORE `JSON.stringify` guarantees deterministic
// output regardless of runtime version. The comparator is Unicode
// code-unit order (locked by EC-222 §Locked Values) — NEVER
// `localeCompare`, which varies across runtime ICU versions and OS
// locales.
function deepSortKeys(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepSortKeys(item));
  }
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = deepSortKeys(value[key]);
  }
  return sorted;
}

/**
 * Renders the JSON report with a key-sorted intermediate object and
 * `JSON.stringify(value, null, 2)`. Single trailing `\n` per the
 * stdout byte-stream contract.
 */
function renderJson(manifestPath, classification) {
  const intermediate = {
    manifest: manifestPath,
    summary: classification.summary,
    cells: classification.cells,
    malformedLines: classification.malformedLines,
  };
  const sorted = deepSortKeys(intermediate);
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * Main entry point.
 */
async function main() {
  const argv = process.argv.slice(2);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv);
  } catch (caughtError) {
    process.stderr.write(`${caughtError.message}\n`);
    process.exit(1);
  }
  const manifestPath = parsedArgs['--manifest'];
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    process.stderr.write(
      'analyze-sweep-manifest --manifest is required and must be a path to a JSONL manifest file produced by the WP-194 sweep runner.\n',
    );
    process.exit(1);
  }
  let format;
  try {
    format = resolveFormat(parsedArgs);
  } catch (caughtError) {
    process.stderr.write(`${caughtError.message}\n`);
    process.exit(1);
  }

  let rawLines;
  try {
    rawLines = await readManifestLines(manifestPath);
  } catch (caughtError) {
    process.stderr.write(`${caughtError.message}\n`);
    process.exit(1);
  }

  // why (empty-manifest non-fatal posture): an empty manifest is a
  // real operator state (a sweep that wrote zero cells before being
  // aborted, or a hand-truncated manifest). Per EC-222 §Locked Values
  // empty-section rendering rule, the analyzer renders a zero-cell
  // report with `(none)` section bodies and exits 0. No error.
  const { records, malformedLines } = walkManifestLines(rawLines);
  const classification = classifyManifestRecords(records, malformedLines);

  let output;
  if (format === 'markdown') {
    output = renderMarkdown(manifestPath, classification);
  } else {
    output = renderJson(manifestPath, classification);
  }
  process.stdout.write(output);
  process.exit(0);
}

main().catch((caughtError) => {
  const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
  process.stderr.write(`analyze-sweep-manifest: ${message}\n`);
  process.exit(1);
});
