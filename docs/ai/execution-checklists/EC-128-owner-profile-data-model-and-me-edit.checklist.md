# EC-128 — Owner Profile Data Model & `/me` Edit (Execution Checklist)

**Source:** docs/ai/work-packets/WP-104-owner-profile-data-model-and-me-edit.md
**Layer:** Server (`apps/server/src/profile/ownerProfile.*`) + Schema (`data/migrations/009`) + Arena Client (`apps/arena-client/src/{pages,lib/api}/`, `App.vue`) + Reference (`docs/ai/REFERENCE/api-endpoints.md` per D-11804)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-104.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-104.

---

## §0 — Pre-Flight

- [ ] WP-102 contract files present and unchanged: `apps/server/src/profile/{profile.types.ts, profile.logic.ts, profile.routes.ts, profile.logic.test.ts}`, `apps/arena-client/src/pages/PlayerProfilePage.vue`, `apps/arena-client/src/lib/api/profileApi.ts`. Verified by `git diff` returning no output.
- [ ] WP-112 contract files present and unchanged: `apps/server/src/auth/{sessionToken.types.ts, sessionToken.logic.ts, accountLookup.logic.ts}` and the two test files.
- [ ] WP-052 contract files present and unchanged: `apps/server/src/identity/{identity.types.ts, identity.logic.ts}`, migrations `004`, `005`.
- [ ] WP-115 contract files present: `apps/server/src/db/database.ts` exports `createPool` / `closePool`; `apps/server/src/server.mjs` constructs the pool and passes it to `register*Routes(...)` registration helpers.
- [ ] `apps/server/src/profile/ownerProfile.*` files do NOT yet exist.
- [ ] `data/migrations/009_*.sql` does NOT yet exist (slot is free).
- [ ] D-10401 + D-10402 present in WP-104 §Decision Points (locked at draft).
- [ ] `pnpm -r build` exits 0 on `main` HEAD; `pnpm --filter @legendary-arena/server test` exits 0 (post-WP-112 baseline `pass 73 / fail 0 / skipped 36`).
- [ ] Six executor decisions locked in writing before coding: D-DEC-1 (privacy-toggle granularity), D-DEC-2 (`player_links.provider` validation), D-DEC-3 (URL validation posture), D-DEC-4 (PATCH semantics), D-DEC-5 (PUT links semantics), D-DEC-6 (route-wiring posture). Recommended defaults documented in WP-104 §Decision Points; executor may override with rationale.

## §1 — Scope Lock + File Allowlist

Exactly 10 production / reference files may change. Plus 4 governance ledgers in the same commit (per WP-115 / WP-122 / WP-125 / EC-112 precedent).

- `data/migrations/009_create_player_profiles_and_links.sql` — **new**
- `apps/server/src/profile/ownerProfile.types.ts` — **new**
- `apps/server/src/profile/ownerProfile.logic.ts` — **new**
- `apps/server/src/profile/ownerProfile.logic.test.ts` — **new**
- `apps/server/src/profile/ownerProfile.routes.ts` — **new**
- `apps/server/src/server.mjs` — **modified** (per D-DEC-6 = (a) default; if (b), unmodified — staged set drops to 9 production / reference)
- `apps/arena-client/src/lib/api/ownerProfileApi.ts` — **new**
- `apps/arena-client/src/pages/MyProfilePage.vue` — **new**
- `apps/arena-client/src/App.vue` — **modified**
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** (3 new rows)
- Plus governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

`git diff --name-only` lists exactly 14 files at session close (or 13 if D-DEC-6 = (b)).

## §2 — Verification Gates (run all; every item binary)

- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0; `pnpm --filter @legendary-arena/game-engine test` exits 0 (engine baseline unchanged).
- [ ] **F-1:** `Select-String -Path "apps\server\src\profile\ownerProfile.types.ts","apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.logic.test.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "'hanko'|""hanko""" -Recurse` returns no output.
- [ ] **F-2:** `Select-String -Path "apps\server\src\profile" -Pattern "@teamhanko|hanko\.io" -Recurse` returns no output.
- [ ] **F-5:** `git diff apps/server/package.json apps/arena-client/package.json` returns no output (zero new deps).
- [ ] **No `boardgame.io` import** in any WP-104 file: `Select-String -Path "apps\server\src\profile\ownerProfile.types.ts","apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "from .['\"]boardgame\.io" -Recurse` returns no output.
- [ ] **No engine / registry / preplan import** in any WP-104 file: `Select-String -Path "apps\server\src\profile\ownerProfile.types.ts","apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse` returns no output.
- [ ] **No SQL writes against locked tables.** `Select-String -Path "apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "INSERT INTO legendary\.players|UPDATE legendary\.players|DELETE FROM legendary\.players|INSERT INTO legendary\.replay|UPDATE legendary\.replay|DELETE FROM legendary\.replay|INSERT INTO legendary\.competitive|UPDATE legendary\.competitive|DELETE FROM legendary\.competitive" -Recurse` returns no output. (Writes against `legendary.player_profiles` and `legendary.player_links` are expected and permitted — these are WP-104's new tables.)
- [ ] **No `throw` statement** in production logic files: `Select-String -Path "apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "^\s*throw "` returns no output. Every failure path returns a typed `Result.fail` or sets the Koa response.
- [ ] **`requireAuthenticatedSession` invoked first.** Manual review of every handler in `ownerProfile.routes.ts` confirms `requireAuthenticatedSession(req, options)` is the first business-logic step before any DB query.
- [ ] **Cache-Control: no-store** appears as the first statement of every handler body in `ownerProfile.routes.ts` (mirrors WP-115 D-11504 lock).
- [ ] **Multi-statement writes use a single transaction.** Manual review of `upsertOwnerProfile` and `replaceOwnerLinks` confirms `BEGIN` / `COMMIT` envelopes (or equivalent `pool.connect()` + transactional `client.query` pattern).
- [ ] **Privacy default is most-private.** Manual review of `data/migrations/009_*.sql` confirms every privacy-toggle column's `DEFAULT` is the most-private value (per D-DEC-1's locked option).
- [ ] **`OwnerProfileView` excludes private fields.** Drift test in `ownerProfile.logic.test.ts` asserts `Object.keys(view).sort()` matches the locked field list and contains no `email` / `authProvider` / `authProviderId` / `createdAt`.
- [ ] **Foreign keys cascade.** Manual review of migration `009` confirms both new tables FK `legendary.players(player_id) ON DELETE CASCADE`.
- [ ] WP-102 / WP-052 / WP-112 / WP-115 contract files unchanged: `git diff apps/server/src/profile/profile.{types,logic,routes}.ts apps/server/src/profile/profile.logic.test.ts apps/arena-client/src/pages/PlayerProfilePage.vue apps/arena-client/src/lib/api/profileApi.ts apps/server/src/identity/ apps/server/src/auth/ apps/server/src/db/ data/migrations/00{4,5,6,7,8}_*.sql .claude/` returns no output.

## §3 — Commit Hygiene

- [ ] Commit prefix: `EC-128:` (code under `apps/server/src/`, `apps/arena-client/src/`, and `data/migrations/` is staged → SPEC: prefix forbidden per `01.3` Rule 5).
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6` per `01.3` Vision Trailer convention.
- [ ] **D-11804 catalog update obligation lands in same commit:** `docs/ai/REFERENCE/api-endpoints.md` carries three new rows for the `/api/me/*` endpoints. Each row's `Status` is exactly the resolved D-DEC-6 value; `Auth` is exactly `authenticated-session-required`; `Authorizing WP` is `WP-104`. Field names match `00.2-data-requirements.md` verbatim.
- [ ] No `--no-verify`, no `--no-gpg-sign` per `01.3` "Bypassing Hooks".

## §4 — Post-Execution Checks

- [ ] All WP-104 §Acceptance Criteria pass.
- [ ] D-10401 + D-10402 written verbatim into `DECISIONS.md` from WP-104 §Decision Points.
- [ ] D-10403 / D-10404 / D-10405 / D-10406 / D-10407 / D-10408 written into `DECISIONS.md` with executor's locked choices (or recommended defaults) + rationale + rejected alternatives.
- [ ] `STATUS.md` `### WP-104 / EC-128 Executed` block at top of `## Current State` cites the new `apps/server/src/profile/ownerProfile.*` files + the three new endpoints + the migration + the catalog rows + each D-104NN locked option.
- [ ] `WORK_INDEX.md` WP-104 row checked off with date + commit hash; the `(deferred placeholder)` prefix is removed; the row is fully populated like the recent WP-115 / WP-125 rows.
- [ ] `EC_INDEX.md` EC-128 row flipped `Draft` → `Done {YYYY-MM-DD}`.

## Common Failure Smells

- `requireAuthenticatedSession` invoked AFTER a DB query in a handler → security violation; auth gate must be the first step. Fix: reorder so the orchestrator is invoked before any `database.query`.
- Verifier-side error code (`'invalid_token'`) leaked verbatim to a client without going through the WP-112 `SessionValidationErrorCode` mapping → WP-112 §Scope (In) §B error-code-ownership violated. The orchestrator already does the mapping; the route handler just dispatches on the closed-union `code`.
- Privacy column `DEFAULT 'public'` on `legendary.player_profiles` → fail-open default; Vision §3 violated. Fix: change to `'private'` (or whichever most-private value D-DEC-1 locks).
- Avatar URL CHECK constraint permits `http://` → defense-in-depth bypassed. Fix: tighten to `^https://` per D-DEC-3 default.
- `OwnerProfileView` exposes `email` or `authProvider` from `legendary.players` → DTO hygiene violation; private-field leak. Fix: drift test catches this.
- `replaceOwnerLinks` issues separate DELETE + INSERT without a transaction → partial-state visible to a concurrent reader. Fix: wrap both statements in `BEGIN` / `COMMIT`.
- PATCH `/api/me/profile` rewrites `legendary.players.email` → out of scope; only `legendary.player_profiles` + `legendary.player_links` are writable.
- Test cleanup uses `DELETE FROM legendary.player_profiles` in `beforeEach` → trips the §2 SQL-write gate the same way EC-112 surfaced; use per-suite-run unique `player_id` values instead.
- `'hanko'` literal appears in any WP-104 file → F-1 violated; the broker's name is invisible to WP-104 by construction (per D-9904).
- `apps/server/src/profile/profile.routes.ts` modified to add the three new handlers → WP-102 contract file violation. Fix: create new sibling `ownerProfile.routes.ts` instead.
- Catalog row's `Auth` column carries `guest` or `handle-required` → wrong taxonomy class for an authenticated-write surface. Use `authenticated-session-required` per D-9905.
- Server test baseline regresses from 73 → fewer-than-73 → some pre-existing test broke. Fix: investigate before claiming completion.
