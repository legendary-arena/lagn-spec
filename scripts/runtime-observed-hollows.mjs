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
import { createCompetentHeuristicPolicy } from '../packages/game-engine/dist/simulation/ai.competent.js';

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

// why (the fixed run seed): determinism is load-bearing. A fixed RUN_SEED through
// the engine's `ctx.random.*` makes the bounded competent sweep produce a
// byte-identical artifact every run, so `--check` can regenerate + diff (the
// hero-effect-coverage precedent). Changing this re-baselines the artifact.
const RUN_SEED = 'wp265-real-v1';

// why: per-seat seeds nest on the per-cell seed via the WP-193 `::seat:`
// convention (D-19303), so the two-domain PRNG invariant holds at every level.
const SEAT_SEED_SEPARATOR = '::seat:';

// why (the locked competent hero-diverse matrix — real signal, per-PR-affordable):
// runtime hollows surface only when a competent policy actually recruits / plays /
// fights (the random policy is too passive), and only for the hero abilities a
// given board's heroes declare. Measurement (WP-265 re-scope, post-WP-266) showed
// the signal lever is BOARD/HERO DIVERSITY, not seeds — 40 seeds over one board
// surface the same single mechanic, while sweeping hero decks across every set
// surfaces many. So the matrix sweeps one hero-deck board per set (HERO_DECK_SETS)
// over the known-valid SENTINEL_CORE, each board run over SEEDS_PER_BOARD seeds so
// its hollow-able abilities are actually drawn + played. maxTurns (WP-264) bounds
// each game so the whole sweep is ~1 s (39 sets × 8 seeds = 312 competent games,
// ~2.7 ms each) — well within a per-PR budget, which is why WP-259's per-PR
// `--check` is kept (no cron). This matrix is a hardcoded locked value — the
// harness must NEVER read hero-mechanic-ledger.json (or any generated artifact) at
// runtime; the sets / heroes below were chosen at scaffold time and the
// distinct-mechanic count plateaus at 16 by 8 seeds.
const PLAYER_COUNT = 1;

// why: bounding each competent game (WP-264 / D-24040); 50 is well above the
// ~20–40 turns a real game runs yet low enough that an unproductive board
// terminates fast instead of grinding to the 200-turn cap.
const MAX_TURNS = 50;

// why: a few seeds per board so each board's hollow-able abilities get drawn +
// played across runs; the distinct-mechanic count plateaus at 8 seeds (8, 16, and
// 24 seeds all surface 16 mechanics), so 8 is the affordable lock.
const SEEDS_PER_BOARD = 8;

// why: the known-valid board core every hero-deck set is dropped onto (the only
// committed valid-board fixture, sentinel-core-doom). Heroes vary per set; scheme /
// mastermind / villain group / henchman group / supply counts are fixed.
const SENTINEL_CORE = {
  schemeId: 'core/legacy-virus-the',
  mastermindId: 'core/dr-doom',
  villainGroupIds: ['core/brotherhood'],
  henchmanGroupIds: ['core/savage-land-mutates'],
  bystandersCount: 12,
  woundsCount: 30,
  officersCount: 16,
  sidekicksCount: 16,
};

// why: the hardcoded hero-deck-set matrix — one board per set, 5 hero IDs each
// (the first five sorted heroes of each set with >= 5 heroes). Locked at scaffold
// time, NOT read from hero-mechanic-ledger.json at runtime. Each set's heroes are
// dropped onto SENTINEL_CORE to form a valid board (all 39 validated at scaffold
// time with 0 setup failures).
const HERO_DECK_SETS = [
  { set: '2099', heroDeckIds: ['2099/doctor-doom-2099', '2099/ghost-rider-2099', '2099/hulk-2099', '2099/ravage-2099', '2099/spider-man-2099'] },
  { set: '3dtc', heroDeckIds: ['3dtc/black-widow', '3dtc/deadpool', '3dtc/howard-the-duck', '3dtc/hulk', '3dtc/man-thing'] },
  { set: 'amwp', heroDeckIds: ['amwp/ant-army', 'amwp/ant-man', 'amwp/cassie-lang', 'amwp/freedom-fighters', 'amwp/janet-van-dyne'] },
  { set: 'anni', heroDeckIds: ['anni/brainstorm', 'anni/fantastic-four-united', 'anni/heralds-of-galactus', 'anni/psi-lord', 'anni/super-skrull'] },
  { set: 'antm', heroDeckIds: ['antm/ant-man', 'antm/black-knight', 'antm/jocasta', 'antm/wasp', 'antm/wonder-man'] },
  { set: 'asrd', heroDeckIds: ['asrd/beta-ray-bill', 'asrd/lady-sif', 'asrd/thor', 'asrd/valkyrie', 'asrd/warriors-three-the'] },
  { set: 'bkpt', heroDeckIds: ['bkpt/general-okoye', 'bkpt/king-black-panther', 'bkpt/princess-shuri', 'bkpt/queen-storm-of-wakanda', 'bkpt/white-wolf'] },
  { set: 'bkwd', heroDeckIds: ['bkwd/black-widow', 'bkwd/falcon-winter-soldier', 'bkwd/red-guardian', 'bkwd/white-tiger', 'bkwd/yelena-belova'] },
  { set: 'ca75', heroDeckIds: ['ca75/agent-x-13', 'ca75/captain-america-1941', 'ca75/captain-america-falcon', 'ca75/steve-rogers-director-of-shield', 'ca75/winter-soldier'] },
  { set: 'chmp', heroDeckIds: ['chmp/gwenpool', 'chmp/ms-marvel', 'chmp/nova', 'chmp/totally-awesome-hulk', 'chmp/viv-vision'] },
  { set: 'core', heroDeckIds: ['core/black-widow', 'core/captain-america', 'core/cyclops', 'core/deadpool', 'core/emma-frost'] },
  { set: 'cosm', heroDeckIds: ['cosm/adam-warlock', 'cosm/captain-mar-vell', 'cosm/moondragon', 'cosm/nebula', 'cosm/nova'] },
  { set: 'cvwr', heroDeckIds: ['cvwr/captain-america-secret-avenger', 'cvwr/cloak-dagger', 'cvwr/daredevil', 'cvwr/falcon', 'cvwr/goliath'] },
  { set: 'dead', heroDeckIds: ['dead/bob-agent-of-hydra', 'dead/deadpool', 'dead/slapstick', 'dead/solo', 'dead/stingray'] },
  { set: 'dims', heroDeckIds: ['dims/howard-the-duck', 'dims/jessica-jones', 'dims/man-thing', 'dims/ms-america', 'dims/squirrel-girl'] },
  { set: 'dkcy', heroDeckIds: ['dkcy/angel', 'dkcy/bishop', 'dkcy/blade', 'dkcy/cable', 'dkcy/colossus'] },
  { set: 'dstr', heroDeckIds: ['dstr/ancient-one-the', 'dstr/clea', 'dstr/doctor-strange', 'dstr/doctor-voodoo', 'dstr/vishanti-the'] },
  { set: 'fear', heroDeckIds: ['fear/greithoth-breaker-of-wills', 'fear/kuurth-breaker-of-stone', 'fear/nerkkod-breaker-of-oceans', 'fear/nul-breaker-of-worlds', 'fear/skadi'] },
  { set: 'ff04', heroDeckIds: ['ff04/human-torch', 'ff04/invisible-woman', 'ff04/mr-fantastic', 'ff04/silver-surfer', 'ff04/thing'] },
  { set: 'gotg', heroDeckIds: ['gotg/drax-the-destroyer', 'gotg/gamora', 'gotg/groot', 'gotg/rocket-raccoon', 'gotg/star-lord'] },
  { set: 'mdns', heroDeckIds: ['mdns/blade-daywalker', 'mdns/elsa-bloodstone', 'mdns/morbius', 'mdns/werewolf-by-night', 'mdns/wong-master-of-the-mystic-arts'] },
  { set: 'mgtg', heroDeckIds: ['mgtg/drax', 'mgtg/gamora', 'mgtg/mantis', 'mgtg/rocket-groot', 'mgtg/star-lord'] },
  { set: 'msis', heroDeckIds: ['msis/black-panther', 'msis/bruce-banner', 'msis/captain-marvel', 'msis/doctor-strange', 'msis/wanda-vision'] },
  { set: 'msmc', heroDeckIds: ['msmc/m', 'msmc/multiple-man', 'msmc/rictor', 'msmc/shatterstar', 'msmc/siryn'] },
  { set: 'msp1', heroDeckIds: ['msp1/black-widow', 'msp1/captain-america', 'msp1/hawkeye', 'msp1/hulk', 'msp1/iron-man'] },
  { set: 'nmut', heroDeckIds: ['nmut/karma', 'nmut/mirage', 'nmut/sunspot', 'nmut/warlock', 'nmut/wolfsbane'] },
  { set: 'noir', heroDeckIds: ['noir/angel-noir', 'noir/daredevil-noir', 'noir/iron-man-noir', 'noir/luke-cage-noir', 'noir/spider-man-noir'] },
  { set: 'pttr', heroDeckIds: ['pttr/black-cat', 'pttr/moon-knight', 'pttr/scarlet-spider', 'pttr/spider-woman', 'pttr/symbiote-spider-man'] },
  { set: 'rlmk', heroDeckIds: ['rlmk/black-bolt', 'rlmk/crystal', 'rlmk/gorgon', 'rlmk/karnak', 'rlmk/medusa'] },
  { set: 'rvlt', heroDeckIds: ['rvlt/captain-marvel-agent-of-shield', 'rvlt/darkhawk', 'rvlt/hellcat', 'rvlt/photon', 'rvlt/quicksilver'] },
  { set: 'shld', heroDeckIds: ['shld/agent-phil-coulson', 'shld/deathlok', 'shld/dum-dum-dugan', 'shld/grant-ward', 'shld/gw-bridge'] },
  { set: 'smhc', heroDeckIds: ['smhc/happy-hogan', 'smhc/high-tech-spider-man', 'smhc/peter-parker-homecoming', 'smhc/peters-allies', 'smhc/tony-stark'] },
  { set: 'ssw1', heroDeckIds: ['ssw1/apocalyptic-kitty-pryde', 'ssw1/black-bolt', 'ssw1/black-panther', 'ssw1/captain-marvel', 'ssw1/dr-strange'] },
  { set: 'ssw2', heroDeckIds: ['ssw2/agent-venom', 'ssw2/arkon-the-magnificent', 'ssw2/beast', 'ssw2/black-swan', 'ssw2/captain-and-the-devil-the'] },
  { set: 'vill', heroDeckIds: ['vill/bullseye', 'vill/dr-octopus', 'vill/electro', 'vill/enchantress', 'vill/green-goblin'] },
  { set: 'vnom', heroDeckIds: ['vnom/carnage', 'vnom/venom', 'vnom/venom-rocket', 'vnom/venomized-dr-strange', 'vnom/venompool'] },
  { set: 'wtif', heroDeckIds: ['wtif/apocalyptic-black-widow', 'wtif/captain-carter', 'wtif/doctor-strange-supreme', 'wtif/gamora-destroyer-of-thanos', 'wtif/killmonger-spec-ops'] },
  { set: 'wwhk', heroDeckIds: ['wwhk/amadeus-cho', 'wwhk/bruce-banner', 'wwhk/caiera', 'wwhk/gladiator-hulk', 'wwhk/hiroim'] },
  { set: 'xmen', heroDeckIds: ['xmen/aurora-northstar', 'xmen/banshee', 'xmen/beast', 'xmen/cannonball', 'xmen/colossus-wolverine'] },
];

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
 * why: the competent-heuristic policy (not the passive random policy) is what
 * actually recruits / plays / fights, so it executes declared card abilities and
 * surfaces the runtime hollows this artifact records. Seeded per seat for
 * determinism.
 *
 * @param {string} cellSeed - the dispatcher-derived per-cell seed.
 * @param {number} playerCount - seat count.
 * @returns {readonly object[]} one competent-heuristic policy per seat.
 */
function buildPoliciesForCell(cellSeed, playerCount) {
  const policies = [];
  for (let seatIndex = 0; seatIndex < playerCount; seatIndex++) {
    policies.push(createCompetentHeuristicPolicy(`${cellSeed}${SEAT_SEED_SEPARATOR}${seatIndex}`));
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
  const counters = { gamesPlayed: 0, totalObservations: 0, hollowEffectsDropped: 0 };
  const summaryByReason = emptyByReason();

  // why: one aggregation callback shared across every board × seed cell — counts
  // what each finished game's `cell.hollowEffects` (WP-263) carries; never
  // re-detects. hollowEffectsDropped is summed so a cap hit becomes a visible
  // lower bound (guarded to 0 before commit).
  const aggregateCell = (cell) => {
    counters.gamesPlayed += 1;
    counters.hollowEffectsDropped += cell.hollowEffectsDropped ?? 0;
    for (const record of cell.hollowEffects ?? []) {
      counters.totalObservations += 1;
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
  };

  // why: sweep one hero-deck board per set over the sentinel core, each board over
  // SEEDS_PER_BOARD seeds so its hollow-able abilities are actually drawn + played.
  // Each sweepSetupMatrix call runs the single sentinel scheme × mastermind = one
  // competent game, bounded by MAX_TURNS (WP-264). The run seed nests the set +
  // seed index so every game is a distinct, reproducible trajectory (D-19303).
  for (const board of HERO_DECK_SETS) {
    const composition = { ...SENTINEL_CORE, heroDeckIds: board.heroDeckIds };
    for (let seedIndex = 0; seedIndex < SEEDS_PER_BOARD; seedIndex++) {
      const boardRunSeed = `${RUN_SEED}::${board.set}::seed${seedIndex}`;
      sweepSetupMatrix(
        composition,
        PLAYER_COUNT,
        [SENTINEL_CORE.schemeId],
        [SENTINEL_CORE.mastermindId],
        registry,
        buildPoliciesForCell,
        boardRunSeed,
        aggregateCell,
        undefined,
        MAX_TURNS,
      );
    }
  }

  return {
    byMechanic,
    gamesPlayed: counters.gamesPlayed,
    totalObservations: counters.totalObservations,
    hollowEffectsDropped: counters.hollowEffectsDropped,
    summaryByReason,
  };
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
        `policy=competent-heuristic; maxTurns=${MAX_TURNS}; playerCount=${PLAYER_COUNT}; ` +
        `seedsPerBoard=${SEEDS_PER_BOARD}; runSeed=${RUN_SEED}. Real signal (WP-265): ` +
        `the competent policy recruits / plays / fights (enabled by WP-266 onBegin ` +
        `parity) and surfaces the runtime hollows those plays trigger. The signal ` +
        `lever is hero/board diversity, not seeds — each hero-deck set below is ` +
        `swept over the sentinel core × ${SEEDS_PER_BOARD} seeds. sentinelCore: ` +
        `scheme=${SENTINEL_CORE.schemeId}, mastermind=${SENTINEL_CORE.mastermindId}, ` +
        `villainGroups=[${SENTINEL_CORE.villainGroupIds.join(', ')}], ` +
        `henchmanGroups=[${SENTINEL_CORE.henchmanGroupIds.join(', ')}]. heroDeckSets: ` +
        HERO_DECK_SETS.map((board) => `${board.set}{${board.heroDeckIds.join(', ')}}`).join('; '),
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
