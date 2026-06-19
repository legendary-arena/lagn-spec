# WP-265 — Real-Signal Runtime-Observed Hollows Cron (Bounded Heuristic Sweep + Scheduled Refresh)

**Status:** Draft — ready for execution after scaffold value selection. Pre-flight READY; copilot CONFIRM; lint 21/21 (§Pre-Flight & Copilot Verdicts). WP-264's `maxTurns` dependency is now met (✅ `main` #396 / `436de971`). The one empirical unknown is the execution-time scaffold lock: execution must first lock `runSeed`, `maxTurns`, the scheme × mastermind matrix, and **explicit board / HQ hero IDs** by an observed run that confirms real signal ≥1 `byMechanic`, `hollowEffectsDropped: 0`, byte-identical re-run, and cron-affordable cost.
**Primary Layer:** Shared Tooling (`scripts/runtime-observed-hollows.mjs`) **+** CI (`.github/workflows/**`). Two surfaces, one WP — the standard generator-tooling / scheduled-refresh pattern (the D-24002 `roadmap-counts.yml` cron precedent).
**User-Visible Surface:** `dashboard.legendary-arena.com` — the existing `/coverage` runtime-observed overlay (shipped by WP-259) flips from a recorded **zero-state** to **real signal** (mechanics actually hit during competent simulation play). (D-24026 live-verification applies, post-deploy + post-first-cron-or-execution refresh.)
**Dependencies:** **WP-264 ✅ / D-24040** (the `maxTurns` sim turn cap — bounded, terminating heuristic games; the enabler this consumes). WP-259 ✅ / D-24035 (the harness `scripts/runtime-observed-hollows.mjs` + the committed artifact + the dashboard `/coverage` overlay + the per-PR `sim:runtime-observed:check` this retires). WP-263 ✅ / D-24039 (the `SweepCellResult.hollowEffects` channel the harness reads). The D-24002 `roadmap-counts.yml` weekly-cron + bot-PR-on-drift precedent.

---

## Goal

After this session, the dashboard `/coverage` runtime-observed overlay shows **real signal** — the per-mechanic count of declared-but-unhandled abilities actually executed during a deterministic **competent-play** simulation sweep. WP-259 shipped the overlay against a fast **random-policy zero-state** (the random policy is passive — it executes no card abilities — so it surfaces nothing), with the heavier competent-play sweep explicitly deferred to a cron (the D-24035 CI-affordability fallback). This packet realizes that fallback: the harness runs a **competent-heuristic** sweep with **WP-264 bounded turns** (so games are fast + terminate instead of grinding to the 200-turn cap) over a **deeper matrix**, regenerates the committed artifact with real hollow observations, and a **weekly cron** keeps it fresh by opening a review-gated refresh PR on drift. The per-PR `sim:runtime-observed:check` is retired in favor of the cron (the deep sweep is not per-PR-affordable). The overlay code (WP-259) is unchanged — it just stops reading zeros.

## Assumes

- **WP-264 ✅ on `main`** — `sweepSetupMatrix(..., maxTurns?)` + the sim entry points accept an optional `maxTurns` (default `MAX_TURNS_PER_GAME = 200` → byte-identical). The harness passes a small `maxTurns` so each competent game is bounded + terminating.
- **WP-259 ✅ on `main`** — `scripts/runtime-observed-hollows.mjs` drives `sweepSetupMatrix` (real registry via `createRegistryFromLocalFiles`) + reads `cell.hollowEffects` / `cell.hollowEffectsDropped` off the `onCellComplete(SweepCellResult)` callback, aggregates per mechanic, and writes `docs/ai/coverage/runtime-observed-hollows.json` via the locked deterministic serializer (sorted keys, closed-order `byReason`, sorted/bounded `examples`, `schemaVersion: 1`). The dashboard `/coverage` overlay + the build-time-copy (`build-coverage-ledger.mjs` → gitignored `src/data/runtime-observed-hollows.json`) consume it. WP-259 added a per-PR `sim:runtime-observed:check` step to the `hero-effect-coverage` CI job + the npm scripts.
- **WP-263 ✅ on `main`** — `createCompetentHeuristicPolicy` (`packages/game-engine/dist/simulation/ai.competent.js`) is the competent-play policy; the harness already imports the engine dist (the `hero-effect-coverage` / `hero-mechanic-ledger` precedent).
- **Empirically established at WP-259 execution (2026-06-18):** the random policy is passive (reveal/advance/endTurn only → 0 hollows); the competent-heuristic policy plays/recruits/fights (→ surfaces real hollows) but at 200 turns is multi-minute/game and all-hollow-hero decks never terminate. WP-264's `maxTurns` is the fix. A known-valid real board = `core/legacy-virus-the` + `core/dr-doom` + `core/brotherhood` + `core/savage-land-mutates` + `wwhk` HQ heroes (the most-`unsupported` set); `data/sweep-fixtures/setup.json`'s ids are NOT registry-valid (the sweep CLI uses `EMPTY_REGISTRY`).
- **Baseline:** drafted against `origin/main` @ `0a60968b` (`git rev-parse origin/main`).

## Context (Read First)

- `docs/ai/DECISIONS.md` — D-24035 (the WP-259 runtime-overlay decision incl. the **CI-affordability cron fallback** this realizes), D-24002 (`roadmap-counts` weekly-cron + bot-PR-on-drift), D-24040 (WP-264 `maxTurns`).
- `scripts/runtime-observed-hollows.mjs` (WP-259) — the harness to extend (the locked-matrix block + `buildPoliciesForCell` + `harvest` + the deterministic serializer + `--check`).
- `.github/workflows/roadmap-counts.yml` (D-24002 / D-14501) — the weekly-cron + `peter-evans/create-pull-request` bot-PR-on-drift pattern to mirror (review-gated; no auto-merge; `continue-on-error` on the regen step; visible-failure invariant — no exit-code-swallowing).
- `.github/workflows/ci.yml` — the `hero-effect-coverage` job carrying WP-259's per-PR `sim:runtime-observed:check` step (retired here).
- `apps/dashboard/src/pages/coverage/CoveragePage.vue` + `composables/useCoverageLedger.ts` (WP-259) — the overlay that renders the artifact, **unchanged** by this WP.

## Non-Negotiable Constraints

**Engine-wide:** Full file contents for every new/modified file — no diffs. ESM only, Node v22+. `00.6-code-style.md`. `node:test`; `.test.ts`. `pnpm`, not `npm`; `pwsh`, not bash.

**No engine edit:** `packages/**` diff is **EMPTY**. This packet consumes WP-264's already-merged `maxTurns` param + WP-263's channel; it adds no engine code. `data/cards/**` byte-unchanged.

**Determinism is load-bearing:** the competent-heuristic policy uses a **seeded** PRNG (`createCompetentHeuristicPolicy(seatSeed)`), so a fixed `runSeed` + bounded turns + a fixed matrix ⇒ a **byte-identical** artifact every run ⇒ the cron's regenerate-and-diff (and any `--check`) is exact. No `Math.random` / clock / network / timestamp in the harness; the one locked serializer path (sorted `byMechanic` keys, closed-order `byReason`, sorted-then-bounded `examples`, two-space indent, one trailing newline) is preserved verbatim from WP-259. The harness still **reads** `cell.hollowEffects` (WP-263) — it never re-detects.

**`summary.hollowEffectsDropped` MUST be `0` in the committed artifact:** bounded turns (WP-264) keep each game's hollow count well under `HOLLOW_EFFECTS_CAP = 256`; if the deeper matrix risks the cap, reduce the matrix or the per-game bound rather than commit a lower-bound undercount (the WP-259 / §Locked values guard, unchanged).

**Cron, not per-PR (the realized D-24035 fallback):** the competent-play sweep is heavier than a per-PR gate should carry, so its freshness lives in a **scheduled cron** (the D-24002 pattern). WP-259's per-PR `Runtime-observed hollows freshness` (`sim:runtime-observed:check`) step is **removed** from the `hero-effect-coverage` job. The cron is **review-gated** — it opens a bot PR on drift; it never commits to `main` and never auto-merges.

The regen step may be marked `continue-on-error: true` **only** so the workflow can still run its later diff / reporting / PR steps. That does **not** mean a failed regen is tolerated: the workflow must surface a regen failure in the job result (an explicit later failure / reporting step, or the run summary). No `|| true`, no shell exit-code swallowing, no pattern that hides a failed regeneration command — the D-24002 visible-failure invariant per the `roadmap-counts.yml` precedent.

**Execution-time locked values (the requirement, not the literals):** the exact `maxTurns`, the competent-play `runSeed`, the deeper scheme × mastermind matrix, and the board are **execution-time locked values** the executor SETS, RECORDS in `generatedFrom.matrixDescription`, and **scaffold-confirms by an observed run** that (a) surfaces ≥1 `byMechanic` entry (real signal), (b) keeps `hollowEffectsDropped` at `0`, and (c) is CI/cron-affordable (a few minutes, not hours). If no bounded matrix surfaces a hollow OR the run is unaffordable, STOP — that is a WP-264 / board-selection issue, not something to force.

**Dashboard source untouched:** the `/coverage` overlay code, types, composable, page, and build-copy script (WP-259) are **unchanged** — they already render whatever the artifact carries (real or zero). This packet modifies no tracked dashboard file: `apps/dashboard/src/**` and `apps/dashboard/scripts/**` tracked diff must be **empty**. Verification *does* run `node apps/dashboard/scripts/build-coverage-ledger.mjs`, which regenerates the **gitignored** dashboard-side copy at `apps/dashboard/src/data/runtime-observed-hollows.json` (confirmed gitignored). That copy is touched on disk but stays untracked / absent from `git diff --name-only` — so do not assert that all of `apps/dashboard/**` is byte-unchanged; assert the tracked `src/**` and `scripts/**` diff is empty.

## Scope (In)

### A) Harness — the competent-play bounded sweep
- `scripts/runtime-observed-hollows.mjs` — **modified**: switch the committed-artifact sweep to the **competent-heuristic** policy (`createCompetentHeuristicPolicy` from the engine dist), pass a bounded `maxTurns` (WP-264) into `sweepSetupMatrix`, and use the **deeper** scheme × mastermind matrix + the known-valid hollow-heavy board (the locked values, recorded in `generatedFrom.matrixDescription`). The deterministic serializer, the `cell.hollowEffects` read, the `byReason` closed order, the `--check` contract, and the `hollowEffectsDropped`-must-be-0 guard are all **preserved** from WP-259. (Whether this is a `--deep` flag with the random smoke retained for dev, or the new default, is an execution detail — the locked requirement is: the committed artifact is the competent-play real-signal output.)
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)**: now carries **real** `byMechanic` entries + a non-zero `summary` (with `hollowEffectsDropped: 0`).
- `package.json` (root) — **modified**: `sim:runtime-observed` writes the committed competent-play real-signal artifact. `sim:runtime-observed:check` **may remain** as a local / cron / debug deterministic freshness check — it is simply **no longer invoked by per-PR CI** (the per-PR retirement is a `ci.yml` change, §B; do not delete the script just because the per-PR step is gone). Any retained random-policy smoke script must be clearly named dev-only and must **not** be the committed-artifact path. The executor records the final script contract in the closeout notes.

### B) CI — retire the per-PR check, add the cron
- `.github/workflows/ci.yml` — **modified**: **remove** the `Runtime-observed hollows freshness` (`sim:runtime-observed:check`) step from the `hero-effect-coverage` job (WP-259's per-PR gate; superseded by the cron).
- `.github/workflows/runtime-observed-refresh.yml` — **new**: a weekly scheduled cron (`workflow_dispatch` + a `schedule` cadence) mirroring `roadmap-counts.yml` — `pnpm install` → `pnpm -r build` → run the harness (`--write`) under `continue-on-error` → detect a diff on `docs/ai/coverage/runtime-observed-hollows.json` → on diff, open a review-gated `bot/runtime-observed-refresh` PR (`peter-evans/create-pull-request`, `add-paths` scoped to the artifact, no auto-merge). Visible-failure invariant: no exit-code-swallowing.

## Out of Scope
- **The dashboard `/coverage` overlay / composable / types / build-copy** (WP-259) — unchanged; they already render the artifact.
- **WP-264 (the `maxTurns` engine param)** — its predecessor; consumed here, not modified (`packages/**` diff empty).
- **WP-260 (architect-lane intake)** — a separate consumer of the overlay rows.
- **A live in-match telemetry feed** (real-player hollow events) — the overlay is fed by the deterministic SIM sweep, not production matches (the WP-259 boundary).
- **Implementing any missing mechanic** — this makes the runtime gaps *visible with real counts*; filling them is the downstream Architect-lane work.
- **`data/cards/**`, the registry, the engine, the static `hero-effect-coverage` / `hero-mechanic-ledger` artifacts** — untouched.

## Files Expected to Change
- `scripts/runtime-observed-hollows.mjs` — **modified** — competent-heuristic + bounded-turn (WP-264) + deeper-matrix sweep; serializer / read / guards preserved.
- `docs/ai/coverage/runtime-observed-hollows.json` — **modified (regenerated)** — real signal; `hollowEffectsDropped: 0`.
- `package.json` (root) — **modified** — committed-artifact script (`sim:runtime-observed`) points to the competent-play sweep; per-PR CI no longer invokes `sim:runtime-observed:check` (the script may remain for local / cron / debug use).
- `.github/workflows/ci.yml` — **modified** — remove WP-259's per-PR `Runtime-observed hollows freshness` (`sim:runtime-observed:check`) step.
- `.github/workflows/runtime-observed-refresh.yml` — **new** — the weekly cron + review-gated bot-PR-on-drift (D-24002 pattern).

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-265 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-295 Done), `docs/ai/DECISIONS.md` (D-24041 → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-265 node + `node scripts/roadmap-counts.mjs --check`).

No other tracked files modified. `packages/**` diff empty; `data/cards/**` byte-unchanged; tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff empty. The generated dashboard-side copy `apps/dashboard/src/data/runtime-observed-hollows.json` remains gitignored / untracked.

## Contract

- **The committed artifact** keeps the WP-259 §Contract shape exactly (`schemaVersion: 1`, `generatedFrom { runSeed, gamesPlayed, matrixDescription }`, `summary { distinctMechanics, totalObservations, hollowEffectsDropped, byReason }`, `byMechanic { <mechanic>: { hitCount, lastSeenTurn, byReason, examples } }`) — only the **values** change from the WP-259 zero-state to real observed signal. Hard requirements on the committed artifact:
  - `Object.keys(byMechanic).length >= 1`
  - `summary.totalObservations >= 1`
  - `summary.distinctMechanics >= 1`
  - `summary.hollowEffectsDropped === 0`
  - `byReason` always carries the three closed WP-257 keys in the locked order: `no-handler`, `unsupported-keyword`, `parse-unrecognized`.
  - `generatedFrom.matrixDescription` records: policy (`competent-heuristic`), the fixed `runSeed`, `maxTurns`, the scheme IDs, the mastermind IDs, the villain / henchman board configuration, and the **explicit HQ hero IDs** — plus any execution-time matrix narrowing used to keep the run affordable and `hollowEffectsDropped: 0`. Do **not** record shorthand such as "wwhk heroes" as the only board description; reproducibility requires explicit IDs even though the final five-hero selection is an execution-time scaffold choice.
- **Determinism / drift-gate direction (unchanged from WP-259):** fixed seed + bounded matrix ⇒ byte-identical artifact; a mechanic newly appearing in `byMechanic` (or a `hitCount` rise) is the meaningful signal; a mechanic leaving (its handler implemented) is progress. The **cron** (not a per-PR gate) regenerates + diffs and opens a refresh PR on drift.
- **The cron** (`runtime-observed-refresh.yml`): weekly + `workflow_dispatch`; `permissions: contents: write, pull-requests: write`; regen under `continue-on-error` (visible-failure invariant, above); bot PR via `peter-evans/create-pull-request` scoped (`add-paths`) to `docs/ai/coverage/runtime-observed-hollows.json`, branch `bot/runtime-observed-refresh`, **review-gated** (no auto-merge, no direct commit to `main`). The create-PR step must be conditioned on an **artifact diff**, not on arbitrary workspace dirtiness. The PR body must include: the selected policy / seed / `maxTurns` / matrix description from the regenerated artifact; whether the regen command succeeded or failed; the artifact path that changed; and a reminder that the PR is review-gated and not auto-merged — enough context for a reviewer without opening the run logs.

## Acceptance Criteria

### A) Real-signal harness + artifact
- [ ] `scripts/runtime-observed-hollows.mjs` uses `createCompetentHeuristicPolicy` for the committed-artifact path and passes a bounded `maxTurns` (WP-264) into `sweepSetupMatrix`, sweeping the deeper matrix over the known-valid hollow-heavy board.
- [ ] The harness **reads** `cell.hollowEffects` / `cell.hollowEffectsDropped` (WP-263); it does **not** re-detect hollow mechanics from card text or outcomes; `packages/**` diff empty.
- [ ] The committed artifact has `schemaVersion: 1`, `Object.keys(byMechanic).length >= 1`, `summary.totalObservations >= 1`, `summary.distinctMechanics >= 1`, and `summary.hollowEffectsDropped === 0`. (If no bounded matrix surfaces a hollow at an affordable cost, STOP — board/`maxTurns` issue.)
- [ ] The WP-259 deterministic serializer is preserved: sorted `byMechanic` keys, closed-order `byReason`, sorted-then-bounded `examples`, two-space indent, one trailing newline.
- [ ] Two consecutive `pnpm sim:runtime-observed` runs with the same selected values produce a **byte-identical** artifact.
- [ ] `generatedFrom.matrixDescription` records policy (`competent-heuristic`), `runSeed`, `maxTurns`, the matrix, and **explicit board / HQ hero IDs** (no "wwhk heroes" shorthand).

### B) Cron + CI
- [ ] `.github/workflows/ci.yml` no longer invokes `sim:runtime-observed:check` in the per-PR `hero-effect-coverage` job.
- [ ] `.github/workflows/runtime-observed-refresh.yml` supports both `workflow_dispatch` and a weekly `schedule`.
- [ ] The refresh workflow installs, builds, regenerates the artifact, detects **artifact drift** (not arbitrary dirtiness), and opens a review-gated PR on branch `bot/runtime-observed-refresh` scoped to `docs/ai/coverage/runtime-observed-hollows.json` (the D-24002 pattern).
- [ ] The cron never commits directly to `main`, never auto-merges, and modifies no file beyond the artifact.
- [ ] Regen failure remains **visible** (explicit failure / reporting step or run summary); no `|| true` / exit-code-swallowing.

### C) Boundaries / unchanged surfaces
- [ ] `packages/**` diff empty (no engine edit); `data/cards/**` byte-unchanged.
- [ ] Tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff empty (the overlay renders the new values unchanged).
- [ ] `git diff --name-only` shows only the five Files Expected to Change + governance; the generated dashboard-side copy `apps/dashboard/src/data/runtime-observed-hollows.json` remains gitignored / untracked.

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

node apps/dashboard/scripts/build-coverage-ledger.mjs  # copies the real-signal artifact into the gitignored src/data
pnpm --filter @legendary-arena/dashboard test          # all pass (the overlay join still green with real data)
pnpm --filter @legendary-arena/dashboard typecheck     # vue-tsc 0

# Forbidden-scope guard: no engine / card / dashboard-src / dashboard-scripts change
git diff --name-only -- packages/ data/cards/ apps/dashboard/src/ apps/dashboard/scripts/   # empty
node scripts/roadmap-counts.mjs --check                # mindmap node counts in sync
```

Live (D-24026, **post-deploy**): on `dashboard.legendary-arena.com /coverage`, confirm the runtime-observed overlay now shows **real "Observed in play"** counts (a purple badge with a hitCount + reason) for ≥1 mechanic the sweep encountered as hollow — the zero-state empty state no longer applies to those rows. (Operator-viewed; the dashboard is Cloudflare-Access-gated, so bundle-content fetch is not available — see the dashboard memory.)

## Vision Alignment

**Vision clauses touched:** §20–§26 (scoring / PAR / **simulation** — fed by a deterministic competent-play sweep), §10 (card-content semantics — reports per-mechanic runtime coverage). **No conflict.** **Determinism preservation:** fixed seed + bounded matrix + seeded heuristic ⇒ reproducible, byte-identical artifact; the harness reads the engine's deterministic channel and adds no randomness/clock/network. **Non-Goal proximity:** an internal operator/diagnostics surface; not paid, persuasive, or competitive — none of NG-1..7 crossed.

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6:** PASS — 00.1 order; canonical names (`SweepCellResult`, `hollowEffects`, `hollowEffectsDropped`, `maxTurns`, `createCompetentHeuristicPolicy`, `runtime-observed-hollows.json`) match WP-259/263/264; `## Out of Scope` lists ≥2 excluded items; 5 files (tooling + CI), additive/regeneration.
- **§2 Constraints:** PASS — no engine edit (`packages/**` empty); determinism (seeded heuristic + bounded + fixed matrix ⇒ byte-identical; preserved serializer); `hollowEffectsDropped`-must-be-0 guard; cron-not-per-PR (the realized D-24035 fallback) + review-gated bot PR + visible-failure invariant; execution-time locked values (scaffold-confirmed: ≥1 mechanic, dropped 0, affordable).
- **§7 deps:** PASS — no new npm deps; the cron uses the same `peter-evans/create-pull-request` action as `roadmap-counts.yml`.
- **§8 architecture:** PASS — Shared Tooling + CI; reads the WP-263 channel; the engine never writes the artifact; the dashboard reads JSON; no upward/sideways import.
- **§9 Windows:** PASS — `pnpm`+`pwsh`; cross-platform `.mjs` + YAML. **§10 env / §11 auth:** N/A (the cron uses `GITHUB_TOKEN` via the standard action permissions; no app secrets).
- **§12 test quality:** PASS — the deterministic artifact + the dashboard overlay-join test (unchanged) are the regression gates; `node:test`; no `boardgame.io`/DB/network in tests.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands incl. dashboard `test`/`typecheck` + the empty-diff guards; binary criteria; DoD split pre-merge / post-deploy (D-24026).
- **§16 code style:** PASS — explicit `for...of` aggregation (preserved); full English words; `// why:` on the competent-policy + `maxTurns` choice, the seeded-determinism, and the cron-not-per-PR rationale.
- **§17 Vision:** Triggered (simulation + card-content coverage) → `## Vision Alignment` present + determinism line. No conflict.
- **§18 prose-vs-grep:** PASS — no count-bounded grep gate. **§19 bridge-vs-HEAD:** N/A. **§20 funding:** N/A. **§21 API catalog:** N/A — no HTTP endpoint / `apps/server` library function (the cron is a CI workflow; the harness is Shared Tooling).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (baseline `0a60968b`).** **Class:** Infrastructure & Verification (a tooling/CI change; no gameplay mutation, no engine edit). **Deps on `main`:** WP-264 (`maxTurns`), WP-259 (the harness + artifact + overlay + the per-PR step retired), WP-263 (the channel), the D-24002 cron pattern — all verified on `main`. **Contract fidelity:** the artifact shape + serializer + `cell.hollowEffects` read + the `hollowEffectsDropped`-0 guard are reused verbatim from WP-259; only the policy/`maxTurns`/matrix change (the values). **Empirical Scaffold (`01.4`):** the one genuinely execution-only unknown — the exact `maxTurns` / seed / matrix that surface ≥1 real mechanic at an affordable, byte-stable, `dropped: 0` cost — is **explicitly deferred to an observed scaffold run** (the WP/EC lock the requirement, not the literals; this is the honest reason READY does not pre-fill them). The empirical reality that motivates the whole packet (random = passive 0-signal; heuristic = real signal but needs WP-264 bounding) was **observed at WP-259 execution** and is recorded in §Assumes. **Risks resolved + locked.**
- **Copilot (`01.7`): PASS / CONFIRM.** **Cat-1 (Boundaries):** Shared Tooling + CI; `packages/**` empty; engine emits, tooling consumes, dashboard reads. **Cat-2 (Determinism):** seeded heuristic + bounded turns + fixed matrix ⇒ byte-identical; preserved serializer; no `Math.random`/clock/network in the harness. **Cat-5 (Persistence):** reads the runtime-only channel; the artifact is a derived committed record; the cron's bot PR is review-gated. **Cat-6 (Testing):** the deterministic artifact + the unchanged overlay-join test; the `dropped: 0` + byte-identical-re-run gates. **Cat-8 (Extensibility):** realizes the WP-259 cron fallback; the overlay is unchanged. The one open judgment — affordability of the bounded heuristic sweep — is the scaffold-confirmed execution unknown, bounded by WP-264 + the STOP-if-unaffordable clause → CONFIRM.

> **Drafting status (per 01.0a):** WP + EC-295 written; pre-flight READY; copilot CONFIRM; lint 21/21; D-24041 reserved; session prompt written. **Sequencing:** WP-264 must land first (the harness passes its `maxTurns`); then WP-265.

## Executor Stop Conditions

STOP and return for packet revision if any of the following is required to proceed:

- editing `packages/**`;
- editing `data/cards/**`;
- editing a tracked dashboard source or script file (`apps/dashboard/src/**`, `apps/dashboard/scripts/**`);
- adding a dependency;
- committing an artifact with `byMechanic = {}` (zero-state) or `summary.hollowEffectsDropped > 0` (undercount);
- using unseeded randomness, clock time, network data, timestamps, or unordered serializer output anywhere on the artifact path;
- making the runtime-observed sweep a per-PR gate again;
- creating a cron that commits directly to `main`, auto-merges, hides regen failure, or opens a PR touching files outside `docs/ai/coverage/runtime-observed-hollows.json`.

Do not force a zero artifact, commit an undercount, modify the engine, or broaden scope to get past any of these — each is a boundary that means the packet (or a predecessor) needs revision, not a workaround.

## Definition of Done

### Pre-merge Done
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm sim:runtime-observed` writes a real-signal artifact (≥1 `byMechanic`, `hollowEffectsDropped: 0`), byte-identical on re-run; dashboard `test` 0; dashboard `typecheck` 0
- [ ] `packages/**` diff empty; `data/cards/**` byte-unchanged; tracked `apps/dashboard/src/**` and `apps/dashboard/scripts/**` diff empty
- [ ] WP-259's per-PR `Runtime-observed hollows freshness` (`sim:runtime-observed:check`) step removed; `runtime-observed-refresh.yml` cron added (review-gated bot PR; `continue-on-error` regen with visible-failure surfacing; no exit-swallowing)
- [ ] No files outside `## Files Expected to Change` modified (the gitignored `apps/dashboard/src/data/runtime-observed-hollows.json` copy correctly absent from the diff)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-265 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-295 Done; `docs/05-ROADMAP-MINDMAP.md` WP-265 node; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/DECISIONS.md` D-24041 → Active
- [ ] `docs/ai/STATUS.md` records the change with **D-24026 pending deploy verification** (the overlay flips to real signal)

### Post-deploy Done (D-24026)
- [ ] On `dashboard.legendary-arena.com /coverage` (post-deploy): the runtime-observed overlay shows **real "Observed in play"** counts for ≥1 sweep-encountered hollow mechanic (operator-viewed — CF-Access-gated)
- [ ] `docs/ai/STATUS.md` updated with the **deployed evidence** (only now is D-24026 satisfied)
