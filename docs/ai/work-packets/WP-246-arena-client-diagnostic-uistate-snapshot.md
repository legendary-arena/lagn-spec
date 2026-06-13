# WP-246 — Arena Client Diagnostic UIState Snapshot (Richer Freeze Report)

> **Status:** DRAFT — pending review (do not execute until reviewed per
> `.claude/rules/work-packets.md` Review Gate).
> **Reserves:** D-24015.
> **Paired EC:** EC-277 (to be drafted alongside this WP before execution).
> **Depends on:** WP-228 (the diagnostic capture + export feature this extends).

---

## Session Context

> WP-228 shipped the always-on diagnostic capture + `DiagnosticExportButton.vue`
> (console/error ring buffer + credential-redacted scalar envelope, **no
> UIState/`G`/card data**, sole engine-import site `client/bgioClient.ts`
> untouched, D-22801). WP-228 §Out of Scope explicitly deferred "UIState / `G` /
> move-history / network-frame capture" to a follow-up — this is that follow-up,
> adding the **current UIState snapshot** only, without touching `bgioClient.ts`.

---

## Goal

After this session, the arena client's downloaded diagnostic report carries the
**current UIState snapshot** — the audience-filtered projection the player's own
client is rendering at the moment they click `Download diagnostics`. Today the
report records console output, uncaught errors, and a scalar context envelope
only; for every gameplay bug reported so far the buffer is empty (`entryCount:
0`) because a stuck game throws nothing and logs nothing — the report can confirm
"no crash" but nothing about game state. Adding the snapshot makes the report
self-diagnostic for silent gameplay bugs: the shared file will show
`pendingKoHeroChoice`, `pendingHeroChoice`, `currentStage`, every zone count, the
city/HQ, the mastermind, and the `notableEvents` trail at freeze time. The
capture surface, the ring buffer, the credential redaction, and the
`bgioClient.ts` boundary are all unchanged — the only new data is one read of the
existing Pinia `useUiStateStore().snapshot` at click time, threaded through the
pure report builder.

---

## Assumes

> **Drafting baseline (01.0a Step 2):** drafted against `origin/main` at
> `b10ba4e7` (2026-06-13). Supersession check (slug grep `--all`, file scan, and
> `gh pr list --search`) returned no collision — the diagnostic-UIState-snapshot
> work is new; the existing `*uistate*` WPs (WP-067 / WP-111 / WP-128 / WP-207)
> are unrelated projections.

- **WP-228 complete.** Specifically:
  - `apps/arena-client/src/diagnostics/diagnostics.ts` exports
    `buildDiagnosticReport(entries, context)`, `serializeDiagnosticReport`,
    `buildDiagnosticFileName`, `getDiagnosticEntries`, `getDroppedEntryCount`,
    and the `DiagnosticContext` / `DiagnosticReport` / `DiagnosticEntry` types
    (WP-228).
  - `apps/arena-client/src/components/DiagnosticExportButton.vue` builds the
    context in a `collectContext(capturedAtMs)` helper and passes it to
    `buildDiagnosticReport` (WP-228); it uses
    `defineComponent({ setup() { return {...} } })` per D-6512.
  - `apps/arena-client/src/diagnostics/diagnostics.test.ts` exists with the
    WP-228 `node:test` coverage.
  - D-22801 is Active and documents the WP-228 capture/export posture (its
    "no UIState/`G`" clause is the clause this WP amends).
- **WP-061 complete.** `apps/arena-client/src/stores/uiState.ts` exports
  `useUiStateStore`, a Pinia store whose only state field is
  `snapshot: UIState | null`, written by `client/bgioClient.ts`'s `subscribe`
  callback and read across the HUD.
- The arena-client test harness is native `node:test` run via
  `node --import tsx --import @legendary-arena/vue-sfc-loader/register --test
  src/**/*.test.ts` (the `test` script in `apps/arena-client/package.json`), with
  a jsdom environment from `src/testing/jsdom-setup.ts` (provides `window`,
  `document`, `navigator`, `localStorage`, and the build-stamp globals).
- No backend, engine, registry, preplan, or other-app change is required: the
  snapshot is read from the existing client store, not fetched or recomputed.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"` — confirm
  `apps/arena-client` may consume engine **types** but takes its sole engine
  **runtime** import through `client/bgioClient.ts`. This WP adds **no** engine
  import (type or runtime) to any modified file: the snapshot is read from the
  Pinia store and typed `unknown` in `diagnostics.ts`; `bgioClient.ts` is not
  touched.
- `docs/ai/ARCHITECTURE.md §"Persistence Boundary"` — confirm the diagnostic
  report stays a client-only download/clipboard payload: never persisted, never
  sent to the server. Adding the snapshot does not change this — the snapshot is
  already in the client's memory (the store) and leaves only via the existing
  user-initiated download.
- `docs/ai/work-packets/WP-228-arena-client-diagnostic-capture-export.md` —
  read §Scope, §Out of Scope ("UIState / `G` / move-history ... Deferred to a
  follow-up"), and §Non-Negotiable Constraints. This WP relaxes exactly one of
  those constraints ("No `G`/`ctx`/UIState/card data in the report") and inherits
  the rest verbatim.
- `apps/arena-client/src/diagnostics/diagnostics.ts` — read entirely. The new
  field is added to `DiagnosticContext` and `DiagnosticReport`, and
  `buildDiagnosticReport` carries it through. The module must stay engine-free.
- `apps/arena-client/src/components/DiagnosticExportButton.vue` — read entirely.
  The `collectContext(capturedAtMs)` helper is the only function modified.
- `apps/arena-client/src/stores/uiState.ts` — confirm the store name
  (`'uiState'`), the `snapshot` field, and the `useUiStateStore` export before
  reading it from the button.
- `docs/ai/DECISIONS.md` — read D-22801 (WP-228 posture, whose "no UIState"
  clause this WP amends) and D-6512 (SFC `defineComponent` requirement) before
  reserving D-24015.
- `.claude/rules/code-style.md` and `docs/ai/REFERENCE/00.6-code-style.md` —
  human-style code rules every modified file must satisfy (explicit control flow,
  descriptive names, JSDoc on every function, `// why:` on non-obvious decisions,
  full-sentence error messages, no `.reduce()` for multi-step logic).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Output the **full file contents** for every modified file. Diffs, snippets,
  and "show only the changed section" are forbidden.
- ESM only; Node v22+; no CommonJS, no `require()`.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (explicit control
  flow, descriptive names, JSDoc on every function, `// why:` on non-obvious
  decisions, full-sentence error messages, no `.reduce()` for multi-step logic).

**Packet-specific:**
- **No engine import added.** `diagnostics.ts` stays free of every
  `@legendary-arena/*`, `apps/server`, `pg`, and `boardgame.io` import (type or
  runtime); the new `uiStateSnapshot` field is typed `unknown`, never `UIState`.
  `DiagnosticExportButton.vue` imports only the client Pinia store
  (`useUiStateStore` from `../stores/uiState`) — a client module, not an engine
  surface. `client/bgioClient.ts` (the sole engine-import site) and `App.vue` are
  **not** modified.
- **No new capture surface, no subscribe hook.** This WP does not hook
  `client.subscribe`, does not add a snapshot history/ring buffer, and does not
  alter the console/error capture. The snapshot is read **once at click time**
  from the store inside `collectContext`. A reload still clears everything
  (capture is in-memory per page load, per WP-228).
- **Snapshot is the player's own audience-filtered projection.** The value read
  is exactly what the server already pushed to this client via
  `filterUIStateForAudience` and stored in `useUiStateStore().snapshot`. It
  therefore carries no other player's hidden cards and opens no cross-player
  visibility surface — it is the same data the player's HUD already renders.
- **Null-safe.** When no match is active the store snapshot is `null`; the report
  carries `uiStateSnapshot: null` and serializes cleanly. The button reads the
  store value verbatim and never throws when it is `null`.
- **Credential redaction unchanged and still a hard invariant.** The
  `credentials` query-param value is still redacted out of `locationHref` before
  the report is built; the UIState snapshot does not contain the credentials
  value. The existing credential-safety test stays green.
- **No persistence, no network.** The snapshot leaves the client only via the
  existing user-initiated file download and clipboard copy. Nothing in this WP
  issues a `fetch`/WebSocket send or writes to a store.
- **Strict builder purity (enforced hard contract).** `buildDiagnosticReport(entries,
  context)` reads ONLY its two parameters. It performs ZERO reads of: any clock or
  timer (`Date.*`, `performance.*`); `window` / `document` / `navigator`; any Pinia
  store; any environment variable or ambient global. It applies ZERO transformation
  to `context.uiStateSnapshot` beyond a single direct structural assignment onto the
  report. Any deviation is a HARD FAIL. The one store read lives in the impure caller
  (`collectContext`), never in the builder.
- **Snapshot immutability (hard invariant).** `uiStateSnapshot` is passed through
  AS-IS: no mutation, no field filtering, no deep clone, no normalization, no
  transformation, no intermediate layer between `context.uiStateSnapshot` and
  `report.uiStateSnapshot`. The builder assigns the exact reference it was given, so
  before serialization `report.uiStateSnapshot === context.uiStateSnapshot` holds.
  The serialized report is the freeze-frame truth — its snapshot is byte-faithful to
  what the store held at click.
- **`unknown` is opaque — no narrowing.** The `uiStateSnapshot` field MUST NOT be
  type-narrowed, cast (to `UIState`, `any`, or anything else), or inspected inside
  `diagnostics.ts`; it exists purely as opaque data for serialization. Treating it as
  opaque is what keeps this module free of any engine type dependency.
- `DiagnosticExportButton.vue` keeps `defineComponent({ setup() { return {...} }
  })` (NOT `<script setup>`) per D-6512.
- No new npm dependencies. No `Math.random()`. The existing client-layer
  wall-clock reads keep their `// why:` comments; this WP adds no new clock read.
- Additive only: `git diff --name-only` at close lists exactly the files in
  `## Files Expected to Change` and nothing else; `client/bgioClient.ts` and
  `App.vue` are absent from the diff.

**Session protocol:**
- If the store name, the `snapshot` field shape, or the `collectContext`
  structure appears to conflict with the actual files, **stop and ask** — do not
  guess a different store accessor, field name, or capture point.

**Locked Contract Values:**
- New field name (both `DiagnosticContext` and `DiagnosticReport`):
  `uiStateSnapshot`, type `unknown`, value = `useUiStateStore().snapshot`
  (a `UIState` object or `null`).
- Store accessor: `useUiStateStore` from `apps/arena-client/src/stores/uiState.ts`;
  field read: `.snapshot`.
- Report field order: `uiStateSnapshot` is appended after the existing scalar
  envelope fields and before `entries` (the entries array stays last).
- Inherited from WP-228 and unchanged: `DIAGNOSTIC_BUFFER_CAP = 200`; redaction
  literal `***redacted***`; button label `Download diagnostics`; download file
  name `legendary-arena-diagnostics-<matchIdOrNoMatch>-<capturedAtMs>.json`;
  capture install site `main.ts` (ungated); button mount site `PlayViewport.vue`.

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection.

- `buildDiagnosticReport` is pure: given identical `(entries, context)` it
  returns a byte-identical report (the new field is a structural copy of
  `context.uiStateSnapshot`). Tests pass the snapshot explicitly — no ambient
  read.
- The feature is externally observable: the serialized report either contains the
  `uiStateSnapshot` object or `null`; a `node:test` case asserts both.
- No state mutation is introduced — the store is read, never written. After
  export the store snapshot is byte-identical to before.
- This packet appends nothing to `G.messages` (it is client-only and touches no
  engine state).

---

## Scope (In)

### A) `apps/arena-client/src/diagnostics/diagnostics.ts` — modified
- Add `uiStateSnapshot: unknown` to the `DiagnosticContext` interface (the impure
  caller supplies it) and to the `DiagnosticReport` interface (the serialized
  envelope carries it).
- In `buildDiagnosticReport(entries, context)`, set
  `uiStateSnapshot: context.uiStateSnapshot` on the returned report, positioned
  after the scalar envelope fields and before `entries`. No other logic changes.
- Add a `// why:` comment on the `unknown` typing: the snapshot is the already-
  audience-filtered UIState projection read from the Pinia store by the caller;
  typing it `unknown` keeps this module free of any engine import (it is only
  serialized, never inspected).
- JSDoc on `DiagnosticReport` / `DiagnosticContext` updated to mention the new
  field and that it is the player's own audience-filtered projection (or `null`).

### B) `apps/arena-client/src/components/DiagnosticExportButton.vue` — modified
- Import `useUiStateStore` from `../stores/uiState`.
- In `collectContext(capturedAtMs)`, add `uiStateSnapshot: useUiStateStore().snapshot`
  to the returned context object. Add a `// why:` comment: the snapshot is read
  once at click time from the store the live client already maintains; it is the
  player's own audience-filtered view (no cross-player data, no engine import).
- No other change to the file; the component keeps `defineComponent({ setup })`.

### C) `apps/arena-client/src/diagnostics/diagnostics.test.ts` — modified
Add `node:test` cases (existing cases stay byte-identical):
- **Reference identity:** a report built from a context carrying a non-null
  `uiStateSnapshot` object has `report.uiStateSnapshot === context.uiStateSnapshot`
  (the exact reference — proves no clone or transformation), and
  `serializeDiagnosticReport` → `JSON.parse` round-trips to a value **deep-equal** to
  the original snapshot (`assert.deepEqual`).
- **Null-safe:** a report built from a context whose `uiStateSnapshot` is `null`
  carries `uiStateSnapshot: null` and serializes cleanly.
- **Immutability / purity:** pass a `Object.freeze`-d sentinel snapshot; the snapshot
  passes through unmodified (no throw, structurally unchanged) and the report's value
  is that same frozen reference — proving the builder neither mutates nor clones and
  reads no ambient global.
- **Credential-safety with a snapshot present:** a report whose context has a
  redacted `locationHref` and a populated snapshot contains `***redacted***` and zero
  occurrences of the secret.

---

## Out of Scope

- **Snapshot history / ring buffer of past UIState frames.** v2 captures only the
  single current snapshot at click time. A rolling buffer of recent frames would
  require hooking `client.subscribe` in `bgioClient.ts` (the sole engine-import
  site) — deferred. The current snapshot's `notableEvents` array already provides
  the recent "what happened" trail.
- **`bgioClient.ts` / `App.vue` / store modifications.** The store is read, never
  changed; `bgioClient.ts` (subscribe write path) and `App.vue` (router) are not
  touched.
- **On-click `[DIAG_EXPORT]` correlation marker.** Still deferred (WP-228
  §Out of Scope); the report already records `capturedAtIso` and now the full
  snapshot at the click moment.
- **Server-side upload / telemetry / automatic reporting.** Zero network egress
  remains; the operator shares the downloaded file manually.
- **Redaction of the snapshot.** None is added or needed: the snapshot is already
  audience-filtered server-side (`filterUIStateForAudience`) and is the player's
  own view, in a file they themselves download. Broadening redaction is a
  follow-up only if a future capture surface ever includes unfiltered state.
- **`G`/`ctx` capture.** Out of scope and impossible client-side — the client
  never holds raw `G`; only the audience-filtered UIState projection exists.

---

## Files Expected to Change

- `apps/arena-client/src/diagnostics/diagnostics.ts` — **modified** — add
  `uiStateSnapshot: unknown` to `DiagnosticContext` + `DiagnosticReport`;
  `buildDiagnosticReport` carries it through.
- `apps/arena-client/src/components/DiagnosticExportButton.vue` — **modified** —
  import `useUiStateStore`; add `uiStateSnapshot: useUiStateStore().snapshot` to
  `collectContext`.
- `apps/arena-client/src/diagnostics/diagnostics.test.ts` — **modified** — add
  snapshot-present / snapshot-null / purity / credential-safety-with-snapshot
  cases.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-246 with the
  Definition-of-Done summary line.
- `docs/ai/DECISIONS.md` — **modified** — flip D-24015 from Reserved (proposed)
  to Active.
- `docs/ai/STATUS.md` — **modified** — record what changed this session.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip the EC-277 row
  Pending → Done.

**Total: 7 files** (3 modified source + 4 governance: `WORK_INDEX.md`,
`DECISIONS.md`, `STATUS.md`, `EC_INDEX.md`). No new files; the change is one
field threaded through one pure builder plus one store read.

---

## Vision Alignment

**Vision clauses touched:** §3 (player identity), §11 (accounts/visibility),
§22 (determinism) — each addressed below; **no conflict.**

This WP enriches a player-facing diagnostic export (visible to any player on the
live-play surface), so the §17.2 Non-Goal proximity check applies and is
performed explicitly:

- **Non-Goal proximity (NG-1..7):** none crossed. The snapshot is a
  troubleshooting aid in a file the player downloads — not paid, persuasive,
  competitive, or pay-to-win, and it confers no in-game advantage.
- **Identity / visibility (§3, §11):** the snapshot is the player's **own**
  audience-filtered UIState — exactly the projection the server already pushed to
  their client via `filterUIStateForAudience` and which their HUD already
  renders. It contains no other player's hidden cards and creates no new
  cross-player visibility surface. The session `credentials` value remains
  redacted (`***redacted***`); the snapshot does not contain it.
- **Determinism (§22):** not engaged. No scoring/replay/RNG/simulation surface is
  touched; the snapshot is read from the client store, and the single
  engine-import site (`client/bgioClient.ts`) is unmodified. The pure builder
  stays deterministic (same inputs → byte-identical report).

## Funding Surface Gate

**N/A — justified.** No funding affordances, no "donate/support/tournament
funding" copy, and no funding-channel integration are added or referenced; this
WP only enriches an internal diagnostic export payload.

## API Catalog (§21)

**N/A — justified.** Client-only change: no HTTP endpoint is added, modified, or
removed, and no `apps/server/src/**` library function is touched. The snapshot is
read from the client Pinia store with zero network egress;
`docs/ai/REFERENCE/api-endpoints.md` is unaffected.

---

## Lint Gate Self-Review

Run against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (§1–§21).
**Verdict: PASS** — all applicable sections satisfied; N/A sections carry a named
justification (no bare/tautological N/A); no Final Gate FAIL condition (1–38)
triggers.

- **§1 Structure** — PASS. All required sections present; `## Out of Scope` lists
  six explicit exclusions.
- **§2 Non-Negotiable Constraints** — PASS. Engine-wide block requires full file
  contents, forbids diffs/snippets, states ESM + Node v22+, references
  `00.6-code-style.md`; packet-specific + session protocol + locked contract
  values present.
- **§3 Assumes** — PASS. WP-228 (the extended feature + its exact exports),
  WP-061 (`useUiStateStore` + `snapshot` field), and the `node:test`+`tsx`+jsdom
  harness each cite their source; "no backend change" is stated.
- **§4 Context** — PASS. ARCHITECTURE §Layer Boundary + §Persistence Boundary,
  WP-228, the three modified source files, the store, and DECISIONS (D-22801,
  D-6512) are cited specifically.
- **§5 Files Expected to Change** — PASS. Seven files, each `modified` with a
  one-line description; bounded (≤ 8); no patch-based output language.
- **§6 Naming** — PASS. `uiStateSnapshot`, `useUiStateStore`, `DiagnosticReport`,
  `DiagnosticContext`, `buildDiagnosticReport`, `collectContext` match the
  shipped client surface; no abbreviations; `matchId`/`playerId` unchanged.
- **§7 Dependency Discipline** — PASS. "No new npm dependencies" stated; store +
  pure module only; no forbidden package reachable.
- **§8 Architectural Boundaries** — PASS. Client-only; zero engine/registry/
  server/preplan import in the modified files (snapshot typed `unknown`; store is
  a client module); no game logic; no DB; no persistence; `bgioClient.ts`
  untouched; export stays read-only / no-egress.
- **§9 Windows Compatibility** — PASS. Verification uses `pnpm --filter` + `grep`
  (Git Bash) + `git diff`; no Unix-only assumption.
- **§10 Env Var Hygiene** — N/A — justified. No new env vars; the build-stamp
  globals are pre-existing Vite `define` values, read not introduced.
- **§11 Authentication** — N/A — justified. No auth surface touched; the existing
  `credentials` redaction is preserved, no identity model added.
- **§12 Test Quality** — PASS. `node:test` via `tsx` + jsdom; ≥ 4 net-new cases
  (snapshot present, snapshot null, builder purity, credential-safety-with-
  snapshot); no `boardgame.io` import; no network/DB; timestamps/snapshots passed
  explicitly.
- **§13 Verification Steps** — PASS. Exact `pnpm --filter` test/typecheck/build +
  boundary grep + `bgioClient.ts`/`App.vue` untouched check + `git diff`, each
  with expected output.
- **§14 Acceptance Criteria** — PASS. Eight binary, observable, file/symbol-
  specific checks aligned to the deliverables.
- **§15 Definition of Done** — PASS. Includes AC-pass, STATUS, DECISIONS,
  WORK_INDEX, EC_INDEX, and the scope-boundary check.
- **§16 Code Style** — PASS. WP mandates 00.6 human-style code, JSDoc, `// why:`
  on the `unknown` typing + the store read; small single-responsibility
  functions; no premature abstraction (one field threaded through an existing
  builder).
- **§17 Vision Alignment** — PASS. `## Vision Alignment` present with cited
  clauses (§3, §11, §22) and the mandatory NG-1..7 proximity line; no conflict.
- **§18 Prose-vs-Grep Discipline** — PASS. The verification greps target engine-
  import paths and symbol names; no Verification Step declares a literal
  forbidden-token grep whose tokens are restated verbatim in adjacent prose.
- **§19 Bridge-vs-HEAD Staleness** — N/A — justified. Not a repo-state-
  summarizing artifact; §19 is commit-time discipline, not a WP-lint Final-Gate
  condition.
- **§20 Funding Surface Gate** — PASS. `## Funding Surface Gate` present with a
  reasoned N/A.
- **§21 API Catalog** — PASS. `## API Catalog (§21)` present with a reasoned N/A
  (client-only; no HTTP endpoint or `apps/server/src/**` library function; no
  network egress).

---

## Pre-Flight & Copilot Verdicts (01.0a Step 5)

Gate order per 01.0a Step 5 (pre-flight → copilot → lint), all run in the drafting
session against this WP + EC-277, baseline `origin/main` @ `b10ba4e7`:

- **Pre-flight (01.4): READY TO EXECUTE** (2026-06-13). Class: Contract-Only (client). Repo
  green (arena-client `test` 539/0, `vue-tsc` 0, `build` 0). Dependencies WP-228 ✅ + WP-061 ✅;
  contracts verified against actual source; scope locked to 7 files; risks RS-1..4 resolved; no
  blocking PS items. Scratchpad: `docs/ai/invocations/preflight-wp246.md`.
- **Copilot check (01.7): PASS → CONFIRM** (2026-06-13). All 30 issues scan to PASS; #21 (`unknown`
  widening), #17 (intentional reference-aliasing), #19 (serializability) are PASS-by-construction
  with explicit rationale, not gaps. No RISK/BLOCK. Scratchpad: `docs/ai/invocations/copilot-wp246.md`.
- **Lint gate (00.3):** PASS (see `## Lint Gate Self-Review` above) — re-confirmed after the
  §Assumes baseline + this verdict record were added; neither changed scope or contract.

---

## Acceptance Criteria

1. `apps/arena-client/src/diagnostics/diagnostics.ts` declares `uiStateSnapshot:
   unknown` on both the `DiagnosticContext` and `DiagnosticReport` interfaces, and
   the module still imports nothing from `@legendary-arena/(game-engine|registry|
   preplan)`, `apps/server`, `pg`, or `boardgame.io` (type or runtime).
2. `buildDiagnosticReport(entries, context)` assigns `report.uiStateSnapshot ===
   context.uiStateSnapshot` — the exact reference, with no clone, field filtering,
   normalization, or intermediate transformation layer between context and report —
   and performs no ambient clock / `window` / `navigator` / store / global read.
   A report built from a sentinel snapshot serializes and `JSON.parse`-round-trips to
   a value structurally **deep-equal** to that sentinel, with no derived or altered
   content.
3. A report built from a context whose `uiStateSnapshot` is `null` serializes to
   JSON containing `"uiStateSnapshot": null` and round-trips cleanly.
4. `apps/arena-client/src/components/DiagnosticExportButton.vue` imports
   `useUiStateStore` from `../stores/uiState` and `collectContext` returns a
   context whose `uiStateSnapshot` is `useUiStateStore().snapshot`; the component
   still uses `defineComponent({ setup() { return {...} } })` and adds no engine
   import.
5. The credential-safety invariant holds with a snapshot present: a serialized
   report whose context has a redacted `locationHref` and a populated snapshot
   contains `***redacted***` and zero occurrences of the secret credentials
   value.
6. `client/bgioClient.ts` and `App.vue` are byte-identical to baseline
   (`git diff --name-only` lists neither).
7. `pnpm --filter @legendary-arena/arena-client test` passes with ≥ 4 net-new
   `node:test` cases and no pre-existing test regresses; `pnpm --filter
   @legendary-arena/arena-client typecheck` exits 0 (`vue-tsc` green); `pnpm
   --filter @legendary-arena/arena-client build` exits 0.
8. `git diff --name-only` lists exactly the seven files in
   `## Files Expected to Change` — no store, `bgioClient.ts`, `App.vue`, or
   other-app/package file is modified.

---

## Verification Steps

```pwsh
# Step 1 — arena-client tests
pnpm --filter @legendary-arena/arena-client test
# Expected: all pass, fail 0; includes the net-new uiStateSnapshot cases.

# Step 2 — typecheck (must stay green)
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exits 0, no vue-tsc errors.

# Step 3 — build
pnpm --filter @legendary-arena/arena-client build
# Expected: built, exit 0.

# Step 4 — engine/boundary import gate (modified files import no engine surface)
grep -rnE "@legendary-arena/(game-engine|registry|preplan)|apps/server|boardgame\.io|from 'pg'" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue
# Expected: zero matches.

# Step 5 — the snapshot is read from the store, not via subscribe/engine
grep -n "useUiStateStore" apps/arena-client/src/components/DiagnosticExportButton.vue
# Expected: one import line + one `.snapshot` read in collectContext.

# Step 6 — network/persistence gate
grep -rnE "fetch\(|WebSocket|\.emit\(|localStorage|sessionStorage" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue
# Expected: zero matches.

# Step 7 — sole engine-import site + router untouched
git diff --name-only -- apps/arena-client/src/client/bgioClient.ts apps/arena-client/src/App.vue
# Expected: empty.

# Step 8 — additive scope
git diff --name-only
# Expected: exactly the seven Files Expected to Change paths.
```

---

## Definition of Done

- [ ] All Acceptance Criteria (1–8) pass.
- [ ] `docs/ai/STATUS.md` updated with what changed this session.
- [ ] `docs/ai/DECISIONS.md` D-24015 flipped Reserved (proposed) → Active,
      byte-identical to the EC-277 §DECISIONS.md Verbatim Block.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-246 row checked off with the
      Definition-of-Done summary line.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-277 row flipped
      Pending → Done.
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only` confirms; `bgioClient.ts` + `App.vue` absent).
- [ ] Paired EC-277 satisfied (locked values transcribed and checked).
