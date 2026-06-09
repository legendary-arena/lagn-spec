# EC-258 — Dashboard Global Mock-Mode Banner (Execution Checklist)

**Source:** docs/ai/work-packets/WP-226-dashboard-mock-mode-banner.md
**Layer:** Dashboard — `apps/dashboard/src/composables/useMockModeIndicator.{ts,test.ts}` (new) + `apps/dashboard/src/components/MockModeBanner.vue` (new) + `apps/dashboard/src/layouts/AppLayout.vue` (modified — 1 import + 1 mount line)

> Use locked values from WP-226 verbatim. EC-258 is the operational
> order + gates + failure smells; if EC-258 and WP-226 conflict, WP-226
> wins.

## Before Starting
- [ ] **WP-206 landed** — `isLiveModeEnabled()` exported from
  `apps/dashboard/src/services/analyticsLiveFetchers.ts` (≈ line 133) +
  `__testHooks.setEnv()` (≈ line 202). Verify:
  `grep -nE "export function isLiveModeEnabled|setEnv" apps/dashboard/src/services/analyticsLiveFetchers.ts`
  returns ≥ 2.
- [ ] **WP-197 landed** — per-widget MOCK/LIVE/BUILD freshness badge
  (D-19702); this WP does NOT touch it.
- [ ] `apps/dashboard/src/layouts/AppLayout.vue` renders
  `<main class="main-content">` (≈ line 189) — the banner mounts
  immediately above it. Verify:
  `grep -n "main-content" apps/dashboard/src/layouts/AppLayout.vue`.
- [ ] Read WP-226 §Goal, §Non-Negotiable Constraints, §Acceptance
  Criteria — those sections are authoritative.
- [ ] Read `apps/dashboard/src/components/VersionBadge.vue` — the
  presentational sibling whose shape `MockModeBanner.vue` mirrors.
- [ ] `pnpm --filter @legendary-arena/dashboard test` + `typecheck` +
  `build` exit 0 (anchor the baseline dashboard test count).

## Locked Values (verbatim from WP-226 — do not re-derive)
- **Predicate:** `isMockData = !isLiveModeEnabled()`; `isLiveModeEnabled`
  IMPORTED from `'../services/analyticsLiveFetchers.js'`. No
  `import.meta.env` access in the new files.
- **Mount point:** `AppLayout.vue`, immediately above
  `<main class="main-content">` — one import line + one
  `<MockModeBanner />` usage line; no other line of the file changes.
- **Dismissible:** NO (v1) — no close button, no localStorage snooze.
- **Accessibility:** banner root carries `role="status"`.
- **Composable shape:** `useMockModeIndicator()` returns exactly
  `{ isMockData: boolean; message: string }`.
- **Locked Copy String** (single source = `useMockModeIndicator.ts`;
  byte-for-byte, em-dash included):
  `Mock data — this dashboard is showing sample metrics, not live data. To show real metrics, set VITE_USE_MOCKS=false and a valid VITE_API_BASE_URL in the deploy environment, then redeploy.`

## Guardrails
- **Single-source-of-truth (D-20601 / D-22601).** The new files contain
  ZERO `import.meta.env`; the LIVE gate is read only via the imported
  `isLiveModeEnabled()`. Re-reading `VITE_USE_MOCKS` /
  `VITE_API_BASE_URL` from env here = HARD FAIL.
- **Conservative gate.** Visibility is `!isLiveModeEnabled()` ("warn
  unless provably live"). Do NOT key off `endpoints.ts` `isMockMode()`;
  do NOT modify `endpoints.ts`.
- **Presentational-only component.** `MockModeBanner.vue` has no env
  reads, no fetch, no router logic — visibility + message come from
  `useMockModeIndicator()`. Logic in the component = HARD FAIL.
- **App-wide single mount.** The banner mounts once in `AppLayout.vue`,
  not per-page.
- **Additive only.** No existing widget, page, composable, or WP-197
  freshness badge is removed, relocated, or restyled.
- **No new npm deps; no `Math.random`; no
  `@legendary-arena/(game-engine|registry|preplan|server)` imports.**
- **Full file contents** for every new/modified file — diffs/snippets
  forbidden.
- **Test naming `should_<behavior>_when_<condition>`;** ≥ 4 cases driven
  via the imported `__testHooks.setEnv()`.

## Required `// why:` Comments
- `useMockModeIndicator.ts` — `// why:` the banner keys off the
  conservative `!isLiveModeEnabled()` gate and imports the single-source
  predicate rather than re-reading env or reusing `endpoints.ts`
  `isMockMode()` (D-20601 / D-22601; the two gates can disagree in the
  unset-`VITE_USE_MOCKS` + empty-URL edge case).
- `useMockModeIndicator.ts` — `// why:` the message names the env-var
  tokens as operator-guidance prose only (not env access); the SSoT
  grep targets `import.meta.env`, so the copy string does not trip it
  (EC-TEMPLATE grep-gate prose discipline).

> `AppLayout.vue` carries **no** `// why:` comment by design — its
> contract is one import line + one mount line, with no other line
> changing (WP §Locked Contract Values + AC #5). Adding a comment there
> would break the strict minimal-diff gate. The app-wide-mount rationale
> lives in D-22601 + the WP, not inline in the shared layout. Do not
> "helpfully" add a comment to `AppLayout.vue`.

## Files to Produce
- `apps/dashboard/src/composables/useMockModeIndicator.ts` — **new** —
  returns `{ isMockData, message }`; `isMockData = !isLiveModeEnabled()`
  (imported), `message` = Locked Copy String.
- `apps/dashboard/src/composables/useMockModeIndicator.test.ts` —
  **new** — ≥ 4 `node:test` cases via `__testHooks.setEnv()` (visible
  when `VITE_USE_MOCKS='true'`; visible when `VITE_API_BASE_URL`
  empty/unset; hidden when both live conditions hold; `message` equals
  the locked string).
- `apps/dashboard/src/components/MockModeBanner.vue` — **new** —
  presentational; `v-if="isMockData"`, `role="status"`, renders
  `message`.
- `apps/dashboard/src/layouts/AppLayout.vue` — **modified** — add the
  `<MockModeBanner />` import + mount above `<main class="main-content">`;
  no other change.
- `docs/ai/STATUS.md` — **modified** — `### WP-226 / EC-258 Executed`
  block.
- `docs/ai/DECISIONS.md` — **modified** — D-22601 (proposed → Active
  byte-identical to §DECISIONS.md Verbatim Block below).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-226 `[x]`
  with the DoD summary line.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip the
  EC-258 row Pending → Done.

**Total: 8 files** (3 new + 1 modified source + 4 governance:
`STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`), per
WP-226 §Files Expected to Change. The allowlist was corrected to 8 at
draft review — `EC_INDEX.md` is in scope so the EC-258 Pending → Done
flip is covered and AC #10's `git diff` gate stays consistent.

## After Completing
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0; the suite
  includes the net-new `useMockModeIndicator` cases and no pre-existing
  test regresses.
- [ ] `pnpm --filter @legendary-arena/dashboard typecheck` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0.
- [ ] SSoT grep (all three new files):
  `grep -rn "import.meta.env" apps/dashboard/src/composables/useMockModeIndicator.ts apps/dashboard/src/composables/useMockModeIndicator.test.ts apps/dashboard/src/components/MockModeBanner.vue`
  returns 0. (Targets `import.meta.env` only — the copy string's
  env-var names do NOT match; the test drives env via the imported
  `__testHooks.setEnv()`.)
- [ ] Conservative-gate grep (no `endpoints.ts` / `isMockMode()` reuse):
  `grep -rnE "isMockMode|endpoints" apps/dashboard/src/composables/useMockModeIndicator.ts apps/dashboard/src/composables/useMockModeIndicator.test.ts apps/dashboard/src/components/MockModeBanner.vue`
  returns 0.
- [ ] Mount grep (presence + adjacency):
  `grep -nE 'MockModeBanner|main class="main-content"' apps/dashboard/src/layouts/AppLayout.vue`
  returns one import line + one `<MockModeBanner />` usage line, with the
  `<main class="main-content">` line immediately following the usage line
  (adjacent line numbers).
- [ ] Locked-copy check: the `message` in `useMockModeIndicator.ts`
  matches the Locked Copy String byte-for-byte.
- [ ] Additive scope: `git diff --name-only` lists exactly the WP's 8
  files (§Files to Produce).
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-22601 Active
  byte-identical to §Verbatim Block; `WORK_INDEX.md` WP-226 `[x]`;
  `EC_INDEX.md` EC-258 → Done.

## Common Failure Smells
- `import.meta.env` in any of the three new files → single-source-of-truth
  (D-20601 / D-22601) HARD FAIL.
- Banner renders when `isMockData` is `false` → missing `v-if`.
- Copy-string drift (re-typed em-dash, punctuation, or token) → not
  copied verbatim from §Locked Values.
- Env-var check or `isMockMode()` reuse inside the new files →
  conservative-gate / SSoT violation.
- `isLiveModeEnabled` imported without the `.js` extension → ESM
  resolution fail under `tsx` + Vite.
- Visibility/message logic placed in `MockModeBanner.vue` rather than the
  composable → presentational-only violation.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> Per PS-1 convention (mirrors WP-206 / EC-234 precedent in this
> dashboard family): the D-22601 entry lands in `docs/ai/DECISIONS.md`
> at the execution-close governance commit byte-identical to the block
> below. Status flips from `Reserved (proposed)` at draft time to
> `Active` at landing; no other field changes.

### D-22601 — Dashboard Global Mock-Mode Banner Posture: Predicate Reuse, App-Wide Single Mount, Non-Dismissible v1, Locked Copy

**Decision:**
The operator dashboard renders a single global banner at the top of
`AppLayout.vue` (immediately above `<main class="main-content">`, so it
appears on every route) whenever the dashboard is not provably serving
live data. Visibility is `isMockData = !isLiveModeEnabled()`, where
`isLiveModeEnabled` is IMPORTED from
`apps/dashboard/src/services/analyticsLiveFetchers.ts` (the D-20601
single-source-of-truth LIVE gate). The banner's composable
(`useMockModeIndicator.ts`) and component (`MockModeBanner.vue`) contain
ZERO `import.meta.env` access — the env truth is read only through the
shared predicate. The conservative `!isLiveModeEnabled()` gate ("warn
unless provably live") is deliberately chosen over `endpoints.ts`
`isMockMode()` (`VITE_USE_MOCKS === 'true'`); the two can disagree in
the unset-`VITE_USE_MOCKS` + empty-URL edge case, and reconciling them
is a deferred follow-up.

`MockModeBanner.vue` is presentational only (`v-if="isMockData"`,
`role="status"`, renders the message); all visibility/message logic
lives in the composable. The banner is non-dismissible in v1 — no close
button, no per-session snooze — because it is a persistent
instrumentation-honesty indicator. The message is a single locked copy
string sourced only from `useMockModeIndicator.ts`:
`Mock data — this dashboard is showing sample metrics, not live data. To show real metrics, set VITE_USE_MOCKS=false and a valid VITE_API_BASE_URL in the deploy environment, then redeploy.`

This ships the binary mock-vs-live form of the
`dashboard-operating-system.md` Instrumentation Health indicator; the
full "X of Y metrics live" aggregate widget is deferred. Additive: no
existing widget, page, composable, or per-widget WP-197 freshness badge
is removed, relocated, or restyled.

**Packet:** WP-226 (EC-258).

**Drafted:** 2026-06-08 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---
