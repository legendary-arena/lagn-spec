# EC-271 — Roadmap Count-Table Generator (Execution Checklist)

**Source:** docs/ai/work-packets/WP-240-roadmap-count-table-generator.md
**Layer:** Shared Tooling / INFRA (`scripts/**` + `.github/workflows/**`) — reads two governed docs, regenerates one marker-bounded section. No engine/registry/server/app/runtime, no dependency, no migration.

> Use locked values from WP-240 verbatim. EC-271 is the operational order +
> gates + failure smells; if EC-271 and WP-240 conflict, WP-240 wins.

## Before Starting

- [ ] Read `scripts/architecture-inventory.mjs` + `.github/workflows/architecture-inventory.yml` as the generate-on-cron / PR-on-diff / visible-red template (WP-139 / D-14501).
- [ ] Read `docs/05-ROADMAP-MINDMAP.md`: the ```` ```mermaid ```` block (cluster headings + `["WP-…"]` nodes; combined `WP-005A/B` / range `WP-043..047` / cross-ref `(see ` / placeholder `📦`/`📝` / `FP-*` forms) AND the current count table + footer (the section to wrap in markers).
- [ ] Read `docs/ai/work-packets/WORK_INDEX.md` row grammar: `- [x]`/`- [ ]` + first-token WP id (`WP-NNN`, `WP-NNN<letter>`, `WP-NNN.N`); `Blocked` keyword.
- [ ] Run the generator dry-run FIRST and record the orphan list (≥ WP-236) — those are the nodes you must add in step C.
- [ ] **Baseline:** `pnpm -r build` exit. Note `tsx` is NOT a root dep today (`require.resolve('tsx')` fails at the repo root) — it must be promoted to root `devDependencies` for the root `.test.ts` to run (already in `pnpm-lock.yaml` via all 10 workspace packages; `pnpm install` fetches nothing new).
- [ ] Read WP-240 §Goal, §Scope (In/Out), §Locked Contract Values, §Acceptance Criteria.

## Locked Values (verbatim from WP-240 — do not re-derive)

- Source of truth: `WORK_INDEX.md` for status (`[x]`=done / `[ ]`=open / `Blocked`); mindmap nodes for cluster membership. Generator NEVER writes `WORK_INDEX.md`.
- Regeneration boundary: between `<!-- ROADMAP-COUNTS:START … -->` and `<!-- ROADMAP-COUNTS:END -->`; the generator is the sole writer; everything outside is hand-maintained and untouched.
- WP-ID canonical regex (used by `parseWorkIndex` AND `expandNodeId`): `/\bWP-\d{3}(?:[A-Za-z]|\.\d+)?\b/` — suffix class is `[A-Za-z]` (corpus has lowercase `WP-053a`/`WP-207a/b`, NOT just uppercase). `parseWorkIndex` count MUST equal a raw checkbox-WP-row count (count-parity test) so a regex gap fails loudly.
- Counting convention (encode, don't redefine): combined nodes → members; range nodes expand **preserving the left operand's digit width** (`WP-043..047`→`WP-043…WP-047`); cross-ref = case-sensitive substring `(see ` → skipped (counted once in its real cluster); `FP-*` a separate `+N/N` addend.
- Placeholder cluster: ALL nodes resolve to no WP/FP id AND carry only `📦`/`📝` → render `0/N` where **N = node-line count** (NOT 0), by icon (`N 📦 queued` / `N 📝 placeholders`), excluded from the WP done/total. ≥ 1 WP/FP node → not a placeholder.
- Ordering: clusters in mindmap source order; nodes preserve source order; the open/blocked summary line is derived from WORK_INDEX order (not mindmap). No locale sort.
- Orphan gate (D-24002): a WORK_INDEX WP with no mindmap node → print one strict line per orphan `ORPHAN: WP-NNN — add a mindmap node for this WP` + exit non-zero, every mode; `--write` refuses while orphans exist. Loud-fail — never bucket, never silently ignore.
- Marker integrity: missing/duplicated `ROADMAP-COUNTS:START/END` → print `ERROR: ROADMAP-COUNTS markers not found or invalid`, exit non-zero, do not write.
- CLI modes: default = print section to stdout ONLY (no write); `--write` = mutate only when no orphans + valid markers; `--check` = silent unless drift/error, exit reflects drift.
- No exit-swallowing: no `|| true`, no masked `--check`; cron generate step is `continue-on-error: true` (visible-red, EC-145 invariant).
- Cron (D-14501 reuse): `cron: '0 6 * * 1'` + `workflow_dispatch`; PR-on-diff to `bot/roadmap-counts-refresh`; no direct-to-main, no auto-merge.
- Determinism: identical (WORK_INDEX, ROADMAP) input → byte-identical section; no clock / `Math.random` / locale-dependent sort.
- No new package in the lockfile: generator = Node built-ins; `tsx` promoted to ROOT `devDependencies` (already in the lockfile via all workspace packages) so the root `.test.ts` runs — a hoist, not an install.
- CLI exit codes: 0 clean; 1 orphan(s); 2 out-of-date (`--check`); crash non-zero.

## Guardrails

- **Tooling layer only.** Touch only `scripts/**`, `.github/workflows/**`, root `package.json`, `docs/05-ROADMAP-MINDMAP.md`, + the 4 governance files. No engine/registry/server/app edit.
- **Pure helpers + thin CLI.** Export `parseWorkIndex` / `parseMindmap` / `expandNodeId` / `tallyClusters` / `renderCountTable` / `findOrphans` so the parser is unit-testable; the CLI only wires args → helpers → file/stdout.
- **Write ONLY between the markers.** Read the file, replace the `START…END` span, write back; assert the pre/post bytes outside the span are identical. Idempotent (second `--write` = no diff).
- **Orphan = loud fail.** Print every orphan id + "add a mindmap node"; exit non-zero; do not rewrite while orphans exist. Then ADD the missing nodes (≥ WP-236, Phase 2 cluster) so the committed file passes `--check`.
- **No exit-swallowing.** No `|| true` in the script or the workflow; the cron generate step uses `continue-on-error: true` only.
- **Determinism.** No `Date.now()`, no `Math.random()`, no `localeCompare`; stable sort keys; `for…of` not `.reduce()` for the tally.
- **No new package.** Generator = Node built-ins; promote `tsx` to ROOT devDeps (already in the lockfile) for the `.test.ts` only — a hoist, not an install. Verify `pnpm install` fetches nothing new.

## Required `// why:` Comments

- `roadmap-counts.mjs` (D-24002) — why an orphan WP exits non-zero (no silent uncounted WP; mindmap stays the complete membership source).
- `roadmap-counts.mjs` — why combined-line/range expansion + cross-ref skip (the existing counting convention, not a new rule).
- `roadmap-counts.mjs` — why only the marker-bounded span is rewritten (sole-writer boundary; the rest of the doc is hand-maintained).
- `roadmap-counts.yml` (D-14501) — why `continue-on-error: true` (visible-red, not `|| true`) + PR-on-diff (review is the gate).
- `docs/05-ROADMAP-MINDMAP.md` — marker comment naming `scripts/roadmap-counts.mjs` as the sole writer ("do not hand-edit").

## Files to Produce

- `scripts/roadmap-counts.mjs` — **new** — generator (pure helpers + CLI; orphan-fail; `--write`/`--check`).
- `scripts/roadmap-counts.test.ts` — **new** — `node --test` over the pure helpers + edge cases.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — add `ROADMAP-COUNTS:START/END` markers + a node per orphaned WP (≥ WP-236); section becomes generated.
- `package.json` — **modified** — add the four `roadmap:counts*` scripts; promote `tsx` to root devDeps (already in the lockfile — no new install).
- `.github/workflows/roadmap-counts.yml` — **new** — weekly cron, PR-on-diff, visible-red (mirror architecture-inventory.yml).
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-240.
- `docs/ai/DECISIONS.md` — **modified** — D-24001, D-24002 (Active).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-240 checked off + date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-271 → Done.

~9 files (5 tooling/source + 4 governance).

## After Completing

- [ ] `node scripts/roadmap-counts.mjs` (dry run) shows Dashboard & Operator Analytics `13/13` + the Agent Triage cluster derived.
- [ ] `node scripts/roadmap-counts.mjs --check` exits 0 on the committed file (all WPs noded, table current).
- [ ] `node scripts/roadmap-counts.mjs --write` then `git diff --quiet -- docs/05-ROADMAP-MINDMAP.md` → clean (idempotent); content outside the markers byte-unchanged.
- [ ] Orphan gate demonstrated: with a node removed, the generator names the orphan + exits non-zero and does not rewrite.
- [ ] `(Select-String scripts/roadmap-counts.mjs -Pattern "@legendary-arena/","apps/","../packages/").Count` → 0.
- [ ] `Select-String docs/05-ROADMAP-MINDMAP.md -Pattern "ROADMAP-COUNTS:START","ROADMAP-COUNTS:END"` → both present.
- [ ] `(Select-String .github/workflows/roadmap-counts.yml -Pattern "\|\| true").Count` → 0.
- [ ] `node --import tsx --test scripts/roadmap-counts.test.ts` → 0 fail; `pnpm -r build` exit 0.
- [ ] Governance: STATUS.md, DECISIONS.md (D-24001/D-24002 Active), WORK_INDEX.md (WP-240 + date), EC_INDEX.md (EC-271 → Done).

## Common Failure Smells

- Rewriting the WHOLE `docs/05-ROADMAP-MINDMAP.md` instead of just the marker span → clobbers hand-maintained mindmap nodes. Replace only `START…END`; assert the rest is byte-identical.
- Bucketing an orphan into an "Unclustered" row or skipping it silently → violates D-24002. Exit non-zero + name it; the fix is to ADD the mindmap node.
- `|| true` / swallowing the exit code in the script or workflow → hides drift + orphans. Use `continue-on-error: true` on the cron step (visible-red) only.
- Counting a cross-ref node twice (e.g., `WP-048..051 (see Scoring & PAR)` in Phase 6 AND in Scoring & PAR) → skip `(see ` nodes; count members once in their real cluster.
- Forgetting to expand `WP-005A/B` / `WP-043..047` → undercount + spurious "orphan" (the combined id won't match a WORK_INDEX row). Expand to members before status lookup.
- Counting `FP-*` as WP-cluster members → Foundation Prompts are a separate `+N/N` addend, not WPs.
- A non-deterministic sort (`localeCompare`) or a clock read → cron churns a no-op diff every week. Stable keys, no wall-clock.
- An `[A-Z]`-only WP-ID regex → silently drops lowercase `WP-053a` / `WP-207a/b` → they read as orphans (false fail). Use `[A-Za-z]`; the count-parity test (parseWorkIndex count == raw checkbox-row count) catches any gap.
- Rendering a placeholder cluster as `0/0` instead of `0/N` → its nodes don't resolve to WP ids, but the row still counts node lines (`Next Horizons 0/4`, `Phase 10 0/8`). Count node lines + classify by icon.
- Missing/duplicated markers handled by silently appending or rewriting the whole file → must `ERROR: ROADMAP-COUNTS markers not found or invalid` + exit non-zero + NOT write.

## DECISIONS.md Entries (D-24001..D-24002)

Reserved in docs/ai/DECISIONS.md (Reserved (proposed) at draft → Active at close):
**D-24001** — The `docs/05-ROADMAP-MINDMAP.md` count table is GENERATED content derived from `WORK_INDEX.md` status × mindmap cluster membership by `scripts/roadmap-counts.mjs`, bounded by `ROADMAP-COUNTS:START/END` markers (sole writer), encoding the existing counting convention (combined-line/range expansion, cross-ref-counted-once, FP addend, placeholder `0/N`); regenerated weekly by a cron that PRs on diff, mirroring the WP-139 / D-14501 architecture-inventory pattern.
**D-24002** — The generator **fails loudly** on an orphan WP (a `WORK_INDEX.md` WP with no mindmap node): print the id + exit non-zero in every mode, and refuse to `--write` while orphans exist, so no work packet is silently uncounted and the mindmap stays the complete cluster-membership source.
