# WP-240 — Roadmap Count-Table Generator (Derive the Count Table from WORK_INDEX × Mindmap Membership; Cron Auto-PR; Orphan-Fail Gate)

**Status:** Draft
**Primary Layer:** Shared Tooling / INFRA (`scripts/**` + `.github/workflows/**`) — reads two governed docs, regenerates one marker-bounded section of `docs/05-ROADMAP-MINDMAP.md`. No engine/registry/server/app runtime, no package dependency, no migration.
**Dependencies:** None hard. Mirrors the shipped architecture-inventory cron pattern (`scripts/architecture-inventory.mjs` + `.github/workflows/architecture-inventory.yml`, WP-139 / D-14501). `docs/05-ROADMAP-MINDMAP.md` + `docs/ai/work-packets/WORK_INDEX.md` already exist. Baseline `origin/main` at draft: `d0623dd`.

---

## Goal

The `docs/05-ROADMAP-MINDMAP.md` count table drifts every Work Packet: per-cluster
`done/total` cells, the Total row, and the footer enumeration are hand-maintained
and routinely disagree with both the mindmap nodes and `WORK_INDEX.md` (the
authoritative ledger). After this WP a deterministic generator
(`scripts/roadmap-counts.mjs`) **derives the count table from WORK_INDEX status ×
mindmap cluster membership** and regenerates a marker-bounded section in place; a
weekly cron auto-PRs any change (same pattern as the architecture inventory). The
generator **fails loudly** when a `WORK_INDEX.md` WP has no mindmap node, so no
work packet can silently go uncounted. The count table stops being a
hand-maintained drift source and becomes generated content with a single writer.

## Assumes

- `docs/ai/work-packets/WORK_INDEX.md` lists every WP as a `- [x]` (done) or
  `- [ ]` (open) row whose first token is the WP id (`WP-NNN`, optionally a
  letter suffix `WP-NNNA` or a dotted sub-id `WP-NNN.N`); an open row that
  contains the word `Blocked` is a blocked WP.
- `docs/05-ROADMAP-MINDMAP.md` contains a ```` ```mermaid ```` `mindmap` block
  whose **cluster headings** are indented label lines and whose **WP/FP nodes**
  are `["WP-… "]` / `["FP-… "]` bracket-quote lines under a heading. Combined
  nodes use `WP-NNNA/B` (slash) or `WP-NNN..MMM` (range); cross-reference nodes
  contain the literal `(see `; placeholder clusters carry only `📦`/`📝` nodes;
  Foundation Prompts are `FP-*` nodes.
- The architecture-inventory cron (`.github/workflows/architecture-inventory.yml`)
  is the canonical "regenerate-a-doc-on-cron, PR-on-diff, visible-red-on-crash"
  template (D-14501): `cron: '0 6 * * 1'`, `permissions: contents+PRs write`,
  `continue-on-error: true` on the generate step, **no** `|| true` exit-swallowing.
- A calibration probe (2026-06-12, recorded in §Session Context) already proved
  the derivation is viable end-to-end against `main`.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

## Session Context

The count table is a self-declared lagging summary ("If counts disagree with the
mindmap, the mindmap wins"). WP-239's close + the two follow-up PRs (#289–#291)
surfaced that it had drifted across many WPs, not one: a SPEC pass (#291) fixed
the Agent Triage row + the false "WP-231..235 pending" footer but explicitly
deferred a durable fix. This WP is that durable fix.

**Calibration evidence (scaffold-first per `feedback_audit_tooling_scaffold_first`).**
A throwaway probe joined mindmap cluster membership × WORK_INDEX status against
`main`:
- Every mindmap node resolved to a WORK_INDEX row (combined-line, range, and
  cross-ref handling all worked); zero unresolved node ids.
- It caught drift the manual table still has: **Dashboard & Operator Analytics**
  derives **13/13** but the table says `12/12` (WP-238 uncounted there), and
  **WP-236** is in WORK_INDEX with **no mindmap node** (silently uncounted — the
  orphan the loud-fail gate exists to catch).
- Edge cases confirmed handle-able: placeholder clusters (Next Horizons / Phase
  10 → `0/N`), Foundation Prompts as a separate `+N/N` addend, one Phase-6
  cross-ref. The probe's WP-id regex missed 1–2 rows — a parser detail this WP
  must get right (broaden the id regex; cover it with tests).

Per Jeff (2026-06-12): land as a governed WP (consistency with the
architecture-inventory cron precedent), and the generator **fails loudly** on an
orphan WP (exit non-zero + name it) rather than bucketing or ignoring it.

## Scope (In)

**A) Generator — `scripts/roadmap-counts.mjs` (NEW)**
A deterministic, dependency-free Node ESM tool that:
- Exports **pure helpers** (`parseWorkIndex`, `parseMindmap`, `expandNodeId`,
  `tallyClusters`, `renderCountTable`, `findOrphans`) plus a thin CLI wrapper, so
  the parser is unit-testable in isolation.
- `parseWorkIndex(text)` → `Map<wpId, 'done'|'open'|'blocked'>` (`[x]`→done;
  `[ ]`→open, or blocked when the row text contains `Blocked`). The id regex
  matches `WP-NNN`, `WP-NNN<letter>`, and `WP-NNN.N`.
- `parseMindmap(text)` → ordered `[{ cluster, nodeId, icon, isCrossRef }]` from
  the ```` ```mermaid ```` block: a node is a line trimming to `["`; a cluster
  heading is a non-node, non-keyword indented label; `root((…))` / `mindmap` /
  the root descriptor are ignored.
- `expandNodeId(rawId)` → member ids: `WP-NNNA/B`→`[WP-NNNA, WP-NNNB]`,
  `WP-NNN..MMM`→the zero-padded numeric range, `FP-*`→itself (Foundation Prompt),
  anything else→itself.
- `tallyClusters(...)` → per-cluster `{ done, open, blocked, total }` from
  membership × status, **skipping** cross-ref nodes (`(see ` — counted in their
  real cluster) and FP nodes (counted in a separate Foundation addend); a
  placeholder cluster (all nodes `📦`/`📝`) renders as `0/N` with its
  queued/placeholder note and is excluded from the WP done/total.
- `findOrphans(...)` → WORK_INDEX WPs present in no mindmap node.
- CLI: default = print the regenerated count-table section to stdout (dry run);
  `--write` = replace the marker-bounded section in
  `docs/05-ROADMAP-MINDMAP.md` in place; `--check` = exit non-zero if the file's
  current section differs from the regenerated one (CI gate). **Orphan gate
  (D-24002):** in every mode, if `findOrphans` is non-empty, print each orphan
  id + a one-line "add a mindmap node for it" instruction and **exit non-zero**;
  `--write` does not rewrite the file while orphans exist. No `|| true` /
  exit-code-swallowing anywhere.
- Exit codes: `0` clean; `1` orphan(s) present; `2` out-of-date (under `--check`);
  crash exits non-zero (never swallowed).

**B) Generator tests — `scripts/roadmap-counts.test.ts` (NEW)**
`node --test` (run via the `roadmap:counts:test` script, §D) over the pure
helpers with inline fixtures: `[x]/[ ]/Blocked` status parsing; cluster/node
classification; combined-line + range + FP expansion; cross-ref skip; placeholder
cluster → `0/N`; orphan detection (a WORK_INDEX WP with no node is reported);
`renderCountTable` output is byte-stable for identical input (determinism). No
network, no boardgame.io.

**C) Markers + missing nodes — `docs/05-ROADMAP-MINDMAP.md` (MODIFIED)**
- Wrap the existing count table + its footer-notes in
  `<!-- ROADMAP-COUNTS:START (generated by scripts/roadmap-counts.mjs — do not hand-edit) -->`
  … `<!-- ROADMAP-COUNTS:END -->` markers (the generator's regeneration boundary).
- Add a mindmap node for every currently-orphaned WP so the orphan gate passes —
  at minimum **WP-236** (Phase 2 — Core Turn Engine cluster); the executor runs
  the generator first and adds a node for each orphan it names.
- The count-table section between the markers becomes generated content (its
  hand-edited values are replaced by the generator's first `--write`).

**D) Script wiring — `package.json` (MODIFIED, root)**
Add `roadmap:counts` (dry-run stdout), `roadmap:counts:write` (`--write`),
`roadmap:counts:check` (`--check`), and `roadmap:counts:test`
(`node --import tsx --test scripts/roadmap-counts.test.ts`). Promote `tsx` to the
**root** `devDependencies` so the root-level `.test.ts` resolves: `tsx` is NOT
currently a root dep (it lives in all 10 workspace packages' devDeps), so
`node --import tsx` fails from the repo root today. `tsx` is already in
`pnpm-lock.yaml`, so this is a hoist, **not a new install** — `pnpm install`
fetches nothing new. (The generator itself is plain `.mjs` and needs no `tsx`;
only the `.test.ts` does, per the `.test.ts`-only convention.)

**E) Cron — `.github/workflows/roadmap-counts.yml` (NEW)**
Mirror `architecture-inventory.yml`: `cron: '0 6 * * 1'` + `workflow_dispatch`;
`permissions: contents+pull-requests write`; a generate step running
`roadmap:counts:write` with `continue-on-error: true` (visible-red on crash, no
exit-swallowing); diff `docs/05-ROADMAP-MINDMAP.md` → open a PR
(`bot/roadmap-counts-refresh`, `INFRA: regenerate ROADMAP count table (cron)`) on
diff, no-op on no-diff. Human review is the gate (no direct-to-main, no
auto-merge).

## Out of Scope

- **Regenerating the mindmap node status icons** (the `✅`/`📝` on each node).
  v1 derives only the count-table section from WORK_INDEX; reconciling per-node
  icons against WORK_INDEX is a larger follow-up (§Future Work).
- **A per-PR `--check` CI gate on every push.** v1 ships the weekly cron auto-PR
  (the asked-for cadence) + the in-generator orphan-fail. Wiring `--check` into
  the PR pipeline (which would redden every WP-completion PR until its node +
  table land) is deferred (§Future Work).
- **Changing the counting convention itself** (placeholder exclusion, FP addend,
  combined-line membership, cross-ref-counted-once). The generator *encodes* the
  existing convention; it does not redefine it.
- **Any engine/registry/server/app/runtime change**, package dependency, or
  database migration.
- **Editing `WORK_INDEX.md` content** beyond nothing — WORK_INDEX is the read-only
  source of truth here; the generator never writes it.

## Files Expected to Change

- `scripts/roadmap-counts.mjs` — **new** — deterministic generator (pure helpers + CLI; orphan-fail gate; `--write`/`--check`).
- `scripts/roadmap-counts.test.ts` — **new** — `node --test` over the pure helpers + edge cases.
- `docs/05-ROADMAP-MINDMAP.md` — **modified** — add `ROADMAP-COUNTS:START/END` markers; add a node for each orphaned WP (≥ WP-236); the marker-bounded section becomes generated.
- `package.json` — **modified** — add the four `roadmap:counts*` scripts; promote `tsx` to root devDeps (already in the lockfile — no new install).
- `.github/workflows/roadmap-counts.yml` — **new** — weekly cron, PR-on-diff, visible-red, mirroring the architecture-inventory workflow.
- `docs/ai/STATUS.md` — **modified** — Done entry naming WP-240.
- `docs/ai/DECISIONS.md` — **modified** — D-24001, D-24002 (Active at close).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-240 checked off with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-271 status → Done.

~9 files (5 tooling/source + 4 governance), within the lint §5 ~8-file guideline (the ROADMAP node-adds + STATUS/DECISIONS/INDEX are the governance set). Single cohesive tooling surface; do not split.

## Locked Contract Values

- **Source of truth:** `WORK_INDEX.md` for WP status (`[x]`=done / `[ ]`=open / `Blocked`=blocked); the mindmap nodes for cluster membership. The generator never writes `WORK_INDEX.md`.
- **Regeneration boundary:** the section between `<!-- ROADMAP-COUNTS:START … -->` and `<!-- ROADMAP-COUNTS:END -->` in `docs/05-ROADMAP-MINDMAP.md`; the generator is its sole writer; everything outside the markers (the mindmap nodes, prose) is hand-maintained and untouched.
- **Counting convention (encoded, not redefined):** combined nodes expand to members (`WP-005A/B`, `WP-043..047`); cross-ref nodes (`(see `) are skipped (counted once in their real cluster); Foundation Prompts (`FP-*`) are a separate `+N/N` addend, not a WP cluster; placeholder clusters (all `📦`/`📝` nodes) render `0/N` and are excluded from the WP done/total.
- **Orphan gate (D-24002):** a `WORK_INDEX.md` WP with no mindmap node → print the id(s) + exit non-zero, in every mode; `--write` refuses to rewrite while orphans exist. Fail loudly — never bucket into a catch-all, never silently ignore.
- **No exit-swallowing:** no `|| true`, no `--check` masking; the cron step is `continue-on-error: true` (visible-red) per the EC-145 visible-failure invariant.
- **Cron policy (D-14501 reuse):** `cron: '0 6 * * 1'`; PR-on-diff to `bot/roadmap-counts-refresh`; no direct-to-main, no auto-merge; review is the gate.
- **Determinism:** identical (WORK_INDEX, ROADMAP) input → byte-identical regenerated section across runs/platforms (no clock, no `Math.random`, no locale-dependent sort).
- **No new package:** nothing is added to `pnpm-lock.yaml`. The generator uses Node built-ins only; `tsx` (already a devDep in all 10 workspace packages + in the lockfile) is promoted to **root** `devDependencies` so the root `.test.ts` runs — a hoist, not a new install.

## Acceptance Criteria

1. `scripts/roadmap-counts.mjs` exports the pure helpers (`parseWorkIndex`, `parseMindmap`, `expandNodeId`, `tallyClusters`, `renderCountTable`, `findOrphans`) + a CLI; imports nothing outside Node built-ins.
2. Running `roadmap:counts` (dry run) against `main` reproduces the count table with corrected cells — at minimum Dashboard & Operator Analytics `13/13` and the Agent Triage cluster derived (not hand-set).
3. The orphan gate works: with an orphaned WP present, the generator prints the id + exits non-zero and (under `--write`) does not rewrite the file; with all WPs noded, it exits 0.
4. `docs/05-ROADMAP-MINDMAP.md` carries the `ROADMAP-COUNTS:START/END` markers and a mindmap node for every previously-orphaned WP (≥ WP-236); `roadmap:counts:check` exits 0 on the committed file.
5. `--write` regenerates only the marker-bounded section; a second consecutive `--write` produces no diff (idempotent); content outside the markers is byte-unchanged.
6. `scripts/roadmap-counts.test.ts` covers status parsing, node/cluster classification, combined-line + range + FP expansion, cross-ref skip, placeholder `0/N`, orphan detection, and render determinism — and passes via `roadmap:counts:test`.
7. `.github/workflows/roadmap-counts.yml` mirrors the architecture-inventory cron (`'0 6 * * 1'`, `workflow_dispatch`, contents+PR write, `continue-on-error` generate step, PR-on-diff to `bot/roadmap-counts-refresh`); contains no `|| true` / exit-swallowing.
8. `package.json` adds the four `roadmap:counts*` scripts + promotes `tsx` to root `devDependencies` (already in `pnpm-lock.yaml`; `pnpm install` fetches nothing new); no other dependency change.
9. `pnpm -r build` exits 0 (no package build is affected; the script is standalone) and `roadmap:counts:test` exits 0.

## Verification Steps

```pwsh
# 1. Generator is dependency-free (Node built-ins only; no app/engine import)
(Select-String -Path "scripts/roadmap-counts.mjs" -Pattern "@legendary-arena/","apps/","../packages/").Count
# Expected: 0

# 2. Dry run reproduces corrected cells
node scripts/roadmap-counts.mjs | Select-String "Dashboard & Operator Analytics","Agent Triage Pipeline"
# Expected: Dashboard … 13/13 ; Agent Triage … derived

# 3. Orphan gate fails loudly (temporarily remove a node OR assert WP-236 noded)
node scripts/roadmap-counts.mjs --check ; "exit=$LASTEXITCODE"
# Expected after C: exit 0 (all WPs noded, table current)

# 4. Idempotent write (no diff on second run)
node scripts/roadmap-counts.mjs --write ; git diff --quiet -- docs/05-ROADMAP-MINDMAP.md ; "clean=$LASTEXITCODE"
# Expected: clean=0 (second write is a no-op)

# 5. Markers present + sole-writer note
Select-String -Path "docs/05-ROADMAP-MINDMAP.md" -Pattern "ROADMAP-COUNTS:START","ROADMAP-COUNTS:END"
# Expected: both markers present

# 6. No exit-swallowing in the workflow
(Select-String -Path ".github/workflows/roadmap-counts.yml" -Pattern "\|\| true").Count
# Expected: 0

# 7. Tests + build
node --import tsx --test scripts/roadmap-counts.test.ts   # Expected: 0 fail
pnpm -r build                                             # Expected: exit 0
```

## Definition of Done

- [ ] All 9 Acceptance Criteria pass
- [ ] All Verification Steps produce the expected output
- [ ] `roadmap:counts:test` exits 0 (net-new parser tests; edge cases covered)
- [ ] `roadmap:counts:check` exits 0 on the committed `docs/05-ROADMAP-MINDMAP.md`
- [ ] `pnpm -r build` exits 0
- [ ] The orphan gate fails loudly on an uncounted WP (demonstrated) and WP-236 (+ any other orphan) has a mindmap node
- [ ] The generator writes ONLY the marker-bounded section; everything else in `docs/05-ROADMAP-MINDMAP.md` is byte-unchanged
- [ ] The cron workflow mirrors architecture-inventory (schedule, PR-on-diff, visible-red, no exit-swallowing)
- [ ] Governance updated: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (D-24001, D-24002 Active), `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`
- [ ] No files outside `## Files Expected to Change` were modified

## Vision Alignment

**N/A.** Internal engineering-governance tooling: it regenerates a navigation
doc's summary table from the WP ledger. No §17.1 trigger surface — no
scoring/PAR/leaderboard, no replay/RNG/determinism guarantee for gameplay, no
card data, no monetization, no public or player-facing surface (the ROADMAP +
ewiki are operator-internal). Per the WP-139 architecture-inventory precedent
(also internal generated-doc tooling, marked N/A), no clause list is required.

## Funding Surface Gate

**N/A.** No global-nav funding affordance, no Registry-viewer funding surface, no
account funding attribution, no user-visible funding copy (WP-097 G-1..G-7 all
untouched). Internal tooling only.

## API Catalog Update

**N/A.** No HTTP endpoint and no `apps/server/src/**` library function is added,
modified, removed, or status-changed. Per §21.4, this is the N/A path with
justification.

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-12:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists 5 exclusions (node-icon regen, per-PR check gate, convention redefinition, runtime/dep/migration, WORK_INDEX edits) |
| 2 | PASS | Engine-wide + packet constraints via the standard preamble; ESM/Node v22/`node:`/human-style per 00.6 apply |
| 3 | PASS | `## Assumes` lists the WORK_INDEX + mindmap grammar + the cron template + the calibration; BLOCKED clause present |
| 4 | PASS | Context cites the #289–#291 drift, the calibration evidence (3 drifts caught), and Jeff's WP + loud-fail decisions |
| 5 | PASS | ~9 files (5 tooling/source + 4 governance) — within the ~8 guideline; every file has a disposition; not split |
| 6 | PASS | Field/format names (`[x]`/`[ ]`/`Blocked`, marker strings, `bot/roadmap-counts-refresh`, cron `'0 6 * * 1'`) match the cited sources exactly |
| 7 | PASS | No new package in `pnpm-lock.yaml`; generator uses Node built-ins; `tsx` (already in all 10 workspace packages + the lockfile) promoted to root devDeps for the `.test.ts` — a hoist, not an install |
| 8 | PASS | Tooling-only; reads two docs, writes one marker-bounded section; no DB/HTTP/engine |
| 9 | PASS | PowerShell `Select-String` greps + `$LASTEXITCODE`; no Unix assumptions |
| 10 | PASS | No new env var; no secret in output; cron uses repo `permissions` only |
| 11 | N/A | No auth model touched |
| 12 | PASS | `node --test` over pure helpers; no network/boardgame.io; determinism test for `renderCountTable` |
| 13 | PASS | Exact commands + expected output / exit codes |
| 14 | PASS | 9 binary, observable acceptance criteria aligned to deliverables |
| 15 | PASS | DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX + scope-boundary check |
| 16 | PASS | Human-style: pure helpers + thin CLI, explicit parsing, JSDoc, descriptive names, `// why:` on the orphan-gate + cron-policy choices |
| 17 | N/A | No scoring/replay/RNG/card-data/monetization/public surface (see Vision Alignment) |
| 18 | PASS | Greps target presence/absence patterns (markers, `\|\| true`), not forbidden-token enumerations |
| 19 | N/A | The generated artifact is a count summary; the WP itself is not a repo-state-summarizing prompt |
| 20 | PASS | Authority chain respected; the generator encodes (does not redefine) the counting convention |
| 21 | N/A | No endpoint/library-function surface touched (see API Catalog Update) |

Reserved decisions (Active at close): **D-24001** — the `docs/05-ROADMAP-MINDMAP.md`
count table is GENERATED content derived from `WORK_INDEX.md` status × mindmap
cluster membership by `scripts/roadmap-counts.mjs`, bounded by
`ROADMAP-COUNTS:START/END` markers (sole writer), encoding the existing counting
convention (combined-line/range expansion, cross-ref-counted-once, FP addend,
placeholder `0/N`); regenerated weekly by a cron that PRs on diff, mirroring the
WP-139/D-14501 architecture-inventory pattern. **D-24002** — the generator
**fails loudly** on an orphan WP (a `WORK_INDEX.md` WP with no mindmap node):
print the id + exit non-zero in every mode, and refuse to `--write` while orphans
exist, so no work packet can be silently uncounted and the mindmap stays the
complete cluster-membership source.

## Future Work Packets

### WP — Mindmap node-status reconciliation
**Concept:** extend the generator to also rewrite each mindmap node's `✅`/`📝`/`⏸`
status icon from WORK_INDEX, closing the other half of the node-vs-ledger drift.
**Depends on:** WP-240.

### WP — Per-PR roadmap-counts `--check` gate
**Concept:** wire `roadmap:counts:check` into the PR CI so a WP that adds a row
without a node (or lets the table drift) fails at PR time, not just on the weekly
cron. Needs a policy for the expected "counts change on every WP-completion PR"
noise.
**Depends on:** WP-240.
