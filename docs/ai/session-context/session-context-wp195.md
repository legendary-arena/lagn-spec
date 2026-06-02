# Session Context — WP-195 (Anomaly Oracle Over WP-194 Sweep Manifest — Drafting)

> **Authored:** 2026-06-01 as the step-0 / step-8 bridge between the
> WP-194 governance closeout (squash-merge commit `68280d1`) and the
> next executable WP in the simulation-tooling chain (WP-193 → WP-194
> → **WP-195** → ?). **Purpose:** surface the conversation-level
> context, the deferred-from-WP-194 scope items, and the manifest
> contract WP-195 consumes, so the drafting session does not
> re-derive design decisions from git log + WP-194 prose alone.
>
> **This is a DRAFTING session-context file, not an execution one.**
> WP-195 has no WP body, no EC, no reserved D-entries, no design
> lock-in yet. The next session's job is `01.0a` Phase 1 (draft
> WP-195 + EC, lint, pre-flight, copilot, commit + merge a SPEC PR).
> A separate execution session follows once the SPEC PR is on `main`.
>
> **This file is not authoritative.** If conflict arises, the
> priority chain in §9 wins.

---

## 1. State on `main` (as of authoring)

`main` HEAD: **`68280d1`** (`WP-194: setup-matrix sweep runner
(engine + scripts) (#175)`). The Post-Merge Close Ritual completed
2026-06-01: VERIFY PASS, branch deleted local + remote, stale
remote-tracking refs pruned, `--report` silent.

Recent landed history relevant to WP-195:

- **WP-194 / EC-221** — Setup-Matrix Sweep Runner (Scheme ×
  Mastermind, Manifest-Only). Done 2026-06-01 at `ab4ea2e` (Commit A
  — implementation) + `03de2dc` (Commit B — governance close),
  squash-merged at `68280d1`. Engine `930 → 943 / 0 fail` (+13 new
  in `sweep.runner.test.ts`). D-19401..D-19403 landed (Active).
  **Surface relevance: this is what WP-195 consumes.** WP-194 is the
  execution-layer primitive; WP-195 is the analysis layer.
- **WP-193 / EC-220** — Policy-Mode Fixture Recording. Done
  2026-06-01 at `302eb52`. D-19301..D-19303 landed. Established the
  `simulateOneGameAndCaptureMoves` capture primitive WP-194 wraps
  and the locked `::seat:` seed convention that WP-194's `::cell:`
  nests on top of. **Surface relevance:** WP-195 does NOT call the
  recorder or the capture primitive directly; it reads the JSONL
  manifest WP-194 produces.
- **WP-036** — Simulation Runner. `runSimulation`,
  `createRandomPolicy`, `createCompetentHeuristicPolicy` available.
  **Surface relevance:** WP-195 may import the engine's
  `MAX_TURNS_PER_GAME` constant (currently `200` in
  `simulation.runner.ts`) to classify cap-hit cells — see §6
  open question O-3. Otherwise WP-195 is downstream of WP-036.

### Uncommitted artifacts in the working tree at authoring time

`git status` is clean. Working tree is on `main` at `68280d1`. No
stashes, no untracked drafts, no leftover smoke artifacts from the
WP-194 execution session (verified via `git ls-files --others
--exclude-standard` returning empty).

There is no `WP-195-*.md` draft or `EC-NNN-*.checklist.md` draft on
disk; this file is the only WP-195-related artifact at session
start.

---

## 2. Workflow Position (per `01.0a §Phase 1` — Drafting)

WP-195 is at the **pre-drafting** stage. The next session executes
`01.0a` Phase 1 (Steps 1–7):

| Step | Gate | Status |
|---|---|---|
| 0 | Session context | **This file.** |
| 1 | SessionStart hook (`01.8`) | Pending — expect silent. |
| 2 | Pre-draft sanity (`00.1`) | Pending — confirm next-free WP/EC/D numbers (see §3). |
| 3 | Frame the work (Layer Boundary; SAFE-KNOBS as needed) | Pending — see §5 + §6. |
| 4 | Create WP + EC (`00.1`, `EC-TEMPLATE.md`) | Pending — output file paths in §3. |
| 5a | Pre-flight (`01.4`) | Pending — runs against the drafted WP + EC. |
| 5b | Copilot check (`01.7`) | Pending — runs after pre-flight READY. |
| 5c | Lint gate (`00.3`, 21 sections) | Pending — runs at draft-finalisation. |
| 6 | Session prompt (`docs/ai/invocations/session-wp195-*.md`) | Pending — generated post-gates. |
| 7 | Commit + close drafting (single SPEC PR with WP + EC + index rows) | Pending — `SPEC: draft WP-195 + EC-NNN (...)` |

Phase 2 (execution) runs in a separate session AFTER the Phase 1
SPEC PR merges to `main`. Do NOT conflate drafting and execution.

---

## 3. Number Reservation (To Verify at Drafting Time)

The numbers below are the *expected* slots given current `main` state
at `68280d1`. The drafting session MUST re-verify against `origin/main`
(another WP-196/197 may have landed in the interim) per the
`feedback_wp_design_patterns.md` "check origin draft branches for
in-flight reservations" rule.

- **WP slug:** `WP-195`. Body file: `docs/ai/work-packets/WP-195-<slug>.md`.
  `<slug>` recommendation: `anomaly-oracle-over-sweep-manifest` or
  `sweep-manifest-anomaly-classification` — the drafter picks the
  final form during Step 3 (framing).
- **EC slot:** Next-free numeric. EC-221 = WP-194; **EC-222** is the
  expected next-free slot but the drafter MUST confirm against
  `EC_INDEX.md` at session start (EC-222 may have been claimed by an
  in-flight draft branch on origin; if so, advance to next-free).
  File: `docs/ai/execution-checklists/EC-NNN-<slug>.checklist.md`.
  Plain numeric form per the engine convention (no letter suffix);
  see `01.0b §"The EC number I want to reserve is already taken"`.
- **D-entries reserved:** `D-19501`..`D-1950N` (where `N` is the
  count of decisions the WP locks). Slot 195 is free at HEAD —
  verified by grep for `D-195` returning zero matches in
  `docs/ai/DECISIONS.md`. The drafter picks N at design time
  (likely 3–5 based on WP-194's precedent).
- **Branch name (Phase 1 draft):** `claude/wp-195-<slug>-spec` or
  similar; the drafter's harness auto-spawns.

---

## 4. WP-195 Goal & Scope (Compressed Pre-Drafting Brief)

> **Source authority for this section:** the deferred-to-WP-195
> items called out explicitly in WP-194's body, plus the user's
> 2026-06-01 statement *"please write the session context for WP-195"*
> following WP-194's merge. None of the design below is locked yet —
> the drafting session has final say. This section frames the
> conversation, not the contract.

WP-194 emits raw cell results into a JSONL manifest and explicitly
defers all interpretation to WP-195. The relevant WP-194 §Out of
Scope passages (verbatim from `docs/ai/work-packets/WP-194-setup-matrix-sweep.md`):

> **Anomaly classification / aggregation / triage.** The sweep
> records raw cell results into the manifest. Classifying which
> cells are anomalous (hit-cap-not-endgame, soft-lock, illegal-state
> warnings, normalised failure signatures, distribution summaries)
> is **WP-195**. WP-194 is the execution-layer primitive; WP-195 is
> the analysis layer.

And from WP-194's fatal-record contract:

> Per-cell error classification + recovery remains WP-195's seam.

### Proposed scope (drafter to refine)

WP-195 is **the anomaly-oracle / analysis layer** that consumes
WP-194's JSONL manifest and produces a classified report. Likely
shape:

- **Engine surface (pure helper):** `packages/game-engine/src/simulation/sweep.analyze.ts`
  (or similar) exporting a classifier function over
  `SweepCellResult[]` plus fatal records. Pure function modulo the
  input; deterministic; no IO; no boardgame.io / registry imports
  (mirrors WP-194's engine-layer posture).
- **Operator CLI:** `scripts/analyze-sweep-manifest.mjs` (name TBD)
  that loads a manifest file, calls the engine classifier, and
  emits a report. The report format is an open design question
  (see §6: O-1).
- **Tests:** `packages/game-engine/src/simulation/sweep.analyze.test.ts`
  pinning the closed-set anomaly taxonomy + drift gates + sample
  fixture round-trip.
- **Documentation:** `docs/ai/REFERENCE/complete-game-tests.md`
  appended §"Sweep manifest analysis (WP-195)" after WP-194's
  section.

### Anomaly classes the drafter should consider

The drafter should enumerate the closed-set anomaly taxonomy at
design time. Candidate classes (NOT yet locked):

1. **`hit-cap-not-endgame`** — `endgameReached: false` AND
   `moveCount >= MAX_TURNS_PER_GAME` (200). The per-turn loop
   exited via the cap, not via `evaluateEndgame` returning non-null.
   Indicates a setup where the policy cannot reach a terminal state
   within the cap.
2. **`stuck-game`** — `endgameReached: false` AND `moveCount` well
   below the cap. The simulation runner's stuck-endTurn branch
   fired (policy returned `endTurn` outside `cleanup`). The
   threshold for "well below" needs to be locked — likely a fixed
   ratio of `MAX_TURNS_PER_GAME` or a hard floor like `< 50`.
3. **`fatal`** — cells appearing in the manifest as fatal records
   (`type: "fatal"`). The classifier should normalise the `error`
   field into a signature (e.g., first sentence, first 80 chars,
   or a deterministic hash) so identical errors across multiple
   cells aggregate into one bucket.
4. **`escaped-villain-cap`** — `outcome.escapedVillains` at or
   above the engine's `ESCAPE_LIMIT` (8 per
   `endgame.types.ts`). Cells that reached this limit lost via the
   scheme-wins path; useful to surface as a distribution slice.
5. **Distribution summaries** — winner distribution (`heroes-win`
   / `scheme-wins` / `null`); move-count distribution
   (mean/median/p95); escaped-villains distribution; fatal-rate.
   These are aggregate metrics, not per-cell anomalies; the report
   format must accommodate both.

### Out of scope (preliminary — drafter to confirm)

- **Triage / remediation recommendations.** WP-195 classifies +
  aggregates + reports; it does NOT suggest fixes. Operator action
  on anomalies is outside the scope.
- **Re-dispatching anomalous cells.** WP-195 reads the manifest;
  it does NOT call `sweepSetupMatrix` or `simulateOneGameAndCaptureMoves`
  to re-run cells. A future WP could add a `--re-run-anomalies`
  bridge if operators surface real need.
- **Multi-manifest aggregation.** v1 consumes ONE manifest file at a
  time. Cross-run trend analysis (manifest A vs manifest B over
  time) is a later WP.
- **Real-registry analysis.** WP-194 uses `EMPTY_REGISTRY`; cell
  outcomes vary only via per-cell seed decorrelation, not by
  set-specific card scripts. WP-195 inherits this constraint —
  classifying anomalies under `EMPTY_REGISTRY` is the v1 deliverable;
  registry-backed analysis is a follow-up dependent on a future
  registry-loading WP.
- **A `--write-fixtures` bridge from anomalous cells to fixture
  promotion.** WP-194 explicitly defers this; WP-195 should not
  re-litigate.

---

## 5. WP-194 Manifest Contract WP-195 Consumes

WP-195 reads `sweep-output/<run-id>/manifest.jsonl`. The file is
canonical JSONL — one canonical-JSON record per line, no enclosing
array, no header, no pretty-print. Two record shapes appear,
discriminated by the presence of `type: "fatal"`:

**Success record** (7 keys, sorted lexicographically):
```jsonc
{
  "cellIndex": <0-based ordinal in lex-sorted cross-product>,
  "cellSeed": "<runSeed>::cell:<schemeId>:<mastermindId>",
  "endgameReached": <boolean>,
  "mastermindId": "<id>",
  "moveCount": <integer >= 0>,
  "outcome": {
    "escapedVillains": <integer>,
    "winner": "heroes-win" | "scheme-wins" | null
  },
  "schemeId": "<id>"
}
```

**Fatal record** (5 keys, sorted lexicographically):
```jsonc
{
  "cellSeed": "<cellSeed of throwing cell>",
  "error": "<full-sentence error message>",
  "mastermindId": "<id of throwing cell>",
  "schemeId": "<id of throwing cell>",
  "type": "fatal"
}
```

Locked invariants WP-195 relies on:

- **Identity key** for resume / dedup / cross-record join is the
  `(schemeId, mastermindId)` pair. `cellIndex` is informational
  only (not stable across axis-file changes).
- **Manifest line order is lex-sorted** ascending (outer = schemeId,
  inner = mastermindId) for the success records emitted on a single
  pass. A resumed run appends only missing cells, so a fully-resumed
  manifest's line order is NOT guaranteed to be lex-sorted —
  WP-195's classifier MUST sort or hash-group by the identity key
  rather than assuming line-order = enumeration-order.
- **`cellSeed` is derived** as `${runSeed}::cell:${schemeId}:${mastermindId}`
  (D-19402). WP-195 can reproduce any single cell by extracting the
  cellSeed from the manifest and rerunning the WP-193 recorder
  (`--policy <family> --seed <cellSeed>` with the corresponding
  schemeId / mastermindId substituted into a one-off envelope).
  This is the forensic reproduction path WP-194 promises in its
  Vision Alignment §22 section.
- **Engine constants WP-195 likely references** (read from
  `packages/game-engine/src/`, not redefined):
  - `MAX_TURNS_PER_GAME = 200` from `simulation/simulation.runner.ts`
    — informs the `hit-cap-not-endgame` threshold.
  - `ESCAPE_LIMIT = 8` from `endgame/endgame.types.ts` — informs
    the `escaped-villain-cap` classification.
  - Decide at design time whether to import these constants
    directly (creates a runtime dependency) or carry them via a
    local `// why:`-commented copy (matches the WP-036 Scope Lock
    duplication precedent for tiny helpers).

---

## 6. Open Design Questions for the Drafter

Each question must be resolved during Step 3 (framing) and locked
via D-entries in the WP body. Numbered for traceability into the
EC's `§Locked Values`.

**O-1 — Report format.** Options:
- (a) Canonical JSON to stdout
- (b) Pretty-printed markdown summary to stdout
- (c) Both, gated by a `--format json|markdown` flag
- (d) Write to a sibling file `sweep-output/<run-id>/analysis.json`
  and print a one-line stdout summary

Recommendation pre-drafting: **(c) `--format json|markdown` with
markdown default** — JSON for tooling / WP-196-style downstream
ingestion, markdown for operator reading. The drafter should
confirm against WP-194's pattern (which prints a one-line summary
to stdout + persists the manifest to disk).

**O-2 — Anomaly taxonomy.** Lock the closed set during drafting.
The candidates in §4 are a starting point but not exhaustive.
Specifically:
- Is `stuck-game` distinguishable from `hit-cap-not-endgame` via
  the manifest alone? (The manifest does NOT distinguish "policy
  returned endTurn outside cleanup" from "loop exited via cap" —
  both yield `endgameReached: false`. The drafter must decide
  whether to classify by `moveCount` threshold or merge them
  under one label.)
- Should fatal-record error signatures be a deterministic hash, a
  truncated prefix, or the full message? (Privacy / log-bloat
  trade-off; full messages may carry stack-trace noise.)

**O-3 — Cap-hit threshold.** If WP-195 imports
`MAX_TURNS_PER_GAME` from the engine, the `hit-cap-not-endgame`
class fires for `moveCount >= 200` exactly. If it carries a local
copy, the constant must be drift-pinned (a test asserting the local
copy matches the engine value). The drafter picks one approach;
the trade-off mirrors WP-036's Scope Lock decision.

**O-4 — Scope: pure helper vs script-only.** WP-194's pattern is
engine-pure-helper + script-wrapper. WP-195 could do the same, OR
it could be script-only (the analysis is simple enough that no
engine surface is needed). The drafter weighs:
- **Engine surface pro:** testable in `node:test`; mirrors WP-194;
  enables future reuse (e.g., a future dashboard widget that
  ingests classified anomalies).
- **Engine surface con:** another file in `simulation/`; one more
  symbol to maintain; the analysis is downstream-only and may not
  warrant a public engine API.

Recommendation pre-drafting: **engine pure helper** for parity with
WP-194 and testability; this is the load-bearing choice for the
drafter to confirm or override.

**O-5 — Input validation.** What does WP-195 do if the manifest is
malformed (e.g., a non-JSON line, a record with neither 7-key
success shape nor 5-key fatal shape)?
- WP-194's resume scanner emits a warning + re-runs the cell.
- WP-195 cannot re-run; the malformed line is forensic data.
- Recommendation pre-drafting: full-sentence stderr warning per
  malformed line + skip; aggregate the count in the report so the
  operator sees the cardinality.

**O-6 — Multi-axis future-proofing.** WP-194's `cartesianProduct`
is N-axis-generic; future WPs add axes by extending the input
array. The manifest's success record carries only `schemeId` +
`mastermindId` today. When a third axis lands, the manifest shape
extends. Should WP-195's classifier accept the today-shape only,
or be future-proofed via optional fields?
- Recommendation pre-drafting: lock to today's two-axis shape;
  defer multi-axis to a follow-up. Premature generality is the
  D-19401 anti-pattern WP-194 explicitly rejected at the
  axis-enumeration layer; do not re-introduce it at the analysis
  layer. Lock this as a D-entry.

**O-7 — Naming.** Candidates:
- `analyze-sweep-manifest.mjs` (verb-noun-noun; matches `record-game-fixture.mjs` shape)
- `sweep-analyze.mjs` (matches WP-194's `sweep-setup-matrix.mjs` shape)
- `classify-sweep-anomalies.mjs` (verb-noun-noun, more specific)

Recommendation pre-drafting: **`analyze-sweep-manifest.mjs`** —
matches the recorder precedent (`record-game-fixture.mjs`) and the
`<verb>-<noun-noun>` script-naming convention. The drafter
confirms.

---

## 7. Out of Scope (Explicitly NOT in WP-195)

- Any modification to `packages/game-engine/src/simulation/sweep.runner.ts`
  (WP-194's contract; zero diff).
- Any modification to `scripts/sweep-setup-matrix.mjs` (WP-194's
  contract; zero diff).
- Any modification to the manifest file format. WP-195 consumes
  the format WP-194 produces. If WP-195 needs additional fields,
  the right move is a follow-up to WP-194, not a WP-195 inline
  extension.
- Re-dispatching anomalous cells (see §4 Out of scope).
- Multi-manifest aggregation (see §4).
- Triage / remediation recommendations (see §4).
- Promoting anomalous cells to `runFixture` fixtures (the
  `--write-fixtures` flag WP-194 explicitly defers).
- Any UI surface (no client-side rendering of analysis reports;
  operator-facing CLI only for v1).
- Any database write (the analysis report is ephemeral — written
  to stdout or to `sweep-output/<run-id>/analysis.*` per O-1).

---

## 8. Pre-Flight Inputs (To Be Produced)

The WP-195 pre-flight session (`01.4`) needs:

- WP-195 body + EC on `main` (post-Phase-1 SPEC PR merge — NOT yet
  done at this file's authoring; this file is the pre-drafting
  bridge).
- WP-194 ✅ (verified at HEAD `68280d1`).
- WP-036 ✅ (`runSimulation`, `createRandomPolicy`,
  `createCompetentHeuristicPolicy` available).
- Baseline gates:
  - `pnpm --filter @legendary-arena/game-engine build` exits 0
  - `pnpm --filter @legendary-arena/game-engine test` exits 0
    (current baseline: 943 tests; WP-195 adds N new — drafter
    locks N during EC authoring)
  - `pnpm -r build` exits 0
- A sample WP-194 manifest available for the pre-flight smoke test
  (the drafter may generate one ad-hoc with `--policy random`
  against a known scheme/mastermind pair to confirm the
  classifier's plumbing works end-to-end).

---

## 9. Authority Chain (When This File Conflicts)

If anything in this file contradicts the authoritative documents,
the authoritative document wins. Priority:

1. `.claude/CLAUDE.md`
2. `docs/ai/ARCHITECTURE.md`
3. `docs/01-VISION.md`
4. `.claude/rules/*.md`
5. `docs/ai/work-packets/WORK_INDEX.md`
6. `docs/ai/work-packets/WP-194-setup-matrix-sweep.md` (the
   upstream-contract WP that locks the manifest WP-195 consumes)
7. `docs/ai/execution-checklists/EC-221-setup-matrix-sweep.checklist.md`
   (the upstream-contract EC)
8. `docs/ai/DECISIONS.md §D-19401..D-19403` (the upstream-contract
   decisions WP-195 inherits)
9. `docs/ai/REFERENCE/01.0a-wp-drafting-phase.md` (the drafting
   workflow this session executes)
10. `docs/ai/REFERENCE/01.4-pre-flight-invocation.md` +
    `EC-TEMPLATE.md`
11. This file.

---

## 10. Next Action

Open a fresh Claude Code session (auto-worktree spawns) and execute
`01.0a` Phase 1 against this file. Concretely:

1. Read `.claude/CLAUDE.md`, `docs/ai/ARCHITECTURE.md`,
   `.claude/rules/{architecture,code-style,work-packets}.md`, and
   this session-context file.
2. Run the pre-draft sanity check (`00.1`): verify WP-195 + EC-222
   slots are still free on `origin/main` (a small WP may have
   landed between authoring and the drafting session).
3. Resolve the open design questions in §6 in conversation with the
   user OR via the drafter's judgement, locking each as a D-entry
   (`D-19501`..`D-1950N`).
4. Author `docs/ai/work-packets/WP-195-<slug>.md` using the
   canonical template (`00.1`).
5. Author `docs/ai/execution-checklists/EC-NNN-<slug>.checklist.md`
   using `EC-TEMPLATE.md`. Mirror WP-194's EC-221 structure
   (Pre-Session Actions / Locked Values / Guardrails / Required
   `// why:` Comments / Files to Produce / After Completing /
   Common Failure Smells).
6. Add WORK_INDEX.md + EC_INDEX.md rows (Pending / Draft).
7. Run pre-flight (`01.4`), copilot check (`01.7`), and lint gate
   (`00.3`). Iterate on the WP / EC body until all three pass.
8. Generate the execution session prompt at
   `docs/ai/invocations/session-wp195-<slug>.md` (gitignored
   scratchpad).
9. Commit as a single `SPEC: draft WP-195 + EC-NNN (<short
   description>)` commit + open PR + merge.

Execution (Phase 2) follows in a separate session after the SPEC PR
merges. Do NOT execute WP-195 in the drafting session.

---

## 11. Quick-Reference Pointers

For the drafter's convenience, the load-bearing files and sections:

- **Manifest contract:** `docs/ai/work-packets/WP-194-setup-matrix-sweep.md`
  §E (manifest format), §C (cellSeed derivation), §Contract
  (locked exports).
- **Engine constants likely referenced:**
  - `packages/game-engine/src/simulation/simulation.runner.ts`
    (`MAX_TURNS_PER_GAME = 200`)
  - `packages/game-engine/src/endgame/endgame.types.ts`
    (`ESCAPE_LIMIT = 8`, `EndgameOutcome = 'heroes-win' | 'scheme-wins'`)
- **CLI precedent:** `scripts/sweep-setup-matrix.mjs` (WP-194) and
  `scripts/record-game-fixture.mjs` (WP-158 / WP-193) — both
  demonstrate the `dist/` import convention, ESM CLI structure,
  full-sentence error messages, and canonical-JSON output
  patterns WP-195 should mirror.
- **Test pattern:**
  `packages/game-engine/src/simulation/sweep.runner.test.ts`
  (WP-194) and `simulation.captureMoves.test.ts` (WP-193) — both
  use the `{ listCards: () => [] }` registry stub and `node:test`
  conventions.
- **Reference doc placement:**
  `docs/ai/REFERENCE/complete-game-tests.md` — append §"Sweep
  manifest analysis (WP-195)" after the WP-194 section.
- **Authority of WP-194's decisions:** D-19401 (sweep dimensions +
  lex-sort + N-axis-generic), D-19402 (cell-seed convention),
  D-19403 (manifest-only + fatal-record). All landed Active.
