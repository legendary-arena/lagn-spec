#!/usr/bin/env node
/**
 * Handoffs verify wrapper (WP-233 / EC-265).
 *
 * Additive trailing step of the nightly Inspector triage workflow, AFTER
 * `handoffs:sync`. It closes the sweep loop by POSTing to
 * `POST /api/handoffs/verify` — which reads the latest (re-sweep) inspection
 * report, diffs every `fix-proposed` handoff's snapshotted
 * `(cellId, anomalyClass)` against it, and transitions each newer-report match
 * `→ resolved` (anomaly gone) or `→ claimed` (anomaly present) through the
 * EXISTING WP-232 lifecycle (no new state). It carries no body (the endpoint
 * always verifies the latest report); a second run against the same report is a
 * normal no-op (the eligible rows already transitioned out of `fix-proposed`).
 *
 *   1. Validates required env vars (`HANDOFF_SUBMIT_TOKEN`, `API_BASE_URL`) at
 *      entry — fail-fast with exit 1, no request made.
 *   2. POSTs an empty JSON body to `${API_BASE_URL}/api/handoffs/verify` with the
 *      `X-Handoff-Token` header. A network error OR a non-200 response -> exit 2.
 *   3. On a confirmed 200, prints the verify summary and exits 0.
 *
 * Exit-code map (locked per WP-233 §Script Exit Codes):
 *   - 0: success (POST returned 200)
 *   - 1: missing/empty env vars (`HANDOFF_SUBMIT_TOKEN`, `API_BASE_URL`)
 *   - 2: request failure (network error OR non-200 from `POST /api/handoffs/verify`)
 *
 * The pure helpers (`isHandoffVerifyEnvComplete`, `classifyVerifyStatus`,
 * `isValidHandoffVerifySummaryShape`) are exported for unit testing; `main()`
 * runs only when this file is the process entry point.
 *
 * Authority: WP-233 §Script Exit Codes + §Non-Negotiable Constraints; EC-265
 * §Locked Values; D-23301 (closed-loop verification posture) + D-23302
 * (autonomous nightly verify step). Mirrors the self-contained,
 * built-in-`fetch`-only CI-script posture of `scripts/handoffs-sync.mjs`
 * verbatim (no TypeScript import; no new npm dep).
 */

import { pathToFileURL } from 'node:url';

// Exit-code map — locked per WP-233 §Script Exit Codes.
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
export function isHandoffVerifyEnvComplete(env) {
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
 * mapping is unit-testable. Success is keyed on HTTP 200, NOT a 2xx range (a
 * `201` / `204` is exit 2) — verbatim with `scripts/handoffs-sync.mjs`.
 *
 * @param {number} status
 * @returns {number}
 */
export function classifyVerifyStatus(status) {
  return status === 200 ? 0 : EXIT_REQUEST_FAILURE;
}

/**
 * Validates a parsed value against the locked `HandoffVerifySummary` shape:
 * `reportId` is `string | null`, and `verified` / `regressed` / `skipped` are
 * non-negative integers. Used by the success log ONLY to confirm the response is
 * the contract shape before printing it — a shape miss logs `<unreadable>` and
 * still exits 0 (the run is keyed on HTTP 200, never on the body). There is NO
 * sum invariant: `verified + regressed + skipped` may be LESS than the initial
 * `fix-proposed` count (the delta is the concurrent misses the server excludes),
 * so this never cross-checks the three against a total.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidHandoffVerifySummaryShape(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (value.reportId !== null && typeof value.reportId !== 'string') {
    return false;
  }
  for (const countField of ['verified', 'regressed', 'skipped']) {
    const countValue = value[countField];
    if (typeof countValue !== 'number' || Number.isInteger(countValue) === false || countValue < 0) {
      return false;
    }
  }
  return true;
}

/**
 * Reads and validates the two required env vars. Exits 1 on missing/empty.
 *
 * @returns {{ handoffSubmitToken: string, apiBaseUrl: string }}
 */
function readRequiredEnv() {
  if (isHandoffVerifyEnvComplete(process.env) === false) {
    process.stderr.write(
      'handoffs-verify: HANDOFF_SUBMIT_TOKEN and/or API_BASE_URL env var is unset or empty; refusing to verify.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  return {
    handoffSubmitToken: process.env.HANDOFF_SUBMIT_TOKEN,
    apiBaseUrl: process.env.API_BASE_URL,
  };
}

/**
 * POSTs an empty body to the verify endpoint. Exits 2 on network error or a
 * non-200 response.
 *
 * @param {string} apiBaseUrl
 * @param {string} handoffSubmitToken
 */
async function postVerify(apiBaseUrl, handoffSubmitToken) {
  const verifyUrl = `${apiBaseUrl}/api/handoffs/verify`;
  let response;
  try {
    response = await fetch(verifyUrl, {
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
      `handoffs-verify: POST ${verifyUrl} failed at the network layer (${errorMessage}).\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  if (classifyVerifyStatus(response.status) !== 0) {
    let responseBodyText;
    try {
      responseBodyText = await response.text();
    } catch (readBodyError) {
      void readBodyError;
      responseBodyText = '<unreadable>';
    }
    process.stderr.write(
      `handoffs-verify: POST ${verifyUrl} returned status ${response.status} (expected 200); body: ${responseBodyText}.\n`,
    );
    process.exit(EXIT_REQUEST_FAILURE);
  }
  let summaryText = '<unreadable>';
  try {
    const parsed = await response.json();
    if (parsed !== null && typeof parsed === 'object' && isValidHandoffVerifySummaryShape(parsed.data)) {
      const summary = parsed.data;
      summaryText = `reportId=${summary.reportId} verified=${summary.verified} regressed=${summary.regressed} skipped=${summary.skipped}`;
    }
  } catch (readSummaryError) {
    // why: a 200 with an unreadable/unexpected body is still a successful verify —
    // the loop-close is keyed on the HTTP 200, not on parsing the summary; the
    // summary is logged for operator visibility only, so a parse failure here must
    // not flip a successful verify to a non-zero exit.
    void readSummaryError;
  }
  process.stdout.write(`handoffs-verify: success — POST ${verifyUrl} returned 200 (${summaryText}).\n`);
}

async function main() {
  const { handoffSubmitToken, apiBaseUrl } = readRequiredEnv();
  await postVerify(apiBaseUrl, handoffSubmitToken);
}

// why: run main() only when this file is the process entry point so the unit
// test can import the pure helpers without triggering a live verify.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`handoffs-verify: unhandled error (${errorMessage}).\n`);
    process.exit(EXIT_REQUEST_FAILURE);
  });
}
