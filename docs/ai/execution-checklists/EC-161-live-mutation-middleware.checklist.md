# EC-161 — Live Mutation Middleware (Execution Checklist)

**Source:** docs/ai/work-packets/WP-070-live-mutation-middleware.md
**Layer:** App / arena-client

## Before Starting
- [ ] WP-059 complete: `usePreplanStore` + `applyDisruptionToStore` exist
- [ ] WP-090 complete: `createLiveClient` + `client.subscribe()` callback wired
- [ ] WP-058 complete: `executeDisruptionPipeline` exported from `@legendary-arena/preplan`
- [ ] `pnpm --filter "@legendary-arena/arena-client..." build` exits 0
- [ ] `pnpm --filter "@legendary-arena/arena-client..." test` exits 0

## Locked Values (do not re-derive)
- `PlayerAffectingMutation.effectType`: `'discard'` | `'ko'` | `'gain'` | `'other'`
- `DisruptionPipelineResult.requiresImmediateNotification`: literal `true`
- `applyDisruptionToStore` is the single named integration seam (preplanLifecycle.ts:69-74)
- `useUiStateStore().setSnapshot()` is the UIState sink (bgioClient.ts:178/184)
- Middleware runs AFTER UIState store write, BEFORE next frame
- Turn-change (activePlayerId becomes viewerPlayerId) is NOT a disruption — return empty
- First-disruption-wins: break after first non-null pipeline result
- UIState field set is CLOSED — see WP-070 §A anchored field table
- Fast-path: `previousUIState === currentUIState` (reference equality) skips detection

## Guardrails
- Middleware operates on UIState projections only — never raw `G`
- Middleware must not write to `G`, `ctx`, or any authoritative state
- No `boardgame.io` import in `mutationDetector.ts`
- No `.reduce()` in mutation detection or diff logic — use `for...of`
- No `JSON.stringify`, no deep-equality helpers, no `Object.keys()` iteration in diffs
- `executeDisruptionPipeline` called as-is — no re-implementation of pipeline stages
- `sourceRestoration` passed through, not acted on
- No changes to `stores/preplan.ts` or `preplanLifecycle.ts`
- `createLiveClient` gains `viewerPlayerId` in options — `LiveClientHandle` unchanged
- Null/undefined UIState → return empty mutations, never throw

## Required `// why:` Comments
- `mutationDetector.ts`: why turn-change returns empty (consumption, not invalidation)
- `bgioClient.ts` subscribe callback: why middleware runs after UIState store write
- `bgioClient.ts`: why `viewerPlayerId` is threaded through options

## Files to Produce
- `apps/arena-client/src/preplan/mutationDetector.ts` — **new** — UIState diff → mutations
- `apps/arena-client/src/preplan/mutationDetector.test.ts` — **new** — detection tests
- `apps/arena-client/src/preplan/mutationMiddleware.test.ts` — **new** — integration tests
- `apps/arena-client/src/client/bgioClient.ts` — **modified** — subscribe + middleware
- `apps/arena-client/src/client/bgioClient.test.ts` — **modified** — middleware tests

## After Completing
- [ ] `pnpm --filter "@legendary-arena/arena-client..." build` exits 0
- [ ] `pnpm --filter "@legendary-arena/arena-client..." test` exits 0
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (ordering invariant; turn-change distinction)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] 01.5 NOT INVOKED

## Common Failure Smells
- Middleware fires on every frame (even identical) → missing reference-equality short-circuit
- Pipeline returns null but store shows notification → stale previous-state reference
- Turn-change triggers disruption → turn-change not excluded from detection
- Multiple disruptions recorded per frame → missing first-disruption-wins break
- First frame triggers detection → missing first-frame skip (no previous to diff)
- Null frame crashes → missing null guard in subscribe callback
- Test imports `boardgame.io` → layer violation; use `setClientFactoryForTesting` instead
