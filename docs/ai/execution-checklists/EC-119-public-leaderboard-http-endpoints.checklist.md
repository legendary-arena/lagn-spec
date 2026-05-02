# EC-119 — Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap (Execution Checklist)

**Source:** docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md (v1.1, 2026-05-01)
**Layer:** Server (`apps/server/**`) — wiring only + Reference (`docs/ai/REFERENCE/api-endpoints.md` per D-11804)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-115.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-115.

---

## v1.1 Update Log (2026-05-01)

Substantive changes since v1.0 (2026-04-29):

1. **WP-054 merge-state pre-flight added.** WP-054's library code
   is on side-branch `wp-054-public-leaderboards-read-only` (tip
   `f34e917`) and **not on `main`** as of 2026-05-01. New §Before
   Starting item explicitly grep-checks for the merge state.
2. **API Catalog Update Obligation folded.** Per WP-118 (Done
   2026-04-30) + D-11804, this WP MUST update
   `docs/ai/REFERENCE/api-endpoints.md` in the same commit that
   lands the route registration. New §Files to Produce row added
   for the catalog file; new §After Completing assertions
   verify the closed-set taxonomies and the wholesale row
   replacement.
3. **Test baselines refreshed.** Engine `570/126/0` →
   `604/132/0`; server today reports `47 pass / 24 skipped / 0
   fail` on `main` absent `DATABASE_URL` (suite count
   informational only per reviewer Patch 6 — only
   `pass/fail/skipped` totals are governance-significant).
   Post-WP-054-merge: `56 pass / 24 skipped / 0 fail`. This WP
   adds +8 tests / +1 suite → expected post-execution `64 pass /
   24 skipped / 0 fail`.
4. **EC-127 §0 amendment-pattern precedent noted.** If a
   mechanical scope gap surfaces during execution (parallel to
   WP-125's `devLog` Category-union extension), follow EC-127 §0
   pre-execution amendment per D-12501; WP-086 (`ccc6d0e`) is
   the legacy audit-trail-after-the-fact precedent.
5. **Reviewer Patches 1–9 folded into WP-115 v1.1
   (2026-05-01).** This EC inherits all nine patches:
   Promise.all narrative fix; engine baseline refresh; optional
   `leaderboardLogic?` injection seam (test purity); missing
   path-param 400 behavior (`scenarioKey`, `replayHash`);
   array-value query policy (length===1 OK, else 400); loosened
   suite-count locks; resolved API Catalog row interpretation
   (transition WP-054 `Library-only` → `Wired`, delete
   `Pending: WP-115`); Cache-Control on error paths; Pool-log
   enforceability downgrade. See WP-115 §v1.1 Update Log for the
   full record.

---

## Before Starting

- [ ] **WP-054 merged to `main` HEAD (mandatory pre-flight, added in v1.1).**
      Run: `git ls-tree -r --name-only HEAD apps/server/src/leaderboards/leaderboard.logic.ts`.
      If no output, this packet is **BLOCKED** — WP-054's library
      lives on side-branch `wp-054-public-leaderboards-read-only`
      (tip `f34e917`) and must merge to `main` first, with its own
      catalog-update commit per D-11804 adding three
      `Library-only` rows for `getScenarioLeaderboard`,
      `getPublicScoreByReplayHash`, `listScenarioKeys`. The
      `EC-054:` commits already on `main` (`a973c19`, `eb23c47`)
      are the parGate-seam TODO + governance close — they do NOT
      ship the library code.
- [ ] WP-054 contract verified post-merge:
      `apps/server/src/leaderboards/leaderboard.{types,logic}.ts`
      exist on `main` and export `getScenarioLeaderboard`,
      `getPublicScoreByReplayHash`, `listScenarioKeys`,
      `PRODUCTION_DEPENDENCIES`, `LeaderboardDependencies` — if
      any export missing post-merge, this packet is **BLOCKED**,
      do not stub.
- [ ] WP-051 complete: `createParGate(basePath, parVersion)` returns an object whose `.checkParPublished(scenarioKey)` is the bound 1-arg form
- [ ] WP-053, WP-053a, WP-052, WP-103, WP-004 complete (per WP-115 §Assumes)
- [ ] **WP-118 complete (added in v1.1):**
      `docs/ai/REFERENCE/api-endpoints.md` exists at `main` HEAD
      with the closed-set Status / Auth taxonomies and the three
      `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows at lines
      173–185. Verify with `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Pending: WP-115"`
      returning at least three matches.
- [ ] `DATABASE_URL` (or whichever env var `apps/server/src/rules/loader.mjs` already consumes) is set in the local environment
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with
      all post-WP-054 baselines preserved. Reference baselines as
      of 2026-05-01 (per reviewer Patch 6 — only
      `pass/fail/skipped` totals are governance-significant; suite
      counts informational): post-WP-054-merge expected `56 pass /
      0 fail / 24 skipped`; post-WP-115 expected `64 pass / 0
      fail / 24 skipped` (+8 tests / +1 suite delta is the
      load-bearing invariant).
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
      with engine baseline `pass 604 / fail 0` unchanged
      (refreshed in v1.1 from v1.0's stale `570/126/0`; suite
      count informational per Patch 6).

---

## Locked Values (do not re-derive)

All items below must match WP-115 §Locked contract values verbatim.

- **Endpoint paths (3, in this registration order):** `GET /api/leaderboards/scenarios`, `GET /api/leaderboards/scenarios/:scenarioKey`, `GET /api/leaderboards/scores/:replayHash`
- **Route signature (added in v1.1 per Patch 3):** `registerLeaderboardRoutes(router: KoaRouter, database: Pool, parGate: ParGate, leaderboardLogic?: LeaderboardLogic): void`. The fourth parameter is a **test-only injection seam** that defaults to the imported WP-054 functions when omitted; production callers in `server.mjs` use the three-arg form unchanged. Tests pass a fake `LeaderboardLogic` to sidestep WP-054 SQL-shape mocking.
- **Path-param validation (added in v1.1 per Patch 4):** missing or empty `:scenarioKey` → `400 { error: 'invalid_query', message: 'Scenario key is required.' }`; missing or empty `:replayHash` → `400 { error: 'invalid_query', message: 'Replay hash is required.' }`. Validated in the route layer before any WP-054 call.
- **Query bounds (scenario leaderboard):** `limit` default `25`, min `1`, max `100`; `offset` default `0`, min `0`, max `10000` — out-of-range or non-integer → `400`. **Precedence:** if both are invalid, `400` returns based on the first detected error; ordering not user-significant; tests must not assume an order.
- **Array-value query policy (added in v1.1 per Patch 5):** if `query.limit` or `query.offset` is `string[]` (Koa surfaces duplicate query params as arrays), accept length===1 (treat as that value); reject any other length with `400 { error: 'invalid_query', message: "Query parameter '<name>' must be a single integer." }`. Prevents silent-pick footgun.
- **`PRODUCTION_DEPENDENCIES` non-use:** Handlers must inject `{ checkParPublished: parGate.checkParPublished }` explicitly at every call site; relying on WP-054's `PRODUCTION_DEPENDENCIES` default would fail-close every scenario response.
- **Status code domain:** exactly `{200, 400, 404, 500}` — no other values permitted
- **Error envelopes (locked shapes):** `400` → `{ "error": "invalid_query", "message": <sentence> }`; `404` → `{ "error": "score_not_found" }`; `500` → `{ "error": "internal_error" }`. No stack trace, no SQL state, no exception text in any body.
- **Cache header (expanded per Patch 8 in v1.1):** every response sets `Cache-Control: no-store` first, before status/body assignment — **including 400 / 404 / 500 error paths**. The `koaContext.set(...)` call MUST be the first statement in every handler body so a thrown WP-054 exception leaves the header set on the eventual 500 response. Test #8 asserts the header on at least one error path (400 from test #5) in addition to success paths.
- **Pool sizing:** `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000` — no env-var override in this packet
- **Pool-construction log (downgraded per Patch 9 in v1.1):** SHOULD live in `apps/server/src/server.mjs` after the `createPool()` call (keeps `database.ts` pure of console output); this is a debuggability aid, not a hard invariant. The hard `must` invariant is the static-grep "exactly one `new Pool(...)` call across `apps/server/src/`".
- **Empty-leaderboard semantics:** PAR-missing or no-eligible-scores → `200` with `entries: []` (NEVER `404`); only `getPublicScoreByReplayHash` translates `null` → `404`
- **`legendary.*` namespace** — no new tables, no migrations

---

## Guardrails

- Wiring only — no scoring, no replay re-execution, no validation beyond query-string parsing
- Exactly one Pool construction across `apps/server/src/` (one call to the Pool constructor in `apps/server/src/db/database.ts`); per-request Pool creation is a known anti-pattern and forbidden
- No new npm dependencies — no `koa-ratelimit`, `koa-bodyparser`, `express`, `fastify`, `cors`, `axios`, `node-fetch`; Koa router is reached structurally via local `KoaRouter` interface (mirrors WP-102 PS-1)
- No write paths anywhere in scope (no `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `ALTER`)
- No authentication, no Hanko reference, no auth-broker session check; routes are anonymous
- No exposure of `accountId`, `submissionId`, `email`, `authProvider`, `authProviderId`, `stateHash`, `scoreBreakdown` in any response body (D-5201)
- No engine runtime import; no `boardgame.io` import in `leaderboard.routes.ts` or `database.ts`
- WP-054 contract files (`leaderboard.types.ts`, `leaderboard.logic.ts`) locked — do not modify
- WP-102 contract files (`profile.routes.ts`, `profile.logic.ts`) locked — and per D-10202, WP-102's profile route adapter MUST NOT be invoked from `server.mjs` in this packet (verify-grep: `Select-String -Path apps\server\src\server.mjs -Pattern registerProfileRoutes` returns no matches)
- No rate limiting, no response caching, no CORS list changes — all explicitly deferred per WP-115 §Out of Scope
- Pool close is owned by `index.mjs` SIGTERM path (after HTTP graceful shutdown), never by a handler

---

## Required `// why:` Comments

- `createPool` in `database.ts`: single long-lived Pool is the required pattern per `00.3 §8 Backend`; per-request Pools exhaust connections and lose checkout semantics
- Locked Pool sizing in `database.ts`: defaults sized for a Render starter instance; production tuning is a future WP
- File-level on `leaderboard.routes.ts`: thin Koa adapter; all leaderboard logic lives in `leaderboard.logic.ts` per WP-054
- Handler 1 (`/api/leaderboards/scenarios`): exposes the canonical scenario-key list so clients enumerate available leaderboards without prior registry knowledge
- Handler 2 explicit `deps` injection: production caller binds `parGate.checkParPublished` rather than rely on `PRODUCTION_DEPENDENCIES` (which fail-closes to `null` by design)
- Pool lifecycle (`server.mjs` + `index.mjs`): lifetime is process lifetime; `parGate` is now bound (no longer dangling); pool close happens only after the HTTP server's `close()` callback or promise resolves so no in-flight handler is severed mid-query

---

## Files to Produce

- `apps/server/src/db/database.ts` — **new** — `createPool` + `closePool` over `pg.Pool`, locked sizing
- `apps/server/src/leaderboards/leaderboard.routes.ts` — **new** — Koa adapter for WP-054's three helpers + pagination parser
- `apps/server/src/leaderboards/leaderboard.routes.test.ts` — **new** — 8 logic-pure tests in one `describe('leaderboard routes (WP-115)', …)` block
- `apps/server/src/server.mjs` — **modified** — construct pool, bind `parGate`, register leaderboard routes, return `{ appServer, pool }`
- `apps/server/src/index.mjs` — **modified** — call `closePool(pool)` in SIGTERM after HTTP graceful shutdown
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** (added in v1.1, resolved per Patch 7) — **transition** WP-054's three `Library-only` rows wholesale to `Wired` rows (single-row graduation per the catalog footer; `Path` populated for the HTTP surface; `Authorizing WP` flips to `WP-115`); **delete** the three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows (forward-references resolved by the graduations). Per D-11804 replace-whole-row merge semantics — no in-row column edits; net delta −3 Pending / −3 Library-only / +3 Wired.

Plus governance close-out in the same commit (per the recent
WP-122 / WP-123 / WP-124 / WP-125 precedent — ledger updates land
in the same commit as the production files):
`docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-115NN entries),
`docs/ai/work-packets/WORK_INDEX.md` (WP-115 row checked off),
`docs/ai/execution-checklists/EC_INDEX.md` (EC-119 row flipped
Draft → Done).

---

## After Completing

- [ ] All WP-115 §Acceptance Criteria pass (binary)
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with all pre-existing baselines preserved plus the 8 new leaderboard route tests in 1 new `describe` suite
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with engine baseline unchanged
- [ ] `Select-String -Path apps\server\src -Pattern "new Pool\(" -Recurse` returns exactly 1 match (in `db/database.ts`)
- [ ] `Select-String -Path apps\server\src\leaderboards\leaderboard.routes.ts -Pattern "accountId|submissionId|email|authProvider|stateHash|scoreBreakdown"` returns no matches
- [ ] `Select-String -Path apps\server\src\leaderboards\leaderboard.routes.ts,apps\server\src\db\database.ts -Pattern "from .['\"]boardgame\.io|@legendary-arena/game-engine|requireAuthenticatedSession|hanko|jwt"` returns no matches
- [ ] `Select-String -Path apps\server\src\server.mjs -Pattern registerProfileRoutes` returns no matches (D-10202 deferral preserved)
- [ ] `Select-String -Path apps\server\package.json -Pattern "express|fastify|cors|koa-ratelimit|koa-bodyparser|axios|node-fetch"` returns no matches
- [ ] `git diff apps/server/src/leaderboards/leaderboard.types.ts apps/server/src/leaderboards/leaderboard.logic.ts apps/server/src/profile/` returns no changes
- [ ] `git diff --name-only` lists only the 6 production / reference files in §Files to Produce plus the 4 governance ledgers (STATUS / DECISIONS / WORK_INDEX / EC_INDEX) — exactly 10 files at session close
- [ ] `STATUS.md` updated; `DECISIONS.md` updated (Pool location, sizing rationale, rate-limit deferral, `Cache-Control: no-store` for v1, profile-route wiring still deferred, **D-11804 replace-whole-row semantics applied to the catalog rows** added in v1.1); `WORK_INDEX.md` WP-115 row checked off; `EC_INDEX.md` EC-119 row flipped Draft → Done

### API Catalog (per `00.3 §21` + D-11804 — added in v1.1, resolved per Patch 7)
- [ ] WP-054's three `Library-only` rows transitioned wholesale to `Wired` rows (single-row graduation per the catalog footer). `Status` flips `Library-only` → `Wired`; `Method` `(n/a)` → `GET`; `Path` `(n/a — function …)` → the locked endpoint path; `Auth` `(n/a — caller-injected …)` → `guest`; `Authorizing WP` flips to `WP-115`. Confirmed with `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "getScenarioLeaderboard|getPublicScoreByReplayHash|listScenarioKeys"` returning matches only inside `Wired` rows (not `Library-only` rows).
- [ ] The three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows previously at lines 173–185 of `api-endpoints.md` are **deleted** (forward-references resolved by the graduations above; retaining them would duplicate the surface entries). Confirmed with `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Pending: WP-115"` returning no matches.
- [ ] Net catalog row delta: −3 `Pending` rows, −3 `Library-only` rows for these functions, +3 `Wired` rows for the three endpoints. End state: exactly three rows describing the leaderboard surface, all in the `## Wired` section.
- [ ] `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/leaderboards/scenarios"` returns at least two matches (the two scenario endpoints in their new `Wired` rows).
- [ ] `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/leaderboards/scores"` returns at least one match.
- [ ] Manual review: every transitioned row's `Status` column carries exactly one of `Wired | Shipped-but-unwired | Library-only | Pending` (closed set per D-11804); `Auth` column carries exactly `guest` per D-9905; field names in `Request Schema` / `Response Schema` columns match `00.2-data-requirements.md` exactly (`replayHash`, `scenarioKey`, `accountId` (negative — never appears in any response body), etc.); `Authorizing WP` column names `WP-115`.
- [ ] No partial-column updates: each transitioned row's preceding row in `git diff` is a complete-row deletion + complete-row insertion, never an in-row column edit (per D-11804 replace-whole-row merge semantics).

---

## Common Failure Smells

- Pool constructor invoked more than once across `apps/server/src/` → request-scoped or duplicate Pool slipped in; consolidate to `database.ts`
- `server.mjs` invokes WP-102's profile route adapter → "while I'm here" violation of D-10202; revert and let the follow-up WP own that wiring
- `koa-ratelimit`, `cors`, `express`, or `fastify` appears in `package.json` → forbidden dep slipped in; remove and defer to a future hardening WP
- Status confusion: empty scenario leaderboard returns `404` (handler must pass WP-054's empty result through as `200` with `entries: []`); OR `getPublicScoreByReplayHash` returns `200` with `null` body (must translate `null` → `404` with the locked envelope)
- `Cache-Control` header missing on any path → caching contract broken; the header must be set before status/body in every handler
- Information leak: any never-expose field (`accountId`, `submissionId`, `email`, `authProvider`, `authProviderId`, `stateHash`, `scoreBreakdown`) appears in a response body, OR a `500` body contains exception text / stack trace / SQL state — D-5201 violation; the locked `500` envelope is `{ "error": "internal_error" }` only
- `limit=0`, `limit=101`, or negative `offset` returns `200` → bounds check missing in `parsePaginationQuery`
- `pool.end()` called from inside a route handler → lifecycle owned by `index.mjs`, never by handlers
- `LeaderboardDependencies` left at `PRODUCTION_DEPENDENCIES` default → handler 2 will see `null` PAR and fail-close every scenario; explicit `deps: { checkParPublished: parGate.checkParPublished }` is required
- `apps/server/src/leaderboards/leaderboard.logic.ts` not present at execution time → WP-054 has not merged to `main`; the `EC-054:` commits already on `main` (`a973c19`, `eb23c47`) are governance-only. Run the §Before Starting verification command (`git ls-tree -r --name-only HEAD apps/server/src/leaderboards/leaderboard.logic.ts`); if it returns no output, STOP and surface the merge gap. Do NOT stub the WP-054 library inline — that's a §21 + Layer Boundary violation rolled into one
- `docs/ai/REFERENCE/api-endpoints.md` not modified in the same commit as the route registration → D-11804 same-commit constraint violated. The catalog file MUST appear in `git diff --name-only` alongside the five production files; absence is a §21 FAIL
- `Pending: WP-115` rows still present in `api-endpoints.md` post-execution → the wholesale-replacement step was skipped or did a partial-column update. D-11804 replace-whole-row semantics require a complete deletion-and-reinsertion of each affected row; in-row edits are FAIL
- Catalog row's `Status` column carries something other than `Wired | Shipped-but-unwired | Library-only | Pending` → closed-set FAIL per `00.3 §21.2`. Common drift: `Live`, `Active`, `Online`, `Implemented` — none of these are valid; only the four locked values
- Catalog row's `Auth` column carries something other than `guest | handle-required | authenticated-session-required` → closed-set FAIL per D-9905. Common drift: `anonymous`, `none`, `public` — none of these are valid; only the three locked values. WP-115's three endpoints are all `guest`
- Test file imports WP-054 functions and mocks `database.query(...)` to return canned rows → reviewer Patch 3 missed; the test suite is now coupled to WP-054's SQL row shape and will churn whenever WP-054 internals change. Re-thread the tests through the optional `leaderboardLogic?` injection seam (4th parameter of `registerLeaderboardRoutes`) — pass a fake `LeaderboardLogic` whose three methods return canned results, removing all `database.query` mock setup
- Handler accepts `params.scenarioKey === undefined` and passes through to WP-054 → returns 500 on the WP-054 side instead of the locked 400. Path-param validation (Patch 4) MUST happen in the route layer before any WP-054 call site
- Pagination parser silently picks one value when given `?limit=10&limit=20` → array-value policy (Patch 5) missed; the parser must reject `string[]` of length ≠ 1 with the locked invalid_query envelope
- Cache-Control header set only on success paths, missing from 400/404/500 responses → Patch 8 expanded the lock; the `koaContext.set(...)` call MUST be the first statement in every handler body, before any status assignment, body assignment, or `await`. Test #8 should fail on this regression
- API catalog ends up with 6 rows (3 Wired endpoints + 3 still-`Library-only` for the same functions) → Patch 7 interpretation lock missed. The single-row graduation model means the `Library-only` rows ARE the rows that transition; they're not duplicated. Net delta: −3 Pending, −3 Library-only, +3 Wired
- API catalog still carries `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows post-execution → the deletion step from Patch 7 was skipped. The `Pending` rows were forward-references for the network surface; they become redundant once the surface exists in `## Wired` and MUST be deleted
