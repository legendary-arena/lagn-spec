# EC-143 — Physical Card Phase 1b: Per-Set Patch Curation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-140-physical-card-phase-1b-patch-curation.md
**Layer:** Tooling (`scripts/convert-cards/inputs/patches/` + `convert-cards-v15.mjs`) + Registry data (`data/cards/*.json` regenerated)
**Scope note:** WP-140 = Phase 1b of the WP-138 lineage. **Schema, engine, viewer, server UNTOUCHED.** Adds `_skipPair` patch annotation (D-13901) + curates the 262-entry audit-warning worklist surfaced by WP-138 Phase 1a.

## Before Starting

- [ ] Lint gate `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` passed for this session
- [ ] WP-138 EXECUTED (not just drafted) — `WORK_INDEX.md` shows `[x] WP-138 — ... Phase 1a — Done 2026-05-08 (Commit A 763f84b)`
- [ ] All 40 `data/cards/*.json` carry populated `physicalCards[]` (post-WP-138 regeneration)
- [ ] `convert-cards-v15.mjs` v17 patch format committed (`hero.physicalCards[]` block); `inputs/patches/README.md` documents the falcon-winter-soldier worked example
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 with baseline `39 / 4 / 0`
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with baseline `698 / 150 / 0`
- [ ] `docs/ai/DECISIONS.md` most recent decision is D-13806 (or D-13811 if WP-139 landed first); D-13901 lands at execution
- [ ] **Worklist freeze captured FIRST:** `node scripts/convert-cards/convert-cards-v15.mjs 2>&1 | grep -E "^  - Set" > docs/ai/session-context/wp-140-worklist.txt` and committed before any patch authoring

## Locked Values (do not re-derive)

- Solo physicalCard image: `{setAbbr}-hr-{heroSlug}-{cardSlug}.webp` (inherited from WP-138)
- Split physicalCard image: `{setAbbr}-hr-{heroSlug}-{sortedA}-{sortedB}.webp` — UTF-16 code-unit sort per D-13802 (no `localeCompare` without explicit `'en'` locale)
- `physicalCard.id` format: `^p\d+$`; deterministic + stable (split: patch declaration order)
- `physicalCard.count`: positive integer; sum across sides matches `cardCounts[sideName]` per D-13801
- `physicalCard.sides`: `1 <= length <= 2`; this WP only authors 2-element arrays for curated split pairs
- **`_skipPair` matching contract (D-13901, normative — verbatim from WP §Scope A):** unordered 2-set semantics (`["a","b"]` === `["b","a"]`); exact slug equality (no case folding, no Unicode normalization, no whitespace strip, no locale comparison); length lock = exactly 2; no duplicate entries within a hero's `_skipPair[]`; existing-slug requirement (resolves to `cards[].slug` under same hero); mutual exclusion with `physicalCards[].sides` (slug in at most ONE)
- **Deterministic per-hero execution order (verbatim from WP §Scope B):** (1) load patch → (2) validate `_skipPair[]` shape → (3) `buildPhysicalCards` synthesis → (4) validate slug mutual exclusion → (5) identify paired-equal candidate clusters → (6) apply `_skipPair` filter → (7) validate no-partial-resolution / cluster coverage → (8) emit remaining warnings → (9) apply `--strict` failure
- **Cluster (definition):** maximal set of `cards[]` under a hero sharing the same `cardCounts` value, surfaced by the convert script as candidate split-pair combinations; identified BEFORE `_skipPair` filtering; treated as **atomic** for resolution
- Log line format: `📎 SkipPair: hero=<slug> pairs=<N> slugs=[(a,b),(c,d)]` (slug pairs inline; within each pair sorted UTF-16 code-units; across pairs sorted by first then second element — same posture as D-13802 sort lock)
- **Worklist freeze byte-identity:** until first patch is authored, re-running the convert command must produce output byte-identical to `wp-140-worklist.txt` (deviation = upstream input drift = BLOCKED)
- `--strict` exit posture: **0** under Phase 1b (inverse of WP-138 Phase 1a's expected exit-1)
- Test baselines: registry `39 / 4 / 0` UNCHANGED; engine `698 / 150 / 0` UNCHANGED
- Sole new decision: **D-13901** (`_skipPair` annotation grammar + matching contract)
- 9 `MatchSetupConfig` composition fields unchanged (this WP touches no engine surface)

## Guardrails

- **Schema UNTOUCHED.** `packages/registry/src/schema.ts` not in diff. `HeroSchema.superRefine` invariants from WP-138 are the contract; Phase 1b authors data within them.
- **Engine + viewer + server source UNTOUCHED.** `git diff --stat packages/game-engine/ apps/registry-viewer/ apps/arena-client/ apps/server/ packages/registry/` empty post-execution.
- **`_skipPair` is the SOLE false-positive escape hatch.** Every audit warning resolves to either an explicit `physicalCards[]` block OR an explicit `_skipPair` entry. No silent suppression. No other annotations introduced.
- **Cluster coverage is total (machine-enforced).** A "paired-equal candidate cluster" is the maximal set of `cards[]` under a hero sharing the same `cardCounts` value. Every member slug of every cluster MUST appear in **exactly one** of: a `physicalCards[].sides` entry OR a `_skipPair` entry. Clusters of size > 2 may be resolved via multiple disjoint pairs / `_skipPair` entries / a mix — coverage of every member is what matters.
- **No partial hero resolution.** Hero with at least one cluster member resolved + at least one cluster member uncovered fails conversion (corollary of cluster coverage rule).
- **Slug mutual exclusion (machine-enforced).** A given `cards[].slug` under a hero appears in `physicalCards[].sides` OR `_skipPair`, never both (consequence of the "exactly one" coverage rule). Convert script fails on violation.
- **`_skipPair` idempotency (output-shape invariant).** `_skipPair` affects audit-warning emission ONLY — never `physicalCards[]` synthesis output (`id`, `count`, `sides`, `imageUrl`). Any `data/cards/*.json` difference between a run with `_skipPair` populated and the same run with the annotation removed (other than the warning suppression itself) is a conversion failure.
- **Patch authoring is per-set; no cross-set inference.** No auto-detection from heuristics (D-13805). Each `physicalCards[]` declaration is curated against the printed card list for that specific hero.
- **STOP on uncertainty.** If split-vs-coincidence is unclear, record using the structured tag and do NOT guess: `UNRESOLVED — NEED SOURCE VERIFICATION` with `set:`, `hero:`, `candidate: [<slugA>, <slugB>]`, `reason:`. Any unresolved cluster blocks Phase 1b completion.
- **Determinism preserved.** `_skipPair` filtering is set-membership match against literal slug strings — no comparator, no locale, no ordering dependency. Re-runs against unchanged inputs produce byte-identical `data/cards/*.json`.
- **Drift validation continues to fire.** `sum(physicalCards counts) === cardCounts[sideName]` per D-13801 must hold for every newly-curated `physicalCards[]` block.

## Required `// why:` Comments

- `convert-cards-v15.mjs` `_skipPair[]` shape validator: anchor D-13901 matching contract (unordered 2-set, length lock, no-duplicate, existing-slug, mutual-exclusion-with-`physicalCards[]`)
- `convert-cards-v15.mjs` filter / no-partial-resolution enforcement: anchor D-13901 deterministic per-hero execution order (steps 4–7)
- `convert-cards-v15.mjs` cluster-coverage enforcement (the "exactly one" check): anchor D-13901 + WP §Cluster coverage rule. Conceptually distinct from no-partial-resolution: no-partial-resolution forbids a hero with mixed resolved + unresolved cluster members; cluster coverage additionally forbids any cluster member appearing in *zero* resolution structures (uncovered) OR in *both* `physicalCards[].sides` and `_skipPair` (over-covered). The "exactly one" semantics is what makes the cluster construct atomic for resolution.
- `convert-cards-v15.mjs` `📎 SkipPair: ...` emission line: anchor "slug pairs inline for forensic audit" rationale + deterministic pair ordering (within-pair UTF-16 + across-pair sort by first then second element — D-13802 posture)
- `inputs/patches/README.md` v18 section header: cross-reference D-13901 + WP-140 §Scope A worked example

## Files to Produce

- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — `_skipPair` parsing + matching-contract validator + 9-step execution order + filter + no-partial-resolution enforcement + improved log emission
- `scripts/convert-cards/inputs/patches/README.md` — **modified** — v18 section documenting `_skipPair` format with worked example
- `scripts/convert-cards/inputs/patches/{bkwd,mgtg,msis,msmc,msp1,wpnx,wwhk,xmen}.patch.json` — **modified** — `physicalCards[]` blocks for split-side heroes (exact list determined by frozen worklist)
- `scripts/convert-cards/inputs/patches/*.patch.json` (additional sets: `3dtc`, `anni`, `antm`, `bkpt`, etc.) — **modified** — `_skipPair[]` annotations for false-positive paired-equal patterns (exact list determined by frozen worklist)
- `data/cards/*.json` (40 files) — **regenerated** via re-run of `convert-cards-v15.mjs` + `apply-card-counts.mjs`
- `docs/ai/session-context/wp-140-worklist.txt` — **new** — frozen audit-warning surface (committed session artifact per `.claude/rules/work-packets.md` §Invocation Artifacts)
- `docs/ai/DECISIONS.md` — **modified** — D-13901 appended (`_skipPair` annotation grammar + matching contract)
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-140 row Draft → Done with date + commit hash
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-143 row Draft → Done
- `docs/ai/STATUS.md` — **modified** — session-close block prepended

**Explicitly NOT touched** (verify via `git diff --stat`): `packages/registry/src/schema.ts`, `packages/registry/src/impl/{localRegistry,httpRegistry}.ts`, `packages/registry/src/registry.smoke.test.ts`, `packages/game-engine/`, `apps/registry-viewer/`, `apps/arena-client/`, `apps/server/`, `scripts/convert-cards/migrate-renamed-to-v16.mjs` (Phase 3 scope), `docs/ai/REFERENCE/api-endpoints.md` (no HTTP surface).

## After Completing

- [ ] Convert pipeline non-strict exits 0 with **zero remaining audit warnings** for paired-equal patterns
- [ ] `LEGENDARY_CONVERT_STRICT=1 node scripts/convert-cards/convert-cards-v15.mjs` exits **0** (Phase 1b acceptance gate)
- [ ] `node scripts/convert-cards/apply-card-counts.mjs` exits 0
- [ ] Registry test baseline `39 / 4 / 0` UNCHANGED; drift / orphan / duplicate invariants pass against every regenerated set
- [ ] Engine test baseline `698 / 150 / 0` UNCHANGED
- [ ] `git diff --stat packages/game-engine/ apps/registry-viewer/ apps/arena-client/ apps/server/ packages/registry/` empty
- [ ] `git diff --stat scripts/convert-cards/migrate-renamed-to-v16.mjs` empty
- [ ] **Completeness gate:** every line in `docs/ai/session-context/wp-140-worklist.txt` maps 1:1 to either a `physicalCards[]` block declaration or a `_skipPair` entry in the executed commit; zero `UNRESOLVED — NEED SOURCE VERIFICATION` clusters remain (`grep -n "UNRESOLVED — NEED SOURCE VERIFICATION" docs/ai/STATUS.md docs/ai/session-context/wp-140-worklist.txt` returns no matches)
- [ ] **Idempotency spot-check:** for one curated `_skipPair` entry, temporarily remove it + re-run convert + diff `data/cards/<set>.json` against the executed-state version → expected empty diff (only the convert-log warning re-appears; data file is byte-identical). Restore the entry before commit.
- [ ] D-13901 appended to `docs/ai/DECISIONS.md` in numeric order
- [ ] `WORK_INDEX.md` WP-140 row Draft → Done with date + commit hash; `EC_INDEX.md` EC-143 row Draft → Done; `STATUS.md` session-close block prepended
- [ ] 01.6 post-mortem authored (mandatory per WP §Definition of Done item 9 — three triggers: high-touch curation across ~24 patches; first use of `_skipPair` annotation locks the false-positive escape-hatch grammar; Phase 1b completion unblocks Phase 2)

## Common Failure Smells

- "Slug `<X>` appears in both `physicalCards[].sides` and `_skipPair`" at conversion: mutual-exclusion violation — pick ONE resolution mode for that slug
- Hero fails conversion with "partially-resolved paired-equal candidates" or "uncovered cluster member": cluster-coverage guardrail tripped — every member of every cluster must appear in exactly one of `physicalCards[].sides` OR `_skipPair`. For clusters > 2 members, mixed coverage is permitted only if every member is accounted for exactly once.
- Worklist drift detected at byte-identity check: upstream `inputs/cards/*.js`, `convert-cards-v15.mjs`, or `apply-card-counts.mjs` changed mid-session. STOP, identify cause, re-freeze the worklist or revert the upstream change before resuming curation.
- Idempotency spot-check produces non-empty `git diff data/cards/<set>.json` after restoring `_skipPair`: the convert-script extension is coupling `_skipPair` into synthesis output. Revert the coupling — `_skipPair` only suppresses warnings.
- `physicalCards.length` matches `cards.length` for a hero that should have splits: `_skipPair` accidentally suppressed a real split pair, or `physicalCards[]` block missing from patch — re-check against printed deck
- Two paired sides resolve to **different** image URLs in regenerated data: WP-138 D-13802 sort lock breached upstream — should not be possible unless convert script's `heroImageUrl` was edited (out of scope for this WP)
- Engine or registry baseline shifts: scope creep — engine / registry source touched. Revert.
- New audit warnings appear that were not in `wp-140-worklist.txt`: upstream input drifted mid-session — STOP and investigate before continuing curation
- `📎 SkipPair: ...` log line missing `slugs=[...]` inline detail: log emission did not pick up the improved format from WP §Scope B; forensic audit will require re-opening the patch
