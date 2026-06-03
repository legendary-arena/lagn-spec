# WP-205 — `analytics_events` Server (Migration + Capture Endpoint + Query Endpoints + Hashed-`user_id` PII Posture)

## Goal

Land the server-side companion to WP-203's mock-mode-first acquisition /
activation / retention dashboard surface. Adds:

1. A new PostgreSQL `legendary.analytics_events` table — closed 7-column
   schema consuming WP-203's forward-locked `AnalyticsEvent` envelope
   (D-20301) verbatim, with `user_id` stored ONLY as a SHA-256 hash of
   the raw value concatenated with a server-held salt (D-20303 PII
   posture decision resolved as **hash-with-salt** at WP-205 drafting
   time).
2. A `guest` `POST /api/analytics/events` capture endpoint that
   accepts a single event or a small batch, hashes `user_id` at the
   server boundary BEFORE insert, validates against the 9-value
   `AcquisitionEventType` closed set, and writes to
   `legendary.analytics_events`. Per-IP rate limit and per-request
   body size cap protect against the always-open posture.
3. Three `authenticated-session-required` `GET` query endpoints that
   feed the WP-203 dashboard widgets verbatim — `GET
   /api/analytics/traffic-sources`, `GET /api/analytics/activation-funnel`,
   `GET /api/analytics/retention-cohorts` — returning bare `{ data:
   readonly T[] }` envelopes where `T` matches the existing WP-203
   types (`TrafficSource`, `ActivationFunnelStep`, `RetentionCohort`)
   byte-identical so the future dashboard MOCK→LIVE flip is a
   one-file getter substitution in `apps/dashboard/src/services/mocks.ts`.

The dashboard widgets stay MOCK after this WP merges; flip to LIVE is
deferred to a follow-up WP (alongside or after client-side event
emission lands across `apps/arena-client/` + the marketing site +
`apps/registry-viewer/`). This WP ships the server surface so the
schema, endpoints, and PII posture are locked and reachable; the
dashboard's mock factories keep operating until real events flow.

> **Invariant:** raw `user_id` values are NEVER persisted in
> `analytics_events`. Every row's `user_id_hash` column is the
> SHA-256 hex digest of `${rawUserId}|${ANALYTICS_USER_ID_SALT}`
> computed at the route boundary BEFORE any INSERT. The salt is a
> server-held secret; an attacker who reads the table cannot reverse
> hashes to user identities without the salt.

> **Terminology convention.** "Analytics event" = a single
> AcquisitionEventType emission from a client (anonymous visitor or
> signed-in user). "Capture endpoint" = the always-open `guest` POST
> that ingests events. "Query endpoints" = the three
> authenticated-session-required GETs that feed the WP-203 dashboard
> widgets. "User-id hash" = SHA-256(user_id || salt) hex digest; the
> only PII-derived value persisted.

---

## Assumes

- **WP-203 ✅ (hard-dep — forward-locked envelope).** D-20301 locked
  `AnalyticsEvent` at 5 fields (`event_type`, `user_id`, `session_id`,
  `timestamp`, `properties`) with `event_type: AcquisitionEventType`
  closed at 9 values. WP-205 consumes this envelope verbatim at the
  capture endpoint's request validator. D-20303 explicitly deferred
  PII posture to WP-205 drafting time — that decision lands here as
  D-20502 (hash-with-salt).
- **WP-197 ✅ (hard-dep — auth + deploy posture).** Dashboard `/overview`
  / `/system` / `/players` surface is `authenticated-session-required`
  per WP-197; the 3 GET query endpoints inherit that posture. CF Pages
  Production env carries `VITE_USE_MOCKS=true` today; flipping to
  `false` is the future MOCK→LIVE flip WP's concern, not this one.
- **WP-115 ✅ (hard-dep — `pg.Pool` lifecycle).** Long-lived pool at
  `apps/server/src/db/database.ts` (D-115NN). All new analytics routes
  check connections out of the existing pool — never construct new
  pools.
- **WP-104 / WP-132 / WP-133 (hard-dep — route + logic + types
  pattern).** New analytics module mirrors `apps/server/src/billing/`
  shape: `analytics.types.ts` + `analytics.logic.ts` + `analytics.routes.ts`
  + tests; route file declares a local `KoaRouter` / `KoaContext`
  interface (no direct `@koa/router` import); `Cache-Control:
  no-store` is the first statement of every handler body per D-11504.
- **WP-118 ✅ (api-endpoints catalog).** Per D-11804 catalog rule,
  this WP MUST update `docs/ai/REFERENCE/api-endpoints.md` in the
  same commit that lands the routes — 4 new rows (1 POST + 3 GETs);
  whole-row replacements per the locked merge semantics.
- **WP-131 / WP-112 ✅ (`requireAuthenticatedSession` middleware).**
  The 3 GET query endpoints depend on the existing session
  validation middleware + closed-set `SessionValidationErrorCode`
  mapping (`'missing_token'` / `'invalid_token'` / `'expired_token'`
  / `'unknown_account'` collapse to a single client-facing
  `'unauthorized'` value per D-10403 account-existence probe
  defense).
- **Existing server inventory (verified 2026-06-03 against `main @
  5293a25`):**
  - 16 migrations under `data/migrations/`; next-free = `017`.
  - `apps/server/src/server.mjs` wires routes via per-domain
    `register*Routes(server.router, pool, deps)` calls.
  - `apps/server/src/db/database.ts` exports `createPool()` /
    `closePool()` per WP-115.
  - `apps/server/src/auth/sessionToken.{logic,types}.ts` exports
    `requireAuthenticatedSession` + `SessionValidationErrorCode`
    used by every authenticated route (billing, entitlements,
    teams, profile).
  - No `apps/server/src/analytics/` directory exists — WP-205
    creates it.
- **`docs/ai/DECISIONS.md` reservations (drafted at WP-205 drafting
  time; flip Reserved → Active at execution close):**
  - **D-20501** — `analytics_events` table schema closed at 7
    columns (`id`, `event_type`, `user_id_hash`, `session_id`,
    `ts`, `properties`, `created_at`); CHECK constraint enforces
    9-value `event_type` closed set; 2 BTREE indexes (`event_type`
    + `ts`; `user_id_hash` + `ts`). Mirrors D-13202 closed-shape
    discipline.
  - **D-20502** — PII posture: `user_id_hash = SHA-256(rawUserId ||
    '|' || ANALYTICS_USER_ID_SALT)` hex digest; salt from
    `ANALYTICS_USER_ID_SALT` env var; missing salt in production =
    refuse to start (loud-fail at startup); test/dev uses a fixed
    test salt + structured warning. Salt rotation explicitly
    deferred (re-hashing all rows is impractical; multi-salt
    transition is a future hardening WP). Per-user drill-down at
    the `analytics_events` table is intentionally infeasible — the
    future per-user-revenue / ARPU WP (deferred per WP-203's
    §Specific Deferrals carry-forward) must source identity from a
    different table that retains it.
  - **D-20503** — Auth posture split: `POST /api/analytics/events`
    is `guest` (always-open capture; clients have no session
    token before signup); the 3 `GET` query endpoints are
    `authenticated-session-required` (operator-only; matches WP-197
    dashboard auth). Capture endpoint carries per-IP rate limit
    (60 events / minute) + per-request body size cap (8 KB single
    event; 100 KB max for the batch shape). Endpoints return `{
    data: readonly T[] }` envelopes; dashboard wraps to
    `ServiceResponse<T>` at the future LIVE-flip site (server does
    NOT embed `source` / `updatedAt`).
- **Repo posture.** Single-repo (`apps/server/` + `data/migrations/`);
  no marketing-repo crossing (`C:\www\legendary-arena-com\` untouched).
  No engine / registry / preplan / client code touched. No npm
  dependency additions (uses `node:crypto` for SHA-256, existing
  Koa router + pg pool).
- **Drafting baseline:** `origin/main @ 5293a25` (post-WP-204 close;
  clean working tree).

---

## Context (Read First)

> **Line-number references are advisory at drafting time.** Re-verify
> with `grep -n` if `main` has moved between draft and execute.

- **WP-203**
  (`docs/ai/work-packets/WP-203-dashboard-acquisition-activation-retention.md`)
  — **closest precedent and direct upstream**. Locks the
  `AnalyticsEvent` envelope at D-20301; defers PII posture to WP-205
  per D-20303; defers MOCK→LIVE flip via the §Composable Source
  Contract MOCK → LIVE upgrade-path invariant (widget files stay
  byte-identical pre/post flip because composables read freshness
  from their own `source` / `updatedAt` passthrough). The 3 GET
  query endpoints in WP-205 return the exact `TrafficSource` /
  `ActivationFunnelStep` / `RetentionCohort` shapes WP-203's
  composables already consume.
- **WP-204**
  (`docs/ai/work-packets/WP-204-dashboard-public-surface-health-error-monitor-cost-watchdog.md`)
  — same forward-contract pattern (`UptimeProbe` / `ErrorRateSnapshot`
  / `InfraCostEntry` locked at D-20401) and same MOCK→LIVE
  upgrade-path discipline. Confirms the pattern WP-205 follows for
  the server side. Its paired server WP is separate (TBD; tentatively
  WP-206 unless ordering shifts).
- **WP-133 / EC-136**
  (`docs/ai/work-packets/WP-133-billing-checkout-and-webhook.md` +
  the billing routes at `apps/server/src/billing/billing.routes.ts`)
  — closest **route-layer** precedent. Locked status-code domains
  per handler, closed-set error envelope shape, allowlist-validates-
  before-side-effect discipline. WP-205 mirrors:
  - Local `KoaRouter` / `KoaContext` interfaces (no direct `@koa/router`
    import).
  - `Cache-Control: no-store` as the first statement of every handler
    body per D-11504.
  - Caller-injected dependency bundle (`AnalyticsRouteDependencies`).
  - Status-code domain locked per handler.
- **WP-132 / EC-135**
  (`docs/ai/work-packets/WP-132-entitlements-data-model-and-read-api.md`
  + `apps/server/src/entitlements/`) — closest **data-model + read-
  API** precedent. Locked closed-set entitlement key allowlist (D-13203);
  partial-unique-index idempotency pattern; result-ordering as a
  PUBLIC CONTRACT. WP-205's `event_type` closed set mirrors that
  discipline; the dashboard widgets depend on stable ordering from
  the query endpoints.
- **WP-115 / EC-119**
  (`apps/server/src/db/database.ts` + `apps/server/src/leaderboards/`)
  — `pg.Pool` lifecycle precedent. Pool constructed exactly once at
  startup (`createPool()`), closed exactly once on SIGTERM
  (`closePool()`). Every request handler that needs DB access checks
  out a connection via `pool.query(...)` — never constructs its own.
- **WP-104 / WP-131 + the existing auth machinery**
  (`apps/server/src/auth/sessionToken.{logic,types}.ts` +
  `apps/server/src/auth/accountResolver.logic.ts`) — the GET query
  endpoints use the same `requireAuthenticatedSession` helper +
  `SessionValidationErrorCode` closed-set mapping the billing /
  entitlements / teams / profile surfaces use.
- **D-11804** (api-endpoints catalog update obligation) — per the
  `.claude/rules/work-packets.md §API Catalog Update Obligation`
  rule, WP-205 MUST update `docs/ai/REFERENCE/api-endpoints.md` in
  the same commit that lands the routes; replace-whole-row merge
  semantics (no partial-column updates); closed-set `Status` /
  `Auth` values enforced.
- **D-9905 / D-10403** (account-existence probe defense) — the 3 GET
  query endpoints collapse `'missing_token'` / `'invalid_token'` /
  `'expired_token'` / `'unknown_account'` to a single client-facing
  `'unauthorized'` value at the route boundary; matches every other
  authenticated route in the codebase.
- **D-11504** (`Cache-Control: no-store` first-statement lock) —
  every handler body's first statement sets the header so error
  paths can never accidentally return a cacheable response.
- **D-11802 = C** (error envelope shape) — project-owned handlers
  return `{ code: string, message: string }`. WP-205 follows this
  exactly.
- **D-19605 / D-19908** (carry-forward) — `localeCompare` is
  forbidden for ordering (Unicode code-unit comparison only);
  zero-denominator returns `0` not `NaN`. Applies to the query
  endpoints' aggregation SQL — see §Cost math invariants below for
  the relevant subset.
- `apps/dashboard/src/types/index.ts` (lines ~243–292) — the locked
  `AnalyticsEvent` / `TrafficSource` / `ActivationFunnelStep` /
  `RetentionCohort` shapes. WP-205's query endpoints return these
  shapes byte-identical (the dashboard composables consume them
  verbatim — see §Composable Source Contract in WP-203 for the
  contract).
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical
  snake_case field names for new DB columns
  (`event_type` / `user_id_hash` / `session_id` / `ts` /
  `properties` / `created_at`). The dashboard's camelCase
  `TrafficSource` / `ActivationFunnelStep` / `RetentionCohort`
  shapes are camelCase at the JSON envelope boundary; the SQL
  layer maps snake_case ↔ camelCase explicitly per the existing
  precedent (e.g., billing rows: `intent_status` SQL ↔ camel at
  the JSON envelope).
- `docs/ai/ARCHITECTURE.md §Layer Boundary` — `apps/server/` is
  server-only; no `@legendary-arena/(game-engine|registry|preplan)`
  imports.
- `.claude/rules/{architecture,code-style,work-packets}.md`.
- `docs/ai/REFERENCE/00.6-code-style.md` — engine-wide human-style
  code rules; cited verbatim in §Non-Negotiable Constraints.

> **Session prompt length justification (01.0a Step 6 soft-cap
> exemption):** the session prompt at
> `docs/ai/invocations/session-wp205-*.md` runs ~545 lines (above
> the 200-line soft cap). Justified by the multi-axis discipline
> density of this WP — PII posture (D-20502) + auth posture split
> (D-20503) + closed-set 3-layer enforcement (D-20501) + batch
> atomicity + `Cache-Control` first-statement lock + API catalog
> update obligation (D-11804) all require explicit per-axis
> citing in the executor's authority chain. Trimming would lose
> actionable detail the executor needs in-session; the length
> matches the surface complexity, mirrors the WP-204 (~250-line)
> session prompt precedent at higher discipline density.

---

## Why now

WP-203 shipped the dashboard widgets in mock mode. Operator can see
the surface settle (channel order, funnel labels, cohort heatmap
columns) before any client-side instrumentation work commits to an
event-emission shape that's hard to change later. WP-205 closes the
schema half of that bargain: the `analytics_events` table exists,
the capture endpoint exists, the query endpoints exist, and the PII
posture is locked. Future WPs can then wire emission sites in
`apps/arena-client/` (signups, first match), the marketing site
(visitor + signup-start), and `apps/registry-viewer/` (referral
attribution) against a server surface that won't shift under them.

Splitting the server surface from client emission also keeps the
PII posture decision (D-20502) contained — hashing happens at the
server's route boundary, so when emission lands the client doesn't
need to know about the salt or worry about leaking raw `user_id`
upstream of the hash. The future emission WPs ship cleartext
`user_id` over HTTPS; the server hashes; nothing client-side ever
sees the hash.

The MOCK→LIVE flip is deferred for a deliberate reason: with the
table empty (no emission lands yet), flipping the dashboard to
LIVE would render empty-state widgets immediately. That's a poor
operator-UX trade — the MOCK badge plus realistic seeded data is
strictly better than an empty `data` state until real events flow.
The flip is a one-file change in `apps/dashboard/src/services/mocks.ts`
when the time comes; this WP makes that change possible without
touching anything else.

---

## Scope (In)

### Migration (1 new file)

- **`data/migrations/017_create_analytics_events.sql`** — creates
  `legendary.analytics_events` with the locked 7-column schema:

  ```sql
  CREATE TABLE legendary.analytics_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      TEXT NOT NULL,
    user_id_hash    CHAR(64) NULL,
    session_id      TEXT NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT analytics_events_event_type_check CHECK (
      event_type IN (
        'direct', 'search', 'referral', 'paid',
        'signup-start', 'signup-complete',
        'first-match-started', 'first-match-completed',
        'retention-return'
      )
    ),
    CONSTRAINT analytics_events_user_id_hash_format CHECK (
      user_id_hash IS NULL OR user_id_hash ~ '^[0-9a-f]{64}$'
    )
  );

  CREATE INDEX analytics_events_event_type_ts_idx
    ON legendary.analytics_events (event_type, ts);

  CREATE INDEX analytics_events_user_id_hash_ts_idx
    ON legendary.analytics_events (user_id_hash, ts)
    WHERE user_id_hash IS NOT NULL;
  ```

  - `user_id_hash CHAR(64)` is the SHA-256 hex digest (64 lowercase
    hex chars). Format-CHECK enforces the constraint at the DB
    level — a misbehaving INSERT path (e.g., a regression where the
    hash step is skipped and raw `user_id` slips through) fails
    loudly at the DB.
  - `user_id_hash IS NULL` is allowed because anonymous visitor
    events (channel attribution before signup) have no user id;
    the `WHERE user_id_hash IS NOT NULL` partial index keeps the
    index efficient by excluding the anonymous-event subset.
  - `event_type` CHECK constraint encodes the 9-value closed set
    directly; the route validator + dashboard `AcquisitionEventType`
    union + this CHECK form three independent enforcement layers.
    Drift-detection test (see §Acceptance Criteria) asserts the
    SQL CHECK matches the union members byte-identical.
  - `properties` JSONB carries arbitrary per-event-type metadata
    per D-20301 (e.g., for `paid` channel: `{ "campaign_id":
    "abc" }`); no schema constraint at v1 — the dashboard widgets
    don't read `properties` today, but future per-channel
    drill-downs will.
  - `ts` is the event's client-supplied UTC timestamp (epoch ms
    converted to TIMESTAMPTZ by the route handler before INSERT);
    `created_at` is the server-side ingest time (defaults to NOW()).
    Both retained — gap between them surfaces clock-drift / delayed
    capture in future ops queries.

### Server module (8 new files)

- **`apps/server/src/analytics/analytics.types.ts`** — exports:
  - `AcquisitionEventType` union — byte-identical to WP-203's
    closed 9-value union; declared here (server-local) per the
    existing pattern (server doesn't import from `apps/dashboard/`).
    Drift test asserts parity against the WP-203 list.
  - `ACQUISITION_EVENT_TYPES: readonly AcquisitionEventType[]` —
    canonical readonly array mirroring the union; drift-pinned via
    a node:test assertion in `analytics.types.test.ts` (added to
    the existing types test file or new test).
  - `AnalyticsEventCapturePayload` — the request body shape for
    `POST /api/analytics/events`: `{ event_type:
    AcquisitionEventType; user_id: string | null; session_id:
    string; timestamp: number; properties?: Record<string, string
    | number | boolean | null> }`. Mirrors the WP-203
    `AnalyticsEvent` envelope BEFORE hashing.
  - `AnalyticsEventBatchPayload` — the batch shape: `{ events:
    AnalyticsEventCapturePayload[] }` (1-50 events per request;
    bounds enforced at the route validator).
  - `TrafficSource` / `ActivationFunnelStep` / `RetentionCohort` —
    re-declared verbatim from WP-203 for the GET query endpoints
    (camelCase at the JSON boundary). Drift tests assert parity.
  - `DateRange` — re-declared as the closed `'7d' | '14d' | '30d'
    | '90d'` union matching WP-203.
  - `AnalyticsErrorCode` — closed-set client-facing error codes
    for the analytics surface: `'invalid_request' | 'rate_limited'
    | 'payload_too_large' | 'unauthorized' | 'internal_error'`.
- **`apps/server/src/analytics/userIdHash.ts`** — exports
  `hashUserId(rawUserId: string | null, salt: string): string |
  null`. Returns `null` when input is `null` (anonymous-event
  passthrough). Otherwise computes `crypto.createHash('sha256').
  update(`${rawUserId}|${salt}`).digest('hex')`. Salt-loading helper
  `getAnalyticsUserIdSalt(): string` reads from
  `process.env.ANALYTICS_USER_ID_SALT`; in production (`NODE_ENV ===
  'production'`) throws if unset (loud-fail at server startup); in
  test / dev returns a fixed test salt `'test-salt-do-not-use-in-prod'`
  + emits a structured warning via `console.warn` (one-shot per
  process via a module-level boolean).
- **`apps/server/src/analytics/userIdHash.test.ts`** — node:test
  cases (≥ 5): deterministic same-input-same-hash; different salt
  → different hash; null input → null output; production missing
  salt throws full-sentence error; hash format is 64-char lowercase
  hex.
- **`apps/server/src/analytics/analytics.logic.ts`** — pure
  business logic separated from the HTTP layer per the WP-132 /
  WP-133 precedent:
  - `insertAnalyticsEvent(database, { event_type, user_id_hash,
    session_id, ts, properties }): Promise<void>` — single-row
    INSERT.
  - `insertAnalyticsEventBatch(database, rows): Promise<void>` —
    single-statement multi-row INSERT (one transaction; rolls back
    on any row failure).
  - `getTrafficSources(database, range: DateRange):
    Promise<readonly TrafficSource[]>` — aggregation query:
    per-channel × per-day `(visitorCount, signupCount)` over the
    normalized date range. `visitorCount` = distinct `session_id`
    per `(channel, date)` for `event_type IN ('direct', 'search',
    'referral', 'paid')`; `signupCount` = distinct `user_id_hash`
    per `(channel, date)` joining the channel event to a
    subsequent `signup-complete` event in the same session.
    Output sorted ascending by `date` (UTC date derived from `ts`
    via `(ts AT TIME ZONE 'UTC')::date`); iteration order over
    `ACQUISITION_CHANNELS` is enforced by the caller in
    `analytics.routes.ts` (server returns the sorted list — see
    §Aggregation rule below).
  - `getActivationFunnel(database, range: DateRange):
    Promise<readonly ActivationFunnelStep[]>` — per-step × per-day
    count over the normalized range. Count = distinct `user_id_hash`
    per `(step, date)` for `event_type IN ('signup-start',
    'signup-complete', 'first-match-started',
    'first-match-completed')`. Same ascending-by-`date` sort.
  - `getRetentionCohorts(database, cohortCount: number):
    Promise<readonly RetentionCohort[]>` — weekly cohorts ending
    at the most-recent ISO week with `signup-complete` events.
    Per-cohort `(cohortSize, day1ReturnCount, day7ReturnCount)`
    computed as distinct `user_id_hash` counts: cohortSize from
    `signup-complete`, dayN return counts from any `event_type`
    with `event_type != 'signup-complete'` AND `ts` falling in
    day N of that cohort's user-id-hash subset. Sorted ascending
    by `cohortWeek` string (Unicode code-unit comparison; no
    `localeCompare`). Empty range returns `[]`.
- **`apps/server/src/analytics/analytics.logic.test.ts`** —
  node:test cases (≥ 8): integration-style against a per-test
  fixture seeded via direct INSERTs; covers each aggregation
  function under (a) typical input, (b) empty input, (c)
  zero-denominator-style edge (no visitors → no signups), (d)
  hashed-user-id grouping (anonymous events excluded from cohort
  counts), (e) cross-day boundary handling (UTC vs ambient
  timezone), (f) ascending-by-date sort under Unicode code-unit
  comparison, (g) closed-set `event_type` rejection (logic-layer
  defensive guard, mirrors the DB CHECK), (h) batch INSERT
  rollback on partial failure.
- **`apps/server/src/analytics/analytics.routes.ts`** — registers
  4 HTTP endpoints on the boardgame.io Koa router. Mirrors the
  `billing.routes.ts` structural shape verbatim (local `KoaRouter`
  / `KoaContext` interfaces; caller-injected dependency bundle
  `AnalyticsRouteDependencies`; `Cache-Control: no-store` first
  statement of every handler body):
  - `POST /api/analytics/events` — `guest`; body is either
    `AnalyticsEventCapturePayload` (single event) or
    `AnalyticsEventBatchPayload` (batch). Validates: payload shape
    matches one of the two; `event_type` is in
    `ACQUISITION_EVENT_TYPES`; `user_id` is `string | null`;
    `session_id` is non-empty string; `timestamp` is positive
    finite number; `properties` is a flat object whose values are
    `string | number | boolean | null`. Per-IP rate limit (60
    events / minute, in-memory token bucket keyed by
    `ctx.request.ip`); body size cap (8 KB single; 100 KB batch)
    via Koa's existing body parser limits + a defensive 413 early
    return when batch length > 50. Hashes every event's `user_id`
    via `hashUserId(user_id, salt)` BEFORE inserting. Status-code
    domain `{202, 400, 413, 429, 500}`. Response body on 202 is
    `{ accepted: number }` (single → 1; batch → the count
    inserted).
  - `GET /api/analytics/traffic-sources?range=...` —
    `authenticated-session-required`; query param `range` ∈
    closed `'7d' | '14d' | '30d' | '90d'` (rejects anything
    else with 400 `'invalid_request'`). Returns `200 → { data:
    readonly TrafficSource[] }`. Status-code domain `{200, 400,
    401, 500}`.
  - `GET /api/analytics/activation-funnel?range=...` —
    `authenticated-session-required`; same closed `range` set.
    Returns `200 → { data: readonly ActivationFunnelStep[] }`.
    Status-code domain same as above.
  - `GET /api/analytics/retention-cohorts?cohortCount=...` —
    `authenticated-session-required`; query param `cohortCount`
    integer in `[1, 26]` (default 8 if absent). Returns `200 → {
    data: readonly RetentionCohort[] }`. Status-code domain
    `{200, 400, 401, 500}`.
- **`apps/server/src/analytics/analytics.routes.test.ts`** —
  node:test cases (≥ 12): per-endpoint covers happy path; auth
  failure (`'unauthorized'` collapse per WP-104 D-10403);
  malformed query → 400; closed-set `event_type` rejection at
  validator; oversize payload → 413; rate-limit trigger → 429;
  `Cache-Control: no-store` present on every response (including
  error paths); response envelope shape matches the locked
  `{ data: T[] }` form; the 3 GET endpoints return data sorted
  ascending by `date` (or `cohortWeek` for retention).
- **`apps/server/src/analytics/analytics.types.test.ts`** — drift
  tests asserting `ACQUISITION_EVENT_TYPES` deep-equals the locked
  9-value list AND assert this list deep-equals WP-203's
  `AcquisitionEventType` union members documented at
  `apps/dashboard/src/types/index.ts` (server's union is a hand-
  synced copy per the cross-app-no-import convention; drift test
  is the enforcement).

### Server bootstrap (1 modified file)

- **`apps/server/src/server.mjs`** — modified — append a single
  `registerAnalyticsRoutes(server.router, pool, {
  requireAuthenticatedSession, verifier, accountResolver,
  analyticsUserIdSalt })` call at the bottom of the route-
  registration section. Salt loaded once at startup via
  `getAnalyticsUserIdSalt()` and injected. No other route's
  registration changes; existing handler order preserved
  byte-identical.

### API catalog (1 modified file)

- **`docs/ai/REFERENCE/api-endpoints.md`** — append 4 new rows
  under `## Wired — Reachable Over HTTP Today → Server-Registered
  Routes`, one per new endpoint. Each row carries the locked
  `Status` = `Wired`, `Auth` per D-20503, request schema, response
  schema, authorizing WP = WP-205, and a `Notes` column citing
  D-20501..D-20503 + the relevant carry-forward D-entries. Per
  D-11804 replace-whole-row merge semantics.

### Governance (4 files)

- **`docs/ai/STATUS.md`** — `### WP-205 / EC-233 Executed` block per
  Definition of Done.
- **`docs/ai/DECISIONS.md`** — D-20501..D-20503 reserved at draft;
  landed Active at execution close (byte-identical to EC §DECISIONS.md
  verbatim block per the WP-196 / WP-198 / WP-199 / WP-203 / WP-204
  PS-1 transcription convention).
- **`docs/ai/work-packets/WORK_INDEX.md`** — flip WP-205 row to `[x]`
  with completion date.
- **`docs/ai/execution-checklists/EC_INDEX.md`** — flip EC-233 row
  to `Done`.

## Out of Scope

- **Client-side event emission.** No `apps/arena-client/`,
  marketing site, or `apps/registry-viewer/` files touched. Emission
  is a future WP (or set of WPs — one per emitter app).
- **Dashboard MOCK→LIVE flip.** The 3 GET query endpoints exist;
  `apps/dashboard/src/services/mocks.ts` still re-exports the mock
  factories. Flipping `fetchTrafficSources` / `fetchActivationFunnel`
  / `fetchRetentionCohorts` to the LIVE endpoints is a small
  follow-up WP (~1 file edit + the relevant tests) tracked in
  STATUS.md downstream notes.
- **Per-user revenue / ARPU / LTV dashboards.** Hashing `user_id`
  intentionally makes per-user attribution at the `analytics_events`
  table infeasible. Per-user revenue dashboards must source identity
  from a different table that retains it (e.g., `legendary.players`
  + the existing `accountResolver` machinery). This bound is locked
  at WP-205 drafting time by D-20502.
- **Salt rotation.** The server-held salt is fixed for the life of
  the deployment. Rotating means re-hashing every row (impractical
  for any meaningful event volume) or maintaining a multi-salt
  decoder (complex, defeats the simple closed-set hash). Rotation
  policy is a future hardening WP if a salt leak ever surfaces.
- **Event backfill / synthetic seeding.** No script to populate
  `analytics_events` with synthetic rows. The dashboard widgets
  stay MOCK until client emission lands; an interim backfill seed
  could be added as its own small WP if the operator decides to
  flip the dashboard to LIVE before emission lands.
- **Event deletion / GDPR right-to-erasure machinery.** Hashed
  `user_id_hash` is irreversible — deleting events for a specific
  user requires either retaining the hash mapping (defeats the
  posture) or accepting that erasure is partial (the rows persist
  but cannot be linked back to identity). Posture is locked here;
  GDPR-style erasure is a future product / legal WP if/when needed.
- **Real-time / streaming analytics.** All aggregation is
  batch-query (the 3 GET endpoints run aggregation SQL per
  request). Real-time stream processing (Kafka, Redis pub/sub,
  WebSocket push to the dashboard) is out of scope; the dashboard
  widgets re-fetch on date-range change and that's sufficient for
  the operator-glance use case.
- **Materialized view / pre-aggregation.** The aggregation queries
  run live against `analytics_events` per request. At small scale
  this is fine; if event volume grows, a `legendary.analytics_daily_rollups`
  table + cron rollup job is a future performance WP. Today's
  query patterns are documented in the Notes column of the
  api-endpoints catalog so the future rollup WP knows what to
  pre-aggregate.
- **Multi-tenancy / per-operator isolation.** Single-operator
  deployment per WP-197; the table has no `tenant_id` column.
  Future multi-tenancy is a separate concern.
- **Engine / registry / preplan / shared-tooling code.** None
  touched.

---

## Files Expected to Change

### Migration (1 new)

1. `data/migrations/017_create_analytics_events.sql` — **new** —
   creates `legendary.analytics_events` table + 2 indexes + 2
   CHECK constraints per §Locked contract values.

### Server module (8 new)

2. `apps/server/src/analytics/analytics.types.ts` — **new** —
   exports `AcquisitionEventType` union + `ACQUISITION_EVENT_TYPES`
   canonical array + `AnalyticsEventCapturePayload` +
   `AnalyticsEventBatchPayload` + `TrafficSource` +
   `ActivationFunnelStep` + `RetentionCohort` + `DateRange` +
   `AnalyticsErrorCode`.
3. `apps/server/src/analytics/analytics.types.test.ts` — **new** —
   drift test (≥ 3 cases): `ACQUISITION_EVENT_TYPES` deep-equals
   the locked 9-value array; every member assigns to union;
   server's list matches WP-203 dashboard list byte-identical.
4. `apps/server/src/analytics/userIdHash.ts` — **new** — exports
   `hashUserId()` + `getAnalyticsUserIdSalt()`. `node:crypto`
   SHA-256; no new npm deps.
5. `apps/server/src/analytics/userIdHash.test.ts` — **new** —
   node:test cases (≥ 5): deterministic same-input-same-hash;
   different-salt-different-hash; null passthrough; production
   missing-salt throws full-sentence error; 64-char lowercase hex
   format.
6. `apps/server/src/analytics/analytics.logic.ts` — **new** —
   exports `insertAnalyticsEvent()` + `insertAnalyticsEventBatch()`
   + `getTrafficSources()` + `getActivationFunnel()` +
   `getRetentionCohorts()`. Pure SQL + result mapping; no HTTP
   concerns.
7. `apps/server/src/analytics/analytics.logic.test.ts` — **new** —
   node:test cases (≥ 8): per-aggregation typical + empty input +
   zero-denominator edge; anonymous events excluded from cohort
   counts; UTC date boundary; ascending-by-date sort under code-
   unit comparison; closed-set `event_type` rejection at the
   logic layer (defensive guard); batch INSERT rollback on
   partial failure.
8. `apps/server/src/analytics/analytics.routes.ts` — **new** —
   exports `registerAnalyticsRoutes(router, pool, deps)`. 4 HTTP
   endpoints + caller-injected `AnalyticsRouteDependencies` bundle
   mirroring the WP-133 `BillingRouteDependencies` shape.
9. `apps/server/src/analytics/analytics.routes.test.ts` — **new** —
   node:test cases (≥ 12): per-endpoint happy path; auth failure
   collapse; malformed query → 400; closed-set `event_type`
   rejection; oversize payload → 413; rate-limit trigger → 429;
   `Cache-Control: no-store` on every response; response envelope
   shape; sort discipline on the 3 GETs.

### Server bootstrap (1 modified)

10. `apps/server/src/server.mjs` — **modified** — single
    `registerAnalyticsRoutes(...)` call appended to the
    route-registration section; salt loaded once at startup via
    `getAnalyticsUserIdSalt()` and injected. No other route's
    registration changes.

### API catalog (1 modified)

11. `docs/ai/REFERENCE/api-endpoints.md` — **modified** — append 4
    new rows under `## Wired → Server-Registered Routes`, one per
    new endpoint. Per D-11804 replace-whole-row merge semantics.

### Governance (4 modified)

12. `docs/ai/STATUS.md` — **modified** — `### WP-205 / EC-233
    Executed` block.
13. `docs/ai/DECISIONS.md` — **modified** — D-20501..D-20503
    (proposed → Active at execution close per the PS-1 verbatim-
    transcription convention).
14. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-205
    row `[x]`.
15. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** —
    EC-233 row Done.

**Total: 15 files** (9 new + 2 modified source + 4 governance).

No engine / registry / preplan / client / shared-tooling files
changed.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. **No diffs.
  No snippets.** Output that omits unchanged sections is rejected.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` —
  full English names, JSDoc on every function, `// why:` on
  non-obvious decisions, no `.reduce()` with branching, explicit
  `for...of`.
- No `boardgame.io` import in the new analytics module (server
  routes attach to the existing Koa router but never reach into
  game engine state).
- No `@legendary-arena/(game-engine|registry|preplan)` imports.
- No new npm dependencies. SHA-256 via Node's built-in `node:crypto`.
- No `localeCompare` for ordering — Unicode code-unit comparator
  (per D-19605 carry-forward).

**Packet-specific:**

- **Hashed-`user_id` invariant (D-20502).** Raw `user_id` values
  are NEVER persisted in `analytics_events`. The route handler
  hashes via `hashUserId(rawUserId, salt)` at the request-validation
  boundary BEFORE any INSERT. A test asserts that submitting a
  request with `user_id: "alice@example.com"` results in a row
  whose `user_id_hash` is the SHA-256 hex of `"alice@example.com|"
  + testSalt` and that NO row contains the literal string
  `"alice@example.com"` in any column. Anonymous events (`user_id:
  null`) write `user_id_hash = NULL`.
- **Production salt-missing loud-fail (D-20502).** In production
  (`NODE_ENV === 'production'`), `getAnalyticsUserIdSalt()` throws
  a full-sentence error when `process.env.ANALYTICS_USER_ID_SALT`
  is unset OR is the empty string. Server startup fails loudly.
  Test / dev returns a fixed test salt + emits a one-shot
  structured warning via `console.warn`.
- **Closed-set `event_type` enforced at 3 layers (D-20501).** The
  9-value `AcquisitionEventType` union, the
  `ACQUISITION_EVENT_TYPES` canonical array, the route validator,
  and the SQL CHECK constraint MUST all agree byte-identical.
  Drift test asserts this. Adding a 10th event type requires
  updating all 4 sites in the same WP.
- **Always-open capture endpoint (D-20503).** `POST
  /api/analytics/events` is `guest` (no session token required).
  Defense in depth: per-IP rate limit (60 events / minute via
  in-memory token bucket); body size cap (8 KB single event; 100
  KB batch; 50 events per batch). A request exceeding any limit
  returns the appropriate status code (413 / 429) BEFORE any
  parsing / hashing / INSERT work.
- **Operator-only query endpoints (D-20503).** The 3 GET endpoints
  require `requireAuthenticatedSession` per the existing
  middleware. `'missing_token'` / `'invalid_token'` / `'expired_token'`
  / `'unknown_account'` collapse to a single client-facing
  `'unauthorized'` code per WP-104 D-10403 account-existence-probe
  defense.
- **Aggregation rule (locked — mirrors WP-203 §Aggregation rule).**
  - Per-day aggregations bucket events by UTC date derived from
    `ts` via `(ts AT TIME ZONE 'UTC')::date`.
  - Output series sorted ascending by `date` (or `cohortWeek` for
    retention) using Unicode code-unit comparison (no
    `localeCompare`; SQL `ORDER BY date ASC` is byte-identical to
    the dashboard's expected order because Postgres orders
    `YYYY-MM-DD` strings lexically).
  - Per-channel / per-step assembly iterates the canonical
    `ACQUISITION_CHANNELS` / `ACTIVATION_STEPS` arrays in the
    route response — NOT `Object.keys()` of a derived map.
- **Cost math / count math invariants (locked).**
  - `visitorCount` = `COUNT(DISTINCT session_id)` per (channel,
    date); `signupCount` = `COUNT(DISTINCT user_id_hash)` joining
    channel events to `signup-complete` events in the same
    session (`session_id` match).
  - Zero-denominator guards live at the dashboard side per WP-203
    §Conversion invariants; the server returns raw counts and
    NULLs in aggregations are converted to `0` at the route
    boundary BEFORE serializing JSON.
- **No raw `user_id` in logs, errors, or response bodies.** Error
  messages reference `user_id_hash` only. A grep gate asserts
  the new code has zero `console.log(user_id)` / `throw new
  Error(... user_id ...)` call sites with the raw value.
- **`Cache-Control: no-store` first-statement lock (D-11504
  carry-forward).** Every handler body's first statement sets
  `ctx.set('Cache-Control', 'no-store')`. Applies to all 4
  endpoints + all error paths (400 / 401 / 413 / 429 / 500).
- **API catalog update obligation (D-11804).** WP-205 MUST update
  `docs/ai/REFERENCE/api-endpoints.md` in the same commit that
  lands `apps/server/src/analytics/analytics.routes.ts`. 4 new
  rows; replace-whole-row merge semantics; closed-set `Status` =
  `Wired` and `Auth` ∈ closed set.
- **Layer boundary.** Zero `@legendary-arena/(game-engine|registry
  |preplan)` imports in `apps/server/src/analytics/`. Verified by
  grep at close.
- **No new npm dependency.** `apps/server/package.json` +
  `pnpm-lock.yaml` zero diff.
- **No dashboard edits.** `apps/dashboard/src/**` zero diff. The
  MOCK→LIVE flip is a separate future WP.
- **No engine / registry / preplan / client / shared-tooling
  edits.** `packages/` + `apps/arena-client/` +
  `apps/registry-viewer/` zero diff.
- **`properties` JSON-serializability invariant (D-20501).** The
  `properties` field is restricted at the route validator to a
  flat or nested object whose leaf values are `string | number |
  boolean | null` only. `Date`, `undefined`, `Map`, `Set`,
  `Function`, class instances, BigInt, and Symbol values are
  rejected at the validator with `'invalid_request'`. JSONB's
  storage shape preserves only the JSON spec's primitive types;
  rejecting at the validator prevents silent coercion (e.g.,
  `Date` → `string` via `toJSON()`). This makes the WP-203
  envelope's existing `Record<string, string | number | boolean |
  null>` constraint load-bearing at the persistence boundary
  (not just at the dashboard's consumption surface).

**Session protocol:**

- If `017_create_analytics_events.sql` migration fails to apply
  cleanly to the existing dev DB, stop and report; do not edit
  the migration in-place to "fix" what's actually a prior-row
  collision. Inspect first.
- If the existing rate-limit machinery (if any) elsewhere in
  `apps/server/src/` would extend cleanly to analytics, reuse it;
  if not, ship a small in-memory token bucket inline in
  `analytics.routes.ts` and document the choice with a `// why:`
  citing D-20503.
- If a Koa middleware ordering question surfaces (body parser
  size limit vs. routes), document and stop; do not invent a
  workaround mid-session.

**Locked contract values:**

```typescript
// apps/server/src/analytics/analytics.types.ts additions (verbatim
// — copy as-is; mirror's WP-203's dashboard-side types, server-
// local copy per cross-app no-import convention)

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

export type DateRange = '7d' | '14d' | '30d' | '90d';

export type AnalyticsErrorCode =
  | 'invalid_request'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unauthorized'
  | 'internal_error';

export interface AnalyticsEventCapturePayload {
  readonly event_type: AcquisitionEventType;
  readonly user_id: string | null;
  readonly session_id: string;
  readonly timestamp: number;
  readonly properties?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AnalyticsEventBatchPayload {
  readonly events: readonly AnalyticsEventCapturePayload[];
}

export interface TrafficSource {
  readonly channel: 'direct' | 'search' | 'referral' | 'paid';
  readonly date: string;
  readonly visitorCount: number;
  readonly signupCount: number;
}

export interface ActivationFunnelStep {
  readonly step:
    | 'signup-start'
    | 'signup-complete'
    | 'first-match-started'
    | 'first-match-completed';
  readonly date: string;
  readonly count: number;
}

export interface RetentionCohort {
  readonly cohortWeek: string;
  readonly cohortSize: number;
  readonly day1ReturnCount: number;
  readonly day7ReturnCount: number;
}
```

**Locked SQL CHECK constraint:**

```sql
CONSTRAINT analytics_events_event_type_check CHECK (
  event_type IN (
    'direct', 'search', 'referral', 'paid',
    'signup-start', 'signup-complete',
    'first-match-started', 'first-match-completed',
    'retention-return'
  )
)
```

**Locked hash invariant:**

```typescript
export function hashUserId(rawUserId: string | null, salt: string): string | null {
  if (rawUserId === null) {
    return null;
  }
  return crypto
    .createHash('sha256')
    .update(`${rawUserId}|${salt}`)
    .digest('hex');
}
```

**Locked auth posture (D-20503):**

| Endpoint | Auth | Rate Limit | Body Cap |
|---|---|---|---|
| `POST /api/analytics/events` | `guest` | 60 events/min/IP | 8 KB single / 100 KB batch / 50 events |
| `GET /api/analytics/traffic-sources` | `authenticated-session-required` | (none beyond Koa defaults) | (none) |
| `GET /api/analytics/activation-funnel` | `authenticated-session-required` | (none beyond Koa defaults) | (none) |
| `GET /api/analytics/retention-cohorts` | `authenticated-session-required` | (none beyond Koa defaults) | (none) |

**Locked status-code domains:**

| Endpoint | Status codes |
|---|---|
| `POST /api/analytics/events` | `{202, 400, 413, 429, 500}` |
| `GET /api/analytics/traffic-sources` | `{200, 400, 401, 500}` |
| `GET /api/analytics/activation-funnel` | `{200, 400, 401, 500}` |
| `GET /api/analytics/retention-cohorts` | `{200, 400, 401, 500}` |

**Forward-contract governance clause (locked — D-20501):**

> `analytics_events` schema is closed at 7 columns (`id`, `event_type`,
> `user_id_hash`, `session_id`, `ts`, `properties`, `created_at`).
> Future per-event-type metadata rides on the `properties` JSONB
> field, NOT new columns. Schema extension requires a new migration
> + a new D-entry; column add / rename / drop is a breaking change
> the future WP must opt into explicitly.

---

## Acceptance Criteria

### Migration / Schema / Drift

- [ ] `data/migrations/017_create_analytics_events.sql` applies
  cleanly against an empty `legendary` schema; `\d
  legendary.analytics_events` shows exactly 7 columns matching
  §Locked contract values.
- [ ] SQL CHECK constraint enforces the 9-value closed set; an
  INSERT with `event_type = 'unknown'` fails with a CHECK
  violation error.
- [ ] SQL CHECK constraint on `user_id_hash` enforces 64-char
  lowercase hex format (or NULL); an INSERT with `user_id_hash =
  'not-a-hash'` fails.
- [ ] `analytics_events_event_type_ts_idx` + `analytics_events_user_id_hash_ts_idx`
  exist; `EXPLAIN` on a representative aggregation query shows
  the index in use.
- [ ] `analytics.types.test.ts` asserts `ACQUISITION_EVENT_TYPES`
  byte-equals the 9-value list AND byte-equals the SQL CHECK
  constraint's 9 values (parsed from the migration file's text).

### Hash / PII Posture (D-20502)

- [ ] `hashUserId(null, salt)` returns `null`; `hashUserId(x, salt)`
  returns a 64-char lowercase hex string for any non-null `x`.
- [ ] `hashUserId(x, salt1)` !== `hashUserId(x, salt2)` for any
  `salt1 !== salt2` (drift-detection: salt MUST influence output).
- [ ] `hashUserId(x, salt)` is deterministic across two consecutive
  calls (test asserts byte-equality).
- [ ] In `NODE_ENV === 'production'`, `getAnalyticsUserIdSalt()`
  throws a full-sentence error when `process.env.ANALYTICS_USER_ID_SALT`
  is unset OR is empty string.
- [ ] In test / dev, `getAnalyticsUserIdSalt()` returns a fixed
  test salt + emits a `console.warn` exactly once per process
  (one-shot guard).
- [ ] An integration test posts `user_id: "alice@example.com"` and
  asserts: row count = 1; row's `user_id_hash` matches
  `sha256("alice@example.com|" + testSalt)` hex; SELECT scanning
  every column for the literal string `"alice@example.com"`
  returns zero rows.

### Capture Endpoint (POST /api/analytics/events)

- [ ] Single-event happy path: `POST` with valid
  `AnalyticsEventCapturePayload` → 202 `{ accepted: 1 }`; row
  inserted with hashed `user_id`.
- [ ] Batch happy path: `POST` with `AnalyticsEventBatchPayload`
  containing 5 events → 202 `{ accepted: 5 }`; 5 rows inserted in
  a single transaction.
- [ ] Closed-set rejection: `POST` with `event_type =
  'unknown-channel'` → 400 `'invalid_request'`; no DB writes.
- [ ] Malformed payload: missing `session_id`, non-string
  `session_id`, non-number `timestamp`, non-object `properties` →
  400 `'invalid_request'`; no DB writes.
- [ ] Batch over-size: 51 events in batch → 413
  `'payload_too_large'`; no DB writes.
- [ ] Body-size cap: single event > 8 KB OR batch > 100 KB → 413
  `'payload_too_large'` BEFORE parsing (Koa body parser limit).
- [ ] Rate limit: 61st request from the same IP within 60 seconds
  → 429 `'rate_limited'`; no DB writes for the rejected request.
- [ ] Anonymous event: `POST` with `user_id: null` → 202; row
  inserted with `user_id_hash = NULL`.
- [ ] Status-code domain locked to `{202, 400, 413, 429, 500}`;
  any other status (e.g., 401, 404) is a regression.

### Query Endpoints (3 × GET)

- [ ] `GET /api/analytics/traffic-sources?range=14d` →
  `authenticated-session-required`; happy path returns 200 `{
  data: TrafficSource[] }` where the array is sorted ascending
  by `date` and every entry's `channel` is in the 4-value
  `AcquisitionChannel` set.
- [ ] Closed `range` rejection: `range=invalid` → 400
  `'invalid_request'`; `range` absent → 400.
- [ ] Auth failure: missing / invalid / expired token →
  401 `'unauthorized'` (collapse per D-10403); unknown account →
  401 `'unauthorized'` (NOT 403).
- [ ] `GET /api/analytics/activation-funnel?range=...` — same
  shape; returns `ActivationFunnelStep[]` sorted ascending by
  `date`; every entry's `step` is in the 4-value `ActivationStep`
  set.
- [ ] `GET /api/analytics/retention-cohorts?cohortCount=8` →
  returns `RetentionCohort[]` sorted ascending by `cohortWeek`
  (Unicode code-unit comparison); `cohortCount` absent → defaults
  to 8; `cohortCount > 26` → 400.
- [ ] Empty-data path: against an empty `analytics_events` table
  each GET returns 200 `{ data: [] }` (NOT 404).
- [ ] `Cache-Control: no-store` set as the first statement on
  every response path (including 400 / 401 / 500).
- [ ] Response envelope is byte-identical to `{ data: readonly
  T[] }` — no `source` / `updatedAt` fields (dashboard adds those
  at the future LIVE-flip site).

### Build / Test / Layer / Catalog

- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with
  baseline + **≥ 28 net-new tests** (≥ 3 drift + ≥ 5 hash + ≥ 8
  logic + ≥ 12 routes).
- [ ] Layer-boundary grep: zero
  `@legendary-arena/(game-engine|registry|preplan)` matches in
  `apps/server/src/analytics/`.
- [ ] No-new-deps gate: `git diff --stat apps/server/package.json
  pnpm-lock.yaml` empty.
- [ ] No-dashboard-edits gate: `git diff --name-only
  apps/dashboard/` empty.
- [ ] No-engine-edits gate: `git diff --name-only packages/
  apps/arena-client/ apps/registry-viewer/` empty.
- [ ] API catalog updated: `docs/ai/REFERENCE/api-endpoints.md`
  has 4 new rows under `## Wired → Server-Registered Routes`;
  each row carries `Status: Wired`, `Auth` from the closed set,
  `Authorizing WP: WP-205`, and Notes citing D-20501..D-20503.
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Build + test the server
pnpm --filter @legendary-arena/server build
pnpm --filter @legendary-arena/server test

# Migration applies clean against a fresh local DB
psql $env:DATABASE_URL -c "DROP SCHEMA IF EXISTS legendary CASCADE; CREATE SCHEMA legendary;"
psql $env:DATABASE_URL -f data/migrations/001_server_schema.sql
# ... repeat for 002..016
psql $env:DATABASE_URL -f data/migrations/017_create_analytics_events.sql
psql $env:DATABASE_URL -c "\d legendary.analytics_events"

# Closed-set CHECK constraint fires on bad event_type
psql $env:DATABASE_URL -c "INSERT INTO legendary.analytics_events (event_type, session_id, ts) VALUES ('unknown', 'sess', NOW());"
# Expected: ERROR ... violates check constraint "analytics_events_event_type_check"

# Hash invariant grep
grep -nE "createHash\('sha256'\)" apps/server/src/analytics/userIdHash.ts
# Expected: 1 match.

# Raw user_id never persisted — grep the analytics module for INSERT statements that bind raw user_id
grep -nE "INSERT.*user_id[^_]" apps/server/src/analytics/
# Expected: zero matches (the column is `user_id_hash`, not `user_id`).

# Catalog rows landed
grep -nE "/api/analytics/(events|traffic-sources|activation-funnel|retention-cohorts)" docs/ai/REFERENCE/api-endpoints.md
# Expected: 4 matches; each cites WP-205.

# Layer boundary
grep -rnE "@legendary-arena/(game-engine|registry|preplan)" apps/server/src/analytics/
# Expected: zero matches.

# No-dashboard / no-engine / no-client / no-deps
git diff --stat apps/server/package.json pnpm-lock.yaml
git diff --name-only apps/dashboard/ apps/arena-client/ apps/registry-viewer/ packages/
# Expected: all empty.

# Full monorepo build
pnpm -r build
```

Expected: every grep returns the documented count; migration
applies; closed-set rejection fires at DB level; build + test
exit 0.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-205 / EC-233 Executed`
  block (migration + 8 server files + bootstrap wiring + api
  catalog rows + 3 D-entries; hash-with-salt PII posture locked;
  dashboard MOCK→LIVE flip deferred to a future small WP; client
  emission deferred to per-app future WPs).
- [ ] `docs/ai/DECISIONS.md` has D-20501..D-20503 (proposed). Verbatim
  entry text lives at `EC-233 §DECISIONS.md Verbatim Block` and lands
  in `docs/ai/DECISIONS.md` byte-identical at execution close (PS-1
  transcription convention mirroring WP-203 / WP-204):
  - **D-20501** — `analytics_events` schema closed at 7 columns
    + 9-value CHECK + 2 BTREE indexes.
  - **D-20502** — PII posture: SHA-256(rawUserId || '|' || salt);
    salt from env var; production loud-fail on missing salt; salt
    rotation deferred.
  - **D-20503** — Auth posture split: `POST` capture is `guest`
    with rate limit + size cap; 3 GET queries are
    `authenticated-session-required`. Response envelope is `{
    data: T }` (no server-embedded source/updatedAt).
- [ ] `WORK_INDEX.md`: WP-205 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-233 row Done.
- [ ] `docs/ai/REFERENCE/api-endpoints.md`: 4 new rows landed; D-11804
  catalog rule satisfied.
- [ ] No **source** file outside the 15-file §Files Expected to
  Change list was modified.

---

## Vision Alignment

**Vision clauses touched:** §3 (Trust & Fairness — analytics
surface is operator-internal; PII posture protects player data at
rest), §11 (Identity / accounts — hashed `user_id` interoperates
with the existing Hanko-backed `accountResolver` only at the
non-analytics layer; the analytics table itself cannot be re-keyed
to identity), Financial Sustainability covenant (no impact;
analytics power dashboard surfaces only).

**Conflict assertion:** `No conflict: this WP preserves all
touched clauses.` Operator-internal capture + operator-only
queries; raw `user_id` hashed at the route boundary so a DB
compromise cannot re-attribute events to identities; no
public-facing affordance modified.

**Non-Goal proximity check:** `N/A — WP touches no monetization
or competitive surface.` Analytics observes funnel + cohort +
channel attribution; it does NOT touch revenue, royalty, or any
NG-1..7 monetization boundary. The 3 GET endpoints feed the
operator dashboard only.

**Determinism preservation:** `N/A — WP touches no scoring,
replay, RNG, or simulation surface.` Hash determinism (same
input + salt = same output) is a property of SHA-256, not of
the game engine.

---

## Funding Surface Gate

N/A — server analytics WP; no §20.1 trigger surface touched (no
navigation funding affordance, no registry-viewer surface, no
profile attribution, no user-visible donate copy). Analytics
events do NOT include tournament funding pool deposits or
withdrawals — those are governed by WP-097 and are out of scope.

---

## API Catalog Update

**Required (D-11804).** 4 new rows under `## Wired →
Server-Registered Routes` in `docs/ai/REFERENCE/api-endpoints.md`:

| Status | Method | Path | Auth | Authorizing WP |
|---|---|---|---|---|
| `Wired` | `POST` | `/api/analytics/events` | `guest` | WP-205 |
| `Wired` | `GET` | `/api/analytics/traffic-sources` | `authenticated-session-required` | WP-205 |
| `Wired` | `GET` | `/api/analytics/activation-funnel` | `authenticated-session-required` | WP-205 |
| `Wired` | `GET` | `/api/analytics/retention-cohorts` | `authenticated-session-required` | WP-205 |

Each row's Notes column cites D-20501 (schema lock) + D-20502
(PII posture) + D-20503 (auth split) + the relevant carry-forward
D-entries (D-9905 / D-10403 / D-11504 / D-11802).

---

## Anti-Patterns to Avoid

- Do NOT persist raw `user_id` anywhere — not in any column, not
  in any log line, not in any error message. Grep gate at close
  asserts zero matches for `user_id\b` outside the hash function
  and the type definition.
- Do NOT skip the SQL CHECK constraint and rely on the route
  validator alone. Defense in depth requires both — a regression
  in the route validator (e.g., a future refactor that drops the
  closed-set check) is caught by the DB.
- Do NOT add per-user-revenue / per-user-LTV / ARPU SQL against
  `analytics_events`. The table cannot answer "what did user X
  spend?" — by design. Future per-user revenue dashboards source
  from the players table, not this one.
- Do NOT store the salt in source code or in a checked-in config
  file. Production salt is an env var. A leaked salt in git
  history defeats the entire posture.
- Do NOT use SHA-1 or MD5 — both have practical collisions. Use
  SHA-256 only.
- Do NOT use a per-event-type hashing scheme (e.g., "only hash
  for signup events, not channel events"). The hash applies
  uniformly; anonymous events have NULL `user_id` and therefore
  NULL `user_id_hash`.
- Do NOT auth-gate the POST capture endpoint. Pre-signup
  visitors have no session token; gating capture would discard
  every channel-attribution event. The rate limit + body cap are
  the always-open posture's defenses.
- Do NOT skip the rate limit "because Koa has a global limiter
  somewhere". Each endpoint declares its own posture; analytics
  capture is the only currently-`guest` endpoint with this
  always-open shape.
- Do NOT embed `source: 'LIVE'` / `updatedAt: Date.now()` in the
  GET responses. The server returns bare data; the dashboard's
  future LIVE-flip wrapper adds the envelope.
- Do NOT use `localeCompare` to sort the daily series by date —
  the SQL `ORDER BY date ASC` is byte-identical to Unicode code-
  unit comparison for `YYYY-MM-DD` strings; no client-side
  re-sort needed.
- Do NOT introduce a 10th `event_type` value without updating
  the union AND `ACQUISITION_EVENT_TYPES` AND the route validator
  AND the SQL CHECK constraint — drift test will fail loudly.
- Do NOT batch INSERTs into multiple transactions. A single
  `INSERT ... VALUES (...), (...)` statement (or a single
  `BEGIN; INSERTs; COMMIT;` block) keeps the partial-failure
  semantic clean: either all rows in the batch land or none do.
- Do NOT extract a "real-time stream" abstraction from this WP.
  The aggregation queries run per-request; that's the v1
  contract. Stream processing is a future WP.
- Do NOT skip the `Cache-Control: no-store` first-statement lock
  on the GET endpoints. The dashboard composables already handle
  freshness via their own `updatedAt`; a cached query response
  would surface stale data to the operator.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph + user-visible outcome | ✅ (server surface lands; future WPs wire emission + flip dashboard) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-203 / WP-197 / WP-115 / WP-104 / WP-132 / WP-133 / WP-118 / WP-131 all ✅; existing server inventory verified against `main @ 5293a25`) |
| 3 | Context (Read First) specific (paths + section refs + D-entry refs) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ (Out of Scope enumerates 9 distinct deferrals) |
| 5 | Files Expected to Change matches contract | ✅ (15 files: 9 new + 2 modified source + 4 governance) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ (5-heading grouping; binary checks; specific tokens) |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — server-only; no engine/registry/preplan/client | ✅ (no `@legendary-arena/(game-engine|registry|preplan)` imports; grep gate at close) |
| 11 | Identity model — hashed `user_id_hash` consistent with Hanko-backed identity at the non-analytics layer | ✅ (D-20502; raw `user_id` arrives over HTTPS, hashed at route boundary BEFORE persistence; no cleartext at rest) |
| 12 | Test rules — `node:test`; ≥ 28 net-new tests; no boardgame.io import | ✅ |
| 13 | pnpm/node commands only; expected output shown | ✅ |
| 14 | Acceptance criteria binary + specific | ✅ |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/scope-bound + catalog update | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing | ✅ |
| 17 | Vision Alignment present; clauses §3 / §11 / Financial Sustainability | ✅ |
| 18 | Prose-vs-grep: verification greps scoped to file/path/token; D-entries cited where forbidden tokens discussed | ✅ |
| 19 | Bridge-vs-HEAD staleness | N/A |
| 20 | Funding surface N/A with justification | ✅ (server analytics; no §20.1 trigger; analytics events ≠ tournament funding pool deposits) |
| 21 | API catalog update obligation satisfied | ✅ (D-11804; 4 new rows under §Wired → Server-Registered Routes; replace-whole-row merge semantics; closed-set Status + Auth values) |

---

*Drafted: 2026-06-03. Baseline `origin/main @ 5293a25` (post-WP-204
close). Paired server WP to WP-203 (dashboard
acquisition/activation/retention surfaces) per D-20301..D-20303
deferral. Closest precedent: WP-203 (forward-locked envelope) +
WP-133 (route + logic + types pattern + Stripe-webhook always-open
guest endpoint discipline) + WP-132 (closed-set entitlement key
allowlist precedent). Reserves D-20501 (schema lock), D-20502
(hash-with-salt PII posture; salt rotation deferred), D-20503
(auth posture split + response envelope shape). Hard-deps:
WP-203 ✅, WP-197 ✅, WP-115 ✅, WP-104 ✅, WP-132 ✅,
WP-133 ✅, WP-118 ✅, WP-131 ✅ — all landed. Defers: client-side
event emission (per-app future WPs); dashboard MOCK→LIVE flip
(small follow-up WP); per-user revenue / ARPU dashboards (must
source from a different table per D-20502 intentional bound).*
