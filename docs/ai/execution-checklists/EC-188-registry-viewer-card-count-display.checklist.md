# EC-188 — Registry Viewer: Card Count Display

> **Execution Checklist for WP-170**  
> Hard limit: 60 non-empty lines (currently ~45 lines)

---

## Before Starting

- [ ] Verify canonical clone is on `main`, clean, synced: `git status` + `git pull --ff-only origin main`
- [ ] Confirm WP-151 ✅, WP-167 ✅, WP-169 ✅ are merged and visible on `origin/main`
- [ ] Verify live R2 carries both `copies` (villains) and `cardCounts` (heroes): `curl https://images.barefootbetters.com/metadata/core.json | grep -c '"copies"'` (expect ≥1) and `grep -c 'cardCounts'` (expect ≥1)
- [ ] Pre-flight gate READY, copilot PASS, lint PASS on record

---

## Locked Values

| Key | Value | Source |
|---|---|---|
| `villain_group_total_sum` | `sum(card.copies ?? 1)` for all cards in group | WP-167 data; no hardcoded `8` |
| `hero_count_lookup` | `count = cardCounts[card.rarity]` (rarity as key, no fallback) | hero.cardCounts JSON; rarity-based |
| `hero_deck_total_sum` | `sum(Object.values(hero.cardCounts))` or undefined | computed once per hero; reused for all cards |
| `flatcard_count_field` | `count?: number` (per-card copies or rarity lookup result) | new FlatCard type |
| `flatcard_setTotal_field` | `setTotal?: number` (precomputed group/deck total or undefined) | new FlatCard type |
| `display_format` | `"{count} of {setTotal}"` | user-visible; omit row if count undefined |
| `AND_semantics_rule` | Omit row entirely if count absent; never render partial values | CardDetail + CardDataDisplay; binary decision |
| `flatten_structure` | Totals computed once **before** card loop; per-card assigns precomputed values | flattenSet() pattern; no duplication |

---

## Guardrails

1. **No hardcoded group/deck totals** — all sums computed per group/hero from data; `8` for villains and `14` for heroes are heuristics, not constants
2. **Hero count mapping is strictly rarity-based** — `count = cardCounts[card.rarity]` (rarity as key); no display-name fallback, no heuristics; if rarity key not found → count = undefined
3. **Villain copies fallback** — `card.copies ?? 1` (WP-167 default) applied at computation time only; never assume `2`; source data immutable
4. **Totals precomputed, not per-card** — villainGroupTotal and heroDeckTotal computed once **before** the card loop; per-card iteration only assigns precomputed values; no repeated summation
5. **SHIELD Officers and alt-art omit counts** — hero.cardCounts absent → count undefined, setTotal undefined; AND-semantics omits entire row (never partial values)
6. **Rendering is binary: all-or-nothing** — if count is undefined, row MUST NOT render (even if setTotal computed); partial values are contract violations
7. **UI row ordering is deterministic** — CardDetail: "Card Count" after "Type", before "Rarity"; CardDataDisplay: same ordering as rarity; never "before or after existing rows"
8. **No game-engine imports in registry-viewer** — hero counts are data (cardCounts), not derived from engine rarity logic; grep gates enforce this

---

## Required Comments

- [ ] In `flattenSet()` villain loop: add `// why:` comment explaining the group total is summed before the per-card push
- [ ] In `flattenSet()` hero loop: add `// why:` comment explaining cardCounts summing and fallback-to-undefined behavior
- [ ] In CardDetail.vue stat row: add HTML comment or JSDoc explaining the display format and AND-semantics (present only when both count and setTotal exist)

---

## Files to Produce

| File | Type | Changes |
|---|---|---|
| `apps/registry-viewer/src/registry/schema.ts` | **Modify** | Add `copies` to `VillainCardSchema`; add `cardCounts` to `HeroSchema` |
| `apps/registry-viewer/src/registry/types/types-index.ts` | **Modify** | Add `count?: number` and `setTotal?: number` to `FlatCard` interface |
| `apps/registry-viewer/src/registry/shared.ts` | **Modify** | Update `flattenSet()` villain loop (sum group copies into `groupTotal`); hero loop (sum cardCounts into `deckTotal`); attach both to FlatCard |
| `apps/registry-viewer/src/components/CardDetail.vue` | **Modify** | Add stat row in stats grid for card count (render "N of M" or omit) |
| `apps/registry-viewer/src/components/CardDataDisplay.vue` | **Modify** | Add row in data table for card count (AND-semantics: no row if absent) |

---

## After Completing

- [ ] Run `pnpm --filter registry-viewer build` — must exit 0
- [ ] Run `pnpm test` (or registry-viewer tests if isolated) — must pass
- [ ] Manual verification: local dev, search villain (e.g., "Blob" core) → detail → count row displays "2 of 8"
- [ ] Manual verification: local dev, search hero (e.g., "Black Widow" core) → detail → count row displays "1 of 14"
- [ ] Manual verification: local dev, search alt-art hero (e.g., "Dum Dum Dugan" shld) → detail → count row absent
- [ ] Grep gate: `grep -r "game-engine\|packages/game-engine" apps/registry-viewer/` must return 0 matches (layer boundary intact)
- [ ] Mark WP-170 as `DONE` in WORK_INDEX.md + update EC_INDEX.md

---

## Common Failure Smells

- **Parse strips count data:** R2 JSON carries `copies` and `cardCounts`, but Zod drops them → verify schema changes in place before flattenSet is called
- **Hero count undefined for all heroes:** hero.cardCounts present in R2 but lost at parse → check `HeroSchema.cardCounts` optional field definition
- **Hero count lookup uses wrong key:** cardCounts keyed by something other than rarity (e.g., display name) → verify mapping rule: `count = cardCounts[card.rarity]` only
- **Hero count lookup has fallback heuristic:** code tries name-matching or default values when rarity lookup fails → remove fallbacks; must return undefined
- **Totals computed inside card loop:** villainGroupTotal or heroDeckTotal summed per-card instead of once per group/hero → move sum before loop
- **Partial values render:** count row appears when count is undefined (even if setTotal computed) → verify AND-semantics: row omitted if count absent
- **Count row ordering inconsistent:** row placed "before or after" existing rows instead of deterministic position (after Type, before Rarity) → lock ordering
- **Hardcoded "8" or "14" appear:** grep codebase for literal numbers; all sums must come from data
- **Count row renders for SHIELD Officers:** alt-art heroes and single-card heroes don't have cardCounts → ensure FlatCard.count undefined and AND-semantics omits row
- **Layer boundary violated:** `game-engine` import in registry-viewer → hero counts are data, not engine-derived; grep gate catches this
- **Villain source data mutated:** copies modified to apply default instead of using `copies ?? 1` in computation → source data must remain immutable

