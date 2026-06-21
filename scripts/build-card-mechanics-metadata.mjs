#!/usr/bin/env node
/**
 * Hero mechanic metadata feed builder (WP-269 / D-24046).
 *
 * Transforms the committed hero mechanic ledger
 * (docs/ai/coverage/hero-mechanic-ledger.json) into a published, viewer-safe,
 * normalized hero-mechanic index at data/metadata/card-mechanics.json. The
 * registry-viewer (cards.legendary-arena.com) fetches this feed from R2 so it
 * can offer a "filter heroes by mechanic" surface without ever importing the
 * game engine or parsing ability text at runtime (the viewer consumption is
 * WP-270). This script is the producer half.
 *
 * What it does, in order:
 *   1. Read the hero ledger (the derivation source).
 *   2. Read the curated label/visibility side-table (scripts/coverage/mechanic-labels.json).
 *   3. Group ledger rows by NORMALIZED mechanic slug (merging near-duplicate raw
 *      tokens), join per-card, and classify each mechanic's source by reusing the
 *      engine-dist keyword + composition-marker sets.
 *   4. Validate the assembled index against CardMechanicsIndexSchema (the same
 *      registry schema the viewer parses with), so the artifact and the contract
 *      can never drift apart.
 *   5. Default mode: write the file. --check mode: regenerate in memory and exit
 *      non-zero if the committed file drifts (the CI freshness gate).
 *
 * Deterministic: identical ledger + labels input always yields byte-identical
 * output. No wall-clock reads — see resolveGeneratedAt below. Run from the repo
 * root after `pnpm -r build` (it imports the engine + registry dist).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// why: the source classification reuses the SAME keyword + composition-marker
// vocabulary the ledger generator parses with, imported from the game-engine
// dist submodules (NOT the dist barrel, which re-exports only HERO_KEYWORDS).
// Duplicating the sets here would create a second source of truth that silently
// drifts from the parser. Reading the engine dist is acceptable in this
// repo-root BUILD script (it is not the viewer and not packages/registry); the
// published schema and the viewer never import the engine — the Layer Boundary
// is held by isolating the engine read to this one file.
import { HERO_KEYWORDS } from '../packages/game-engine/dist/rules/heroKeywords.js';
import { HERO_COMPOSITION_MARKER_NAMES } from '../packages/game-engine/dist/rules/heroCompositions.js';
// why: the transform self-validates its output against the very schema the
// viewer parses with (imported from the registry dist), so a published feed can
// never diverge from CardMechanicsIndexSchema — producer and contract stay locked.
import { CardMechanicsIndexSchema } from '../packages/registry/dist/schema.js';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const LEDGER_PATH = join(REPO_ROOT, 'docs', 'ai', 'coverage', 'hero-mechanic-ledger.json');
const LABELS_PATH = join(REPO_ROOT, 'scripts', 'coverage', 'mechanic-labels.json');
const OUTPUT_DIRECTORY = join(REPO_ROOT, 'data', 'metadata');
const OUTPUT_PATH = join(OUTPUT_DIRECTORY, 'card-mechanics.json');

const FEED_VERSION = 1;
const FEED_SCOPE = 'hero';
// why: generatedAt MUST be input-derived and byte-stable so the --check freshness
// gate compares cleanly run-to-run. The committed ledger exposes no timestamp
// field, so the transform falls back to this fixed sentinel rather than calling
// Date.now()/new Date(). It is NOT a real generation time — it only keeps the
// published contract shape stable. See resolveGeneratedAt for the resolution chain.
const GENERATED_AT_SENTINEL = '1970-01-01T00:00:00.000Z';

const KNOWN_KEYWORDS = new Set(HERO_KEYWORDS);
const COMPOSITION_MARKERS = new Set(HERO_COMPOSITION_MARKER_NAMES);

/** Error type signalling a probe/transform failure (exit code 2). */
class TransformFailure extends Error {}

/**
 * Normalizes a raw ledger mechanic token into a UI-safe slug.
 *
 * why: the published feed carries ONLY normalized slugs — it never carries the
 * raw ledger `mechanic` string. The ledger holds free-text tokens with
 * punctuation (e.g. `Cyber-Mod: 4 Wounds`, `artifact--`) and the `(unmarked)`
 * sentinel; stripping non-alphanumeric runs to single hyphens collapses those to
 * clean slugs, and the empty-result fallback maps `(unmarked)` to `unmarked`.
 *
 * @param {string} rawMechanic - the ledger row's `mechanic` value.
 * @returns {string} the normalized slug (`unmarked` if the result would be empty).
 */
function normalizeSlug(rawMechanic) {
  const collapsed = rawMechanic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return collapsed === '' ? 'unmarked' : collapsed;
}

/**
 * Derives a deterministic Title-Case display label from a slug, used for any
 * mechanic absent from the curated labels side-table.
 *
 * @param {string} slug - a normalized mechanic slug.
 * @returns {string} the derived label (e.g. `cyber-mod-wound` -> `Cyber Mod Wound`).
 */
function deriveLabel(slug) {
  const words = [];
  for (const segment of slug.split('-')) {
    if (segment.length === 0) {
      continue;
    }
    words.push(segment.charAt(0).toUpperCase() + segment.slice(1));
  }
  return words.join(' ');
}

/**
 * Classifies a mechanic's source by the locked priority order, reusing the
 * engine-dist sets. Composition-marker is checked before keyword because
 * HERO_KEYWORDS is frozen and does not contain the composition markers, so a
 * name can only resolve one way.
 *
 * @param {string} slug - a normalized mechanic slug.
 * @returns {'composition-marker'|'keyword'|'free-text'} the classified source.
 */
function classifySource(slug) {
  if (COMPOSITION_MARKERS.has(slug)) {
    return 'composition-marker';
  }
  if (KNOWN_KEYWORDS.has(slug)) {
    return 'keyword';
  }
  return 'free-text';
}

/**
 * Returns true when the value is an ISO-8601 UTC timestamp string the feed may
 * carry verbatim (e.g. `2026-06-20T12:00:00.000Z`).
 *
 * @param {unknown} value - a candidate timestamp.
 * @returns {boolean} whether it is a valid ISO-8601 UTC string.
 */
function isIsoUtcTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value);
}

/**
 * Resolves the feed's `generatedAt` from the ledger without any wall-clock read:
 * prefer `ledger.generatedAt`, then `ledger.summary.generatedAt`, else the fixed
 * sentinel. The committed ledger currently exposes neither field, so the sentinel
 * is the live outcome; the chain exists so the feed picks up a real timestamp for
 * free if the ledger ever starts emitting one.
 *
 * @param {object} ledger - the parsed hero ledger.
 * @returns {string} the resolved ISO-8601 UTC timestamp.
 */
function resolveGeneratedAt(ledger) {
  if (isIsoUtcTimestamp(ledger.generatedAt)) {
    return ledger.generatedAt;
  }
  if (ledger.summary && isIsoUtcTimestamp(ledger.summary.generatedAt)) {
    return ledger.summary.generatedAt;
  }
  return GENERATED_AT_SENTINEL;
}

/**
 * Reads and shape-checks the hero ledger. A wrong shape is a transform failure:
 * the feed pins a hero-only contract, so a non-hero ledger must STOP rather than
 * silently publish a mislabeled feed.
 *
 * @returns {object} the parsed ledger (`{ cardType, summary, rows }`).
 */
function readLedger() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  } catch (error) {
    throw new TransformFailure(
      `Cannot read the hero mechanic ledger at ${LEDGER_PATH}. It is the derivation source for the feed. ` +
        `Run "pnpm ledger:heroes" first. Underlying error: ${error.message}`,
    );
  }
  if (parsed.cardType !== 'hero') {
    throw new TransformFailure(
      `The ledger at ${LEDGER_PATH} has cardType "${parsed.cardType}", expected "hero". ` +
        `This feed pins a hero-only scope; reconcile the ledger scope before regenerating (villains are WP-271).`,
    );
  }
  if (!Array.isArray(parsed.rows)) {
    throw new TransformFailure(
      `The ledger at ${LEDGER_PATH} has no rows[] array. The ledger shape changed; ` +
        `re-check scripts/hero-mechanic-ledger.mjs before regenerating the feed.`,
    );
  }
  return parsed;
}

/**
 * Reads the curated labels side-table and returns a map keyed by normalized slug.
 * Fails on a duplicate key after normalization (two curated keys collapsing to the
 * same slug would make the curation ambiguous).
 *
 * @returns {Map<string, {label: string, hidden: boolean}>} the curated label map.
 */
function readLabels() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(LABELS_PATH, 'utf8'));
  } catch (error) {
    throw new TransformFailure(
      `Cannot read the curated mechanic labels at ${LABELS_PATH}. It supplies display labels and the ` +
        `visible/hidden decision. Underlying error: ${error.message}`,
    );
  }
  const rawMechanics = parsed.mechanics ?? {};
  const labels = new Map();
  for (const [rawKey, entry] of Object.entries(rawMechanics)) {
    const slug = normalizeSlug(rawKey);
    if (labels.has(slug)) {
      throw new TransformFailure(
        `The curated labels at ${LABELS_PATH} contain two keys that normalize to the same slug "${slug}". ` +
          `Remove the duplicate so each curated slug appears once.`,
      );
    }
    if (typeof entry.label !== 'string' || entry.label.length === 0) {
      throw new TransformFailure(
        `The curated label for "${slug}" in ${LABELS_PATH} must be a non-empty string. Fix the entry.`,
      );
    }
    if (typeof entry.hidden !== 'boolean') {
      throw new TransformFailure(
        `The curated entry for "${slug}" in ${LABELS_PATH} must set "hidden" to a boolean. Fix the entry.`,
      );
    }
    labels.set(slug, { label: entry.label, hidden: entry.hidden });
  }
  return labels;
}

/**
 * Groups ledger rows by normalized slug and by card, classifies each mechanic's
 * source, joins the curated labels, and assembles the published index in the
 * locked property/array order. Validates the result against
 * CardMechanicsIndexSchema before returning.
 *
 * @param {object} ledger - the parsed hero ledger.
 * @param {Map<string, {label: string, hidden: boolean}>} labels - curated labels.
 * @returns {object} the validated card-mechanics index.
 */
function buildIndex(ledger, labels) {
  const cardIdsBySlug = new Map();
  const slugsByCard = new Map();
  for (const row of ledger.rows) {
    const slug = normalizeSlug(row.mechanic);
    const extId = row.extId;
    if (!cardIdsBySlug.has(slug)) {
      cardIdsBySlug.set(slug, new Set());
    }
    cardIdsBySlug.get(slug).add(extId);
    if (!slugsByCard.has(extId)) {
      slugsByCard.set(extId, new Set());
    }
    slugsByCard.get(extId).add(slug);
  }

  // why: a curated key that no longer appears in the ledger is stale curation that
  // would mask drift (a renamed/removed mechanic). Fail loudly rather than warn.
  for (const slug of labels.keys()) {
    if (!cardIdsBySlug.has(slug)) {
      throw new TransformFailure(
        `The curated labels reference "${slug}", which is absent from the current hero ledger. ` +
          `Stale curation masks drift — remove the entry from ${LABELS_PATH} or regenerate the ledger.`,
      );
    }
  }

  const mechanics = [];
  for (const slug of [...cardIdsBySlug.keys()].sort()) {
    const cardIds = [...cardIdsBySlug.get(slug)].sort();
    const curated = labels.get(slug);
    // why: hidden is fail-closed — any mechanic absent from the curated labels map
    // is hidden:true (a raw/free-text token never surfaced as a default UI chip
    // until a human curates it). Only an explicit curation makes a mechanic visible.
    const label = curated ? curated.label : deriveLabel(slug);
    const hidden = curated ? curated.hidden : true;
    mechanics.push({
      slug,
      label,
      scope: FEED_SCOPE,
      source: classifySource(slug),
      cardCount: cardIds.length,
      cardIds,
      hidden,
    });
  }

  const cards = {};
  for (const extId of [...slugsByCard.keys()].sort()) {
    cards[extId] = { mechanics: [...slugsByCard.get(extId)].sort() };
  }

  const index = {
    version: FEED_VERSION,
    scope: FEED_SCOPE,
    generatedAt: resolveGeneratedAt(ledger),
    mechanics,
    cards,
  };

  const validation = CardMechanicsIndexSchema.safeParse(index);
  if (!validation.success) {
    const firstIssue = validation.error.issues[0];
    throw new TransformFailure(
      `The generated card-mechanics index failed CardMechanicsIndexSchema validation: ` +
        `${firstIssue.path.join('.')} — ${firstIssue.message}. The transform must not publish an invalid feed.`,
    );
  }
  return index;
}

/**
 * Serializes the index to deterministic pretty JSON (locked property order from
 * buildIndex, two-space indent) with a trailing newline.
 *
 * @param {object} index - the validated card-mechanics index.
 * @returns {string} the JSON document.
 */
function serializeJson(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/**
 * Builds the feed and dispatches the requested CLI mode.
 *
 * @returns {number} the process exit code.
 */
function main() {
  const mode = process.argv.slice(2).find((argument) => argument.startsWith('--'));

  const ledger = readLedger();
  const labels = readLabels();
  const index = buildIndex(ledger, labels);
  const freshText = serializeJson(index);

  if (mode === '--check') {
    // why: the committed file may be CRLF in a Windows working tree (git autocrlf)
    // while the generator always writes LF; compare line-ending-normalized so
    // --check tests content, not the platform's newline style (mirrors ledger:heroes:check).
    const normalizeNewlines = (text) => text.replace(/\r\n/g, '\n');
    let committed;
    try {
      committed = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      console.log(`FAIL: the card-mechanics feed is missing at ${OUTPUT_PATH}.`);
      console.log('Regenerate with "pnpm mechanics:metadata" and commit the result.');
      return 1;
    }
    if (normalizeNewlines(committed) !== normalizeNewlines(freshText)) {
      console.log(`FAIL: the card-mechanics feed at ${OUTPUT_PATH} is stale.`);
      console.log('Regenerate with "pnpm mechanics:metadata" and commit the result.');
      return 1;
    }
    console.log(`OK: card-mechanics feed is current (${index.mechanics.length} mechanics).`);
    return 0;
  }

  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(OUTPUT_PATH, freshText, 'utf8');
  const visibleCount = index.mechanics.filter((mechanic) => mechanic.hidden === false).length;
  console.log(`Card-mechanics feed written (${index.mechanics.length} mechanics, ${visibleCount} visible):`);
  console.log(`  scope ${index.scope} · ${Object.keys(index.cards).length} cards`);
  console.log(`  ${OUTPUT_PATH}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  if (error instanceof TransformFailure) {
    console.error(`Transform failure: ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error('Transform failure: the card-mechanics metadata builder threw an unexpected error.');
    console.error(error);
    process.exitCode = 2;
  }
}
