# WP-199 — Dashboard Daily-Driver: STATUS Feed + Real Governance KPIs + Actionable Now Card

**Status:** Ready
**Primary Layer:** Client (`apps/dashboard`)
**Dependencies:** WP-197 (Dashboard Live Deploy) — Done 2026-06-02; WP-198 (Ops Machine Patterns — both ECs landed) — Done 2026-06-02
**EC:** EC-226 (`docs/ai/execution-checklists/EC-226-dashboard-daily-driver-status-feed-and-governance-kpis.checklist.md`)
**Baseline:** `origin/main` at `9abc6213` (recorded at draft-session start, 2026-06-02; per `01.0a` Step 2). Supersession checks (slug greps, file-glob, `gh pr list`) returned no true collisions; `gh pr list --search "governance-kpis"` matched WP-198's governance-snapshot PRs on the substring "governance" only.

---

## Goal

After this packet, `https://dashboard.legendary-arena.com/overview`
earns a daily-driver morning visit by surfacing three additions that
all live on **real repo data**, not mock generators:

1. **STATUS feed widget** — surfaces the operator's own `docs/ai/STATUS.md`
   changelog (newest first; collapsed cards by default; expand for
   the headline paragraph; "Open WP" link). The single richest
   "what shipped" artifact in the repo (currently ~7,500 lines, ~20+
   executed-WP entries) becomes a glance-readable surface on Overview.

2. **Real governance KPI strip** — a new 3-card strip rendered
   **above** the existing mock KPI strip (the existing 4 mock cards
   stay in place as forward-looking placeholders for when the game
   has real players). The three new cards carry real numbers derived
   from the build-time governance snapshot: **WPs Done This Week**,
   **Days Since Last Done Flip**, **Open Drafts**. Each carries the
   `BUILD` freshness badge introduced by WP-198 D-19804.

3. **Actionable "Now" extensions on GovernanceThroughputWidget** —
   the existing "Now: next executable WP" card gains a click-to-copy
   file-path affordance and a one-line suggested next action.
   Overview also gains a small "Since you last looked: N new
   commits, M new DECISIONS, K new STATUS entries" line below the
   page header, computed from a localStorage-stored last-visit
   timestamp compared against the snapshot's `generatedAt` and the
   latest entries in each feed.

All three additions are **build-time + client-only** — no server
endpoint added, no DB query, no PII, no CORS edit, no auth posture
change. The build-time generator from WP-198 gains one new parser
(STATUS.md) and one new computed block (governance KPIs); everything
else flows through the existing `useGovernanceSnapshot` composable.

---

## Assumes

- WP-197 deploy live; WP-198 governance snapshot generator on `main`
  and emitting `apps/dashboard/src/data/governance-snapshot.json`
  cleanly (schemaVersion 1; 5 top-level keys; closed 6-key
  `throughput` sub-set).
- `apps/dashboard/scripts/build-governance-snapshot.mjs` exists and
  parses `WORK_INDEX.md` rows via the locked regex
  `^- \[(x| )\] WP-(\d{3}) — (.+?)\. \*\*(Draft|Done|Ready|Blocked)\*\* (\d{4}-\d{2}-\d{2})?`
  (verified 2026-06-02 against WP-198 STATUS).
- `apps/dashboard/src/composables/useGovernanceSnapshot.ts` exposes
  `throughput()`, `nextExecutable(limit)`, `decisions(limit)`,
  `commits(limit)`, `loadError` per WP-198 §F + D-19806.
- `apps/dashboard/src/composables/useDataFreshness.ts` accepts
  `'BUILD'` source label per WP-198 D-19804.
- `docs/ai/STATUS.md` exists; section headings match
  `^### (WP-\d{3}) / (EC-\d{3}[a-z]?) Executed — (.+?) \((\d{4}-\d{2}-\d{2})\)$`
  (verified 2026-06-02 against `origin/main` — observed entries
  WP-198 / EC-224a, WP-198 / EC-224b, WP-196 / EC-225, WP-197 /
  EC-223, WP-195 / EC-222, ...).
- `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue`
  renders 4 cards in locked order (Now / Done / In-flight / Blocked)
  per WP-198 D-19806; the Now card's title is the lowest-numbered
  `Ready`/`Draft` WP whose deps are all `Done`.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` currently
  composes (top→bottom): VisionCard, page header (h1 "Overview" +
  range selector), KPI grid (4 mock cards), DailyExecutionPanel,
  two-column governance/activity row, charts grid, AlertsPanel.
- No other dashboard WP is in progress (one-packet-per-session rule).

If any of the above is false, this packet is **BLOCKED**.

---

## Scope-Tension Notice (Read Before Execution)

Roughly 10 code files + governance. Right at the lint checklist's
~8-file "should be split" threshold (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md
§5`), but the work is tightly scoped to one composable (extended),
one generator (extended), and three widget-level surfaces (one new,
two modified). No new build-time pattern is introduced; this WP
**extends** WP-198's snapshot/composable contract rather than
introducing a parallel one.

Single-session execution is the recommended posture. If the executor
hits friction, the natural split point is:

- **EC-226a** — Sub-tasks A (STATUS.md parser + StatusFeedWidget) +
  D (snapshot v2 + composable + tests), ~6 files. Lands the new
  data source and the highest-signal widget.
- **EC-226b** — Sub-tasks B (GovernanceKpiStrip) + C (Now-card
  extensions + Since-you-last-looked line), ~5 files. Lands the
  KPI strip and the actionability extensions, building on EC-226a.

The WP file itself remains one document. The split is the executor's
call at execution time; single-session is the default.

---

## Context (Read First)

- `.claude/CLAUDE.md`
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  Client layer only; no engine / registry / preplan / server imports.
- `.claude/rules/architecture.md` — Layer Boundary; Dependency
  Direction.
- `.claude/rules/code-style.md` — full file. Rule 1 (no premature
  abstraction), Rule 6 (`// why:` comments), Rule 7 (no
  `Array.reduce()` with branching), Rule 8 (no dynamic property
  access for known keys), Rule 11 (full-sentence error messages),
  Rule 14 (canonical field names).
- `docs/ai/session-context/session-context-ops-machine-video.md`
  — the inspiration capture this WP extends; cite N8 (no
  auto-write into governance artifacts — STATUS.md is read-only
  from this WP's perspective).
- `docs/ai/STATUS.md` — read the first ~6 entries (top of file)
  to confirm heading format + body shape. Entries are dense
  prose; the parser captures the heading + first paragraph only
  to keep snapshot size bounded.
- `docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md`
  — direct precedent. §D Contract + §E + §F. Mirror Constraints
  + Acceptance Criteria style exactly.
- `docs/ai/work-packets/WP-196-dashboard-net-revenue-and-paid-action-errors.md`
  — secondary precedent for the optional-fields-extending-a-type
  pattern (KpiSnapshot's `target`/`tolerance`/`direction` from
  WP-198 §B is the template for KpiSnapshot's `source` field
  added here).
- `docs/ops/DASHBOARD-REQUIREMENTS.md §1, §5 (Widget Contract),
  §11–§12 (UI Design Guidelines)` — Widget Contract is non-negotiable.
- `apps/dashboard/scripts/build-governance-snapshot.mjs` — read
  entirely; this WP extends it.
- `apps/dashboard/src/composables/useGovernanceSnapshot.ts` —
  read entirely; this WP extends it.
- `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue` —
  read entirely; this WP modifies its "Now" card slot only.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — read
  entirely; this WP modifies the page composition.
- `docs/ai/DECISIONS.md` — scan for D-19601..D-19608 (WP-196),
  D-19701..D-19702 (WP-197), D-19801..D-19806 (WP-198) — this
  WP must not contradict any of those.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file (no diffs, no
  snippets, no "show only the changed section")
- Test files use `.test.ts` extension and `node:test` + `node:assert`
- Full-sentence error messages
- pnpm workspace commands only

**Packet-specific:**
- MUST NOT import `@legendary-arena/game-engine`,
  `@legendary-arena/registry`, `@legendary-arena/preplan`, or
  `@legendary-arena/server`.
- MUST NOT add a server endpoint, call `api.legendary-arena.com`,
  or modify `apps/server/src/**`. All new data comes from extending
  the existing build-time governance snapshot — same posture as
  WP-198 §D.
- MUST NOT add a new npm dependency beyond what WP-157 + WP-162 +
  WP-196 + WP-198 already installed. The STATUS.md parser uses
  Node built-ins only (already in scope via WP-198's generator).
- MUST NOT introduce hard-coded hex colors for any structural
  element; PrimeVue design tokens only.
- MUST NOT mutate input series passed to any composable accessor.
- MUST NOT remove or rename any existing field in the snapshot JSON.
  Schema bumps from v1 to v2 are **additive only**: existing
  `commits` / `decisions` / `generatedAt` / `schemaVersion` /
  `throughput` keys retain their v1 shape byte-identical; new
  `status` and `governanceKpis` keys are added at the top level.
  Per D-19904.
- MUST NOT auto-write to STATUS.md, WORK_INDEX.md, DECISIONS.md, or
  any governance artifact from the dashboard runtime. The dashboard
  is strictly **read-only** over governance artifacts. Per the
  N8 anti-pattern in `docs/ai/session-context/session-context-ops-machine-video.md`.
- MUST NOT replace, remove, or reorder the existing 4 mock KPI cards
  (`active-players` / `matches-running` / `revenue-today` /
  `server-health`). The new governance KPI strip is **additive** —
  rendered above the existing strip — per D-19902. The mock strip
  stays as a forward-looking placeholder; replacing it would force
  a UX decision about player-side metrics that belongs in WP-B
  (acquisition + funnel), not here.
- MUST NOT store any PII or operator-identifying data in the
  snapshot JSON or in localStorage. The "since you last looked"
  timestamp is a numeric ISO string only — no email, no account
  ID, no IP. Per D-19903.
- MUST NOT use `Array.reduce()` with branching to parse STATUS.md
  or compute governance KPIs (00.6 Rule 7); use explicit `for...of`
  loops with descriptive variables.
- MUST cap STATUS.md body capture at **480 characters** per entry
  (verbatim `String.prototype.slice(0, 480)` with no `.trim()` or
  whitespace normalization — mirrors WP-198 D-19804's
  DECISIONS-body discipline at 240 chars; the longer cap reflects
  STATUS entries being substantively richer prose).
- MUST cap snapshot `status` array at **50 entries** (newest-first
  by date in heading). Older entries remain in STATUS.md but are
  not surfaced in the dashboard.
- **Tie-break rule (per D-19905).** When two entries share the
  same date in heading, MUST preserve their relative order of
  appearance in `STATUS.md` (top-to-bottom). MUST NOT rely on
  filesystem, parser iteration, or any other non-deterministic
  ordering source for tie-breaking. The "file order" notion is
  document-position only — the byte offset of each heading in
  `STATUS.md` is the tie-break key.
- **Body capture algorithm (per D-19905).** A "non-empty line"
  is any line where `line.trim().length > 0`. The body capture
  for an entry is the deterministic 3-step algorithm:
  (1) starting from the line immediately after the heading,
  advance past zero-or-more empty lines (skip phase);
  (2) capture consecutive non-empty lines into the body buffer
  (capture phase);
  (3) stop at the first empty line OR at the next `^###` heading,
  whichever comes first (stop phase).
  The captured buffer is joined with `\n` and then passed through
  `String.prototype.slice(0, 480)` — no `.trim()` on the joined
  result, no whitespace normalization, no markdown stripping.
- **ISO week computation (per D-19905).** "This week" anchor is
  derived from `today` (the HEAD commit's committer-date ISO from
  WP-198 D-19804) by:
  (1) converting `today` to UTC via the ISO offset;
  (2) computing the ISO weekday where Monday=1 ... Sunday=7
      (note: `Date.getUTCDay()` returns Sunday=0...Saturday=6;
      the translation is `((getUTCDay() + 6) % 7) + 1`);
  (3) subtracting `(isoWeekday - 1)` days from the UTC calendar
      date to find the Monday of the same week;
  (4) normalizing the time-of-day to `00:00:00.000` UTC.
  The week-end is `weekStart + 6 days 23:59:59.999` UTC.
  MUST NOT use `toLocaleString`, `Intl.DateTimeFormat`, or any
  locale-dependent week calculation — those vary across runtime
  ICU versions and break the determinism gate.
- **STATUS-entry WP file path resolution (per D-19906).** The
  generator MUST resolve each entry's WP filename at build time
  by:
  (1) reading the directory listing of `docs/ai/work-packets/`
      via `node:fs/promises.readdir`;
  (2) filtering filenames whose name starts with the literal
      prefix `WP-${wpNumber}-` (where `wpNumber` is zero-padded
      to 3 digits — `WP-198-`, not `WP-19-`);
  (3) if exactly one filename matches, emit it as
      `StatusEntry.filePath` (relative path from repo root, e.g.
      `docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md`);
  (4) if zero or more-than-one match, emit `StatusEntry.filePath`
      as the empty string `""` AND log a full-sentence warning to
      stderr naming the wpNumber and the match count;
  (5) the widget renders the "Open WP" link only when
      `filePath !== ''`; otherwise renders plain text.
  MUST NOT construct WP paths from `WP-${wpNumber}-*.md` glob
  patterns at runtime — runtime glob resolution is not available
  in the SPA, and a non-deterministic guess is worse than no
  link.
- **Parser symmetry (per D-19907).** The STATUS.md parser in
  `build-governance-snapshot.mjs` MUST mirror the DECISIONS.md
  parser's structure and control flow — same skip-then-capture
  body algorithm, same per-entry error containment, same
  `for...of` over heading matches. The two parsers differ only
  in (a) the heading regex, (b) the body cap (480 vs 240), and
  (c) the per-entry `filePath` resolution (STATUS only). A
  refactor that extracts a shared helper is acceptable but not
  required; the load-bearing rule is symmetrical control flow,
  not shared code.
- **Governance KPI zero-vs-null discipline (per D-19908).**
  Governance KPI fields MUST use numeric `0` for empty values,
  never `null` or `undefined`. The `GovernanceKpis` interface
  declares all three fields as required (non-optional) numbers
  with `0` as the meaningful zero-value (e.g., zero WPs done
  this week is a real, surfaceable state — not a missing-data
  state). The composable's accessor returns `null` only when
  the whole snapshot has an `error` field (the
  governance-KPIs-cannot-be-computed-at-all case); the
  individual fields are always concrete numbers when the
  accessor returns a non-null value.
- **Composable naming + import pattern (per D-19909).** New
  composables added by this WP (`useGovernanceSnapshot`
  extension, `useLastVisit`) MUST follow the existing
  `useGovernanceSnapshot.ts` shape: `use*` naming; default
  export OR named export matching the surrounding files;
  import path style matching the surrounding files; JSDoc
  header on every exported function. No new naming conventions,
  no new factory-function patterns, no new HOC wrappers.
- **JSON deterministic emission (per D-19904 hardening).**
  Generator constructs snapshot objects with explicit
  alphabetical key insertion-order, OR applies a `JSON.stringify`
  replacer that enforces lex-sorted key emission at every
  nesting level. Reliance on V8 object insertion-order alone
  for "alphabetical" emission is FAIL.
- **HEAD commit date single-call invariant (per D-19904
  hardening).** `git log -1 --format=%cI HEAD` invoked exactly
  once per generator run; the resolved string is reused for
  `generatedAt`, the ISO week anchor for `wpsDoneThisWeek`, and
  the day-delta arithmetic for `daysSinceLastDoneFlip`. A
  second `git log` invocation anywhere in the generator is FAIL.
- **JS string index for heading positions (per D-19905
  hardening).** "Heading byte-offset" in the tie-break rule is
  the JS string index returned by `rawText.indexOf(headingLine)`
  or a regex match's `.index` property. `Buffer.byteLength` and
  any UTF-8 byte-counting approach are FORBIDDEN.
- **Lex-sort ISO date comparator (per D-19905 hardening).** Date
  comparisons inside the parser sort the literal `'YYYY-MM-DD'`
  substring under string `<` / Unicode code-unit comparator.
  Round-tripping through `new Date(dateString)` or `Date.parse`
  for sort purposes is FORBIDDEN.
- **Explicit UTF-8 encoding + BOM strip (per D-19905 hardening).**
  Every governance-source `readFile` call (`STATUS.md`,
  `WORK_INDEX.md`, `DECISIONS.md`) passes `'utf-8'` as the
  explicit second argument; never the implicit-binary form. Any
  leading BOM character is stripped before parsing.
- **Heading-uniqueness skip-and-warn (per D-19905 hardening).**
  Parser detects duplicate `(wpNumber, ecNumber, date)` triplets
  across regex matches; on detection, skips every match in the
  overlap group AND emits a full-sentence stderr warning naming
  the triplet and the duplicate-match count.
- **Cross-layer single-implementation (EC discipline).** Every
  rule in the Locked Contract Values table is implemented in
  exactly one place in the codebase — either the generator
  (`build-governance-snapshot.mjs`) or a single composable / util.
  Widget components MUST NOT recompute generator-side logic at
  render time (no client-side ISO week computation, no
  client-side path resolution, no client-side STATUS body
  post-processing).
- MUST handle STATUS.md parse failures via the WP-198 D-19805
  error-mode contract: write the error JSON, exit 0, never throw.
  A single missing field in one entry must not blank the entire
  snapshot — skip the malformed entry, log a warning to stderr,
  continue.

**Session protocol:**
- If STATUS.md heading format has drifted from the regex above,
  STOP and ask. Do not invent a parser branch; if the format is
  genuinely evolving, that's a governance decision to lock in
  STATUS.md itself before this parser ships.
- If the governance KPI definitions need to be tuned (e.g., "WPs
  Done This Week" target value), STOP and ask. The initial
  defaults are placeholder; real targets are operator-set.
- If the snapshot schemaVersion bump from 1 to 2 would conflict
  with another in-flight dashboard WP, STOP and ask. Coordinate
  the bump in one place.

**Locked contract values:**

| Item | Value |
|---|---|
| Snapshot schemaVersion | bumps from `1` to `2`; additive only |
| New top-level snapshot keys | `status: ReadonlyArray<StatusEntry>`, `governanceKpis: GovernanceKpis` |
| Closed top-level key set (v2) | `commits`, `decisions`, `generatedAt`, `governanceKpis`, `schemaVersion`, `status`, `throughput` (7 keys, lex-sorted) |
| STATUS.md heading regex | `^### (WP-\d{3}) / (EC-\d{3}[a-z]?) Executed — (.+?) \((\d{4}-\d{2}-\d{2})\)$` (anchored start-of-line; one match per entry) |
| STATUS body capture | First contiguous block of non-empty lines after the heading (markdown convention: blank between heading and body, so leading blanks are skipped — same as DECISIONS in WP-198); `String.prototype.slice(0, 480)` verbatim |
| STATUS entries cap | 50 entries max in snapshot; newest-first by heading date |
| Governance KPI ids | `wps-done-this-week`, `days-since-last-done-flip`, `open-drafts` |
| `wps-done-this-week` definition | count of WPs in `Done` status whose date in heading falls within the current ISO week (Monday 00:00 UTC through Sunday 23:59 UTC); target 3, tolerance 2, direction `higher-is-better` (placeholder per D-19902) |
| `days-since-last-done-flip` definition | integer days between today and the latest `Done`-status WP's heading date; target 2, tolerance 3, direction `lower-is-better` (placeholder per D-19902) |
| `open-drafts` definition | count of WPs in `Draft` status; target 5, tolerance 5, direction `lower-is-better` (placeholder per D-19902) |
| KPI strip placement | New `<GovernanceKpiStrip />` rendered between `<VisionCard />` and the page header; existing `.kpi-grid` mock strip retained byte-identical below the page header |
| Status feed widget placement | New `<StatusFeedWidget />` rendered to the right of `<GovernanceThroughputWidget />` in the existing two-column row, replacing the current right-column `<RecentActivityWidget />`; activity widget moves to a new three-column row OR is dropped from Overview and moved to a new `/activity` route (operator pick at execution; default = drop from Overview, leave on `/activity` as a follow-up if requested) |
| Last-visit storage key | `la-dashboard-last-visit` (per-user-per-browser; ISO string value; no PII) |
| Last-visit comparison anchor | `snapshot.generatedAt` (NOT runtime wall clock — preserves WP-198 D-19804 determinism); plus latest commit timestamp, latest STATUS heading date |
| Suggested-next-command format | `"Open new session and read ${wpFilePath}"` — plain string, copyable; no execution, no shell-out |
| JSON key sort mechanism (D-19904 hardening) | Explicit alphabetical key insertion-order construction OR a single `JSON.stringify` replacer that enforces lex-sorted key emission at every nesting level. Reliance on JS object insertion-order alone is FAIL. |
| HEAD commit date resolution (D-19904 hardening) | `git log -1 --format=%cI HEAD` invoked **exactly once** per generator run; resolved string threaded through `generatedAt` + ISO week anchor + KPI date deltas. Second invocation is FAIL. |
| Heading-position primitive (D-19905 hardening) | JavaScript string index from `rawText.indexOf(headingLine)` or regex `.index` (UTF-16 code-unit index). `Buffer.byteLength` and UTF-8 byte counting are FORBIDDEN. |
| Date-sort comparator (D-19905 hardening) | Lexicographic string sort on the literal `'YYYY-MM-DD'` substring; `Date`-object round-trip for sort purposes is FORBIDDEN. |
| File read encoding (D-19905 hardening) | `readFile(path, 'utf-8')` with explicit encoding; never the implicit-binary form. Leading BOM (`﻿`) stripped before parse. |
| Heading uniqueness rule (D-19905 hardening) | Duplicate `(wpNumber, ecNumber, date)` triplets cause every match in the overlap group to be skipped; full-sentence stderr warning emitted naming the triplet + count. |
| Cross-layer single-implementation discipline (top-of-EC) | Every rule in the Locked Contract Values table is implemented in exactly one place — generator OR a single composable/util. Widget MUST NOT recompute generator-side logic at render time. |

---

## Scope (In)

### A) STATUS.md parser + StatusFeedWidget (Suggestion 1)

- **Modified:** `apps/dashboard/scripts/build-governance-snapshot.mjs`
  - Add `parseStatusMd(rawText, workPacketDirEntries): ReadonlyArray<StatusEntry>`
    helper. Regex per the Locked Contract Values table; body via
    the deterministic 3-step skip-then-capture algorithm locked
    under D-19905; `filePath` field resolved against
    `workPacketDirEntries` per D-19906 (caller passes the
    `fs.readdir('docs/ai/work-packets/')` result to keep the
    parser pure-ish — no FS I/O inside the parser itself).
  - Parser structure mirrors the existing DECISIONS.md parser
    per D-19907 (parser-symmetry rule): same `for...of` over
    heading matches, same per-entry try/catch, same skip-capture
    body advance.
  - Read `docs/ai/STATUS.md` via `node:fs/promises.readFile`;
    read `docs/ai/work-packets/` directory listing via
    `node:fs/promises.readdir`; call the parser; sort entries
    by date in heading **lexicographic descending** with ties
    broken by the entry's heading byte offset in `STATUS.md`
    ascending (per D-19905 tie-break rule — top-to-bottom file
    order, not FS-iteration order).
  - Cap at 50 entries; older entries dropped from snapshot.
  - On STATUS.md missing or unreadable: log full-sentence
    warning to stderr, emit empty `status: []` in snapshot, DO
    NOT trip the full-snapshot error path. Per the D-19805
    contract narrowed to per-field: missing STATUS surfaces as
    empty feed in the widget, not as an error state for the
    whole snapshot.
  - On a per-entry parse failure (one entry's regex match
    succeeds but body capture or filePath resolution throws):
    skip that entry, log a full-sentence warning naming the
    wpNumber + line number, continue.
- **Modified:** `apps/dashboard/src/composables/useGovernanceSnapshot.ts`
  - Add `statusEntries(limit: number): ReadonlyArray<StatusEntry>`
    accessor. Returns the first `limit` entries from the snapshot's
    `status` array (newest-first; bounded by snapshot's own cap).
- **Modified:** `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts`
  - Add tests: `statusEntries(limit)` returns the first N entries
    preserving snapshot order; returns empty array when snapshot
    has `error` field; returns empty array when snapshot's
    `status` field is missing (forward compatibility with v1
    snapshots if any leak through).
- **New:** `apps/dashboard/src/widgets/StatusFeedWidget.vue`
  - Four-state widget contract (loading / error / empty / data).
  - "data" state: list of collapsed cards, newest first. Each
    card header shows `WP-NNN / EC-NNN — Title` + ISO date + an
    expand chevron. Expand reveals the captured body (480-char
    cap, no markdown rendering — plain text). "Open WP" link
    next to the chevron points to
    `https://github.com/<org>/<repo>/blob/main/docs/ai/work-packets/WP-NNN-*.md`
    (path computed from heading match; org/repo from
    `apps/dashboard/package.json` repository field if present,
    else fallback to plain text).
  - Default 10 visible; "Show more" reveals up to 50.
  - Same `'BUILD'` freshness badge as GovernanceThroughputWidget;
    shows snapshot `generatedAt`.
  - **"Open WP" link uses the build-time-resolved `filePath`
    field per D-19906** (NOT a runtime glob). When
    `entry.filePath === ''` (resolver found zero or >1 matches),
    the link is suppressed and the entry renders the WP
    identifier as plain text instead.

### B) Real governance KPI strip (Suggestion 2)

- **Modified:** `apps/dashboard/scripts/build-governance-snapshot.mjs`
  - Add `computeGovernanceKpis(parsedWpRows, today): GovernanceKpis`
    helper. Returns an object with `wpsDoneThisWeek`,
    `daysSinceLastDoneFlip`, `openDrafts` numeric fields.
  - `today` sourced from `git log -1 --format=%cI HEAD` (the same
    HEAD commit date used for `generatedAt` per WP-198 D-19804) —
    NOT wall clock. Preserves byte-identity determinism.
  - "This week" anchor: ISO week containing `today` (Monday 00:00
    UTC through Sunday 23:59 UTC). Standard ISO-8601 week boundary.
- **Modified:** `apps/dashboard/src/composables/useGovernanceSnapshot.ts`
  - Add `governanceKpis(): GovernanceKpis | null` accessor.
    Returns the snapshot's `governanceKpis` field, or `null` when
    snapshot has `error` field or field is missing.
- **Modified:** `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts`
  - Add tests: `governanceKpis()` returns the field verbatim;
    returns `null` on error snapshot; returns `null` when field
    missing.
- **New:** `apps/dashboard/src/widgets/GovernanceKpiStrip.vue`
  - Three-card strip mirroring the existing `KpiCard.vue` visual
    treatment (label / value / trend-equivalent — but **no trend
    arrow** since governance KPIs are point-in-time, not
    point-vs-previous). Each card uses the existing
    `computeKpiStatus()` helper from WP-198 §B to render the
    on/off-track chip against the locked target/tolerance/direction
    values from the Locked Contract Values table.
  - Freshness badge in the strip header shows `BUILD` +
    `snapshot.generatedAt`.
  - Four-state Widget Contract: loading (snapshot not yet loaded
    — vanishingly rare since it's bundled at build time), error
    (snapshot carries `error` field), empty (governance KPIs all
    zero — render the strip but show zero values, NOT an empty
    state — zeros are meaningful), data (normal case).
  - Clicking a card is a no-op for now (no drill-down route
    exists; future WP can wire one).
- **Modified:** `apps/dashboard/src/pages/dashboard/OverviewPage.vue`
  - Insert `<GovernanceKpiStrip />` between `<VisionCard />` and
    the page header. The existing `.kpi-grid` (4 mock cards) is
    **not modified** — kept byte-identical below the page header.

### C) Actionable "Now" extensions on GovernanceThroughputWidget (Suggestion 3)

- **Modified:** `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue`
  - The Now card's existing title (next executable WP's title)
    stays. Extend with two new affordances rendered below the
    title:
    - **File path** — the WP's file path
      (`docs/ai/work-packets/WP-NNN-*.md`) rendered as a
      click-to-copy monospace string. Implementation:
      `navigator.clipboard.writeText(path)` on click; show a
      transient "Copied" badge for 1.5 seconds. No external
      navigation.
    - **Suggested next action** — one-line string
      `"Open new session and read <path>"` rendered as muted
      italic text below the file path. Plain string, no
      execution, no shell-out, no template substitution beyond
      the path. The phrasing is intentionally generic so it
      doesn't lock the operator into a specific session-starter
      tool.
  - When `nextExecutable(1)[0]` is undefined (no WPs are
    executable right now — every Ready/Draft WP has unresolved
    deps), render "All WPs blocked or done — drafting room is
    open" instead of the title; suppress the file-path and
    suggested-action affordances.

### D) "Since you last looked" line on Overview

- **New:** `apps/dashboard/src/composables/useLastVisit.ts`
  - Composable wrapping localStorage key `la-dashboard-last-visit`.
    Exposes `lastVisit: Ref<string | null>` (ISO string, or null
    on first visit) and `markVisited(): void` (writes current
    `snapshot.generatedAt` — NOT wall clock — to the key).
  - Why anchor on `snapshot.generatedAt` rather than wall clock:
    determinism + reproducibility. If two operators open the
    same build, their "since you last looked" diff is identical
    regardless of when they clicked.
  - On parse failure (corrupted localStorage value), returns
    `null` and silently overwrites on next `markVisited()`.
- **New:** `apps/dashboard/src/composables/useLastVisit.test.ts`
  - Tests: first visit returns `null`; `markVisited()` writes the
    snapshot timestamp; subsequent read returns that timestamp;
    corrupted value (non-ISO string) returns `null` without
    throwing.
- **Modified:** `apps/dashboard/src/pages/dashboard/OverviewPage.vue`
  - Below the page header, render a one-line muted text:
    `"Since you last looked: N new commits, M new DECISIONS, K new STATUS entries."`
    Counts computed at mount by comparing `lastVisit.value`
    against snapshot's `commits[].sha` ordering,
    `decisions[].mtime`, and `status[].date`. If `lastVisit` is
    `null` (first visit), render
    `"First visit — viewing snapshot from <generatedAt>."`
    instead.
  - **`markVisited()` ordering rule (per D-19910).** The strict
    ordering at mount is:
    (1) read `lastVisit.value` into a local snapshot;
    (2) compute the N/M/K diff counts against that local
        snapshot;
    (3) render the line with the computed counts;
    (4) ONLY THEN call `markVisited()`.
    `markVisited()` MUST run **at most once per component mount**
    — a `mounted` ref or a one-shot guard prevents reactive
    re-renders from triggering a second call. Multi-tab safety:
    because `markVisited()` writes `snapshot.generatedAt` (which
    is deterministic per build), two tabs opening the same build
    each write byte-identical values — the multi-tab "race" is
    idempotent, not a correctness bug. The single-mount guard
    is about preventing intra-tab re-render loops, not multi-tab
    coordination.

### E) Type extensions

- **Modified:** `apps/dashboard/src/types/index.ts`
  - Add `StatusEntry` interface:
    ```ts
    export interface StatusEntry {
      readonly wpNumber: number;       // 198
      readonly ecNumber: string;       // "224a" — preserves the literal-string suffix
      readonly title: string;
      readonly date: string;           // "YYYY-MM-DD" from heading
      readonly body: string;           // first paragraph, 480-char cap per D-19905
      readonly filePath: string;       // resolved WP file path per D-19906; empty string when zero or >1 matches
    }
    ```
  - Add `GovernanceKpis` interface:
    ```ts
    export interface GovernanceKpis {
      readonly wpsDoneThisWeek: number;
      readonly daysSinceLastDoneFlip: number;
      readonly openDrafts: number;
    }
    ```
  - No change to existing `KpiSnapshot`, `KpiStatus`,
    `KPI_STATUSES`, or any other type from WP-198.

### F) Decisions

Ten D-entries appended to `docs/ai/DECISIONS.md` (the original
four from the first draft plus six tightening decisions added
2026-06-02 after external pre-execution review):

- **D-19901** — STATUS.md becomes a third governance-snapshot data
  source (alongside WORK_INDEX.md and DECISIONS.md). Parser anchors
  on the locked heading regex; body capture mirrors the WP-198
  D-19804 DECISIONS discipline (first contiguous non-empty block,
  verbatim slice — but at 480 chars to reflect STATUS entries
  being substantively richer prose). Snapshot caps at 50 newest
  entries.
- **D-19902** — Real governance KPI strip is **additive** (new
  widget above the existing mock KPI strip), not in-place
  replacement of the 4 existing mock cards. The mock strip
  (`active-players`/`matches-running`/`revenue-today`/`server-health`)
  stays as forward-looking placeholders for when the game has real
  player data. Replacing it would force a UX decision about
  player-side metrics that belongs in WP-B (acquisition + funnel)
  per the pre-mortem grouping memory, not here.
- **D-19903** — "Since you last looked" diff anchors on
  `snapshot.generatedAt` (not wall clock) for determinism and
  reproducibility. localStorage key `la-dashboard-last-visit`
  stores ISO string only — no email, no account ID, no IP, no PII
  of any kind. Per-browser; no server-side mirror.
- **D-19904** — Snapshot schemaVersion bumps from `1` to `2`.
  Bump is **additive only**: existing `commits`/`decisions`/
  `generatedAt`/`schemaVersion`/`throughput` keys retain v1 shape
  byte-identical; new `status` and `governanceKpis` keys are added
  at the top level. Closed top-level key set becomes 7 (lex-sorted).
  Composable accessors handle both versions for one build cycle —
  v1 snapshots emit empty arrays / null for the new fields rather
  than crashing.

### G) Governance index updates

- `docs/ai/work-packets/WORK_INDEX.md` — add WP-199 row in the
  Phase 8+ (dashboard) section.
- `docs/ai/STATUS.md` — note the three new operator-dashboard
  capabilities that ship with this packet.

---

## Snapshot JSON Shape (v2)

```ts
interface GovernanceSnapshot {
  readonly schemaVersion: 2;                        // bumped from 1 per D-19904
  readonly generatedAt: string;                     // ISO; unchanged from v1
  readonly error?: string;                          // unchanged from v1
  readonly throughput: {                            // unchanged from v1; 6 keys
    readonly byWeek: ReadonlyArray<HorizonCount>;
    readonly byMonth: ReadonlyArray<HorizonCount>;
    readonly byQuarter: ReadonlyArray<HorizonCount>;
    readonly inFlight: ReadonlyArray<WpRef>;
    readonly blocked: ReadonlyArray<WpRef>;
    readonly now: ReadonlyArray<WpRef>;
  };
  readonly decisions: ReadonlyArray<DecisionEntry>; // unchanged from v1
  readonly commits: ReadonlyArray<CommitEntry>;     // unchanged from v1
  readonly status: ReadonlyArray<StatusEntry>;      // NEW per D-19901; cap 50; newest first
  readonly governanceKpis: GovernanceKpis;          // NEW per D-19902
}
```

All arrays sorted explicitly. All object keys sorted alphabetically
in emitted JSON. Determinism gate from WP-198 D-19804 holds:
same `HEAD` → byte-identical snapshot.

---

## Out of Scope

- `apps/server/src/**` — no server endpoint, no API call to
  `api.legendary-arena.com`.
- `packages/` — no engine, registry, or pre-planning changes.
- `apps/arena-client/` — untouched.
- Replacing or modifying the existing 4 mock KPI cards (per D-19902).
- Adding funnel widgets (newsletter subscribers, new accounts,
  conversion rates) — that's WP-B from the pre-mortem grouping
  and depends on external data sources + a PII-posture decision
  that this WP does not make.
- Real-data wiring of DauChart, RevenueChart, AlertsPanel — those
  ride their own follow-up WPs (server endpoints required).
- Drag-to-reorder on StatusFeedWidget — N1 anti-pattern from the
  inspiration capture; intentionally not imported.
- Server-side mirror of the last-visit timestamp — per D-19903,
  per-browser localStorage only; no PII leaves the browser.
- Auto-writing to STATUS.md from the dashboard — N8 anti-pattern
  from the inspiration capture; dashboard is strictly read-only
  over governance artifacts.
- Markdown rendering inside StatusFeedWidget bodies — plain text
  only. The captured body is operator prose with inline backticks
  and links that markdown rendering would partially mangle; plain
  text preserves the captured slice verbatim and avoids a markdown
  dep.
- Click-to-open WP file via local filesystem — clicking the
  "Open WP" link opens GitHub (dashboard is a web SPA; local
  filesystem URLs would only work on the operator's own machine
  with browser-specific permissions, which is a worse UX than a
  GitHub link).
- Drill-down routes for the 3 new governance KPI cards — clicks
  are no-ops for now; routes wire up in a follow-up WP if needed.
- A `/status` or `/activity` route to host displaced widgets if
  the executor decides to move `RecentActivityWidget` off Overview
  — default is to drop it from Overview entirely (the Status feed
  supersedes it in operator value). Adding a new route is a
  follow-up if the operator misses the activity feed.
- Tunable target / tolerance / direction values for the 3 governance
  KPIs — defaults are placeholder per D-19902 §Session Protocol;
  real values are operator-set in a follow-up.

---

## Files Expected to Change

**Sub-task A — STATUS feed:**
- `apps/dashboard/scripts/build-governance-snapshot.mjs` — **modified** — add STATUS.md parser + emit `status` field
- `apps/dashboard/src/composables/useGovernanceSnapshot.ts` — **modified** — add `statusEntries(limit)` accessor
- `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts` — **modified** — additive tests for `statusEntries`
- `apps/dashboard/src/widgets/StatusFeedWidget.vue` — **new** — collapsed-card feed

**Sub-task B — Governance KPI strip:**
- `apps/dashboard/scripts/build-governance-snapshot.mjs` — **modified** — add `computeGovernanceKpis` (same file as A; counted once)
- `apps/dashboard/src/composables/useGovernanceSnapshot.ts` — **modified** — add `governanceKpis()` accessor (same file as A; counted once)
- `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts` — **modified** — additive tests for `governanceKpis` (same file as A; counted once)
- `apps/dashboard/src/widgets/GovernanceKpiStrip.vue` — **new** — 3-card strip

**Sub-task C — Now-card extensions:**
- `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue` — **modified** — extend Now card with file-path + suggested-action affordances

**Sub-task D — Since-you-last-looked line:**
- `apps/dashboard/src/composables/useLastVisit.ts` — **new** — localStorage-backed last-visit tracker
- `apps/dashboard/src/composables/useLastVisit.test.ts` — **new** — composable tests

**Sub-task E — Type extensions + page composition:**
- `apps/dashboard/src/types/index.ts` — **modified** — add `StatusEntry` and `GovernanceKpis` interfaces
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — **modified** — mount `<GovernanceKpiStrip />` + `<StatusFeedWidget />` + render since-you-last-looked line; drop `<RecentActivityWidget />` from Overview (or relocate; executor pick)

**Governance (§F + §G):**
- `docs/ai/DECISIONS.md` — **modified** — append D-19901..D-19904
- `docs/ai/STATUS.md` — **modified** — note new capabilities
- `docs/ai/work-packets/WP-199-dashboard-daily-driver-status-feed-and-governance-kpis.md` — **new** — this file
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — add WP-199 row

Total: 10 unique code files (4 new + 6 modified) + 4 governance.
At the lint checklist's ~8-file threshold but not over; single-session
execution is the recommended posture per the Scope-Tension Notice.

---

## Acceptance Criteria

### A) STATUS feed
- [ ] Snapshot JSON contains a `status` array with up to 50
      entries, newest-first by date in heading.
- [ ] Each `StatusEntry` has the locked **6-field shape**
      (`wpNumber: number`, `ecNumber: string`, `title: string`,
      `date: string`, `body: string`, `filePath: string`).
- [ ] When two entries share the same date in heading, the
      relative order in the snapshot's `status` array matches
      the relative order in `STATUS.md` (top-to-bottom file
      order — heading byte-offset ascending; per D-19905).
- [ ] Body capture follows the D-19905 3-step skip-then-capture
      algorithm; a STATUS entry whose body contains a blank
      line midway captures only the first paragraph before
      that blank line.
- [ ] Every `StatusEntry.filePath` either points to a real file
      under `docs/ai/work-packets/` OR is the empty string
      `""`; no hallucinated paths (per D-19906).
- [ ] For an entry whose `filePath === ''`, the generator
      emitted a stderr warning naming the wpNumber and the
      match count (zero or N>1).
- [ ] On a fresh `pnpm --filter @legendary-arena/dashboard prebuild:snapshot`,
      the latest STATUS.md entry appears as `status[0]`.
- [ ] STATUS.md parse failure (corrupted file) writes empty
      `status: []` and continues — does not trip the full-snapshot
      error path.
- [ ] `useGovernanceSnapshot.statusEntries(10)` returns the first
      10 entries from `status` in snapshot order.
- [ ] `useGovernanceSnapshot.statusEntries(10)` returns `[]`
      when snapshot has `error` field OR when `status` field is
      missing (forward-compat with hypothetical v1 snapshots).
- [ ] `StatusFeedWidget.vue` renders 10 collapsed cards by
      default; "Show more" reveals up to 50.
- [ ] Each card header shows `WP-NNN / EC-NNN — Title` + ISO date.
- [ ] Expanding a card reveals the captured body (plain text;
      480-char cap visible if entry is longer).
- [ ] Widget displays `BUILD` freshness badge + snapshot's
      `generatedAt`.

### B) Governance KPI strip
- [ ] Snapshot JSON contains a `governanceKpis` object with
      exactly 3 numeric fields (`wpsDoneThisWeek`,
      `daysSinceLastDoneFlip`, `openDrafts`).
- [ ] `wpsDoneThisWeek` equals the count of WPs in `Done` status
      whose date in heading falls within the ISO week containing
      `HEAD`'s commit date, where the ISO week is computed via
      the D-19905 algorithm (Monday 00:00:00 UTC through Sunday
      23:59:59.999 UTC; locale-independent).
- [ ] `daysSinceLastDoneFlip` equals the integer day delta
      between `HEAD`'s commit date and the latest `Done`-status
      WP's date in heading. Negative or zero if a WP shipped on
      the same day.
- [ ] `openDrafts` equals the count of WPs in `Draft` status at
      `HEAD`.
- [ ] All three KPI values are deterministic across two
      sequential `prebuild:snapshot` runs against the same
      `HEAD` (byte-identity gate from WP-198 D-19804 still holds).
- [ ] `GovernanceKpiStrip.vue` renders exactly 3 cards in left-to-right
      order: WPs Done This Week / Days Since Last Done Flip / Open
      Drafts.
- [ ] Each card renders the on/off-track status chip via
      `computeKpiStatus()` against the locked target/tolerance/direction
      values from the Locked Contract Values table.
- [ ] Strip renders between `<VisionCard />` and the page header
      on Overview.
- [ ] The existing `.kpi-grid` mock strip (4 cards) is byte-identical
      to its pre-WP-199 shape (zero diff against `origin/main` on
      that template region).

### C) Actionable Now card
- [ ] When `nextExecutable(1)[0]` is defined, the Now card renders
      the WP title (unchanged from WP-198), the WP file path
      (click-to-copy monospace), and a one-line suggested next
      action (`"Open new session and read <path>"` muted italic).
- [ ] Click-to-copy on the path triggers `navigator.clipboard.writeText`
      and shows a transient "Copied" badge for ~1.5 seconds.
- [ ] When `nextExecutable(1)[0]` is undefined, the Now card
      renders "All WPs blocked or done — drafting room is open"
      and suppresses the file-path + suggested-action affordances.

### D) Since-you-last-looked line
- [ ] First visit renders `"First visit — viewing snapshot from <generatedAt>."`.
- [ ] After `markVisited()` runs and the page is reloaded, the
      line renders `"Since you last looked: 0 new commits, 0 new DECISIONS, 0 new STATUS entries."`.
- [ ] If the snapshot is rebuilt with new entries between visits,
      the counts reflect the diff (N new commits where commit
      timestamp > `lastVisit`, etc.).
- [ ] `lastVisit` value is a valid ISO string OR null; corrupted
      localStorage value returns null without throwing.
- [ ] No PII written to localStorage (only the ISO timestamp).
- [ ] **`markVisited()` ordering invariant holds** (per D-19910):
      a fresh-state Overview mount with mocked `lastVisit = '2026-06-01T00:00:00Z'`
      and snapshot containing 2 commits / 1 decision / 1 status
      entry newer than that timestamp renders "Since you last
      looked: 2 new commits, 1 new DECISIONS, 1 new STATUS
      entries" — i.e., the diff was computed BEFORE
      `markVisited()` wrote the new value. (Tested via a
      component-level test that asserts the rendered text before
      `markVisited()` resolves.)
- [ ] **`markVisited()` single-call invariant** (per D-19910):
      a component-level test with a spy on `markVisited` confirms
      exactly one call per mount, even when downstream state
      (e.g., a DailyExecutionPanel checkbox toggle) triggers
      re-renders.

### E) Type + page composition
- [ ] `StatusEntry` and `GovernanceKpis` interfaces exported from
      `apps/dashboard/src/types/index.ts` with the locked shapes.
- [ ] Existing `KpiSnapshot`, `KpiStatus`, `KPI_STATUSES`,
      `RuleTrigger`, `RuleEffect`, `BillingHealth`, `NetRevenueSeries`,
      `PlayerRecord`, `MatchRecord`, `AlertItem`, `AuthUser`,
      `UserRole`, `ServiceResponse`, `DateRange` types are
      byte-identical to their pre-WP-199 shape.
- [ ] `OverviewPage.vue` composition (top→bottom): VisionCard →
      GovernanceKpiStrip → page header (h1 "Overview" + range
      selector) → since-you-last-looked line → existing `.kpi-grid`
      (4 mock cards) → DailyExecutionPanel → new two-column row
      (GovernanceThroughputWidget left, StatusFeedWidget right) →
      charts grid → AlertsPanel.
- [ ] `RecentActivityWidget.vue` either no longer renders on
      Overview OR is moved to a new `/activity` route (executor
      pick at execution time; default = removed from Overview).

### Engine-wide
- [ ] `pnpm install && pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0
      (all existing + new tests pass).
- [ ] Zero imports from `@legendary-arena/game-engine`,
      `@legendary-arena/registry`, `@legendary-arena/preplan`,
      `@legendary-arena/server` in any dashboard file.
- [ ] Zero hard-coded hex colors in any new widget file (PrimeVue
      tokens only).
- [ ] No new npm dependencies added to `apps/dashboard/package.json`.
- [ ] `docs/ai/REFERENCE/api-endpoints.md` is **unchanged** by
      this WP (no server endpoint touched).
- [ ] `apps/server/src/**` zero diff against `origin/main`.
- [ ] Snapshot determinism gate from WP-198 D-19804 still passes:
      two sequential `prebuild:snapshot` runs against the same
      `HEAD` produce byte-identical files (including the new
      `status` and `governanceKpis` keys).
- [ ] Snapshot `schemaVersion` is exactly `2` in the emitted JSON.
- [ ] Snapshot top-level keys deep-equal
      `['commits', 'decisions', 'generatedAt', 'governanceKpis', 'schemaVersion', 'status', 'throughput']`
      (lex-sorted, 7 keys).
- [ ] PII gate: `Select-String -Pattern "@barefootbetters\.com|@legendary-arena\.com|jeff@"`
      returns zero matches on the emitted snapshot JSON.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] `pnpm-lock.yaml` byte-identical to HEAD.

---

## Verification Steps

```pwsh
# Step 1 — install + build (snapshot generator runs first)
pnpm install
pnpm --filter @legendary-arena/dashboard build
# Expected: snapshot generator writes governance-snapshot.json with
#           schemaVersion: 2 and new status / governanceKpis keys;
#           vite build exits 0.

# Step 2 — determinism preserved across the schema bump
pnpm --filter @legendary-arena/dashboard prebuild:snapshot
$first = Get-FileHash apps\dashboard\src\data\governance-snapshot.json
pnpm --filter @legendary-arena/dashboard prebuild:snapshot
$second = Get-FileHash apps\dashboard\src\data\governance-snapshot.json
$first.Hash -eq $second.Hash
# Expected: True

# Step 3 — schemaVersion is exactly 2 and top-level key set is closed at 7
$json = Get-Content apps\dashboard\src\data\governance-snapshot.json -Raw | ConvertFrom-Json
$json.schemaVersion
# Expected: 2
($json.PSObject.Properties.Name | Sort-Object) -join ','
# Expected: commits,decisions,generatedAt,governanceKpis,schemaVersion,status,throughput

# Step 4 — STATUS.md parse produces non-empty status array
$json.status.Count -gt 0
# Expected: True (STATUS.md has ~20+ entries at WP-199 baseline)
$json.status[0].wpNumber
# Expected: numeric, matching the most recent STATUS.md heading

# Step 5 — STATUS body capture at 480 chars (verify cap holds on long entries)
($json.status | ForEach-Object { $_.body.Length } | Measure-Object -Maximum).Maximum -le 480
# Expected: True

# Step 6 — governance KPIs are numeric and non-negative
$json.governanceKpis.wpsDoneThisWeek -ge 0
$json.governanceKpis.daysSinceLastDoneFlip -ge 0
$json.governanceKpis.openDrafts -ge 0
# Expected: True, True, True

# Step 7 — STATUS parse failure surfaces empty array, not full-snapshot error
Rename-Item docs\ai\STATUS.md docs\ai\STATUS.md.bak
pnpm --filter @legendary-arena/dashboard prebuild:snapshot
$jsonAfter = Get-Content apps\dashboard\src\data\governance-snapshot.json -Raw | ConvertFrom-Json
$jsonAfter.status.Count
# Expected: 0
$jsonAfter.error
# Expected: $null (no full-snapshot error — STATUS-specific degradation only)
Rename-Item docs\ai\STATUS.md.bak docs\ai\STATUS.md
pnpm --filter @legendary-arena/dashboard prebuild:snapshot

# Step 8 — dashboard tests (existing + new)
pnpm --filter @legendary-arena/dashboard test
# Expected: TAP output — all tests passing, 0 failing

# Step 9 — manual UI verification on /overview
pnpm dash:dev
#   Open http://localhost:5173, sign in as admin.
#   Confirm top-to-bottom:
#   - VisionCard at top (unchanged).
#   - GovernanceKpiStrip below VisionCard: 3 cards (WPs Done This
#     Week, Days Since Last Done Flip, Open Drafts) each with
#     on/off-track chip and BUILD freshness badge.
#   - Page header (h1 + range selector) unchanged.
#   - Since-you-last-looked line below header (first visit shows
#     "First visit — viewing snapshot from <generatedAt>").
#   - Existing 4 mock KPI cards unchanged byte-identical.
#   - DailyExecutionPanel unchanged.
#   - Two-column row: GovernanceThroughputWidget left (Now card
#     now shows file path + click-to-copy + suggested action),
#     StatusFeedWidget right (10 collapsed cards; expand reveals
#     body; Show More reveals up to 50).
#   - Charts grid + AlertsPanel below, unchanged.
#   Confirm click-to-copy on Now card's file path triggers a
#   transient "Copied" badge.
#   Reload the page. Confirm the since-you-last-looked line now
#   shows the diff form ("Since you last looked: 0 new commits, ...").

# Step 10 — grep for forbidden workspace imports
Select-String -Path apps\dashboard\src -Pattern "@legendary-arena/(game-engine|registry|preplan|server)" -Recurse
# Expected: zero output

# Step 11 — grep for hard-coded hex colors in new widget files
$newFiles = @(
  'apps\dashboard\src\widgets\StatusFeedWidget.vue',
  'apps\dashboard\src\widgets\GovernanceKpiStrip.vue'
)
Select-String -Path $newFiles -Pattern "#[0-9A-Fa-f]{3,8}"
# Expected: zero matches

# Step 12 — confirm api-endpoints.md untouched
git diff --name-only origin/main -- docs\ai\REFERENCE\api-endpoints.md
# Expected: empty output

# Step 13 — confirm pnpm-lock.yaml unchanged
git diff --stat pnpm-lock.yaml
# Expected: no output

# Step 14 — confirm apps/server zero diff
git diff --name-only origin/main -- apps/server/
# Expected: no output

# Step 15 — PII gate on emitted snapshot
Select-String -Path apps\dashboard\src\data\governance-snapshot.json -Pattern "@barefootbetters\.com|@legendary-arena\.com|jeff@"
# Expected: zero matches

# Step 16 — mock KPI strip byte-identical
git diff -- apps/dashboard/src/services/mocks.ts apps/dashboard/src/services/endpoints.ts
# Expected: empty (these files are NOT modified by WP-199 per the Out of Scope discipline)
```

---

## Vision Alignment

**Vision clauses touched:** `§13 Live Ops` (this WP makes the
operator dashboard a genuine daily-driver surface by tying it to
the WP/EC governance cadence and the operator's own STATUS narrative
— sharpening the "is the system healthy / are we shipping / what
ships next" daily glance that DASHBOARD-REQUIREMENTS §1 names);
`Primary Goals #1–5` and `Financial Sustainability` (rendered by
VisionCard, unchanged by this WP).

**Conflict assertion:** No conflict. This WP preserves all touched
clauses. STATUS.md is surfaced read-only; the dashboard never
writes back to it. Governance KPIs derive from existing operator
artifacts, not new player-side data sources.

**Non-Goal proximity check (NG-1..NG-7):** None crossed. All
additions are internal operator surfaces; no player-facing surface
modified. No monetization, persuasion, gacha, energy, or
social-influence mechanic introduced.

**Determinism preservation:** N/A — no engine, RNG, replay, or
simulation code touched. Snapshot determinism gate from WP-198
D-19804 still holds end-to-end via the additive schema bump.

---

## Funding Surface Gate

**N/A.** Justification per §20.1: this WP touches no global
navigation funding affordance, no registry-viewer funding affordance,
no profile / account funding-attribution surface, no tournament
funding channel integration, and no user-visible funding copy as
part of a proposed or implemented user interaction. All new
surfaces (STATUS feed, governance KPI strip, Now-card extensions,
since-you-last-looked line) are internal operator-only governance
surfaces behind the Cloudflare Access gate from WP-197. The
§20.1 analytical / retrospective mention carve-out applies.
Authority chain for §20: `WP-097`, `D-9701`, `D-9801` (cited; not
triggered).

---

## API Catalog (§21)

**N/A.** Justification: this WP does not add, modify, remove, or
change the status of any HTTP endpoint in `apps/server`, nor of any
`apps/server/src/**` library function recorded in
`docs/ai/REFERENCE/api-endpoints.md` as `Library-only`. All new
data comes from extending the existing build-time governance
snapshot pattern from WP-198 (which itself is N/A under §21 for
the same reason). No HTTP call leaves the SPA bundle.

---

## Decisions Introduced

| ID | Decision | Rationale |
|----|----------|-----------|
| D-19901 | STATUS.md is a third governance-snapshot data source. Parser anchors on the locked heading regex (`^### (WP-\d{3}) / (EC-\d{3}[a-z]?) Executed — (.+?) \((\d{4}-\d{2}-\d{2})\)$`); body capture is the first contiguous non-empty block after the heading, `String.prototype.slice(0, 480)` verbatim (no `.trim()`, no whitespace normalization — mirrors WP-198 D-19804 DECISIONS discipline at 240 chars; the longer cap reflects STATUS entries being substantively richer prose). Snapshot caps at 50 newest entries, newest-first by date in heading. | STATUS.md is the single richest "what shipped" artifact in the repo (~7500 lines, ~20+ executed-WP entries at WP-199 baseline) and was previously unsurfaced in the dashboard. The Recent Activity widget surfaces commits + decisions but not the operator narrative of what those commits *meant*. STATUS gives the operator's morning-glance the highest-signal layer. The 480-char cap balances "enough body to convey the headline finding" against "snapshot size stays bounded" — empirically STATUS headline paragraphs run 200–600 chars; 480 captures the median + bulk of long ones with the rest visible by clicking through to STATUS.md itself. |
| D-19902 | Real governance KPI strip is **additive** — rendered as a new widget above the existing 4-card mock KPI strip, not in-place replacement. The mock strip (`active-players`/`matches-running`/`revenue-today`/`server-health`) stays as forward-looking placeholders for when the game has real player data. Replacing the mock strip would force a UX decision about player-side metrics that belongs in WP-B (acquisition + funnel per the pre-mortem grouping memory), not here. | The operator's current pain ("doesn't feel daily-useful") is that the eye lands on mock content first. Adding a real-data strip above the mock strip flips that: the first thing seen is real ("WPs Done This Week: 4 — On Track"), the second thing seen is honestly-labeled placeholder ("active-players: 2500 — MOCK"). The mock strip stays as a visible promise of what the dashboard will surface once real player data exists; deleting it would force re-litigating the player-KPI catalog before WP-B has set the PII / data-source posture. |
| D-19903 | "Since you last looked" diff anchors on `snapshot.generatedAt` (the HEAD commit's committer-date ISO from WP-198 D-19804), NOT wall clock. localStorage key `la-dashboard-last-visit` stores ISO string only — no email, no account ID, no IP, no PII of any kind. Per-browser only; no server-side mirror. | Anchoring on `generatedAt` rather than wall clock preserves determinism: two operators opening the same build see byte-identical "since you last looked" deltas regardless of when they clicked. PII-free localStorage value is non-negotiable — the dashboard ships to a CF Pages CDN (behind Access per WP-197) and the SPA bundle is in principle scrapeable; localStorage is even more exposed (any in-browser script can read it). Limiting the value to an ISO string means no recovery path leaks identity even under a hypothetical XSS or Access-gate bypass. |
| D-19904 | Snapshot `schemaVersion` bumps from `1` to `2`. Bump is **additive only**: existing 5 v1 top-level keys (`commits`, `decisions`, `generatedAt`, `schemaVersion`, `throughput`) retain v1 shape byte-identical; 2 new top-level keys (`status`, `governanceKpis`) are added. Closed top-level key set becomes 7 (lex-sorted). Composable accessors handle both versions for one build cycle — v1 snapshots emit empty arrays / null for the new fields rather than crashing. **Implementation hardening:** (a) **JSON key insertion-order is locked**, not implied — the generator MUST construct snapshot objects with explicit alphabetical key insertion-order OR apply a `JSON.stringify` replacer that enforces lexicographic key sorting at every nesting level. Relying on JavaScript object insertion order without explicit control is NOT sufficient for the determinism gate. (b) **HEAD commit date single-call invariant** — `git log -1 --format=%cI HEAD` MUST be resolved exactly once per snapshot generation and the resolved string reused for `generatedAt`, the ISO week anchor, and any per-KPI date arithmetic. Multiple git invocations are forbidden because a commit landing between calls (rare but possible during long builds) would produce inconsistent values across the snapshot's fields. | The version bump is a contract-honesty signal more than a runtime necessity (snapshots are regenerated on every build; there's no persistence across versions). Bumping makes the closed-set drift gate from WP-198 §EC-224b honest: a test that asserts "exactly 5 top-level keys" would silently break under additive change without the bump. Bumping also future-proofs against operators inspecting older bundle snapshots (e.g., comparing two CF Pages preview deploys) and noticing the field gap. The "v1 → empty arrays / null" composable fallback prevents a regression in any session that picks up a stale snapshot from `git stash` or a cached build. The implementation-hardening extensions close two subtle determinism leaks: (a) JS object insertion-order is implementation-defined for integer-like keys and historically inconsistent across V8 versions — relying on it for "alphabetical" emission has bitten production at scale before; locking the rule to explicit construction or replacer-enforced sorting collapses the ambiguity; (b) two `git log` calls in the same generator run are an obvious-once-broken footgun — a commit landing mid-build (rare in operator-driven dev, more plausible in CI with concurrent jobs) would make `generatedAt` and the ISO-week anchor disagree by one commit's worth of time, breaking byte-identity across two otherwise-identical runs. |
| D-19905 | STATUS.md parser locks two determinism rules: **(a) tie-break by heading byte-offset** in `STATUS.md` ascending (top-to-bottom file order, NOT filesystem or parser iteration order); **(b) body capture algorithm** is the explicit 3-step skip-then-capture-then-stop where "non-empty" means `line.trim().length > 0` and the stop condition is the first empty line OR the next `^###` heading. **Implementation hardening:** (i) **"Heading byte-offset" is the JavaScript string index** (UTF-16 code unit index) returned by `rawText.indexOf(headingLine)` or a regex match's `.index` property — NOT `Buffer.byteLength` and NOT a UTF-8 byte count. The label "byte-offset" is historical; the underlying primitive is the JS string index, which is what `String.prototype` and `RegExp` operate on consistently. (ii) **Date comparisons use lexicographic string sort on the literal `'YYYY-MM-DD'` substring** from the heading match. The ISO format guarantees correct chronological ordering under Unicode code-unit comparator without any numeric or `Date`-object conversion. Parsing dates into `Date` objects for comparison is FORBIDDEN — `Date` constructor + comparison introduces timezone-shift bugs and locale-dependent edge cases that the string-literal sort sidesteps. (iii) **STATUS.md MUST be read with explicit `utf-8` encoding** (`readFile(path, 'utf-8')`, not `readFile(path)` which returns a `Buffer`). Any BOM character (`﻿`) at the start of the file MUST be stripped before parsing — operator editors occasionally save with BOM and parser drift would otherwise depend on which editor last touched the file. (iv) **Heading regex match uniqueness** — each STATUS.md entry MUST be parsed from exactly one heading match. If the regex produces overlapping or duplicate matches for the same `wpNumber + ecNumber + date` triplet (e.g., a copy-paste error in STATUS.md), the parser MUST skip every match in that overlap group and emit a full-sentence stderr warning naming the triplet and the duplicate-match count. | The first draft's "ties broken by file order" was ambiguous — git checkout order, FS iteration, and line-ending normalization can all drift across environments. Pinning the tie-break to heading byte-offset makes the rule executable from the parsed `STATUS.md` text alone, with zero environmental sensitivity. The body capture algorithm closes a similar gap: "first contiguous block of non-empty lines" left whitespace-only lines, code fences, and bullet-list boundaries underspecified — three implementations could plausibly produce three different bodies. The explicit `line.trim().length > 0` predicate + the dual stop condition (empty line OR next heading) collapses the ambiguity. Both rules are load-bearing for the WP-198 D-19804 determinism gate to hold end-to-end. The four implementation-hardening extensions close cross-platform drift sources that survived the original determinism framing: (i) "byte-offset" was loose terminology — `Buffer.byteLength` counts UTF-8 bytes (variable-width on non-ASCII), while `String.prototype.indexOf` returns UTF-16 code-unit indices; the two diverge on any non-ASCII heading content; locking to JS string index matches the actual runtime primitive used by the parser. (ii) `Date.parse('2026-06-02')` returns a Unix timestamp interpreted as UTC midnight on Node, but as local midnight in some browsers — a parser that round-trips through `Date` would emit different sort orders on different platforms; lexicographic string sort is platform-invariant. (iii) Implicit-binary `readFile` calls return a `Buffer` whose `.toString()` defaults vary by Node version and OS locale; explicit `'utf-8'` + BOM strip eliminates that variance class. (iv) Duplicate-heading skip-and-warn prevents silent double-counting if an operator accidentally copy-pastes an entry in STATUS.md — the failure mode is loud (stderr warning) instead of subtle (a 51st snapshot entry that's a phantom). |
| D-19906 | STATUS-entry WP file path is resolved at **build time** by the generator (`fs.readdir` over `docs/ai/work-packets/`, prefix-match on `WP-${zeroPaddedWpNumber}-`), emitted as `StatusEntry.filePath`, and consumed by the widget as a literal string. On zero or >1 matches, `filePath` is the empty string `""` and the widget suppresses the link. | The first draft used a `WP-NNN-*.md` glob pattern in widget code, which is non-resolvable at runtime in a browser SPA — the widget would have had to either guess a filename (non-deterministic, breaks audit safety) or fall back to a broken link. Resolving at build time inside the generator (which already does FS reads against `docs/ai/work-packets/` for WORK_INDEX.md parsing) keeps the resolution in the deterministic layer, surfaces ambiguity (the >1-match case) as a real signal via the stderr warning + empty-string field, and lets the widget remain a pure render. The zero-padding convention (`WP-198-`, not `WP-19-`) matches the existing WORK_INDEX heading regex shape and prevents `WP-198` from matching `WP-1984-...md` if a future WP number gets long. |
| D-19907 | STATUS.md parser MUST mirror the DECISIONS.md parser structure and control flow in `build-governance-snapshot.mjs` — same `for...of` over heading matches, same per-entry try/catch, same skip-capture body advance. The two differ only in (a) the heading regex, (b) the body cap (480 vs 240), and (c) the per-entry `filePath` resolution (STATUS only). A refactor that extracts a shared helper is acceptable but not required. | The load-bearing rule is symmetrical control flow, not shared code. The two parsers are conceptually one pattern with two configurations; allowing them to diverge structurally invites a future bug where (e.g.) DECISIONS-side error containment gets tightened and STATUS-side silently doesn't follow. By locking the symmetry at the WP level, the executor can choose extraction-or-not at execution time without ambiguity about the load-bearing constraint. |
| D-19908 | Governance KPI fields use numeric `0` for empty values, never `null` or `undefined`. The `GovernanceKpis` interface declares all three fields as **required** non-optional `number`. The composable returns `null` only for the whole-snapshot-error case (the governance-KPIs-cannot-be-computed-at-all state); individual field values are always concrete numbers when the accessor returns non-null. | UI branching complexity is the cost of "zero or null" ambiguity — every widget that consumes a KPI value would need a separate `value === null ? 'no data' : formatNumber(value)` branch, doubling the render-path conditional count for a non-distinction (zero WPs done this week IS a real, surfaceable operator state, not a missing-data state). Locking the convention at the data shape pushes the discipline up to the boundary where it matters: the composable accessor either returns a concrete `GovernanceKpis` object or returns `null` (no partial states). |
| D-19909 | New composables added by this WP follow the existing `useGovernanceSnapshot.ts` shape exactly: `use*` naming; matching export style; matching import path style; JSDoc header on every exported function. No new naming conventions, no new factory-function patterns, no new HOC wrappers. | The "no cognitive fork" standard from the dashboard's existing composable family (WP-157 + WP-162 + WP-198) is the load-bearing rule. Introducing a new convention here would mean every future operator reading the dashboard codebase has to learn two patterns for the same job. Locking the rule means the executor has zero design decisions on composable shape — copy the pattern, change the body. |
| D-19910 | `markVisited()` execution order at Overview mount is strictly: **(1) read `lastVisit` into local snapshot, (2) compute diff counts against local snapshot, (3) render the since-you-last-looked line, (4) call `markVisited()`**. `markVisited()` MUST run **at most once per component mount** (one-shot guard prevents reactive re-renders from triggering a second call). Multi-tab "race" is documented as idempotent — both tabs writing `snapshot.generatedAt` (deterministic per build) produce byte-identical localStorage state. | The order matters because a naive `markVisited()` on mount followed by a `lastVisit`-reading reactive computed would silently zero-out the diff every load — the operator would always see "0 new commits, 0 new DECISIONS, 0 new STATUS entries" regardless of how much shipped between visits. The one-shot guard prevents a subtler bug: if `markVisited()` is wired to a reactive watcher rather than a mount hook, any state change (e.g., the user toggling a checkbox in DailyExecutionPanel) could re-trigger it. The multi-tab idempotency note pre-empts a likely operator question — "what if I have two tabs open?" — by anchoring on `generatedAt` (deterministic per build) rather than wall clock. |

---

## Future Work (Explicitly Deferred)

- **WP-B (acquisition + funnel) execution** — funnel metrics
  (newsletter subscribers, new accounts, conversion rates) are
  separate; they need external data sources + a PII posture
  decision that this WP does not make. See pre-mortem grouping
  memory `project_dashboard_premortem_wps`.
- **Drill-down routes for the 3 new governance KPI cards** —
  clicking a card is a no-op for now; future WP can wire routes
  to (e.g.) a `/governance` page that breaks down the period and
  shows which specific WPs ship-flipped this week.
- **Tunable governance KPI targets** — defaults are placeholder;
  real values are operator-set in a follow-up. A small
  `apps/dashboard/src/config/governanceKpiTargets.ts` static config
  file would house them.
- **Local-filesystem WP-file open** — clicking "Open WP" link
  opens GitHub for now; a desktop-mode that opens
  `vscode://file/...` URLs would be a nice operator-machine
  affordance but requires browser-permission handling that's out
  of scope.
- **Per-entry STATUS mtime** — STATUS entries all share the
  single-file git mtime in their snapshot record; per-entry
  commit attribution would require parsing `git blame` per
  heading line, which is bounded-cost but adds generator
  complexity. Deferred unless an operator workflow needs it.
- **Markdown rendering inside StatusFeedWidget bodies** — plain
  text only for now; a follow-up WP can introduce a tiny
  markdown-to-Vue-render helper if links and inline code in
  bodies matter for daily-reading UX.
- **Activity feed restoration** — if the executor drops
  `RecentActivityWidget` from Overview (default per the Scope
  table) and the operator later misses it, a follow-up WP can
  spin a new `/activity` route. The composable + snapshot fields
  feeding it are unchanged, so the restoration WP is a 1-2 file
  re-mount.
- **Push notifications / morning email digest** — sending the
  "since you last looked" line to an operator's email would
  bridge desk to mobile, but requires a server-side scheduled
  job + ESP wiring. Deferred to a future ops-side WP.

---

## Anti-Patterns to Avoid

- Do NOT replace the existing 4 mock KPI cards in-place (per
  D-19902). The governance KPI strip is additive.
- Do NOT auto-write to STATUS.md, WORK_INDEX.md, DECISIONS.md, or
  any governance artifact from the dashboard runtime (per N8 in
  the inspiration capture). The dashboard is strictly read-only
  over governance artifacts.
- Do NOT include any PII in the snapshot JSON or in localStorage
  (per D-19903 + the WP-198 §EC-224b PII gate).
- Do NOT use wall clock (`Date.now()`, `new Date().toISOString()`,
  `performance.now()`) anywhere in the generator output (per
  WP-198 D-19804 determinism contract). Source `today` from
  `git log -1 --format=%cI HEAD` for the KPI computations.
- Do NOT use `.reduce()` with branching to parse STATUS.md or
  compute governance KPIs (00.6 Rule 7).
- Do NOT silently widen the closed top-level key set without
  bumping `schemaVersion` (per D-19904). The drift test that
  asserts "exactly N top-level keys" must update in lock-step.
- Do NOT add a "refresh snapshot" button that calls a server
  endpoint — same posture as WP-198. Build-time only.
- Do NOT use markdown rendering inside StatusFeedWidget bodies —
  plain text only. Avoids a markdown dep and preserves the
  captured slice verbatim.
- Do NOT introduce a Pinia store for any of the new state —
  composables + snapshot import is the established pattern.
- Do NOT make the governance KPI targets user-editable in the UI;
  they live in source-controlled config (or in the snapshot
  generator) only.
- Do NOT call `navigator.clipboard.writeText` without a
  user-initiated click handler — browsers block clipboard writes
  outside user-gesture handlers and the "Copied" badge would
  silently never fire.

---

## Known Failure Modes

| Symptom | Likely cause |
|---|---|
| Snapshot determinism check fails after adding STATUS parser | Parser is sensitive to file-system metadata (e.g., reading file mtime instead of `git log`-derived value). All time anchors must come from `git log`, not `fs.stat`. |
| STATUS feed shows entries in random order | Sort key is not the heading date. Verify the parser sorts by `date` field lexicographic descending (ISO dates sort correctly under Unicode code-unit comparator). |
| KPI strip on/off-track chips are all green | Target / tolerance / direction values are placeholder; real values need operator review. Either accept the placeholders for now or open a follow-up WP to tune them. |
| `wpsDoneThisWeek` is 0 on a week where WPs clearly shipped | ISO week boundary mismatch — verify the week anchor uses Monday 00:00 UTC, not Sunday or local TZ. The `git log %cI` format is timezone-aware; compare in UTC. |
| Since-you-last-looked line shows the same diff every reload | `markVisited()` is not running on mount, OR is running before the line reads `lastVisit.value`. Order matters: read first, then mark. |
| Click-to-copy on Now card shows "Copied" but clipboard is empty | Browser blocked the clipboard write — check the handler is on a direct user-gesture event (`@click`, not a setTimeout wrapper). |
| Schema bump trips a v1-shaped test elsewhere | A test in another WP's test file asserts `schemaVersion === 1` or `top-level keys = 5`. Locate via `grep "schemaVersion" apps/dashboard/src/`; update to either accept both versions or pin to v2. |
| GovernanceKpiStrip renders zeros for all cards on a fresh checkout | Snapshot has not been generated yet — the `prebuild:snapshot` step did not run. Verify `apps/dashboard/package.json` `"build"` script still includes `node scripts/build-governance-snapshot.mjs &&` at the front (WP-198 contract; this WP does NOT modify the build script). |

---

## Lint Gate Self-Review

| § | Item | Verdict |
|---|------|---------|
| 1 | All required WP sections present | PASS |
| 2 | Non-Negotiable Constraints (engine-wide + packet-specific + session protocol + locked values) | PASS |
| 3 | `## Assumes` lists all file and state dependencies with exports/shapes | PASS — WP-198 snapshot generator + composable + cadence accessors, useDataFreshness BUILD label, STATUS.md heading format, OverviewPage composition |
| 4 | `## Context (Read First)` cites specific docs and sections | PASS — DASHBOARD-REQUIREMENTS §1/§5/§11-12, WP-196 + WP-198 precedents, code-style rules, session-context-ops-machine-video.md N8 |
| 5 | `## Files Expected to Change` complete and bounded | PASS — 10 unique code files (4 new + 6 modified) at the ~8-file threshold; single-session execution recommended per Scope-Tension Notice; not over the FAIL line ("should be split" not "must be split") |
| 6 | Naming consistency | PASS — `StatusEntry`/`GovernanceKpis` follow PascalCase precedent; `wpsDoneThisWeek` etc. follow camelCase; storage key `la-dashboard-last-visit` follows WP-162 prefix convention |
| 7 | Dependency discipline — no new npm packages | PASS — generator uses Node built-ins only; composables use Vue + existing utilities |
| 8 | Architectural boundary — Client layer only | PASS — no engine/registry/preplan/server imports; build-time generator emits a static asset, not a server endpoint |
| 9 | Windows / PowerShell compatibility | PASS — Verification Steps use `pwsh` + `Select-String` + `Get-Content` + `Get-FileHash` + `Rename-Item` + `git`; no Unix-only commands |
| 10 | Environment variable hygiene | PASS — no new env vars; existing `VITE_USE_MOCKS` unchanged; localStorage value is PII-free per D-19903 |
| 11 | Auth posture | N/A — page-level role gates from WP-157 unchanged; no new auth surface |
| 12 | Tests — `node:test` only | PASS — new test files (`useGovernanceSnapshot` additive, `useLastVisit`) use `node:test` + `node:assert`; no `boardgame.io` imports |
| 13 | Verification steps — pnpm + pwsh, expected output | PASS — every step exact; expected output named |
| 14 | Acceptance criteria binary and observable | PASS — sub-tasks A–E each have explicit binary checks; engine-wide and scope-enforcement groups close the loop |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX | PASS — §F + §G cover all three |
| 16 | Code style (00.6) | PASS — constraints block enforces no `.reduce()` with branching, full-sentence error messages, `// why:` on non-obvious code (generator's per-field degradation, `markVisited`-after-read ordering, schemaVersion bump rationale), no abbreviations, JSDoc on every function in new files |
| 17 | Vision Alignment | PASS — §13 Live Ops cited; conflict assertion = no conflict; non-goal proximity = none crossed; determinism preservation = N/A documented |
| 18 | Prose-vs-grep discipline | PASS — Verification Steps' grep patterns (`@legendary-arena/(...)`, hex colors, `@barefootbetters\.com` etc.) are positively scoped to imports / hex literals / PII tokens; adjacent prose names the patterns by role (forbidden workspace imports, hard-coded hex colors, PII gate) without enumerating verbatim strings |
| 19 | Bridge-vs-HEAD staleness | N/A — this packet authors no repo-state-summarizing artifact |
| 20 | Funding Surface Gate | N/A with justification — operator dashboard behind Access, not a funding affordance; analytical / retrospective mention carve-out applies |
| 21 | API Catalog (D-11804) | N/A with justification — no `apps/server` HTTP endpoint or library function added/modified/status-changed; build-time snapshot extension does not introduce one |
