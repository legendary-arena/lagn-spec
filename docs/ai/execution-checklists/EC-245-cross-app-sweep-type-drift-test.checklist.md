# EC-245 — Cross-App Sweep Type Drift Test (Dashboard ↔ Server) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-211-cross-app-sweep-type-drift-test.md
**Layer:** Dashboard (`apps/dashboard/` — test surface only)

## Before Starting (Hard Gate — run each; STOP if any fails)
- [ ] Dashboard mirror exists: `test -f apps/dashboard/src/types/sweep.ts` → `A_OK`
- [ ] Dashboard `SweepRunSummary` has the 5 locked fields (scope to the interface block): `grep -A6 'interface SweepRunSummary' apps/dashboard/src/types/sweep.ts | grep -cE 'readonly (runId|submittedAt|startedAt|cellCount|anomalyCounts):'` → **5**
- [ ] Server source-of-truth has the 5 fields (scope to the interface block — the file also declares `SweepRunPayload` sharing 4 names, so an unscoped grep returns 10): `grep -A6 'interface SweepRunSummary' apps/server/src/sweep/sweep.types.ts | grep -cE 'readonly (runId|submittedAt|startedAt|cellCount|anomalyCounts):'` → **5**
- [ ] No drift test yet: `test -f apps/dashboard/src/types/sweep.drift.test.ts` → **ABSENT**
- [ ] Baseline green: `pnpm --filter @legendary-arena/dashboard typecheck` → exit 0; `pnpm --filter @legendary-arena/dashboard test` → exit 0
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Committed server-derived field set (exact; test sorts before comparing): `runId`, `submittedAt`, `startedAt`, `cellCount`, `anomalyCounts`
- Field count: **5**
- Excluded field, asserted ABSENT on the dashboard summary: `manifestBlob`
- New file path: exactly `apps/dashboard/src/types/sweep.drift.test.ts`
- Test runner: `node:test` + `node:assert/strict` (never `boardgame.io/testing`, never a third-party runner)
- D-entry guarded (cited, NOT created): **D-20703**

## Guardrails
- The test MUST NOT import `apps/server/**`, `@legendary-arena/game-engine`, `@legendary-arena/registry`, or any non-dashboard package — the committed field-set constant is the only bridge (grep gate enforces this)
- Capture the dashboard key set via a fully-typed `const sample: SweepRunSummary = { ...5 fields... }` literal (compile-time missing/excess-field guard) — do NOT hardcode a second key list for the dashboard side
- Read-only on `apps/dashboard/src/types/sweep.ts` — consumed via the typed literal, not edited
- Purely additive: no existing dashboard source file modified; no server/engine file touched
- The committed constant carries a `// why:` provenance comment: server source path + baseline commit + the D-20703 value-type deviation (anomalyCounts keys widened to `string` → out of scope for this field-set guard)
- Drift failure messages are full sentences naming the field + BOTH files (`sweep.ts` and `sweep.types.ts`) per 00.6 Rule 11
- If the typed `sample` literal fails to compile (missing/excess field): that IS the type-layer drift — STOP and report; do NOT loosen the type to compile
- If precondition B or C ≠ 5: STOP — the shape drifted before the test exists; reconcile first

## Required `// why:` Comments
- **One required.** On the committed server-derived field-set constant: cite `apps/server/src/sweep/sweep.types.ts` `SweepRunSummary` as the derivation source, the baseline commit hash, and the D-20703 deviation (anomalyCounts value-type widened to `string`, excluded from this field-set guard).

## Files to Produce
- `apps/dashboard/src/types/sweep.drift.test.ts` — **new** — cross-app field-set drift test + committed server-derived constant
- `docs/ai/STATUS.md` — **modified** — Done entry for WP-211
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — status → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — status → Done

## After Completing
- [ ] `test -f apps/dashboard/src/types/sweep.drift.test.ts` → FILE_OK
- [ ] No forbidden import: `grep -E "@legendary-arena/(game-engine|registry|server)|apps/server" apps/dashboard/src/types/sweep.drift.test.ts` → **NO MATCH**
- [ ] Provenance + deviation cited: `grep -F 'sweep.types.ts' …drift.test.ts` ≥ 1; `grep -F 'D-20703' …drift.test.ts` ≥ 1
- [ ] Typed-literal guard present: `grep -E ': SweepRunSummary =' …drift.test.ts` ≥ 1
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (new tests pass; prior suite count preserved)
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0
- [ ] `git status --short | wc -l` returns 4 (1 test + 3 governance); no production dashboard source touched
- [ ] `docs/ai/STATUS.md` Done entry references WP-211 + the cross-app drift guard
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-245:`

## Common Failure Smells
- Test green but guards nothing → the dashboard side was hardcoded as a second key list instead of a typed `SweepRunSummary` literal; the compile-time half is missing — use the typed literal
- `manifestBlob` slips into the dashboard summary → assert its absence; the server payload carries it but the summary excludes it
- Import of the server type "to compare directly" → layer violation; revert to the committed constant
- Field-set drift test conflated with the anomalyCounts value-type deviation → the deviation is intentional (D-20703); this test guards field SET only
- Suite count dropped vs baseline → an existing test was disturbed; the new file must be purely additive
