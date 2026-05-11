/**
 * Legendary Arena — Architecture & Library Adoption Inventory
 *
 * Produces an evidence-based snapshot of the libraries, frameworks, and
 * tooling actually adopted in this monorepo, plus a doc-vs-code drift
 * check against `docs/ai/ARCHITECTURE.md` and `docs/02-ARCHITECTURE.md`.
 *
 * The script is deterministic: it reads `package.json` files, counts
 * real imports, and emits a markdown report. It does NOT make
 * recommendations — that step is intentionally LLM judgment work. Feed
 * the report into the gap-analysis prompt to get prioritized advice.
 *
 * Run via:
 *   node scripts/architecture-inventory.mjs                # stdout
 *   node scripts/architecture-inventory.mjs --out FILE     # write file
 *   node scripts/architecture-inventory.mjs --out -        # explicit stdout
 *
 * Exit code is always 0 unless the script itself crashes; this is a
 * reporting tool, not a gate.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, cwd, exit, stdout } from 'node:process';

// ---------------------------------------------------------------------------
// Configuration — workspace layout, scan roots, ignore set
// ---------------------------------------------------------------------------

// why: pnpm-workspace.yaml lists `packages/*` and `apps/*` as the only
// workspace globs; matching this here keeps the inventory aligned with
// what pnpm actually installs.
const WORKSPACE_GLOBS = ['packages', 'apps'];

// why: extensions that can declare imports of installed packages. `.mjs`
// and `.cjs` cover scripts/tooling; `.vue` is scanned because SFCs can
// import libraries inside <script setup> blocks.
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue'];

// why: the inventory only counts source files, not generated artifacts
// or third-party code. node_modules and dist directories balloon the
// scan time and yield no signal about what we wrote.
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.turbo',
  '.cache',
  'coverage',
  '.vite',
  '.output',
  '.nuxt',
]);

// ---------------------------------------------------------------------------
// Language footprint — extension and marker-file inventory configuration.
// Distinct from SOURCE_EXTENSIONS (which scopes the import scanner to
// files that can declare imports of installed packages); this set is
// broader because the goal is "what languages does this repo author,"
// not "what files import npm packages."
// ---------------------------------------------------------------------------

// why: extension -> language label map. Adding an extension here
// automatically classifies every file with that extension under the
// named language in the report. Keep labels human-readable; they
// surface verbatim in the markdown table.
const LANGUAGE_EXTENSIONS = new Map([
  ['TypeScript', ['.ts', '.tsx', '.d.ts']],
  ['JavaScript', ['.js', '.mjs', '.cjs']],
  ['Vue SFC', ['.vue']],
  ['CSS', ['.css']],
  ['Sass/SCSS', ['.sass', '.scss']],
  ['HTML', ['.html']],
  ['Markdown', ['.md', '.mdx']],
  ['JSON', ['.json']],
  ['YAML', ['.yml', '.yaml']],
  ['TOML', ['.toml']],
  ['SQL', ['.sql']],
  ['Shell', ['.sh']],
  ['PowerShell', ['.ps1']],
]);

// why: presence-probes for languages whose toolchain or source-file
// extensions wouldn't surface in the extension scan alone. Hugo is the
// motivating case: the repo runs a Hugo binary as a build step, but no
// `.go` source files exist. The report needs to be able to say "Go
// toolchain present (via Hugo), Go source absent" without conflating
// the two. Same logic for Docker (Dockerfiles exist, no Go-style source
// to count).
const LANGUAGE_MARKER_PROBES = [
  { language: 'Go', toolchainMarkers: ['go.mod', 'go.sum'], sourceExtensions: ['.go'] },
  { language: 'Python', toolchainMarkers: ['requirements.txt', 'pyproject.toml', 'Pipfile'], sourceExtensions: ['.py'] },
  { language: 'Rust', toolchainMarkers: ['Cargo.toml'], sourceExtensions: ['.rs'] },
  { language: 'Ruby', toolchainMarkers: ['Gemfile'], sourceExtensions: ['.rb'] },
  { language: 'Java/Kotlin', toolchainMarkers: ['pom.xml', 'build.gradle', 'build.gradle.kts'], sourceExtensions: ['.java', '.kt'] },
  { language: 'Docker', toolchainMarkers: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'], sourceExtensions: [] },
  { language: 'Hugo (Go binary)', toolchainMarkers: ['hugo.toml', 'hugo.yaml', 'hugo.yml'], sourceExtensions: [] },
];

// why: the language inventory walks a slightly broader set of trees
// than the import scanner. `wiki/` is project-authored markdown for the
// Hugo site and belongs in the language footprint, even though it has
// no installed packages and is irrelevant to the import scan.
const LANGUAGE_SCAN_ROOTS = ['apps', 'packages', 'scripts', 'wiki'];

// why: anchor REPO_ROOT to this script's own location so the inventory
// works regardless of the caller's working directory. The script lives
// in `<repo>/scripts/`, so the parent of `__dirname` is always the
// repo root. Using `process.cwd()` here would silently produce an
// empty report when the user invoked node from a subdirectory or via
// an editor terminal that started elsewhere.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, '..');

// why: keep the date-stamped header reproducible regardless of the host
// timezone — the user runs this from Windows (Pacific) but reports may
// be reviewed elsewhere. UTC date is unambiguous.
const TODAY_UTC = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Category map — adopted libraries we expect to see, grouped by concern
// ---------------------------------------------------------------------------

// why: This is the curated taxonomy used to bucket dependencies in the
// report. Each entry is `categoryLabel: [packageName, ...]`. A package
// not listed here falls into "Other / uncategorized" so nothing is
// silently dropped. Edit this list when a new category becomes
// load-bearing for the project.
const CATEGORY_DEFINITIONS = [
  ['Framework — client', [
    'vue',
    'vite',
    '@vitejs/plugin-vue',
    'pinia',
    'vue-router',
    '@vue/runtime-core',
    '@vue/compiler-sfc',
    '@vue/test-utils',
  ]],
  ['Framework — server', [
    'boardgame.io',
    'koa',
    '@koa/router',
    'koa-bodyparser',
    'koa-static',
    'express',
    'fastify',
    'hono',
  ]],
  ['Realtime / networking', [
    'socket.io',
    'socket.io-client',
    'ws',
    'sockjs',
    'sockjs-client',
    'engine.io',
    'engine.io-client',
  ]],
  ['HTTP client', [
    'axios',
    'ofetch',
    'ky',
    'undici',
  ]],
  ['Data fetching / cache', [
    '@tanstack/vue-query',
    '@tanstack/query-core',
    'swrv',
  ]],
  ['Schema / validation', [
    'zod',
    'valibot',
    'yup',
    'joi',
    'ajv',
    'superstruct',
  ]],
  ['Forms', [
    'vee-validate',
    '@formkit/core',
    '@formkit/vue',
    '@vuelidate/core',
    '@vuelidate/validators',
  ]],
  ['Styling', [
    'tailwindcss',
    'unocss',
    'windicss',
    'sass',
    'postcss',
    'autoprefixer',
    '@unocss/preset-uno',
  ]],
  ['UI component libraries', [
    'primevue',
    'vuetify',
    'naive-ui',
    'element-plus',
    'quasar',
    'radix-vue',
    'reka-ui',
    'shadcn-vue',
  ]],
  ['Icons', [
    '@iconify/vue',
    '@iconify/json',
    'lucide-vue-next',
    'heroicons',
    'unplugin-icons',
  ]],
  ['Animation', [
    'gsap',
    'motion-v',
    'animejs',
    '@vueuse/motion',
    'lottie-web',
    'lottie-vue',
    'auto-animate',
    '@formkit/auto-animate',
  ]],
  ['State (non-Pinia)', [
    'vuex',
    'zustand',
    'jotai',
    'xstate',
  ]],
  ['Database', [
    'pg',
    'postgres',
    'drizzle-orm',
    'prisma',
    '@prisma/client',
    'kysely',
    'mysql2',
    'sqlite3',
    'better-sqlite3',
  ]],
  ['Auth', [
    '@teamhanko/hanko-elements',
    '@teamhanko/hanko-frontend-sdk',
    'lucia',
    'oslo',
    'auth0',
    'next-auth',
    'better-auth',
    'jose',
    'jsonwebtoken',
  ]],
  ['Storage / cloud', [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'aws-sdk',
  ]],
  ['Testing', [
    'vitest',
    '@vue/test-utils',
    'jsdom',
    'happy-dom',
    'playwright',
    '@playwright/test',
    'cypress',
    'msw',
    'sinon',
    'fast-check',
  ]],
  ['A11y testing', [
    'axe-core',
    '@axe-core/playwright',
    'vitest-axe',
    'jest-axe',
  ]],
  ['Lint / format', [
    'eslint',
    'prettier',
    'eslint-plugin-vue',
    'eslint-plugin-vuejs-accessibility',
    '@vue/eslint-config-typescript',
    'typescript-eslint',
    '@typescript-eslint/parser',
    '@typescript-eslint/eslint-plugin',
  ]],
  ['Build / typecheck / transform', [
    'typescript',
    'vue-tsc',
    'tsx',
    'esbuild',
    'rollup',
    'unplugin-vue-components',
    'unplugin-auto-import',
  ]],
  ['Observability', [
    '@sentry/vue',
    '@sentry/node',
    '@sentry/browser',
    'pino',
    'winston',
    '@opentelemetry/api',
    '@opentelemetry/sdk-node',
  ]],
  ['Date / time', [
    'dayjs',
    'date-fns',
    'luxon',
  ]],
  ['Utilities', [
    '@vueuse/core',
    '@vueuse/integrations',
    'lodash',
    'lodash-es',
    'ramda',
    'remeda',
  ]],
  ['Notifications / overlays', [
    'vue-toastification',
    '@kyvg/vue3-notification',
    'vue-sonner',
    'floating-vue',
  ]],
];

// why: Flatten once for quick lookup. Each package maps to its category
// label so dependency walking is O(1) per package.
const PACKAGE_TO_CATEGORY = new Map();
for (const [categoryLabel, packageNames] of CATEGORY_DEFINITIONS) {
  for (const packageName of packageNames) {
    PACKAGE_TO_CATEGORY.set(packageName, categoryLabel);
  }
}

// ---------------------------------------------------------------------------
// First-party subsystems — internally-built modules of architectural
// significance that don't surface in the dep / category tables because
// they aren't libraries.
// ---------------------------------------------------------------------------

// why: this script's two existing fact-shapes are external library
// adoption (category tables) and per-app stacks (Application stacks
// section). First-party subsystems are neither — they're our own
// modules living inside `packages/*` that nonetheless deserve top-level
// orientation. Keep this list tight: only entries a reviewer would
// expect to see called out at the executive-summary altitude.
//
// Each entry's `contractSymbols` is verified against actual exports at
// render time, so a renamed or removed symbol surfaces as a drift
// warning instead of a stale doc lie.
const FIRST_PARTY_SUBSYSTEMS = [
  {
    name: 'PAR Simulation Engine',
    location: 'packages/game-engine/src/simulation',
    owningWp: 'WP-049',
    owningWpPath: 'docs/ai/work-packets/WP-049-par-simulation-engine.md',
    description:
      'AI-policy-driven calibration pipeline. T0 RandomPolicy and T2 ' +
      'CompetentHeuristicPolicy sample raw scores via runSimulation; ' +
      'aggregateParFromSimulation reduces the distribution to a percentile ' +
      'PAR (Player Approachability Rating) value, which is persisted as a ' +
      'versioned artifact. Calibration tooling, not gameplay logic (D-0701).',
    contractSymbols: [
      'runSimulation',
      'getLegalMoves',
      'createRandomPolicy',
      'createCompetentHeuristicPolicy',
      'AI_POLICY_TIERS',
      'aggregateParFromSimulation',
      'generateScenarioPar',
      'validateParResult',
      'validateTierOrdering',
      'resolveParForScenario',
    ],
  },
];

// ---------------------------------------------------------------------------
// Importance tiering — cross-cutting axis on top of CATEGORY_DEFINITIONS.
// CATEGORY_DEFINITIONS groups by *concern* (Vue ecosystem, testing infra,
// etc.); IMPORTANCE_DEFINITIONS groups by *blast radius if removed*.
// Same data, different cut.
// ---------------------------------------------------------------------------

// why: an executive-summary reviewer asks two different questions about
// the same dep list — "what's it for?" (concern, answered above) and
// "how badly would removing it hurt?" (importance, answered here).
//
// Tier definitions:
// - Foundational: replacing it means rewriting the architecture. The
//   engine model, runtime contract, schema discipline, or persistence
//   story rests on this dep.
// - Adopted:      explicit framework choice, locked by a WP or DECISIONS
//   entry. Replaceable with significant effort but the architecture
//   doesn't *require* this specific package.
// - Tooling:      supports the dev / test / build loop. Replaceable
//   with low effort; no architectural surface depends on the choice.
//
// Entries can be a bare package name string OR an object with
// `{ name, transitiveVia }`. Use the object form for packages that
// reach the workspace transitively (e.g., `socket.io` and `@koa/router`
// ship via `boardgame.io`'s server bundle, not as direct deps), so the
// rendered table can annotate the fact instead of mis-reporting them
// as "not installed."
//
// Curation discipline: this is a judgment call, not derivable from data.
// Reasonable people disagree at the boundaries. Anything in `aggregate`
// without an entry here surfaces under "Not yet classified" so the
// curator sees the gap on the next inventory run.
const IMPORTANCE_DEFINITIONS = [
  ['Foundational', [
    'boardgame.io',
    'typescript',
    'zod',
    'pg',
  ]],
  ['Adopted', [
    'vue',
    'pinia',
    'vite',
    { name: 'socket.io', transitiveVia: 'boardgame.io' },
    { name: 'socket.io-client', transitiveVia: 'boardgame.io' },
    { name: '@koa/router', transitiveVia: 'boardgame.io' },
    { name: 'koa', transitiveVia: 'boardgame.io' },
  ]],
  ['Tooling', [
    'vue-tsc',
    'tsx',
    'eslint',
    '@vitejs/plugin-vue',
    '@vue/test-utils',
    'jsdom',
    '@vue/compiler-sfc',
    '@types/node',
    '@types/jsdom',
    '@typescript-eslint/eslint-plugin',
    '@typescript-eslint/parser',
    '@vue/eslint-config-typescript',
    '@vue/tsconfig',
    'eslint-plugin-vue',
    'eslint-plugin-vuejs-accessibility',
    // why: R2 is foundational storage, but the SDK choice is replaceable.
    // R2 is S3-compatible, so any S3 client would work. The SDK is used
    // by scripts/validate-r2.mjs and upload tooling, never at runtime by
    // any app — Tooling.
    '@aws-sdk/client-s3',
    // why: pure type declarations, no runtime behavior.
    '@cloudflare/workers-types',
    // why: env-var loader for scripts. Not load-bearing for any
    // architectural surface. Reaches the workspace via side-effect
    // import (`import "dotenv/config"`) at
    // `packages/registry/scripts/upload-r2.ts`.
    'dotenv',
    // why: declared in `packages/registry/package.json` since the
    // initial commit but never imported by any source file. Verified
    // across the surviving registry scripts (validate.ts,
    // upload-r2.ts) and the three scripts deleted by EC-081. Listed
    // here under Tooling for completeness; the resulting `0 ⚠` row in
    // the report is the standing signal for the future operator-
    // tooling cleanup WP foreshadowed in EC-081 to drop it.
    'fast-glob',
  ]],
];

// why: flatten once for O(1) "is this package classified, and at what
// tier?" lookups during the Not-yet-classified bucket render. Stores
// just the tier label per package — the entry's transitiveVia metadata
// is not needed at lookup time, only at render time.
const PACKAGE_TO_IMPORTANCE = new Map();
for (const [tierLabel, entries] of IMPORTANCE_DEFINITIONS) {
  for (const entry of entries) {
    const packageName = typeof entry === 'string' ? entry : entry.name;
    PACKAGE_TO_IMPORTANCE.set(packageName, tierLabel);
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing — keep it tiny, no dep needed
// ---------------------------------------------------------------------------

/**
 * Parse `--out <path>` from argv. Returns the resolved output target:
 * a string path, or null meaning "write to stdout".
 *
 * Relative paths resolve against the caller's shell cwd, not REPO_ROOT.
 * The user's mental model when typing `--out report.md` is "drop it
 * here next to me," so we honour that. Absolute paths pass through.
 *
 * @param {string[]} args
 * @returns {string | null}
 */
function parseOutputTarget(args) {
  const outIndex = args.indexOf('--out');
  if (outIndex === -1) {
    return null;
  }
  const value = args[outIndex + 1];
  if (!value || value === '-') {
    return null;
  }
  return resolve(cwd(), value);
}

// ---------------------------------------------------------------------------
// Workspace discovery — find every package.json under the workspace globs
// ---------------------------------------------------------------------------

/**
 * Walk a directory and yield absolute paths to every package.json file
 * encountered, skipping vendored or generated trees.
 *
 * @param {string} startDirectory
 * @returns {Promise<string[]>}
 */
async function findPackageManifests(startDirectory) {
  const found = [];
  const stack = [startDirectory];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(join(current, entry.name));
      } else if (entry.isFile() && entry.name === 'package.json') {
        found.push(join(current, entry.name));
      }
    }
  }
  return found;
}

/**
 * Discover the root manifest plus every workspace manifest. Sorted by
 * relative path so the report is stable across runs.
 *
 * @returns {Promise<string[]>}
 */
async function discoverWorkspaceManifests() {
  const manifests = [];
  const rootManifest = join(REPO_ROOT, 'package.json');
  if (existsSync(rootManifest)) {
    manifests.push(rootManifest);
  }
  for (const workspaceGlob of WORKSPACE_GLOBS) {
    const workspaceDirectory = join(REPO_ROOT, workspaceGlob);
    if (!existsSync(workspaceDirectory)) {
      continue;
    }
    const subEntries = await readdir(workspaceDirectory, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory()) {
        continue;
      }
      const candidate = join(workspaceDirectory, subEntry.name, 'package.json');
      if (existsSync(candidate)) {
        manifests.push(candidate);
      }
    }
  }
  manifests.sort();
  return manifests;
}

// ---------------------------------------------------------------------------
// Manifest parsing — collect dep info per package
// ---------------------------------------------------------------------------

/**
 * Read a package.json and pull out the deps we care about for the
 * inventory. The original object is not retained; only the slimmed
 * shape downstream code uses.
 *
 * @param {string} manifestPath
 * @returns {Promise<{
 *   name: string,
 *   relativePath: string,
 *   dependencies: Record<string, string>,
 *   devDependencies: Record<string, string>,
 *   peerDependencies: Record<string, string>,
 * }>}
 */
async function readManifest(manifestPath) {
  const raw = await readFile(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    name: parsed.name ?? '(unnamed)',
    relativePath: relative(REPO_ROOT, manifestPath).split(sep).join('/'),
    // why: package.json `description` is the workspace's self-authored
    // role label. Surfacing it in the Workspace table and the
    // Application stacks section keeps role descriptions self-maintaining
    // — to change a workspace's role label, edit its description.
    description: typeof parsed.description === 'string' ? parsed.description : null,
    dependencies: parsed.dependencies ?? {},
    devDependencies: parsed.devDependencies ?? {},
    peerDependencies: parsed.peerDependencies ?? {},
    // why: engines + packageManager are the load-bearing runtime
    // contract for the whole repo. Capturing them per-manifest lets the
    // report surface them at the top and flag mismatches between
    // workspaces.
    engines: parsed.engines ?? {},
    packageManager: parsed.packageManager ?? null,
  };
}

/**
 * Aggregate every dependency across all manifests into a single map of
 * `packageName -> { version, locations[], scopes[] }`. Multiple manifests
 * declaring the same package collapse here; mismatched versions surface
 * as a list so the report can flag drift.
 *
 * @param {Array<Awaited<ReturnType<typeof readManifest>>>} manifests
 * @returns {Map<string, {
 *   versions: Set<string>,
 *   locations: Array<{ manifest: string, scope: string, version: string }>,
 * }>}
 */
function aggregateDependencies(manifests) {
  const aggregate = new Map();
  for (const manifest of manifests) {
    const scopeBuckets = [
      ['dependencies', manifest.dependencies],
      ['devDependencies', manifest.devDependencies],
      ['peerDependencies', manifest.peerDependencies],
    ];
    for (const [scopeName, bucket] of scopeBuckets) {
      for (const [packageName, version] of Object.entries(bucket)) {
        if (!aggregate.has(packageName)) {
          aggregate.set(packageName, { versions: new Set(), locations: [] });
        }
        const entry = aggregate.get(packageName);
        entry.versions.add(version);
        entry.locations.push({
          manifest: manifest.relativePath,
          scope: scopeName,
          version,
        });
      }
    }
  }
  return aggregate;
}

// ---------------------------------------------------------------------------
// Import counting — measure actual usage per package
// ---------------------------------------------------------------------------

/**
 * Walk every source file in the repo (under `apps/`, `packages/`, and
 * `scripts/`) and count how many files import each package. This is a
 * usage signal: a dep declared but imported from zero files is either
 * dead or implementation-pending.
 *
 * @param {string[]} packageNames
 * @returns {Promise<Map<string, number>>}
 */
async function countImportsPerPackage(packageNames) {
  const counts = new Map();
  for (const packageName of packageNames) {
    counts.set(packageName, 0);
  }

  const scanRoots = ['apps', 'packages', 'scripts'].map((directory) =>
    join(REPO_ROOT, directory),
  );
  const sourceFiles = [];
  for (const root of scanRoots) {
    if (!existsSync(root)) {
      continue;
    }
    await collectSourceFiles(root, sourceFiles);
  }

  // why: build one regex per package rather than a giant alternation.
  // Per-package regex lets us increment that package's count once per
  // file (not once per line), which matches "files using this package"
  // — a more useful signal than total import statements.
  const compiledMatchers = packageNames.map((packageName) => {
    const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      packageName,
      // matches: import ... from 'pkg' | "pkg" | from 'pkg/sub'
      // and:     import('pkg') / require('pkg')
      // and:     import 'pkg' / import "pkg/config"   (side-effect-only;
      //          required to see deps like dotenv that ship with `import
      //          "dotenv/config"` rather than a named/default import)
      pattern: new RegExp(
        `(?:from\\s+|import\\s+|import\\(\\s*|require\\(\\s*)['"\`]${escaped}(?:/[^'"\`]*)?['"\`]`,
      ),
    };
  });

  for (const filePath of sourceFiles) {
    let contents;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const { packageName, pattern } of compiledMatchers) {
      if (pattern.test(contents)) {
        counts.set(packageName, counts.get(packageName) + 1);
      }
    }
  }

  return counts;
}

/**
 * Recursively gather paths of source files under a directory that match
 * SOURCE_EXTENSIONS, skipping vendored or generated trees.
 *
 * @param {string} directory
 * @param {string[]} accumulator
 * @returns {Promise<void>}
 */
async function collectSourceFiles(directory, accumulator) {
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const dotIndex = entry.name.lastIndexOf('.');
      if (dotIndex === -1) {
        continue;
      }
      const extension = entry.name.slice(dotIndex);
      if (SOURCE_EXTENSIONS.includes(extension)) {
        accumulator.push(join(current, entry.name));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Language footprint scan — extension and marker-file inventory
// ---------------------------------------------------------------------------

/**
 * Walk a directory tree and accumulate every regular file path,
 * skipping vendored / generated trees. Extension-blind counterpart to
 * `collectSourceFiles`, used by the Language Footprint scan.
 *
 * @param {string} directory
 * @param {string[]} accumulator
 * @returns {Promise<void>}
 */
async function collectAllFiles(directory, accumulator) {
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(join(current, entry.name));
        continue;
      }
      if (entry.isFile()) {
        accumulator.push(join(current, entry.name));
      }
    }
  }
}

/**
 * Walk the language scan roots and produce the three cuts the
 * Language Footprint section needs:
 *   - byLanguage: extension-classified counts (TypeScript, Vue SFC, …)
 *   - byExtension: raw extension counts (every distinct extension seen)
 *   - markers: toolchain-vs-source presence probes for non-Node
 *     languages whose mere extension count would mislead (e.g. Hugo
 *     ships a Go binary but the repo has no `.go` source).
 *
 * @returns {Promise<{
 *   byLanguage: Map<string, number>,
 *   byExtension: Map<string, number>,
 *   markers: Array<{ language: string, toolchainPresent: boolean, sourcePresent: boolean }>,
 * }>}
 */
async function scanLanguageFootprint() {
  const scanRoots = LANGUAGE_SCAN_ROOTS.map((directory) =>
    join(REPO_ROOT, directory),
  );
  const allFiles = [];
  for (const root of scanRoots) {
    if (!existsSync(root)) {
      continue;
    }
    await collectAllFiles(root, allFiles);
  }

  // why: build a flat extension -> language lookup once so per-file
  // classification is O(1). Adding a row to LANGUAGE_EXTENSIONS
  // automatically lands here without touching the loop.
  const extensionToLanguage = new Map();
  for (const [language, extensions] of LANGUAGE_EXTENSIONS) {
    for (const extension of extensions) {
      extensionToLanguage.set(extension, language);
    }
  }

  const byLanguage = new Map();
  const byExtension = new Map();
  const presentBasenames = new Set();
  const presentExtensions = new Set();

  for (const filePath of allFiles) {
    const baseName = filePath.split(sep).pop();
    presentBasenames.add(baseName);

    // why: detect `.d.ts` ahead of the generic last-dot extraction.
    // Otherwise `lastIndexOf('.')` yields `.ts` for `foo.d.ts` and
    // declaration files silently fold into the regular TypeScript
    // bucket, hiding them from the raw extension table.
    let extension;
    if (baseName.endsWith('.d.ts')) {
      extension = '.d.ts';
    } else {
      const dotIndex = baseName.lastIndexOf('.');
      extension = dotIndex === -1 ? '' : baseName.slice(dotIndex);
    }

    if (extension === '') {
      continue;
    }
    presentExtensions.add(extension);
    byExtension.set(extension, (byExtension.get(extension) ?? 0) + 1);

    const language = extensionToLanguage.get(extension);
    if (language !== undefined) {
      byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
    }
  }

  // why: the marker-probe pass distinguishes "toolchain in use" from
  // "source code in this language exists" — a distinction the
  // extension count alone can't express. Toolchain markers are
  // matched both as basenames anywhere in the scanned tree (to catch
  // per-app `Dockerfile` / `hugo.toml`) and at the repo root (to
  // catch root-level `go.mod` / `pyproject.toml` that wouldn't fall
  // under the scan roots).
  const markers = [];
  for (const probe of LANGUAGE_MARKER_PROBES) {
    let toolchainPresent = false;
    for (const markerName of probe.toolchainMarkers) {
      if (presentBasenames.has(markerName)) {
        toolchainPresent = true;
        break;
      }
      if (existsSync(join(REPO_ROOT, markerName))) {
        toolchainPresent = true;
        break;
      }
    }
    let sourcePresent = false;
    for (const sourceExtension of probe.sourceExtensions) {
      if (presentExtensions.has(sourceExtension)) {
        sourcePresent = true;
        break;
      }
    }
    markers.push({
      language: probe.language,
      toolchainPresent,
      sourcePresent,
    });
  }

  return { byLanguage, byExtension, markers };
}

// ---------------------------------------------------------------------------
// Config-file scan — count package references inside JSON / YAML configs
// that the source-file walker misses (tsconfig, pnpm-workspace, etc.)
// ---------------------------------------------------------------------------

/**
 * Walk every `tsconfig*.json` and pull package references out of
 * `extends` (string or array) and `compilerOptions.types` (array of
 * type-only package names like `"vite/client"` or `"node"`). Returns a
 * Map<filePath, Set<packageName>> so callers can both bump usage
 * counts and surface which configs reference what.
 *
 * @param {Iterable<string>} packageNames
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function scanTsconfigReferences(packageNames) {
  const referencesByFile = new Map();
  const installedPackages = new Set(packageNames);
  const tsconfigPaths = [];
  for (const root of ['apps', 'packages']) {
    const rootPath = join(REPO_ROOT, root);
    if (!existsSync(rootPath)) {
      continue;
    }
    await collectTsconfigPaths(rootPath, tsconfigPaths);
  }
  // why: also pick up a root-level tsconfig if one is ever added; today
  // there is none, but the scan is cheap and forwards-compatible.
  const rootTsconfig = join(REPO_ROOT, 'tsconfig.json');
  if (existsSync(rootTsconfig)) {
    tsconfigPaths.push(rootTsconfig);
  }

  for (const tsconfigPath of tsconfigPaths) {
    let parsed;
    try {
      const raw = await readFile(tsconfigPath, 'utf8');
      // why: tsconfig is officially JSON-with-comments. Strip line and
      // block comments before parsing so configs that follow the spec
      // don't crash the inventory. Trailing commas are also legal in
      // tsconfig — JSON.parse rejects them, but the configs in this
      // repo don't use them, so we don't bother stripping those.
      const cleaned = stripJsonComments(raw);
      parsed = JSON.parse(cleaned);
    } catch {
      // why: a malformed tsconfig is a real problem, but it's out of
      // scope for this inventory. Skip silently rather than masking
      // useful output behind a parse error.
      continue;
    }

    const referenced = new Set();

    const extendsField = parsed.extends;
    if (typeof extendsField === 'string') {
      addPackageReference(extendsField, installedPackages, referenced);
    } else if (Array.isArray(extendsField)) {
      for (const value of extendsField) {
        if (typeof value === 'string') {
          addPackageReference(value, installedPackages, referenced);
        }
      }
    }

    const typesField = parsed.compilerOptions?.types;
    if (Array.isArray(typesField)) {
      for (const value of typesField) {
        if (typeof value !== 'string') {
          continue;
        }
        // why: a tsconfig `types: ["node"]` resolves to `@types/node`
        // unless a package literally named `node` is installed. Try the
        // bare name first, fall back to the `@types/*` form so common
        // entries like `"node"` and `"jsdom"` correctly bump the
        // matching @types/* dep.
        const headSegment = value.split('/')[0];
        if (installedPackages.has(headSegment)) {
          referenced.add(headSegment);
        } else if (installedPackages.has(`@types/${headSegment}`)) {
          referenced.add(`@types/${headSegment}`);
        } else {
          // why: also try the full path's first @scope/name segment so
          // things like `"@cloudflare/workers-types"` bump correctly.
          addPackageReference(value, installedPackages, referenced);
        }
      }
    }

    if (referenced.size > 0) {
      const relPath = relative(REPO_ROOT, tsconfigPath).split(sep).join('/');
      referencesByFile.set(relPath, referenced);
    }
  }
  return referencesByFile;
}

/**
 * Strip `//` line comments and block comments from JSON-with-comments
 * text. Implements a small state machine that respects string
 * literals so patterns like `"@/*"` inside a tsconfig `paths` entry
 * are not mistaken for comment delimiters. A naive regex approach
 * here would chew through real JSON whenever a string contained `/*`
 * or `//` — which tsconfig path patterns routinely do.
 *
 * @param {string} jsonText
 * @returns {string}
 */
function stripJsonComments(jsonText) {
  let output = '';
  let index = 0;
  const length = jsonText.length;
  while (index < length) {
    const character = jsonText[index];
    if (character === '"') {
      // why: copy the string literal verbatim, including escape pairs
      // like \" so the closing quote is recognised correctly.
      output += character;
      index++;
      while (index < length) {
        const innerCharacter = jsonText[index];
        output += innerCharacter;
        index++;
        if (innerCharacter === '\\' && index < length) {
          output += jsonText[index];
          index++;
          continue;
        }
        if (innerCharacter === '"') {
          break;
        }
      }
      continue;
    }
    if (character === '/' && index + 1 < length) {
      const nextCharacter = jsonText[index + 1];
      if (nextCharacter === '/') {
        index += 2;
        while (index < length && jsonText[index] !== '\n') {
          index++;
        }
        continue;
      }
      if (nextCharacter === '*') {
        index += 2;
        while (
          index < length &&
          !(jsonText[index] === '*' && jsonText[index + 1] === '/')
        ) {
          index++;
        }
        index += 2;
        continue;
      }
    }
    output += character;
    index++;
  }
  return output;
}

/**
 * Convert a tsconfig path-like reference (e.g. `"@vue/tsconfig/tsconfig.dom.json"`,
 * `"vite/client"`) to its top-level package name and add it to the
 * accumulator if that package is actually installed.
 *
 * @param {string} reference
 * @param {Set<string>} installedPackages
 * @param {Set<string>} accumulator
 */
function addPackageReference(reference, installedPackages, accumulator) {
  const segments = reference.split('/');
  if (segments.length === 0) {
    return;
  }
  let candidate;
  if (segments[0].startsWith('@') && segments.length >= 2) {
    candidate = `${segments[0]}/${segments[1]}`;
  } else {
    candidate = segments[0];
  }
  if (installedPackages.has(candidate)) {
    accumulator.add(candidate);
  }
}

/**
 * Recursively collect paths to every `tsconfig*.json` under a tree,
 * skipping the same vendored / generated directories the source-file
 * walker skips.
 *
 * @param {string} directory
 * @param {string[]} accumulator
 * @returns {Promise<void>}
 */
async function collectTsconfigPaths(directory, accumulator) {
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(join(current, entry.name));
        continue;
      }
      if (entry.isFile() && /^tsconfig.*\.json$/.test(entry.name)) {
        accumulator.push(join(current, entry.name));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ESLint config scan — count plugin / parser / extends string references
// that the source-import scan misses (config strings, not require() calls)
// ---------------------------------------------------------------------------

// why: ESLint config files reference plugins, parsers, and configs by
// short string names that the language server resolves via convention
// (e.g. `'plugin:vue/...'` -> `eslint-plugin-vue`). We need to scan
// these specifically because the source-import scan only matches
// `from '<pkg>'` / `require('<pkg>')` patterns, and ESLint configs
// almost never use those forms.
const ESLINT_CONFIG_FILE_PATTERN = /^(?:\.eslintrc(?:\.(?:cjs|mjs|js|json|yaml|yml))?|eslint\.config\.(?:cjs|mjs|js|ts|json))$/;

/**
 * Walk every ESLint config file (`.eslintrc.*` and `eslint.config.*`)
 * and return a Map<filePath, Set<packageName>> of installed packages
 * referenced as strings inside those configs. Handles ESLint's
 * shortname conventions: `plugin:foo/X` -> `eslint-plugin-foo`,
 * `'@scope/X'` in extends -> direct match or `@scope/eslint-plugin-X`,
 * etc.
 *
 * @param {Iterable<string>} packageNames
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function scanEslintConfigReferences(packageNames) {
  const referencesByFile = new Map();
  const installedPackages = new Set(packageNames);
  const configPaths = [];
  for (const root of ['apps', 'packages']) {
    const rootPath = join(REPO_ROOT, root);
    if (!existsSync(rootPath)) {
      continue;
    }
    await collectEslintConfigPaths(rootPath, configPaths);
  }
  // why: also pick up a root-level config if one is ever added.
  for (const candidate of [
    '.eslintrc.cjs', '.eslintrc.js', '.eslintrc.mjs',
    '.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml',
    'eslint.config.cjs', 'eslint.config.mjs', 'eslint.config.js', 'eslint.config.ts',
  ]) {
    const candidatePath = join(REPO_ROOT, candidate);
    if (existsSync(candidatePath)) {
      configPaths.push(candidatePath);
    }
  }

  for (const configPath of configPaths) {
    let raw;
    try {
      raw = await readFile(configPath, 'utf8');
    } catch {
      continue;
    }
    const candidateStrings = extractEslintConfigStrings(configPath, raw);
    const referenced = new Set();
    for (const candidateString of candidateStrings) {
      for (const candidatePackage of resolveEslintReferenceCandidates(candidateString)) {
        if (installedPackages.has(candidatePackage)) {
          referenced.add(candidatePackage);
        }
      }
    }
    if (referenced.size > 0) {
      const relPath = relative(REPO_ROOT, configPath).split(sep).join('/');
      referencesByFile.set(relPath, referenced);
    }
  }
  return referencesByFile;
}

/**
 * Extract every plausible plugin / parser / extends reference string
 * from an ESLint config file. For `.json` configs we parse and walk
 * the known fields; for everything else we pull single/double-quoted
 * literals out of the text. The downstream candidate-resolver filters
 * to installed packages, so over-extraction here is harmless.
 *
 * @param {string} configPath
 * @param {string} rawContents
 * @returns {string[]}
 */
function extractEslintConfigStrings(configPath, rawContents) {
  const collected = [];
  if (configPath.endsWith('.json')) {
    let parsed;
    try {
      parsed = JSON.parse(stripJsonComments(rawContents));
    } catch {
      return collected;
    }
    walkEslintConfigObject(parsed, collected);
    return collected;
  }
  if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
    // why: YAML parsing without a dependency would be its own project.
    // Surface a notice via the docstring rather than a half-working
    // parser; this repo doesn't currently use YAML eslint configs, so
    // the tradeoff is fine until one shows up.
    return collected;
  }
  // .cjs / .mjs / .js / .ts — pull every quoted string literal. False
  // positives here cannot resolve to installed packages, so the
  // candidate-resolver filters them out cleanly.
  const stringPattern = /(['"])([^'"\\\n]+)\1/g;
  let match;
  while ((match = stringPattern.exec(rawContents)) !== null) {
    collected.push(match[2]);
  }
  return collected;
}

/**
 * Walk a parsed `.eslintrc.json` object and collect plugin / parser /
 * extends string references from the fields ESLint reads. Recurses
 * into `overrides` because per-file overrides can pull in additional
 * plugins.
 *
 * @param {unknown} node
 * @param {string[]} accumulator
 */
function walkEslintConfigObject(node, accumulator) {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkEslintConfigObject(item, accumulator);
    }
    return;
  }
  const keysOfInterest = ['extends', 'parser', 'plugins'];
  for (const key of keysOfInterest) {
    if (key in node) {
      const value = node[key];
      if (typeof value === 'string') {
        accumulator.push(value);
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string') {
            accumulator.push(entry);
          }
        }
      }
    }
  }
  if ('parserOptions' in node && typeof node.parserOptions === 'object') {
    const parserOptions = node.parserOptions;
    if (parserOptions !== null && typeof parserOptions.parser === 'string') {
      accumulator.push(parserOptions.parser);
    }
  }
  if ('overrides' in node && Array.isArray(node.overrides)) {
    for (const override of node.overrides) {
      walkEslintConfigObject(override, accumulator);
    }
  }
}

/**
 * Convert a string from an ESLint config to the set of npm package
 * names it could legally resolve to. ESLint applies short-name
 * conventions: `'plugin:foo/X'` -> `eslint-plugin-foo`, bare `'foo'`
 * in extends -> `eslint-config-foo`, `'@scope/X'` -> direct or
 * `@scope/eslint-plugin-X`. Returns an empty set for built-ins like
 * `'eslint:recommended'` and obvious non-package strings.
 *
 * @param {string} reference
 * @returns {Set<string>}
 */
function resolveEslintReferenceCandidates(reference) {
  const candidates = new Set();
  if (reference.length === 0 || reference.startsWith('eslint:')) {
    return candidates;
  }
  // why: rule names like `'@typescript-eslint/no-unused-vars'` and
  // glob patterns like `'**/*.vue'` will hit this resolver. They
  // simply don't resolve to any installed package, so the downstream
  // filter discards them; we don't need to pre-filter aggressively.

  let working = reference;
  let isPluginPrefix = false;
  if (working.startsWith('plugin:')) {
    working = working.slice('plugin:'.length);
    isPluginPrefix = true;
  }

  // why: derive the head package segment. Scoped names take two
  // segments (`@scope/name`); unscoped names take one.
  let head;
  if (working.startsWith('@')) {
    const segments = working.split('/');
    if (segments.length < 2) {
      head = segments[0];
    } else {
      head = `${segments[0]}/${segments[1]}`;
    }
  } else {
    head = working.split('/')[0];
  }

  // why: when the source string lacked a `plugin:` prefix it might be
  // a literal package path (e.g. `'@vue/eslint-config-typescript'`).
  // The prefixed form is unambiguously a plugin shortname, so don't
  // tempt the resolver to match a same-named non-plugin package.
  //
  // Only add the bare `head` as a direct candidate when the reference
  // either has no slash or is a scoped path. Unscoped slashed refs
  // like `'vue/multi-word-component-names'` are almost always rule
  // keys, and treating their head (`vue`) as a direct package would
  // falsely bump the Vue framework on every rule mention.
  if (!isPluginPrefix) {
    candidates.add(reference);
    if (!reference.includes('/') || head.startsWith('@')) {
      candidates.add(head);
    }
  }

  if (head.startsWith('@')) {
    const [scope, name] = head.split('/');
    if (name) {
      candidates.add(`${scope}/eslint-plugin-${name}`);
      if (!isPluginPrefix) {
        candidates.add(`${scope}/eslint-config-${name}`);
      }
    } else {
      // why: bare-scope convention. `'plugin:@typescript-eslint/recommended'`
      // resolves to the canonical `@typescript-eslint/eslint-plugin`.
      candidates.add(`${scope}/eslint-plugin`);
    }
  } else {
    candidates.add(`eslint-plugin-${head}`);
    if (!isPluginPrefix) {
      candidates.add(`eslint-config-${head}`);
    }
  }

  return candidates;
}

/**
 * Recursively collect ESLint config file paths under a directory,
 * skipping the same vendored / generated trees the source walker skips.
 *
 * @param {string} directory
 * @param {string[]} accumulator
 * @returns {Promise<void>}
 */
async function collectEslintConfigPaths(directory, accumulator) {
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        stack.push(join(current, entry.name));
        continue;
      }
      if (entry.isFile() && ESLINT_CONFIG_FILE_PATTERN.test(entry.name)) {
        accumulator.push(join(current, entry.name));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lockfile scan — surface transitive deps invisible from package.json
// ---------------------------------------------------------------------------

/**
 * Parse `pnpm-lock.yaml` and return the set of every resolved package
 * with its version(s). The pnpm v9 lockfile keeps a top-level
 * `packages:` block whose keys look like `'@scope/name@1.2.3':` or
 * `'name@1.2.3(peer@4.5.6)':` — we don't need full YAML parsing,
 * regex over those keys is enough to enumerate transitive deps.
 *
 * @param {string} lockfilePath
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function parseLockfilePackages(lockfilePath) {
  const result = new Map();
  if (!existsSync(lockfilePath)) {
    return result;
  }
  const rawContents = await readFile(lockfilePath, 'utf8');
  // why: pCloud-synced repos and most Windows checkouts store
  // `pnpm-lock.yaml` with CRLF line endings. The regex anchors below
  // depend on `\n`-only line ends, so normalise once up front. This
  // also makes `indexOf('\npackages:\n')` robust to the Windows case.
  const contents = rawContents.replace(/\r\n/g, '\n');
  // why: scope the scan to the `packages:` block (or `snapshots:` in
  // future formats) so we never misread an `importers:` entry as a
  // top-level package. Both blocks list the same keys; reading either
  // is sufficient for "what versions did pnpm resolve?".
  const packagesIndex = contents.indexOf('\npackages:\n');
  if (packagesIndex === -1) {
    return result;
  }
  const tail = contents.slice(packagesIndex);
  const keyPattern = /^  '?([^'\s:][^':\n]*)'?:$/gm;
  let match;
  while ((match = keyPattern.exec(tail)) !== null) {
    const fullKey = match[1].trim();
    // why: skip block-level keys (e.g., `snapshots:`) that share the
    // 2-space indent. Real package keys always contain `@version`.
    if (!fullKey.includes('@')) {
      continue;
    }
    const parsed = parsePackageKey(fullKey);
    if (parsed === null) {
      continue;
    }
    if (!result.has(parsed.name)) {
      result.set(parsed.name, new Set());
    }
    result.get(parsed.name).add(parsed.version);
  }
  return result;
}

/**
 * Split a pnpm lockfile key like `@scope/name@1.2.3(peer@4.5)` into
 * its package name and clean version string. Returns null if the key
 * doesn't match the expected shape.
 *
 * @param {string} key
 * @returns {{ name: string, version: string } | null}
 */
function parsePackageKey(key) {
  const match = /^(@?[^@/]+(?:\/[^@/]+)?)@(.+)$/.exec(key);
  if (match === null) {
    return null;
  }
  // why: peer-dep variants append annotations like `(typescript@5.9.3)`
  // to the version. They are noise for the inventory's purposes; the
  // resolved semver is what we want to display.
  const cleanedVersion = match[2].split('(')[0];
  return { name: match[1], version: cleanedVersion };
}

// ---------------------------------------------------------------------------
// Doc cross-reference — flag drift between architecture docs and code
// ---------------------------------------------------------------------------

/**
 * Read an architecture doc and return the set of package-like strings
 * mentioned inside backticks. This is heuristic — backticks usually
 * surround code identifiers in our markdown — but it surfaces obvious
 * mismatches like a doc referencing `socket.io` while the code has none.
 *
 * @param {string} docPath
 * @returns {Promise<Set<string>>}
 */
async function extractMentionedPackages(docPath) {
  const mentioned = new Set();
  if (!existsSync(docPath)) {
    return mentioned;
  }
  const contents = await readFile(docPath, 'utf8');
  // why: backtick-quoted spans are how the architecture docs flag code
  // identifiers. We only keep tokens that look like npm package names
  // (letters, digits, dots, hyphens, optional @scope/) to avoid false
  // positives from prose like `G` or `ctx`.
  const backtickPattern = /`([@\w][\w./@-]*)`/g;
  let match;
  while ((match = backtickPattern.exec(contents)) !== null) {
    const token = match[1];
    if (PACKAGE_TO_CATEGORY.has(token)) {
      mentioned.add(token);
      continue;
    }
    // why: also accept tokens that look like installed packages (eg.
    // `boardgame.io`) even if they are not in the curated category map,
    // so the cross-reference can still flag drift.
    if (/^@?[\w][\w-]*(?:\/[\w-]+)?$/.test(token) && token.includes('.')) {
      mentioned.add(token);
    }
  }
  return mentioned;
}

// ---------------------------------------------------------------------------
// Report rendering — emit markdown
// ---------------------------------------------------------------------------

/**
 * Build the final markdown report from the gathered facts.
 *
 * @param {object} input
 * @param {Array<Awaited<ReturnType<typeof readManifest>>>} input.manifests
 * @param {Map<string, { versions: Set<string>, locations: any[] }>} input.aggregate
 * @param {Map<string, number>} input.importCounts
 * @param {Map<string, Set<string>>} input.tsconfigReferences
 * @param {Map<string, Set<string>>} input.eslintConfigReferences
 * @param {Map<string, Set<string>>} input.lockfilePackages
 * @param {Awaited<ReturnType<typeof scanLanguageFootprint>>} input.languageFootprint
 * @param {Set<string>} input.docMentionsArch
 * @param {Set<string>} input.docMentionsArch02
 * @returns {Promise<string>}
 */
async function renderReport({
  manifests,
  aggregate,
  importCounts,
  tsconfigReferences,
  eslintConfigReferences,
  lockfilePackages,
  languageFootprint,
  docMentionsArch,
  docMentionsArch02,
}) {
  const lines = [];
  lines.push(`# Architecture & Library Adoption Inventory`);
  lines.push('');
  lines.push(`_Generated ${TODAY_UTC} by \`scripts/architecture-inventory.mjs\`._`);
  lines.push('');
  lines.push(`This is a deterministic snapshot of installed dependencies and`);
  lines.push(`their actual import usage across the workspace. It does **not**`);
  lines.push(`make recommendations — feed it into the gap-analysis prompt`);
  lines.push(`alongside \`docs/02-ARCHITECTURE.md\` and \`docs/ai/ARCHITECTURE.md\``);
  lines.push(`for prioritized advice.`);
  lines.push('');

  // why: lead with a per-app stack narrative so a reviewer can orient
  // themselves on "what is each app, what is it built with" before
  // descending into the per-package tables. Synthesised from each
  // workspace's own deps + descriptions; no hardcoded labels.
  lines.push(`## Application stacks`);
  lines.push('');
  lines.push(`One entry per app under \`apps/*\`. Each "Stack" line is`);
  lines.push(`synthesised from the app's own manifests:`);
  lines.push('');
  lines.push(`- Node apps (\`apps/*/package.json\` present): \`dependencies\` /`);
  lines.push(`  \`devDependencies\` versions, plus a few transitive facts`);
  lines.push(`  confirmed against \`pnpm-lock.yaml\` (Socket.IO and Koa`);
  lines.push(`  router both ship via \`boardgame.io\`, not as direct deps).`);
  lines.push(`  Descriptions come from each workspace's \`package.json#description\`.`);
  lines.push(`- Hugo apps (\`apps/*/hugo.toml\` present, no \`package.json\`):`);
  lines.push(`  pinned binary version from \`apps/<name>/.hugo-version\`,`);
  lines.push(`  source page count from the projection input directory, and`);
  lines.push(`  deploy target verified against \`render.yaml\`.`);
  lines.push('');
  lines.push(await renderApplicationStacksSection(manifests, lockfilePackages));
  lines.push('');

  // why: surface internally-built subsystems that don't appear in the
  // dep tables (because they aren't libraries) or the per-app stacks
  // (because they live inside `packages/*`). Curated list lives at
  // `FIRST_PARTY_SUBSYSTEMS` near the top of the file.
  lines.push(`## First-party subsystems`);
  lines.push('');
  lines.push(`Internally-built modules of architectural significance that`);
  lines.push(`don't surface in the library tables or per-app stacks.`);
  lines.push(`Each entry's contract surface is verified against actual`);
  lines.push(`\`export\` declarations on disk, so a renamed or removed`);
  lines.push(`symbol shows up here as drift instead of a stale doc lie.`);
  lines.push('');
  lines.push(await renderFirstPartySubsystemsSection());
  lines.push('');

  lines.push(`## Runtime & toolchain`);
  lines.push('');
  lines.push(renderRuntimeSection(manifests, aggregate));
  lines.push('');

  // why: language footprint pairs naturally with runtime / toolchain
  // — both answer "what does this repo run on" — but cuts a different
  // axis (file extensions and marker probes vs declared engines and
  // pinned versions). Place it directly after so a reviewer can read
  // both halves in sequence.
  lines.push(`## Language footprint`);
  lines.push('');
  lines.push(renderLanguageFootprintSection(languageFootprint));
  lines.push('');

  lines.push(`## Workspace`);
  lines.push('');
  lines.push(`| Manifest | Name | Role | deps | devDeps | peerDeps |`);
  lines.push(`|---|---|---|---:|---:|---:|`);
  for (const manifest of manifests) {
    // why: the Role column is sourced directly from each workspace's
    // `package.json#description`. Self-maintaining: when a workspace's
    // role changes, the description gets updated and the next inventory
    // run reflects it without touching this script.
    const roleCell = manifest.description ?? '_(no description)_';
    lines.push(
      `| \`${manifest.relativePath}\` | ${manifest.name} | ${roleCell} | ` +
        `${Object.keys(manifest.dependencies).length} | ` +
        `${Object.keys(manifest.devDependencies).length} | ` +
        `${Object.keys(manifest.peerDependencies).length} |`,
    );
  }
  lines.push('');

  // why: classify every aggregated package using the curated category
  // map. Anything unknown lands in "Other" so reviewers can decide
  // whether to add a category or accept it as incidental.
  const byCategory = new Map();
  const uncategorized = [];
  for (const [packageName, info] of aggregate) {
    const category = PACKAGE_TO_CATEGORY.get(packageName);
    if (category === undefined) {
      uncategorized.push([packageName, info]);
      continue;
    }
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category).push([packageName, info]);
  }

  // why: the curated category map can list the same package under more
  // than one category when it serves both roles (e.g. `@vue/test-utils`
  // is testing infrastructure but also part of the Vue ecosystem). Use
  // the global installed set for "is this present anywhere?" checks so
  // the per-category "candidates not installed" lists never falsely
  // report a package as missing when another category already counted it.
  const installedAnywhere = new Set(aggregate.keys());

  lines.push(`## Adopted libraries by category`);
  lines.push('');
  for (const [categoryLabel, expectedPackages] of CATEGORY_DEFINITIONS) {
    const found = byCategory.get(categoryLabel) ?? [];
    lines.push(`### ${categoryLabel}`);
    lines.push('');
    if (found.length === 0) {
      lines.push(`_No packages from this category are installed._`);
      lines.push('');
      const candidates = expectedPackages.filter(
        (name) => !installedAnywhere.has(name),
      );
      if (candidates.length > 0) {
        lines.push(`Candidates considered for this category (none adopted):`);
        lines.push('');
        for (const candidate of candidates) {
          lines.push(`- \`${candidate}\``);
        }
        lines.push('');
      }
      continue;
    }
    lines.push(`| Package | Version(s) | Files importing | Declared in |`);
    lines.push(`|---|---|---:|---|`);
    found.sort(([a], [b]) => a.localeCompare(b));
    for (const [packageName, info] of found) {
      const versionList = [...info.versions].join(', ');
      const importCount = importCounts.get(packageName) ?? 0;
      const usageCell = renderUsageCell(importCount, packageName, info);
      const locationCell = info.locations
        .map((loc) => `\`${loc.manifest}\` (${shortScope(loc.scope)})`)
        .join('; ');
      lines.push(
        `| \`${packageName}\` | ${versionList} | ${usageCell} | ${locationCell} |`,
      );
    }
    lines.push('');
    const missingCandidates = expectedPackages.filter(
      (name) => !installedAnywhere.has(name),
    );
    if (missingCandidates.length > 0) {
      lines.push(`_Other candidates in this category not currently installed:_ ${missingCandidates
        .map((name) => `\`${name}\``)
        .join(', ')}`);
      lines.push('');
    }
  }

  if (uncategorized.length > 0) {
    lines.push(`### Other / uncategorized`);
    lines.push('');
    lines.push(`Packages installed but not mapped to a category in this`);
    lines.push(`script. Add to \`CATEGORY_DEFINITIONS\` if any of these`);
    lines.push(`become load-bearing.`);
    lines.push('');
    lines.push(`| Package | Version(s) | Files importing | Declared in |`);
    lines.push(`|---|---|---:|---|`);
    uncategorized.sort(([a], [b]) => a.localeCompare(b));
    for (const [packageName, info] of uncategorized) {
      const versionList = [...info.versions].join(', ');
      const importCount = importCounts.get(packageName) ?? 0;
      const usageCell = renderUsageCell(importCount, packageName, info);
      const locationCell = info.locations
        .map((loc) => `\`${loc.manifest}\` (${shortScope(loc.scope)})`)
        .join('; ');
      lines.push(
        `| \`${packageName}\` | ${versionList} | ${usageCell} | ${locationCell} |`,
      );
    }
    lines.push('');
  }

  // why: pivot the same dep data the category tables show, but cut by
  // *blast radius if removed* instead of by concern. Adjacent placement
  // reinforces "same data, different cut." The curated tier map lives
  // at IMPORTANCE_DEFINITIONS near the top of the file.
  lines.push(`## Importance tiering`);
  lines.push('');
  lines.push(`Same packages as the category tables above, pivoted by **blast`);
  lines.push(`radius if removed** instead of by concern. Three tiers:`);
  lines.push('');
  lines.push(`- **Foundational** — replacing it means rewriting the`);
  lines.push(`  architecture (engine model, runtime contract, schema`);
  lines.push(`  discipline, or persistence story rests on this dep).`);
  lines.push(`- **Adopted** — explicit framework choice locked by a WP or`);
  lines.push(`  \`DECISIONS.md\` entry; replaceable with significant effort.`);
  lines.push(`- **Tooling** — supports the dev / test / build loop;`);
  lines.push(`  replaceable with low effort, no architectural surface depends`);
  lines.push(`  on the choice.`);
  lines.push('');
  lines.push(`Curation is a judgment call, not derived from data. Anything`);
  lines.push(`installed but not yet placed surfaces under "Not yet classified".`);
  lines.push('');
  lines.push(renderImportanceSection(aggregate, importCounts, lockfilePackages));
  lines.push('');

  // ---------------------------------------------------------------------------
  // Usage anomalies
  // ---------------------------------------------------------------------------
  // why: a package is only "really" unused if no source file imports
  // it AND no tsconfig / eslint config references it. Folding both
  // config-file scans in here removes false positives like
  // `@vue/tsconfig`, the `@types/*` packages, and `@typescript-eslint/parser`.
  const configReferencedPackages = new Set();
  for (const referencedSet of tsconfigReferences.values()) {
    for (const packageName of referencedSet) {
      configReferencedPackages.add(packageName);
    }
  }
  for (const referencedSet of eslintConfigReferences.values()) {
    for (const packageName of referencedSet) {
      configReferencedPackages.add(packageName);
    }
  }
  const declaredButUnused = [];
  const versionDrift = [];
  for (const [packageName, info] of aggregate) {
    const importCount = importCounts.get(packageName) ?? 0;
    const referencedByConfig = configReferencedPackages.has(packageName);
    if (
      importCount === 0 &&
      !referencedByConfig &&
      !isExpectedZeroImport(packageName, info)
    ) {
      declaredButUnused.push({ packageName, info });
    }
    if (info.versions.size > 1) {
      versionDrift.push({ packageName, info });
    }
  }

  lines.push(`## Anomalies`);
  lines.push('');

  lines.push(`### Declared but no source imports detected`);
  lines.push('');
  lines.push(`Heuristic: package appears in a \`package.json\` but no file`);
  lines.push(`under \`apps/\`, \`packages/\`, or \`scripts/\` matches a`);
  lines.push(`\`from '<pkg>'\` / \`import('<pkg>')\` / \`require('<pkg>')\``);
  lines.push(`pattern, **and** it is not referenced by any \`tsconfig*.json\``);
  lines.push(`(\`extends\` / \`compilerOptions.types\`) or \`.eslintrc.*\` /`);
  lines.push(`\`eslint.config.*\` (\`extends\` / \`parser\` / \`plugins\`).`);
  lines.push(`CLI-only tools (\`tsx\`, \`vite\`, \`vue-tsc\`, \`eslint\`,`);
  lines.push(`\`prettier\`, \`typescript\`) are excluded as expected`);
  lines.push(`zero-import.`);
  lines.push('');
  if (declaredButUnused.length === 0) {
    lines.push(`_None._`);
  } else {
    lines.push(`| Package | Declared in |`);
    lines.push(`|---|---|`);
    declaredButUnused.sort((a, b) => a.packageName.localeCompare(b.packageName));
    for (const { packageName, info } of declaredButUnused) {
      const locationCell = info.locations
        .map((loc) => `\`${loc.manifest}\` (${shortScope(loc.scope)})`)
        .join('; ');
      lines.push(`| \`${packageName}\` | ${locationCell} |`);
    }
  }
  lines.push('');

  lines.push(`### Version drift across workspace`);
  lines.push('');
  lines.push(`Same package declared with different version ranges in`);
  lines.push(`different manifests. Worth aligning unless intentional.`);
  lines.push('');
  if (versionDrift.length === 0) {
    lines.push(`_None._`);
  } else {
    lines.push(`| Package | Versions | Locations |`);
    lines.push(`|---|---|---|`);
    versionDrift.sort((a, b) => a.packageName.localeCompare(b.packageName));
    for (const { packageName, info } of versionDrift) {
      const versionList = [...info.versions].join(', ');
      const locationCell = info.locations
        .map((loc) => `\`${loc.manifest}\` ${loc.version}`)
        .join('; ');
      lines.push(`| \`${packageName}\` | ${versionList} | ${locationCell} |`);
    }
  }
  lines.push('');

  // ---------------------------------------------------------------------------
  // Tsconfig references
  // ---------------------------------------------------------------------------
  lines.push(`## tsconfig references`);
  lines.push('');
  lines.push(`Packages reached via \`tsconfig*.json\` — \`extends\` and`);
  lines.push(`\`compilerOptions.types\`. Source-file import counts miss`);
  lines.push(`these because they live in JSON, but the deps are real`);
  lines.push(`(removing them would break the build).`);
  lines.push('');
  if (tsconfigReferences.size === 0) {
    lines.push(`_No tsconfig references to installed packages detected._`);
  } else {
    lines.push(`| tsconfig | Referenced packages |`);
    lines.push(`|---|---|`);
    const sortedTsconfigs = [...tsconfigReferences.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );
    for (const [tsconfigPath, referencedPackages] of sortedTsconfigs) {
      const packageList = [...referencedPackages]
        .sort()
        .map((name) => `\`${name}\``)
        .join(', ');
      lines.push(`| \`${tsconfigPath}\` | ${packageList} |`);
    }
  }
  lines.push('');

  // ---------------------------------------------------------------------------
  // ESLint config references
  // ---------------------------------------------------------------------------
  lines.push(`## ESLint config references`);
  lines.push('');
  lines.push(`Packages reached via \`.eslintrc.*\` or \`eslint.config.*\``);
  lines.push(`— \`extends\`, \`parser\`, \`parserOptions.parser\`, and`);
  lines.push(`\`plugins\` string entries. ESLint resolves these via`);
  lines.push(`shortname conventions (\`'plugin:vue/...'\` ->`);
  lines.push(`\`eslint-plugin-vue\`), so the source-import scan misses`);
  lines.push(`them entirely.`);
  lines.push('');
  if (eslintConfigReferences.size === 0) {
    lines.push(`_No ESLint config references to installed packages detected._`);
  } else {
    lines.push(`| Config file | Referenced packages |`);
    lines.push(`|---|---|`);
    const sortedEslintConfigs = [...eslintConfigReferences.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );
    for (const [configPath, referencedPackages] of sortedEslintConfigs) {
      const packageList = [...referencedPackages]
        .sort()
        .map((name) => `\`${name}\``)
        .join(', ');
      lines.push(`| \`${configPath}\` | ${packageList} |`);
    }
  }
  lines.push('');

  // ---------------------------------------------------------------------------
  // Lockfile transitive dependencies
  // ---------------------------------------------------------------------------
  lines.push(`## Transitive dependencies (lockfile)`);
  lines.push('');
  if (lockfilePackages.size === 0) {
    lines.push(`_No \`pnpm-lock.yaml\` found at the repo root, or it could not be parsed._`);
  } else {
    const directNames = new Set(aggregate.keys());
    const transitiveOnly = [...lockfilePackages.entries()].filter(
      ([name]) => !directNames.has(name),
    );
    lines.push(
      `Lockfile resolves **${lockfilePackages.size}** packages: ` +
        `**${lockfilePackages.size - transitiveOnly.length}** are direct ` +
        `dependencies declared in some \`package.json\`, ` +
        `**${transitiveOnly.length}** are transitive.`,
    );
    lines.push('');

    // why: showing the full transitive list would dump 800+ rows that
    // no human reads. Instead, surface only the transitive packages
    // that fall in a tracked category — this catches the case where
    // e.g. `socket.io` ships inside boardgame.io even though we never
    // declared it directly.
    const transitiveInTrackedCategories = transitiveOnly
      .filter(([name]) => PACKAGE_TO_CATEGORY.has(name))
      .sort(([a], [b]) => a.localeCompare(b));

    lines.push(`### Transitive packages matching tracked categories`);
    lines.push('');
    lines.push(`These are dependencies you did **not** declare directly`);
    lines.push(`but that pnpm resolved into the install tree. They are`);
    lines.push(`reachable at runtime, so a "category not adopted" line`);
    lines.push(`elsewhere in this report can still mean "we ship it`);
    lines.push(`transitively."`);
    lines.push('');
    if (transitiveInTrackedCategories.length === 0) {
      lines.push(`_None._`);
    } else {
      lines.push(`| Package | Category | Resolved version(s) |`);
      lines.push(`|---|---|---|`);
      for (const [packageName, versions] of transitiveInTrackedCategories) {
        const category = PACKAGE_TO_CATEGORY.get(packageName);
        const versionList = [...versions].sort().join(', ');
        lines.push(`| \`${packageName}\` | ${category} | ${versionList} |`);
      }
    }
  }
  lines.push('');

  // ---------------------------------------------------------------------------
  // Doc cross-reference
  // ---------------------------------------------------------------------------
  lines.push(`## Architecture-doc cross-reference`);
  lines.push('');
  lines.push(`Heuristic comparison: which package names appear in`);
  lines.push(`backticks inside the architecture docs vs. which are`);
  lines.push(`actually installed. Mismatches are not errors — docs may`);
  lines.push(`reference deferred items (e.g., Hanko) — but they are worth`);
  lines.push(`a reviewer's eye.`);
  lines.push('');

  const installedNames = new Set(aggregate.keys());
  lines.push(renderDocSection(
    'docs/ai/ARCHITECTURE.md',
    docMentionsArch,
    installedNames,
  ));
  lines.push(renderDocSection(
    'docs/02-ARCHITECTURE.md',
    docMentionsArch02,
    installedNames,
  ));

  lines.push(`## How to use this report`);
  lines.push('');
  lines.push(`1. Open this file alongside \`docs/02-ARCHITECTURE.md\`.`);
  lines.push(`2. Paste both into the gap-analysis prompt`);
  lines.push(`   (\`scripts/architecture-inventory.prompt.md\` if you keep`);
  lines.push(`   it, or the prompt in your prior chat) and ask for`);
  lines.push(`   prioritized recommendations.`);
  lines.push(`3. The "Declared but no source imports" table is the`);
  lines.push(`   highest-signal section — it surfaces deferred work and`);
  lines.push(`   accidental dependencies in seconds.`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Render the "Runtime & toolchain" section: Node and pnpm version
 * requirements, the packageManager pin, and the resolved versions of a
 * handful of load-bearing libraries that the rest of the architecture
 * depends on. This is the first thing a reviewer should see — it
 * frames everything that comes after.
 *
 * @param {Array<Awaited<ReturnType<typeof readManifest>>>} manifests
 * @param {Map<string, { versions: Set<string>, locations: any[] }>} aggregate
 * @returns {string}
 */
function renderRuntimeSection(manifests, aggregate) {
  const lines = [];
  const rootManifest = manifests.find((manifest) => manifest.relativePath === 'package.json');

  // why: the root manifest's engines block is the canonical
  // requirement for the whole repo. Per-package engines are unusual
  // and worth surfacing if they exist, but the root is the source of
  // truth for "what version of Node do I need to clone and run this."
  lines.push(`### Required runtimes`);
  lines.push('');
  lines.push(`| Runtime | Required | Source |`);
  lines.push(`|---|---|---|`);
  if (rootManifest) {
    const nodeRequirement = rootManifest.engines.node ?? '_(unspecified)_';
    const pnpmRequirement = rootManifest.engines.pnpm ?? '_(unspecified)_';
    const packageManagerPin = rootManifest.packageManager ?? '_(unspecified)_';
    lines.push(`| Node.js | \`${nodeRequirement}\` | \`package.json\` \`engines.node\` |`);
    lines.push(`| pnpm | \`${pnpmRequirement}\` | \`package.json\` \`engines.pnpm\` |`);
    lines.push(`| packageManager (Corepack pin) | \`${packageManagerPin}\` | \`package.json\` \`packageManager\` |`);
  } else {
    lines.push(`| _(root \`package.json\` not found)_ | — | — |`);
  }
  lines.push('');

  // why: workspaces sometimes pin their own engines that diverge from
  // the root (intentional or accidental). Listing them here turns a
  // hidden-but-painful drift into a one-glance check.
  const workspaceEngineDrift = manifests
    .filter((manifest) => manifest.relativePath !== 'package.json')
    .filter((manifest) => Object.keys(manifest.engines).length > 0);
  if (workspaceEngineDrift.length > 0) {
    lines.push(`### Per-workspace engine overrides`);
    lines.push('');
    lines.push(`| Workspace | Engines |`);
    lines.push(`|---|---|`);
    for (const manifest of workspaceEngineDrift) {
      const enginesText = Object.entries(manifest.engines)
        .map(([key, value]) => `${key} \`${value}\``)
        .join(', ');
      lines.push(`| \`${manifest.relativePath}\` | ${enginesText} |`);
    }
    lines.push('');
  }

  // why: a handful of libraries effectively define the runtime
  // contract for the rest of the architecture. Surfacing their
  // resolved version ranges saves the reviewer from spelunking the
  // category tables to confirm "are we still on Vue 3.4? still
  // boardgame.io 0.50?".
  const keyRuntimes = [
    ['Vue 3', 'vue'],
    ['boardgame.io', 'boardgame.io'],
    ['Pinia', 'pinia'],
    ['Vite', 'vite'],
    ['TypeScript', 'typescript'],
    ['Zod', 'zod'],
    ['node-postgres', 'pg'],
    ['@vue/test-utils', '@vue/test-utils'],
  ];
  const keyRuntimeRows = keyRuntimes
    .map(([label, packageName]) => {
      const entry = aggregate.get(packageName);
      if (entry === undefined) {
        return null;
      }
      return [label, packageName, [...entry.versions].join(', ')];
    })
    .filter((row) => row !== null);
  if (keyRuntimeRows.length > 0) {
    lines.push(`### Key library versions`);
    lines.push('');
    lines.push(`| Library | Package | Version(s) |`);
    lines.push(`|---|---|---|`);
    for (const [label, packageName, versionList] of keyRuntimeRows) {
      lines.push(`| ${label} | \`${packageName}\` | ${versionList} |`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Render the Language Footprint section: extension-classified language
 * counts, raw extension counts, and toolchain-vs-source presence
 * probes for non-Node languages. Facts only — no recommendations.
 *
 * @param {Awaited<ReturnType<typeof scanLanguageFootprint>>} languageFootprint
 * @returns {string}
 */
function renderLanguageFootprintSection(languageFootprint) {
  const { byLanguage, byExtension, markers } = languageFootprint;
  const lines = [];

  const scanRootsText = LANGUAGE_SCAN_ROOTS.map((root) => `\`${root}/\``).join(', ');
  lines.push(
    `Counts derived from on-disk file extensions under ${scanRootsText}` +
      ` (vendored / generated trees like \`node_modules\` and \`dist\` excluded).` +
      ` Extension-blind walk; \`package.json\` parsing not involved.`,
  );
  lines.push('');

  // why: sort by file count desc, then alphabetical for stable
  // output across runs when two languages tie. Both tables share
  // this comparator.
  const compareCountThenName = (a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  };

  lines.push(`### By language (extension-classified)`);
  lines.push('');
  const languageRows = [...byLanguage.entries()].sort(compareCountThenName);
  if (languageRows.length === 0) {
    lines.push(`_No language-classified files detected._`);
    lines.push('');
  } else {
    lines.push(`| Language | Files |`);
    lines.push(`|---|---:|`);
    for (const [language, count] of languageRows) {
      lines.push(`| ${language} | ${count} |`);
    }
    lines.push('');
  }

  lines.push(`### By extension (raw)`);
  lines.push('');
  const extensionRows = [...byExtension.entries()].sort(compareCountThenName);
  if (extensionRows.length === 0) {
    lines.push(`_No files with extensions detected._`);
    lines.push('');
  } else {
    lines.push(`| Extension | Files |`);
    lines.push(`|---|---:|`);
    for (const [extension, count] of extensionRows) {
      lines.push(`| \`${extension}\` | ${count} |`);
    }
    lines.push('');
  }

  lines.push(`### Toolchain vs source probes`);
  lines.push('');
  lines.push(
    `Whether each non-Node language's toolchain marker files and source-file` +
      ` extensions are present anywhere in the scanned tree (or at the repo root` +
      ` for markers like \`go.mod\`). "Toolchain present + source absent" means` +
      ` the build pipeline depends on this language but no source code in this` +
      ` repo is written in it (e.g. Hugo is a Go binary).`,
  );
  lines.push('');
  lines.push(`| Language | Toolchain marker present | Source files present |`);
  lines.push(`|---|---|---|`);
  for (const row of markers) {
    const toolchain = row.toolchainPresent ? 'yes' : 'no';
    const source = row.sourcePresent ? 'yes' : 'no';
    lines.push(`| ${row.language} | ${toolchain} | ${source} |`);
  }

  return lines.join('\n').trimEnd();
}

/**
 * Render the "Application stacks" preamble: one entry per app under
 * `apps/*`, narrating the stack synthesised from that app's declared
 * manifests. Surfaces which UI framework, state library, router,
 * bundler, game framework, transport, and database each app actually
 * pulls in. Includes non-Node apps (Hugo) by reading their
 * framework-specific manifests.
 *
 * Synthesis rules (all evidence-driven, no hardcoded labels):
 * - Description text is each Node workspace's own
 *   `package.json#description`.
 * - Direct deps are read from the workspace's `dependencies` /
 *   `devDependencies` so version numbers stay in sync with the manifest.
 * - The Socket.IO transport line is gated on the lockfile actually
 *   containing `socket.io` (it ships transitively via `boardgame.io`,
 *   not as a direct dep), so the report stays accurate if upstream
 *   ever swaps transports.
 * - Hugo apps (apps with no `package.json` but with `hugo.toml`) are
 *   appended via `synthesizeWikiViewerEntry` — Hugo binary version is
 *   read from `.hugo-version`, page count from the projection source,
 *   deploy target verified against `render.yaml`.
 *
 * @param {Array<Awaited<ReturnType<typeof readManifest>>>} manifests
 * @param {Map<string, Set<string>>} lockfilePackages
 * @returns {Promise<string>}
 */
async function renderApplicationStacksSection(manifests, lockfilePackages) {
  const apps = manifests.filter((manifest) =>
    manifest.relativePath.startsWith('apps/'),
  );
  if (apps.length === 0) {
    return '_No `apps/*` workspaces found._';
  }

  // why: boardgame.io 0.50 bundles Socket.IO as its default transport.
  // We don't want to claim "Socket.IO" if a future upgrade replaces it,
  // so confirm presence in the lockfile (where transitives live) before
  // naming it. socket.io / socket.io-client both count.
  const lockfileHasSocketIo =
    lockfilePackages.has('socket.io') || lockfilePackages.has('socket.io-client');

  const lines = [];
  for (const app of apps) {
    const directDeps = app.dependencies;
    const devDeps = app.devDependencies;
    const stackFacts = [];

    if (directDeps.vue !== undefined) {
      stackFacts.push(`Vue 3 SFCs (\`vue@${directDeps.vue}\`)`);
    }
    if (directDeps.pinia !== undefined) {
      stackFacts.push(`Pinia stores (\`pinia@${directDeps.pinia}\`)`);
    }
    if (directDeps['vue-router'] !== undefined) {
      stackFacts.push(`vue-router (\`vue-router@${directDeps['vue-router']}\`)`);
    }
    if (devDeps.vite !== undefined) {
      stackFacts.push(`Vite bundler (\`vite@${devDeps.vite}\`)`);
    }
    if (directDeps['boardgame.io'] !== undefined) {
      const bgioVersion = directDeps['boardgame.io'];
      const transportNote = lockfileHasSocketIo
        ? ' over Socket.IO (transitive via `boardgame.io`)'
        : '';
      stackFacts.push(`boardgame.io (\`boardgame.io@${bgioVersion}\`)${transportNote}`);
    }
    // why: boardgame.io's server entrypoint bundles Koa + @koa/router for
    // HTTP route registration. Server-side workspaces (boardgame.io
    // present without Vue) attach REST adapters to that router — e.g.
    // owner-profile / leaderboard / team routes per WP-102/103/104.
    // Client-side workspaces never see Koa — boardgame.io's client
    // entrypoint doesn't ship it. Versions come from the lockfile
    // because no workspace declares Koa directly.
    const isServerSideBgio =
      directDeps['boardgame.io'] !== undefined && directDeps.vue === undefined;
    if (isServerSideBgio && lockfilePackages.has('@koa/router')) {
      const koaRouterVersions = [...lockfilePackages.get('@koa/router')].join(', ');
      const koaVersionNote = lockfilePackages.has('koa')
        ? ` + \`koa@${[...lockfilePackages.get('koa')].join(', ')}\``
        : '';
      stackFacts.push(
        `HTTP routes via Koa router (\`@koa/router@${koaRouterVersions}\`${koaVersionNote}, both transitive via \`boardgame.io\`)`,
      );
    }
    if (directDeps.pg !== undefined) {
      stackFacts.push(`PostgreSQL via \`pg@${directDeps.pg}\``);
    }

    const description = app.description ?? '_(no description in package.json)_';
    const stackLine =
      stackFacts.length > 0
        ? stackFacts.join(' + ')
        : '_(no recognised framework deps — likely a CLI or pure Node app)_';
    const workspaceDirectory = app.relativePath.replace(/\/package\.json$/, '');
    lines.push(`- **\`${workspaceDirectory}\`** — ${description}`);
    lines.push(`  - Stack: ${stackLine}.`);
  }

  // why: append Hugo-built apps that have no `package.json` and so
  // never appear in the manifests list. Today this is just
  // `apps/wiki-viewer/`; if a second Hugo app ever lands, generalise
  // by scanning `apps/*` for `hugo.toml` instead of hardcoding the
  // single helper call.
  const wikiViewerEntry = await synthesizeWikiViewerEntry();
  if (wikiViewerEntry !== null) {
    lines.push(wikiViewerEntry);
  }

  return lines.join('\n');
}

/**
 * Synthesize a stack-line entry for the Hugo-built engineering wiki
 * viewer at `apps/wiki-viewer/`. This app has no `package.json` (Hugo
 * is a Go binary, not a Node dep), so the manifests-driven main loop
 * in `renderApplicationStacksSection` doesn't see it. The entry is
 * built from the app's own evidence: `.hugo-version` pin, the
 * presence of `hugo.toml`, the count of `wiki/*.md` source pages it
 * projects, and the Render service block in `render.yaml` that
 * deploys it.
 *
 * Returns null if `apps/wiki-viewer/` is not present, so removing the
 * wiki-viewer in the future degrades gracefully (the section just
 * drops the entry rather than emitting a stale claim or an error).
 *
 * @returns {Promise<string | null>}
 */
async function synthesizeWikiViewerEntry() {
  const appDirectory = join(REPO_ROOT, 'apps', 'wiki-viewer');
  if (!existsSync(appDirectory)) {
    return null;
  }

  // why: hugo.toml presence is what distinguishes this from a stray
  // empty directory under apps/. If hugo.toml is gone, the app is
  // effectively missing; surface that as a warning rather than emit
  // a confident-looking entry.
  const hugoConfigPath = join(appDirectory, 'hugo.toml');
  if (!existsSync(hugoConfigPath)) {
    return (
      `- **\`apps/wiki-viewer\`** — ⚠ _directory exists but \`hugo.toml\` ` +
      `not found; entry skipped to avoid emitting a stale stack claim._`
    );
  }

  const stackFacts = [];

  // why: Hugo version is pinned in `.hugo-version` per WP-139 / Open
  // Decision C. Reading it directly keeps this report in sync with
  // the binary CI installs and the value referenced in render.yaml's
  // buildCommand.
  const hugoVersionPath = join(appDirectory, '.hugo-version');
  if (existsSync(hugoVersionPath)) {
    const pinnedHugoVersion = (await readFile(hugoVersionPath, 'utf8')).trim();
    stackFacts.push(
      `Hugo Extended (\`hugo@${pinnedHugoVersion}\`, pinned in \`apps/wiki-viewer/.hugo-version\`)`,
    );
  } else {
    stackFacts.push('Hugo Extended ⚠ _(`.hugo-version` not found)_');
  }

  // why: D-13812 relocated the source from `docs/wiki/` to top-level
  // `wiki/`. Page count is informational; surfacing it lets a reviewer
  // see the wiki's growth without having to grep.
  const wikiSourceDirectory = join(REPO_ROOT, 'wiki');
  if (existsSync(wikiSourceDirectory)) {
    const sourceEntries = await readdir(wikiSourceDirectory, { withFileTypes: true });
    const sourcePageCount = sourceEntries.filter(
      (entry) => entry.isFile() && entry.name.endsWith('.md'),
    ).length;
    stackFacts.push(`${sourcePageCount} source pages projected from \`wiki/\``);
  } else {
    stackFacts.push('⚠ _`wiki/` source directory not found_');
  }

  // why: deployment target is locked under D-13811 (Render Static
  // Site). Confirm against render.yaml so a future redeploy posture
  // change surfaces here as drift rather than silent staleness.
  const renderYamlPath = join(REPO_ROOT, 'render.yaml');
  let deployFact;
  if (existsSync(renderYamlPath)) {
    const renderYamlContents = await readFile(renderYamlPath, 'utf8');
    if (renderYamlContents.includes('legendary-arena-wiki')) {
      deployFact = 'deployed as Render Static Site `legendary-arena-wiki`';
    } else {
      deployFact = '⚠ _no `legendary-arena-wiki` service block found in `render.yaml`_';
    }
  } else {
    deployFact = '⚠ _`render.yaml` not found_';
  }
  stackFacts.push(deployFact);

  const lines = [];
  lines.push(
    `- **\`apps/wiki-viewer\`** — Engineering wiki build pipeline. ` +
      `Build-time, read-only Hugo projection of \`wiki/\` (no \`package.json\` ` +
      `— Hugo is a Go binary, not a Node dep). Layer-boundary clean: zero ` +
      `runtime imports of \`@legendary-arena/game-engine\`, ` +
      `\`@legendary-arena/registry\`, or \`apps/server\`. Build pipeline is ` +
      `\`pnpm wiki-viewer:project\` (copy \`wiki/*.md\` → ` +
      `\`apps/wiki-viewer/content/\`) → \`pnpm wiki-viewer:check-links\` ` +
      `(case-sensitive internal-link gate) → \`hugo --minify\`.`,
  );
  lines.push(`  - Stack: ${stackFacts.join(' + ')}.`);
  return lines.join('\n');
}

/**
 * Render the "First-party subsystems" section: internally-built
 * modules of architectural significance that don't surface in the
 * library/category tables (because they aren't libraries) or the
 * Application stacks section (because they live inside `packages/*`,
 * not `apps/*`).
 *
 * For each subsystem the section emits: name, owning WP, on-disk
 * location, description, and a verified contract surface. "Verified"
 * means: every symbol in `contractSymbols` is checked against actual
 * `export` declarations across the subsystem's files. A missing
 * symbol surfaces as a drift warning so the report can't quietly go
 * stale when a function gets renamed.
 *
 * The directory's existence is also confirmed; a missing location
 * surfaces as a top-level warning rather than silently emitting an
 * entry that doesn't reflect reality.
 *
 * @returns {Promise<string>}
 */
async function renderFirstPartySubsystemsSection() {
  if (FIRST_PARTY_SUBSYSTEMS.length === 0) {
    return '_No first-party subsystems registered._';
  }

  const lines = [];
  for (const subsystem of FIRST_PARTY_SUBSYSTEMS) {
    const absoluteLocation = join(REPO_ROOT, subsystem.location);
    const owningWpAbsolute = join(REPO_ROOT, subsystem.owningWpPath);
    const wpExists = existsSync(owningWpAbsolute);
    const wpCell = wpExists
      ? `[${subsystem.owningWp}](${subsystem.owningWpPath})`
      : `${subsystem.owningWp} ⚠ _(work packet file not found at \`${subsystem.owningWpPath}\`)_`;

    lines.push(`### ${subsystem.name}`);
    lines.push('');
    lines.push(`- **Location:** \`${subsystem.location}\``);
    lines.push(`- **Owning work packet:** ${wpCell}`);
    lines.push('');
    lines.push(subsystem.description);
    lines.push('');

    if (!existsSync(absoluteLocation)) {
      lines.push(
        `⚠ _Subsystem directory not found at \`${subsystem.location}\` — ` +
          `the entry in \`FIRST_PARTY_SUBSYSTEMS\` may be stale._`,
      );
      lines.push('');
      continue;
    }

    // why: read every TS / JS file directly under the subsystem
    // directory once, collect the union of exported symbol names, then
    // verify each contract symbol against that set. Catches renames
    // and removals without hand-editing the script.
    const exportedSymbols = await collectExportedSymbols(absoluteLocation);
    const contractRows = subsystem.contractSymbols.map((symbol) => {
      const present = exportedSymbols.has(symbol);
      const presenceCell = present ? 'present' : '⚠ missing';
      return `| \`${symbol}\` | ${presenceCell} |`;
    });

    lines.push(`**Contract surface (verified against on-disk exports):**`);
    lines.push('');
    lines.push(`| Symbol | Status |`);
    lines.push(`|---|---|`);
    for (const row of contractRows) {
      lines.push(row);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

/**
 * Walk the immediate (non-recursive) contents of a directory and
 * return the union set of exported symbol names declared across every
 * `.ts` / `.tsx` / `.mjs` / `.js` file.
 *
 * Recognises:
 * - `export function|class|interface|type|const|let|var|enum <name>`
 * - `export async function <name>`
 * - `export { foo, bar as baz }` (the exported name — `baz` here)
 *
 * Does NOT chase `export *` re-exports; subsystem entries should
 * declare their contract symbols at the location where they're
 * defined, not where they're funnelled through a barrel.
 *
 * @param {string} directory
 * @returns {Promise<Set<string>>}
 */
async function collectExportedSymbols(directory) {
  const symbols = new Set();
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return symbols;
  }
  // why: keep this non-recursive on purpose. A subsystem's contract
  // surface should live at its top level; nested helpers are
  // implementation detail and not part of the verified API.
  const directDeclarationPattern =
    /^export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var|enum|abstract\s+class)\s+(\w+)/gm;
  const reExportPattern = /^export\s*\{([^}]+)\}/gm;
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const dotIndex = entry.name.lastIndexOf('.');
    if (dotIndex === -1) {
      continue;
    }
    const extension = entry.name.slice(dotIndex);
    if (extension !== '.ts' && extension !== '.tsx' && extension !== '.mjs' && extension !== '.js') {
      continue;
    }
    let contents;
    try {
      contents = await readFile(join(directory, entry.name), 'utf8');
    } catch {
      continue;
    }
    let match;
    directDeclarationPattern.lastIndex = 0;
    while ((match = directDeclarationPattern.exec(contents)) !== null) {
      symbols.add(match[1]);
    }
    reExportPattern.lastIndex = 0;
    while ((match = reExportPattern.exec(contents)) !== null) {
      const names = match[1].split(',');
      for (const rawName of names) {
        const trimmed = rawName.trim();
        // why: `export { foo as bar }` — the externally-visible name
        // is `bar`, not `foo`. Strip default-export markers too.
        const aliasMatch = /\bas\s+(\w+)\s*$/.exec(trimmed);
        if (aliasMatch !== null) {
          symbols.add(aliasMatch[1]);
          continue;
        }
        const plainMatch = /^(\w+)/.exec(trimmed);
        if (plainMatch !== null) {
          symbols.add(plainMatch[1]);
        }
      }
    }
  }
  return symbols;
}

/**
 * Render the "Importance tiering" section: pivots the same dep data
 * the category tables show, but cut by *blast radius if removed*
 * instead of by concern. Three tiers come from `IMPORTANCE_DEFINITIONS`:
 * Foundational, Adopted, Tooling.
 *
 * For each tier-listed entry we resolve its install state in three
 * passes:
 * - Direct dep:  found in `aggregate` — render with declared version(s)
 *   and the workspaces that declare it.
 * - Transitive:  not in `aggregate` but present in `lockfilePackages`
 *   and the entry carries a `transitiveVia` annotation — render with
 *   the lockfile-resolved version and a "(transitive via X)" note.
 * - Missing:     in neither — flag with a ⚠ so a stale curation entry
 *   surfaces immediately on the next inventory run.
 *
 * After the three tier tables, a "Not yet classified" bucket lists
 * every package in `aggregate` that has no entry in `PACKAGE_TO_IMPORTANCE`.
 * That keeps the curation gap visible without forcing the curator to
 * diff `aggregate` against the importance map by hand.
 *
 * @param {Map<string, { versions: Set<string>, locations: any[] }>} aggregate
 * @param {Map<string, number>} importCounts
 * @param {Map<string, Set<string>>} lockfilePackages
 * @returns {string}
 */
function renderImportanceSection(aggregate, importCounts, lockfilePackages) {
  const lines = [];
  for (const [tierLabel, entries] of IMPORTANCE_DEFINITIONS) {
    lines.push(`### ${tierLabel}`);
    lines.push('');
    if (entries.length === 0) {
      lines.push(`_No packages classified in this tier._`);
      lines.push('');
      continue;
    }
    lines.push(`| Package | Version(s) | Adoption | Files importing |`);
    lines.push(`|---|---|---|---:|`);
    // why: stable alphabetical ordering by package name keeps the
    // diff between two inventory runs minimal — only real changes
    // surface, not row-shuffle noise.
    const normalized = entries
      .map((entry) =>
        typeof entry === 'string'
          ? { name: entry, transitiveVia: null }
          : { name: entry.name, transitiveVia: entry.transitiveVia ?? null },
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const { name, transitiveVia } of normalized) {
      const directInfo = aggregate.get(name);
      if (directInfo !== undefined) {
        const versionList = [...directInfo.versions].join(', ');
        const importCount = importCounts.get(name) ?? 0;
        const usageCell = renderUsageCell(importCount, name, directInfo);
        // why: list the unique workspaces that declare the package,
        // not every (workspace, scope) pair — the importance section
        // is summary-grain, not the full Declared-in detail of the
        // category tables. The category section already provides that.
        const declaringWorkspaces = [
          ...new Set(directInfo.locations.map((loc) => loc.manifest)),
        ];
        const workspaceList = declaringWorkspaces
          .map((manifest) => `\`${manifest}\``)
          .join(', ');
        lines.push(
          `| \`${name}\` | ${versionList} | direct dep — ${workspaceList} | ${usageCell} |`,
        );
        continue;
      }
      const lockfileVersions = lockfilePackages.get(name);
      if (lockfileVersions !== undefined) {
        const versionList = [...lockfileVersions].join(', ');
        // why: a transitive dep has zero direct imports by definition
        // (no workspace declared it, so no source file imports it via
        // its own dep chain), but it can still be reached via the
        // parent package — render an empty usage cell rather than the
        // misleading "0 ⚠" anomaly badge.
        const transitiveSource =
          transitiveVia !== null
            ? `transitive via \`${transitiveVia}\``
            : `transitive (lockfile only — declarer not annotated)`;
        lines.push(
          `| \`${name}\` | ${versionList} | ${transitiveSource} | _(transitive)_ |`,
        );
        continue;
      }
      lines.push(
        `| \`${name}\` | — | ⚠ not installed (curation entry stale) | — |`,
      );
    }
    lines.push('');
  }

  // why: surface the curation gap so reviewers can see what's NOT yet
  // classified. Anything in aggregate without a PACKAGE_TO_IMPORTANCE
  // entry lands here. Same pattern as the category section's
  // "Other / uncategorized" bucket — explicit > implicit.
  //
  // First-party workspace packages (`@legendary-arena/*`) are filtered
  // out: importance tiering describes blast radius of *external*
  // libraries, not of the project's own internal modules. The
  // `## First-party subsystems` section near the top of the report is
  // the right place to reason about internal modules' significance.
  const unclassified = [];
  for (const [packageName] of aggregate) {
    if (packageName.startsWith('@legendary-arena/')) {
      continue;
    }
    if (!PACKAGE_TO_IMPORTANCE.has(packageName)) {
      unclassified.push(packageName);
    }
  }
  unclassified.sort();
  lines.push(`### Not yet classified`);
  lines.push('');
  if (unclassified.length === 0) {
    lines.push(`_Every installed package is classified into one of the three tiers above._`);
    lines.push('');
    return lines.join('\n').trimEnd();
  }
  lines.push(`Packages declared in some \`package.json\` but not yet placed`);
  lines.push(`into Foundational / Adopted / Tooling. Add to`);
  lines.push(`\`IMPORTANCE_DEFINITIONS\` near the top of the script when any`);
  lines.push(`of these become load-bearing for the architecture.`);
  lines.push('');
  for (const packageName of unclassified) {
    lines.push(`- \`${packageName}\``);
  }
  lines.push('');
  return lines.join('\n').trimEnd();
}

/**
 * Format the import-count cell with a usage badge so a reviewer can
 * skim the table without doing math.
 *
 * @param {number} importCount
 * @param {string} packageName
 * @param {{ locations: any[] }} info
 * @returns {string}
 */
function renderUsageCell(importCount, packageName, info) {
  if (importCount === 0) {
    if (isExpectedZeroImport(packageName, info)) {
      return `0 _(tooling)_`;
    }
    return `0 ⚠`;
  }
  if (importCount < 3) {
    return `${importCount} _(minimal)_`;
  }
  if (importCount < 15) {
    return `${importCount} _(partial)_`;
  }
  return `${importCount} _(comprehensive)_`;
}

/**
 * Many tools never appear in `import` statements — they run from the
 * CLI or as build plugins resolved by config. Suppressing the "unused"
 * warning for these prevents noise and keeps the anomaly section
 * trustworthy.
 *
 * @param {string | undefined} packageName
 * @param {{ locations: Array<{ scope: string }> }} info
 * @returns {boolean}
 */
function isExpectedZeroImport(packageName, info) {
  const tooling = new Set([
    'typescript',
    'vue-tsc',
    'tsx',
    'esbuild',
    'eslint',
    'prettier',
    'vite',
    '@vitejs/plugin-vue',
    'vitest',
    'happy-dom',
    'jsdom',
    'autoprefixer',
    'postcss',
    'tailwindcss',
    'unocss',
    '@vue/eslint-config-typescript',
    'eslint-plugin-vue',
    'eslint-plugin-vuejs-accessibility',
    '@playwright/test',
    'playwright',
    '@types/node',
  ]);
  if (packageName && tooling.has(packageName)) {
    return true;
  }
  // why: @types/* packages ship type declarations only and are never
  // imported at runtime, so they should not trigger the "unused" flag.
  if (packageName && packageName.startsWith('@types/')) {
    return true;
  }
  return false;
}

function shortScope(scopeName) {
  if (scopeName === 'dependencies') return 'dep';
  if (scopeName === 'devDependencies') return 'dev';
  if (scopeName === 'peerDependencies') return 'peer';
  return scopeName;
}

/**
 * Render a sub-section comparing one architecture doc's package
 * mentions to what is actually installed.
 *
 * @param {string} docLabel
 * @param {Set<string>} mentioned
 * @param {Set<string>} installed
 * @returns {string}
 */
function renderDocSection(docLabel, mentioned, installed) {
  const mentionedNotInstalled = [...mentioned]
    .filter((name) => !installed.has(name))
    .sort();
  const installedNotMentioned = [...installed]
    .filter((name) => mentioned.has(name) === false && PACKAGE_TO_CATEGORY.has(name))
    .sort();
  const lines = [];
  lines.push(`### \`${docLabel}\``);
  lines.push('');
  if (mentioned.size === 0) {
    lines.push(`_Doc not found or no package-shaped tokens detected._`);
    lines.push('');
    return lines.join('\n');
  }
  lines.push(`- Package mentions in doc: **${mentioned.size}**`);
  lines.push(`- Mentioned in doc but not installed: **${mentionedNotInstalled.length}**`);
  if (mentionedNotInstalled.length > 0) {
    lines.push('');
    for (const name of mentionedNotInstalled) {
      lines.push(`  - \`${name}\``);
    }
  }
  lines.push('');
  lines.push(`- Installed but never mentioned in doc: **${installedNotMentioned.length}**`);
  if (installedNotMentioned.length > 0) {
    lines.push('');
    for (const name of installedNotMentioned) {
      lines.push(`  - \`${name}\``);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const outputTarget = parseOutputTarget(argv.slice(2));

  const manifestPaths = await discoverWorkspaceManifests();
  const manifests = [];
  for (const manifestPath of manifestPaths) {
    try {
      manifests.push(await readManifest(manifestPath));
    } catch (failure) {
      const relPath = relative(REPO_ROOT, manifestPath);
      throw new Error(
        `Failed to parse package manifest \`${relPath}\`: ${failure.message}`,
      );
    }
  }

  const aggregate = aggregateDependencies(manifests);
  const allPackageNames = [...aggregate.keys()];
  const importCounts = await countImportsPerPackage(allPackageNames);

  // why: tsconfig / eslint config / lockfile parsing each run
  // independently of the source-import scan. Each individually
  // completes in well under a second on this repo, so sequential
  // keeps the control flow obvious.
  const tsconfigReferences = await scanTsconfigReferences(allPackageNames);
  const eslintConfigReferences = await scanEslintConfigReferences(allPackageNames);
  const lockfilePackages = await parseLockfilePackages(
    join(REPO_ROOT, 'pnpm-lock.yaml'),
  );

  // why: extension-blind walk of `apps/`, `packages/`, `scripts/`, and
  // `wiki/` to count files per language. Independent of the import
  // scan; runs in well under a second.
  const languageFootprint = await scanLanguageFootprint();

  // why: bump the import counts for any package referenced by a
  // config file so the per-category usage badge is accurate. Without
  // this, `@vue/tsconfig` and `eslint-plugin-vue` etc. would still
  // read "0 ⚠" in their category tables even though the Anomalies
  // section would correctly exclude them.
  for (const referencedSet of tsconfigReferences.values()) {
    for (const packageName of referencedSet) {
      importCounts.set(packageName, (importCounts.get(packageName) ?? 0) + 1);
    }
  }
  for (const referencedSet of eslintConfigReferences.values()) {
    for (const packageName of referencedSet) {
      importCounts.set(packageName, (importCounts.get(packageName) ?? 0) + 1);
    }
  }

  const docMentionsArch = await extractMentionedPackages(
    join(REPO_ROOT, 'docs', 'ai', 'ARCHITECTURE.md'),
  );
  const docMentionsArch02 = await extractMentionedPackages(
    join(REPO_ROOT, 'docs', '02-ARCHITECTURE.md'),
  );

  const reportMarkdown = await renderReport({
    manifests,
    aggregate,
    importCounts,
    tsconfigReferences,
    eslintConfigReferences,
    lockfilePackages,
    languageFootprint,
    docMentionsArch,
    docMentionsArch02,
  });

  if (outputTarget === null) {
    stdout.write(reportMarkdown);
    if (!reportMarkdown.endsWith('\n')) {
      stdout.write('\n');
    }
    return;
  }

  // why: a casual `--out some/new/dir/report.md` should just work. Node's
  // writeFile errors with ENOENT when the parent directory is missing,
  // and forcing the user to mkdir first is needless friction for a
  // reporting tool. recursive:true is a no-op when the directory exists.
  await mkdir(dirname(outputTarget), { recursive: true });
  await writeFile(outputTarget, reportMarkdown, 'utf8');
  // why: print the path relative to the caller's shell so it matches
  // what they typed. Showing the repo-relative path here would be
  // confusing when the script is invoked from outside the repo.
  stdout.write(`Architecture inventory written to ${relative(cwd(), outputTarget)}\n`);
}

main().catch((failure) => {
  // why: the inventory is a reporting tool — surface the error with
  // context but avoid stack-trace noise for the common case where a
  // manifest is malformed. Exit 1 so CI / pnpm scripts fail visibly.
  stdout.write(`architecture-inventory failed: ${failure.message}\n`);
  exit(1);
});
