# EC-266 — Engine-Authoritative Start-of-Turn Draw (Execution Checklist)

**Source:** docs/ai/work-packets/WP-236-engine-authoritative-draw.md
**Layer:** Game Engine (cross-layer: Server autoplay + Arena-Client play surface)

## Before Starting
- [ ] `coreMoves.impl.ts` `drawCards` follows validate-args → stage-gate → mutate; has an inline draw+reshuffle loop
- [ ] `ruleRuntime.effects.ts` `applyDrawCards` has its own draw+reshuffle loop (the hero `draw` keyword path — NOT the move)
- [ ] `game.ts` play phase `onBegin` sets `currentStage` / `turnEconomy` / `villainRevealedThisTurn`, then runs `onTurnStart` hooks
- [ ] `runFixture.ts` `rotateToNextTurn` reimplements the `onBegin` resets (incl. `villainRevealedThisTurn`)
- [ ] `ai.legalMoves.ts` section 6 pushes `{ name: 'drawCards', args: { count: 1 } }`; `autoplay.mjs` submits `drawCards`
- [ ] `TurnActionBar.vue` has the Draw button + `onDraw` + `drawGate` + `handCount` prop (D-10003/D-10013); `PlayDesktop.vue`/`PlayMobile.vue` bind `:hand-count="viewer.handCount"`
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0; `arena-client` build + test exit 0

## Locked Values (do not re-derive)
- `HAND_SIZE = 6` — defined ONCE in `moves/drawCards.logic.ts`; no other file hardcodes `6` for hand size (Magneto's `MAGNETO_HAND_SIZE_LIMIT = 4` is separate, untouched)
- Field name: `hasDrawnThisTurn` — `?: boolean` (OPTIONAL, not required); turn-scoped boolean ONLY; internal `G`, NOT projected to `UIState`
- Helper: `drawCardsIntoHand(playerZones, count, shuffleContext)` in `moves/drawCards.logic.ts` — pure, no `boardgame.io`, no `.reduce()`
- `onBegin` order (exact): currentStage → turnEconomy → villainRevealedThisTurn → `hasDrawnThisTurn = false` → auto-draw to `HAND_SIZE` (sets `hasDrawnThisTurn = true`) → `executeRuleHooks('onTurnStart', …)`
- Auto-draw count: `max(0, HAND_SIZE - hand.length)` for `ctx.currentPlayer` only
- Move body order (exact): validate args → stage gate → `if (G.hasDrawnThisTurn) return;` → resolve zones → `drawCardsIntoHand(zones, min(args.count, max(0, HAND_SIZE - hand.length)), ctx)` → `G.hasDrawnThisTurn = true;` (UNCONDITIONAL)

## Guardrails
- The `drawCards` MOVE is KEPT — `CORE_MOVE_NAMES`, `CoreMoveName`, `MOVE_ALLOWED_STAGES`, `coreMoves.validate.ts` UNCHANGED (no drift-array churn). The move gains guard+cap+delegate; it stays registered as defensive protection.
- `'drawCards'` STAYS in `UiMoveName` — do NOT edit `uiMoveName.types.ts` or `bgioClient.test.ts`. The engine move persists, so the permitted-name stays.
- Guard goes in the MOVE only. The card-effect path (`applyDrawCards`) MUST NOT reference `hasDrawnThisTurn` — card draws bypass the guard (the WP-212 chained-reveal lesson).
- Field is OPTIONAL — required forces edits to every full-`G` literal (WP-212 21-file lesson). Absent ⇒ `false`.
- Field is NOT projected to `UIState` — do NOT touch `uiState.types.ts` / `uiState.build.ts` / UIState fixtures. (This is why the WP-166/207/227 arena-client fixture-backfill recurrence does NOT apply.)
- Only the `TurnActionBar` `handCount` PROP is deleted. The `UIState` `player.handCount` display field (PlayerPanel/OpponentPanel/fixtures) is a DIFFERENT field — untouched.
- Auto-draw runs BEFORE `onTurnStart` hooks (Magneto reads the hand → must see it drawn).
- `drawCardsIntoHand` consolidation of move + effect is BEHAVIOUR-NEUTRAL — the ONLY behavioural change is the new `onBegin` auto-draw + the move guard.
- Harness mirror is mandatory: `rotateToNextTurn` must mirror BOTH the flag reset AND the auto-draw, or replays never draw and diverge (WP-212 D-20903, extended to the draw).
- Move never throws; turn hooks never throw — early `return` / no-op only.
- `drawCards.logic.ts` module JSDoc must PARAPHRASE its purity (e.g. "pure helper — no game-framework import") and MUST NOT contain the literal token Verification Step 3's grep matches (`from 'boardgame`) — the grep is import-scoped; do not reintroduce a bare-token grep that JSDoc prose would self-trip (§18 / grep-gate-comment self-trip pattern).
- Blocked second `drawCards` = ZERO mutation: assert `deepStrictEqual` vs a `structuredClone(G)` snapshot.
- Fixture is REGENERATED, not re-pinned: `finalStateHash` + `messages` + `outcome` ALL change. Do NOT assert byte-identity. Instead validate the coherent-game sanity check (same endgame-condition class + comparable turn count). A different winner/condition is a STOP.

## Required `// why:` Comments
- `drawCards.logic.ts` `HAND_SIZE`: canonical start-of-turn hand size; single source; cross-check `00.2`
- `types.ts` new field: optional so full-`G` literals need no edit; absent ⇒ not drawn; internal-`G`, not UIState
- `buildInitialGameState.ts`: no draw at setup; `onBegin` resets + performs turn-1 auto-draw
- `game.ts` reset: allowance refreshes each turn; without it the move guard blocks from turn 2
- `game.ts` auto-draw: engine owns the draw (scaffold retired); runs before `onTurnStart` so hand-reading hooks see the hand
- `coreMoves.impl.ts` guard: once-per-turn; card-effect draws use the rule-effect path and bypass this
- `coreMoves.impl.ts` set: attempt consumed regardless of draw count
- `runFixture.ts`: harness reimplements `onBegin`; without mirroring the auto-draw, replays never draw and diverge
- `ai.legalMoves.ts` removal: hand is auto-drawn at `onBegin`; emitting `drawCards` is a guarded no-op + wasted bot choice

## Files to Produce
**Engine (`packages/game-engine/src/`):**
- `moves/drawCards.logic.ts` — **new** — `HAND_SIZE` + `drawCardsIntoHand`
- `moves/drawCards.logic.test.ts` — **new** — helper tests (no boardgame.io)
- `moves/coreMoves.impl.ts` — **modified** — guard + cap + delegate
- `types.ts` — **modified** — `hasDrawnThisTurn?: boolean` after `villainRevealedThisTurn`
- `setup/buildInitialGameState.ts` — **modified** — init `false`
- `game.ts` — **modified** — `onBegin` reset + auto-draw before `onTurnStart`
- `rules/ruleRuntime.effects.ts` — **modified** — `applyDrawCards` delegates (behaviour-neutral)
- `simulation/ai.legalMoves.ts` — **modified** — drop `drawCards` emission
- `test/fixtures/runFixture.ts` — **modified** — mirror reset + auto-draw
- `test/fixtures/games/sentinel-core-doom-2p.replay.json` — **modified** — REGENERATE oracles
- `replay/replay.execute.test.ts` — **modified** — re-pin `PRE_WP080_HASH`
- `moves/coreMoves.integration.test.ts` — **modified** — guard/cap/blocked-second tests
- `game.test.ts` — **modified** — `onBegin` auto-draw test

**Server:** `apps/server/src/autoplay/autoplay.mjs` — **modified** — drop bot `drawCards` step

**Client (`apps/arena-client/src/`):**
- `components/play/TurnActionBar.vue` — **modified** — delete Draw button + `onDraw` + `drawGate` + `handCount` prop
- `components/play/TurnActionBar.test.ts` — **modified** — delete Draw tests; assert control gone
- `pages/PlayDesktop.vue` — **modified** — drop `:hand-count`
- `pages/PlayMobile.vue` — **modified** — drop `:hand-count`

**Governance:** `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-23601..D-23605), `docs/ai/work-packets/WORK_INDEX.md`

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0
- [ ] `pnpm --filter @legendary-arena/arena-client build` + `test` exit 0
- [ ] `Select-String drawCards.logic.ts -Pattern "boardgame.io"` → no output
- [ ] `Select-String ai.legalMoves.ts -Pattern "name: 'drawCards'"` → no output; `autoplay.mjs` `drawCards` → no output
- [ ] `Select-String TurnActionBar.vue -Pattern "play-action-draw|handCount|onDraw|drawGate"` → no output
- [ ] `Select-String PlayDesktop.vue,PlayMobile.vue -Pattern "hand-count"` → no output
- [ ] `git diff` of `coreMoves.types.ts` / `coreMoves.gating.ts` / `coreMoves.validate.ts` / `uiMoveName.types.ts` → no output (contracts unchanged)
- [ ] Regenerated fixture passes the coherent-game sanity check (same endgame-condition class)
- [ ] `git diff --name-only` → only the WP-listed files
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated — D-23601 (auto-draw + guard), D-23602 (optional internal-G field), D-23603 (scaffold retirement), D-23604 (fixture regeneration + hash re-pin), D-23605 (draw-primitive consolidation)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells
- Card-effect (hero `draw` keyword) draws stop working → guard wrongly placed in `applyDrawCards`/`drawCardsIntoHand` instead of the move
- 21 test files fail to compile → field declared required instead of optional
- Replays never draw / hands stay empty in fixtures → `runFixture.ts` harness mirror missing the auto-draw (not just the flag reset)
- Magneto trims a hand that was never drawn → auto-draw placed AFTER `onTurnStart` hooks instead of before
- Draw past 6 still possible over the wire → guard/cap missing on the kept move (deleting the button alone does NOT fix the bug)
- Drift test fails on `CORE_MOVE_NAMES`/`UiMoveName` → the move or UI vocabulary was edited (it must stay — only the button is removed)
- `player.handCount` disappears from PlayerPanel/OpponentPanel → deleted the UIState field instead of just the TurnActionBar prop
- Regenerated fixture shows a different winner → auto-draw altering game flow beyond draw-timing; STOP and investigate
- New `vue-tsc` errors in arena-client UIState fixtures → something projected `hasDrawnThisTurn` to UIState (it must stay internal `G`)
