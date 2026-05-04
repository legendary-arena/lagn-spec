# EC-133 — Re-skin / Playmat Selector (Execution Checklist)

**Source:** docs/ai/work-packets/WP-130-reskin-playmat-selector.md
**Layer:** Client UI — preferences (`apps/arena-client/src/prefs/` + `apps/arena-client/src/components/play/` + `apps/arena-client/src/composables/`)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-130.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-130.

---

## §0 — Pre-Flight

- [ ] WP-129 / EC-132 executed and shipped on `main`. `<TopHudBar>` exists with the reserved skin-selector slot per D-12907.
- [ ] WP-061 / WP-068 contract files present and reviewed (Pinia bootstrap; preferences subsystem precedent).
- [ ] WP-121 (`useCardSize.ts`) + WP-124 (`useThemeSize.ts`) reviewed as single-key preferences pattern precedent.
- [ ] Five executor decisions (D-13001..D-13005 per WP-130 §"Resolve the 5 [DECISION REQUIRED] blocks" + `DESIGN-BOARD-LAYOUT.md §7.2 #7`) locked in writing at the start of the session before writing any production file.
- [ ] `pnpm -r build` exits 0; arena-client baseline established.
- [ ] Bundled skin assets available for D-13003 locked set (`classic`, `comic`, `minimal`) — confirm asset files exist in source-control or generation pipeline before writing the manifest.

## §1 — Scope Lock + File Allowlist

~16–22 files at session close (10–14 new + 3 modified + 4 governance + ~5 test files).

`git diff --name-only` lists the projected set at session close. Any file outside the WP-130 allowlist = scope creep = STOP.

## §2 — Locked Values (do not re-derive)

- Default skin name: `'classic'` (matches physical Marvel Legendary board art; also serves as fallback on asset-load failure per D-13005).
- Storage key: `'arenaClientPlaymatSkin'` (mirrors WP-121 `cardGridSize` / WP-124 `themeGridSize` naming convention).
- Pinia section name: `'playmat'`.
- Selector button label: desktop `🎨 Skin: <skinName> ▼`; mobile compact `🎨 <skinName> ▼`.
- Bundled skin set (D-13003): `classic` (default) | `comic` | `minimal`.
- Skin scope (D-13002): board background + color theme + card-frame style. Audio EXCLUDED.
- Discovery mechanism (D-13001): bundled with client at MVP. R2-published manifest is a future WP if demand emerges.
- Per-user persistence (D-13004): `localStorage` only. No server sync.
- Empty-state / asset-failure fallback (D-13005): unconditional fallback to `'classic'`; `console.warn` logs the failure per Rule 11.

## §3 — Guardrails

- The Pinia store + `localStorage` write never affect engine state, `UIState`, `G`, replay determinism, or `computeStateHash`.
- The skin selector is independent of game state — no `useUiStateStore` reads, no `G.*` reads, no `UIState.*` reads in skin code.
- No engine runtime import (only type-only imports if needed for typing).
- No socket transport involvement — `WP-090` `submitMove` and the client transport are NOT consulted by skin code.
- No animations / transitions on skin swap — instant CSS class toggle (animation out of scope per `DESIGN-BOARD-LAYOUT.md §8.1`).
- The selector overlay is a Vue 3 Teleport modal — keeps it above sticky zones.
- WP-064 D-6401 keyboard-focus pattern preserved: Escape closes overlay; outside-click closes overlay; tabindex on overlay root.
- Asset-load failures degrade gracefully to `'classic'` — never break the layout.
- `01.5 NOT INVOKED` (no engine state change).
- 01.6 post-mortem OPTIONAL per the WP-068 / WP-121 / WP-124 viewer-side precedent.

## §4 — Required `// why:` Comments

- `playmatSchema.ts` module-header JSDoc: cite WP-130 + D-13001 (bundled discovery) + D-13003 (bundled set).
- `playmatStore.ts` storage-key constant declaration: cite the WP-121 / WP-124 naming-convention precedent.
- `playmatStore.ts` corrupt-blob fallback site: cite Rule 11 full-sentence error message + D-13005 fallback to `'classic'`.
- `useSkinApplier.ts` watchEffect site: cite the Vue reactivity model (effect re-runs on `activeSkin` change).
- `useSkinApplier.ts` asset-load failure handler: cite D-13005 unconditional fallback.
- `<SkinSelector>` Teleport site: cite the mobile-portrait sticky-zone interaction (modal must render above sticky bottom-bar).
- `<SkinSelector>` close-on-Escape: cite WP-064 D-6401.
- Empty-state fallback site (`availableSkins.length === 0`): cite the empty-state policy from D-13005.

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter arena-client test` exits 0; baseline grows by ≥8 tests.
- [ ] `pnpm --filter @legendary-arena/game-engine test` UNCHANGED (engine never touched).
- [ ] No engine runtime import in skin code: `Select-String -Path "apps\arena-client\src\prefs","apps\arena-client\src\components\play\SkinSelector.vue","apps\arena-client\src\composables\useSkinApplier.ts" -Pattern "from ['""]@legendary-arena/game-engine['""]" -Recurse | Where-Object { $_ -notmatch 'import type' }` returns no output.
- [ ] No game-state reads in skin code: `Select-String -Path "apps\arena-client\src\prefs","apps\arena-client\src\components\play\SkinSelector.vue","apps\arena-client\src\composables\useSkinApplier.ts" -Pattern "useUiStateStore|G\.|UIState\." -Recurse` returns no output.
- [ ] No socket transport reference in skin code: `Select-String -Path "apps\arena-client\src\prefs","apps\arena-client\src\components\play\SkinSelector.vue" -Pattern "submitMove|boardgame\.io" -Recurse` returns no output.
- [ ] No `Math.random()` / `Date.now()` / `fetch(` in skin code: `Select-String -Path "apps\arena-client\src\prefs" -Pattern "Math\.random|Date\.now|fetch\(" -Recurse` returns no output.
- [ ] No engine / server / registry / registry-viewer / replay-producer files modified: `git diff --name-only packages/ apps/server apps/registry-viewer apps/replay-producer` returns no output.
- [ ] D-13001..D-13005 inserted in DECISIONS.md in numeric order with rationale + rejected alternatives.
- [ ] D-13003 cites `classic` + `comic` + `minimal` as the locked bundled set.
- [ ] D-13004 cites WP-104 column-additive precedent as the not-taken path (server-side sync deferred).
- [ ] Manual smoke: HUD-bar selector renders the active skin name.
- [ ] Manual smoke: clicking selector opens overlay; overlay lists 3 bundled skins.
- [ ] Manual smoke: clicking a different skin updates the CSS class on `<PlayView>` root within one Vue tick.
- [ ] Manual smoke: reload page → selected skin persists.
- [ ] Manual smoke: manually corrupt `localStorage['arenaClientPlaymatSkin']` to a non-JSON string → reload → fallback to `'classic'` + `console.warn` logged.
- [ ] Manual smoke: Escape key closes overlay; outside-click closes overlay.
- [ ] Manual smoke: mobile portrait viewport (375×667) renders compact selector form.

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-133:`. Code under `apps/arena-client/` is staged → SPEC: prefix forbidden per `01.3` Rule 5.
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6` per `01.3` convention.
- [ ] No `--no-verify`, no `--no-gpg-sign`.

## §7 — Post-Execution Checks

- [ ] All WP-130 §Acceptance Criteria pass.
- [ ] D-13001..D-13005 entries with rationale + rejected alternatives.
- [ ] STATUS.md `### WP-130 / EC-133 Executed` block.
- [ ] WORK_INDEX.md WP-130 row checked off.
- [ ] EC_INDEX.md EC-133 row flipped Draft → Done.
- [ ] 01.6 post-mortem OPTIONAL — author if any of the 5 D-decisions surfaced tension worth capturing or if the bundled-vs-R2 discovery split surfaces a new pattern worth documenting.

## Common Failure Smells

- Skin selection persisted via socket → server-side sync introduced; D-13004 violated; STOP and remove.
- Skin state mutation on `useUiStateStore` → game-state contamination; STOP and refactor.
- R2 manifest fetched at MVP → D-13001 violated (bundled is the locked default); defer R2 to a future expansion WP.
- Animation added on skin swap → `DESIGN-BOARD-LAYOUT.md §8.1` violated; STOP and remove.
- Asset-load failure crashes the layout → D-13005 graceful-fallback violated; refactor to fall back to `'classic'`.
- Schema accepts unknown skin name → schema validation gap; tighten the Zod enum.
- Selector mounted in a fixed position instead of the WP-129-reserved slot → WP-129 D-12907 contract violated.
- Premium / paid skin surface introduced → §20 Funding Surface Gate triggered without applicability declaration; STOP and either remove the surface or amend the WP draft to declare §20 applicability.
- `localStorage` write happens on every reactive update (not coalesced) → write-amplification; gate with `watchEffect` cleanup or single-write-on-set.
