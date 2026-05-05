# WP-136 — Fix JSDOM Opaque-Origin in arena-client Test Harness

**Status:** Ready
**Primary Layer:** Client UI / Test Harness (`apps/arena-client/src/testing/`)
**Dependencies:** WP-065 (vue-sfc-loader test driver — original `jsdom-setup.ts` precedent); WP-130 (introduced the four inline `MemoryStorage` shims this packet removes)

---

## Session Context

WP-130 / EC-133 introduced four identical inline `MemoryStorage` shims because `apps/arena-client/src/testing/jsdom-setup.ts` was outside the WP-130 modify allowlist. This packet fixes the root cause in the test harness, then retires those shims in a single sweep, preserving the original WP-130 correctness while eliminating the duplication (allowlist restriction → shim duplication → harness fix).

---

## Goal

Ensure `apps/arena-client/src/testing/jsdom-setup.ts` produces a **non-opaque
origin window** AND bridges `localStorage` / `sessionStorage` onto
`globalThis`, so any arena-client test importing the harness can read **bare
`localStorage`** and **bare `sessionStorage`** (the call shape used by
production code in `apps/arena-client/src/prefs/persistence.ts`) with **no
per-test shim, no boilerplate, and no abstraction layer**. The bridge is
load-bearing — `globalThis.window !== globalThis`, and JSDOM places `Storage`
only on `dom.window`; without the explicit bridge, bare references resolve
to `undefined`.

The four WP-130 inline `MemoryStorage` shim copies are deleted in the same
execution. All existing call sites collapse from `memoryStorage.X` to
`localStorage.X` with no behavioral change.

After WP-136, any future arena-client test that depends on `Storage` simply
imports `jsdom-setup` and uses the native API.

---

## Assumes

- WP-130 / EC-133 complete. Specifically:
  - `apps/arena-client/src/prefs/persistence.test.ts` exists with the inline `MemoryStorage` shim block
  - `apps/arena-client/src/prefs/playmatStore.test.ts` exists with the inline `MemoryStorage` shim block
  - `apps/arena-client/src/composables/useSkinApplier.test.ts` exists with the inline `MemoryStorage` shim block
  - `apps/arena-client/src/components/play/SkinSelector.test.ts` exists with the inline `MemoryStorage` shim block
- WP-065 complete. Specifically:
  - `apps/arena-client/src/testing/jsdom-setup.ts` exists and is the canonical jsdom installer for arena-client component tests
- `pnpm --filter arena-client test` exits 0 on `main` HEAD before this WP starts (baseline `286 / 35 / 0` per WP-130 closeout)
- `pnpm --filter arena-client build` exits 0 on `main` HEAD
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms `apps/arena-client` may import test-only tooling (`jsdom`) at devDep tier; the harness file lives entirely under the test-tier boundary.
- `apps/arena-client/src/testing/jsdom-setup.ts` — the file modified by this WP. Read it entirely before editing; the `// why:` comment block at the top encodes the WP-065 navigator-getter and SVG/MathML probe rationale and must not be lost.
- `apps/arena-client/src/prefs/persistence.test.ts` — read the shim block (lines 6-40) plus every `memoryStorage.X` call site in the test bodies; the same shape repeats in the other three target test files.
- `apps/arena-client/src/prefs/persistence.ts` — production code under test; it reads bare `localStorage`. Confirms the production contract this WP defends against regression.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error messages), Rule 13 (ESM only), the *duplicate first* rule (the four shim copies were correct under WP-130's allowlist; this WP retires that duplication at the source per the same rule's "abstract only when a third copy appears" guidance — four copies clears that bar).
- `docs/ai/STATUS.md §WP-130 / EC-133 Executed §Test-harness mid-execution amendment` — original rationale for the four shim copies plus the explicit hand-off note that the JSDOM opaque-origin issue should be retired by a future harness fix (this WP).
- WHATWG Storage spec note (informational): an opaque origin (e.g., `about:blank`) withholds `window.{localStorage,sessionStorage}`, surfacing as `SecurityError` on access. Passing a non-opaque URL (`http://localhost/`) to the JSDOM constructor produces a non-opaque origin document with full `Storage` access.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — N/A here (no engine code touched)
- Never throw inside boardgame.io move functions — N/A here (no move code touched)
- Never persist `G`, `ctx`, or any runtime state — N/A here (no engine state surface touched)
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports
- Test files use `.test.ts` extension — never `.test.mjs`
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- The JSDOM constructor URL is locked at `'http://localhost/'` — do not vary the host, port, protocol, or trailing slash. This value is chosen because it produces a stable, non-opaque origin under WHATWG Storage rules and is guaranteed not to collide with production identity or cookie scope (see D-13601).
- The harness modification is bounded to: (a) one new JSDOM constructor argument (`{ url: 'http://localhost/' }`); (b) a `// why:` comment extension covering both the opaque-origin rationale and the `globalThis` bridge rationale; (c) two new `installGlobal()` calls bridging `dom.window.localStorage` and `dom.window.sessionStorage` onto `globalThis`, mirroring the existing pattern at lines 32-46 verbatim. No other changes to `jsdom-setup.ts`. The bridge is load-bearing — without it, bare `localStorage` references in production code (`apps/arena-client/src/prefs/persistence.ts`) and tests resolve to `undefined` because `globalThis.window !== globalThis` and JSDOM places `Storage` only on `dom.window`.
- The four target test files lose their `// why:` shim-rationale comment block, the `class MemoryStorage` declaration, the `const memoryStorage = new MemoryStorage()` line, and the `Object.defineProperty(globalThis, 'localStorage', …)` install. Net deletion per file: ~35 lines.
- Every `memoryStorage.X` call site in the four test bodies becomes `localStorage.X` verbatim (only the identifier changes; arguments and call shape are preserved).
- No `apps/arena-client/src/testing/` files other than `jsdom-setup.ts` may be modified.
- No production code under `apps/arena-client/src/{prefs,composables,components}/` may be modified — production `persistence.ts` reads bare `localStorage` and is byte-identical post-WP-136.
- No `package.json` or `pnpm-lock.yaml` modification — `jsdom` is already a devDep from WP-065.
- No new exports from `jsdom-setup.ts` — it remains a side-effect-only module.

**Session protocol:**
- If any test still depends on `memoryStorage` after the rename pass, stop and re-grep — the rename is mechanical and total.

**Locked contract values (inline the relevant ones):**

- **JSDOM constructor URL (D-13601):** `'http://localhost/'` (verbatim, including trailing slash)
- **Storage key under test (unchanged from WP-130):** `'arenaClientPlaymatSkin'` per `apps/arena-client/src/prefs/persistence.ts §STORAGE_KEY`

---

## Debuggability & Diagnostics

This packet introduces no runtime behavior — `jsdom-setup.ts` runs only in
`pnpm --filter arena-client test`, never in a production bundle. Vite's
build pipeline excludes `src/**/*.test.ts` and `src/testing/` from
production output (verified by inspection of `vite.config.ts` test glob).

The change is fully reproducible: the same JSDOM constructor argument
yields the same non-opaque origin window across every Node v22+ run.
Failure modes are localizable: any test that breaks post-rename will
emit `ReferenceError: memoryStorage is not defined` (caught by step 2 of
verification), or — if the harness URL is wrong — `SecurityError: The
operation is insecure` on the first `localStorage` access (caught by
step 2 of verification).

---

## Scope (In)

### A) Harness fix (`apps/arena-client/src/testing/jsdom-setup.ts`)

- **`apps/arena-client/src/testing/jsdom-setup.ts`** — modified:
  - Change line 22 from `const dom = new JSDOM('<!doctype html><html><body></body></html>');`
    to `const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });`
  - Extend the existing `// why:` comment block (currently lines 14-21) so it
    covers both the opaque-origin rationale (the `url` argument produces a
    non-opaque origin so `dom.window.localStorage` and
    `dom.window.sessionStorage` are real) and the `globalThis` bridge
    rationale (production code reads bare `localStorage` and resolves
    through `globalThis`, not through `dom.window`; without the bridge the
    URL fix alone leaves bare references unresolved). Cite WP-136 D-13601
    for the URL literal lock.
  - Append two new `installGlobal()` calls after the existing `navigator`
    install (mirroring the established pattern verbatim):
    `installGlobal('localStorage', dom.window.localStorage);`
    `installGlobal('sessionStorage', dom.window.sessionStorage);`
  - No other change in this file. Existing globals installation (window /
    document / HTMLElement / Element / Node / SVGElement / MathMLElement /
    navigator) is preserved verbatim and is followed by the two new
    Storage installs at the bottom of the install block.

### B) Shim removal (4 test files)

For each of the four target test files, delete:
- The `// why:` comment block citing the opaque-origin shim rationale (varies in length per file: 7-13 lines).
- The `class MemoryStorage implements Storage { … }` declaration (~22 lines).
- The `const memoryStorage = new MemoryStorage();` line.
- The `Object.defineProperty(globalThis, 'localStorage', { … });` install (~5 lines).
- Total deletion per file: ~35 lines.

Then replace every `memoryStorage.X` call site with `localStorage.X`:
- **`apps/arena-client/src/prefs/persistence.test.ts`** — modified — 4 sites: 1× `clear`, 1× `setItem`, 2× `getItem`
- **`apps/arena-client/src/prefs/playmatStore.test.ts`** — modified — 4 sites: 1× `clear`, 2× `setItem`, 1× `getItem`
- **`apps/arena-client/src/composables/useSkinApplier.test.ts`** — modified — 1 site: 1× `clear`
- **`apps/arena-client/src/components/play/SkinSelector.test.ts`** — modified — 1 site: 1× `clear`

After replacement, the four files import `jsdom-setup` first (as before),
then go straight from `import` block to `describe(...)` with no shim
boilerplate in between.

### C) Tests

No new tests. The four existing test files continue to exercise the same
production contracts (`loadActiveSkin` / `saveActiveSkin` / `usePlaymat` /
`useSkinApplier` / `<SkinSelector>`); they simply use the real
`localStorage` provided by the fixed harness instead of the shim. Test
counts pre-WP-136 = post-WP-136 (`286 / 35 / 0` baseline preserved
exactly — no test addition, no test deletion, no `describe()` block
boundary change).

---

## Out of Scope

- No production code changes — `apps/arena-client/src/{prefs,composables,components,pages,stores,client}/` files are byte-identical post-WP-136 except for the four `.test.ts` files explicitly listed above.
- No registry-viewer changes — `apps/registry-viewer/src/composables/{useCardSize,useThemeSize}.ts` keep their own corruption-safe `localStorage` posture (different harness, no jsdom).
- No engine, server, registry, preplan, or replay-producer changes — zero `packages/`, `apps/server/`, `apps/registry-viewer/`, `apps/replay-producer/` diff.
- No new harness exports — `jsdom-setup` remains side-effect-only.
- No `package.json` / `pnpm-lock.yaml` modification — `jsdom` already a devDep.
- No relocation of the harness file — `apps/arena-client/src/testing/jsdom-setup.ts` keeps its current path.
- No abstraction of a shared `MemoryStorage` helper — the shim deletes are total; nothing remains to share.
- Refactors, cleanups, or "while I'm here" improvements are out of scope unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `apps/arena-client/src/testing/jsdom-setup.ts` — **modified** — JSDOM constructor gains `{ url: 'http://localhost/' }`; `// why:` comment extended.
- `apps/arena-client/src/prefs/persistence.test.ts` — **modified** — shim block deleted; 4 `memoryStorage.X` → `localStorage.X` rename.
- `apps/arena-client/src/prefs/playmatStore.test.ts` — **modified** — shim block deleted; 4 `memoryStorage.X` → `localStorage.X` rename.
- `apps/arena-client/src/composables/useSkinApplier.test.ts` — **modified** — shim block deleted; 1 `memoryStorage.X` → `localStorage.X` rename.
- `apps/arena-client/src/components/play/SkinSelector.test.ts` — **modified** — shim block deleted; 1 `memoryStorage.X` → `localStorage.X` rename.

No other files may be modified.

---

## Acceptance Criteria

### A) Harness fix
- [ ] `apps/arena-client/src/testing/jsdom-setup.ts` has exactly one match for the literal `{ url: 'http://localhost/' }` (confirmed with grep).
- [ ] `apps/arena-client/src/testing/jsdom-setup.ts` contains an extended `// why:` comment block that explicitly states:
  - JSDOM defaults to an opaque origin
  - opaque origins withhold `window.localStorage` / `window.sessionStorage`
  - passing `{ url: 'http://localhost/' }` produces a non-opaque origin
  - the URL literal is locked by WP-136 D-13601
  - `globalThis.window !== globalThis`; JSDOM places `Storage` on `dom.window` only, so the two `installGlobal('localStorage', ...)` / `installGlobal('sessionStorage', ...)` calls bridge them onto `globalThis` for bare-reference resolution
- [ ] `apps/arena-client/src/testing/jsdom-setup.ts` contains exactly one `installGlobal('localStorage', dom.window.localStorage);` line and exactly one `installGlobal('sessionStorage', dom.window.sessionStorage);` line, both placed after the existing `navigator` install.
- [ ] Existing globals install (window / document / HTMLElement / Element / Node / SVGElement / MathMLElement / navigator) preserved verbatim.

### B) Shim removal
- [ ] Zero matches for `class MemoryStorage` across `apps/arena-client/src/`.
- [ ] Zero matches for `const memoryStorage` across `apps/arena-client/src/`.
- [ ] Zero matches for `memoryStorage.` across `apps/arena-client/src/`.
- [ ] `apps/arena-client/src/prefs/persistence.test.ts`, `playmatStore.test.ts`, `useSkinApplier.test.ts`, and `SkinSelector.test.ts` each carry the `import '../testing/jsdom-setup'` (or `'../../testing/jsdom-setup'` for nested paths) line at exactly one position — line 1 of the file.

### Tests
- [ ] `pnpm --filter arena-client test` exits 0 with `286 / 35 / 0` (pre-WP-136 baseline preserved exactly).
- [ ] `pnpm --filter arena-client build` exits 0 (no TypeScript errors).
- [ ] No `.test.mjs` files introduced.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`).
- [ ] No `apps/server/` / `apps/registry-viewer/` / `apps/replay-producer/` / `packages/` diff.
- [ ] No `package.json` / `pnpm-lock.yaml` diff.

---

## Verification Steps

```bash
# Step 1 — build
pnpm --filter arena-client build
# Expected: exits 0, no TypeScript errors

# Step 2 — full test run
pnpm --filter arena-client test
# Expected: 286 / 35 / 0 (pre-WP-136 baseline preserved exactly)

# Step 3 — confirm harness URL constant
grep -F "{ url: 'http://localhost/' }" apps/arena-client/src/testing/jsdom-setup.ts
# Expected: 1 match

# Step 4 — confirm zero residual shim references
grep -rE "class MemoryStorage|const memoryStorage|memoryStorage\." apps/arena-client/src/
# Expected: no output

# Step 5 — confirm scope
git diff --name-only
# Expected: only the 5 files listed in ## Files Expected to Change

# Step 6 — confirm no production drift
git diff -- apps/arena-client/src/prefs/persistence.ts apps/arena-client/src/prefs/playmatStore.ts apps/arena-client/src/prefs/playmatSchema.ts apps/arena-client/src/prefs/skinManifest.ts apps/arena-client/src/composables/useSkinApplier.ts apps/arena-client/src/components/play/SkinSelector.vue
# Expected: no output

# Step 7 — confirm no package manifest churn
git diff -- apps/arena-client/package.json pnpm-lock.yaml
# Expected: no output
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

**Code, tests, and invariants:**

- [ ] All acceptance criteria above pass.
- [ ] `pnpm --filter arena-client build` exits 0.
- [ ] `pnpm --filter arena-client test` exits 0 with baseline `286 / 35 / 0` preserved exactly.
- [ ] `apps/arena-client/src/testing/jsdom-setup.ts` carries the locked URL `'http://localhost/'` and an updated `// why:` comment block citing WP-136 D-13601.
- [ ] Zero matches for `class MemoryStorage` / `const memoryStorage` / `memoryStorage.` anywhere under `apps/arena-client/src/`.
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).

**Documentation & indices:**

- [ ] `docs/ai/STATUS.md` updated — what the harness can do that it could not before.
- [ ] `docs/ai/DECISIONS.md` updated — D-13601 (JSDOM constructor URL = `'http://localhost/'`) inserted in numeric order.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-136 checked off with today's date and Commit A hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-139 row flipped Draft → Done with today's date.

---

## Vision Alignment

**N/A.** Test-harness only. The change touches no §17.1 trigger surface
(no scoring / replay / identity / multiplayer / determinism / card data /
monetization / live-ops / accessibility / registry-viewer surface). The
fix changes only the test runner's window construction and propagates
mechanical renames in test files; it does not alter any vision-bearing
production behavior, contract, or projection.

---

## Funding Surface Gate

**N/A.** No `apps/arena-client/` UI surface or copy is touched (only
test files); no funding surface exposed; no purchase / subscription /
unlock surface introduced.

---

## API Catalog Update

**N/A.** No `apps/server/**` HTTP endpoint added, modified, removed, or
re-statused; no `apps/server/src/**` library function added or modified
or re-statused. Test-harness scope only.
