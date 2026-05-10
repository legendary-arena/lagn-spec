/**
 * PAR Publication Gate — Server Layer (WP-051)
 *
 * Loads both source-class PAR indices (seed and simulation) at server
 * startup via the engine's `loadParIndex` helper, then exposes a
 * synchronous `checkParPublished` gate that callers (future submission
 * and leaderboard endpoints) use to determine whether a scenario's PAR
 * is published. Sim-over-seed precedence is preserved per D-5003 /
 * D-5101; absence from both indices returns `null` (fail-closed).
 *
 * This module is deliberately fs-free — every byte of PAR data enters
 * the server through the engine's public API (D-5001 line 8937). The
 * engine owns index shape validation and source-class stamp enforcement
 * (D-5103); the server trusts the loaded index verbatim at request time.
 *
 * Belongs to the server layer only. Game engine code must never import
 * it; it speaks only to engine-exported types and helpers.
 */

import {
  loadParIndex,
  lookupParFromIndex,
  ParStoreReadError,
} from '@legendary-arena/game-engine/setup';

/** @typedef {import('@legendary-arena/game-engine').ParIndex} ParIndex */
/** @typedef {import('@legendary-arena/game-engine').ParArtifactSource} ParArtifactSource */
/** @typedef {import('@legendary-arena/game-engine').ScenarioKey} ScenarioKey */
/** @typedef {import('@legendary-arena/game-engine').ScenarioScoringConfig} ScenarioScoringConfig */

/**
 * @typedef {Object} ParGateHit
 * @property {number} parValue    Effective PAR for the scenario (winning class).
 * @property {string} parVersion  The active PAR version string the gate was
 *                                constructed with (stable for process lifetime).
 * @property {ParArtifactSource} source  'simulation' when the sim index covered
 *                                the scenario; 'seed' when only the seed index
 *                                covered it. Load-bearing for WP-053 / WP-054
 *                                leaderboard records.
 * @property {ScenarioScoringConfig} scoringConfig  Inline-materialized config
 *                                from the winning index entry per D-5306b.
 *                                Non-optional: every published PAR is the atomic
 *                                tuple (scenarioKey, parValue, scoringConfig).
 *                                The gate sources this from the in-memory
 *                                ParIndex loaded once at startup; D-5103
 *                                fs-free invariant preserved.
 */

/**
 * @typedef {Object} ParGate
 * @property {(scenarioKey: ScenarioKey) => (ParGateHit | null)} checkParPublished
 *   Synchronous gate check. Partial application of the module-level
 *   `checkParPublished` over the indices loaded at startup.
 * @property {number} simulationScenarioCount  Count of scenarios covered by
 *   the simulation index at load time; 0 when the simulation index is missing
 *   or malformed. Exposed for observability hooks in future WPs.
 * @property {number} seedScenarioCount  Count of scenarios covered by the
 *   seed index at load time; 0 when the seed index is missing or malformed.
 */

/**
 * Pure synchronous lookup across both in-memory PAR indices. Queries the
 * simulation index first; if it covers the scenario, returns a fresh object
 * with `source: 'simulation'`. Otherwise queries the seed index; if it
 * covers the scenario, returns a fresh object with `source: 'seed'`.
 * Returns `null` when the scenario is absent from both indices, and also
 * when both indices are `null` (fail-closed posture).
 *
 * Forbidden behaviors:
 * - Reading any file or directory (the indices are the oracle; D-5103)
 * - Returning a reference into either index (aliasing would let callers
 *   mutate the in-memory index through a held reference — copilot #17)
 * - Computing, inferring, or defaulting PAR for a scenario absent from
 *   both indices (fail-closed per EC-051)
 *
 * @param {ParIndex | null} simulationIndex  The sim-class index as loaded at
 *   startup, or `null` when that class had no coverage / failed to load.
 * @param {ParIndex | null} seedIndex  The seed-class index as loaded at
 *   startup, or `null` when that class had no coverage / failed to load.
 * @param {ScenarioKey} scenarioKey  The scenario identifier to check.
 * @returns {ParGateHit | null}
 */
export function checkParPublished(simulationIndex, seedIndex, scenarioKey) {
  // why: the in-memory index is the canonical oracle of PAR publication;
  // filesystem probing at request time is forbidden (D-5103 existence-based
  // trust). Sim-over-seed precedence preserves the three-phase PAR
  // derivation pipeline at the gate layer per D-5003 / D-5101 — seed
  // provides day-one coverage, simulation supersedes it once calibrated.
  if (simulationIndex !== null) {
    const simulationEntry = lookupParFromIndex(simulationIndex, scenarioKey);
    if (simulationEntry !== null) {
      // why: fresh object literal — the lookupParFromIndex result references
      // into the index. Returning it directly would let a caller mutate the
      // in-memory index by writing to the returned reference (aliasing guard
      // per copilot #17 / EC-051 Locked Values).
      // why: scoringConfig sourced from the full per-scenario index entry
      // (not lookupParFromIndex which returns only path/parValue) so the
      // gate emits the D-5306b-materialized config without a second lookup.
      // The reference is shared with the index — readonly typing on
      // ScenarioScoringConfig protects against caller mutation.
      return {
        parValue: simulationEntry.parValue,
        parVersion: simulationIndex.parVersion,
        source: 'simulation',
        scoringConfig: simulationIndex.scenarios[scenarioKey].scoringConfig,
      };
    }
  }

  if (seedIndex !== null) {
    const seedEntry = lookupParFromIndex(seedIndex, scenarioKey);
    if (seedEntry !== null) {
      // why: fresh object literal — see simulation-branch rationale above.
      return {
        parValue: seedEntry.parValue,
        parVersion: seedIndex.parVersion,
        source: 'seed',
        scoringConfig: seedIndex.scenarios[scenarioKey].scoringConfig,
      };
    }
  }

  return null;
}

/**
 * Emits a full-sentence warn log for a `ParStoreReadError` raised while
 * loading one source-class index. Re-thrown error classes are not swallowed
 * — non-`ParStoreReadError` failures should surface loudly because they
 * indicate infrastructure problems (permission denied, disk full) rather
 * than structural index issues.
 *
 * @param {ParArtifactSource} source  Which class's load failed.
 * @param {string} indexPath  Display path for the operator log message.
 * @returns {(error: unknown) => null}
 */
function handleParLoadError(source, indexPath) {
  return (error) => {
    if (error instanceof ParStoreReadError) {
      console.warn(
        `[server] PAR ${source} index at ${indexPath} failed structural validation: ${error.message} ` +
        `Continuing with ${source === 'simulation' ? 'seed' : 'simulation'}-class coverage only; competitive submissions may be narrowed.`
      );
      return null;
    }
    throw error;
  };
}

/**
 * Counts the size of the union of scenario keys across both loaded indices.
 * Pure function; takes `null` for either parameter when the corresponding
 * class failed to load or had no coverage. Used solely to compose the
 * startup log line.
 *
 * @param {ParIndex | null} simulationIndex
 * @param {ParIndex | null} seedIndex
 * @returns {number}
 */
function countUnionScenarios(simulationIndex, seedIndex) {
  const unionKeys = new Set();
  if (simulationIndex !== null) {
    for (const key of Object.keys(simulationIndex.scenarios)) {
      unionKeys.add(key);
    }
  }
  if (seedIndex !== null) {
    for (const key of Object.keys(seedIndex.scenarios)) {
      unionKeys.add(key);
    }
  }
  return unionKeys.size;
}

/**
 * Builds the startup log line describing which source classes were loaded
 * and how many scenarios each covers. Full sentences per code-style Rule 11.
 *
 * @param {ParIndex | null} simulationIndex
 * @param {ParIndex | null} seedIndex
 * @param {string} parVersion
 * @returns {string}
 */
function formatStartupLogLine(simulationIndex, seedIndex, parVersion) {
  if (simulationIndex === null && seedIndex === null) {
    return (
      `[server] PAR index unavailable at both data/par/sim/${parVersion}/index.json ` +
      `and data/par/seed/${parVersion}/index.json; competitive submissions disabled.`
    );
  }
  if (simulationIndex !== null && seedIndex === null) {
    return (
      `[server] PAR seed index unavailable at data/par/seed/${parVersion}/index.json; ` +
      `continuing with simulation-only coverage ` +
      `(${simulationIndex.scenarioCount} scenarios, ${parVersion}).`
    );
  }
  if (simulationIndex === null && seedIndex !== null) {
    return (
      `[server] PAR simulation index unavailable at data/par/sim/${parVersion}/index.json; ` +
      `continuing with seed-only coverage ` +
      `(${seedIndex.scenarioCount} scenarios, ${parVersion}).`
    );
  }
  const unionCount = countUnionScenarios(simulationIndex, seedIndex);
  return (
    `[server] PAR index loaded: ${unionCount} scenarios ` +
    `(${parVersion}; sim=${/** @type {ParIndex} */ (simulationIndex).scenarioCount}, ` +
    `seed=${/** @type {ParIndex} */ (seedIndex).scenarioCount}).`
  );
}

/**
 * Async factory that loads both source-class PAR indices once at startup,
 * then returns a bound gate whose `checkParPublished` is the synchronous
 * partial application over those loaded indices. Request-time gate checks
 * are pure in-memory lookups — zero filesystem IO per call (D-5101).
 *
 * Non-blocking: each class-load is guarded via `.catch`; a
 * `ParStoreReadError` for one class warn-logs and degrades the gate to
 * the other class's coverage (D-5101 graceful degradation). When both
 * classes fail or are missing, the gate remains constructible and every
 * `checkParPublished` call returns `null` (fail-closed).
 *
 * Forbidden behaviors:
 * - Reading files directly (PAR IO is delegated entirely to `loadParIndex`)
 * - Crashing the server on a malformed or missing index (fail-soft
 *   per D-5102 for `PAR_VERSION` mis-configuration, fail-closed per
 *   D-5103 for missing coverage)
 * - Validating artifact hashes or coverage — CI-time responsibility via
 *   `validateParStore` (D-5103)
 * - Exposing a reload mechanism (the active `parVersion` is stable for
 *   process lifetime per D-5102; no SIGHUP handling)
 *
 * @param {string} basePath  Literal `'data/par'` at the startup call site;
 *   matches the `loadRegistry` `'data/metadata'` / `'data/cards'` convention.
 * @param {string} parVersion  The active PAR version. Operator-configured
 *   via `PAR_VERSION` env var per D-5102; caller is responsible for the
 *   `?? 'v1'` fallback at the call site.
 * @returns {Promise<ParGate>}
 */
export async function createParGate(basePath, parVersion) {
  // why: load once at startup, check many times per request — same pattern
  // as registry loading (loadRegistry) and rules caching (loadRules). Both
  // source classes must be loaded to preserve D-5101 sim-over-seed
  // precedence without per-request filesystem IO. Promise.all runs the two
  // loadParIndex calls concurrently; they are independent.
  const simulationIndexPath = `${basePath}/sim/${parVersion}/index.json`;
  const seedIndexPath = `${basePath}/seed/${parVersion}/index.json`;

  const [simulationIndex, seedIndex] = await Promise.all([
    loadParIndex(basePath, parVersion, 'simulation').catch(
      handleParLoadError('simulation', simulationIndexPath),
    ),
    loadParIndex(basePath, parVersion, 'seed').catch(
      handleParLoadError('seed', seedIndexPath),
    ),
  ]);

  console.log(formatStartupLogLine(simulationIndex, seedIndex, parVersion));

  // why: D-5306 hard-throw guard — if any scenario in either loaded index
  // lacks scoringConfig, the gate constructor refuses to build a partially-
  // armed gate. The Primary Invariant requires (scenarioKey, parValue,
  // scoringConfig) atomicity; degrading to "some scenarios have config,
  // some don't" would silently break that invariant for the missing
  // entries. Fail-closed at startup so the server fails to start rather
  // than serving a half-broken gate at request time.
  assertEveryScenarioHasScoringConfig(simulationIndex, 'simulation');
  assertEveryScenarioHasScoringConfig(seedIndex, 'seed');

  const simulationScenarioCount =
    simulationIndex === null ? 0 : simulationIndex.scenarioCount;
  const seedScenarioCount = seedIndex === null ? 0 : seedIndex.scenarioCount;

  return {
    checkParPublished: (scenarioKey) =>
      checkParPublished(simulationIndex, seedIndex, scenarioKey),
    simulationScenarioCount,
    seedScenarioCount,
  };
}

/**
 * Throws when any scenario in the loaded index lacks a non-null
 * `scoringConfig`. Null indices (class had no coverage at startup) skip the
 * check — the per-class graceful-degradation contract is preserved.
 *
 * Belongs adjacent to `createParGate` so the gate's startup contract is
 * fully expressed at one site: load both classes, then guard, then return.
 *
 * @param {ParIndex | null} index
 * @param {ParArtifactSource} source
 * @returns {void}
 */
function assertEveryScenarioHasScoringConfig(index, source) {
  if (index === null) {
    return;
  }
  for (const [scenarioKey, entry] of Object.entries(index.scenarios)) {
    if (
      entry === null
      || typeof entry !== 'object'
      || entry.scoringConfig === null
      || typeof entry.scoringConfig !== 'object'
    ) {
      throw new Error(
        `createParGate refused to construct a partially-armed gate: ${source} index entry for scenario ${scenarioKey} is missing required field scoringConfig (D-5306). Re-build the PAR index from artifacts that embed a structurally valid ScenarioScoringConfig before starting the server.`,
      );
    }
  }
}
