# EC-130 — External Authentication Integration (Hanko Session Verifier) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-126-external-authentication-hanko-session-verifier.md
**Layer:** Server (`apps/server/src/auth/hanko/**`) + Reference (`docs/ai/REFERENCE/api-endpoints.md` per D-11804) + Config (`render.yaml`, `.env.example`, `apps/server/package.json`)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-126.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-126.

---

## §0 — Pre-Flight

- [ ] WP-099 §A / §B / §C present at `docs/ai/work-packets/WP-099-auth-provider-selection.md`. F-1..F-7 enumerated in WP-126 §"WP-099 Future-Auth Gate (F-1..F-7) Disposition".
- [ ] WP-112 contract files present and unchanged: `apps/server/src/auth/sessionToken.types.ts` exports `SessionVerifier`, `VerifiedSessionClaim`, `SessionVerificationErrorCode`, `Result`, `AuthProvider` (re-exports). Verified by `Select-String -Path apps\server\src\auth\sessionToken.types.ts -Pattern "export (type|interface|const) (SessionVerifier|VerifiedSessionClaim|SessionVerificationErrorCode|SESSION_VERIFICATION_ERROR_CODES)"`.
- [ ] `apps/server/src/auth/hanko/` directory does NOT yet exist.
- [ ] `@teamhanko/*` does NOT yet appear in `apps/server/package.json`. `HANKO_*` does NOT yet appear in `render.yaml` or `.env.example`.
- [ ] D-9901..D-9905 + D-11201..D-11204 + D-11804 + D-5201 present in `docs/ai/DECISIONS.md`. D-11201 status is currently `Active`.
- [ ] `pnpm -r build` exits 0 on `main` HEAD; `pnpm --filter @legendary-arena/server test` exits 0; `pnpm --filter @legendary-arena/game-engine test` exits 0.
- [ ] Four executor decisions locked in writing before coding: D-12601 (dependency surface — built-ins-only default OR `@teamhanko/*` package + exact version pin), D-12602 (config shape & env-var names), D-12603 (JWKS refresh interval), D-12604 (exact Hanko federation/IdP claim key + per-provider example values + closed-set lookup keys). Recommended defaults documented in WP-126 §Decision Points; executor may override with rationale. **D-12604 carries no draft-time default** — the executor MUST observe an actual Hanko token shape (or cite Hanko docs) before locking.

## §1 — Scope Lock + File Allowlist

Eight or nine production / reference files may change (depending on D-12601 lock). Plus four governance ledgers in the same commit (per WP-104 / WP-112 / WP-115 / WP-122 / WP-125 precedent).

- `apps/server/src/auth/hanko/hankoVerifier.types.ts` — **new**
- `apps/server/src/auth/hanko/hankoVerifier.logic.ts` — **new**
- `apps/server/src/auth/hanko/hankoVerifier.logic.test.ts` — **new**
- `apps/server/src/auth/hanko/jwksCache.logic.ts` — **new**
- `apps/server/src/auth/hanko/jwksCache.logic.test.ts` — **new**
- `apps/server/package.json` — **modified or unchanged** (modified iff D-12601 locks the `@teamhanko/*` SDK path with exact version pins; unchanged — and dropped from the staged set — under the built-ins-only default)
- `render.yaml` — **modified** (`HANKO_*` env-var declarations per D-12602)
- `.env.example` — **modified** (`HANKO_*` placeholders per D-12602; tenant URL placeholder matches Hanko Cloud's `/{tenant_id}/.well-known/jwks.json` shape; no real secrets)
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** (1 new `Library-only` row for `createHankoSessionVerifier`)
- Plus governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

`git diff --name-only` lists 12 or 13 files at session close (eight or nine production/reference per D-12601 lock + four governance ledgers).

## §2 — Locked Values (do not re-derive)

- Module path: `apps/server/src/auth/hanko/` (per D-9904 verbatim).
- Factory name: `createHankoSessionVerifier`.
- Returned interface: `SessionVerifier` (re-imported from `../sessionToken.types.js`; never redeclared).
- `VerifiedSessionClaim` shape (locked by WP-112): `{ authProvider: AuthProvider; authProviderSub: string; expiresAt: string; }`.
- `SessionVerificationErrorCode` closed union (locked by WP-112): `'invalid_token' | 'expired_token' | 'unknown_provider' | 'verification_failed'`.
- Federated-IdP mapping output values: `'email' | 'google' | 'discord'` only (per WP-052 + D-9902 + F-1). No `'hanko'` value.
- JWKS endpoint convention: `${tenantBaseUrl}/.well-known/jwks.json` where `tenantBaseUrl` is the **tenant-scoped origin** per Hanko Cloud's documented `/{tenant_id}/.well-known/jwks.json` endpoint shape (e.g., `https://passkeys.hanko.io/<tenant_id>` for Hanko Cloud). The verifier appends the `/.well-known/jwks.json` suffix programmatically; the path is never hand-coded.
- JWKS refresh interval default: 5 minutes (300_000 ms) per D-12603 recommended default. Interval timer starts at factory construction; stops only on process exit; single-flight (concurrent waiters share one in-flight request).
- Dependency surface per D-12601: recommended default is **zero new dependency** (RS256 verification via Node v22 `node:crypto` / WebCrypto); optional alternative is **one** `@teamhanko/*` package with exact version pin if explicitly required. No top-level `jsonwebtoken` / `jose` / `jwks-rsa` add under either path.
- Catalog: 1 new `Library-only` row; `Status` = `Library-only`; `Auth` = `(n/a — caller-injected dependencies)`; `Authorizing WP` = `WP-126`.
- D-11201 status flips from `Active` to `Resolved` at WP-126 close.

## §3 — Guardrails

- Every `@teamhanko/*` import, `hanko.io` URL, and Hanko-specific type lives **only** under `apps/server/src/auth/hanko/`. F-2 grep gate enforces this.
- Verifier is request-scoped and never throws — every failure path returns `Result.fail({ code, reason })` with a full-sentence reason per Rule 11.
- Per-instance JWKS cache only; no module-level singleton. Two `createHankoSessionVerifier(config)` calls produce independent caches (verified by a test case).
- Cache miss triggers exactly **one** refresh-and-retry per `getKey` call. Failed refresh preserves the existing cache.
- Closed-set `HANKO_IDP_TO_AUTH_PROVIDER` lookup; unrecognized federation value → `Result.fail({ code: 'unknown_provider' })`. No string-prefix checks, no regex.
- Verifier consumes a `string` token; never reads the request directly. Token extraction is the WP-112 orchestrator's concern (D-11202).
- No top-level `jsonwebtoken` / `jose` / `jwks-rsa` add (F-5). Under D-12601's built-ins-only default: zero new dependencies; verification uses Node v22 `node:crypto` / WebCrypto. Under the optional `@teamhanko/*` SDK path: JWT-handling libraries arrive only as transitives, never as top-level adds.
- No real secrets in `.env.example`. Tenant URL uses `https://passkeys.hanko.io/YOUR_TENANT_ID` placeholder (matching Hanko Cloud's documented `/{tenant_id}/.well-known/jwks.json` endpoint shape). Real tenant IDs live in the Render dashboard only.
- No HTTP route wiring. `requireAuthenticatedSession` continues to fail-closed with `'session_verifier_not_configured'` until a future request-handler WP wires the verifier.
- No modification to WP-112 / WP-052 / WP-099 contract files.

## §4 — Required `// why:` Comments

- `hankoVerifier.types.ts` module-header JSDoc: cite D-9904 (module-path lock), D-12601 (SDK package selection), D-12604 (closed-set mapping rule), and the WP-112 `SessionVerifier` contract this file conforms to.
- `HANKO_IDP_TO_AUTH_PROVIDER` constant declaration site: cite D-9902 + F-1 (mapping output values are the WP-052 enum verbatim; no `'hanko'` value).
- `createHankoSessionVerifier` factory entry: cite per-instance state lock (no module-level singleton) per D-12603 constraint.
- Closed-union error mapping site in `verify()` closure: cite WP-112 `SessionVerificationErrorCode` ownership; verifier-side errors translate to one of the four locked codes at exactly this site.
- `jwksCache.logic.ts` `refresh()` rate-limit site: cite the deduplication invariant (concurrent `getKey` during in-flight refresh produces one network request).
- `jwksCache.logic.ts` failed-refresh-preserves-existing-cache site: cite D-12603 graceful-degradation lock.
- Any Hanko transitive (`jose` / `jsonwebtoken` / `jwks-rsa`) import site, if present: cite that the library arrives via `@teamhanko/*` and is permitted as a transitive only per F-5.

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0; `pnpm --filter @legendary-arena/game-engine test` exits 0 (engine baseline unchanged).
- [ ] **F-1:** `Select-String -Path "apps\server\src\auth","apps\server\src\identity","packages","apps\registry-viewer","apps\arena-client","data" -Pattern "['""]hanko['""]" -Recurse -Include *.ts,*.mts,*.js,*.mjs,*.sql,*.json` returns no output (the literal string `'hanko'` must never appear as an `auth_provider` value, fixture, seed, or quoted string).
- [ ] **F-2 (runtime sources only; `.env.example` / `render.yaml` exempt by design):** `Select-String -Path "apps\server\src\auth\sessionToken.types.ts","apps\server\src\auth\sessionToken.logic.ts","apps\server\src\auth\sessionToken.logic.test.ts","apps\server\src\auth\accountLookup.logic.ts","apps\server\src\auth\accountLookup.logic.test.ts","apps\server\src\identity","packages","apps\registry-viewer","apps\arena-client" -Pattern "@teamhanko|hanko\.io" -Recurse -Include *.ts,*.mts,*.js,*.mjs` returns no output (every path above is OUTSIDE `apps/server/src/auth/hanko/`; any hit indicates leakage).
- [ ] **F-3:** `Select-String -Path "apps\server\src\auth\hanko" -Pattern "randomUUID" -Recurse` returns no output.
- [ ] **F-4:** `git diff apps/server/src/server.mjs apps/server/src/leaderboards/ apps/server/src/profile/ apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/accountLookup.logic.ts` returns no output.
- [ ] **F-5:** `git diff apps/server/package.json` shows zero changes (built-ins-only path per D-12601 default) OR only `@teamhanko/*` additions with exact version pins (executor's optional SDK path). Under either path: no Auth0 / Clerk / Passport / bcrypt / argon2 / scrypt / top-level `jsonwebtoken` / `jose` / `jwks-rsa`.
- [ ] **F-6:** Replacement-safety thought experiment passes (deletion of `apps/server/src/auth/hanko/` + `@teamhanko/*` deps + `HANKO_*` env vars + the catalog row requires zero WP-112 / WP-052 / WP-099 file change).
- [ ] **F-7:** WP-126 `## Vision Alignment` cites §3, §11, §14, §15, NG-1, NG-3, NG-6 with no-conflict + N/A determinism.
- [ ] No `boardgame.io` import: `Select-String -Path "apps\server\src\auth\hanko" -Pattern "from .['""]boardgame\.io" -Recurse` returns no output.
- [ ] No engine / registry / preplan import: `Select-String -Path "apps\server\src\auth\hanko" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse` returns no output.
- [ ] No `throw` in production logic files: `Select-String -Path "apps\server\src\auth\hanko\hankoVerifier.logic.ts","apps\server\src\auth\hanko\jwksCache.logic.ts" -Pattern "^\s*throw "` returns matches **only** at factory-time validation sites (`createHankoSessionVerifier(config)` arg validation per D-12602); the `verify()` closure and the JWKS `getKey` path NEVER throw. Manual review confirms.
- [ ] WP-112 / WP-052 / WP-099 contract files unchanged: `git diff apps/server/src/auth/sessionToken.types.ts apps/server/src/auth/sessionToken.logic.ts apps/server/src/auth/sessionToken.logic.test.ts apps/server/src/auth/accountLookup.logic.ts apps/server/src/auth/accountLookup.logic.test.ts apps/server/src/identity/ data/migrations/004_create_players_table.sql data/migrations/005_create_replay_ownership_table.sql docs/ai/work-packets/WP-099-auth-provider-selection.md docs/ai/work-packets/WP-112-session-token-validation-middleware.md docs/ai/work-packets/WP-052-player-identity-replay-ownership.md .claude/` returns no output.
- [ ] No real Hanko tenant ID in `.env.example`: `Select-String -Path ".env.example" -Pattern "HANKO_"` shows only placeholder values (e.g., `https://passkeys.hanko.io/YOUR_TENANT_ID`, `legendary-arena`, `300000`).
- [ ] Catalog row landed: `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "createHankoSessionVerifier"` returns exactly one match.
- [ ] D-11201 flipped to `Resolved`: `Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^## D-11201" -Context 0,8` shows the status flipped from `Active` to `Resolved`.
- [ ] **Per-instance state:** the `hankoVerifier.logic.test.ts` "two factory calls produce independent caches" case passes.
- [ ] **One-shot retry:** the `hankoVerifier.logic.test.ts` "kid not in initial cache, refresh succeeds" case passes; the "kid not in cache, refresh also fails" case returns `Result.fail({ code: 'verification_failed' })`.

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-130:` (code under `apps/server/src/auth/hanko/` is staged → SPEC: prefix forbidden per `01.3` Rule 5).
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6` per `01.3` Vision Trailer convention.
- [ ] **D-11804 catalog update obligation lands in same commit:** `docs/ai/REFERENCE/api-endpoints.md` carries one new `Library-only` row for `createHankoSessionVerifier`. Closed-set taxonomy compliance per D-11804.
- [ ] No `--no-verify`, no `--no-gpg-sign` per `01.3` "Bypassing Hooks".

## §7 — Post-Execution Checks

- [ ] All WP-126 §Acceptance Criteria pass.
- [ ] D-12601 / D-12602 / D-12603 / D-12604 written into `DECISIONS.md` with executor's locked choices + rationale + rejected alternatives. Each entry's status is `Active`.
- [ ] D-11201 status flipped `Active` → `Resolved` in `DECISIONS.md` (per its body's "Status flips to `Resolved` once WP-126 lands").
- [ ] `STATUS.md` `### WP-126 / EC-130 Executed` block at top of `## Current State` cites the new `auth/hanko/` directory + the F-1..F-7 disposition + the catalog-row insertion + the env-var declarations + the four locked D-decisions.
- [ ] `WORK_INDEX.md` WP-126 row checked off with date + commit hash; deferred-placeholder text replaced with completion summary mirroring WP-104 / WP-112 row format.
- [ ] `EC_INDEX.md` EC-130 row flipped `Draft` → `Done {YYYY-MM-DD}`.

## Common Failure Smells

- `@teamhanko/*` import lands outside `apps/server/src/auth/hanko/` (e.g., a test helper imports it from `apps/server/src/auth/`) → F-2 violated; move the import inside the `hanko/` directory or refactor the test helper to inject a fake.
- The literal string `'hanko'` appears as an `auth_provider` value in any code path, fixture, or test → F-1 violated; the broker is invisible at rest. The federated-IdP mapping must produce one of `'email' | 'google' | 'discord'`.
- `HANKO_IDP_TO_AUTH_PROVIDER` lookup uses a string-prefix check or regex → closed-set lookup violated per D-12604. Rewrite as an object-literal lookup or `switch`.
- The verifier's `verify()` closure throws on a malformed token → result-type contract violated. Wrap the JWT decode/verify call in a try/catch and return `Result.fail({ code: 'invalid_token', reason: <full sentence> })`.
- A second call to `createHankoSessionVerifier(config)` shares the JWKS cache with the first → per-instance state lock violated. Rewrite the cache as a closure-local variable, never a module-level singleton.
- `getKey(kid)` triggers more than one refresh per call (e.g., a cache-miss loop) → one-shot retry violated. The retry is a single attempt; further misses return `Result.fail({ code: 'refresh_failed' })`.
- A failed refresh wipes the cache → graceful-degradation lock violated. The refresh failure leaves the existing cache in place.
- A real Hanko tenant ID appears in `.env.example` → secret hygiene violated. Replace with `https://passkeys.hanko.io/YOUR_TENANT_ID` placeholder.
- A top-level `jsonwebtoken` or `jose` add lands in `apps/server/package.json` → F-5 violated. Under D-12601's built-ins-only default this should never happen; under the optional `@teamhanko/*` SDK path, JWT-handling libraries arrive only as Hanko transitives.
- `D-12604` is locked at draft time using a guessed claim key (e.g., `identity_provider`) without observing an actual Hanko token or citing Hanko docs → "never guess" rule violated. Capture a representative token (or cite Hanko's published claim shape) before locking the lookup-table keys.
- An `.env.example` placeholder uses the old `https://YOUR_TENANT_ID.hanko.io` shape → wrong endpoint convention; Hanko Cloud's documented JWKS URL is `/{tenant_id}/.well-known/jwks.json`, so `tenantBaseUrl` includes the tenant segment (e.g., `https://passkeys.hanko.io/YOUR_TENANT_ID`).
- `apps/server/src/auth/sessionToken.types.ts` is modified to add a Hanko-specific field → WP-112 contract file lock violated. The verifier's claim shape conforms to the existing `VerifiedSessionClaim` interface; no extension is permitted.
- `requireAuthenticatedSession` is wired into a route handler in `apps/server/src/server.mjs` → out of scope. Production wiring is a future request-handler WP's responsibility.
- The new catalog row's `Status` column carries `Wired` → wrong taxonomy class; WP-126 ships the verifier as a library function, not an HTTP route. Use `Library-only`.
