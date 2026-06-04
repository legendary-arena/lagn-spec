# WP-211 — Cross-App Sweep Type Drift Test (Dashboard ↔ Server)

**Status:** Draft (candidate — not yet reviewed, not ready to execute)
**Primary Layer:** Dashboard (`apps/dashboard/` — test surface only)
**Dependencies:** WP-210 (introduced the dashboard `SweepRunSummary` mirror in `apps/dashboard/src/types/sweep.ts`); WP-209 (introduced the authoritative server `SweepRunSummary` in `apps/server/src/sweep/sweep.types.ts`)

---

## Session Context

WP-209 created the authoritative `SweepRunSummary` wire contract in `apps/server/src/sweep/sweep.types.ts` (the `GET /api/sweep/latest` response row). WP-210 created a structurally-identical dashboard mirror in `apps/dashboard/src/types/sweep.ts` with one documented deviation (D-20703: `anomalyCounts` value-type widened from the engine's closed `SweepAnomalyClass` union to opaque `string`, so the dashboard never imports the engine type). Because the dashboard **cannot import the server package** (layer-boundary rule — `apps/dashboard` must not import `apps/server`), the two `SweepRunSummary` interfaces are kept in lock-step **by convention only** today: a reviewer's eyes, not a test.

Both type headers already forward-reference this WP. `sweep.types.ts` (server): *"cross-app type drift is enforced by a future widget-side drift test in the same byte-identical pattern WP-203 established."* `sweep.ts` (dashboard): *"a future widget-side drift test (WP-211, backlog) compares against a committed fixture in the WP-203 byte-identical pattern."* This WP fulfills that forward-reference and was surfaced concretely by the WP-210 / EC-242 copilot check (Finding #4).

The mechanism mirrors the within-app drift guards already in the dashboard tree (`utils/opsTaxonomy.test.ts`, `utils/funnelTaxonomy.test.ts`, `utils/kpiStatus.test.ts`): a canonical expected-shape constant + a deep-equal assertion that fails loudly on drift. The cross-app twist is that the "expected shape" is a **committed, server-derived field-set constant** (data, captured at authoring time) rather than a live import — the test compares the dashboard type's runtime field set against that committed constant.

---

## Goal

After this session, `apps/dashboard/src/types/sweep.drift.test.ts` exists and is run by the dashboard `node:test` harness. It asserts that the dashboard `SweepRunSummary` interface (`apps/dashboard/src/types/sweep.ts`) carries **exactly** the five fields `runId`, `submittedAt`, `startedAt`, `cellCount`, `anomalyCounts` — no more, no fewer — against a committed `const` field-set list hand-derived from the server's `SweepRunSummary` in `apps/server/src/sweep/sweep.types.ts`. The test fails loudly if either side adds, removes, or renames a summary field (the failure message names the drifting field and points at both files). `pnpm --filter @legendary-arena/dashboard test` and `pnpm --filter @legendary-arena/dashboard typecheck` both exit 0. No production code, no server import, and no new DECISIONS entry — the test guards the existing D-20703 envelope-shape lock; it does not create a new contract.

---

## Assumes (Hard-Gate Preconditions — MUST PASS BEFORE EDIT)

Run each command. If ANY produces output other than the stated expectation, this packet is **BLOCKED** — STOP and report; do not edit.

```bash
# A. The dashboard SweepRunSummary mirror exists (WP-210) with the 5 locked fields
test -f apps/dashboard/src/types/sweep.ts && echo "A_OK"
# Expected: A_OK

# B. The dashboard SweepRunSummary declares exactly the 5 expected fields. Scope
#    to the SweepRunSummary interface block (-A6) — the file also declares
#    SweepHealthSnapshot, so an unscoped grep would be ambiguous as the file grows.
grep -A6 'interface SweepRunSummary' apps/dashboard/src/types/sweep.ts | grep -cE 'readonly (runId|submittedAt|startedAt|cellCount|anomalyCounts):'
# Expected: 5

# C. The authoritative server SweepRunSummary exists (WP-209) — derivation source.
#    MUST scope to the SweepRunSummary interface block (-A6): the server file also
#    declares SweepRunPayload, which shares 4 of these field names, so an unscoped
#    grep returns 10 and would false-trip. Scope to the summary interface only.
grep -A6 'interface SweepRunSummary' apps/server/src/sweep/sweep.types.ts | grep -cE 'readonly (runId|submittedAt|startedAt|cellCount|anomalyCounts):'
# Expected: 5

# D. No drift test exists yet (this WP introduces it)
test -f apps/dashboard/src/types/sweep.drift.test.ts && echo "EXISTS" || echo "ABSENT"
# Expected: ABSENT

# E. Baseline is green BEFORE the edit
pnpm --filter @legendary-arena/dashboard typecheck   # Expected: exit 0
pnpm --filter @legendary-arena/dashboard test        # Expected: exit 0 (suite green)

# F. Governance docs exist
test -f docs/ai/DECISIONS.md && test -f docs/ai/ARCHITECTURE.md && echo "F_OK"
# Expected: F_OK
```

If precondition B or C returns a count other than 5, the `SweepRunSummary` shape has already drifted (or changed under a different WP) — STOP and reconcile before writing a test that pins a stale shape.

---

## Context (Read First)

Before writing a single line:

- `apps/dashboard/src/types/sweep.ts` — read entirely. The `SweepRunSummary` interface here is the unit under test. Its header already forward-references WP-211 and documents the D-20703 `anomalyCounts` deviation.
- `apps/server/src/sweep/sweep.types.ts` — read the `SweepRunSummary` interface. This is the **derivation source** for the committed field-set constant. Its header forward-references the drift test. (The test does NOT import this file — it captures the field names as data.)
- `apps/dashboard/src/utils/opsTaxonomy.test.ts` — the closest existing drift-guard precedent (WP-204 / EC-232). Mirror its structure: a locked expected constant, `assert.deepEqual` on contents, an explicit length assertion, a per-member membership loop with a full-sentence failure message. The WP-203 `funnelTaxonomy.test.ts` and WP-198 `kpiStatus.test.ts` are the same pattern.
- `docs/ai/DECISIONS.md §D-20703` — the envelope-shape lock + opaque-anomaly-key client posture this test guards. Scan it so the test's provenance comment cites it correctly. (No new decision is created — this WP enforces D-20703.)
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` + `.claude/rules/architecture.md §Import Rules` — confirm `apps/dashboard` must NOT import `apps/server` (or `@legendary-arena/game-engine`). This is *why* the test compares against a committed constant rather than a live import; the WP must not introduce such an import.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error messages — the drift failure message must name the drifting field and both files).

---

## Scope (In)

- Create `apps/dashboard/src/types/sweep.drift.test.ts` — a `node:test` file using `node:assert/strict`, auto-discovered by the dashboard `test` script (`node --import tsx --test src/**/*.test.ts`).
- Inside it, declare a committed server-derived field-set constant — a `readonly string[]` of the five field names (`runId`, `submittedAt`, `startedAt`, `cellCount`, `anomalyCounts`) — with a `// why:` provenance comment naming `apps/server/src/sweep/sweep.types.ts` `SweepRunSummary` as the derivation source, the baseline commit hash, and the ONE intentional deviation (D-20703: `anomalyCounts` value-type widened to `string` — a value-type difference, NOT a field-set difference, so out of scope for this field-set guard).
- Capture the dashboard `SweepRunSummary` runtime field set via a fully-typed literal — `const sample: SweepRunSummary = { runId: ..., submittedAt: ..., startedAt: ..., cellCount: ..., anomalyCounts: {} }` — so that a missing field OR an excess field fails `vue-tsc` typecheck under the dashboard's `strict` + `exactOptionalPropertyTypes` config (the compile-time half of the guard). Then derive the runtime key set from `Object.keys(sample)`.
- Assert, at minimum: (1) `Object.keys(sample).sort()` deep-equals the sorted committed field-set constant; (2) the field count is exactly 5; (3) each committed field is present in the dashboard key set (per-field membership loop, full-sentence failure message); (4) `manifestBlob` is NOT among the dashboard summary keys (the server's `SweepRunPayload` carries it but `SweepRunSummary` deliberately excludes it — assert the exclusion survives on the dashboard side).
- Verify `pnpm --filter @legendary-arena/dashboard test` exits 0 (suite green, new tests included) and `pnpm --filter @legendary-arena/dashboard typecheck` exits 0.

## Out of Scope

- Importing the server `SweepRunSummary` (or any `apps/server/**` / `@legendary-arena/game-engine` symbol) into the dashboard — forbidden by the layer boundary; the committed constant is the bridge.
- Guarding the `anomalyCounts` **value-type** deviation (server `SweepAnomalyClass` keys vs dashboard opaque `string` keys). That widening is intentional and already locked by D-20703; this WP guards the **field set / structural** shape only.
- Adding a separate JSON or `.fixture.ts` artifact file — the committed field-set constant lives inline in the test, matching the `opsTaxonomy.test.ts` / `funnelTaxonomy.test.ts` precedent (the inline `const` in a committed file *is* the committed fixture).
- Modifying `apps/dashboard/src/types/sweep.ts`, `useSweepHealth.{ts,test.ts}`, `SweepHealthWidget.vue`, or any server / engine file.
- Adding a server-side counterpart test, or a build-time codegen step that re-derives the constant — re-derivation is a manual, reviewed step on each side, same as the existing within-app drift guards.
- Any new DECISIONS entry — this WP enforces the existing D-20703 lock; it locks no new design choice.

---

## Change Constraint (Confinement)

The only production-tree change is the **one new test file**. No existing file under `apps/dashboard/src/` is modified (the test is purely additive and self-contained); no file under `apps/server/` or `packages/` is touched.

Verify:

```bash
git diff --name-only | sort
# Expected: only the new test file + the 3 governance files (see Files Expected to Change).
```

---

## Files Expected to Change

- `apps/dashboard/src/types/sweep.drift.test.ts` — **new** (the cross-app field-set drift test + committed server-derived field-set constant)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status Backlog/Reviewed → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status → Done)

4 files total (1 test + 3 governance). No new DECISIONS.md entry — the test enforces the existing D-20703 envelope-shape lock; it does not create a new decision.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — N/A (deterministic test; any sample values are fixed literals)
- Never throw inside boardgame.io move functions — N/A (dashboard test; no engine code)
- Never persist `G`, `ctx`, or any runtime state — N/A
- `G` must be JSON-serializable at all times — N/A
- ESM only, Node v22+ — the test file is ESM (`import { test } from 'node:test'`)
- `node:` prefix on all Node.js built-in imports — REQUIRED (`node:test`, `node:assert/strict`)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — descriptive test names, full-sentence failure messages, `// why:` on the provenance constant
- Full file contents required for the new test file in the session output — no diffs, no snippets

**Packet-specific:**
- The test MUST NOT import from `apps/server/**`, `@legendary-arena/game-engine`, `@legendary-arena/registry`, or any non-dashboard package. The committed field-set constant is the only bridge to the server shape (verified by a grep step).
- The committed field-set constant carries a `// why:` provenance comment: the derivation source path (`apps/server/src/sweep/sweep.types.ts` `SweepRunSummary`), the baseline commit hash, and the D-20703 value-type deviation note (anomalyCounts keys widened to `string` — excluded from this field-set guard).
- The dashboard-side runtime key set is captured via a fully-typed `const sample: SweepRunSummary = { ... }` literal (compile-time missing/excess-field guard) — not by hardcoding a second key list.
- The drift failure messages are full sentences naming the drifting field and pointing at BOTH `apps/dashboard/src/types/sweep.ts` and `apps/server/src/sweep/sweep.types.ts` (so the next maintainer knows to reconcile both).
- Read-only on `apps/dashboard/src/types/sweep.ts` (the unit under test is consumed via a typed literal, not edited).

**Session protocol:**
- If the dashboard `SweepRunSummary` already declares more or fewer than 5 fields (precondition B ≠ 5): STOP and report — the shape drifted before this test was written; reconcile first.
- If the server `SweepRunSummary` field set differs from the five locked names (precondition C ≠ 5, or the names differ): STOP and ask — the committed constant would pin a shape that no longer matches the source of truth.
- If writing the typed `sample` literal surfaces a typecheck error (missing/excess field): that is the drift the test is meant to catch at the type layer — STOP and report; do not loosen the type to make it compile.

**Locked contract values:**
- Committed server-derived field set (exact names, the test sorts before comparing so source order is not load-bearing): `runId`, `submittedAt`, `startedAt`, `cellCount`, `anomalyCounts`
- Field count: 5
- Excluded field (asserted ABSENT on the dashboard summary): `manifestBlob`
- New file path: exactly `apps/dashboard/src/types/sweep.drift.test.ts`
- Test runner: `node:test` + `node:assert/strict` (never `boardgame.io/testing`, never a third-party runner)
- D-entry guarded (cited, not created): D-20703

---

## Acceptance Criteria

1. `apps/dashboard/src/types/sweep.drift.test.ts` exists, imports only `node:test` + `node:assert/strict` + the dashboard `SweepRunSummary` type (no `apps/server` / engine import) — verified by Verification Steps 1 + 2.
2. The committed field-set constant lists exactly the five field names and carries a `// why:` provenance comment citing `apps/server/src/sweep/sweep.types.ts` + the baseline commit + the D-20703 deviation — verified by Verification Step 3.
3. The dashboard runtime key set is captured via a fully-typed `const sample: SweepRunSummary` literal (not a second hand-written key list) — verified by reading the file (Verification Step 4 greps the typed literal).
4. A test asserts `Object.keys(sample).sort()` deep-equals the sorted committed field-set constant.
5. A test asserts the dashboard summary field count is exactly 5.
6. A test asserts `manifestBlob` is NOT among the dashboard summary keys.
7. The drift failure messages are full sentences naming the field and both files (Rule 11).
8. `pnpm --filter @legendary-arena/dashboard test` exits 0 with the new tests included and the prior dashboard suite count preserved (no regressions) — Verification Step 5.
9. `pnpm --filter @legendary-arena/dashboard typecheck` exits 0 — Verification Step 6.
10. No file outside `## Files Expected to Change` is modified, and no production dashboard source file is touched — Verification Step 7.

---

## Verification Steps

Run each command in order. Each must produce the expected output before proceeding.

```bash
# 1. The test file exists
test -f apps/dashboard/src/types/sweep.drift.test.ts && echo "FILE_OK"
# Expected: FILE_OK

# 2. No forbidden cross-layer import (the bridge is the committed constant, not an import)
grep -E "from '(\.\./)*(\.\.)?/?(server|.*apps/server)|@legendary-arena/(game-engine|registry|server)" apps/dashboard/src/types/sweep.drift.test.ts
# Expected: NO MATCH (empty output, grep exit 1)

# 3. The committed field-set constant + provenance comment are present
grep -F 'sweep.types.ts' apps/dashboard/src/types/sweep.drift.test.ts   # Expected: ≥1 (provenance source cited)
grep -F 'D-20703' apps/dashboard/src/types/sweep.drift.test.ts          # Expected: ≥1 (deviation cited)

# 4. The dashboard type is captured via a typed literal (compile-time guard)
grep -E ': SweepRunSummary =' apps/dashboard/src/types/sweep.drift.test.ts
# Expected: ≥1 match (the typed sample literal)

# 5. The suite passes with the new tests
pnpm --filter @legendary-arena/dashboard test
# Expected: exit 0; the new sweep.drift tests pass; prior tests still pass

# 6. Typecheck passes
pnpm --filter @legendary-arena/dashboard typecheck
# Expected: exit 0

# 7. Only the new test file + governance changed; no production source touched
git diff --name-only | sort
# Expected (exactly these 4 paths):
# apps/dashboard/src/types/sweep.drift.test.ts
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Definition of Done (Binary Gate — ALL must pass)

- [ ] All 6 Preconditions passed before the edit
- [ ] All 10 Acceptance Criteria pass
- [ ] All 7 Verification Steps produce the expected output
- [ ] The test imports only `node:test` + `node:assert/strict` + the dashboard `SweepRunSummary` type (no `apps/server` / engine import)
- [ ] Committed field-set constant cites the server source + baseline commit + D-20703 deviation
- [ ] Dashboard type captured via a typed `const sample: SweepRunSummary` literal
- [ ] `manifestBlob`-absence asserted
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; `typecheck` exits 0
- [ ] Exactly 4 files modified, matching `## Files Expected to Change`; no production dashboard source touched
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-211 + the cross-app drift guard)
- [ ] `docs/ai/DECISIONS.md` NOT updated — the test enforces the existing D-20703 lock; no NEW decision is created
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped to Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped to Done
- [ ] Commit message uses `EC-245:` prefix per the commit hygiene gate

---

## Lint Gate Self-Review (00.3 — 21 sections)

Run 2026-06-04 against this WP + EC-245. Result: **PASS** (all sections PASS or justified N/A).

- **§1 Structure** — PASS (all required sections present + non-empty; Out of Scope lists 6 explicit exclusions).
- **§2 Non-Negotiable Constraints** — PASS (Engine-wide + Packet-specific + Session protocol + Locked contract values; full-file-contents required, diffs/snippets forbidden; references 00.6-code-style.md).
- **§3 Assumes** — PASS (hard-gate preconditions A–F name every file/state dependency with exact expected output).
- **§4 Context** — PASS (dashboard sweep.ts, server sweep.types.ts, opsTaxonomy.test.ts precedent, D-20703, ARCHITECTURE §Layer Boundary + rules import rules, 00.6 — all specific). 00.2 N/A — the guarded field names (`runId`/`submittedAt`/`startedAt`/`cellCount`/`anomalyCounts`) are WP-209-locked sweep-summary fields, not 00.2 card-data/setup-payload fields; they are pinned to the WP-209 source, which is the canonical authority for this surface.
- **§5 Files Expected to Change** — PASS (4 files, each marked new/modified + described; bounded < 8).
- **§6 Naming** — PASS (full-word field names match the WP-209/WP-210 `SweepRunSummary` exactly; no abbreviation; the new file follows the `*.drift.test.ts` discoverable convention).
- **§7 Dependencies** — PASS (no new npm deps; `tsx` + `node:test` already in the dashboard harness).
- **§8 Architectural Boundaries** — PASS (dashboard test layer; the WP explicitly forbids importing `apps/server` / engine and adds a grep Verification Step enforcing it — the layer boundary is the WP's core subject).
- **§9 Windows Compatibility** — PASS (verification uses `pnpm --filter` (pwsh-compatible) + `grep`/`test` runnable via the Bash tool, the established repo convention for dashboard WPs).
- **§10 Env Vars** — N/A (none).
- **§11 Auth** — N/A (no authentication surface).
- **§12 Test Quality** — PASS (this WP *is* a test; uses `node:test` + `node:assert/strict`, no `boardgame.io/testing`, no network/DB; the guard is invariant-focused — a structural drift assertion that fails loudly, not a behavior smoke test; `makeMockCtx` N/A — no `ctx` involved).
- **§13 Verification Commands** — PASS (all `pnpm --filter`; exact commands with expected output; grep caveat per §9).
- **§14 Acceptance Criteria** — PASS (10 binary, observable, file-specific items aligned to the deliverable).
- **§15 Definition of Done** — PASS (STATUS.md, WORK_INDEX.md, EC_INDEX.md updates + scope-boundary check; DECISIONS explicitly NOT updated, justified).
- **§16 Code Style** — PASS (no abstraction/ternary/dynamic-key; provenance `// why:` explains the committed constant; descriptive test names; full-sentence failure messages per Rule 11; the typed-literal guard avoids a duplicated hand-written key list).
- **§17 Vision Alignment** — N/A declared with §17.3 build-infra justification (see below).
- **§18 Prose-vs-Grep** — N/A (Verification Step 2's grep targets forbidden cross-layer imports; the WP prose discusses those import paths as the thing being forbidden, but the grep is scoped with `from '...'` import-context, so prose mentions of the package names do not create false positives; no verbatim forbidden-token enumeration in the test file itself).
- **§19 Bridge-vs-HEAD** — commit-time discipline; the committed constant's baseline-commit citation is authored at execution against live HEAD.
- **§20 Funding Surface Gate** — N/A declared with justification (see below).
- **§21 API Catalog** — N/A declared with justification — no HTTP endpoint added/modified; the test reads the *shape* of an existing endpoint's response type but registers, modifies, or removes no route and touches no `apps/server/src/**` library function (`docs/ai/REFERENCE/api-endpoints.md` unaffected).

No ❌ FAIL condition triggers. Gate satisfied.

## Vision Alignment

**N/A — purely structural / test-harness.** Per lint §17.3, this WP touches none of the §17.1 trigger surfaces. It adds a single cross-app structural drift test to the operator dashboard's test suite. No public surface, no card-data semantics, no identity / fairness / replay / scoring / monetization / determinism-of-gameplay / accessibility surface. The dashboard is an internal operator tool; the test changes no runtime behavior.

## Funding Surface Gate

**N/A — no funding surface touched.** This WP touches no §20.1 trigger surface: no global navigation funding affordance, no registry-viewer funding affordance, no profile/account funding attribution, no tournament-funding-channel integration, and no user-visible funding copy. It is an internal dashboard test with no UI surface and no user-facing copy. (Authority chain per §20 form: WP-097, D-9701, D-9801.)

## API Catalog Update

**N/A — no API surface touched.** Per lint §21.4: this WP adds, modifies, or removes no HTTP endpoint and no `apps/server/src/**` library function. It asserts the *client-side mirror* of an existing endpoint's response shape against a committed constant; `docs/ai/REFERENCE/api-endpoints.md` is unaffected.
