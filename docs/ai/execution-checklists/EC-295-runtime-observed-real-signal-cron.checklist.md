# EC-295 — Real-Signal Runtime-Observed Hollows (Competent Hero-Diverse Per-PR Sweep) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-265-runtime-observed-real-signal-cron.md
**Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs`)

## Before Starting
- [ ] **WP-266 ✅ on `main` (D-24043)** — the onBegin parity (auto-draw + reveal gate) that makes `createCompetentHeuristicPolicy` actually play cards in `sweepSetupMatrix`. WITHOUT it the competent sweep surfaces zero hollows — it is the enabler.
- [ ] WP-264 ✅ on `main` (D-24040) — `sweepSetupMatrix(..., maxTurns?)` accepts a bounded turn cap (default 200 = byte-identical)
- [ ] WP-259 ✅ on `main` — the harness, the committed artifact, the dashboard `/coverage` overlay + build-copy, and the per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` job (KEPT — not retired)
- [ ] WP-263 ✅ on `main` — `cell.hollowEffects` / `cell.hollowEffectsDropped` on `SweepCellResult`; `createCompetentHeuristicPolicy` in the engine dist
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/dashboard test` exits 0; `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 (baselines)

## Locked Invariants and Execution-Time Values

### Locked invariants (do not re-derive)
- The committed artifact keeps the WP-259 shape (`schemaVersion: 1`, `generatedFrom`, `summary`, `byMechanic`); only the **values** become real (non-zero). `byReason` keeps the closed WP-257 order (`no-handler`, `unsupported-keyword`, `parse-unrecognized`). The deterministic serializer (sorted `byMechanic` keys, sorted-then-bounded `examples`, two-space indent, one trailing newline) and the `hollowEffectsDropped: 0` guard are **preserved verbatim** from WP-259.
- The harness **reads** `cell.hollowEffects` / `cell.hollowEffectsDropped` off `SweepCellResult` (WP-263) — it never re-detects hollow mechanics. The engine never writes the artifact.
- **Policy family = competent-heuristic** via `createCompetentHeuristicPolicy` (engine dist). **Turn bounding** = WP-264's `maxTurns` passed into `sweepSetupMatrix`.
- **The matrix is a hardcoded locked value** — an explicit list of hero-deck sets (5 hero IDs each) over the sentinel core, plus a per-board seed count, defined as constants in the harness (the WP-259 `BASE_COMPOSITION` pattern). The harness must NOT read `hero-mechanic-ledger.json` (or any generated artifact) at runtime.
- No `Math.random`, clock, network, timestamp, unordered key iteration, or non-deterministic example ordering anywhere on the artifact path.

### Execution-time selected values (SET, RECORD, scaffold-confirm)
- The executor selects and records the exact `runSeed`(s), `maxTurns`, per-board seed count, the sentinel core, and the **explicit hero-deck-set list with hero IDs** in `generatedFrom.matrixDescription`. Record explicit IDs — never "wwhk heroes" shorthand.
- The selected values are valid **only if** the observed scaffold run confirms: ≥1 `byMechanic` entry (target a healthy MULTI-mechanic sweep, not the bare minimum); `summary.hollowEffectsDropped === 0`; two consecutive runs produce a byte-identical `docs/ai/coverage/runtime-observed-hollows.json`; and `pnpm sim:runtime-observed:check` completes per-PR-affordably (single-digit seconds).
- If those conditions cannot all be satisfied, **STOP**. Do not force a zero artifact, commit an undercount, modify the engine, add a cron, or broaden scope.
- **Measured starting point (re-scope, 2026-06-19):** competent game ≈ 4 ms; seed variation surfaces no new mechanics (board diversity is the lever); 14 set-boards over the **sentinel core** (`core/legacy-virus-the` + `core/dr-doom` + `core/brotherhood` + `core/savage-land-mutates`) + 5 heroes/set ALL validated against the real registry (0 setup failures) and surfaced 5 distinct mechanics in 0.09 s. Discover candidate sets at scaffold time from `hero-mechanic-ledger.json` (`rows[].extId` grouped by `.set`, ranked by distinct `status: 'unsupported'`), then HARDCODE the chosen list.

## Guardrails
- **No engine edit** — `packages/**` diff EMPTY; consumes WP-266's parity + WP-264's `maxTurns` + WP-263's channel; `data/cards/**` byte-unchanged.
- **Dashboard source untouched** — tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff EMPTY; the overlay already renders whatever the artifact carries. Verification runs `build-coverage-ledger.mjs`, which regenerates the **gitignored** `apps/dashboard/src/data/runtime-observed-hollows.json` copy on disk — that copy stays untracked; do not claim all of `apps/dashboard/**` is byte-unchanged.
- **`hollowEffectsDropped` MUST be 0** in the committed artifact — bounded turns keep each game under `HOLLOW_EFFECTS_CAP = 256`; if the matrix risks the cap, shrink it / lower `maxTurns`, never commit an undercount.
- **Determinism** — seeded heuristic + bounded turns + fixed hardcoded matrix ⇒ byte-identical artifact; NO `Math.random` / clock / network / timestamp in the harness; one locked serializer path.
- **Per-PR check, NOT a cron (the re-scope)** — KEEP WP-259's per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` job exactly as-is (`.github/workflows/ci.yml` diff EMPTY). Do **NOT** create `runtime-observed-refresh.yml` or any new/edited `.github/workflows/**` file. The competent sweep is per-PR-affordable (~1–2 s), so the per-PR drift-gate is the freshness mechanism (and is fresher than a weekly cron — it fires the moment a PR implements a mechanic).
- **STOP if no signal / unaffordable** — if no bounded matrix surfaces a healthy multi-mechanic signal at an affordable byte-stable `dropped: 0` cost, STOP (a WP-266 / WP-264 / board-selection issue), do not force.
- **Boundary-based stops only** — STOP for an engine edit, a `data/cards` change, a dashboard-src change, a `.github/workflows/**` change, a new dependency, or a runtime ledger read.

## Required `// why:` Comments

Each topic below needs a `// why:` comment (paraphrase freely — not a verbatim-locked string; no verification grep keys off it):

- The competent-heuristic policy + `maxTurns` bound — competent play (post-WP-266) executes abilities; `maxTurns` keeps each game fast + terminating.
- The seeded-determinism — a fixed `runSeed` + `createCompetentHeuristicPolicy(seatSeed)` makes regeneration byte-stable, which lets the per-PR `--check` use a plain regenerate-and-diff.
- The hardcoded hero-diverse matrix — board/hero diversity is the signal lever (seeds alone surface nothing new); the matrix is a hardcoded constant, NOT a runtime read of the static ledger.

## Files to Produce
- `scripts/runtime-observed-hollows.mjs` — **modified** — competent-heuristic + `maxTurns`-bounded + hardcoded hero-diverse-matrix sweep; serializer / read / `dropped: 0` guard / `--check` preserved
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)** — real signal; `hollowEffectsDropped: 0`

## After Completing
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes a real-signal artifact; the JSON sanity gate passes (`Object.keys(byMechanic).length >= 1`, `totalObservations >= 1`, `distinctMechanics >= 1`, `hollowEffectsDropped === 0`); `Get-FileHash` identical across two consecutive runs; `pnpm sim:runtime-observed:check` 0; dashboard `test` 0; dashboard `typecheck` 0
- [ ] `git diff --name-only -- packages/ data/cards/ apps/dashboard/src/ apps/dashboard/scripts/ .github/workflows/` empty
- [ ] `git diff --name-only` = the 2 Files to Produce + governance (the gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` copy absent)
- [ ] `docs/ai/DECISIONS.md` D-24041 → Active; `docs/ai/STATUS.md` records **D-24026 pending deploy verification**
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-265 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-295 Done; `docs/05-ROADMAP-MINDMAP.md` WP-265 node; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- The artifact is still a zero-state (`byMechanic = {}`) → the policy wasn't switched to competent-heuristic, or `maxTurns` is so low no card gets played, or the hero-set matrix has no hollow heroes — re-confirm the matrix + a non-trivial `maxTurns`.
- Only ONE mechanic surfaces over many seeds → the matrix varies seeds, not boards; vary the HERO-deck sets (the measured lever), not just the run seed.
- `hollowEffectsDropped > 0` → a game hit `HOLLOW_EFFECTS_CAP`; lower `maxTurns` / shrink the matrix.
- `sim:runtime-observed` re-run is not byte-identical → a non-deterministic source crept in (unsorted keys, a clock, an unseeded policy, or a runtime ledger read), or the seed isn't fixed.
- A `.github/workflows/**` entry in the diff → the cron crept back in; the re-scope KEEPS the per-PR check and adds NO workflow.
- A `packages/**` or a tracked `apps/dashboard/src/**` / `apps/dashboard/scripts/**` entry in the diff → an engine/dashboard edit slipped in; this packet is harness + artifact only. (The gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` copy is expected to change on disk but must stay untracked.)
- The harness imports / reads `hero-mechanic-ledger.json` at runtime → forbidden; the matrix is a hardcoded locked value (the ledger is a scaffold-time discovery aid only).
