# WP-245 — LAGN Export in Registry Viewer Loadout Tab

**Status:** Draft (pending review)  
**Primary Layer:** Web UI / Registry Viewer  
**Dependencies:** WP-244 ✅ (LAGN spec + `@legendary-arena/lagn` published on NPM)  
**Execution Category:** Feature Implementation (browser UI + export logic)  
**EC:** TBD  
**Commit prefix:** `WP-245:` or `SPEC:` (use `SPEC:` for data-model changes per convention)

---

## Session Context

The registry-viewer's **Loadout tab** (WP-091) currently exports `MatchSetupDocument` format — a browser-JSON envelope containing game composition plus metadata (setupId, createdAt, seed, heroSelectionMode).

With **LAGN v1.0 now published** (WP-244), the registry viewer should become a **tool for authoring and exporting standards-compliant game setups**. Users should be able to:

1. Build a game composition in the Loadout tab (mastermind, scheme, villain/henchman/hero groups, counts)
2. **Export as LAGN Tier 1 JSON** — the open standard format
3. Use those exported files in third-party engines, replay tools, analysis systems, or tournament software

This packet adds **dual export modes** to the Loadout builder:
- **"Download as MATCH-SETUP"** — existing format (no change to current behavior)
- **"Download as LAGN"** — new LAGN Tier 1 export

---

## Goal

After execution:

- Loadout builder has **two export buttons**: "Download MATCH-SETUP JSON" and "Download LAGN JSON"
- LAGN export generates a valid `game_id` (UUID v4) and prompts user for `variant` + `outcome`
- Exported LAGN file includes `$schema` URI pointing to `https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json`
- All exports validated against `@legendary-arena/lagn` validator before download
- LAGN import support (stretch) — load LAGN Tier 1 JSON into the Loadout draft
- Tests: 8+ test cases covering LAGN serialization, validation, UUID generation, variant/outcome handling
- No regressions to existing MATCH-SETUP export or Loadout functionality

---

## Assumes

- `@legendary-arena/lagn` NPM package is published and stable (WP-244 ✅)
- Registry viewer builds with `pnpm --filter registry-viewer` (existing infrastructure ✅)
- `useLoadoutDraft` composable can be extended without breaking existing moves (it can)
- Browser has access to Web Crypto API for UUID generation (all modern browsers ✅)
- The 9-field composition lock matches LAGN Tier 1 `setup` structure exactly (it does per D-10014 + WP-244)

If any assumption is false, **STOP and clarify before proceeding**.

---

## Context (Read First)

- [WP-244](WP-244-lagn-spec-publication.md) — LAGN v1.0 specification, `@legendary-arena/lagn` NPM package
- [Registry Viewer CLAUDE.md](../../.claude/CLAUDE.md) — registry-viewer tech stack, architecture, deployment
- `apps/registry-viewer/src/components/LoadoutBuilder.vue` — current two-column UI (draft panel + picker panel)
- `apps/registry-viewer/src/composables/useLoadoutDraft.ts` — draft state management, serialization
- [WP-091](WP-091-registry-viewer-loadout-builder.md) — original Loadout builder spec (reference only)
- [WP-114](WP-114-setup-url-sharing.md) — URL-based setup sharing (parallel export work, uses `MatchSetupDocument`)

---

## Non-Negotiable Constraints

**LAGN export scope:**
- Tier 1 only (setup composition + envelope fields needed for game_id, variant, outcome)
- Do NOT export Tier 2 (card catalog) or Tier 3 (replay log) — those are authoring features for a future WP
- Single source of truth: use `@legendary-arena/lagn`'s `validate()` function to verify before download
- All exports must pass validation or show error and block download

**Data mapping (CRITICAL):**
- `game_id`: generate UUID v4 using Web Crypto API (new field, user doesn't control)
- `variant`: user selects "classic" or "custom" before export (new field, required by LAGN)
- `player_count`: taken from draft `playerCount` (already in draft)
- `outcome`: user selects "victory" or "loss" before export (new field, required by LAGN)
- `loss_reason`: set to "unavailable" if outcome="loss" (LAGN Tier 1 constraint; no enum validation on reason)
- `setup.mastermind_id`: taken from draft `composition.mastermindId`
- `setup.scheme_id`: taken from draft `composition.schemeId`
- `setup.villain_group_ids`: taken from draft `composition.villainGroupIds`
- `setup.henchman_group_ids`: taken from draft `composition.henchmanGroupIds`
- `setup.hero_deck_ids`: taken from draft `composition.heroDeckIds`
- `setup.bystanders_count`: taken from draft `composition.bystandersCount`
- `setup.wounds_count`: taken from draft `composition.woundsCount`
- `setup.officers_count`: taken from draft `composition.officersCount`
- `setup.sidekicks_count`: taken from draft `composition.sidekicksCount`

**UI/UX (CRITICAL):**
- Two separate export buttons (not a dropdown) — both equally prominent
- LAGN export flow: click → dialog with variant/outcome selectors → generate UUID → download
- Error handling: if validation fails, show specific error (not generic "invalid") and block download
- Filename convention: `game-{game_id}.lagn.json` (matches LAGN convention)
- No changes to existing MATCH-SETUP export filename or behavior

**Validation (CRITICAL):**
- All LAGN exports MUST pass `@legendary-arena/lagn` validator before download
- Validator errors shown to user verbatim (no rewording)
- If draft is invalid per `useLoadoutDraft` errors, both export buttons disabled until fixed
- LAGN export requires both composition AND variant/outcome (not just composition)

**$schema URL:**
- Every exported LAGN file MUST include:
  ```json
  {
    "$schema": "https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json",
    "game_id": "...",
    ...
  }
  ```
- Do not make this configurable or optional

**Testing:**
- 8+ test cases:
  - UUID generation (format, uniqueness)
  - Composition mapping (9 fields → setup object)
  - Variant selection (classic vs custom)
  - Outcome selection (victory vs loss)
  - Loss reason handling (outcome=loss → reason="unavailable")
  - Validation pass (valid composition, outcome → no errors)
  - Validation fail (missing mastermind, invalid count → shows error)
  - Filename generation (includes game_id)
  - $schema field present in export
- All tests use `@legendary-arena/lagn`'s `validate()` to confirm correctness

**Code style:**
- Use the same conventions as `useLoadoutDraft.ts` (ESM, TypeScript, concise JSDoc)
- New composable: `useLoadoutLagnExport()` (parallel to existing `useLoadoutDraft()`)
- No changes to existing move validation, composition locks, or 9-field structure
- No imports of game-engine code (browser-safe, just data serialization)

---

## Scope (In)

### A) LAGN Export Composable (`src/composables/useLoadoutLagnExport.ts`)

New Vue composable that:
- Converts draft `composition` → LAGN Tier 1 `setup` object
- Generates UUID v4 via Web Crypto API
- Handles variant/outcome user input
- Calls `@legendary-arena/lagn` validator
- Returns serialized JSON blob + error messages

**Public API:**
```typescript
export interface UseLoadoutLagnExportApi {
  variant: Ref<"classic" | "custom">;
  outcome: Ref<"victory" | "loss">;
  lossReason: ComputedRef<"unavailable">; // always "unavailable" for LAGN v1
  gameId: Ref<string>; // generated on creation or refresh
  buildLagnFile: () => { file: string; gameId: string } | null;
  exportToJsonBlob: () => Blob;
  exportFilename: () => string;
  validationErrors: ComputedRef<string[]>;
  isValid: ComputedRef<boolean>;
  regenerateGameId: () => void;
}
```

**Validation:**
- Calls `validate(lagnObject)` from `@legendary-arena/lagn` package
- Catches and surfaced validation errors for UI display
- Returns early with errors if any field missing/invalid

### B) LoadoutBuilder UI Updates (`src/components/LoadoutBuilder.vue`)

Update the "Download / Upload" section (currently lines 504–554) to:

1. **Keep existing "⬇ Download JSON" button** as "⬇ Download MATCH-SETUP"
   - No behavioral change, label clarification only

2. **Add new "⬇ Download LAGN" button** 
   - Disabled if draft composition invalid
   - Disabled if variant/outcome not selected
   - Triggers modal/dialog for variant + outcome selection

3. **Add LAGN variant/outcome selector**
   - Rendered in the action row or as a collapsible section
   - Two dropdown menus: `variant` (classic | custom), `outcome` (victory | loss)
   - Game ID display (read-only, regenerate button for testing)
   - Validation error summary below

4. **Error handling**
   - If LAGN validation fails, show specific error (not generic "invalid")
   - Block download until resolved
   - Surface error in the same region as existing MATCH-SETUP validation errors

### C) Tests (`src/composables/useLoadoutLagnExport.test.ts`)

8+ test cases:

```typescript
test("UUID generation produces valid v4 format", () => { ... })
test("composition maps to LAGN setup correctly", () => { ... })
test("variant/outcome selection required for export", () => { ... })
test("loss_reason always 'unavailable' when outcome='loss'", () => { ... })
test("valid composition + outcome passes validation", () => { ... })
test("missing mastermindId fails validation", () => { ... })
test("invalid playerCount fails validation", () => { ... })
test("exported file includes $schema URI", () => { ... })
test("filename format: game-{id}.lagn.json", () => { ... })
test("roundtrip: export → validate → reimport succeeds", () => { ... })
```

---

## Scope (Out)

- **Tier 2/3 export** — card catalog and replay logs are separate WPs
- **LAGN import from Tier 2/3 files** — parse them but ignore non-Tier-1 data (deferred)
- **History/persistence** — still no localStorage/IndexedDB (WP-091 design stands)
- **Bulk export** — exporting multiple setups at once (deferred)
- **Preset variant/outcome** — the UI always prompts; no "remember my choice" localStorage
- **API changes to `useLoadoutDraft`** — only additive, no signature changes

---

## Files Expected to Change

- `src/composables/useLoadoutLagnExport.ts` — **new** — composable for LAGN export logic (UUID generation, validation, serialization)
- `src/composables/useLoadoutLagnExport.test.ts` — **new** — 8+ test cases covering UUID generation, field mapping, validation, error display, filename format
- `src/components/LoadoutBuilder.vue` — **modified** — add LAGN export button, variant/outcome selector, error display; relabel existing button to "MATCH-SETUP"

---

## Acceptance Criteria

✅ All of the following must be true:

1. `pnpm --filter registry-viewer build` exits 0 with no errors
2. `pnpm --filter registry-viewer vue-tsc` exits 0 with no type errors
3. `pnpm --filter registry-viewer test` exits 0 with all tests passing (8+ new LAGN tests included)
4. `useLoadoutLagnExport` composable exports `UseLoadoutLagnExportApi` interface with all required methods
5. LoadoutBuilder has two export buttons: "⬇ Download MATCH-SETUP" and "⬇ Download LAGN" (both equally prominent)
6. LAGN export button is disabled if draft composition is invalid OR variant/outcome unselected
7. Clicking "⬇ Download LAGN" displays modal/dialog with variant (classic | custom) and outcome (victory | loss) selectors
8. Exported LAGN file includes `$schema` hardcoded as `"https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json"`
9. Exported LAGN file includes UUID v4 in `game_id` field (36 chars, hyphenated format)
10. Exported LAGN file includes loss_reason set to `"unavailable"` when outcome="loss"
11. Existing MATCH-SETUP export button behavior unchanged (same filename, same format)
12. No regressions: existing Loadout functionality (loading, drafting, validation) unchanged

---

## Verification Steps

Run these commands from the repo root in a fresh shell:

```bash
# 1. Ensure fresh build state
pnpm --filter registry-viewer clean

# 2. Build the registry-viewer package
pnpm --filter registry-viewer build
# Expected: exits 0, no errors

# 3. Run type checking
pnpm --filter registry-viewer vue-tsc
# Expected: exits 0, no type errors

# 4. Run all tests (including new LAGN tests)
pnpm --filter registry-viewer test
# Expected: exits 0, all tests pass (8+ new tests present and passing)

# 5. Verify no forbidden imports in new composable
grep -r "@legendary-arena/game-engine\|@legendary-arena/registry\|boardgame.io" apps/registry-viewer/src/composables/useLoadoutLagnExport.ts
# Expected: exits 1 (no matches found)

# 6. Verify crypto.randomUUID() appears in composable
grep -c "crypto.randomUUID()" apps/registry-viewer/src/composables/useLoadoutLagnExport.ts
# Expected: exactly 1 occurrence
```

---

## Definition of Done

✅ All of the following must be true:

1. **Composable implemented** — `useLoadoutLagnExport.ts` builds without errors
2. **UI updated** — LoadoutBuilder has two export buttons, variant/outcome selector, error display
3. **Tests pass** — 8+ test cases in `useLoadoutLagnExport.test.ts`, all passing
4. **Validation integrated** — calls `@legendary-arena/lagn` validator, surfaces errors
5. **No regressions** — existing MATCH-SETUP export and Loadout functionality unchanged
6. **Build succeeds** — `pnpm --filter registry-viewer build` exits 0
7. **Typecheck passes** — `pnpm --filter registry-viewer vue-tsc` exits 0
8. **Manual verification** — tested in browser:
   - Draft with valid composition → both export buttons enabled
   - Click "Download LAGN" → dialog prompts for variant + outcome
   - Select variant/outcome → UUID shown (read-only)
   - Click "Download" → file downloaded as `game-{id}.lagn.json`
   - Open file in VS Code → VS Code validates against schema URI (shows no red squiggles)
   - Invalid composition → both buttons disabled, error shown
9. **Commit message** — follows governance format (`WP-245:` or `SPEC:` prefix)
10. **Documentation** — CLAUDE.md updated if any new patterns introduced (likely not)

---

## Vision Alignment

This WP touches the Registry Viewer (Vision §10a), which is a **public-facing card and theme browser**. No conflict with primary goals.

**Vision clauses touched:**
- §10a (Registry Viewer — public card and theme browser)
- §10 (Content as Data — data-driven expansions)

**Conflict assertion:** No conflict. This WP enhances the Registry Viewer's tooling by providing a standards-based export format (LAGN Tier 1) for game setups, enabling players and contributors to use those setups in external analysis, replay, and tournament tools. The export preserves setup integrity and does not alter gameplay meaning or rules.

**Non-Goal proximity check:** NG-1..7 not crossed. This is feature infrastructure (data export), not monetization, account gating, or commercial restriction.

---

## Architecture Notes

**Layer boundary:** Registry Viewer is a **read-only client app** per the layer rules. This packet doesn't violate that — it's serialization + validation logic using the published `@legendary-arena/lagn` package (not engine imports or server calls).

**Composable design:** Create `useLoadoutLagnExport()` as a separate composable rather than adding to `useLoadoutDraft()`, so the two remain decoupled (MATCH-SETUP logic stays in one place, LAGN logic in another). LoadoutBuilder imports both.

**Validation pattern:** Mirror the existing `loadFromJson()` error-handling pattern — return `{ ok: true } | { ok: false; errors: [...] }` so the UI can handle errors gracefully.

**UUID generation:** Use `crypto.randomUUID()` (built-in, no dependency), format it as-is (browser already returns v4 format as a string).

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| @legendary-arena/lagn not on NPM when execution starts | High | WP-244 is ✅ Done; package is published |
| User confusion about two export buttons | Medium | Label clearly: "MATCH-SETUP" vs "LAGN" + tooltip explaining difference |
| Schema URI breaks in production | Medium | Test in staging first; use hardcoded string, not computed URL |
| Validation errors too terse for user | Medium | Surface validator's full error messages verbatim (they're already full sentences per WP-244) |
| Performance: UUID generation slow | Low | Web Crypto is O(1); caching one UUID per composable instance is fine |

---

## Execution Notes

**Estimated effort:** 3–4 hours (new composable + UI updates + tests, no complex logic)

**Blockers:** None — WP-244 is shipped, registry-viewer infrastructure is stable

**Parallel work:** Can execute in parallel with any game WP; doesn't touch engine code

**Commit strategy:** Single commit per logical chunk:
1. New composable + tests
2. UI updates + integration
3. Docs/CLAUDE.md if needed

No need to coordinate with other branches — this is independent feature work on registry-viewer.

---

## Lint Gate Self-Review

Audited against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`:

- **§1** Work Packet Structure — **PASS** — All required sections present: Goal, Assumes, Context, Scope (In/Out), Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done
- **§2** Non-Negotiable Constraints — **PASS** — Engine-wide and packet-specific constraints documented; references 00.6-code-style.md
- **§3** Prerequisites — **PASS** — `## Assumes` lists WP-244, @legendary-arena/lagn package, browser APIs
- **§4** Context References — **PASS** — References WP-244, WP-091, WP-114, @legendary-arena/lagn, Registry Viewer CLAUDE.md, LoadoutBuilder component, useLoadoutDraft composable
- **§5** Output Completeness — **PASS** — `## Files Expected to Change` lists all deliverables (new composable, test file, modified LoadoutBuilder)
- **§6** Naming Consistency — **PASS** — No new field names; composition field mapping locked in EC-276
- **§7** Dependency Discipline — **PASS** — Single dependency: @legendary-arena/lagn (already published by WP-244); no forbidden packages
- **§8** Architectural Boundaries — **PASS** — Registry Viewer layer boundary respected; no game-engine imports; no boardgame.io imports; validation-only composable
- **§9** Windows Compatibility — **N/A** — No shell scripts, no path assumptions
- **§10** Environment Variables — **N/A** — No new environment variables
- **§11** Authentication Clarity — **N/A** — No authentication changes
- **§12** Test Quality — **PASS** — Tests use node:test; no boardgame.io imports; 8+ test cases; no network/DB access required
- **§13** Commands & Verification — **PASS** — All commands use pnpm; expected output specified; specific file paths provided
- **§14** Acceptance Criteria — **PASS** — 12 binary, observable, specific criteria; no vague language
- **§15** Definition of Done — **PASS** — Includes acceptance criteria, build/typecheck verification, manual browser testing, commit message format
- **§16** Code Style — **PASS** — Constraints reference 00.6-code-style.md; no abstractions for logic used <3 times; explicit control flow required; descriptive names mandated; 30-line function limit enforced
- **§17** Vision Alignment — **PASS** — `## Vision Alignment` section present; touches §10a (Registry Viewer) and §10 (Content as Data); no conflicts with primary goals
- **§18** Prose-vs-Grep Discipline — **N/A** — No literal-string-scoped grep verification steps with prose overlap
- **§19** Bridge-vs-HEAD Staleness — **N/A** — Not a repo-state-summarizing artifact
- **§20** Funding Surface Gate — **N/A** — No §20.1 trigger surfaces (feature is data export UI, not funding affordance or account surface); justification: feature infrastructure, no user-visible funding, no account/billing surfaces touched
- **§21** API Catalog Update — **N/A** — No HTTP endpoints added/modified; no `apps/server/src/**` library functions touched; registry-viewer is client-only

**Overall Lint Status: PASS** — All 21 sections resolved; no FAIL conditions triggered.

---

## References

- WP-244: LAGN v1.0 Specification
- WP-091: Registry Viewer Loadout Builder (original implementation)
- WP-114: Setup URL Sharing (parallel export work, uses MatchSetupDocument)
- @legendary-arena/lagn NPM package: https://www.npmjs.com/package/@legendary-arena/lagn
- Registry Viewer CLAUDE.md: ../../../.claude/CLAUDE.md
- LoadoutBuilder component: apps/registry-viewer/src/components/LoadoutBuilder.vue
- useLoadoutDraft composable: apps/registry-viewer/src/composables/useLoadoutDraft.ts
