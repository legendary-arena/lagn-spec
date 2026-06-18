#!/usr/bin/env node
/**
 * build-coverage-ledger.mjs — Build-time copy of the committed coverage
 * artifacts into the dashboard bundle.
 *
 * Copies two canonical generated artifacts into gitignored `src/data` (the
 * dashboard cannot statically import a file outside its package root, so the
 * data is copied in at build time and imported by `useCoverageLedger`):
 *   - docs/ai/coverage/hero-mechanic-ledger.json     → src/data/coverage-ledger.json
 *   - docs/ai/coverage/runtime-observed-hollows.json → src/data/runtime-observed-hollows.json  (WP-259)
 *
 * On any read/parse failure for an artifact this writes that artifact's empty
 * stub (with an `error` field) and continues — aborting the build is strictly
 * worse for the operator than an empty-state Coverage page. The dashboard
 * `build` script already invokes this, so the WP-259 overlay needs no
 * package.json change.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DASHBOARD_DIR, '..', '..');

const LEDGER_SOURCE_PATH = join(REPO_ROOT, 'docs/ai/coverage/hero-mechanic-ledger.json');
const LEDGER_OUTPUT_PATH = join(DASHBOARD_DIR, 'src/data/coverage-ledger.json');
const RUNTIME_SOURCE_PATH = join(REPO_ROOT, 'docs/ai/coverage/runtime-observed-hollows.json');
const RUNTIME_OUTPUT_PATH = join(DASHBOARD_DIR, 'src/data/runtime-observed-hollows.json');

const EMPTY_LEDGER_STUB = {
  schemaVersion: 1,
  cardType: 'hero',
  summary: {
    totalRows: 0,
    byStatus: { executable: 0, deferred: 0, unsupported: 0, unmarked: 0 },
    distinctMechanics: 0,
  },
  rows: [],
};

// why (WP-259): mirrors the runtime-observed-hollows artifact shape so the
// Coverage overlay renders its "not observed in play" empty state rather than
// failing the build when the artifact is missing (e.g. a clean tree before the
// harness has run). The three byReason keys are the closed WP-257 hollow set.
const EMPTY_RUNTIME_STUB = {
  schemaVersion: 1,
  generatedFrom: { runSeed: '', gamesPlayed: 0, matrixDescription: '' },
  summary: {
    distinctMechanics: 0,
    totalObservations: 0,
    hollowEffectsDropped: 0,
    byReason: { 'no-handler': 0, 'unsupported-keyword': 0, 'parse-unrecognized': 0 },
  },
  byMechanic: {},
};

/**
 * Copies one canonical artifact into the dashboard bundle; on any failure writes
 * the supplied empty stub (with an `error` field) and resolves — never throws,
 * so one missing artifact cannot abort the build or block the other copy.
 *
 * @param {string} sourcePath - the committed canonical artifact path.
 * @param {string} outputPath - the gitignored dashboard `src/data` copy path.
 * @param {object} emptyStub - the artifact-shaped fallback written on failure.
 */
async function copyArtifact(sourcePath, outputPath, emptyStub) {
  try {
    const raw = await readFile(sourcePath, 'utf-8');
    // why: validate it parses before copying, so a corrupt source never lands a
    // broken JSON import into the dashboard bundle.
    JSON.parse(raw);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf-8');
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'unknown read failure';
    process.stderr.write(
      `coverage artifact copy warning: could not read/parse ${sourcePath} (detail: ${detail}); ` +
        'writing an empty stub so the Coverage page renders its empty state rather than failing the build.\n',
    );
    try {
      await mkdir(dirname(outputPath), { recursive: true });
      const stub = { ...emptyStub, error: String(detail).slice(0, 240) };
      await writeFile(outputPath, `${JSON.stringify(stub, null, 2)}\n`, 'utf-8');
    } catch {
      // why: best-effort write — even if persistence fails we continue so the
      // build runner stays alive; the page renders its load-error state.
    }
  }
}

await copyArtifact(LEDGER_SOURCE_PATH, LEDGER_OUTPUT_PATH, EMPTY_LEDGER_STUB);
await copyArtifact(RUNTIME_SOURCE_PATH, RUNTIME_OUTPUT_PATH, EMPTY_RUNTIME_STUB);
