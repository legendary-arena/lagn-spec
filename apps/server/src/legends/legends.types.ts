/**
 * Legends Snapshot Publisher — Type Definitions (WP-142)
 *
 * Durable contracts for the public, no-auth JSON leaderboard snapshots
 * written to R2 on a 5-minute cadence. These types define the snapshot
 * payload shape, manifest shape, and publish-result shape. The publisher
 * consumes existing leaderboard logic outputs and projects them to the
 * public snapshot schema (handle + score + rank + minimal per-board
 * context). No PII beyond the already-public player handle.
 *
 * Authority: WP-142; D-14201..D-14207; EC-157 §Locked Values.
 */

// ---------------------------------------------------------------------------
// Snapshot entry types — fixed property order for deterministic JSON
// ---------------------------------------------------------------------------

/**
 * A single row in a global-top snapshot board. Property order is fixed
 * for deterministic JSON.stringify output (byte-identical across runs).
 */
export interface GlobalTopSnapshotEntry {
  readonly handle: string;
  readonly rank: number;
  readonly scenarioKey: string;
  readonly score: number;
}

/**
 * A single row in a per-scenario snapshot board. Property order is fixed
 * for deterministic JSON.stringify output.
 */
export interface ScenarioSnapshotEntry {
  readonly handle: string;
  readonly rank: number;
  readonly score: number;
}

// ---------------------------------------------------------------------------
// Board snapshot envelope
// ---------------------------------------------------------------------------

/**
 * A single board snapshot written to R2 at `legends/v1/<board>.json`.
 * The `entries` array is sorted by rank ASC, handle ASC.
 */
export interface LegendsSnapshotBoard<
  TEntry extends GlobalTopSnapshotEntry | ScenarioSnapshotEntry,
> {
  readonly board: string;
  readonly entries: readonly TEntry[];
  readonly rowCount: number;
  readonly schemaVersion: 1;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/**
 * Manifest written to `legends/v1/manifest.json` as the transactional
 * commit point. Consumers reading a stale manifest see a consistent
 * prior snapshot, never a half-written one. Per D-14204.
 */
export interface LegendsManifest {
  readonly boards: readonly string[];
  readonly generatedAt: string;
  readonly schemaVersion: 1;
}

// ---------------------------------------------------------------------------
// Publish result
// ---------------------------------------------------------------------------

/**
 * Outcome of publishing a single board to R2.
 */
export interface BoardPublishOutcome {
  readonly board: string;
  readonly byteCount: number;
  readonly putLatencyMs: number;
  readonly rowCount: number;
  readonly success: boolean;
  readonly errorMessage?: string;
}

/**
 * Aggregate result of a single `publishAllBoards` run.
 */
export interface PublishResult {
  readonly boards: readonly BoardPublishOutcome[];
  readonly manifestWritten: boolean;
  readonly runId: string;
}

// ---------------------------------------------------------------------------
// Health state
// ---------------------------------------------------------------------------

/**
 * Health state exposed by `GET /health/legends-publisher`. Replaced
 * atomically via `state = { ... }` (never field-by-field mutation).
 */
export interface LegendsPublisherHealthState {
  readonly intervalMs: number;
  readonly lastErrorAt: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastSuccessAt: string | null;
  readonly status: 'error' | 'idle' | 'ok';
}

// ---------------------------------------------------------------------------
// R2 client interface (subset of S3Client used by the publisher)
// ---------------------------------------------------------------------------

/**
 * Minimal R2 client interface consumed by the publisher. Production
 * code passes the real `S3Client`; tests pass a stub.
 */
export interface LegendsR2Client {
  readonly putObject: (params: {
    readonly body: string;
    readonly bucket: string;
    readonly contentType: string;
    readonly key: string;
    readonly signal: AbortSignal;
  }) => Promise<void>;
}
