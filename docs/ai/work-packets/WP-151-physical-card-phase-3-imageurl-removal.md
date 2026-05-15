# WP-151 — Physical Card Phase 3 — `HeroCardSchema.imageUrl` Removal + R2 Image Rename

## Goal

Close the Physical Card migration by removing the transitional
`HeroCardSchema.imageUrl` field (D-13802 / D-14103), updating both
registry `flattenSet()` implementations to source hero image URLs from
`physicalCards[]`, regenerating all 40 card JSONs without the field, and
renaming the 44 unmatched R2 split-pair image files to the canonical
combined-name pattern produced by `heroImageUrl()`. After this WP,
`physicalCards[].imageUrl` is the **sole** hero image source across the
entire stack.

## Assumes

- WP-138 (Physical Card Phase 1a — schema) complete ✅
- WP-140 (Physical Card Phase 1b — patch curation) complete ✅
- WP-141 (Physical Card Phase 2 — engine + viewer consumer migration) complete ✅
- WP-147 (companionSlug + physical-side order) complete ✅
- All 40 `data/cards/*.json` files contain `physicalCards[]` on every hero entry
- `heroImageUrl()` at `packages/registry/src/heroImageUrl.ts` produces the
  canonical combined-name URL pattern and is correct as-is
- R2 bucket `legendary-images` is accessible via rclone remote `legendary-r2`
- The 44 unmatched files from the v16 migration (`scripts/convert-cards/migrate-renamed-to-v16.mjs`)
  are still present on R2 under their old cost-based filenames

If any assumption is false, this Work Packet is BLOCKED and must not proceed.

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary (Registry layer)
- `docs/ai/DECISIONS.md` — D-13802 (physicalCard.imageUrl canonical),
  D-14103 (HeroCardSchema.imageUrl preserved until Phase 3),
  D-14101 (sides[0] canonical face), D-14701 (companionSlug),
  D-14702 (side-order convention)
- `packages/registry/src/schema.ts` — HeroCardSchema definition
- `packages/registry/src/heroImageUrl.ts` — canonical URL builder
- `packages/registry/src/shared.ts` — engine-side `flattenSet()` hero block
- `apps/registry-viewer/src/registry/shared.ts` — viewer-side `flattenSet()` hero block
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — engine consumer
  (sections 1, 1b, 1b-fallback)
- `scripts/convert-cards/convert-cards-v15.mjs` — hero `imageUrl` emission
- `scripts/convert-cards/migrate-renamed-to-v16.mjs` — v16 migration (44 unmatched context)

## Scope (In)

1. **Schema removal** — remove `imageUrl` from `HeroCardSchema` in
   `packages/registry/src/schema.ts`. Non-hero schemas
   (`MastermindCardSchema`, `VillainCardSchema`, `SchemeSchema`,
   `PhysicalCardSchema`) are **untouched**.

2. **Registry `flattenSet()` update** — update the hero block in
   `packages/registry/src/shared.ts` to build a `sideToImageUrl` map
   from `hero.physicalCards[]` and use it as the sole `imageUrl` source
   for hero FlatCards. Fallback for absent `physicalCards`: empty string.

   **Deterministic mapping contract — `sideToImageUrl`:** the map MUST
   be constructed using the exact logic already present in the
   viewer-side `flattenSet()` (WP-141 / D-14103):
   ```
   for (const pc of hero.physicalCards) {
     for (const side of pc.sides) {
       sideToImageUrl.set(side, pc.imageUrl);
     }
   }
   ```
   No normalization, slug transformation, or fallback logic is
   permitted. This ensures registry and viewer `flattenSet()` outputs
   remain behaviorally identical.

3. **Viewer `flattenSet()` cleanup** — in
   `apps/registry-viewer/src/registry/shared.ts` hero block (line 44
   area), remove the dead `card.imageUrl` fallback from the ternary
   chain (`sideToImageUrl.get(card.slug) ?? card.imageUrl ?? ""` →
   `sideToImageUrl.get(card.slug) ?? ""`).

4. **Convert script update** — in `scripts/convert-cards/convert-cards-v15.mjs`,
   stop emitting `imageUrl` on hero card objects. The field is no longer
   in the schema.

5. **Data regeneration** — run the convert script to regenerate all 40
   `data/cards/*.json`. Hero card entries lose `imageUrl`; all other
   card types and `physicalCards[]` data are byte-identical.

6. **R2 split-pair rename** — produce an operator-facing rename mapping
   for the 44 unmatched R2 files. Either:
   - (a) A new script `scripts/rename-r2-split-pairs.mjs` that reads
     the 40 card JSONs, computes the `heroImageUrl()` combined-name
     for every split-pair hero, and emits rclone `moveto` commands; or
   - (b) Inline rclone commands documented in this WP's verification steps.
   The rename is an **operator action** — the script produces commands,
   the operator reviews and executes them.

   **R2 mapping constraint — source resolution:** the rename mapping
   MUST only include files where BOTH are deterministically known:
   the source filename (existing R2 object) and the target filename
   (derived via `heroImageUrl()`). If a source filename cannot be
   deterministically matched to a hero physical card, it MUST be
   excluded from the mapping output. No heuristic guessing is
   permitted. Unmatched files remain unchanged for manual triage.

7. **Test updates** — update registry tests if the schema change causes
   test data fixtures to fail validation (hero card fixtures with
   `imageUrl` must have the field removed).

## Out of Scope

- `imageUrl` on non-hero schemas (`MastermindCardSchema`,
  `VillainCardSchema`, `SchemeSchema`, `PhysicalCardSchema`) — retained
- `images.barefootbetters.com` → `images.legendary-arena.com` host
  migration (orthogonal future WP)
- Physical-side audit for the 37 non-Drax two-side entries (deferred
  from WP-147)
- Modifications to `heroImageUrl.ts` (already produces correct URLs)
- Changes to `packages/game-engine/src/setup/buildCardDisplayData.ts` —
  the primary `physicalCards` path (section 1b, lines 353–389) is
  already correct; the fallback path (section 1b, lines 394–418)
  gracefully degrades to `imageUrl: ''` when the field is absent, which
  is acceptable defense-in-depth. Cleanup is deferred.
- Any engine runtime behavior change beyond the FlatCard `imageUrl`
  source switch in registry `flattenSet()`
- R2 file **deletion** — only rename; old-name files that have no
  combined-name equivalent stay as-is for manual triage

## Files Expected to Change

- `packages/registry/src/schema.ts` — **modified** — remove `imageUrl`
  from `HeroCardSchema`
- `packages/registry/src/shared.ts` — **modified** — add
  `physicalCards[]` → `sideToImageUrl` lookup for hero `imageUrl`
- `apps/registry-viewer/src/registry/shared.ts` — **modified** — remove
  dead `card.imageUrl` fallback in hero block
- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — stop
  emitting `imageUrl` on hero card objects
- `data/cards/*.json` (40 files) — **modified** — regenerated without
  hero `imageUrl`
- `packages/registry/src/schema.test.ts` (or sibling test file) —
  **modified** — update hero card test fixtures if needed
- `scripts/rename-r2-split-pairs.mjs` — **new** (if option (a) chosen)
  — operator script that emits rclone rename commands

**Must NOT change (explicit freeze):**
- `packages/registry/src/heroImageUrl.ts` — already correct
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — fallback
  degrades safely; cleanup deferred

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - ESM only, Node v22+
> - Human-style code — see `docs/ai/REFERENCE/00.6-code-style.md`
> - No `Math.random()` — all randomness via `ctx.random.*`
> - `HeroCardSchema.imageUrl` must not exist after execution
> - Non-hero schemas must be byte-identical pre- and post-execution
> - All 40 JSONs regenerated; non-hero card data byte-identical
> - `physicalCards[]` data byte-identical in all JSONs
> - `heroImageUrl.ts` byte-identical pre- and post-execution

## Non-Negotiable Constraints

- `HeroCardSchema` must not contain `imageUrl` after execution
- `PhysicalCardSchema.imageUrl` is **retained** — it is the canonical
  hero image source (D-13802)
- Non-hero schemas (`MastermindCardSchema`, `VillainCardSchema`,
  `SchemeSchema`) must be byte-identical pre- and post-execution
- `heroImageUrl.ts` must be byte-identical pre- and post-execution
- `physicalCards[]` arrays in all 40 JSONs must be byte-identical
  pre- and post-execution
- No new fields introduced on `HeroCardSchema` or hero card objects —
  this WP removes a field, it does not add or rename any
- JSON regeneration must produce deterministic ordering and formatting
  (stable key order, identical whitespace style) to minimize git churn
  and preserve auditability
- All existing registry, engine, and viewer tests must pass after
  execution (baselines may shift only in registry if fixture updates
  are needed)

## Decision Points

### D-15101 — `HeroCardSchema.imageUrl` Removal (Recommended: lock at session start)

**Decision:** Remove `imageUrl` from `HeroCardSchema`. The D-13802 /
D-14103 transition window is now closed. `physicalCards[].imageUrl`
(via `heroImageUrl()`) is the sole hero image source.

**Rationale:** WP-141 completed the consumer migration. All engine and
viewer consumers now read hero image URLs from `physicalCards[]`. The
per-side `HeroCardSchema.imageUrl` field is dead data.

**Alternatives rejected:**
- Keep `imageUrl` as deprecated optional field — adds schema noise,
  misleads future consumers, violates the "remove dead code" principle
- Remove `imageUrl` from all schemas — non-hero schemas still use it as
  their sole image source; premature

### D-15102 — R2 Split-Pair Rename Mapping

**Decision:** The 44 unmatched files from the v16 migration are renamed
on R2 to match the `heroImageUrl()` combined-name pattern. Mapping is
derived programmatically from the card JSON data + `heroImageUrl()`.

**Rationale:** The v16 migration (`migrate-renamed-to-v16.mjs`) could
not resolve these files because their old cost-based filenames didn't
match any card JSON entry. The combined-name pattern is now the
canonical filename convention. Leaving 44 dead files on R2 creates
confusion during future audits.

**Alternatives rejected:**
- Delete unmatched files — some may be valid images with recoverable
  mappings; rename-first is safer
- Manual rename — error-prone at 44 files; programmatic mapping from
  card data is reproducible

## Acceptance Criteria

- [ ] `packages/registry/src/schema.ts` — `HeroCardSchema` does not
      contain `imageUrl`
- [ ] `packages/registry/src/shared.ts` — hero `flattenSet()` block
      reads `imageUrl` from `physicalCards[]` via `sideToImageUrl` map
- [ ] `apps/registry-viewer/src/registry/shared.ts` — hero block has
      no `card.imageUrl` reference
- [ ] `scripts/convert-cards/convert-cards-v15.mjs` — hero card object
      construction does not include `imageUrl`
- [ ] All 40 `data/cards/*.json` — zero hero card entries contain
      `imageUrl`; all hero entries still contain `physicalCards[]`
- [ ] Non-hero card entries (`villains`, `masterminds`, `schemes`,
      `henchmen`, `bystanders`, `wounds`) in all 40 JSONs retain
      `imageUrl` unchanged
- [ ] `physicalCards[]` arrays in all JSONs are byte-identical
      pre- and post-execution
- [ ] `heroImageUrl.ts` is byte-identical pre- and post-execution
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm --filter "@legendary-arena/registry-viewer..." build` exits 0
- [ ] `pnpm --filter "@legendary-arena/registry-viewer..." test` exits 0
- [ ] All 40 JSON files share identical schema shape for hero cards —
      no mixed presence of `imageUrl` (partial convert run guard)
- [ ] No new fields introduced on `HeroCardSchema` or hero card objects
- [ ] Viewer `sideToImageUrl` mapping logic matches registry
      implementation (manual review required before removing fallback)
- [ ] R2 rename mapping produced (script or documented commands)

## Verification Steps

```pwsh
# 1. Schema verification — HeroCardSchema has no imageUrl
Select-String -Path packages/registry/src/schema.ts -Pattern 'imageUrl' |
  Where-Object { $_ -match 'HeroCardSchema' }
# Expected: zero matches (non-hero schemas still have imageUrl)

# 2. JSON verification — no hero card has imageUrl
node -e "
  const { readdirSync, readFileSync } = require('node:fs');
  const files = readdirSync('data/cards').filter(f => f.endsWith('.json'));
  let violations = 0;
  for (const f of files) {
    const set = JSON.parse(readFileSync('data/cards/' + f, 'utf8'));
    for (const hero of (set.heroes || [])) {
      for (const card of (hero.cards || [])) {
        if ('imageUrl' in card) { violations++; console.log(f, hero.name, card.slug); }
      }
    }
  }
  console.log('Hero imageUrl violations:', violations);
"
# Expected: Hero imageUrl violations: 0

# 3. JSON verification — all heroes still have physicalCards
node -e "
  const { readdirSync, readFileSync } = require('node:fs');
  const files = readdirSync('data/cards').filter(f => f.endsWith('.json'));
  let missing = 0;
  for (const f of files) {
    const set = JSON.parse(readFileSync('data/cards/' + f, 'utf8'));
    for (const hero of (set.heroes || [])) {
      if (!Array.isArray(hero.physicalCards) || hero.physicalCards.length === 0) {
        missing++; console.log(f, hero.name);
      }
    }
  }
  console.log('Heroes missing physicalCards:', missing);
"
# Expected: Heroes missing physicalCards: 0

# 4. Non-hero imageUrl preserved (spot-check)
node -e "
  const set = JSON.parse(require('node:fs').readFileSync('data/cards/core.json', 'utf8'));
  const villain = set.villains[0].cards[0];
  const mastermind = set.masterminds[0];
  console.log('Villain imageUrl present:', 'imageUrl' in villain);
  console.log('Mastermind imageUrl present:', 'imageUrl' in mastermind);
"
# Expected: both true

# 5. heroImageUrl.ts unchanged
git diff HEAD -- packages/registry/src/heroImageUrl.ts
# Expected: empty (no changes)

# 6. Build all
pnpm -r build
# Expected: exits 0

# 7. Test all
pnpm test
# Expected: all pass

# 8. Registry flattenSet check — no card.imageUrl in hero block
Select-String -Path packages/registry/src/shared.ts -Pattern 'card\.imageUrl'
# Expected: zero matches (hero block now uses sideToImageUrl)

# 9. Viewer shared.ts check — no card.imageUrl in hero block
# (non-hero blocks still reference card.imageUrl / scheme.imageUrl — that's correct)

# 10. Mixed-schema consistency check (no partial convert run)
node -e "
  const { readdirSync, readFileSync } = require('node:fs');
  let withField = 0, withoutField = 0;
  for (const f of readdirSync('data/cards').filter(x => x.endsWith('.json'))) {
    const set = JSON.parse(readFileSync('data/cards/' + f, 'utf8'));
    for (const hero of (set.heroes || [])) {
      for (const card of (hero.cards || [])) {
        if ('imageUrl' in card) withField++;
        else withoutField++;
      }
    }
  }
  console.log({ withField, withoutField });
"
# Expected: withField: 0 (all hero cards uniformly lack imageUrl)

# 11. Viewer sideToImageUrl parity check
# Manual: confirm registry shared.ts and viewer shared.ts use the
# same sideToImageUrl construction logic (iterate physicalCards[],
# iterate sides[], map side → physicalCard.imageUrl, no normalization)
```

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria pass
- [ ] All verification steps pass
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/DECISIONS.md` updated with D-15101 and D-15102
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has this packet checked off
  with Done date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-162 status → Done
- [ ] No files outside the "Files Expected to Change" list were modified
  (governance ledger updates excepted)
- [ ] R2 rename mapping reviewed and ready for operator execution

## Failure Conditions

- Any hero card entry in any JSON still contains `imageUrl` after
  regeneration
- Any non-hero card entry lost `imageUrl` after regeneration
- Any `physicalCards[]` array changed after regeneration
- `heroImageUrl.ts` modified
- Engine test baseline regressed
- Viewer test baseline regressed (beyond fixture-driven adjustments)
- Mixed hero card schema state across JSONs (some with `imageUrl`,
  some without) — indicates partial convert run
- Registry and viewer `sideToImageUrl` construction logic diverged
