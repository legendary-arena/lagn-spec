# EC-188 — Registry Viewer: Card Count Display
> **Execution Checklist for WP-170**  
> Hard limit: 60 non-empty lines (currently ~45 lines)

## Before Starting
- [ ] Verify canonical clone is on `main`, clean, synced: `git status` + `git pull --ff-only origin main`
- [ ] Confirm WP-151 ✅, WP-167 ✅, WP-169 ✅ are merged and visible on `origin/main`
- [ ] Verify live R2 carries both `copies`/`cardCounts`: `curl https://images.barefootbetters.com/metadata/core.json | grep -c '"copies"'` (expect ≥1)
- [ ] Pre-flight gate READY, copilot PASS, lint PASS on record

## Locked Values
| Key | Value |
|---|---|
| `villain_group_total` | `sum(card.copies ?? 1)` per group; no hardcoded `8` |
| `hero_count_lookup` | `cardCounts[card.name]`; name-key only; no fallback (amended 2026-05-22 — live R2 keyed by card display name, not rarity; see WP §Amendments Amendment 1) |
| `hero_deck_total` | `sum(cardCounts)` per hero or undefined |
| `FlatCard.count` | copies (villain) or rarity lookup (hero) |
| `FlatCard.setTotal` | precomputed group/deck total (once per group, reused) |
| `display_format` | `"{count} of {setTotal}"`; omit row if count undefined |
| `AND_semantics` | Row omitted if count absent; never partial |

## Guardrails
1. **No hardcoded totals** — sums from data; `8`/`14` are heuristics
2. **Hero: name-key** — `cardCounts[card.name]` only; no fallback (amended 2026-05-22)
3. **Villain: `copies ?? 1`** — computation-time default; source immutable
4. **Totals precomputed once** — before card loop; per-card reuses
5. **AND-semantics** — count undefined → row omit; never partial
6. **No game-engine imports** — hero counts are data-driven

## Required Comments
- [ ] `flattenSet()` villain: `// why:` on group total before card loop
- [ ] `flattenSet()` hero: `// why:` on cardCounts summing and fallback
- [ ] CardDetail.vue: comment on AND-semantics (count AND setTotal required)

## Files to Produce
| File | Changes |
|---|---|
| `schema.ts` | Add `copies` (villain), `cardCounts` (hero) |
| `types-index.ts` | Add `count?`, `setTotal?` to FlatCard |
| `shared.ts` | Precompute totals; assign to FlatCard |
| `CardDetail.vue` | Add count stat row (AND-semantics) |
| `CardDataDisplay.vue` | Add count row (AND-semantics) |

## After Completing
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm test` passes
- [ ] Local dev: Blob "2 of 8", Black Widow "1 of 14", Dum Dum Dugan absent
- [ ] `grep -r "game-engine" apps/registry-viewer/` returns 0
- [ ] Mark WP-170 as `DONE` in WORK_INDEX.md

## Common Failure Smells
- **Parse strips fields:** R2 carries `copies`/`cardCounts`, Zod drops them → verify schema before flattenSet
- **Wrong key:** cardCounts is keyed by card display name → use `cardCounts[card.name]` (rarity-key lookup yields undefined for every hero)
- **Totals per-card:** summed inside card loop instead of once → move before loop
- **Partial renders:** count row appears when count undefined → verify AND-semantics omits
- **Hardcoded literals:** `8` or `14` in code → grep for values; all from data

