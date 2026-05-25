# WP-177 — Autoplay Rewind Requester Audience

**Status:** Ready
**Primary Layer:** Server
**Dependencies:** WP-163, WP-164, WP-165

---

## Session Context

WP-163 shipped the six autoplay playback controls with D-16303 locking
rewind `uiState` to `{ kind: 'spectator' }` audience; WP-164 shipped the
client bar consuming those controls; EC-183 fixed the post-gameover blank
board but deliberately left D-16303 intact. This packet scopes D-16303 so
the rewind audience matches the requester's identity when available.

---

## Goal

After this session, a viewer who launched an autoplay match and rewinds
(step-back, restart, or step-forward cursor branch) sees the historical
board **plus their own hand** — the same information the live broadcast
showed them. A genuine spectator (no identity supplied) still sees the
spectator-redacted view. The hidden-information guarantee D-16303
codified is preserved; only the audience derivation changes from
"always spectator" to "requester's audience when identity is available,
spectator otherwise."

---

## Assumes

- WP-163 complete. Specifically:
  - `apps/server/src/autoplay/autoplay.mjs` exports `registerAutoplayRoutes`
    with six POST playback endpoints and the `rewindUIState` helper (WP-163)
  - `apps/server/src/autoplay/playbackController.mjs` exports
    `createPlaybackController` (WP-163)
- WP-164 complete. Specifically:
  - `apps/arena-client/src/lib/api/autoplayPlayback.ts` calls the six
    playback POST endpoints with bodyless `fetch` (WP-164)
- WP-165 complete. Specifically:
  - `GET /api/match/autoplay/:matchId/status` exists and stays `Auth: guest`
    with no `uiState` (D-16501)
- `packages/game-engine/src/ui/uiState.filter.ts` exports
  `filterUIStateForAudience(uiState, audience)` accepting
  `{ kind: 'player', playerId: string }` and `{ kind: 'spectator' }` (WP-128)
- boardgame.io `Auth` class (v0.50.2) exposes
  `auth.authenticateCredentials({ playerID, credentials, metadata })` and
  `db.fetch(matchId, { metadata: true })` returns match metadata with
  per-player credentials
- `pnpm -r build` exits 0
- Server test baseline: 453 pass, 1 pre-existing fail (`join-match.test.ts`),
  66 skipped

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirm server
  layer may import from `game-engine` (Runtime-Safe Engine Surface only) and
  wires components without deciding outcomes
- `docs/ai/DECISIONS.md` — read D-16303 (rewind is REST-only and
  audience-filtered) and D-16304 (envelope carries `mode`); this WP amends
  D-16303 via D-17701
- `apps/server/src/autoplay/autoplay.mjs` — read entirely; the three rewind
  call sites at lines 311, 326, 338 call `rewindUIState(snapshot)` which
  hardcodes `{ kind: 'spectator' }`; this is the function being
  parameterized
- `packages/game-engine/src/ui/uiState.filter.ts` lines 302–330 — confirm
  `filterUIStateForAudience` handles both `{ kind: 'player', playerId }` and
  `{ kind: 'spectator' }` audiences
- `node_modules/.pnpm/boardgame.io@0.50.2/node_modules/boardgame.io/src/server/auth.ts`
  — confirm `Auth.authenticateCredentials({ playerID, credentials, metadata })`
  signature and behavior (returns boolean)
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error
  messages)
- `docs/ai/REFERENCE/api-endpoints.md` — the six autoplay POST rows and the
  GET status row; three rows will be updated (step-back, restart,
  step-forward) per §21

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
- `rewindUIState` signature changes from `(snapshot)` to
  `(snapshot, audience)` with `audience` defaulting to
  `{ kind: 'spectator' }` — back-compat for any caller that omits identity
- The three rewind call sites (step-forward cursor, step-back, restart)
  derive the requester audience from headers; the other three endpoints
  (pause, resume, go-to-end) are untouched — they return no `uiState`
- `playbackController.mjs` is NOT modified — the controller has no
  audience concern; audience is resolved at the route layer
- The status endpoint (`GET /api/match/autoplay/:matchId/status`) is
  NOT modified — it returns metadata only, no `uiState` (D-16501)
- The live broadcast path (`transport.pubSub.publish('MATCH-…')`) is
  NOT modified — D-16303's REST-only rewind stance is preserved
- No new npm dependencies
- No engine changes — `filterUIStateForAudience` already supports player
  audiences; the engine is consumed as-is

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the
  human before proceeding — never guess or invent field names, type shapes,
  or file paths

**Locked contract values:**
- Header names: `X-Player-ID`, `X-Credentials`
- Default audience (no headers or invalid headers):
  `{ kind: 'spectator' }` (back-compat, safe-by-default)
- Player audience (valid headers):
  `{ kind: 'player', playerId: <validated playerID> }`

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection.

- Behavior is reproducible given: identical match state, identical snapshot
  history, identical request headers
- The audience derivation is observable via the response `uiState` content:
  a player audience includes hand cards; a spectator audience hides them
- No invisible side effects: the only change is the `audience` parameter
  passed to `filterUIStateForAudience`
- Failures are localizable: invalid credentials → spectator fallback
  (identical to current behavior); missing headers → spectator fallback

---

## Scope (In)

### A) Audience derivation helper

- **`apps/server/src/autoplay/autoplay.mjs`** — modified:
  - New helper `resolveRequesterAudience(koaContext, db, auth, matchId)`:
    - Reads `X-Player-ID` and `X-Credentials` headers from `koaContext`
    - If either header is missing or empty, returns `{ kind: 'spectator' }`
    - Fetches match metadata via `db.fetch(matchId, { metadata: true })`
    - Validates credentials via `auth.authenticateCredentials({ playerID, credentials, metadata })`
    - If valid, returns `{ kind: 'player', playerId: playerID }`
    - If invalid (auth rejects), returns `{ kind: 'spectator' }`
    - If metadata fetch fails or metadata is null, returns `{ kind: 'spectator' }`
    - Add `// why: D-17701` comment on the spectator fallback
    - JSDoc documenting the function, parameters, and return type

### B) Parameterize `rewindUIState`

- **`apps/server/src/autoplay/autoplay.mjs`** — modified:
  - Change signature: `rewindUIState(snapshot, audience)` where `audience`
    defaults to `{ kind: 'spectator' }`
  - Update the `filterUIStateForAudience` call to use the `audience`
    parameter instead of the hardcoded `{ kind: 'spectator' }`
  - Update the JSDoc `// why:` comment to cite D-17701 (scopes D-16303)

### C) Thread audience through rewind call sites

- **`apps/server/src/autoplay/autoplay.mjs`** — modified:
  - The three rewind endpoints (step-forward cursor branch at ~line 311,
    step-back at ~line 326, restart at ~line 338) call
    `resolveRequesterAudience(koaContext, db, auth, matchId)` and pass
    the result to `rewindUIState(snapshot, audience)`
  - `db` and `auth` must be threaded from the outer
    `registerAutoplayRoutes` closure into the endpoint callbacks (they
    are already in scope via the destructured `context` parameter)
  - Add `// why: D-17701` on the `resolveRequesterAudience` call at each
    site

### D) Tests

Add tests in `apps/server/src/autoplay/autoplay.test.ts` (or a new
`rewindAudience.test.ts` if the existing file is large):
- `resolveRequesterAudience` returns `{ kind: 'spectator' }` when no
  headers are present
- `resolveRequesterAudience` returns `{ kind: 'spectator' }` when
  `X-Player-ID` is present but `X-Credentials` is missing
- `resolveRequesterAudience` returns `{ kind: 'spectator' }` when
  credentials fail validation
- `resolveRequesterAudience` returns `{ kind: 'player', playerId: '0' }`
  when credentials are valid
- `rewindUIState` with spectator audience hides hand cards
- `rewindUIState` with player audience includes hand cards for that player
- Does not import from `boardgame.io` or `boardgame.io/testing`
- Uses `node:test` and `node:assert` only

### E) API catalog update

- **`docs/ai/REFERENCE/api-endpoints.md`** — modified:
  - Update three rows (step-back, restart, step-forward) per §21 +
    D-11804 replace-whole-row semantics:
    - Request column: add `Optional headers: X-Player-ID, X-Credentials
      (when present and valid, rewind uiState is filtered for the
      player's audience instead of spectator)`
    - Response column: clarify `uiState` is `audience-filtered (player
      when identity headers are valid; spectator otherwise)`
    - Auth column stays `guest` (headers are optional; absence = spectator)

---

## Out of Scope

- No engine changes — `filterUIStateForAudience` already handles player
  audiences; no modification needed in `packages/game-engine/`
- No client changes — the paired client WP (future) will send
  `X-Player-ID` / `X-Credentials` headers from `autoplayPlayback.ts`;
  until then, the client continues to send bodyless POSTs and the server
  falls back to spectator audience (back-compat)
- No status endpoint changes — `GET /api/match/autoplay/:matchId/status`
  stays `Auth: guest` and metadata-only (D-16501)
- No live broadcast changes — the `transport.pubSub.publish('MATCH-…')`
  path is untouched (D-16303 REST-only stance preserved)
- No pause / resume / go-to-end changes — those three endpoints return
  no `uiState` and need no audience derivation
- No D-16303 retirement — D-16303 is **scoped** by D-17701, not retired
- Refactors, cleanups, or "while I'm here" improvements are **out of scope**

---

## Files Expected to Change

- `apps/server/src/autoplay/autoplay.mjs` — **modified** — add
  `resolveRequesterAudience` helper, parameterize `rewindUIState`,
  thread audience through three rewind call sites
- `apps/server/src/autoplay/rewindAudience.test.ts` — **new** —
  `node:test` coverage for audience derivation and rewind filtering
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — update three
  autoplay endpoint rows (step-back, restart, step-forward)
- `docs/ai/DECISIONS.md` — **modified** — land D-17701; update D-16303
  status to "Active (scoped by D-17701)"
- `docs/ai/STATUS.md` — **modified** — record what changed
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-177

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Audience derivation
- [ ] `resolveRequesterAudience` exists in `autoplay.mjs` with JSDoc
- [ ] Returns `{ kind: 'spectator' }` when no `X-Player-ID` header present
- [ ] Returns `{ kind: 'spectator' }` when no `X-Credentials` header present
- [ ] Returns `{ kind: 'spectator' }` when `auth.authenticateCredentials`
      returns false
- [ ] Returns `{ kind: 'player', playerId }` when credentials are valid
- [ ] Returns `{ kind: 'spectator' }` when metadata fetch returns null

### Rewind filtering
- [ ] `rewindUIState(snapshot, audience)` accepts an `audience` parameter
- [ ] Default audience is `{ kind: 'spectator' }` (back-compat)
- [ ] All three rewind call sites pass the resolved audience

### Contract preservation
- [ ] pause / resume / go-to-end endpoints are byte-identical pre/post
- [ ] Status endpoint is byte-identical pre/post
- [ ] `playbackController.mjs` is byte-identical pre/post
- [ ] No import from `boardgame.io` added to the test file

### Tests
- [ ] `pnpm -r build` exits 0
- [ ] Server tests pass with baseline +N new tests (0 new failures)
- [ ] All audience derivation edge cases covered (6+ tests)

### Scope enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run server tests
pnpm --filter legendary-arena-server test
# Expected: TAP output — baseline +N new, 0 new failures

# Step 3 — confirm no Math.random
Select-String -Path "apps\server\src\autoplay\autoplay.mjs" -Pattern "Math\.random"
# Expected: no output

# Step 4 — confirm pause/resume/go-to-end unchanged
# (visual diff — these three endpoint blocks should show zero modifications)
git diff apps/server/src/autoplay/autoplay.mjs | Select-String -Pattern "pause|resume|go-to-end"
# Expected: no lines containing these endpoint names in the diff hunks

# Step 5 — confirm playbackController unchanged
git diff apps/server/src/autoplay/playbackController.mjs
# Expected: no output (file not modified)

# Step 6 — confirm status endpoint unchanged
Select-String -Path "apps\server\src\autoplay\autoplay.mjs" -Pattern "handleAutoplayStatusRequest"
# Expected: function still exists, no modifications to its body

# Step 7 — confirm no files outside scope
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] Server tests pass (baseline +N new, 0 new failures)
- [ ] `playbackController.mjs` byte-identical (confirmed with `git diff`)
- [ ] Status endpoint byte-identical (confirmed with `git diff`)
- [ ] pause / resume / go-to-end endpoint blocks byte-identical
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — rewind now filtered by requester audience
- [ ] `docs/ai/DECISIONS.md` updated — D-17701 landed; D-16303 scoped
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-177 checked off with today's date

---

## Vision Alignment

**§17 trigger check:** This WP touches none of the §17.1 trigger surfaces.
It does not touch scoring, replays, player identity/accounts (it reads
existing boardgame.io credentials — it does not create or store identity),
multiplayer sync, determinism, card data, monetization, live ops,
accessibility, or Registry Viewer surfaces.

**N/A** — server-only autoplay rewind audience derivation; no §17.1
trigger surface touched.

---

## Lint Gate Self-Review

| § | Verdict | Note |
|---|---------|------|
| 1 | PASS | All required sections present |
| 2 | PASS | Engine-wide + packet-specific + session protocol + locked values |
| 3 | PASS | All deps listed with specific exports |
| 4 | PASS | ARCHITECTURE.md, DECISIONS.md, source files, 00.6 all cited |
| 5 | PASS | 6 files listed; all marked new or modified |
| 6 | PASS | No naming deviations from 00.2 |
| 7 | PASS | No new npm deps |
| 8 | PASS | Server layer only; no boundary violation |
| 9 | PASS | All commands use `pwsh` / `pnpm` |
| 10 | N/A | No new env vars |
| 11 | N/A | Does not touch application-layer auth; uses boardgame.io's existing credential validation at the autoplay-route layer only |
| 12 | PASS | Tests use `node:test` + `node:assert` only |
| 13 | PASS | All verification commands exact with expected output |
| 14 | PASS | 15 binary acceptance criteria |
| 15 | PASS | DoD includes STATUS, DECISIONS, WORK_INDEX |
| 16.1 | PASS | No premature abstraction — `resolveRequesterAudience` is used at 3 call sites |
| 16.2 | PASS | No nested ternaries or complex reduce |
| 16.3 | PASS | No abbreviations in locked names |
| 16.4 | PASS | Helper is ~15 lines; rewindUIState is ~10 lines |
| 16.5 | PASS | `// why:` comments required at D-17701 sites |
| 16.6 | PASS | No `import *` or barrel re-exports |
| 16.7 | PASS | Error messages are full sentences |
| 17 | N/A | No §17.1 trigger surface touched (server-only autoplay rewind audience derivation; no scoring, replays, player identity/accounts, multiplayer sync, determinism, card data, monetization, live ops, accessibility, or Registry Viewer surfaces) |
| 18 | N/A | No literal-string-scoped grep verification steps that could collide with prose |
| 19 | N/A | No repo-state-summarizing artifact authored |
| 20 | N/A | No §20.1 trigger surface touched (server-only autoplay rewind; no UI surfaces, no user-visible copy, no funding channels referenced) |
| 21 | PASS | Three autoplay endpoint rows updated per D-11804 replace-whole-row semantics |
