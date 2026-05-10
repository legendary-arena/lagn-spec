#!/usr/bin/env node
/**
 * generate-rename-scripts.mjs
 *
 * Updates the per-set rename-{abbr}-images.ps1 scripts in the staging repo
 * to use the v16 cardSlug-based hero card image filenames.
 *
 * For each set with a `data/cards/{abbr}.json` file AND a corresponding
 * `rename-{abbr}-images.ps1` in the staging repo, this script scans the
 * .ps1 for hero-card lines matching the OLD pattern
 *
 *     {abbr}-hr-{heroSlug}-{cost}{rarityCode}{slot}.webp
 *
 * and rewrites them to the NEW pattern
 *
 *     {abbr}-hr-{heroSlug}-{cardSlug}.webp
 *
 * The lookup is built from the canonical card JSON (cost + rarityLabel + slot
 * uniquely identify a card within a hero's deck). Non-hero lines (villains,
 * masterminds, schemes, henchmen, bystanders) are left untouched — they
 * already use card slugs.
 *
 * Why a generator instead of manually maintaining 40 scripts: any future card
 * rename or data correction in `data/cards/{abbr}.json` (or upstream patches)
 * automatically flows into the rename scripts on the next run. The .ps1
 * files become derived artifacts, not hand-maintained code.
 *
 * Usage:
 *   node scripts/convert-cards/generate-rename-scripts.mjs
 *   node scripts/convert-cards/generate-rename-scripts.mjs --output-dir <path>
 *   node scripts/convert-cards/generate-rename-scripts.mjs --dry-run
 *
 * Defaults: output-dir resolves to
 *   <repo-root>/../barefootbetters-legendary-setup/card-images-staging
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// why: paths anchored to the script's own directory so cwd doesn't matter.
// REPO_ROOT is two levels up from this script (scripts/convert-cards/).
const REPO_ROOT = resolve(__dirname, '..', '..');
const DATA_CARDS_DIR = join(REPO_ROOT, 'data', 'cards');
const DEFAULT_STAGING_DIR = resolve(
  REPO_ROOT, '..', 'barefootbetters-legendary-setup', 'card-images-staging'
);

/**
 * Parses CLI arguments.
 * @param {string[]} argv
 * @returns {{ outputDir: string, dryRun: boolean }}
 */
function parseArgs(argv) {
  let outputDir = DEFAULT_STAGING_DIR;
  let dryRun = false;
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--output-dir' && index + 1 < argv.length) {
      outputDir = resolve(argv[index + 1]);
      index++;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node generate-rename-scripts.mjs [--output-dir <path>] [--dry-run]'
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { outputDir, dryRun };
}

/**
 * Builds the rarity code suffix matching the OLD heroImageUrl pattern.
 * Mirrors the pre-v16 logic in convert-cards-v15.mjs `heroImageUrl()`.
 *
 * rarityLabel examples: "Common 1", "Common 2", "Uncommon", "Uncommon 2", "Rare"
 * Returns:              "c1",       "c2",       "u",        "u2",         "r"
 *
 * @param {string} rarityLabel
 * @returns {string}
 */
function rarityLabelToCode(rarityLabel) {
  const label = (rarityLabel ?? '').toLowerCase().trim();
  if (label === 'rare') {
    return 'r';
  }
  if (label.startsWith('uncommon')) {
    const ordinal = label.replace('uncommon', '').trim();
    return ordinal ? `u${ordinal}` : 'u';
  }
  if (label.startsWith('common')) {
    const ordinal = label.replace('common', '').trim();
    return ordinal ? `c${ordinal}` : 'c';
  }
  return label.replace(/\s+/g, '');
}

/**
 * Builds a lookup table for one set: for each hero, a Map keyed by the OLD
 * filename suffix (e.g., "3c1") yielding the card's slug.
 *
 * @param {object} setData - parsed contents of data/cards/{abbr}.json
 * @returns {Map<string, Map<string, string>>} heroSlug -> (oldSuffix -> cardSlug)
 */
function buildHeroLookup(setData) {
  const heroLookup = new Map();
  for (const hero of setData.heroes ?? []) {
    if (!hero.slug || !Array.isArray(hero.cards)) {
      continue;
    }
    const cardMap = new Map();
    for (const card of hero.cards) {
      if (card.cost == null || !card.rarityLabel || !card.slug) {
        continue;
      }
      const costStr = String(card.cost).replace(/\*/g, '');
      const rarityCode = rarityLabelToCode(card.rarityLabel);
      const oldSuffix = `${costStr}${rarityCode}`;
      cardMap.set(oldSuffix, card.slug);
    }
    heroLookup.set(hero.slug, cardMap);
  }
  return heroLookup;
}

/**
 * Updates one rename script's hero-card lines to use the v16 cardSlug pattern.
 *
 * @param {string} setAbbr
 * @param {string} scriptPath - absolute path to rename-{abbr}-images.ps1
 * @param {Map<string, Map<string, string>>} heroLookup
 * @param {boolean} dryRun
 * @returns {Promise<{ changed: number, total: number, missing: string[] }>}
 */
async function updateRenameScript(setAbbr, scriptPath, heroLookup, dryRun) {
  const scriptText = await readFile(scriptPath, 'utf8');

  // why: hero-card filenames have the structure
  //   {abbr}-hr-{heroSlug}-{cost}{rarityCode}{slot?}.webp
  // The hero slug can contain hyphens, so the regex uses a non-greedy match
  // anchored on the cost-rarity-slot tail. The (?<!...) negative lookbehind
  // is not needed because rarity codes are single letters c/u/r and the
  // cost is always digits — the structure self-anchors.
  const heroLinePattern = new RegExp(
    `${setAbbr}-hr-([a-z0-9-]+?)-(\\d+)([cur])(\\d*)\\.webp`,
    'g'
  );

  let changedCount = 0;
  let totalCount = 0;
  const missing = [];

  const updatedText = scriptText.replace(
    heroLinePattern,
    (matchedFilename, heroSlug, cost, rarityCode, slotOrdinal) => {
      totalCount++;
      const oldSuffix = `${cost}${rarityCode}${slotOrdinal}`;
      const cardMap = heroLookup.get(heroSlug);
      if (!cardMap) {
        missing.push(`hero "${heroSlug}" (suffix ${oldSuffix})`);
        return matchedFilename;
      }
      const cardSlug = cardMap.get(oldSuffix);
      if (!cardSlug) {
        missing.push(`card with suffix "${oldSuffix}" under hero "${heroSlug}"`);
        return matchedFilename;
      }
      changedCount++;
      return `${setAbbr}-hr-${heroSlug}-${cardSlug}.webp`;
    }
  );

  if (changedCount > 0 && !dryRun) {
    await writeFile(scriptPath, updatedText);
  }
  return { changed: changedCount, total: totalCount, missing };
}

/**
 * Main entrypoint — iterates every data/cards/*.json file and updates the
 * matching rename script in the staging repo.
 */
async function main() {
  const { outputDir, dryRun } = parseArgs(process.argv);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Dry run:    ${dryRun}`);

  if (!existsSync(outputDir)) {
    console.error(`Output dir does not exist: ${outputDir}`);
    process.exit(1);
  }
  if (!existsSync(DATA_CARDS_DIR)) {
    console.error(`Data cards dir does not exist: ${DATA_CARDS_DIR}`);
    process.exit(1);
  }

  const dataFiles = await readdir(DATA_CARDS_DIR);
  const setAbbrs = dataFiles
    .filter((filename) => filename.endsWith('.json'))
    .map((filename) => filename.slice(0, -5))
    .sort();

  let totalChanged = 0;
  let totalLines = 0;
  let setsTouched = 0;
  let setsSkipped = 0;
  const allMissing = [];

  for (const setAbbr of setAbbrs) {
    const dataPath = join(DATA_CARDS_DIR, `${setAbbr}.json`);
    const scriptPath = join(outputDir, `rename-${setAbbr}-images.ps1`);

    if (!existsSync(scriptPath)) {
      console.log(`  ${setAbbr}: no rename script — skipped`);
      setsSkipped++;
      continue;
    }

    const setData = JSON.parse(await readFile(dataPath, 'utf8'));
    const heroLookup = buildHeroLookup(setData);

    const { changed, total, missing } = await updateRenameScript(
      setAbbr, scriptPath, heroLookup, dryRun
    );

    if (total === 0) {
      console.log(`  ${setAbbr}: no hero-card lines found — skipped`);
      setsSkipped++;
      continue;
    }

    setsTouched++;
    totalChanged += changed;
    totalLines += total;
    const action = dryRun ? 'would update' : 'updated';
    const summary = `  ${setAbbr}: ${action} ${changed}/${total} hero-card lines`;
    console.log(missing.length > 0 ? `${summary} (${missing.length} unmatched)` : summary);

    for (const item of missing) {
      console.warn(`    ⚠ unmatched: ${item}`);
      allMissing.push(`${setAbbr}: ${item}`);
    }
  }

  console.log('');
  console.log('===');
  const verb = dryRun ? 'Would update' : 'Updated';
  console.log(
    `${verb} ${totalChanged}/${totalLines} hero-card lines across ${setsTouched} sets ` +
    `(${setsSkipped} skipped).`
  );
  if (allMissing.length > 0) {
    console.log(`⚠ ${allMissing.length} unmatched lookups — see warnings above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
