# EC-262 — Pipeline Page Sweep Integration (Execution Checklist)

**Source:** docs/ai/work-packets/WP-230-simulation-sweep-dashboard-integration.md
**Layer:** Dashboard — `apps/dashboard/src/composables/useAgentPipeline.{ts,test.ts}` (modified) + `apps/dashboard/src/pages/pipeline/PipelinePage.vue` (modified)

> Use locked values from WP-230 verbatim. EC-262 is the operational
> order + gates + failure smells; if EC-262 and WP-230 conflict, WP-230
> wins.

---

## Before Starting
- [ ] **WP-209 + WP-210 + WP-229 landed.** Verify:
  `grep -n "export function useSweepHealth" apps/dashboard/src/composables/useSweepHealth.ts`
  returns ≥ 1.
- [ ] **Sweep types present:**
  `grep -n "export interface SweepRunSummary" apps/dashboard/src/types/sweep.ts`
  returns ≥ 1.
- [ ] **Pipeline composable present:**
  `grep -n "export function useAgentPipeline" apps/dashboard/src/composables/useAgentPipeline.ts`
  returns ≥ 1.
- [ ] Read WP-230 §Goal, §Non-Negotiable Constraints, §Acceptance Criteria, §Scope (In/Out).
- [ ] Read `apps/dashboard/src/composables/useSweepHealth.ts` — the data source. Note: composable is a pure function of `(fetchState, currentTimeMs)`.
- [ ] Read `apps/dashboard/src/types/sweep.ts` — `SweepRunSummary` and `SweepHealthSnapshot` shapes.
- [ ] Read `apps/dashboard/src/widgets/SweepHealthWidget.vue` — the `/system` display pattern precedent for `Date.now()` sampling.
- [ ] `pnpm --filter @legendary-arena/dashboard test` + `typecheck` + `build` exit 0 (anchor baseline).

## Locked Values (verbatim from WP-230 — do not re-derive)
- **Sweep data parameter shape** (projection of `UseSweepHealthReturn`):
  `{ latestRun: SweepRunSummary | null; staleStatus: 'fresh' | 'stale'; totalAnomalySparkline: readonly number[] }`
- **Item ID prefix:** all sweep-derived `PipelineItem` IDs start with `sweep-`.
- **Item meta:** all sweep-derived `PipelineItem` meta fields equal `'Sweep'`.
- **Inspector lane:** one item per anomaly key where count > 0; fatal keys sort first.
- **Builder lane:** one item per anomaly key with count > 0 where key contains `'fatal'`.
- **Architect lane:** health rate = healthy cells / total cells; item added when < 0.8.
- **Evaluator lane:** sweep freshness item replaces static placeholder when data present.
- **Priority escalation signals:**
  - Inspector today → `'critical'` when fatals > 0
  - Builder today → `'critical'` when fatals > 0
  - Architect this-week → `'high'` when healthRate < 0.8
  - Evaluator today → `'high'` when staleStatus === `'stale'`
- **Health rate colors:** green ≥ 80%, yellow ≥ 50%, red < 50%.
- **Backward compatible:** when `sweepData` is undefined or `latestRun` is null, all sweep-derived items are absent; existing KPI-derived items and recommendations remain as-is.

## Guardrails
- **Anomaly key opacity (D-20703).** No anomaly key string may be hardcoded — keys read from `anomalyCounts` dynamically via `Object.keys()` or `Object.entries()`. Importing `SweepAnomalyClass` from the engine = HARD FAIL. Grepping for `endgame-reached`, `not-endgame`, or `escaped-villain-cap` in `useAgentPipeline.ts` must return 0.
- **Consumer only.** `useSweepHealth.ts` and `types/sweep.ts` MUST NOT be modified. `git diff` empty for both.
- **No engine or server changes.** `git diff --name-only packages/game-engine/` and `git diff --name-only apps/server/` both return empty.
- **Wall-clock discipline (D-19608).** `Date.now()` called ONCE at the PipelinePage render boundary, passed to `useSweepHealth`. No `Date.now()` inside `useAgentPipeline.ts`.
- **Single sweep data source.** `useAgentPipeline.ts` MUST NOT import `useSweepHealth` directly — the Pipeline page extracts fields and passes them in so the composable stays testable without fetch mocks.
- **Fatal key detection.** Use `key.includes('fatal')` — not exact equality to a specific key string (preserves opacity for future taxonomy expansion).
- **Graceful absence.** No `console.warn`, `console.error`, or thrown errors when sweep data is null/undefined — this is a normal pre-first-run state.
- **No new npm deps; no `Math.random`; no `@legendary-arena/(game-engine|registry|preplan|server)` imports.**
- **Full file contents** for every modified file — diffs/snippets forbidden.

## Required `// why:` Comments
- `useAgentPipeline.ts` — `// why:` sweep data is an optional parameter so the composable remains backward compatible and testable without sweep fetch infrastructure (D-20703 opacity + D-22901 snapshot-only posture extended).
- `PipelinePage.vue` — `// why:` `Date.now()` sampled once at render boundary per D-19608 wall-clock discipline; passed to `useSweepHealth` as `currentTimeMs`.

## Files to Produce
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** — accepts optional `sweepData` parameter; adds sweep-derived items to lanes; incorporates sweep signals into priority recommendations.
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — **modified** — ≥ 8 new sweep-specific test cases.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified** — imports `useSweepHealth`, passes sweep projection to composable, adds sweep summary bar.
- `docs/ai/STATUS.md` — **modified** — `### WP-230 / EC-262 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-23001..D-23003 Active.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-230 `[x]` with DoD summary.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip EC-262 Draft → Done.

**Total: 7 files** (3 modified source + 4 governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`).

## After Completing
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; suite includes ≥ 8 net-new sweep cases; no prior test regresses.
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] Anomaly key opacity:
  `grep -nE "endgame-reached|not-endgame|escaped-villain-cap" apps/dashboard/src/composables/useAgentPipeline.ts`
  returns 0 matches.
- [ ] No engine imports:
  `grep -rn "@legendary-arena/game-engine" apps/dashboard/src/composables/useAgentPipeline.ts`
  returns 0 matches.
- [ ] Consumer-only:
  `git diff --name-only apps/dashboard/src/composables/useSweepHealth.ts apps/dashboard/src/types/sweep.ts`
  returns empty.
- [ ] No engine/server changes:
  `git diff --name-only packages/game-engine/` and `git diff --name-only apps/server/` both return empty.
- [ ] Sweep ID prefix:
  `grep -c "sweep-" apps/dashboard/src/composables/useAgentPipeline.ts` returns ≥ 4.
- [ ] Sweep meta tag:
  `grep -c "'Sweep'" apps/dashboard/src/composables/useAgentPipeline.ts` returns ≥ 3.
- [ ] No `Date.now()` in composable:
  `grep -n "Date.now" apps/dashboard/src/composables/useAgentPipeline.ts` returns 0.
- [ ] Additive scope: `git diff --name-only` lists only the 7 `## Files to Produce` paths.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-23001..D-23003; `WORK_INDEX.md` WP-230 `[x]`; `EC_INDEX.md` EC-262 → Done.

## Common Failure Smells
- Hardcoded anomaly key string (e.g., `'endgame-reached'`) in `useAgentPipeline.ts` → D-20703 opacity HARD FAIL.
- `import { useSweepHealth }` inside `useAgentPipeline.ts` → composable-testability violation; sweep data must be passed in as a parameter.
- `Date.now()` called inside `useAgentPipeline.ts` → wall-clock discipline violation (D-19608).
- `useSweepHealth.ts` or `sweep.ts` appear in `git diff` → consumer-only violation.
- Sweep-derived items appear when `latestRun` is null → graceful-absence invariant violated.
- Priority urgency unchanged when sweep has fatals → escalation signals not wired.
- `import type { SweepAnomalyClass }` from engine → layer-boundary violation (D-20703).
- Health rate computed from hardcoded key names instead of cell counts → opacity breach.

---

## DECISIONS.md Entries (D-23001..D-23003)

> Status flips from `Reserved (proposed)` at draft time to `Active` at
> landing; no other field changes.

### D-23001 — Pipeline Composable: Optional Sweep Data Parameter (Backward Compatible)

**Decision:**
`useAgentPipeline` accepts an optional `sweepData` parameter containing a
projection of `UseSweepHealthReturn` (`latestRun`, `staleStatus`,
`totalAnomalySparkline`). The Pipeline page extracts these fields from
`useSweepHealth` and passes them in; the composable itself never calls
`useSweepHealth` directly, preserving testability via plain object injection
(same pattern as `snapshotOverride` per D-22901). When `sweepData` is
undefined or `latestRun` is null, all sweep-derived items are absent and
existing KPI-derived items remain unchanged — backward compatible with
pre-WP-230 callers.

**Packet:** WP-230 (EC-262).
**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23002 — Pipeline Page: Anomaly Key Opacity Preserved (D-20703 Extension)

**Decision:**
The Pipeline page treats anomaly count keys as opaque strings, extending
D-20703's dashboard-layer opacity posture from `SweepHealthWidget` to the
agent lanes. No anomaly key string is hardcoded in `useAgentPipeline.ts`;
keys are read dynamically via `Object.entries(anomalyCounts)`. Fatal
detection uses `key.includes('fatal')` — a substring test that survives
future taxonomy expansion without importing the engine's closed union.
The literal anomaly class names (`endgame-reached`, `not-endgame`, etc.)
must never appear in the composable or its tests.

**Packet:** WP-230 (EC-262).
**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23003 — Pipeline Page: Sweep-Derived Item ID Prefix Convention

**Decision:**
All `PipelineItem` instances derived from sweep data use an `id` prefixed
with `sweep-` (e.g., `sweep-inspector-fatal`, `sweep-builder-fatal`,
`sweep-architect-health`). This convention enables deterministic test
assertions and accessibility-tree identification without coupling to
specific anomaly key values. The prefix is a display/test convention only;
it carries no behavioral semantics.

**Packet:** WP-230 (EC-262).
**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)
