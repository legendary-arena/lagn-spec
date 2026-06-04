#!/usr/bin/env node
/**
 * Sweep submission wrapper (WP-209 / EC-241).
 *
 * Operator-facing nightly entry point invoked via `pnpm sweep:nightly`. The
 * script:
 *
 *   1. Validates required env vars (`SWEEP_SUBMIT_TOKEN`, `API_BASE_URL`) at
 *      entry — fail-fast with exit 2 BEFORE the sweep runs.
 *   2. Derives a deterministic `runId` of form `<shortSha>-<isoTimestampUtc>`
 *      from `git rev-parse --short HEAD` + UTC now. Format avoids 409 on
 *      legitimate same-commit re-runs (manual operator forensic re-run;
 *      nightly retries after partial failure); a bare SHA would collide.
 *   3. Invokes `node scripts/sweep-setup-matrix.mjs` with the locked 6-flag
 *      set (`--run-id <runId> --seed nightly --setup data/sweep-fixtures/setup.json
 *      --scheme-ids data/sweep-fixtures/scheme-ids.json --mastermind-ids
 *      data/sweep-fixtures/mastermind-ids.json --policy random`). The fixture
 *      paths and policy are locked per D-20704 (v1 = 2×2 smoke = 4 cells).
 *   4. Reads `sweep-output/<runId>/manifest.jsonl` line-by-line, parses each
 *      via the engine's `parseManifestLine`, aggregates into
 *      `ParsedManifestRecord[]` + `MalformedLine[]`.
 *   5. Classifies via the engine's `classifyManifestRecords(records,
 *      malformedLines)` — pure function, no IO.
 *   6. POSTs the summary to `${API_BASE_URL}/api/sweep/runs` with the
 *      `X-Sweep-Token` header carrying `process.env.SWEEP_SUBMIT_TOKEN`.
 *   7. On confirmed `{ data: { runId, accepted: true } }` response, `rm -rf`s
 *      `sweep-output/<runId>/`. Cleanup runs ONLY on exit 0 — every non-zero
 *      exit path PRESERVES the local artifact for operator forensic re-analyze.
 *
 * Exit-code mapping (locked per WP-209 §Submission Script Failure Modes):
 *   - 0: success (POST 201 + cleanup complete)
 *   - 2: config/git error (env var missing/empty, git rev-parse failed)
 *   - 3: sweep/analyze error (sweep runner non-zero, manifest read fail,
 *        classifier threw or returned wrong shape)
 *   - 4: network/POST error (non-2xx response, network error, response
 *        body does not match expected envelope)
 *
 * Authority: WP-209 §Submission Script Failure Modes + §Locked contract values;
 * EC-241 §Locked Values + §Required `// why:` Comments; D-20701 (storage
 * shape lock); D-20702 (auth posture); D-20704 (sweep nightly axis cardinality
 * lock); D-19402 (sweep PRNG deterministic seed chain); D-19403 (sweep-output
 * gitignored + ephemeral).
 */

import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  classifyManifestRecords,
  parseManifestLine,
} from '@legendary-arena/game-engine';

const execFileAsync = promisify(execFile);

// why: __dirname is unavailable in ESM; reconstruct from import.meta.url so
// the script anchors paths relative to itself regardless of the cwd it is
// invoked from. The sweep runner uses the same trick.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const SWEEP_OUTPUT_ROOT = join(REPO_ROOT, 'sweep-output');
const SWEEP_RUNNER_SCRIPT = join(REPO_ROOT, 'scripts', 'sweep-setup-matrix.mjs');

// why (D-20704): the locked fixture paths the workflow passes verbatim to
// `sweep-setup-matrix.mjs` as `--setup` / `--scheme-ids` / `--mastermind-ids`.
// The submission script does NOT pass `--max-cells` — the 4-cell smoke is
// far under the default 10000 cap, and adding the flag would be one more
// drift surface.
const SWEEP_SETUP_FIXTURE = join(REPO_ROOT, 'data', 'sweep-fixtures', 'setup.json');
const SWEEP_SCHEME_IDS_FIXTURE = join(REPO_ROOT, 'data', 'sweep-fixtures', 'scheme-ids.json');
const SWEEP_MASTERMIND_IDS_FIXTURE = join(REPO_ROOT, 'data', 'sweep-fixtures', 'mastermind-ids.json');

// why (D-20704): the locked seed + policy. `--seed nightly` produces
// byte-identical per-cell seeds across reruns; `--policy random` is the
// deterministic v1 choice (heuristic-policy comparison sweeps are a future
// hardening WP).
const SWEEP_SEED = 'nightly';
const SWEEP_POLICY = 'random';

// Exit code map — locked per WP-209 §Submission Script Failure Modes.
const EXIT_CONFIG_ERROR = 2;
const EXIT_SWEEP_OR_ANALYZE_ERROR = 3;
const EXIT_NETWORK_OR_POST_ERROR = 4;

/**
 * Reads and validates the two required env vars. Exits with code 2 on
 * missing/empty values BEFORE any sweep work is dispatched.
 *
 * @returns {{ sweepSubmitToken: string, apiBaseUrl: string }}
 */
function readRequiredEnv() {
  const sweepSubmitToken = process.env.SWEEP_SUBMIT_TOKEN;
  const apiBaseUrl = process.env.API_BASE_URL;
  if (typeof sweepSubmitToken !== 'string' || sweepSubmitToken.length === 0) {
    process.stderr.write(
      'sweep-submit: SWEEP_SUBMIT_TOKEN env var is unset or empty; refusing to dispatch the sweep.\n',
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    process.stderr.write(
      'sweep-submit: API_BASE_URL env var is unset or empty; refusing to dispatch the sweep.\n',
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  return { sweepSubmitToken, apiBaseUrl };
}

/**
 * Derives the deterministic `runId` of form `<shortSha>-<isoTimestampUtc>`.
 * Exits with code 2 on git failure.
 *
 * @returns {Promise<{ runId: string, startedAt: string }>}
 */
async function deriveRunIdAndStart() {
  let shortSha;
  try {
    const result = await execFileAsync('git', ['rev-parse', '--short', 'HEAD']);
    shortSha = result.stdout.trim();
  } catch (gitError) {
    const errorMessage = gitError instanceof Error ? gitError.message : String(gitError);
    process.stderr.write(
      `sweep-submit: git rev-parse --short HEAD failed (${errorMessage}); the runId cannot be derived without a git context.\n`,
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  if (shortSha === undefined || shortSha === null || shortSha.length === 0) {
    process.stderr.write(
      'sweep-submit: git rev-parse --short HEAD returned an empty string; refusing to dispatch with an undefined runId.\n',
    );
    process.exit(EXIT_CONFIG_ERROR);
  }
  const startedAtIso = new Date().toISOString();
  // why (WP-209): shortSha+timestamp format avoids 409 on legitimate retry of
  // the same commit (manual operator re-run, nightly partial-failure retry);
  // a bare sha would collide. Compact-basic ISO-8601 form (no separators) is
  // the documented pattern.
  const compactTimestamp = startedAtIso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const runId = `${shortSha}-${compactTimestamp}`;
  return { runId, startedAt: startedAtIso };
}

/**
 * Invokes `scripts/sweep-setup-matrix.mjs` with the locked 6-flag set. Exits
 * with code 3 on non-zero exit; the local `sweep-output/<runId>/` directory
 * is PRESERVED so the operator can re-run classification against the
 * persisted JSONL.
 *
 * @param {string} runId
 */
async function invokeSweepRunner(runId) {
  try {
    await execFileAsync(
      'node',
      [
        SWEEP_RUNNER_SCRIPT,
        '--run-id',
        runId,
        '--seed',
        SWEEP_SEED,
        '--setup',
        SWEEP_SETUP_FIXTURE,
        '--scheme-ids',
        SWEEP_SCHEME_IDS_FIXTURE,
        '--mastermind-ids',
        SWEEP_MASTERMIND_IDS_FIXTURE,
        '--policy',
        SWEEP_POLICY,
      ],
      // why: the sweep runner can emit a large stdout/stderr stream when
      // many cells run; the 50 MB buffer accommodates worst-case verbose
      // output without truncation (a truncated stderr would obscure the
      // failure reason during operator triage).
      { maxBuffer: 50 * 1024 * 1024 },
    );
  } catch (runnerError) {
    const errorMessage =
      runnerError instanceof Error ? runnerError.message : String(runnerError);
    process.stderr.write(
      `sweep-submit: sweep-setup-matrix.mjs exited non-zero (${errorMessage}); local artifact preserved at sweep-output/${runId}/ for forensic re-analyze.\n`,
    );
    process.exit(EXIT_SWEEP_OR_ANALYZE_ERROR);
  }
}

/**
 * Reads `sweep-output/<runId>/manifest.jsonl`, parses each line via the
 * engine's `parseManifestLine`, and aggregates into the
 * `(ParsedManifestRecord[], MalformedLine[])` pair the analyzer consumes.
 * Exits with code 3 on file-read failure; the local artifact is PRESERVED.
 *
 * @param {string} runId
 * @returns {Promise<{ records: import('@legendary-arena/game-engine').ParsedManifestRecord[], malformedLines: import('@legendary-arena/game-engine').MalformedLine[] }>}
 */
async function readAndParseManifest(runId) {
  const manifestPath = join(SWEEP_OUTPUT_ROOT, runId, 'manifest.jsonl');
  let contents;
  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (readError) {
    const errorMessage = readError instanceof Error ? readError.message : String(readError);
    process.stderr.write(
      `sweep-submit: failed to read manifest at ${manifestPath} (${errorMessage}); local artifact preserved for forensic.\n`,
    );
    process.exit(EXIT_SWEEP_OR_ANALYZE_ERROR);
  }
  const records = [];
  const malformedLines = [];
  const lines = contents.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex = lineIndex + 1) {
    const rawLine = lines[lineIndex];
    if (rawLine === undefined || rawLine.length === 0) {
      continue;
    }
    const lineNumber = lineIndex + 1;
    const result = parseManifestLine(rawLine);
    if (result.record === null) {
      malformedLines.push({
        lineNumber,
        reason:
          result.malformedReason ??
          `Manifest line ${lineNumber} produced no parsed record and no rejection reason; parser invariant violated.`,
      });
      continue;
    }
    records.push(result.record);
  }
  return { records, malformedLines };
}

/**
 * Runs the engine analyzer's classifier over the parsed records. Exits with
 * code 3 on throw or shape violation; the local artifact is PRESERVED.
 *
 * @param {readonly import('@legendary-arena/game-engine').ParsedManifestRecord[]} records
 * @param {readonly import('@legendary-arena/game-engine').MalformedLine[]} malformedLines
 * @param {string} runId
 * @returns {import('@legendary-arena/game-engine').ManifestClassification}
 */
function classifyOrExit(records, malformedLines, runId) {
  let classification;
  try {
    classification = classifyManifestRecords(records, malformedLines);
  } catch (analyzerError) {
    const errorMessage =
      analyzerError instanceof Error ? analyzerError.message : String(analyzerError);
    process.stderr.write(
      `sweep-submit: classifyManifestRecords threw (${errorMessage}); local artifact preserved at sweep-output/${runId}/ for forensic.\n`,
    );
    process.exit(EXIT_SWEEP_OR_ANALYZE_ERROR);
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
      `sweep-submit: classifyManifestRecords returned a non-ManifestClassification shape; local artifact preserved at sweep-output/${runId}/ for forensic.\n`,
    );
    process.exit(EXIT_SWEEP_OR_ANALYZE_ERROR);
  }
  return classification;
}

/**
 * POSTs the classified summary to `${apiBaseUrl}/api/sweep/runs`. Exits with
 * code 4 on non-2xx response, network error, or response-shape mismatch; the
 * local artifact is PRESERVED.
 *
 * @param {string} apiBaseUrl
 * @param {string} sweepSubmitToken
 * @param {string} runId
 * @param {string} startedAt
 * @param {import('@legendary-arena/game-engine').ManifestClassification} classification
 */
async function postSummary(apiBaseUrl, sweepSubmitToken, runId, startedAt, classification) {
  const payload = {
    runId,
    startedAt,
    cellCount: classification.summary.totalCells,
    anomalyCounts: classification.summary.anomalyCounts,
    manifestBlob: classification,
  };
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
    const errorMessage =
      networkError instanceof Error ? networkError.message : String(networkError);
    process.stderr.write(
      `sweep-submit: POST to ${submitUrl} failed at the network layer (${errorMessage}); local artifact preserved at sweep-output/${runId}/.\n`,
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
      `sweep-submit: POST to ${submitUrl} returned status ${response.status}; body: ${responseBodyText}; local artifact preserved at sweep-output/${runId}/.\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (parseError) {
    const errorMessage =
      parseError instanceof Error ? parseError.message : String(parseError);
    process.stderr.write(
      `sweep-submit: POST to ${submitUrl} returned non-JSON response body (${errorMessage}); local artifact preserved at sweep-output/${runId}/.\n`,
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
      `sweep-submit: POST to ${submitUrl} returned an unexpected response envelope; expected { data: { runId: "${runId}", accepted: true } }; got: ${JSON.stringify(responseBody)}; local artifact preserved at sweep-output/${runId}/.\n`,
    );
    process.exit(EXIT_NETWORK_OR_POST_ERROR);
  }
}

/**
 * Removes the local `sweep-output/<runId>/` directory. Runs ONLY after a
 * confirmed POST success — every non-zero exit path skips this step so the
 * local artifact is preserved for forensic.
 *
 * @param {string} runId
 */
async function cleanupLocalArtifact(runId) {
  const runDirectory = join(SWEEP_OUTPUT_ROOT, runId);
  // why (D-19403): sweep-output/ is gitignored and the durable record now
  // lives in legendary.sweep_runs; the local artifact is forensic-only and
  // pruned on successful submit to keep disk usage bounded across nightly
  // runs. Cleanup runs ONLY on exit 0 — every non-zero path preserves the
  // artifact for post-mortem.
  await rm(runDirectory, { recursive: true, force: true });
}

async function main() {
  const { sweepSubmitToken, apiBaseUrl } = readRequiredEnv();
  const { runId, startedAt } = await deriveRunIdAndStart();
  process.stdout.write(`sweep-submit: dispatching runId=${runId} startedAt=${startedAt}\n`);
  await invokeSweepRunner(runId);
  const { records, malformedLines } = await readAndParseManifest(runId);
  const classification = classifyOrExit(records, malformedLines, runId);
  process.stdout.write(
    `sweep-submit: classified ${classification.summary.totalCells} cells; ` +
      `anomalyCounts=${JSON.stringify(classification.summary.anomalyCounts)}; ` +
      `malformedLines=${malformedLines.length}\n`,
  );
  await postSummary(apiBaseUrl, sweepSubmitToken, runId, startedAt, classification);
  await cleanupLocalArtifact(runId);
  process.stdout.write(`sweep-submit: success runId=${runId}\n`);
}

main().catch((unhandledError) => {
  const errorMessage =
    unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
  process.stderr.write(`sweep-submit: unhandled error (${errorMessage}); local artifact preserved.\n`);
  // why: unreachable in the happy path because every documented failure
  // mode calls process.exit() directly; this catch is the unhandled-throw
  // backstop. Exit 3 maps to "sweep/analyze error" because the only paths
  // that could reach here are an unexpected exception inside readAndParseManifest
  // / classifyOrExit / cleanupLocalArtifact (the env-var + runId paths exit
  // before any throw; the POST path catches its own throws).
  process.exit(EXIT_SWEEP_OR_ANALYZE_ERROR);
});
