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
import dnsPromises from 'node:dns/promises';
import tls from 'node:tls';

// why: 10 seconds is generous for a health probe but short enough that a fully
// dead host doesn't stall the whole script. Cloudflare and Render normally
// respond in well under 1s.
const REQUEST_TIMEOUT_MS = 10_000;

// why: DNS and TLS diagnostics are only run on FAIL or PENDING rows, so a
// shorter timeout is fine — we are already in a slow-path failure branch.
const DIAGNOSTIC_TIMEOUT_MS = 5_000;

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
 * On 30x responses, the Location header is captured so the caller can verify
 * the redirect target (apex canonicalization, scheme upgrade, etc.) instead
 * of trusting status alone.
 *
 * On failures, both the top-level error code and any nested cause code are
 * captured so the caller can distinguish DNS (`ENOTFOUND`), TCP refusal
 * (`ECONNREFUSED`), timeout (`ETIMEDOUT`/`ERR_ABORTED`), and TLS errors
 * (`ERR_TLS_CERT_ALTNAME_INVALID`, etc.).
 *
 * @param {string} url
 * @returns {Promise<{
 *   status: number | null,
 *   errorMessage: string | null,
 *   errorCode: string | null,
 *   location: string | null,
 * }>}
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
    return {
      status: response.status,
      errorMessage: null,
      errorCode: null,
      location: response.headers.get('location'),
    };
  } catch (probeError) {
    // why: undici wraps low-level Node errors as `error.cause`. The top-level
    // `error.code` is often missing on fetch failures while the cause carries
    // `ENOTFOUND` / `ECONNREFUSED` / `ETIMEDOUT`. Prefer the most specific
    // code we can find; fall back to the AbortError shape when the timeout
    // fired (`error.name === 'AbortError'`).
    const causeCode = probeError.cause?.code ?? null;
    const topLevelCode = probeError.code ?? null;
    const inferredCode = probeError.name === 'AbortError' ? 'ETIMEDOUT' : null;
    return {
      status: null,
      errorMessage: probeError.message,
      errorCode: causeCode ?? topLevelCode ?? inferredCode,
      location: null,
    };
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
 * Resolve A and AAAA records for a hostname. Both lookups are independent —
 * AAAA absence is normal (many CF-fronted hostnames are A-only) and not an
 * error on its own. Errors are returned as the record-set value so the
 * caller can render `[ENOTFOUND]` instead of an empty list.
 *
 * @param {string} hostname
 * @returns {Promise<{ ipv4: string[] | string, ipv6: string[] | string }>}
 */
async function resolveDnsRecords(hostname) {
  let ipv4;
  try {
    ipv4 = await dnsPromises.resolve4(hostname);
  } catch (resolveError) {
    ipv4 = `[${resolveError.code ?? 'DNS-ERROR'}]`;
  }
  let ipv6;
  try {
    ipv6 = await dnsPromises.resolve6(hostname);
  } catch (resolveError) {
    ipv6 = `[${resolveError.code ?? 'DNS-ERROR'}]`;
  }
  return { ipv4, ipv6 };
}

/**
 * Perform a TLS handshake against `hostname:443` with SNI set to the
 * hostname, and capture the peer certificate. Returns either a structured
 * cert summary or an error code. Does not validate that the negotiated
 * SAN matches — Node's tls module already verifies this and surfaces a
 * cert-name-mismatch as `ERR_TLS_CERT_ALTNAME_INVALID` before resolving
 * the socket. The `authorized` flag captures whether the chain validated.
 *
 * @param {string} hostname
 * @returns {Promise<{
 *   authorized: boolean,
 *   subject: string | null,
 *   issuer: string | null,
 *   validFrom: string | null,
 *   validTo: string | null,
 *   subjectAltName: string | null,
 * } | { error: string }>}
 */
function resolveTlsCertificate(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      timeout: DIAGNOSTIC_TIMEOUT_MS,
    });

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      if (!certificate || Object.keys(certificate).length === 0) {
        settle({ error: 'NO-PEER-CERT' });
        return;
      }
      settle({
        authorized: socket.authorized,
        subject: certificate.subject?.CN ?? null,
        issuer: certificate.issuer?.O ?? certificate.issuer?.CN ?? null,
        validFrom: certificate.valid_from ?? null,
        validTo: certificate.valid_to ?? null,
        subjectAltName: certificate.subjectaltname ?? null,
      });
    });

    socket.once('error', (tlsError) => {
      settle({ error: tlsError.code ?? tlsError.message ?? 'TLS-ERROR' });
    });

    socket.once('timeout', () => {
      settle({ error: 'TLS-TIMEOUT' });
    });
  });
}

/**
 * For a failed or pending row, run DNS + TLS diagnostics and return them in
 * a shape suitable for printing as indented sub-lines under the row.
 *
 * @param {string} url
 * @returns {Promise<{ dns: { ipv4: any, ipv6: any }, tls: any }>}
 */
async function diagnoseConnectivityFailure(url) {
  const { hostname } = new URL(url);
  const [dnsResult, tlsResult] = await Promise.all([
    resolveDnsRecords(hostname),
    resolveTlsCertificate(hostname),
  ]);
  return { dns: dnsResult, tls: tlsResult };
}

/**
 * Format the diagnosis block produced by `diagnoseConnectivityFailure` as
 * indented sub-lines.
 *
 * @param {{ dns: { ipv4: any, ipv6: any }, tls: any }} diagnosis
 * @returns {string[]}
 */
function formatDiagnosisLines(diagnosis) {
  const ipv4Text = Array.isArray(diagnosis.dns.ipv4)
    ? (diagnosis.dns.ipv4.length > 0 ? diagnosis.dns.ipv4.join(', ') : '[empty]')
    : diagnosis.dns.ipv4;
  const ipv6Text = Array.isArray(diagnosis.dns.ipv6)
    ? (diagnosis.dns.ipv6.length > 0 ? diagnosis.dns.ipv6.join(', ') : '[empty]')
    : diagnosis.dns.ipv6;

  const lines = [`        dns:     A=${ipv4Text}  AAAA=${ipv6Text}`];

  if ('error' in diagnosis.tls) {
    lines.push(`        tls:     ${diagnosis.tls.error}`);
  } else {
    const chainText = diagnosis.tls.authorized ? 'authorized' : 'UNAUTHORIZED';
    lines.push(
      `        tls:     ${chainText}  issuer="${diagnosis.tls.issuer ?? '?'}"  valid_to=${diagnosis.tls.validTo ?? '?'}`,
    );
  }
  return lines;
}

/**
 * Decide whether a 30x response's Location matches the entry's
 * `expectedLocation` prefix. Used to catch apex-canonicalization
 * misroutes (wrong host, wrong scheme, redirect loops).
 *
 * Semantics:
 * - If the entry does not declare `expectedLocation`, the redirect target
 *   is informational only and any Location passes.
 * - If `expectedLocation` is present, the response's `Location` header
 *   must start with that string (prefix match). Prefix instead of exact
 *   lets a 302 to `…/` pass even if the origin returns `…/some-path`,
 *   while still catching wrong host or wrong scheme.
 * - If `expectedLocation` is present but the response has no `Location`,
 *   the redirect-target check fails.
 *
 * @param {object} entry - manifest entry
 * @param {{ status: number | null, location: string | null }} probeResult
 * @returns {boolean} true if there is no declared expectation, OR the
 *   expectation is satisfied.
 */
function isLocationHealthy(entry, probeResult) {
  if (typeof entry.expectedLocation !== 'string') {
    return true;
  }
  if (probeResult.location === null) {
    return false;
  }
  return probeResult.location.startsWith(entry.expectedLocation);
}

/**
 * Classify a probe result against the entry's declared state.
 *
 * @param {object} entry - manifest entry
 * @param {{ status: number | null, errorMessage: string | null, location: string | null }} probeResult
 * @returns {'OK' | 'PENDING' | 'READY' | 'FAIL'}
 */
function classifyVerdict(entry, probeResult) {
  const isNetworkFailure = probeResult.status === null;
  const isStatusMatch = !isNetworkFailure && isStatusHealthy(probeResult.status, entry.expectedStatus);
  const isLocationMatch = isLocationHealthy(entry, probeResult);
  const isHealthy = isStatusMatch && isLocationMatch;

  if (entry.state === 'live') {
    return isHealthy ? 'OK' : 'FAIL';
  }

  // state === 'planned' (or any non-live state — planned is the only one defined today)
  if (isNetworkFailure) return 'PENDING';
  if (isHealthy) return 'READY';
  return 'FAIL';
}

/**
 * Format a single probed-row line for human reading.
 *
 * @param {'OK' | 'PENDING' | 'READY' | 'FAIL' | 'SKIP'} verdict
 * @param {object} entry - manifest entry
 * @param {{ status: number | null, errorMessage: string | null, errorCode: string | null, location: string | null }} probeResult
 * @returns {string}
 */
function formatResultLine(verdict, entry, probeResult) {
  let statusText;
  if (probeResult.status !== null) {
    statusText = `HTTP ${probeResult.status}`;
  } else if (probeResult.errorCode !== null) {
    // why: the structured code (e.g. ENOTFOUND, ECONNREFUSED, ETIMEDOUT,
    // ERR_TLS_CERT_ALTNAME_INVALID) is the actionable signal — much more
    // useful at-a-glance than the wrapped fetch() message. Show the code
    // first; the prose message follows in parens for readability.
    statusText = `error: ${probeResult.errorCode} (${probeResult.errorMessage ?? 'no response'})`;
  } else {
    statusText = `error: ${probeResult.errorMessage ?? 'no response'}`;
  }

  const expectedText = Array.isArray(entry.expectedStatus)
    ? entry.expectedStatus.join('|')
    : String(entry.expectedStatus);
  const verdictTag = verdict.padEnd(7);
  return `[${verdictTag}] ${entry.name.padEnd(40)} ${entry.url.padEnd(55)} ${statusText.padEnd(40)} expected=${expectedText} state=${entry.state}`;
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
      console.log(formatResultLine('SKIP', entry, {
        status: null,
        errorMessage: '--live-only flag set',
        errorCode: null,
        location: null,
      }));
      skippedCount += 1;
      continue;
    }

    const probeResult = await probeUrl(entry.url);
    const verdict = classifyVerdict(entry, probeResult);

    console.log(formatResultLine(verdict, entry, probeResult));

    // why: any 30x response carries a Location header pointing at the
    // canonical target. Surface it on every row (not just failures) so a
    // misroute — apex → wrong host, http instead of https, redirect loop
    // — is obvious without re-running curl by hand. Quiet (no print) when
    // there is no Location.
    if (probeResult.location !== null) {
      console.log(`        location: ${probeResult.location}`);
    }

    if (verdict === 'OK') {
      okCount += 1;
    } else if (verdict === 'PENDING') {
      pendingCount += 1;
      // why: PENDING means the planned entry failed to connect. The DNS +
      // TLS diagnosis disambiguates "not yet deployed" (NXDOMAIN) from
      // "DNS is up but TLS isn't" (cert misconfig on a half-provisioned
      // domain). Printing the diagnosis here is informational, not a
      // failure trigger.
      const diagnosis = await diagnoseConnectivityFailure(entry.url);
      for (const diagnosticLine of formatDiagnosisLines(diagnosis)) {
        console.log(diagnosticLine);
      }
    } else if (verdict === 'READY') {
      readyCount += 1;
      console.log(`        hint:    DNS resolves and probe is healthy. Flip "state" to "live" in ${MANIFEST_RELATIVE_PATH}.`);
    } else if (verdict === 'FAIL') {
      // why: redirect-target mismatch is the cheapest failure to diagnose
      // — print the expected vs actual prefix before the runbook anchor so
      // the operator does not have to chase a misroute through DOMAINS.md.
      if (
        typeof entry.expectedLocation === 'string'
        && probeResult.status !== null
        && !isLocationHealthy(entry, probeResult)
      ) {
        const actualText = probeResult.location === null
          ? '[no Location header]'
          : probeResult.location;
        console.log(`        redirect mismatch: expected prefix "${entry.expectedLocation}", got "${actualText}"`);
      }
      console.log(`        runbook: ${RUNBOOK_RELATIVE_PATH}#${entry.anchor}`);
      if (entry.notes) {
        console.log(`        note:    ${entry.notes}`);
      }
      // why: failure on a live entry deserves the full DNS + TLS diagnosis
      // inline so the operator can immediately see whether the issue is
      // DNS (ENOTFOUND), connectivity (ECONNREFUSED / ETIMEDOUT), cert
      // (ERR_TLS_CERT_ALTNAME_INVALID), or backend (4xx / 5xx).
      const diagnosis = await diagnoseConnectivityFailure(entry.url);
      for (const diagnosticLine of formatDiagnosisLines(diagnosis)) {
        console.log(diagnosticLine);
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
