#!/usr/bin/env node
/**
 * migrate-renamed-to-v16.mjs
 *
 * Copies images from the staging "renamed" folder into a new output folder
 * with v16 cardSlug-based hero-card filenames. Non-hero files (masterminds,
 * villains, henchmen, schemes, bystanders, wounds, epics, tactics) are copied
 * unchanged — those filenames already use card slugs.
 *
 *   Old hero pattern: {abbr}-hr-{heroSlug}-{cost}{rarityCode}{slot?}.webp
 *   New hero pattern: {abbr}-hr-{heroSlug}-{cardSlug}.webp
 *
 * Card-slug lookups come from `data/cards/{abbr}.json` (canonical card data).
 *
 * Output preserves the per-set directory structure. The source folder is
 * not modified — this is a copy, not a move, so the original "renamed"
 * tree stays intact for fallback.
 *
 * Files whose hero pattern can't be resolved against the JSON (e.g., a
 * legacy on-disk file whose cost no longer matches what the JSON says) are
 * copied with their original name and reported as "unmatched" so they can
 * be reviewed manually before upload.
 *
 * Usage:
 *   node scripts/convert-cards/migrate-renamed-to-v16.mjs
 *   node scripts/convert-cards/migrate-renamed-to-v16.mjs --dry-run
 *   node scripts/convert-cards/migrate-renamed-to-v16.mjs --output-dir <path>
 *   node scripts/convert-cards/migrate-renamed-to-v16.mjs --input-dir <path>
 *
 * Defaults (all relative to <repo-root>/..):
 *   input  = barefootbetters-legendary-setup/card-images-staging/renamed
 *   output = barefootbetters-legendary-setup/card-images-staging/renamed-v16
 */

import { readdir, copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// why: paths anchored to script location so cwd doesn't matter.
// REPO_ROOT is two levels up from this script (scripts/convert-cards/).
const REPO_ROOT = resolve(__dirname, '..', '..');
const DATA_CARDS_DIR = join(REPO_ROOT, 'data', 'cards');
const STAGING_BASE = resolve(
  REPO_ROOT, '..', 'barefootbetters-legendary-setup', 'card-images-staging'
);
const DEFAULT_INPUT_DIR = join(STAGING_BASE, 'renamed');
const DEFAULT_OUTPUT_DIR = join(STAGING_BASE, 'renamed-v16');

/**
 * Parses CLI arguments.
 * @param {string[]} argv
 * @returns {{ inputDir: string, outputDir: string, dryRun: boolean }}
 */
function parseArgs(argv) {
  let inputDir = DEFAULT_INPUT_DIR;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let dryRun = false;
  for (let index = 2; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--input-dir' && index + 1 < argv.length) {
      inputDir = resolve(argv[index + 1]);
      index++;
    } else if (arg === '--output-dir' && index + 1 < argv.length) {
      outputDir = resolve(argv[index + 1]);
      index++;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node migrate-renamed-to-v16.mjs ' +
        '[--input-dir <path>] [--output-dir <path>] [--dry-run]'
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { inputDir, outputDir, dryRun };
}

/**
 * Builds the rarity code suffix used in the OLD hero filename pattern.
 * Mirrors the pre-v16 logic from convert-cards-v15.mjs `heroImageUrl()`.
 *
 * @param {string} rarityLabel - e.g. "Common 1", "Uncommon", "Rare"
 * @returns {string} e.g. "c1", "u", "r"
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
 * Builds a per-set lookup table mapping each hero's old filename suffix
 * (e.g., "3c1", "5u", "8r") to the card's slug.
 *
 * @param {object} setData - parsed contents of data/cards/{abbr}.json
 * @returns {Map<string, Map<string, string>>}
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
 * Processes one set's image folder. Hero-card files are renamed to the v16
 * cardSlug pattern; other files are copied unchanged. The source folder is
 * not modified.
 *
 * @returns {Promise<{
 *   renamed: number, copied: number, unmatched: string[]
 * }>}
 */
async function processSet(setAbbr, inputSetDir, outputSetDir, heroLookup, dryRun) {
  const entries = await readdir(inputSetDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  let renamedCount = 0;
  let copiedCount = 0;
  const unmatched = [];

  // why: hero card pattern is {abbr}-hr-{heroSlug}-{cost}{rarityCode}{slot?}.webp.
  // Hero slugs may contain hyphens, so the inner match is non-greedy and
  // anchors on the cost+rarity tail. Single-letter rarity codes (c, u, r)
  // disambiguate the boundary.
  const heroPattern = new RegExp(
    `^${setAbbr}-hr-([a-z0-9-]+?)-(\\d+)([cur])(\\d*)\\.webp$`
  );

  if (!dryRun) {
    await mkdir(outputSetDir, { recursive: true });
  }

  for (const fileName of files) {
    if (!fileName.toLowerCase().endsWith('.webp')) {
      // why: non-webp files (e.g., stray .DS_Store) are skipped silently
      // rather than copied — they don't belong on R2.
      continue;
    }

    const heroMatch = fileName.match(heroPattern);
    let outputName = fileName;

    if (heroMatch) {
      const [, heroSlug, cost, rarityCode, slotOrdinal] = heroMatch;
      const oldSuffix = `${cost}${rarityCode}${slotOrdinal}`;
      const cardMap = heroLookup.get(heroSlug);
      const cardSlug = cardMap?.get(oldSuffix);
      if (cardSlug) {
        outputName = `${setAbbr}-hr-${heroSlug}-${cardSlug}.webp`;
        renamedCount++;
      } else {
        unmatched.push(`${fileName} (hero=${heroSlug}, suffix=${oldSuffix})`);
        copiedCount++;
      }
    } else {
      // Non-hero file (mastermind, villain, scheme, etc.) — already uses card slug
      copiedCount++;
    }

    if (!dryRun) {
      const sourcePath = join(inputSetDir, fileName);
      const destinationPath = join(outputSetDir, outputName);
      await copyFile(sourcePath, destinationPath);
    }
  }

  return { renamed: renamedCount, copied: copiedCount, unmatched };
}

/**
 * Main entrypoint.
 */
async function main() {
  const { inputDir, outputDir, dryRun } = parseArgs(process.argv);
  console.log(`Input:   ${inputDir}`);
  console.log(`Output:  ${outputDir}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  if (!existsSync(inputDir)) {
    console.error(`Input dir does not exist: ${inputDir}`);
    process.exit(1);
  }
  if (!existsSync(DATA_CARDS_DIR)) {
    console.error(`Data cards dir does not exist: ${DATA_CARDS_DIR}`);
    process.exit(1);
  }

  const inputEntries = await readdir(inputDir, { withFileTypes: true });
  const setDirNames = inputEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  let totalRenamed = 0;
  let totalCopied = 0;
  let totalUnmatched = 0;
  let setsProcessed = 0;
  let setsSkipped = 0;
  const allUnmatched = [];

  for (const setAbbr of setDirNames) {
    const dataPath = join(DATA_CARDS_DIR, `${setAbbr}.json`);
    if (!existsSync(dataPath)) {
      console.log(`  ${setAbbr}: no data file at data/cards/${setAbbr}.json — skipped`);
      setsSkipped++;
      continue;
    }

    const inputSetDir = join(inputDir, setAbbr);
    const outputSetDir = join(outputDir, setAbbr);
    const setData = JSON.parse(await readFile(dataPath, 'utf8'));
    const heroLookup = buildHeroLookup(setData);

    const { renamed, copied, unmatched } = await processSet(
      setAbbr, inputSetDir, outputSetDir, heroLookup, dryRun
    );

    setsProcessed++;
    totalRenamed += renamed;
    totalCopied += copied;
    totalUnmatched += unmatched.length;

    const verb = dryRun ? 'would' : '';
    const summary = `  ${setAbbr}: ${verb} renamed ${renamed} hero cards, copied ${copied} other files`;
    if (unmatched.length > 0) {
      console.log(`${summary} (${unmatched.length} unmatched — copied with original name)`);
    } else {
      console.log(summary);
    }
    for (const item of unmatched) {
      console.warn(`    ⚠ unmatched: ${item}`);
      allUnmatched.push(`${setAbbr}/${item}`);
    }
  }

  console.log('');
  console.log('===');
  const verb = dryRun ? 'Would have' : '';
  console.log(`Sets processed: ${setsProcessed} (${setsSkipped} skipped)`);
  console.log(`${verb} renamed (hero cards): ${totalRenamed}`);
  console.log(`${verb} copied (non-hero, already correct): ${totalCopied}`);
  console.log(`Unmatched: ${totalUnmatched}`);
  if (totalUnmatched > 0) {
    console.log('');
    console.log(
      '⚠ Unmatched files were copied with their original names. ' +
      'They are likely on-disk artifacts whose cost/rarity no longer matches ' +
      'the canonical JSON. Review each and rename manually before uploading to R2.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
