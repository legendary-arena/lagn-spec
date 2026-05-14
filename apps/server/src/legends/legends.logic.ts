/**
 * Legends Snapshot Builders — Pure Logic (WP-142)
 *
 * One pure builder per board category. Each takes typed leaderboard
 * output from `apps/server/src/leaderboards/leaderboard.logic.ts` and
 * returns a typed snapshot board. No I/O, no clock, no database access.
 *
 * Layer-boundary contract: this module imports only from the colocated
 * `legends.types.ts` — no engine, registry, preplan, or UI packages.
 *
 * Authority: WP-142 §A/§B; EC-157 §Locked Values; D-14205.
 */

import type {
  GlobalTopSnapshotEntry,
  LegendsSnapshotBoard,
  ScenarioSnapshotEntry,
} from './legends.types.js';

import type {
  GlobalTopLeaderboard,
  PublicLeaderboardEntry,
  ScenarioLeaderboard,
} from '../leaderboards/leaderboard.types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compare two snapshot entries by rank ASC, then handle ASC.
 * Used by every builder to enforce the locked sort order.
 */
// why: sort order is rank ASC primary, handle ASC secondary per
// EC-157 §Locked Values. Explicit comparator avoids relying on
// insertion order from the upstream query (which sorts by
// final_score ASC, created_at ASC — a different axis).
function compareByRankThenHandle(
  entryA: { readonly handle: string; readonly rank: number },
  entryB: { readonly handle: string; readonly rank: number },
): number {
  if (entryA.rank !== entryB.rank) {
    return entryA.rank - entryB.rank;
  }
  return entryA.handle.localeCompare(entryB.handle);
}

// ---------------------------------------------------------------------------
// Global-top board builder
// ---------------------------------------------------------------------------

/**
 * Builds a global-top snapshot board from the global leaderboard output.
 * Each entry carries `scenarioKey` as per-board minimal context.
 *
 * Pure function — no I/O, no clock.
 */
// why: no Date.now() in builder bodies — only the publisher stamps
// the manifest generatedAt. Clock-free ensures byte-identical output
// given identical input.
export function buildGlobalTopSnapshot(
  leaderboard: GlobalTopLeaderboard,
): LegendsSnapshotBoard<GlobalTopSnapshotEntry> {
  const entries: GlobalTopSnapshotEntry[] = [];

  for (const entry of leaderboard.entries) {
    // why: explicit object literal construction — no spread from
    // source objects per EC-157 §Forbidden Patterns.
    const snapshotEntry: GlobalTopSnapshotEntry = {
      handle: entry.playerDisplayName,
      rank: entry.rank,
      scenarioKey: entry.scenarioKey,
      score: entry.finalScore,
    };
    entries.push(snapshotEntry);
  }

  // why: sort by rank ASC, handle ASC per EC-157 §Locked Values.
  entries.sort(compareByRankThenHandle);

  return {
    board: 'global-top',
    entries,
    rowCount: entries.length,
    schemaVersion: 1,
  };
}

// ---------------------------------------------------------------------------
// Per-scenario board builder
// ---------------------------------------------------------------------------

/**
 * Builds a per-scenario snapshot board from a single scenario leaderboard.
 * The board name is derived from the scenario key (lowercased, already
 * kebab-case by construction from `buildScenarioKey`).
 *
 * Pure function — no I/O, no clock.
 */
// why: no Date.now() in builder bodies — clock-free ensures
// byte-identical output given identical input.
export function buildScenarioSnapshot(
  leaderboard: ScenarioLeaderboard,
): LegendsSnapshotBoard<ScenarioSnapshotEntry> {
  const entries: ScenarioSnapshotEntry[] = [];

  for (const entry of leaderboard.entries) {
    // why: explicit object literal construction — no spread.
    const snapshotEntry: ScenarioSnapshotEntry = {
      handle: entry.playerDisplayName,
      rank: entry.rank,
      score: entry.finalScore,
    };
    entries.push(snapshotEntry);
  }

  // why: sort by rank ASC, handle ASC per EC-157 §Locked Values.
  entries.sort(compareByRankThenHandle);

  return {
    board: deriveBoardName(leaderboard.scenarioKey),
    entries,
    rowCount: entries.length,
    schemaVersion: 1,
  };
}

// ---------------------------------------------------------------------------
// Board name derivation
// ---------------------------------------------------------------------------

/**
 * Derives a filesystem-safe, lowercase kebab-case board name from a
 * scenario key. Scenario keys are already kebab-case by construction
 * (produced by `buildScenarioKey`), but this function applies the
 * `scenario-` prefix to distinguish per-scenario boards from the
 * `global-top` board in the manifest.
 */
export function deriveBoardName(scenarioKey: string): string {
  return `scenario-${scenarioKey.toLowerCase()}`;
}

/**
 * Serializes a snapshot board to a deterministic JSON string.
 * Property order is fixed by the type definitions (alphabetical).
 * No replacer, no sorted-keys library per EC-157 §Forbidden Patterns.
 */
export function serializeSnapshot(
  snapshot: LegendsSnapshotBoard<GlobalTopSnapshotEntry | ScenarioSnapshotEntry>,
): string {
  return JSON.stringify(snapshot);
}

/**
 * Builds the sorted list of all board names that will be published.
 * Global-top first, then per-scenario boards in ASC order.
 */
export function buildBoardList(scenarioKeys: readonly string[]): string[] {
  const boards: string[] = ['global-top'];
  const sortedScenarioKeys = [...scenarioKeys].sort();
  for (const scenarioKey of sortedScenarioKeys) {
    boards.push(deriveBoardName(scenarioKey));
  }
  return boards;
}

/**
 * Maps a PublicLeaderboardEntry to the snapshot field names.
 * Exposed for testing PII-exclusion assertions.
 */
export function extractSnapshotFields(
  entry: PublicLeaderboardEntry,
): { handle: string; rank: number; score: number } {
  return {
    handle: entry.playerDisplayName,
    rank: entry.rank,
    score: entry.finalScore,
  };
}
