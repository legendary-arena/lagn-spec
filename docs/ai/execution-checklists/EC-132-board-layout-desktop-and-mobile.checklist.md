# EC-132 — Board Layout (Desktop Landscape + Mobile Portrait) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-129-board-layout-desktop-and-mobile.md
**Layer:** Client UI (`apps/arena-client/src/components/play/` + `apps/arena-client/src/composables/` + `apps/arena-client/src/pages/`)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-129.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-129.

---

## §0 — Pre-Flight

- [ ] WP-128 / EC-131 executed (commit `c44f539` 2026-05-04 on branch `wp-128-uistate-projection-extensions`). **Per pre-flight PS-1 2026-05-04 — "shipped on main" wording relaxed:** WP-129 may branch from `wp-128-uistate-projection-extensions` and land on `main` in one merge (transitive shipping); merging WP-128 to `main` first is the alternative-acceptable path. UIState extension fields (`UIDecksState`, `UISharedPilesState`, `UIKoPileState`, `UIPlayerState.{inPlayCards?, inPlayDisplay?, discardTopCard?, victoryCards?, victoryVP?}`, `UIMastermindState.{attachedBystanders, strikePile}`, `UISchemeState.twistPile`, `UICityState.escapedPile`, `UITurnEconomyState.{piercing, woundsDrawn}`) verified by reading `packages/game-engine/src/ui/uiState.types.ts` at HEAD. Casing aligned with engine canonical (`victoryVP` per `PlayerScoreBreakdown.totalVP` and `00.6` Rule 14; the WP-128 doc-hygiene commit `c23a05a` swept this in EC_INDEX).
- [ ] Engine baseline post-WP-128 green: **621 / 135 / 0** at HEAD `c23a05a`. **arena-client pre-execution baseline locked at 182 / 17 / 0 at HEAD `c23a05a`** per pre-flight PS-7 2026-05-04 (post-execution floor: ≥212 tests / ≥23 suites / 0 fail).
- [ ] WP-061 / WP-062 / WP-064 / WP-065 / WP-089 / WP-090 / WP-100 contract files present and reviewed.
- [ ] `docs/ai/DESIGN-BOARD-LAYOUT.md` present at HEAD; the SPEC commit (`277bcca`) loaded as non-normative input.
- [ ] Nine executor decisions (D-12901..D-12909 per WP-129 §Decision Points; D-12901..D-12908 from `DESIGN-BOARD-LAYOUT.md §7.2`, D-12909 the desktop/mobile viewport breakpoint promoted in WP-129) locked in writing at the start of the session before writing any production component file. D-12909 default: `@media (max-width: 767px)` → mobile, ≥768px → desktop; rationale + rejected alternatives (640px, 820px) recorded in DECISIONS.md.
- [x] Backup-plan trigger fired at draft (28 production/reference > 18-file trigger); pre-flight PS-3 2026-05-04 chose **path (b) keep-as-one with tightened scope discipline** rather than split into WP-129a / WP-129b. Rationale documented in WP-129 §Files Expected to Change Backup-plan disposition block (load-bearing leafs + composables shared across viewports; net-zero risk reduction from split).
- [ ] **Hard amendment trigger:** if at execution-start the file count projects above **33 production/reference** files (i.e., scope grew between draft and start), STOP and re-evaluate the split. The 28-file draft projection is the locked baseline.
- [ ] Pre-session blocking-fix Pre-Session Actions resolved (PS-1..PS-7 from pre-flight 2026-05-04 + copilot RISKs 15 / 22 / 25 / 30). Resolution log lives in the session prompt §Pre-Session Actions section per copilot check item 30.

## §1 — Scope Lock + File Allowlist

~48 files total at session close (~28 production/reference + ~16 tests + 4 governance). **Above the recent-precedent envelope** (WP-104 = 14, WP-109 = 21); EC-132 §0 18-file backup-plan trigger fired and resolved as path (b) keep-as-one (see WP-129 §Files Expected to Change Backup-plan disposition). The session-close `git diff --name-only` is bounded by the `## Files Expected to Change` allowlist in WP-129; the §0 hard amendment trigger (≥34 production/reference at execution-start) is the structural circuit-breaker.

`git diff --name-only` lists the projected set at session close. Any file outside the allowlist = scope creep = STOP.

## §2 — Locked Values (do not re-derive)

- City visual column order (left-to-right): `Escaped Pile | Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck` (7 cells).
- HQ visual column order (left-to-right): `Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck` (6 cells).
- Shared Decks visual order (left-to-right): `Wounds | Horrors | Bystanders | S.H.I.E.L.D. Officers | Sidekicks` (5 cells).
- 3-step turn structure: Step 1 (`play.start`) Reveal villain → Step 2 (`play.main`) Play / Recruit / Fight → Step 3 (`play.cleanup`) End turn (discard + draw 6).
- Move name mappings (per WP-100 / WP-008B / D-10011):
  - Hand card → `playCard`
  - City villain → `fightVillain`
  - HQ hero → `recruitHero`
  - Mastermind tile → `fightMastermind`
  - Reveal villain button → `revealVillainCard`
  - Pass-priority button → `advanceStage` (canonical stage-advance per D-10011 — NOT a no-op; per pre-flight PS-5 2026-05-04)
  - End turn button → `endTurn`
- `defineComponent({ setup() { return {...} } })` form REQUIRED for any tested non-leaf SFC under `vue-sfc-loader/register`.
- **SFC authoring whitelist (mechanical):** `<script setup>` is permitted **only** for SFCs that satisfy **all** of: (a) props-only template (no emits), (b) no computed state, (c) no composable usage (`use*`), (d) no direct `.test.ts` sibling. Any SFC with emits OR computed state OR composables OR direct tests MUST use `defineComponent({ setup() { return {...} } })`.
  - WP-129 application: every `pages/*` SFC and every composer (`<TopHudBar>`, `<EconomyBar>`, `<TurnActionBar>`, `<OpponentPanel>`, `<YourVictoryPile>`, `<YourDeckDiscardZone>`) → `defineComponent`.
  - Pure leaf display SFCs (`<SchemeTile>`, `<MasterStrikePile>`, `<SchemeTwistPile>`, `<EscapedPile>`, `<SharedDecks>`, `<KOPile>`, `<OpponentVictoryModal>`) MAY use `<script setup>` provided they satisfy (a)-(d).
- **Page-level discriminator filename:** the viewport discriminator lives at `apps/arena-client/src/pages/PlayViewport.vue` (NOT `pages/PlayView.vue` — the basename `PlayView` is reserved for the WP-100 `components/play/PlayView.vue` file that this EC deletes; reusing the basename in `pages/` would create import-path confusion across ~30 files).
- **`useViewport` single-responsibility (locked per copilot RISK 25 2026-05-04):** `useViewport()` exposes ONLY `{ isMobile: Ref<boolean>, isDesktop: Ref<boolean> }`. The breakpoint constant `BREAKPOINT_MOBILE_MAX_PX = 767` is exported from the same file with the **D-12909 `// why:` comment on the constant declaration site** (NOT on the watcher logic). This lets `<PlayViewport>` and tests import the constant for assertions without re-deriving the value, and keeps the responsibility ladder explicit: constant declaration owns the D-12909 rationale; the watcher only consumes it.
- **Pass-priority button vs end-turn button (PS-5 lock):** `<TurnActionBar>` Step 3 (`play.cleanup`) exposes TWO affordances — `[Pass priority]` fires `advanceStage` (advances stage `start → main → cleanup` per D-10011) and `[End turn]` fires `endTurn` (boardgame.io player rotation; only allowed at `play.cleanup`). The two are NOT interchangeable; do NOT model `[Pass priority]` as a no-op or as a client-side stage write.

## §3 — Guardrails

- No engine runtime import in any client file. Type-only imports (`import type { UIState } from '@legendary-arena/game-engine'`) are permitted.
- No registry runtime import in any client file. Display data flows through `UICardDisplay` (already populated by `G.cardDisplayData` per WP-111).
- No `Math.random()` / `Date.now()` non-deterministic reads in components. Mouse / touch events are inherently non-deterministic but client code does not introduce additional sources.
- No engine, server, registry, or replay-producer files modified (this is a client-only WP).
- Stage gating per WP-007A: every interactive element is enabled only when `game.currentStage` matches its allowed stage. Disabled state shows `aria-disabled="true"` + a tooltip explaining why.
- Cost gating: heroes in HQ with cost > `economy.availableRecruit` render disabled with tooltip; villains in city with attack > `economy.availableAttack` render disabled with tooltip.
- **Disabled-state tooltip precedence (locked):** when multiple disable conditions apply, only the highest-priority reason is shown. Order: (1) stage gating → (2) resource affordability → (3) structural lock (not active player, etc.). Implemented once in the gating composables (`useTurnActions`, `useCardCostGating`); components bind the returned reason — they do NOT compose tooltips ad-hoc.
- **Silent vs loud failure semantics (locked per copilot RISK 22 2026-05-04):** disabled-state tooltips are the **pre-emptive loud** path (the user sees why before clicking). If a stage-gated affordance somehow fires (e.g., stage advanced between gate evaluation and click), the engine's no-op return is the canonical **silent** path; WP-129 components MUST NOT add client-side `throw` / `alert` / `console.error` / debug surface in response. The WP-100 D-10003 prop-drilled `submitMove` seam is the sole engine-intent boundary; any failure that reaches it is owned by the engine, not the client. Verified by EC §5 grep gate: `Select-String -Path "apps\arena-client\src\components\play","apps\arena-client\src\pages" -Pattern "throw |alert\(|console\.(error|warn)" -Recurse` returns no output other than pre-existing call sites copied from WP-100 scaffolds (which themselves contain none).
- **Safe-skip surface awareness (locked per pre-flight PS-6 2026-05-04 — WP-128 / D-12806):** six new UIState fields ship as constant empty/zero values until future engine WPs back-fill them: `city.escapedPile` → `[]`, `mastermind.attachedBystanders` → `[]`, `mastermind.strikePile` → `[]`, `scheme.twistPile` → `[]`, `economy.piercing` → `0`, `economy.woundsDrawn` → `0`. WP-129 components rendering these zones will show empty/zero state in real games — by design — until each follow-up WP lands. Rules: (1) tests assert empty-state rendering, NOT stub-data rendering; (2) fixtures MUST mirror real engine output (no fake non-empty arrays); (3) each consuming SFC's JSDoc cites `// SAFE-SKIP-WP128` per D-12806 with the source field path; (4) when a future WP back-fills a field, the consuming SFC needs no behavioral change — only fixture/test updates.
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
- **Each disabled-affordance binding site (locked per copilot RISK 15 2026-05-04):** every call to `useTurnActions().reason` or `useCardCostGating().reason` consumed by a template's `aria-disabled` / `title` / `aria-describedby` binding cites the disabled-state tooltip precedence (EC §3 stage → resource → structural-lock order). This is the precedence rule's only enforcement at the call site; without the comment a future contributor may add a fourth condition without consulting the precedence ladder.

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter arena-client test` exits 0; **pre-execution baseline locked at 182 / 17 / 0 at HEAD `c23a05a`** (per pre-flight PS-7 2026-05-04). Post-execution floor: ≥212 tests / ≥23 suites / 0 fail (baseline grows by ≥30 tests across new SFCs + composables). **Leaf-aggregation allowance:** purely presentational leaf SFCs (no emits, no composables, no computed state) MAY be covered by their parent's `.test.ts` rather than a direct sibling. Concrete WP-129 candidates: `<MasterStrikePile>`, `<SchemeTwistPile>`, `<EscapedPile>`, `<SharedDecks>`, `<KOPile>`, `<OpponentVictoryModal>`, `<SchemeTile>`. The ≥30-test floor still applies.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (UNCHANGED — engine never touched). **Pre-execution baseline locked at 621 / 135 / 0 at HEAD `c23a05a`** per pre-flight PS-7 2026-05-04.
- [ ] No engine runtime import in client: `Select-String -Path "apps\arena-client\src" -Pattern "from ['""]@legendary-arena/game-engine['""]" -Recurse | Where-Object { $_ -notmatch 'import type' }` returns no output.
- [ ] No registry runtime import in client: `Select-String -Path "apps\arena-client\src" -Pattern "from ['""]@legendary-arena/registry['""]" -Recurse | Where-Object { $_ -notmatch 'import type' }` returns no output.
- [ ] No `Math.random()` in client: `Select-String -Path "apps\arena-client\src" -Pattern "Math\.random" -Recurse` returns no output.
- [ ] No `boardgame.io` import in client (other than the existing WP-090 client transport seam): `Select-String -Path "apps\arena-client\src\components\play","apps\arena-client\src\pages","apps\arena-client\src\composables" -Pattern "from ['""]boardgame\.io" -Recurse` returns no output.
- [ ] No URL composition logic in components: `Select-String -Path "apps\arena-client\src\components\play" -Pattern "imageUrl\s*=\s*['""]https?:" -Recurse` returns no output (URLs come from `UICardDisplay.imageUrl`).
- [ ] **No client-side loud-failure surface in new components** (per copilot RISK 22 silent/loud lock): `Select-String -Path "apps\arena-client\src\components\play","apps\arena-client\src\pages","apps\arena-client\src\composables" -Pattern "throw new |alert\(|console\.(error|warn)" -Recurse` returns no matches in WP-129-authored files. (Pre-existing matches in WP-100 scaffolds may remain — they are out of WP-129 scope.)
- [ ] **Safe-skip JSDoc citations present** (per pre-flight PS-6 — WP-128 / D-12806): every SFC consuming one of the six safe-skip fields (`city.escapedPile`, `mastermind.attachedBystanders`, `mastermind.strikePile`, `scheme.twistPile`, `economy.piercing`, `economy.woundsDrawn`) cites `// SAFE-SKIP-WP128` in its JSDoc with the source field path. `Select-String -Path "apps\arena-client\src\components\play","apps\arena-client\src\pages" -Pattern "SAFE-SKIP-WP128" -Recurse` returns ≥6 matches.
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
- [ ] D-12901..D-12909 entries with rationale + rejected alternatives (9 decisions; D-12909 is the desktop/mobile breakpoint).
- [ ] 01.6 post-mortem OPTIONAL — author if any of the 9 D-decisions surfaced tension worth capturing or if the desktop/mobile DRY pattern surfaces a new abstraction worth documenting.
- [ ] STATUS.md execution block cites the 9 DECISIONS + the new component tree + the 3-step turn structure + the 7-cell city + the inline-deck pattern + the WP-100 scaffold supersession.
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
