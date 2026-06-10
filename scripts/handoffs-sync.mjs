#!/usr/bin/env node
/**
 * Handoffs sync wrapper (WP-232 / EC-264).
 *
 * Additive trailing step of the nightly Inspector triage workflow. After the
 * inspection report is submitted, this script refreshes the handoff queue by
 * POSTing to `POST /api/handoffs/sync` — which idempotently materializes one
 * `open` handoff row per finding of the latest inspection report. It carries no
 * body (the endpoint always syncs the latest report); a re-sync of an
 * already-materialized report is a normal no-op.
 *
 *   1. Validates required env vars (`HANDOFF_SUBMIT_TOKEN`, `API_BASE_URL`) at
 *      entry — fail-fast with exit 1, no request made.
 *   2. POSTs an empty JSON body to `${API_BASE_URL}/api/handoffs/sync` with the
 *      `X-Handoff-Token` header. A network error OR a non-200 response -> exit 2.
 *   3. On a confirmed 200, prints the sync summary and exits 0.
 *
 * Exit-code map (locked per WP-232 §Script Exit Codes):
 *   - 0: success (POST returned 200)
 *   - 1: missing/empty env vars (`HANDOFF_SUBMIT_TOKEN`, `API_BASE_URL`)
 *   - 2: request failure (network error OR non-2xx from `POST /api/handoffs/sync`)
 *
 * The pure helpers (`isHandoffSyncEnvComplete`, `classifySyncStatus`,
 * `isValidHandoffSyncSummaryShape`) are exported for unit testing; `main()` runs
 * only when this file is the process entry point.
 *
 * Authority: WP-232 §Script Exit Codes + §Non-Negotiable Constraints; EC-264
 * §Locked Values; D-23203 (idempotent sync + handoff auth posture). Mirrors the
 * self-contained, built-in-`fetch`-only CI-script posture of
 * `scripts/inspection-submit.mjs` (no TypeScript import; no new npm dep).
 */

import { pathToFileURL } from 'node:url';

// Exit-code map — locked per WP-232 §Script Exit Codes.
const EXIT_MISSING_ENV = 1;
const EXIT_REQUEST_FAILURE = 2;

/**
 * Returns `true` iff both required env vars are present non-empty strings. Pure —
 * reads from the supplied `env` object so the test can drive it without mutating
 * `process.env`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isHandoffSyncEnvComplete(env) {
  const handoffSubmitToken = env.HANDOFF_SUBMIT_TOKEN;
  const apiBaseUrl = env.API_BASE_URL;
  return (
    typeof handoffSubmitToken === 'string' &&
    handoffSubmitToken.length > 0 &&
    typeof apiBaseUrl === 'string' &&
    apiBaseUrl.length > 0
  );
}

/**
 * Maps an HTTP status to the script's exit code: 200 -> 0 (success), anything
 * else -> 2 (request failure). Pure — no IO, no process exit — so the exit-code
 * mapping is unit-testable.
 *
 * @param {number} status
 * @returns {number}
 */
export function classifySyncStatus(status) {
  return status === 200 ? 0 : EXIT_REQUEST_FAILURE;
}

/**
 * Validates a parsed value against the locked `HandoffSyncSummary` shape:
 * `reportId` is `string | null`, `findingCount` / `created` / `unchanged` are
 * non-negative integers, and `created + unchanged === findingCount`. Used by the
 * success log to confirm the response is the contract shape before printing it.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidHandoffSyncSummaryShape(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (value.reportId !== null && typeof value.reportId !== 'string') {
    return false;
  }
  for (const countField of ['findingCount', 'created', 'unchanged']) {
    const countValue = value[countField];
    if (typeof countValue !== 'number' || Number.isInteger(countValue) === false || countValue < 0) {
      return false;
    }
  }
  return value.created + value.unchanged === value.findingCount;
}

/**
 * Reads and validates the two required env vars. Exits 1 on missing/empty.
 *
 * @returns {{ handoffSubmitToken: string, apiBaseUrl: string }}
 */
function readRequiredEnv() {
  if (isHandoffSyncEnvComplete(process.env) === false) {
    process.stderr.write(
      'handoffs-sync: HANDOFF_SUBMIT_TOKEN and/or API_BASE_URL env var is unset or empty; refusing to sync.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  return {
    handoffSubmitToken: process.env.HANDOFF_SUBMIT_TOKEN,
    apiBaseUrl: process.env.API_BASE_URL,
  };
}

/**
 * POSTs an empty body to the sync endpoint. Exits 2 on network error or a non-200
 * response.
 *
 * @param {string} apiBaseUrl
 * @param {string} handoffSubmitToken
 */
async function postSync(apiBaseUrl, handoffSubmitToken) {
  const syncUrl = `${apiBaseUrl}/api/handoffs/sync`;
  let response;
  try {
    response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Handoff-Token': handoffSubmitToken,
      },
      body: JSON.stringify({}),
    });
  } catch (networkError) {
    const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
    process.stderr.write(
      `handoffs-sync: POST ${syncUrl} failed at the network layer (${errorMessage}).\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  if (classifySyncStatus(response.status) !== 0) {
    let responseBodyText;
    try {
      responseBodyText = await response.text();
    } catch (readBodyError) {
      void readBodyError;
      responseBodyText = '<unreadable>';
    }
    process.stderr.write(
      `handoffs-sync: POST ${syncUrl} returned status ${response.status} (expected 200); body: ${responseBodyText}.\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  let summaryText = '<unreadable>';
  try {
    const parsed = await response.json();
    if (parsed !== null && typeof parsed === 'object' && isValidHandoffSyncSummaryShape(parsed.data)) {
      const summary = parsed.data;
      summaryText = `reportId=${summary.reportId} findingCount=${summary.findingCount} created=${summary.created} unchanged=${summary.unchanged}`;
    }
  } catch (readSummaryError) {
    // why: a 200 with an unreadable/unexpected body is still a successful sync —
    // the queue refresh is keyed on the HTTP 200, not on parsing the summary; the
    // summary is logged for operator visibility only, so a parse failure here must
    // not flip a successful sync to a non-zero exit.
    void readSummaryError;
  }
  process.stdout.write(`handoffs-sync: success — POST ${syncUrl} returned 200 (${summaryText}).\n`);
}

async function main() {
  const { handoffSubmitToken, apiBaseUrl } = readRequiredEnv();
  await postSync(apiBaseUrl, handoffSubmitToken);
}

// why: run main() only when this file is the process entry point so the unit
// test can import the pure helpers without triggering a live sync.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`handoffs-sync: unhandled error (${errorMessage}).\n`);
    process.exit(EXIT_REQUEST_FAILURE);
  });
}
