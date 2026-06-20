# WP-268 — By-Hook Composition Ledger (Honest Per-Card Resolution via Parser `resolvedMarkers`)

**Status:** Draft — pending review.
**Primary Layer:** Game Engine (`packages/game-engine/src/rules/**`, `setup/**`) + Lever-3 tooling (`scripts/hero-mechanic-ledger.mjs`, `docs/ai/coverage/**`).
**Dependencies:** WP-257 ✅ (the `unresolvedMarkers` hook field this mirrors), WP-256 ✅ / D-24031 (the static composition markers), WP-267 ✅ / D-24044 (the first parameterized composition — the mechanic that exposed the by-name over-claim), WP-250 ✅ (the coverage probe whose `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })` per-hero drive the ledger mirrors).
**Baseline:** `origin/main` @ `f40480b3`.
**User-Visible Surface:** dashboard.legendary-arena.com/coverage — the By-card view stops marking deferred-variant composition cards as Executable; the By-mechanic + KPI counts drop to the honest per-card number.

---

## Goal

After this session, the hero mechanic ledger classifies a **composition-marker** mechanic (e.g. `empowered`, `berserk`) on a given card as `executable` **only when that card's hook actually resolved the marker** (by-hook), not merely because the mechanic name is a known composition marker (by-name). The engine parser records which composition markers resolved per ability line in a new `resolvedMarkers` hook field (symmetric with the existing `unresolvedMarkers`); the ledger builds hooks per hero and reads it. This removes the `/coverage` By-card over-claim that WP-267 exposed (deferred-variant `empowered` cards shown Executable when their forms defer).

## Assumes

- **WP-257 ✅** — `HeroAbilityHook.unresolvedMarkers?: string[]` exists (`packages/game-engine/src/rules/heroAbility.types.ts`), assigned in `buildHeroAbilityHooks` only when non-empty; `parseAbilityText` returns `unresolvedMarkers`. This WP adds the symmetric `resolvedMarkers`.
- **WP-256 ✅ / WP-267 ✅** — composition markers resolve in two parser branches in `setup/heroAbility.setup.ts`: the static branch (`HERO_COMPOSITION_MARKERS[name]` → `primitiveEffects.push(structuredClone(...))`) and the parameterized branch (`empowered` → `buildEmpoweredComposition` on an anchored tail). Both are where `resolvedMarkers.push(name)` belongs.
- **WP-250 ✅** — `scripts/hero-effect-coverage.mjs` already drives `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })` per hero + `deduplicateHooks`; this WP mirrors that hook-building in the ledger (which today only regex-extracts `[keyword:X]` tokens and classifies by-name).
- **Ledger structure** — `scripts/hero-mechanic-ledger.mjs` `buildLedger` iterates heroes (`registry.listCards()` filtered to `cardType === 'hero'`) → `extractMechanics(abilities)` → `statusForMechanic(mechanic)` per (card × mechanic). `statusForMechanic` is mechanic-keyed today; this WP makes it per-card for composition markers.
- **Baseline:** `origin/main` @ `f40480b3`; `pnpm -r build`, `pnpm --filter @legendary-arena/game-engine test`, `pnpm ledger:heroes:check`, `pnpm sim:coverage --check` all green.

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §"Layer Boundary (Authoritative)" — Game Engine + Shared Tooling rules (the ledger imports the engine `dist`, never the reverse).
- `.claude/rules/code-style.md` + `docs/ai/REFERENCE/00.6-code-style.md` — `// why:` discipline, no `.reduce()` in logic with branching, descriptive names.
- `docs/ai/DECISIONS.md` — D-24031 (composition markers), D-24044 (the WP-267 by-name limitation this resolves); D-24045 reserved by this WP.
- `packages/game-engine/src/setup/heroAbility.setup.ts` (the parse function + the two composition-resolve branches + `buildHeroAbilityHooks` assembly) and `scripts/hero-effect-coverage.mjs` (the per-hero hook-building drive to mirror).

---

## Session Context

WP-267 shipped `empowered` and exposed a reporting gap, recorded as a known limitation in its DECISIONS/STATUS entries: the **mechanic ledger** marks a composition-marker mechanic `executable` purely by name (`statusForMechanic` → `COMPOSITION_MARKERS.has(mechanic)` → `executable`), so all 7 `empowered` cards show Executable on `/coverage` By-card — but only the antm core-form hooks actually resolve; the bkpt/wtif deferred-variant cards (color-of-choice / conditional-prefix) defer and do nothing. The by-hook **coverage baseline** (`hero-effect-coverage.mjs`, which classifies per hook via `primitiveEffects.length`) and the **runtime** hollow detector are already honest; only the ledger over-claims, because it never builds hooks.

`empowered` is the **first** composition mechanic with deferred variants, so it is the first to make by-name ≠ by-hook. Berserk has no variants (every berserk resolves), so by-name was harmless until now. This WP makes the ledger honest by teaching it per-card resolution.

### The design — `resolvedMarkers` (engine) + by-hook ledger (tooling)

The parser already records which composition markers FAILED to resolve (`unresolvedMarkers`, WP-257). This WP adds the symmetric positive record — `resolvedMarkers` — populated in the two resolve branches. The ledger then builds each hero's hooks (the coverage-probe pattern) and classifies a composition marker `executable` only when it appears in that card's aggregated `resolvedMarkers`.

---

## Non-Negotiable Constraints

**Engine-wide:** `ctx.random.*` only (this WP needs none); no I/O in the parser; `G` JSON-serializable (`resolvedMarkers` is a plain `string[]`, never persisted to a DB — it lives on the runtime hook like `unresolvedMarkers`); ESM, Node v22+, `.test.ts`; **full file contents for every modified file — no diffs/snippets**; human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (no `.reduce()` with branching, explicit `for...of`, descriptive names, `// why:` on non-obvious decisions); the ledger imports only the engine `dist` (no reverse import).

**Packet-specific:**
- **`resolvedMarkers` is symmetric with `unresolvedMarkers`** — same shape (`string[]`), same assignment discipline (assigned on the hook only when non-empty, `exactOptionalPropertyTypes`), pushed in the SAME two branches that today push `primitiveEffects` (static composition + parameterized empowered). It is NOT pushed for legacy keywords or deferred/unresolved markers.
- **The interpreter, executor, and `primitiveEffects` semantics are UNCHANGED** — `resolvedMarkers` is a parse-time provenance record for tooling; it does not affect execution. No `heroEffects.execute.ts` / `effectPrimitive.interpret.ts` change.
- **The ledger builds hooks the coverage-probe way** — `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })` per hero, aggregating `resolvedMarkers` across the hero's hooks into a per-card set. No new config surface; mirror `hero-effect-coverage.mjs`.
- **`statusForMechanic` becomes per-card for composition markers only** — `MVP_KEYWORDS` → executable, `KNOWN_KEYWORDS` → deferred, and `unmarked` are UNCHANGED. Only the composition-marker branch becomes `cardResolvedMarkers.has(mechanic) ? 'executable' : 'unsupported'`.
- **Deterministic + byte-stable** — the regenerated ledger must be byte-identical across runs (the `:check` gate). Hook iteration is registry-order; the per-card resolvedMarkers set is membership-tested, not order-dependent.
- **`data/cards/**` byte-unchanged** — no re-marking; the parser already produces the resolution, this WP only records + reads it.

---

## Scope (In)

### A) Parser provenance — `setup/heroAbility.setup.ts` (modified)
- `parseAbilityText`: add `const resolvedMarkers: string[] = [];` (alongside `unresolvedMarkers`); add `resolvedMarkers` to the return shape + the return object.
- In the **parameterized-marker branch** (empowered): on a successful resolve (composition pushed), `resolvedMarkers.push(normalizedKeyword)`.
- In the **static composition-marker branch** (berserk): on `composition !== undefined` (pushed), `resolvedMarkers.push(normalizedKeyword)`.
- `buildHeroAbilityHooks` assembly: `if (parsedAbility.resolvedMarkers.length > 0) { hook.resolvedMarkers = parsedAbility.resolvedMarkers; }` (mirror the `unresolvedMarkers` conditional-assign at the same site).

### B) Hook type — `rules/heroAbility.types.ts` (modified)
- Add `resolvedMarkers?: string[]` to `HeroAbilityHook` (adjacent to `unresolvedMarkers`, with a `// why:` noting it is the positive symmetric record consumed by the mechanic ledger for by-hook classification — D-24045).

### C) By-hook ledger — `scripts/hero-mechanic-ledger.mjs` (modified)
- Import `buildHeroAbilityHooks` from the engine `dist` (mirror the coverage probe) + reuse the existing `deduplicateHooks` shape if needed.
- In `buildLedger`, per hero `extId`: build `hooks = buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })`; aggregate a `cardResolvedMarkers` `Set` from each hook's `resolvedMarkers ?? []`.
- `statusForMechanic(mechanic, cardResolvedMarkers)`: composition-marker branch → `cardResolvedMarkers.has(mechanic) ? 'executable' : 'unsupported'`. `MVP_KEYWORDS`/`KNOWN_KEYWORDS`/`unmarked` paths unchanged.
- `handlerForMechanic` already returns the interpreter module for an executable composition marker — a now-`unsupported` composition row correctly returns `''` (handled by the `status !== 'executable'` guard).

### D) Tests — `rules/heroAbility.setup.test.ts` (modified)
- A resolved core form (`[keyword:Empowered] by [hc:strength]`, `[keyword:Berserk]`) → `hook.resolvedMarkers` contains the marker; `hook.unresolvedMarkers` absent.
- A deferred empowered variant (conditional-prefix / no anchored tail) → `hook.resolvedMarkers` absent (or excludes empowered); `hook.unresolvedMarkers` contains `empowered`.
- A non-composition line (a plain `[keyword:rescue]`) → `resolvedMarkers` absent (only composition markers are recorded).

### E) Regenerated artifact
- `docs/ai/coverage/hero-mechanic-ledger.{json,csv}` — regenerated; deferred-variant composition cards flip `executable → unsupported`; core-form + berserk stay executable. (Exact flip count is the execution-measured output — estimated ~4 empowered cards: bkpt/princess-shuri, bkpt/queen-storm, wtif/star-lord-tchalla, wtif/uatu; confirmed at execution by inspecting the regenerated ledger.)

---

## Out of Scope
- **No change to the coverage probe** (`hero-effect-coverage.mjs`) — it is already by-hook (classifies on `primitiveEffects.length`). No `hero-effect-coverage.baseline.json` change expected.
- **No interpreter/executor/effect change** — `resolvedMarkers` is parse-time provenance only; `primitiveEffects` execution is unchanged; `finalStateHash` unchanged.
- **No dashboard source change** — the `/coverage` page already renders whatever the ledger carries; the gitignored `apps/dashboard/src/data/*.json` build copies regenerate on disk (untracked).
- **No `HeroKeyword` / `MVP_KEYWORDS` / drift-array change.** `resolvedMarkers` is a hook field, not a closed union.
- **No `data/cards/**` change**; no barrel (`index.ts`) change (the ledger imports `buildHeroAbilityHooks` from `dist`, already a public setup export the coverage probe uses).
- **No villain/mastermind ledger** — heroes only (the hero mechanic ledger's existing scope).

---

## Files Expected to Change
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `resolvedMarkers?: string[]` on `HeroAbilityHook`.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — emit `resolvedMarkers` in the two resolve branches + return + assembly.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — `resolvedMarkers` resolved/deferred/non-composition coverage.
- `scripts/hero-mechanic-ledger.mjs` — **modified** — build hooks per hero; `statusForMechanic` by-hook for composition markers.
- `docs/ai/coverage/hero-mechanic-ledger.json` + `.csv` — **regenerated**.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (**D-24045**), `docs/ai/work-packets/WORK_INDEX.md` (WP-268 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-299 Done), `docs/05-ROADMAP-MINDMAP.md` (WP-268 node).

No other files may be modified. **No coverage-probe / interpreter / executor / `data/cards` / barrel / dashboard-source change.**

---

## User-Visible Impact

**Surface: dashboard.legendary-arena.com/coverage.** Today the By-card view shows the bkpt/wtif deferred-variant `empowered` cards as **Executable** even though their forms do nothing — a false "done" signal that mis-prioritizes the grind. After this WP, those cards read **Unsupported** (honest), the By-mechanic `empowered` row reflects only the cards that actually resolve, and the executable KPI drops to the true per-card count (~126 → ~122). The runtime "Observed in play" overlay is unchanged (already honest). This closes the WP-267 by-name over-claim end-to-end across all three coverage surfaces.

---

## Acceptance Criteria

- [ ] `HeroAbilityHook.resolvedMarkers?: string[]` exists; `parseAbilityText` returns it; `buildHeroAbilityHooks` assigns it only when non-empty (mirrors `unresolvedMarkers`).
- [ ] A resolved core composition (`[keyword:Berserk]`, `[keyword:Empowered] by [hc:strength]`) → `hook.resolvedMarkers` contains the marker.
- [ ] A deferred empowered variant → `hook.resolvedMarkers` excludes `empowered` AND `hook.unresolvedMarkers` includes it (the Honest-Partial signal is consistent).
- [ ] The ledger builds hooks per hero and classifies a composition marker `executable` iff it is in that card's `resolvedMarkers`; otherwise `unsupported`. `MVP_KEYWORDS`/`KNOWN_KEYWORDS`/`unmarked` classification unchanged.
- [ ] Regenerated `hero-mechanic-ledger.{json,csv}`: deferred-variant `empowered` cards (bkpt/wtif) flip `executable → unsupported`; antm core-form `empowered` + all `berserk` rows stay `executable` (exact set verified by inspecting the diff).
- [ ] `pnpm ledger:heroes:check` OK (regen is byte-stable across two runs).
- [ ] `pnpm --filter @legendary-arena/game-engine test` 0 fail; `pnpm sim:coverage --check` OK (coverage baseline unchanged — the probe was already by-hook); sentinel `finalStateHash` unchanged.
- [ ] `git diff --name-only` = the 5 Files Expected to Change + governance; no coverage-probe/interpreter/executor/`data/cards`/barrel/dashboard-source.

---

## Verification Steps

```pwsh
pnpm -r build                                          # 0 (the ledger imports dist)
pnpm --filter @legendary-arena/game-engine test        # 0 fail (resolvedMarkers parser tests)
pnpm ledger:heroes                                      # regenerate the by-hook ledger
pnpm ledger:heroes                                      # run again — byte-identical
pnpm ledger:heroes:check                                # OK
pnpm sim:coverage --check                               # OK — coverage baseline UNCHANGED (probe already by-hook)
git diff --name-only -- data/cards/ scripts/hero-effect-coverage.mjs packages/game-engine/src/hero/   # empty
Select-String -Path "docs\ai\coverage\hero-mechanic-ledger.csv" -Pattern "bkpt/princess-shuri,.*,empowered,unsupported"   # deferred card now unsupported
Select-String -Path "docs\ai\coverage\hero-mechanic-ledger.csv" -Pattern "berserk,executable"   # berserk still executable
```

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A); Final Gate clear.

- **§1 Structure:** PASS — Goal, Assumes, Context (Read First), Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done all present + non-empty; Out of Scope excludes ≥2 related things (coverage-probe; interpreter/executor; villain ledger).
- **§2 Constraints:** PASS — full file contents, forbids diffs, ESM/Node v22+, references `00.6-code-style.md`.
- **§3 Assumes:** PASS — each dependency + the exact files/exports (`unresolvedMarkers` assign site, the two resolve branches, the coverage-probe `buildHeroAbilityHooks({heroDeckIds:[extId]})` pattern, the ledger `statusForMechanic`).
- **§4 Context:** PASS — ARCHITECTURE layer, code-style, DECISIONS D-24031/D-24044, the parser + coverage-probe source. No `00.2` field added.
- **§5 Files:** PASS — 5 files marked + described; bounded; no partial-output language.
- **§6 Naming:** PASS — `resolvedMarkers` mirrors `unresolvedMarkers`; `cardResolvedMarkers` descriptive; no abbreviations.
- **§7 Dependencies:** PASS — no new npm deps.
- **§8 Architecture:** PASS — Game Engine + Shared Tooling; the ledger imports engine `dist` (no reverse import); `resolvedMarkers` is a plain `string[]`, `G` JSON-serializable; no DB/network; parse-time only.
- **§9 Windows / §10 Env / §11 Auth:** N/A.
- **§12 Tests:** PASS — `node:test`; parser `resolvedMarkers` resolved/deferred/non-composition cases; the ledger is `:check`-gated (regen-and-diff).
- **§13 Verification:** PASS — exact `pnpm` commands + expected output.
- **§14 Acceptance:** PASS — binary, observable, scope-aligned.
- **§15 Definition of Done:** PASS — STATUS/DECISIONS/WORK_INDEX/EC_INDEX/mindmap + scope-boundary check. **§15.1:** PASS — `**User-Visible Surface:**` declared (≠ none); `## User-Visible Impact` present; DoD carries the D-24026 live-on-surface verification item (By-card flip), not satisfiable by tests+merge alone.
- **§16 Code Style:** PASS — no premature abstraction; explicit `for...of` (no `.reduce()` branching); small functions; `// why:` on `resolvedMarkers`, the push sites, the ledger hook-build, the by-hook classification; named imports.
- **§17 Vision:** TRIGGERED (touches the parser / effect-recognition surface — §3, §8). **No conflict:** `resolvedMarkers` is parse-time provenance, never written to `G`/persisted, with NO execution/replay change — the interpreter, `primitiveEffects`, and sentinel `finalStateHash` are untouched (Vision §22 determinism preserved). No scoring/identity/leaderboard/NG-1..7 surface. Advances honest coverage reporting (the hollow-detection initiative's accuracy).
- **§18 Prose-vs-Grep:** PASS — the `Select-String` checks target the generated ledger CSV, not this WP's prose.
- **§19 Bridge-vs-HEAD:** N/A — not a repo-state-summarizing artifact.
- **§20 Funding Surface:** N/A — engine provenance + coverage tooling; no funding affordances/copy/channels.
- **§21 API Catalog:** N/A — no `apps/server` HTTP endpoint or catalog `Library-only` function added/modified.

Verdict: **PASS** — all 21 sections resolved; Final Gate clear.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-20, baseline `f40480b3`).** Dependencies on `main` (WP-257 `unresolvedMarkers`; WP-256/WP-267 composition-resolve branches; WP-250 coverage-probe hook-building — all Done). Contract fidelity verified against source: `HeroAbilityHook.unresolvedMarkers?` + its non-empty conditional-assign in `buildHeroAbilityHooks` (the symmetry `resolvedMarkers` mirrors), the two composition-resolve branches in `setup/heroAbility.setup.ts` (static `HERO_COMPOSITION_MARKERS[name]` push + parameterized `empowered` push), the coverage probe's `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })` + `deduplicateHooks` drive (the ledger mirrors), and the ledger `statusForMechanic`/`handlerForMechanic` (composition-marker branch becomes per-card). Scope is a closed 5-file allowlist (engine provenance + ledger + regen; coverage-probe/interpreter/executor/`data/cards`/barrel/dashboard-source out). **Empirical Scaffold (01.4 §Validation-Tightening): N/A** — this is *additive provenance* (a new positive record) + a *classification refinement* (composition markers by-hook), not validation-tightening; no previously-accepted input is newly-rejected. Per the WP-267 precedent (reasoned draft after the subagent scaffold was sandboxed), the allowlist is reasoned from the proven coverage-probe hook-building pattern, and the **observed regen + byte-stability + the exact executable→unsupported flip are measured at execution** (the ledger is regenerated + `:check`-gated in-WP). Residual risk is low + bounded: the ledger-hook-building mirrors an existing, byte-stable-gated generator; the one execution-time confirm is the exact flip set + byte-stability.
- **Copilot (`01.7`): PASS (2026-06-20) — 30 modes walked; 0 BLOCK; disposition CONFIRM.** Boundary (#1/#29 — provenance stays parse-time; no execution-path leak; ledger imports engine `dist` one-way). Determinism (#2/#23 — no RNG; byte-stable regen; membership-Set classification is order-independent; emitted via the existing sorted rows). Contract drift (#4 — `resolvedMarkers` symmetric with `unresolvedMarkers`; no closed-union/drift-array change). Persistence (#7/#19 — `string[]`, never persisted; `G` JSON-serializable). Silent-vs-loud (#22 — `resolvedMarkers ?? []` tolerant read in the ledger). Scope creep (#12/#30 — 5-file allowlist + `git diff` checks; coverage-probe + interpreter explicitly untouched). Naming (#27 — mirrors `unresolvedMarkers`). **Disposition: CONFIRM** — pre-flight READY stands; session-prompt generation authorized.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` + engine `test` 0; `pnpm ledger:heroes:check` OK; `pnpm sim:coverage --check` OK (baseline unchanged)
- [ ] `resolvedMarkers` symmetric with `unresolvedMarkers`; interpreter/executor/`primitiveEffects`/`finalStateHash` unchanged
- [ ] `data/cards/**` byte-unchanged; no coverage-probe/barrel/dashboard-source change
- [ ] No files outside `## Files Expected to Change` modified
- [ ] **D-24026 live-on-surface verification (post-deploy):** after merge + dashboard redeploy, `/coverage` By-card shows the bkpt/wtif deferred `empowered` cards as Unsupported and the executable KPI drops to the honest count — observable evidence, not tests+merge alone. STATUS records it pending until verified.
- [ ] `docs/ai/STATUS.md` updated — the WP-267 by-name over-claim resolved (ledger now by-hook)
- [ ] `docs/ai/DECISIONS.md` updated — **D-24045** (parser `resolvedMarkers` + by-hook composition ledger)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-268 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-299 Done; `docs/05-ROADMAP-MINDMAP.md` WP-268 node; `node scripts/roadmap-counts.mjs --check` passes
