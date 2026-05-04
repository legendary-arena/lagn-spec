# WP-131 — Authenticated Routes Production Wiring (Hanko Verifier + Account Resolver)

**Status:** Draft (drafted 2026-05-03; lint-gate self-review **PASS** — see §Lint Self-Review at the foot)
**Primary Layer:** Server (`apps/server/src/auth/**` for the new resolver helper; `apps/server/src/server.mjs` for the wiring site)
**Dependencies:** WP-126 (`createHankoSessionVerifier(config)` factory + `HankoVerifierConfig` shape + three env vars `HANKO_TENANT_BASE_URL` / `HANKO_EXPECTED_AUDIENCE` / `HANKO_JWKS_REFRESH_INTERVAL_MS`); WP-112 (`SessionVerifier` interface + `AccountResolver` type + `requireAuthenticatedSession` orchestrator + `findAccountByAuthProviderSub` lookup helper); WP-104 (`registerOwnerProfileRoutes(router, pool, deps)` accepts `verifier?` + `accountResolver?` in its `deps` bundle); WP-109 (`registerTeamRoutes(router, pool, deps)` accepts the same `deps` bundle shape); WP-115 (long-lived `pg.Pool` lifecycle anchor at `apps/server/src/server.mjs`); WP-052 (`AccountId` brand + `legendary.players` table + `AuthProvider` enum).
**Slot note:** WP-128 / WP-129 / WP-130 + EC-131 / EC-132 / EC-133 are reserved by the board-layout chain (WP-128 UIState projection extensions, WP-129 desktop / mobile board layout, WP-130 reskin / playmat selector). WP-131 / EC-134 is the next free WP-keyed pair after that chain.

---

## Session Context

WP-126 (executed 2026-05-03 at `2aa7690`, `EC-130:`) shipped the
broker-specific Hanko `SessionVerifier` library at
`apps/server/src/auth/hanko/`. Its `createHankoSessionVerifier(config)`
factory returns a closure conforming to the WP-112 `SessionVerifier`
interface verbatim. WP-126 explicitly deferred production wiring per
D-11204 + D-11201 staging — the verifier exists but no call site
constructs it from environment variables and threads it into the
authenticated route helpers.

WP-104 (executed 2026-05-02, `EC-128:`) and WP-109 (executed 2026-05-03,
`EC-115:`) registered three authenticated routes under `/api/me/*` and
eight under `/api/teams/*` respectively. Both sets call
`requireAuthenticatedSession` as the first business-logic step in every
handler, but pass `verifier: undefined` and `accountResolver: undefined`
on the dependency bundle. Per D-11204 the orchestrator returns
`Result.fail({ code: 'session_verifier_not_configured' })` on every
request, surfacing as HTTP 500 to the arena-client. The shipped routes
are structurally complete but not yet reachable as authenticated
endpoints.

This WP does the wiring — it constructs the Hanko verifier from the
three env vars declared in WP-126's `render.yaml` / `.env.example`
edits, ships a small production `AccountResolver` that wraps WP-112's
`findAccountByAuthProviderSub` lookup helper, and threads both into
both `register*Routes` call sites in `apps/server/src/server.mjs`. The
existing `Library-only` rows for `requireAuthenticatedSession` /
`createHankoSessionVerifier` in `docs/ai/REFERENCE/api-endpoints.md`
remain `Library-only` (they are still library functions consumed at
startup, not HTTP endpoints), but the eleven `/api/me/*` and
`/api/teams/*` rows graduate from "fail-closed via D-11204" to
"genuinely authenticated."

---

## Goal

After this session, the production server boots with a fully wired
session-validation pipeline:

- A new file `apps/server/src/auth/accountResolver.logic.ts` exports `productionAccountResolver: AccountResolver` — a thin closure that takes a `VerifiedSessionClaim` plus a `DatabaseClient` and returns `Result<AccountId | null>` by delegating to WP-112's `findAccountByAuthProviderSub(claim.authProvider, claim.authProviderSub, database)` and remapping its row payload to the bare `AccountId | null` shape the orchestrator expects. The resolver itself never throws; database faults bubble up as `Result.fail({ code: 'lookup_failed' })` per D-11203 verbatim.
- `apps/server/src/server.mjs`'s `startServer()` reads `HANKO_TENANT_BASE_URL` + `HANKO_EXPECTED_AUDIENCE` + `HANKO_JWKS_REFRESH_INTERVAL_MS` from `process.env`. When `NODE_ENV === 'production'` the missing-env path is fatal — `startServer()` logs a full-sentence error and exits 1 (mirrors the `loadRegistry` failure path at [`apps/server/src/server.mjs:67-73`](../../../apps/server/src/server.mjs)). When `NODE_ENV !== 'production'` and either of the two required vars is unset, the server boots in fail-closed mode (logs a full-sentence warning, leaves `verifier: undefined` so authenticated routes continue to return 500 with `code: 'session_verifier_not_configured'` — matches the current pre-WP-131 behavior verbatim, preserving local-dev ergonomics for engineers who do not need authenticated paths).
- When the env vars are present, `startServer()` constructs the verifier via `createHankoSessionVerifier({ tenantBaseUrl, expectedAudience, jwksRefreshIntervalMs })` exactly once at startup, binds `productionAccountResolver`, and passes both through the existing `OwnerProfileRouteDependencies` / `TeamRouteDependencies` bundles when calling `registerOwnerProfileRoutes(server.router, pool, { requireAuthenticatedSession, verifier, accountResolver })` and `registerTeamRoutes(server.router, pool, { requireAuthenticatedSession, verifier, accountResolver })`.
- A new test in `apps/server/src/auth/accountResolver.logic.test.ts` covers the resolver's three branches: hit (returns `Result.ok(accountId)`), clean miss (returns `Result.ok(null)`), database fault (returns `Result.fail({ code: 'lookup_failed' })`).
- The existing `apps/server/src/server.mjs.test.ts` gains a startup-guard test asserting that production-mode boot with missing `HANKO_TENANT_BASE_URL` exits with a non-zero status and logs the full-sentence operator-facing diagnostic.
- `docs/ai/REFERENCE/api-endpoints.md` updates eleven `/api/me/*` and `/api/teams/*` rows in place per D-11804 replace-whole-row merge semantics: the response-schema "on `'session_verifier_not_configured'` returns `500`" sentence and the trailing notes-column "fail-closed via WP-112 D-11204 until WP-126 lands" sentence are removed in favour of "genuinely authenticated as of WP-131". One new `Library-only` row is appended for `productionAccountResolver`.

**Invariant:** WP-131 wires existing libraries together. It introduces
zero new HTTP endpoints; it modifies zero engine, registry, preplan,
arena-client, registry-viewer, or replay-producer file; it modifies
zero existing route file (`ownerProfile.routes.ts` / `team.routes.ts`
remain byte-identical). The only production-code touch outside the new
resolver helper is `apps/server/src/server.mjs`.

**Non-Goals Reminder.** This WP does NOT change any
`SessionValidationErrorCode` value, does NOT introduce CSRF / cookie /
WebSocket-carrier auth handling (per WP-112 D-11202 — bearer header
only), does NOT modify `requireAuthenticatedSession` or
`findAccountByAuthProviderSub`, does NOT alter the per-handler
`Cache-Control: no-store` discipline locked at WP-115 D-11504, does
NOT add admin RBAC, does NOT touch arena-client.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-131
> touches identity, authentication, and the production posture of
> account-bound routes; a Vision Alignment block is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §15 (Built for Contributors), Non-Goals NG-1, NG-3, NG-6.

**Conflict assertion:** **No conflict: this WP preserves all touched
clauses.**

- **§3 Player Trust & Fairness.** Production wiring graduates the
  fail-closed posture into a fail-closed-on-misconfig + verify-on-good-config
  posture. The startup guard (production-mode missing-env exit-1)
  prevents a misconfigured deploy from accepting traffic with `verifier:
  undefined` — that state is now reachable only in local development
  where it is the documented default.
- **§11 Stateless Client Philosophy.** No new server-side session state.
  The wiring composes existing request-scoped logic; the only new
  long-lived in-memory state is the JWKS cache already owned by WP-126.
- **§14 Explicit Decisions, No Silent Drift.** The four decision points
  (D-13101 missing-env behavior; D-13102 resolver location; D-13103
  per-request options construction; D-13104 startup-log discipline) are
  surfaced explicitly under §Decision Points and land in DECISIONS.md
  in numeric order at execution time.
- **§15 Built for Contributors.** A future broker swap (per WP-099
  D-9901's replacement-safety contract) replaces only the verifier
  factory call; `productionAccountResolver` is broker-agnostic by
  construction (it consumes a `VerifiedSessionClaim`, never a
  Hanko-specific symbol). The wiring site in `server.mjs` is the only
  edit a broker swap requires.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** Wiring authentication unlocks account-only
  conveniences (own-profile read / edit, team membership) per D-9905.
  No gameplay gating, no scoring impact, no leaderboard side effect is
  introduced.
- **NG-3 (content withheld):** WP-131 is wiring infrastructure. It
  gates no card, hero, scenario, or rule.
- **NG-6 (dark patterns):** No UI surface added; arena-client is
  untouched. The fail-closed banner copy on `MyProfilePage.vue` (locked
  by WP-104) remains in source but stops surfacing in production once
  this WP lands and `code: 'session_verifier_not_configured'` no longer
  fires.

**Determinism preservation:** N/A. WP-131 touches no scoring, replay,
RNG, simulation, or PAR surface. The engine package
(`packages/game-engine/`) is not imported, modified, or rebuilt.

---

## Funding Surface Gate

**Applicability:** N/A — server wiring WP. WP-131 introduces no UI
affordance, no user-visible "donate" / "support" copy, no funding-
channel integration, and no profile attribution surface. The eleven
authenticated routes graduate from fail-closed to genuinely
authenticated, but their response shapes (locked under WP-104 / WP-109)
carry no funding-related fields. Per WP-097 §F "Applicability is
declared, never inferred" + 00.3 §20.1 the N/A justification names the
absence: server wiring + library-function add; no `apps/arena-client/`
modification; no `apps/registry-viewer/` modification; no funding
copy or schema referenced.

---

## Assumes

- WP-126 complete. Specifically:
  - `apps/server/src/auth/hanko/hankoVerifier.logic.ts` exports `createHankoSessionVerifier(config: HankoVerifierConfig): SessionVerifier` (factory throws at construction time on empty `tenantBaseUrl` / `expectedAudience` per D-5201; closure NEVER throws).
  - `apps/server/src/auth/hanko/hankoVerifier.types.ts` exports `HankoVerifierConfig` with the four fields `tenantBaseUrl`, `expectedAudience`, `jwksRefreshIntervalMs?`, `fetcher?` (per D-12602).
  - `render.yaml` and `.env.example` declare the three env vars `HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE`, `HANKO_JWKS_REFRESH_INTERVAL_MS` (verified at [`render.yaml:40-49`](../../../render.yaml) and [`.env.example:41-49`](../../../.env.example)).
- WP-112 complete. Specifically:
  - `apps/server/src/auth/sessionToken.types.ts` exports `AccountResolver` as `(claim: VerifiedSessionClaim, database: DatabaseClient) => Promise<Result<AccountId | null>>`.
  - `apps/server/src/auth/sessionToken.types.ts` exports `VerifiedSessionClaim` with the three readonly fields `authProvider`, `authProviderSub`, `expiresAt`.
  - `apps/server/src/auth/sessionToken.logic.ts` exports `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>` and `configureSessionValidation(deps): (req) => Promise<Result<AccountId>>`.
  - `apps/server/src/auth/accountLookup.logic.ts` exports `findAccountByAuthProviderSub(authProvider, authProviderSub, database): Promise<Result<AccountLookupHit | null>>` (per D-11203 — positional args, `'lookup_failed'` on DB error, `Result.ok(null)` on no match).
- WP-104 complete. Specifically:
  - `apps/server/src/profile/ownerProfile.routes.ts` exports `registerOwnerProfileRoutes(router, database, deps): void` where `deps: OwnerProfileRouteDependencies` is `{ requireAuthenticatedSession, verifier?, accountResolver? }`.
  - The route file accepts `verifier` and `accountResolver` as optional fields and threads both into the `requireAuthenticatedSession(req, { verifier, accountResolver, database })` per-request call (verified at [`apps/server/src/profile/ownerProfile.routes.ts:201-205`](../../../apps/server/src/profile/ownerProfile.routes.ts)).
- WP-109 complete. Specifically:
  - `apps/server/src/teams/team.routes.ts` exports `registerTeamRoutes(router, database, deps): void` with the structurally identical `TeamRouteDependencies` bundle (verified at [`apps/server/src/teams/team.routes.ts:106-109`](../../../apps/server/src/teams/team.routes.ts)).
- WP-115 complete. Specifically:
  - `apps/server/src/db/database.js` exports `createPool()` and `closePool(pool)` and the long-lived `pg.Pool` is constructed in `startServer()` exactly once and closed in `index.mjs`'s SIGTERM handler exactly once.
- `pnpm --filter @legendary-arena/server build` exits 0
- `pnpm --filter @legendary-arena/server test` exits 0
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists
- `docs/ai/REFERENCE/api-endpoints.md` exists with the eleven `/api/me/*` and `/api/teams/*` rows + the `requireAuthenticatedSession` and `createHankoSessionVerifier` `Library-only` rows already present
- `D-12801..D-12804` and `D-13001..D-130NN` ranges are reserved for the board-layout chain (WP-128 / WP-129 / WP-130). The next free D-NNNN range for this WP is **D-13101..D-13104**.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"` — confirms `apps/server/src/auth/` is server-layer (sibling to `apps/server/src/identity/`, `apps/server/src/profile/`, `apps/server/src/teams/`, `apps/server/src/leaderboards/`); the new `accountResolver.logic.ts` lives there and inherits the same forbidden-import surface (no `boardgame.io`, no `@legendary-arena/(game-engine|registry|preplan)`, no UI / client / replay-producer package).
- `docs/ai/ARCHITECTURE.md §"Server Layer (Wiring Only)"` — reinforces that the server wires components and never decides game outcomes; this WP is squarely server-wiring.
- `.claude/rules/server.md §"Startup Sequence"` — locks the rule that `Server()` must not accept requests until startup tasks succeed; WP-131 adds verifier construction as a **post-Server-start** step (the verifier is bound into route deps before `register*Routes` is called, but does not gate `Server()` instantiation itself, mirroring how `parGate` is non-blocking and how `pool` is constructed after `Server()` per WP-115's lifecycle anchor).
- `apps/server/src/server.mjs` — read entirely; the new wiring lands between [line 137](../../../apps/server/src/server.mjs) (`pool = createPool()`) and [line 151](../../../apps/server/src/server.mjs) (`registerOwnerProfileRoutes(...)`). The two existing `register*Routes` call sites are modified to thread `verifier` + `accountResolver` through their `deps` bundles.
- `apps/server/src/auth/sessionToken.types.ts` — read entirely. The `AccountResolver` type, `VerifiedSessionClaim` shape, and `Result<T>` re-exports are the new helper's only type imports.
- `apps/server/src/auth/accountLookup.logic.ts` — read entirely. `findAccountByAuthProviderSub` is the resolver's sole runtime dependency; the resolver maps its `AccountLookupHit | null` payload to the bare `AccountId | null` shape the orchestrator expects.
- `apps/server/src/auth/hanko/hankoVerifier.logic.ts` — read the factory signature (lines 230-268). Confirms the factory throws at construction time on missing `tenantBaseUrl` / `expectedAudience`; the WP-131 startup guard catches this at production boot.
- `apps/server/src/auth/hanko/hankoVerifier.types.ts` — confirms `HankoVerifierConfig.jwksRefreshIntervalMs?: number`. `Number(process.env.HANKO_JWKS_REFRESH_INTERVAL_MS)` may produce `NaN` when the env var is unset; the wiring site MUST pass `undefined` (not `NaN`) so the verifier's D-12603 default substitution fires correctly.
- `apps/server/src/profile/ownerProfile.routes.ts:91-98` and `apps/server/src/teams/team.routes.ts:103-110` — confirm both `RouteDependencies` bundles already accept `verifier?: SessionVerifier` and `accountResolver?: AccountResolver`. WP-131 sets both to defined values; the route files are NOT modified.
- `docs/ai/REFERENCE/00.2-data-requirements.md §"Identity & Account Schema"` — confirms the canonical field-name spellings (`accountId`, `authProvider`, `authProviderId`, `authProviderSub`) used by the resolver and quoted in any DECISIONS.md entries.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix), Rule 11 (full-sentence error messages), Rule 13 (ESM only), Rule 14 (field names match data contract).
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable constraints: ESM only, Node v22+, no boardgame.io imports outside the engine package, full file contents in output.
- `docs/ai/REFERENCE/api-endpoints.md` — the eleven `/api/me/*` and `/api/teams/*` rows (lines 121-131) and the two `Library-only` rows for `requireAuthenticatedSession` (line 176) and `createHankoSessionVerifier` (line 178) are the rows replaced wholesale per D-11804 merge semantics. The new resolver gets one new `Library-only` row appended.
- `docs/ai/DECISIONS.md` — scan D-9901..D-9905 (WP-099 broker selection), D-11201..D-11204 (WP-112 sibling-WP architectural choice), D-12601..D-12604 (WP-126 Hanko verifier locks), and any D-128XX / D-129XX / D-130XX entries reserved by the board-layout chain. Specifically:
  - D-9904 confines Hanko-specific code to `apps/server/src/auth/hanko/` — the verifier import in `server.mjs` is permitted because `server.mjs` is a wiring module (per WP-099 §B); the import path lives at the `hanko/` boundary, not inside it.
  - D-11204 documents the fail-closed unconfigured default; WP-131 lifts that default for production-mode boots while preserving it for local-dev.
- `docs/ai/STATUS.md` — read the WP-126 entry (top of file as of 2026-05-03) for the locked verbatim "next major surface" description that anchors this WP.
- `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md`, `WP-129-board-layout-desktop-and-mobile.md`, `WP-130-reskin-playmat-selector.md` — confirm slot occupancy. WP-131 does NOT touch any of these surfaces; cited only to justify the slot retarget.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (N/A here; no engine touch)
- Never throw inside boardgame.io move functions — return void on invalid input (N/A here; no move touch)
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3 (N/A here; no `G` touch)
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions (N/A here)
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.) — the resolver test must use `node:test` + `node:assert`; no Vitest, no Jest
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers (the resolver IS a database-touching function but lives at the server layer where DB access is permitted; no network access introduced)
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- `apps/server/src/auth/accountResolver.logic.ts` MUST NOT import `boardgame.io`, `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, `apps/arena-client/`, `apps/registry-viewer/`, or `apps/replay-producer/`. Type imports come from `./sessionToken.types.js`, `./accountLookup.logic.js`, and `../identity/identity.types.js` only. The `pg` driver is reachable only through the `DatabaseClient` alias; a direct `pg` import is forbidden in this file (mirrors WP-112 `accountLookup.logic.ts` discipline).
- `apps/server/src/auth/accountResolver.logic.ts` MUST NOT throw. Every failure path returns a typed `Result` per WP-052 D-5201; database faults are forwarded as `Result.fail({ code: 'lookup_failed' })` from `findAccountByAuthProviderSub` verbatim.
- `apps/server/src/server.mjs` MUST construct the verifier exactly once per `startServer()` invocation (mirrors the `pool = createPool()` and `setRegistryForSetup(registry)` invariants). No per-request construction; no module-level singleton beyond what `startServer()` produces.
- `apps/server/src/server.mjs` MUST NOT modify any existing `// why:` comment block byte-identically — additions are permitted; the WP-115 / WP-104 / WP-109 / WP-126 narrative comments are locked. New `// why:` comments document the verifier construction site, the missing-env branching, and the per-mode behavioral split.
- The Hanko verifier import in `server.mjs` MUST use the path `./auth/hanko/hankoVerifier.logic.js` (compiled extension `.js` per the project's ESM `.ts` → `.js` import-suffix discipline). The wiring import is permitted at the `apps/server/src/auth/hanko/` *boundary* — D-9904's "Hanko-specific code confined to `apps/server/src/auth/hanko/`" rule applies to symbols defined inside that directory; importing the boundary symbol from outside is the documented integration path.
- The new `Library-only` catalog row for `productionAccountResolver` is appended in alphabetical / declaration-order position (after the existing `findAccountByAuthProviderSub` row at line 177). Replace-whole-row merge semantics per D-11804 — partial-update is FAIL.
- The eleven `/api/me/*` and `/api/teams/*` row updates MUST replace each row wholesale; no partial-column edits. The "fail-closed via WP-112 D-11204 until WP-126 lands" sentence in the Notes column is replaced with a "genuinely authenticated as of WP-131 (`EC-134:`)" sentence; the response-schema column drops the "on `'session_verifier_not_configured'` returns `500`" sentence and keeps the other `SessionValidationErrorCode` mappings (`'missing_token'` / `'invalid_token'` / `'expired_token'` / `'unknown_account'` → 401; `'lookup_failed'` → 500). The `Auth` column stays `authenticated-session-required` verbatim.
- No new npm dependencies. The verifier already exists per WP-126 + D-12601 (built-ins-only path); the resolver consumes only WP-112's `findAccountByAuthProviderSub`.
- No modifications permitted to:
  - `apps/server/src/auth/sessionToken.types.ts`
  - `apps/server/src/auth/sessionToken.logic.ts`
  - `apps/server/src/auth/sessionToken.logic.test.ts`
  - `apps/server/src/auth/accountLookup.logic.ts`
  - `apps/server/src/auth/accountLookup.logic.test.ts`
  - `apps/server/src/auth/hanko/**` (any file)
  - `apps/server/src/profile/ownerProfile.routes.ts`
  - `apps/server/src/teams/team.routes.ts`
  - `apps/server/src/identity/**` (any file)
  - `apps/server/src/db/**` (any file)
  - `data/migrations/**` (any file)
  - `render.yaml` (env vars already declared at WP-126)
  - `.env.example` (env vars already declared at WP-126)
  - `apps/arena-client/**`, `apps/registry-viewer/**`, `apps/replay-producer/**`
  - `packages/**`
  - `.claude/rules/*.md`

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human before proceeding — never guess or invent field names, type shapes, or file paths.
- If `findAccountByAuthProviderSub`'s signature has changed since this WP was drafted (per the `Assumes` block), STOP and reconcile against current `HEAD` per 00.3 §19 staleness rule.
- If the board-layout chain (WP-128 / WP-129 / WP-130) has reserved any of the D-NNNN slots in the D-13100..D-13104 range by execution time, retarget to D-13105 onward and update §Decision Points + the Acceptance Criteria checklist verbatim before proceeding.

**Locked contract values (inline the relevant ones):**

- **Three env vars** (per WP-126 / D-12602 — already declared in `render.yaml` and `.env.example`):
  - `HANKO_TENANT_BASE_URL` — required in production; tenant-scoped origin (e.g., `https://passkeys.hanko.io/<tenant_id>`)
  - `HANKO_EXPECTED_AUDIENCE` — required in production; audience identifier configured in the Hanko tenant
  - `HANKO_JWKS_REFRESH_INTERVAL_MS` — optional; `undefined` substitutes the D-12603 default `300_000` ms inside the verifier factory

- **`AccountResolver` signature** (per WP-112 / D-11203):
  ```
  (claim: VerifiedSessionClaim, database: DatabaseClient) => Promise<Result<AccountId | null>>
  ```

- **`VerifiedSessionClaim` shape** (per WP-112 / D-12602):
  ```
  { authProvider: AuthProvider; authProviderSub: string; expiresAt: string }
  ```

- **`HankoVerifierConfig` shape** (per WP-126 / D-12602):
  ```
  { tenantBaseUrl: string; expectedAudience: string; jwksRefreshIntervalMs?: number; fetcher?: JwksFetcher }
  ```

- **`SessionValidationErrorCode` closed union** (per WP-112 — locked, NOT modified by this WP):
  `'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account' | 'session_verifier_not_configured' | 'lookup_failed'`

- **HTTP status mapping** (per WP-104 / WP-109 — locked, NOT modified by this WP; cited here for catalog-update accuracy):
  - `'missing_token'` / `'invalid_token'` / `'expired_token'` / `'unknown_account'` → **401** (`'unknown_account'` is 401 not 403 per the account-existence-probe defense)
  - `'session_verifier_not_configured'` / `'lookup_failed'` → **500**

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection. Logging, breakpoints, or "printf debugging"
are not acceptable debugging strategies.

The following requirements are mandatory:

- **Behavior introduced is fully reproducible given identical env vars.** Two `startServer()` invocations with identical `HANKO_TENANT_BASE_URL` / `HANKO_EXPECTED_AUDIENCE` / `HANKO_JWKS_REFRESH_INTERVAL_MS` / `NODE_ENV` produce structurally identical wiring (same verifier instance class, same resolver closure, same `register*Routes` deps shape).
- **Execution is externally observable via three startup log lines:**
  - `[server] Hanko verifier configured (tenantBaseUrl=<masked>, refresh=<intervalMs>ms)` — production-mode + env present (the tenant URL is masked to its origin without path; refresh interval is logged as a number)
  - `[server] Hanko verifier NOT configured — running in fail-closed dev mode (set HANKO_TENANT_BASE_URL + HANKO_EXPECTED_AUDIENCE to enable authenticated routes)` — non-production + env absent
  - `[server] Failed to construct Hanko verifier. Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard. Error: <message>` (followed by `process.exit(1)`) — production + env absent OR factory throws
- **The packet introduces no state mutation that cannot be inspected post-execution.** The verifier closure's per-instance JWKS cache is owned by WP-126; this WP holds the closure by reference only. The resolver helper holds zero state.
- **Invariants always holding after execution:**
  - `apps/server/src/auth/accountResolver.logic.ts` exports exactly one symbol: `productionAccountResolver: AccountResolver`. No default export, no additional named exports.
  - `apps/server/src/server.mjs`'s `register*Routes` call sites pass either both `verifier` + `accountResolver` (production-mode + env present) or neither (dev-mode + env absent); never one without the other.
  - The two `register*Routes` `deps` bundles carry structurally identical `verifier` + `accountResolver` references when both are defined (same singleton verifier, same resolver closure).
- **Failures attributable to this packet are localizable via:**
  - Production-mode boot with missing env: exit-1 + the locked log line above.
  - Resolver-side database fault: orchestrator surfaces `'lookup_failed'` → 500 with body `{ "error": "lookup_failed" }`.
  - Verifier-side JWKS cache miss / refresh failure: orchestrator surfaces `'invalid_token'` (per the WP-112 mapping at `sessionToken.logic.ts:118-131`) → 401.
- **No `G.messages` entry required** — WP-131 does not touch the engine; `G.messages` does not exist in scope.

---

## Decision Points

> Four decisions surface at execution time. Recommended defaults are
> documented inline; the executor may overrule with a new D-NNNN entry
> in the same SPEC commit. All four land as `D-13101..D-13104` in
> numeric order. If the board-layout chain (WP-128 / WP-129 / WP-130)
> has reserved any of those slots by execution time, shift to the next
> free contiguous block per D-NNNN-numbering convention and update this
> section + Acceptance Criteria verbatim.

### D-DEC-1 (D-13101) — Missing-env startup behavior

**Question.** When `HANKO_TENANT_BASE_URL` or `HANKO_EXPECTED_AUDIENCE`
is absent, does `startServer()` fatally exit, fall back to fail-closed
mode silently, or branch on `NODE_ENV`?

**Options.**
- (a) **Branch on `NODE_ENV`** — production-mode missing-env exits 1; non-production-mode missing-env logs a warning and continues with `verifier: undefined`. **(Recommended default.)**
- (b) Always fatal — both production and dev fail to boot when env is missing.
- (c) Always silent — production boots in fail-closed mode and surfaces 500 to clients.

**Recommended default.** **(a)** preserves local-dev ergonomics
(engineers iterating on non-authenticated routes don't need a Hanko
tenant) while making production misconfiguration loud (the deploy
fails fast at boot, not at first authenticated request). Mirrors the
`DATABASE_URL` startup posture in `apps/server/src/index.mjs:34`.

### D-DEC-2 (D-13102) — `accountResolver` location

**Question.** Where does `productionAccountResolver` live?

**Options.**
- (a) **New file `apps/server/src/auth/accountResolver.logic.ts`** — sibling to `accountLookup.logic.ts` and `sessionToken.logic.ts`. **(Recommended default.)**
- (b) Append to `apps/server/src/auth/sessionToken.logic.ts` — production wiring lives next to the orchestrator.
- (c) Append to `apps/server/src/auth/accountLookup.logic.ts` — wraps the lookup helper directly.

**Recommended default.** **(a)** preserves WP-112's contract files
(`sessionToken.logic.ts` and `accountLookup.logic.ts`) byte-identically
per the locked contract-immutability rule from WP-112 §Forbidden
Touches. It also keeps `accountResolver.logic.ts` greppable as the
single production-resolver definition site.

### D-DEC-3 (D-13103) — Per-request options construction vs. `configureSessionValidation`

**Question.** Does `server.mjs` use `configureSessionValidation(deps)`
to bind a single-arg closure, or pass `verifier` + `accountResolver`
through the existing `RouteDependencies` bundles?

**Options.**
- (a) **Pass `verifier` + `accountResolver` through the existing `RouteDependencies` bundles.** No `configureSessionValidation` call. Route helpers continue to construct the per-request `options` object via `{ verifier: deps.verifier, accountResolver: deps.accountResolver, database }`. **(Recommended default.)**
- (b) Call `configureSessionValidation` to produce a single-arg `(req) => Promise<Result<AccountId>>` closure; refactor route helpers to consume that shape.

**Recommended default.** **(a)** — the route helpers (WP-104 / WP-109)
ship with the `verifier?` + `accountResolver?` deps fields wired
through. Choosing (b) would require modifying
`apps/server/src/profile/ownerProfile.routes.ts` and
`apps/server/src/teams/team.routes.ts`, which are forbidden touches
under this WP's scope (contract-immutability per WP-104 / WP-109). The
`configureSessionValidation` factory remains an unconsumed convenience
helper, available for a future request-handler WP that introduces a
non-route consumer (e.g., a WebSocket auth handshake) without paying
the route-helper refactor tax.

### D-DEC-4 (D-13104) — Startup-log discipline (URL masking)

**Question.** Does the production startup log line include
`HANKO_TENANT_BASE_URL` verbatim, mask it to origin-only, or omit it?

**Options.**
- (a) **Mask to origin** — log `tenantBaseUrl=https://passkeys.hanko.io/***` (origin preserved, path component replaced with `***`). **(Recommended default.)**
- (b) Verbatim — log the full URL including the `/<tenant_id>` path.
- (c) Omit — log only the refresh interval.

**Recommended default.** **(a)** balances operator diagnostics (origin
visible enough to confirm the right Hanko Cloud region was hit)
against tenant-ID exposure in operator-side logs. The full URL is
visible in the Render dashboard env-var view; operators with that
access already know the tenant ID. The `***` mask makes accidental
log-aggregation exposure (Datadog, Loggly, etc.) one degree less
informative without losing the "did the env var resolve at all" signal.

---

## Scope (In)

### A) `apps/server/src/auth/accountResolver.logic.ts` (new)

- **`productionAccountResolver: AccountResolver`** — single named export. Closure body:
  1. Calls `findAccountByAuthProviderSub(claim.authProvider, claim.authProviderSub, database)`.
  2. On `Result.fail` (lookup error): returns the failure `Result` verbatim (preserves `'lookup_failed'` code + reason per D-11203).
  3. On `Result.ok(null)` (no account row): returns `{ ok: true, value: null }` (the orchestrator translates `null` to `'unknown_account'` per `sessionToken.logic.ts:211-218`).
  4. On `Result.ok(hit)` (account found): returns `{ ok: true, value: hit.accountId }` (drops `authProvider` + `authProviderId` fields the orchestrator does not need).
- Module header JSDoc documents:
  - The `AccountResolver` contract verbatim.
  - The translation site (`AccountLookupHit → AccountId | null`) is local to this file.
  - The forbidden-import surface (no boardgame.io / engine / registry / preplan / UI / client / replay-producer; no direct `pg`).
  - Authority chain: WP-131 §A; WP-112 D-11203 (`findAccountByAuthProviderSub` signature lock); WP-126 (verifier consumer of this resolver via the orchestrator's `accountResolver` slot).
- Add `// why:` comment on the no-mutation discipline (the resolver is a thin map; database faults bubble up unchanged so the orchestrator's translation site at `sessionToken.logic.ts:188-194` is the single error-code-mapping site).

### B) `apps/server/src/auth/accountResolver.logic.test.ts` (new)

Add `node:test` tests in `apps/server/src/auth/accountResolver.logic.test.ts`:

- **`describe('productionAccountResolver (WP-131)')`** with three test cases:
  1. `'returns Result.ok(accountId) when findAccountByAuthProviderSub returns a hit'` — fake `DatabaseClient` returns one row with the locked column shape `{ ext_id: 'acct-fixture-1', auth_provider: 'google', auth_provider_id: 'sub-fixture-1' }`; assert resolver returns `{ ok: true, value: 'acct-fixture-1' }`.
  2. `'returns Result.ok(null) when findAccountByAuthProviderSub returns a clean miss'` — fake `DatabaseClient` returns `{ rows: [] }`; assert resolver returns `{ ok: true, value: null }`.
  3. `'returns Result.fail({ code: lookup_failed }) when findAccountByAuthProviderSub throws'` — fake `DatabaseClient` throws `new Error('connection lost')`; assert resolver returns `{ ok: false, code: 'lookup_failed' }` AND the `reason` field contains the substring `'connection lost'` per `accountLookup.logic.ts:140-148` propagation.
- All three tests use a locally-defined fake `DatabaseClient` (the `query(text, params): Promise<{ rows: T[] }>` shape from `identity.types.ts`); no real PostgreSQL connection; no `TEST_DATABASE_URL` skip-pattern (these are pure logic tests by construction).
- Tests do not import from `boardgame.io`, `boardgame.io/testing`, or any engine / registry / preplan / UI package. The only imports are `node:test`, `node:assert/strict`, `./accountResolver.logic.js`, and `./sessionToken.types.js` (for the fake claim shape).
- Add `// why:` comment on each test explaining what guarantee it locks (e.g., test 3: "// why: confirms the resolver does not swallow database faults — `'lookup_failed'` must propagate verbatim so the orchestrator surfaces 500, not 401, at the route boundary.").

### C) `apps/server/src/server.mjs` (modified)

Modifications fall in three blocks; the rest of the file is byte-identical pre- and post-WP-131.

1. **New imports** (top of file, immediately after the existing `requireAuthenticatedSession` import at line 20):
   ```
   import { createHankoSessionVerifier } from './auth/hanko/hankoVerifier.logic.js';
   import { productionAccountResolver } from './auth/accountResolver.logic.js';
   ```
   `configureSessionValidation` is NOT imported under D-13103 = (a) (the recommended default).

2. **New helper function** `tryConstructHankoVerifier()` (declared above `startServer`, returns `SessionVerifier | undefined`):
   - Reads `process.env.HANKO_TENANT_BASE_URL`, `process.env.HANKO_EXPECTED_AUDIENCE`, `process.env.HANKO_JWKS_REFRESH_INTERVAL_MS`.
   - When BOTH `HANKO_TENANT_BASE_URL` and `HANKO_EXPECTED_AUDIENCE` are present and non-empty: constructs `createHankoSessionVerifier({ tenantBaseUrl, expectedAudience, jwksRefreshIntervalMs })` (passing `undefined` for `jwksRefreshIntervalMs` when the env var is unset, NOT `NaN` from `Number(undefined)`); on success logs `[server] Hanko verifier configured (tenantBaseUrl=<masked>, refresh=<intervalMs>ms)` per D-13104 = (a) and returns the verifier; on factory throw catches the error and re-throws (the production path bubbles up to `startServer`'s caller in `index.mjs`).
   - When EITHER env var is absent or empty: branches on `NODE_ENV` per D-13101 = (a):
     - `NODE_ENV === 'production'`: throws a new `Error` with full-sentence text "Hanko verifier configuration is incomplete. Set HANKO_TENANT_BASE_URL and HANKO_EXPECTED_AUDIENCE in the Render dashboard before deploying. Production cannot start without them."
     - Otherwise: logs `[server] Hanko verifier NOT configured — running in fail-closed dev mode (set HANKO_TENANT_BASE_URL + HANKO_EXPECTED_AUDIENCE to enable authenticated routes)` and returns `undefined`.
   - JSDoc documents the three return paths, the NODE_ENV branch, and the URL masking rule.
   - Add `// why:` comment on the `Number()` parsing of `HANKO_JWKS_REFRESH_INTERVAL_MS` explaining that `Number(undefined)` produces `NaN` and the verifier factory's D-12603 default substitution requires `undefined`, not `NaN`.

3. **Modified wiring** (between lines 137 and 165):
   - Immediately after `console.log('[server] pg.Pool constructed (max=10)')`, add `const verifier = tryConstructHankoVerifier();`.
   - Modify the existing `registerOwnerProfileRoutes(server.router, pool, { requireAuthenticatedSession })` call site to:
     ```
     registerOwnerProfileRoutes(server.router, pool, {
       requireAuthenticatedSession,
       verifier,
       accountResolver: verifier === undefined ? undefined : productionAccountResolver,
     });
     ```
   - Modify the existing `registerTeamRoutes(server.router, pool, { requireAuthenticatedSession })` call site identically.
   - Update the existing `// why:` comment blocks (the WP-104 D-10408 block at lines 141-150 and the WP-109 D-10408 block at lines 155-162) to:
     - Drop the trailing "until WP-126 lands the broker-specific SessionVerifier" sentence.
     - Add a new sentence: "WP-131 wires the Hanko verifier (production) or leaves both fields undefined (dev-mode + missing env) — the existing fail-closed orchestrator path handles the dev-mode case unchanged."

### D) `apps/server/src/server.mjs.test.ts` (modified)

Add one new `describe('startup guard (WP-131)')` block beneath the
existing test surface. The block contains exactly two test cases:

1. `'production-mode boot with missing HANKO_TENANT_BASE_URL throws the locked diagnostic'` — sets `process.env.NODE_ENV = 'production'`, deletes `process.env.HANKO_TENANT_BASE_URL`, sets `process.env.HANKO_EXPECTED_AUDIENCE = 'fixture-aud'`, calls `startServer()` inside a `try/catch`, asserts the caught error's `.message` matches the locked full-sentence diagnostic verbatim.
2. `'dev-mode boot with missing env returns a server with verifier undefined'` — sets `process.env.NODE_ENV = 'development'`, deletes both env vars, calls `startServer()`, asserts the returned `appServer` is non-null AND no error is thrown. The `pool` is closed via `closePool(pool)` in the test cleanup.

Both tests save and restore `process.env` keys via `before` / `after`
hooks to avoid state leakage into adjacent tests. Add a `// why:`
comment on each test naming the D-13101 path it locks.

If `apps/server/src/server.mjs.test.ts` does not currently structurally
support these (e.g., it's a bare smoke test with no `describe` blocks),
the new tests are added in the smallest-surface form that compiles and
runs under `node:test` — no broader test-file refactor.

### E) `docs/ai/REFERENCE/api-endpoints.md` (modified)

Per D-11804 replace-whole-row merge semantics:

1. **Eleven row updates** (the three `/api/me/*` rows at lines 121-123 and the eight `/api/teams/*` rows at lines 124-131): each row is replaced wholesale. The `Status` / `Method` / `Path` / `Auth` / `Authorizing WP` columns stay identical (all `Wired`, all `authenticated-session-required`, all carry their original `WP-104` / `WP-109` authorizing WP — WP-131 does not graduate authorship). The Response Schema column drops its "on `'session_verifier_not_configured'` returns `500`" sentence and keeps the rest of the closed-set `SessionValidationErrorCode` mappings intact. The Notes column drops the "fail-closed via WP-112 D-11204 until WP-126 lands" sentence and adds "Genuinely authenticated as of WP-131 (`EC-134:`); production wiring constructs the Hanko verifier at startup from `HANKO_TENANT_BASE_URL` + `HANKO_EXPECTED_AUDIENCE`."
2. **One new `Library-only` row** appended in the existing `Library-only` section, immediately after the row for `findAccountByAuthProviderSub` (line 177): a row for `productionAccountResolver` documenting the `(claim, database)` signature, the `Result<AccountId | null>` return shape, the no-throw discipline, and the WP-131 authoring WP. The row uses the canonical Status `Library-only` and a Method / Path of `(n/a — function productionAccountResolver)` per the existing Library-only conventions.

No other rows are touched.

---

## Out of Scope

- **No HTTP endpoint introductions.** The eleven `/api/me/*` and `/api/teams/*` routes were registered by WP-104 / WP-109; WP-131 changes their effective auth posture by wiring the verifier, not by registering new routes. No `router.<verb>(...)` call is added or removed.
- **No `requireAuthenticatedSession` modification.** The orchestrator's logic at `apps/server/src/auth/sessionToken.logic.ts:157-220` is not touched; the `SessionValidationErrorCode` closed union is not modified.
- **No `findAccountByAuthProviderSub` modification.** The lookup helper at `apps/server/src/auth/accountLookup.logic.ts:120-156` is not touched; the locked SQL projection and the `'lookup_failed'` semantics are preserved.
- **No route-helper refactor.** `apps/server/src/profile/ownerProfile.routes.ts` and `apps/server/src/teams/team.routes.ts` are byte-identical pre- and post-WP-131. `configureSessionValidation` is not consumed (D-13103 = (a)).
- **No env-var declaration changes.** `render.yaml` and `.env.example` are byte-identical pre- and post-WP-131 (the three Hanko env vars were declared at WP-126).
- **No new npm dependencies.** D-12601's built-ins-only path is preserved.
- **No `apps/arena-client/` changes.** The fail-closed banner copy on `MyProfilePage.vue` (locked at WP-104) remains in source; it stops surfacing in production once this WP lands but the source string is unchanged.
- **No CSRF / cookie / WebSocket-carrier auth handling.** Bearer-header-only posture per WP-112 D-11202 is preserved.
- **No admin RBAC.** `applyOperatorOverride` (WP-109) remains route-less per WP-104's deferred admin surface; this WP does not change that.
- **No rate limiting.** Deferred per WP-115 D-11503 to a future hardening WP.
- **No request-ID middleware.** Per `api-endpoints.md` "Error Contract" section, `requestId?` remains `conditional-on-server-trace-injection`; this WP does not introduce trace injection.
- **No `legendary.players` write paths.** Account provisioning (the Hanko-callback INSERT-on-first-login flow) is a separate future surface; until that lands, `'unknown_account'` is the dominant 401 response on Hanko-authenticated requests for new users.
- **No `apps/server/src/auth/hanko/` modifications.** WP-126's verifier directory is byte-identical pre- and post-WP-131.
- **No board-layout overlap.** WP-128 / WP-129 / WP-130 are sibling WPs in flight on a separate axis (UIState board-layout projection + Vue board components + reskin selector); WP-131 does not depend on them and does not modify any file they touch.
- **Refactors, cleanups, or "while I'm here" improvements are out of scope** unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `apps/server/src/auth/accountResolver.logic.ts` — **new** — `productionAccountResolver: AccountResolver` closure per §A.
- `apps/server/src/auth/accountResolver.logic.test.ts` — **new** — three `node:test` cases per §B.
- `apps/server/src/server.mjs` — **modified** — three additions per §C: new imports, `tryConstructHankoVerifier()` helper, modified `register*Routes` deps bundles + updated `// why:` comments.
- `apps/server/src/server.mjs.test.ts` — **modified** — one new `describe('startup guard (WP-131)')` block with two test cases per §D.
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — eleven row replacements + one new `Library-only` row appended per §E + D-11804.
- `docs/ai/STATUS.md` — **modified** — `### WP-131 / EC-134 Executed` block at top of `## Current State` per the WP-126 / WP-127 / WP-115 STATUS-block precedent.
- `docs/ai/DECISIONS.md` — **modified** — `D-13101..D-13104` inserted in numeric order per §Decision Points.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-131 row added to Phase 7 list and flipped `[ ]` → `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-134 row added with status `Done`.

Total at session close: **9 files** (2 new + 7 modified). Within the
≤8 soft limit per 00.3 §5, with the +1 acknowledged as the four
governance ledgers (the +1 over soft limit is conventional for any WP
that updates STATUS / DECISIONS / WORK_INDEX / EC_INDEX in the same
governance close — see WP-115, WP-126 precedent).

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A — `accountResolver.logic.ts`
- [ ] `apps/server/src/auth/accountResolver.logic.ts` exists.
- [ ] The file exports exactly one named symbol: `productionAccountResolver`.
- [ ] `productionAccountResolver` has TypeScript type `AccountResolver` (verified by structural conformance check at compile time — `pnpm --filter @legendary-arena/server build` exits 0).
- [ ] No `throw` statement in `apps/server/src/auth/accountResolver.logic.ts` (confirmed with `Select-String`).
- [ ] No import from `boardgame.io`, `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, `apps/arena-client`, `apps/registry-viewer`, `apps/replay-producer`, or `pg` in `apps/server/src/auth/accountResolver.logic.ts` (confirmed with `Select-String`).

### B — `accountResolver.logic.test.ts`
- [ ] `apps/server/src/auth/accountResolver.logic.test.ts` exists.
- [ ] The test file contains exactly one `describe('productionAccountResolver (WP-131)', …)` block with three test cases (hit / clean miss / lookup failure).
- [ ] Test file imports `node:test` and `node:assert/strict` only (no `boardgame.io`, no `boardgame.io/testing`, no Vitest, no Jest, no Mocha).
- [ ] All three tests pass under `pnpm --filter @legendary-arena/server test` (confirmed by exit code 0 and `tests 3 / pass 3 / fail 0` in the new suite's TAP output).

### C — `server.mjs` wiring
- [ ] `apps/server/src/server.mjs` imports `createHankoSessionVerifier` from `./auth/hanko/hankoVerifier.logic.js`.
- [ ] `apps/server/src/server.mjs` imports `productionAccountResolver` from `./auth/accountResolver.logic.js`.
- [ ] `apps/server/src/server.mjs` declares a `tryConstructHankoVerifier()` helper that reads the three env vars and branches on `NODE_ENV` per D-13101.
- [ ] `startServer()` invokes `tryConstructHankoVerifier()` exactly once, between `createPool()` and `registerOwnerProfileRoutes(...)`.
- [ ] Both `register*Routes` call sites pass the same three deps fields (`requireAuthenticatedSession`, `verifier`, `accountResolver`) — `verifier` and `accountResolver` are either both defined or both `undefined` (verified by inspection — the `accountResolver` field uses the conditional `verifier === undefined ? undefined : productionAccountResolver`).
- [ ] No `Math.random` in `apps/server/src/server.mjs` (confirmed with `Select-String`).
- [ ] The existing `// why:` comment blocks at lines 141-150 (WP-104) and 155-162 (WP-109) are updated per §C step 3 (drop "until WP-126 lands" sentence; add "WP-131 wires …" sentence).

### D — `server.mjs.test.ts` startup guard
- [ ] `apps/server/src/server.mjs.test.ts` contains a `describe('startup guard (WP-131)', …)` block.
- [ ] The block contains exactly two test cases per §D.
- [ ] Both tests pass under `pnpm --filter @legendary-arena/server test`.
- [ ] The production-mode test asserts the locked full-sentence diagnostic verbatim (any deviation from the §C-locked message body is a FAIL).

### E — `api-endpoints.md` catalog update
- [ ] All eleven `/api/me/*` and `/api/teams/*` rows are replaced wholesale (per D-11804 — partial-update is FAIL).
- [ ] The string "until WP-126 lands the broker-specific SessionVerifier" appears zero times in `docs/ai/REFERENCE/api-endpoints.md` after the update (confirmed with `Select-String`).
- [ ] The string "Genuinely authenticated as of WP-131" appears exactly eleven times (one per updated row).
- [ ] One new `Library-only` row exists for `productionAccountResolver` at the locked position (immediately after the `findAccountByAuthProviderSub` row).
- [ ] All updated rows preserve the `Wired` Status, `authenticated-session-required` Auth, original `Authorizing WP` (WP-104 / WP-109), and original Method / Path columns verbatim.
- [ ] Every catalog row's `Status` column carries one of the four closed-set values `Wired | Shipped-but-unwired | Library-only | Pending` (per D-11804); every `Auth` column carries one of the three closed-set values `guest | handle-required | authenticated-session-required` (per D-9905). Confirmed by inspection.

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 (all server test files).
- [ ] Server test baseline shifts from `pass 124 / fail 0 / skipped 54` (post-WP-126) to `pass 124 + 5 / fail 0 / skipped 54 + N` where 5 = 3 (resolver) + 2 (startup guard) and N = 0 (no new DB-required tests). Acceptable variance: ±0 on logic-pure delta; the suite count grows by exactly 1 (the new `accountResolver.logic.test.ts` suite). Note: the post-WP-128 / WP-129 / WP-130 baseline may shift this floor; reconcile against current `HEAD` per 00.3 §19 at execution time.
- [ ] No test imports from `boardgame.io` (confirmed with `Select-String -Path "apps\server\src" -Pattern "from 'boardgame.io" -Recurse`).

### Scope Enforcement
- [ ] `git diff --name-only` lists only the nine files in `## Files Expected to Change`.
- [ ] No file under `apps/server/src/auth/sessionToken*`, `apps/server/src/auth/accountLookup*`, `apps/server/src/auth/hanko/**`, `apps/server/src/profile/`, `apps/server/src/teams/`, `apps/server/src/identity/`, `apps/server/src/db/`, `data/migrations/`, or `apps/arena-client/` is modified (confirmed with `git diff --name-only` filtered against each path).
- [ ] `apps/server/package.json` and `pnpm-lock.yaml` are unchanged (confirmed with `git diff`).
- [ ] `render.yaml` and `.env.example` are unchanged (confirmed with `git diff`).

### Vision / Funding / Catalog gates
- [ ] §17 Vision Alignment block present (§3, §11, §14, §15, NG-1, NG-3, NG-6 cited; no conflict; determinism preservation declared N/A).
- [ ] §20 Funding Surface Gate marked N/A with explicit one-sentence justification (server wiring; no UI; no funding copy).
- [ ] §21 API Catalog updated in the same commit (eleven row replacements + one new Library-only row).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/server build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all server tests
pnpm --filter @legendary-arena/server test
# Expected: TAP output — pass = (prior baseline + 5), fail = 0

# Step 3 — confirm no throw in the new resolver
Select-String -Path "apps\server\src\auth\accountResolver.logic.ts" -Pattern "throw "
# Expected: no output

# Step 4 — confirm no forbidden imports in the new resolver
Select-String -Path "apps\server\src\auth\accountResolver.logic.ts" -Pattern "boardgame.io|@legendary-arena/(game-engine|registry|preplan)|apps/(arena-client|registry-viewer|replay-producer)|from 'pg'"
# Expected: no output

# Step 5 — confirm no Math.random anywhere in scope
Select-String -Path "apps\server\src" -Pattern "Math.random" -Recurse
# Expected: no output

# Step 6 — confirm the 'until WP-126 lands' sentence is fully removed from the catalog
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "until WP-126 lands"
# Expected: no output

# Step 7 — confirm the 'Genuinely authenticated as of WP-131' sentence is present 11 times
(Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Genuinely authenticated as of WP-131").Count
# Expected: 11

# Step 8 — confirm the wiring imports landed in server.mjs
Select-String -Path "apps\server\src\server.mjs" -Pattern "createHankoSessionVerifier|productionAccountResolver|tryConstructHankoVerifier"
# Expected: 4 matches (1 import line for verifier factory + 1 import line for resolver + 1 declaration of helper + 1 invocation in startServer)

# Step 9 — confirm the WP-104 / WP-109 route files were NOT modified
git diff --name-only apps/server/src/profile/ownerProfile.routes.ts apps/server/src/teams/team.routes.ts
# Expected: no output

# Step 10 — confirm no files outside scope were changed
git diff --name-only
# Expected: only the nine files listed in ## Files Expected to Change

# Step 11 — confirm package.json + lock-file are unchanged (no new npm dependency)
git diff apps/server/package.json pnpm-lock.yaml
# Expected: no output

# Step 12 — confirm env declarations are unchanged
git diff render.yaml .env.example
# Expected: no output
```

---

## Definition of Done

> Claude Code must execute every verification command in `## Verification Steps`
> before checking any item below. Reading the code is not sufficient — run the
> commands.

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 (all server test files; +5 tests over post-WP-126 baseline, modulo any board-layout-chain shifts at execution time)
- [ ] No `throw` in `apps/server/src/auth/accountResolver.logic.ts` (confirmed with `Select-String`)
- [ ] No `Math.random` in any new or modified file (confirmed with `Select-String`)
- [ ] No `boardgame.io` import in `apps/server/src/auth/accountResolver.logic.ts` or its test (confirmed with `Select-String`)
- [ ] WP-104 contract files (`ownerProfile.routes.ts`, `ownerProfile.logic.ts`, `ownerProfile.types.ts`) were not modified (confirmed with `git diff`)
- [ ] WP-109 contract files (`team.routes.ts`, `team.logic.ts`, `team.types.ts`) were not modified (confirmed with `git diff`)
- [ ] WP-112 contract files (`sessionToken.types.ts`, `sessionToken.logic.ts`, `accountLookup.logic.ts` and their tests) were not modified (confirmed with `git diff`)
- [ ] WP-126 contract files (any file under `apps/server/src/auth/hanko/`) were not modified (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated with a `### WP-131 / EC-134 Executed` block at top of `## Current State` describing what authenticated-route capability is now reachable
- [ ] `docs/ai/DECISIONS.md` updated with `D-13101..D-13104` in numeric order per §Decision Points (or the next free contiguous block if the board-layout chain has reserved D-13100..D-13104 by execution time)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-131 added to Phase 7 and checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-134 row with status `Done`
- [ ] §17 Vision Alignment block present and cites §3 / §11 / §14 / §15 + NG-1 / NG-3 / NG-6
- [ ] §20 Funding Surface Gate present and marked N/A with one-sentence justification
- [ ] §21 API Catalog updated in the same commit (eleven `/api/me/*` and `/api/teams/*` row replacements + one new `Library-only` row for `productionAccountResolver`)
- [ ] Commit prefix `EC-134:` on the code commit (per `01.3-commit-hygiene-under-ec-mode.md`); commit prefix `SPEC:` on the governance close commit; `WP-131:` is forbidden per P6-36
- [ ] If 01.6 post-mortem authored: file at `docs/ai/post-mortems/01.6-WP-131-authenticated-routes-production-wiring.md` covering at minimum the D-13101 NODE_ENV-branching pattern as a reusable startup-guard precedent and the contract-immutability discipline that kept the route-helper files byte-identical despite a substantial behavior change

---

## Lint Self-Review (00.3 Prompt Lint Checklist)

> Per `.claude/CLAUDE.md` "Lint Gate (Mandatory for Work Packet Actions)": every WP must pass the lint checklist before execution. This block records the self-review disposition section by section. A reviewer's disagreement with any disposition below is a §1-priority blocker per the lint checklist's How-to-Lint procedure.

- **§1 Structure** — PASS. All ten required sections present (Goal, Assumes, Context (Read First), Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done). `## Out of Scope` is non-empty (thirteen explicit exclusions).
- **§2 Non-Negotiable Constraints Block** — PASS. Engine-wide block present (forbids partial output, requires full file contents, declares ESM only / Node v22+, references 00.6-code-style.md). Packet-specific block enumerates the locked forbidden imports + the no-throw discipline. Session protocol present (stop-and-ask + slot-retarget rule). Locked contract values present (env vars + types + closed unions + HTTP status mapping).
- **§3 Prerequisites (Assumes)** — PASS. Every prior WP cited (WP-126, WP-112, WP-104, WP-109, WP-115, WP-052) with specific exports + line numbers. External state listed (env vars declared in render.yaml + .env.example). D-NNNN slot reservation noted for the board-layout chain.
- **§4 Context References** — PASS. ARCHITECTURE.md cited with two specific subsections; .claude/rules/server.md cited; 00.2 cited (Identity & Account Schema); 00.6 cited (Rules 4 / 6 / 9 / 11 / 13 / 14); DECISIONS.md citation scope listed; STATUS.md cited; sibling WPs (WP-128 / 129 / 130) cited for slot-justification only.
- **§5 Output Completeness (Files Expected to Change)** — PASS. Nine files listed, each marked `new` / `modified` with a one-line description. No ambiguous "update this section" / "show the diff" language. The +1-over-soft-limit is acknowledged with the WP-115 / WP-126 precedent.
- **§6 Naming Consistency** — PASS. Field names (`accountId`, `authProvider`, `authProviderSub`, `authProviderId`) match 00.2 verbatim. Function names (`productionAccountResolver`, `tryConstructHankoVerifier`, `requireAuthenticatedSession`, `findAccountByAuthProviderSub`, `createHankoSessionVerifier`, `configureSessionValidation`) match prior-WP exports verbatim.
- **§7 Dependency Discipline** — PASS. No new npm dependency (D-12601 built-ins-only path preserved; verified via `Verification Step 11`). Forbidden packages explicitly excluded (no axios / node-fetch; no Jest / Vitest / Mocha; Hanko carve-out cited).
- **§8 Architectural Boundaries** — PASS. Server-layer-only changes; no engine-layer touch; no `G` / `ctx` mutation; no boardgame.io import outside `server.mjs`'s pre-existing `Server()` import; `pg` accessed only through the `DatabaseClient` alias in the new resolver.
- **§9 Windows Compatibility** — PASS. All Verification Steps use `pwsh` syntax (`Select-String`, backslash separators, `(...).Count` for cardinality). No bash / sh syntax.
- **§10 Environment Variable Hygiene** — PASS. Three env vars listed (`HANKO_TENANT_BASE_URL`, `HANKO_EXPECTED_AUDIENCE`, `HANKO_JWKS_REFRESH_INTERVAL_MS`). Each documents purpose + source (Render dashboard via render.yaml; .env.example for local dev). No real secrets in WP body. The `HANKO_TENANT_BASE_URL` placeholder uses `https://passkeys.hanko.io/<tenant_id>` (literal `<tenant_id>` placeholder).
- **§11 Authentication Clarity** — PASS. Single identity model committed: Hanko-mediated bearer token validated by the WP-112 orchestrator + WP-126 verifier; account resolution via `findAccountByAuthProviderSub`. Protected endpoints (the eleven authenticated routes) inherit auth posture from WP-104 / WP-109 (`'unknown_account'` → 401 per the account-existence-probe defense).
- **§12 Test Quality** — PASS. Tests use `node:test` + `node:assert/strict` only. No boardgame.io import. No network access required (the resolver tests use a local fake `DatabaseClient`; the startup-guard tests manipulate `process.env`).
- **§13 Commands and Verification** — PASS. All commands use `pnpm`; expected output stated inline; no "run and verify manually" phrasing.
- **§14 Acceptance Criteria Quality** — PASS. Acceptance checklist has 30+ binary items grouped by sub-task A / B / C / D / E + Tests + Scope Enforcement + Vision / Funding / Catalog gates. Every item is observable (file existence, exit code, grep, `git diff`).
- **§15 Definition of Done** — PASS. Includes STATUS.md / DECISIONS.md / WORK_INDEX.md / EC_INDEX.md updates + scope-boundary check + commit-prefix discipline.
- **§16 Code Style** — PASS. The new resolver helper is a single small function (≤ 30 lines including JSDoc). No premature abstraction (resolver is the third use of `findAccountByAuthProviderSub` across the codebase — first is the test, second is `accountLookup.logic.test.ts` integration, third is this production binding). No nested ternaries; the conditional in §C step 3 (`verifier === undefined ? undefined : productionAccountResolver`) is a single-step ternary on a boolean. Full English names throughout (`productionAccountResolver`, `tryConstructHankoVerifier`, no abbreviations). `// why:` comments documented for every non-obvious site (NaN-vs-undefined env parsing; NODE_ENV branching; no-throw discipline).
- **§17 Vision Alignment** — PASS. `## Vision Alignment` section present; clauses cited by number (§3, §11, §14, §15, NG-1, NG-3, NG-6); conflict assertion uses the locked verbatim wording; non-goal proximity check confirmed clear; determinism preservation declared N/A with reason (no scoring / replay / RNG / simulation surface).
- **§18 Prose-vs-Grep Discipline** — PASS. Verification Step 4's forbidden-import grep targets `boardgame.io|@legendary-arena/(game-engine|registry|preplan)|apps/(arena-client|registry-viewer|replay-producer)|from 'pg'`. The WP body discusses these tokens via the Non-Negotiable Constraints "MUST NOT import" sentence; this sentence cites the WP-112 `accountLookup.logic.ts` precedent and the WP-099 D-9904 module-path lock rather than enumerating the same tokens in JSDoc. The new resolver's module-header JSDoc does NOT enumerate the forbidden tokens; it cites D-9904 + the WP-112 discipline.
- **§19 Bridge-vs-HEAD Staleness** — N/A at draft time (rule applies to repo-state-summarizing artifacts at commit time, not draft time). The pre-flight bundle and the STATUS block at execution time MUST follow §19 discipline.
- **§20 Funding Surface Gate** — N/A with explicit justification (see `## Funding Surface Gate` block above): server wiring + library-function add; no `apps/arena-client/` modification; no funding copy or schema referenced; no UI surface introduced. Per 00.3 §20.1's analytical / retrospective non-trigger carve-out, the WP body's references to WP-097 / D-9701 (in the Funding Surface Gate block itself) are conceptual mention only, not user-visible copy.
- **§21 API Catalog Update** — PASS / TRIGGERED. WP-131 modifies the auth posture of eleven existing endpoints + adds one new library function reachable via direct import from `apps/server/src/**`. Per D-11804, all twelve catalog updates land in the same commit. Replace-whole-row merge semantics applied (§E + §C step 3 of Acceptance Criteria). Closed-set values preserved (`Wired` Status; `authenticated-session-required` Auth; canonical field names `accountId`, `authProvider`, `authProviderSub`, `authProviderId` per 00.2).

**Final Gate disposition:** PASS on all 38 fail-conditions. No carve-outs invoked.
