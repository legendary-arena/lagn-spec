# 02 — Code Categories

> **REFERENCE DOCUMENT — Not an execution prompt.**
>
> **Subordination:** This document is subordinate to:
>
> 1. `docs/ai/ARCHITECTURE.md` (authoritative layer boundaries)
> 2. `.claude/rules/*.md` (per-layer enforcement rules)
>
> If this document conflicts with either, the higher-authority document wins.
> This document names and organizes what those documents enforce.

---

## Purpose

Every file in the codebase belongs to exactly one code category. Categories
define what a file is allowed to do — what it may import, whether it may
mutate state, and what failure mode applies when it breaks.

This document exists so that:

- Pre-flight can check: "does this file belong to the right category?"
- Debugging can start with: "what category is this? what are the rules?"
- Patching can assess: "what's the blast radius of changing this?"
- New WPs can scope: "which categories will this touch?"

Categories are **structural and enforceable**, not labels. If two categories
allow the same imports, access the same data, and mutate the same state,
they are not real categories.

---

## Category Summary

| ID | Category | Primary location | Enforcement |
|---|---|---|---|
| `framework` | Framework / Orchestration | `game.ts`, phase hooks, move map | `.claude/rules/game-engine.md` |
| `engine` | Game Engine / Rules Core | `packages/game-engine/src/rules/`, `src/hero/`, `src/economy/`, `src/board/` | `.claude/rules/game-engine.md` |
| `setup` | Setup-Time Builders | `packages/game-engine/src/setup/` | `.claude/rules/game-engine.md` |
| `moves` | Move Implementations | `packages/game-engine/src/moves/` | `.claude/rules/game-engine.md` |
| `data-input` | Data Input / Registry | `packages/registry/`, `data/` | `.claude/rules/registry.md` |
| `preplan` | Pre-Planning (Non-Authoritative, Per-Client) | `packages/preplan/` | `docs/ai/DESIGN-PREPLANNING.md`, `.claude/rules/architecture.md` §Pre-Planning Layer |
| `server` | Server / Persistence | `apps/server/` | `.claude/rules/server.md`, `.claude/rules/persistence.md` |
| `client-app` | Client App | `apps/arena-client/` | `docs/ai/ARCHITECTURE.md` §Layer Boundary (D-6511) |
| `cli-producer-app` | CLI Producer App | `apps/replay-producer/` | `docs/ai/ARCHITECTURE.md` §Layer Boundary (D-6301) |
| `docs-app` | Documentation / Reference Viewer App | `apps/registry-viewer/`, `apps/wiki-viewer/` | `docs/ai/DECISIONS.md` D-13807 |
| `test` | Tests | `**/*.test.ts` | `.claude/rules/code-style.md` |
| `infra` | Data Pipeline / Infra | `scripts/`, `.githooks/`, CI workflows | N/A (not shipped to players) |
| `docs` | Documentation / Governance | `docs/`, `.claude/` | `.claude/rules/work-packets.md` |

---

## Category Definitions

### `framework` — Framework / Orchestration

**What it is:** Code bound to boardgame.io — `game.ts`, phase hooks
(`onBegin`, `onEnd`), the moves map, `endIf`. Anything that receives
`ctx` from the framework or calls `ctx.events.*`.

**May:** Import `boardgame.io`. Mutate `G` (under Immer draft). Call
`ctx.events.setPhase()`, `ctx.events.endTurn()`. Wire engine components.

**Must not:** Implement game rules. Load data. Perform IO. Contain
pure rule logic beyond coordination.

**Failure mode:** Timing/ordering bugs. Phase transition errors.

**Directories:** `packages/game-engine/src/game.ts`

---

### `engine` — Game Engine / Rules Core

**What it is:** Deterministic rules, data-only contracts, rule execution
logic, keyword handling, economy helpers, zone operations. The heart of
correctness and replayability.

**May:** Read immutable inputs from `G`. Compute derived state. Use pure
helpers. Iterate deterministically with `for...of`.

**Must not:** Import `boardgame.io`. Import registry packages. Perform IO.
Use `Math.random()`. Throw (return void instead). Use `.reduce()` for
branching logic. Store functions in `G`.

**Failure mode:** Determinism violations. Replay divergence. Rule
incorrectness.

**Directories:** `packages/game-engine/src/rules/`,
`packages/game-engine/src/hero/`, `packages/game-engine/src/economy/`,
`packages/game-engine/src/board/`, `packages/game-engine/src/turn/`,
`packages/game-engine/src/state/`, `packages/game-engine/src/scoring/`,
`packages/game-engine/src/mastermind/`,
`packages/game-engine/src/villainDeck/`,
`packages/game-engine/src/replay/` (D-2706),
`packages/game-engine/src/ui/` (D-2801),
`packages/game-engine/src/campaign/` (D-3001),
`packages/game-engine/src/invariants/` (D-3101),
`packages/game-engine/src/network/` (D-3201),
`packages/game-engine/src/content/` (D-3301),
`packages/game-engine/src/versioning/` (D-3401),
`packages/game-engine/src/ops/` (D-3501),
`packages/game-engine/src/simulation/` (D-3601),
`packages/game-engine/src/beta/` (D-3701),
`packages/game-engine/src/governance/` (D-4001)

---

### `setup` — Setup-Time Builders

**What it is:** Code that runs during `Game.setup()`. Converts input data
(registry, config) into derived runtime state stored in `G`. Registry
resolution, configuration expansion, initial state construction.

**May:** Consume registry data as a function parameter. Generate immutable
runtime data. Produce `G.*` fields. Use `ctx.random.Shuffle` for
deterministic deck shuffling. Throw on invalid configuration (only context
where throwing is permitted).

**Must not:** Be called after setup. Import `boardgame.io` (receives ctx
as a parameter, never imports it). Mutate state at runtime. Access
database or network.

**Failure mode:** Data provenance errors. Wrong data resolved into `G`.
Traceability gaps.

**Directories:** `packages/game-engine/src/setup/`

---

### `moves` — Move Implementations

**What it is:** boardgame.io move functions that follow the three-step
contract: validate args, check stage gate, mutate `G`. Bridge between
framework category and engine category.

**May:** Import `boardgame.io` (for `FnContext` type). Mutate `G` under
Immer draft. Call engine helpers and assign return values. Destructure
`ctx` for `random`, `events`.

**Must not:** Throw. Implement rule logic beyond dispatch. Access registry.
Perform IO.

**Failure mode:** Move validation errors. Stage gating gaps. Silent no-ops
vs expected mutations.

**Directories:** `packages/game-engine/src/moves/`

---

### `data-input` — Data Input / Registry

**What it is:** Schema definitions (Zod), card JSON files, metadata files,
registry loaders, converters, validators. The source of all card and
configuration data.

**May:** Perform IO (file reads, HTTP fetches). Use Zod for validation.
Load and parse JSON. Export immutable data structures.

**Must not:** Import `game-engine`. Import `server`. Contain game logic.
Mutate runtime state. Access databases.

**Failure mode:** Typos, schema drift, silent data corruption, wrong file
loaded where a specific metadata shape is expected (see D-1203 for the
canonical `sets.json` vs `card-types.json` silent-failure precedent;
`card-types.json` itself was deleted by WP-084, but the pattern still
applies to any future metadata file). Bugs here manifest as wrong
gameplay behavior downstream.

**Directories:** `packages/registry/`, `data/cards/`, `data/metadata/`

---

### `preplan` — Pre-Planning (Non-Authoritative, Per-Client)

**What it is:** A non-authoritative, per-client speculative planning layer
that lets waiting players draft upcoming turns without committing moves or
mutating authoritative game state. The first and only instance is
`packages/preplan/` — introduced by WP-056 as a types-only contract
(`PrePlan`, `PrePlanSandboxState`, `RevealRecord`, `PrePlanStep`), with
runtime code (sandbox execution, client-local PRNG, disruption detection)
to follow in WP-057 / WP-058. WP-059 is deferred per
`DESIGN-PREPLANNING.md §WP-059 Deferral Rationale`.

**May:** Import type definitions from `@legendary-arena/game-engine` via
`import type` only (e.g., `CardExtId`). Use Node built-ins. Read read-only
projections of engine state (via UI-layer snapshots; never via direct
engine runtime imports). Use a client-local seedable PRNG for speculative
deck shuffling (WP-057 scope; not introduced by WP-056). Maintain
disposable sandbox state and a reveal ledger that is the sole authority
for deterministic rewind.

**Must not:** Import `@legendary-arena/game-engine` runtime code (functions,
constants, helpers) — type-only imports only. Import `boardgame.io`,
`@legendary-arena/registry`, `apps/server`, any `apps/*` package, or `pg`.
Write to `G`, `ctx`, or any authoritative game state. Use `ctx.random.*`
(engine randomness is authoritative; preplan uses its own client-local
PRNG). Persist state to any storage (localStorage, sessionStorage,
IndexedDB, cookies, filesystem, database). Be wired into `game.ts`,
`LegendaryGame.moves`, phase hooks, or any engine lifecycle point — the
engine does not know preplan exists. Use `.reduce()` for branching logic
(code-style invariant inherited).

**Failure mode:** Layer-boundary violations (engine runtime leaking into
the preplan bundle or preplan state leaking into `G`). Information
leakage (sandbox state exposing hidden opponent data). Rewind correctness
gaps (rewind logic inspecting `sandboxState` directly instead of
consuming the `revealLedger`). Single-turn-scope violations (pre-plans
surviving past their `appliesToTurn = ctx.turn + 1` boundary).

**Directories:** `packages/preplan/` (D-5601)

---

### `server` — Server / Persistence

**What it is:** PostgreSQL access, network endpoints, process lifecycle,
rules text loading, PAR enforcement, security boundaries. Wires engine
into `boardgame.io Server()`.

**May:** Access databases. Load registry at startup. Pass data into engine
via `Game.setup()`. Handle process signals. Manage auth.

**Must not:** Implement game logic. Define moves or rules. Mutate or
inspect `G` beyond routing. Import UI packages.

**Failure mode:** Authority and trust violations. Data leaks. Deployment
issues.

**Directories:** `apps/server/` (including subdirectories such as
`apps/server/src/db/` (per WP-115 PS-3, 2026-05-01),
`apps/server/src/leaderboards/`, `apps/server/src/profile/`,
`apps/server/src/par/`, `apps/server/src/identity/`,
`apps/server/src/competition/`, `apps/server/src/replay/`,
`apps/server/src/rules/`, etc.; the `server` category covers all
descendants of `apps/server/` unless an explicit DECISIONS.md
entry carves out a sub-classification).

---

### `client-app` — Client App

**What it is:** Executable browser-side applications that render gameplay UI
for end users. The first instance is `apps/arena-client/` — a Vue 3 + Vite
SPA that consumes `UIState` projections from the engine and renders them
for match play.

**May:** Import engine **types only** (`import type` from
`@legendary-arena/game-engine`). Consume read-only projections. Use a UI
framework (Vue 3). Use `import.meta.env.DEV`-guarded dev harnesses. Mount
Pinia stores that hold the current projection snapshot.

**Must not:** Import engine runtime code (only `import type`). Import
`@legendary-arena/registry`. Import `boardgame.io`. Use `Math.random()`,
`Date.now()`, or `performance.now()`. Persist `UIState` to any storage
(localStorage, sessionStorage, IndexedDB, cookies). Implement gameplay
rules or compute game outcomes. Re-enter the engine.

**Failure mode:** Layer-boundary violations (engine runtime leaking into
the client bundle). State drift between client projection and authoritative
engine state. Bundle bloat from engine-runtime imports.

**Directories:** `apps/arena-client/` (D-6511)

---

### `cli-producer-app` — CLI Producer App

**What it is:** Executable Node.js command-line applications that wrap
engine helpers with file I/O to produce deterministic, portable
artifacts consumed by tests, CI, and downstream UI tooling. The first
instance is `apps/replay-producer/` — a Node 22+ CLI that wraps
`buildSnapshotSequence` and emits `ReplaySnapshotSequence` JSON for
`<ReplayInspector />` (WP-064) and future replay consumers.

**May:** Import `@legendary-arena/game-engine` runtime (unlike
`client-app`, which is type-only). Read from / write to the local
filesystem via `node:fs/promises`. Write to `stdout` / `stderr` with
`process.stdout` / `process.stderr`. Use `node:util` `parseArgs` for
argument parsing. Call `Date.now()` ONLY as a fallback when an
explicit `--produced-at`-style override flag is not supplied (the
override is the deterministic path; `Date.now()` is the
developer-convenience fallback). Emit non-zero exit codes with
full-sentence error messages on stderr. Enable Node sourcemaps via
`NODE_OPTIONS=--enable-source-maps` so stack traces point at
TypeScript.

**Must not:** Import `@legendary-arena/registry` unless
`Game.setup()` transitively requires it (mirror `apps/server/`
precedent). Import `boardgame.io` directly. Access PostgreSQL, R2,
or network endpoints. Implement gameplay rules. Mutate `G` or `ctx`.
Implement logic that belongs in the engine helper it wraps — the CLI
is strictly I/O + arg parsing + serialization. Use `Math.random()` or
`performance.now()` anywhere. Persist anything beyond the explicit
output artifact (no caches, no session files, no state dirs).

**Failure mode:** Non-deterministic artifacts (wall-clock leaking
into output). Layer-boundary violations (engine logic duplicated in
the CLI). Silent I/O failures that should surface as non-zero exits
with actionable messages. Sourcemap misconfiguration hiding the real
crash site.

**Directories:** `apps/replay-producer/` (D-6301)

---

### `docs-app` — Documentation / Reference Viewer App

**What it is:** Read-only viewer applications for documentation and
reference content. Render documentation (engineering wiki, registry
card data) for human consumption. Two instances at introduction:
`apps/registry-viewer/` (Vue 3 SPA visualizing card registry data) and
`apps/wiki-viewer/` (Hugo-built static site rendering `docs/wiki/`).

The category accommodates both build-time-only viewers (e.g., a Hugo
static-site generator that emits HTML at build time and runs no
JavaScript at runtime) and runtime SPAs that fetch / display reference
data via the registry layer. Per-app build-time vs runtime posture is
declared in the app's own README and config.

**May:** Import `@legendary-arena/registry` (types and runtime, where
the viewer's purpose is to display registry data). Use a UI framework
(Vue 3, or build-time template engines like Hugo). Read input files at
build time (e.g., `docs/wiki/*.md` for wiki-viewer). Render derived
content for human consumption. Be deployed as static or near-static
sites. Use `import.meta.env.DEV`-guarded dev harnesses.

**Must not:** Import `@legendary-arena/game-engine` (any —
runtime or type-only; doc viewers have no engine surface). Import
`@legendary-arena/preplan`. Import `apps/server/**`. Import
`boardgame.io`. Mutate engine state. Implement gameplay rules or
compute game outcomes. Persist content beyond browser-local state
(localStorage allowed for view preferences only). Use `Math.random()`,
`Date.now()`, or `performance.now()` in render paths.

**Failure mode:** Layer-boundary violations (engine runtime leaking
into a doc viewer bundle). Static-build determinism breaks
(timestamps, git info embedded in output). Doc-viewer evolving into a
gameplay surface.

**Directories:** `apps/registry-viewer/`, `apps/wiki-viewer/` (D-13807)

---

### `test` — Tests

**What it is:** Unit tests (pure engine), integration tests (moves +
engine), validation tests (registry / pipeline). All use `node:test` +
`node:assert`.

**May:** Use mocks (`makeMockCtx`, inline mock contexts). Assert
deterministic outcomes. Create minimal test game states.

**Must not:** Import `boardgame.io`. Contain business logic. Mutate
shared test helpers. Use `.test.mjs` extension. Require a live server.

**Failure mode:** False confidence from weak assertions. Test debt from
missing defensive guards for new `G` fields.

**Directories:** `**/*.test.ts`, `packages/game-engine/src/test/`

---

### `infra` — Data Pipeline / Infra

**What it is:** Conversion scripts, upload scripts, CI validators, git
hooks, PAR simulation tooling, commit hygiene enforcement. Never shipped
to players.

**May:** Perform IO. Use performance shortcuts. Run as one-off CLI tools.
Access R2/rclone.

**Must not:** Be imported by runtime code. Depend on engine internals.
Affect gameplay behavior.

**Failure mode:** Broken builds, corrupted uploads, missed validations.

**Directories:** `scripts/`, `.githooks/`, `.github/workflows/`,
`data/par/` (PAR artifacts)

---

### `docs` — Documentation / Governance

**What it is:** Work packets, execution checklists, pre-flight documents,
architecture docs, decisions log, data sources inventory, reference docs.

**May:** State normative truth. Define constraints and rationale. Record
decisions.

**Must not:** Contain suggestions disguised as rules. Drift from code
reality. Introduce requirements that conflict with ARCHITECTURE.md.

**Failure mode:** Governance drift. Stale documentation causing wrong
implementation decisions.

**Directories:** `docs/`, `.claude/`, `docs/ai/`

---

## How Categories Connect to Other Governance

| Governance artifact | How it uses categories |
|---|---|
| **Pre-flight (01.4)** | "Do all new/modified files belong to exactly one category and follow its constraints?" |
| **Execution Checklists** | EC allowlists map to categories — files outside the WP's categories are forbidden |
| **Pre-commit review** | Boundary integrity axis checks that no file blurs category boundaries |
| **ARCHITECTURE.md** | Authoritative source for layer boundaries that categories enforce |
| **`.claude/rules/*.md`** | Per-category enforcement rules loaded automatically by Claude Code |

---

## Rules

1. Every file belongs to exactly one category.
2. A file's category is determined by its directory, not by comments.
3. If a file needs to do something its category forbids, it belongs in a
   different category (move it or split it).
4. Categories are structural. If you can't tell which category a file
   belongs to from its path, the directory structure needs fixing.
5. Do not create new categories without a DECISIONS.md entry.
