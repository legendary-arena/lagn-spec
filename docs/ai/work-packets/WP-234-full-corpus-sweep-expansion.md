# WP-234 — Full-Corpus Sweep Expansion (Weekly Rotating Window Beyond the 2×2 Smoke)

**Status:** Draft
**Primary Layer:** Shared Tooling / CI (`scripts/sweep-*.mjs`, `data/sweep-fixtures/**`, `.github/workflows/sweep-weekly.yml`, root `package.json`). No Game Engine / Registry / Server runtime change — the sweep runner + classifier + `POST /api/sweep/runs` endpoint already exist and are reused unchanged.
**Dependencies:** WP-209 (`scripts/sweep-submit.mjs` + `scripts/sweep-setup-matrix.mjs` + `sweep-nightly.yml` + `POST /api/sweep/runs` + the engine `parseManifestLine` / `classifyManifestRecords`) ✅, WP-194 (the setup-matrix runner + per-cell seed chain D-19402) ✅, WP-195 (the manifest anomaly classifier) ✅. Parallel-safe with WP-231/232/233 (it expands the sweep cron; it touches no dashboard/handoff/inspection file).

---

## Session Context

The nightly sweep (WP-209) runs a deliberately tiny **2×2 smoke** — 4 cells
(2 schemes × 2 masterminds), locked by D-20704 — whose intent is "did anything
fundamentally break since yesterday?" in < 60s of wall-clock. D-20704 explicitly
deferred "the full ~32×32 corpus" to "a future hardening WP" and required a
successor D-entry for any cardinality change. **This packet is that WP.**

The real corpus is larger than D-20704's estimate: as of 2026-06-10 (40 sets)
there are **191 schemes × 106 masterminds = 20,246 cells** in the full
cross-product — 20× the ~1,024 the WORK_INDEX placeholder assumed, and 2× the
matrix runner's current `--max-cells` 10000 cap. A naive nightly full sweep would
cost hours of wall-clock and ~600k manifest records/month. So this WP does **not**
sweep the whole corpus every run; it adds a **weekly** sweep that covers a
**rotating ≤ 2,120-cell window** (20 schemes × all masterminds), advancing through
the scheme axis so the full 20,246-cell corpus is covered over a **10-run cycle**.
The window is **sharded** across parallel GitHub-hosted matrix jobs and a fan-in
job combines the shard manifests into a single `POST /api/sweep/runs`.

Operator decisions (2026-06-10): **sharded rotating budget** (~2,000 cells/run,
not the full 20,246 per run, not a per-set-only subset); **GitHub-hosted matrix
shards** (not self-hosted, not a single sequential job); **weekly full + keep the
daily 2×2 smoke** (the daily `sweep-nightly.yml` is byte-unchanged).

Baseline: `origin/main @ 92fa31a` (WP-233 / EC-265 closed-loop sweep verification landed 2026-06-10).

---

## Goal

After this session the repo runs a **weekly** sweep (`.github/workflows/sweep-weekly.yml`,
Sunday 08:00 UTC + `workflow_dispatch`) covering a rotating window of the
full Scheme × Mastermind corpus, **in addition to** the unchanged daily 2×2
smoke. Each weekly run sweeps the week's 20-scheme window (≤ 2,120 cells) against
all 106 masterminds, split across **4 GitHub-hosted matrix shards** (5 schemes
each); a fan-in **combine** job concatenates the 4 shard manifests, classifies the
combined result via the existing WP-195 analyzer, and submits **one** run to the
existing `POST /api/sweep/runs`. The window advances by `isoWeek mod 10`, so all
191 schemes (the full 20,246-cell corpus) are swept over a 10-week cycle. The
operator dashboard sees the weekly runs through the unchanged
`GET /api/sweep/latest` / `GET /api/sweep/runs/latest` read paths.

---

## Assumes

- WP-209 complete. Specifically:
  - `scripts/sweep-setup-matrix.mjs` enumerates the `schemeId × mastermindId` cross-product from `--scheme-ids` / `--mastermind-ids` axis files, dispatches `sweepSetupMatrix` per cell, appends one canonical-JSON line per cell to `sweep-output/<run-id>/manifest.jsonl`, is resume-idempotent on the `(schemeId, mastermindId)` key, and validates `cellCount <= --max-cells` (default 10000).
  - `scripts/sweep-submit.mjs` derives a `<shortSha>-<compactTimestampUtc>` runId, invokes the matrix runner, parses the manifest via the engine `parseManifestLine`, classifies via the engine `classifyManifestRecords`, and POSTs `{ runId, startedAt, cellCount, anomalyCounts, manifestBlob }` to `${API_BASE_URL}/api/sweep/runs` with `X-Sweep-Token` (exit 0/2/3/4).
  - `.github/workflows/sweep-nightly.yml` runs `pnpm -r build` then `pnpm sweep:nightly` on `ubuntu-latest`, `cron '0 7 * * *'`.
  - The 2×2 fixtures live at `data/sweep-fixtures/{setup.json,scheme-ids.json,mastermind-ids.json}` (D-20704).
- WP-194 / WP-195 complete. The per-cell seed chain (`${runSeed}::cell:${schemeId}:${mastermindId}`, D-19402) and the `classifyManifestRecords` analyzer are reused unchanged.
- `@legendary-arena/game-engine` exports `parseManifestLine` + `classifyManifestRecords` (the submit + combine scripts import them; no new engine symbol).
- `POST /api/sweep/runs` accepts `cellCount` up to 10000 and a 5 MB body (api-endpoints catalog, WP-209). A 2,120-cell combined manifest blob is well under both caps.
- `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL` GitHub Actions secrets exist (reused — no new secret, no `render.yaml` / `.env.example` change).
- `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 (the harness baseline; this WP adds no server test but server-suite-globbed `.test.ts` files under `apps/server/scripts/` may carry the new script's helper tests).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

- `scripts/sweep-setup-matrix.mjs` — read entirely. WP-234 adds the additive `--scheme-offset` / `--scheme-limit` axis-slice flags; the cross-product enumeration, seed chain, resume skip-set, manifest format, and `--max-cells` guard are reused unchanged.
- `scripts/sweep-submit.mjs` — read entirely. The weekly combine script (`scripts/sweep-weekly-submit.mjs`) reuses its parse → classify → POST flow and its 2/3/4 exit-code discipline, reading a **pre-built combined manifest** instead of invoking the runner itself. `sweep-submit.mjs` is byte-unchanged.
- `.github/workflows/sweep-nightly.yml` — the daily smoke. WP-234 adds a **separate** `sweep-weekly.yml`; the nightly file is byte-unchanged.
- `data/sweep-fixtures/` — the committed 2×2 axis. WP-234 adds `scheme-ids.full.json` (191) + `mastermind-ids.full.json` (106); the `setup.json` envelope is reused; the 2-entry `scheme-ids.json` / `mastermind-ids.json` smoke fixtures are byte-unchanged.
- `docs/ai/DECISIONS.md` D-20704 (2×2 smoke lock — stays the DAILY lock), D-19402 (seed chain), D-19403 (`sweep-output/` gitignored + ephemeral), D-20701/D-20702 (sweep storage + auth), D-19502 (anomaly 4-class taxonomy) — carry forward; do not re-derive.
- `docs/ai/REFERENCE/00.6-code-style.md` (Rules 4 / 6 / 8 / 9 / 11 / 14) + `00.1-master-coordination-prompt.md`.

---

## Scope (In)

### A) Matrix runner axis-slice flags (`scripts/sweep-setup-matrix.mjs`)

- **Additive**: two optional flags `--scheme-offset N` (default 0) and `--scheme-limit M` (default = the loaded scheme-axis length). After `validateAxisArray` loads the scheme axis, the script slices it to `schemeIds.slice(offset, offset + limit)` **before** the cross-product; the mastermind axis is always used in full. `cellCount` is computed from the **sliced** scheme length (so `--max-cells` and the soft-warning threshold see the per-run/per-shard count, not the full corpus). Omitting both flags is byte-equivalent to today's behavior (the daily smoke is unaffected). Offset/limit are validated as non-negative integers; `offset >= schemeIds.length` yields an empty slice → 0 cells → the script still **creates an empty `manifest.jsonl`** (so every clamped shard uploads a valid artifact; not an error). No `.reduce()`; explicit slicing + a pure `selectSchemeWindow(schemeIds, offset, limit)` helper.
- **Additive (testability fix)**: wrap the module's existing unconditional `main().catch(...)` call (currently the last statement of the file) in an **entry-point guard** — `if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) { main().catch(...) }` (the `scripts/handoffs-sync.mjs` pattern). Without it, the unit test's `import { selectSchemeWindow } from '.../sweep-setup-matrix.mjs'` executes `main()` on import (which throws on the missing `--run-id`), so the helper is untestable. The guard is behavior-preserving for the CLI (the workflow still runs it as the process entry point).
- **Required**: a `// why:` documenting that the canonical scheme-axis ORDER (the committed `scheme-ids.full.json` array order) is the rotation/shard coordinate system — reordering the axis file shifts which cells a window covers, so the file order is a locked contract.

### B) Full-corpus axis fixtures (`data/sweep-fixtures/`)

- **New** `scheme-ids.full.json` — the 191 scheme ext_ids, **sorted ascending, unique** (the canonical rotation order). **New** `mastermind-ids.full.json` — the 106 mastermind ext_ids, sorted ascending, unique.
- **New** `scripts/sweep-generate-full-axis.mjs` — regenerates both fixtures from `data/cards/*.json` (`schemes[].ext_id` / `masterminds[].ext_id`, exact-string-match dedupe, **ascending lexicographic sort**, serialized `JSON.stringify(array, null, 2) + '\n'` — 2-space indent, trailing newline, no trailing spaces). Run by the operator when a set is added; emits byte-deterministic fixtures. Exports a pure `collectSortedUniqueExtIds(setFiles, key)` helper for unit testing.

### C) Weekly sharded sweep + plan + combine (`scripts/sweep-weekly-*.mjs` + workflow)

- **New** `scripts/sweep-weekly-plan.mjs` — the SINGLE source of the rotation/shard math (removes the untested YAML-bash arithmetic; one evaluation site, not 4 per-shard recomputes). Owns the locked constants `SCHEMES_PER_WINDOW = 20`, `CYCLE_LENGTH = 10`, `SHARD_COUNT = 4`, `SCHEMES_PER_SHARD = 5`. Exports pure helpers `computeWeeklyPlan(isoWeek, schemeAxisLength)` → `{ windowIndex, schemeOffset }` (`windowIndex = isoWeek mod CYCLE_LENGTH`, `schemeOffset = windowIndex * SCHEMES_PER_WINDOW`) and `computeShardSlice(schemeOffset, shardIndex)` → `{ schemeOffset: schemeOffset + shardIndex * SCHEMES_PER_SHARD, schemeLimit: SCHEMES_PER_SHARD }`. Its CLI (entry-guarded) parses `--iso-week` / `--shard-index` / `--scheme-axis-length` and writes the computed values to `GITHUB_OUTPUT` (`window_index`, `scheme_offset`, `scheme_limit`). No `.reduce()`; `parseInt(isoWeek, 10)` (base-10, never octal).
- **New** `scripts/sweep-weekly-submit.mjs` — the fan-in combine + submit. Reads every `manifest.jsonl` beneath a `--manifests-dir <dir>` (the downloaded shard artifacts); **asserts exactly `SHARD_COUNT` (4) manifest files are present** (fewer ⇒ exit 3, no POST — defense-in-depth over the workflow's success gate); concatenates the parsed records + malformed lines, **sorts the records by `(schemeId ASC, mastermindId ASC)`** so the `manifestBlob` is deterministic regardless of shard download order; classifies via `classifyManifestRecords`; **rejects an oversize payload BEFORE the POST** — if `JSON.stringify({ runId, startedAt, cellCount, anomalyCounts, manifestBlob }).length` exceeds the locked 5 MB `/api/sweep/runs` body cap, it exits 4 with a full-sentence stderr (a loud pre-flight failure, never a server 413); and POSTs **one** run to `${API_BASE_URL}/api/sweep/runs` with `X-Sweep-Token`. RunId form `<shortSha>-<compactTimestampUtc>-weekly-w<windowIndex>` (mirrors `sweep-submit.mjs` + the `-weekly` suffix keeps the id space disjoint from the daily; the `-w<windowIndex>` suffix records which rotation window the run covered, so an operator can audit the rotation from `sweep_runs` alone — `--window-index` is passed in from the plan output). Exit 0/2/3/4 mirror `sweep-submit.mjs`. Exports pure helpers `isWeeklySubmitEnvComplete(env)`, `concatenateShardManifests(manifestTexts)` (performs the `(schemeId, mastermindId)` sort), and `isWithinBodyCap(payload)` for unit testing.
- **New** `apps/server/scripts/sweep-weekly-submit.test.ts` — ≥ 8 `node:test` cases for the pure helpers (env guard; `selectSchemeWindow` slice math incl. the clamped last window + the empty over-offset slice ⇒ 0 cells; `computeWeeklyPlan` rotation incl. the `isoWeek mod 10` wrap + the clamped last window [180, 191); `computeShardSlice` per-shard offsets; `collectSortedUniqueExtIds` sort/dedup; `concatenateShardManifests` preserves counts AND emits records sorted by `(schemeId, mastermindId)` so input order is irrelevant, incl. an empty-manifest contribution; the shard-count-mismatch ⇒ no-POST exit-3 path; `isWithinBodyCap` accepts an under-cap payload and rejects an over-cap one). Placed under `apps/server/scripts/` so the server suite globs it (WP-231/232/233 precedent); imports the scripts from `../../../scripts/`.
- **New** `.github/workflows/sweep-weekly.yml` — `cron '0 8 * * 0'` (Sunday 08:00 UTC, after Saturday's daily smoke) + `workflow_dispatch`. Three jobs:
  - `plan`: checkout → derive `runIdBase = <shortSha>-<compactTimestampUtc>` (git + UTC now, computed ONCE here, not per shard) → `node scripts/sweep-weekly-plan.mjs --iso-week $(date -u +%V) --scheme-axis-length 191` → job outputs `window_index`, `scheme_offset`, `run_id_base`. The single wall-clock read site.
  - `sweep` (`needs: plan`, matrix `shard: [0, 1, 2, 3]`): checkout → pnpm → `setup-node` → install → `pnpm -r build` → `node scripts/sweep-weekly-plan.mjs --scheme-offset ${{ needs.plan.outputs.scheme_offset }} --shard-index ${{ matrix.shard }}` to get this shard's `scheme_offset`/`scheme_limit` → run `node scripts/sweep-setup-matrix.mjs` with the **full** axis fixtures + `--scheme-offset/--scheme-limit` + `--seed weekly --policy random --run-id ${{ needs.plan.outputs.run_id_base }}-shard-<shard>` → `actions/upload-artifact@v4` the `manifest.jsonl` (always a valid file, possibly empty for a clamped 0-cell shard) as artifact `sweep-shard-<shard>`.
  - `combine` (`needs: [plan, sweep]` **AND** `if: ${{ needs.sweep.result == 'success' }}`): runs ONLY when all 4 shards succeeded — no partial submit. `actions/download-artifact@v4` with `pattern: sweep-shard-*` and **no** `merge-multiple` (each artifact lands in its own subdir so the 4 `manifest.jsonl` files never collide and the exactly-4 assert holds) → `node scripts/sweep-weekly-submit.mjs --manifests-dir <dir> --run-id-base ${{ needs.plan.outputs.run_id_base }} --window-index ${{ needs.plan.outputs.window_index }}` (reads `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL`).
- **Modified** `package.json` — add root scripts `sweep:generate-axis`, `sweep:weekly-plan` (`node scripts/sweep-weekly-plan.mjs`), and `sweep:weekly-submit` (`node scripts/sweep-weekly-submit.mjs`). The daily `sweep:nightly` is byte-unchanged.

### D) Decisions

- Reserve **D-23401** (weekly full-corpus sweep posture: per-scheme rotating window, ≤ 2,120 cells/run, 10-run cycle covering all 20,246; canonical scheme-axis order lock; the daily 2×2 smoke D-20704 stays the daily lock, unchanged) and **D-23402** (sharded fan-out/fan-in topology: 4 GitHub-hosted matrix shards by scheme sub-slice → combine job concatenates manifests → single `POST /api/sweep/runs`; weekly seed `weekly`; `-weekly` runId suffix).

---

## Out of Scope

- **A nightly full sweep / changing the daily 2×2 smoke** — explicitly NOT done (operator decision). `sweep-nightly.yml`, `scripts/sweep-submit.mjs`, and the 2-entry smoke fixtures are byte-unchanged. D-20704 remains the daily lock.
- **A self-hosted runner** — explicitly NOT built (operator decision). The weekly sweep runs on GitHub-hosted `ubuntu-latest` matrix shards.
- **The literal full 20,246-cell cross-product per run** — explicitly NOT built (operator decision). Each run covers a ≤ 2,120-cell rotating window; the full corpus is covered over a 10-run cycle.
- **Triaging the weekly sweep / extending the WP-231→232→233 closed loop to it** — explicitly NOT in scope. `inspection-nightly.yml` chains only off the `Sweep Nightly` workflow (`workflow_run: ["Sweep Nightly"]`); the new `Sweep Weekly` workflow does **not** trigger Inspector triage. In v1 the weekly sweep populates `legendary.sweep_runs` (raw `cellCount` / `anomalyCounts` / `manifestBlob`) for the operator dashboard + future trend view (WP-235) ONLY — its anomalies are visible as counts/manifest data but are **not** triaged into `inspection_reports` / `finding_handoffs`. Wiring the weekly into triage is a deferred follow-up WP that MUST also add a WP-233 **cell-coverage guard**: WP-233's verify diffs a `fix-proposed` handoff's `(cellId, anomalyClass)` against the latest inspection report, so a daily-originated handoff diffed against a weekly report whose rotating window EXCLUDES that cell would falsely `resolve` it. (Reachable today only via a manual inspection `workflow_dispatch` while the Sunday weekly run is the latest sweep — flagged here so the follow-up WP closes it before auto-triggering weekly triage.)
- **A manifest-storage retention / pruning policy** — deferred to a separate follow-up WP. At ≤ 2,120 cells × ~4.3 weekly runs/month ≈ 9k records/month of weekly sweep growth, `legendary.sweep_runs` + the R2 manifest blob grow but stay bounded for v1; an explicit retention/TTL/pruning policy (which runs to keep, blob lifecycle) is its own WP, not this one. `sweep-output/` stays gitignored + ephemeral (D-19403).
- **A heuristic-vs-random policy comparison sweep** — still deferred (D-20704 carry-forward). The weekly sweep uses `--policy random`.
- **Any change to `POST /api/sweep/runs`, the classifier, the engine, or the dashboard** — the weekly sweep reuses all of them unchanged. No new endpoint, no new engine symbol, no `apps/dashboard/**` edit.
- **A new sweep token / `render.yaml` / `.env.example` change** — the weekly sweep reuses `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL`.
- **Cross-product windowing by flat cell-index** — rotation is by **scheme-axis slice** (intuitive, clean-tiling), not a flat `(cellIndex mod N)` stride. The mastermind axis is never sliced.
- Refactors, cleanups, or "while I'm here" improvements to the WP-209/194/195 sweep surface.

---

## Files Expected to Change

- `scripts/sweep-setup-matrix.mjs` — modified (additive `--scheme-offset` / `--scheme-limit` + `selectSchemeWindow` helper + the canonical-order `// why:` + the `main()` entry-point guard for testability)
- `scripts/sweep-weekly-plan.mjs` — new (single source of the rotation/shard math + locked constants; exports `computeWeeklyPlan` / `computeShardSlice`; CLI emits `GITHUB_OUTPUT`)
- `scripts/sweep-generate-full-axis.mjs` — new (regenerate full axis fixtures; exports `collectSortedUniqueExtIds`)
- `scripts/sweep-weekly-submit.mjs` — new (fan-in combine + classify + body-cap guard + submit; exports `isWeeklySubmitEnvComplete` / `concatenateShardManifests` / `isWithinBodyCap`)
- `apps/server/scripts/sweep-weekly-submit.test.ts` — new (≥ 8 cases; globbed by the server suite)
- `data/sweep-fixtures/scheme-ids.full.json` — new (191 scheme ext_ids, sorted unique)
- `data/sweep-fixtures/mastermind-ids.full.json` — new (106 mastermind ext_ids, sorted unique)
- `.github/workflows/sweep-weekly.yml` — new (weekly plan → sharded sweep → combine)
- `package.json` — modified (3 new root scripts; `sweep:nightly` byte-unchanged)
- `docs/ai/DECISIONS.md` — modified (D-23401 + D-23402 reserved → Active at execution close)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-234 row → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-267 → Done)

13 files total: 6 new source/data (`sweep-weekly-plan.mjs`, `sweep-generate-full-axis.mjs`, `sweep-weekly-submit.mjs`, `sweep-weekly-submit.test.ts`, 2 fixtures) + 1 new workflow (`sweep-weekly.yml`) + 2 modified source/config (`sweep-setup-matrix.mjs`, `package.json`) + 4 governance. No engine/server/dashboard runtime change, no migration, no new endpoint, no new token.

---

## Locked Contract Values

- **Corpus (as of 2026-06-10, 40 sets):** 191 schemes × 106 masterminds = 20,246 cells. The fixtures are regenerated by `sweep:generate-axis` when sets change; the WP's cycle math is derived from the fixture lengths at run time, not hardcoded to 191/106 in the runner.
- **Window:** `SCHEMES_PER_WINDOW = 20`; a window is 20 schemes × all 106 masterminds = ≤ 2,120 cells. `CYCLE_LENGTH = 10` (`ceil(191 / 20)`). `windowIndex = isoWeek mod CYCLE_LENGTH`; `schemeOffset = windowIndex * SCHEMES_PER_WINDOW`. The last window (index 9 → schemes [180, 200) clamped to [180, 191)) covers 11 schemes. These constants + the rotation/shard math live in `scripts/sweep-weekly-plan.mjs` (single source of truth — not duplicated in YAML bash); the workflow's `plan` job evaluates them ONCE (the only wall-clock read site) and passes the outputs to the shards + combine.
- **Shards:** `SHARD_COUNT = 4`; `SCHEMES_PER_SHARD = 5` (`SCHEMES_PER_WINDOW / SHARD_COUNT`). Shard `k` runs `--scheme-offset (schemeOffset + k*5) --scheme-limit 5`, clamped to the axis end (a shard whose offset is past 191 produces an empty 0-cell manifest, not an error).
- **Axis-slice semantics (locked):** `--scheme-offset N --scheme-limit M` selects `schemeIds[N : N+M]` of the **committed** `scheme-ids.full.json` order; the mastermind axis is always full. Both flags optional; omitted ⇒ full scheme axis (daily smoke unchanged). `cellCount` = sliced-scheme-length × mastermind-length.
- **Canonical order:** the rotation + shard coordinates are indices into the committed `scheme-ids.full.json` array. Its order (ascending unique ext_id) is a locked contract — a reorder shifts coverage. `sweep-generate-full-axis.mjs` MUST emit ascending-sorted unique arrays.
- **Seed / policy:** `--seed weekly` (distinct from the daily `nightly`; per-cell seeds remain `${seed}::cell:${schemeId}:${mastermindId}` via D-19402), `--policy random`.
- **Submit:** the combine job asserts exactly `SHARD_COUNT` (4) manifests present, concatenates + sorts records by `(schemeId ASC, mastermindId ASC)`, then POSTs **one** run per week to `${API_BASE_URL}/api/sweep/runs` with `X-Sweep-Token` ↔ `SWEEP_SUBMIT_TOKEN`; runId `<shortSha>-<compactTimestampUtc>-weekly-w<windowIndex>`; `{ runId, startedAt, cellCount, anomalyCounts, manifestBlob }` shape reused from `sweep-submit.mjs`. **Body-cap guard:** the serialized payload is rejected (exit 4, loud stderr) if it exceeds the locked 5 MB `/api/sweep/runs` body cap BEFORE the POST (never a server 413). Exit 0 (POST 2xx) / 2 (config-env) / 3 (manifest read / classify / shard-count) / 4 (network / non-2xx / oversize).
- **Schedule:** `sweep-weekly.yml` `cron '0 8 * * 0'` (Sunday 08:00 UTC) + `workflow_dispatch`. The daily `sweep-nightly.yml` `cron '0 7 * * *'` is byte-unchanged.
- **ISO week source (locked):** `date -u +%V` on GitHub-hosted `ubuntu-latest` (GNU coreutils), zero-padded `01`–`53`. It MUST be parsed **base-10** (`$((10#$WEEK))` in bash / `parseInt(value, 10)` in a script) — never octal, so `08`/`09` do not error. `windowIndex = parseInt(isoWeek, 10) mod CYCLE_LENGTH`; the week-52/53 → `01` year-boundary rollover is accepted (coverage is approximate rotation, not an exact partition).
- **Artifact naming + download layout (locked):** shard `k` uploads artifact `sweep-shard-<k>` (via `actions/upload-artifact@v4`) containing its `sweep-output/<run-id>/manifest.jsonl`; the combine downloads via `actions/download-artifact@v4` with `pattern: sweep-shard-*` and **no** `merge-multiple` — so each artifact lands in its own subdir and the 4 identically-named `manifest.jsonl` files never collide (a flatten/merge would clobber them and break the exactly-4 assert). A rename or a `merge-multiple: true` is a contract break.
- **Empty-shard handling (locked):** a 0-cell shard (the clamped tail of the last window — e.g. window index 9, shard 3) MUST still produce + upload a valid (possibly empty) `manifest.jsonl`; the matrix script creates the empty file even when the scheme slice is empty. The combine step processes an empty manifest without error and includes its (empty) contribution.
- **Shard-count invariant (locked):** the combine script asserts exactly `SHARD_COUNT` (4) `manifest.jsonl` files are present after download; fewer ⇒ exit 3 (manifest error), no POST. Defense-in-depth over the `needs: sweep` success gate.
- **Combined manifest ordering (locked):** after concatenation the combine sorts the parsed records by `(schemeId ASC, mastermindId ASC)` (string compare) before classify, so the submitted `manifestBlob` is deterministic regardless of shard completion / download order; malformed lines are retained in shard-index then line order.
- **max-cells invariant (locked):** `--max-cells` stays `10000`. After slicing, every shard satisfies `cellCount <= 10000` (≤ 530 at the locked window/shard sizes). Any change to `SCHEMES_PER_WINDOW` / `SHARD_COUNT` that could violate this requires a successor D-entry.
- **RunId uniqueness + window audit (locked):** the weekly runId is `<shortSha>-<compactTimestampUtc>-weekly-w<windowIndex>` — the `<shortSha>-<compactTimestampUtc>` base mirrors `sweep-submit.mjs` (seconds-precision, **no** `Math.random()` suffix — keeps the tooling deterministic), computed ONCE in the `plan` job and shared across the shards + combine (no per-shard date drift); the `-weekly` suffix keeps the id space disjoint from the daily; the `-w<windowIndex>` suffix records which rotation window the run covered, so an operator can audit from `sweep_runs` alone that the rotation is advancing through all schemes. A same-commit same-second collision is a safe `409` no-op (exit 4 — the existing `sweep_runs` PRIMARY KEY), never data loss.
- **Axis regeneration determinism (locked):** `sweep-generate-full-axis.mjs` reads `data/cards/*.json`, extracts `schemes[].ext_id` / `masterminds[].ext_id`, dedupes by exact string match, sorts **ascending lexicographic (string compare)**, and serializes as `JSON.stringify(array, null, 2) + '\n'` (2-space indent, trailing newline, no trailing spaces). Any change to the extraction key, comparator, or serialization requires a successor D-entry.
- **Determinism boundary (locked):** all wall-clock reads (the ISO week) occur ONLY in the CI/workflow layer. **NO** wall-clock value is passed into the engine, the per-cell seed derivation, or any simulation input — per-cell determinism is the D-19402 seed chain alone (`--seed weekly`). The engine determinism boundary (`packages/game-engine`) is untouched.

---

## Acceptance Criteria

1. `node scripts/sweep-setup-matrix.mjs ... --scheme-offset 0 --scheme-limit 2 ...` over the full axis sweeps exactly the first 2 schemes × all masterminds and asserts `cellCount === selectedSchemeCount * mastermindCount`; omitting both flags sweeps the full scheme axis — verified by a `selectSchemeWindow` unit test (slice, clamped last window, empty over-offset slice ⇒ 0 cells) and a manifest cell-count check.
2. The daily smoke is byte-unchanged: `git diff` shows no change to `scripts/sweep-submit.mjs`, `.github/workflows/sweep-nightly.yml`, `data/sweep-fixtures/setup.json`, `data/sweep-fixtures/scheme-ids.json`, or `data/sweep-fixtures/mastermind-ids.json`.
3. `data/sweep-fixtures/scheme-ids.full.json` has 191 ascending-sorted unique scheme ext_ids; `mastermind-ids.full.json` has 106; regenerating via `pnpm sweep:generate-axis` produces a byte-identical file (deterministic) — verified by a re-run + `git diff` empty.
4. `collectSortedUniqueExtIds` returns ascending-sorted, de-duplicated ext_ids — verified by a unit test (duplicates collapsed, order stable).
5. `concatenateShardManifests` over N shard manifest texts (including a 0-cell empty manifest) yields the union of parsed records + malformed lines with no loss and no double-count, and the records emerge sorted by `(schemeId ASC, mastermindId ASC)` so the combined result is identical regardless of input order — verified by a unit test (empty-manifest contribution + order-independence).
6. `scripts/sweep-weekly-submit.mjs` POSTs one `{ runId, startedAt, cellCount, anomalyCounts, manifestBlob }` to `${API_BASE_URL}/api/sweep/runs`; runId ends `-weekly-w<windowIndex>`; it rejects an over-5 MB payload BEFORE the POST (exit 4, no server round-trip); exits 0 on 2xx, 2 on missing env (no POST), 3 on manifest/classify/shard-count error, 4 on network/non-2xx/oversize — verified by helper unit tests (env guard, exit-code mapping, `isWithinBodyCap`) + grep of the runId form.
7. `.github/workflows/sweep-weekly.yml` is `cron '0 8 * * 0'` + `workflow_dispatch` with THREE jobs (`plan` → `sweep` (`needs: plan`, matrix `shard: [0, 1, 2, 3]`) → `combine` (`needs: [plan, sweep]` AND explicit `if: ${{ needs.sweep.result == 'success' }}`)); the `plan` job is the SOLE wall-clock read (`date -u +%V`, parsed base-10 via `sweep-weekly-plan.mjs`) and emits `window_index` / `scheme_offset` / `run_id_base`; each shard passes `--seed weekly --policy random` + the full axis fixtures + its plan-derived slice; the combine downloads `actions/download-artifact@v4` with `pattern: sweep-shard-*` and NO `merge-multiple` — verified by YAML grep.
8. No new npm dependency in any `package.json`; no `apps/dashboard/**`, `apps/server/src/**`, `packages/game-engine/**`, `data/migrations/**`, `render.yaml`, `.env.example`, or `.github/workflows/inspection-nightly.yml` file is modified (the weekly sweep is NOT wired into Inspector triage — §Out of Scope) — verified by `git diff --name-only`.
9. The combine script asserts exactly `SHARD_COUNT` (4) manifests present after download; fewer ⇒ exit 3, no POST — verified by a unit/integration test seeding 3 manifests and asserting the no-POST exit-3 path.
10. A 0-cell shard (over-offset scheme slice) still writes a valid empty `manifest.jsonl`; the combine includes its empty contribution without error — verified by the slice + concat unit tests.
11. `selectSchemeWindow` is importable WITHOUT side effects — `import { selectSchemeWindow } from '.../sweep-setup-matrix.mjs'` does not execute `main()` (the entry-point guard) — verified by the test file loading + passing.
12. `computeWeeklyPlan(isoWeek, 191)` returns the correct `(windowIndex, schemeOffset)` across the `isoWeek mod 10` wrap and the clamped last window [180, 191); `computeShardSlice` returns each shard's `(schemeOffset, schemeLimit)` — verified by `sweep-weekly-plan.mjs` unit tests.
13. `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 with ≥ 8 net-new cases (the new `sweep-weekly-submit.test.ts`: env guard, slice math incl. clamped + empty slice, plan rotation + shard-slice, sort/dedup, manifest concat with empty + order-independence, shard-count assert, body-cap accept/reject); all pre-existing cases still green.

---

## Verification Steps

```pwsh
# 1. Axis-slice flags present, additive
Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "--scheme-offset|--scheme-limit|selectSchemeWindow"
# Expected: >= 3 lines

# 2. Daily smoke byte-unchanged
git diff --name-only scripts/sweep-submit.mjs .github/workflows/sweep-nightly.yml data/sweep-fixtures/setup.json data/sweep-fixtures/scheme-ids.json data/sweep-fixtures/mastermind-ids.json
# Expected: no output

# 3. Full axis fixture cardinalities
node -e "console.log('schemes', JSON.parse(require('fs').readFileSync('data/sweep-fixtures/scheme-ids.full.json')).length, 'masterminds', JSON.parse(require('fs').readFileSync('data/sweep-fixtures/mastermind-ids.full.json')).length)"
# Expected: schemes 191 masterminds 106

# 4. Fixtures are sorted-unique + regeneration is deterministic
pnpm sweep:generate-axis; git diff --name-only data/sweep-fixtures/
# Expected: no output (byte-identical regeneration)

# 5. Weekly workflow shape (3 jobs: plan -> sweep -> combine; no-partial-submit gate; download-artifact pin)
Select-String -Path ".github\workflows\sweep-weekly.yml" -Pattern "cron: '0 8 \* \* 0'|shard: \[0, 1, 2, 3\]|needs: plan|needs.sweep.result == 'success'|--seed weekly|scheme-ids.full.json|sweep-weekly-plan.mjs|pattern: sweep-shard-\*"
# Expected: >= 7 lines; AND merge-multiple is absent:
(Select-String -Path ".github\workflows\sweep-weekly.yml" -Pattern "merge-multiple").Count
# Expected: 0

# 6. Weekly runId window-suffix + reused submit endpoint + integrity guards
Select-String -Path "scripts\sweep-weekly-submit.mjs" -Pattern "-weekly-w|/api/sweep/runs|X-Sweep-Token|classifyManifestRecords|SHARD_COUNT|schemeId|isWithinBodyCap"
# Expected: >= 6 lines (runId window-suffix + shard-count assert + (schemeId, mastermindId) sort + body-cap guard)

# 6b. Entry-point guard makes selectSchemeWindow importable; plan math present
Select-String -Path "scripts\sweep-setup-matrix.mjs" -Pattern "import.meta.url === pathToFileURL"
# Expected: >= 1 line
Select-String -Path "scripts\sweep-weekly-plan.mjs" -Pattern "computeWeeklyPlan|computeShardSlice|GITHUB_OUTPUT"
# Expected: >= 3 lines

# 7. No new endpoint / engine / dashboard / server / migration edits; inspection-nightly untouched
git diff --name-only apps/ packages/ data/migrations/ render.yaml .env.example .github/workflows/inspection-nightly.yml .github/workflows/sweep-nightly.yml
# Expected: only apps/server/scripts/sweep-weekly-submit.test.ts

# 8. No new npm deps
git diff package.json
# Expected: only the 3 new root scripts

# 9. Tests + build
pnpm --filter @legendary-arena/server test 2>&1 | Select-Object -Last 3
pnpm -r build
```

---

## Definition of Done

- [ ] All 13 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 (≥ 8 net-new; pre-existing green)
- [ ] No files outside `## Files Expected to Change` were modified (`git diff --name-only`)
- [ ] Daily smoke byte-unchanged: `scripts/sweep-submit.mjs`, `sweep-nightly.yml`, the 2×2 fixtures; `inspection-nightly.yml` untouched (weekly NOT triaged in v1)
- [ ] No `apps/dashboard/**`, `apps/server/src/**`, `packages/game-engine/**`, `data/migrations/**`, `render.yaml`, or `.env.example` modified
- [ ] `data/sweep-fixtures/scheme-ids.full.json` (191) + `mastermind-ids.full.json` (106), ascending-sorted unique, regenerate byte-identical
- [ ] `docs/ai/STATUS.md` updated — the weekly sweep covers the full corpus over a 10-run rotating cycle; daily smoke preserved
- [ ] `docs/ai/DECISIONS.md` updated — D-23401 (weekly posture) + D-23402 (shard/combine topology) flipped Reserved → Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-234 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-267 flipped Pending → Done

---

## Vision Alignment

**Vision clauses touched:** §20-26 (scoring/PAR/simulation — the sweep is QA simulation; this WP widens its coverage), §22 (determinism/replay).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.` Expanding sweep coverage is an internal operator/CI-only QA surface. It changes no game logic, no RNG sourcing, no scoring math, no replay storage/verification. Per-cell determinism is preserved (the seed chain is reused verbatim); the only new wall-clock read is the CI window-selection in the YAML/combine layer, outside the engine determinism boundary.

**Non-Goal proximity check:** none of NG-1..7 crossed — no user-facing, paid, persuasive, competitive, or monetization surface. The weekly sweep is operator/CI-only (shared-secret submit).

**Determinism preservation:** the engine + per-cell sweep determinism is unchanged and replay-faithful (§22). The window-selection wall-clock read is a CI scheduling concern (the `.mjs`/YAML tooling layer), never engine logic.

---

## Funding Surface Gate

**N/A — CI/tooling infrastructure only; no global navigation, Registry Viewer, profile/account, or tournament funding affordances; no user-visible copy.** None of the §20.1 trigger surfaces are present.

---

## API Catalog Update

**N/A — no HTTP endpoint added, modified, removed, or status-changed.** The weekly sweep reuses the existing `POST /api/sweep/runs` (WP-209, already catalogued) with no contract change. §21.1 is not triggered (D-11804 obligation does not apply).

---

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-10
(re-affirmed 2026-06-10 after the audit-tightening pass — ISO-week base-10 parse, explicit
combine `if`-gate, combined-manifest ordering, shard-count assert, empty-shard manifest,
max-cells + axis-regen + runId + determinism-boundary locks; and a SECOND
review-hardening pass 2026-06-10 — entry-point guard for `selectSchemeWindow`
testability, a new testable `sweep-weekly-plan.mjs` (single source of the
rotation/shard math, replacing untested YAML bash), the `download-artifact@v4`
no-`merge-multiple` layout pin, a pre-POST 5 MB body-cap guard, the
`-w<windowIndex>` runId rotation-audit suffix, and the explicit WP-231/232/233
triage-boundary §Out-of-Scope clarification. These add ONE file
(`sweep-weekly-plan.mjs`, 12→13) and bump the test floor (≥6→≥8) but change no
deps/layer/contract surface, so pre-flight stays READY + copilot PASS):

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists ≥ 8 explicit exclusions (nightly-full, self-hosted, full-per-run, retention policy, heuristic policy, endpoint/engine/dashboard untouched, new token, flat-index windowing) |
| 2 | PASS | Locked contract values made explicit: corpus 191×106, window 20-scheme/2120-cell, 10-run cycle, 4 shards × 5 schemes, axis-slice semantics, canonical-order lock, seed `weekly`, `-weekly` runId, schedule cron; daily smoke byte-unchanged stated |
| 3 | PASS | WP-209/194/195 deps listed with required exports/scripts (`sweep-setup-matrix`, `sweep-submit`, `parseManifestLine`, `classifyManifestRecords`, `POST /api/sweep/runs`, fixtures, seed chain) |
| 4 | PASS | sweep-matrix/sweep-submit/nightly-workflow/fixtures, D-entries, 00.6 all cited specifically |
| 5 | PASS | 12 files listed with new/modified disposition + descriptions; additive-only-on-daily-smoke stated; bundle justification given |
| 6 | PASS | New field/flag names (`--scheme-offset`/`--scheme-limit`, `selectSchemeWindow`, `collectSortedUniqueExtIds`, `concatenateShardManifests`) full-word camelCase/kebab; `ext_id`/`schemeId`/`mastermindId`/`runId`/`cellCount`/`anomalyCounts`/`manifestBlob` reused verbatim (no rename) |
| 7 | PASS | No new npm deps; built-in `fetch` + `node:*` + the existing engine import only |
| 8 | PASS | Shared-Tooling/CI layer only; the combine script imports the engine's pure `parseManifestLine`/`classifyManifestRecords` (allowed — these are the documented WP-209 reuse surface, not new engine code); no `G`/`ctx`; no boardgame.io move/phase logic |
| 9 | PASS | PowerShell verification commands; `.mjs` scripts use built-in fetch + `node:*`; CI YAML on `ubuntu-latest`; `date -u +%V` for the ISO week |
| 10 | PASS | Reuses `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL` (no new secret, no `render.yaml`/`.env.example` change); no real secrets in the WP |
| 11 | PASS | No player-identity surface; the submit auth commits to the established shared-secret (`X-Sweep-Token`); `## Out of Scope` serves as the limitations note |
| 12 | PASS | Tests use `node:test`; no boardgame.io; the LLM-nondeterministic finding text is never asserted (the sweep manifest is engine-deterministic; only cell-count + classification shape + helper purity are tested) |
| 13 | PASS | 9 exact `pnpm`/`git`/PowerShell/`node` verification commands with expected output |
| 14 | PASS | 9 binary, observable acceptance criteria aligned to deliverables (slice flags / smoke-unchanged / fixture cardinality+determinism / concat / submit exit codes / workflow shape / scope boundary / tests) |
| 15 | PASS | DoD includes STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope-boundary + daily-smoke-unchanged + fixture checks |
| 16 | PASS | No premature abstraction — `sweepSetupMatrix` / `classifyManifestRecords` / `parseManifestLine` / `POST /api/sweep/runs` reused (not re-created); `selectSchemeWindow` / `collectSortedUniqueExtIds` / `concatenateShardManifests` are this WP's single-purpose helpers; explicit control flow (no reduce); full-word names; `// why:` on the canonical-order lock |
| 17 | PASS | `## Vision Alignment` present with clause numbers + no-conflict + determinism-preservation (the only new wall-clock read is CI scheduling, outside the engine boundary) |
| 18 | PASS | Verification greps target literal tokens (`--scheme-offset`, `selectSchemeWindow`, `cron`, `--seed weekly`, `scheme-ids.full.json`, `-weekly`, `classifyManifestRecords`); prose cites D-entries rather than enumerating forbidden tokens under a grep path |
| 19 | N/A | No repo-state-summarizing artifact authored in this WP draft |
| 20 | N/A | CI/tooling only; no funding surfaces (justified above) |
| 21 | N/A | No HTTP endpoint added/modified/removed — `POST /api/sweep/runs` reused unchanged; D-11804 not triggered (justified in `## API Catalog Update`) |

---

## Future Work Packets (Scoped From This Foundation)

- **Sweep manifest retention / pruning** (deferred from §Out of Scope): an explicit TTL / keep-last-N policy for `legendary.sweep_runs` rows + R2 manifest blobs as the weekly sweep accumulates runs, so storage stays bounded at scale.
- **Heuristic-vs-random policy comparison sweep** (D-20704 carry-forward): a weekly variant under `--policy heuristic` to compare anomaly profiles across policy families.
- **Targeted re-sweep for WP-233 verify** (WP-233 §Future Work): if the full-corpus weekly cost makes the closed-loop verify's full-report diff expensive, a targeted re-sweep of only the previously-failing cells could replace the full-report diff — a perf optimization over WP-233's verification contract.
