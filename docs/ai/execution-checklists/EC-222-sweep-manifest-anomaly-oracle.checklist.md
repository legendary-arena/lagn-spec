# EC-222 — Sweep Manifest Anomaly Oracle (Execution Checklist)

**Source:** docs/ai/work-packets/WP-195-sweep-manifest-anomaly-oracle.md
**Layer:** Game Engine (`packages/game-engine/src/simulation/`) + Scripts (`scripts/analyze-sweep-manifest.mjs`) + Cross-cutting (`docs/ai/REFERENCE/complete-game-tests.md`)

## Pre-Session Actions (PS-1..PS-3) — Blocking

> D-19501..D-19507 are load-bearing for this WP. Execution may NOT begin
> until these three actions resolve.

- [ ] **PS-1 — D-entries locked verbatim.** The seven DECISIONS.md entries below MUST be transcribed into `docs/ai/DECISIONS.md` BYTE-IDENTICALLY to the strings in `§Locked Values — DECISIONS.md verbatim block` below. The executor MUST NOT paraphrase. Wording changes require a separate SPEC commit landing BEFORE the implementation session.
- [ ] **PS-2 — Index rows confirmed Pending.** `docs/ai/work-packets/WORK_INDEX.md` has a `[ ]` row for WP-195 with status `pending`; `docs/ai/execution-checklists/EC_INDEX.md` has an EC-222 row with status `Draft`. (Both land in the Phase 1 SPEC PR.)
- [ ] **PS-3 — `// why:` comments cite locked D-entries verbatim by number.** The `// why:` comments mandated under `§Required // why: Comments` cite `D-19501`, `D-19502`, `D-19503`, `D-19504`, `D-19505`, `D-19506`, `D-19507` verbatim where applicable — paraphrased citations (e.g., "the local-copy decision", "the default-markdown convention") are FAIL.

If any PS item is unsatisfied at session start, the executor STOPS and reports a `BLOCKED` disposition rather than attempting workarounds.

## Before Starting
- [ ] WP-194 complete ✅ — `sweep.runner.ts` exports `SweepCellResult` (7 readonly fields: `cellIndex`, `cellSeed`, `endgameReached`, `mastermindId`, `moveCount`, `outcome`, `schemeId`); `CELL_SEED_SEPARATOR = '::cell:'` available for cross-reference; manifest format locked under D-19403.
- [ ] WP-193 complete ✅ — `simulateOneGameAndCaptureMoves` and `CapturedOutcomeSummary` available; the `endgameReached` JSDoc at `simulation.runner.ts:672-682` already names WP-195 as the cap-hit-vs-endgame classifier seam.
- [ ] WP-036 complete ✅ — `MAX_TURNS_PER_GAME = 200` present at `simulation.runner.ts:54` (file-private); `endgame/endgame.types.ts:46` exports `ESCAPE_LIMIT: number = 8` and the `EndgameOutcome` union.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (record baseline test count; the new analyzer test file contributes ≥12 tests on top of this baseline; pre-existing tests must remain byte-identical in count, baseline **943** at `68280d1`).
- [ ] `pnpm -r build` exits 0 (baseline).
- [ ] No file at `scripts/analyze-sweep-manifest.mjs` yet (this WP creates it).
- [ ] No file at `packages/game-engine/src/simulation/sweep.analyze.ts` yet (this WP creates it).
- [ ] No file at `packages/game-engine/src/simulation/sweep.analyze.test.ts` yet (this WP creates it).

## Locked Values (do not re-derive)

### Anomaly taxonomy
- **`SWEEP_ANOMALY_CLASSES`** = the literal array `['endgame-reached', 'not-endgame', 'escaped-villain-cap', 'fatal']` in this exact canonical order. Drift-pinned to the `SweepAnomalyClass` union via a canonical-array test (mirrors the `.claude/rules/code-style.md` §"Drift Detection" pattern).
- **`SweepAnomalyClass` union** = `'endgame-reached' | 'not-endgame' | 'escaped-villain-cap' | 'fatal'`. Mutually exclusive and exhaustive over the manifest's record space.

### Classification rules (locked)
- A fatal record (any record with `type === 'fatal'`) → `'fatal'`.
- A success record with `endgameReached === false` → `'not-endgame'` (covers both cap-hit and stuck-game; the manifest cannot discriminate them — D-19502).
- A success record with `endgameReached === true` AND `outcome.escapedVillains >= ESCAPE_LIMIT` (i.e., `>= 8`) → `'escaped-villain-cap'`.
- A success record with `endgameReached === true` AND `outcome.escapedVillains < 8` → `'endgame-reached'`.
- The four branches are decided in this order; the FIRST matching branch wins.

### Constants
- **`MAX_TURNS_PER_GAME`** = `200` (local copy in `sweep.analyze.ts`; drift-pinned to `simulation.runner.ts:54` via a test that reads both source files at test-time and asserts the literal `const MAX_TURNS_PER_GAME = 200;` appears in each). Per D-19503; mirrors the `par.aggregator.ts:450` precedent.
- **`ESCAPE_LIMIT`** = `8` (imported from `../endgame/endgame.types.js`; do NOT carry a local copy of `8` in `sweep.analyze.ts`).

### Fatal error signature
- **Signature length** = `80` UTF-16 code units (first-N-chars prefix taken via `String.prototype.slice(0, 80)`).
- **Normalization** = NONE. The signature is the first 80 UTF-16 code units of the `error` string EXACTLY as present in the parsed JSON value. **No trimming, no whitespace normalization, no newline stripping, no case folding, no hashing.** Per D-19502.

### Parse contract
- **Record shape validation** = exact-set on enumerable own-properties. Per D-19501:
  - Success record carries EXACTLY 7 top-level keys: `cellIndex`, `cellSeed`, `endgameReached`, `mastermindId`, `moveCount`, `outcome`, `schemeId`.
  - Nested `outcome` object carries EXACTLY 2 keys: `escapedVillains`, `winner`.
  - Fatal record carries EXACTLY 5 keys: `cellSeed`, `error`, `mastermindId`, `schemeId`, `type`, with `type === 'fatal'`.
  - Any extra key, missing key, wrong-typed field, or non-canonical `type` value → `{ record: null, malformedReason: <full-sentence> }`.
  - Key order is NOT significant; validation is set-based.
  - Duplicate keys in JSON source follow standard `JSON.parse` behavior (last key wins) and are evaluated post-parse against the exact-set contract.
  - The parser does NOT coerce, repair, or tolerate.
- **Plain-object precondition.** Only plain object records are accepted. The predicate is `typeof value === 'object' && value !== null && Array.isArray(value) === false && Object.getPrototypeOf(value) === Object.prototype`. Arrays, `null`, primitives, and objects with non-`Object.prototype` prototypes (including prototype-pollution variants) are rejected as malformed.

### Summary aggregates
- **`totalCells`** counts ONLY successfully parsed records. Malformed lines are EXCLUDED from `totalCells` and tracked separately in the `malformedLines` array.
- **Cell-count invariant** (must hold for every input): `totalCells === records.length` AND `sum(anomalyCounts) === totalCells` AND `sum(winnerCounts) === totalCells`.
- **`anomalyCounts`** sums to `totalCells` over the four canonical classes.
- **`winnerCounts`** sums to `totalCells` over the three buckets `'heroes-win'`, `'scheme-wins'`, `null`. Fatal records contribute to `null`; success records with `outcome.winner === null` also contribute to `null`.
- **`fatalErrorSignatures`** sorted DESCENDING by `count`, then ASCENDING by `signature`; `cellSeeds` within each bucket sorted lexicographically ASCENDING.
- **`fatalErrorSignatures` retention** = full. Each `FatalErrorBucket.cellSeeds` array holds every matching `cellSeed`; no truncation, no per-bucket cap. The markdown preview shows up to 3 (sort-stable); the JSON output carries the full list.

### `NumericDistributionStats` math (locked)
- **`mean`** — compute full-precision `sum / count` (IEEE-754 double-precision) FIRST, THEN round to 2 decimal places via `Math.round(value * 100) / 100`. **Never round before averaging.**
- **`median`** — sort the values ascending. For odd `count` take `sorted[(count - 1) / 2]`. For even `count` compute the full-precision arithmetic mean of `sorted[count/2 - 1]` and `sorted[count/2]` FIRST, THEN round via `Math.round(value * 100) / 100`. **Never round before averaging.**
- **`p95`** — nearest-rank with index `Math.ceil(0.95 * count) - 1` over the ascending-sorted values. When `count === 1`, index is `0` and `p95` equals the single value. When `count === 0`, `p95` is `null`.
- **Sum accumulation order** = iteration order of the input array as received by the classifier. No reordering before summation. No Kahan summation or precision-compensating algorithm; raw IEEE-754 double-precision arithmetic is retained for cross-implementation reproducibility.
- **`count === 0`** → all six fields (`count`, `min`, `max`, `mean`, `median`, `p95`) are appropriate for an empty distribution: `count: 0`, the other five `null`.
- **`count === 1`** → `min === max === mean === median === p95 === <the single value>`; `mean` and `median` rounded to 2 decimal places.
- **`moveCount` integer handling** — `moveCount` is an integer input throughout; `min` and `max` of `moveCountStats` are integer values (the locked 2-decimal display formatting still applies, so an integer min of `30` renders as `30.00`).

### Report format
- **Default `--format`** = `markdown`.
- **CLI flag duplication rule** = last occurrence wins. No error on duplicates.
- **CLI flag-without-value rule** = a flag requiring a value with no following argv token (the flag is the last argv element OR the next argv token is itself another `--flag`) is INVALID. The parser emits a full-sentence stderr error naming the offending flag and exits non-zero. No silent default substitution.
- **Canonical JSON key ordering** = deep sort. All object keys sorted lexicographically ascending at every level of nesting. Arrays preserve their defined order unless explicitly sorted by the spec (`fatalErrorSignatures`, each bucket's `cellSeeds`). Implementations MUST NOT rely on JavaScript object insertion order — build a key-sorted intermediate object before `JSON.stringify(value, null, 2)`.
- **Lexicographic comparator** = JavaScript's default `<` string comparison (Unicode code-unit order). **NOT `String.prototype.localeCompare` or any locale-aware comparator.** `Array.prototype.sort()` with no comparator satisfies this; explicit `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` is also acceptable. Locale-aware sort is forbidden across the spec (JSON key sort, `cellSeeds` sort, fatal signature secondary sort).
- **Stdout byte-stream contract** (both markdown and JSON) = UTF-8 encoding; exactly one trailing `\n` at end of stream; **no BOM** at the head of the stream.
- **Malformed-line warning emission order** = ascending `lineNumber` as the parser walks the file top-to-bottom. No batching, no reordering, no asynchronous interleaving.
- **Empty-section rendering (markdown)** = section header followed by a single line containing the literal string `(none)`. No inline variant.
- **Percentage formatting** = exactly one decimal place + `%` symbol (e.g., `12.3%`, never `12.30%` or `12.3`).
- **Distribution stat formatting** = 2 decimal places (e.g., `30.00`, not `30`).
- **Count formatting** = integers, no thousand separators.
- **Markdown table determinism** = no trailing whitespace on any row; line endings are LF (`\n`), never CRLF.
- **Fatal-signature column wrapping** = none. The markdown renderer MUST NOT manually wrap, soft-wrap, or truncate the signature column; line wrapping is left to the operator's terminal renderer.
- **Fatal-signature table cell-seed preview count** = up to `3` per signature (sorted lex ascending; if fewer than 3 exist, all available seeds are shown; full list is available via `--format json`).

### CLI shape (locked)
```
node scripts/analyze-sweep-manifest.mjs \
  --manifest <path-to-manifest.jsonl> \
  [--format markdown|json]
```

### `sweep.analyze.ts` exports (locked, exactly these 15 symbols)
- Types / interfaces: `SweepAnomalyClass`, `ParsedSuccessRecord`, `ParsedFatalRecord`, `ParsedManifestRecord`, `ClassifiedCell`, `NumericDistributionStats`, `FatalErrorBucket`, `MalformedLine`, `ManifestSummary`, `ManifestClassification`, `ParseRecordResult`.
- Const: `SWEEP_ANOMALY_CLASSES`.
- Functions: `parseManifestLine`, `classifyCell`, `classifyManifestRecords`.
- **Nothing else.** No `MAX_TURNS_PER_GAME` export, no helper utilities exported, no test-only exports.

### `SweepCellResult` field set (from WP-194; type-only import target)
- `cellIndex: number`, `cellSeed: string`, `endgameReached: boolean`, `mastermindId: string`, `moveCount: number`, `outcome: { escapedVillains: number, winner: EndgameOutcome | null }`, `schemeId: string`. The analyzer imports this type for parse-record typing only; it does NOT modify or re-export it.

### Markdown section headings (locked, in this order)
1. `# Sweep Manifest Analysis`
2. `## Anomaly Distribution`
3. `## Winner Distribution`
4. `## Move Count (success records only)`
5. `## Escaped Villains (success records only)`
6. `## Fatal Error Signatures`

### Header block (markdown, immediately under `# Sweep Manifest Analysis`)
- `**Manifest:** <path>`
- `**Total cells:** <N>`
- `**Malformed lines:** <M>`

### DECISIONS.md verbatim block (PS-1 source)

> Transcribe these seven entries BYTE-IDENTICALLY into `docs/ai/DECISIONS.md` during Commit B (governance close). Do not paraphrase, reorder, or reflow. Status flips from `(proposed)` to `Active` at landing time.

**D-19501 — The anomaly oracle layer ships as an engine pure helper (`packages/game-engine/src/simulation/sweep.analyze.ts`) + operator CLI (`scripts/analyze-sweep-manifest.mjs`). The engine carries the classifier + parser; the script carries the I/O boundary and report rendering.** Rationale: mirrors WP-194's pure-helper + script-wrapper pattern, which keeps the load-bearing logic testable under `node:test` and avoids leaking I/O into the engine package. The script is thin (file read + line-by-line parse + classifier call + report format); the engine carries the classification rules + summary aggregation. Putting the classifier in the engine package also makes it reachable to a future dashboard widget or alternate consumer without re-implementing the logic in a non-engine surface.

**D-19502 — Anomaly taxonomy is a closed 4-class set: `'endgame-reached'`, `'not-endgame'`, `'escaped-villain-cap'`, `'fatal'`. The manifest cannot distinguish `not-endgame` cap-hit from `not-endgame` stuck (both yield `endgameReached: false`); v1 merges them into one class and surfaces the bimodal `moveCount` distribution as the operator's discrimination signal. Fatal-record `errorSignature` is the first 80 UTF-16 code units of the `error` field, taken EXACTLY as present in the parsed JSON value — no hashing, no trimming, no whitespace normalization, no newline stripping, no case folding.** Rationale: the four-class set is exhaustive and mutually exclusive over the manifest's record space (the manifest carries `endgameReached`, `outcome.escapedVillains`, and the fatal-vs-success discriminator — those three signals collapse onto exactly four legal classifications). Distinguishing cap-hit from stuck requires a manifest field WP-194 does not emit (`turnsElapsed`); rather than back-fill an inferred discriminator from `moveCount` (which conflates "many dispatched moves per turn" with "many turns"), v1 surfaces them as one class with a distribution slice. The 80-code-unit error signature balances uniqueness against table readability — long enough to disambiguate distinct error sites, short enough to render in a markdown table column without wrapping. Hashing was considered and rejected: a hash is opaque to operators reading the markdown report, while a prefix is human-readable and stable enough to group identical errors across cells. No-normalization is locked because any normalization (trim, lowercase, newline strip) is a divergence vector across implementations; the verbatim prefix is the simplest deterministic contract.

**D-19503 — `MAX_TURNS_PER_GAME` is carried as a local copy in `sweep.analyze.ts`, drift-pinned to `simulation.runner.ts:54` via a test that reads both source files and asserts byte equality. `ESCAPE_LIMIT` is imported from `endgame/endgame.types.ts` (already a public export).** Rationale: `MAX_TURNS_PER_GAME` is currently file-private in `simulation.runner.ts`; exporting it would add a public engine API surface for a value that is functionally a runtime constant. The precedent at `par.aggregator.ts:450` (which also carries a local copy of the same constant) is the established pattern. The drift-gate test guarantees the local copy stays in sync; if the engine value ever changes, the test fires loudly and forces both copies to update in the same commit. `ESCAPE_LIMIT` is already exported and is imported directly.

**D-19504 — Report format is `--format markdown|json` with markdown default. Both formats are deterministic (same input → byte-identical output). Markdown is the operator-reading default; JSON is canonical (sorted keys at every level) for downstream tooling ingestion.** Rationale: markdown matches the operator's primary use case (reading the report in a terminal or pasted into a PR comment). JSON exists for future downstream consumers (dashboard widgets, multi-manifest trend tooling) that need structured input. Both formats are deterministic so manifest-analyzer composition with diff tools is stable. The default was chosen by analogy with WP-194's one-line stdout summary: WP-194's primary stdout consumer is the operator reading the result, not a tool; WP-195 inherits the same posture.

**D-19505 — Malformed manifest lines are non-fatal. The analyzer emits a full-sentence stderr warning naming the line number + reason, counts the malformed line in the summary, and proceeds with the remaining lines. The malformed-line count is surfaced in the markdown header and in the JSON `malformedLines` array.** Rationale: a manifest with a single corrupted line is a real failure mode (partial write during sweep abort, manual edit by an operator, disk corruption). Aborting the analyzer on first malformed line would lose all the analysis for the rest of the manifest. The warn-and-continue policy mirrors WP-194's resume-scan posture (which also tolerates malformed lines for the skip-set scan). The line count is surfaced so the operator sees the cardinality and knows whether the malformed lines are a small noise floor or a systemic issue worth investigating.

**D-19506 — v1 locks to the two-axis manifest shape (`schemeId` + `mastermindId`). The classifier carries NO optional fields for hypothetical multi-axis manifests; if WP-194 follow-ups add a third axis, the analyzer extends with the new axis at that point.** Rationale: this mirrors D-19401's anti-premature-generality posture at the analysis layer: WP-194's `cartesianProduct` is N-axis-generic at the matrix-builder layer, but the CLI + manifest record shape lock to the two-axis MVP. WP-195 inherits the same lock. Speculatively future-proofing the classifier for a third axis that may never land would introduce optional fields that complicate the type signatures and the report rendering without buying any operator value today. The follow-up WP that adds the third axis is the right place to extend both WP-194's manifest emission and WP-195's classifier in one coordinated change.

**D-19507 — The operator CLI script is named `scripts/analyze-sweep-manifest.mjs`, following the verb-noun-noun naming pattern from `scripts/record-game-fixture.mjs`.** Rationale: naming consistency across the simulation-tooling script family makes the script set self-describing. The candidates `sweep-analyze.mjs` (matches WP-194's `sweep-setup-matrix.mjs`) and `classify-sweep-anomalies.mjs` (more specific) were considered; the verb-noun-noun pattern was chosen because the recorder precedent already exists and is the closer analog (both are read-the-input + produce-an-output tools, vs. WP-194's dispatch-the-loop posture).

## Guardrails

- **The analyzer is read-only over the manifest.** The script opens the manifest file with `node:fs/promises.readFile` (default read-mode flag); it does NOT modify, append to, truncate, or re-emit the manifest. The smoke verification step asserts pre/post hash equality.
- **No second execution path.** The analyzer does NOT call any of `sweepSetupMatrix`, `simulateOneGameAndCaptureMoves`, `runSimulation`, `runFixture`, or any other engine entry point that runs a game. It only consumes the on-disk manifest.
- **The engine module is pure** modulo its inputs. No `Math.random`, no `Date.now`, no `performance.now`, no environment access, no filesystem reads (except inside the drift-gate **test**, which is test-environment-only).
- **Closed 4-class taxonomy** (D-19502). Adding a fifth class is FAIL without a follow-up DECISIONS entry. The drift-detection test asserts `SWEEP_ANOMALY_CLASSES` matches the `SweepAnomalyClass` union.
- **Fatal-signature normalization is forbidden** (D-19502). The prefix is taken via `String.prototype.slice(0, 80)` on the `error` field as parsed; no `.trim()`, no `.toLowerCase()`, no whitespace collapsing, no newline stripping, no hashing.
- **Record shape validation is exact-set** (D-19501). The parser rejects any record with extra keys, missing keys, wrong-typed fields, or a non-canonical `type` value. The parser does NOT coerce, repair, or tolerate; the contract is closed.
- **Plain-object precondition** (D-19501). The parser accepts ONLY plain object records — arrays, `null`, primitives, and objects with non-`Object.prototype` prototypes (including prototype-pollution variants) are malformed. The locked predicate is `typeof value === 'object' && value !== null && Array.isArray(value) === false && Object.getPrototypeOf(value) === Object.prototype`.
- **`totalCells` excludes malformed lines.** Malformed lines are tracked in the `malformedLines` array separately. The summary's invariant `sum(anomalyCounts) === totalCells === sum(winnerCounts)` MUST hold for every input.
- **Mean and median rounding order is locked** (full-precision average FIRST, then round to 2 decimal places via `Math.round(value * 100) / 100`). Rounding before averaging is a FAIL — assert the locked test fixture's expected values.
- **`p95` nearest-rank formula is locked** (`Math.ceil(0.95 * count) - 1`). Count=1 case: index is `0`, p95 equals the single value (NOT `null` or off-by-one).
- **Canonical JSON deep-sort.** The JSON renderer builds a key-sorted intermediate object at every nesting level before `JSON.stringify(value, null, 2)`. Insertion-order reliance is FAIL across Node runtime versions.
- **Unicode code-unit comparator.** All lexicographic sorts (JSON key sort, `cellSeeds` sort, fatal signature secondary sort) use JavaScript's default `<` string comparison. `String.prototype.localeCompare` and any locale-aware comparator are FAIL — they vary across runtime ICU versions and OS locales.
- **Sum accumulation order.** Distribution stats honor the input array's iteration order verbatim. No upstream re-sort or filter before accumulation. No Kahan summation. Raw IEEE-754 `sum / count` is the locked contract.
- **Stdout byte-stream contract.** UTF-8 encoding; exactly one trailing `\n`; no BOM. Both markdown and JSON outputs satisfy this contract.
- **`fatalErrorSignatures` v1 retention.** Each bucket holds the FULL list of matching `cellSeeds` (no truncation, no per-bucket cap). The markdown preview shows up to 3; the JSON output carries all.
- **Markdown formatting determinism.** Percentages are `N.N%` (one decimal + `%`); distribution stats are `N.NN` (two decimals); counts are integers without separators; table rows have no trailing whitespace; line endings are LF.
- **Empty-section rendering is exactly `(none)`** on its own line under the section header. No inline variant.
- **CLI duplicate-flag rule: last-wins.** No error on duplicates.
- **CLI flag-without-value rule: error.** A flag requiring a value with no following argv token (last argv element OR followed by another `--flag`) is INVALID. Full-sentence stderr error + exit non-zero. No silent default substitution.
- **Malformed-line warning emission ordering.** Warnings are emitted to stderr in ascending `lineNumber` order as the parser walks the file top-to-bottom. No batching, no asynchronous interleaving — replay-stability of stderr is part of the determinism contract.
- **Fatal-signature column wrapping forbidden.** The markdown renderer MUST NOT manually wrap, soft-wrap, or truncate the signature column.
- **No `--re-run-anomalies`, `--write-fixtures`, `--verbose`, or `--quiet` flag** in v1. The locked CLI shape is `--manifest <path> [--format markdown|json]`. Additional flags are out of scope.
- **`sweep.runner.ts`, `simulation.runner.ts`, `runFixture.ts`, `fixtureSchema.ts`, `replay.execute.ts` NOT modified** (zero diff). WP-194's exports are imported (type-only for `SweepCellResult`); no new exports added to any of these files.
- **No `boardgame.io` import in `packages/game-engine/src/simulation/`** (existing invariant; WP-195 preserves it).
- **No `@legendary-arena/registry` import in `packages/game-engine/src/simulation/`** (existing invariant; WP-195 preserves it).
- **No `Math.random` code call sites anywhere in `packages/game-engine/src/simulation/`** (existing invariant; WP-195 preserves it). Pre-existing JSDoc-convention mentions retained; no new code call sites.
- **No new npm dependencies.** Argument parsing, markdown rendering, and JSON formatting use the Node standard library only.
- **No `.reduce()` with branching logic** (00.6 Rule 7). Summary aggregation uses explicit `for...of` loops. Simple accumulation (summing into a number, joining strings) is acceptable.
- **`MAX_TURNS_PER_GAME` is NOT exported from `simulation.runner.ts`** to share the constant. The local-copy + drift-gate precedent at `par.aggregator.ts:450` is the established pattern (D-19503).

## Required `// why:` Comments

- `sweep.analyze.ts` — `MAX_TURNS_PER_GAME` local constant: cite **D-19503**; mirrors `par.aggregator.ts:450` precedent; drift-pinned via the test that reads `simulation.runner.ts` source.
- `sweep.analyze.ts` — closed-set `SWEEP_ANOMALY_CLASSES` declaration: cite **D-19502**; four-class set is exhaustive and mutually exclusive over the manifest's record space; drift-pinned to the `SweepAnomalyClass` union.
- `sweep.analyze.ts` — `'not-endgame'` class merges cap-hit + stuck-game: cite **D-19502**; manifest does not carry `turnsElapsed`, so the analyzer surfaces them as one class with a `moveCount` distribution slice for operator discrimination.
- `sweep.analyze.ts` — fatal `errorSignature` is the first 80 UTF-16 code units verbatim (no normalization): cite **D-19502**; any normalization is a divergence vector across implementations.
- `sweep.analyze.ts` — `mean` / `median` rounding: average to full precision FIRST, then `Math.round(value * 100) / 100`. Rounding-before-averaging is forbidden (locked by EC-222 §Locked Values).
- `sweep.analyze.ts` — `p95` nearest-rank index = `Math.ceil(0.95 * count) - 1`; explicit comment for the `count === 1` case (index is 0; p95 equals the single value).
- `sweep.analyze.ts` — `parseManifestLine` exact-set validation: cite **D-19501**; the parser does NOT coerce, repair, or tolerate.
- `sweep.analyze.ts` — `classifyManifestRecords` invariant: `sum(anomalyCounts) === totalCells === sum(winnerCounts)` MUST hold; `totalCells` excludes malformed lines.
- `analyze-sweep-manifest.mjs` — full-file synchronous read posture: 10K-cell cap from WP-194 bounds memory budget to ≤5 MB; cite **D-19504**.
- `analyze-sweep-manifest.mjs` — malformed-line warn-and-continue policy: cite **D-19505**; full forensic visibility without losing the rest of the manifest.
- `analyze-sweep-manifest.mjs` — markdown-default report format: cite **D-19504**; operator readability is primary; JSON-via-flag for tooling.
- `analyze-sweep-manifest.mjs` — JSON deep-sort intermediate object: insertion-order reliance is not deterministic across Node runtime versions; build a key-sorted intermediate before `JSON.stringify`.
- `analyze-sweep-manifest.mjs` — CLI duplicate-flag last-wins rule: locked under EC-222 §Locked Values; matches POSIX-style argv-parse convention.
- `analyze-sweep-manifest.mjs` — empty-manifest non-fatal posture: zero-cell report exits 0; cite EC-222 §Locked Values empty-section rendering rule.

## Files to Produce

- `packages/game-engine/src/simulation/sweep.analyze.ts` — **new** — exports exactly the 15 symbols listed in §Locked Values; carries the local `MAX_TURNS_PER_GAME` copy with `// why:` citing D-19503; pure function modulo inputs; no I/O.
- `packages/game-engine/src/simulation/sweep.analyze.test.ts` — **new** — `node:test` coverage: closed-set drift gate; four `classifyCell` rules with boundary cases (`escapedVillains` at 7/8/12); fatal `errorSignature` length cases (short / 80-char / longer); `parseManifestLine` shape checks (success / fatal / 5 malformed variants — non-JSON, neither-shape, missing-field, wrong-typed, wrong-`type`-value, extra-key on outer, extra-key on nested `outcome`); `classifyManifestRecords` summary counts + distributions + empty-input + count=1 cases; `MAX_TURNS_PER_GAME` drift gate (reads `simulation.runner.ts` + `sweep.analyze.ts` source); determinism invariant. **≥12 tests.**
- `scripts/analyze-sweep-manifest.mjs` — **new** — operator-facing CLI; reads the manifest synchronously; calls `parseManifestLine` per line with 1-based line-number tracking; warns on malformed lines; calls `classifyManifestRecords`; renders markdown or JSON to stdout; exit 0 on success / non-zero on CLI-arg or file-read errors; never modifies the manifest.
- `docs/ai/REFERENCE/complete-game-tests.md` — **modified** — add §"Sweep manifest analysis (WP-195)" section after the existing §"Setup-matrix sweep (WP-194)" section. Documents: analyzer CLI shape, four anomaly classes, distribution summaries, markdown + JSON report formats, malformed-line warn-and-continue policy, v1 single-manifest scope.
- `docs/ai/STATUS.md` — **modified** — `### WP-195 / EC-222 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — append D-19501..D-19507 BYTE-IDENTICALLY per the §DECISIONS.md verbatim block above.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-195 row `[x]` with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-222 row flipped to Done.

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline 943 + ≥12 new in `sweep.analyze.test.ts`; pre-existing simulation tests byte-identical in count).
- [ ] **Closed-set drift assertion.** Test file asserts `SWEEP_ANOMALY_CLASSES` deep-equals `['endgame-reached', 'not-endgame', 'escaped-villain-cap', 'fatal']` AND the canonical-array-vs-union drift pattern (the project's standard) catches divergence.
- [ ] **`MAX_TURNS_PER_GAME` drift gate.** Test reads `packages/game-engine/src/simulation/simulation.runner.ts` and `packages/game-engine/src/simulation/sweep.analyze.ts` source from disk, greps each for the literal `const MAX_TURNS_PER_GAME = 200;`, asserts ≥1 match per file. Failure means the engine value changed without the local copy updating.
- [ ] **Field-set drift assertion (success record).** Test asserts a valid 7-key success-shape JSON line parses to a `ParsedSuccessRecord` with `type: 'success'` plus exactly the 7 manifest fields. An 8-key variant yields `record: null, malformedReason: <full-sentence>`.
- [ ] **Field-set drift assertion (fatal record).** Test asserts a valid 5-key fatal-shape JSON line parses to a `ParsedFatalRecord`. A 6-key variant yields `record: null, malformedReason: <full-sentence>`.
- [ ] **Boundary cases on `escapedVillains`.** Test asserts classification at `escapedVillains: 7` (→ `'endgame-reached'`), `escapedVillains: 8` (→ `'escaped-villain-cap'`), `escapedVillains: 12` (→ `'escaped-villain-cap'`).
- [ ] **Fatal `errorSignature` length cases.** Test asserts the prefix is exactly the first 80 UTF-16 code units for an 80-char `error`, the full string for a <80-char `error`, and the verbatim first 80 code units (no normalization) for a >80-char `error` that includes leading/trailing whitespace.
- [ ] **Determinism invariant.** Two calls to `classifyManifestRecords` with deep-equal inputs produce deep-equal outputs (including `fatalErrorSignatures` order and `cellSeeds` order within buckets).
- [ ] **`count === 0` distribution case.** Test asserts an empty success-records input yields `NumericDistributionStats` with `count: 0` and all five other fields `null`.
- [ ] **`count === 1` distribution case.** Test asserts a single-record input yields `min === max === mean === median === p95 === <the single value>` (with rounding to 2 decimal places where applicable).
- [ ] **Mean/median rounding order.** Test asserts a fixture where averaging-before-rounding vs rounding-before-averaging produces different results — the analyzer matches the average-first locked output (e.g., `[10.005, 20.005]` → mean `15.005` → rounds to `15.01`, not `15.00`).
- [ ] **`p95` count=1 case.** Test asserts `[42]` → `p95: 42` (NOT `null` or undefined).
- [ ] **Summary invariant.** Test asserts `sum(anomalyCounts) === totalCells === sum(winnerCounts)` for a fixture with mixed classes including fatal records.
- [ ] **Malformed lines excluded from `totalCells`.** Test asserts a fixture of 5 success + 2 malformed records yields `totalCells: 5` and `malformedLines.length: 2`.
- [ ] **Non-plain-object rejection.** Test asserts `parseManifestLine` rejects each of: a JSON array (e.g., `'[1, 2, 3]'`); the JSON literal `'null'`; a JSON primitive (e.g., `'"a string"'`, `'42'`, `'true'`); and an object whose prototype is not `Object.prototype` (constructed in-test via `Object.create(somePrototype)` then JSON-stringified, or via the parser's plain-object predicate directly). Each input produces `{ record: null, malformedReason: <full-sentence> }`.
- [ ] **Sum accumulation order.** Test asserts a fixture where reordering the input array changes the floating-point sum (e.g., `[1e16, 1, -1e16]` summed in input order yields `0`, but summed sorted ascending yields `1`); the analyzer's `sum` matches the input-order result.
- [ ] **Unicode comparator (JSON deep-sort).** Test asserts the JSON renderer's key order under a fixture that would diverge under `localeCompare` (e.g., keys containing uppercase + lowercase + digits + non-ASCII characters such as `'a'`, `'A'`, `'1'`, `'á'`); the output matches Unicode code-unit order (`'1' < 'A' < 'a' < 'á'`).
- [ ] **Stdout byte-stream contract.** Test asserts (via a CLI subprocess in the smoke step OR via a unit test of the renderer's output string) that the output ends with exactly one `\n` (no double-newline at EOF, no missing terminator) and does NOT begin with a BOM (`'﻿'` not present at position 0).
- [ ] `grep -nE "^export (type|const|interface|function) (SweepAnomalyClass|SWEEP_ANOMALY_CLASSES|ParsedSuccessRecord|ParsedFatalRecord|ParsedManifestRecord|ClassifiedCell|NumericDistributionStats|FatalErrorBucket|MalformedLine|ManifestSummary|ManifestClassification|ParseRecordResult|parseManifestLine|classifyCell|classifyManifestRecords)" packages/game-engine/src/simulation/sweep.analyze.ts` returns ≥15 matches.
- [ ] `grep -n "const MAX_TURNS_PER_GAME = 200;" packages/game-engine/src/simulation/sweep.analyze.ts` returns 1 match (local copy with drift-pin comment).
- [ ] `grep -n "const MAX_TURNS_PER_GAME = 200;" packages/game-engine/src/simulation/simulation.runner.ts` returns 1 match (drift gate — engine-side authority).
- [ ] `grep -n "import.*ESCAPE_LIMIT.*from '../endgame/endgame.types" packages/game-engine/src/simulation/sweep.analyze.ts` returns 1 match (imported, not local-copied).
- [ ] `grep -nE "'endgame-reached'|'not-endgame'|'escaped-villain-cap'|'fatal'" packages/game-engine/src/simulation/sweep.analyze.ts` returns ≥4 matches (one literal per class minimum).
- [ ] `grep -rn "Math\.random\(" packages/game-engine/src/simulation/` returns zero CODE call sites (pre-existing JSDoc convention mentions may remain).
- [ ] `grep -rn "from 'boardgame.io" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -rn "from '@legendary-arena/registry'" packages/game-engine/src/simulation/` returns zero matches.
- [ ] `grep -n "classifyManifestRecords\|parseManifestLine" scripts/analyze-sweep-manifest.mjs` returns ≥2 matches.
- [ ] `grep -nE "TODO|FIXME|deferred to a follow-up WP" scripts/analyze-sweep-manifest.mjs` returns zero matches (the script is fully wired).
- [ ] `git diff --stat` shows **zero change** to `packages/game-engine/src/simulation/sweep.runner.ts`, `packages/game-engine/src/simulation/simulation.runner.ts`, `packages/game-engine/src/test/fixtures/runFixture.ts`, `packages/game-engine/src/test/fixtures/fixtureSchema.ts`, `packages/game-engine/src/replay/replay.execute.ts`.
- [ ] **Smoke verification Step 9** (produce a 2×2 sweep manifest via WP-194's CLI with `--policy random`) exits 0 producing 4 lines in `sweep-output/wp195-smoke/manifest.jsonl`.
- [ ] **Smoke verification Step 10** (markdown analysis with pre/post manifest hash check) exits 0; stdout contains `# Sweep Manifest Analysis`, `## Anomaly Distribution`, `Total cells: 4`; `Get-FileHash` pre/post equal (analyzer is read-only).
- [ ] **Smoke verification Step 11** (JSON analysis) exits 0; `ConvertFrom-Json` parses cleanly; `summary.totalCells === 4`; `summary.anomalyCounts` carries the four canonical keys lex-sorted.
- [ ] **Smoke verification Step 12** (determinism across two JSON re-runs) — both `Get-FileHash` outputs equal.
- [ ] **Smoke verification Step 13** (error-path coverage) — missing `--manifest`, file-not-found, invalid `--format` each exit non-zero with full-sentence stderr.
- [ ] **Smoke verification Step 14** (malformed-line handling) — appending a non-JSON line to the smoke manifest causes the analyzer to emit `Manifest line 5 is malformed:` to stderr while exiting 0; report header reports `Malformed lines: 1`.
- [ ] **Smoke verification Step 15** (empty manifest non-fatal) — analyzing an empty file exits 0; markdown report carries `Total cells: 0` and each section body renders `(none)`.
- [ ] **Smoke verification Step 15b** (CLI duplicate-flag last-wins) — `--format markdown --format json` produces JSON output (the second `--format` wins); no error emitted; `ConvertFrom-Json` parses cleanly.
- [ ] **Smoke verification Step 15c** (JSON deep-sort spot check) — the regex `'"outcome":\s*\{\s*"escapedVillains"'` matches in the JSON output (proves the nested `outcome` object's keys are lex-sorted, not insertion-ordered).
- [ ] **Smoke artifacts deleted** (Step 16): `git status` + `git ls-files --others --exclude-standard` show no `sweep-output/wp195-*/`, `smoke-wp195-*` paths before the implementation commit.
- [ ] `git diff --name-only` matches the §Files to Produce list exactly (no out-of-scope edits).
- [ ] `docs/ai/STATUS.md` updated; `DECISIONS.md` carries D-19501..D-19507 **byte-identically to the §DECISIONS.md verbatim block above** (PS-1 enforcement — no paraphrase); `WORK_INDEX.md` WP-195 `[x]`; `EC_INDEX.md` EC-222 Done; `complete-game-tests.md` carries §"Sweep manifest analysis (WP-195)".

## Common Failure Smells

- Classifier adds a 5th anomaly class → D-19502 violation. Fix: keep the closed 4-class set; new classes require a follow-up DECISIONS entry.
- `'not-endgame'` is split into `'hit-cap-not-endgame'` and `'stuck-game'` using a `moveCount` threshold → D-19502 violation (manifest cannot discriminate them; inferring from `moveCount` conflates "many moves per turn" with "many turns"). Fix: surface as one class with a `moveCount` distribution slice; defer discrimination to a manifest-shape change WP.
- `errorSignature` is hashed (SHA / MD5 / similar) → D-19502 violation. Fix: first 80 UTF-16 code units verbatim, no hashing.
- `errorSignature` is `.trim()`'d, lowercased, or has newlines stripped → D-19502 normalization violation. Fix: `String.prototype.slice(0, 80)` on the verbatim parsed value.
- `MAX_TURNS_PER_GAME` exported from `simulation.runner.ts` for the analyzer to import → D-19503 violation (the local-copy + drift-gate precedent at `par.aggregator.ts:450` is the established pattern). Fix: carry a local copy in `sweep.analyze.ts`; drift-pin via a source-reading test.
- `ESCAPE_LIMIT` re-defined as a local `8` literal in `sweep.analyze.ts` → import discipline violation (it's already exported from `endgame/endgame.types.ts`). Fix: import it.
- `parseManifestLine` coerces a missing field (e.g., defaults `winner` to `null` when absent) → D-19501 exact-set violation. Fix: missing field → `malformedReason`, no coercion.
- `parseManifestLine` tolerates an extra (8th) key on a success record → D-19501 exact-set violation. Fix: extra key → `malformedReason`.
- `parseManifestLine` tolerates an extra key on the nested `outcome` object → D-19501 exact-set violation. The nested validation is also exact-set (`escapedVillains` + `winner` only).
- `totalCells` includes malformed lines → invariant `sum(anomalyCounts) === totalCells === sum(winnerCounts)` breaks. Fix: malformed lines tracked separately in `malformedLines`.
- `winnerCounts.null` excludes fatal records → invariant breaks (fatal records have no `outcome.winner` so they belong in the `null` bucket). Fix: fatal records contribute to the `null` bucket.
- `mean` rounds to 2 decimals before averaging → produces off-by-one-cent values vs locked test fixture. Fix: full-precision average FIRST, then round.
- `median` rounds to 2 decimals before averaging the two middle values → same off-by-one drift. Fix: average FIRST, then round.
- `p95` returns `null` for `count === 1` because of off-by-one in the index formula → wrong. Fix: `Math.ceil(0.95 * 1) - 1 === 0`, p95 equals the single value.
- JSON renderer relies on JavaScript object insertion order → drift across Node runtime versions. Fix: build a key-sorted intermediate object at every nesting level before `JSON.stringify(value, null, 2)`.
- Markdown percentage column shows `12.30%` instead of `12.3%` → formatting determinism violation. Fix: `toFixed(1)` for percentages.
- Markdown table row carries trailing whitespace after the final `|` → determinism violation. Fix: strip trailing whitespace per row.
- Empty section renders as `(empty)` or `-` or blank → exact-string rule violation. Fix: literal `(none)` on its own line.
- Markdown line endings are CRLF (`\r\n`) → determinism violation across Windows / Linux runs. Fix: always emit LF (`\n`).
- Fatal-signature table shows a "..." placeholder when fewer than 3 cell seeds exist → spec violation. Fix: show only the available seeds, no padding.
- CLI duplicate-flag handling rejects with an error → last-wins rule violation. Fix: accept duplicates silently, last occurrence wins.
- Analyzer modifies the manifest file (accidental append-mode open) → read-only contract violation. Fix: `readFile` with default flag; smoke verification asserts pre/post hash equal.
- Analyzer calls `sweepSetupMatrix`, `simulateOneGameAndCaptureMoves`, `runSimulation`, or `runFixture` to re-run an anomalous cell → D-19501 read-only-over-manifest violation. Fix: the analyzer is consumption-only; re-dispatch is out of scope.
- `--re-run-anomalies`, `--write-fixtures`, `--verbose`, or `--quiet` flag added → unauthorized scope expansion. Fix: locked CLI shape is `--manifest <path> [--format markdown|json]` only.
- `.reduce()` used in `classifyManifestRecords` summary aggregation → 00.6 Rule 7 violation. Fix: explicit `for...of` loop.
- DECISIONS.md entry for D-19501..D-19507 deviates from the EC's §DECISIONS.md verbatim block → PS-1 violation. A single reworded sentence is FAIL.
- `// why:` comment cites "the local-copy decision" or paraphrases D-19501..D-19507 → PS-3 violation. The comment MUST cite the D-number verbatim.
- Pre-existing simulation test count drifts (baseline 943 changes) → `simulation.runner.ts`, `sweep.runner.ts`, or another simulation source was modified. Fix: WP-195 does NOT modify any of those files; the analyzer is a NEW file consuming WP-194's `SweepCellResult` type only.
- Smoke fixture / manifest left on disk at commit time → the regression suite will glob `sweep-output/`. Fix: `Remove-Item -Recurse -Force sweep-output/wp195-*` before staging; verify with `git status` AND `git ls-files --others`.
- `parseManifestLine` accepts an array `[1, 2, 3]` (because `typeof [...] === 'object'` and the loop over `Object.keys([...])` happens to yield `'0', '1', '2'` which then fail the canonical-key check) but emits a confusing reason like "missing key `cellIndex`" instead of "input is not a plain object" → plain-object precondition not enforced first. Fix: check the plain-object predicate BEFORE the canonical-key check; emit a precondition-specific full-sentence reason.
- `parseManifestLine` accepts a JSON primitive (e.g., the literal `42` or `"x"`) and crashes on a downstream `.cellSeed` access → plain-object precondition not enforced. Fix: reject all non-plain-object inputs with `malformedReason`.
- `parseManifestLine` accepts an object built via `Object.create(null)` or `Object.create(someClass.prototype)` → prototype check missing. Fix: assert `Object.getPrototypeOf(value) === Object.prototype`.
- JSON renderer uses `keys.sort((a, b) => a.localeCompare(b))` → locale-dependent ordering (`'é'` vs `'e'` collation depends on ICU version). Fix: `keys.sort()` with no comparator, or explicit `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`.
- Distribution `sum` reorders the input via `[...values].sort()` before accumulating → cross-run determinism preserved but cross-implementation reproducibility broken (a port to Python without sort would diverge). Fix: honor input-array iteration order verbatim.
- Stdout output ends with `\n\n` (double newline) → byte-stream contract violation. Fix: emit exactly one trailing `\n`; do NOT append `\n` to a string that already ends in `\n`.
- Stdout output begins with a UTF-8 BOM (`﻿` / 0xEF 0xBB 0xBF) → byte-stream contract violation, usually from a PowerShell `Out-File -Encoding utf8` (PS 5.1 default) downstream wrapper. The analyzer itself MUST emit raw UTF-8 via `process.stdout.write` (Node's stdout never emits a BOM). If a smoke step uses `Out-File`, use `-Encoding utf8NoBOM` on PS 7+, or write the file via `Set-Content -Encoding utf8` and trust Node-emitted bytes.
- CLI sees `--manifest` as the last argv token and silently treats it as an empty path → flag-without-value rule not enforced. Fix: detect the missing value position (last argv element OR next argv token starts with `--`) and emit a full-sentence stderr error.
- Malformed-line warnings interleave with stdout output across runs → asynchronous warning emission. Fix: emit warnings synchronously inside the parsing loop, in line-number order, BEFORE rendering the report to stdout.
- Markdown signature column manually wrapped at 40 chars → spec violation (column wrapping is left to the terminal). Fix: emit the full 80-code-unit signature as a single cell; the operator's terminal handles soft-wrap.
