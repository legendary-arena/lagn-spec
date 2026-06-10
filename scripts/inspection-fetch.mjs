#!/usr/bin/env node
/**
 * Inspection fetch wrapper (WP-231 / EC-263).
 *
 * First step of the nightly Inspector triage workflow. Fetches the latest sweep
 * run INCLUDING its forensic `manifestBlob` from the shared-secret CI read
 * endpoint and writes it to `inspection-work/sweep-input.json` for the headless
 * triage agent to reason over.
 *
 *   1. Validates required env vars (`SWEEP_SUBMIT_TOKEN`, `API_BASE_URL`) at
 *      entry — fail-fast with exit 1 BEFORE any request.
 *   2. GETs `${API_BASE_URL}/api/sweep/runs/latest` with the `X-Sweep-Token`
 *      header. Network error OR non-2xx -> exit 2.
 *   3. Requires a triageable input: a non-null `run` AND a non-null
 *      `run.manifestBlob` (the LLM triage path needs the forensic blob;
 *      triaging counts alone is the deterministic-classifier path explicitly
 *      out of scope). A null `run` OR null `manifestBlob` -> exit 3.
 *   4. Writes `inspection-work/sweep-input.json` and exits 0.
 *
 * Exit-code map (locked per WP-231 §Script Exit Codes):
 *   - 0: success — wrote `sweep-input.json` with a non-null run + non-null blob
 *   - 1: missing/empty env vars
 *   - 2: request failure (network error OR non-2xx)
 *   - 3: no triageable input (null run OR null manifestBlob)
 *
 * The pure guard `isTriageableSweepInput(run)` is exported for unit testing;
 * `main()` runs only when this file is the process entry point (so the test can
 * import the guard without triggering a live fetch).
 *
 * Authority: WP-231 §Script Exit Codes + §Non-Negotiable Constraints ("The
 * forensic blob is required triage input"); EC-263 §Locked Values; D-23103 (CI
 * sweep-blob read endpoint).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// why: __dirname is unavailable in ESM; reconstruct from import.meta.url so the
// script anchors paths relative to itself regardless of the cwd it runs from.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const INSPECTION_WORK_DIR = join(REPO_ROOT, 'inspection-work');
const SWEEP_INPUT_PATH = join(INSPECTION_WORK_DIR, 'sweep-input.json');

// Exit-code map — locked per WP-231 §Script Exit Codes.
const EXIT_MISSING_ENV = 1;
const EXIT_REQUEST_FAILURE = 2;
const EXIT_NO_TRIAGEABLE_INPUT = 3;

/**
 * Returns `true` iff `run` is a non-null object carrying a non-null
 * `manifestBlob`. A null `run` (empty sweep table) OR a null `manifestBlob`
 * (smaller submission that omitted the blob) is NOT triageable — the LLM path
 * requires the forensic blob.
 *
 * @param {unknown} run The `data.run` value from `GET /api/sweep/runs/latest`.
 * @returns {boolean}
 */
export function isTriageableSweepInput(run) {
  if (run === null || run === undefined || typeof run !== 'object') {
    return false;
  }
  const manifestBlob = run.manifestBlob;
  return manifestBlob !== null && manifestBlob !== undefined;
}

/**
 * Reads and validates the two required env vars. Exits 1 on missing/empty.
 *
 * @returns {{ sweepSubmitToken: string, apiBaseUrl: string }}
 */
function readRequiredEnv() {
  const sweepSubmitToken = process.env.SWEEP_SUBMIT_TOKEN;
  const apiBaseUrl = process.env.API_BASE_URL;
  if (typeof sweepSubmitToken !== 'string' || sweepSubmitToken.length === 0) {
    process.stderr.write(
      'inspection-fetch: SWEEP_SUBMIT_TOKEN env var is unset or empty; refusing to fetch the sweep input.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    process.stderr.write(
      'inspection-fetch: API_BASE_URL env var is unset or empty; refusing to fetch the sweep input.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  return { sweepSubmitToken, apiBaseUrl };
}

/**
 * GETs the latest sweep run + blob. Exits 2 on network error or non-2xx, or on
 * a response body that is not the expected `{ data: { run } }` envelope.
 *
 * @param {string} apiBaseUrl
 * @param {string} sweepSubmitToken
 * @returns {Promise<unknown>} the `data.run` value (object or null)
 */
async function fetchLatestSweepRun(apiBaseUrl, sweepSubmitToken) {
  const readUrl = `${apiBaseUrl}/api/sweep/runs/latest`;
  let response;
  try {
    response = await fetch(readUrl, {
      method: 'GET',
      headers: { 'X-Sweep-Token': sweepSubmitToken },
    });
  } catch (networkError) {
    const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
    process.stderr.write(
      `inspection-fetch: GET ${readUrl} failed at the network layer (${errorMessage}).\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  if (response.status < 200 || response.status >= 300) {
    process.stderr.write(
      `inspection-fetch: GET ${readUrl} returned status ${response.status}; expected 2xx.\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (parseError) {
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    process.stderr.write(
      `inspection-fetch: GET ${readUrl} returned a non-JSON body (${errorMessage}).\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  if (
    responseBody === null ||
    typeof responseBody !== 'object' ||
    typeof responseBody.data !== 'object' ||
    responseBody.data === null ||
    responseBody.data.run === undefined
  ) {
    process.stderr.write(
      `inspection-fetch: GET ${readUrl} returned an unexpected envelope; expected { data: { run } }; got: ${JSON.stringify(responseBody)}.\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  return responseBody.data.run;
}

async function main() {
  const { sweepSubmitToken, apiBaseUrl } = readRequiredEnv();
  const run = await fetchLatestSweepRun(apiBaseUrl, sweepSubmitToken);
  if (isTriageableSweepInput(run) === false) {
    process.stderr.write(
      'inspection-fetch: no triageable sweep input — the latest run is null OR its manifestBlob is null. ' +
        'The LLM triage path requires the forensic blob; aborting (exit 3).\n',
    );
    process.exit(EXIT_NO_TRIAGEABLE_INPUT);
  }
  await mkdir(INSPECTION_WORK_DIR, { recursive: true });
  await writeFile(SWEEP_INPUT_PATH, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  process.stdout.write(`inspection-fetch: wrote ${SWEEP_INPUT_PATH} (runId=${run.runId}).\n`);
}

// why: run main() only when this file is the process entry point so the unit
// test can `import { isTriageableSweepInput }` without triggering a live fetch.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`inspection-fetch: unhandled error (${errorMessage}).\n`);
    // why: an unexpected throw maps to exit 2 (request-layer surface) — the
    // env-var path exits before any throw, and the triageable-input path exits
    // explicitly; the only remaining throw surface is fetch/parse/IO.
    process.exit(EXIT_REQUEST_FAILURE);
  });
}
