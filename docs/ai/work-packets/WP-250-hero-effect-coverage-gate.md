# WP-250 — Hero-Effect Coverage Gate (`pnpm sim:coverage` + CI)

**Status:** Draft — pending review
**Primary Layer:** Shared Tooling (`scripts/`) + CI (`.github/workflows/`)
**Dependencies:** WP-021 ✅, WP-022 ✅, WP-023 ✅ (hero ability hook parser + `HERO_KEYWORDS`), WP-036 ✅ (simulation precedent), WP-158 ✅ (regression-harness precedent this promotes)

---

## Session Context

WP-021/022/023 established the data-only hero ability pipeline (`buildHeroAbilityHooks` parses card-text markup into `HeroAbilityHook`/`HeroEffectDescriptor`; `HERO_KEYWORDS` is the canonical keyword union in `rules/heroKeywords.ts`); WP-158 established the seed-faithful regression harness and the `scripts/`-as-tooling precedent (CLI imports engine `dist/`). This packet adds a read-only coverage gate on top of those outputs without modifying any of them.

---

## Goal

After this session, the repo can answer "what fraction of printed hero abilities actually execute, and which mechanics are unimplemented?" deterministically and on every CI run. A new `pnpm sim:coverage` command drives the **real** engine parser (`buildHeroAbilityHooks`) over all 40 in-repo card sets, buckets every parsed ability line (EXECUTABLE / PARSED_NOT_EXECUTED / NO_EFFECT), enumerates unsupported `[keyword:X]` mechanics, and — in `--check` mode — fails the build when hero-effect coverage regresses against a committed baseline. This is the guardrail that protects the subsequent effect-system refactor (see `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md` Levers 1–2): coverage can only go up, never silently down.

---

## Assumes

- WP-021/022/023 complete. Specifically:
  - `packages/game-engine/src/setup/heroAbility.setup.ts` exports `buildHeroAbilityHooks(registry, matchConfig): HeroAbilityHook[]` (WP-021)
  - `packages/game-engine/src/rules/heroKeywords.ts` exports `HERO_KEYWORDS: readonly HeroKeyword[]` (WP-021)
  - `packages/game-engine/src/rules/heroAbility.types.ts` exports `HeroAbilityHook` with optional `effects?: HeroEffectDescriptor[]` (WP-021)
- WP-158 complete: `scripts/record-game-fixture.mjs` exists and imports from `packages/game-engine/dist/**` (the `scripts/`-imports-`dist/` precedent).
- `packages/registry/src/impl/localRegistry.ts` exports `createRegistryFromLocalFiles({ metadataDir, cardsDir })` returning a reader with `listCards()` + `getSet()`.
- `data/cards/*.json` (40 sets) and `data/metadata/` exist at the repo root.
- `pnpm -r build` exits 0 (produces `packages/game-engine/dist/` and `packages/registry/dist/`).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — read the Shared Tooling row and the dependency-direction diagram. This packet's code lives in `scripts/` (Shared Tooling, orthogonal to the runtime chain); it may import engine + registry `dist/` because it is a dev/CI tool, never runtime code.
- `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md` — the analysis this gate operationalizes (Lever 3). Read §5 and §8 for the bucket taxonomy and the baseline numbers.
- `scripts/hero-effect-coverage.mjs` — read it entirely; this packet promotes this prototype. It already drives the real parser and produces the three buckets + unsupported-mechanic scan.
- `scripts/record-game-fixture.mjs` — read the header for the established `scripts/`-imports-`dist/` pattern (`import { … } from '../packages/game-engine/dist/…'`) and the `import.meta.url`-anchored repo-root resolution.
- `.github/workflows/ci.yml` — read the `typecheck-arena-client` job (lines 104–123); the coverage job mirrors it (build workspace, then run one check).
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix), Rule 11 (full-sentence error messages), Rule 13 (ESM only).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()`, wall-clock reads (`Date.now()`, `new Date()`), or network access in the probe — coverage output must be byte-deterministic given the in-repo card data.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports (`node:fs/promises`, `node:path`, `node:url`).
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- Zero diff to `packages/game-engine/src/**`, `packages/registry/src/**`, and any `.types.ts` — this packet adds **no** engine/registry code and changes **no** contract. (Confirmed by `git diff --name-only`.)
- The probe imports `HERO_KEYWORDS` from `packages/game-engine/dist/rules/heroKeywords.js` (canonical source) — it must **not** re-declare the known-markup vocabulary as a hand-typed literal; derive it from the import (the prototype's hand-typed `KNOWN_MARKUP_KEYWORDS` array becomes `new Set(HERO_KEYWORDS)`; the const name may remain, but it must be the derived Set).
- The gated metric is **per-set `noEffect` non-regression** plus **unsupported-mechanic non-growth** plus **corpus integrity**. `noEffect` is pure parser output (a hook with no `effects`), so the gate needs no engine executor constant. The EXECUTABLE vs PARSED_NOT_EXECUTED split stays **informational** (printed, not gated) to avoid coupling the gate to the executor's internal keyword set.
- **Invariant (enforced):** the probe's informational executed-keyword list MUST NOT appear in any `--check` comparison or exit-code condition — it is informational-only. (Verified by inspection: its identifier does not occur inside the comparison / `--check` function.)
- **Baseline-superset rule (locked):** the baseline MAY contain `unsupportedMechanics` keys absent from the current report, and `noEffect` values higher than current; this MUST NOT fail `--check`. Only a *current* key absent from the baseline (new mechanic) or a higher current `noEffect` (regression) fails.
- **Corpus-integrity rule (gated):** every set present in the baseline `perSet` MUST exist in the current report; a missing set is a regression and fails `--check` (guards against silent registry/data drift shrinking the corpus).
- **Single serialization path (enforced):** the same `serializeDeterministic` function produces the bytes for `--json`, the `--check` comparison, and the `--update-baseline` write. Object keys are sorted lexicographically by UTF-16 code unit (default string order — never `localeCompare`); any arrays sort the same way. Numeric values use default JSON integer formatting (no rounding/padding/localization). Output is byte-identical across repeated runs, machines, and Node patch versions (including CI vs local).
- `--update-baseline` is the **only** way the committed baseline changes — the probe never rewrites it implicitly.

**Session protocol:**
- If any export name, file path, or data shape is unclear, stop and ask the human — never guess or invent.

---

## Debuggability & Diagnostics

- The probe is fully reproducible given the in-repo `data/cards/*.json` + built `dist/` — no RNG, no clock, no network.
- `--check` failures are localizable: the probe prints each regressing set (`<set>: noEffect <baseline> → <current>`) and each newly-appeared unsupported mechanic, then exits non-zero with a full-sentence summary.
- Human-readable report (default mode) and machine-readable JSON (`--json`) are both emitted from the same single pass, so a CI failure can be reproduced locally verbatim.

---

## Scope (In)

### A) Promote `scripts/hero-effect-coverage.mjs`
- **`scripts/hero-effect-coverage.mjs`** — modified:
  - Import `HERO_KEYWORDS` from `../packages/game-engine/dist/rules/heroKeywords.js`; derive the known-markup set from it. Remove the local `KNOWN_MARKUP_KEYWORDS` literal.
  - Keep the existing three-bucket classification (EXECUTABLE / PARSED_NOT_EXECUTED / NO_EFFECT) and the unsupported-`[keyword:X]` scan. Add `// why:` comment that the EXECUTABLE/PARSED split is informational and intentionally not imported from the executor's internal set (decoupling rationale, cite D-24021).
  - Add a `buildCoverageReport(registry)` function returning a plain object: `{ schemaVersion: 1, corpus: { heroes, hooks, executable, parsedNotExecuted, noEffect }, perSet: { <abbr>: { hooks, executable, noEffect } }, unsupportedMechanics: { <name>: count } }`.
  - Add `serializeDeterministic(report)` — sorts all object keys and array entries so output is byte-stable.
  - Add CLI flags: default = human report to stdout; `--json` = deterministic JSON to stdout; `--check` = compare against the committed baseline and exit 0/1/2 (hybrid posture below); `--update-baseline` = write the current report to the baseline path (no comparison).
  - `--check` posture (**hybrid**, D-24021): **HARD-FAIL (exit 1)** if (a) any `perSet[set].noEffect` exceeds the baseline value for that set (an executable line went dark — the refactor-regression case), OR (c) any set present in the baseline `perSet` is missing from the current report (corpus shrank). **WARN-only (printed, exit 0)** if (b) any key in the *current* `unsupportedMechanics` is absent from the baseline's `unsupportedMechanics` (a brand-new unmodeled mechanic — expected as new sets get authored; surfaced, never blocking). Coverage improvements (lower `noEffect`, fewer mechanics) and a baseline that is a strict superset PASS.
  - **Classification rules (fixed — must not drift):**
    - **NO_EFFECT** — `hook.effects` is `undefined` or empty.
    - **PARSED_NOT_EXECUTED** — `hook.effects` is non-empty but no effect `type` is in the probe's informational executed-keyword list.
    - **EXECUTABLE** — at least one effect `type` is in that list.
    - The executed-keyword list is the probe's own mirror of the executor's handled set (carrying a drift `// why:` note); the probe does **not** import executor internals — none are exported. The gate never depends on this list: only `noEffect` (pure parser output) and unsupported-mechanic growth are gated (D-24021 decoupling invariant). Drift in this list can only mislabel the informational EXECUTABLE/PARSED split, never the gate verdict.
  - **Unsupported-mechanic detection (fixed):** a `[keyword:X]` token whose normalized form is not in `HERO_KEYWORDS` counts as one unsupported-mechanic occurrence. Normalization is locked: lowercase, strip a trailing `:<digits>` or ` <digits>` magnitude, then collapse remaining whitespace to single hyphens. (This normalization is required, not forbidden — without it `[keyword:draw:1]` would be miscounted as unsupported when `draw` is supported.) Equivalence: `[keyword:X:1]` and `[keyword:X 1]` MUST normalize to the same key. A token that normalizes to the empty string (malformed, e.g. `[keyword:]`) is ignored — never counted as an unsupported mechanic.
  - **Schema version:** the report carries top-level `schemaVersion: 1` (integer). `--check` fails as a probe failure (see exit codes) — never silently — if the baseline's `schemaVersion` is absent or ≠ the probe's supported version. A future schema change increments this value and invalidates old baselines explicitly.
  - **Numeric formatting:** values are emitted with default JSON number formatting — no rounding, truncation, padding, or localization (all counts are integers).
  - **Exit codes (locked):** `0` = no hard-fail regression (new-mechanic warnings may have printed); `1` = hard-fail regression (a `noEffect` rise or a missing set); `2` = probe failure; **no other exit codes are permitted.** Probe-failure (`2`) conditions: missing or unreadable baseline; missing required `dist/` imports; absent or invalid `schemaVersion`; JSON parse failure in the baseline or current report; a degenerate corpus (`corpus.heroes` or `corpus.hooks` is zero — signals the registry/`dist` did not load).
  - **Failure-output contract:** the probe always prints one line per new mechanic as `WARN: NEW unsupported mechanic: <name>` (warn-only — does not affect the exit code). On a `1` exit it additionally prints one line per regressing set as `<set>: noEffect <baseline> → <current>`, one line per missing set as `MISSING set: <abbr>`, then a final `FAIL:` summary. On a `0` exit it prints an `OK:` summary (noting any warning count). On a `2` exit it prints a single full-sentence `Probe failure:` reason.
  - **CLI mode isolation:** `--check` never writes files; `--update-baseline` never performs a comparison; default and `--json` modes never write the baseline.

### B) `pnpm sim:coverage` script
- **`package.json`** (root) — modified: add `"sim:coverage": "node scripts/hero-effect-coverage.mjs"` to `scripts`. (Operators run `pnpm sim:coverage`, `pnpm sim:coverage --check`, `pnpm sim:coverage --update-baseline`.)

### C) Committed baseline
- **`scripts/coverage/hero-effect-coverage.baseline.json`** — new: the deterministic report captured from `main` at execution time via `--update-baseline`. Seeds the non-regression gate.

### D) CI wiring
- **`.github/workflows/ci.yml`** — modified: add a `hero-effect-coverage` job mirroring `typecheck-arena-client` — checkout, pnpm + node 22, `pnpm install --frozen-lockfile`, `pnpm -r build` (produces engine + registry `dist/`), then `pnpm sim:coverage --check`. Add a `# why:` comment that the gate guards hero-effect coverage from silent regression (Lever 3 of `DESIGN-EFFECT-AUTHORING-SCALE.md`).

### E) Operator doc
- **`docs/ai/REFERENCE/hero-effect-coverage.md`** — new: how to run the three modes, how to read the buckets, the regression rule, and the exact `--update-baseline` workflow for when coverage legitimately changes (e.g., after a markup sweep or a new executor lands). Operator-safety note (must appear in the doc): `--update-baseline` is run **only on `main` after confirming the coverage change is intentional** — never to silence a regression on a feature branch. CI runs the same deterministic probe and must produce byte-identical `--json` to a local run.

### Tests
No `node:test` file: the deliverable is a CLI/CI gate, and `scripts/` has no package test runner (per the WP-158 / `record-game-fixture.mjs` precedent). Correctness is verified behaviorally in Verification Steps (pass-on-baseline + fail-on-seeded-regression + revert).

---

## Out of Scope

- No change to the hero keyword vocabulary, the parser, or any executor — that is the Lever 1/2 refactor (a later WP).
- No card-data markup edits — closing the coverage gap by marking cards is the WP-033/WP-225 markup sweep (a later WP).
- No villain / mastermind / scheme coverage — same pattern, separate corpus, future WP.
- No `node:test` runner for `scripts/`, no new root `test:scripts` aggregation.
- No engine/registry `src/**` edits, no `.types.ts` edits, no contract changes.
- Refactors or "while I'm here" cleanups beyond Scope (In) are **out of scope**.

---

## Files Expected to Change

- `scripts/hero-effect-coverage.mjs` — **modified** — import canonical `HERO_KEYWORDS`; add `buildCoverageReport`, `serializeDeterministic`, and `--json`/`--check`/`--update-baseline` modes.
- `scripts/coverage/hero-effect-coverage.baseline.json` — **new** — committed coverage baseline (non-regression reference).
- `package.json` — **modified** — add the `sim:coverage` script.
- `.github/workflows/ci.yml` — **modified** — add the `hero-effect-coverage` job running `pnpm sim:coverage --check`.
- `docs/ai/REFERENCE/hero-effect-coverage.md` — **new** — operator doc.

Governance updates at execution close (per Definition of Done): `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-24021), `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`, `docs/ai/05-ROADMAP-MINDMAP.md`.

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A) Probe
- [ ] `scripts/hero-effect-coverage.mjs` imports `HERO_KEYWORDS` from `../packages/game-engine/dist/rules/heroKeywords.js` and derives the known-markup vocabulary from it — `Select-String -Pattern "new Set\(HERO_KEYWORDS\)"` → 1 match — with no hand-typed keyword-string array for the known set.
- [ ] `node scripts/hero-effect-coverage.mjs --json` prints valid JSON with top-level keys `schemaVersion`, `corpus`, `perSet`, `unsupportedMechanics`; `schemaVersion` is `1`.
- [ ] Running `--json` twice produces byte-identical output (deterministic serialization, sorted keys/arrays, default integer formatting).
- [ ] No `Math.random`, `Date.now`, `new Date`, or network call in the file (confirmed with `Select-String`).

### B) `pnpm sim:coverage`
- [ ] `pnpm sim:coverage` runs the human report; `pnpm sim:coverage --check` and `pnpm sim:coverage --update-baseline` run their modes.

### C) Baseline + gate
- [ ] `scripts/coverage/hero-effect-coverage.baseline.json` exists and carries `schemaVersion: 1`. (Determinism is asserted via the idempotent-write + double-`--json` checks below, not a byte-for-byte file==stdout compare, which is fragile to OS line-ending handling.)
- [ ] Two consecutive `--update-baseline` writes produce a byte-identical baseline file; two consecutive `--json` runs produce byte-identical output.
- [ ] `pnpm sim:coverage --check` exits `0` against the committed baseline.
- [ ] Lowering a set's baseline `noEffect` by 1 → `--check` exits `1` and prints `<set>: noEffect <baseline> → <current>`; revert restores exit 0 (Verification Step 4).
- [ ] Adding a fabricated set key to the baseline `perSet` (absent from the current report) → `--check` exits `1` naming the missing set (corpus-integrity rule).
- [ ] Removing a real `unsupportedMechanics` key from the baseline → `--check` prints `WARN: NEW unsupported mechanic: <name>` and exits **`0`** (hybrid: new mechanic warns, never fails); adding a fabricated baseline key also passes (baseline-superset).
- [ ] A baseline with `schemaVersion` absent/≠ 1, or a corpus with `heroes`/`hooks` = 0 → `--check` exits `2` (probe failure), distinct from `1`.
- [ ] `--check` leaves `hero-effect-coverage.baseline.json` byte-unchanged (verified by hash); `--update-baseline` performs no comparison (CLI mode isolation).

### D) CI
- [ ] `.github/workflows/ci.yml` has a `hero-effect-coverage` job that runs `pnpm -r build` then `pnpm sim:coverage --check`.

### E) Doc
- [ ] `docs/ai/REFERENCE/hero-effect-coverage.md` documents the three modes, the regression rule, and the `--update-baseline` workflow.

### Scope Enforcement
- [ ] `git diff --name-only packages/` is empty (no engine/registry source touched).
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — build dist/ the probe imports
pnpm -r build
# Expected: exits 0

# Step 2 — deterministic JSON + double-run stability
node scripts/hero-effect-coverage.mjs --json > $env:TEMP\cov1.json
node scripts/hero-effect-coverage.mjs --json > $env:TEMP\cov2.json
Compare-Object (Get-Content $env:TEMP\cov1.json) (Get-Content $env:TEMP\cov2.json)
# Expected: no output (byte-identical)

# Step 3 — gate passes against the committed baseline
pnpm sim:coverage --check
# Expected: exits 0, prints "no hero-effect coverage regression"

# Step 4 — gate conditions + schema/corpus guards behave correctly; --check never writes; then revert
#   (a) lower one set's baseline "noEffect" by 1            → exit 1, "<set>: noEffect ..→.."
#   (b) delete one "unsupportedMechanics" key from baseline → exit 0 + "WARN: NEW unsupported mechanic: <name>"
#       (hybrid: a new mechanic warns, never fails; a fabricated extra key also passes)
#   (c) add a fabricated set key to baseline "perSet"       → exit 1 (corpus-integrity; set missing from current)
#   (d) set "schemaVersion" to 2, or zero out corpus.hooks  → exit 2 (probe failure)
#   then re-run --update-baseline (or `git checkout`) to restore the canonical baseline
$before = (Get-FileHash scripts\coverage\hero-effect-coverage.baseline.json).Hash
pnpm sim:coverage --check
$after  = (Get-FileHash scripts\coverage\hero-effect-coverage.baseline.json).Hash
# Expected: each mutation produces the stated exit + message; --check leaves the baseline
#   hash unchanged ($before -eq $after); after revert, --check exits 0

# Step 5 — no forbidden non-determinism in the probe
Select-String -Path "scripts\hero-effect-coverage.mjs" -Pattern "Math.random|Date.now|new Date"
# Expected: no output

# Step 6 — engine/registry source untouched
git diff --name-only packages/
# Expected: no output

# Step 7 — only in-scope files changed
git diff --name-only
# Expected: only files in ## Files Expected to Change (+ governance files)
```

---

## Lint Gate Self-Review (`00.3`) — retroactive backfill (2026-06-15)

> Backfilled per the 01.0a governance-debt squaring: WP-250 was drafted+executed in one flow (PR #321, `6bbf6ede`) without the 01.0a Phase-1 gates. The shipped gate is sound (CI-green, seeded-regression matrix verified); this records the lint disposition after the fact. All 21 sections resolve PASS or justified N/A:

- **§1–§6 (structure / constraints / prerequisites / context / output / naming):** PASS — all sections present; ≤8 code/doc files; canonical names match `00.2`.
- **§7 dependency discipline:** PASS — no new npm deps.
- **§8 architectural boundaries:** PASS — Shared Tooling (`scripts/`) + CI; no engine/registry/contract change; no `Math.random`/clock/network in the probe.
- **§9 Windows / §10 env / §11 auth:** N/A — deterministic `.mjs` probe; no env vars; no auth.
- **§12 test quality:** N/A — CLI/CI gate; correctness is behavioral (seeded-regression matrix), no `node:test` file (scripts have no package runner — WP-158 precedent).
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm sim:coverage` commands; binary criteria; DoD includes STATUS/DECISIONS/WORK_INDEX.
- **§16 code style:** PASS — full English names, `// why:` on the canonical import + decoupling + serializer.
- **§17 Vision:** N/A — dev-tooling/CI; no scoring/replay-contract/identity/multiplayer/RNG/card-data/monetization/live-ops/accessibility/registry-viewer surface (the gate reads parser output, changes no game behavior).
- **§18 prose-vs-grep:** PASS — the `KNOWN_MARKUP_KEYWORDS` self-trip was caught at execution and reinterpreted to the real derivation invariant.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A — no repo-state-summary artifact; no funding surface; no HTTP endpoint or `apps/server` library function.

## Pre-Flight & Copilot Verdicts — retroactive note

WP-250 did **not** run pre-flight (`01.4`) or copilot (`01.7`) at draft time (drafted+executed in one flow). Squared retroactively: this self-review + the backfilled session prompt (`docs/ai/invocations/session-wp250-hero-effect-coverage-gate.md`). No re-execution needed — the gate shipped and is CI-verified on every run. Future effect-system WPs (WP-251/252) follow the full 01.0a workflow.

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm sim:coverage --check` exits 0 against the committed baseline
- [ ] Seeded-regression demonstration (Step 4) confirmed the gate fails and reverts cleanly
- [ ] No `Math.random` / clock / network in `scripts/hero-effect-coverage.mjs` (confirmed with `Select-String`)
- [ ] `git diff --name-only packages/` is empty (no engine/registry source touched)
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — `pnpm sim:coverage` now reports hero-effect coverage and CI gates it against a baseline
- [ ] `docs/ai/DECISIONS.md` updated — D-24021 (coverage taxonomy + parser-driven non-regression gate; gate keys on per-set `noEffect` + unsupported-mechanic growth, decoupled from the executor keyword set)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-250 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-281 marked Done
- [ ] `docs/ai/05-ROADMAP-MINDMAP.md` has the WP-250 node under Complete-Game Testing; `node scripts/roadmap-counts.mjs --check` passes
