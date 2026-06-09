# WP-226 — Dashboard Global Mock-Mode Banner (Instrumentation-Honesty Strip)

> **Status:** DRAFT — pending review (do not execute until reviewed per
> `.claude/rules/work-packets.md` Review Gate).
> **Reserves:** D-22601.
> **Paired EC:** EC-258 (drafted; pending review alongside this WP before execution).

---

## Goal

After this session, every page of the operator dashboard
(`dashboard.legendary-arena.com`) shows a single, prominent banner at the top
of the layout whenever the dashboard is **not** serving provably-live data —
i.e., whenever `isLiveModeEnabled()` is `false`. The banner states, in plain
language, that the numbers on screen are sample/mock data and tells the operator
exactly which two environment variables to set to go live. When the deploy is
fully live, the banner is absent from the DOM. This closes the
"random mock numbers look real" trust gap surfaced in the
`dashboard-operating-system.md` audit and is the binary precursor to the
doc's full **Instrumentation Health** widget (deferred — see Out of Scope).

This is an internal operator-only affordance. It is additive: no existing
widget, page, composable, or per-widget `MOCK`/`LIVE`/`BUILD` freshness badge
(WP-197) is removed, relocated, or restyled.

---

## Assumes

- **WP-206 complete** — `apps/dashboard/src/services/analyticsLiveFetchers.ts`
  exists and exports `isLiveModeEnabled(): boolean` (the D-20601 single-
  source-of-truth LIVE gate: `VITE_USE_MOCKS !== 'true'` AND `VITE_API_BASE_URL`
  is a non-empty string), plus the `__testHooks.setEnv()` test hook used by
  `analyticsLiveFetchers.test.ts` to drive the env truth table under
  `node --import tsx --test` (where `import.meta.env` is undefined).
- **WP-197 complete** — per-widget `MOCK`/`LIVE`/`BUILD` freshness badge posture
  (D-19702) is shipped; this WP does not touch it.
- `apps/dashboard/src/layouts/AppLayout.vue` exists and renders the routed page
  through `<main class="main-content">` (currently around line 188); the banner
  mounts immediately above that element so it appears on every route.
- The dashboard test harness is native `node:test` run via
  `node --import tsx --test "src/**/*.test.ts"` (the `test` script in
  `apps/dashboard/package.json`); no `@vue/test-utils`, Vitest, or Jest is
  available — composable/pure-logic tests only.
- No backend changes are required: the banner reads only the existing
  build-time env via the already-shipped `isLiveModeEnabled()` predicate.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §"Layer Boundary (Authoritative)" — confirm the
  dashboard is an `apps/*` client surface; this WP touches only
  `apps/dashboard/**` and imports nothing from `game-engine`, `registry`,
  `preplan`, or `server`.
- `.claude/rules/code-style.md` and `docs/ai/REFERENCE/00.6-code-style.md` —
  human-style code rules every produced file must satisfy.
- `apps/dashboard/src/services/analyticsLiveFetchers.ts` — read
  `isLiveModeEnabled()` and the surrounding D-20601 single-source-of-truth
  commentary before reusing the predicate.
- `apps/dashboard/src/layouts/AppLayout.vue` — the mount point.
- `apps/dashboard/docs/dashboard-operating-system.md` §"Instrumentation Health
  Indicator" — the design intent this WP partially realizes (binary form).
- `docs/ai/DECISIONS.md` — scan D-20601 (single-source LIVE gate) and D-19702
  (per-widget MOCK badge deploy posture) for related context before reserving
  D-22601.

---

## Scope (In)

- Add `apps/dashboard/src/composables/useMockModeIndicator.ts`: a composable that
  returns `{ isMockData: boolean; message: string }`, where
  `isMockData === !isLiveModeEnabled()` (predicate imported from
  `services/analyticsLiveFetchers.js` — never re-read from `import.meta.env`
  here) and `message` is the Locked Copy String.
- Add `apps/dashboard/src/composables/useMockModeIndicator.test.ts`: native
  `node:test` coverage of the visibility truth table and the locked message,
  driven through the existing `__testHooks.setEnv()` hook.
- Add `apps/dashboard/src/components/MockModeBanner.vue`: a presentational
  banner (sibling to the existing `components/VersionBadge.vue`) that renders
  only when `isMockData` is `true`, with an accessible `role="status"`.
- Modify `apps/dashboard/src/layouts/AppLayout.vue`: mount `<MockModeBanner />`
  immediately above `<main class="main-content">` so it shows on every route.
- Reserve D-22601 documenting the banner posture (predicate reuse, app-wide
  placement, non-dismissible v1, locked copy).

---

## Out of Scope

- **The full Instrumentation Health widget** (the operating-system doc's
  "X of Y metrics live / baseline / no-data" aggregate). This WP ships only the
  binary mock-vs-live banner; the per-metric breakdown is a separate, larger WP.
- **Unifying the two mock gates.** `apps/dashboard/src/services/endpoints.ts`
  has its own `isMockMode()` (`VITE_USE_MOCKS === 'true'`) distinct from
  `isLiveModeEnabled()`. They can disagree in the unset-`VITE_USE_MOCKS` +
  empty-URL edge case. Reconciling them is a follow-up; this WP does NOT modify
  `endpoints.ts` and deliberately keys the banner off the conservative
  `!isLiveModeEnabled()` ("warn unless provably live").
- **Per-widget freshness badges** (WP-197). Not added, removed, or restyled.
- **Dismissibility / per-session snooze.** v1 is non-dismissible by design
  (a persistent honesty indicator); a snooze affordance is deferred.
- **The deploy flip itself.** Setting `VITE_USE_MOCKS=false` +
  `VITE_API_BASE_URL` in Cloudflare Pages is a one-redeploy operator action,
  not a code change, and is not part of this WP.
- Any `apps/server`, `game-engine`, `registry`, or `preplan` edit.

---

## Files Expected to Change

- `apps/dashboard/src/composables/useMockModeIndicator.ts` — **new** —
  composable returning `{ isMockData: boolean; message: string }`;
  `isMockData = !isLiveModeEnabled()` (imported), `message` = Locked Copy String.
- `apps/dashboard/src/composables/useMockModeIndicator.test.ts` — **new** —
  `node:test` cases: shows when `VITE_USE_MOCKS='true'`; shows when
  `VITE_API_BASE_URL` empty/unset; hidden when both live conditions hold;
  `message` equals the locked string verbatim.
- `apps/dashboard/src/components/MockModeBanner.vue` — **new** — presentational
  banner; `v-if="isMockData"`, `role="status"`, renders `message`.
- `apps/dashboard/src/layouts/AppLayout.vue` — **modified** — add the
  `<MockModeBanner />` import and mount it immediately above
  `<main class="main-content">`. No other change to this file.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-226 with
  the Definition-of-Done summary line.
- `docs/ai/DECISIONS.md` — **modified** — add D-22601 (banner posture).
- `docs/ai/STATUS.md` — **modified** — record what changed this session.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip the
  EC-258 row Pending → Done.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Output the **full file contents** for every new or modified file. Diffs,
  snippets, and "show only the changed section" are forbidden.
- ESM only; Node v22+; no CommonJS, no `require()`.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (explicit control
  flow, descriptive names, JSDoc on every function, `// why:` on non-obvious
  decisions, full-sentence error messages).

**Packet-specific:**
- The banner's visibility predicate is `!isLiveModeEnabled()`, with
  `isLiveModeEnabled` **imported** from
  `apps/dashboard/src/services/analyticsLiveFetchers.js`. The new files MUST NOT
  contain any `import.meta.env` access — re-reading `VITE_USE_MOCKS` or
  `VITE_API_BASE_URL` here is a single-source-of-truth violation of D-20601.
- The banner is **non-dismissible** in v1 (no close button, no localStorage
  snooze).
- The banner mounts **once, app-wide** in `AppLayout.vue` (not per-page).
- `MockModeBanner.vue` is **presentational only** — the visibility/message logic
  lives in `useMockModeIndicator.ts`. No env reads, no fetch, no router logic in
  the component.
- No new npm dependencies. No `Math.random()` in the new files. No
  `apps/server`, `game-engine`, `registry`, or `preplan` imports.
- Additive only: `git diff --name-only` at close lists exactly the files in
  `## Files Expected to Change` and nothing else.

**Session protocol:**
- If any locked value, placement, or predicate is unclear or appears to
  conflict with `AppLayout.vue`'s actual structure, **stop and ask** — do not
  guess a different mount point or predicate.

**Locked Contract Values:**
- Predicate: `isMockData = !isLiveModeEnabled()` (from
  `services/analyticsLiveFetchers.ts`).
- Mount point: `AppLayout.vue`, immediately above `<main class="main-content">`.
- Dismissible: **NO** (v1).
- Accessibility: banner root carries `role="status"`.
- **Locked Copy String** (verbatim, single source = `useMockModeIndicator.ts`):
  `Mock data — this dashboard is showing sample metrics, not live data. To show real metrics, set VITE_USE_MOCKS=false and a valid VITE_API_BASE_URL in the deploy environment, then redeploy.`

---

## Vision Alignment

**N/A — justified.** This WP touches none of the §17.1 trigger surfaces: it adds
an internal operator-only admin affordance and engages no player-facing,
scoring, replay, RNG, identity, multiplayer, card-data, monetization, live-ops,
or public-registry surface. Accessibility for this internal banner is handled
via a semantic `role="status"` per `00.6`, but Vision §17 (player-facing
accessibility/i18n) is not engaged. No NG-1..7 is crossed — the banner is a
truth-in-data indicator, not a paid or persuasive surface; if anything it
protects operating integrity by preventing decisions on sample data.

## Funding Surface Gate

**N/A — justified.** No funding affordances, no "donate/support/tournament
funding" copy, and no funding-channel integration are added or referenced; this
WP adds only an internal mock-data indicator banner.

## API Catalog (§21)

**N/A — justified.** Client-only change: no HTTP endpoint is added, modified, or
removed, and no `apps/server/src/**` library function is touched. The banner
reads existing build-time env via the already-shipped `isLiveModeEnabled()`
predicate; `docs/ai/REFERENCE/api-endpoints.md` is unaffected.

---

## Lint Gate Self-Review

Run against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (§1–§21) on
2026-06-08. **Verdict: PASS** — all applicable sections satisfied; N/A
sections carry a named justification (no bare/tautological N/A); no Final
Gate FAIL condition (1–38) triggers.

- **§1 Structure** — PASS. All required sections present; `## Out of Scope`
  lists six explicit exclusions.
- **§2 Non-Negotiable Constraints** — PASS. Engine-wide block requires full
  file contents, forbids diffs/snippets, states ESM + Node v22+, and
  references `00.6-code-style.md`; packet-specific + session protocol +
  locked contract values all present.
- **§3 Assumes** — PASS. WP-206 (`isLiveModeEnabled` + `__testHooks.setEnv`),
  WP-197, the `AppLayout.vue` mount point, the `node:test`+`tsx` harness, and
  "no backend changes" each cite the source that locks them.
- **§4 Context** — PASS. ARCHITECTURE §Layer Boundary, the code-style rules,
  `analyticsLiveFetchers.ts`, `AppLayout.vue`, the operating-system doc, and
  DECISIONS (D-20601 / D-19702) are all cited specifically.
- **§5 Files Expected to Change** — PASS. Eight files, each `new`/`modified`
  with a one-line description; bounded; no patch-based output language.
- **§6 Naming** — PASS. `isLiveModeEnabled`, `VITE_USE_MOCKS`,
  `VITE_API_BASE_URL`, `MockModeBanner`, `useMockModeIndicator` match the
  shipped WP-206 surface and the Vite env names; no abbreviations.
- **§7 Dependency Discipline** — PASS. "No new npm dependencies" stated;
  browser + Vue composable only; no forbidden package reachable.
- **§8 Architectural Boundaries** — PASS. Client-only (`apps/dashboard/**`);
  no engine/registry/server/preplan import; no game logic; LIVE gate read
  via the imported predicate, never raw env.
- **§9 Windows Compatibility** — PASS. Verification uses `pnpm --filter` +
  `grep` (Git Bash); no Unix-only assumption in scope.
- **§10 Env Var Hygiene** — N/A — justified. No new env vars introduced;
  `VITE_USE_MOCKS` / `VITE_API_BASE_URL` pre-exist (WP-197 / WP-206) and
  appear in the copy string as operator guidance only, never read here.
- **§11 Authentication** — N/A — justified. WP touches no auth surface.
- **§12 Test Quality** — PASS. `node:test` via `tsx`; ≥ 4 cases; driven by
  the imported `__testHooks.setEnv()`; no boardgame.io import, no network/DB.
- **§13 Verification Steps** — PASS. Seven exact steps with expected output
  (`pnpm --filter` test/typecheck/build + three greps + `git diff`).
- **§14 Acceptance Criteria** — PASS. Eleven binary, observable, file/symbol-
  specific checks aligned to the deliverables.
- **§15 Definition of Done** — PASS. Includes AC-pass, STATUS, DECISIONS,
  WORK_INDEX, EC_INDEX, and the scope-boundary check.
- **§16 Code Style** — PASS. WP mandates 00.6 human-style code, JSDoc, and
  `// why:` on non-obvious decisions; three small single-responsibility
  files, no premature abstraction.
- **§17 Vision Alignment** — PASS. `## Vision Alignment` present with a
  reasoned N/A (internal operator-only affordance; no NG-1..7 surface; no
  scoring/replay/RNG; clause-cited).
- **§18 Prose-vs-Grep Discipline** — PASS. The single-source grep targets
  `import.meta.env`; the copy string names `VITE_USE_MOCKS` /
  `VITE_API_BASE_URL` only as guidance prose and does not match that grep —
  called out in Verification Step 4 and the EC.
- **§19 Bridge-vs-HEAD Staleness** — N/A — justified. Not a
  repo-state-summarizing artifact; §19 is commit-time discipline, not a
  WP-lint Final-Gate condition.
- **§20 Funding Surface Gate** — PASS. `## Funding Surface Gate` present with
  a reasoned N/A (no funding affordances or copy).
- **§21 API Catalog** — PASS. `## API Catalog (§21)` present with a reasoned
  N/A (client-only; no HTTP endpoint or `apps/server/src/**` library
  function touched).

---

## Acceptance Criteria

1. `apps/dashboard/src/composables/useMockModeIndicator.ts` exists and exports
   `useMockModeIndicator()` returning an object with exactly `isMockData:
   boolean` and `message: string`.
2. `useMockModeIndicator.ts` imports `isLiveModeEnabled` from
   `'../services/analyticsLiveFetchers.js'` and computes
   `isMockData = !isLiveModeEnabled()`; it contains **zero** `import.meta.env`
   references (single-source-of-truth per D-20601/D-22601).
3. `message` equals the Locked Copy String byte-for-byte.
4. `apps/dashboard/src/components/MockModeBanner.vue` renders its root element
   with `v-if="isMockData"` and `role="status"`; when `isMockData` is `false`
   the banner root is not rendered.
5. `apps/dashboard/src/layouts/AppLayout.vue` imports and mounts
   `<MockModeBanner />` on the line immediately above
   `<main class="main-content">`; no other line of `AppLayout.vue` changes.
6. `useMockModeIndicator.test.ts` contains ≥4 `node:test` cases following the
   `should_<behavior>_when_<condition>` naming: visible when
   `VITE_USE_MOCKS='true'`; visible when `VITE_API_BASE_URL` is empty/unset;
   hidden when `VITE_USE_MOCKS!=='true'` AND `VITE_API_BASE_URL` is non-empty;
   `message` equals the locked string.
7. `pnpm --filter @legendary-arena/dashboard test` passes; the total test count
   increases by the net-new cases (no prior test regresses).
8. `pnpm --filter @legendary-arena/dashboard typecheck` exits 0.
9. `pnpm --filter @legendary-arena/dashboard build` exits 0.
10. `git diff --name-only` lists only the eight files in
    `## Files Expected to Change` (the four source files +
    `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`) — no
    other widget, page, or composable is modified.
11. The Locked Copy String is defined once, in `useMockModeIndicator.ts`, as the
    single source of the banner message text; `MockModeBanner.vue` renders the
    composable's `message` and does not duplicate or re-type the copy.

---

## Verification Steps

1. Run the dashboard tests:
   `pnpm --filter @legendary-arena/dashboard test`
   Expected: all tests pass, `fail 0`; the suite includes the net-new
   `useMockModeIndicator` cases and no pre-existing test regresses.
2. Typecheck:
   `pnpm --filter @legendary-arena/dashboard typecheck`
   Expected: exits 0, no output errors.
3. Build:
   `pnpm --filter @legendary-arena/dashboard build`
   Expected: `✓ built` and exit 0.
4. Single-source-of-truth gate — confirm the new files never re-read env
   directly:
   `grep -rn "import.meta.env" apps/dashboard/src/composables/useMockModeIndicator.ts apps/dashboard/src/composables/useMockModeIndicator.test.ts apps/dashboard/src/components/MockModeBanner.vue`
   Expected: **zero** matches. (The Locked Copy String names `VITE_USE_MOCKS` /
   `VITE_API_BASE_URL` as operator guidance, not as env access; this grep
   targets `import.meta.env` access only, so the copy string does not match —
   §18 prose-vs-grep discipline holds; the env tokens are governed by D-20601.
   The test drives env through the imported `__testHooks.setEnv()`, not
   `import.meta.env`, so it is in scope of this gate.)
5. Conservative-gate check — the new files use only the imported
   `isLiveModeEnabled()` gate, never `endpoints.ts` `isMockMode()`:
   `grep -rnE "isMockMode|endpoints" apps/dashboard/src/composables/useMockModeIndicator.ts apps/dashboard/src/composables/useMockModeIndicator.test.ts apps/dashboard/src/components/MockModeBanner.vue`
   Expected: **zero** matches.
6. Mount-point check (presence + adjacency):
   `grep -nE 'MockModeBanner|main class="main-content"' apps/dashboard/src/layouts/AppLayout.vue`
   Expected: one import line, one `<MockModeBanner />` usage line, and the
   `<main class="main-content">` line immediately following that usage line
   (adjacent line numbers — the banner sits directly above `<main>`).
7. Additive scope:
   `git diff --name-only`
   Expected: exactly the eight `## Files Expected to Change` paths.

---

## Definition of Done

- [ ] All Acceptance Criteria (1–11) pass.
- [ ] `docs/ai/STATUS.md` updated with what changed this session.
- [ ] `docs/ai/DECISIONS.md` updated with **D-22601** (banner posture: predicate
      reuse, app-wide placement, non-dismissible v1, locked copy).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-226 row checked off with the
      Definition-of-Done summary line.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-258 row flipped
      Pending → Done.
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only` confirms).
- [ ] Paired EC-258 satisfied (locked values transcribed and checked).
