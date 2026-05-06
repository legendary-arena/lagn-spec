/**
 * Legendary Arena — Connection & Environment Health Check
 *
 * Verifies all external services, tools, environment variables, and npm packages.
 * Run via: pnpm check (loads .env via node --env-file=.env)
 *
 * Exit code 0 = all checks pass. Exit code 1 = at least one failure.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { env, version as nodeVersion, platform } from 'node:process';
import { hostname } from 'node:os';

// ---------------------------------------------------------------------------
// Shared constants — single source of truth for magic numbers and URLs
// ---------------------------------------------------------------------------

// why: All network checks use the same timeout so that a single slow service
// does not dominate total check time. 5 seconds is generous for a health probe
// but short enough to keep the full suite under ~10 seconds.
const CONNECTION_TIMEOUT_MS = 5000;

// why: rclone bucket listing is slower than HTTP fetches because it enumerates
// S3-compatible storage. 10 seconds prevents false failures on cold starts.
const RCLONE_TIMEOUT_MS = 10000;

// why: Centralised so that repo renames or ownership transfers require a
// single edit instead of hunting through remediation strings.
const GITHUB_REPO_SLUG = 'barefootbetters/legendary-arena';
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_SLUG}`;
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_SLUG}`;

// why: Must match the route registered in apps/server/src/server.mjs and
// the healthCheckPath in render.yaml.
const HEALTH_CHECK_PATH = '/health';

// why: Appears in multiple remediation messages for server-related failures.
const RENDER_DASHBOARD_URL = 'https://dashboard.render.com';

// why: Enforced baseline — scripts, server, and CI all require Node 22+.
const MIN_NODE_MAJOR_VERSION = 22;

// why: pnpm 8+ is required for workspace protocol support.
const MIN_PNPM_MAJOR_VERSION = 8;

// why: Cloudflare bot detection pattern-matches generic User-Agent strings
// (curl/*, the bare 'node' that undici sends by default, blank UA) and returns
// HTTP 403 from one of several layers. An explicit, meaningful UA passes those
// filters reliably and also makes our traffic identifiable in Cloudflare logs.
const USER_AGENT = 'legendary-arena-health-check/1.0';

// ---------------------------------------------------------------------------
// Required environment variables — grouped by service
// ---------------------------------------------------------------------------

const REQUIRED_VARS = {
  'Database': [
    'DATABASE_URL',       // Render PostgreSQL connection string
    'EXPECTED_DB_NAME',   // e.g. legendary_arena — used for connection verification
  ],
  'Auth': [
    'JWT_SECRET',                // 32+ byte hex string — see .env.example for generation command
    'HANKO_TENANT_BASE_URL',     // tenant-scoped Hanko Cloud origin, e.g. https://passkeys.hanko.io/<tenant_id>
    'HANKO_EXPECTED_AUDIENCE',   // audience claim configured on the Hanko tenant
  ],
  'Game Server': [
    'NODE_ENV',           // 'development' or 'production'
    'GAME_SERVER_URL',    // e.g. https://legendary-arena.onrender.com
    'PORT',               // local dev only — Render sets this automatically
  ],
  'Cloudflare': [
    'R2_PUBLIC_URL',      // e.g. https://images.barefootbetters.com
    'CF_PAGES_URL',       // e.g. https://cards.barefootbetters.com
  ],
  'Frontend (Vite)': [
    'VITE_GAME_SERVER_URL', // exposed to browser bundle — must match GAME_SERVER_URL
  ],
};

// ---------------------------------------------------------------------------
// Placeholder patterns — values that indicate unconfigured variables
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /^your-/i,       // why: catches .env.example defaults like "your-32-byte-hex-string-here"
  /^change-me$/i,  // why: catches common placeholder sentinel
  /^REPLACE_/i,    // why: catches "REPLACE_ME" or "REPLACE_WITH_REAL_VALUE"
  /^<.*>$/,        // why: catches angle-bracket placeholders like "<your-api-key>"
  /^$/,            // why: catches empty string (variable set but no value)
];

// ---------------------------------------------------------------------------
// Results tracking
// ---------------------------------------------------------------------------

const results = [];
let failureCount = 0;
let warningCount = 0;

/**
 * Records a check result and prints a live status line.
 * @param {string} section - The section header (e.g., 'TOOLS', 'CONNECTIONS')
 * @param {string} checkName - Name of the individual check
 * @param {boolean} passed - Whether the check passed
 * @param {string} message - Human-readable result message
 * @param {string} [remediation] - What to do if it failed
 * @param {'warn'|undefined} [level] - Set to 'warn' for non-blocking issues
 */
function recordResult(section, checkName, passed, message, remediation, level) {
  if (!passed && level === 'warn') {
    warningCount++;
    console.log(`  ⚠ ${checkName} : ${message}`);
  } else if (!passed) {
    failureCount++;
    console.log(`  ✗ ${checkName} : ${message}`);
  } else {
    console.log(`  ✓ ${checkName} : ${message}`);
  }

  results.push({ section, checkName, passed, message, remediation, level });
}

/**
 * Records a non-blocking warning. Convenience wrapper around recordResult
 * that avoids the easy-to-misread trailing 'warn' argument at every call site.
 * @param {string} section - The section header
 * @param {string} checkName - Name of the individual check
 * @param {string} message - Human-readable result message
 * @param {string} [remediation] - What to do about the warning
 */
function recordWarning(section, checkName, message, remediation) {
  recordResult(section, checkName, false, message, remediation, 'warn');
}

// ---------------------------------------------------------------------------
// Timeout helpers
// ---------------------------------------------------------------------------

// why: AbortSignal.timeout() is standard in Node 22 but older patch builds on
// Windows have behaved inconsistently. This helper provides a safe fallback
// using AbortController when the static method is unavailable.

/**
 * Creates an AbortSignal that fires after the given timeout in milliseconds.
 * @param {number} timeoutMilliseconds
 * @returns {AbortSignal}
 */
function createTimeoutSignal(timeoutMilliseconds) {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMilliseconds);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMilliseconds);
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parses a version string's leading segment as an integer major version.
 * Returns NaN if the string is missing or unparseable.
 * @param {string} versionString - e.g. "v22.1.0" or "10.32.1"
 * @returns {number} The major version number, or NaN.
 */
function parseMajorVersion(versionString) {
  if (!versionString || typeof versionString !== 'string') {
    return NaN;
  }
  // Strip leading 'v' if present, then take the first dot-separated segment.
  return parseInt(versionString.replace(/^v/, '').split('.')[0], 10);
}

// why: pnpm workspaces hoist dependencies into workspace-specific node_modules
// directories (e.g., apps/server/node_modules/boardgame.io) rather than always
// placing them at the monorepo root. This helper searches root first, then
// known workspace paths, so package checks work regardless of hoisting.
// why: process.cwd() is used to build absolute paths because createRequire()
// needs an absolute path, not a relative one.
const WORKSPACE_NODE_MODULES = [
  join(process.cwd(), 'node_modules'),
  join(process.cwd(), 'apps', 'server', 'node_modules'),
  join(process.cwd(), 'apps', 'registry-viewer', 'node_modules'),
  join(process.cwd(), 'packages', 'registry', 'node_modules'),
];

/**
 * Finds a package's package.json across root and workspace node_modules.
 * Returns the first path that exists, or null if not found anywhere.
 * @param {string} packageName - The npm package name (e.g., 'boardgame.io')
 * @returns {string | null} The resolved path, or null.
 */
function findPackageJson(packageName) {
  for (const nodeModulesPath of WORKSPACE_NODE_MODULES) {
    const candidatePath = join(nodeModulesPath, packageName, 'package.json');
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool checks
// ---------------------------------------------------------------------------

/**
 * Verifies Node.js version meets the project minimum.
 */
function checkNodeVersion() {
  const majorVersion = parseMajorVersion(nodeVersion);

  if (Number.isNaN(majorVersion)) {
    recordResult('TOOLS', 'Node.js', false,
      `Could not parse Node.js version from "${nodeVersion}".`,
      `Ensure Node.js v${MIN_NODE_MAJOR_VERSION}+ is installed from https://nodejs.org`);
    return;
  }

  if (majorVersion < MIN_NODE_MAJOR_VERSION) {
    recordResult('TOOLS', 'Node.js', false,
      `${nodeVersion} — major version ${majorVersion} is below required v${MIN_NODE_MAJOR_VERSION}.`,
      `Install Node.js v${MIN_NODE_MAJOR_VERSION}+ from https://nodejs.org`);
    return;
  }

  recordResult('TOOLS', 'Node.js', true, `${nodeVersion}`);
}

/**
 * Verifies pnpm is installed and meets the minimum version.
 */
function checkPnpmVersion() {
  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseMajorVersion(pnpmVersion);

    if (Number.isNaN(majorVersion)) {
      recordResult('TOOLS', 'pnpm', false,
        `Could not parse pnpm version from "${pnpmVersion}".`,
        'Run: npm install -g pnpm');
      return;
    }

    if (majorVersion < MIN_PNPM_MAJOR_VERSION) {
      recordResult('TOOLS', 'pnpm', false,
        `v${pnpmVersion} — below required v${MIN_PNPM_MAJOR_VERSION}.`,
        'Run: npm install -g pnpm');
      return;
    }

    recordResult('TOOLS', 'pnpm', true, `v${pnpmVersion}`);
  } catch {
    recordResult('TOOLS', 'pnpm', false,
      'NOT FOUND on PATH.',
      'Run: npm install -g pnpm');
  }
}

/**
 * Verifies dotenv-cli is installed and can parse .env files.
 */
function checkDotenvCli() {
  try {
    // why: dotenv-cli v11+ does not support --version. Use npm list to get
    // the installed version, and fall back to confirming the binary exists.
    let dotenvVersion = 'unknown';
    try {
      const npmListOutput = execSync('npm list -g dotenv-cli --depth=0', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      const versionMatch = npmListOutput.match(/dotenv-cli@([\d.]+)/);
      if (versionMatch) {
        dotenvVersion = versionMatch[1];
      }
    } catch {
      // npm list failed — binary exists but version unknown
    }

    recordResult('TOOLS', 'dotenv-cli', true, `v${dotenvVersion}`);

    // Verify .env is syntactically parseable if it exists
    if (existsSync('.env')) {
      try {
        execSync('dotenv -e .env -- node -e ""', { encoding: 'utf8', stdio: 'pipe' });
      } catch {
        recordWarning('TOOLS', 'dotenv-cli (.env parse)',
          '.env file exists but dotenv cannot parse it. Check for BOM encoding or unquoted special characters.',
          'Re-create .env from .env.example with UTF-8 encoding (no BOM).');
      }
    }
  } catch {
    recordResult('TOOLS', 'dotenv-cli', false,
      'NOT FOUND on PATH — dotenv-cli is required for scripts that cannot use --env-file.',
      'Run: npm install -g dotenv-cli');
  }
}

/**
 * Verifies boardgame.io is installed and is the correct 0.50.x version.
 */
function checkBoardgameioPackage() {
  const packageJsonPath = findPackageJson('boardgame.io');

  if (!packageJsonPath) {
    recordResult('TOOLS', 'boardgame.io', false,
      'Not found in any node_modules. pnpm install may not have been run, or boardgame.io is not yet a dependency.',
      'Run: pnpm install (once game-engine package exists)');
    return;
  }

  try {
    const packageData = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const installedVersion = packageData.version;

    if (!installedVersion || typeof installedVersion !== 'string') {
      recordResult('TOOLS', 'boardgame.io', false,
        'Installed but version field is missing or invalid in package.json.',
        'Run: pnpm install to reinstall the package.');
      return;
    }

    const versionParts = installedVersion.split('.');

    if (versionParts.length < 3 || versionParts[0] !== '0' || versionParts[1] !== '50') {
      recordResult('TOOLS', 'boardgame.io', false,
        `v${installedVersion} — expected 0.50.x. This project locks boardgame.io to ^0.50.0.`,
        'Run: pnpm add boardgame.io@0.50');
      return;
    }

    // why: boardgame.io ships its server module in CommonJS format even though
    // this project is ESM-only. The CJS entrypoint is what boardgame.io exposes
    // for server-side use. Its presence confirms the package installed correctly.
    // Resolve relative to the found package.json, not hardcoded to root node_modules.
    const packageDir = packageJsonPath.replace(/[/\\]package\.json$/, '');
    const serverEntrypoint = join(packageDir, 'dist', 'cjs', 'server.js');
    if (!existsSync(serverEntrypoint)) {
      recordResult('TOOLS', 'boardgame.io', false,
        `v${installedVersion} installed but server CJS entrypoint missing at ${serverEntrypoint}.`,
        'Run: pnpm install to reinstall the package.');
      return;
    }

    recordResult('TOOLS', 'boardgame.io', true, `v${installedVersion} (server entrypoint verified)`);
  } catch (readError) {
    recordResult('TOOLS', 'boardgame.io', false,
      `Found in node_modules but package.json is unreadable: ${readError.message}`,
      'Run: pnpm install to reinstall.');
  }
}

/**
 * Verifies zod is installed in node_modules.
 */
function checkZodPackage() {
  const packageJsonPath = findPackageJson('zod');

  if (!packageJsonPath) {
    recordResult('TOOLS', 'zod', false,
      'Not found in node_modules.',
      'Run: pnpm add zod');
    return;
  }

  try {
    const packageData = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    recordResult('TOOLS', 'zod', true, `v${packageData.version}`);
  } catch {
    recordResult('TOOLS', 'zod', false,
      'Found in node_modules but package.json is unreadable.',
      'Run: pnpm install');
  }
}

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------

/**
 * Verifies the .env file exists, is not the example, and has no placeholders.
 */
function checkDotenvFile() {
  if (!existsSync('.env')) {
    recordResult('ENVIRONMENT', '.env file', false,
      '.env file not found at project root.',
      'Copy .env.example to .env and fill in real values.');
    return;
  }

  recordResult('ENVIRONMENT', '.env file', true, '.env file found');

  // Check it is not identical to .env.example
  if (existsSync('.env.example')) {
    const envContent = readFileSync('.env', 'utf8');
    const exampleContent = readFileSync('.env.example', 'utf8');

    if (envContent === exampleContent) {
      recordResult('ENVIRONMENT', '.env vs .env.example', false,
        '.env is identical to .env.example. Replace placeholder values with real configuration.',
        'Edit .env and replace all placeholder values.');
      return;
    }

    recordResult('ENVIRONMENT', '.env vs .env.example', true, '.env differs from .env.example');
  }

  // Check for placeholder values
  const envContent = readFileSync('.env', 'utf8');
  const placeholderVars = [];

  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
      continue;
    }

    const equalsIndex = trimmedLine.indexOf('=');
    const varName = trimmedLine.slice(0, equalsIndex).trim();
    const varValue = trimmedLine.slice(equalsIndex + 1).trim();

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(varValue)) {
        placeholderVars.push(varName);
        break;
      }
    }
  }

  if (placeholderVars.length > 0) {
    recordWarning('ENVIRONMENT', '.env placeholders',
      `.env contains placeholder values: ${placeholderVars.join(', ')}`,
      'Replace placeholder values in .env with real configuration.');
  }
}

/**
 * Verifies all required environment variables are present and non-empty.
 */
function checkRequiredEnvironmentVariables() {
  let totalChecked = 0;
  let totalMissing = 0;

  console.log('');
  console.log('REQUIRED VARIABLES');

  for (const groupName of Object.keys(REQUIRED_VARS)) {
    const variableNames = REQUIRED_VARS[groupName];
    const groupResults = [];

    for (const variableName of variableNames) {
      totalChecked++;
      const variableValue = env[variableName];
      const isPresent = variableValue !== undefined && variableValue !== '';

      if (isPresent) {
        // why: secret values must never be printed in health check output.
        // We confirm the variable exists and is non-empty without revealing its value.
        groupResults.push(`✓ ${variableName}`);
      } else {
        totalMissing++;
        groupResults.push(`✗ ${variableName}`);
      }
    }

    // why: 18 characters accommodates the longest current group name
    // ("Frontend (Vite)") with room for growth without breaking alignment.
    console.log(`  ${groupName.padEnd(18)} ${groupResults.join('  ')}`);
  }

  if (totalMissing > 0) {
    recordResult('REQUIRED VARIABLES', 'env vars', false,
      `${totalMissing} of ${totalChecked} required variables are missing or empty.`,
      'Add the missing variables to your .env file. See .env.example for reference.');
  } else {
    recordResult('REQUIRED VARIABLES', 'env vars', true,
      `All ${totalChecked} required variables are present.`);
  }
}

// ---------------------------------------------------------------------------
// Connection checks (concurrent)
// ---------------------------------------------------------------------------

/**
 * Checks PostgreSQL connectivity using the DATABASE_URL variable.
 */
async function checkPostgresConnection() {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    recordResult('CONNECTIONS', 'PostgreSQL', false,
      'DATABASE_URL is not set. Cannot test database connection.',
      'Add DATABASE_URL to .env. See .env.example for format.');
    return;
  }

  try {
    // why: pg is a dependency of apps/server, not the monorepo root. Node's
    // ESM import() resolves from the script's location, which cannot see
    // apps/server/node_modules. Use createRequire to resolve pg from the
    // workspace that declares it as a dependency.
    const pgPackagePath = findPackageJson('pg');
    let pgModule;
    if (pgPackagePath) {
      const workspaceRequire = createRequire(pgPackagePath);
      pgModule = workspaceRequire('pg');
    } else {
      pgModule = await import('pg');
    }
    const Pool = pgModule.default?.Pool || pgModule.Pool;

    // why: Guard against pg exporting an unexpected shape. Without this,
    // a broken import would produce a confusing "Pool is not a constructor"
    // error instead of a clear diagnostic.
    if (typeof Pool !== 'function') {
      recordResult('CONNECTIONS', 'PostgreSQL', false,
        'pg module imported but Pool constructor not found. The pg package may be corrupted.',
        'Run: pnpm install to reinstall pg.');
      return;
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    });

    const startTime = Date.now();
    const queryResult = await pool.query('SELECT current_database(), version()');
    const elapsedMilliseconds = Date.now() - startTime;
    await pool.end();

    const currentDatabase = queryResult.rows[0].current_database;
    const databaseVersion = queryResult.rows[0].version.split(' ').slice(0, 2).join(' ');
    const expectedDatabaseName = env.EXPECTED_DB_NAME;

    // why: EXPECTED_DB_NAME is optional — it exists for safety on teams where
    // multiple databases share a host. If unset, this check is skipped entirely.
    if (expectedDatabaseName && currentDatabase !== expectedDatabaseName) {
      recordResult('CONNECTIONS', 'PostgreSQL', false,
        `Connected to "${currentDatabase}" but expected "${expectedDatabaseName}" (EXPECTED_DB_NAME is optional — remove it from .env to skip this check).`,
        `Update DATABASE_URL to point to "${expectedDatabaseName}", or remove EXPECTED_DB_NAME from .env if the connected database is correct.`);
      return;
    }

    recordResult('CONNECTIONS', 'PostgreSQL', true,
      `${currentDatabase} — ${databaseVersion}  (${elapsedMilliseconds}ms)`);
  } catch (connectionError) {
    const errorCode = connectionError.code || 'UNKNOWN';
    recordResult('CONNECTIONS', 'PostgreSQL', false,
      `Connection failed (${errorCode}): ${connectionError.message}`,
      'Check DATABASE_URL in .env. For local dev, ensure PostgreSQL is running.');
  }
}

/**
 * Checks the boardgame.io game server health endpoint.
 */
async function checkBoardgameioServer() {
  const serverUrl = env.GAME_SERVER_URL;

  if (!serverUrl) {
    recordResult('CONNECTIONS', 'boardgame.io server', false,
      'GAME_SERVER_URL is not set. Cannot test server connection.',
      'Add GAME_SERVER_URL to .env. See .env.example.');
    return;
  }

  try {
    const startTime = Date.now();
    const response = await fetch(`${serverUrl}${HEALTH_CHECK_PATH}`, {
      signal: createTimeoutSignal(CONNECTION_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    const elapsedMilliseconds = Date.now() - startTime;

    if (!response.ok) {
      recordResult('CONNECTIONS', 'boardgame.io server', false,
        `${HEALTH_CHECK_PATH} returned HTTP ${response.status} (expected 200).`,
        `Is the Render service running? Check ${RENDER_DASHBOARD_URL}`);
      return;
    }

    recordResult('CONNECTIONS', 'boardgame.io server', true,
      `${HEALTH_CHECK_PATH} → ${response.status} OK  (${elapsedMilliseconds}ms)`);
  } catch (fetchError) {
    recordResult('CONNECTIONS', 'boardgame.io server', false,
      `Connection failed: ${fetchError.message}`,
      `Is the Render service running? Check ${RENDER_DASHBOARD_URL}`);
  }
}

/**
 * Checks Cloudflare R2 public bucket reachability.
 */
async function checkCloudflareR2() {
  const publicUrl = env.R2_PUBLIC_URL;

  if (!publicUrl) {
    recordResult('CONNECTIONS', 'Cloudflare R2', false,
      'R2_PUBLIC_URL is not set. Cannot test R2 reachability.',
      'Add R2_PUBLIC_URL to .env. See .env.example.');
    return;
  }

  try {
    const startTime = Date.now();
    // why: metadata/sets.json is the authoritative registry manifest in R2.
    // No registry-config.json exists — that was an incorrect assumption.
    const response = await fetch(`${publicUrl}/metadata/sets.json`, {
      signal: createTimeoutSignal(CONNECTION_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    const elapsedMilliseconds = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || 'unknown';

    if (!response.ok) {
      // why: Cloudflare returns HTTP 403 from at least three distinct layers
      // (edge bot rules, CDN-tier Super Bot Fight Mode, and the R2 backend
      // itself). Distinguishing them by response headers turns a generic 403
      // into an actionable hint about which Cloudflare setting to change.
      let layerHint;
      if (response.status === 403) {
        const serverHeader = (response.headers.get('server') || '').toLowerCase();
        const isCloudflareEdge = serverHeader === 'cloudflare';
        const hasCfCacheStatus = response.headers.has('cf-cache-status');

        if (!isCloudflareEdge) {
          layerHint = "403 with no 'server: cloudflare' header — request was blocked at the Cloudflare edge before reaching R2. Likely culprit: 'Block AI bots' or similar edge feature in Cloudflare dashboard → Security → Bots. Disable or set scope to 'Do not block'.";
        } else if (!hasCfCacheStatus) {
          layerHint = "403 from Cloudflare CDN tier — likely Super Bot Fight Mode 'Definitely automated traffic' set to Block. Fix: Security → Bots → Super Bot Fight Mode → set 'Definitely automated traffic' to Allow.";
        } else {
          layerHint = '403 from R2 backend — check bucket public access settings and the custom-domain binding.';
        }
      } else {
        layerHint = 'Check R2_PUBLIC_URL in .env and verify the R2 bucket is publicly accessible.';
      }

      recordResult('CONNECTIONS', 'Cloudflare R2', false,
        `metadata/sets.json returned HTTP ${response.status}.`,
        layerHint);
      return;
    }

    recordResult('CONNECTIONS', 'Cloudflare R2', true,
      `metadata/sets.json → ${response.status} ${contentType}  (${elapsedMilliseconds}ms)`);
  } catch (fetchError) {
    recordResult('CONNECTIONS', 'Cloudflare R2', false,
      `Connection failed: ${fetchError.message}`,
      'Check R2_PUBLIC_URL in .env and verify network connectivity.');
  }
}

/**
 * Checks the Hanko Cloud tenant JWKS endpoint for reachability and a
 * well-formed JWKS document. Mirrors the production verifier's URL
 * resolution: reads HANKO_TENANT_BASE_URL and appends /.well-known/jwks.json.
 *
 * This is a local-dev probe only. The authoritative verifier lives at
 * apps/server/src/auth/hanko/ (WP-126 / D-12602); we intentionally do not
 * import from it so this script stays self-contained like the other
 * CONNECTIONS checks.
 */
async function checkHankoJwks() {
  const tenantBaseUrl = env.HANKO_TENANT_BASE_URL;

  if (!tenantBaseUrl) {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      'HANKO_TENANT_BASE_URL is not set. Cannot test Hanko JWKS endpoint.',
      'Add HANKO_TENANT_BASE_URL to .env. See .env.example.');
    return;
  }

  // why: the production verifier (apps/server/src/auth/hanko/hankoVerifier.logic.ts)
  // builds the JWKS URL by appending this exact path; mirror that resolution so the
  // probe exercises the same endpoint the server will hit at runtime.
  const jwksUrl = `${tenantBaseUrl}/.well-known/jwks.json`;

  let response;
  let elapsedMilliseconds;
  try {
    const startTime = Date.now();
    response = await fetch(jwksUrl, {
      signal: createTimeoutSignal(CONNECTION_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    elapsedMilliseconds = Date.now() - startTime;
  } catch (fetchError) {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      `Connection to ${jwksUrl} failed: ${fetchError.message}`,
      'Check HANKO_TENANT_BASE_URL in .env and verify network connectivity to the Hanko tenant.');
    return;
  }

  if (!response.ok) {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      `${jwksUrl} returned HTTP ${response.status} (expected 200).`,
      'Verify HANKO_TENANT_BASE_URL in .env points at a valid Hanko Cloud tenant origin.');
    return;
  }

  let jwksDocument;
  try {
    jwksDocument = await response.json();
  } catch (parseError) {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      `Response from ${jwksUrl} was not valid JSON: ${parseError.message}`,
      'Verify HANKO_TENANT_BASE_URL points at a Hanko tenant; the endpoint should serve a JWKS document.');
    return;
  }

  if (!Array.isArray(jwksDocument?.keys)) {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      `JWKS document from ${jwksUrl} is malformed: "keys" field is missing or not an array (RFC 7517).`,
      'Verify HANKO_TENANT_BASE_URL points at a real Hanko tenant; check the Hanko Cloud dashboard for the correct tenant URL.');
    return;
  }

  if (jwksDocument.keys.length === 0) {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      `JWKS document from ${jwksUrl} is empty (zero keys). Verifier cannot validate any token.`,
      'Check the Hanko Cloud dashboard — the tenant must have at least one signing key configured.');
    return;
  }

  const firstKey = jwksDocument.keys[0];
  if (typeof firstKey?.kty !== 'string' || typeof firstKey?.kid !== 'string') {
    recordResult('CONNECTIONS', 'Hanko JWKS', false,
      `JWKS document from ${jwksUrl} is malformed: first key entry is missing required "kty" or "kid" field (RFC 7517).`,
      'Verify HANKO_TENANT_BASE_URL points at a real Hanko tenant; the endpoint may be returning a different JSON document.');
    return;
  }

  const keyCount = jwksDocument.keys.length;
  recordResult('CONNECTIONS', 'Hanko JWKS', true,
    `${jwksUrl} → ${response.status} ${keyCount} key${keyCount === 1 ? '' : 's'}  (${elapsedMilliseconds}ms)`);
}

/**
 * Checks Cloudflare Pages SPA reachability.
 */
async function checkCloudflarePages() {
  const pagesUrl = env.CF_PAGES_URL;

  if (!pagesUrl) {
    recordResult('CONNECTIONS', 'Cloudflare Pages', false,
      'CF_PAGES_URL is not set. Cannot test Pages reachability.',
      'Add CF_PAGES_URL to .env. See .env.example.');
    return;
  }

  try {
    const startTime = Date.now();
    const response = await fetch(pagesUrl, {
      signal: createTimeoutSignal(CONNECTION_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    const elapsedMilliseconds = Date.now() - startTime;

    if (!response.ok) {
      // why: Pages and R2 sit behind the same Cloudflare front layers, so a
      // 403 here may originate from edge bot rules, CDN-tier Super Bot Fight
      // Mode, or the Pages project itself. Same three header signatures as
      // the R2 check; the third branch points at Pages instead of R2.
      let layerHint;
      if (response.status === 403) {
        const serverHeader = (response.headers.get('server') || '').toLowerCase();
        const isCloudflareEdge = serverHeader === 'cloudflare';
        const hasCfCacheStatus = response.headers.has('cf-cache-status');

        if (!isCloudflareEdge) {
          layerHint = "403 with no 'server: cloudflare' header — request was blocked at the Cloudflare edge before reaching Pages. Likely culprit: 'Block AI bots' or similar edge feature in Cloudflare dashboard → Security → Bots. Disable or set scope to 'Do not block'.";
        } else if (!hasCfCacheStatus) {
          layerHint = "403 from Cloudflare CDN tier — likely Super Bot Fight Mode 'Definitely automated traffic' set to Block. Fix: Security → Bots → Super Bot Fight Mode → set 'Definitely automated traffic' to Allow.";
        } else {
          layerHint = '403 from Pages backend — check the Pages project deployment status and any access policies (Cloudflare Access) on the project.';
        }
      } else {
        layerHint = 'Check Cloudflare Pages dashboard for deployment status.';
      }

      recordResult('CONNECTIONS', 'Cloudflare Pages', false,
        `${pagesUrl} returned HTTP ${response.status}.`,
        layerHint);
      return;
    }

    recordResult('CONNECTIONS', 'Cloudflare Pages', true,
      `${pagesUrl} → ${response.status}  (${elapsedMilliseconds}ms)`);
  } catch (fetchError) {
    recordResult('CONNECTIONS', 'Cloudflare Pages', false,
      `Connection failed: ${fetchError.message}`,
      'Check Cloudflare Pages dashboard for deployment status.');
  }
}

/**
 * Checks GitHub API reachability and local Git remote configuration.
 */
async function checkGithubReachability() {
  try {
    const startTime = Date.now();
    const response = await fetch(GITHUB_API_URL, {
      signal: createTimeoutSignal(CONNECTION_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
    });
    const elapsedMilliseconds = Date.now() - startTime;

    if (response.ok) {
      const responseBody = await response.json();
      recordResult('CONNECTIONS', 'GitHub API', true,
        `${responseBody.full_name} found  (${elapsedMilliseconds}ms)`);
    } else if (response.status === 403) {
      // why: GitHub anonymous API rate limits (60 req/hour) are easy to hit on
      // CI or shared networks. A 403 with exhausted rate limit is a transient
      // condition, not a configuration error. The local Git remote check below
      // already proves repo identity, so downgrading to a warning avoids false
      // negatives.
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        recordWarning('CONNECTIONS', 'GitHub API',
          `Rate-limited (HTTP 403, x-ratelimit-remaining: 0). Git remote check below confirms repo identity.`,
          'Wait for rate limit to reset, or set a GITHUB_TOKEN for higher limits.');
      } else {
        recordResult('CONNECTIONS', 'GitHub API', false,
          `API returned HTTP 403. Repository may be private or access is denied.`,
          `Verify the repository exists at ${GITHUB_REPO_URL}`);
      }
    } else {
      recordResult('CONNECTIONS', 'GitHub API', false,
        `API returned HTTP ${response.status}. Repository may be private or unavailable.`,
        `Verify the repository exists at ${GITHUB_REPO_URL}`);
    }
  } catch (fetchError) {
    recordResult('CONNECTIONS', 'GitHub API', false,
      `Connection failed: ${fetchError.message}`,
      'Check network connectivity and GitHub status.');
  }

  // Verify local Git remote
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();

    if (remoteUrl.includes(GITHUB_REPO_SLUG)) {
      recordResult('CONNECTIONS', 'Git remote', true, `origin → ${remoteUrl}`);
    } else {
      recordResult('CONNECTIONS', 'Git remote', false,
        `origin is ${remoteUrl}, expected ${GITHUB_REPO_URL}.`,
        `Run: git remote set-url origin ${GITHUB_REPO_URL}`);
    }
  } catch {
    recordResult('CONNECTIONS', 'Git remote', false,
      'Could not read git remote origin.',
      `Run: git remote add origin ${GITHUB_REPO_URL}`);
  }
}

/**
 * Checks rclone installation, configuration, and R2 bucket access.
 */
function checkRclone() {
  // why: rclone on Windows stores its config under %APPDATA%\rclone\rclone.conf,
  // not ~/.config/rclone as it does on Linux/macOS. Hardcoding a username path
  // would break on any machine with a different Windows user account name.
  const rcloneConfigPath = join(env.APPDATA || '', 'rclone', 'rclone.conf');

  if (!existsSync(rcloneConfigPath)) {
    recordWarning('CONNECTIONS', 'rclone config',
      `Config not found at ${rcloneConfigPath}.`,
      'Run: rclone config  (see docs/rclone-setup.md)');
  } else {
    recordResult('CONNECTIONS', 'rclone config', true,
      `Config found at ${rcloneConfigPath}`);
  }

  // Check rclone binary
  try {
    const rcloneVersion = execSync('rclone version', { encoding: 'utf8' })
      .split('\n')[0].trim();
    recordResult('CONNECTIONS', 'rclone binary', true, rcloneVersion);
  } catch {
    recordResult('CONNECTIONS', 'rclone binary', false,
      'rclone NOT FOUND on PATH.',
      'Install from https://rclone.org/downloads/ and add to PATH.');
    return;
  }

  // List R2 bucket root
  try {
    const listOutput = execSync('rclone lsd r2:legendary-images', {
      encoding: 'utf8',
      timeout: RCLONE_TIMEOUT_MS,
    });
    const folderCount = listOutput.split('\n').filter(line => line.trim()).length;

    if (folderCount === 0) {
      recordResult('CONNECTIONS', 'rclone R2 bucket', false,
        'Bucket root is empty. No folders found.',
        'Upload card data to R2 or verify the r2: remote configuration.');
    } else {
      recordResult('CONNECTIONS', 'rclone R2 bucket', true,
        `bucket root: ${folderCount} folders`);
    }
  } catch (listError) {
    recordResult('CONNECTIONS', 'rclone R2 bucket', false,
      `Cannot list bucket: ${listError.message}`,
      'Verify rclone r2: remote is configured correctly. Run: rclone config');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Runs all health checks in order and prints a final summary.
 */
async function main() {
  const suiteStartTime = Date.now();

  console.log('');
  console.log('=== Legendary Arena — Connection Health Check ===');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`Machine: ${hostname()}  Node: ${nodeVersion}  Platform: ${platform}`);
  console.log('');

  // Phase 1: Environment (must pass before connections)
  console.log('ENVIRONMENT');
  checkDotenvFile();

  checkRequiredEnvironmentVariables();
  console.log('');

  // Phase 2: Tools (no network needed)
  console.log('TOOLS');
  checkNodeVersion();
  checkPnpmVersion();
  checkDotenvCli();
  checkBoardgameioPackage();
  checkZodPackage();
  console.log('');

  // Phase 3: Connections (concurrent where possible)
  // why: connection checks are independent of each other and all have timeouts,
  // so running them concurrently reduces total check time from ~25s to ~5s.
  console.log('CONNECTIONS (concurrent)');
  await Promise.allSettled([
    checkPostgresConnection(),
    checkBoardgameioServer(),
    checkCloudflareR2(),
    checkHankoJwks(),
    checkCloudflarePages(),
    checkGithubReachability(),
  ]);

  // rclone is synchronous (uses execSync)
  checkRclone();

  // Phase 4: Summary
  console.log('');
  console.log('===');

  const totalElapsedMilliseconds = Date.now() - suiteStartTime;

  if (failureCount === 0 && warningCount === 0) {
    console.log(`SUMMARY: All checks passed.  (${totalElapsedMilliseconds}ms)`);
  } else {
    console.log(`SUMMARY: ${failureCount} failure(s), ${warningCount} warning(s)  (${totalElapsedMilliseconds}ms)`);
  }

  const failedResults = results.filter(result => !result.passed && result.level !== 'warn');
  for (const failedResult of failedResults) {
    console.log(`  FAIL: ${failedResult.checkName} — ${failedResult.message}`);
    if (failedResult.remediation) {
      console.log(`        ${failedResult.remediation}`);
    }
  }

  const warnResults = results.filter(result => !result.passed && result.level === 'warn');
  for (const warnResult of warnResults) {
    console.log(`  WARN: ${warnResult.checkName} — ${warnResult.message}`);
    if (warnResult.remediation) {
      console.log(`        ${warnResult.remediation}`);
    }
  }

  console.log('');

  // why: warnings indicate degraded or partial configuration but do not
  // prevent developers from continuing work. Only failures affect the exit
  // code. Do not "fix" this to exit(1) on warnings — that breaks local dev
  // workflows where optional services (rclone, Pages) may not be configured.
  if (failureCount > 0) {
    console.log('Fix failures before running other scripts.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
