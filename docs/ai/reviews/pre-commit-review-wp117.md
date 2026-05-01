# Pre-Commit Review — WP-117 (Client Routing Strategy)

**Work Packet:** WP-117 — Client Routing Strategy (Architecture)
**Template:** `docs/ai/prompts/PRE-COMMIT-REVIEW.template.md`
**Commits reviewed:** `b6a6d5b` (close-out, under review). Prep commit
`23872a3` is in PR #12 with WP-118 and is out of scope for this review.
**Branch:** `wp-117-client-routing-strategy` (descends from
`wp-118-http-api-surface-catalog` HEAD; not yet pushed)
**Review date:** 2026-04-30
**Reviewer mode:** Non-implementing gatekeeper.

---

## Executive Verdict (Binary)

**Safe to commit as-is.**

The close-out commit lands exactly the 5-file allowlist (no `apps/`,
`packages/`, or `data/` paths touched). The four DECISIONS entries
(D-11701..D-11704) match the resolved options verbatim from WP-117
`## Decision Points` and are inserted in numerical order between
D-11404 and D-11801. Architecture doc placement (after `## HTTP API
Surface`, before `## Internationalization`) is correct, the
`02-ARCHITECTURE.md` Tech Stack mirror is consistent, and the WP-117
locked posture preserves WP-114 / WP-061 / WP-102 deep-linking surfaces
verbatim. WP-117 is a pure documentation / governance change; no
runtime, persistence, or contract surface affected — safe to commit.

---

## Review Axis Assessment

### 1. Scope Discipline — **Pass**

`git show b6a6d5b --name-only` returns exactly the 5 paths declared in
WP-117 `## Files Expected to Change`:

1. `docs/ai/ARCHITECTURE.md` — `## Client Routing` section added
2. `docs/02-ARCHITECTURE.md` — mirror section + Tech Stack row
3. `docs/ai/DECISIONS.md` — D-11701..D-11704 inserted
4. `docs/ai/STATUS.md` — WP-117 capability block prepended
5. `docs/ai/work-packets/WORK_INDEX.md` — WP-117 row flipped `[ ]` → `[x]`

No `package.json` edit (vue-router not adopted under D-11701/D-11702 = B).
No `.claude/rules/architecture.md` change (no allowed-imports row added).
No EC stub (D-10001 + 2026-04-26 Amendment apply cleanly under the
no-`apps/`-staged path). No code touched (`git diff --name-only HEAD~1
HEAD -- 'apps/**' 'packages/**' 'data/**'` empty).

The inherited dirty-tree item (`docs/ai/execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md`,
intended for WP-115's eventual session) remains untracked and is
correctly excluded from the WP-117 close-out commit per the WP body's
§Session protocol unrelated-untracked-files rule.

### 2. Contract & Type Correctness — **Pass**

DECISIONS entries D-11701..D-11704 match the resolved options recorded
in WP-117 `## Decision Points`:

- **D-11701** = Option B (no router; preserve `selectRoute()`) ✓ — title
  and rationale align; the de-facto Option C note is preserved
  (existing helper is migration starting point, not legacy
  scaffolding); rejected Options A and C enumerated.
- **D-11702** = Option B (no router; preserve `activeView` + WP-114
  query params) ✓ — public-facing SEO concern named and explicitly
  deferred absent a concrete consumer; rejected Options A and C
  enumerated.
- **D-11703** = N/A (history mode irrelevant when no router adopted) ✓
  — recorded as a full standalone DECISIONS entry (rather than only as
  a preamble note); future supersession path documented.
- **D-11704** = Option B (defer replay URL format) ✓ — rationale cites
  the §17.1 #2 trigger that locking-now would create; future
  candidates named (Replay Viewer WP / WP-115 client-side extension);
  WP-115's `:replayHash` spelling cited as the natural starting point
  per `00.2-data-requirements.md`.

The four entries are inserted between D-11404 (line 11905) and D-11801
(line 11978) — numerically correct. `Reinforces:` and `Status:` lines
are present and consistent with surrounding DECISIONS entries.

### 3. Boundary Integrity — **Pass**

Pure documentation / governance change. No engine code, no PostgreSQL,
no boardgame.io imports, no `G` / `ctx` access, no runtime helpers,
no `vue-router` dependency added. The Lifecycle Prohibition declared
in the WP-117 session prompt §4 is honored. The WP-114
`setupUrlParams.ts` + `useSetupFromUrl.ts` + `LoadoutPreview.vue`
surface that D-11702 = B preserves is referenced by file path only,
not modified.

### 4. Test Integrity — **Pass (N/A)**

No tests added or removed. Implementing session reports `pnpm -r test`
exits 0 with baseline counts unchanged across all 8 workspaces
(registry 31, vue-sfc-loader 11, game-engine 604, replay-producer 4,
registry-viewer 22, preplan 52, server 47 + 24 skipped, arena-client
182). Treated as true per the template's Assumed Verification clause;
no contradiction in the diff to warrant re-running.

### 5. Runtime Boundary Check — **Pass (allowance not exercised)**

01.5 (Runtime Wiring Allowance) was **NOT INVOKED**. None of its four
trigger criteria are present:

- Zero new `LegendaryGameState` fields.
- Zero `buildInitialGameState` shape changes.
- Zero new `LegendaryGame.moves` entries.
- Zero new phase hooks.

`git diff --name-only HEAD~1 HEAD -- 'packages/game-engine/'
'apps/server/' 'apps/arena-client/' 'packages/preplan/'` is empty.
Stating explicitly: **the runtime wiring allowance was not used**.

### 6. Governance & EC-Mode Alignment — **Pass**

- **Commit prefix.** `SPEC:` is correct under D-10001 + 2026-04-26
  Amendment; no `apps/`/`packages/`/`data/` files staged → Rule 5 not
  triggered → no `EC-###:` prefix and no EC stub required. Title fits
  hook constraints.
- **No EC.** Correctly declared in WP-117 `## Execution Checklist`
  per D-10001 risk profile (binary-verifiable, no engine mutation, no
  persistence, no ordering surface).
- **DECISIONS ordering.** D-11701..D-11704 inserted between D-11404
  and D-11801 (verified by line numbers). No re-numbering of existing
  entries.
- **Architecture doc placement.** `## Client Routing` placed between
  `## HTTP API Surface` (added by WP-118) and `## Internationalization`
  (added by WP-119) — sequentially correct. Mirror section in
  `docs/02-ARCHITECTURE.md` placed between the same anchors. Tech
  Stack at a Glance row added in the canonical row order (after the
  Vue SFC test transform row).
- **WORK_INDEX flip.** Single-line edit: `[ ] WP-117 …` →
  `[x] WP-117 … ✅ Reviewed (…) — **Completed 2026-04-30** …`. Uses
  the WP-118 / WP-119 close-out precedent (no SHA reference).
- **STATUS.md.** WP-117 capability block prepended above the WP-118
  block; matches the existing chronological-prepend convention.
- **§17 / §20.** §17 explicitly N/A under D-11704 = B (no replay format
  locked; future replay-viewer WP owns the §17 evaluation when it
  lands). §20 N/A with explicit justification (pure governance; no
  UI surface, no user-visible copy, no funding channel) — passes
  N/A discipline.
- **`<!-- why: -->` HTML comment** at the new ARCHITECTURE.md section
  (line ~1639) cites WP-117 §6.1 file 1 and explains the placement
  choice — matches the WP-118 / WP-119 precedent for cross-link
  section placement justification.

---

## Optional Pre-Commit Nits (Non-Blocking)

- **D-11703 placement choice.** The WP body line 149 says the N/A
  status is "recorded in the DECISIONS.md preamble"; the implementing
  session recorded it as a full standalone DECISIONS entry instead.
  This is the better choice — a full entry is more grep-discoverable
  than a preamble note (`grep -n 'D-11703' DECISIONS.md` returns a
  single explicit hit), and it parallels how D-NNN N/A entries are
  recorded elsewhere in the project (e.g., decisions deferred to
  future WPs typically get full entries with `**Status:** N/A` rather
  than preamble notes). The implementing session's commit message
  flags this as a deliberate choice ("standalone N/A entry so
  grep-by-ID queries find an explicit hit"). Not a discrepancy worth
  blocking on; flag as a deliberate interpretation choice that
  improves on the WP body's literal suggestion.

- **`apps/registry-viewer/CLAUDE.md` reference is a forward claim.**
  D-11702 cites `apps/registry-viewer/CLAUDE.md`'s "No router —
  single-page with tab switching" wording as continuing-to-be-accurate.
  This file isn't in the diff (correctly — it's an `apps/` path that
  WP-117 doesn't touch). The reference is honest as long as that
  CLAUDE.md still says what's quoted; if a future WP edits the
  registry-viewer CLAUDE.md to remove that wording, this DECISIONS
  entry should be touched at the same time (replace-whole-row spirit,
  even though no formal D-NNN-style obligation applies to non-API
  governance text). Worth tracking, not blocking.

If neither is addressed, no harm done.

---

## Explicit Deferrals (Correctly NOT in This WP)

- **No `vue-router` adoption.** Both apps preserve existing per-app
  view-state mechanisms; no dependency added; no lockfile change; no
  rules update; no `<router-view>` wiring.
- **No history mode lock.** D-11703 = N/A; future WP that adopts a
  router under either D-11701 or D-11702 owns the history-mode
  decision under its own scope.
- **No replay URL format lock.** D-11704 deferred to whichever WP
  first exposes a replay UI surface. The §17 evaluation goes with
  that future WP.
- **No engine, persistence, or transport touch.** Pure governance
  posture lock.
- **No EC file or EC_INDEX row.** Correctly omitted under D-10001
  no-EC governance precedent.
- **01.6 post-mortem not authored.** Optional under WP-066 / WP-094
  / WP-118 / WP-119 governance-WP precedent; appropriately skipped.
- **No deletion of WP-114's `setupUrlParams.ts` surface.** The
  WP-114 query-param surface is preserved verbatim under D-11702 = B;
  the WP body's Non-Negotiable Constraint forbids retroactive rewrites.

---

## Commit Hygiene Recommendations

- **Commit message.** `SPEC: close WP-117 governance -- client routing
  posture locked (no router)` is appropriate (WP-118 / WP-119 close-out
  precedent). Body enumerates the four DECISIONS, the architecture
  doc additions, and the verification anchors. No changes recommended.
- **Branch shape.** `wp-117-client-routing-strategy` descends linearly
  from `wp-118-http-api-surface-catalog` HEAD (`b6a6d5b` → `23872a3` →
  ... → `bfdefe1`). When PR #12 merges into main, the WP-117 branch
  rebase will drop the duplicated commits and leave only `b6a6d5b`
  (plus this review's eventual commit) as the WP-117 PR's actual
  novelty. No rebase action needed before then.

---

## Conclusion

WP-117 meets its contract. The 5-file allowlist is honored exactly,
the four DECISIONS entries match the resolved options verbatim, no
runtime boundary is crossed, the architecture doc additions land in
the correct sequential position alongside WP-118 (`## HTTP API
Surface`) and WP-119 (`## Internationalization`), and no out-of-scope
artifacts are staged. The two non-blocking nits above are interpretation
choices, not content errors.

**Affirm readiness to commit.** Push authorization is the user's to
give.

Per `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md`, this
review itself should be staged and committed as a follow-up `SPEC:`
artifact (no EC required — `docs/ai/reviews/**` is a docs-only path).
Suggested commit title: `SPEC: pre-commit review WP-117 -- safe to
commit as-is`.
