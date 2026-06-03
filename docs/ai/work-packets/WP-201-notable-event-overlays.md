# WP-201 — Notable Event Overlays (Arena Client)

## Goal

Replace the arena-client's brittle `useRevealDetector` + minimal
`RevealOverlay` ("Scheme Twist!" / "Master Strike!" name-only flashes) with
a typed `useNotableEventStream` consumer + a descriptive
`NotableEventOverlay` that surfaces "what happened" for every Fight,
Ambush, Scheme Twist, and Master Strike by reading the structured
`UIState.notableEvents` log shipped by WP-200. This adds the missing
Fight overlay, drops `G.messages` string parsing, and renders an
engine-composed narrative alongside the card name + event-type chip.

---

## Assumes

- **WP-200 ✅ Done 2026-06-02 (PR #192 @ 52d64e2)** — engine event log
  + `UIState.notableEvents` projection landed. The 4 files under
  `packages/game-engine/src/events/` exist; `NotableGameEvent`
  discriminated union + `eventCardId`-resolvable id fields + the
  projection through `uiState.build.ts` + `uiState.filter.ts` are all
  on main. This WP consumes that contract directly.
- WP-061 ✅ — arena-client app exists with Vue 3 + Vite + node:test.
- WP-111 ✅ — `UIState.cardDisplayData` populated; the overlay reads card
  names via `cardDisplayData[cardId].name`.
- WP-128 ✅ — `UIState.log` projection precedent (the existing reveal
  detector reads this; this WP replaces that pattern with
  `UIState.notableEvents`).
- WP-164 ✅ — Autoplay playback controls (precedent for arena-client
  components that mount only when a probe / event source is available).
- `apps/arena-client/src/composables/useRevealDetector.ts` exists and is
  the file being replaced.
- `apps/arena-client/src/components/play/RevealOverlay.vue` exists and is
  the file being replaced.
- **Drafting baseline:** `origin/main @ 52d64e2` (post-WP-200 merge;
  initial draft was authored against `84f7729` but WP-201 preflight
  re-ran against the post-WP-200-execution baseline so the consumed
  contract is verifiably present on main rather than assumed).

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Section 1 — Layer Boundary (Authoritative)` —
  arena-client may import the runtime-safe engine surface (the `.`
  subpath) and reads UIState projections only. It MUST NOT import
  `@legendary-arena/registry` runtime, `@legendary-arena/game-engine/setup`,
  or the server layer.
- `docs/ai/DECISIONS.md` D-20001..D-20007 (proposed by WP-200) — the
  contract this WP consumes. In particular D-20002 (narrative is engine-
  composed plain English; client-side composition forbidden) and D-20005
  (`appliedEffects` is exposed for Fight/Ambush, not for Twist/Strike).
- `packages/game-engine/src/events/notableEvents.types.ts` (WP-200) —
  `NotableGameEvent` discriminated union; imported via the runtime-safe
  engine surface.
- `apps/arena-client/src/composables/useRevealDetector.ts` — the file
  being replaced. Watches `villainDeckCount`, identifies destination via
  diffing UIState shape + string-matching `log` for bystanders. This WP
  deletes it.
- `apps/arena-client/src/components/play/RevealOverlay.vue` — the file
  being replaced. Renders card name + hard-coded destination label.
- `apps/arena-client/src/pages/PlayDesktop.vue` and
  `apps/arena-client/src/pages/PlayMobile.vue` — wire the existing
  reveal detector + overlay. This WP rewires them to the new composable
  + overlay (and the new Fight event source).
- `apps/arena-client/src/components/play/SchemeTile.vue` and
  `apps/arena-client/src/components/play/MastermindTile.vue` — existing
  tile components that visualise scheme / mastermind state.
  **Out of scope** — this WP does not change tiles.

---

## Context

WP-200 ships a typed `NotableGameEvent` log in `G.notableEvents`,
projected through `UIState.notableEvents`. The arena-client today
shows a 2-second overlay only for villain-deck reveals (city /
scheme-twist / mastermind-strike / bystander) with a card name plus a
hard-coded destination label — no Fight overlay at all, no description
of *what* a Scheme Twist or Master Strike actually did, and a fragile
`.includes('bystander')` log-string match for the bystander case.

This WP swaps the data source from snapshot-diff + log-string-match to
the structured `UIState.notableEvents` stream, replaces the overlay with
a descriptive variant that renders the engine's composed narrative
alongside the card name + event-type chip, and adds the missing Fight
overlay (driven by `FightResolved` events). The visual border colours
keyed on event type are preserved (city / scheme-twist / mastermind-
strike), with a new Fight colour added.

---

## Scope (In)

- **`useNotableEventStream(snapshot)` composable** — pure FIFO over
  `uiState.notableEvents`; tracks a **consumption cursor** (the last
  consumed array index) and a queue of unseen events. Each snapshot
  frame, the composable enqueues every event whose index is `>= cursor`
  (and `< notableEvents.length`); events flow through `currentEvent`
  sequentially via the queue. The cursor advances on `dismiss()` and
  on the auto-dismiss-driven advance to the next queued event. Events
  with `index < cursor` MUST NOT re-emit under any condition — including
  component remount, snapshot reactivity reset, or Vue HMR. Per-event-
  type styling lives in the overlay; the composable is data-only.
- **`eventCardId(event)` pure helper** — exported alongside the
  composable; centralises the per-variant id-field branching so the
  overlay template, the tests, and any future consumer share one
  source of truth (D-20104).
- **`NotableEventOverlay.vue`** — new component rendering:
  - **Card name** — looked up from `UIState.cardDisplayData[cardId].name`
    using the discriminator-appropriate id (`cardId` for Fight, `revealedCardId`
    for Ambush, `twistCardId` for Twist, `strikeCardId` for Strike).
    Falls back to the raw ext_id string if display data is absent.
  - **Event-type chip** — locked labels:
    - `fightResolved` → "Fought" (purple border, new)
    - `ambushResolved` → "Ambush!" (purple border)
    - `schemeTwistResolved` → "Scheme Twist!" (gold border, same as today)
    - `mastermindStrikeResolved` → "Master Strike!" (red border, same as today)
  - **Narrative paragraph** — the event's `narrative` field rendered
    verbatim (engine-composed plain English, single sentence per
    D-20002). No client-side rewording.
  - **Applied-effect badges** (Fight + Ambush only) — small chips
    showing each entry of `appliedEffects` as a humanised label
    (e.g., `koHeroCurrentPlayer` → "KO Hero"). Locked label map.
    Omitted when `appliedEffects: []`.
  - 2.5-second auto-dismiss (modestly longer than the legacy 2.0 s to
    give the narrative reading room). Configurable via `durationMs`
    prop; default 2500. The auto-dismiss timer MUST be cleared and
    restarted whenever a new event becomes current — regardless of
    how the previous event ended (manual `dismiss()` or auto-fired).
    Mounting a new event MUST reset any existing timer before
    starting a new one (single timer invariant).
  - Queue handling: if multiple new events arrive in one snapshot
    frame (e.g., a chained reveal) — and equally when one or more
    snapshot frames are skipped (a snapshot gap) — ALL unseen events
    between the previous cursor and the current `notableEvents.length`
    MUST be enqueued in array index order and displayed sequentially
    (no loss, no reordering, no collapsing). The queue is strictly
    FIFO over the array index ordering.
- **`PlayDesktop.vue` rewire** — replace the
  `useRevealDetector` + `RevealOverlay` usage with
  `useNotableEventStream` + `NotableEventOverlay`. Same mount semantics
  (visible only when a snapshot is present), same `data-testid` shape
  on the overlay element (renamed to `play-notable-event-overlay` to
  reflect the new contract). **`PlayMobile.vue` is intentionally NOT
  in scope** — preflight 2026-06-02 confirmed it carries zero
  `useRevealDetector` / `RevealOverlay` imports on `main @ 52d64e2`
  (pre-WP-201 Mobile has no reveal-overlay coverage at all). Mobile
  overlay coverage is deferred to a future WP if the operator decides
  Mobile should mirror Desktop's new descriptive overlays; this WP
  scopes strictly to the replace-don't-add path.
- **Locked humanised effect-label map** — exactly five entries
  matching `VILLAIN_EFFECT_KEYWORDS`:
  - `gainWoundEachPlayer` → "Each player gains a Wound"
  - `gainWoundCurrentPlayer` → "You gain a Wound"
  - `koHeroCurrentPlayer` → "KO a Hero"
  - `heroDeckTopToEscape` → "Hero deck top escapes"
  - `captureBystander` → "Captures a Bystander"
- **Tests** — composable diff tests (event arrives → currentEvent
  set; dismiss → cleared; queued multi-event handling), overlay
  rendering tests per event type (chip label, border colour via
  `data-event-type` attribute, narrative text rendered verbatim,
  effect badges present/absent appropriately), and a PlayDesktop
  integration test confirming the overlay mounts for each of the
  four event types.

## Out of Scope

- **Bystander-reveal overlay** — the legacy `RevealOverlay` flashed
  "Bystander captured" via `log.includes('bystander')`. WP-200's
  `NotableGameEvent` union does not include a bystander-reveal
  variant (per the user's stated scope: fight / ambush / twist /
  mastermind). Bystander reveals continue to occur in the engine and
  surface via `UIState.log`; the structured overlay does NOT cover
  them. A future WP may add a fifth variant if requested.
- **Event-log history view** — UIState.notableEvents is unbounded
  append-only (per D-20004). This WP renders only the latest unseen
  events as transient overlays. A scrollable history panel is a
  future WP.
- **Tile-level effect indicators** — scheme / mastermind / city tile
  components are not modified. Effects show via the overlay only.
- **Audio cues, animations beyond the existing fade transition,
  haptic feedback** — out of scope; future WP.
- **i18n / localisation** — the narrative is engine-composed English
  (D-20002). Humanised effect-label map is hard-coded English.
- **Server-side / engine changes** — none. This WP touches the
  arena-client only.

---

## Files Expected to Change

1. `apps/arena-client/src/composables/useNotableEventStream.ts` —
   **new** — composable + an exported pure helper
   `eventCardId(event: NotableGameEvent): CardExtId` (resolves the
   discriminator-appropriate id per variant — `cardId` for Fight,
   `revealedCardId` for Ambush, `twistCardId` for Twist, `strikeCardId`
   for Strike — so overlay + tests share one source of truth and the
   per-variant id-field branching doesn't drift across consumers).
   The composable exposes the engine event directly as
   `NotableGameEvent`; no wrapper interface, no synthetic metadata
   (no timestamps, no client-generated IDs, no derived identity
   fields). Event identity is implicit by `notableEvents` index per
   WP-200 §Non-Negotiable Constraints (engine-side: "Event identity
   is implicit by index position in G.notableEvents") + D-20104
   (arena-client-side: cursor over the same array).
2. `apps/arena-client/src/composables/useNotableEventStream.test.ts` —
   **new** — diff-detection tests, queue handling, dismiss behaviour.
3. `apps/arena-client/src/components/play/NotableEventOverlay.vue` —
   **new** — component implementing the chip + name + narrative +
   effect badges.
4. `apps/arena-client/src/components/play/NotableEventOverlay.test.ts` —
   **new** — per-event-type rendering, locked label assertions, badge
   omission when `appliedEffects: []`, fallback to raw cardId on
   missing display data.
5. `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** —
   replace `useRevealDetector` import + `RevealOverlay` usage with
   the new composable + overlay; preserve mount semantics.
6. `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified
   (additive)** — extend existing tests with new integration
   assertions that each of the four event types triggers the overlay
   with the matching `data-event-type` attribute. Pre-existing
   `PlayDesktop` assertions remain byte-identical.
7. `apps/arena-client/src/composables/useRevealDetector.ts` —
   **DELETED**.
8. `apps/arena-client/src/components/play/RevealOverlay.vue` —
   **DELETED**.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- Full file contents for every new or modified file. No diffs / snippets.
- ESM only.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — no
  abbreviations, JSDoc on every exported function and component prop set.
- No `@legendary-arena/registry` import in any arena-client file.
- No `@legendary-arena/game-engine/setup` import (Setup-Tooling
  Surface; D-14401 / D-9905) — runtime-safe `.` subpath only.
- The narrative string is rendered VERBATIM. No client-side rewording,
  truncation, or transformation beyond standard Vue text interpolation.

**Packet-specific:**
- The composable consumes `UIState.notableEvents` via the existing
  snapshot ref pattern; it does NOT subscribe to `boardgame.io` or
  the bgio client directly.
- **FIFO queue invariant.** The composable MUST maintain an internal
  FIFO queue of unseen events. When `notableEvents.length` increases
  by N (in one frame or across skipped frames), all N events MUST be
  enqueued in array index order and displayed sequentially. No
  collapsing, no dropping, no reordering.
- **Consumption cursor invariant.** The composable MUST track the
  last consumed array index. Events with `index < cursor` MUST NOT
  re-emit under any condition — component remount, snapshot
  reactivity reset, Vue HMR, or a snapshot whose `notableEvents`
  reference is replaced wholesale. The cursor is the sole source of
  re-emission protection; length-diff alone is insufficient (it
  fails on remount + on snapshot reset).
- **No synthetic metadata.** The composable exposes the engine event
  directly as `NotableGameEvent`. No timestamps, no client-generated
  IDs, no wrapper interfaces, no derived identity fields may be
  introduced. Event identity is derived solely from array index
  progression (the cursor).
- **`dismiss()` advances the queue.** Calling `dismiss()` MUST
  immediately advance the cursor and move to the next queued event
  (or to null if the queue is empty). The auto-dismiss timer MUST be
  cleared on every event boundary (manual dismiss OR auto-fire) and
  restarted for the next event — single timer invariant; never two
  timers in flight.
- **UI does not interpret events.** The overlay MUST NOT derive
  meaning from event structure beyond rendering the provided fields.
  No conditional logic may alter narrative wording, effect
  semantics, or event meaning. Branching is allowed ONLY for
  per-event-type styling (border colour, chip label) and for
  presence/absence of `appliedEffects` rendering. Engine authority
  over semantics is non-negotiable (D-20002 + D-20105).
- **Effect-label map totality.** The label map MUST be total over
  `VillainEffectKeyword`. The overlay's rendering loop MUST handle
  every entry in `appliedEffects`. Unknown keywords (e.g., if the
  engine expands the union in a future WP and the arena-client
  bundle predates that expansion) MUST render the raw keyword
  string verbatim — silent-skip is forbidden (it hides real data).
- Event-type chip labels are LOCKED to the four labels above.
- Effect-label map is LOCKED to the five entries above. Adding a
  sixth tracks with the engine's `VILLAIN_EFFECT_KEYWORDS` (locked
  per WP-185 §Non-Negotiable Constraints).
- Effect badges render in the order of `appliedEffects` AS RETURNED
  by the engine (dispatch order, per WP-200 D-20003). The overlay
  MUST NOT sort, de-duplicate, or reorder the array — iterate it
  positionally with `v-for`. The order is meaningful (it reflects the
  order effects fired) and is part of the replay-deterministic event
  payload.
- Border colours preserve the existing reveal-overlay convention:
  - city / Fight / Ambush → `--color-villain` (purple)
  - scheme-twist → `--color-scheme-twist` (gold)
  - mastermind-strike → `--color-master-strike` (red)
  Note: Fight uses the villain colour (defeating a villain is a
  villain-coloured event).
- `data-testid="play-notable-event-overlay"` and
  `data-event-type="<NotableGameEventType>"` attributes are required
  on the overlay root (for e2e + test assertions).
- The overlay MUST set `aria-live="polite"`, `role="status"`, AND
  `aria-atomic="true"` (so the full chip+name+narrative message is
  announced cohesively when the overlay content changes; carrying
  forward + improving over `RevealOverlay`'s prior 2-attribute set).
- **Strict delete enforcement.** No source file in
  `apps/arena-client/src/` may import or reference
  `useRevealDetector` or `RevealOverlay` — including type-only
  imports (`import type { ... }`), JSDoc references, code comments,
  or string literals. The grep gate in §Verification Steps is
  literal and case-sensitive; matches are FAIL.

**Session protocol:**
- If `UIState.notableEvents` is undefined (older engine), the
  composable safe-skips: `currentEvent` stays null, no error. This
  guards against running the arena-client against a pre-WP-200
  engine bundle.
- The DELETE of `useRevealDetector.ts` and `RevealOverlay.vue` is
  unconditional in this WP. No deprecation comment, no parallel
  surfaces — the structured stream is the sole event source going
  forward.

---

## Acceptance Criteria

- [ ] `apps/arena-client/src/composables/useNotableEventStream.ts`
  exposes a composable with the signature
  `(snapshot: Ref<UIState | null>) => { currentEvent: Ref<NotableGameEvent | null>, dismiss(): void }`.
- [ ] The composable yields each new event in order when
  `notableEvents.length` grows by ≥ 1 between frames; multiple new
  events display sequentially with the auto-dismiss timer chaining
  them.
- [ ] `NotableEventOverlay.vue` renders the card name (looked up
  from `cardDisplayData`), the locked event-type chip label, and the
  event's `narrative` verbatim.
- [ ] Fight + Ambush events render an effect-badge row when
  `appliedEffects.length > 0`; the row is omitted when the array is
  empty.
- [ ] Each `VillainEffectKeyword` renders the locked humanised label
  (covered by tests for all five entries).
- [ ] Overlay element exposes
  `data-testid="play-notable-event-overlay"` and
  `data-event-type="<type>"` and uses `aria-live="polite"` +
  `role="status"` + `aria-atomic="true"`.
- [ ] `RevealOverlay.vue` and `useRevealDetector.ts` are DELETED;
  grep for `useRevealDetector\|RevealOverlay` across
  `apps/arena-client/src/` (any extension; literal substring; not
  limited to imports) returns zero matches.
- [ ] `PlayDesktop.vue` uses the new composable + overlay; the
  integration test confirms the overlay mounts for each of the four
  event types. (`PlayMobile.vue` not in scope — see §Scope (In).)
- [ ] **Composable safe-skip** — when the snapshot is `null` OR when
  `snapshot.value.notableEvents` is `undefined`, the composable
  initialises cleanly: `currentEvent.value === null`, no error, no
  console warning, no internal state change. A dedicated test
  exercises both branches.
- [ ] **Multi-event index order** — when N > 1 events arrive in a
  single frame, they MUST display strictly in `notableEvents` array
  order. A test fixture pushes 3 events at once and asserts the
  observed `currentEvent` sequence matches the array order
  byte-for-byte.
- [ ] **Snapshot-gap recovery** — when a snapshot frame is skipped
  (test simulates frame 1 → frame 3 with frame 2 holding an event
  the composable never saw), every unseen event between the previous
  cursor and the new length is enqueued in order; none is dropped.
- [ ] **No re-emission after consume** — a test simulates component
  remount (composable disposed + recreated against the same snapshot
  ref AFTER the cursor advanced past index 0) and asserts that
  already-consumed events do NOT re-emit.
- [ ] **Auto-dismiss timer single-instance invariant** — a test
  triggers manual `dismiss()` mid-timer and asserts that the next
  event receives a full fresh timer (not the remainder of the prior
  timer; no overlapping timers).
- [ ] **`eventCardId` helper** — exported from the composable
  module; the overlay template AND the overlay test use it (grep
  for inline `event.cardId ?? event.revealedCardId ?? …` ternary
  patterns returns zero matches outside the helper itself).
- [ ] **Effect-label totality** — the overlay renders ALL five
  current `VILLAIN_EFFECT_KEYWORDS` with the locked humanised label;
  an additional test exercises an unknown keyword fed via a
  synthetic event (typecast escape) and asserts the raw keyword
  string is rendered verbatim (no silent skip, no throw).
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0.
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0.
- [ ] `pnpm -r build` exits 0.
- [ ] No new `@legendary-arena/registry` or
  `@legendary-arena/game-engine/setup` imports in arena-client.

---

## Verification Steps

```pwsh
# Build + test arena-client
pnpm --filter @legendary-arena/arena-client build
pnpm --filter @legendary-arena/arena-client test

# Confirm legacy files removed
test ! -f apps/arena-client/src/composables/useRevealDetector.ts && echo "OK: useRevealDetector.ts deleted"
test ! -f apps/arena-client/src/components/play/RevealOverlay.vue && echo "OK: RevealOverlay.vue deleted"

# Confirm new files exist
test -f apps/arena-client/src/composables/useNotableEventStream.ts && echo "OK: stream composable present"
test -f apps/arena-client/src/components/play/NotableEventOverlay.vue && echo "OK: overlay present"

# Layer-boundary greps (each must return zero matches)
grep -rn "@legendary-arena/registry" apps/arena-client/src/composables/useNotableEventStream.ts
grep -rn "@legendary-arena/game-engine/setup" apps/arena-client/src

# Confirm no remaining references to the deleted files — ANY occurrence
# (imports, type imports, comments, JSDoc, string literals) is FAIL.
# The grep is intentionally broad: literal substring across all file
# extensions under arena-client src; must return zero matches.
grep -rn "useRevealDetector\|RevealOverlay" apps/arena-client/src

# Locked label map sanity — all five effect keywords appear in the overlay
grep -nc "koHeroCurrentPlayer\|captureBystander\|gainWoundEachPlayer\|gainWoundCurrentPlayer\|heroDeckTopToEscape" apps/arena-client/src/components/play/NotableEventOverlay.vue

# eventCardId helper is the only id-resolution surface — overlay must NOT
# inline the per-variant ternary; only `useNotableEventStream.ts` is allowed
# to switch on the discriminator field name.
grep -rn "event\.cardId\s*[?]\?" apps/arena-client/src/components/play/NotableEventOverlay.vue
grep -rn "event\.revealedCardId\|event\.twistCardId\|event\.strikeCardId" apps/arena-client/src/components/play/NotableEventOverlay.vue

# Synthetic-metadata negative gate — no client-side timestamps,
# Date.now(), or generated identity fields on events
grep -rn "Date\.now\(\|performance\.now\(\|Math\.random\(" apps/arena-client/src/composables/useNotableEventStream.ts
grep -rn "NotableEventStreamEvent\|eventId\|generatedAt\|timestamp" apps/arena-client/src/composables/useNotableEventStream.ts

# aria-atomic gate
grep -n "aria-atomic" apps/arena-client/src/components/play/NotableEventOverlay.vue

# Full monorepo build
pnpm -r build
```

Expected outputs: legacy files deleted; new files present; zero
references to the deleted files (literal substring search); zero
registry / setup-subpath imports; all five effect-keyword labels found
in the overlay; zero per-variant id-field ternaries in the overlay
template (helper is the sole resolution surface); zero `Date.now` /
`performance.now` / `Math.random` calls and zero
`NotableEventOverlay`-side synthetic metadata fields
(`NotableEventStreamEvent`, `eventId`, `generatedAt`, `timestamp`) in
the composable; one `aria-atomic` occurrence on the overlay root;
arena-client + monorepo builds pass.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with a `### WP-201 Executed` block.
- [ ] `docs/ai/DECISIONS.md` updated with **D-20101..D-20105**:
  - D-20101: `useNotableEventStream` replaces `useRevealDetector`;
    bystander string-parse permanently removed from the arena-client.
  - D-20102: humanised effect-label map is LOCKED to the five
    `VILLAIN_EFFECT_KEYWORDS` entries; additions track with the engine.
    Unknown keywords render the raw keyword string (no silent skip).
  - D-20103: Fight events use the villain border colour; the chip label
    "Fought" is locked.
  - D-20104: Composable contract is FIFO queue + consumption cursor;
    no synthetic metadata (no timestamps, no client-generated IDs, no
    wrapper interfaces). Event identity is derived solely from
    `notableEvents` array index progression. Re-emission after
    consume is forbidden under all conditions (component remount,
    snapshot reactivity reset, Vue HMR). The exported `eventCardId`
    pure helper is the single source of truth for per-variant id
    resolution.
  - D-20105: UI layer does not interpret event semantics. The
    overlay renders the engine-provided fields (cardId family,
    narrative, appliedEffects) and applies per-event-type styling
    only; no client-side derivation of meaning is permitted. This
    extends D-20002's engine-authority rule from narrative
    composition to all event interpretation.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-201 flipped to
  `[x]` with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-228 flipped
  to `Done`.
- [ ] No files outside the 8-file `## Files Expected to Change` list
  were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness — players see what
happened), §4 (UI legibility), §22 (replay determinism — the overlay
reads deterministically-composed narratives).

**Conflict assertion:** none. UI-only change consuming an additive
engine projection.

**Non-Goal proximity check:** none of NG-1..NG-7 are crossed.

**Determinism preservation:** the overlay reads
`UIState.notableEvents` which is deterministic by construction in
WP-200. The arena-client introduces no new randomness, no clocks, no
side-channels.

---

## Funding Surface Gate

N/A — no §20.1 trigger surfaces touched (no funding affordance, no
account-required gates, no profile funding attribution).

---

## API Catalog Update

N/A — arena-client UI WP; no HTTP endpoints added/modified/removed.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites with status (incl. **WP-200 hard-dep**) | ✅ |
| 3 | Context (Read First) is specific (file paths) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract; 8 files (incl. 2 deletes); `eventCardId` helper lives inside `useNotableEventStream.ts` per Files row 1 (no new file added by operator review pass; PlayMobile.vue dropped at preflight after grep confirmed zero reveal-pattern imports on main @ 52d64e2) | ✅ |
| 6 | Non-Negotiable Constraints section present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps are operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — runtime-safe engine surface only; no setup subpath; no registry runtime | ✅ |
| 11 | Identity model N/A — no auth surface | N/A |
| 12 | Test rules: node:test + Vue test utils per arena-client convention | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance criteria objective and scope-aligned | ✅ (19 binary items after operator review pass — added multi-event order, snapshot-gap recovery, no-re-emission, single-timer invariant, `eventCardId` usage, effect-label totality, and the explicit safe-skip null/undefined branches) |
| 15 | Definition of Done includes STATUS / DECISIONS (D-20101..D-20105) / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, no .reduce in event handling | ✅ |
| 17 | Vision Alignment present; clauses §1 / §4 / §22; determinism line included | ✅ |
| 18 | Prose-vs-grep: §Verification Steps grep targets are scoped to filenames | ✅ |
| 19 | Bridge-vs-HEAD staleness rule — commit-time discipline | N/A |
| 20 | Funding surface N/A with explicit justification | ✅ |
| 21 | API catalog N/A with explicit justification | ✅ |

---

*Drafted 2026-06-02. Baseline `origin/main @ 84f7729`. **Hard prerequisite:
WP-200 must land first.** Paired engine + UI WPs mirror the WP-185/187
+ WP-186/188 pattern; this is the UI half. D-20101..D-20105 reserved
(D-20104 + D-20105 added 2026-06-02 from operator review pass — FIFO
queue + consumption cursor + no-synthetic-metadata invariant, plus the
UI-does-not-interpret-events clause that extends D-20002's engine-
authority rule from narrative composition to all event semantics).*
