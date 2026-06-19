# EC-295 — Real-Signal Runtime-Observed Hollows Cron (Execution Checklist)

**Source:** docs/ai/work-packets/WP-265-runtime-observed-real-signal-cron.md
**Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs`) + CI (`.github/workflows/**`)

## Before Starting
- [ ] **WP-264 ✅ on `main` (D-24040)** — `sweepSetupMatrix(..., maxTurns?)` + the sim entry points accept an optional `maxTurns` (default 200 = byte-identical)
- [ ] WP-259 ✅ on `main` — the harness, the committed artifact, the dashboard `/coverage` overlay + build-copy, and the per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` job
- [ ] WP-263 ✅ on `main` — `cell.hollowEffects` / `cell.hollowEffectsDropped` on `SweepCellResult`; `createCompetentHeuristicPolicy` in the engine dist
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/dashboard test` exits 0; `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 (baselines)

## Locked Invariants and Execution-Time Values

### Locked invariants (do not re-derive)
- The committed artifact keeps the WP-259 shape (`schemaVersion: 1`, `generatedFrom`, `summary`, `byMechanic`); only the **values** become real (non-zero). `byReason` keeps the closed WP-257 order (`no-handler`, `unsupported-keyword`, `parse-unrecognized`). The deterministic serializer (sorted `byMechanic` keys, sorted-then-bounded `examples`, two-space indent, one trailing newline) and the `hollowEffectsDropped: 0` guard are **preserved verbatim** from WP-259.
- The harness **reads** `cell.hollowEffects` / `cell.hollowEffectsDropped` off `SweepCellResult` (WP-263) — it never re-detects hollow mechanics. The engine never writes the artifact.
- **Policy family = competent-heuristic** via `createCompetentHeuristicPolicy` (engine dist). **Turn bounding** = WP-264's `maxTurns` passed into `sweepSetupMatrix`.
- No `Math.random`, clock, network, timestamp, unordered key iteration, or non-deterministic example ordering anywhere on the artifact path.

### Execution-time selected values (SET, RECORD, scaffold-confirm)
- The executor selects and records the exact `runSeed`, `maxTurns`, scheme matrix, mastermind matrix, board configuration, and **explicit HQ hero IDs** in `generatedFrom.matrixDescription`. Record explicit IDs — never "wwhk heroes" shorthand — even though which five heroes is an execution-time choice.
- The selected values are valid **only if** the observed scaffold run confirms: ≥1 `byMechanic` entry; `summary.hollowEffectsDropped === 0`; two consecutive runs produce a byte-identical `docs/ai/coverage/runtime-observed-hollows.json`; and the run is affordable enough for scheduled CI refresh (minutes, not hours).
- If those conditions cannot all be satisfied, **STOP**. Do not force a zero artifact, commit an undercount, modify the engine, or broaden scope.
- Known-valid real board (WP-259 finding) to start from: `core/legacy-virus-the` + `core/dr-doom` + `core/brotherhood` + `core/savage-land-mutates` + `wwhk` HQ heroes. `data/sweep-fixtures/setup.json` ids are NOT registry-valid.
- Cron `runtime-observed-refresh.yml`: weekly `schedule` + `workflow_dispatch`; `permissions: contents: write, pull-requests: write`; regen step `continue-on-error: true`; bot PR via `peter-evans/create-pull-request@v6`, `add-paths: docs/ai/coverage/runtime-observed-hollows.json`, `branch: bot/runtime-observed-refresh`, `delete-branch: true` — review-gated (no auto-merge, no direct-to-main). Mirrors `roadmap-counts.yml`.

## Guardrails
- **No engine edit** — `packages/**` diff EMPTY; consumes WP-264's `maxTurns` + WP-263's channel; `data/cards/**` byte-unchanged.
- **Dashboard source untouched** — tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff EMPTY; the overlay already renders whatever the artifact carries (real or zero). Verification runs `build-coverage-ledger.mjs`, which regenerates the **gitignored** `apps/dashboard/src/data/runtime-observed-hollows.json` copy on disk — that copy stays untracked / absent from `git diff`; do not claim all of `apps/dashboard/**` is byte-unchanged.
- **`hollowEffectsDropped` MUST be 0** in the committed artifact — bounded turns keep each game under `HOLLOW_EFFECTS_CAP = 256`; if the matrix risks the cap, shrink it / lower `maxTurns`, never commit an undercount.
- **Determinism** — seeded heuristic + bounded turns + fixed matrix ⇒ byte-identical artifact; NO `Math.random` / clock / network / timestamp in the harness; one locked serializer path.
- **Cron, not per-PR** — REMOVE WP-259's per-PR `Runtime-observed hollows freshness` (`sim:runtime-observed:check`) step from the `hero-effect-coverage` job; the cron is the freshness gate (the realized D-24035 fallback). Note this retires the **per-PR CI invocation**, not the `sim:runtime-observed:check` npm script itself — the script may remain for local / cron / debug use. The cron is **review-gated** (bot PR on drift; no auto-merge; no direct-to-`main`). `continue-on-error: true` on the regen step is allowed **only** so later diff / reporting / PR steps run — a regen failure must still surface in the job result / summary / an explicit later failure step. **No** `|| true`, no exit-code-swallowing — the visible-failure invariant. The create-PR step is conditioned on an **artifact diff** (not arbitrary dirtiness); the PR body records policy / seed / `maxTurns` / matrix, regen success-or-failure, the changed path, and a review-gated reminder.
- **STOP if no signal / unaffordable** — if no bounded matrix surfaces ≥1 hollow at an affordable byte-stable `dropped: 0` cost, STOP (a WP-264 / board-selection issue), do not force.
- **Boundary-based stops only** — STOP for an engine edit, a `data/cards` change, a dashboard-src change, a new dependency, or a CI strategy that can't satisfy affordability+review-gating.

## Required `// why:` Comments

Each topic below needs a `// why:` comment. The suggested wording is guidance to keep the comment specific — paraphrase freely (it is **not** a verbatim-locked string; no verification grep keys off it):

- The competent-heuristic policy + `maxTurns` bound. Suggested:
  - `// why: Runtime-observed hollows need competent play because the random policy is passive and can preserve the WP-259 zero-state even when hollow mechanics exist.`
  - `// why: maxTurns is passed through the WP-264 bound so all-hollow or non-terminating boards stay cron-affordable and cannot grind to the default 200-turn cap.`
- The seeded-determinism. Suggested:
  - `// why: a fixed runSeed plus createCompetentHeuristicPolicy(seatSeed) makes artifact regeneration byte-stable, which lets the scheduled refresh use a plain regenerate-and-diff review gate.`
- The cron-not-per-PR posture. Suggested:
  - `// why: this deep sweep is intentionally cron-maintained instead of per-PR CI; it realizes the D-24035 affordability fallback while keeping drift review-gated.`

## Files to Produce
- `scripts/runtime-observed-hollows.mjs` — **modified** — competent-heuristic + `maxTurns`-bounded + deeper-matrix sweep; serializer / read / `dropped: 0` guard preserved
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)** — real signal; `hollowEffectsDropped: 0`
- `package.json` (root) — **modified** — repoint the `sim:runtime-observed` scripts to the competent-play sweep (record the choice)
- `.github/workflows/ci.yml` — **modified** — remove the per-PR `sim:runtime-observed:check` step
- `.github/workflows/runtime-observed-refresh.yml` — **new** — weekly cron + review-gated bot-PR-on-drift (D-24002 pattern)

## After Completing
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes a real-signal artifact; the JSON sanity gate passes (`Object.keys(byMechanic).length >= 1`, `totalObservations >= 1`, `distinctMechanics >= 1`, `hollowEffectsDropped === 0`); `Get-FileHash` is identical across two consecutive runs (byte-identical); dashboard `test` 0; dashboard `typecheck` 0
- [ ] `git diff --name-only -- packages/ data/cards/ apps/dashboard/src/ apps/dashboard/scripts/` empty
- [ ] `git diff --name-only` = the 5 Files to Produce + governance (the gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` copy absent)
- [ ] `docs/ai/DECISIONS.md` D-24041 → Active; `docs/ai/STATUS.md` records **D-24026 pending deploy verification**
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-265 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-295 Done; `docs/05-ROADMAP-MINDMAP.md` WP-265 node; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- The artifact is still a zero-state (`byMechanic = {}`) → the policy wasn't switched to competent-heuristic, or `maxTurns` is so low no card gets played, or the board has no hollow heroes — re-confirm the board + a non-trivial `maxTurns`.
- `hollowEffectsDropped > 0` → a game hit `HOLLOW_EFFECTS_CAP`; lower `maxTurns` / shrink the matrix.
- `sim:runtime-observed` re-run is not byte-identical → a non-deterministic source crept in (unsorted keys, a clock, an unseeded policy), or the seed isn't fixed.
- A `packages/**` or a tracked `apps/dashboard/src/**` / `apps/dashboard/scripts/**` entry in the diff → an engine/dashboard edit slipped in; this packet is tooling + CI only. (The gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` copy is expected to change on disk but must stay untracked.)
- The cron commits to `main` or auto-merges → wrong; it opens a review-gated bot PR (the `roadmap-counts.yml` pattern).
- A `|| true` / exit-swallowing suffix on a cron step → forbidden (visible-failure invariant).
