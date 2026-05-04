# Copilot Check — WP-127 (Registry Viewer: Grid Tile Team & Ability Text — Threshold-Gated)

**Date:** 2026-05-02
**Pre-flight verdict under review:** READY TO EXECUTE — conditional on PS-1 (`docs/ai/invocations/preflight-wp127.md`, 2026-05-02)
**Inputs reviewed:**
- EC: `docs/ai/execution-checklists/EC-129-registry-viewer-grid-tile-team-and-ability-text.checklist.md`
- WP: `docs/ai/work-packets/WP-127-registry-viewer-grid-tile-team-and-ability-text.md`
- Pre-flight: `docs/ai/invocations/preflight-wp127.md`

---

## Overall Judgment

**CONFIRM** (Re-run 2026-05-02, post-PS-1 resolution).

**Initial pass (2026-05-02, pre-resolution):** HOLD — one scope-neutral RISK finding (#15 Missing "Why" / Vision Alignment block absent from WP-127). No BLOCK-class items.

**Re-run (2026-05-02, post-resolution):** PS-1 landed as a scope-neutral wording addition to WP-127. The new `## Vision Alignment` block sits between `## Out of Scope` and `## Files Expected to Change` (matching WP-121's section ordering). Content mirrors WP-121 lines 275–294 byte-for-byte in structure: §10a citation, no-conflict assertion, NG-1..7 not crossed, determinism N/A, §20 funding-surface gate N/A. No file was added or removed from WP-127's scope. No contract changed. No test count changed. The 30-issue scan now returns **30 PASS / 0 RISK / 0 BLOCK**. The pre-flight verdict (READY TO EXECUTE — conditional on PS-1) is now unconditional. **Session prompt generation authorized** per `01.4 §Authorized Next Step`.

Findings detail below preserves the original RISK framing for audit purposes; #15 is individually marked RESOLVED with the resolution citation.

---

## Findings

Grouped by the 11 categories in `01.7-copilot-check.md`. Twenty-nine PASS findings are consolidated; one RISK finding is detailed with FIX. `BLOCK` reserved for the overall verdict — none assigned.

### Category 1: Separation of Concerns & Boundaries

**1. Engine vs UI / App Boundary Drift** — PASS. WP-127 §Non-Negotiable Constraints + EC-129 §Guardrails confine all edits to `apps/registry-viewer/src/`. No `packages/game-engine/`, `packages/registry/` runtime barrel, `packages/preplan/`, `apps/server/`, `pg`, or `boardgame.io` import is permitted. Pre-flight §Code Category Boundary Check verifies. Same envelope as WP-066 / WP-096 / WP-121 / WP-125 — the established viewer-WP precedent.

**9. UI Re-implements or Re-interprets Engine Logic** — PASS. WP-127 is pure presentation: a threshold-gated reveal of two `FlatCard` fields (`team`, `abilities`) that already exist in the registry-side projection. No game state, no rule semantics, no move dispatch, no replay surface. The threshold check is a pure derivation from `cardSize.value` (an existing UI preference under D-12101). The new constant module has zero imports and zero behavior beyond exporting a number.

**16. Lifecycle Wiring Creep** — PASS. Pre-flight §Authority Chain item 13 mandates the session prompt declare **01.5 NOT INVOKED** with all four criteria absent (no `LegendaryGameState` field change, no `buildInitialGameState` shape change, no `LegendaryGame.moves` entry, no phase hook). WP-066 / WP-096 / WP-121 precedent applied. `game.ts` is outside the viewer tree entirely; the viewer has no access to engine wiring.

**29. Assumptions Leaking Across Layers** — PASS. Engine unaware of viewer. Viewer consumes only `FlatCard` re-exported from `apps/registry-viewer/src/registry/browser.ts` (existing path). The new `cardTileThresholds.ts` introduces no cross-layer assumption — it exports a single number with no imports of any kind. The two component edits read existing intra-app symbols (`useCardSize`, `ABILITY_THRESHOLD_PX`).

### Category 2: Determinism & Reproducibility

**2. Non-Determinism Introduced by Convenience** — PASS. `.claude/rules/code-style.md §Patterns to Avoid` blanket-bans `Math.random()` and `Date.now()` repo-wide; pre-flight §Authority Chain cites this. WP-127 §Non-Negotiable Constraints repeats the prohibition (marked as N/A — no engine touch — but the prohibition still applies to viewer code by virtue of `.claude/rules/code-style.md`). Tile render is a pure function of `FlatCard` + `viewMode` + `cardSize.value`. No timer, no animation, no RNG.

**8. No Single Debugging Truth Artifact** — PASS. WP-127 §Debuggability & Diagnostics enumerates three deterministic debug surfaces: (a) DOM tile content (Vue DevTools), (b) `localStorage['cardGridSize']` (DevTools → Application → Local Storage), (c) `.img-wrap` class list (DOM Inspector — observe whether `data-expanded` is present). The four explicit failure-mode entries in §Debuggability map symptoms to root causes. Same observability model as WP-066 / WP-096 / WP-121.

**23. Lack of Deterministic Ordering Guarantees** — PASS. WP-127 introduces no iteration order semantics. The `Team` row's placement (between `Class` and `Cost`) is template-fixed. The `Ability` block's bullet items render `card.abilities` in array order (Vue `v-for` with `:key="lineIndex"` preserves source ordering). `applyFilters()` / `applyQuery()` in `App.vue` are out of scope and unchanged.

### Category 3: Immutability & Mutation Discipline

**3. Confusion Between Pure Functions and Immer Mutation** — PASS. No Immer. No `G` draft. No move context. The new `cardTileThresholds.ts` is constant-only. The two component edits use Vue's `ref` reactivity (assignment-style, not Immer). Rendering is declarative via `<template>`. The `hasAbilityText` helper is a pure function (string in, boolean out).

**17. Hidden Mutation via Aliasing** — PASS. No `G` projection. No shared array reference. `FlatCard` passes as a prop (Vue convention: props are read-only at the child boundary). The new tile content reads `card.team` and iterates `card.abilities` via `v-for` — no mutation, no array splice, no nested object passthrough that could alias upstream state. The `.some(hasAbilityText)` callsite returns a boolean, not a reference.

### Category 4: Type Safety & Contract Integrity

**4. Contract Drift Between Types, Tests, and Runtime** — PASS. `FlatCard` is the consumed contract (verified at `apps/registry-viewer/src/registry/types/types-index.ts:45, 53`). WP-127 §Locked Values pins the threshold name + value + module path against the actual filesystem (verified absent at pre-flight time). EC-129 mirrors every locked value. No canonical readonly arrays introduced (the threshold is a single scalar).

**5. Optional Field Ambiguity (`exactOptionalPropertyTypes`)** — PASS. WP-127 mandates the same AND-semantics guard form `CardDataDisplay.vue` already uses for both new template blocks (verified byte-for-byte against `CardDataDisplay.vue:90–93` and `:130–141`). `card.team` is `string | undefined` — guarded by `v-if="showAbilityRow && card.team"` (truthiness for strings is correct: empty string also omitted, matching sidebar). `card.abilities` is `string[]` (always present, possibly empty) — guarded by `v-if="showAbilityRow && card.abilities && card.abilities.some(hasAbilityText)"`. No object-literal construction site where `exactOptionalPropertyTypes` would bite.

**6. Undefined Merge Semantics (Replace vs Append)** — PASS. No merge logic. The new constant module has no merge surface. The class binding on `.img-wrap` is a Vue object syntax `:class="{ 'data-expanded': condition }"` — replace-only, deterministic. The CSS rule `.img-wrap.data-expanded { aspect-ratio: auto; }` overrides the parent `.img-wrap { aspect-ratio: 3/4 }` only when the class is present (CSS specificity rule, well-defined).

**10. Stringly-Typed Outcomes and Results** — PASS. The threshold is a number, not a string. The `viewMode === 'data'` literal-union check is verified against the locked union in `useCardViewMode.ts` (WP-066 / D-66xx). The class name `data-expanded` is a single locked literal in EC-129 §Locked Values; it is paired with a single CSS rule. No free-form strings.

**21. Type Widening at Boundaries** — PASS. The `cardTileThresholds.ts` export is `export const ABILITY_THRESHOLD_PX = 190;` — TypeScript infers the literal type `190` (narrowest). The component imports use named imports (no `as any`, no `unknown`, no widening cast). `useCardSize` returns the locked `{ cardSize: Ref<number>; setCardSize: ... }` shape (D-12101). `computed(() => cardSize.value >= ABILITY_THRESHOLD_PX)` returns `ComputedRef<boolean>` — narrow.

**27. Weak Canonical Naming Discipline** — PASS. `ABILITY_THRESHOLD_PX` matches the existing locked-naming style in `useCardSize.ts` (`MIN_CARD_WIDTH_PX`, `MAX_CARD_WIDTH_PX`, `DEFAULT_CARD_WIDTH_PX`, `CARD_WIDTH_STEP_PX`) — uppercase snake-case with `_PX` suffix for pixel constants. `data-expanded` matches existing kebab-case CSS class style (`.tile-info`, `.tile-name`). `cardTileThresholds.ts` matches the lowercase camelCase composable-file style (`useCardSize.ts`, `useCardViewMode.ts`). The label strings `Team` and `Ability` are byte-identical to `CardDataDisplay.vue:91, 131` — no near-synonym proliferation.

### Category 5: Persistence & Serialization

**7. Persisting Runtime State by Accident** — PASS. The only persisted state read by this WP is `localStorage['cardGridSize']`, established by WP-121 / D-12101 and unchanged. No `G`, no `ctx`, no engine artifact. The new constant module persists nothing. The two component edits add no localStorage keys, no IndexedDB writes, no service worker state.

**19. Weak JSON-Serializability Guarantees** — PASS. No data put into `G` or persisted at all in this packet. `FlatCard.team` and `FlatCard.abilities` are already JSON-serializable (Zod-inferred — `team: z.string().optional().nullable()`, `abilities: z.array(z.string()).optional().default([])`). The new constant is a number. No function/Map/Set/class instance introduced.

**24. Mixed Persistence Concerns** — PASS. `localStorage` (UI preference under D-12101) and R2 (`FlatCard` source under existing data-source registration) are cleanly separated. Tile reads from `FlatCard` for content; from `cardSize.value` for the threshold gate. The two flows do not blur — neither writes to the other's storage class.

### Category 6: Testing & Invariant Enforcement

**11. Tests Validate Behavior, Not Invariants** — PASS (with known gap accepted at pre-flight §Test Expectations). The viewer has no Vue component-test harness — same precedent as WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 / WP-125 (nine-WP precedent). Verification is `pnpm --filter registry-viewer build` + `pnpm --filter @legendary-arena/registry-viewer exec tsc --noEmit` + 8-step manual smoke (WP-127 §Verification Steps). Pre-flight RS-2 carries the long-term governance follow-up to add a harness in a separate WP. No new tests are permitted under WP-127's allowlist.

### Category 7: Scope & Execution Governance

**12. Scope Creep During "Small" Packets** — PASS. WP-127 §Files Expected to Change explicitly names three production files plus four governance files (`DECISIONS.md`, `STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md`). EC-129 §Locked Values repeats the three-file production lock. Pre-flight §Scope Lock enumerates the not-allowed file list (every other registry-viewer file, all engine packages, all server / arena-client paths, all `.test.ts` files, all `package.json` files). `git diff --name-only` verification step is in WP-127 §Verification Steps and EC-129 §After Completing. The "literal `190` does NOT appear in `CardDataTile.vue` or `CardGrid.vue`" inverted-grep guard is an unusually strong scope-creep defense.

**13. Unclassified Directories and Ownership Ambiguity** — PASS-by-precedent. `apps/registry-viewer/` has no row in `02-CODE-CATEGORIES.md` — a deferred-tracked governance gap inherited from WP-066 / WP-094 / WP-096 / WP-114 / WP-121 / WP-122 / WP-123 / WP-124 / WP-125. Pre-flight RS-2 carries this forward without expanding WP-127's scope (would violate the allowlist). The standing tracker line in `WORK_INDEX.md` (added by WP-096 FIX 4) remains the resolution venue. WP-127 introduces no new directory.

**30. Missing Pre-Session Governance Fixes** — PASS. Pre-flight §Pre-Flight Verdict explicitly lists PS-1 as a scope-neutral wording fix that must land before session prompt generation. PS-1 is mapped to a specific RS finding (RS-1: missing Vision Alignment block). Resolution will be logged in §Authorized Next Step. Same WP-027 / WP-031 / WP-066 / WP-096 precedent for blocking-vs-non-blocking PS-# triage.

### Category 8: Extensibility & Future-Proofing

**14. No Extension Seams for Future Growth** — PASS. WP-127 §Maintainability & Upgrade Readiness identifies two extension seams: (a) future tile-content thresholds add as additional `*_THRESHOLD_PX` constants in `cardTileThresholds.ts` (single-export module is naturally extensible to N exports without architectural decision); (b) future field-set additions to the tile follow the same in-place D-9601 amendment template established by this WP. The amendment shape (dated, citing WP, cluster of ≤5 numbered points) is reusable.

**28. No Upgrade or Deprecation Story** — PASS. The threshold value `190` has no persistence layer — it lives in code, not in localStorage. Re-tuning to 180 / 200 is a one-character edit + a D-9601 re-amendment. No data migration. No deprecation surface. The class `data-expanded` is added cleanly; image mode never receives it; below-threshold data mode never receives it. The new CSS rule's specificity (`.img-wrap.data-expanded`) is one notch above the existing `.img-wrap` rule and overrides cleanly.

### Category 9: Documentation & Intent Clarity

**15. Missing "Why" for Invariants and Boundaries** — **RISK → RESOLVED 2026-05-02 via PS-1.** WP-127 §Scope (In) §A and EC-129 §Required `// why:` Comments collectively mandate five `// why:` clauses: (a) `cardTileThresholds.ts` module-header JSDoc; (b) `CardDataTile.vue` `useCardSize` import; (c) `CardDataTile.vue` `showAbilityRow` `computed`; (d) `CardDataTile.vue` module-header JSDoc update; (e) `CardGrid.vue` class binding. Each has a specific content spec. PASS for the code-side `// why:` discipline.

Original finding: WP-127 itself lacked a `## Vision Alignment` H2 block, breaking parity with WP-121 lines 275–294 + WP-096 line 296+ + WP-104. Per the established viewer-WP precedent, the Vision Alignment section is conventional documentation of why-the-WP-is-aligned. Its absence was a documentation-side "why" gap that mapped to issue #15.

**Resolution (PS-1, 2026-05-02):** Appended a `## Vision Alignment` block to WP-127 between `## Out of Scope` and `## Files Expected to Change` (matching WP-121's section ordering). Mirrors WP-121 lines 275–294 byte-for-byte in shape and content:
- **Vision clauses touched:** §10a (Registry Viewer public surface — search and browse quality on `cards.barefootbetters.com`).
- **Conflict assertion:** No conflict. This WP improves browse-quality on the public reference surface; sub-190 tile layout is byte-identical to the WP-096 baseline (zero change at default zoom).
- **Non-Goal proximity check:** None of NG-1..NG-7 is crossed.
- **Determinism preservation:** N/A — UI-only client-local threshold; no scoring, replay, RNG, simulation, or PAR surface.
- **§20 Funding Surface Gate:** N/A with explicit justification — registry-viewer UI affordance; no funding-adjacent UI, no payment surface, no donation prompt, no storefront cross-link.

Wording-only; no scope change; no allowlist change. Block lands at WP-127 line 168 (29-line addition; no other WP-127 content modified). **Now PASS.**

**20. Ambiguous Authority Chain** — PASS. WP-127 §Context (Read First) cites the authority documents in order: ARCHITECTURE.md §Layer Boundary, `.claude/rules/architecture.md §Layer Boundary`, `apps/registry-viewer/CLAUDE.md`, `DECISIONS.md §D-9601` (the lock being amended), `DECISIONS.md §D-12101` (the lock being preserved), the existing `CardDataTile.vue` / `CardGrid.vue` / `CardDataDisplay.vue` / `useCardSize.ts` source files, and `00.6-code-style.md`. EC-129 cites the same chain in compressed form. Pre-flight verifies all references at the source level.

**26. Implicit Content Semantics** — PASS. The threshold's semantics are locked in prose at three independent locations: `cardTileThresholds.ts` JSDoc (specified by EC-129 §Required `// why:` Comments), WP-127 §Goal + §Scope (In) §A, and the proposed D-9601 amendment block. The class name `data-expanded` is paired with a single locked CSS rule. The `Team` row placement (between `Class` and `Cost`) is locked in EC-129 §Locked Values with an explicit citation to `CardDataDisplay.vue:90`. No reliance on names alone.

### Category 10: Error Handling & Failure Semantics

**18. Outcome Evaluation Timing Ambiguity** — PASS. The threshold check fires per-tile per-render, synchronously inside Vue's reactivity system. There is no "before vs after game end" surface — this is a UI render path, not a gameplay evaluation surface. No staged transitions; no `turnPhases.logic.ts` involvement.

**22. Silent Failure vs Loud Failure Decisions Made Late** — PASS. WP-127 §Maintainability & Upgrade Readiness "Fail-safe behavior" enumerates four explicit fail-soft cases: (a) malformed `cardSize.value` narrows to `DEFAULT_CARD_WIDTH_PX = 130` (below threshold → reverts to WP-096 baseline); (b) absent `card.team` omits the row via AND-semantics (`v-if="showAbilityRow && card.team"`); (c) empty / `[object Object]`-only `card.abilities` omits the block via `.some(hasAbilityText)`; (d) `viewMode === 'image'` never matches the class binding. All four are silent-but-safe degradations — same posture as `CardDataDisplay.vue` baseline (the sidebar's omit-on-empty pattern is the established precedent). No throws introduced. No console errors introduced (verified by smoke step #8).

### Category 11: Single Responsibility & Logic Clarity

**25. Overloaded Function Responsibilities** — PASS. Three single-responsibility units:
- `cardTileThresholds.ts` — exports a single constant, has zero behavior.
- `hasAbilityText` (introduced byte-identically to `CardDataDisplay.vue:53–59`) — pure boolean predicate, three conditions, no side effects.
- `showAbilityRow` `computed` — single boolean derivation from a single ref + a single constant.

No helper does merging, validation, evaluation, and mutation in one place. The class binding on `.img-wrap` is a single boolean expression with two AND-clauses, narrow and inspectable.

---

## Mandatory Governance Follow-ups

- **DECISIONS.md entry:** WP-127 amends D-9601 in place at execution close (no new D-NNN number). The amendment block is dated `2026-05-02`, cites WP-127 + EC-129, and documents the five points specified in WP-127 §Scope (In) §D. This is execution-time work, not pre-flight remediation.
- **`02-CODE-CATEGORIES.md` update:** **NOT in WP-127 scope.** Deferred-tracker line in `WORK_INDEX.md` already exists from WP-096 FIX 4. WP-127 inherits the same standing gap as WP-114 / WP-121 / WP-122 / WP-123 / WP-124 / WP-125. Resolution venue is a future viewer-classification WP.
- **`.claude/rules/*.md` update:** none. WP-127 does not introduce a new layer rule, a new naming convention, or a new architectural invariant.
- **`WORK_INDEX.md` update:** WP-127 row check-off at execution close. EC-129 row in `EC_INDEX.md` advances from `Draft` to `Done <date>` at execution close. Both are execution-time work; the rows do not exist yet at pre-flight time (per the user's stated decision to hold the index entries until WP-104's working-tree edits committed — confirmed clean at HEAD `cea9108`).
- **`STATUS.md` update:** at execution close, note that the registry viewer's grid-tile data view now reveals `Team` + ability text above `cardSize.value >= 190`. Mirrors the WP-121 / WP-125 STATUS entry shape.

---

## Pre-Flight Verdict Disposition

- [x] **CONFIRM** — Pre-flight READY TO EXECUTE verdict stands (post-PS-1). Session prompt generation authorized.
- [ ] HOLD — Apply listed FIX in-place, re-run copilot check.
- [ ] SUSPEND — Pre-flight verdict suspended.

The 30-issue scan now returns **30 PASS / 0 RISK / 0 BLOCK**. Session prompt generation is authorized per `01.4 §Authorized Next Step`.
