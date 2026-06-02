# WP-195 — Sweep Manifest Anomaly Oracle (Engine + Scripts)

**Status:** Draft
**Primary Layer:** Game Engine (`packages/game-engine/src/simulation/`) + Scripts
**Dependencies:** WP-194 (Setup-Matrix Sweep Runner) — Done 2026-06-01; WP-193 (Policy-Mode Fixture Recording) — Done 2026-06-01; WP-036 (Simulation Runner) — Done
**EC:** EC-222 (to be authored alongside this WP in the same SPEC PR)
**Baseline:** `origin/main` at `68280d1` (WP-194 squash-merge)

---

## Goal

After this WP, `node scripts/analyze-sweep-manifest.mjs --manifest
<path> [--format markdown|json]` consumes a WP-194 JSONL manifest at
`sweep-output/<run-id>/manifest.jsonl`, classifies each cell into a
closed-set anomaly taxonomy, aggregates distribution summaries
(winner, moveCount, escapedVillains, fatal-rate, malformed-line
rate), and emits a deterministic report to stdout (markdown by
default; canonical JSON under `--format json`).

The engine layer carries a pure-helper classifier
(`packages/game-engine/src/simulation/sweep.analyze.ts`) exporting a
closed-set anomaly taxonomy + a pure `classifySweepManifest()`
function over the parsed manifest records. The script is the
operator-facing CLI boundary that handles I/O, parses the JSONL,
calls the classifier, and renders the report.

WP-195 is **the analysis layer** WP-194 explicitly defers to (per
WP-194 §Out-of-Scope: *"Classifying which cells are anomalous
(hit-cap-not-endgame, soft-lock, illegal-state warnings, normalised
failure signatures, distribution summaries) is WP-195. WP-194 is the
execution-layer primitive; WP-195 is the analysis layer."*). It is
read-only over the manifest — it does NOT re-run cells, does NOT
modify the manifest, does NOT call `sweepSetupMatrix` or
`simulateOneGameAndCaptureMoves`, and does NOT write fixtures.

The classifier is the substrate downstream WPs build on (multi-run
trend analysis, registry-backed analysis, anomaly-driven fixture
promotion, dashboard widget ingestion). v1 ships the classifier +
report; downstream surfaces are deferred.

---

## Assumes

- WP-194 (Setup-Matrix Sweep Runner) complete ✅
  - `packages/game-engine/src/simulation/sweep.runner.ts` exports
    `SweepCellResult` (7 readonly fields:
    `cellIndex`, `cellSeed`, `endgameReached`, `mastermindId`,
    `moveCount`, `outcome`, `schemeId`)
  - `CELL_SEED_SEPARATOR = '::cell:'` available for reference (not
    consumed at runtime by WP-195; informational link in tests)
  - Manifest format locked at `sweep-output/<run-id>/manifest.jsonl`
    as JSONL of two closed-set record shapes (7-key success or 5-key
    fatal with `type: "fatal"` discriminator) — D-19403
- WP-193 (Policy-Mode Fixture Recording) complete ✅
  - `simulateOneGameAndCaptureMoves` and `CapturedOutcomeSummary`
    available (informational; WP-195 does not call them)
  - `simulation.runner.ts` carries the `endgameReached` JSDoc that
    already names WP-195 as the cap-hit-vs-endgame classifier seam
- WP-036 (Simulation Runner) complete ✅
  - `MAX_TURNS_PER_GAME = 200` is the file-private constant in
    `simulation.runner.ts:54`; WP-195 carries a local drift-pinned
    copy (D-19503)
  - `endgame/endgame.types.ts` exports `ESCAPE_LIMIT: number = 8`
    and the `EndgameOutcome` union (`'heroes-win' | 'scheme-wins'`)
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0
  (baseline 943 tests at `68280d1`)
- `pnpm -r build` exits 0
- `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`,
  `docs/ai/REFERENCE/complete-game-tests.md`,
  `docs/ai/work-packets/WORK_INDEX.md`, and
  `docs/ai/execution-checklists/EC_INDEX.md` all exist

If any of the above is false, this packet is **BLOCKED** and must
not proceed.

---

## Context (Read First)

Before writing a single line:

1. `.claude/CLAUDE.md` — execution-checklist authority, lint gate
2. `docs/ai/ARCHITECTURE.md` — §Game Engine Layer, §Persistence
   Boundaries, §Layer Boundary (Authoritative)
3. `.claude/rules/architecture.md` — Layer Boundary; pure-helper
   rule; dependency direction
4. `.claude/rules/code-style.md` — naming, comments, functions,
   error messages
5. `docs/ai/REFERENCE/00.6-code-style.md` — Rules 1, 4, 6, 9, 11,
   13, 14
6. `docs/ai/DECISIONS.md` — scan for:
   - **D-19401** — Sweep dimensions `schemeId × mastermindId`;
     iteration order lex-sorted; the identity key for resume + dedup
     is `(schemeId, mastermindId)` not `cellIndex`
   - **D-19402** — Cell-seed convention
     `${runSeed}::cell:${schemeId}:${mastermindId}` (literal
     `::cell:` separator)
   - **D-19403** — Manifest-only output (JSONL, gitignored bulk dir)
     + fatal-record closed 5-key shape (`{ cellSeed, error,
     mastermindId, schemeId, type: "fatal" }`)
   - **D-19301..D-19303** — WP-193 single-oracle-path, lobby-move
     exclusion, seat-derived seed convention (informational; the
     analyzer does not re-run cells)
   - **D-3604** — Two-domain PRNG invariant (informational; the
     analyzer never sees a PRNG)
7. `docs/ai/REFERENCE/complete-game-tests.md` — operator reference;
   the §"Setup-matrix sweep (WP-194)" subsection documents the
   manifest shape the analyzer consumes
8. `docs/ai/work-packets/WP-194-setup-matrix-sweep.md` — the
   upstream-contract WP that produces the manifest WP-195 reads;
   especially §E (manifest format) and §Non-Negotiable Constraints
   §Locked Contract Values
9. `docs/ai/execution-checklists/EC-221-setup-matrix-sweep.checklist.md` —
   §Locked Values (the manifest shape) + §Guardrails
10. `packages/game-engine/src/simulation/sweep.runner.ts` — the
    `SweepCellResult` type the analyzer imports for parsed-record
    typing
11. `packages/game-engine/src/simulation/simulation.runner.ts` — the
    `endgameReached` JSDoc at lines ~672-682 that already names
    WP-195 as the cap-hit-vs-endgame classifier seam
12. `packages/game-engine/src/endgame/endgame.types.ts` — exports
    `ESCAPE_LIMIT` + `EndgameOutcome`; the `escaped-villain-cap`
    anomaly class fires at `outcome.escapedVillains >= ESCAPE_LIMIT`
13. `scripts/sweep-setup-matrix.mjs` — the recorder precedent for
    CLI shape (PowerShell-friendly arg parsing, full-sentence error
    messages, canonical-JSON output)

---

## Scope (In)

### A) Anomaly taxonomy (engine — pure helper)

- **`packages/game-engine/src/simulation/sweep.analyze.ts`** — **new**:
  - Closed-set anomaly taxonomy as a TypeScript union + canonical
    array (drift-pinned to each other per the project convention):
    ```typescript
    export type SweepAnomalyClass =
      | 'endgame-reached'
      | 'not-endgame'
      | 'escaped-villain-cap'
      | 'fatal';

    export const SWEEP_ANOMALY_CLASSES: readonly SweepAnomalyClass[] = [
      'endgame-reached',
      'not-endgame',
      'escaped-villain-cap',
      'fatal',
    ];
    ```
    The drift-detection test asserts `SWEEP_ANOMALY_CLASSES` exactly
    matches the union (mirrors the existing canonical-array pattern
    documented in `.claude/rules/code-style.md` §"Drift Detection").
  - Per-cell classification function:
    ```typescript
    export interface ClassifiedCell {
      readonly schemeId: string;
      readonly mastermindId: string;
      readonly cellSeed: string;
      readonly anomalyClass: SweepAnomalyClass;
      readonly moveCount: number | null;
      readonly winner: EndgameOutcome | null;
      readonly escapedVillains: number | null;
      readonly errorSignature: string | null;
    }

    export function classifyCell(record: ParsedManifestRecord): ClassifiedCell;
    ```
    `moveCount` / `winner` / `escapedVillains` are `null` for fatal
    records (the manifest's fatal shape carries none of those fields
    — D-19403). `errorSignature` is `null` for non-fatal records and
    the deterministic 80-UTF-16-code-unit prefix of the fatal
    record's `error` field for fatal records (D-19502 — the prefix
    is taken EXACTLY as present in the parsed JSON value: no
    trimming, no whitespace normalization, no newline stripping, no
    hashing, no stack-trace stripping). UTF-16 code units are
    counted via `String.prototype.slice(0, 80)`; a surrogate pair
    straddling the 80th boundary is sliced at the boundary (the
    field is ASCII in practice, so surrogate-pair splitting is a
    theoretical concern only).
  - Manifest-level classifier:
    ```typescript
    export interface ManifestClassification {
      readonly cells: readonly ClassifiedCell[];
      readonly summary: ManifestSummary;
      readonly malformedLines: readonly MalformedLine[];
    }

    export interface ManifestSummary {
      readonly totalCells: number;
      readonly anomalyCounts: Readonly<Record<SweepAnomalyClass, number>>;
      readonly winnerCounts: {
        readonly 'heroes-win': number;
        readonly 'scheme-wins': number;
        readonly null: number;
      };
      readonly moveCountStats: NumericDistributionStats;
      readonly escapedVillainStats: NumericDistributionStats;
      readonly fatalErrorSignatures: readonly FatalErrorBucket[];
    }

    export interface NumericDistributionStats {
      readonly count: number;
      readonly min: number | null;
      readonly max: number | null;
      readonly mean: number | null;
      readonly median: number | null;
      readonly p95: number | null;
    }

    export interface FatalErrorBucket {
      readonly signature: string;
      readonly count: number;
      readonly cellSeeds: readonly string[];
    }

    export interface MalformedLine {
      readonly lineNumber: number;
      readonly reason: string;
    }

    export function classifyManifestRecords(
      records: readonly ParsedManifestRecord[],
      malformedLines: readonly MalformedLine[],
    ): ManifestClassification;
    ```
  - Parsed-record types — the analyzer's parse boundary:
    ```typescript
    export interface ParsedSuccessRecord {
      readonly type: 'success';
      readonly cellIndex: number;
      readonly cellSeed: string;
      readonly endgameReached: boolean;
      readonly mastermindId: string;
      readonly moveCount: number;
      readonly outcome: {
        readonly escapedVillains: number;
        readonly winner: EndgameOutcome | null;
      };
      readonly schemeId: string;
    }

    export interface ParsedFatalRecord {
      readonly type: 'fatal';
      readonly cellSeed: string;
      readonly error: string;
      readonly mastermindId: string;
      readonly schemeId: string;
    }

    export type ParsedManifestRecord =
      | ParsedSuccessRecord
      | ParsedFatalRecord;
    ```
    The `type: 'success'` discriminator is synthetic — added by the
    script's parse helper to disambiguate the success shape from the
    fatal shape (the on-disk success record carries no `type` field
    per D-19403; the analyzer adds the `'success'` tag at parse time
    so downstream code branches on a single discriminator).
  - Engine-side parse validator (pure):
    ```typescript
    export interface ParseRecordResult {
      readonly record: ParsedManifestRecord | null;
      readonly malformedReason: string | null;
    }

    export function parseManifestLine(
      jsonText: string,
    ): ParseRecordResult;
    ```
    Returns `{ record: <parsed>, malformedReason: null }` on a valid
    success-shape or fatal-shape JSON; returns `{ record: null,
    malformedReason: <full-sentence reason> }` on any failure. The
    function is pure, deterministic, no I/O. The script is
    responsible for reading the file line by line and assembling the
    `malformedLines: MalformedLine[]` array from the script-side
    line-number tracking; the engine function just classifies one
    line at a time.
  - **Record shape validation is exact-set.** A success record MUST
    contain exactly the 7 allowed keys (`cellIndex`, `cellSeed`,
    `endgameReached`, `mastermindId`, `moveCount`, `outcome`,
    `schemeId`); the nested `outcome` object MUST contain exactly
    the 2 keys (`escapedVillains`, `winner`). A fatal record MUST
    contain exactly the 5 allowed keys (`cellSeed`, `error`,
    `mastermindId`, `schemeId`, `type`) with `type === 'fatal'`. Any
    additional key (e.g., a hypothetical 8th key on a success record
    or 6th on a fatal record), any missing key, any wrong-typed
    field, or any non-canonical `type` value results in
    `{ record: null, malformedReason: <full-sentence> }`. The
    parser does NOT coerce, repair, or tolerate; the contract is
    closed.
    - Keys are validated against an exact-set comparison on the
      **enumerable own-properties** of the parsed object. Key order
      is NOT significant; validation is set-based (the canonical
      key set is unordered).
    - Duplicate keys in JSON source (if present) follow standard
      `JSON.parse` behavior (last key wins) and are evaluated
      post-parse against the exact-set contract.
    - Only **plain object records** are accepted. A "plain object"
      is defined as `typeof value === 'object' && value !== null
      && Array.isArray(value) === false && Object.getPrototypeOf(
      value) === Object.prototype`. Arrays, `null`, primitives,
      and objects with non-`Object.prototype` prototypes (including
      prototype-pollution variants) are rejected as malformed.
      This closes a real-world ambiguity and exploit vector.
  - Cap-threshold constant (local copy with drift gate):
    ```typescript
    // why: MAX_TURNS_PER_GAME is file-private in simulation.runner.ts
    // (line 54); par.aggregator.ts:450 already carries a local copy
    // by the same precedent. Drift-pinned by a test that reads the
    // engine source at test-time and asserts byte equality (D-19503).
    const MAX_TURNS_PER_GAME = 200;
    ```
    The drift-gate test loads
    `packages/game-engine/src/simulation/simulation.runner.ts` via
    `node:fs/promises.readFile`, greps for the literal
    `const MAX_TURNS_PER_GAME = 200;`, and asserts ≥1 match. If the
    engine value ever changes, this WP's drift gate fires loudly.
  - `ESCAPE_LIMIT` is **imported** from
    `../endgame/endgame.types.js` (it is already a public export at
    `endgame.types.ts:46`); no local copy.

### B) Classification rules (locked)

The classifier's per-cell decision logic is exactly:

```
if record is a fatal record:
  → 'fatal' (errorSignature = first 80 chars of record.error)
else if record.endgameReached === false:
  → 'not-endgame' (covers both cap-hit and stuck-game; the
    manifest cannot discriminate them — D-19502)
else if record.outcome.escapedVillains >= ESCAPE_LIMIT (8):
  → 'escaped-villain-cap' (the legitimate scheme-wins-via-escape
    path; surfaced as its own class so operators see how often it
    drives losses)
else:
  → 'endgame-reached' (the healthy class — engine reached a
    terminal state via evaluateEndgame)
```

The four classes are **mutually exclusive** and **exhaustive over
the manifest's record space**. `not-endgame` and
`escaped-villain-cap` are both anomalies in the sense that they
represent setups the operator may want to investigate; the class
name `'endgame-reached'` is deliberately neutral (it is the
non-anomalous baseline, not "good" or "bad"; the operator decides
what merits attention).

### C) Distribution summaries (aggregate metrics)

`ManifestSummary` computes the following aggregates over the
classified cells:

- **`totalCells`** — count of **successfully parsed** records only.
  Malformed lines are NOT counted in `totalCells`; they are tracked
  separately in `malformedLines`. `totalCells` equals
  `records.length`.
- **`anomalyCounts`** — count of cells per anomaly class. Sum over
  all four classes equals `totalCells`.
- **`winnerCounts`** — count of cells per `outcome.winner` value
  (the three buckets `'heroes-win'`, `'scheme-wins'`, `null`).
  - Success records with `outcome.winner === 'heroes-win'` contribute
    to the `'heroes-win'` bucket.
  - Success records with `outcome.winner === 'scheme-wins'` contribute
    to the `'scheme-wins'` bucket.
  - Success records with `outcome.winner === null` contribute to the
    `null` bucket.
  - Fatal records also contribute to the `null` bucket (they have no
    `outcome` field).
  - Sum over the three buckets equals `totalCells`.
- **`moveCountStats`** — `NumericDistributionStats` over `moveCount`
  of all **success records** (fatal records have no `moveCount`).
  `null` for all six fields if no success records exist.
- **`escapedVillainStats`** — `NumericDistributionStats` over
  `outcome.escapedVillains` of all **success records**.
- **`fatalErrorSignatures`** — array of `FatalErrorBucket` records,
  sorted descending by `count` then ascending by `signature` for
  determinism. Each bucket carries the 80-UTF-16-code-unit signature,
  the count of fatal cells matching it, and the list of `cellSeeds`
  (sorted lexicographically) producing it.
  - **v1 retention guarantee.** Each bucket stores the FULL list of
    `cellSeeds` matching the signature — no truncation, no
    streaming, no per-bucket cap. The markdown table preview shows
    only the first 3 (sort-stable), but the underlying
    `FatalErrorBucket.cellSeeds` array is always complete and is
    surfaced in full via `--format json`. Future WPs may introduce
    truncation or streaming if manifest size warrants it; v1
    guarantees full retention, so consumers can rely on it.

`NumericDistributionStats` fields:

- `count` — number of records contributing.
- `min` / `max` — extremes (or `null` if `count === 0`).
- `mean` — compute the full-precision arithmetic mean first
  (`sum / count` using standard IEEE-754 double-precision
  arithmetic), THEN round the result to 2 decimal places via
  `Math.round(value * 100) / 100`. `null` if `count === 0`.
- `median` — sort the values ascending. For odd `count`, take the
  middle value (`sorted[(count - 1) / 2]`). For even `count`,
  compute the **full-precision arithmetic mean** of the two middle
  values (`sorted[count/2 - 1]` and `sorted[count/2]`) FIRST, THEN
  round the result to 2 decimal places via
  `Math.round(value * 100) / 100`. `null` if `count === 0`. The
  rounding order is locked: average before rounding, never round
  before averaging.
- `p95` — 95th-percentile value using the nearest-rank method.
  Sort the values ascending; the p95 index is
  `Math.ceil(0.95 * count) - 1`. When `count === 1`, the index is
  `0` and `p95` equals the single value. When `count === 0`,
  `p95` is `null`.

**Numeric accumulation order.** Sum accumulation order is the
**iteration order of the input array as received by the
classifier** (no reordering before summation; the array's element
order is honored). No Kahan summation or precision-compensating
algorithm is used; raw IEEE-754 double-precision arithmetic is
retained to match existing engine patterns and to keep the
reference implementation reproducible across language ports of the
analyzer (a future Python or Go consumer matching the locked
contract will produce byte-identical numeric output).

The classifier is a **pure function** modulo its inputs; no I/O;
no `Math.random()`; no wall-clock; no environment reads.

### D) Operator-facing analyzer CLI

- **`scripts/analyze-sweep-manifest.mjs`** — **new**:
  - CLI flags:
    - `--manifest <path>` (required) — path to the JSONL manifest
      file. The script reads the entire file synchronously into
      memory and parses line-by-line; OOM on a 10K-cell manifest is
      acceptable for v1 (each line is ≤500 bytes ⇒ ≤5 MB total —
      well under any reasonable memory budget).
    - `--format markdown|json` (optional, default `markdown`) — the
      report format. Markdown is rendered for operator reading;
      JSON is canonical (sorted keys at every level, no trailing
      whitespace) for tooling ingestion.
  - **CLI flag duplication rule.** If any flag appears more than
    once on the command line (e.g.,
    `--manifest a.jsonl --manifest b.jsonl`), the **last occurrence
    wins** — the earlier occurrences are silently overridden. No
    error is emitted for duplicates; this matches the standard
    POSIX-style argv-parse convention and the recorder precedent.
  - **CLI flag-without-value rule.** A flag that requires a value
    but has no following argv token (e.g., `--manifest` appearing
    as the last element of `process.argv`, or
    `--manifest --format json` where `--format` is consumed as the
    value of `--manifest`) is INVALID. The parser MUST detect this
    by recognizing that a value position is occupied by another
    `--flag` token OR by the end of argv, and emit a full-sentence
    stderr error naming the offending flag, then exit non-zero. No
    silent default substitution.
  - Execution path:
    1. Parse + validate CLI args. Missing `--manifest` → full-sentence
       error to stderr + exit non-zero. Invalid `--format` value →
       full-sentence error to stderr + exit non-zero.
    2. Read the manifest file via `node:fs/promises.readFile`.
       File-not-found / read-error → full-sentence error to stderr
       naming the path + the error message + exit non-zero. An empty
       file is **not** an error; it yields a zero-cell report
       (totalCells = 0, all distribution stats null, anomalyCounts
       all 0).
    3. Split the file content on `\n`, drop the final empty entry if
       present (canonical JSONL always ends with `\n`), and assign a
       1-based line number to each remaining line.
    4. For each line, call `parseManifestLine(line)`. On a non-null
       `record`, push to the parsed-records array. On a non-null
       `malformedReason`, push `{ lineNumber, reason: malformedReason }`
       to the malformed-lines array AND emit a stderr warning of the
       form `Manifest line N is malformed: <reason>.`. Continue to
       the next line; a malformed line is non-fatal.
       - **Warning emission order is deterministic.** Malformed-line
         warnings are emitted to stderr in ascending `lineNumber`
         order as the parser walks the file top-to-bottom. No
         batching, no reordering, no asynchronous interleaving — the
         processing loop is synchronous over the line array.
         Replay-stability of stderr is part of the determinism
         contract.
    5. Call `classifyManifestRecords(records, malformedLines)`.
    6. Render the report in the requested format and write to stdout
       (newline-terminated). Exit 0.
  - Markdown report shape (deterministic, no timestamps, no
    interactive elements):
    ```markdown
    # Sweep Manifest Analysis

    **Manifest:** <path>
    **Total cells:** <N>
    **Malformed lines:** <M>

    ## Anomaly Distribution

    | Class                | Count | % |
    |----------------------|-------|---|
    | endgame-reached      | ...   | ...
    | not-endgame          | ...   | ...
    | escaped-villain-cap  | ...   | ...
    | fatal                | ...   | ...

    ## Winner Distribution

    | Winner       | Count | % |
    |--------------|-------|---|
    | heroes-win   | ...   | ...
    | scheme-wins  | ...   | ...
    | null         | ...   | ...

    ## Move Count (success records only)

    Count: ... | Min: ... | Max: ... | Mean: ... | Median: ... | p95: ...

    ## Escaped Villains (success records only)

    Count: ... | Min: ... | Max: ... | Mean: ... | Median: ... | p95: ...

    ## Fatal Error Signatures

    | Signature                       | Count | Cell Seeds (first 3) |
    |---------------------------------|-------|----------------------|
    | <signature 1>                   | ...   | ...
    | <signature 2>                   | ...   | ...
    ```
    **Empty-section rendering rule.** A section whose underlying
    aggregate has zero contributing records MUST render exactly
    the section header followed by a single line containing the
    literal string `(none)` (no surrounding whitespace, no
    quotes, no parentheses other than the verbatim characters
    `(none)`). The `(none)` line is on its own line; there is no
    inline variant.
    **Row order for Anomaly Distribution** is the canonical
    `SWEEP_ANOMALY_CLASSES` array order (the operator can grep for
    a specific class without scrolling).
    **Markdown formatting determinism rules:**
    - Percentages MUST be formatted with exactly one decimal place
      and a trailing `%` symbol (e.g., `12.3%`, never `12.30%` or
      `12.3` without the symbol). The decimal point is always
      `.`; thousand separators are forbidden in any numeric value.
    - Numeric distribution-stat values (min/max/mean/median/p95)
      are rendered with their full 2-decimal-place precision
      (e.g., `30.00`, not `30`). Counts are rendered as integers
      without trailing zeros. `moveCount` is treated as an integer
      input throughout — no rounding is applied to `min` or `max`
      (the locked 2-decimal formatting still applies for display
      symmetry, so a moveCount min of `30` renders as `30.00`).
    - Markdown table rows MUST contain no trailing whitespace
      after the final `|` character. Each line in the report ends
      with `\n` (LF), not `\r\n` (CRLF).
    - **Stdout byte-stream contract.** All stdout output MUST be
      encoded in **UTF-8**. The entire output MUST terminate with
      **exactly one trailing `\n`** (no double-newline at EOF, no
      missing terminator). **No BOM** (byte-order mark) is emitted
      at the head of the output. The same byte-stream contract
      applies to both markdown and JSON output formats.
    - **Fatal-signature column wrapping.** The markdown renderer
      MUST NOT manually wrap, soft-wrap, or truncate the signature
      column. The full 80-UTF-16-code-unit signature is emitted as
      a single table cell; line wrapping is left entirely to the
      operator's terminal renderer (which may soft-wrap based on
      column width, but the source bytes are not modified).
    **Fatal-signature table cell-seed preview rule.** The
    fatal-signature table shows up to 3 cell seeds per signature,
    sorted lexicographically ascending. If a signature has fewer
    than 3 cell seeds, all available seeds are shown (no
    placeholder padding). The full list of cell seeds for every
    signature is always available via `--format json`.
  - JSON report shape — canonical `ManifestClassification`
    serialized with `JSON.stringify(value, null, 2)` over a
    deep-sorted intermediate object, plus a trailing newline.
    **Canonical JSON key ordering rule (deep sort):**
    - All object keys MUST be sorted lexicographically ascending
      at every level (deep sort).
    - **Lexicographic ordering is defined as JavaScript's default
      `<` string comparison (Unicode code-unit order), NOT
      `String.prototype.localeCompare` or any locale-aware
      comparator.** This matches `Array.prototype.sort()`'s
      default behavior and guarantees byte-stable ordering across
      runtime locales and ICU versions. Implementations MUST
      either call `keys.sort()` with no comparator or pass an
      explicit `(a, b) => (a < b ? -1 : a > b ? 1 : 0)`
      comparator — never `localeCompare`.
    - Arrays preserve their defined order unless the spec
      explicitly mandates an array sort (currently:
      `fatalErrorSignatures` is sorted by `(count desc,
      signature asc)`; each bucket's `cellSeeds` is sorted
      lexicographically ascending; `cells` and `malformedLines`
      preserve their parsed-input order).
    - Implementations MUST NOT rely on JavaScript object
      insertion order; the renderer builds a key-sorted
      intermediate object before serialization.
    This matches WP-194's manifest convention and ensures
    byte-stability across Node runtime versions (which may differ
    in object-iteration order for non-string keys) and across
    operating-system locales (which may differ in `localeCompare`
    collation tables).
    - **Stdout byte-stream contract** (same as markdown): UTF-8
      encoding; exactly one trailing `\n`; no BOM.
  - Add `// why:` comments on:
    - the file-read posture (synchronous full-file read; bounded by
      WP-194's 10K-cell cap — D-19504)
    - the malformed-line warn-and-continue policy (D-19505 — full
      forensic visibility without losing the rest of the manifest)
    - the markdown-default report format (operator readability;
      JSON-via-flag for tooling — D-19504)

### E) Tests

Add `packages/game-engine/src/simulation/sweep.analyze.test.ts`
covering:

- **Closed-set drift gate (D-19502).** Assert
  `SWEEP_ANOMALY_CLASSES` matches the `SweepAnomalyClass` union by
  the project's canonical-array drift pattern: a TypeScript
  expression that fails to typecheck if either side drifts.
- **`classifyCell` rules — endgame-reached.** A success record with
  `endgameReached: true`, `outcome.winner: 'heroes-win'`,
  `outcome.escapedVillains: 0` classifies as `'endgame-reached'`.
- **`classifyCell` rules — not-endgame.** A success record with
  `endgameReached: false` classifies as `'not-endgame'` regardless
  of `moveCount` or `outcome.winner`.
- **`classifyCell` rules — escaped-villain-cap.** A success record
  with `endgameReached: true`, `outcome.escapedVillains: 8` (===
  `ESCAPE_LIMIT`) classifies as `'escaped-villain-cap'`. A second
  case at `escapedVillains: 12` (well past the limit) also
  classifies as `'escaped-villain-cap'`. A boundary case at
  `escapedVillains: 7` (one below the limit) classifies as
  `'endgame-reached'`.
- **`classifyCell` rules — fatal.** A fatal record classifies as
  `'fatal'` with `errorSignature` equal to the first 80 chars of
  the `error` field. A short error (<80 chars) yields the full
  error as the signature. An error exactly 80 chars yields the full
  string.
- **`classifyManifestRecords` summary — counts.** Given a fixture
  of 10 records (mix of all four classes + one fatal + one
  malformed), `summary.totalCells` equals 10, `summary.anomalyCounts`
  per class sums to 10, `summary.winnerCounts` per bucket sums to 10
  (fatal contributes to `null`).
- **`classifyManifestRecords` summary — distributions.** Given a
  fixture of success records with known `moveCount` values (e.g.,
  `[10, 20, 30, 40, 50]`), `moveCountStats` returns
  `count: 5, min: 10, max: 50, mean: 30, median: 30, p95: 50`.
- **`classifyManifestRecords` summary — empty manifest.** Given
  empty `records` + empty `malformedLines`, `totalCells: 0`,
  `anomalyCounts` all 0, all `NumericDistributionStats` fields
  `null`, `fatalErrorSignatures: []`.
- **`parseManifestLine` — success record.** A valid 7-key
  canonical-JSON line parses to a `ParsedSuccessRecord` with
  `type: 'success'` and all seven fields populated.
- **`parseManifestLine` — fatal record.** A valid 5-key
  canonical-JSON line with `type: 'fatal'` parses to a
  `ParsedFatalRecord`.
- **`parseManifestLine` — malformed.** Each of the following yields
  `record: null` + a full-sentence `malformedReason`:
  - Non-JSON syntax (e.g., `not-json`)
  - JSON but neither shape (e.g., `{ "foo": 1 }`)
  - Success shape with a missing field (e.g., `cellIndex` absent)
  - Success shape with a type mismatch (e.g., `moveCount: "ten"`)
  - Fatal shape with the wrong `type` value (e.g., `type: "error"`)
- **`parseManifestLine` — extra keys.** A success record with an
  unexpected eighth key is `malformedReason` (the closed-set
  contract is exact). Same for a fatal record with an unexpected
  sixth key.
- **Drift gate — `MAX_TURNS_PER_GAME` local copy.** A test that
  reads `simulation.runner.ts` source from disk, greps for
  `const MAX_TURNS_PER_GAME = 200;`, asserts ≥1 match, and the
  local copy in `sweep.analyze.ts` (also read from disk) declares
  the same value.
- **Determinism.** Two calls to `classifyManifestRecords` with the
  same parsed-records input produce deep-equal output, including
  `fatalErrorSignatures` ordering (sort stability).

≥12 tests total. The test file uses `node:test` and `node:assert`
exclusively; no `boardgame.io` import; no `@legendary-arena/registry`
import; no network; no live FS dependencies (all manifest fixtures
are inline string literals in the test source, NOT files on disk —
except the drift-gate test which reads `simulation.runner.ts` +
`sweep.analyze.ts` for source-level inspection).

### F) Operator reference documentation

- **`docs/ai/REFERENCE/complete-game-tests.md`** — **modified**:
  - Add a §"Sweep manifest analysis (WP-195)" section after the
    existing §"Setup-matrix sweep (WP-194)" section, documenting:
    the analyzer CLI shape, the four anomaly classes, the
    distribution summaries, the markdown-default + JSON-via-flag
    report formats, the malformed-line warn-and-continue policy,
    and the v1 single-manifest scope (multi-manifest aggregation
    deferred).
  - No other prose changes.

---

## Out of Scope

- **Modifying `packages/game-engine/src/simulation/sweep.runner.ts`**
  (WP-194's contract; zero diff). WP-195 imports `SweepCellResult`
  for type-only use at parse-record typing time; it does NOT modify
  or re-export the symbol.
- **Modifying `scripts/sweep-setup-matrix.mjs`** (WP-194's contract;
  zero diff).
- **Modifying the manifest file format.** WP-195 consumes the format
  WP-194 produces. If WP-195 needs additional fields (e.g.,
  `turnsElapsed` to distinguish `not-endgame` cap-hit from stuck),
  the right move is a follow-up to WP-194, not a WP-195 inline
  extension.
- **Re-dispatching anomalous cells.** WP-195 reads the manifest; it
  does NOT call `sweepSetupMatrix` or `simulateOneGameAndCaptureMoves`
  to re-run cells. A future WP could add a `--re-run-anomalies`
  bridge if operators surface real need.
- **Multi-manifest aggregation.** v1 consumes ONE manifest file at
  a time. Cross-run trend analysis (manifest A vs manifest B over
  time) is a later WP.
- **Real-registry analysis.** WP-194 uses `EMPTY_REGISTRY`; cell
  outcomes vary only via per-cell seed decorrelation, not by
  set-specific card scripts. WP-195 inherits this constraint —
  classifying anomalies under `EMPTY_REGISTRY` is the v1 deliverable;
  registry-backed analysis is a follow-up dependent on a future
  registry-loading WP.
- **Anomaly-driven fixture promotion.** A `--write-fixtures` bridge
  from anomalous cells to `runFixture` fixture files is explicitly
  NOT in scope. WP-194 deferred this; WP-195 does not re-litigate.
- **Triage / remediation recommendations.** WP-195 classifies +
  aggregates + reports; it does NOT suggest fixes. Operator action
  on anomalies is outside the scope.
- **Distinguishing `not-endgame` cap-hit from `not-endgame` stuck.**
  The manifest does not carry `turnsElapsed`; both exit paths yield
  `endgameReached: false`. v1 surfaces them as one class with a
  `moveCount` distribution slice that lets operators see the
  bimodal split (cap-hit games have high move counts; stuck games
  have low move counts). Discriminating them as separate classes
  requires a manifest-shape change (WP-194 follow-up).
- **Multi-axis future-proofing.** WP-194's manifest carries
  `schemeId` + `mastermindId` only. WP-195's classifier locks to
  that two-axis shape. If WP-194 follow-ups add a third axis, the
  analyzer extends with the new axis at that point; this WP does
  NOT speculatively add optional fields (D-19506).
- **Any UI surface.** No client-side rendering of analysis reports;
  operator-facing CLI only for v1.
- **Any database write.** The analysis report is ephemeral —
  emitted to stdout, never persisted by the analyzer itself.
- **Modifying `replay.execute.ts`.** D-0205 / D-15801 lock; out of
  scope.
- **Modifying `runFixture.ts` or `fixtureSchema.ts`.** D-15801
  lock; out of scope. WP-195 does not interact with the fixture
  pipeline at all.

---

## Files Expected to Change

- `packages/game-engine/src/simulation/sweep.analyze.ts` — **new** —
  exports the closed-set anomaly taxonomy, `classifyCell`,
  `classifyManifestRecords`, `parseManifestLine`, and the
  associated interface types. Carries the local
  `MAX_TURNS_PER_GAME = 200` copy with a drift-gate comment citing
  D-19503.
- `packages/game-engine/src/simulation/sweep.analyze.test.ts` —
  **new** — `node:test` coverage for the classifier rules, the
  closed-set drift gate, the manifest summary aggregates, the
  parser shape checks, the `MAX_TURNS_PER_GAME` drift gate, and the
  determinism invariant. ≥12 tests.
- `scripts/analyze-sweep-manifest.mjs` — **new** — operator-facing
  CLI that reads the manifest, calls `parseManifestLine` per line,
  warns on malformed lines, calls `classifyManifestRecords`, and
  renders the markdown / JSON report to stdout.
- `docs/ai/REFERENCE/complete-game-tests.md` — **modified** — add
  §"Sweep manifest analysis (WP-195)" section after the §"Setup-matrix
  sweep (WP-194)" section.
- `docs/ai/STATUS.md` — **modified** — WP-195 / EC-222 Executed block.
- `docs/ai/DECISIONS.md` — **modified** — append D-19501..D-19507
  verbatim per §Decisions Introduced below.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-195 entry
  added in the simulation-tooling section, completion date populated
  on execution.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-222
  row added.

No other files may be modified.

---

## Non-Negotiable Constraints

### Engine-wide (always apply — do not remove)

- ESM only, Node v22+
- Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
- Every new or modified file must be provided in FULL — no diffs,
  no snippets, no "show only the changed section"
- All randomness via `ctx.random.*` or seeded PRNG — never
  `Math.random()`. WP-195 introduces NO randomness; the analyzer
  is fully deterministic.
- `G` is never persisted to a database
- Moves never throw; only `Game.setup()` may throw
- No `.reduce()` in zone operations or effect application — see
  `00.6` Rule 7 for the broader prohibition (simple accumulation
  remains allowed)
- No `boardgame.io` imports in
  `packages/game-engine/src/simulation/`
- No `@legendary-arena/registry` imports in
  `packages/game-engine/src/simulation/`
- No filesystem, network, environment, or wall-clock reads inside
  `packages/game-engine/src/simulation/**`. The analyzer script
  (`scripts/analyze-sweep-manifest.mjs`) is the operator-facing CLI
  boundary and IS permitted to read `process.argv` + read JSON
  files via `node:fs/promises`. The engine module reads
  `simulation.runner.ts` source ONLY inside the drift-gate **test**
  (which runs outside the engine's runtime surface and is
  test-environment-only).

### Packet-specific

- **Anomaly taxonomy is a closed 4-class set** locked at design
  time (D-19502). Adding a new class requires a follow-up WP +
  DECISIONS entry; the drift-detection test fails loudly on union /
  array divergence.
- **`MAX_TURNS_PER_GAME` is carried as a local copy** in
  `sweep.analyze.ts` (D-19503). Mirrors the existing
  `par.aggregator.ts:450` precedent. Drift-pinned by a test that
  reads `simulation.runner.ts` source from disk and asserts the
  engine-side and analyzer-side literals match. Adding a new public
  export from `simulation.runner.ts` to share the constant is NOT
  in scope.
- **`ESCAPE_LIMIT` is imported** from `../endgame/endgame.types.js`
  (it is already a public export at `endgame.types.ts:46`). No
  local copy.
- **The analyzer is a pure helper** modulo its inputs and the
  operator-supplied callback (none in v1). No I/O inside the engine
  module. No `Math.random`. No `Date.now`. No environment access.
- **The analyzer is read-only over the manifest.** It does NOT
  modify, append to, truncate, or re-emit the manifest. The script
  opens the file in read mode only.
- **Fatal-record `errorSignature` is the first 80 chars** of the
  `error` field — no hashing, no stack-trace stripping, no
  normalization other than the prefix slice. The 80-char bound is
  arbitrary; the rationale is "long enough for the message to be
  unique in practice, short enough for the report table to remain
  readable" (D-19502).
- **Report format defaults to markdown** with JSON available via
  `--format json` (D-19504). Both formats are deterministic — same
  input → byte-identical output.
- **Malformed lines are non-fatal** — a stderr warning fires per
  malformed line, the malformed line is counted in the summary, and
  the analyzer proceeds with the remaining lines (D-19505). The
  malformed-line count is surfaced in the markdown header and in
  the JSON `malformedLines` array.
- **v1 locks to the two-axis manifest shape** (`schemeId` +
  `mastermindId`). The classifier does NOT carry optional fields
  for hypothetical third-axis manifests; multi-axis support is a
  follow-up WP (D-19506).
- **Script name is `analyze-sweep-manifest.mjs`** (D-19507),
  matching the verb-noun-noun pattern from
  `scripts/record-game-fixture.mjs`.
- **No `--re-run-anomalies` flag in v1.** The analyzer is read-only
  over the manifest; re-dispatch is outside scope.
- **No second execution path.** The analyzer does NOT call any of
  `sweepSetupMatrix`, `simulateOneGameAndCaptureMoves`,
  `runSimulation`, `runFixture`, or any other engine entry point
  that runs a game. It only consumes the on-disk manifest.
- **No new npm dependencies.**

### Session protocol

- Stop and ask on unclear items (e.g., a fatal-record `error`
  field's exact UTF-8 handling at the 80-char boundary — surrogate
  pair splitting is acceptable in v1 since `error` is ASCII in
  practice, but if the executor sees a unicode-heavy error message
  during smoke verification, surface it for review).
- If a file outside `## Files Expected to Change` needs
  modification, invoke `docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md`
  (allowlist amendment).

### Locked contract values

- **CLI shape (locked):**
  ```
  node scripts/analyze-sweep-manifest.mjs \
    --manifest <path-to-manifest.jsonl> \
    [--format markdown|json]
  ```
- **Default `--format`** = `markdown`.
- **CLI flag duplication rule** = last occurrence wins (e.g.,
  `--format markdown --format json` → `json`). No error on
  duplicates.
- **Anomaly taxonomy (closed 4-class set, canonical order):**
  `['endgame-reached', 'not-endgame', 'escaped-villain-cap', 'fatal']`.
- **`MAX_TURNS_PER_GAME`** = `200` (local copy in `sweep.analyze.ts`;
  drift-pinned to `simulation.runner.ts:54`).
- **`ESCAPE_LIMIT`** = `8` (imported from
  `endgame/endgame.types.ts:46`).
- **Error signature length** = `80` UTF-16 code units (first-N-chars
  prefix taken via `String.prototype.slice(0, 80)`).
- **Fatal error signature normalization** = NONE. The signature is
  the first 80 UTF-16 code units of the `error` string EXACTLY as
  present in the parsed JSON value. No trimming, no whitespace
  normalization, no newline stripping, no case folding, no hashing.
- **Record shape validation** = exact-set on enumerable
  own-properties. Success records MUST carry exactly 7 keys; the
  nested `outcome` MUST carry exactly 2 keys; fatal records MUST
  carry exactly 5 keys with `type === 'fatal'`. Extra keys,
  missing keys, wrong-typed fields, or non-canonical `type`
  values are malformed. Key order is NOT significant; validation
  is set-based.
- **Plain-object precondition** = the parser accepts ONLY plain
  object records. Arrays, `null`, primitives, and objects with
  non-`Object.prototype` prototypes (including prototype-pollution
  variants) are rejected as malformed. The predicate is
  `typeof value === 'object' && value !== null && Array.isArray(
  value) === false && Object.getPrototypeOf(value) ===
  Object.prototype`.
- **Fatal-signature table cell-seed preview count** = up to `3`
  (markdown table shows up to 3 cell seeds per signature, sorted
  lexicographically ascending; if fewer than 3 exist, all available
  seeds are shown; the full list is always available in the JSON
  output).
- **`totalCells`** counts ONLY successfully parsed records.
  Malformed lines are excluded from `totalCells`; their count is
  surfaced separately via the report header and the
  `malformedLines` array.
- **Numeric accumulation order** = the iteration order of the
  input array as received by the classifier (no reordering before
  summation). No Kahan summation or precision-compensating
  algorithm is used; raw IEEE-754 double-precision arithmetic is
  retained for cross-implementation reproducibility.
- **Mean rounding rule** = compute full-precision arithmetic mean
  first (IEEE-754 `sum / count`), THEN round to 2 decimal places
  via `Math.round(value * 100) / 100`. Never round before
  averaging.
- **Median rounding rule** = sort ascending; for odd `count` take
  the middle value; for even `count` compute the full-precision
  arithmetic mean of the two middle values FIRST, THEN round to 2
  decimal places via `Math.round(value * 100) / 100`. Never round
  before averaging.
- **`NumericDistributionStats.p95` method** = nearest-rank with
  index `Math.ceil(0.95 * count) - 1` over the ascending-sorted
  values. When `count === 1`, the index is `0` and `p95` equals
  the single value. When `count === 0`, `p95` is `null`.
- **Canonical JSON key ordering** = deep sort. All object keys
  MUST be sorted lexicographically ascending at every level.
  Arrays preserve their defined order unless explicitly sorted by
  the spec. Implementations MUST NOT rely on JavaScript object
  insertion order; the renderer builds a key-sorted intermediate
  object before `JSON.stringify`.
- **Lexicographic comparator** = JavaScript's default `<` string
  comparison (Unicode code-unit order), NOT
  `String.prototype.localeCompare` or any locale-aware
  comparator. `Array.prototype.sort()` with no comparator
  satisfies this; an explicit
  `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` is also acceptable.
  Locale-aware comparison is forbidden because collation tables
  differ across runtime ICU versions.
- **Stdout byte-stream contract** (both markdown and JSON) =
  UTF-8 encoding; exactly one trailing `\n` at end of stream; no
  byte-order mark (BOM) at the head of the stream.
- **Empty-section rendering rule (markdown)** = a section with
  zero contributing records renders exactly the section header
  followed by a single line containing the literal `(none)`. No
  inline variant.
- **Markdown formatting determinism** = percentages formatted as
  `N.N%` (exactly one decimal place + `%` symbol); distribution
  stats formatted as `N.NN` (2 decimal places); counts formatted
  as integers; no thousand separators; no trailing whitespace on
  table rows; line endings are LF (`\n`), never CRLF.
- **Fatal-signature column wrapping** = none. The markdown
  renderer MUST NOT manually wrap, soft-wrap, or truncate the
  signature column; line wrapping is left entirely to the
  operator's terminal renderer.
- **CLI flag-without-value rule** = a flag requiring a value
  with no following argv token (last argv element OR followed by
  another `--flag`) is INVALID; the parser emits a full-sentence
  stderr error naming the offending flag and exits non-zero. No
  silent default substitution.
- **Malformed-line warning emission order** = ascending
  `lineNumber` as the parser walks the file top-to-bottom. No
  batching, no reordering, no asynchronous interleaving.
- **`fatalErrorSignatures` retention** = full. Each
  `FatalErrorBucket.cellSeeds` array holds every matching
  `cellSeed`; no truncation, no per-bucket cap. The markdown
  preview shows only the first 3 (sort-stable); the JSON output
  carries the full list.

---

## Contract

### New exports from `sweep.analyze.ts`

```typescript
import type { EndgameOutcome } from '../endgame/endgame.types.js';
import { ESCAPE_LIMIT } from '../endgame/endgame.types.js';
import type { SweepCellResult } from './sweep.runner.js';

export type SweepAnomalyClass =
  | 'endgame-reached'
  | 'not-endgame'
  | 'escaped-villain-cap'
  | 'fatal';

export const SWEEP_ANOMALY_CLASSES: readonly SweepAnomalyClass[];

export interface ParsedSuccessRecord { /* type: 'success' + 7 manifest fields */ }
export interface ParsedFatalRecord { /* type: 'fatal' + 4 manifest fields */ }
export type ParsedManifestRecord = ParsedSuccessRecord | ParsedFatalRecord;

export interface ClassifiedCell { /* see §A */ }
export interface NumericDistributionStats { /* see §A */ }
export interface FatalErrorBucket { /* see §A */ }
export interface MalformedLine { /* see §A */ }
export interface ManifestSummary { /* see §A */ }
export interface ManifestClassification { /* see §A */ }

export interface ParseRecordResult {
  readonly record: ParsedManifestRecord | null;
  readonly malformedReason: string | null;
}

export function parseManifestLine(jsonText: string): ParseRecordResult;
export function classifyCell(record: ParsedManifestRecord): ClassifiedCell;
export function classifyManifestRecords(
  records: readonly ParsedManifestRecord[],
  malformedLines: readonly MalformedLine[],
): ManifestClassification;
```

No other exports. The classifier is pure; no side effects.

### Cross-path determinism contract

Two invocations of `classifyManifestRecords` with deep-equal inputs
MUST produce deep-equal outputs (including the order of
`fatalErrorSignatures` — sorted descending by `count` then ascending
by `signature` — and the order of `cellSeeds` within each bucket —
sorted lexicographically). The JSON-rendered report is byte-stable
across re-runs with the same manifest. The markdown-rendered report
is byte-stable for the same reason.

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-19501 | The anomaly oracle layer ships as an engine pure helper (`packages/game-engine/src/simulation/sweep.analyze.ts`) + operator CLI (`scripts/analyze-sweep-manifest.mjs`). The engine carries the classifier + parser; the script carries the I/O boundary and report rendering. | Mirrors WP-194's pure-helper + script-wrapper pattern, which keeps the load-bearing logic testable under `node:test` and avoids leaking I/O into the engine package. The script is thin (file read + line-by-line parse + classifier call + report format); the engine carries the classification rules + summary aggregation. Putting the classifier in the engine package also makes it reachable to a future dashboard widget or alternate consumer without re-implementing the logic in a non-engine surface. |
| D-19502 | Anomaly taxonomy is a closed 4-class set: `'endgame-reached'`, `'not-endgame'`, `'escaped-villain-cap'`, `'fatal'`. The manifest cannot distinguish `not-endgame` cap-hit from `not-endgame` stuck (both yield `endgameReached: false`); v1 merges them into one class and surfaces the bimodal `moveCount` distribution as the operator's discrimination signal. Fatal-record `errorSignature` is the first 80 **UTF-16 code units** of the `error` field, taken EXACTLY as present in the parsed JSON value — no hashing, no trimming, no whitespace normalization, no newline stripping, no case folding. | The four-class set is exhaustive and mutually exclusive over the manifest's record space (the manifest carries `endgameReached`, `outcome.escapedVillains`, and the fatal-vs-success discriminator — those three signals collapse onto exactly four legal classifications). Distinguishing cap-hit from stuck requires a manifest field WP-194 does not emit (`turnsElapsed`); rather than back-fill an inferred discriminator from `moveCount` (which conflates "many dispatched moves per turn" with "many turns"), v1 surfaces them as one class with a distribution slice. The 80-code-unit error signature balances uniqueness against table readability — long enough to disambiguate distinct error sites, short enough to render in a markdown table column without wrapping. Hashing was considered and rejected: a hash is opaque to operators reading the markdown report, while a prefix is human-readable and stable enough to group identical errors across cells. No-normalization is locked because any normalization (trim, lowercase, newline strip) is a divergence vector across implementations; the verbatim prefix is the simplest deterministic contract. |
| D-19503 | `MAX_TURNS_PER_GAME` is carried as a local copy in `sweep.analyze.ts`, drift-pinned to `simulation.runner.ts:54` via a test that reads both source files and asserts byte equality. `ESCAPE_LIMIT` is imported from `endgame/endgame.types.ts` (already a public export). | `MAX_TURNS_PER_GAME` is currently file-private in `simulation.runner.ts`; exporting it would add a public engine API surface for a value that is functionally a runtime constant. The precedent at `par.aggregator.ts:450` (which also carries a local copy of the same constant) is the established pattern. The drift-gate test guarantees the local copy stays in sync; if the engine value ever changes, the test fires loudly and forces both copies to update in the same commit. `ESCAPE_LIMIT` is already exported and is imported directly. |
| D-19504 | Report format is `--format markdown\|json` with **markdown default**. Both formats are deterministic (same input → byte-identical output). Markdown is the operator-reading default; JSON is canonical (sorted keys at every level) for downstream tooling ingestion. | Markdown matches the operator's primary use case (reading the report in a terminal or pasted into a PR comment). JSON exists for future downstream consumers (dashboard widgets, multi-manifest trend tooling) that need structured input. Both formats are deterministic so manifest-analyzer composition with diff tools is stable. The default was chosen by analogy with WP-194's one-line stdout summary: WP-194's primary stdout consumer is the operator reading the result, not a tool; WP-195 inherits the same posture. |
| D-19505 | Malformed manifest lines are non-fatal. The analyzer emits a full-sentence stderr warning naming the line number + reason, counts the malformed line in the summary, and proceeds with the remaining lines. The malformed-line count is surfaced in the markdown header and in the JSON `malformedLines` array. | A manifest with a single corrupted line is a real failure mode (partial write during sweep abort, manual edit by an operator, disk corruption). Aborting the analyzer on first malformed line would lose all the analysis for the rest of the manifest. The warn-and-continue policy mirrors WP-194's resume-scan posture (which also tolerates malformed lines for the skip-set scan). The line count is surfaced so the operator sees the cardinality and knows whether the malformed lines are a small noise floor or a systemic issue worth investigating. |
| D-19506 | v1 locks to the two-axis manifest shape (`schemeId` + `mastermindId`). The classifier carries NO optional fields for hypothetical multi-axis manifests; if WP-194 follow-ups add a third axis, the analyzer extends with the new axis at that point. | This mirrors D-19401's anti-premature-generality posture at the analysis layer: WP-194's `cartesianProduct` is N-axis-generic at the matrix-builder layer, but the CLI + manifest record shape lock to the two-axis MVP. WP-195 inherits the same lock. Speculatively future-proofing the classifier for a third axis that may never land would introduce optional fields that complicate the type signatures and the report rendering without buying any operator value today. The follow-up WP that adds the third axis is the right place to extend both WP-194's manifest emission and WP-195's classifier in one coordinated change. |
| D-19507 | The operator CLI script is named `scripts/analyze-sweep-manifest.mjs`, following the verb-noun-noun naming pattern from `scripts/record-game-fixture.mjs`. | Naming consistency across the simulation-tooling script family makes the script set self-describing. The candidates `sweep-analyze.mjs` (matches WP-194's `sweep-setup-matrix.mjs`) and `classify-sweep-anomalies.mjs` (more specific) were considered; the verb-noun-noun pattern was chosen because the recorder precedent already exists and is the closer analog (both are read-the-input + produce-an-output tools, vs. WP-194's dispatch-the-loop posture). |

---

## Acceptance Criteria

### Anomaly taxonomy + classifier

1. `packages/game-engine/src/simulation/sweep.analyze.ts` exports
   exactly these symbols: `SweepAnomalyClass`,
   `SWEEP_ANOMALY_CLASSES`, `ParsedSuccessRecord`,
   `ParsedFatalRecord`, `ParsedManifestRecord`, `ClassifiedCell`,
   `NumericDistributionStats`, `FatalErrorBucket`, `MalformedLine`,
   `ManifestSummary`, `ManifestClassification`, `ParseRecordResult`,
   `parseManifestLine`, `classifyCell`, `classifyManifestRecords`.
   Nothing else, in any order.
2. `SWEEP_ANOMALY_CLASSES` deep-equals the literal array
   `['endgame-reached', 'not-endgame', 'escaped-villain-cap',
   'fatal']` in that exact order (canonical-array drift gate).
3. `classifyCell` returns `'endgame-reached'` for a success record
   with `endgameReached: true` and `outcome.escapedVillains < 8`.
4. `classifyCell` returns `'not-endgame'` for any success record
   with `endgameReached: false`, regardless of other fields.
5. `classifyCell` returns `'escaped-villain-cap'` for a success
   record with `endgameReached: true` and
   `outcome.escapedVillains >= 8`.
6. `classifyCell` returns `'fatal'` for any fatal record;
   `errorSignature` equals the first 80 UTF-16 code units of the
   `error` field (or the full `error` string if shorter) taken
   EXACTLY as present in the parsed JSON value (no trimming, no
   whitespace normalization, no newline stripping).
7. `parseManifestLine` returns `record: ParsedSuccessRecord` with
   `type: 'success'` for a valid 7-key success-shape JSON line.
8. `parseManifestLine` returns `record: ParsedFatalRecord` with
   `type: 'fatal'` for a valid 5-key fatal-shape JSON line.
9. `parseManifestLine` returns `record: null, malformedReason:
   <full-sentence>` for any of: non-JSON input; JSON-but-neither-shape;
   success shape with missing field; success shape with wrong-typed
   field; fatal shape with wrong `type` value; success or fatal
   shape with an extra (unexpected) key; nested `outcome` object
   with an extra or missing key.
10. `parseManifestLine` rejects any **non-plain-object** input with
    `record: null, malformedReason: <full-sentence>`. The
    rejected-input set MUST include at minimum: a JSON array
    (e.g., `[1, 2, 3]`); the JSON literal `null`; a JSON primitive
    (e.g., `"a string"`, `42`, `true`); and (where the runtime
    can construct one in a test) an object whose prototype is not
    `Object.prototype`. The acceptance contract is the plain-object
    predicate locked in §A: `typeof value === 'object' && value !==
    null && Array.isArray(value) === false && Object.getPrototypeOf(
    value) === Object.prototype`.
11. `classifyManifestRecords` is deterministic: two invocations
    with deep-equal inputs produce deep-equal outputs (including
    `fatalErrorSignatures` order, `cellSeeds` order within buckets,
    and the order of any other internally sorted arrays).
12. `classifyManifestRecords` summary satisfies the cell-count
    invariants for every input:
    - `totalCells === records.length` — `totalCells` counts ONLY
      successfully parsed records; malformed lines are EXCLUDED
      from `totalCells` and tracked separately in the
      `malformedLines` array.
    - `sum(anomalyCounts) === totalCells` — summed across the
      four canonical anomaly classes.
    - `sum(winnerCounts) === totalCells` — summed across the
      three buckets `'heroes-win'`, `'scheme-wins'`, `null`.
      Fatal records contribute to the `null` bucket; success
      records with `outcome.winner === null` also contribute to
      the `null` bucket.
13. `NumericDistributionStats` returns all-`null` fields when
    `count === 0`. When `count === 1`, `min === max === mean ===
    median === p95 === <the single value>` (with `mean` and
    `median` rounded to 2 decimal places). When `count >= 2`,
    `mean` and `median` use the locked rounding rule (average to
    full precision FIRST, then round). `p95` uses nearest-rank
    with index `Math.ceil(0.95 * count) - 1`. Sum accumulation
    honors the input array's iteration order (no reordering
    before summation; no Kahan-style precision compensation).
14. `fatalErrorSignatures` is sorted descending by `count`, then
    ascending by `signature`; `cellSeeds` within each bucket are
    sorted lexicographically ascending. Each bucket's `cellSeeds`
    array is the FULL set matching the signature — no truncation,
    no per-bucket cap (v1 retention guarantee).
15. The local `MAX_TURNS_PER_GAME` value in `sweep.analyze.ts`
    matches the engine value at `simulation.runner.ts:54` (drift
    gate). A test asserts both source files contain the literal
    `const MAX_TURNS_PER_GAME = 200;`.
16. `ESCAPE_LIMIT` is imported from `../endgame/endgame.types.js`
    and used at the classification boundary; no local copy of `8`
    appears in `sweep.analyze.ts` (grep returns zero `8` literal in
    a comparison context).
17. No `Math.random` call sites in `sweep.analyze.ts` (drift gate;
    existing invariant preserved).
18. No `boardgame.io` import in `sweep.analyze.ts` (drift gate;
    existing invariant preserved).
19. No `@legendary-arena/registry` import in `sweep.analyze.ts`
    (drift gate; existing invariant preserved).

### Analyzer CLI

20. `node scripts/analyze-sweep-manifest.mjs --manifest <path>`
    exits 0 against any valid WP-194 manifest and writes a
    markdown report to stdout.
21. `--format json` produces canonical JSON with **deep-sorted
    keys** (every nested object's keys lexicographically ascending
    using Unicode code-unit order — NOT `localeCompare` — not just
    at the top level), 2-space indent, and a trailing newline.
    Two invocations with the same manifest produce byte-identical
    stdout output.
22. `--format markdown` (or the absent `--format` flag) produces
    a markdown report with the section headings `# Sweep Manifest
    Analysis`, `## Anomaly Distribution`, `## Winner Distribution`,
    `## Move Count (success records only)`, `## Escaped Villains
    (success records only)`, `## Fatal Error Signatures` in that
    order.
23. Markdown formatting determinism: percentages appear as `N.N%`
    (exactly one decimal place + `%`); distribution stats appear
    as `N.NN` (2 decimal places); counts as integers without
    separators; table rows have no trailing whitespace; line
    endings are LF (`\n`).
24. **Stdout byte-stream contract** (both formats): the output is
    encoded in UTF-8; the entire output terminates with exactly
    one trailing `\n` (no double-newline at EOF, no missing
    terminator); no byte-order mark (BOM) is emitted at the head
    of the output.
25. CLI duplicate-flag rule: if a flag appears more than once
    (e.g., `--format markdown --format json`), the last
    occurrence wins; no error is emitted.
26. CLI flag-without-value rule: a flag that requires a value but
    has no following argv token (the flag is the last argv element
    OR the next argv token is itself another `--flag`) → exit
    non-zero with a full-sentence stderr error naming the offending
    flag. No silent default substitution.
27. Missing `--manifest` flag → full-sentence stderr error +
    exit non-zero.
28. Invalid `--format` value (e.g., `--format xml`) → full-sentence
    stderr error + exit non-zero.
29. File-not-found on `--manifest <path>` → full-sentence stderr
    error naming the path + exit non-zero.
30. An empty manifest file is non-fatal: exit 0 with a zero-cell
    report. The markdown report renders each section's body as the
    single literal line `(none)`; the JSON report carries
    `summary.totalCells === 0`, all `anomalyCounts` keys at `0`,
    all `NumericDistributionStats` fields `null`, and
    `fatalErrorSignatures: []`.
31. Malformed manifest lines emit a full-sentence stderr warning
    of the form `Manifest line N is malformed: <reason>.` (one per
    malformed line) in **ascending line-number order** (no
    batching, no reordering); the analyzer continues processing
    remaining lines; the malformed count appears in the report
    header.
32. The script does NOT modify the manifest file (verified by
    pre/post hash comparison in the smoke verification step).

### Tests

33. `pnpm --filter @legendary-arena/game-engine test` exits 0 with
    new tests in
    `packages/game-engine/src/simulation/sweep.analyze.test.ts`.
34. The new test file contributes **≥12 tests** covering: the
    closed-set drift gate, the four classifyCell rules (with
    boundary cases for `escapedVillains` at 7/8/12), the fatal
    `errorSignature` length cases, the
    `classifyManifestRecords` summary counts + distributions +
    empty-input case + count=1 stat case, the
    `parseManifestLine` shape checks (success / fatal / 5
    malformed variants including extra-key cases AND the
    non-plain-object rejection cases from AC 10), the
    `MAX_TURNS_PER_GAME` drift gate, and the determinism
    invariant.
35. The pre-existing simulation tests are byte-identical in count
    (no drift on the WP-194 baseline 943).

### Build + scope

36. `pnpm --filter @legendary-arena/game-engine build` exits 0.
37. `pnpm -r build` exits 0.
38. No files outside `## Files Expected to Change` were modified
    (`git diff --name-only` matches the file list exactly).
39. `sweep.runner.ts`, `simulation.runner.ts`, `runFixture.ts`,
    `fixtureSchema.ts`, `replay.execute.ts` are NOT modified
    (zero diff).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — full monorepo build
pnpm -r build
# Expected: exits 0

# Step 3 — run all game-engine tests (includes the new
# sweep.analyze.test.ts file)
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing.
# Pre-existing simulation test count preserved (943 baseline + ≥12 new).

# Step 4 — confirm new exports exist on sweep.analyze.ts
Select-String -Path "packages\game-engine\src\simulation\sweep.analyze.ts" `
  -Pattern "export (type|const|interface|function) (SweepAnomalyClass|SWEEP_ANOMALY_CLASSES|ParsedSuccessRecord|ParsedFatalRecord|ParsedManifestRecord|ClassifiedCell|NumericDistributionStats|FatalErrorBucket|MalformedLine|ManifestSummary|ManifestClassification|ParseRecordResult|parseManifestLine|classifyCell|classifyManifestRecords)"
# Expected: ≥15 matches (one per exported symbol)

# Step 5 — confirm closed-set anomaly classes literal
Select-String -Path "packages\game-engine\src\simulation\sweep.analyze.ts" `
  -Pattern "'endgame-reached'|'not-endgame'|'escaped-villain-cap'|'fatal'"
# Expected: ≥4 matches (one literal per class; may appear more in
# the union + array declarations)

# Step 6 — confirm MAX_TURNS_PER_GAME local copy matches engine
Select-String -Path "packages\game-engine\src\simulation\sweep.analyze.ts" `
  -Pattern "const MAX_TURNS_PER_GAME = 200;"
# Expected: 1 match (the local copy with the drift-pin // why: comment)

Select-String -Path "packages\game-engine\src\simulation\simulation.runner.ts" `
  -Pattern "const MAX_TURNS_PER_GAME = 200;"
# Expected: 1 match (the engine-side authoritative value; drift gate)

# Step 7 — confirm no Math.random / boardgame.io / registry imports in simulation/
Select-String -Path "packages\game-engine\src\simulation\" -Pattern "Math\.random\(" -Recurse
# Expected: no code-line matches (pre-existing JSDoc convention comments may remain)

Select-String -Path "packages\game-engine\src\simulation\" -Pattern "from 'boardgame.io" -Recurse
# Expected: no output

Select-String -Path "packages\game-engine\src\simulation\" -Pattern "from '@legendary-arena/registry'" -Recurse
# Expected: no output

# Step 8 — confirm analyzer CLI is wired
Select-String -Path "scripts\analyze-sweep-manifest.mjs" -Pattern "TODO|FIXME|deferred to a follow-up WP"
# Expected: no output

Select-String -Path "scripts\analyze-sweep-manifest.mjs" -Pattern "classifyManifestRecords|parseManifestLine"
# Expected: ≥2 matches (the imports + call sites)

# Step 9 — produce a smoke manifest via WP-194, then analyze it
# (uses the WP-194 sweep CLI; manifests live under sweep-output/ which
# is gitignored, so the smoke artifacts are not tracked)
$schemeIds = '["smoke/scheme-b", "smoke/scheme-a"]'
$mastermindIds = '["smoke/mastermind-y", "smoke/mastermind-x"]'
Set-Content -Path "smoke-wp195-schemes.json" -Value $schemeIds
Set-Content -Path "smoke-wp195-masterminds.json" -Value $mastermindIds

node scripts/sweep-setup-matrix.mjs `
  --run-id wp195-smoke `
  --seed wp195-smoke-seed-1 `
  --setup apps/arena-client/public/loadout-test.json `
  --scheme-ids smoke-wp195-schemes.json `
  --mastermind-ids smoke-wp195-masterminds.json `
  --policy random
# Expected: exits 0 with 4 lines in sweep-output/wp195-smoke/manifest.jsonl

# Step 10 — analyze the smoke manifest (markdown default)
$manifestHashBefore = (Get-FileHash sweep-output/wp195-smoke/manifest.jsonl).Hash
node scripts/analyze-sweep-manifest.mjs `
  --manifest sweep-output/wp195-smoke/manifest.jsonl
# Expected: exits 0; stdout contains "# Sweep Manifest Analysis",
# "## Anomaly Distribution", "Total cells: 4", and one row per
# anomaly class. The exact anomaly distribution depends on the
# random-policy + empty-registry combination but each row's count
# must sum to 4.

$manifestHashAfter = (Get-FileHash sweep-output/wp195-smoke/manifest.jsonl).Hash
# Expected: $manifestHashBefore -eq $manifestHashAfter (analyzer is read-only)

# Step 11 — analyze the smoke manifest as JSON
node scripts/analyze-sweep-manifest.mjs `
  --manifest sweep-output/wp195-smoke/manifest.jsonl `
  --format json | Out-File -Encoding utf8 sweep-output/wp195-smoke/analysis.json
# Expected: exits 0; sweep-output/wp195-smoke/analysis.json is valid
# canonical JSON; ConvertFrom-Json parses cleanly

$parsed = Get-Content sweep-output/wp195-smoke/analysis.json -Raw | ConvertFrom-Json
$parsed.summary.totalCells
# Expected: 4
($parsed.summary.anomalyCounts.PSObject.Properties.Name | Sort-Object) -join ','
# Expected: "endgame-reached,escaped-villain-cap,fatal,not-endgame"
# (lex-sorted keys per the canonical-JSON convention)

# Step 12 — determinism: re-run the analyzer with the same input
node scripts/analyze-sweep-manifest.mjs `
  --manifest sweep-output/wp195-smoke/manifest.jsonl `
  --format json | Out-File -Encoding utf8 sweep-output/wp195-smoke/analysis-2.json
# Expected: byte-identical to analysis.json
(Get-FileHash sweep-output/wp195-smoke/analysis.json).Hash -eq `
  (Get-FileHash sweep-output/wp195-smoke/analysis-2.json).Hash
# Expected: True

# Step 13 — error paths
node scripts/analyze-sweep-manifest.mjs
# Expected: exits non-zero; stderr contains a full-sentence message
# naming the missing --manifest flag

node scripts/analyze-sweep-manifest.mjs --manifest does-not-exist.jsonl
# Expected: exits non-zero; stderr contains a full-sentence message
# naming the file path and the read error

node scripts/analyze-sweep-manifest.mjs --manifest sweep-output/wp195-smoke/manifest.jsonl --format xml
# Expected: exits non-zero; stderr contains a full-sentence message
# naming the invalid --format value

# Step 14 — malformed-line handling
Add-Content -Path sweep-output/wp195-smoke/manifest.jsonl -Value "not-a-json-line"
node scripts/analyze-sweep-manifest.mjs `
  --manifest sweep-output/wp195-smoke/manifest.jsonl 2>&1 | Out-String
# Expected: exits 0; stderr (captured via 2>&1) contains the substring
# "Manifest line 5 is malformed:" and the markdown report header
# reports "Malformed lines: 1"

# Step 15 — empty manifest is non-fatal
Set-Content -Path sweep-output/wp195-empty-manifest.jsonl -Value ""
node scripts/analyze-sweep-manifest.mjs `
  --manifest sweep-output/wp195-empty-manifest.jsonl
# Expected: exits 0; stdout reports "Total cells: 0" + each section
# renders "(none)" in markdown

# Step 15b — CLI duplicate-flag rule: last occurrence wins
node scripts/analyze-sweep-manifest.mjs `
  --manifest sweep-output/wp195-smoke/manifest.jsonl `
  --format markdown `
  --format json | Out-File -Encoding utf8 sweep-output/wp195-smoke/dup-format.json
# Expected: exits 0; output is valid JSON (the second --format wins,
# overriding the first); ConvertFrom-Json parses cleanly
Get-Content sweep-output/wp195-smoke/dup-format.json -Raw | ConvertFrom-Json | Out-Null
# Expected: no error

# Step 15c — JSON deep-sort spot check (every nested object's keys
# are lex-sorted, not just the top level)
$json = Get-Content sweep-output/wp195-smoke/analysis.json -Raw
# The outcome.* sub-object on each ClassifiedCell would expose
# any non-deep-sort renderer (escapedVillains < winner lex-order).
# Spot-check that any `"outcome":` substring is followed in the
# canonical order by `"escapedVillains"` before `"winner"`.
$json -match '"outcome":\s*\{\s*"escapedVillains"'
# Expected: True (proves deep-sort is in effect; an insertion-order
# renderer would emit "winner" before "escapedVillains" since the
# parsed-record interface declares winner first in TypeScript)

# Step 16 — clean up the smoke artifacts
Remove-Item -Recurse -Force sweep-output/wp195-smoke
Remove-Item sweep-output/wp195-empty-manifest.jsonl
Remove-Item smoke-wp195-schemes.json
Remove-Item smoke-wp195-masterminds.json
# Expected: exits 0; no smoke-wp195-* or sweep-output/wp195-* remain

# Step 17 — confirm no files outside scope changed
git diff --name-only
git ls-files --others --exclude-standard
# Expected: only files listed in ## Files Expected to Change appear
# in either output; no smoke artifacts remain
```

---

## Definition of Done

- [ ] All 39 acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] No new `Math.random()` call sites in any new or modified file
- [ ] No `boardgame.io` import in any new or modified file under
      `packages/game-engine/src/simulation/`
- [ ] No `@legendary-arena/registry` import in any new or modified
      file under `packages/game-engine/src/simulation/`
- [ ] WP-194 outputs (`sweep.runner.ts`, the sweep CLI) are NOT
      modified (confirmed with `git diff`)
- [ ] WP-193 outputs (`simulation.runner.ts`, the recorder) are NOT
      modified (confirmed with `git diff`)
- [ ] WP-158 outputs (`runFixture.ts`, `fixtureSchema.ts`,
      `replay.execute.ts`) are NOT modified (confirmed with
      `git diff`)
- [ ] Verification Step 10 (smoke markdown report) exits 0 with
      `Total cells: 4` and anomaly counts summing to 4
- [ ] Verification Step 11 (smoke JSON report) parses cleanly with
      `summary.totalCells === 4` and the four canonical anomaly
      class keys present
- [ ] Verification Step 12 (determinism: two JSON runs byte-identical)
      passes
- [ ] Verification Step 14 (malformed line warning + count surface)
      passes
- [ ] Verification Step 15 (empty manifest non-fatal) exits 0
- [ ] Smoke artifacts from Verification Steps 9–15 are deleted
      before commit (`git status` + `git ls-files --others
      --exclude-standard` show no `sweep-output/wp195-*/`,
      `smoke-wp195-*` paths)
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only` matches the file list exactly)
- [ ] `docs/ai/STATUS.md` updated with WP-195 / EC-222 block
- [ ] `docs/ai/DECISIONS.md` updated with D-19501..D-19507 verbatim
      (proposed strings from §Decisions Introduced above; the EC-222
      SPEC-hardening pass may tighten the wording before execution)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-195 checked off with
      today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-222 flipped to
      Done
- [ ] `docs/ai/REFERENCE/complete-game-tests.md` carries the new
      §"Sweep manifest analysis (WP-195)" section

---

## Vision Alignment

**Vision clauses touched:** §3 (determinism), §11 (testing rigor),
§22 (replay faithfulness).

**Conflict assertion:** No conflict. WP-195 strengthens all three
clauses:

- §3 (determinism): the classifier is a pure function modulo its
  inputs; no `Math.random()`; no wall-clock; no environment access.
  Two invocations with the same input produce byte-identical
  output. The analyzer is read-only over the manifest.
- §11 (testing rigor): WP-195 provides the operator-facing surface
  that makes WP-194's bulk manifest legible. Together they cover
  the "deterministic traversal + classification of setup-space"
  primitive the simulation-tooling chain is building toward.
- §22 (replay faithfulness): each classified cell's `cellSeed` is
  preserved verbatim from the manifest, so an operator inspecting
  any anomalous cell can extract its `cellSeed` and reproduce the
  run via the WP-193 recorder. WP-195 does not interpolate, hash,
  or transform the seed; it surfaces it as-is.

**Non-Goal proximity check:** NG-1..7 not crossed. WP-195 is an
internal operator-facing tool (the analyzer CLI) that consumes a
gitignored bulk artifact (the manifest) and emits a stdout report;
no monetization, ranking, persuasive copy, identity storage, or
competitive surface is touched. The four anomaly classes are
descriptive operator nomenclature, not user-facing labels.

**Determinism preservation:** The analyzer is deterministic by
construction:

- `parseManifestLine` is pure string-in / object-out
- `classifyCell` is a pure switch on three manifest fields
  (`endgameReached`, `outcome.escapedVillains`, `type`)
- `classifyManifestRecords` is pure aggregation; the only sort
  comparators are lexicographic and the only numeric operations are
  sum / mean / median / p95 / count
- The markdown and JSON renderers are deterministic functions of
  the `ManifestClassification` object

---

## Funding Surface Gate

§20 N/A with justification: WP-195 is an internal operator-facing
simulation-tooling analyzer; no UI surfaces, no user-visible copy,
no funding channels referenced. The analytical / retrospective
mention carve-out (§20.1) applies — the only references to player
or business surfaces in this WP are conceptual citations of the
broader simulation-tooling chain. WP-097 §F G-1..G-7 are not
triggered because no funding affordance is added, modified,
removed, or proposed.

---

## API Catalog (§21)

§21 N/A with justification: WP-195 adds NO `apps/server` HTTP
endpoint and modifies NO `apps/server/src/**` library function
recorded in `docs/ai/REFERENCE/api-endpoints.md` as `Library-only`.
The new surfaces are a `packages/game-engine/src/simulation/` pure
helper (engine-only, not server-reachable) and a `scripts/`
operator CLI (process-boundary tool, not an HTTP endpoint). No
catalog row is added, modified, removed, or status-changed.

---

## Future Work (Explicitly Deferred)

WP-195 is one of the **WP-A..WP-E pre-mortem grouping** companion
WPs (drafted in discussion 2026-05-31 alongside WP-196). The
broader simulation-tooling chain extends beyond v1:

| Topic | Why Deferred |
|---|---|
| Distinguishing `not-endgame` cap-hit from stuck-game | Requires `turnsElapsed` in the manifest; manifest-shape change owned by a WP-194 follow-up, not by the analyzer. |
| `--re-run-anomalies` bridge from anomalous cells back to the WP-193 recorder | Re-dispatch is out of scope per D-19501 (read-only over manifest). A future WP can add a bridge if operators surface a real workflow need. |
| `--write-fixtures` bridge from anomalous cells to `runFixture` fixtures | WP-194 explicitly deferred this; WP-195 does not re-litigate. |
| Multi-manifest aggregation (manifest A vs manifest B trend analysis) | v1 consumes one manifest at a time. Cross-run analysis requires a separate composition layer; defer until the v1 single-manifest workflow stabilizes. |
| Real-registry-driven analysis (replacing `EMPTY_REGISTRY`) | WP-194 uses `EMPTY_REGISTRY`; cell outcomes vary only via per-cell seed decorrelation. Real-registry sweep + analysis requires a registry-loading WP that lands `EMPTY_REGISTRY` → real registry across both the sweep runner and the analyzer. |
| Multi-axis manifest support (third axis: villain groups, hero decks, player counts) | WP-194's MVP locks to schemeId × mastermindId; D-19506 mirrors that lock at the analysis layer. Both WPs extend in tandem when the follow-up adds a third axis. |
| Distinguishing fatal-record error signatures by deterministic hash instead of 80-char prefix | D-19502 chose the prefix for operator readability. If signature collisions surface (two unrelated errors with identical first 80 chars), a follow-up can introduce a hybrid (prefix + content hash) signature scheme. |
| Dashboard widget consuming `ManifestClassification` JSON output | The analyzer's JSON output format is the contract a future dashboard widget would consume. v1 ships the contract; the widget is a separate apps/dashboard WP. |

---

## Anti-Patterns to Avoid

- Do NOT call `sweepSetupMatrix`, `simulateOneGameAndCaptureMoves`,
  `runSimulation`, or `runFixture` from the analyzer — it is
  read-only over the manifest.
- Do NOT modify the manifest file from the analyzer (no append, no
  truncate, no re-emit). The smoke verification step asserts the
  pre/post hash matches.
- Do NOT introduce a fifth anomaly class without an explicit
  DECISIONS entry; the four-class set is locked.
- Do NOT hash the fatal-error signature; D-19502 locks the first
  80 UTF-16 code units verbatim.
- Do NOT trim, lowercase, normalize whitespace, or strip newlines
  from the fatal-error signature; D-19502 locks the prefix as
  EXACTLY present in the parsed JSON.
- Do NOT rely on JavaScript object insertion order in the JSON
  renderer; build a key-sorted intermediate object at every
  nesting level before `JSON.stringify`. Insertion-order
  determinism is not guaranteed across Node runtime versions.
- Do NOT round before averaging in `mean` or `median`; full-
  precision arithmetic FIRST, then `Math.round(value * 100) / 100`.
- Do NOT coerce, repair, or tolerate malformed records; the parse
  contract is exact-set. Extra keys, missing keys, wrong-typed
  fields, arrays, `null`, primitives, and objects with
  non-`Object.prototype` prototypes all produce `malformedReason`.
- Do NOT use `String.prototype.localeCompare` (or any
  locale-aware comparator) for JSON key sorting or for any
  spec-mandated lexicographic array sort; use Unicode code-unit
  order (`<` comparison) exclusively. Locale-aware sort is a
  cross-environment determinism vector.
- Do NOT introduce Kahan summation or any
  precision-compensating accumulator for distribution stats;
  raw IEEE-754 `sum / count` is the locked contract. Sum order
  follows input-array iteration order with no reordering.
- Do NOT emit a UTF-8 BOM at the head of stdout; the byte-stream
  contract forbids it. Do NOT emit a double-newline at EOF; the
  output terminates with exactly one trailing `\n`.
- Do NOT format percentages without the `%` symbol or with more
  than one decimal place; markdown determinism requires the exact
  `N.N%` shape.
- Do NOT clamp the `escapedVillains` distribution at `ESCAPE_LIMIT`;
  values above 8 are real and informative (the engine allows
  `escapedVillains` to exceed 8 within a single turn before
  `evaluateEndgame` fires).
- Do NOT export `MAX_TURNS_PER_GAME` from `simulation.runner.ts`
  to share the constant; the local-copy + drift-gate precedent is
  established by `par.aggregator.ts:450` and D-19503.
- Do NOT introduce a new npm dependency for argument parsing,
  markdown rendering, or JSON formatting; standard library only.
- Do NOT use `Array.reduce()` with branching logic in the classifier
  or summary aggregation (00.6 Rule 7); use explicit `for...of`
  loops.
- Do NOT silently coalesce malformed lines; D-19505 requires a
  stderr warning per line AND a count in the report.
- Do NOT pretty-print the JSON output without sorted keys;
  determinism requires canonical JSON.
- Do NOT add a `--verbose` or `--quiet` flag; v1 emits the report
  to stdout + warnings to stderr, no log-level switches.

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| `summary.anomalyCounts` doesn't sum to `totalCells` | Classifier branch missed a record; check the `if/else if/else` chain in `classifyCell` |
| `winnerCounts` doesn't sum to `totalCells` | Fatal records not being added to the `null` bucket; check the fatal-handling branch |
| Drift-gate test fails after a routine WP-036 follow-up | Engine `MAX_TURNS_PER_GAME` changed; update both the engine constant and the local copy in `sweep.analyze.ts` in the same commit |
| JSON output is not byte-identical across re-runs | Object keys not sorted at some nesting level; verify `JSON.stringify(value, null, 2)` is called on a key-sorted intermediate object |
| Markdown report renders dashes (`-`) in numeric cells | Distribution stats returned `null` but the renderer doesn't have a `null`-handling branch; the markdown formatter must emit `(none)` for zero-count distributions |
| `fatalErrorSignatures` order changes across re-runs | Sort comparator is not deterministic; verify the descending-count + ascending-signature comparator and the lexicographic `cellSeeds` sort within buckets |
| Smoke Step 14 reports `Manifest line 4 is malformed:` instead of line 5 | Line numbering is 0-based instead of 1-based; verify the script's line-number tracking starts at 1 (the first line of the file is line 1) |
| Empty manifest reports `Total cells: 1` | The trailing newline split produced an empty final string that the parser didn't drop; verify the empty-final-entry drop logic |
| Analyzer modifies the manifest file | An accidental file open in append-mode; verify all `readFile` calls use the default read-mode flag |
| JSON output differs across Node versions but markdown is stable | JSON renderer relies on object insertion order; build a key-sorted intermediate object at every nesting level before `JSON.stringify` |
| `mean` value off-by-one cent vs. expected in tests | Rounding happened before averaging; reorder to average-then-round per D-19502 |
| `p95` is `null` for a 1-element distribution | Off-by-one in the nearest-rank index calculation; verify `Math.ceil(0.95 * 1) - 1 === 0`, not `-1` |
| Fatal signatures with a leading whitespace group separately from the trimmed variant | The renderer trimmed the signature; D-19502 forbids any normalization — the prefix is verbatim |
| Markdown percentage column shows `12.30%` instead of `12.3%` | The formatter used `toFixed(2)` instead of `toFixed(1)` for percentages |
| Duplicate `--manifest` flag yields a confusing error instead of last-wins | The argv parser is strict; switch to a last-wins reducer over the argv array |
| `--manifest` at the end of argv silently uses an empty-string path | Flag-without-value rule not enforced; detect the missing value position (last argv token OR next token starts with `--`) and error out |
| JSON output differs between operators on different OS locales but is stable per-operator | The JSON renderer used `String.prototype.localeCompare` instead of `<` Unicode code-unit comparison; switch to `keys.sort()` with no comparator |
| Stdout shows a BOM at the start in some downstream tools | An `Out-File -Encoding utf8` (PS 5.1) or similar wrapper added a BOM; emit raw UTF-8 via `process.stdout.write` (Node's stdout never emits a BOM) |
| Two `mean` runs differ at the 4th–5th decimal between runs of the same script | Sum accumulation order varied between runs (an upstream sort or filter reordered the array before stats); honor input-array iteration order verbatim |
| `parseManifestLine` accepts an array `[1, 2, 3]` and crashes on a downstream property access | Plain-object precondition not enforced; reject arrays / `null` / primitives / non-`Object.prototype` objects with `malformedReason` |
| Malformed-line warnings appear out of order across re-runs | Asynchronous batching of warnings; emit them synchronously in line-number order inside the same loop that parses |

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| §1  | All required WP sections present (Goal, Assumes, Context, Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done) | PASS |
| §2  | Non-Negotiable Constraints present (engine-wide + packet-specific + session protocol + locked contract values); full-file output mandated; references `00.6-code-style.md` | PASS |
| §3  | `## Assumes` lists WP-194 + WP-193 + WP-036 and the exact exports each must provide; baseline test count (943) named; build commands listed | PASS |
| §4  | `## Context (Read First)` cites specific docs + section numbers; DECISIONS scan list enumerated by D-number; ARCHITECTURE §Layer Boundary cited | PASS |
| §5  | 8 files listed with new/modified + descriptions; bounded; no ambiguous "update this" language | PASS |
| §6  | Field names match WP-194's manifest contract (`schemeId`, `mastermindId`, `cellSeed`, `cellIndex`, `endgameReached`, `moveCount`, `outcome.escapedVillains`, `outcome.winner`, `type`, `error`); `EndgameOutcome` and `ESCAPE_LIMIT` cited from `endgame/endgame.types.ts` verbatim | PASS |
| §7  | No new npm dependencies | PASS |
| §8  | Engine-only (`simulation/`) + `scripts/` (CLI boundary) + reference docs; no layer boundary violations; `sweep.runner.ts` exports not widened; `simulation.runner.ts` not modified; pure-helper rule preserved | PASS |
| §9  | Verification Steps use PowerShell + `Select-String` + Windows-style paths; `Get-FileHash` for byte-comparison; `Out-File -Encoding utf8` for write paths | PASS |
| §10 | N/A — no env vars introduced; the analyzer reads neither `.env` nor `process.env` | PASS |
| §11 | N/A — no authentication touched | PASS |
| §12 | `node:test` only; no `boardgame.io` import; no network/DB; new test file at `*.test.ts` (not `.mjs`); manifest fixtures are inline string literals (no live-FS test deps except the drift-gate test which reads source files at test-time) | PASS |
| §13 | Exact commands with expected output; PowerShell shell consistency; smoke uses `Get-FileHash` for byte comparison | PASS |
| §14 | 39 binary, observable acceptance criteria grouped by sub-task; each is pass/fail without subjective judgement | PASS |
| §15 | STATUS, DECISIONS, WORK_INDEX, EC_INDEX, scope-boundary check, smoke-artifact cleanup all in DoD; the 39-AC reference is explicit | PASS |
| §16 | Code-style rules referenced (00.6 Rule 7 for `.reduce()`; explicit `for...of`; full-sentence error messages; no abbreviations); JSDoc on functions required; `// why:` comments mandated on the cap-threshold local copy + the malformed-line policy + the markdown-default | PASS |
| §17 | Vision Alignment present; §3, §11, §22 cited; determinism-preservation line present; NG check explicit | PASS |
| §18 | Verification Step 7 (`Math\.random`, `boardgame.io`, `@legendary-arena/registry`) is literal-string-scoped; adjacent prose in this WP does not enumerate the forbidden tokens verbatim — the constraints section cites them by name as policy and the verification steps target them as patterns, but no JSDoc inside `sweep.analyze.ts` or this WP enumerates them as a list | PASS |
| §19 | N/A — this WP is not a repo-state-summarizing artifact | PASS |
| §20 | N/A with justification — internal operator-facing simulation-tooling analyzer; no UI surfaces; no user-visible copy; no funding affordances; analytical / retrospective mention carve-out applies | PASS |
| §21 | N/A with justification — no `apps/server` HTTP endpoint added/modified/removed/status-changed; no `apps/server/src/**` library function added/modified/status-changed; the new surfaces are engine pure-helper + scripts/ CLI, neither of which is a server endpoint or a `Library-only` catalog row | PASS |
