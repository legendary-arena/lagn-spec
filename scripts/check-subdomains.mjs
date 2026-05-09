/**
 * Legendary Arena — Subdomain Smoke Test
 *
 * Probes every domain listed in docs/ops/domains.json and classifies each
 * result against the entry's declared state (live | planned).
 *
 * Verdicts:
 *   OK      — entry is live and probe matched expected status
 *   PENDING — entry is planned and probe failed with a network error (expected: not yet deployed)
 *   READY   — entry is planned and probe matched expected status (deploy is up; flip state to "live")
 *   FAIL    — entry is live and broken, OR planned and returned an unexpected status (misconfig)
 *
 * Usage:
 *   node scripts/check-subdomains.mjs           — probe all entries (default)
 *   node scripts/check-subdomains.mjs --live-only — probe only live entries (skip planned)
 *   pnpm check:domains
 *
 * Exit codes:
 *   0 — no FAIL verdicts (PENDING and READY do not fail the run)
 *   1 — at least one FAIL verdict
 *   2 — unexpected internal error (manifest unreadable, etc.)
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// why: 10 seconds is generous for a health probe but short enough that a fully
// dead host doesn't stall the whole script. Cloudflare and Render normally
// respond in well under 1s.
const REQUEST_TIMEOUT_MS = 10_000;

const RUNBOOK_RELATIVE_PATH = 'docs/ops/DOMAINS.md';
const MANIFEST_RELATIVE_PATH = 'docs/ops/domains.json';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDirectory, '..');
const manifestAbsolutePath = join(projectRoot, MANIFEST_RELATIVE_PATH);

/**
 * Load and parse the canonical domains manifest.
 *
 * @returns {Promise<{ version: number, updated: string, runbook: string, domains: Array<object> }>}
 */
async function loadDomainsManifest() {
  let fileContents;
  try {
    fileContents = await readFile(manifestAbsolutePath, 'utf8');
  } catch (readError) {
    throw new Error(
      `Failed to read domains manifest at ${manifestAbsolutePath}. Cause: ${readError.message}. Verify the file exists and is readable.`,
    );
  }
  try {
    return JSON.parse(fileContents);
  } catch (parseError) {
    throw new Error(
      `Failed to parse domains manifest at ${manifestAbsolutePath} as JSON. Cause: ${parseError.message}. Check for syntax errors.`,
    );
  }
}

/**
 * Probe a single URL with a manual-redirect GET. Returns the resolved status
 * code, or null if the request errored before producing a response (DNS
 * failure, connection refused, timeout).
 *
 * @param {string} url
 * @returns {Promise<{ status: number | null, errorMessage: string | null }>}
 */
async function probeUrl(url) {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      // why: redirect: 'manual' lets us see the actual 30x response from the
      // origin instead of silently following it. Apex redirects and Cloudflare
      // Access gates both rely on observing the 30x directly.
      redirect: 'manual',
      signal: abortController.signal,
      headers: {
        'user-agent': 'legendary-arena-subdomain-check/1.0',
      },
    });
    return { status: response.status, errorMessage: null };
  } catch (probeError) {
    return { status: null, errorMessage: probeError.message };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Decide whether a probed status counts as healthy for this manifest entry.
 *
 * @param {number | null} actualStatus
 * @param {number | number[]} expectedStatus
 * @returns {boolean}
 */
function isStatusHealthy(actualStatus, expectedStatus) {
  if (actualStatus === null) return false;
  if (Array.isArray(expectedStatus)) {
    return expectedStatus.includes(actualStatus);
  }
  return actualStatus === expectedStatus;
}

/**
 * Classify a probe result against the entry's declared state.
 *
 * @param {object} entry - manifest entry
 * @param {{ status: number | null, errorMessage: string | null }} probeResult
 * @returns {'OK' | 'PENDING' | 'READY' | 'FAIL'}
 */
function classifyVerdict(entry, probeResult) {
  const isNetworkFailure = probeResult.status === null;
  const isStatusMatch = !isNetworkFailure && isStatusHealthy(probeResult.status, entry.expectedStatus);

  if (entry.state === 'live') {
    return isStatusMatch ? 'OK' : 'FAIL';
  }

  // state === 'planned' (or any non-live state — planned is the only one defined today)
  if (isNetworkFailure) return 'PENDING';
  if (isStatusMatch) return 'READY';
  return 'FAIL';
}

/**
 * Format a single probed-row line for human reading.
 *
 * @param {'OK' | 'PENDING' | 'READY' | 'FAIL' | 'SKIP'} verdict
 * @param {object} entry - manifest entry
 * @param {{ status: number | null, errorMessage: string | null }} probeResult
 * @returns {string}
 */
function formatResultLine(verdict, entry, probeResult) {
  const statusText = probeResult.status !== null
    ? `HTTP ${probeResult.status}`
    : `error: ${probeResult.errorMessage ?? 'no response'}`;
  const expectedText = Array.isArray(entry.expectedStatus)
    ? entry.expectedStatus.join('|')
    : String(entry.expectedStatus);
  const verdictTag = verdict.padEnd(7);
  return `[${verdictTag}] ${entry.name.padEnd(40)} ${entry.url.padEnd(55)} ${statusText.padEnd(28)} expected=${expectedText} state=${entry.state}`;
}

/**
 * Iterate the manifest, probe each entry, print results, return a summary.
 *
 * @param {Array<object>} entries
 * @param {boolean} liveOnly - if true, skip entries where state !== 'live'
 * @returns {Promise<{ ok: number, pending: number, ready: number, failed: number, skipped: number }>}
 */
async function probeAllEntries(entries, liveOnly) {
  let okCount = 0;
  let pendingCount = 0;
  let readyCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    if (liveOnly && entry.state !== 'live') {
      console.log(formatResultLine('SKIP', entry, { status: null, errorMessage: '--live-only flag set' }));
      skippedCount += 1;
      continue;
    }

    const probeResult = await probeUrl(entry.url);
    const verdict = classifyVerdict(entry, probeResult);

    console.log(formatResultLine(verdict, entry, probeResult));

    if (verdict === 'OK') {
      okCount += 1;
    } else if (verdict === 'PENDING') {
      pendingCount += 1;
    } else if (verdict === 'READY') {
      readyCount += 1;
      console.log(`        hint:    DNS resolves and probe is healthy. Flip "state" to "live" in ${MANIFEST_RELATIVE_PATH}.`);
    } else if (verdict === 'FAIL') {
      console.log(`        runbook: ${RUNBOOK_RELATIVE_PATH}#${entry.anchor}`);
      if (entry.notes) {
        console.log(`        note:    ${entry.notes}`);
      }
      failedCount += 1;
    }
  }

  return {
    ok: okCount,
    pending: pendingCount,
    ready: readyCount,
    failed: failedCount,
    skipped: skippedCount,
  };
}

/**
 * Main entry point.
 */
async function main() {
  const liveOnly = process.argv.includes('--live-only');
  const manifest = await loadDomainsManifest();

  console.log(`[check-subdomains] manifest: ${MANIFEST_RELATIVE_PATH} (version ${manifest.version}, updated ${manifest.updated})`);
  console.log(`[check-subdomains] runbook:  ${RUNBOOK_RELATIVE_PATH}`);
  console.log(`[check-subdomains] entries:  ${manifest.domains.length}${liveOnly ? ' (probing live only — planned entries skipped)' : ' (probing all)'}`);
  console.log('');

  const summary = await probeAllEntries(manifest.domains, liveOnly);

  console.log('');
  console.log(
    `[check-subdomains] ${summary.ok} ok, `
    + `${summary.pending} pending, `
    + `${summary.ready} ready-to-flip, `
    + `${summary.failed} failed`
    + (summary.skipped > 0 ? `, ${summary.skipped} skipped` : ''),
  );

  if (summary.ready > 0) {
    console.log(`[check-subdomains] ${summary.ready} planned entr${summary.ready === 1 ? 'y is' : 'ies are'} reachable and healthy — flip "state" to "live" in ${MANIFEST_RELATIVE_PATH}.`);
  }

  if (summary.failed > 0) {
    console.log(`[check-subdomains] see ${RUNBOOK_RELATIVE_PATH} for the failure runbook`);
    process.exit(1);
  }
}

main().catch((unexpectedError) => {
  console.error(`[check-subdomains] unexpected error: ${unexpectedError.message}`);
  if (unexpectedError.stack) {
    console.error(unexpectedError.stack);
  }
  process.exit(2);
});
