# EC-274 — Villain Fight KO-Hero Player Choice: UX (Execution Checklist)

**Source:** docs/ai/work-packets/WP-243-villain-fight-ko-hero-player-choice-ux.md
**Layer:** Game Engine (UIState projection) + arena-client

## Before Starting
- [ ] **WP-242 merged to `origin/main`** — `G.pendingKoHeroChoices`, `resolveKoHeroChoice` move, block-all + turn-end guards all present
- [ ] WP-220/WP-222 ✅ (`pendingHeroChoice` projection + `PendingHeroChoicePrompt` pattern to mirror)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — record BASELINE
- [ ] `pnpm --filter arena-client test` exits 0 — record BASELINE
- [ ] `pnpm --filter arena-client typecheck` exits 0 — record BASELINE (vue-tsc; UIState field adds have drifted to main before — WP-166/207/227)

## Locked Values (do not re-derive)
- `UIPendingKoHeroChoice = { choiceType: 'ko-hero'; playerID: string; eligible: { zone: 'discard' | 'hand' | 'inPlay'; cardId: string; display: UICardDisplay }[]; remaining: number }`
- `UIPlayerState` new fields: `discardCards?: string[]`, `discardDisplay?: UICardDisplay[]`
- `UiMoveName` count after = **12** (was 11 post-WP-222)
- Prompt move call: `submitMove('resolveKoHeroChoice', { zone, cardId })`
- Prompt render formula: `pendingKoHeroChoice !== undefined AND viewerPlayerId === pendingKoHeroChoice.playerID`
- Gate reason: `'Choose a Hero to KO before taking another action.'`
- Eligible ordering: `zones.discard` → `zones.hand` → `zones.inPlay`, each in **array index order** (no `Object.keys`/non-array iteration), dedupe `(zone, cardId)` first-occurrence (deterministic, byte-stable)
- `remaining` ≥ 1 when `pendingKoHeroChoice` is present (engine guarantee; no client fallback); counter shown only when `remaining > 1`
- Turn-action gate predicate = `hasPendingChoice || hasPendingKoChoice`; KO gate reason takes precedence when both active
- "own player" = the player whose `UIPlayerState.playerId` the field belongs to (discard fields visible only to that audience — same posture as `handCards`)

## Guardrails
- `pendingKoHeroChoice` is built from the FRONT of the engine queue (`[0]`), `remaining` = queue length; eligible recomputed fresh from current `G` every `buildUIState` call (no snapshot, no cached/historical eligibility)
- **Projection purity / replay-neutral:** `buildUIState` MUST NOT mutate `G`; the projection is derived state, never persisted or replayed
- **Deterministic eligible order:** scan `zones.discard` → `zones.hand` → `zones.inPlay` in **array index order** (never `Object.keys`/non-array iteration); dedupe `(zone, cardId)` first-occurrence is **per-zone** (same ext_id in two zones stays two options); byte-identical across repeated calls on the same `G`; `for...of`, no `.reduce()`
- **Redaction (D-24011) — eligible is the hand-leak vector:** `pendingKoHeroChoice` present ONLY for `audience === playerID`; omitted (conditional assignment, never an `undefined` literal) for opponents AND spectators. A non-chooser's serialized UIState must contain NONE of the chooser's hand ext_ids. `discardCards`/`discardDisplay` redacted together for non-owners (same branch as `handCards`)
- **Discard symmetry:** `discardCards` + `discardDisplay` assigned in the SAME conditional block (both or neither, length-matched) — never partially assigned
- **Defensive copy:** `eligible[*].display` AND `discardDisplay[*]` built as fresh objects at the boundary (`{ ...resolveDisplay(...) }`) even if `resolveDisplay` returns fresh — mutating a projected display field must leave `G` unchanged
- **Defense-in-depth:** the prompt independently checks `viewerPlayerId === pendingKoHeroChoice.playerID` — never relies solely on server redaction
- **Render all-and-only + single-submit:** the prompt renders exactly the projected `eligible` (no client filter / reorder / re-exclude wounds); holds no cached eligibility, unmounts when the prop clears; the click handler **early-returns when `isSubmitting === true`** (the JS guard, not the DOM `disabled` tick, blocks a same-frame double-fire) so exactly one `resolveKoHeroChoice` fires per mount
- **Dual coexistence + ordering + fail-safe:** both prompts may render — KO prompt **above** the hero-choice prompt, both **above** `TurnActionBar` in DOM order; each submits independently; gate blocks on `hasPendingChoice || hasPendingKoChoice`. `eligible.length >= 1` is an engine guarantee — empty set ⇒ render no actionable entry, never a client auto-pick
- Client imports TYPES only from `@legendary-arena/game-engine`; no `apps/server` import; `defineComponent({ setup })` (D-6512); prompt not dismissible; `useTurnActions` `hasPendingKoChoice` defaults `false`

## Required `// why:` Comments
- `uiState.filter.ts` `pendingKoHeroChoice` redaction: why non-chooser redaction differs from public `pendingHeroChoice` (hand-leak, D-24011)
- `uiState.build.ts` eligible builder: wound exclusion + **within-zone** `(zone, cardId)` dedupe (same ext_id can appear twice in one zone; KOing either copy is identical — show one option, not N buttons)
- `useTurnActions.ts`: KO gate blocks at every stage (board frozen), unlike the cleanup-only hero-reveal gate

## Files to Produce
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `discardCards?`/`discardDisplay?`; `UIPendingKoHeroChoice`; `pendingKoHeroChoice?`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project discard + `pendingKoHeroChoice` eligible
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — redact discard (non-owner) + `pendingKoHeroChoice` (non-chooser)
- `packages/game-engine/src/index.ts` — **modified** — export `UIPendingKoHeroChoice`
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — ≥11 (order, reversed-array, within-zone dedupe, defensive copy, discard symmetry)
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — ≥4 (incl. opponent+spectator no-leak)
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — drift pin
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — **modified** — add `'resolveKoHeroChoice'` (→12)
- `apps/arena-client/src/composables/useTurnActions.ts` — **modified** — `hasPendingKoChoice`
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.vue` — **new** — KO selection prompt
- `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` — **modified** — expandable full-discard view
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — mount prompt + wire props
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — mount prompt + wire props
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.test.ts` — **new** — ≥9 (incl. double-click one-submit, render-all-and-only, fail-safe)
- `apps/arena-client/src/composables/useTurnActions.test.ts` — **modified** — ≥4 (incl. OR'd gate)
- `apps/arena-client/src/components/play/YourDeckDiscardZone.test.ts` — **modified** — ≥2
- `apps/arena-client/src/components/play/TurnActionBar.test.ts` — **modified** — ≥2 (incl. KO-reason precedence)
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified** — ≥1 dual-prompt DOM-order
- `apps/arena-client/src/pages/PlayMobile.test.ts` — **modified** — ≥1 dual-prompt DOM-order (mirror)

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — ≥ BASELINE + ~16
- [ ] `pnpm --filter arena-client test` exits 0 — ≥ BASELINE + ~20
- [ ] `pnpm --filter arena-client typecheck` exits 0 — no new vue-tsc error vs BASELINE
- [ ] `pnpm -r build` exits 0
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated — D-24010..D-24012 Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-274 Draft → Done
- [ ] `git diff --name-only` = exactly the allowlist files

## Common Failure Smells (Optional)
- Opponent can see the chooser's eligible list ⇒ `pendingKoHeroChoice` redaction missing in `uiState.filter.ts` (hand leak, D-24011)
- vue-tsc red on `main` after merge ⇒ typecheck gate skipped; an optional UIState field consumed without a guard
- Prompt shows for a spectator ⇒ render formula not checking `viewerPlayerId === pendingKoHeroChoice.playerID`
- Discard "View all" empty ⇒ `discardCards`/`discardDisplay` not passed from the page to `YourDeckDiscardZone`
- Prompt cards reshuffle between frames ⇒ eligible order not deterministic (zone-scan order not pinned)
- End Turn allowed while a hero-reveal choice is pending ⇒ gate not OR'd (`hasPendingChoice || hasPendingKoChoice`)
- Same-frame double-click fires two KOs ⇒ handler doesn't early-return on `isSubmitting` (the DOM `disabled` tick is too late)
- A projected display mutated and `G` changed ⇒ missing defensive copy (`{ ...resolveDisplay() }`) at the boundary
- `discardCards` present without `discardDisplay` (or vice versa) ⇒ not assigned in one conditional block
