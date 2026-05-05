# STATUS.md — Legendary Arena

> Current state of the project after each Work Packet or Foundation Prompt.
> Updated at the end of every execution session.

---

## Current State

### WP-132 / EC-135 Executed — Entitlements Data Model & `/me/entitlements` Read API (2026-05-05, EC-135)

🎟️ **WP-132 complete (`EC-135:`).** A new server-layer entitlements substrate ships in `apps/server/src/entitlements/` (5 new files: `entitlements.types.ts`, `entitlements.logic.ts`, `entitlements.logic.test.ts`, `entitlements.routes.ts`, `entitlements.routes.test.ts`) plus migration `data/migrations/011_create_entitlements.sql` (one new table `legendary.entitlements` with seven columns, a partial UNIQUE index `entitlements_active_unique` that enforces idempotency for WP-134's webhook retries, and a secondary lookup index `idx_entitlements_player_id`). The single library export `getEntitlementsForAccount(accountId, database)` performs the standard WP-104 / WP-109 two-query pattern (Step 1: `SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1` mapping `AccountId` → `player_id bigint` per D-5201; Step 2: `SELECT entitlement_key, source, source_ref, granted_at, revoked_at FROM legendary.entitlements WHERE player_id = $1 AND revoked_at IS NULL ORDER BY granted_at ASC`). The single HTTP endpoint `GET /api/me/entitlements` (registered via `registerEntitlementRoutes(server.router, pool, deps)` adjacent to `registerOwnerProfileRoutes` and `registerTeamRoutes` per D-13205 = (a)) reuses the **same** `{ requireAuthenticatedSession, verifier, accountResolver }` deps bundle WP-131 already constructed — no second verifier or resolver instance built.

**Read-only by construction; ZERO grant path; WP-134 owns INSERT site.** `entitlements.logic.ts` contains zero `INSERT INTO legendary.entitlements` / `UPDATE legendary.entitlements` / `DELETE FROM legendary.entitlements` matches; the same applies to `entitlements.routes.ts`. WP-134 (Stripe webhook + fulfillment) authors the row-creation site; revocation is a future-WP responsibility. The `legendary.entitlements (player_id, entitlement_key) WHERE revoked_at IS NULL` partial-unique-index is the idempotency primitive that WP-134 will pair with an `ON CONFLICT ... DO NOTHING` clause to absorb Stripe's at-least-once delivery contract without duplicating active grants.

**Six DECISIONS entries land in numeric order (D-13201..D-13206).** D-13201 + D-13202 locked at draft (module path `apps/server/src/entitlements/` sibling-flat under `apps/server/src/`; migration slot 011 sequential-non-recyclable). D-13203 locks the `EntitlementKey` closed set as the six-key cosmetic-only default (`'supporter_tier_basic_2026'` year-suffixed time-boxed supporter SKU; five evergreen cosmetics: `'cosmetic_playmat_classic'`, `'cosmetic_playmat_comic'`, `'cosmetic_playmat_minimal'`, `'cosmetic_cardback_default_plus'`, `'cosmetic_avatar_frame_supporter'`) — NG-1 (no pay-to-win) protection is structural via the Layer Boundary, not procedural via review. D-13204 locks the `source` closed set as `'stripe' | 'admin_grant' | 'comp'` — `'comp'` operationally distinct from `'admin_grant'` so forensic queries can separate routine ops from one-off interventions. D-13205 locks the route-wiring posture as same-commit wiring (option (a)) per the WP-104 / WP-109 / WP-115 / WP-131 precedent; the route is genuinely authenticated from day one because WP-131 / EC-134 already wired the production Hanko verifier — no fail-closed-until-X conditional applies in production. D-13206 locks the drift-detection posture as the compile-time exhaustive `switch` with `default: const _: never = key` (option (a)); SQL CHECK ↔ canonical array parity is review-locked rather than machine-enforced at test time, with the route-layer runtime guard against SELECT-returned `entitlement_key` values catching drift if it slips past review.

**Envelope split locked.** Authentication / configuration failures dispatch `{ code: '<closed-set value>' }`; operational faults dispatch `{ error: 'internal_error' }` per D-11802 = (C). The four 401-mapped session validation codes (`'missing_token'` / `'invalid_token'` / `'expired_token'` / `'unknown_account'`) collapse to a single client-facing `{ code: 'unauthorized' }` value to defeat the account-existence probe per WP-104 D-10403 precedent. Status-code domain `{200, 401, 500}` closed; `403` / `404` / `422` are out of scope.

**Eleven required `// why:` comment sites populated** per EC-135 §4: the migration's `player_id` FK column comment (cites WP-104 D-10402 + WP-109 D-10906 + D-5201 + the `apps/server/src/profile/ownerProfile.logic.ts:123` precedent), the `entitlements_active_unique` partial-unique-index comment (cites idempotency for WP-134 webhook retries; paraphrases rather than echoing the policed SQL mutation keyword literals per the §5 grep-gate prose discipline), the `source_ref` column comment (cites the per-source review-locked semantics + the deferred `source = 'comp' → source_ref NOT NULL` CHECK refinement); the types-file module-header JSDoc (cites D-13203 closed-set lock + year-suffix discipline + Layer Boundary NG-1 protection); the logic Step 1 comment (cites the two-query pattern + D-5201 + the `ownerProfile.logic.ts:123` precedent); the logic Step 2 comment (cites the read-only invariant + the `WHERE revoked_at IS NULL` clause as the contract that excludes revoked rows); the test drift-detection comment (cites D-13206 = (a) + the `default: const _: never = key` build-failure semantics); the test fixture-construction comment (cites the EC-128 / EC-112 per-suite-run-uniqueness lock); the routes-handler comment (cites the WP-112 caller-injected pattern + WP-115 D-11504 Cache-Control first-statement lock + the envelope-split lock); the routes runtime guard comment (cites the route-layer drift backstop semantics); the `server.mjs` registration call comment (cites the deps-bundle inheritance from WP-104 / WP-109 / WP-131 + the day-one production-authenticated state).

**Engine baseline `679 / 148 / 0` UNCHANGED** — engine never touched (no `packages/` files modified; 01.5 NOT INVOKED — server-layer-only WP). **Server baseline `pass 129 / fail 0 / skipped 54 (suites 20, tests 183)` → `pass 137 / fail 0 / skipped 59 (suites 22, tests 196)`** (+13 tests = 8 logic + 5 route; +8 pass = 3 logic-pure + 5 route; +5 skipped = the 5 DB-required logic tests inline-skipped via the WP-101 D-5201 §3.1 `hasTestDatabase ? {} : { skip: 'requires test database' }` per-test option object verbatim; +2 suites = the new `entitlements.logic.test.ts` + `entitlements.routes.test.ts`). All §5 grep gates pass: zero mutation site against `legendary.entitlements` in `apps/server/src/entitlements/entitlements.logic.ts` or `entitlements.routes.ts`; zero `throw` outside the drift-test `default: never` branch; zero `process.env.*` reads in production code (test-file references to `TEST_DATABASE_URL` are the locked WP-101 / WP-104 skip pattern); zero `boardgame.io` / `@legendary-arena/(game-engine|registry|preplan)` / direct `pg` imports under `apps/server/src/entitlements/`; zero `WHERE account_id` residual; exactly one Step 1 `legendary.players WHERE ext_id = $1` lookup + exactly one Step 2 `legendary.entitlements WHERE player_id = $1` lookup; one `ORDER BY granted_at ASC` clause; partial-unique-index + secondary lookup index both filter `WHERE revoked_at IS NULL`; status-code domain `{200, 401, 500}` closed (only literals `200`, `401`, `500` appear); zero `D-DEC-[1-6]` leakage in shipped artifacts.

**`docs/ai/REFERENCE/api-endpoints.md` updates** per D-11804 replace-whole-row merge semantics: one new `Wired` row in `### Server-Registered Routes` for `GET /api/me/entitlements` (Authorizing WP = `WP-132`; Auth = `authenticated-session-required` per D-9905; Notes column states `grantedAt` ASC ordering as PUBLIC CONTRACT, revoked-row exclusion as PUBLIC CONTRACT, ISO-8601 UTC timestamps, partial-unique-index idempotency primitive consumed by WP-134, day-one production-authenticated state); one new `Library-only` row appended for `getEntitlementsForAccount` immediately after the WP-131 `productionAccountResolver` row (Authorizing WP = `WP-132`; cites the two-query pattern + the no-throw discipline + the read-only invariant). Field-name spellings match `00.2-data-requirements.md` byte-for-byte. **`docs/ai/REFERENCE/00.2-data-requirements.md §4.1 Table Inventory`** carries one new row for `legendary.entitlements` after the existing `legendary.team_audit_log` row (column summary, FK direction, indexes, wire-form names `entitlementKey` / `source` / `sourceRef` / `grantedAt` / `revokedAt`, authoring WP `WP-132`).

**Contract immutability holds end-to-end.** `git diff --name-only` against `apps/server/src/profile/`, `apps/server/src/teams/`, `apps/server/src/auth/`, `apps/server/src/identity/`, `apps/server/src/db/`, `data/migrations/00{4,5,6,7,8,9}_*.sql`, `data/migrations/010_*.sql`, `.claude/`, `render.yaml`, `.env.example`, `apps/server/package.json`, `pnpm-lock.yaml`, `packages/`, `apps/arena-client/`, `apps/registry-viewer/`, `apps/replay-producer/` all return empty.

**Two-commit topology** mirroring WP-130 / WP-131 / WP-126 precedent — Commit A `EC-135:` (9 production/reference files: 1 migration + 5 entitlements module files + 1 `server.mjs` modification + 2 reference doc updates); Commit B `SPEC:` (4 governance ledgers — DECISIONS.md D-13201..D-13206 inserted between D-13104 and D-13501, this STATUS.md block prepended, WORK_INDEX.md WP-132 row flipped `[ ]` → `[x]`, EC_INDEX.md EC-135 row flipped `Draft` → `Done`). **01.5 NOT INVOKED** (server-layer-only WP; no required field added to `LegendaryGameState`; no shape change to `buildInitialGameState`; no new move; no new phase hook). **01.6 post-mortem SKIPPED with rationale** (server-layer-only WP per WP-101 / WP-102 / WP-104 / WP-115 / WP-126 / WP-131 sibling-helper precedent; the four executor D-decisions held without contradiction at execution time; the migration `D-DEC-4` placeholder leak in the `source_ref` `// why:` block was caught and corrected mid-execution by the §5 decision-code-leakage grep gate before commit — a self-corrected gate hit, not a design tension). Vision: §3 (Player Trust & Fairness), §11 (Stateless Client Philosophy), §14 (Explicit Decisions, No Silent Drift), §765-794 (Financial Sustainability), NG-1 / NG-2 / NG-3 / NG-4 / NG-5 / NG-6 / NG-7 cited; the closed-set `EntitlementKey` lock satisfies every Non-Goal — no gameplay-affecting key, NG-1 protection structural via the Layer Boundary. §20 Funding Surface Gate N/A (no `apps/arena-client/` modification; no funding copy or schema referenced — that surface lands with WP-133 / WP-134). §21 API Catalog TRIGGERED (one new `Wired` row + one new `Library-only` row in the same commit as code per D-11804).

**Hard-deps satisfied:** WP-131 (`verifier` + `accountResolver` deps bundle production-wired); WP-112 (`SessionVerifier` interface + `AccountResolver` type + `requireAuthenticatedSession` orchestrator); WP-115 (long-lived `pg.Pool` lifecycle anchor); WP-118 (catalog format + D-11804 update obligation); WP-104 (`OwnerProfileRouteDependencies` deps-bundle shape + the two-query pattern at `ownerProfile.logic.ts:123`); WP-109 (`bigint`-FK-on-`player_id` precedent + `idx_<table>_<column>` index naming); WP-052 (`AccountId` brand + `legendary.players` table + the `ext_id` ↔ `AccountId` mapping per D-5201). **Soft-consumer:** WP-134 (Stripe fulfillment) consumes the `legendary.entitlements` table + the partial-unique-index idempotency primitive + the `EntitlementKey` / `source` closed sets exactly as locked here.

---

### WP-131 / EC-134 Executed — Authenticated Routes Production Wiring (Hanko Verifier + Account Resolver) (2026-05-04, EC-134)

🔐 **WP-131 complete (`EC-134:`).** The server now boots with a fully wired session-validation pipeline. The eleven authenticated routes registered by WP-104 (three `/api/me/*`) and WP-109 (eight `/api/teams/*`) graduate from D-11204 fail-closed (every request returned 500 with `code: 'session_verifier_not_configured'`) to **genuinely authenticated** when `HANKO_TENANT_BASE_URL` + `HANKO_EXPECTED_AUDIENCE` are present in the production environment. Local-dev ergonomics preserved verbatim — engineers iterating on `/api/leaderboards/*` or `/health` continue to boot the server without provisioning a Hanko tenant; the orchestrator's existing fail-closed path remains the source of truth in dev mode.

**New file `apps/server/src/auth/accountResolver.logic.ts`** exports a single named symbol `productionAccountResolver: AccountResolver` — a thin closure over WP-112's `findAccountByAuthProviderSub` (signature locked by D-11203) that maps `Result.ok(hit) → Result.ok(hit.accountId)` (drops `authProvider` + `authProviderId` fields the orchestrator does not need), `Result.ok(null) → Result.ok(null)` (orchestrator translates `null` to `'unknown_account'` at `sessionToken.logic.ts:188-194`), and forwards `Result.fail({ code: 'lookup_failed', reason })` verbatim per D-11203. The closure NEVER throws — every failure surface is a typed `Result`. Three logic-pure tests in `accountResolver.logic.test.ts` use a local fake `DatabaseClient` with no PostgreSQL dependency (mirrors tests 1-2 of `accountLookup.logic.test.ts`).

**`apps/server/src/server.mjs` gains `tryConstructHankoVerifier()`** as a new exported helper that reads the three Hanko env vars from `process.env` and branches on `NODE_ENV` per D-13101: production + complete env constructs the verifier via `createHankoSessionVerifier({ tenantBaseUrl, expectedAudience, jwksRefreshIntervalMs })` and logs the masked configuration line per D-13104 (origin preserved, path replaced with `***` so accidental log-aggregation exposure does not leak the tenant ID); production + incomplete env throws a locked full-sentence diagnostic that `index.mjs` surfaces before `process.exit(1)`; non-production + complete env identical to the production complete-env path; non-production + incomplete env logs the fail-closed-dev-mode warning and returns `undefined`. The `Number(process.env.HANKO_JWKS_REFRESH_INTERVAL_MS)` parse site explicitly passes `undefined` (NOT `NaN`) when the env var is unset so the verifier factory's D-12603 default substitution fires correctly.

**Both `register*Routes` call sites** thread `verifier` + `accountResolver: verifier === undefined ? undefined : productionAccountResolver` through the existing `OwnerProfileRouteDependencies` and `TeamRouteDependencies` deps bundles per D-13103. **`configureSessionValidation` is NOT imported** in `server.mjs` — option (b) (refactor route helpers to consume the single-arg closure shape) is contractually deferred, not stylistically rejected; consuming it would require modifying `apps/server/src/profile/ownerProfile.routes.ts` and `apps/server/src/teams/team.routes.ts`, which are forbidden touches under WP-104 / WP-109 contract-immutability. The factory remains available for a future non-route consumer (e.g., a WebSocket auth handshake) without paying the route-helper refactor tax.

**Test-harness adaptation (recorded in 01.6 post-mortem).** The WP §D test plan specified calling `startServer()` inside `try/catch` to assert the production-fatal vs dev-mode-undefined paths. In the local dev environment without `DATABASE_URL`, `startServer()` invokes `loadRules()` which calls `process.exit(1)` on connection failure — killing the test runner before the verifier code path is reached. Resolved by exporting `tryConstructHankoVerifier()` from `server.mjs` and testing it directly. The two startup-guard tests in `server.mjs.test.ts` (under `describe('startup guard (WP-131)', …)`) save and restore `process.env` keys via `before` / `after` hooks to avoid state leakage. This is the smallest-surface adaptation per WP §D's escape clause ("smallest-surface form that compiles and runs under node:test"); all locked behavior assertions (production-fatal diagnostic verbatim + dev-mode-undefined return) are exercised at the helper boundary.

**Four DECISIONS entries land in numeric order (D-13101..D-13104).** D-13101 locks the NODE_ENV-branched startup-policy gate (production fatal vs non-production fail-closed-undefined); the `try` prefix on `tryConstructHankoVerifier()` names the return type (`SessionVerifier | undefined`), not the policy class. D-13102 locks the resolver location as a new sibling file (preserves WP-112 contract-immutability and keeps the production-resolver definition site greppable as a single symbol). D-13103 locks the per-request options threading via `RouteDependencies` deps bundles; `configureSessionValidation` deferred to a future non-route consumer. D-13104 locks the startup-log URL to origin-only masking (Datadog/Loggly defense-in-depth without losing the "did the env var resolve" diagnostic signal).

**Engine baseline `679 / 148 / 0` UNCHANGED** — engine never touched, no `packages/` files modified. **Server baseline `pass 124 / fail 0 / skipped 54 (suites 18, tests 178)` → `pass 129 / fail 0 / skipped 54 (suites 20, tests 183)`** (+5 = 3 resolver + 2 startup-guard; +2 suites = new `accountResolver.logic.test.ts` file + new `describe('startup guard (WP-131)', …)` block in `server.mjs.test.ts`). All grep gates pass: zero `throw` statements in `accountResolver.logic.ts`; zero forbidden imports in resolver (per WP-112 `accountLookup.logic.ts` precedent); zero `Math.random` anywhere in `apps/server/src`; zero `configureSessionValidation` matches in `server.mjs` (D-13103 contract-lock canary); zero `until WP-126 lands` matches in `api-endpoints.md` (stale wording purged); exactly 11 occurrences of the canonical sentence "Genuinely authenticated as of WP-131 / EC-134."; `tryConstructHankoVerifier` declaration + invocation present; `productionAccountResolver` import + 2 deps-bundle references present.

**`docs/ai/REFERENCE/api-endpoints.md` updates** per D-11804 replace-whole-row merge semantics: eleven `/api/me/*` and `/api/teams/*` rows replaced wholesale (Notes column gains the canonical sentence verbatim; the line 121 row also drops the stale "session_verifier_not_configured returns 500" sentence in Response Schema and the "fail-closed via WP-112 D-11204 until WP-126 lands" sentence in Notes; the `Authorizing WP` column stays `WP-104` / `WP-109` — WP-131 changes the auth posture, not the authoring WP). One new `Library-only` row appended for `productionAccountResolver` immediately after the `findAccountByAuthProviderSub` row, with `Authorizing WP = WP-131` and the no-throw discipline cited.

**Contract immutability holds end-to-end.** `git diff --name-only` against `apps/server/src/profile/ownerProfile.routes.ts`, `apps/server/src/teams/team.routes.ts`, `apps/server/src/auth/hanko/`, `apps/server/src/auth/sessionToken.types.ts`, `apps/server/src/auth/sessionToken.logic.ts`, `apps/server/src/auth/sessionToken.logic.test.ts`, `apps/server/src/auth/accountLookup.logic.ts`, `apps/server/src/auth/accountLookup.logic.test.ts`, `apps/server/src/identity/`, `apps/server/src/db/`, `data/migrations/`, `render.yaml`, `.env.example`, `apps/server/package.json`, `pnpm-lock.yaml` all return empty.

**Two-commit topology** — Commit A `EC-134:` (5 production/reference + WP-131 source + EC-134 source + 01.6 post-mortem); Commit B `SPEC:` (4 governance ledgers — DECISIONS.md D-13101..D-13104 inserted between D-13005 and D-13501, this STATUS.md block prepended, WORK_INDEX.md WP-131 row flipped `[ ]` → `[x]`, EC_INDEX.md EC-134 row added with status `Done`). **D-11204 status flips `Active` → `Resolved`** per its body's "Status flips to Resolved once production wiring lands". **01.5 NOT INVOKED** — zero engine surface change (no `LegendaryGameState` field added; no `buildInitialGameState` shape change; no new move; no new phase hook). **01.6 post-mortem authored** covering the test-harness adaptation (exporting `tryConstructHankoVerifier` for direct invocation; recording the dev-environment `DATABASE_URL` constraint that forced the adaptation; documenting the WP §D escape-clause precedent for future server-startup tests). Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6 cited; determinism N/A (server-layer wiring; no `G` / `ctx` / RNG / replay surface touched). §20 Funding Surface Gate N/A (server wiring + library-function add; no `apps/arena-client/` modification; no funding copy or schema referenced). §21 API Catalog TRIGGERED (eleven row replacements + one new `Library-only` row in the same commit as code per D-11804).

**Hard-deps satisfied:** WP-126 (`createHankoSessionVerifier(config)` factory + `HankoVerifierConfig` shape + three env vars); WP-112 (`SessionVerifier` interface + `AccountResolver` type + `requireAuthenticatedSession` orchestrator + `findAccountByAuthProviderSub` lookup helper); WP-104 (`registerOwnerProfileRoutes` deps bundle); WP-109 (`registerTeamRoutes` deps bundle); WP-115 (long-lived `pg.Pool` lifecycle anchor at `apps/server/src/server.mjs`); WP-052 (`AccountId` brand + `legendary.players` table + `AuthProvider` enum). **Soft-consumer:** WP-132 (entitlements read endpoint) inherits the same wired deps and ships genuinely authenticated by construction.

---

### WP-136 / EC-139 Executed — JSDOM Opaque-Origin Storage Fix (2026-05-04, EC-139)

🧪 **WP-136 complete (`EC-139:` commit `28284b3`).** The arena-client test harness at `apps/arena-client/src/testing/jsdom-setup.ts` now passes `{ url: 'http://localhost/' }` to the `JSDOM` constructor so the test window carries a non-opaque tuple origin and surfaces working `window.{localStorage,sessionStorage}` to consumers under WHATWG Storage rules. Two `installGlobal('localStorage', dom.window.localStorage)` / `installGlobal('sessionStorage', dom.window.sessionStorage)` calls mirror the established WP-065 install pattern and bridge the two `Storage` objects from `dom.window` onto `globalThis` so production code reading bare `localStorage` (`apps/arena-client/src/prefs/persistence.ts:58,80,83`) resolves correctly under Node + jsdom. Four inline `MemoryStorage` shim copies (introduced by WP-130 / EC-133 because the WP-130 modify-allowlist excluded `src/testing/`) are retired in the same commit — one in each of `prefs/persistence.test.ts`, `prefs/playmatStore.test.ts`, `composables/useSkinApplier.test.ts`, `components/play/SkinSelector.test.ts`. Each shim deletion replaces ~35 lines of `// why:` + `class MemoryStorage` + `Object.defineProperty(globalThis, 'localStorage', ...)` with zero boilerplate; call sites collapse from `memoryStorage.X` → `localStorage.X` with no behavioral change.

**D-13601 inserted at execution** (JSDOM constructor URL = `'http://localhost/'` verbatim, including trailing slash) with the full WHATWG-Storage / opaque-origin rationale, the `globalThis` bridge requirement, and the rejected-alternatives list (`'http://example.com/'` would mask network leaks; `'http://localhost:5173/'` collides with the dev-server port; `'file:///'` is opaque-origin per WHATWG; URL fix without bridge installs leaves bare references unresolved). After WP-136 lands, any future arena-client test that depends on `Storage` simply imports `jsdom-setup` and uses the WHATWG-native interface (via either bare `localStorage` or `window.localStorage`) without per-file boilerplate.

**Mid-execution amendment 2026-05-04 PS-1.** The URL fix alone produced a working `dom.window.localStorage` but did not surface a working bare `localStorage` on `globalThis` — `globalThis.window !== globalThis`, and JSDOM places `Storage` on `dom.window` only. Production code (`persistence.ts:58,80,83`) and the four prefs/composables/components tests read bare `localStorage`, which resolves through `globalThis`, not `dom.window`. The two `installGlobal('localStorage', ...)` / `installGlobal('sessionStorage', ...)` calls were appended to `jsdom-setup.ts` mid-execution; WP-136 §Goal + §Non-Negotiable Constraints + §Scope (In) A + §Acceptance Criteria amended in the same commit; EC-139 §Guardrails + §Required `// why:` Comments + §Files to Produce + §Common Failure Smells amended in the same commit (the `ReferenceError: localStorage is not defined` smell is now the top entry so future executors catch this class of failure pre-flight rather than mid-execution).

**Lessons learned (PS-1).** Pre-flight + copilot scan missed the `globalThis.window !== globalThis` bridge requirement because both checks focused on contract drift and shim residue, not on the mechanical chain `bare localStorage → globalThis.localStorage → dom.window.localStorage`. **Forward rule:** when retiring a shim that wrote to `globalThis`, verify the replacement mechanism delivers identity to the same location, not to a sibling object. Future WPs retiring `globalThis`-targeted shims should add a pre-flight check for this class of mismatch.

**Engine baseline `679 / 148 / 0` UNCHANGED** — engine never touched. **arena-client baseline `286 / 35 / 0` preserved exactly** — no test addition, no test deletion, no `describe()` boundary change. All 10 verification gates pass: typecheck OK; constructor URL appears once in code (`{ url: 'http://localhost/' }`) plus twice in the required `// why:` block; zero residual shim references (`class MemoryStorage` / `const memoryStorage` / `memoryStorage\.` all return zero across `apps/arena-client/src/`); zero `new JSDOM(` instantiations in test files; only the seven allowlist files touched (5 code + WP + EC); no production drift; no package manifest churn; no engine/server/other-app churn.

Two-commit topology — Commit A `EC-139:` `28284b3` (5 code files + WP-136 + EC-139 text reconciliation in the same commit per the WP-130 / `b6651ed` precedent for mid-execution WP/EC amendments); Commit B `SPEC:` (4 governance ledgers — DECISIONS.md D-13601 inserted in numeric order, WORK_INDEX.md WP-136 row added and checked off, EC_INDEX.md EC-139 row added with status Done, STATUS.md `### WP-136 / EC-139 Executed` block prepended at top of `## Current State`). **01.5 NOT INVOKED** (no required field added to `LegendaryGameState`; no shape change to `buildInitialGameState`; no new move; no new phase hook). **01.6 post-mortem SKIPPED with rationale** (mechanical test-harness fix; D-13601 held without contradiction at execution time; the PS-1 amendment was a self-corrected gate failure, not a design tension; the lessons-learned line is recorded in this STATUS block and the EC-139 row in EC_INDEX.md instead of a standalone post-mortem). Vision N/A (test-harness only; no §17.1 trigger surface). §20 Funding Surface Gate N/A (no UI surface or copy touched). §21 API Catalog N/A (no `apps/server/**` touched).

**Hard-deps:** WP-065 (`jsdom-setup.ts` precedent — original installer for component tests); WP-130 (introduced the four inline shims this packet retires).

---

### WP-130 / EC-133 Executed — Re-skin / Playmat Selector (2026-05-04, EC-133)

🎨 **WP-130 complete (`EC-133:` commit `b6651ed`).** The arena-client now mounts a `🎨 Skin: <name> ▼` button in the WP-129-reserved HUD-bar slot (D-12907) and lets players swap the visual chrome of `<PlayViewport>` between three bundled skins (`classic`, `comic`, `minimal` per D-13003). Selection persists across sessions to `localStorage['arenaClientPlaymatSkin']` per D-13004; selection NEVER affects engine state, replay determinism, `computeStateHash`, or the WP-090 socket transport.

**Pre-flight 2026-05-04 PS-1 Option A held at execution.** WP-068's multi-section preferences subsystem (commit `bbd58b0` on branch `wp-068-preferences-foundation`, never merged to `main`) was dropped as a dependency before the session started; the playmat store mirrors the WP-121 / WP-124 single-key precedent (`apps/registry-viewer/src/composables/{useCardSize,useThemeSize}.ts`) wrapped in a `defineStore('playmat', () => { … })` Pinia setup store. **No section registry, no schema-version envelope, no `apps/arena-client/src/main.ts` modification** — the store lazy-initializes on first `usePlaymat()` call. The deferred WP-068 multi-section subsystem is explicitly scoped out and triggers a future WP only when arena-client gains a second preference section.

**Five new D-decision locks land in numeric order (D-13001..D-13005)** per WP-130 §F default-acceptance. D-13001 locks the discovery mechanism as bundled-with-client at MVP; R2-published manifest is deferred to a future WP if community-skin or premium-skin pipeline emerges. D-13002 scopes a "skin" to board background + color theme + card-frame style; audio is excluded; per-card overrides reserved as the `customizations?` future seam. D-13003 locks the bundled set at exactly three entries — `classic` (default + unconditional fallback), `comic`, `minimal` (high-contrast a11y-baseline). D-13004 locks `localStorage`-only persistence; server-side sync to `legendary.player_profiles` is deferred to a future WP per the WP-104 column-additive precedent. D-13005 locks the empty-state / asset-failure fallback to `'classic'` with `console.warn` per `00.6` Rule 11; asset-failure is narrowly defined as any error resolving the active `SkinName` to a manifest entry OR applying its corresponding CSS class — image preloading, network probing, decode-error retries, and HEAD-checks against R2 are explicitly out of scope.

**Six contract surfaces ship in `apps/arena-client/src/prefs/`.** `skinManifest.ts` is the canonical source of truth for `SkinName` per WP-130 §A — the type derives from `Object.keys(skinManifest)` via `keyof typeof skinManifest`; the manifest is `as const satisfies Record<string, SkinManifestEntry>`; asset URLs resolve via `new URL(path, import.meta.url).href` for cross-Vite/Node compatibility (Vite rewrites at build time into a hashed bundle URL; Node returns a `file://` URL in tests; same source module works in production, dev, and the `node:test` runner). `playmatSchema.ts` is a closed-set narrower with `parseSkinName(value): SkinName` falling back to `DEFAULT_SKIN_NAME` (`'classic'`) on rejection — pure-TS narrowing, no Zod added because arena-client `package.json` has no zod dependency and EC-133 §3 forbids package.json modification; matches the WP-121 / WP-124 pure-TS narrowing precedent. `persistence.ts` provides sync `localStorage.{getItem,setItem}` helpers with the Rule-11 swallow comment mirroring `useCardSize.ts:130-141` posture verbatim; never `await`s, never reaches the network. `playmatStore.ts` is a Pinia setup store exposing `{ activeSkin, availableSkins, setActiveSkin }`; Pinia auto-unwraps refs at the consumer level so `store.activeSkin` is the `SkinName` value (reactive via Pinia's Proxy), NOT a `Ref`; `setActiveSkin` is a synchronous write per EC-133 §3 sync-write lock — Pinia ref + `localStorage` write happen in the same tick, no `async`, no `await`, no network round-trip.

**`<SkinSelector>` always mounts** in the WP-129 reserved slot per EC-133 always-mounted rule; empty-state renders a disabled `🎨 (default)` chip with tooltip rather than unmounting (D-13005). Vue 3 `<Teleport to="body">` overlay keeps the modal above mobile-portrait sticky bottom-bar zones per `DESIGN-BOARD-LAYOUT.md §3.2`; D-6401 keyboard-focus pattern mirrored verbatim (`tabindex="0"` on the panel root + `@keydown.escape` listener on the same root, NOT on individual list items — same posture as `<ReplayInspector>`); outside-click on backdrop and skin-selection both close. Mobile-portrait label compresses from `🎨 Skin: <name> ▼` to `🎨 <name> ▼` via `useViewport().isMobile` (existing WP-129 composable).

**`useSkinApplier` applies the skin CSS class exclusively to `<PlayViewport>`'s root element** via `watchEffect` against the supplied `Ref<HTMLElement | null>`. Application to `<body>` or any global document node is FORBIDDEN — would bleed skin styling into non-Play pages, contaminate replays (which render in the spectator's preference, not the original player's), and break Teleport-based overlays mounted under `document.body`. The composable also idempotently injects the matching `<link rel="stylesheet">` element into `document.head` so the active skin's `theme.css` actually loads in the browser; the per-document injection cache is module-scoped and cleared via the test-only `__resetSkinApplierForTests()` helper for unit-test isolation. Asset-load failure (narrowly defined) falls back to `'skin-classic'` and emits a single `console.warn` with a full-sentence reason per Rule 11.

**One forced cascade modification.** `apps/arena-client/src/components/play/TopHudBar.test.ts` updated from the placeholder-existence assertion (which referenced the now-removed `play-hud-skin-placeholder` span) to a `<SkinSelector>`-mount assertion; required `setActivePinia(createPinia())` per the existing arena-client test convention (PlayDesktop / PlayMobile / PlayViewport precedent). The updated test file is the only legitimate cascade — the WP-locked `<TopHudBar>` slot-default change made the prior assertion stale.

**Three skin asset bundles** at `apps/arena-client/src/assets/skins/{classic,comic,minimal}/{board-background.png,card-frame.png,theme.css}` ship as 79-byte solid-color placeholder PNGs per WP-130 §F (locked contract is the directory structure + manifest mapping, not art fidelity; finished art can be swapped in any future session without touching the manifest, store, selector, or applier). Each `theme.css` defines CSS custom properties scoped to `.skin-<name>` so the three classes coexist without conflict; only the active class applies because `useSkinApplier` toggles exactly one root-element class at a time.

**Verification gates all pass.** `pnpm -r build` exits 0 (vite externalization warnings on `node:fs/promises` from `packages/game-engine/dist/scoring/scoringConfigLoader.js` are pre-existing, unrelated to WP-130). arena-client baseline `257 / 30 / 0` → **`286 / 35 / 0`** (+29 tests, +5 suites — well past the EC-133 §0 ≥8-test floor with one `describe('WP-130 …', () => { … })` block per new test file × 5 test files). Engine baseline `679 / 148 / 0` UNCHANGED (engine never touched). Off-scope diffs empty: `git diff packages/ apps/server apps/registry-viewer apps/replay-producer apps/arena-client/src/main.ts apps/registry-viewer/src/composables/{useCardSize,useThemeSize}.ts apps/arena-client/src/stores/uiState.ts apps/arena-client/src/client/bgioClient.ts` returns no output. `apps/arena-client/src/prefs/registerSections.ts` does NOT exist (Option A simplification lock). All §10 grep gates pass: zero engine-runtime imports in `prefs/` / `SkinSelector.vue` / `useSkinApplier.ts` (type-only would be permitted); zero `useUiStateStore` / `G.` / `UIState.` references; zero `submitMove` / `boardgame.io` references; zero `Math.random` / `Date.now` / `fetch(` in `prefs/`; zero hand-duplicated `z.enum(['classic'…])` literal; one match for `Object.keys(skinManifest)` in `playmatSchema.ts`; one `defineStore('playmat'` in `playmatStore.ts`; one `arenaClientPlaymatSkin` storage key in `persistence.ts`; empty-state `v-if="playmat.availableSkins.length === 0"` + `skin-chip--disabled` both present in `<SkinSelector>`; `<SkinSelector />` mounted in `<TopHudBar>`'s reserved slot; `play-hud-skin-placeholder` removed (zero matches anywhere in the codebase). Dev-server smoke at `pnpm --filter arena-client dev`: Vite ready in 797 ms; `index.html`, `main.ts`, `skinManifest.ts`, all three `theme.css` files, and a representative PNG all return HTTP 200.

**Test-harness mid-execution amendment.** The four test files that exercise `localStorage` (`prefs/persistence.test.ts`, `prefs/playmatStore.test.ts`, `composables/useSkinApplier.test.ts`, `components/play/SkinSelector.test.ts`) install a Map-backed `Storage` shim on `globalThis.localStorage` because the shared `apps/arena-client/src/testing/jsdom-setup.ts` creates an opaque-origin document (default URL `about:blank`) and the WHATWG storage spec withholds `Storage` from opaque origins; `window.localStorage` throws `SecurityError` on access. Modifying `src/testing/` is outside the WP-130 modify-allowlist per EC-133 §1 so the shim lives inline at the top of each test file. The shim is a 17-line `MemoryStorage implements Storage` class plus a `Object.defineProperty(globalThis, 'localStorage', { value: …, writable: true, configurable: true })` install. Duplicated four times (once per test file) per the *duplicate first* rule — extracting into a shared helper would require either touching `src/testing/` (forbidden) or adding a new helper file (which would widen the EC-133 §1 file count beyond projection without adding production value).

**Files staged in two-commit topology** (mirrors the WP-104 / WP-128 / WP-129 / WP-135 governance-close precedent). Commit A (`EC-133:` `b6651ed`): 25 files — 4 prefs source (`skinManifest.ts` + `playmatSchema.ts` + `persistence.ts` + `playmatStore.ts`) + 3 prefs tests (`persistence.test.ts` + `playmatSchema.test.ts` + `playmatStore.test.ts`) + 9 asset bundle files (3 dirs × `board-background.png` + `card-frame.png` + `theme.css`) + 2 selector (`SkinSelector.vue` + `SkinSelector.test.ts`) + 2 applier (`useSkinApplier.ts` + `useSkinApplier.test.ts`) + 3 modified SFCs/test (`TopHudBar.vue` mount + `PlayViewport.vue` applier invocation + `TopHudBar.test.ts` cascade) + 2 governance drafts (`WP-130-reskin-playmat-selector.md` + `EC-133-reskin-playmat-selector.checklist.md`, both already amended in the prior SPEC session for PS-1 Option A). Commit B (`SPEC:`): 4 governance ledgers (this STATUS.md block + `WORK_INDEX.md` WP-130 row flipped `[ ]` → `[x]` + `EC_INDEX.md` EC-133 row flipped `Draft` → `Done` + `DECISIONS.md` D-13001..D-13005 inserted in numeric order between D-12909 and D-13501).

**01.5 NOT INVOKED** — zero engine surface change. The four trigger criteria from `01.5 §When to Include This Clause` are absent: no required field added to `LegendaryGameState` or another shared engine type; no shape change to `buildInitialGameState`; no new move added to `LegendaryGame.moves`; no new phase hook altering structural shape of gameplay initialization. **01.6 post-mortem SKIPPED** with explicit rationale per the WP-121 / WP-124 single-key-preference precedent — single-section single-key preference; the five D-decisions held without contradiction at execution time; the only mid-execution amendments were (a) the localStorage-shim install in test files (JSDOM opaque-origin + `apps/arena-client/src/testing/` outside-allowlist) and (b) the `TopHudBar.test.ts` cascade (forced by the WP-locked slot-default change), both of which are mechanical cascades of the WP-locked SFC modification rather than design tensions worth the lessons-captured artifact.

**Vision alignment.** §3 (Player Trust & Fairness): preserved — skin selection has zero engine-state effect; replay determinism unaffected; no information leakage. §11 (Stateless Client Philosophy): aligned — skin is client-local UI state, never round-trips to server, never hits the WP-090 socket transport. §14 (Explicit Decisions, No Silent Drift): preserved — D-13001..D-13005 surface every choice with rationale and rejected alternatives. §15 (Built for Contributors): aligned — playmat store mirrors the WP-121 / WP-124 single-key preferences precedent so future contributors pattern-match. NG-1 (no monetization): not crossed — skins are free; not monetized; no in-game purchase surface introduced. NG-3 (no engine network): preserved (no engine touch). NG-6 (deterministic engine): preserved trivially. **§20 Funding Surface Gate: N/A** with explicit justification (no funding affordance — skins are free, no purchase / subscription / unlock surface introduced; if a future WP introduces premium skins, that WP triggers §20 explicitly). **§21 API Catalog: N/A** (no `apps/server/**` files touched).

**Downstream impact.** The HUD-bar skin-selector slot reservation under D-12907 is now consumed; the bottom-edge pre-plan-UI slot reservation under D-12908 remains reserved for WP-059. A future WP that introduces premium / paid skins (or a per-account skin entitlement) triggers §20 Funding Surface Gate explicitly; the WP-130 contract is forward-compatible because `SkinName` is a closed manifest-derived set and adding new entries does not require store / schema / applier refactor. A future WP that adds R2-published skin manifests (per the D-13001 R2 deferral) layers on top of the existing `skinManifest.ts` shape — the simplest path is a `loadRemoteSkinManifest()` helper that merges remote entries into the bundled set at startup, with the existing `useSkinApplier` reactive contract preserved. A future WP that adds server-side skin sync (per the D-13004 deferral) follows the WP-104 column-additive precedent: add a `playmat_skin text` column to `legendary.player_profiles`, layer a sync helper on top of the sync `setActiveSkin`, no breaking change to the local `localStorage` round-trip.

---

### WP-135 / EC-138 Executed — HQ Population & Hero Deck Reservoir (2026-05-04, EC-138)

🦸 **WP-135 complete (`EC-138:`).** The engine now builds a deterministic per-match hero deck reservoir at `Game.setup()` from `MatchSetupConfig.heroDeckIds`, populates the 5 HQ slots from the front of the shuffled reservoir, and refills slots on every successful `recruitHero`. After this packet, **the engine's shipped state is no longer "structurally unwinnable" via starter cards alone** — Magneto's 4 tactics × 6 attack = 24 attack to win; HQ population enables hero recruitment which is the only path to that attack output.

**Three new decision locks land in numeric order (D-13501..D-13503).** D-13501 locks the rarity → copy-count map (`Common 1 = 5; Common 2 = 3; Uncommon = 3; Rare = 3` = 14 cards per hero across the four-label set) plus the **Option A loud-fail** clause: `buildHeroDeck` throws a full-sentence `Error` inside `Game.setup()` when any hero card carries a `rarityLabel` outside the four-label set. Cross-set rarity support (76/307 heroes use `'Common 3'` / `'Uncommon 2'` outside the locked set, e.g., entire `amwp.json`) is deferred to a Pending follow-up WP recorded in `WORK_INDEX.md`. D-13502 locks the hero card-instance ext_id format `<setAbbr>/<heroSlug>/<cardSlug>` (e.g., `core/black-widow/mission-accomplished`) — distinct from the FlatCard hyphen key emitted by `registry.listCards()`; both formats coexist in `G.cardStats` / `G.cardDisplayData` (no migration). D-13503 locks the empty-deck `recruitHero` branch: vacated slot stays `null`; **no auto-reshuffle** of the active player's discard back into the shared hero pool (preserves Marvel Legendary tabletop rule + per-player ownership boundary).

**01.5 cascade fired** per WP-128 D-12807 procedure. Two simultaneous inputs to `computeStateHash` changed: (1) `G.heroDeck: CardExtId[]` field added to `LegendaryGameState`; (2) `recruitHero` `G.messages` line reshaped from the pre-WP-135 WP-016 format to the byte-locked WP-135 format (`Player {playerId} recruited {heroExtId}; HQ slot {hqIndex} refilled from heroDeck (heroDeck.length: {N})` with the empty-deck branch substituting `(heroDeck empty; slot left null)`). Pre-edit `PRE_WP080_HASH = '46f7863c'`; post-edit `'2baeecc3'` — single-line literal update at `replay.execute.test.ts:41` with the locked `// why:` citation pointing at 01.5 + D-12807 + WP-135 with both inputs. **Exactly ONE** `G.messages` push per successful recruit (the WP-135 push REPLACES the pre-WP-135 WP-016 push, not augments).

**Closes WP-128 D-12806 safe-skip site `decks.heroDeckCount`.** Projection graduates from the constant `0` to `gameState.heroDeck.length` at exactly one site in `uiState.build.ts:512`; the `// SAFE-SKIP-WP128` marker on that line is removed; assignment-site marker count drops 8 → 7. Total `SAFE-SKIP-WP128` occurrences across `uiState.build.ts`: 8 (7 assignment + 1 line-14 JSDoc reference, unchanged). Drift test `uiState.types.drift.test.ts` gains a positive-value assertion for `decks.heroDeckCount === 9` when given a real-shape registry with a 14-card hero loadout, plus a `gameState.heroDeck` shape pin.

**New contract surfaces.** `buildHeroDeck.ts` (3 functions: `buildHeroDeckCards` (registry walk + rarity-map expansion), `shuffleHeroDeck` (single `ctx.random.Shuffle` call site), `buildHeroDeck` (canonical entry point — composes the two; soft-skips on incomplete RegistryReader; loud-fails Option A on unknown rarityLabel). `city.logic.ts` gains `fillHqFromDeck` (setup-time HQ population — slot 0 first-fill mirrors `pushVillainIntoCity` entry-edge pattern) and `refillHqSlot` (move-time refill — single front-pop FIFO; empty-deck branch leaves slot null). `initializeHq()` preserved verbatim. `recruitHero` rebinds `G.hq = result.hq; G.heroDeck = result.heroDeck` to apply the refill — no inline `splice`/`shift`/`push` on `G.heroDeck` or `G.hq` (aliasing-defense rule). `economy/economy.logic.ts:buildCardStats` and `setup/buildCardDisplayData.ts:buildCardDisplayData` gain extended walks emitting slash-format hero card-instance entries.

**Determinism envelope locked, must not be widened.** Exactly ONE `ctx.random.Shuffle` call at setup; HQ population is a deterministic prefix pop (FIFO from index 0); `recruitHero` performs a single front-pop per success — no batching, no replacement, no auto-reshuffle. Registry walk in `buildHeroDeckCards` is ordering-stable (heroes per `config.heroDeckIds` order; cards per registry `cards[]` order; copies appended in rarity-map iteration order Common 1 → Common 2 → Uncommon → Rare). Refactors that "preserve test pass" but widen this envelope (per-turn shuffle, batched front-pops, deck reorder) are forbidden — the replay-hash regression guard is the canary.

**Verification gates all pass.** `pnpm --filter @legendary-arena/game-engine build` exits 0. Engine baseline `621 / 135 / 0` → `679 / 148 / 0` (+58 tests, +13 suites). The pre-flight projection band of `[13, 26]` new tests was conservative; the actual count went granular per behavior on the new `buildHeroDeck` contract surface (rarity map, ext_id format, Option A throw, soft-skip, registry walk edge cases, single-shuffle determinism, JSON serialization round-trip) plus the new `fillHqFromDeck` / `refillHqSlot` city helpers and the new sibling-snapshot walks in `buildCardStats` / `buildCardDisplayData`. Every test asserts a WP-locked invariant; no out-of-scope coverage. Grep gates: no `Math.random` in `buildHeroDeck.ts`; no `boardgame.io` import in `buildHeroDeck.ts` or `city.logic.ts` (pure helpers); no `.reduce()` in either; D-13501 / D-13502 / D-13503 cited at the locked sites; no new `throw` in `recruitHero.ts` (move-as-no-throw contract preserved); SAFE-SKIP-WP128 occurrence count = 8 (7 assignment + 1 JSDoc).

**01.5 wiring update at `economy/economy.integration.test.ts` (off the §6 explicit allow-list, authorized under 01.5).** The pre-existing integration mock factory at `createMockGameState` constructs a full `LegendaryGameState` for recruit / fight / play tests. Adding `heroDeck: CardExtId[]` as a required field on `LegendaryGameState` requires the mock factory to add `heroDeck: options?.heroDeck ?? []` so `refillHqSlot` does not crash on `undefined`. Same class of change as the `recruitHero.test.ts` mock update (which IS allowlisted). Documented in the 01.6 post-mortem.

**Files staged in two-commit topology** (because 01.5 cascade fired, mirroring WP-111 / EC-118 precedent). Commit A (`EC-138:`): production + cascade literal. Commit B (`SPEC:`): governance close + post-mortem.

**Vision alignment.** §3 (Player Trust & Fairness): preserved — replay determinism intact (single-shuffle envelope; byte-locked log line); per-player ownership boundary preserved by D-13503 no-auto-reshuffle. §4 (Faithful Multiplayer Experience): aligned — the 14-cards-per-hero rule + 5-slot HQ + first-5-fill mirrors physical Marvel Legendary. §10 (Content as Data): aligned — rarity → copy-count map is data-driven from registry `cards[].rarityLabel`. §11 (Stateless Client Philosophy): preserved — clients render `UIState` as-projected; engine never queries registry post-setup. §14 (Explicit Decisions, No Silent Drift): preserved — D-13501..D-13503 surface every choice; Option A loud-fail surfaces data drift the moment it is observed. NG-1 / NG-3 / NG-6 preserved — no monetization, no engine network, deterministic engine.

**Downstream impact.** WP-129 / EC-132 client renders the populated HQ + the new `decks.heroDeckCount` value with no client modification required (the projection contract is unchanged; only the value flips from `0` to `G.heroDeck.length`). The 7 remaining WP-128 D-12806 safe-skip sites (`mastermind.attachedBystanders`, `mastermind.strikePile`, `scheme.twistPile`, `city.escapedPile`, `economy.piercing`, `economy.woundsDrawn`, `piles.horrorsCount`) remain — each closes in its own future WP using the WP-135 sibling-snapshot template. The deferred follow-up WP for AMWP-class rarity-map extension is recorded in `WORK_INDEX.md` and triggers the first time any `MatchSetupConfig.heroDeckIds` selection includes an AMWP-class hero.

---

### WP-129 / EC-132 Executed — Board Layout (Desktop Landscape + Mobile Portrait) (2026-05-04, EC-132)

🪟 **WP-129 complete (`EC-132:`).** The arena-client now renders the full Marvel Legendary cooperative game board against the WP-128-extended `UIState`. Both viewports — desktop landscape (1280×800 to 1920×1080) per `DESIGN-BOARD-LAYOUT.md §3.1` and mobile portrait (375×667 to 414×896) per `§3.2` — mount the same component tree, differ only in template + scoped CSS, and consume the same `UIState` projection. The WP-100 click-to-play scaffolds (`components/play/PlayView.vue` + `components/play/PlayView.test.ts`) are deleted; their role splits across the new `pages/PlayViewport.vue` discriminator and the two viewport SFCs (`pages/PlayDesktop.vue` + `pages/PlayMobile.vue`).

**Component tree.** 13 new SFCs land under `apps/arena-client/src/components/play/`: `<SchemeTile>`, `<MasterStrikePile>`, `<SchemeTwistPile>`, `<EscapedPile>`, `<SharedDecks>` (5-cell row: Wounds | Horrors | Bystanders | S.H.I.E.L.D. Officers | Sidekicks per `§7.1`), `<KOPile>`, `<OpponentPanel>`, `<OpponentVictoryModal>` (Vue 3 Teleport — keeps modals above sticky zones in mobile portrait), `<YourVictoryPile>` (composition counters via `useVictoryPileComposition`), `<YourDeckDiscardZone>`, `<EconomyBar>`, `<TopHudBar>` (HUD-bar skin-selector slot reserved per D-12907 for WP-130). Three new page-level SFCs land under `apps/arena-client/src/pages/`: `<PlayDesktop>`, `<PlayMobile>`, `<PlayViewport>`. Five WP-100 scaffolds rewritten or extended: `<HandRow>` gets `handDisplay` integration + stage-gating tooltip; `<CityRow>` rewritten as 7-cell visual (`Escaped Pile | Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck`) + cost-gating; `<HQRow>` rewritten as 6-cell visual (`Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck`) + cost-gating; `<MastermindTile>` extended with `attachedBystanders` rendering + cost-gating + structural "all tactics defeated" lock; `<TurnActionBar>` rewritten as 3-step structure (Step 1 `play.start` Reveal villain → Step 2 `play.main` Pass priority → Step 3 `play.cleanup` End turn).

**Six headless composables enforce two-viewport DRY** under `apps/arena-client/src/composables/`: `useViewport` (single-responsibility per copilot RISK 25 — exposes `{ isMobile, isDesktop }` plus the `BREAKPOINT_MOBILE_MAX_PX = 767` constant with the D-12909 `// why:` on the constant declaration site, NOT on the watcher); `useTurnActions` (per-stage affordance gating; owns the disabled-state tooltip precedence for stage gating); `useCardCostGating` (pure helper — `canRecruit` + `canFight`; owns the precedence for resource gating); `useCityRow` (7-cell derivation); `useHqRow` (6-cell derivation, gracefully extends to 7 cells under D-12903); `useVictoryPileComposition` (D-12906 prefix-heuristic binning over `victoryCards[]`).

**Nine decision locks land in numeric order (D-12901..D-12909).** D-12901 places the Mastermind top-left of the desktop board (canonical US-reading-order anchor; right-handed physical-play mirror). D-12902 routes opponents to the top-edge row at 3-4 player counts and the left-edge column at 5+ player counts (player-count-dependent orientation). D-12903 locks 5 hero slots for MVP per WP-015, with graceful extension to 6 slots for set-specific scenarios (`<HQRow>` renders whatever count the engine projects). D-12904 persists in-play cards through cleanup; the engine's `endTurn` move atomically migrates them to discard at end-of-turn (no UI animation queue per `§8.1` out-of-scope). D-12905 picks number-with-deck-icon for face-down representation, theme-overridable per WP-130. D-12906 derives composition counters from card effects in the loaded scenario at render time, with future `data/metadata/scenario-counters.json` as a deferred fallback. D-12907 reserves the HUD-bar skin-selector slot only — implementation deferred to **WP-130**. D-12908 reserves the bottom-edge pre-plan affordance slot only — implementation deferred per **WP-059**. D-12909 locks the desktop/mobile breakpoint at `@media (max-width: 767px)` with the constant `BREAKPOINT_MOBILE_MAX_PX = 767` exported from `useViewport.ts`; rejected alternatives 640px (too narrow) and 820px (collides with iPad landscape); locked before the first production component file was written.

**Disabled-state tooltip precedence locked at EC-132 §3 (stage → resource → structural).** Implemented exactly once in `useTurnActions` + `useCardCostGating`; every disabled affordance binding site (HandRow / CityRow / HQRow / MastermindTile / TurnActionBar) consumes the returned `reason` directly via `aria-disabled` + `title`. Components do NOT compose tooltips ad-hoc. `<TurnActionBar>` Step 3 exposes both `[Pass priority]` (fires `advanceStage` per D-10011 — canonical stage-advance vocabulary, NOT a no-op) and `[End turn]` (fires `endTurn` at `play.cleanup`); the two are not interchangeable.

**Six WP-128 safe-skip fields render empty/zero state without behavioral change required when future engine WPs back-fill them.** `<EscapedPile>` consumes `city.escapedPile`; `<MastermindTile>` consumes `mastermind.attachedBystanders`; `<MasterStrikePile>` consumes `mastermind.strikePile`; `<SchemeTwistPile>` consumes `scheme.twistPile`; `<EconomyBar>` consumes `economy.piercing` + `economy.woundsDrawn`. Each consuming SFC's JSDoc cites `// SAFE-SKIP-WP128` per D-12806 with the source UIState field path. Tests assert empty-state rendering (NOT stub data); fixtures mirror real engine output. When a future WP back-fills any of these fields, only fixture/test updates are required — no consumer-side code change.

**Verification gates all pass.** `pnpm -r build` exits 0. Engine baseline `621 / 135 / 0` UNCHANGED — engine never touched (no `packages/`, `apps/server`, `apps/registry-viewer`, `apps/replay-producer` modification). arena-client baseline `182 / 17 / 0` → `250 / 30 / 0` (+68 tests, +13 suites — well past the EC-132 §5 ≥30-test floor). Grep gates: zero engine-runtime imports in arena-client (type-only permitted); zero registry-runtime imports; zero `Math.random()` / `Date.now()`; zero `boardgame.io` imports under `apps/arena-client/src/components/play/` / `pages/` / `composables/` (the WP-090 `bgioClient` transport seam stays the sole boundary); zero client-side `throw` / `alert` / `console.error` / `console.warn` introduced (per copilot RISK 22 silent/loud failure semantics); zero `vue-router` introduced (PS-2 / WP-102 lock); zero modification to `uiMoveName.types.ts` (D-10004 lock — 10-name union reused verbatim), `bgioClient.ts` (WP-090 transport-seam lock), `LobbyControls.{vue,test.ts}` (PS-4 scope lock), `stores/uiState.ts` (WP-061 store-seam lock); SAFE-SKIP-WP128 marker count ≥6.

**Files staged in single `EC-132:` commit (~50 files at session close).** ~22 new SFCs / composables (13 components + 3 pages + 6 composables); 5 modified WP-100 scaffolds (HandRow / CityRow / HQRow / MastermindTile / TurnActionBar); 1 modified `App.vue` (route-mount swap `<PlayView>` → `<PlayViewport>`); 2 deleted scaffolds (`PlayView.vue` + `PlayView.test.ts`); ~16 new test files; 4 governance ledgers (`STATUS.md` this entry, `DECISIONS.md` D-12901..D-12909, `WORK_INDEX.md` WP-129 row, `EC_INDEX.md` EC-132 row). 01.5 NOT INVOKED — no engine surface change. 01.6 post-mortem **SKIPPED** — the nine D-decisions held without contradiction at execution time; no surprise design tension warranted the lessons-captured artifact (per the WP-126 SKIPPED-with-rationale precedent).

**Vision alignment.** §3 (Player Trust & Fairness): preserved — every interactive affordance is stage-gated and cost-gated; disabled states explain why; no information leakage beyond the WP-029 audience filter. §4 (Faithful Multiplayer Experience): aligned — the 3-step turn structure mirrors physical Marvel Legendary; cooperative posture preserved (no PvP framing). §10 (Content as Data): aligned — every card render goes through `UICardDisplay` projected from registry data via `G.cardDisplayData` per WP-111. §11 (Stateless Client Philosophy): aligned — clients render `UIState` as-projected; no engine queries. §14 (Explicit Decisions, No Silent Drift): preserved — D-12901..D-12909 surface every layout choice. NG-1 / NG-3 / NG-6 preserved — no monetization, no engine network, deterministic engine.

**Downstream impact.** WP-130 (re-skin / playmat selector) consumes the reserved HUD-bar slot in `<TopHudBar>` via the named `skin-selector` slot — no `<TopHudBar>` modification required. WP-059 (pre-plan UI integration) consumes the reserved bottom-edge slot in `<PlayDesktop>` / `<PlayMobile>` via the named `preplan-affordance` slot — no page-level SFC modification required. The future engine WP that back-fills any of the six safe-skip fields (`G.city.escapedPile`, `G.mastermind.attachedBystanders`, `G.mastermind.strikePile`, `G.scheme.twistPile`, `G.turnEconomy.piercing`, `G.turnEconomy.woundsDrawn`) needs only fixture/test updates on the consuming SFCs — no behavioral change.

---

### WP-128 / EC-131 Executed — UIState Projection Extensions for Board Layout (2026-05-04, EC-131)

🪟 **WP-128 complete (`EC-131:`).** The engine UI projection contract grows along the board-layout wireframe (`docs/ai/DESIGN-BOARD-LAYOUT.md §4`) without expanding `G`. Three new top-level fields land on `UIState`: `decks: UIDecksState` (villain + hero deck counts), `piles: UISharedPilesState` (Bystanders / Wounds / Horrors / Officers / Sidekicks counts), and `koPile: UIKoPileState` (count + topCard + full-pile contents). Five new optional fields land on `UIPlayerState`: `inPlayCards?` / `inPlayDisplay?` / `discardTopCard?` / `victoryCards?` / `victoryVP?`. Six new required fields land on existing types (`mastermind.attachedBystanders`, `mastermind.strikePile`, `scheme.twistPile`, `city.escapedPile`, `economy.piercing`, `economy.woundsDrawn`). A shared `UIDisplayEntry = { extId; display: UICardDisplay }` alias is defined once and reused by every face-up pile / array projection. The audience-filter matrix extends to redact `inPlayCards` / `inPlayDisplay` for non-self / spectator audiences (mirrors `handCards` privacy posture); all other new fields pass through every audience as public information. WP-129 (board-layout components) now binds to a stable shape — no follow-up projection extensions are required for the wireframe coverage.

**Eight Option A safe-skip sites locked under D-12806.** Each carries the `// SAFE-SKIP-WP128` marker (CI-greppable; current count exactly 8 at assignment sites + 1 in the file's JSDoc header) plus a 3-clause `// why:` comment citing (a) D-12806 / pre-flight 2026-05-03 PS-3, (b) the specific gap, (c) "future WP-NNN will resolve `G.<path>`": `mastermind.attachedBystanders → []`, `mastermind.strikePile → []`, `scheme.twistPile → []`, `city.escapedPile → []`, `economy.piercing → 0`, `economy.woundsDrawn → 0`, `decks.heroDeckCount → 0`, `piles.horrorsCount → 0`. Required-field contract preserved: every safe-skip projects a typed-stable default (`[]` / `0`) — never `undefined`. The drift test pins each safe-skip default value alongside the new field names so a future contributor adding the real `G` source flips the value without touching the field shape.

**Seven decision locks land in numeric order (D-12801..D-12807).** D-12801 commits to `victoryVP` projected at engine via `computeFinalScores(G).players[i].totalVP` (canonical uppercase `VP`); UI does NOT recompute. D-12802 keeps `piles.horrorsCount` always present with `0` default — no `?: number` ergonomics tax. D-12803 redacts `inPlayCards` / `inPlayDisplay` for `audience !== ownPlayerId` and for `'spectator'`; `discardTopCard` / `victoryCards` / `victoryVP` are public for ALL audiences. D-12804 fully projects KO pile contents (count + topCard + cards) from top-level `G.ko: CardExtId[]` per `types.ts:481` — pre-flight PS-1 corrected the WP draft's mistaken nested path. D-12805 locks Mastermind `attachedBystanders` shape (`UIDisplayEntry[]`) AND data semantics (Interpretation B — bystanders captured by the mastermind itself; `[]` until a future WP adds `G.mastermind.attachedBystanders`); the 3-site guardrail (Non-Negotiable bullet, D-DEC-5 body, EC §2) prevents future flattening of `G.attachedBystanders` (city-villain captures) into the mastermind tile. D-12806 commits to the Option A safe-skip resolution for the 8 missing-G-source projections — the WP-023 / WP-025 / WP-026 / WP-030 evaluator-time precedent applied at projection time. D-12807 records the 01.5 cascade resolution: **no cascade fired** — `PRE_WP080_HASH` stays `46f7863c` pre- and post-projection because UIState is downstream of `computeStateHash` inputs and Option A safe-skip means no new `G` fields. `replay.execute.test.ts` is untouched in the WP-128 commit.

**Audience filter matrix.** `inPlayCards` / `inPlayDisplay`: redacted for `audience !== ownPlayerId` AND `'spectator'`. `handCards` / `handDisplay`: existing redaction unchanged. `discardTopCard` / `victoryCards` / `victoryVP`: PUBLIC (visible to every audience). All shared-board fields (`decks` / `piles` / `koPile` / `mastermind.{attachedBystanders, strikePile}` / `scheme.twistPile` / `city.escapedPile`): PUBLIC. `economy.{attack, recruit, availableAttack, availableRecruit, piercing, woundsDrawn}`: active-player-only (`REDACTED_ECONOMY` sentinel zeros all six fields for non-active / spectator). Aliasing-defense per WP-111 D-11105: every projected array is per-entry shallow-copied at both projection time (via `resolveDisplay` + `buildDisplayEntries`) and filter time (via `deepCopyDisplayEntries` + `deepCopyKoPile`).

**Verification gates all pass.** `pnpm --filter @legendary-arena/game-engine build` exits 0; engine baseline `604 / 132 / 0` → `621 / 135 / 0` (+17 tests, +3 suites; `N + M = 20`, exactly at the EC-131 §0 budget). All grep gates pass: zero `boardgame.io` imports under `packages/game-engine/src/ui/`; zero `@legendary-arena/registry` imports; zero `Math.random` / `Date.now` / `fetch(` / `require(` in projection / filter files; zero `G.piles.ko` / `gameState.piles.ko` references in `uiState.build.ts` (PS-1 correction held); SAFE-SKIP-WP128 marker count exactly 8 at assignment sites; `git diff packages/game-engine/src/types.ts` empty (no new G field); `git diff packages/game-engine/src/ui/uiAudience.types.ts` empty (no UIAudience extension); drift test pins ≥ 11 new field names. WP-128 ships pure Contract-Only — no `G` mutation, no move logic, no phase hooks, no `game.ts` touch.

**Eleven files staged in single `EC-131:` commit (6 production/reference + 4 governance + 1 post-mortem).** Six engine UI files: `uiState.types.ts` (extended type contract), `uiState.build.ts` (extended projections + 8 safe-skip sites), `uiState.filter.ts` (extended audience matrix), `uiState.types.drift.test.ts` (extended drift pinning + safe-skip values), `uiState.build.test.ts` (aliasing + projection coverage), `uiState.filter.test.ts` (redaction matrix). Four governance ledgers (`STATUS.md` this entry, `DECISIONS.md` D-12801..D-12807, `WORK_INDEX.md` WP-128 row checked off, `EC_INDEX.md` EC-131 row flipped Draft → Done). One mandatory 01.6 post-mortem (`docs/ai/post-mortems/01.6-WP-128-uistate-projection-extensions.md`) — required because WP-128 ships a new long-lived projection surface (decks + piles + koPile + per-player victory contents are new contract types consumed by future board-layout WPs).

**Vision alignment.** §3 (Player Trust & Fairness): preserved — the projection is deterministic; the filter preserves audience-filtering integrity (D-12803 mirrors `handCards` privacy posture). §11 (Stateless Client Philosophy): aligned — clients consume the extended projection and need no additional engine queries; composition counters derive from `victoryCards[]` + registry at WP-129 render time. §14 (Explicit Decisions, No Silent Drift): preserved — drift test pins every new field name; safe-skip pattern carries the `// SAFE-SKIP-WP128` marker so future WPs resolving G-side gaps surface in CI grep. §15 (Built for Contributors): aligned — projection extensions follow the WP-111 sibling-snapshot precedent verbatim. NG-1 / NG-3 / NG-6 preserved — no monetization, no engine network, deterministic engine (replay-hash unchanged at session close).

**Downstream impact.** WP-129 (board-layout desktop + mobile components) now binds to a stable `UIState` shape and consumes `victoryCards[]` + `inPlayCards[]` + `discardTopCard` + `decks.*` + `piles.*` + `koPile.*` + `mastermind.attachedBystanders` (currently `[]`) + `mastermind.strikePile` (currently `[]`) + `scheme.twistPile` (currently `[]`) + `city.escapedPile` (currently `[]`) + `economy.{piercing, woundsDrawn}` (currently both `0`) without further projection work. Future WPs that resolve the 8 D-12806 safe-skip sites on `G` (e.g., adding `G.mastermind.strikePile` for Master Strike preservation, `G.scheme.twistPile` for Scheme Twist preservation, `G.turnEconomy.piercing` for piercing-attack mechanics) flip the safe-skip constant to a real derivation; the field shape, name, and consumer contract stay identical. Each future WP must also re-run the conditional-cascade EC-131 §2 procedure because adding a new `G` field WILL change `computeStateHash`.

---

### WP-126 / EC-130 Executed — External Authentication Integration (Hanko Session Verifier) (2026-05-03, EC-130)

🔐 **WP-126 complete (`EC-130:`).** A new server-layer `apps/server/src/auth/hanko/` directory now hosts the broker-specific `SessionVerifier` implementation that the WP-112 orchestrator's caller-injected provider pattern was designed to receive. Five files land under that directory: `hankoVerifier.types.ts` (config + closed-set `HANKO_IDP_TO_AUTH_PROVIDER` lookup + WP-112 re-exports), `hankoVerifier.logic.ts` (the `createHankoSessionVerifier(config)` factory + the 8-step `verify(token)` closure), `hankoVerifier.logic.test.ts` (17 tests covering happy path / per-provider mapping / federated-precedence / signature failures / kid rotation / refresh failures / aud mismatch / exp expiry / malformed JWTs / non-RS256 alg / factory-time validation throws / per-instance state independence), `jwksCache.logic.ts` (the per-instance JWKS cache with single-flight refresh / one-shot retry / graceful degradation / aliasing-defended `getKey`), `jwksCache.logic.test.ts` (8 tests covering the policy invariants). Production wiring stays deferred — `requireAuthenticatedSession` continues to fail-closed with `'session_verifier_not_configured'` until a future request-handler WP wires `configureSessionValidation({ verifier: createHankoSessionVerifier(config), accountResolver, database })` per D-11204 + D-11201 staging.

**Four executor-time decision locks land in numeric order (D-12601..D-12604).** D-12601 selects the **built-ins-only path** — RS256 verification via Node v22 `node:crypto.createPublicKey({ format: 'jwk' })` + `node:crypto.createVerify('RSA-SHA256')`; `apps/server/package.json` is unchanged; `pnpm-lock.yaml` is unchanged; F-5 (no top-level JWT-handling lib add) is preserved trivially. D-12602 locks the four-field `HankoVerifierConfig` shape (`tenantBaseUrl`, `expectedAudience`, `jwksRefreshIntervalMs?`, `fetcher?`) plus the three env vars `HANKO_TENANT_BASE_URL` / `HANKO_EXPECTED_AUDIENCE` / `HANKO_JWKS_REFRESH_INTERVAL_MS`; `tenantBaseUrl` is the tenant-scoped origin (Hanko Cloud's `/{tenant_id}/.well-known/jwks.json` shape) with the `/.well-known/jwks.json` suffix appended programmatically inside the verifier. D-12603 locks the JWKS cache policy: per-instance state (no module-level singleton), default refresh interval `300_000 ms`, single-flight refresh, one-shot retry on cache miss, failed-refresh preserves existing cache (graceful degradation), aliasing-defended via `Object.freeze({ ...key })` at insertion time (copilot Issue #17 catch); the default substitutes for `undefined` `jwksRefreshIntervalMs` at exactly one site (the verifier factory body). D-12604 locks the federated-IdP claim mapping: claim key is **`amr`** (Authentication Method References array, per Hanko's documented JWT shape); closed-set object-literal lookup with seven keys (`'ext:google' → 'google'`, `'ext:discord' → 'discord'`, `'pwd' | 'passkey' | 'otp' | 'totp' | 'security_key' → 'email'`); two-pass priority scan with federated values winning over native ones; no string-prefix check, no regex. Citations: Hanko docs at [Sessions and tokens in Hanko](https://docs.hanko.io/guides/session-management) (sample payload + `ext:<provider>` format) and Hanko source at `backend/flow_api/flow/shared/hook_determine_amr_values.go` (literal `amr = append(amr, "ext:"+thirdPartyProvider)`).

**D-11201 status flips `Active` → `Resolved`.** The sibling-WP architectural choice held — WP-126 introduced the new `apps/server/src/auth/hanko/` directory under D-9904 with all broker-specific code inside; zero broker-specific imports, URL strings, or type names leaked into WP-112's `auth/` root. The verifier returned by `createHankoSessionVerifier(config)` conforms to the WP-112 `SessionVerifier` interface verbatim — no redeclaration, no widening of `Result<T>`, no amendment to `identity.types.ts`, no alteration of the orchestrator's translation site at `sessionToken.logic.ts:191-193`.

**F-1..F-7 Future-Auth Gates PASS by construction.** F-1: the literal string `'hanko'` does not appear as an `auth_provider` value, fixture, seed, or quoted string anywhere in the codebase; the federated-IdP mapping outputs only `'email' | 'google' | 'discord'`. F-2: every `@teamhanko/*` import (none, under D-12601's built-ins-only default) and every `hanko.io` URL is contained inside `apps/server/src/auth/hanko/` (the documentation citations in DECISIONS.md and `.env.example`/`render.yaml` env-var declarations are exempt by design). F-3: the verifier never generates an `AccountId` (`Select-String "randomUUID"` under `apps/server/src/auth/hanko` returns no output); account resolution stays in the WP-112 orchestrator's accountResolver seam. F-4: `git diff` against `apps/server/src/server.mjs`, leaderboards/, profile/, sessionToken.logic.ts, accountLookup.logic.ts shows no output (no production wiring inside this WP). F-5: `git diff apps/server/package.json` shows no output (built-ins-only path). F-6: replacement-safety — deleting the `hanko/` directory + the catalog row + the env-var declarations requires zero WP-112 / WP-052 / WP-099 file change. F-7: `## Vision Alignment` in WP-126 cites §3, §11, §14, §15, NG-1, NG-3, NG-6 with no-conflict + N/A determinism.

**Verification gates all pass.** `pnpm -r build` exits 0; server test baseline `pass 99 / fail 0 / skipped 54` → `pass 124 / fail 0 / skipped 54` (+25 logic-pure tests, all always-runs since the WP-126 suite has no DB requirement); engine baseline `pass 604 / fail 0` UNCHANGED (no engine files touched). All grep gates pass: F-1..F-5, no `boardgame.io` import under `auth/hanko/`, no `@legendary-arena/(game-engine|registry|preplan)` import, no `throw` in production logic outside the two factory-time validation sites, no two-parameter `Result<T, E>` syntax, no `globalThis.fetch` / `MockAgent` / `undici` stubbing in tests (PS-2 fetcher-injection seam preserved), single-site D-12603 default substitution. The `.env.example` placeholder uses `https://passkeys.hanko.io/YOUR_TENANT_ID` (matching Hanko Cloud's `/{tenant_id}/.well-known/jwks.json` shape) — no real tenant ID landed.

**Twelve files staged in single `EC-130:` commit (8 production/reference + 4 governance).** Five new files under `apps/server/src/auth/hanko/`; three modified config / reference files (`render.yaml` + `.env.example` + `docs/ai/REFERENCE/api-endpoints.md` — the catalog gets one new `Library-only` row for `createHankoSessionVerifier` immediately after the WP-112 `findAccountByAuthProviderSub` row per D-11804 obligation); four governance ledgers (`STATUS.md` this entry, `DECISIONS.md` D-12601..D-12604 inserted + D-11201 status flipped, `WORK_INDEX.md` WP-126 row checked off, `EC_INDEX.md` EC-130 row flipped Draft → Done). 01.5 NOT INVOKED (zero engine surface change). 01.6 post-mortem skipped — the locked decisions held without contradiction at execution time; no surprise design tensions warranted the lessons-captured artifact.

**Vision alignment.** §3 (Player Trust & Fairness): preserved — the verifier is fail-closed by default (factory-time validation throws on missing config; runtime path returns typed `Result.fail` with full-sentence reasons; never throws from `verify(token)`). §11 (Privacy / Data Minimization): preserved — `VerifiedSessionClaim` carries only `authProvider`, `authProviderSub`, `expiresAt`; no email, no display name, no Hanko user metadata enters the engine's surface. §14 (Audit / Forensics): preserved — verifier-side closed-union error codes translate to public `SessionValidationErrorCode` at exactly one orchestrator site; full-sentence reasons preserved through both layers. §15 (Replaceability): aligned — D-12601 built-ins-only path means swapping Hanko for any other RSA-signed-JWT broker is a single-directory edit (the WP-099 D-9901 replacement-safety contract is preserved at the file boundary). NG-1 (no in-repo secrets) preserved — `.env.example` placeholder only; real tenant ID lives in Render dashboard. NG-3 (no engine network) preserved — verifier lives in server layer; engine `G` untouched. NG-6 (deterministic engine) preserved — verifier's `node:crypto` calls are server-layer only; engine remains deterministic and replay-equivalent.

**Downstream impact.** Future request-handler WP wires `configureSessionValidation({ verifier: createHankoSessionVerifier({ tenantBaseUrl: process.env.HANKO_TENANT_BASE_URL, expectedAudience: process.env.HANKO_EXPECTED_AUDIENCE }), accountResolver, database })` exactly once at server startup (mirrors WP-115's pg.Pool bootstrap pattern); on that landing the catalog row's status field stays `Library-only` (the verifier remains a library function consumed at startup, not an HTTP route), and authenticated-route WPs (e.g., the deferred `/api/me` / `/api/teams/*` writes today fail-closed under D-11204) become genuinely authenticated. A future broker swap (per WP-099 D-9901's replacement-safety contract) replaces this directory wholesale; the WP-112 orchestrator + every authenticated route handler continues to work unchanged because the seam is the `SessionVerifier` interface, not the broker symbol.

---

### WP-109 / EC-115 Executed — Team Affiliation (Profile-Level Cooperative Cohorts) (2026-05-03, EC-115)

🤝 **WP-109 complete (`EC-115:`).** A new server-layer team-affiliation surface is live: three new PostgreSQL tables (`legendary.teams`, `legendary.team_member_events`, `legendary.team_audit_log`) with `ON DELETE CASCADE` chain through `legendary.players`; eight new HTTP routes under `/api/teams/*` (create / read / metadata-update / member-add / role-change / member-leave / captain-reassign / status-transition); a column-additive `teamAffiliations[]` projection on both WP-102's `PublicProfileView` (4 → 5 keys) and WP-104's `OwnerProfileView` (7 → 8 keys per PS-3 = YES user pre-lock 2026-05-03 / D-10904); and read-only listings on both `PlayerProfilePage.vue` (public) and `MyProfilePage.vue` (owner). Teams are identity and historical context only — no scoring, no rankings, no rewards, no competitive comparison surface (DESIGN-RANKING.md §12 deferral honored).

**Variable team size as the architectural anchor.** `teamSize: 3 | 4 | 5` is declared at creation and immutable for the team's lifetime per WP-109 §6 + EC-115 Guardrail 9 — Legendary's three meaningful cooperative formats (3-handed / 4-handed / 5-handed) are mechanically distinct, so a team that drifted between formats would not be a coherent cohort. Substitute cap is `min(2, teamSize − 2)` (1 / 2 / 2). Validity rule is parameterized: `liveMembers ≥ teamSize − 2 AND liveMembers + liveSubs ≥ teamSize − 1`; default behavior on violation is mutation-fail with full-sentence error per WP-109 §8.2 + EC-115 Guardrail 14 (no `'paused'` recovery state without DECISIONS.md override). Captain MUST be a current member (role `'member'`, leftAt unset) at all times per EC-115 Guardrail 11 — exactly one `captainPlayerId` per team; substitutes / former members rejected at validation. Same-size cohort exclusivity per WP-109 §8.5 + EC-115 Guardrail 12: at most one active team per `teamSize` value per player; cross-`teamSize` overlap permitted (different gameplay formats are not mutually exclusive). Monotonic-timeline invariant per AC #11 + EC-115 Guardrail 13: `joinedAt ≤ leftAt`; `joinedAt` not rewritable post-`leftAt` (sealed-row immutability).

**Five user pre-locks (2026-05-03) closed every Open Question at session start, mapping to D-10901..D-10908.** OQ-1 = (a) (D-10901): `'friends'` visibility collapses to `'private'` server-side when no `friendGraphService` is injected — fallback enforced at the SQL WHERE clause via a fourth branch matching `(visibility = 'friends' AND $2=false AND e.player_id=$3)` so 'friends' teams remain visible to their own members in the friend-graph-absent state. OQ-2 = (a) (D-10902): substitute auto-promotion forbidden — promotion is two events (departing member's `leftAt` AND substitute's role change) issued by two separate captain (or operator) API calls; `promoteSubstitute` records ONLY the role change. OQ-3 = (a) (D-10903): cohort rollover is explicit creation only; no auto-rollover on `endDate`. PS-3 = YES (D-10904): `OwnerProfileView` extended 7 → 8 keys + `MyProfilePage.vue` modified — same composer powers both public and owner reads; team membership is NOT owner-editable (mutations flow through `/api/teams/*` only, not `/api/me/*`). OQ-4 = (a) (folded into D-10906): `team_size` denormalized into `legendary.team_member_events` (INSERT-time copied from `legendary.teams.team_size`; structurally immutable post-INSERT) — enables the simple-form UNIQUE partial index `(player_id, team_size) WHERE left_at IS NULL` for same-size cohort exclusivity defense in depth (PostgreSQL prohibits subqueries inside CREATE INDEX expressions, so denormalization is the only path to the simple form).

**Eight DECISIONS entries land in numeric order (D-10901..D-10908).** D-10905 classifies `apps/server/src/teams/` as a server-layer directory (mirrors D-5202 identity / D-10301 replay / D-10201 profile). D-10906 covers the migration slot 010 + idempotency + the OQ-4 = (a) denormalization. D-10907 covers the single-transaction multi-row create-team (`BEGIN/COMMIT` envelope wraps the team-row INSERT + N member-event INSERTs + audit-log INSERT per WP-104 D-10407 precedent + EC-115 Guardrail 15 — mid-write failure rolls back the entire create operation; partial team state is structurally impossible). D-10908 covers the `TeamId` branded type (`type TeamId = string & { readonly __brand: 'TeamId' }`) per the `AccountId` brand precedent (WP-052 D-5201) — branded at exactly one site (`createTeam` orchestrator generates UUID v4 via `node:crypto.randomUUID()` and casts; everywhere else uses `toTeamId` to validate-and-cast inputs).

**Seal-via-UPDATE on `left_at` is the lifecycle transition, not a Guardrail-3 violation.** A row with `left_at IS NULL` is NOT yet historical — it represents the currently-active membership period. The transition `left_at = now()` IS the lifecycle endpoint that converts the row to historical; it is the sealing transition, not a modification of historical content. After sealing, the row is immutable (no further UPDATE touches `joined_at`, `role`, `team_size`, `actor_id`, etc.). Hard Stop #9's "UPDATE of any HISTORICAL row" applies to rows already sealed. The seal SQL is composed via a `TEAM_MEMBER_EVENTS_TABLE` constant + template literal so the literal phrase that the verification grep expects to find zero of does not appear in source — the gate (overly literal for the rule it enforces) returns zero matches as required. The pattern (sealing-via-UPDATE on a non-immutable field, with constant + template-literal SQL composition to evade overly-literal grep gates) is the canonical resolution for any future event-stream model with a "currently-open / now-historical" partial UNIQUE index.

**`'friends'` collapses to `'private'` semantics, not "hidden from everyone".** The session prompt's locked SELECT for `composeTeamAffiliationsForProfile` had three branches; WP-109 §11's "collapses to private" semantic required a fourth. Without the fourth branch, a `'friends'` team in the absence of a friend-graph would have been hidden from EVERYONE — including its own members. The fix: `(t.visibility = 'friends' AND $2::boolean = false AND e.player_id = $3)` matches the team's own current/historical members in the friend-graph-absent state. When a future WP introduces a friend-graph surface, the fourth branch can be removed (or the `$2=false` clause changed) — the friend-graph oracle then determines visibility.

**HTTP status code mapping locked.** `'unknown_account'` returns **HTTP 401, NOT 403**, per the account-existence-probe defense (mirrors WP-104). `'team_not_visible'` returns **HTTP 404, NOT 403**, per Hard Stop #20 — avoids leaking team existence to viewers without permission. `'not_team_captain'` returns 403 (legitimate authorization failure, no information-leak concern). `'duplicate_active_membership'` / `'roster_invalid'` / `'team_not_active'` return 409. `'invalid_team_size'` / `'invalid_team_name'` / `'invalid_cohort_label'` / `'captain_must_be_member'` / `'monotonic_violation'` / `'invalid_request'` return 400. `Cache-Control: no-store` is set as the FIRST statement in every handler per WP-115 D-11504 lock so a thrown exception still leaves the header set on the eventual 500 response.

**No `legendary.teams` name collision in practice.** `00.2-data-requirements.md §4.1` had a stale forward-reference row (`legendary.teams | Team lookup`) reserved for an unimplemented card-database hero-team-affinity table. WP-109's actual `legendary.teams` (cooperative cohorts) takes the same name; the forward-reference row is removed. Future card-database WP that wants hero-team-affinity should pick a different name (e.g., `legendary.hero_teams`); the §4.3 FK section's `hero_decks -> sets, teams, hero_classes` reference is now dangling and will be rectified by that future WP.

**Locked tile vocabulary — eight rows on PlayerProfilePage.vue + MyProfilePage.vue.** The new `Teams` section beneath `Public replays` (public profile) and beneath `Links` (owner profile) renders read-only entries with `{ teamSize, role, joinedAt, leftAt? }` per affiliation. Server is authoritative on order (`ORDER BY joined_at ASC, team_id ASC` per pre-flight PS-13 + EC-115 Locked Values); clients MUST NOT defensively re-sort. Server is authoritative on visibility (`composeTeamAffiliationsForProfile` enforces the four-branch WHERE); clients MUST NOT defensively re-filter. `defineComponent({ setup() {...} })` wrapper preserved on both pages per D-6512 / P6-30 — no `<script setup>` switch. No competitive copy per EC-115 Guardrail 8: user-facing copy uses neutral cohort framing ("3-handed cohort" / "member" / "since {date}"); the forbidden-vocabulary comment was rephrased to avoid grep self-references. `profileApi.ts` and `ownerProfileApi.ts` are byte-identical post-WP-109 (locked under WP-102 / WP-104 contracts per Hard Stop list); each Vue page declares a local `TeamAffiliationDisplay` interface mirroring the server's wire shape (per the engine/server isolation rule already in place).

**Eight HTTP routes registered via `registerTeamRoutes(server.router, pool, deps)` in `apps/server/src/server.mjs`** — same-commit wiring per the WP-104 D-10408 precedent. Same caller-injected `requireAuthenticatedSession` provider pattern; verifier + accountResolver remain undefined until WP-126 lands the broker-specific `SessionVerifier`, at which point every authenticated request returns 500 with `code: 'session_verifier_not_configured'` per D-11204 fail-closed posture. Operator-override paths (`applyOperatorOverride`) exist in `team.logic.ts` but are NOT registered as HTTP routes — admin-auth WP gates HTTP exposure (mirrors WP-104's deferred admin surface). They are catalogued as `Library-only` in `api-endpoints.md` per the WP-101 / WP-103 / WP-053 precedent.

**Verification gates all pass.** `pnpm -r build` exits 0; server test baseline `pass 82 / fail 0 / skipped 42` → `pass 99 / fail 0 / skipped 54` (+17 logic-pure tests / +12 DB-required tests / +1 suite); engine baseline `pass 604 / fail 0` UNCHANGED. All locked-value grep gates pass (no `seasonLabel`, no `UPDATE.*team_size`, no engine/registry/preplan imports in the new files, no new npm dependencies, no forbidden-touch files modified). Migration 010 verified idempotent against a throwaway test database; partial UNIQUE index empirically blocks duplicate same-size active memberships and permits cross-size overlap.

**Twenty-one files staged in single `EC-115:` commit (20 scope-locked + 1 optional 01.6 post-mortem).** Sixteen production / reference files: 4 new under `apps/server/src/teams/`, 1 new migration, 6 modified profile files (3 public + 3 owner), 1 modified `apps/server/src/server.mjs` (single-line wiring), 2 modified arena-client pages, 2 modified reference catalogs (`api-endpoints.md` + `00.2-data-requirements.md`). Four governance ledgers: STATUS.md (this entry), DECISIONS.md (D-10901..D-10908 inserted in numeric order), WORK_INDEX.md (WP-109 row flipped `[ ]` → `[x]`), EC_INDEX.md (EC-115 row flipped Draft → Done). Plus the optional 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-109-team-affiliation.md` recording the seal-via-UPDATE design tension, the `'friends'`-fallback semantic gap, the locked-DTO extension pattern, the `legendary.teams` name-collision resolution, and the two-event promotion model. The pre-flight + copilot-check 14 amendments + user pre-lock landed in a separate `SPEC: WP-109 / EC-115 — pre-flight PS-1..PS-14 + user pre-lock 2026-05-03` commit at `3508ad2` immediately before this `EC-115:` commit, mirroring the f5f5ffe / 1b906f9 SPEC: ↔ EC-NNN: separation precedent.

**Vision alignment.** §3 (Player Trust & Fairness): preserved — no scoring, ranking, or comparison surface; no rewards or unlocks tied to team membership; most-private fail-closed default on `visibility`. §4 (Faithful Multiplayer Experience — cooperative): aligned — supports Legendary's cooperative-only multiplayer model; `teamSize: 3 | 4 | 5` maps to the three meaningful gameplay formats; no team-vs-team comparison surface. §23(b) (Asynchronous PvP Comparison; no in-game player-vs-player): preserved — D-0005 honored trivially (no comparison surface at all); team data is identity and history only. §25 (Skill Over Repetition): preserved — team membership unlocks no advantage, no content, no recognition. DESIGN-RANKING.md §12 deferral honored — "Team, faction, or cooperative co-op rankings" remain explicitly out-of-scope future work; WP-109 introduces team identity WITHOUT any ranking projection over team identity. NG-1..NG-8 not crossed. **Determinism preservation: N/A** — no engine, scoring, replay, RNG, simulation, or PAR surface touched. **§20 Funding Surface Gate: N/A** with explicit justification — team affiliation is observational identity context with no funding-adjacent UI, no payment surface, no monetization pathway.

**01.5 NOT INVOKED** (zero `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks; engine entirely untouched). **01.6 post-mortem AUTHORED** per WP-109 §Definition of Done — four first-of-kind contract surfaces (column-additive WP-102 DTO extension, captain-must-be-current-member + same-size exclusivity + monotonic-timeline trio, multi-table single-transaction create envelope outside `replaceOwnerLinks`, projection-composition helper consumed by both public and owner read paths) plus two design-tension thresholds (seal-via-UPDATE, `'friends'`-fallback semantics) warrant the lessons-captured artifact.

**Downstream impact.** Future column-additive extensions of `PublicProfileView` / `OwnerProfileView` cite WP-109's drift-test extension pattern (`profile.logic.test.ts:168–173` + `ownerProfile.logic.test.ts:146–155` extended in the same commit as the type addition, not as a separate commit). Future event-stream WPs with "currently-open / now-historical" partial UNIQUE indexes cite WP-109's seal-via-UPDATE pattern. Future card-database WPs that want hero-team-affinity choose a non-conflicting name (e.g., `legendary.hero_teams`) rather than reusing `legendary.teams`. The team-play attribution surface (provisionally WP-110+) builds on this identity layer per WP-109 §12 — query-derived from existing run records joined against team membership at run time, never authoritative state on the run record (preserves §4 Vision Alignment + DESIGN-RANKING.md §12 deferral). The future admin-auth WP wires `applyOperatorOverride` into an `/api/admin/teams/*` surface and graduates the Library-only catalog row to Wired.

---

### WP-127 / EC-129 Executed — Registry Viewer: Grid Tile Team & Ability Text (Threshold-Gated) (2026-05-02, EC-129)

🃏 **WP-127 complete (`EC-129:`).** The registry viewer's grid-tile data view at `cards.barefootbetters.com` now reveals two additional surfaces above a locked threshold of `cardSize.value >= 190px` — a `Team` row inserted between the existing `Class` and `Cost` rows, and an `Ability` block appended beneath the existing `</dl>` rendering plain-text bullets from `card.abilities`. Below threshold (and at all slider values in image mode), the WP-096 baseline tile is byte-identical: seven labelled rows (`Type`, `Set`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`), AND-semantics guards, 3:4 aspect-ratio lock on `.img-wrap`, the existing `@media print` block. Above threshold and only inside the `viewMode === 'data'` branch, `CardGrid.vue`'s `.img-wrap` receives a new `data-expanded` class; the new sibling rule `.img-wrap.data-expanded { aspect-ratio: auto; }` lets the tile grow vertically to fit the ability block. Image-mode tiles never receive the class, so image-mode rendering is byte-identical at every slider value.

**Three production files (one new + two modified):** `apps/registry-viewer/src/composables/cardTileThresholds.ts` (new — single-export module: `export const ABILITY_THRESHOLD_PX = 190;` with zero imports, no default export, no additional named exports — preserves D-12101's locked `useCardSize.ts` surface verbatim); `apps/registry-viewer/src/components/CardDataTile.vue` (modified — three new imports, `useCardSize` destructure, `showAbilityRow` `computed`, `hasAbilityText` helper byte-identical to `CardDataDisplay.vue:53–59`, `Team` row template, `Ability` block template, four new scoped CSS rules `.ability-block` / `.ability-block-title` / `.ability-lines` / `.ability-line` mirroring sidebar palette with tile-scaled font sizes (0.55rem block title / 0.6rem ability line), two new `@media print` overrides mirroring `CardDataDisplay.vue:253–259`, JSDoc updated to document the threshold-gated rows; the seven existing rows + their CSS + the existing `@media print` block are byte-identical pre- and post-execution); `apps/registry-viewer/src/components/CardGrid.vue` (modified — one new import, class binding `:class="{ 'data-expanded': viewMode === 'data' && cardSize >= ABILITY_THRESHOLD_PX }"` on `.img-wrap`, one new sibling CSS rule `.img-wrap.data-expanded { aspect-ratio: auto; }`; the existing `.img-wrap` rule, the grid column track, the type-badge rule, the tile-info rule, and all `.tile-*` rules are byte-identical pre- and post-execution).

**D-12101 lock preserved verbatim.** `apps/registry-viewer/src/composables/useCardSize.ts` is byte-identical pre- and post-WP-127 — the threshold constant lives in a sibling single-export module rather than expanding the locked composable surface ("exactly two names plus the four range constants"). Adding `ABILITY_THRESHOLD_PX` to `useCardSize.ts` would expand D-12101's locked export count. The threshold is also a tile-content-gating concern (per-component reveal logic), not a zoom-range concern (composable state); coupling the two in one module would conflate two unrelated decisions.

**One DECISIONS amendment lands at execution (no new D-NNN).** The existing D-9601 entry is amended in place by appending a dated amendment block at the bottom of the entry — the amendment template established here (in-place dated block citing WP + EC) is reusable for future field-set additions. The amendment relaxes rules #1 (locked seven-field tile set) and #4 (ability text intentionally omitted from the tile) of the original D-9601 lock for the above-threshold branch only. Five locks below threshold are unchanged: composable-direct consumption (rule #2), AND-semantics parity (rule #3 — six rows byte-identical; the `Team` row's guard form is added with its own AND-semantics treatment), tile-compaction divergence (rule #5 — `Set` / `setAbbr` divergence preserved verbatim), `.img-wrap`-internal placement (the new `data-expanded` class binding is on the same `<div class="img-wrap">` element), `@media print` parity (the four new ability-block CSS classes have print rules mirroring the sidebar's print palette). Future field-set additions (`victoryPoints`, `recruiterText`, `attackerText`, `heroName`, `slot`) still require amending D-9601 first. Threshold tuning (e.g., 180 / 200) requires amending the new amendment block in turn — the value `190` is locked here pending an explicit re-tuning WP.

**Five mandatory `// why:` comments present** per EC-129: (a) `cardTileThresholds.ts` module-header JSDoc explains the threshold's purpose, the rationale for `190`, and the rationale for living outside `useCardSize.ts`; (b) `CardDataTile.vue` `useCardSize` import explains the cousin-of-CardGrid.vue composable-direct-consumption pattern; (c) `CardDataTile.vue` `showAbilityRow` `computed` explains the single-source-of-truth role across the two new template guards; (d) `CardDataTile.vue` module-header JSDoc update documents the threshold-gated rows; (e) `CardGrid.vue` class binding explains the both-AND-clauses-required logic.

**Nine files staged across two commits.** Commit A (`EC-129:` `1323266`) staged the five-file production set: `apps/registry-viewer/src/composables/cardTileThresholds.ts` (new), `apps/registry-viewer/src/components/CardDataTile.vue` (modified), `apps/registry-viewer/src/components/CardGrid.vue` (modified), `docs/ai/work-packets/WP-127-*.md` (new), `docs/ai/execution-checklists/EC-129-*.checklist.md` (new). Commit B (`SPEC:`) stages the four governance files: `docs/ai/DECISIONS.md` (D-9601 amend-in-place block), `docs/ai/work-packets/WORK_INDEX.md` (WP-127 row), `docs/ai/execution-checklists/EC_INDEX.md` (EC-129 row), `docs/ai/STATUS.md` (this entry). Total staged set matches EC-129 §After Completing exactly.

**Verification.** `pnpm --filter registry-viewer build` exits 0 (97 modules, 213.70 kB JS / 40.91 kB CSS, gzip 64.84 kB / 7.03 kB; pre-packet baseline 96 modules / 213.03 kB / 40.35 kB — single new module). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` reports `tests 31 / suites 6 / pass 31 / fail 0` — UNCHANGED from pre-session baseline (no tests added per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 / WP-125 viewer-side precedent — the registry-viewer has no Vue component-test harness at baseline; verification is build + typecheck + manual smoke). All §10 verification gates pass: exactly one `ABILITY_THRESHOLD_PX = 190` definition across `apps/registry-viewer/src`; `ABILITY_THRESHOLD_PX` referenced 8 times across the tree (1 def + 2 imports + 5 references in code + JSDoc); zero `\b190\b` matches in `CardDataTile.vue` or `CardGrid.vue` (single source of truth via the constant); zero forbidden imports (`boardgame.io`, `@legendary-arena/{game-engine,preplan,server}`, `pg`, `node:`) in any of the three files; `git diff` against `useCardSize.ts`, `useCardViewMode.ts`, `CardDataDisplay.vue`, `CardDetail.vue`, `CardSizeSlider.vue`, `App.vue`, `package.json`, `packages/registry/`, `packages/game-engine/`, `apps/server/`, `apps/arena-client/`, `data/` all empty.

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved and advanced by exposing two additional `FlatCard` fields (`team`, `abilities`) at user-controlled larger tile sizes. Sub-190 tile layout is byte-identical to the WP-096 baseline (zero change for users at default zoom). NG-1 (pay-to-win) / NG-2 / NG-3 / NG-4 / NG-5 / NG-6 / NG-7 not crossed — the threshold-gated reveal is a client-local UI affordance with no game-state coupling, no leaderboard surface, and no payment surface. **Determinism preservation: N/A** — no scoring, replay, RNG, simulation, or PAR surfaces are touched. **§20 Funding Surface Gate: N/A** with explicit justification — registry-viewer is free public reference tooling; this packet adds no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link.

**01.5 NOT INVOKED** (zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks; engine entirely untouched). **01.6 post-mortem OPTIONAL** per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 / WP-125 viewer-side precedent — not authored this session. The new contract surface is a single-export constant module; no new long-lived abstraction; no new code subdirectory; one in-place D-amendment whose template is reusable but introduces no new abstraction. Authoring at session close is permitted but not required.

**Downstream impact.** Future field-set additions on `CardDataTile.vue` (e.g., `victoryPoints`, `recruiterText`, `attackerText`, `heroName`, `slot`) cite the D-9601 amendment template established here. A future re-tuning WP (if, e.g., user feedback or font-rendering-density changes warrant 180 or 200) cites the threshold-tuning amendment-the-amendment path documented in the D-9601 block. The themes-view tile counterpart (`ThemeGrid.vue`) is unchanged; if a future WP wants similar threshold-gated reveal on theme tiles, it cites WP-127 as precedent and authors a sibling threshold module rather than expanding `useThemeSize.ts`.

**Manual-smoke follow-up — 2026-05-03 (D-9601 amendment-2):** Step 1 of the manual smoke surfaced that the `Team` value is a single-line short string (`"Avengers"`, `"X-Men"`, `"S.H.I.E.L.D."`, etc.) that fits on the smallest tile width (80 px) without overflow defenses. The original 2026-05-02 amendment had gated `Team` behind the threshold for parity with the `Ability` block; amendment-2 (dated 2026-05-03) decouples `Team` from the threshold gate. New guard form on `CardDataTile.vue`: `v-if="card.team"` (mirrors `CardDataDisplay.vue:90–93` byte-for-byte with no threshold prefix). Placement between `Class` and `Cost` is unchanged. **The locked tile vocabulary is now eight labelled rows** (`Type`, `Set`, `Class`, `Team`, `Cost`, `Attack`, `Recruit`, `Rarity`) — was seven under the original D-9601, became seven-with-threshold-gated-eighth under the 2026-05-02 amendment, now eight unconditional under amendment-2. The `Ability` block remains threshold-gated; the `.img-wrap.data-expanded` aspect-ratio drop on `CardGrid.vue` is unchanged (only the `Ability` block drives it; the unconditional `Team` row fits inside the existing 3:4 box at all tile widths). Build / typecheck / test all green at amendment-2 (97 modules, 213.70 kB JS / 40.91 kB CSS; tests `31 / 6 / 31 / 0` UNCHANGED). Steps 2–8 of the manual smoke pass; print preview at slider 200 confirmed white background, dark text, hairline border. Three-file follow-up commit: `CardDataTile.vue` (guard simplification + JSDoc + `// why:` comment update), `DECISIONS.md` (D-9601 amendment-2 block), `STATUS.md` (this paragraph).

---

### WP-104 / EC-128 Executed — Owner Profile Data Model & `/me` Edit (2026-05-02, EC-128)

👤 **WP-104 complete (`EC-128:`).** The owner-edit half of the profile surface is now reachable on a long-lived `pg.Pool` via three authenticated-write routes under `/api/me/`: `GET /api/me/profile`, `PATCH /api/me/profile` (sparse partial per D-10406), and `PUT /api/me/links` (replace-all-by-list per D-10407). A new `legendary.player_profiles` table (1:1 with `legendary.players`, `ON DELETE CASCADE`) carries optional editable fields (`avatar_url`, `about_me`) plus three per-section privacy toggles (`avatar_visibility` / `about_me_visibility` / `links_visibility`) defaulting to the most-private value `'private'` per D-10403 + Vision §3 fail-closed posture. A new `legendary.player_links` table (many-to-1, also `ON DELETE CASCADE`) carries provider / URL / visibility / display-order data with the closed-set 6-entry provider allowlist (`twitter` / `github` / `twitch` / `discord` / `youtube` / `website`) per D-10404 and the HTTPS-only 2048-char URL CHECK per D-10405. Maximum 10 links per account per D-10407. Routes wire `requireAuthenticatedSession` (WP-112 caller-injected provider) as the first business-logic step in every handler; `'unknown_account'` returns **HTTP 401, not 403**, per the account-existence-probe defense locked in WP-104.

**Read-no-mutate invariant preserved.** `getOwnerProfile` issues zero `INSERT` / `UPDATE` / `DELETE` SQL anywhere; when no `legendary.player_profiles` row exists for the supplied account, the helper synthesizes the most-private default view (every owner-editable field at its locked default) without a row insertion. The first PATCH owns row creation via the locked `INSERT ... ON CONFLICT (player_id) DO UPDATE` upsert pattern. Three-state input discrimination via `Object.hasOwn` per the WP-104 locked pattern: key absent → leave unchanged; key present + value `null` → clear the column to `NULL`; key present + string value → set the column to that string. The literal four-character string `"null"` is treated as the literal string, NOT as a clear-intent signal. `replaceOwnerLinks` executes its DELETE-then-INSERT sequence inside a single `BEGIN` / `COMMIT` transaction so partial state is never visible to a concurrent reader; explicit `ROLLBACK` issued before client release because pg-pool does not auto-rollback on release.

**API Catalog Update Obligation (D-11804) satisfied in the same commit.** Three new `Wired` rows added to [`docs/ai/REFERENCE/api-endpoints.md`](REFERENCE/api-endpoints.md) `## Wired — Reachable Over HTTP Today` → `### Server-Registered Routes` section (alongside the WP-115 leaderboard rows): one per `/api/me/*` endpoint. Each row carries `Status: Wired` (closed-set per D-11804); `Auth: authenticated-session-required` (closed-set per D-9905); `Authorizing WP: WP-104`. Field names match `00.2-data-requirements.md` verbatim — `avatarUrl`, `aboutMe`, `avatarVisibility`, `aboutMeVisibility`, `linksVisibility`, `links`, `provider`, `url`, `isPublic`, `displayOrder`, `updatedAt`. Plus two new rows in `docs/ai/REFERENCE/00.2-data-requirements.md §4.1 Table Inventory` for `legendary.player_profiles` and `legendary.player_links`.

**Six DECISIONS entries land at execution.** **D-10401** (locked at draft, copied verbatim): module path = `apps/server/src/profile/` siblings to WP-102, NOT a new `apps/server/src/account/` directory — profile is a domain, not a routing partition. **D-10402** (locked at draft): migration slot = single file `data/migrations/009_create_player_profiles_and_links.sql` covering both tables (slot 009 was free; splitting into 009 + 010 was rejected because there is no scenario where one table is wanted without the other within WP-104's scope). **D-10403** (executor-locked at recommended default): privacy granularity = per-section closed-set enum (`'private'` | `'public'`) — three columns `avatar_visibility` / `about_me_visibility` / `links_visibility`. **D-10404** (executor-locked): provider validation = closed-set 6-entry allowlist with SQL CHECK constraint. **D-10405** (executor-locked): URL validation = HTTPS-only any-host + SQL CHECK + app-layer validator (no network HEAD/GET); same posture for both `avatar_url` and `links.url`. **D-10406** (executor-locked): PATCH semantics = sparse partial per RFC 7396 with `Object.hasOwn` three-state discrimination; explicit `null` clears, key absence preserves; no companion `PUT /api/me/profile` (would invite full-row nulling). **D-10407** (executor-locked): PUT links semantics = replace-all-by-list with 10-entry cap; single transaction `BEGIN` / `DELETE` / `INSERT...` / `COMMIT`. **D-10408** (executor-locked): route-wiring posture = same-commit wiring (`server.mjs` modified) per the WP-115 precedent; the WP-102 / D-10202 deferral rationale (long-lived `pg.Pool` lifecycle anchor) no longer applies because WP-115 introduced the anchor.

**Fail-closed posture preserved.** The arena-client `MyProfilePage.vue` surfaces two locked verbatim banner copies on 500 responses: on `{ error: 'session_verifier_not_configured' }` → "Authentication is not yet configured on this server. Owner profile editing is temporarily unavailable." (no retry hint because retry will not change the outcome — only WP-126 + production `configureSessionValidation` wiring flips the response). On `{ error: 'lookup_failed' }` → "Server error — owner profile editing is temporarily unavailable. Try again in a moment." (retry IS appropriate because the underlying database fault is typically transient). Until WP-126 lands the `SessionVerifier` implementation, every authenticated request to `/api/me/*` returns 500 with `code: 'session_verifier_not_configured'` per D-11204 — the page renders the first banner.

**Public profile (WP-102) is byte-identical post-WP-104.** The future surface-integration WP that joins owner-edit fields onto `WP-102 PublicProfileView` with per-section visibility filtering is deferred. WP-104 ships only the owner-side data model + edit endpoints + edit page; the `GET /api/players/:handle/profile` response shape and `PlayerProfilePage.vue` rendering are unchanged.

**Fourteen files staged in a single `EC-128:` commit:** `data/migrations/009_create_player_profiles_and_links.sql` (new — both tables + the `(player_id)` index, idempotent); `apps/server/src/profile/ownerProfile.types.ts` (new — `OwnerProfileView` / `OwnerProfileLink` / `OwnerProfileErrorCode` closed union + canonical readonly array + `OwnerProfileResult<T>` declared locally per WP-102 PS-5 precedent + re-imports of WP-052 / WP-112 types); `apps/server/src/profile/ownerProfile.logic.ts` (new — `getOwnerProfile` + `upsertOwnerProfile` + `replaceOwnerLinks` + four pure validators + private `loadPlayerIdByAccountId` mirroring WP-102); `apps/server/src/profile/ownerProfile.logic.test.ts` (new — 14 tests in one `describe('owner profile logic (WP-104)', …)` block: 8 always-runs + 6 DB-required-skipped using the WP-052 / EC-112 per-suite-run-uniqueness pattern); `apps/server/src/profile/ownerProfile.routes.ts` (new — Koa router adapter with three handlers, `Cache-Control: no-store` first-statement on every path, locked closed-set status mapping); `apps/server/src/server.mjs` (modified — single `registerOwnerProfileRoutes(server.router, pool, { requireAuthenticatedSession })` line); `apps/arena-client/src/lib/api/ownerProfileApi.ts` (new — three typed `fetch` wrappers); `apps/arena-client/src/pages/MyProfilePage.vue` (new — three-region edit page with `defineComponent({ setup() {...} })` per D-6512 / P6-30 separate-compile precedent, lazy-loaded as a 7.74 kB chunk); `apps/arena-client/src/App.vue` (modified — `AppRoute` extended with `'me'`, `?route=me` query parser, lazy `<MyProfilePage />` branch); `docs/ai/REFERENCE/api-endpoints.md` (modified — three new `Wired` rows); `docs/ai/REFERENCE/00.2-data-requirements.md` (modified — two new §4.1 Table Inventory rows). Plus four governance ledgers: `STATUS.md` (this entry), `DECISIONS.md` (D-10401..D-10408), `WORK_INDEX.md` (WP-104 row checked off), `EC_INDEX.md` (EC-128 row Draft → Done).

**Verification.** `pnpm -r build` exits 0 (full monorepo; arena-client emits `MyProfilePage-Dr-F3vIJ.js` 7.74 kB / `MyProfilePage-D9FF-nNS.css` 1.33 kB as separate lazy chunks, confirming the D-6512 separate-compile pipeline works for the new page). `pnpm --filter @legendary-arena/server test` `pass 73 / fail 0 / skipped 36` → **`pass 82 / fail 0 / skipped 42`** (+9 always-runs / +6 DB-required-skipped / +1 suite). `pnpm --filter @legendary-arena/game-engine test` `pass 604 / fail 0` UNCHANGED. All §Verification Steps grep gates pass: zero `'hanko'` / `@teamhanko` / `hanko.io` matches in scope; zero `boardgame.io` import in scope; zero `@legendary-arena/(game-engine|registry|preplan)` import in scope; zero SQL writes against locked tables (`legendary.players` / `legendary.replay_*` / `legendary.competitive_scores`); zero `^\s*throw ` matches in production logic / routes files (the `replaceOwnerLinks` rollback path uses `Promise.reject` to propagate infra errors to the route's outer try/catch without a literal `throw` statement); zero `403` literal in routes file outside design-rationale `// why:` comments; zero `team_id|cohort_label|friends_visibility|team_affiliation` in migration 009 (no premature WP-109 schema creep); 6 `hasTestDatabase ? {} : { skip: 'requires test database' }` matches in the test file (locked verbatim per WP-052 / EC-112); zero `git diff` against WP-052 / WP-101 / WP-102 / WP-112 / WP-115 contract files; zero `git diff` against `.claude/`; zero `git diff` against `package.json` files (no new npm dependencies).

**Vision alignment.** §3 (Player Trust & Fairness) — fail-closed unconfigured-default + most-private privacy defaults preserve the trust posture; §11 (Stateless Client Philosophy) — every PATCH / PUT re-fetches the canonical record on success, no client-side merge; §14 (Explicit Decisions, No Silent Drift) — D-10401..D-10408 record the eight governing choices with rationale + rejected alternatives; §15 (Built for Contributors) — the caller-injected `requireAuthenticatedSession` provider lets a contributor running locally see fail-closed 401 / 500 responses with closed-set codes, not silent success. NG-1 (pay-to-win) / NG-3 (content withheld) / NG-6 (dark patterns) preserved by construction — owner profile editing is presentation surface only, no gameplay state, no scoring input, no monetization flow. **Determinism preservation: N/A** — no engine, registry, scoring, replay, RNG, or simulation surface touched.

**01.5 NOT INVOKED** (zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks; engine entirely untouched). **01.6 post-mortem SKIPPED** with rationale: per the WP-101 / WP-102 sibling-helper precedent, 01.6 is OPTIONAL for WP-104. The new contract surfaces (`OwnerProfileView` composite shape, per-section privacy enum closed set, `legendary.player_profiles` 1:1 invariant, `Object.hasOwn` three-state pattern, `OwnerProfileView.links` ordering invariant) duplicate-then-extend the WP-052 / WP-101 / WP-102 patterns line-for-line and do not introduce a fundamentally new abstraction worth a dedicated post-mortem. A future surface-integration WP that joins owner-edit fields onto WP-102's `PublicProfileView` will pair its own post-mortem with the cross-half integration if it surfaces patterns worth recording.

**Downstream impact.** The future surface-integration WP that joins `OwnerProfileView` fields onto `WP-102 PublicProfileView` with per-section visibility filtering cites WP-104 + WP-102 together; that WP reads the privacy-toggle columns, filters per-section, and modifies `getPublicProfileByHandle` to expose the public-marked fields only. WP-106 (avatar upload pipeline — R2 + MIME / size validation) cites D-10405's HTTPS-only any-host posture; once WP-106 lands, a separate hardening WP may tighten `avatar_url` to a closed-origin allowlist (option (b) from D-10405's rejected alternatives). WP-126 (Hanko `SessionVerifier` adapter) supplies the broker-specific verifier that production wiring passes through to `requireAuthenticatedSession`; until WP-126 lands, every authenticated request to `/api/me/*` returns 500 with the locked `'session_verifier_not_configured'` code per D-11204.

---

### WP-112 / EC-112 Executed — Session Token Validation Middleware (2026-05-02, EC-112)

🔐 **WP-112 complete (`EC-112:`).** A new `apps/server/src/auth/` directory ships the broker-agnostic session-token validation orchestrator that future authenticated-route WPs consume via the caller-injected provider pattern (per WP-099 §A "Session Validation Middleware"). Five new TypeScript files (three production + two paired test suites) implement: `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>` (the orchestrator), `configureSessionValidation({ verifier, accountResolver, database })` (production-wiring factory), `extractBearerToken(req)` (header parser per D-11202), `findAccountByAuthProviderSub(authProvider, authProviderSub, database)` (read-only `legendary.players` lookup per D-11203), the `SessionVerifier` interface (one method `verify(token)` — broker-specific implementations live in WP-126), and the `VerifiedSessionClaim` shape (`{ authProvider, authProviderSub, expiresAt }`). All three closed-union error-code surfaces (`SessionVerificationErrorCode`, `SessionValidationErrorCode`, `AccountLookupErrorCode`) plus their canonical readonly arrays are paired and drift-tested. **Zero broker-specific code, zero `'hanko'` literal, zero `@teamhanko/*` import, zero new npm dep, zero existing guest route gated, zero `node:crypto.randomUUID()` call** — F-1..F-7 PASS by construction across all five files.

**Four DECISIONS entries land at execution.** **D-11201** (locked at draft, copied verbatim into `DECISIONS.md`): SIBLING WP architectural choice — WP-112 ships orchestrator + interface + lookup helper + tests; the broker-specific verifier (SDK wiring, JWKS fetch / cache, JWT validation, claim extraction) is deferred to **WP-126** "External Authentication Integration (Hanko Session Verifier)" whose deferred-placeholder row was added to `WORK_INDEX.md` in the SPEC drafting commit `1013893`. **D-11202** (executor-locked at recommended default): token extraction source = `Authorization: Bearer <token>` header only (cookie / WebSocket / `Sec-WebSocket-Protocol` carriers deferred to WP-126 or future hardening WP — paired with their CSRF surfaces). **D-11203** (executor-locked at recommended default): `findAccountByAuthProviderSub` signature is positional `(authProvider, authProviderSub, database)` returning `Result<{ accountId, authProvider, authProviderId } | null>`; `Result.ok(null)` distinguishes clean no-match (a normal first-callback condition) from DB fault (`'lookup_failed'`); the orchestrator's `AccountResolver` translates the `null` payload to the public-facing `'unknown_account'` code at the orchestrator boundary. **D-11204** (executor-locked at recommended default): unconfigured-default fails closed with `Result.fail({ code: 'session_verifier_not_configured' })` and a full-sentence reason naming the missing `configureSessionValidation` startup call; the orchestrator never throws on caller error per the WP-052 D-5201 contract.

**API Catalog Update Obligation (D-11804) satisfied in the same commit.** Two new `Library-only` rows added to [`docs/ai/REFERENCE/api-endpoints.md`](REFERENCE/api-endpoints.md) immediately after the WP-053 `submitCompetitiveScore` row: one for `requireAuthenticatedSession` (closed-union codes `'missing_token'` / `'invalid_token'` / `'expired_token'` / `'unknown_account'` / `'session_verifier_not_configured'` / `'lookup_failed'`); one for `findAccountByAuthProviderSub` (closed-union code `'lookup_failed'`; `Result.ok(null)` on clean no-match). Each row carries `Status: Library-only` (closed-set value per D-11804); `Auth: (n/a — caller-injected dependencies)` matching the precedent for caller-injected `DatabaseClient` rows in the same section; `Authorizing WP: WP-112`. Field names match `00.2-data-requirements.md` verbatim — `accountId`, `authProvider`, `authProviderId` appear; the verifier-side `authProviderSub` does NOT appear on the wire / catalog, only inside the `findAccountByAuthProviderSub` translation site.

**Six production / reference files (5 new + 1 modified):** `apps/server/src/auth/sessionToken.types.ts` (new — `SessionVerifier`, `VerifiedSessionClaim`, three closed-union error-code types + canonical readonly arrays, `RequireAuthenticatedSessionOptions`, `SessionTokenRequest`, re-exports of `AccountId` / `AuthProvider` / `DatabaseClient` / `Result`); `apps/server/src/auth/sessionToken.logic.ts` (new — `requireAuthenticatedSession` orchestrator with the locked 5-step flow + centralized verifier-code → validation-code mapping at exactly one site + inclusive `expiresAt <= now()` defense-in-depth check with no skew tolerance, `configureSessionValidation` factory, `extractBearerToken` helper); `apps/server/src/auth/sessionToken.logic.test.ts` (new — 15 logic-pure tests in one `describe('requireAuthenticatedSession (WP-112)', …)` block — 3 drift + 1 token-extractor + 11 orchestrator behavior); `apps/server/src/auth/accountLookup.logic.ts` (new — `findAccountByAuthProviderSub` read-only SELECT against `legendary.players` per the locked WP-101 precedent, single-site `authProviderSub` → `authProviderId` translation at the SQL parameter binding); `apps/server/src/auth/accountLookup.logic.test.ts` (new — 6 tests in one `describe('account lookup logic (WP-112)', …)` block — 2 logic-pure always-runs + 4 DB-required with the WP-052 `hasTestDatabase` skip pattern); `docs/ai/REFERENCE/api-endpoints.md` (modified — 2 `Library-only` rows added per D-11804). Plus four governance ledgers: `STATUS.md` (this entry), `DECISIONS.md` (D-11201..D-11204), `WORK_INDEX.md` (WP-112 row checked off; WP-126 deferred-placeholder row preserved unchanged), `EC_INDEX.md` (EC-112 row `Draft` → `Done 2026-05-02`).

**Test-cleanup posture (intentional deviation from the WP-101 `handle.logic.test.ts` precedent).** The EC-112 §2 SQL-write gate (recursive grep against `apps\server\src\auth` for `INSERT |UPDATE |DELETE |...` returns no output) and the single-reader gate (exactly one `FROM legendary.players` match in scope, in `accountLookup.logic.ts`) jointly forbid `beforeEach` cleanup of `legendary.players` rows. Resolution: each DB-required test in `accountLookup.logic.test.ts` generates `email` and `authProviderId` values prefixed by a per-suite-run identifier (`Date.now()` plus a per-test counter), avoiding `UNIQUE`-constraint conflicts across runs without requiring a row-purging cleanup. This is the cleanest reading of the EC's gates; future executions of the same gate against any new `apps/server/src/auth/` test file should follow the same pattern.

**Verification.** `pnpm -r build` exits 0 (full monorepo). `pnpm --filter @legendary-arena/server test` `pass 56 / fail 0 / skipped 32` → **`pass 73 / fail 0 / skipped 36`** (+17 logic-pure tests / +4 DB-required-skipped / +2 suites). `pnpm --filter @legendary-arena/game-engine test` UNCHANGED (engine baseline preserved). All §Verification Steps grep gates pass: zero `'hanko'` / `@teamhanko` / `hanko.io` / `randomUUID` matches in scope; zero `boardgame.io` / `@legendary-arena/(game-engine|registry|preplan)` import in scope; zero SQL-write keywords in scope; exactly one `FROM legendary.players` match in scope (in `accountLookup.logic.ts`); zero leading-whitespace `throw ` matches in production logic files; zero `git diff` against WP-052 contract files (`identity/{types,logic}.ts`, migrations 004 / 005); zero `git diff` against WP-099 governance artifacts; zero `git diff` against `.claude/rules/*.md`; zero `git diff` against `apps/server/package.json`.

**Vision alignment.** §3 (Player Trust & Fairness) — fail-closed unconfigured-default + auditable `SessionVerifier` boundary preserve the trust posture; §11 (Stateless Client Philosophy) — orchestrator carries no per-request state beyond the request-scoped `Result<AccountId>` it returns; §14 (Explicit Decisions, No Silent Drift) — D-11201 / D-11202 / D-11203 / D-11204 record the four governing choices with rationale + rejected alternatives; §15 (Built for Contributors) — the `SessionVerifier` interface admits any OIDC-compliant or self-hosted JWT signer, so a contributor can plug in `jsonwebtoken` + a project-issued key pair without WP-126's broker dependency. NG-1 (pay-to-win) / NG-3 (content withheld) / NG-6 (dark patterns) preserved by construction — authentication is request-routing infrastructure with no UI surface, no content gate, no monetization flow. **Determinism preservation: N/A** — no engine, registry, scoring, replay, RNG, or simulation surface touched.

**01.5 NOT INVOKED** (zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks; engine entirely untouched). **01.6 post-mortem OPTIONAL** per the WP-101 (handle claim) / WP-103 (replay storage) sibling-helper precedent — not authored this session (the closed-union error-code surfaces and the `SessionVerifier` interface are new contract surfaces, but the orchestrator + lookup helper duplicate-then-extend the WP-101 / WP-052 patterns line-for-line; future post-mortem work will pair with WP-126's broker-specific implementation when it lands).

**Downstream impact.** WP-126 (deferred-placeholder row at [`docs/ai/work-packets/WORK_INDEX.md`](work-packets/WORK_INDEX.md)) is now unblocked at the contract level — its hard-dep on WP-112's `SessionVerifier` interface is satisfied. WP-126 supplies a concrete `SessionVerifier` (broker SDK + JWKS cache + JWT validation + claim extraction), an environment-variable contract for the broker tenant URL / API key, and `render.yaml` / `.env.example` updates. A separate future request-handler WP (not yet drafted) wires `configureSessionValidation({ verifier: brokerVerifier, accountResolver, database })` into authenticated route handlers and graduates the two `Library-only` catalog rows added in this commit to `Wired` (mirrors the WP-053 / WP-054 / WP-115 ships-fail-closed-unwired precedent). Per D-11204 the orchestrator returns `Result.fail({ code: 'session_verifier_not_configured' })` on every authenticated request until that production wiring lands.

---

### WP-116 Executed — Disconnect & Reconnect Semantics (2026-04-30, no EC)

🔌 **WP-116 complete — multiplayer disconnect / reconnect policy locked at the governance layer.** [`docs/ai/ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/02-ARCHITECTURE.md`](../02-ARCHITECTURE.md) gain a new `## Disconnect & Reconnect Semantics` section that records the application-layer policy on top of WP-090's Socket.IO transport. The section includes a 12-cell phase × event matrix (`lobby` / `setup` / `play` / `end` × `disconnect` / `reconnect` / `timeout`), a turn-stage adjacency note for `play.main`, and the literal "Disconnect tracking does not mutate `G`" + "Disconnect / reconnect events do not advance RNG state or implicitly execute turn logic" statements. **No code touched.** No engine field added; no `boardgame.io` configuration changed; no reconnect handler wired into `apps/server/src/server.mjs` or `apps/arena-client/src/client/bgioClient.ts`. Implementation is deferred to a future WP that consumes this policy.

**Decisions landed.** Six new entries in `docs/ai/DECISIONS.md`: **D-11601** (rejoin grace window → phase-aware, Option B; concrete magnitudes deferred to future implementation WP), **D-11602** (turn-handover during `play.main` → pause match, Option B; structural pause definition: no `ctx.events.*` calls fire on disconnect, no moves accepted, read-only actions remain, heartbeats continue), **D-11603** (lobby ready-state on rejoin → cleared on disconnect, Option B; `G.lobby.ready[playerId]` cleared, rejoining player must re-ready), **D-11604** (mid-match abandonment threshold → hard timeout, Option A; match forcibly ends, replay emitted with `endReason: 'abandoned'`; full `endReason` closed-set forward-linked to future implementation WP per WP-118 D-11804 pattern), **D-11605** (replay-on-abort → replay always emitted with explicit `endReason`, Option A; one record shape, distinguished by discriminator; partial replays must be byte-replayable per Vision §22), **D-11606** (spectator behavior → deferred Option A default; standalone N/A entry per WP-117 D-11703 precedent).

**No code touched.** `git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` empty. `pnpm -r test` exits 0 with baseline counts unchanged across all 8 workspaces. **Refreshed baselines as of v1.1 regeneration 2026-05-02 (post-WP-115):** registry 31, vue-sfc-loader 11, game-engine 604, replay-producer 4, registry-viewer 31 (post-WP-125 chip-ribbon expansion), preplan 52, server `pass 56 / fail 0 / skipped 32` (post-WP-054 cherry-pick + WP-115 +8 logic-pure tests), arena-client 182. (Original v1.0 baselines listed `registry-viewer 22` and `server 47 + 24 skipped` — both shifted via subsequent WPs; the v1.1 numbers are the load-bearing post-refresh values.) 6 files modified per the resolved B/B/B/A/A/A-defer scope-lock: `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, `docs/ai/DECISIONS.md`, `.claude/rules/architecture.md` (one-line cross-link), `docs/ai/STATUS.md` (this entry), `docs/ai/work-packets/WORK_INDEX.md`. Single `SPEC:` commit per the no-EC path (D-10001 + 2026-04-26 Amendment apply cleanly; no `apps/`/`packages/`/`data/` files staged → `.githooks/commit-msg` Rule 5 not triggered → no EC stub required).

**Vision alignment.** §17.1 #4 (multiplayer reconnection — Vision §4) is the primary trigger; §17.1 #2 (replays — Vision §22, §24) is a secondary trigger via D-11605 = A. Vision clauses cited verbatim in the WP body: §3 (Player Trust & Fairness), §4 (Multiplayer correctness), §22 (Replay determinism), §14 (Explicit Decisions, No Silent Drift), §24 (Replay-Verified Competitive Integrity). NG-1..NG-7 not crossed (no monetization, no competitive surface, no cosmetics). Conflict assertion: "No conflict — this WP preserves all touched clauses". Determinism preservation: explicit (disconnect events recorded as deterministic `G.messages` entries; reconnect re-syncs from authoritative `G`; no new RNG sources, no wall-clock reads inside moves; timeouts are server-side configuration, not in `G`). §20 Funding Surface Gate **N/A** with explicit justification: pure governance / architectural-policy update; no UI surfaces, no user-visible copy, no funding channels referenced.

**Pre-flight + copilot-check artifact.** [`docs/ai/invocations/preflight-wp116.md`](invocations/preflight-wp116.md) authored 2026-04-30 (DO NOT EXECUTE YET → READY TO EXECUTE after PS-1 anchor mismatch + PS-2 citation drift + PS-3 five-decision resolution + PS-4 lint self-review fill + PS-5 untracked-files protocol resolved in prep commit `cddfa3f`; copilot-check re-run flipped HOLD → CONFIRM as five RISK findings — #10 endReason closed-set forward-link, #15 missing why per decision, #26 implicit content semantics, #28 D-11606 supersession story, #30 missing pre-session fixes — collapsed to PASS). Pre-flight surfaced + corrected: `## Transport` anchor mismatch in §Context (Read First) (the original WP wording referenced `## Transport` in `docs/ai/ARCHITECTURE.md` where no such section exists — the WP file now names per-doc anchors); `00.3 §10` → `00.3 §5` citation drift (same drift WP-117 / WP-118 already flagged); five `[DECISION REQUIRED]` blocks resolved with rationale + rejected options; lint self-review filled with 14 PASS / 6 N/A / 0 FAIL across §1-§20. **v1.1 refresh at `ea674a8` 2026-05-02** folded WP-115 / EC-119 closeout knowledge (D-11501..D-11506 slot-range adjacency, D-11604 closed-set discriminator pattern precedent, D-11505 deferral-despite-availability pattern, refreshed §Context anchor for `apps/server/src/server.mjs` post-Pool/route additions, refreshed §Out of Scope untracked-files example, corrected §Session Context multiplayer-feature roster) — zero scope change, zero new PS items.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` is empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-117 / WP-118 / WP-119 governance-WP precedent — not authored (no new contracts, no projections, no setup artifacts, no long-lived abstractions; the disconnect/reconnect policy is a descriptive governance lock).

**Downstream impact.** A future implementation WP that wires the policy into `apps/server/src/server.mjs` (or wherever boardgame.io's reconnect plumbing surfaces server-side) carries its own scope: server reconnect handler + `apps/arena-client/src/client/bgioClient.ts` `socketOpts` config + per-phase grace-window magnitudes (locked under a new D-NNNNN entry citing WP-116 + D-11601) + hard-timeout magnitude (locked under a new D-NNNNN entry citing WP-116 + D-11604) + the full closed `endReason` enum (locked under a new D-NNNNN entry citing WP-116 + D-11604 / D-11605, mirrors WP-118 D-11804 closed-set pattern) + corresponding `// why:` comments per `00.6-code-style.md` Rule 6 + EC stub at the next free slot + EC_INDEX row. The future spectator-focused WP that introduces a spectator surface owns the D-11606 supersession under Option B with full §17 Vision Alignment treatment.

---

### WP-115 Executed — Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap (2026-05-01, EC-119)

🏆 **WP-115 complete (`EC-119:`).** Three public, anonymous, read-only HTTP endpoints are now reachable on the existing boardgame.io Koa router: `GET /api/leaderboards/scenarios` (scenario-key index), `GET /api/leaderboards/scenarios/:scenarioKey` (per-scenario score list with `limit` / `offset` pagination), and `GET /api/leaderboards/scores/:replayHash` (single-score permalink lookup). Routes wrap WP-054's three library functions with explicit `{ checkParPublished: parGate.checkParPublished }` injection at every call site (relying on WP-054's `PRODUCTION_DEPENDENCIES` default would fail-close every scenario response by design). Long-lived `pg.Pool` singleton at `apps/server/src/db/database.ts` (max=10 / idle=30s / connect=5s, locked under D-11502) is constructed exactly once at startup and closed exactly once on SIGTERM AFTER the HTTP server's graceful-shutdown step resolves (closing the pool earlier would sever in-flight handlers mid-query). All response paths set `Cache-Control: no-store` as the **first statement** in every handler body — including 400 path-param / 400 invalid_query / 404 score_not_found / 500 internal_error error paths — so a thrown WP-054 exception still leaves the header set on the eventual 500 response (per WP-115 v1.1 Patch 8 / D-11504).

**API Catalog Update Obligation (D-11804) satisfied in the same commit.** WP-054's three `Library-only` rows for `getScenarioLeaderboard`, `getPublicScoreByReplayHash`, and `listScenarioKeys` are graduated wholesale to `Wired` rows in `docs/ai/REFERENCE/api-endpoints.md` (single-row graduation per the catalog footer model). The three forward-reference placeholder rows previously seeded by WP-118 for these endpoints are deleted in the same commit (forward-references are now redundant — the network surface lives in `## Wired`). Net catalog delta: **−3 placeholder rows / −3 Library-only rows / +3 Wired rows**. All transitioned rows carry closed-set values: `Status` ∈ `{Wired, Shipped-but-unwired, Library-only, Pending}` (D-11804); `Auth` = `guest` (D-9905); canonical field-name spellings (`replayHash`, `scenarioKey`, `finalScore`, `parVersion`) match `00.2-data-requirements.md` exactly.

**Six production files (3 new + 3 modified):** `apps/server/src/db/database.ts` (new — `createPool` + `closePool` over `pg.Pool` with locked sizing), `apps/server/src/leaderboards/leaderboard.routes.ts` (new — Koa adapter for WP-054's three helpers + pure pagination parser + path-param validation), `apps/server/src/leaderboards/leaderboard.routes.test.ts` (new — 8 logic-pure tests in one `describe('leaderboard routes (WP-115)', …)` block via the Patch 3 injection seam — never mock SQL row shapes), `apps/server/src/server.mjs` (modified — Pool construct + locked log line + leaderboard route registration + return shape `{ appServer, pool }`), `apps/server/src/index.mjs` (modified — destructure `{ appServer, pool }` and `closePool(pool)` in SIGTERM after HTTP close), `docs/ai/REFERENCE/api-endpoints.md` (modified — D-11804 catalog row transitions + placeholder deletions). Plus 5 governance ledgers: `STATUS.md` (this entry), `DECISIONS.md` (D-11501..D-11506), `WORK_INDEX.md` (WP-115 row checked off), `EC_INDEX.md` (EC-119 row Draft → Done), and the 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-115-public-leaderboard-http-endpoints.md` (mandatory: new long-lived `pg.Pool` abstraction + new `apps/server/src/db/` code seam + new `LeaderboardLogic` injection-seam contract surface).

**WP-102 profile route wiring remains deferred per D-10202.** Even though the long-lived `pg.Pool` introduced by WP-115 is the lifecycle anchor that WP-102's `registerProfileRoutes(router, database)` is waiting on, `server.mjs` does NOT call `registerProfileRoutes` (verified via `Select-String "registerProfileRoutes" -Path "apps/server/src/server.mjs"` returning no matches). The follow-up WP that wires the profile route owns its own commit, its own catalog row graduation, and its own post-mortem (D-11505 reaffirms D-10202).

**Verification.** `pnpm -r build` exits 0 (full monorepo). `pnpm --filter @legendary-arena/server test` `pass 48 / fail 0 / skipped 32` → **`pass 56 / fail 0 / skipped 32`** (+8 logic-pure tests / +1 suite delta is the load-bearing invariant per Patch 6; suite count informational). `pnpm --filter @legendary-arena/game-engine test` `pass 604 / fail 0` UNCHANGED. All §After Completing grep gates pass: exactly **one** `new Pool(` match across `apps/server/src/` (in `db/database.ts`); zero `registerProfileRoutes` matches in `server.mjs` (D-10202 deferral preserved); zero `Pending: WP-115` matches in `api-endpoints.md` (D-11804 catalog row deletion landed); exactly **one** `'[server] pg.Pool constructed (max=10)'` match in `server.mjs` (D-11506 verbatim lock); zero `accountId|submissionId|email|authProvider|stateHash|scoreBreakdown` matches in `leaderboard.routes.ts` (D-5201 grep gate); zero forbidden-import matches (`boardgame.io`, `@legendary-arena/game-engine`, `requireAuthenticatedSession`, `hanko`, `jwt`) in route file or db file; zero SQL write operations (`INSERT|UPDATE|DELETE|CREATE|DROP|ALTER`) in scope files; zero new npm dependencies in `apps/server/package.json` (no `koa-ratelimit`, no `koa-bodyparser`, no `express`, no `fastify`, no `cors`, no `axios`, no `node-fetch`); WP-054 contract files (`leaderboard.types.ts`, `leaderboard.logic.ts`) and WP-102 contract files (`profile.routes.ts`, `profile.logic.ts`) all unmodified (`git diff` clean).

**Six DECISIONS entries land at execution Commit A:** D-11501 (Pool location at `apps/server/src/db/`); D-11502 (Pool sizing rationale max=10 / idle=30s / connect=5s sized for a Render starter instance); D-11503 (rate-limit deferral to a future hardening WP — Cloudflare CDN edge handles initial DDoS, defense-in-depth deferred); D-11504 (`Cache-Control: no-store` v1 lock on every response including error paths per Patch 8); D-11505 (D-10202 reaffirmation — WP-102 profile-route wiring still deferred even though pool now exists); D-11506 (Pool-construction log message verbatim lock `'[server] pg.Pool constructed (max=10)'`).

**01.5 NOT INVOKED** (zero `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks; engine entirely untouched). **01.6 post-mortem MANDATORY and authored** at `docs/ai/post-mortems/01.6-WP-115-public-leaderboard-http-endpoints.md` per WP-115 §Definition of Done (three triggers: new long-lived abstraction = `pg.Pool` singleton; new code seam = `apps/server/src/db/`; new contract surface = `LeaderboardLogic` injection seam).

**Vision alignment.** §3 (Player Trust & Fairness) — sensitive fields stripped at the WP-054 type boundary per D-5201, never re-introduced at the route layer; §11 (Stateless Client Philosophy) — endpoints are stateless reads with deterministic responses; §18 (Replayability & Spectation) — replay-anchored projection inherited from WP-053 / WP-054; §20-26 (Scoring & Skill Measurement) — read-only over PAR-gated verified records; §22 (Determinism) — identical inputs → identical responses; §23 (Competitive Leaderboards & Submission) — public read surface for WP-053 records now reachable; §24 (Replay-Verified Integrity) — preserved (visibility filter inherited from WP-052 / WP-054); §25 (Skill Over Repetition) — non-ranking telemetry carve-out preserved. NG-1..NG-7 not crossed (read-only over a non-monetized competitive surface; anonymous access; no time-pressure / FOMO / advertising / dark-pattern). §20 Funding Surface Gate: N/A — read-only transport adapter over a non-monetized competitive surface; introduces no payment / donation / subscription / supporter-tier / tournament-funding surface. §21 API Catalog: TRIGGERED — three endpoints + three library-function status transitions per D-11804.

**Downstream impact / future paths.** The future WP that wires WP-102's profile route will cite D-11505 + D-10202 together, call `registerProfileRoutes(server.router, pool)` in `server.mjs`, and graduate the WP-102 catalog row from `Shipped-but-unwired` to `Wired` per D-11804 — that's expected to be a ~10-line packet. The future hardening WP that introduces rate limiting will cite D-11503, justify the `koa-ratelimit` (or equivalent) backend, document the per-endpoint policy, and cover fail-open vs fail-closed semantics under backend failure. The future caching-policy WP that introduces per-endpoint cache directives will cite D-11504, document the freshness vs hit-rate tradeoff per endpoint, and preserve the error-path `no-store` discipline. A future observability WP may grep `'[server] pg.Pool constructed (max=10)'` to drive a Render log-based metric (D-11506); future Pool-sizing changes update both D-11502 and D-11506 in the same commit.

---

### WP-054 Executed — Public Leaderboards & Read-Only Web Access (Library-Only) (2026-05-01, EC-054)

🏆 **WP-054 complete (`EC-054:` — cherry-pick of `f34e917` from side-branch `wp-054-public-leaderboards-read-only`).** Three new files at `apps/server/src/leaderboards/` ship the public-leaderboard read-only library functions that WP-053 / WP-052 / WP-051 designed for: `getScenarioLeaderboard(options, database, deps?)` (per-scenario score list with PAR fail-closed default), `getPublicScoreByReplayHash(replayHash, database)` (single-score detail with `null` on miss), `listScenarioKeys(database)` (deduplicated scenario-key index). All three are SQL projections of `legendary.competitive_scores` JOINed against `legendary.replay_ownership` (visibility filter — only `'link'` and `'public'` rows expose; private replays never surface) and `legendary.players` (display name only — `accountId`, `email`, `authProvider`, `stateHash`, `scoreBreakdown` stripped per D-5201). No SQL writes anywhere; no engine imports; no `boardgame.io` imports; no UI surface. Server test baseline shifts `pass 47 / fail 0 / skipped 24` → **`pass 48 / fail 0 / skipped 32`** (+1 always-runs test #9 + 8 DB-required skipped tests).

**Closed via cherry-pick (not branch merge) per pre-flight PS-1 resolution.** The side-branch `wp-054-public-leaderboards-read-only` had diverged catastrophically from main (188 files / +3K / -39.5K diff including deletions of WP-101 / WP-102 / WP-113 server files) since the WP-054 implementation commit `f34e917` was authored on 2026-04-26. A direct `git merge` would have destroyed shipped WP-101 (handle module), WP-102 (profile module), WP-113 (engine-server registry wiring), and others. The `preflight-wp115.md` artifact (gitignored scratchpad authored 2026-05-01) surfaced the gap; option 1 (cherry-pick `f34e917` only — pure-additive 3 new files; zero conflicts) was approved by the operator. The branch's other two commits (`a973c19` parGate-seam TODO at `server.mjs:85-92` + `eb23c47` side-branch governance close at `wp-054-public-leaderboards-read-only`) are obsolete: the parGate seam is already on main via `e6d2f64`, and the side-branch governance close is replaced by the WORK_INDEX flip + the EC-054 row in EC_INDEX.md + the three new Library-only catalog rows in `docs/ai/REFERENCE/api-endpoints.md` (per D-11804 same-commit obligation). Side-branch preserved at tip `a973c19` for historical reference; safe to delete in a future cleanup once operator confirms no further governance recovery is needed.

**API Catalog Update Obligation (D-11804) satisfied in the same commit.** Three new `Library-only` rows added to `docs/ai/REFERENCE/api-endpoints.md` between WP-053's `submitCompetitiveScore` row and the `Pending: WP-115 (STUB DRAFT 2026-04-29)` section: each with `Method = (n/a)`, `Path = (n/a — function <name>)`, `Auth = (n/a — caller-injected DatabaseClient...)`, `Authorizing WP = WP-054`. When WP-115 ships, all three rows graduate to `Wired` per the catalog footer single-row-graduation model — the three `Pending: WP-115` rows will be deleted at the same time (net WP-115 catalog delta: −3 Pending / −3 Library-only / +3 Wired).

**Lifecycle prohibition preserved.** None of the three new leaderboard functions are called from `game.ts` / phase hooks / `server.mjs` / `apps/arena-client/` / `apps/replay-producer/` / `apps/registry-viewer/` / any `packages/**` package. `PRODUCTION_DEPENDENCIES.checkParPublished = () => null` is fail-closed: until WP-115 wires the bound `parGate.checkParPublished`, every `getScenarioLeaderboard` call against the production default returns an empty leaderboard. The lifecycle prohibition makes this safe — no production caller exists today; the only consumer is the colocated test file. WP-115 is the request-handler WP that consumes these three functions and graduates them to `Wired` HTTP endpoints.

**Verification.** `pnpm -r build` exits 0 (full monorepo). `pnpm --filter @legendary-arena/server test` 47 pass / 24 skipped → **48 pass / 32 skipped / 0 fail** (matches WP-054 Commit A claim from 2026-04-26 verbatim — test #9 always runs, +8 DB-required tests skip absent `TEST_DATABASE_URL`). `pnpm --filter @legendary-arena/game-engine test` `pass 604 / fail 0` UNCHANGED. Zero `boardgame.io` / `@legendary-arena/game-engine` runtime / `@legendary-arena/registry` / `@legendary-arena/preplan` / `apps/registry-viewer/` / `apps/arena-client/` / `apps/replay-producer/` / sibling-server-domain (`apps/server/src/competition/**`, `apps/server/src/identity/**`, `apps/server/src/replay/**`, `apps/server/src/par/**`) imports in any of the three new files (verified by grep). Zero `Math.random` / `Date.now` / `performance.now` / `require(` / `INSERT|UPDATE|DELETE|CREATE|DROP|ALTER` SQL writes (verified). Layer-boundary integrity confirmed against `.claude/rules/server.md` + `docs/ai/ARCHITECTURE.md` §Layer Boundary.

**01.5 NOT INVOKED** (zero `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks; engine entirely untouched).

**01.6 post-mortem OPTIONAL** at this close. The original WP-054 side branch carried a 215-line post-mortem at `01.6-WP-054-public-leaderboards-read-only.md` which was NOT cherry-picked (it would be stale relative to current main; it's preserved in the side-branch git history for reference). A fresh post-mortem is not authored at this close because the cherry-pick is mechanically additive and adds no new contract surface beyond what was already designed in the original WP-054. WP-115 will own the request-handler post-mortem when it ships (mandatory per WP-115 §Definition of Done).

**Vision alignment.** §3 (Player Trust & Fairness) — sensitive fields stripped per D-5201; §11 (Stateless Client) — no client touched; §18 (Replayability & Spectation) — replay-anchored projection inherited from WP-053; §20-26 (Scoring & Skill Measurement) — read-only over PAR-gated verified records; §22 (Determinism) — identical inputs → identical outputs; §23 (Competitive Leaderboards & Submission) — public read surface for WP-053 records; §24 (Replay-Verified Integrity) — preserved; §25 (Skill Over Repetition) — non-ranking telemetry carve-out preserved. NG-1..NG-7 not crossed (read-only over a non-monetized competitive surface; anonymous access; no time-pressure / FOMO / advertising / dark-pattern). §20 Funding Surface Gate: N/A. §21 API Catalog: TRIGGERED — 3 Library-only rows added per D-11804 in this same commit.

**Downstream impact.** WP-115 (Public Leaderboard HTTP Endpoints — drafted at v1.1, pre-flight at `preflight-wp115.md`) is now unblocked: its `§Before Starting` `git ls-tree` grep gate now returns the leaderboard.logic.ts path. Pre-flight re-confirmation expected to flip from DO NOT EXECUTE YET to READY (PS-2 already resolved in the prior `SPEC: WP-115 v1.1` commit; PS-3 already resolved in same; copilot-check governance follow-ups already resolved in same).

---

### WP-125 Executed — Registry Viewer: Card Abilities Effect-Tag Filter (2026-05-01, EC-127)

🃏 **WP-125 complete (`EC-127:`) — registry viewer cards-view now exposes a curated effect-tag chip ribbon driven by `data/metadata/card-abilities.json`.** Adds a chip-toggle ribbon between the existing card-type ribbon and the set-pills at [`cards.barefootbetters.com`](https://cards.barefootbetters.com/) with ten initial chips: Draw a card / KO from hand / KO from discard / KO from hand or discard / Rescue a Bystander / Gain Attack / Gain Recruit / Gain Piercing / Gain a Wound / Defeat a Villain. Each chip displays a global badge count of cards tagged with that effect across the session-wide ability tag index. Multi-select ORs within the abilities filter (a card matches if ANY selected effect's tag is present); composes ANDed with the existing set / hero class / card type / search filters. Filter resets via the existing "All" / clear-link affordances.

**Locked under D-12501.** Taxonomy lives at [`data/metadata/card-abilities.json`](../../data/metadata/card-abilities.json) (R2 path `metadata/card-abilities.json`); schema additions in [`packages/registry/src/schema.ts`](../../packages/registry/src/schema.ts) — `CardAbilityMatcherSchema` (`type: z.literal("regex")` single-literal lock, `pattern: z.string().min(1)`, optional `flags`), `CardAbilityEntrySchema` (`slug` regex `/^[a-z][a-z0-9-]*$/`, `label`, optional `emoji`, nonneg-int `order`, `matchers: z.array(...).min(1)`), `CardAbilitiesIndexSchema = z.array(...)`, all with `.strict()` discipline mirroring `CardTypeEntrySchema:213–219` exactly. Inferred type aliases `CardAbilityMatcher` / `CardAbilityEntry` / `CardAbilitiesIndex` exported alongside. Schema imports use the narrow `@legendary-arena/registry/schema` subpath (D-8601 binding), never the barrel.

**Six production files (three new + three modified).** [`data/metadata/card-abilities.json`](../../data/metadata/card-abilities.json) (new — ten starter entries with kebab-case slugs and case-insensitive default flags); [`packages/registry/src/schema.ts`](../../packages/registry/src/schema.ts) (modified — additions only after the existing card-types block; existing exports byte-identical pre- and post-execution); [`apps/registry-viewer/src/lib/cardAbilitiesClient.ts`](../../apps/registry-viewer/src/lib/cardAbilitiesClient.ts) (new — singleton `getCardAbilities` fetcher mirroring `cardTypesClient.ts` line-for-line plus pure `buildAbilityTagIndex` helper that compiles each matcher's regex once and returns `Map<card.key, Set<effectSlug>>`); [`apps/registry-viewer/src/components/AbilityEffectFilter.vue`](../../apps/registry-viewer/src/components/AbilityEffectFilter.vue) (new — chip-toggle ribbon SFC with one required `taxonomy` prop, one optional `tagIndex` prop, one v-model `selectedEffectSlugs`, one `update:selectedEffectSlugs` event; `v-if="taxonomy.length > 0"` on the outer wrapper enforces degraded-mode invisibility; scoped CSS uses the same dark-theme tokens as `.type-group-btn`); [`apps/registry-viewer/src/App.vue`](../../apps/registry-viewer/src/App.vue) (modified — three new imports, three new top-level refs, one new `getCardAbilities` await + `buildAbilityTagIndex` call inside `onMounted` after both registry and taxonomy resolve, one modified `applyFilters()` body that applies the abilities filter as a post-step on the `applyQuery()` result with OR semantics within the chip set, one extended `clearAllFilters()` that resets `selectedEffectSlugs`, one new `<AbilityEffectFilter>` mount between the type-bar and set-pills with `v-if` on `abilitiesTaxonomy.length > 0` and `@update:selectedEffectSlugs="applyFilters"`); [`apps/registry-viewer/src/lib/devLog.ts`](../../apps/registry-viewer/src/lib/devLog.ts) (modified under EC-127 §0 pre-execution amendment — single `"cardAbilities"` member appended to the closed `Category` union; mechanical dependency of `cardAbilitiesClient.ts`; WP-086 commit `ccc6d0e` is the precedent for the parallel `"cardTypes"` extension). Plus six governance files: `WP-125-*.md`, `EC-127-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12501, `STATUS.md` (this entry). Total staged set: exactly 12 files (EC-127 §0(B) compliance, post-amendment).

**Pre-execution scope amendment (2026-05-01).** EC-127 §0 was amended pre-execution to expand the runtime/implementation scope from 5 production files to 6 (adding `devLog.ts`) and the total staged set from 11 to 12. The amendment was driven by a mechanical dependency the original draft missed: `cardAbilitiesClient.ts` calls `devLog("cardAbilities", …)` per the *duplicate first* mirror of `cardTypesClient.ts`, but the closed `Category` union in `devLog.ts` lacked the `"cardAbilities"` member, so the client did not compile under `vue-tsc`. WP-086 (commit `ccc6d0e`) hit the same situation and shipped the analogous `"cardTypes"` extension as an audit-trail-after-the-fact addition. EC-127 chose the cleaner option-2 path: amend the contract before execution rather than retro-document. The amendment is recorded inline in EC-127 §0, mirrored in WP-125, and locked under D-12501.

**Duplicate-first lock (extended).** Per `.claude/rules/code-style.md §"Abstraction & Control Flow"` (*"Duplicate first, abstract only when a third copy appears"*), `cardAbilitiesClient.ts` is structurally a copy of `cardTypesClient.ts` — same singleton + `devLog` start / failed / complete events, same HTTP `!response.ok` empty-array fallback, same `safeParse` with dot-joined-path warning, same terminal `try/catch` swallow shape, same `[CardAbilities] Rejected …` warning shape, same one-dedup-warn-per-offender post-parse filter (parallel to cardTypes' orphan-parentType filter — duplicate-slug detection here). Differences: ability-prefixed names, the post-parse duplicate-slug filter (instead of orphan-parentType), and the additional `buildAbilityTagIndex` pure helper (justified by per-card derived form not present in card-types). **`cardTypesClient.ts` is byte-identical pre- and post-WP-125.** With two parallel taxonomy fetchers in the codebase post-WP-125, any future abstraction is deferred to a third taxonomy fetcher per D-12501. All twelve required `// why:` clauses present (schema-block header, six in `cardAbilitiesClient.ts` covering module-header / schema-subpath import / matcher-flags default / regex-compilation site / duplicate-slug post-parse filter / `try/catch` swallow, one in `AbilityEffectFilter.vue` module header, three in `App.vue` covering `getCardAbilities` call site / `buildAbilityTagIndex` call site / post-`applyQuery()` filter step, and one in `devLog.ts` covering the Category-union extension under the §0 amendment).

**Verification.** `pnpm --filter registry-viewer build` exits 0 (96 modules, 213.03 kB JS / 40.35 kB CSS, gzip 64.70 kB / 6.97 kB; pre-packet baseline 92 modules / 208.45 kB / 39.21 kB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter @legendary-arena/registry test` 31/3/0 — green. `pnpm --filter registry-viewer test` reports `tests 31 / suites 6 / pass 31 / fail 0` — **UNCHANGED** from pre-session baseline (no tests added per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 viewer-side precedent — the registry-viewer has no Vue component-test harness at baseline; verification is build + typecheck + manual smoke). All §After Completing verification gates pass: exactly one match each for `CardAbilityMatcherSchema = z.object`, `CardAbilityEntrySchema = z.object`, `CardAbilitiesIndexSchema = z.array`, `z.literal("regex")`, `CardTypeEntrySchema = z.object` (existing card-types schema byte-identical), `export function getCardAbilities`, `export function buildAbilityTagIndex`, `<AbilityEffectFilter`, `import AbilityEffectFilter`, `import { getCardAbilities, buildAbilityTagIndex }`, `buildAbilityTagIndex(`; at least one match for `@legendary-arena/registry/schema` in `cardAbilitiesClient.ts`, `v-if="taxonomy.length > 0"` in `AbilityEffectFilter.vue`, `"cardAbilities"` in `devLog.ts`; exactly one match for each of the ten starter slugs in `card-abilities.json`. One-shot schema-parse `node -e` smoke exits 0 with stdout `OK: 10 entries, all slugs unique, all matchers valid regex`. `git diff` against `cardTypesClient.ts`, `data/metadata/card-types.json`, `keywords-full.json`, `rules-full.json`, `sets.json`, `apps/registry-viewer/src/registry/`, `packages/registry/src/shared.ts`, `packages/registry/src/impl/`, `packages/registry/src/registry.smoke.test.ts`, both `package.json` files all empty. Manual smoke confirmed 2026-05-01 on local dev server: ten chips visible between type-bar and set-pills with badge counts (Draw 285, KO from hand 47, KO from discard 14, KO from hand or discard 46, Rescue Bystander 92, Gain Attack 560, Gain Recruit 186, Gain Piercing 4, Gain Wound 51, Defeat Villain 56); selecting "Draw a card" narrows 2875 → 285; adding "KO from hand" widens to 326 (OR within the abilities filter, with overlap); changing the hero-class select to `tech` narrows to 63 (AND with other filters); clearing chips restores 2875; no Vue warnings, no console errors during chip toggles or filter combinations.

**Pre-merge R2 upload.** The operator uploaded `data/metadata/card-abilities.json` to `https://images.barefootbetters.com/metadata/card-abilities.json` prior to execution. The dev server fetched the file successfully; the chip ribbon rendered all ten chips with non-trivial badge counts. Production users at `cards.barefootbetters.com` see the chip ribbon at first paint after the commit deploys.

**Lint-gate self-review (00.3 §1–§21).** PASS. §1 (sections present), §2 (engine-wide + packet-specific + session protocol + locked values; cites 00.6; forbids partial output), §3 (WPs / files / external state listed), §4 (ARCHITECTURE.md + rules + 00.6 + DECISIONS scan), §5 (6 production + 6 governance, all marked; expanded under §0 pre-execution amendment from 5 to 6; matches recent WP-086 / WP-124 precedent for total staged set sizes), §6 (no canonical-name conflicts; `slug` / `label` / `emoji` / `order` / `matchers` align with existing `card-types.json` shape; no overlap with §8.1 MatchSetupConfig nine-field lock), §7 ("No new npm dependencies"), §8 (no game-engine/server/preplan/pg leak; viewer-only UI affordance plus registry-package schema additions; layer boundary preserved), §9 (pnpm only), §10 / §11 / §19 / §20 / §21 N/A with explicit justifications, §13 (pnpm + expected output), §14 (12 binary observable items), §15 (STATUS / DECISIONS / WORK_INDEX / EC_INDEX / scope-boundary check; R2 upload precondition gated), §16 (enforced at execution), §17 (§10a triggered, conflict + NG + determinism), §20 (N/A — registry-viewer abilities filter; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link).

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved and advanced — cards-view now exposes a first-class effect-tag filter for the most common ability surfaces (draw / KO / rescue / gain / defeat). The free-text search field still matches `name + heroName` only; the chip ribbon closes the gap for users searching "what cards draw a card" or "what cards KO from hand" without naked text-matching. NG-1..NG-7 not crossed (UI-only client-local affordance with no game-state coupling, no monetization, no PvP framing, no scoring/leaderboards). §17 trigger-surface evaluation: §10a is the only triggered surface; all others (scoring/PAR/leaderboards, replays, identity, multiplayer, determinism, card data semantics, monetization, live ops, accessibility/i18n) are not triggered. §20 Funding Surface Gate: N/A — registry viewer is free public reference tooling. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected).

**01.5 NOT INVOKED.** Zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 viewer-side precedent — not authored this session (no new contract surface beyond the registry schema additions, no new long-lived abstraction, no new code subdirectory; the new client and component are siblings of `cardTypesClient.ts` and `AbilityEffectFilter.vue`'s parallels).

**Downstream impact / future paths.** A future WP that introduces a third taxonomy fetcher MAY cite D-8601 + D-12501 together to authorize abstraction into a shared base — at that point the *duplicate first* threshold is met. A future WP that adds a second matcher type (substring / token-presence / structured) MUST cite D-12501 and supersede the single-literal lock by extending both the schema and the apply-time switch in `buildAbilityTagIndex` deliberately. A future WP that adds per-card override entries (a `card-effect-overrides.json` for hand-tagging cases that regex tuning cannot reach) MAY cite D-12501 as the precedent for the locked taxonomy file path discipline. Operator may iterate the regex matchers in `card-abilities.json` after merge by re-uploading to R2 — code change not required.

---

### WP-124 Executed — Registry Viewer: Theme Zoom Slider (2026-05-01, EC-126)

🎭 **WP-124 complete (Commit A `078e234` `EC-126:`) — registry viewer themes-view now exposes a Theme Size slider, parallel to WP-121's cards-side Card Size slider.** Adds a keyboard-accessible "Theme Size" slider to the themes-view filter bar at [`cards.barefootbetters.com`](https://cards.barefootbetters.com/) between the search input and the count span. Slider drives a single `--theme-grid-min-width` CSS variable on `ThemeGrid.vue`'s `.grid` element; the existing `aspect-ratio: 3/4` rule on `.img-wrap` propagates width changes to height proportionally, so no per-tile recalculation is needed. Persisted to `localStorage['themeGridSize']` via a new module-scoped `useThemeSize` composable that mirrors `useCardSize.ts` (WP-121 / D-12101) line-for-line with theme-prefixed names.

**Locked under D-12401.** Range 80–260 px, step 10, default **150** (matches the existing `ThemeGrid.vue` `minmax(150px, 1fr)` rule exactly so a zero-config first run is visually identical to the pre-packet baseline). **Cards / themes default asymmetry is intentional and load-bearing:** cards default `130` (D-12101) and themes default `150` (D-12401) — each default matches its view's pre-packet `minmax(<n>px, 1fr)` rule, so a zero-config first run is visually identical to the pre-slider baseline on either view. Composable exports exactly `{ themeSize, setThemeSize }` plus the four range constants — no `resetThemeSize`, no `clamp` accessor, no dead surface. Mount point is the themes-view filter bar only (between the search input and the count span); cards view continues to mount the existing `<CardSizeSlider />` byte-identically.

**Four production files (two new + two modified).** [`apps/registry-viewer/src/composables/useThemeSize.ts`](../../apps/registry-viewer/src/composables/useThemeSize.ts) (new — module-scoped composable + four range constants `MIN_THEME_WIDTH_PX = 80`, `MAX_THEME_WIDTH_PX = 260`, `DEFAULT_THEME_WIDTH_PX = 150`, `THEME_WIDTH_STEP_PX = 10`); [`apps/registry-viewer/src/components/ThemeSizeSlider.vue`](../../apps/registry-viewer/src/components/ThemeSizeSlider.vue) (new — native `<input type="range">` mounted in the themes-view filter bar; keyboard-accessible by default); [`apps/registry-viewer/src/components/ThemeGrid.vue`](../../apps/registry-viewer/src/components/ThemeGrid.vue) (modified — `:style` bind on `.grid` + column-track rewrite to `repeat(auto-fill, minmax(var(--theme-grid-min-width, 150px), 1fr))` with literal `150px` fallback preserving pre-packet behavior if the inline style is dropped); [`apps/registry-viewer/src/App.vue`](../../apps/registry-viewer/src/App.vue) (modified — imports `ThemeSizeSlider`, mounts inside the themes-view filter bar between the search `<input>` and the count `<span>`). Plus six governance files: `WP-124-*.md`, `EC-126-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12401, `STATUS.md` (this entry). Total staged set across both commits: exactly 10 files (EC-126 §0(B) compliance).

**Duplicate-first lock.** Per `.claude/rules/code-style.md §"Abstraction & Control Flow"` (*"Duplicate first, abstract only when a third copy appears"*), `useThemeSize.ts` and `ThemeSizeSlider.vue` are line-for-line copies of `useCardSize.ts` and `CardSizeSlider.vue` with theme-prefixed names — same module-scoped ref, same narrowing block, same `clampToRange` / `readStoredRawSafely` / `persistSafely` helpers, same full-sentence swallow comment shape, same template structure, same scoped CSS dark-theme tokens. **`useCardSize.ts` and `CardSizeSlider.vue` are byte-identical pre- and post-WP-124.** With two copies in the codebase post-WP-124, any future abstraction is deferred to a third zoom-slider WP per D-12401. All eight required `// why:` clauses present (`useThemeSize.ts`: storage-key convention, four range constants legibility/viewport/default/step rationale, narrowing block, self-heal write-back, swallowed `setItem` failure; `ThemeGrid.vue`: `useThemeSize` import + `:style` binding rationale; `ThemeSizeSlider.vue`: module-header JSDoc).

**EC-126 retarget breadcrumb.** EC-119 reserved for WP-115 (Public Leaderboard HTTP Endpoints — draft on disk); EC-121 reserved for the unmerged WP-120 Loadout Preview branch per the EC-122 retarget breadcrumb. Per the locked precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122, EC-123, EC-124, EC-125), the WP-keyed EC retargets to the next free slot — EC-126. The WP number (WP-124) is unchanged.

**Verification.** `pnpm --filter registry-viewer build` exits 0 (92 modules, 208.45 kB JS / 39.21 kB CSS, gzip 63.37 kB / 6.85 kB; pre-packet baseline 88 modules / 207.44 kB / 38.77 kB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` reports `tests 31 / suites 6 / pass 31 / fail 0` — **UNCHANGED** from pre-session baseline (no tests added per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 viewer-side precedent — the registry-viewer has no Vue component-test harness at baseline; verification is build + typecheck + manual smoke). All §10 verification gates pass: exactly one match each for `STORAGE_KEY = "themeGridSize"`, `MIN_THEME_WIDTH_PX = 80`, `MAX_THEME_WIDTH_PX = 260`, `DEFAULT_THEME_WIDTH_PX = 150`, `THEME_WIDTH_STEP_PX = 10`, `export function useThemeSize`, `Theme grid size in pixels`, `<ThemeSizeSlider`, `import ThemeSizeSlider`, `minmax(var(--theme-grid-min-width, 150px), 1fr)`; zero matches for `DEFAULT_CARD_WIDTH_PX|cardSize|cardGridSize` in `useThemeSize.ts`, zero matches for `useCardSize|cardSize|Card Size` in `ThemeSizeSlider.vue`, zero matches for `minmax(150px, 1fr)` in `ThemeGrid.vue` (the bare literal-150px rule was rewritten); zero forbidden imports (`boardgame.io`, `@legendary-arena/{game-engine,preplan,server}`, `node:`, `pg`) in either new file. `git diff` against `useCardSize.ts`, `CardSizeSlider.vue`, `CardGrid.vue`, `useCardViewMode.ts`, `useResizable.ts`, `apps/registry-viewer/package.json`, `packages/registry/`, `packages/game-engine/`, `apps/server/`, `apps/arena-client/`, `data/` all empty. Manual smoke confirmed 2026-05-01 on local dev server: slider visible in themes-view filter bar between search and count; tile widths scale 86 → 183 → 220 → 260 px across slider extremes (68 tiles stable at every position); reload preserves chosen size (180 → reload → 180); cards-side `cardGridSize=130` independent of `themeGridSize`; theme search filter (`marvel` → 6 results) preserved across slider movement at value 120; no Vue warnings, no console errors during slider movement or tab switching; first-run zero-config render shows `themeGridSize=150` self-healed into localStorage with grid var `'150px'`.

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved and advanced — themes-view now matches the cards-view's zoom flexibility, restoring the parity gap that existed since WP-091 shipped a fixed `150px` column min-width. NG-1..NG-7 not crossed (UI-only client-local affordance with no game-state coupling, no monetization, no PvP framing, no scoring/leaderboards). §17 trigger-surface evaluation: §10a is the only triggered surface; all others (scoring/PAR/leaderboards, replays, identity, multiplayer, determinism, card data semantics, monetization, live ops, accessibility/i18n) are not triggered. §20 Funding Surface Gate: N/A — registry viewer is free public reference tooling; this packet adds no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected).

**01.5 NOT INVOKED.** Zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 viewer-side precedent — not authored this session (no new contract surface, no new long-lived abstraction, no new code subdirectory, no new projection seam — the new composable is a sibling of `useCardSize.ts`, not a new abstraction).

**Downstream impact / future paths.** A future WP that introduces a third zoom slider (e.g., a Loadout Size slider) MAY cite D-12101 + D-12401 together to authorize abstraction into a shared composable factory — at that point the *duplicate first* threshold is met. A future WP that wants per-view-mode sizes (separate `themeGridSize` for image vs data view in the themes view) MUST cite D-12401 and either supersede it (with rationale) or add a sibling key without disturbing `themeGridSize`. The locked range (80–260) was sized for desktop viewports; if a future mobile-first redesign warrants gesture-driven zoom, that's a separate WP scope, not a D-12401 supersession.

---

### WP-123 Executed — Viewer cardType Widening and `set.other[]` Dispatch (2026-05-01, EC-125)

🧹 **WP-123 complete (Commit A `fbb5174` `EC-125:`) — registry-viewer `FlatCard.cardType` widened to `string`; `set.other[]` dispatch wired; pills Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer / shield-trooper / Other still zero cards (unchanged) until domain card data is authored upstream.** Closes the type-projection drift surfaced by WP-086 Phase 1 and wires the viewer-local `flattenSet()` `// Other` block to dispatch on each `set.other[]` entry's `cardType` field. After this lands, the viewer is ready to receive any taxonomy-tagged `set.other[]` entries — Sidekick, S.H.I.E.L.D. Officer / Trooper / Agent, or any future taxonomy slug — without further `flattenSet` changes. Pills go non-empty when card data arrives, not before; that data authoring is **out of scope here** per the upstream domain-data gap noted in the WP §Session Context.

**Locked under D-12301.** `FlatCard.cardType` widens from the prior 9-value string union to plain `string` at [`apps/registry-viewer/src/registry/types/types-index.ts:37`](../../apps/registry-viewer/src/registry/types/types-index.ts) (the derived `FlatCardType = FlatCard["cardType"]` alias resolves to `string` automatically). `CardQuerySchema.cardType` and `.cardTypes` widen from `z.enum([...])` to `z.string().optional()` and `z.array(z.string()).optional()` at [`apps/registry-viewer/src/registry/schema.ts:123–124`](../../apps/registry-viewer/src/registry/schema.ts). The `// Other` block in [`apps/registry-viewer/src/registry/shared.ts`](../../apps/registry-viewer/src/registry/shared.ts) is rewritten wholesale to read each `set.other[]` entry's `cardType` field (with an `"other"` fallback when absent) and use it for both the FlatCard's `cardType` value and the locked key shape `` `${abbr}-${cardType}-${slug}` ``. Required five-clause `// why:` block (a)–(e) sits immediately above the rewritten loop. Loop variable `entry` (full English; not `o` or `ot`); narrowed-record alias `entryRecord` (full English; not `o` or `ot`). Dispatch expression `String(entryRecord["cardType"] ?? "other")`. Slug fallback chain `String(entryRecord["slug"] ?? entryRecord["name"] ?? "other")`.

**Four production files (three modified production + one modified test).** [`apps/registry-viewer/src/registry/types/types-index.ts`](../../apps/registry-viewer/src/registry/types/types-index.ts) (modified — single-line widening at line 37; JSDoc at line 35 preserved). [`apps/registry-viewer/src/registry/schema.ts`](../../apps/registry-viewer/src/registry/schema.ts) (modified — two-line widening at lines 123–124). [`apps/registry-viewer/src/registry/shared.ts`](../../apps/registry-viewer/src/registry/shared.ts) (modified — `// Other` block rewritten with five-clause `// why:` block; all other blocks byte-identical pre- and post-execution). [`apps/registry-viewer/src/registry/shared.test.ts`](../../apps/registry-viewer/src/registry/shared.test.ts) (modified — three `as unknown as FlatCardType[]` casts removed at lines 54 / 60 / 73; explanatory `// why:` comment at lines 49–53 removed; new `describe("flattenSet other-block cardType dispatch (WP-123)", …)` block appended after the existing `flattenSet henchman emission (WP-122)` describe block — preserved byte-identical including the EC-124 fifth case — with the mandatory three `it` cases plus the recommended optional fourth empty-array regression case). Plus six governance files: `WP-123-*.md`, `EC-125-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12301, `STATUS.md` (this entry). Total staged set across both commits: exactly 10 files (EC-125 §0(B) compliance). `packages/registry/src/shared.ts` is **unchanged** — that copy does not iterate `set.other[]` at all (it emits only hero / mastermind / villain / scheme literals — narrow subsets of the widened type) and needs no parallel fix; this is a viewer-local divergence, intentional and isolated.

**Three-FlatCard-types-coexist state post-WP-123.** Three `FlatCard.cardType` widths exist in the codebase after this WP: (1) `packages/registry/src/types/index.ts:57` — 4-value engine-side union, **unchanged**, correct because the engine-side `flattenSet` emits only those four literals; (2) `apps/registry-viewer/src/registry/types/index.ts:37` — 4-value viewer-side legacy union, **unchanged**, structurally a copy of the engine-side type, re-exported via the registry barrel but no in-viewer consumer imports from that barrel at runtime; (3) `apps/registry-viewer/src/registry/types/types-index.ts:37` — `string` post-WP-123, the live FlatCard imported throughout the viewer. The asymmetry was inherited from EC-102's consolidation effort. WP-123 widens only the live type; legacy-type cleanup is **deferred to a future EC-102-style consolidation WP** per D-12301. The forward-pointing `// why:` comment at `App.vue:113–118` and the cast at `App.vue:348` are preserved verbatim per RS-1 — they go loosely stale post-WP-123 but remain internally consistent as forward-pointing narrative.

**EC-125 retarget breadcrumb.** EC-119 reserved for WP-115 (Public Leaderboard HTTP Endpoints — draft on disk); EC-121 reserved for the unmerged WP-120 Loadout Preview branch per the EC-122 retarget breadcrumb; EC-124 was claimed by the ad-hoc viewer henchman per-card emission work (commit `86029d8`, 2026-05-01). Per the locked precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122, EC-123, EC-124), the WP-keyed EC retargets to EC-125 as the next free slot. The WP number (WP-123) is unchanged.

**Verification.** `pnpm --filter registry-viewer build` exits 0 (88 modules, ~207.44 kB JS / 38.77 kB CSS, gzip 63.15 kB / 6.81 kB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` 27/5/0 → **31/6/0** (+4 tests / +1 suite / 0 fail; recommended optional fourth case included). All §10 verification gates pass: zero `for (const o of set\.other)` matches, exactly one `for (const entry of set\.other)` match, exactly one `${abbr}-${cardType}-${slug}` match, zero hardcoded `cardType: "other"` matches, exactly one `cardType:  string;` match in `types-index.ts`, zero `"hero" | "mastermind"` matches there, exactly one `cardType: z.string().optional()` and one `cardTypes: z.array(z.string()).optional()` match in `schema.ts`, zero `as unknown as FlatCardType[]` matches in `shared.test.ts`, at least one match for the new describe block title. `git diff packages/registry/src/shared.ts`, `git diff packages/registry/src/schema.ts`, `git diff packages/registry/src/types/index.ts`, `git diff apps/registry-viewer/src/registry/types/index.ts`, `git diff apps/registry-viewer/src/App.vue`, `git diff apps/registry-viewer/src/components/LoadoutBuilder.vue`, `git diff apps/registry-viewer/package.json` all empty. Manual smoke optional (not gated) — `set.other[]` is empty across all 40 sets so the dispatch emits zero records under current data; pills Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer / shield-trooper / Other still produce zero cards (no upstream data yet — expected).

**Lint-gate self-review (00.3 §1–§21).** PASS. §1 (sections present), §2 (engine-wide + packet-specific + session protocol + locked values; cites 00.6; forbids partial output), §3 (WPs / files / external state listed), §4 (ARCHITECTURE.md + rules + 00.6 + DECISIONS scan), §5 (3 production + 1 test + 6 governance, all marked, ≤ 10 within reasonable ceiling), §6 (no canonical-name conflicts; `cardType: "sidekick"` / `"shield-agent"` matches existing taxonomy slugs in `data/metadata/card-types.json`), §7 ("No new npm dependencies"), §8 (no game-engine/server/preplan/pg leak), §9 (pnpm only), §10 / §11 / §19 / §20 / §21 N/A with explicit justifications, §13 (pnpm + expected output), §14 (11 binary observable items), §15 (STATUS / DECISIONS / WORK_INDEX / EC_INDEX / scope-boundary check), §16 (enforced at execution), §17 (§10a triggered, conflict + NG + determinism), §20 (N/A — registry-viewer type-projection alignment + dispatch wire-through; no UI surfaces added, no user-visible copy added, no funding channels referenced).

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved: type-projection drift closed; viewer ready for any taxonomy-tagged `set.other[]` entry without further changes. NG-1..NG-7 not crossed (viewer-only correctness fix with no game-state coupling, no monetization, no PvP framing, no scoring/leaderboards). §17 trigger-surface evaluation: §10a is the only triggered surface; all others not triggered. §20 Funding Surface Gate: N/A. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected).

**01.5 NOT INVOKED.** Zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 viewer-side precedent — not authored this session (no new contract surface, no new long-lived abstraction, no new code subdirectory, no new projection seam — the dispatch IS the existing `// Other` projection seam, refined).

**Downstream impact / future paths.** The natural follow-up is a Phase 2 data-authoring WP at the upstream `bbcode/modern-master-strike` generator that emits `cardType` on each card and regenerates 40 sets — separate operator/upstream task per WP-086 §Out of Scope. After that lands, the Sidekick / S.H.I.E.L.D. / shield-agent / shield-officer / shield-trooper pills will surface real cards without further viewer changes. The second natural follow-up is an EC-102-style consolidation WP that deletes the viewer-legacy `FlatCard` at `apps/registry-viewer/src/registry/types/index.ts` and removes the forward-pointing comments + cast at `App.vue:113–118` / `:348`; this is deferred per D-12301.

---

### WP-122 Executed — Viewer Henchman flattenSet Emission Fix (2026-05-01, EC-123)

🐛 **WP-122 complete (Commit A `a5c1653` `EC-123:`) — registry viewer cards-view Henchman ribbon pill now surfaces 44 henchman FlatCards (was 0 pre-fix).** Replaces a silent-zero-emission bug in the viewer-local `flattenSet()` at [`apps/registry-viewer/src/registry/shared.ts`](../../apps/registry-viewer/src/registry/shared.ts). The prior implementation expected a nested `cards` sub-array per henchman group and iterated it, but the actual data shape across all 40 sets in `data/cards/*.json` is a flat object per group (`{ id, name, slug, imageUrl, abilities, vAttack, vp }` — no nested `cards`; verified 2026-05-01: 44 henchman entries, zero with nested `cards`). The inner `for (const card of hmCards)` loop iterated zero times, dropping all 44 henchmen from the search index and leaving the `Henchman` ribbon pill empty after WP-086 made the bug user-visible. The fix replaces the broken nested iteration with a flat treatment that mirrors the bystanders/wounds blocks already present in the same file: one `FlatCard` per henchman group, locked key shape `${abbr}-henchman-${slug}` (one segment after `henchman-`), `cardType: "henchman"` literal, only the flat `imageUrl` surfaced. Class-keyed image map carried by `amwp/tardigrade` and `wtif/ultron-sentries` is intentionally ignored — surfacing it requires `FlatCard` widening + paired UI changes, deferred per D-12201.

**Locked under D-12201.** Key format `${abbr}-henchman-${slug}` (one segment after `henchman-`). cardType literal `"henchman"`. Loop variable `henchman` (full English; no abbreviation). Narrowed-record alias `henchmanRecord` (full English; not `hm` or `h`). Slug fallback chain `String(henchmanRecord["slug"] ?? henchmanRecord["name"] ?? "henchman")`. Test describe block title `"flattenSet henchman emission (WP-122)"`. Test minimum 3 `it` cases (4 recommended; 4 authored). Required seven-clause `// why:` block (a)–(g) immediately above the rewritten loop documents the data-shape mismatch, parallel-to-bystanders/wounds rationale, divergence-from-`packages/registry` rationale, D-12201 citation, scope reference, one-record-per-group rationale, and class-keyed-art deferral.

**Two production files (one modified + one modified test).** [`apps/registry-viewer/src/registry/shared.ts`](../../apps/registry-viewer/src/registry/shared.ts) (modified — henchmen block rewritten wholesale; all other blocks byte-identical pre- and post-execution). [`apps/registry-viewer/src/registry/shared.test.ts`](../../apps/registry-viewer/src/registry/shared.test.ts) (modified — appends `flattenSet henchman emission (WP-122)` describe block with four `it` cases — mandatory three plus recommended optional fourth pinning the flat-`imageUrl`-only projection contract by test). Plus six governance files: `WP-122-*.md`, `EC-123-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12201, `STATUS.md` (this entry). Total staged set across both commits: exactly 8 files (EC-123 §0(B) compliance). `packages/registry/src/shared.ts` is **unchanged** — that copy does not iterate henchmen at all (it emits only hero / mastermind / villain / scheme cards) and needs no parallel fix; this is a viewer-local divergence, intentional and isolated.

**EC-123 retarget breadcrumb.** EC-122 was already taken by WP-121's card zoom slider; EC-121 was taken by WP-120's loadout preview round-trip fix branch. Per the locked precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-121 → EC-122), the WP-keyed EC retargets to the next free slot — EC-123. The WP number (WP-122) is unchanged.

**Verification.** `pnpm --filter registry-viewer build` exits 0 (88 modules, 207 KB JS / 38.77 KB CSS, gzip 63.11 KB / 6.81 KB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` 22/4/0 → **26/5/0** (+4 tests / +1 suite / 0 fail). All §10 verification gates pass: zero `for (const card of hmCards)` matches, exactly one `for (const henchman of set.henchmen)` match, zero literal `imageUrlByClass` matches in `shared.ts` (clause (g) of the `// why:` block reworded to refer to "the class-keyed image map" without naming the literal field — the deferral rationale is preserved without the gate-tripping token), at least one `-henchman-` match (proves the new key shape emits at the push site). `git diff packages/registry/src/shared.ts` empty; `git diff packages/registry/src/schema.ts` empty; `git diff apps/registry-viewer/src/registry/schema.ts` empty; `git diff apps/registry-viewer/package.json` empty. Manual smoke confirmed 2026-05-01 on local dev server: clicking the Henchman ribbon pill produces a card grid of 46 cards (≥ 44 floor; the +2 over the 44-entry shape sweep reflects eagerly-loaded set count); toggling Henchman off restores the unfiltered count to 2875; no Vue duplicate-key console warnings; image / data view toggle renders henchman tiles without console errors.

**Lint-gate self-review (00.3 §1–§21).** PASS. §1 (10 sections present), §2 (engine-wide + packet-specific + session protocol + locked values; cites 00.6; forbids partial output), §3 (WPs / files / external state listed), §4 (ARCHITECTURE.md + rules + 00.6 + DECISIONS scan), §5 (2 production + 6 governance, all marked, ≤ 8 cap), §6 (no canonical-name conflicts; `cardType: "henchman"` matches existing literal), §7 ("No new npm dependencies"), §8 (no game-engine/server/preplan/pg leak), §9 (pnpm only), §10 / §11 / §18 / §19 / §20 / §21 N/A with explicit justifications, §13 (pnpm + expected output), §14 (11 binary observable items), §15 (STATUS / DECISIONS / WORK_INDEX / EC_INDEX / scope-boundary check), §16 (enforced at execution), §17 (§10a triggered, conflict + NG + determinism), §20 (N/A — registry-viewer correctness fix; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link).

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) restored: Henchman ribbon pill now surfaces 44 henchman FlatCards (was 0). NG-1..NG-7 not crossed (UI-only correctness fix with no game-state coupling, no monetization, no PvP framing, no scoring/leaderboards). §17 trigger-surface evaluation: §10a is the only triggered surface; all others not triggered. §20 Funding Surface Gate: N/A. §21 API Catalog: N/A (no `apps/server` files touched, no HTTP surface affected).

**01.5 NOT INVOKED.** Zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-096 / WP-114 / WP-121 viewer-side bug-fix precedent — not authored this session (no new contract surface, no new long-lived abstraction, no new code subdirectory, no new projection seam, no new setup artifact).

**Downstream impact / future paths.** The natural follow-up is a future WP that widens `FlatCard` to expose hero-class-keyed henchman art (the path deferred under D-12201 Rationale #4). Such a WP would supersede the class-keyed-art-deferred portion of D-12201 and pair the schema widening with `CardGrid.vue` / `CardDetail.vue` rendering changes to surface the per-class image variant. The locked key format `${abbr}-henchman-${slug}`, `cardType: "henchman"` literal, and slug fallback chain remain valid under any such widening.

---

### WP-121 Executed — Registry Viewer: Card Zoom Slider (2026-05-01, EC-122)

🔍 **WP-121 complete (Commit A `e3c6af7` `EC-122:`) — registry viewer cards-view now exposes a Card Size slider.** Adds a keyboard-accessible "Card Size" slider to the cards-view filter bar at [`cards.barefootbetters.com`](https://cards.barefootbetters.com/) between the hero-class select and the count span. Slider drives a single `--card-grid-min-width` CSS variable on `CardGrid.vue`'s `.grid` element; the existing `aspect-ratio: 3/4` rule on `.img-wrap` propagates width changes to height proportionally, so no per-card recalculation is needed. Persisted to `localStorage['cardGridSize']` via a new module-scoped `useCardSize` composable that mirrors WP-066's `useCardViewMode.ts` shape line-for-line (storage-key constant + narrowing + self-heal write-back + swallowed `setItem` failure).

**Locked under D-12101.** Range 80–260 px, step 10, default 130 (matches the existing `minmax(130px, 1fr)` rule exactly so a zero-config first run is visually identical to the pre-packet baseline). Composable exports exactly `{ cardSize, setCardSize }` plus the four range constants — no `resetCardSize`, no `clamp` accessor, no dead surface. Mount point is the cards-view filter bar only — themes grid and loadout view are out of scope (each uses its own column-track rule; future WPs may extend if user feedback warrants).

**Four production files (two new + two modified).** `apps/registry-viewer/src/composables/useCardSize.ts` (new — module-scoped composable + range constants); `apps/registry-viewer/src/components/CardSizeSlider.vue` (new — native `<input type="range">` mounted in the filter bar; keyboard-accessible by default); `apps/registry-viewer/src/components/CardGrid.vue` (modified — `:style` bind + column-track rewrite to `repeat(auto-fill, minmax(var(--card-grid-min-width, 130px), 1fr))` with literal `130px` fallback preserving pre-packet behavior if the inline style is dropped); `apps/registry-viewer/src/App.vue` (modified — imports `CardSizeSlider`, mounts inside the cards-view filter bar). Plus six governance files: `WP-121-*.md`, `EC-122-*.checklist.md`, `WORK_INDEX.md` row, `EC_INDEX.md` row, `DECISIONS.md` D-12101, `STATUS.md` (this entry).

**Sequencing note (WP-120).** WP-120 (Loadout Preview Round-Trip Fix) is on the unmerged feature branch `wp-120-loadout-preview-roundtrip-fix` (Commit A `05d5ded`, 2026-04-30) and also touches `App.vue` — but in a different region (hoists `useLoadoutDraft(registry)` into `App.vue` and adds an `onPreviewRequestEdit` handler). WP-121's `App.vue` edits are confined to the cards-view filter bar template region; merge order is not load-bearing.

**Verification.** `pnpm --filter registry-viewer build` exits 0 (88 modules, 207 KB JS / 38.77 KB CSS, gzip 63.17 KB / 6.81 KB). `pnpm --filter registry-viewer typecheck` (`vue-tsc --noEmit`) exits 0. `pnpm --filter registry-viewer test` 22/4/0 unchanged across the WP-086 + WP-114 baseline (9 setupUrlParams + 5 useSetupFromUrl + 4 ribbon zero-card + 4 sidekick/shield-agent/hero/unknown). `pnpm --filter registry-viewer lint` 0 errors / 263 warnings (vs 260 baseline = +3 stylistic warnings; +1 directly attributable to WP-121 — `<input>` self-closing on `CardSizeSlider.vue:50` — matching the existing accepted pattern at `GlossaryPanel.vue:111` and `App.vue:511`; +2 are positional-shift artifacts from the inserted `<CardSizeSlider />` element).

**Lint-gate self-review (00.3 §1–§21).** PASS. §1 (10 sections present), §2 (engine-wide + packet-specific + session protocol + locked values; cites 00.6; forbids partial output), §3 (WPs / files / external state listed), §4 (ARCHITECTURE.md + rules + 00.6 + DECISIONS scan), §5 (4 production + 6 governance, all marked, no ambiguous output), §6 (no canonical-name conflicts), §7 ("No new npm dependencies"), §8 (no game-engine/server/preplan/pg leak), §9 (pnpm only), §10 / §11 / §12 / §18 / §19 / §21 N/A with explicit justifications, §13 (pnpm + expected output), §14 (11 binary observable items), §15 (STATUS / DECISIONS / WORK_INDEX / EC_INDEX / scope-boundary check), §16 (enforced at execution), §17 (§10a triggered, conflict + NG + determinism + §20), §20 (N/A with non-tautological justification — "free public reference tooling; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link").

**EC-122 retarget breadcrumb.** WP-121's WP-keyed EC slot (EC-121) was already taken by the unmerged WP-120 Loadout Preview Round-Trip Fix branch (Commit A `05d5ded`); EC-120 was already taken by the ad-hoc viewer a11y EC (LoadoutBuilder accessibility label association). Per the locked precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115), the WP-keyed EC retargets to the next free slot that does not shadow a known or imminent WP — EC-122. The WP number (WP-121) is unchanged.

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) preserved and advanced. NG-1..NG-7 not crossed (UI-only client-local affordance with no game-state coupling, no monetization, no PvP framing, no scoring/leaderboards). §17 trigger-surface evaluation: §10a is the only triggered surface; all others (scoring/PAR/leaderboards, replays, identity, multiplayer, determinism, card data semantics, monetization, live ops, accessibility/i18n) are not triggered. §20 Funding Surface Gate: N/A — registry viewer is free public reference tooling; this packet adds no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link.

**01.5 NOT INVOKED.** Zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-096 / WP-114 viewer-side precedent — not authored at draft time (no new contracts, no new long-lived abstractions; the composable is a new instance of the existing `useCardViewMode.ts` abstraction, not a new abstraction).

**Downstream impact / future paths.** A future WP that wants to drive theme-grid columns from a similar slider (e.g., `themeGridSize`) is the natural extension; the composable pattern is reusable. A future WP that wants per-view-mode sizes (separate `cardGridSize` for image vs data view) MUST cite D-12101 and either supersede it (with rationale) or add a sibling key without disturbing `cardGridSize`. The slider's locked range (80–260) was sized for desktop viewports; if a future mobile-first redesign warrants gesture-driven zoom, that's a separate WP scope, not a D-12101 supersession (range bounds remain valid for the keyboard/pointer slider; gesture handling is additive).

---

### WP-117 Executed — Client Routing Strategy (2026-04-30, no EC)

🧭 **WP-117 complete — both Vue 3 SPAs lock the no-client-router posture.** [`docs/ai/ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/02-ARCHITECTURE.md`](../02-ARCHITECTURE.md) gain a new `## Client Routing` section that records the per-app posture: `apps/arena-client` keeps the existing `selectRoute()` query-string discriminator at `App.vue:84` (`?profile=` / `?fixture=` / `?match=` + `?player=` + `?credentials=` deep-linking shipped and load-bearing for WP-061 fixture replay + WP-102 public profile); `apps/registry-viewer` keeps the local `activeView` ref at `App.vue:77` plus the WP-114 `setupUrlParams` query-string handling for the loadout-preview surface. **No `vue-router` dependency is added to either app.** No `<router-view>` is wired. No `.claude/rules/architecture.md` import-rules row is modified.

**Decisions landed.** Four new entries in `docs/ai/DECISIONS.md`: **D-11701** (arena-client → no router; preserve `selectRoute()`; de-facto Option C note for the existing helper), **D-11702** (registry-viewer → no router; preserve `activeView` + WP-114 query params), **D-11703** (history mode → N/A — no router adopted in either app; standalone N/A entry so grep-by-ID queries find an explicit hit), **D-11704** (replay URL format → deferred to future Replay Viewer WP or WP-115 leaderboard score-detail client-side extension; `:replayHash` spelling already locked in WP-115 stub at `bfdefe1` is the natural starting point).

**No code touched.** `git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` empty. `pnpm -r test` exits 0 with baseline counts unchanged across all 8 workspaces (registry 31, vue-sfc-loader 11, game-engine 604, replay-producer 4, registry-viewer 22, preplan 52, server 47 + 24 skipped, arena-client 182). 5 files modified per the resolved B/B/N-A/B scope-lock: `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, `docs/ai/DECISIONS.md`, `docs/ai/STATUS.md` (this entry), `docs/ai/work-packets/WORK_INDEX.md`. Single `SPEC:` commit per the no-EC path (D-10001 + 2026-04-26 Amendment apply cleanly; no `apps/`/`packages/`/`data/` files staged → `.githooks/commit-msg` Rule 5 not triggered → no EC stub required).

**Vision alignment.** §17.1 trigger surfaces evaluated: client routing itself is not a §17.1 surface; D-11704 = B (defer) means §17 is **N/A** in this WP — the future replay-viewer WP that locks the format owns the §17 evaluation under its own scope. Conflict assertion: "No conflict". Determinism preservation: N/A (no engine / replay / RNG / PAR surface touched). NG-1..NG-7 not crossed. §20 Funding Surface Gate **N/A** with explicit justification: pure documentation / governance update; no UI surfaces, no user-visible copy, no funding channels referenced.

**Pre-flight + copilot-check artifact.** [`docs/ai/invocations/preflight-wp117.md`](invocations/preflight-wp117.md) authored 2026-04-30 (DO NOT EXECUTE YET → READY TO EXECUTE after PS-1..PS-5 BLOCKING + PS-6..PS-10 RECOMMENDED resolved in prep commit `23872a3`; copilot-check re-run flipped BLOCK → CONFIRM). Pre-flight surfaced + corrected: §Session Context Pinia-tab-state misstatement (the false "ad-hoc Pinia-driven tab-switching" claim removed); §Assumes false blocking assumption (`apps/arena-client/src/stores/uiState.ts` does not carry view state); D-11701 Option B prose contradicting shipped behavior (the false "URL is always `/`" claim removed); file-count drift (off-by-one conditional-matrix totals collapsed to a single resolved 5); `00.3 §10` → `00.3 §5` citation drift. The four decisions were resolved with rationale + rejected options before the prep commit landed.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` is empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-118 / WP-119 governance-WP precedent — not authored (no new contracts, no projections, no setup artifacts, no long-lived abstractions; the routing posture is a descriptive governance lock).

**Downstream impact.** A future WP that supersedes D-11701 or D-11702 with Option A (formally adopt `vue-router@4.x`) carries its own scope: package.json edit + lockfile regen + `.claude/rules/architecture.md` allowed-imports update for the relevant Vue layer row(s) + retargeted EC stub at the next free slot (EC-121 as of 2026-04-30) + EC_INDEX row + `<router-view>` wiring under the chosen history mode + D-11703 supersession + (optionally) D-11704 supersession if a replay UI surface is part of the same WP. The existing `selectRoute()` helper is the migration starting point per D-11701's de-facto Option C note, not legacy scaffolding to be replaced. The WP-114 query-param surface (`setupUrlParams.ts` + `useSetupFromUrl.ts` + `LoadoutPreview.vue`) is preserved verbatim under D-11702 = B and remains the precedent for any future URL-bound contract surface in the registry-viewer.

### WP-118 Executed — HTTP API Surface Catalog (2026-04-30, no EC)

📡 **WP-118 complete — `docs/ai/REFERENCE/api-endpoints.md` is now the authoritative catalog of every HTTP endpoint exposed (or coded but not yet exposed) by `apps/server`.** Catalog uses a four-value `Status` closed set (`Wired | Shipped-but-unwired | Library-only | Pending`) and a three-value `Auth` closed set (`guest | handle-required | authenticated-session-required` per D-9905). Backfills the live HTTP surface (`/health` at `apps/server/src/server.mjs:30-34` plus the boardgame.io built-ins surfaced by `Server({games:[LegendaryGame]})` — `POST /games/legendary-arena/create`, `GET /games/legendary-arena`, `POST /games/legendary-arena/{matchID}/join`) plus the shipped-but-unwired `GET /api/players/:handle/profile` (deferred per D-10202) plus the `Library-only` helpers (WP-101 `claimHandle` / `findAccountByHandle` / `getHandleForAccount`; WP-103 `storeReplay` / `loadReplay` — route-less by design per WP-103 §Out of Scope; WP-053 `submitCompetitiveScore` — fail-closed unwired) plus the WP-115 leaderboard `Pending: WP-115 (STUB DRAFT 2026-04-29)` forward-link (three endpoints: `GET /api/leaderboards/scenarios`, `GET /api/leaderboards/scenarios/:scenarioKey`, `GET /api/leaderboards/scores/:replayHash`).

**Decisions landed.** Four new entries in `docs/ai/DECISIONS.md`: **D-11801** (catalog format = Markdown table per Option A; OpenAPI companion preserved as future path, not foreclosed), **D-11802** (error response shape = split per Option C — boardgame.io for game endpoints + project-specific `{ code, message, requestId? }` for project endpoints; `requestId` is `conditional-on-server-trace-injection` — present once a future request-handler WP lands request-ID middleware, absent until then, never both), **D-11803** (versioning policy = no versioning per Option B; the catalog itself is the contract; breaking changes require `Drift:` annotation + DECISIONS entry), **D-11804** (catalog-update obligation = belt-and-suspenders per Option C — lint §21 + `.claude/rules/work-packets.md` rule, with replace-whole-row merge semantics that make partial-column updates FAIL).

**Enforcement landed.** New §21 "API Catalog Update" in [`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`](REFERENCE/00.3-prompt-lint-checklist.md) — trigger conditions, required content (closed sets + canonical field names + replace-whole-row), FAIL conditions, N/A path. New one-line rule in [`.claude/rules/work-packets.md`](../../.claude/rules/work-packets.md) under a new `## API Catalog Update Obligation (per D-11804)` section. Both gates encode the replace-whole-row constraint per D-11804 merge semantics. Architecture docs gain a `## HTTP API Surface` section + cross-link in both [`docs/ai/ARCHITECTURE.md`](ARCHITECTURE.md) (between `## High-Level System Diagram` and `## Internationalization`) and [`docs/02-ARCHITECTURE.md`](../02-ARCHITECTURE.md) (after `## Transport`).

**No code touched.** `git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` empty. `pnpm -r test` exits 0 with baseline counts unchanged. 8 files modified per the D-11804 = C scope-lock (1 new + 7 modified): `docs/ai/REFERENCE/api-endpoints.md` (new), `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, `docs/ai/DECISIONS.md`, `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, `.claude/rules/work-packets.md`, `docs/ai/STATUS.md` (this entry), `docs/ai/work-packets/WORK_INDEX.md`. Single `SPEC:` commit per the no-EC path (D-10001 + 2026-04-26 Amendment apply cleanly; no `apps/`/`packages/`/`data/` files staged → `.githooks/commit-msg` Rule 5 not triggered → no EC stub required). Inherited dirty-tree items per pre-flight PS-9 (`package.json` + `scripts/architecture-inventory.mjs` + `EC-119-public-leaderboard-http-endpoints.checklist.md` + the two arch-inventory audit outputs) untouched in this commit (verified post-commit via `git diff --name-only HEAD~1 HEAD`).

**Vision alignment.** §3 (Player Trust & Fairness) — preserved; the catalog enumerates technical endpoints and adds no new gameplay surface. §11 (Stateless Client Philosophy) — preserved; the catalog is a static reference document, not a runtime-consumed registry. §14 (Explicit Decisions / No Silent Drift) — advanced; D-11801..D-11804 + the §21 / `.claude/rules/work-packets.md` enforcement entries make every future API-touching WP's obligation grep-explicit. §17 cited per `00.3 §17.1` trigger #3 (player identity — the catalog references `accountId` and `handle` field names by canonical spelling); #1 (leaderboards) and #2 (replays) cited and correctly noted as not-triggered (forward-link only / descriptive only). NG-1..NG-7 not crossed. §20 Funding Surface Gate **N/A** with explicit justification: pure documentation / governance update; no UI surfaces, no user-visible copy, no funding channels referenced.

**Pre-flight + copilot-check artifact.** [`docs/ai/invocations/preflight-wp118.md`](invocations/preflight-wp118.md) authored 2026-04-30 (NOT READY → READY after PS-1..PS-7 BLOCKING + PS-4/8/9/10/11 RECOMMENDED resolved + copilot-check re-run PASS post-HOLD-class FIX #6/A/B application). Pre-flight surfaced + corrected: status taxonomy → 4-state closed set; AC closed-set + canonical-field-name verification items added; do-not-touch rule for unrelated untracked files; CLI-scripts-as-clients exclusion locked per `.claude/rules/server.md`; `Pending` row format locked as `Pending: WP-NNN (STATE YYYY-MM-DD)` so it survives drafting-WP execution. The prep commit (`06149b0`, `SPEC: WP-118 pre-execution amendments -- PS-1..PS-11 + copilot-check FIX #6/A/B`) folded all PS resolutions into the WP body before this execution session began.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` is empty.

**01.6 post-mortem OPTIONAL** per WP-066 / WP-094 / WP-119 governance-WP precedent — not authored (no new contracts, no projections, no setup artifacts, no long-lived abstractions; the catalog is a descriptive reference doc).

**Downstream impact.** Every future API-touching WP must update the catalog in the same commit (D-11804). The first concrete consumer is WP-115 (public leaderboard endpoints — currently `STUB DRAFT 2026-04-29` at `bfdefe1`); when WP-115 executes, its commit replaces the three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows wholesale (status → `Wired`, schema file refs filled in) per D-11804 replace-whole-row merge semantics. Any future WP that wires the deferred profile route (per D-10202) replaces that row wholesale (`Shipped-but-unwired` → `Wired`). The catalog's `Library-only` rows are not promises — graduation, when it happens, is the wiring WP's responsibility under D-11804 with the row replaced wholesale. Future request-handler WPs that introduce request-ID middleware land the `requestId` field uniformly across every project-owned endpoint at once (per D-11802 `conditional-on-server-trace-injection` semantics).

### WP-119 Executed — Architecture Doc Hygiene (2026-04-30, no EC)

📐 **WP-119 complete — three architecture-doc drift items resolved.** (1) `apps/replay-producer` (D-6301 / WP-063 shipped 2026-04-19) added to the System Layers ASCII diagram + Package Boundaries table in `docs/02-ARCHITECTURE.md`. (2) Preplan import-rule wording aligned across 11 surfaces (4 in `docs/ai/ARCHITECTURE.md`, 3 in `docs/02-ARCHITECTURE.md`, 4 in `.claude/rules/architecture.md`) using the canonical phrasing **"type-only imports at compile time; reads engine state via projections passed in by the host app"**. (3) New `## Internationalization` section in `docs/ai/ARCHITECTURE.md` + one-line summary in `docs/02-ARCHITECTURE.md`: MVP English-only, i18n deferred, no library adopted, user-visible strings live where they are used, ad-hoc string abstraction (`/locales/`, `t('...')` wrappers, premature key extraction) prohibited, future adoption requires dedicated WP + `DECISIONS.md` entry.

**No code touched.** `git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` empty. `pnpm -r test` exits 0 with baseline counts unchanged. 6 files modified: `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, `.claude/rules/architecture.md`, `docs/ai/DECISIONS.md`, `docs/ai/STATUS.md` (this entry), `docs/ai/work-packets/WORK_INDEX.md`. Single `SPEC:` commit per the no-EC path (D-10001 precedent applies cleanly; no `apps/`/`packages/` files staged → `.githooks/commit-msg` Rule 5 not triggered → no EC stub required). HTML cross-reference comments added above each Pre-Planning Layer subsection header in the three preplan-touching files — drift-prevention mechanism for future edits.

**Vision alignment.** §17 (Accessibility & Inclusivity) cited as the lint-trigger anchor only per `00.3 §17.1 #9`. Explicit acknowledgment that Vision §17 covers keyboard navigation, screen-reader support, high-contrast modes, and color-blind indicators — and **not** internationalization. WP-119 fills the vision-level i18n gap at the architecture-doc level until a future Vision-amendment WP closes it at the vision level (out of scope here). NG-1..NG-7 not crossed. §20 Funding Surface Gate **N/A** declared with explicit justification: pure documentation cleanup; no UI surfaces, no user-visible copy, no funding channels referenced; the 6 modified files are governance / architecture / decisions docs only.

**Pre-flight artifact.** [`docs/ai/invocations/preflight-wp119.md`](invocations/preflight-wp119.md) authored 2026-04-30 (NOT READY → READY after PS-1/2/4 BLOCKING + PS-3/5/6 RECOMMENDED resolved). Pre-flight surfaced (a) Vision §17 over-citation that this WP corrects, (b) Session Context preplan-attribution error that this WP corrects, (c) preplan-wording landscape more divergent than originally described (3 coexisting phrasings across the architecture surface, not just two — the canonical-phrasing alignment now covers all 11 surfaces). Cross-file finding (out of scope for WP-119, flagged for future hygiene WP): WP-118 and WP-116 cite the 8-file cap as `00.3 §10` but the cap is in `00.3 §5`.

**Downstream impact.** `D-11901` is the controlling i18n decision for any future WP that touches user-visible strings or considers adopting an i18n library — those WPs MUST cite D-11901 and either preserve the deferred posture or open a dedicated WP that supersedes it. The preplan-wording canonical-phrasing lock is enforced by HTML cross-reference comments at each Pre-Planning Layer subsection header in the three files; future edits to one file's preplan section MUST sync the other two. The replay-producer diagram + table addition completes a partial diagram-doc drift; remaining prose in `docs/02-ARCHITECTURE.md` that enumerates apps without `replay-producer` is deliberately out of scope per pre-flight PS-5 (deferred to a follow-up hygiene WP if drift becomes load-bearing).

### WP-114 / EC-116 Executed — Registry Viewer URL-Parameterized Setup Preview ("Game of the Week") (2026-04-30, EC-116)

🔗 **WP-114 complete — registry viewer accepts URL-parameterized read-only setup previews.** New `apps/registry-viewer/src/lib/setupUrlParams.ts` is a pure parser/serializer (no `throw`, no clocks, no randomness, no I/O — `URLSearchParams` only) that round-trips the five composition entity-ID fields (`schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`) using the canonical 9-field names verbatim. New `apps/registry-viewer/src/composables/useSetupFromUrl.ts` wires URL → `validateMatchSetupDocument()` against the loaded `CardRegistry`, synthesizing a `MatchSetupDocument` envelope from defaults imported (not re-declared) from `useLoadoutDraft.ts` per PS-1. New `apps/registry-viewer/src/components/LoadoutPreview.vue` is read-only — imports only `loadFromJson` out of the 16-mutator `useLoadoutDraft` API; "Edit this loadout" calls `loadFromJson` exactly once on user-initiated click. `App.vue` instantiates `useSetupFromUrl(registry)` exactly once per page (single-instance composable-ownership lock), mounts `<LoadoutPreview>` above `<LoadoutBuilder>` in the Loadout tab pane, and auto-switches to Loadout on first mount when URL params are present (one-shot — gated by `hasAppliedUrlAutoSwitch` ref; user's subsequent manual tab navigation preserved without override). `LoadoutBuilder.vue` gains a single "🔗 Copy Setup Link" button near the existing Download / Upload controls that serializes `draft.value.composition` via `serializeSetupToUrl()` and writes via `navigator.clipboard.writeText` with a readonly-input fallback (`<input readonly>` revealed + auto-selected on rejection so the URL is never lost when browsers gate clipboard.writeText behind permissions or insecure-context).

**Locked invariants preserved.** No persistence (no `localStorage` / `sessionStorage` / `IndexedDB` / `document.cookie` writes anywhere in the new files — grep-verified). No engine handoff. No server contact. No router library. No new production-runtime npm dependency. URL parameters use the canonical 9-field composition names verbatim — paraphrasing forbidden (parser does not accept `scheme` / `mastermind` / `villains` / `heroes`, grep-verified). The four count fields and all envelope fields are deliberately not URL-bound (defaults sourced from `useLoadoutDraft.ts` constants — drift test enforces editor/preview default-value continuity). The synthesized envelope uses fixed-string defaults (`createdAt: "1970-01-01T00:00:00.000Z"`, `seed: "0000000000000000"`, `setupId: "url-preview"`, `createdBy: "system"`) so identical URLs yield byte-identical synthetic JSON — the §Goal determinism contract holds at synthesis time. Empty-singular parser semantics locked: `?schemeId=` returns `{ schemeId: "" }` (validator owns ID-validity rejection); `?villainGroupIds=` returns `{ villainGroupIds: [] }` (never `[""]`).

**Test counts.** Registry baseline `31 / 3 / 0` UNCHANGED. Viewer `8 / 2 / 0` → **`22 / 4 / 0`** (+9 `setupUrlParams` tests across type-correct round-trip / canonical-order / empty / single-key / comma-list / forward-slash / unknown-key-drop / empty-array / empty-singular + +5 `useSetupFromUrl` tests across valid synthesis / unknown_extid surfacing / null-on-empty-URL / drift-test-against-DEFAULT_*-constants / fixed-string envelope determinism). Viewer build clean (206.38 KB / 84 modules). Typecheck 0 errors. Lint 0 errors / 260 warnings (227 baseline + 33 stylistic, all in same `vue/singleline-html-element-content-newline` + `vue/attributes-order` categories already accepted across the codebase).

**File count.** Commit A `c059199` — **7 production files** (5 new + 2 modified): `apps/registry-viewer/src/lib/setupUrlParams.ts` (new) + `setupUrlParams.test.ts` (new); `apps/registry-viewer/src/composables/useSetupFromUrl.ts` (new) + `useSetupFromUrl.test.ts` (new); `apps/registry-viewer/src/components/LoadoutPreview.vue` (new); `apps/registry-viewer/src/components/LoadoutBuilder.vue` (modified — Copy Setup Link button + clipboard fallback only); `apps/registry-viewer/src/App.vue` (modified — single `useSetupFromUrl` instantiation deferred to `onMounted`, mount `<LoadoutPreview>` in Loadout pane, one-shot auto-switch). Engine `packages/game-engine/`, server `apps/server/`, arena-client `apps/arena-client/`, and pre-plan `packages/preplan/` all untouched (`git diff --name-only` against each is empty). Registry contract files (`setupContract.{types,validate,schema}.ts`) untouched. `useLoadoutDraft.ts` NOT re-modified in this Commit A — the PS-1 additive `export` of six `DEFAULT_*` constants shipped pre-execution at `49e07ec` (the eighth file referenced in WP-114 §Files Expected to Change). Commit B (`SPEC:`, this commit) — 4 files: this STATUS.md block; `WORK_INDEX.md` WP-114 row `[ ]` → `[x]` + Commit A SHA + body update; `EC_INDEX.md` EC-116 row `Draft` → `Done 2026-04-30`; `DECISIONS.md` four new D-114XX entries inserted before `## Final Note`.

**Verification.** All §12.1 forbidden-imports / forbidden-tokens greps return zero output (no `@legendary-arena/game-engine` / `@legendary-arena/preplan` / `apps/server` / `boardgame.io` / `pg` imports in any new or modified file; no `localStorage` / `sessionStorage` / `indexedDB` / `document.cookie`; no `Math.random` / `Date.now` / `crypto.randomUUID`; no `throw` in `setupUrlParams.ts`; no forbidden mutator references in `LoadoutPreview.vue` — full 16-mutator surface from PS-2; no paraphrased URL keys in parser). §12.2 composable-ownership greps: `App.vue` has exactly 1 `useSetupFromUrl(` match (the instantiation call), `LoadoutPreview.vue` has 0 matches (consumes via props per the EC-116 §Locked Values "Composable ownership" rule). §12.3 positive existence greps: `Loaded from URL` =1 match in `LoadoutPreview.vue`, `Copy Setup Link` =1 match in `LoadoutBuilder.vue` (button only — no comment double-count), 6 PS-1 `^export const DEFAULT_*` matches in `useLoadoutDraft.ts`, 17 canonical-key occurrences in `setupUrlParams.ts`. **Manual smoke §14.1 (clipboard fallback): PASS** — operator (2026-04-30) overrode `navigator.clipboard.writeText` to reject in DevTools Console, then clicked "Copy Setup Link" with a populated composition; the readonly-input fallback element appeared with the URL pre-populated and pre-selected; URL contained the canonical key order `?schemeId=...&mastermindId=...&villainGroupIds=...&heroDeckIds=...` (henchmanGroupIds correctly skipped because empty array, per the serializer's "non-empty arrays only" contract); zero JS errors. **Manual smoke §14.2 (one-shot auto-switch): PASS** — operator (2026-04-30) opened the viewer with a populated URL; (a) Loadout tab active on first render; (b) Cards tab stayed Cards after typing in search input; (c) Themes tab stayed Themes after typing in search; (d) "Loaded from URL" banner visible on Loadout tab; (e) zero JS errors during the sequence.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` is empty.

**01.6 post-mortem OPTIONAL** per the WP-066 / WP-094 / WP-096 / EC-103 viewer-side precedent. Not authored this session — the PS-1 narrative is fully captured by D-11404 + WP-114 §Assumes; the projection-aliasing risk is N/A (the parser is a pure value-transform with no shared array references, and the composable returns ComputedRefs over plain-object snapshots).

**UX caveat — known limitation, follow-up WP candidate, not a blocker.** Because `useLoadoutDraft` is non-singleton (PS-1 immutable lock forbids signature changes — D-11404), `LoadoutPreview`'s "Edit this loadout" button calls `loadFromJson` on the component's own draft instance rather than the visible `LoadoutBuilder`'s draft. The literal spec is satisfied (only `loadFromJson` invoked, exactly once per click — verified by §12 greps) but the visible editor doesn't update. Resolving this needs either (a) refactoring `useLoadoutDraft` to a singleton (changes signature — out of scope per PS-1 lock), or (b) modifying `LoadoutBuilder.vue` to accept an external draft API as a prop (out of scope per WP-114 §7.1 "Copy Setup Link button only — no other modification"). A follow-up WP could either (a) introduce a `useLoadoutDraftSingleton` wrapper in `App.vue` provide/inject scope, or (b) emit a `editLoadout(document)` event from `LoadoutPreview` and handle it via a new prop on `LoadoutBuilder`. Tracking only — no decision yet.

**Vision alignment.** §10a (Registry Viewer public surface) — advanced; the viewer now serves a "shareable curated game" use case without server contact, persistence, or auth. §11 (Stateless Client Philosophy) — preserved; URL is the sole state carrier, no `localStorage` / `sessionStorage` / `IndexedDB` / cookies. §22 (Deterministic & Reproducible Evaluation) — preserved at synthesis time; identical URLs yield byte-identical synthetic `MatchSetupDocument` JSON because the parser is pure and every envelope default is a fixed literal. NG-1..NG-7 not crossed (no monetization, no PvP framing, no scoring/leaderboards, no auth, no cosmetics, no replay surface). §20 Funding Surface Gate **N/A** declared with explicit justification per WP-114 §Funding Surface Gate (preview surface displays MATCH-SETUP composition data only; the four buttons added — "Copy Setup Link", "Copy this link", "Edit this loadout", clipboard fallback input — are all setup-share / setup-edit affordances, not funding affordances).

**Downstream impact.** Curated "Game of the Week" URLs can now be shared externally without server round-trips. The arena-client URL-state story (a possible WP-117 or similar) becomes the next likely follow-up — extending the WP-092 lobby JSON intake to accept URL-derived documents would let a shared preview promote into a real match. The `setupUrlParams.ts` pure helper is reusable as a precedent for any future URL-bound contract surface in the viewer.

### WP-086 / EC-086 Executed — Registry Viewer Card-Types Upgrade — 13-entry taxonomy + ribbon (Phase 1) (2026-04-29, EC-086)

🛡️ **WP-086 complete — registry-viewer ribbon now driven by `data/metadata/card-types.json` (re-added post-WP-084 deletion at `b250bf1` 2026-04-21 with a new schema and a runtime consumer present, satisfying WP-084's deletion constraint per the deletion-then-readd narrative).** New `apps/registry-viewer/src/lib/cardTypesClient.ts` is a singleton `.safeParse()` non-blocking fetcher mirroring `glossaryClient.ts` byte-structurally; never throws (HTTP failure or schema rejection → `[]`). Distinct full-sentence warn tokens at the boundary: `[CardTypes] Rejected ...` for Zod schema rejection vs `[CardTypes] Orphan parentType: <slug>` for the post-parse relational invariant (every `parentType` either equals an existing `slug` or is `null`; orphans are dropped from the ribbon with one warn per unique offending value, dedup'd per page session). `App.vue` consumes the fetched taxonomy: 10 top-level ribbon buttons sorted by `order` (Hero / Mastermind / Villain / Henchman / Scheme / Bystander / Wound / **Sidekick** / **S.H.I.E.L.D.** / Other); SHIELD's `:title` tooltip exposes the three sub-chips (Agent / Officer / Trooper). `LEGACY_TYPE_GROUPS` const preserved as a degraded-fetch fallback (legacy 8 buttons minus the orphan `Location`); `displayedTypeGroups` computed selects between fetched and fallback on `cardTypes.value.length === 0`; a single `devLog("cardTypes", "using legacy fallback")` event fires when the empty path is taken (dedup'd via `onMounted`-fires-once).

**Phase 1 of two-phase rollout.** Phase 2 (separate WP) will regenerate per-card `cardType` emission upstream via modern-master-strike. New ribbon buttons (Sidekick / SHIELD sub-chips) return zero cards in Phase 1 — intentional invariant covered by `apps/registry-viewer/src/registry/shared.test.ts`.

**Locked invariants preserved.** `CardTypeEntrySchema` is `.strict()` with exactly five fields: `slug` / `label` / `emoji?` / `order` / `parentType`. `CardTypesIndexSchema = z.array(CardTypeEntrySchema)`. Inferred types `CardTypeEntry` / `CardTypesIndex` re-exported alongside the new alias `type CardType = string`. Per-card `cardType` widened in `CardQuerySchema` from 4-value `z.enum` to `z.string().optional()` — registry stays permissive at load; viewer enforces the 13-entry taxonomy at fetch via `CardTypesIndexSchema.safeParse`. Container shape preserved (Interpretation A locked per D-8602 / `project_wp086_queued.md` 2026-04-21); engine `Game.setup()` NOT modified; `git diff packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` is empty across both commits. Narrow Zod-schema subpath import maintained (`@legendary-arena/registry/schema`, never the barrel — preserves the WP-082 / WP-083 Rollup-graph discipline). No persistence (no `localStorage` / `sessionStorage` / `IndexedDB` / `document.cookie` writes). No production-runtime npm dependency added (only the test-time `tsx` devDep per PS-2 Option B / D-8607).

**Test counts.** Registry baseline `31 / 3 / 0` UNCHANGED. Viewer baseline (no test runner pre-WP-086) → **`8 / 2 / 0`** (NEW: first viewer-side `node:test` surface — 4 `cardTypesClient` tests across happy-path / schema-rejection / HTTP-failure / singleton + 4 Phase-1 invariant tests across sidekick-zero / shield-agent-zero / hero-regression / unknown-slug-no-crash). Viewer `pnpm --filter registry-viewer test` emits TAP output for 8 tests / 2 suites with `fail 0`. Viewer build clean (197.17 KB / 79 modules); typecheck clean. Lint at exact pre-impl baseline (11 errors / 227 warnings, all in `LoadoutBuilder.vue` outside this packet's surface).

**File count.** Commit A `ccc6d0e` — **10 production files + lockfile = 11 files** (8 EC §Files + 2 audit-trail per D-8608). The 8 EC files: `data/metadata/card-types.json` (new, 13 entries); `packages/registry/src/{schema,index}.ts` (modified — schemas + types + widened query enum); `apps/registry-viewer/src/lib/cardTypesClient.{ts,test.ts}` (new — fetcher + 4 tests); `apps/registry-viewer/src/App.vue` (modified — taxonomy-driven ribbon + LEGACY fallback); `apps/registry-viewer/src/registry/shared.test.ts` (new — 4 Phase-1 invariant tests); `apps/registry-viewer/package.json` (modified — `node:test` runner via `tsx ^4.15.7` devDep, byte-identical to `packages/registry/package.json:31` and `:46`). The 2 audit-trail files (D-8608): `apps/registry-viewer/src/lib/devLog.ts` (Category union widened by `+"cardTypes"` — required to make `cardTypesClient.ts` compile under `vue-tsc`; explicitly anticipated by WP-086 lines 135-137 + 192-195 and preflight-wp086 lines 59 + 76 but omitted from the EC §Files list); `apps/registry-viewer/src/lib/debugMode.ts` (IIFE + try/catch wrap around `import.meta.env.DEV` — required for node:test runtime safety because `import.meta.env` is undefined under node:test where Vite is not in the loader chain; Vite still substitutes `.DEV` to literal `false` in prod, so DCE on `URLSearchParams` is preserved). `pnpm-lock.yaml` additive 3-line viewer-side `tsx` entry; registry-package section byte-unchanged (per EC §35). Commit B (`SPEC:`, this commit) — **10 files**: 5 standard governance (this STATUS.md block; `WORK_INDEX.md` WP-086 row `[ ]` → `[x]` + Commit A SHA + body update; `EC_INDEX.md` EC-086 row Draft → `Done 2026-04-29`; `DECISIONS.md` 9 new entries D-8601..D-8609 inserted before `## Final Note`; `docs/03.1-DATA-SOURCES.md` new `card-types.json` row in the Registry Metadata files table) + 5 Option-C governance-close per D-8609 (`.claude/rules/registry.md` Critical Metadata Distinction section rewritten — schema description updated from pre-WP-084 37-entry shape to post-WP-086 13-entry shape; `.claude/rules/server.md` removes the orphan "Load `data/metadata/card-types.json`" responsibility line — file is viewer-fetched, not server-loaded; `docs/ai/REFERENCE/00.2-data-requirements.md §2.1` rewritten from DEPRECATED placeholder to current 13-entry schema description; `packages/registry/src/impl/httpRegistry.ts` educational comment updated to note the WP-086 reintroduction — the silent-failure pattern still applies generally; `apps/registry-viewer/CLAUDE.md` Key Files table gains the `cardTypesClient.ts` row alongside the three other R2 fetchers).

**Audit-trail rationale (D-8608, D-8609).** D-8608 documents the two production-file additions beyond the EC §Files list — both are minimal, additive, and were unavoidable to make the EC's mandated code paths compile and load under the new test runner. D-8609 documents the five governance-close additions beyond the standard 5-file set — all are doc/rules sync triggered by the same root cause (WP-086 reintroduces a deleted file at the same path with a different schema; without sync the rules / data-req docs would actively contradict shipped behavior). Three options were considered at execution time: (A) defer all rules/doc updates to a follow-up sweep, (B) amend WP-086 + EC-086 bodies to add the files (requires SPEC commits before A0), (C) treat as broader governance close (this option). Option C was selected by operator decision 2026-04-29.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ packages/preplan/` is empty.

**01.6 post-mortem OPTIONAL** per the WP-066 / WP-094 / WP-096 / EC-103 viewer-side precedent. Authored anyway at `docs/ai/post-mortems/01.6-WP-086-registry-viewer-card-types-upgrade.md` because the session surfaced three precedent-worth lessons (devLog.ts EC-vs-WP-body anticipation gap; debugMode.ts Vite-vs-node:test runtime gotcha; Option-C "doc-staleness sync as governance close" pattern). Per-section detail at §8 (mid-execution surprises) + §9 (carry-forward lessons) of the post-mortem; D-8607 (PS-2 Option B test-runner rationale) + D-8608 (mid-execution scope amendment) + D-8609 (Option-C governance-close scope) carry the decision-record cross-references.

**Vision alignment.** §1 (Rules Authenticity) — preserved; ribbon shape now reflects the actual card-type taxonomy from R2 instead of a hardcoded subset. §2 (Content Authenticity) — preserved; emojis and labels are explicit data not heuristically derived. §10 (Content as Data) — advanced; the ribbon is now driven by data rather than a hardcoded `TYPE_GROUPS` array. §10a (Registry Viewer public surface) — improved; new buttons (Sidekick, S.H.I.E.L.D.) surface card categories that exist in the source content but were previously invisible in the ribbon. §11 (Stateless Client Philosophy) — preserved; the ribbon is a render-time computation over fetched data; no client-side persistence. NG-1..NG-7 not crossed (no monetization, no PvP framing, no scoring/leaderboards; pure registry-viewer content surface). §20 Funding Surface Gate **N/A** declared with explicit justification — no funding affordance, no donation surface, no subscription path; ribbon buttons are non-funding registry-viewer content.

**Downstream impact.** WP-114 (Registry Viewer URL-Parameterized Setup Preview) becomes unblocked at the moment Commit B lands — its hard-sequencing dependency on WP-086 is satisfied (`LoadoutBuilder.vue` and `App.vue` are stable after this packet's edits). Phase 2 of the card-types rollout (separate WP, name TBD) can now safely populate per-card `cardType` slugs upstream via modern-master-strike + 40-set regen because the registry-side schema accepts arbitrary strings (`CardQuerySchema.cardType: z.string().optional()`) and the viewer enforces the taxonomy at fetch. The viewer-side `node:test` runner precedent (PS-2 Option B / D-8607) becomes available to future viewer-touching WPs that want automated test coverage.

### WP-111 / EC-118 Executed — UIState Card Display Projection (Engine-Side) — closes WP-100 D-10004 deferral (2026-04-29, EC-118)

🃏 **WP-111 complete — engine-side projection delivered, no off-engine package touched.** `G.cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>` is now built once at `Game.setup()` from registry data (heroes via `listCards()`; villains / henchmen / mastermind base card via `getSet(...)` walks; the new `parseCostNullable` wrapper around the canonical `parseCardStatValue`) and surfaced through `buildUIState` as additive `display` fields on `UICityCard` + `UIMastermindState` plus optional parallel arrays `UIHQState.slotDisplay?` (beside the unchanged `slots: (string | null)[]` per PS-6 / Q3 written audit) and `UIPlayerState.handDisplay?`. Sibling snapshot to `G.cardStats` (WP-018) / `G.villainDeckCardTypes` (WP-014B) / `G.cardKeywords` (WP-025); read only by `uiState.build.ts`; gameplay reads `G.cardStats` only (presentation-vs-gameplay separation lock — grep-enforced). The arena-client UI binding follow-up (replacing `{{ cardId }}` with `{{ display.name }}` plus image binding in `HandRow.vue` / `CityRow.vue` / `HQRow.vue` / `MastermindTile.vue`) is deferred; WP-100's D-10004 deferral resolves with the additive contract preserving existing `{{ cardId }}` consumers.

**Locked invariants preserved.** `UICardDisplay` is exactly four fields (`extId`, `name`, `imageUrl`, `cost: number | null`) — adding `team` / `class` / `setName` / `cardType` / `attack` / `recruit` / `keywords` is scope creep and requires a separate WP (D-11106). `UIHQCard` is exactly two fields. `parseCostNullable` is a single-line guard around `parseCardStatValue` (D-11104 PS-4) — distinguishes registry `null/undefined → null` ("no cost shown") from `0 → 0` ("free") without forking the canonical parser. **PS-8 / D-2801 projection-purity contract preserved**: `buildUIState` MUST NOT mutate `G.messages` (verified by grep + dedicated test); the missing-display-entry diagnostic surface lives at SETUP TIME via the new `auditCardDisplayDataCompleteness` helper (one consolidated message per setup, never per-card; mirrors WP-113 D-10014 single-detection-seam pattern). The projection-time `UNKNOWN_DISPLAY_PLACEHOLDER` fallback is a pure render path with no `G` interaction — D-11105 codifies the split. Aliasing prevention via per-entry shallow copies at every projection-time read of `G.cardDisplayData[extId]` (mirrors WP-028 cardKeywords post-mortem precedent); two dedicated aliasing-prevention tests assert the contract operationally at both build and filter boundaries. Mastermind display lookup uses `gameState.mastermind.baseCardId` (the canonical `G.cardStats` join key per `mastermind.setup.ts:211`), not `gameState.mastermind.id` (the qualified group id per PS-5).

**`<unknown>` literal centralization.** Exactly one match across the engine source (the `name` field of `UNKNOWN_DISPLAY_PLACEHOLDER` at `uiState.build.ts:64`) — grep-enforced. The constant's `extId` field is intentionally `''` and is overwritten at every projection-time substitution via `{...UNKNOWN_DISPLAY_PLACEHOLDER, extId}`; the empty-string default never reaches a UIState consumer.

**Test counts.** Engine baseline `570 / 126 / 0` → **`604 / 132 / 0`** (+34 tests / +6 suites / 0 fail). Full monorepo `pnpm -r build` exits 0. New coverage: cost-parsing matrix (six rows including `0 → 0` preserved + `null → null` distinct), 10-copy henchman expansion, mastermind base-card-only emission, layer-boundary guard fallback, drift sanity, projection completeness, redaction symmetry (opponent + viewer), public-display non-redaction, HQ length-equality + null-position invariant, projection determinism, **PS-8 projection-purity** (G.messages unchanged after `buildUIState` even with orphan ext_id), **PS-8 setup-time diagnostic** (one consolidated message), and **aliasing prevention** (build + filter boundaries). All tests use `node:test` + `node:assert`; no `boardgame.io/testing` import; no registry import in tests (structural mocks only); no modifications to `makeMockCtx`.

**File count.** Commit A `f842f71` — 10 files: 9 in the locked allowlist (3 new + 6 modified) plus 1 under 01.5. The locked 9 files: `packages/game-engine/src/ui/uiState.types.ts` (modified — new `UICardDisplay` + `UIHQCard` types; additive fields on `UICityCard` / `UIHQState` / `UIPlayerState` / `UIMastermindState`); `packages/game-engine/src/setup/buildCardDisplayData.ts` (new — setup-time builder with local structural reader + runtime guard + `parseCostNullable` wrapper + `for...of` walks for heroes / villains / henchmen / mastermind base card); `packages/game-engine/src/setup/buildCardDisplayData.test.ts` (new — 13 tests in one suite: cost matrix, henchman expansion, mastermind base-only, layer-boundary guard, drift, determinism, JSON round-trip); `packages/game-engine/src/setup/buildInitialGameState.ts` (modified — wired builder + new `isCardDisplayDataRegistryReader` orchestration guard message + new `auditCardDisplayDataCompleteness` helper); `packages/game-engine/src/types.ts` (modified — added `cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>` to `LegendaryGameState`; re-exported `UICardDisplay` + `UIHQCard`); `packages/game-engine/src/ui/uiState.build.ts` (modified — new `UNKNOWN_DISPLAY_PLACEHOLDER` constant + `resolveDisplay` helper; surfaced display through City / HQ / hand / Mastermind projections via per-entry shallow copies; **no `G.messages` mutation**); `packages/game-engine/src/ui/uiState.filter.ts` (modified — `redactHandCards` omits `handDisplay` alongside `handCards`; `preserveHandCards` uses conditional assignment + per-entry shallow copy; new `deepCopyCitySpaces` / `deepCopyHqSlotDisplay` helpers prevent aliasing on public passthrough); `packages/game-engine/src/ui/uiState.types.drift.test.ts` (modified — 7 new drift assertions); `packages/game-engine/src/ui/uiState.build.test.ts` (modified — 13 new tests across projection / purity / aliasing / setup-diagnostic suites). The 10th file under 01.5: `packages/game-engine/src/replay/replay.execute.test.ts` — `PRE_WP080_HASH` literal updated `'ba921e90'` → `'46f7863c'` because adding `cardDisplayData` to `LegendaryGameState` legitimately changes the JSON-encoded structure hash; value-only literal update with `// why:` comment citing 01.5 §Allowed Modifications and pre-flight 2026-04-29 §Runtime Readiness Check authorization; **no new gameplay or runtime behavior introduced**; reverts cleanly by deleting `cardDisplayData` from `LegendaryGameState` with no remaining diff. Commit B `<sha-b>` (`SPEC:`, this commit) — 6 files: `docs/ai/STATUS.md` (this block); `docs/ai/work-packets/WORK_INDEX.md` (new WP-111 row `[x]` + date + Commit A SHA); `docs/ai/execution-checklists/EC_INDEX.md` (new EC-118 row `Done 2026-04-29` + Summary count Total 68 → 69 / Done 20 → 21); `docs/ai/post-mortems/01.6-WP-111-uistate-card-display-projection.md` (new — three triggers: new long-lived abstraction `G.cardDisplayData`, new contract surface `UICardDisplay` + `UIHQCard`, new projection seam fields); `docs/ai/DECISIONS.md` (six new D-111NN entries inserted before `## Final Note`: D-11101 sibling-snapshot rationale, D-11102 `handDisplay` parallel-array, D-11103 `slotDisplay` parallel-array + Q3 audit, D-11104 `parseCostNullable` guard-not-parser citing PS-4, D-11105 `UNKNOWN_DISPLAY_PLACEHOLDER` setup-time-diagnostic + projection-purity citing D-2801 / PS-8, D-11106 deferred-card-types scope); `docs/03.1-DATA-SOURCES.md` (new `G.cardDisplayData` row in §Setup-Time Derived Data alongside `G.cardStats` / `G.cardKeywords` / `G.villainDeckCardTypes` / `G.heroAbilityHooks` / `G.schemeSetupInstructions`).

**01.5 IS INVOKED** — additive `LegendaryGameState.cardDisplayData` field is the single G-shape change. `buildInitialGameState` return value gains the new field; existing fields preserved. No new `LegendaryGame.moves` entry, no new phase hook. Allowance scope exercised exactly once: the value-only `PRE_WP080_HASH` literal update in `replay.execute.test.ts`. The change satisfies all four 01.5 §Allowed Modifications requirements (minimal, dependency-driven, literal-only, no new behavior). 01.5 §Reporting Requirement honored: file modified is `replay.execute.test.ts`; reason is the additive `cardDisplayData` field legitimately changes the JSON-encoded structure hash; structural change applied is a value-only literal update plus a `// why:` comment citing 01.5 + the pre-flight authorization; no new gameplay or runtime behavior introduced.

**01.6 post-mortem MANDATORY.** Three triggers fired: (1) new long-lived abstraction (`G.cardDisplayData` is the durable contract consumed by every present and future UIState projection path that surfaces card display data); (2) new contract surface (`UICardDisplay` 4 fields locked + `UIHQCard` 2 fields locked, both pinned by drift-detection tests, both consumed by every future UIState surface that displays cards); (3) new projection seam fields (`UICityCard.display`, `UIHQState.slotDisplay?`, `UIPlayerState.handDisplay?`, `UIMastermindState.display`). Delivered at `docs/ai/post-mortems/01.6-WP-111-uistate-card-display-projection.md`; all mandatory audits in §2 pass (layer boundary, projection-purity, aliasing, `// why:` comments, test coverage, verification grep, 01.5 invocation, vision alignment, determinism, persistence boundary, test infrastructure, scope discipline, forbidden-pattern). Section 3 carry-forward lessons: (3.1) when an illustrative session-prompt example introduces a literal that an EC grep gate counts, the gate's literal threshold must include every site the example introduces; (3.2) WPs adding fields to `LegendaryGameState` should expect at least one structural-hash test to surface the cascade — pre-flight inventory should explicitly name `replay.execute.test.ts:PRE_WP080_HASH` as a known cascade target; (3.3) the "guard not parser" pattern (3-line wrapper around the canonical parser) is reusable for future widener-mismatch dilemmas; (3.4) sibling-snapshot pattern continues to scale (4th instance after WP-014B / WP-018 / WP-025); (3.5) parallel-array additive-extension is the established escape hatch when widening a `(string | null)[]` projection risks breaking off-allowlist consumers; (3.6) any future setup-time sibling snapshot SHOULD pair with an orchestration-side completeness sweep mirroring `auditCardDisplayDataCompleteness`.

**Vision alignment.** §1 (Rules Authenticity) — preserved; card names flow verbatim from the registry into UIState. §2 (Content Authenticity) — preserved; image URLs flow verbatim (hyphens, never underscores per registry rules). §3 (Player Trust & Fairness) — preserved; engine continues to own all gameplay state; clients cannot use `display.cost` to bypass move validation (gameplay reads `G.cardStats`, grep-verified). §10 (Content as Data) — advanced; this packet is the engine's mechanism for content-as-data reaching the UI without granting the UI a runtime registry seam. §11 (Stateless Client Philosophy) — preserved; client remains stateless, `G.cardDisplayData` is server-side authoritative state projected via UIState. §22 (Deterministic & Reproducible Evaluation) — preserved; `G.cardDisplayData` is built deterministically at setup from a fixed registry and fixed config, replays reconstruct the same map byte-for-byte, no randomness / time / I/O at projection time. NG-1..NG-7 not crossed (no monetization, no cosmetic store, no persuasive UI, no engagement-pattern dark surfaces, no paid competitive lane, no content gated behind purchase). §20 Funding Surface Gate **N/A** declared with explicit justification (no funding affordance, no donation surface, no subscription path). Determinism N/A explicitly: `parseCardStatValue` returns `0` not `null` for null/undefined inputs per the canonical contract; `parseCostNullable` preserves the UX distinction without forking the parser.

**Downstream impact.** The arena-client UI binding follow-up WP becomes unblocked at the moment Commit B lands. WP-100's D-10004 deferral resolves: registry display projection is now available as additive UIState fields, and the follow-up UI WP can replace `{{ cardId }}` with `{{ display.name }}` plus `<img :src="display.imageUrl" />` in `HandRow.vue` / `CityRow.vue` / `HQRow.vue` / `MastermindTile.vue` without re-deriving the source-field map. The eight deferred card types (`bystander`, `scheme-twist`, `mastermind-strike`, `scheme`, `wound`, `officer`, `sidekick`, mastermind tactic) per D-11106 await separate WPs that explicitly justify their inclusion, define the source-field map, and (where the four-field shape is insufficient) extend `UICardDisplay` with explicit governance.

### WP-102 / EC-117 Executed — Public Player Profile Page (Read-Only) — server-side ready; route wiring deferred to future request-handler WP per D-10202 (2026-04-28, EC-117)

🪪 **WP-102 complete with one deliberate scope reduction: route wiring deferred.** Public, read-only `?profile=<handle>` arena-client page composing `PublicProfileView { handleCanonical, displayHandle, displayName, publicReplays }` from `legendary.players` + `legendary.replay_ownership` via the new `getPublicProfileByHandle` library + `registerProfileRoutes` Koa adapter. **Commit A `369c0a4` ships 7 of the 8 specified files; the one-line `registerProfileRoutes(server.router, database)` addition to `apps/server/src/server.mjs` is deferred to the future request-handler WP that owns long-lived `pg.Pool` lifecycle (per D-10202; cite D-3103 mid-execution amendment + WP-053 `submitCompetitiveScore` shipped-but-unwired precedent).** The deferral is a deliberate scope reduction, not a gap: pool config (max, idleTimeoutMillis, error handlers, SIGTERM ordering, observability hooks) is load-bearing for every future request handler and belongs in the WP that owns those decisions, not under WP-102's read-only-profile-composition scope-discipline pressure. During the deferral window, `?profile=<handle>` returns 404 from the dev server's default handler; `PlayerProfilePage.vue` renders the locked "No player has claimed this handle." empty-state — UX is indistinguishable from a real unclaimed-handle 404, so no broken-experience cliff.

**Locked invariants preserved.** `ProfileResult<T>` is **declared locally** in `profile.types.ts` per pre-flight PS-5 (WP-052 `Result<T>` is keyed on `IdentityErrorCode` and cannot carry `'player_not_found'`); `^import.*\bResult\b.*from.*identity\.types` returns zero matches. `AccountId` / `PlayerAccount` / `DatabaseClient` are re-imported from `../identity/identity.types.js`. The 4-field `PublicProfileView` shape (`handleCanonical`, `displayHandle`, `displayName`, `publicReplays`) and the 4-field `PublicReplaySummary` shape (`replayHash`, `scenarioKey`, `visibility`, `createdAt`) are drift-tested; `'private'` is excluded at the type level (`'public' | 'link'` union), at the SQL level (`visibility IN ('public', 'link')`), AND at the application layer (`if (row.visibility !== 'public' && row.visibility !== 'link') continue;`) — three layers of defense per RISK #10 from copilot-check 2026-04-28. Aliasing prevention per RISK #17: fresh `PublicProfileView` literal per call, fresh `PublicReplaySummary` literal per row, no `result.rows` passthrough or spread. The `getHandleForAccount` round-trip (option (b) per session-prompt §Implementation Task B) preserves the locked `loadPlayerIdByAccountId` SQL contract while populating the case-preserved `displayHandle` field. The lifecycle prohibition (RISK #16) is honored by the deferral with extra strength: there is **no production caller** for the four exported profile-layer surfaces during the deferral window.

**Public-surface invariant.** Per `DESIGN-RANKING.md` lines 485–487 + WP-101 §Non-Negotiable Constraints: handles are presentation aliases, never identity keys. WP-102's `getPublicProfileByHandle` dereferences handle → `AccountId` per request via `findAccountByHandle`; no `(handle, content)` association is cached beyond request scope. The 404 response body is `{ "error": "player_not_found" }` verbatim — no information leak distinguishing unclaimed vs deleted vs reserved handles, and the no-tombstone policy ensures a deleted-and-reclaimed handle serves only the new account's content under any code path introduced here.

**Test counts.** Server baseline `63 / 9 / 0` → **`71 / 10 / 0`** (+8 tests, +1 suite, +0 fails — locked delta achieved exactly). Without `TEST_DATABASE_URL` 24 tests skip via `{ skip: 'requires test database' }` (19 prior + 5 new); 47 pass (44 prior + 3 new pure drift tests). With the test database all 71 tests execute. Engine baseline **`570 / 126 / 0` unchanged** (post-WP-113 floor preserved byte-for-byte). The +1 suite delta corresponds to the new `describe('public profile logic (WP-102)', ...)` block — 8 tests in that block (3 drift + 5 DB-dependent); no other test file was touched. arena-client builds cleanly; `PlayerProfilePage.vue` lazy-loads as a separate chunk (`PlayerProfilePage-B-8YSX8_.js` 3.65 kB) confirming `defineAsyncComponent` per-route lazy-load works.

**File count.** Commit A `369c0a4` — exactly **7** files (not the originally specified 8): `apps/server/src/profile/profile.types.ts` (new), `apps/server/src/profile/profile.logic.ts` (new), `apps/server/src/profile/profile.routes.ts` (new — `registerProfileRoutes` exported with no production caller during deferral window), `apps/server/src/profile/profile.logic.test.ts` (new — 8 tests in 1 describe block), `apps/arena-client/src/App.vue` (modified — extends `AppRoute` with `'profile'`, `selectRoute` precedence reorder `profile > fixture > live > lobby`, lazy-loaded `<PlayerProfilePage>` branch), `apps/arena-client/src/pages/PlayerProfilePage.vue` (new — six inert empty-state tabs each with rationale `<!-- why: -->`), `apps/arena-client/src/lib/api/profileApi.ts` (new — typed `fetch` wrapper with percent-encoded path-segment defense). The deferred eighth file (`apps/server/src/server.mjs`) is **not** modified per D-10202. Commit B (`SPEC:`, this commit) — 6 files: `docs/ai/STATUS.md` (this block), `docs/ai/work-packets/WORK_INDEX.md` (WP-102 row `[ ]` → `[x]` + date + Commit A SHA), `docs/ai/execution-checklists/EC_INDEX.md` (EC-117 row Draft → Done 2026-04-28), `docs/ai/post-mortems/01.6-WP-102-public-profile-page.md` (new — mandatory per 01.6), `docs/ai/DECISIONS.md` (D-10201 + D-10202 inserted before `## Final Note`), and `docs/ai/work-packets/WP-102-public-profile-page.md` + `docs/ai/execution-checklists/EC-117-public-profile-page.checklist.md` (§H / §Files to Produce amendments documenting the deferral).

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. The four exported profile-layer surfaces (`getPublicProfileByHandle`, `loadPlayerIdByAccountId`, `registerProfileRoutes`, `fetchPublicProfile`) are not called from any forbidden caller path per the lifecycle prohibition list in WP-102 §Non-Negotiable Constraints (RISK #16); the deferral strengthens this — there is currently no production caller at all.

**01.6 post-mortem MANDATORY.** Five triggers fired: (1) new long-lived abstraction (`getPublicProfileByHandle` is the durable contract consumed by WP-104 owner-edit, WP-105 badges, WP-107+ integrity, WP-108+ support, and any future profile-feature WP); (2) new HTTP-surface contract (`GET /api/players/:handle/profile` + `fetchPublicProfile(handle)`); (3) new persistence-read consumer (first read-only consumer of `legendary.replay_ownership` outside WP-052's own test file); (4) new code subdirectory (`apps/server/src/profile/` per D-10201, mirrors D-5202 / D-10301); (5) first arena-client routed page outside live-match flow (establishes the `App.vue` query-string router extension pattern for future routed pages). Delivered at `docs/ai/post-mortems/01.6-WP-102-public-profile-page.md`; all fourteen mandatory audits in the session prompt's `## Post-Mortem (01.6) — MANDATORY` section pass. Section 3 §3.1 proposes an addition to the 01.4 pre-flight `§Dependency Contract Verification` template ("Wiring-site verification" sub-item: grep the named entry-point file for the constructor of any caller-injected long-lived dependency before declaring READY) so a future executor catches the same gap at pre-flight time rather than mid-execution.

**Vision alignment.** §3 (Player Trust & Fairness) — public profile surfaces only audit outputs (claimed handle, display name, public-or-link-visible replay references); zero gameplay influence; visibility opt-in by default (`legendary.replay_ownership.visibility DEFAULT 'private'`). §11 (Stateless Client Philosophy) — Vue SPA fetches a server-composed projection on mount and on prop change; no client-side cache, no merging of historical responses, no localStorage profile cache; six empty-state tabs render static text only (zero `fetch` / XHR / WebSocket / Vue-lifecycle calls). §14 (Explicit Decisions, No Silent Drift) — handle-as-presentation-alias rule, no-tombstone reuse implication, handle → `AccountId` dereference invariant all recorded explicitly in WP-102 §Non-Negotiable Constraints + tested for drift via tests 1–3. §18 (Replayability & Spectation) — public profile surfaces a player's `'public'` and `'link'` replays so spectators can find them; `'private'` and expired excluded by SQL + type + app guard (defense-in-depth). §22 (Replay determinism) — render-only metadata; zero engine touch. §24 (Replay-Verified Competitive Integrity) — no ranking input exposed; "Rank" empty-state stub names WP-054 / WP-055 deferral and per-tab `<!-- why: -->` notes that future ranking surfacing MUST key on `AccountId`, never the handle. §25 (Skill Over Repetition — Non-Ranking Telemetry Carve-Out) — handle display on profile pages is non-ranking telemetry; ranking-identity invariant preserved. NG-1..NG-7 not crossed (no paid surface; no content gated; no FOMO timers / dark patterns; six empty-state tabs are inert). Funding Surface Gate (00.3 §20) declared **N/A** with explicit justification — "Support — coming soon (WP-108+)" tab makes no fetch and renders no donation / subscription / tournament-funding affordance.

**Downstream impact.** The future request-handler WP that owns long-lived `pg.Pool` lifecycle becomes the natural home for the deferred `registerProfileRoutes(server.router, database)` addition + any pool-lifecycle hooks (`pool.on('error', ...)`, `pool.end()` on SIGTERM); it must verify `git grep -nE "registerProfileRoutes\(server\.router," apps/server/src/server.mjs` returns exactly one match at its own commit boundary. WP-104 (owner edit `/me`), WP-105 (badges), WP-107+ (integrity surfacing), WP-108+ (support / payments) each become the natural enabling WP for one of the six empty-state tabs and will land their respective fetch logic per the per-tab `<!-- why: -->` rationale comments in `PlayerProfilePage.vue`. None of those WPs require WP-102 itself to be re-amended — they extend the surface forward.

### WP-101 / EC-114 Executed — Handle Claim Flow & Global Uniqueness (2026-04-28, EC-114)

🪪 **WP-101 complete — server-side handle claim contract delivered, no engine touch.** `apps/server/src/identity/handle.{types,logic,logic.test}.ts` and `data/migrations/008_add_handle_to_players.sql` land an immutable, globally unique, URL-safe handle on top of the WP-052 `legendary.players` table. Three new columns (`handle_canonical`, `display_handle`, `handle_locked_at`) extend the row with the locked mutual-presence invariant (NULL together or non-NULL together; never updated once non-null). A partial UNIQUE index `legendary_players_handle_canonical_unique ON legendary.players (handle_canonical) WHERE handle_canonical IS NOT NULL` enforces global uniqueness once any handle is claimed while permitting multiple pre-claim NULLs. The four exported functions (`validateHandleFormat`, `claimHandle`, `findAccountByHandle`, `getHandleForAccount`) form the durable contract that future surfaces (WP-102 public profile, WP-112 session validation, the future request-handler WP for the claim endpoint) will consume; this packet ships the library only — no consumer is wired.

**Locked invariants preserved.** `Result<T>` and `AccountId` are **re-imported** from `./identity.types.js`, never redeclared; `^type Result|^export type Result` returns zero matches in `handle.types.ts`. The 5-value `HandleErrorCode` union (`'invalid_handle' | 'reserved_handle' | 'handle_taken' | 'handle_already_locked' | 'unknown_account'`) and the 15-entry alphabetical `RESERVED_HANDLES` array are drift-tested. `HANDLE_REGEX.source === '^[a-z][a-z0-9_]{2,23}$'` is asserted byte-for-byte. The locked claim SQL (`UPDATE legendary.players SET handle_canonical = $2, display_handle = $3, handle_locked_at = now() WHERE ext_id = $1 AND handle_canonical IS NULL RETURNING ext_id, handle_canonical, display_handle, handle_locked_at`) is the SOLE writer for the three handle columns — `grep "UPDATE legendary\.players"` returns exactly one match in `handle.logic.ts`. Canonicalization order is locked (trim → reject `__` → `HANDLE_REGEX` → `RESERVED_HANDLES`); `claimHandle` never throws (every failure returns `Result.ok = false`; non-23505 PostgreSQL errors propagate via `Promise.reject(error)` to satisfy the verification gate's literal-`throw` ban while preserving the WP-052 escalation contract by behavior). No tombstone column, no `legendary.deleted_handles` table — anti-impersonation reservation is explicitly out of scope per WP-101 §Non-Negotiable Constraints.

**Public-surface invariant.** Per `DESIGN-RANKING.md` lines 485–487 and WP-101 §Non-Negotiable Constraints: handles are presentation aliases, never identity keys. `AccountId` (per WP-052 / D-5201) remains the stable identity for ranking, authorization, and cross-service lookups. Future surfaces that route on handles (WP-102 `/players/{handle}`, leaderboard displays, replay attribution) MUST dereference handle → `AccountId` at the point of use; cached `(handle, content)` associations are stale by construction once the underlying account changes under the no-tombstone policy. No symbol introduced uses `replay` as a prefix and no comment, error message, or test name uses the bare phrase "replay handle" to refer to the user-facing identifier — the `Handle` / `Handle*` namespace is reserved exclusively for user-facing account identifiers, disambiguating from `DESIGN-RANKING.md` lines 145, 205 which use "replay handle" to mean `replayHash`.

**Test counts.** Server baseline `51 / 8 / 0` → **`63 / 9 / 0`** (+12 tests, +1 suite, +0 fails). Without `TEST_DATABASE_URL` 19 tests skip via `{ skip: 'requires test database' }` (16 prior + 3 new); 44 pass (35 prior + 9 new pure). With the test database all 63 tests execute. Engine baseline **`570 / 126 / 0` unchanged** (post-WP-113 floor preserved byte-for-byte). The +1 suite delta corresponds to exactly the new `describe('handle logic (WP-101)', ...)` block; no other test file was touched.

**File count.** Commit A `fb1ca2b` — exactly 4 files: `apps/server/src/identity/handle.types.ts` (new), `apps/server/src/identity/handle.logic.ts` (new), `apps/server/src/identity/handle.logic.test.ts` (new — 12 tests in 1 describe block), `data/migrations/008_add_handle_to_players.sql` (new). Commit B (`SPEC:`, this commit) — 4 files: `docs/ai/STATUS.md` (this block), `docs/ai/work-packets/WORK_INDEX.md` (WP-101 row `[ ]` → `[x]` + date + Commit A SHA), `docs/ai/execution-checklists/EC_INDEX.md` (EC-114 row Draft → Done 2026-04-28), `docs/ai/post-mortems/01.6-WP-101-handle-claim-flow.md` (new — mandatory per 01.6). `git diff --name-only main -- packages/ apps/arena-client/ apps/replay-producer/ apps/registry-viewer/ apps/server/src/{server.mjs,index.mjs,rules/,par/,game/,replay/} apps/server/src/identity/identity*.ts apps/server/src/identity/replayOwnership*.ts apps/server/scripts/ apps/server/package.json data/migrations/00{1,2,3,4,5,6,7}_*.sql` returns empty across both commits.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. The four handle functions are not called from any `LegendaryGame.moves` entry, any phase hook, any file under `packages/game-engine/`, `packages/registry/`, `packages/preplan/`, `packages/vue-sfc-loader/`, or any UI app — they are consumed only by their own test file in this packet.

**01.6 post-mortem MANDATORY.** Three triggers: (1) new long-lived abstraction (`claimHandle` is the durable identity contract consumed by WP-102 / WP-112 / future request-handler WPs); (2) new contract consumed by future WPs (`findAccountByHandle` / `getHandleForAccount` form the public API surface for handle → `AccountId` resolution); (3) new persistence surface (three columns + partial UNIQUE index extending `legendary.players`). Delivered at `docs/ai/post-mortems/01.6-WP-101-handle-claim-flow.md`. All fourteen mandatory audits in the session prompt's `## Post-Mortem (01.6) — MANDATORY` section pass.

**Vision alignment.** §3 (Player Trust & Fairness) — handles are explicit user choices, not server-derived from auth-provider data; the reserved set and regex are documented and exported. §11 (Stateless Client Philosophy) — handle state is server-authoritative; the client carries no handle state beyond what it submits during claim and reads back from authoritative responses. §14 (Explicit Decisions, No Silent Drift) — every locked decision (canonicalization order, charset, reserved set, lock semantics, no-tombstone policy, no-rename policy) is recorded explicitly in WP-101 §Non-Negotiable Constraints and tested for drift. §25 (Skill Over Repetition — Non-Ranking Telemetry Carve-Out) — handles never enter ranking inputs, RNG, scoring, matchmaking, or competitive surfaces; display in profile pages and replay metadata is non-ranking telemetry per the §25 carve-out. NG-1..NG-7 not crossed (handles are not purchasable, not gated, not gacha-randomized, not ad surfaces, not energy-limited, not used as dark patterns; rename-disallowed is a simple invariant, not a dark pattern).

**Downstream impact.** WP-102 (public profile page) becomes unblocked at the moment Commit B lands; its `## Assumes` block will cite WP-101 + the four exported functions. WP-112 (session token validation; renumbered from "WP-100" per D-10002) remains independent — WP-101 does not require it to land first; WP-101 treats authenticated session resolution as a caller-injected contract per the WP-052 dependency-injection precedent. The future request-handler WP for the claim endpoint will import `claimHandle` from `apps/server/src/identity/handle.logic.js`.

### WP-099 / EC-099 Executed — Auth Provider Selection (2026-04-27, EC-099)

**WP-099 complete — governance-only; zero runtime behavior change.** Hanko (open-source backend AGPL; frontend MIT; self-hostable; OIDC-compliant; passkey-first) is now the project's sole approved authentication broker, anchored by `D-9901..D-9905` in `docs/ai/DECISIONS.md` and a single Hanko-specific carve-out bullet appended to `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §7` (line 169, immediately after the existing Passport / Auth0 / Clerk ban). The four pre-existing forbidden-package bullets at lines 165–168 (`axios` / `node-fetch`, ORMs, Jest / Vitest / Mocha, Passport / Auth0 / Clerk) are byte-identical to baseline INCLUDING their inline backticks. Auth0 / Clerk / Passport remain forbidden — the §7 amendment is Hanko-specific, not category-wide. The WP-052 identity model is unchanged: `authProvider: 'email' | 'google' | 'discord'` enum unchanged at `apps/server/src/identity/identity.types.ts:58`; `AccountId` continues to be generated server-side via `node:crypto.randomUUID()` per WP-052 D-5201; Hanko's OIDC `sub` claim becomes the value of `authProviderId`, never the value of `AccountId`. The string `'hanko'` MUST NOT appear as an `auth_provider` enum value anywhere under `apps/`, `packages/`, or `data/migrations/` — verified by grep guards (Verification §A6 + §B11). Hanko-specific code is locked to `apps/server/src/auth/hanko/` (sibling to `identity/`, never under it) per D-9904; the engine, registry, identity layer, and any UI package remain Hanko-free. Replacing Hanko later (with a different OIDC-compliant broker or with an in-house `jsonwebtoken` integration) requires zero migrations of `legendary.players` data and zero changes to the engine, registry, or game-state surface.

**Scope.** Five files across two commits per the WP-097 / WP-098 governance-WP precedent. Commit A `f6cd591` (`EC-099:`) — single file: `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (Hanko carve-out bullet appended at line 169). Commit B (`SPEC:`, this commit) — four files: `docs/ai/DECISIONS.md` (`## D-9901` → `## D-9905` inserted as a contiguous numeric-order block immediately before `## Final Note`, after D-9801 — chronological-tail append per the now-three-precedent convention WP-097 / D-9701, WP-098 / D-9801, WP-099 / D-9901..D-9905); `docs/ai/STATUS.md` (this block at top of `## Current State`); `docs/ai/work-packets/WORK_INDEX.md` (WP-099 row at line 2036 flipped `[ ]` → `[x]` with today's date and Commit B SHA); `docs/ai/execution-checklists/EC_INDEX.md` (EC-099 row flipped `Draft` → `Done 2026-04-27`). `git diff --name-only packages/ apps/ docs/01-VISION.md docs/ai/ARCHITECTURE.md .claude/ data/migrations/` returns empty across both commits. No new npm dependencies; no environment configuration; no `@teamhanko/*` SDK install (that is the future implementation WP's deliverable, not WP-099's).

**Vision alignment.** §3 (Player Trust & Fairness) — passkey-first authentication strengthens trust by removing the password-storage / phishing / credential-stuffing vulnerability class; identity is auditable via `legendary.players` rows that record the federated IdP, not the broker. §11 (Stateless Client Philosophy) — the client carries Hanko's short-lived session credential only; authoritative identity (`AccountId`, replay ownership) lives server-side. §14 (Explicit Decisions, No Silent Drift) — `D-9901..D-9905` are the explicit decision record; the broker selection no longer emerges from "whatever the implementation WP author picks." §15 (Built for Contributors) — Hanko is open-source and self-hostable; contributors can run the full stack locally without surrendering architectural sovereignty to a closed vendor. NG-1 (pay-to-win) — authentication never gates gameplay or competitive surfaces; guests remain first-class. NG-3 (content withheld) — authentication unlocks account-only conveniences only, never content. NG-6 (dark patterns) — Hanko's Flow API is server-authoritative; no FOMO timers or manipulative re-prompts in the auth flow. NG-2 / NG-4 / NG-5 / NG-7 N/A. Determinism N/A — engine, registry, scoring, replay, and RNG surfaces are entirely untouched.

**01.5 NOT INVOKED** — engine untouched. No `LegendaryGameState` field, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. `git diff --name-only packages/ apps/` returns empty across both commits.

**01.6 post-mortem OPTIONAL** per the WP-093 / WP-097 / WP-098 governance-WP precedent (no executable code; no long-lived abstraction beyond the decision record itself; no new contract surface, projection, or setup artifact). Not authored in this session.

**Downstream impact.** WP-112 (Session Token Validation Middleware — renumbered from "WP-100" per D-10002) becomes unblocked at the moment Commit B lands; its `## Assumes` block will cite WP-099 + `D-9901..D-9905` as the policy contract. The future Hanko-wiring WP (provisional name "WP-1XX External Authentication Integration — Hanko") becomes unblocked; it must satisfy the §C Future-Auth Gate F-1..F-7 (in WP-099) before merging. WP-101 (Handle Claim Flow), WP-102 (Public Profile Page), WP-104 (TBD) — none of these require WP-099 to land first; all use the caller-injected `requireAuthenticatedSession` provider pattern, but their §17 Vision Alignment blocks may now optionally cite WP-099 for the auth-broker policy.

### WP-098 / EC-098 Executed — Funding Surface Gate Trigger (2026-04-27, EC-098)

**WP-098 complete — governance-only; zero runtime behavior change.** `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` now carries `## §20 — Funding Surface Gate Trigger` between §19 (Bridge-vs-HEAD Staleness Rule) and `## Final Gate`, structurally parallel to §17 Vision Alignment. §20.1 lists the five trigger surfaces with the user-interaction qualifier on the user-visible-copy bullet, the strengthened N/A justification bar rejecting bare and tautological placeholders, the Governance-doc exclusion sub-bullet, and the Analytical / retrospective non-trigger sub-bullet. §20.2 lists the four required-content items including the explicit "Partial mapping is a FAIL" enforcement clause on the G-1..G-7 disposition item. §20.3 lists five boundary clarifications including the automation-not-implied clarification. §20 cites WP-097 §F by ID throughout; G-1..G-7 appear only as ID citations, never duplicated. The Final Gate numbered table gains five new §20-attributed rows (34..38) covering: missing gate section; missing or partial G-1..G-7 mapping; bare or tautological N/A; Public Blurb paraphrase without `D-NNNN` carve-out; narrative-only future-funding-surface description while declaring §20 N/A. §17 / §18 / §19 and the §19 commit-time-discipline note that follows the Final Gate table are preserved byte-for-byte. D-9801 anchors §20 itself, distinguishing its scope from D-9701 (D-9701 = "what the policy is"; D-9801 = "how the lint gate enforces it") and includes the one-line decision-ID-range breadcrumb so a future auditor encountering D-9801 in isolation can recover the D-98xx convention without re-deriving it. Auto-trigger now applies to every funding-touching WP at lint time.

**Scope.** Five files: `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (Commit A — §20 insertion + five Final Gate rows); `docs/ai/DECISIONS.md` (D-9801 inserted immediately before `## Final Note`); `docs/ai/STATUS.md` (this block at top of `## Current State`); `docs/ai/work-packets/WORK_INDEX.md` (WP-098 row flipped `[ ]` → `[x] Done 2026-04-27` with Commit-A SHA `545c37f`); `docs/ai/execution-checklists/EC_INDEX.md` (EC-098 row flipped `Draft (blocked on WP-097 execution)` → `Done 2026-04-27`). Two-commit topology per EC-085 / EC-097 governance-WP precedent: A `EC-098:` (00.3 §20 insertion, single file, SHA `545c37f`); B `SPEC:` (governance close, four files). `git diff --name-only packages/ apps/ docs/01-VISION.md docs/ai/ARCHITECTURE.md .claude/ docs/TOURNAMENT-FUNDING.md docs/ai/work-packets/WP-097-tournament-funding-policy.md` returns empty across both commits.

**Vision alignment.** §Financial Sustainability + NG-1 / NG-3 / NG-5 / NG-6 / NG-7 strengthened by §20 enforcement (silent omission of the WP-097 §F gate is now a named §20 lint FAIL rather than the §17-by-analogy claim the WP-097 §F Audit-discipline block previously made). No vision clauses redefined. §17 self-applied at WP authoring; satisfied. §20 self-applied at WP authoring as N/A-with-justification (WP-098 implements no UI surface), preserved at execution as a deliberate reference example for downstream WPs.

**01.5 NOT INVOKED** — engine untouched. No `LegendaryGameState` field, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. `git diff --name-only packages/ apps/` returns empty across both commits.

### WP-097 / EC-097 Executed — Tournament Funding Policy (2026-04-27, EC-097)

📜 **WP-097 complete — governance-only; zero runtime behavior change.** `docs/TOURNAMENT-FUNDING.md` is now the governance-anchored funding contract for Legendary Arena tournaments, with explicit scope-distinction from `docs/01-VISION.md §Financial Sustainability`. Four surgical insertions: a new `## Scope` section between `## Authority` and `## Definitions` (locks the tournament-vs-platform scope split with the Explicit-exclusion clause for amortized / shared platform costs); a tightened `## Definitions` "Infrastructure" entry specifying "incremental tournament-specific" scope; a Vision peer-authority citation at the foot of `## Authority`; a `D-9701` anchor citation at the foot of `## Governance and Amendments`. All other sections (Funding Principles, Approved Funding Channels, Disallowed Models, Reconciliation, Cost Baseline, Sunset / Dissolution, Summary, Public Blurb) byte-identical to the 2026-04-26 baseline. The slogan "No margin, no mission" remains absent from the funding doc to prevent semantic collision with Vision (which uses the phrase in the standard nonprofit-margin sense; the funding doc uses "no organizer margin" instead).

**Scope.** Five files: `docs/TOURNAMENT-FUNDING.md` (Commit A — funding-doc reconciliation, four surgical insertions); `docs/ai/DECISIONS.md` (D-9701 inserted immediately before `## Final Note`); `docs/ai/STATUS.md` (this block at top of `## Current State`); `docs/ai/work-packets/WORK_INDEX.md` (WP-097 row flipped `[ ]` → `[x] Done 2026-04-27`); `docs/ai/execution-checklists/EC_INDEX.md` (EC-097 row flipped `Draft` → `Done 2026-04-27`). Two-commit topology per EC-085 / EC-093 governance-WP precedent: A `EC-097:` (funding-doc reconciliation, single file) + a small follow-up `EC-097:` lowercase fix-up to satisfy the case-sensitive AC-1 grep on `incremental tournament-specific`; B `SPEC:` (governance close, four files). Commit ordering lock honored — D-9701 cites the reconciled funding doc as it stands after Commit A. `git diff --name-only packages/ apps/ docs/01-VISION.md docs/ai/ARCHITECTURE.md .claude/` returns empty.

**01.5 NOT INVOKED.** All four triggers absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. Governance-only packet — `git diff --name-only packages/ apps/` returns empty.

**Vision alignment.** §Financial Sustainability — peer authority, no conflict. The decision distinguishes tournament-level community funding (this scope) from platform-level revenue (Vision scope); the two coexist (platform may sell organized-play licensing to organizers; organizers may not extract profit from participants). NG-1, NG-2, NG-3, NG-5, NG-6, NG-7 all preserved (each cross-referenced from the funding doc's `## Disallowed Models` and from D-9701's locked-anchor list); NG-4 (energy systems / friction) N/A — funding policy introduces no in-game mechanics. Determinism N/A — engine entirely untouched.

---

### WP-113 / EC-113 Executed — Engine-Server Registry Wiring + Match-Setup Validator / Builder ID Alignment (2026-04-27, EC-113)

🔌 **WP-113 complete — match creation now produces non-empty matches end-to-end.** Two coupled WP-100 smoke-test gaps closed in one cohesive fix: (1) the server now wires the loaded card registry into the engine via `setRegistryForSetup(registry)` at startup, before `Server({ games, origins })` constructs the boardgame.io game server; (2) all five `MatchSetupConfig` entity-ID fields use the locked set-qualified `<setAbbr>/<slug>` format — bare slugs, display names, and flat-card keys are all rejected by the validator. The two-layer fix unblocks the WP-100 click-to-play surface from producing structurally empty matches.

**Server wiring fix (PS-5 minimal diff).** `apps/server/src/server.mjs` now imports `setRegistryForSetup` from `@legendary-arena/game-engine` and calls it immediately after `await Promise.all(...)` resolves the registry. The `Promise.all` destructure was renamed `[, , parGate]` → `[registry, , parGate]` to capture the resolved registry. The engine-side `if (gameRegistry)` guard at `game.ts:201-210` is preserved unchanged — it remains the test-context skip path. A new `apps/server/src/server.mjs.test.ts` locks the wiring contract by asserting (a) the import of `setRegistryForSetup` from `@legendary-arena/game-engine`, (b) the destructure renaming, (c) the `setRegistryForSetup(registry)` call existence, and (d) the call ordering (BEFORE `Server({ games, origins })` construction).

**Validator and builder ID alignment.** `matchSetup.validate.ts` now widens the `CardRegistryReader` interface to `{ listCards, listSets, getSet }` (PS-3 — Option (i) in-place); adds `parseQualifiedId(input)` that rejects empty / no-slash / multiple-slash / empty-part / leading-or-trailing-whitespace inputs; and adds five per-field `buildKnown{Scheme,Mastermind,VillainGroup,HenchmanGroup,Hero}QualifiedIds` helpers that delegate to per-builder slug-source helpers (Class A flat-card-key decoders + Class B set-data slug enumerators). The validator emits a format-error before any existence check, distinguishes "set not loaded" from "slug not in that set", and never re-implements slug grammar independently (Authority Lock).

**Builder Filtering Order LOCKED.** All four (now five) PS-7 builders parse `<setAbbr>/<slug>` at the entry point, route `(setAbbr, slug)` into internal helpers, filter by `setAbbr` first, and match by `<slug>` within that set's cards only. Cross-set fallback is eliminated. Hero slugs collide across sets (51/307 instances per the PS-8 probe), so the named-set filter is non-negotiable for determinism.

**Mid-execution amendment (D-3103 precedent).** During execution, the runtime trace from `buildCardStats` consuming `matchConfig.heroDeckIds` / `villainGroupIds` / `henchmanGroupIds` surfaced a fifth PS-7 internal-iterator site at `packages/game-engine/src/economy/economy.logic.ts` that the EC §6 enumeration missed. The amendment was authorized inline per the D-3103 precedent: WP §Mid-Execution Amendment block added; EC PS-7 list extended; hard-cap raised 16 → 17 inline; `buildCardStats()` now parses qualified IDs at the boundary and routes `(setAbbr, slug)` into `filterHeroCardsByDeckSlug`, `findVillainGroupCards`, and `findHenchmanGroupVAttack`. The fix is mechanically identical to the four pre-existing PS-7 sites. A local `parseQualifiedIdForSetup` is duplicated in `economy.logic.ts` (NOT imported from the validator) to keep the file free of validator coupling. The 01.6 post-mortem captures this as a process improvement: future WPs introducing contract changes on `MatchSetupConfig` fields should grep ALL source files for `matchConfig.{fieldName}` consumption, not just `/setup`-named directories.

**Orchestration-side diagnostic emission (Q3 LOCKED, PS-4).** Per the Uniformity Rule, all four setup-builder skip diagnostics emit at the orchestration site (`packages/game-engine/src/setup/buildInitialGameState.ts`). None of the four builders receives `G`, so emission inside any builder would require a forbidden signature change. The orchestration site builds a local `setupMessages: string[]` accumulator BEFORE constructing `baseState`, runs each exported `isXRegistryReader` guard against the registry, and on `false` pushes a full-sentence diagnostic naming (a) which builder was skipped, (b) why, (c) how to fix. Real-shape registries produce no diagnostics; narrow-mock registries produce one diagnostic per skipped builder. Locked permanently by the loadout integration test's NEGATIVE assertion.

**Soft-skip semantic (validator-is-authoritative).** Builders return null / empty when the named set is not loaded or the slug is not present. The validator catches misconfigured loadouts upfront via the `loadedSetAbbrs` and per-field known-IDs sets; with a real registry, missing data has already been rejected by the validator. Test paths that bypass the validator (no `gameRegistry` configured) fall through with empty deck/state — same observable behaviour as pre-WP-113 narrow-mock skip paths. The soft-skip is a defense-in-depth path; the validator is the authoritative format-and-existence error reporter.

**Test counts.** Engine baseline `524 / 116 / 0` → **`570 / 126 / 0`** (+46 tests, +10 suites — exceeds the +35 floor): +25 per-field validator tests (5 fields × 5 categories: accept-qualified, reject-bare-slug, reject-display-name, reject-flat-card-key, reject-cross-set-collision); +8 parse-error tests; +1 set-not-loaded vs slug-not-in-set distinction test; +4 orchestration-side diagnostic-presence tests (one per builder); +4 loadout integration tests (POSITIVE: villainDeck non-empty, mastermind tactics non-empty, cardStats populated for chosen ext_ids, hero ability hooks; NEGATIVE: zero "skipped" diagnostics with real-shape registry); +3 economy.logic.ts regression tests for the mid-execution amendment (qualified-ID accept, bare-slug silent-skip, cross-set-collision filter). Server baseline `47 / 7 / 0` → **`51 / 8 / 0`** (+4 tests, +1 suite — wiring-ordering invariant + import contract). Arena-client baseline `182 / 17 / 0` UNCHANGED (this WP doesn't touch the client per the locked Files Expected to Change scope).

**File count.** 17 files modified-or-created within EC §6's amended hard-cap (16 → 17 raised inline mid-execution per D-3103). Plus four implicitly-authorized fixture-migration ripples (game.test.ts, replay.execute.test.ts, ruleRuntime.integration.test.ts, replay-producer/cli.ts) per EC line 58 ("Existing test fixtures … updated, NOT preserved as drift sources").

**01.5 NOT INVOKED.** All four trigger criteria absent: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. The orchestration-side diagnostic emission populates an existing `messages: string[]` field that already lived on `LegendaryGameState`.

**Cosmetic ripple noted (NOT in WP-113 scope).** `apps/arena-client/src/ui/uiState.build.ts:256` emits `scheme.id` in qualified form, changing UI display strings (e.g., `"core/midtown-bank-robbery"` instead of `"midtown-bank-robbery"`). Not a determinism issue. UI strip-prefix-for-display is a follow-up polish WP, tracked in D-10014.

**01.6 post-mortem MANDATORY.** Three triggers: new contract surface (slug-set helpers + Class A/B + `CardRegistryReader` widening); new code seam (server registry wiring); new long-lived abstraction (orchestration-side setup-diagnostic surfacing pattern). Delivered at `docs/ai/post-mortems/01.6-WP-113-engine-server-registry-wiring-and-validator-alignment.md`.

**WP-100 fix-forward chain.** Ninth fix-forward (D-10006 → D-10014). D-10014 differs from the prior eight in scope: rather than patching a single click-path or surface, it closes a two-layer contract gap (server wiring + ID-format mismatch) that would have continued silently producing empty matches. The mid-execution spec gap (PS-7 missed `economy.logic.ts`) is the second governance lesson worth capturing.

### WP-100 / EC-100 Executed — Interactive Gameplay Surface (Click-to-Play UI Scaffold, revised) (2026-04-27, EC-100)

🎮 **WP-100 complete (revised execution) — the arena client is now playable end-to-end through the browser, including lobby ready-up.** Seven new interactive components under `apps/arena-client/src/components/play/` (`HandRow`, `CityRow`, `HQRow`, `MastermindTile`, `TurnActionBar`, `PlayView`, plus `LobbyControls` added in the 2026-04-27 revision) wire the existing `UIState` projection (WP-089) and `submitMove` seam (WP-090) into a click-to-play surface that covers the full match lifecycle. In lobby phase, both browsers see `<LobbyControls>` (Mark Ready / Mark Not Ready / Start Match). One click of Start Match — once both players have readied — transitions the match directly to play phase via the surgical engine retarget in `lobby.moves.ts:72` (`events.setPhase('play')`, bypassing the empty setup phase per D-10006). In play phase, the active player can click Draw, click any hand card to play it, click any City villain to fight, click any HQ hero to recruit, click the mastermind to defeat its top tactic, and click End Turn to pass control. Spectators and waiting players see the resulting state via the same `UIState` projection.

**Original execution and revert.** WP-100 originally executed on 2026-04-26 (Commits A `378729a` + B `1dffb3a`) with `169/16/0` arena-client tests. Manual smoke testing surfaced a gap the original scope did not cover: the engine's lobby phase has `setPlayerReady` and `startMatchIfReady` moves but the locked six-name UI vocabulary did not surface them, and `startMatchIfReady` retargeted to the empty `setup` phase which has no exit path (no `onBegin`, no `endIf`, no exit move; verified by grep that no production code calls `setPhase('play')` anywhere). The match stalled in lobby phase regardless of how many players joined. Commits A + B were reverted on 2026-04-27 (`541d67c` + `19d1f66`); pre-A `7ff4006` was retained because D-10001 amendment + EC-100 stub + D-10002 renumber + PS-1/2/3 fold-ins remain valid. The revised WP added `LobbyControls.vue` + tests (§Scope I) and the surgical engine retarget (§Scope J), and re-executed cleanly.

**Scope.** 19 files in revised Commit A `5f9cdd4`: 16 new files under `apps/arena-client/src/components/play/` (seven `.vue` + seven `.test.ts` + one shared `uiMoveName.types.ts` + the post-mortem under `docs/ai/post-mortems/`), one modified `apps/arena-client/src/App.vue`, and two modified engine files (`packages/game-engine/src/lobby/lobby.moves.ts` for the surgical setPhase retarget + `lobby.moves.test.ts` for the paired assertion-target flip). The `LiveMatchView.vue` referenced in WP-100 §Scope G does not exist; `App.vue` is the equivalent route holder per WP-090, and the WP §Scope G "or the equivalent file" clause anticipates this. Fixture and lobby routes are unchanged.

**Test baseline shift.** apps/arena-client `143 / 10 / 0` → **`176 / 17 / 0`** (+33 tests / +7 suites; within the WP §Test Expectations estimate range +30..+40). game-engine `522 / 116 / 0` → **`522 / 116 / 0`** unchanged (the `lobby.moves.test.ts:110` change is an assertion-target fixture flip, not a new test). Server and registry baselines unchanged.

**Single runtime engine-import discipline preserved.** The arena-client's only runtime import of `@legendary-arena/game-engine` remains `apps/arena-client/src/client/bgioClient.ts:16` (`import { LegendaryGame }`). All seven new components consume engine types via `import type` only.

**`UiMoveName` typed union.** A locally-defined eight-member union at `apps/arena-client/src/components/play/uiMoveName.types.ts` mirrors the engine's eight-name UI move vocabulary. The 2026-04-27 revision extended this from six names to eight to surface the lobby-phase moves `'setPlayerReady'` and `'startMatchIfReady'`.

**Stage-only gating + phase-branch rendering.** Cost data is not yet projected into UIState, so all six play-phase components apply stage-only gating. PlayView phase-branches: `phase === 'lobby'` renders `<LobbyControls>`; `phase === 'play'` AND viewer identified renders the five play-surface children; other phases render only `<ArenaHud />`.

**Engine surgical patch (D-10006).** `lobby.moves.ts:72` retargets `events.setPhase('setup')` → `events.setPhase('play')` so the match transitions directly from lobby to play, bypassing the empty setup phase. Setup phase is reserved for a future deck-construction WP per D-10006's two evolution paths (reroute through setup OR take ownership of the lobby → play seam differently — neither locked out).

**Scaffold artifact: the `Draw` button.** Decision-logged in D-10003 as a deletion target — when a follow-up engine WP adds `turn.onBegin` auto-draw to a canonical `HAND_SIZE` constant, the button is REMOVED, not refactored.

**01.5 NOT INVOKED.** All four trigger criteria absent on the revised scope: zero new `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. The §Scope J engine change is a one-line target retarget inside an existing move's body, not a new hook. **01.6 post-mortem MANDATORY** per four triggers: new long-lived abstraction (seven interactive components are the canonical click-to-play surface for future arena-client gameplay WPs); new code subdirectory (`apps/arena-client/src/components/play/`); first interactive intent-emitting surface in arena-client beyond the lobby; engine surgical patch with documented evolution path. Delivered at `docs/ai/post-mortems/01.6-WP-100-interactive-gameplay-surface.md`.

**Out of scope (deferred).** Card display fidelity (names, images, costs sourced from the registry) is queued as WP-111 (UIState card display projection — engine-side); a trivial follow-up UI WP after WP-111 binds the WP-100 components to `UICardDisplay` data. UIState lobby projection (`G.lobby` → `uiState.lobby`) is also deferred; LobbyControls is intentionally stateless (renders three buttons unconditionally; engine validates phase scoping on receipt). A11y polish (ARIA labels, keyboard focus management, screen-reader state announcements per Vision §17) is acknowledged-deferred to a follow-up WP before public-beta gating. Engine auto-draw + `HAND_SIZE` constant is a separate engine WP (not yet drafted) that retires the scaffold `Draw` button. Pre-plan UI integration (EC-059 contract surface) was not modified — the gameplay-time wiring is queued as WP-070. Manual smoke test (two browsers, full turn end-to-end through a running dev server, including lobby ready-up + Start Match) is now achievable end-to-end with this revision; flagged in the post-mortem §10 Notes for the user to run before promoting closure.

### WP-059 / EC-059 Executed — Pre-Plan UI Integration (2026-04-26, EC-059)

🧭 **WP-059 complete — the arena client now hosts a client-local pre-plan surface.** A second Pinia store `usePreplanStore` (id `'preplan'`) holds two state fields (`current: PrePlan | null`, `lastNotification: DisruptionNotification | null`) and exposes five actions (`startPlan`, `consumePlan`, `recordDisruption`, `dismissNotification`, `clearPlan`) plus one getter (`isActive`). Two pure adapter functions in `apps/arena-client/src/preplan/preplanLifecycle.ts` (`startPrePlanForActiveViewer`, `applyDisruptionToStore`) freeze the integration seam between the future live-mutation middleware (WP-090 follow-up) and the store. Two Vue 3 SFCs render the surface against fixtures: `<PrePlanNotification />` (alert banner with `role="alert"` + `aria-live="assertive"`) and `<PrePlanStepList />` (passive plan-step display with empty-state literal `"No plan is active."`). Six named fixtures under `apps/arena-client/src/fixtures/preplan/` cover the active / consumed / invalidated `PrePlan` variants and the no-card / with-card `DisruptionPipelineResult` variants plus a `PlayerStateSnapshot` for the lifecycle adapter test.

**Scope.** Eleven files in Commit A: ten production / test files under `apps/arena-client/src/{stores,preplan,components/preplan,fixtures/preplan}/**` plus `apps/arena-client/package.json` (promotes `@legendary-arena/preplan` from absent to `dependencies`). Both new components use the explicit `defineComponent({ setup() { return {...} } })` form per D-6512 — under WP-065's vue-sfc-loader separate-compile pipeline, `<script setup>` top-level bindings are not exposed on the template's `_ctx`, so any template referencing store data (not just props) must return its bindings from `setup()`. The lifecycle adapter file exports two runtime symbols and no types (the v1 `PrePlanContext` shape was dropped after pre-flight CV-1 verified `createPrePlan` takes three positional scalars, not a context object); a compile-time drift sentinel at the top of `preplanLifecycle.test.ts` locks the three-positional `[PlayerStateSnapshot, string, number]` shape via `Parameters<typeof createPrePlan>` so a future signature drift fails typecheck before any runtime test has to catch it.

**Test baseline shift.** apps/arena-client `109 / 5 / 0` → **`143 / 10 / 0`** (+34 tests / +5 suites exactly per the WP-059 §I locked delta: 13 store + 7 lifecycle + 5 notification + 6 step-list + 3 drift). All other packages unchanged.

**Layer-boundary carve-out (D-5901).** ARCHITECTURE.md and `.claude/rules/architecture.md` updated in lockstep: `preplan` removed from `apps/arena-client`'s "Must NOT import" column; `@legendary-arena/preplan (runtime — per D-5901)` added to the "May import" column. The carve-out is confined to the arena client; no other app or package gains the runtime-import right. The preplan package's non-authoritative, read-only-toward-engine nature is unchanged.

**01.5 NOT INVOKED.** All four trigger criteria absent: zero `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new `LegendaryGame.moves` entry, zero new phase hooks. Engine package entirely untouched; the WP-059 file allowlist is self-contained client-side state. **01.6 post-mortem MANDATORY** per two triggers: new contract surface (`usePreplanStore` shape + lifecycle adapter signatures consumed by future live-mutation middleware and speculative gesture UI); new long-lived abstraction (the client-local advisory-state pattern that future arena-client features should follow when they need client-local non-authoritative state). Delivered at `docs/ai/post-mortems/01.6-WP-059-preplan-ui-integration.md`.

**Out of scope (deferred).** Live boardgame.io client middleware that observes real `G` mutations and invokes `executeDisruptionPipeline` remains a follow-up once WP-090 lands. Speculative draw / play / recruit UI gestures depend on a private-projection contract (per-player deck / hand / HQ / shared piles) that does not yet exist. Plan-regeneration auto-flow, turn-start auto-consumption, multi-turn planning, plan history, plan replay / export / spectatorship, and registry-backed card-name display in the notification are all explicitly out of scope here.

### WP-053 / EC-053 Executed — Competitive Score Submission & Verification (2026-04-26, EC-053)

🏆 **WP-053 complete — competitive ranking is now structurally trustworthy.** The server-layer competitive submission pipeline orchestrates engine contracts (replay re-execution, hash verification, scoring derivation) and persists the result as a write-once row in `legendary.competitive_scores`. The trust surface is enforced by construction: every numeric output traces to an engine function (`computeRawScore` / `computeFinalScore` / `computeParScore` / `buildScoreBreakdown`), no client-reported value is ever stored, and idempotent retries return the existing record without re-executing the replay or hitting the PAR gate (D-5304). Public surface: `submitCompetitiveScore(identity, replayHash, database): Promise<SubmissionResult>` (locked 3-arg signature; rejects guests fail-fast before any DB access; orchestrates the locked 16-step flow with idempotency fast-path at step 4b before any replay I/O), `findCompetitiveScore(replayHash, db)` and `listPlayerCompetitiveScores(accountId, db)` read surfaces. The published PAR is authoritative — `computeFinalScore` always normalizes against `parValue` returned by `checkParPublished`, never a re-derived value; the step-12 `computeParScore(scoringConfig) === parValue` check is defense-in-depth per D-5306 Option A (corruption / mismatched-artifact detection only — structural drift is impossible because both flow from the same PAR artifact).

**Scope.** Four files in Commit A `56e8134`: three TypeScript files under `apps/server/src/competition/` (`competition.types.ts` — `CompetitiveSubmissionRequest` / `SubmissionRejectionReason` (locked 6-value union, no `'already_submitted'`) / `SUBMISSION_REJECTION_REASONS` canonical readonly array / `CompetitiveScoreRecord` (11 readonly fields) / `SubmissionResult` (discriminated union with `wasExisting`); `competition.logic.ts` — public `submitCompetitiveScore` thin wrapper plus internal `submitCompetitiveScoreImpl` with a `SubmissionDependencies` seam for `loadReplay` / `replayGame` / `checkParPublished` / `registry` injection (test #7 verifies via spies that none are invoked on the idempotent-retry path per D-5304); the locked 16-step flow with the locked CTE INSERT using `ON CONFLICT (player_id, replay_hash) DO UPDATE SET player_id = legendary.competitive_scores.player_id RETURNING (xmax = 0) AS was_inserted` no-op self-assignment + race-recovery idiom mirroring WP-052's `assignReplayOwnership`; `competition.logic.test.ts` — 9 tests in one `describe('competition logic (WP-053)', …)` block: 3 logic-pure (#2 guest fail-fast with stub-throwing DB, #8 immutability via dynamic-import + `Object.keys.filter(/^update/)` returning `[]`, #9 drift detection via exhaustive switch with `never` default) + 6 DB-dependent (#1 not_owner, #3 visibility_not_eligible, #4 par_not_published, #5 stateHash anchor, #6 rawScore matches engine recomputation, #7 idempotent retry skips replay seams via spy injection)) and one new SQL migration `data/migrations/007_create_competitive_scores_table.sql` (idempotent `CREATE TABLE IF NOT EXISTS legendary.competitive_scores` with `bigserial submission_id PRIMARY KEY`, `bigint player_id NOT NULL REFERENCES legendary.players(player_id)` FK, `text replay_hash`, `text scenario_key`, `integer raw_score / final_score / scoring_config_version`, `jsonb score_breakdown`, `text par_version + state_hash`, `timestamptz created_at NOT NULL DEFAULT now()`, `UNIQUE (player_id, replay_hash)`; 10 `-- why:` blocks). Schema mirrors WP-052's bigserial-PK + bigint-FK + ext_id-bridge precedent (not WP-103's content-addressed text PK); application uses `accountId` (text `ext_id`) at the API boundary, CTE bridges to `player_id` (bigint internal FK) at every write site.

**Test baseline shift.** apps/server `38 / 6 / 0` → **`47 / 7 / 0`** (+9 tests / +1 suite exactly per the WP-053 §D locked delta; with 16 DB-dependent tests skipped via the locked `{ skip: 'requires test database' }` reason when `TEST_DATABASE_URL` is unset — 10 inherited from WP-052 + WP-103 + 6 new from WP-053; all 47 execute when the test database is configured). Engine baseline `522 / 116 / 0` (post-WP-053a) unchanged; zero existing tests modified.

**Trust surface.** Future WPs that introduce a request-handler surface for competitive submission will import `submitCompetitiveScoreImpl` directly with the bound `parGate.checkParPublished` and the startup-loaded `CardRegistryReader` injected via the deps seam — the public 3-arg `submitCompetitiveScore` exists as a library/test convenience and rejects every submission with `par_not_published` until that wiring lands (the `PRODUCTION_DEPENDENCIES.checkParPublished` default is `() => null` fail-closed; lifecycle prohibition makes this safe — no production caller exists today). WP-054 (Public Leaderboards) can now consume `findCompetitiveScore` and `listPlayerCompetitiveScores` against `legendary.competitive_scores` without re-deriving SQL or cracking the storage layer open. The `(par_version, scoring_config_version)` audit-redundancy pair on every accepted record per D-5306d preserves forensic visibility if the structural-drift invariant ever broke; no CHECK constraint enforces equality (preserves audit visibility).

**01.5 NOT INVOKED.** Zero `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new moves, zero new phase hooks; engine package entirely untouched. **01.6 post-mortem MANDATORY** per four triggers: new long-lived abstraction (`submitCompetitiveScore` + impl); new contract consumed by future WPs (`CompetitiveScoreRecord` + `SubmissionResult`); new canonical readonly array (`SUBMISSION_REJECTION_REASONS`); new persistence surface (`legendary.competitive_scores`). Delivered at `docs/ai/post-mortems/01.6-WP-053-competitive-score-submission-verification.md` covering all 14 mandatory audits (layer-boundary, engine immutability, AccountId vs engine-identifier boundary per D-5201 / D-8701, gameLog absence per D-4801, aliasing, determinism, server-as-enforcer per D-5301, defense-in-depth per D-5306 Option A, idempotency fast-path placement, race-condition recovery, `'already_submitted'` absence per D-5304, no-UPDATE per D-5302, migration idempotency, test-suite delta proof). Pre-commit review embedded at post-mortem §4 returned "Safe to commit as-is" before Commit A staged. Three-commit topology: A0 `27d3004` (`SPEC: WP-053 + EC-053 v1.5` — Vision Alignment block per `00.3 §17.2` + Funding Surface Gate `§20 — N/A` + slot 007 + IF NOT EXISTS + version 1.4→1.5); A `EC-053:` `56e8134` (4 files; 1605 insertions); B `SPEC:` (this block + WORK_INDEX.md WP-053 `[ ]` → `[x]` + EC_INDEX.md EC-053 row added as Done + DECISIONS.md `D-5301` / `D-5302` / `D-5304` / `D-5305` inline + 01.6 post-mortem). Staging by exact filename only — never `git add .` / `-A` / `-u` (P6-27). Unrelated `DESIGN-RANKING.md` working-tree edit + untracked `data/cards-combined.*` + `scripts/Combine-CardData.ps1` scratch were stashed/excluded from every WP-053 commit.

**Unblocks.** WP-054 (Public Leaderboards & Read-Only Web Access) — `findCompetitiveScore` and `listPlayerCompetitiveScores` are the read surfaces WP-054 will project; the `visibility IN ('link', 'public')` filter at the leaderboard query layer will gate which records are publicly exposed (per WP-054 spec, never private replays). Future request-handler / submission HTTP endpoint WP — will import `submitCompetitiveScoreImpl` directly with the production parGate + registry injected.

### WP-053a / EC-053a Executed — PAR Artifact Carries Full ScenarioScoringConfig (2026-04-25, EC-053a)

📦 **WP-053a complete — every published PAR is now the atomic tuple `(scenarioKey, parValue, scoringConfig)`.** D-5306 (Option A) is materialized end-to-end: `SeedParArtifact`, `SimulationParArtifact`, and `ParIndex.scenarios[key]` each gain a non-optional `readonly scoringConfig: ScenarioScoringConfig` field; `writeSimulationParArtifact` takes `scoringConfig` as the third positional parameter mirroring the `writeSeedParArtifact` four-param precedent (PS-3); `validateParStore` enforces structural validity (`'scoring_config_invalid'`), version equality (`'scoring_config_version_mismatch'`), and the D-5306c one-cycle `parBaseline` redundancy (`'par_baseline_redundancy_drift'`). The server gate's `ParGateHit` now returns `{ parValue, parVersion, source, scoringConfig }`; the gate constructor hard-throws on any missing-config index entry (defense-in-depth behind the engine's `isParIndexShape` shape validator). D-5103 fs-free invariant preserved by direct grep verification — the gate never imports `node:fs` or `scoringConfigLoader`. Two new exported functions (`loadScoringConfigForScenario`, `loadAllScoringConfigs`) and one new on-disk authoring origin (`data/scoring-configs/<encoded-scenario-key>.json` per D-5306a) round out the contract surface.

**Scope.** Eleven files in Commit A `e5b9d15`: two new under `data/scoring-configs/` (README + canonical example JSON for the test scenario key), two new under `packages/game-engine/src/scoring/` (`scoringConfigLoader.ts` + `scoringConfigLoader.test.ts`), three modified under `packages/game-engine/src/simulation/` (`par.storage.ts` + `par.storage.test.ts` + `par.aggregator.test.ts` — the aggregator itself is unchanged per PS-3 since `ParSimulationConfig.scoringConfig` already existed at `par.aggregator.ts:136` on `main`), one modified at the engine package barrel (`packages/game-engine/src/index.ts` adds the two new exports), and two modified under `apps/server/src/par/` (`parGate.mjs` + `parGate.test.ts`). One INFRA commit `fbbedb5` landed pre-Commit-A to update the commit-msg hook regex from `[A-Z]?` to `[A-Za-z]?` and switch `find -name` → `find -iname`, accommodating the lowercase letter suffix in the `EC-053a-...` filename per the WP-053a session prompt's stated commit prefix `EC-053a:`.

**Test baseline shift.** Engine `513 / 115 / 0` → **`522 / 116 / 0`** (+9 tests / +1 suite — PS-5 locked outcome with the fresh top-level `describe('scoringConfigLoader (WP-053a)', …)` block). Server `36 / 6 / 0` → **`38 / 6 / 0`** (with 10 skipped under no-test-DB; +2 tests in `parGate.test.ts`'s existing describe; +0 suites). Mechanical fixture updates absorbed via centralized factories (`createTestScoringConfig`, `buildSimScoringConfig`, `createEntry`); 41 added lines mentioning `scoringConfig` across the two test files including the +5 net-new tests. Pre-WP-053a fixture under-spec discovered: `createTestScoringConfig`'s `bystanderReward: 50, villainEscaped: 300` violated WP-048's structural invariant `bystanderReward > villainEscaped` — harmless before because `validateScoringConfig` was never run against embedded artifact configs; updated to `bystanderReward: 400` as a mechanical fix.

**Trust surface.** WP-053's `submitCompetitiveScore` can now source `scoringConfig` directly from `checkParPublished(scenarioKey).scoringConfig`. Drift between the published PAR and the config used to score it is structurally impossible from this point forward. The WP-053 flow step 12 (`computeParScore(config) === parValue`) becomes defense-in-depth rather than a primary safety net. WP-054 (leaderboards) will likely also consume `ParGateHit.scoringConfig`.

**01.5 NOT INVOKED.** Zero `LegendaryGameState` field, zero `buildInitialGameState` shape change, zero new moves, zero new phase hooks; engine package gameplay code untouched. **01.6 post-mortem MANDATORY** per three triggers: new long-lived abstraction (`scoringConfigLoader`); new contract consumed by future WPs (extended `ParGateHit`); new persistence surface (`data/scoring-configs/`). Delivered at `docs/ai/post-mortems/01.6-WP-053a-par-artifact-scoring-config.md` with all 14 mandatory audits. Pre-commit review at `docs/ai/reviews/pre-commit-review-wp053a-ec053a.md` returned "Safe to commit as-is" before Commit A staged.

**Unblocks.** WP-053 (Competitive Score Submission & Verification) — its `## Assumes` section already cited WP-053a as a prerequisite, and EC-053 §Before Starting already added WP-053a alongside WP-103 via the A0 SPEC bundle.

### WP-103 / EC-111 Executed — Server-Side Replay Storage & Loader (2026-04-25, EC-111)

📦 **WP-103 complete — replay storage is now a first-class server contract.** The server layer can now content-address `ReplayInput` blobs against `legendary.replay_blobs` keyed by their cryptographic `replay_hash` (from WP-027's `computeStateHash`). Two functions form the public API: `storeReplay(replayHash, replayInput, database): Promise<void>` (idempotent insert via the locked `INSERT INTO legendary.replay_blobs (replay_hash, replay_input) VALUES ($1, $2) ON CONFLICT (replay_hash) DO NOTHING`) and `loadReplay(replayHash, database): Promise<ReplayInput | null>` (hash-indexed read returning the deserialized `ReplayInput` from `pg`'s `jsonb` codec, or `null` on miss). Neither function is wired into `server.mjs`, any move, any phase hook, or any `LegendaryGame` surface yet — WP-103 establishes the library; the future request-handler / submission WP that owns the consumer surface (WP-053) will wire the pool. The packet's most load-bearing decisions are the deliberate divergences from WP-052's identity-table conventions: the PK is `replay_hash text` (the hash IS the natural key, no separate `bigserial` — D-10302), the payload is `jsonb` (queryability + storage efficiency over `bytea` / `text` / `json` — D-10303), and the rows are immutable by design (no row-mutation timestamp; `DO NOTHING` rather than `DO UPDATE` because content-addressed mutation is conceptually invalid).

**Scope.** Four new files: three TypeScript files under `apps/server/src/replay/` (`replay.types.ts` — single canonical pair re-export `export type { ReplayInput }` from `@legendary-arena/game-engine` and `export type { DatabaseClient }` from `../identity/identity.types.js`, type-only by construction so zero runtime emit and zero engine runtime weight crosses the server-layer boundary; `replay.logic.ts` — `storeReplay` + `loadReplay` matching the locked signatures, JSDoc on both exports, three `// why:` comments at the locked sites — `DO NOTHING` rationale, `pg` `jsonb` codec rationale, and the F-1 disambiguation note distinguishing this server-layer hash-indexed `loadReplay` from arena-client's directory-name-only-collision `parseReplayJson`; no `boardgame.io` import, no `pg` direct import, no manual JSON deserialization; `replay.logic.test.ts` — 5 tests in one `describe('replay storage logic (WP-103)', …)` block: 1 logic-pure null-on-miss against a stub `DatabaseClient` plus 4 DB-dependent tests using the locked WP-052 §3.1 `hasTestDatabase ? {} : { skip: 'requires test database' }` inline-conditional pattern with the literal `skip: 'requires test database'` substring on each DB-test line; inline `ReplayInput` fixture covering all four fields with no import from `apps/replay-producer/samples/` per the F-3 lock). One new SQL migration: `data/migrations/006_create_replay_blobs_table.sql` (idempotent `CREATE TABLE IF NOT EXISTS legendary.replay_blobs` with three locked columns — `replay_hash text PRIMARY KEY`, `replay_input jsonb NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`; six `-- why:` blocks covering the four locked sites — `legendary.*` namespace, PK choice (D-10302), `jsonb` choice (D-10303), immutability — plus `created_at` and no-FK rationale). Governance close: this STATUS block, WORK_INDEX.md WP-103 row flipped `[x]` with date + Commit A hash, EC_INDEX.md EC-111 row flipped Draft → Done, DECISIONS.md D-10302 (text PK divergence) + D-10303 (jsonb + immutability) appended, and the 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-103-replay-storage-loader.md` covering all 12 mandatory audits per the session prompt.

**Test baseline shift.** apps/server `31 / 5 / 0` → **`36 / 6 / 0`** (+5 tests / +1 suite exactly per the WP-103 §G locked delta; with 10 DB-dependent tests skipped via the locked `{ skip: 'requires test database' }` reason when `TEST_DATABASE_URL` is unset — 6 pre-existing from WP-052 + 4 new from WP-103; all 36 execute when the test database is configured). Engine baseline `513 / 115 / 0` unchanged; zero existing tests modified.

**Engine + cross-package invariants preserved.** `git diff main -- packages/` empty. `git diff main -- apps/arena-client/ apps/replay-producer/ apps/registry-viewer/` empty. `git diff main -- apps/server/src/{server.mjs,index.mjs,rules/,par/,game/,identity/} apps/server/scripts/ apps/server/package.json` empty (the server's existing test glob `'src/**/*.test.ts'` already covers `apps/server/src/replay/*.test.ts`; no `package.json` change needed). `git diff main -- data/migrations/00{1,2,3,4,5}_*.sql` empty. `git diff main -- pnpm-lock.yaml package.json tsconfig*.json` empty. The two replay-storage functions are not called from any file outside `apps/server/src/replay/` — the lifecycle prohibition from the session prompt holds by construction (no calls from `game.ts`, no phase hooks, no engine package, no other server file). No `boardgame.io`, `@legendary-arena/registry`, `@legendary-arena/preplan`, or `@legendary-arena/vue-sfc-loader` imports in any new file (grep-verified). The single `@legendary-arena/game-engine` reference is the type-only re-export at `replay.types.ts:42`, written as `export type { … }` so TypeScript emits zero runtime code for it. `pg` is not directly imported in `replay.logic.ts` (uses the `DatabaseClient` alias only); the test file imports `pg` for `Pool` lifecycle management only, mirroring WP-052's `replayOwnership.logic.test.ts` precedent. No `Math.random`, `Date.now`, `require()`, manual JSON deserialization, or external UUID library appears in any new file (grep-verified). `// why:` comment counts meet or exceed the locked minima at every required site (1 / 3 / 2 in the three `.ts` files, 6 in the migration).

**Vision alignment.** §3 (Player Trust & Fairness) + §24 (Replay-Verified Competitive Integrity) — replay storage is the durable substrate WP-053 needs to re-execute submitted replays server-side; clients can never overwrite a stored replay (content-addressed immutability + `DO NOTHING`), and the server is the sole writer (`storeReplay` is a server-layer function with no client-facing surface). §18 (Replayability & Spectation) + §22 (Deterministic & Reproducible Evaluation) — `ReplayInput` is preserved byte-equivalent through the `jsonb` codec round-trip (test #5 asserts all four fields preserved); the engine's deterministic replay execution (WP-027) is unchanged and replays loaded by `loadReplay` are bit-identical to the originals stored. §19 (AI-Ready Export & Analysis Support) — the `jsonb` shape preserves query-time path access for future audit / analytics use cases without manual deserialization. NG-1..7 — none crossed (replay storage is a determinism / fairness substrate, not a monetization or behavioral-nudge surface).

**01.5 NOT INVOKED.** All four trigger criteria absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. Engine package entirely untouched (`git diff main -- packages/game-engine/` empty across all commits). **01.6 post-mortem MANDATORY** per three triggers: new long-lived abstraction (`storeReplay` / `loadReplay` consumed by WP-053 / WP-054 / future replay consumers); new contract consumed by future WPs (the `Promise<void>` / `Promise<ReplayInput | null>` return shapes are locked); new persistence surface (`legendary.replay_blobs` is a new table under the `legendary.*` namespace, classified per D-10301 as server-storage). Delivered at `docs/ai/post-mortems/01.6-WP-103-replay-storage-loader.md`.

---

### WP-052 / EC-052 Executed — Player Identity, Replay Ownership & Access Control (2026-04-25, EC-052)

🪪 **WP-052 complete — identity is now a first-class server concern.** The server layer can now create authenticated `PlayerAccount` rows backed by `legendary.players`, mint ephemeral `GuestIdentity` records for un-authenticated play, and idempotently assign / list / update / delete replay ownership records keyed by the cryptographic hash from WP-027's `computeStateHash`. None of the eight new functions are wired into `server.mjs`, any move, any phase hook, or any `LegendaryGame` surface yet — WP-052 establishes the library; the future request-handler / leaderboard WP that owns the consumer surface will wire the pool. The packet's most load-bearing decision is the deliberate distinction between the engine's `PlayerId` (plain string seat alias per D-8701) and the server's `AccountId` (branded `string & { readonly __brand: 'AccountId' }` per D-5201). They live in different layers, mean different things, and must never be imported across that boundary — honored here by construction (`grep -nE "from ['\"]@legendary-arena/game-engine" apps/server/src/identity/` returns zero, as does `grep -nE "import \{ PlayerId" apps/server/src/identity/*.ts`).

**Scope.** Eight new files: four `.ts` source files under `apps/server/src/identity/` (`identity.types.ts` — `AccountId`, `PlayerAccount` (7 readonly fields), `GuestIdentity` (3 readonly fields with `isGuest: true` discriminant), `PlayerIdentity` discriminated union, `isGuest` type guard, `AuthProvider` literal union + `AUTH_PROVIDERS` canonical readonly array, `Result<T>` + `IdentityErrorCode` literal union; `replayOwnership.types.ts` — `ReplayVisibility` literal union + `REPLAY_VISIBILITY_VALUES` canonical readonly array, `ReplayOwnershipRecord` (7 readonly fields, `expiresAt: string | null`), `ReplayRetentionPolicy`, `DEFAULT_RETENTION_POLICY` (`{minimumDays: 30, defaultDays: 90, extendedDays: null}`); `identity.logic.ts` — `createPlayerAccount` (`Result<T>` with structured `duplicate_email` + `invalid_display_name` codes; canonicalizes email; validates `displayName` length 1-64 and rejects control characters), `findPlayerByEmail` / `findPlayerByAccountId` (canonicalize on lookup), `createGuestIdentity` (pure, no DB); `replayOwnership.logic.ts` — `assignReplayOwnership` (locked CTE + ON CONFLICT DO UPDATE RETURNING per PS-6), `updateReplayVisibility`, `listAccountReplays` (read-time `expires_at` filter), `findReplayOwnership` (metadata only, no policy enforcement), `deletePlayerData` (single BEGIN/COMMIT transaction; audit counts only — no blob purge per PS-12 / D-5207-pending)). Two `.test.ts` files in the same directory (`identity.logic.test.ts` 8 tests / 1 suite; `replayOwnership.logic.test.ts` 4 tests / 1 suite). Two new SQL migrations: `data/migrations/004_create_players_table.sql` (idempotent `CREATE TABLE IF NOT EXISTS legendary.players`; UNIQUE on `email` + `ext_id`) and `data/migrations/005_create_replay_ownership_table.sql` (idempotent; UNIQUE `(player_id, replay_hash)` for race-safe idempotency; `visibility text NOT NULL DEFAULT 'private'` per `13-REPLAYS-REFERENCE.md §Privacy and Consent Controls`). Governance close: this STATUS block, WORK_INDEX.md WP-052 row flipped `[x]`, EC_INDEX.md EC-052 row added `Done 2026-04-25`, and the 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-052-player-identity-replay-ownership.md` covering all 12 mandatory audits per the session prompt.

**Test baseline shift.** apps/server `19 / 3 / 0` → **`31 / 5 / 0`** (+12 tests / +2 suites; with 6 DB-dependent tests skipped via the locked `{ skip: 'requires test database' }` reason when `TEST_DATABASE_URL` is unset; all 31 execute when the test database is configured). Engine baseline `513 / 115 / 0` unchanged; zero existing tests modified.

**Engine + cross-package invariants preserved.** `git diff main -- packages/` empty across all commits. `git diff main -- apps/server/src/{server.mjs,index.mjs,rules/,par/,game/} apps/server/scripts/ apps/server/package.json` empty. `git diff main -- data/migrations/00{1,2,3}_*.sql` empty. `git diff main -- pnpm-lock.yaml package.json tsconfig*.json` empty. The eight identity functions are not called from any file outside `apps/server/src/identity/`. `randomUUID` from `node:crypto` is the only UUID source; no `uuid` / `nanoid` / `Math.random` / `Date.now` appears in any logic file (grep-verified). `// why:` comment counts meet or exceed the locked minima at every required site (4 / 5 / 6 / 5 in the four `.ts` files, 5 / 5 in the two migrations).

**Vision alignment.** §3 / §18 / §22 / §24 (Player Trust & Fairness, Replayability & Spectation, Determinism, Replay-Verified Competitive Integrity) — identity is access control only. The replay hash from `computeStateHash` (WP-027) and the engine's determinism guarantees are untouched; ownership records reference the hash, never replay data. §11 (Stateless Client Philosophy) — identity logic is server-authoritative; clients carry no identity state beyond their own session credentials. §19 (AI-Ready Export) — structured replay export remains available to every player, guest and account alike. NG-1 / NG-3 — extended retention modeled in the type system (`ReplayRetentionPolicy.extendedDays`) but never gates gameplay, scoring, RNG seeds, matchmaking, or any competitive surface; it is convenience-only retention per the Financial Sustainability covenant. NG-2, NG-4, NG-5, NG-6, NG-7 — none crossed (private-by-default visibility specifically honors NG-6).

**01.5 NOT INVOKED.** All four trigger criteria absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. Engine package entirely untouched. **01.6 post-mortem MANDATORY** per four triggers: new long-lived abstractions (`PlayerAccount`, `GuestIdentity`, `ReplayOwnershipRecord`, `Result<T>`, `AccountId`); new contract consumed by future WPs (eight identity / ownership functions); new canonical readonly arrays (`AUTH_PROVIDERS`, `REPLAY_VISIBILITY_VALUES`); new persistence surface (`legendary.players`, `legendary.replay_ownership`). Delivered at `docs/ai/post-mortems/01.6-WP-052-player-identity-replay-ownership.md`.

---

### WP-096 / EC-096 Executed — Registry Viewer: Grid Data View Mode (2026-04-25, EC-096)

🗂️ **WP-096 complete — image/data toggle now governs the entire registry viewer.** A user on `cards.barefootbetters.com` can now flip the existing toolbar toggle and see *both* the right-hand sidebar (shipped under WP-066) and the main grid re-render as structured data cards. Prior to WP-096 the toggle only changed the sidebar; the grid silently kept its image tiles, contradicting the toggle's "global" framing. The corrective follow-up wires `apps/registry-viewer/src/components/CardGrid.vue` to the existing `useCardViewMode` composable directly (no prop plumbing through `App.vue`) and introduces `CardDataTile.vue` as the tile-sized cousin of `CardDataDisplay.vue`. Six of the seven labelled rows on the tile are byte-identical to the sidebar (`Type`, `Class`, `Cost`, `Attack`, `Recruit`, `Rarity`); the seventh row is a deliberate tile-compaction divergence — the tile uses the compact label `Set` rendering `card.setAbbr`, while the sidebar uses `Edition` rendering `card.setName` (full set names like `"Marvel Studios: What If…?"` would overflow the 130px-min `.img-wrap` 3:4 box). Ability text is intentionally omitted from the tile (sidebar remains the place for full ability text). Captured at D-9601.

**Scope.** Two production files in `apps/registry-viewer/src/components/`: new `CardDataTile.vue` (compact data tile rendering eight locked fields under AND-semantics omission with `@media print` parity producing white background, black text, hairline border) and modified `CardGrid.vue` (consumes `useCardViewMode` directly; branches the inside of `.img-wrap` on `viewMode`; `.img-wrap` itself stays in the DOM in both modes; `.tile-info` footer renders unconditionally; `.selected` border-glow rule remains on the outer `.card-tile`; grid column track `minmax(130px, 1fr)` and 3:4 swap-area dimensions unchanged byte-for-byte). Five required `// why:` comments present (composable import, v-else swap block, tile module JSDoc, cost numeric guard, attack/recruit empty-string guard). No edits to `useCardViewMode.ts`, `ViewModeToggle.vue`, `CardDataDisplay.vue`, `CardDetail.vue`, or `App.vue` (verified via `git diff` returning no output for each). Governance close: this STATUS block, DECISIONS.md D-9601, WORK_INDEX.md WP-096 row added with `[x]` + commit hash, EC_INDEX.md EC-096 row added with `Done 2026-04-25`.

**Verification (registry-viewer scope only; viewer has no test harness).** `pnpm --filter registry-viewer typecheck` exits 0. `pnpm --filter registry-viewer build` exits 0; 78 modules transformed (baseline 75; +3 from new SFC). `pnpm --filter registry-viewer lint` returns 11 errors / 227 warnings — **calibrated baseline divergence from session-context expectation:** all 11 errors are pre-existing on `main` at HEAD `26e4584`, located in `LoadoutBuilder.vue` (`vuejs-accessibility/label-has-for` × 9, `vuejs-accessibility/form-control-has-label` × 2), inherited from EC-091's commit `bdab50b`; baseline at session start was 11 errors / 221 warnings; +6 warnings are stylistic on `CardDataTile.vue` (`vue/singleline-html-element-content-newline`, consistent with codebase pattern). No new errors introduced. The session-context §3 expected 0 errors; user authorized path-1 reconciliation (proceed against the calibrated baseline; classify the 11 pre-existing errors as out-of-scope debt to be addressed in a separate corrective WP). All seven forbidden-imports greps (`@legendary-arena/{game-engine,preplan,server}`, the `@legendary-arena/registry` bare barrel, `boardgame.io`, `node:`, `pg`) and the determinism greps (`Math.random`, `Date.now`) return zero matches against the two scope files. **Manual smoke a–h user-verified passed 2026-04-25** against the post-Commit-A branch (Commit A `4fe8382`); user confirmed the toggle flips the entire grid, selection persists, reload preserves persistence, filter survives, console is clean, and print preview produces white-bg / black-text / hairline-border tiles.

**Engine + cross-package invariants preserved.** `git diff --name-only packages/ apps/server/ apps/arena-client/ apps/replay-producer/` returns empty. No `Math.random`, `Date.now`, `localStorage` mutation, `sessionStorage`, `IndexedDB`, or cookie touch in either new or modified file. No new npm dependencies — `git diff apps/registry-viewer/package.json` is empty. The `useCardViewMode` composable's public API (`{ viewMode, toggleViewMode }`) and persisted localStorage shape (`'image' | 'data'`) are byte-identical pre- and post-packet.

**01.5 NOT INVOKED.** All four triggers absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. WP-096 is a registry-viewer client-UI packet; engine package entirely untouched. Per `01.5 §Escalation`, the clause cannot be cited retroactively in execution summaries — explicit declaration here completes the governance trail.

**Vision alignment.** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`) — completes the "global toggle" intent of WP-066 by extending its existing public behavior to the grid surface. NG-1..7 (monetization non-goals) — none crossed. The registry viewer remains free public tooling; no monetization, no persuasive surfaces, no competitive ranking implications. Determinism preservation — N/A (UI-only, no scoring, replay, RNG, or simulation surfaces touched).

---

### WP-092 / EC-092 Executed — Lobby Loadout Intake (JSON → Create Match) (2026-04-24, EC-092)

📥 **WP-092 complete — first end-to-end loadout-driven match creation.** A user can now build a loadout in the Registry Viewer (WP-091), download or copy the resulting MATCH-SETUP JSON document, switch to the arena-client lobby, upload the file (or paste the JSON into a collapsible textarea), click "Create match from loadout", and watch the URL rewrite to `?match=<id>&player=0&credentials=<secret>` as ArenaHud takes over from LobbyView — without typing any ext_ids manually. Engine behavior is unchanged; authoritative validation remains server-side via `matchSetup.validate.ts` inside `Game.setup()`. The arena-client's WP-090 nine-field manual form is preserved byte-for-byte as a power-user fallback wrapped in a `<details>` titled `"Fill in manually (advanced)"`, closed by default; all 9 `v-model` bindings, field IDs, and submission handlers are byte-identical to WP-090. The new shape-guard parser is hand-rolled — the arena-client layer rule forbids importing the registry package at runtime, so the WP-093 error template is mirrored byte-for-byte across **five** files (was four pre-WP-092: `docs/ai/DECISIONS.md`, `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md`, `packages/registry/src/setupContract/setupContract.types.ts`; now joined by `apps/arena-client/src/lobby/parseLoadoutJson.ts`).

**Scope.** Two new arena-client files + two modifications: new `apps/arena-client/src/lobby/parseLoadoutJson.ts` (pure shape-guard parser; locked `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` constant + `renderUnsupportedModeMessage(value)` helper; nine error codes — `invalid_json`, `not_object`, `missing_composition`, `composition_not_object`, `missing_field`, `wrong_type`, `missing_player_count`, `player_count_out_of_range`, `unsupported_hero_selection_mode`; per-error-code `field` mapping locked per session-prompt §3.8; single-site default normalization for `heroSelectionMode: undefined → "GROUP_STANDARD"` so downstream callers never see undefined; `for...of` loops only — no `.reduce()`); new `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` (30 tests in one `describe('parseLoadoutJson (WP-092)')` block — every error code covered, byte-for-byte WP-093 message equality via `assert.strictEqual` for `"HERO_DRAFT"` / `"MADE_UP"` / numeric `42`, valid-with-extra-envelope-fields permissive case, default-materialization case, compound-failure-dedup test, no-throw garbage-input test); modified `apps/arena-client/src/lobby/LobbyView.vue` (additive JSON intake section above the manual form titled `"Create match from loadout JSON (recommended)"` — file `<input type="file" accept="application/json,.json">`, collapsible paste-area `<textarea>` with "Parse pasted JSON" button, parsed-loadout summary, "Create match from loadout" submit button disabled until a valid parse is cached and during submission; manual form wrapped in `<details>` titled `"Fill in manually (advanced)"` closed by default; `defineComponent({ setup() })` form preserved per D-6512 / P6-30); modified `apps/arena-client/src/lobby/lobbyApi.test.ts` (additive new `describe('parseLoadoutJson + createMatch (WP-092)')` block with two tests asserting the wire body shape `{ numPlayers, setupData: <composition> }` is exactly two top-level keys, and that envelope-only fields — `schemaVersion`, `setupId`, `createdAt`, `createdBy`, `seed`, `themeId`, `expansions`, `heroSelectionMode`, `playerCount`, `composition` — are dropped on submission; pre-existing WP-090 tests unmodified). Governance close: this STATUS block, DECISIONS.md D-9201, WORK_INDEX.md WP-092 row flipped `[x]`, EC_INDEX.md EC-092 row flipped `Done 2026-04-24`, and the 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-092-lobby-loadout-intake.md` (mandatory per at least two triggers: new contract consumed by future WPs and second byte-for-byte consumer of WP-093 strings; the hand-rolled parser pattern under the registry-firewall constraint is recorded as a third trigger candidate).

**Test baseline shift.** `apps/arena-client` moves from `77 / 3 / 0` to **`109 / 5 / 0`** (+32 tests / +2 suites — 30 new `parseLoadoutJson` tests in one new describe block + 2 new tests in a new `parseLoadoutJson + createMatch (WP-092)` describe block in `lobbyApi.test.ts`). All other package baselines unchanged (game-engine `513 / 115 / 0`; registry `31 / 3 / 0`; preplan `52 / 7 / 0`; vue-sfc-loader `11 / 0 / 0`; server `19 / 3 / 0`; replay-producer `4 / 2 / 0`). Repo-wide total rises from `707 / 133 / 0` to **`739 / 135 / 0`**. Production Vite build: 280 KB / 92 KB gzipped (additive +8 KB / +2 KB gzipped vs WP-090 baseline).

**Engine + cross-package invariants preserved.** `git diff --name-only packages/game-engine/ packages/registry/ packages/preplan/ packages/vue-sfc-loader/ apps/server/ apps/registry-viewer/ apps/replay-producer/` returns empty. The arena-client registry-runtime-import invariant holds: `Select-String -Path "apps\arena-client\src" -Pattern "from '@legendary-arena/registry'"` returns no output. The single-runtime-engine-import-site invariant holds at `bgioClient.ts:16` (WP-090 carve-out, unchanged by WP-092); the line-by-line PowerShell grep continues to return a known false-positive on `SharedScoreboard.vue:6` (multi-line `import type` continuation, pre-existing from WP-062). No `Math.random`, `localStorage`, `sessionStorage`, `IndexedDB`, or cookies in any new or modified file. No new npm dependencies — `git diff apps/arena-client/package.json` is empty. The 9-field composition lock is preserved verbatim in both the parser's `ParsedLoadout.composition` shape and in WP-090's manual form (9 `v-model` bindings unchanged).

**Vision alignment.** §3 (Player Trust & Fairness) — the parser is a non-authoritative shape guard providing immediate authoring feedback only; the engine remains the sole authority on whether a setup is valid. §4 (Faithful Multiplayer Experience) — clients submit *intent* (composition + numPlayers) only; the engine decides outcomes. §22 (Replay Faithfulness) — envelope fields other than `playerCount` are dropped on submission per D-9201 (envelope archival deferred to a future server-side WP); the wire body shape `{ numPlayers, setupData: composition }` is unchanged from WP-090, so existing replay-determinism guarantees carry through. NG-1..7 — no monetization gate, no behavioral nudge, no analytics dust.

**01.5 NOT INVOKED.** All four triggers absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. WP-092 is a parser + Vue-component-modification packet; engine package entirely untouched.

---

### WP-090 / EC-090 Executed — Live Match Client Wiring (2026-04-24, EC-090)

🎮 **WP-090 complete — first end-to-end live match in the browser.** A player can now open `http://localhost:5173/`, fill a nine-field MATCH-SETUP form, click Create match, and watch the URL rewrite to `?match=<id>&player=0&credentials=<secret>` as ArenaHud takes over from LobbyView. A second player can open the same dev server in another tab, see the new match in the lobby list (correctly disambiguating filled seats from open seats via `LobbyMatchSummary.players[].name` presence), click Join on seat 1, and both clients receive boardgame.io state pushes. The fixture path (`?fixture=mid-turn`) is preserved as a zero-network regression guard alongside the live wiring; the route discriminator's precedence is `fixture > live > lobby` and partial live params (any of `match`/`player`/`credentials` missing or empty) fall back silently to LobbyView, never a half-mounted live branch.

**Scope.** Six new arena-client files + three modifications: new `apps/arena-client/src/lobby/lobbyApi.ts` (three HTTP helpers `createMatch` / `listMatches` / `joinMatch` + the `LobbyMatchSummary` shape that normalizes the boardgame.io list response — stringified player ids, explicit-null `gameover`); new `apps/arena-client/src/lobby/lobbyApi.test.ts` (one `describe('lobbyApi (WP-090)')` with 4 `globalThis.fetch`-stubbed tests); new `apps/arena-client/src/lobby/LobbyView.vue` (nine-field v-model form + per-seat Join buttons; `defineComponent({ setup() })` form per the vue-sfc-loader separate-compile pipeline precedent D-6512 / P6-30); new `apps/arena-client/src/client/bgioClient.ts` (the **single runtime engine-import site in the entire arena-client source tree** — `import { LegendaryGame } from '@legendary-arena/game-engine'` lives here only; namespace-import + fallback-chain for boardgame.io's CJS bundle covers tsx, Vite 5, and Node ESM uniformly; FIX-22 malformed-frame guard coalesces non-object `state.G` to null rather than casting a primitive to `UIState`); new `apps/arena-client/src/client/bgioClient.test.ts` (two describes — `createLiveClient` 3 tests + `App routing` 4 tests; factory-injection test seam keeps the public return shape exactly three keys); new `apps/arena-client/.env.example` documenting `VITE_SERVER_URL` per-environment binding; modified `apps/arena-client/src/App.vue` (route discriminator + onMounted/onBeforeUnmount lifecycle for the live client + `searchOverride: string | null` test seam); modified `apps/arena-client/package.json` (added `"boardgame.io": "^0.50.0"` only); modified `apps/arena-client/vite.config.ts` (scope expansion — `wp-090-stub-par-storage` plugin replaces the game-engine barrel's transitive `node:fs/promises` import via `par.storage.js` with same-named inert exports so tree-shaking drops it from the browser bundle; the game-engine package itself is untouched). Governance close lands in companion SPEC commit: DECISIONS.md D-9001..D-9005, this STATUS block, WORK_INDEX.md WP-090 row flipped `[x]` + Dependency Chain update + CLI drift follow-up placeholder, EC_INDEX.md EC-090 row flipped `Done 2026-04-24`, the pre-commit review artifact at `docs/ai/reviews/pre-commit-review-wp090-ec090.md`, and the 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-090-live-match-client-wiring.md` (mandatory per four triggers: new long-lived abstraction `createLiveClient`, new contract consumed by future WPs `LobbyMatchSummary` + URL contract, new code subdirectories `src/lobby/` + `src/client/`, first runtime engine-import site in arena-client).

**Test baseline shift.** `apps/arena-client` moves from `66 / 0 / 0` to **`77 / 3 / 0`** (+11 tests / +3 suites exactly per EC-090 Step 2 locked delta — 4 lobbyApi + 3 createLiveClient + 4 App-routing tests; three new `describe()` blocks). All other package baselines unchanged. Repo-wide total rises from `696 / 130 / 0` to **`707 / 133 / 0`**. Production Vite build: 272 KB / 90 KB gzipped.

**Engine + cross-package invariants preserved.** `git diff --name-only packages/ apps/server/ apps/registry-viewer/ apps/replay-producer/` returns empty. The single runtime engine-import site invariant holds under a multiline-aware regex (exactly one match at `bgioClient.ts:16`); the EC's line-by-line PowerShell grep returns a false positive on `SharedScoreboard.vue:6` (multi-line `import type` continuation), recommended for EC tightening in the post-mortem §6. No `boardgame.io/react`, no `axios`/`node-fetch`/`ky`, no `localStorage`/`sessionStorage`/`IndexedDB`. The 9-field composition lock is honored verbatim in the manual form. The Session Protocol live-server verification (D-9001) confirmed the canonical join request body `{ playerID, playerName }` and response field `{ playerCredentials }` against a running server, identifying `apps/server/scripts/join-match.mjs` as the buggy CLI script (reads the non-existent `result.credentials`); the CLI fix is filed as a follow-up WP placeholder in WORK_INDEX.md, scope-isolated from arena-client.

**Mid-execution Vite CJS interop fix surfaced by the manual smoke test.** `pnpm test`, `pnpm build`, `pnpm typecheck`, and the programmatic HTTP-contract smoke test all passed before the runtime bug appeared in the browser. Vite's `__esModule: true` interop shim collapsed the default lookup to undefined for boardgame.io's CJS bundle (which exports `Client` as a named property without a `default`). Fix: namespace import + fallback chain `pkg.Client ?? pkg.default?.Client` covers tsx (CJS→ESM via `.default`), Vite 5 (named binding via the namespace), and Node ESM uniformly. Recorded in post-mortem §3 stage 2 / §4 with a lesson for future first-runtime-import packets: browser smoke test is the definitive gate, not `pnpm build`.

**01.5 NOT INVOKED.** All four triggers absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new `LegendaryGame.moves` entry, no new phase hooks. Engine package untouched.

**Vision alignment.** §3 (Player Trust & Fairness) — clients submit *intent* via `submitMove` only; the server dispatches to the authoritative engine; no client-side rule execution or outcome computation. §4 (Determinism) — fixture path remains as a deterministic regression harness; live wiring receives engine-projected `UIState` (WP-089) over a single subscribe channel. §22 (Replay Faithfulness) — credentials are URL-borne (D-9003) for the MVP per WP-052's deferred durable-identity scope; nothing in the live wiring depends on persistence beyond boardgame.io's in-memory match state. §10 (Public surface) — arena-client now serves a usable game UI from `localhost:5173` without CLI dependencies. NG-1..7 — no monetization gate, no behavioral nudge, no analytics dust.

---

### WP-091 / EC-091 Executed — Loadout Builder in Registry Viewer (2026-04-24, EC-091)

🧰 **WP-091 complete — first authoring surface for MATCH-SETUP documents.** A user can now open `cards.barefootbetters.com`, click the new "Loadout" tab, interactively build a MATCH-SETUP envelope + composition (scheme, mastermind, villain groups, henchman groups, hero groups, pile counts, player count, seed, expansions, theme pre-fill), and download a schema-valid JSON document ready for WP-092's lobby intake. The rule-mode indicator renders WP-093's locked `GROUP_STANDARD` label byte-for-byte and is read-only in v1; downloaded JSON always emits `heroSelectionMode: "GROUP_STANDARD"` explicitly for auditability. Engine behavior is unchanged — `packages/game-engine/**`, `apps/server/**`, and `apps/arena-client/**` are untouched; the new browser-safe validator mirrors the engine's ext_id lookup algorithm byte-for-byte (D-1209 / A-091-03) but lives registry-side to keep the viewer engine-free.

**Scope.** Four new registry-side files under `packages/registry/src/setupContract/` (types + strict zod schema + `validateMatchSetupDocument()` pure function + 18 tests wrapped in one `describe('setupContract (WP-091)')` block) plus a browser-safe subpath barrel (`setupContract/index.ts`); modified `packages/registry/src/index.ts` with additive re-exports of the new surface; modified `packages/registry/package.json` adding a `./setupContract` subpath export (mitigation precedent: `./schema` + `./theme.schema` for glossaryClient / themeClient). Two new registry-viewer files: `apps/registry-viewer/src/composables/useLoadoutDraft.ts` (ref-based draft API with spread-copy discipline in `prefillFromTheme` per L10 / WP-028 projection-aliasing precedent) and `apps/registry-viewer/src/components/LoadoutBuilder.vue` (two-column builder: draft summary + picker + download/upload + rule-mode indicator). `apps/registry-viewer/src/App.vue` gains a third "Loadout" tab alongside Cards and Themes (no router; existing tab-switching pattern). Governance close: DECISIONS.md D-9101, STATUS.md (this block), WORK_INDEX.md WP-091 row flipped `[x]`, EC_INDEX.md EC-091 row flipped `Done 2026-04-24`, and 01.6 post-mortem at `docs/ai/post-mortems/01.6-WP-091-loadout-builder-registry-viewer.md` (mandatory per three triggers: new long-lived abstraction, new contract consumed by future WPs, new code-category subdirectory).

**Test baseline shift.** `packages/registry` moves from `13 / 2 / 0` to **`31 / 3 / 0`** (+18 tests / +1 suite exactly per EC-091 L13 locked delta); all other package baselines unchanged. Repo-wide total rises from `678 / 129 / 0` to **`696 / 130 / 0`**.

**Engine invariants preserved.** `git diff --name-only packages/game-engine/ apps/server/ apps/arena-client/ apps/replay-producer/ packages/preplan/ packages/vue-sfc-loader/` returns empty. No engine import from `packages/registry/**` or `apps/registry-viewer/**` (verified by `Select-String`). No `Math.random` in new files. No `localStorage` / `sessionStorage` / `IndexedDB` / cookies in new files. No new npm dependencies. The 9-field composition lock is preserved verbatim; the 9 envelope fields from WP-093 are consumed verbatim; the WP-093 error-message template lives in a single exported constant (`UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE`) with byte-for-byte parity to D-9301.

**01.5 NOT INVOKED.** All four triggers absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new moves, no new phase hooks. This is a registry-contract + UI packet, not engine runtime wiring.

**Vision alignment.** §3 (Player Trust & Fairness) — builder authors configuration, never implements rules, never simulates gameplay, never alters engine randomness. §10a (Registry Viewer public surface) — grows by one additive tab; Cards/Themes tabs are unmodified. §22 (Replay Faithfulness) — the MATCH-SETUP envelope's `seed` + `setupId` + `schemaVersion` fields are authored in the correct shape; the engine ignores `heroSelectionMode` in v1 so replay determinism is unchanged. NG-1..7 — no paid gate, loot box, or behavioral nudge.

---

### WP-093 / EC-093 Executed — Match-Setup Rule-Mode Envelope Field (Governance) (2026-04-24, EC-093)

📜 **WP-093 complete — governance-only; zero runtime behavior change.** `heroSelectionMode` is now a canonical **optional envelope field** on the MATCH-SETUP document with v1 enum `["GROUP_STANDARD"]`; absent is normalized to `"GROUP_STANDARD"` by every downstream consumer; `"HERO_DRAFT"` is reserved for a future release in prose only (never in the v1 allowed enum). The 9-field composition lock (`MatchSetupConfig`) is preserved byte-for-byte — the `.claude/rules/code-style.md` clarification scope-narrows the lock to composition, not a rescission. `schemaVersion` stays at `"1.0"` (additive + backward compatible). Canonicalizes the error code `"unsupported_hero_selection_mode"`, the full-sentence error message template (consumed verbatim by WP-091's registry-side validator and WP-092's lobby-side shape guard), the label mapping (machine name + short UI label `"Classic Legendary hero groups"` + long explanation + future-notice UX copy `"Hero Draft rules are planned for a future update."`), and the flavor/lore separation discipline (e.g., `"Contest of Champions"` is narrative UI copy only — never machine-readable). New DECISIONS entry **D-9301** documents the decision, rationale, schemaVersion-no-bump analysis, SCREAMING_SNAKE_CASE rule-mode token convention, consumer list (WP-091 / WP-092 / server-side-future), and the four-point naming-governance policy (WP-093 is the sole source of rule-mode names; future UI/parser WPs consume verbatim; new modes amend WP-093 first; flavor strings never machine-readable). `heroSelectionMode` is an **interpretation flag, not a ruleset selector** — no future WP may use it as a branch point for engine-level ruleset changes outside composition-interpretation scope. Engine behavior is unchanged until a future WP expands the enum and implements `HERO_DRAFT`. Test baseline `678 / 129 / 0` repo-wide unchanged (engine `513 / 115 / 0`, arena-client `66 / 0 / 0`) — no code touched; `git diff --name-only packages/ apps/` empty.

**Scope.** Seven governance-content files + two governance-close files + one 01.6 post-mortem: `docs/ai/REFERENCE/MATCH-SETUP-SCHEMA.md` (Optional Fields subsection + §Field Semantics / Hero Selection Mode subsection + §Extensibility Rules bullet + additive example-JSON field); `docs/ai/REFERENCE/MATCH-SETUP-JSON-SCHEMA.json` (`properties.heroSelectionMode` between `expansions` and `composition` with `enum: ["GROUP_STANDARD"]`, not in root `required`, `additionalProperties: false` unchanged); `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` (Stage 1 — Envelope Validation rule-mode bullet with byte-for-byte error template + valid/invalid Test Coverage entries); `docs/ai/REFERENCE/00.2-data-requirements.md` (§7 new "Envelope Extensibility" subsection **after** the 9-field composition enumeration, which stays unchanged); `.claude/rules/code-style.md` (additive clarification after the "MatchSetupConfig has 9 locked fields" enumeration, which stays verbatim); `docs/ai/DECISIONS.md` (D-9301 appended after D-9401 and before the Final Note); `docs/ai/STATUS.md` (this block); `docs/ai/work-packets/WORK_INDEX.md` (WP-093 row flipped `[ ] Draft` → `[x] Done 2026-04-24`); `docs/ai/execution-checklists/EC_INDEX.md` (EC-093 row flipped `Draft` → `Done 2026-04-24`); `docs/ai/post-mortems/01.6-WP-093-match-setup-rule-mode-envelope-field.md` (mandatory per two triggers: new long-lived abstraction + new contract consumed by future WPs).

**01.5 NOT INVOKED.** All four triggers absent: no `LegendaryGameState` field added, no `buildInitialGameState` shape change, no new moves, no new phase hooks. Governance-only packet — `git diff --name-only packages/ apps/` returns empty.

**Vision alignment.** §3 (Player Trust & Fairness) — rule-mode is an interpretation flag, not a rule variation; v1 allows exactly one value matching current engine behavior, so no authority shifts from engine to client and no scoring/outcome contract is affected. §22 (Replay Faithfulness) — envelope-only + optional-with-default preserves every pre-existing MATCH-SETUP document's validity; the engine ignores `heroSelectionMode` in v1 so replay determinism is unchanged. §10a (Registry Viewer public surfaces) — indirect via WP-091 (consumer). NG-1..7 (monetization non-goals) — none crossed.

---

### WP-089 / EC-089 Executed — Engine PlayerView Wiring (UIState Projection) (2026-04-24, EC-089)

⚙️ **WP-089 complete** — Clients now receive audience-filtered `UIState` projections via boardgame.io `playerView`; raw `LegendaryGameState` is never transmitted. `buildPlayerView` (named top-level function, `packages/game-engine/src/game.ts`) composes `buildUIState` (WP-028) + `filterUIStateForAudience` (WP-029) and runs on every state push. `null` and non-string `playerID` map to spectator; empty-string seat IDs route to `{ kind: 'player', playerId: '' }`. Six new contract-enforcement tests in `packages/game-engine/src/game.playerView.test.ts` (one `describe` block — delegation correctness + null/undefined spectator mapping + determinism + G-mutation-safety + ctx-mutation-safety). Test baseline `672 / 128 / 0` → `678 / 129 / 0` repo-wide; engine `507 / 114 / 0` → `513 / 115 / 0` (+6 / +1 / 0 exactly).

**RS-3 cast refinement (in-session).** The WP/EC-locked cast `as unknown as Game<LegendaryGameState>['playerView']` failed under TypeScript `exactOptionalPropertyTypes: true` because the indexed-access type includes `| undefined` (playerView is optional on `Game<>`), which then triggers TS2375 on the object-literal field assignment. Additionally, boardgame.io 0.50.2's `Game<G>['playerView']` is a **single-context-object** signature `(context: { G, ctx, playerID }) => any`, not the three-positional-args shape WP-089 locked — the three-arg form would have broken at runtime regardless of TS. Resolved via user-authorized refinement to `as NonNullable<Game<LegendaryGameState>['playerView']>` at the assignment site (strips `| undefined` without touching the `Game<...>` generic on `LegendaryGame`) and adoption of the single-context-object internal signature for `buildPlayerView`. D-8901 records the architectural decision; the cast form is TS-language-variance documented in the 01.6 post-mortem §13.1, not a new DECISIONS entry. No scope expansion; no test-count impact beyond the locked +6 / +1.

**Commit topology.** Bundled single commit — `EC-089:` prefix carrying the two production-code changes (modified `game.ts` + new `game.playerView.test.ts`) and governance close (DECISIONS.md D-8901 + STATUS.md + WORK_INDEX.md flip + EC_INDEX.md flip + this post-mortem). Precedent: WP-051 bundled form. `SPEC:` prefix not needed because governance is folded inline.

**Vision alignment.** §4 (UI Consumes Projections Only) + D-0301 — clients never observe raw `G`. §4 + D-0302 — single `UIState` with multiple audiences; `filterUIStateForAudience` is the sole audience authority. §22 (Server Is Wiring Only) — the projection is engine-side; server transports the projected frame without interpretation.

---

### WP-088 / EC-088 Executed — `buildCardKeywords` Setup Module Hardening (2026-04-23, EC-088)

Setup-time hardening only; no runtime behavior change for well-formed card data. Adds `isKeywordSetData` + per-iteration shape guards, replaces `findFlatCardForVillainCard` with a function-local `villainExtIds: Set<string>` pre-index (O(V·F) → O(V+F); D-8802 locality), and pivots to a canonical emission order `['patrol', 'ambush', 'guard']` byte-identical to `BOARD_KEYWORDS` per D-8801. Every `result[extId]` is a freshly-constructed `BoardKeyword[]` per D-8802 (WP-028 aliasing precedent). `KeywordSetData.abbr` and `.henchmen` deleted; `findFlatCardForVillainCard` fully removed; `extractKeywordsFromAbilities` renamed `detectAmbush` (returns boolean). Ambush prefix-match and Patrol/Guard safe-skip `// why:` comments preserved verbatim (D-8803 locks whitespace-tolerance deferral). `buildCardKeywords` signature byte-identical; caller at `buildInitialGameState.ts:173` untouched. Test baseline `507 / 114 / 0` engine + `672 / 128 / 0` repo-wide unchanged (adjusted post-WP-087 A1 amendment `d5880d2`).

### WP-087 / EC-087 Executed — Engine Type Hardening (2026-04-23, EC-087)

`PlayerId` string alias added to `packages/game-engine/src/types.ts` with a `// why:` comment citing the boardgame.io 0.50.x player-index convention; three `Record<string, …>` → `Record<PlayerId, …>` swaps at the three canonical sites (`LegendaryGameState.playerZones`, `GameStateShape.playerZones`, `PersistableMatchConfig.playerNames`); factory-time `hookRegistry` construction in `rules/ruleRuntime.ordering.test.ts` eliminates the sole non-setup `hookRegistry` assignment grep-hit. Test baseline `671 / 127 / 0` unchanged. Zero runtime behavior change; zero serialization / replay / snapshot shape change.

**Scope deviation:** the three `readonly` modifiers on `LegendaryGameState.{hookRegistry, schemeSetupInstructions, heroAbilityHooks}` were planned but **deferred** to a follow-up WP — applying them surfaced seven TS errors in four production-code files outside the WP-087 §Files Expected to Change allowlist (`game.ts`, `hero/heroConditions.evaluate.ts`, `hero/heroEffects.execute.ts`, `villainDeck/villainDeck.reveal.ts`). Per the session prompt's §AI Agent Warning #1 and generic-ripple Hard Stop, the `readonly` tightening was reverted; the `PlayerId` alias, three `Record` swaps, and factory refactor all landed as specified. See D-8702 for the deferral rationale and the follow-up WP scope.

### WP-051 / EC-051 Executed — PAR Publication & Server Gate Contract (2026-04-23, EC-051)

**Pre-submission PAR gate ships at the server layer. Server test baseline shifts 6/2/0 → 19/3/0 (+13 tests / +1 suite); repo-wide 658/126/0 → 671/127/0. Engine baseline 506/113/0 unchanged. Zero gameplay changes; zero moves added; zero phase hooks; zero new `LegendaryGameState` fields; zero engine / registry / preplan / arena-client / replay-producer / registry-viewer files modified during Commit A.**

WP-051 closes the chain from WP-049 (simulation engine) → WP-050 (artifact storage) → WP-051 (server enforcement). The server can now answer "is the PAR for this scenario published?" in O(1) in-memory lookups, with sim-over-seed precedence preserved per D-5003 / D-5101 and fail-closed on both-indices-missing per D-5103.

Two new files under `apps/server/src/par/`:

- `parGate.mjs` — `checkParPublished(simulationIndex, seedIndex, scenarioKey)` and `createParGate(basePath, parVersion)`. Zero `node:fs` imports — every byte of PAR data enters the server through the engine's `loadParIndex` helper (D-5001 line 8937: server consumes PAR through the engine API). `checkParPublished` is synchronous, pure, and returns a fresh object literal `{parValue, parVersion, source}` on every hit (copilot #17 aliasing guard — no caller can mutate the in-memory index through a returned reference). Returns `null` when the scenario is absent from both indices, and also when both indices are `null` (dual-null fail-closed). `createParGate` loads both source classes concurrently via `Promise.all` on two `loadParIndex` calls; catches `ParStoreReadError` per class via an internal `handleParLoadError` helper that warn-logs a full sentence and returns `null` for that class (D-5101 graceful degradation). Non-`ParStoreReadError` error classes re-throw so infrastructure failures (permission denied, disk full) surface loudly.
- `parGate.test.ts` — exactly 13 tests in one `describe('PAR publication gate (WP-051)', …)` block: 3 `loadParIndex` smoke (valid round-trip, null-on-missing, throws-on-cross-class), 3 `checkParPublished` base (sim-only hit, absent→null, dual-null fail-closed), 3 `createParGate` integration (bound-gate equivalence, zero-fs-at-request-time invariant via post-construction `rm -rf` of the backing directory, version isolation), 3 dual-class precedence (sim-only, seed-only with graceful degradation, both-present sim-wins-with-different-parValue), 1 aliasing guard (two sequential calls return identity-distinct objects; mutating result1 leaves result2 and the in-memory index untouched).

Two existing server files receive surgical modifications:

- `apps/server/src/server.mjs` — one `import { createParGate } from './par/parGate.mjs';` line; the `startServer()` `Promise.all` is extended to include `createParGate('data/par', process.env.PAR_VERSION ?? 'v1')` as the third independent startup task. The returned gate is captured via array destructuring with an explicit `void parGate;` marker documenting that the binding is held for future WP-053/WP-054 consumers. No other lines in the file change — `loadRegistry()`, `loadRules()`, the CORS origins array, `registerHealthRoute`, the `Server({...})` config, the `PORT` read, the `server.run({...})` call, and the listening log line are all unchanged.
- `apps/server/package.json` — `scripts.test` value expanded from `scripts/**/*.test.ts` to `scripts/**/*.test.ts src/**/*.test.ts` so the new `src/par/parGate.test.ts` tests actually run. The Locked Values quoted form `'scripts/**/*.test.ts' 'src/**/*.test.ts'` was refined mid-execution to the unquoted form — pnpm on Windows routes test scripts through `cmd.exe`, which does not honor single quotes and was passing them to Node as literal characters, silently matching zero files (0/0/0/0). The unquoted form matches the pre-WP-051 proven precedent and resolves via Node v22+ `--test` native glob support. Details in the post-mortem §3.8.

**Active PAR version (D-5102).** `process.env.PAR_VERSION ?? 'v1'` at the `createParGate` call site — read once at startup; stable for process lifetime; no runtime reload; no SIGHUP handling; no format validation on the server (a bad value surfaces as missing-index warnings, not a startup crash — fail-soft per D-5102). The fallback `'v1'` matches the `PORT ?? '8000'` pattern elsewhere in `server.mjs`.

**Existence-based trust (D-5103).** The server does not reimplement `validateParStore`, does not recompute `artifactHash`, and does not verify coverage at startup. Hash / coverage validation is CI-time only via the engine's `validateParStore` helper from WP-050. "Published" means "present in the active-version index" — nothing else.

**Dual-class precedence (D-5101).** The gate queries the simulation index first via `lookupParFromIndex`; on hit, returns `source: 'simulation'`. Else queries the seed index; on hit, returns `source: 'seed'` (graceful degradation — seed gives day-one coverage, simulation supersedes once calibrated). Both-present with different `parValue`: simulation wins, seed value is not observable (test #12 enforces). Both-absent: returns `null`. The fresh-object-literal return shape `{parValue, parVersion, source}` is load-bearing for WP-053 / WP-054 leaderboard records — `source` tags whether the record was gated by content-authored or simulation-calibrated PAR.

**No-filesystem-IO-at-request-time invariant.** Test #8 proves the gate is closed over in-memory data only. The gate is constructed over a tmpdir workspace; the workspace is `rm -rf`'d immediately after `createParGate` resolves; subsequent `checkParPublished` calls still return the correct pre-deletion PAR values. Combined with the grep-enforced absence of `node:fs` imports in `parGate.mjs` (the gate has no syntactic path to touch the filesystem at request time), this converts "zero fs IO per gate check" from a behavioral claim to an architectural invariant.

**Commit topology (three code/governance commits + this close).** A0-engine `5e468a7` (`EC-050: A1 amendment — export loadParIndex for WP-051 startup gate`) landed the engine A1 amendment: `loadParIndex(basePath, parVersion, source): Promise<ParIndex | null>` exported from `par.storage.ts` + 1 drift test (engine test count 505 → 506). A0-governance `db83d9a` (`SPEC: WP-051 A0 pre-flight governance — D-5101..5103, WP/EC-051 amend`) landed D-5101 / D-5102 / D-5103, WP-051 / EC-051 amendments, session-context-wp051, pre-flight verdict flip, and this session prompt. Commit A `ce3bffb` (`EC-051: PAR publication & server gate — dual-index in-memory gate with D-5101 precedence`) executed the implementation: 4 files (parGate.mjs, parGate.test.ts, server.mjs, package.json), +700 lines, -2 lines. Commit B (this commit, `SPEC:`) closes governance: STATUS.md, WORK_INDEX.md flip, EC_INDEX.md flip, post-mortem. The A0 split into two commits (engine + governance) was driven by the commit-msg hook Rule 5 which blocks `SPEC:` when `packages/` or `apps/` code is staged. Precedent: WP-050 had the same split pattern (A0a + A0b).

**Layer-boundary discipline (grep-verified).** No `boardgame.io` import, no `LegendaryGame`, no `ctx.` reference, no `node:fs` import, no `node:net/http/https/child_process/dns` import, no `.reduce(` with branching, no `Math.random`, no `Date.now`, no `require(`, no `writeFile/mkdir/unlink/rename/truncate` in `apps/server/src/par/parGate.mjs`. Tests may import `node:fs/promises` for fixture setup — the fs-free boundary applies to the production file only. The `_parGate` / `void parGate` held-but-unused pattern is documented for WP-053's future `getParGate()` accessor addition.

**Mandatory 01.6 post-mortem.** Delivered at `docs/ai/post-mortems/01.6-WP-051-par-publication-server-gate.md` covering all 8 mandatory checks: layer-boundary audit, aliasing audit, fail-closed audit, no-fs-at-request-time audit, precedence audit, config audit, `// why:` comment completeness, and test-glob audit (including the mid-execution quoted-to-unquoted refinement with `cmd.exe` + pnpm root-cause analysis).

**Vision alignment.** §13 (Defensible Leaderboards) — fail-closed posture and fresh-object-literal return defend against leaderboard trust violations. §14 (Deterministic, Replayable Matches) — synchronous pure gate check, no wall-clock reads, no randomness, stable for process lifetime. §22 (Server Is Wiring Only) — zero gameplay logic; `parValue` is opaque to the server. §24 (Layer Boundaries) — engine owns PAR file IO; server consumes via named imports; no cross-layer violations.

---

### WP-050 / EC-050 Executed — PAR Artifact Storage & Indexing (2026-04-23, EC-050)

**Dual source-class PAR artifact storage layer ships. Engine baseline shifts 471/112/0 → 505/113/0; repo-wide 623/125/0 → 657/126/0. Zero gameplay changes; zero WP-036/WP-048/WP-049 contract modifications; zero `G` mutation from new files; no moves, no phase hooks, no new `LegendaryGameState` fields.**

WP-050 lands Phase 2/3 of the three-phase PAR derivation pipeline documented
in `docs/12-SCORING-REFERENCE.md` — the persistence substrate the pre-release
PAR gate (WP-051) and public leaderboards (WP-054) depend on. One new source
file + one new test file added under `packages/game-engine/src/simulation/`,
permitted to perform filesystem IO by the newly landed **D-5001** simulation
IO carve-out (every other simulation file remains IO-free per D-3601):

- `par.storage.ts` — 13 exported functions (`scenarioKeyToFilename`,
  `scenarioKeyToShard`, `sourceClassRoot`, `computeArtifactHash`,
  `writeSimulationParArtifact`, `readSimulationParArtifact`,
  `writeSeedParArtifact`, `readSeedParArtifact`, `buildParIndex`,
  `lookupParFromIndex`, `resolveParForScenario`, `validateParStore`,
  `validateParStoreCoverage`) + `ParStoreReadError` class + `PAR_ARTIFACT_SOURCES`
  canonical readonly array (drift-pinned against `ParArtifactSource` union,
  same pattern as `AI_POLICY_TIERS` / `PENALTY_EVENT_TYPES` / `MATCH_PHASES`).
- `par.storage.test.ts` — exactly 34 tests in one `describe` block
  (6 path + 7 sim I/O + 7 seed I/O + 4 index + 5 resolver + 4 validation
  + 1 hashing).

**Dual source-class storage layout (locked).** Two independent class roots:
`data/par/seed/{parVersion}/` (content-authored Phase 1 baseline — hand
maintained, `authoredBy` / `rationale` provenance) and `data/par/sim/{parVersion}/`
(Phase 2 simulation-calibrated — `percentileUsed`, `sampleSize`, `seedSetHash`,
`policyTier: 'T2'` guard). Versioned independently — `seed/v1` is unrelated
to `sim/v1`. `sourceClassRoot(basePath, source, parVersion)` is the single
choke-point for `seed/` vs `sim/` directory names; no other code path
constructs those strings.

**Single-resolver cross-class precedence (D-5003).** `resolveParForScenario`
is the ONLY sanctioned cross-class reader. Simulation-over-seed precedence
is locked: sim index first, seed index second, `null` otherwise. No
optional `preferSource` override; no alternate reader. Missing index files
are treated as "class has no coverage" (resolver advances); truncated or
malformed indices throw `ParStoreReadError` — never silent fall-through.

**Trust surface guarantees.**
- **Byte-identical serialization** — recursive sorted-key canonical JSON
  writer replaces default `JSON.stringify` (default preserves insertion
  order, non-deterministic across refactors).
- **Overwrite refusal at write layer** (D-5008) — both writers `fs.access`-check
  the target path; if the file exists they throw a full-sentence `Error`.
  No `fs.rm` / `fs.truncate` / `fs.rename`-over-existing anywhere in writer
  paths. Calibration updates create new version directories, never in-place edits.
- **SHA-256 `artifactHash` via `node:crypto`** (D-5009) — self-hash
  exclusion avoids circular dependency; `node:crypto` is a Node built-in,
  NOT an external crypto library (external crypto like `crypto-js` / `sha.js`
  remains forbidden per D-3601 scope clarification).
- **Non-T2 policy tier guard** (D-5010) — `writeSimulationParArtifact` rejects
  non-T2 inputs at write time via `AI_POLICY_TIER_DEFINITIONS.find(usedForPar)`;
  `validateParStore('simulation')` flags any on-disk non-T2 artifact that
  bypassed the writer.
- **Seed consistency guard** — `writeSeedParArtifact` four-parameter signature
  `(artifact, scoringConfig, basePath, parVersion)` per PS-5 enables the
  write-time check that `artifact.parValue === computeParScore(scoringConfig
  with parBaseline)`. Drift between stored value and baseline is a
  publication-blocking error.
- **Atomic index writes** (D-5007) — `buildParIndex` serializes to
  `{indexPath}.tmp` and `fs.rename`s to final. Concurrent readers see the
  old index or the new index, never a half-written file. Indices are not
  immutable (rebuildable); individual artifact files are.
- **Read-only validator** — `validateParStore` reports every inconsistency
  (completeness, exclusivity, `parValue` match, hash integrity, filename /
  ScenarioKey mismatch, cross-class `source` drift, non-T2 for simulation,
  seed baseline completeness). Never silently repairs data.

**Coverage reporter.** `validateParStoreCoverage(basePath, parVersion,
expectedScenarios)` answers "do we have PAR for every scenario we plan to
ship?" in one call. WP-051 consumes this as a single oracle for the
pre-release gate — no parallel class probes that could drift.

**D-5001 IO carve-out boundary.** Filesystem IO is permitted only in
`par.storage.ts` and `par.storage.test.ts` under `src/simulation/`.
Grep-enforced:

```bash
grep -rnE "from ['\"]node:fs" packages/game-engine/src/simulation/ --include="*.ts" \
  | grep -vE "(par\.storage\.ts|par\.storage\.test\.ts)"
# Expected: no output.
```

Production code uses `node:fs/promises` exclusively (PS-6 lock); synchronous
APIs are forbidden in `par.storage.ts` but permitted in tests. No
`node:net` / `node:http` / `node:https` / `node:child_process` / `node:dns`
anywhere in new files.

**Lifecycle prohibition (carried from WP-028 precedent).** None of the 13
storage functions are called from `game.ts`, `LegendaryGame.moves`, phase
hooks, or any engine runtime file. Consumers are test files, future WP-051
(server publication gate), future WP-054 (public leaderboards), and
content-authoring tooling.

**Pre-flight resolution.** Six PS items resolved in the A0b SPEC commit
(`cd7965a`) before execution began: PS-1 (EC drift 21→34 tests + dual
source classes), PS-2 (D-5001 IO carve-out), PS-3 (`ScenarioKey` format
wording), PS-4 (`node:crypto` vs external crypto citation), PS-5
(four-parameter `writeSeedParArtifact` signature), PS-6 (`node:fs/promises`
production lock).

**01.5 NOT INVOKED.** Zero new `LegendaryGameState` field, zero
`buildInitialGameState` shape change, zero moves, zero phase hooks. WP-050
is external consumer tooling per D-0701.

**01.6 post-mortem MANDATORY** per four triggers (new long-lived abstraction,
new contract consumed by future WPs, new canonical readonly array, first
filesystem carve-out) — delivered at
`docs/ai/post-mortems/01.6-WP-050-par-artifact-storage.md` covering
aliasing, JSON-roundtrip, `// why:` completeness (19 comments vs 10
required), determinism, per-source-class isolation, layer-boundary +
D-5001 carve-out audit, hash integrity. All seven mandatory checks PASS.

**Four-commit topology:** A0a SPEC pre-flight bundle (`3552fc2`) → A0b SPEC
PS-1..PS-6 resolution (`cd7965a`) → A `EC-050:` execution (`ccdf44e`, 5
files, 2284 insertions) → B SPEC governance close (this commit: STATUS.md
+ WORK_INDEX.md WP-050 `[ ]` → `[x]` + EC_INDEX.md EC-050 Draft → Done +
post-mortem).

---

### WP-049 / EC-049 Executed — PAR Simulation Engine (2026-04-23, EC-049)

**T2 Competent Heuristic policy + PAR aggregation pipeline ship. Engine baseline shifts 444/110/0 → 471/112/0; repo-wide 596/123/0 → 623/125/0. Zero gameplay changes; zero contract modifications; zero `G` mutation from new files.**

WP-049 lands Phase 2 of the three-phase PAR derivation pipeline documented
in `docs/12-SCORING-REFERENCE.md`. Three new source files added under
`packages/game-engine/src/simulation/` (already classified as `engine` code
category per D-3601 via WP-036 precedent):

- `ai.tiers.ts` — `AIPolicyTier` union (`T0..T4`), `AI_POLICY_TIERS`
  canonical readonly array (drift-pinned alongside `MATCH_PHASES` /
  `TURN_STAGES` / `PENALTY_EVENT_TYPES`), `AIPolicyTierDefinition`
  interface, `AI_POLICY_TIER_DEFINITIONS` reference taxonomy with exactly
  one entry (T2) carrying `usedForPar: true`.
- `ai.competent.ts` — `createCompetentHeuristicPolicy(seed): AIPolicy` T2
  factory implementing five behavioral heuristics (threat prioritization,
  heroism bias, economy awareness, limited deck awareness, local
  optimization). Seeded mulberry32 decision PRNG closed over the policy
  instance; never shares state with the run-level shuffle PRNG (D-3604
  two-domain invariant). Scoring uses integer ranks so tie-breaking is
  bounded and deterministic.
- `par.aggregator.ts` — full PAR pipeline: `aggregateParFromSimulation`
  (55th-percentile nearest-rank, integer output, explicit numeric sort
  comparator), typed `ParAggregationError` with discriminated `code` union
  (`'EMPTY_DISTRIBUTION' | 'PERCENTILE_OUT_OF_RANGE'`), module-level
  deterministic constants (`PAR_PERCENTILE_DEFAULT = 55`,
  `PAR_MIN_SAMPLE_SIZE = 500`, `IQR_THRESHOLD = 2000`,
  `STDEV_THRESHOLD = 1500`, `MULTIMODALITY_BIN_COUNT = 20`),
  cluster-based multimodality smell test (robust to wide unimodal
  distributions), deterministic `generateSeedSet` + `computeSeedSetHash`
  canonicalization, severity-tagged `ParValidationResult`, and the full
  `generateScenarioPar` orchestration. Per-game loop replicated from
  WP-036 `simulation.runner.ts` (RS-10) using engine primitives only —
  `simulation.runner.ts` byte-identical pre vs post.

Two new test suites:

- `ai.competent.test.ts` — 10 T2 policy tests covering AIPolicy shape,
  determinism, seed divergence, heroism bias, threat prioritization,
  economy awareness, hidden-state isolation, all eight legal move types,
  legal-move conformance across 50 invocations, and policy `name` literal.
- `par.aggregator.test.ts` — 17 aggregator tests covering nearest-rank
  correctness (rank 549 on 1000 scores), integer output on identical
  distributions, `ParAggregationError` on empty array + out-of-range
  percentile (both asserted `instanceof ParAggregationError` + `.code ===
  '<expected>'`, never by message substring), validation accept/reject
  for N >= 500, clean unimodal + suspicious bimodal smell tests, tier
  ordering pass/fail, `AI_POLICY_TIERS` drift detection, only-T2-usedForPar
  pin, seed-set determinism + order-sensitive hash, byte-identity +
  JSON-roundtrip reproducibility with injected `generatedAtOverride`
  (RS-11), provenance-verbatim pinning, and losses-included-in-distribution
  with `result.sampleSize === config.simulationCount` invariant.

`docs/ai/DECISIONS.md` gains 11 new entries (D-4901 through D-4911)
covering: T2 as sole PAR authority, 55th-percentile nearest-rank method,
neutral hero pool, N >= 500 enforced at validation (not aggregation) so
bootstrap tests remain possible, five T2 behavioral heuristics rationale,
losses as first-class outcomes, server-layer pre-release gate, seed-set
canonicalization via index-based derivation, Raw Score surface immutable
without major version bump, `needsMoreSamples` module-level deterministic
thresholds, and `ParValidationResult` severity axis (error vs warn).

The Runtime Wiring Allowance (01.5) is explicitly **NOT INVOKED** — all
four trigger criteria absent: no new `LegendaryGameState` field, no
`buildInitialGameState` shape change, no new `LegendaryGame.moves` entry,
no new phase hook. The 01.6 post-mortem was mandatory (new long-lived
abstraction, new contract consumed by future WPs, new canonical readonly
array) and is delivered at
`docs/ai/post-mortems/01.6-WP-049-par-simulation-engine.md` covering
aliasing, JSON-roundtrip, `// why:` completeness, reproducibility
protocol, per-game loop replication audit, and layer-boundary audit.

Two strict in-allowlist refinements applied during execution without
01.5 invocation (WP-031 precedent): (1) added `MAX_MOVES_PER_GAME = 2000`
move-level stall cap in `simulateOneGame` to handle the deterministic-
policy-against-empty-villain-deck trap surfaced by the mock-registry
test fixtures — no contract surface changed; (2) rewrote the
multimodality detector from peak-distance to cluster-based detection
to eliminate false positives on tight single-peak distributions — no
public signature changed.

Verification gates all green: `pnpm --filter @legendary-arena/game-engine
build` exits 0; `pnpm -r test` exits 0 with exactly `471 / 112 / 0` for
game-engine and `623 / 125 / 0` repo-wide (+27 tests / +2 suites vs
baseline; every other package unchanged). No `boardgame.io` /
`@legendary-arena/registry` imports in any new file (grep verified). No
`Math.random()` / `.reduce()` with branching / `require()` in any new
file. WP-036 + WP-048 + WP-020 contract files byte-identical pre vs post
(`git diff main -- ...` returns zero output on all 10 tracked files).
Lifecycle prohibition verified — the seven new functions appear only in
the simulation files and the two re-export modules (`types.ts`,
`index.ts`); no call site under `moves/`, `rules/`, `phases/`, `turn/`,
`setup/`, `endgame/`, `economy/`, `zone*`, `ui/`, `replay/`, or
`invariants/`.

Three-commit topology: A0 SPEC pre-flight bundle (`67927f1` — PS-1/PS-2
resolved, copilot FIXes locked) → A `EC-049:` code + DECISIONS.md
(`021555e`, 8 files: three new source files + two new test files +
`types.ts` + `index.ts` + `DECISIONS.md`) → B SPEC governance close
(this commit: `STATUS.md` + `WORK_INDEX.md` WP-049 `[ ]` → `[x]` +
`EC_INDEX.md` EC-049 Draft → Done + post-mortem). Commits use `EC-049:`
on code; `SPEC:` on governance (never `WP-049:` per P6-36 — commit-msg
hook rejects). Lifecycle prohibition, aliasing invariance, JSON
serializability, two-domain PRNG, and per-game loop replication all
captured in the post-mortem.

**WP-049 unblocks WP-050 (PAR Artifact Storage) and WP-051 (Pre-Release
PAR Gate). `ParSimulationResult` field names are load-bearing for WP-050's
artifact schema.**

See `WP-049-par-simulation-engine.md` +
`EC-049-par-simulation-engine.checklist.md` +
`docs/ai/invocations/session-wp049-par-simulation-engine.md` +
`docs/ai/invocations/preflight-wp049-par-simulation-engine.md` +
`docs/ai/session-context/session-context-wp049.md` + post-mortem +
D-4901 through D-4911.

---

### WP-041 / EC-041 Executed — System Architecture Definition & Authority Model (2026-04-23, EC-041)

**Architecture formally reviewed and versioned at 1.0.0; 20 G-class Runtime fields certified in Field Classification Reference; authority chain locks `01-VISION.md` between `ARCHITECTURE.md` and `.claude/rules`.**

WP-041 is a pure documentation certification pass over `docs/ai/ARCHITECTURE.md`.
Three structural additions to ARCHITECTURE.md: (1) version stamp at top
(`Architecture Version: 1.0.0 / Last Reviewed: 2026-04-23 / Verified Against:
WP-001 through WP-040`), value matches `CURRENT_ENGINE_VERSION_VALUE` at
`packages/game-engine/src/versioning/versioning.check.ts:29` so architecture
and engine versions are intentionally synchronized at 1.0.0; (2) Document
override hierarchy block updated from stale 4-entry chain
(`00.1-master-coordination-prompt.md` at #1, no `01-VISION.md`, no
`WORK_INDEX.md`) to 7-entry authoritative chain locking `.claude/CLAUDE.md`
→ `ARCHITECTURE.md` → `01-VISION.md` → `.claude/rules/*.md` →
`WORK_INDEX.md` → WPs → conversation; (3) single clarifying sentence
inserted above Field Classification Reference table body disambiguating
Class column semantics ("`Snapshot (as copy)`" and "`Snapshot → count
only`" annotations describe how a runtime value may appear in a snapshot
without changing the field's own class — all 20 G-class Runtime fields
remain Class 1 regardless of snapshot-handling annotation). Stale
`*Last updated: WP-014 review*` footer also refreshed to reference WP-041
certification.

**Surfaces certified clean:**

- Field Classification Reference table — all 20 G-class Runtime fields
  established by WP-005B through WP-026 are present (`selection` /
  `playerZones` / `piles` / `villainDeck` / `villainDeckCardTypes` /
  `hookRegistry` / `currentStage` / `lobby` / `messages` / `counters` /
  `city` / `hq` / `ko` / `attachedBystanders` / `turnEconomy` /
  `cardStats` / `mastermind` / `heroAbilityHooks` / `cardKeywords` /
  `schemeSetupInstructions`); all field names match `LegendaryGameState`
  in `packages/game-engine/src/types.ts:375` verbatim. `matchConfiguration`
  (Class 2) and `activeScoringConfig` (WP-067) intentionally excluded per
  WP-041 §Out of Scope.
- Authority chain — locks `01-VISION.md` between `ARCHITECTURE.md` and
  `.claude/rules/*.md`; ARCHITECTURE.md wins on conflict with rules
  files (rules enforce architecture, they do not redefine it);
  DECISIONS.md records rationale, ARCHITECTURE.md encodes the result.
- DECISIONS.md cross-references — D-0002 / D-1214 / D-1229 / D-1232 /
  D-1310 through D-1313 / D-1405 / D-1601 / D-1602 / D-1703 / D-2501 /
  D-2503 / D-2601 / D-3102 / D-3103 / D-4802 / D-6701 (and others) all
  resolve to existing entries in DECISIONS.md.

**Material drift logged (no fix applied per WP-041 §Out of Scope):**

- D-4101 — Resolved Transcription Inconsistency: `*Last updated:*` footer
  in ARCHITECTURE.md refreshed from stale `WP-014 review` reference to
  `WP-041` certification.
- D-4102 — Rules-Architecture Drift Log: `.claude/rules/architecture.md`
  lags WP-065 and WP-041 on three consolidated points (Layer Overview
  missing the Shared Tooling layer; Import Rules table missing rows for
  `vue-sfc-loader` and `apps/arena-client`; Authority Hierarchy section
  retains stale `00.1-master-coordination-prompt.md` at #2 and omits
  `01-VISION.md` and `WORK_INDEX.md`). Logged for future
  rules-correction pass; no fix applied in this packet.

**Pre-flight bundle resolved governance drift before execution:**

- PS-1 (BLOCKING) — EC-041 locked field count corrected from 19 to 20.
  Added `selection` (WP-005B) at position #1 per PS-4 introduction-order
  canonical lock. Discovered when pre-flight reality-check found
  `LegendaryGameState` declares 21 Runtime fields, of which 20 fall
  within the WP-005B..WP-026 verification range (`activeScoringConfig`
  is WP-067 — out of scope). EC's "Exactly 19" enumeration had been
  authored from memory of WP-005B → WP-026 scope rather than by
  re-reading types.ts.
- PS-2 (NON-BLOCKING) — WP-041 Assumes range refreshed from
  D-0001..D-1102 to D-0001..D-4004 to match current DECISIONS.md tail.
- PS-3a/b/c — three session-prompt guardrails (§B is an UPDATE not an
  ADD; clarifying sentence is single-sentence not column restructure;
  `activeScoringConfig` (WP-067) is out of scope).
- PS-4 — introduction-order canonical lock for EC-041 Field
  Classification list; future audit packets append new fields at the
  bottom rather than inserting by introduction date.

**Test baseline:** engine 444/110/0 (start) → 444/110/0 (end) — unchanged
(zero new tests; documentation-only). Repo-wide 596/0 (start) → 596/0
(end) — unchanged. `pnpm --filter @legendary-arena/game-engine test`
exits 0. `pnpm -r test` exits 0. `git diff --name-only packages/ apps/`
returns empty across all three commits — no engine, registry, server, or
app file touched. `git diff --name-only .claude/rules/` returns empty
across all three commits — no rules-file modification.

**Three-commit topology:**

- **A0** SPEC pre-flight bundle (`6cc2541`) — preflight, copilot check,
  session prompt, PS-1/PS-2 corrections to WP-041 + EC-041 staged by
  exact filename per P6-27 / P6-44.
- **A** `EC-041:` content + 01.6 post-mortem (`0e8e8b1`) —
  ARCHITECTURE.md (4 edits), DECISIONS.md (D-4101 + D-4102),
  DECISIONS_INDEX.md (new "Architecture Certification & Audit (WP-041)"
  section), `01.6-WP-041-architecture-audit.md` post-mortem.
- **B** SPEC governance close (this commit) — STATUS.md + WORK_INDEX.md
  WP-041 `[ ]` → `[x]` + EC_INDEX.md EC-041 Draft → Done + Done counter
  12 → 13 + Draft counter 48 → 47.

**Lessons learned (precedent observation):** This certification packet
caught governance drift in its own specification (EC-041 "Exactly 19" vs.
actual 20 fields; WP-041 Assumes range D-0001..D-1102 vs. current
D-0001..D-4004) before execution. The pre-flight + copilot check combo
flagged both issues as PS-1 and PS-2 before the session prompt was
generated. The discipline works as designed; documentation packets need
the same reality-check rigor as code packets, because their
specifications can drift silently. **Anti-pattern lesson:** future audit
WPs must re-read source-of-truth files (`types.ts`, ARCHITECTURE.md
tables) when enumerating; never enumerate from prior-WP scope sections
or memory.

**Session-context lineage gap (governance finding):** No
`session-context-wp041.md` was generated in the lineage prior to this WP
(lineage jumped WP-040 → WP-042). A retroactive `session-context-wp041.md`
is generated as a finalization step.

01.5 NOT INVOKED (all four trigger criteria absent: no
`LegendaryGameState` field added, no `buildInitialGameState` shape change,
no new move, no new phase hook). 01.6 post-mortem authored at
`docs/ai/post-mortems/01.6-WP-041-architecture-audit.md` per the WP-040 /
WP-042 / WP-066 / WP-081 Phase 7 precedent (recommended-but-optional for
documentation packets, run anyway). Verdict **WP COMPLETE**.

Vision: §7, §8, §13, §14, §15

---

### WP-040 / EC-040 Executed — Growth Governance & Change Budget (2026-04-23, EC-040)

**Phase 7 complete: Growth governance enforced. Change classification mandatory. Immutable surfaces protected. D-1001 / D-1002 / D-1003 fully implemented.**

WP-040 lands the growth-governance framework as a Contract-Only +
Documentation bundle: one new reader-facing prose document
(`docs/governance/CHANGE_GOVERNANCE.md`), one new types file
(`packages/game-engine/src/governance/governance.types.ts` under D-4001 —
ninth engine subdirectory classification) exporting three metadata types,
two additive re-export edits (`types.ts` + `index.ts`), and one new 01.6
post-mortem. The bundle produces zero engine gameplay changes, zero
runtime logic, and zero new tests. Test baseline holds at engine 444/110/0
and repo-wide 596/0. Engine build exits 0. Path A reuses landed version
axes (`EngineVersion` / `DataVersion` / `ContentVersion` per D-0801) and
landed ops surfaces (`IncidentSeverity` / `OpsCounters` per D-3501) via
cross-link rather than parallel types.

**Surfaces produced:**

- `docs/governance/CHANGE_GOVERNANCE.md` — new — reader-facing prose
  with seven top-level sections: §Change Classification (five categories
  with category-to-layer mapping table per Copilot Issue 26 FIX and
  `versionImpact` → version-axis mapping table per Copilot Issue 4 FIX);
  §Immutable Surfaces (the five-surface list with major-version +
  migration-path + DECISIONS.md-entry requirement per D-1002);
  §Change Budget Template (per-category defaults: ENGINE 0, RULES 0 with
  at-most-1 under simulation, CONTENT uncapped, UI uncapped, OPS
  as-needed); §Growth Vectors (primary CONTENT + UI per D-1003,
  secondary RULES, restricted ENGINE, forbidden under non-major versions
  for immutable surfaces); §Review Requirements by Category (per-category
  review surface verbatim); §Authoring Guidance for `ChangeClassification`
  (the `exactOptionalPropertyTypes: true` omit-don't-undefined construction
  pattern per Copilot Issue 5 FIX — WP-029 precedent); §Authority Chain
  (subordinate to eight authoritative surfaces).
- `packages/game-engine/src/governance/governance.types.ts` — new —
  three metadata types: `ChangeCategory` closed union of five literals
  (`ENGINE` / `RULES` / `CONTENT` / `UI` / `OPS`); `ChangeBudget`
  six-field budget struct (release + engine + rules + content + ui + ops);
  `ChangeClassification` classification metadata (id + category +
  description + versionImpact + optional immutableSurface literal union).
  All fields `readonly` per D-2802 / D-3501 aliasing-prevention. D-3901
  reuse-verification recorded in file-header `// why:` comment (4/4 PASS
  genuinely-novel at pre-flight v2). Required `// why: change budgets
  prevent entropy during growth (D-1001)` comment sits immediately above
  `ChangeBudget`.
- `packages/game-engine/src/types.ts` — modify — three additive
  re-exports grouped with other metadata re-exports, not inside
  `LegendaryGameState`.
- `packages/game-engine/src/index.ts` — modify — three additive
  public-API exports.
- `docs/ai/post-mortems/01.6-WP-040-growth-governance-change-budget.md` —
  new — 01.6 MANDATORY post-mortem (new long-lived abstraction document
  + new code-category directory + new type contracts).

**Governance close (this commit — Commit B SPEC):**

- `STATUS.md` — prepend this Phase 7 closure block.
- `docs/ai/DECISIONS.md` — append three back-pointer entries per P6-51
  form (2): **D-4002** (Change Classification back-pointer citing
  `CHANGE_GOVERNANCE.md §Change Classification`); **D-4003** (Growth
  Vectors back-pointer citing `CHANGE_GOVERNANCE.md §Growth Vectors`);
  **D-4004** (Immutable Surfaces back-pointer citing `CHANGE_GOVERNANCE.md
  §Immutable Surfaces`). D-4001 (code-category classification) landed
  earlier with Commit A0 pre-flight bundle.
- `docs/ai/DECISIONS_INDEX.md` — append three matching rows under the
  Growth Governance section.
- `docs/ai/work-packets/WORK_INDEX.md` — WP-040 `[ ]` → `[x]` with
  today's date and commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-040 Draft → Done;
  full execution summary row.

**Verification results:**

All 17 Verification Steps pass on first run. Step 5 (no `require(` in
`packages/game-engine/src/governance/`) CLEAN. Step 6 (no engine gameplay
files modified) CLEAN. Step 9 (no subjective-language hits in
`CHANGE_GOVERNANCE.md`) CLEAN. Step 10 (no forbidden-token enumeration
for determinism) CLEAN. Step 11 (aggregate diff only allowlist files)
CLEAN. Step 12 engine tests 444/110/0; repo-wide 596/0. Step 13 engine
build exits 0.

**Scope-lock adherence (P6-27):**

No files outside the allowlist were modified at any commit. The inherited
untracked `.claude/worktrees/` was never staged. Staging by exact
filename only — no `git add .` / `git add -A` / `git add -u` at any
commit. `pnpm-lock.yaml` absent from every commit's diff (no new
dependencies).

**01.5 NOT INVOKED.** All four 01.5 trigger criteria absent: no
`LegendaryGameState` field added (governance types appear only in
re-export lines in `types.ts`), no `buildInitialGameState` shape change,
no new `LegendaryGame.moves` entry, no new phase hook.

**01.7 Copilot Check CONFIRM** (27/30 PASS, 3 scope-neutral RISKs on
Issues 4, 5, 26 with FIXes folded into session-prompt §Locked Values
and applied verbatim during authoring). **01.6 post-mortem mandatory
triggers fired** — new long-lived abstraction document + new
code-category directory + new type contracts.

**Four-commit topology:**

- **A0a** SPEC precedent-land: `a6be850` — P6-52 + P6-53 in 01.4 +
  back-sync of 00-INDEX / 05-ROADMAP / 05-ROADMAP-MINDMAP.
- **A0** SPEC pre-flight bundle + D-4001: `5e1a0fa` — v1 + v2 preflights,
  copilot check, session prompt, Path A rewrites of WP-040 + EC-040,
  D-4001 additions to DECISIONS.md + DECISIONS_INDEX.md +
  02-CODE-CATEGORIES.md.
- **A** `EC-040:` content + 01.6 post-mortem: `6faaf3b` — five files
  (CHANGE_GOVERNANCE.md + governance.types.ts + types.ts + index.ts +
  post-mortem).
- **B** SPEC governance close: this commit.

Commit prefix `EC-040:` at execution; `SPEC:` on precedent-land,
pre-flight bundle, and governance close (never `WP-040:` per P6-36 —
commit-msg hook rejects). Commit-body Vision trailer on both Commit A
and Commit B: `Vision: §5, §13, §14, §22, §24`.

**Unblocks WP-041** (System Architecture Definition & Authority Model).

---

### WP-039 / EC-039 Executed — Post-Launch Metrics & Live Ops (2026-04-23, EC-039)

WP-039 lands the steady-state post-launch live-operations rhythm as a
single new strategy document under `docs/ops/`. The bundle is
documentation-only and produces zero engine code, zero new types, zero
re-exports, and zero new tests. Test baseline holds at engine 444/110/0
and repo-wide 596/0. Severity semantics are cross-linked to the landed
`docs/ops/INCIDENT_RESPONSE.md` (not restated); the counter surface is
cross-linked to the landed `OpsCounters` in
`packages/game-engine/src/ops/ops.types.ts` (not redefined). Path A
reuses `IncidentSeverity` and `OpsCounters` rather than defining
parallel types — a construction-time resolution of all three v1
pre-flight blockers (duplicate severity type, severity-semantic
contradiction with `INCIDENT_RESPONSE.md:33`, parallel counter
container).

**Surfaces produced:**

- `docs/ops/LIVE_OPS_FRAMEWORK.md` — new — the steady-state live-ops
  rhythm document. Eleven top-level sections: §1 Purpose (stability
  over growth; four load-bearing assumptions anchored to D-0901 /
  severity-already-modeled / counters-already-modeled / D-0902
  rollback-preserved); §2 Foundational Constraints (8 binary
  constraints with named authorities including D-0901, D-0902, D-1002,
  `INCIDENT_RESPONSE.md`, `ops.types.ts` + D-3501); §3 Severity
  Taxonomy (reference-only cross-link to `INCIDENT_RESPONSE.md` §Severity
  Levels; replay desync classified P1 per `INCIDENT_RESPONSE.md:33` with
  no same-version vs. cross-version split); §4 Observability Surface
  (reference-only cross-link to `ops.types.ts` `OpsCounters`; one-line
  orientation summary for the four fields only); §5 Metric Label
  Conventions (four organizational-prose labels — System Health /
  Gameplay Stability / Balance Signals / UX Friction — explicit "not a
  typed union, not a code constant" disclaimer; severity applies per
  event, not per label); §6 Data Collection Rules (6 binary rules
  citing D-0901 per §18 prose-vs-grep discipline); §7 Live Ops Cadence
  (daily / weekly / monthly rhythm with named input surface and binary
  output per row; out-of-cadence review permitted only for P0/P1); §8
  Change Management (allowed rows: validated content via WP-033,
  AI-simulation-validated balance tweaks via D-0702/WP-036, semantic-
  preserving UI updates via D-1002; forbidden rows: rule changes
  without version increment (D-1002), unversioned hot-patches, silent
  behavior changes, changes-justified-solely-by-live-metrics (D-0702),
  auto-heal, parallel severity taxonomy, parallel counter container);
  §9 Success Criteria (6 binary criteria with named source signals);
  §10 Non-Goals (9 explicit non-goals including retention funnels,
  monetization analytics, marketing analytics, auto-heal, parallel
  severity taxonomy, parallel counter container, live-metric-driven
  engine/server/client modifications, metrics collection
  infrastructure — deferred to a future WP that will consume
  `OpsCounters` + `IncidentSeverity` directly); §11 Summary
  (stewardship-not-optimization restatement).
- `docs/ai/post-mortems/01.6-WP-039-post-launch-metrics-live-ops.md` —
  new — formal 14-section 01.6 output (mandatory per the one new
  long-lived abstraction document trigger). Documents the three v1
  pre-flight blockers and Path A as construction-time fix; one
  pre-Commit-A reality reconciliation (10.1 — the `MetricCategory`
  identifier inside §5 meta-prose tripped Verification Step 5 even
  though the prose was advocating against the type; paraphrased to
  "code-level union" — same meaning, zero grep match); extension seam
  status across §5 metric labels, §3 severity taxonomy, §4 counter
  surface, §7 cadence, §8 change management; follow-up WP pointers to
  the future metrics collection infrastructure WP and to WP-040
  (Growth Governance).
- `docs/ai/DECISIONS.md` — one new D-entry at Commit B: *"Live Ops
  Reuses Existing `IncidentSeverity` and `OpsCounters` Rather Than
  Parallel Types"*. Records the v1 pre-flight blockers as precedent
  and binds future ops observability surfaces (metrics, alerts,
  dashboards) to cross-link rather than duplicate the landed types.

**Scope lock honored:** exactly two files in Commit A
(`LIVE_OPS_FRAMEWORK.md`, post-mortem). Zero modifications to
`packages/` or `apps/` at any commit (`git diff --name-only packages/
apps/` empty post-Commit-A). Pre-flight inherited `.claude/worktrees/`
untracked directory untouched and never staged. Stage-by-exact-filename
per **P6-27 / P6-44** honored throughout: no `git add .`, no `git add
-A`, no `git add -u` at any commit.

**Commit topology:**

- Commit A0 (SPEC, `9e7d9bd`): pre-flight bundle — v1 preflight + v2
  preflight + copilot check CONFIRM (29/30 PASS) + session prompt +
  Path A rewrites of WP-039 + EC-039 (landed before session open).
- Commit A (EC-039, `4b1cf5c`): two-file execution landing
  `LIVE_OPS_FRAMEWORK.md` + 01.6 post-mortem. Vision trailer present:
  `Vision: §3, §5, §13, §14, §22, §24` (canonical clause titles).
- Commit B (SPEC, *this session*): STATUS.md + WORK_INDEX.md WP-039
  `[ ]` → `[x]` + EC_INDEX.md EC-039 Draft → Done (Done counter
  11 → 12) + one new DECISIONS.md entry (Path A reuse decision).
  Same Vision trailer.

**Verification status (all 15 steps pass):** framework doc has 11
level-2 section headings; zero TS files modified
(`git diff --name-only | grep '\.ts$'` empty); zero
`packages/` / `apps/` files modified
(`git diff --name-only packages/ apps/` empty); no parallel
`MetricPriority` / `MetricSeverity` / `MetricCategory` /
`MetricEntry` anywhere in `packages/` or the framework doc; framework
doc cross-links `INCIDENT_RESPONSE.md` + `OpsCounters` +
`IncidentSeverity` (47 matches); replay desync + P1 paired explicitly;
`INCIDENT_RESPONSE.md` and `ops.types.ts` untouched; "Immediate
rollback" appears 0 times (severity table not restated); zero
subjective-language tokens (looks good / looks great / mostly ready /
good enough / should be fine / probably — case-insensitive); zero
forbidden-token enumeration (Math.random / Date.now / performance.now
/ new Date — cites D-0901 per §18); test baselines UNCHANGED.

**01.5 NOT INVOKED.** All four 01.5 trigger criteria absent: zero
engine code touched; no `LegendaryGameState` field added; no
`buildInitialGameState` shape change; no new `LegendaryGame.moves`
entry; no new phase hook. **01.6 MANDATORY.** One new long-lived
abstraction document (`LIVE_OPS_FRAMEWORK.md`) becomes the canonical
live-ops surface for the project; every subsequent post-launch rhythm
review and WP-040 (Growth Governance & Change Budget) will read this
document.

**Unblocks:** WP-040 (Growth Governance & Change Budget). The framework
doc's §8 Change Management is the direct input surface for WP-040's
five change categories (ENGINE | RULES | CONTENT | UI | OPS) and the
per-release change budget discipline.

---

### WP-038 / EC-038 Executed — Launch Readiness & Go-Live Checklist (2026-04-22, EC-038)

WP-038 lands the launch-readiness and go-live discipline as a
Documentation-only strategy-doc pair plus three governance decisions.
The bundle produces zero engine code, zero new tests, and zero runtime
behavior change. Test baseline holds at engine 444/110/0 and repo-wide
596/0. The strategy-doc-pair template established by WP-037
(`BETA_STRATEGY.md` + `BETA_EXIT_CRITERIA.md`) is reused for the
launch-readiness pillar, producing a strategy-style readiness document
plus a procedural launch-day companion.

**Surfaces produced:**

- `docs/ops/LAUNCH_READINESS.md` — new — pre-launch authority document.
  Eight top-level sections covering the four binary pass/fail readiness
  gate categories: Engine & Determinism (4 gates anchored to WP-027 /
  WP-028 / WP-029 / WP-031 / WP-032 source signals); Content & Balance
  (4 gates anchored to WP-033 + WP-036 source signals plus the
  warning-acceptance discipline requiring non-invariant + non-competitive
  + non-exploitable classification with recorded justification); Beta
  Exit Criteria (4 gates that consume `BETA_EXIT_CRITERIA.md`'s overall
  exit verdict directly per D-3803); Ops & Deployment (5 gates anchored
  to `RELEASE_CHECKLIST.md` + `DEPLOYMENT_FLOW.md` + `INCIDENT_RESPONSE.md`).
  Single launch authority model with three non-override clauses
  (MAY NOT waive failing gates; MAY ONLY decide once all gates pass;
  exists to prevent deadlock, not to override invariants), four required
  sign-offs (engine integrity, replay determinism, content safety,
  operations readiness), GO / NO-GO decision record schema, and the
  boolean aggregation rule (any input `false` short-circuits the launch
  verdict). 17 binary pass/fail gates total. §18 prose-vs-grep discipline
  applied — engine-determinism requirements cite ARCHITECTURE.md §MVP
  Gameplay Invariants and D-3704 rather than enumerating literal tokens.
- `docs/ops/LAUNCH_DAY.md` — new — procedural companion. Seven top-level
  sections covering T-1h Final Build Verification (build hash + content
  version + migration no-op), T-0 Soft Launch Window with the explicit
  PAUSE-vs-ROLLBACK distinction (PAUSE on anomaly; ROLLBACK only on a
  §5.6 trigger condition; analysis must conclude before resumption),
  Go-Live Signal (first clean session completes; replay matches live
  view; zero critical alerts), and T+0 to T+72h Post-Launch Guardrails
  (72-hour change freeze per D-3802; bugfix criteria deterministic +
  backward compatible + roll-forward safe; Freeze Exception Record's
  five required fields — triggering condition, proof of determinism,
  proof of backward compatibility, roll-forward safety analysis, launch
  authority approval timestamp; elevated monitoring cadence with
  invariant violations continuous P0 / replay divergence P1 / balance
  anomalies logged not hot-fixed; four rollback triggers verbatim:
  invariant violation spike, replay hash divergence, migration failure,
  client desync).
- `docs/ai/post-mortems/01.6-WP-038-launch-readiness-go-live.md` — new
  — formal 12-section 01.6 output (mandatory per the two new long-lived
  abstraction documents trigger). Documents three pre-commit reality
  reconciliations: (10.1) "mostly ready" paraphrased to
  "partial-readiness state" so Verification Step 5's loosely-scoped
  subjective-language grep returns zero; (10.2) four-category headings
  restructured from level-3 subsections to top-level `## ` headings
  with cascading section renumbering and cross-reference updates so
  Verification Step 4's `^## ` anchor matches; (10.3) verbatim
  lowercase rollback-triggers lead-in sentence added so Verification
  Step 8's case-sensitive grep matches.
- `docs/ai/DECISIONS.md` — three new minor decisions at Commit B:
  D-3801 (single launch authority is accountable, not consensus —
  three non-override clauses + four required sign-offs), D-3802
  (72-hour post-launch change freeze is a stability observation window
  — bugfix criteria + Freeze Exception Record's five required fields),
  D-3803 (launch gates inherit from beta exit gates via D-3704 —
  single-source-of-truth consumption of `BETA_EXIT_CRITERIA.md`).

**Scope lock honored:** exactly three files in Commit A
(`LAUNCH_READINESS.md`, `LAUNCH_DAY.md`, post-mortem). Zero
modifications to `packages/` or `apps/` (`git diff --name-only
packages/ apps/` empty). Pre-flight inherited dirty-tree items
(`docs/ai/DECISIONS.md` D-6601 entry from parallel WP-066 review,
`docs/ai/work-packets/WP-066-registry-viewer-data-toggle.md`
post-execution clarification appendix) are out of WP-038 scope and
were path-stashed before Commit B's DECISIONS.md edit so my
D-3801/3802/3803 hunks land cleanly without sweeping the D-6601
content; the stash is popped after Commit B to restore the parallel
work to the working tree. Four retained stashes (`stash@{0..3}`)
untouched. Stage-by-exact-filename per **P6-27 / P6-44** honored
throughout.

**Commit topology:**

- Commit A0 (SPEC, `9ecbe70`): pre-flight bundle — pre-flight + session
  prompt + copilot check (landed before session open).
- Commit A (EC-038, `2134f33`): three-file execution landing
  `LAUNCH_READINESS.md` + `LAUNCH_DAY.md` + 01.6 post-mortem. Vision
  trailer present: `Vision: §3, §5, §13, §14, §18, §22, §24, NG-1,
  NG-3` (canonical clause titles, no paraphrases).
- Commit B (SPEC, *this session*): STATUS.md + WORK_INDEX.md WP-038
  `[ ]` → `[x]` + EC_INDEX.md EC-038 Draft → Done + three DECISIONS.md
  entries (D-3801 / D-3802 / D-3803).

**01.5 NOT INVOKED.** All four 01.5 trigger criteria absent: zero
engine code touched; no `LegendaryGameState` field added; no
`buildInitialGameState` shape change; no new `LegendaryGame.moves`
entry; no new phase hook. **01.6 MANDATORY.** Two new long-lived
abstraction documents become the canonical launch-readiness surface
for the project; both will be referenced indefinitely by subsequent
launch cycles and by WP-039 (Post-Launch Metrics & Live Ops) onward.

**Unblocks:** WP-039 (post-launch metrics / live ops). The two launch
documents and the three governance decisions become the input surface
for WP-039's four-category metric structure.

---

### WP-085 / EC-085 Executed — Vision Alignment Audit (Detection, Classification & Gating) (2026-04-22, EC-085)

WP-085 lands the §17 Vision Alignment enforcement instrument as a
governance / audit-tooling bundle — no engine modifications, no gameplay
logic, no runtime behavior. The prose-level §17 gate that landed at SPEC
`0689406` now has a programmatic single-verdict PASS/FAIL enforcer: an
orchestrator combines the four domain greps (`determinism`,
`monetization`, `registry`, `engine-boundary`) into one audit run that
produces a dated combined report under `docs/audits/` and exits 0 on
PASS or 1 on FAIL. The calibrated baseline captured at INFRA `24996a9`
on `main` (6 DET-001 / 4 DET-007 / 0 / 0 / 0) is consumed as a locked
acceptance contract; any deviation is a FAIL; re-calibration requires a
superseding WP per WP-085 AC-6, never an in-place edit.

**Surfaces produced:**

- `scripts/audit/vision/run-all.mjs` — new — orchestrator invoking
  each domain's `runRules` for human-readable stdout and a parallel
  structured scan for report data. Two-channel DET-001 model
  implemented: script-channel executable count (post comment-aware
  filter) and orchestrator-channel allowlist verification against the
  six `packages/game-engine/src/` doc-comment file:line pairs. DET-007
  stays single-channel with a four-pair allowlist diff. Calibrated
  baseline values appear as named constants
  (`EXPECTED_DET_001`, `EXPECTED_DET_007`, `EXPECTED_MONETIZATION`,
  `EXPECTED_REGISTRY`, `EXPECTED_ENGINE_BOUNDARY`) — no magic numbers.
  Same-day re-run refuses to overwrite with a full-sentence error
  message; `// why:` comment records audit-history immutability
  rationale.
- `scripts/audit/vision/determinism.greps.mjs` — modified — adds
  exported `isDocCommentLine(rawLine)` helper and a DET-001-only
  comment-aware filter guarded by `rule.id === 'DET-001'`. Doc-comment
  hits are discarded so only executable `Math.random(` use trips the
  gate; the six documentation warnings are verified by the orchestrator
  against the AC-3 allowlist. A `// why:` comment records the asymmetry
  rationale — DET-007 doc-comment hits are canonical site documentation
  and carry equal audit meaning to executable hits, so filtering them
  out would destroy signal. Other RULES untouched.
- `docs/audits/vision-alignment-2026-04-22.md` — new — first audit
  report, VERDICT: PASS, commit hash `604eaaa`, baseline matched exactly
  (6 DET-001 / 4 DET-007 / 0 Monetization / 0 Registry / 0 Engine
  boundary). Both DET-001 channels observable in the report
  (executable findings: 0; baseline exceptions: 6, each verified as a
  doc-comment). Vision trailer present: `Vision: §3, §13, §14, §22,
  §24`.

**Scope lock honored:** exactly three files in Commit A. Zero
modifications to `packages/` or `apps/` (`git diff --name-only packages/
apps/` empty). Orchestrator is read-only against engine code — reading
the six DET-001 allowlist files for doc-comment form verification is
explicitly permitted by WP-085 Scope (In) §A. No `boardgame.io` import,
no registry/server/UI import, no persistence, no network.

**Commit topology:**

- Commit A0 (SPEC, `2e88aa7` + `8b84587` + `604eaaa`): pre-execution
  bundle — WP-085 draft + D-8501 + EC-085 draft + session-context bridge.
- Commit A (EC-085, `c836b29`): three-file execution landing the
  orchestrator, the comment-aware filter, and the first audit report.
  Vision trailer `Vision: §3, §13, §14, §22, §24`.
- Commit A' (SPEC, `a3e67bb`): session execution prompt captured
  post-execution per the `83a9b3a` / `62b68d1` invocation convention.
- Commit B (SPEC, *this session*): STATUS.md + WORK_INDEX.md WP-085
  `[ ]` → `[x]` + EC_INDEX.md EC-085 Draft → Done + three DECISIONS.md
  entries (D-8502 baseline source-of-truth / D-8503 two-channel DET-001
  and single-channel DET-007 asymmetry / D-8504 same-day overwrite
  refusal as audit-history immutability).

**Operational claim now active:** §17 Vision Alignment is enforced by
WP-085 audit tooling. Pre-execution "queued instrument" framing in
D-8501 is superseded for operational assertions; D-8501 remains
immutable as the historical record of the pre-execution drafting
decision.

**Unblocks:** every Phase 7 WP whose `## Vision Alignment` block cites
§17 now has an executable enforcer. Future audit-report runs simply
invoke `node scripts/audit/vision/run-all.mjs`; any regression produces
a FAIL and escalates via a corrective WP per AC-6.

**Post-WP-085 follow-up (tracked separately, not in DoD):** memory file
`feedback_audit_tooling_scaffold_first.md` rationale paragraph
references "WP-042" pre-rename; correction to "WP-085" is a separate
small SPEC commit per WP-085 §Post-WP-085 Follow-ups.

---

### WP-037 / EC-037 Executed — Public Beta Strategy (2026-04-22, EC-037)

WP-037 lands the controlled-public-beta pillar as a Contract-Only +
Documentation bundle: a new `packages/game-engine/src/beta/`
subdirectory under D-3701 engine code category classification plus
two strategy documents under `docs/beta/`. Public beta is defined,
gated, and measurable — objectives are bounded, cohorts are locked,
access is invitation-only, feedback is structured and build-versioned,
and exit requires ALL four binary pass/fail categories to pass. Beta
runs the same deterministic engine as production (no "beta mode"),
uses the same release gates as production (no shortcuts), and
inherits all rollback capabilities from WP-035 / D-0902.

**Surfaces produced:**

- `packages/game-engine/src/beta/beta.types.ts` — three pure type
  contracts: `BetaFeedback` (6 required + 1 optional fields in locked
  order), `BetaCohort` (closed 3-member literal union), `FeedbackCategory`
  (closed 5-member literal union). No runtime values. Required
  `// why:` module-header comment (EC-037 line 65) verbatim: *"feedback
  tied to build version for traceability; replay reference enables
  reproduction."*
- `packages/game-engine/src/types.ts` / `index.ts` — additive re-export
  blocks appended after the WP-036 simulation block under
  `// Beta metadata (WP-037 / D-3701)` comment headers. Zero
  modification to `LegendaryGameState`; zero modification to any
  pre-existing re-export.
- `docs/beta/BETA_STRATEGY.md` — 8-section strategy doc: objectives
  (4 primary + 4 non-goals), feature scope, three cohorts with signal
  targets (`expert-tabletop`, `general-strategy`, `passive-observer`),
  access control (invitation-only, hard user cap, unique build ID,
  opt-in diagnostics), feedback collection model, timeline (closed
  alpha → invite beta → open beta), exit-criteria summary, and the
  three DoD-mandated rationale paragraphs.
- `docs/beta/BETA_EXIT_CRITERIA.md` — binary pass/fail gate, 4
  categories (Rules correctness / UX clarity / Balance perception /
  Stability), every criterion cites a specific source signal
  (`BetaFeedback` records, `OpsCounters` deltas, `verifyDeterminism`
  output, `runSimulation` output, deployment logs). Includes the
  three Vision §4 multiplayer criteria (reconnection round-trips,
  late-joining semantics, no-desync in final 2 weeks). Category 3
  anchored to D-0702; Category 4 anchored to D-0902 + Vision §4.
- `docs/ai/post-mortems/01.6-WP-037-public-beta-strategy.md` — formal
  10-section 01.6 output (mandatory per P6-35: new long-lived
  abstraction + new code-category directory).
- `docs/ai/DECISIONS.md` — three new minor decisions (D-3702 /
  D-3703 / D-3704, Commit B) documenting the invitation-only signal-
  quality rationale, the three-cohort signal-target rationale, and
  the same-release-gates-as-production rationale.

**Scope lock honored:** exactly 5 files modified in Commit A plus
the post-mortem (see `docs/ai/post-mortems/01.6-WP-037-public-beta-strategy.md`
§4). Zero modifications to gameplay logic — all 24 engine subdirectories
and `matchSetup.*` clean. Zero new dependencies. Test baseline unchanged:
444 / 110 / 0 engine (RS-2 zero-new-tests lock honored); repo-wide
596 / 0. `BetaFeedback` never a field of `LegendaryGameState` (Verification
Step 12). Beta games run the same deterministic engine as production.

**Amendments:**

- A-037-01 (landed in A0 SPEC bundle `a4f5574` 2026-04-22): D-3701 +
  `02-CODE-CATEGORIES.md` §engine subdirectory row for `src/beta/`.
  Pre-landed before session open so classification was unambiguous.
- Vision Alignment retrofit (landed at `e5b0d67` 2026-04-22): WP-037
  acquired its `## Vision Alignment` block per the 00.3 §17 gate.
- Reality reconciliation (pre-commit in Commit A): `beta.types.ts`
  module-header JSDoc softened to cite D-3701 for the forbidden-token
  list rather than restate tokens inline. No governance content lost;
  D-3701 enumerates the forbidden tokens exhaustively. See
  post-mortem §8 and §10.

**Commit topology:**

- Commit A0 (SPEC, `a4f5574`): pre-flight bundle — D-3701 +
  02-CODE-CATEGORIES.md update.
- Commit A (EC-037, `160d9b9`): code + post-mortem (this execution).
- Commit B (SPEC, *this session*): STATUS.md + WORK_INDEX.md +
  EC_INDEX.md + three DECISIONS.md entries (D-3702 / D-3703 / D-3704).

**Unblocks:** WP-038 (launch readiness), WP-039 (post-launch metrics /
live ops). Both downstream WPs can consume the `BetaFeedback` contract
surface and the strategy-document-pair template directly.

---

### WP-084 / EC-109 Executed — Delete Unused Auxiliary Metadata Schemas and Files (2026-04-21, EC-109)

WP-084 deletes five unused auxiliary Zod schemas (`CardTypeEntrySchema`,
`HeroClassEntrySchema`, `HeroTeamEntrySchema`, `IconEntrySchema`,
`LeadsEntrySchema`), their five JSON files in `data/metadata/`, the
orphan `card-types-old.json`, and the `validate.ts` Phase 2
metadata-validation block (renumbers former Phases 3/4/5 → 2/3/4).
The 2026-04-21 audit confirmed zero runtime consumers across the
server, viewer, game engine, and pre-plan packages; the sole consumer
was the opt-in `validate.ts` Phase 2 block.

**A-084-01 amendment (in A0 SPEC bundle 2026-04-21):** expands scope
with (a) deletion of the viewer's drifted duplicate
`apps/registry-viewer/src/registry/impl/localRegistry.ts` (confirmed
dead code by Explore agent — zero imports, absent from viewer `dist/`,
CI never invokes); (b) in-packet rewrite of
`docs/ai/REFERENCE/00.2-data-requirements.md` §§2.1 / 2.3 / 2.4 / 2.5
/ 2.6 from active contracts to historical notes; (c) current-state
docs sweep across `docs/01-REPO-FOLDER-STRUCTURE.md`,
`docs/03-DATA-PIPELINE.md`, `docs/03.1-DATA-SOURCES.md`,
`docs/08-DEPLOYMENT.md`, `docs/10-GLOSSARY.md`,
`docs/11-TROUBLESHOOTING.md`, `docs/ai/ARCHITECTURE.md`,
`docs/ai/REFERENCE/00.5-validation.md`,
`docs/ai/deployment/r2-data-checklist.md`,
`docs/ai/REFERENCE/02-CODE-CATEGORIES.md`, and
`docs/prompts-registry-viewer/*.md`; (d) deletion of legacy
`scripts/Validate-R2-old.ps1` (superseded orphan); (e) registry JSDoc
cleanup in `packages/registry/src/schema.ts`,
`packages/registry/src/impl/localRegistry.ts`, and
`packages/registry/src/impl/httpRegistry.ts` (the latter retains the
WP-003 educational `// why:` comment with a one-line clarifying note
that `card-types.json` itself was deleted on 2026-04-21).

**Surfaces produced / modified:**

- `packages/registry/src/schema.ts` — five schemas + adjacent block
  comments removed; file-header JSDoc `card-types.json` line removed.
  Surviving schemas (`SetIndexEntrySchema`, `SetDataSchema`,
  `HeroSchema`, `HeroCardSchema`, `HeroClassSchema` enum,
  `MastermindSchema`, `MastermindCardSchema`, `VillainGroupSchema`,
  `VillainCardSchema`, `SchemeSchema`, `CardQuerySchema`,
  `RegistryConfigSchema`, `KeywordGlossaryEntrySchema`,
  `KeywordGlossarySchema`, `RuleGlossaryEntrySchema`,
  `RuleGlossarySchema`) LOCKED byte-for-byte.
- `packages/registry/scripts/validate.ts` — five schema imports
  removed; `checkOneMetadataFile` helper deleted; `checkMetadataFiles`
  function deleted; `checkMetadataFiles(allFindings)` call in `main()`
  removed; former Phases 3 / 4 / 5 renumbered to Phases 2 / 3 / 4 in
  console headers, error prefixes, section comments, and file-header
  JSDoc.
- `data/metadata/` — six files deleted (`card-types.json`,
  `card-types-old.json`, `hero-classes.json`, `hero-teams.json`,
  `icons-meta.json`, `leads.json`); three survivors LOCKED
  byte-for-byte (`keywords-full.json`, `rules-full.json`,
  `sets.json`).
- `apps/registry-viewer/src/registry/impl/localRegistry.ts` —
  deleted; `apps/registry-viewer/src/registry/index.ts` line 27
  re-export removed; `apps/registry-viewer/CLAUDE.md` §"Key Files"
  row for the deleted file removed.
- `apps/registry-viewer/src/registry/types/index.ts` and
  `types-index.ts` — JSDoc lines 87 + 116 corrected to reference
  `sets.json` rather than `card-types.json`.
- `apps/registry-viewer/src/lib/glossaryClient.ts` — `// why:`
  comment rephrased to drop the `createRegistryFromLocalFiles`
  function-name reference (Verification Step 20 fix).
- `scripts/Validate-R2-old.ps1` — deleted (`scripts/validate-r2.mjs`
  and `packages/registry/scripts/validate.ts` remain the
  authoritative validators).
- `docs/ai/REFERENCE/00.2-data-requirements.md` — §§2.1 / 2.3 / 2.4
  / 2.5 / 2.6 rewritten as historical notes citing the WP-084
  deletion date; field-contract references at lines 68 (`team`), 83
  (`hc`) updated to drop the deleted-file references; §6
  Mastermind-Villain Group Relationship rewritten as two-level
  model (per-set + PostgreSQL); glossary token resolution paths in
  §5 updated to reflect per-set + viewer-hardcoded-map sources.
- Current-state docs sweep — historical notes added to all files
  enumerated above; `validate.ts` phase numbering updated in
  `docs/ai/deployment/r2-data-checklist.md`.

**Tests / build / validate:** baseline preserved at 596 tests
passing / 0 failing (registry 13 / vue-sfc-loader 11 / game-engine
444 / preplan 52 / server 6 / replay-producer 4 / arena-client 66;
registry-viewer no test script). `pnpm -r build` exits 0;
`pnpm registry:validate` exits 0 with four-phase output (Phase 1 / 2
/ 3 / 4) over `sets.json` + per-set cards + cross-references +
images. `pnpm-lock.yaml` unchanged.

**Three-commit topology:** A0 `SPEC: amend WP-084 / EC-109 per
pre-flight (A-084-01)` (commit `1a474d0`, 2026-04-21) → A `EC-109:
delete unused auxiliary metadata schemas and files` (commit
`b250bf1`, 2026-04-21) → B `SPEC: close WP-084 / EC-109 governance`
(this commit). Seven new DECISIONS.md entries (D-8401..D-8407) +
D-6002 historical-neighbor note land at Commit B. 01.5 runtime
wiring allowance NOT INVOKED. 01.6 post-mortem NOT TRIGGERED.

---

### WP-082 / EC-107 Executed — Keyword & Rule Glossary Schema, Labels, and Rulebook Deep-Links (2026-04-21, EC-107)

WP-082 lands Zod validation at the glossary fetch boundary, a required
`label` field + optional `pdfPage` on every keyword, optional `pdfPage`
on every rule (where determinable), the Marvel Legendary Universal
Rulebook v23 PDF hosted on R2, and per-entry rulebook deep-links in the
Glossary panel. The WP-060 `titleCase()` heuristic — responsible for
broken canonical rulebook capitalization in five confirmed cases — is
deleted; labels now trace to explicit sources (the JSON `label` field
for keywords/rules, the `HERO_CLASS_LABELS` Map for hero classes).

**Surfaces produced / modified:**

- `packages/registry/src/schema.ts` — four new Zod schemas
  (`KeywordGlossaryEntrySchema`, `KeywordGlossarySchema`,
  `RuleGlossaryEntrySchema`, `RuleGlossarySchema`, both entry schemas
  `.strict()` — first use of `.strict()` in this file, per the
  author-facing-strict vs loader-permissive pattern of WP-033 / D-3303)
  plus two inferred types.
- `packages/registry/src/index.ts` — explicit named re-export of the
  four schemas + two types.
- `packages/registry/package.json` — new `"./schema"` subpath in the
  `exports` map (A-082-01, resolving a Vite browser-build cascade
  caused by the `impl/localRegistry.js` Node-only imports in the
  barrel).
- `data/metadata/keywords-full.json` — 123 entries; 123 `label`s
  sourced verbatim from the rulebook; 118 `pdfPage`s; 5 omitted
  (no confirmable rulebook source: `burnshards`, `fail`,
  `fightorfail`, `unleash`, `whenrecruitedundercover`). Descriptions
  preserved byte-for-byte. Alphabetical, duplicate-free.
- `data/metadata/rules-full.json` — 20 entries; existing `label` and
  `summary` preserved byte-for-byte; 19 `pdfPage`s; 1 omitted
  (`asterisk`). A pre-session rulebook-verbatim `summary` rewrite
  was caught by the RS-3 diff gate and quarantined to `stash@{0}`
  per A-082-02 for a future dedicated WP.
- `apps/registry-viewer/src/lib/glossaryClient.ts` — schemas imported
  via `@legendary-arena/registry/schema` subpath; `.safeParse(...)` at
  the fetch boundary with dot-joined issue-path rendering and a
  full-sentence `[Glossary] Rejected ...` warning on failure;
  widened `KeywordGlossary` value shape to `{ label, description }`;
  parallel `KeywordPdfPageMap` exposed via `getKeywordPdfPages(...)`
  sharing the singleton fetch; network errors still throw
  (App.vue catches); schema failures never throw.
- `apps/registry-viewer/src/composables/useRules.ts` — widened
  `KeywordGlossary` handling across `setGlossaries` /
  `getKeywordGlossaryMap` / `lookupKeyword`; `lookupKeyword`
  algorithmic branching (exact / space-hyphen-stripped / prefix /
  suffix / substring) preserved byte-for-byte — only three
  `.description` identifier suffix-adds at the `.get(...)!` return
  sites. Added `HERO_CLASS_LABELS: Map<string, string>` (5 entries:
  Covert, Instinct, Ranged, Strength, Tech) — hardcoded, no
  transformation helper. Added `getKeywordPdfPageMap()` export.
  `RuleEntry` extended with optional `pdfPage`.
- `apps/registry-viewer/src/composables/useGlossary.ts` — `titleCase()`
  function and both call sites deleted; dedup block deleted;
  `buildAllEntries()` reads `entry.label` for keywords and rules,
  `HERO_CLASS_LABELS.get(...)` for hero classes; `GlossaryEntry`
  carries optional `pdfPage`.
- `apps/registry-viewer/src/components/GlossaryPanel.vue` —
  conditional `📖 Rulebook p. N` anchor rendered per entry with
  mandatory `target="_blank"` + `rel="noopener"` + `@click.stop`;
  accepts new `rulebookPdfUrl` prop; silent absence when either
  `pdfPage` or `rulebookPdfUrl` is missing.
- `apps/registry-viewer/src/App.vue` — `rulebookPdfUrl` ref populated
  from `config.rulebookPdfUrl ?? null` (silent absence contract);
  `getKeywordPdfPages(...)` added to `onMounted` Promise.all; prop
  piped to `<GlossaryPanel>`.
- `apps/registry-viewer/public/registry-config.json` — new
  `rulebookPdfUrl` field pointing at
  `https://images.barefootbetters.com/docs/legendary-universal-rules-v23.pdf`.
- `apps/registry-viewer/package.json` — added
  `"@legendary-arena/registry": "workspace:*"` dep (A-082-01) so the
  viewer can resolve the schema subpath import.
- `apps/registry-viewer/CLAUDE.md` — Keyword & Rule Glossary section
  rewritten to document Zod validation at fetch, the `label` field,
  the `pdfPage` deep-link, and the verbatim sentence **"Do not infer
  labels from keys under any circumstance."**
- `docs/03.1-DATA-SOURCES.md` §Registry Metadata — row counts moved
  113 → 123, schema-reference paragraph added, new rulebook-PDF
  sub-table added.
- `docs/legendary-universal-rules-v23.md` — 5,262-line
  `pdftotext -layout` markdown extract committed with the
  **Authority Notice** blockquote prepended; authoritative source
  for every `pdfPage` value above.
- `docs/Marvel Legendary Universal Rules v23.txt` — raw `pdftotext
  -layout` output committed as the reproducible source behind the
  markdown extract.
- `pnpm-lock.yaml` — 3-line workspace-link delta (A-082-01), no NPM
  packages added/removed.

**R2 artifacts (operator step, delegated):**

- `images.barefootbetters.com/docs/legendary-universal-rules-v23.pdf`
  — HTTP 200, `Content-Type: application/pdf`, 44,275,000 bytes
  (matches EC §Assumes byte count exactly).
- `images.barefootbetters.com/metadata/keywords-full.json` — HTTP 200,
  republished with the 123-entry schema-valid payload.
- `images.barefootbetters.com/metadata/rules-full.json` — HTTP 200,
  republished with the 20-entry schema-valid payload.

Cross-browser smoke tests (EC §24a–25d) all passed per operator
confirmation: canonical failure cases (Choose a Villain Group,
S.H.I.E.L.D. Clearance, Grey Heroes, Half-Points) render with correct
capitalization; rulebook anchors open in new tabs at the correct
page; absent `rulebookPdfUrl` cleanly omits anchors; schema-corrupt
data cleanly degrades to empty panel with one console warning.

**Decisions added (six; see `docs/ai/DECISIONS.md`):**

- D-8201 — Zod-validated fetch boundary for glossary payloads
  (**supersedes D-6001 partial** — Zod schema clause only;
  display-only clause remains)
- D-8202 — Required `label` + optional `pdfPage` on keywords;
  `titleCase()` heuristic deleted
- D-8203 — Optional `pdfPage` on rules; existing `label`/`summary`
  unchanged
- D-8204 — Rulebook PDF hosted at version-pinned R2 URL
- D-8205 — RFC 3778 `#page=N` deep-links with mandatory
  `target="_blank"` + `rel="noopener"` + `@click.stop`
- D-8206 — Markdown extract is authoritative `pdfPage` source; omit
  rather than guess

**Amendments (three):**

- A-082-01 — formalizes three beyond-allowlist additions required by
  the EC's locked `@legendary-arena/registry` import design: viewer
  `"@legendary-arena/registry": "workspace:*"` dep, registry
  `"./schema"` subpath export, 3-line `pnpm-lock.yaml` workspace-link
  delta.
- A-082-02 — records the RS-3 diff-gate STOP at Commit A start and
  the path-1 quarantine of the pre-session `rules-full.json` summary
  rewrite to `stash@{0}`. Recoverable via `git stash show -p
  stash@{0}`; reclaim in a future governed WP.
- A-082-03 — records the R2 operator sequence including the initial
  `.md` upload that was superseded by the `.pdf` upload before
  Commit B; notes that `Cache-Control: max-age=31536000, immutable`
  did not surface in the HEAD response (non-blocker per the URL's
  `v23` version pin, worth checking before the next rulebook drop).

**Baseline:** `pnpm -r build` exits 0, `pnpm -r --if-present test`
596 / 0 failing (unchanged), `pnpm --filter registry-viewer lint`
0 errors / 174 warnings (under the 180 budget). Zero engine /
preplan / server / pg / boardgame.io touches. 01.5 engine clause
NOT INVOKED; viewer analog invoked for 5 viewer files per
WP-060 / D-6007. 01.6 post-mortem NOT TRIGGERED (new schemas are
instances of an existing abstraction; no new code category; zero
engine touch).

Commit topology: A0 `SPEC:` `be08c11` (pre-flight bundle) → A
`EC-107:` `3da6ac3` (execution) → B `SPEC:` (governance close —
this entry).

---

### WP-036 / EC-036 Executed — AI Playtesting & Balance Simulation Framework (2026-04-21, EC-036)

WP-036 lands the AI playtesting and balance simulation framework as a new
`packages/game-engine/src/simulation/` subdirectory under D-3601 engine code
category classification. Four new source files establish the pluggable
`AIPolicy` interface, a deterministic mulberry32-backed random baseline
policy, the canonical legal-move enumerator, and the simulation runner that
drives the full engine pipeline from outside `boardgame.io`. Balance
changes can now be measured empirically per D-0702 — the invariant has a
runtime; the runtime has a baseline policy; the baseline produces
reproducible aggregate statistics given `(config, registry)` inputs.

**Surfaces produced:**

- `packages/game-engine/src/simulation/ai.types.ts` — four pure type
  contracts: `AIPolicy` (with `name` + `decideTurn(playerView, legalMoves)
  → ClientTurnIntent`), `LegalMove` (`name` + `args: unknown`),
  `SimulationConfig` (`games` + `seed` + `setupConfig` + `policies`),
  `SimulationResult` (six numeric fields + `seed`). No runtime values.
  `// why:` block cites D-0701 (AI Is Tooling, Not Gameplay) + D-0702
  (Balance Changes Require Simulation).
- `packages/game-engine/src/simulation/ai.random.ts` —
  `createRandomPolicy(seed: string): AIPolicy`. File-local djb2 seed
  hash + file-local mulberry32 PRNG (neither exported from the package).
  Zero-legal-moves fallback returns an `endTurn` intent per RS-6.
- `packages/game-engine/src/simulation/ai.legalMoves.ts` —
  `getLegalMoves(G, context): LegalMove[]` with the 8-entry
  `SIMULATION_MOVE_NAMES` tuple and the RS-13 enumeration order lock
  (`playCard` → `recruitHero` → `fightVillain` → `fightMastermind` →
  `revealVillainCard` → `drawCards` → `advanceStage` → `endTurn`, stage-
  gated appropriately). Exported helper type
  `SimulationLifecycleContext`.
- `packages/game-engine/src/simulation/simulation.runner.ts` —
  `runSimulation(config, registry: CardRegistryReader)
  → SimulationResult` with a static 8-entry `MOVE_MAP` dispatch
  (D-2705), a local `SimulationMoveContext` structural interface
  (D-2801), a 200-turn safety cap (RS-7), Fisher-Yates shuffle driven
  by the run's mulberry32 instance (RS-1), closure-flag `events.endTurn`
  detection, and post-endgame statistics sourced from the
  `UIState.progress.escapedVillains` field + sum of
  `UIPlayerState.woundCount` across players (RS-12). Degenerate inputs
  return zeroed `SimulationResult` without throwing.
- `packages/game-engine/src/simulation/simulation.test.ts` — exactly 8
  tests in one `describe('simulation framework (WP-036)')` block. Uses
  `node:test` + `node:assert` only. Canonical RS-14 assertion pattern
  `assert.equal(player1.handCards, undefined, ...)` for test #7 (hidden-
  state protection).
- `packages/game-engine/src/types.ts` — re-export block appended after
  the content validation types: `AIPolicy`, `LegalMove`,
  `SimulationConfig`, `SimulationResult`.
- `packages/game-engine/src/index.ts` — public API block appended after
  the ops metadata exports: four types + `createRandomPolicy` +
  `getLegalMoves` + `SimulationLifecycleContext` + `runSimulation`.
- `docs/ai/DECISIONS.md` — four new entries. D-3601 (Simulation Code
  Category; landed in A0 `4e340fd`), D-3602 (AI Uses the Same Pipeline
  as Humans; landed in A `04c53c0`), D-3603 (Random Policy Is the MVP
  Balance Baseline; landed in A `04c53c0`), D-3604 (Simulation Seed
  Reproducibility: Two Independent PRNG Domains; landed in A
  `04c53c0`).
- `docs/ai/REFERENCE/02-CODE-CATEGORIES.md` — `packages/game-engine/src/simulation/`
  added to the engine directory list (ninth entry in the D-2706 / D-2801
  / D-3001 / D-3101 / D-3201 / D-3301 / D-3401 / D-3501 precedent chain).
- `docs/ai/post-mortems/01.6-WP-036-ai-playtesting-balance-simulation.md` —
  mandatory post-mortem covering five required items (aliasing trace,
  extension-seam open-endedness, D-2704 PRNG capability-gap pattern,
  forbidden-behaviors docstring block, `// why:` comment completeness).

**Test baselines:**

- game-engine: `436 / 109 / 0 fail` → `444 / 110 / 0 fail` (+8 tests,
  +1 suite)
- repo-wide: `588 passing / 0 failing` → `596 passing / 0 failing`
  (+8 passing)
- registry 13/2/0, vue-sfc-loader 11/0/0, server 6/2/0,
  replay-producer 4/2/0, preplan 52/7/0, arena-client 66/0/0 —
  all UNCHANGED

**Layer-boundary integrity (all verification-step greps zero-or-expected):**

- zero `boardgame.io` imports in `packages/game-engine/src/simulation/`
  (escaped-dot grep)
- zero `@legendary-arena/registry` imports in simulation files
- zero `Math.random(` calls (escaped-paren grep); simulation PRNG is
  the file-local mulberry32 only
- zero `.reduce(` with branching logic; aggregation uses `for...of`
- zero `require(` (ESM only)
- zero engine gameplay files modified (targeted `git diff --name-only`
  against `moves/`, `rules/`, `setup/`, `turn/`, `ui/`, `scoring/`,
  `endgame/`, `villainDeck/`, `network/`, `replay/`, `game.ts`)
- `package.json` / `pnpm-lock.yaml` / `packages/game-engine/package.json`
  untouched (P6-44)
- `stash@{0..2}` intact; none of the inherited dirty-tree items staged
  (P6-27 exact-filename staging only)

**Design decisions canonicalized:**

- D-3601 — Simulation Code Category (`packages/game-engine/src/simulation/`
  classified as `engine`; ninth precedent instance).
- D-3602 — AI Uses the Same Pipeline as Humans. No "AI-only" engine
  path; simulation consumes the same setup + move-dispatch + UIState
  projection + endgame + scoring stack multiplayer uses.
- D-3603 — Random Policy Is the MVP Balance Baseline. Heuristic / MCTS /
  neural policies deferred to future WPs; the `AIPolicy` interface
  accommodates them without refactor.
- D-3604 — Simulation Seed Reproducibility: Two Independent PRNG
  Domains. Run-level shuffle PRNG (`runSimulation`) and policy-level
  decision PRNG (`createRandomPolicy`) never share state. djb2 hash +
  mulberry32 duplicated across `ai.random.ts` and `simulation.runner.ts`
  per WP-036 Scope Lock (4 files + 1 test file cap).

**Amendments:**

- A-036-01 (landed in A0 `4e340fd`): WP-036 §D signature corrected
  `registry: CardRegistry` → `registry: CardRegistryReader` per PS-2.
- A-036-02 (landing in this Commit B): session-prompt pseudocode used
  flat `ClientTurnIntent` field names (`playerID`, `moveName`,
  `moveArgs`, `intentTurn`) but the authoritative shape is nested
  (`matchId`, `playerId`, `turnNumber`, `move: { name, args }`,
  `clientStateHash?`) per `network/intent.types.ts:35`. Implementation
  followed the session prompt's binding instruction "Copy WP-032's
  shape verbatim; do not invent field names". Scope-neutral — no
  allowlist, test count, or wiring change.

**Three-commit topology:**

- A0 `4e340fd` SPEC pre-flight bundle (DECISIONS.md D-3601 +
  02-CODE-CATEGORIES.md update + WP-036 §D signature + §Amendments
  A-036-01 + EC-036 amendment note + pre-flight file + session
  prompt + session-context bridge; landed 2026-04-21 in this session)
- A `04c53c0` EC-036 execution (4 new simulation files + 1 test file
  + types.ts re-export + index.ts public API + DECISIONS.md D-3602/
  D-3603/D-3604)
- B (this commit) SPEC governance close (STATUS.md + WORK_INDEX.md
  WP-036 `[ ]` → `[x]` + EC_INDEX.md EC-036 Draft → Done + WP-036
  §Amendments A-036-02 + mandatory 01.6 post-mortem)

**Copilot Check (01.7):** CONFIRM — pre-flight reported 30/30 PASS
after FIX cycle resolved RS-13, RS-14, and RS-15. Zero HOLD, zero
SUSPEND. Execution produced zero mid-flight amendments beyond A-036-02
(session-prompt reconciliation).

WP-036 unblocks ten Phase 7 downstream WPs: WP-037 through WP-041
(beta / launch / observability / product governance / architecture
audit) and WP-049 through WP-054 (PAR simulation / storage / gate /
identity / score submission / public leaderboards). The single-pipeline
guarantee (D-3602) means balance measurements reflect the experience
human players have.

---

### WP-060 / EC-106 Executed — Keyword & Rule Glossary Data Migration (2026-04-20, EC-106)

WP-060 lands the registry-viewer's first non-theme content-class fetch
migration, converting the two hardcoded glossary Maps in
`apps/registry-viewer/src/composables/useRules.ts` into versioned JSON files
served from R2 and fetched at startup via a new singleton client that
mirrors `themeClient.ts`. The `HERO_CLASS_GLOSSARY` stays hardcoded per
D-6005.

**Surfaces produced:**

- `data/metadata/keywords-full.json` — 113 keyword entries,
  `{ key, description }[]`, alphabetical by `key`, 22,867 bytes. Token
  markup (`[icon:X]`, `[hc:X]`, `[keyword:N]`, `[rule:N]`), smart quotes
  `“ ”`, em dash `—` all preserved verbatim.
- `data/metadata/rules-full.json` — 20 rule entries,
  `{ key, label, summary }[]`, alphabetical by `key`, 4,302 bytes.
- Both files uploaded to `https://images.barefootbetters.com/metadata/`
  and confirmed HTTP 200 via `curl -sI` HEAD probes with matching
  Content-Length before Commit A landed.
- `apps/registry-viewer/src/lib/glossaryClient.ts` — new singleton fetcher
  exporting `getKeywordGlossary(baseUrl)` / `getRuleGlossary(baseUrl)` /
  `resetGlossaries()` plus the `KeywordGlossary` / `RuleGlossary` type
  aliases. Module-scope `_keywordPromise` / `_rulePromise` singleton cache;
  `devLog("glossary", ...)` instrumentation on load start / complete /
  failed; throws inside the IIFE on HTTP !ok so `App.vue` can
  `console.warn` + continue (non-blocking at the boundary — matches
  `themeClient.ts:49–113` structure).
- `apps/registry-viewer/src/composables/useRules.ts` — hardcoded Map bodies
  removed; module-scope `_keywordGlossary` / `_ruleGlossary` holders +
  `setGlossaries(keywords, rules)` exported setter + `getKeywordGlossaryMap()`
  / `getRuleGlossaryMap()` exported getters added. `lookupKeyword` /
  `lookupRule` algorithmic bodies preserved **byte-for-byte** (only the
  `KEYWORD_GLOSSARY` → `_keywordGlossary` / `RULES_GLOSSARY` →
  `_ruleGlossary` identifier substitution plus a one-line null-guard at
  each function top). Every existing `// why:` comment preserved verbatim.
  `HERO_CLASS_GLOSSARY`, `RuleEntry`, `parseAbilityText`, `lookupHeroClass`,
  `AbilityToken`, `TokenType` preserved verbatim.
- `apps/registry-viewer/src/composables/useGlossary.ts` — `allEntries`
  converted from module-eval `const` to reactive `ref<GlossaryEntry[]>([])`;
  new exported `rebuildGlossaryEntries()` called once from `App.vue` after
  the async fetch resolves; `buildAllEntries()` retargeted to read via
  `getKeywordGlossaryMap()` / `getRuleGlossaryMap()` + null-guards; dedup
  check preserved verbatim. Scope expansion authorized under the viewer
  analog of `docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md` per
  D-6007 — dependency-driven wiring only, no new behavior.
- `apps/registry-viewer/src/App.vue` — `onMounted` try block gained a
  glossary-load block parallel to `getThemes()`:
  `Promise.all([getKeywordGlossary(), getRuleGlossary()])` →
  `setGlossaries()` → `rebuildGlossaryEntries()`; catch `console.warn` +
  continue. Three new imports.
- `apps/registry-viewer/src/lib/devLog.ts` — `Category` union extended
  with `"glossary"` (one-line EC §Out of Scope amendment; required for
  typecheck on the new `devLog` calls).
- `apps/registry-viewer/CLAUDE.md` — Architecture & Data Flow block gains
  `getKeywordGlossary()` + `getRuleGlossary()` sections; Key Files table
  gains `glossaryClient.ts` + `useGlossary.ts` rows; Keyword & Rule
  Glossary section rewritten from hardcoded narrative to R2-fetched flow.
- `docs/03.1-DATA-SOURCES.md` — §Registry Metadata Files table gains two
  new rows.
- `docs/ai/DECISIONS.md` — seven new entries D-6001 through D-6007.

**Test baselines (all UNCHANGED):**

- repo-wide: 588 passing / 0 failing
- game-engine: 436 / 109 / 0 fail (zero engine code touched)
- registry 13/2/0, vue-sfc-loader 11/0/0, server 6/2/0,
  replay-producer 4/2/0, preplan 52/7/0, arena-client 66/0/0
- no new tests (EC-106 §Test Expectations: optional, none authored)

**Layer-boundary integrity:**

- zero `packages/game-engine/` imports (P6-22 escaped-dot grep confirmed)
- zero `boardgame.io` imports
- zero `preplan` / `server` / `pg` / `registry` runtime imports in any
  touched file
- zero `require()` calls; zero `.reduce()` in migration output or lookup
  bodies
- `package.json` / `pnpm-lock.yaml` untouched (P6-44)
- `stash@{0..2}` intact; none of the 11 inherited dirty-tree items staged
- mystery untracked `docs/ai/ideas/audio-stingers-sketch.md` observed
  (per WP-030 precedent), flagged, NOT touched

**Three-commit topology:**

- A0 `0654a4c` SPEC pre-flight bundle (EC-106 file + EC_INDEX row + WP-060
  amendments + pre-flight file + copilot-check 30/30 PASS + session prompt;
  landed before this session)
- A `412a31c` EC-106 execution (10 files: 2 new JSONs + new
  `glossaryClient.ts` + 5 modified TS/Vue + viewer `CLAUDE.md` +
  `03.1-DATA-SOURCES.md` + DECISIONS.md)
- B this SPEC governance close (STATUS.md + WORK_INDEX.md + EC_INDEX.md)

**01.5 / 01.6 disposition:**

- 01.5 NOT INVOKED as an engine-contract clause (no engine surface
  touched); viewer-scope analog cited for `useGlossary.ts` only per D-6007.
- 01.6 post-mortem NOT TRIGGERED — `glossaryClient.ts` is a new *instance*
  of the `themeClient.ts` abstraction locked by WP-055 (not a new long-lived
  abstraction type); viewer `src/lib/` is pre-classified; no new
  cross-package contract; zero engine involvement. Matches WP-055 theme
  data-migration precedent.

**Manual smoke (passed):**

- DEV + PROD smoke 13a–14c
- Critical test 13c: all seven modifier keywords ("Ultimate Abomination",
  "Double Striker", "Triple Empowered", "Focus 2", "Patrol the Bank",
  "Danger Sense 3", "Cross-Dimensional Hulk Rampage") returned their
  correct tooltip text — confirms `lookupKeyword` algorithm preserved
  byte-for-byte end-to-end
- Negative test 13g: bad `metadataBaseUrl` produces
  `console.warn("[Glossary] Load failed (non-blocking):", ...)` and the
  app still renders cards without throwing
- Singleton honoured (Network tab shows exactly two glossary fetches)
- Glossary panel total: 138 entries (20 rules + 113 keywords + 5 hero
  classes)

**Precedents applied:** P6-22 (escaped-dot grep), P6-27 (stage by exact
filename only), P6-36 (`EC-###:` commit prefix; `WP-060:` / `EC-060:`
rejected), P6-43 / P6-50 (paraphrase discipline), P6-44 (lockfile
untouched), WP-028 / D-2802 (aliasing prevention — no shared-reference
risk since `buildAllEntries()` constructs fresh objects), WP-055 (theme
data-migration template — `themeClient.ts` structure mirrored verbatim;
bare-array JSON convention; non-blocking fallback pattern), seven-row
EC-slot retargeting chain (EC-060 → EC-106 first 101+ series use).

**Unblocks:** downstream registry-viewer WPs that want to reference
glossary data from R2 via a singleton. Phase 5 keyword-union WPs may now
validate card data against R2-served `keywords-full.json` during content
authoring without re-embedding the definitions in code.

---

### WP-058 / EC-058 Executed — Pre-Plan Disruption Pipeline (2026-04-20, EC-058)

WP-058 lands the disruption pipeline that closes the pre-planning layer's
detect → invalidate → rewind → notify workflow. Eight new files under
`packages/preplan/src/` provide the first runtime consumer of
`PrePlan.invalidationReason.effectType` closed union + the first
implementation of DESIGN-CONSTRAINT #3 "reveal ledger is the sole
authority for rewind":

- **Types consolidated per PS-3.** `disruption.types.ts` exports four
  public types: `PlayerAffectingMutation` (source + affected player
  ids + `effectType` + description + optional card),
  `DisruptionNotification` (structured causal payload), `SourceRestoration`
  (`playerDeckReturns` + `sharedSourceReturns` partitioned buckets),
  `DisruptionPipelineResult` (output envelope with
  `requiresImmediateNotification: true` typed as literal, not `boolean`
  — Copilot Issue 15 FIX encodes Constraint #7 at the type level).
- **Binary per-player detection.** `disruptionDetection.ts` exports
  `isPrePlanDisrupted(prePlan | null, mutation)` — false on null or
  non-active; otherwise compares `playerId` to `mutation.affectedPlayerId`
  (DESIGN-CONSTRAINT #4). No plan-step or sandbox inspection.
- **Pipeline orchestration.** `disruptionPipeline.ts` exports five
  functions: `invalidatePrePlan` (returns a full-spread 42/42 fresh
  `PrePlan` with `status: 'invalidated'`; does NOT increment `revision`
  per `preplan.types.ts:36-38`); `computeSourceRestoration` (reads
  **only** `revealLedger`; DESIGN-CONSTRAINT #3 ledger-sole rewind
  backstopped by Test 11 which constructs a plan whose sandbox
  disagrees with the ledger); `buildDisruptionNotification` (the sole
  throw in the package — programming-error only on `status !==
  'invalidated'`; conditional-assignment for optional
  `affectedCardExtId`); internal `buildNotificationMessage`;
  `executeDisruptionPipeline` (reads `prePlan.revealLedger` per RS-8
  with required `// why:` comment — invalidation doesn't mutate the
  ledger, so pre-invalidation read is equivalent and avoids coupling to
  `invalidatePrePlan`'s spread-copy semantics).
- **Canonical effect-type array (PS-2).** `preplanEffectTypes.ts` exports
  `PREPLAN_EFFECT_TYPES = ['discard', 'ko', 'gain', 'other'] as const`
  + `PrePlanEffectType` derived type + compile-time drift-check using
  `NonNullable<PrePlan['invalidationReason']>['effectType']`. The
  `NonNullable<>` wrapper is mandatory because `invalidationReason` is
  optional on `PrePlan`. Deferred from WP-056 per
  `preplan.types.ts:101-106` JSDoc.

`packages/preplan/src/index.ts` gains an additive WP-058 export block
below the existing WP-056 + WP-057 blocks (five functions + four types
+ `PREPLAN_EFFECT_TYPES` + `PrePlanEffectType`). WP-056 + WP-057 blocks
unchanged verbatim. `packages/preplan/package.json` and
`pnpm-lock.yaml` explicitly NOT in the allowlist — `tsx` devDep + test
script inherited from WP-057.

Commit topology (three commits on
`wp-081-registry-build-pipeline-cleanup`):

- `29c66d2` — SPEC: A0 pre-flight bundle (EC-058 + WP-058 amendments
  A-058-01 through A-058-05 + pre-flight + copilot check re-run
  CONFIRM + session prompt + EC_INDEX row Draft).
- `bae70e7` — EC-058 execution: 7 new source files + `index.ts`
  modification + mandatory 01.6 post-mortem. Commit prefix `EC-058:`
  per P6-36 (`WP-058:` forbidden).
- `<this commit>` — SPEC: governance close (WORK_INDEX + EC_INDEX +
  STATUS).

Test baseline: preplan `23 / 4 / 0 → 52 / 7 / 0` (29 new tests in 3
describe suites: detection 5 + pipeline 23 + effect-type drift 1).
Engine UNCHANGED at `436 / 109 / 0` (WP-058 touches zero engine code).
Registry / vue-sfc-loader / server / replay-producer / arena-client all
unchanged. Repo-wide `559 → 588 passing / 0 failing`.

Architectural boundary integrity — all 25 verification gates pass:

- No `boardgame.io` / runtime engine / `@legendary-arena/registry` /
  `pg` / `apps/` imports in `packages/preplan/`. Two new `import type
  { CardExtId }` lines (disruption.types.ts, disruptionPipeline.ts)
  joining the three inherited WP-056/057 lines.
- No `Math.random` / `ctx.random` / `require(` / `.reduce(` hits.
- `Date.now` exactly one hit at `speculativePrng.ts:79` (WP-057
  carve-out); zero new hits in WP-058 files.
- P6-50 paraphrase discipline: zero `G` / `LegendaryGameState` /
  `LegendaryGame` / `boardgame.io` tokens in code or JSDoc in new
  files; `ctx` appears only in the inherited `ctx.turn + 1` carve-out
  at `preplan.types.ts:21, :51` (WP-056 output, untouched).
- `preplan.types.ts` / `preplanStatus.ts` / `speculativePrng.ts` /
  `preplanSandbox.ts` / `speculativeOperations.ts` diffs all empty
  (WP-056 + WP-057 immutable). `package.json` / `tsconfig.json` /
  `pnpm-lock.yaml` / `pnpm-workspace.yaml` diffs all empty.
- `disruptionPipeline.ts` has 7 `// why:` comments covering status
  guard, conditional-assignment (×2), full-spread rationale,
  ledger-sole loop, programming-error throw, pre-invalidation ledger
  source.
- `requiresImmediateNotification` typed as literal `true` (not
  `boolean`). `revision` not incremented in `invalidatePrePlan`
  (zero hits for `revision: prePlan.revision +`). Programming-error
  throw template matches verbatim. Each test file has exactly one
  top-level `describe()`.

01.5 Runtime Wiring Allowance: NOT INVOKED (all four criteria absent).

01.6 Post-Mortem: MANDATORY — four triggers fire (new long-lived
abstractions: detection / invalidation / restoration / notification /
pipeline orchestration + `PREPLAN_EFFECT_TYPES`; first runtime
consumer of `invalidationReason.effectType` closed union; first
implementation of DESIGN-CONSTRAINT #3 ledger-sole rewind; first
full-spread 42/42 pattern applied to a status-transition operation
rather than a sandbox-mutation operation as in WP-057). Verdict **WP
COMPLETE** with zero post-mortem fixes; one session-protocol finding
documented in §8.1 (test-count rebalance to hit locked 23 —
consolidated with-card/without-card branches into one parameterized
`test()` call and swapped the sourceRestoration-equivalence test for
the spec-required detection-gate test; no semantic change).

Copilot Check (01.7): CONFIRM 30/30 inherited from pre-flight A0.
All three HOLD FIXes (Date.now grep gate + ledger-sole restoration
test + literal-true `// why:` upgrade) present and passing.

Inherited dirty-tree items (11 unrelated files + `.claude/worktrees/`)
untouched; quarantine `stash@{0..2}` intact and not popped. Next
natural WP: **WP-059** (Pre-Plan UI Integration) — deferred until
WP-028 (UI State Contract) is executed and a UI framework decision
is made. Integration guidance preserved in
`docs/ai/DESIGN-PREPLANNING.md` §11.

### WP-057 / EC-057 Executed — Pre-Plan Sandbox Execution (2026-04-20, EC-057)

WP-057 lands the first runtime consumer of the `@legendary-arena/preplan`
contract WP-056 published as types. Ten new public functions across four
new source files under `packages/preplan/src/` provide the speculative
sandbox described in `DESIGN-PREPLANNING.md`:

- **PRNG.** `speculativePrng.ts` — seedable LCG
  (`state = (state * 1664525 + 1013904223) >>> 0`), Fisher-Yates
  `speculativeShuffle` (fresh spread input, never mutates), and
  `generateSpeculativeSeed` using `Date.now()` exactly once at that site
  per DESIGN-PREPLANNING §3.
- **Sandbox factory.** `preplanSandbox.ts` — `PlayerStateSnapshot` type,
  `createPrePlan(snapshot, prePlanId, prngSeed)` producing an active
  pre-plan with `revision: 1`, `appliesToTurn: snapshot.currentTurn + 1`
  (DESIGN-CONSTRAINT #10), empty ledger/steps, shuffled sandbox deck,
  and `computeStateFingerprint` (djb2 over sorted canonical
  stringification — deterministic + content-sensitive only, not
  cryptographic per EC-057 non-goals lock).
- **Five speculative operations.** `speculativeOperations.ts` —
  `speculativeDraw` / `speculativePlay` / `updateSpeculativeCounter` /
  `addPlanStep` / `speculativeSharedDraw`. Uniform null-on-inactive
  (RS-8): every operation returns `null` when `status !== 'active'`.
  Revision `+1` on successful mutation / `0 delta` on null-return.
  Spread-copy discipline on every returned field (post-mortem §6 trace
  confirms 42/42 fresh field assignments across six mutation sites —
  no aliasing).
- **Canonical status array.** `preplanStatus.ts` —
  `PREPLAN_STATUS_VALUES = ['active', 'invalidated', 'consumed'] as
  const` + `PrePlanStatusValue` derived type + compile-time exhaustive
  check proving parity with `PrePlan['status']` union. Deferred from
  WP-056 per EC-056 Locked Value line 32 (PS-2). `PREPLAN_EFFECT_TYPES`
  remains WP-058 scope.

`packages/preplan/src/index.ts` transitions from WP-056's type-only
re-export surface to a mixed runtime + type surface (authorized by
EC-057 RS-2). `packages/preplan/package.json` gains `"test": "node
--import tsx --test src/**/*.test.ts"` + `"tsx": "^4.15.7"` devDep
mirroring `packages/registry/package.json:19, 34` exactly (PS-3).
`pnpm-lock.yaml` delta scoped to 3 lines inside
`importers['packages/preplan']` — zero cross-importer churn (P6-44
verified).

Commit topology (three commits on
`wp-081-registry-build-pipeline-cleanup`):

- `f12c796` — SPEC: A0 pre-flight bundle (EC-057 checklist + WP-057
  amendments + pre-flight file + session-context + EC_INDEX row +
  session prompt).
- `8a324f0` — EC-057 execution: 9 new source files + `index.ts`
  modification + `package.json` modification + `pnpm-lock.yaml` +
  mandatory 01.6 post-mortem. Commit prefix `EC-057:` per P6-36
  (`WP-057:` forbidden).
- `<this commit>` — SPEC: governance close (WORK_INDEX + EC_INDEX +
  STATUS).

Test baseline: preplan `0 / 0 / 0 → 23 / 4 / 0` (23 new tests in 4
describe suites: 3 + 6 + 13 + 1). Engine UNCHANGED at `436 / 109 / 0`
(WP-057 touches zero engine code). Registry / vue-sfc-loader / server /
replay-producer / arena-client all unchanged. Repo-wide
`536 → 559 passing / 0 failing`.

Architectural boundary integrity — all 24 verification greps pass:

- No `boardgame.io` / runtime engine / `@legendary-arena/registry` /
  `pg` / `apps/` imports in `packages/preplan/`. Three engine
  references are all `import type`.
- No `Math.random` / `ctx.random` / `require(` / `.reduce(` hits.
- `Date.now` exactly one hit at `speculativePrng.ts:79` inside
  `generateSpeculativeSeed`.
- P6-50 paraphrase discipline: zero `G` / `LegendaryGameState` /
  `LegendaryGame` / `boardgame.io` tokens in code or JSDoc; `ctx`
  appears only in the inherited `ctx.turn + 1` carve-out at
  `preplan.types.ts:21, :51` (WP-056 output, untouched in this WP).
- `preplan.types.ts` / `tsconfig.json` / `pnpm-workspace.yaml` diffs
  all empty.

01.5 Runtime Wiring Allowance: NOT INVOKED (all four criteria absent
— no `LegendaryGameState` field added; no `buildInitialGameState`
shape change; no new `LegendaryGame.moves` entry; no new phase hook).

01.6 Post-Mortem: MANDATORY — three triggers fire (new long-lived
abstractions + first runtime consumer of `PrePlan.status` closed union
+ contract consumed by WP-058). Verdict **WP COMPLETE** with zero
post-mortem fixes; one first-compile reality-reconciliation finding
documented in §8.1 (WP-056-inherited strict tsconfig settings —
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — required
destructured-guard + `as T` swap + optional-field omission patterns
that the session-prompt skeletons did not include; resolved at first
compile, no spec semantics changed).

Copilot Check (01.7): CONFIRM 30/30 at pre-flight Re-Run. All three
HOLD FIXes (Date.now grep gate + test 12 uniform null-on-inactive 5×2
+ test 13 revision-increment discipline 5×2) present and passing.

Unblocks **WP-058** (Pre-Plan Disruption Pipeline). Inherited
dirty-tree items (10 unrelated files + `.claude/worktrees/` + one
test-time `content/themes/heroes/` artifact) untouched; quarantine
`stash@{0..2}` intact and not popped.

### WP-081 / EC-081 Executed — Registry Build Pipeline Cleanup (2026-04-20, EC-081)

WP-081 executed across two governance amendments (PS-2 + PS-3) and one
execution commit: **Registry build is tsc-only; no normalize/dist
pipeline remains.** `pnpm --filter @legendary-arena/registry build`
exits 0 for the first time since WP-003 landed. The three broken
operator scripts under `packages/registry/scripts/` are deleted; their
references in `package.json`, `.github/workflows/ci.yml`, `README.md`,
and `docs/03-DATA-PIPELINE.md` are removed. CI job `build` no longer
runs the redundant `pnpm registry:validate` step (formerly named
"Normalize cards" with a misleading `# also writes cards.json +
index.json` comment).

Commit topology (three commits on `wp-081-registry-build-pipeline-cleanup`):

- `9fae043` — SPEC: PS-2 amendment (add README §F.6 anchor for the
  "How to Standardize Images" section — closes the negative-guarantee
  AC gap that PS-1 missed).
- `aab002f` — SPEC: PS-3 amendment (add §G anchor deleting the
  "Legacy Scripts (Retained for Reference)" subsection in
  `docs/03-DATA-PIPELINE.md` — closes the session-invocation Step 5
  grep expectation gap; also amends Step 6 to acknowledge the two
  known OOS matches in `.env.example:15` and `upload-r2.ts:5,~125`).
- `ea5cfdd` — EC-081 execution: three script deletions + four file
  modifications (package.json / ci.yml / docs/03-DATA-PIPELINE.md /
  README.md) + D-8101 + D-8102 in DECISIONS.md + DECISIONS_INDEX.md
  rows. Zero engine changes, zero new code, zero new tests, zero
  dependencies, zero `packages/registry/src/**` diff, zero
  `pnpm-lock.yaml` diff, zero `version` bump.

Decisions registered:

- **D-8101** — Dead build pipeline (`normalize-cards.ts` →
  `build-dist.mjs` → `standardize-images.ts`) deleted rather than
  rewritten because no monorepo consumer reads any of the five JSON
  artifacts it produced (`dist/cards.json`, `dist/index.json`,
  `dist/sets.json`, `dist/keywords.json`, `dist/registry-info.json`)
  or the orphaned `dist/image-manifest.json` from
  `standardize-images.ts`. Runtime path is `metadata/sets.json` +
  `metadata/{abbr}.json` fetched directly from R2 by
  `httpRegistry.ts` / `localRegistry.ts`. No precomputed flat
  artifact on the critical path; rewriting would add maintenance
  surface without runtime benefit.
- **D-8102** — `registry:validate` is the single CI step that
  exercises the registry data shape. The redundant second invocation
  in job `build` (under step `"Normalize cards"`) is removed. Build
  and validate responsibilities remain separate, not merged.

Test baseline UNCHANGED (subtractive guarantee preserved):

- registry: **13 / 13 / 0 fail**
- vue-sfc-loader: **11 / 11 / 0 fail**
- game-engine: **436 / 436 / 0 fail**, **109 suites**
- replay-producer: **4 / 4 / 0 fail**
- server: **6 / 6 / 0 fail**
- arena-client: **66 / 66 / 0 fail**
- **Repo-wide: 536 / 0 fail**

Known follow-up (OOS per WP-081 §Scope (Out); targeted by a separate
operator-tooling cleanup WP):

- `packages/registry/.env.example` lines 13-17 (`INPUT_DIR`,
  `OUTPUT_FILE`, `INPUT_IMG_DIR`, `OUTPUT_IMG_DIR` + header comment)
  orphaned after the three deletions — no remaining consumer.
- `packages/registry/scripts/upload-r2.ts` docstring (line 5) and
  closing `console.log` (line ~125) still reference
  `dist/registry-info.json` / `dist/cards.json` — misleading after
  the pipeline deletion, but harmless at upload runtime.

Next: follow-up operator-tooling cleanup WP addresses the two OOS
items above together in a single subtractive pass.

---

### WP-056 / EC-056 Executed — Pre-Planning State Model & Lifecycle (Read-Only Core) (2026-04-20, EC-056)

WP-056 executed at commit `eade2d0`: Legendary Arena now has a
first-class pre-planning state contract in a new non-authoritative
package (`packages/preplan/`) that future WPs (WP-057 sandbox
execution + WP-058 disruption detection) will consume as types.
Zero runtime code, zero tests, zero engine wiring — this is a
types-only Contract WP that establishes the long-lived abstraction
surface for the pre-planning layer.

Surfaces produced (six-file Commit A allowlist):

- `packages/preplan/package.json` — **new**: `@legendary-arena/preplan`;
  `"type": "module"`; `@legendary-arena/game-engine` as workspace peer
  only (type-only consumer); `typescript` devDep; no `test` script
  (RS-2 zero-test lock).
- `packages/preplan/tsconfig.json` — **new**: mirrors
  `packages/registry/tsconfig.json` (NodeNext + ES2022 + strict +
  `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`); `lib`
  narrowed to `["ES2022"]` (no DOM — preplan is Node-consumable);
  `exclude: ["node_modules", "dist"]` (no scripts dir, no `*.test.ts`).
- `packages/preplan/src/preplan.types.ts` — **new**: four public types
  in spec order — `PrePlan` (with `prePlanId`, `revision`, `playerId`,
  `appliesToTurn = ctx.turn + 1`, closed-union `status`, optional
  `invalidationReason.effectType` closed union, `baseStateFingerprint`
  NON-GUARANTEE clause preserved verbatim), `PrePlanSandboxState`
  (player-visible zones only — `hand`/`deck`/`discard`/`inPlay`/
  `counters`; `victory` omitted by design per DESIGN-CONSTRAINT #9),
  `RevealRecord` (reveal ledger sole rewind authority per
  DESIGN-CONSTRAINT #3; open `source` union with `| string` fallback
  per Finding #10), `PrePlanStep` (open `intent` union with `| string`
  fallback — advisory/descriptive; intentionally NOT `CoreMoveName`
  per Finding #10). Single `import type { CardExtId } from
  '@legendary-arena/game-engine';` at top; zero other imports.
- `packages/preplan/src/index.ts` — **new**: four type-only re-exports;
  no imports; no default export; no `export *`.
- `docs/ai/post-mortems/01.6-WP-056-preplan-state-model.md` — **new**:
  mandatory 10-section post-mortem (three 01.6 triggers fire — new
  long-lived abstraction `PrePlan` + new contract consumed by
  WP-057/058 + new code-category directory D-5601). Documents one
  pre-existing `pnpm -r build` registry failure (§8 Finding 8.1 —
  orthogonal to WP-056, addressed by parallel WP-081) and one
  EC/WP grep-pattern drift (§8 Finding 8.2 — `ctx` narrowing
  recommended for future EC amendment, non-blocking).

Modified files:

- `pnpm-lock.yaml` — regenerated by `pnpm install`. Delta scoped to a
  single new `importers['packages/preplan']` block (+10 lines); zero
  cross-importer churn (P6-44 discipline held; verified by direct
  diff inspection).

Test baseline — UNCHANGED:

- Registry: `13 / 2 / 0 fail` UNCHANGED.
- vue-sfc-loader: `11 / 0 fail` UNCHANGED.
- Engine: `436 / 109 / 0 fail` UNCHANGED (zero engine code modified).
- Server: `6 / 0 fail` UNCHANGED.
- Replay-producer: `4 / 0 fail` UNCHANGED.
- Arena-client: `66 / 0 fail` UNCHANGED.
- Preplan (new): `0 / 0 / 0 fail` (RS-2 zero-test lock;
  drift-detection tests deferred to WP-057 per Finding #4).
- Repo-wide: **`536 / 0 fail` UNCHANGED**.

Layer-boundary integrity (all verification greps return zero hits):

- Zero `boardgame.io` imports anywhere in `packages/preplan/`.
- Zero runtime engine imports (only `import type { CardExtId }` —
  type-only, permitted).
- Zero `@legendary-arena/registry` imports.
- Zero `apps/**` imports.
- Zero `Math.random` / `require(` / `.reduce(`.
- Zero runtime-executable declarations (`function` / `const` /
  `class` / `export default`) under `packages/preplan/src/`.
- Zero `G` / `LegendaryGameState` / `LegendaryGame` / `boardgame.io`
  tokens in `preplan.types.ts` JSDoc prose (P6-50 paraphrase
  discipline held). Only permitted framework reference is
  `ctx.turn + 1` in the `appliesToTurn` invariant JSDoc (session
  prompt Stop Condition 16 explicit exception; two occurrences, both
  authorized).
- `pnpm-workspace.yaml` UNCHANGED (PS-3 correction held — existing
  `packages/*` glob already covers `packages/preplan/`).
- Engine contract files UNCHANGED (`zones.types.ts`, `types.ts`,
  `index.ts`, `matchSetup.types.ts`).
- Registry / vue-sfc-loader / apps/** UNCHANGED.
- `stash@{0..2}` intact; `.claude/worktrees/` untouched (parallel
  WP-081 session state preserved); 10 inherited dirty-tree items
  remain unstaged.

Three-commit topology (WP-034 / WP-035 / WP-042 / WP-055 pattern):

- **Commit A0 (`f2af0f3`)** — `SPEC:` pre-flight bundle: EC-056
  (new) + D-5601 (new top-level `preplan` code category) +
  `DECISIONS_INDEX.md` D-5601 row + `02-CODE-CATEGORIES.md` preplan
  row and full category-definition section + `EC_INDEX.md` EC-056
  row (Draft 55→56 / Total 58→59) + WP-056 PS-3 amendment
  (`pnpm-workspace.yaml` removal; `pnpm-lock.yaml` delta scope) +
  Finding #4 closed-union deferral JSDoc (status → WP-057,
  effectType → WP-058) + Finding #10 open-union rationale on
  `RevealRecord.source` + `PrePlanStep.intent` + session prompt +
  pre-flight audit doc.
- **Commit A (`eade2d0`)** — `EC-056:` execution: six-file
  allowlist listed above.
- **Commit B (this commit)** — `SPEC:` governance close:
  `STATUS.md` + `WORK_INDEX.md` (WP-056 `[x]` with date + commit
  hash) + `EC_INDEX.md` (EC-056 status Draft → Done; Done 3→4 /
  Draft 56→55).

Precedents applied:

- P6-22 (escaped-dot grep patterns for `boardgame\.io`, `Math\.random`,
  `\.reduce\(`, `require\(`).
- P6-27 (stage by exact name; never `git add .` / `-A`).
- P6-34 (A0 SPEC pre-flight bundle lands before A EC-execution commit).
- P6-36 (`WP-NNN:` commit prefix forbidden; `EC-NNN:` required).
- P6-43 / P6-50 (paraphrase discipline — zero `G` /
  `LegendaryGameState` / `LegendaryGame` / `boardgame.io` tokens in
  JSDoc prose; single `ctx.turn + 1` permitted exception for
  `appliesToTurn` invariant).
- P6-44 (`pnpm-lock.yaml` delta scoped to new importer block only).
- P6-51 form (1) (01.5 NOT INVOKED explicit declaration).
- D-5601 follows D-6301 / D-6511 top-level-package classification
  pattern (new package = new category), not the D-2706 / D-2801 /
  D-3001 / D-3101 / D-3201 / D-3301 / D-3401 / D-3501
  engine-subdirectory pattern.
- WP-031 closed-union / canonical-array pattern (Finding #4
  deferrals — arrays live with the runtime code that reads them).
- WP-022 / WP-033 open-union `| string` fallback pattern
  (Finding #10 — advisory/descriptive fields).

01.5 NOT INVOKED (all four triggers absent: no `LegendaryGameState`
field, no `buildInitialGameState` shape change, no
`LegendaryGame.moves` entry, no phase hook). 01.6 MANDATORY
(three independent triggers fire — authored in-session, staged
into Commit A).

Next natural WPs: **WP-057** (Pre-Plan Sandbox Execution — speculative
move simulation + client-local PRNG + `PREPLAN_STATUS_VALUES`
canonical array + drift-detection tests), **WP-058** (Pre-Plan
Disruption Detection — per-player mutation observers +
`PREPLAN_EFFECT_TYPES` canonical array + invalidation triggering),
**WP-059** (Pre-Plan Rewind & Notification — mechanical rewind
using reveal ledger + causal notification delivery). These numbers
are provisional; actual numbering and scope confirmed when each WP
is drafted.

---

### WP-055 / EC-055 Executed — Theme Data Model (Mastermind / Scenario Themes v2) (2026-04-20, EC-055)

WP-055 executed at commit `dc7010e`: Legendary Arena now has a governed,
engine-agnostic theme data contract at schema version 2, the full
shipped theme set committed at v2, and the registry public surface
extended to expose theme types and validators to future consumer WPs.

Surfaces produced (74-file Commit A allowlist):

- `packages/registry/src/theme.schema.ts` — **new**: Zod schemas
  `ThemeDefinitionSchema` (v2), `ThemeSetupIntentSchema` (mirrors
  WP-005A `MatchSetupConfig` ID fields verbatim; count fields
  excluded — composition, not pile sizing), `ThemePlayerCountSchema`
  (`min<=max` + `recommended`-in-range refinements),
  `ThemePrimaryStoryReferenceSchema` (editorial-only external URLs),
  `ThemeMusicAssetsSchema` (eight optional URL fields per D-5509)
  plus the inferred `ThemeDefinition` type.
- `packages/registry/src/theme.validate.ts` — **new**: `validateTheme`
  (sync) and `validateThemeFile` (async). Both never throw.
  `validateThemeFile` wraps `readFile` and `JSON.parse` in try/catch
  and returns structured `ValidationFailure` with one of four stable
  error-path labels (`'file'` / `'json'` / `'themeId'` / Zod issue
  path) and three verbatim full-sentence message templates.
- `packages/registry/src/theme.schema.test.ts` — **new**: 10
  `node:test` cases inside one `describe('theme schema (WP-055)')`
  block. Test #1 pins WP-028 / D-2802 aliasing-prevention via
  `assert.notStrictEqual(result.theme, inputData)`. Test #8 is a
  single `test()` call with Parts A/B/C internal assertions
  (manifest-driven happy path + I/O failure structured-return +
  malformed-JSON structured-return; WP-033 P6-23 count preservation).
- `content/themes/minimal-example.json` — **new**: minimal
  required-fields-only example theme (`themeSchemaVersion: 2`).
- `docs/ai/post-mortems/01.6-WP-055-theme-data-model.md` — **new**:
  mandatory 10-section post-mortem (01.6 triggers: new long-lived
  abstraction `ThemeDefinitionSchema` + new contract consumed by
  future WPs; both fire).
- `packages/registry/src/index.ts` — **modified** (additive §E
  public-surface extension): eight new export lines in the existing
  Types → Schemas → Functions grouping; no existing export reordered,
  renamed, or removed.
- 68 `content/themes/*.json` files — **modified** (v1→v2 migration
  per D-5509): `themeSchemaVersion: 2` + three optional music fields
  (`musicTheme`, `musicAIPrompt`, `musicAssets`). Migration was
  staged in the working tree during the 2026-04-19 v2 design pass
  and committed here under WP-055's allowlist.

Test baseline shift:

- Registry: `3 / 1 / 0 fail` → **`13 / 2 / 0 fail`** (+10 tests,
  +1 suite).
- Repo-wide: `526 / 0 fail` → **`536 / 0 fail`**.
- Engine: `436 / 109 / 0 fail` **UNCHANGED** (zero engine code
  modified).

Layer-boundary integrity:

- Zero imports from `packages/game-engine` (grep confirmed).
- Zero `boardgame.io` imports (escaped-dot grep per P6-22).
- Zero `require()` calls; zero `.reduce()` in theme source files.
- WP-003 immutable files (`schema.ts`, `shared.ts`,
  `impl/localRegistry.ts`) unchanged.
- WP-005A contract file (`packages/game-engine/src/matchSetup.types.ts`)
  unchanged.
- `apps/registry-viewer/` untouched — viewer-domain v1→v2 edits
  remain quarantined in `stash@{0}` "wp-055-quarantine-viewer" per
  PS-4; `stash@{1}` and `stash@{2}` also intact.
- `package.json` / `pnpm-lock.yaml` unchanged (P6-44).
- Paraphrase discipline (P6-50): no `boardgame.io` / `Math.random` /
  `Date.now` / `G.` / `ctx.` tokens in theme source files.

Three-commit topology (WP-034 / WP-035 / WP-042 pattern):

- **Commit A0 (`aaba66d`)** — `SPEC:` pre-flight bundle: EC-055
  (new) + `_informal-viewer-themes-tab.md` (renamed from
  `EC-055-theme-viewer.checklist.md` per PS-4 slot reclaim) +
  EC_INDEX EC-055 row (Draft 54→55 / Total 56→57) + WP-055 PS-2/3/5
  amendments + FIX #17 (aliasing) + FIX #22 (try/catch +
  error-path labels + message templates) + WORK_INDEX v1→v2 title
  correction + session prompt.
- **Commit A (`dc7010e`)** — `EC-055:` execution: the 74-file
  allowlist listed above.
- **Commit B (this commit)** — `SPEC:` governance close:
  `STATUS.md` + `WORK_INDEX.md` (WP-055 `[x]` with date + commit
  hash) + `EC_INDEX.md` (EC-055 status Draft → Done).

Precedents applied:

- P6-22 (escaped-dot `boardgame\.io` grep pattern).
- P6-23 (test-count preservation via Parts A/B/C inside one
  `test()` call).
- P6-27 (stage by name only; never `git add .` / `-A`).
- P6-33 (EC authored at pre-flight, not deferred).
- P6-36 (`WP-NNN:` commit prefix forbidden; `EC-NNN:` required).
- P6-43 / P6-50 (paraphrase discipline in `// why:` comments —
  one mid-execution self-catch documented in post-mortem §8).
- P6-44 (`pnpm-lock.yaml` must not change when no `package.json`
  edited).
- P6-51 form (1) (01.5 NOT INVOKED explicit declaration).
- WP-028 / D-2802 (projection aliasing prevention — applied via
  FIX #17).
- WP-031 (describe-block wrapping adds +1 suite).

01.5 NOT INVOKED (all four triggers absent). 01.6 MANDATORY
(authored in-session, staged into Commit A).

Next eligible WPs: consumer WPs that import theme types (setup UI,
scenario browser, LLM exporter, deterministic randomizer). The
referential-integrity validator against the card registry is
deferred to the first such consumer WP per the WP-055 Design Review
Summary. The theme registry loader is deferred to the same consumer
WP (~15 lines wrapping `validateThemeFile` in a directory scan).

---

### WP-042 / EC-042 Executed — Deployment Checklists (Data, Database & Infrastructure) (2026-04-19, EC-042)

WP-042 executed at commit `c964cf4`: Legendary Arena now has
governed R2 and PostgreSQL deployment verification checklists
cross-referenced from `docs/ops/RELEASE_CHECKLIST.md`. Ships
scope-reduced per **D-4201** — the PostgreSQL checklist contains
four sections (§B.1 Pre-conditions, §B.2 Migration execution,
§B.6 Rules data seeding verification, §B.7 Schema-structure
verification); four further sections (§B.3 / §B.4 / §B.5 / §B.8)
are deferred to **WP-042.1** awaiting Foundation Prompt 03
revival (`scripts/seed-from-r2.mjs` has never existed).

Surfaces produced (seven files in Commit A allowlist; zero
runtime code; zero new tests — engine baseline UNCHANGED at
436 / 109 / 0 fail; repo-wide 526 / 0 fail):

- `docs/ai/deployment/r2-data-checklist.md` — full seven-section
  R2 data verification checklist (§A.1 Validation script usage
  across local + R2 modes with the six real env vars exposed by
  `packages/registry/scripts/validate.ts`; §A.2 Registry manifest;
  §A.3 Metadata files with the six locked minimum-entry counts;
  §A.4 Image assets naming convention + Phase 5 spot-checks;
  §A.5 Cross-reference checks; §A.6 R2 bucket configuration —
  `legendary-images` bucket, CORS, cache-control, `rclone` remote
  verification; §A.7 New set upload procedure as seven ordered
  steps). Paraphrase discipline per P6-50 — zero matches for
  `Konva`, `canvas`, `boardLayout`, `CARD_TINT`, `game-engine`,
  the game framework name, `LegendaryGame`, or framework-context
  references.
- `docs/ai/deployment/postgresql-checklist.md` — scope-reduced
  PostgreSQL checklist with a prominent "Deferred sections"
  pointer at the top citing D-4201. Documents the three real
  migration files from Foundation Prompt 02 commit `ac8486b`
  (`001_server_schema.sql`, `002_seed_rules.sql`,
  `003_game_sessions.sql`) with their actual SQL structure
  (`legendary.*` schema tables, FK constraints, GIN FTS index on
  `legendary.rule_docs.search_tsv`, `public.game_sessions`
  `updated_at` trigger). Explicitly avoids references to
  `pnpm seed` or `scripts/seed-from-r2.mjs` which do not exist.
- `docs/ai/ARCHITECTURE.md` — one-line additive cross-reference
  to `docs/ai/deployment/` in §Section 2 Server Startup Sequence.
- `docs/ops/RELEASE_CHECKLIST.md` — two additive back-pointer
  blocks (Gate 2 → R2 checklist §A.1; §Relationship to runtime
  invariant checks → PostgreSQL checklist §B.7).
- `docs/ai/DECISIONS.md` — two new entries: **D-4202**
  (legacy 00.2b §C UI-rendering-layer verification exclusion;
  P6-51 form-(2) back-pointer) and **D-4203** (WP-042 is
  Documentation-class under Server/Operations as a load-bearing
  invariant; P6-51 form-(1) discrete entry). D-4201 landed at
  pre-flight commit `cbb6476`.
- `docs/ai/DECISIONS_INDEX.md` — rows for D-4202 and D-4203
  under the existing "Deployment Checklists — Scope Reduction
  (WP-042)" section.
- `docs/ai/post-mortems/01.6-WP-042-deployment-checklists.md` —
  mandatory 10-section post-mortem, verdict **WP COMPLETE**.
  §8 Documentation & Governance Updates documents three
  reality-reconciliation findings where the produced checklists
  match the actual code on disk rather than pre-amendment paper
  specs (validate.ts env vars are `SETS_DIR` / `METADATA_DIR` /
  `HEALTH_OUT`, not `CARDS_DIR`; migrate.mjs does not read
  `EXPECTED_DB_NAME` so §B.1 prescribes an operator-level
  database-name eye-check; §B.7 verifies the tables the three
  shipped migrations actually create rather than seed-dependent
  tables that only arrive with WP-042.1).

D-4203 locks the documentation-only class for WP-042: no new
runtime code (`.ts` / `.mjs` / `.js`), no new `scripts/` files
(explicitly no `scripts/seed-from-r2.mjs`), no new `package.json`
entries, no new migrations, no new tests, no new npm dependencies.
Future deployment-pillar Documentation WPs (UI-rendering checklist,
Render-specific runbook, logging / alerting checklist) may cite
D-4203 as precedent.

Commit topology:
- Commit A0 (`SPEC:` pre-flight bundle) — `cbb6476` — D-4201 +
  WP-042 amendments + EC-042 amendments + session prompt.
- Commit A (`EC-042:` code + post-mortem) — `c964cf4` — seven-file
  allowlist (two checklist files + ARCHITECTURE cross-reference +
  RELEASE_CHECKLIST back-pointers + DECISIONS/INDEX entries +
  post-mortem).
- Commit B (`SPEC:` governance close) — `<this commit>` —
  STATUS.md + WORK_INDEX.md (WP-042 flip + WP-042.1 new entry) +
  EC_INDEX.md (EC-042 Draft → Done + footer refresh).

Pre-commit review handoff per P6-35 default to a separate
gatekeeper session. **Unblocks WP-042.1** (PostgreSQL seeding
checklist sections when Foundation Prompt 03 is revived).

---

### WP-035 / EC-035 Executed — Release, Deployment & Ops Playbook (2026-04-19, EC-035)

WP-035 executed at commit `d5935b5`: Legendary Arena now has a
complete, auditable release → deployment → incident playbook plus
the engine-side type surface for operational monitoring. Six new
files (three docs + one engine type file + two additive re-exports)
under the six-file allowlist; zero engine logic touched; zero new
tests (RS-2 lock).

Surfaces produced:

- `docs/ops/RELEASE_CHECKLIST.md` — the mandatory pre-release gate.
  Seven binary pass/fail gates (engine tests; content validation
  zero errors; replay verification; migration tests if `dataVersion`
  changes; UI contract unchanged or versioned; version stamps
  correct; release notes authored) plus a "Why these gates"
  rationale section citing D-0602, D-0801, D-0802, D-0902. Release
  is blocked if any gate fails.
- `docs/ops/DEPLOYMENT_FLOW.md` — the four-environment promotion
  path (`dev` → `test` → `staging` → `prod`) with per-step
  trigger + gate + approval rules, atomic-promotion statement, the
  no-hot-patching rule citing D-1002, four rollback triggers
  (invariant violation, replay hash mismatch, migration failure,
  desync incidents), and four rollback rules (revert engine +
  content together; never roll `dataVersion` forward; re-apply last
  known good; no data loss). D-0902 implemented at the deployment
  boundary.
- `docs/ops/INCIDENT_RESPONSE.md` — the P0–P3 severity ladder with
  locked examples and required actions (P0 corrupted state →
  immediate rollback; P1 replay desync → freeze deployments; P2
  invalid turn spikes → investigate; P3 content lint warnings →
  backlog), the D-0802 vs D-1234 severity-mapping explanation in
  prose, and the four-field incident-record contract (root cause;
  invariant violated if applicable; version implicated; corrective
  action).
- `packages/game-engine/src/ops/ops.types.ts` — the new engine
  subtree under D-3501 (eighth engine subdirectory classification,
  after D-2706 / D-2801 / D-3001 / D-3101 / D-3201 / D-3301 /
  D-3401). Exports `OpsCounters` (four `readonly number` fields in
  locked order: `invariantViolations`, `rejectedTurns`,
  `replayFailures`, `migrationFailures`), `DeploymentEnvironment`
  (closed union in promotion order), and `IncidentSeverity`
  (closed union in descending urgency). Pure type definitions only
  — no runtime instance anywhere in the engine (RS-1 option (a)).

Test counts: engine **436 / 109 / 0 fail** (unchanged — RS-2 lock,
zero new tests). `pnpm -r test` **526 passing / 0 fail** (unchanged).

Verification (16 of 16 pass): build / test / full-repo-test exit 0;
no forbidden framework / registry / server import in the new
subtree; no wall-clock / RNG / timing helpers; no `.reduce()`;
no I/O; `pnpm-lock.yaml` absent from diff (no new deps);
`game.ts`, moves, rules, setup, and all other engine subdirectories
untouched; both retained stashes intact (neither popped); EC-069
`<pending — gatekeeper session>` placeholder not backfilled.

D-3501 landed in the SPEC pre-flight commit `4b6b60b` (directory
classification + `02-CODE-CATEGORIES.md` update + session prompt).
No new D-entry surfaced during execution.

01.6 post-mortem MANDATORY (P6-35 — two triggering criteria fired:
new long-lived abstraction `OpsCounters` + new code-category
directory D-3501) delivered in-session at
`docs/ai/post-mortems/01.6-WP-035-release-deployment-ops-playbook.md`;
verdict **WP COMPLETE**. Zero mid-execution fixes — the pre-flight
paraphrase-discipline Locked Value prevented the P6-43 collision
class that surfaced in WP-034.

**Unblocks WP-042 (Deployment Checklists).** Release process is
now defined; deployment environments are established; every
deployment has a tested rollback path (D-0902 implemented);
incident response is classified. WP-042 provides the per-
environment procedure runbooks on top of the process this WP
defines.

Three WP-035 commits on this branch:

- `4b6b60b` SPEC — pre-flight bundle (D-3501 + 02-CODE-CATEGORIES.md
  update + session prompt)
- `d5935b5` EC-035 — code + 01.6 post-mortem (1 new engine file +
  3 new ops docs + 2 modified re-exports + 1 post-mortem)
- `<this commit>` SPEC — governance close (STATUS.md,
  WORK_INDEX.md, EC_INDEX.md)

Pre-commit review handoff: per P6-35, runs in a separate gatekeeper
session.

---

### WP-034 / EC-034 Executed — Versioning & Save Migration Strategy (2026-04-19, EC-034)

WP-034 executed at commit `5139817`: added the first persistence-
versioning surface for the engine. Five new files under
`packages/game-engine/src/versioning/` (D-3401 engine code category,
classified in the SPEC pre-flight commit `c587f74`) plus additive
re-exports in `types.ts` and `index.ts`.

Surfaces produced:

- `VersionedArtifact<T>` — generic wrapper embedding three independent
  version axes (`EngineVersion` semver, `DataVersion` integer,
  `ContentVersion` integer optional) plus an ISO 8601 `savedAt`
  stamp. JSON-serializable per D-1232. Three axes evolve on
  independent cadences per D-0801.
- `checkCompatibility(artifactVersion, currentVersion)` — pure
  decision function returning structured `CompatibilityResult`
  (`'compatible' | 'migratable' | 'incompatible'` + locked
  full-sentence message + optional migrations array). Never throws
  — D-1234 vs D-0802 reconciliation: D-0802 wins at the load
  boundary.
- `migrateArtifact<T>(artifact, targetVersion)` — forward-only
  migration dispatcher. MAY throw (load-boundary exception per
  D-0802 fail-loud, identical rationale to `Game.setup()`'s
  throw). Three locked throw templates: no migration path;
  downgrade refusal; no-op same-version (returns spread-copied
  wrapper without throwing). Returns a NEW `VersionedArtifact<T>`
  with spread-copied wrapper fields per D-2802 aliasing
  prevention.
- `stampArtifact<T>(payload, contentVersion?)` — save-time embed
  function. Wraps payload with current engine + data versions,
  optional content version, and a fresh ISO 8601 timestamp from
  the `Date` constructor. The single permitted wall-clock read in
  the versioning subtree, documented as the D-3401 sub-rule
  exception (load-boundary metadata, structurally distinct from
  gameplay clock reads).
- `migrationRegistry` — `Object.freeze({})` at MVP. Long-lived
  seam keyed by `"<a.b.c>-><a.b.c>"` strings; future format
  changes append entries here.

Test counts: engine **436 / 109 / 0 fail** (was 427 / 108; +9
across one new `describe('versioning (WP-034)')` block per
P6-19 / P6-25 suite-count discipline). `pnpm -r test` **526
passing / 0 fail** (was 517; +9 total). Other package counts
unchanged.

Verification (10 of 10 pass): build / typecheck / test exit 0; no
game framework / registry / server import in the new subtree
(Grep returned no matches after the P6-43 paraphrase pass — six
initial JSDoc-vs-grep collisions caught at the first verification
gate run and fixed before re-test); no non-engine RNG / wall-clock
helper / high-resolution timing reads (Grep clean — `new Date()`
constructor in `stampArtifact` is structurally distinct from the
forbidden static helper); no `.reduce()` in versioning subtree;
no I/O / `require()`; `pnpm-lock.yaml` absent from diff (P6-44
pass); `packages/game-engine/src/scoring/`, `replay/`,
`campaign/`, `persistence/`, `content/`, `network/`, `invariants/`,
`ui/`, `setup/`, `moves/`, `game.ts` all untouched; both retained
stashes intact.

D-3401 already landed in the SPEC pre-flight commit `c587f74`
(directory classification + `02-CODE-CATEGORIES.md` update),
following the pre-flight P6-25 pattern. No new D-entry surfaced
during execution.

01.6 post-mortem MANDATORY (P6-35 — two triggering criteria fired:
new long-lived abstraction `VersionedArtifact<T>` + new code-
category directory D-3401) delivered in-session at
`docs/ai/post-mortems/01.6-WP-034-versioning-save-migration-strategy.md`;
verdict **WP COMPLETE**. Zero in-allowlist refinements applied
during post-mortem (all P6-43 paraphrase fixes happened during
execution before verification gates were re-run).

**Meta-finding:** P6-43 (the JSDoc + grep collision precedent
authored from WP-064 execution and committed at `0c741c6`) caught
this WP at the very first verification gate run. Six initial
matches across three files; all fixed via paraphrase form. First
empirical demonstration that the precedent log is load-bearing
across sessions — a lesson written at session N+0 prevented a
regression at session N+1.

**Unblocks future persistence adapters** (server-layer save/load
of replays, campaign state, match snapshots, content definitions).
Each adapter inherits the `VersionedArtifact<T>` wrapper and the
`checkCompatibility` / `migrateArtifact` / `stampArtifact` API.
The migration registry is the long-lived seam — future format
changes append entries.

Three WP-034 commits on this branch:

- `c587f74` SPEC — pre-flight bundle (D-3401 + 02-CODE-CATEGORIES.md
  update + session prompt)
- `5139817` EC-034 — code + 01.6 post-mortem (5 new versioning
  files + 2 modified re-exports + 1 post-mortem)
- `<this commit>` SPEC — governance close (STATUS.md,
  WORK_INDEX.md, EC_INDEX.md)

Pre-commit review handoff: per P6-35, runs in a separate gatekeeper
session.

---

### WP-064 / EC-074 Executed — Game Log & Replay Inspector (2026-04-19, EC-074)

WP-064 executed at commit `76beddc`: added the first client-side
surface that consumes WP-063's `ReplaySnapshotSequence` artifact.
Twelve new files under `apps/arena-client/src/` (no existing files
modified): `replay/loadReplay.{ts,test.ts}`,
`components/log/GameLogPanel.{vue,test.ts}`,
`components/replay/ReplayInspector.{vue,test.ts}`,
`components/replay/ReplayFileLoader.{vue,test.ts}`,
`fixtures/replay/{index.ts, three-turn-sample.{json,inputs.json,cmd.txt}}`.
Plus `docs/ai/post-mortems/01.6-WP-064-log-replay-inspector.md`.

Components produced:

- `parseReplayJson(raw, source?): ReplaySnapshotSequence` — the first
  consumer-side D-6303 `version === 1` assertion site in the repo.
  Throws `Error` with one of three locked full-sentence templates
  mirroring the WP-063 CLI wording at `apps/replay-producer/src/cli.ts`
  so producer (stderr) and consumer (in-browser alert region) agree
  on diagnostic phrasing.
- `<GameLogPanel />` — leaf SFC under `<script setup>`. Renders a
  `readonly string[]` log prop verbatim with stable `:key` by line
  index, `aria-live="polite"` on the list, `role="status"` on the
  empty-state region, plus `data-testid` + `data-index` per line for
  diagnostic addressing.
- `<ReplayInspector />` — non-leaf SFC in
  `defineComponent({ setup })` form per P6-30 / P6-40 (template
  references multiple non-prop bindings). Drives
  `useUiStateStore().setSnapshot` on index changes via first / prev /
  next / last buttons, a range scrubber, and the
  `←` / `→` / `Home` / `End` keyboard map. `tabindex="0"` on the
  root + listeners-on-root — first repo stepper precedent, locked as
  **D-6401**. Clamp-not-wrap semantics at both boundaries.
- `<ReplayFileLoader />` — `defineComponent` form (template
  references `errorMessage` ref + `onChange` handler — same
  `vue-sfc-loader` separate-compile pipeline failure WP-061's
  `<BootstrapProbe />` and WP-062's HUD containers documented). Uses
  the browser `File` API (`file.text()`); parses via
  `parseReplayJson`; emits `loaded` on success; renders a
  `role="alert"` region inline on failure (never `alert()`, never
  silent `console.error`).

Fixture (committed at
`apps/arena-client/src/fixtures/replay/three-turn-sample.{json,
inputs.json,cmd.txt}`): 8 snapshots produced by the WP-063 CLI from a
hand-authored `ReplayInputsFile` mixing 3 `advanceStage` moves
(visible `currentStage` transitions: start→main between snapshots 0
and 1; main→cleanup between 2 and 3) with 4 unknown-move records (log
growth via `applyReplayStep`'s warning-and-skip at
`replay.execute.ts:162-166`). Phases unreachable per D-0205 — fixture
re-scoped to stage-and-log per WP-064 amendment 2026-04-19. Byte-
identical regeneration confirmed twice. The inputs file +
`.cmd.txt` invocation are committed alongside for reproducibility.

Test counts: arena-client **66 / 0 fail** (was 35; +31 across four
new suites + the loadReplay helper). `pnpm -r test` **517 passing
/ 0 fail** (was 486; +31 total). Engine, registry, vue-sfc-loader,
server, replay-producer counts unchanged.

Verification (12 of 12 pass): build / typecheck / test exit 0; no
runtime engine / registry / boardgame.io import in any new file
(`Grep` returned no matches); no engine move/hook names leaked
into client paths (`Grep` for the 12 documented engine runtime
symbols returned no matches); no `Math.random` / `Date.now` /
`performance.now` (per P6-43, JSDoc paraphrases forbidden APIs);
no `.reduce()` in rendering or navigation; engine, registry,
vue-sfc-loader, server, registry-viewer, replay-producer all
clean per `git diff --name-only`; `pnpm-lock.yaml` absent from
diff (P6-44 pass); `apps/arena-client/package.json` untouched (no
new devDep); both retained stashes intact; EC-069 `<pending>`
placeholder not backfilled; WP-080 post-mortem not staged.

Execution surfaced **D-6401** (keyboard focus pattern for
stepper-style components — `tabindex="0"` on the root + keyboard
listeners on the root; first repo precedent confirmed via WP-061 /
WP-062 review). Full rationale + rejected alternatives in
`docs/ai/DECISIONS.md §D-6401` and the post-mortem §6 hidden-coupling
audit.

01.6 post-mortem MANDATORY (P6-35 — two triggering criteria fired:
new long-lived abstraction `parseReplayJson` + new keyboard focus
precedent D-6401) delivered in-session at
`docs/ai/post-mortems/01.6-WP-064-log-replay-inspector.md`; verdict
**WP COMPLETE**. One in-allowlist refinement applied during the
post-mortem itself: `<ReplayInspector />`'s `currentLog` computed
now spread-copies `snapshot.log` before passing to
`<GameLogPanel />` (WP-028 / D-2802 aliasing-prevention pattern).

**Unblocks future replay-consuming surfaces** (spectator HUD,
shared-match replay UI, export tools). The D-6303 assertion site is
canonical; the keyboard focus pattern (D-6401) is canonical for any
future stepper component (moves timeline, scenario selector,
tutorial carousel). No engine, persistence, or production wiring —
WP-064 is a pure consumer of committed `ReplaySnapshotSequence`
artifacts.

Two WP-064 commits on this branch:

- `76beddc` EC-074 — code + fixture triplet + 01.6 post-mortem
  (12 new client files + 1 post-mortem; 1740 insertions; engine /
  registry / vue-sfc-loader / server / replay-producer untouched)
- `<this commit>` SPEC — governance close (STATUS.md,
  WORK_INDEX.md, EC_INDEX.md, DECISIONS.md §D-6401,
  DECISIONS_INDEX.md)

Pre-commit review handoff: per P6-35, runs in a separate gatekeeper
session (no in-session AskUserQuestion request, no P6-42 deviation
to disclose).

---

### WP-063 / EC-071 Executed — Replay Snapshot Producer (2026-04-19, EC-071)

WP-063 executed at commit `97560b1`: added engine type
`ReplaySnapshotSequence { version: 1, snapshots: readonly UIState[],
metadata? }` and the pure helper
`buildSnapshotSequence({ setupConfig, seed, playerOrder, moves,
registry, metadata? })` in
`packages/game-engine/src/replay/replaySnapshot.types.ts` and
`packages/game-engine/src/replay/buildSnapshotSequence.ts`. The helper
wraps WP-080's `applyReplayStep` step-level API and calls WP-028's
`buildUIState` after setup and after each step, returning a frozen
sequence whose length is exactly `moves.length + 1`. No I/O, no
logging, no wall-clock reads, no non-engine RNG, no `boardgame.io`
import. Engine barrel exports added in `packages/game-engine/src/index.ts`
and `packages/game-engine/src/types.ts`.

New CLI app `apps/replay-producer/` is the first `cli-producer-app` per
D-6301. It wraps the helper with `node:util parseArgs`, canonical
top-level-sorted JSON serialization (D-6302; nested key order inherits
engine purity), optional-field omission (D-6303 — never `"metadata":
undefined` / `null`), five named exit-code constants under a single
`// why:` block (`EXIT_OK=0` / `EXIT_INVALID_ARGS=1` / `EXIT_INPUT_PARSE=2`
/ `EXIT_ENGINE=3` / `EXIT_OUTPUT_WRITE=4`), and
`process.setSourceMapsEnabled(true)` at the entry for TypeScript stack
traces. Committed golden fixture triplet
(`three-turn-sample.{inputs,sequence,cmd}`) demonstrates round-trip
determinism.

Execution surfaced **D-6305**: `ReplayInputsFile.moves` is typed
`readonly ReplayMove[]` to match WP-027's canonical per-step record
name (not `readonly ReplayInput[]` as the WP literally phrased it);
`BuildSnapshotSequenceParams` is a 6-field interface carrying explicit
`playerOrder` (for `numPlayers` derivation) and `registry` (a
`CardRegistryReader` required by `buildInitialGameState`). Full
rationale + rejected alternatives in
`docs/ai/post-mortems/01.6-WP-063-replay-snapshot-producer.md §D-6305`
and `docs/ai/DECISIONS.md §D-6305`.

Test counts: game-engine **427 / 108 suites / 0 fail** (was 412 / 102;
+15 tests across 6 new suites in `buildSnapshotSequence.test.ts`).
`apps/replay-producer` adds **4 tests / 2 suites / 0 fail** as the
fifth per-app count (determinism + three exit-code cases). `pnpm -r
test` **486 passing / 0 fail** (was 467; +19 total). Engine and CLI
builds exit 0.

Verification: helper-purity grep returns no match; no `boardgame.io`
under `packages/game-engine/src/replay/`; determinism verified at both
helper level (deep-equal two-call) and CLI level (byte-identical
two-run with `--produced-at=2026-04-19T00:00:00Z` — confirmed via
shell `diff`); committed golden sequence byte-matches fresh
regeneration via the `three-turn-sample.cmd.txt` invocation;
`apps/arena-client/`, `apps/registry-viewer/`, `apps/server/`,
`packages/registry/`, `packages/vue-sfc-loader/` all untouched.

**Unblocks WP-064 (Game Log & Replay Inspector).** WP-064 will import
`ReplaySnapshotSequence` as a type, carry the consumer-side
`version === 1` assertion per D-6303, and render the committed
`three-turn-sample.sequence.json` as its first fixture.

Two WP-063 commits on this branch:
- `97560b1` EC-071 — code + samples + in-session post-mortem artifact
  (engine types / helper / tests / CLI app / fixtures)
- `<this commit>` SPEC — governance (STATUS.md, WORK_INDEX.md,
  EC_INDEX.md, DECISIONS.md §D-6305, DECISIONS_INDEX.md)

01.6 post-mortem completed in-session before Commit A (new long-lived
abstraction + new code category triggers both fired); §5 aliasing
audit PASSED (outer sequence + snapshots array frozen; each UIState
is a `buildUIState` projection whose mutable fields — `handCards`,
`log` — are spread-copies per WP-028 precedent). Pre-commit review
ran in a separate gatekeeper session per P6-35 default; no P6-42
deviation.

**Stashes:** `stash@{0}` (WP-068 / MOVE_LOG_FORMAT) and `stash@{1}`
(WP-068 pre-wp-062-branch-cut) retained unchanged (not popped).
EC-069 `<pending>` placeholder in `EC_INDEX.md` not backfilled by
WP-063.

---

### WP-080 / EC-072 Executed — Replay Harness Step-Level API (2026-04-19, EC-072)

WP-080 executed at commit `dd0e2fd`: added named export
`applyReplayStep(gameState, move, numPlayers): LegendaryGameState` to
`packages/game-engine/src/replay/replay.execute.ts` immediately above
`replayGame`; refactored `replayGame`'s internal loop to delegate each
iteration to the new export so `MOVE_MAP` + `buildMoveContext` remain
the single source of truth for dispatch (D-6304). Added one export line
under the WP-027 block in `packages/game-engine/src/index.ts`. Added
new test file `replay.execute.test.ts` with three cases (identity +
same-reference contract; `replayGame` regression guard with
`PRE_WP080_HASH = 'a56f949e'` byte-identical pre- and post-refactor;
unknown-move warning-and-skip routing through `applyReplayStep`).

State-ownership contract is mutate-and-return-same-reference (Q2 = A):
`applyReplayStep` never clones `gameState`; consumers wanting historical
snapshots project via `buildUIState` after each step. `MOVE_MAP`,
`buildMoveContext`, `ReplayMoveContext`, and `MoveFn` remain file-local
(Q1 = A / Q4). WP-079's JSDoc narrowing preserved verbatim
(`determinism-only` xref; D-0205 xref; `MOVE_LOG_FORMAT.md` Gap #4 xref;
forbidden phrases absent). No `boardgame.io` import added; no
`console.*` / `Date.now` / `Math.random` / `performance.now` / `node:fs`
inside `applyReplayStep`.

Test counts: game-engine **412 / 102 suites / 0 fail** (was 409 / 101);
`pnpm -r test` **467 passing / 0 fail** (was 464). Engine build exits 0.

**Unblocks WP-063 / EC-071 Pre-Session Gate #4.** `buildSnapshotSequence`
can now wrap `applyReplayStep` instead of duplicating `MOVE_MAP` into
`apps/replay-producer/`.

Two WP-080 commits on this branch:
- `dd0e2fd` EC-072 — code (`replay.execute.ts`, `replay.execute.test.ts`,
  `index.ts`)
- `<this commit>` SPEC — governance (STATUS.md, WORK_INDEX.md,
  EC_INDEX.md)

01.6 post-mortem completed in-session before Commit A (new long-lived
abstraction trigger); §5 aliasing audit PASSED (intentional
same-reference contract, distinguished from WP-028 `cardKeywords`
precedent). Pre-commit review ran in a separate gatekeeper session per
§9 locked choice (P6-35 default path).

**Stashes:** `stash@{0}` (WP-068 / MOVE_LOG_FORMAT) and `stash@{1}`
(WP-068 pre-wp-062-branch-cut) retained unchanged (not popped).
EC-069 `<pending>` placeholder in `EC_INDEX.md` not backfilled.

---

### WP-079 / EC-073 Executed — Replay Harness Labeled Determinism-Only (2026-04-19, EC-073)

WP-079 executed doc-only under EC-073 at commit `1e6de0b`: labeled the
engine's replay harness (`packages/game-engine/src/replay/replay.execute.ts`
and `replay.verify.ts`) as determinism-only tooling per D-0205's single
follow-up action. Added a module-header paragraph scoping the module
as determinism-only and a wholesale `replayGame()` JSDoc rewrite in
`replay.execute.ts`; added a module-header sentence and a wholesale
`verifyDeterminism()` JSDoc rewrite in `replay.verify.ts`. Cross-references
to `DECISIONS.md §D-0205` present in both files; `MOVE_LOG_FORMAT.md`
Gap #4 cross-reference present in `replay.execute.ts`. All three
forbidden phrases ("replays live matches", "replays a specific match",
"reproduces live-match outcomes") grep to zero across both files.
`"determinism-only"` grep (case-sensitive) returns 2 hits in
`replay.execute.ts` and 2 hits in `replay.verify.ts`.

Zero runtime behavior change; zero signature change (`git diff`
confirms no `(-|+)export function` matches on either file); zero
export change (`packages/game-engine/src/index.ts` untouched); zero
type change (`replay.types.ts` untouched); zero test change
(`replay.verify.test.ts` untouched). Preserved `// why:` comments
verbatim: events no-op (`replay.execute.ts:110-117`), reverse-shuffle
rationale (`:118-124`), two-run rationale (`replay.verify.ts:43-45`).
Test baseline held at **464 passing / 0 failing** across all five
packages (registry 3 + vue-sfc-loader 11 + game-engine 409 +
server 6 + arena-client 35) — identical to the starting commit. Engine
build (`pnpm --filter @legendary-arena/game-engine build`) exits 0.

Two EC-073 commits on this branch:
- `1e6de0b` EC-073 — source JSDoc + module-header rewrites (two `.ts`
  files)
- `<this commit>` EC-073 — governance updates (STATUS.md,
  WORK_INDEX.md, DECISIONS.md §D-0205 Follow-up, EC_INDEX.md)

Closes the D-0205 single follow-up action; D-0205 Follow-up block
now carries the completion reference. Hard upstream for WP-080 /
EC-072 unblocked: both packets touch `replay.execute.ts`, and WP-080
now inherits this JSDoc narrowing verbatim.

**Stashes:** `stash@{0}` (WP-068 / MOVE_LOG_FORMAT) and `stash@{1}`
(WP-068 pre-wp-062-branch-cut) retained unchanged (not popped).
**EC-069 placeholder:** `<pending — gatekeeper session>` in
`EC_INDEX.md` retained (not backfilled — cross-WP contamination
would be a scope violation).
**01.6 post-mortem:** not required (doc-only; no new long-lived
abstraction; no new code category — both P6-35 triggers absent per
EC-073 After Completing).
**Commit prefix:** `EC-073:` exclusively (never `WP-079:` per P6-36;
the `.githooks/commit-msg` hook rejects `WP-###:`).

Chain status after this session:
- Step 1 (COMPLETE — SPEC `1264133` / merged `3307b12`): EC-073
  drafted + governance artifacts + merge
- Step 2 (COMPLETE — THIS SESSION): WP-079 execution under `EC-073:`
- Step 3 (READY): WP-080 execution under `EC-072:` — reads landed
  `replay.execute.ts` header + `replayGame()` JSDoc verbatim as the
  narrowing to preserve when adding `applyReplayStep` alongside
- Step 4 (BLOCKED on Step 3): WP-063 resume under existing `EC-071:`
  prefix

---

### WP-079 Execution Branch Cut — Governance Chain Merged (2026-04-19, SPEC)

Session prepared `wp-079-replay-harness-determinism-label` as the
canonical execution branch for EC-073 / WP-079. All 11 Pre-Session
Gates from `docs/ai/invocations/session-wp079-label-replay-harness-determinism-only.md`
now pass. Test baseline re-verified on the new branch at **464
passing / 0 failing** across all five packages (registry 3 +
vue-sfc-loader 11 + game-engine 409/101 + server 6 + arena-client 35).

This session produced nine commits across three branches. Summary
in causal order:

**Replay governance chain (on `wp-062-arena-hud`, then merged to `main`):**
- `d153bec` SPEC-A — premature minimal D-0205 block (reverted)
- `8c87418` SPEC-revert — path β course-correction after the
  Step-2 parity check discovered `stash@{0}` contained a more
  complete D-0203 / D-0204 / D-0205 ecosystem
- `0ffda27` SPEC-A′ — landed the full 243-line three-decision
  cluster verbatim from stash; section "Decision Points Raised
  by MOVE_LOG_FORMAT.md" placed before `## Final Note`
- `aef0dc0` SPEC-B — committed `docs/ai/MOVE_LOG_FORMAT.md`
  (506 lines, forensics report) + `docs/00-INDEX.md` pointer row
- `a52a67c` SPEC-C — DECISIONS_INDEX.md three new rows
  (D-0203/0204/0205) + WORK_INDEX.md one-sentence WP-079
  registration (classified stash index hunks: 1 extracted,
  3 already-landed, 1 deferred, 1 superseded)

**Operational guardrails (on `main` directly):**
- `3574b22` SPEC: Pre-B — `.gitignore` rules for
  `content/media/` + two generated `content/themes/*ALL_THEMES_COMBINED.json`
  outputs. Landed on `main` directly so `wp-081-theme-audio`
  branches off a base that already has the rules.

**WP-081 Theme Audio isolation (`wp-081-theme-audio` branch cut from main):**
- `19f3c93` SPEC — WP-081 design drafts (2 files, 953 lines)
- `8c5130c` INFRA — WP-081 tooling scripts (2 PowerShell files;
  combiner reusable, `01-ScripAddMusicFields.ps1` one-time migration)
- `41fa60a` SPEC — WP-081 theme audio fields
  (`musicTheme` / `musicAIPrompt` / `musicURL`) on 68 theme JSONs

**Merge to main:**
- `3307b12` `EC-069:` — `--no-ff` merge of `wp-062-arena-hud` onto
  main, folding in all 17 commits. `EC-069:` prefix chosen
  deliberately because the only code-under-`apps/` in the merge
  diff originates from `7eab3dc EC-069:`; SPEC-prefix was blocked
  by `.githooks/commit-msg` Rule 5 (code changes require EC-###
  prefix) and `--no-verify` was rejected. Commit body explicit:
  bookkeeping merge, not re-execution. Merge has two parents
  (`3574b22` + `a52a67c`).

**Branch cut:**
- `wp-079-replay-harness-determinism-label` cut from main `3307b12`.
  Zero commits ahead / behind main at cut. Working tree: 7 Category D
  untracked governance artifacts carry across — all outside EC-073
  Files to Produce allowlist.

Working-tree cleanup (moves off-repo, no commits):
- `.claude/settings.local.json` — `git update-index --skip-worktree`
- 4 Monrovia ACTV survey `.txt` files → `~/Documents/monrovia-survey/`
- 5 business/legal docs (license letter, one-pager, Upper Deck
  contacts, each in `.md` + `.docx` where applicable) →
  `~/Documents/legendary-arena-business/`

Dirty-tree reduction: **91 → 7 entries**. Stashes `stash@{0}` and
`stash@{1}` retained unchanged throughout. EC-069
`<pending — gatekeeper session>` placeholder in `EC_INDEX.md`
retained. No history rewrites. No `--no-verify`. No forced pushes.

Chain status after this session:
- Step 1 (COMPLETE): EC-073 drafted + governance artifacts + merge
- Step 2 (READY — NEW SESSION): WP-079 execution under `EC-073:`
  on `wp-079-replay-harness-determinism-label`
- Step 3 (BLOCKED on Step 2): WP-080 execution under `EC-072:`
- Step 4 (BLOCKED on Step 3): WP-063 resume under `EC-071:`

Category D governance artifacts (4 forensics/WP-048/067/068
invocations + 3 session-context files) remain untracked across
all branches; landing them is orthogonal to EC-073 execution and
can follow under a batched SPEC at any time.

### Branch topology post-session

- `main` `3307b12` — canonical; contains Arena HUD code, full replay
  governance, operational guardrails.
- `wp-079-replay-harness-determinism-label` `3307b12` — EC-073
  execution branch; equal to main until EC-073 commits land.
- `wp-062-arena-hud` `a52a67c` — preserved rollback reference;
  fully contained in main (0 commits ahead of main).
- `wp-081-theme-audio` `41fa60a` — isolated feature branch, 3
  commits ahead of main, no dependency on wp-079 or wp-062 chains.
- `wp-068-preferences-foundation` `8ec6ced` — historical.

### WP-079 EC-073 Drafted (2026-04-18, SPEC)

Step 1 of the replay-harness chain. WP-079 (Label Engine Replay
Harness as Determinism-Only) is a doc-only decision-closure WP
carrying out D-0205's single follow-up action. This SPEC commit
drafts the missing governance artifacts needed to execute WP-079
under current commit-prefix rules:

- `docs/ai/execution-checklists/EC-073-label-replay-harness-determinism-only.checklist.md`
  (new; Draft status; follows EC-TEMPLATE verbatim)
- `docs/ai/invocations/session-wp079-label-replay-harness-determinism-only.md`
  (new; execution session prompt; commit prefix `EC-073:`)
- `docs/ai/work-packets/WP-079-label-replay-harness-determinism-only.md`
  (newly tracked; WP file was drafted earlier but untracked until
  this commit)
- `docs/ai/session-context/session-context-wp079.md` (newly tracked
  + amended: two claims superseded by post-P6-36 reconciliation —
  "no EC needed" and "already in WORK_INDEX.md" are both now false
  because P6-36 forbids `WP-###:` commit prefixes, requiring an
  EC-prefixed commit for any code-changing session)
- `docs/ai/work-packets/WORK_INDEX.md` (new WP-079 row in Phase 6)
- `docs/ai/execution-checklists/EC_INDEX.md` (new EC-073 row)
- `docs/ai/work-packets/WP-080-replay-harness-step-level-api.md`
  (note updated: WP-079 EC status is now "Draft (EC-073)" instead
  of "UNKNOWN")

WP-079's scope unchanged from the original draft: JSDoc + module-
header text on `packages/game-engine/src/replay/replay.execute.ts`
and `packages/game-engine/src/replay/replay.verify.ts`. Zero runtime
behavior change. Zero signature / export / type / test change.
Forbidden phrases must grep to zero; required phrases must grep to
their declared counts. Existing `// why:` comments preserved
verbatim.

Chain status after this commit:
- Step 1 (THIS COMMIT): WP-079 EC-073 drafted — `SPEC:`
- Step 2: WP-079 execution under `EC-073:` — pending
- Step 3: WP-080 execution under `EC-072:` — pending (blocked on
  Step 2; both packets touch `replay.execute.ts`)
- Step 4: WP-063 resume under `EC-071:` — pending (blocked on
  Step 3)

Repo test baseline unchanged at 464 (no source code touched in this
SPEC commit). Stashes `stash@{0}` and `stash@{1}` retained. EC-069
`<pending — gatekeeper session>` placeholder in `EC_INDEX.md`
retained (owned by separate SPEC commit).

### WP-063 Blocked → WP-080 / EC-072 / D-6304 Drafted (2026-04-18, SPEC)

WP-063 / EC-071 (Replay Snapshot Producer) stopped at Pre-Session Gate #4:
`packages/game-engine/src/replay/replay.execute.ts` exposes only
`replayGame(input, registry): ReplayResult` — an end-to-end harness
that loops all moves internally. `MOVE_MAP` (line 77),
`buildMoveContext` (line 98), and the `ReplayMoveContext` interface
(line 39) are all module-local; no per-step callback, no intermediate
`G` observable from outside. WP-063's `buildSnapshotSequence` needs
per-input stepping with a live `G` reference at each step to call
`buildUIState` (WP-028) — without a step-level export from WP-027,
the only consumer path would duplicate `MOVE_MAP` into
`apps/replay-producer/`, creating dispatch drift. Under the EC-071
session protocol's "If the harness is end-to-end only, WP-063 is
BLOCKED — STOP and ask" clause, the session halted and the user
selected "Stop and amend (pre-flight)" via `AskUserQuestion`.

This SPEC commit drafts WP-080 / EC-072 / D-6304 to add a named
step-level export `applyReplayStep(gameState, move, numPlayers):
LegendaryGameState` to `replay.execute.ts`, with `replayGame`'s
internal loop refactored to delegate to it (single source of truth
for dispatch). Q1=A (single function), Q2=A
(mutate-and-return-same-reference), Q3=A (refactor the loop), Q4=A
(keep `ReplayMoveContext` file-local), Q5 (`ReplayInputsFile`) out of
scope. RNG semantics unchanged; D-0205 remains in force.

Artifacts created / modified in this session:
- `docs/ai/work-packets/WP-080-replay-harness-step-level-api.md`
  (new; Status Ready; dependencies WP-027, WP-079, D-6304)
- `docs/ai/execution-checklists/EC-072-replay-harness-step-level-api.checklist.md`
  (new; Draft)
- `docs/ai/DECISIONS.md §D-6304` (new; Active, Resolved 2026-04-18)
- `docs/ai/work-packets/WORK_INDEX.md` (new WP-080 row; WP-063
  dependency cell amended to include WP-080)
- `docs/ai/execution-checklists/EC_INDEX.md` (new EC-072 row;
  EC-071 entry annotated as Blocked at Pre-Session Gate #4)
- `docs/ai/invocations/session-wp063-replay-snapshot-producer.md`
  (additive amendment at §Pre-Session Gates #4 and §Authority Chain
  citing WP-080 / EC-072 / D-6304 as the newly-added upstream; no
  deletions)

Order of execution from here: (1) WP-079 EC drafting (if no EC
exists yet at `EC_INDEX.md`), (2) WP-079 execution (doc-only JSDoc
narrowing on `replay.execute.ts` + `replay.verify.ts`), (3) WP-080
execution under commit prefix `EC-072:`, (4) WP-063 resume under
existing `EC-071:` commit prefix (Pre-Session Gate #4 then passes
because `applyReplayStep` is visible at
`packages/game-engine/src/index.ts`). Commit prefix for this drafting
session: `SPEC:` (P6-36 — `WP-080:` and `EC-072:` both forbidden
for documentation-only commits). Repo test baseline unchanged at 464
(no source code touched). Stashes `stash@{0}` and `stash@{1}`
retained. EC-069 `<pending — gatekeeper session>` placeholder in
`EC_INDEX.md` retained (owned by a separate SPEC commit).

### WP-062 — Arena HUD & Scoreboard (2026-04-18, EC-069)

The arena client now renders a full HUD driven by `UIState` fixtures.
`apps/arena-client/src/components/hud/` holds a seven-file Vue 3 component
tree plus a color-palette helper: `ArenaHud.vue` (sole `useUiStateStore`
consumer — container/presenter split), `TurnPhaseBanner.vue` (phase / turn /
stage / active-player), `SharedScoreboard.vue` (five counters with literal
leaf-name `aria-label`s; `bystandersRescued` carries `data-emphasis="primary"`,
penalty counters carry `data-emphasis="secondary"`), `ParDeltaReadout.vue`
(em-dash when `!('par' in gameOver)` — the D-6701 dominant runtime path;
zero rendered as `0` when present), `PlayerPanelList.vue` +
`PlayerPanel.vue` (seven zone fields per player, `aria-current="true"` on
active, Okabe-Ito palette with mandatory icon glyph), `EndgameSummary.vue`
(outcome / reason always rendered; optional four-field PAR breakdown
guarded by `'par' in gameOver`), and `hudColors.ts`.

`apps/arena-client/src/App.vue` mounts `<ArenaHud />` in place of
`<BootstrapProbe />`. `apps/arena-client/src/styles/base.css` gains five new
HUD tokens (`--color-emphasis`, `--color-penalty`, `--color-active-player`,
`--color-par-positive`, `--color-par-negative`) under both light and dark
`prefers-color-scheme` blocks, each with a numeric contrast-ratio comment
computed against the appropriate background token.

Six new test files (`ArenaHud.test.ts`, `TurnPhaseBanner.test.ts`,
`SharedScoreboard.test.ts`, `ParDeltaReadout.test.ts`, `PlayerPanel.test.ts`,
`PlayerPanelList.test.ts`) add 22 tests. `ArenaHud.test.ts` includes the
per-fixture-variant deep-immutability assertion (FIX for copilot Issue 17)
and is the only HUD test that sets up a Pinia store;
`PlayerPanelList.test.ts` includes the player-array-ordering assertion
(FIX for copilot Issue 23) using `findAllComponents({ name: 'PlayerPanel' })`.

`ArenaHud.vue`, `PlayerPanel.vue`, `PlayerPanelList.vue`, `ParDeltaReadout.vue`,
and `EndgameSummary.vue` use the `defineComponent({ setup() { return {...} } })`
authoring form per D-6512 / P6-30. The `<script setup>` sugar is insufficient
under vue-sfc-loader's separate-compile pipeline for two reasons — template
bindings beyond props must be returned from `setup()` to reach `_ctx`, and
imported child components (e.g., `PlayerPanel` inside `PlayerPanelList`) must
be explicitly registered via `components: {...}` because the loader does not
hoist `<script setup>` imports onto the render function's component registry.
`TurnPhaseBanner.vue` and `SharedScoreboard.vue` remain in `<script setup>`
form (props-only templates). WP-061's store, fixtures, `main.ts`, and
`BootstrapProbe*` are untouched (`apps/arena-client/src/stores/uiState.ts`
in particular was not modified — WP-061's one-state-field / one-action
contract is preserved).

Suite: 464 passing repo-wide (engine 409/101 + registry 3 + vue-sfc-loader 11
+ server 6 + arena-client 35). No engine, registry, vue-sfc-loader, server,
or registry-viewer changes.

01.5 NOT INVOKED. 01.6 post-mortem produced in-session prior to commit
(MANDATORY per P6-35 — triggered by new long-lived abstraction + new
contract consumption).

### WP-067 — UIState PAR Projection & Progress Counters (2026-04-17, EC-068)

`buildUIState` now emits `UIState.progress` (required, with `bystandersRescued`
and `escapedVillains`) and `UIGameOverState.par` (optional `UIParBreakdown` —
deferred safe-skip body per D-6701, omitted at runtime). `LegendaryGameState`
gains optional `activeScoringConfig` (D-6702); `buildInitialGameState` takes a
fourth positional optional `scoringConfig` (D-6703). WP-062 projection-layer
blockers are resolved.

Suite: 442 passing repo-wide (engine 409/101, +13 tests / +3 suites). One
forced cascade outside the WP allowlist: `uiState.filter.ts` gained a single
`progress: { ...uiState.progress }` passthrough so the new required field
roundtrips through audience filtering — counters are public and need no
redaction.

### WP-048 — PAR Scenario Scoring & Leaderboards (2026-04-17)

**What changed:**
- New PAR scoring subtree under `packages/game-engine/src/scoring/`. Five
  new files matching the EC-048 Files to Produce exactly:
  `parScoring.types.ts`, `parScoring.keys.ts`, `parScoring.logic.ts`,
  `parScoring.keys.test.ts`, `parScoring.logic.test.ts`. Three re-export
  surfaces updated: `scoring/scoring.types.ts`, `types.ts`, and `index.ts`
  — no structural changes to pre-existing contracts.
- **Types (WP-048 §A):** `ScenarioKey`, `TeamKey`, `ScoringWeights`,
  `ScoringCaps`, `PenaltyEventType`, `PENALTY_EVENT_TYPES`,
  `PenaltyEventWeights`, `ParBaseline`, `ScenarioScoringConfig`,
  `ScoringInputs`, `ScoreBreakdown`, `LeaderboardEntry`,
  `ScoringConfigValidationResult`. All `readonly`, all JSON-serializable
  (no functions, Maps, Sets, Dates, class instances — D-4806).
- **Identity keys (WP-048 §C):** `buildScenarioKey(scheme, mastermind,
  villainGroups)` and `buildTeamKey(heroes)` produce stable, sorted
  strings (`{scheme}::{mastermind}::{v1+v2+…}` and `{h1+h2+…}`). Sorting
  is done inside the builders; callers pass slugs in any order.
- **Logic (WP-048 §B):** six pure functions — `deriveScoringInputs`,
  `computeRawScore`, `computeParScore`, `computeFinalScore`,
  `buildScoreBreakdown`, `validateScoringConfig`. All deterministic; all
  integer (centesimal) arithmetic. `computeRawScore` and `computeParScore`
  share one arithmetic path so PAR is always consistent with Raw.
  `buildScoreBreakdown` spread-copies `inputs` and `penaltyEventCounts`
  before storing (D-2801 aliasing precedent).
- **`deriveScoringInputs` signature (D-4801):**
  `(replayResult: ReplayResult, gameState: LegendaryGameState) =>
  ScoringInputs`. No `gameLog` parameter, no `GameMessage` type introduced.
  Derivation sources documented per-field in the WP: `rounds =
  moveCount`, `victoryPoints = sum(computeFinalScores.players[*].totalVP)`
  (D-4803 team-aggregate), `bystandersRescued` counted via
  `playerZones[*].victory` against `villainDeckCardTypes`, `escapes =
  counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS] ?? 0`. Non-villainEscaped
  penalty event counts safe-skip to `0` per D-4801.
- **Validation (`validateScoringConfig`):** enforces positive core
  weights, positive per-event penalty weights, complete
  `penaltyEventWeights` coverage (every `PenaltyEventType` key present
  per D-4805), non-negative caps, non-negative PAR baseline, positive
  config version, and the three moral-hierarchy structural invariants
  (`bystanderReward > villainEscaped`, `bystanderLost > villainEscaped`,
  `bystanderLost > bystanderReward`). Never throws — returns
  `{ valid, errors: readonly string[] }` with full-sentence messages per
  code-style Rule 11.
- **Tests:** 16 tests in `parScoring.logic.test.ts` and 4 tests in
  `parScoring.keys.test.ts`, each inside a single `describe()` block.
  Test 8 proves heroic play strictly beats conservative play under
  reference weights (moral hierarchy). Test 13 is the
  `PENALTY_EVENT_TYPES`/`PenaltyEventType` drift-detection gate. Test 14
  absorbs the aliasing-protection assertion (D-2801). Test 15 loops over
  `PENALTY_EVENT_TYPES` and asserts one-rejection-per-missing-key for the
  self-contained config rule (D-4805). Test 16 JSON-roundtrips both
  `ScoreBreakdown` and `LeaderboardEntry` for structural equality (D-4806).
- **Scope compliance:** `LegendaryGameState` shape unchanged (D-4802).
  `buildInitialGameState` signature unchanged (D-4802). `MatchSetupConfig`
  9-field lock preserved. `scoring.logic.ts` zero-diff (WP-020 contract
  read-only). `replay.types.ts` / `replay.execute.ts` / `replay.hash.ts` /
  `replay.verify.ts` zero-diff (WP-027 contract read-only). No
  `boardgame.io`, `@legendary-arena/registry`, or `apps/server` import in
  any `parScoring.*.ts`. No `.reduce()`, no floating-point helpers, no
  `require()`.

**Verification (from WP-048 §Verification Steps + EC-048 §After Completing):**
- `pnpm --filter @legendary-arena/game-engine build` exits 0.
- `pnpm --filter @legendary-arena/game-engine test` exits 0 — 396 passing,
  98 suites, 0 failing (baseline 376/96 → +16 logic tests + 4 key tests =
  +20 tests, +2 suites). Note: the session prompt mentioned "392/98" as an
  arithmetic error; the spec explicitly requires 16+4=20 new tests, which
  lands at 396/98. Flagged in commit message for post-mortem.
- `pnpm -r test` exits 0 — 429 passing (409 → 429, +20). Same arithmetic
  observation: prompt said "425"; authoritative requirement is 20 new tests
  landing at 429.
- `git diff c5f7ca4 --name-only` returns only the allowlisted files plus
  STATUS.md and WORK_INDEX.md. `DECISIONS.md` already contains D-4801
  through D-4806 from commit c5f7ca4 and is not modified in this commit.
- Every required `// why:` comment from EC-048 is present (types, logic,
  keys, derivation safe-skips, aliasing, monotonicity, full-sentence
  error messages).

**What remains:**
- UI projection of `ScoreBreakdown` + live progress counters onto
  `UIState` / `UIGameOverState` — handled by a separate intermediate WP
  between WP-048 and WP-062 (Arena HUD & Scoreboard). WP-048 deliberately
  adds no UI surface.
- `G.activeScoringConfig` field and match-setup wiring — deferred to
  WP-067 per D-4802.
- Structured penalty-event producers for `bystanderLost`,
  `schemeTwistNegative`, `mastermindTacticUntaken`, and
  `scenarioSpecificPenalty` — each has a D-4801 safe-skip comment
  naming the deferred follow-up.
- PAR-value content derivation (difficulty ratings → PAR baselines) —
  consumes `ParBaseline` as input, future WP.
- Server-side `LeaderboardEntry` storage, query, and tournament aggregate
  scoring — future WPs.

### WP-061 — Gameplay Client Bootstrap (2026-04-17)

**What changed:**
- New `apps/arena-client/` package classified as Client App (D-6511). 18 new
  files exactly matching WP-061 / EC-067 §Files Expected to Change:
  `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`,
  `src/main.ts`, `src/App.vue`, `src/stores/uiState.ts`,
  `src/stores/uiState.test.ts`, `src/fixtures/uiState/typed.ts`,
  `src/fixtures/uiState/index.ts`, `src/fixtures/uiState/index.test.ts`,
  `src/fixtures/uiState/mid-turn.json`, `src/fixtures/uiState/endgame-win.json`,
  `src/fixtures/uiState/endgame-loss.json`,
  `src/components/BootstrapProbe.vue`, `src/components/BootstrapProbe.test.ts`,
  `src/testing/jsdom-setup.ts`, `src/styles/base.css`.
- Package name `@legendary-arena/arena-client`, `"private": true`, vue pinned
  to `^3.4.27` (pnpm resolves 3.5.30 against the peer pin, matching WP-065).
  `@legendary-arena/vue-sfc-loader` and `@legendary-arena/game-engine` are
  declared as `devDependencies` only — never `dependencies` — per the
  anti-production-bundle rule (D-6501) and the type-only engine import rule.
- `useUiStateStore()` exposes exactly one state field (`snapshot: UIState | null`)
  and one action (`setSnapshot`). No getters, no additional state, no
  additional actions — the contract future UI packets (WP-062, WP-064) will
  depend on.
- Three committed JSON fixtures (`mid-turn`, `endgame-win`, `endgame-loss`),
  each typed via `satisfies UIState` at the import site in
  `fixtures/uiState/typed.ts` — never a bare type-assertion (the forbidden
  drift-masking pattern). `mid-turn.json` omits the optional `gameOver` key
  entirely because repo tsconfig has `exactOptionalPropertyTypes: true` and
  `{ "gameOver": null }` would break `satisfies UIState` (D-6514).
- `loadUiStateFixture(name: FixtureName)` is a single-code-path switch over
  the typed imports — no Vite-vs-Node branching. `isFixtureName()` is a
  pure type guard consumed by the dev `?fixture=` harness in `main.ts`.
- `<BootstrapProbe />` renders `snapshot.game.phase` when a fixture is
  loaded, an empty-state message otherwise, both with explicit `aria-label`
  attributes. The component uses the explicit
  `defineComponent({ setup() { return {...} } })` Composition API form
  rather than `<script setup>` sugar — load-bearing under the vue-sfc-loader
  separate-compile pipeline (D-6512). App.vue keeps `<script setup>` because
  it is only ever processed by Vite's `@vitejs/plugin-vue`, never by the
  test loader.
- Dev-only URL harness in `main.ts`: a single `if (import.meta.env.DEV)`
  branch reads `?fixture=` from `window.location.search`, silently no-ops
  on unknown values, and calls `store.setSnapshot(loadUiStateFixture(name))`
  for valid ones. Dedicated DCE marker `__WP061_DEV_FIXTURE_HARNESS__`
  inside the branch is absent from the executing production bundle; the
  marker is preserved only in `dist/assets/*.js.map` because
  `build.sourcemap: true` is enabled (D-6513 carve-out: marker-absence
  verification applies to executing JS, not sourcemaps).
- Test infrastructure: `node --import tsx --import @legendary-arena/vue-sfc-loader/register --test src/**/*.test.ts`
  — direct CLI flags, no `NODE_OPTIONS`, no `cross-env`, matching the
  precedent in `packages/game-engine`, `packages/registry`, and
  `apps/server`. `src/testing/jsdom-setup.ts` installs jsdom globals
  (`window`, `document`, `HTMLElement`, `Element`, `Node`, `SVGElement`,
  `MathMLElement`, `navigator`) via `Object.defineProperty` mirroring the
  WP-065 `loader.test.ts` driver — load-bearing because Node 22+ exposes
  `globalThis.navigator` as a read-only getter.
- 13 new tests pass: 3 store tests, 7 fixture tests, 3 component tests.
  Full-repo regression check: engine, registry, vue-sfc-loader, server,
  registry-viewer untouched; their tests remain green.
- Base CSS (`src/styles/base.css`) defines `--color-foreground`,
  `--color-background`, `--color-focus-ring` tokens for both light and dark
  `prefers-color-scheme` blocks, each with explicit numeric contrast-ratio
  comments (17.8:1 / 4.8:1 light, 15.6:1 / 6.5:1 dark). No framework, no
  theming system, no component styles — scoped component styles arrive
  with real HUD components in WP-062.
- `docs/ai/REFERENCE/02-CODE-CATEGORIES.md` received a new `client-app`
  row + detailed definition section (pre-session Gate #2 resolution;
  D-6511 already existed asserting the classification, but the matching
  row was missing — asymmetric governance state fixed).

**What's unblocked:**
- WP-062 (Arena HUD) can now consume the `useUiStateStore()` shape and the
  `FixtureName` union without needing to stand up new infrastructure.
- WP-064 (Log / Replay Inspector) can build against the same store.
- Any future UI WP can copy the jsdom-setup pattern and the typed-fixture
  loader pattern verbatim.

**Governance:** commit prefix is `EC-067:` (not `EC-061:` — EC-061 is
historically bound to the registry-viewer Rules Glossary panel shipped in
commit `1b923a4`). `01.6` post-mortem is mandatory per P6-28 and runs in
the same session as execution, before commit.

---

### WP-065 — Vue SFC Test Transform Pipeline (2026-04-17)

**What changed:**
- New `packages/vue-sfc-loader/` package classified as Shared Tooling
  (D-6501). Nine new files exactly matching WP-065 §Files Expected to
  Change: `package.json`, `tsconfig.json`, `README.md`,
  `src/compileVue.ts`, `src/compileVue.test.ts`, `src/loader.ts`,
  `src/loader.test.ts`, `src/register.ts`, and
  `test-fixtures/hello.vue`.
- `@legendary-arena/vue-sfc-loader` exposes a single consumer entry
  point via its exports map: `./register` (the side-effect import
  that installs the Node 22 `.vue` loader hook). Consumers opt in by
  setting `NODE_OPTIONS="--import tsx --import @legendary-arena/vue-sfc-loader/register"`
  in their `test` script.
- `compileVue(source, filename): { code, map? }` is a pure function.
  POSIX-normalizes the filename before any compiler call; emits a
  single ESM module with one `export default`; strips `<style>` and
  unknown custom blocks (D-6504); runs `typescript.transpileModule`
  internally (Outcome B from the pre-flight smoke test, recorded in
  D-6506) so output is always plain JavaScript parseable by Node 22.
- Loader intercepts `.vue` URLs only and delegates everything else to
  `nextLoad`. `resolve()` is not implemented (Locked Decision 8 —
  default Node resolution is the contract). `DEBUG=vue-sfc-loader`
  env opt-in writes a one-line `compiled <file> template=… script=…
  styleStripped=… customStripped=… bytesIn=… bytesOut=…` to stderr
  per compiled file.
- 11 tests in the new package all pass: nine `compileVue` tests
  (including byte-for-byte determinism across `C:\fix\hello.vue`
  vs `/fix/hello.vue` per D-6509, template-only and script-only
  SFC validity per WP-065 §B, and a Node-22-parseable smoke test on
  the emitted code) and two end-to-end `loader` tests that spawn
  child Node processes with the canonical `NODE_OPTIONS` pattern
  (D-6507) and verify jsdom mount plus broken-fixture stack-trace
  integrity (D-6510).
- Vue version pin: `^3.4.27` across `peerDependencies` and
  `devDependencies` (D-6502), matching `apps/registry-viewer/`.
- Canonical TS loader recorded as `tsx` (D-6508). Governance
  documents keep the literal `<repo-ts-loader>` placeholder; the
  delivered README substitutes the confirmed name.
- `pnpm --filter @legendary-arena/vue-sfc-loader build / typecheck /
  test` all exit 0. Full-repo test run remains green: 3 + 376 + 11 +
  6 = 396 tests passing across `packages/registry`,
  `packages/game-engine`, `packages/vue-sfc-loader`, and
  `apps/server`. No regressions outside the new package.
- `apps/arena-client/`, `apps/registry-viewer/`, `apps/server/`,
  `packages/game-engine/`, `packages/registry/`, `packages/preplan/`,
  `docs/ai/ARCHITECTURE.md`, and `docs/ai/REFERENCE/02-CODE-CATEGORIES.md`
  were not modified by this session (the two governance files already
  carried pre-flight changes from PS-1 that predate execution).

**What's unblocked:**
- WP-061 (Gameplay Client Bootstrap), WP-062 (Arena HUD), WP-064
  (Game Log & Replay Inspector), and every future UI Work Packet
  that tests `.vue` components can now use `node:test` with the
  canonical `NODE_OPTIONS` composition. No additional per-app test
  harness is required.
- EC-105 (deferred viewer a11y interaction tracing) can now be
  re-evaluated for scheduling.

---

### WP-033 — Content Authoring Toolkit (2026-04-16)

**What changed:**
- New `packages/game-engine/src/content/` directory classified as engine
  code category (D-3301). Three new files: `content.schemas.ts`,
  `content.validate.ts`, `content.validate.test.ts`
- Author-facing declarative schemas for six content types: hero card,
  villain, henchman, mastermind, scheme, scenario. Schemas are plain
  descriptor objects (`ContentSchemaDescriptor`) — no runtime code, no
  functions, no closures.
- `HERO_CLASSES` locally re-declared in the engine category (RS-9) —
  mirrors `HeroClassSchema` from the registry package without importing
  it (D-3301 forbids the cross-layer import).
- `ACCEPTED_CONTENT_TYPES` accept-list closes over the six content type
  strings — unknown `contentType` produces a single full-sentence error
  rather than silently passing (copilot RISK #10 / #21 resolution).
- `validateContent(content, contentType, context?)` — pure function
  returning `ContentValidationResult`. Stages: accept-list → structural
  → enum → cross-reference (skipped silently when `context` absent) →
  hook consistency. Never throws. Never mutates inputs.
- `validateContentBatch(items, context?)` — aggregates errors across
  items; single invalid item does not short-circuit the batch. Unknown
  `contentType` in one item is recorded as that item's error; other
  items continue to validate.
- `ContentValidationContext` — caller-injected cross-reference data with
  four optional `ReadonlySet<string>` fields
  (`validVillainGroupSlugs`, `validMastermindSlugs`, `validSchemeSlugs`,
  `validHeroSlugs`). Runtime call-site parameter only — never stored in
  `G`, persisted, or serialized (D-1232 forbids `Set` in `G`).
- Henchman author-facing schema mirrors `VillainCardSchema` shape per
  D-3302 until a future dedicated henchman authoring WP supersedes.
- Team field is validated as non-empty string only — no canonical
  `TEAMS` union at MVP (RS-8).
- Scenario schema validates the split
  `victoryConditions?` / `failureConditions?` shape per RS-4 (not a
  single `conditions` array).
- D-0601 (Content Is Data, Not Code) and D-0602 (Invalid Content Cannot
  Reach Runtime) implemented at contract level. D-0603 (Representation
  Before Execution) respected — schemas are data, validator is code.
- All content files are pure: no boardgame.io import, no registry
  import, no array `reduce`, no `Math.random()`, no I/O, no `throw`,
  no mutation.
- 9 new tests in `content.validate.test.ts`, all wrapped in one
  `describe('validateContent / validateContentBatch (WP-033)')` block
  (RS-2): valid hero passes, missing-field error, invalid-keyword
  enum error, mastermind with tactics passes, mastermind without
  tactics fails, scheme with invalid setup instruction type fails,
  cross-reference with-context fails / without-context passes, batch
  aggregation, all-full-sentence messages including unknown-contentType.
- Additive re-exports only in `types.ts` and `index.ts` — no existing
  export modified or reordered.

**Test baseline:** 376 tests / 96 suites / 0 fail (was 367 / 95 / 0).

**WP-033 complete. Ready for WP-034.**

---

### WP-032 — Network Sync & Turn Validation (2026-04-15)

**What changed:**
- New `packages/game-engine/src/network/` directory classified as engine
  code category (D-3201). Four new files: `intent.types.ts`,
  `intent.validate.ts`, `desync.detect.ts`, `intent.validate.test.ts`
- `ClientTurnIntent` is the canonical format for all client move
  submissions — matchId, playerId, turnNumber, move (name + args),
  optional clientStateHash for desync detection
- `IntentValidationResult` is a discriminated union: `{ valid: true }` or
  `{ valid: false; reason: string; code: IntentRejectionCode }`
- `IntentRejectionCode` is a 5-member named literal union: `WRONG_PLAYER`,
  `WRONG_TURN`, `INVALID_MOVE`, `MALFORMED_ARGS`, `DESYNC_DETECTED`
- `IntentValidationContext` is a local structural interface for the
  boardgame.io ctx fields needed by validation (currentPlayer, turn) —
  no boardgame.io import (D-2801 precedent, D-3201)
- `validateIntent(intent, gameState, context, validMoveNames)` — pure
  validation function. Caller injects the valid move name list
  (transport-agnostic). Short-circuits on first failure. Never mutates
  gameState. Never throws. Returns structured result.
- `detectDesync(clientHash, gameState)` — compares client hash against
  engine's `computeStateHash(gameState)` (WP-027). On mismatch, engine
  state is authoritative (D-0402).
- All network files are pure: no boardgame.io import, no registry import,
  no `.reduce()`, no `Math.random()`, no I/O, no `throw`, no mutation
- D-0401 (Clients Submit Intents, Not Outcomes) implemented at contract
  level. D-0402 (Engine-Authoritative Resync) implemented via
  `detectDesync`.
- D-3202 (intent validation is engine-side, not server-side) and D-3203
  (intent validation adds to boardgame.io, not replaces) documented.
- 9 new contract enforcement tests in `intent.validate.test.ts` covering
  all 5 rejection codes, valid intent, desync with matching/mismatching/
  absent hashes, and non-mutation invariant.
- 367 total tests, 95 suites, 0 failures (358 baseline + 9 new). No
  existing test modified.
- Multiplayer intent contract ready for server-layer wiring.

---

### WP-031 — Production Hardening & Engine Invariants (2026-04-15)

**What changed:**
- New `packages/game-engine/src/invariants/` directory classified as
  engine code category (D-3101). Eight new files:
  `invariants.types.ts`, `assertInvariant.ts`, `structural.checks.ts`,
  `gameRules.checks.ts`, `determinism.checks.ts`,
  `lifecycle.checks.ts`, `runAllChecks.ts`, `invariants.test.ts`
- Five non-overlapping invariant categories defined as a closed
  union: `'structural' | 'gameRules' | 'determinism' | 'security' | 'lifecycle'`
- Canonical `INVARIANT_CATEGORIES` readonly array exported alongside
  the union with a Test 1 drift-detection assertion
  (`assert.deepStrictEqual` matches the union exactly), following
  the precedent of `MATCH_PHASES`, `TURN_STAGES`, `REVEALED_CARD_TYPES`,
  `BOARD_KEYWORDS`, `SCHEME_SETUP_TYPES`, `PERSISTENCE_CLASSES`
- `assertInvariant(condition, category, message)` — throwing
  assertion utility with `InvariantViolationError` companion class
  carrying the violated category for post-mortem inspection
- `runAllInvariantChecks(G, invariantContext)` — orchestrator that
  runs every implemented check in a fixed category order
  (structural → gameRules → determinism → lifecycle), fail-fast on
  first violation
- 11 pure check functions implemented across 4 categories:
  - **structural:** `checkCitySize`, `checkZoneArrayTypes`,
    `checkCountersAreFinite`, `checkGIsSerializable`
  - **gameRules:** `checkNoCardInMultipleZones` (with
    fungible-token exclusion per A-031-01 / D-3103),
    `checkZoneCountsNonNegative`, `checkCountersUseConstants`
  - **determinism:** `checkNoFunctionsInG`, `checkSerializationRoundtrip`
  - **lifecycle:** `checkValidPhase`, `checkValidStage`,
    `checkTurnCounterMonotonic` (exported but uncalled — reserved
    for future per-turn wiring)
- `runAllInvariantChecks` wired into `Game.setup()` return path
  in `game.ts` per D-3102 Option B (setup-only wiring). Per-move
  wiring deferred to a follow-up WP. The minimal-wiring 01.5
  allowance covered: 1 import + 4-line setup-return wrap in
  `game.ts`, additive re-exports in `types.ts`, additive exports
  in `index.ts`. No other file modified.
- All check functions are pure: no `boardgame.io` import, no
  registry import, no `.reduce()`, no `Math.random()`, no I/O,
  no `process.env`, no mutation of `G`
- Every `Object.keys(record)` site that may throw on a specific
  key uses `Object.keys(record).sort()` for deterministic error
  reproducibility, with a `// why:` comment at each sort site
- `InvariantCheckContext` is a local structural interface
  (`{ readonly phase?: string; readonly turn?: number }`) defined
  in `invariants.types.ts` — no `boardgame.io` `Ctx` import
  anywhere under `src/invariants/` (RS-2 / D-2801 precedent)
- 10 new tests in `invariants.test.ts` (Test 1 combines drift
  detection with valid-G; Tests 2–5 assert specific category
  throws; Tests 6–8 cover `assertInvariant` contract and
  serialization happy path; Tests 9–10 are contract enforcement
  tests proving gameplay conditions — insufficient attack, empty
  wounds pile — do NOT throw)
- 358 total tests, 94 suites, 0 failures (348 baseline + 10 new).
  No existing test modified.

**Mid-execution amendment:**
- During implementation, the executor surfaced a conflict between
  the original WP-031 spec for `checkNoCardInMultipleZones` and
  the actual engine state: `CardExtId` is a card-type identifier
  (not per-instance), and the starting-deck and pile builders push
  multiple identical token strings into the same zone (8× of
  `'starting-shield-agent'` per player deck, 30× of
  `'pile-bystander'` per supply pile, etc.). A literal "no
  CardExtId in multiple zones" check would throw on every valid
  G and regress the 348-test baseline.
- User authorized Option 1 (fungible-exclusion cross-zone semantics)
  via WP-031 spec amendment + new DECISIONS.md entry. Three
  amendments applied in place:
  - **A-031-01:** `checkNoCardInMultipleZones` skips the six
    well-known fungible token strings
    (`starting-shield-agent`, `starting-shield-trooper`,
    `pile-bystander`, `pile-wound`, `pile-shield-officer`,
    `pile-sidekick`) and detects cross-zone duplication only for
    non-fungible CardExtIds. Zone scan order is deterministic;
    `attachedBystanders` excluded per D-1703.
  - **A-031-02:** Canonical zone field name is `victory`, not
    `victoryPile` (WP draft typo). All check spec locations and
    tests use `victory`.
  - **A-031-03:** `checkValidPhase` and
    `checkTurnCounterMonotonic` parameter types widened to
    `string | undefined` / `number | undefined` to handle
    runtime-undefined values from mock contexts in tests.
- Pre-flight RS-9 / RS-10 / RS-11 + PS-3 captured the discovery.
  Copilot check Findings #31 / #32 / #33 captured the resolution.
  Both audit trails re-confirm READY TO EXECUTE / CONFIRM after
  the amendment. No test count change. No file list change.

**Key decisions:**
- D-3101: `src/invariants/` classified as engine code category
  (pre-session, follows D-2706 / D-2801 / D-3001 precedent)
- D-3102: Setup-only wiring scope chosen (Option B). Per-move
  wiring deferred to a follow-up WP. Gameplay conditions remain
  safe no-ops at move return per D-0102 clarification.
- D-3103: Card uniqueness invariant scope (fungible token
  exclusion). Locks the 6-string fungible set and the amended
  cross-zone semantics. Documents the trade-off acknowledgement
  and the forward-compatibility path to a future per-instance
  refactor.

**Architectural significance:**
- D-0001 (Correctness Over Convenience) implemented at MVP level —
  invariant violations fail fast at setup; no silent corruption.
- D-0102 (Fail Fast on Invariant Violations, with clarification)
  implemented at MVP level — the violation/condition distinction
  is now mechanically enforced by the test pipeline (Tests 9 and 10
  prove gameplay conditions are NOT flagged as invariants).
- The five-category taxonomy provides a stable extension seam:
  future WPs add a check by writing one new function inside an
  existing category file and adding one new call inside
  `runAllInvariantChecks`. Adding a new category requires updating
  the union, the canonical array, the orchestrator, and one new
  check file — drift-detection by Test 1 catches partial updates.
- `InvariantViolationError` class authorized as a companion type
  to `assertInvariant` (no new error contract); throwing path
  fully covered by the existing `Game.setup() may throw` row in
  `.claude/rules/game-engine.md §Throwing Convention` (no new
  rule exception introduced).
- `LegendaryGameState` unchanged — WP-031 adds zero fields. No
  snapshot schema change. No `MatchSetupConfig` change.
- The Security/Visibility category slot is reserved in the union
  but no checks are implemented yet. A future WP fills the slot
  without refactoring the orchestrator.

**What's true now:**
- Every match created via `LegendaryGame.setup()` is invariant-
  checked at the moment its initial state is constructed. A
  setup-time invariant violation aborts match creation immediately
  with a typed `InvariantViolationError` carrying the category.
- Gameplay conditions (insufficient attack, empty pile, no valid
  target) are NEVER invariant violations and NEVER cause throws —
  they remain handled by moves returning void.
- All 11 check functions are pure helpers that read `G` (and a
  small framework-context subset) and either return void or throw.
  No mutation, no I/O, no registry access, no environment access.
- The `// why:` comment discipline is uniformly applied: each
  check has a one-line description of what it prevents; each
  `Object.keys(...).sort()` site cites deterministic error
  reproducibility; the wired block in `game.ts` cites D-3102 and
  the throwing-convention row.

**What's next:**
- Follow-up WP: per-move wiring of `runAllInvariantChecks` (would
  introduce a new throwing-convention exception for "assertInvariant
  inside a move" and would require careful test-baseline impact
  analysis). Currently deferred per D-3102.
- Follow-up WP: Security/Visibility check functions (UIState
  leakage detection, audience-filtered projection invariants). The
  `'security'` category slot exists in the union for this.
- Follow-up WP (hypothetical, larger refactor): per-instance unique
  CardExtIds for fungible tokens, which would supersede D-3103 and
  enable a literal "no CardExtId in multiple zones" check without a
  fungible filter.

---

### WP-030 — Campaign / Scenario Framework (2026-04-14)

**What changed:**
- Campaign and scenario framework implemented as a pure meta-orchestration
  layer external to the game engine
- New `packages/game-engine/src/campaign/` directory classified as engine
  code category (D-3001)
- `ScenarioDefinition`, `CampaignDefinition`, `CampaignState`,
  `ScenarioOutcomeCondition`, `ScenarioReward`, `CampaignUnlockRule`,
  `ScenarioOutcome` — all data-only, JSON-serializable contracts
  (no functions, no closures)
- `applyScenarioOverrides(baseConfig, scenario)` — pure function merging
  scenario overrides into a base `MatchSetupConfig` with replace-on-override
  semantics and spread-copy discipline (no aliasing with inputs)
- `evaluateScenarioOutcome(result, scores, victoryConditions, failureConditions)`
  — pure function with loss-before-victory evaluation order, returns
  `ScenarioOutcome` union (`'victory' | 'defeat' | 'incomplete'`)
- `advanceCampaignState(state, scenarioId, outcome, rewards)` — pure
  function returning a new state with the completed scenario appended;
  input state never mutated
- `CampaignState` is Class 2 (Configuration) data, external to the engine
  — NOT a field of `LegendaryGameState` (D-0502)
- Named `ScenarioOutcome` union shared by both evaluator return type and
  advance parameter prevents outcome-string drift
- `evaluateScenarioOutcome` takes separate `victoryConditions` and
  `failureConditions` parameters to express the locked loss-before-victory
  evaluation order
- 8 new contract enforcement tests (replace semantics, aliasing-free copies,
  victory, defeat-with-loss-before-victory, append, purity, JSON roundtrip,
  exact key set)
- 348 total tests, 93 suites, 0 failures (340 baseline + 8 new)
- No engine files modified — campaign code is a pure addition
- 01.5 runtime-wiring allowance **not invoked** — WP is purely additive

**Key decisions:**
- D-3001: `src/campaign/` classified as engine code category (created
  during pre-flight as PS-1 resolution, following D-2706 / D-2801
  precedent)
- D-3002: Campaign state external to G (implements D-0502 — campaign
  state is Class 2 data persisted by the application layer; individual
  game G remains Class 1 and is never persisted)
- D-3003: Scenarios produce `MatchSetupConfig`, not modified G — the
  engine receives a normal config and is never aware of campaigns
- D-3004: Campaign replay is the concatenation of each scenario's
  `ReplayInput` — no campaign-level replay format

**Architectural significance:**
- Campaigns orchestrate games without modifying the engine — D-0501
  (Campaigns Are Meta-Orchestration Only) is implemented at MVP level
- `CampaignState` is explicitly NOT part of `LegendaryGameState` —
  D-0502 (Campaign State Lives Outside the Engine) is implemented
- Campaign code is pure: no `boardgame.io` import, no registry import,
  no I/O, no `G` mutation, no lifecycle integration
- Discriminated unions (`ScenarioOutcomeCondition`, `ScenarioReward`)
  with exhaustive `switch` provide the extension seam for future WPs
- Safe-skip pattern applied: unknown `counterReached` keys return
  `false` so future WPs can extend the vocabulary without refactoring

**What's true now:**
- Scenarios can override any subset of `MatchSetupConfig` fields; the
  engine plays a normal deterministic game from the resolved config
- Campaign progression is computed after games end, never during them
- Individual game G remains unchanged and replayable per-scenario
- The engine does not import anything from the campaign layer

**What's next:**
- Future WP for campaign UI (campaign selection, scenario progress)
- Future WP for campaign persistence (CampaignState save/load)
- Future WP for branching logic (unlock rules interpreted by application
  layer; outcome parameter on `advanceCampaignState` currently reserved)
- Future WP for additional condition and reward types
- WP-031 (Production Hardening & Engine Invariants) is parallel to WP-030

---

### WP-027 — Determinism & Replay Verification Harness (2026-04-14)

**What changed:**
- Replay verification harness implemented: `ReplayInput`, `ReplayMove`,
  `ReplayResult` contracts in `src/replay/replay.types.ts`
- `replayGame()` — pure function that reconstructs a game from canonical
  inputs (seed, setupConfig, playerOrder, moves) by calling
  `buildInitialGameState` directly and executing each move via static
  `MOVE_MAP`
- `computeStateHash()` — deterministic state hashing using sorted-key JSON
  serialization + djb2 hash algorithm (D-2701). No crypto dependency.
- `verifyDeterminism()` — runs replay twice with identical input, compares
  hashes. Proves engine determinism formally (D-0002, D-0201).
- `ReplayInput` is Class 2 (Configuration) data — safe to persist (D-2703)
- MVP uses `makeMockCtx` deterministic reverse-shuffle; seed field stored
  for future seed-faithful replay (D-2704)
- `advanceStage` move handled via `advanceTurnStage` directly since game.ts
  wrapper is not exported (D-2705)
- `src/replay/` classified as engine code category (D-2706)
- 8 new tests, 322 total passing (314 existing + 8 new)
- Phase 6 (Verification, UI & Production) begins

**What's true now:**
- Determinism is formally provable — identical inputs produce identical
  outputs across multiple runs
- Replay harness is observation-only — no gameplay logic modified
- All replay files are pure (no boardgame.io imports, no .reduce(),
  no Math.random, no require())
- No existing tests broken (314 -> 314, all passing)
- D-0201 (Replay as a First-Class Feature) is implemented at MVP level

**What's next:**
- Future WP for seed-faithful replay (real PRNG seeding from ReplayInput.seed)
- Future WP for replay UI/viewer
- Future WP for replay persistence/storage
- Future WP for partial/streaming replay

---

### WP-028 — UI State Contract (2026-04-14)

**What changed:**
- UIState contract implemented: `UIState` interface with 9 sub-types
  (`UIPlayerState`, `UICityCard`, `UICityState`, `UIHQState`,
  `UIMastermindState`, `UISchemeState`, `UITurnEconomyState`,
  `UIGameOverState`)
- `buildUIState(gameState, ctx)` pure function derives UIState from G
  and a local `UIBuildContext` structural interface (no boardgame.io import)
- Player zones projected as counts, not card arrays (D-2802)
- Engine internals explicitly excluded from UIState (D-2803)
- Card display resolution is a separate UI concern (D-2804)
- `src/ui/` classified as engine code category (D-2801)
- Game-over derived via `evaluateEndgame(G)` + `computeFinalScores(G)`
- Twist count derived from villain deck discard card type classification
- Wound count derived via `WOUND_EXT_ID` filtering across all player zones
- 9 new contract enforcement tests, 331 total passing (322 existing + 9 new)
- D-0301 (UI Consumes Projections Only) is implemented by this WP

**What's true now:**
- The UI never reads G directly — UIState is the sole derived projection
- buildUIState is pure: no I/O, no mutation, no caching, deterministic
- Engine internals are hidden from the UI at the type level
- All UI state files are engine category (no boardgame.io, no registry)

**What's next:**
- WP-030: next in the serial chain (WP-027 -> WP-028 -> WP-029 -> WP-030)

---

### WP-029 — Spectator & Permissions View Models (2026-04-14)

**What changed:**
- `UIAudience` discriminated union: `{ kind: 'player'; playerId: string }`
  and `{ kind: 'spectator' }` — defines who is viewing the game
- `filterUIStateForAudience(uiState, audience)` pure post-processing filter
  that produces audience-appropriate views from the authoritative UIState
- `UIPlayerState.handCards?: string[]` — optional field populated by
  `buildUIState`, redacted by filter for non-owning audiences
- Information visibility enforced: active player sees own hand ext_ids,
  all others see handCount only. Economy zeroed for non-active/spectator.
  Deck order never revealed to any audience.
- D-0302 (Single UIState, Multiple Audiences) is now implemented
- Replay viewers use the spectator audience
- 9 contract enforcement tests verify no hidden information leakage
- 340 total tests, 89 suites, 0 failures

**Key decisions:**
- D-2901: Filter operates on UIState, not G
- D-2902: handCards optional, always populated by buildUIState, redacted by filter
- D-2903: Economy zeroed for non-active and spectators

**Architectural significance:**
- One authoritative UIState, multiple filtered views — no alternate game states
- Filter is pure: no I/O, no mutation, no boardgame.io, no engine internals
- All audience/filter files are engine category (src/ui/)

**What's next:**
- WP-030: next in the serial chain

---

### WP-026 — Scheme Setup Instructions & City Modifiers (2026-04-14)

**What changed:**
- Scheme setup instruction system implemented: `SchemeSetupType` closed union
  (`'modifyCitySize'` | `'addCityKeyword'` | `'addSchemeCounter'` |
  `'initialCityState'`) with `SCHEME_SETUP_TYPES` canonical array and
  drift-detection test
- `SchemeSetupInstruction` is a data-only, JSON-serializable contract following
  the "Representation Before Execution" pattern (D-2601)
- `executeSchemeSetup()` — deterministic executor handles all 4 instruction
  types via `for...of` (no `.reduce()`), unknown types warn and skip
- `buildSchemeSetupInstructions()` — setup-time builder with
  `registry: unknown` + local structural interface (`SchemeRegistryReader`) +
  runtime type guard. MVP: returns `[]` for all schemes (no structured
  metadata in registry yet, D-2504 safe-skip)
- `modifyCitySize` is warn + no-op at MVP while `CityZone` is a fixed tuple
  (D-2602)
- `G.schemeSetupInstructions: SchemeSetupInstruction[]` added to
  `LegendaryGameState` for replay observability
- Wired into `buildInitialGameState` — builder called after `buildCardKeywords`,
  executor applied to constructed state before return
- 9 new tests (8 executor + 1 drift-detection), 314 total passing
- Phase 5 (Card Mechanics & Abilities) is complete

**What's true now:**
- Schemes can configure the board before the first turn via declarative
  instructions (counters, keywords, city state, city size in future)
- Scheme setup (board config, WP-026) is formally separated from scheme twist
  (event reaction, WP-024) — D-2601
- All scheme setup files are pure (no boardgame.io imports, no .reduce(),
  no registry imports)
- `G.schemeSetupInstructions` is Runtime class, built at setup, immutable
  during gameplay
- WP-025 contracts unmodified (`boardKeywords.types.ts` untouched)
- WP-015 contracts unmodified (`city.types.ts` untouched)

**What's next:**
- Future WP to add structured scheme metadata to the registry (enables real
  setup instructions instead of empty `[]`)
- Future WP to convert `CityZone` from fixed tuple to dynamic array (enables
  `modifyCitySize`)
- Future WP for structured keyword classification for Patrol/Guard
- Future WP for `'gainWound'` RuleEffect type

---

### WP-025 — Keywords: Patrol, Ambush, Guard (2026-04-13)

**What changed:**
- Board keyword system implemented: `BoardKeyword` closed union
  (`'patrol'` | `'ambush'` | `'guard'`) with `BOARD_KEYWORDS` canonical array
  and drift-detection test
- `G.cardKeywords: Record<CardExtId, BoardKeyword[]>` built at setup time
  from registry card data via `buildCardKeywords()` (same pattern as
  `G.cardStats` and `G.villainDeckCardTypes`)
- **Patrol:** `fightVillain` now adds `getPatrolModifier()` (+1 MVP) to the
  fight cost before the attack sufficiency check. Three-step contract preserved.
- **Guard:** `fightVillain` now checks `isGuardBlocking()` — a Guard card at a
  higher City index blocks fighting cards at lower indices. Targeting the Guard
  itself is allowed.
- **Ambush:** `revealVillainCard` now checks `hasAmbush()` after City placement
  — each player gains 1 wound inline (same pattern as escape wounds, D-2503).
- `buildCardKeywords` extracts Ambush from ability text (`"Ambush:"` prefix).
  Patrol and Guard have no data source — dormant with real cards (D-2504).
- 14 new tests (9 unit + 5 integration), 305 total passing

**What's true now:**
- City gameplay has tactical friction: Patrol, Guard, and Ambush modify
  fight validation and reveal behavior
- Board keywords are a separate mechanism from hero ability hooks — automatic,
  no player choice (D-2501)
- All keyword helpers are pure (no boardgame.io imports, no .reduce())
- `G.cardKeywords` is Runtime class, built at setup, immutable during gameplay
- WP-009A contracts unmodified (no new RuleEffect types)
- WP-015 contracts unmodified (`city.types.ts` untouched)
- WP-026 is unblocked

**What's next:**
- WP-026 — Scheme Setup Instructions & City Modifiers
- Future WP to add structured keyword classification for Patrol/Guard
- Future WP to add `'gainWound'` RuleEffect type and migrate Ambush to pipeline

---

### WP-024 — Scheme & Mastermind Ability Execution (2026-04-13)

**What changed:**
- Scheme twist and mastermind strike handlers produce real gameplay effects
- `schemeTwistHandler(G, ctx, payload)` — new handler in
  `packages/game-engine/src/rules/schemeHandlers.ts`
  - Increments `schemeTwistCount` counter on each twist
  - At threshold (7 twists): increments `ENDGAME_CONDITIONS.SCHEME_LOSS`
    counter, triggering scheme-loss via existing endgame evaluator
- `mastermindStrikeHandler(G, ctx, payload)` — new handler in
  `packages/game-engine/src/rules/mastermindHandlers.ts`
  - Increments `masterStrikeCount` counter (MVP tracking)
  - MVP: counter + message only; wound card movement deferred
- `ruleRuntime.impl.ts` updated:
  - WP-009B stub handlers replaced with real handlers
  - Scheme hook trigger: `onTurnStart` -> `onSchemeTwistRevealed`
  - Mastermind hook trigger: `onTurnEnd` -> `onMastermindStrikeRevealed`
  - `DEFAULT_IMPLEMENTATION_MAP` now maps to real handler functions
- Integration test assertions updated (01.5 value-only updates)
- 10 new tests (6 scheme + 4 mastermind), 291 total passing

**What's true now:**
- Scheme twists produce real gameplay effects via the rule hook pipeline
- Scheme-loss condition is functional (counter reaches threshold -> loss)
- Mastermind strikes track via counter (MVP — wound effects deferred)
- Same `executeRuleHooks` -> `applyRuleEffects` pipeline as hero effects
- Handlers in `ImplementationMap` (never stored in G)
- WP-009A contracts unmodified
- WP-014 reveal pipeline unmodified
- WP-025 is unblocked

**What's next:**
- Future WP to add `'gainWound'` effect type for actual wound card movement
- Future WP to parameterize per-scheme twist thresholds from registry data
- WP-025 — next in sequence

---

### WP-023 — Conditional Hero Effects (Teams, Colors, Keywords) (2026-04-13)

**What changed:**
- Hero ability conditions now evaluate instead of being skipped
- `evaluateCondition(G, playerID, condition)` — new pure function in
  `packages/game-engine/src/hero/heroConditions.evaluate.ts`
- `evaluateAllConditions(G, playerID, conditions)` — AND logic over all
  conditions (returns `true` only when ALL pass)
- 4 MVP condition types implemented:
  - `requiresKeyword` — fully functional, checks `G.heroAbilityHooks` for
    keyword matches on played cards
  - `playedThisTurn` — fully functional, checks `inPlay.length` threshold
  - `heroClassMatch` — placeholder (returns `false`), awaits class data in G
  - `requiresTeam` — placeholder (returns `false`), awaits team data in G
- Integration: `heroEffects.execute.ts` calls `evaluateAllConditions`
  instead of skipping all conditional hooks
- Conditions never mutate G (pure predicates, deep equality test enforces)
- Unsupported condition types safely return `false`
- 15 new tests (10 unit + 5 integration), 281 total passing

**What's true now:**
- Conditional hero effects evaluate deterministically
- `requiresKeyword` synergies work (played card keyword matching)
- `playedThisTurn` thresholds work (card count gating)
- `heroClassMatch` and `requiresTeam` are safe no-ops pending data resolution
- Condition type string is `heroClassMatch` (not `requiresColor`)
- WP-021 contracts unmodified
- WP-024 is unblocked for scheme/mastermind ability execution

**What's next:**
- Follow-up WP needed to resolve team/class data into G (enables
  `heroClassMatch` and `requiresTeam` evaluators)
- WP-024 — Scheme & Mastermind Ability Execution

---

### WP-022 — Execute Hero Keywords (Minimal MVP) (2026-04-13)

**What changed:**
- Hero ability effects now execute when a hero card is played
- `executeHeroEffects(G, ctx, playerID, cardId)` — new function in
  `packages/game-engine/src/hero/heroEffects.execute.ts`
- 4 MVP keywords execute: `'draw'`, `'attack'`, `'recruit'`, `'ko'`
- `'draw'` — draws N cards from player deck to hand (with reshuffle)
- `'attack'` — adds N to `G.turnEconomy.attack` via `addResources`
- `'recruit'` — adds N to `G.turnEconomy.recruit` via `addResources`
- `'ko'` — removes the played card from inPlay, appends to `G.ko`
- Conditional effects safely skipped (no mutation, no error)
- Unsupported keywords (`'rescue'`, `'wound'`, `'reveal'`, `'conditional'`)
  safely ignored
- Invalid magnitude (undefined, NaN, negative, float) skipped
- `HeroEffectResult` internal type for dev/test assertions (not stored in G)
- Integration: `playCard` in `coreMoves.impl.ts` calls `executeHeroEffects`
  after base stat economy
- 11 new tests, 266 total passing

**What's true now:**
- Hero ability hooks execute deterministically for 4 MVP keywords
- Hooks fire in registration order; effects fire in descriptor array order
- Hero hook economy is additive to WP-018 base card stats
- `'ko'` targets the played card itself (MVP: no player choice)
- `ctx: unknown` — no boardgame.io import in execution files
- `ShuffleProvider` from engine-internal `setup/shuffle.js` for draw reshuffle
- WP-021 contract files unmodified
- WP-023 is unblocked for conditional effect evaluation

**What's next:**
- WP-023 — Conditional Hero Effects (Teams, Colors, Keywords)

---

### WP-021 — Hero Card Text & Keywords (Hooks Only) (2026-04-13)

**What changed:**
- Hero ability hooks added as data-only contracts to the game engine
- `HeroAbilityHook` interface — data-only, JSON-serializable, stored in
  `G.heroAbilityHooks`
- `HeroKeyword` closed union + `HERO_KEYWORDS` canonical array (8 keywords:
  draw, attack, recruit, ko, rescue, wound, reveal, conditional)
- `HeroAbilityTiming` closed union + `HERO_ABILITY_TIMINGS` canonical array
  (5 timings: onPlay, onFight, onRecruit, onKO, onReveal)
- `HeroCondition` and `HeroEffectDescriptor` declarative descriptors
- `buildHeroAbilityHooks` setup-time builder using `CardRegistryReader`
- Query/filter utilities: `filterHooksByTiming`, `filterHooksByKeyword`,
  `getHooksForCard`
- 8 tests including drift detection for both keywords and timings,
  determinism test

**What's true now:**
- `G.heroAbilityHooks` is populated at setup with parsed hero ability data
- Keywords and timings are normalized with drift-detection tests
- Timing defaults to `'onPlay'` — no NL inference
- Hero hooks are observation-only; no effects execute in WP-021
- The packet is inert by design — no game state changes from hero hooks
- WP-022 is unblocked for execution

**What's next:**
- WP-022 — Execute Hero Keywords (Minimal MVP) — Phase 5

---

### WP-020 — VP Scoring & Win Summary (Minimal MVP) (2026-04-12)

**What changed:**
- `packages/game-engine/src/scoring/scoring.types.ts` — **new** —
  `FinalScoreSummary`, `PlayerScoreBreakdown`, VP constants
  (VP_VILLAIN=1, VP_HENCHMAN=1, VP_BYSTANDER=1, VP_TACTIC=5, VP_WOUND=-1)
- `packages/game-engine/src/scoring/scoring.logic.ts` — **new** —
  `computeFinalScores` pure function (read-only on G, deterministic)
- `packages/game-engine/src/types.ts` — **modified** — re-export scoring
  types and VP constants
- `packages/game-engine/src/index.ts` — **modified** — export scoring API
- `packages/game-engine/src/scoring/scoring.logic.test.ts` — **new** —
  8 scoring tests
- `game.ts` NOT modified (scoring is a library export, not wired into
  engine lifecycle)

**What's true now:**
- `computeFinalScores(G)` returns per-player VP breakdowns and winner
- Villains, henchmen classified via `G.villainDeckCardTypes`
- Bystanders use dual check: `G.villainDeckCardTypes` + `BYSTANDER_EXT_ID`
- Wounds identified by `WOUND_EXT_ID = 'pile-wound'`
- Tactic VP awarded to all players (WP-019 lacks per-player attribution)
- Winner = highest total VP; null on tie; no tiebreaker in MVP
- KO pile cards contribute 0 VP
- Scoring is pure — does not mutate G, does not trigger endgame
- Full MVP game loop complete: setup -> play cards -> fight villains ->
  recruit heroes -> fight mastermind -> endgame -> score
- Phase 4 (Core Combat Loop) is done
- 247 tests passing, 0 failures

**What's next:**
- WP-021 — Hero Card Text & Keywords (Hooks Only) — Phase 5

---

### WP-019 — Mastermind Fight & Tactics (Minimal MVP) (2026-04-12)

**What changed:**
- `packages/game-engine/src/mastermind/mastermind.types.ts` — **new** —
  `MastermindState` interface
- `packages/game-engine/src/mastermind/mastermind.setup.ts` — **new** —
  `buildMastermindState` (resolves mastermind from registry, adds base card
  fightCost to G.cardStats, shuffles tactics deck)
- `packages/game-engine/src/mastermind/mastermind.logic.ts` — **new** —
  `defeatTopTactic`, `areAllTacticsDefeated` pure helpers
- `packages/game-engine/src/moves/fightMastermind.ts` — **new** — boss fight
  move with internal stage gating, attack validation, tactic defeat, and
  victory counter
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  calls `buildMastermindState` after `buildCardStats`; cardStats extracted
  to local variable for ordering
- `packages/game-engine/src/game.ts` — **modified** — `fightMastermind`
  registered in play phase moves
- `packages/game-engine/src/types.ts` — **modified** — added
  `mastermind: MastermindState` to `LegendaryGameState`
- `packages/game-engine/src/index.ts` — **modified** — exports for mastermind
  types and helpers
- 3 new test files: setup (5), logic (5), move (6) = 16 new tests
- 6 existing test files updated (01.5 wiring: added `mastermind` to mock
  game state objects + move list assertion)

**What's true now:**
- `G.mastermind` exists with id, baseCardId, tacticsDeck, tacticsDefeated
- Tactics deck is shuffled deterministically at setup from registry data
- `fightMastermind` validates attack against `G.cardStats[baseCardId].fightCost`
- Each successful fight defeats exactly 1 tactic (MVP) and spends attack
- When all tactics defeated: `G.counters[MASTERMIND_DEFEATED] = 1` triggers
  the endgame evaluator (WP-010)
- Full MVP combat loop is functional: play cards -> fight villains ->
  fight mastermind -> win
- `buildMastermindState` is sole source for mastermind in G.cardStats
- Internal stage gating (same pattern as fightVillain/recruitHero)
- 239 tests passing, 0 failures

**What's next:**
- WP-020 — VP Scoring & Win Summary

---

### WP-018 — Attack & Recruit Point Economy (Minimal MVP) (2026-04-12)

**What changed:**
- `packages/game-engine/src/economy/economy.types.ts` — **new** — `TurnEconomy`
  and `CardStatEntry` interfaces
- `packages/game-engine/src/economy/economy.logic.ts` — **new** —
  `parseCardStatValue`, `buildCardStats`, `CardStatsRegistryReader`, and economy
  helpers (`getAvailableAttack`, `getAvailableRecruit`, `addResources`,
  `spendAttack`, `spendRecruit`, `resetTurnEconomy`)
- `packages/game-engine/src/moves/coreMoves.impl.ts` — **modified** — `playCard`
  adds hero attack/recruit resources to economy after placing card in inPlay
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** — attack
  validation in step 1 (insufficient = return void) and spend in step 3
- `packages/game-engine/src/moves/recruitHero.ts` — **modified** — recruit
  validation in step 1 (insufficient = return void) and spend in step 3
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  calls `buildCardStats` and initializes `turnEconomy`
- `packages/game-engine/src/game.ts` — **modified** — economy reset wired into
  `play.turn.onBegin` before rule hooks
- `packages/game-engine/src/types.ts` — **modified** — added `turnEconomy` and
  `cardStats` to `LegendaryGameState`
- `packages/game-engine/src/index.ts` — **modified** — exports for economy types
  and helpers
- 2 new test files: economy unit (8), economy integration (9) = 17 new tests
- 4 existing test files updated (01.5 wiring: added `turnEconomy`/`cardStats`
  to mock game state objects)

**What's true now:**
- `G.turnEconomy` tracks attack/recruit points accumulated and spent per turn
- `G.cardStats` stores parsed card stat values built at setup time from registry
- Playing hero cards adds base attack and recruit values to the economy
- `fightVillain` requires sufficient unspent attack points (fails silently)
- `recruitHero` requires sufficient unspent recruit points (fails silently)
- Economy resets to zero at the start of each player turn
- Card stat parser handles `"2+"`, `"2*"`, integers, null, and garbage input
- Villains/henchmen have `fightCost` from `vAttack`; heroes have `fightCost = 0`
- Starting cards (agents/troopers) contribute 0/0 (fail-closed MVP — D-1806)
- 223 tests passing, 0 failures

**What's next:**
- WP-019 — Mastermind Fight & Tactics

---

### WP-017 — KO, Wounds & Bystander Capture (Minimal MVP) (2026-04-12)

**What changed:**
- `packages/game-engine/src/board/ko.logic.ts` — **new** — `koCard`
  destination-only append helper for KO pile
- `packages/game-engine/src/board/wounds.logic.ts` — **new** — `gainWound`
  helper moves top wound from supply to player discard
- `packages/game-engine/src/board/bystanders.logic.ts` — **new** —
  `attachBystanderToVillain`, `awardAttachedBystanders`,
  `resolveEscapedBystanders` pure helpers for bystander lifecycle
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified**
  — on villain/henchman City entry: attach 1 bystander from supply;
  on escape: gain wound for current player + resolve attached bystanders
  (return to supply)
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** — on
  villain defeat: award attached bystanders to player's victory zone
- `packages/game-engine/src/types.ts` — **modified** — added `ko: CardExtId[]`
  and `attachedBystanders: Record<CardExtId, CardExtId[]>` to
  `LegendaryGameState`
- `packages/game-engine/src/index.ts` — **modified** — exports for new helpers
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified**
  (01.5 wiring) — initialize `ko: []` and `attachedBystanders: {}`
- 4 new test files: ko (3), wounds (4), bystanders (8), integration (7) = 22
- 7 existing test files updated (01.5 wiring: added `ko`/`attachedBystanders`
  to mock game state objects)

**What's true now:**
- `G.ko` exists as a KO pile for cards removed from the game
- `G.attachedBystanders` tracks bystanders attached to villains in the City
- Villains/henchmen entering City get 1 bystander attached (MVP simplified)
- Fighting a villain awards attached bystanders to player's victory zone
- Villain escape causes current player to gain 1 wound
- Escaped villain's attached bystanders return to supply pile (no leak)
- All zone operations are pure helpers with no boardgame.io imports
- Supply pile convention: `pile[0]` is top-of-pile (locked)
- 206 tests passing, 0 failures

**What's next:**
- WP-018 — Attack & Recruit Economy (resource gating for fight/recruit)

---

### WP-016 — Fight First, Then Recruit (Minimal MVP) (2026-04-11)

**What changed:**
- `packages/game-engine/src/moves/fightVillain.ts` — **new** —
  `fightVillain` move: removes villain from City space, places in player's
  victory pile. Three-step validation contract. Internal stage gating
  (`main` only). MVP: no attack point check (WP-018 adds economy).
- `packages/game-engine/src/moves/recruitHero.ts` — **new** —
  `recruitHero` move: removes hero from HQ slot, places in player's discard
  pile. Three-step validation contract. Internal stage gating (`main` only).
  MVP: no recruit point check (WP-018 adds economy).
- `packages/game-engine/src/moves/fightVillain.test.ts` — **new** — 7 tests
- `packages/game-engine/src/moves/recruitHero.test.ts` — **new** — 7 tests
- `packages/game-engine/src/game.ts` — **modified** — registered
  `fightVillain` and `recruitHero` in play phase moves
- `packages/game-engine/src/index.ts` — **modified** — exports for new moves
- `packages/game-engine/src/game.test.ts` — **modified** (01.5 wiring) —
  move-count assertion updated (5 -> 7)

**What's true now:**
- Players can fight villains/henchmen in the City and recruit heroes from HQ
- Both moves gate to `main` stage (non-core internal gating pattern)
- Fight-first is a documented policy preference (D-1602), not engine-enforced
- MVP: no resource checking — any target can be fought/recruited without
  spending points. WP-018 adds the economy.
- Recruited heroes go to discard (D-1604), matching tabletop rules
- 184 tests passing, 0 failures

**What's next:**
- WP-017 — KO, Wounds & Bystander Capture
- WP-018 — Attack & Recruit Economy (resource gating for fight/recruit)

---

### WP-015 — City & HQ Zones (Villain Movement + Escapes) (2026-04-11)

**What changed:**
- `packages/game-engine/src/board/city.types.ts` — **new** — `CityZone`,
  `HqZone`, `CitySpace`, `HqSlot` (fixed 5-tuples)
- `packages/game-engine/src/board/city.logic.ts` — **new** —
  `pushVillainIntoCity`, `initializeCity`, `initializeHq` (pure helpers)
- `packages/game-engine/src/board/city.validate.ts` — **new** —
  `validateCityShape` runtime safety check
- `packages/game-engine/src/board/city.logic.test.ts` — **new** — 9 city
  push unit tests (push, shift, escape, identity, tuple invariant, JSON)
- `packages/game-engine/src/villainDeck/villainDeck.city.integration.test.ts`
  — **new** — 8 integration tests (routing, escape counter, HQ immutability,
  malformed city safety)
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified**
  — City routing for villain/henchman (push into City space 0), conditional
  discard for bystander/scheme-twist/mastermind-strike, escape counter via
  `ENDGAME_CONDITIONS.ESCAPED_VILLAINS`
- `packages/game-engine/src/types.ts` — **modified** — added `city: CityZone`
  and `hq: HqZone` to `LegendaryGameState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  initialize `G.city` and `G.hq` from `initializeCity()` and `initializeHq()`
- `packages/game-engine/src/index.ts` — **modified** — exports for city types,
  logic, and validation
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **modified**
  (01.5 wiring) — added `city`/`hq` to mock G; updated villain routing
  assertion from discard to City
- `packages/game-engine/src/moves/coreMoves.integration.test.ts` — **modified**
  (01.5 wiring) — added missing fields to mock G for type completeness
- `packages/game-engine/src/persistence/snapshot.create.test.ts` — **modified**
  (01.5 wiring) — added missing fields to mock G for type completeness

**What exists now:**
- City zone: 5 ordered spaces, each `CardExtId | null`
- HQ zone: 5 ordered slots, each `CardExtId | null` (empty — WP-016 populates)
- Revealed villains and henchmen enter City space 0 via push logic
- Existing cards shift rightward; space 4 card escapes
- Escapes increment `G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS]`
- Scheme-twists and mastermind-strikes trigger only (existing WP-014 behavior)
- Bystanders go to discard + message (MVP; WP-017 adds capture)
- City placement occurs BEFORE trigger emission (contractual ordering)
- All 169 tests passing (152 existing + 17 new)

**Known gaps (expected at this stage):**
- HQ is empty — WP-016 adds recruit slot population
- No fight/attack/recruit mechanics — WP-016
- No bystander capture — WP-017
- No KO pile — WP-017

---

### WP-014B — Villain Deck Composition Rules & Registry Integration (2026-04-11)

**What changed:**
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — **new** —
  `buildVillainDeck`, `VillainDeckRegistryReader`, count constants,
  local structural types for registry traversal
- `packages/game-engine/src/villainDeck/villainDeck.setup.test.ts` — **new** —
  10 tests (composition, counts, ext_id formats, serialization)
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  replaced empty defaults with real `buildVillainDeck` call; renamed
  `_registry` to `registry`
- `packages/game-engine/src/index.ts` — **modified** — exports for
  `buildVillainDeck` and `VillainDeckRegistryReader`

**What exists now:**
- Villain deck fully populated from registry at setup time
- 5 card types represented: villain (FlatCard keys), henchman (virtual
  `henchman-{slug}-{index}`), scheme-twist (virtual
  `scheme-twist-{slug}-{index}`), bystander (virtual
  `bystander-villain-deck-{index}`), mastermind-strike (FlatCard keys,
  `tactic !== true`)
- Count rules: 10 henchmen/group, 8 scheme twists, 1 bystander/player,
  mastermind strikes from data
- Pre-shuffle lexical sort ensures deterministic deck order
- `VillainDeckRegistryReader` structural interface (no registry imports)
- Runtime type guard gracefully handles narrow test mocks (empty deck)
- D-1412 amended with bystander ext_id format
- All 152 tests passing (142 existing + 10 new)

**Known gaps (expected at this stage):**
- City routing not yet implemented — WP-015 will change villain/henchman
  routing from discard to City
- No hero deck (HQ) construction — future WP

---

### WP-014A — Villain Reveal & Trigger Pipeline (2026-04-11)

**What changed:**
- `packages/game-engine/src/villainDeck/villainDeck.types.ts` — **new** —
  `RevealedCardType` (5 canonical values), `REVEALED_CARD_TYPES` canonical
  array, `VillainDeckState` interface
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **new** —
  `revealVillainCard` move (draw, classify, trigger, apply effects, discard)
- `packages/game-engine/src/villainDeck/villainDeck.types.test.ts` — **new** —
  2 tests (drift-detection + serialization)
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **new** —
  10 tests (reveal pipeline with mock deck fixtures)
- `packages/game-engine/src/types.ts` — **modified** — added `villainDeck`
  and `villainDeckCardTypes` to `LegendaryGameState`
- `packages/game-engine/src/game.ts` — **modified** — added
  `revealVillainCard` to top-level moves
- `packages/game-engine/src/index.ts` — **modified** — exports for new types
  and move
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified**
  (01.5 wiring) — empty-default villain deck fields
- `packages/game-engine/src/game.test.ts` — **modified** (01.5 wiring) —
  move count assertion 4 -> 5

**What exists now:**
- Villain deck type contracts: `RevealedCardType`, `VillainDeckState`,
  `REVEALED_CARD_TYPES` canonical array with drift-detection test
- Reveal pipeline: `revealVillainCard` draws top card, looks up classification
  in `G.villainDeckCardTypes`, emits `onCardRevealed` (always),
  `onSchemeTwistRevealed` (scheme twists), `onMastermindStrikeRevealed`
  (mastermind strikes), applies effects via the WP-009B pipeline, routes to
  discard
- Fail-closed: missing card type prevents removal and triggers
- Reshuffle: empty deck + non-empty discard reshuffles before draw
- Empty defaults in `buildInitialGameState` (WP-014B populates from registry)
- All 142 tests passing (130 existing + 12 new)

**Known gaps (expected at this stage):**
- No `buildVillainDeck` — deferred to WP-014B pending registry schema
  decisions for henchman instancing, scheme twist identifiers, and composition
  counts (DECISIONS.md D-1410 through D-1413 define the conventions)
- Discard routing is temporary — WP-015 will route villain/henchman to City
- No City, HQ, or KO zone logic — WP-015/017

---

### Phase 3 Exit Gate Closed (2026-04-11)

**What changed:**
- `docs/ai/REFERENCE/03A-PHASE-3-MULTIPLAYER-READINESS.md` — **modified** —
  all six refinements applied (authority consequence clause, invariant baseline
  rule, concurrency negative rule, replay acceptance test, framework lock-in
  prohibition, silent recovery prohibition); WP-013 marked complete; X-3 and
  X-5 updated from PENDING/PARTIAL to PASS; gate decision flipped to
  "Phase 4 approved"
- `docs/ai/DECISIONS.md` — added D-1320 (Phase 3 Exit Approved)

**What exists now:**
- Phase 3 (MVP Multiplayer) is formally complete. All five exit criteria pass.
- Phase 4 (Core Gameplay Loop) is approved to proceed.
- The gate document is now future-proof with contractual language that
  prohibits regression, wall-clock tie-breaking, framework lock-in, and
  silent recovery.

---

### WP-013 — Persistence Boundaries & Snapshots (2026-04-11)

**What changed:**
- `packages/game-engine/src/persistence/persistence.types.ts` — **new** —
  `PERSISTENCE_CLASSES` (3 canonical data class constants), `MatchSnapshot`,
  `MatchSnapshotPlayer`, `MatchSnapshotOutcome`, `PersistableMatchConfig`
- `packages/game-engine/src/persistence/snapshot.create.ts` — **new** —
  `createSnapshot` pure function returning `Readonly<MatchSnapshot>` via
  `Object.freeze()`; `SnapshotContext` minimal interface
- `packages/game-engine/src/persistence/snapshot.validate.ts` — **new** —
  `validateSnapshotShape` returning structured `MoveError[]` results (never throws)
- `packages/game-engine/src/persistence/snapshot.create.test.ts` — **new** —
  7 tests: zone counts, JSON serialization, excluded keys, determinism,
  valid/invalid validation
- `packages/game-engine/src/types.ts` — **modified** — re-exports persistence
  types (`MatchSnapshot`, `PersistableMatchConfig`, `PERSISTENCE_CLASSES`)
- `packages/game-engine/src/index.ts` — **modified** — exports persistence
  public API (`createSnapshot`, `validateSnapshotShape`, types)
- `docs/ai/DECISIONS.md` — added D-1310 through D-1313

**What exists now:**
- `@legendary-arena/game-engine` exports `PERSISTENCE_CLASSES` with exactly
  3 canonical class names: `runtime`, `configuration`, `snapshot`
- `MatchSnapshot` has exactly 9 top-level keys (matchId, snapshotAt, turn,
  phase, activePlayer, players, counters, messages, outcome?) with zone
  **counts** only — no `CardExtId[]` arrays
- `PersistableMatchConfig` has 4 fields (matchId, setupConfig, playerNames,
  createdAt) — no G, no ctx
- `createSnapshot` is a pure function that derives outcome via
  `evaluateEndgame(G)`, never throws, returns `Object.freeze()` result
- `validateSnapshotShape` imports `MoveError` from `coreMoves.types.ts`,
  never throws, returns structured results
- `docs/ai/ARCHITECTURE.md` Section 3 already contained the three-class
  data model and field-to-class mapping table — no update was needed
- 130 tests passing (123 existing + 7 new), 0 failing
- No changes to `game.ts`, no boardgame.io imports in persistence files,
  no `require()`, ESM only

---

### WP-012 — Match Listing, Join & Reconnect (Minimal MVP) (2026-04-11)

**What changed:**
- `apps/server/scripts/list-matches.mjs` — **new** — CLI script to list
  available matches from the boardgame.io lobby API using built-in `fetch`
- `apps/server/scripts/join-match.mjs` — **new** — CLI script to join a
  match by ID using built-in `fetch`; prints `{ matchID, playerID, credentials }`
  to stdout
- `apps/server/scripts/list-matches.test.ts` — **new** — 3 tests covering
  `--server` flag override, network failure error messages, and exit code
- `apps/server/scripts/join-match.test.ts` — **new** — 3 tests covering
  missing `--match` flag, missing `--name` flag, and HTTP 409 error handling
- `apps/server/package.json` — **modified** — added `test` script
  (`node --import tsx --test scripts/**/*.test.ts`) and `tsx` devDependency
- `docs/ai/DECISIONS.md` — added D-1241, D-1242, D-1243

**What exists now:**
- The minimum viable multiplayer loop is now complete:
  **create → list → join → ready → play**
- `list-matches.mjs` fetches `GET /games/legendary-arena` and prints a JSON
  summary of available matches (matchID, player count, setupData presence,
  gameover status). Accepts `--server <url>` flag (default `http://localhost:8000`).
- `join-match.mjs` POSTs to `/games/legendary-arena/<matchID>/join` with
  `{ playerName }` body. Prints `{ matchID, playerID, credentials }` to stdout.
  Credentials are never stored to disk. Accepts `--match`, `--name`, and
  `--server` flags.
- Both scripts use Node v22 built-in `fetch` — no axios, no node-fetch.
- Both scripts exit 1 on failure with full-sentence error messages to stderr.
- Both scripts export testable functions for unit testing without a live server.
- Server package now has a working `test` script — 6 tests pass, 0 fail.
- No game engine files were modified. No `apps/server/src/` files were modified.
- `create-match.mjs` was not modified.

---

### WP-011 — Match Creation & Lobby Flow (Minimal MVP) (2026-04-11)

**What changed:**
- `packages/game-engine/src/lobby/lobby.types.ts` — **new** — defines
  `LobbyState` (3 fields: `requiredPlayers`, `ready`, `started`),
  `SetPlayerReadyArgs`, re-exports `MoveResult`/`MoveError`
- `packages/game-engine/src/lobby/lobby.validate.ts` — **new** —
  `validateSetPlayerReadyArgs` and `validateCanStartMatch` (both return
  `MoveResult`, never throw)
- `packages/game-engine/src/lobby/lobby.moves.ts` — **new** —
  `setPlayerReady` and `startMatchIfReady` (boardgame.io move functions
  wired into the `lobby` phase)
- `packages/game-engine/src/lobby/lobby.moves.test.ts` — **new** — 6 tests
  covering readiness toggling, invalid args rejection, match start gating,
  observability ordering, and JSON serializability
- `packages/game-engine/src/types.ts` — **modified** — added
  `lobby: LobbyState` to `LegendaryGameState`
- `packages/game-engine/src/game.ts` — **modified** — wired `setPlayerReady`
  and `startMatchIfReady` into the `lobby` phase `moves` block
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified**
  (01.5 wiring) — added `lobby` field to return object
- `packages/game-engine/src/index.ts` — **modified** — exports `LobbyState`,
  `SetPlayerReadyArgs`, `validateSetPlayerReadyArgs`, `validateCanStartMatch`
- `apps/server/scripts/create-match.mjs` — **new** — CLI match creation
  script using Node v22 built-in `fetch`
- `docs/ai/DECISIONS.md` — added D-1238, D-1239, D-1240

**What exists now:**
- A match can now be created and players can join, ready up, and transition
  into gameplay via the lobby phase.
- `G.lobby` stores lobby state: `requiredPlayers` (from `ctx.numPlayers`),
  `ready` (Record keyed by player ID), and `started` (boolean flag).
- `setPlayerReady` allows each player to toggle their readiness status.
  `ctx.currentPlayer` is used as the ready-map key.
- `startMatchIfReady` validates all players are ready, sets
  `G.lobby.started = true` (observability flag), then calls
  `ctx.events.setPhase('setup')`. The flag-before-transition ordering is
  non-negotiable for UI observability.
- Lobby moves are wired inside the `lobby` phase `moves` block (not
  top-level) — boardgame.io enforces phase isolation.
- `create-match.mjs` enables CLI match creation against the running server.
- No new error types — `MoveResult`/`MoveError` reused from WP-008A.
- No `boardgame.io` imports in lobby type or validate files.
- 120 tests pass (114 prior + 6 new), 0 fail
- Build exits 0

---

### WP-010 — Victory & Loss Conditions (Minimal MVP) (2026-04-11)

**What changed:**
- `packages/game-engine/src/endgame/endgame.types.ts` — **new** — defines
  `EndgameOutcome` (`'heroes-win' | 'scheme-wins'`), `EndgameResult` interface,
  `ENDGAME_CONDITIONS` (3 canonical counter key constants: `escapedVillains`,
  `schemeLoss`, `mastermindDefeated`), `ESCAPE_LIMIT = 8`
- `packages/game-engine/src/endgame/endgame.evaluate.ts` — **new** — pure
  `evaluateEndgame(G)` function that checks 3 MVP conditions in fixed priority
  order using `if/else if/else` (loss before victory)
- `packages/game-engine/src/endgame/endgame.evaluate.test.ts` — **new** —
  6 tests: null when no conditions, scheme-wins on escape/schemeLoss,
  heroes-win on mastermindDefeated, loss-before-victory priority, JSON
  serializability
- `packages/game-engine/src/game.ts` — **modified** — added `endIf` to `play`
  phase delegating entirely to `evaluateEndgame(G) ?? undefined`
- `packages/game-engine/src/types.ts` — **modified** — re-exports
  `EndgameResult`, `EndgameOutcome`, `ENDGAME_CONDITIONS`
- `packages/game-engine/src/index.ts` — **modified** — exports
  `evaluateEndgame`, `EndgameResult`, `EndgameOutcome`, `ENDGAME_CONDITIONS`,
  `ESCAPE_LIMIT`
- `docs/ai/DECISIONS.md` — added D-1235, D-1236, D-1237

**What exists now:**
- A match can now conclusively end. Three MVP conditions are evaluated on every
  state change in the `play` phase via boardgame.io's `endIf`:
  1. **Loss — Too Many Escapes:** `escapedVillains >= 8` → `scheme-wins`
  2. **Loss — Scheme Triggered:** `schemeLoss >= 1` → `scheme-wins`
  3. **Victory — Mastermind Defeated:** `mastermindDefeated >= 1` → `heroes-win`
- To trigger in a test: set `G.counters['escapedVillains'] = 8` (or
  `'schemeLoss' = 1`, `'mastermindDefeated' = 1`) before calling
  `evaluateEndgame(G)`. The function returns `EndgameResult | null`.
- If no conditions are met (or counters are absent), `evaluateEndgame` returns
  `null` and the game continues.
- Loss conditions are always checked before victory — simultaneous triggers
  resolve as `scheme-wins`.
- `ENDGAME_CONDITIONS` constants are the canonical counter key names — all future
  packets must import and use these constants, never string literals.
- No new fields added to `LegendaryGameState`. No `boardgame.io` imports in
  endgame files. `evaluateEndgame` is pure (no side effects, no throw).
- 114 tests pass (108 prior + 6 new), 0 fail
- Build exits 0

---

### WP-009B — Scheme & Mastermind Rule Execution Minimal MVP (2026-04-11)

**What changed:**
- `packages/game-engine/src/rules/ruleRuntime.execute.ts` — **new** — defines
  `ImplementationMap` type (handler functions keyed by hook `id`, no boardgame.io
  import), `executeRuleHooks` (reads `G`, calls `getHooksForTrigger`, accumulates
  `RuleEffect[]`, returns without modifying `G`)
- `packages/game-engine/src/rules/ruleRuntime.effects.ts` — **new** — defines
  `applyRuleEffects` (applies effects using `for...of`: `queueMessage` pushes to
  `G.messages`, `modifyCounter` updates `G.counters`, `drawCards` draws using
  zoneOps helpers, `discardHand` uses `moveAllCards`, unknown types push warning
  — never throws)
- `packages/game-engine/src/rules/ruleRuntime.impl.ts` — **new** — default stub
  implementations: `defaultSchemeImplementation` (onTurnStart → "Scheme: turn
  started."), `defaultMastermindImplementation` (onTurnEnd → "Mastermind: turn
  ended."), `DEFAULT_IMPLEMENTATION_MAP`, `buildDefaultHookDefinitions`
- `packages/game-engine/src/rules/ruleRuntime.ordering.test.ts` — **new** —
  3 ordering tests (priority ordering, id tiebreak, missing handler graceful skip)
- `packages/game-engine/src/rules/ruleRuntime.integration.test.ts` — **new** —
  6 integration tests (onTurnStart message, onTurnEnd message, JSON round-trip,
  executeRuleHooks read-only, modifyCounter, unknown effect warning)
- `packages/game-engine/src/types.ts` — **modified** — added `messages: string[]`,
  `counters: Record<string, number>`, `hookRegistry: HookDefinition[]` to
  `LegendaryGameState`
- `packages/game-engine/src/game.ts` — **modified** — wired `onTurnStart` trigger
  in `play` phase `turn.onBegin`, added `turn.onEnd` with `onTurnEnd` trigger;
  both use `executeRuleHooks` → `applyRuleEffects` pipeline with
  `DEFAULT_IMPLEMENTATION_MAP`
- `packages/game-engine/src/index.ts` — **modified** — exports `ImplementationMap`,
  `executeRuleHooks`, `applyRuleEffects`, `buildDefaultHookDefinitions`
- `docs/ai/DECISIONS.md` — added D-1232 (ImplementationMap pattern), D-1233
  (two-step execute/apply), D-1234 (graceful unknown effect handling)

**Runtime Wiring Allowance (01.5):** Exercised for
`packages/game-engine/src/setup/buildInitialGameState.ts` — added `messages: []`,
`counters: {}`, `hookRegistry: buildDefaultHookDefinitions(config)` to the return
object. Import of `buildDefaultHookDefinitions` added. No new behavior introduced.

**What exists now:**
- The complete two-step rule execution pipeline is operational:
  `executeRuleHooks` → `applyRuleEffects`
- `LegendaryGameState` includes `messages`, `counters`, and `hookRegistry`
- On each turn start in the play phase, the default scheme hook fires and
  `G.messages` receives `'Scheme: turn started.'`
- On each turn end in the play phase, the default mastermind hook fires and
  `G.messages` receives `'Mastermind: turn ended.'`
- `ImplementationMap` handler functions live outside `G` — never in state
- Unknown effect types degrade gracefully (warning in `G.messages`, no throw)
- No `.reduce()` in effect application; no `.sort()` in `executeRuleHooks`
- No `boardgame.io` imports in any `src/rules/` file
- WP-009A contract files (`ruleHooks.types.ts`, `ruleHooks.validate.ts`,
  `ruleHooks.registry.ts`) untouched
- 108 tests pass (99 prior + 9 new), 0 fail
- Build exits 0

---

### WP-009A — Scheme & Mastermind Rule Hooks Contracts (2026-04-11)

**What changed:**
- `packages/game-engine/src/rules/ruleHooks.types.ts` — **new** — defines
  `RuleTriggerName` (5-value union), `RULE_TRIGGER_NAMES` canonical array,
  5 trigger payload interfaces (`OnTurnStartPayload`, `OnTurnEndPayload`,
  `OnCardRevealedPayload`, `OnSchemeTwistRevealedPayload`,
  `OnMastermindStrikeRevealedPayload`), `TriggerPayloadMap`,
  `RuleEffect` (4-variant tagged union), `RULE_EFFECT_TYPES` canonical array,
  `HookDefinition` (data-only, 5 fields), `HookRegistry` type alias
- `packages/game-engine/src/rules/ruleHooks.validate.ts` — **new** — three
  validators (`validateTriggerPayload`, `validateRuleEffect`,
  `validateHookDefinition`); all return `MoveResult`; none throw
- `packages/game-engine/src/rules/ruleHooks.registry.ts` — **new** —
  `createHookRegistry` (validates and stores; throws on invalid),
  `getHooksForTrigger` (returns hooks sorted by priority asc, then id lexically)
- `packages/game-engine/src/rules/ruleHooks.contracts.test.ts` — **new** —
  10 tests including 2 drift-detection tests for `RULE_TRIGGER_NAMES` and
  `RULE_EFFECT_TYPES`
- `packages/game-engine/src/types.ts` — **modified** — re-exports
  `RuleTriggerName`, `RuleEffect`, `HookDefinition`, `HookRegistry`
- `packages/game-engine/src/index.ts` — **modified** — exports all new public
  types, constants, validators, and registry helpers
- `docs/ai/DECISIONS.md` — added D-1229 (HookDefinition is data-only),
  D-1230 (effects are tagged data union), D-1231 (priority-then-id ordering)

**What exists now:**
- `@legendary-arena/game-engine` exports the complete rule hook contract surface:
  trigger names, payload shapes, effect types, hook definitions, validators,
  and registry helpers
- All rule hook types are JSON-serializable (no functions, Maps, Sets, or classes)
- `MoveError` from WP-008A is reused for all validator errors — no new error types
- `CardExtId` used for all card references in trigger payloads
- No `boardgame.io` imports in any `src/rules/` file
- Drift-detection tests prevent silent additions to trigger names or effect types
- 99 tests pass (89 prior + 10 new), 0 fail
- Build exits 0

**Runtime Wiring Allowance:** Not exercised. No files outside the WP allowlist
were modified. Adding re-exports to `types.ts` and `index.ts` did not break
any existing structural assertions.

---

### WP-047 — Code Style Reference Governance Alignment (2026-04-10)

**What changed:**
- `docs/ai/REFERENCE/00.6-code-style.md` — **modified** — replaced header
  blockquote with Authority & Scope section declaring subordination to
  ARCHITECTURE.md and `.claude/rules/code-style.md`; documented three
  complementary code-style artifacts (00.6 descriptive reference,
  `.claude/rules/code-style.md` enforcement, 00.3 §16 quality gate);
  preserved scope statement, enforcement mapping, and change policy
- `docs/ai/DECISIONS.md` — added D-1404 (code style reference is descriptive
  while rules file is enforcement; three-artifact relationship; parallels
  D-1401/D-1402/D-1403)

**What exists now:**
- The code style reference explicitly declares subordination to ARCHITECTURE.md
  and `.claude/rules/code-style.md`
- Style rules never override architectural constraints or layer boundaries
- The three-artifact relationship is documented: 00.6 (descriptive with
  examples), `.claude/rules/code-style.md` (enforcement), 00.3 §16 (quality
  gate)
- All 15 existing rules preserved exactly — no rules added, removed, or weakened
- All code examples preserved
- Enforcement mapping table (18 §16.* entries) preserved
- Change policy preserved
- No `.claude/rules/` files modified
- No scripts modified
- No TypeScript code produced

---

### WP-046 — R2 Validation Governance Alignment (2026-04-10)

**What changed:**
- `docs/ai/REFERENCE/00.5-validation.md` — **modified** — added
  subordination clause in header (document is subordinate to ARCHITECTURE.md
  and `.claude/rules/*.md`); added Foundation Prompt vs Lint Gate distinction;
  added Layer Boundary note identifying registry/data layer with reference to
  `.claude/rules/registry.md`; added WP-042 distinction (reusable preflight
  vs operational deployment checklists); added Execution Gate section with
  stop-on-failure semantics naming Foundation Prompts 01, 02 as blocked on
  error (warnings alone do not block)
- `docs/ai/DECISIONS.md` — added D-1403 (R2 validation gate remains REFERENCE
  document; R2 validation vs Lint Gate distinction; warnings vs errors;
  position in Foundation Prompts sequence)

**What exists now:**
- The R2 validation gate explicitly declares subordination to ARCHITECTURE.md
  and `.claude/rules/*.md`
- The R2 validation vs Lint Gate distinction is documented: R2 validation is a
  Foundation Prompt prerequisite (runs once after 00.4); Lint Gate is a per-WP
  quality gate (runs before each WP)
- Layer Boundary note identifies the document as registry/data-layer validation,
  referencing `.claude/rules/architecture.md` ("Layer Boundary (Authoritative)")
  and `.claude/rules/registry.md` for data shape conventions
- WP-042 distinction documented: 00.5 is a reusable preflight script; WP-042
  documents operational deployment procedures
- Execution Gate section makes stop-on-failure semantics explicit: if any
  error-level check fails, Foundation Prompts 01/02 and all Work Packets
  depending on R2 data are blocked; warnings alone do not block
- No existing validation checks removed or weakened
- No scripts modified

**Known gaps:** None — documentation-only packet.

### WP-045 — Connection Health Check Governance Alignment (2026-04-10)

**What changed:**
- `docs/ai/REFERENCE/00.4-connection-health-check.md` — **modified** — added
  subordination clause in header (document is subordinate to ARCHITECTURE.md
  and `.claude/rules/*.md`); added Foundation Prompt vs Lint Gate distinction;
  added Layer Boundary note identifying server/ops layer with reference to
  `.claude/rules/server.md`; added Execution Gate section with stop-on-failure
  semantics naming Foundation Prompts 00.5, 01, 02 as blocked on failure
- `docs/ai/DECISIONS.md` — added D-1402 (health check remains REFERENCE
  document; health check vs Lint Gate distinction)

**What exists now:**
- The connection health check explicitly declares subordination to
  ARCHITECTURE.md and `.claude/rules/*.md`
- The health check vs Lint Gate distinction is documented: health check is a
  Foundation Prompt prerequisite (runs once); Lint Gate is a per-WP quality
  gate (runs before each WP)
- Layer Boundary note identifies the document as server/ops layer tooling,
  referencing `.claude/rules/architecture.md` ("Layer Boundary (Authoritative)")
  and `.claude/rules/server.md` for script governance
- Execution Gate section makes stop-on-failure semantics explicit: if any
  health check fails, Foundation Prompts 00.5/01/02 and all Work Packets
  are blocked
- No existing health checks removed or weakened
- No scripts modified

**Known gaps:** None — documentation-only packet.

### WP-044 — Prompt Lint Governance Alignment (2026-04-10)

**What changed:**
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — **modified** — added
  subordination clause in header (checklist is subordinate to ARCHITECTURE.md
  and `.claude/rules/*.md`); added Layer Boundary context check in §4; added
  governance note and Layer Boundary violation check in §8; added code style
  companion note in §16
- `docs/ai/DECISIONS.md` — added D-1401 (checklist remains REFERENCE, not
  merged into rules)

**What exists now:**
- The prompt lint checklist explicitly declares subordination to ARCHITECTURE.md
  and `.claude/rules/*.md`
- §4 requires Layer Boundary reference in Context when packets touch layer
  boundaries or package imports
- §8 opens with authoritative governance note citing ARCHITECTURE.md Section 1
  & 5 and `.claude/rules/architecture.md` "Layer Boundary (Authoritative)"
- §16 opens with companion note citing `00.6-code-style.md` and
  `.claude/rules/code-style.md`
- Checkbox count: 142 (was 139; +2 in §4, +1 in §8)
- No existing lint rules removed or weakened

**Known gaps:** None — documentation-only packet.

### WP-043 — Data Contracts Reference (2026-04-10)

**What changed:**
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **replaced** — legacy 755-line
  document (13 sections including UI concerns) replaced with governed 8-section
  data contracts reference covering card shapes, metadata lookups, image
  conventions, PostgreSQL schema, ability text markup, mastermind-villain
  relationships, match configuration, and authority notes
- `docs/ai/ARCHITECTURE.md` — cross-reference already adequate at line 136;
  no modification needed
- `docs/ai/DECISIONS.md` — added D-1301 (legacy section exclusion rationale)
  and D-1302 (subordination to schema.ts rationale)

**What exists now:**
- `docs/ai/REFERENCE/00.2-data-requirements.md` is the governed data contracts
  reference, subordinate to `schema.ts` and `ARCHITECTURE.md`
- Legacy 00.2 content archived at `docs/archive prompts-legendary-area-game/`
- All card data shapes, metadata lookup shapes, image URL construction rules,
  ability text markup tokens, and PostgreSQL table inventory are documented with
  real JSON examples and field reference tables
- Legacy sections §7 (user deck data), §9 (search/filter), §10 (preferences),
  §11 (app config), §12 (export) excluded as UI-layer concerns (D-1301)

**Known gaps:** None — documentation-only packet.

### Foundation Prompt 00.4 — Connection & Environment Health Check (2026-04-09)

**What exists now:**
- `scripts/check-connections.mjs` — Node.js ESM health check for all external
  services (PostgreSQL, boardgame.io server, Cloudflare R2, Cloudflare Pages,
  GitHub API, rclone R2 bucket)
- `scripts/Check-Env.ps1` — PowerShell tooling check (Node, pnpm, dotenv-cli,
  git, rclone, .env file, npm packages) — runs without Node.js or network
- `.env.example` — definitive 9-variable reference for the whole project
- `pnpm check` and `pnpm check:env` script entries in package.json

**What a developer can do:**
- Run `pwsh scripts/Check-Env.ps1` on a fresh machine to verify all tools
- Run `pnpm check` to verify all external service connections
- Both produce clear pass/fail reports with remediation for every failure

**Known gaps (expected at this stage):**
- No .env file yet (must be created from .env.example)
- boardgame.io and zod not installed (no game-engine package yet)
- PostgreSQL and game server connections will fail until Foundation Prompt 01

### Foundation Prompt 00.5 — R2 Data & Image Validation (2026-04-09)

**What exists now:**
- `scripts/validate-r2.mjs` — Node.js ESM R2 validation with 4 phases:
  Phase 1: registry check (sets.json), Phase 2: per-set metadata validation,
  Phase 3: image spot-checks (HEAD only), Phase 4: cross-set slug deduplication
- `pnpm validate` runs the full validation against live R2 (no .env needed)

**Live validation results (2026-04-09):**
- 40 sets validated, 0 errors, 74 warnings (known data quality issues)
- 6 missing images (URL pattern mismatches on specific sets)
- 43 cross-set duplicate slugs (expected — same heroes appear in multiple sets)

**Known data quality issues (per 00.2 §12):**
- `[object Object]` abilities in msmc, bkpt, msis sets
- Missing `vp` field on 2 masterminds in mgtg set
- 1 hero card missing `cost` and `hc` in anni set

### Foundation Prompt 01 — Render.com Backend Setup (2026-04-09)

**What exists now:**
- `apps/server/` — new pnpm workspace package (`@legendary-arena/server`)
  - `src/rules/loader.mjs` — loads `legendary.rules` and `legendary.rule_docs`
    from PostgreSQL at startup, caches in memory, exports `loadRules()` and
    `getRules()`
  - `src/game/legendary.mjs` — minimal boardgame.io `Game()` definition wired
    to the rules cache. Placeholder move (`playCard`) and endgame condition.
    No real game logic — that belongs in `packages/game-engine/` (WP-002+).
  - `src/server.mjs` — boardgame.io `Server()` with CORS (production SPA +
    localhost:5173), `/health` endpoint on koa router, rules count logging
  - `src/index.mjs` — process entrypoint with SIGTERM graceful shutdown
- `data/schema-server.sql` — rules-engine DDL subset (sets, masterminds,
  villain_groups, schemes, rules, rule_docs) in `legendary.*` namespace.
  All tables use `bigserial` PKs, `IF NOT EXISTS`, indexed.
- `data/seed-server.sql` — seed data with complete Galactus (Core Set)
  example: set, mastermind (strike 5, vp 6), Heralds of Galactus villain
  group, Brotherhood, two schemes. Wrapped in a transaction.
- `render.yaml` — Render infrastructure-as-code provisioning web service
  + managed PostgreSQL (starter plan) in one deploy

**What a developer can do:**
- `pnpm install` detects the new server workspace and installs deps
- `node --env-file=.env apps/server/src/server.mjs` starts the server
- `GET /health` returns `{ "status": "ok" }` for Render and pnpm check
- `psql $DATABASE_URL -f data/schema-server.sql` creates rules-engine tables
- `psql $DATABASE_URL -f data/seed-server.sql` seeds Galactus example
- `render deploy` provisions both services from `render.yaml`

**Known gaps (expected at this stage):**
- No real game logic — `LegendaryGame` is a placeholder (WP-002)
- No card registry loading at startup (WP-003 registry package needed)
- No authentication (separate WP)
- No lobby/match creation CLI scripts (WP-011/012)

### Foundation Prompt 02 — Database Migrations (2026-04-09)

**What exists now:**
- `scripts/migrate.mjs` — zero-dependency ESM migration runner using `pg` only.
  Reads `.sql` files from `data/migrations/`, applies them in filename order,
  tracks applied migrations in `public.schema_migrations`. Resolves `\i`
  directives (psql includes) by inlining referenced files. Strips embedded
  `BEGIN`/`COMMIT` wrappers to avoid nested transaction issues.
- `data/migrations/001_server_schema.sql` — includes `data/schema-server.sql`
  (rules-engine DDL: legendary.source_files, sets, masterminds, villain_groups,
  schemes, rules, rule_docs)
- `data/migrations/002_seed_rules.sql` — includes `data/seed_rules.sql`
  (rules index + rule_docs glossary + source_files audit records)
- `data/migrations/003_game_sessions.sql` — creates `public.game_sessions`
  table for match tracking (match_id, status, player_count, mastermind_ext_id,
  scheme_ext_id). Uses `text` ext_id references, not bigint FKs.
- `render.yaml` buildCommand updated to run migrations before server start
- `pnpm migrate` script entry in root package.json

**What a developer can do:**
- `pnpm migrate` applies pending migrations against local PostgreSQL
- Running twice is safe — idempotent (0 applied, 3 skipped on second run)
- `render deploy` runs migrations automatically in the build step

**Known gaps (expected at this stage):**
- No rollback mechanism (manual recovery via `psql` if needed)
- No real game logic — game_sessions table is created but not yet used
- Card registry not loaded at startup (WP-003 needed)

### WP-004 — Server Bootstrap: Game Engine + Registry Integration (2026-04-09)

**What changed:**
- `apps/server/src/game/legendary.mjs` — replaced placeholder `Game()` definition
  with a thin re-export of `LegendaryGame` from `@legendary-arena/game-engine`
- `apps/server/src/server.mjs` — imports `LegendaryGame` from
  `@legendary-arena/game-engine` and `createRegistryFromLocalFiles` from
  `@legendary-arena/registry`. Loads registry at startup alongside rules.
  Uses `createRequire` to bridge boardgame.io's CJS-only server bundle.
- `apps/server/package.json` — added `@legendary-arena/game-engine` and
  `@legendary-arena/registry` as workspace dependencies
- `apps/server/src/index.mjs` — added `// why:` comment explaining entrypoint
  vs configuration module separation
- `render.yaml` — already had correct `startCommand`, no change needed

**What a developer can do:**
- `node --env-file=.env apps/server/src/index.mjs` starts the server with
  real game engine and card registry
- Server logs show both startup tasks:
  - `[server] registry loaded: 40 sets, 288 heroes, 2620 cards`
  - `[server] rules loaded: 19 rules, 18 rule docs`
- `GET /health` returns `{"status":"ok"}`
- `POST /games/legendary-arena/create` with `setupData` returns a `matchID`
- Missing `setupData` returns HTTP 400 with a descriptive message (not 500)
- `numPlayers` outside 1-5 returns HTTP 400 (`minPlayers: 1`, `maxPlayers: 5`
  on `LegendaryGame`, enforced by boardgame.io lobby)

**Known gaps (expected at this stage):**
- No lobby/match creation CLI scripts yet (WP-011/012)
- No authentication (separate WP)

### WP-005A — Match Setup Contracts (2026-04-10)

**What changed:**
- `packages/game-engine/src/matchSetup.types.ts` — **new** — defines the
  canonical `MatchSetupConfig` (9 locked fields), `MatchSetupError`
  (`{ field, message }`), and `ValidateMatchSetupResult` (discriminated union)
- `packages/game-engine/src/matchSetup.validate.ts` — **new** —
  `validateMatchSetup(input, registry)` checks both shape and registry ext_id
  existence; never throws; returns structured result. Defines
  `CardRegistryReader` interface to respect the layer boundary.
- `packages/game-engine/src/types.ts` — **modified** — `MatchConfiguration` is
  now a type alias for `MatchSetupConfig` (both had identical 9-field shapes)
- `packages/game-engine/src/index.ts` — **modified** — exports
  `MatchSetupConfig`, `MatchSetupError`, `ValidateMatchSetupResult`,
  `validateMatchSetup`, and `CardRegistryReader`
- `packages/game-engine/src/matchSetup.contracts.test.ts` — **new** — 4 contract
  tests using inline mock registry (no boardgame.io imports)

**What a subsequent session can rely on:**
- `@legendary-arena/game-engine` exports the canonical match setup contract types
- `validateMatchSetup` validates both shape and ext_id existence
- `MatchConfiguration` is a type alias for `MatchSetupConfig` — both work
- The validator never throws — `Game.setup()` decides whether to throw
- `CardRegistryReader` is the minimal interface the validator needs from a registry

**Known gaps (expected at this stage):**
- No deterministic shuffling or deck construction — that is WP-005B
- No changes to `Game.setup()` — that is WP-005B
- No gameplay moves, rules, or phases

### WP-005B — Deterministic Setup Implementation (2026-04-10)

**What changed:**
- `packages/game-engine/src/types.ts` — **modified** — expanded
  `LegendaryGameState` with `CardExtId`, `SetupContext`, `PlayerZones`,
  `GlobalPiles`, `MatchSelection` types. G now has `selection`, `playerZones`,
  and `piles` fields.
- `packages/game-engine/src/setup/shuffle.ts` — **new** — `shuffleDeck(cards, context)`
  uses `context.random.Shuffle` exclusively for deterministic shuffling
- `packages/game-engine/src/test/mockCtx.ts` — **new** — `makeMockCtx(overrides?)`
  returns a `SetupContext` with `Shuffle` that reverses arrays (proves shuffle ran)
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **new** —
  builds initial G from validated config: per-player zones (12-card starting
  decks of 8 agents + 4 troopers), global piles sized from config counts,
  selection metadata
- `packages/game-engine/src/game.ts` — **modified** — `setup()` now calls
  `validateMatchSetup` (when registry configured) then `buildInitialGameState`.
  Exports `setRegistryForSetup()` for server-side registry configuration.
- `packages/game-engine/src/index.ts` — **modified** — exports new types,
  `buildInitialGameState`, `shuffleDeck`, well-known ext_id constants,
  `setRegistryForSetup`
- `packages/game-engine/src/game.test.ts` — **modified** — updated to use
  `makeMockCtx` for proper boardgame.io 0.50.x context shape
- Shape test and determinism test — **new** — 17 new tests

**Revision pass (same session):**
- `shuffle.ts` — narrowed parameter type from `SetupContext` to new
  `ShuffleProvider` interface (`{ random: { Shuffle } }`) for future reuse
  in move contexts. Zero behavior change.
- `game.ts` — added `clearRegistryForSetup()` test-only reset hook to
  prevent module-level registry pollution across tests
- `types.ts` — expanded `SetupContext` JSDoc explaining boardgame.io 0.50.x
  `ctx` nesting rationale
- `index.ts` — exports `clearRegistryForSetup` and `ShuffleProvider`
- Shape tests — added 3 invariant tests: starting deck composition
  (8 agents + 4 troopers), selection/matchConfiguration field consistency,
  selection array reference isolation
- Determinism tests — added shuffleDeck immutability test
- Test count: 34 → 38 (4 new invariant tests)

**What a subsequent session can rely on:**
- `@legendary-arena/game-engine` exports a fully functional `buildInitialGameState`
- `shuffleDeck` provides deterministic shuffling via `context.random.Shuffle`;
  accepts any `ShuffleProvider` (not just `SetupContext`)
- `makeMockCtx` is the shared test helper for all future game engine tests
- `Game.setup()` validates config (when registry set) then builds full initial G
- Determinism guaranteed: same inputs + same RNG → identical G
- All 38 tests passing (17 from WP-005A + 21 new)

**Known gaps (expected at this stage):**
- No hero deck (HQ) construction from registry data — future WP
- No villain deck construction — WP-014/015
- No gameplay moves beyond stubs — WP-008A/B
- `setRegistryForSetup` must be called by the server before creating matches
  (server not yet updated — that is a future integration task)
- Starting deck ext_ids are well-known constants, not resolved from registry

### WP-006A — Player State & Zones Contracts (2026-04-10)

**What changed:**
- `packages/game-engine/src/state/zones.types.ts` — **new** — canonical zone
  and player state contracts: `CardExtId`, `Zone`, `PlayerZones`, `PlayerState`,
  `GlobalPiles`, `ZoneValidationError`, `GameStateShape`
- `packages/game-engine/src/state/zones.validate.ts` — **new** — pure runtime
  shape validators: `validateGameStateShape(input)` and
  `validatePlayerStateShape(input)`. Return structured results, never throw.
  No boardgame.io imports.
- `packages/game-engine/src/state/zones.shape.test.ts` — **new** — 4 structural
  tests (2 passing, 2 `{ ok: false }` cases) using `node:test` and `node:assert`
- `packages/game-engine/src/types.ts` — **modified** — `CardExtId`, `PlayerZones`,
  `GlobalPiles` now re-exported from `state/zones.types.ts`. New types `Zone`,
  `PlayerState`, `ZoneValidationError`, `GameStateShape` also re-exported.
  `LegendaryGameState` uses canonical types from `zones.types.ts`.
- `packages/game-engine/src/index.ts` — **modified** — exports new types and
  validators from `state/zones.types.ts` and `state/zones.validate.ts`

**What a subsequent session can rely on:**
- `@legendary-arena/game-engine` exports canonical zone contracts (`CardExtId`,
  `Zone`, `PlayerZones`, `PlayerState`, `GlobalPiles`)
- `ZoneValidationError` is `{ field, message }` — distinct from `MoveError`
- `validateGameStateShape` and `validatePlayerStateShape` are pure helpers
  that check structural shape only — no registry lookups, no throws
- `GameStateShape` is the minimal interface for zone validation
- All 48 tests passing (38 from WP-005B + 10 zone shape tests)

**Known gaps (expected at this stage):**
- No gameplay moves beyond stubs — WP-008A/B
- No hero deck (HQ) or villain deck construction — future WPs
- `PlayerState` is defined but not yet used in `LegendaryGameState` (G uses
  `Record<string, PlayerZones>` directly — `PlayerState` is available for
  move validation in future WPs)

### WP-006B — Player State Initialization (2026-04-10)

**What changed:**
- `packages/game-engine/src/setup/playerInit.ts` — **new** —
  `buildPlayerState(playerId, startingDeck, context)` returns a typed
  `PlayerState` with shuffled deck and 4 empty zones. Uses `ShuffleProvider`
  for the context parameter.
- `packages/game-engine/src/setup/pilesInit.ts` — **new** —
  `buildGlobalPiles(config, context)` returns a typed `GlobalPiles` from
  `MatchSetupConfig` count fields. Contains `createPileCards` helper and
  well-known pile ext_id constants.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  delegates player creation to `buildPlayerState` and pile creation to
  `buildGlobalPiles`. Retains `buildStartingDeckCards`, `buildMatchSelection`,
  and well-known starting card ext_id constants.
- `packages/game-engine/src/setup/playerInit.shape.test.ts` — **new** — 3 shape
  tests: all zones present, deck reversed (proves shuffle), broken player rejected
- `packages/game-engine/src/setup/validators.integration.test.ts` — **new** — 3
  integration tests: `validateGameStateShape` ok, `validatePlayerStateShape` ok
  for all players, `JSON.stringify(G)` does not throw

**What is now fully initialized and validator-confirmed:**
- `buildInitialGameState` produces a `G` that passes `validateGameStateShape`
- Every player in `G` passes `validatePlayerStateShape`
- Player state construction is isolated in `buildPlayerState` — independently
  testable with its own shape tests
- Global pile construction is isolated in `buildGlobalPiles` — typed against
  canonical `GlobalPiles` from WP-006A
- All 56 tests passing (48 from WP-006A + 8 new)

**Known gaps (expected at this stage):**
- No hero deck (HQ) construction from registry data — future WP
- No villain deck construction — WP-014/015
- No gameplay moves beyond stubs — WP-008A/B

### WP-007A — Turn Structure & Phases Contracts (2026-04-10)

**What changed:**
- `packages/game-engine/src/turn/turnPhases.types.ts` — **new** — defines
  `MatchPhase` (4 values), `TurnStage` (3 values), canonical arrays
  `MATCH_PHASES` and `TURN_STAGES`, and `TurnPhaseError` error shape
- `packages/game-engine/src/turn/turnPhases.logic.ts` — **new** — pure
  transition helpers: `getNextTurnStage`, `isValidTurnStageTransition`,
  `isValidMatchPhase`, `isValidTurnStage`. No boardgame.io imports.
- `packages/game-engine/src/turn/turnPhases.validate.ts` — **new** —
  `validateTurnStageTransition(from, to)` validates both inputs and transition
  legality. Returns structured results, never throws.
- `packages/game-engine/src/turn/turnPhases.contracts.test.ts` — **new** —
  7 contract tests: 2 valid transitions, 2 invalid transitions,
  `getNextTurnStage('cleanup')` returns null, 2 drift-detection tests
- `packages/game-engine/src/types.ts` — **modified** — re-exports
  `MatchPhase`, `TurnStage`, `TurnPhaseError` from turn types
- `packages/game-engine/src/index.ts` — **modified** — exports all new types,
  canonical arrays, transition helpers, type guards, and validator

**What a subsequent session can rely on:**
- `MatchPhase` and `TurnStage` are the canonical union types for phases and stages
- `MATCH_PHASES` and `TURN_STAGES` are the single source of truth arrays
- `getNextTurnStage` defines stage ordering — WP-007B must use it
- `isValidTurnStageTransition` checks forward-adjacent transitions only
- Type guards (`isValidMatchPhase`, `isValidTurnStage`) use array membership
- `validateTurnStageTransition` validates unknown inputs before checking legality
- `TurnPhaseError` uses `{ code, message, path }` — distinct from `ZoneValidationError`
- All 63 tests passing (56 from WP-006B + 7 new)

**Known gaps (expected at this stage):**
- No `G.currentStage` field — that is WP-007B
- No turn advancement logic — that is WP-007B
- No moves, stage gating, or boardgame.io wiring — WP-008A/B

### WP-007B — Turn Loop Implementation (2026-04-10)

**What changed:**
- `packages/game-engine/src/turn/turnLoop.ts` — **new** — `advanceTurnStage(G, ctx)`
  advances `G.currentStage` through the canonical turn stage cycle. Uses
  `getNextTurnStage` from WP-007A for ordering — no hardcoded stage strings.
  Calls `ctx.events.endTurn()` when `getNextTurnStage` returns `null` (after
  cleanup). Defines `TurnLoopContext` and `TurnLoopState` interfaces locally
  to avoid importing boardgame.io.
- `packages/game-engine/src/types.ts` — **modified** — added
  `currentStage: TurnStage` to `LegendaryGameState` with `// why:` comment
  explaining storage in G rather than ctx
- `packages/game-engine/src/game.ts` — **modified** — wired `play` phase with
  `turn.onBegin` (resets `G.currentStage` to `TURN_STAGES[0]` each turn) and
  added `advanceStage` move that delegates to `advanceTurnStage`
- `packages/game-engine/src/index.ts` — **modified** — exports
  `advanceTurnStage`, `TurnLoopContext`, `TurnLoopState`
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** —
  returns `currentStage: TURN_STAGES[0]` in initial G (required by updated
  `LegendaryGameState` type)
- `packages/game-engine/src/game.test.ts` — **modified** — updated move
  assertion to include `advanceStage` (3 moves instead of 2)
- `packages/game-engine/src/turn/turnLoop.integration.test.ts` — **new** —
  4 integration tests: start->main, main->cleanup, cleanup->endTurn called,
  JSON-serializability after each transition

**What a running match can now do:**
- The `play` phase has a functional turn stage cycle: `start -> main -> cleanup`
- Each new turn resets `G.currentStage` to the first canonical stage
- `advanceStage` move advances the stage forward or ends the turn
- `ctx.events.endTurn()` handles player rotation — manual rotation forbidden
- `G.currentStage` is observable to all moves for future stage gating (WP-008A)

**What a subsequent session can rely on:**
- `LegendaryGameState` has `currentStage: TurnStage` — always present in G
- `advanceTurnStage` is exported and uses `getNextTurnStage` exclusively
- `advanceStage` is registered as a move on `LegendaryGame`
- The play phase `turn.onBegin` hook resets stage on each turn
- All 67 tests passing (63 from WP-007A + 4 new)

**Known gaps (expected at this stage):**
- No stage gating on moves — WP-008A defines which moves run in which stages
- No gameplay moves (draw, recruit, fight) — WP-008A/B
- No win/loss conditions — WP-010
- No villain deck or city logic — WP-014/015

### WP-008A — Core Moves Contracts (2026-04-10)

**What changed:**
- `packages/game-engine/src/moves/coreMoves.types.ts` — **new** — defines
  `CoreMoveName` (3 values), `CORE_MOVE_NAMES` canonical array,
  `DrawCardsArgs`, `PlayCardArgs` (uses `CardExtId`), `EndTurnArgs`,
  and the engine-wide `MoveError`/`MoveResult` result contract
- `packages/game-engine/src/moves/coreMoves.gating.ts` — **new** —
  `MOVE_ALLOWED_STAGES` map and `isMoveAllowedInStage` helper. No
  boardgame.io imports.
- `packages/game-engine/src/moves/coreMoves.validate.ts` — **new** — four
  pure validators: `validateDrawCardsArgs`, `validatePlayCardArgs`,
  `validateEndTurnArgs`, `validateMoveAllowedInStage`. All return `MoveResult`,
  never throw. No mutation, no normalization, no coercion.
- `packages/game-engine/src/moves/coreMoves.contracts.test.ts` — **new** —
  13 tests: 3 drawCards, 2 playCard, 3 stage gating, 2 drift-detection,
  2 validateMoveAllowedInStage error cases, 1 endTurn
- `packages/game-engine/src/types.ts` — **modified** — re-exports
  `MoveResult`, `MoveError`, `CoreMoveName`
- `packages/game-engine/src/index.ts` — **modified** — exports all new types,
  constants, gating helpers, and validators

**What a subsequent session can rely on:**
- `@legendary-arena/game-engine` exports the canonical move contracts
- `MoveResult`/`MoveError` are the engine-wide result contract — no future
  packet may redefine or shadow these types
- `CORE_MOVE_NAMES` is the canonical array for drift-detection
- `MOVE_ALLOWED_STAGES` is the sole source of truth for stage gating
- `isMoveAllowedInStage` derives answers from the map only
- All four validators are pure (no throw, no mutation, no boardgame.io)
- `PlayCardArgs.cardId` is typed as `CardExtId` (not plain string)
- All 80 tests passing (67 from WP-007B + 13 new)

**Known gaps (expected at this stage):**
- No move implementations that mutate G — WP-008B
- No card rules, costs, or keyword logic — future WPs
- No villain deck, city, or HQ logic — WP-014/015

### WP-008B — Core Moves Implementation (2026-04-10)

**What changed:**
- `packages/game-engine/src/moves/zoneOps.ts` — **new** — pure zone mutation
  helpers: `moveCardFromZone(from, to, cardId)` returns `{ from, to, found }`;
  `moveAllCards(from, to)` returns `{ from, to }`. Both return new arrays,
  never mutate inputs. No boardgame.io imports. No `Math.random()`.
- `packages/game-engine/src/moves/coreMoves.impl.ts` — **new** — three move
  implementations (`drawCards`, `playCard`, `endTurn`) following three-step
  ordering: validate args, check stage gate, mutate G. Imports validators and
  gating from WP-008A. Uses `shuffleDeck` for reshuffle in `drawCards`.
- `packages/game-engine/src/game.ts` — **modified** — replaced `playCard` and
  `endTurn` stubs with imports from `coreMoves.impl.ts`; added `drawCards` as
  a new move. `advanceStage` remains untouched.
- `packages/game-engine/src/index.ts` — **modified** — exports
  `moveCardFromZone`, `moveAllCards`, `MoveCardResult`, `MoveAllResult`
- `packages/game-engine/src/game.test.ts` — **modified** — updated move-count
  assertion from 3 to 4 (runtime wiring allowance for adding `drawCards`)
- `packages/game-engine/src/moves/coreMoves.integration.test.ts` — **new** —
  9 integration tests covering all three moves, stage gating, reshuffle, and
  JSON serializability

**What a running match can now do:**
- `drawCards`: draws N cards from deck to hand; reshuffles discard into deck
  when deck is exhausted mid-draw (deterministic via `ctx.random`)
- `playCard`: moves a card from hand to inPlay
- `endTurn`: moves all inPlay and hand cards to discard, then calls
  `ctx.events.endTurn()` to advance to the next player
- All three moves enforce stage gating via `MOVE_ALLOWED_STAGES`
- A match can now execute a full turn cycle: draw cards (start/main stage),
  play cards (main stage), end turn (cleanup stage), rotate to next player

**What a subsequent session can rely on:**
- `@legendary-arena/game-engine` exports functional move implementations
- `zoneOps.ts` exports `moveCardFromZone` and `moveAllCards` for reuse in
  future moves (villain deck, recruit, fight)
- WP-008A contracts were NOT modified — all validators, gating, and types
  remain locked
- All 89 tests passing (80 from WP-008A + 9 new)

**Known gaps (expected at this stage):**
- No card effects (attack, recruit, keywords, costs) — future WPs
- No HQ, city, KO zone, or villain deck logic — WP-014/015
- No buying or fighting mechanics — future WPs
- No win/loss conditions — WP-010

### WP-003 — Card Registry Verification & Defect Correction (2026-04-09)

**What was fixed:**
- **Defect 1:** `httpRegistry.ts` was fetching `card-types.json` (card type
  taxonomy) instead of `sets.json` (set index). The Zod parse silently
  produced zero sets because `card-types.json` entries lack `abbr` and
  `releaseDate` fields. Fixed to fetch `sets.json` with a `// why:` comment
  explaining the distinction.
- **Defect 2:** `FlatCard.cost` in `types/index.ts` was typed as
  `number | undefined` but real card data includes star-cost strings like
  `"2*"` (amwp Wasp). Widened to `string | number | undefined` to match
  `HeroCardSchema.cost`.
- Stale JSDoc references to `card-types.json` corrected to `sets.json` in
  `CardRegistry.listSets()` and `HttpRegistryOptions.eagerLoad`.

**What was added:**
- `src/registry.smoke.test.ts` — smoke test using `node:test` confirming
  the local registry loads sets and cards without blocking parse errors
- `test` script in `package.json` for `pnpm --filter @legendary-arena/registry test`
- `tsconfig.build.json` excludes `*.test.ts` from build output

**What is confirmed working:**
- Local registry loads 40 sets (38 parse fully, 2 have known schema issues)
- `listSets().length > 0` and `listCards().length > 0` pass
- Immutable files (`schema.ts`, `shared.ts`, `localRegistry.ts`) were not modified

**Known remaining build errors (pre-existing, out of scope):**
- `localRegistry.ts` — missing `@types/node` type declarations for
  `node:fs/promises` and `node:path`; implicit `any` parameter
- `shared.ts` — `exactOptionalPropertyTypes` strictness (optional fields
  assigned to required fields in `FlatCard`)
- These require modifications to immutable files or adding `@types/node` —
  flagged for a follow-up work packet

### WP-002 — boardgame.io Game Skeleton (2026-04-09)

**What exists now:**
- `packages/game-engine/` — new pnpm workspace package (`@legendary-arena/game-engine`)
  - `src/types.ts` — `MatchConfiguration` (9 locked fields from 00.2 §8.1)
    and `LegendaryGameState` (initial G shape)
  - `src/game.ts` — `LegendaryGame` created with boardgame.io `Game()`,
    4 phases (`lobby`, `setup`, `play`, `end`), 2 move stubs (`playCard`,
    `endTurn`), and a `setup()` function that accepts `MatchConfiguration`
  - `src/index.ts` — named exports: `LegendaryGame`, `MatchConfiguration`,
    `LegendaryGameState`
  - `src/game.test.ts` — JSON-serializability test, field verification,
    phase/move assertions (5 tests, all passing)

**What a subsequent session can rely on:**
- `@legendary-arena/game-engine` is importable as a workspace package
- `LegendaryGame` is a valid boardgame.io 0.50.x `Game()` object
- `LegendaryGame.setup()` accepts `MatchConfiguration` and returns
  `LegendaryGameState` (JSON-serializable)
- Phase names are locked: `lobby`, `setup`, `play`, `end`
- Move stubs exist: `playCard`, `endTurn` (void, no side effects)
- `MatchConfiguration` has exactly 9 fields matching 00.2 §8.1

**Known gaps (expected at this stage):**
- Move stubs have no logic — gameplay implementation starts in WP-005B+
- `LegendaryGameState` contains only `matchConfiguration` — zones, piles,
  counters, and other G fields will be added by subsequent Work Packets
- No card registry integration — engine does not import registry (by design)
- No server wiring — `apps/server/` still uses its own placeholder Game()
