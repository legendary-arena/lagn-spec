#!/usr/bin/env node
/**
 * Weekly sweep fan-in combine + submit (WP-234 / EC-267).
 *
 * The combine job of the weekly sweep. The 4 matrix shards each upload their
 * `manifest.jsonl` as a `sweep-shard-<k>` artifact; this script reads every
 * shard manifest beneath `--manifests-dir`, concatenates + deterministically
 * sorts the parsed records, classifies the combined result via the existing
 * WP-195 engine analyzer, and POSTs **one** run to `${API_BASE_URL}/api/sweep/runs`
 * with the `X-Sweep-Token` header — exactly the parse → classify → POST flow +
 * exit-code discipline of `scripts/sweep-submit.mjs`, but reading a pre-built
 * sharded manifest set instead of invoking the runner itself.
 *
 *   1. Validates required env vars (`SWEEP_SUBMIT_TOKEN`, `API_BASE_URL`) at
 *      entry — fail-fast with exit 2 BEFORE any work.
 *   2. Finds every `manifest.jsonl` under `--manifests-dir` and asserts
 *      exactly `SHARD_COUNT` (4) are present (fewer ⇒ exit 3, no POST —
 *      defense-in-depth over the workflow's `needs: sweep` success gate).
 *   3. Concatenates the parsed records + malformed lines across shards and
 *      sorts the records by `(schemeId ASC, mastermindId ASC)` so the
 *      `manifestBlob` is deterministic regardless of shard download order.
 *   4. Classifies via the engine's `classifyManifestRecords` (exit 3 on throw
 *      or wrong shape).
 *   5. Rejects an over-`BODY_CAP_BYTES` (5 MB) serialized payload BEFORE the
 *      POST (exit 4, loud) so an oversize blob is a clear pre-flight failure,
 *      never an opaque server 413.
 *   6. POSTs one run; runId `<runIdBase>-weekly-w<windowIndex>` (exit 4 on
 *      network / non-2xx / response-shape mismatch).
 *
 * Exit-code mapping (mirrors `scripts/sweep-submit.mjs`):
 *   - 0: success (POST 2xx)
 *   - 2: config/env error (missing env var)
 *   - 3: manifest read / classify / shard-count error (no POST)
 *   - 4: network / non-2xx / oversize-payload error
 *
 * No new npm dependency: built-in `fetch` + `node:*` + the existing engine
 * `parseManifestLine` / `classifyManifestRecords` imports (the documented
 * WP-209 reuse surface — no new engine symbol).
 *
 * Authority: WP-234 §Scope (C) + §Locked Contract Values (submit / shard-count
 * / combined-manifest ordering / body cap / runId); EC-267 §Submit; D-23402
 * (sharded fan-out / fan-in topology) + D-23401 (rotating-window posture);
 * D-20701 (storage shape) + D-20702 (auth posture) reused unchanged.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  classifyManifestRecords,
  parseManifestLine,
} from '@legendary-arena/game-engine';

// why (D-23402): the weekly window is fanned across exactly 4 GitHub-hosted
// matrix shards; the combine asserts all 4 shard manifests arrived before it
// submits, so an artifact-download glitch can never silently submit a partial
// sweep.
const SHARD_COUNT = 4;

// why: the locked /api/sweep/runs body cap (WP-209). A combined ~2,120-cell
// manifest blob is well under 5 MB, but the pre-POST guard turns a future
// over-cap blob into a loud exit 4 instead of an opaque server 413.
const BODY_CAP_BYTES = 5 * 1024 * 1024;

// Exit-code map — mirrors `scripts/sweep-submit.mjs`.
const EXIT_CONFIG_ERROR = 2;
const EXIT_MANIFEST_OR_ANALYZE_ERROR = 3;
const EXIT_NETWORK_OR_POST_ERROR = 4;

/**
 * Returns `true` iff both required env vars are present non-empty strings.
 * Pure — reads from the supplied `env` object so the test can drive it without
 * mutating `process.env`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isWeeklySubmitEnvComplete(env) {
  const sweepSubmitToken = env.SWEEP_SUBMIT_TOKEN;
  const apiBaseUrl = env.API_BASE_URL;
  return (
    typeof sweepSubmitToken === 'string' &&
    sweepSubmitToken.length > 0 &&
    typeof apiBaseUrl === 'string' &&
    apiBaseUrl.length > 0
  );
}

/**
 * Returns `true` iff the discovered manifest count is exactly `SHARD_COUNT`.
 * Pure — no IO, no process exit — so the shard-count → exit-3 mapping is
 * unit-testable (the `classifySyncStatus` precedent from WP-232).
 *
 * @param {number} manifestCount
 * @returns {boolean}
 */
export function isExpectedShardCount(manifestCount) {
  return manifestCount === SHARD_COUNT;
}

/**
 * Concatenates the parsed records + malformed lines across the supplied shard
 * manifest texts and sorts the records by `(schemeId ASC, mastermindId ASC)`.
 *
 * The sort makes the combined record order independent of the shard download
 * order, so the submitted `manifestBlob` is byte-deterministic across runs. An
 * empty manifest text (a clamped 0-cell shard) contributes nothing and is not
 * an error. Malformed lines are retained in input (shard) order, then line
 * order.
 *
 * Pure — no IO, no process exit. Uses the engine's `parseManifestLine` for
 * each line (the documented WP-209 reuse surface).
 *
 * @param {readonly string[]} manifestTexts - One raw `manifest.jsonl` blob per shard.
 * @returns {{ records: object[], malformedLines: { lineNumber: number, reason: string }[] }}
 */
export function concatenateShardManifests(manifestTexts) {
  const records = [];
  const malformedLines = [];
  for (const manifestText of manifestTexts) {
    const lines = manifestText.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex = lineIndex + 1) {
      const rawLine = lines[lineIndex];
      if (rawLine === undefined || rawLine.length === 0) {
        continue;
      }
      const result = parseManifestLine(rawLine);
      if (result.record === null) {
        malformedLines.push({
          lineNumber: lineIndex + 1,
          reason:
            result.malformedReason ??
            `Manifest line ${lineIndex + 1} produced no parsed record and no rejection reason; parser invariant violated.`,
        });
        continue;
      }
      records.push(result.record);
    }
  }
  // why (D-23402): sort by (schemeId ASC, mastermindId ASC) so the combined
  // manifestBlob is deterministic regardless of which shard finished /
  // downloaded first. String compare on the two identity fields both records
  // shapes (success + fatal) carry.
  records.sort((firstRecord, secondRecord) => {
    if (firstRecord.schemeId !== secondRecord.schemeId) {
      return firstRecord.schemeId < secondRecord.schemeId ? -1 : 1;
    }
    if (firstRecord.mastermindId !== secondRecord.mastermindId) {
      return firstRecord.mastermindId < secondRecord.mastermindId ? -1 : 1;
    }
    return 0;
  });
  return { records, malformedLines };
}

/**
 * Returns `true` iff the serialized payload is within the locked 5 MB body cap.
 * Pure — no IO, no process exit. Uses `JSON.stringify(payload).length` (UTF-16
 * code units; the manifest content is ASCII so this tracks the byte size).
 *
 * @param {object} payload - The `{ runId, startedAt, cellCount, anomalyCounts, manifestBlob }` body.
 * @returns {boolean}
 */
export function isWithinBodyCap(payload) {
  return JSON.stringify(payload).length <= BODY_CAP_BYTES;
}

/**
 * Reads and validates the two required env vars. Exits 2 on missing/empty.
 *
 * @returns {{ sweepSubmitToken: string, apiBaseUrl: string }}
 */
function readRequiredEnv() {
  if (isWeeklySubmitEnvComplete(process.env) === false) {
    process.stderr.write(
      'sweep-weekly-submit: SWEEP_SUBMIT_TOKEN and/or API_BASE_URL env var is unset or empty; refusing to submit.\n',
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  return {
    sweepSubmitToken: process.env.SWEEP_SUBMIT_TOKEN,
    apiBaseUrl: process.env.API_BASE_URL,
  };
}

/**
 * Parses argv into a flag map (`--flag value` pairs only).
 *
 * @param {readonly string[]} argv
 * @returns {Record<string, string>}
 */
function parseArguments(argv) {
  const recognisedFlags = new Set(['--manifests-dir', '--run-id-base', '--window-index']);
  const parsed = {};
  let cursor = 0;
  while (cursor < argv.length) {
    const flag = argv[cursor];
    if (!recognisedFlags.has(flag)) {
      throw new Error(
        `sweep-weekly-submit received unrecognised CLI flag "${flag}"; expected one of ${[...recognisedFlags].join(', ')}.`,
      );
    }
    const value = argv[cursor + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(
        `sweep-weekly-submit flag "${flag}" requires a value; received ${value === undefined ? 'end-of-arguments' : `another flag "${value}"`}.`,
      );
    }
    parsed[flag] = value;
    cursor += 2;
  }
  return parsed;
}

/**
 * Recursively finds every file named `manifest.jsonl` beneath `rootDir`. The
 * download-artifact step (pattern `sweep-shard-*`, no `merge-multiple`) lands
 * each shard's manifest in its own subdir, so the four identically-named files
 * never collide.
 *
 * @param {string} rootDir
 * @returns {Promise<string[]>} Ascending-sorted manifest paths.
 */
async function findShardManifestPaths(rootDir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (readError) {
    throw new Error(
      `sweep-weekly-submit failed to read the manifests directory at "${rootDir}": ${readError.message}. Verify the download-artifact step populated it.`,
    );
  }
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findShardManifestPaths(fullPath);
      for (const nestedPath of nested) {
        found.push(nestedPath);
      }
    } else if (entry.name === 'manifest.jsonl') {
      found.push(fullPath);
    }
  }
  found.sort();
  return found;
}

/**
 * Reads the shard manifests, asserts the locked shard count, concatenates +
 * sorts the records, and returns the combined parse result. Exits 3 on a
 * directory read failure, a shard-count mismatch, or a manifest read failure
 * — every exit-3 path is BEFORE the POST.
 *
 * @param {string} manifestsDir
 * @returns {Promise<{ records: object[], malformedLines: { lineNumber: number, reason: string }[] }>}
 */
async function readAndCombineShardManifests(manifestsDir) {
  let manifestPaths;
  try {
    manifestPaths = await findShardManifestPaths(manifestsDir);
  } catch (findError) {
    const errorMessage = findError instanceof Error ? findError.message : String(findError);
    process.stderr.write(`sweep-weekly-submit: ${errorMessage}\n`);
    process.exit(EXIT_MANIFEST_OR_ANALYZE_ERROR);
  }
  if (isExpectedShardCount(manifestPaths.length) === false) {
    process.stderr.write(
      `sweep-weekly-submit: found ${manifestPaths.length} shard manifest(s) under "${manifestsDir}" but expected exactly ${SHARD_COUNT}; refusing to submit a partial sweep (no POST).\n`,
    );
    process.exit(EXIT_MANIFEST_OR_ANALYZE_ERROR);
  }
  const manifestTexts = [];
  for (const manifestPath of manifestPaths) {
    try {
      manifestTexts.push(await readFile(manifestPath, 'utf8'));
    } catch (readError) {
      const errorMessage = readError instanceof Error ? readError.message : String(readError);
      process.stderr.write(
        `sweep-weekly-submit: failed to read shard manifest at "${manifestPath}" (${errorMessage}); refusing to submit a partial sweep (no POST).\n`,
      );
      process.exit(EXIT_MANIFEST_OR_ANALYZE_ERROR);
    }
  }
  return concatenateShardManifests(manifestTexts);
}

/**
 * Runs the engine analyzer over the combined records. Exits 3 on throw or a
 * non-`ManifestClassification` shape (mirrors `sweep-submit.mjs`).
 *
 * @param {readonly object[]} records
 * @param {readonly { lineNumber: number, reason: string }[]} malformedLines
 * @returns {import('@legendary-arena/game-engine').ManifestClassification}
 */
function classifyOrExit(records, malformedLines) {
  let classification;
  try {
    classification = classifyManifestRecords(records, malformedLines);
  } catch (analyzerError) {
    const errorMessage = analyzerError instanceof Error ? analyzerError.message : String(analyzerError);
    process.stderr.write(`sweep-weekly-submit: classifyManifestRecords threw (${errorMessage}); no POST.\n`);
    process.exit(EXIT_MANIFEST_OR_ANALYZE_ERROR);
  }
  if (
    classification === null ||
    typeof classification !== 'object' ||
    typeof classification.summary !== 'object' ||
    classification.summary === null ||
    typeof classification.summary.totalCells !== 'number' ||
    typeof classification.summary.anomalyCounts !== 'object'
  ) {
    process.stderr.write(
      'sweep-weekly-submit: classifyManifestRecords returned a non-ManifestClassification shape; no POST.\n',
    );
    process.exit(EXIT_MANIFEST_OR_ANALYZE_ERROR);
  }
  return classification;
}

/**
 * POSTs the combined summary to `${apiBaseUrl}/api/sweep/runs`. Exits 4 on
 * non-2xx, network error, or response-shape mismatch (mirrors
 * `sweep-submit.mjs`).
 *
 * @param {string} apiBaseUrl
 * @param {string} sweepSubmitToken
 * @param {string} runId
 * @param {object} payload
 */
async function postSummary(apiBaseUrl, sweepSubmitToken, runId, payload) {
  const submitUrl = `${apiBaseUrl}/api/sweep/runs`;
  let response;
  try {
    response = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sweep-Token': sweepSubmitToken,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
    process.stderr.write(
      `sweep-weekly-submit: POST to ${submitUrl} failed at the network layer (${errorMessage}).\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }
  if (response.status < 200 || response.status >= 300) {
    let responseBodyText;
    try {
      responseBodyText = await response.text();
    } catch (readBodyError) {
      void readBodyError;
      responseBodyText = '<unreadable>';
    }
    process.stderr.write(
      `sweep-weekly-submit: POST to ${submitUrl} returned status ${response.status}; body: ${responseBodyText}.\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    process.stderr.write(
      `sweep-weekly-submit: POST to ${submitUrl} returned a non-JSON response body (${errorMessage}).\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }
  if (
    responseBody === null ||
    typeof responseBody !== 'object' ||
    typeof responseBody.data !== 'object' ||
    responseBody.data === null ||
    responseBody.data.runId !== runId ||
    responseBody.data.accepted !== true
  ) {
    process.stderr.write(
      `sweep-weekly-submit: POST to ${submitUrl} returned an unexpected response envelope; expected { data: { runId: "${runId}", accepted: true } }; got: ${JSON.stringify(responseBody)}.\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }
}

async function main() {
  const { sweepSubmitToken, apiBaseUrl } = readRequiredEnv();
  const parsedArgs = parseArguments(process.argv.slice(2));

  const manifestsDir = parsedArgs['--manifests-dir'];
  if (typeof manifestsDir !== 'string' || manifestsDir.length === 0) {
    process.stderr.write(
      'sweep-weekly-submit: --manifests-dir is required and must be the directory the shard artifacts were downloaded into.\n',
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  const runIdBase = parsedArgs['--run-id-base'];
  if (typeof runIdBase !== 'string' || runIdBase.length === 0) {
    process.stderr.write(
      'sweep-weekly-submit: --run-id-base is required and must be the <shortSha>-<compactTimestampUtc> base derived once in the plan job.\n',
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  const windowIndexRaw = parsedArgs['--window-index'];
  // why: parseInt(value, 10) forces base-10 so a window index is never read as
  // octal; the value labels the runId so an operator can audit the rotation.
  const windowIndex = parseInt(windowIndexRaw ?? '', 10);
  if (!Number.isInteger(windowIndex) || windowIndex < 0) {
    process.stderr.write(
      `sweep-weekly-submit: --window-index "${windowIndexRaw}" is not a non-negative integer; pass the plan job's window_index output.\n`,
    );
    process.exit(EXIT_CONFIG_ERROR);
  }

  const { records, malformedLines } = await readAndCombineShardManifests(manifestsDir);
  const classification = classifyOrExit(records, malformedLines);

  // why (D-23402): the runId base is computed ONCE in the plan job and shared
  // across the shards + this combine (no per-shard date drift); the `-weekly`
  // suffix keeps the id space disjoint from the daily 2×2 smoke, and the
  // `-w<windowIndex>` suffix records which rotation window this run covered so
  // an operator can audit coverage from `sweep_runs` alone. A same-second
  // collision is a safe 409 no-op (the sweep_runs PRIMARY KEY).
  const runId = `${runIdBase}-weekly-w${windowIndex}`;
  // why: startedAt is submit metadata stamped by this CI-layer combine job; it
  // never reaches the engine, the per-cell seed chain (D-19402), or any
  // simulation input, so the determinism boundary is intact. The
  // collision-relevant runId base is the plan job's once-computed value.
  const startedAt = new Date().toISOString();
  const payload = {
    runId,
    startedAt,
    cellCount: classification.summary.totalCells,
    anomalyCounts: classification.summary.anomalyCounts,
    manifestBlob: classification,
  };

  if (isWithinBodyCap(payload) === false) {
    process.stderr.write(
      `sweep-weekly-submit: the serialized payload for runId=${runId} exceeds the locked ${BODY_CAP_BYTES}-byte /api/sweep/runs body cap; refusing to POST (raise the cap with a successor D-entry or shrink the window).\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }

  process.stdout.write(
    `sweep-weekly-submit: submitting runId=${runId}; ${classification.summary.totalCells} cells; ` +
      `anomalyCounts=${JSON.stringify(classification.summary.anomalyCounts)}; malformedLines=${malformedLines.length}\n`,
  );
  await postSummary(apiBaseUrl, sweepSubmitToken, runId, payload);
  process.stdout.write(`sweep-weekly-submit: success runId=${runId}\n`);
}

// why: run main() only when this file is the process entry point so the unit
// test can import the pure helpers without triggering a live submit.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`sweep-weekly-submit: unhandled error (${errorMessage}); no POST guaranteed.\n`);
    process.exit(EXIT_MANIFEST_OR_ANALYZE_ERROR);
  });
}
