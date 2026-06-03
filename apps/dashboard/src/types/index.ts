export interface ServiceResponse<T> {
  data: T;
  updatedAt: number;
  source: 'LIVE' | 'CACHED' | 'MOCK';
}

export interface ApiError {
  message: string;
  code?: string;
  retryable?: boolean;
}

export type DateRange = '7d' | '14d' | '30d' | '90d';

export type UserRole = 'admin' | 'operator' | 'finance' | 'support';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
}

export interface KpiSnapshot {
  id: string;
  label: string;
  value: number;
  previousValue: number;
  unit: string;
  trend: 'up' | 'down' | 'flat';
  // why: D-19802 — `target` / `tolerance` / `direction` are all OPTIONAL so
  // existing KPIs without a threshold continue to type-check. A KPI rendering
  // a status chip MUST supply all three; absence of `target` is the explicit
  // opt-out signal (computeKpiStatus returns null and no chip is rendered).
  target?: number;
  tolerance?: number;
  direction?: 'higher-is-better' | 'lower-is-better';
}

export type KpiStatus = 'on-track' | 'off-track' | 'needs-attention';

/**
 * Canonical readonly array mirroring the `KpiStatus` union, drift-pinned via
 * a `node:test` assertion (see `utils/kpiStatus.test.ts`). Pattern mirrors
 * `MATCH_PHASES` / `TURN_STAGES` from `.claude/rules/code-style.md §Drift
 * Detection`. Adding a 4th status to the union without updating this array
 * (or vice versa) fails the drift test loudly.
 */
export const KPI_STATUSES: readonly KpiStatus[] = ['on-track', 'off-track', 'needs-attention'];

export interface PlayerRecord {
  id: string;
  name: string;
  email: string;
  matchesPlayed: number;
  winRate: number;
  lastActive: string;
  status: 'active' | 'inactive' | 'banned';
}

export interface MatchRecord {
  id: string;
  startedAt: string;
  duration: number;
  playerCount: number;
  scheme: string;
  mastermind: string;
  outcome: 'villain_wins' | 'hero_wins' | 'in_progress';
}

export interface RevenueRecord {
  id: string;
  date: string;
  amount: number;
  source: string;
  currency: string;
}

export interface DailyMetric {
  date: string;
  value: number;
}

export interface AlertItem {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface ServerNode {
  id: string;
  name: string;
  region: string;
  status: 'healthy' | 'degraded' | 'down';
  cpuPercent: number;
  memoryPercent: number;
  activeConnections: number;
  uptime: number;
}

export type WebSocketState = 'connected' | 'disconnected' | 'disabled';

export interface BillingHealth {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly webhookFailureRate: number;
  readonly webhookFailureCount: number;
  readonly webhookTotalCount: number;
  readonly intentAbandonmentRate: number;
  readonly intentAbandonedCount: number;
  readonly intentTotalCount: number;
}

export interface NetRevenueSeries {
  readonly dates: readonly string[];
  readonly gross: readonly number[];
  readonly royalty: readonly number[];
  readonly stripeFees: readonly number[];
  readonly infraCogs: readonly number[];
  readonly net: readonly number[];
}

// why: D-19905 + D-19906 — six-field shape locks the StatusEntry contract for
// the v2 snapshot's `status` array. `wpNumber` is a number (e.g. 198);
// `ecNumber` is the literal-string suffix carried verbatim from the heading
// regex's second capture group with the `EC-` prefix stripped (e.g. `'224a'`
// preserves the lowercase letter suffix). `body` is the 480-char capped
// first-paragraph slice from the parser's 3-step skip-then-capture-then-stop
// algorithm; `filePath` is the build-time-resolved WP file path (empty string
// when the resolver found zero or >1 matches under `docs/ai/work-packets/`).
// A seventh field landing silently would fail the field-set drift gate from
// EC-226 §After Completing.
export interface StatusEntry {
  readonly wpNumber: number;
  readonly ecNumber: string;
  readonly title: string;
  readonly date: string;
  readonly body: string;
  readonly filePath: string;
}

// why: D-19908 — every field is a required non-optional `number`; numeric `0`
// is the meaningful zero-value (zero WPs done this week is a real, surface-
// able operator state, not a missing-data state). The composable accessor
// returns the whole object as `null` only for the whole-snapshot-error case;
// when it returns a non-null value, every individual field is a concrete
// number. UI branching collapses to one null-check at the call site instead
// of per-field null-coalescing in every widget.
export interface GovernanceKpis {
  readonly wpsDoneThisWeek: number;
  readonly daysSinceLastDoneFlip: number;
  readonly openDrafts: number;
}

// ============================================================================
// WP-203 / EC-231 — Dashboard Acquisition + Activation + Retention surfaces.
// Forward-locked type contract consumed verbatim by the paired server WP-205
// (`analytics_events` migration + capture endpoints + PII posture decision —
// deferred). Mock-mode-first per D-20302 / WP-197 D-19702; PII posture
// deferred to WP-205 per D-20303. Drift-pinned canonical arrays
// (ACQUISITION_CHANNELS / ACTIVATION_STEPS) mirror WP-198's KPI_STATUSES
// precedent; bidirectional parity is enforced in `utils/funnelTaxonomy.test.ts`.
// ============================================================================

// why: WP-203 §Locked contract values + WP-198 KPI_STATUSES precedent —
// `AcquisitionChannel` is a closed union of the four operator-facing
// top-of-funnel attribution buckets. Adding a fifth value (e.g. 'email',
// 'social') WITHOUT updating both this union AND the ACQUISITION_CHANNELS
// canonical array fails the drift test loudly in
// `utils/funnelTaxonomy.test.ts`. The drift discipline is what lets widget
// templates iterate the canonical array (deterministic order across runtimes)
// instead of `Object.keys()` on a derived map (observation-order-dependent).
export type AcquisitionChannel = 'direct' | 'search' | 'referral' | 'paid';

// why: WP-203 §Determinism scope + WP-198 KPI_STATUSES drift precedent —
// canonical readonly array drift-pinned to `AcquisitionChannel`. Order is
// load-bearing: stacked-bar legend order, per-channel composable iteration,
// and strip-widget pill ordering all read from this array so output is
// byte-identical across JS runtimes regardless of object-key insertion-order
// behavior. Adding a 5th channel without updating both this array AND the
// union fails the drift test in `utils/funnelTaxonomy.test.ts`.
export const ACQUISITION_CHANNELS: readonly AcquisitionChannel[] = [
  'direct',
  'search',
  'referral',
  'paid',
];

// why: WP-203 §Locked contract values — `ActivationStep` is a closed union of
// the four ordered funnel stages: signup-start → signup-complete →
// first-match-started → first-match-completed. Stage order is load-bearing
// (step-to-step conversion = step[n+1].count / step[n].count); reordering
// would silently invert conversion rates. Drift-pinned via the
// ACTIVATION_STEPS canonical array; adding a 5th stage requires updating
// both the union AND the array per the same discipline as
// AcquisitionChannel.
export type ActivationStep =
  | 'signup-start'
  | 'signup-complete'
  | 'first-match-started'
  | 'first-match-completed';

// why: WP-203 §Determinism scope + §Conversion invariants — canonical
// readonly array drift-pinned to `ActivationStep`. Composable iterates this
// array (NOT `Object.keys()`) when assembling per-step output so the funnel
// widget's stage order is deterministic across JS runtimes. The overall
// conversion in `useActivationFunnel` reads
// `stepCounts['first-match-completed'] / stepCounts['signup-start']` (the
// literal end-to-end ratio); step-to-step conversion walks this array in
// index order. Drift test: `utils/funnelTaxonomy.test.ts`.
export const ACTIVATION_STEPS: readonly ActivationStep[] = [
  'signup-start',
  'signup-complete',
  'first-match-started',
  'first-match-completed',
];

// why: WP-203 §Forward-locked envelope (D-20301) — `AcquisitionEventType` is
// the discriminator for the closed-envelope `AnalyticsEvent`. Membership is
// `AcquisitionChannel` ∪ `ActivationStep` ∪ `'retention-return'` (9 values
// total). The union is reserved for FUNNEL events only — adding non-funnel
// event types (billing-charge, governance-event, error-emitted) here would
// bloat the funnel taxonomy and silently widen the envelope's discriminator
// surface. Future non-funnel event types MUST get a sibling union, not a
// member of this one.
export type AcquisitionEventType =
  | AcquisitionChannel
  | ActivationStep
  | 'retention-return';

// why: D-20301 — `AnalyticsEvent` envelope shape is CLOSED at 5 fields
// (event_type, user_id, session_id, timestamp, properties). WP-205
// (`analytics_events` server capture + migration + endpoints, deferred)
// consumes this envelope verbatim. Future per-event-type schema growth
// rides on the open `properties` field, NOT on new envelope fields.
// `user_id: string | null` is union-typed (NOT optional) — `null` is the
// explicit empty value for pre-signup visitors. D-20303 — PII posture
// (raw user_id vs hash vs auth-gated) deferred to WP-205 drafting time;
// WP-203 mocks assume an anonymized opaque string. snake_case field naming
// anticipates the future PostgreSQL column names per `00.2-data-requirements.md`.
export interface AnalyticsEvent {
  readonly event_type: AcquisitionEventType;
  readonly user_id: string | null;
  readonly session_id: string;
  readonly timestamp: number;
  readonly properties: Readonly<Record<string, string | number | boolean | null>>;
}

// why: WP-203 §Aggregation rule — per-day discrete count (NOT cumulative)
// for a single acquisition channel on a single UTC date. `date` is the
// canonical `YYYY-MM-DD` string; series are sorted ascending under Unicode
// code-unit comparison (`localeCompare` forbidden per D-19605 / D-19904 —
// ambient-locale dependence). `visitorCount` is the day's distinct
// visitors that arrived via `channel`; `signupCount` is the subset that
// completed `signup-complete` on that day (per-channel signup conversion
// = signupCount / visitorCount with the standard zero-denominator guard).
export interface TrafficSource {
  readonly channel: AcquisitionChannel;
  readonly date: string;
  readonly visitorCount: number;
  readonly signupCount: number;
}

// why: WP-203 §Aggregation rule + §Conversion invariants — per-day discrete
// count for a single funnel `step` on a single UTC date. Daily series are
// sorted ascending by `date` via Unicode code-unit comparison. The funnel
// composable normalizes partial input to include all 4 ACTIVATION_STEPS
// (missing steps default to count 0) so the widget never enters its `data`
// arm with undefined step entries.
export interface ActivationFunnelStep {
  readonly step: ActivationStep;
  readonly date: string;
  readonly count: number;
}

// why: WP-203 §Retention definition — one weekly signup cohort identified by
// `cohortWeek` in `YYYY-Www` ISO-week notation. `cohortSize` is the count
// of distinct `user_id`s in the cohort. `day1ReturnCount` / `day7ReturnCount`
// count distinct `user_id`s in the cohort with at least one event on the
// corresponding UTC day after signup (per-user-per-day return is a boolean —
// no over-counting). Ties on `day7ReturnCount` are broken in
// `useRetentionCohorts` via lexical-descending `cohortWeek` (most recent
// cohort wins on tie; D-18902 lexical-iteration discipline carry-forward).
export interface RetentionCohort {
  readonly cohortWeek: string;
  readonly cohortSize: number;
  readonly day1ReturnCount: number;
  readonly day7ReturnCount: number;
}
