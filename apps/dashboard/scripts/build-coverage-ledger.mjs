#!/usr/bin/env node
/**
 * build-coverage-ledger.mjs — Build-time copy of the committed hero mechanic
 * ledger into the dashboard bundle.
 *
 * Reads `docs/ai/coverage/hero-mechanic-ledger.json` (the canonical generated
 * ledger — kept fresh by `pnpm ledger:heroes` + the `ledger:heroes:check` CI
 * gate) and writes `apps/dashboard/src/data/coverage-ledger.json` (gitignored;
 * regenerated every dashboard build, mirroring build-governance-snapshot.mjs).
 *
 * The dashboard cannot statically import a file outside its package root, so the
 * data is copied into `src/data` at build time and imported by
 * `useCoverageLedger`. On any read/parse failure this writes an empty-ledger
 * stub (with an `error` field) and exits 0 — aborting the build is strictly
 * worse for the operator than an empty-state Coverage page.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DASHBOARD_DIR, '..', '..');
const SOURCE_PATH = join(REPO_ROOT, 'docs/ai/coverage/hero-mechanic-ledger.json');
const OUTPUT_PATH = join(DASHBOARD_DIR, 'src/data/coverage-ledger.json');

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

/**
 * Reads + validates the canonical ledger and copies it into the dashboard
 * bundle; on any failure writes the empty stub and exits 0.
 */
async function main() {
  try {
    const raw = await readFile(SOURCE_PATH, 'utf-8');
    // why: validate it parses before copying, so a corrupt source never lands
    // a broken JSON import into the dashboard bundle.
    JSON.parse(raw);
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf-8');
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'unknown read failure';
    process.stderr.write(
      `coverage-ledger copy warning: could not read/parse ${SOURCE_PATH} (detail: ${detail}); ` +
        'writing an empty-ledger stub so the Coverage page renders its empty state rather than failing the build.\n',
    );
    try {
      await mkdir(dirname(OUTPUT_PATH), { recursive: true });
      const stub = { ...EMPTY_LEDGER_STUB, error: String(detail).slice(0, 240) };
      await writeFile(OUTPUT_PATH, `${JSON.stringify(stub, null, 2)}\n`, 'utf-8');
    } catch {
      // why: best-effort write — even if persistence fails we exit 0 so the
      // build runner stays alive; the page renders its load-error state.
    }
  }
}

await main();
