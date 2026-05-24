# EC-193 — Fix Post-Game Blank-Board (Board Visibility at `phase === 'end'`) (Execution Checklist)

**Source:** (no WP — ad-hoc INFRA defect fix; follows the EC-110 / EC-166 / EC-177 / EC-178 / EC-183 precedent — direct extension of EC-183's spectator-frame contract to the gameover frame)
**Layer:** Client (`apps/arena-client/src/pages/PlayDesktop.vue`)

## Before Starting
- [x] Reproduce: an autoplay viewer who watches a bot match to completion loses the entire board the moment `phase` flips to `'end'` — no opponent panels (so no `Victory: N ▼` button to inspect final piles), no mastermind/scheme/city/HQ row, only `TopHudBar` + `AutoplayControls` remain. Verified against `play.legendary-arena.com` match `KsCd4tP6uSw` 2026-05-23 — Pinia store carried the correct post-match snapshot (`victoryVP: 33`, `gamePhase: "end"`) but `[data-testid="play-your-victory-vp"]` did not exist in the DOM (`vpTextInDom: null`) and `[data-testid="play-opponent-panel"]` was absent (`wholeBoardExists: false`).
- [x] Root cause: `PlayDesktop.vue:232` gates the entire post-lobby board on `<template v-if="isPlayPhase">` where `isPlayPhase = snapshot.value?.game.phase === 'play'`. The engine transitions `phase` from `'play'` → `'end'` (via `phases.play.next: 'end'` in `game.ts:343`) when gameover triggers; `isPlayPhase` flips false and Vue unmounts the entire board subtree. EC-183 fixed the analogous bug for spectator / rewind frames mid-play; this EC extends the same posture to the gameover frame.
- [x] `pnpm -r build` exits 0; arena-client tests green pre-change

## Locked Values (do not re-derive)
- New computed: `boardVisible = isPlayPhase || isGameOver` (returns true when either is true — `isGameOver` already exists in `PlayDesktop.vue:119` as `snapshot.value?.gameOver !== undefined`)
- Template gate: replace `<template v-if="isPlayPhase">` with `<template v-if="boardVisible">` AT THE SHARED-BOARD WRAPPER ONLY (the inner `<template v-if="viewer !== null">` personal-zone gate is UNTOUCHED — EC-183's contract stands)
- `isPlayPhase` computed stays as-is (semantic: "currently in the play phase"); `boardVisible` is the NEW semantic ("render the shared board AT ALL")
- `LobbyControls v-if="isLobbyPhase"` stays as-is (lobby gate is independent)
- `viewer` semantics unchanged: first player whose `handCards !== undefined`; null for a spectator / autoplay frame
- `opponents` semantics unchanged: returns all players when `viewer === null`

## Guardrails
- Behavior for normal play-phase frames (viewer non-null OR viewer-less mid-play) is BYTE-IDENTICAL — the outer gate accepts both `isPlayPhase` AND the new `isGameOver` branch; `isPlayPhase` already returned true for those frames pre-change
- Do NOT touch the engine — `phase` transition to `'end'` is engine truth; UI just consumes the projection
- Do NOT touch the server (`autoplay.mjs` / `runBotMatch` / playback controller lifecycle, D-16308) — the controller-deletion-on-gameover concern (no rewind after game-end) is a SEPARATE WP-scale concern requiring a DECISIONS entry; EC-193 is the board-visibility fix ONLY
- Do NOT touch `PlayMobile.vue` — mobile is deliberately scoped out (EC-183 precedent — autoplay/rewind is desktop-only via `PlayViewport` matchId prop-drill, D-16501; mobile never produces a gameover frame the same way)
- Do NOT touch `setSnapshot` ingestion (`client/bgioClient.ts`), `uiState.types.ts`, or `uiState.filter.ts` — projection contract unchanged
- Scope is the `PlayDesktop.vue` template gate + one new `boardVisible` computed + a regression test; no new contract, no new decision

## Required `// why:` Comments
- `boardVisible` computed declaration — three-clause: (1) gameover transitions `phase` from `'play'` → `'end'` (in some codepaths nulls it), (2) collapsing the board strands the viewer on `TopHudBar` with no `Victory: N ▼` to inspect final piles, (3) extends EC-183's spectator-frame fix to the post-game frame — same shared board, personal zone still hidden by inner `viewer !== null`
- `<template v-if="boardVisible">` site — two-clause: (1) shared board renders for the whole play phase regardless of viewer (EC-183 precedent), (2) `boardVisible` extends to include gameover so opponent panels (with `Victory: N ▼`) stay mounted for post-match inspection

## Files to Produce
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — add `boardVisible` computed; replace outer `<template v-if="isPlayPhase">` with `<template v-if="boardVisible">`; export `boardVisible` from `setup()`
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified** — add a regression test: a `phase === 'end'` + `gameOver` set + viewer-less (handCards stripped) frame renders the shared board (TopHudBar, mastermind, scheme, city, HQ, shared decks, KO, all 3 opponent panels) and hides the personal "your" zone
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add the EC-193 ad-hoc row (no `WORK_INDEX.md` row)

## After Completing
- [x] `pnpm --filter arena-client test` exits 0 (baseline 388 → 389, +1 regression test — runs after EC-192's +4 lands; combined baseline 384 → 389)
- [x] `pnpm --filter arena-client build` exits 0
- [ ] Commit prefix `EC-193:` for staged files under `apps/arena-client/`; EC file + EC_INDEX row in a `SPEC:` governance commit
- [ ] Production verification: after deploy, watch an autoplay match to completion — board stays visible at `phase === 'end'`, opponent panels render, `Victory: N ▼` opens the final pile

## Common Failure Smells
- Board still blank at game-end → outer gate still on `isPlayPhase` only (must accept `boardVisible`)
- Normal play frames now show duplicate state → the change accidentally added a second board container instead of widening the existing gate
- Personal "your" zone now leaks at game-end for a viewer-less frame → inner `viewer !== null` gate was widened too (must stay as-is — EC-183 contract preserved)
- Lobby controls hidden when they should show → `LobbyControls v-if="isLobbyPhase"` was accidentally moved inside the new gate

## Out of Scope (Separately Tracked)
- **Rewind-after-game-end via `AutoplayControls`:** the controller is deleted from `autoplayControllers` on every `runBotMatch` exit path (D-16308), so all six playback endpoints 404 after gameover. Functionally dead bar. Fixing this changes the locked D-16308 lifecycle decision and requires a proper WP — NOT scoped here. This EC's board-visibility fix is sufficient for post-match inspection of the FINAL frame.
