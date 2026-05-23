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
| `hero_deck_total_sum` | `sum(Object.values(hero.cardCounts))` or undefined | hero.cardCounts JSON |
| `flatcard_count_field` | `count?: number` (copies or undefined) | new FlatCard type |
| `flatcard_setTotal_field` | `setTotal?: number` (group/deck total or undefined) | new FlatCard type |
| `display_format` | `"{count} of {setTotal}"` | user-visible; omit if either absent |
| `AND_semantics_rule` | Omit row if count/setTotal absent; never show default/em-dash | CardDataDisplay.vue pattern |

---

## Guardrails

1. **No hardcoded group/deck totals** — all sums computed per group/hero from data; `8` for villains and `14` for heroes are heuristics, not constants
2. **Hero count lookup by display name** — `cardCounts[card.name]` where `card.name = HeroCardSchema.name`; must match exactly (name is optional in schema; absent ⇒ `undefined` count)
3. **Villain copies fallback** — `card.copies ?? 1` (WP-167 default); never assume `2`
4. **SHIELD Officers and alt-art omit counts** — single-side heroes and 4-side variants don't have `cardCounts`; FlatCard.count will be undefined; AND-semantics omits the row
5. **No game-engine imports in registry-viewer** — hero counts are data (cardCounts), not derived from engine rarity logic; grep gates enforce this

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

- **Parse strips count data:** R2 JSON carries `copies` and `cardCounts`, but Zod drops them → verify schema changes are in place before flattenSet is called
- **Hero count undefined for all heroes:** hero.cardCounts is present in R2 but lost at parse → check `HeroSchema.cardCounts` optional field definition
- **Hardcoded "8" or "14" appear:** grep the codebase for literal numbers; all sums must come from data
- **Count row renders for SHIELD Officers:** alt-art heroes and single-card heroes don't have cardCounts → ensure FlatCard.count is undefined for these and AND-semantics omits the row
- **Layer boundary violated:** `game-engine` import appears in registry-viewer → hero counts are data, not engine-derived; grep gate catches this

