#!/usr/bin/env node
/**
 * rename-r2-split-pairs.mjs
 *
 * Produces rclone `moveto` commands for split-pair hero images on R2.
 * These are the 2-side physicalCards whose combined-name image files
 * don't exist on R2 yet (the v16 migration only handled cost-based →
 * slug-based renames for solo cards; split-pair combined names were
 * unmatched).
 *
 * The script reads the 40 card JSONs, identifies every 2-side
 * physicalCard, and emits the canonical R2 object key derived from
 * heroImageUrl(). It does NOT execute rclone — the operator reviews
 * the output and runs the commands manually.
 *
 * Because the source filenames (old cost-based pattern) cannot be
 * deterministically derived from card data alone (D-15102 mapping
 * constraint), this script only emits the TARGET keys. The operator
 * must match them against an `rclone ls` listing of the R2 bucket
 * to identify the source files.
 *
 * Usage:
 *   node scripts/rename-r2-split-pairs.mjs
 *   node scripts/rename-r2-split-pairs.mjs --list-targets
 *   node scripts/rename-r2-split-pairs.mjs --check-r2
 *
 * Flags:
 *   --list-targets  (default) Print one target key per line.
 *   --check-r2      For each target, emit a curl HEAD check command
 *                    that the operator can pipe to bash to verify which
 *                    targets already exist on R2.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DATA_CARDS_DIR = join(REPO_ROOT, 'data', 'cards');
const R2_BASE_URL = 'https://images.legendary-arena.com';

const checkR2 = process.argv.includes('--check-r2');

const files = readdirSync(DATA_CARDS_DIR).filter(f => f.endsWith('.json'));
const targets = [];

for (const file of files) {
  const raw = readFileSync(join(DATA_CARDS_DIR, file), 'utf8');
  const set = JSON.parse(raw);

  for (const hero of set.heroes || []) {
    for (const physicalCard of hero.physicalCards || []) {
      if (physicalCard.sides.length === 2) {
        const url = physicalCard.imageUrl;
        const key = url.replace(`${R2_BASE_URL}/`, '');
        targets.push({
          setAbbr: set.abbr,
          heroSlug: hero.slug,
          sides: physicalCard.sides,
          companionSlug: physicalCard.companionSlug,
          targetKey: key,
          targetUrl: url,
        });
      }
    }
  }
}

console.log(`# Split-pair targets: ${targets.length} across ${files.length} sets`);
console.log(`# R2 bucket: legendary-images`);
console.log(`# R2 base URL: ${R2_BASE_URL}`);
console.log('');

if (checkR2) {
  console.log('# Run these curl commands to check which targets exist on R2:');
  console.log('');
  for (const target of targets) {
    console.log(`curl -s -o /dev/null -w "%{http_code} ${target.targetKey}\\n" --head "${target.targetUrl}"`);
  }
} else {
  console.log('# Target keys (one per line):');
  console.log('# To find source files, run: rclone ls legendary-r2:legendary-images/{setAbbr}/ | grep hr-{heroSlug}');
  console.log('');
  for (const target of targets) {
    const companion = target.companionSlug ? ` [companion: ${target.companionSlug}]` : '';
    console.log(`${target.targetKey}  # ${target.heroSlug} [${target.sides.join(' + ')}]${companion}`);
  }
}

console.log('');
console.log(`# Total: ${targets.length} split-pair targets`);
