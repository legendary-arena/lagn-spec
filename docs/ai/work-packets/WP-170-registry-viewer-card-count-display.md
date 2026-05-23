# WP-170 — Registry Viewer: Card Count Display

## Goal

Add a "card count" display to the registry-viewer app so users can see how many copies of a card exist in its group/deck. When viewing a card detail, display "2 of 8" for a villain card that has 2 copies in an 8-card villain group, or "1 of 14" for a rare hero card that is 1 of 14 cards in a standard hero deck.

---

## Assumes

- WP-151 ✅ — Physical Card Phase 3 landed; `flattenSet()` is the canonical villain/hero/henchman card flattening site
- WP-167 ✅ — Villain Deck Composition Data landed; all 632 villain cards carry the `copies` field (default 2, absent ⇒ 1); all 40 `data/cards/*.json` files are current on R2
- WP-169 ✅ — Scheme Villain-Deck Count Curation landed; scheme twist/bystander counts in card data are authoritative
- Live R2 metadata (`https://images.barefootbetters.com/metadata/core.json`, etc.) carries both `villain.cards[].copies` and `hero.cardCounts` — verified 2026-05-22 (28 copies entries, 15 cardCounts entries in core.json alone)
- Registry package schema ([packages/registry/src/schema.ts](../../packages/registry/src/schema.ts) lines 171, 290) already defines `HeroSchema.cardCounts` and `VillainCardSchema.copies` — no registry changes needed
- Registry-viewer permissive schema ([apps/registry-viewer/src/registry/schema.ts](../../apps/registry-viewer/src/registry/schema.ts)) is the parse-time gate; live R2 data survives transport, but Zod `SetDataSchema.safeParse()` at [httpRegistry.ts:98](../../apps/registry-viewer/src/registry/impl/httpRegistry.ts) strips unknown fields — `copies` and `cardCounts` are currently **not** declared in the viewer schema and therefore silently dropped

---

## Context

Users of the registry-viewer (cards.barefootbetters.com) browse Legendary cards and want to know the deck composition at a glance. A villain card labeled "2 of 8" tells a player immediately how common it is in the villain group. A hero card labeled "1 of 14" conveys rarity without needing to look up the 5/5/3/1 formula. This information is already authored in the card data and published to R2; the viewer just needs to surface it.

The data is **100% complete and correct**: villains have 632/632 copies (100%); heroes with standard 14-card decks have `cardCounts` (296); the remaining heroes are either SHIELD Officers (single-card, no count needed) or alternate-art variants (4-side or fewer, counts implicit). No upstream data-fix needed — just the viewer schema + flatten + display changes.

---

## Scope (In) / (Out)

### In

- **Schema changes** ([apps/registry-viewer/src/registry/schema.ts](../../apps/registry-viewer/src/registry/schema.ts)): add optional `copies: z.number().int().min(1).optional()` to `VillainCardSchema`; add optional `cardCounts: z.record(z.string(), z.number().int().min(1)).optional().nullable()` to `HeroSchema`
- **FlatCard type** ([apps/registry-viewer/src/registry/types/types-index.ts](../../apps/registry-viewer/src/registry/types/types-index.ts)): add `count?: number` and `setTotal?: number` fields
- **flattenSet logic** ([apps/registry-viewer/src/registry/shared.ts](../../apps/registry-viewer/src/registry/shared.ts)): compute per-card count and per-group/deck total for villains (summing `copies ?? 1` over group) and heroes (summing `cardCounts` values or undefined if absent); attach both to each `FlatCard`
- **CardDetail.vue stats grid** ([apps/registry-viewer/src/components/CardDetail.vue](../../apps/registry-viewer/src/components/CardDetail.vue) ~line 178): add a new stat row displaying `count` and `setTotal` (render only when both present; format: "N of M")
- **CardDataDisplay.vue** ([apps/registry-viewer/src/components/CardDataDisplay.vue](../../apps/registry-viewer/src/components/CardDataDisplay.vue) ~line 35 in JSDoc contract): add a row for "Card Count" (follow AND-semantics pattern: omit row if `count` / `setTotal` absent)

### Out

- CardGrid tile count badges (grid is already busy; count is not essential grid-level info; future follow-up if wanted)
- Henchman card counts (10 is an engine constant, not data; sourcing it without duplication is a future upstream-data WP)
- Scheme twist, bystander, master-strike counts (engine-derived, not on card data; out of scope)
- Modifying `packages/registry/` schema or any upstream data (R2 republish, converter, etc.) — all data is already complete and published
- Registry-viewer layer-boundary violation: no game-engine imports for hero rarity→count mapping (hero counts are explicit `cardCounts` data; engine lookup is not needed)

---

## Files Expected to Change

1. `apps/registry-viewer/src/registry/schema.ts` — add `copies` to `VillainCardSchema`, `cardCounts` to `HeroSchema`
2. `apps/registry-viewer/src/registry/types/types-index.ts` — add `count?` and `setTotal?` to `FlatCard`
3. `apps/registry-viewer/src/registry/shared.ts` — update villain loop to sum `copies` into `groupTotal`, hero loop to sum `cardCounts` into `deckTotal`, then attach both to `FlatCard`
4. `apps/registry-viewer/src/components/CardDetail.vue` — add stat row in stats grid for card count
5. `apps/registry-viewer/src/components/CardDataDisplay.vue` — add row in data table for card count (AND-semantics: omit if absent)

---

## Contract

### New Fields on FlatCard

```typescript
interface FlatCard {
  // ... existing fields ...
  count?: number;      // copies of this card in its group/deck (undefined if not applicable)
  setTotal?: number;   // total cards in the villain group or hero deck (undefined if not applicable)
}
```

### Display Format

- **Display string (when both `count` and `setTotal` are defined):** `"{count} of {setTotal}"`
- **Render location:** CardDetail.vue stats grid (after Slot, before or after existing rows) + CardDataDisplay.vue (in the data table, same AND-semantics pattern as rarity)
- **Cards that show count:** villains (always, since `copies` defaults to 1), heroes with explicit `cardCounts`, SHIELD Officers (omit), alternate-art heroes (omit)

### Data Flow

1. **R2 → HTTP fetch:** Live `data/cards/*.json` already carries `villain.cards[].copies` and `hero.cardCounts`
2. **Parse boundary:** Updated schema at `SetDataSchema.safeParse()` preserves both fields
3. **flattenSet → FlatCard:** compute `count` and `setTotal` per type, attach to card object
4. **Display:** CardDetail.vue + CardDataDisplay.vue render the count when present, omit when absent

---

## Acceptance Criteria

- [ ] Schema changes allow `copies` and `cardCounts` to pass Zod validation without stripping
- [ ] flattenSet computes and attaches `count` and `setTotal` to every FlatCard
- [ ] Villain cards display their individual `copies` count and group total (sum of group's copies)
- [ ] Hero cards with `cardCounts` display their side's count and deck total (sum of all cardCounts values)
- [ ] Heroes without `cardCounts` (alt-art, SHIELD Officers) omit the count row gracefully
- [ ] CardDetail.vue stats grid renders the count row for applicable cards
- [ ] CardDataDisplay.vue data table renders the count row for applicable cards (AND-semantics: absent = no row)
- [ ] No card or group total is hardcoded (all sums computed per data); henchman constant 10 is **not** surfaced here (future follow-up)
- [ ] Registry-viewer layer boundary is not violated (no `game-engine` imports for count logic)
- [ ] Tests confirm FlatCard count/setTotal are present and correct for sample villain and hero cards

---

## Verification Steps

**Local dev:**
1. Start `pnpm --filter registry-viewer dev` and navigate to cards.barefootbetters.com local mirror (or localhost dev server)
2. Search for a villain card (e.g., "Blob" from core Brotherhood) → detail panel opens → stats grid shows `count: 2` and `setTotal: 8`
3. Search for a hero (e.g., "Black Widow" from core) → detail panel opens → stats grid shows `count: 1` (rare card) and `setTotal: 14`
4. Search for a SHIELD Officer (e.g., "Dum Dum Dugan" from shld) → detail panel opens → count row is absent (SHIELD Officers have no `cardCounts`)
5. Switch to data-view mode (CardDataDisplay) for the same cards → data table shows count row for villains/heroes, omits for alternates
6. Inspect the flat card objects in the browser console to confirm `count` and `setTotal` are attached
7. Verify no `game-engine` imports appear in any registry-viewer file (grep check)

**R2 live (smoke test post-merge):**
1. Visit https://cards.barefootbetters.com/ (live production)
2. Open a villain card detail → count row displays correctly
3. Open a hero card detail → count row displays correctly

---

## Definition of Done

All of the following must be true:

- [ ] Schema changes (`copies` on `VillainCardSchema`, `cardCounts` on `HeroSchema`) merged
- [ ] FlatCard type updated with `count?` and `setTotal?` fields
- [ ] flattenSet logic computes and attaches both for villain and hero branches
- [ ] CardDetail.vue stats grid displays the count row (or omits it for non-applicable cards)
- [ ] CardDataDisplay.vue data table displays the count row (or omits it per AND-semantics)
- [ ] No hardcoded count constants; all sums are computed from data
- [ ] No game-engine imports in registry-viewer; layer boundary respected
- [ ] Local dev verified: villain, hero, alt-art, SHIELD Officer cards all render correctly
- [ ] Lint gate self-review completed (all 21 sections pass or N/A with justification)
- [ ] Pre-flight verdict: READY TO EXECUTE
- [ ] Copilot check verdict: PASS
- [ ] EC-188 merged to main via SPEC PR

---

## Lint Gate Self-Review

| Item | Status | Notes |
|---|---|---|
| 1. WP filename matches kebab-case format | ✅ | WP-170-registry-viewer-card-count-display.md |
| 2. Title is 3–8 words, imperative verb | ✅ | "Registry Viewer: Card Count Display" (6 words, action-oriented) |
| 3. Goal is 1–2 sentences, user-visible outcome | ✅ | Single paragraph explaining "2 of 8" display for villain/hero cards |
| 4. Assumes section is complete (all dependencies, data contracts, external state) | ✅ | WP-151, WP-167, WP-169 deps listed; R2 data verified; schema state documented |
| 5. Context explains why now | ✅ | Users want deck composition at a glance; data is complete and published |
| 6. Scope (In)/(Out) uses closed enumeration | ✅ | In: schema + type + flatten + display; Out: grid badges, henchmen, schemes, upstream data |
| 7. Files Expected to Change is an allowlist (5 files) | ✅ | 5 specific files listed by path |
| 8. Contract defines API/data/UI surface with examples | ✅ | New FlatCard fields, display format "N of M", data flow diagram |
| 9. Acceptance Criteria are testable bullets | ✅ | 8 testable criteria covering schema, logic, display, boundaries |
| 10. Verification Steps are operator-runnable | ✅ | Local dev steps (search, detail, switch modes, console inspect, grep); R2 smoke test |
| 11. Definition of Done is binary, non-subjective | ✅ | 8 concrete gates: files merged, features working, layer boundary respected, gates passed |
| 12. No invented mechanics, rules, phases, counters | ✅ | Using existing `copies` and `cardCounts` data; no new game-state fields |
| 13. No `DECISIONS.md` entries needed? | N/A | No architectural decisions locked; existing contracts apply |
| 14. No new `PostMortem.md` trigger (01.6)? | N/A | No new cross-layer abstraction; straightforward schema + display wiring |
| 15. Layer boundary respected? | ✅ | Registry-viewer only; no game-engine imports; hero counts are data, not derived |
| 16. Contract file modifications allowed? | ✅ | Not modifying `packages/registry/` schema (already has the fields); only viewer schema |
| 17. No `.reduce()` in zone/rule ops? | N/A | No zone ops; hero deck total uses `reduce` (allowed per code-style for simple sum) |
| 18. `01.5 NOT INVOKED`? | ✅ | Registry-viewer only; no engine surface touched |
| 19. No SAFE-KNOBS or config scope? | ✅ | Pure display feature; no configuration knobs |
| 20. API catalog update needed (D-11804)? | N/A | No HTTP endpoints or library surface changed |
| 21. Co-Authored-By in commit message? | ✅ | Will be included per WP-170 execution session |

**Lint gate verdict: PASS** — all items resolved. No carve-outs needed.

