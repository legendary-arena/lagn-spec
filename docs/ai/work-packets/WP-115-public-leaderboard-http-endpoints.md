# WP-115 — Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap

**Status:** Draft
**Primary Layer:** Server (`apps/server/**`) — wiring layer
**Version:** 1.0
**Last Updated:** 2026-04-29
**Dependencies:** WP-054 (library surface — must land first), WP-051 (parGate), WP-053 (competitive_scores table), WP-053a (parGate scoringConfig shape), WP-052 (replay_ownership / visibility), WP-103 (replay_blobs), WP-004 (server bootstrap)

---

## Session Context

WP-054 (drafted v1.3, Status `Ready for Implementation`) ships three
library functions in `apps/server/src/leaderboards/leaderboard.logic.ts`
(`getScenarioLeaderboard`, `getPublicScoreByReplayHash`,
`listScenarioKeys`) that are unit-tested but **not network-reachable** —
its `## Lifecycle Prohibition` section locks a deferral of all HTTP
wiring, rate limiting, CORS, and `pg.Pool` lifecycle to "the future
request-handler WP." This packet is that WP for the leaderboard surface.
WP-102 (Done 2026-04-28 at `369c0a4`) shipped an analogous deferred
route file at `apps/server/src/profile/profile.routes.ts` whose
`registerProfileRoutes(router, database)` is also waiting on a
long-lived `pg.Pool`; per WP-102 D-10202, profile-route wiring is
explicitly deferred to its own follow-up WP and is **out of scope**
here even though the `pg.Pool` introduced in this packet would also
satisfy it.

---

## Why This Packet Matters

Without this packet, every public leaderboard query exists only as an
import-callable library. With it, the verified competitive results
written by WP-053 become viewable via `GET /api/leaderboards/...` from
any browser or CLI client — closing the loop on Vision §23(a)
scenario-benchmarking by giving the data a public surface. This
packet also introduces the long-lived `pg.Pool` that WP-102 and every
future request-handler WP requires.

---

## Vision Alignment

> Required by `00.3 §17.1` — this WP touches scoring/leaderboards
> (Vision §20-26, §22, §23, §24), replays/replay verification
> (§18, §22, §24), and player identity/visibility (§3, §11). Mirrors
> WP-054's Vision Alignment block; this packet is a transport surface
> over WP-054's projection.

**Vision clauses touched:**
`§3 (Player Trust & Fairness), §11 (Stateless Client Philosophy),
§18 (Replayability & Spectation), §20 (PAR-Based Scenario Scoring),
§22 (Deterministic & Reproducible Evaluation), §23 (Competitive
Leaderboards & Submission), §24 (Replay-Verified Competitive
Integrity), §25 (Skill Over Repetition — non-ranking telemetry
carve-out)`

**Conflict assertion:** No conflict — this WP preserves all touched
clauses. The HTTP surface is a transport adapter over WP-054's
verified, replay-anchored, PAR-gated projection; no scoring logic is
implemented here; no identity correlation surface is introduced; sort
order, visibility filter, and PAR-fail-closed semantics are inherited
from WP-054 and not re-derived.

**Non-Goal proximity (NG-1..7):** none crossed. The endpoints are
read-only over a non-monetized competitive surface (NG-1, NG-2, NG-3,
NG-7), with no time-pressure or FOMO mechanic (NG-4), no advertising
(NG-5), and no dark-pattern UX (NG-6). Anonymous access — no
auth-broker session check, no per-request authorization.

**Determinism preservation:** identical query parameters produce
identical responses (sort order from WP-054 is total; pagination is
explicit `limit`/`offset`); no caching layer is introduced; no
time-windowed aggregation; the response body is a JSON projection of
WP-054's already-verified records.

**Funding Surface Gate (`00.3 §20`):** **N/A — this WP introduces no
payment, donation, subscription, supporter-tier, or
tournament-funding surface.** Per `01-VISION.md §Financial
Sustainability`, monetization must never alter competitive integrity;
this WP is a read-only transport adapter over a non-monetized
competitive surface and cannot be a monetization vector by
construction.

---

## Goal

Expose WP-054's three library functions as public, anonymous,
read-only HTTP endpoints under `/api/leaderboards/*` on the existing
boardgame.io Koa router. After this session, the server:

- Constructs and owns a long-lived `pg.Pool` instance at startup
- Closes the `pg.Pool` cleanly on `SIGTERM`
- Binds the WP-051 `parGate` (1-arg curried form from
  `createParGate(...)`) into the WP-054 `LeaderboardDependencies`
  injection seam
- Registers three new Koa route handlers:
  - `GET /api/leaderboards/scenarios`
  - `GET /api/leaderboards/scenarios/:scenarioKey`
  - `GET /api/leaderboards/scores/:replayHash`
- Rejects malformed `limit` / `offset` query parameters with `400`
  and a structured error envelope
- Returns `404` with a structured error envelope when a `replayHash`
  lookup misses
- Returns `500` with a structured error envelope on uncaught errors
  (no stack trace leakage)

**Invariant:** Wiring only — see `## Non-Negotiable Constraints` for
the canonical statement of what is and is not in scope.

---

## Assumes

- WP-054 complete. Specifically:
  - `apps/server/src/leaderboards/leaderboard.types.ts` exports
    `PublicLeaderboardEntry`, `ScenarioLeaderboard`,
    `LeaderboardQueryOptions`, `LeaderboardDependencies`
  - `apps/server/src/leaderboards/leaderboard.logic.ts` exports
    `getScenarioLeaderboard(options, database, deps?)`,
    `getPublicScoreByReplayHash(replayHash, database)`,
    `listScenarioKeys(database)`, and `PRODUCTION_DEPENDENCIES`
  - The `LeaderboardDependencies` shape is
    `{ checkParPublished: (scenarioKey: string) => ParGateHit | null }`
  - All three helpers fail closed on missing data and never throw
- WP-051 complete. Specifically:
  - `apps/server/src/par/parGate.mjs` exports `createParGate(basePath,
    parVersion)` returning an object whose `.checkParPublished` is the
    bound 1-arg curried form `(scenarioKey) => ParGateHit | null`
- WP-053 complete. Specifically:
  - `legendary.competitive_scores` exists with the locked WP-053
    schema; only WP-054 reads from it via the JOINs documented in
    WP-054 §Scope (In) §B
- WP-053a complete. Specifically:
  - `ParGateHit` carries `{ parValue, parVersion, source,
    scoringConfig }`; this WP reads only the bound function shape and
    does not destructure the hit
- WP-052 complete. Specifically:
  - `legendary.replay_ownership.visibility` exists with `'private' |
    'link' | 'public'`
  - `legendary.players.display_name` exists `text NOT NULL`
- WP-103 complete. Specifically:
  - `legendary.replay_blobs` exists; this WP does not read it but its
    presence is a precondition for WP-053 records to exist
- WP-004 complete. Specifically:
  - `apps/server/src/server.mjs` exports `startServer()` and wires
    `LegendaryGame` into boardgame.io `Server({...})`
  - `apps/server/src/index.mjs` is the process entrypoint and handles
    SIGTERM
  - `boardgame.io/server`'s `Server({...}).router` exposes a Koa
    `Router#get(path, handler)` surface (transitive `@koa/router`
    dependency — no direct dep added; see WP-102 §Files Expected to
    Change pre-flight PS-1)
- `DATABASE_URL` (or equivalent `pg`-compatible connection string env
  var read by the existing rules loader) is documented and set in all
  environments
- `pnpm -r build` exits 0
- `pnpm test` exits 0 with all existing baselines preserved (the
  leaderboard library tests added by WP-054 must already pass); if
  WP-054 has not yet landed at execution time, this packet is
  **BLOCKED**

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Section 1 "Monorepo Package Boundaries"`
  and `.claude/rules/server.md` — the server is a wiring layer only;
  no game logic; this packet adds wiring and nothing else.
- `docs/ai/ARCHITECTURE.md §Persistence Boundaries` — the `pg.Pool`
  introduced here is application-layer infrastructure. No `G`/`ctx`
  is touched by any code in scope. Per `.claude/rules/persistence.md`
  Class 1, `G` is never persisted; this packet does not change that.
- `docs/ai/work-packets/WP-054-public-leaderboards-read-only.md` —
  read `## Lifecycle Prohibition`, `## Scope (In)`, and `## Locked
  Contract Values`. The library shape this packet wraps is locked;
  nothing in WP-054's contract may be modified here.
- `apps/server/src/profile/profile.routes.ts` — the canonical pattern
  for a Koa-router adapter on this codebase. Mirrors structurally:
  local `KoaRouter` interface, `try/catch` swallowing the value,
  status + body assignments, no global error middleware. This packet
  follows the same pattern verbatim.
- `apps/server/src/server.mjs` — read the existing `startServer()`
  end-to-end. Note the `Promise.all([loadRegistry(), loadRules(),
  createParGate(...)])` startup pattern; this packet adds a fourth
  parallel task (`createPool()`) and a single-line route registration.
- `apps/server/src/index.mjs` — the entrypoint; SIGTERM handler lives
  here. This packet adds a `pool.end()` call to the SIGTERM path.
- `apps/server/src/par/parGate.mjs` — read the `ParGate` interface
  and the bound 1-arg `checkParPublished` shape. This packet supplies
  exactly that bound function as the `LeaderboardDependencies` value.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations — `database` not `db`, `error` not `e`), Rule 6
  (`// why:` on non-obvious decisions), Rule 11 (full-sentence error
  messages), Rule 13 (ESM only), Rule 14 (canonical field names).
- `docs/ai/DECISIONS.md` — D-5201 (server identity is `AccountId`,
  never `playerId`), D-10202 (WP-102 profile route wiring deferred —
  this packet does **not** un-defer it), D-3103 (mid-execution
  amendment precedent if scope drifts), D-9904 (Hanko code lives only
  under `apps/server/src/auth/hanko/` — this packet introduces no
  auth code).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- **Wiring only:** this packet contains zero scoring logic, zero
  replay re-execution, zero data validation beyond query-string
  parsing. All semantics — visibility filter, PAR fail-closed,
  deterministic sort, sensitive-field stripping — are inherited from
  WP-054 and must not be re-derived.
- **No new npm dependencies.** The Koa router reaches us as a
  transitive of `boardgame.io/server` (see WP-102 §Files Expected to
  Change pre-flight PS-1); `pg` is already a direct dependency.
  **No `koa-ratelimit`, no `koa-bodyparser`, no Express, no Fastify,
  no `cors` package.** CORS is already configured in the existing
  `Server({ origins: [...] })` call and is inherited.
- **No write paths.** No `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`,
  or migration is permitted in any file in scope.
- **No new tables, no new migrations.** `legendary.competitive_scores`,
  `legendary.replay_ownership`, and `legendary.players` are read by
  WP-054's library; this packet does not touch the schema.
- **No authentication.** Routes are anonymous. No
  `requireAuthenticatedSession` import, no Hanko reference, no
  per-request authorization. The visibility gate from WP-052 already
  governs what is publicly visible.
- **No `accountId` exposure.** Per D-5201, `accountId` is the
  server-side identity correlation handle and never appears in any
  response body. WP-054's `PublicLeaderboardEntry` already strips it;
  this packet does not re-introduce it.
- **No structured logging beyond `console.error`.** Existing server
  logging is `console.log` / `console.error`. This packet matches
  that pattern. A future observability WP may attach a logger via
  the structural router parameter without changing this surface.
- **No request-scoped `pg.Pool` creation.** Exactly one `pg.Pool`
  instance is constructed at startup and shared by every handler.
  Per-request pool creation is a known anti-pattern and is forbidden.
- **No `pg.Client` outside the Pool.** All database access goes
  through the Pool's connection-checkout path. Direct `new
  pg.Client(...)` is forbidden.
- **No registry-viewer or arena-client modifications.** This packet
  is server-only.
- **No engine imports.** No import from `packages/game-engine/`
  runtime; type-only imports already permitted by WP-054 are not
  re-introduced here.
- **No modification of WP-054 contract files.**
  `apps/server/src/leaderboards/leaderboard.types.ts` and
  `apps/server/src/leaderboards/leaderboard.logic.ts` are locked.
- **No modification of WP-102 contract files.**
  `apps/server/src/profile/profile.routes.ts` and
  `apps/server/src/profile/profile.logic.ts` are locked.
- **No wiring of WP-102's `registerProfileRoutes`.** Per D-10202,
  WP-102's route registration is a separate follow-up. Wiring it
  here would be a "while I'm here" violation even though the
  `pg.Pool` introduced in this packet would also satisfy it.
- **No rate limiting.** Defense-in-depth rate limiting is deferred
  to a future hardening WP. The CDN edge in front of this server
  (Cloudflare for `cards.barefootbetters.com`) provides initial DDoS
  protection. A rate-limit WP must justify its dependency and gate
  itself separately.
- **No response caching.** `Cache-Control: no-store` on all responses
  in this packet (deterministic correctness over hit rate). A
  future caching WP may revisit; the WP-054 §Lifecycle Prohibition
  already names cache-control as that future WP's responsibility.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask
  the human before proceeding — never guess or invent field names,
  type shapes, or file paths.
- If WP-054 has not landed at execution time, this packet is
  **BLOCKED**. Do not stub WP-054's exports. Do not implement the
  library inline. Stop and surface the dependency gap.

**Locked contract values:**

- **Three endpoint paths (canonical):**
  - `GET /api/leaderboards/scenarios`
  - `GET /api/leaderboards/scenarios/:scenarioKey`
  - `GET /api/leaderboards/scores/:replayHash`

  No alternative paths, prefixes, or aliases are permitted. The
  `/api/` prefix matches the existing `/api/players/:handle/profile`
  precedent from WP-102.

- **Query-parameter defaults and bounds (for
  `GET /api/leaderboards/scenarios/:scenarioKey`):**
  - `limit`: default `25`, minimum `1`, maximum `100`
  - `offset`: default `0`, minimum `0`, maximum `10000`

  Out-of-range or non-integer values yield `400` with the structured
  error envelope below. The maxima are picked to bound a single
  response payload and prevent unbounded scans; they are not load
  guarantees. **Precedence:** if both `limit` and `offset` are
  invalid, the handler returns `400` based on the first detected
  error; error ordering is not user-significant and tests must not
  assume a specific ordering.

- **Response status codes:**
  - `200` — success, body is the JSON projection
  - `400` — malformed query (invalid `limit` / `offset`)
  - `404` — `getPublicScoreByReplayHash` returned `null`
  - `500` — uncaught error path

  Note: `getScenarioLeaderboard` returns an empty leaderboard (not
  `404`) when PAR is missing or no eligible scores exist, per WP-054
  §Locked Contract Values fail-closed semantics.

- **Error envelope shape (locked, mirrors WP-102):**
  - `400` body: `{ "error": "invalid_query", "message": "<sentence>" }`
  - `404` body: `{ "error": "score_not_found" }`
  - `500` body: `{ "error": "internal_error" }`

  No stack trace, no internal exception detail, no SQL state, no
  pool diagnostics may appear in any response body.

- **`Cache-Control` header (locked):** `no-store` on every response
  in this packet. Future caching policy is a separate WP.

- **`PRODUCTION_DEPENDENCIES` non-use (locked):** Handlers MUST NOT
  rely on WP-054's `PRODUCTION_DEPENDENCIES` default. Explicit
  injection of `{ checkParPublished: parGate.checkParPublished }`
  at every handler call site is required. Relying on the
  fail-closed default would silently empty every scenario response;
  this lock prevents a future "simplification" from reintroducing
  that failure mode.

- **Pool sizing (locked default):** `max: 10`, `idleTimeoutMillis:
  30000`, `connectionTimeoutMillis: 5000`. Override via env vars is
  out of scope; if production load demands tuning, a future WP owns
  it.

- **`legendary.*` namespace:** All tables live in `legendary.*`. This
  packet creates no new tables.

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via
deterministic reproduction and state inspection.

The following requirements are mandatory:

- Behavior introduced by this packet must be fully reproducible given:
  - identical database state
  - identical query parameters
  - identical request path

- Execution must be externally observable via deterministic response
  bodies. Invisible or implicit side effects are not permitted.

- This packet must not introduce any database state mutation. The
  only state introduced is the `pg.Pool` connection cache, which is
  process-local and discarded on shutdown.

- The following invariants must always hold after execution:
  - Identical request inputs produce identical response bodies
  - No competitive records are modified by any handler
  - No replay ownership records are modified by any handler
  - Private replays never appear in any response body
  - Scenarios without published PAR always return empty leaderboards
    (status `200` with `entries: []`), never `404` or `500`
  - `accountId`, `submissionId`, `email`, `authProvider`,
    `authProviderId`, `stateHash`, and `scoreBreakdown` never appear
    in any response body
  - `pg.Pool` is constructed exactly once per process
  - `pg.Pool.end()` is called exactly once on `SIGTERM`

- Failures attributable to this packet must be localizable via:
  - response status code mismatch against the locked status table, or
  - response body shape mismatch against the locked envelope, or
  - presence of any never-expose field in a response body, or
  - more than one `pg.Pool` construction observed at startup.

- Server startup logs must show exactly one Pool construction event.
  This is the runtime correlate of the §Acceptance Criteria
  "exactly one Pool construction" check — observable via
  `console.log` without adding a logging framework.

---

## Scope (In)

### A) `apps/server/src/db/database.ts` — new

A small module that owns the `pg.Pool` lifecycle.

- `import { Pool } from 'pg';`
- `export function createPool(): Pool` — constructs and returns a
  `pg.Pool` with the locked sizing values. Reads connection
  configuration from the environment via the same env-var contract
  the existing `apps/server/src/rules/loader.mjs` consumes (do not
  invent a new env-var name; if the rules loader uses
  `DATABASE_URL`, this module uses `DATABASE_URL`).
- `export async function closePool(pool: Pool): Promise<void>` —
  thin wrapper over `pool.end()` for symmetry and testability.
- `// why:` comment on `createPool`: a single long-lived Pool is the
  required pattern per `00.3 §8 Backend` ("`pg` pool used for all
  database connections (not a single client)"); per-request Pools
  exhaust connections and lose checkout semantics.
- `// why:` comment on the locked sizing: defaults chosen for a
  Render starter instance; production tuning is a future WP per
  §Locked Contract Values.

### B) `apps/server/src/leaderboards/leaderboard.routes.ts` — new

Mirror the structural shape of `apps/server/src/profile/profile.routes.ts`
verbatim — local `KoaRouter` and `KoaContext` interfaces, no direct
`@koa/router` import, no boardgame.io import, no engine import.

- Local interfaces:
  - `interface KoaLeaderboardContext { params: { scenarioKey?: string; replayHash?: string }; query: Record<string, string | string[] | undefined>; status: number; body: unknown; set(field: string, value: string): void }`
  - `interface KoaRouter { get(path: string, handler: (koaContext: KoaLeaderboardContext) => Promise<void> | void): unknown }`
- `export function registerLeaderboardRoutes(router: KoaRouter, database: Pool, parGate: ParGate): void`
  - Where `ParGate` is the existing JSDoc-typed object from
    `apps/server/src/par/parGate.mjs`; mirror via a local structural
    interface `{ checkParPublished: (scenarioKey: string) => ParGateHit | null }`
    rather than importing the JSDoc typedef (mirrors WP-054
    `LeaderboardDependencies` precedent).
- Three handlers, each:
  1. Sets `koaContext.set('Cache-Control', 'no-store')` first.
  2. Wraps the WP-054 call in `try/catch`; the catch block discards
     the value (mirrors WP-102 `void caughtError;` pattern) and
     returns `500` with `{ error: 'internal_error' }`.
  3. Returns the locked response envelope.
- Handler 1 — `GET /api/leaderboards/scenarios`:
  - Calls `listScenarioKeys(database)`.
  - Returns `200` with `{ scenarioKeys: string[] }`.
  - `// why:` comment on the handler: exposes the canonical list of
    scenario keys so clients can enumerate available leaderboards
    without prior registry knowledge — the discoverability seam
    that lets a leaderboard UI render a scenario picker without
    duplicating registry contents in the client bundle.
- Handler 2 — `GET /api/leaderboards/scenarios/:scenarioKey`:
  - Parses `query.limit` and `query.offset` via a local pure helper
    `parsePaginationQuery(query): { limit: number; offset: number } | { error: string }`.
    The helper rejects non-integer, negative, or out-of-range values
    with a full-sentence error message; the handler returns `400`
    with `{ error: 'invalid_query', message: <sentence> }`.
  - Builds `LeaderboardQueryOptions` from `params.scenarioKey` and
    the parsed pagination.
  - Calls `getScenarioLeaderboard(options, database, { checkParPublished: parGate.checkParPublished })`.
  - Returns `200` with the `ScenarioLeaderboard` directly as the
    body. Empty results (no PAR, no eligible scores) still return
    `200` with `entries: []` per WP-054 fail-closed semantics.
  - `// why:` comment on the explicit `deps` injection: the handler
    must pass the bound `parGate.checkParPublished` rather than
    rely on `PRODUCTION_DEPENDENCIES` (which fail-closes to `null`
    by design); WP-054's PRODUCTION_DEPENDENCIES is a safety
    default for callers that have not yet wired the gate.
- Handler 3 — `GET /api/leaderboards/scores/:replayHash`:
  - Calls `getPublicScoreByReplayHash(params.replayHash, database)`.
  - Returns `200` with the `PublicLeaderboardEntry` on hit, or `404`
    with `{ error: 'score_not_found' }` on `null`.
- `// why:` comment on the file-level: this module is a thin Koa
  adapter — all leaderboard logic lives in `leaderboard.logic.ts`
  per WP-054. The route layer parses query strings, applies status
  codes, and serializes envelopes; nothing else.

### C) `apps/server/src/server.mjs` — modified

Three surgical changes, each independently reviewable:

1. Import `createPool` from `./db/database.js` and
   `registerLeaderboardRoutes` from
   `./leaderboards/leaderboard.routes.js`.
2. Inside `startServer()`, replace `void parGate;` with code that
   constructs the pool via `createPool()`, registers the leaderboard
   routes after `registerHealthRoute(server.router)`:
   ```
   const pool = createPool();
   registerLeaderboardRoutes(server.router, pool, parGate);
   ```
   Add a `// why:` comment noting that the pool's lifetime is the
   process lifetime, that close-on-SIGTERM is owned by `index.mjs`,
   and that `parGate` is now bound (no longer dangling per the
   pre-existing `void parGate;` placeholder).
3. Return `{ appServer, pool }` instead of `appServer` so
   `index.mjs` can attach `closePool(pool)` to the SIGTERM path.

No other behavior in `server.mjs` changes — registry load, rules
load, parGate construction, CORS, port binding, and the existing
`/health` route are unmodified.

### D) `apps/server/src/index.mjs` — modified

One surgical change: the SIGTERM handler must call `closePool(pool)`
**only after the HTTP server's `close()` callback or promise
resolves** — i.e., only once boardgame.io has signaled that no
in-flight requests remain. The exact implementation depends on the
existing SIGTERM shape; reference WP-004's structure and add the
pool-close as the last step before `process.exit(0)`. Add a `// why:`
comment explaining that closing the pool before HTTP shutdown
resolves would sever in-flight handlers mid-query.

### E) Tests — `apps/server/src/leaderboards/leaderboard.routes.test.ts` — new

Uses `node:test` and `node:assert` only. No boardgame.io import. No
HTTP listener. No real `pg.Pool` connection.

All tests live in **one** `describe('leaderboard routes (WP-115)', ...)`
block (mirrors WP-054 / WP-101 / WP-102 single-describe convention).

A minimal mock router captures registered handlers; tests invoke
each handler with a hand-built mock `koaContext` (matching the
locally-declared `KoaLeaderboardContext` shape) and a hand-built
mock `database` and `parGate`. The mock `database` returns canned
results that exercise each branch.

- Eight tests:
  1. **Drift / surface assertion (logic-pure, no DB):** the module
     exports exactly one symbol, `registerLeaderboardRoutes`, and
     calling it with a mock router registers exactly three GET
     handlers at the three locked paths in the locked order.
  2. `GET /api/leaderboards/scenarios` returns `200` with
     `{ scenarioKeys: [...] }` when `listScenarioKeys` returns a
     non-empty array.
  3. `GET /api/leaderboards/scenarios` returns `200` with
     `{ scenarioKeys: [] }` when `listScenarioKeys` returns `[]`.
  4. `GET /api/leaderboards/scenarios/:scenarioKey` returns `200`
     with the `ScenarioLeaderboard` when the underlying call
     succeeds; the response body's `entries` length matches the
     `limit` query parameter.
  5. `GET /api/leaderboards/scenarios/:scenarioKey` returns `400`
     with `{ error: 'invalid_query', message: <sentence> }` for each
     of: non-integer `limit`, `limit=0`, `limit=101`, negative
     `offset`, `offset=10001`. (Five sub-assertions in one test.)
  6. `GET /api/leaderboards/scenarios/:scenarioKey` returns `200`
     with `entries: []` when the underlying call returns an empty
     leaderboard (fail-closed PAR-missing path) — confirms the
     handler does not translate empty results to `404`.
  7. `GET /api/leaderboards/scores/:replayHash` returns `200` with
     the entry on hit, and `404` with `{ error: 'score_not_found' }`
     on `null`.
  8. **Cache header assertion (logic-pure):** every successful
     handler invocation in tests 2-7 sets `Cache-Control: no-store`
     before returning. A direct `set()` mock captures the call and
     asserts the value.

All eight tests are logic-pure — they use mock `database` /
`parGate` / `koaContext` objects and never touch the network or
PostgreSQL. No `hasTestDatabase` skip pattern is needed because no
test requires a DB.

---

## Out of Scope

- **No score submission, no replay verification, no replay
  re-execution.** That is WP-053 / WP-103.
- **No leaderboard library logic.** That is WP-054 — its three
  helpers are imported and wrapped, not modified.
- **No WP-102 profile route wiring.** Per D-10202 and the explicit
  packet-specific constraint above, `registerProfileRoutes` from
  `apps/server/src/profile/profile.routes.ts` is **not** invoked in
  this WP. A separate one-line follow-up WP wires it. The
  `pg.Pool` introduced here is the lifecycle anchor that follow-up
  needs, but consuming it is not this packet's responsibility.
- **No rate limiting.** Edge / CDN handles initial DDoS; defense-in-
  depth rate limiting is a future hardening WP that owns the
  `koa-ratelimit` (or equivalent) dependency justification.
- **No response caching.** Locked `Cache-Control: no-store`. A
  future caching WP may revisit per WP-054 §Lifecycle Prohibition.
- **No CORS changes.** The existing `Server({ origins: [...] })`
  list in `server.mjs` is inherited unchanged. If the
  `arena-client` production origin is missing from that list, that
  is a separate WP.
- **No new database migrations, no new tables, no new indexes.**
  Index tuning for `(scenario_key, final_score, created_at)` was
  deferred by WP-054 to a future performance WP and remains out of
  scope here.
- **No authentication, no admin surface, no `/api/admin/*` paths.**
  All endpoints are anonymous public reads.
- **No structured logging framework.** Existing `console.log` /
  `console.error` is matched. Observability tooling is a future WP.
- **No UI rendering, no `arena-client` modifications, no
  `registry-viewer` modifications.** This packet is server-only;
  the leaderboard UI WP is a separate Client-layer packet.
- **No engine imports, no boardgame.io imports.** The Koa router is
  reached structurally via the route file's local `KoaRouter`
  interface (mirrors WP-102 PS-1).
- Refactors, cleanups, or "while I'm here" improvements are **out
  of scope** unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `apps/server/src/db/database.ts` — **new** — `createPool` +
  `closePool` over `pg.Pool` with locked sizing
- `apps/server/src/leaderboards/leaderboard.routes.ts` — **new** —
  Koa adapter for WP-054's three helpers + pagination parser
- `apps/server/src/leaderboards/leaderboard.routes.test.ts` —
  **new** — `node:test` coverage (8 tests, all logic-pure)
- `apps/server/src/server.mjs` — **modified** — construct `pool`,
  bind `parGate`, register leaderboard routes, return
  `{ appServer, pool }`
- `apps/server/src/index.mjs` — **modified** — call `closePool(pool)`
  in the SIGTERM handler after HTTP shutdown

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Pool Lifecycle
- [ ] `apps/server/src/db/database.ts` exports `createPool` and
      `closePool`
- [ ] Exactly one `new Pool(...)` call exists across the entire
      `apps/server/src/` tree (confirmed with `Select-String`)
- [ ] `closePool(pool)` is invoked from the SIGTERM handler in
      `index.mjs` after the HTTP server's graceful-shutdown step

### Routes
- [ ] `registerLeaderboardRoutes` registers exactly three handlers
      at the three locked paths in the locked order
- [ ] `Cache-Control: no-store` is set on every response (confirmed
      by test 8)
- [ ] No handler ever sets a status code outside `{200, 400, 404, 500}`

### Response Bodies
- [ ] No response body contains any of: `accountId`, `submissionId`,
      `email`, `authProvider`, `authProviderId`, `stateHash`,
      `scoreBreakdown` (confirmed with `Select-String` against the
      route file)
- [ ] `404` body shape is exactly `{ "error": "score_not_found" }`
- [ ] `400` body shape is exactly
      `{ "error": "invalid_query", "message": <string> }`
- [ ] `500` body shape is exactly `{ "error": "internal_error" }`
      and contains no stack trace, SQL state, or exception text

### Pagination
- [ ] `limit` defaults to `25`; rejects non-integer, `<1`, or `>100`
      with `400`
- [ ] `offset` defaults to `0`; rejects non-integer, `<0`, or
      `>10000` with `400`

### Layer Boundary
- [ ] No imports from `packages/game-engine/` runtime in any file
      in scope (type-only imports already permitted by WP-054 are
      not re-introduced here)
- [ ] No `boardgame.io` import in `leaderboard.routes.ts` or
      `database.ts`
- [ ] No imports from `apps/server/src/competition/competition.logic.ts`
- [ ] No `requireAuthenticatedSession` import in any file in scope
- [ ] No Hanko / auth-broker reference in any file in scope
- [ ] No `apps/registry-viewer/` or `apps/arena-client/` files
      modified

### Dependency Discipline
- [ ] No new entries in `apps/server/package.json` `dependencies`
      or `devDependencies` (`pg` and `boardgame.io` already present;
      no `koa-ratelimit`, `koa-bodyparser`, `express`, `fastify`, or
      `cors` added)
- [ ] No `require()` in any new or modified file
- [ ] No `Math.random` in any new or modified file

### WP-054 / WP-102 Contract Lock
- [ ] `apps/server/src/leaderboards/leaderboard.types.ts` unmodified
      (`git diff` clean)
- [ ] `apps/server/src/leaderboards/leaderboard.logic.ts` unmodified
- [ ] `apps/server/src/profile/profile.routes.ts` unmodified
- [ ] `apps/server/src/profile/profile.logic.ts` unmodified
- [ ] `registerProfileRoutes` is **not** called from `server.mjs`
      (confirmed with `Select-String`)

### Tests
- [ ] All 8 tests pass (all logic-pure; no `hasTestDatabase` skip
      pattern used)
- [ ] Test file uses `.test.ts` extension
- [ ] Tests use `node:test` and `node:assert` only
- [ ] No `boardgame.io` import in the test file
- [ ] All 8 tests live inside one `describe('leaderboard routes (WP-115)', …)`
      block

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] No SQL write operations (`INSERT`, `UPDATE`, `DELETE`,
      `CREATE`, `DROP`, `ALTER`) anywhere in scope
- [ ] WP-054 / WP-053 / WP-053a / WP-052 / WP-051 contract files
      unmodified

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run server tests
pnpm --filter "@legendary-arena/server" test
# Expected: server baseline (post-WP-054) → +8 tests / +1 suite, 0 failing

# Step 3 — run engine tests (must be unchanged)
pnpm --filter "@legendary-arena/game-engine" test
# Expected: engine baseline 570/126/0 unchanged

# Step 4 — confirm exactly one Pool construction
Select-String -Path "apps\server\src" -Pattern "new Pool\(" -Recurse
# Expected: exactly one match, in apps/server/src/db/database.ts

# Step 5 — confirm no never-expose fields appear in route file
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts" -Pattern "accountId|submissionId|email|authProvider|stateHash|scoreBreakdown"
# Expected: no output

# Step 6 — confirm no boardgame.io import in route file or db file
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "from .['\"]boardgame\.io"
# Expected: no output

# Step 7 — confirm no engine runtime import in scope files
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "@legendary-arena/game-engine"
# Expected: no output

# Step 8 — confirm no SQL write operations in scope
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "INSERT |UPDATE |DELETE |CREATE |DROP |ALTER "
# Expected: no output

# Step 9 — confirm WP-102 profile route is not wired in this WP
Select-String -Path "apps\server\src\server.mjs" -Pattern "registerProfileRoutes"
# Expected: no output (WP-102 wiring stays deferred per D-10202)

# Step 10 — confirm no auth references in scope
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "requireAuthenticatedSession|hanko|@anthropic|jwt"
# Expected: no output

# Step 11 — confirm no forbidden routing libs added
Select-String -Path "apps\server\package.json" -Pattern "express|fastify|cors|koa-ratelimit|koa-bodyparser|axios|node-fetch"
# Expected: no output

# Step 12 — confirm WP-054 / WP-102 contract files unmodified
git diff apps/server/src/leaderboards/leaderboard.types.ts apps/server/src/leaderboards/leaderboard.logic.ts apps/server/src/profile/
# Expected: no changes

# Step 13 — confirm no require() in any new or modified file
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "require\("
# Expected: no output

# Step 14 — confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

> Claude Code must execute every verification command in
> `## Verification Steps` before checking any item below. Reading the
> code is not sufficient — run the commands.
>
> Every item must be true before this packet is considered complete.

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 (post-WP-054
      baseline + 8 tests / +1 suite)
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (engine
      baseline unchanged)
- [ ] Exactly one `new Pool(...)` call across `apps/server/src/`
- [ ] `closePool(pool)` invoked in SIGTERM handler in `index.mjs`
- [ ] No never-expose fields in `leaderboard.routes.ts`
- [ ] No `boardgame.io`, no engine runtime, no `requireAuthenticatedSession`
      import in scope files
- [ ] WP-054 / WP-053 / WP-053a / WP-052 / WP-051 / WP-102 contract
      files unmodified (`git diff` clean across each)
- [ ] `registerProfileRoutes` is not called from `server.mjs` (WP-102
      wiring stays deferred per D-10202)
- [ ] No new npm dependencies in `apps/server/package.json`
- [ ] No `require()`, no `Math.random` in any new or modified file
- [ ] No SQL write operations anywhere in scope
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] `docs/ai/STATUS.md` updated — public leaderboard endpoints
      live; `/api/leaderboards/scenarios`,
      `/api/leaderboards/scenarios/:scenarioKey`,
      `/api/leaderboards/scores/:replayHash` reachable; long-lived
      `pg.Pool` introduced; WP-102 profile route wiring still
      deferred (separate follow-up)
- [ ] `docs/ai/DECISIONS.md` updated — at minimum: why the `pg.Pool`
      lives in `apps/server/src/db/`; why pool sizing defaults are
      what they are; why rate limiting is deferred to a future
      hardening WP; why `Cache-Control: no-store` is locked for v1;
      why WP-102's profile route is **not** wired here despite the
      `pg.Pool` becoming available
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-115 row added (if
      not already present at draft time) and checked off with
      today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has an EC-NNN row
      added at governance close (EC number assigned at draft time
      of the EC, not here)
