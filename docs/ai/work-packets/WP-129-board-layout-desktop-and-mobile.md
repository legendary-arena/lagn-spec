# WP-129 — Board Layout (Desktop Landscape + Mobile Portrait)

**Status:** Ready
**Primary Layer:** Client UI (`apps/arena-client/src/components/play/`) + Pinia stores
**Dependencies:** WP-128 (UIState projection extensions); WP-100 (interactive gameplay surface scaffolds — superseded by this packet); WP-061 (gameplay client bootstrap); WP-062 (Arena HUD components — extended); WP-064 (game log + replay inspector — preserved); WP-065 (Vue SFC test transform); WP-089 (`LegendaryGame.playerView` projection)

---

## Session Context

WP-128 extended `UIState` with every `Pending` field the board-layout wireframe requires (shared-pile counts, destination piles, per-player victory/in-play/discard projections, mastermind captured array, economy `piercing`/`woundsDrawn`); this packet builds the production Vue component tree against that extended `UIState`, supersedes the WP-100 stage-only-gated scaffolds, and ships both the desktop landscape (1280×800+) and mobile portrait (375×667+) viewports as locked in `docs/ai/DESIGN-BOARD-LAYOUT.md`.

---

## Goal

After this packet, `apps/arena-client/` renders the full Marvel Legendary cooperative game board against the WP-128-extended `UIState`. The active player can take a complete turn (Reveal → Play/Recruit/Fight → End turn) at desktop (1280×800 to 1920×1080) and mobile portrait (375×667 to 414×896) viewports, with the eight visual zones from the wireframe (City row, HQ row, Mastermind, Scheme, Shared Decks, Shared KO Pile, Opponent panels, Your Zone) rendering live data through the WP-089 player-view projection. The eight `[DECISION REQUIRED]` blocks from `DESIGN-BOARD-LAYOUT.md §7.2` are locked at execution as `D-12901..D-12908`.

---

## Assumes

- WP-128 complete. Specifically:
  - `packages/game-engine/src/ui/uiState.types.ts` exports `UIDecksState`, `UISharedPilesState`, `UIKoPileState`; extends `UIPlayerState` / `UIMastermindState` / `UISchemeState` / `UICityState` / `UITurnEconomyState` per WP-128 Scope (In) §A.
  - `buildUIState` populates every new field; `filterUIStateForAudience` redacts per the WP-128 audience matrix.
  - The drift test pins every new field name; engine baseline `604+N/132+M/0`.
- WP-100 complete. The existing scaffold components at `apps/arena-client/src/components/play/` are present and are explicitly superseded by this packet (not preserved).
- WP-061 complete. Vue 3 + Vite + Pinia bootstrap; `useUiStateStore()` exists with `snapshot: UIState | null` + `setSnapshot`.
- WP-062 complete. Arena HUD components exist; this packet extends them with the WP-128 fields surfaced in the top HUD bar.
- WP-064 complete. `<GameLogPanel />`, `<ReplayInspector />`, `<ReplayFileLoader />` exist and are preserved; this packet only extends `<GameLogPanel />` integration into the new layout.
- WP-065 complete. `vue-sfc-loader` registered for `node:test` so `.vue` SFC tests work.
- WP-089 complete. `LegendaryGame.playerView` wires the audience-filtered UIState through to clients.
- `docs/ai/DESIGN-BOARD-LAYOUT.md` exists at the SPEC commit (`277bcca`); the wireframe authority is loaded.
- `pnpm -r build` exits 0 on `main` HEAD.
- `pnpm --filter @legendary-arena/server test` and `pnpm --filter @legendary-arena/game-engine test` baselines green.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"` — confirms the arena-client may import the registry (type-only) and consumes `UIState` via the WP-089 projection; never imports `game-engine` runtime, never imports `server`.
- `docs/ai/DESIGN-BOARD-LAYOUT.md` — the entire wireframe; this packet implements §3.1 (desktop) and §3.2 (mobile portrait) wireframes; resolves the eight §7.2 questions; honors every §7.1 lock.
- `packages/game-engine/src/ui/uiState.types.ts` — read entirely (post-WP-128 shape); every new field is what this packet renders.
- `apps/arena-client/src/components/play/` — read every file. The WP-100 scaffolds are superseded — confirm the existing component tree before writing replacements.
- `apps/arena-client/src/components/hud/` — read every file. WP-062 HUD components are extended (not replaced) by this packet for the new HUD-bar contents (twist progress + tactics defeated + escape counter + skin selector).
- `apps/arena-client/src/lobby/LiveMatchView.vue` — read entirely. The active board layout replaces or coexists with the existing lobby/play view discriminator.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 13 (ESM only).
- `docs/ai/REFERENCE/01.4-pre-flight-invocation.md` — read the `defineComponent({ setup() { return {...} } })` rule (P6-30 / P6-46 / D-6512): any `.vue` component with a tested template using non-prop / non-emit bindings MUST use `defineComponent` form, not `<script setup>`.
- `.claude/rules/architecture.md` Layer Boundary section — the arena-client layer cannot import engine runtime.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` in client code — use the `ctx.random.*` projection if randomness is needed (it's not for this packet).
- Never persist `G`, `ctx`, or any runtime engine state from the client.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports.
- Test files use `.test.ts` extension — never `.test.mjs`.
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- This packet ONLY consumes the WP-128-extended `UIState`. It MUST NOT introduce new `G` fields, new engine projections, or new server endpoints. If a new field is needed, that's a separate predecessor WP.
- Engine runtime is never imported into the client. Type-only imports (`import type { UIState } from '@legendary-arena/game-engine'`) are permitted.
- Registry runtime is never imported into the client. The engine's `G.cardDisplayData` (projected through `UIState`) is the only display-data source.
- Card images load from R2 via the URLs already encoded in `UICardDisplay.imageUrl` per WP-111. The client does not compose URLs.
- Both viewports (desktop + mobile portrait) render from the **same `UIState`**. Different layouts, identical data flow. No viewport-specific data fetching.
- Stage-gating per WP-007A: every interactive element is enabled only when `game.currentStage` matches its allowed stage. Disabled state shows a tooltip explaining why.
- Cost-affordability gating: a Hero in HQ with cost > `economy.availableRecruit` renders disabled with a tooltip; same for villains in city with attack > `economy.availableAttack`. WP-128 ships the data; this packet adds the disabled-state rendering.
- The `[Pass priority]` button advances to `play.cleanup` without firing a move; the `[End turn]` button fires the `endTurn` move.
- The 3-step turn structure (per `DESIGN-BOARD-LAYOUT.md §5.1`) is the canonical turn-actions display. Every step shows its current stage; only the active step's affordances are at full prominence.
- Mobile portrait wireframe locks `48-char target width` for the design intent; the actual implementation uses CSS responsive units (rem, vw, vh) and adapts gracefully across the 375–414px range.
- Two-viewport DRY: shared component logic lives in headless composables (`useCityRow`, `useHqRow`, `useTurnActions`, etc.); per-viewport `.vue` files differ only in template + scoped CSS.
- `defineComponent({ setup() { return {...} } })` form REQUIRED for any tested non-leaf SFC under `vue-sfc-loader/register` — `<script setup>` only allowed for props-only-template components per P6-30 / P6-46 / D-6512.

**Session protocol:**
- If a wireframe item conflicts with the WP-128 projection contract, the projection contract wins. Surface the conflict and ask the human; do not invent a UI shape that requires a projection extension.
- The eight `[DECISION REQUIRED]` blocks (D-DEC-1..D-DEC-8) MUST be locked in writing before writing any production component file.

**Locked contract values (do not paraphrase):**
- **PlayerZones keys:** `deck` | `hand` | `discard` | `inPlay` | `victory`.
- **TurnStage values:** `'start'` | `'main'` | `'cleanup'`.
- **City visual column order (per DESIGN-BOARD-LAYOUT.md §7.1):** `Escaped Pile | Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck` (left-to-right).
- **HQ visual column order:** `Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck` (left-to-right).
- **Shared Decks visual order:** `Wounds | Horrors | Bystanders | S.H.I.E.L.D. Officers | Sidekicks` (left-to-right).
- **3-step turn structure:** Step 1 (`play.start`) Reveal villain → Step 2 (`play.main`) Play / Recruit / Fight → Step 3 (`play.cleanup`) End turn (discard + draw 6).

---

## Debuggability & Diagnostics

- Every interactive component must accept its UIState slice as a prop and emit move-intent events upward; container components compose move-emission into the WP-090 `submitMove` seam.
- Layout regions must be queryable via `data-testid` (recommended pattern per `DESIGN-BOARD-LAYOUT.md §9` item 4 — board-layout WP locks the test-id naming; this packet establishes the pattern).
- Disabled-state tooltips are testable via `aria-disabled` + `title` / `aria-describedby`; manual smoke confirms each disabled affordance shows a reason.
- The mobile portrait layout must degrade gracefully if a sticky-zone z-index conflicts with a modal — use Vue 3 Teleport for modals to keep them above sticky zones.

---

## Scope (In)

### A) Component tree under `apps/arena-client/src/components/play/`

Replace or extend the following WP-100 scaffolds; introduce new components for the new wireframe zones.

**Replaced / extended (existing):**
- `<HandRow>` — render `players[ownIndex].handCards` + `handDisplay`; click-to-play emits `playCard`.
- `<CityRow>` — render `city.spaces[0..4]` + `escapedPile` (col 0) + `villainDeckCount` (col 6 cell). 7-column visual.
- `<HQRow>` — render `hq.slots` + `hq.slotDisplay` + `heroDeckCount` (col 6 cell). 6-column visual.
- `<MastermindTile>` — render `mastermind.{id, display, tacticsRemaining, tacticsDefeated, attachedBystanders}`.
- `<TurnActionBar>` — render the locked 3-step turn structure per `DESIGN-BOARD-LAYOUT.md §5.1`.
- `<PlayView>` — top-level container; mounts everything.

**New:**
- `<SchemeTile>` — render `scheme.{id, twistCount}` + scenario twist threshold (read from registry metadata at mount).
- `<MasterStrikePile>` — render `mastermind.strikePile` (count + face-up top card + click-to-browse).
- `<SchemeTwistPile>` — render `scheme.twistPile` (count + face-up top card + click-to-browse).
- `<EscapedPile>` — render `city.escapedPile` (count + face-up top card + click-to-browse).
- `<SharedDecks>` — render the 5 face-down deck cells (`piles.{woundsCount, horrorsCount, bystandersCount, officersCount, sidekicksCount}`).
- `<KOPile>` — render `koPile.{count, topCard, cards}` (face-up; click-to-browse).
- `<OpponentPanel>` — render `players[i]` for `i !== ownIndex`; counts only; click `Victory: N ▼` reveals victory-pile drill-down via `<OpponentVictoryModal>`.
- `<OpponentVictoryModal>` — Vue 3 Teleport modal showing `players[i].victoryCards`.
- `<YourVictoryPile>` — render `players[ownIndex].{victoryCards, victoryVp}` + composition counters (computed at render time from `victoryCards[]` + registry metadata).
- `<YourDeckDiscardZone>` — render deck count (face-down annotation) + discard top card (face-up) + click-to-browse discard.
- `<EconomyBar>` — render `economy.{attack, recruit, availableAttack, availableRecruit, piercing, woundsDrawn}`.
- `<TopHudBar>` — render `game.{phase, turn, activePlayerId, currentStage}` + `progress.{bystandersRescued, escapedVillains}` + scheme/mastermind progress + skin-selector slot (reserved; populated by WP-130).
- `<GameLogPanel>` — already exists from WP-064; integrated into both viewports as a collapsible bottom-edge zone.

**Composables (headless logic shared across viewports):**
- `apps/arena-client/src/composables/useCityRow.ts` — exposes `cityCells[]` derived from `city.spaces` + `escapedPile` + `decks.villainDeckCount`.
- `apps/arena-client/src/composables/useHqRow.ts` — exposes `hqCells[]` derived from `hq.slots` + `hq.slotDisplay` + `decks.heroDeckCount`.
- `apps/arena-client/src/composables/useTurnActions.ts` — exposes per-stage affordance gating + the active step.
- `apps/arena-client/src/composables/useCardCostGating.ts` — pure helper returning `{ canRecruit(heroCard): boolean, canFight(villainCard): boolean }` from `economy` + card cost.
- `apps/arena-client/src/composables/useVictoryPileComposition.ts` — pure helper deriving composition counters from `victoryCards[]` + registry metadata.

### B) Per-viewport SFCs

- `apps/arena-client/src/pages/PlayDesktop.vue` — desktop landscape layout (mounts component tree per `§3.1` wireframe).
- `apps/arena-client/src/pages/PlayMobile.vue` — mobile portrait layout (mounts component tree per `§3.2` wireframe; sticky top + bottom; horizontal scroll for wide rows).
- `apps/arena-client/src/pages/PlayView.vue` — viewport discriminator: chooses `<PlayDesktop>` or `<PlayMobile>` based on `useViewport()` composable (CSS media-query observer).

### C) Per-component tests (`node:test` + `vue-sfc-loader/register`)

- One `.test.ts` per new SFC asserting:
  - Renders against a fixture `UIState`.
  - Emits the expected move on click affordance.
  - Disables affordance when stage gating fails (with tooltip reason).
  - Disables affordance when cost gating fails (with tooltip reason).
- Composable tests for `useCardCostGating`, `useVictoryPileComposition` — pure helpers, fully unit-testable.

### D) Resolve the 8 [DECISION REQUIRED] blocks

At session start, lock D-12901..D-12908 in DECISIONS.md per `DESIGN-BOARD-LAYOUT.md §7.2` recommended defaults (override allowed with rationale):
- D-12901 — Mastermind position (default: top-left)
- D-12902 — Opponent panel orientation (default: top-edge row 3-4 handed; left-edge column 5-handed)
- D-12903 — HQ slot count for non-MVP variants (default: 5 for MVP; gracefully extend to 6 when scenario uses it)
- D-12904 — In-play card persistence (default: persist through cleanup, animate to discard on End turn)
- D-12905 — Card-back representation (default: number-with-deck-icon; theme-overridable per WP-130)
- D-12906 — Scenario-specific composition counters discovery (default: derive from card effects in the loaded scenario; future `data/metadata/scenario-counters.json` if discovery fails)
- D-12907 — Re-skin / playmat selector (deferred to WP-130; D-12907 reserves the HUD-bar slot only)
- D-12908 — Pre-plan UI integration affordance (deferred per WP-059; D-12908 reserves the bottom-edge slot only)

### E) Integration into `apps/arena-client/src/App.vue`

- Extend `AppRoute` with `'play-desktop'` and `'play-mobile'` (or unify under single `'play'` with viewport discriminator).
- Wire `<PlayView>` into the lobby→play transition per existing WP-090 plumbing.
- WP-100 scaffolds removed once WP-129 components verify smoke; intermediate state preserves both during the transition WP execution and the WP-100 files are deleted in the same commit.

---

## Out of Scope

- No new `G` fields, no new engine projections, no new server endpoints. Predecessor WP-128 ships everything `UIState`-side.
- No animations (transitions, card-flip, draw, fight-impact) — flagged in `DESIGN-BOARD-LAYOUT.md §8.1` as deliberately out of scope.
- No re-skin / playmat selector — that's WP-130; this packet only reserves the HUD-bar slot.
- No pre-plan UI integration — that's WP-059 (currently deferred); this packet only reserves the bottom-edge slot.
- No drag-and-drop interactions — Legendary's MVP is click-to-play.
- No localization / i18n — English-only MVP per Vision §11.
- No spectator UI surface — sketched at low resolution in `DESIGN-BOARD-LAYOUT.md §6.2`; the wireframe describes the degraded mode but full spectator-mode is a future WP.
- No replay scrubber UI — `<ReplayInspector />` (WP-064) already owns that surface.
- No engine modifications.
- No registry modifications.
- Refactors / cleanups / "while I'm here" improvements are **out of scope** unless explicitly listed in Scope (In).

---

## Files Expected to Change

**New files (~13–18):**
- `apps/arena-client/src/pages/PlayDesktop.vue` — new
- `apps/arena-client/src/pages/PlayMobile.vue` — new
- `apps/arena-client/src/pages/PlayView.vue` — new (viewport discriminator)
- `apps/arena-client/src/components/play/SchemeTile.vue` — new
- `apps/arena-client/src/components/play/MasterStrikePile.vue` — new
- `apps/arena-client/src/components/play/SchemeTwistPile.vue` — new
- `apps/arena-client/src/components/play/EscapedPile.vue` — new
- `apps/arena-client/src/components/play/SharedDecks.vue` — new
- `apps/arena-client/src/components/play/KOPile.vue` — new
- `apps/arena-client/src/components/play/OpponentPanel.vue` — new
- `apps/arena-client/src/components/play/OpponentVictoryModal.vue` — new
- `apps/arena-client/src/components/play/YourVictoryPile.vue` — new
- `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` — new
- `apps/arena-client/src/components/play/EconomyBar.vue` — new
- `apps/arena-client/src/components/play/TopHudBar.vue` — new
- `apps/arena-client/src/composables/useCityRow.ts` — new
- `apps/arena-client/src/composables/useHqRow.ts` — new
- `apps/arena-client/src/composables/useTurnActions.ts` — new
- `apps/arena-client/src/composables/useCardCostGating.ts` — new
- `apps/arena-client/src/composables/useVictoryPileComposition.ts` — new
- `apps/arena-client/src/composables/useViewport.ts` — new (responsive viewport observer)
- (Plus `.test.ts` per SFC + per composable — ~16 test files)

**Modified (existing):**
- `apps/arena-client/src/App.vue` — extend `AppRoute`; wire `<PlayView>`.
- `apps/arena-client/src/components/play/HandRow.vue` — extended with `handDisplay` integration; cost-gating; stage-gating refinements.
- `apps/arena-client/src/components/play/CityRow.vue` — rewritten to 7-column visual + escaped pile + villain deck cell.
- `apps/arena-client/src/components/play/HQRow.vue` — rewritten to 6-column visual + hero deck cell.
- `apps/arena-client/src/components/play/MastermindTile.vue` — extended with `attachedBystanders` rendering.
- `apps/arena-client/src/components/play/TurnActionBar.vue` — rewritten as the 3-step structure.
- `apps/arena-client/src/components/play/PlayView.vue` — replaced by the new viewport discriminator (filename reused or moved).

**Governance:**
- `docs/ai/STATUS.md` — modified (new `### WP-129 / EC-132 Executed` block).
- `docs/ai/DECISIONS.md` — modified (D-12901..D-12908 inserted).
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-129 row flipped).
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-132 row flipped).

**Total projected:** ~30–40 files. Within range for a single execution session given the WP-104 / WP-109 precedent (14–21 files); this packet is on the larger side. **Backup plan if execution-time scope creeps:** split into WP-129a (Desktop) + WP-129b (Mobile) at draft amendment time.

---

## Acceptance Criteria

### A — Component tree

- [ ] All 13–18 new SFCs exist under `apps/arena-client/src/components/play/` and `apps/arena-client/src/pages/`.
- [ ] Every new SFC accepts its UIState slice as a typed prop.
- [ ] Every new SFC uses `defineComponent({ setup() { return {...} } })` form except props-only-template components.
- [ ] Every new SFC has a `.test.ts` sibling with `node:test` + `vue-sfc-loader/register` coverage.

### B — Two-viewport implementation

- [ ] `<PlayDesktop>` renders at 1280×800; matches `DESIGN-BOARD-LAYOUT.md §3.1` zone layout (manual smoke).
- [ ] `<PlayMobile>` renders at 375×667; matches `DESIGN-BOARD-LAYOUT.md §3.2` zone layout (manual smoke).
- [ ] `<PlayView>` discriminator switches at the locked CSS breakpoint (default: 768px; D-DEC-EXTRA at execution if alternative breakpoint chosen).
- [ ] Both viewports render the same fixture `UIState` correctly without divergent data flow.

### C — Click affordances (per `DESIGN-BOARD-LAYOUT.md §5.2`)

- [ ] Card in hand → `playCard` move emitted at `play.main` only; disabled at other stages with tooltip.
- [ ] City villain → `fightVillain` move; disabled when `attack < villain.cost` with tooltip.
- [ ] HQ hero → `recruitHero` move; disabled when `recruit < hero.cost` with tooltip.
- [ ] Mastermind tile → `fightMastermind` move; disabled when `attack < mastermind.attackCost` with tooltip.
- [ ] Reveal villain button → `revealVillainCard` move at `play.start` only.
- [ ] End turn button → `endTurn` move at `play.cleanup` only.

### D — Decision blocks

- [ ] D-12901..D-12908 inserted in DECISIONS.md in numeric order with rationale + rejected alternatives.
- [ ] D-12907 (re-skin) explicitly cites WP-130 as the deferred implementation packet.
- [ ] D-12908 (pre-plan) explicitly cites WP-059 as the deferred implementation packet.

### E — Tests

- [ ] `pnpm --filter arena-client test` exits 0; baseline grows by ≥30 tests across the new component / composable suite.
- [ ] No test imports `boardgame.io` runtime.
- [ ] No test imports `@legendary-arena/game-engine` runtime (type-only imports permitted).
- [ ] No test stubs `globalThis.fetch` or imports `MockAgent` from `undici`.

### F — Layer boundary

- [ ] No engine runtime import in any client file (verified by `Select-String`).
- [ ] No registry runtime import in any client file (verified by `Select-String`).
- [ ] No `Math.random()` in any client file.
- [ ] All card images load from `UICardDisplay.imageUrl` (verified by absence of URL composition logic in client files).

### Scope Enforcement

- [ ] No engine files modified (verified by `git diff packages/game-engine/`).
- [ ] No server files modified (verified by `git diff apps/server/`).
- [ ] No registry files modified (verified by `git diff packages/registry/`).
- [ ] No registry-viewer files modified (verified by `git diff apps/registry-viewer/`).
- [ ] No replay-producer files modified (verified by `git diff apps/replay-producer/`).
- [ ] No files outside `## Files Expected to Change` were modified (verified by `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — full monorepo build
pnpm -r build
# Expected: exits 0

# Step 2 — arena-client tests
pnpm --filter arena-client test
# Expected: pass N+30 / fail 0; baseline established at execution start

# Step 3 — engine tests (sanity — should be unchanged)
pnpm --filter @legendary-arena/game-engine test
# Expected: pass 604+N / fail 0 (same as post-WP-128)

# Step 4 — confirm no engine runtime import in client
Select-String -Path "apps\arena-client\src" -Pattern "from ['\"]@legendary-arena/game-engine['\"]" -Recurse
# Expected: only `import type` matches (or no matches)

# Step 5 — confirm no registry runtime import in client
Select-String -Path "apps\arena-client\src" -Pattern "from ['\"]@legendary-arena/registry['\"]" -Recurse
# Expected: only `import type` matches (or no matches)

# Step 6 — confirm no Math.random in client
Select-String -Path "apps\arena-client\src" -Pattern "Math\.random" -Recurse
# Expected: no output

# Step 7 — confirm scope-locked files unchanged
git diff --name-only packages/ apps/server apps/registry-viewer apps/replay-producer
# Expected: no output

# Step 8 — confirm WP-100 scaffolds rewritten or removed (manual review)
git diff apps/arena-client/src/components/play/
# Expected: visible deletions / rewrites of WP-100 scaffolds

# Step 9 — manual smoke: load PlayDesktop fixture at 1920×1080
# Expected: every zone from DESIGN-BOARD-LAYOUT.md §3.1 visible
# Expected: turn actions stage-gated correctly across stages

# Step 10 — manual smoke: load PlayMobile fixture at 375×667
# Expected: every zone from DESIGN-BOARD-LAYOUT.md §3.2 visible
# Expected: sticky top + bottom zones; horizontal scroll on wide rows
```

---

## Vision Alignment

§3 (Player Trust & Fairness): preserved — every UI affordance is stage-gated and cost-gated; disabled states explain why; no information leakage beyond the WP-029 audience filter. §4 (Faithful Multiplayer Experience): aligned — the 3-step turn structure mirrors physical Marvel Legendary; cooperative posture preserved (no PvP framing). §10 (Content as Data): aligned — every card render goes through `UICardDisplay` projected from registry data via `G.cardDisplayData` per WP-111. §11 (Stateless Client Philosophy): aligned — clients render `UIState` as-projected; no engine queries. §14 (Explicit Decisions, No Silent Drift): preserved — D-12901..D-12908 surface every layout choice. NG-1 (no monetization): not crossed. NG-3 (no engine network): preserved (no engine modifications). NG-6 (deterministic engine): preserved trivially (no engine touch). **Determinism preservation:** N/A at the engine layer; client-side rendering is non-deterministic by definition (mouse/touch events). **§20 Funding Surface Gate: N/A** with explicit justification (gameplay surface; no funding-adjacent UI). **§21 API Catalog: N/A** (no `apps/server/**` files touched).

---

## Definition of Done

- [ ] All §Acceptance Criteria pass.
- [ ] `pnpm -r build` exits 0.
- [ ] arena-client baseline grows by ≥30 tests across new component / composable suite; engine baseline UNCHANGED post-WP-128.
- [ ] D-12901..D-12908 inserted in DECISIONS.md.
- [ ] STATUS.md `### WP-129 / EC-132 Executed` block at top of `## Current State`.
- [ ] WORK_INDEX.md WP-129 row checked off with date + commit hash.
- [ ] EC_INDEX.md EC-132 row flipped Draft → Done.
- [ ] 01.6 post-mortem OPTIONAL per the WP-066 / WP-094 / WP-096 / WP-114 / WP-121..125 viewer-side precedent — author at execution if D-12901..D-12908 surface tension worth capturing.
- [ ] Single `EC-132:` commit with the locked file count (~30–40 files; backup-plan splits at draft amendment time if scope creeps).
