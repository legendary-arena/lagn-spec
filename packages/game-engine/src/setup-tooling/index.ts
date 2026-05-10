/**
 * Setup-Tooling Surface — Node-only re-exports (WP-144 / D-14401).
 *
 * // why: D-14401 splits the engine package into two subpaths. The Runtime-
 * Safe Engine Surface (`.` = `src/index.ts`) is browser-bundle-safe and
 * contains zero `node:*` imports transitively reachable. The Setup-Tooling
 * Surface (`./setup` = this file) is Node-only and holds every Node-IO
 * module the engine package owns. arena-client never imports from
 * `@legendary-arena/game-engine/setup`; apps/server is the sole sanctioned
 * consumer. Three independent enforcement layers (subpath exports + Vite
 * `onwarn` hard-fail + arena-client tsconfig path guard) reject any
 * arena-client import of this barrel — see D-14401 "Boundary Leakage"
 * failure class. Future Node-IO authored under the engine package MUST
 * live in this directory (D-14401 closed-list quarantine future-proof
 * rule).
 */

// ScenarioScoringConfig loader (WP-053a / D-5306a — relocated here under D-14401).
export {
  loadScoringConfigForScenario,
  loadAllScoringConfigs,
} from '../scoring/scoringConfigLoader.js';

// PAR artifact storage (WP-050 / D-5001 — relocated here under D-14401).
export {
  scenarioKeyToFilename,
  scenarioKeyToShard,
  sourceClassRoot,
  computeArtifactHash,
  writeSimulationParArtifact,
  readSimulationParArtifact,
  writeSeedParArtifact,
  readSeedParArtifact,
  buildParIndex,
  lookupParFromIndex,
  loadParIndex,
  resolveParForScenario,
  validateParStore,
  validateParStoreCoverage,
  ParStoreReadError,
  PAR_ARTIFACT_SOURCES,
} from '../simulation/par.storage.js';