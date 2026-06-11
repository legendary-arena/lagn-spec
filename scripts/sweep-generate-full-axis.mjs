#!/usr/bin/env node
/**
 * Full-corpus sweep axis fixture regenerator (WP-234 / EC-267).
 *
 * Regenerates the two committed full-corpus axis fixtures from the in-repo
 * card data:
 *
 *   - `data/sweep-fixtures/scheme-ids.full.json`     (191 scheme ext_ids)
 *   - `data/sweep-fixtures/mastermind-ids.full.json` (106 mastermind ext_ids)
 *
 * The operator runs this (`pnpm sweep:generate-axis`) whenever a card set is
 * added or its schemes / masterminds change, so the weekly sweep's rotation
 * axis stays in step with the corpus. The output is byte-deterministic
 * (ascending-lexicographic, de-duplicated, `JSON.stringify(array, null, 2)`
 * with a single trailing newline), so a no-op regeneration produces an empty
 * `git diff`.
 *
 * IMPORTANT — ext_id derivation (reconciled during WP-234 execution):
 * the card JSON files do NOT carry a literal `ext_id` field on schemes or
 * masterminds. The canonical ext_id is composed as `<set.abbr>/<entry.slug>`
 * — e.g. the `core` set's `midtown-bank-robbery` scheme → the ext_id
 * `core/midtown-bank-robbery`. That is exactly the form the committed 2×2
 * smoke fixtures and the engine setup composition already use, and `abbr`
 * equals the set's filename stem for every set, so the composed ext_ids are
 * globally unique. WP-234 §Scope B / EC-267 described this as reading a
 * `schemes[].ext_id` field; the field does not exist, so the generator
 * composes the ext_id instead (the locked output — ascending unique ext_id
 * strings per D-23401 — is unchanged).
 *
 * No new npm dependency: built-in `node:*` only. The card-data path mirrors
 * the registry's `data/cards/*.json` layout (see CLAUDE.md §External Data).
 *
 * Authority: WP-234 §Scope (B) + §Locked Contract Values (axis regeneration
 * determinism); EC-267 §Fixtures; D-23401 (canonical scheme-axis order lock).
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// why: __dirname is unavailable in ESM; reconstruct from import.meta.url so the
// script anchors its card-data + fixture paths relative to itself regardless of
// the cwd it is invoked from. The sweep runner uses the same trick.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const CARD_DATA_DIRECTORY = join(REPO_ROOT, 'data', 'cards');
const SWEEP_FIXTURES_DIRECTORY = join(REPO_ROOT, 'data', 'sweep-fixtures');
const SCHEME_AXIS_FIXTURE_PATH = join(SWEEP_FIXTURES_DIRECTORY, 'scheme-ids.full.json');
const MASTERMIND_AXIS_FIXTURE_PATH = join(SWEEP_FIXTURES_DIRECTORY, 'mastermind-ids.full.json');

/**
 * Composes the canonical ascending-sorted, de-duplicated ext_id array for one
 * card category (`schemes` or `masterminds`) across every set.
 *
 * Each ext_id is `<set.abbr>/<entry.slug>`. Duplicates (which would only arise
 * from malformed data, since `abbr` is unique per set and slugs are unique
 * within a set) are collapsed by exact string match. The result is sorted
 * ascending lexicographically — that order is the locked rotation/shard
 * coordinate system (D-23401), so a stable comparator is load-bearing.
 *
 * Pure: takes already-parsed set objects (no file IO) so the helper is
 * unit-testable directly.
 *
 * @param {ReadonlyArray<Record<string, unknown>>} sets - Parsed card-set objects.
 * @param {'schemes' | 'masterminds'} categoryKey - Which card array to walk.
 * @returns {string[]} Ascending-sorted unique ext_id strings.
 */
export function collectSortedUniqueExtIds(sets, categoryKey) {
  const seenExtIds = new Set();
  const extIds = [];
  for (const set of sets) {
    const setAbbreviation = set.abbr;
    if (typeof setAbbreviation !== 'string' || setAbbreviation.length === 0) {
      throw new Error(
        'Axis generation found a card set with a missing or empty "abbr" field; every set must carry a non-empty abbr so ext_ids can be composed as <abbr>/<slug>.',
      );
    }
    const entries = set[categoryKey];
    if (entries === undefined) {
      continue;
    }
    if (!Array.isArray(entries)) {
      throw new Error(
        `Axis generation found set "${setAbbreviation}" whose "${categoryKey}" property is not an array; expected an array of card entries each carrying a slug.`,
      );
    }
    for (const entry of entries) {
      const entrySlug = entry === null || typeof entry !== 'object' ? undefined : entry.slug;
      if (typeof entrySlug !== 'string' || entrySlug.length === 0) {
        throw new Error(
          `Axis generation found a ${categoryKey} entry in set "${setAbbreviation}" with a missing or empty "slug"; every entry must carry a non-empty slug to compose its ext_id.`,
        );
      }
      const extId = `${setAbbreviation}/${entrySlug}`;
      if (seenExtIds.has(extId)) {
        continue;
      }
      seenExtIds.add(extId);
      extIds.push(extId);
    }
  }
  // why: ascending lexicographic (default UTF-16 string compare) is the locked
  // canonical rotation order (D-23401) — the committed array order is the
  // window/shard coordinate system, so reordering it silently shifts coverage.
  extIds.sort();
  return extIds;
}

/**
 * Reads and parses every `*.json` card set under `data/cards/`. Throws a
 * full-sentence error on an unreadable directory, an unreadable file, or
 * invalid JSON.
 *
 * @returns {Promise<Array<Record<string, unknown>>>} Parsed set objects.
 */
async function readAllCardSets() {
  let fileNames;
  try {
    fileNames = await readdir(CARD_DATA_DIRECTORY);
  } catch (directoryError) {
    throw new Error(
      `Axis generation failed to read the card-data directory at "${CARD_DATA_DIRECTORY}": ${directoryError.message}. Verify the path exists and is readable.`,
    );
  }
  const jsonFileNames = fileNames.filter((fileName) => fileName.endsWith('.json')).sort();
  if (jsonFileNames.length === 0) {
    throw new Error(
      `Axis generation found no *.json card sets under "${CARD_DATA_DIRECTORY}"; the corpus is empty so no axis can be generated.`,
    );
  }
  const sets = [];
  for (const fileName of jsonFileNames) {
    const filePath = join(CARD_DATA_DIRECTORY, fileName);
    let contents;
    try {
      contents = await readFile(filePath, 'utf8');
    } catch (readError) {
      throw new Error(
        `Axis generation failed to read the card set at "${filePath}": ${readError.message}. Verify the file is readable.`,
      );
    }
    try {
      sets.push(JSON.parse(contents));
    } catch (parseError) {
      throw new Error(
        `Axis generation failed to parse the card set at "${filePath}" as JSON: ${parseError.message}. Verify the file contains valid JSON.`,
      );
    }
  }
  return sets;
}

/**
 * Reads the corpus, composes both axes, and writes the two fixtures with the
 * locked byte-deterministic serialization (`JSON.stringify(array, null, 2)`
 * plus a single trailing newline).
 */
async function main() {
  const sets = await readAllCardSets();
  const schemeExtIds = collectSortedUniqueExtIds(sets, 'schemes');
  const mastermindExtIds = collectSortedUniqueExtIds(sets, 'masterminds');
  // why: the trailing newline + 2-space indent is the locked serialization
  // (D-23401 axis-regeneration determinism); changing it would dirty the
  // committed fixtures on every regeneration even when the corpus is unchanged.
  await writeFile(SCHEME_AXIS_FIXTURE_PATH, `${JSON.stringify(schemeExtIds, null, 2)}\n`, 'utf8');
  await writeFile(MASTERMIND_AXIS_FIXTURE_PATH, `${JSON.stringify(mastermindExtIds, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `sweep-generate-full-axis: wrote ${schemeExtIds.length} scheme ext_ids to ${SCHEME_AXIS_FIXTURE_PATH} and ${mastermindExtIds.length} mastermind ext_ids to ${MASTERMIND_AXIS_FIXTURE_PATH}.\n`,
  );
}

// why: run main() only when this file is the process entry point so the unit
// test can import collectSortedUniqueExtIds without triggering a fixture write.
const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) {
  main().catch((unhandledError) => {
    const errorMessage = unhandledError instanceof Error ? unhandledError.message : String(unhandledError);
    process.stderr.write(`sweep-generate-full-axis: ${errorMessage}\n`);
    process.exit(1);
  });
}
