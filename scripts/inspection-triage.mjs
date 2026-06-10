#!/usr/bin/env node
/**
 * Inspection triage (WP-231 / EC-263).
 *
 * Middle step of the nightly Inspector triage workflow, between
 * inspection-fetch.mjs and inspection-submit.mjs. Reads the sweep input the
 * fetch step wrote, calls the Claude Messages API (the Inspector) with the
 * self-contained rubric in scripts/inspection-triage-prompt.md to classify the
 * sweep into severity-tagged, routed findings, then assembles the
 * InspectionReportPayload envelope deterministically and writes
 * inspection-work/inspection-report.json for the submit step.
 *
 * why a direct Messages API call (not anthropics/claude-code-action): the action
 * is built for PR review — it requires a GitHub OIDC token and posts inline PR
 * comments — and it rejected the `model` input; neither fits a standalone
 * nightly triage. This triage is a single structured-classification call, which
 * is exactly what the Messages API + structured outputs is for. No new
 * dependency — Node's built-in fetch.
 *
 * why the model produces ONLY the `findings` array: this script owns the
 * deterministic envelope — `sweepRunId` (from the input run), `generatedAt`
 * (now), `reportId`, and `verdict` (FAIL iff any P0/P1) — so the verdict ALWAYS
 * agrees with the findings and the submit step never exit-3s on a mismatch.
 *
 * Exit-code map:
 *   - 0: success — wrote inspection-report.json
 *   - 1: missing/empty env (ANTHROPIC_API_KEY)
 *   - 2: sweep input unreadable / not JSON / missing runId, or rubric unreadable
 *   - 3: Messages API call failed (network, non-2xx, refusal, or empty content)
 *   - 4: the model response did not yield a usable findings array
 *
 * The pure helpers (toIsoCompact, buildReportId, computeVerdict, normalizeFinding,
 * extractFindings) are exported for unit testing; main() runs only when this file
 * is the process entry point.
 *
 * Authority: WP-231 §Script Exit Codes + §Non-Negotiable Constraints; the
 * claude-api skill (Messages API shape, structured outputs, claude-sonnet-4-6).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// why: __dirname is unavailable in ESM; reconstruct from import.meta.url so the
// script anchors paths relative to itself regardless of the cwd it runs from.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const INSPECTION_WORK_DIR = join(REPO_ROOT, 'inspection-work');
const SWEEP_INPUT_PATH = join(INSPECTION_WORK_DIR, 'sweep-input.json');
const REPORT_PATH = join(INSPECTION_WORK_DIR, 'inspection-report.json');
const RUBRIC_PATH = join(SCRIPT_DIRECTORY, 'inspection-triage-prompt.md');

// Exit-code map (documented in the workflow header).
const EXIT_MISSING_ENV = 1;
const EXIT_BAD_INPUT = 2;
const EXIT_API_FAILURE = 3;
const EXIT_BAD_MODEL_OUTPUT = 4;

// why: claude-sonnet-4-6 is the cost-appropriate model for this nightly
// structured-classification triage (WP-231 §Locked contract values). Bump to an
// Opus model in a future WP if triage depth proves insufficient.
const TRIAGE_MODEL = 'claude-sonnet-4-6';
const MESSAGES_ENDPOINT = 'https://api.anthropic.com/v1/messages';
// why: the pinned Anthropic Messages API version header per the API contract.
const ANTHROPIC_VERSION = '2023-06-01';
// why: the nightly matrix is small and the rubric caps findings (500 / meta
// aggregation), so output is bounded; 16000 leaves ample headroom without
// streaming. A truncated (max_tokens) response yields unparseable JSON and is
// caught as bad model output (exit 4).
const MAX_TOKENS = 16000;

const VALID_SEVERITIES = new Set(['P0', 'P1', 'P2']);
const VALID_ROUTES = new Set(['Builder', 'Architect']);

// why: structured-output schema constraining the model to a findings array only
// (the envelope is assembled by this script). Follows the structured-output
// limitations: additionalProperties:false on every object, enums for closed
// sets, anyOf for the nullable cellId.
const FINDINGS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          route: { type: 'string', enum: ['Builder', 'Architect'] },
          anomalyClass: { type: 'string' },
          description: { type: 'string' },
          cellId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['severity', 'route', 'anomalyClass', 'description', 'cellId'],
      },
    },
  },
  required: ['findings'],
};

/**
 * Compresses an ISO-8601 timestamp into the compact form used in reportId: strip
 * `-` and `:`, drop fractional seconds. e.g.
 * "2026-06-10T07:15:30.000Z" -> "20260610T071530Z".
 *
 * @param {string} isoTimestamp
 * @returns {string}
 */
export function toIsoCompact(isoTimestamp) {
  return isoTimestamp.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * reportId = sweepRunId + "-" + compact(generatedAt), capped at 160 chars per
 * the rubric's reportId length bound.
 *
 * @param {string} sweepRunId
 * @param {string} generatedAtIso
 * @returns {string}
 */
export function buildReportId(sweepRunId, generatedAtIso) {
  const candidate = `${sweepRunId}-${toIsoCompact(generatedAtIso)}`;
  return candidate.length > 160 ? candidate.slice(0, 160) : candidate;
}

/**
 * The deterministic verdict rule: FAIL iff any finding is P0 or P1, else PASS.
 * Mirrors the submit script + server rule so the assembled report is always
 * self-consistent (the submit step rejects a report whose verdict disagrees).
 *
 * @param {ReadonlyArray<{ severity: string }>} findings
 * @returns {'PASS' | 'FAIL'}
 */
export function computeVerdict(findings) {
  for (const finding of findings) {
    if (finding.severity === 'P0' || finding.severity === 'P1') {
      return 'FAIL';
    }
  }
  return 'PASS';
}

/**
 * Validates and normalizes one model-produced finding to the locked
 * InspectionFinding shape, or returns null if it cannot be salvaged. Field order
 * is normalized and an absent cellId defaults to null.
 *
 * @param {unknown} candidate
 * @returns {{ severity: string, route: string, anomalyClass: string, description: string, cellId: string | null } | null}
 */
export function normalizeFinding(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  const severity = candidate.severity;
  const route = candidate.route;
  const anomalyClass = candidate.anomalyClass;
  const description = candidate.description;
  const cellId = candidate.cellId === undefined ? null : candidate.cellId;
  if (VALID_SEVERITIES.has(severity) === false) {
    return null;
  }
  if (VALID_ROUTES.has(route) === false) {
    return null;
  }
  if (typeof anomalyClass !== 'string' || anomalyClass.length === 0) {
    return null;
  }
  if (typeof description !== 'string' || description.length === 0) {
    return null;
  }
  if (cellId !== null && typeof cellId !== 'string') {
    return null;
  }
  return { severity, route, anomalyClass, description, cellId };
}

/**
 * Extracts the validated findings array from the model's response text. Defensive
 * about a stray markdown fence even though structured outputs returns bare JSON —
 * the downstream submit step uses a bare JSON.parse, so this must hand it clean
 * data. Returns the normalized findings, or null if the text is unusable.
 *
 * @param {string} responseText
 * @returns {Array<object> | null}
 */
export function extractFindings(responseText) {
  let cleaned = responseText.trim();
  // why: structured outputs returns bare JSON, but strip a defensive fence in
  // case a model or path wraps it — the envelope this script writes must be
  // parseable by the submit step's bare JSON.parse.
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed.findings) === false) {
    return null;
  }
  const normalizedFindings = [];
  for (const rawFinding of parsed.findings) {
    const normalized = normalizeFinding(rawFinding);
    if (normalized === null) {
      return null;
    }
    normalizedFindings.push(normalized);
  }
  return normalizedFindings;
}

/**
 * Reads and validates the one required env var. Exits 1 on missing/empty.
 *
 * @returns {string}
 */
function readApiKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    process.stderr.write(
      'inspection-triage: ANTHROPIC_API_KEY env var is unset or empty; refusing to triage.\n',
    );
    process.exit(EXIT_MISSING_ENV);
  }
  return apiKey;
}

/**
 * Reads and parses inspection-work/sweep-input.json. Exits 2 if the file is
 * missing, not JSON, or lacks a non-empty string runId.
 *
 * @returns {Promise<{ runId: string }>}
 */
async function readSweepInput() {
  let rawText;
  try {
    rawText = await readFile(SWEEP_INPUT_PATH, 'utf8');
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : String(readError);
    process.stderr.write(
      `inspection-triage: failed to read the sweep input at ${SWEEP_INPUT_PATH} (${message}); run inspection:fetch first.\n`,
    );
    process.exit(EXIT_BAD_INPUT);
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    process.stderr.write(`inspection-triage: ${SWEEP_INPUT_PATH} is not valid JSON (${message}).\n`);
    process.exit(EXIT_BAD_INPUT);
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    typeof parsed.runId !== 'string' ||
    parsed.runId.length === 0
  ) {
    process.stderr.write(
      `inspection-triage: ${SWEEP_INPUT_PATH} is missing a non-empty string runId; cannot attribute the report.\n`,
    );
    process.exit(EXIT_BAD_INPUT);
  }
  return parsed;
}

/**
 * Calls the Messages API with the rubric + sweep run and returns the response
 * text block. Exits 3 on any network error, non-2xx status, refusal, or empty
 * content.
 *
 * @param {string} apiKey
 * @param {string} rubric
 * @param {object} sweepRun
 * @returns {Promise<string>}
 */
async function callInspector(apiKey, rubric, sweepRun) {
  const requestBody = {
    model: TRIAGE_MODEL,
    max_tokens: MAX_TOKENS,
    system: rubric,
    messages: [
      {
        role: 'user',
        content:
          'Triage the following sweep run per the rubric. Return only the findings ' +
          `array described by the response schema.\n\n${JSON.stringify(sweepRun)}`,
      },
    ],
    output_config: { format: { type: 'json_schema', schema: FINDINGS_OUTPUT_SCHEMA } },
  };
  let response;
  try {
    response = await fetch(MESSAGES_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    process.stderr.write(
      `inspection-triage: Messages API request failed at the network layer (${message}).\n`,
    );
    process.exit(EXIT_API_FAILURE);
  }
  if (response.status < 200 || response.status >= 300) {
    let bodyText;
    try {
      bodyText = await response.text();
    } catch (readBodyError) {
      void readBodyError;
      bodyText = '<unreadable>';
    }
    process.stderr.write(
      `inspection-triage: Messages API returned status ${response.status}; body: ${bodyText}.\n`,
    );
    process.exit(EXIT_API_FAILURE);
  }
  let responseBody;
  try {
    responseBody = await response.json();
  } catch (parseError) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    process.stderr.write(`inspection-triage: Messages API returned a non-JSON body (${message}).\n`);
    process.exit(EXIT_API_FAILURE);
  }
  if (responseBody.stop_reason === 'refusal') {
    process.stderr.write('inspection-triage: the model refused the triage request (stop_reason=refusal).\n');
    process.exit(EXIT_API_FAILURE);
  }
  const textBlock = Array.isArray(responseBody.content)
    ? responseBody.content.find((block) => block !== null && typeof block === 'object' && block.type === 'text')
    : undefined;
  if (textBlock === undefined || typeof textBlock.text !== 'string' || textBlock.text.length === 0) {
    process.stderr.write(
      `inspection-triage: Messages API response had no usable text block (stop_reason=${responseBody.stop_reason}).\n`,
    );
    process.exit(EXIT_API_FAILURE);
  }
  return textBlock.text;
}

async function main() {
  const apiKey = readApiKey();
  const sweepRun = await readSweepInput();
  let rubric;
  try {
    rubric = await readFile(RUBRIC_PATH, 'utf8');
  } catch (readError) {
    const message = readError instanceof Error ? readError.message : String(readError);
    process.stderr.write(`inspection-triage: failed to read the rubric at ${RUBRIC_PATH} (${message}).\n`);
    process.exit(EXIT_BAD_INPUT);
  }
  const responseText = await callInspector(apiKey, rubric, sweepRun);
  const findings = extractFindings(responseText);
  if (findings === null) {
    process.stderr.write(
      'inspection-triage: the model response did not yield a valid findings array; aborting (exit 4).\n',
    );
    process.exit(EXIT_BAD_MODEL_OUTPUT);
  }
  // why: a plain CI script (not engine code) may read the wall clock — the
  // determinism rule applies to the game engine, not to tooling. generatedAt
  // anchors reportId + the report timestamp.
  const generatedAt = new Date().toISOString();
  const report = {
    reportId: buildReportId(sweepRun.runId, generatedAt),
    sweepRunId: sweepRun.runId,
    generatedAt,
    verdict: computeVerdict(findings),
    findings,
  };
  await mkdir(INSPECTION_WORK_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `inspection-triage: wrote ${REPORT_PATH} (reportId=${report.reportId}, verdict=${report.verdict}, findings=${findings.length}).\n`,
  );
}

// why: run main() only when this file is the process entry point so a unit test
// can import the pure helpers without triggering a live API call.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const message = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`inspection-triage: unhandled error (${message}).\n`);
    // why: the only throw surfaces left are fetch/IO — map to the API-failure
    // exit; env, input, and model-output paths each exit explicitly above.
    process.exit(EXIT_API_FAILURE);
  });
}
