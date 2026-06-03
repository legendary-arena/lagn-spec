/**
 * Analytics Types — Server Layer (WP-205 / EC-233)
 *
 * Closed-union + canonical-array + envelope-interface contracts for the
 * `analytics_events` server surface (capture endpoint + 3 query endpoints).
 * Mirrors the WP-203 forward-locked `AnalyticsEvent` envelope byte-identical
 * at the request boundary, and the WP-203 `TrafficSource` /
 * `ActivationFunnelStep` / `RetentionCohort` shapes byte-identical at the
 * query response boundary (server keeps a hand-synced local copy per the
 * cross-app no-import convention — see WP-205 §Locked contract values).
 *
 * This module belongs to the server layer only. It must not be imported
 * from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `apps/arena-client/**`,
 * `apps/registry-viewer/**`, or `apps/dashboard/**`. The dashboard's
 * `AcquisitionEventType` / `TrafficSource` / etc. live at
 * `apps/dashboard/src/types/index.ts`; this file is a hand-synced
 * server-local copy, and drift is enforced by
 * `analytics.types.test.ts`.
 *
 * Authority: WP-205 §Locked contract values; EC-233 §Locked Values;
 * D-20501 (schema + closed-set 3-layer enforcement + INSERT column-list
 * + SQL pre-sorted + channel attribution + retention v1 coarse +
 * request validation rules); D-20502 (PII posture — referenced via
 * `userIdHash.ts`, not here); D-20503 (auth posture split + envelope
 * shape + rate-limit semantics + idempotency posture).
 */

// why: D-20501 — `AcquisitionEventType` is a closed union of 9 values:
// 4 channel events (`'direct'` / `'search'` / `'referral'` / `'paid'`)
// + 4 activation events (`'signup-start'` / `'signup-complete'` /
// `'first-match-started'` / `'first-match-completed'`) + 1 retention
// event (`'retention-return'`). The union is enforced at three
// independent layers: this TypeScript union, the
// `ACQUISITION_EVENT_TYPES` canonical readonly array below, and the
// SQL CHECK constraint in `data/migrations/017_create_analytics_events.sql`
// (the route validator is a 4th request-time gate). Adding a 10th
// value requires updating ALL FOUR sites in the same WP — drift test
// in `analytics.types.test.ts` parses the migration's CHECK text and
// asserts byte-equality with this list. Mirrors WP-203 D-20301
// forward-locked envelope.
export type AcquisitionEventType =
  | 'direct'
  | 'search'
  | 'referral'
  | 'paid'
  | 'signup-start'
  | 'signup-complete'
  | 'first-match-started'
  | 'first-match-completed'
  | 'retention-return';

// why: D-20501 — canonical readonly array drift-pinned to
// `AcquisitionEventType`. Order is load-bearing (matches the SQL
// CHECK constraint order in the migration; matches the WP-203
// dashboard-side union order; cumulative-funnel composables iterate
// this array in index order). Adding a 10th value without updating
// both the union AND this array fails the drift test in
// `analytics.types.test.ts` (mirrors WP-198 `KPI_STATUSES`
// precedent — see `apps/dashboard/src/utils/funnelTaxonomy.test.ts`
// for the dashboard-side analogue this test is paired with).
export const ACQUISITION_EVENT_TYPES: readonly AcquisitionEventType[] = [
  'direct',
  'search',
  'referral',
  'paid',
  'signup-start',
  'signup-complete',
  'first-match-started',
  'first-match-completed',
  'retention-return',
];

// why: D-20503 — `DateRange` is the closed query-parameter union for
// the 3 GET query endpoints. Server-side bound (per-day aggregations
// only need to look back N days from "today"); the dashboard widget
// surface uses the same 4 values per WP-203 §Locked contract values.
// Adding a 5th value requires touching both the route validator and
// the dashboard's `DateRange` union in the same WP.
export type DateRange = '7d' | '14d' | '30d' | '90d';

// why: D-20503 + D-11802 — closed-set client-facing error codes for
// the analytics surface. Five values total:
// `'invalid_request'` (400 — validator rejection: bad event_type,
// out-of-bound timestamp, length-bound violation, etc.);
// `'rate_limited'` (429 — per-IP rate limit consumed);
// `'payload_too_large'` (413 — body size cap or batch-event cap);
// `'unauthorized'` (401 — `SessionValidationErrorCode` collapse per
// D-10403 account-existence-probe defense);
// `'internal_error'` (500 — operational fault; D-11802 = (C)
// envelope). No other status code (403 / 404 / 422) may leak from
// the analytics handlers.
export type AnalyticsErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unauthorized'
  | 'internal_error';

// why: D-20501 / WP-203 D-20301 — request body shape for
// `POST /api/analytics/events`. Mirrors the WP-203 `AnalyticsEvent`
// envelope BEFORE hashing (the route boundary hashes `user_id` to
// `user_id_hash` BEFORE any INSERT per D-20502; persistence-side
// shape is internal to `analytics.logic.ts`). `user_id: string | null`
// is union-typed (NOT optional) — `null` is the explicit empty value
// for pre-signup visitors; `properties` is optional (absent or `{}`
// stored as `'{}'::jsonb` per the SQL DEFAULT). `properties` leaf
// values are restricted to the JSON-spec primitive types per the
// `properties` JSON-serializability invariant (D-20501); the route
// validator rejects `Date`, `undefined`, `Map`, `Set`, `Function`,
// class instances, BigInt, and Symbol with 400 `'invalid_request'`.
// `properties` ROOT must be an object (arrays at root forbidden) per
// D-20501; nesting depth ≤ 5 per D-20501; the validator-side bound is
// load-bearing (no SQL-side depth CHECK).
export interface AnalyticsEventCapturePayload {
  readonly event_type: AcquisitionEventType;
  readonly user_id: string | null;
  readonly session_id: string;
  readonly timestamp: number;
  readonly properties?: Readonly<Record<string, unknown>>;
}

// why: D-20503 — batch shape for `POST /api/analytics/events` (up
// to 50 events per batch; 100 KB body cap; rate limit per-event NOT
// per-request per D-20503 tightening). The route validator handles
// both shapes (single event OR `{ events: [...] }`).
export interface AnalyticsEventBatchPayload {
  readonly events: readonly AnalyticsEventCapturePayload[];
}

// why: D-20501 + WP-203 §Aggregation rule — per-day per-channel row
// returned by `GET /api/analytics/traffic-sources`. Server-local
// camelCase mirror of the WP-203 dashboard-side `TrafficSource`
// (`apps/dashboard/src/types/index.ts:259`). `date` is canonical
// `YYYY-MM-DD` derived in SQL via `(ts AT TIME ZONE 'UTC')::date`;
// rows pre-sorted ASC by `date` from SQL `ORDER BY date ASC` (the
// SQL pre-sorted invariant per D-20501 — route MUST NOT call
// `Array.sort(...)`). `channel` is the 4-value
// `'direct' | 'search' | 'referral' | 'paid'` closed set.
// Per-session channel attribution rule (D-20501 tightening): the
// FIRST `(ts ASC)` channel event wins; subsequent channel events
// IGNORED; no-channel sessions EXCLUDED entirely (no `direct`
// fallback). Implemented via `ROW_NUMBER() OVER (PARTITION BY
// session_id ORDER BY ts ASC)`.
export interface TrafficSource {
  readonly channel: 'direct' | 'search' | 'referral' | 'paid';
  readonly date: string;
  readonly visitorCount: number;
  readonly signupCount: number;
}

// why: D-20501 + WP-203 §Aggregation rule + §Conversion invariants —
// per-day per-step row returned by `GET /api/analytics/activation-funnel`.
// Mirror of the WP-203 dashboard-side `ActivationFunnelStep`
// (`apps/dashboard/src/types/index.ts:272`). `step` is the 4-value
// `ActivationStep` closed set. Same UTC-bucket + ascending-by-date
// sort discipline as `TrafficSource`. Count = `COUNT(DISTINCT
// user_id_hash)` per `(step, date)`.
export interface ActivationFunnelStep {
  readonly step:
    | 'signup-start'
    | 'signup-complete'
    | 'first-match-started'
    | 'first-match-completed';
  readonly date: string;
  readonly count: number;
}

// why: D-20501 + WP-203 §Retention definition — one weekly signup
// cohort returned by `GET /api/analytics/retention-cohorts`. Mirror
// of the WP-203 dashboard-side `RetentionCohort`
// (`apps/dashboard/src/types/index.ts:286`). `cohortWeek` is the ISO
// 8601 `YYYY-Www` label derived in SQL via
// `to_char(date_trunc('week', ts), 'IYYY-"W"IW')`. `cohortSize` =
// `COUNT(DISTINCT user_id_hash)` from `signup-complete` events;
// dayN return = `COUNT(DISTINCT user_id_hash)` of cohort members
// with ANY `event_type != 'signup-complete'` event in day N (v1
// coarse definition per D-20501 — per-class filtering is a future
// tuning WP; channel events, activation events, and
// `retention-return` events ALL count as returns; only
// `signup-complete` is excluded by definition).
export interface RetentionCohort {
  readonly cohortWeek: string;
  readonly cohortSize: number;
  readonly day1ReturnCount: number;
  readonly day7ReturnCount: number;
}
