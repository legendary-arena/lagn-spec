# WP-243 — Villain Fight KO-Hero Player Choice: UX (Projection + Client Prompt + Discard Visibility)

**Status:** Draft
**Primary Layer:** Game Engine (UIState projection) + arena-client
**Dependencies:** WP-242 (engine `pendingKoHeroChoices` queue + `resolveKoHeroChoice` move + block-all guards) — **must be merged to `origin/main` first**. WP-220/WP-222 (the `pendingHeroChoice` projection + `PendingHeroChoicePrompt` pattern this mirrors) ✅. WP-128/D-12803 (zone-redaction posture) ✅.
**Co-release lock:** WP-242 and WP-243 ship together. WP-242 alone freezes the board on a KO choice the client cannot send; this packet is the UI that lets a human resolve it.

---

## Goal

Make the WP-242 KO-a-Hero player choice visible and actionable in the
arena-client, and fix the related gap Jeff flagged: **the player cannot
currently see the cards in their discard pile** (the UIState projects only
`discardCount` + `discardTopCard`, never the full contents).

After this packet:

- The active player's **full own discard contents** are projected
  (`discardCards` / `discardDisplay`, parallel arrays mirroring the existing
  `handCards` / `handDisplay`), redacted for other audiences exactly like the
  hand. The `YourDeckDiscardZone` component gains an expandable full-discard
  view (the standing "can't see my discard" gap, fixed).
- A `UIPendingKoHeroChoice` projection surfaces the **front** of the engine's
  KO-choice queue with the freshly-computed eligible targets (every non-wound
  card across the chooser's discard + hand + inPlay, each with display data),
  plus a `remaining` count. It is **redacted for every audience except the
  choosing player** — the eligible list contains that player's hand identities,
  which opponents must not see (a deliberate departure from the public
  `pendingHeroChoice` posture).
- A `PendingKoHeroChoicePrompt.vue` renders the eligible cards as a selectable
  list; clicking one fires `submitMove('resolveKoHeroChoice', { zone, cardId })`.
  It is not dismissible (game-blocking) and shows "N KOs remaining" when the
  queue holds more than one.
- Client turn-action gating disables End Turn and Pass Priority while a KO
  choice is pending (any stage), with a clear reason — matching the engine
  block-all.

---

## Assumes

- **WP-242 merged to `origin/main`:** `G.pendingKoHeroChoices?: PendingKoHeroChoice[]`
  (`{ choiceType: 'ko-hero'; playerID: string }`), the `resolveKoHeroChoice`
  move registered `{ ..., client: false }` with payload
  `{ zone: 'discard' | 'hand' | 'inPlay'; cardId: CardExtId }`, and the
  block-all + dual turn-end guards all landed.
- `UIPlayerState` (in `uiState.types.ts`) already has `handCards?: string[]` +
  `handDisplay?: UICardDisplay[]` and `inPlayCards?` / `inPlayDisplay?` as the
  redaction-symmetric pattern to copy; `discardTopCard?: UIDisplayEntry | null`
  exists; there is no full-discard field yet.
- `UIState` already has `pendingHeroChoice?: UIPendingHeroChoice` (WP-222) — the
  projection + filter + drift-pin pattern to mirror.
- `resolveDisplay(extId, gameState)` in `uiState.build.ts` resolves
  `UICardDisplay` and returns a fresh (non-aliased) object.
- `filterUIStateForAudience` in `uiState.filter.ts` redacts `handCards` /
  `handDisplay` for `audience !== ownPlayerId` and for spectators — the exact
  posture `discardCards` / `discardDisplay` and `pendingKoHeroChoice` adopt.
- `UiMoveName` union (`apps/arena-client/src/components/play/uiMoveName.types.ts`)
  is at **11** after WP-222 (verify at execution); this WP adds
  `'resolveKoHeroChoice'` → **12**.
- `useTurnActions` (`apps/arena-client/src/composables/useTurnActions.ts`) has
  the `hasPendingChoice` gating parameter from WP-222 — this WP adds a sibling
  `hasPendingKoChoice` parameter.
- `PendingHeroChoicePrompt.vue` + `YourDeckDiscardZone.vue` are the component
  templates to mirror; both use `defineComponent({ setup() { return {...} } })`
  per D-6512.
- The KO eligible set is computed for the choosing player's own zones only;
  hand and inPlay are already projected for the own player, but the buried
  **discard** cards are not — hence the new `discardCards`/`discardDisplay`
  projection is what makes the discard targets renderable.
- Baseline test counts (engine + arena-client) are read at execution from a
  clean `origin/main` post-WP-242; this WP adds cases on top (deltas in
  §Verification Steps).

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — `apps/arena-client` may import
  **types** from `@legendary-arena/game-engine` (`.` subpath, Runtime-Safe
  Surface only); UIState projection lives in the engine, redaction in the
  audience filter.
- `.claude/rules/architecture.md` §Layer Boundary — import-rules table.
- `docs/ai/REFERENCE/00.6-code-style.md` — human-style code, `// why:`,
  no `.reduce()`, descriptive names.
- `packages/game-engine/src/ui/uiState.types.ts` — `UIPlayerState`,
  `UIDisplayEntry`, `UICardDisplay`, `UIPendingHeroChoice`, the optional-field +
  redaction conventions.
- `packages/game-engine/src/ui/uiState.build.ts` — `buildUIState`,
  `resolveDisplay`, how `handCards`/`handDisplay` and `pendingHeroChoice` are
  built.
- `packages/game-engine/src/ui/uiState.filter.ts` — `filterUIStateForAudience`,
  the `handCards` redaction branch.
- `packages/game-engine/src/index.ts` — engine barrel; export the new type.
- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue` +
  `.test.ts` — prompt template + test pattern.
- `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` +
  `.test.ts` — the discard zone to extend with the full-list view.
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — `UiMoveName`
  union + `SubmitMove` alias.
- `apps/arena-client/src/composables/useTurnActions.ts` + `.test.ts` —
  `hasPendingChoice` gating to mirror.
- `apps/arena-client/src/components/play/TurnActionBar.vue` + `.test.ts`,
  `apps/arena-client/src/pages/PlayDesktop.vue`, `PlayMobile.vue` — mounting +
  prop-drilling pattern.
- `docs/ai/DECISIONS.md` — D-12803 (zone redaction), D-22001..D-22003 +
  D-22201..D-22203 (WP-220/WP-222 choice pattern), D-24006..D-24009 (WP-242).

## Scope (In)

### Engine — UIState projection (4 files modified)

1. **`uiState.types.ts`:**
   - Add to `UIPlayerState`: `discardCards?: string[]` and
     `discardDisplay?: UICardDisplay[]` (parallel arrays, length-matched,
     present for the own player, redacted for others — mirrors `handCards` /
     `handDisplay` JSDoc + the exactOptionalPropertyTypes conditional-assignment
     convention). `discardTopCard` stays (backward-compatible).
   - Add `UIPendingKoHeroChoice`:
     ```typescript
     export interface UIPendingKoHeroChoice {
       choiceType: 'ko-hero';
       playerID: string;
       /** Front-of-queue eligible targets, freshly computed from current G. */
       eligible: { zone: 'discard' | 'hand' | 'inPlay'; cardId: string; display: UICardDisplay }[];
       /** Number of KO choices this player still owes (queue length, ≥1). */
       remaining: number;
     }
     ```
   - Add `pendingKoHeroChoice?: UIPendingKoHeroChoice` on `UIState`.

2. **`uiState.build.ts`:**
   - Project `discardCards` (the own player's `discard` ext_ids, verbatim) +
     `discardDisplay` (parallel `resolveDisplay` results) — same construction as
     `handCards`/`handDisplay`.
   - Project `pendingKoHeroChoice` from `G.pendingKoHeroChoices[0]` (the front):
     build `eligible` by scanning the chooser's `discard`, then `hand`, then
     `inPlay`, emitting one entry per **non-wound** card with its zone +
     `resolveDisplay`; dedupe by `(zone, cardId)` (a `Set` of
     `` `${zone}:${cardId}` `` keys; `for...of`, no `.reduce()`). `remaining` =
     `G.pendingKoHeroChoices.length`. `undefined` when the queue is empty.

3. **`uiState.filter.ts`:**
   - Redact `discardCards` / `discardDisplay` for `audience !== ownPlayerId`
     and spectators (omit via conditional assignment — same branch as
     `handCards`).
   - Redact `pendingKoHeroChoice` for every audience **except** the choosing
     player (`audience === pendingKoHeroChoice.playerID`). **Why this differs
     from `pendingHeroChoice`:** the KO eligible list contains the chooser's
     hand identities; leaking it to opponents leaks the hand. Pass-through
     (public) is wrong here. (D-24011.)

4. **`index.ts`:** export `UIPendingKoHeroChoice`.

### Client — components (1 new, 5 modified)

5. **`uiMoveName.types.ts`:** add `'resolveKoHeroChoice'` (11 → 12; update the
   JSDoc count).

6. **`useTurnActions.ts`:** add `hasPendingKoChoice?: boolean` (default
   `false`). While `true`: `canEndTurn()` and `canPassPriority()` return
   `{ allowed: false, reason: ... }` at **every** stage (the KO choice freezes
   the board, unlike the cleanup-only hero-reveal gate). Derived at the call
   site from `UIState.pendingKoHeroChoice !== undefined`.

7. **`PendingKoHeroChoicePrompt.vue` (NEW):** inline, non-dismissible prompt
   rendered **iff** `pendingKoHeroChoice !== undefined AND viewerPlayerId ===
   pendingKoHeroChoice.playerID`. Renders the `eligible` entries as clickable
   `CardTile`s, grouped by zone label ("From your discard / hand / in play"),
   with a heading and "N KOs remaining" when `remaining > 1`. Clicking an entry
   fires `submitMove('resolveKoHeroChoice', { zone: entry.zone, cardId: entry.cardId })`.
   A local `isSubmitting` ref disables all entries after the first click
   (double-submit guard); the component unmounts when the next server frame
   advances the queue. No `position: fixed` / no `<Teleport>`; lives in the
   player-zone flow above `TurnActionBar`. Props:
   `pendingKoHeroChoice?: UIPendingKoHeroChoice`, `viewerPlayerId: string | null`,
   `submitMove: SubmitMove`. `defineComponent({ setup })` per D-6512.

8. **`YourDeckDiscardZone.vue`:** add optional props `discardCards?: string[]`
   and `discardDisplay?: UICardDisplay[]`; add an expandable "View all (N)"
   toggle that lists every discard card as a small `CardTile` when expanded
   (collapsed default keeps the existing top-card view). This is the standing
   "can't see my discard" fix — own player only.

9. **`PlayDesktop.vue` / `PlayMobile.vue`:** mount `PendingKoHeroChoicePrompt`
   inside the `v-if="viewer !== null"` block above `TurnActionBar`; pass
   `pendingKoHeroChoice`, `viewerPlayerId`, `submitMove`; pass
   `hasPendingKoChoice` to `TurnActionBar`; pass `discardCards`/`discardDisplay`
   to `YourDeckDiscardZone`.

### Tests (2 new, ≥6 modified)

10. `uiState.build.test.ts` — ≥11: `discardCards`/`discardDisplay` projected +
    length-matched + non-aliased; `pendingKoHeroChoice` eligible list excludes
    wounds, spans all three zones, sets `remaining`; `undefined` when queue
    empty; **deterministic order** (eligible scanned discard → hand → inPlay in
    array index order; byte-identical for repeated calls on the same `G`);
    **reversed-array pin** (clone `G` with each zone array reversed → eligible
    order matches the new array index order exactly); **within-zone dedupe**
    (same ext_id twice in one zone → one entry; same ext_id in two zones → two
    entries); **defensive copy** (mutating a returned `eligible[*].display` /
    `discardDisplay[*]` field leaves `G` unchanged); **discard symmetry**
    (`discardCards` present iff `discardDisplay` present, length-matched);
    **front entry** projected with `remaining` = queue length; **purity**
    (`buildUIState` does not mutate `G`).
11. `uiState.filter.test.ts` (or the existing filter test file) — ≥4:
    `discardCards`/`discardDisplay` redacted (omitted, together) for non-owner +
    spectator; `pendingKoHeroChoice` present for the chooser; **negative leak
    test** — for an opponent AND a spectator audience, the serialized UIState
    contains `pendingKoHeroChoice === undefined` AND none of the chooser's hand
    ext_ids appear anywhere in the projection.
12. `uiState.types.drift.test.ts` — pin `UIPendingKoHeroChoice` field names.
13. `PendingKoHeroChoicePrompt.test.ts` (NEW) — ≥9: renders eligible cards;
    fires the move with the clicked `{ zone, cardId }`; hidden when
    `pendingKoHeroChoice` undefined; hidden when viewer is not the chooser;
    hidden when `viewerPlayerId` is `null`; **double-click race** — a same-frame
    double-click fires `resolveKoHeroChoice` **exactly once** (handler
    early-returns on `isSubmitting`, not just the DOM `disabled`);
    **render-all-and-only** (renders exactly the projected `eligible`, no
    client-side filter/reorder); **fail-safe** (forced empty `eligible` mock
    renders no actionable entry and fires no move).
14. `useTurnActions.test.ts` — ≥4: end-turn + pass-priority blocked when
    `hasPendingKoChoice` at any stage; allowed when false; **blocked when
    `hasPendingChoice` OR `hasPendingKoChoice`** (either pending system gates).
15. `YourDeckDiscardZone.test.ts` — ≥2: collapsed shows top card only; expanded
    lists all `discardCards`.
16. `TurnActionBar.test.ts` — ≥2: end-turn disabled when `hasPendingKoChoice`;
    **KO gate reason takes precedence** when both gates are active.
17. `PlayDesktop.test.ts` (and `PlayMobile.test.ts` mirror) — ≥1: with both
    `pendingHeroChoice` + `pendingKoHeroChoice`, the **KO prompt renders above**
    the hero-choice prompt, and both render above `TurnActionBar`, in DOM order.

## Out of Scope

- **Engine changes** to `pendingKoHeroChoices`, `resolveKoHeroChoice`, or the
  guards — those are WP-242's domain and are locked.
- **Browsing other players' discard piles** (the general "view any discard,
  anytime" viewer). This WP projects the **own** player's discard only (redacted
  for others, matching the hand). The all-players public-discard browser is a
  separate backlog WP (discard is public at the physical table, so it is
  legitimate — but it is broader scope and not needed for the KO fix).
- **Spectator "Player X is choosing a KO…" indicator** — a nice-to-have;
  `pendingKoHeroChoice` is fully redacted for non-choosers in v1 (mirrors
  WP-222's deferral of the spectator indicator).
- **Reconnect / resume** while a KO choice is pending — separate hardening WP.
- **Animations / transitions** on the prompt — functional behavior only.
- **`koHeroEachPlayer` / `koHeroEachPlayerMag2` UX** — those stay auto-resolved
  in the engine (WP-242 scope decision); no projection needed.

## Files Expected to Change

### Engine — UIState projection
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `discardCards?`/`discardDisplay?` on `UIPlayerState`; `UIPendingKoHeroChoice`; `pendingKoHeroChoice?` on `UIState`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project full own discard + `pendingKoHeroChoice` eligible list
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — redact discard contents (non-owner) + `pendingKoHeroChoice` (non-chooser)
- `packages/game-engine/src/index.ts` — **modified** — export `UIPendingKoHeroChoice`

### Engine — tests
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — ≥7 projection tests (incl. deterministic order, front+remaining, purity)
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — ≥4 redaction tests (incl. opponent+spectator no-hand-leak)
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — drift pin

### Client — components
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — **modified** — add `'resolveKoHeroChoice'` (11 → 12)
- `apps/arena-client/src/composables/useTurnActions.ts` — **modified** — add `hasPendingKoChoice`
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.vue` — **new** — KO selection prompt
- `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` — **modified** — expandable full-discard view
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — mount prompt + wire props
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — mount prompt + wire props

### Client — tests
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.test.ts` — **new** — ≥8 component tests (incl. single-submit, render-all-and-only, dual coexistence)
- `apps/arena-client/src/composables/useTurnActions.test.ts` — **modified** — ≥4 gate tests (incl. OR'd dual-pending gate)
- `apps/arena-client/src/components/play/YourDeckDiscardZone.test.ts` — **modified** — ≥2 expand tests
- `apps/arena-client/src/components/play/TurnActionBar.test.ts` — **modified** — ≥2 disable + KO-reason-precedence tests
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified** — ≥1 dual-prompt DOM-order test
- `apps/arena-client/src/pages/PlayMobile.test.ts` — **modified** — ≥1 dual-prompt DOM-order test (mirror)

### Governance
- `docs/ai/DECISIONS.md` — **modified** — D-24010..D-24012
- `docs/ai/STATUS.md` — **modified**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-243 checked off
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-274 Draft → Done

**Total: ~23 files (19 code/test + 4 governance).** Exceeds the lint §5 ~8-file
guideline — operator-authorised (precedent WP-222 = 18); split across engine
projection + client surfaces that must land together for the choice to work.

## Non-Negotiable Constraints

**Engine-wide:**
- Full file contents for every new or modified file — no diffs, no snippets.
- ESM only; Node v22+. Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- `// why:` on every non-obvious decision; no `.reduce()` in projection/filter.
- No `boardgame.io` import in `uiState.types.ts` / `uiState.build.ts` / `uiState.filter.ts`.

**UIState projection contract:**
- **Purity / replay-neutral.** `buildUIState` MUST NOT mutate `G`. The
  projection is derived state, never persisted or replayed — the determinism
  surface lives entirely in WP-242; this WP adds nothing the replay hash sees.
- `UIPendingKoHeroChoice` is UI-safe — no engine internals; `eligible` entries
  carry only `{ zone, cardId, display }` (display via `resolveDisplay`, so the
  client performs no registry lookup). Built **fresh from current `G` on every
  `buildUIState` call** — no engine-side snapshot (WP-242 stores none), no
  cached or historical eligibility.
- **Front entry only.** `pendingKoHeroChoice` projects
  `G.pendingKoHeroChoices[0]` (the front); `remaining` =
  `G.pendingKoHeroChoices.length` (≥1 whenever the field is present). As entries
  resolve, successive frames project the new front with a decremented
  `remaining`.
- **Deterministic eligible ordering (contractual, not "stored order").** The
  builder iterates **discard, then hand, then inPlay**, and within each zone in
  **array index order** of that zone array (`zones.discard` → `zones.hand` →
  `zones.inPlay`). It MUST NOT derive order from `Object.keys` or iteration of
  any non-array structure. One entry is emitted per non-`WOUND_EXT_ID` card. The
  order is byte-stable across frames for identical `G` so the prompt does not
  reshuffle. Wounds are excluded — the engine already excludes them; the
  projection MUST NOT re-introduce one.
- **Within-zone dedupe by `(zone, cardId)`, first occurrence kept.** Requires a
  `// why:` comment with the accurate rationale: *the same definition-level
  ext_id can legitimately appear multiple times within one zone (e.g., two
  `starting-shield-agent` in discard); KOing any copy of that ext_id in that
  zone is outcome-identical, so the prompt shows one option per `(zone, cardId)`
  rather than N identical buttons.* Dedupe is **per-zone** — the same ext_id in
  two different zones stays two distinct options (a discard-KO and an inPlay-KO
  have different outcomes). Do not "simplify away" the dedupe.
- **Eligible ≥ 1 is an engine guarantee; no client fallback.** Whenever
  `pendingKoHeroChoice` is present, `eligible.length >= 1` (WP-242 appends a
  choice only when ≥2 targets exist, auto-resolves the 1 case, no-ops the 0
  case; the block-all freeze means a queued entry always has ≥1 target at
  resolve time). The projection performs **no** fallback or synthesis. If
  `eligible` were ever empty (engine-invariant violation), the prompt renders
  **no actionable entry** and the turn stays blocked — fail-safe, never an
  implicit client-side pick.
- **Defensive display copy at the projection boundary.** Each
  `eligible[*].display` and `discardDisplay[*]` MUST be constructed as a fresh
  object at the boundary (`{ ...resolveDisplay(...) }`) so the projection holds
  no reference into `G` **even if** `resolveDisplay`'s freshness contract later
  changes. Mutating a projected display field MUST NOT affect `G` (test-pinned).
- **`discardCards` / `discardDisplay` — own player, atomic, length-matched.**
  "Own player" = the player whose `UIPlayerState.playerId` the field belongs to;
  visible only to the audience equal to that `playerId` (redacted by
  `filterUIStateForAudience` otherwise — same posture as `handCards`). Both
  fields MUST be assigned in the **same conditional block** (both present or
  both omitted — never partially assigned during build) and are length-matched
  by index.
- **Redaction (D-24011) — the leak vector is the eligible list.** Because
  `eligible` carries the chooser's **hand** ext_ids, `pendingKoHeroChoice` MUST
  be present **only** for `audience === playerID` and **omitted** (conditional
  assignment — never a `pendingKoHeroChoice: undefined` literal) for **every**
  other audience, opponents **and** spectators alike. A non-chooser's serialized
  UIState MUST contain **none** of the chooser's hand ext_ids via this field.
  `discardCards`/`discardDisplay` are redacted for non-owners by the same
  branch. This is strictly stricter than the public `pendingHeroChoice`.

**Client-layer:**
- Types-only import from `@legendary-arena/game-engine`; no `apps/server` import.
- All moves dispatched through the `submitMove` prop (`SubmitMove`);
  `UiMoveName` is the sole move-name vocabulary — no bare strings.
- Components use `defineComponent({ setup() { return {...} } })` (D-6512).
- **Defense-in-depth render guard.** The prompt MUST independently check
  `viewerPlayerId === pendingKoHeroChoice.playerID` and NOT rely solely on the
  server redaction — belt-and-braces against a future projection regression.
- **Render all-and-only.** The prompt renders **exactly** the projected
  `eligible` entries — it adds none and filters/hides/reorders none client-side
  (it does NOT re-exclude wounds, re-dedupe, or re-sort; the engine projection
  is authoritative). This prevents client/engine divergence.
- **No cached eligibility.** The prompt holds no derived eligible state across
  frames; it re-renders from the live `pendingKoHeroChoice` prop each frame and
  unmounts when the prop clears (`remaining` reaches 0 / field becomes
  `undefined`).
- The prompt is NOT dismissible. **Double-submit guard (two layers):** the
  click handler MUST early-return when `isSubmitting === true` **before** calling
  `submitMove`, AND set `isSubmitting = true` synchronously on entry. The DOM
  `disabled` attribute applies only after the next render tick, so a same-frame
  double-click would otherwise fire twice — the JS early-return, not the DOM
  disable, is the real guard. Net: **exactly one** `resolveKoHeroChoice` fires
  per prompt mount.
- **DOM order.** The prompt MUST render **before** `TurnActionBar` in DOM order
  so the gating context is visible above the (disabled) action controls.
- **Dual-prompt coexistence + ordering.** If both `pendingHeroChoice` (WP-222)
  and `pendingKoHeroChoice` are present for the viewer, BOTH prompts may render;
  each submits its own resolve independently and neither blocks the other
  client-side. The **KO prompt renders above** the hero-choice prompt (higher
  urgency — full board freeze). End Turn / Pass Priority are gated while
  **either** is pending — `useTurnActions` blocks on
  `hasPendingChoice || hasPendingKoChoice`; when both are active, the **KO gate
  reason takes precedence** in the `TurnActionBar` messaging.
- `useTurnActions` stays backward-compatible: `hasPendingKoChoice` defaults
  `false`.

**Session protocol:** stop and ask on any scope or contract ambiguity.

**Locked values:**
- `UIPendingKoHeroChoice = { choiceType: 'ko-hero'; playerID: string; eligible: { zone: 'discard' | 'hand' | 'inPlay'; cardId: string; display: UICardDisplay }[]; remaining: number }`.
- `UiMoveName` count after: **12**.
- Prompt move call: `submitMove('resolveKoHeroChoice', { zone, cardId })`.
- Prompt render formula: `pendingKoHeroChoice !== undefined AND viewerPlayerId === pendingKoHeroChoice.playerID`.
- Gate reason (locked): `'Choose a Hero to KO before taking another action.'`
- Eligible ordering: `zones.discard` → `zones.hand` → `zones.inPlay`, each in **array index order**, dedupe `(zone, cardId)` first-occurrence (deterministic, byte-stable across frames; no `Object.keys`/non-array iteration).
- `remaining` ≥ 1 whenever `pendingKoHeroChoice` is present (engine guarantee; no client fallback if violated); the "N KOs remaining" counter shows only when `remaining > 1`.
- Turn-action gate predicate: `hasPendingChoice || hasPendingKoChoice` (blocks End Turn + Pass Priority while EITHER is pending); KO gate reason takes precedence when both are active.
- `resolveKoHeroChoice` is `client: false` (no change — WP-242 owns it).

## Acceptance Criteria

1. `UIState.pendingKoHeroChoice` is `undefined` when the engine queue is empty;
   a correct `UIPendingKoHeroChoice` (front entry) when non-empty, with
   `eligible` spanning the chooser's non-wound discard + hand + inPlay cards
   (deduped by `(zone, cardId)`) and `remaining` = queue length.
2. `eligible[*].display` references are `!==` any `G.cardDisplayData` entry
   (aliasing defense via `resolveDisplay` spread).
3. `UIPlayerState.discardCards` / `discardDisplay` project the own player's full
   discard, length-matched; `undefined` for non-owners and spectators after the
   audience filter.
4. `pendingKoHeroChoice` is redacted (omitted) for every audience except the
   choosing player; present only for `audience === pendingKoHeroChoice.playerID`.
5. `UIPendingKoHeroChoice` exported from the engine barrel; `UiMoveName` includes
   `'resolveKoHeroChoice'` (12 total); the drift test pins the
   `UIPendingKoHeroChoice` fields.
6. `useTurnActions` with `hasPendingKoChoice: true` blocks `canEndTurn` and
   `canPassPriority` at every stage (gate reason matches the locked value);
   allows both when `false`.
7. `PendingKoHeroChoicePrompt` renders iff `pendingKoHeroChoice !== undefined AND
   viewerPlayerId === pendingKoHeroChoice.playerID`; hidden when undefined, when
   the viewer is not the chooser, and when `viewerPlayerId` is `null`. Clicking
   an eligible card fires `submitMove('resolveKoHeroChoice', { zone, cardId })`
   with that card's zone + id; entries disable after the first click.
8. `YourDeckDiscardZone` shows the top card collapsed and lists all
   `discardCards` when expanded (own player); `PlayDesktop` + `PlayMobile` mount
   the prompt and pass `hasPendingKoChoice` to `TurnActionBar`.
9. `pnpm --filter @legendary-arena/game-engine test`, `pnpm --filter arena-client test`,
   `pnpm --filter arena-client typecheck`, and `pnpm -r build` all exit 0 (test
   counts above their post-WP-242 baselines).
10. **Deterministic eligible order:** `eligible` is byte-identical across
    repeated `buildUIState` calls on the same `G`, ordered discard → hand →
    inPlay in stored zone order; the prompt's card list does not reshuffle
    between frames.
11. **Projection purity:** `buildUIState` does not mutate `G`; mutating the
    returned `pendingKoHeroChoice` or `discardDisplay` does not affect `G`.
12. **No hand leak:** for an opponent audience and a spectator audience,
    `pendingKoHeroChoice` is `undefined` and **none** of the chooser's hand
    ext_ids appear anywhere in the serialized UIState.
13. **Front + remaining:** the projection reflects `G.pendingKoHeroChoices[0]`
    with `remaining` = queue length (≥1); successive frames project the new
    front with a decremented `remaining`.
14. **Render all-and-only / single-submit:** the prompt renders exactly the
    projected `eligible` entries (no client-side filter, reorder, or addition)
    and fires exactly one `resolveKoHeroChoice` per mount (entries disabled
    after the first click).
15. **Dual coexistence:** with both `pendingHeroChoice` and `pendingKoHeroChoice`
    present for the viewer, both prompts render and submit independently; End
    Turn + Pass Priority are blocked while either is pending
    (`hasPendingChoice || hasPendingKoChoice`).
16. **Zone-order determinism:** with `G` cloned and its zone arrays reversed,
    `eligible` order matches the new array index order exactly (discard array
    order, then hand, then inPlay) — order is derived from array index, never
    `Object.keys`.
17. **Within-zone dedupe:** a zone holding the same ext_id twice (e.g., two
    `starting-shield-agent` in discard) yields exactly one eligible entry for
    that `(zone, cardId)`; the same ext_id present in two different zones yields
    two entries.
18. **Defensive display copy:** mutating a projected `eligible[*].display` or
    `discardDisplay[*]` field does not affect `G` (each is a fresh object at the
    projection boundary).
19. **Discard symmetry:** `discardCards` is present iff `discardDisplay` is
    present (assigned in the same block, never one without the other) and the two
    are length-matched.
20. **Double-submit guard:** a same-frame double-click on an eligible card fires
    `resolveKoHeroChoice` exactly once (the click handler early-returns on
    `isSubmitting`, independent of the DOM `disabled` tick).
21. **Eligible ≥1, fail-safe, dual-prompt UX:** when `pendingKoHeroChoice` is
    present `eligible.length >= 1`; an (invariant-violating) empty set renders no
    actionable entry and never auto-picks client-side; with both prompts present
    the KO prompt renders above the hero-choice prompt and the KO gate reason
    takes precedence.

## Verification Steps

```bash
# Engine projection + redaction + drift
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; ≥ post-WP-242 baseline + ~16 new cases

# Client component + composable + discard expand + bar
pnpm --filter arena-client test
# Expected: exits 0; ≥ baseline + ~20 new cases

# Client typecheck — REQUIRED (vue-tsc; UIState field adds historically drift to main)
pnpm --filter arena-client typecheck
# Expected: exits 0, no new vue-tsc error vs baseline

pnpm -r build
# Expected: exits 0

grep 'UIPendingKoHeroChoice' packages/game-engine/src/index.ts
# Expected: 1 line (type export)

grep -c "'resolveKoHeroChoice'" apps/arena-client/src/components/play/uiMoveName.types.ts
# Expected: 1
```

## Lint Gate Self-Review

| § | Result | Notes |
|---|---|---|
| §1 Structure | PASS | Goal, Assumes, Context, Scope (In), Out of Scope, Files, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done all present; Out of Scope lists 6 exclusions |
| §2 Constraints | PASS | Engine-wide + projection + client + session + locked values; forbids diffs/snippets; references 00.6 |
| §3 Prerequisites | PASS | WP-242 dependency + field/move shapes; `resolveDisplay`, `handCards` posture, `UiMoveName` baseline |
| §4 Context | PASS | Specific engine + client files + ARCHITECTURE §Layer Boundary + DECISIONS ids |
| §5 Output | PASS | ~23 files, each new/modified with one-line change; over-8 operator-authorised (WP-222 precedent) |
| §6 Naming | PASS | `pendingKoHeroChoice`, `discardCards`/`discardDisplay`, `resolveKoHeroChoice`, `cardId`, `zone` consistent |
| §7 Dependencies | PASS | No new npm deps |
| §8 Architecture | PASS | Engine projection + audience redaction in engine; client imports types only; no `apps/server` import |
| §9 Windows | PASS | pnpm + grep; no Unix assumptions |
| §10 Env vars | N/A | None |
| §11 Auth | N/A | No auth surface |
| §12 Tests | PASS | node:test (engine) + arena-client harness; no network/DB; redaction + aliasing covered |
| §13 Verification | PASS | Exact pnpm commands + typecheck gate + expected output |
| §14 ACs | PASS | 21 binary, observable, specific items (count over the 6–12 guideline — WP-222 precedent; each is a distinct projection/redaction/render path) |
| §15 DoD | PASS | STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope check |
| §16 Code style | PASS | 00.6 referenced; `// why:`; no `.reduce()`; `defineComponent({ setup })` |
| §17 Vision | N/A | UI projection + prompt for an existing engine choice; no scoring/replay/RNG/identity/monetization surface (the determinism change lives in WP-242) |
| §18 Prose/grep | N/A | Verification greps target project tokens, not forbidden-import literals |
| §19 Staleness | N/A | Commit-time discipline, not WP-lint |
| §20 Funding | N/A | Gameplay UI only |
| §21 API catalog | N/A | No HTTP endpoint; `resolveKoHeroChoice` is a boardgame.io move |

**Verdict:** PASS.

## Definition of Done

- [ ] All 21 acceptance criteria pass.
- [ ] `discardCards`/`discardDisplay` projected (own player) + redacted (others);
      `YourDeckDiscardZone` expandable full-discard view.
- [ ] `UIPendingKoHeroChoice` + `pendingKoHeroChoice?` projected (front entry,
      fresh eligible list with deterministic discard→hand→inPlay order,
      `remaining`); `buildUIState` does not mutate `G`.
- [ ] **No hand leak:** `pendingKoHeroChoice` (and `discardCards`/`discardDisplay`)
      redacted for opponents AND spectators; negative test proves no chooser
      hand ext_id appears in a non-chooser's UIState (D-24011).
- [ ] `UIPendingKoHeroChoice` exported; `UiMoveName` → 12; drift pin added.
- [ ] `PendingKoHeroChoicePrompt.vue` mounted in both pages; renders all-and-only
      the projected `eligible`; fires exactly one `submitMove` per mount;
      coexists with `PendingHeroChoicePrompt`; `useTurnActions` gates end-turn +
      pass-priority on `hasPendingChoice || hasPendingKoChoice`.
- [ ] **Determinism + safety pins:** eligible order from array index (reversed-
      array test), within-zone dedupe, defensive display copy (mutation leaves
      `G` unchanged), discard `cards`/`display` both-or-neither, double-click
      fires exactly one move (handler early-return), KO prompt above hero prompt
      + KO gate-reason precedence.
- [ ] `pnpm --filter @legendary-arena/game-engine test` — pass, 0 fail.
- [ ] `pnpm --filter arena-client test` — pass, 0 fail.
- [ ] `pnpm --filter arena-client typecheck` exits 0 (no new vue-tsc error).
- [ ] `pnpm -r build` exits 0.
- [ ] `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-24010..D-24012 Active),
      `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change modified.
