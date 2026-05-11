/**
 * Legendary Arena — Execution Contract: Connection & Environment Health
 *
 * EC semantics:
 * - Any EC_FAIL → process.exit(1)
 * - EC_WARN does not violate the contract
 * - Every check maps to one or more EC IDs in EC_INDEX
 * - Summary output is EC-first: failures list EC IDs, not free-form names
 * - A coverage self-check (assertEcCoverage) guarantees every defined EC ID
 *   was evaluated at runtime — drift is a hard failure
 *
 * This is a lossless EC overlay on check-connections.mjs. All original
 * checks are preserved with identical logic, concurrency model, and exit
 * contract. The additions are: explicit execution-contract IDs, and a
 * mechanical drift detector that prevents silent EC erosion.
 *
 * Run via: node --env-file=.env scripts/ec/health-check.ec.mjs
 *
 * Exit code 0 = all contract assertions pass (warnings allowed).
 * Exit code 1 = at least one EC_FAIL assertion violated, or EC coverage gap.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { env, version as nodeVersion, platform } from 'node:process';
import { hostname } from 'node:os';

// ---------------------------------------------------------------------------
// Execution Contract Index (authoritative — single source of truth)
//
// why: EC IDs provide auditable, stable references for failures in CI and
// docs. Every EC ID maps to a single contract assertion. If a check function
// records a failure against an EC ID, that assertion is violated.
//
// COVERAGE RULE: Every key in this object MUST appear in at least one
// recordContractResult or recordContractWarning call during every execution.
// assertEcCoverage() enforces this mechanically. If you add an EC here,
// you must add enforcement code. If you remove enforcement code, remove the
// EC. Orphans in either direction are hard failures.
// ---------------------------------------------------------------------------

const EC_INDEX = {
  // Environment
  'EC-ENV-001': 'Project root must contain a .env file',
  'EC-ENV-002': '.env must not be identical to .env.example',
  'EC-ENV-003': '.env must not contain placeholder values (warn-level)',
  'EC-ENV-004': 'All required environment variables must be present and non-empty',

  // Tools
  'EC-TOOL-001': 'Node.js major version must be 22+',
  'EC-TOOL-002': 'pnpm major version must be 8+',
  'EC-TOOL-003': 'dotenv-cli must be installed and .env must be parseable (warn-level for parse issues)',
  'EC-TOOL-004': 'boardgame.io must be installed at 0.50.x and server entrypoint must exist',
  'EC-TOOL-005': 'zod must be installed',

  // Connections
  'EC-CONN-001': 'PostgreSQL must be reachable using DATABASE_URL and match EXPECTED_DB_NAME if set',
  'EC-CONN-002': 'boardgame.io server health endpoint must return HTTP 200',
  'EC-CONN-003': 'Cloudflare R2 metadata/sets.json must be reachable',
  'EC-CONN-004': 'Cloudflare Pages SPA must be reachable',
  'EC-CONN-005': 'GitHub repo API must be reachable',
  'EC-CONN-006': 'Local git remote origin must point to the correct GitHub repository',

  // Rclone (connection adjunct — separate IDs for config, binary, and bucket)
  'EC-RCLONE-001': 'rclone config should exist (warn-level)',
  'EC-RCLONE-002': 'rclone binary must be installed and on PATH',
  'EC-RCLONE-003': 'rclone must be able to list the R2 bucket root via r2:',
};

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

// ---------------------------------------------------------------------------
// Required environment variables — grouped by service
// ---------------------------------------------------------------------------

const REQUIRED_VARS = {
  'Database': [
    'DATABASE_URL',       // Render PostgreSQL connection string
    'EXPECTED_DB_NAME',   // e.g. legendary_arena — used for connection verification
  ],
  'Auth': [
    'JWT_SECRET',         // 32+ byte hex string — see .env.example for generation command
  ],
  'Game Server': [
    'NODE_ENV',           // 'development' or 'production'
    'GAME_SERVER_URL',    // e.g. https://legendary-arena.onrender.com
    'PORT',               // local dev only — Render sets this automatically
  ],
  'Cloudflare': [
    'R2_PUBLIC_URL',      // e.g. https://images.legendary-arena.com
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
// EC result tracking
// ---------------------------------------------------------------------------

const contractResults = [];
let contractFailCount = 0;
let contractWarnCount = 0;

/**
 * Records a contract assertion result and prints a live status line.
 * @param {string} ecId - The execution contract ID (e.g., 'EC-ENV-001')
 * @param {string} section - Section header (e.g., 'TOOLS', 'CONNECTIONS')
 * @param {string} checkName - Human-readable check name (e.g., 'PostgreSQL')
 * @param {boolean} passed - Whether the assertion passed
 * @param {string} message - Human-readable result message
 * @param {string} [remediation] - What to do if the assertion failed
 */
function recordContractResult(ecId, section, checkName, passed, message, remediation) {
  if (!passed) {
    contractFailCount++;
    console.log(`  ✗ ${ecId} (${checkName}) — ${message}`);
  } else {
    console.log(`  ✓ ${ecId} (${checkName}) — ${message}`);
  }

  contractResults.push({
    ecId,
    ecText: EC_INDEX[ecId] || '(missing EC_INDEX entry)',
    section,
    checkName,
    passed,
    level: 'FAIL',
    message,
    remediation,
  });
}

/**
 * Records a non-blocking contract warning. Does not increment the failure
 * count and will not cause exit 1.
 * @param {string} ecId - The execution contract ID
 * @param {string} section - Section header
 * @param {string} checkName - Human-readable check name
 * @param {string} message - Human-readable result message
 * @param {string} [remediation] - What to do about the warning
 */
function recordContractWarning(ecId, section, checkName, message, remediation) {
  contractWarnCount++;
  console.log(`  ⚠ ${ecId} (${checkName}) — ${message}`);
  contractResults.push({
    ecId,
    ecText: EC_INDEX[ecId] || '(missing EC_INDEX entry)',
    section,
    checkName,
    passed: false,
    level: 'WARN',
    message,
    remediation,
  });
}

// ---------------------------------------------------------------------------
// EC coverage self-check (drift detector)
// ---------------------------------------------------------------------------

/**
 * Compares defined EC IDs (EC_INDEX keys) against observed EC IDs
 * (contractResults entries). Any defined-but-unobserved EC is a coverage
 * gap — meaning enforcement code was removed or a code path silently
 * skips an EC without recording it.
 *
 * Any observed-but-undefined EC is also flagged — meaning a check uses
 * an EC ID that was never added to EC_INDEX.
 *
 * why: Without this, removing a check function (or introducing an early
 * return that skips recording) would silently reduce coverage. This makes
 * drift mechanically detectable rather than requiring manual audits.
 *
 * @returns {boolean} True if coverage is complete, false if gaps found.
 */
function assertEcCoverage() {
  const definedIds = new Set(Object.keys(EC_INDEX));
  const observedIds = new Set(contractResults.map(result => result.ecId));

  const missingEnforcement = [];
  for (const definedId of definedIds) {
    if (!observedIds.has(definedId)) {
      missingEnforcement.push(definedId);
    }
  }

  const orphanedObservations = [];
  for (const observedId of observedIds) {
    if (!definedIds.has(observedId)) {
      orphanedObservations.push(observedId);
    }
  }

  const hasCoverageGaps = missingEnforcement.length > 0 || orphanedObservations.length > 0;

  if (hasCoverageGaps) {
    console.log('');
    console.log('EC COVERAGE FAILURE');

    if (missingEnforcement.length > 0) {
      console.log('  Defined in EC_INDEX but never recorded at runtime:');
      for (const missingId of missingEnforcement) {
        console.log(`    ✗ ${missingId} — ${EC_INDEX[missingId]}`);
      }
    }

    if (orphanedObservations.length > 0) {
      console.log('  Recorded at runtime but missing from EC_INDEX:');
      for (const orphanedId of orphanedObservations) {
        console.log(`    ✗ ${orphanedId}`);
      }
    }

    contractFailCount += missingEnforcement.length + orphanedObservations.length;
  }

  return !hasCoverageGaps;
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
// ENVIRONMENT checks
// ---------------------------------------------------------------------------

/**
 * Asserts EC-ENV-001 through EC-ENV-003: .env file exists, differs from
 * .env.example, and contains no placeholder values.
 *
 * Coverage guarantee: all three EC IDs are recorded in every code path.
 * If .env is missing, EC-ENV-002 and EC-ENV-003 are recorded as failed
 * (prerequisite not met). If .env.example is missing, EC-ENV-002 is
 * recorded as passed (cannot be identical to a nonexistent file).
 */
function checkDotenvFile() {
  if (!existsSync('.env')) {
    recordContractResult('EC-ENV-001', 'ENVIRONMENT', '.env file', false,
      '.env file not found at project root.',
      'Copy .env.example to .env and fill in real values.');

    // why: EC-ENV-002 and EC-ENV-003 cannot be evaluated without .env.
    // Record them as failed so assertEcCoverage sees all three IDs.
    recordContractResult('EC-ENV-002', 'ENVIRONMENT', '.env vs .env.example', false,
      'Skipped — .env does not exist.',
      'Create .env first.');
    recordContractResult('EC-ENV-003', 'ENVIRONMENT', '.env placeholders', false,
      'Skipped — .env does not exist.',
      'Create .env first.');
    return;
  }

  recordContractResult('EC-ENV-001', 'ENVIRONMENT', '.env file', true, '.env file found');

  // why: Read .env once here and reuse for both the .env.example comparison
  // and the placeholder scan. Avoids reading the same file twice.
  const envContent = readFileSync('.env', 'utf8');

  if (existsSync('.env.example')) {
    const exampleContent = readFileSync('.env.example', 'utf8');

    if (envContent === exampleContent) {
      recordContractResult('EC-ENV-002', 'ENVIRONMENT', '.env vs .env.example', false,
        '.env is identical to .env.example. Replace placeholder values with real configuration.',
        'Edit .env and replace all placeholder values.');

      // why: EC-ENV-003 cannot produce meaningful results if .env is a
      // verbatim copy of .env.example — every value would be a placeholder.
      // Record it as failed so assertEcCoverage sees all three IDs.
      recordContractResult('EC-ENV-003', 'ENVIRONMENT', '.env placeholders', false,
        'Skipped — .env is identical to .env.example (all values are placeholders).',
        'Edit .env and replace all placeholder values.');
      return;
    }

    recordContractResult('EC-ENV-002', 'ENVIRONMENT', '.env vs .env.example', true,
      '.env differs from .env.example');
  } else {
    // why: If .env.example does not exist, there is nothing to compare
    // against. This is not a failure — it just means the comparison is
    // inapplicable. Record as passed so assertEcCoverage sees the ID.
    recordContractResult('EC-ENV-002', 'ENVIRONMENT', '.env vs .env.example', true,
      '.env.example not found — comparison not applicable');
  }

  const placeholderVars = [];

  for (const line of envContent.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
      continue;
    }

    const equalsIndex = trimmedLine.indexOf('=');
    const varName = trimmedLine.slice(0, equalsIndex).trim();
    const rawValue = trimmedLine.slice(equalsIndex + 1).trim();

    // why: Strip surrounding quotes before testing against placeholder patterns.
    // Without this, a value like "your-secret-here" would not match /^your-/i
    // because the leading quote would prevent the anchor from matching.
    const varValue = rawValue.replace(/^['"]|['"]$/g, '');

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(varValue)) {
        placeholderVars.push(varName);
        break;
      }
    }
  }

  if (placeholderVars.length > 0) {
    recordContractWarning('EC-ENV-003', 'ENVIRONMENT', '.env placeholders',
      `.env contains placeholder values: ${placeholderVars.join(', ')}`,
      'Replace placeholder values in .env with real configuration.');
  } else {
    recordContractResult('EC-ENV-003', 'ENVIRONMENT', '.env placeholders', true,
      'No placeholder values detected');
  }
}

/**
 * Asserts EC-ENV-004: all required environment variables are present
 * and non-empty.
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

    console.log(`  ${groupName.padEnd(14)} ${groupResults.join('  ')}`);
  }

  if (totalMissing > 0) {
    recordContractResult('EC-ENV-004', 'REQUIRED VARIABLES', 'env vars', false,
      `${totalMissing} of ${totalChecked} required variables are missing or empty.`,
      'Add the missing variables to your .env file. See .env.example for reference.');
  } else {
    recordContractResult('EC-ENV-004', 'REQUIRED VARIABLES', 'env vars', true,
      `All ${totalChecked} required variables are present.`);
  }
}

// ---------------------------------------------------------------------------
// TOOL checks
// ---------------------------------------------------------------------------

/**
 * Asserts EC-TOOL-001: Node.js version meets the project minimum.
 */
function checkNodeVersion() {
  const majorVersion = parseMajorVersion(nodeVersion);

  if (Number.isNaN(majorVersion)) {
    recordContractResult('EC-TOOL-001', 'TOOLS', 'Node.js', false,
      `Could not parse Node.js version from "${nodeVersion}".`,
      `Ensure Node.js v${MIN_NODE_MAJOR_VERSION}+ is installed from https://nodejs.org`);
    return;
  }

  if (majorVersion < MIN_NODE_MAJOR_VERSION) {
    recordContractResult('EC-TOOL-001', 'TOOLS', 'Node.js', false,
      `${nodeVersion} — major version ${majorVersion} is below required v${MIN_NODE_MAJOR_VERSION}.`,
      `Install Node.js v${MIN_NODE_MAJOR_VERSION}+ from https://nodejs.org`);
    return;
  }

  recordContractResult('EC-TOOL-001', 'TOOLS', 'Node.js', true, `Node.js ${nodeVersion}`);
}

/**
 * Asserts EC-TOOL-002: pnpm is installed and meets the minimum version.
 */
function checkPnpmVersion() {
  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
    const majorVersion = parseMajorVersion(pnpmVersion);

    if (Number.isNaN(majorVersion)) {
      recordContractResult('EC-TOOL-002', 'TOOLS', 'pnpm', false,
        `Could not parse pnpm version from "${pnpmVersion}".`,
        'Run: npm install -g pnpm');
      return;
    }

    if (majorVersion < MIN_PNPM_MAJOR_VERSION) {
      recordContractResult('EC-TOOL-002', 'TOOLS', 'pnpm', false,
        `v${pnpmVersion} — below required v${MIN_PNPM_MAJOR_VERSION}.`,
        'Run: npm install -g pnpm');
      return;
    }

    recordContractResult('EC-TOOL-002', 'TOOLS', 'pnpm', true, `pnpm v${pnpmVersion}`);
  } catch {
    recordContractResult('EC-TOOL-002', 'TOOLS', 'pnpm', false,
      'pnpm NOT FOUND on PATH.',
      'Run: npm install -g pnpm');
  }
}

/**
 * Asserts EC-TOOL-003: dotenv-cli is installed and can parse .env files.
 */
function checkDotenvCli() {
  try {
    // why: Confirm the binary exists without requiring .env to be present.
    // dotenv --help succeeds even if there is no .env file in the directory.
    execSync('dotenv --help', { encoding: 'utf8', stdio: 'pipe' });

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

    recordContractResult('EC-TOOL-003', 'TOOLS', 'dotenv-cli', true,
      `dotenv-cli v${dotenvVersion}`);

    // Verify .env is syntactically parseable if it exists
    if (existsSync('.env')) {
      try {
        execSync('dotenv -e .env -- node -e ""', { encoding: 'utf8', stdio: 'pipe' });
      } catch {
        recordContractWarning('EC-TOOL-003', 'TOOLS', 'dotenv-cli (.env parse)',
          '.env file exists but dotenv cannot parse it. Check for BOM encoding or unquoted special characters.',
          'Re-create .env from .env.example with UTF-8 encoding (no BOM).');
      }
    }
  } catch {
    recordContractResult('EC-TOOL-003', 'TOOLS', 'dotenv-cli', false,
      'dotenv-cli NOT FOUND on PATH — required for scripts that cannot use --env-file.',
      'Run: npm install -g dotenv-cli');
  }
}

/**
 * Asserts EC-TOOL-004: boardgame.io is installed at 0.50.x with the CJS
 * server entrypoint present.
 */
function checkBoardgameioPackage() {
  const packageJsonPath = findPackageJson('boardgame.io');

  if (!packageJsonPath) {
    recordContractResult('EC-TOOL-004', 'TOOLS', 'boardgame.io', false,
      'boardgame.io not found in any node_modules. pnpm install may not have been run, or boardgame.io is not yet a dependency.',
      'Run: pnpm install (once game-engine package exists)');
    return;
  }

  try {
    const packageData = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const installedVersion = packageData.version;

    if (!installedVersion || typeof installedVersion !== 'string') {
      recordContractResult('EC-TOOL-004', 'TOOLS', 'boardgame.io', false,
        'boardgame.io installed but version field is missing or invalid in package.json.',
        'Run: pnpm install to reinstall the package.');
      return;
    }

    const versionParts = installedVersion.split('.');

    if (versionParts.length < 3 || versionParts[0] !== '0' || versionParts[1] !== '50') {
      recordContractResult('EC-TOOL-004', 'TOOLS', 'boardgame.io', false,
        `boardgame.io v${installedVersion} — expected 0.50.x. This project locks boardgame.io to ^0.50.0.`,
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
      recordContractResult('EC-TOOL-004', 'TOOLS', 'boardgame.io', false,
        `boardgame.io v${installedVersion} installed but server CJS entrypoint missing at ${serverEntrypoint}.`,
        'Run: pnpm install to reinstall the package.');
      return;
    }

    recordContractResult('EC-TOOL-004', 'TOOLS', 'boardgame.io', true,
      `boardgame.io v${installedVersion} (server entrypoint verified)`);
  } catch (readError) {
    recordContractResult('EC-TOOL-004', 'TOOLS', 'boardgame.io', false,
      `boardgame.io found in node_modules but package.json is unreadable: ${readError.message}`,
      'Run: pnpm install to reinstall.');
  }
}

/**
 * Asserts EC-TOOL-005: zod is installed in node_modules.
 */
function checkZodPackage() {
  const packageJsonPath = findPackageJson('zod');

  if (!packageJsonPath) {
    recordContractResult('EC-TOOL-005', 'TOOLS', 'zod', false,
      'zod not found in any node_modules.',
      'Run: pnpm add zod');
    return;
  }

  try {
    const packageData = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    recordContractResult('EC-TOOL-005', 'TOOLS', 'zod', true, `zod v${packageData.version}`);
  } catch {
    recordContractResult('EC-TOOL-005', 'TOOLS', 'zod', false,
      'zod found in node_modules but package.json is unreadable.',
      'Run: pnpm install');
  }
}

// ---------------------------------------------------------------------------
// CONNECTION checks (concurrent)
// ---------------------------------------------------------------------------

/**
 * Asserts EC-CONN-001: PostgreSQL is reachable and the database name
 * matches EXPECTED_DB_NAME when set.
 */
async function checkPostgresConnection() {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    recordContractResult('EC-CONN-001', 'CONNECTIONS', 'PostgreSQL', false,
      'DATABASE_URL is not set. Cannot test database connection.',
      'Add DATABASE_URL to .env. See .env.example for format.');
    return;
  }

  try {
    // why: pg is a dependency of apps/server, not the monorepo root. Node's
    // ESM import() resolves from the script's location (scripts/ec/), which
    // cannot see apps/server/node_modules. Use createRequire to resolve pg
    // from the workspace that declares it as a dependency.
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
      recordContractResult('EC-CONN-001', 'CONNECTIONS', 'PostgreSQL', false,
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

    if (expectedDatabaseName && currentDatabase !== expectedDatabaseName) {
      recordContractResult('EC-CONN-001', 'CONNECTIONS', 'PostgreSQL', false,
        `Connected to "${currentDatabase}" but expected "${expectedDatabaseName}". Check DATABASE_URL points to the correct database.`,
        `Update DATABASE_URL in .env to point to the "${expectedDatabaseName}" database.`);
      return;
    }

    recordContractResult('EC-CONN-001', 'CONNECTIONS', 'PostgreSQL', true,
      `${currentDatabase} — ${databaseVersion}  (${elapsedMilliseconds}ms)`);
  } catch (connectionError) {
    const errorCode = connectionError.code || 'UNKNOWN';
    recordContractResult('EC-CONN-001', 'CONNECTIONS', 'PostgreSQL', false,
      `Connection failed (${errorCode}): ${connectionError.message}`,
      'Check DATABASE_URL in .env. For local dev, ensure PostgreSQL is running.');
  }
}

/**
 * Asserts EC-CONN-002: the boardgame.io game server health endpoint
 * returns HTTP 200.
 */
async function checkBoardgameioServer() {
  const serverUrl = env.GAME_SERVER_URL;

  if (!serverUrl) {
    recordContractResult('EC-CONN-002', 'CONNECTIONS', 'boardgame.io server', false,
      'GAME_SERVER_URL is not set. Cannot test server connection.',
      'Add GAME_SERVER_URL to .env. See .env.example.');
    return;
  }

  try {
    const startTime = Date.now();
    const response = await fetch(`${serverUrl}${HEALTH_CHECK_PATH}`, {
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });
    const elapsedMilliseconds = Date.now() - startTime;

    if (!response.ok) {
      recordContractResult('EC-CONN-002', 'CONNECTIONS', 'boardgame.io server', false,
        `${HEALTH_CHECK_PATH} returned HTTP ${response.status} (expected 200).`,
        `Is the Render service running? Check ${RENDER_DASHBOARD_URL}`);
      return;
    }

    recordContractResult('EC-CONN-002', 'CONNECTIONS', 'boardgame.io server', true,
      `${HEALTH_CHECK_PATH} → ${response.status} OK  (${elapsedMilliseconds}ms)`);
  } catch (fetchError) {
    recordContractResult('EC-CONN-002', 'CONNECTIONS', 'boardgame.io server', false,
      `Connection failed: ${fetchError.message}`,
      `Is the Render service running? Check ${RENDER_DASHBOARD_URL}`);
  }
}

/**
 * Asserts EC-CONN-003: Cloudflare R2 metadata/sets.json is reachable.
 */
async function checkCloudflareR2() {
  const publicUrl = env.R2_PUBLIC_URL;

  if (!publicUrl) {
    recordContractResult('EC-CONN-003', 'CONNECTIONS', 'Cloudflare R2', false,
      'R2_PUBLIC_URL is not set. Cannot test R2 reachability.',
      'Add R2_PUBLIC_URL to .env. See .env.example.');
    return;
  }

  try {
    const startTime = Date.now();
    // why: metadata/sets.json is the authoritative registry manifest in R2.
    // No registry-config.json exists — that was an incorrect assumption.
    const response = await fetch(`${publicUrl}/metadata/sets.json`, {
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });
    const elapsedMilliseconds = Date.now() - startTime;
    const contentType = response.headers.get('content-type') || 'unknown';

    if (!response.ok) {
      recordContractResult('EC-CONN-003', 'CONNECTIONS', 'Cloudflare R2', false,
        `metadata/sets.json returned HTTP ${response.status}.`,
        'Check R2_PUBLIC_URL in .env and verify the R2 bucket is publicly accessible.');
      return;
    }

    recordContractResult('EC-CONN-003', 'CONNECTIONS', 'Cloudflare R2', true,
      `metadata/sets.json → ${response.status} ${contentType}  (${elapsedMilliseconds}ms)`);
  } catch (fetchError) {
    recordContractResult('EC-CONN-003', 'CONNECTIONS', 'Cloudflare R2', false,
      `Connection failed: ${fetchError.message}`,
      'Check R2_PUBLIC_URL in .env and verify network connectivity.');
  }
}

/**
 * Asserts EC-CONN-004: Cloudflare Pages SPA is reachable.
 */
async function checkCloudflarePages() {
  const pagesUrl = env.CF_PAGES_URL;

  if (!pagesUrl) {
    recordContractResult('EC-CONN-004', 'CONNECTIONS', 'Cloudflare Pages', false,
      'CF_PAGES_URL is not set. Cannot test Pages reachability.',
      'Add CF_PAGES_URL to .env. See .env.example.');
    return;
  }

  try {
    const startTime = Date.now();
    const response = await fetch(pagesUrl, {
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });
    const elapsedMilliseconds = Date.now() - startTime;

    if (!response.ok) {
      recordContractResult('EC-CONN-004', 'CONNECTIONS', 'Cloudflare Pages', false,
        `${pagesUrl} returned HTTP ${response.status}.`,
        'Check Cloudflare Pages dashboard for deployment status.');
      return;
    }

    recordContractResult('EC-CONN-004', 'CONNECTIONS', 'Cloudflare Pages', true,
      `${pagesUrl} → ${response.status}  (${elapsedMilliseconds}ms)`);
  } catch (fetchError) {
    recordContractResult('EC-CONN-004', 'CONNECTIONS', 'Cloudflare Pages', false,
      `Connection failed: ${fetchError.message}`,
      'Check Cloudflare Pages dashboard for deployment status.');
  }
}

/**
 * Asserts EC-CONN-005: GitHub API is reachable for the project repository.
 */
async function checkGithubApi() {
  try {
    const startTime = Date.now();
    const response = await fetch(GITHUB_API_URL, {
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
    });
    const elapsedMilliseconds = Date.now() - startTime;

    if (response.ok) {
      const responseBody = await response.json();
      recordContractResult('EC-CONN-005', 'CONNECTIONS', 'GitHub API', true,
        `${responseBody.full_name} found  (${elapsedMilliseconds}ms)`);
    } else {
      recordContractResult('EC-CONN-005', 'CONNECTIONS', 'GitHub API', false,
        `API returned HTTP ${response.status}. Repository may be private or rate-limited.`,
        `Verify the repository exists at ${GITHUB_REPO_URL}`);
    }
  } catch (fetchError) {
    recordContractResult('EC-CONN-005', 'CONNECTIONS', 'GitHub API', false,
      `Connection failed: ${fetchError.message}`,
      'Check network connectivity and GitHub status.');
  }
}

/**
 * Asserts EC-CONN-006: local git remote origin points to the correct
 * GitHub repository.
 */
function checkGitRemote() {
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();

    if (remoteUrl.includes(GITHUB_REPO_SLUG)) {
      recordContractResult('EC-CONN-006', 'CONNECTIONS', 'Git remote', true,
        `origin → ${remoteUrl}`);
    } else {
      recordContractResult('EC-CONN-006', 'CONNECTIONS', 'Git remote', false,
        `origin is ${remoteUrl}, expected ${GITHUB_REPO_URL}.`,
        `Run: git remote set-url origin ${GITHUB_REPO_URL}`);
    }
  } catch {
    recordContractResult('EC-CONN-006', 'CONNECTIONS', 'Git remote', false,
      'Could not read git remote origin.',
      `Run: git remote add origin ${GITHUB_REPO_URL}`);
  }
}

/**
 * Asserts EC-RCLONE-001 through EC-RCLONE-003: rclone config exists,
 * binary is on PATH, and R2 bucket is listable.
 *
 * Coverage guarantee: all three EC IDs are recorded in every code path.
 * If rclone binary is missing, EC-RCLONE-003 is recorded as failed
 * (prerequisite not met).
 */
function checkRclone() {
  // why: rclone on Windows stores its config under %APPDATA%\rclone\rclone.conf,
  // not ~/.config/rclone as it does on Linux/macOS. Hardcoding a username path
  // would break on any machine with a different Windows user account name.
  const rcloneConfigPath = join(env.APPDATA || '', 'rclone', 'rclone.conf');

  if (!existsSync(rcloneConfigPath)) {
    recordContractWarning('EC-RCLONE-001', 'CONNECTIONS', 'rclone config',
      `Config not found at ${rcloneConfigPath}.`,
      'Run: rclone config  (see docs/rclone-setup.md)');
  } else {
    recordContractResult('EC-RCLONE-001', 'CONNECTIONS', 'rclone config', true,
      `Config found at ${rcloneConfigPath}`);
  }

  // Check rclone binary
  try {
    const rcloneVersion = execSync('rclone version', { encoding: 'utf8' })
      .split('\n')[0].trim();
    recordContractResult('EC-RCLONE-002', 'CONNECTIONS', 'rclone binary', true,
      rcloneVersion);
  } catch {
    recordContractResult('EC-RCLONE-002', 'CONNECTIONS', 'rclone binary', false,
      'rclone NOT FOUND on PATH.',
      'Install from https://rclone.org/downloads/ and add to PATH.');

    // why: EC-RCLONE-003 cannot be evaluated without the rclone binary.
    // Record it as failed so assertEcCoverage sees the ID.
    recordContractResult('EC-RCLONE-003', 'CONNECTIONS', 'rclone R2 bucket', false,
      'Skipped — rclone binary not found.',
      'Install rclone first.');
    return;
  }

  // List R2 bucket root
  try {
    const listOutput = execSync('rclone lsd r2:', {
      encoding: 'utf8',
      timeout: RCLONE_TIMEOUT_MS,
    });
    const folderCount = listOutput.split('\n').filter(line => line.trim()).length;

    if (folderCount === 0) {
      recordContractResult('EC-RCLONE-003', 'CONNECTIONS', 'rclone R2 bucket', false,
        'Bucket root is empty. No folders found.',
        'Upload card data to R2 or verify the r2: remote configuration.');
    } else {
      recordContractResult('EC-RCLONE-003', 'CONNECTIONS', 'rclone R2 bucket', true,
        `bucket root: ${folderCount} folders`);
    }
  } catch (listError) {
    recordContractResult('EC-RCLONE-003', 'CONNECTIONS', 'rclone R2 bucket', false,
      `Cannot list bucket: ${listError.message}`,
      'Verify rclone r2: remote is configured correctly. Run: rclone config');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Runs all contract checks in order, verifies EC coverage, and prints
 * an EC-first summary.
 */
async function main() {
  console.log('');
  console.log('=== Legendary Arena — Execution Contract Check ===');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`Machine: ${hostname()}  Node: ${nodeVersion}  Platform: ${platform}`);
  console.log(`Contract IDs: EC-ENV-001..004, EC-TOOL-001..005, EC-CONN-001..006, EC-RCLONE-001..003`);
  console.log(`EC universe: ${Object.keys(EC_INDEX).length} assertions defined`);
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
    checkCloudflarePages(),
    checkGithubApi(),
  ]);

  // why: checkGitRemote and checkRclone use execSync so they cannot run
  // inside Promise.allSettled. They run sequentially after the async checks.
  checkGitRemote();
  checkRclone();

  // Phase 3.5: EC coverage self-check (drift detector)
  // why: This runs after all checks so that contractResults is fully populated.
  // If any EC ID was defined but never recorded, it means enforcement code was
  // silently removed or a code path skips recording — both are contract violations.
  assertEcCoverage();

  // Phase 4: EC Summary (deterministic ordering by section then EC ID)
  console.log('');
  console.log('===');

  const observedCount = new Set(contractResults.map(result => result.ecId)).size;
  console.log(`EC COVERAGE: ${observedCount}/${Object.keys(EC_INDEX).length} assertions evaluated`);

  if (contractFailCount === 0 && contractWarnCount === 0) {
    console.log('EC SUMMARY: All contract assertions passed.');
  } else {
    console.log(`EC SUMMARY: ${contractFailCount} violation(s), ${contractWarnCount} warning(s)`);
  }

  const failedAssertions = contractResults
    .filter(result => !result.passed && result.level !== 'WARN')
    .sort((first, second) => (first.section + first.ecId).localeCompare(second.section + second.ecId));

  for (const failedAssertion of failedAssertions) {
    console.log(`  FAIL: ${failedAssertion.ecId} (${failedAssertion.checkName}) — ${failedAssertion.message}`);
    console.log(`        EC: ${failedAssertion.ecText}`);
    if (failedAssertion.remediation) {
      console.log(`        ${failedAssertion.remediation}`);
    }
  }

  const warnAssertions = contractResults
    .filter(result => !result.passed && result.level === 'WARN')
    .sort((first, second) => (first.section + first.ecId).localeCompare(second.section + second.ecId));

  for (const warnAssertion of warnAssertions) {
    console.log(`  WARN: ${warnAssertion.ecId} (${warnAssertion.checkName}) — ${warnAssertion.message}`);
    console.log(`        EC: ${warnAssertion.ecText}`);
    if (warnAssertion.remediation) {
      console.log(`        ${warnAssertion.remediation}`);
    }
  }

  console.log('');

  if (contractFailCount > 0) {
    console.log('Execution contract violated. Fix all violations before proceeding.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
