# EC-221 — Setup-Matrix Sweep Runner (Execution Checklist)

**Source:** docs/ai/work-packets/WP-194-setup-matrix-sweep.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/`) + Scripts (`scripts/sweep-setup-matrix.mjs`) + Cross-cutting (`.gitignore`, `docs/ai/REFERENCE/complete-game-tests.md`)

## Pre-Session Actions (PS-1..PS-3) — Blocking

> D-19401..D-19403 are load-bearing for this WP. Execution may NOT begin
> until these three actions resolve.

- [ ] **PS-1 — D-entries locked verbatim.** The three DECISIONS.md entries below MUST be transcribed into `docs/ai/DECISIONS.md` BYTE-IDENTICALLY to the strings in `§Locked Values — DECISIONS.md verbatim block` below. The executor MUST NOT paraphrase. Wording changes require a separate SPEC commit landing BEFORE the implementation session.
- [ ] **PS-2 — Index rows confirmed Pending.** `docs/ai/work-packets/WORK_INDEX.md` has a `[ ]` row for WP-194 with status `pending`; `docs/ai/execution-checklists/EC_INDEX.md` has an EC-221 row with status `Draft`. (Both land in the Phase 1 SPEC PR.)
- [ ] **PS-3 — `// why:` comments cite locked D-entries verbatim by number.** The `// why:` comments mandated under `§Required // why: Comments` cite `D-19401`, `D-19402`, `D-19403` verbatim — paraphrased citations (e.g., "the lex-sort decision", "the cell-seed convention") are FAIL.

If any PS item is unsatisfied at session start, the executor STOPS and reports a `BLOCKED` disposition rather than attempting workarounds.

## Before Starting
- [ ] WP-193 complete ✅ — `simulateOneGameAndCaptureMoves` exported from `packages/game-engine/src/simulation/simulation.runner.ts`; `CapturedGameResult` + `CapturedOutcomeSummary` exported with locked field sets; seat-derived seed convention `${operatorSeed}::seat:${i}` + `SEAT_SEED_SEPARATOR` constant locked under D-19303.
- [ ] WP-036 complete ✅ — `runSimulation`, `createRandomPolicy`, `createCompetentHeuristicPolicy` available.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (record baseline test count; the new sweep test file contributes ≥9 tests on top of this baseline; pre-existing tests must remain byte-identical in count, baseline 930).
- [ ] `pnpm -r build` exits 0 (baseline).
- [ ] No file at `scripts/sweep-setup-matrix.mjs` yet (this WP creates it).
- [ ] No file at `packages/game-engine/src/simulation/sweep.runner.ts` yet (this WP creates it).

## Locked Values (do not re-derive)
- **`CELL_SEED_SEPARATOR`** = the literal string `'::cell:'`. Carried verbatim in `sweep.runner.ts`. Single-quoted in source; the source-level grep gate from `§After Completing` requires ≥1 match for the literal.
- **Cell-seed derivation:** `${runSeed}${CELL_SEED_SEPARATOR}${schemeId}:${mastermindId}` — the single colon between `schemeId` and `mastermindId` is the intra-coordinate join, NOT the `::cell:` separator.
- **Per-seat seed within cell** (preserved from WP-193 D-19303): `${cellSeed}::seat:${seatIndex}` using `SEAT_SEED_SEPARATOR` from WP-193. Nested PRNG domains; D-3604 two-domain invariant holds.
- **Iteration order (locked):** both axes sorted lexicographically ascending by the dispatcher (stable copy; input arrays not mutated); outer loop `schemeId`, inner loop `mastermindId`.
- **`cellIndex` semantics:** per-run 0-based ordinal over the lex-sorted cross-product; informational only; NOT a stable identifier across axis-file changes. Identity for resume + dedup is the `(schemeId, mastermindId)` pair.
- **`SweepCellResult` fields (exactly seven, all readonly):** `cellIndex: number`, `schemeId: string`, `mastermindId: string`, `cellSeed: string`, `outcome: CapturedOutcomeSummary`, `endgameReached: boolean`, `moveCount: number`. No eighth field.
- **`cartesianProduct` signature (locked):** `<T>(axes: readonly (readonly T[])[]): Generator<readonly T[]>`. Generic on `T`; implementation does NOT reference `string` or any concrete type. Zero axes yields a single empty tuple.
- **`sweepSetupMatrix` signature (locked):** `(baseSetupConfig: MatchSetupConfig, playerCount: number, schemeIds: readonly string[], mastermindIds: readonly string[], registry: CardRegistryReader, buildPolicies: (cellSeed: string, playerCount: number) => readonly AIPolicy[], runSeed: string, onCellComplete: (cell: SweepCellResult) => void, shouldSkipCell?: (schemeId: string, mastermindId: string) => boolean) => void`.
- **CLI shape (locked):**
  ```
  node scripts/sweep-setup-matrix.mjs \
    --run-id <id-matching-/^[A-Za-z0-9._-]+$/> \
    --seed <seed-string> \
    --setup <path-to-base-envelope.json> \
    --scheme-ids <path-to-scheme-ids-list.json> \
    --mastermind-ids <path-to-mastermind-ids-list.json> \
    --policy random|heuristic \
    [--max-cells <N>]
  ```
- **Setup envelope shape consumed by `--setup`** (preserved from EC-220 verbatim):
  ```jsonc
  { "schemaVersion": "1.0", "playerCount": <integer ≥ 1, ≤ 5>, "heroSelectionMode": "GROUP_STANDARD", "composition": { /* the 9-field MatchSetupConfig; schemeId + mastermindId are substituted per cell, the other 7 fields are held verbatim */ } }
  ```
- **Axis file shape:** JSON array of non-empty unique strings. Empty array permitted (yields a zero-cell no-op sweep). Duplicates within an axis → full-sentence error from the script-side loader.
- **Manifest cell-result record shape (locked seven keys, canonical JSON, lexicographically sorted, JSONL one-line):** `{ cellIndex, cellSeed, endgameReached, mastermindId, moveCount, outcome: { escapedVillains, winner }, schemeId }`. No `type` field on success records.
- **Manifest fatal-record shape (locked five keys, canonical JSON, lexicographically sorted, JSONL one-line):** `{ cellSeed, error, mastermindId, schemeId, type: "fatal" }`. The `type` field is the discriminator distinguishing fatal records from success records.
- **`MAX_CELLS_DEFAULT`** = 10 000 (CLI default for `--max-cells`). Carried verbatim as the literal `10000` in the script source.
- **`SOFT_CELL_WARNING_THRESHOLD`** = 5000. Carried verbatim as the literal `5000` in the script source. The warning fires for `5000 < cellCount ≤ max-cells`; substring `exceeds soft threshold 5000` MUST appear in the stderr line verbatim.
- **`sweep-output/`** = locked bulk-output root (gitignored). The `.gitignore` rule sits under a comment naming WP-194.
- **Policy factory map** — `seed` here refers to the seat-derived seed `${cellSeed}::seat:${seatIndex}`, not the bare run seed or cell seed:
  - `'random'` → `createRandomPolicy(seed)`
  - `'heuristic'` → `createCompetentHeuristicPolicy(seed)`
  - Any other `--policy` value → full-sentence error, no fallback.
- **`MatchSetupConfig` fields** (verbatim, 00.2 §8.1): `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`. Per-cell substitution touches only `schemeId` and `mastermindId`; the other 7 are held verbatim from the base envelope.
- **`playerOrder` derivation (preserved from EC-220):** `["0", "1", …, String(playerCount - 1)]`.
- **Retry-fatal posture (locked v1):** there is NO `--retry-fatal` flag. To retry a fatal cell, the operator must either remove the fatal record from the manifest or run under a new `--run-id`.

### DECISIONS.md verbatim block (PS-1 source)

> Transcribe these three entries BYTE-IDENTICALLY into `docs/ai/DECISIONS.md` during Commit B (governance close). Do not paraphrase, reorder, or reflow. Status flips from `(proposed)` to `Active` at landing time.

**D-19401 — Sweep dimensions for WP-194 MVP are `schemeId × mastermindId`; matrix-builder is N-axis-generic; iteration order is lexicographic ascending on both axes.** Rationale: WP-194 is the execution-layer primitive (deterministic traversal of a defined slice of setup-space); WP-195 owns the analysis layer. Expanding the matrix to additional axes (villain groups, hero decks, player counts) at this stage would push WP-194 into combinatorics-explosion territory (10^5+ cells for the full cross-product) and into pseudo-statistical interpretation that belongs in WP-195. The MVP locks Scheme × Mastermind because those are the two top-level drivers in the setup envelope's composition. The matrix-builder core is implemented as an N-axis `cartesianProduct` helper so future axes can be added without rewriting the enumeration engine; only the CLI surface + manifest record shape need to grow when the axis count grows. Iteration order is lex-sorted ascending (outer = schemeId, inner = mastermindId), the dispatcher does the sort itself (stable copy of input arrays). The sort is a determinism guarantee, not an implementation detail — resume logic + manifest line order both depend on it; `cellIndex` is the per-run enumeration index over the sorted product and is informational only (the identity key for resume + dedup is `(schemeId, mastermindId)`). This WP does NOT claim full gameplay coverage; it claims a deterministic, resumable traversal primitive over a bounded subset of setup-space.

**D-19402 — Per-cell seed convention is `${runSeed}::cell:${schemeId}:${mastermindId}`.** Rationale: per-cell PRNG streams MUST be decorrelated across cells so cell outcomes vary even when the underlying card data does not (the WP-194 MVP uses `EMPTY_REGISTRY`, mirroring the WP-193 recorder precedent). The locked separator `::cell:` mirrors the WP-193 `::seat:` convention: a literal string carried verbatim in the sweep runner source as `CELL_SEED_SEPARATOR`, with grep-gated presence in the source file. The intra-cell-coordinate separator `:` between schemeId and mastermindId is NOT the `::cell:` separator (it is the single-colon coordinate join); this distinction is intentional. Per-seat seeds within a cell nest on top: `${cellSeed}::seat:${seatIndex}` using the WP-193 `SEAT_SEED_SEPARATOR`. The D-3604 two-domain PRNG invariant (policy PRNG vs run-level shuffle PRNG) holds at every level of the nesting.

**D-19403 — Sweep output is manifest-only (JSONL); per-cell fixture files are NOT written; the abort path emits a fatal record before exit.** Rationale: WP-194 is for aggregate analysis (consumed by WP-195), not for growing the regression-test corpus. Committing per-cell fixtures would (a) bloat the repo monotonically as sweeps accumulate and (b) blur the WP-193 contract that fixture promotion is an operator decision rather than a sweep behaviour. The manifest at `sweep-output/<run-id>/manifest.jsonl` is canonical-JSON one-line-per-cell, with the seven keys listed in the WP §E, sorted lexicographically. The `sweep-output/` directory is gitignored (so the bulk artifact does not enter the repo). On a thrown cell, the script appends a fatal-record JSONL line (`{ cellSeed, error, mastermindId, schemeId, type: "fatal" }`, canonical JSON, sorted keys, closed five-key shape) before exiting non-zero — preserving resumability + visibility + reproducibility. Fatal records are indistinguishable from cell-result records to the resume scanner's identity-key check (the `(schemeId, mastermindId)` pair); the `type` field is the disambiguator for downstream consumers (e.g., WP-195) that need to distinguish abort-cells from completed-cells. An opt-in `--write-fixtures` flag could land in a follow-up WP if operators surface a real use case for per-cell fixture promotion.

## Guardrails
- **Single dispatch path.** `sweepSetupMatrix` is the ONLY cross-product enumerator in the codebase. The script MUST NOT inline a second cross-product loop; if a script-side iteration is needed (e.g., resume skip-set construction), it iterates over manifest lines, NOT over the axes themselves.
- **`cartesianProduct` is N-axis-generic** (D-19401). The implementation MUST NOT special-case two-axis input; it accepts `readonly (readonly T[])[]` and recurses (or iterates equivalently) over the input array length. Future WPs add a third axis by extending the input array; the helper is untouched.
- **Lex-sort iteration order is in the dispatcher** (D-19401). The script does NOT pre-sort axis arrays; the dispatcher does. Test the lex-sort invariant with shuffled input.
- **Cell-seed derivation is verbatim** (D-19402). The dispatcher MUST build `cellSeed` as `${runSeed}${CELL_SEED_SEPARATOR}${schemeId}:${mastermindId}`; the literal `::cell:` lives ONLY in `CELL_SEED_SEPARATOR` (the script imports + concatenates, it does NOT carry the literal).
- **Per-seat seeds nest on top of cell seeds** (D-19303 preserved). Within a cell, seat seeds are `${cellSeed}::seat:${i}` using `SEAT_SEED_SEPARATOR` from WP-193. The two-domain PRNG invariant (D-3604) holds at every level.
- **No per-cell try/catch inside the dispatcher.** The script wraps the `sweepSetupMatrix` call in a single OUTER try/catch; on a thrown cell, the script appends the fatal record (D-19403) and exits non-zero. Per-cell error classification + recovery is WP-195's seam.
- **Manifest is canonical-JSON one-line-per-cell.** Success records carry exactly seven keys; fatal records carry exactly five keys including `type: "fatal"`. No mixing; no pretty-print; no enclosing array; no header.
- **`runFixture.ts`, `fixtureSchema.ts`, `replay.execute.ts`, `simulation.runner.ts` NOT modified** (zero diff). WP-193's exports are consumed verbatim; no new exports added.
- **No `boardgame.io` import in `packages/game-engine/src/simulation/`.**
- **No `@legendary-arena/registry` import in `packages/game-engine/src/simulation/`.**
- **No `Math.random` code call sites anywhere in `packages/game-engine/src/simulation/`.** Pre-existing JSDoc-convention mentions retained; no new code call sites.
- **No new npm dependencies.**
- **Resume identity-key is `(schemeId, mastermindId)`** — NOT `cellIndex`. The skip-set is built from manifest lines (both success records and fatal records) by extracting `(schemeId, mastermindId)` from each parsed line.
- **NO `--retry-fatal` flag** in v1. To retry a fatal cell, the operator must either remove the fatal record from the manifest or run under a new `--run-id`.
- **`--max-cells` default = 10 000; soft warning at > 5000.** The over-cap assertion fires BEFORE any dispatch; an over-cap configuration produces zero manifest output. The soft warning is one stderr line containing the verbatim substring `exceeds soft threshold 5000`.

## Required `// why:` Comments
- `sweep.runner.ts` — `cartesianProduct` definition: cite **D-19401**; why N-axis-generic (future-axes extension without rewriting the enumeration core).
- `sweep.runner.ts` — cell-seed derivation: cite **D-19402**; the literal `::cell:` separator carried via `CELL_SEED_SEPARATOR`; nesting on top of WP-193's `::seat:` preserves the D-3604 two-domain PRNG invariant.
- `sweep.runner.ts` — `EMPTY_REGISTRY`-via-host posture: dispatcher is registry-agnostic; the caller supplies the registry reader (WP-194 MVP uses `EMPTY_REGISTRY` from the script, following the WP-193 recorder precedent).
- `sweep.runner.ts` — `cellIndex` is per-run enumeration index over the lex-sorted product: NOT stable across axis-file changes; identity key for resume + dedup is `(schemeId, mastermindId)`.
- `sweep.runner.ts` — lex-sort of input axes inside the dispatcher: cite **D-19401**; stable copy (input arrays not mutated); the sort is a determinism guarantee, not an implementation detail.
- `sweep-setup-matrix.mjs` — cell-seed derivation: cite **D-19402**; the literal `::cell:` separator is imported as `CELL_SEED_SEPARATOR` (NOT echoed as a literal in the script).
- `sweep-setup-matrix.mjs` — per-seat policy construction within a cell: cite **D-19303**; the nested seed convention preserves the D-3604 two-domain invariant.
- `sweep-setup-matrix.mjs` — manifest-only output: cite **D-19403**; per-cell fixture generation is out of scope.
- `sweep-setup-matrix.mjs` — resume-on-existing-manifest behaviour: idempotency contract (same args + same axis files → same final manifest content); identity key is `(schemeId, mastermindId)`.
- `sweep-setup-matrix.mjs` — fatal-cell record on abort: cite **D-19403**; closed five-key shape; retry guidance (remove from manifest or use new `--run-id`).

## Files to Produce
- `packages/game-engine/src/simulation/sweep.runner.ts` — **new** — exports `cartesianProduct`, `SweepCellResult`, `sweepSetupMatrix`, `CELL_SEED_SEPARATOR`.
- `packages/game-engine/src/simulation/sweep.runner.test.ts` — **new** — `node:test` coverage: cartesianProduct zero-/one-/two-/three-axis enumeration; sweepSetupMatrix lex-sort invariant on shuffled input; determinism across re-invocations; skip predicate; cellSeed byte-equality drift gate (D-19402); field-set drift assertion on `SweepCellResult`. ≥9 tests.
- `scripts/sweep-setup-matrix.mjs` — **new** — operator-facing CLI; loads base envelope + axis files; resumes from existing manifest; calls `sweepSetupMatrix`; appends canonical-JSON success lines or a fatal record (on abort) to `sweep-output/<run-id>/manifest.jsonl`.
- `.gitignore` — **modified** — append `sweep-output/` rule under a comment naming WP-194.
- `docs/ai/REFERENCE/complete-game-tests.md` — **modified** — add §"Setup-matrix sweep (WP-194)" section after §"`--policy` mode (WP-193)".
- `docs/ai/STATUS.md` — **modified** — `### WP-194 / EC-221 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — append D-19401, D-19402, D-19403 BYTE-IDENTICALLY per the §DECISIONS.md verbatim block above.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-194 row `[x]` with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-221 row flipped to Done.

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline 930 + ≥9 new in `sweep.runner.test.ts`; pre-existing simulation tests byte-identical in count).
- [ ] **Field-set drift assertion (Issue 4 mirror).** Test file asserts `Object.keys(cell).sort()` deep-equals `['cellIndex', 'cellSeed', 'endgameReached', 'mastermindId', 'moveCount', 'outcome', 'schemeId']` for a real `SweepCellResult`. Failure means a silent eighth field landed.
- [ ] **`cellSeed` byte-equality drift gate (D-19402).** Test asserts `cell.cellSeed === \`\${runSeed}::cell:\${schemeId}:\${mastermindId}\`` for a known input.
- [ ] **Lex-sort invariant.** Test passes shuffled axis arrays to `sweepSetupMatrix` and asserts the callback sequence matches the lex-sorted enumeration order.
- [ ] `grep -n "export function cartesianProduct\|export interface SweepCellResult\|export function sweepSetupMatrix\|export const CELL_SEED_SEPARATOR" packages/game-engine/src/simulation/sweep.runner.ts` returns exactly 4 matches.
- [ ] `grep -n "'::cell:'" packages/game-engine/src/simulation/sweep.runner.ts` returns ≥1 match (literal separator carried).
- [ ] `grep -n "'::cell:'" scripts/sweep-setup-matrix.mjs` returns zero matches (the literal lives only in `sweep.runner.ts`; the script imports `CELL_SEED_SEPARATOR`).
- [ ] `grep -rn "Math\.random\(" packages/game-engine/src/simulation/` returns zero CODE call sites (pre-existing JSDoc convention mentions may remain).
- [ ] `grep -rn "from 'boardgame.io" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -rn "from '@legendary-arena/registry'" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -n "10000" scripts/sweep-setup-matrix.mjs` returns ≥1 match (`MAX_CELLS_DEFAULT`).
- [ ] `grep -n "5000" scripts/sweep-setup-matrix.mjs` returns ≥1 match (`SOFT_CELL_WARNING_THRESHOLD`).
- [ ] `grep -n '"type": "fatal"\|"type":\s*"fatal"' scripts/sweep-setup-matrix.mjs` returns ≥1 match (fatal-record discriminator).
- [ ] `grep -n "sweepSetupMatrix" scripts/sweep-setup-matrix.mjs` returns ≥1 match.
- [ ] `grep -nE "^sweep-output/" .gitignore` returns 1 match; `grep -n "WP-194" .gitignore` returns ≥1 match (origin comment).
- [ ] `git diff --stat` shows **zero change** to `packages/game-engine/src/simulation/simulation.runner.ts`, `packages/game-engine/src/test/fixtures/runFixture.ts`, `packages/game-engine/src/test/fixtures/fixtureSchema.ts`, `packages/game-engine/src/replay/replay.execute.ts`.
- [ ] **Smoke verification Step 10** (2×2 shuffled-axes sweep with `--policy random`) exits 0 and produces `sweep-output/wp194-smoke/manifest.jsonl` with exactly 4 lines; no stderr soft-warning fired (cellCount = 4 ≤ 5000).
- [ ] **Smoke verification Step 11** (lex-order inspection on the produced manifest) confirms `lines[0]` carries the alphabetically-first `(schemeId, mastermindId)` pair with `cellIndex:0`, and `lines[3]` carries the alphabetically-last pair with `cellIndex:3`.
- [ ] **Smoke verification Step 12** (field-set on a parsed manifest line) confirms `Object.keys(parsed).sort()` equals the seven canonical keys; no `type` key on success records.
- [ ] **Smoke verification Step 13** (resume idempotency with identical CLI args) confirms `Get-Content -Raw` byte-identity pre/post.
- [ ] **Smoke verification Step 14** (over-cap rejection with `--max-cells 1` against a 4-cell sweep) exits non-zero; no manifest written under the over-cap `--run-id`.
- [ ] **Smoke artifacts deleted** (Steps 15–16): `git status` + `git ls-files --others --exclude-standard` show no `sweep-output/wp194-*/`, `smoke-wp194-*` paths before the implementation commit.
- [ ] `git diff --name-only` matches the §Files to Produce list exactly (no out-of-scope edits).
- [ ] `docs/ai/STATUS.md` updated; `DECISIONS.md` carries D-19401..D-19403 **byte-identically to the §DECISIONS.md verbatim block above** (PS-1 enforcement — no paraphrase); `WORK_INDEX.md` WP-194 `[x]`; `EC_INDEX.md` EC-221 Done; `complete-game-tests.md` carries §"Setup-matrix sweep (WP-194)".

## Common Failure Smells
- `cartesianProduct` special-cases two-axis input → D-19401 extensibility mandate violated. Fix: generic recursion (or equivalent iteration) over `axes.length`; the three-axis test catches this.
- Script pre-sorts axis arrays before calling `sweepSetupMatrix` → the lex-sort invariant test is bypassed (the dispatcher's responsibility moves to the caller). Fix: the dispatcher does the sort itself; the script passes axes verbatim.
- `cellIndex` used as resume identity key → resume breaks under axis-file changes (adding a new schemeId that lex-sorts earlier shifts every subsequent `cellIndex`). Fix: identity is `(schemeId, mastermindId)`.
- Fatal record carries `seed` instead of `cellSeed` → schema drift; downstream consumers (WP-195) cannot reuse the cell-result-schema parser. Fix: the locked five-key shape uses `cellSeed`.
- Per-cell try/catch inside `sweepSetupMatrix` → blurs into WP-195 error-classification territory; aborts become invisible. Fix: outer try/catch in the script ONLY; dispatcher propagates throws.
- `'::cell:'` literal appears in `scripts/sweep-setup-matrix.mjs` → drift gate failure (the literal lives ONLY in `sweep.runner.ts` carried by `CELL_SEED_SEPARATOR`). Fix: import `CELL_SEED_SEPARATOR` and concatenate.
- `--write-fixtures` or `--retry-fatal` flag added unauthorized → out of scope per WP-194 §Out of Scope. Fix: remove the flag; defer to a follow-up WP.
- Script writes per-cell `.replay.json` fixtures → D-19403 violation. Fix: manifest-only output; the script does NOT call `runFixture` or the WP-193 recorder.
- DECISIONS.md entry for D-19401..D-19403 deviates from the EC's §DECISIONS.md verbatim block → PS-1 violation. A single reworded sentence is FAIL.
- `// why:` comment cites "the cell-seed convention" or paraphrases D-19401..D-19403 → PS-3 violation. The comment MUST cite the D-number verbatim.
- Pre-existing simulation test count drifts (baseline 930 changes) → `simulation.runner.ts` was modified. Fix: WP-194 does NOT modify `simulation.runner.ts`; the sweep is a NEW file consuming WP-193's exports.
- Manifest line order differs across re-runs with identical inputs → lex-sort missing or non-deterministic axis enumeration. Fix: the dispatcher sorts both axes lex-ascending before enumeration.
- Smoke fixture / manifest left on disk at commit time → the regression suite will glob `sweep-output/`. Fix: `Remove-Item -Recurse -Force sweep-output/wp194-*` before staging; verify with `git status` AND `git ls-files --others`.
