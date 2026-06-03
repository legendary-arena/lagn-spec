# EC-233 — `analytics_events` Server (Execution Checklist)

**Source:** docs/ai/work-packets/WP-205-analytics-events-server.md
**Layer:** Server — `apps/server/src/analytics/` (new module) + `data/migrations/` + `docs/ai/REFERENCE/api-endpoints.md` (D-11804 catalog update)

> **Use the locked values, constraints, and rationale from WP-205
> verbatim. EC-233 is the operational order + gates + failure smells;
> it does NOT supersede the WP. If EC-233 and WP-205 conflict on
> requirements, WP-205 wins.**

## Execution Order (Locked)

1. **Sub-task A — Migration + types + drift (foundation)**
   - Create `data/migrations/017_create_analytics_events.sql` with
     the 7-column schema + 9-value `event_type` CHECK + 64-char-hex
     `user_id_hash` format CHECK + 2 BTREE indexes per WP-205
     §Locked contract values byte-identical.
   - Create `apps/server/src/analytics/analytics.types.ts` with
     `AcquisitionEventType` union + `ACQUISITION_EVENT_TYPES`
     canonical array + the 5 envelope/payload interfaces +
     `DateRange` + `AnalyticsErrorCode` per WP-205 §Locked
     contract values byte-identical.
   - Create `apps/server/src/analytics/analytics.types.test.ts`
     with drift assertions (≥ 3): canonical-array deep-equal,
     each entry assigns to union, server's list deep-equals
     WP-203 dashboard list parsed from the migration file's
     CHECK constraint text.
   - Gate: `pnpm --filter @legendary-arena/server build` exits 0;
     drift test passes against migration text.
   - **Commit Sub-task A** with prefix `EC-233:`.

2. **Sub-task B — Hash helper + logic + tests**
   - Create `apps/server/src/analytics/userIdHash.ts` exporting
     `hashUserId()` (SHA-256 via `node:crypto`) +
     `getAnalyticsUserIdSalt()` (env-var read; production loud-fail
     on missing; test/dev fixed salt + one-shot warning).
   - Create `apps/server/src/analytics/userIdHash.test.ts` (≥ 5
     tests per WP-205 §Acceptance Criteria → Hash / PII Posture).
   - Create `apps/server/src/analytics/analytics.logic.ts` with
     `insertAnalyticsEvent()` + `insertAnalyticsEventBatch()` +
     `getTrafficSources()` + `getActivationFunnel()` +
     `getRetentionCohorts()`. Pure SQL + result mapping; no HTTP.
   - Create `apps/server/src/analytics/analytics.logic.test.ts`
     (≥ 8 tests per §Acceptance Criteria).
   - Gate: build + test exit 0; ≥ 13 new tests (≥ 5 hash + ≥ 8 logic).
   - **Commit Sub-task B** with prefix `EC-233:`.

3. **Sub-task C — Routes + bootstrap wiring + catalog**
   - Create `apps/server/src/analytics/analytics.routes.ts` with
     `registerAnalyticsRoutes(router, pool, deps)` + 4 handlers
     mirroring the WP-133 `billing.routes.ts` structural shape
     (local `KoaRouter` / `KoaContext` interfaces; caller-injected
     `AnalyticsRouteDependencies`; `Cache-Control: no-store` first
     statement of every handler body; status-code domains per
     WP-205 §Locked auth posture).
   - Create `apps/server/src/analytics/analytics.routes.test.ts`
     (≥ 12 tests per §Acceptance Criteria).
   - Modify `apps/server/src/server.mjs` — append single
     `registerAnalyticsRoutes(server.router, pool, {
     requireAuthenticatedSession, verifier, accountResolver,
     analyticsUserIdSalt })` call at the route-registration
     section. Salt loaded once at startup via
     `getAnalyticsUserIdSalt()`.
   - Modify `docs/ai/REFERENCE/api-endpoints.md` — append 4 new
     rows per D-11804 replace-whole-row merge semantics.
   - Gate: build + test exit 0; ≥ 28 net-new tests total; catalog
     grep returns 4 matches.
   - **Commit Sub-task C** with prefix `EC-233:`.

### Governance close (Sub-task C same session)

4. `docs/ai/STATUS.md` — `### WP-205 / EC-233 Executed` block.
5. `docs/ai/DECISIONS.md` — D-20501..D-20503 byte-identical to
   §DECISIONS.md Verbatim Block below.
6. `docs/ai/work-packets/WORK_INDEX.md` — WP-205 `[x]`.
7. `docs/ai/execution-checklists/EC_INDEX.md` — EC-233 Done.
8. **Commit governance** with prefix `SPEC:`.

## Before Starting

- [ ] **WP-203 landed** ✅ — forward-locked `AnalyticsEvent`
  envelope (D-20301). Verify: `grep -n "AnalyticsEvent\|ACQUISITION_CHANNELS\|ACTIVATION_STEPS"
  apps/dashboard/src/types/index.ts` returns matches.
- [ ] **WP-197 landed** ✅ — deploy posture +
  `authenticated-session-required` auth for dashboard surface.
- [ ] **WP-115 landed** ✅ — `pg.Pool` lifecycle at
  `apps/server/src/db/database.ts`. Verify: `grep -n "createPool\|closePool"
  apps/server/src/db/database.ts` returns matches.
- [ ] **WP-104 / WP-131 / WP-132 / WP-133 landed** ✅ — route +
  logic + types pattern; `requireAuthenticatedSession` middleware;
  closed-set `SessionValidationErrorCode` mapping.
- [ ] **WP-118 landed** ✅ — api-endpoints catalog format.
  Verify: `head -130 docs/ai/REFERENCE/api-endpoints.md` shows the
  closed-set Status + Auth taxonomies.
- [ ] Read WP-205 §Goal, §Assumes, §Non-Negotiable Constraints,
  §Acceptance Criteria — those sections are authoritative.
- [ ] Read `apps/server/src/billing/billing.routes.ts` (closest
  route-layer precedent: `Cache-Control: no-store` first-statement
  lock, local `KoaRouter` / `KoaContext` interfaces, caller-injected
  dependency bundle, status-code domain lock).
- [ ] Read `apps/server/src/billing/billing.logic.ts` (closest
  logic-layer precedent: pure SQL + result mapping).
- [ ] Read `apps/server/src/db/database.ts` (pool lifecycle; per-
  request pool.query checkout pattern).
- [ ] Read `apps/server/src/auth/sessionToken.types.ts` (the
  `requireAuthenticatedSession` + `SessionValidationErrorCode`
  shapes you'll inject).
- [ ] `pnpm --filter @legendary-arena/server build` +
  `pnpm --filter @legendary-arena/server test` exit 0 (anchor
  baseline test count).
- [ ] `ANALYTICS_USER_ID_SALT` env var set for any local test
  invocation that exercises the production-path code (the test
  helper uses a fixed test salt and skips the env var; only
  hand-running the server requires it set).

## Locked Values (verbatim from WP-205)

> The full type definitions + closed unions + canonical array
> live in WP-205 §Non-Negotiable Constraints → Locked contract
> values. Copy them byte-identical into `analytics.types.ts`; do
> NOT re-derive or paraphrase. The condensed summary below is
> for session orientation only.

- **Schema (D-20501):** 7 columns (`id`, `event_type`,
  `user_id_hash`, `session_id`, `ts`, `properties`, `created_at`)
  + 2 CHECK constraints (event_type 9-value set;
  user_id_hash 64-char lowercase hex OR NULL) + 2 BTREE indexes
  (`event_type, ts`; `user_id_hash, ts` WHERE NOT NULL).
- **`AcquisitionEventType` 9-value closed set (D-20501):**
  `'direct' | 'search' | 'referral' | 'paid' | 'signup-start' |
  'signup-complete' | 'first-match-started' |
  'first-match-completed' | 'retention-return'`.
- **`ACQUISITION_EVENT_TYPES` canonical readonly array (D-20501):**
  identical 9-value list in the SAME ORDER.
- **Hash invariant (D-20502):** `user_id_hash =
  sha256(rawUserId || '|' || salt).hex` for non-null `user_id`;
  `null` passthrough for anonymous events. Salt from
  `process.env.ANALYTICS_USER_ID_SALT`; production missing salt →
  loud-fail at startup; test/dev → fixed salt
  `'test-salt-do-not-use-in-prod'` + one-shot console.warn.
- **Test salt literal (D-20502):** the exact string
  `'test-salt-do-not-use-in-prod'` (no leading / trailing
  whitespace; lowercase). The only string literal in source code
  carrying salt material; gated by `NODE_ENV !== 'production'`.
- **One-shot warning message (D-20502):** exact content
  `'[analytics] ANALYTICS_USER_ID_SALT not set; using test-mode
  fallback salt. NOT FOR PRODUCTION.'`. Emitted via
  `console.warn(...)`.
- **One-shot guard mechanism (D-20502):** module-level `let
  hasWarnedAboutSalt = false;` flipped to `true` after the first
  warning; subsequent calls skip the warning. The guard is
  process-lifetime; a fresh process re-warns once. Test asserts
  the second call emits zero warnings using a `mock.method(console,
  'warn')` capture.
- **Auth posture split (D-20503):**
  - `POST /api/analytics/events` — `guest`; 60 events/min/IP
    rate limit; 8 KB single / 100 KB batch / max 50 events per
    batch body cap.
  - `GET /api/analytics/{traffic-sources,activation-funnel,retention-cohorts}`
    — `authenticated-session-required`; SessionValidationErrorCode
    collapse to `'unauthorized'` per D-10403.
- **Response envelope shape (D-20503):** `{ data: readonly T[] }`
  — no `source` / `updatedAt` fields (dashboard's future
  LIVE-flip wrapper adds those at the call site).
- **Status-code domains:** POST `{202, 400, 413, 429, 500}`; 3
  GETs `{200, 400, 401, 500}` each.
- **DateRange:** closed `'7d' | '14d' | '30d' | '90d'`.
- **`Cache-Control: no-store` first-statement lock:** every
  handler body (including error paths) sets the header as the
  literal first statement.
- **Aggregation rule (locked, mirrors WP-203 §Aggregation rule):**
  - Per-day buckets via `(ts AT TIME ZONE 'UTC')::date`.
  - Output sorted ascending by `date` (or `cohortWeek` for
    retention) — Postgres `ORDER BY date ASC` byte-equivalent to
    Unicode code-unit comparison for `YYYY-MM-DD`.
  - `visitorCount = COUNT(DISTINCT session_id)` per (channel,
    date) over the 4 channel events.
  - `signupCount = COUNT(DISTINCT user_id_hash)` joining channel
    events to subsequent `signup-complete` events in same
    `session_id`.
  - Step counts = `COUNT(DISTINCT user_id_hash)` per (step, date).
  - Retention dayN return = `COUNT(DISTINCT user_id_hash)` for
    any non-`signup-complete` event whose `ts` falls in dayN of
    the cohort's signup-complete user-id-hash subset.
- **Channel attribution per session (D-20501 tightening):**
  - For any `session_id`, the channel attributed is the
    FIRST event ordered by `ts ASC` whose `event_type IN
    ('direct', 'search', 'referral', 'paid')`. Subsequent
    channel events in the same session are IGNORED.
    Sessions with no channel event are EXCLUDED from
    `traffic-sources` entirely (NOT bucketed into any
    fallback). SQL implementation MUST use a window
    function: `ROW_NUMBER() OVER (PARTITION BY session_id
    ORDER BY ts ASC)` filtered to channel events; rn=1 per
    session is the canonical channel.
- **Retention return v1 coarse definition (D-20501
  tightening):**
  - A "return" event for cohort day-N is ANY event where
    `event_type != 'signup-complete'` AND `user_id_hash`
    matches the cohort's signup-complete user-hash set
    AND `ts` falls in day-N of that user's cohort window.
    Channel events, activation events, and
    `retention-return` events ALL count. Only
    `signup-complete` is excluded. Per-class filtering is
    a future tuning WP.
- **Idempotency posture (D-20503 tightening): NOT
  IDEMPOTENT.** Duplicate POST submissions produce
  duplicate rows. Server applies no UNIQUE constraint
  beyond `id`. No `INSERT ... ON CONFLICT`. No
  clock-window dedupe. Clients own deduplication if
  needed.
- **Rate limit semantics (D-20503 tightening): PER-EVENT.**
  60 events/min/IP. Batch of N events consumes N tokens.
  Request exceeding remaining tokens → 429 BEFORE any
  parsing / hashing / INSERT work; full batch dropped (no
  partial accept). Token bucket implementation MUST treat
  capacity as event-count, NOT request-count.
- **SQL pre-sorted invariant (D-20501 tightening).** 3 GET
  endpoints return rows DIRECTLY from SQL `ORDER BY ASC`.
  Route layer MUST NOT call `Array.sort(...)` in any GET
  return path. Composable layer (future MOCK→LIVE flip
  WP) MUST NOT re-sort either.
- **INSERT column list MANDATORY (D-20501 tightening).**
  Every `INSERT INTO legendary.analytics_events`
  enumerates target columns explicitly. The form
  `INSERT INTO analytics_events VALUES (...)` (positional
  binds) is FORBIDDEN.
- **Request validation rules (D-20501 / D-20503
  tightening):**
  - `event_type` ∈ `ACQUISITION_EVENT_TYPES` (9 values).
  - `user_id` is `string | null`; non-null max 512 chars
    pre-hash.
  - `session_id` non-empty string ≤ 128 chars.
  - `timestamp` finite number ∈ `[0, Date.now() + 5 *
    60 * 1000]`; server captures `Date.now()` ONCE at
    validator entry as upper-bound anchor; INSERTed `ts`
    is the client-supplied value.
  - `properties` optional; nesting depth ≤ 5; leaf
    values `string | number | boolean | null` only;
    forbidden: `Date`, `undefined`, `Map`, `Set`,
    `Function`, class instances, BigInt, Symbol;
    forbidden root: arrays at root. Empty `properties`
    stored as `'{}'::jsonb`.
- **Cohort week (D-20501 / D-19908):** ISO 8601 week label
  `YYYY-Www` derived in SQL via `to_char(date_trunc('week', ts),
  'IYYY-"W"IW')`. Sort ascending under Unicode code-unit.

## Guardrails

### Semantic (the lines you must not cross)

- **Raw `user_id` never persisted (D-20502).** No row in
  `analytics_events` carries cleartext `user_id` in any column.
  Hashing happens at the route boundary BEFORE INSERT; an
  integration test asserts no column holds the literal test
  user_id string.
- **Closed-set `event_type` enforced at 3 layers (D-20501).**
  Union + canonical array + route validator + SQL CHECK MUST all
  agree byte-identical. Drift test parses the migration file's
  CHECK constraint text and asserts equality with
  `ACQUISITION_EVENT_TYPES`.
- **Always-open capture endpoint is the ONLY currently-`guest`
  endpoint added (D-20503).** The 3 GET query endpoints are
  authenticated. Reversing this (gating POST or opening a GET) =
  HARD FAIL.
- **`Cache-Control: no-store` first-statement lock (D-11504
  carry-forward).** Every handler body — happy path AND error
  paths — sets `ctx.set('Cache-Control', 'no-store')` as the
  literal first statement. A handler whose first statement is
  the route validator (with the header set inside an `if (ok)
  {...}` branch) is HARD FAIL — the error path leaks a
  cacheable response.
- **Salt is never in source code or in checked-in config (D-20502).**
  `getAnalyticsUserIdSalt()` reads `process.env.ANALYTICS_USER_ID_SALT`
  only. The test fixed salt
  `'test-salt-do-not-use-in-prod'` is the only string literal in
  source code; it is gated by `NODE_ENV !== 'production'` AND
  emits a one-shot warning.
- **Aggregation rule (locked, carry-forward from WP-203 + this
  WP's SQL boundary).** SQL `ORDER BY date ASC` is the
  authoritative sort; the route does NOT re-sort. Per-channel /
  per-step assembly iterates the canonical array
  (`ACQUISITION_CHANNELS` / `ACTIVATION_STEPS`) when transforming
  SQL rows to the response shape — NOT `Object.keys()` of a
  derived map.
- **Anonymous-event semantics (D-20501 / D-20502).** Events with
  `user_id: null` are valid and write `user_id_hash = NULL`.
  These events count in `visitorCount` (DISTINCT session_id)
  but NOT in any DISTINCT user_id_hash aggregation (NULL ≠
  NULL in DISTINCT). The dashboard widget data requirements
  reflect this — `signupCount` is 0 for anonymous-only days,
  not NaN.
- **Hashing uniformity (D-20502).** EVERY event's `user_id`
  passes through `hashUserId()` at the route boundary — no
  per-event-type carve-out. Anonymous events naturally
  short-circuit (null input → null output); the hash function
  is called uniformly.
- **Batch transaction atomicity (D-20501).** A batch INSERT runs
  in a single transaction (single statement OR `BEGIN; INSERTs;
  COMMIT;`). Partial-success is forbidden; either all rows in
  the batch land or none do. Test asserts: submit a batch where
  the 3rd event has a malformed `event_type` (route validator
  catches before SQL); 0 rows inserted. Also submit a batch
  where DB CHECK rejects the 3rd row (e.g., bad
  `user_id_hash` format somehow slips through); 0 rows
  committed.
- **Per-IP rate limit is in-memory and resets on process restart
  (D-20503).** v1 ships an in-memory token bucket keyed by
  `ctx.request.ip`. Multi-instance deployments share no state;
  a redis-backed limiter is a future hardening WP if/when
  multi-instance lands. This trade-off documented in the route
  file's header `// why:` block.
- **No real-time / streaming abstraction.** All aggregation runs
  per-request against the live table. A materialized view /
  pre-aggregation table is a future performance WP.
- **No per-user revenue / ARPU SQL.** This is a structural bound,
  not a coding rule — the hashed `user_id` makes per-user
  revenue infeasible from this table. Future ARPU / LTV
  dashboards must source from `legendary.players` + payment
  tables; reviewers reject any PR that joins `analytics_events`
  to identity-bearing tables.
- **No `localeCompare` in any new code** (D-19605 / D-19904
  carry-forward). SQL `ORDER BY date ASC` is byte-equivalent to
  Unicode code-unit comparison for `YYYY-MM-DD`; no client-side
  re-sort needed.
- **API catalog update obligation (D-11804).** 4 new rows under
  `## Wired → Server-Registered Routes`; replace-whole-row merge
  semantics; closed-set `Status: Wired` + closed-set `Auth`
  values; each row's Notes column cites D-20501..D-20503 + the
  relevant carry-forward D-entries.
- **Channel attribution rule MUST be SQL-window-function-based
  (D-20501 tightening).** The `getTrafficSources` query uses
  `ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY ts
  ASC)` filtered to channel events; `rn = 1` is the canonical
  channel per session. Other implementations (e.g., MIN(ts)
  subquery + INNER JOIN with conflict-resolution on equal-ts
  multi-channel sessions) MAY produce equivalent results but
  the window function is the locked pattern for clarity and
  index-friendliness. Test asserts the SQL string contains
  the literal `ROW_NUMBER() OVER (PARTITION BY session_id`
  substring.
- **Sessions with no channel event MUST NOT appear in
  `traffic-sources` (D-20501 tightening).** No `direct`
  fallback bucket; no synthetic null-channel row.
  Integration test asserts: a fixture with one session
  containing only `signup-complete` produces zero
  `TrafficSource` rows.
- **Idempotency forbidden (D-20503 tightening).** No
  `INSERT ... ON CONFLICT (id) DO NOTHING`; no UNIQUE
  constraint on `(session_id, event_type, ts)`; no
  application-layer dedupe map. The capture endpoint
  accepts every well-formed payload as a new event.
- **Rate limit MUST be per-event (D-20503 tightening).**
  The in-memory token bucket's `consume(n)` method counts
  events, not requests. A batch handler computes
  `eventCount = payload.events.length` (or 1 for single-
  event payloads) and calls `bucket.consume(eventCount)`
  BEFORE any parsing / hashing / INSERT. If
  `bucket.consume(eventCount) === false` (insufficient
  tokens), the handler returns 429 with the full payload
  dropped — partial accept FORBIDDEN.
- **INSERT discipline grep (D-20501 tightening).**
  `grep -rnE "INSERT INTO analytics_events VALUES\s*\("
  apps/server/src/analytics/` returns ZERO matches (no
  positional-bind form). `grep -rnE "INSERT INTO
  legendary\.analytics_events\s*\([a-z_,\s]+\)\s*VALUES"
  apps/server/src/analytics/` returns ≥ 2 matches
  (column-list form present in both single + batch INSERT
  paths).
- **No `.sort()` in GET handlers (D-20501 tightening).**
  `grep -nE "\.sort\(" apps/server/src/analytics/analytics.routes.ts`
  returns zero matches inside any of the 3 GET handler
  bodies (the `topSignatures` sort in the route layer is
  not present here — this WP has no signature-tier
  derivation; that's WP-204's surface).
- **`timestamp` future-clock tolerance (D-20503
  tightening).** The validator captures `currentServerTime
  = Date.now()` ONCE at validator entry. Each event's
  `timestamp` is checked against `[0, currentServerTime +
  5 * 60 * 1000]`. The captured `currentServerTime` is
  NOT used for the INSERTed `ts` (that stays the client-
  supplied value). A handler that calls `Date.now()`
  multiple times per request is a flakiness vector — the
  test fixtures inject a fixed `currentServerTime` via
  dependency injection for determinism.
- **Length bounds enforced pre-INSERT (D-20503
  tightening).** `session_id` length validator runs
  BEFORE the INSERT call site. `user_id` length validator
  runs BEFORE the `hashUserId(...)` call. Order matters:
  rejecting over-long `user_id` after hashing wastes CPU
  + a malformed input pretends to be a valid event in
  intermediate state.
- **No raw `user_id` in logs or error messages (D-20502
  tightening — leakage gate).** Every `console.{log,info,
  warn,error}` call site in `apps/server/src/analytics/`
  passes ONLY `user_id_hash` or anonymized identifiers.
  Every error response body references field NAMES, not
  field VALUES. A leakage test intercepts console output
  during a request carrying `user_id: "alice@example.com"`
  and asserts the literal substring `"alice@example.com"`
  does NOT appear in any captured log line.

### Execution (the things you must not touch)

- **Layer boundary:** zero
  `@legendary-arena/(game-engine|registry|preplan)` imports in
  `apps/server/src/analytics/`. Verified by grep at close.
- **No new npm dependencies:** `apps/server/package.json` +
  `pnpm-lock.yaml` zero diff. SHA-256 via `node:crypto` only.
- **No dashboard edits:** `apps/dashboard/` zero diff. The
  MOCK→LIVE flip is a separate future WP.
- **No engine / registry / preplan / client / shared-tooling
  edits:** `packages/`, `apps/arena-client/`,
  `apps/registry-viewer/` zero diff.
- **`Math.random` scope:** forbidden in `apps/server/src/analytics/`.
  Determinism is achieved by SHA-256 + the seeded test fixtures;
  v1 has no randomized event generator.
- **`Date.now()` scope:** allowed only at server-side ingest time
  (`created_at DEFAULT NOW()` in SQL OR `ctx.set` of a header
  reading `Date.now()`); forbidden in aggregation queries or
  PII-derivation paths.
- **Migration is forward-only.** No rollback SQL in the
  migration file. A rollback (drop table) is a future
  operational decision if ever needed; v1 ships migrate-forward
  only.
- **Status-code domain locks:** each handler's status-code
  domain is closed; a 403 / 404 / 422 leaking from any handler =
  HARD FAIL (test asserts no other status codes appear).
- **Required attributes per handler:** every handler body's first
  statement sets `Cache-Control: no-store`. Verified by grep at
  close (`grep -E "ctx\.set\('Cache-Control', 'no-store'\)"
  apps/server/src/analytics/analytics.routes.ts` returns ≥ 4
  matches — one per handler).
- **Pre-existing surface preservation:** `git diff --name-only`
  on every non-analytics route file
  (`apps/server/src/billing/`, `apps/server/src/profile/`,
  `apps/server/src/teams/`, `apps/server/src/entitlements/`,
  `apps/server/src/leaderboards/`, etc.) returns empty (no
  incidental edits to sibling surfaces).

## Required `// why:` Comments

- `analytics.types.ts` — at each new interface and the closed
  union + canonical array, a `// why:` line citing D-20501
  (schema / envelope lock) and the WP-203 forward-contract
  precedent.
- `ACQUISITION_EVENT_TYPES` canonical array — `// why:` citing
  WP-198's `KPI_STATUSES` drift-detection precedent and pointing
  at `analytics.types.test.ts` as the enforcement site.
- `userIdHash.ts` `hashUserId()` — `// why:` citing D-20502
  (SHA-256 + salt PII posture; null passthrough for anonymous
  events; per-event-type carve-outs forbidden).
- `userIdHash.ts` `getAnalyticsUserIdSalt()` — `// why:` citing
  D-20502 (production loud-fail on missing salt; test/dev fixed
  salt + one-shot warning; salt rotation deferred). The
  production-path throw includes a full-sentence error with
  remediation: `'ANALYTICS_USER_ID_SALT is unset; refusing to
  start. Set the env var to a high-entropy secret string in the
  deployment environment.'`.
- `analytics.logic.ts` per-aggregation function — `// why:`
  documenting the aggregation rule (`COUNT(DISTINCT session_id)`
  vs `COUNT(DISTINCT user_id_hash)`; anonymous-event treatment;
  ascending-by-date sort under SQL `ORDER BY` matching Unicode
  code-unit comparison).
- `analytics.logic.ts` SQL `(ts AT TIME ZONE 'UTC')::date`
  conversion — `// why:` UTC-bucket discipline; ambient-timezone
  dependence is forbidden.
- `analytics.logic.ts` batch-INSERT transaction — `// why:`
  D-20501 atomicity invariant; partial-success forbidden.
- `analytics.routes.ts` per-handler — `// why:` first statement
  `Cache-Control: no-store` per D-11504 lock; status-code domain
  + auth posture cited per D-20503 row in the locked table.
- `analytics.routes.ts` `POST /api/analytics/events` `guest`
  auth comment — `// why:` D-20503 always-open posture rationale
  (pre-signup visitors have no session token); per-IP rate limit
  + body cap are the always-open defenses.
- `analytics.routes.ts` 3 GET endpoints `requireAuthenticatedSession`
  call — `// why:` D-20503 operator-only posture + D-10403
  account-existence-probe defense (collapse
  `SessionValidationErrorCode` to single `'unauthorized'`).
- `analytics.routes.ts` `hashUserId(user_id, salt)` call at the
  route boundary — `// why:` D-20502 PII posture; raw `user_id`
  is converted to hash BEFORE INSERT, never persisted in
  cleartext.
- `analytics.routes.ts` in-memory rate limiter — `// why:` D-20503
  v1 in-memory token bucket; multi-instance state-sharing
  deferred (future redis-backed limiter is a hardening WP);
  resets on process restart.
- `analytics.routes.ts` response envelope shape (`{ data: [...]
  }`) — `// why:` D-20503; the dashboard's future LIVE-flip
  wrapper adds `source: 'LIVE'` + `updatedAt: Date.now()` at the
  call site (server stays envelope-agnostic).
- `server.mjs` `registerAnalyticsRoutes(...)` call — `// why:`
  registration order is per the existing convention
  (alphabetical / chronological at this section); salt loaded
  once at startup via `getAnalyticsUserIdSalt()` and injected.
- `017_create_analytics_events.sql` per CHECK constraint —
  `// why:` D-20501 (schema lock; 3-layer closed-set enforcement;
  64-char-hex format CHECK on `user_id_hash` catches a regression
  where the hash step is skipped).
- `017_create_analytics_events.sql` per index — `// why:` query
  patterns the index serves (the future ops-rollup WP will know
  what to pre-aggregate from these patterns).
- `analytics.logic.ts` channel-attribution window function —
  `// why:` D-20501 channel attribution lock; FIRST `(ts ASC)`
  channel event per session wins; subsequent channel events
  IGNORED; no-channel sessions EXCLUDED from `traffic-sources`
  entirely.
- `analytics.logic.ts` retention return query — `// why:`
  D-20501 v1 coarse return definition; ANY event `!=
  'signup-complete'` in day-N counts; per-class filtering
  deferred.
- `analytics.routes.ts` rate-limit `bucket.consume(eventCount)`
  call — `// why:` D-20503 per-EVENT rate limit (NOT per-
  request); batching cannot bypass; reject BEFORE any parsing
  / hashing / INSERT.
- `analytics.routes.ts` capture handler's "no idempotency"
  branch (the absence of `ON CONFLICT`) — `// why:` D-20503
  capture endpoint is NOT idempotent in v1; duplicates
  produce duplicate rows; client-owned deduplication.
- `analytics.routes.ts` `timestamp` validator — `// why:`
  D-20503 timestamp bounds; server captures
  `currentServerTime = Date.now()` ONCE at validator entry as
  upper-bound anchor only; INSERTed `ts` is client-supplied.
- `analytics.routes.ts` `session_id` / `user_id` length
  validators — `// why:` D-20503 length bounds; `session_id`
  ≤ 128; `user_id` ≤ 512 pre-hash; user_id length check runs
  BEFORE `hashUserId(...)` call to avoid wasted CPU on
  rejected payloads.
- `analytics.routes.ts` `properties` depth + leaf-type
  validator — `// why:` D-20501 `properties` JSON-
  serializability + depth ≤ 5; forbidden leaf types
  (`Date`, `undefined`, `Map`, `Set`, `Function`, class
  instances, BigInt, Symbol); empty stored as
  `'{}'::jsonb` via SQL DEFAULT.
- `analytics.routes.ts` any `console.{log,info,warn,error}`
  call site — `// why:` D-20502 leakage gate; logs
  reference `user_id_hash` only; raw `user_id` MUST NOT
  appear in any captured log line. Error responses use
  field-NAME messages, not field-VALUE messages.
- `analytics.routes.ts` GET handlers' return path — `// why:`
  D-20501 SQL pre-sorted invariant; rows returned in SQL
  `ORDER BY ASC` order directly; route MUST NOT call
  `Array.sort(...)` here.
- INSERT statement in `analytics.logic.ts` (single + batch
  paths) — `// why:` D-20501 INSERT column list MANDATORY;
  positional binds forbidden; a future migration adding a
  column would silently shift positional binds without an
  explicit column list.

## Files to Produce

### Sub-task A — Migration + Types + Drift (3 files)

- `data/migrations/017_create_analytics_events.sql` — **new** —
  schema + CHECKs + indexes byte-identical to WP-205 §Locked
  contract values.
- `apps/server/src/analytics/analytics.types.ts` — **new** —
  union + canonical array + 5 envelope interfaces + DateRange +
  AnalyticsErrorCode per WP-205 §Locked contract values.
- `apps/server/src/analytics/analytics.types.test.ts` — **new** —
  drift assertions; ≥ 3 tests (`should_<behavior>_when_<condition>`
  naming).

### Sub-task B — Hash + Logic + Tests (4 files)

- `apps/server/src/analytics/userIdHash.ts` — **new** —
  `hashUserId()` + `getAnalyticsUserIdSalt()`; SHA-256 via
  `node:crypto`.
- `apps/server/src/analytics/userIdHash.test.ts` — **new** —
  ≥ 5 tests covering deterministic hash; salt-influence; null
  passthrough; production missing-salt loud-fail; 64-char
  lowercase hex format.
- `apps/server/src/analytics/analytics.logic.ts` — **new** —
  `insertAnalyticsEvent()` + `insertAnalyticsEventBatch()` +
  `getTrafficSources()` + `getActivationFunnel()` +
  `getRetentionCohorts()`. Pure SQL + result mapping.
- `apps/server/src/analytics/analytics.logic.test.ts` — **new** —
  ≥ 8 tests; per-aggregation typical + empty + zero-denominator;
  anonymous-event handling; UTC date boundary; ascending sort;
  closed-set rejection; batch rollback.

### Sub-task C — Routes + Bootstrap + Catalog (4 files)

- `apps/server/src/analytics/analytics.routes.ts` — **new** —
  `registerAnalyticsRoutes(router, pool, deps)` exporting 4
  endpoint handlers per the WP-133 structural shape.
- `apps/server/src/analytics/analytics.routes.test.ts` — **new** —
  ≥ 12 tests covering each endpoint + status-code domain locks +
  `Cache-Control` first-statement + auth collapse + closed-set
  rejection + rate-limit + size cap + envelope shape.
- `apps/server/src/server.mjs` — **modified** — single
  `registerAnalyticsRoutes(...)` call appended; salt loaded
  once at startup.
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — append 4
  new rows under `## Wired → Server-Registered Routes` per
  D-11804 replace-whole-row merge semantics.

### Governance (4 files)

- `docs/ai/STATUS.md` — **modified** — `### WP-205 / EC-233
  Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-20501..D-20503
  (reserved → Active byte-identical to §DECISIONS.md Verbatim
  Block below).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-205
  row `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** —
  EC-233 row Done.

**Total: 15 files** (9 new + 2 modified source + 4 governance).

## After Completing

### Sub-task A close

- [ ] Migration applies clean against a fresh local DB; `\d
  legendary.analytics_events` shows 7 columns.
- [ ] `analytics_events_event_type_check` rejects `'unknown'` at
  the DB.
- [ ] `analytics_events_user_id_hash_format` rejects
  `'not-a-hash'` at the DB.
- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] Drift test passes with EXACT equality (D-20501
  tightening). Parses the SQL CHECK constraint string from
  `017_create_analytics_events.sql` text via a literal
  substring match on
  `'CHECK (event_type IN ('` followed by reading the
  9 quoted string literals in order. Compares against
  `ACQUISITION_EVENT_TYPES` using:
  - exact string equality per element,
  - preserved order (same indices),
  - same length,
  - whitespace-trimmed comparison on each parsed value.
  Any deviation (extra element, missing element, order
  swap, whitespace mismatch, character-case mismatch)
  fails the test loudly with a sentence-form diagnostic.
- [ ] Grep: 1 union + 1 canonical array + 5 interfaces + 1
  DateRange + 1 AnalyticsErrorCode present in
  `analytics.types.ts` byte-identical to WP-205 §Locked contract
  values.

### Sub-task B close

- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with
  baseline + **≥ 13 new tests** (≥ 5 hash + ≥ 8 logic).
- [ ] Hash determinism: same input + salt → byte-identical
  output across two consecutive calls.
- [ ] Salt-influence: different salts produce different hashes
  for the same input.
- [ ] Null passthrough: `hashUserId(null, salt)` returns `null`.
- [ ] Production loud-fail: in `NODE_ENV === 'production'`,
  `getAnalyticsUserIdSalt()` throws a full-sentence error when
  the env var is unset OR empty string.
- [ ] Test/dev fallback: `getAnalyticsUserIdSalt()` returns the
  fixed test salt + emits exactly one `console.warn` per process
  (one-shot guard).
- [ ] **Raw `user_id` never persisted** — integration test in
  `analytics.logic.test.ts` posts a synthetic insert with
  `user_id_hash` computed from the test salt, then SELECTs every
  column and asserts NO column contains the literal raw user_id
  string.
- [ ] Batch INSERT rollback: malformed mid-batch event → 0 rows
  committed.
- [ ] Aggregation correctness: per-channel × per-day counts
  match a hand-computed fixture.
- [ ] **Channel attribution test (D-20501 tightening):**
  fixture seeds a single session with three events at
  ascending `ts`: `direct@t1`, `search@t2`,
  `signup-complete@t3`. `getTrafficSources(range)` returns
  a row with `channel: 'direct'` (NOT `'search'`, NOT both,
  NOT duplicated). A second fixture session with ONLY
  `signup-complete` (no channel event) produces zero
  `TrafficSource` rows in the same query.
- [ ] **Window function used in SQL (D-20501 tightening):**
  `grep -nE "ROW_NUMBER\(\) OVER \(PARTITION BY
  session_id ORDER BY ts ASC\)"
  apps/server/src/analytics/analytics.logic.ts` returns
  ≥ 1 match.
- [ ] **Retention v1 coarse return test (D-20501
  tightening):** fixture seeds a cohort with one user
  whose signup-complete is on `2026-06-01` and who emits
  `first-match-started` on `2026-06-02`, a channel event
  (`direct`) on `2026-06-08`, and another `signup-complete`
  on `2026-06-09`. `getRetentionCohorts(1)` reports
  `day1ReturnCount = 1` (first-match-started counts) and
  `day7ReturnCount = 1` (the channel event on day 7
  counts; the second `signup-complete` is excluded by
  definition).
- [ ] **INSERT column list grep (D-20501 tightening):**
  `grep -rnE "INSERT INTO analytics_events VALUES\s*\("
  apps/server/src/analytics/` returns 0;
  `grep -rnE "INSERT INTO legendary\.analytics_events\s*\("
  apps/server/src/analytics/` returns ≥ 2.

### Sub-task C close

- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with
  ≥ 28 net-new tests total.
- [ ] **`Cache-Control: no-store` first-statement grep:**
  `grep -nE "ctx\.set\('Cache-Control', 'no-store'\)"
  apps/server/src/analytics/analytics.routes.ts` returns ≥ 4
  matches (one per handler).
- [ ] **Status-code domain per handler** — tests assert each
  handler emits ONLY codes from its locked domain.
- [ ] **Closed-set `event_type` rejection at route validator**:
  `POST` with `event_type = 'unknown'` → 400 `'invalid_request'`
  BEFORE any DB write.
- [ ] **Rate limit trigger**: 61st request within 60s from same
  IP → 429 `'rate_limited'`.
- [ ] **Body size cap**: 51-event batch → 413
  `'payload_too_large'`; > 8 KB single event → 413.
- [ ] **Auth failure collapse**: missing/invalid/expired token /
  unknown account → 401 `'unauthorized'` (single client-facing
  value per D-10403).
- [ ] **Catalog rows landed**: `grep -nE "/api/analytics/(events|traffic-sources|activation-funnel|retention-cohorts)"
  docs/ai/REFERENCE/api-endpoints.md` returns 4 matches.
- [ ] **Request validation: `timestamp` bounds (D-20503
  tightening).** Payload with `timestamp: -1` → 400; payload
  with `timestamp` > `Date.now() + 5 * 60 * 1000` (test
  injects `currentServerTime` via dependency injection for
  determinism) → 400; payload with `timestamp` exactly at
  the upper bound → 202.
- [ ] **Request validation: `session_id` length (D-20503
  tightening).** Payload with `session_id: ''` → 400;
  payload with `session_id` of 129 chars → 400; 128 chars
  → 202.
- [ ] **Request validation: `user_id` length (D-20503
  tightening).** Payload with `user_id` of 513 chars → 400
  WITHOUT calling `hashUserId(...)`; 512 chars → 202;
  `user_id: null` → 202.
- [ ] **Request validation: `properties` depth (D-20501
  tightening).** Payload with `properties` nested 6 levels
  deep → 400; 5 levels → 202; arrays count as one level
  (a payload with a 3-level array-of-arrays nested inside
  a 3-level object → 6 levels → 400).
- [ ] **Request validation: `properties` forbidden types
  (D-20501 tightening).** Payload with `properties:
  { ts: new Date() }` arrives as either an ISO string or a
  number depending on JSON serialization — the validator
  rejects with 400 if any leaf value's type tag is outside
  `{string, number, boolean, null}`. Test injects synthetic
  parsed values via a mock JSON parser to exercise the
  `Date`/`Map`/`Set`/`Function`/class-instance/BigInt/Symbol
  rejection paths.
- [ ] **Request validation: empty `properties` default
  (D-20501 tightening).** Payload omitting `properties` →
  202; row's `properties` column = `{}` (JSONB). Payload
  with `properties: {}` → 202; row's `properties` column
  = `{}` (JSONB).
- [ ] **Idempotency: NOT IDEMPOTENT (D-20503 tightening).**
  Same payload (event_type / user_id / session_id /
  timestamp / properties all identical) POSTed twice in
  distinct requests → both return 202; table row count
  = 2; aggregate queries see both rows.
- [ ] **Rate limit: per-event semantics (D-20503
  tightening).** Initial bucket capacity 60. Submit a
  batch of 30 events → 202 (bucket: 30 remaining).
  Submit a batch of 31 events → 429 BEFORE any
  parsing/hashing/INSERT (no `hashUserId(...)` call
  observed via test-injected spy); 0 new rows.
  Submit a batch of 30 events → 202 (bucket: 0 remaining).
  Submit a single event → 429.
- [ ] **SQL pre-sorted invariant (D-20501 tightening).**
  `grep -nE "\.sort\("
  apps/server/src/analytics/analytics.routes.ts` returns
  0 matches inside the 3 GET handler bodies (matches in
  other handlers — e.g., the POST batch handler — are OK
  if they exist). Each of the 3 GET endpoints returns
  rows in the SQL's natural `ORDER BY ASC` order; a test
  asserts the returned array is already monotonically
  non-decreasing by `date` / `cohortWeek` (no client-side
  sort step in the test could correct a regression).
- [ ] **Leakage gate: raw user_id NOT in logs/errors
  (D-20502 tightening).** Test intercepts `console.log` /
  `console.info` / `console.warn` / `console.error`
  during a POST carrying `user_id: "alice@example.com"`
  AND `properties: { "note": "alice@example.com" }`. The
  response status is 202; the row's `user_id_hash` is the
  SHA-256 of `"alice@example.com|" + testSalt`; the row's
  `properties` column carries `{"note":"alice@example.com"}`
  verbatim (string preservation in `properties` is
  intended). The leakage gate asserts the literal
  substring `"alice@example.com"` does NOT appear in any
  captured log line emitted by `apps/server/src/analytics/`
  code. A follow-up negative-path test POSTs a payload
  with an over-long `user_id` (513 chars including the
  string `"alice@example.com"` as a prefix), confirms 400
  response, AND asserts the substring does not appear in
  the error response body OR captured logs.
- [ ] **Server.mjs wiring**: `grep -nE "registerAnalyticsRoutes"
  apps/server/src/server.mjs` returns 2 matches (import + call).
- [ ] Pre-existing route files unchanged: `git diff --name-only
  apps/server/src/billing/ apps/server/src/profile/
  apps/server/src/teams/ apps/server/src/entitlements/
  apps/server/src/leaderboards/` returns empty.

### Cross-cutting close

- [ ] **Layer-boundary grep:** `grep -rnE
  "@legendary-arena/(game-engine|registry|preplan)"
  apps/server/src/analytics/` returns zero matches.
- [ ] **No-new-deps gate:** `git diff --stat
  apps/server/package.json pnpm-lock.yaml` empty.
- [ ] **No-dashboard-edits gate:** `git diff --name-only
  apps/dashboard/` empty.
- [ ] **No-engine-edits gate:** `git diff --name-only packages/
  apps/arena-client/ apps/registry-viewer/` empty.
- [ ] **No-Math.random in analytics:** `grep -rnE "Math\.random"
  apps/server/src/analytics/` returns zero matches.
- [ ] **No raw `user_id` persistence:** `grep -rnE "user_id\b"
  apps/server/src/analytics/` returns matches ONLY in (a) the
  type definition (`AnalyticsEventCapturePayload`), (b) the
  hash function input parameter, and (c) `// why:` comments
  documenting the rule. NO matches inside SQL INSERT statements
  or in any column-binding code path.
- [ ] **No `localeCompare`:** `grep -rnE "localeCompare"
  apps/server/src/analytics/` returns zero matches.
- [ ] **Manual smoke test (operator-runnable):** start the
  server with `ANALYTICS_USER_ID_SALT=test-salt-do-not-use-in-prod
  NODE_ENV=development pnpm --filter @legendary-arena/server
  dev`; `curl -X POST http://localhost:8080/api/analytics/events
  -H 'Content-Type: application/json' -d '{"event_type":"direct",
  "user_id":null,"session_id":"sess-1","timestamp":1717459200000}'`
  → expect 202 `{ "accepted": 1 }`. Then `psql -c "SELECT
  event_type, user_id_hash, session_id FROM
  legendary.analytics_events LIMIT 1;"` shows the row with
  `user_id_hash` NULL. With a `user_id: "alice"` payload,
  the row's `user_id_hash` equals `sha256("alice|test-salt-
  do-not-use-in-prod").hex` (64-char hex).
- [ ] `pnpm -r build` exits 0.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md`
  D-20501..D-20503 landed Active byte-identical to this EC's
  §DECISIONS.md verbatim block; `WORK_INDEX.md` WP-205 `[x]`;
  `EC_INDEX.md` EC-233 Done.

## Pre-Commit Failure Smells (Must Review Before Commit)

- **Raw `user_id` in any analytics_events row** → D-20502 HARD
  FAIL. Hashing skipped or bypassed. Inspect every INSERT path
  and verify `hashUserId(rawUserId, salt)` precedes it.
- **Production server starts with `ANALYTICS_USER_ID_SALT` unset**
  → D-20502 HARD FAIL. The loud-fail guard is missing or
  reversed.
- **Closed-set `event_type` rejection passes at the route
  validator but fails at the DB CHECK constraint (or vice versa)**
  → D-20501 3-layer enforcement broken. The two sites are not
  in sync.
- **10th `event_type` added without updating union AND canonical
  array AND route validator AND SQL CHECK** → drift test fires
  loudly. Update all 4 sites in the same commit.
- **Per-IP rate limit absent or wrong limit value** → D-20503
  HARD FAIL. Always-open posture's primary defense.
- **Body-size cap absent on POST** → D-20503 HARD FAIL.
- **Any GET endpoint accepts unauthenticated requests** → D-20503
  HARD FAIL.
- **`Cache-Control: no-store` not the first statement of any
  handler** → D-11504 HARD FAIL. Error paths leak cacheable
  responses.
- **Response envelope contains `source` / `updatedAt` fields** →
  D-20503 envelope shape violation. Server stays envelope-
  agnostic.
- **Batch INSERT partial success** → D-20501 atomicity HARD
  FAIL. Inspect the SQL — should be single statement OR
  `BEGIN; ...; COMMIT;` with no intermediate COMMITs.
- **SQL `ORDER BY date DESC` or unsorted output** →
  §Aggregation rule HARD FAIL. Ascending sort is the dashboard
  contract.
- **`Math.random()` in `apps/server/src/analytics/`** → forbidden
  per §Determinism scope. v1 has no randomized event generator.
- **`localeCompare` anywhere in `apps/server/src/analytics/`** →
  D-19605 / D-19904 HARD FAIL.
- **`@legendary-arena/(game-engine|registry|preplan)` import in
  `apps/server/src/analytics/`** → layer boundary violation.
- **`apps/server/package.json` or `pnpm-lock.yaml` diff** →
  new-dep violation. SHA-256 via `node:crypto` only.
- **`apps/dashboard/` diff** → scope creep; MOCK→LIVE flip is a
  future WP.
- **`apps/arena-client/` / `apps/registry-viewer/` / `packages/`
  diff** → scope creep; client emission + engine code untouched.
- **`docs/ai/REFERENCE/api-endpoints.md` not updated, or partial-
  column update** → D-11804 HARD FAIL. Replace whole rows.
- **PR / commit lands without 4 new catalog rows** → D-11804
  HARD FAIL.
- **`registerAnalyticsRoutes` registered before pool is
  constructed in `server.mjs`** → wiring order violation.
- **Salt stored in source code or in a checked-in config file**
  → D-20502 HARD FAIL.
- **SHA-1 / MD5 used instead of SHA-256** → D-20502 HARD FAIL.
  Practical collisions exist for both.
- **Per-user revenue SQL joining `analytics_events` to identity-
  bearing tables** → structural bound violation per D-20502
  intentional design. Future ARPU dashboards source from
  `legendary.players`, not this table.
- **Session attributed to MULTIPLE channels** → D-20501
  channel attribution HARD FAIL. Each session has exactly
  one channel — the FIRST `(ts ASC)` channel event;
  subsequent channel events ignored.
- **No-channel sessions bucketed into `direct` fallback or
  appearing as null-channel rows** → D-20501 HARD FAIL.
  Sessions without any channel event are EXCLUDED from
  `traffic-sources` entirely.
- **`MIN(ts)` subquery / GROUP BY with implicit
  tie-breaking instead of `ROW_NUMBER() OVER (PARTITION
  BY ...)`** → D-20501 implementation HARD FAIL. The
  window function is the locked pattern for clarity and
  index friendliness.
- **`INSERT INTO analytics_events VALUES (...)`
  (positional binds, no column list)** → D-20501 INSERT
  discipline HARD FAIL. Future migration adding a column
  would silently shift binds.
- **`Array.sort(...)` call site in any of the 3 GET
  handler return paths** → D-20501 SQL pre-sorted
  invariant HARD FAIL. SQL `ORDER BY ASC` is
  authoritative; route MUST NOT re-sort.
- **`INSERT ... ON CONFLICT DO NOTHING` (or any
  application-layer dedupe)** → D-20503 idempotency
  posture HARD FAIL. Capture endpoint is intentionally
  NOT idempotent in v1.
- **Rate limit counting REQUESTS instead of EVENTS** →
  D-20503 rate-limit semantics HARD FAIL. Bucket
  capacity is on events; batching cannot bypass the
  limit.
- **Partial batch accept (rate limit consumed N tokens;
  M < N events inserted because some failed downstream
  validation)** → D-20503 HARD FAIL. Either the full
  batch lands (202) or none of it does (4xx); no
  intermediate state.
- **`Date.now()` used for INSERTed `ts`** → D-20503
  timestamp posture HARD FAIL. INSERTed `ts` is the
  client-supplied `timestamp`; server clock used ONLY
  for the upper-bound anchor at validator entry.
- **`Date.now()` called multiple times per request inside
  the validator** → flakiness vector; D-20503 captures
  `currentServerTime` ONCE per request.
- **`session_id` length check missing or applied
  post-INSERT** → D-20503 length-bound HARD FAIL.
- **`user_id` length check applied AFTER
  `hashUserId(...)`** → D-20503 ordering HARD FAIL.
  Length check runs BEFORE hashing to avoid wasted CPU
  + invalid intermediate state.
- **`properties` depth check missing or implemented via
  `JSON.stringify(...).length` (proxy for depth)** →
  D-20501 depth HARD FAIL. Depth = nesting levels, NOT
  serialized size.
- **Arrays at `properties` root accepted** → D-20501
  HARD FAIL. Root must be an object (so future
  per-event-type metadata has a stable key surface).
- **Raw `user_id` appears in any `console.log` /
  `console.info` / `console.warn` / `console.error` call
  site inside `apps/server/src/analytics/`** → D-20502
  leakage HARD FAIL. Logs reference `user_id_hash` only.
- **Raw `user_id` echoed in any 4xx error response body**
  → D-20502 leakage HARD FAIL. Error messages reference
  field NAMES, not field VALUES.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> Per PS-1 convention (WP-196 / WP-198 / WP-199 / WP-203 / WP-204
> precedent): the D-20501..D-20503 entries land in
> `docs/ai/DECISIONS.md` at the execution-close governance commit
> byte-identical to the block below. Status flips from `Reserved
> (proposed)` at draft time to `Active` at landing time; no other
> field changes.

### D-20501 — `analytics_events` Schema Closed at 7 Columns; `event_type` 9-Value CHECK Enforced at DB Level

**Decision:**
`legendary.analytics_events` schema is closed at 7 columns: `id`
(UUID PK; `gen_random_uuid()` default), `event_type` (TEXT;
9-value CHECK), `user_id_hash` (CHAR(64) NULL; 64-char-lowercase-
hex format CHECK or NULL), `session_id` (TEXT NOT NULL), `ts`
(TIMESTAMPTZ NOT NULL; client-supplied event time), `properties`
(JSONB NOT NULL DEFAULT '{}'), `created_at` (TIMESTAMPTZ NOT
NULL DEFAULT NOW(); server-side ingest time). 2 BTREE indexes:
`(event_type, ts)` for per-channel + per-step aggregation;
`(user_id_hash, ts) WHERE user_id_hash IS NOT NULL` for cohort
retention queries (partial index excludes the
anonymous-event subset).

The 9-value `event_type` closed set (`'direct'` / `'search'` /
`'referral'` / `'paid'` / `'signup-start'` / `'signup-complete'`
/ `'first-match-started'` / `'first-match-completed'` /
`'retention-return'`) is enforced at THREE layers: the
TypeScript union (`AcquisitionEventType`) + the canonical
readonly array (`ACQUISITION_EVENT_TYPES`) + the route validator
+ the SQL CHECK constraint. Adding a 10th event type requires
updating all 4 sites in the same WP; drift test catches
asymmetric updates.

Future per-event-type metadata rides on the `properties` JSONB
field (no schema change required). Adding a new top-level
column is a breaking change — requires a new migration + a new
D-entry + a justification why the data can't live in
`properties`.

**Tightening (channel attribution, retention return, SQL
pre-sorted, INSERT discipline, request validation rules):**

- **Channel attribution per session.** For any `session_id`,
  the attributed channel is the FIRST `(ts ASC)` event whose
  `event_type IN ('direct', 'search', 'referral', 'paid')`.
  Subsequent channel events in the same session are IGNORED
  for `traffic-sources` attribution. Sessions with no
  channel event are EXCLUDED entirely (NOT bucketed as a
  `direct` fallback or null-channel row). SQL implementation
  uses a window function: `ROW_NUMBER() OVER (PARTITION BY
  session_id ORDER BY ts ASC)` filtered to channel events;
  `rn = 1` per session is the canonical channel.
- **Retention return definition (v1 coarse).** A "return"
  event for cohort day-N is ANY event where `event_type !=
  'signup-complete'` AND `user_id_hash` matches the cohort's
  signup-complete user-hash set AND `ts` falls in day-N of
  that user's cohort window. No event-type-class filtering
  in v1 — channel events, activation events, AND
  `retention-return` events all count. Per-class filtering
  is a future tuning WP.
- **SQL pre-sorted invariant.** The 3 GET endpoints return
  rows DIRECTLY from SQL `ORDER BY ASC`. Route layer MUST
  NOT call `Array.sort(...)` in any GET return path.
  Composable layer (future MOCK→LIVE flip WP) MUST NOT
  re-sort either. Grep gate at close.
- **INSERT column list MANDATORY.** Every
  `INSERT INTO legendary.analytics_events` enumerates target
  columns explicitly. The form `INSERT INTO
  analytics_events VALUES (...)` (positional binds) is
  FORBIDDEN — a future migration adding a column would
  silently shift binds. Grep gate at close.
- **Request validation rules (validator-side):**
  `event_type` ∈ `ACQUISITION_EVENT_TYPES`; `user_id`
  `string | null` (non-null max 512 chars pre-hash);
  `session_id` non-empty ≤ 128 chars; `timestamp` finite
  number ∈ `[0, currentServerTime + 5 * 60 * 1000]`
  (server captures `currentServerTime` via `Date.now()`
  ONCE at validator entry; INSERTed `ts` is the client-
  supplied value, NOT the server clock); `properties`
  optional object; depth ≤ 5; leaf values
  `string | number | boolean | null` only; root arrays
  forbidden; empty stored as `'{}'::jsonb`.

**Rationale:**
Mirrors D-13202 / D-13203 closed-shape discipline (WP-132
entitlements). Closed schema + closed enum + 3-layer
enforcement catches regressions loudly (DB CHECK, route
validator, and drift test all fire on misuse). The
`user_id_hash` format CHECK is a defense-in-depth safety net:
if a future refactor accidentally bypasses the route's
`hashUserId()` call and binds raw `user_id` into the INSERT
statement, the DB rejects it.

The partial index on `(user_id_hash, ts) WHERE user_id_hash IS
NOT NULL` keeps the index efficient — anonymous-event rows
(NULL `user_id_hash`) are excluded so the index is sized for
authenticated-event queries only, which is where cohort
retention SQL spends its time.

**Implementation locations:**
- `data/migrations/017_create_analytics_events.sql` —
  authoritative schema definition.
- `apps/server/src/analytics/analytics.types.ts` — union +
  canonical array + envelope interfaces.
- `apps/server/src/analytics/analytics.types.test.ts` — drift
  assertions; parses the .sql file's CHECK constraint text to
  enforce byte-equality across the 3 layers.

**Packet:** WP-205 (EC-233).

**Drafted:** 2026-06-03 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---

### D-20502 — PII Posture: `user_id_hash = SHA-256(rawUserId || '|' || salt)`; Production Loud-Fail on Missing Salt; Salt Rotation Deferred

**Decision:**
`AnalyticsEvent.user_id` is hashed at the server route boundary
BEFORE any INSERT into `analytics_events`. The hash function is
`crypto.createHash('sha256').update(rawUserId + '|' + salt).
digest('hex')` — 64-char lowercase hex digest. `null` input
(anonymous events) passes through to `user_id_hash = NULL`. The
salt is read from `process.env.ANALYTICS_USER_ID_SALT` at server
startup; the salt is a server-held secret of operator-chosen
high entropy.

In `NODE_ENV === 'production'`, `getAnalyticsUserIdSalt()`
throws a full-sentence error when the env var is unset OR is
the empty string — server startup fails loudly. In test / dev,
the helper returns a fixed test salt
`'test-salt-do-not-use-in-prod'` and emits exactly one
`console.warn` per process (one-shot guard via module-level
boolean). The test salt is the only string literal in source
code AND is gated by `NODE_ENV !== 'production'`.

**Salt rotation is explicitly deferred.** Rotating the salt
means either (a) re-hashing every row (impractical at any
meaningful event volume; the table doesn't retain raw user_id
to re-hash from), or (b) maintaining a multi-salt decoder where
the table carries a `salt_version` column and queries union
across two hash spaces. Both have non-trivial cost. v1 ships a
fixed-salt-per-deployment posture; a future hardening WP can
introduce rotation if a salt leak ever surfaces.

**Per-user drill-down at the `analytics_events` table is
intentionally infeasible.** This is a feature, not a bug — an
attacker who reads the table cannot re-attribute events to
identities without the salt. Future per-user revenue / ARPU /
LTV dashboards MUST source identity from a different table
(e.g., `legendary.players` + payment-history tables) and join
on `account_id`, not on `user_id_hash`. Reviewers reject any
PR that joins `analytics_events` to identity-bearing tables.

**Tightening (leakage gate at diagnostic boundaries):**

The "raw user_id never persisted" invariant extends to
diagnostics: raw `user_id` MUST NOT appear in any
`console.log` / `console.info` / `console.warn` /
`console.error` call site inside
`apps/server/src/analytics/`. Logs reference `user_id_hash`
only. Error response bodies use static codes + messages
referring to field NAMES, not field VALUES. A leakage test
intercepts console output during a request carrying a
known test value and asserts the literal substring does NOT
appear in any captured log line emitted by analytics code.
The `properties` column intentionally preserves string
values verbatim per the JSON-spec leaf-type rule — that's
documented feature, not leakage; the gate scopes to logs +
error bodies + stack traces.

**Rationale:**
The cheapest meaningful protection for analytics data at rest.
Hashing is one-way; the salt is server-held; the table by
itself reveals nothing about identity if compromised. Raw
`user_id` would make every event attributable to a player on
DB leak; auth-gating only the read path leaves the data
exposed. Hash-with-salt protects rows AND queries without
sacrificing the dashboard's aggregation needs (cohort grouping
and per-day return detection both work on deterministic hashes
— same input + same salt → same hash → DISTINCT counts and
joins still work).

The production loud-fail posture is the same shape as
billingConfig's `billing_not_configured` 503 (WP-133): a server
that's misconfigured for production should refuse to serve
rather than silently degrade to insecure operation.

The fixed test salt + one-shot warning posture is the same
shape as several existing test-mode fallbacks; it lets `pnpm
test` run without env-var ceremony while still calling
attention to the fallback so a developer doesn't accidentally
ship a build that depends on it.

**Implementation locations:**
- `apps/server/src/analytics/userIdHash.ts` — `hashUserId()` +
  `getAnalyticsUserIdSalt()`.
- `apps/server/src/analytics/userIdHash.test.ts` —
  determinism + salt-influence + null passthrough + production
  loud-fail + 64-char-hex format assertions.
- `apps/server/src/analytics/analytics.routes.ts` — each POST
  handler invokes `hashUserId(payload.user_id, salt)` at the
  request-validation boundary BEFORE any INSERT.

**Packet:** WP-205 (EC-233).

**Drafted:** 2026-06-03 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---

### D-20503 — Auth Posture Split: `POST` Capture is `guest` with Rate Limit + Size Cap; 3 GET Queries are `authenticated-session-required`; Response Envelope is `{ data: T }`

**Decision:**
`POST /api/analytics/events` is `guest` (no session token
required). Pre-signup visitors emit channel-attribution events
before they have a session; gating capture would discard the
entire pre-signup funnel surface. Defenses for the always-open
posture: per-IP rate limit (60 events / minute via in-memory
token bucket keyed by `ctx.request.ip`); per-request body size
cap (8 KB for a single-event payload; 100 KB and 50 events max
for a batch payload). Requests exceeding any cap return the
appropriate status code (413 / 429) BEFORE any parsing /
hashing / INSERT work.

The 3 `GET` query endpoints (`/api/analytics/traffic-sources`,
`/api/analytics/activation-funnel`,
`/api/analytics/retention-cohorts`) are
`authenticated-session-required` — operator-only, matching the
WP-197 dashboard auth posture. `SessionValidationErrorCode`
collapses to a single client-facing `'unauthorized'` value at
the route boundary per D-10403 account-existence-probe defense
(carry-forward from billing / entitlements / teams / profile
surfaces).

The 3 GET responses use the envelope shape `{ data: readonly
T[] }` only — NO `source` or `updatedAt` fields. The dashboard's
future MOCK→LIVE flip wrapper (in
`apps/dashboard/src/services/mocks.ts`) adds the
`ServiceResponse<T>` envelope at the call site by injecting
`source: 'LIVE'` + `updatedAt: Date.now()`. The server stays
envelope-agnostic so a future caching layer (CDN, edge cache)
can label freshness independently.

Status-code domains locked per handler: POST `{202, 400, 413,
429, 500}`; each GET `{200, 400, 401, 500}`. Any other status
code (403, 404, 422) leaking from these handlers = HARD FAIL.

**Tightening (rate limit per-event, idempotency NOT
idempotent, response envelope shape):**

- **Rate limit semantics — per-EVENT, not per-REQUEST.** The
  60/minute/IP limit counts individual events. A batch of
  N events consumes N tokens. A request that would exceed
  remaining tokens is rejected with 429 BEFORE any parsing
  / hashing / INSERT work — the full batch is dropped (no
  partial accept). The capacity bound is on events, NOT on
  HTTP requests; batching CANNOT bypass the limit. Token
  bucket implementation MUST treat capacity as
  event-count.
- **Capture endpoint is NOT idempotent.** Duplicate POST
  submissions produce duplicate rows. Server applies no
  UNIQUE constraint beyond `id`; no `INSERT ... ON
  CONFLICT`; no clock-window dedupe. Clients own
  deduplication if required (e.g., POST-once semantics via
  local idempotency keys at emission time). Aggregate
  queries treat the natural row count as ground truth.
  Rationale: server-side idempotency would require either
  a UNIQUE constraint that wedges legitimate high-volume
  same-session activity, or a clock-window dedupe filter
  that introduces edge cases under late-arrival / clock-
  skew patterns.
- **Response envelope MUST NOT include `source` /
  `updatedAt`.** Server returns `{ data: readonly T[] }`
  for the 3 GETs; `{ accepted: number }` for the POST.
  The dashboard's future MOCK→LIVE flip wrapper adds
  `ServiceResponse<T>` envelope fields at the call site.
  Keeping the server envelope-agnostic decouples the
  freshness display from server-side caching decisions.

`Cache-Control: no-store` is the literal first statement of
every handler body — happy paths AND error paths — per the
D-11504 carry-forward. The first statement is enforced by grep
gate at execution close.

**Sub-rule (in-memory rate limit lifecycle):** the per-IP token
bucket is process-local (in-memory `Map<string, BucketState>`)
and resets on server restart. Multi-instance deployments share
no rate-limit state; a redis-backed limiter is a future
hardening WP if/when multi-instance lands. Documented inline at
the limiter call site so a reader doesn't accidentally rely on
cross-instance enforcement.

**Rationale:**
The split posture matches the data flow: capture must accept
events from anyone (no session ceremony for visitor
attribution); queries are operator-internal surface (the
operator dashboard is auth-gated per WP-197). Mirrors the
Stripe webhook discipline (WP-133: webhook endpoint is `guest`
because Stripe has no session; signature verification is the
auth) — different always-open mechanisms, same posture
rationale.

The `{ data: T }` envelope shape mirrors the existing billing
health endpoint (D-13501) which returns the bare `BillingHealth`
shape and lets the dashboard wrap with `ServiceResponse<T>` at
the fetch site. Adding `source` / `updatedAt` server-side
would couple the server to the dashboard's freshness display
contract, which is a layer-mixing trap.

In-memory rate limiting is the cheapest meaningful defense for
v1's single-instance Render deployment. The 60/min limit
absorbs typical bot-spam patterns without affecting legitimate
clients; multi-instance state-sharing is genuine engineering
scope that v1 doesn't need.

**Implementation locations:**
- `apps/server/src/analytics/analytics.routes.ts` — 4
  endpoint handlers + caller-injected
  `AnalyticsRouteDependencies`; rate limiter implementation;
  status-code domain locks; `Cache-Control: no-store` first-
  statement lock; response envelope shape.
- `apps/server/src/analytics/analytics.routes.test.ts` —
  per-endpoint coverage of locked posture (auth collapse;
  closed-set rejection; rate-limit trigger; size cap; cache-
  control header; envelope shape).
- `apps/server/src/server.mjs` —
  `registerAnalyticsRoutes(...)` call wiring the dependency
  bundle.
- `docs/ai/REFERENCE/api-endpoints.md` — 4 new rows under
  `## Wired → Server-Registered Routes` per D-11804 catalog
  update obligation.

**Packet:** WP-205 (EC-233).

**Drafted:** 2026-06-03 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---
