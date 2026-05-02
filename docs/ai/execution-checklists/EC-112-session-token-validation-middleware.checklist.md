# EC-112 — Session Token Validation Middleware (Execution Checklist)

**Source:** docs/ai/work-packets/WP-112-session-token-validation-middleware.md
**Layer:** Server (`apps/server/src/auth/**`) + Reference (`docs/ai/REFERENCE/api-endpoints.md` per D-11804)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-112.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-112.

---

## §0 — Pre-Flight

- [ ] WP-099 §A / §B / §C present at `docs/ai/work-packets/WP-099-auth-provider-selection.md`. F-1..F-7 gate items enumerated in WP-112 §"WP-099 Future-Auth Gate (F-1..F-7) Disposition".
- [ ] WP-052 contract files present and unchanged: `apps/server/src/identity/identity.types.ts` exports `AccountId`, `PlayerAccount`, `AuthProvider`, `AUTH_PROVIDERS`, `Result<T>`, `IdentityErrorCode`, `DatabaseClient`. Verified by `Select-String -Path apps\server\src\identity\identity.types.ts -Pattern "export (type|interface|const) (AccountId|PlayerAccount|AuthProvider|AUTH_PROVIDERS|Result|IdentityErrorCode|DatabaseClient)"`.
- [ ] `apps/server/src/auth/` directory does NOT yet exist; `apps/server/src/auth/hanko/` does NOT yet exist (the latter is WP-126's scope).
- [ ] D-9901..D-9905 present in `docs/ai/DECISIONS.md`. D-10002 / D-11804 / D-5201 present.
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries the closed-set Status / Auth taxonomies (per D-11801..D-11804) and the existing `Library-only` section.
- [ ] `pnpm -r build` exits 0 on `main` HEAD; `pnpm --filter @legendary-arena/server test` exits 0.
- [ ] Three executor decisions locked in writing before coding: D-11202 (token extraction source), D-11203 (`findAccountByAuthProviderSub` signature), D-11204 (unconfigured-default behavior). Recommended defaults documented in WP-112 §Decision Points; executor may override with rationale.

## §1 — Scope Lock + File Allowlist

Exactly six production / reference files may change. Plus four governance ledgers in the same commit (per WP-115 / WP-122 / WP-125 precedent).

- `apps/server/src/auth/sessionToken.types.ts` — **new**
- `apps/server/src/auth/sessionToken.logic.ts` — **new**
- `apps/server/src/auth/sessionToken.logic.test.ts` — **new**
- `apps/server/src/auth/accountLookup.logic.ts` — **new**
- `apps/server/src/auth/accountLookup.logic.test.ts` — **new**
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** (add 2 `Library-only` rows)
- Plus governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

`git diff --name-only` lists exactly 10 files at session close.

## §2 — Verification Gates (run all; every item binary)

- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0; `pnpm --filter @legendary-arena/game-engine test` exits 0 (engine baseline unchanged).
- [ ] **F-1:** `Select-String -Path "apps\server\src\auth" -Pattern "'hanko'|""hanko""" -Recurse` returns no output.
- [ ] **F-2:** `Select-String -Path "apps\server\src\identity","packages","apps\registry-viewer","apps\arena-client","apps\server\src\auth" -Pattern "@teamhanko|hanko\.io" -Recurse` returns no output.
- [ ] **F-3:** No `node:crypto.randomUUID()` call appears in WP-112 files (`Select-String -Path "apps\server\src\auth" -Pattern "randomUUID" -Recurse` returns no output).
- [ ] **F-4:** `git diff apps/server/src/server.mjs apps/server/src/leaderboards/ apps/server/src/profile/` returns no changes (no existing guest route is gated).
- [ ] **F-5:** `git diff apps/server/package.json` returns no output (zero new deps).
- [ ] **F-6:** Replacement-safety thought experiment: removing Hanko (when WP-126 lands) requires zero change to any WP-112 file. Confirmed by F-2 + the `SessionVerifier`-interface design.
- [ ] **F-7:** WP-112 `## Vision Alignment` block cites §3, §11, §14, §15, NG-1, NG-3, NG-6 with no-conflict assertion + N/A determinism.
- [ ] No `boardgame.io` import in any scope file: `Select-String -Path "apps\server\src\auth" -Pattern "from .['\"]boardgame\.io" -Recurse` returns no output.
- [ ] No engine / registry / preplan import: `Select-String -Path "apps\server\src\auth" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse` returns no output.
- [ ] No SQL writes in scope: `Select-String -Path "apps\server\src\auth" -Pattern "INSERT |UPDATE |DELETE |CREATE |DROP |ALTER " -Recurse` returns no output.
- [ ] Exactly one SELECT against `legendary.players` in scope: `Select-String -Path "apps\server\src\auth" -Pattern "FROM legendary\.players" -Recurse` returns exactly one match (in `accountLookup.logic.ts`).
- [ ] No `throw` statement in production logic files: `Select-String -Path "apps\server\src\auth\sessionToken.logic.ts","apps\server\src\auth\accountLookup.logic.ts" -Pattern "^\s*throw "` returns no output. Every failure path returns `Result.fail`.
- [ ] **Clock-skew posture:** orchestrator-side expiry uses inclusive `expiresAt <= now()` comparison (not `<`); no skew tolerance applied at this layer (skew is the verifier's responsibility per WP-112 §Locked contract values). Manual review of the expiry-check site in `sessionToken.logic.ts` confirms the comparison is `<=` and that no `+ skewMs` / `- skewMs` arithmetic appears.
- [ ] **Error-code mapping ownership:** the `SessionVerificationErrorCode` → `SessionValidationErrorCode` mapping is centralized in `sessionToken.logic.ts` (one switch / lookup-table site). `accountLookup.logic.ts` and the test files do not re-implement the mapping. Verifier-side codes never appear in any `Result.fail({ code: ... })` returned to a caller of `requireAuthenticatedSession`.
- [ ] **Translation-site lock:** the `authProviderSub` → `authProviderId` rename appears at exactly one site — the SQL parameter-binding inside `findAccountByAuthProviderSub`. `Select-String -Path "apps\server\src\auth" -Pattern "authProviderSub" -Recurse` returns matches only in `sessionToken.types.ts` (interface definition) and `sessionToken.logic.test.ts` / `accountLookup.logic.ts` / `accountLookup.logic.test.ts` (consuming sites); the *translation* (the literal substring `auth_provider_id` paired with `authProviderSub` in the same statement) appears only inside `accountLookup.logic.ts`.
- [ ] WP-052 / WP-099 contract files unchanged: `git diff apps/server/src/identity/ data/migrations/004_create_players_table.sql data/migrations/005_create_replay_ownership_table.sql docs/ai/work-packets/WP-099-auth-provider-selection.md docs/ai/work-packets/WP-052-player-identity-replay-ownership.md .claude/` returns no output.

## §3 — Commit Hygiene

- [ ] Commit prefix: `EC-112:` (code under `apps/server/src/` is staged → SPEC: prefix forbidden per `01.3` Rule 5).
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6` per `01.3` Vision Trailer convention.
- [ ] **D-11804 catalog update obligation lands in same commit:** `docs/ai/REFERENCE/api-endpoints.md` carries two new `Library-only` rows for `requireAuthenticatedSession` and `findAccountByAuthProviderSub`. Each row's `Status` is exactly `Library-only`; `Auth` is exactly `(n/a — caller-injected dependencies)`; `Authorizing WP` is `WP-112`. Field names match `00.2-data-requirements.md` verbatim. Per D-11804 replace-whole-row merge semantics — N/A for insertions, but the closed-set taxonomy compliance still applies.
- [ ] No `--no-verify`, no `--no-gpg-sign` per `01.3` "Bypassing Hooks".

## §4 — Post-Execution Checks

- [ ] All WP-112 §Acceptance Criteria pass.
- [ ] D-11201 written verbatim into `DECISIONS.md` from WP-112 §Decision Points.
- [ ] D-11202 / D-11203 / D-11204 written into `DECISIONS.md` with executor's locked choices (or recommended defaults) + rationale + rejected alternatives.
- [ ] `STATUS.md` `### WP-112 / EC-112 Executed` block at top of `## Current State` cites the new `auth/` directory + the F-1..F-7 disposition + the catalog-row insertion.
- [ ] `WORK_INDEX.md` WP-112 row checked off with date + commit hash; WP-126 deferred-placeholder row preserved unchanged (still `[ ]`).
- [ ] `EC_INDEX.md` EC-112 row flipped `Draft` → `Done {YYYY-MM-DD}`.

## Common Failure Smells

- `requireAuthenticatedSession` throws on missing token instead of returning `Result.fail` → WP-052 D-5201 result-type contract violated. Fix: rewrite to return `Result.fail({ code: 'missing_token', reason: <full sentence> })`.
- Test calls `requireAuthenticatedSession(req)` with no second argument and expects the `'session_verifier_not_configured'` path → type error; per WP-112 §Scope (In) §A, `RequireAuthenticatedSessionOptions` is a required argument. The unconfigured-default fires when `options.verifier` is missing or `undefined`, never when `options` itself is omitted.
- Verifier-side `SessionVerificationErrorCode` value (e.g., `'invalid_signature'`) leaks into a caller's `Result.fail` → error-code ownership violated. The orchestrator owns the mapping to `SessionValidationErrorCode`; verifier codes are an internal contract.
- `expiresAt` check uses `<` instead of `<=` → boundary-inclusive lock from WP-112 §Locked contract values violated. Fix: use `<=` so a token whose `expiresAt` matches the current ISO timestamp is treated as expired.
- Skew tolerance (`+ 30_000` ms or similar) appears in the orchestrator's expiry check → WP-112 lock violated. Skew is the verifier's responsibility; the orchestrator stays deterministic.
- `authProviderSub` → `authProviderId` rename appears in `sessionToken.logic.ts` (e.g., the orchestrator destructures `claim.authProviderSub` and reassigns to `authProviderId`) → translation-site lock violated. The rename happens only inside `findAccountByAuthProviderSub` at the SQL boundary.
- `findAccountByAuthProviderSub` returns `Result.fail({ code: 'unknown_account' })` on no match → blurs "DB error" with "no row matched". Fix: return `Result.ok(null)` on clean no-match per WP-101 `findAccountByHandle` precedent.
- Test file imports `@teamhanko/*` to construct a real verifier → F-2 violated; tests must inject a fake `SessionVerifier`.
- New file `apps/server/src/identity/sessionLookup.logic.ts` (in identity/, not auth/) → blurs the broker-agnostic boundary with the identity layer; D-9904 sibling-not-child layout violated. Move to `apps/server/src/auth/accountLookup.logic.ts`.
- `apps/server/src/auth/hanko/` directory created → out of scope; that's WP-126.
- Catalog row's `Auth` column carries `guest` → wrong taxonomy class; library-only rows use `(n/a — caller-injected dependencies)` per the WP-101 / WP-103 precedent in the same section.
- `'hanko'` literal appears in any WP-112 file → F-1 violated; the broker's name is invisible to WP-112 by construction.
