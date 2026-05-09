# WP-144 — Arena-Client Production Bundle Isolation

**Status:** Drafted 2026-05-09; not yet executed; lint gate not yet invoked
**Primary Layer:** Game Engine (package exports + barrel topology) + Build Tooling (CF Pages build-command shape) + Layer Boundary (formal runtime / setup-time split)
**Last Updated:** 2026-05-09
**Dependencies:** WP-061 (`apps/arena-client` skeleton + `vite build` script); WP-053a (`scoringConfigLoader` introduced under D-5306a — the canonical Node-IO loader this WP isolates); WP-090 (sole sanctioned runtime engine import in `apps/arena-client/src/client/bgioClient.ts`)

---

## Session Context

WP-007a (`legendary-arena-website` repo's `play.legendary-arena.com`
deploy) attempted execution on 2026-05-09 and surfaced **two
independent gaps** at Step 1 pre-flight that this WP closes
together:

- **Blocker A (hard):** `pnpm --filter @legendary-arena/arena-client build`
  on a fresh tree fails to resolve the `@legendary-arena/game-engine`
  package entry because the single-package filter does not transitively
  build workspace dependencies, and `packages/game-engine/dist/` is a
  gitignored build artifact directory. Vite errors out, build exits
  non-zero. **Fixed by topology filter** (`pnpm --filter "@legendary-arena/arena-client..." build`)
  in WP-007a's amended build command.
- **Blocker B (soft, but enforceable):** Node-IO setup-tooling code
  (`scoringConfigLoader`) is reachable from the engine package's
  runtime barrel, so Vite externalizes `node:*` modules in arena-client's
  browser bundle and emits five `[plugin:vite:resolve] Module "node:..." has been externalized`
  warnings per build. The bundle is functionally correct (tree-shaking
  drops the dead loader code), but the runtime / setup-tooling
  boundary is enforced implicitly rather than via the package's public
  surface, and the warnings obscure any future genuine warning that
  lands on the same surface. **Fixed by subpath exports** that move
  setup-tooling behind `@legendary-arena/game-engine/setup`.

Both fixes are needed for WP-007a to land cleanly: the topology filter
without the subpath split would leave the warnings in place; the
subpath split without the topology filter would still fail on a fresh
tree because `dist/` is missing. WP-144 lands them together as one
coordinated change.

The marketing-repo session prompt locked the CF Pages build command
verbatim as:

```
pnpm install --frozen-lockfile && pnpm --filter @legendary-arena/arena-client build
```

That command **fails on a fresh checkout** with:

```
[commonjs--resolver] Failed to resolve entry for package
"@legendary-arena/game-engine". The package may have incorrect
main/module/exports specified in its package.json.
```

The proximate cause is mechanical: `packages/game-engine/package.json`
declares `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`,
and an `exports` map pointing at the same `dist/` paths. `dist/` is a
build artifact directory — gitignored, present in long-lived dev
checkouts only because someone has run `pnpm -r build` at some point.
The pnpm single-package filter (`--filter @legendary-arena/arena-client`)
does NOT transitively build workspace dependencies, so on a fresh CF
Pages clone (or any clean clone, including a fresh `git worktree add`)
the `dist/` directory does not exist when Vite walks the import graph
and tries to resolve [apps/arena-client/src/client/bgioClient.ts:16](apps/arena-client/src/client/bgioClient.ts:16)'s
`import { LegendaryGame } from '@legendary-arena/game-engine'`.
`pnpm -r build` recursively builds all workspace packages and then
arena-client builds successfully — that is how the existing main
checkout has been operating, but it is not the WP-007a-locked path
and it is not what CF Pages would run.

Underneath the proximate cause is a structural one. arena-client's
WP-090-locked sole sanctioned runtime engine import pulls in the
`@legendary-arena/game-engine` barrel (`packages/game-engine/src/index.ts`),
which currently re-exports **everything** the engine package contains —
including `loadScoringConfigForScenario` and `loadAllScoringConfigs`
from `scoring/scoringConfigLoader.ts`, which in turn import from
`node:fs/promises` and `node:path`. The loader's author anticipated
this: lines 33-42 of `scoringConfigLoader.ts` document a deliberate
namespace-import workaround (`import * as fsPromises from 'node:fs/promises'`)
specifically because Vite's browser bundler externalizes `node:*` to
a stub module with no named exports, and namespace bindings degrade
to dead code that Rollup tree-shakes out of the production bundle.
The pattern works — arena-client's bundle does NOT contain Node IO
code at runtime — but it produces five `[plugin:vite:resolve]`
warnings on every CF Pages build:

```
"join" is not exported by "__vite-browser-external"
"readFile" is not exported by "__vite-browser-external"
"readdir" is not exported by "__vite-browser-external"
... (five total)
```

The warnings are **expected and harmless** under the current design,
but they are alarming on first contact (they were the first
distraction surfaced during the WP-007a pre-flight after the hard
build failure was diagnosed) and they obscure any future genuine
warning that lands on the same surface. They are also a symptom of an
architectural contract that is enforced implicitly (tree-shaking)
rather than explicitly (package.json exports). A consumer that
imports a Node-IO function from the runtime barrel by name would
silently inflate the SPA bundle with externalized stubs; the failure
mode is "bundle gets bigger and a few more warnings appear" rather
than "build fails," which makes the contract drift-prone.

The Layer Boundary rules (`.claude/rules/architecture.md` +
`docs/ai/ARCHITECTURE.md`) classify the engine as the gameplay
authority; they do not currently distinguish *gameplay-runtime* code
(usable in browser SPA contexts) from *setup-tooling* code
(authoring / calibration / Node-IO loaders that should never reach a
browser bundle). The tree-shaking arrangement is the de-facto split
but it is not codified and it is not testable — there is no gate
that would catch a future barrel re-export accidentally landing a
Node-IO import inside the runtime path.

This WP is the architectural codification: split the engine package's
public surface into a runtime entry (browser-bundle-safe) and a
setup-tooling subpath (Node-only); update consumers; drop the
namespace-import workaround in `scoringConfigLoader.ts` since it
becomes unnecessary; verify a fresh-tree build of arena-client
succeeds via a topology-aware CF-shaped command. After this WP lands,
WP-007a can re-attempt with a single-line amendment to its locked
build command.

---

## Why This Packet Matters

Three problems compound on top of WP-007a's blocker:

1. **WP-007a is paused.** The cross-site brand-tokens contract from
   WP-002 has no real consumer in production until `play.legendary-arena.com`
   ships. WP-007b (registry-viewer brand integration) is also waiting
   on cross-site contract validation, and WP-009 (class-color usage
   audit cross-site) waits on both. WP-144 is the smallest engine-side
   change that unblocks the marketing-side WP chain.

2. **The runtime / setup-tooling boundary is currently implicit.**
   Tree-shaking is a build-time outcome, not a contract. The engine
   could grow another Node-IO loader tomorrow (e.g., a future replay
   bundle reader, a config validator that reads from disk) and the
   runtime barrel would silently start bundling externalized stubs
   for it. A subpath-export contract makes the boundary explicit and
   testable.

3. **The namespace-import workaround in `scoringConfigLoader.ts`
   trades clarity for tree-shaking.** The file's author wrote 30+
   lines of documentation explaining why they couldn't write
   `import { readFile } from 'node:fs/promises'` like every other
   Node module in the codebase. After WP-144, that constraint is
   gone — `scoringConfigLoader.ts` is reached only via the setup
   subpath and the standard import form is fine.

The pause cost on WP-007a is one extra WP and a few days of
elapsed time. The cost of working around the locked build command
(e.g., adding a non-locked CF prebuild step in the dashboard, or
pre-building `dist/` locally and pushing a "lock-pass" deploy that
doesn't reproduce on CF) would be exactly the silent-dashboard-drift
/ same-commit-different-output failure mode that WP-007a Step 7's
"Configuration immutability rule" exists to prevent. Doing this work
properly here keeps WP-007a's reproducibility invariants intact and
codifies the boundary the engine team was already trying to express
implicitly.

---

## Goal

WP-144 closes **two independent contracts** that together unblock
WP-007a's CF Pages deploy of `apps/arena-client`:

### Contract A — Fresh-tree CF-shaped build succeeds (hard blocker)

- `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
  succeeds from a fresh clone or a fresh `git worktree add` on the
  engine monorepo, exiting 0, producing `apps/arena-client/dist/`
  with byte-identical output across consecutive runs.
- The trailing-`...` topology filter (pnpm's transitive workspace
  selector) is what makes Contract A mechanically achievable; the
  subpath split below is unrelated to whether the build succeeds on
  a fresh tree.
- WP-007a (marketing repo) gets a one-line amendment to its locked
  CF Pages build command incorporating the topology filter — see
  Coordination Receipts.

### Contract B — Runtime bundle is Node-IO clean (soft, enforceable boundary)

- `pnpm --filter "@legendary-arena/arena-client..." build` emits
  **zero** `[plugin:vite:resolve] Module "node:..." has been externalized`
  warnings and zero `__vite-browser-external` references in any build
  log line.
- `packages/game-engine/package.json` declares subpath exports: `.`
  (runtime, browser-bundle-safe) and `./setup` (setup-tooling, Node-IO).
- `apps/arena-client/src/client/bgioClient.ts` and any other
  arena-client files that import from `@legendary-arena/game-engine`
  continue to resolve without source changes (the runtime barrel's
  public surface for arena-client's needs is unchanged — only the
  setup-tooling exports move).
- `apps/server/` updates its import sites to use the new `./setup`
  subpath where it consumes `loadScoringConfigForScenario` /
  `loadAllScoringConfigs` (and any other setup-tooling-only export
  that this WP relocates).
- `packages/game-engine/src/scoring/scoringConfigLoader.ts` drops the
  namespace-import workaround and uses standard named imports
  (`import { readFile } from 'node:fs/promises'`) — restoring
  consistency with the rest of the Node codebase.
- New architectural decision **D-14401** in `docs/ai/DECISIONS.md`
  codifies the runtime / setup-tooling split as a Layer Boundary
  contract: the engine package's runtime entry must contain zero
  `node:*` imports anywhere reachable; setup-tooling exports live
  behind the `./setup` subpath; arena-client and any future browser
  SPA consumer imports only from the runtime entry.
- `docs/ai/ARCHITECTURE.md §Layer Boundary` per-package import-rules
  table for `apps/arena-client` is updated: the `@legendary-arena/game-engine`
  runtime entry remains a permitted runtime import (per D-5901);
  `@legendary-arena/game-engine/setup` is added to the explicit
  forbidden-runtime-imports column. `apps/server` row gains both as
  permitted.

Both contracts must hold at lock. Contract A without B leaves the
boundary implicit and the warnings in place; B without A leaves
fresh trees broken. Lock requires both.

---

## Assumes

- WP-061 complete: `apps/arena-client` builds via `vite build` (the
  build script itself is unchanged by WP-144; only what's inside the
  resulting bundle and what subpath the engine consumers import from)
- WP-053a complete: `scoringConfigLoader.ts` exists at
  `packages/game-engine/src/scoring/scoringConfigLoader.ts` with the
  namespace-import workaround in lines 33-42; it is the canonical
  Node-IO loader that this WP relocates behind the `./setup` subpath
- WP-090 complete: arena-client's sole sanctioned runtime engine
  import is at `apps/arena-client/src/client/bgioClient.ts:16`; the
  `LegendaryGame` symbol it imports is exported from the runtime
  barrel (and remains so post-WP-144 — it is gameplay-runtime, not
  setup-tooling)
- D-5901 holds: `apps/arena-client` may runtime-import from
  `@legendary-arena/preplan` and `@legendary-arena/game-engine`
- `pnpm@10.32.1` (per root `package.json` `packageManager`) supports
  the trailing-`...` topology filter; `pnpm --filter "@legendary-arena/arena-client..." build`
  is a valid invocation that builds the named package after its
  workspace dependencies
- Node v22+ supports the `package.json` `exports` field with subpath
  conditionals
- Vite 5.x (per `apps/arena-client/package.json` devDeps) honors the
  `package.json` `exports` field when resolving workspace imports
- No consumer outside `apps/server/` and `apps/arena-client/` imports
  from `@legendary-arena/game-engine` at runtime (verified by
  `grep -rn "from '@legendary-arena/game-engine'" apps/ packages/`
  before locking — pre-flight gate)
- WP-138 / WP-140 / WP-141 / WP-142 (physical-card chain) are
  in-progress but **do not touch** the engine package's `exports`
  surface; they touch `packages/registry/` and engine consumer
  call-sites for `card.imageUrl` reads, neither of which collide with
  WP-144's exports refactor

If any assumption is false, this packet is BLOCKED.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  per-package import rules table; `apps/arena-client` row (D-5901
  permits runtime imports of `@legendary-arena/game-engine` and
  `@legendary-arena/preplan`)
- `.claude/rules/architecture.md` — Layer Boundary enforcement;
  Shared Tooling rule (vue-sfc-loader devDep-only) — analogous
  posture to what WP-144 is codifying for setup-tooling
- `.claude/rules/code-style.md` — naming, comments, full-English-words
  rule; relevant to the new subpath barrel files
- `.claude/rules/work-packets.md` — One Packet per Session; Adding or
  Extending Work Packets; commit-hygiene
- `docs/ai/DECISIONS.md` — scan for D-5306a (scoringConfigLoader
  introduction), D-5901 (arena-client runtime imports), D-5001 (engine
  setup-time IO carve-out for simulation)
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — full lint gate
  must pass before execution; this packet's draft does not constitute
  a lint-gate pass
- `docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md` — likely **not
  invoked** for WP-144 (no `LegendaryGameState` shape change, no
  `computeStateHash` input change, no replay-hash cascade)
- `docs/ai/REFERENCE/01.6-post-mortem-checklist.md` — **MANDATORY at
  execution** (new long-lived architectural contract `D-14401`; first
  use of subpath exports in `packages/*`; touches a registered
  package's `exports` surface)
- `packages/game-engine/src/index.ts` (450 lines — current barrel;
  re-exports `loadScoringConfigForScenario`, `loadAllScoringConfigs`
  at lines 184-187)
- `packages/game-engine/src/scoring/scoringConfigLoader.ts` (210
  lines — current namespace-import workaround at lines 33-42)
- `packages/game-engine/package.json` — current `main` / `types` /
  `exports` declarations
- `apps/server/src/par/` — current consumer of `loadScoringConfigForScenario`
  and `loadAllScoringConfigs` (the import sites that switch to the
  `./setup` subpath)
- `legendary-arena-website` repo: `docs/ai/work-packets/WP-007a-play-deploy.md`,
  `docs/01-VISION.md` Decisions log entry recording the 2026-05-09
  WP-007a pause (drafted in coordination with WP-144)

---

## Scope (In)

- Refactor `packages/game-engine/src/index.ts` into two barrel files:
  - `packages/game-engine/src/index.ts` (runtime entry; keeps every
    current export EXCEPT `loadScoringConfigForScenario` /
    `loadAllScoringConfigs` and any other setup-tooling re-export
    that this WP relocates)
  - `packages/game-engine/src/setup-tooling/index.ts` (new file;
    re-exports `loadScoringConfigForScenario`, `loadAllScoringConfigs`,
    and any other Node-IO surfaces that should not reach browser
    bundles — pre-flight grep enumerates the full set; expected to be
    just the two scoringConfigLoader exports based on current barrel
    inspection)
- Update `packages/game-engine/package.json`:
  - Replace single `exports` with subpath map. Each subpath includes
    `types`, `import`, and `default` conditions for tooling
    compatibility (Vite, Vitest, downstream consumers that probe
    `default` when no other condition matches); `./package.json` is
    exported so introspection tools can read it without hitting
    "subpath not exported" errors:
    ```json
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js",
        "default": "./dist/index.js"
      },
      "./setup": {
        "types": "./dist/setup-tooling/index.d.ts",
        "import": "./dist/setup-tooling/index.js",
        "default": "./dist/setup-tooling/index.js"
      },
      "./package.json": "./package.json"
    }
    ```
  - **Conditionally** add `"sideEffects": false` ONLY if a quick
    import-side-effects audit passes for the engine package (no
    module-load-time global registrations, prototype patches, logger
    setup, or registry mutations). If any side effect is found, omit
    the field and record the finding in D-14401. The exports split
    is the load-bearing change; `"sideEffects": false` is an
    optional bundle-size win that should not ship blindly.
- Refactor `packages/game-engine/src/scoring/scoringConfigLoader.ts`:
  - Drop the namespace-import workaround (lines 33-42)
  - Replace with standard named imports: `import { readFile, readdir } from 'node:fs/promises'`,
    `import { join } from 'node:path'`
  - Drop the long preamble comment block that explained the workaround
    (preserve the architectural intent in a shorter `// why:` header
    that points at D-14401)
- Update `apps/server/` import sites:
  - Find every `import ... from '@legendary-arena/game-engine'` that
    pulls `loadScoringConfigForScenario` or `loadAllScoringConfigs`
  - Replace with `import ... from '@legendary-arena/game-engine/setup'`
  - Pre-flight grep enumerates the full set; expected to be 1-3 files
    in `apps/server/src/par/`
- Verify `apps/arena-client/` import sites need no changes:
  - Pre-flight grep confirms zero arena-client imports of
    `loadScoringConfigForScenario` or `loadAllScoringConfigs`
- Add D-14401 to `docs/ai/DECISIONS.md` codifying the runtime /
  setup-tooling subpath split as Layer Boundary contract
- Update `docs/ai/ARCHITECTURE.md §Layer Boundary` per-package
  import-rules table:
  - `apps/arena-client` row: explicitly forbid runtime import of
    `@legendary-arena/game-engine/setup`
  - `apps/server` row: explicitly permit both `@legendary-arena/game-engine`
    and `@legendary-arena/game-engine/setup`
- Update `.claude/rules/architecture.md` per-package import-rules
  table to mirror ARCHITECTURE.md (the rules file is derived from
  the authoritative spec)
- Marketing-repo coordination (lands in same WP commit window, but
  in the `legendary-arena/legendary-arena-website` repo since they
  are separate repos):
  - Amend WP-007a's locked CF Pages build command to
    `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
    (trailing `...` topology selector)
  - Update WP-007a's "Locked Decisions" / "Failure conditions"
    sections that quote the old build command verbatim
  - The 2026-05-09 Decisions log entry in `01-VISION.md` recording
    the WP-007a pause + WP-144 resolution path is drafted separately
    and lands in the same coordinated push

## Out of Scope

- **Brand integration on `play.legendary-arena.com`** — that is
  WP-007a's job after WP-144 lands and unblocks the build path. Header
  / footer / brand-tokens.local.css / `_redirects` etc. all remain
  WP-007a scope.
- **Cloudflare Pages project creation, DNS, custom domain binding** —
  WP-007a scope; WP-144 does not touch CF dashboard or DNS.
- **Refactoring `bgioClient.ts` itself** — its sole sanctioned runtime
  engine import (D-5901) stays in place; WP-144 changes only what
  the engine package exports from its runtime entry, not what
  arena-client imports.
- **Vue Router introduction in arena-client** — query-string-only
  routing remains; WP-144 does not change app-level routing.
- **Bundle size optimization beyond eliminating the externalized-Node
  warnings** — measuring whether the SPA shrinks at all from removing
  the externalized stubs is out of scope; the WP succeeds on whether
  the warnings are gone, not on whether the gzip size dropped by N
  bytes.
- **Adding a third subpath like `./types`** — the pure-types vs
  runtime split is a different concern and not relevant to the
  build blocker. Future WP if/when needed.
- **Replacing the engine's tree-shaking arrangement with explicit
  `package.json` `imports` aliases or Vite-side aliases** — the
  subpath exports are sufficient and standard; no alias indirection
  is needed.
- **Migrating other workspace packages to subpath exports** —
  `packages/registry/` and `packages/preplan/` ship single entries
  today; if either ever introduces Node-IO that browser consumers
  shouldn't see, the WP-144 precedent applies but the migration is
  a separate WP.
- **Anything in the physical-card chain (WP-138 / WP-140 / WP-141 /
  WP-142)** — disjoint surface; those touch `packages/registry/` and
  engine consumer call-sites for `card.imageUrl`, neither of which
  collides with WP-144's exports refactor. WP-144 and WP-141 can land
  in either order.

---

## Execution Plan (summary)

The order matters: server-side import migration must land in the
same commit as the engine barrel split, or `apps/server`'s tests
break mid-flight.

1. **Pre-flight greps** — capture the actual surface to migrate:
   - `grep -rn "@legendary-arena/game-engine" apps/ packages/`
     (every import site, used to verify nothing outside the listed
     scope is touched)
   - `grep -rn "loadScoringConfigForScenario\|loadAllScoringConfigs" .`
     (server-side consumers of the loader exports — expected 1-3
     files in `apps/server/src/par/`)
   - `grep -rn "from 'node:" packages/game-engine/src/`
     (every Node-IO surface in the engine package — expected to be
     `scoringConfigLoader.ts` only at start; if there's more, the
     setup-tooling barrel must re-export everything found)
   - `grep -rn "@legendary-arena/game-engine" apps/arena-client/`
     (verify arena-client does NOT consume the loader exports —
     should return zero matches for `loadScoringConfigForScenario` /
     `loadAllScoringConfigs`)
2. **Capture pre-WP test baselines** to local files (do not commit;
   used for post-WP comparison — see Verification Step 0).
3. **Create new barrel** at `packages/game-engine/src/setup-tooling/index.ts`
   re-exporting every Node-IO surface enumerated in Step 1.
4. **Remove loader re-exports** from `packages/game-engine/src/index.ts`
   (the runtime barrel) — drop lines 183-187.
5. **Add subpath exports** in `packages/game-engine/package.json`
   (per Goal Contract B); audit side-effects and conditionally add
   `"sideEffects": false` per the gated rule above.
6. **Update server import sites** identified in Step 1 to use
   `@legendary-arena/game-engine/setup`.
7. **Normalize `scoringConfigLoader.ts`** — drop the namespace-import
   workaround (lines 33-42) and the explanatory preamble (lines
   11-30); replace with standard named imports + a short `// why:`
   pointer to D-14401.
8. **Build verification** — `pnpm --filter @legendary-arena/game-engine build`
   must produce both `dist/index.{js,d.ts}` and
   `dist/setup-tooling/index.{js,d.ts}`.
9. **Fresh-tree verify** — Verification Step 1 (the WP's primary
   acceptance gate; runs the CF-shaped command in a clean worktree).
10. **Determinism check** on `apps/arena-client/dist/` — Verification
    Step 2.
11. **Docs updates** — D-14401 in `DECISIONS.md`; Layer Boundary
    table in `ARCHITECTURE.md`; mirror in `.claude/rules/architecture.md`;
    post-mortem per 01.6.
12. **Marketing repo** — amend WP-007a's locked CF Pages build
    command in every site that quotes it verbatim (Locked Decisions,
    Step 7 build configuration table, Failure conditions, Definition
    of Done). Treated as Coordination Receipts, not a dependency
    — see below.

## Files Expected to Change

**Engine repo (`C:\pcloud\BB\DEV\legendary-arena\`):**

- `packages/game-engine/src/index.ts` — modified — drop two lines
  (the scoringConfigLoader re-export block at 183-187)
- `packages/game-engine/src/setup-tooling/index.ts` — new — single
  barrel file re-exporting `loadScoringConfigForScenario`,
  `loadAllScoringConfigs`, and any other Node-IO surface enumerated
  by pre-flight grep
- `packages/game-engine/src/scoring/scoringConfigLoader.ts` — modified
  — drop namespace-import workaround (lines 33-42) and the explanatory
  preamble (lines 11-30); replace with standard named imports + a
  short `// why:` header pointing at D-14401
- `packages/game-engine/package.json` — modified — replace single
  `exports` with subpath map; add `"sideEffects": false`
- `packages/game-engine/tsconfig.build.json` — modified IF needed —
  ensure `dist/setup-tooling/index.{js,d.ts}` is emitted alongside
  `dist/index.{js,d.ts}` (the existing tsc config likely already
  builds all `src/**/*.ts`; verify no exclude pattern drops the new
  subdirectory)
- `apps/server/src/par/<files-found-by-grep>.ts` — modified — switch
  imports from `@legendary-arena/game-engine` to
  `@legendary-arena/game-engine/setup` for the loader exports
- `docs/ai/DECISIONS.md` — modified — D-14401 entry codifying the
  runtime / setup-tooling subpath split
- `docs/ai/ARCHITECTURE.md` — modified — Layer Boundary table updates
  for `apps/arena-client` and `apps/server` rows
- `.claude/rules/architecture.md` — modified — per-package import-rules
  table mirror update
- `docs/ai/work-packets/WORK_INDEX.md` — modified — register WP-144
  in the appropriate phase; mark `[x]` Done at lock with commit hash
- `docs/ai/STATUS.md` — modified — dated entry recording WP-144
  completion
- `docs/ai/post-mortems/01.6-WP-144-arena-client-production-bundle-isolation.md`
  — new — mandatory per 01.6 (new long-lived architectural contract;
  touches a registered package's `exports` surface)

---

## Coordination Receipts (Marketing Repo)

WP-144 is an **engine-side WP**. Marketing-repo edits below are
**coordination receipts** required to unpause WP-007a once WP-144
lands — they are NOT dependencies of WP-144's lock. WP-144 can lock
on engine-side acceptance criteria alone; the receipts land in a
separate marketing-repo commit on the same day, in the
`legendary-arena/legendary-arena-website` repo.

- `docs/ai/work-packets/WP-007a-play-deploy.md` — modified — amend
  the locked CF Pages build command from
  `pnpm install --frozen-lockfile && pnpm --filter @legendary-arena/arena-client build`
  to
  `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
  in the "Locked Decisions" block, the Step 7 build configuration
  table, the Failure conditions list, the Definition of Done, and
  any other site that quotes the command verbatim
- `docs/01-VISION.md` — Decisions log entry recording the 2026-05-09
  WP-007a pause + WP-144 resolution path **already landed** in the
  marketing repo at commit `e20d65b` (drafted alongside WP-144 on
  2026-05-09, pushed before WP-144 execution began). The receipt
  here is informational only — no further marketing-repo edit to
  `01-VISION.md` is required by WP-144's execution.

---

## Contract

> **Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no
>   snippets) — see Files Expected to Change list above
> - List of exact commands to run with expected output (Verification
>   Steps below)
> - ESM only, Node v22+, TypeScript strict
> - Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
> - No new runtime npm dependencies in either repo
> - `pnpm-lock.yaml` unchanged
> - Engine layer boundaries hold: arena-client gains zero new runtime
>   imports; the WP changes only what the engine package exports, not
>   what consumers reach for
> - Determinism preserved: two consecutive `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
>   runs produce byte-identical `apps/arena-client/dist/`

---

## Acceptance Criteria

Grouped to match the two-contract Goal structure: **A — Build** (the
fresh-tree mechanical gate), **B — Boundary** (subpath exports +
runtime purity), **C — Governance** (docs + decisions). Marketing-repo
items are receipts (see Coordination Receipts above), not WP-144
acceptance — they are listed last for completeness.

### A. Fresh-tree build succeeds

- [ ] `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
      from a fresh `git worktree add` (or fresh clone) exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine build` produces both
      `dist/index.{js,d.ts}` and `dist/setup-tooling/index.{js,d.ts}`
- [ ] Two consecutive `pnpm --filter "@legendary-arena/arena-client..." build`
      runs produce byte-identical `apps/arena-client/dist/`
      (`Compare-Object` over SHA-256 hashes returns empty)
- [ ] `pnpm-lock.yaml` unchanged from pre-WP state

### B. Runtime / setup-tooling boundary

- [ ] `packages/game-engine/package.json` declares subpath exports
      `.`, `./setup`, and `./package.json`; each non-`./package.json`
      subpath includes `types`, `import`, and `default` conditions
- [ ] `"sideEffects": false` is present **only if** the import-side-effects
      audit recorded in D-14401 confirms the engine package has no
      module-load-time side effects; if any side effect is found, the
      field is omitted and the audit finding is recorded in D-14401
- [ ] `packages/game-engine/src/setup-tooling/index.ts` exists and
      re-exports `loadScoringConfigForScenario`, `loadAllScoringConfigs`,
      and any other Node-IO surface enumerated in pre-flight Step 1
- [ ] `packages/game-engine/src/index.ts` no longer re-exports any
      surface from `scoring/scoringConfigLoader.js`
      (`grep -E "scoringConfigLoader|loadScoringConfig" packages/game-engine/src/index.ts`
      returns zero matches)
- [ ] **Runtime purity grep gate (conservative):**
      `grep -rn "from 'node:" packages/game-engine/src/` returns
      matches **only** under `src/setup-tooling/` or other explicitly
      Node-only subdirectories — never from any module reachable
      through `src/index.ts`
- [ ] `packages/game-engine/src/scoring/scoringConfigLoader.ts` uses
      standard named imports for `node:fs/promises` and `node:path`
      (no `import * as` for either module); the namespace-import
      explanatory preamble is replaced with a short `// why:` header
      pointing at D-14401
- [ ] `apps/arena-client/dist/` build emits **zero** lines containing
      `__vite-browser-external` or `externalized.*node:` (mechanical
      grep on the build log; pinned in Verification)
- [ ] `apps/server/` typecheck (`pnpm --filter @legendary-arena/server typecheck`)
      and tests (`pnpm --filter @legendary-arena/server test`) pass
      with the migrated import paths
- [ ] Layer-boundary grep gate: `grep -rn "@legendary-arena/game-engine/setup" apps/arena-client/`
      returns zero matches (arena-client must never import from the
      setup subpath)
- [ ] Engine test baseline unchanged in count
      (compare against `pre-wp144-engine-tests.txt` captured in
      Verification Step 0; passing/failing/skipped counts identical)
- [ ] Server test baseline unchanged in count (compare against
      `pre-wp144-server-tests.txt`)
- [ ] Arena-client test baseline unchanged in count (compare against
      `pre-wp144-client-tests.txt`)
- [ ] Repo-wide test baseline unchanged in count (`pnpm -r test`)

### C. Governance + docs

- [ ] D-14401 added to `docs/ai/DECISIONS.md` with the runtime /
      setup-tooling Layer Boundary contract; if `"sideEffects": false`
      was added, the audit note explaining why it's safe is recorded
      in the same entry
- [ ] `docs/ai/ARCHITECTURE.md` Layer Boundary table reflects the new
      subpath in `apps/arena-client` (forbidden runtime import column)
      and `apps/server` (permitted) rows
- [ ] `.claude/rules/architecture.md` per-package import-rules table
      mirrors the ARCHITECTURE.md update
- [ ] WP-144 registered in `docs/ai/work-packets/WORK_INDEX.md` and
      checked off at lock with commit hash
- [ ] `docs/ai/post-mortems/01.6-WP-144-*.md` written per 01.6
      mandatory triggers
- [ ] `docs/ai/STATUS.md` updated with what changed

### Coordination receipts (marketing repo, not WP-144 acceptance)

- [ ] Marketing-repo `WP-007a-play-deploy.md` build command amended
      in every site that quotes it verbatim (Locked Decisions, Step 7
      table, Failure conditions, Definition of Done)
- [ ] Marketing-repo `01-VISION.md` Decisions log entry for the
      2026-05-09 WP-007a pause already landed at `e20d65b` —
      no further edit required

---

## Verification Steps

All commands run from the engine repo root unless otherwise noted.
Steps 0 and 11 are housekeeping (baseline capture + cleanup); the
substantive gates are Steps 1-10.

```pwsh
# 0. Capture pre-WP test baselines (local-only, do NOT commit)
pnpm --filter @legendary-arena/game-engine test 2>&1 |
  Tee-Object pre-wp144-engine-tests.txt
pnpm --filter @legendary-arena/server      test 2>&1 |
  Tee-Object pre-wp144-server-tests.txt
pnpm --filter @legendary-arena/arena-client test 2>&1 |
  Tee-Object pre-wp144-client-tests.txt
# These files are the comparison anchors for Steps 3-5 below; add to
# .gitignore if not already covered by a wildcard.

# 1. Fresh-tree build (the WP's primary acceptance gate)
#    Run in a clean worktree to mirror what CF Pages will see.
git worktree add ../wp144-verify HEAD
Push-Location ../wp144-verify
pnpm install --frozen-lockfile
pnpm --filter "@legendary-arena/arena-client..." build 2>&1 |
  Tee-Object wp144-build.log
# Expected: exits 0; apps/arena-client/dist/ populated.
# Mechanical warning gate (binary):
Select-String -Path wp144-build.log `
  -Pattern "__vite-browser-external|externalized.*node:" -Quiet `
  | ForEach-Object { if ($_) { throw "Build emitted Node externalization warnings — Contract B failed." } }

# 2. Determinism check (run from inside the verify worktree)
Get-ChildItem -Recurse apps/arena-client/dist | Get-FileHash |
  Sort-Object Path > build1.txt
pnpm --filter "@legendary-arena/arena-client..." build
Get-ChildItem -Recurse apps/arena-client/dist | Get-FileHash |
  Sort-Object Path > build2.txt
$diff = Compare-Object (Get-Content build1.txt) (Get-Content build2.txt)
if ($diff) { throw "Determinism violation: $($diff.Count) lines differ." }
# Expected: empty diff
Pop-Location

# 3. Engine test baseline preserved (compare against Step 0 capture)
pnpm --filter @legendary-arena/game-engine test 2>&1 |
  Tee-Object post-wp144-engine-tests.txt
# Manually compare summary lines from pre-wp144-engine-tests.txt and
# post-wp144-engine-tests.txt — passing/failing/skipped counts must match.

# 4. Server import migration verified
pnpm --filter @legendary-arena/server typecheck
pnpm --filter @legendary-arena/server test 2>&1 |
  Tee-Object post-wp144-server-tests.txt
# Expected: zero typecheck errors; test counts unchanged vs Step 0 capture.

# 5. Arena-client tests unchanged
pnpm --filter @legendary-arena/arena-client test 2>&1 |
  Tee-Object post-wp144-client-tests.txt
# Expected: counts unchanged vs Step 0 capture.

# 6. Repo-wide build + test sanity
pnpm -r build
pnpm -r test
# Expected: both exit 0 with unchanged test counts.

# 7. Runtime purity grep gate (conservative)
#    `node:` imports must live ONLY under setup-tooling (or other
#    explicitly Node-only subtrees). The runtime barrel must not
#    re-export anything that imports `node:*`.
grep -rn "from 'node:" packages/game-engine/src/ | Sort-Object
# Expected: every match is under packages/game-engine/src/setup-tooling/
# or a path explicitly documented as Node-only. Any match under
# src/index.ts's reachable graph is a Contract B violation.

# 8. Layer-boundary grep gate (no arena-client setup-subpath imports)
grep -rn "@legendary-arena/game-engine/setup" apps/arena-client/
# Expected: zero matches.

# 9. Lockfile clean
git status -- pnpm-lock.yaml
# Expected: clean.

# 10. Pre-flight surface confirmation (sanity)
grep -rn "@legendary-arena/game-engine" apps/ packages/ |
  Out-File post-wp144-engine-import-sites.txt
# Spot-check: every import that previously pulled
# loadScoringConfigForScenario / loadAllScoringConfigs from the runtime
# barrel now imports from `@legendary-arena/game-engine/setup`.

# 11. Cleanup
#     Note: `git worktree remove` must run from inside a checkout of
#     the engine repo, not from the worktree being removed. Use the
#     main checkout's path or `git -C` to avoid cwd ambiguity.
git -C "C:/pcloud/BB/DEV/legendary-arena" worktree remove ../wp144-verify
Remove-Item pre-wp144-*.txt, post-wp144-*.txt, build1.txt, build2.txt -ErrorAction SilentlyContinue
```

---

## Definition of Done

- [ ] All Acceptance Criteria pass
- [ ] All Verification Steps run with expected output
- [ ] D-14401 entry in `docs/ai/DECISIONS.md`
- [ ] `docs/ai/STATUS.md` updated with what changed
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-144 registered and
      checked off
- [ ] `docs/ai/post-mortems/01.6-WP-144-*.md` written per 01.6
      mandatory triggers (new long-lived architectural contract; first
      use of subpath exports in `packages/*`; touches a registered
      package's `exports` surface)
- [ ] Marketing-repo amendments to WP-007a + 01-VISION.md committed
      and pushed (separate repo; coordinated commit window)
- [ ] No files outside the "Files Expected to Change" list were
      modified
- [ ] Commit message cites WP-144 as originating WP per
      `.claude/rules/work-packets.md` and
      `01.3-commit-hygiene-under-ec-mode.md`

---

## Failure Conditions

WP-144 must NOT be locked if any of the following are true:

- `pnpm install --frozen-lockfile && pnpm --filter "@legendary-arena/arena-client..." build`
  fails on a fresh tree
- arena-client production build log contains ANY line matching
  `__vite-browser-external` or `externalized.*node:` (mechanical
  grep gate per Verification Step 1; pinned strings — exact substrings
  are the binary failure surface, not a paraphrase)
- Runtime purity grep gate fails: `grep -rn "from 'node:" packages/game-engine/src/`
  returns a match outside `src/setup-tooling/` (or other explicitly
  Node-only subdirectory documented in D-14401)
- Engine test baseline regresses (any count change in
  pass/fail/skip)
- Server test baseline regresses
- Arena-client test baseline regresses
- `pnpm-lock.yaml` modified by this WP (no new runtime deps were
  planned; lockfile change suggests scope spillage)
- Determinism violation: two consecutive arena-client builds produce
  different `dist/` hashes
- Layer-boundary spillage: `apps/arena-client/` gains any import from
  `@legendary-arena/game-engine/setup`
- `packages/registry/`, `packages/preplan/`, `apps/server/` (beyond
  the scoringConfigLoader import migration), or any other workspace
  package's source code modified outside the scope list
- Marketing-repo touched outside the locked WP-007a + 01-VISION.md
  amendments

---

## Rollback

This WP is purely additive at the packaging level (the runtime
barrel keeps every export it previously had, except the two loader
re-exports that move to the setup subpath). Rollback is one revert
of the engine-side commit:

```pwsh
git revert <wp-144-commit>
```

After revert, arena-client's production build will fail again on
fresh trees (same blocker WP-144 was created to fix), but no other
consumer breaks: `apps/server` continues to import from
`@legendary-arena/game-engine` directly (the revert restores the old
re-export); the namespace-import workaround in
`scoringConfigLoader.ts` is restored; ARCHITECTURE.md and
DECISIONS.md entries revert. Marketing-repo amendments must be
reverted in lockstep (separate `git revert` in the marketing repo).

---

## What's NOT In Scope (Explicit)

- WP-007a re-execution — separate session after WP-144 lands; the
  build-command amendment in WP-007a is the only marketing-side
  change WP-144 makes; the Cloudflare Pages project creation, DNS
  binding, brand-tokens wiring, header/footer/local fallback, and
  network-block test all remain WP-007a's job
- Brand integration of any kind — colors, typography, header,
  footer, class-color affordances all stay WP-007a
- WP-007b (registry-viewer brand integration) — disjoint; runs in
  parallel with WP-007a after WP-144 lands
- WP-141 (Physical Card Phase 2) — disjoint surface; can land before
  or after WP-144
- WP-142 (Physical Card Phase 3) — same
- Engine repo transfer (`barefootbetters/legendary-arena` →
  `legendary-arena/legendary-arena-game`) — out of scope; if the
  transfer happens before WP-144 executes, the WP body is unaffected
  and CF Pages would point at the new repo URL when WP-007a
  re-executes
- Real branded logo / favicons — separate creative effort
- Analytics / Workers / Functions / WAF — out of scope (WP-007a
  same-as-was)

---

## Authority

Subordinate to `docs/ai/ARCHITECTURE.md` (Layer Boundary
Authoritative section), then `.claude/CLAUDE.md`, then
`.claude/rules/*.md`, then this file. The marketing-repo amendments
to `WP-007a-play-deploy.md` and `01-VISION.md` are subordinate to
the marketing-repo's own authority chain (`01-VISION.md` →
`03-ROADMAP.md` → WP file). The two authority chains do not conflict
for WP-144 — the engine-side packaging change is mechanical, and
the marketing-side amendments are documentation updates that record
the new build-command shape.

If anything in this WP appears to add a constraint not present in
ARCHITECTURE.md or the marketing-repo's vision, the upstream
documents win — surface the conflict and stop.

---

## Background

`apps/arena-client` was created in WP-061 as a Vue 3 + Vite + Pinia
SPA with a `vite build` script. The package's runtime workspace
dependencies are `@legendary-arena/preplan` (per D-5901) and
`@legendary-arena/game-engine` (per D-5901, sole sanctioned runtime
import in `bgioClient.ts:16`). WP-061's acceptance criteria did not
include a fresh-tree CF-shaped production build verification — at
the time, the deploy was not yet planned, so the build's interaction
with workspace package `dist/` directories was untested.

WP-053a (`scoringConfigLoader`) introduced the canonical Node-IO
loader at the engine layer in 2026-04-25 with a documented carve-out
under D-5306a (calibration-time IO is permitted; gameplay-time IO is
forbidden). The author anticipated that the loader would reach
arena-client's import graph through the engine barrel and added the
namespace-import workaround as a tree-shaking-friendly mitigation.
The pattern works in steady state but produces five Vite externalization
warnings per build and codifies the runtime / setup-tooling boundary
implicitly rather than via the package's public surface.

WP-007a (marketing repo, `play.legendary-arena.com` deploy) attempted
execution on 2026-05-09 and surfaced both issues at Step 1 pre-flight:
the missing-`dist/` blocker (a hard build failure) and the
externalization warnings (cosmetic but distracting and concerning to
a fresh executor). Per WP-007a's "Execution discipline" the session
stopped and surfaced the blocker rather than working around it; this
WP is the cleanly-scoped engine-side resolution.

After WP-144 locks, WP-007a re-executes with a one-line build-command
amendment in its locked decisions. The cross-site brand-tokens v1
contract from WP-002 then has its first real consumer in production,
which is the load-bearing condition for WP-007b and WP-009.
