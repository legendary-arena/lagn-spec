# EC-281 — Hero-Effect Coverage Gate (Execution Checklist)

**Source:** docs/ai/work-packets/WP-250-hero-effect-coverage-gate.md
**Layer:** Shared Tooling (`scripts/hero-effect-coverage.mjs` + baseline) + CI
(`.github/workflows/ci.yml`) + operator doc. No engine/registry source changes,
no contract changes.

This EC is the authoritative execution contract for WP-250. Compliance is binary.

---

## Before Starting

- [ ] `pnpm -r build` exits 0 (produces `packages/game-engine/dist/` + `packages/registry/dist/`).
- [ ] `packages/game-engine/dist/rules/heroKeywords.js` exists and exports `HERO_KEYWORDS`.
- [ ] `packages/game-engine/dist/setup/heroAbility.setup.js` exists and exports `buildHeroAbilityHooks`.
- [ ] `node scripts/hero-effect-coverage.mjs` runs and prints the current human report (prototype baseline behavior).
- [ ] 40 set files present (`Get-ChildItem data/cards/*.json` count = 40) and `data/metadata/` exists.

---

## Locked Values

- **WP number:** WP-250. **EC number:** EC-281. **Decision:** D-24021.
- **npm script:** `"sim:coverage": "node scripts/hero-effect-coverage.mjs"` (root `package.json`).
- **Baseline path:** `scripts/coverage/hero-effect-coverage.baseline.json`.
- **Canonical import:** `HERO_KEYWORDS` from `../packages/game-engine/dist/rules/heroKeywords.js`. No local re-declaration of the known-markup vocabulary.
- **Report shape (top-level keys):** `schemaVersion` (= 1), `corpus`, `perSet`, `unsupportedMechanics`.
  - `corpus`: `heroes`, `hooks`, `executable`, `parsedNotExecuted`, `noEffect`.
  - `perSet[<abbr>]`: `hooks`, `executable`, `noEffect`.
  - `unsupportedMechanics[<name>]`: integer count.
- **Classification rules (fixed; match WP-250):** NO_EFFECT = `hook.effects` undefined/empty; PARSED_NOT_EXECUTED = effects non-empty but none in the probe's informational executed-keyword list; EXECUTABLE = ≥1 effect in that list. The list is the probe's own mirror of the executor's handled set — never imported from the executor; the gate never depends on it (D-24021), and its identifier MUST NOT appear in any `--check`/exit-code condition (informational-only).
- **Unsupported-mechanic detection (fixed):** a `[keyword:X]` token whose normalized form ∉ `HERO_KEYWORDS` is one occurrence. Normalization (locked): lowercase → strip trailing `:<digits>` or ` <digits>` → collapse whitespace to single hyphens. (Required: prevents `[keyword:draw:1]` miscounting.) `[keyword:X:1]` and `[keyword:X 1]` normalize equal; a token normalizing to empty (malformed) is ignored, never counted.
- **Gated metric (locked, hybrid D-24021):** HARD-FAIL on a per-set `noEffect` rise OR corpus integrity (a baseline `perSet` set missing from current). WARN-only on unsupported-mechanic growth (a current `unsupportedMechanics` key absent from baseline) — printed, never fails. Baseline-superset is allowed (extra baseline mechanic keys / higher baseline `noEffect` never fail). EXECUTABLE/PARSED split is informational only — never gated.
- **CLI modes (locked):** default = human report; `--json` = deterministic JSON; `--check` = compare-and-exit; `--update-baseline` = write baseline.
- **Exit codes (locked):** `0` = no hard-fail (new-mechanic warnings may print); `1` = hard-fail (`noEffect` rise or missing set); `2` = probe failure; no others. Probe-failure (`2`): missing/unreadable baseline, missing `dist/` imports, absent/invalid `schemaVersion`, JSON parse failure, or zero `corpus.heroes`/`corpus.hooks`.
- **CI job name:** `hero-effect-coverage` in `.github/workflows/ci.yml`, mirroring `typecheck-arena-client` (build workspace → run gate).
- **Commit message:** `EC-281: hero-effect coverage gate — pnpm sim:coverage + CI non-regression (D-24021)`. (Commit-hygiene: code-staged commits use an `EC-###:` prefix, never `WP-NNN:`; the `WP-250:` form is only the squash-merge PR title GitHub applies.)

---

## Guardrails

- `packages/game-engine/src/**` and `packages/registry/src/**` — **zero diff**. No contract (`.types.ts`) change. This packet is tooling + CI only.
- No local known-markup keyword literal in the probe — the vocabulary comes from the imported `HERO_KEYWORDS` (single source of truth; prevents drift).
- No `Math.random`, `Date.now`, `new Date`, or network/process-env read in the probe — output must be byte-deterministic given the in-repo data.
- Deterministic serialization — ONE `serializeDeterministic` used for `--json`, `--check`, and `--update-baseline`; object keys + any arrays sorted lexicographically by UTF-16 code unit (never `localeCompare`); default integer formatting. Byte-identical across repeated runs, machines, Node patch versions, and CI-vs-local.
- The executed-keyword list identifier MUST NOT appear inside the `--check`/comparison/exit-code logic (informational-only; verified by inspection).
- The baseline changes **only** via `--update-baseline` — `--check` and the default/`--json` modes never write it. `--update-baseline` never performs a comparison (CLI mode isolation).
- The gate is one-directional: coverage improvements pass; only regressions (more `noEffect`, a new unmodeled mechanic) fail.

---

## Required `// why:` Comments

- `scripts/hero-effect-coverage.mjs`, at the `HERO_KEYWORDS` import: cite that the markup vocabulary is sourced from the engine's canonical array, not duplicated (drift prevention).
- `scripts/hero-effect-coverage.mjs`, at the bucket-classification site: cite D-24021 — the EXECUTABLE/PARSED split is informational and deliberately not coupled to the executor's internal keyword set; the gate keys on `noEffect` (pure parser output) so it needs no engine executor constant.
- `scripts/hero-effect-coverage.mjs`, at `serializeDeterministic`: cite that sorted keys/arrays make `--check` diffs machine-stable.
- `.github/workflows/ci.yml`, at the new job: cite that the gate guards hero-effect coverage from silent regression (Lever 3 of `DESIGN-EFFECT-AUTHORING-SCALE.md`).

---

## Files to Produce

- `scripts/hero-effect-coverage.mjs` — **modified** — canonical `HERO_KEYWORDS` import; `buildCoverageReport` + `serializeDeterministic`; `--json` / `--check` / `--update-baseline` modes.
- `scripts/coverage/hero-effect-coverage.baseline.json` — **new** — written via `--update-baseline` from `main`.
- `package.json` — **modified** — `sim:coverage` script.
- `.github/workflows/ci.yml` — **modified** — `hero-effect-coverage` job.
- `docs/ai/REFERENCE/hero-effect-coverage.md` — **new** — operator doc (3 modes + regression rule + update workflow).
- Governance: `STATUS.md`, `DECISIONS.md` (D-24021), `WORK_INDEX.md` (WP-250 ✅), `EC_INDEX.md` (EC-281 Done), `05-ROADMAP-MINDMAP.md` (node under Complete-Game Testing).

---

## After Completing

- [ ] `pnpm -r build` exits 0.
- [ ] `node scripts/hero-effect-coverage.mjs --json` emits JSON with keys `schemaVersion`/`corpus`/`perSet`/`unsupportedMechanics` (`schemaVersion` = 1); two consecutive runs are byte-identical.
- [ ] `Select-String -Path scripts\hero-effect-coverage.mjs -Pattern "new Set\(HERO_KEYWORDS\)"` → 1 (known-markup vocabulary derived from the canonical import, not a hand-typed literal).
- [ ] `Select-String -Path scripts\hero-effect-coverage.mjs -Pattern "Math.random|Date.now|new Date"` → no output.
- [ ] `scripts/coverage/hero-effect-coverage.baseline.json` carries `schemaVersion: 1`; two `--update-baseline` writes are byte-identical and two `--json` runs are byte-identical (determinism — not a fragile file==stdout byte compare).
- [ ] `pnpm sim:coverage --check` exits 0.
- [ ] Lower one set's baseline `noEffect` by 1 → `--check` exits `1`, prints `<set>: noEffect ..→..` → revert → exits 0.
- [ ] Delete one `unsupportedMechanics` key from baseline → `--check` prints `WARN: NEW unsupported mechanic: <name>` and exits **`0`** (hybrid; never fails) → revert. (A fabricated extra baseline key also passes — baseline-superset.)
- [ ] Add a fabricated set key to baseline `perSet` (absent from current) → `--check` exits `1` naming the missing set (corpus integrity) → revert.
- [ ] Set baseline `schemaVersion` to 2, or zero out `corpus.hooks` → `--check` exits `2` (probe failure, not 0/1) → revert.
- [ ] `--check` leaves `hero-effect-coverage.baseline.json` byte-unchanged (`Get-FileHash` before == after).
- [ ] `.github/workflows/ci.yml` contains a `hero-effect-coverage` job running `pnpm -r build` then `pnpm sim:coverage --check`.
- [ ] `git diff --name-only packages/` → empty.
- [ ] `git diff --name-only` → only files in WP-250 `## Files Expected to Change` + governance files.
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-250 node present; no orphan).

---

## Common Failure Smells

- `--json` output differs between two runs → non-deterministic serialization; sort keys/arrays before emitting.
- `git diff packages/` non-empty → an engine/registry file was touched; this packet is tooling-only — revert it.
- `--check` fails on a clean tree right after `--update-baseline` → the report shape or serialization differs between write and read; use the same `serializeDeterministic` path for both.
- The gate fails when coverage *improved* → the comparison is bidirectional; it must hard-fail only on a `noEffect` increase or a missing set.
- A new `[keyword:X]` mechanic HARD-fails the build → under the hybrid posture it must WARN (exit 0), not fail; only `noEffect`/missing-set hard-fail.
- A new mechanic produces no `WARN` line → the unsupported-mechanic check isn't comparing current keys against the baseline's `unsupportedMechanics`.
- `--json` output differs across machines or Node patch versions → incomplete deterministic serialization (unsorted keys/arrays, or non-default numeric formatting).
- An old baseline silently passes after a schema change → the `schemaVersion` guard is missing; a mismatch must be a loud probe failure (`2`), never a `0`/`1`.
- A set disappears from the corpus and `--check` still passes → the corpus-integrity check isn't asserting every baseline `perSet` set exists in current.
