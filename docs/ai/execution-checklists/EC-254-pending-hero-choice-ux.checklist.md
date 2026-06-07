# EC-254 — Pending Hero Choice UX (Execution Checklist)

**Source:** docs/ai/work-packets/WP-222-pending-hero-choice-ux.md
**Layer:** Game Engine (UIState projection) + Arena Client (UX)
**Status:** Draft — ready for review

## Before Starting

- [ ] WP-220 merged to origin/main — commits `ef06f0a` + `d808c65` present in `git log`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — baseline **1165** passing
- [ ] `pnpm --filter arena-client test` exits 0 — baseline **484** passing
- [ ] `UIState` in `uiState.types.ts` does NOT have a `pendingHeroChoice` field
- [ ] `UiMoveName` in `uiMoveName.types.ts` has exactly **10** members
- [ ] `G.pendingHeroChoice` exists in `types.ts` (WP-220 landed)

## Locked Values (do not re-derive)

- `UIPendingHeroChoice = { choiceType: 'discard-or-return'; cardId: string; playerID: string; display: UICardDisplay }` — strict 4-field contract; no additional fields
- `UIState.pendingHeroChoice?: UIPendingHeroChoice` — absent value is `undefined`
- Projection construction: call `resolveDisplay(cardId, gameState)`, then build `{ choiceType, cardId, playerID, display }` from primitives + resolved display. Direct spread of `G.pendingHeroChoice` is forbidden. `choiceType`/`cardId`/`playerID` copied verbatim (no transformation)
- `display` reference MUST be `!==` any object in `G.cardDisplayData` (aliasing defense via `resolveDisplay()` spread)
- Audience filter: pass-through for all audiences (no redaction) — face-up card at physical table (D-22202)
- `UiMoveName` count after: **11** (adds `'resolveHeroChoice'`)
- `useTurnActions` new param: `hasPendingChoice?: boolean` (default `false` — backwards-compatible)
- Gating: `canEndTurn` + `canPassPriority` blocked when BOTH `currentStage === 'cleanup'` AND `hasPendingChoice === true`. No effect at non-cleanup stages. `hasPendingChoice` derived from `UIState.pendingHeroChoice !== undefined` at call site (not inferred internally)
- Pending-choice gate reason: `'Resolve the revealed card choice before ending your turn.'`
- Prompt buttons: "Discard" → `{ resolution: 'discard' }`, "Put it back" → `{ resolution: 'return' }`
- Component: `PendingHeroChoicePrompt.vue` — `defineComponent` per D-6512; NOT a modal; NOT dismissible; NOT `position: fixed`; NOT `<Teleport>`
- Prompt props: `pendingHeroChoice?: UIPendingHeroChoice`, `viewerPlayerId: string | null`, `submitMove: SubmitMove`
- Prompt renders iff `pendingHeroChoice !== undefined AND viewerPlayerId === pendingHeroChoice.playerID`. MUST NOT render when `viewerPlayerId` is `null`
- Double-submit prevention: local `isSubmitting` ref set `true` on first button click; both buttons disabled while `true`. Only one `resolveHeroChoice` move per prompt instance

## Guardrails

- `UIPendingHeroChoice` is a UI-safe type — no engine internals (no `hookRegistry`, no `cardStats`)
- Projection uses `resolveDisplay()` — client never does a registry lookup
- Aliasing defense: projection is a fresh `{ ...spread }` object, not an alias into G
- No `.reduce()` in projection or filter logic
- Filter pass-through MUST use the conditional-assignment pattern: `if (uiState.pendingHeroChoice !== undefined) { result.pendingHeroChoice = { ...uiState.pendingHeroChoice, display: { ...uiState.pendingHeroChoice.display } } }` — matches `gameOver` pattern at filter line 426; do NOT assign `pendingHeroChoice: undefined` on the result literal (`exactOptionalPropertyTypes`)
- Prompt layout: same container as TurnActionBar, above it in DOM order; no `position: fixed`; no `<Teleport>`
- Disabled buttons MUST show gate reason string in `title` attribute (tooltip) — same pattern as existing TurnActionBar gates
- No boardgame.io imports in `uiState.types.ts`, `uiState.build.ts`, or `uiState.filter.ts`
- `canPassPriority` gating at cleanup only — start and main must remain passable (player must advance through stages to reach the prompt)
- `hasPendingChoice` defaults to `false` — existing `useTurnActions` callers unaffected
- Prompt fires `submitMove` (typed `SubmitMove`) — no bare string move names
- Engine move `resolveHeroChoice` stays `client: false` — server-only; this WP does NOT modify it

## Required `// why:` Comments

- `uiState.types.ts`, `UIPendingHeroChoice` interface: cite D-22201
- `uiState.types.ts`, `pendingHeroChoice?` field on `UIState`: cite D-22201 + WP-222
- `uiState.build.ts`, projection block: cite D-22201 + explain resolveDisplay aliasing defense
- `uiState.filter.ts`, pass-through: cite D-22202 (public — face-up card at physical table)
- `useTurnActions.ts`, pending-choice gate: cite D-22203 + explain cleanup-only gating
- `PendingHeroChoicePrompt.vue`, both button handlers: cite WP-220 + explain resolution values

## Files to Produce

- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `UIPendingHeroChoice` + `pendingHeroChoice?`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — projection via `resolveDisplay()`
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — pass-through spread copy
- `packages/game-engine/src/index.ts` — **modified** — export `UIPendingHeroChoice`
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — ≥4 projection tests (includes aliasing defense)
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — drift pin
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — **modified** — add `'resolveHeroChoice'`
- `apps/arena-client/src/composables/useTurnActions.ts` — **modified** — `hasPendingChoice` param
- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue` — **new** — inline choice prompt
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — mount prompt + wire pending prop
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — mount prompt + wire pending prop
- `apps/arena-client/src/composables/useTurnActions.test.ts` — **modified** — ≥4 gate tests
- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.test.ts` — **new** — ≥7 tests (includes null viewer + double-submit)
- `apps/arena-client/src/components/play/TurnActionBar.test.ts` — **modified** — ≥2 disable tests

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0, count ≥ **1170**
- [ ] `pnpm --filter arena-client test` exits 0, count ≥ **497**
- [ ] `pnpm -r build` exits 0
- [ ] `UIState.pendingHeroChoice` field present with correct optional type
- [ ] `UIPendingHeroChoice` exported from engine barrel (`index.ts`)
- [ ] `UiMoveName` has 11 members (includes `'resolveHeroChoice'`)
- [ ] `useTurnActions({ hasPendingChoice: true })` blocks endTurn + passPriority at cleanup
- [ ] `PendingHeroChoicePrompt` renders only for choosing player when pending
- [ ] "Discard" button → `submitMove('resolveHeroChoice', { resolution: 'discard' })`
- [ ] "Put it back" button → `submitMove('resolveHeroChoice', { resolution: 'return' })`
- [ ] Prompt renders only when `pendingHeroChoice !== undefined AND viewerPlayerId === playerID`; hidden when viewer is `null`
- [ ] Buttons disabled after first click (`isSubmitting` ref); only one move per prompt instance
- [ ] `display` reference `!==` source `G.cardDisplayData` entry (aliasing defense test passes)
- [ ] D-22201..D-22203 Active in DECISIONS.md
- [ ] No files outside §Files Expected to Change modified

## Common Failure Smells

- `UIState.pendingHeroChoice` always undefined → `uiState.build.ts` projection block missing or keyed wrong
- `display` is undefined on `UIPendingHeroChoice` → `resolveDisplay()` not called; raw `G.pendingHeroChoice` spread without display resolution
- `pendingHeroChoice` visible to wrong player → audience filter redacting when it shouldn't (D-22202 says pass-through)
- End-turn still clickable with pending choice → `hasPendingChoice` prop not wired from `PlayDesktop`/`PlayMobile` to `TurnActionBar`, or `useTurnActions` gate not checking the flag
- `canPassPriority` blocked at start/main with pending choice → gate check not scoped to cleanup stage
- `resolveHeroChoice` move rejected by engine → `UiMoveName` not updated; `submitMove` type check blocking the call
- Prompt renders for opponents → viewer-is-choosing-player guard missing or inverted
- Aliasing test fails → projection returns `G.pendingHeroChoice` directly instead of a spread copy with resolveDisplay
- Two moves fire on double-click → `isSubmitting` ref not set on first click, or buttons not bound to `:disabled="isSubmitting"`
- Prompt renders for spectator/opponent → rendering formula missing `viewerPlayerId === playerID` check, or `viewerPlayerId` is truthy for wrong player
