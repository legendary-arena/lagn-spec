# EC-139 — JSDOM Opaque-Origin Storage Fix (Execution Checklist)

**Source:** docs/ai/work-packets/WP-136-jsdom-opaque-origin-storage-fix.md
**Layer:** Client UI / Test Harness (`apps/arena-client/src/testing/`)

## Before Starting
- [ ] WP-130 / EC-133 complete on `main`; the four target test files exist with their inline `MemoryStorage` shim blocks
- [ ] WP-065 complete; `apps/arena-client/src/testing/jsdom-setup.ts` exists as the canonical jsdom installer
- [ ] `pnpm --filter arena-client build` exits 0
- [ ] `pnpm --filter arena-client test` exits 0 with baseline `286 / 35 / 0`

## Locked Values (do not re-derive)
- JSDOM constructor URL (D-13601): `'http://localhost/'` (verbatim, including trailing slash)
- Storage key under test (unchanged from WP-130 D-13004): `'arenaClientPlaymatSkin'`
- Pre-WP-136 / Post-WP-136 test-baseline: `286 / 35 / 0` (preserved exactly — no test addition, no test deletion)
- Identifier rename target: every `memoryStorage.X` call site → `localStorage.X`; arguments and call shape preserved verbatim

## Guardrails
- The harness modification is bounded to: (a) one new JSDOM constructor argument (`{ url: 'http://localhost/' }`); (b) a `// why:` comment extension covering both the opaque-origin rationale and the `globalThis` bridge rationale; (c) two new `installGlobal()` calls bridging `dom.window.localStorage` and `dom.window.sessionStorage` onto `globalThis`, mirroring the established `installGlobal()` pattern verbatim. No other changes to `jsdom-setup.ts`. The bridge is load-bearing — without it, bare `localStorage` references in production code (`apps/arena-client/src/prefs/persistence.ts:58,80,83`) and tests resolve to `undefined` (`globalThis.window !== globalThis`).
- No `apps/arena-client/src/testing/` files other than `jsdom-setup.ts` may be modified
- No production code modification — `apps/arena-client/src/prefs/persistence.ts` reads bare `localStorage` and is byte-identical post-WP-136
- No `package.json` / `pnpm-lock.yaml` diff — `jsdom` already a devDep from WP-065
- No new exports from `jsdom-setup.ts` — it remains a side-effect-only module
- The four shim deletions are total: zero residual `class MemoryStorage` / `const memoryStorage` / `memoryStorage.` matches anywhere under `apps/arena-client/src/`
- Test count baseline is preserved exactly (no new `describe()` or `test()` blocks; no removals)
- Existing globals install in `jsdom-setup.ts` (window / document / HTMLElement / Element / Node / SVGElement / MathMLElement / navigator) preserved verbatim — do not reorder or remove

## Required `// why:` Comments
- `apps/arena-client/src/testing/jsdom-setup.ts` (extending existing block at lines 14-21): cover both rationales — (1) the `url: 'http://localhost/'` argument produces a non-opaque origin so `dom.window.localStorage` / `dom.window.sessionStorage` are real (cite WP-136 D-13601 + WHATWG Storage opaque-origin rule); (2) `globalThis.window !== globalThis`, JSDOM places `Storage` on `dom.window` only, and production code reads bare `localStorage`, so the two `installGlobal()` bridges are load-bearing for bare-reference resolution

## Files to Produce
- `apps/arena-client/src/testing/jsdom-setup.ts` — **modified** — JSDOM constructor gains `{ url: 'http://localhost/' }`; existing `// why:` block extended with opaque-origin + `globalThis` bridge rationales + WP-136 inscription; two new `installGlobal('localStorage', dom.window.localStorage)` / `installGlobal('sessionStorage', dom.window.sessionStorage)` calls appended after the existing `navigator` install
- `apps/arena-client/src/prefs/persistence.test.ts` — **modified** — shim block deleted (~35 lines); 4 `memoryStorage.X` → `localStorage.X` rename
- `apps/arena-client/src/prefs/playmatStore.test.ts` — **modified** — shim block deleted (~35 lines); 4 `memoryStorage.X` → `localStorage.X` rename
- `apps/arena-client/src/composables/useSkinApplier.test.ts` — **modified** — shim block deleted (~35 lines); 1 `memoryStorage.clear()` → `localStorage.clear()` rename
- `apps/arena-client/src/components/play/SkinSelector.test.ts` — **modified** — shim block deleted (~35 lines); 1 `memoryStorage.clear()` → `localStorage.clear()` rename

## After Completing
- [ ] `pnpm --filter arena-client build` exits 0
- [ ] `pnpm --filter arena-client test` exits 0 with baseline `286 / 35 / 0` preserved exactly
- [ ] Zero matches for `class MemoryStorage` / `const memoryStorage` / `memoryStorage\.` anywhere under `apps/arena-client/src/`
- [ ] Exactly 1 match for the literal `{ url: 'http://localhost/' }` in `apps/arena-client/src/testing/jsdom-setup.ts`
- [ ] `git diff --name-only` returns exactly the 5 files listed in `## Files to Produce`
- [ ] `git diff -- apps/server apps/registry-viewer apps/replay-producer packages/` returns no output
- [ ] `git diff -- apps/arena-client/package.json pnpm-lock.yaml` returns no output
- [ ] `docs/ai/STATUS.md` updated — `### WP-136 / EC-139 Executed` block prepended at top of `## Current State`
- [ ] `docs/ai/DECISIONS.md` updated — D-13601 inserted in numeric order (between D-13501..D-13503 and any later entry)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-136 row checked off with execution date and Commit A hash
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-139 row flipped Draft → Done with execution date

## Common Failure Smells
- `ReferenceError: localStorage is not defined` on every prefs/composables/components test means the two `installGlobal('localStorage', ...)` / `installGlobal('sessionStorage', ...)` bridge calls are missing from `jsdom-setup.ts` — bare `localStorage` resolves through `globalThis`, not `dom.window`, so the URL fix alone is insufficient (WP-136 mid-execution finding 2026-05-04)
- `ReferenceError: memoryStorage is not defined` from a test body usually means the rename pass missed a call site — re-grep `memoryStorage\.` and complete the renames
- `SecurityError: The operation is insecure` on first `localStorage` access usually means the JSDOM URL argument is malformed — verify the literal is `'http://localhost/'` with the trailing slash
- An unexpected test-count delta (not `286 / 35 / 0`) usually means a `describe()` or `test()` block was accidentally renamed, removed, or duplicated during the rename pass — `git diff --stat` should show `-`-only test-file deltas modulo the `localStorage` identifier substitution
- A lingering `MemoryStorage` import or symbol with no remaining call sites usually indicates the shim block was partially deleted — re-open the file and ensure the entire class declaration, the `const memoryStorage` line, and the `Object.defineProperty(globalThis, 'localStorage', …)` installer were removed together
- An aliased `localStorage.getItem(...)` return value held in a `const` across a subsequent `localStorage.setItem(...)` to the same key may surface as a stale-string read; both `MemoryStorage` (pre-WP-136) and WHATWG `Storage` (post-WP-136) return string copies, so this pattern was already correct under the shim — but if a test fails post-rename, grep the four test files for `getItem` immediately followed by reuse of the bound name and confirm no behavioral assumption changed
- A test passing in isolation but failing when the full suite runs usually means a test file is constructing its own `new JSDOM(...)` instance instead of consuming the shared `jsdom-setup.ts` side-effect import — grep the four target test files for `new JSDOM(` (expected count: zero) and remove any local instantiations
