# WP-070 — Live Mutation Middleware (Pre-Plan ↔ Engine Disruption Wiring)

**Status:** Ready
**Primary Layer:** App / arena-client
**Dependencies:** WP-059, WP-090

---

## Session Context

WP-058 shipped `executeDisruptionPipeline` in `@legendary-arena/preplan`
(the detect → invalidate → rewind → notify cohesive workflow); WP-059
shipped the Pinia `usePreplanStore` and the `applyDisruptionToStore`
integration seam in `preplanLifecycle.ts`; WP-090 wired the boardgame.io
client subscription in `bgioClient.ts` that pipes server-pushed UIState
projections into `useUiStateStore`. This packet connects the three by
adding the middleware that detects per-player state mutations in the
subscription stream and routes them through the disruption pipeline into
the preplan store.

---

## Goal

After this session, when a waiting player has an active pre-plan and
another player's turn mutates shared or per-player game state (villain
escapes, bystander captured, city shift, HQ refill, wound dealt, etc.),
the arena-client automatically detects the mutation, runs
`executeDisruptionPipeline`, and delivers the structured
`DisruptionNotification` to the preplan store — causing the UI to display
that the player's plan was invalidated with a causal explanation. Without
this middleware, the preplan store is inert: plans are never invalidated
by real game events.

---

## Assumes

- WP-059 complete. Specifically:
  - `apps/arena-client/src/stores/preplan.ts` exports `usePreplanStore`
    with actions `startPlan`, `recordDisruption`, `clearPlan`
  - `apps/arena-client/src/preplan/preplanLifecycle.ts` exports
    `applyDisruptionToStore` and `startPrePlanForActiveViewer`
- WP-090 complete. Specifically:
  - `apps/arena-client/src/client/bgioClient.ts` exports
    `createLiveClient` with a `client.subscribe()` callback that writes
    UIState into `useUiStateStore().setSnapshot()`
  - `apps/arena-client/src/client/bgioClient.ts` exports
    `BgioClientLike`, `setClientFactoryForTesting`,
    `getLiveClientCallLog`, `resetLiveClientCallLog`
- WP-058 complete. Specifically:
  - `@legendary-arena/preplan` exports `executeDisruptionPipeline`,
    `PlayerAffectingMutation`, `DisruptionPipelineResult`
  - `@legendary-arena/preplan` exports `computeStateFingerprint`
- `pnpm --filter "@legendary-arena/arena-client..." build` exits 0
- `pnpm --filter "@legendary-arena/arena-client..." test` exits 0
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary` — read the arena-client
  import rules. arena-client may import `@legendary-arena/preplan`
  (runtime) and `@legendary-arena/game-engine` (Runtime-Safe Engine
  Surface only, `.` subpath). The middleware lives entirely within
  `apps/arena-client/`.
- `docs/ai/DESIGN-PREPLANNING.md §11` — notification delivery timing.
  The disruption pipeline produces a `requiresImmediateNotification:
  true` flag; the middleware must route the result to the store
  synchronously within the subscription callback.
- `docs/ai/DESIGN-CONSTRAINTS-PREPLANNING.md` — constraint #4 (binary
  per-player disruption detection), constraint #7 (immediate
  notification), constraint #11 (understandable failures), constraint
  #12 (structured notification payload).
- `apps/arena-client/src/client/bgioClient.ts` — read the
  `createLiveClient` function entirely. The subscribe callback at
  lines 168-185 is the integration point. The middleware hooks into
  (or wraps) this callback.
- `apps/arena-client/src/preplan/preplanLifecycle.ts` — read entirely.
  The `applyDisruptionToStore` adapter at lines 69-74 is the outbound
  seam.
- `apps/arena-client/src/stores/preplan.ts` — read entirely. The
  `recordDisruption` action at lines 114-129 is the terminal sink.
- `packages/preplan/src/disruption.types.ts` — read entirely. The
  `PlayerAffectingMutation` shape at lines 25-47 is the middleware's
  primary output type.
- `packages/preplan/src/preplanSandbox.ts` —
  `computeStateFingerprint` (line 84) operates on
  `PlayerStateSnapshot`, **not** UIState. It cannot be used as a
  fast-path for UIState diffs. The middleware uses reference equality
  (`===`) on the UIState object as its fast-path instead.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix),
  Rule 11 (full-sentence error messages), Rule 13 (ESM only).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on
  invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md
  §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps,
  Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never
  `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`,
  `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no
  diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- The middleware operates on `UIState` projections (post-playerView),
  never on raw `G` — the client never sees raw `G`
- The middleware must not write to `G`, `ctx`, or any authoritative
  engine state — it is a client-local observer per DESIGN-CONSTRAINTS
  #4
- `executeDisruptionPipeline` is called as-is from
  `@legendary-arena/preplan` — the middleware does not re-implement
  any pipeline stage
- `PlayerAffectingMutation` is constructed by the middleware from the
  UIState diff — the preplan package never inspects authoritative state
- The middleware must not import `boardgame.io` — it consumes the
  subscription output, not the subscription mechanism
- `sourceRestoration` from the pipeline result is passed through to the
  store but not acted on — restoration against authoritative state is
  out of scope (documented in `stores/preplan.ts` lines 121-124)
- No `.reduce()` in diff or mutation-detection logic — use `for...of`
- **Diff rules (strict):** no `JSON.stringify` comparisons, no
  deep-equality helper functions, no `Object.keys()` / `Object.entries()`
  iteration for field-level diffs — each UIState field comparison is an
  explicit `===` or count/length comparison written out per field
- **Null frame contract:** `null | undefined` UIState frames return
  empty mutations — never throw. The caller (subscribe callback) also
  guards by skipping detection on null frames.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask
  the human before proceeding — never guess or invent field names, type
  shapes, or file paths

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via
deterministic reproduction and state inspection.

The following requirements are mandatory:

- Given identical UIState transition sequences, the middleware must
  produce identical mutation detections and pipeline invocations
- Mutation detection is externally observable: when a disruption fires,
  the preplan store's `current.status` flips to `'invalidated'` and
  `lastNotification` is non-null — both are reactive Pinia state
  readable by any component or devtools
- The middleware must not introduce any state mutation that cannot be
  inspected post-execution or validated via tests
- Failures attributable to this packet must be localizable via: the
  preplan store state (active vs invalidated), the notification payload
  (causal explanation), or the absence of expected store transitions

---

## Scope (In)

### A) Mutation detector module

- **`apps/arena-client/src/preplan/mutationDetector.ts`** — **new**:
  - `detectPlayerAffectingMutations(previous: UIState, current:
    UIState, viewerPlayerId: string): PlayerAffectingMutation[]` —
    compares the previous and current UIState projections and returns
    an array of mutations that affect the viewer's pre-plan.
    Detection compares the following **anchored UIState fields** using
    explicit per-field checks (no dynamic property traversal):

    | UIState path | What it detects | effectType |
    |---|---|---|
    | `city.spaces` | Villain movement, appearance, escape from city | `'other'` |
    | `city.escapedPile` | Villain escape (length increase) | `'other'` |
    | `hq.slots` | Hero availability shifts (recruited / replaced) | `'other'` |
    | `players[viewerPlayerId].woundCount` | Wound dealt to viewer | `'ko'` |
    | `players[viewerPlayerId].handCount` | Viewer hand size change (external cause) | `'other'` |
    | `piles.bystandersCount` | Bystander pool depletion | `'other'` |
    | `piles.woundsCount` | Wound pool depletion | `'other'` |
    | `mastermind.tacticsRemaining` | Tactic revealed | `'other'` |
    | `mastermind.attachedBystanders` | Bystander attached to mastermind | `'other'` |
    | `scheme.twistPile` | Scheme twist pile change | `'other'` |
    | `progress.escapedVillains` | Escaped-villain counter | `'other'` |
    | `game.activePlayerId` | Turn change — **returns empty** (see below) | — |

    This is a **closed set**. No other UIState fields are inspected.
    Adding a new field requires updating this table and the detection
    function in tandem.

  - **Turn-change rule:** if `current.game.activePlayerId` changed to
    equal `viewerPlayerId`, the function returns an empty array
    immediately — the plan is consumed (it's the viewer's turn), not
    disrupted. Add `// why:` comment at this guard.
  - Each detected mutation maps to a `PlayerAffectingMutation` with
    the `effectType` from the table above and a human-readable
    `effectDescription` (e.g., `"Villain escaped from city space 2"`)
  - **Diff rules:** each field comparison is an explicit `===` or
    length/count comparison. No `JSON.stringify`, no deep-equality
    helpers, no `Object.keys()` iteration, no `.reduce()`.
  - Uses `for...of` loops only where iterating a known-length
    collection (e.g., `city.spaces` slots). No dynamic property
    traversal.
  - **Null frame handling:** if `previous` or `current` is
    `null | undefined`, return an empty array — never throw

### B) Middleware wiring in bgioClient.ts

- **`apps/arena-client/src/client/bgioClient.ts`** — **modified**:
  - The `client.subscribe()` callback (lines 168-185) gains a
    previous-state capture and a call to the middleware after writing
    to the UIState store

  - **Previous UIState lifecycle** — a closure-scoped
    `previousUIState: UIState | null` variable, managed as follows:
    1. Initialized to `null` before the first subscription frame
    2. On the **first non-null frame**: set `previousUIState` to the
       current frame and **skip detection** (no previous state to
       diff against)
    3. On each **subsequent frame**: run detection, then set
       `previousUIState = currentUIState` (unconditionally, whether
       or not detection found mutations — so `previousUIState` always
       reflects the last frame)
    4. On a **null frame**: leave `previousUIState` unchanged, skip
       detection entirely

  - **Fast-path short-circuit:** if `previousUIState === currentUIState`
    (reference equality), skip detection — the frame is a no-op
    re-emission. This is cheap and avoids unnecessary field-level
    comparison. No deep equality, no fingerprinting.

  - After `useUiStateStore().setSnapshot(...)`, check whether the
    preplan store has an active plan; if not, skip detection entirely
    (no plan to disrupt). If active, call
    `detectPlayerAffectingMutations(previousUIState, currentUIState,
    viewerPlayerId)`.

  - **Pipeline invocation policy — first-disruption-wins:** iterate
    detected mutations with `for...of`. For each mutation, call
    `executeDisruptionPipeline` with the active pre-plan and the
    mutation. If the result is non-null and
    `requiresImmediateNotification === true`, route it through
    `applyDisruptionToStore` and **break** — do not process remaining
    mutations. Rationale: `executeDisruptionPipeline` returns null if
    the plan is already invalidated (status guard), so continuing
    after the first successful disruption is wasted work. A single
    causal explanation is clearer than a list.

  - The `createLiveClient` signature gains a `viewerPlayerId` field
    in `CreateLiveClientOptions` (the caller already has this from
    the lobby flow)
  - `LiveClientHandle` interface unchanged
  - Add `// why:` comment explaining why the middleware runs after
    the UIState store write (the store must reflect the new state
    before disruption processing, so components see the cause before
    the notification)
  - Add `// why:` comment explaining why `viewerPlayerId` is threaded
    through options (needed by mutation detector to distinguish
    viewer-affecting mutations from irrelevant ones)

### C) Tests

Add `node:test` tests in
`apps/arena-client/src/preplan/mutationDetector.test.ts`:
- City zone change (`city.spaces`) produces a mutation with
  `effectType: 'other'` and descriptive `effectDescription`
- Villain escape (`city.escapedPile` length increase) produces a
  mutation
- HQ slot change (`hq.slots`) produces a mutation
- Per-player wound count increase (`players[viewerPlayerId].woundCount`)
  produces a mutation with `effectType: 'ko'`
- Shared pile change (`piles.bystandersCount`) produces a mutation
- Mastermind tactic change (`mastermind.tacticsRemaining`) produces a
  mutation
- No mutations detected when UIState is unchanged
  (`previous === current` structurally)
- Turn change (`game.activePlayerId` changes to viewer) returns empty
  array (not a disruption)
- Multiple simultaneous changes produce multiple mutations
- Null/undefined `previous` or `current` returns empty array
- Does not import from `boardgame.io`
- Uses `node:test` and `node:assert` only

Add integration-level tests in
`apps/arena-client/src/preplan/mutationMiddleware.test.ts`:
- Full pipeline: UIState transition with active pre-plan triggers
  `executeDisruptionPipeline` and `applyDisruptionToStore` receives
  the result
- First-disruption-wins: multiple mutations detected but only one
  pipeline result routed to store
- No active pre-plan: UIState transition does not invoke the pipeline
- First frame: sets `previousUIState`, skips detection
- Reference-equal frames: detection skipped entirely
- Null/undefined UIState frames are handled gracefully (no crash,
  `previousUIState` unchanged)
- Uses `setClientFactoryForTesting` from bgioClient.ts for test
  isolation

---

## Out of Scope

- No engine changes — the engine does not know pre-planning exists
- No `@legendary-arena/preplan` package changes — all exports are
  consumed as-is
- No server changes
- No UI component changes (disruption notification rendering is a
  future WP — the store state is the contract)
- No `sourceRestoration` application against authoritative state —
  the middleware passes it through to the store but does not act on it
- No pre-plan creation or consumption logic — `startPrePlanForActiveViewer`
  and `consumePlan` are not modified
- No changes to `stores/preplan.ts` — the store surface is stable
- Refactors, cleanups, or "while I'm here" improvements are **out of
  scope** unless explicitly listed in Scope (In) above

---

## Files Expected to Change

- `apps/arena-client/src/preplan/mutationDetector.ts` — **new** —
  pure function detecting player-affecting mutations from UIState diffs
- `apps/arena-client/src/preplan/mutationDetector.test.ts` — **new** —
  `node:test` coverage for mutation detection
- `apps/arena-client/src/preplan/mutationMiddleware.test.ts` — **new** —
  `node:test` integration coverage for the full middleware path
- `apps/arena-client/src/client/bgioClient.ts` — **modified** —
  subscribe callback gains previous-state tracking + middleware
  invocation
- `apps/arena-client/src/client/bgioClient.test.ts` — **modified** —
  tests for middleware integration in the subscribe callback

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A) Mutation Detector
- [ ] `mutationDetector.ts` exports `detectPlayerAffectingMutations`
      with signature `(previous: UIState, current: UIState,
      viewerPlayerId: string): PlayerAffectingMutation[]`
- [ ] City zone changes produce at least one mutation
- [ ] HQ slot changes produce at least one mutation
- [ ] Per-player wound count increases produce a mutation with
      `effectType: 'ko'`
- [ ] Identical UIState produces zero mutations
- [ ] Turn change to the viewer's own turn returns empty array
- [ ] No import from `boardgame.io` in `mutationDetector.ts`
      (confirmed with `Select-String`)
- [ ] No `.reduce()` in `mutationDetector.ts`
      (confirmed with `Select-String`)
- [ ] No `Math.random` in `mutationDetector.ts`
      (confirmed with `Select-String`)

### B) Middleware Wiring
- [ ] `createLiveClient` accepts `viewerPlayerId` in options
- [ ] Subscribe callback captures previous UIState and invokes
      `detectPlayerAffectingMutations` on each frame
- [ ] First non-null frame sets `previousUIState` and skips detection
- [ ] `previousUIState === currentUIState` (reference equality)
      short-circuits detection
- [ ] Detected mutations are routed through
      `executeDisruptionPipeline` → `applyDisruptionToStore`
- [ ] First-disruption-wins: loop breaks after first non-null
      pipeline result with `requiresImmediateNotification === true`
- [ ] No pipeline invocation when preplan store has no active plan
- [ ] No crash on null/undefined UIState frames — detection skipped,
      `previousUIState` unchanged

### C) Tests
- [ ] `pnpm --filter "@legendary-arena/arena-client..." test` exits 0
- [ ] `mutationDetector.test.ts` covers all detection scenarios
      listed in §A
- [ ] `mutationMiddleware.test.ts` covers pipeline integration and
      no-active-plan bypass
- [ ] No test file imports from `boardgame.io`
- [ ] Tests use `node:test` and `node:assert` only

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter "@legendary-arena/arena-client..." build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all tests
pnpm --filter "@legendary-arena/arena-client..." test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — confirm no boardgame.io import in mutation detector
Select-String -Path "apps\arena-client\src\preplan\mutationDetector.ts" -Pattern "boardgame.io"
# Expected: no output

# Step 4 — confirm no .reduce() in mutation detector
Select-String -Path "apps\arena-client\src\preplan\mutationDetector.ts" -Pattern "\.reduce\("
# Expected: no output

# Step 5 — confirm no Math.random in any new or modified file
Select-String -Path "apps\arena-client\src\preplan\mutationDetector.ts" -Pattern "Math\.random"
# Expected: no output

# Step 6 — confirm no boardgame.io import in test files
Select-String -Path "apps\arena-client\src\preplan\mutationDetector.test.ts","apps\arena-client\src\preplan\mutationMiddleware.test.ts" -Pattern "boardgame.io"
# Expected: no output

# Step 7 — confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter "@legendary-arena/arena-client..." build` exits 0
- [ ] `pnpm --filter "@legendary-arena/arena-client..." test` exits 0
      (all test files)
- [ ] No `boardgame.io` import in `mutationDetector.ts` (confirmed
      with `Select-String`)
- [ ] No `.reduce()` in `mutationDetector.ts` (confirmed with
      `Select-String`)
- [ ] No `Math.random` in any new or modified file (confirmed with
      `Select-String`)
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — pre-plan disruption now fires
      automatically when game state changes affect a waiting player's
      active plan
- [ ] `docs/ai/DECISIONS.md` updated — at minimum: why the middleware
      runs after the UIState store write (ordering invariant); why
      turn-change is not a disruption (consumption vs invalidation
      distinction)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-070 checked off
      with today's date
- [ ] 01.5 NOT INVOKED (no `LegendaryGameState` shape change; no move
      added; no phase hook; no replay-hash cascade)

## Lint Gate Self-Review

_(Completed 2026-05-15 — Step 5 of 01.0a drafting workflow)_

| § | Section | Verdict | Notes |
|---|---|---|---|
| 1 | WP Structure | PASS | All 10 required sections present and non-empty |
| 2 | Non-Negotiable Constraints | PASS | Engine-wide + packet-specific + session protocol present; references 00.6; full-file output required |
| 3 | Prerequisites | PASS | WP-058, WP-059, WP-090 listed with specific exports; build/test baseline stated |
| 4 | Context References | PASS | 9 specific file/section references in Context (Read First) |
| 5 | Output Completeness | PASS | 5 files listed (3 new, 2 modified) with descriptions; no ambiguous output language |
| 6 | Naming Consistency | PASS | All field names match UIState types and preplan contracts |
| 7 | Dependency Discipline | PASS | No new npm deps; node:test only; no forbidden packages |
| 8 | Architectural Boundaries | PASS | arena-client imports preplan (runtime) and game-engine (types via `.` subpath only); no boardgame.io in mutationDetector; layer isolation explicit |
| 9 | Windows Compatibility | PASS | Verification Steps use PowerShell `Select-String`; pnpm commands are cross-platform |
| 10 | Environment Variable Hygiene | N/A | No env vars introduced or required |
| 11 | Authentication Clarity | N/A | WP does not touch authentication |
| 12 | Test Quality | PASS | node:test + node:assert only; no boardgame.io imports; no network/DB; uses `setClientFactoryForTesting` for isolation |
| 13 | Commands and Verification | PASS | 7 exact verification commands with expected output |
| 14 | Acceptance Criteria Quality | PASS | 18 binary items across 3 groups + scope enforcement; all reference specific files/functions/values |
| 15 | Definition of Done | PASS | Includes: all AC pass, build, test, scope check, STATUS.md, DECISIONS.md, WORK_INDEX.md, 01.5 non-invocation |
| 16.1 | No premature abstraction | PASS | Single detection function + middleware wiring; no factory pattern |
| 16.2 | Explicit control flow | PASS | for...of required; .reduce() banned; no dynamic property traversal; no JSON.stringify diffs |
| 16.3 | Readable names | PASS | Full-word naming required per 00.6; no abbreviations |
| 16.4 | Small functions | PASS | Detection function scoped to known-field checks; JSDoc required |
| 16.5 | Comments explain WHY | PASS | 3 required `// why:` comments specified in EC-161 |
| 16.6 | No magic imports | PASS | Named imports only; ESM-only constraint |
| 16.7 | Error messages | PASS | Full-sentence error messages required per engine-wide constraints |
| 17 | Vision Alignment | N/A | WP touches no §17.1 trigger surfaces — client-local middleware with no scoring, replay, identity, monetization, card data, or accessibility surfaces |
| 18 | Prose-vs-Grep | PASS | Verification Steps grep for `boardgame.io`, `.reduce(`, `Math.random`; WP prose discusses these in constraint context but does not enumerate them in files under the grep paths |
| 19 | Bridge-vs-HEAD | N/A | Not a repo-state-summarizing artifact |
| 20 | Funding Surface Gate | N/A | No UI surfaces, no user-visible copy, no funding channels — pure client-local middleware wiring |
| 21 | API Catalog Update | N/A | No HTTP endpoints touched, no `apps/server/src/**` library functions added or modified |

**Result: ALL PASS (or justified N/A). Lint gate satisfied.**
