# EC-224b — Dashboard Ops Machine Patterns (Governance Snapshot Generator + Throughput + Activity Widgets)

**Source:** docs/ai/work-packets/WP-198-dashboard-ops-machine-patterns.md (Sub-tasks D + E + F)
**Layer:** Client (`apps/dashboard/src/**`) + Build-time tooling (`apps/dashboard/scripts/**`)
**Paired EC:** EC-224a (Sub-tasks A + B + C — cadence horizons + status chip + vision card). **EC-224a MUST execute and land on `main` before EC-224b opens.** `OverviewPage.vue` is touched by both ECs with non-overlapping inserts; EC-224b adds the two-column grid below DailyExecutionPanel and expects EC-224a's VisionCard insert to already be present.

## Pre-Session Actions (PS-1..PS-4) — Blocking

- [ ] **PS-1 — EC-224a landed.** `git log origin/main --oneline` shows the EC-224a implementation commit + governance close. `docs/ai/DECISIONS.md` carries `D-19801`, `D-19802`, `D-19803`. `OverviewPage.vue` carries the VisionCard insert at the top. If not, STOP — EC-224a is the hard dependency.
- [ ] **PS-2 — D-entries reserved.** `D-19804` (build-time governance snapshot posture) and `D-19805` (generator failure writes error JSON, never throws) MUST be appended BYTE-IDENTICALLY to `docs/ai/DECISIONS.md` per WP §Decisions Introduced. Paraphrase is FAIL.
- [ ] **PS-3 — Governance file format baseline captured.** Record verbatim samples from `main` of: (a) one `WORK_INDEX.md` row matching the regex `^- \[(x| )\] WP-(\d{3}) — (.+?)\. \*\*(Draft|Done|Ready|Blocked)\*\* (\d{4}-\d{2}-\d{2})?`; (b) one `DECISIONS.md` `### D-NNNNN —` heading + first paragraph. The generator parsers MUST round-trip the captured samples without coercion or repair.
- [ ] **PS-4 — `pnpm-lock.yaml` baseline.** Capture current SHA. The generator uses Node built-ins only; `pnpm-lock.yaml` MUST be byte-identical at completion.

If any PS item is unsatisfied, the executor STOPS and reports `BLOCKED`.

## Before Starting

- [ ] EC-224a Done ✅ (PS-1 verified): `D-19801..D-19803` landed; VisionCard present in `OverviewPage.vue`.
- [ ] `apps/dashboard/src/composables/useDataFreshness.ts` source-label union present; current values do NOT include `'BUILD'`.
- [ ] No file at `apps/dashboard/scripts/build-governance-snapshot.mjs` yet.
- [ ] No file at `apps/dashboard/src/data/governance-snapshot.json` (gitignored entry not yet added).
- [ ] No `apps/dashboard/src/data/` directory committed (this EC creates it with a `.gitkeep`).
- [ ] No files at `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue` or `apps/dashboard/src/widgets/RecentActivityWidget.vue`.
- [ ] No files at `apps/dashboard/src/composables/useGovernanceSnapshot.ts` or `.test.ts`.
- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0 (baseline).
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (post-EC-224a baseline; record count).

## Locked Values (do not re-derive)

### Generator (Sub-task D)
- **Script path** = `apps/dashboard/scripts/build-governance-snapshot.mjs`.
- **Output path** = `apps/dashboard/src/data/governance-snapshot.json` (gitignored).
- **Input files** = `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/DECISIONS.md`, `git log --oneline -50`.
- **WORK_INDEX row regex** = `^- \[(x| )\] WP-(\d{3}) — (.+?)\. \*\*(Draft|Done|Ready|Blocked)\*\* (\d{4}-\d{2}-\d{2})?` (anchored to start-of-line; per WP §D).
- **DECISIONS entry regex** = `^### D-(\d{5}) — (.+?)$` for heading; first paragraph after each heading captured (240-char cap, slice via `String.prototype.slice(0, 240)` — no normalization).
- **DECISIONS mtime resolution** = single file mtime via `git log -1 --format=%cI -- docs/ai/DECISIONS.md`. Per-entry mtime is OUT OF SCOPE for this WP (documented in WP §Known Failure Modes).
- **`git log` filter** = commits whose first line begins with `WP-NNN:` or `SPEC:`. Other prefixes are dropped silently.
- **JSON schema** = exactly per WP §D Contract. `schemaVersion: 1`. Five top-level keys: `generatedAt`, `schemaVersion`, `throughput`, `decisions`, `commits`. `error` field is OPTIONAL and present ONLY on generator failure.
- **`throughput` sub-keys** = `byWeek`, `byMonth`, `byQuarter`, `inFlight`, `blocked` (closed 5-key set).
- **Horizon-key formats** = `'YYYY-Www'` (ISO week), `'YYYY-MM'`, `'YYYY-Qn'` (n ∈ 1..4).
- **Determinism contract** — same repo state → byte-identical JSON. Object keys sorted lexicographically at every nesting level via key-sorted intermediate before `JSON.stringify(value, null, 2)`. Arrays sorted explicitly (lex by `key`/`id`, or commit-order descending — never insertion-order).
- **Lexicographic comparator** = JavaScript's default `<` string comparison (Unicode code-unit order). **NOT `String.prototype.localeCompare`** — locale-aware sort is forbidden across the contract.
- **Stdout / file byte-stream** = UTF-8 encoding, LF line endings (`\n`), no BOM, exactly one trailing `\n` at end of file.
- **Failure-mode contract (D-19805)** — if any input read fails or any parse throws, generator catches, writes `{ error: <full-sentence message>, schemaVersion: 1, generatedAt: <iso> }` to the output path, exits 0. NEVER throws to the build runner.
- **Generator dependency surface** = Node built-ins only: `node:fs/promises`, `node:child_process` (for `git log`), `node:path`, `node:url`. NO new npm dependency.

### Build wiring (Sub-task D)
- **`apps/dashboard/package.json` `build` script** = `"node scripts/build-governance-snapshot.mjs && vite build"` (verbatim; the `&&` is required so generator failure does NOT block vite — but per D-19805 the generator NEVER fails to exit 0, so the `&&` is belt-and-braces).
- **`apps/dashboard/package.json` `prebuild:snapshot` script** = `"node scripts/build-governance-snapshot.mjs"`.
- **`apps/dashboard/.gitignore` addition** = `src/data/governance-snapshot.json` (exact path).
- **`apps/dashboard/src/data/.gitkeep`** = new empty tracked file so the directory exists for the generator to write into.

### Composable (Sub-task D)
- **`useGovernanceSnapshot` exports** = `throughput(horizon: 'week' | 'month' | 'quarter')`, `decisions(limit: number)`, `commits(limit: number)`, `loadError: boolean` (true when the snapshot has a top-level `error` field).
- **Snapshot import** = `import snapshot from '../data/governance-snapshot.json'` (Vite's static-asset mechanism; a missing file at build time surfaces as a vite error, NOT a runtime error).

### Widgets (Sub-tasks D + E)
- **`GovernanceThroughputWidget` data state** = 4 count cards (Done / In-flight (Draft + Ready) / Blocked / This-week-shipped). Horizon selector at top: `This Week | This Month | This Quarter`, default `This Week`.
- **`RecentActivityWidget` data state** = unified chronological feed with badges (`DECISION` / `WP` / `SPEC`). Item shape: timestamp (relative + ISO on hover), badge, title, body (240-char cap). Default 10 items; "Show more" reveals up to 50.
- **Both widgets** follow the Widget Contract: 4-state rendering (loading / error / empty / data); freshness badge in the header.
- **Freshness badge for build-time data** = source label `'BUILD'`, freshness timestamp = snapshot's `generatedAt`. The `BUILD` source label is added to `useDataFreshness` in Sub-task F.
- **Layout placement (Sub-task F)** = new two-column grid in `OverviewPage.vue` BELOW the existing `DailyExecutionPanel`. Left: `<GovernanceThroughputWidget />`. Right: `<RecentActivityWidget />`. Existing charts grid (`DauChartWidget` + `RevenueChartWidget`) remains BELOW this new row.

### Shared support (Sub-task F)
- **`useDataFreshness` source-label union extension** = add exactly one new label: `'BUILD'`. Existing labels (`'MOCK'` etc.) untouched.

### D-entries to append (this EC)
- `D-19804` (build-time governance snapshot posture), `D-19805` (generator failure writes error JSON, never throws). Verbatim from WP-198 §Decisions Introduced.

## Guardrails

- **MUST NOT throw from the build-time generator** — D-19805. Errors are caught and written as `{ error: <message>, schemaVersion: 1, generatedAt: <iso> }`; exit 0.
- **MUST NOT add a server endpoint** — the snapshot replaces a server endpoint; no `/api/admin/governance/*` route, no HTTP call in either widget (D-19804).
- **MUST NOT commit `governance-snapshot.json`** — gitignored; the file is build-output and would churn on every WP/decision/commit.
- **MUST NOT include operator email or any PII in the snapshot JSON** — snapshot is build-output that ships to the CF Pages CDN (behind WP-197 Access gate, but PII in build output is a leak vector even behind Access).
- **MUST NOT use `Array.reduce()` with branching** for WORK_INDEX.md / DECISIONS.md parsing (00.6 Rule 7). Explicit `for...of` loops with descriptive variables.
- **MUST NOT use locale-aware comparators** (`String.prototype.localeCompare` or any ICU-dependent sort) — JavaScript default `<` Unicode code-unit comparator only. Locale-aware sort varies across runtime versions and breaks the byte-identity contract.
- **MUST NOT rely on JavaScript object insertion order** in the emitted JSON — build a key-sorted intermediate before `JSON.stringify`.
- **MUST NOT include wall-clock data outside `generatedAt`** — non-determinism vectors (`Date.now()` in array elements, `process.hrtime()`, `performance.now()`) break the byte-identity contract.
- **MUST NOT add a new npm dependency** — Node built-ins only.
- **MUST NOT import** `@legendary-arena/game-engine`, `@legendary-arena/registry`, `@legendary-arena/preplan`, or `@legendary-arena/server` in any file.
- **MUST NOT add a "refresh snapshot" button** that calls a server endpoint — that turns this WP into a server-layer WP and violates one-packet-per-session.
- **MUST NOT introduce hard-coded hex colors** in either widget — PrimeVue tokens only.
- **MUST NOT widen the `useDataFreshness` source-label union beyond adding `'BUILD'`** — single additive change; do not refactor the union shape.

## Required `// why:` Comments

- `build-governance-snapshot.mjs` — failure-mode catch-and-write-error: cite **D-19805**; throwing aborts the build and is worse for the operator than a clean widget-error state.
- `build-governance-snapshot.mjs` — deep-sort intermediate object before `JSON.stringify`: insertion-order reliance is not deterministic across Node runtime versions.
- `build-governance-snapshot.mjs` — locale-aware comparator forbidden: `keys.sort()` with no comparator (Unicode code-unit order) is the only deterministic option across runtime ICU versions.
- `build-governance-snapshot.mjs` — DECISIONS mtime is per-file (not per-entry): cite WP §Known Failure Modes ("Recent Activity feed shows a wall of `SPEC:` commits"); per-entry mtime is out of scope for this WP.
- `build-governance-snapshot.mjs` — 240-char body cap via `String.prototype.slice(0, 240)`: no normalization (no `.trim()`, no whitespace collapse); verbatim slice.
- `build-governance-snapshot.mjs` — git-log filter to `WP-NNN:` and `SPEC:` prefixes only: cite WP §D Activity feed source clause; other prefixes are dropped silently.
- `useGovernanceSnapshot.ts` — snapshot imported via Vite's static-asset mechanism: a missing file at build time surfaces as a vite error (build-time visibility), NOT a runtime error.
- `GovernanceThroughputWidget.vue` — freshness badge source label is `BUILD` (not `MOCK`): cite **D-19804**; the data is build-output, not runtime mock; the operator must see which axis the data was baked on.
- `useDataFreshness.ts` — `'BUILD'` label added: cite **D-19804**; build-time-baked data has a different freshness semantic than `MOCK`.

## Files to Produce (Diff Contracts)

Additions only; scoped per file. Edits to any unrelated line are FAIL.

- `apps/dashboard/scripts/build-governance-snapshot.mjs` — **new** — build-time generator per §Locked Values. Pure Node built-ins; deterministic output; failure-mode catch-and-write-error.
- `apps/dashboard/src/data/.gitkeep` — **new** — empty tracked file so the directory exists.
- `apps/dashboard/.gitignore` — **modified** — EXACTLY one line added: `src/data/governance-snapshot.json`. No other entries modified.
- `apps/dashboard/package.json` — **modified** — `"build"` script changed to `"node scripts/build-governance-snapshot.mjs && vite build"`; `"prebuild:snapshot"` script added. No `dependencies` or `devDependencies` modified.
- `apps/dashboard/src/composables/useGovernanceSnapshot.ts` — **new** — composable per §Locked Values §Composable.
- `apps/dashboard/src/composables/useGovernanceSnapshot.test.ts` — **new** — `node:test` coverage: throughput counts per horizon; decisions sorted mtime descending; commits sorted commit-order descending; `loadError === true` when `error` field present.
- `apps/dashboard/src/widgets/GovernanceThroughputWidget.vue` — **new** — 4-state widget per §Locked Values §Widgets.
- `apps/dashboard/src/widgets/RecentActivityWidget.vue` — **new** — 4-state widget per §Locked Values §Widgets. Shares the `useGovernanceSnapshot` composable from this same EC (no duplicate snapshot import).
- `apps/dashboard/src/composables/useDataFreshness.ts` — **modified** — EXACTLY one source-label added: `'BUILD'`. No other label / behavior touched.
- `apps/dashboard/src/pages/dashboard/OverviewPage.vue` — **modified** — EXACTLY one new two-column grid added BELOW the existing `<DailyExecutionPanel />`: left `<GovernanceThroughputWidget />`, right `<RecentActivityWidget />`. **VisionCard insert (EC-224a) MUST remain in place**; do not touch it. Existing charts grid stays below the new row.
- `docs/ai/DECISIONS.md` — **modified** — EXACTLY 2 new entries appended: `D-19804`, `D-19805`. Verbatim per WP §Decisions Introduced.
- `docs/ai/STATUS.md` — **modified** — EXACTLY one new status block: WP-198 Sub-tasks D + E + F executed; governance snapshot + throughput + activity widgets shipped. (Combine with EC-224a's status block by appending below it, OR flip EC-224a's pending status to fully Done — both acceptable.)
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-198 row flipped to `[x]` with completion date. **This is the row WORK_INDEX edit deferred from EC-224a**; lands here because WP-198 is fully done only after sub-tasks D+E+F land.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EXACTLY one row state flip (EC-224b → Done).

## After Completing

- [ ] `pnpm --filter @legendary-arena/dashboard build` exits 0. Generator runs first; `apps/dashboard/src/data/governance-snapshot.json` exists post-build.
- [ ] `pnpm --filter @legendary-arena/dashboard test` exits 0 (EC-224a baseline + new composable tests).
- [ ] **Determinism gate.** Two sequential `pnpm --filter @legendary-arena/dashboard prebuild:snapshot` runs produce byte-identical files (`Get-FileHash` comparison).
- [ ] **Failure-mode gate.** Temporarily rename `docs/ai/work-packets/WORK_INDEX.md`; re-run `prebuild:snapshot`; confirm: (a) exit code 0; (b) output JSON has `error` key with a full-sentence message + `schemaVersion: 1` + `generatedAt`; (c) generator does NOT throw to the shell. Restore the file.
- [ ] **Schema gate.** `ConvertFrom-Json` parses the snapshot cleanly; top-level keys deep-equal `['commits', 'decisions', 'generatedAt', 'schemaVersion', 'throughput']` (lex-sorted); `throughput` keys deep-equal `['blocked', 'byMonth', 'byQuarter', 'byWeek', 'inFlight']`.
- [ ] **PII gate.** `Select-String -Path apps\dashboard\src\data\governance-snapshot.json -Pattern "@barefootbetters\.com|@legendary-arena\.com|jeff@"` returns zero matches.
- [ ] **Gitignore gate.** `git status apps\dashboard\src\data\governance-snapshot.json` returns empty (file is ignored). `git ls-files apps/dashboard/src/data/.gitkeep` returns one match (the .gitkeep IS tracked).
- [ ] **Build-wiring gate.** `apps/dashboard/package.json` `"build"` value is exactly `"node scripts/build-governance-snapshot.mjs && vite build"`; `"prebuild:snapshot"` value is exactly `"node scripts/build-governance-snapshot.mjs"`.
- [ ] **`useDataFreshness` source-label drift gate.** A `node:test` assertion confirms the source-label union now includes `'BUILD'` alongside the prior labels — no removal, no rename.
- [ ] **No-dependency gate.** `git diff --stat pnpm-lock.yaml` empty; `git diff --stat apps/dashboard/package.json` shows ONLY the `"build"` and `"prebuild:snapshot"` script changes (no `dependencies` / `devDependencies` diff).
- [ ] **No-workspace-import gate.** `Select-String -Path apps\dashboard -Pattern "@legendary-arena/(game-engine|registry|preplan|server)" -Recurse` returns zero matches.
- [ ] **No-hex-colors gate.** `Select-String -Path apps\dashboard\src\widgets\GovernanceThroughputWidget.vue, apps\dashboard\src\widgets\RecentActivityWidget.vue -Pattern "#[0-9A-Fa-f]{3,8}"` returns zero matches.
- [ ] **No-server-endpoint gate.** `git diff --name-only origin/main -- apps/server/src/ docs/ai/REFERENCE/api-endpoints.md` returns empty.
- [ ] **OverviewPage composition gate.** `OverviewPage.vue` contains EXACTLY one `<VisionCard />` (from EC-224a, untouched) AND EXACTLY one new two-column grid containing `<GovernanceThroughputWidget />` + `<RecentActivityWidget />` BELOW `<DailyExecutionPanel />`.
- [ ] `docs/ai/DECISIONS.md` carries `D-19801..D-19805` (EC-224a landed `D-19801..D-19803`; this EC adds `D-19804`, `D-19805`).
- [ ] `docs/ai/STATUS.md` reflects full WP-198 completion; `docs/ai/work-packets/WORK_INDEX.md` carries WP-198 `[x]` with completion date; `docs/ai/execution-checklists/EC_INDEX.md` EC-224b Done; EC-224a row already Done (verified in PS-1).
- [ ] **Build-time freshness verification (manual).** `pnpm dash:dev`, open `/overview` as admin, confirm both new widgets render the `BUILD` freshness badge + the `generatedAt` timestamp. Sanity-check the counts against a manual `grep '\[x\] WP-' docs/ai/work-packets/WORK_INDEX.md | wc -l`.

## Common Failure Smells

- Generator throws on a missing input file → D-19805 violation. Fix: catch all read/parse errors; write `{ error: <message>, schemaVersion: 1, generatedAt: <iso> }`; exit 0.
- Snapshot byte-identity check fails across two runs → non-deterministic generator. Likely causes: (1) JSON-object insertion-order reliance — fix with key-sorted intermediate; (2) `Date.now()` or wall-clock data outside `generatedAt` — remove; (3) `localeCompare` used somewhere — replace with bare `.sort()`.
- Snapshot includes a `mtime` field with millisecond-precision timestamp that changes per build → non-determinism vector. Fix: use the file's git-log mtime (`%cI` — committer-date ISO), which is stable across builds.
- Snapshot contains `jeff@barefootbetters.com` → PII gate violation. Likely cause: a commit subject was captured verbatim and contained the email. Fix: strip email-shaped tokens via regex before persistence.
- `governance-snapshot.json` shows up in `git status` → `.gitignore` entry missing or path wrong. Fix: confirm `src/data/governance-snapshot.json` (NOT `governance-snapshot.json`, NOT `data/governance-snapshot.json`) is the gitignored line.
- Vite build fails with "Cannot find module '../data/governance-snapshot.json'" → generator did not run before vite. Fix: confirm `"build"` script is `"node scripts/build-governance-snapshot.mjs && vite build"` (chained, in this order).
- Widget freshness badge shows `MOCK` instead of `BUILD` → source-label wiring error in widget. Fix: widget reads the snapshot's `generatedAt` + uses `'BUILD'` source label, not the default `MOCK`.
- `RecentActivityWidget` shows only `SPEC:` commits and no DECISIONS → expected per WP §Known Failure Modes (DECISIONS mtime is per-file). Document in widget tooltip; do not try to fix here.
- `useDataFreshness` source-label union widened to include `'BUILD'` AND another new label → scope creep. Fix: revert; this EC adds EXACTLY one label.
- `useReduce()` with branching used in the throughput-by-week aggregation → 00.6 Rule 7 violation. Fix: explicit `for...of` loop with a descriptive counter object.
- `OverviewPage.vue` had its VisionCard insert (EC-224a) accidentally modified or moved → cross-EC tampering. Fix: revert the VisionCard region; only ADD the new grid.
- A server endpoint or `fetch()` call landed in either widget → D-19804 violation. Fix: revert; both widgets read the imported snapshot only.
- New npm dependency added to `apps/dashboard/package.json` → guardrail violation. Fix: revert; Node built-ins only.
- WORK_INDEX.md row not flipped to `[x]` despite full WP-198 completion → governance close incomplete. Fix: flip the row with the completion date.
