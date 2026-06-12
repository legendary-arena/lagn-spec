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
- Eligible ordering: discard → hand → inPlay, stored zone order, dedupe `(zone, cardId)` first-occurrence (deterministic, stable across frames)
- `remaining` ≥ 1 when `pendingKoHeroChoice` is present; counter shown only when `remaining > 1`
- Turn-action gate predicate = `hasPendingChoice || hasPendingKoChoice`

## Guardrails
- `pendingKoHeroChoice` is built from the FRONT of the engine queue (`[0]`), `remaining` = queue length; eligible recomputed fresh from current `G` every `buildUIState` call (no snapshot, no cached/historical eligibility)
- **Projection purity / replay-neutral:** `buildUIState` MUST NOT mutate `G`; the projection is derived state, never persisted or replayed
- **Deterministic eligible order:** scan discard → hand → inPlay in stored zone order, dedupe `(zone, cardId)` first-occurrence; byte-identical across repeated calls on the same `G` so the prompt does not reshuffle; `for...of`, no `.reduce()`
- **Redaction (D-24011) — eligible is the hand-leak vector:** `pendingKoHeroChoice` present ONLY for `audience === playerID`; omitted (conditional assignment, never an `undefined` literal) for opponents AND spectators. A non-chooser's serialized UIState must contain NONE of the chooser's hand ext_ids. `discardCards`/`discardDisplay` redacted together for non-owners (same branch as `handCards`)
- `display` objects non-aliased (`resolveDisplay` spread) — never reference `G.cardDisplayData` entries
- **Defense-in-depth:** the prompt independently checks `viewerPlayerId === pendingKoHeroChoice.playerID` — never relies solely on server redaction
- **Render all-and-only + single-submit:** the prompt renders exactly the projected `eligible` (no client filter / reorder / re-exclude wounds); holds no cached eligibility, unmounts when the prop clears; `isSubmitting` disables all entries on first click so exactly one `resolveKoHeroChoice` fires per mount
- **Dual coexistence:** `pendingHeroChoice` + `pendingKoHeroChoice` may both render; each submits independently; the gate blocks on `hasPendingChoice || hasPendingKoChoice`
- Client imports TYPES only from `@legendary-arena/game-engine`; no `apps/server` import; `defineComponent({ setup })` (D-6512); prompt not dismissible; `useTurnActions` `hasPendingKoChoice` defaults `false`

## Required `// why:` Comments
- `uiState.filter.ts` `pendingKoHeroChoice` redaction: why non-chooser redaction differs from public `pendingHeroChoice` (hand-leak, D-24011)
- `uiState.build.ts` eligible builder: wound exclusion + `(zone, cardId)` dedupe
- `useTurnActions.ts`: KO gate blocks at every stage (board frozen), unlike the cleanup-only hero-reveal gate

## Files to Produce
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `discardCards?`/`discardDisplay?`; `UIPendingKoHeroChoice`; `pendingKoHeroChoice?`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project discard + `pendingKoHeroChoice` eligible
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — redact discard (non-owner) + `pendingKoHeroChoice` (non-chooser)
- `packages/game-engine/src/index.ts` — **modified** — export `UIPendingKoHeroChoice`
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — ≥5
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — ≥3
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — drift pin
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — **modified** — add `'resolveKoHeroChoice'` (→12)
- `apps/arena-client/src/composables/useTurnActions.ts` — **modified** — `hasPendingKoChoice`
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.vue` — **new** — KO selection prompt
- `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` — **modified** — expandable full-discard view
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — mount prompt + wire props
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — mount prompt + wire props
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.test.ts` — **new** — ≥6
- `apps/arena-client/src/composables/useTurnActions.test.ts` — **modified** — ≥3
- `apps/arena-client/src/components/play/YourDeckDiscardZone.test.ts` — **modified** — ≥2
- `apps/arena-client/src/components/play/TurnActionBar.test.ts` — **modified** — ≥1

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — ≥ BASELINE + ~8
- [ ] `pnpm --filter arena-client test` exits 0 — ≥ BASELINE + ~12
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
- Two KOs land from one prompt ⇒ `isSubmitting` not disabling all entries on the first click
