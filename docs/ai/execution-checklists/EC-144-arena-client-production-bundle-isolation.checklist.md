# EC-144 — Arena-Client Production Bundle Isolation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-144-arena-client-production-bundle-isolation.md
**Layer:** Engine package surface (`packages/game-engine/` exports + new `setup-tooling/` barrel) + arena-client build/compile config (`apps/arena-client/{vite.config.ts,tsconfig.json}`) + server consumer migration (`apps/server/src/par/parGate.{mjs,test.ts}`)
**Scope note:** Subpath split of `@legendary-arena/game-engine` into Runtime-Safe Engine Surface (`.`) + Setup-Tooling Surface (`./setup`); structural Boundary Leakage gates (subpath exports + Vite `onwarn` hard-fail + TS path guard); D-14401 codifies the Layer Boundary contract. NOT in scope: arena-client `src/` source edits, registry / preplan / viewer / wiki-viewer / physical-card chain, marketing-repo coordination receipts, CF Pages deploy trigger.

## Before Starting

- [ ] Lint gate `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` passed for this session
- [ ] Session prompt `docs/ai/invocations/session-wp144-arena-client-production-bundle-isolation.md` read end-to-end (binding execution contract for this WP per Option A close)
- [ ] WP-061, WP-053a, WP-090 commits in branch ancestry (arena-client exists; scoringConfigLoader exists; bgioClient.ts:16 imports LegendaryGame from `@legendary-arena/game-engine`)
- [ ] `pnpm --version` returns 10.32.1 (or any pnpm ≥ 8.x supporting trailing `...` topology filter)
- [ ] `grep -c "stubParStoragePlugin" apps/arena-client/vite.config.ts` ≥ 1 (pre-WP workaround in place)
- [ ] Pre-flight `node:*` scan enumerates the two expected Node-IO files (`scoring/scoringConfigLoader.ts` + `simulation/par.storage.ts`); if a third surface appears, it is in-scope migration, not a deferral
- [ ] Pre-flight loader-consumer scan: every relocated-symbol import in `apps/server/src/` is enumerated
- [ ] `docs/ai/DECISIONS.md` most recent decision is D-13901; D-14401 lands at execution
- [ ] Test baselines captured: engine `698 / 150 / 0`, registry `39 / 4 / 0`, server `250 / 184 pass / 0 fail / 66 skipped`, arena-client `286 / 35 / 0 / 0`

## Locked Values (do not re-derive)

- **Runtime-Safe Engine Surface** = `.` subpath = `./dist/index.js`; browser-bundle-safe; zero `node:*` imports transitively reachable from the runtime barrel (excluding `*.test.ts`)
- **Setup-Tooling Surface** = `./setup` subpath = `./dist/setup-tooling/index.js`; Node-only; holds scoringConfigLoader + par.storage runtime exports
- **CF Pages-shaped build command (post-WP):** `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
- **`exports` map shape (verbatim per WP §Scope Contract B):**
  ```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "default": "./dist/index.js" },
    "./setup": { "types": "./dist/setup-tooling/index.d.ts", "import": "./dist/setup-tooling/index.js", "default": "./dist/setup-tooling/index.js" },
    "./package.json": "./package.json"
  }
  ```
- **Side-effects audit posture:** add `"sideEffects": false` if all six audit categories absent (module-load global mutation, top-level console/logger emission, top-level `process.env.*` reads influencing module behavior, runtime registry / cache bootstrap loops, singleton instantiation with side effects, top-level `await` performing IO); else omit + record finding in D-14401
- **Vite `onwarn` hard-fail trigger patterns:** Rollup warning code `UNRESOLVED_IMPORT` for any source matching `node:*` OR warning message containing `__vite-browser-external` OR `externalized.*node:`. Handler MUST `throw`, not `console.warn`
- **TS path guard target:** `apps/arena-client/tsconfig.json` `compilerOptions.paths` entry: `"@legendary-arena/game-engine/setup": ["./src/__do-not-import-setup__"]`. Stub directory MUST NOT exist
- **Determinism non-determinism sources (excluded):** build-timestamp injection, non-deterministic chunk naming (Rollup content-hash naming OK), git-state-derived metadata, readdir-order-dependent module resolution
- **Sole new decision:** D-14401 (subpath split + Layer Boundary contract). Six required clauses: (1) doctrine — structural over heuristic enforcement; (2) naming lock — Runtime-Safe / Setup-Tooling Surface; (3) runtime purity invariant — zero `node:*` reachable from runtime barrel; (4) closed-list quarantine future-proof rule (`packages/game-engine/src/setup-tooling/`); (5) tree-shaking prohibition + Boundary Leakage failure-class label; (6) side-effects audit result with module enumeration
- **Test baselines:** all four UNCHANGED post-execution

## Guardrails

- **Server import migration must land in the SAME COMMIT as the engine barrel split.** Otherwise `apps/server` tests break mid-flight.
- **Tree-shaking MUST NOT be relied upon for layer-boundary enforcement** (D-14401 prohibition). Subpath exports + Vite `onwarn` hard-fail + TS path guard are the contract. Pre-WP `stubParStoragePlugin` is the prohibited pattern this WP eliminates.
- **`apps/arena-client/` MUST NEVER import from `@legendary-arena/game-engine/setup`.** Three independent enforcement layers must all be in place; Boundary Leakage class violation otherwise.
- **`bgioClient.ts:16` import is unchanged** — WP-144 changes only what the engine package EXPORTS from its runtime entry, not what arena-client IMPORTS; the WP-090-locked sole sanctioned runtime engine import line stays byte-identical.
- **Vite `onwarn` hard-fail handler must THROW, not log.** `console.warn` / filter-and-pass-through defeats structural enforcement.
- **`stubParStoragePlugin` REMOVED from `apps/arena-client/vite.config.ts`.** Plugin code is forbidden post-WP; only `// why:` comments documenting the removal are permitted.
- **No new runtime dependencies** in `package.json`; `pnpm-lock.yaml` clean post-execution.
- **Determinism preserved** — two consecutive arena-client builds produce byte-identical `dist/`.
- **`apps/server/` source UNTOUCHED OUTSIDE the loader/par-storage import migration.** Only files identified by pre-flight `pre-wp144-loader-consumers.txt` are in scope.
- **`packages/registry/` + `packages/preplan/` UNTOUCHED.** `git diff --stat` empty post-execution.
- **Marketing-repo coordination receipts NOT WP-144 acceptance.** Separate commit window in `legendary-arena/legendary-arena-website`.
- **Existing Node-IO source files (scoringConfigLoader.ts at scoring/, par.storage.ts at simulation/) stay at their current paths.** Per WP §Scope (In), only the runtime-barrel re-export blocks are removed; the new `setup-tooling/index.ts` re-exports from the existing source paths. The closed-list quarantine (D-14401 clause 4) applies to NEW Node-IO surfaces; existing files are grandfathered.

## Required `// why:` Comments

- `packages/game-engine/src/setup-tooling/index.ts` module header — anchor D-14401 (Setup-Tooling Surface; Node-only; never reachable from runtime barrel; closed-list quarantine)
- `packages/game-engine/src/scoring/scoringConfigLoader.ts` short header — anchor D-14401 (Setup-Tooling Surface placement obviates the namespace-import workaround) + D-5306a (calibration-time IO carve-out)
- `apps/arena-client/vite.config.ts` `build.rollupOptions.onwarn` handler — anchor D-14401 + Boundary Leakage failure class. Explain why the handler `throw`s rather than warns
- `apps/arena-client/tsconfig.json` `compilerOptions.paths` entry — anchor D-14401 + Boundary Leakage. Explain stub path is intentionally non-existent
- `packages/game-engine/src/index.ts` two replacement comment blocks (where the loader + par.storage value re-exports were removed) — anchor D-14401; explain that pure-type re-exports of par.storage are preserved as compile-time-only
- D-14401 entry body in `docs/ai/DECISIONS.md` — composes all six required clauses

## Files to Produce

**Commit A (production / config):**
- `packages/game-engine/src/index.ts` — modify — drop loader + par.storage value-export blocks; preserve pure-type re-exports
- `packages/game-engine/src/setup-tooling/index.ts` — **new** — re-export both relocated surfaces
- `packages/game-engine/src/scoring/scoringConfigLoader.ts` — modify — namespace imports → named imports; preamble trimmed
- `packages/game-engine/package.json` — modify — three-subpath `exports` map + `"sideEffects": false` (per audit)
- `apps/arena-client/vite.config.ts` — modify — `stubParStoragePlugin` removed; `build.rollupOptions.onwarn` hard-fail handler installed
- `apps/arena-client/tsconfig.json` — modify — TS path guard for `@legendary-arena/game-engine/setup`
- `apps/server/src/par/parGate.mjs` + `apps/server/src/par/parGate.test.ts` — modify — value imports of `loadParIndex`/`lookupParFromIndex`/`ParStoreReadError` migrated to `@legendary-arena/game-engine/setup`; type imports stay at root

**Commit B (governance close):**
- `docs/ai/work-packets/WORK_INDEX.md` — WP-144 row Draft → Done with commit hash
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-144 row Draft → Done
- `docs/ai/STATUS.md` — executed block prepended
- `docs/ai/DECISIONS.md` — D-14401 appended (six clauses + Boundary Leakage label)
- `docs/ai/ARCHITECTURE.md` — Layer Boundary table amended (apps/arena-client + apps/server rows)
- `.claude/rules/architecture.md` — per-package import-rules table mirror amended
- `docs/ai/post-mortems/01.6-WP-144-arena-client-production-bundle-isolation.md` — **new** (mandatory)

**Explicitly NOT touched** (verify via `git diff --stat`): `packages/registry/`, `packages/preplan/`, `apps/registry-viewer/`, `apps/wiki-viewer/`, `apps/arena-client/src/`, `scripts/convert-cards/`, `data/cards/`, `data/migrations/`, `pnpm-lock.yaml`, `render.yaml`, `.env*`, `docs/ai/REFERENCE/api-endpoints.md` (no HTTP surface change).

## After Completing

- [ ] All four test baselines UNCHANGED
- [ ] `pnpm --filter @legendary-arena/game-engine build` produces both `dist/index.{js,d.ts}` AND `dist/setup-tooling/index.{js,d.ts}`
- [ ] Fresh-tree CF-shaped build (Contract A) exits 0
- [ ] Build log contains zero matches for `__vite-browser-external|externalized.*node:` (Contract B)
- [ ] Determinism check: two consecutive arena-client builds produce byte-identical `dist/`
- [ ] Vite `onwarn` regression probe (deliberate `node:*` import with binding usage) produced non-zero exit; reverted before commit
- [ ] TS path-guard regression probe attempted; observed limitation — vue-tsc 2.x with `moduleResolution: Bundler` resolves `@legendary-arena/game-engine/setup` via the package `exports` field, bypassing `paths` mapping. The path guard is installed (one of three documented enforcement layers); the practical hard-fail comes from the Vite `onwarn` handler + the §11 grep gate `grep -rn "@legendary-arena/game-engine/setup" apps/arena-client/`. Documented in 01.6 post-mortem.
- [ ] §11 grep gates pass with the documented clarification on Gate 1 (existing Node-IO source files at `scoring/scoringConfigLoader.ts` + `simulation/par.storage.ts` stay at their pre-WP paths per WP §Scope (In) — the closed-list quarantine in D-14401 clause 4 applies to NEW Node-IO surfaces). The reachability invariant (zero `node:*` reachable from the runtime barrel) is satisfied and verified by the clean Contract B build log.
- [ ] D-14401 appended to `docs/ai/DECISIONS.md` with all six required clauses + Boundary Leakage failure-class label
- [ ] `WORK_INDEX.md` WP-144 row Draft → Done; `EC_INDEX.md` EC-144 row Draft → Done; `STATUS.md` session-close block prepended
- [ ] `ARCHITECTURE.md` Layer Boundary table amended; `.claude/rules/architecture.md` mirror amended
- [ ] 01.6 post-mortem authored (mandatory — three triggers: new long-lived architectural contract D-14401; first use of subpath exports in `packages/*`; touches a registered package's `exports` surface)

## Common Failure Smells

- "Module 'node:fs/promises' has been externalized for browser compatibility" warning in arena-client build log: the Runtime-Safe Engine Surface is reaching a Node-IO module via static import — Boundary Leakage. Verify the runtime barrel's transitive imports.
- Server tests fail with `ERR_MODULE_NOT_FOUND` for `@legendary-arena/game-engine/dist/index.js`: the engine package wasn't built before tests ran. Run `pnpm -r build` first.
- Engine baseline shifts post-execution: scope creep into engine logic surface; revert non-scoped engine edits.
- Arena-client baseline shifts: scope creep into arena-client source (only `vite.config.ts` + `tsconfig.json` should change).
- `pnpm-lock.yaml` modified: no new runtime deps were planned; investigate.
- Determinism violation: two consecutive arena-client builds produce different `dist/` hashes — diagnose against the §7.8 non-determinism source list.
- The unused-import shape `import { readFile } from 'node:fs/promises'` succeeds silently with `"sideEffects": false`: tree-shaking eliminates it before the resolver / `onwarn` runs. Use the binding-used variant for the regression probe.
- vue-tsc 2.x bypasses the TS path guard: known resolver limitation when the package has an `exports` field. The grep gate `grep -rn "@legendary-arena/game-engine/setup" apps/arena-client/` is the verify-time backstop.