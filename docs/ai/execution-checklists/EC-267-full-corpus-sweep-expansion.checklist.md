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
- **Submit:** combine asserts exactly `SHARD_COUNT` (4) manifests present (fewer ⇒ exit 3, no POST), sorts records by `(schemeId ASC, mastermindId ASC)` (deterministic `manifestBlob`), then POSTs ONE run to `${API_BASE_URL}/api/sweep/runs` with `X-Sweep-Token` ↔ `SWEEP_SUBMIT_TOKEN`; runId `<shortSha>-<compactTimestampUtc>-weekly` (mirrors `sweep-submit.mjs` verbatim — seconds-precision, NO `Math.random()` suffix; a same-second collision is a safe 409 no-op). `{ runId, startedAt, cellCount, anomalyCounts, manifestBlob }`. Exit 0 (2xx) / 2 (config-env) / 3 (manifest read / classify / shard-count) / 4 (network / non-2xx).
- **Schedule:** `sweep-weekly.yml` `cron '0 8 * * 0'` (Sunday 08:00 UTC) + `workflow_dispatch`; `combine` job carries `needs: sweep` **AND** explicit `if: ${{ needs.sweep.result == 'success' }}` (no partial submit). Daily `sweep-nightly.yml` `cron '0 7 * * *'` byte-unchanged.
- **ISO week (locked):** `WEEK=$(date -u +%V)` (GNU coreutils, zero-padded 01–53); parse **base-10** `windowIndex = $((10#$WEEK % 10))` — never octal (`08`/`09` must not error). Week 52/53→01 rollover accepted (approximate rotation).
- **Artifact naming (locked):** shard `k` → artifact `sweep-shard-<k>` carrying `sweep-output/<run-id>/manifest.jsonl`; combine downloads glob `sweep-shard-*`. A 0-cell (clamped tail) shard MUST still write + upload a valid empty `manifest.jsonl`; combine processes it without error.
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
- **No new npm dep; no new sweep token; no `render.yaml` / `.env.example` change.** Built-in `fetch` + `node:*` + the existing engine import only. Full file contents for every new/modified file — diffs/snippets forbidden.
- **No `.reduce()`** in `selectSchemeWindow` / `collectSortedUniqueExtIds` / `concatenateShardManifests` — explicit `for...of` / `.slice()` / `.sort()`.

## Required `// why:` Comments
- `scripts/sweep-setup-matrix.mjs` (canonical order) — the committed `scheme-ids.full.json` array order is the rotation/shard coordinate system; reordering it shifts which cells a window covers, so the file order is a locked contract (D-23401). Paraphrase any policed grep token per EC-TEMPLATE §grep-gate prose discipline.
- `scripts/sweep-weekly-submit.mjs` (single-submit) — the combine job concatenates the sharded manifests into ONE classified `POST /api/sweep/runs`; the per-shard runIds are throwaway, the weekly run carries one `-weekly`-suffixed id so it never 409s against the daily id space (D-23402).
- `.github/workflows/sweep-weekly.yml` (window selection) — `windowIndex = isoWeek mod 10` is a CI scheduling read (`date -u +%V`), NOT engine logic; per-cell determinism stays in the seed chain (D-23401, determinism boundary).

## Files to Produce
- `scripts/sweep-setup-matrix.mjs` — **modified** (additive `--scheme-offset`/`--scheme-limit` + `selectSchemeWindow`).
- `scripts/sweep-generate-full-axis.mjs` — **new** (regenerate fixtures; exports `collectSortedUniqueExtIds`).
- `scripts/sweep-weekly-submit.mjs` — **new** (fan-in combine + classify + submit; exports `isWeeklySubmitEnvComplete` / `concatenateShardManifests`).
- `apps/server/scripts/sweep-weekly-submit.test.ts` — **new** (≥ 6 cases: env guard, slice math incl. clamped + empty slice, sort/dedup, concat with empty-manifest + order-independence, shard-count-mismatch ⇒ no-POST exit 3; globbed by the server suite; imports `../../../scripts/`).
- `data/sweep-fixtures/scheme-ids.full.json` — **new** (191, sorted unique).
- `data/sweep-fixtures/mastermind-ids.full.json` — **new** (106, sorted unique).
- `.github/workflows/sweep-weekly.yml` — **new** (weekly sharded sweep + combine).
- `package.json` — **modified** (2 root scripts: `sweep:generate-axis`, `sweep:weekly-submit`).
- `docs/ai/DECISIONS.md` — **modified** (D-23401 + D-23402 Active).
- `docs/ai/STATUS.md` — **modified**.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** (WP-234 `[x]`).
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** (EC-267 → Done).

**Total: 12 files** (5 new source/data + 1 modified source + 1 new + 1 modified config + 4 governance).

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0; ≥ 6 net-new cases (incl. empty-slice, concat order-independence, shard-count-mismatch ⇒ exit 3); NO pre-existing case regresses.
- [ ] Daily smoke byte-unchanged: `git diff --name-only scripts/sweep-submit.mjs .github/workflows/sweep-nightly.yml data/sweep-fixtures/setup.json data/sweep-fixtures/scheme-ids.json data/sweep-fixtures/mastermind-ids.json` empty.
- [ ] Fixtures: `scheme-ids.full.json` length 191, `mastermind-ids.full.json` length 106; `pnpm sweep:generate-axis` then `git diff data/sweep-fixtures/` empty (byte-deterministic regeneration).
- [ ] Slice flags: `grep -n "--scheme-offset\|--scheme-limit\|selectSchemeWindow" scripts/sweep-setup-matrix.mjs` ≥ 3.
- [ ] Weekly workflow: `cron '0 8 * * 0'`, matrix `shard: [0, 1, 2, 3]`, `combine` job has BOTH `needs: sweep` and explicit `if: ${{ needs.sweep.result == 'success' }}`; ISO week parsed base-10 (`10#`); artifact `sweep-shard-*`; each shard `--seed weekly --policy random` + full axis fixtures + its scheme slice; a 0-cell shard still writes an empty `manifest.jsonl`.
- [ ] Combine submit: asserts exactly 4 manifests (else exit 3, no POST); sorts records by `(schemeId, mastermindId)`; runId ends `-weekly`; reuses `classifyManifestRecords` + `POST /api/sweep/runs` + `X-Sweep-Token`; exit 0/2/3/4.
- [ ] Scope: `git diff --name-only` lists only the 12 Files-to-Produce; no `apps/dashboard/**`, `apps/server/src/**`, `packages/game-engine/**`, `data/migrations/**`, `render.yaml`, `.env.example`; no new npm deps.
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

---

## DECISIONS.md Entries (D-23401..D-23402)

Reserved verbatim in `docs/ai/DECISIONS.md` (Status `Reserved (proposed)` at
draft; flip to `Active` at execution close — no other field changes):

- **D-23401** — Weekly full-corpus sweep: per-scheme rotating window (20 schemes
  × all 106 masterminds ≤ 2,120 cells; `windowIndex = isoWeek mod 10`;
  `schemeOffset = windowIndex * 20`; full 20,246-cell corpus over a 10-run cycle;
  scheme-axis-slice rotation, mastermind axis never sliced; committed scheme-axis
  order is a locked rotation coordinate; `date -u +%V` window read is a CI
  scheduling concern outside the engine boundary; `--seed weekly`). The successor
  D-entry to D-20704, which stays authoritative for the unchanged daily 2×2 smoke.
- **D-23402** — Sharded fan-out / fan-in topology (4 GitHub-hosted `ubuntu-latest`
  matrix shards × 5 schemes ≤ 530 cells, each uploading `sweep-shard-<k>` → combine
  job with `needs: sweep` AND explicit `if: needs.sweep.result == 'success'` asserts
  exactly 4 manifests present, concatenates + sorts by `(schemeId, mastermindId)` →
  single deterministic `POST /api/sweep/runs`; runId `<shortSha>-<ts>-weekly` mirrors
  `sweep-submit.mjs` verbatim; a failed shard fails the run, no partial submit;
  reuses `classifyManifestRecords` + exit codes 0/2/3/4 + `SWEEP_SUBMIT_TOKEN`; no
  engine symbol / endpoint / token added). Self-hosted + full-per-run rejected (operator, 2026-06-10).
