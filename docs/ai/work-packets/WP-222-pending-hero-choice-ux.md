# WP-222 — Pending Hero Choice UX (Engine Projection + Client Prompt)

## Goal

Make the `reveal-attack-choose` player choice (WP-220) visible and
actionable in the arena-client. Without this packet, any game that
triggers a `reveal-attack-choose` hero ability is a hard soft-lock:
the engine's dual turn-end guard blocks both `endTurn` and
`advanceStage` at cleanup, but the client has no UI to send
`resolveHeroChoice` — the player cannot proceed.

This WP adds the UIState projection for `pendingHeroChoice`, a
two-button inline prompt component, and client-side turn-action gating
so the player sees a clear "Discard / Put it back" choice and
understands why end-turn is blocked.

## Assumes

- WP-220 merged to `origin/main` — `G.pendingHeroChoice?: PendingHeroChoice`
  field, `resolveHeroChoice` move, and dual turn-end guards all landed.
  Commit `ef06f0a` + `d808c65` present in `git log`.
- `PendingHeroChoice` interface exported from
  `packages/game-engine/src/types.ts` (lines 410-417): `{ choiceType:
  'discard-or-return'; cardId: CardExtId; playerID: string }`.
- `resolveHeroChoice` registered in `game.ts` `moves:` as
  `{ move: resolveHeroChoice, client: false }` (line 295).
- `UIState` interface at `packages/game-engine/src/ui/uiState.types.ts`
  does NOT yet include a `pendingHeroChoice` field.
- `UiMoveName` union at `apps/arena-client/src/components/play/uiMoveName.types.ts`
  does NOT yet include `'resolveHeroChoice'` (currently 10 names).
- `useTurnActions` composable at
  `apps/arena-client/src/composables/useTurnActions.ts` has no
  pending-choice awareness.
- Baseline test counts: engine **1165**, arena-client **484**.
- `pnpm --filter @legendary-arena/game-engine build` exits 0.
- `pnpm --filter arena-client test` exits 0.

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §Layer Boundary — engine UIState projection
  boundary; `apps/arena-client` may import types from
  `@legendary-arena/game-engine` (`.` subpath, Runtime-Safe Surface only)
- `.claude/rules/architecture.md` §Layer Boundary — import rules table
- `docs/ai/REFERENCE/00.6-code-style.md` — human-style code, `// why:`,
  no `.reduce()`, descriptive names
- `packages/game-engine/src/ui/uiState.types.ts` — UIState interface,
  existing type conventions (`UICardDisplay`, `UIDisplayEntry`,
  optional-field convention)
- `packages/game-engine/src/ui/uiState.build.ts` — `buildUIState()`
  projection logic, `resolveDisplay()` helper
- `packages/game-engine/src/ui/uiState.filter.ts` —
  `filterUIStateForAudience()` redaction logic
- `apps/arena-client/src/components/play/uiMoveName.types.ts` —
  `UiMoveName` union + `SubmitMove` alias
- `apps/arena-client/src/composables/useTurnActions.ts` — stage-gating
  composable, `GatingResult` pattern
- `apps/arena-client/src/pages/PlayDesktop.vue` — page compositor,
  component mounting, prop-drilling pattern
- `apps/arena-client/src/pages/PlayMobile.vue` — same patterns
- `apps/arena-client/src/components/play/TurnActionBar.vue` — end-turn
  button, gate bindings
- `docs/ai/DECISIONS.md` — D-22001..D-22003 (WP-220 decisions)

## Scope (In)

### Engine — UIState Projection (4 files modified)

- **`uiState.types.ts`**: New `UIPendingHeroChoice` interface. New
  optional field `pendingHeroChoice?: UIPendingHeroChoice` on `UIState`.
- **`uiState.build.ts`**: Project `G.pendingHeroChoice` into
  `UIState.pendingHeroChoice` via `resolveDisplay()` for the card's
  display data. `undefined` when `G.pendingHeroChoice` is `undefined`.
- **`uiState.filter.ts`**: Pass-through — no redaction. The revealed
  card is face-up at the physical table; all audiences see it.
- **`index.ts`**: Export `UIPendingHeroChoice` type from the engine barrel.

### Client — UX Components (5 files: 3 modified, 2 new)

- **`uiMoveName.types.ts`**: Add `'resolveHeroChoice'` to `UiMoveName`
  union (10 → 11). Update JSDoc count.
- **`useTurnActions.ts`**: Add optional `hasPendingChoice?: boolean`
  parameter (default `false`). Gating semantics:
  - `canEndTurn()` returns `{ allowed: false, reason: ... }` when BOTH
    `currentStage === 'cleanup'` AND `hasPendingChoice === true`
  - `canPassPriority()` returns `{ allowed: false, reason: ... }` when
    BOTH `currentStage === 'cleanup'` AND `hasPendingChoice === true`
  - At non-cleanup stages, `hasPendingChoice` has no effect on either gate
  - `hasPendingChoice` MUST be derived from
    `UIState.pendingHeroChoice !== undefined` at the call site (page
    component) — the composable does not read UIState internally
- **`PendingHeroChoicePrompt.vue`** (NEW): Inline prompt (not a modal —
  the choice is game-blocking and cannot be dismissed). Shows the
  revealed card (name + image via `UICardDisplay`), cost, and two
  buttons: "Discard" and "Put it back". Fires
  `submitMove('resolveHeroChoice', { resolution: 'discard' | 'return' })`.
  Props contract:
  ```
  pendingHeroChoice?: UIPendingHeroChoice  // from UIState projection
  viewerPlayerId: string | null            // from viewer computed
  submitMove: SubmitMove                   // prop-drilled from page
  ```
  Rendering formula (strict boolean):
  - Prompt MUST render iff
    `pendingHeroChoice !== undefined AND viewerPlayerId === pendingHeroChoice.playerID`
  - Prompt MUST NOT render in all other cases (including `viewerPlayerId === null`)
  Button behavior:
  - Both buttons MUST be disabled immediately after either is clicked
    (local `isSubmitting` ref; prevents double-submit race). The
    component unmounts when the next server frame clears
    `pendingHeroChoice`, so `isSubmitting` does not need resetting.
  Layout rules:
  - Renders inside the same container as `TurnActionBar`, above it in
    DOM order
  - MUST NOT use `position: fixed` or `<Teleport>`
  - Lives in the normal document flow within the player-zone `<template>`
- **`PlayDesktop.vue`**: Mount `PendingHeroChoicePrompt` inside the
  `v-if="viewer !== null"` template block, between the player zone and
  `TurnActionBar`. Pass `pendingHeroChoice`, `submitMove`, viewer's
  `playerId`. Add `hasPendingChoice` boolean prop to `TurnActionBar`.
  When `hasPendingChoice === true`:
  - End Turn button MUST be disabled with gate reason tooltip
  - Pass Priority MUST be disabled ONLY when `currentStage === 'cleanup'`
    with gate reason tooltip
- **`PlayMobile.vue`**: Same mounting + wiring pattern as `PlayDesktop`.

### Tests (5 files: 3 modified, 2 new)

- **`uiState.build.test.ts`**: ≥4 new tests — projection when
  `G.pendingHeroChoice` is set (with display resolution), projection
  when absent (`undefined`), projection with unknown cardId (fallback
  display), aliasing defense (`display` reference `!==` source
  `G.cardDisplayData` entry).
- **`uiState.types.drift.test.ts`**: Pin `UIPendingHeroChoice` field
  names.
- **`useTurnActions.test.ts`**: ≥4 new tests — `canEndTurn` blocked
  when `hasPendingChoice` is true at cleanup; `canPassPriority` blocked
  at cleanup; both allowed when `hasPendingChoice` is false; both
  allowed at non-cleanup stages regardless of `hasPendingChoice`.
- **`PendingHeroChoicePrompt.test.ts`** (NEW): ≥7 tests — renders card
  name; fires discard move; fires return move; hidden when
  `pendingHeroChoice` is undefined; hidden when viewer is not the
  choosing player; hidden when `viewerPlayerId` is `null`; buttons
  disabled after first click (double-submit prevention).
- **`TurnActionBar.test.ts`**: ≥2 new tests — end-turn disabled when
  `hasPendingChoice` is true; pass-priority disabled at cleanup when
  `hasPendingChoice` is true.

## Out of Scope

- **Reconnect / resume semantics** for pending choice after
  disconnect — separate hardening WP.
- **Animation / transition effects** on the prompt appearance — CSS
  transitions may be added later; this WP ships functional behavior.
- **Card image rendering** beyond what `UICardDisplay` already provides
  (name, imageUrl, cost) — the prompt uses the existing `CardTile`
  component or inline display. No new image pipeline.
- **Multiple simultaneous pending choices** (queue / stack) —
  `G.pendingHeroChoice` is a single optional field with reject-second
  policy (D-22001). Future multi-choice needs a separate WP.
- **Spectator-specific "Player X is choosing..." indicator** — a
  nice-to-have, not required for playability. May be added in a
  follow-up.
- **Engine changes** to `G.pendingHeroChoice`, `resolveHeroChoice`,
  or the dual turn-end guards — those are WP-220's domain and are
  locked.
- **`uiState.filter.ts` redaction logic** — pending choice is public
  (pass-through). If future choice types need privacy, that's a
  separate WP.

## Files Expected to Change

### Engine — UIState Projection
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — add `UIPendingHeroChoice` + `pendingHeroChoice?` field on `UIState`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project `G.pendingHeroChoice` with `resolveDisplay()`
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — pass-through spread copy for aliasing defense
- `packages/game-engine/src/index.ts` — **modified** — export `UIPendingHeroChoice` type

### Engine — Tests
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — ≥3 projection tests
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — drift pin for `UIPendingHeroChoice`

### Client — Components
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — **modified** — add `'resolveHeroChoice'` (10 → 11)
- `apps/arena-client/src/composables/useTurnActions.ts` — **modified** — add `hasPendingChoice` parameter
- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue` — **new** — inline choice prompt
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — mount prompt, wire props
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — mount prompt, wire props

### Client — Tests
- `apps/arena-client/src/composables/useTurnActions.test.ts` — **modified** — ≥4 pending-choice gate tests
- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.test.ts` — **new** — ≥5 component tests
- `apps/arena-client/src/components/play/TurnActionBar.test.ts` — **modified** — ≥2 pending-choice disable tests

### Governance
- `docs/ai/DECISIONS.md` — **modified** — D-22201..D-22203
- `docs/ai/STATUS.md` — **modified**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified**
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified**

**Total: 18 files (14 code/test + 4 governance)**

## Non-Negotiable Constraints

**Engine-wide:**
- Full file contents for every new or modified file (no diffs, no snippets)
- ESM only; Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- `// why:` comments on every non-obvious design decision
- No `.reduce()` in projection logic
- No boardgame.io imports in `uiState.types.ts`, `uiState.build.ts`, or `uiState.filter.ts`

**UIState projection contract:**
- `UIPendingHeroChoice` is a UI-safe type — no engine internals
- The projection includes `display: UICardDisplay` resolved via
  `resolveDisplay()` so the client never performs a registry lookup
- `undefined` means "no pending choice" (matching engine convention)
- The projection MUST be constructed as a fresh object — direct spread of
  `G.pendingHeroChoice` is forbidden. Construction order:
  1. Call `resolveDisplay(G.pendingHeroChoice.cardId, gameState)`
  2. Build `{ choiceType, cardId, playerID, display }` from primitives +
     the resolved display result
  3. No additional fields may be added (strict 4-field projection contract)
- `choiceType`, `cardId`, and `playerID` MUST be copied verbatim from
  `G.pendingHeroChoice` — no transformation, no normalization
- Aliasing defense: the `display` object reference MUST be `!==` any
  object in `G.cardDisplayData` (guaranteed by `resolveDisplay()` spread)
- Audience filter passes through without redaction (D-22202)

**Client-layer:**
- No imports from `apps/server/**`
- All game moves dispatched through `submitMove` prop (type: `SubmitMove`)
- `UiMoveName` is the sole permitted move-name vocabulary — no bare strings
- Component uses `defineComponent({ setup() { return {...} } })` per
  D-6512 SFC authoring rule
- The prompt is NOT a modal / NOT dismissible — the player must choose
- `useTurnActions` signature is backwards-compatible: `hasPendingChoice`
  defaults to `false` so existing callers are unaffected

**Session protocol:**
- Stop and ask if any scope or contract ambiguity arises

**Locked values:**
- `UIPendingHeroChoice = { choiceType: 'discard-or-return'; cardId: string; playerID: string; display: UICardDisplay }` — strict 4-field contract; no additional fields
- `UiMoveName` count after: **11**
- `useTurnActions` pending-choice gate reason: `'Resolve the revealed card choice before ending your turn.'`
- Prompt buttons: "Discard" (`{ resolution: 'discard' }`) and "Put it back" (`{ resolution: 'return' }`)
- Prompt rendering formula: `pendingHeroChoice !== undefined AND viewerPlayerId === pendingHeroChoice.playerID`
- Prompt props: `pendingHeroChoice?: UIPendingHeroChoice`, `viewerPlayerId: string | null`, `submitMove: SubmitMove`
- Prompt `isSubmitting` ref: set `true` on first button click; both buttons disabled while `true`
- `resolveHeroChoice` is `client: false` (server-only execution) — no change

## Acceptance Criteria

1. `UIState.pendingHeroChoice` is `undefined` when `G.pendingHeroChoice` is
   `undefined`.
2. `UIState.pendingHeroChoice` is a `UIPendingHeroChoice` with correct
   `choiceType`, `cardId`, `playerID`, and `display` when
   `G.pendingHeroChoice` is set.
3. `UIPendingHeroChoice.display` is a new object reference (`!==`)
   compared to any entry in `G.cardDisplayData` — guaranteed by
   `resolveDisplay()` spread. Mutation of the projection MUST NOT
   affect `G`.
4. `filterUIStateForAudience` passes `pendingHeroChoice` through unchanged
   for all audiences (player, opponent, spectator).
5. `UIPendingHeroChoice` type is exported from
   `@legendary-arena/game-engine` barrel.
6. `UiMoveName` union includes `'resolveHeroChoice'` (11 members total).
7. `useTurnActions` with `hasPendingChoice: true` returns
   `{ allowed: false, reason: ... }` for `canEndTurn()` at cleanup stage.
8. `useTurnActions` with `hasPendingChoice: true` returns
   `{ allowed: false, reason: ... }` for `canPassPriority()` at cleanup stage.
9. `useTurnActions` with `hasPendingChoice: true` does NOT block
   `canPassPriority()` at non-cleanup stages (player must still be able to
   advance through start and main).
10. `PendingHeroChoicePrompt` renders card name and two buttons when
    `pendingHeroChoice` is defined and viewer is the choosing player.
11. "Discard" button calls `submitMove('resolveHeroChoice', { resolution: 'discard' })`.
12. "Put it back" button calls `submitMove('resolveHeroChoice', { resolution: 'return' })`.
13. `PendingHeroChoicePrompt` is hidden (does not render) when
    `pendingHeroChoice` is `undefined`.
14. `PendingHeroChoicePrompt` is hidden when the viewer is not the choosing
    player (spectator or opponent perspective).
15. `PlayDesktop` and `PlayMobile` both mount `PendingHeroChoicePrompt` and
    pass `hasPendingChoice` to `TurnActionBar`.
16. Drift test pins `UIPendingHeroChoice` field names (exactly 4 fields).
17. Prompt renders iff `pendingHeroChoice !== undefined` AND
    `viewerPlayerId === pendingHeroChoice.playerID`. Does NOT render when
    `viewerPlayerId` is `null`.
18. Prompt buttons are disabled immediately after either is clicked
    (local `isSubmitting` ref). Only one `resolveHeroChoice` move may be
    submitted per prompt instance.
19. Gate reason string for `canEndTurn` and `canPassPriority` at cleanup
    with pending choice exactly matches the locked value.
20. Engine tests ≥ **1170** (baseline 1165 + ≥4 projection + ≥1 drift).
21. Client tests ≥ **497** (baseline 484 + ≥7 prompt + ≥4 gate + ≥2 bar).

## Verification Steps

```bash
# Engine tests — projection + drift + aliasing
pnpm --filter @legendary-arena/game-engine test
# Expected: ≥1170 pass, 0 fail

# Engine build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0

# Client tests — component + composable + bar + double-submit
pnpm --filter arena-client test
# Expected: ≥497 pass, 0 fail

# Full monorepo build
pnpm -r build
# Expected: exits 0

# Verify export
grep 'UIPendingHeroChoice' packages/game-engine/src/index.ts
# Expected: 1 line (type export)

# Verify UiMoveName count
grep -c "'resolveHeroChoice'" apps/arena-client/src/components/play/uiMoveName.types.ts
# Expected: 1

# Verify useTurnActions signature
grep 'hasPendingChoice' apps/arena-client/src/composables/useTurnActions.ts
# Expected: ≥1 line
```

## Definition of Done

- [ ] All 21 acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine test` — ≥1170 pass, 0 fail
- [ ] `pnpm --filter arena-client test` — ≥497 pass, 0 fail
- [ ] `pnpm -r build` exits 0
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated — D-22201..D-22203 Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-222 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-254 updated
- [ ] No files outside §Files Expected to Change modified
