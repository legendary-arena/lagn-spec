/**
 * Analytics Logic — Server Layer (WP-205 / EC-233)
 *
 * Pure SQL + result mapping for the `legendary.analytics_events`
 * surface. Five exported library functions:
 *
 *   1. `insertAnalyticsEvent(database, row)` — single-row INSERT.
 *   2. `insertAnalyticsEventBatch(database, rows)` — multi-row INSERT
 *      in a single transaction (BEGIN; INSERTs; COMMIT;). Partial
 *      success is forbidden per D-20501 atomicity invariant — either
 *      all rows land or none do.
 *   3. `getTrafficSources(database, range)` — per-channel × per-day
 *      `(visitorCount, signupCount)` aggregation. Channel attribution
 *      uses `ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts
 *      ASC)` to pick the FIRST channel event per session (D-20501
 *      tightening); subsequent channel events ignored; no-channel
 *      sessions excluded entirely.
 *   4. `getActivationFunnel(database, range)` — per-step × per-day
 *      `COUNT(DISTINCT user_id_hash)` for the 4 activation events.
 *   5. `getRetentionCohorts(database, cohortCount)` — weekly cohorts
 *      ending at the most-recent ISO week with `signup-complete`
 *      events. Per-cohort `(cohortSize, day1ReturnCount,
 *      day7ReturnCount)`. Retention return v1 coarse definition:
 *      ANY event where `event_type != 'signup-complete'` AND
 *      `user_id_hash` is in the cohort AND `ts` falls in day-N of
 *      the user's cohort window counts as a return (D-20501).
 *
 * Layer-boundary contract: this module imports only
 * `./analytics.types.js` and the server-shared `DatabaseClient` type.
 * No `boardgame.io`, no `@legendary-arena/(game-engine|registry|preplan)`,
 * no `apps/dashboard/**`. INSERT statements enumerate columns
 * explicitly (positional-bind form forbidden per D-20501). No
 * `Array.sort(...)` — SQL `ORDER BY ASC` is the authoritative sort
 * (D-20501 SQL pre-sorted invariant). No locale-aware string
 * comparison — Unicode code-unit ordering for `YYYY-MM-DD` strings
 * is byte-identical to SQL `ORDER BY ASC` (D-19605 / D-19908
 * carry-forward).
 *
 * Authority: WP-205 §Scope (In) → Server module; EC-233 §Execution
 * Order Sub-task B; D-20501 (schema + aggregation rules + INSERT
 * discipline + SQL pre-sorted + channel attribution + retention
 * v1 coarse); D-20502 (PII posture — `user_id_hash` is the only
 * persisted identity-derived value).
 */

import type { Pool } from 'pg';

import type {
  ActivationFunnelStep,
  DateRange,
  RetentionCohort,
  TrafficSource,
} from './analytics.types.js';

/**
 * Database client surface this module uses. Mirrors the WP-052
 * `DatabaseClient = Pool` re-export so the analytics module does not
 * import `pg` directly. Production wiring passes the long-lived
 * `pg.Pool` constructed at server startup; tests pass a recording
 * fake that satisfies the same `query()` shape.
 */
export type DatabaseClient = Pool;

/**
 * The persistence-layer row shape — `user_id_hash` is the hashed
 * SHA-256 hex digest (NULL for anonymous events). Distinct from the
 * request-layer `AnalyticsEventCapturePayload` (which carries the
 * pre-hash `user_id`). The route boundary maps payload → row via
 * `hashUserId(payload.user_id, salt)` at one site (D-20502); this
 * function NEVER reads the request body directly.
 */
export interface AnalyticsEventRow {
  readonly eventType: string;
  readonly userIdHash: string | null;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly properties: Readonly<Record<string, unknown>>;
}

// why: D-20501 — closed-set guard for the route validator's logic
// layer defense-in-depth. Although the route validator is the
// primary gate, the logic layer asserts the `event_type` is a known
// value before binding it to SQL — protects against a future
// refactor that bypasses the validator.
const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'direct',
  'search',
  'referral',
  'paid',
  'signup-start',
  'signup-complete',
  'first-match-started',
  'first-match-completed',
  'retention-return',
]);

// why: D-20501 — `range` query-parameter maps to a fixed number of
// look-back days for the `(NOW() - INTERVAL '<n> days')` filter in
// the aggregation SQL. The 4 values are the closed `DateRange`
// union; any other value rejected by the route validator before
// reaching this layer.
const RANGE_DAYS: Readonly<Record<DateRange, number>> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

/**
 * INSERTs a single row into `legendary.analytics_events`. The
 * caller has ALREADY hashed `user_id` to `user_id_hash` at the
 * route boundary per D-20502 — this function never sees raw
 * `user_id`. The INSERT statement enumerates target columns
 * explicitly (positional-bind form forbidden per D-20501 INSERT
 * discipline). The `ts` value is the CLIENT-supplied timestamp
 * converted to a Date object; the server clock is NOT used for the
 * persisted value (D-20503 timestamp posture).
 */
export async function insertAnalyticsEvent(
  database: DatabaseClient,
  row: AnalyticsEventRow,
): Promise<void> {
  if (KNOWN_EVENT_TYPES.has(row.eventType) === false) {
    // why: D-20501 logic-layer defense-in-depth — the route validator
    // is the primary gate, but this guard catches a regression where
    // the validator is bypassed. The DB CHECK constraint is the
    // ultimate backstop; this guard surfaces a clearer error site
    // than letting the CHECK fire.
    throw new Error(
      `insertAnalyticsEvent received an out-of-set event_type "${row.eventType}"; valid values are members of ACQUISITION_EVENT_TYPES per D-20501. Verify the route validator was not bypassed.`,
    );
  }
  // why: D-20501 — INSERT enumerates target columns explicitly. The
  // form `INSERT INTO analytics_events VALUES (...)` (no column
  // list) is FORBIDDEN — a future migration adding a column would
  // silently shift positional binds. The `id` and `created_at`
  // columns use their DEFAULTs (UUID v4 + NOW()). The `properties`
  // column is JSONB; an empty object stored as `'{}'::jsonb` via
  // SQL DEFAULT — but the route validator ensures `properties` is
  // always present in `row.properties` (defaulting to `{}` at the
  // route layer).
  await database.query(
    `INSERT INTO legendary.analytics_events
       (event_type, user_id_hash, session_id, ts, properties)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5::jsonb)`,
    [
      row.eventType,
      row.userIdHash,
      row.sessionId,
      row.timestamp,
      JSON.stringify(row.properties),
    ],
  );
}

/**
 * INSERTs a batch of rows into `legendary.analytics_events` in a
 * SINGLE transaction. Partial success is forbidden per D-20501
 * atomicity invariant — either all rows land or none do. The
 * transaction envelope is `BEGIN; INSERT...; COMMIT;` with rollback
 * on any thrown error.
 *
 * Empty input is a no-op (no BEGIN issued; returns immediately).
 * The batch INSERT uses a single multi-row VALUES list to minimize
 * round-trips; column enumeration discipline applies (D-20501).
 */
export async function insertAnalyticsEventBatch(
  database: DatabaseClient,
  rows: readonly AnalyticsEventRow[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  for (const row of rows) {
    if (KNOWN_EVENT_TYPES.has(row.eventType) === false) {
      throw new Error(
        `insertAnalyticsEventBatch received an out-of-set event_type "${row.eventType}"; valid values are members of ACQUISITION_EVENT_TYPES per D-20501. Verify the route validator was not bypassed.`,
      );
    }
  }
  // why: D-20501 atomicity invariant — a single BEGIN/COMMIT
  // envelope around the multi-row INSERT. A failure mid-batch
  // rolls back EVERY row; the test fixture asserts: submit a
  // batch where a row triggers the logic-layer guard above, 0
  // rows are committed. The client is checked out via
  // `pool.connect()` so the BEGIN/COMMIT pair runs on the same
  // session.
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const valueClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    for (const row of rows) {
      // why: D-20501 — column-list-enumerated multi-row VALUES
      // form. Each row contributes 5 placeholders matching the 5
      // INSERTed columns; the `id` + `created_at` columns use
      // their DEFAULTs.
      valueClauses.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, to_timestamp($${paramIndex + 3} / 1000.0), $${paramIndex + 4}::jsonb)`,
      );
      values.push(
        row.eventType,
        row.userIdHash,
        row.sessionId,
        row.timestamp,
        JSON.stringify(row.properties),
      );
      paramIndex = paramIndex + 5;
    }
    await client.query(
      `INSERT INTO legendary.analytics_events
         (event_type, user_id_hash, session_id, ts, properties)
       VALUES ${valueClauses.join(', ')}`,
      values,
    );
    await client.query('COMMIT');
  } catch (error) {
    // why: D-20501 atomicity invariant — rollback on any thrown
    // error so partial-success is forbidden. The caught error is
    // re-thrown so the route layer surfaces a 500 with the
    // `'internal_error'` envelope (D-11802 = (C)).
    try {
      await client.query('ROLLBACK');
    } catch {
      // why: ROLLBACK failure during error recovery is logged at
      // the route layer; the original error is what the caller
      // needs. Swallowing here matches the WP-104 / WP-109
      // transactional precedent.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Returns per-channel × per-day `(visitorCount, signupCount)` for
 * the requested look-back range.
 *
 * Aggregation rule (per D-20501 + D-20501 tightening):
 *
 *   - Per-day buckets via `(ts AT TIME ZONE 'UTC')::date`
 *     (ambient-timezone forbidden).
 *   - Channel attribution per session uses
 *     `ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts ASC)`
 *     filtered to channel events; rn=1 per session is the canonical
 *     channel. Subsequent channel events in the same session are
 *     IGNORED. Sessions with NO channel event are EXCLUDED from
 *     the result entirely (no `direct` fallback bucket).
 *   - `visitorCount = COUNT(DISTINCT session_id)` per (channel, date).
 *   - `signupCount = COUNT(DISTINCT user_id_hash)` joining the
 *     attributed-channel session to a subsequent `signup-complete`
 *     event in the SAME session.
 *   - Output sorted ascending by `(channel, date)` via SQL
 *     `ORDER BY channel ASC, date ASC` — the route MUST NOT call
 *     `Array.sort(...)` per D-20501 SQL pre-sorted invariant.
 */
export async function getTrafficSources(
  database: DatabaseClient,
  range: DateRange,
): Promise<readonly TrafficSource[]> {
  const days = RANGE_DAYS[range];
  // why: D-20501 — channel attribution uses a window function so
  // each session's first-ts channel event is selected exactly once;
  // multi-channel sessions resolve to the FIRST channel only.
  // CTE structure:
  //   * `channel_events` selects every channel event in range,
  //     numbered ascending by `ts` within `session_id`.
  //   * `first_channel` keeps only rn=1 rows — exactly one row per
  //     session that had ANY channel event.
  //   * `signups_in_session` joins each first-channel session to a
  //     subsequent `signup-complete` event in the SAME session.
  //   * The outer SELECT aggregates per (channel, date).
  const result = await database.query(
    `WITH channel_events AS (
       SELECT
         session_id,
         event_type,
         user_id_hash,
         ts,
         ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts ASC) AS rn
       FROM legendary.analytics_events
       WHERE event_type IN ('direct', 'search', 'referral', 'paid')
         AND ts >= NOW() - INTERVAL '${days} days'
     ),
     first_channel AS (
       SELECT session_id, event_type AS channel, ts
       FROM channel_events
       WHERE rn = 1
     ),
     signups_in_session AS (
       SELECT
         fc.session_id,
         fc.channel,
         sc.user_id_hash,
         (fc.ts AT TIME ZONE 'UTC')::date AS bucket_date
       FROM first_channel fc
       INNER JOIN legendary.analytics_events sc
         ON sc.session_id = fc.session_id
        AND sc.event_type = 'signup-complete'
        AND sc.ts >= fc.ts
     )
     SELECT
       fc.channel,
       to_char((fc.ts AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
       COUNT(DISTINCT fc.session_id) AS visitor_count,
       (
         SELECT COUNT(DISTINCT s.user_id_hash)
         FROM signups_in_session s
         WHERE s.channel = fc.channel
           AND s.bucket_date = (fc.ts AT TIME ZONE 'UTC')::date
           AND s.user_id_hash IS NOT NULL
       ) AS signup_count
     FROM first_channel fc
     GROUP BY fc.channel, (fc.ts AT TIME ZONE 'UTC')::date
     ORDER BY fc.channel ASC, (fc.ts AT TIME ZONE 'UTC')::date ASC`,
    [],
  );
  const rows: TrafficSource[] = [];
  for (const dbRow of result.rows) {
    rows.push({
      channel: dbRow.channel as TrafficSource['channel'],
      date: String(dbRow.date),
      visitorCount: Number(dbRow.visitor_count ?? 0),
      signupCount: Number(dbRow.signup_count ?? 0),
    });
  }
  return rows;
}

/**
 * Returns per-step × per-day `count` for the 4 activation events
 * over the requested look-back range.
 *
 * Aggregation rule (per D-20501):
 *
 *   - Per-day buckets via `(ts AT TIME ZONE 'UTC')::date`.
 *   - `count = COUNT(DISTINCT user_id_hash)` per (step, date).
 *     Anonymous events (NULL `user_id_hash`) are excluded from the
 *     DISTINCT count (`NULL ≠ NULL` semantic per SQL spec).
 *   - Output sorted ascending by `(step, date)` from SQL
 *     `ORDER BY step ASC, date ASC` — route MUST NOT re-sort.
 */
export async function getActivationFunnel(
  database: DatabaseClient,
  range: DateRange,
): Promise<readonly ActivationFunnelStep[]> {
  const days = RANGE_DAYS[range];
  const result = await database.query(
    `SELECT
       event_type AS step,
       to_char((ts AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
       COUNT(DISTINCT user_id_hash) AS count
     FROM legendary.analytics_events
     WHERE event_type IN (
       'signup-start', 'signup-complete',
       'first-match-started', 'first-match-completed'
     )
       AND ts >= NOW() - INTERVAL '${days} days'
       AND user_id_hash IS NOT NULL
     GROUP BY event_type, (ts AT TIME ZONE 'UTC')::date
     ORDER BY event_type ASC, (ts AT TIME ZONE 'UTC')::date ASC`,
    [],
  );
  const rows: ActivationFunnelStep[] = [];
  for (const dbRow of result.rows) {
    rows.push({
      step: dbRow.step as ActivationFunnelStep['step'],
      date: String(dbRow.date),
      count: Number(dbRow.count ?? 0),
    });
  }
  return rows;
}

/**
 * Returns the most-recent N weekly signup cohorts with their day-1
 * and day-7 return counts.
 *
 * Aggregation rule (per D-20501 + D-20501 tightening):
 *
 *   - `cohortWeek` is the ISO 8601 `YYYY-Www` label derived in SQL
 *     via `to_char(date_trunc('week', ts), 'IYYY-"W"IW')`.
 *   - `cohortSize = COUNT(DISTINCT user_id_hash)` of `signup-complete`
 *     events per cohort week. NULL user_id_hash (anonymous) excluded.
 *   - dayN return = `COUNT(DISTINCT user_id_hash)` of cohort members
 *     with ANY `event_type != 'signup-complete'` event in day-N of
 *     the user's individual signup-week window (v1 coarse per
 *     D-20501 — channel + activation + retention-return events ALL
 *     count; only signup-complete itself is excluded). The day-N
 *     window is `[signupWeekStart + (N-1) days, signupWeekStart + N
 *     days)` measured at UTC.
 *   - Output sorted ascending by `cohortWeek` (Unicode code-unit
 *     comparison; `YYYY-Www` lexical sort byte-identical to ISO
 *     week order for our range). Limited to the most recent
 *     `cohortCount` cohorts (caller bound 1-26).
 */
export async function getRetentionCohorts(
  database: DatabaseClient,
  cohortCount: number,
): Promise<readonly RetentionCohort[]> {
  // why: D-20501 — retention return v1 coarse definition. The
  // outer query selects the `cohortCount` most-recent cohort weeks
  // by `signup-complete` events, then for each cohort member
  // computes the day-1 and day-7 return windows relative to the
  // user's individual signup `ts` (not the cohort week start), so
  // late-week signups don't get their day-1 window cut off. Both
  // dayN windows EXCLUDE `signup-complete` events per D-20501
  // (a user's second signup-complete within the cohort window is
  // NOT a return).
  const result = await database.query(
    `WITH signup_completes AS (
       SELECT
         user_id_hash,
         ts AS signup_ts,
         to_char(date_trunc('week', ts), 'IYYY-"W"IW') AS cohort_week
       FROM legendary.analytics_events
       WHERE event_type = 'signup-complete'
         AND user_id_hash IS NOT NULL
     ),
     cohort_index AS (
       SELECT
         cohort_week,
         COUNT(DISTINCT user_id_hash) AS cohort_size
       FROM signup_completes
       GROUP BY cohort_week
       ORDER BY cohort_week DESC
       LIMIT $1
     ),
     cohort_members AS (
       SELECT
         sc.cohort_week,
         sc.user_id_hash,
         sc.signup_ts
       FROM signup_completes sc
       INNER JOIN cohort_index ci ON ci.cohort_week = sc.cohort_week
     )
     SELECT
       ci.cohort_week,
       ci.cohort_size,
       (
         SELECT COUNT(DISTINCT cm.user_id_hash)
         FROM cohort_members cm
         WHERE cm.cohort_week = ci.cohort_week
           AND EXISTS (
             SELECT 1 FROM legendary.analytics_events ev
             WHERE ev.user_id_hash = cm.user_id_hash
               AND ev.event_type != 'signup-complete'
               AND ev.ts >= cm.signup_ts + INTERVAL '1 day'
               AND ev.ts <  cm.signup_ts + INTERVAL '2 days'
           )
       ) AS day1_return_count,
       (
         SELECT COUNT(DISTINCT cm.user_id_hash)
         FROM cohort_members cm
         WHERE cm.cohort_week = ci.cohort_week
           AND EXISTS (
             SELECT 1 FROM legendary.analytics_events ev
             WHERE ev.user_id_hash = cm.user_id_hash
               AND ev.event_type != 'signup-complete'
               AND ev.ts >= cm.signup_ts + INTERVAL '7 days'
               AND ev.ts <  cm.signup_ts + INTERVAL '8 days'
           )
       ) AS day7_return_count
     FROM cohort_index ci
     ORDER BY ci.cohort_week ASC`,
    [cohortCount],
  );
  const rows: RetentionCohort[] = [];
  for (const dbRow of result.rows) {
    rows.push({
      cohortWeek: String(dbRow.cohort_week),
      cohortSize: Number(dbRow.cohort_size ?? 0),
      day1ReturnCount: Number(dbRow.day1_return_count ?? 0),
      day7ReturnCount: Number(dbRow.day7_return_count ?? 0),
    });
  }
  return rows;
}
