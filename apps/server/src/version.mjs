/**
 * Build/deploy version info for the /api/version diagnostic endpoint.
 * Values are resolved once at process start and cached for the process
 * lifetime — no per-request recompute.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// why: git may be unavailable in CI shallow clones or ZIP deploys
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  console.warn('[build] Could not resolve git SHA — using "unknown".');
}

// why: server uses boot time, not build time (D-18001)
const buildTimestamp = new Date().toISOString();

const versionInfo = Object.freeze({ version, gitSha, buildTimestamp });

/**
 * Returns the cached version info object.
 * @returns {{ version: string, gitSha: string, buildTimestamp: string }}
 */
export function getVersionInfo() {
  return versionInfo;
}
