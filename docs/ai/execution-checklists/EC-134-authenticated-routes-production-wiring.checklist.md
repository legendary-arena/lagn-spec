# EC-134 — Authenticated Routes Production Wiring (Hanko Verifier + Account Resolver) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-131-authenticated-routes-production-wiring.md
**Layer:** Server (`apps/server/src/auth/accountResolver.logic.ts` new helper; `apps/server/src/server.mjs` wiring site) + Reference (`docs/ai/REFERENCE/api-endpoints.md` per D-11804)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-131.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-131.

---

## §0 — Pre-Flight

- [ ] WP-126 complete: `apps/server/src/auth/hanko/hankoVerifier.logic.ts` exports `createHankoSessionVerifier(config: HankoVerifierConfig): SessionVerifier`; `render.yaml` and `.env.example` declare `HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE`, `HANKO_JWKS_REFRESH_INTERVAL_MS`.
- [ ] WP-112 complete: `AccountResolver` type exported as `(claim, database) => Promise<Result<AccountId | null>>`; `findAccountByAuthProviderSub(authProvider, authProviderSub, database)` exported with `'lookup_failed'` semantics per D-11203.
- [ ] WP-104 / WP-109 complete: `registerOwnerProfileRoutes` and `registerTeamRoutes` accept `{ requireAuthenticatedSession, verifier?, accountResolver? }` deps bundles.
- [ ] WP-115 complete: long-lived `pg.Pool` constructed once in `startServer()`, closed in `index.mjs` SIGTERM handler.
- [ ] D-13101..D-13104 slot range free in `DECISIONS.md` (or shift to next free contiguous block per the WP §Decision Points slot-retarget rule).
- [ ] `pnpm --filter @legendary-arena/server build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 on `main` HEAD.
- [ ] Four executor decisions locked before coding: D-13101 (missing-env startup behavior), D-13102 (resolver location), D-13103 (per-request options vs `configureSessionValidation`), D-13104 (startup-log URL masking). Recommended defaults documented in WP-131 §Decision Points.

## §1 — Scope Lock + File Allowlist

Five production / reference files may change. Plus four governance ledgers in the same commit.

- `apps/server/src/auth/accountResolver.logic.ts` — **new** — `productionAccountResolver: AccountResolver` single-export closure
- `apps/server/src/auth/accountResolver.logic.test.ts` — **new** — three `node:test` cases (hit / clean miss / lookup failure)
- `apps/server/src/server.mjs` — **modified** — new imports, `tryConstructHankoVerifier()` helper, modified `register*Routes` deps, updated `// why:` blocks
- `apps/server/src/server.mjs.test.ts` — **modified** — one new `describe('startup guard (WP-131)')` block with two test cases
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — eleven row replacements + one new `Library-only` row appended
- Plus governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

`git diff --name-only` lists 9 files at session close (5 production/reference + 4 governance ledgers).

## §2 — Locked Values (do not re-derive)

- Resolver export: exactly one named symbol `productionAccountResolver`. No default export. No additional named exports.
- Resolver type: `AccountResolver` per WP-112 = `(claim: VerifiedSessionClaim, database: DatabaseClient) => Promise<Result<AccountId | null>>`.
- Resolver translation: `findAccountByAuthProviderSub` returns `Result<AccountLookupHit | null>`; resolver maps `Result.ok(hit)` → `Result.ok(hit.accountId)`, `Result.ok(null)` → `Result.ok(null)`, `Result.fail({ code: 'lookup_failed', ... })` → forward verbatim.
- Three env vars (per WP-126 / D-12602): `HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE`, `HANKO_JWKS_REFRESH_INTERVAL_MS`.
- `jwksRefreshIntervalMs` parsing: when env unset, pass `undefined` (NOT `NaN` from `Number(undefined)`) so D-12603 default substitution fires.
- `SessionValidationErrorCode` closed union (NOT modified): `'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account' | 'session_verifier_not_configured' | 'lookup_failed'`.
- HTTP status mapping (NOT modified): `'missing_token' / 'invalid_token' / 'expired_token' / 'unknown_account'` → 401; `'session_verifier_not_configured' / 'lookup_failed'` → 500.
- D-13101 missing-env behavior: `NODE_ENV === 'production'` + missing env = throw new `Error("Hanko verifier configuration is incomplete. Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard before deploying. Production cannot start without them.")` (full sentence, verbatim). Otherwise log fail-closed warning and return `undefined`.
- D-13104 URL masking: log `tenantBaseUrl=https://passkeys.hanko.io/***` in production startup line (origin preserved, path replaced with `***`).
- Catalog canonical sentence (verbatim, exactly 11 occurrences): **"Genuinely authenticated as of WP-131 / EC-134."** — slash-separated, terminating period, no parentheses.
- Catalog row replacement: `Status` stays `Wired`, `Auth` stays `authenticated-session-required`, `Authorizing WP` stays `WP-104` / `WP-109` (WP-131 does NOT graduate authorship). Replace-whole-row merge per D-11804 — partial-update is FAIL.
- New `Library-only` row appended for `productionAccountResolver` immediately after `findAccountByAuthProviderSub` row; `Status` = `Library-only`; `Authorizing WP` = `WP-131`.

## §3 — Guardrails

- Resolver MUST NOT throw. Every failure path returns a typed `Result`. Database faults forward `'lookup_failed'` verbatim from `findAccountByAuthProviderSub` per D-11203.
- Resolver MUST NOT import `boardgame.io`, `@legendary-arena/(game-engine|registry|preplan)`, `apps/(arena-client|registry-viewer|replay-producer)`, or `pg` directly. `pg` is reachable only via the `DatabaseClient` alias.
- `tryConstructHankoVerifier()` is the **D-13101 startup-policy gate** — not "best-effort." Production + missing env = fatal exit-1. Non-production + missing env = fail-closed `undefined` return for local-dev ergonomics. The `try` prefix reflects the return type (`SessionVerifier | undefined`), not the policy class.
- Verifier construction happens exactly once per `startServer()` invocation (mirrors `pool = createPool()` invariant). No per-request construction; no module-level singleton beyond what `startServer()` produces.
- Both `register*Routes` call sites pass either both `verifier` + `accountResolver` (defined) or neither (both `undefined`); never one without the other. The `accountResolver` field uses `verifier === undefined ? undefined : productionAccountResolver`.
- `configureSessionValidation` MUST NOT be imported or invoked in `server.mjs`. Per D-13103 = (a), this helper is **contractually deferred** (not stylistically rejected) — consuming it would require refactoring `ownerProfile.routes.ts` / `team.routes.ts`, which are immutable touches under WP-104 / WP-109. The factory remains available for future non-route consumers (e.g., WebSocket auth handshake).
- `apps/server/src/profile/ownerProfile.routes.ts` and `apps/server/src/teams/team.routes.ts` byte-identical pre- and post-WP-131 (verified by `git diff`).
- `apps/server/src/auth/hanko/**` byte-identical pre- and post-WP-131 (WP-126 contract files locked).
- WP-112 contract files (`sessionToken.types.ts`, `sessionToken.logic.ts`, `accountLookup.logic.ts` + their tests) byte-identical.
- `render.yaml` and `.env.example` byte-identical (env vars already declared at WP-126).
- No new npm dependencies. `apps/server/package.json` and `pnpm-lock.yaml` byte-identical.

## §4 — Required `// why:` Comments

- `accountResolver.logic.ts` module-header JSDoc: cite WP-131 §A; WP-112 D-11203 (`findAccountByAuthProviderSub` signature lock); the no-throw discipline; the `AccountLookupHit → AccountId | null` translation locality. Do NOT enumerate the forbidden-import token list (cite D-9904 + WP-112 `accountLookup.logic.ts` precedent instead — per Lint §18 prose-vs-grep discipline).
- `accountResolver.logic.ts` resolver body: cite the no-mutation map discipline (database faults bubble up unchanged so the orchestrator's translation site at `sessionToken.logic.ts:188-194` remains the single error-code-mapping site).
- `server.mjs` immediately above `tryConstructHankoVerifier()` declaration: cite that this function **implements the D-13101 startup-policy gate**; production = fatal misconfiguration; non-production = deliberate fail-closed return. The `try` prefix names the return type, not the policy.
- `server.mjs` `Number(process.env.HANKO_JWKS_REFRESH_INTERVAL_MS)` parse site: cite that `Number(undefined)` produces `NaN`; the verifier factory's D-12603 default substitution requires `undefined` (not `NaN`).
- `server.mjs` updated WP-104 / WP-109 narrative `// why:` blocks: drop the "until WP-126 lands" sentence; add "WP-131 wires the Hanko verifier (production) or leaves both fields undefined (dev-mode + missing env) — the existing fail-closed orchestrator path handles the dev-mode case unchanged."
- Each `accountResolver.logic.test.ts` test: cite the guarantee it locks (e.g., test 3: lookup-failure propagation must surface `'lookup_failed'` verbatim so the orchestrator routes 500, not 401).
- Each `server.mjs.test.ts` startup-guard test: name the D-13101 path it locks (production-fatal vs dev-mode-warn).

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm --filter @legendary-arena/server build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0.
- [ ] Server test suite count grows by exactly 5 over post-WP-126 baseline (3 resolver + 2 startup-guard); suite count grows by exactly 1 (`accountResolver.logic.test.ts`). Reconcile baseline against current `HEAD` per 00.3 §19 if board-layout chain has shifted it.
- [ ] No `throw` in `apps/server/src/auth/accountResolver.logic.ts`: `Select-String -Path "apps\server\src\auth\accountResolver.logic.ts" -Pattern "throw "` returns no output.
- [ ] No forbidden imports in resolver: `Select-String -Path "apps\server\src\auth\accountResolver.logic.ts" -Pattern "boardgame\.io|@legendary-arena/(game-engine|registry|preplan)|apps/(arena-client|registry-viewer|replay-producer)|from 'pg'"` returns no output.
- [ ] No `Math.random` in scope: `Select-String -Path "apps\server\src" -Pattern "Math\.random" -Recurse` returns no output.
- [ ] **D-13103 contract lock (negative assertion):** `Select-String -Path "apps\server\src\server.mjs" -Pattern "configureSessionValidation"` returns zero matches. The helper is contractually deferred per WP-131 §C step 1; any import or invocation indicates the route-helper immutability lock was breached.
- [ ] Stale catalog sentence purged: `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "until WP-126 lands"` returns no output.
- [ ] Canonical catalog sentence count: `(Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Genuinely authenticated as of WP-131 / EC-134\.").Count` returns exactly `11`. Wording variants (parentheses, missing slash, missing terminating period) FAIL.
- [ ] Wiring imports landed: `Select-String -Path "apps\server\src\server.mjs" -Pattern "createHankoSessionVerifier|productionAccountResolver|tryConstructHankoVerifier"` returns 4 matches (factory import + resolver import + helper declaration + helper invocation).
- [ ] WP-104 / WP-109 route files unchanged: `git diff apps/server/src/profile/ownerProfile.routes.ts apps/server/src/teams/team.routes.ts` returns no output.
- [ ] WP-126 verifier directory unchanged: `git diff apps/server/src/auth/hanko/` returns no output.
- [ ] WP-112 contract files unchanged: `git diff apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.logic.test.ts apps/server/src/auth/accountLookup.logic.ts apps/server/src/auth/accountLookup.logic.test.ts` returns no output.
- [ ] Env declarations unchanged: `git diff render.yaml .env.example` returns no output.
- [ ] Dependency surface unchanged: `git diff apps/server/package.json pnpm-lock.yaml` returns no output.
- [ ] `git diff --name-only` lists exactly the 9 files in WP-131 §Files Expected to Change.
- [ ] New `Library-only` catalog row for `productionAccountResolver` lands in the locked position (immediately after the `findAccountByAuthProviderSub` row); closed-set Status / Auth values preserved per D-11804 + D-9905.
- [ ] Production-mode startup-guard test asserts the locked full-sentence diagnostic verbatim; any deviation FAILs.
- [ ] Both `register*Routes` deps bundles carry structurally identical `verifier` + `accountResolver` references (same singleton verifier; same resolver closure) — confirmed by inspection of the two call sites.

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-134:` on the code commit (per `01.3-commit-hygiene-under-ec-mode.md`); `SPEC:` on the governance close commit; `WP-131:` is forbidden per P6-36.
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6` per `01.3` Vision Trailer convention.
- [ ] D-11804 catalog update obligation lands in the same commit as code: 11 row replacements + 1 new `Library-only` row.
- [ ] No `--no-verify`, no `--no-gpg-sign` per `01.3` "Bypassing Hooks".

## §7 — Post-Execution Checks

- [ ] All WP-131 §Acceptance Criteria pass.
- [ ] `D-13101..D-13104` written into `DECISIONS.md` in numeric order with executor's locked choices + rationale + rejected alternatives. Each entry's status is `Active`. (If board-layout chain reserved any of these slots by execution time, retarget per WP §Decision Points.)
- [ ] `STATUS.md` `### WP-131 / EC-134 Executed` block at top of `## Current State` cites: the new `accountResolver.logic.ts` file; the `tryConstructHankoVerifier()` startup gate; the eleven catalog rows graduating from fail-closed to genuinely authenticated; the four locked D-decisions; the post-WP-126 / pre-WP-131 → post-WP-131 test-baseline shift (+5 tests).
- [ ] `WORK_INDEX.md` WP-131 row added to Phase 7 and checked off with date + commit hash.
- [ ] `EC_INDEX.md` EC-134 row flipped to `Done {YYYY-MM-DD}` with commit hash.
- [ ] If 01.6 post-mortem authored: file at `docs/ai/post-mortems/01.6-WP-131-authenticated-routes-production-wiring.md` covering the D-13101 NODE_ENV-branching pattern as a reusable startup-guard precedent and the contract-immutability discipline that kept route-helper files byte-identical despite a substantial behavior change.

## Common Failure Smells

- `tryConstructHankoVerifier()` returns `undefined` in production-mode boot with missing env (instead of throwing) → D-13101 violated. The "try" prefix names the return type, not the policy; production must be fatal.
- `accountResolver.logic.ts` throws on a database fault (instead of forwarding `Result.fail({ code: 'lookup_failed' })`) → no-throw discipline violated. Wrap the lookup call's failure path verbatim from `findAccountByAuthProviderSub`.
- `apps/server/src/server.mjs` imports `configureSessionValidation` "for symmetry" or "in case we need it later" → D-13103 contract lock violated. The helper is contractually deferred; consuming it requires refactoring route helpers, which is a forbidden touch under WP-104 / WP-109.
- The verifier is constructed twice per `startServer()` (e.g., once for each `register*Routes` call) → single-construction invariant violated. Construct once via `tryConstructHankoVerifier()`; reuse the reference across both `register*Routes` deps bundles.
- `register*Routes` is called with `verifier: defined, accountResolver: undefined` (or vice versa) → asymmetric-deps violated. The `accountResolver` field MUST mirror the `verifier === undefined ? undefined : productionAccountResolver` ternary.
- `Number(process.env.HANKO_JWKS_REFRESH_INTERVAL_MS)` is passed as `jwksRefreshIntervalMs` when the env var is unset → produces `NaN`, defeats D-12603 default substitution. Pass `undefined` explicitly when the env var is empty.
- Catalog rows use parenthesized "Genuinely authenticated as of WP-131 (EC-134)" or omit the terminating period → wording variant; the count gate at §5 expects the verbatim canonical sentence "Genuinely authenticated as of WP-131 / EC-134." (slash, no parens, period).
- Catalog row's `Authorizing WP` column is changed from `WP-104` / `WP-109` to `WP-131` → authorship-graduation violated. WP-131 changes the auth posture, not the authoring WP.
- A new `Library-only` row's `Status` column carries `Wired` instead of `Library-only` → closed-set taxonomy violated per D-11804 + D-9905. The resolver is a library function reachable via direct import from `apps/server/src/server.mjs`, not an HTTP endpoint.
- `apps/server/src/profile/ownerProfile.routes.ts` or `apps/server/src/teams/team.routes.ts` shows up in `git diff` → contract-immutability violated. The route files are byte-identical pre- and post-WP-131; the wiring lives entirely in `server.mjs`.
- `apps/server/src/auth/hanko/` shows up in `git diff` → WP-126 contract directory lock violated. The verifier is consumed at the boundary; never modified.
