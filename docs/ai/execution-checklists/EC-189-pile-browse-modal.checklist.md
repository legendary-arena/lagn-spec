# EC-189 — Pile Browse Modal (Click-to-View Card Piles)
> **Execution Checklist for WP-171**
> Hard limit: 60 non-empty content lines (currently 57 by author count)

## Before Starting
- [ ] Canonical clone on `claude/wp171-pile-browse-modal`, clean, synced with `origin/main`
- [ ] Confirm WP-128 ✅, WP-153 ✅, WP-166 ✅ visible on `origin/main`
- [ ] Confirm pile contents are public (no audience-filter redaction of `koPile.cards` / `mastermind.strikePile` / `scheme.twistPile`): `Select-String -Path packages/game-engine/src/ui/uiState.filter.ts -Pattern "koPile|strikePile|twistPile"` returns 0 matches
- [ ] Baseline recorded: `pnpm --filter @legendary-arena/arena-client test` (last known 362/0/0 per WP-166) + `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 pre-change
- [ ] Pre-flight gate READY, copilot PASS, lint PASS on record (WP-171 self-review: PASS, 0 carve-outs)

## Locked Values
| Key | Value |
|---|---|
| Modal ARIA | `role="dialog"`; `aria-modal="true"`; `aria-label` bound to `${pileLabel}` (no static fallback); close button `aria-label="Close pile browser"` |
| Verbatim copy strings | empty-state `"Pile is empty."`; pile labels `"KO Pile"` / `"Master Strike Pile"` / `"Scheme Twist Pile"`; browse glyph `"View all ▼"` |
| Header copy format | `"${pileLabel} (${cards.length} cards)"` — **never pluralized**; always `"cards"` (verbatim) even when `cards.length === 1` |
| `data-testid` set | modal root `"play-pile-browse-modal"`; close `"play-pile-browse-close"`; browse buttons `"play-ko-browse"` / `"play-master-strike-browse"` / `"play-scheme-twist-browse"` |
| Dimensions | `max-height: 80vh`; `max-width: 80vw`; backdrop `z-index: 1000` (mirrors `OpponentVictoryModal.vue`) |
| ESC handler form | Event target `document`; event type `'keydown'`; listener `(event: KeyboardEvent) => { if (event.key === 'Escape') emit('close') }`; wired via `watch(isOpen, attachOrDetach, { immediate: true })` so initial open-on-mount state is safe; detach on `false` transition AND on `onBeforeUnmount`. Forbidden: `keyup`, `window` target, inline `@keydown` on the dialog |
| Teleport gating | The `<Teleport to="body">` node itself is wrapped in `v-if="isOpen"`; NOT only the child content (always-mounted Teleport leaves a ghost anchor in `document.body`) |
| `open` emit payload type | `{ pileLabel: string; cards: readonly UIDisplayEntry[] }`. The `readonly` modifier is load-bearing: pile leaves emit the source array **by reference** (no `.slice()` / spread / `Array.from`); pages MUST NOT mutate; payload `cards === koPile.cards` (or `=== pile`) |
| Card render order | Exact order of input `cards`. No `sort` / `reverse` / `slice` / `map` / `filter` / any transformation in the modal or wiring path |
| Browse button HTML form | `<button type="button">` on every browse button AND on the modal close button (defends against future form-wrapping) |
| `v-for` key | `:key="entry.extId"` (UIDisplayEntry.extId unique within a pile per D-12805) |
| SFC form | `defineComponent({ setup() { return {...} } })` for new modal + every modified leaf (mirrors `OpponentVictoryModal.vue` precedent) |
| Modal state pattern | Local `ref<{ pileLabel: string; cards: readonly UIDisplayEntry[] } \| null>` on each of `PlayDesktop.vue` and `PlayMobile.vue`; no Pinia; mirrors `OpponentPanel.vue:30-43` |

## Guardrails
1. **Type-only engine import** — `import type { UIDisplayEntry } from '@legendary-arena/game-engine'` (D-16502); runtime import = Layer Boundary violation
2. **No Pinia / no composable** — modal state is local `ref` on each page
3. **ESC handler lifecycle** — `watch(isOpen, ..., { immediate: true })`; detach on close transition + `onBeforeUnmount`; never `keyup` / `window` / inline `@keydown`
4. **Teleport gates the node, not the children** — `v-if="isOpen"` on the `<Teleport>` element itself
5. **Backdrop closes, panel does NOT** — `@click="$emit('close')"` on backdrop, `@click.stop` on panel
6. **Emit by reference + no mutation** — payload `cards` is `===` source pile array; no clone, no mutation downstream
7. **Render order preserved + text-only** — `v-for` over `cards` in input order; render `entry.display.name`; no `<img>`, no `sort` / `slice` / `map`
8. **Browse button visibility** — `v-if="koPile.count > 0"` / `v-if="pile.length > 0"` (NOT `>= 0`); button is `<button type="button">`
9. **One modal instance per page; no `.reduce()`** — exactly 1 `<PileBrowseModal>` mount on PlayDesktop, 1 on PlayMobile; counting via `cards.length`

## Required Comments
- [ ] `PileBrowseModal.vue`: `// why:` on (a) ESC-listener wiring with `immediate: true`, (b) backdrop-vs-panel `@click.stop`, (c) Teleport `v-if` on the node itself, (d) type-only engine import per D-16502
- [ ] `KOPile.vue` / `MasterStrikePile.vue` / `SchemeTwistPile.vue`: `// why:` on browse-button visibility predicate (button hidden when pile empty) AND on `cards` emitted by reference (no clone)
- [ ] `PlayDesktop.vue` / `PlayMobile.vue`: `// why:` on single page-level modal-state pattern (mirrors `OpponentPanel.vue` local-ref)

## Files to Produce
| File | Changes |
|---|---|
| `apps/arena-client/src/components/play/PileBrowseModal.vue` | **new** — generic modal (Teleport-on-node, ESC + backdrop close, ARIA dialog, text-only ordered list) |
| `apps/arena-client/src/components/play/PileBrowseModal.test.ts` | **new** — open/close, empty, populated, ESC, backdrop, panel-stop, ARIA, Teleport-mounts-under-body, order-preserved, referential-identity |
| `apps/arena-client/src/components/play/KOPile.vue` | **modified** — `<button type="button">View all ▼` (when count > 0) + emit `open` by-reference |
| `apps/arena-client/src/components/play/MasterStrikePile.vue` | **modified** — same pattern |
| `apps/arena-client/src/components/play/SchemeTwistPile.vue` | **modified** — same pattern |
| `apps/arena-client/src/pages/PlayDesktop.vue` | **modified** — `activePile` ref + handlers + single `<PileBrowseModal>` mount |
| `apps/arena-client/src/pages/PlayMobile.vue` | **modified** — identical wiring |

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client {test,typecheck,build}` all exit 0; test baseline 362 + N new PileBrowseModal tests; 0 regressions
- [ ] All grep gates from WP-171 §Verification Steps return the expected match counts (`from '@legendary-arena/game-engine'` matches only `import type`; `defineStore|useUiStateStore|useRouter` returns 0; exactly 1 `<PileBrowseModal` per page)
- [ ] `PileBrowseModal.test.ts` asserts Teleport target: `document.body.querySelector('[data-testid="play-pile-browse-modal"]')` returns `null` when closed, non-`null` (and NOT inside the wrapper mount container) when open
- [ ] `PileBrowseModal.test.ts` asserts order preservation: given `cards = [A, B, C]`, the rendered `<li>` order is `A, B, C` (DOM order matches array order)
- [ ] `PileBrowseModal.test.ts` asserts referential identity: an emit captured from `KOPile.vue` has `payload.cards === koPile.cards` (same JS reference)
- [ ] `docs/ai/STATUS.md`: dated `## WP-171 Complete` entry recording new modal, three wired leaves, test-count delta, deferred items (EscapedPile / YourVictoryPile / discardCards / OpponentVictoryModal migration)
- [ ] `docs/ai/DECISIONS.md`: confirm no new D-entry (consumes D-12803, D-12805, D-12806, D-12909, D-16502 by citation only)
- [ ] `docs/ai/work-packets/WORK_INDEX.md`: WP-171 row flipped `- [ ]` → `- [x]` with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md`: EC-189 row flipped `Draft` → `Done <DATE>`

## Common Failure Smells
- **Teleport gates children, not the node** → `<Teleport v-if=…>` is wrong; the inner `<div v-if=…>` is wrong; gate the `<Teleport>` element itself or `document.body` keeps a ghost anchor
- **Listener leak** → `document.addEventListener('keydown', ...)` outside `watch(isOpen, ..., { immediate: true })` lifecycle leaves a global handler after unmount
- **Cards mutated downstream** → `.slice()` / spread on emit, or a page handler doing `activePile.cards.sort()` breaks referential identity AND the order-preservation AC
- **`type="button"` missing** → default `<button>` inside any future `<form>` ancestor becomes `type="submit"` and fires page navigation on browse click
- **Browse button shown when empty** → `v-if="...count >= 0"` instead of `> 0` exposes a useless affordance for empty piles
- **Header pluralization wedge** → `"1 card"` branch added — violates Locked Value (`Header copy format`); always `"cards"`
