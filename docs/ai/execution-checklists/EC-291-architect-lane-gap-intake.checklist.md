# EC-291 — Architect-Lane Gap Intake (Execution Checklist)

**Source:** docs/ai/work-packets/WP-260-architect-lane-gap-intake.md
**Layer:** Dashboard (`apps/dashboard`)

> **WP-259 / D-24035 ✅ on `main` (Done 2026-06-18).** This EC was reconciled
> against WP-259's actual landed contract: a by-mechanic lookup
> `runtimeObservedByMechanic: Record<string, RuntimeObservedEntry>` exposed by
> `useCoverageLedger()` — **not** a per-`LedgerRow` overlay. At execution open,
> re-confirm that shape is still exposed and re-run pre-flight before coding.

## Before Starting
- [ ] WP-259 / D-24035 is on `main` (`useCoverageLedger()` exposes `runtimeObservedByMechanic: Record<string, RuntimeObservedEntry>`)
- [ ] WP-257 ✅ (the `HollowEffectRecord` reason taxonomy the overlay evidence uses)
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (baseline)
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 (baseline)

## Locked Values (do not re-derive)
- `ArchitectGapCandidate` fields (D-24036, match DESIGN §6.3 exactly): `mechanic`, `exampleCardId`, `cardType`, `timing`, `reason`, `observedCount`, `sourceRow`, `proposedTargetLayer`.
- `ArchitectTargetLayer` = closed union `'game-engine-hero' | 'game-engine-villain'`.
- `proposedTargetLayer` mapping:
  - `cardType === 'hero'` → `'game-engine-hero'`
  - `cardType === 'villain'` → `'game-engine-villain'`
  - `cardType === 'henchman'` → `'game-engine-villain'`
- Producer input: the `runtimeObservedByMechanic` lookup (`Record<string, RuntimeObservedEntry>`) from `useCoverageLedger()`, injected as a parameter (never fetched).
- Candidate selection rule (iterate the map's `[mechanic, entry]` pairs):
  - `entry.hitCount > 0`;
  - `entry.examples` has at least one example;
  - at least one example has a mappable `cardType`.
  - (Map membership IS the runtime-observed presence — there is no separate "overlay present" flag.)
- WP-260 does not classify reason strings. `reason` is opaque pass-through evidence.
- If multiple examples exist, use the first example whose `cardType` maps to a target layer.
- If no example has a mappable `cardType`, emit no candidate for that mechanic.
- `mechanic`: the map **key**. `sourceRow`: also the map key — WP-259 exposes no dedicated row id, so the mechanic key is the stable identifier. Do not synthesize a new identifier.
- Ignore the entry's `byReason` and `lastSeenTurn` fields (not part of the candidate contract).
- Ordering: `observedCount` descending, then `mechanic` ascending, then `exampleCardId` ascending.
- `PipelineItem` label = `"<mechanic> — <reason> (<n>× in play)"`; `meta = 'Hollow gap'`.
- `ArchitectGapProjection` = `{ readonly candidates: readonly ArchitectGapCandidate[]; readonly backlog: readonly PipelineItem[] }`, declared in `useAgentPipeline.ts` (consumer-owned, D-23901).
- `useAgentPipeline` fourth parameter: `architectGapData?: ArchitectGapProjection` — **optional**; folds into `architectBacklog` via `unshift`.
- Lands **D-24036** only. No other DECISIONS entry.

## Guardrails
- **Dashboard-only** — no import from `@legendary-arena/game-engine`, `registry`, `server`, `apps/arena-client`, or `pg`. The engine stays unaware (DESIGN §9).
- **No new data/fetch source** — read the `useCoverageLedger()` `runtimeObservedByMechanic` lookup by dependency injection (a parameter); the producer never fetches. No `/api/*`, no new JSON artifact.
- **Fold the Architect lane ONLY** — Builder/Inspector/Evaluator lanes **deep-equal** the no-injection result (D-23902 single-lane discipline). The 4th param is optional; absent ⇒ output deep-equals the baseline (backward-compat, the `triageData` precedent).
- **Invent no facts** — every field copied/derived from the overlay; `proposedTargetLayer` only from the fixed `cardType` mapping; reasons pass through opaquely (no literal-reason comparison, D-20703).
- **Consumer owns the projection type** (D-23901) — `ArchitectGapProjection` in `useAgentPipeline.ts`; the producer imports it. `ArchitectGapCandidate` lives in `types/architectGap.ts`.
- **No `G`/game-state/RNG/determinism/card-data touch** — `data/cards/**` byte-unchanged; pure deterministic view-model.
- **Re-confirm the overlay shape** — this EC is reconciled to WP-259's landed by-mechanic `runtimeObservedByMechanic: Record<string, RuntimeObservedEntry>` contract; if `useCoverageLedger()` no longer exposes that at execution open, STOP and re-reconcile this EC + the WP §Assumes before coding (do not guess).

## Required `// why:` Comments
- `types/architectGap.ts`: every candidate field is copied/derived from the overlay evidence, never invented (DESIGN §9).
- `useArchitectGapIntake.ts`: the selection rule (runtime-confirmed-hollow ≠ static-unsupported) and the deterministic ordering.
- `useAgentPipeline.ts`: the consumer-owned projection (D-23901) + the single-lane `unshift` fold + optional-param backward-compat (D-23902 precedent).

## Files to Produce
- `apps/dashboard/src/types/architectGap.ts` — **new** — `ArchitectGapCandidate` + `ArchitectTargetLayer` (D-24036 contract)
- `apps/dashboard/src/composables/useArchitectGapIntake.ts` — **new** — `runtimeObservedByMechanic` entries → runtime-confirmed-hollow candidates → `ArchitectGapProjection`
- `apps/dashboard/src/composables/useArchitectGapIntake.test.ts` — **new** — selection / mapping / ordering / empty-state tests
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** — declare `ArchitectGapProjection`; add optional 4th `architectGapData`; fold into `architectBacklog`
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — **modified** — Architect-fold + parameter-absent backward-compat tests
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified (mount; 01.5)** — construct + inject the gap projection as the 4th `useAgentPipeline` argument

## Additional Test Requirements
- **Producer** (fixtures are `Record<string, RuntimeObservedEntry>` maps): an entry with `hitCount > 0` + ≥1 mappable-`cardType` example ⇒ one candidate with exact copied fields + correct `proposedTargetLayer` (`mechanic` and `sourceRow` = the map key); empty map / `hitCount` 0 / no examples / no mappable `cardType` ⇒ no candidate; a `cardType: 'mastermind'` (or other unmapped type) ⇒ no candidate; multiple examples ⇒ the first mappable example is used; first-example-unmapped + later-example-mappable ⇒ the later mappable example is used; `reason` strings preserved exactly (incl. unknown/future values, no classification); ordering `observedCount` desc → `mechanic` asc → `exampleCardId` asc (ties broken by `exampleCardId`); `backlog` items derived 1:1 from ordered candidates.
- **Consumer:** injected ⇒ gap items lead `architect.backlog`, other three lanes deep-equal the no-injection result; absent ⇒ output deep-equals the pre-WP-260 baseline.

## After Completing
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/dashboard test` 0; `pnpm --filter @legendary-arena/dashboard typecheck` 0
- [ ] `git diff --name-only -- data/cards/` empty; no engine/registry/server/arena-client/`pg` import; no new fetch/endpoint
- [ ] No files outside Files to Produce modified
- [ ] `docs/ai/STATUS.md` records the change with **D-24026 pending deploy verification** (PR/SHA candidate)
- [ ] `docs/ai/DECISIONS.md` **D-24036** → Active; `docs/ai/work-packets/WORK_INDEX.md` WP-260 ✅ (date); `docs/ai/execution-checklists/EC_INDEX.md` EC-291 Done; `docs/05-ROADMAP-MINDMAP.md` WP-260 node; `node scripts/roadmap-counts.mjs --check` passes
- [ ] Post-deploy (D-24026): deployed `/pipeline` Architect lane leads with the hollow-gap candidates (or no gap rows when the overlay carries none); STATUS.md updated with deployed SHA + evidence

## Common Failure Smells
- `vue-tsc` errors after the change → the fourth parameter was made required, or `ArchitectGapProjection` was declared in the producer instead of the consumer (D-23901).
- Builder/Inspector/Evaluator lanes changed → the fold touched more than the Architect lane (violates D-23902 single-lane discipline).
- A static-unsupported mechanic with no runtime observation appears as a candidate → the producer used static ledger state instead of the `runtimeObservedByMechanic` entry's `hitCount`.
- The producer contains `if (reason === 'no-handler')`, `includes(reason)`, or any literal reason allowlist → reason strings are being classified instead of passed through opaquely (D-20703).
- A candidate appears for an unmapped `cardType` → the producer invented a target layer instead of emitting no candidate.
- A new `/api/*` call, new JSON artifact, or network fetch appears in the diff → the producer fetched instead of receiving the injected `runtimeObservedByMechanic` lookup.
- A new Pipeline panel, route, or template lane appears → the packet added a UI surface instead of folding into the existing Architect lane.
