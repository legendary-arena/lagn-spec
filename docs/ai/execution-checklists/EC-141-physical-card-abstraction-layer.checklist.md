# EC-141 — Physical Card Abstraction Layer — Phase 1a (Execution Checklist)

**Source:** docs/ai/work-packets/WP-138-physical-card-abstraction-layer.md
**Layer:** Registry (schema) + Tooling (`scripts/convert-cards/`)
**Scope note:** WP-138 was rescoped to **Phase 1a only** (pre-flight PS-3, 2026-05-07). Phase 1b/2/3 are deferred to follow-up WPs.

## Before Starting

- [ ] Lint gate `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` passed for this session
- [ ] WP-003, WP-082, WP-083, WP-135 complete; **WP-137 EXECUTED** (not just drafted) — `WORK_INDEX.md` shows `[x] WP-137`
- [ ] `data/cards/*.json` reflect post-WP-137 regeneration
- [ ] Registry + game-engine baselines (build + test) green pre-execution; record post-WP-137 baseline counts
- [ ] `docs/ai/DECISIONS.md` most recent decision is D-13703 or later (post-WP-137); D-13801..D-13806 land at execution

## Locked Values (do not re-derive)

- Solo image URL: `{setAbbr}-hr-{heroSlug}-{cardSlug}.webp`
- Split image URL: `{setAbbr}-hr-{heroSlug}-{sortedA}-{sortedB}.webp`
- Sort: `Array.prototype.sort()` with **no comparator argument** (UTF-16 code-unit ordering); never `localeCompare` without explicit `'en'` locale
- `physicalCards[].sides.length` invariant: `1 <= length <= 2`; TS type `readonly string[]`; ceiling enforced by validator
- `physicalCards[].id` format: `^p\d+$`; **deterministic + stable** across re-conversions (split: patch declaration order; solo: `cards[]` array order)
- `sideToPhysicalCard` key: namespaced compound `<heroSlug>/<sideSlug>`; **never `sideSlug` alone**
- Per-side ext_id format from D-13502 unchanged: `<setAbbr>/<heroSlug>/<cardSlug>` with WP-137's `#N` copy suffix per D-13702
- CI strict flag: `--strict` (or env `LEGENDARY_CONVERT_STRICT=1`); **expected to FAIL under Phase 1a** until Phase 1b lands all per-set patches
- Phase 1a deliverable: schema + tooling + solo auto-path + audit warnings + drift validation + ONE reference patch (`bkwd / falcon-winter-soldier`)
- Test-count delta: **+7 tests / +1 suite** in `packages/registry/src/registry.smoke.test.ts` only
- Decisions in numeric order: D-13801, D-13802, D-13803, D-13804, D-13805, D-13806

## Guardrails

- `packages/registry/src/schema.ts` modification requires D-13801..D-13806 in same commit set; each new field carries a `// why:` anchor naming its decision
- `physicalCards[]` is the **sole** authority for deck composition (D-13801) — but Phase 1a does NOT migrate consumers; engine + viewer continue to read `cards[].imageUrl` and per-side `cardCounts` unchanged
- Split-pair declarations come **only** from patches (D-13805); converter never auto-detects pairs — heuristic detection emits warnings only
- Per-side ext_id grammar from D-13502 unchanged (D-13804); replay or audit code MUST NOT assume per-side ext_id uniquely identifies a physical card instance
- Runtime `sideToPhysicalCard` Map is registry-load only; never persisted, snapshotted, or written to PostgreSQL (D-13806)
- Drift validation at registry load: `sum(physicalCards where sides includes sideName).count === cardCounts[sideName]` for every hero with `cardCounts` populated; drift fails load with full-sentence error
- **No orphan sides:** every `physicalCards[].sides[]` entry resolves to an existing `cards[].slug` under the same hero (WP-138 constraint 8)
- **No duplicate side membership within a hero:** a side slug appears in at most one `physicalCard` within a given hero (WP-138 constraint 9); cross-hero reuse permitted via namespaced index key
- **Engine + viewer source UNTOUCHED** under Phase 1a — `git diff packages/game-engine/ apps/registry-viewer/` MUST be empty post-execution
- `HeroCardSchema.imageUrl` **stays present** under Phase 1a — Phase 3 removal is a follow-up WP

## Required `// why:` Comments

- `schema.ts` `PhysicalCardSchema`: anchor D-13801 + D-13802
- `schema.ts` `HeroSchema.physicalCards`: anchor D-13803 (uniform model)
- `convert-cards-v15.mjs` `heroImageUrl(setAbbr, heroSlug, sides)`: anchor D-13802 sort lock (no localeCompare, no locale dependency)
- `convert-cards-v15.mjs` `--strict` flag handler: anchor CI hardening
- `localRegistry.ts` + `httpRegistry.ts` `sideToPhysicalCard` index build: anchor D-13806 (runtime-only); namespaced compound key justification
- Solo-auto-path emission in convert script: anchor D-13803 (uniform model — solo heroes get one-side physicalCards)

## Files to Produce (Phase 1a)

- `packages/registry/src/schema.ts` — modified — `PhysicalCardSchema`, `HeroSchema.physicalCards`; `HeroCardSchema.imageUrl` PRESERVED
- `packages/registry/src/impl/{localRegistry,httpRegistry}.ts` — modified — validate physicalCards, build runtime index, expose `getPhysicalCardForSide`
- `packages/registry/src/index.ts` — modified — export `PhysicalCard` type and `getPhysicalCardForSide`
- `packages/registry/src/registry.smoke.test.ts` — modified — exactly +7 tests in one new `describe('physicalCards (WP-138 Phase 1a)')` block
- `scripts/convert-cards/convert-cards-v15.mjs` — modified — `heroImageUrl(sides)` signature, `--strict` flag, audit warnings, drift validation, solo-auto-path
- `scripts/convert-cards/inputs/patches/bkwd.patch.json` — modified — add `physicalCards[]` block to `falcon-winter-soldier` (canonical reference patch; **no other patch files modified**)
- `scripts/convert-cards/inputs/patches/README.md` — modified — v17 format docs
- `data/cards/*.json` — regenerated — all 40 sets with `physicalCards[]` (solo-auto-path for non-bkwd; reference grouping for bkwd/falcon-winter-soldier)
- `docs/ai/{DECISIONS,STATUS}.md`, `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md` — governance ledgers

**Explicitly NOT touched** (Phase 2/3 work; verify via `git diff --stat`): `packages/game-engine/`, `apps/registry-viewer/`, the 24 non-bkwd split-hero patch files, `migrate-renamed-to-v16.mjs`.

## After Completing

- [ ] Registry build + test green; **+7 tests / +1 suite** vs post-WP-137 baseline
- [ ] **Engine baseline UNCHANGED** (post-WP-137 counts preserved exactly) — proves no consumer migration
- [ ] `git diff --stat packages/game-engine/ apps/registry-viewer/` empty
- [ ] `convert-cards-v15.mjs` non-strict exits 0 with audit warnings for un-curated split heroes; `--strict` exits NON-zero (CI green-state requires Phase 1b)
- [ ] Falcon-Winter-Soldier fixture: `physicalCards.length === 4` with 3 `sides.length===2` + 1 `sides.length===1`; `count` sum === 14
- [ ] Spider-Man (solo) fixture: `physicalCards.length === cards.length`; every entry has `sides.length === 1`
- [ ] `grep -rn '\.localeCompare(' scripts/convert-cards/ packages/registry/src/` empty
- [ ] `WORK_INDEX.md` WP-138 row Draft → Done with date + commit hash + "Phase 1a" annotation; `EC_INDEX.md` EC-141 row Draft → Done; `STATUS.md` updated
- [ ] 01.6 post-mortem authored (mandatory per WP §Definition of Done — new long-lived registry abstraction)

## Common Failure Smells

- Two paired sides resolve to **different** image URLs: sort comparator slipped (`localeCompare` without explicit `'en'` locale, or sort happened on non-array)
- "physicalCard `<id>` references unknown side slug `<X>`" at load: orphan-side violation (WP-138 §8) — patch declared a side not in `cards[]`
- "Side slug `<X>` appears in physicalCards `<id1>` and `<id2>`" at load: duplicate-membership violation (WP-138 §9)
- `physicalCard.id` values shift when re-running converter on unchanged inputs: non-deterministic generator — fix to follow declaration order
- Engine baseline shifts (test counts change): scope creep — engine source touched when it should not be under Phase 1a. Revert engine edits
- `git diff packages/game-engine/ apps/registry-viewer/` non-empty: same — Phase 1a scope was breached
