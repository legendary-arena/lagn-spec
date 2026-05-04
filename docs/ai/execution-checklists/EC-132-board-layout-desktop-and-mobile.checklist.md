# EC-132 — Board Layout (Desktop Landscape + Mobile Portrait) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-129-board-layout-desktop-and-mobile.md
**Layer:** Client UI (`apps/arena-client/src/components/play/` + `apps/arena-client/src/composables/` + `apps/arena-client/src/pages/`)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-129.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-129.

---

## §0 — Pre-Flight

- [ ] WP-128 / EC-131 executed and shipped on `main`. UIState extension fields (`UIDecksState`, `UISharedPilesState`, `UIKoPileState`, `UIPlayerState.{inPlayCards?, inPlayDisplay?, discardTopCard?, victoryCards?, victoryVp?}`, `UIMastermindState.{attachedBystanders, strikePile}`, `UISchemeState.twistPile`, `UICityState.escapedPile`, `UITurnEconomyState.{piercing, woundsDrawn}`) verified by reading `packages/game-engine/src/ui/uiState.types.ts` at HEAD.
- [ ] Engine baseline post-WP-128 green; arena-client baseline established (run `pnpm --filter arena-client test`).
- [ ] WP-061 / WP-062 / WP-064 / WP-065 / WP-089 / WP-090 / WP-100 contract files present and reviewed.
- [ ] `docs/ai/DESIGN-BOARD-LAYOUT.md` present at HEAD; the SPEC commit (`277bcca`) loaded as non-normative input.
- [ ] Nine executor decisions (D-12901..D-12909 per WP-129 §Decision Points; D-12901..D-12909 from `DESIGN-BOARD-LAYOUT.md §7.2`, D-12909 the desktop/mobile viewport breakpoint promoted in WP-129) locked in writing at the start of the session before writing any production component file. D-12909 default: `@media (max-width: 767px)` → mobile, ≥768px → desktop; rationale + rejected alternatives (640px, 820px) recorded in DECISIONS.md.
- [ ] Backup-plan trigger: if at execution-start the file-count projection exceeds 18 production / reference files, surface a draft amendment proposing a WP-129a (Desktop) + WP-129b (Mobile) split before continuing.

## §1 — Scope Lock + File Allowlist

~30–40 files total at session close (split between new SFCs, modified WP-100 scaffolds, new composables, and four governance ledgers). Within the 12–21 range of recent precedents (WP-104 = 14, WP-109 = 21); approaching the upper bound. The session-close `git diff --name-only` is bounded by the `## Files Expected to Change` allowlist in WP-129.

`git diff --name-only` lists the projected set at session close. Any file outside the allowlist = scope creep = STOP.

## §2 — Locked Values (do not re-derive)

- City visual column order (left-to-right): `Escaped Pile | Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck` (7 cells).
- HQ visual column order (left-to-right): `Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck` (6 cells).
- Shared Decks visual order (left-to-right): `Wounds | Horrors | Bystanders | S.H.I.E.L.D. Officers | Sidekicks` (5 cells).
- 3-step turn structure: Step 1 (`play.start`) Reveal villain → Step 2 (`play.main`) Play / Recruit / Fight → Step 3 (`play.cleanup`) End turn (discard + draw 6).
- Move name mappings (per WP-100 / WP-008B):
  - Hand card → `playCard`
  - City villain → `fightVillain`
  - HQ hero → `recruitHero`
  - Mastermind tile → `fightMastermind`
  - Reveal villain button → `revealVillainCard`
  - End turn button → `endTurn`
- `defineComponent({ setup() { return {...} } })` form REQUIRED for any tested non-leaf SFC under `vue-sfc-loader/register`.
- **SFC authoring whitelist (mechanical):** `<script setup>` is permitted **only** for SFCs that satisfy **all** of: (a) props-only template (no emits), (b) no computed state, (c) no composable usage (`use*`), (d) no direct `.test.ts` sibling. Any SFC with emits OR computed state OR composables OR direct tests MUST use `defineComponent({ setup() { return {...} } })`.
  - WP-129 application: every `pages/*` SFC and every composer (`<TopHudBar>`, `<EconomyBar>`, `<TurnActionBar>`, `<OpponentPanel>`, `<YourVictoryPile>`, `<YourDeckDiscardZone>`) → `defineComponent`.
  - Pure leaf display SFCs (`<SchemeTile>`, `<MasterStrikePile>`, `<SchemeTwistPile>`, `<EscapedPile>`, `<SharedDecks>`, `<KOPile>`, `<OpponentVictoryModal>`) MAY use `<script setup>` provided they satisfy (a)-(d).
- **Page-level discriminator filename:** the viewport discriminator lives at `apps/arena-client/src/pages/PlayViewport.vue` (NOT `pages/PlayView.vue` — the basename `PlayView` is reserved for the WP-100 `components/play/PlayView.vue` file that this EC deletes; reusing the basename in `pages/` would create import-path confusion across ~30 files).

## §3 — Guardrails

- No engine runtime import in any client file. Type-only imports (`import type { UIState } from '@legendary-arena/game-engine'`) are permitted.
- No registry runtime import in any client file. Display data flows through `UICardDisplay` (already populated by `G.cardDisplayData` per WP-111).
- No `Math.random()` / `Date.now()` non-deterministic reads in components. Mouse / touch events are inherently non-deterministic but client code does not introduce additional sources.
- No engine, server, registry, or replay-producer files modified (this is a client-only WP).
- Stage gating per WP-007A: every interactive element is enabled only when `game.currentStage` matches its allowed stage. Disabled state shows `aria-disabled="true"` + a tooltip explaining why.
- Cost gating: heroes in HQ with cost > `economy.availableRecruit` render disabled with tooltip; villains in city with attack > `economy.availableAttack` render disabled with tooltip.
- **Disabled-state tooltip precedence (locked):** when multiple disable conditions apply, only the highest-priority reason is shown. Order: (1) stage gating → (2) resource affordability → (3) structural lock (not active player, etc.). Implemented once in the gating composables (`useTurnActions`, `useCardCostGating`); components bind the returned reason — they do NOT compose tooltips ad-hoc.
- Both viewports render from the same `UIState`. Different layouts, identical data flow.
- Two-viewport DRY: shared logic lives in headless composables; per-viewport SFCs differ only in template + scoped CSS.
- WP-100 scaffolds are superseded — file deletions are part of this WP's commit (not preserved as parallel structures).
- Vue 3 Teleport for modals (`<OpponentVictoryModal>`, victory-pile drill-down, KO-pile drill-down, etc.) — keeps modals above sticky zones in the mobile portrait layout.

## §4 — Required `// why:` Comments

- Each new SFC module-header JSDoc: cite WP-129 + the specific `DESIGN-BOARD-LAYOUT.md` zone it implements.
- Composable module-header JSDoc: cite WP-128 fields it consumes.
- `useViewport.ts` breakpoint-value site: cite **D-12909** (`max-width: 767px` → mobile; ≥768px → desktop) — locked at session start, before any production component file is written.
- Each `defineComponent` non-leaf component: cite P6-30 / P6-46 / D-6512 (the vue-sfc-loader separate-compile rule).
- Disabled-state tooltip site for cost gating: cite the WP-128 economy-projection field consumed.
- 3-step turn-actions panel: cite `DESIGN-BOARD-LAYOUT.md §5.1`.
- City row 7-cell layout: cite `DESIGN-BOARD-LAYOUT.md §7.1` (the locked column order).
- HQ row 6-cell layout: cite `DESIGN-BOARD-LAYOUT.md §7.1`.
- Shared Decks 5-cell row: cite `DESIGN-BOARD-LAYOUT.md §7.1` (Horrors as 5th cell).
- Re-skin slot reservation: cite WP-130 as the deferred implementation.
- Pre-plan affordance reservation: cite WP-059 as the deferred implementation.

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter arena-client test` exits 0; baseline grows by ≥30 tests across new SFCs + composables. **Leaf-aggregation allowance:** purely presentational leaf SFCs (no emits, no composables, no computed state) MAY be covered by their parent's `.test.ts` rather than a direct sibling. Concrete WP-129 candidates: `<MasterStrikePile>`, `<SchemeTwistPile>`, `<EscapedPile>`, `<SharedDecks>`, `<KOPile>`, `<OpponentVictoryModal>`, `<SchemeTile>`. The ≥30-test floor still applies.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (UNCHANGED — engine never touched).
- [ ] No engine runtime import in client: `Select-String -Path "apps\arena-client\src" -Pattern "from ['""]@legendary-arena/game-engine['""]" -Recurse | Where-Object { $_ -notmatch 'import type' }` returns no output.
- [ ] No registry runtime import in client: `Select-String -Path "apps\arena-client\src" -Pattern "from ['""]@legendary-arena/registry['""]" -Recurse | Where-Object { $_ -notmatch 'import type' }` returns no output.
- [ ] No `Math.random()` in client: `Select-String -Path "apps\arena-client\src" -Pattern "Math\.random" -Recurse` returns no output.
- [ ] No `boardgame.io` import in client (other than the existing WP-090 client transport seam): `Select-String -Path "apps\arena-client\src\components\play","apps\arena-client\src\pages","apps\arena-client\src\composables" -Pattern "from ['""]boardgame\.io" -Recurse` returns no output.
- [ ] No URL composition logic in components: `Select-String -Path "apps\arena-client\src\components\play" -Pattern "imageUrl\s*=\s*['""]https?:" -Recurse` returns no output (URLs come from `UICardDisplay.imageUrl`).
- [ ] No engine / server / registry / registry-viewer / replay-producer file modified: `git diff --name-only packages/ apps/server apps/registry-viewer apps/replay-producer` returns no output.
- [ ] D-12901..D-12909 inserted in DECISIONS.md in numeric order.
- [ ] D-12907 (re-skin) reserves the slot only; cites WP-130 as the implementation packet.
- [ ] D-12908 (pre-plan) reserves the slot only; cites WP-059 as the implementation packet.
- [ ] Manual smoke: `<PlayDesktop>` rendered at 1920×1080 shows every zone from `DESIGN-BOARD-LAYOUT.md §3.1`.
- [ ] Manual smoke: `<PlayMobile>` rendered at 375×667 shows every zone from `DESIGN-BOARD-LAYOUT.md §3.2`; sticky top + bottom verified; horizontal scroll on wide rows verified.
- [ ] Manual smoke: turn-actions panel shows 3-step structure; only the active stage's affordances are full-prominence.
- [ ] Manual smoke: clicking a card in hand at `play.main` fires `playCard`; clicking same card at `play.start` is disabled with tooltip.
- [ ] Manual smoke: HQ hero with cost > `availableRecruit` renders disabled with tooltip.
- [ ] Manual smoke: opponent panel `Victory: N ▼` opens `<OpponentVictoryModal>` with the opponent's full victory-pile contents.

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-132:`. Code under `apps/arena-client/` is staged → SPEC: prefix forbidden per `01.3` Rule 5.
- [ ] Vision trailer: `Vision: §3, §4, §10, §11, §14, NG-1, NG-3, NG-6` per `01.3` convention.
- [ ] No `--no-verify`, no `--no-gpg-sign`.

## §7 — Post-Execution Checks

- [ ] All WP-129 §Acceptance Criteria pass.
- [ ] D-12901..D-12909 entries with rationale + rejected alternatives.
- [ ] 01.6 post-mortem OPTIONAL — author if any of the 8 D-decisions surfaced tension worth capturing or if the desktop/mobile DRY pattern surfaces a new abstraction worth documenting.
- [ ] STATUS.md execution block cites the 8 DECISIONS + the new component tree + the 3-step turn structure + the 7-cell city + the inline-deck pattern + the WP-100 scaffold supersession.
- [ ] WORK_INDEX.md WP-129 row checked off with date + commit hash.
- [ ] EC_INDEX.md EC-132 row flipped `Draft` → `Done {YYYY-MM-DD}`.

## Common Failure Smells

- WP-100 scaffolds preserved alongside new components → component-tree duplication; STOP and remove.
- New page discriminator created at `pages/PlayView.vue` instead of `pages/PlayViewport.vue` → import-path collision with the deleted WP-100 `components/play/PlayView.vue`; STOP and rename to `PlayViewport.vue`.
- `<script setup>` used for an SFC that emits, runs a composable, has computed state, OR has a direct `.test.ts` → P6-30 / P6-46 / D-6512 violated; switch to `defineComponent({ setup() { return {...} } })`.
- Tooltip composed ad-hoc in a template instead of bound from `useTurnActions` / `useCardCostGating` → tooltip-precedence rule violated; refactor to consume the composable's returned reason.
- D-12909 (breakpoint) deferred to "we'll pick at the end" → bikeshedding risk; STOP, lock the value before the first production file write.
- Engine runtime imported into a client SFC for a "convenient helper" → layer-boundary violated; refactor to consume `UIState` only.
- Registry runtime imported for "card data" → layer boundary violated; the data is already in `UICardDisplay`.
- `<script setup>` used for a tested non-leaf component → P6-30 / P6-46 / D-6512 violated; switch to `defineComponent({ setup() { return {...} } })`.
- Cost gating computed inline in templates → DRY violation; extract to `useCardCostGating` composable.
- Desktop and mobile have divergent data flow → wireframe parity broken; both viewports must consume identical `UIState`.
- Disabled affordance with no tooltip → user can't tell why their click didn't fire; WP-100 "never silently no-op" pattern violated.
- Animations / transitions added for "polish" → out of scope per `DESIGN-BOARD-LAYOUT.md §8.1`; STOP and defer.
- Re-skin selector implemented inline → that's WP-130; WP-129 reserves only the HUD-bar slot.
- Pre-plan affordance implemented inline → that's WP-059; WP-129 reserves only the bottom-edge slot.
- File-count > 18 production / reference at execution start → backup-plan trigger; surface draft-amendment proposal for WP-129a/-129b split.
