# EC-228 — Notable Event Overlays (Execution Checklist)

**Source:** docs/ai/work-packets/WP-201-notable-event-overlays.md
**Layer:** Arena Client (`apps/arena-client/src/`)

## Before Starting
- [ ] **WP-200 complete ✅** (engine event log + `UIState.notableEvents` projection). If WP-200 has not landed, STOP and report `BLOCKED: WP-200`.
- [ ] WP-061 ✅ (arena-client app + Vue 3 + Vite + node:test)
- [ ] WP-111 ✅ (`UIState.cardDisplayData` populated)
- [ ] WP-128 ✅ (UIState projection pattern)
- [ ] Read `apps/arena-client/src/composables/useRevealDetector.ts` (the file being replaced) and `apps/arena-client/src/components/play/RevealOverlay.vue` (the component being replaced)
- [ ] Read `apps/arena-client/src/pages/PlayDesktop.vue` + `PlayMobile.vue` (the wiring sites)
- [ ] Read `packages/game-engine/src/events/notableEvents.types.ts` (the contract being consumed — landed by WP-200)
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (record baseline)

## Locked Values (do not re-derive)
- Event-type chip labels — exactly four entries:
  - `fightResolved` → "Fought"
  - `ambushResolved` → "Ambush!"
  - `schemeTwistResolved` → "Scheme Twist!"
  - `mastermindStrikeResolved` → "Master Strike!"
- Border colour bindings (CSS custom-property names from the existing reveal overlay):
  - `fightResolved` + `ambushResolved` → `--color-villain`
  - `schemeTwistResolved` → `--color-scheme-twist`
  - `mastermindStrikeResolved` → `--color-master-strike`
- Humanised effect-label map — exactly five entries matching `VILLAIN_EFFECT_KEYWORDS`:
  - `gainWoundEachPlayer` → "Each player gains a Wound"
  - `gainWoundCurrentPlayer` → "You gain a Wound"
  - `koHeroCurrentPlayer` → "KO a Hero"
  - `heroDeckTopToEscape` → "Hero deck top escapes"
  - `captureBystander` → "Captures a Bystander"
- Composable signature: `useNotableEventStream(snapshot: Ref<UIState | null>) => { currentEvent: Ref<NotableGameEvent | null>, dismiss(): void }`
- Composable internal contract: FIFO queue of unseen events + consumption cursor (last consumed array index). The cursor — not length-diff — is the load-bearing re-emission gate.
- Composable exposes the engine event directly as `NotableGameEvent`. No wrapper interface (no `NotableEventStreamEvent`), no synthetic metadata (no timestamps, no client-generated IDs, no derived identity fields).
- Exported pure helper: `eventCardId(event: NotableGameEvent): CardExtId` — sole per-variant id-field resolution surface (D-20104).
- Overlay default `durationMs` = 2500
- Overlay required attributes: `data-testid="play-notable-event-overlay"`, `data-event-type="<NotableGameEventType>"`, `aria-live="polite"`, `role="status"`, `aria-atomic="true"`

## Guardrails
- No `@legendary-arena/registry` import in any arena-client file (runtime registry import is a layer-boundary violation)
- No `@legendary-arena/game-engine/setup` import (Setup-Tooling Surface; D-14401)
- Narrative is rendered VERBATIM — no client-side rewording, truncation, or transformation beyond Vue text interpolation
- **FIFO queue invariant.** When `notableEvents.length` grows by N (in one frame OR across skipped frames), all N events MUST be enqueued in array index order and displayed sequentially. No collapsing, no dropping, no reordering.
- **Consumption cursor invariant.** Events with `index < cursor` MUST NOT re-emit under any condition — component remount, snapshot reactivity reset, Vue HMR, snapshot reference replacement. Length-diff alone is insufficient (fails on remount).
- **No synthetic metadata.** No timestamps, no client-generated IDs, no wrapper interfaces, no derived identity fields on events. Event identity is the array index (D-20007 carry-over + D-20104).
- **`dismiss()` advances + timer reset.** Calling `dismiss()` immediately advances the cursor to the next queued event (or to null). The auto-dismiss timer MUST be cleared and restarted on every event boundary (manual dismiss OR auto-fire); single timer invariant — never two timers in flight.
- **Mount-time timer reset.** Mounting a new event MUST clear any existing timer before starting a new one. No timer leakage across event boundaries.
- **UI does not interpret events (D-20105).** The overlay MUST NOT derive meaning from event structure beyond rendering provided fields. Branching is allowed ONLY for per-event-type styling (border colour, chip label) and for presence/absence of `appliedEffects` rendering.
- **Effect-label map totality.** Unknown `VillainEffectKeyword` values (engine expansion ahead of arena-client bundle) MUST render the raw keyword string verbatim. Silent skip is forbidden — it hides real data.
- **`eventCardId` is the single id-resolution surface.** The overlay template + tests + any future consumer MUST call `eventCardId(event)` rather than inline ternaries over `event.cardId ?? event.revealedCardId ?? ...`. Grep gate enforces zero inline ternaries in the overlay.
- Effect-badge row is OMITTED entirely when `appliedEffects: []` (no empty wrapper element)
- Composable safe-skips when `UIState.notableEvents` is undefined (older engine bundle); `currentEvent` stays null, no error throws, no console warning, no internal state change. Equivalent behaviour when `snapshot.value === null`.
- **Strict delete enforcement.** No source file in `apps/arena-client/src/` may import OR reference `useRevealDetector` or `RevealOverlay` — including type-only imports, JSDoc references, comments, or string literals. Grep gate is literal substring; matches are FAIL.
- Tests use the project's node:test convention; no boardgame.io/testing imports

## Required `// why:` Comments
- Composable's safe-skip on null snapshot OR undefined `notableEvents`: why (older engine bundle compatibility + first-tick null safety; no throw, no state change)
- Composable's FIFO queue + consumption cursor declaration: why cursor-based, not length-diff (D-20104; remount + snapshot-reset re-emission gate)
- Composable's queue handling for multi-event frames AND skipped frames: why sequential index-ordered enqueue, not parallel display, not loss-on-skip (reading room + completeness)
- Composable's auto-dismiss timer clear + restart: why single-timer invariant (no overlapping timers; D-20104 timer-reset rule)
- Composable's `dismiss()` cursor advance: why immediate (queue progress invariant)
- Exported `eventCardId` pure helper declaration: why centralised (single source of truth for per-variant id resolution; prevents drift across overlay + tests + future consumers; D-20104)
- Overlay's fallback to raw `cardId` on missing `cardDisplayData`: why (defensive — engine emission never throws on missing display data per D-20002)
- Overlay's raw-keyword fallback on unknown effect labels: why (D-20102 totality rule — silent-skip hides real data when engine expands the keyword union ahead of the arena-client bundle)
- Overlay's `aria-atomic="true"`: why (full chip+name+narrative announced cohesively; partial announcements would fragment the message under screen reader)
- Locked humanised effect-label map declaration: why locked to `VILLAIN_EFFECT_KEYWORDS` (engine vocabulary is the source of truth)
- Border colour rationale for Fight using `--color-villain`: why (defeating a villain is a villain-coloured event)
- UI-does-not-interpret-events guard (D-20105): why on the overlay template's structural branching — explain that the only permitted branches are styling (border/chip) and `appliedEffects` presence; no semantic derivation
- DELETE of `useRevealDetector.ts` / `RevealOverlay.vue`: a one-line `// why:` in the WORK_INDEX / commit message rationale (no comment in code since the files no longer exist; rationale lives in the WP body and DECISIONS D-20101)

## Files to Produce
- `apps/arena-client/src/composables/useNotableEventStream.ts` — **new** — composable
- `apps/arena-client/src/composables/useNotableEventStream.test.ts` — **new** — diff/queue/dismiss tests
- `apps/arena-client/src/components/play/NotableEventOverlay.vue` — **new** — overlay component
- `apps/arena-client/src/components/play/NotableEventOverlay.test.ts` — **new** — per-event-type render tests
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — rewire
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified (additive)** — extend with integration assertions for all four event types
- `apps/arena-client/src/composables/useRevealDetector.ts` — **DELETED**
- `apps/arena-client/src/components/play/RevealOverlay.vue` — **DELETED**
- ~~`apps/arena-client/src/pages/PlayMobile.vue`~~ — **NOT IN SCOPE** (preflight 2026-06-02: grep on `main @ 52d64e2` confirmed zero `useRevealDetector` / `RevealOverlay` imports; pre-WP-201 Mobile has no reveal-overlay coverage at all; this WP scopes to replace-don't-add only; Mobile overlay coverage deferred to a future WP if requested)

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] `useRevealDetector.ts` and `RevealOverlay.vue` no longer exist (`test ! -f` succeeds)
- [ ] `NotableEventOverlay.vue` and `useNotableEventStream.ts` exist
- [ ] **Strict delete gate:** `grep -rn "useRevealDetector\|RevealOverlay" apps/arena-client/src` returns zero matches (literal substring across all extensions — imports, type imports, comments, JSDoc, string literals all in scope)
- [ ] Grep: zero `@legendary-arena/registry` matches in `apps/arena-client/src/composables/useNotableEventStream.ts`
- [ ] Grep: zero `@legendary-arena/game-engine/setup` matches in `apps/arena-client/src`
- [ ] Grep: all five `VILLAIN_EFFECT_KEYWORDS` strings present in `NotableEventOverlay.vue`
- [ ] **No-synthetic-metadata gate:** grep returns zero matches in `useNotableEventStream.ts` for each of `Date.now(`, `performance.now(`, `Math.random(`, `NotableEventStreamEvent`, `eventId`, `generatedAt`, `timestamp`
- [ ] **Single-id-resolution gate:** grep returns zero matches in `NotableEventOverlay.vue` for any of `event.cardId`, `event.revealedCardId`, `event.twistCardId`, `event.strikeCardId` (the helper is the only resolution surface)
- [ ] **aria-atomic gate:** grep returns exactly one match for `aria-atomic="true"` on the overlay root in `NotableEventOverlay.vue`
- [ ] Integration: PlayDesktop test exercises all four event types and asserts the overlay mounts with the matching `data-event-type` attribute
- [ ] **Multi-event index-order test passes** — 3-event single-frame push displays in array order
- [ ] **Snapshot-gap recovery test passes** — frame-skip fixture loses no event
- [ ] **No-re-emission test passes** — remount after cursor advance does not re-emit consumed events
- [ ] **Auto-dismiss single-timer test passes** — manual dismiss mid-timer yields a fresh full-duration timer for the next event
- [ ] **Null/undefined safe-skip test passes** — both `snapshot.value === null` and `snapshot.value.notableEvents === undefined` resolve to `currentEvent.value === null` with no throw / no console warning
- [ ] **Unknown-keyword fallback test passes** — synthetic event with an unknown `VillainEffectKeyword` renders the raw keyword string verbatim (no silent skip)
- [ ] `docs/ai/STATUS.md` updated with `### WP-201 Executed` block
- [ ] `docs/ai/DECISIONS.md` updated with D-20101..D-20105 (D-20104 + D-20105 added 2026-06-02 from operator review pass — body drafts at execution time)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-201 flipped to `[x]` with completion date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-228 flipped to `Done`

## Common Failure Smells
- Composing or rewording `narrative` on the client → D-20002 violation (engine owns narrative composition); render verbatim
- Adding bystander-reveal overlay handling → out-of-scope; WP-201 does not cover bystander events (the engine emits none for that case)
- Embedding `display: UICardDisplay` inline in event payloads on the client → projection drift; look up via `UIState.cardDisplayData` at render time
- Removing `useRevealDetector.ts` / `RevealOverlay.vue` with a re-export shim or deprecation comment → D-20101 violation (clean delete, no parallel surfaces)
- Leaving a type-only import (`import type { ... } from '../components/play/RevealOverlay.vue'`) or a JSDoc reference to a deleted symbol → strict-delete violation; grep gate is literal substring and catches all of these
- Introducing a `NotableEventStreamEvent` wrapper interface OR a `timestamp` / `eventId` / `generatedAt` field on events → D-20104 violation (no synthetic metadata; event identity is the array index)
- Tracking re-emission protection via length-diff alone (no cursor) → D-20104 violation; component remount OR snapshot reference replacement causes already-consumed events to re-emit as a "new" diff
- Calling `Date.now()` / `performance.now()` / `Math.random()` anywhere in the composable → determinism violation; the UI layer must remain a pure projection consumer
- Collapsing multiple new events from one frame into a single render → queue invariant violation (display sequentially)
- Dropping events on a snapshot gap (skipping from length 3 → 5 and only showing the latest) → completeness violation; ALL unseen events between cursor and new length must enqueue
- Reordering queued events (e.g., LIFO instead of FIFO) → ordering violation; engine dispatch order = display order
- Auto-dismiss timer not restarting on manual `dismiss()` → users see truncated next-event; the single-timer invariant requires a full fresh duration per event
- Two timers in flight after fast-fire dismiss / advance → resource leak + UI flicker; ensure prior timer is cleared before starting the next
- Effect badges rendered for Scheme Twist / Master Strike events → wrong contract (`appliedEffects` is Fight + Ambush only per D-20005)
- Silent-skipping an unknown `VillainEffectKeyword` in the label map → totality violation; render the raw keyword string verbatim instead
- Inline per-variant id resolution in the overlay template (`event.cardId ?? event.revealedCardId ?? ...`) → drift hazard; use the exported `eventCardId` helper from the composable module
- Border colour for Fight using a non-villain colour → spec drift (Fight is a villain-coloured event)
- Missing `aria-live="polite"` / `role="status"` / `aria-atomic="true"` on the overlay root → accessibility regression (aria-atomic is required so the full message is announced cohesively, not fragmented)
- Adding overlay-side conditional logic that derives meaning from the event (e.g., "if `appliedEffects` includes `koHeroCurrentPlayer`, append 'critical' badge styling") → D-20105 violation; UI does not interpret event semantics
- Importing from `@legendary-arena/game-engine/setup` → Boundary Leakage class violation per D-14401; use the runtime-safe `.` subpath only
- Composable subscribing to boardgame.io directly → wrong layer; consume via the snapshot `Ref<UIState | null>` already used by sibling composables (`useRevealDetector` precedent)
