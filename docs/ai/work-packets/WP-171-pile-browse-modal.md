# WP-171 — Pile Browse Modal (Click-to-View Card Piles)

## Drafting Gates (01.0a §Step 5)

> Recorded under the 01.0a Phase 1 DoD retrofit on 2026-05-22. The original
> drafting session (commits `bb17dc2`, `e28f893`, `a42e9f4`) shipped the WP
> and EC bundle but did not invoke Pre-flight (`01.4`) or Copilot check
> (`01.7`) — only the lint gate self-review ran. This section closes the
> 01.0a Step 5 hard invariant retroactively.

- **Drafting baseline:** `origin/main @ 0a507c7` (verified via
  `git fetch origin main && git rev-parse origin/main` on 2026-05-22; this
  is the SHA `main` carried when the `claude/wp171-pile-browse-modal` branch
  forked, and the SHA `main` still carries at gate retrofit time)
- **Pre-flight (`01.4`) verdict:** `READY TO EXECUTE` (2026-05-22, retrofitted).
  Class: Runtime Wiring. All prerequisite WPs (WP-128, WP-153, WP-166)
  complete on `origin/main`. UIDisplayEntry contract verified against
  `packages/game-engine/src/ui/uiState.types.ts` HEAD. Scope is a closed
  7-file allowlist. No engine/registry/server surface touched. No `G`
  mutation. All risk-review items resolved by the operator-driven tightening
  pass (commit `a42e9f4`). Full report at scratchpad
  `docs/ai/invocations/preflight-wp171-pile-browse-modal.md` (gitignored per
  `.claude/rules/work-packets.md` Invocation Artifacts policy; not committed
  unless normatively cited).
- **Copilot check (`01.7`) verdict:** `PASS` (2026-05-22, retrofitted).
  All 30 issues scanned; no `BLOCK`; no open `RISK`. Three initial RISKs —
  #17 Hidden Mutation via Aliasing, #5 Optional Field Ambiguity, #15 Missing
  "Why" — had already been converted to PASS by the tightening pass
  (Locked Values: `open emit payload type` with `readonly` modifier; modal
  state ref discriminated by `null` not by optional-presence; required
  `// why:` comments locked at 5 sites in EC-189). Disposition: CONFIRM
  (pre-flight verdict stands; session prompt generation authorized). No
  mandatory governance follow-up. Full report at scratchpad
  `docs/ai/invocations/copilot-wp171-pile-browse-modal.md` (gitignored).
- **Lint gate (`00.3`) self-review:** PASS (38 items: 24 ✅ direct, 14 N/A
  with non-tautological justification, 0 ❌). See §Lint Gate Self-Review at
  the foot of this document.
- **Session prompt:** Written at
  `docs/ai/invocations/session-wp171-pile-browse-modal.md` (gitignored
  scratchpad). Closes 01.0a §Step 6 REQUIRED for this WP.

**Retrofit honesty note.** The three gate artifacts (pre-flight, copilot,
session) were authored post-drafting under the 01.0a §Step 5 retrofit. The
verdicts are honest evaluations against the WP/EC bundle as it stands AFTER
the 7-suggestion tightening pass; they are not reconstructions of verdicts
from an earlier in-session run that did not happen.

## Goal

Add a single generalized `<PileBrowseModal>` leaf component to
`apps/arena-client` and wire it to the **KO Pile**, **Master Strike
Pile**, and **Scheme Twist Pile** so users can click a `View all ▼`
affordance on any of the three and see every card in the pile
(face-up, deterministic insertion order, text-only). After this
session, a player can browse three previously count-only piles
without leaving the play surface; data is the live `UIDisplayEntry[]`
that WP-153 graduated from safe-skip on 2026-05-16.

---

## Assumes

- WP-128 ✅ — UIState carries `UIKoPileState`, `UIMastermindState.strikePile`, `UISchemeState.twistPile`, and the shared `UIDisplayEntry` shape (`packages/game-engine/src/ui/uiState.types.ts`)
- WP-153 ✅ — `G.mastermind.strikePile`, `G.scheme.twistPile`, and `G.city.escapedPile` now exist and are populated; strike-pile and twist-pile arrays are no longer empty safe-skips
- WP-166 ✅ — `apps/arena-client` is `vue-tsc` green and CI-gated; engine barrel exports `UIDisplayEntry` (D-16502)
- The following files exist in their current shape:
  - `apps/arena-client/src/components/play/KOPile.vue` — renders count + top card; declares (in its JSDoc) that a browse modal is owned by the parent page-level SFC
  - `apps/arena-client/src/components/play/MasterStrikePile.vue` — renders count + top card; consumes `pile: readonly UIDisplayEntry[]`
  - `apps/arena-client/src/components/play/SchemeTwistPile.vue` — renders count + top card; consumes `pile: readonly UIDisplayEntry[]`
  - `apps/arena-client/src/components/play/OpponentVictoryModal.vue` — reference pattern (`<Teleport to="body">` + backdrop + scoped panel + `max-height: 80vh; overflow-y: auto`)
  - `apps/arena-client/src/pages/PlayDesktop.vue` and `apps/arena-client/src/pages/PlayMobile.vue` both import and mount all three pile leaves
- Pile contents are **public** to all audiences. `koPile.cards`, `mastermind.strikePile`, and `scheme.twistPile` are NOT redacted by `filterUIStateForAudience` — only `players[i].handCards` / `handDisplay` / `inPlayCards` / `inPlayDisplay` are filtered (per `packages/game-engine/src/ui/uiState.filter.ts` / WP-029 / WP-089). Confirming this assumption is a prerequisite, not an implementation step.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

- `docs/ai/DESIGN-BOARD-LAYOUT.md` §3.1 (desktop wireframe — the `[6 cards total — click to view all ▼]` and `Recent KOs:` annotation on the KO Pile), §5.2 (Click Affordances → the "(no move — opens browse modal)" row for KO pile / discard / victory pile)
- `docs/ai/ARCHITECTURE.md` §Layer Boundary (Authoritative) — arena-client may import `@legendary-arena/game-engine` **type-only** (Runtime-Safe Engine Surface per WP-090); no setup-tooling import
- `.claude/rules/code-style.md` — leaf SFC conventions, error message form, comment WHY rules
- `.claude/rules/architecture.md` §Layer Boundary — Frontend rules
- `docs/ai/DECISIONS.md`:
  - **D-12803** — `victoryCards` (and the other face-up pile arrays) are public knowledge; not redacted
  - **D-12805** — `UIDisplayEntry` is the shared `{ extId; display }` shape rendered by every face-up pile projection
  - **D-12806** — original safe-skip resolution for the WP-128 contract; closed by WP-153..156
  - **D-12909** — viewport breakpoint at `BREAKPOINT_MOBILE_MAX_PX = 767`; PlayViewport routes between PlayDesktop and PlayMobile
  - **D-16502** — engine barrel publishes the WP-128 sub-types; `UIDisplayEntry` is reachable via `@legendary-arena/game-engine` type-only import
- `packages/game-engine/src/ui/uiState.types.ts` §`UIDisplayEntry`, §`UIKoPileState`, §`UIMastermindState.strikePile`, §`UISchemeState.twistPile`
- `apps/arena-client/src/components/play/OpponentVictoryModal.vue` — full file; the existing Teleport+backdrop pattern this WP generalizes
- `apps/arena-client/src/components/play/OpponentPanel.vue` — the local-ref modal-state pattern (lines 30–43); page-level state, not Pinia

---

## Scope (In)

- A new generic leaf component `PileBrowseModal.vue`: pure presentational, `<Teleport to="body">`, backdrop click + ESC keydown close, ARIA dialog
- A `node:test` test file `PileBrowseModal.test.ts` covering: open/close lifecycle, empty state, populated state, ESC keydown closes, backdrop click closes, panel click does not propagate, ARIA attributes
- `KOPile.vue` change: render a `View all ▼` button when `koPile.count > 0`; emit `open` event carrying `{ pileLabel: 'KO Pile', cards: koPile.cards }`
- `MasterStrikePile.vue` change: same pattern; `pileLabel: 'Master Strike Pile'`; `cards: pile`
- `SchemeTwistPile.vue` change: same pattern; `pileLabel: 'Scheme Twist Pile'`; `cards: pile`
- `PlayDesktop.vue` change: own a single modal-state ref (`activePile: { pileLabel: string; cards: readonly UIDisplayEntry[] } | null`); mount one `<PileBrowseModal>` instance; bind `@open` on KOPile + MasterStrikePile + SchemeTwistPile; close clears the ref
- `PlayMobile.vue` change: identical wiring as desktop
- Updates to `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/STATUS.md` per Definition of Done

---

## Out of Scope

Listed explicitly so a future reader does not infer scope creep from
omission (`00.3 §1` requires at least two things that might seem
related but are deliberately excluded):

- **EscapedPile.vue.** Nested inside `CityRow.vue`; wiring the browse affordance up through CityRow's data path is structurally different and adds an extra leaf+container change. Defer to a follow-up WP.
- **YourVictoryPile.vue.** Already renders the full card list inline (lines 60–71). Switching to modal is a refinement, not a need. Defer.
- **Browse your own discard.** `UIPlayerState.discardCards` is **not** in the UIState contract today; only `discardTopCard` + `discardCount` are projected. Closing that gap is a separate contracts WP.
- **OpponentVictoryModal.vue → PileBrowseModal migration.** Deprecating the older single-purpose modal is a cleanup follow-up; this WP leaves it byte-identical so the OpponentPanel.vue surface is undisturbed.
- **Browse your own deck or any opponent's deck/hand.** Forbidden by data redaction: top of own deck is NEVER projected (shuffle integrity per WP-006A; cited at `YourDeckDiscardZone.vue:53-56` and `DESIGN-BOARD-LAYOUT.md §3.1` line 250); opponent `handCards` are redacted by `filterUIStateForAudience` per WP-029 + WP-089. No browse affordance can or should exist for these zones.
- **Card image rendering inside the modal.** Current play surface is text-only across every leaf; adding `<img>` rendering is a separate concern that belongs in a unified pile-display WP, not a wedge in this one.
- **Hover-zoom, animations, transitions, scroll-snap, wheel-remap.** Polish; out of MVP scope. The scroll-mechanics WP (item #3 in the WP-171 planning thread) is a separate packet.
- **Pinia store for modal state.** Page-level local ref matches `OpponentPanel.vue` precedent (lines 30–43); a store is unjustified for this surface.

---

## Files Expected to Change

1. `apps/arena-client/src/components/play/PileBrowseModal.vue` — **new** — pure presentational SFC; props `{ isOpen: boolean; pileLabel: string; cards: readonly UIDisplayEntry[] }`; emits `close`; `<Teleport to="body">`; backdrop click + ESC close; ARIA `role="dialog"` + `aria-modal="true"` + `aria-label="${pileLabel}"`; renders header (`${pileLabel} (N cards)`), list of `entry.display.name`, empty-state copy `"Pile is empty."`
2. `apps/arena-client/src/components/play/PileBrowseModal.test.ts` — **new** — `node:test` + `@vue/test-utils`; tests: renders nothing when `isOpen === false`; renders populated list with `extId` keying; renders empty-state copy when `cards.length === 0`; ESC keydown on `document` fires `close`; backdrop click fires `close`; panel click does NOT fire `close` (stopPropagation); ARIA attributes present and bound to `pileLabel`
3. `apps/arena-client/src/components/play/KOPile.vue` — **modified** — full file rewrite: add `View all ▼` button (rendered only when `koPile.count > 0`); `data-testid="play-ko-browse"`; emits `open` event with `{ pileLabel: 'KO Pile', cards: koPile.cards }`; existing count + top-card text unchanged; setup exposes an `onBrowse` handler that calls `emit('open', payload)`
4. `apps/arena-client/src/components/play/MasterStrikePile.vue` — **modified** — full file rewrite: add `View all ▼` button (when `pile.length > 0`); `data-testid="play-master-strike-browse"`; emits `open` with `{ pileLabel: 'Master Strike Pile', cards: pile }`
5. `apps/arena-client/src/components/play/SchemeTwistPile.vue` — **modified** — full file rewrite: add `View all ▼` button (when `pile.length > 0`); `data-testid="play-scheme-twist-browse"`; emits `open` with `{ pileLabel: 'Scheme Twist Pile', cards: pile }`
6. `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — full file rewrite: import `PileBrowseModal`; add `activePile` ref of type `{ pileLabel: string; cards: readonly UIDisplayEntry[] } | null`; add `onPileOpen(payload)` handler that assigns the ref; add `onPileClose()` handler that nulls the ref; bind `@open="onPileOpen"` on KOPile + MasterStrikePile + SchemeTwistPile; mount `<PileBrowseModal :is-open="activePile !== null" :pile-label="activePile?.pileLabel ?? ''" :cards="activePile?.cards ?? []" @close="onPileClose" />` once at page level
7. `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — full file rewrite: identical wiring as PlayDesktop

(7 files; under the `00.3 §5` >8-file split threshold.)

---

## Contract / Non-Negotiable Constraints

### Engine-wide (always apply — do not remove)

- Full file contents for every new or modified file. Diffs and snippets are forbidden.
- ESM only. Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- All commands use `pnpm`. Windows / PowerShell 7+ shell (`pwsh`), not `bash`.

### Packet-specific

- **No engine / registry / server runtime import** anywhere in the modified files. Type-only `import type { UIDisplayEntry } from '@legendary-arena/game-engine'` is permitted (D-16502). Verification grep: `Select-String "from '@legendary-arena/game-engine'" apps/arena-client/src/components/play/PileBrowseModal.vue` must match only `import type` lines.
- **No new Pinia store, no new composable.** Modal state is a local `ref` on each of `PlayDesktop.vue` and `PlayMobile.vue`. Mirrors `OpponentPanel.vue:30-43`. Verification grep: `Select-String -Pattern "defineStore|useUiStateStore" apps/arena-client/src/components/play/PileBrowseModal.vue` returns 0 matches.
- **SFC form: `defineComponent({ setup() { return {...} } })`** for every modified or new SFC in this WP. Matches `OpponentVictoryModal.vue` precedent. Justification: KOPile / MasterStrikePile / SchemeTwistPile become non-leaf composers (they emit events handled by the page) per the EC-132 §2 SFC authoring whitelist; PileBrowseModal stays a leaf but uses `defineComponent` for consistency with the existing modal precedent (no `<script setup>` introduced in this WP).
- **ESC handler lifecycle.** Wired via `watch(isOpen, ..., { immediate: true })` — attach when `isOpen` becomes (or already is) `true`, detach when it transitions to `false`, detach on `onBeforeUnmount`. The exact event target, type, listener signature, and watcher options are locked in §Locked Values (`ESC handler form`). No leaked listeners across mount / unmount cycles.
- **Teleport gating — node, not children.** The `<Teleport to="body">` element itself is the `v-if="isOpen"` boundary. Gating only the children leaves a Teleport anchor mounted in `document.body` at all times, which trips the AC #2 "renders nothing when closed" check. See §Locked Values (`Teleport gating`).
- **Backdrop vs panel click.** The backdrop element calls `emit('close')` on `@click`; the panel element calls `@click.stop` to prevent propagation. The dialog itself does not close on internal clicks.
- **Emit payload immutability.** Pile leaves emit the source `cards` array **by reference** (no `.slice()`, no spread, no `Array.from(...)`) — referential identity with the engine projection must survive the emit. Page handlers store the reference and MUST NOT mutate it. The `readonly` modifier on the payload type makes this a compile-time guarantee. See §Locked Values (`open` emit payload type).
- **Card render order — no transformation.** The modal renders the `cards` array in the exact order it receives. No `sort`, `reverse`, `slice`, `map`, `filter`, or any other transformation anywhere in the wiring path. The engine produces deterministic insertion order; the UI MUST preserve it byte-for-byte. See §Locked Values (`Card render order`).
- **Browse button HTML form.** Every browse button (`KOPile.vue`, `MasterStrikePile.vue`, `SchemeTwistPile.vue`) and the modal's close button is `<button type="button">`. Defends against future form-wrapping accidents. See §Locked Values (`Browse button HTML form`).
- **Card list rendering — text only.** Each entry renders `entry.display.name`. No `<img>` tag. No image URL reference. No card-image rendering of any kind. Image rendering is explicitly Out of Scope.
- **Empty state copy is uniform.** Modal renders `"Pile is empty."` for `cards.length === 0` regardless of pile type. Pile-specific copy lives on the leaf component, not the modal.
- **Header copy — no pluralization.** Modal header renders `"${pileLabel} (${cards.length} cards)"` verbatim — always `"cards"`, never `"card"` even when `cards.length === 1`. Choosing strict no-pluralization (vs. branching `"1 card"` / `"N cards"`) keeps the spec single-form and eliminates a class of grammar bugs. See §Locked Values (`Header copy format`).
- **Keying.** `v-for` over `cards` uses `:key="entry.extId"`. The shape guarantees `extId` is unique within a pile (`UIDisplayEntry.extId` per WP-128 / D-12805).
- **No `.reduce()`.** Card list iteration is `v-for`; counting is `cards.length`. The packet introduces no `Array.reduce()` call.
- **No animations / transitions / `<Transition>` wrappers.** Out of scope.

### Session protocol

- If any item in the WP body is unclear, **stop and ask** — do not improvise. The user is reachable.
- If the execution session discovers a contract divergence (e.g., `UIDisplayEntry` shape has changed since drafting), **stop** and surface the divergence rather than work around it.

### Locked values

| Value | Lock |
|---|---|
| Modal `role` attribute | `dialog` |
| Modal `aria-modal` | `"true"` |
| Modal `aria-label` | `${pileLabel}` (bound; no static fallback) |
| Close button `aria-label` | `"Close pile browser"` |
| Empty-state copy | `"Pile is empty."` (verbatim) |
| Header copy format | `"${pileLabel} (${cards.length} cards)"` — **never pluralized**; always `"cards"` (verbatim) even when `cards.length === 1` |
| KO Pile label | `"KO Pile"` (verbatim) |
| Master Strike Pile label | `"Master Strike Pile"` (verbatim) |
| Scheme Twist Pile label | `"Scheme Twist Pile"` (verbatim) |
| Browse button glyph | `"View all ▼"` (verbatim) |
| `data-testid` for modal root | `"play-pile-browse-modal"` |
| `data-testid` for KO browse button | `"play-ko-browse"` |
| `data-testid` for Master Strike browse button | `"play-master-strike-browse"` |
| `data-testid` for Scheme Twist browse button | `"play-scheme-twist-browse"` |
| `data-testid` for modal close button | `"play-pile-browse-close"` |
| Modal max-height | `80vh` (matches OpponentVictoryModal precedent) |
| Modal max-width | `80vw` (matches OpponentVictoryModal precedent) |
| Backdrop z-index | `1000` (matches OpponentVictoryModal precedent) |
| ESC handler form | Event target `document`; event type `'keydown'`; listener `(event: KeyboardEvent) => { if (event.key === 'Escape') emit('close') }`; attached via `watch(isOpen, attachOrDetach, { immediate: true })` so the initial open-on-mount state is handled at setup time; detach on `false` transition AND on `onBeforeUnmount`. Forbidden: `keyup`, `window` target, inline `@keydown` on the dialog (the dialog may not have focus at open time) |
| Teleport gating | The `<Teleport to="body">` node itself is wrapped in `v-if="isOpen"`. Do NOT gate only the child content — an always-mounted Teleport leaves a ghost anchor in `document.body` when closed |
| `open` emit payload type | `{ pileLabel: string; cards: readonly UIDisplayEntry[] }`. The `readonly` modifier is load-bearing — pile leaves MUST emit the source array by reference (no `.slice()`, no spread, no `Array.from(...)`); page handlers MUST NOT mutate the array; referential identity with `koPile.cards` / `mastermind.strikePile` / `scheme.twistPile` is preserved |
| Card render order | Exact order of the input `cards` array. No `sort` / `reverse` / `slice` / `map` / `filter` / any transformation in the modal or in the wiring path. The engine produces deterministic insertion order; the UI MUST preserve it byte-for-byte |
| Browse button HTML form | `<button type="button">` on every browse button. `type="button"` is mandatory; the leaves render outside `<form>` today but the explicit type defends against future form-wrapping accidents that would convert the click into a submit |

---

## Acceptance Criteria

Twelve binary, observable checks (`00.3 §14`: 6–12 items, each pass/fail).

- [ ] `apps/arena-client/src/components/play/PileBrowseModal.vue` exists; default export is a `defineComponent` named `'PileBrowseModal'`; props are `isOpen: boolean`, `pileLabel: string`, `cards: readonly UIDisplayEntry[]`; declared emit is `'close'`
- [ ] PileBrowseModal Teleport target is `document.body`; when `isOpen === false` the Teleport block does NOT render (`document.body.querySelector('[data-testid="play-pile-browse-modal"]')` returns `null`); when `isOpen === true` the panel mounts under `document.body`, not within the `@vue/test-utils` mount container (asserted in `PileBrowseModal.test.ts`)
- [ ] PileBrowseModal renders `<header>` matching `"${pileLabel} (${cards.length} cards)"` (never pluralized — always `"cards"` even when length is 1), a `<ul>` of `entry.display.name` in the **exact order** of the input `cards` array (asserted: given `[A, B, C]` the DOM reads `A, B, C` in order — no sort / reverse / mapping), and the verbatim empty-state copy `"Pile is empty."` when `cards.length === 0`
- [ ] Pressing `Escape` on the document while `isOpen === true` emits `close`; the listener is removed when `isOpen` becomes `false` or the component unmounts (verifiable by spying on `document.removeEventListener` in the test)
- [ ] Clicking the backdrop emits `close`; clicking the panel itself does NOT emit `close` (verified by `@vue/test-utils` `trigger('click')` + emit assertions)
- [ ] Root dialog element carries `role="dialog"`, `aria-modal="true"`, and `aria-label="${pileLabel}"`; close button carries `aria-label="Close pile browser"`
- [ ] `KOPile.vue` renders a `<button type="button" data-testid="play-ko-browse">View all ▼</button>` if and only if `koPile.count > 0`; clicking emits `open` with `{ pileLabel: 'KO Pile', cards: koPile.cards }` — payload's `cards` is the same reference (`===`) as `koPile.cards`, not a clone
- [ ] `MasterStrikePile.vue` renders a `<button type="button" data-testid="play-master-strike-browse">View all ▼</button>` if and only if `pile.length > 0`; clicking emits `open` with `{ pileLabel: 'Master Strike Pile', cards: pile }` — payload's `cards === pile` (same reference)
- [ ] `SchemeTwistPile.vue` renders a `<button type="button" data-testid="play-scheme-twist-browse">View all ▼</button>` if and only if `pile.length > 0`; clicking emits `open` with `{ pileLabel: 'Scheme Twist Pile', cards: pile }` — payload's `cards === pile` (same reference)
- [ ] `PlayDesktop.vue` and `PlayMobile.vue` each mount exactly one `<PileBrowseModal>` instance; `@open` on each of the three pile leaves assigns the page-level `activePile` ref; the modal's `@close` event nulls the ref
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0; the test baseline increases by the count of new `PileBrowseModal.test.ts` cases (no existing test regresses)
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0; `pnpm --filter @legendary-arena/arena-client build` exits 0

---

## Verification Steps

```pwsh
pnpm --filter @legendary-arena/arena-client test
# Expected: 0 fail; previous baseline (last known: 362 per WP-166) plus N new
# tests from PileBrowseModal.test.ts. No existing test regresses.

pnpm --filter @legendary-arena/arena-client typecheck
# Expected: 0 errors

pnpm --filter @legendary-arena/arena-client build
# Expected: build succeeds (exit 0)

# Layer-boundary gate: no engine runtime import in the modal.
# Only `import type` is permitted (D-16502).
Select-String -Path apps/arena-client/src/components/play/PileBrowseModal.vue -Pattern "from '@legendary-arena/game-engine'"
# Expected: matches only on lines beginning with `import type` (one match)

Select-String -Path apps/arena-client/src/components/play/PileBrowseModal.vue -Pattern "@legendary-arena/registry|apps/server"
# Expected: 0 matches

# No new store / composable wedged in.
Select-String -Path apps/arena-client/src/components/play/PileBrowseModal.vue -Pattern "defineStore|useUiStateStore|useRouter|useRoute"
# Expected: 0 matches

# Single modal instance per page.
Select-String -Path apps/arena-client/src/pages/PlayDesktop.vue -Pattern "<PileBrowseModal" -SimpleMatch
# Expected: exactly 1 match
Select-String -Path apps/arena-client/src/pages/PlayMobile.vue -Pattern "<PileBrowseModal" -SimpleMatch
# Expected: exactly 1 match
```

**Local-dev smoke test (operator-runnable, post-execution):**

1. `pnpm --filter @legendary-arena/arena-client dev`
2. Load a fixture or live match that has populated KO pile / strike pile / twist pile
3. Click `View all ▼` on the KO Pile → modal opens, lists all KO'd cards by display name
4. Press `Escape` → modal closes
5. Click the backdrop area outside the panel → modal closes
6. Click inside the panel (e.g., on a card name) → modal stays open
7. Repeat steps 3–6 for Master Strike Pile and Scheme Twist Pile
8. Resize the window across the `BREAKPOINT_MOBILE_MAX_PX = 767` boundary (D-12909); confirm the modal still renders correctly on both PlayDesktop and PlayMobile

---

## Vision Alignment

**N/A** — none of the `00.3 §17.1` trigger surfaces are touched:
no scoring / PAR / leaderboard surface; no replay or replay storage;
no identity, account, or ownership change; no multiplayer
synchronization or reconnection logic; no determinism guarantee or
RNG sourcing; no card data or card image semantics; no monetization /
supporter / cosmetic / paid surface; no live-ops or beta-gate; no
accessibility surface beyond ARIA attributes on a single dialog
(which is implementation-level, not vision-level); no registry-viewer
change. This WP makes already-public, already-projected pile contents
clickable. It does not change semantics, contracts, or any field of
the engine projection.

---

## Funding Surface Gate

**N/A** — no funding affordances, navigation surfaces, or
user-visible copy referencing "donate" / "support" / "tournament
funding" / equivalent terms. The WP introduces gameplay-UI affordances
(pile browse buttons) and a presentational modal. No `00.3 §20.1`
trigger surface is present.

---

## API Catalog Update

**N/A** — no HTTP endpoint added, modified, removed, or status-changed;
no library function under `apps/server/src/**` added or modified. The
WP is confined to `apps/arena-client/src/**`. No `00.3 §21.1` trigger
surface is present.

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] Every Acceptance Criteria check passes
- [ ] `docs/ai/STATUS.md` has a dated `## WP-171 Complete` entry recording: the new `PileBrowseModal` component, the three wired pile leaves, the test-count delta, and that EscapedPile / YourVictoryPile / discardCards / OpponentVictoryModal-migration are explicitly deferred
- [ ] `docs/ai/DECISIONS.md` — confirm no new D-entry was opened (none required; the WP consumes existing decisions D-12803, D-12805, D-12806, D-12909, D-16502 by citation only)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-171 is checked off (`- [x]`) with the completion date
- [ ] No files outside the seven listed in `## Files Expected to Change` were modified
- [ ] Layer-boundary grep gates from `## Verification Steps` all return the expected match counts
- [ ] `pnpm --filter @legendary-arena/arena-client {test,typecheck,build}` all exit 0

---

## Lint Gate Self-Review

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Required WP sections present (Goal / Assumes / Context / Scope / Out of Scope / Files Expected to Change / Non-Negotiable Constraints / Acceptance Criteria / Verification Steps / Definition of Done) | ✅ | All ten present and non-empty |
| 2 | `## Out of Scope` non-empty with ≥ 2 deliberately-excluded items | ✅ | 8 items: EscapedPile, YourVictoryPile, discardCards, OpponentVictoryModal migration, own-deck / opponent-hand browse, card images, animations / scroll-snap, Pinia store |
| 3 | Non-Negotiable Constraints contain engine-wide (full-file, ESM, Node 22, code-style cite, pnpm + pwsh) AND packet-specific (no engine runtime import, no Pinia, defineComponent form, ESC lifecycle, backdrop/panel click, text-only rendering, uniform empty copy, no `.reduce()`, no animations) AND session protocol AND locked values | ✅ | All four blocks present |
| 4 | Constraints cite `00.6-code-style.md` | ✅ | Engine-wide block cites it |
| 5 | No partial output permitted | ✅ | "Full file contents for every new or modified file. Diffs and snippets are forbidden." in engine-wide block |
| 6 | `## Assumes` lists every prior WP + file dependency with required shape; no hidden dependencies | ✅ | WP-128 / WP-153 / WP-166 listed; five files cited by path with shape requirement; public-pile audience-filter assumption called out explicitly as prerequisite |
| 7 | `## Context (Read First)` is specific (sections cited, not "read the docs") | ✅ | DESIGN-BOARD-LAYOUT §3.1 + §5.2; ARCHITECTURE.md §Layer Boundary; five D-entries by ID; three engine type sections by name; two reference SFCs by path |
| 8 | Touches data shapes? If yes, cites `00.2-data-requirements.md` | N/A | No `00.2` data shape touched (UIDisplayEntry is engine-projection contract, not card-data contract) |
| 9 | `## Files Expected to Change` is an allowlist; ≤ ~8 files | ✅ | 7 files (2 new + 5 modified); no body file outside the list |
| 10 | No ambiguous "update / modify / show diff" language anywhere | ✅ | Every file entry uses "full file rewrite" or "new" |
| 11 | Naming consistency with 00.2 and prior WPs | ✅ | UIDisplayEntry / UIKoPileState / UIMastermindState.strikePile / UISchemeState.twistPile — all match `uiState.types.ts` verbatim |
| 12 | No new npm dependency | ✅ | Uses only existing `vue`, `@vue/test-utils`, `node:test`, type-only `@legendary-arena/game-engine` |
| 13 | Forbidden packages explicitly excluded where relevant | ✅ | Test runner is `node:test` (project standard, explicitly locked vs. Jest/Vitest/Mocha in `00.3 §7`); no `axios` / `node-fetch` (no network in this WP); no ORM (no DB); no auth library (no auth) |
| 14 | Architectural boundaries respected | ✅ | apps/arena-client only; type-only engine import per D-16502; no server / registry / preplan runtime import; component contains no game logic (renders projection data already produced by the engine) |
| 15 | Windows / PowerShell-safe commands | ✅ | All Verification Steps use `pnpm` + `Select-String`; no `bash` / `grep` / `~/.config` |
| 16 | Env vars documented | N/A | No env var touched |
| 17 | Auth model committed | N/A | No auth surface touched |
| 18 | Tests use `node:test` only; no boardgame.io / network / DB import | ✅ | PileBrowseModal.test.ts is `node:test` + `@vue/test-utils` (existing harness via `@legendary-arena/vue-sfc-loader/register`) — matches `OpponentVictoryModal` test precedent |
| 19 | Verification Steps are exact (commands + expected output) | ✅ | All five commands have an explicit "Expected:" line; smoke test is enumerated step-by-step |
| 20 | Acceptance Criteria are binary + observable + specific | ✅ | 12 items, each cites a file / function / value / `data-testid` |
| 21 | Definition of Done includes STATUS.md + DECISIONS.md + WORK_INDEX.md + scope-boundary check | ✅ | All four explicit; the DECISIONS.md row explicitly confirms no new entry needed |
| 22 | No premature abstraction (≥ 3 uses) | ✅ | PileBrowseModal is consumed by 3 callers (KO + Strike + Twist) on day one — meets the "third copy appears" threshold |
| 23 | No nested ternaries / complex `reduce` / dynamic known-key access | ✅ | Counted via `cards.length`; no `.reduce()` in the WP; no dynamic property access |
| 24 | Descriptive names | ✅ | `activePile`, `pileLabel`, `onPileOpen`, `onPileClose`, `onBrowse`, `isOpen` — all full English |
| 25 | Functions ≤ 30 lines with JSDoc | ✅ | The modal's setup is < 30 lines; each pile's `onBrowse` is a 2-line emitter; each page's `onPileOpen` / `onPileClose` is a 1-line assignment. JSDoc required on each new function. |
| 26 | `// why:` on non-obvious code | ✅ | ESC-listener lifecycle requires a `// why:` (non-obvious watcher-driven attach/detach); backdrop-vs-panel click stopPropagation requires a `// why:`; the "no engine runtime import" decision requires a `// why:` on the type-only import (per `.claude/skills/legendary-game-engine` posture) |
| 27 | No `import *` / barrel re-exports | ✅ | Named imports only |
| 28 | Error messages full sentences | N/A | No `throw new Error(...)` in this WP |
| 29 | §17 Vision Alignment section present (or explicit N/A with justification) | ✅ | Explicit N/A with full per-clause justification — no trigger surface touched |
| 30 | §17 cites clause numbers (or N/A justified) | ✅ | N/A justified by enumeration of every trigger surface |
| 31 | Vision conflict declared? | N/A | No conflict — no vision clause touched |
| 32 | Determinism preservation line if WP touches scoring/replay/RNG | N/A | No such touch |
| 33 | Grep-vs-prose discipline | ✅ | Verification greps target imports (`'@legendary-arena/game-engine'`, `'@legendary-arena/registry|apps/server'`); the WP body cites engine import policy by D-entry (D-16502) and code-comment guidance, never enumerating "the forbidden imports are X, Y, Z" verbatim adjacent to the grep |
| 34 | §20 Funding Surface Gate present (or N/A justified) | ✅ | Explicit N/A with reason — no funding affordance / no nav surface / no donate / support / tournament-funding copy; gameplay-UI only |
| 35 | §20 G-1..G-7 disposition (if §20 triggered) | N/A | §20 not triggered |
| 36 | §20 N/A justification non-tautological | ✅ | Names the reason (no funding affordance, no nav surface, no copy referencing funding terms) |
| 37 | Public Blurb verbatim if funding copy present | N/A | No funding copy |
| 38 | No proposed future funding UI surface | ✅ | None |
| 21-API | §21 API Catalog Update present (or N/A justified) | ✅ | Explicit N/A with reason — no HTTP endpoint, no `apps/server/src/**` library function; arena-client-only WP |

**Lint gate verdict: PASS** — all 38 items resolved (24 ✅ direct, 14 N/A with justification, 0 ❌). No carve-outs.
