#!/usr/bin/env node
/**
 * Inspection submit wrapper (WP-231 / EC-263).
 *
 * Final step of the nightly Inspector triage workflow. Reads the agent-produced
 * `inspection-work/inspection-report.json`, validates its shape + the
 * deterministic verdict agreement, POSTs it to the inspection endpoint, and
 * cleans up ONLY on confirmed success.
 *
 *   1. Validates required env vars (`INSPECTION_SUBMIT_TOKEN`, `API_BASE_URL`)
 *      at entry — fail-fast with exit 1.
 *   2. Reads `inspection-work/inspection-report.json` and parses it with a bare
 *      `JSON.parse` (no fence-stripping / regex recovery). A non-JSON / fenced
 *      output, or a parsed object failing the `InspectionReportPayload` shape
 *      check, -> exit 2.
 *   3. Checks verdict agreement: `computeVerdictFromFindings(findings)` must
 *      equal the agent's self-applied `verdict`. A mismatch (the agent is
 *      internally inconsistent) -> exit 3, BEFORE the POST.
 *   4. POSTs to `${API_BASE_URL}/api/inspection/reports` with the
 *      `X-Inspection-Token` header. Non-2xx (INCLUDING 409) -> exit 4.
 *   5. On confirmed 201, `rm -rf`s `inspection-work/`. Cleanup runs ONLY on
 *      success — every non-zero exit PRESERVES the work dir for forensic
 *      re-submit without re-running the agent.
 *
 * Exit-code map (locked per WP-231 §Script Exit Codes):
 *   - 0: success (POST 201 + cleanup complete)
 *   - 1: missing/empty env vars
 *   - 2: invalid agent output (bare `JSON.parse` threw, OR shape check failed)
 *   - 3: verdict mismatch (`computeVerdictFromFindings` != report.verdict)
 *   - 4: POST non-2xx (INCLUDING 409 — a duplicate reportId is a hard failure,
 *        never swallowed)
 *
 * The pure helpers (`computeVerdictFromFindings`, `isValidInspectionReportShape`,
 * `classifyAgentReport`) are exported for unit testing; `main()` runs only when
 * this file is the process entry point.
 *
 * Authority: WP-231 §Script Exit Codes + §CI Failure Semantics + §Non-Negotiable
 * Constraints ("The triage prompt MUST demand STRICT JSON" / bare `JSON.parse`);
 * EC-263 §Locked Values + §Required `// why:` Comments; D-23101 (server is the
 * durable derived-field authority); D-23102 (deterministic verdict rule).
 */

import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const INSPECTION_WORK_DIR = join(REPO_ROOT, 'inspection-work');
const REPORT_PATH = join(INSPECTION_WORK_DIR, 'inspection-report.json');

// Exit-code map — locked per WP-231 §Script Exit Codes.
const EXIT_MISSING_ENV = 1;
const EXIT_INVALID_OUTPUT = 2;
const EXIT_VERDICT_MISMATCH = 3;
const EXIT_POST_FAILURE = 4;

const VALID_SEVERITIES = new Set(['P0', 'P1', 'P2']);
const VALID_ROUTES = new Set(['Builder', 'Architect']);

/**
 * The deterministic agent-inspector verdict rule: `FAIL` iff any finding is
 * `P0` or `P1`, else `PASS`.
 *
 * why: this inlines the same rule as the server's `deriveVerdict`
 * (`apps/server/src/inspection/inspection.logic.ts`) rather than importing it —
 * a plain-`node` CI script cannot import a TypeScript server module at runtime,
 * and the sweep-submit precedent keeps CI scripts self-contained. This copy is
 * an ADVISORY fail-fast gate only (exit 3): the SERVER recomputes the verdict
 * and ignores whatever the client sent (D-23101), so even if this copy drifted
 * the durable verdict stays correct — this check only catches a self-
 * inconsistent agent before a pointless POST.
 *
 * @param {ReadonlyArray<{ severity: string }>} findings
 * @returns {'PASS' | 'FAIL'}
 */
export function computeVerdictFromFindings(findings) {
  for (const finding of findings) {
    if (finding.severity === 'P0' || finding.severity === 'P1') {
      return 'FAIL';
    }
  }
  return 'PASS';
}

/**
 * Validates one finding against the locked `InspectionFinding` shape. Content
 * (the description TEXT) is not judged — only shape — because findings are
 * LLM-generated (D-23102).
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
function isValidFinding(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false;
  }
  if (VALID_SEVERITIES.has(candidate.severity) === false) {
    return false;
  }
  if (VALID_ROUTES.has(candidate.route) === false) {
    return false;
  }
  if (typeof candidate.anomalyClass !== 'string' || candidate.anomalyClass.length === 0) {
    return false;
  }
  if (typeof candidate.description !== 'string' || candidate.description.length === 0) {
    return false;
  }
  if (candidate.cellId !== null && typeof candidate.cellId !== 'string') {
    return false;
  }
  return true;
}

/**
 * Validates a parsed object against the locked `InspectionReportPayload` shape.
 * Returns `true` only when every field is present and well-typed.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidInspectionReportShape(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (typeof value.reportId !== 'string' || value.reportId.length === 0) {
    return false;
  }
  if (typeof value.sweepRunId !== 'string' || value.sweepRunId.length === 0) {
    return false;
  }
  if (typeof value.generatedAt !== 'string' || Number.isNaN(new Date(value.generatedAt).getTime())) {
    return false;
  }
  if (value.verdict !== 'PASS' && value.verdict !== 'FAIL') {
    return false;
  }
  if (Array.isArray(value.findings) === false) {
    return false;
  }
  for (const finding of value.findings) {
    if (isValidFinding(finding) === false) {
      return false;
    }
  }
  return true;
}

/**
 * Classifies the raw agent output into an exit code. Pure — no IO, no process
 * exit — so it is unit-testable. The caller (`main`) maps the returned
 * `exitCode` to `process.exit`.
 *
 *   - exit 2: bare `JSON.parse` threw (non-JSON / markdown-fenced), OR the
 *     parsed object failed the shape check.
 *   - exit 3: the parsed object is well-shaped but its `verdict` disagrees with
 *     `computeVerdictFromFindings(findings)`.
 *   - exit 0: valid + self-consistent; `report` carries the parsed payload.
 *
 * @param {string} rawText
 * @returns {{ exitCode: number, report?: object }}
 */
export function classifyAgentReport(rawText) {
  let parsed;
  try {
    // why: bare `JSON.parse` (no fence-stripping / regex recovery) so a
    // non-strict-JSON agent fails loudly at the boundary (exit 2) instead of via
    // brittle recovery hacks. The triage prompt demands JSON-only output; the
    // contract is enforced here, not patched around.
    parsed = JSON.parse(rawText);
  } catch {
    return { exitCode: EXIT_INVALID_OUTPUT };
  }
  if (isValidInspectionReportShape(parsed) === false) {
    return { exitCode: EXIT_INVALID_OUTPUT };
  }
  if (computeVerdictFromFindings(parsed.findings) !== parsed.verdict) {
    return { exitCode: EXIT_VERDICT_MISMATCH };
  }
  return { exitCode: 0, report: parsed };
}

/**
 * Reads and validates the two required env vars. Exits 1 on missing/empty.
 *
 * @returns {{ inspectionSubmitToken: string, apiBaseUrl: string }}
 */
function readRequiredEnv() {
  const inspectionSubmitToken = process.env.INSPECTION_SUBMIT_TOKEN;
  const apiBaseUrl = process.env.API_BASE_URL;
  if (typeof inspectionSubmitToken !== 'string' || inspectionSubmitToken.length === 0) {
    process.stderr.write(
      'inspection-submit: INSPECTION_SUBMIT_TOKEN env var is unset or empty; refusing to submit.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.length === 0) {
    process.stderr.write(
      'inspection-submit: API_BASE_URL env var is unset or empty; refusing to submit.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  return { inspectionSubmitToken, apiBaseUrl };
}

/**
 * POSTs the report. Exits 4 on network error or non-2xx (INCLUDING 409); the
 * work dir is PRESERVED on every failure path.
 *
 * @param {string} apiBaseUrl
 * @param {string} inspectionSubmitToken
 * @param {object} report
 */
async function postReport(apiBaseUrl, inspectionSubmitToken, report) {
  const submitUrl = `${apiBaseUrl}/api/inspection/reports`;
  let response;
  try {
    response = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inspection-Token': inspectionSubmitToken,
      },
      body: JSON.stringify(report),
    });
  } catch (networkError) {
    const errorMessage = networkError instanceof Error ? networkError.message : String(networkError);
    process.stderr.write(
      `inspection-submit: POST ${submitUrl} failed at the network layer (${errorMessage}); inspection-work/ preserved.\n`,
    );
    process.exit(EXIT_POST_FAILURE);
  }
  if (response.status !== 201) {
    let responseBodyText;
    try {
      responseBodyText = await response.text();
    } catch (readBodyError) {
      void readBodyError;
      responseBodyText = '<unreadable>';
    }
    // why (§CI Failure Semantics): a 409 (duplicate reportId) is a HARD failure
    // (exit 4), never swallowed — a duplicate submission is a signal, not a
    // no-op. No in-run auto-retry. The work dir is preserved for forensic.
    process.stderr.write(
      `inspection-submit: POST ${submitUrl} returned status ${response.status} (409 = duplicate reportId, a hard failure); body: ${responseBodyText}; inspection-work/ preserved.\n`,
    );
    process.exit(EXIT_POST_FAILURE);
  }
}

async function main() {
  const { inspectionSubmitToken, apiBaseUrl } = readRequiredEnv();
  let rawText;
  try {
    rawText = await readFile(REPORT_PATH, 'utf8');
  } catch (readError) {
    const errorMessage = readError instanceof Error ? readError.message : String(readError);
    process.stderr.write(
      `inspection-submit: failed to read the agent report at ${REPORT_PATH} (${errorMessage}); the triage agent produced no output. inspection-work/ preserved.\n`,
    );
    process.exit(EXIT_INVALID_OUTPUT);
  }
  const classification = classifyAgentReport(rawText);
  if (classification.exitCode !== 0) {
    if (classification.exitCode === EXIT_VERDICT_MISMATCH) {
      process.stderr.write(
        'inspection-submit: the agent verdict disagrees with the deterministic rule applied to its findings; ' +
          'the agent is internally inconsistent. inspection-work/ preserved (exit 3).\n',
      );
    } else {
      process.stderr.write(
        'inspection-submit: the agent output is not strict JSON in the locked InspectionReportPayload shape ' +
          '(bare JSON.parse / shape check failed). inspection-work/ preserved (exit 2).\n',
      );
    }
    process.exit(classification.exitCode);
  }
  await postReport(apiBaseUrl, inspectionSubmitToken, classification.report);
  // why: cleanup runs ONLY after a confirmed 201 — every non-zero exit above
  // PRESERVES inspection-work/ so a failed nightly triage can be re-submitted
  // from the persisted agent output without re-running the agent.
  await rm(INSPECTION_WORK_DIR, { recursive: true, force: true });
  process.stdout.write(
    `inspection-submit: success — POSTed reportId=${classification.report.reportId} and cleaned up inspection-work/.\n`,
  );
}

// why: run main() only when this file is the process entry point so the unit
// test can import the pure helpers without triggering a live submit.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`inspection-submit: unhandled error (${errorMessage}); inspection-work/ preserved.\n`);
    // why: an unexpected throw maps to exit 2 (invalid-output surface) — the
    // env path exits before any throw, the classify path is pure, and the POST
    // path catches its own throws; the only remaining surface is the file read.
    process.exit(EXIT_INVALID_OUTPUT);
  });
}
