# WP-265 — Real-Signal Runtime-Observed Hollows (Competent Hero-Diverse Per-PR Sweep)

**Status:** Draft — re-scoped 2026-06-19 after WP-266 landed. Pre-flight READY; copilot CONFIRM; lint 21/21 (§Pre-Flight & Copilot Verdicts). **Re-scope (D-24041 rewritten):** WP-266's onBegin parity made competent simulation games actually play cards, and measurement disproved this packet's original cron premise — a competent sweep is **~4 ms/game**, so a rich matrix runs in **~1–2 s** (per-PR trivial). This WP therefore **keeps WP-259's per-PR `sim:runtime-observed:check`** (now affordable, and fresher than a weekly cron) and **drops** the cron + the new workflow file + the ci.yml retirement that the original draft proposed. The remaining execution-time scaffold lock is the exact hero-diverse matrix (which sets/heroes/seeds surface real signal at `hollowEffectsDropped: 0`, byte-stable).
**Primary Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs`). Single surface — the generator-tooling pattern; no new CI workflow (the per-PR gate already exists from WP-259).
**User-Visible Surface:** `dashboard.legendary-arena.com` — the existing `/coverage` runtime-observed overlay (shipped by WP-259) flips from a recorded **zero-state** to **real signal** (mechanics actually hit during competent simulation play). (D-24026 live-verification applies, post-deploy.)
**Dependencies:** **WP-266 ✅ / D-24043** (the onBegin parity that makes the sim bot draw + play cards — without it the competent sweep surfaces nothing; the real enabler). **WP-264 ✅ / D-24040** (the `maxTurns` bounded-turn cap the sweep passes). WP-259 ✅ / D-24035 (the harness `scripts/runtime-observed-hollows.mjs` + the committed artifact + the dashboard `/coverage` overlay + the per-PR `sim:runtime-observed:check` this **retains**). WP-263 ✅ / D-24039 (the `SweepCellResult.hollowEffects` channel the harness reads).

---

## Goal

After this session, the dashboard `/coverage` runtime-observed overlay shows **real signal** — the per-mechanic count of declared-but-unhandled abilities actually executed during a deterministic **competent-play** simulation sweep. WP-259 shipped the overlay against a fast **random-policy zero-state** (the random policy executed no abilities, so it surfaced nothing); WP-266's onBegin parity then made both the competent and random policies actually draw + play cards. This packet switches the committed-artifact sweep to the **competent-heuristic** policy with **WP-264 bounded turns**, over a **hero-diverse matrix** (hero decks swept across many sets — the measured signal lever — × a few seeds per board), regenerates the committed artifact with real hollow observations, and **keeps WP-259's per-PR `sim:runtime-observed:check`** as the freshness gate (a competent sweep is ~1–2 s, well within a per-PR budget). The overlay code (WP-259) is unchanged — it just stops reading zeros.

## Assumes

- **WP-266 ✅ on `main`** — the three observation-only per-turn loops mirror the play-phase `onBegin` (auto-draw to `HAND_SIZE` + the once-per-turn reveal gate), so `createCompetentHeuristicPolicy` now actually plays hero cards in `sweepSetupMatrix` and surfaces real `G.diagnostics.hollowEffects`. **Without WP-266 the competent sweep infinite-loops on turn 1 / runs hand-empty and surfaces zero hollows** — it is the load-bearing enabler.
- **WP-264 ✅ on `main`** — `sweepSetupMatrix(..., maxTurns?)` accepts an optional bounded turn cap (default `MAX_TURNS_PER_GAME = 200`); the harness passes a small `maxTurns` so each competent game is bounded + terminating.
- **WP-259 ✅ on `main`** — `scripts/runtime-observed-hollows.mjs` drives `sweepSetupMatrix` (real registry via `createRegistryFromLocalFiles`) + reads `cell.hollowEffects` / `cell.hollowEffectsDropped` off the `onCellComplete(SweepCellResult)` callback, aggregates per mechanic, and writes `docs/ai/coverage/runtime-observed-hollows.json` via the locked deterministic serializer (sorted keys, closed-order `byReason`, sorted/bounded `examples`, `schemaVersion: 1`). The dashboard `/coverage` overlay + the build-time-copy (`build-coverage-ledger.mjs` → gitignored `src/data/runtime-observed-hollows.json`) consume it. **The per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` CI job + the `package.json` scripts already exist — this WP keeps them; only the harness internals (policy + matrix) and the artifact change.**
- **WP-263 ✅ on `main`** — `createCompetentHeuristicPolicy` (`packages/game-engine/dist/simulation/ai.competent.js`) is the competent-play policy; the harness already imports the engine dist (the `hero-effect-coverage` / `hero-mechanic-ledger` precedent).
- **Measured at re-scope (2026-06-19, off `main` `4aa5f359` with WP-266):** competent game = **~4.4 ms mean** (median 3.6, max 19.6; the earlier "17 ms" was first-game JIT warm-up). **Seed variation surfaces no new signal** — 40 seeds over one board (the sentinel core + `wwhk` heroes) surfaced only **1** mechanic; the SAME heroes have the SAME hollow-able abilities. **Board/hero diversity is the lever** — 14 different hero-set boards surfaced **5** distinct mechanics. **All 14 set-boards validated against the real registry** (0 setup failures) using the known-valid **sentinel core** (scheme `core/legacy-virus-the` + mastermind `core/dr-doom` + villain group `core/brotherhood` + henchman group `core/savage-land-mutates`) + 5 heroes per set. A single game per board under-samples (a hero's hollow fires only if that card is drawn + played that game), so each board needs a few seeds. ~40 sets × ~10 seeds ≈ 400 games ≈ **<2 s** — per-PR trivial.
- **Baseline:** drafted against `origin/main` @ `4aa5f359` (`git rev-parse origin/main`).

## Context (Read First)

- `docs/ai/DECISIONS.md` — D-24035 (the WP-259 runtime-overlay decision), **D-24043 (WP-266 onBegin parity — the enabler)**, D-24040 (WP-264 `maxTurns`), D-24039 (WP-263 channel).
- `scripts/runtime-observed-hollows.mjs` (WP-259) — the harness to extend (the locked-matrix block + `buildPoliciesForCell` + `harvest` + the deterministic serializer + `--check`).
- `.github/workflows/ci.yml` — the `hero-effect-coverage` job carrying WP-259's per-PR `sim:runtime-observed:check` step (**kept** — not modified by this WP; the competent sweep is per-PR-affordable).
- `apps/dashboard/src/pages/coverage/CoveragePage.vue` + `composables/useCoverageLedger.ts` (WP-259) — the overlay that renders the artifact, **unchanged** by this WP.
- `docs/ai/coverage/hero-mechanic-ledger.json` — the static ledger used at scaffold time to **discover** candidate hero-diverse sets (grouped by `.set`, ranked by distinct `status: 'unsupported'` mechanics). The harness does **not** read it at runtime — the chosen matrix is a hardcoded locked value (see §Constraints).

## Non-Negotiable Constraints

**Engine-wide:** Full file contents for every new/modified file — no diffs. ESM only, Node v22+. `00.6-code-style.md`. `node:test`; `.test.ts`. `pnpm`, not `npm`; `pwsh`, not bash.

**No engine edit:** `packages/**` diff is **EMPTY**. This packet consumes WP-266's parity + WP-264's `maxTurns` + WP-263's channel; it adds no engine code. `data/cards/**` byte-unchanged.

**Determinism is load-bearing:** the competent-heuristic policy uses a **seeded** PRNG (`createCompetentHeuristicPolicy(seatSeed)`), so a fixed `runSeed` + bounded turns + a fixed matrix ⇒ a **byte-identical** artifact every run ⇒ the per-PR `--check` (regenerate-and-diff) is exact. No `Math.random` / clock / network / timestamp in the harness; the one locked serializer path (sorted `byMechanic` keys, closed-order `byReason`, sorted-then-bounded `examples`, two-space indent, one trailing newline) is preserved verbatim from WP-259. The harness still **reads** `cell.hollowEffects` (WP-263) — it never re-detects.

**The matrix is a hardcoded locked value (not a runtime ledger read):** the hero-diverse matrix — the explicit list of hero-deck sets (each its 5 hero IDs over the sentinel core) and the per-board seed count — is a hardcoded constant block in the harness (extending WP-259's `BASE_COMPOSITION` / `SCHEME_IDS` locked-value pattern). The harness must NOT read `hero-mechanic-ledger.json` (or any other generated artifact) at runtime — that would couple the runtime-observed artifact's determinism to another generated file. The ledger is a scaffold-time discovery aid only.

**`summary.hollowEffectsDropped` MUST be `0` in the committed artifact:** bounded turns (WP-264) keep each game's hollow count well under `HOLLOW_EFFECTS_CAP = 256`; if the matrix risks the cap, reduce it or the per-game bound rather than commit a lower-bound undercount (the WP-259 guard, unchanged).

**Per-PR check, not a cron (the re-scope):** the competent sweep is per-PR-affordable (~1–2 s; measured ~4 ms/game), so WP-259's per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` job is **kept**, not retired. **No weekly cron, no `runtime-observed-refresh.yml`, no `ci.yml` change** — the original draft's cron design is dropped (D-24041 rewritten). When a developer implements a mechanic (removing a hollow), the per-PR `--check` goes red and the artifact is regenerated in that PR — the same drift-gate posture as `hero-effect-coverage` / `hero-mechanic-ledger`, and fresher than a weekly cron.

**Execution-time locked values (the requirement, not the literals):** the exact `maxTurns`, the competent-play `runSeed`(s), the per-board seed count, and the **explicit hero-deck-set matrix** are **execution-time locked values** the executor SETS, RECORDS in `generatedFrom.matrixDescription`, and **scaffold-confirms by an observed run** that (a) surfaces ≥1 `byMechanic` entry (real signal — target a healthy multi-mechanic set, not the bare minimum), (b) keeps `hollowEffectsDropped` at `0`, (c) is byte-identical on re-run, and (d) keeps the per-PR `--check` affordable (single-digit seconds). If no bounded matrix surfaces a hollow, STOP — that is a WP-266 / WP-264 / board-selection issue, not something to force.

**Dashboard source untouched:** the `/coverage` overlay code, types, composable, page, and build-copy script (WP-259) are **unchanged** — they already render whatever the artifact carries. This packet modifies no tracked dashboard file: `apps/dashboard/src/**` and `apps/dashboard/scripts/**` tracked diff must be **empty**. Verification *does* run `node apps/dashboard/scripts/build-coverage-ledger.mjs`, which regenerates the **gitignored** dashboard-side copy at `apps/dashboard/src/data/runtime-observed-hollows.json` (confirmed gitignored) — that copy is touched on disk but stays untracked.

**Session protocol:** stop and ask only on a boundary event (a needed engine edit, a result-shape change, a layer crossing, a forced undercount/zero artifact, or scope-classification ambiguity). Ordinary matrix/threading details are decided in-line.

## Scope (In)

### A) Harness — the competent-play hero-diverse bounded sweep
- `scripts/runtime-observed-hollows.mjs` — **modified**: switch the committed-artifact sweep to the **competent-heuristic** policy (`createCompetentHeuristicPolicy` from the engine dist), pass a bounded `maxTurns` (WP-264) into `sweepSetupMatrix`, and sweep the **hero-diverse matrix** — a hardcoded locked list of hero-deck sets (5 hero IDs each) over the known-valid **sentinel core** × a per-board seed count. The deterministic serializer, the `cell.hollowEffects` read, the `byReason` closed order, the `--check` contract, and the `hollowEffectsDropped`-must-be-0 guard are all **preserved** from WP-259. (A retained random-policy smoke path is optional and, if kept, must be clearly dev-only and not the committed-artifact path.)
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)**: now carries **real** `byMechanic` entries + a non-zero `summary` (with `hollowEffectsDropped: 0`).

## Out of Scope
- **A weekly cron / `runtime-observed-refresh.yml` / any `.github/workflows/**` change** — the re-scope drops it; the per-PR `sim:runtime-observed:check` (already on `main` from WP-259) is the freshness gate and is kept as-is.
- **`package.json` scripts** — `sim:runtime-observed` + `:check` already exist (WP-259) and keep their names/commands; only the harness internals change. (If the executor finds a script edit genuinely required, that is a boundary event — stop and note it; do not silently broaden.)
- **The dashboard `/coverage` overlay / composable / types / build-copy** (WP-259) — unchanged; they already render the artifact.
- **WP-266 / WP-264 / WP-263 (the engine predecessors)** — consumed here, not modified (`packages/**` diff empty).
- **WP-260 (architect-lane intake)** — a separate consumer of the overlay rows.
- **A live in-match telemetry feed** — the overlay is fed by the deterministic SIM sweep, not production matches (the WP-259 boundary).
- **Implementing any missing mechanic** — this makes the runtime gaps *visible with real counts*; filling them is the downstream Architect-lane work.
- **`data/cards/**`, the registry, the engine, the static `hero-effect-coverage` / `hero-mechanic-ledger` artifacts** — untouched.

## Files Expected to Change
- `scripts/runtime-observed-hollows.mjs` — **modified** — competent-heuristic + bounded-turn (WP-264) + hero-diverse-matrix sweep; serializer / read / guards / `--check` preserved.
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)** — real signal; `hollowEffectsDropped: 0`.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-265 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-295 Done), `docs/ai/DECISIONS.md` (D-24041 → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-265 node + `node scripts/roadmap-counts.mjs --check`).

No other tracked files modified. `packages/**` diff empty; `data/cards/**` byte-unchanged; `.github/workflows/**` + tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff empty. The generated dashboard-side copy `apps/dashboard/src/data/runtime-observed-hollows.json` remains gitignored / untracked.

## Contract

- **The committed artifact** keeps the WP-259 §Contract shape exactly (`schemaVersion: 1`, `generatedFrom { runSeed, gamesPlayed, matrixDescription }`, `summary { distinctMechanics, totalObservations, hollowEffectsDropped, byReason }`, `byMechanic { <mechanic>: { hitCount, lastSeenTurn, byReason, examples } }`) — only the **values** change from the WP-259 zero-state to real observed signal. Hard requirements on the committed artifact:
  - `Object.keys(byMechanic).length >= 1`
  - `summary.totalObservations >= 1`
  - `summary.distinctMechanics >= 1`
  - `summary.hollowEffectsDropped === 0`
  - `byReason` always carries the three closed WP-257 keys in the locked order: `no-handler`, `unsupported-keyword`, `parse-unrecognized`.
  - `generatedFrom.matrixDescription` records: policy (`competent-heuristic`), the fixed `runSeed`(s), `maxTurns`, the per-board seed count, the sentinel core (scheme / mastermind / villain group / henchman group), and the **explicit hero-deck-set list with hero IDs** (no "wwhk heroes" shorthand).
- **Determinism / drift-gate direction (unchanged from WP-259):** fixed seed + bounded matrix ⇒ byte-identical artifact; a mechanic newly appearing in `byMechanic` (or a `hitCount` rise) is the meaningful signal; a mechanic leaving (its handler implemented) is progress. The **per-PR `sim:runtime-observed:check`** regenerates + diffs and fails on drift, exactly like the `hero-effect-coverage` gate — the developer regenerates the artifact in the same PR.

## Acceptance Criteria

### A) Real-signal harness + artifact
- [ ] `scripts/runtime-observed-hollows.mjs` uses `createCompetentHeuristicPolicy` for the committed-artifact path and passes a bounded `maxTurns` (WP-264) into `sweepSetupMatrix`, sweeping the hardcoded hero-diverse matrix (locked hero-deck sets over the sentinel core × the per-board seed count).
- [ ] The harness **reads** `cell.hollowEffects` / `cell.hollowEffectsDropped` (WP-263); it does **not** re-detect hollow mechanics; it does **not** read `hero-mechanic-ledger.json` (or any generated artifact) at runtime; `packages/**` diff empty.
- [ ] The committed artifact has `schemaVersion: 1`, `Object.keys(byMechanic).length >= 1`, `summary.totalObservations >= 1`, `summary.distinctMechanics >= 1`, and `summary.hollowEffectsDropped === 0`. (If no bounded matrix surfaces a hollow at an affordable cost, STOP.)
- [ ] The WP-259 deterministic serializer is preserved: sorted `byMechanic` keys, closed-order `byReason`, sorted-then-bounded `examples`, two-space indent, one trailing newline.
- [ ] Two consecutive `pnpm sim:runtime-observed` runs with the same selected values produce a **byte-identical** artifact; `pnpm sim:runtime-observed:check` exits 0 against the committed artifact.
- [ ] `generatedFrom.matrixDescription` records policy (`competent-heuristic`), `runSeed`(s), `maxTurns`, the per-board seed count, the sentinel core, and the **explicit hero-deck-set list with hero IDs** (no shorthand).

### B) Per-PR gate kept; no cron
- [ ] The per-PR `sim:runtime-observed:check` step in the `hero-effect-coverage` CI job is **unchanged and still present** (`.github/workflows/ci.yml` diff empty).
- [ ] **No** `runtime-observed-refresh.yml` (or any new/edited `.github/workflows/**` file) is created.
- [ ] `pnpm sim:runtime-observed:check` runs the competent sweep and completes in single-digit seconds (per-PR-affordable).

### C) Boundaries / unchanged surfaces
- [ ] `packages/**` diff empty (no engine edit); `data/cards/**` byte-unchanged.
- [ ] Tracked `apps/dashboard/src/**`, `apps/dashboard/scripts/**`, and `.github/workflows/**` diff empty.
- [ ] `git diff --name-only` shows only the two Files Expected to Change + governance; the generated dashboard-side copy `apps/dashboard/src/data/runtime-observed-hollows.json` remains gitignored / untracked.

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0 (produces the dist the harness imports)

pnpm sim:runtime-observed                              # writes the real-signal artifact
$hash1 = (Get-FileHash docs/ai/coverage/runtime-observed-hollows.json -Algorithm SHA256).Hash

# Mechanical JSON sanity gate: real signal + dropped 0 (binary, no eyeballing)
node -e "const fs=require('node:fs'); const p='docs/ai/coverage/runtime-observed-hollows.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); if(Object.keys(j.byMechanic ?? {}).length < 1) throw new Error('expected >=1 byMechanic entry'); if((j.summary?.totalObservations ?? 0) < 1) throw new Error('expected totalObservations >=1'); if((j.summary?.distinctMechanics ?? 0) < 1) throw new Error('expected distinctMechanics >=1'); if(j.summary?.hollowEffectsDropped !== 0) throw new Error('expected hollowEffectsDropped 0'); console.log('runtime-observed artifact sanity ok')"

pnpm sim:runtime-observed                              # re-run
$hash2 = (Get-FileHash docs/ai/coverage/runtime-observed-hollows.json -Algorithm SHA256).Hash
if ($hash1 -ne $hash2) { throw "runtime-observed artifact is not byte-identical across runs" }

pnpm sim:runtime-observed:check                        # exits 0 (the per-PR gate, against the committed artifact)

node apps/dashboard/scripts/build-coverage-ledger.mjs  # copies the real-signal artifact into the gitignored src/data
pnpm --filter @legendary-arena/dashboard test          # all pass (the overlay join still green with real data)
pnpm --filter @legendary-arena/dashboard typecheck     # vue-tsc 0

# Forbidden-scope guard: no engine / card / dashboard-src / dashboard-scripts / workflow change
git diff --name-only -- packages/ data/cards/ apps/dashboard/src/ apps/dashboard/scripts/ .github/workflows/   # empty
node scripts/roadmap-counts.mjs --check                # mindmap node counts in sync
```

Live (D-24026, **post-deploy**): on `dashboard.legendary-arena.com /coverage`, confirm the runtime-observed overlay now shows **real "Observed in play"** counts (a purple badge with a hitCount + reason) for ≥1 mechanic the sweep encountered as hollow. (Operator-viewed; the dashboard is Cloudflare-Access-gated — see the dashboard memory.)

## Vision Alignment

**Vision clauses touched:** §20–§26 (scoring / PAR / **simulation** — fed by a deterministic competent-play sweep), §10 (card-content semantics — reports per-mechanic runtime coverage). **No conflict.** **Determinism preservation:** fixed seed + bounded matrix + seeded heuristic ⇒ reproducible, byte-identical artifact; the harness reads the engine's deterministic channel and adds no randomness/clock/network. **Non-Goal proximity:** an internal operator/diagnostics surface; not paid, persuasive, or competitive — none of NG-1..7 crossed.

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6:** PASS — 00.1 order; canonical names (`SweepCellResult`, `hollowEffects`, `hollowEffectsDropped`, `maxTurns`, `createCompetentHeuristicPolicy`, `runtime-observed-hollows.json`) match WP-259/263/264/266; `## Out of Scope` lists ≥2 excluded items (incl. the dropped cron); 2 files (tooling + regenerated artifact), single layer.
- **§2 Constraints:** PASS — no engine edit (`packages/**` empty); determinism (seeded heuristic + bounded + fixed matrix ⇒ byte-identical; preserved serializer); the matrix-is-hardcoded-not-a-ledger-read guard; `hollowEffectsDropped`-must-be-0 guard; per-PR-check-not-cron (the re-scope) + the affordability basis; execution-time locked values (scaffold-confirmed: ≥1 mechanic, dropped 0, affordable, byte-stable).
- **§7 deps:** PASS — no new npm deps; no new CI action (the cron + its `peter-evans/create-pull-request` use are dropped).
- **§8 architecture:** PASS — Shared Tooling; reads the WP-263 channel; the engine never writes the artifact; the dashboard reads JSON; no upward/sideways import.
- **§9 Windows:** PASS — `pnpm`+`pwsh`; cross-platform `.mjs`. **§10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — the deterministic artifact + the dashboard overlay-join test (unchanged) are the regression gates; `node:test`; no `boardgame.io`/DB/network in tests.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands incl. the kept `sim:runtime-observed:check` + dashboard `test`/`typecheck` + empty-diff guards (incl. `.github/workflows/`); binary criteria; DoD split pre-merge / post-deploy (D-24026).
- **§16 code style:** PASS — explicit `for...of` aggregation (preserved); full English words; `// why:` on the competent-policy + `maxTurns` choice, the seeded-determinism, the hardcoded-matrix rationale, and the per-PR-not-cron rationale.
- **§17 Vision:** Triggered (simulation + card-content coverage) → `## Vision Alignment` present + determinism line. No conflict.
- **§18 prose-vs-grep:** PASS — no count-bounded grep gate. **§19 bridge-vs-HEAD:** N/A. **§20 funding:** N/A — internal diagnostics tooling; no funding navigation / registry-viewer / profile / tournament-channel / donate-copy surface. **§21 API catalog:** N/A — no HTTP endpoint / `apps/server` library function (the harness is Shared Tooling; no CI workflow added).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (baseline `4aa5f359`).** **Class:** Infrastructure & Verification (a tooling change; no gameplay mutation, no engine edit). **Deps on `main`:** WP-266 (onBegin parity — the enabler), WP-264 (`maxTurns`), WP-259 (the harness + artifact + overlay + the per-PR step KEPT), WP-263 (the channel) — all verified on `main`. **Contract fidelity:** the artifact shape + serializer + `cell.hollowEffects` read + the `hollowEffectsDropped`-0 guard + the per-PR `--check` are reused verbatim from WP-259; only the policy + matrix change (the values). **Empirical Scaffold (`01.4`):** the affordability + signal-lever questions are **measured** (re-scope, 2026-06-19: ~4 ms/game; seed-variation surfaces nothing new; hero-set diversity surfaces multi-mechanic signal; all set-boards validate). The one genuinely execution-only unknown is the exact final hero-set matrix + seed count that surfaces a healthy multi-mechanic signal at `dropped: 0`, byte-stable — deferred to the execution scaffold run (the WP/EC lock the requirement, not the literals). **Risks resolved + locked.**
- **Copilot (`01.7`): PASS / CONFIRM.** **Cat-1 (Boundaries):** Shared Tooling; `packages/**` empty; engine emits, tooling consumes, dashboard reads; no new CI surface. **Cat-2 (Determinism):** seeded heuristic + bounded turns + fixed hardcoded matrix ⇒ byte-identical; preserved serializer; the matrix is NOT a runtime ledger read (no cross-artifact determinism coupling). **Cat-5 (Persistence):** reads the runtime-only channel; the artifact is a derived committed record. **Cat-6 (Testing):** the per-PR `--check` + the deterministic artifact + the unchanged overlay-join test; the `dropped: 0` + byte-identical-re-run gates. **Cat-8 (Extensibility):** flips the WP-259 overlay to real signal; the overlay is unchanged; the dropped cron removes maintenance surface. The one open judgment — the final matrix breadth — is the scaffold-confirmed execution unknown, bounded by the STOP-if-unaffordable clause → CONFIRM.

> **Drafting status (per 01.0a):** WP re-scoped + EC-295 re-scoped; pre-flight READY; copilot CONFIRM; lint 21/21; D-24041 (rewritten) reserved; session prompt to be written at execution. **Sequencing:** WP-266 + WP-264 are on `main`; WP-265 is execution-ready.

## Executor Stop Conditions

STOP and return for packet revision if any of the following is required to proceed:

- editing `packages/**`;
- editing `data/cards/**`;
- editing a tracked dashboard source or script file (`apps/dashboard/src/**`, `apps/dashboard/scripts/**`);
- editing any `.github/workflows/**` file (the per-PR gate is kept as-is; no cron is added);
- reading `hero-mechanic-ledger.json` (or any generated artifact) at harness runtime (the matrix is a hardcoded locked value);
- adding a dependency;
- committing an artifact with `byMechanic = {}` (zero-state) or `summary.hollowEffectsDropped > 0` (undercount);
- using unseeded randomness, clock time, network data, timestamps, or unordered serializer output anywhere on the artifact path;
- making the per-PR `sim:runtime-observed:check` affordable-only by gutting the matrix to near-zero signal (target a healthy multi-mechanic sweep, not the bare minimum).

Do not force a zero artifact, commit an undercount, modify the engine, add a cron, or broaden scope to get past any of these — each is a boundary that means the packet (or a predecessor) needs revision, not a workaround.

## Definition of Done

### Pre-merge Done
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes a real-signal artifact (≥1 `byMechanic`, `hollowEffectsDropped: 0`), byte-identical on re-run; `pnpm sim:runtime-observed:check` 0; dashboard `test` 0; dashboard `typecheck` 0
- [ ] `packages/**` diff empty; `data/cards/**` byte-unchanged; `.github/workflows/**` + tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff empty
- [ ] The per-PR `sim:runtime-observed:check` step is kept (no `ci.yml` change); **no** `runtime-observed-refresh.yml` or other new workflow added
- [ ] No files outside `## Files Expected to Change` modified (the gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` copy correctly absent from the diff)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-265 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-295 Done; `docs/05-ROADMAP-MINDMAP.md` WP-265 node; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/DECISIONS.md` D-24041 → Active
- [ ] `docs/ai/STATUS.md` records the change with **D-24026 pending deploy verification** (the overlay flips to real signal)

### Post-deploy Done (D-24026)
- [ ] On `dashboard.legendary-arena.com /coverage` (post-deploy): the runtime-observed overlay shows **real "Observed in play"** counts for ≥1 sweep-encountered hollow mechanic (operator-viewed — CF-Access-gated)
- [ ] `docs/ai/STATUS.md` updated with the **deployed evidence** (only now is D-24026 satisfied)
