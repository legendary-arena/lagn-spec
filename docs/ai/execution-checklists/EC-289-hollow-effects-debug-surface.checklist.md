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
- New `UIState` field: `hollowEffects?: HollowEffectRecord[]` — **optional**; no client fixture backfill.
- The projected record type is the engine `HollowEffectRecord` (cardId, cardType `'hero'|'villain'|'henchman'`, timing, mechanic, reason, turn) — reused, NOT a parallel UI type.
- The arena-client panel renders `cardType`, `mechanic`, `timing`, `reason`, and `turn`.
- Barrel: `packages/game-engine/src/index.ts` re-exports `HollowEffectRecord` **and** `EffectExecutionReason` — both required because the client panel renders the `reason` field.
- Filter posture: **public** — `hollowEffects` passes through for own-player AND other-player audiences with **value-identical** records. The filter MAY shallow-copy the array, but MUST NOT redact, reorder, rewrite, or drop any record (D-12803).
- Panel renders rows ONLY when ≥1 record (`v-if`); absent/empty `hollowEffects` ⇒ no render.
- No diagnostics **production** change: do NOT modify `diagnostics.ts` or `DiagnosticExportButton.vue` — only the existing export **test** gains an assertion.
- NO `DECISIONS.md` entry (projects the D-24034 channel; public-filter follows D-12803).

## Guardrails
- **Additive + optional** — the `UIState` field is optional so no client fixture needs backfill (the WP-166/207/227 recurrence). Do NOT make it required.
- **Both barrel re-exports in scope** — `HollowEffectRecord` AND `EffectExecutionReason` (D-16502).
- **Public pass-through is value-preserving** — both filter audiences deep-equal the source records; array copy allowed, no redact/reorder/rewrite/drop.
- **Projection is read-only** — `buildUIState` never mutates `G`; deterministic.
- **Do NOT touch the diagnostics production module** — the export already serializes the full `UIState` snapshot; the records ride it for free.
- **Do NOT change the engine detector / channel / `HollowEffectRecord` shape** (WP-257 contract).
- **`finalStateHash`** is guarded by the existing engine replay test (`replayFixtures.test.ts`, in `pnpm --filter @legendary-arena/game-engine test`) — do NOT add a new hash fixture or invent a sentinel.
- No server/dashboard surface; no new move/rule/gameplay; `data/cards/**` byte-unchanged.

## Required `// why:` Comments
- The public-filter value-preserving posture (`hollowEffects` is card/mechanic data, not hidden info — D-12803)
- The optional-field choice (avoids the client-fixture-backfill recurrence)
- The barrel re-export (client imports the engine types — D-16502)
- The panel's empty/absent no-render

## Files to Produce
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `hollowEffects?: HollowEffectRecord[]` on `UIState`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project `G.diagnostics?.hollowEffects` read-only; omit when absent
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — value-preserving public pass-through (both audiences)
- `packages/game-engine/src/index.ts` — **modified (barrel)** — re-export `HollowEffectRecord` **and** `EffectExecutionReason`
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — projection present + absent-channel + no-`G`-mutation tests
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — own-player AND other-player deep-equal pass-through tests
- `apps/arena-client/src/components/play/HollowEffectsPanel.vue` — **new** — presentational debug panel
- `apps/arena-client/src/components/play/HollowEffectsPanel.test.ts` — **new** — render rows + empty/absent no-render
- `apps/arena-client/src/diagnostics/diagnostics.test.ts` — **modified (test-only)** — assert the serialized `uiStateSnapshot` carries `hollowEffects`; do NOT touch `diagnostics.ts` / `DiagnosticExportButton.vue` production code
- `apps/arena-client/src/pages/PlayDesktop.vue` and/or `apps/arena-client/src/pages/PlayMobile.vue` — **modified (mount; 01.5)** per the Mounting Rule: if both are independent production play surfaces, mount on both; if a shared child/HUD feeds both, mount once there. The final diff covers every production play surface.

## Additional Test Requirements
- **Projection:** `G` with `diagnostics.hollowEffects` projects the exact record values to `UIState.hollowEffects`; `G` without the channel omits the field; `buildUIState` does not mutate `G`.
- **Filter:** own-player filtered `UIState.hollowEffects` **deep-equals** the source records; other-player filtered `UIState.hollowEffects` **deep-equals** the same source records. Do not assert same-array identity; shallow copy is allowed/preferred.
- **Export:** given a `UIState` snapshot containing `hollowEffects`, the serialized diagnostics payload includes `uiStateSnapshot.hollowEffects` — proven without changing `diagnostics.ts` / `DiagnosticExportButton.vue` production behavior.

## Closure Gates
**Pre-merge:**
- [ ] `pnpm -r build` 0; engine `test` 0 (this run is the `finalStateHash` guard); arena-client `test` 0; arena-client `typecheck` 0
- [ ] `git diff --name-only -- data/cards/` empty; no engine `G` mutation; no new hash fixture/sentinel
- [ ] No client fixture backfill needed (field optional); `HollowEffectRecord` + `EffectExecutionReason` barrel-exported
- [ ] No `diagnostics.ts` / `DiagnosticExportButton.vue` production change (only `diagnostics.test.ts`)
- [ ] `docs/ai/STATUS.md` records **D-24026 pending deploy verification** with the PR/SHA candidate
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-258 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-289 Done; `docs/05-ROADMAP-MINDMAP.md` WP-258 node; `node scripts/roadmap-counts.mjs --check` passes

**Post-deploy (D-24026 — only after the deploy lands):**
- [ ] On play.legendary-arena.com, the panel lists a hollow effect for an unhandled / unreachable-handler case
- [ ] Download diagnostics → `uiStateSnapshot.hollowEffects` carries the structured record
- [ ] `docs/ai/STATUS.md` updated with the **deployed SHA + evidence** (only now is D-24026 satisfied)

## Common Failure Smells
- `vue-tsc` errors in client fixtures after the change → the `UIState` field was made required instead of optional.
- The client cannot import `HollowEffectRecord` / `EffectExecutionReason` → a barrel re-export was skipped (D-16502).
- An opponent's filtered view differs from the source records → `hollowEffects` was redacted/reordered instead of value-preserving pass-through.
- The diagnostics export lacks `hollowEffects` → the field wasn't actually projected onto `UIState`.
- A new sentinel/hash fixture appears in the diff → the `finalStateHash` guard was re-invented instead of using the existing replay test.
- STATUS.md claims D-24026 live-verified before the deploy landed → pre-merge close must say "pending deploy verification."
