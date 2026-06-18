# EC-295 — Real-Signal Runtime-Observed Hollows Cron (Execution Checklist)

**Source:** docs/ai/work-packets/WP-265-runtime-observed-real-signal-cron.md
**Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs`) + CI (`.github/workflows/**`)

## Before Starting
- [ ] **WP-264 ✅ on `main` (D-24040)** — `sweepSetupMatrix(..., maxTurns?)` + the sim entry points accept an optional `maxTurns` (default 200 = byte-identical)
- [ ] WP-259 ✅ on `main` — the harness, the committed artifact, the dashboard `/coverage` overlay + build-copy, and the per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` job
- [ ] WP-263 ✅ on `main` — `cell.hollowEffects` / `cell.hollowEffectsDropped` on `SweepCellResult`; `createCompetentHeuristicPolicy` in the engine dist
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/dashboard test` exits 0; `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 (baselines)

## Locked Values (do not re-derive)
- The committed artifact keeps the WP-259 shape (`schemaVersion: 1`, `generatedFrom`, `summary`, `byMechanic`); only the **values** become real (non-zero). `byReason` keeps the closed WP-257 order (`no-handler`, `unsupported-keyword`, `parse-unrecognized`). The deterministic serializer (sorted `byMechanic` keys, sorted-then-bounded `examples`, two-space indent, one trailing newline) is **preserved verbatim** from WP-259.
- **Policy = competent-heuristic** (`createCompetentHeuristicPolicy`, engine dist); **bounded** via WP-264's `maxTurns` passed to `sweepSetupMatrix`; the deeper scheme × mastermind matrix + the known-valid hollow-heavy board. `runSeed` / `maxTurns` / matrix / board are **execution-time** values: SET, RECORD in `generatedFrom.matrixDescription`, **scaffold-confirm** (≥1 `byMechanic`, `hollowEffectsDropped: 0`, byte-identical re-run, affordable cost).
- Known-valid real board (WP-259 finding): `core/legacy-virus-the` + `core/dr-doom` + `core/brotherhood` + `core/savage-land-mutates` + `wwhk` HQ heroes. `data/sweep-fixtures/setup.json` ids are NOT registry-valid.
- The harness **reads** `cell.hollowEffects` (WP-263) — never re-detects. The engine never writes the artifact.
- Cron `runtime-observed-refresh.yml`: weekly `schedule` + `workflow_dispatch`; `permissions: contents: write, pull-requests: write`; regen step `continue-on-error: true`; bot PR via `peter-evans/create-pull-request@v6`, `add-paths: docs/ai/coverage/runtime-observed-hollows.json`, `branch: bot/runtime-observed-refresh`, `delete-branch: true` — review-gated (no auto-merge, no direct-to-main). Mirrors `roadmap-counts.yml`.

## Guardrails
- **No engine edit** — `packages/**` diff EMPTY; consumes WP-264's `maxTurns` + WP-263's channel; `data/cards/**` byte-unchanged.
- **Dashboard untouched** — `apps/dashboard/**` byte-unchanged; the overlay already renders whatever the artifact carries (real or zero).
- **`hollowEffectsDropped` MUST be 0** in the committed artifact — bounded turns keep each game under `HOLLOW_EFFECTS_CAP = 256`; if the matrix risks the cap, shrink it / lower `maxTurns`, never commit an undercount.
- **Determinism** — seeded heuristic + bounded turns + fixed matrix ⇒ byte-identical artifact; NO `Math.random` / clock / network / timestamp in the harness; one locked serializer path.
- **Cron, not per-PR** — REMOVE WP-259's per-PR `sim:runtime-observed:check` step from the `hero-effect-coverage` job; the cron is the freshness gate (the realized D-24035 fallback). The cron is **review-gated** (bot PR on drift; no auto-merge); `continue-on-error` on regen; **no exit-code-swallowing** (`|| true`) — the visible-failure invariant.
- **STOP if no signal / unaffordable** — if no bounded matrix surfaces ≥1 hollow at an affordable byte-stable `dropped: 0` cost, STOP (a WP-264 / board-selection issue), do not force.
- **Boundary-based stops only** — STOP for an engine edit, a `data/cards` change, a dashboard-src change, a new dependency, or a CI strategy that can't satisfy affordability+review-gating.

## Required `// why:` Comments
- The competent-heuristic policy + `maxTurns` bound (why competent play surfaces real hollows; why bounding via WP-264 keeps it fast + terminating + `dropped: 0`)
- The seeded-determinism (fixed seed ⇒ byte-identical ⇒ the cron regenerate-and-diff is exact)
- The cron-not-per-PR posture (the deep sweep is cron-maintained; the realized D-24035 CI-affordability fallback)

## Files to Produce
- `scripts/runtime-observed-hollows.mjs` — **modified** — competent-heuristic + `maxTurns`-bounded + deeper-matrix sweep; serializer / read / `dropped: 0` guard preserved
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)** — real signal; `hollowEffectsDropped: 0`
- `package.json` (root) — **modified** — repoint the `sim:runtime-observed` scripts to the competent-play sweep (record the choice)
- `.github/workflows/ci.yml` — **modified** — remove the per-PR `sim:runtime-observed:check` step
- `.github/workflows/runtime-observed-refresh.yml` — **new** — weekly cron + review-gated bot-PR-on-drift (D-24002 pattern)

## After Completing
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes a real-signal artifact (≥1 `byMechanic`, `hollowEffectsDropped: 0`), byte-identical re-run; dashboard `test` 0; dashboard `typecheck` 0
- [ ] `git diff --name-only -- packages/ data/cards/ apps/dashboard/src/` empty
- [ ] `git diff --name-only` = the 5 Files to Produce + governance (gitignored `src/data` copy absent)
- [ ] `docs/ai/DECISIONS.md` D-24041 → Active; `docs/ai/STATUS.md` records **D-24026 pending deploy verification**
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-265 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-295 Done; `docs/05-ROADMAP-MINDMAP.md` WP-265 node; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- The artifact is still a zero-state (`byMechanic = {}`) → the policy wasn't switched to competent-heuristic, or `maxTurns` is so low no card gets played, or the board has no hollow heroes — re-confirm the board + a non-trivial `maxTurns`.
- `hollowEffectsDropped > 0` → a game hit `HOLLOW_EFFECTS_CAP`; lower `maxTurns` / shrink the matrix.
- `sim:runtime-observed` re-run is not byte-identical → a non-deterministic source crept in (unsorted keys, a clock, an unseeded policy), or the seed isn't fixed.
- A `packages/**` or `apps/dashboard/**` entry in the diff → an engine/dashboard edit slipped in; this packet is tooling + CI only.
- The cron commits to `main` or auto-merges → wrong; it opens a review-gated bot PR (the `roadmap-counts.yml` pattern).
- A `|| true` / exit-swallowing suffix on a cron step → forbidden (visible-failure invariant).
