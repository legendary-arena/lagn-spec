# EC-267 — Full-Corpus Sweep Expansion (Execution Checklist)

**Source:** docs/ai/work-packets/WP-234-full-corpus-sweep-expansion.md
**Layer:** Shared Tooling / CI (`scripts/sweep-*.mjs`, `data/sweep-fixtures/**`, `.github/workflows/sweep-weekly.yml`, root `package.json`). No Game Engine / Registry / Server runtime change.

> Use locked values from WP-234 verbatim. EC-267 is the operational order +
> gates + failure smells; if EC-267 and WP-234 conflict, WP-234 wins.

## Before Starting
- [ ] **WP-209 landed.** `scripts/sweep-setup-matrix.mjs` + `scripts/sweep-submit.mjs` + `.github/workflows/sweep-nightly.yml` + the 2×2 fixtures present; `POST /api/sweep/runs` reachable.
- [ ] **Engine reuse present:** `@legendary-arena/game-engine` exports `parseManifestLine` + `classifyManifestRecords` (the combine script imports them; no new engine symbol).
- [ ] **Corpus shape:** `data/cards/*.json` carry `schemes[].ext_id` (191) + `masterminds[].ext_id` (106) — confirm cardinalities before locking the cycle math.
- [ ] Read WP-234 §Goal, §Locked Contract Values, §Scope (In/Out), §Acceptance Criteria.
- [ ] `pnpm -r build` + `pnpm --filter @legendary-arena/server test` exit 0 (anchor baseline; note pre-existing case count).

## Locked Values (verbatim from WP-234 — do not re-derive)
- **Window:** `SCHEMES_PER_WINDOW = 20` (20 schemes × all 106 masterminds = ≤ 2,120 cells). `CYCLE_LENGTH = 10`. `windowIndex = isoWeek mod 10`; `schemeOffset = windowIndex * 20`. Last window (index 9 → [180, 191)) = 11 schemes.
- **Shards:** `SHARD_COUNT = 4`, `SCHEMES_PER_SHARD = 5`. Shard `k` → `--scheme-offset (schemeOffset + k*5) --scheme-limit 5`, clamped to the axis end (over-offset shard ⇒ empty 0-cell manifest, NOT an error).
- **Axis-slice flags:** `--scheme-offset N` (default 0) + `--scheme-limit M` (default = scheme-axis length) select `schemeIds[N : N+M]` of the committed `scheme-ids.full.json` order; the **mastermind axis is always full**. Both omitted ⇒ full scheme axis (daily smoke byte-identical). `cellCount` = sliced-scheme-length × mastermind-length.
- **Canonical order:** rotation/shard coordinates index into the committed `scheme-ids.full.json` array (ascending unique ext_id). Its order is a locked contract — a reorder shifts coverage. `sweep-generate-full-axis.mjs` emits ascending-sorted unique arrays.
- **Seed / policy:** `--seed weekly` (distinct from daily `nightly`; per-cell seed chain D-19402 reused), `--policy random`.
- **Plan + topology (locked):** the rotation/shard math + the constants live ONLY in `scripts/sweep-weekly-plan.mjs` (`computeWeeklyPlan(isoWeek, axisLen)` → `{windowIndex, schemeOffset}`; `computeShardSlice(schemeOffset, shardIndex)` → `{schemeOffset, schemeLimit}`); the workflow's `plan` job evaluates them ONCE (sole `date -u +%V` read) + derives `run_id_base` once, and outputs `window_index`/`scheme_offset`/`run_id_base` to the `sweep` matrix + `combine`. NO per-shard date recompute, NO YAML-bash arithmetic.
- **Entry-point guard (locked):** `sweep-setup-matrix.mjs`'s trailing `main()` is wrapped in `if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)` so `import { selectSchemeWindow }` has no side effect (the test imports it).
- **Submit:** combine asserts exactly `SHARD_COUNT` (4) manifests present (fewer ⇒ exit 3, no POST), sorts records by `(schemeId ASC, mastermindId ASC)` (deterministic `manifestBlob`), **rejects an over-5 MB serialized payload pre-POST** (exit 4, loud — never a server 413), then POSTs ONE run to `${API_BASE_URL}/api/sweep/runs` with `X-Sweep-Token` ↔ `SWEEP_SUBMIT_TOKEN`; runId `<shortSha>-<compactTimestampUtc>-weekly-w<windowIndex>` (base mirrors `sweep-submit.mjs`; `-weekly` disjoint from daily; `-w<windowIndex>` audits the rotation; no `Math.random()`; a same-second collision is a safe 409). `{ runId, startedAt, cellCount, anomalyCounts, manifestBlob }`. Exit 0 (2xx) / 2 (config-env) / 3 (manifest / classify / shard-count) / 4 (network / non-2xx / oversize).
- **Schedule:** `sweep-weekly.yml` `cron '0 8 * * 0'` (Sunday 08:00 UTC) + `workflow_dispatch`; THREE jobs `plan` → `sweep` (`needs: plan`) → `combine` (`needs: [plan, sweep]` **AND** explicit `if: ${{ needs.sweep.result == 'success' }}`, no partial submit). Daily `sweep-nightly.yml` `cron '0 7 * * *'` byte-unchanged; `inspection-nightly.yml` byte-unchanged (weekly NOT triaged — §Out of Scope).
- **ISO week (locked):** `WEEK=$(date -u +%V)` (GNU coreutils, zero-padded 01–53), parsed **base-10** in `sweep-weekly-plan.mjs` (`parseInt(value, 10)`) — never octal (`08`/`09` must not error). Week 52/53→01 rollover accepted (approximate rotation).
- **Artifact layout (locked):** shard `k` → `actions/upload-artifact@v4` `sweep-shard-<k>` carrying `sweep-output/<run-id>/manifest.jsonl`; combine `actions/download-artifact@v4` `pattern: sweep-shard-*` with **NO** `merge-multiple` (own-subdir per artifact so the 4 identically-named manifests never collide). A 0-cell (clamped tail) shard MUST still write + upload a valid empty `manifest.jsonl`; combine processes it without error.
- **max-cells invariant (locked):** `--max-cells` stays 10000; after slicing every shard has `cellCount ≤ 10000` (≤ 530). Raising `SCHEMES_PER_WINDOW`/`SHARD_COUNT` past this needs a successor D-entry.
- **Determinism boundary (locked):** the ISO-week wall-clock read is ONLY in the CI/workflow layer; NO wall-clock value reaches the engine, seed derivation, or simulation inputs (per-cell determinism = D-19402 seed chain alone).
- **Fixtures (locked):** `scheme-ids.full.json` (191) + `mastermind-ids.full.json` (106); `collectSortedUniqueExtIds` extracts `schemes[].ext_id`/`masterminds[].ext_id`, exact-match dedupe, ascending lexicographic sort, serialized `JSON.stringify(array, null, 2) + '\n'`. Byte-deterministic; comparator/serialization/key change needs a successor D-entry.

## Guardrails
- **Additive-only on the daily smoke.** `scripts/sweep-submit.mjs`, `.github/workflows/sweep-nightly.yml`, `data/sweep-fixtures/{setup,scheme-ids,mastermind-ids}.json` are byte-unchanged. D-20704 stays the daily lock.
- **No engine / server / dashboard / migration edit.** The only file under `apps/`/`packages/` is the new `apps/server/scripts/sweep-weekly-submit.test.ts`. The combine script imports the EXISTING engine `parseManifestLine`/`classifyManifestRecords` — it adds no engine symbol.
- **Mastermind axis is never sliced** — only the scheme axis carries the offset/limit window. Rotation is by scheme-slice, NOT a flat cell-index stride.
- **`cellCount` is computed from the SLICED scheme length** so `--max-cells` (default 10000) + the soft-warning threshold see the per-shard count (≤ 530), not the full 20,246 corpus. No `--max-cells` change needed.
- **Canonical scheme-axis order is load-bearing** — reordering `scheme-ids.full.json` silently shifts which cells each window/shard covers. Emit ascending-sorted unique; a `// why:` documents the lock.
- **One submit per weekly run** — the combine job carries `needs: sweep` AND explicit `if: ${{ needs.sweep.result == 'success' }}`; it asserts exactly 4 manifests present (else exit 3, no POST), concatenates + sorts by `(schemeId, mastermindId)`, and POSTs ONE run. A failed shard fails the weekly run; no partial submit.
- **Reuse `sweep-submit.mjs`'s parse → classify → POST flow + exit codes (2/3/4)** in the combine script — do NOT re-implement the classifier or invent a new exit-code scheme.
- **Weekly is NOT triaged in v1.** `inspection-nightly.yml` is byte-unchanged — the new `Sweep Weekly` workflow does NOT trigger Inspector triage; the weekly feeds `sweep_runs` (dashboard/trend) only. Do NOT add a `workflow_run` trigger for it (the WP-233 cell-coverage interaction is a deferred follow-up — §Out of Scope).
- **Rotation math lives ONLY in `sweep-weekly-plan.mjs`** (single source, unit-tested) — never duplicate the formula as YAML bash arithmetic; the `plan` job is the sole wall-clock read + `run_id_base` derivation.
- **No new npm dep; no new sweep token; no `render.yaml` / `.env.example` change.** Built-in `fetch` + `node:*` + the existing engine import only. Full file contents for every new/modified file — diffs/snippets forbidden.
- **No `.reduce()`** in `selectSchemeWindow` / `collectSortedUniqueExtIds` / `concatenateShardManifests` / `computeWeeklyPlan` / `computeShardSlice` — explicit `for...of` / `.slice()` / `.sort()`.

## Required `// why:` Comments
- `scripts/sweep-setup-matrix.mjs` (canonical order) — the committed `scheme-ids.full.json` array order is the rotation/shard coordinate system; reordering it shifts which cells a window covers, so the file order is a locked contract (D-23401). Paraphrase any policed grep token per EC-TEMPLATE §grep-gate prose discipline.
- `scripts/sweep-setup-matrix.mjs` (entry-point guard) — wrap the trailing `main()` in `if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)` so the unit test can `import { selectSchemeWindow }` without executing `main()` (the `handoffs-sync.mjs` pattern); behavior-preserving for the CLI.
- `scripts/sweep-weekly-submit.mjs` (single-submit) — the combine job concatenates the sharded manifests into ONE classified `POST /api/sweep/runs`; the per-shard runIds are throwaway, the weekly run carries one `-weekly-w<windowIndex>`-suffixed id so it never 409s against the daily id space + records the rotation window (D-23402).
- `.github/workflows/sweep-weekly.yml` (window selection) — `windowIndex = isoWeek mod 10` is computed ONCE in the `plan` job (the sole `date -u +%V` read), NOT engine logic; per-cell determinism stays in the seed chain (D-23401, determinism boundary).

## Files to Produce
- `scripts/sweep-setup-matrix.mjs` — **modified** (additive `--scheme-offset`/`--scheme-limit` + `selectSchemeWindow` + `main()` entry-point guard).
- `scripts/sweep-weekly-plan.mjs` — **new** (single source of the rotation/shard math + locked constants; exports `computeWeeklyPlan` / `computeShardSlice`; CLI emits `GITHUB_OUTPUT`).
- `scripts/sweep-generate-full-axis.mjs` — **new** (regenerate fixtures; exports `collectSortedUniqueExtIds`).
- `scripts/sweep-weekly-submit.mjs` — **new** (fan-in combine + classify + body-cap guard + submit; exports `isWeeklySubmitEnvComplete` / `concatenateShardManifests` / `isWithinBodyCap`).
- `apps/server/scripts/sweep-weekly-submit.test.ts` — **new** (≥ 8 cases: env guard; slice math incl. clamped + empty slice; `computeWeeklyPlan` rotation + `computeShardSlice`; sort/dedup; concat with empty-manifest + order-independence; shard-count-mismatch ⇒ no-POST exit 3; body-cap accept/reject; globbed by the server suite; imports `../../../scripts/`).
- `data/sweep-fixtures/scheme-ids.full.json` — **new** (191, sorted unique).
- `data/sweep-fixtures/mastermind-ids.full.json` — **new** (106, sorted unique).
- `.github/workflows/sweep-weekly.yml` — **new** (weekly plan → sharded sweep → combine).
- `package.json` — **modified** (3 root scripts: `sweep:generate-axis`, `sweep:weekly-plan`, `sweep:weekly-submit`).
- `docs/ai/DECISIONS.md` — **modified** (D-23401 + D-23402 Active).
- `docs/ai/STATUS.md` — **modified**.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** (WP-234 `[x]`).
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** (EC-267 → Done).

**Total: 13 files** (6 new source/data + 1 new workflow + 2 modified source/config + 4 governance).

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0; ≥ 8 net-new cases (incl. empty-slice, plan rotation + shard-slice, concat order-independence, shard-count-mismatch ⇒ exit 3, body-cap accept/reject); NO pre-existing case regresses.
- [ ] Daily smoke byte-unchanged: `git diff --name-only scripts/sweep-submit.mjs .github/workflows/sweep-nightly.yml .github/workflows/inspection-nightly.yml data/sweep-fixtures/setup.json data/sweep-fixtures/scheme-ids.json data/sweep-fixtures/mastermind-ids.json` empty (incl. inspection — weekly NOT triaged).
- [ ] Fixtures: `scheme-ids.full.json` length 191, `mastermind-ids.full.json` length 106; `pnpm sweep:generate-axis` then `git diff data/sweep-fixtures/` empty (byte-deterministic regeneration).
- [ ] Entry-guard: `grep -n "import.meta.url === pathToFileURL" scripts/sweep-setup-matrix.mjs` ≥ 1 (the test imports `selectSchemeWindow` without running `main()`). Slice flags `grep -n "--scheme-offset\|--scheme-limit\|selectSchemeWindow" scripts/sweep-setup-matrix.mjs` ≥ 3.
- [ ] Plan script: `grep -n "computeWeeklyPlan\|computeShardSlice\|GITHUB_OUTPUT" scripts/sweep-weekly-plan.mjs` ≥ 3; rotation/clamp unit-tested.
- [ ] Weekly workflow: `cron '0 8 * * 0'`; THREE jobs `plan → sweep (needs: plan, matrix shard 0–3) → combine (needs: [plan, sweep] + explicit if: needs.sweep.result == 'success')`; the `plan` job is the SOLE `date -u +%V` read; download `pattern: sweep-shard-*` with NO `merge-multiple`; each shard `--seed weekly --policy random` + full axis fixtures + plan-derived slice; a 0-cell shard still writes an empty `manifest.jsonl`.
- [ ] Combine submit: asserts exactly 4 manifests (else exit 3, no POST); sorts records by `(schemeId, mastermindId)`; rejects an over-5 MB payload pre-POST (exit 4); runId ends `-weekly-w<windowIndex>`; reuses `classifyManifestRecords` + `POST /api/sweep/runs` + `X-Sweep-Token`; exit 0/2/3/4.
- [ ] Scope: `git diff --name-only` lists only the 13 Files-to-Produce; no `apps/dashboard/**`, `apps/server/src/**`, `packages/game-engine/**`, `data/migrations/**`, `render.yaml`, `.env.example`, `inspection-nightly.yml`; no new npm deps.
- [ ] `STATUS.md`, `DECISIONS.md` (D-23401..02 Active), `WORK_INDEX.md` (WP-234 `[x]`), `EC_INDEX.md` (EC-267 Done) updated.

## Common Failure Smells
- Slicing or windowing the **mastermind** axis → only the scheme axis carries the rotation/shard window.
- Computing `cellCount` from the FULL axis instead of the slice → trips `--max-cells` / soft-warning on the 20,246 corpus when only ~530 cells run per shard.
- A flat `(cellIndex mod N)` stride instead of a contiguous scheme-slice → loses the clean per-scheme tiling + intuitive "this week sweeps schemes A–B" coverage.
- Reordering `scheme-ids.full.json` (or emitting it unsorted) → silently shifts coverage; the order is a locked rotation coordinate.
- Re-implementing the classifier / a new exit-code scheme in the combine script → reuse `classifyManifestRecords` + the `sweep-submit.mjs` 2/3/4 mapping.
- Editing `sweep-submit.mjs` / `sweep-nightly.yml` / the 2×2 fixtures → additive-only; those are the WP-209/D-20704 daily lock.
- A new sweep token / `render.yaml` / `.env.example` change → the weekly sweep reuses `SWEEP_SUBMIT_TOKEN`.
- Submitting one run per shard (4 runs/week) instead of one combined run → the combine job fans in to a single `POST /api/sweep/runs`.
- Treating the `date -u +%V` window read as an engine-determinism violation → it is a CI scheduling concern in the YAML/tooling layer, outside the engine boundary.
- Bash `$((WEEK % 10))` without the `10#` prefix → `08`/`09` parse as octal and error; always `$((10#$WEEK % 10))`.
- Relying on `needs: sweep` alone without the explicit `if: ${{ needs.sweep.result == 'success' }}` → the no-partial-submit gate isn't grep-observable; add both.
- Concatenating shard manifests WITHOUT the `(schemeId, mastermindId)` sort → `manifestBlob` ordering becomes shard-download-order-dependent (nondeterministic across runs).
- Skipping the exactly-4-manifests assert → an artifact download glitch silently submits a partial sweep; assert + exit 3 (no POST).
- A 0-cell clamped shard that writes NO `manifest.jsonl` → the artifact upload / combine glob breaks; the matrix script must create the empty file.
- Adding a `Math.random()` suffix to the runId → injects nondeterminism + diverges from the `sweep-submit.mjs` form; mirror it verbatim (a same-second collision is a safe 409).
- Exporting `selectSchemeWindow` from `sweep-setup-matrix.mjs` WITHOUT wrapping `main()` in an entry-point guard → importing it in the test runs `main()` (throws on missing `--run-id`); add the `import.meta.url === pathToFileURL(...)` guard.
- Leaving the rotation/shard math as YAML bash → untestable + re-derived per shard; put it in `sweep-weekly-plan.mjs` and have the `plan` job compute it once.
- `actions/download-artifact@v4` with `merge-multiple: true` → flattens the 4 identically-named `manifest.jsonl` into one path (clobber); use `pattern: sweep-shard-*` with own-subdir layout.
- POSTing the combined `manifestBlob` without a pre-POST 5 MB size check → a 2,120-cell blob can hit the body cap as a server 413; guard with `isWithinBodyCap` → exit 4 with a clear message.
- Wiring the weekly into Inspector triage (a `workflow_run` trigger) → out of scope + opens the WP-233 cross-cadence false-resolution gap; v1 weekly feeds `sweep_runs` only.

---

## DECISIONS.md Entries (D-23401..D-23402)

Reserved verbatim in `docs/ai/DECISIONS.md` (full text there; `Reserved (proposed)`
at draft → `Active` at execution close): **D-23401** — weekly per-scheme rotating
window (successor to D-20704; daily 2×2 smoke unchanged). **D-23402** — sharded
plan → fan-out (4 shards) → fan-in combine → single submit topology.
