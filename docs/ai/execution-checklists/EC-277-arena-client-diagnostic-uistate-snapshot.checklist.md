# EC-277 — Arena Client Diagnostic UIState Snapshot (Execution Checklist)

**Source:** docs/ai/work-packets/WP-246-arena-client-diagnostic-uistate-snapshot.md
**Layer:** Arena Client — `apps/arena-client/src/diagnostics/diagnostics.{ts,test.ts}` (modified) + `apps/arena-client/src/components/DiagnosticExportButton.vue` (modified — 1 import + 1 context field)

> Use locked values from WP-246 verbatim. EC-277 is the operational order +
> gates + failure smells; if EC-277 and WP-246 conflict, WP-246 wins.

## Before Starting
- [ ] **WP-228 landed** — `apps/arena-client/src/diagnostics/diagnostics.ts`
  exports `buildDiagnosticReport` / `serializeDiagnosticReport` /
  `buildDiagnosticFileName` and the `DiagnosticContext` / `DiagnosticReport`
  types; `DiagnosticExportButton.vue` has a `collectContext(capturedAtMs)`
  helper. Verify:
  `grep -nE "buildDiagnosticReport|interface DiagnosticContext|interface DiagnosticReport" apps/arena-client/src/diagnostics/diagnostics.ts`.
- [ ] **WP-061 landed** — `apps/arena-client/src/stores/uiState.ts` exports
  `useUiStateStore` with a `snapshot: UIState | null` field. Verify:
  `grep -nE "useUiStateStore|snapshot" apps/arena-client/src/stores/uiState.ts`.
- [ ] Read WP-246 §Goal, §Non-Negotiable Constraints, §Acceptance Criteria —
  authoritative.
- [ ] `pnpm --filter @legendary-arena/arena-client test` + `typecheck` + `build`
  exit 0 (anchor the baseline arena-client test count; vue-tsc green — do not
  regress).

## Locked Values (verbatim from WP-246 — do not re-derive)
- **New field (both `DiagnosticContext` and `DiagnosticReport`):**
  `uiStateSnapshot`, type `unknown`, value = `useUiStateStore().snapshot`
  (a `UIState` object or `null`).
- **Store accessor:** `useUiStateStore` from
  `apps/arena-client/src/stores/uiState.ts`; field read: `.snapshot`.
- **Report field order:** `uiStateSnapshot` appended AFTER the existing scalar
  envelope fields and BEFORE `entries` (entries stays last).
- **Inherited from WP-228, unchanged:** `DIAGNOSTIC_BUFFER_CAP = 200`; redaction
  literal `***redacted***`; button label `Download diagnostics`; file name
  `legendary-arena-diagnostics-<matchIdOrNoMatch>-<capturedAtMs>.json`; capture
  install site `main.ts` (ungated); button mount site `PlayViewport.vue`.

## Guardrails

> **Inherit all WP-246 §Non-Negotiable Constraints verbatim** (ESM, full file
> contents — no diffs/snippets, no new npm deps, no `Math.random`, no new clock
> read, human-style code). EC-277 below lists only the execution-critical hard
> contracts + validation greps + run order + failure detection; it does not restate
> every WP constraint.

- **No engine import added (HARD FAIL).** `diagnostics.ts` stays free of every
  `@legendary-arena/*`, `apps/server`, `pg`, and `boardgame.io` import (type or
  runtime); the field is typed `unknown`, NEVER `UIState`.
  `DiagnosticExportButton.vue` imports ONLY `useUiStateStore` from
  `../stores/uiState` (a client module).
- **`client/bgioClient.ts` + `App.vue` NOT modified (HARD FAIL).** No `subscribe`
  hook; the snapshot is read ONCE at click in `collectContext`, never buffered.
- **Strict builder purity (enforced HARD FAIL).** `buildDiagnosticReport` reads ONLY
  `(entries, context)` — ZERO reads of any clock/timer (`Date.*`/`performance.*`),
  `window`/`document`/`navigator`, any Pinia store, or any env/global; ZERO
  transformation of `uiStateSnapshot` beyond one direct structural assignment.
- **Snapshot immutability (HARD invariant).** `uiStateSnapshot` passes through AS-IS
  — no mutation, field filtering, deep clone, normalization, or intermediate layer
  between context and report. `report.uiStateSnapshot === context.uiStateSnapshot`
  (exact reference) before serialization — freeze-frame truth.
- **`unknown` is opaque (HARD FAIL).** No type-narrowing, cast (to `UIState`/`any`),
  or inspection of `uiStateSnapshot` inside `diagnostics.ts`.
- **Snapshot is the player's own audience-filtered view.** Already
  `filterUIStateForAudience`-filtered — no cross-player data, no new redaction.
- **Null-safe.** No active match → `null` → report carries `uiStateSnapshot: null`,
  serializes cleanly, never throws.
- **Credential redaction unchanged + still a hard invariant.** Serialized report
  contains ZERO occurrences of the real `credentials` value with a snapshot present.
- **No network, no persistence; no snapshot history; no new capture surface.** The
  console/error capture, ring buffer, and redaction are untouched.
- **`DiagnosticExportButton.vue` keeps `defineComponent({ setup })`** per D-6512.

## Required `// why:` Comments
- `diagnostics.ts` — `// why:` the new field is typed `unknown` because it is the
  already-audience-filtered UIState projection read from the Pinia store by the
  caller; it is only serialized, never inspected — keeping this module free of
  any engine import. **Phrase generically ("any engine import"); do NOT write the
  literal package/framework token names** — the After-Completing boundary grep
  scans this file and a comment naming a policed literal trips it (see
  `feedback_grep_gate_comment_self_trip` precedent + EC rules §grep-gate prose).
- `DiagnosticExportButton.vue` — `// why:` the snapshot is read once at click from
  the store the live client already maintains; it is the player's own
  audience-filtered view (no cross-player data).

## Files to Produce
- `apps/arena-client/src/diagnostics/diagnostics.ts` — **modified** — add
  `uiStateSnapshot: unknown` to `DiagnosticContext` + `DiagnosticReport`;
  `buildDiagnosticReport` carries it through (after scalars, before `entries`).
- `apps/arena-client/src/components/DiagnosticExportButton.vue` — **modified** —
  import `useUiStateStore`; add `uiStateSnapshot: useUiStateStore().snapshot` to
  `collectContext`.
- `apps/arena-client/src/diagnostics/diagnostics.test.ts` — **modified** — add
  ≥ 4 cases: snapshot-present round-trip; snapshot-null serializes; builder
  purity (copies supplied snapshot, no ambient read); credential-safety with a
  snapshot present.
- `docs/ai/STATUS.md` — **modified** — `### WP-246 / EC-277 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-24015 Reserved (proposed) → Active,
  byte-identical to §DECISIONS.md Verbatim Block below.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-246 `[x]` with the DoD
  summary line.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip the EC-277 row
  Pending → Done.

**Total: 7 files** (3 modified source + 4 governance: `STATUS.md`,
`DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`), per WP-246 §Files Expected to
Change.

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0; ≥ 4 net-new
  cases; no pre-existing test regresses.
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (vue-tsc
  green).
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0.
- [ ] Engine/boundary import grep (modified source):
  `grep -rnE "@legendary-arena/(game-engine|registry|preplan)|apps/server|boardgame\.io|from 'pg'" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue`
  returns 0.
- [ ] **Single-read invariant.** `DiagnosticExportButton.vue` contains exactly: one
  `import { useUiStateStore }` line; exactly one `useUiStateStore()` call expression;
  exactly one `.snapshot` property access (inside `collectContext`). Verify
  `grep -c "useUiStateStore" <file>` = 2 (import + call) and
  `grep -c "\.snapshot" <file>` = 1. If grep is ambiguous (e.g. `.snapshot` named in
  a comment), confirm manually that no shadow variable or second/ recomputed read
  exists.
- [ ] Network/persistence grep:
  `grep -rnE "fetch\(|WebSocket|\.emit\(|localStorage|sessionStorage" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue`
  returns 0.
- [ ] `git diff --name-only -- apps/arena-client/src/client/bgioClient.ts apps/arena-client/src/App.vue`
  is EMPTY.
- [ ] Credential-safety: a serialization test asserts a credentials-bearing URL +
  populated snapshot yields a report containing `***redacted***` and NOT the
  secret.
- [ ] Null-safe: a report built with `uiStateSnapshot: null` serializes to JSON
  containing `"uiStateSnapshot": null`.
- [ ] Reference identity + immutability: a test asserts `report.uiStateSnapshot ===
  context.uiStateSnapshot` (no clone/transform) and that a `Object.freeze`-d sentinel
  snapshot passes through unmodified and round-trips deep-equal (`assert.deepEqual`).
- [ ] **No stealth drift.** `git diff --name-only` lists exactly the 7 files, AND the
  diff WITHIN each of the 3 modified source files is limited to the `uiStateSnapshot`
  field addition (+ its `// why:`), the store read in `collectContext`, and the
  net-new test cases. Any unrelated edit within the 7 files = FAIL (reviewer confirms
  via `git diff`).
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-24015 Active
  byte-identical to §Verbatim Block; `WORK_INDEX.md` WP-246 `[x]`; `EC_INDEX.md`
  EC-277 → Done.

## Commit Discipline (`.githooks/commit-msg` — enforced)
- The execution commit stages `apps/arena-client/**` code, so Rule 5 (D-20801)
  requires an `EC-###:` or `INFRA:` prefix and **rejects `SPEC:` for code**. Use
  `EC-277: <present-tense summary>` (≥ 12 chars after the prefix).
- Avoid the hook's forbidden subject words (`WIP`, `fix stuff`, `misc`, `tmp`,
  `updates`, `changes`, `debug` — case-insensitive substring).
- Co-staging `EC_INDEX.md` (Pending → Done) under an `EC-277:` prefix triggers a
  **non-blocking** Rule 6 warning — the sanctioned "index update at WP completion"
  case; proceed.
- The companion drafting commit `SPEC: draft WP-246 + EC-277 [D-24015]` is
  docs-only (no `apps/`/`packages/` paths), so `SPEC:` is valid there.

## Hard Fail Conditions (any one = failed execution)
- `diagnostics.ts` imports any engine surface, OR types `uiStateSnapshot` as
  `UIState` (or narrows/casts/inspects it) → FAIL.
- `buildDiagnosticReport` reads any ambient state (clock / `window` / `navigator` /
  store / global) → FAIL.
- `uiStateSnapshot` is cloned, filtered, normalized, or mutated anywhere on the
  context → report path → FAIL.
- The snapshot read occurs outside `collectContext`, or more than once → FAIL.
- `client/bgioClient.ts` or `App.vue` is modified → FAIL.
- The serialized report omits `***redacted***`, or contains the real `credentials`
  value → FAIL (secret leak).
- An edit unrelated to the field add / store read / new tests appears within the 7
  files → FAIL (stealth drift).

## Common Failure Smells
- A `// why:` comment in `diagnostics.ts` that names a policed import literal →
  trips the boundary grep (returns > 0) = false-positive HARD FAIL; phrase the
  comment generically.
- The new field typed `UIState` (importing the engine type) instead of `unknown`
  → engine import in `diagnostics.ts` = layer-boundary violation.
- A diff touching `client/bgioClient.ts` (adding a subscribe hook for snapshot
  history) → out of scope; v2 reads the current snapshot only.
- `buildDiagnosticReport` reading the store internally → not pure; breaks the
  report-shape test. The store read must live in `collectContext`.
- `DiagnosticExportButton.vue` rewritten as `<script setup>` → template binding
  resolution fails under the vue-sfc-loader pipeline (D-6512).
- vue-tsc errors reappear → a `UIState` type reference leaked into a modified
  file; the snapshot must be carried as `unknown`.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> The D-24015 entry lands in `docs/ai/DECISIONS.md` at draft time as
> `Reserved (proposed)` and flips to `Active` at the execution-close governance
> commit, byte-identical to the block below. Status is the only field that
> changes.

**D-24015: Diagnostic Report Carries the Current UIState Snapshot (Amends D-22801's "No UIState" Clause)**

The arena-client diagnostic report (WP-228 / D-22801) is extended to include
`uiStateSnapshot` — the current audience-filtered UIState projection read from
`useUiStateStore().snapshot` at export click, or `null` when no match is active.
This amends D-22801's "no `G`/`ctx`/UIState/card data" clause to permit the
UIState snapshot specifically; raw `G`/`ctx` remain excluded (the client never
holds them — only the `filterUIStateForAudience`-filtered projection exists
client-side). The snapshot is read from the Pinia store, not via an engine
import: it is typed `unknown` in `diagnostics.ts` so that module stays free of
any engine surface, and `client/bgioClient.ts` (the sole engine-import site) is
not modified — there is no `subscribe` hook, so the report carries the single
current snapshot at click time, not a buffered history. Because the snapshot is
already audience-filtered server-side, it carries no other player's hidden cards
and opens no new cross-player visibility surface — it is the same data the
player's own HUD renders, in a file they themselves download. All other D-22801
posture stands unchanged: credential redaction (the snapshot does not contain the
`credentials` value), client-only zero-network-egress export, the bounded
`DIAGNOSTIC_BUFFER_CAP = 200` console/error ring buffer, and the client-layer
wall-clock reads outside the engine determinism boundary. Deferred to follow-ups:
a rolling snapshot history (would hook `bgioClient.ts` `subscribe`) and the
on-click `[DIAG_EXPORT]` correlation marker.

**Packet:** WP-246 (EC-277).
**Amends:** D-22801 (the "no UIState/`G`/card data" clause only; the rest stands).
**Drafted:** 2026-06-13 (reserved). **Landed:** TBD (execution close — flips to Active).
**Status:** Reserved (proposed)
