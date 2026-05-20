# EC-183 — Fix Rewind Blank-Screen (Spectator/Rewound Board Render) (Execution Checklist)

**Source:** (no WP — ad-hoc INFRA defect fix; follows the EC-110 / EC-166 / EC-177 / EC-178 precedent)
**Layer:** Client (`apps/arena-client/src/pages/`)

## Before Starting
- [ ] Reproduce: an autoplay spectator who rewinds sees a blank board. Root cause — `PlayDesktop.vue` gates the entire play board on `isPlayPhase && viewer !== null`; a rewind frame is spectator-filtered (D-16303 via `autoplay.mjs` `rewindUIState`), so `filterUIStateForAudience(…, {kind:'spectator'})` omits `handCards` from every player → `viewer` (first player with `handCards`) is `null` → board collapses.
- [ ] `git rev-parse origin/main` matches local `main` HEAD; record it
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` exits 0

## Locked Values (do not re-derive)
- The shared board (TopHudBar, opponents, mastermind, scheme, city, HQ, shared decks, KO) renders for the WHOLE play phase — `v-if="isPlayPhase"` (NOT `&& viewer !== null`)
- The personal "your" zone (`play-desktop__player-zone`: HandRow / EconomyBar / YourDeckDiscardZone / YourVictoryPile) and `TurnActionBar` render only under a nested `v-if="viewer !== null"`
- `viewer` semantics unchanged: first player whose `handCards !== undefined` (null for a spectator/rewound frame)
- `opponents` already returns all players when `viewer === null` — spectator sees every player as an opponent panel (counts only)

## Guardrails
- Behavior for a normal player frame (viewer non-null) is BYTE-IDENTICAL — board + personal zone both render exactly as before
- Do NOT change the audience filter (D-16303 stands — rewind frames stay spectator-filtered; hands hidden on rewind is intended)
- Do NOT touch the server (`autoplay.mjs` / `rewindUIState`), the `setSnapshot` ingestion path (`client/bgioClient.ts`), or `uiState.ts`
- Do NOT alter `PlayMobile.vue` — the autoplay bar mounts on desktop only (PlayViewport forwards `matchId` to `<PlayDesktop>` only), so mobile never receives a rewind frame
- Scope is the `PlayDesktop.vue` template gating + a regression test ONLY; no new contract, no new decision

## Required `// why:` Comments
- `PlayDesktop.vue` board `v-if="isPlayPhase"` — shared board renders regardless of viewer; spectator/rewound frames have no own hand (D-16303), so gating the board on viewer blanked the screen on rewind
- `PlayDesktop.vue` nested `v-if="viewer !== null"` — the personal zone + turn-action bar require an identified viewer; hidden for a spectator/rewound frame while the shared board stays visible

## Files to Produce
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified** — split the play-phase template: shared board on `isPlayPhase`, personal zone + `TurnActionBar` on nested `viewer !== null`
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified** — add a regression test: a viewer-less (handCards stripped) play-phase frame renders the shared board + 3 opponent panels, and hides hand-row / turn-action-bar / your-deck-discard / your-victory-pile
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add the EC-183 ad-hoc row (no `WORK_INDEX.md` row)

## After Completing
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` passes (arena-client baseline 361 → 362, +1 regression test)
- [ ] Normal-player render test still passes (full board + personal zone)
- [ ] Commit prefix `EC-183:` for the staged files under `apps/arena-client/`; EC file + EC_INDEX row in a `SPEC:` governance commit

## Common Failure Smells
- Board still blank on rewind → board still gated on `viewer !== null`
- Personal zone (own hand) leaks for a spectator → nested `viewer !== null` guard missing or mis-scoped
- Normal player frame missing the hand zone → personal zone gated too broadly (e.g. wrapped the whole board)
