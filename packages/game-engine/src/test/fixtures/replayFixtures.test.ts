/**
 * `node:test` driver for the complete-game regression harness (WP-158).
 *
 * Globs every `*.replay.json` under
 * `packages/game-engine/src/test/fixtures/games/` at test time, calls
 * `runFixture` against each, and asserts the three oracle layers in
 * the order `outcome` → `messages` → `finalStateHash`. The first
 * failing layer determines the diff grain so a triage operator
 * inspects the failure at the right level (winner change → message
 * divergence → state-placement divergence).
 *
 * No framework runtime import. No `@legendary-arena/registry` import. No
 * network, no DB, no live registry reads. Per-fixture isolation: each
 * fixture is replayed with a fresh `LegendaryGameState` and a fresh
 * mulberry32 PRNG (both constructed internally by `runFixture`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CardRegistryReader } from '../../matchSetup.validate.js';
import { validateFixture, type FixtureFile, type FixtureRunResult } from './fixtureSchema.js';
import { runFixture } from './runFixture.js';

// why: __dirname is unavailable in ESM; reconstruct via import.meta.url
// to anchor the fixtures directory relative to this test file
// regardless of the cwd `node --test` is invoked from.
const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIXTURES_GAMES_DIRECTORY = join(TEST_DIRECTORY, 'games');

/**
 * Minimal `CardRegistryReader` stub matching the pattern used by
 * `replay.execute.test.ts` and `simulation.test.ts`. The harness MUST
 * NOT read registry data at runtime; this stub satisfies the
 * structural interface so `buildInitialGameState` runs setup-time
 * builders without registry queries.
 */
const EMPTY_REGISTRY: CardRegistryReader = {
  listCards: () => [],
  listSets: () => [],
  getSet: () => undefined,
};

/**
 * Glob the fixtures directory and return `(basename, parsedJson)`
 * pairs sorted by basename. Sort makes test order deterministic so
 * CI-side fixture additions land in stable position.
 */
async function loadAllFixtures(): Promise<Array<{ basename: string; parsed: unknown }>> {
  let entries: string[];
  try {
    entries = await readdir(FIXTURES_GAMES_DIRECTORY);
  } catch (error) {
    // why: an empty or missing fixtures directory is acceptable — the
    // harness is the rails; the corpus may legitimately be empty in a
    // pre-sentinel state. Re-throw with a full-sentence error only
    // if the failure is something other than "directory missing".
    const errorWithCode = error as NodeJS.ErrnoException;
    if (errorWithCode.code === 'ENOENT') {
      return [];
    }
    throw new Error(
      `Fixture driver failed to read directory "${FIXTURES_GAMES_DIRECTORY}": ${errorWithCode.message}. Verify the path exists and is readable.`,
    );
  }
  const fixtureFilenames = entries.filter((entry) => entry.endsWith('.replay.json')).sort();
  const loaded: Array<{ basename: string; parsed: unknown }> = [];
  for (const filename of fixtureFilenames) {
    const filePath = join(FIXTURES_GAMES_DIRECTORY, filename);
    const text = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(text);
    const basename = filename.slice(0, filename.length - '.replay.json'.length);
    loaded.push({ basename, parsed });
  }
  return loaded;
}

/**
 * Stable JSON serialisation with sorted keys. Used by the
 * tiered-oracle comparator to format expected/actual values for the
 * failure-message excerpt.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, raw): unknown => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return raw;
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(raw as Record<string, unknown>).sort()) {
      sorted[key] = (raw as Record<string, unknown>)[key];
    }
    return sorted;
  });
}

/**
 * Truncates a string to at most `maxLength` characters; appends an
 * ellipsis-marker if truncation actually happened. Used to keep
 * failure messages within the 200-chars-per-side cap.
 */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…(truncated, full length=${value.length})`;
}

/**
 * Finds the first index where two arrays diverge. Returns -1 if every
 * indexable element matches (including length).
 */
function findFirstDivergenceIndex<T>(left: readonly T[], right: readonly T[]): number {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index++) {
    if (stableStringify(left[index]) !== stableStringify(right[index])) {
      return index;
    }
  }
  return -1;
}

/**
 * Asserts the `outcome` oracle layer. Coarsest of the three; flips on
 * winner change or endgame-counter divergence.
 */
function assertOutcomeOracle(fixture: FixtureFile, result: FixtureRunResult): void {
  const expected = stableStringify(fixture.expected.outcome);
  const actual = stableStringify(result.outcome);
  if (expected !== actual) {
    assert.fail(
      `Fixture "${fixture.name}" — OUTCOME oracle mismatch. Expected: ${truncate(expected, 200)}. Actual: ${truncate(actual, 200)}.`,
    );
  }
}

/**
 * Asserts the `messages` oracle layer. Readable diff; first divergent
 * index points at the turn-and-action where behaviour changed.
 */
function assertMessagesOracle(fixture: FixtureFile, result: FixtureRunResult): void {
  const divergenceIndex = findFirstDivergenceIndex(
    fixture.expected.messages,
    result.messages,
  );
  if (divergenceIndex !== -1) {
    const expectedAtIndex = fixture.expected.messages[divergenceIndex];
    const actualAtIndex = result.messages[divergenceIndex];
    assert.fail(
      `Fixture "${fixture.name}" — MESSAGES oracle mismatch at index ${divergenceIndex}. Expected: ${truncate(stableStringify(expectedAtIndex), 200)}. Actual: ${truncate(stableStringify(actualAtIndex), 200)}.`,
    );
  }
  if (fixture.expected.messages.length !== result.messages.length) {
    assert.fail(
      `Fixture "${fixture.name}" — MESSAGES oracle mismatch: expected ${fixture.expected.messages.length} entries, got ${result.messages.length}.`,
    );
  }
}

/**
 * Asserts the `snapshotPerTurn` oracle layer plus the
 * `finalStateHash` oracle layer. Snapshot mismatch fires first
 * because it carries more structure; hash mismatch is the catch-all
 * for subtle state-placement differences the message log does not
 * surface.
 */
function assertSnapshotAndHashOracles(fixture: FixtureFile, result: FixtureRunResult): void {
  const snapshotDivergence = findFirstDivergenceIndex(
    fixture.expected.snapshotPerTurn,
    result.snapshotPerTurn,
  );
  if (snapshotDivergence !== -1) {
    const expectedAtIndex = fixture.expected.snapshotPerTurn[snapshotDivergence];
    const actualAtIndex = result.snapshotPerTurn[snapshotDivergence];
    assert.fail(
      `Fixture "${fixture.name}" — SNAPSHOT oracle mismatch at index ${snapshotDivergence}. Expected: ${truncate(stableStringify(expectedAtIndex), 200)}. Actual: ${truncate(stableStringify(actualAtIndex), 200)}.`,
    );
  }
  if (fixture.expected.snapshotPerTurn.length !== result.snapshotPerTurn.length) {
    assert.fail(
      `Fixture "${fixture.name}" — SNAPSHOT oracle length mismatch: expected ${fixture.expected.snapshotPerTurn.length} per-turn snapshots, got ${result.snapshotPerTurn.length}.`,
    );
  }
  if (fixture.expected.finalStateHash !== result.finalStateHash) {
    assert.fail(
      `Fixture "${fixture.name}" — FINAL_STATE_HASH oracle mismatch. Expected: ${fixture.expected.finalStateHash}. Actual: ${result.finalStateHash}.`,
    );
  }
}

describe('complete-game fixture regression suite', () => {
  it('every committed fixture replays equal to its pinned expected block', async () => {
    const fixtures = await loadAllFixtures();
    if (fixtures.length === 0) {
      // why: a fresh repository with no committed fixtures is allowed
      // — the harness is the rails. Surface the empty corpus rather
      // than silently passing so a misconfigured CI shows up as a
      // diagnostic message, not an unobserved no-op.
      process.stdout.write(
        'complete-game fixture suite: zero fixtures present under packages/game-engine/src/test/fixtures/games/.\n',
      );
      return;
    }
    for (const { basename, parsed } of fixtures) {
      const fixture = validateFixture(parsed, basename);
      // why: per-fixture isolation — each iteration calls runFixture
      // with a freshly-constructed empty registry stub. runFixture
      // internally builds a fresh LegendaryGameState and a fresh
      // mulberry32 PRNG, plus runs the dispatch loop twice in-process
      // and asserts byte-identical results before returning (the
      // within-run determinism guard described in EC-172 §Guardrails).
      const result = runFixture(fixture, EMPTY_REGISTRY);
      assertOutcomeOracle(fixture, result);
      assertMessagesOracle(fixture, result);
      assertSnapshotAndHashOracles(fixture, result);
    }
  });
});
