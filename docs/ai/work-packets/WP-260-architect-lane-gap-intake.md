# WP-260 — Architect-Lane Gap Intake (Runtime-Confirmed Hollow Gaps → Draft-WP Candidates; Reporting Loop, Surface 3 of 3)

**Status:** Draft — **READY TO EXECUTE.** Pre-flight verdict: **READY** (see §Pre-Flight & Copilot Verdicts). WP-259 / D-24035 (the hard-dep) landed on `main` 2026-06-18; this WP + EC-291 were reconciled against WP-259's **actual landed contract** (a by-mechanic `runtimeObservedByMechanic` lookup, **not** a per-`LedgerRow` overlay — see §Assumes) before this drafting commit.
**Primary Layer:** Dashboard only (`apps/dashboard/src/**`). Single layer — no engine/registry/server/arena-client touch. The engine remains unaware the pipeline exists (`DESIGN-HOLLOW-EFFECT-DETECTION.md §9`).
**User-Visible Surface:** the deployed dashboard **Pipeline page** (`/pipeline`) — the **Architect lane** backlog gains runtime-confirmed hollow-effect mechanics as draft-WP candidates. (D-24026 live-verification applies, post-deploy.)
**Dependencies:** **WP-259 / D-24035 ✅ (Done 2026-06-18, on `main` — commit `b395df71`).** The `runtime-observed` overlay this reads: `useCoverageLedger()` exposes `runtimeObservedByMechanic: ComputedRef<Record<string, RuntimeObservedEntry>>` (the per-mechanic runtime tally) + `runtimeObservedSummary`. WP-257 / D-24034 ✅ (the `HollowEffectRecord` reason taxonomy the overlay's runtime evidence derives from). WP-239 / D-23901 + D-23902 ✅ (the `triageData` → Inspector-lane dependency-injection precedent this mirrors). The existing `/coverage` surface (`CoveragePage.vue` + `useCoverageLedger.ts`) ✅. `useAgentPipeline.ts` Architect lane + `PipelinePage.vue` injection site ✅.

---

## Goal

After this session, the dashboard Pipeline page's **Architect lane** surfaces, as draft-WP backlog candidates, the card mechanics that WP-259's `/coverage` overlay marks as **runtime-confirmed hollow**: declared abilities that were actually encountered in play and whose handlers were unreachable.

Each candidate carries the minimum evidence needed for a human architect to draft a follow-up implementation WP without the engine knowing the pipeline exists: mechanic, example card id, card type, timing, reason, observed count, source coverage row, and proposed target layer.

The intake is a pure, deterministic, dependency-injected view-model addition that mirrors the WP-239 `triageData` precedent:

1. the page obtains the runtime-observed by-mechanic tally (`runtimeObservedByMechanic`) from the existing `useCoverageLedger()` source;
2. a producer composable projects those per-mechanic runtime entries into Architect-gap candidates;
3. `PipelinePage.vue` samples the projection once and injects it into `useAgentPipeline`;
4. `useAgentPipeline` folds the resulting backlog items into the existing Architect lane only.

WP-260 adds no engine, registry, server, arena-client, persistence, endpoint, fetch source, game-state mutation, RNG, card-data change, or new Pipeline surface.

## Assumes

- **WP-259 / D-24035 — `/coverage` runtime-observed overlay ✅ (Done 2026-06-18, on `main`).** Reconciled against the actual landed contract (this WP originally assumed a per-`LedgerRow` `runtimeObserved?` field; WP-259 instead landed a **by-mechanic lookup**): `useCoverageLedger()` exposes `runtimeObservedByMechanic: ComputedRef<Record<string, RuntimeObservedEntry>>`, keyed by mechanic, where (per `apps/dashboard/src/types/coverage.ts`) `RuntimeObservedEntry = { hitCount: number; lastSeenTurn: number; byReason: { 'no-handler': number; 'unsupported-keyword': number; 'parse-unrecognized': number }; examples: readonly RuntimeObservedExample[] }` and `RuntimeObservedExample = { cardId: string; cardType: string; timing: string; reason: string }`. WP-260 reads `runtimeObservedByMechanic` only — the static `LedgerRow[]` is **not** its input (runtime-confirmed candidacy comes from the by-mechanic tally, not the static rows). The producer ignores the entry's extra `byReason` and `lastSeenTurn` fields. **Live-baseline note:** the committed build-time artifact (`docs/ai/coverage/runtime-observed-hollows.json`) is currently a recorded **zero-state** (`byMechanic = {}`) — the heavier competent-play sweep that populates real signal is deferred to a cron (WP-259's D-24035 CI-affordability fallback). So at deploy time the Architect lane shows **no** gap rows until that cron lands; WP-260 must render and test the empty path as the live baseline (§Verification Steps, §DoD).
- **WP-257 / D-24034 ✅ (on `main`).** The `HollowEffectRecord` reason taxonomy provides the reason strings carried by runtime evidence. WP-260 treats reason as opaque display evidence. It does not classify, compare, branch on, or validate reason strings. Runtime-confirmed candidacy comes from the WP-259 by-mechanic entry itself: an entry with `hitCount > 0` together with at least one example.
- **WP-239 / D-23901 + D-23902 ✅ (on `main`).** The dependency-injection precedent this mirrors exactly: a producer composable returns a `ComputedRef<Projection>`; the projection **type is declared in the consumer** (`useAgentPipeline.ts`) so the import stays one-directional (D-23901); `PipelinePage.vue` samples the projection once and passes it as a positional argument; `useAgentPipeline` folds it into **one** lane (`triageData` → Inspector via `unshift`, D-23902). WP-260 folds into the **Architect** lane.
- **The existing `/coverage` surface ✅ (on `main`).** `apps/dashboard/src/pages/coverage/CoveragePage.vue` + `apps/dashboard/src/composables/useCoverageLedger.ts` (reads the build-time `apps/dashboard/src/data/coverage-ledger.json`, a copy of `docs/ai/coverage/hero-mechanic-ledger.json`). WP-260 adds NO new fetch/data source; it reads the `runtimeObservedByMechanic` lookup the composable already exposes (the WP-259 overlay).
- **`useAgentPipeline.ts` Architect lane + `PipelinePage.vue` injection ✅ (on `main`).** `useAgentPipeline(snapshotOverride?, sweepData?, triageData?)` builds the four lanes; the Architect lane backlog (`architectBacklog`) currently carries sweep-health + open-drafts + draft-WP items. `PipelinePage.vue` constructs the injected projections and renders `PipelineLane.backlog` items (`PipelineItem = { id, label, meta? }`).
- **Dashboard tooling ✅.** `apps/dashboard` test runner is `node:test` (`node --import tsx --test`); typecheck is `vue-tsc --noEmit` (`pnpm --filter @legendary-arena/dashboard typecheck`).

## Context (Read First)

- `docs/ai/DESIGN-HOLLOW-EFFECT-DETECTION.md` — **§6.3 (architect lane intake — the authoritative contract for this WP)**, §6 (the three-consumer reporting loop), §8 WP-260 acceptance criteria, §9 boundaries (engine-unaware; never invent facts absent from the signal/overlay), §10 **D-24036**.
- `docs/ai/ARCHITECTURE.md` — Layer Boundary (Authoritative): the dashboard reads downstream-derived data only; the engine emits the signal and never knows the pipeline exists. No engine/registry/server runtime import.
- `.claude/rules/architecture.md` (Layer Boundary enforcement) + `.claude/rules/code-style.md` (no `.reduce()` with branching; descriptive names; `// why:` on non-obvious decisions; small JSDoc'd functions).
- **The WP-239 precedent in `apps/dashboard/src/composables/useAgentPipeline.ts`** — `TriageProjection` declared in the consumer (≈ lines 45–56), the optional `triageData` parameter (≈ lines 455–459), the Inspector-lane fold via `unshift` (≈ lines 704–714). The producer `apps/dashboard/src/composables/useTriageStatus.ts` and the page injection in `apps/dashboard/src/pages/pipeline/PipelinePage.vue` (the `useAgentPipeline(undefined, sweepData, triage.value)` call site).
- `docs/ai/DECISIONS.md` — scan **D-23901** (consumer owns the projection type — one-directional import), **D-23902** (triage folds into one lane, not a new panel), **D-20703** (opaque downstream keys — never compared against a literal class name), **D-24034** (the reason taxonomy), and **D-24035** (the WP-259 `/coverage` runtime-overlay contract — Active; the `runtimeObservedByMechanic` lookup this reads).
- `docs/ai/REFERENCE/00.6-code-style.md` (human-style code) + `EC-291-architect-lane-gap-intake.checklist.md` (the authoritative execution contract).

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- Full file contents for every new or modified file — **no diffs, no snippets, no "show only the changed section."**
- ESM only; Node v22+; human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (descriptive names, small JSDoc'd functions, `// why:` on non-obvious decisions, no premature abstraction, no branching `.reduce()`).

**Packet-specific (locked):**
- **Dashboard-only.** No import from `@legendary-arena/game-engine`, `registry`, `server`, `apps/arena-client`, `pg`, or any engine runtime. The intake reads ONLY the `runtimeObservedByMechanic` lookup the dashboard already exposes. The engine stays unaware the pipeline exists.
- **No new data/fetch source.** WP-260 introduces no HTTP endpoint, no new JSON artifact, no `/api/*` call. It consumes the `runtimeObservedByMechanic` lookup the existing `useCoverageLedger()` already exposes. The producer composable receives that lookup by **dependency injection** (a parameter), never fetching it itself — the `snapshotOverride` / `sweepData` / `triageData` DI shape (D-23001 / D-23901).
- **Mirror the WP-239 DI direction (D-23901).** The projection type `ArchitectGapProjection` is declared in the **consumer** (`useAgentPipeline.ts`); the producer composable imports it. The structured candidate type `ArchitectGapCandidate` lives in a shared dashboard types file (mirroring `types/triage.ts`).
- **Fold into the Architect lane only (one lane).** The injected projection prepends to `architectBacklog`; the Builder, Inspector, and Evaluator lanes are untouched (the D-23902 single-lane discipline). The fourth parameter is **optional** — every existing `useAgentPipeline(...)` caller stays compilable and behaves identically when it is absent (backward-compatible, the `triageData` precedent).
- **Invent no facts (D-24036 / design §9).** Every candidate field is copied from the overlay evidence or derived by a fixed rule documented in this packet. `reason` is passed through opaquely and is never compared against a literal value. `proposedTargetLayer` is derived only from the example's `cardType`: `hero` → `game-engine-hero`; `villain` / `henchman` → `game-engine-villain`. If the card type is anything else, WP-260 emits no candidate for that example because the target layer cannot be derived without inventing facts.
- **No engine/game-state mutation, no determinism surface, no RNG, no card-data change.** `data/cards/**` byte-unchanged. Pure, deterministic view-model derivation given its injected input.
- **No new DECISIONS beyond D-24036.** This WP lands exactly **D-24036** (the architect-lane intake contract). It projects D-24034/D-24035; it does not re-decide them.
- **Session protocol:** the WP-259 overlay shape was reconciled against the actual landed contract at draft time (a by-mechanic `runtimeObservedByMechanic` lookup, **not** a per-`LedgerRow` field — §Assumes). At execution open the executor re-confirms `useCoverageLedger()` still exposes `runtimeObservedByMechanic: Record<string, RuntimeObservedEntry>`; if it has since changed, STOP and re-reconcile before coding — do not guess.

## Scope (In)

### A) The structured intake contract (D-24036)

- **`apps/dashboard/src/types/architectGap.ts`** (new) — declare the D-24036 intake contract:
  - `ArchitectTargetLayer = 'game-engine-hero' | 'game-engine-villain'`
  - `ArchitectGapCandidate = { mechanic: string; exampleCardId: string; cardType: string; timing: string; reason: string; observedCount: number; sourceRow: string; proposedTargetLayer: ArchitectTargetLayer }`

Add a `// why:` comment documenting that each candidate is copied from runtime overlay evidence or derived by the fixed card-type-to-layer mapping, never invented. Field names must match DESIGN §6.3 exactly.

`sourceRow` must come from a stable coverage-row identifier exposed by the landed WP-259 row contract. If WP-259 exposes no dedicated row id, use the row's `mechanic` value. Do not synthesize a new identifier.

### B) The producer composable (by-mechanic tally → candidates → fold-ready items)

- **`apps/dashboard/src/composables/useArchitectGapIntake.ts`** (new) — `useArchitectGapIntake(runtimeObservedByMechanic)` receives the `runtimeObservedByMechanic` lookup (`Record<string, RuntimeObservedEntry>`, accessed via the `ComputedRef` `useCoverageLedger()` exposes) by dependency injection and returns `ComputedRef<ArchitectGapProjection>`.

The producer iterates the map's `[mechanic, entry]` pairs and selects a mechanic where:

1. `entry.hitCount > 0`;
2. `entry.examples` contains at least one example;
3. at least one example has a mappable `cardType` (per the locked rule below).

(Map membership is itself the runtime-observed presence — there is no separate "overlay present" flag.) The producer does **not** determine whether a reason string is hollow by comparing literal reason values; the by-mechanic tally is the runtime-confirmed hollow signal.

For each selected mechanic, use the first example whose `cardType` can be mapped by the locked target-layer rule:

- `hero` → `game-engine-hero`
- `villain` → `game-engine-villain`
- `henchman` → `game-engine-villain`

If no example has a mappable `cardType`, emit no candidate for that mechanic.

Each emitted `ArchitectGapCandidate` copies:

- `mechanic` from the map **key**;
- `exampleCardId`, `cardType`, `timing`, and `reason` from the selected example;
- `observedCount` from `entry.hitCount`;
- `sourceRow` from the mechanic key (WP-259 exposes no dedicated row id — the key is the stable identifier; do not synthesize a new one);
- `proposedTargetLayer` from the fixed card-type mapping.

The producer ignores the entry's extra `byReason` and `lastSeenTurn` fields (neither is part of the D-24036 candidate contract).

The projection also maps each candidate to one `PipelineItem`:

- `label = "<mechanic> — <reason> (<n>× in play)"`
- `meta = "Hollow gap"`

Ordering is deterministic: `observedCount` descending, then `mechanic` ascending, then `exampleCardId` ascending as a final tie-breaker.

Add `// why:` comments for the runtime-confirmed selection rule and deterministic ordering.

### C) The consumer fold (Architect lane)

- **`apps/dashboard/src/composables/useAgentPipeline.ts`** (modified) — declare `ArchitectGapProjection` in the consumer next to `TriageProjection`:

```ts
export type ArchitectGapProjection = {
  readonly candidates: readonly ArchitectGapCandidate[];
  readonly backlog: readonly PipelineItem[];
};
```

The type imports `ArchitectGapCandidate` type-only from `../types/architectGap.js`. Add a fourth optional parameter `architectGapData?: ArchitectGapProjection`. When present, prepend `architectGapData.backlog` to `architectBacklog` (via `unshift`) so runtime-confirmed gaps lead the Architect backlog. The Builder, Inspector, and Evaluator lanes must remain deep-equal to the no-injection result. A `// why:` records that `ArchitectGapProjection` is consumer-owned per D-23901, the fold is Architect-lane-only per D-23902, and the fourth parameter is optional to preserve backward compatibility with existing callers.

### D) The page wiring (01.5 runtime-wiring)
- **`apps/dashboard/src/pages/pipeline/PipelinePage.vue`** (modified) — call `useCoverageLedger()` (the page does not use it today), extract `runtimeObservedByMechanic`, call `useArchitectGapIntake(runtimeObservedByMechanic)`, sample `.value` once, and pass it as the fourth positional argument to `useAgentPipeline(undefined, sweepData, triage.value, architectGap.value)` — exactly the `triageData` sampling/injection idiom. No template change beyond what the existing lane renderer already provides (the Architect lane already renders `backlog` items).

### E) Tests
- **`apps/dashboard/src/composables/useArchitectGapIntake.test.ts`** (new) — the producer (fixtures are `Record<string, RuntimeObservedEntry>` maps):
  - an entry with `hitCount > 0` and ≥1 example with a mappable `cardType` produces one candidate with the exact copied/derived fields + correct `proposedTargetLayer` (`mechanic` = the map key, `sourceRow` = the map key);
  - an empty map, or an entry with `hitCount === 0`, no examples, or no example with a mappable `cardType`, produces **no** candidate;
  - an entry whose only example is `cardType: 'mastermind'` (or another unmapped card type) produces no candidate;
  - an entry with multiple examples uses the first mappable example;
  - an entry whose first example is unmapped and a later example is mappable uses the later mappable example;
  - `reason` strings are preserved exactly, including unknown/future reason values (no classification or comparison);
  - ordering is deterministic — `observedCount` desc, then `mechanic` asc, then `exampleCardId` asc (ties on count + mechanic break by `exampleCardId`);
  - the projection's `backlog` `PipelineItem[]` is derived 1:1 from the ordered candidates.
- **`apps/dashboard/src/composables/useAgentPipeline.test.ts`** (modified) — with `architectGapData` injected, the gap items lead `architect.backlog` and the Builder/Inspector/Evaluator lanes are **deep-equal** to the no-injection result; with the parameter **absent**, the output is **deep-equal** to the pre-WP-260 baseline (backward-compat).

## Out of Scope

- **WP-259's `/coverage` overlay itself** (the `runtimeObserved` field, its data source, the ledger extension) — that is WP-259 / D-24035. WP-260 only **reads** it. If WP-259 has not landed, WP-260 does not execute.
- **The engine detector / `G.diagnostics.hollowEffects` channel / `HollowEffectRecord` shape** (WP-257 / D-24034) — untouched.
- **Any server telemetry / persistence / match-ingestion pipeline.** WP-260 adds no `/api/*` endpoint and no live match feed; it reads the same build-time-derived coverage data the dashboard already uses. A live match→dashboard ingestion path remains the deferred multi-layer packet noted in WP-258's scope.
- **A new Pipeline panel, lane, route, or `CoveragePage.vue` change.** The intake folds into the existing Architect lane backlog only (the D-23902 single-lane discipline); it does not add UI surfaces.
- **Auto-drafting WPs / mutating `WORK_INDEX.md` / writing files from the lane.** WP-260 produces backlog **candidates** a human/architect reads; it claims no implementation scope and writes no governance artifact (design §6.3 / §8: "generated candidates claim no implementation scope beyond the diagnostic facts").
- **`G` mutation, new moves, RNG, determinism, scoring, identity, card data.** None touched.

## Files Expected to Change

- `apps/dashboard/src/types/architectGap.ts` — **new** — `ArchitectGapCandidate` + `ArchitectTargetLayer` (the D-24036 intake contract).
- `apps/dashboard/src/composables/useArchitectGapIntake.ts` — **new** — producer: `runtimeObservedByMechanic` entries → runtime-confirmed-hollow `ArchitectGapCandidate[]` → `ArchitectGapProjection` (`ComputedRef`).
- `apps/dashboard/src/composables/useArchitectGapIntake.test.ts` — **new** — producer selection / mapping / ordering / empty-state tests.
- `apps/dashboard/src/composables/useAgentPipeline.ts` — **modified** — declare `ArchitectGapProjection`; add the optional 4th `architectGapData` param; fold into `architectBacklog` (Architect lane only).
- `apps/dashboard/src/composables/useAgentPipeline.test.ts` — **modified** — Architect-fold test + parameter-absent backward-compat test.
- `apps/dashboard/src/pages/pipeline/PipelinePage.vue` — **modified (mount; 01.5 runtime-wiring)** — construct + inject the gap projection as the 4th `useAgentPipeline` argument.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-260 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-291 Done), `docs/ai/DECISIONS.md` (**D-24036** → Active), `docs/05-ROADMAP-MINDMAP.md` (WP-260 node) + `node scripts/roadmap-counts.mjs --check`.

No other files modified. `data/cards/**` byte-unchanged.

## Acceptance Criteria

### A) Intake contract (D-24036)
- [ ] `ArchitectGapCandidate` carries exactly `mechanic`, `exampleCardId`, `cardType`, `timing`, `reason`, `observedCount`, `sourceRow`, `proposedTargetLayer`; `ArchitectTargetLayer` is the closed union `'game-engine-hero' | 'game-engine-villain'`. Field names match `DESIGN §6.3`.
- [ ] Every candidate field is copied from the overlay evidence; `proposedTargetLayer` is the fixed `cardType` mapping (`hero` → `game-engine-hero`; `villain`/`henchman` → `game-engine-villain`) — no invented data, no reason-string literal comparison (D-20703).

### B) Producer selection + mapping
- [ ] A `runtimeObservedByMechanic` entry with `hitCount > 0` and at least one example with a mappable `cardType` yields exactly one candidate with the exact copied/derived fields (`mechanic` and `sourceRow` both the map key).
- [ ] An empty map, or an entry with `hitCount === 0`, no examples, or no example with a mappable `cardType`, yields **no** candidate (static-unsupported-but-never-hit is not a runtime-confirmed gap).
- [ ] The producer does not compare `reason` against literal values; reason strings are opaque pass-through evidence.
- [ ] If multiple examples are present, the producer uses the first example whose `cardType` maps to a target layer.
- [ ] Candidate ordering is deterministic: `observedCount` descending, then `mechanic` ascending, then `exampleCardId` ascending. The projection's `backlog` `PipelineItem[]` is derived 1:1 from the ordered candidates.

### C) Architect-lane fold (consumer)
- [ ] `ArchitectGapProjection` is declared in `useAgentPipeline.ts` (consumer-owned, D-23901); `architectGapData` is the optional fourth parameter.
- [ ] With `architectGapData` injected, its `backlog` items **lead** `architect.backlog`.
- [ ] With `architectGapData` injected, `builder`, `inspector`, and `evaluator` are **deep-equal** to the no-injection result.
- [ ] With the fourth parameter **absent**, `useAgentPipeline` output is **deep-equal** to the pre-WP-260 baseline.
- [ ] Existing `useAgentPipeline(...)` callers compile and behave identically without modification.

### D) Boundaries / determinism / wiring
- [ ] No import from `@legendary-arena/game-engine`, `registry`, `server`, `arena-client`, or `pg` in any WP-260 file; no new fetch/endpoint; `data/cards/**` byte-unchanged.
- [ ] `PipelinePage.vue` injects the projection via the `useCoverageLedger` → `useArchitectGapIntake` → `useAgentPipeline` 4th-arg chain (the `triageData` idiom); no template lane change required.
- [ ] `pnpm --filter @legendary-arena/dashboard test` 0 and `pnpm --filter @legendary-arena/dashboard typecheck` (`vue-tsc --noEmit`) 0.
- [ ] `git diff --name-only` shows only Files Expected to Change + governance.

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0
pnpm --filter @legendary-arena/dashboard test          # all pass, 0 fail
pnpm --filter @legendary-arena/dashboard typecheck     # vue-tsc --noEmit, 0 errors
git diff --name-only -- data/cards/                     # empty
```

Live (D-24026, **post-deploy only**): on the deployed dashboard `/pipeline`, confirm the Architect lane backlog leads with the runtime-confirmed hollow-gap candidates the deployed `/coverage` overlay contains (each labelled `<mechanic> — <reason> (<n>× in play)`, meta `Hollow gap`); when the overlay carries no runtime-confirmed gaps, the lane shows its existing items with no gap rows (no crash, no empty injection).

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1 structure:** PASS — `Goal`, `Assumes`, `Context (Read First)`, `Scope (In)`, `Out of Scope` (≥2 explicit exclusions), `Files Expected to Change`, `Non-Negotiable Constraints`, `Acceptance Criteria`, `Verification Steps`, `Definition of Done` all present and non-empty.
- **§2 constraints:** PASS — Engine-wide block (full file contents; no diffs/snippets; ESM; Node v22+; references `00.6-code-style.md`) + packet-specific locked constraints + session protocol + locked contract (`ArchitectGapCandidate` field set, `ArchitectTargetLayer` union, the fixed `cardType`→layer mapping).
- **§3 Assumes:** PASS — every dependency listed with its required shape; the WP-259 hard-dep is ✅ on `main` (Done 2026-06-18), and this WP + EC-291 were reconciled against its actual landed `runtimeObservedByMechanic` contract before this drafting commit.
- **§4 Context:** PASS — specific docs + sections (DESIGN §6.3/§9/§10, ARCHITECTURE Layer Boundary, the WP-239 precedent file:line ranges, DECISIONS D-23901/D-23902/D-20703/D-24034/D-24035). Touches no card-data shape → 00.2 not required; the data it reads is the coverage overlay, not a setup payload.
- **§5 files:** PASS — 6 files, each new/modified with a one-line description; bounded; no patch/partial language.
- **§6 naming:** PASS — canonical names; no card-setup fields touched; new names are full English words.
- **§7 deps:** PASS — no new npm dependency; no `axios`/`node-fetch`/ORM/Jest/Vitest (dashboard uses `node:test`).
- **§8 architecture:** PASS — dashboard-only; reads downstream-derived coverage data; no engine/registry/server/arena-client/`pg` import; engine stays unaware (DESIGN §9 + Layer Boundary). No game logic in the view-model.
- **§9 Windows / §10 env / §11 auth:** N/A — no scripts/shell, no env vars, no authentication surface.
- **§12 tests:** PASS — `node:test`; pure composable tests by fixture injection; no `boardgame.io`, no network/DB.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands incl. `dashboard typecheck` (the recurrence gate); binary observable criteria aligned 1:1 with deliverables; DoD split pre-merge / post-deploy (D-24026).
- **§16 code style:** PASS — small JSDoc'd functions; descriptive names; the fixed `cardType`→layer mapping is an explicit `if/else` (no branching `.reduce()`, no dynamic key access); `// why:` on the no-invented-facts rule, the consumer-owned projection (D-23901), the single-lane fold (D-23902), and the optional-param backward-compat.
- **§17 Vision:** **N/A (explicit).** Touches no §17.1 trigger surface — not scoring/PAR/leaderboards, not replay, not identity, not multiplayer sync, not determinism/RNG, not card-data/image/semantics (it surfaces a coverage **view** of operator-facing data; it changes no card content), not monetization, not accessibility/i18n, not the registry-viewer public surface. Operator-facing dashboard pipeline view only.
- **§18 prose-vs-grep:** PASS — no count-bounded grep gate on a policed literal in the Verification Steps.
- **§19 bridge-vs-HEAD:** N/A — not a repo-state-summarizing artifact.
- **§20 funding:** N/A — operator-facing pipeline view-model; no donate/support copy, no funding-channel surface, no global-nav/registry/profile funding affordance.
- **§21 API catalog:** N/A — no HTTP endpoint and no `apps/server/src/**` library function added/modified/removed; dashboard composable + page only, reading build-time-derived coverage data.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-18, baseline `0a60968b`).** The former blocker — **WP-259 / D-24035** — is now ✅ Done and on `main` (commit `b395df71`; D-24026 live-verified `0a60968b`). The producer's input contract is finalized against WP-259's **actual landed shape**, reconciled at draft: `useCoverageLedger()` exposes `runtimeObservedByMechanic: ComputedRef<Record<string, RuntimeObservedEntry>>` (a **by-mechanic lookup**, not the per-`LedgerRow` `runtimeObserved?` field this WP originally assumed). The §Assumes, §Scope B/D, §Acceptance B, and the EC's Before-Starting / Locked-Values / Guardrails were all updated to the by-mechanic contract; `sourceRow` resolves to the map key (the fallback the WP already specified, since WP-259 exposes no dedicated row id). **Verified READY-shaped:** the design contract (DESIGN §6.3) is locked; the DI pattern is grounded against the live WP-239 `triageData` precedent (consumer-owned projection D-23901 at `useAgentPipeline.ts:45–56`, the optional param at `:455–459`, the single-lane `unshift` fold at `:704–714`); `useCoverageLedger` / `useAgentPipeline` Architect lane / `PipelinePage` injection site all on `main`; scope is single-layer dashboard, bounded 6-file allowlist; no determinism/persistence/RNG/card-data surface. **Note (not a blocker):** WP-259's committed artifact is a recorded zero-state (`byMechanic = {}`), so the deployed Architect lane shows no gap rows until the competent-play sweep cron lands — the empty path is the live D-24026 baseline and is explicitly in scope (§Verification, §DoD). **At execution open:** re-confirm `useCoverageLedger()` still exposes `runtimeObservedByMechanic` (the `01.0b §Step 8` revalidation), then execute.
- **Copilot (`01.7`): PASS / CONFIRM (2026-06-18).** 30-issue lens. **Cat-1 Boundaries:** dashboard-only; engine unaware; no upward or sideways runtime import. **Cat-2 Determinism:** pure view-model derivation; deterministic candidate and backlog ordering; no RNG, clock, IO, persistence, or game-state mutation. **Cat-3 DI Direction:** mirrors WP-239; consumer owns `ArchitectGapProjection` per D-23901; producer imports the projection type and receives the `runtimeObservedByMechanic` lookup by dependency injection. **Cat-4 Type Safety:** closed `ArchitectTargetLayer`; unmapped card types emit no candidate rather than inventing a layer; optional fourth parameter keeps existing callers compatible. **Cat-5 Persistence/Data Sources:** no new endpoint, fetch source, JSON artifact, or server path. **Cat-6 Testing:** producer selection/mapping/ordering/empty-state tests plus consumer Architect-fold and absent-parameter backward-compat tests. **Cat-7 No Invented Facts:** candidate fields are copied from the WP-259 by-mechanic entry or derived only by the locked card-type mapping; reasons remain opaque pass-through evidence. The former conditional risk (in-flight WP-259 contract) is **resolved** — WP-259 landed and the WP/EC were reconciled to its actual shape → unconditional CONFIRM.

> **Drafting status (per 01.0a):** WP-260 + EC-291 reconciled to WP-259's landed `runtimeObservedByMechanic` contract; lint 21/21; copilot CONFIRM (unconditional); pre-flight **READY TO EXECUTE** (baseline `0a60968b`). The hard-dep WP-259 / D-24035 is on `main`; this WP is executable in a Phase 2 (`01.0b`) session.

## Definition of Done

### Pre-merge Done (execution session)
- [ ] WP-259 / D-24035 on `main` (✅ confirmed 2026-06-18 at draft); at execution open re-confirm `useCoverageLedger()` still exposes `runtimeObservedByMechanic: Record<string, RuntimeObservedEntry>` and pre-flight re-run → READY (the §Assumes + EC allowlist were reconciled to the landed by-mechanic contract at draft)
- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/dashboard test` 0; `pnpm --filter @legendary-arena/dashboard typecheck` 0
- [ ] `data/cards/**` byte-unchanged; no engine/registry/server/arena-client/`pg` import; no new fetch/endpoint
- [ ] `architectGapData` is the optional 4th param; parameter-absent output unchanged from baseline (backward-compat)
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-260 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-291 Done; `docs/ai/DECISIONS.md` **D-24036** Active; `docs/05-ROADMAP-MINDMAP.md` WP-260 node added; `node scripts/roadmap-counts.mjs --check` passes
- [ ] `docs/ai/STATUS.md` records the change with **D-24026 pending deploy verification** (PR/SHA candidate noted)

### Post-deploy Done (D-24026)
- [ ] On the deployed dashboard `/pipeline`: the Architect lane backlog leads with the runtime-confirmed hollow-gap candidates the deployed `/coverage` overlay contains (or shows the existing items, no gap rows, when the overlay carries none — no crash, no empty injection)
- [ ] `docs/ai/STATUS.md` updated with the **deployed SHA + evidence** (only now is D-24026 satisfied)
