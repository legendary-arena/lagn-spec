/**
 * check-theme-slug-resolution.mjs — Theme setupIntent slug resolution audit
 *
 * Replicates `resolveThemeSlugToExtId`
 * (apps/registry-viewer/src/composables/useLoadoutDraft.ts) against real card
 * data so we can see, per theme, exactly how every bare setupIntent slug would
 * resolve to a set-qualified ext_id at loadout-prefill time (D-24018).
 *
 * For each slug it classifies the resolution as:
 *   - "qualified"   — slug already contains "/", passed through untouched
 *   - "core"        — a `core/{slug}` printing exists; resolver prefers it
 *   - "single"      — exactly one non-core printing; unambiguous
 *   - "AMBIGUOUS"   — no core printing AND 2+ non-core printings; the resolver
 *                     picks the lexicographically-first ext_id and fires the
 *                     ?debug devLog. THIS is what qualifying-at-source fixes.
 *   - "UNRESOLVED"  — zero printings of that type; resolver returns null, the
 *                     bare slug survives and the match-setup validator flags it.
 *
 * Usage:
 *   node scripts/check-theme-slug-resolution.mjs            # full report
 *   node scripts/check-theme-slug-resolution.mjs --check    # exit 1 if any
 *                                                           # AMBIGUOUS/UNRESOLVED
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const cardsDirectory = join(projectRoot, 'data', 'cards');
const themesDirectory = join(projectRoot, 'content', 'themes');

// ── Build category -> slug -> Set<setAbbr> from card data ────────────────────
// why: mirrors the catalog flattening; each entity type maps to one of the
// resolver's cardType buckets. ext_id = `{setAbbr}/{entitySlug}`.

const CATEGORY_BY_FIELD = {
  schemeId: { arrayKey: 'schemes', label: 'scheme' },
  mastermindId: { arrayKey: 'masterminds', label: 'mastermind' },
  villainGroupIds: { arrayKey: 'villains', label: 'villain' },
  henchmanGroupIds: { arrayKey: 'henchmen', label: 'henchman' },
  heroDeckIds: { arrayKey: 'heroes', label: 'hero' },
};

/** @type {Map<string, Map<string, Set<string>>>} label -> slug -> Set<abbr> */
const setsBySlug = new Map();
for (const label of Object.values(CATEGORY_BY_FIELD).map((entry) => entry.label)) {
  setsBySlug.set(label, new Map());
}

/**
 * Records that `slug` of `label` exists in set `abbr`.
 * @param {string} label
 * @param {string} slug
 * @param {string} abbr
 */
function record(label, slug, abbr) {
  const bySlug = setsBySlug.get(label);
  if (!bySlug.has(slug)) {
    bySlug.set(slug, new Set());
  }
  bySlug.get(slug).add(abbr);
}

const cardFiles = readdirSync(cardsDirectory).filter((name) => name.endsWith('.json'));
for (const filename of cardFiles) {
  const setData = JSON.parse(readFileSync(join(cardsDirectory, filename), 'utf8'));
  const abbr = setData.abbr;
  if (!abbr) {
    continue;
  }
  for (const field of Object.keys(CATEGORY_BY_FIELD)) {
    const { arrayKey, label } = CATEGORY_BY_FIELD[field];
    for (const entity of setData[arrayKey] || []) {
      if (entity.slug) {
        record(label, entity.slug, abbr);
      }
    }
  }
}

// ── Resolve one slug exactly as the viewer resolver does ─────────────────────

/**
 * @param {string} bareSlug
 * @param {string} label
 * @returns {{ kind: string, chosen: string|null, candidates: string[] }}
 */
function resolveSlug(bareSlug, label) {
  const trimmed = bareSlug.trim();
  if (trimmed.includes('/')) {
    return { kind: 'qualified', chosen: trimmed, candidates: [trimmed] };
  }
  const abbrs = setsBySlug.get(label).get(trimmed);
  if (!abbrs || abbrs.size === 0) {
    return { kind: 'UNRESOLVED', chosen: null, candidates: [] };
  }
  const candidateExtIds = [...abbrs].map((abbr) => `${abbr}/${trimmed}`).sort();
  if (abbrs.has('core')) {
    return { kind: 'core', chosen: `core/${trimmed}`, candidates: candidateExtIds };
  }
  if (candidateExtIds.length > 1) {
    return { kind: 'AMBIGUOUS', chosen: candidateExtIds[0], candidates: candidateExtIds };
  }
  return { kind: 'single', chosen: candidateExtIds[0], candidates: candidateExtIds };
}

// ── Walk every theme's setupIntent ───────────────────────────────────────────

const themeIndex = JSON.parse(readFileSync(join(themesDirectory, 'index.json'), 'utf8'));
const ambiguousFindings = [];
const unresolvedFindings = [];
let totalSlugs = 0;
let qualifiedSlugs = 0;

for (const filename of themeIndex) {
  const theme = JSON.parse(readFileSync(join(themesDirectory, filename), 'utf8'));
  const intent = theme.setupIntent || {};
  for (const field of Object.keys(CATEGORY_BY_FIELD)) {
    const { label } = CATEGORY_BY_FIELD[field];
    const raw = intent[field];
    const slugs = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const slug of slugs) {
      totalSlugs++;
      const outcome = resolveSlug(slug, label);
      if (outcome.kind === 'qualified') {
        qualifiedSlugs++;
      } else if (outcome.kind === 'AMBIGUOUS') {
        ambiguousFindings.push({ filename, field, label, slug, ...outcome });
      } else if (outcome.kind === 'UNRESOLVED') {
        unresolvedFindings.push({ filename, field, label, slug, ...outcome });
      }
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

const checkMode = process.argv.includes('--check');

console.log(`Scanned ${themeIndex.length} themes, ${totalSlugs} setupIntent slugs (${qualifiedSlugs} already qualified).`);
console.log('');

if (ambiguousFindings.length > 0) {
  console.log(`AMBIGUOUS picks (no core printing, 2+ non-core) — ${ambiguousFindings.length}:`);
  for (const finding of ambiguousFindings) {
    console.log(`  ${finding.filename}  ${finding.field}="${finding.slug}"`);
    console.log(`      → picks ${finding.chosen}   (candidates: ${finding.candidates.join(', ')})`);
  }
  console.log('');
} else {
  console.log('AMBIGUOUS picks: 0 ✅');
  console.log('');
}

if (unresolvedFindings.length > 0) {
  console.log(`UNRESOLVED slugs (zero printings — would fail validation) — ${unresolvedFindings.length}:`);
  for (const finding of unresolvedFindings) {
    console.log(`  ${finding.filename}  ${finding.field}="${finding.slug}" (${finding.label})`);
  }
  console.log('');
} else {
  console.log('UNRESOLVED slugs: 0 ✅');
  console.log('');
}

if (checkMode && (ambiguousFindings.length > 0 || unresolvedFindings.length > 0)) {
  process.exit(1);
}
