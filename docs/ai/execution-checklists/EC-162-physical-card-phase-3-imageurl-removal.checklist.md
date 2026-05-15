# EC-162 — Physical Card Phase 3 — imageUrl Removal + R2 Rename (Execution Checklist)

**Source:** docs/ai/work-packets/WP-151-physical-card-phase-3-imageurl-removal.md
**Layer:** Registry (`packages/registry/src/`) + Registry Viewer (`apps/registry-viewer/src/registry/`) + Convert Script (`scripts/convert-cards/`) + Data (`data/cards/`). No engine runtime change. No server change. No preplan change.

## Before Starting
- [ ] **FIRST GATE:** All 40 `data/cards/*.json` have `physicalCards[]` on every hero (run WP Verification Step 3). If any hero lacks `physicalCards[]`, STOP — data prerequisite unmet.
- [ ] WP-141 (Phase 2 consumer migration) complete on `main`
- [ ] WP-147 (companionSlug + side-order) complete on `main`
- [ ] Viewer `sideToImageUrl` logic reviewed — confirm it matches the locked algorithm in WP §Scope item 2 before removing fallback
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm --filter "@legendary-arena/registry-viewer..." test` exits 0
- [ ] Record baseline test counts: registry `NN / N / 0`, engine `NNN / NNN / 0`, viewer `NN / N / 0`

## Locked Values (do not re-derive)
- D-13802: `physicalCard.imageUrl` is the canonical hero image source
- D-14103: `HeroCardSchema.imageUrl` transition window closes at this WP
- D-14101: `sides[0]` is the canonical face slug for split-pair heroes
- D-14701/D-14702: `companionSlug` insertion + source-data side order
- `heroImageUrl()` at `packages/registry/src/heroImageUrl.ts` — byte-identical pre/post
- Non-hero schemas (`MastermindCardSchema`, `VillainCardSchema`, `SchemeSchema`) — byte-identical pre/post
- `PhysicalCardSchema.imageUrl` — retained (canonical source)
- `physicalCards[]` arrays in all 40 JSONs — byte-identical pre/post
- `sideToImageUrl` algorithm: iterate `hero.physicalCards[]`, iterate `pc.sides[]`, map `side → pc.imageUrl`. No normalization, no slug transformation, no fallback. Registry and viewer implementations must match.
- R2 rename mapping: only files with BOTH deterministic source AND target. No heuristic guessing. Unmatched files excluded.
- No new fields on `HeroCardSchema` or hero card objects

## Guardrails
- Do NOT remove `imageUrl` from any non-hero schema
- Do NOT modify `heroImageUrl.ts`
- Do NOT modify `physicalCards[]` structure or values in any JSON
- Do NOT modify `packages/game-engine/src/setup/buildCardDisplayData.ts` (out of scope; fallback degrades safely)
- Verify every hero in all 40 JSONs has `physicalCards[]` BEFORE removing `imageUrl` from schema
- Non-hero card blocks in both `shared.ts` files (villain, mastermind, scheme, henchman, bystander, wound) must remain byte-identical
- Engine primary `physicalCards` path in `buildCardDisplayData.ts` (lines 353–389) must remain byte-identical
- R2 rename is operator-executed — script produces commands, does not execute them
- JSON regeneration must produce deterministic key order and formatting (no git churn from reordering)
- After regeneration, verify ALL 40 JSONs are uniform (zero hero cards with `imageUrl` — no mixed state from partial runs)

## Required `// why:` Comments
- `packages/registry/src/shared.ts`: at the new `sideToImageUrl` lookup block, explain D-15101 closure and `physicalCards[]` as sole hero image source
- `apps/registry-viewer/src/registry/shared.ts`: update existing D-14103 `// why:` block to reference D-15101 (transition closed)

## Files to Produce
- `packages/registry/src/schema.ts` — **modified** — remove `imageUrl` from `HeroCardSchema`
- `packages/registry/src/shared.ts` — **modified** — add `physicalCards[]` → `sideToImageUrl` lookup in hero block
- `apps/registry-viewer/src/registry/shared.ts` — **modified** — remove dead `card.imageUrl` fallback in hero block
- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — stop emitting `imageUrl` on hero cards
- `data/cards/*.json` (40 files) — **modified** — regenerated without hero `imageUrl`
- `packages/registry/src/schema.test.ts` (or sibling) — **modified** — update fixtures if needed
- `scripts/rename-r2-split-pairs.mjs` — **new** (optional; rclone commands documented inline if not)

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0 — record final baselines and confirm no regression
- [ ] Zero hero card entries contain `imageUrl` across all 40 JSONs (Verification Step 2)
- [ ] All heroes still have `physicalCards[]` (Verification Step 3)
- [ ] Non-hero `imageUrl` preserved (Verification Step 4)
- [ ] `heroImageUrl.ts` byte-identical (`git diff` empty)
- [ ] `buildCardDisplayData.ts` byte-identical (`git diff` empty)
- [ ] Mixed-schema consistency check passes (WP Verification Step 10: `withField: 0`)
- [ ] Viewer `sideToImageUrl` logic matches registry implementation (WP Verification Step 11)
- [ ] R2 rename mapping produced and reviewed
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-15101, D-15102)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-162 → Done

## Common Failure Smells (Optional)
- Registry `flattenSet()` hero FlatCards have `imageUrl: undefined` → forgot to add `sideToImageUrl` lookup in `packages/registry/src/shared.ts`
- Engine tests fail on hero display data with empty imageUrl → registry `flattenSet()` not updated; engine reads FlatCard from registry
- Regenerated JSONs still contain `imageUrl` on hero cards → convert script not updated; re-run after editing
- Viewer hero images 404 → `sideToImageUrl` lookup returning empty string; check that `physicalCards[].sides` includes the card slug
- Some JSONs have `imageUrl` on hero cards, others don't → partial convert run; re-run convert script on all 40 sets
- Registry and viewer produce different hero FlatCard imageUrl values → `sideToImageUrl` construction diverged; compare implementations
