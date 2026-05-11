# WP-150 — Leaderboard Theme + Global Aggregation Endpoints

**Status:** Ready (with open decisions to lock at execution-time)
**Primary Layer:** Server (`apps/server/**`)
**Dependencies:** WP-054 (leaderboard library + per-scenario endpoints), WP-115 (HTTP route registration + long-lived `pg.Pool`), WP-055 (theme schema)

---

## Session Context

WP-054 (`f53af27` cherry-pick into main) shipped the public-leaderboard
**library** surface — three exported logic functions — and WP-115
(`35572df`, 2026-04-30) wired three HTTP routes consuming them. The
shipped HTTP surface is **scenario-keyed only**:

- `GET /api/leaderboards/scenarios` — list of `scenarioKey` values
- `GET /api/leaderboards/scenarios/:scenarioKey` — paginated per-scenario
- `GET /api/leaderboards/scores/:replayHash` — single permalink lookup

The marketing-site public-leaderboard page (WP-149) needs two
additional aggregations the existing surface does not support:

1. **Theme-grouped leaderboard** — every score in the scenarios that
   belong to a given theme (per WP-055 `ThemeDefinition.themeId` and
   the curated `setupIntent` projection), ranked by `final_score ASC`.
2. **Global Top-N PAR** — the lowest `final_score` entries across all
   PAR-published scenarios, ranked by `final_score ASC`.

WP-150 ships those endpoints behind the same library + thin-Koa-adapter
shape WP-054 / WP-115 established, with the same dep-injection seams,
the same `Cache-Control: no-store` discipline, the same locked error
envelopes, and the same `LeaderboardLogic` test-injection pattern.

---

## Goal

After this packet, two new public, anonymous, read-only HTTP endpoints
exist on `apps/server` under `/api/leaderboards/themes/:themeId` and
`/api/leaderboards/top`. WP-149's marketing-site Hugo bundle can call
both endpoints (CORS pre-cleared by WP-148) to render the
theme-grouped and global Top-N PAR views the public-leaderboard page
requires. The implementation extends the existing
`apps/server/src/leaderboards/**` library — same dep-injection seams,
same locked-envelope discipline, same `node:test` test surface, no
schema changes, no engine touch, no registry-package import (theme →
scenarioKey resolution is performed in `server.mjs` and injected as a
caller-bound dep).

---

## Assumes

- WP-054 is on `main` (`f53af27` or successor) — `leaderboard.logic.ts`
  exports `getScenarioLeaderboard`, `getPublicScoreByReplayHash`,
  `listScenarioKeys`; `leaderboard.types.ts` exports
  `LeaderboardDependencies`, `LeaderboardQueryOptions`,
  `PublicLeaderboardEntry`, `ScenarioLeaderboard`.
- WP-115 is on `main` (`35572df` or successor) — `registerLeaderboardRoutes`
  is wired in `apps/server/src/server.mjs:270` against the long-lived
  `pg.Pool` and the bound `parGate.checkParPublished`.
- WP-055 is on `main` — `packages/registry/src/theme.schema.ts` exports
  `ThemeDefinitionSchema` and the inferred `ThemeDefinition` type with
  `themeId` (kebab-case) and `setupIntent` (mastermindId + schemeId +
  villainGroupIds + henchmanGroupIds + heroDeckIds).
- `pnpm install --frozen-lockfile && pnpm -r build` exits 0.
- `pnpm --filter @legendary-arena/server test` passes the WP-146 / EC-149
  baseline `250 / 184 / 66 / 0`.
- The relationship between `ThemeDefinition.setupIntent` and the
  `scenarioKey` strings used by `legendary.competitive_scores.scenario_key`
  is **operator-defined**, not auto-derivable from current contracts.
  The executor MUST lock that mapping at session start (see
  `## Open Decisions`).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — server
  is wiring + transport; leaderboard logic lives in
  `apps/server/src/leaderboards/**` and may not import the
  registry package.
- `apps/server/src/leaderboards/leaderboard.logic.ts` — the WP-054
  pattern for SELECT queries against `legendary.competitive_scores`
  with PAR-gate filtering, INNER JOIN to `legendary.players` +
  `legendary.replay_ownership`, and the `mapRowToEntry` projection
  helper. WP-150 reuses this pattern verbatim.
- `apps/server/src/leaderboards/leaderboard.types.ts` — the WP-054
  type contract with `PublicLeaderboardEntry` (9 fields, locked under
  D-5201) and `LeaderboardDependencies` (the dep-injection seam).
- `apps/server/src/leaderboards/leaderboard.routes.ts` — the WP-115
  thin-Koa-adapter pattern: locked `Cache-Control: no-store` first
  statement, locked error envelopes (`{ error: 'invalid_query', message }`
  / `{ error: 'internal_error' }` / `{ error: 'score_not_found' }`),
  pagination parsing helpers, optional `LeaderboardLogic` injection
  for tests.
- `apps/server/src/leaderboards/leaderboard.routes.test.ts` and
  `leaderboard.logic.test.ts` — the WP-115 v1.1 test patterns:
  fake `LeaderboardLogic` for transport-contract isolation; SQL-shape
  tests against the real WP-054 helpers gated on `TEST_DATABASE_URL`.
- `packages/registry/src/theme.schema.ts` — `ThemeDefinitionSchema`,
  `ThemeSetupIntentSchema`. **WP-150 must not import this directly.**
  The themeId → scenarioKey[] mapping is built in `server.mjs` from the
  startup-loaded registry and injected as a dep.
- `docs/ai/REFERENCE/api-endpoints.md` — the catalog WP-150 must
  update per §21 (two new rows: themes + top).
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 6 (`// why:`), Rule 7
  (literal arrays), Rule 14 (no abbreviations), no `.reduce()` for
  multi-step zone / projection logic.
- `docs/ai/DECISIONS.md` D-5201 (sensitive-field exclusion from
  `PublicLeaderboardEntry`), D-5301 / D-5302 / D-5306 (server is
  enforcer / projector, not calculator; competitive records
  write-once; PAR-gate Option A), D-9905 (auth taxonomy).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Full file contents required for every modified file; no diffs, no
  snippets.
- ESM only, Node v22+. TypeScript files compiled per existing
  server tsconfig.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- No randomness; no `Date.now()` / wall-clock reads inside logic.
- No persistence touch — `G` and `ctx` not involved (server wiring +
  read-only SQL).

**Packet-specific:**
- The leaderboard module's existing layer-boundary contract is
  **preserved**: `apps/server/src/leaderboards/**` continues to import
  nothing from `boardgame.io`, `@legendary-arena/game-engine`,
  `@legendary-arena/registry`, `@legendary-arena/preplan`,
  `@legendary-arena/vue-sfc-loader`, or any UI / arena-client /
  replay-producer / wiki-viewer / registry-viewer package. The
  themeId → scenarioKey[] mapping is constructed in `server.mjs` from
  the startup-loaded registry and passed to the logic functions via
  the `LeaderboardDependencies` extension (a new field
  `getScenarioKeysForTheme(themeId): readonly string[] | null`).
- The two new endpoints reuse the existing `Cache-Control: no-store`
  first-statement discipline (per WP-115 v1.1 Patch 8).
- The two new endpoints reuse the existing locked error envelopes;
  no new envelope shapes invented. Status codes ∈ `{200, 400, 404, 500}`
  (no 5xx beyond 500; no 4xx beyond 400 / 404).
- Auth posture for both new endpoints: **`guest`** per the existing
  `/api/leaderboards/*` family (D-9905). No handle-required, no
  authenticated-session-required.
- Sensitive fields (the seven exclusions from `PublicLeaderboardEntry`
  per D-5201) remain stripped at the WP-054 type boundary. The new
  endpoints reuse `PublicLeaderboardEntry` verbatim and may not
  re-introduce any of the seven excluded fields.
- No change to engine packages, registry package, preplan package,
  vue-sfc-loader, arena-client, registry-viewer, replay-producer,
  wiki-viewer, render.yaml, root tsconfig, root package.json,
  pnpm-lock.yaml.
- No new runtime npm dependencies.
- Pagination: same `limit` (default 25, range 1..100) and `offset`
  (default 0, range 0..10000) bounds as the WP-115 per-scenario route.
  No new pagination semantics.
- The two new endpoint handlers must mirror the WP-115 transport-tier
  test pattern: a fake `LeaderboardLogic` injected via the optional
  4th parameter for transport-contract tests; SQL-shape tests gated
  on `TEST_DATABASE_URL`.

**Session protocol:**
- If the themeId → scenarioKey[] mapping is unclear, the executor
  must STOP and surface the question rather than guess. The mapping
  has no contract today — see `## Open Decisions` for the lock the
  executor must perform and document at session start.

**Locked contract values:**
- New endpoint paths (verbatim, no trailing slash):
  - `GET /api/leaderboards/themes/:themeId`
  - `GET /api/leaderboards/top`
- Theme leaderboard response shape (mirrors `ScenarioLeaderboard`):
  ```
  ThemeLeaderboard {
    themeId: string,
    entries: readonly PublicLeaderboardEntry[],
    totalEligibleEntries: number
  }
  ```
- Global Top-N response shape:
  ```
  GlobalTopLeaderboard {
    entries: readonly PublicLeaderboardEntry[],
    totalEligibleEntries: number
  }
  ```
- Both responses reuse the existing `PublicLeaderboardEntry` shape
  (9 fields). Each entry's `scenarioKey` field is the disambiguator
  the UI uses to group / filter.
- Sort order: both endpoints sort by `final_score ASC, created_at ASC`
  (deterministic; ties broken by earliest submission) — same comparator
  as `getScenarioLeaderboard`.
- Locked invalid-themeId response: `404 { error: 'theme_not_found' }`
  (new envelope value `'theme_not_found'` — first new envelope
  introduced; cited in §21 catalog row).
- Locked PAR-filter discipline: both endpoints filter to
  PAR-published scenarios only (call `deps.checkParPublished` per
  scenario as part of the eligibility filter; scenarios without
  published PAR contribute zero rows). Mirrors D-5306 Option A
  fail-closed posture.

---

## Debuggability & Diagnostics

```pwsh
# Theme leaderboard — every score in the scenarios that belong to themeId X
curl -s "https://api.legendary-arena.com/api/leaderboards/themes/dark-reign?limit=10&offset=0" | jq .
# Expected: 200 { themeId, entries: PublicLeaderboardEntry[], totalEligibleEntries }

# Global Top-N — best scores across all PAR-published scenarios
curl -s "https://api.legendary-arena.com/api/leaderboards/top?limit=25" | jq .
# Expected: 200 { entries: PublicLeaderboardEntry[], totalEligibleEntries }

# Unknown theme
curl -s -o /dev/null -w "%{http_code}\n" "https://api.legendary-arena.com/api/leaderboards/themes/no-such-theme"
# Expected: 404
```

---

## Scope (In)

### A) Logic — `apps/server/src/leaderboards/leaderboard.logic.ts`

- **Modified:** add `getThemeLeaderboard(options, database, deps)` and
  `getGlobalTopLeaderboard(options, database, deps)` exports. Both use
  the SAME WP-054 row mapper, the SAME PAR gate, the SAME visibility
  filter (`ro.visibility IN ('link', 'public')`), the SAME comparator
  (`final_score ASC, created_at ASC`).
- `getThemeLeaderboard`:
  1. Resolve themeId → scenarioKey[] via `deps.getScenarioKeysForTheme`.
     If `null`, return `null` (route surface translates to 404).
  2. Filter the resolved scenarioKey[] to PAR-published only by
     calling `deps.checkParPublished(scenarioKey)` per key (the same
     fail-closed gate WP-054 already uses per-scenario).
  3. Issue paginated SELECT against `legendary.competitive_scores` with
     `cs.scenario_key = ANY($1)` filtered by visibility + PAR.
  4. Issue parallel COUNT(*) with the same WHERE.
  5. Return a fresh `ThemeLeaderboard` literal.
- `getGlobalTopLeaderboard`:
  1. Issue paginated SELECT against `legendary.competitive_scores`
     with the visibility filter + PAR-eligibility filter (the
     PAR-eligibility list is built from `listScenarioKeys` filtered by
     `deps.checkParPublished`, then passed as `cs.scenario_key = ANY($1)`).
  2. Issue parallel COUNT(*) with the same WHERE.
  3. Return a fresh `GlobalTopLeaderboard` literal.

### B) Types — `apps/server/src/leaderboards/leaderboard.types.ts`

- **Modified:** add `ThemeLeaderboard`, `GlobalTopLeaderboard`,
  `ThemeLeaderboardQueryOptions`, `GlobalTopLeaderboardQueryOptions`
  exports. Extend `LeaderboardDependencies` with one new optional
  field:
  ```ts
  readonly getScenarioKeysForTheme?: (themeId: string) => readonly string[] | null;
  ```
  Optional + default `() => null` in `PRODUCTION_DEPENDENCIES` so
  the existing per-scenario routes stay unaffected; the new theme
  route surfaces 404 when production wiring omits the dep.

### C) Routes — `apps/server/src/leaderboards/leaderboard.routes.ts`

- **Modified:** extend `LeaderboardLogic` with two new methods
  (`getThemeLeaderboard`, `getGlobalTopLeaderboard`); register two
  new routes inside `registerLeaderboardRoutes`. Both reuse the
  pagination parser, both reuse the locked envelopes, both set
  `Cache-Control: no-store` as the first statement.

### D) Server wiring — `apps/server/src/server.mjs`

- **Modified:** at startup, build the themeId → scenarioKey[] mapping
  from the loaded registry's themes and the operator-locked
  scenarioKey-derivation rule (see `## Open Decisions`); pass the
  bound `getScenarioKeysForTheme` function into the third-arg `parGate`
  bundle's sibling extension OR (cleaner) a new fourth-arg `themeGate`
  parameter to `registerLeaderboardRoutes`. The executor selects the
  injection shape at session start and documents the choice as
  `D-150NN`.

### E) Tests

- **Modified** `leaderboard.logic.test.ts`: add SQL-shape tests for
  both new logic functions (gated on `TEST_DATABASE_URL`); add
  fail-closed tests confirming missing `getScenarioKeysForTheme` →
  empty / null result; add PAR-gate fail-closed tests confirming
  scenarios without published PAR contribute zero rows.
- **Modified** `leaderboard.routes.test.ts`: add transport-tier tests
  for both new routes using fake `LeaderboardLogic`; cover 200 / 400
  (invalid pagination) / 404 (unknown theme) / 500 (logic throw)
  paths.
- Test count delta projected: `+10 to +18` tests / `+2` suites
  (new `describe()` per route); existing baseline preserved.

### F) API catalog — `docs/ai/REFERENCE/api-endpoints.md`

- **Modified:** add two rows for the new endpoints per §21
  replace-whole-row semantics; status `Wired`; auth `guest`;
  authorizing WP `WP-150`; canonical field names match
  `PublicLeaderboardEntry`.

---

## Out of Scope

- **Future-tense scheme-mastermind view.** WP-149 reserves a
  `?view=scheme-mastermind` URL contract but ships no implementation;
  WP-150 likewise does not introduce a scheme-mastermind aggregation
  endpoint. A separate later WP would land it.
- **No change to the existing three WP-054 / WP-115 endpoints**
  (`/api/leaderboards/scenarios`, `/api/leaderboards/scenarios/:scenarioKey`,
  `/api/leaderboards/scores/:replayHash`) beyond the
  `LeaderboardDependencies` extension. Their request / response
  shapes, status codes, error envelopes, auth posture remain
  byte-identical.
- **No change to `legendary.competitive_scores` schema or any other
  `legendary.*` table.** WP-150 only adds SELECT queries.
- **No engine, registry, or preplan package change.** The
  themeId → scenarioKey[] mapping is built in `server.mjs` from
  startup-loaded registry data; the leaderboard module itself never
  imports the registry package.
- **No new runtime npm dependencies.** All work uses existing
  packages (`pg`, `boardgame.io` for the router type, Node v22 ESM).
- **No CORS allowlist edit.** WP-148 owns that.
- **No marketing-site Hugo bundle change.** WP-149 owns that.

---

## Files Expected to Change

- `apps/server/src/leaderboards/leaderboard.logic.ts` — **modified** —
  two new exported functions, internal helper for ANY-filtered SQL
- `apps/server/src/leaderboards/leaderboard.types.ts` — **modified** —
  two new response shapes, two new query-options shapes,
  `LeaderboardDependencies` extension
- `apps/server/src/leaderboards/leaderboard.routes.ts` — **modified** —
  two new route registrations, `LeaderboardLogic` extension
- `apps/server/src/leaderboards/leaderboard.logic.test.ts` —
  **modified** — new SQL-shape tests
- `apps/server/src/leaderboards/leaderboard.routes.test.ts` —
  **modified** — new transport-tier tests
- `apps/server/src/server.mjs` — **modified** — startup-time themeId
  → scenarioKey[] mapping construction; bound `getScenarioKeysForTheme`
  injection into `registerLeaderboardRoutes`
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — two new rows
  per §21
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — flip WP-150
  row to done with EC reference at execution
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip
  EC-152 row Draft → Done at execution
- `docs/ai/DECISIONS.md` — **modified** — `D-150NN` entries land at
  execution (themeId-mapping injection shape; envelope addition for
  `'theme_not_found'`; PAR-eligibility derivation for global top)

No other files may be modified.

---

## Open Decisions (must lock at execution start, document inline)

1. **themeId → scenarioKey[] mapping rule.** The executor must consult
   the registry's existing scenario-key conventions (`G.scenarioKey`
   construction at match-creation time, the `scenario_key` column's
   actual write sites) and lock the rule that maps a `ThemeDefinition`
   (specifically its `setupIntent.schemeId` + `setupIntent.mastermindId`
   + `setupIntent.villainGroupIds`) to one or more `scenarioKey`
   strings. If no canonical convention exists, the executor STOPS
   and asks the operator to define it. This decision lands as
   `D-150NN`.
2. **Injection shape for the new dep.** Two options: (a) extend
   `LeaderboardDependencies` with `getScenarioKeysForTheme?` and pass
   it through the existing `parGate` argument's bundle (single deps
   bundle); (b) add a fourth `themeGate` parameter to
   `registerLeaderboardRoutes`. Executor picks one at session start
   based on call-site readability; documents under `D-150NN`.
3. **PAR-eligibility derivation for global Top-N.** The simple
   approach is `listScenarioKeys` → filter via `checkParPublished` →
   `cs.scenario_key = ANY($1)`. Alternatives (LATERAL join,
   pre-materialized view) are out of scope unless the SELECT runtime
   measurably regresses test execution time. Locked under `D-150NN`.

---

## Acceptance Criteria

### A) Endpoints wired
- [ ] `GET /api/leaderboards/themes/:themeId` returns 200 with
      `{ themeId, entries[], totalEligibleEntries }` for a known themeId
      whose scenarios have publicly visible PAR-published scores.
- [ ] `GET /api/leaderboards/themes/:themeId` returns 404
      `{ error: 'theme_not_found' }` for an unknown themeId.
- [ ] `GET /api/leaderboards/themes/:themeId` returns 200 with empty
      `entries[]` and `totalEligibleEntries: 0` for a known themeId
      whose scenarios have no PAR-published scores.
- [ ] `GET /api/leaderboards/themes/:themeId?limit=…&offset=…` honors
      the same `limit` / `offset` bounds and 400 envelope as the
      WP-115 per-scenario route.
- [ ] `GET /api/leaderboards/top` returns 200 with
      `{ entries[], totalEligibleEntries }` ranked by
      `final_score ASC, created_at ASC` across all PAR-published
      scenarios, paginated by `limit` / `offset`.
- [ ] Both endpoints set `Cache-Control: no-store` on every response,
      including 4xx / 5xx.
- [ ] Both endpoints return `{ error: 'internal_error' }` 500 on
      thrown exceptions; the caught value is discarded (per WP-115
      precedent).
- [ ] Both endpoints surface only `PublicLeaderboardEntry` shapes
      (9 locked fields per D-5201); no sensitive fields re-introduced.

### B) Layer boundary preserved
- [ ] `apps/server/src/leaderboards/**` imports nothing from
      `@legendary-arena/registry`, `@legendary-arena/game-engine`,
      `@legendary-arena/preplan`, `@legendary-arena/vue-sfc-loader`,
      `boardgame.io`, or any `apps/*` UI / replay package.
- [ ] The themeId → scenarioKey[] mapping is constructed in
      `server.mjs` (which already loads the registry at startup);
      the bound function is injected into `registerLeaderboardRoutes`.

### C) Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with the
      new baseline (existing baseline `250 / 184 / 66 / 0` extended
      by the new test counts; exact post-WP-150 baseline locked at
      execution start in the EC).
- [ ] All new tests use `node:test` and `node:assert`; SQL-shape
      tests gated on `TEST_DATABASE_URL`.

### D) API catalog
- [ ] `docs/ai/REFERENCE/api-endpoints.md` contains two new rows
      (themes + top) with `Status: Wired`, `Auth: guest`,
      `Authorizing WP: WP-150`, canonical field names matching
      `PublicLeaderboardEntry` exactly.

### E) Scope enforcement
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] `pnpm-lock.yaml` byte-identical to HEAD.
- [ ] `git diff --stat packages/ apps/arena-client/ apps/registry-viewer/
      apps/replay-producer/ apps/wiki-viewer/ data/ render.yaml` empty.

---

## Verification Steps

```pwsh
# Step 1 — full monorepo build
pnpm install --frozen-lockfile
pnpm -r build

# Step 2 — server tests
pnpm --filter @legendary-arena/server test
# Expected: exit 0; baseline locked in EC at execution start

# Step 3 — layer-boundary grep (no registry import in leaderboards/**)
Select-String -Path "apps\server\src\leaderboards\*.ts" -Pattern "@legendary-arena/(registry|game-engine|preplan|vue-sfc-loader)"
# Expected: zero matches

# Step 4 — boardgame.io grep (no boardgame.io import in leaderboards/**)
Select-String -Path "apps\server\src\leaderboards\*.ts" -Pattern "from ['""]boardgame\.io"
# Expected: zero matches

# Step 5 — sensitive-field absence (D-5201 enforcement)
Select-String -Path "apps\server\src\leaderboards\*.ts" -Pattern "accountId|submissionId|email|authProvider|stateHash|scoreBreakdown"
# Expected: zero matches outside `// why:` comments that paraphrase the
# exclusion (per §18; comments must paraphrase, not enumerate verbatim)

# Step 6 — endpoint smoke (post-deploy, manual)
curl -s -H "Origin: https://legendary-arena.com" "https://api.legendary-arena.com/api/leaderboards/themes/<known-themeId>?limit=10" | jq .
curl -s -H "Origin: https://legendary-arena.com" "https://api.legendary-arena.com/api/leaderboards/top?limit=25" | jq .

# Step 7 — exact-set scope enforcement
$expected = @(
  'apps/server/src/leaderboards/leaderboard.logic.ts',
  'apps/server/src/leaderboards/leaderboard.types.ts',
  'apps/server/src/leaderboards/leaderboard.routes.ts',
  'apps/server/src/leaderboards/leaderboard.logic.test.ts',
  'apps/server/src/leaderboards/leaderboard.routes.test.ts',
  'apps/server/src/server.mjs',
  'docs/ai/REFERENCE/api-endpoints.md',
  'docs/ai/work-packets/WORK_INDEX.md',
  'docs/ai/execution-checklists/EC_INDEX.md',
  'docs/ai/DECISIONS.md'
) | Sort-Object
$actual = (git status --porcelain | ForEach-Object { ($_ -replace '^...', '').Trim() }) | Sort-Object
Compare-Object $expected $actual
# Expected: no output
```

---

## Vision Alignment

WP-150 introduces aggregation read paths over already-published
competitive scores. It is firmly in §22 / §24 (scoring + leaderboards
+ replay) territory.

- **Vision clauses touched:** §3, §22, §24.
- **Conflict assertion:** No conflict: WP-150 reads existing scores
  via SELECT-only queries; never re-derives `final_score`, never
  mutates `legendary.competitive_scores`. PAR gate authority is
  preserved (D-5306 Option A fail-closed).
- **Non-Goal proximity check:** none of NG-1..NG-7 are crossed. No
  paid surface, no monetization, no persuasive ranking copy
  (response shapes are pure data; presentation lives in WP-149's
  Hugo bundle).
- **Determinism preservation:** PAR gate, visibility filter, and
  comparator (`final_score ASC, created_at ASC`) are byte-identical
  to WP-054's per-scenario surface. The two new endpoints inherit
  the deterministic ordering by reuse, not by re-derivation.
  No new randomness, no new `Date.now()`, no new wall-clock reads
  in the logic surface.

---

## Funding Surface Gate

**N/A** — WP-150 is a server-layer SELECT-query addition. No global
navigation funding affordances; no registry-viewer funding
affordances; no profile / account funding attribution surfaces; no
tournament-funding-channel integration; no user-visible copy is
added (the response shapes are pure JSON, never rendered text).
WP-149 (marketing-site page) is the surface where any future
funding-copy question would be evaluated; WP-150 is purely
transport.

---

## Lint Gate Self-Review

Per `00.3-prompt-lint-checklist.md`:

- §1 Structure: PASS — all 10 required sections present and
  non-empty (Goal / Assumes / Context / Scope (In) / Out of
  Scope / Files Expected to Change / Non-Negotiable Constraints /
  Acceptance Criteria / Verification Steps / Definition of Done).
- §2 Constraints: PASS — engine-wide block (full file contents,
  ESM, code-style citation, persistence N/A); packet-specific
  block (layer boundary, envelope reuse, status-code closed set,
  auth posture, sensitive-field exclusion, byte-identical
  preservation of unchanged endpoints, no new deps, pagination
  reuse); session protocol (stop-and-ask on unclear themeId
  mapping); locked contract values (verbatim paths + response
  shapes + sort order + PAR discipline + new envelope).
- §3 Assumes: PASS — WP-054, WP-115, WP-055 dependencies cited;
  current array contents enumerated; baseline test counts cited;
  themeId-to-scenarioKey ambiguity flagged explicitly.
- §4 Context: PASS — ARCHITECTURE.md Layer Boundary cited;
  leaderboard.logic.ts / .types.ts / .routes.ts / two .test.ts
  files cited; theme.schema.ts cited (read-only reference, never
  imported by WP-150 code); api-endpoints.md cited; code-style
  rules cited; D-5201 / D-5301 / D-5302 / D-5306 / D-9905 cited.
- §5 Files: PASS — every file enumerated with new/modified marker
  and one-line description; no ambiguous "update this section"
  language.
- §6 Naming: PASS — `themeId` (kebab-case, per WP-055 schema),
  `scenarioKey`, `final_score`, `created_at`, `replayHash`,
  `playerDisplayName` all match canonical field names; no
  abbreviations introduced.
- §7 Dependencies: PASS — no new npm deps; explicit forbidden-
  package mention not required (no auth / DB / WebSocket additions).
- §8 Boundaries: PASS — leaderboards/** layer-boundary preserved
  (no registry / engine / preplan / vue-sfc-loader / boardgame.io
  imports); explicit grep gates in Verification Steps 3+4.
- §9 Windows: PASS — Verification Steps use `pwsh` and `\` separators.
- §10 Env vars: PASS — `TEST_DATABASE_URL` referenced (gates SQL-shape
  tests, mirrors existing pattern); no new env vars introduced.
- §11 Auth: PASS — explicit `guest` posture (D-9905); no JWT, no
  Hanko verifier, no `requireAuthenticatedSession`. WP-150 endpoints
  inherit the existing `/api/leaderboards/*` family's
  authentication-free posture.
- §12 Tests: PASS — `node:test` + `node:assert`; transport-tier
  tests use fake `LeaderboardLogic` injection (no real DB);
  SQL-shape tests gated on `TEST_DATABASE_URL`; no boardgame.io
  imports in test files.
- §13 Commands: PASS — `pnpm` / `pwsh` commands exact; expected
  output cited inline.
- §14 Acceptance Criteria: PASS — 17 binary, observable items
  spanning routes, layer boundary, tests, catalog, scope.
- §15 Definition of Done: PASS — STATUS.md / DECISIONS.md (with
  three D-150NN entries) / WORK_INDEX.md / scope-boundary check
  all included below.
- §16 Code style: PASS — no `.reduce()` over multi-step branching
  prescribed; explicit `for...of` over rows / scenarios; no
  abbreviation in new names; required `// why:` for any catch-block
  swallow (the existing WP-115 pattern of `void caughtError;` carries
  forward).
- §17 Vision Alignment: PASS — §3 / §22 / §24 cited with no-conflict
  + determinism-preservation line above.
- §18 Prose-vs-grep: PASS — Step 5 sensitive-field grep is
  literal-string-scoped; the §18 discipline (paraphrase, never
  enumerate verbatim) is itself enumerated in this WP's Step 5
  comment. The leaderboards/** files themselves must paraphrase
  the seven exclusions (per the existing WP-054 module-header
  precedent at `leaderboard.types.ts:64-72`); the executor must
  preserve that discipline in any new `// why:` comments added by
  WP-150.
- §19 Bridge-vs-HEAD: N/A — this is the WP itself.
- §20 Funding Surface Gate: N/A — section above explains why none of
  the §20.1 trigger surfaces are touched (no UI surface; transport
  only).
- §21 API Catalog: PASS — two new catalog rows mandated in
  `## Scope (In) §F` and `## Acceptance Criteria §D`;
  replace-whole-row semantics; closed-set Status / Auth values;
  canonical field names; `Authorizing WP: WP-150`. The new envelope
  value `'theme_not_found'` is documented in the catalog row's
  response shape.

---

## Definition of Done

This packet is complete when ALL of the following are true.

### Local Validation (this session)
- [ ] All acceptance criteria above pass.
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with the
      new baseline (locked in EC at session start; existing
      `250 / 184 / 66 / 0` extended by the new test counts).
- [ ] Step 3 + Step 4 grep gates return zero matches.
- [ ] Step 5 sensitive-field grep returns zero matches outside
      paraphrased `// why:` comments.
- [ ] Step 7 `Compare-Object` returns no output.
- [ ] `pnpm-lock.yaml` byte-identical to HEAD.

### Deployment Validation (post-merge, post-redeploy)
- [ ] After commit + push to `main`, Render auto-redeploys
      `legendary-arena-server` and the latest successful Render
      deploy reflects this packet's commit hash.
- [ ] Step 6 endpoint smoke from `legendary-arena.com` Origin
      returns 200 + JSON for both new endpoints.

### Documentation & Governance Updates
- [ ] `docs/ai/STATUS.md` updated — capability: leaderboard surface
      now exposes theme-grouped + global Top-N PAR aggregations
      consumable by WP-149's marketing-site bundle.
- [ ] `docs/ai/DECISIONS.md` updated with `D-150NN` entries (lock
      themeId-mapping rule, dep-injection shape, new envelope value,
      PAR-eligibility derivation for global top).
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated with two new rows
      per §21 replace-whole-row semantics.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-150 checked off
      with today's date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-152 row flipped
      `Draft` → `Done`.
- [ ] No files outside `## Files Expected to Change` were modified.
