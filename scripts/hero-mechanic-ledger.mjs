#!/usr/bin/env node
/**
 * Hero mechanic ledger generator.
 *
 * Emits one row per (hero card × mechanic) — a card with three mechanics yields
 * three rows — so the corpus can be read two ways at a glance: which cards still
 * do nothing (the authoring worklist), and, when a card misbehaves, which
 * mechanic owns it and where the code lives (the debugging index).
 *
 * Columns per row:
 *   extId      — canonical set-qualified card id (the engine's id space)
 *   heroName   — display name
 *   set        — set abbreviation
 *   mechanic   — normalized [keyword:X] token (or "(unmarked)" — see below)
 *   status     — executable | deferred | unsupported | unmarked
 *   wp         — Work Packet that implemented the mechanic (from provenance map)
 *   decision   — DECISIONS.md id for it (from provenance map)
 *   handler    — where the code is (module#key) for executable mechanics
 *
 * Status meanings (the four kinds of state, not just done/not-done):
 *   executable   — mechanic ∈ MVP_KEYWORDS (its executor mutates G today); a STATIC
 *                  composition marker (berserk — by-name, every parsed one resolves, D-24031);
 *                  OR a PARAMETERIZED composition marker THIS card's hook resolved (by-hook, D-24045)
 *   deferred     — mechanic ∈ HERO_KEYWORDS but not MVP: parsed, executor defers
 *   unsupported  — mechanic ∉ HERO_KEYWORDS with no handler (a CODE todo), OR a PARAMETERIZED
 *                  composition marker this card's hook did NOT resolve — a deferred variant
 *                  with no executable primitive yet (by-hook, D-24045)
 *   unmarked     — the card has ability text but no [keyword:X] tag (a DATA todo)
 *
 * Sources of truth (no duplicated vocabulary):
 *   - HERO_KEYWORDS  — the known markup vocabulary the parser recognizes
 *   - MVP_KEYWORDS   — the subset whose executor mutates G today
 *   - provenance map — scripts/coverage/mechanic-provenance.json (wp/decision)
 *
 * Modes:
 *   (default)  regenerate docs/ai/coverage/hero-mechanic-ledger.{json,csv} + print a summary
 *   --check    regenerate in memory and diff against the committed files; exit 1 if stale
 *
 * Deterministic given the in-repo card data. Run from the repo root after
 * `pnpm -r build` (it imports the engine + registry dist).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRegistryFromLocalFiles } from '../packages/registry/dist/index.js';
// why: D-24045 — the ledger builds each hero's hooks the same way the coverage probe does
// (buildHeroAbilityHooks per hero) so it can read parse-time `resolvedMarkers` and classify
// composition markers by-hook (per-card), not by-name. Imported from the engine dist — the
// one-way Layer Boundary import the coverage probe already uses (the ledger never imports
// engine source, and the engine never imports the ledger).
import { buildHeroAbilityHooks } from '../packages/game-engine/dist/setup/heroAbility.setup.js';
import { HERO_KEYWORDS } from '../packages/game-engine/dist/rules/heroKeywords.js';
import { MVP_KEYWORDS } from '../packages/game-engine/dist/hero/heroEffects.execute.js';
// why: D-24031 — composition markers (berserk) are executable via the primitive
// interpreter (not a HeroKeyword/handler); sourced from the engine dist so the ledger
// recognizes them without duplicating the vocabulary. D-24045 — the PARAMETERIZED subset
// (empowered) is classified by-hook because it has deferred variants that resolve nothing;
// the static markers (berserk) have no variants and stay executable by-name.
import {
  HERO_COMPOSITION_MARKER_NAMES,
  PARAMETERIZED_COMPOSITION_MARKER_NAMES,
} from '../packages/game-engine/dist/rules/heroCompositions.js';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const METADATA_DIRECTORY = join(REPO_ROOT, 'data', 'metadata');
const CARDS_DIRECTORY = join(REPO_ROOT, 'data', 'cards');
const PROVENANCE_PATH = join(REPO_ROOT, 'scripts', 'coverage', 'mechanic-provenance.json');
const OUTPUT_DIRECTORY = join(REPO_ROOT, 'docs', 'ai', 'coverage');
const LEDGER_JSON_PATH = join(OUTPUT_DIRECTORY, 'hero-mechanic-ledger.json');
const LEDGER_CSV_PATH = join(OUTPUT_DIRECTORY, 'hero-mechanic-ledger.csv');

const SCHEMA_VERSION = 1;
// why: every executable hero KEYWORD mechanic is dispatched from this one module
// (HERO_EFFECT_HANDLERS, keyed by the mechanic name); the handler column points
// here so a broken card is a direct jump to the function.
const HERO_HANDLER_MODULE = 'packages/game-engine/src/hero/heroEffects.execute.ts';
// why: D-24031 — a composition marker (berserk) is dispatched by the mechanic-agnostic
// primitive interpreter (the mechanic lives in the HERO_COMPOSITION_MARKERS data row), so
// its handler column points at the interpreter module, not the keyword handler module.
const PRIMITIVE_INTERPRETER_MODULE = 'packages/game-engine/src/hero/effectPrimitive.interpret.ts';
const UNMARKED_MECHANIC = '(unmarked)';

const KNOWN_KEYWORDS = new Set(HERO_KEYWORDS);
const COMPOSITION_MARKERS = new Set(HERO_COMPOSITION_MARKER_NAMES);
// why: D-24045 — only the PARAMETERIZED composition markers (empowered) are classified
// by-hook: they have deferred variants (color-of-choice / conditional-prefix) whose hooks
// resolve nothing, the by-name over-claim this WP removes. Static markers (berserk) have no
// variants — every PARSED berserk resolves — so they stay executable by-name; a berserk
// printed on a transform-hero back face is a separate (out-of-scope) transform-modeling
// concern, not a by-name over-claim, so by-name avoids under-claiming it.
const PARAMETERIZED_COMPOSITION_MARKERS = new Set(PARAMETERIZED_COMPOSITION_MARKER_NAMES);

/** Error type signalling a probe failure (exit code 2). */
class ProbeFailure extends Error {}

/**
 * Normalizes a `[keyword:X]` token to its bare mechanic name — strips a trailing
 * `:<digits>` / ` <digits>` magnitude, lowercases, collapses whitespace to
 * single hyphens. Identical to the coverage gate's normalizer so the two tools
 * classify the same token the same way.
 *
 * @param {string} rawToken - the text between `[keyword:` and `]`.
 * @returns {string} the normalized mechanic name (empty string if malformed).
 */
function normalizeMechanicToken(rawToken) {
  return rawToken
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\s+\d+$/, '')
    .replace(/\s+/g, '-');
}

/**
 * Returns the distinct, normalized `[keyword:X]` mechanic tokens across a hero's
 * ability lines.
 *
 * @param {string[]} abilities - the hero's ability text lines.
 * @returns {Set<string>} the distinct mechanic names found.
 */
function extractMechanics(abilities) {
  const found = new Set();
  for (const ability of abilities) {
    const markupPattern = /\[keyword:([^\]]+)\]/g;
    let match;
    while ((match = markupPattern.exec(ability)) !== null) {
      const name = normalizeMechanicToken(match[1]);
      if (name !== '') {
        found.add(name);
      }
    }
  }
  return found;
}

/**
 * Classifies a mechanic token into one of the keyword-derived states.
 * (`unmarked` is decided by the caller, since it is the absence of any token.)
 *
 * Keyword mechanics (MVP / known) are classified by name — their status is the same
 * for every card that bears them. A composition marker is classified by-hook (per-card):
 * executable only when THIS card's hook actually resolved it.
 *
 * @param {string} mechanic - a normalized mechanic name.
 * @param {Set<string>} cardResolvedMarkers - the composition markers THIS card's hooks resolved.
 * @returns {'executable'|'deferred'|'unsupported'} the status.
 */
function statusForMechanic(mechanic, cardResolvedMarkers) {
  if (MVP_KEYWORDS.has(mechanic)) {
    return 'executable';
  }
  if (COMPOSITION_MARKERS.has(mechanic)) {
    // why: D-24045 — a PARAMETERIZED composition marker (empowered) is executable for THIS
    // card only if its hook actually resolved it (by-hook, not by-name): a deferred variant
    // (color-of-choice / conditional-prefix) resolved nothing, so it is `unsupported` — NOT
    // `deferred` (a composition row means a resolved primitive, not mere parser recognition;
    // absence matches the by-hook coverage probe + runtime hollow detector). This removes the
    // WP-267 / D-24044 by-name over-claim.
    if (PARAMETERIZED_COMPOSITION_MARKERS.has(mechanic)) {
      return cardResolvedMarkers.has(mechanic) ? 'executable' : 'unsupported';
    }
    // why: D-24045 — a STATIC composition marker (berserk) has no deferred variants — every
    // PARSED berserk resolves — so it stays executable by-name (D-24031). A berserk printed on
    // a transform-hero back face is never built into a canonical-face hook, but that is a
    // separate transform-modeling gap, not a by-name over-claim; by-name avoids under-claiming
    // it here (operator decision, this WP).
    return 'executable';
  }
  if (KNOWN_KEYWORDS.has(mechanic)) {
    return 'deferred';
  }
  return 'unsupported';
}

/**
 * Returns the handler-column location for a mechanic, or '' for non-executable mechanics.
 * Keyword mechanics point at their HERO_EFFECT_HANDLERS entry; composition markers point
 * at the mechanic-agnostic primitive interpreter (the mechanic lives in the data row).
 *
 * @param {string} mechanic - a normalized mechanic name.
 * @param {'executable'|'deferred'|'unsupported'|'unmarked'} status - the mechanic's state.
 * @returns {string} the handler location (module#key, a module path, or '').
 */
function handlerForMechanic(mechanic, status) {
  if (status !== 'executable') {
    return '';
  }
  // why: D-24031 — composition markers dispatch through the interpreter, not a keyword handler.
  if (COMPOSITION_MARKERS.has(mechanic)) {
    return PRIMITIVE_INTERPRETER_MODULE;
  }
  return `${HERO_HANDLER_MODULE}#${mechanic}`;
}

/**
 * Builds one ledger row, joining the provenance map and deriving the handler
 * location for executable mechanics.
 *
 * @param {string} extId - the card ext id.
 * @param {{setAbbr: string, heroName: string}} info - the hero display info.
 * @param {string} mechanic - the mechanic name (or UNMARKED_MECHANIC).
 * @param {'executable'|'deferred'|'unsupported'|'unmarked'} status - the state.
 * @param {Record<string, {wp?: string, decision?: string}>} provenance - the map.
 * @returns {object} the ledger row.
 */
function buildRow(extId, info, mechanic, status, provenance) {
  const entry = provenance[mechanic] ?? {};
  const handler = handlerForMechanic(mechanic, status);
  return {
    extId,
    heroName: info.heroName,
    set: info.setAbbr,
    mechanic,
    status,
    wp: entry.wp ?? '',
    decision: entry.decision ?? '',
    handler,
  };
}

/**
 * Walks the hero corpus and produces the sorted ledger rows plus a status
 * summary. A hero with ability text but no recognized mechanic token gets a
 * single `unmarked` row; a hero with no ability text at all (a vanilla card)
 * contributes no rows.
 *
 * @param {object} registry - a CardRegistry from createRegistryFromLocalFiles.
 * @param {Record<string, object>} provenance - the mechanic provenance map.
 * @returns {{rows: object[], summary: object}} sorted rows + counts.
 */
function buildLedger(registry, provenance) {
  const heroesByExtId = new Map();
  for (const card of registry.listCards()) {
    if (card.cardType !== 'hero') {
      continue;
    }
    const existing = heroesByExtId.get(card.extId) ?? {
      setAbbr: card.setAbbr,
      heroName: card.heroName ?? card.name,
      abilities: [],
    };
    for (const ability of card.abilities) {
      if (typeof ability === 'string' && ability.trim() !== '') {
        existing.abilities.push(ability.trim());
      }
    }
    heroesByExtId.set(card.extId, existing);
  }

  const rows = [];
  for (const [extId, info] of heroesByExtId) {
    if (info.abilities.length === 0) {
      continue;
    }
    const mechanics = extractMechanics(info.abilities);
    if (mechanics.size === 0) {
      rows.push(buildRow(extId, info, UNMARKED_MECHANIC, 'unmarked', provenance));
      continue;
    }
    // why: D-24045 — build THIS hero's hooks the same way the coverage probe does
    // (buildHeroAbilityHooks per hero) and aggregate the composition markers its hooks
    // resolved into a per-card Set. This is what makes composition-marker status by-hook
    // (per-card) instead of by-name. Multiple hooks on one card may resolve the same marker;
    // the Set collapses duplicates, so a duplicate-marker card yields exactly one row and the
    // regen stays byte-stable (membership is order-independent; the row sort below is unchanged).
    const cardResolvedMarkers = new Set();
    for (const hook of buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })) {
      for (const marker of hook.resolvedMarkers ?? []) {
        cardResolvedMarkers.add(marker);
      }
    }
    for (const mechanic of [...mechanics].sort()) {
      rows.push(buildRow(extId, info, mechanic, statusForMechanic(mechanic, cardResolvedMarkers), provenance));
    }
  }

  // why: a stable composite sort key makes the JSON + CSV byte-identical run to
  // run, so the --check freshness gate compares cleanly across machines.
  rows.sort((a, b) => {
    const keyA = `${a.set} ${a.heroName} ${a.extId} ${a.mechanic}`;
    const keyB = `${b.set} ${b.heroName} ${b.extId} ${b.mechanic}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  const summary = {
    totalRows: rows.length,
    byStatus: { executable: 0, deferred: 0, unsupported: 0, unmarked: 0 },
    distinctMechanics: 0,
  };
  const distinct = new Set();
  for (const row of rows) {
    summary.byStatus[row.status] += 1;
    if (row.mechanic !== UNMARKED_MECHANIC) {
      distinct.add(row.mechanic);
    }
  }
  summary.distinctMechanics = distinct.size;

  return { rows, summary };
}

/**
 * Escapes one CSV field per RFC 4180 — wraps in double quotes and doubles any
 * embedded quote whenever the value contains a comma, quote, or newline.
 *
 * @param {string} value - the raw field value.
 * @returns {string} the CSV-safe field.
 */
function toCsvField(value) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serializes the ledger rows to CSV with a trailing newline.
 *
 * @param {object[]} rows - the sorted ledger rows.
 * @returns {string} the CSV document.
 */
function serializeCsv(rows) {
  const header = ['ext_id', 'hero_name', 'set', 'mechanic', 'status', 'wp', 'decision', 'handler'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.extId,
        row.heroName,
        row.set,
        row.mechanic,
        row.status,
        row.wp,
        row.decision,
        row.handler,
      ]
        .map((field) => toCsvField(String(field)))
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Serializes the ledger to deterministic JSON (fixed key order per row, stable
 * row order from buildLedger) with a trailing newline.
 *
 * @param {object} summary - the status summary.
 * @param {object[]} rows - the sorted ledger rows.
 * @returns {string} the JSON document.
 */
function serializeJson(summary, rows) {
  return `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, cardType: 'hero', summary, rows }, null, 2)}\n`;
}

/**
 * Reads and validates the provenance map. A missing file is a probe failure
 * (the generator cannot fill the wp/decision columns without it).
 *
 * @returns {Record<string, object>} the mechanic → {wp, decision} map.
 */
function readProvenance() {
  let text;
  try {
    text = readFileSync(PROVENANCE_PATH, 'utf8');
  } catch (error) {
    throw new ProbeFailure(
      `Cannot read the mechanic provenance map at ${PROVENANCE_PATH}. It seeds the wp/decision columns. Underlying error: ${error.message}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ProbeFailure(
      `The mechanic provenance map at ${PROVENANCE_PATH} is not valid JSON. Underlying error: ${error.message}`,
    );
  }
  return parsed.mechanics ?? {};
}

/**
 * Loads the registry and dispatches the requested CLI mode.
 *
 * @returns {Promise<number>} the process exit code.
 */
async function main() {
  const mode = process.argv.slice(2).find((argument) => argument.startsWith('--'));

  const registry = await createRegistryFromLocalFiles({
    metadataDir: METADATA_DIRECTORY,
    cardsDir: CARDS_DIRECTORY,
  });
  const provenance = readProvenance();
  const { rows, summary } = buildLedger(registry, provenance);

  if (rows.length === 0) {
    throw new ProbeFailure(
      'The hero ledger is empty — the registry or built dist did not load. Run "pnpm -r build" and confirm data/cards/ is present.',
    );
  }

  const jsonText = serializeJson(summary, rows);
  const csvText = serializeCsv(rows);

  if (mode === '--check') {
    // why: the committed file may be CRLF in a Windows working tree (git
    // autocrlf) while the generator always writes LF; compare line-ending-
    // normalized so --check tests content, not the platform's newline style.
    const normalizeNewlines = (text) => text.replace(/\r\n/g, '\n');
    const staleFiles = [];
    for (const [path, fresh] of [
      [LEDGER_JSON_PATH, jsonText],
      [LEDGER_CSV_PATH, csvText],
    ]) {
      let committed;
      try {
        committed = readFileSync(path, 'utf8');
      } catch {
        staleFiles.push(`${path} (missing)`);
        continue;
      }
      if (normalizeNewlines(committed) !== normalizeNewlines(fresh)) {
        staleFiles.push(path);
      }
    }
    if (staleFiles.length > 0) {
      console.log(`FAIL: the hero mechanic ledger is stale:\n  ${staleFiles.join('\n  ')}`);
      console.log('Regenerate with "pnpm ledger:heroes" and commit the result.');
      return 1;
    }
    console.log(`OK: hero mechanic ledger is current (${summary.totalRows} rows).`);
    return 0;
  }

  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(LEDGER_JSON_PATH, jsonText, 'utf8');
  writeFileSync(LEDGER_CSV_PATH, csvText, 'utf8');
  console.log(`Hero mechanic ledger written (${summary.totalRows} rows):`);
  console.log(
    `  executable ${summary.byStatus.executable} · deferred ${summary.byStatus.deferred} · ` +
      `unsupported ${summary.byStatus.unsupported} · unmarked ${summary.byStatus.unmarked}`,
  );
  console.log(`  ${summary.distinctMechanics} distinct mechanics`);
  console.log(`  ${LEDGER_JSON_PATH}`);
  console.log(`  ${LEDGER_CSV_PATH}`);
  return 0;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    if (error instanceof ProbeFailure) {
      console.error(`Probe failure: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    console.error('Probe failure: the hero mechanic ledger generator threw an unexpected error.');
    console.error(error);
    process.exitCode = 2;
  });
