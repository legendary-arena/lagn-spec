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
- **Rendering rule (STRICT):** Omit the count row entirely if `count` is undefined, even if `setTotal` is computed. Partial values MUST NOT render.
- **Cards that show count:** villains (always, since `copies` defaults to 1), heroes with explicit `cardCounts`, SHIELD Officers (omit), alternate-art heroes (omit)

### Hero Count Mapping Rule (MUST)

For hero cards:

- If `hero.cardCounts` exists AND `card.rarity` exists:
  - `count = cardCounts[card.rarity]` (lookup rarity as key)
  - Example: rarity = "rare" → count = cardCounts["rare"]
  - If rarity key not found in cardCounts: count = undefined
- If `card.rarity` missing OR `hero.cardCounts` absent:
  - count = undefined
- No fallback heuristics (name matching, default values, or inferencing) allowed

### setTotal Computation Rules (MUST)

- **Villains:**
  - setTotal = sum of `copies ?? 1` across ALL cards in the group
  - Computed once per group; reused for every card in that group
  - If group is empty: setTotal = 0
  
- **Heroes:**
  - If `hero.cardCounts` exists AND has ≥1 entries:
    - setTotal = sum of all values in cardCounts (regardless of whether this card has a count)
    - Computed once per hero; reused for every card
  - Else:
    - setTotal = undefined
    
- **No partial totals:** If count is undefined, setTotal MUST NOT render (even if computed)

### flattenSet Implementation Constraint (MUST)

- Totals MUST be computed once per group/deck **before** the per-card loop:
  - villainGroupTotal = computed once for each villain group
  - heroDeckTotal = computed once per hero
  
- The per-card loop MUST only **assign** precomputed values:
  - `card.count = ...`
  - `card.setTotal = precomputedTotal`
  
- No repeated summation inside the per-card iteration (performance + auditability)

### Villain Default Rule (MUST)

- If `copies` is undefined or missing:
  - Treat as 1 at computation time only
- Viewer MUST NOT mutate source data; treat as read-only

### Data Flow

1. **R2 → HTTP fetch:** Live `data/cards/*.json` already carries `villain.cards[].copies` and `hero.cardCounts`
2. **Parse boundary:** Updated schema at `SetDataSchema.safeParse()` preserves both fields
3. **flattenSet → FlatCard:** 
   - Compute `villainGroupTotal` once per group; compute `heroDeckTotal` once per hero
   - For each card: assign `count` via rarity lookup (heroes) or direct value (villains), assign `setTotal` from precomputed total
4. **Display:** CardDetail.vue + CardDataDisplay.vue render count + setTotal only when BOTH are defined; omit row if count is undefined

---

## Acceptance Criteria

- [ ] Schema changes allow `copies` and `cardCounts` to pass Zod validation without stripping
- [ ] flattenSet computes totals once per group/deck (before card loop); per-card assignment reuses precomputed values
- [ ] Villain cards: count = individual `copies ?? 1`, setTotal = sum(copies ?? 1) per group
- [ ] Hero cards: count = `cardCounts[card.rarity]` (rarity-based lookup), setTotal = sum(all cardCounts) or undefined
- [ ] Heroes without `cardCounts` (alt-art, SHIELD Officers) have count = undefined, setTotal = undefined
- [ ] Rendering is strict AND-semantics: count row OMIT if count is undefined (even if setTotal computed)
- [ ] CardDetail.vue stats grid: "Card Count" row placed after "Type" and before "Rarity" (deterministic ordering)
- [ ] CardDataDisplay.vue data table: "Card Count" row follows rarity row ordering, omit if count undefined
- [ ] No hardcoded group/deck totals; all sums computed per data; henchman constant 10 **not** surfaced (future follow-up)
- [ ] Registry-viewer layer boundary respected: no `game-engine` imports for count logic
- [ ] All required test cases pass (villain, hero, edge cases defined below)

---

## Verification Steps

### Required Test Cases (Unit/Integration)

1. **Villain group (Brotherhood core):**
   - Expect Blob card: `count = 2`, `setTotal = 8`
   - Verify total computed once, reused across all group cards
   
2. **Hero with full cardCounts (Black Widow core, rare):**
   - Expect count = `cardCounts["rare"]` = 1
   - Expect setTotal = sum of all cardCounts values = 14
   - Verify rarity key lookup is deterministic

3. **Hero missing cardCounts (SHIELD Officer e.g., Dum Dum Dugan):**
   - Expect count = undefined
   - Expect setTotal = undefined
   - Verify row omitted entirely in both CardDetail and CardDataDisplay

4. **Hero edge case (cardCounts present, rarity not in keys):**
   - Expect count = undefined (rarity key not found)
   - Expect setTotal computed but NOT rendered (row omitted per AND-semantics)
   - Verify partial value never appears in UI

5. **Schema preservation:**
   - Verify `copies` field survives Zod parse (VillainCardSchema)
   - Verify `cardCounts` field survives Zod parse (HeroSchema)
   - Verify unknown fields not declared in schema are stripped (safeParse behavior unchanged)

### Local Dev Smoke Test

1. Start `pnpm --filter registry-viewer dev` 
2. **Villain path:** Search "Blob" (core Brotherhood) → detail → count row shows "2 of 8"
3. **Hero path:** Search "Black Widow" (core rare) → detail → count row shows "1 of 14"
4. **SHIELD path:** Search "Dum Dum Dugan" (shld) → detail → count row absent
5. **Data view:** Switch to CardDataDisplay for same cards → count row present/absent matches CardDetail
6. **Console audit:** Inspect FlatCard objects → verify count/setTotal attached correctly
7. **Layer check:** `grep -r "game-engine\|packages/game-engine" apps/registry-viewer/` must return 0 hits

### R2 Live Smoke Test (Post-Merge)

1. Visit https://cards.barefootbetters.com/ (production)
2. Villain card detail: count row displays "N of M" format
3. Hero card detail: count row displays "N of M" format for standard decks, absent for SHIELD/alt-art

---

## Definition of Done

All of the following must be true:

**Schema & Types:**
- [ ] `VillainCardSchema` has optional `copies: z.number().int().min(1).optional()`
- [ ] `HeroSchema` has optional `cardCounts: z.record(z.string(), z.number().int().min(1)).optional().nullable()`
- [ ] `FlatCard` interface has `count?: number` and `setTotal?: number`

**flattenSet Logic:**
- [ ] Villain branch: compute villainGroupTotal once, assign to all cards in group
- [ ] Hero branch: compute heroDeckTotal once per hero, use rarity lookup for per-card count
- [ ] Villain default rule enforced: `copies ?? 1` at computation time (source data immutable)
- [ ] Hero rarity-key lookup: no fallback heuristics, undefined if rarity not found in cardCounts
- [ ] Totals computed before card loop; per-card iteration only assigns precomputed values

**Component Display:**
- [ ] CardDetail.vue: "Card Count" row placed after "Type", before "Rarity" (deterministic ordering)
- [ ] CardDataDisplay.vue: count row follows rarity row ordering; omitted if count undefined
- [ ] AND-semantics enforced: row omitted entirely if count is undefined (no partial values)

**Testing:**
- [ ] Unit tests for villain total computation (Brotherhood example)
- [ ] Unit tests for hero rarity lookup (Black Widow example)
- [ ] Unit tests for SHIELD/alt-art omission (count undefined)
- [ ] Unit tests for edge case (cardCounts present, rarity key missing)
- [ ] Integration tests: FlatCard objects verified in test harness
- [ ] Schema preservation tests: copies and cardCounts survive parse

**Guardrails:**
- [ ] No hardcoded group/deck totals; all sums computed per data
- [ ] No game-engine imports anywhere in registry-viewer
- [ ] Grep gate: `grep -r "game-engine\|packages/game-engine" apps/registry-viewer/` returns 0
- [ ] Render layer boundary respected (hero counts are data, not engine-derived)

**Smoke Tests:**
- [ ] Local dev villain path: "2 of 8" for Blob (core Brotherhood)
- [ ] Local dev hero path: "1 of 14" for Black Widow (core rare)
- [ ] Local dev SHIELD path: count row absent for Dum Dum Dugan (shld)
- [ ] R2 live verification: villain and hero counts display correctly
- [ ] Layer isolation verified: no `game-engine` imports introduced

**Governance:**
- [ ] All required comments added: `// why:` on group/deck sum logic and display format
- [ ] Lint gate sections 1–21 all pass or justified
- [ ] EC-188 checklist completed and attached
- [ ] SPEC PR merged to main with full commit message

---

## Tightening Addendum: Execution Guarantees

This section locks down the execution contract to eliminate hidden risks:

| Guarantee | Enforcement |
|---|---|
| Hero count mapping | Strictly rarity-based: `count = cardCounts[card.rarity]`; no fallback matching |
| Total computation | Computed once per group/deck **before** card loop; per-card iteration reuses precomputed values |
| UI row ordering | "Card Count" placed deterministically: after "Type", before "Rarity" in CardDetail.vue and after rarity in CardDataDisplay.vue |
| Rendering condition | **BOTH** count AND setTotal must exist to render row; partial values MUST NOT appear |
| Villain default | `copies ?? 1` applied at computation time only; source data remains immutable |
| Schema preservation | Zod parse boundary unchanged; unknown fields stripped as before; only declared fields preserved |
| Test coverage | 5 concrete test cases (villain, hero, SHIELD, edge-case, schema) + local smoke + R2 verification |

**Key principle:** All totals are precomputed, all mappings are deterministic, all rendering decisions are binary (row present or absent, never partial).

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

