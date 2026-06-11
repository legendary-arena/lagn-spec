/**
 * Sweep-Health Types — Client Layer (WP-210 / EC-242)
 *
 * Forward-locked mirror of WP-209's `GET /api/sweep/latest` response envelope.
 * The authoritative wire contract is `apps/server/src/sweep/sweep.types.ts`;
 * this dashboard mirror is structurally identical to it with ONE documented
 * deviation per D-20703: the `anomalyCounts` key type is widened from the
 * engine's closed anomaly-class union to plain `string`. The dashboard treats
 * anomaly keys as OPAQUE strings and never imports the engine anomaly-class
 * type from the game-engine package (layer-boundary preservation per
 * ARCHITECTURE.md §Layer Boundary). Unknown future keys (if the engine's
 * closed anomaly taxonomy expands beyond the WP-195 D-19502 4-class set) render
 * automatically without a dashboard rebuild.
 *
 * Cross-app type drift between this mirror and the server type is intentionally
 * NOT enforced by a TypeScript import (the dashboard cannot import the server
 * package); a future widget-side drift test (WP-211, backlog) compares against
 * a committed fixture in the WP-203 byte-identical pattern.
 *
 * Authority: WP-210 §Scope (In) + §Acceptance Criteria #1; EC-242 §Locked
 * Values; D-20703 (envelope shape lock + opaque-anomaly-key client posture).
 */

/**
 * One sweep run's operator-facing summary. Field order mirrors the server's
 * `SweepRunSummary` exactly: `runId`, `submittedAt`, `startedAt`, `cellCount`,
 * `anomalyCounts`. DELIBERATELY EXCLUDES `manifestBlob` (forensic-only, never
 * on the dashboard read path). `anomalyCounts` keys are widened to `string`
 * for layer-boundary opacity — the single documented deviation from the
 * server summary type per D-20703.
 */
export interface SweepRunSummary {
  readonly runId: string;
  readonly submittedAt: string;
  readonly startedAt: string;
  readonly cellCount: number;
  readonly anomalyCounts: Readonly<Record<string, number>>;
}

/**
 * The `GET /api/sweep/latest` response payload, structurally identical to the
 * server's `SweepLatestEnvelope['data']`. `latest` is `null` ONLY pre-first-run
 * (the table is empty); once any sweep has been recorded `latest` is non-null
 * and `latest === recentRuns[0]` (the server builds both from the same
 * `submitted_at DESC` SQL result). `recentRuns` carries at most 30 rows,
 * most-recent-first.
 */
export interface SweepHealthSnapshot {
  readonly latest: SweepRunSummary | null;
  readonly recentRuns: readonly SweepRunSummary[];
}

/**
 * One point on the sweep health-rate trend (WP-235 / D-23501) — a client-side
 * projection of a `SweepRunSummary`. Carries the run's parsed timestamp
 * (`submittedAtMs = Date.parse(submittedAt)`), its cadence derived from the
 * `-weekly-w<N>` runId suffix grammar (`daily` | `weekly`, with `windowIndex`
 * the weekly rotation window or `null` for daily), `cellCount`, and the per-run
 * `healthRate` (∈ [0,1], or `null` for a 0-cell run — a gap the trend chart does
 * NOT bridge). This is an additive App-layer projection type; the underlying
 * `SweepRunSummary` wire contract is unchanged.
 */
export interface SweepTrendPoint {
  readonly runId: string;
  readonly submittedAt: string;
  readonly submittedAtMs: number;
  readonly cadence: 'daily' | 'weekly';
  readonly windowIndex: number | null;
  readonly cellCount: number;
  readonly healthRate: number | null;
}
