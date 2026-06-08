import type { DateRange, ServiceResponse } from '../types/index.js';
import type { SweepHealthSnapshot, SweepRunSummary } from '../types/sweep.js';
import { hashRange } from './hashRange.js';
import { normalizeRange } from './normalizeRange.js';

// ============================================================================
// WP-210 / EC-242 — Mock factory for the sweep-health dashboard surface.
// Mirrors `opsHealthMocks.ts` shape: a file-local `wrapMock<T>(data, nowMs)`
// applying the `source: 'MOCK'` tag (D-19702 / D-20402 mock-mode-first) and
// FNV-1a-seeded determinism via `hashRange()` (D-19605). The LIVE flip is a
// future single-file `mocks.ts` re-export swap WP (mirrors WP-206 ↔ WP-204);
// the widget files stay byte-identical pre/post flip because the composable
// reads freshness from its returned `source` / `updatedAt`, NOT from this
// service layer.
//
// Anomaly keys here are DELIBERATELY opaque mock strings distinct from the
// engine's WP-195 D-19502 taxonomy — the dashboard treats `anomalyCounts`
// keys as opaque strings (D-20703), so the mock proves the widget renders
// whatever keys arrive without importing or branching on engine types.
// ============================================================================

// Number of mock runs in `recentRuns` (most-recent-first). Matches the
// sparkline cap so the mock always exercises the full 30-run window.
const MOCK_RECENT_RUN_COUNT = 30;

// Opaque mock anomaly-kind keys. Hyphenated so the widget's humanize-on-display
// transform (strip `-`/`_` → space, Title-Case each word) is exercised, and
// chosen to be lexicographically unordered as authored so the widget's
// lex-asc display sort is exercised too. None of these match the engine's
// closed taxonomy — opacity is the point.
const MOCK_ANOMALY_KEYS: readonly string[] = [
  'soft-lock',
  'hard-crash',
  'rule-divergence',
  'timeout',
];

// Spacing between consecutive mock runs (1 hour). With 30 runs plus jitter the
// oldest run lands at roughly 29.5h of age — inside the 36h freshness window
// so every mock `submittedAt` is < 36h ago (mock always-fresh per §Mock value
// bounds; the stale state is reached only via composable input override in
// tests, never via this factory).
const MOCK_RUN_SPACING_MS = 60 * 60 * 1000;

// Maximum extra jitter added to a run's age (30 minutes), keeping the oldest
// run comfortably under the 36h window.
const MOCK_RUN_JITTER_MS = 30 * 60 * 1000;

/**
 * Seeded PRNG (mulberry32) — pure function: an identical seed produces an
 * identical infinite stream of [0, 1) values across calls, reloads, and
 * platforms. Inlined here so this file is the single seeded-random consumer
 * for the sweep-health surface, matching the `opsHealthMocks.ts` precedent.
 * Bare non-seeded `Math.random` draws are forbidden in this directory per
 * D-19605.
 */
function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return function nextSample(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let nextState = state;
    nextState = Math.imul(nextState ^ (nextState >>> 15), nextState | 1);
    nextState ^= nextState + Math.imul(nextState ^ (nextState >>> 7), nextState | 61);
    return ((nextState ^ (nextState >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a value uniformly from `[min, max]` (inclusive both ends) using the
 * supplied seeded PRNG. Mirrors `opsHealthMocks.ts` `sampleRange`.
 */
function sampleRange(prng: () => number, min: number, max: number): number {
  return min + (max - min) * prng();
}

/**
 * Wrap a value into a `ServiceResponse<T>` with the `MOCK` source label.
 * `updatedAt` is supplied by the caller (`nowMs`) so this file carries NO
 * bare `Date.now()` call site — the caller controls when the timestamp is
 * sampled. Named `wrapMock` so the per-factory grep gate (`hashRange|wrapMock`)
 * sees the expected token; mirrors `opsHealthMocks.ts` verbatim in shape.
 */
function wrapMock<T>(data: T, nowMs: number): ServiceResponse<T> {
  return {
    data,
    updatedAt: nowMs,
    source: 'MOCK',
  };
}

/**
 * Build one deterministic mock `SweepRunSummary`. Run `index` 0 is the most
 * recent; higher indices are older. `submittedAt` / `startedAt` are derived
 * from `nowMs` minus a spacing-plus-jitter age so the whole set stays inside
 * the 36h freshness window. `cellCount ∈ [50, 500]`; each anomaly count ∈
 * [0, 50] per §Mock value bounds.
 */
function buildMockRun(prng: () => number, index: number, nowMs: number): SweepRunSummary {
  const jitterMs = Math.round(sampleRange(prng, 0, MOCK_RUN_JITTER_MS));
  const ageMs = index * MOCK_RUN_SPACING_MS + jitterMs;
  const submittedAtMs = nowMs - ageMs;
  const runDurationMs = Math.round(sampleRange(prng, 2 * 60 * 1000, 10 * 60 * 1000));
  const startedAtMs = submittedAtMs - runDurationMs;
  const cellCount = Math.round(sampleRange(prng, 50, 500));

  const anomalyCounts: Record<string, number> = {};
  for (const anomalyKey of MOCK_ANOMALY_KEYS) {
    anomalyCounts[anomalyKey] = Math.round(sampleRange(prng, 0, 50));
  }

  return {
    runId: `mock-sweep-run-${String(index).padStart(2, '0')}`,
    submittedAt: new Date(submittedAtMs).toISOString(),
    startedAt: new Date(startedAtMs).toISOString(),
    cellCount,
    anomalyCounts,
  };
}

/**
 * Deterministic mock generator for the sweep-health snapshot consumed by
 * `GET /api/sweep/latest`. Produces `MOCK_RECENT_RUN_COUNT` runs ordered
 * most-recent-first (`recentRuns[0]` is the newest), with `latest` pointing at
 * `recentRuns[0]`. Seed derives from the normalized range pair so an identical
 * operator-picked range always yields byte-identical output across reloads.
 *
 * The endpoint itself ignores the date range (it always returns the latest run
 * plus the last 30); `range` is consumed here only as a determinism seed input,
 * mirroring the `opsHealthMocks.ts` factories so the widget call signature
 * stays `(range, nowMs)` across the surface.
 */
export function mockSweepHealth(
  range: DateRange,
  nowMs: number,
): ServiceResponse<SweepHealthSnapshot> {
  const normalized = normalizeRange(range, nowMs);
  // why (D-19605): hashRange-seeded mock determinism — same range input yields
  // byte-identical mock output across runs, preserving Snapshot/visual-
  // regression test stability. Domain prefix `sweep-health` keeps this seed
  // disjoint from the ops-health factories on the same range.
  const seed = hashRange('sweep-health|' + normalized.start + '|' + normalized.end);
  const prng = createPrng(seed);

  const recentRuns: SweepRunSummary[] = [];
  for (let index = 0; index < MOCK_RECENT_RUN_COUNT; index++) {
    recentRuns.push(buildMockRun(prng, index, nowMs));
  }

  const firstRun = recentRuns[0];
  const snapshot: SweepHealthSnapshot = {
    // why: §Locked contract values — `latest === recentRuns[0]` when the table
    // is non-empty; the mock always produces a full window so `latest` is
    // never null here (the empty state is exercised via composable input
    // override in tests, not via this factory).
    latest: firstRun ?? null,
    recentRuns,
  };

  return wrapMock(snapshot, nowMs);
}

// why: WP-210 §Scope (In) + D-20402 — `fetchSweepHealth` is the widget-facing
// alias. In MOCK-mode-first it points at `mockSweepHealth`; the future LIVE
// flip re-points this alias in `mocks.ts` (single-file swap) without touching
// the widget, which imports `fetchSweepHealth` and never references `mockX`.
export { mockSweepHealth as fetchSweepHealth };
