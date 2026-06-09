# EC-260 — Arena Client Diagnostic Capture & Export (Execution Checklist)

**Source:** docs/ai/work-packets/WP-228-arena-client-diagnostic-capture-export.md
**Layer:** Arena Client — `apps/arena-client/src/diagnostics/diagnostics.{ts,test.ts}` (new) + `apps/arena-client/src/components/DiagnosticExportButton.vue` (new) + `apps/arena-client/src/main.ts` (modified — 1 import + 1 call) + `apps/arena-client/src/pages/PlayViewport.vue` (modified — 1 import + 1 mount)

> Use locked values from WP-228 verbatim. EC-260 is the operational
> order + gates + failure smells; if EC-260 and WP-228 conflict, WP-228
> wins.

## Before Starting
- [ ] **WP-061 landed** — `apps/arena-client/src/main.ts` calls
  `createApp(App)` + `app.mount('#app')` and contains the
  `import.meta.env.DEV` dev-fixture block. Verify:
  `grep -n "app.mount\|__WP061_DEV_FIXTURE_HARNESS__" apps/arena-client/src/main.ts`.
- [ ] **WP-129 landed** — `apps/arena-client/src/pages/PlayViewport.vue`
  exists, uses `defineComponent({ setup })`, renders
  `<PlayDesktop>`/`<PlayMobile>`. The button mounts inside its template.
- [ ] **Build-stamp globals present** — `__APP_VERSION__`, `__GIT_SHA__`,
  `__BUILD_TIMESTAMP__` declared in `src/env.d.ts`, stubbed in
  `src/testing/jsdom-setup.ts`. Verify:
  `grep -nE "__APP_VERSION__|__GIT_SHA__|__BUILD_TIMESTAMP__" apps/arena-client/src/env.d.ts apps/arena-client/src/testing/jsdom-setup.ts`.
- [ ] Read WP-228 §Goal, §Non-Negotiable Constraints, §Acceptance
  Criteria — those sections are authoritative.
- [ ] Read `src/components/branding/VersionBadge.vue` — the
  `position: fixed` presentational sibling whose placement idiom +
  build-stamp global reads `DiagnosticExportButton.vue` mirrors.
- [ ] `pnpm --filter @legendary-arena/arena-client test` + `typecheck` +
  `build` exit 0 (anchor the baseline arena-client test count; vue-tsc is
  green post WP-227 — do not regress it).

## Locked Values (verbatim from WP-228 — do not re-derive)
- **Buffer cap:** `DIAGNOSTIC_BUFFER_CAP = 200`; overflow drops oldest,
  increments `entryDroppedCount`, sets `truncated = (entryDroppedCount > 0)`.
- **`sequence`:** monotonically increasing, scoped to the page lifecycle,
  resets to `0` on `resetDiagnosticCaptureForTesting()`; entries returned
  oldest → newest.
- **Redaction literal:** `***redacted***` (replaces the `credentials`
  query-param value only; `match`/`player` left intact).
- **Button label (locked copy):** `Download diagnostics`.
- **Download file name:**
  `legendary-arena-diagnostics-<matchIdOrNoMatch>-<capturedAtMs>.json`
  (`<matchIdOrNoMatch>` = redacted-URL `match` param or literal `no-match`,
  URL-decoded, with `/` and `\` → `-`; `<capturedAtMs>` = the single
  `Date.now()` read at click, threaded into both filename and envelope —
  pure builders never read the clock; tests pass timestamps explicitly).
- **Capture install site:** `main.ts`, before `app.mount('#app')`,
  ungated (NOT inside `import.meta.env.DEV`).
- **Button mount site:** inside `PlayViewport.vue` (one import + one
  `<DiagnosticExportButton />`; no other line changes).
- **`DiagnosticEntry`:** `sequence:number`, `kind:'console'|'error'|'unhandledrejection'`,
  `level:'log'|'info'|'warn'|'error'|'debug'|null`, `message:string`,
  `stack:string|null`, `atMs:number`.
- **Message/stack (locked):** console — non-`Error` args `String(value)`-joined
  by single space; first `Error` arg → its `.message`+`.stack` (else `null`).
  `window 'error'` — `event.error` `.message`+`.stack` if present, else
  `event.message`+`null`. `'unhandledrejection'` — `reason instanceof Error` →
  `.message`+`.stack`, else `String(reason)`+`null`.
- **Report envelope:** `appVersion`, `gitSha`, `buildTimestamp`,
  `capturedAtIso`, `locationHref` (redacted), `matchId|null`,
  `playerId|null`, `userAgent`, `viewportWidth`, `viewportHeight`,
  `entryCount`, `entryDroppedCount`, `truncated` (`= entryDroppedCount > 0`),
  `entries`. `viewportWidth/Height` read synchronously at click.

## Guardrails
- **Client-only, zero engine surface.** The 3 new files import NOTHING
  from `@legendary-arena/(game-engine|registry|preplan)`, `apps/server`,
  `pg`, or `boardgame.io` — not even `import type`. `client/bgioClient.ts`
  is NOT modified. Any such import = HARD FAIL.
- **No network, no persistence.** No `fetch` / WebSocket send / store
  write. Report leaves the client only via file download + clipboard.
- **Credential redaction is a hard invariant.** Serialized report contains
  ZERO occurrences of the real `credentials` value; redaction runs on
  `locationHref` BEFORE the report is built. Missing/forgotten redaction =
  HARD FAIL (secret leak).
- **No `G`/`ctx`/UIState/card data** in the report (console + error + scalar
  envelope only).
- **Pass-through capture.** Wrapped `console.*` always calls the original;
  capture never suppresses output.
- **Idempotent + singleton.** `installDiagnosticCapture()` NO-OPs on re-call
  via a module-level `installed` flag (no re-wrap, no duplicate listeners);
  buffer + `sequence` + `entryDroppedCount` + `installed` + saved originals are
  one module-singleton per page load. Double-install = duplicate entries = FAIL.
  The wrap also tags each replaced `console.*` with a non-enumerable marker;
  install checks both the flag AND the marker so a Vite HMR module
  re-instantiation (resets `installed`) does not double-wrap.
- **Clipboard guard.** Copy attempted only if `navigator.clipboard?.writeText`
  exists; absence skipped, rejection swallowed — neither blocks the download.
- **Always-on.** `installDiagnosticCapture()` runs in dev AND prod — not
  gated on `import.meta.env.DEV`. Gating it = defeats the purpose = FAIL.
- **`buildDiagnosticReport` is pure** — no ambient `window`/`Date`/global
  reads inside it; the impure caller (the component) collects context and
  passes it in. Builder sets `entryCount = entries.length` and `truncated =
  context.entryDroppedCount > 0`; caller sources `entries` from
  `getDiagnosticEntries()` (oldest → newest) and the dropped count from
  `getDroppedEntryCount()`.
- **`DiagnosticExportButton.vue` uses `defineComponent({ setup })`** (NOT
  `<script setup>`) per D-6512.
- **No new npm deps; no `Math.random`.** Wall-clock reads
  (`Date.now()`/`toISOString()`) are client-layer diagnostic timing,
  outside the engine determinism boundary — each carries a `// why:`.
- **Full file contents** for every new/modified file — diffs/snippets
  forbidden.
- **Test naming `should_<behavior>_when_<condition>`;** ≥ 10 cases.
- **Additive only.** `git diff --name-only` at close = exactly the 9 files;
  `client/bgioClient.ts` + `App.vue` absent.

## Required `// why:` Comments
- `diagnostics.ts` — `// why:` the `console.*` wrap calls through to the
  original method first/always (pass-through capture; never suppress).
- `diagnostics.ts` — `// why:` `Date.now()` / `new Date().toISOString()`
  are client-layer diagnostic timestamps, outside the engine determinism
  boundary (which governs `packages/game-engine` only).
- `diagnostics.ts` — `// why:` `DIAGNOSTIC_BUFFER_CAP = 200` bounds memory;
  oldest entry dropped + `truncated` flag set on overflow so the report
  discloses loss.
- `diagnostics.ts` — `// why:` redaction targets the `credentials` param
  only (session secret); `match`/`player` are retained for correlation.
- `DiagnosticExportButton.vue` — `// why:` clipboard write is best-effort;
  a rejection is swallowed so it never blocks the file download (the
  download is the primary share path).

> `main.ts` carries no `// why:` beyond the one already-present dev-fixture
> comment; the capture install is one import + one ungated call. Do not
> add narration to `PlayViewport.vue` (one import + one mount, minimal
> diff). The always-on/no-egress rationale lives in D-22801 + the WP.

## Files to Produce
- `apps/arena-client/src/diagnostics/diagnostics.ts` — **new** — capture
  (`installDiagnosticCapture` / `getDiagnosticEntries` / `getDroppedEntryCount` /
  `resetDiagnosticCaptureForTesting` / `DIAGNOSTIC_BUFFER_CAP`) + pure
  (`redactCredentialsFromUrl` / `buildDiagnosticReport` /
  `serializeDiagnosticReport` / `buildDiagnosticFileName`) + types.
- `apps/arena-client/src/diagnostics/diagnostics.test.ts` — **new** — ≥ 10
  `node:test` cases: redaction + credential-safety invariant; report shape;
  serialization round-trip; filename; console pass-through capture; window
  `error` + `unhandledrejection` capture; cap + `truncated`.
- `apps/arena-client/src/components/DiagnosticExportButton.vue` — **new** —
  `defineComponent({ setup })`; `Download diagnostics` button; build +
  `.json` Blob download + best-effort clipboard copy on click.
- `apps/arena-client/src/main.ts` — **modified** — `installDiagnosticCapture`
  import + one ungated call before `app.mount('#app')`; no other change.
- `apps/arena-client/src/pages/PlayViewport.vue` — **modified** —
  `DiagnosticExportButton` import + one `<DiagnosticExportButton />` mount;
  no other change.
- `docs/ai/STATUS.md` — **modified** — `### WP-228 / EC-260 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-22801 Reserved (proposed) →
  Active, byte-identical to §DECISIONS.md Verbatim Block below.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-228 `[x]` with
  the DoD summary line.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip the
  EC-260 row Pending → Done.

**Total: 9 files** (3 new + 2 modified source + 4 governance: `STATUS.md`,
`DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`), per WP-228 §Files Expected
to Change.

## After Completing
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0; ≥ 10
  net-new `diagnostics` cases; no pre-existing test regresses.
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
  (vue-tsc stays green per WP-227).
- [ ] `pnpm --filter @legendary-arena/arena-client build` exits 0.
- [ ] Engine/boundary import grep (3 new files):
  `grep -rnE "@legendary-arena/(game-engine|registry|preplan)|apps/server|boardgame\.io|from 'pg'" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue`
  returns 0.
- [ ] Network/persistence grep (3 new files):
  `grep -rnE "fetch\(|WebSocket|\.emit\(|localStorage|sessionStorage" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue`
  returns 0.
- [ ] Install-site grep: `grep -n "installDiagnosticCapture" apps/arena-client/src/main.ts`
  shows one import + one call, NOT inside an `import.meta.env.DEV` block.
- [ ] Mount-site grep: `grep -nE "DiagnosticExportButton" apps/arena-client/src/pages/PlayViewport.vue`
  shows one import + one usage.
- [ ] `git diff --name-only -- apps/arena-client/src/client/bgioClient.ts apps/arena-client/src/App.vue`
  is EMPTY.
- [ ] Credential-safety: the serialization test asserts a credentials-bearing
  URL yields a report containing `***redacted***` and NOT the secret value.
- [ ] Idempotency: two `installDiagnosticCapture()` calls → one console call
  yields exactly ONE entry; `window` listeners registered once.
- [ ] Console-wrap presence: `grep -n "console\." apps/arena-client/src/diagnostics/diagnostics.ts`
  shows originals saved + wrapped methods assigned (non-zero).
- [ ] Additive scope: `git diff --name-only` lists exactly the 9 files.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-22801 Active
  byte-identical to §Verbatim Block; `WORK_INDEX.md` WP-228 `[x]`;
  `EC_INDEX.md` EC-260 → Done.

## Commit Discipline (`.githooks/commit-msg` — enforced)
- The execution commit stages `apps/arena-client/**` code, so Rule 5 (D-20801)
  requires an `EC-###:` or `INFRA:` prefix and **rejects `SPEC:` for code**.
  Use `EC-260: <present-tense summary>` (≥ 12 chars after the prefix). See
  `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md`.
- Avoid the hook's forbidden subject words — `WIP`, `fix stuff`, `misc`, `tmp`,
  `updates`, `changes`, `debug` (case-insensitive substring match). E.g. do NOT
  write "EC-260: … no behavior changes" or "… updates PlayViewport" — both trip
  Rule 1.
- Co-staging `EC_INDEX.md` (the Pending → Done flip) under an `EC-260:` prefix
  triggers a **non-blocking** Rule 6 warning — the sanctioned "index update at
  WP completion" case; proceed.
- The companion drafting commit `SPEC: draft WP-228 + EC-260 [D-22801]` is
  docs-only (no `apps/`/`packages/` paths), so `SPEC:` is valid there.

## Common Failure Smells
- The real `credentials` value appears anywhere in the serialized report →
  redaction not applied to `locationHref` before build = secret leak HARD
  FAIL.
- `installDiagnosticCapture()` placed inside the `import.meta.env.DEV` block
  → capture absent in production = defeats the WP's purpose.
- Wrapped `console.*` does not call the original → console output swallowed
  in prod (pass-through violation).
- Any `@legendary-arena/game-engine` / `boardgame.io` import in the new
  files, or a diff touching `client/bgioClient.ts` → layer-boundary /
  single-engine-import-site violation.
- `buildDiagnosticReport` reading `window`/`Date` internally → not pure;
  breaks the deterministic report-shape test.
- `DiagnosticExportButton.vue` authored as `<script setup>` → template
  binding resolution fails under the vue-sfc-loader separate-compile
  pipeline (D-6512).
- Buffer grows past 200 / `entryDroppedCount` stays 0 on overflow → cap not
  enforced.
- A single console call produces more than one entry, or a window listener
  fires twice → multiple installs / missing idempotency `installed` guard.
- vue-tsc errors reappear → a new `UIState`/type reference was added; the
  diagnostics feature must not touch engine types at all (WP-227 just
  restored green).

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> Per PS-1 convention (mirrors WP-206 / WP-226 precedent): the D-22801
> entry lands in `docs/ai/DECISIONS.md` at draft time as
> `Reserved (proposed)` and flips to `Active` at the execution-close
> governance commit, byte-identical to the block below. Status is the only
> field that changes.

### D-22801 — Arena Client Diagnostic Capture & Export Posture: Always-On Bounded Buffer, Pass-Through Console + Window Capture, Credential Redaction, Client-Only No-Egress Export

**Decision:**
The arena client (`play.legendary-arena.com`) installs an always-on,
bounded, in-memory diagnostic capture at bootstrap
(`installDiagnosticCapture()` called once in `apps/arena-client/src/main.ts`
before `app.mount('#app')`, ungated — it runs in both dev and production
because the freeze it diagnoses occurs in production). The capture wraps
`console.error/warn/info/log/debug` — always calling through to the
original method (pass-through; never suppressing output) — and registers
`window` `'error'` + `'unhandledrejection'` listeners, appending each event
to a ring buffer capped at `DIAGNOSTIC_BUFFER_CAP = 200`. On overflow the
oldest entry is dropped and `entryDroppedCount` is incremented, so the
exported report's `truncated` flag (`=== entryDroppedCount > 0`) discloses the
loss.

The capture is hardened against the common production failure modes:
`installDiagnosticCapture()` is idempotent (a module-level `installed` flag
makes re-calls NO-OP, so `console.*` is never re-wrapped and the window
listeners are never duplicated); the capture state (buffer, `sequence`
counter, `entryDroppedCount`, `installed` flag, saved originals) is a single
module-singleton per page load; entries are returned oldest → newest by
ascending `sequence`, which resets to `0` only via
`resetDiagnosticCaptureForTesting()`; and message shaping is locked — a console
call joins non-`Error` arguments with `String(value)` and takes the first
`Error` argument's `.message` + `.stack`, a `window 'error'` event prefers
`event.error` then falls back to `event.message`, and an `'unhandledrejection'`
uses the reason's `.message` + `.stack` when it is an `Error` else
`String(reason)`. The clipboard copy is attempted only when
`navigator.clipboard?.writeText` exists.

The export affordance is a small `position: fixed` `DiagnosticExportButton.vue`
(label `Download diagnostics`, authored as `defineComponent({ setup })` per
D-6512) mounted inside `PlayViewport.vue` so it appears on both the `live`
and `play-fixture` routes and on both the desktop and mobile viewports. On
click it reads the live browser context, builds a `DiagnosticReport` via the
pure `buildDiagnosticReport(entries, context)`, serializes it with
`serializeDiagnosticReport` (2-space JSON), triggers a `.json` Blob download
named `legendary-arena-diagnostics-<matchIdOrNoMatch>-<capturedAtMs>.json`,
and best-effort copies the same payload to the clipboard (a clipboard
rejection is swallowed and never blocks the download).

The report is client-only and has zero network egress: it is never persisted
to a database, never sent to the server, and contains no `G`/`ctx`/UIState/
card data — only the captured console + error entries and a scalar envelope
(`appVersion`, `gitSha`, `buildTimestamp`, `capturedAtIso`, redacted
`locationHref`, `matchId`, `playerId`, `userAgent`, viewport size,
`entryCount`, `entryDroppedCount`, `truncated`). Credential redaction is a hard
invariant:
`redactCredentialsFromUrl` replaces the `credentials` query-param value with
the literal `***redacted***` before the report is built, so the serialized
report contains zero occurrences of the session secret; `match`/`player` are
retained for correlation. The browser wall-clock reads
(`Date.now()`/`toISOString()`) are client-layer diagnostic timestamps,
explicitly outside the engine determinism boundary (which governs
`packages/game-engine` only).

The feature is pure client code: the three new files import no
`@legendary-arena/(game-engine|registry|preplan)`, `apps/server`, `pg`, or
`boardgame.io` surface, and the single engine-import site
(`client/bgioClient.ts`) and the router (`App.vue`) are not modified.
Deferred to follow-ups: UIState / network-frame capture (would hook
`bgioClient.ts` `subscribe`), server-side upload / automatic error
reporting, gating/dismissibility/persistence/shortcuts, and PII scrubbing
beyond the credentials param.

**Packet:** WP-228 (EC-260).

**Drafted:** 2026-06-08 (drafting close — reserved). **Landed:** TBD
(execution close — flips to Active).
**Status:** Reserved (proposed)

---
