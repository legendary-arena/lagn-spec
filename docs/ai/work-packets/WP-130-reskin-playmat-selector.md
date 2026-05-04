# WP-130 — Re-skin / Playmat Selector

**Status:** Ready (deferrable — lower priority than WP-128 / WP-129)
**Primary Layer:** Client UI — preferences (`apps/arena-client/src/prefs/` + `apps/arena-client/src/components/play/`)
**Dependencies:** WP-129 (board layout — reserves the HUD-bar skin-selector slot under D-12907); WP-061 (Pinia bootstrap); WP-068 (preferences subsystem precedent in `apps/registry-viewer/src/prefs/`)

---

## Session Context

WP-129 reserves the HUD-bar skin-selector slot under D-12907 but defers implementation; this packet ships the actual re-skin / playmat selector affordance — a Pinia-backed preferences store, an asset-discovery mechanism, and a HUD-bar-mounted selector overlay — following the WP-068 / WP-121 / WP-124 precedent for client-local preferences (Pinia + `localStorage`).

---

## Goal

After this packet, the active player can change the visual chrome of `<PlayDesktop>` and `<PlayMobile>` (board background art, color theme, optional card-frame style) by clicking the `🎨 Skin: <name> ▼` button in the top HUD bar. The selection persists across sessions via `localStorage`. Skins are discovered from a bundled list (MVP) with R2-published manifest as a future extension. Selection NEVER affects engine state, replay determinism, or any audience-filtered field. The five sub-decisions from `DESIGN-BOARD-LAYOUT.md §7.2 #7` are locked at execution as `D-13001..D-13005`.

---

## Assumes

- WP-129 / EC-132 executed and shipped on `main`. Specifically:
  - `<TopHudBar>` exists and includes a reserved slot for the skin selector (D-12907).
  - `<PlayDesktop>` and `<PlayMobile>` mount `<TopHudBar>` as the top-edge zone.
  - `apps/arena-client/src/prefs/` may or may not exist depending on D-13002 (per-WP-068-pattern decision); confirm before assuming.
- WP-061 complete. Vue 3 + Vite + Pinia bootstrap; `createPinia()` wired.
- WP-068 complete. The registry-viewer's preferences subsystem (`apps/registry-viewer/src/prefs/`) is the cross-app precedent — same pattern transplants to `apps/arena-client/src/prefs/`.
- `pnpm -r build` exits 0 on `main` HEAD.
- `pnpm --filter arena-client test` baseline established post-WP-129.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"` — confirms the arena-client preferences subsystem must not affect engine state or replay determinism.
- `docs/ai/DESIGN-BOARD-LAYOUT.md §7.2 #7` — the five locked sub-decisions for the re-skin selector. This packet's `D-13001..D-13005` resolve them.
- `docs/ai/DESIGN-BOARD-LAYOUT.md §6.4 + §3.2` — the mobile-portrait HUD-bar shape; the skin selector must compress for portrait.
- `apps/registry-viewer/src/prefs/` — the WP-068 / D-1414 precedent. Read `createPreferencesStore.ts`, `persistence.ts`, `sectionRegistry.ts`, `usePreferences.ts`, and any `*.schema.ts` files. This packet mirrors the pattern in `apps/arena-client/src/prefs/`.
- `apps/registry-viewer/src/composables/useCardSize.ts` (WP-121) and `useThemeSize.ts` (WP-124) — single-key preferences pattern with `localStorage` persistence; this packet's selector is similar shape, more keys.
- `apps/arena-client/src/components/play/TopHudBar.vue` (post-WP-129) — read entirely; the selector mounts here.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4, Rule 6, Rule 13.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` in client code.
- Never persist `G`, `ctx`, or any runtime engine state.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports.
- Test files use `.test.ts` extension — never `.test.mjs`.
- Full file contents for every new or modified file in the output.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- The skin selector is **client-local preferences only**. It MUST NOT:
  - Affect `UIState`, `G`, or any engine-side state.
  - Be persisted in `legendary.player_profiles` (server-side persistence is a future WP if user-sync demand emerges; this packet defers it).
  - Be persisted to a server endpoint.
  - Be sent over the WP-090 socket transport.
  - Influence replay determinism or `computeStateHash`.
- The Pinia store mirrors the WP-068 `createPreferencesStore` pattern: typed sections, schema validation, `localStorage` persistence with corruption-safe fallback.
- The HUD-bar selector renders only when the bundled skin list (D-13001) is non-empty. Empty-state fallback shows a disabled `🎨 (default)` chip with a tooltip.
- The "Default" skin (D-13003) is ALWAYS available — both as the default selection on first launch and as the unconditional fallback when an asset load fails.
- Skin assets (board background, card frames) load from R2 via known URL paths OR from bundled-with-the-client static assets (D-13001 lock).
- Asset-load failures degrade gracefully to the Default skin — never break the layout.
- The selector overlay is a Vue 3 Teleport modal — keeps it above the wireframe's sticky zones in mobile portrait.
- The selector closes on overlay-click, Escape key, or skin selection. WP-064 D-6401 keyboard-focus pattern preserved.
- No animations / transitions on skin swap — instant CSS class toggle (animation is out of scope per `DESIGN-BOARD-LAYOUT.md §8.1`).
- 01.5 NOT INVOKED (no engine state change).

**Session protocol:**
- The five `[DECISION REQUIRED]` blocks (D-13001..D-13005) MUST be locked in writing before writing any production file.

**Locked contract values (do not paraphrase):**
- **Default skin name:** `'classic'` (matches physical Marvel Legendary board art).
- **Storage key:** `'arenaClientPlaymatSkin'` (mirrors `cardGridSize` / `themeGridSize` naming convention).
- **Pinia section name:** `playmat`.
- **Selector button label:** `🎨 Skin: <skinName> ▼` (desktop); `🎨 <skinName> ▼` (mobile compact).

---

## Debuggability & Diagnostics

- Skin changes are testable via the Pinia store: assert `store.activeSkin === 'classic'` initially, simulate selection, assert `store.activeSkin === 'comic'`, assert `localStorage` round-trip.
- Asset-load failures must log a `console.warn` with full-sentence reason per Rule 11.
- Empty-state and corrupt-`localStorage` fallback paths are unit-testable.

---

## Scope (In)

### A) Pinia preferences store

- **`apps/arena-client/src/prefs/playmatSchema.ts`** — new — Zod schema for the playmat preferences section: `{ activeSkin: SkinName, customizations?: { /* future */ } }`. `SkinName` is a closed-set Zod enum derived from the bundled skin list.
- **`apps/arena-client/src/prefs/playmatStore.ts`** — new — Pinia store + composable `usePlaymat()` exposing `{ activeSkin: Ref<SkinName>, setActiveSkin(name: SkinName): void, availableSkins: readonly SkinName[] }`.
- **`apps/arena-client/src/prefs/persistence.ts`** — new (or modified if a registry-viewer-style prefs subsystem already exists) — `localStorage` round-trip with corruption-safe fallback per WP-068 precedent.
- **`apps/arena-client/src/prefs/registerSections.ts`** — new — registers the `playmat` section + any future arena-client preference sections (analogous to registry-viewer's pattern).
- **`apps/arena-client/src/main.ts`** — modified — side-effect import `./prefs/registerSections.ts` after `createPinia()` per WP-068 precedent.

### B) Skin asset bundle (MVP)

- **`apps/arena-client/src/assets/skins/`** — new directory — bundled skin assets:
  - `classic/` — board-background.png, card-frame.png, theme.css (CSS variables for color palette).
  - `comic/` — alternative skin set (if D-13003 includes a second bundled option).
  - `minimal/` — high-contrast a11y-baseline skin (if D-13003 includes a third bundled option).
- **`apps/arena-client/src/prefs/skinManifest.ts`** — new — typed manifest mapping `SkinName` → asset paths. Generated at build time or hand-maintained per D-13001.

### C) Selector UI

- **`apps/arena-client/src/components/play/SkinSelector.vue`** — new — the HUD-bar mounted button + Vue 3 Teleport overlay listing available skins. Reads `usePlaymat()`; emits the new selection.
- **`apps/arena-client/src/components/play/TopHudBar.vue`** — modified — mount `<SkinSelector>` in the slot reserved by WP-129 / D-12907.

### D) Skin application

- **`apps/arena-client/src/composables/useSkinApplier.ts`** — new — composable that watches `activeSkin` and applies the corresponding CSS variables / class to the `<body>` or `<PlayView>` root element. Uses Vue's `watchEffect` to react to changes.
- **`apps/arena-client/src/pages/PlayView.vue`** — modified — invoke `useSkinApplier()` so skin changes propagate to both `<PlayDesktop>` and `<PlayMobile>`.

### E) Tests

Add `node:test` tests for:
- Pinia store: initial state, `setActiveSkin`, `localStorage` round-trip, corrupt-blob fallback, schema rejection of unknown skin name.
- `<SkinSelector>` SFC: renders with available skins, click-to-open overlay, click-to-select fires store update, escape-to-close.
- `useSkinApplier`: applies CSS class on mount; reacts to changes; degrades to default on asset-load failure.

### F) Resolve the 5 [DECISION REQUIRED] blocks

At session start, lock D-13001..D-13005 in DECISIONS.md:
- D-13001 — Discovery mechanism. **Recommended default:** bundled with client at MVP; R2-published manifest deferred to future expansion. Rationale: bundled is faster to ship and avoids R2 latency on every client load.
- D-13002 — Scope of a skin. **Recommended default:** board background + color theme + card-frame style. Audio is excluded.
- D-13003 — Default skin + bundled set. **Recommended default:** `'classic'` (default), `'comic'`, `'minimal'`. Three skins MVP.
- D-13004 — Per-user persistence. **Recommended default:** `localStorage` only; sync to `legendary.player_profiles` is a future WP if user demand emerges (per WP-104 column-additive precedent).
- D-13005 — Empty-state / asset-failure fallback. **Recommended default:** unconditional fallback to `'classic'` on any skin asset load failure; `console.warn` logs the failure.

---

## Out of Scope

- No engine modifications.
- No server modifications.
- No R2 manifest infrastructure (D-13001 default = bundled). Future WP if R2 publishing demand emerges.
- No audio / sound effects.
- No animations on skin swap.
- No per-component skin overrides — skins apply globally to the `<PlayView>` root.
- No skin editor / customization UI — the selector picks from the bundled list only.
- No server-side persistence of the selection (D-13004 default).
- No replay-relative skin overrides — replays render in the spectator's selected skin, not the original player's.
- Refactors of WP-068 or WP-121 / WP-124 prefs structures.
- Refactors of the WP-129 component tree beyond mounting `<SkinSelector>` in the reserved slot.

---

## Files Expected to Change

**New files (~10–14):**
- `apps/arena-client/src/prefs/playmatSchema.ts` — new
- `apps/arena-client/src/prefs/playmatStore.ts` — new
- `apps/arena-client/src/prefs/persistence.ts` — new (if not already present from a prior arena-client prefs WP)
- `apps/arena-client/src/prefs/registerSections.ts` — new (if not already present)
- `apps/arena-client/src/prefs/skinManifest.ts` — new
- `apps/arena-client/src/assets/skins/classic/` — new directory + 3 asset files
- `apps/arena-client/src/assets/skins/comic/` — new directory + 3 asset files (D-13003)
- `apps/arena-client/src/assets/skins/minimal/` — new directory + 3 asset files (D-13003)
- `apps/arena-client/src/components/play/SkinSelector.vue` — new
- `apps/arena-client/src/composables/useSkinApplier.ts` — new
- (Plus `.test.ts` per new TS file + per new SFC — ~5 test files)

**Modified:**
- `apps/arena-client/src/main.ts` — modified (side-effect import for `registerSections.ts`)
- `apps/arena-client/src/components/play/TopHudBar.vue` — modified (mount `<SkinSelector>`)
- `apps/arena-client/src/pages/PlayView.vue` — modified (invoke `useSkinApplier`)

**Governance:**
- `docs/ai/STATUS.md` — modified (`### WP-130 / EC-133 Executed` block).
- `docs/ai/DECISIONS.md` — modified (D-13001..D-13005 inserted).
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-130 row flipped).
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-133 row flipped).

**Total projected:** ~16–22 files. Within the typical recent-WP range (WP-104 = 14, WP-115 = 12, WP-125 = 12, WP-126 = 12).

No other files may be modified.

---

## Acceptance Criteria

### A — Pinia store

- [ ] `playmatStore.ts` exposes `usePlaymat()` composable with `{ activeSkin, setActiveSkin, availableSkins }`.
- [ ] Store initialization reads `localStorage['arenaClientPlaymatSkin']`; falls back to `'classic'` on missing or corrupt blob.
- [ ] Schema rejects unknown skin names with `console.warn` + fallback to `'classic'`.
- [ ] `setActiveSkin(name)` updates `activeSkin` AND writes to `localStorage` synchronously.

### B — Selector UI

- [ ] `<SkinSelector>` renders the active skin name + chevron in the HUD-bar slot.
- [ ] Click opens a Vue 3 Teleport overlay listing `availableSkins`.
- [ ] Click on a list item fires `setActiveSkin` and closes the overlay.
- [ ] Escape key closes the overlay; outside-click closes the overlay.
- [ ] Mobile portrait variant shows compact form (`🎨 <name> ▼`).
- [ ] Empty-state (when `availableSkins.length === 0`) shows disabled chip with tooltip.

### C — Skin application

- [ ] `useSkinApplier()` applies the corresponding CSS class to the `<PlayView>` root.
- [ ] Changing `activeSkin` propagates the new class within one Vue tick.
- [ ] Asset-load failure degrades to `'classic'` skin; `console.warn` logs the failure with a full-sentence reason per Rule 11.

### D — Decision blocks

- [ ] D-13001..D-13005 inserted in DECISIONS.md in numeric order with rationale + rejected alternatives.
- [ ] D-13003 cites the locked bundled set (`classic` + `comic` + `minimal`).
- [ ] D-13004 explicitly cites WP-104 column-additive precedent as the path-not-taken (server-side sync is a future WP if demand emerges).

### E — Tests

- [ ] `pnpm --filter arena-client test` exits 0; baseline grows by ≥8 tests across store + SFC + composable.
- [ ] No test imports `boardgame.io` or `@legendary-arena/game-engine` runtime.
- [ ] Store test covers: initial state, setActiveSkin, localStorage round-trip, corrupt-blob fallback, schema rejection.

### F — Layer boundary + non-engine-effect

- [ ] No engine runtime import (verified by `Select-String`).
- [ ] No engine state mutation (the store never writes to `G` or `UIState`).
- [ ] No socket transport involvement — `WP-090` socket code is untouched.
- [ ] No `G.` / `UIState.` / `useUiStateStore` reads in skin code (the skin is independent of game state).

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
# Expected: pass N+8 / fail 0

# Step 3 — confirm no engine runtime import
Select-String -Path "apps\arena-client\src\prefs","apps\arena-client\src\components\play\SkinSelector.vue","apps\arena-client\src\composables\useSkinApplier.ts" -Pattern "from ['""]@legendary-arena/game-engine['""]" -Recurse | Where-Object { $_ -notmatch 'import type' }
# Expected: no output

# Step 4 — confirm no engine state mutation
Select-String -Path "apps\arena-client\src\prefs","apps\arena-client\src\components\play\SkinSelector.vue","apps\arena-client\src\composables\useSkinApplier.ts" -Pattern "useUiStateStore|G\.|UIState\." -Recurse
# Expected: no output (skin code is independent of game state)

# Step 5 — confirm no socket transport reference
Select-String -Path "apps\arena-client\src\prefs","apps\arena-client\src\components\play\SkinSelector.vue" -Pattern "submitMove|boardgame\.io" -Recurse
# Expected: no output

# Step 6 — confirm scope-locked files unchanged
git diff --name-only packages/ apps/server apps/registry-viewer apps/replay-producer
# Expected: no output

# Step 7 — manual smoke: load <PlayView> at desktop, click skin button
# Expected: overlay opens; selecting a different skin propagates new CSS class instantly

# Step 8 — manual smoke: change skin, reload page
# Expected: selected skin persists across reload (localStorage round-trip)

# Step 9 — manual smoke: corrupt localStorage manually, reload page
# Expected: graceful fallback to 'classic'; console.warn logged
```

---

## Vision Alignment

§3 (Player Trust & Fairness): preserved — skin selection has zero engine-state effect; replay determinism unaffected. §4 (Faithful Multiplayer Experience): aligned — different skins are visual chrome; cooperative posture unchanged. §11 (Stateless Client Philosophy): aligned — skin is client-local UI state, never round-trips to server. §14 (Explicit Decisions, No Silent Drift): preserved — D-13001..D-13005 surface every choice. §15 (Built for Contributors): aligned — mirrors WP-068 / WP-121 / WP-124 precedent so future contributors pattern-match. NG-1 (no monetization): not crossed — skins are free; not monetized; no in-game purchase surface introduced. NG-3 (no engine network): preserved (no engine touch). NG-6 (deterministic engine): preserved trivially. **Determinism preservation:** N/A at the engine layer (no engine touch); replay determinism explicitly preserved by separating skin state from game state. **§20 Funding Surface Gate: N/A** with explicit justification (no funding affordance — skins are free, no purchase / subscription / unlock surface introduced; if a future WP introduces premium skins, that WP triggers §20 explicitly). **§21 API Catalog: N/A** (no `apps/server/**` files touched).

---

## Definition of Done

- [ ] All §Acceptance Criteria pass.
- [ ] `pnpm -r build` exits 0.
- [ ] arena-client baseline grows by ≥8 tests.
- [ ] D-13001..D-13005 inserted in DECISIONS.md.
- [ ] STATUS.md `### WP-130 / EC-133 Executed` block.
- [ ] WORK_INDEX.md WP-130 row checked off.
- [ ] EC_INDEX.md EC-133 row flipped Draft → Done.
- [ ] 01.6 post-mortem OPTIONAL per the WP-068 / WP-121 / WP-124 precedent.
- [ ] Single `EC-133:` commit with the locked file count.
