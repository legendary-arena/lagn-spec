# EC-276 — LAGN Export in Registry Viewer Loadout Tab (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-245-lagn-export-registry-viewer.md`  
**Layer:** Web UI / Registry Viewer (`apps/registry-viewer`)

---

## Before Starting

- [ ] WP-245 pre-flight verdict: `READY TO EXECUTE`
- [ ] WP-244 ✅ complete (`@legendary-arena/lagn` published on NPM)
- [ ] `pnpm install` exits 0 (lagn package available)
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter registry-viewer vue-tsc` exits 0
- [ ] `pnpm --filter registry-viewer test` exits 0 (baseline tests pass)

---

## Locked Values (do not re-derive)

**LAGN Export Composition Mapping (9-field lock):**
- `draft.composition.mastermindId` → `setup.mastermind_id`
- `draft.composition.schemeId` → `setup.scheme_id`
- `draft.composition.villainGroupIds` → `setup.villain_group_ids`
- `draft.composition.henchmanGroupIds` → `setup.henchman_group_ids`
- `draft.composition.heroDeckIds` → `setup.hero_deck_ids`
- `draft.composition.bystandersCount` → `setup.bystanders_count`
- `draft.composition.woundsCount` → `setup.wounds_count`
- `draft.composition.officersCount` → `setup.officers_count`
- `draft.composition.sidekicksCount` → `setup.sidekicks_count`

**LAGN Envelope Fields (auto-generated or user-selected):**
- `game_id`: UUID v4 (generated via `crypto.randomUUID()`)
- `variant`: closed enum `"classic" | "custom"` (user selects before export)
- `player_count`: taken from `draft.playerCount`
- `outcome`: closed enum `"victory" | "loss"` (user selects before export)
- `loss_reason`: set to `"unavailable"` when `outcome="loss"` (LAGN v1 constraint)
- `$schema`: always `"https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json"`

**Export Button Labels:**
- Existing: **"⬇ Download MATCH-SETUP"** (no change, label clarification only)
- New: **"⬇ Download LAGN"** (alongside MATCH-SETUP)

**Export Filename Convention:**
- MATCH-SETUP: `loadout-{schemeId}.json` (unchanged)
- LAGN: `game-{game_id}.lagn.json` (new format, includes UUID)

**Validation Gate:**
- Both export buttons disabled if `draft.composition` is invalid per `useLoadoutDraft` errors
- LAGN export additionally blocked if `variant` or `outcome` unselected
- Validation errors shown verbatim from `@legendary-arena/lagn` validator (full sentence messages)

**Browser API:**
- UUID generation: `crypto.randomUUID()` (Web Crypto, built-in, no polyfill needed)
- No `Date.now()` or `Math.random()` in the new composable

---

## Guardrails

- **Single validator source:** `@legendary-arena/lagn`'s `validate()` function is the ONLY validation call site for LAGN exports
- **No game-engine imports:** Registry viewer stays browser-safe (zero `@legendary-arena/game-engine` / `@legendary-arena/registry` runtime imports in new code)
- **Composition lock:** All 9 fields map EXACTLY as listed above; no renaming, no skipping, no additions
- **No localStorage for variant/outcome:** UI always prompts; no "remember my choice" persistence
- **No Tier 2/3 export:** LAGN export is Tier 1 only (setup composition + envelope)
- **$schema always hardcoded:** Never computed, never configurable, always points to the canonical URL
- **No UUID collisions in test:** Tests verify UUID format (v4, 36 chars with hyphens), not collision probability
- **Error messages unchanged:** If `validate()` returns errors, display them verbatim without paraphrasing

---

## Required `// why:` Comments

None required for this WP (data serialization + UI integration is straightforward; no hidden logic).

---

## Files to Produce / Modify

**New Files:**
- `src/composables/useLoadoutLagnExport.ts` — **new** — composable for LAGN export logic
- `src/composables/useLoadoutLagnExport.test.ts` — **new** — 8+ test cases

**Modified Files:**
- `src/components/LoadoutBuilder.vue` — add LAGN export button + variant/outcome selector + error display
- `src/components/LoadoutBuilder.vue` (continued) — re-label existing button as "MATCH-SETUP"

---

## After Completing

**Code-Complete Phase:**

- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter registry-viewer vue-tsc` exits 0
- [ ] `pnpm --filter registry-viewer test` exits 0 (all tests pass, including 8+ new LAGN tests)
- [ ] No new test failures vs baseline (pre-existing failures carried forward if any)
- [ ] No forbidden imports in new files: Grep for `@legendary-arena/game-engine|@legendary-arena/registry|boardgame.io` in `useLoadoutLagnExport.ts` + `LoadoutBuilder.vue` → 0 matches
- [ ] `crypto.randomUUID()` appears exactly once in `useLoadoutLagnExport.ts` (UUID generation)
- [ ] `@legendary-arena/lagn` imported and `validate()` called in new composable
- [ ] `$schema` hardcoded string present in LAGN serialization (not computed)
- [ ] Existing MATCH-SETUP export behavior byte-identical (no regressions)

**Manual Verification (Browser):**

- [ ] Draft with valid composition → both export buttons **enabled**
- [ ] Draft with invalid composition (missing mastermind) → both buttons **disabled**, error shown
- [ ] Click "⬇ Download LAGN" → modal/dialog appears with variant + outcome selectors
- [ ] Select variant="classic" + outcome="victory" → UUID shown (read-only display), "Download" button enabled
- [ ] Click "Download" → file downloads as `game-{game_id}.lagn.json`
- [ ] Open downloaded file in VS Code → VS Code validates against schema (zero red squiggles, correct $schema URI detected)
- [ ] Test variant="custom" + outcome="loss" → file includes `"loss_reason": "unavailable"`
- [ ] Click "⬇ Download MATCH-SETUP" → file downloads as `loadout-{schemeId}.json` (unchanged behavior)
- [ ] Load MATCH-SETUP file into the draft via "Load JSON" → loads correctly (no LAGN changes affect import)

**Integration Tests:**

- [ ] LAGN composition mapping test: `{ mastermindId, schemeId, villainGroupIds, ... }` → `{ mastermind_id, scheme_id, villain_group_ids, ... }`
- [ ] UUID format test: `crypto.randomUUID()` produces 36-char string with hyphens, matches v4 pattern
- [ ] Variant/outcome required test: export blocked until both selected
- [ ] Validation error display test: `validate()` returns errors → errors shown verbatim to user
- [ ] Filename generation test: `game-{game_id}.lagn.json` format correct
- [ ] $schema field test: exported file includes `"$schema": "https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json"` as first field
- [ ] Loss reason test: `outcome="loss"` → `loss_reason="unavailable"`
- [ ] No localStorage side effects: variant/outcome selections do NOT persist across page reloads

**Drift Detection:**

- [ ] All 9 composition field names match locked mapping (no typos, no renaming)
- [ ] No new npm dependencies added (composable uses only built-in `crypto`, Zod-validated `@legendary-arena/lagn`)
- [ ] No game-engine or registry imports in `useLoadoutLagnExport.ts`

---

## Common Failure Smells

- **"Validation always passes"** — usually means `validate()` is not being called. Check: composable imports and calls `@legendary-arena/lagn`'s `validate()` before returning
- **"UUID not showing in UI"** — usually means the Ref is not bound to template. Check: composable exports `gameId` Ref, LoadoutBuilder binds it to a read-only input
- **"Variant/outcome selections don't block export"** — usually means the guard is missing. Check: `isValid` computed includes both composition AND variant/outcome checks
- **"Downloaded file has wrong schema URI"** — usually means $schema was computed dynamically. Check: it's a hardcoded string, not derived
- **"MATCH-SETUP export broken"** — usually means the label change broke existing logic. Check: only label changed, all button event handlers unchanged
- **"New tests failing but old tests passing"** — usually means composable exports don't match test imports. Check: all new symbols exported from `index.ts` (if it exports anything) or directly from composable
- **"Browser can't generate UUID"** — usually means `crypto` is undefined. Check: you're in a browser context (registry-viewer runs in browser, not Node), `crypto.randomUUID()` is available in all modern browsers

---

## Commit Message Template

```
WP-245: Add LAGN export to Registry Viewer Loadout tab

- New useLoadoutLagnExport composable with UUID generation, validation, serialization
- LoadoutBuilder UI: dual export buttons (MATCH-SETUP + LAGN), variant/outcome selector
- LAGN export generates game_id (UUID v4), prompts for variant/outcome, validates via @legendary-arena/lagn
- Composition mapping locked to 9 fields; loss_reason always "unavailable" when outcome=loss
- 8+ tests covering UUID generation, field mapping, validation, error display, filename format
- All tests pass, no regressions to existing MATCH-SETUP export
- pnpm --filter registry-viewer {build,vue-tsc,test} all exit 0

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

## Files Changed Estimate

- **New:** 2 files (composable + test)
- **Modified:** 1 file (LoadoutBuilder.vue)
- **Total:** 3 files

---

## Parallel-Safety

This WP can execute in parallel with any other WP (independent feature, no engine changes, no shared state mutations in registry-viewer).

---

## Risk Summary

| Risk | Mitigation |
|------|-----------|
| Composition mapping wrong | Locked 9-field table above; grep test on field names |
| Validation errors not displayed | Validator is the source of truth; errors shown verbatim |
| UUID generation fails in browser | Crypto built-in; no polyfill needed; tests verify format |
| MATCH-SETUP export broken | Only label changed; test that existing button still works |
| $schema URI wrong | Hardcoded string; grep for canonical URL in all new files |
