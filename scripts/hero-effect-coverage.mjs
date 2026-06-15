#!/usr/bin/env node
/**
 * Hero effect coverage gate (WP-250 / EC-281 / D-24021).
 *
 * Drives the REAL setup-time parser (`buildHeroAbilityHooks`) over every hero
 * card in every in-repo set (`data/cards/*.json`) and buckets each parsed
 * ability line by whether it yields an executable effect today. This is the
 * "scenario / coverage" instrument (Lever 3 of DESIGN-EFFECT-AUTHORING-SCALE.md):
 * it tells us, deterministically and for the whole corpus, which hero abilities
 * silently do nothing in a real game, and it gates CI against regression.
 *
 * Buckets (per ability-line hook produced by the engine parser):
 *   EXECUTABLE          — at least one effect's keyword is executed today
 *   PARSED_NOT_EXECUTED — parser produced an effect, but its keyword is deferred
 *   NO_EFFECT           — the card HAS printed ability text but the parser
 *                         produced no effect descriptor (the gated bug class;
 *                         vanilla/no-text cards never reach here)
 *
 * Modes:
 *   (default)          human-readable report to stdout
 *   --json             deterministic machine-readable report to stdout
 *   --check            compare against the committed baseline; exit 0/1/2
 *   --update-baseline  write the current report to the baseline (no comparison)
 *
 * Gate posture (hybrid, D-24021):
 *   HARD-FAIL (exit 1) on a true regression — a set's `noEffect` rises, or a
 *     set present in the baseline is missing from the current corpus.
 *   WARN-only (exit 0)  on a brand-new unsupported `[keyword:X]` mechanic — these
 *     appear routinely as new sets get authored and must not red every PR.
 *   PROBE FAILURE (exit 2) on a broken run — missing/unreadable baseline, missing
 *     dist imports, absent/invalid schemaVersion, JSON parse failure, zero corpus.
 *
 * No randomness, no wall-clock reads, no network. Deterministic given the
 * in-repo card data. Run from the repo root after `pnpm -r build`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRegistryFromLocalFiles } from '../packages/registry/dist/index.js';
import { buildHeroAbilityHooks } from '../packages/game-engine/dist/setup/heroAbility.setup.js';
// why: the known-markup vocabulary is sourced from the engine's canonical
// HERO_KEYWORDS array (single source of truth) instead of a duplicated local
// literal, so the unsupported-mechanic scan can never drift from the parser.
import { HERO_KEYWORDS } from '../packages/game-engine/dist/rules/heroKeywords.js';

// why: __dirname is unavailable in ESM; anchor data + baseline paths to the
// repo root (one level above scripts/) regardless of the invoking cwd.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const METADATA_DIRECTORY = join(REPO_ROOT, 'data', 'metadata');
const CARDS_DIRECTORY = join(REPO_ROOT, 'data', 'cards');
const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'coverage', 'hero-effect-coverage.baseline.json');

// why: bump this and re-baseline (explicitly) whenever the report shape changes;
// `--check` treats a baseline whose schemaVersion differs as a probe failure
// rather than silently comparing incompatible shapes.
const SCHEMA_VERSION = 1;

const KNOWN_MARKUP_KEYWORDS = new Set(HERO_KEYWORDS);

// why: the keywords whose executor branch actually mutates G today (mirrors
// MVP_KEYWORDS in heroEffects.execute.ts). This list is INFORMATIONAL ONLY —
// it drives the EXECUTABLE vs PARSED_NOT_EXECUTED split for the human report,
// and per the D-24021 decoupling invariant it MUST NOT appear in runCheck /
// compareCoverage or any exit-code decision. The gate keys on `noEffect` (pure
// parser output) so it never depends on this list; drift here can only mislabel
// the informational split, never the gate verdict.
const EXECUTED_KEYWORDS = new Set([
  'draw', 'attack', 'recruit', 'ko', 'rescue', 'reveal', 'reveal-ko',
  'reveal-min', 'reveal-ko-or-draw', 'reveal-cost-attack', 'reveal-odd-draw',
  'reveal-attack-choose', 'reveal-ko-attack', 'attack-per-count',
]);

/** Error type signalling a probe failure (exit code 2). */
class ProbeFailure extends Error {}

/**
 * Buckets one HeroAbilityHook by its executability.
 *
 * @param {{effects?: Array<{type: string}>}} hook - a parsed hook.
 * @returns {'EXECUTABLE'|'PARSED_NOT_EXECUTED'|'NO_EFFECT'} the bucket.
 */
function classifyHook(hook) {
  const effects = hook.effects ?? [];
  if (effects.length === 0) {
    return 'NO_EFFECT';
  }
  for (const effect of effects) {
    if (EXECUTED_KEYWORDS.has(effect.type)) {
      return 'EXECUTABLE';
    }
  }
  return 'PARSED_NOT_EXECUTED';
}

/**
 * Removes hooks that are byte-identical after JSON serialization.
 *
 * buildHeroAbilityHooks emits one hook per (card instance x ability line); a
 * hero with N identical copies would otherwise inflate the line counts.
 *
 * @param {object[]} hooks - hooks for a single hero.
 * @returns {object[]} the de-duplicated hooks.
 */
function deduplicateHooks(hooks) {
  const seen = new Set();
  const result = [];
  for (const hook of hooks) {
    const signature = JSON.stringify(hook);
    if (!seen.has(signature)) {
      seen.add(signature);
      result.push(hook);
    }
  }
  return result;
}

/**
 * Normalizes a `[keyword:X]` token to its bare mechanic name.
 *
 * Strips a trailing `:<digits>` or ` <digits>` magnitude, lowercases, and
 * collapses remaining whitespace to single hyphens, so `[keyword:draw:1]` and
 * `[keyword:Draw 1]` both normalize to `draw` (which IS supported) rather than
 * looking like unsupported mechanics.
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
 * Walks the whole hero corpus once and returns the structured coverage report
 * plus human-report extras (the fully-dark heroes with their ability text).
 *
 * @param {object} registry - a CardRegistry from createRegistryFromLocalFiles.
 * @returns {{report: object, darkHeroes: object[]}} structured report + extras.
 */
function analyzeCorpus(registry) {
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

  const perSet = {};
  const unsupportedMechanics = {};
  const darkHeroes = [];
  let heroesWithHooks = 0;
  let totalHooks = 0;
  let totalExecutable = 0;
  let totalParsedNotExecuted = 0;
  let totalNoEffect = 0;

  for (const [extId, info] of heroesByExtId) {
    const hooks = deduplicateHooks(buildHeroAbilityHooks(registry, { heroDeckIds: [extId] }));
    if (hooks.length > 0) {
      heroesWithHooks += 1;
      const setRow = perSet[info.setAbbr] ?? { hooks: 0, executable: 0, noEffect: 0 };
      let executableForThisHero = 0;
      for (const hook of hooks) {
        totalHooks += 1;
        setRow.hooks += 1;
        const bucket = classifyHook(hook);
        if (bucket === 'EXECUTABLE') {
          totalExecutable += 1;
          setRow.executable += 1;
          executableForThisHero += 1;
        } else if (bucket === 'PARSED_NOT_EXECUTED') {
          totalParsedNotExecuted += 1;
        } else {
          totalNoEffect += 1;
          setRow.noEffect += 1;
        }
      }
      perSet[info.setAbbr] = setRow;
      if (executableForThisHero === 0) {
        darkHeroes.push({ extId, heroName: info.heroName, abilities: info.abilities });
      }
    }

    // why: scan ALL of this hero's ability text for [keyword:X] tokens whose
    // normalized name is not a recognized HERO_KEYWORD — these are mechanics the
    // engine cannot model yet (the "missing mechanics" tail of NO_EFFECT).
    for (const ability of info.abilities) {
      const markupPattern = /\[keyword:([^\]]+)\]/g;
      let match;
      while ((match = markupPattern.exec(ability)) !== null) {
        const name = normalizeMechanicToken(match[1]);
        if (name !== '' && !KNOWN_MARKUP_KEYWORDS.has(name)) {
          unsupportedMechanics[name] = (unsupportedMechanics[name] ?? 0) + 1;
        }
      }
    }
  }

  const report = {
    schemaVersion: SCHEMA_VERSION,
    corpus: {
      heroes: heroesWithHooks,
      hooks: totalHooks,
      executable: totalExecutable,
      parsedNotExecuted: totalParsedNotExecuted,
      noEffect: totalNoEffect,
    },
    perSet,
    unsupportedMechanics,
  };
  return { report, darkHeroes };
}

/**
 * Returns a deep copy of `value` with all object keys sorted lexicographically
 * (UTF-16 code unit, the default string comparison — never localeCompare) and
 * arrays of primitives sorted the same way. Combined with a fixed indent this
 * makes serialization byte-stable across machines and Node patch versions.
 *
 * @param {unknown} value - any JSON-serializable value.
 * @returns {unknown} a key-sorted deep copy.
 */
function sortDeep(value) {
  if (Array.isArray(value)) {
    const mapped = value.map(sortDeep);
    if (mapped.every((entry) => typeof entry !== 'object' || entry === null)) {
      mapped.sort();
    }
    return mapped;
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortDeep(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Serializes a coverage report to byte-stable JSON.
 *
 * // why: the SAME serializer feeds --json output, the --check comparison input,
 * and the --update-baseline write, so a baseline written today compares equal to
 * a report generated tomorrow on a different machine (no write/read diff bugs).
 *
 * @param {object} report - a structured coverage report.
 * @returns {string} deterministic JSON with a trailing newline.
 */
function serializeDeterministic(report) {
  return `${JSON.stringify(sortDeep(report), null, 2)}\n`;
}

/**
 * Reads and validates the committed baseline. Throws a ProbeFailure on any
 * I/O / parse / schema fault (the caller maps that to exit 2).
 *
 * @returns {object} the parsed baseline report.
 */
function readBaseline() {
  let text;
  try {
    text = readFileSync(BASELINE_PATH, 'utf8');
  } catch (error) {
    throw new ProbeFailure(
      `Cannot read the coverage baseline at ${BASELINE_PATH}. Run "pnpm sim:coverage --update-baseline" on main first. Underlying error: ${error.message}`,
    );
  }
  let baseline;
  try {
    baseline = JSON.parse(text);
  } catch (error) {
    throw new ProbeFailure(
      `The coverage baseline at ${BASELINE_PATH} is not valid JSON. Regenerate it with "pnpm sim:coverage --update-baseline". Underlying error: ${error.message}`,
    );
  }
  if (baseline.schemaVersion !== SCHEMA_VERSION) {
    throw new ProbeFailure(
      `The coverage baseline schemaVersion is ${baseline.schemaVersion}, but this probe expects ${SCHEMA_VERSION}. The report shape changed; regenerate the baseline with "pnpm sim:coverage --update-baseline".`,
    );
  }
  return baseline;
}

/**
 * Asserts the current report describes a non-degenerate corpus.
 *
 * // why: a zero corpus means the registry or dist did not load — comparing or
 * baselining it would mask everything. Treat it as a probe failure, not a pass.
 *
 * @param {object} report - the current structured report.
 */
function assertCorpusLoaded(report) {
  if (report.corpus.heroes === 0 || report.corpus.hooks === 0) {
    throw new ProbeFailure(
      'The hero corpus is empty (0 heroes or 0 hooks) — the registry or built dist did not load. Run "pnpm -r build" and confirm data/cards/ is present.',
    );
  }
}

/**
 * Compares the current report against the baseline under the hybrid posture.
 *
 * @param {object} report - the current structured report.
 * @param {object} baseline - the committed baseline report.
 * @returns {{regressions: string[], warnings: string[]}} hard-fail lines + warnings.
 */
function compareCoverage(report, baseline) {
  const regressions = [];
  const warnings = [];

  // Hard-fail: a baseline set missing from current (corpus shrank), or a set's
  // noEffect rose (an executable line went dark — the refactor-regression case).
  for (const setAbbr of Object.keys(baseline.perSet)) {
    const currentSet = report.perSet[setAbbr];
    if (currentSet === undefined) {
      regressions.push(`MISSING set: ${setAbbr}`);
      continue;
    }
    if (currentSet.noEffect > baseline.perSet[setAbbr].noEffect) {
      regressions.push(
        `${setAbbr}: noEffect ${baseline.perSet[setAbbr].noEffect} → ${currentSet.noEffect}`,
      );
    }
  }

  // Warn-only: a new unsupported mechanic absent from the baseline (expected as
  // new sets get authored — surfaced, never blocking, per the hybrid posture).
  for (const mechanic of Object.keys(report.unsupportedMechanics)) {
    if (baseline.unsupportedMechanics[mechanic] === undefined) {
      warnings.push(`WARN: NEW unsupported mechanic: ${mechanic}`);
    }
  }

  return { regressions, warnings };
}

/**
 * Runs `--check`: prints warnings, prints regressions, returns the exit code.
 *
 * @param {object} report - the current structured report.
 * @returns {number} 0 (no hard-fail regression) or 1 (regression).
 */
function runCheck(report) {
  const baseline = readBaseline();
  const { regressions, warnings } = compareCoverage(report, baseline);

  for (const warning of warnings) {
    console.log(warning);
  }
  if (regressions.length > 0) {
    for (const regression of regressions) {
      console.log(regression);
    }
    console.log(
      `FAIL: hero-effect coverage regressed (${regressions.length} hard failure(s)). ` +
        'If the change is intentional, re-run "pnpm sim:coverage --update-baseline" on main.',
    );
    return 1;
  }
  console.log(
    `OK: no hero-effect coverage regression${warnings.length > 0 ? ` (${warnings.length} new-mechanic warning(s))` : ''}.`,
  );
  return 0;
}

/**
 * Prints the human-readable coverage report.
 *
 * @param {object} report - the current structured report.
 * @param {object[]} darkHeroes - heroes with ability text but 0 executable effects.
 */
function printHumanReport(report, darkHeroes) {
  const { corpus, perSet, unsupportedMechanics } = report;
  const percent = (value) => (corpus.hooks === 0 ? '0.0' : ((value / corpus.hooks) * 100).toFixed(1));

  console.log('\n=== Hero effect coverage (all in-repo sets) ===\n');
  console.log(`Heroes with >=1 parsed ability line: ${corpus.heroes}`);
  console.log(`Total parsed ability-line hooks:     ${corpus.hooks}`);
  console.log(`  EXECUTABLE            ${corpus.executable}  (${percent(corpus.executable)}%)`);
  console.log(`  PARSED_NOT_EXECUTED   ${corpus.parsedNotExecuted}  (${percent(corpus.parsedNotExecuted)}%)`);
  console.log(`  NO_EFFECT             ${corpus.noEffect}  (${percent(corpus.noEffect)}%)`);
  console.log(`Fully-dark heroes (text, 0 executable effects): ${darkHeroes.length}\n`);

  console.log('--- Per-set (set | hooks | exec | no-effect) ---');
  const sortedSets = Object.keys(perSet).sort((a, b) => perSet[b].noEffect - perSet[a].noEffect);
  for (const setAbbr of sortedSets) {
    const row = perSet[setAbbr];
    console.log(
      `${setAbbr.padEnd(6)} ${String(row.hooks).padStart(6)} ${String(row.executable).padStart(6)} ${String(row.noEffect).padStart(10)}`,
    );
  }

  console.log(`\n--- Unsupported named mechanics (no engine support): ${Object.keys(unsupportedMechanics).length} distinct ---`);
  const sortedMechanics = Object.keys(unsupportedMechanics).sort(
    (a, b) => unsupportedMechanics[b] - unsupportedMechanics[a],
  );
  for (const mechanic of sortedMechanics.slice(0, 40)) {
    console.log(`${mechanic.padEnd(26)} ${unsupportedMechanics[mechanic]}`);
  }
  console.log('');
}

/**
 * Loads the registry and dispatches the requested CLI mode.
 *
 * @returns {Promise<number>} the process exit code for the chosen mode.
 */
async function main() {
  const mode = process.argv.slice(2).find((argument) => argument.startsWith('--'));

  const registry = await createRegistryFromLocalFiles({
    metadataDir: METADATA_DIRECTORY,
    cardsDir: CARDS_DIRECTORY,
  });
  const { report, darkHeroes } = analyzeCorpus(registry);

  if (mode === '--json') {
    assertCorpusLoaded(report);
    process.stdout.write(serializeDeterministic(report));
    return 0;
  }
  if (mode === '--update-baseline') {
    assertCorpusLoaded(report);
    writeFileSync(BASELINE_PATH, serializeDeterministic(report), 'utf8');
    console.log(
      `Wrote coverage baseline (${report.corpus.hooks} hooks across ${report.corpus.heroes} heroes) to ${BASELINE_PATH}.`,
    );
    return 0;
  }
  if (mode === '--check') {
    assertCorpusLoaded(report);
    return runCheck(report);
  }
  printHumanReport(report, darkHeroes);
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
    console.error('Probe failure: the coverage probe threw an unexpected error.');
    console.error(error);
    process.exitCode = 2;
  });
