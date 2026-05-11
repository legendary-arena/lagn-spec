# EC-152 — Leaderboard Theme + Global Aggregation Endpoints (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-150-leaderboard-theme-and-global-aggregation-endpoints.md`
**Layer:** `apps/server/**` only. Extends the WP-054 leaderboard library
+ WP-115 thin-Koa-adapter pattern. No engine, registry, preplan, or UI
package touch.

## Before Starting

- [ ] WP-054 on `main`; `leaderboard.logic.ts` exports
      `getScenarioLeaderboard`, `getPublicScoreByReplayHash`,
      `listScenarioKeys`
- [ ] WP-115 on `main`; `registerLeaderboardRoutes` wired in
      `server.mjs` against the long-lived `pg.Pool` + `parGate`
- [ ] WP-055 on `main`; `ThemeDefinitionSchema` exports `themeId` +
      `setupIntent` shape
- [ ] `pnpm install --frozen-lockfile && pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` passes the existing
      baseline (`250 / 184 / 66 / 0` post-WP-148, or new baseline at
      execution start)
- [ ] **Open Decision lock (session-start):** the themeId →
      scenarioKey[] mapping rule, the dep-injection shape, and the
      PAR-eligibility derivation for global Top-N are locked in EC
      amendment before any code edit. Three new `D-150NN` entries
      are pre-drafted in DECISIONS.md at session start.

## Locked Values (do not re-derive)

- **New endpoint paths** (verbatim, no trailing slash):
  - `GET /api/leaderboards/themes/:themeId`
  - `GET /api/leaderboards/top`
- **Theme leaderboard response shape:**
  `{ themeId, entries: PublicLeaderboardEntry[], totalEligibleEntries }`
- **Global Top-N response shape:**
  `{ entries: PublicLeaderboardEntry[], totalEligibleEntries }`
- **Entry shape:** `PublicLeaderboardEntry` from `leaderboard.types.ts`
  reused verbatim (9 fields per D-5201). No sensitive-field
  re-introduction.
- **Sort order:** `final_score ASC, created_at ASC` (ties broken by
  earliest submission) — byte-identical comparator to WP-054's
  `getScenarioLeaderboard`.
- **Pagination bounds:** `limit` default 25, range 1..100; `offset`
  default 0, range 0..10000 — byte-identical to WP-115.
- **Error envelopes:** reuse WP-115's `{ error: 'invalid_query',
  message }` (400) and `{ error: 'internal_error' }` (500). Add one
  new envelope value `{ error: 'theme_not_found' }` (404).
- **Auth posture:** `guest` (D-9905) for both new endpoints.
- **Cache-Control:** `no-store` first statement in every handler
  (WP-115 v1.1 Patch 8 precedent).
- **PAR-filter discipline:** both endpoints filter to PAR-published
  scenarios only via `deps.checkParPublished` (D-5306 Option A
  fail-closed).

## Guardrails

- **Layer boundary preserved.** `apps/server/src/leaderboards/**`
  imports nothing from `@legendary-arena/registry`,
  `@legendary-arena/game-engine`, `@legendary-arena/preplan`,
  `@legendary-arena/vue-sfc-loader`, `boardgame.io`, or any UI
  package. WP-150 §Verification Steps 3 + 4 enforce.
- **No `.reduce()`** in logic functions; use `for...of` over rows /
  scenarios.
- **Sensitive-field exclusion** (the seven D-5201 fields) preserved;
  `// why:` comments paraphrase the exclusion list, never enumerate
  verbatim (§18 precedent at `leaderboard.types.ts:64-72`).
- **No new runtime npm deps.**
- **No schema change** to `legendary.competitive_scores` or any
  `legendary.*` table.
- **No change to the three existing WP-054 / WP-115 endpoints**
  beyond the `LeaderboardDependencies` extension.
- **No `Date.now()` / wall-clock / randomness** in logic functions.
- **API catalog update mandatory** per §21 replace-whole-row
  semantics; two new rows in same commit as code change.

## Required `// why:` Comments

- New entries in `leaderboard.logic.ts`: each new exported function
  carries a `// why:` block explaining (a) why the PAR gate is
  consulted before SQL (fail-closed per D-5306), (b) why the
  comparator is byte-identical to `getScenarioLeaderboard`
  (deterministic ordering shared across the family), (c) why entry
  rows are fresh literals never aliased (aliasing-defense per the
  WP-054 mapRowToEntry pattern).
- New entry in `leaderboard.types.ts`: the `getScenarioKeysForTheme?`
  field carries a `// why:` block explaining the optional + default
  `() => null` posture (theme route 404s when production wiring
  omits the dep — same fail-closed posture as the
  `checkParPublished` default).
- New entries in `leaderboard.routes.ts`: each new route handler
  carries the WP-115-precedent `void caughtError;` `// why:`
  comment paraphrasing why the caught value is discarded; the
  `Cache-Control` first-statement `// why:` carries forward
  verbatim from the existing handlers.
- `server.mjs` themeId-mapping construction: a `// why:` block
  explaining the startup-time build, the `D-150NN` injection-shape
  lock, and why the leaderboard logic module never imports the
  registry directly (layer-boundary preservation).

## Files to Produce

**Modified:**
- `apps/server/src/leaderboards/leaderboard.logic.ts` — two new
  exported functions
- `apps/server/src/leaderboards/leaderboard.types.ts` — two new
  response shapes, two new query-options shapes, deps extension
- `apps/server/src/leaderboards/leaderboard.routes.ts` — two new
  route registrations, `LeaderboardLogic` extension
- `apps/server/src/leaderboards/leaderboard.logic.test.ts` — new
  SQL-shape tests (gated on `TEST_DATABASE_URL`)
- `apps/server/src/leaderboards/leaderboard.routes.test.ts` — new
  transport-tier tests with fake `LeaderboardLogic`
- `apps/server/src/server.mjs` — startup-time themeId → scenarioKey[]
  mapping; bound injection into `registerLeaderboardRoutes`
- `docs/ai/REFERENCE/api-endpoints.md` — two new rows per §21
- `docs/ai/DECISIONS.md` — three new `D-150NN` entries
- `docs/ai/work-packets/WORK_INDEX.md` — WP-150 row flipped to done
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-152 row flipped
  `Draft` → `Done`

**Explicitly NOT touched:** every path under `packages/`,
`apps/arena-client/`, `apps/registry-viewer/`, `apps/replay-producer/`,
`apps/wiki-viewer/`, `data/`, `scripts/`, root `package.json`,
`pnpm-lock.yaml`, root `tsconfig.json`, `render.yaml`.

## After Completing

- [ ] WP-150 §Verification Steps 1-7 all pass
- [ ] `pnpm --filter @legendary-arena/server test` passes the new
      baseline (existing extended by `+10 to +18` new tests)
- [ ] Step 3 + Step 4 grep gates return zero matches
- [ ] Step 5 sensitive-field grep returns zero matches outside
      paraphrased `// why:` comments
- [ ] Step 6 endpoint smoke from `legendary-arena.com` Origin returns
      200 + JSON for both new endpoints
- [ ] Step 7 `Compare-Object` returns no output
- [ ] `pnpm-lock.yaml` byte-identical to HEAD
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries two new rows;
      `Status: Wired`, `Auth: guest`, `Authorizing WP: WP-150`
- [ ] `docs/ai/DECISIONS.md` carries three `D-150NN` entries (lock
      themeId-mapping rule, dep-injection shape, new envelope value
      / PAR-eligibility derivation)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-150 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-152 `Draft` → `Done`

## Common Failure Smells

- **`apps/server/src/leaderboards/` imports `@legendary-arena/registry`**
  — layer-boundary violation; the themeId mapping belongs in
  `server.mjs`, injected as a dep.
- **`theme_not_found` envelope never surfaces** — the executor wired
  the route handler but forgot to translate the logic-layer `null`
  return into a 404; production callers get a 200 with an empty
  array instead.
- **Global Top-N includes scenarios without PAR** — the
  PAR-eligibility filter was skipped, violating D-5306 fail-closed.
- **New test counts not locked at session start** — the EC must
  carry the post-WP-150 baseline value (`250 + N / 184 + M / 66 / 0`)
  with N and M filled in before any code is edited, so the WP-150
  §Verification Step 2 expected output is exact.
- **`getScenarioKeysForTheme` accepts the kebab-case themeId but
  the registry's `setupIntent`-derived scenarioKey is different
  casing** — the executor must lock the case-folding rule (likely
  lowercase / kebab-case match) at session start.
