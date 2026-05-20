# WP-166 — Restore arena-client `vue-tsc` Green + CI Typecheck Gate

**Status:** Ready
**Primary Layer:** Game Engine (public barrel, additive type re-exports) + Client (`apps/arena-client/**`) + Build/CI (`.github/workflows/ci.yml`)
**Dependencies:** WP-128, WP-067, WP-090, EC-183

---

## Session Context

> WP-128 added the `UIState` projection sub-types
> (`UICardDisplay`, `UIHQCard`, `UIDisplayEntry`, `UIDecksState`,
> `UISharedPilesState`, `UIKoPileState`) to
> `packages/game-engine/src/ui/uiState.types.ts` and made `decks` / `piles`
> / `koPile` required on `UIState`, but never re-exported the new sub-types
> from the engine public barrel (`index.ts`, whose UI block was last touched
> by WP-067). `apps/arena-client` imports those sub-types by name and its
> fixtures predate the WP-128 shape, so `vue-tsc` has ~40 errors — invisible
> because nothing on the green path type-checks the client (Vite uses
> esbuild; tests run under `tsx`; only `registry-viewer` typecheck is gated
> in CI). EC-183 (D-16303) established the desktop spectator/rewind render
> pattern. This packet restores `vue-tsc` to green and gates it in CI; it
> changes no contract field and adds no new type.

---

## Goal

After this session, `pnpm --filter @legendary-arena/arena-client typecheck`
(`vue-tsc --noEmit`) exits 0, and CI runs that same gate so the drift cannot
silently recur. This is achieved by: (A) re-exporting the six already-declared
WP-128 UI projection sub-types from the engine public barrel; (B) refreshing
the three stale `UIState` test fixtures and the `SharedScoreboard` test
literals up to the current WP-128 shape; (C) one `exactOptionalPropertyTypes`
test-call fix in `OpponentPanel.test.ts`; (D) guarding the viewer-dependent
`TurnActionBar` in `PlayMobile.vue` on `viewer !== null`; and (E) adding an
`arena-client` typecheck step to `.github/workflows/ci.yml`. No `UIState`
field is renamed, added, or removed; no new UI type is introduced; the
arena-client `node:test` baseline (362 pass / 0 fail) and `pnpm -r build` stay
green.

---

## Assumes

> Verify each before writing a line. If any is false, this packet is BLOCKED.

- Baseline: `origin/main` at `267ea0c` (recorded at draft time; re-verify HEAD
  at execution start).
- WP-128 complete. Specifically:
  - `packages/game-engine/src/ui/uiState.types.ts` declares (and exports as
    interfaces) `UICardDisplay`, `UIHQCard`, `UIDisplayEntry`, `UIDecksState`,
    `UISharedPilesState`, `UIKoPileState`.
  - `UIState` requires `decks: UIDecksState`, `piles: UISharedPilesState`,
    `koPile: UIKoPileState`.
- WP-067 complete: `packages/game-engine/src/index.ts` already re-exports
  `UIState`, `UIPlayerState`, `UICityCard`, `UICityState`, `UIHQState`,
  `UIMastermindState`, `UISchemeState`, `UITurnEconomyState`,
  `UIGameOverState`, `UIProgressCounters`, `UIParBreakdown` from
  `./ui/uiState.types.js`. The six sub-types above are NOT in that block.
- WP-090 complete: `apps/arena-client` consumes the engine via the
  Runtime-Safe Engine Surface (the `.` subpath of `@legendary-arena/game-engine`).
- EC-183 merged: `PlayDesktop.vue` renders the shared board for the whole play
  phase and gates only the personal zone on `viewer !== null` (D-16303). EC-183
  explicitly scoped `PlayMobile.vue` out — "mobile never receives a rewind
  frame" — because `PlayViewport.vue` forwards `matchId` to `<PlayDesktop>`
  only (D-16501); the autoplay/rewind path does not reach mobile.
- `exactOptionalPropertyTypes: true` is repo-wide policy: it is set in every
  package `tsconfig.json` (`apps/arena-client`, `packages/game-engine`,
  `packages/preplan`, `packages/registry`, `packages/vue-sfc-loader`).
- `pnpm -r build` exits 0. `pnpm --filter @legendary-arena/arena-client test`
  exits 0 with baseline 362 pass / 0 fail / 0 skipped (post EC-183).
- `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md`, `docs/ai/STATUS.md` exist.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — read the
  per-layer import rules and the Runtime-Safe Engine Surface row for
  `apps/arena-client`. This packet widens the engine's public *type* surface
  (additive re-exports); confirm that is permitted on the `.` subpath and is
  not a Setup-Tooling (`/setup`) leak.
- `.claude/rules/architecture.md §Import Rules` + the
  `.claude/skills/legendary-game-engine/SKILL.md` enforcement — the engine
  public surface is governed here. Confirm an additive type re-export is not a
  contract-file modification (the barrel `index.ts` is not a
  `.types.ts`/`.validate.ts`/`.gating.ts` locked contract file).
- `packages/game-engine/src/index.ts` — read the UI export block
  (the `export type { … } from './ui/uiState.types.js'` near the WP-028/WP-067
  comment). The six sub-types are added to exactly this block.
- `packages/game-engine/src/ui/uiState.types.ts` — read the six sub-type
  declarations and the `UIState` interface. This file is a locked contract;
  read it, do not modify it.
- `apps/arena-client/src/fixtures/uiState/index.ts` and `typed.ts` — the three
  stale `UIState` fixtures. Use the WP-164 / EC-181 autoplay fixtures (which
  already carry the current shape) as the reference for `decks` / `piles` /
  `koPile`.
- `apps/arena-client/src/components/hud/SharedScoreboard.test.ts`,
  `apps/arena-client/src/components/play/OpponentPanel.test.ts`,
  `apps/arena-client/src/pages/PlayMobile.vue`,
  `apps/arena-client/src/pages/PlayDesktop.vue` (the EC-183 reference pattern).
- `.github/workflows/ci.yml` — read the existing `build-viewer` job that runs
  `pnpm --filter registry-viewer typecheck`; mirror that shape for arena-client.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — confirm no `UIState` field
  name is renamed; fixtures are brought up to the canonical shape, never the
  reverse.
- `docs/ai/DECISIONS.md` — scan for D-16303 (rewind audience filter), D-16501
  (matchId desktop-only prop-drill), D-12805 (`UIDisplayEntry` shared alias).
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6
  (`// why:` comments), Rule 9 (`node:` prefix), Rule 13 (ESM only), Rule 14
  (field names match the data contract).
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable
  constraints.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only.
- Never throw inside boardgame.io move functions — return void on invalid input.
- Never persist `G`, `ctx`, or any runtime state.
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets,
  or functions.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports.
- Test files use `.test.ts` — never `.test.mjs`.
- No database or network access inside move functions or pure helpers.
- Full file contents for every new or modified file in the output — no diffs,
  no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- Add ONLY the six named sub-type re-exports to the existing UI block in
  `packages/game-engine/src/index.ts`. Do NOT add value exports, do NOT add a
  new file, do NOT reorder the existing exports.
- Do NOT modify `packages/game-engine/src/ui/uiState.types.ts` — it is a locked
  contract file; the types already exist there.
- Do NOT rename, add, or remove any `UIState` (or sub-type) field. Fixtures are
  brought UP TO the current shape; the type is never bent to the fixture.
- Do NOT relax `exactOptionalPropertyTypes`. The `OpponentPanel.test.ts:56`
  fix omits the optional keys; it does not change the tsconfig flag.
- `PlayMobile.vue`: apply the MINIMAL viewer-null guard — gate the
  viewer-dependent `TurnActionBar` on `viewer !== null` so it matches the
  `<main>` guard already at the top of the play template. Do NOT ungate the
  board or restructure the page (EC-183 deliberately scoped mobile out; mobile
  receives no rewind frame per D-16501, so the desktop board-ungating pattern
  does not apply here).
- Both runners must stay green after the change:
  `pnpm --filter @legendary-arena/arena-client test` (tsx, 362 baseline) AND
  `pnpm --filter @legendary-arena/arena-client typecheck` (vue-tsc, 0 errors).
- No new npm dependency. No `package.json` `dependencies` change.

**Session protocol:**
- If any `UIState` field name or sub-type shape is unclear, STOP and ask —
  never guess or invent a field name. Read `uiState.types.ts` as the source.

**Locked contract values (verbatim — do not re-derive):**
- The six sub-types to re-export from the barrel: `UICardDisplay`, `UIHQCard`,
  `UIDisplayEntry`, `UIDecksState`, `UISharedPilesState`, `UIKoPileState`.
- `UIState` newly-required fields (WP-128): `decks: UIDecksState`,
  `piles: UISharedPilesState`, `koPile: UIKoPileState`.
- `UISchemeState` requires `twistPile`. `UIMastermindState` requires `display`,
  `attachedBystanders`, `strikePile`.
- `UICardDisplay` shape (locked 4 fields): `extId: string`, `name: string`,
  `imageUrl: string`, `cost: number | null`.
- `UIDisplayEntry` / `UIHQCard` shape: `{ extId: string; display: UICardDisplay }`.

---

## Debuggability & Diagnostics

This packet introduces no runtime behavior change. Correctness is observable
via two deterministic, reproducible gates run from a clean checkout:
`pnpm --filter @legendary-arena/arena-client typecheck` (must reach 0 errors)
and `pnpm --filter @legendary-arena/arena-client test` (must hold the 362-pass
baseline). The `PlayMobile.vue` guard is byte-equivalent at runtime (mobile
never produces a `viewer === null` play frame, per D-16501); its only
observable effect is clearing the `vue-tsc` `TS18047` error. No state mutation
is introduced; no `G`/`ctx` field changes.

---

## Scope (In)

### A) Engine barrel — re-export the six WP-128 sub-types
- **`packages/game-engine/src/index.ts`** — modified:
  - Add `UICardDisplay`, `UIHQCard`, `UIDisplayEntry`, `UIDecksState`,
    `UISharedPilesState`, `UIKoPileState` to the existing
    `export type { … } from './ui/uiState.types.js'` block (the WP-028/WP-067
    UI block). Type-only re-export; no value export.
  - Add a `// why:` comment noting these complete the WP-128 UI projection
    surface the client consumes (the sub-types were authored in WP-128 but
    never published from the barrel).

### B) Client fixtures — bring three `UIState` literals to the WP-128 shape
- **`apps/arena-client/src/fixtures/uiState/index.ts`** — modified:
  - Add `decks`, `piles`, `koPile` to the three `UIState` fixture objects
    (the literals at the lobby / play / endgame fixtures), using the shapes
    from `uiState.types.ts` and the WP-164 / EC-181 autoplay fixtures as the
    reference. Do not alter existing fields.
- **`apps/arena-client/src/fixtures/uiState/typed.ts`** — modified:
  - Mirror the same three additions so the `satisfies UIState` checks pass.

### C) Client test literals — `SharedScoreboard`
- **`apps/arena-client/src/components/hud/SharedScoreboard.test.ts`** —
  modified:
  - Add `twistPile` to the `UISchemeState` literals and
    `display` / `attachedBystanders` / `strikePile` to the `UIMastermindState`
    literals (the three scheme/mastermind literal pairs). Use the
    `uiState.types.ts` shapes; empty arrays / a minimal `display` are fine — the
    test asserts scoreboard counts, not card content.

### D) Client test — `OpponentPanel` `exactOptionalPropertyTypes` fix
- **`apps/arena-client/src/components/play/OpponentPanel.test.ts`** — modified
  (line ~56):
  - Replace the `{ victoryVP: undefined, victoryCards: undefined }` partial with
    one that OMITS those keys (do not assign `undefined`). The flag stays set.

### E) Client page — `PlayMobile` viewer-null guard
- **`apps/arena-client/src/pages/PlayMobile.vue`** — modified:
  - Guard the viewer-dependent `TurnActionBar` (the footer widget reading
    `viewer.handCount`) on `viewer !== null`, matching the `<main>` guard at the
    top of the play template. The footer element and the `preplan-affordance`
    slot stay on `isPlayPhase` (unchanged); only the `TurnActionBar` gains the
    nested guard.
  - Add a `// why:` comment: `viewer` is typed nullable; the footer's
    turn-action bar needs an identified viewer, matching the `<main>` guard —
    mobile never produces a `viewer`-less play frame (D-16501), so this is a
    type-safety guard, not the EC-183 board-ungating restructure.

### F) CI — gate arena-client typecheck
- **`.github/workflows/ci.yml`** — modified:
  - Add a step (or job) running `pnpm --filter @legendary-arena/arena-client
    typecheck`, mirroring the existing `pnpm --filter registry-viewer
    typecheck` step in the `build-viewer` job. It must run after install/build
    so workspace types resolve. This is the re-drift guard.

---

## Out of Scope

- No modification to `packages/game-engine/src/ui/uiState.types.ts` — the
  sub-types and `UIState` shape are a locked WP-128 contract.
- No board-ungating restructure of `PlayMobile.vue` — that is EC-183 / D-16303
  territory and EC-183 deliberately scoped mobile out (mobile has no rewind
  path, D-16501).
- No fix for the latent "mobile live-spectator sees a blank board" question
  (if a `playerID`-less spectator ever reaches mobile, the existing `<main>`
  guard would blank it). That is a separate behavioral decision, like the
  rewind-UX item; this packet is type-safety only.
- No relaxing of `exactOptionalPropertyTypes`.
- No `pnpm -r typecheck` rollout to `apps/dashboard` or `apps/legends-board` —
  this packet gates `arena-client` only (those apps may have their own drift;
  out of scope here).
- No card data, image, or content-semantics change; no `UIState` field rename.
- No new engine barrel drift test — the CI typecheck gate (F) supersedes a
  dedicated per-package barrel test for re-drift prevention.
- Refactors, cleanups, or "while I'm here" improvements are out of scope unless
  listed in Scope (In).

---

## Files Expected to Change

- `packages/game-engine/src/index.ts` — **modified** — +6 type-only re-exports
  in the existing UI block.
- `apps/arena-client/src/fixtures/uiState/mid-turn.json`,
  `apps/arena-client/src/fixtures/uiState/endgame-win.json`,
  `apps/arena-client/src/fixtures/uiState/endgame-loss.json` — **modified** —
  the three `UIState` fixtures raised to the full WP-128 shape. **(Execution
  reconciliation R1/R2, 2026-05-19:** the draft listed `fixtures/uiState/index.ts`
  + `typed.ts`, but those are TS wrappers — the `UIState` *data* lives in these
  three `.json` files, so the edits landed here and the `.ts` wrappers are
  byte-unchanged. And the shape refresh required the full WP-128 shape, not only
  `decks`/`piles`/`koPile`: also `city.escapedPile` + `city.spaces[].display`,
  `mastermind.{display,attachedBystanders,strikePile}`, `scheme.twistPile`,
  `economy.{piercing,woundsDrawn}` — per the Goal §B "up to the current WP-128
  shape". The baseline `vue-tsc` only surfaced the top-level missing props
  because TS short-circuits at the first incomplete layer.)
- `apps/arena-client/src/components/hud/SharedScoreboard.test.ts` — **modified**
  — add `twistPile` + mastermind `display`/`attachedBystanders`/`strikePile`.
- `apps/arena-client/src/components/play/OpponentPanel.test.ts` — **modified** —
  omit the `undefined`-valued optional keys (line ~56).
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — guard
  `TurnActionBar` on `viewer !== null`.
- `.github/workflows/ci.yml` — **modified** — add the arena-client typecheck
  gate. **(Execution reconciliation, 2026-05-19:** landed as its own
  `typecheck-arena-client` job — the §F "step **or job**" allowance — that runs
  `pnpm -r build` then `pnpm --filter @legendary-arena/arena-client typecheck`.
  A step inside `build-viewer` would fail at CI runtime: that job only downloads
  the registry dist, but arena-client resolves `@legendary-arena/game-engine` and
  `@legendary-arena/preplan` via their built `dist/*.d.ts`, which must be compiled
  first.)
- `docs/ai/STATUS.md` — **modified** — record the restored gate.
- `docs/ai/DECISIONS.md` — **modified** — land D-16502 (barrel widening).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-166.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — mark EC-184 Done.

No other files may be modified.

---

## Acceptance Criteria

All items are binary pass/fail.

### A) Engine barrel
- [ ] `packages/game-engine/src/index.ts` re-exports all six of `UICardDisplay`,
      `UIHQCard`, `UIDisplayEntry`, `UIDecksState`, `UISharedPilesState`,
      `UIKoPileState` (confirmed with `Select-String`).
- [ ] No value export and no new file added to the engine for this surface
      (confirmed with `git diff --name-only` — only `index.ts` in game-engine).
- [ ] `uiState.types.ts` is unchanged (confirmed with `git diff`).

### B–E) Client typecheck
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (zero
      `error TS` lines).
- [ ] `apps/arena-client/tsconfig.json` still has
      `"exactOptionalPropertyTypes": true` (unchanged).
- [ ] `PlayMobile.vue` gates `TurnActionBar` on `viewer !== null` (confirmed
      with `Select-String`), and the shared-board / footer structure is
      otherwise unchanged.

### F) CI
- [ ] `.github/workflows/ci.yml` contains a step running
      `pnpm --filter @legendary-arena/arena-client typecheck`.

### Tests / baseline
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 with 362 pass
      / 0 fail / 0 skipped (baseline preserved — no test count regression).
- [ ] `pnpm -r build` exits 0.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed
      with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — full workspace build
pnpm -r build
# Expected: exits 0, no TypeScript/Vite errors

# Step 2 — arena-client unit tests (tsx runner)
pnpm --filter @legendary-arena/arena-client test
# Expected: TAP — 362 pass, 0 fail, 0 skipped

# Step 3 — arena-client typecheck (the gate this packet restores)
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exits 0, zero "error TS" lines

# Step 4 — confirm the six sub-types are re-exported from the barrel
Select-String -Path "packages\game-engine\src\index.ts" -Pattern "UICardDisplay|UIHQCard|UIDisplayEntry|UIDecksState|UISharedPilesState|UIKoPileState"
# Expected: matches inside the UI export block

# Step 5 — confirm the locked contract file is untouched
git diff --name-only packages/game-engine/src/ui/uiState.types.ts
# Expected: no output

# Step 6 — confirm exactOptionalPropertyTypes is still set
Select-String -Path "apps\arena-client\tsconfig.json" -Pattern "exactOptionalPropertyTypes"
# Expected: one match, value true

# Step 7 — confirm CI gates the arena-client typecheck
Select-String -Path ".github\workflows\ci.yml" -Pattern "arena-client typecheck"
# Expected: one match (the new step)

# Step 8 — confirm no out-of-scope files changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass.
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (362 baseline).
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
- [ ] `packages/game-engine/src/ui/uiState.types.ts` was not modified (confirmed
      with `git diff`).
- [ ] `exactOptionalPropertyTypes` was not relaxed in any tsconfig (confirmed
      with `git diff`).
- [ ] No files outside `## Files Expected to Change` were modified (confirmed
      with `git diff --name-only`).
- [ ] `docs/ai/STATUS.md` updated — arena-client `vue-tsc` is green and gated in
      CI; the WP-128 UI projection sub-types are now published from the engine
      barrel.
- [ ] `docs/ai/DECISIONS.md` updated — D-16502 landed (engine barrel publishes
      the six WP-128 UI projection sub-types; additive, type-only).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-166 checked off with the
      execution date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-184 row flipped to Done.

---

## Lint Gate Self-Review (00.3 — drafting Step 5)

> All 21 sections resolved against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`.
> Verdict recorded inline; see `## Pre-Flight & Copilot Verdicts` below for the
> gate verdicts.

- **§1 Structure** — PASS. All mandatory sections present and non-empty;
  `## Out of Scope` lists >2 explicitly-excluded adjacent items.
- **§2 Non-Negotiable Constraints** — PASS. Engine-wide block retained
  (full-file output required, diffs forbidden, ESM/Node v22, references
  `00.6-code-style.md`); packet-specific + session-protocol + locked values
  present.
- **§3 Assumes** — PASS. WP-128/WP-067/WP-090/EC-183 + the
  `exactOptionalPropertyTypes` repo-wide fact + baseline + build/test state all
  listed; no dependency referenced in body but absent here.
- **§4 Context** — PASS. ARCHITECTURE.md §Layer Boundary + `.claude/rules` +
  the game-engine SKILL + 00.2 + 00.6 + DECISIONS scan all cited with specifics.
- **§5 Files Expected to Change** — PASS. Seven source files (≤8) + four
  governance files; each marked modified with a one-line description; no
  ambiguous "update this section" language.
- **§6 Naming** — PASS. All names (`UIState`, the six sub-types, `twistPile`,
  `strikePile`, `decks`/`piles`/`koPile`) match `uiState.types.ts` / 00.2; no
  rename introduced.
- **§7 Dependencies** — PASS. No new npm dependency; explicitly forbidden.
- **§8 Architectural Boundaries** — PASS. Additive type-only re-export on the
  Runtime-Safe Engine Surface (`.` subpath); no `/setup` leak; no engine→server
  or client→registry violation; `uiState.types.ts` contract untouched.
- **§9 Windows** — PASS. Verification Steps use `pwsh` + `Select-String` + `\`
  paths.
- **§10 Env vars** — N/A. No environment variable introduced or referenced.
- **§11 Authentication** — N/A. This packet touches no authentication surface.
- **§12 Test Quality** — PASS. Test edits stay on `node:test`; no boardgame.io
  import added; no network/DB; fixture refresh only.
- **§13 Commands** — PASS. Verification uses `pnpm --filter …`, never `npm run`;
  expected output shown inline.
- **§14 Acceptance Criteria** — PASS. 11 binary, observable, file/symbol-specific
  items aligned with the deliverables.
- **§15 Definition of Done** — PASS. Includes all-AC-pass, scope-boundary check,
  and STATUS.md / DECISIONS.md / WORK_INDEX.md updates.
- **§16 Code Style** — PASS. No new abstraction/HOF; explicit control flow;
  full-word names; `// why:` required at the barrel export and the PlayMobile
  guard; no `import *`; the type-only re-export extends an existing curated
  block (not a new obscuring barrel).
- **§17 Vision Alignment** — N/A. Exports already-declared types, refreshes test
  fixtures, and adds a CI gate; touches none of the §17.1 trigger surfaces
  (no scoring/PAR/leaderboards, replay, identity, multiplayer sync, determinism/
  RNG, card-data/content semantics, monetization, live-ops, accessibility, or
  registry-viewer public surface). `UIState` field set is unchanged.
- **§18 Prose-vs-Grep** — PASS. No literal-string-scoped forbidden-token grep is
  used; the Step-4 grep targets type names that legitimately appear in code.
- **§19 Bridge-vs-HEAD** — N/A at draft time (not a repo-state-summarizing
  artifact); the WORK_INDEX/STATUS updates at execution time observe §19.
- **§20 Funding Surface Gate** — N/A. Docs/types/CI change only; no funding
  navigation, profile attribution, tournament channel, or user-visible
  "donate/support" copy is added or proposed.
- **§21 API Catalog** — N/A. No HTTP endpoint on `apps/server` is added,
  modified, or removed, and no `apps/server/src/**` `Library-only` function is
  changed; the re-exported types are consumed by `apps/arena-client`, not by
  the server.

---

## Pre-Flight & Copilot Verdicts

> Populated during drafting Step 5 (`01.4` then `01.7`). Recorded here so the
> execution session inherits the verdicts.

- **Pre-flight (`01.4`):** **READY TO EXECUTE** (2026-05-19). Class: Contract-Only.
  All four hard-deps verified with evidence; contract fidelity confirmed by
  verbatim transcription from `uiState.types.ts`; scope locked to 7 source + 4
  governance files; all risks RS-class (RS-1 CI filter selector, RS-2 fixture
  reference shape, RS-3 PlayMobile guard granularity, RS-4 two-layer touch) —
  no PS-class blocker. Full report: `docs/ai/invocations/preflight-wp166.md`.
- **Copilot check (`01.7`):** **PASS — CONFIRM** (2026-05-19). Pre-flight verdict
  stands; findings only in categories #1/#4/#7, all PASS with risk converted to
  EC guardrails; no FIX required, no SUSPEND-class blocker. Full report:
  `docs/ai/invocations/copilot-wp166.md`.
