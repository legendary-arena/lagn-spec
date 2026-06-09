# WP-228 — Arena Client Diagnostic Capture & Export (Shareable Freeze Log)

> **Status:** DRAFT — pending review (do not execute until reviewed per
> `.claude/rules/work-packets.md` Review Gate).
> **Reserves:** D-22801.
> **Paired EC:** EC-260 (drafted; pending review alongside this WP before execution).

---

## Goal

After this session, the arena client (`play.legendary-arena.com`) installs an
always-on, bounded, in-memory **diagnostic capture** at bootstrap and surfaces a
small, unobtrusive **"Download diagnostics"** affordance on the live-play
surface. The capture records the most recent console output plus any uncaught
errors and unhandled promise rejections into a fixed-size ring buffer. When the
operator hits a freeze, one click exports the captured buffer — together with a
**credential-redacted** context envelope (app version, build, redacted URL,
match/player ids, user agent, viewport) — as a single `.json` file and copies
the same payload to the clipboard, so it can be shared for diagnosis.

This closes the gap surfaced when the game froze with no artifact to share: the
client currently writes no log file and installs no global error handler
(`apps/arena-client/src/main.ts` / `App.vue` have neither). This WP is the
binary, client-only first form of that capability.

This is additive and client-only. It persists nothing server-side, sends
nothing over the network, never includes the session `credentials` value, and
does not modify the single engine-import site (`client/bgioClient.ts`) or the
router (`App.vue`).

---

## Assumes

- **WP-061 complete** — `apps/arena-client/` is a bootstrapped Vue 3 + Vite +
  Pinia SPA; `src/main.ts` calls `createApp(App)` and `app.mount('#app')` and
  contains the `import.meta.env.DEV` dev-fixture harness block
  (`__WP061_DEV_FIXTURE_HARNESS__`). The new capture install sits alongside that
  block and does not alter it.
- **WP-129 complete** — `apps/arena-client/src/pages/PlayViewport.vue` exists as
  the viewport discriminator that renders `<PlayDesktop>` / `<PlayMobile>` for
  both the `live` and `play-fixture` routes; it uses
  `defineComponent({ setup() { return {...} } })` per D-6512. The diagnostics
  button mounts inside this component (one import + one mount line).
- **WP-180 build-stamp globals present** — the Vite `define` constants
  `__APP_VERSION__`, `__GIT_SHA__`, `__BUILD_TIMESTAMP__` are declared in
  `apps/arena-client/src/env.d.ts`, injected at build time by
  `apps/arena-client/vite.config.ts`, and stubbed for the test runner in
  `apps/arena-client/src/testing/jsdom-setup.ts` (`installGlobal(...)`).
  `src/components/branding/VersionBadge.vue` already reads them as bare globals.
- The arena-client test harness is native `node:test` run via
  `node --import tsx --import @legendary-arena/vue-sfc-loader/register --test
  src/**/*.test.ts` (the `test` script in `apps/arena-client/package.json`),
  with a jsdom environment installed by `src/testing/jsdom-setup.ts` (provides
  `window`, `document`, `navigator`, `localStorage`, and the build-stamp
  globals). Pure-logic + jsdom-event tests only.
- No backend, engine, registry, preplan, or other-app change is required: the
  feature reads only browser globals already available in the client.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md` §"Layer Boundary (Authoritative)" — confirm
  `apps/arena-client` is a `client-app` surface that may import engine **types**
  via `client/bgioClient.ts` only; this WP's new files import **no** engine
  surface at all (type or runtime) and do not touch `bgioClient.ts`.
- `docs/ai/ARCHITECTURE.md` §"Persistence Boundary" — confirm the diagnostic
  report is a client-only download/clipboard payload: it is never persisted to a
  database, never sent to the server, and contains no `G`/`ctx`.
- `.claude/rules/code-style.md` and `docs/ai/REFERENCE/00.6-code-style.md` —
  human-style code rules every produced file must satisfy (explicit control
  flow, descriptive names, JSDoc on every function, `// why:` on non-obvious
  decisions, full-sentence error messages, no `.reduce()` for multi-step logic).
- `apps/arena-client/src/main.ts` — the bootstrap; the capture install is added
  here (one import + one call before `app.mount('#app')`).
- `apps/arena-client/src/pages/PlayViewport.vue` — the mount point for the
  button; note the `defineComponent({ setup })` requirement (D-6512).
- `apps/arena-client/src/components/branding/VersionBadge.vue` — the
  presentational `position: fixed` sibling whose placement idiom and build-stamp
  global reads `DiagnosticExportButton.vue` mirrors.
- `apps/arena-client/src/client/bgioClient.ts` — read only to confirm it is the
  sole engine-import site and is **not** modified by this WP (the
  network-frame / UIState capture that would touch its `subscribe` is Out of
  Scope).
- `docs/ai/DECISIONS.md` — scan D-6512 (SFC `defineComponent` requirement) and
  D-16501 (the `matchId` prop-drill into PlayViewport) for related client
  context before reserving D-22801.

---

## Scope (In)

- Add `apps/arena-client/src/diagnostics/diagnostics.ts`: one cohesive module
  with (a) the **capture** surface — `installDiagnosticCapture()`,
  `getDiagnosticEntries()`, `resetDiagnosticCaptureForTesting()`, and the locked
  `DIAGNOSTIC_BUFFER_CAP` constant; and (b) the **pure** surface —
  `redactCredentialsFromUrl(href)`, `buildDiagnosticReport(entries, context)`,
  `serializeDiagnosticReport(report)`, `buildDiagnosticFileName(matchId,
  capturedAtMs)`; plus the exported `DiagnosticEntry`, `DiagnosticReport`, and
  `DiagnosticContext` types.
- Add `apps/arena-client/src/diagnostics/diagnostics.test.ts`: native
  `node:test` coverage of redaction (including the credential-safety
  invariant), report shape + serialization round-trip, filename construction,
  console pass-through capture, window `error`/`unhandledrejection` capture, and
  the ring-buffer cap + `truncated` behavior.
- Add `apps/arena-client/src/components/DiagnosticExportButton.vue`: a small
  presentational `position: fixed` button (label `Download diagnostics`) using
  `defineComponent({ setup })`. On click it reads the live browser context,
  builds + serializes the report via the module, triggers a `.json` Blob
  download, and best-effort copies the payload to the clipboard.
- Modify `apps/arena-client/src/main.ts`: call `installDiagnosticCapture()`
  once at bootstrap, before `app.mount('#app')` (not gated on
  `import.meta.env.DEV` — the target freeze occurs in production).
- Modify `apps/arena-client/src/pages/PlayViewport.vue`: import and mount
  `<DiagnosticExportButton />` so it appears on both play routes and both
  viewports. No other change to this file.
- Reserve D-22801 documenting the capture/export posture (always-on bounded
  buffer, console + window pass-through capture, credential redaction,
  client-only download, no UIState/`G`, client-layer wall-clock outside the
  engine determinism boundary).

---

## Out of Scope

- **UIState / `G` / move-history / network-frame capture.** The "is the server
  still pushing frames?" signal would require hooking the `client.subscribe`
  callback in `client/bgioClient.ts` (the single engine-import site). To keep
  that file untouched in v1, the report captures only console + error output and
  a scalar envelope — no game projection, no card data. Deferred to a follow-up.
- **Server-side upload / automatic error reporting.** v1 has zero network
  egress; the operator shares the downloaded file manually. No telemetry
  endpoint, no Sentry-style reporter.
- **Gating, dismissibility, persistence, or shortcuts.** No `?diag=1` gate, no
  dev-only gate on the button, no keyboard shortcut, no `localStorage`
  persistence across reloads. The buffer is in-memory for the current page load
  only (a reload clears it — the button must be present *before* the freeze,
  which is why capture is always-on and the button always-mounted on the play
  surface).
- **On-click `[DIAG_EXPORT]` correlation marker.** Emitting a synthetic marker
  entry at export time (to mark the log boundary at the click moment) is a
  considered roadmap nicety, deferred to the same follow-up that adds richer
  capture; v1's report already records `capturedAtIso` for the export moment.
- **Redaction beyond the `credentials` query param.** v1 redacts the session
  `credentials` value only. Broader PII scrubbing is unnecessary in v1 because
  the report captures no UIState/user content; a wider scrub is a follow-up if
  the captured surface ever grows.
- Any edit to `apps/arena-client/src/client/bgioClient.ts`, `App.vue`, the Pinia
  stores, or any `apps/server`, `packages/game-engine`, `packages/registry`,
  `packages/preplan`, `apps/dashboard`, or `apps/registry-viewer` file.

---

## Files Expected to Change

- `apps/arena-client/src/diagnostics/diagnostics.ts` — **new** — capture ring
  buffer + install/getter/reset + `DIAGNOSTIC_BUFFER_CAP`; pure
  `redactCredentialsFromUrl` / `buildDiagnosticReport` /
  `serializeDiagnosticReport` / `buildDiagnosticFileName`; exported
  `DiagnosticEntry` / `DiagnosticReport` / `DiagnosticContext` types.
- `apps/arena-client/src/diagnostics/diagnostics.test.ts` — **new** —
  `node:test` cases: credentials redaction + credential-safety invariant;
  report shape; serialization round-trip; filename construction; console
  pass-through capture; window `error` + `unhandledrejection` capture; ring
  buffer cap + `truncated`.
- `apps/arena-client/src/components/DiagnosticExportButton.vue` — **new** —
  presentational fixed-position button; `defineComponent({ setup })`; builds +
  downloads + copies the report on click.
- `apps/arena-client/src/main.ts` — **modified** — add the
  `installDiagnosticCapture` import and one call before `app.mount('#app')`. No
  other change.
- `apps/arena-client/src/pages/PlayViewport.vue` — **modified** — add the
  `DiagnosticExportButton` import and one `<DiagnosticExportButton />` mount in
  the template. No other change.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-228 with
  the Definition-of-Done summary line.
- `docs/ai/DECISIONS.md` — **modified** — flip D-22801 from Reserved (proposed)
  to Active.
- `docs/ai/STATUS.md` — **modified** — record what changed this session.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip the EC-260
  row Pending → Done.

**Total: 9 files** (3 new + 2 modified source + 4 governance: `WORK_INDEX.md`,
`DECISIONS.md`, `STATUS.md`, `EC_INDEX.md`). One over the WP-226 baseline of 8;
the four governance files are mandatory and the feature itself is three small
source files plus two one-line wire-ins, so no split is warranted.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Output the **full file contents** for every new or modified file. Diffs,
  snippets, and "show only the changed section" are forbidden.
- ESM only; Node v22+; no CommonJS, no `require()`.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (explicit control
  flow, descriptive names, JSDoc on every function, `// why:` on non-obvious
  decisions, full-sentence error messages, no `.reduce()` for multi-step logic).

**Packet-specific:**
- **Client-only, no engine surface.** The three new files import **nothing**
  from `@legendary-arena/game-engine`, `@legendary-arena/registry`,
  `@legendary-arena/server`/`apps/server`, `@legendary-arena/preplan`, `pg`, or
  `boardgame.io` — not even `import type`. The diagnostics feature is pure
  browser code. `client/bgioClient.ts` (the sole engine-import site) is **not**
  modified.
- **No persistence, no network.** Nothing in this feature writes to a database,
  writes to a Pinia store's persistence layer, or issues a `fetch`/WebSocket
  send. The report leaves the client only via the user-initiated file download
  and clipboard copy.
- **Credential redaction is a hard invariant.** The serialized report MUST
  contain zero occurrences of the real `credentials` query-param value.
  `redactCredentialsFromUrl` replaces that value with the literal
  `***redacted***`; it is applied to the captured `locationHref` before the
  report is built. A `node:test` case asserts a credentials-bearing URL yields a
  serialized report with `***redacted***` and not the secret.
- **No `G`/`ctx`/UIState/card data in the report.** v1 captures console + error
  output and the scalar envelope only.
- **Capture is pass-through.** Wrapped `console.*` methods always invoke the
  original method (capture never suppresses or swallows console output).
- **Capture is always-on.** `installDiagnosticCapture()` runs in both dev and
  production builds — it is **not** gated on `import.meta.env.DEV`.
- **Bounded memory.** The ring buffer is capped at `DIAGNOSTIC_BUFFER_CAP`
  entries; on overflow the oldest entry is dropped, `entryDroppedCount` is
  incremented, and the report's `truncated` flag is `entryDroppedCount > 0`.
- `DiagnosticExportButton.vue` uses `defineComponent({ setup() { return {...} }
  })` (NOT `<script setup>`) per D-6512 (template references non-prop bindings
  under the vue-sfc-loader separate-compile pipeline).
- No new npm dependencies. No `Math.random()`. The browser wall-clock reads in
  the capture/report (`Date.now()` / `new Date().toISOString()`) are
  **client-layer diagnostic timing, outside the engine determinism boundary**
  (which governs `packages/game-engine` only) and each carries a `// why:`
  comment.
- Additive only: `git diff --name-only` at close lists exactly the files in
  `## Files Expected to Change` and nothing else; `client/bgioClient.ts` and
  `App.vue` are absent from the diff.
- **Idempotent install.** `installDiagnosticCapture()` MUST be safe to call more
  than once: subsequent calls NO-OP via a module-level `installed` flag and
  never re-wrap `console.*` or re-register the window listeners. The wrap also
  tags each replaced `console.*` method with a non-enumerable marker property,
  and install checks **both** the `installed` flag and the per-method marker —
  so a Vite HMR module re-instantiation (which resets `installed`) still does
  not double-wrap an already-wrapped method.
- **Module-singleton state.** The capture state (ring buffer, `sequence`
  counter, `entryDroppedCount`, `installed` flag, saved original console
  methods) lives in a module-level singleton inside `diagnostics.ts` — one
  instance per page load.
- **Insertion order preserved.** `getDiagnosticEntries()` and the report return
  entries oldest → newest (chronological, by ascending `sequence`).
- **Console message construction (locked).** For a wrapped `console.*` call:
  non-`Error` arguments are converted with `String(value)` and joined with a
  single space to form `message`; if any argument is an `Error`, that error's
  `.message` becomes `message` and its `.stack` becomes `stack` (the first
  `Error` argument wins); otherwise `stack` is `null`.
- **Error / rejection normalization (locked).** For a `window` `'error'` event,
  use `event.error` (an `Error`) for `message` + `stack` when present, else
  `event.message` with `stack = null`. For an `'unhandledrejection'` event: if
  `event.reason instanceof Error`, use its `.message` + `.stack`; otherwise
  `message = String(event.reason)` and `stack = null`.
- **Clock-read discipline.** The component reads `Date.now()` once at click time
  and threads that millisecond value into both `buildDiagnosticFileName(...)`
  and the context envelope (the source of `capturedAtMs` / `capturedAtIso`); the
  pure builders never read the clock, and tests pass timestamps explicitly
  rather than mocking `Date.now()`.
- **Clipboard guard.** The clipboard copy is attempted only when
  `navigator.clipboard?.writeText` exists; if it is absent the copy is skipped,
  and when present any rejection is swallowed (`// why:`). Neither path blocks
  the file download.
- **Viewport read timing.** `viewportWidth` / `viewportHeight` are read
  synchronously at click time from `window.innerWidth` / `window.innerHeight`.

**Session protocol:**
- If the `PlayViewport.vue` structure, the build-stamp globals, or the mount
  placement appears to conflict with the actual files, **stop and ask** — do not
  guess a different mount point, gate, or global name.

**Locked Contract Values:**
- Buffer cap: `DIAGNOSTIC_BUFFER_CAP = 200`.
- Redaction literal: `***redacted***` (replaces the `credentials` query-param
  value only).
- Button label (locked copy): `Download diagnostics`.
- Download file name: `legendary-arena-diagnostics-<matchIdOrNoMatch>-<capturedAtMs>.json`
  (where `<matchIdOrNoMatch>` is the redacted-URL `match` param value or the
  literal `no-match` when absent — URL-decoded and used verbatim except that `/`
  and `\` are replaced with `-` for filename safety — and `<capturedAtMs>` is
  the `Date.now()` value read once at click).
- `sequence`: a monotonically increasing counter scoped to the current page
  lifecycle; it resets to `0` when `resetDiagnosticCaptureForTesting()` is
  called.
- Capture install site: `apps/arena-client/src/main.ts`, before
  `app.mount('#app')`, ungated.
- Button mount site: inside `apps/arena-client/src/pages/PlayViewport.vue`
  (covers `live` + `play-fixture`, desktop + mobile).
- `DiagnosticEntry` fields: `sequence: number`, `kind: 'console' | 'error' |
  'unhandledrejection'`, `level: 'log' | 'info' | 'warn' | 'error' | 'debug' |
  null`, `message: string`, `stack: string | null`, `atMs: number`.
- `DiagnosticContext` / report envelope fields: `appVersion`, `gitSha`,
  `buildTimestamp`, `capturedAtIso`, `locationHref` (redacted), `matchId | null`,
  `playerId | null`, `userAgent`, `viewportWidth`, `viewportHeight`,
  `entryCount`, `entryDroppedCount`, `truncated` (`=== entryDroppedCount > 0`),
  plus `entries: DiagnosticEntry[]`.
- Report derivation (locked): `buildDiagnosticReport(entries, context)` is pure
  — it sets `entryCount = entries.length` and `truncated = context.entryDroppedCount
  > 0` from its inputs and performs no ambient reads. The impure caller sources
  `entries` from `getDiagnosticEntries()` (bounded, oldest → newest) and the
  dropped count from `getDroppedEntryCount()`, placing the latter into
  `context.entryDroppedCount`.

---

## Vision Alignment

**Vision clauses touched:** §3 (player identity), §11 (accounts/visibility),
§22 (determinism) — each addressed below; **no conflict.**

This WP adds a player-facing UI affordance (the export button is visible to any
player on the live-play surface, not operator-gated), so the §17.2 Non-Goal
proximity check applies and is performed explicitly:

- **Non-Goal proximity (NG-1..7):** none crossed. The button is a
  troubleshooting/diagnostic affordance — not paid, persuasive, competitive, or
  pay-to-win. It surfaces no advantage and gates no content.
- **Identity / visibility (§3, §11):** the report contains only the operator's
  **own** session identity (`matchId`/`playerId` parsed from their own URL) in a
  file they themselves download; it exposes no other player's data and creates
  no new visibility surface. The session `credentials` value is redacted
  (`***redacted***`) before serialization — a hard invariant with a dedicated
  test.
- **Determinism (§22):** not engaged. The wall-clock reads
  (`Date.now()`/`toISOString()`) live entirely in client-layer diagnostic code;
  the engine determinism boundary governs `packages/game-engine` only, and this
  WP touches no scoring, replay, RNG, or simulation surface. The single
  engine-import site (`client/bgioClient.ts`) is unmodified.

## Funding Surface Gate

**N/A — justified.** No funding affordances, no "donate/support/tournament
funding" copy, and no funding-channel integration are added or referenced; this
WP adds only an internal diagnostic capture + export affordance.

## API Catalog (§21)

**N/A — justified.** Client-only change: no HTTP endpoint is added, modified, or
removed, and no `apps/server/src/**` library function is touched. The diagnostic
report is built and downloaded entirely client-side with zero network egress;
`docs/ai/REFERENCE/api-endpoints.md` is unaffected.

---

## Lint Gate Self-Review

Run against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (§1–§21) on
2026-06-08. **Verdict: PASS** — all applicable sections satisfied; N/A sections
carry a named justification (no bare/tautological N/A); no Final Gate FAIL
condition (1–38) triggers.

- **§1 Structure** — PASS. All required sections present; `## Out of Scope`
  lists five explicit exclusions.
- **§2 Non-Negotiable Constraints** — PASS. Engine-wide block requires full file
  contents, forbids diffs/snippets, states ESM + Node v22+, and references
  `00.6-code-style.md`; packet-specific + session protocol + locked contract
  values all present.
- **§3 Assumes** — PASS. WP-061 (`main.ts` bootstrap + dev-fixture block),
  WP-129 (`PlayViewport.vue` + D-6512), the WP-180 build-stamp globals + their
  jsdom stubs, the `node:test`+`tsx`+jsdom harness, and "no backend change" each
  cite their source.
- **§4 Context** — PASS. ARCHITECTURE §Layer Boundary + §Persistence Boundary,
  the code-style rules, `main.ts`, `PlayViewport.vue`, `VersionBadge.vue`,
  `bgioClient.ts`, and DECISIONS (D-6512 / D-16501) are cited specifically.
- **§5 Files Expected to Change** — PASS. Nine files, each `new`/`modified`
  with a one-line description; bounded; no patch-based output language; the
  one-over-8 count is justified inline.
- **§6 Naming** — PASS. `installDiagnosticCapture`, `DIAGNOSTIC_BUFFER_CAP`,
  `redactCredentialsFromUrl`, `DiagnosticReport`, `__APP_VERSION__`,
  `PlayViewport` match the shipped client surface + the Vite build-stamp
  globals; no abbreviations; `matchId`/`playerId` match canonical spelling.
- **§7 Dependency Discipline** — PASS. "No new npm dependencies" stated; browser
  + Vue SFC only; no forbidden package reachable.
- **§8 Architectural Boundaries** — PASS. Client-only (`apps/arena-client/**`);
  zero engine/registry/server/preplan import in the new files; no game logic; no
  DB; no persistence; `bgioClient.ts` (sole engine-import site) untouched;
  diagnostic export is explicitly read-only / no-egress (Scripts and Diagnostics
  posture).
- **§9 Windows Compatibility** — PASS. Verification uses `pnpm --filter` + `grep`
  (Git Bash) + `git diff`; no Unix-only assumption in scope.
- **§10 Env Var Hygiene** — N/A — justified. No new env vars introduced; the
  build-stamp values (`__APP_VERSION__` / `__GIT_SHA__` / `__BUILD_TIMESTAMP__`)
  are pre-existing Vite `define` globals (WP-204), not `.env`/`VITE_` runtime
  variables, and are read, not introduced.
- **§11 Authentication** — N/A — justified. WP touches no auth surface; it
  redacts the boardgame.io `credentials` value out of the report but adds no
  identity model.
- **§12 Test Quality** — PASS. `node:test` via `tsx` + jsdom; ≥ 10 cases
  covering redaction + credential-safety, report shape + round-trip, filename
  sanitization, pass-through console capture, window error/rejection
  normalization, oldest→newest ordering, the buffer cap + `entryDroppedCount`,
  and idempotent install; no `boardgame.io` import, no network/DB; capture tests
  dispatch synthetic jsdom window events; the credential-safety assertion is the
  load-bearing case.
- **§13 Verification Steps** — PASS. Nine exact steps with expected output
  (`pnpm --filter` test/typecheck/build + engine-import grep + mount grep +
  install grep + `bgioClient.ts`/`App.vue` untouched check + `git diff`).
- **§14 Acceptance Criteria** — PASS. Twelve binary, observable, file/symbol-
  specific checks aligned to the deliverables (within the §14 6–12 range).
- **§15 Definition of Done** — PASS. Includes AC-pass, STATUS, DECISIONS,
  WORK_INDEX, EC_INDEX, and the scope-boundary check.
- **§16 Code Style** — PASS. WP mandates 00.6 human-style code, JSDoc, `// why:`
  on the wall-clock reads + the pass-through wrap; small single-responsibility
  functions; no premature abstraction (one cohesive module for one feature, not
  a helper extracted for one-time use).
- **§17 Vision Alignment** — PASS. `## Vision Alignment` present with cited
  clauses (§3, §11, §22) and the mandatory NG-1..7 proximity line (user-facing
  button); no conflict declared.
- **§18 Prose-vs-Grep Discipline** — PASS. The verification greps target
  engine-import paths and component/symbol names; no Verification Step declares a
  literal forbidden-token grep whose tokens are restated in adjacent prose. The
  credential-safety check is a `node:test` assertion, not a repo grep.
- **§19 Bridge-vs-HEAD Staleness** — N/A — justified. Not a
  repo-state-summarizing artifact; §19 is commit-time discipline, not a WP-lint
  Final-Gate condition.
- **§20 Funding Surface Gate** — PASS. `## Funding Surface Gate` present with a
  reasoned N/A (no funding affordances or copy).
- **§21 API Catalog** — PASS. `## API Catalog (§21)` present with a reasoned N/A
  (client-only; no HTTP endpoint or `apps/server/src/**` library function
  touched; no network egress).

---

## Acceptance Criteria

1. `apps/arena-client/src/diagnostics/diagnostics.ts` exists and exports
   `installDiagnosticCapture`, `getDiagnosticEntries`, `getDroppedEntryCount`,
   `resetDiagnosticCaptureForTesting`, `DIAGNOSTIC_BUFFER_CAP`,
   `redactCredentialsFromUrl`, `buildDiagnosticReport`,
   `serializeDiagnosticReport`, `buildDiagnosticFileName`, and the
   `DiagnosticEntry` / `DiagnosticReport` / `DiagnosticContext` types.
2. `DIAGNOSTIC_BUFFER_CAP === 200`; capturing more than the cap drops the oldest
   entries (the buffer length never exceeds the cap), `entryDroppedCount` equals
   the number of dropped entries, and a report built from the over-full buffer
   has `truncated === true` (`truncated === entryDroppedCount > 0`).
3. `installDiagnosticCapture()` wraps `console.error/warn/info/log/debug` so each
   call is recorded **and** still invokes the original method, and registers
   `window` `'error'` + `'unhandledrejection'` listeners; recorded entries carry
   a strictly increasing `sequence` and `getDiagnosticEntries()` / the report
   return them oldest → newest. Console `message`/`stack` and the
   error/rejection `message`/`stack` follow the locked construction +
   normalization rules (non-`Error` args `String`-joined by single space; first
   `Error` arg → `.message` + `.stack`; rejection `reason` that is an `Error` →
   `.message` + `.stack`, else `String(reason)` + `null`).
   `resetDiagnosticCaptureForTesting()` restores the original console methods,
   removes the listeners, clears the buffer, and resets `sequence` to `0`.
4. `redactCredentialsFromUrl(href)` replaces the `credentials` query-param value
   with `***redacted***` and leaves `match` / `player` intact; a serialized
   report built from a location URL containing a `credentials` value contains
   zero occurrences of that value and at least one `***redacted***`.
5. `buildDiagnosticReport(entries, context)` is pure (performs no ambient
   `window`/`Date`/global reads) and returns an object containing exactly the
   locked envelope fields plus `entries`; `serializeDiagnosticReport(report)`
   returns 2-space-indented JSON that `JSON.parse` round-trips back to the
   report.
6. `apps/arena-client/src/main.ts` imports and calls `installDiagnosticCapture()`
   exactly once, before `app.mount('#app')`, and the call is **not** wrapped in
   an `import.meta.env.DEV` guard; the existing dev-fixture harness block is
   unchanged.
7. `apps/arena-client/src/components/DiagnosticExportButton.vue` renders a single
   button whose label is `Download diagnostics`, uses
   `defineComponent({ setup() { return {...} } })` (not `<script setup>`), and on
   click builds + serializes the report, triggers a `.json` Blob download named
   `legendary-arena-diagnostics-<matchIdOrNoMatch>-<capturedAtMs>.json`, and
   best-effort copies the serialized payload to the clipboard **only when**
   `navigator.clipboard?.writeText` exists (absence is skipped; a rejection is
   swallowed with a `// why:`); neither path blocks the download.
8. `apps/arena-client/src/pages/PlayViewport.vue` imports and mounts
   `<DiagnosticExportButton />` (one import line + one mount line); `App.vue`
   and `client/bgioClient.ts` are byte-identical to baseline.
9. The three new files contain zero imports of
   `@legendary-arena/(game-engine|registry|preplan)`, `apps/server`, `pg`, or
   `boardgame.io`; nothing in the feature issues a `fetch`/WebSocket send or
   writes to a store.
10. `pnpm --filter @legendary-arena/arena-client test` passes with ≥ 10 net-new
    `node:test` cases following the `should_<behavior>_when_<condition>` naming
    and no pre-existing test regresses; `pnpm --filter
    @legendary-arena/arena-client typecheck` exits 0 (vue-tsc stays green per
    WP-227); `pnpm --filter @legendary-arena/arena-client build` exits 0.
11. `git diff --name-only` lists exactly the nine files in
    `## Files Expected to Change` — no store, `bgioClient.ts`, `App.vue`, or
    other-app/package file is modified.
12. Calling `installDiagnosticCapture()` more than once yields exactly one active
    capture install: a single console call produces exactly one recorded entry
    (no duplicates) and the `window` listeners are registered once — subsequent
    calls NO-OP via the module-level `installed` flag.

---

## Verification Steps

1. Run the arena-client tests:
   `pnpm --filter @legendary-arena/arena-client test`
   Expected: all pass, `fail 0`; the suite includes the net-new `diagnostics`
   cases and no pre-existing test regresses.
2. Typecheck (must stay green per WP-227):
   `pnpm --filter @legendary-arena/arena-client typecheck`
   Expected: exits 0, no `vue-tsc` errors.
3. Build:
   `pnpm --filter @legendary-arena/arena-client build`
   Expected: `✓ built` and exit 0.
4. Console-wrap presence — confirm the capture actually wraps `console.*`:
   `grep -n "console\." apps/arena-client/src/diagnostics/diagnostics.ts`
   Expected: matches showing the original methods being saved and the wrapped
   methods being assigned (e.g., a saved-originals reference plus
   `console.error =` / `console.warn =` style reassignment). A zero result means
   the wrap was never implemented.
5. Engine/boundary import gate — the new files import no engine/server/preplan
   surface and no boardgame.io:
   `grep -rnE "@legendary-arena/(game-engine|registry|preplan)|apps/server|boardgame\.io|from 'pg'" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue`
   Expected: **zero** matches.
6. Network/persistence gate — the new files issue no fetch/socket send:
   `grep -rnE "fetch\(|WebSocket|\.emit\(|localStorage|sessionStorage" apps/arena-client/src/diagnostics/ apps/arena-client/src/components/DiagnosticExportButton.vue`
   Expected: **zero** matches.
7. Install-site check:
   `grep -n "installDiagnosticCapture" apps/arena-client/src/main.ts`
   Expected: one import line + one call line; the call is not inside an
   `import.meta.env.DEV` block.
8. Mount-site check:
   `grep -nE "DiagnosticExportButton" apps/arena-client/src/pages/PlayViewport.vue`
   Expected: one import line + one `<DiagnosticExportButton />` usage line.
9. Single-engine-import-site + router untouched:
   `git diff --name-only -- apps/arena-client/src/client/bgioClient.ts apps/arena-client/src/App.vue`
   Expected: **empty** (both files byte-identical).
10. Additive scope:
    `git diff --name-only`
    Expected: exactly the nine `## Files Expected to Change` paths.

---

## Definition of Done

- [ ] All Acceptance Criteria (1–12) pass.
- [ ] `docs/ai/STATUS.md` updated with what changed this session.
- [ ] `docs/ai/DECISIONS.md` D-22801 flipped Reserved (proposed) → Active,
      byte-identical to the EC-260 §DECISIONS.md Verbatim Block.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-228 row checked off with the
      Definition-of-Done summary line.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-260 row flipped
      Pending → Done.
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only` confirms; `bgioClient.ts` + `App.vue` absent).
- [ ] Paired EC-260 satisfied (locked values transcribed and checked).
