# EC-289 — Hollow Effects on the Arena-Client Diagnostics Surface (Execution Checklist)

**Source:** docs/ai/work-packets/WP-258-hollow-effects-debug-surface.md
**Layer:** Game Engine (UIState projection + barrel) + Arena Client

## Before Starting
- [ ] WP-257 is on `main` (`G.diagnostics.hollowEffects` + `HollowEffectRecord` exist)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (baseline)

## Locked Values (do not re-derive)
- New `UIState` field: `hollowEffects?: HollowEffectRecord[]` — **optional** (no client fixture backfill)
- The projected record type is the engine `HollowEffectRecord` (cardId, cardType `'hero'|'villain'|'henchman'`, timing, mechanic, reason, turn) — reused, NOT a parallel UI type
- Filter posture: **public** — `hollowEffects` passes through UNCHANGED for every audience (own-player AND others), mirroring `log`/`piles` (D-12803)
- Barrel: `packages/game-engine/src/index.ts` re-exports `HollowEffectRecord` (+ `EffectExecutionReason` if the panel renders the reason)
- Panel renders rows ONLY when ≥1 record (`v-if`); no/empty `hollowEffects` ⇒ no render
- NO `DECISIONS.md` entry (projects the D-24034 channel; public-filter follows D-12803)

## Guardrails
- **Additive + optional** — the `UIState` field is optional so no client fixture needs backfill (the WP-166/207/227 recurrence). Do NOT make it required.
- **Barrel re-export in scope** — a client-imported engine type needs `index.ts` re-export (the D-16502 gap). It is in the allowlist.
- **Public pass-through** — `hollowEffects` is NOT hidden info; both filter audiences see identical records.
- **Projection is read-only** — `buildUIState` never mutates `G`; deterministic; `finalStateHash` unchanged.
- **Do NOT touch the diagnostics module** (`diagnostics.ts` / `DiagnosticExportButton.vue`) — the export already serializes the full `UIState` snapshot, so the records ride it for free.
- **Do NOT change the engine detector / channel / `HollowEffectRecord` shape** (WP-257 contract).
- No server/dashboard surface; no new move/rule/gameplay; `data/cards/**` byte-unchanged.

## Required `// why:` Comments
- The public-filter posture (`hollowEffects` is card/mechanic data, not hidden info — D-12803)
- The optional-field choice (avoids the client-fixture-backfill recurrence)
- The barrel re-export (client imports the engine `HollowEffectRecord` type — D-16502)
- The panel's empty/absent no-render

## Files to Produce
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `hollowEffects?: HollowEffectRecord[]` on `UIState`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project `G.diagnostics?.hollowEffects` (read-only)
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — public pass-through (both audiences)
- `packages/game-engine/src/index.ts` — **modified (barrel)** — re-export `HollowEffectRecord` (+ `EffectExecutionReason` if rendered)
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — projection + absent-channel test
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — public pass-through (both audiences) test
- `apps/arena-client/src/components/play/HollowEffectsPanel.vue` — **new** — the debug panel
- `apps/arena-client/src/components/play/HollowEffectsPanel.test.ts` — **new** — render + empty-state test
- `apps/arena-client/src/pages/PlayDesktop.vue` (and/or `PlayMobile.vue`) — **modified** — mount the panel (01.5 runtime-wiring; confirm the exact mount file at execution)

## After Completing
- [ ] `pnpm -r build` exits 0; engine `test` 0; arena-client `test` 0; arena-client `typecheck` 0
- [ ] `git diff --name-only -- data/cards/` empty; `finalStateHash` unchanged; no engine `G` mutation
- [ ] No client fixture backfill was needed (field is optional); `HollowEffectRecord` barrel-exported
- [ ] **Live-on-surface (D-24026):** on play.legendary-arena.com, the panel lists a hollow effect for an unhandled-ability card AND the downloaded diagnostics JSON's `uiStateSnapshot.hollowEffects` carries the structured record — record the deploy SHA + evidence in STATUS.md
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-258 checked off with date; `docs/ai/execution-checklists/EC_INDEX.md` EC-289 Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-258 node added; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- `vue-tsc` errors in client fixtures after the change → the `UIState` field was made required instead of optional.
- The client cannot import `HollowEffectRecord` → the `index.ts` barrel re-export was skipped (D-16502).
- An opponent's filtered view is missing the records → `hollowEffects` was treated as hidden info instead of public pass-through.
- The diagnostics export lacks `hollowEffects` → the field wasn't actually projected onto `UIState` (the export serializes the snapshot as-is).
