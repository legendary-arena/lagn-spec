#!/usr/bin/env node
/**
 * Runtime-observed hollow-effect harvest (WP-259 / EC-290 / D-24035).
 *
 * Reporting-loop surface 3 of 3 of `docs/ai/DESIGN-HOLLOW-EFFECT-DETECTION.md`.
 * Static coverage (`hero-mechanic-ledger` / `hero-effect-coverage`) answers
 * "is this mechanic unsupported in theory?"; this answers "did it actually bite
 * a player during play?" — by running a fixed-seed, bounded deterministic sweep
 * with the REAL card registry and reading each finished game's hollow-effect
 * diagnostics, then aggregating per mechanic into a committed canonical artifact.
 *
 * The data path (WP-263 / D-24039): the engine EMITS hollow effects into the
 * runtime-only `G.diagnostics` channel (WP-257 / D-24034) during move execution;
 * `sweepSetupMatrix` surfaces them off each finished game as the additive sibling
 * fields `cell.hollowEffects` + `cell.hollowEffectsDropped`. This harness READS
 * those — it never re-implements hollow detection and never re-classifies the
 * closed WP-257 `reason` set.
 *
 * Determinism: a fixed `RUN_SEED` + a bounded matrix ⇒ a byte-identical artifact
 * every run (randomness lives in the engine via `ctx.random.*`, never here — no
 * `Math.random`, no clock, no network). One locked serializer path: `byMechanic`
 * keys sorted, `byReason` keys in the closed WP-257 order, `examples` sorted then
 * bounded, two-space indent, one trailing newline.
 *
 * Modes:
 *   (default)          write the artifact
 *   --check            regenerate in memory + diff the committed artifact; exit 1 on drift
 *   --update-baseline  write the artifact (alias of default)
 *
 * Run from the repo root after `pnpm -r build` (imports the engine + registry dist).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRegistryFromLocalFiles } from '../packages/registry/dist/index.js';
// why: import the COMPILED engine dist, not the .ts source — plain `node` cannot
// resolve TypeScript, and importing the build output preserves the packages/**
// empty-diff boundary (the hero-effect-coverage.mjs / hero-mechanic-ledger.mjs
// precedent). `cell.hollowEffects` / `cell.hollowEffectsDropped` are the WP-263
// sibling fields the dispatcher surfaces off each finished game.
import { sweepSetupMatrix } from '../packages/game-engine/dist/simulation/sweep.runner.js';
import { createRandomPolicy } from '../packages/game-engine/dist/simulation/ai.random.js';

// why: __dirname is unavailable in ESM; anchor data + artifact paths to the repo
// root (one level above scripts/) regardless of the invoking cwd.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(SCRIPT_DIRECTORY);
const METADATA_DIRECTORY = join(REPO_ROOT, 'data', 'metadata');
const CARDS_DIRECTORY = join(REPO_ROOT, 'data', 'cards');
const ARTIFACT_PATH = join(REPO_ROOT, 'docs', 'ai', 'coverage', 'runtime-observed-hollows.json');

// why: bump + re-baseline whenever the artifact shape changes; `--check` would
// otherwise compare incompatible shapes silently.
const SCHEMA_VERSION = 1;

// why (the fixed run seed): determinism is load-bearing. A fixed seed through the
// engine's `ctx.random.*` makes the bounded sweep produce a byte-identical
// artifact every run, so `--check` can regenerate + diff (the hero-effect-coverage
// precedent). Changing this re-baselines the artifact.
const RUN_SEED = 'wp259-runtime-observed-v1';

// why: per-seat seeds nest on the per-cell seed via the WP-193 `::seat:`
// convention (D-19303), so the two-domain PRNG invariant holds at every level.
const SEAT_SEED_SEPARATOR = '::seat:';

// why (locked matrix — fast per-PR smoke baseline; recorded zero-state):
// a single 1-player game over a known-valid board, driven by the RANDOM policy
// so the `:check` stays sub-second and per-PR-affordable. The random policy is
// PASSIVE — it reveals villains + advances the stage but does not recruit / play
// / fight — so it executes no declared card abilities and surfaces no runtime
// hollows on the current baseline: this harness therefore commits a RECORDED
// ZERO-STATE (summary.* all 0, byMechanic empty). The HQ heroes are drawn from
// `wwhk` (the set with the most heroes whose declared mechanics reach no handler)
// so the heavier COMPETENT-PLAY sweep — which drives recruit/play/fight and thus
// executes those abilities — would surface real hero hollows over this same
// board. That deeper sweep is multi-minute per game (the real-registry decision
// cost) and is therefore deferred to a scheduled cron per the D-24035
// CI-affordability fallback, not run per-PR. Recorded verbatim in
// generatedFrom.matrixDescription. The composition's schemeId/mastermindId are
// substituted per cell; the axes hold a single scheme × mastermind (one game).
const PLAYER_COUNT = 1;
const BASE_COMPOSITION = {
  schemeId: 'core/legacy-virus-the',
  mastermindId: 'core/dr-doom',
  villainGroupIds: ['core/brotherhood'],
  henchmanGroupIds: ['core/savage-land-mutates'],
  heroDeckIds: [
    'wwhk/amadeus-cho',
    'wwhk/gladiator-hulk',
    'wwhk/hiroim',
    'wwhk/korg',
    'wwhk/bruce-banner',
  ],
  bystandersCount: 12,
  woundsCount: 30,
  officersCount: 16,
  sidekicksCount: 16,
};
const SCHEME_IDS = ['core/legacy-virus-the'];
const MASTERMIND_IDS = ['core/dr-doom'];

// why: a small per-mechanic example cap keeps the artifact compact + the diff
// stable; examples are sorted deterministically BEFORE truncation so the same
// input set always retains the same examples.
const EXAMPLES_CAP = 5;

// why: the closed WP-257 hollow-reason set, in canonical order (NOT alphabetical
// — alphabetical would reorder to no-handler/parse-unrecognized/unsupported-keyword).
// byReason objects are always emitted with all three keys, even at 0, for a stable
// JSON shape that --check can diff.
const HOLLOW_REASONS = ['no-handler', 'unsupported-keyword', 'parse-unrecognized'];

/** Error type signalling a probe failure (exit code 2). */
class ProbeFailure extends Error {}

/**
 * Builds a fresh by-reason tally with all three closed reasons at zero.
 *
 * @returns {Record<string, number>} a zeroed by-reason object in closed order.
 */
function emptyByReason() {
  const tally = {};
  for (const reason of HOLLOW_REASONS) {
    tally[reason] = 0;
  }
  return tally;
}

/**
 * Builds the per-seat policy list for one cell using the WP-193 nested seed.
 *
 * @param {string} cellSeed - the dispatcher-derived per-cell seed.
 * @param {number} playerCount - seat count.
 * @returns {readonly object[]} one random policy per seat (the fast per-PR path).
 */
function buildPoliciesForCell(cellSeed, playerCount) {
  const policies = [];
  for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
    policies.push(createRandomPolicy(`${cellSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`));
  }
  return policies;
}

/**
 * Runs the bounded sweep and aggregates the runtime-observed hollow effects.
 *
 * // why (reads, never re-detects): the engine already classified each record's
 * hollow `reason` (WP-257); this counts what `cell.hollowEffects` carries. The
 * hollowEffectsDropped aggregation makes the counts a LOWER BOUND rather than
 * exact if any game hit HOLLOW_EFFECTS_CAP — guarded to 0 before commit so the
 * artifact never ships a silent undercount.
 *
 * @param {object} registry - the real CardRegistry from createRegistryFromLocalFiles.
 * @returns {{byMechanic: Map<string, object>, gamesPlayed: number, totalObservations: number, hollowEffectsDropped: number, summaryByReason: Record<string, number>}}
 */
function harvest(registry) {
  const byMechanic = new Map();
  let gamesPlayed = 0;
  let totalObservations = 0;
  let hollowEffectsDropped = 0;
  const summaryByReason = emptyByReason();

  sweepSetupMatrix(
    BASE_COMPOSITION,
    PLAYER_COUNT,
    SCHEME_IDS,
    MASTERMIND_IDS,
    registry,
    buildPoliciesForCell,
    RUN_SEED,
    (cell) => {
      gamesPlayed += 1;
      hollowEffectsDropped += cell.hollowEffectsDropped ?? 0;
      for (const record of cell.hollowEffects ?? []) {
        totalObservations += 1;
        summaryByReason[record.reason] += 1;
        const entry = byMechanic.get(record.mechanic) ?? {
          hitCount: 0,
          lastSeenTurn: 0,
          byReason: emptyByReason(),
          examples: [],
        };
        entry.hitCount += 1;
        if (record.turn > entry.lastSeenTurn) {
          entry.lastSeenTurn = record.turn;
        }
        entry.byReason[record.reason] += 1;
        entry.examples.push({
          cardId: record.cardId,
          cardType: record.cardType,
          timing: record.timing,
          reason: record.reason,
        });
        byMechanic.set(record.mechanic, entry);
      }
    },
  );

  return { byMechanic, gamesPlayed, totalObservations, hollowEffectsDropped, summaryByReason };
}

/**
 * Returns a by-reason object with the three closed keys in canonical order.
 *
 * @param {Record<string, number>} byReason - a tally (any key order).
 * @returns {Record<string, number>} the same counts, keys in closed WP-257 order.
 */
function orderedByReason(byReason) {
  const ordered = {};
  for (const reason of HOLLOW_REASONS) {
    ordered[reason] = byReason[reason] ?? 0;
  }
  return ordered;
}

/**
 * Deterministic sort key for an example (so the same record set sorts the same
 * way before bounding).
 *
 * @param {{cardId: string, cardType: string, timing: string, reason: string}} example
 * @returns {string} the composite sort key.
 */
function exampleSortKey(example) {
  return `${example.cardId}|${example.cardType}|${example.timing}|${example.reason}`;
}

/**
 * Builds the canonical artifact object with deterministic key ordering:
 * `byMechanic` keys sorted, `byReason` in closed order, `examples` sorted then
 * bounded. `JSON.stringify` preserves this insertion order, so a plain serialize
 * is byte-stable (no alphabetical sortDeep — that would reorder `byReason`).
 *
 * @param {object} harvested - the harvest() result.
 * @returns {object} the canonical artifact.
 */
function buildArtifact(harvested) {
  const { byMechanic, gamesPlayed, totalObservations, hollowEffectsDropped, summaryByReason } =
    harvested;

  const byMechanicOut = {};
  for (const mechanic of [...byMechanic.keys()].sort()) {
    const entry = byMechanic.get(mechanic);
    const sortedExamples = [...entry.examples].sort((left, right) => {
      const leftKey = exampleSortKey(left);
      const rightKey = exampleSortKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    byMechanicOut[mechanic] = {
      hitCount: entry.hitCount,
      lastSeenTurn: entry.lastSeenTurn,
      byReason: orderedByReason(entry.byReason),
      examples: sortedExamples.slice(0, EXAMPLES_CAP),
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedFrom: {
      runSeed: RUN_SEED,
      gamesPlayed,
      matrixDescription:
        `policy=random (fast per-PR smoke baseline). Since WP-266's onBegin ` +
        `parity gives the simulation loop a drawn hand each turn, the random ` +
        `policy now plays cards and surfaces the runtime hollows those plays ` +
        `trigger — this is no longer a zero-state, but it is still a shallow ` +
        `RANDOM-policy sample, not the competent-play coverage WP-265's deferred ` +
        `cron will provide (the D-24035 CI-affordability fallback). ` +
        `playerCount=${PLAYER_COUNT}; schemeIds=[${SCHEME_IDS.join(', ')}] × ` +
        `mastermindIds=[${MASTERMIND_IDS.join(', ')}]; heroes=[${BASE_COMPOSITION.heroDeckIds.join(', ')}]; ` +
        `villainGroups=[${BASE_COMPOSITION.villainGroupIds.join(', ')}]; ` +
        `henchmanGroups=[${BASE_COMPOSITION.henchmanGroupIds.join(', ')}]`,
    },
    summary: {
      distinctMechanics: byMechanic.size,
      totalObservations,
      hollowEffectsDropped,
      byReason: orderedByReason(summaryByReason),
    },
    byMechanic: byMechanicOut,
  };
}

/**
 * Serializes the artifact to byte-stable JSON (two-space indent, one trailing
 * newline). Relies on the deterministic key ordering buildArtifact installed.
 *
 * @param {object} artifact - the canonical artifact.
 * @returns {string} deterministic JSON with a trailing newline.
 */
function serializeDeterministic(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

/**
 * Asserts the harvest is non-degenerate — a zero-game run means the registry or
 * dist did not load, which would mask everything.
 *
 * @param {object} harvested - the harvest() result.
 */
function assertHarvestLoaded(harvested) {
  if (harvested.gamesPlayed === 0) {
    throw new ProbeFailure(
      'The runtime-observed sweep played 0 games — the registry or built dist did not load. Run "pnpm -r build" and confirm data/cards/ is present.',
    );
  }
}

/**
 * Runs `--check`: regenerate, diff the committed artifact, return the exit code.
 *
 * // why (--check exit-1-on-drift): mirrors hero-effect-coverage — a freshness
 * gate that fails loudly when the committed artifact no longer matches a clean
 * regenerate (a new hollow mechanic, a hitCount rise, or a non-deterministic
 * source creeping in).
 *
 * @param {string} freshText - the freshly serialized artifact.
 * @returns {number} 0 (fresh) or 1 (stale/drift).
 */
function runCheck(freshText) {
  let committed;
  try {
    committed = readFileSync(ARTIFACT_PATH, 'utf8');
  } catch (error) {
    console.log(
      `FAIL: the runtime-observed hollows artifact is missing at ${ARTIFACT_PATH}. ` +
        `Regenerate with "pnpm sim:runtime-observed" and commit it. Underlying error: ${error.message}`,
    );
    return 1;
  }
  // why: the committed file may be CRLF in a Windows working tree (git autocrlf)
  // while the generator always writes LF; compare line-ending-normalized so
  // --check tests content, not the platform's newline style.
  const normalize = (text) => text.replace(/\r\n/g, '\n');
  if (normalize(committed) !== normalize(freshText)) {
    console.log(
      'FAIL: the runtime-observed hollows artifact is stale. ' +
        'Regenerate with "pnpm sim:runtime-observed" and commit the result.',
    );
    return 1;
  }
  console.log('OK: runtime-observed hollows artifact is current.');
  return 0;
}

/**
 * Loads the registry, runs the sweep, and dispatches the requested CLI mode.
 *
 * @returns {Promise<number>} the process exit code.
 */
async function main() {
  const mode = process.argv.slice(2).find((argument) => argument.startsWith('--'));

  const registry = await createRegistryFromLocalFiles({
    metadataDir: METADATA_DIRECTORY,
    cardsDir: CARDS_DIRECTORY,
  });
  const harvested = harvest(registry);
  assertHarvestLoaded(harvested);

  const artifact = buildArtifact(harvested);
  const text = serializeDeterministic(artifact);

  if (mode === '--check') {
    return runCheck(text);
  }

  // default + --update-baseline: write the artifact.
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, text, 'utf8');
  console.log(
    `Runtime-observed hollows written (${harvested.gamesPlayed} game(s); ` +
      `${artifact.summary.distinctMechanics} distinct mechanic(s); ` +
      `${artifact.summary.totalObservations} observation(s); ` +
      `dropped ${artifact.summary.hollowEffectsDropped}):`,
  );
  console.log(`  ${ARTIFACT_PATH}`);
  if (artifact.summary.hollowEffectsDropped > 0) {
    console.log(
      'WARNING: hollowEffectsDropped > 0 — a game hit HOLLOW_EFFECTS_CAP and the counts are a lower bound. ' +
        'Reduce the matrix/bound or move the heavier sweep to a cron before committing.',
    );
  }
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
    console.error('Probe failure: the runtime-observed hollows harness threw an unexpected error.');
    console.error(error);
    process.exitCode = 2;
  });
