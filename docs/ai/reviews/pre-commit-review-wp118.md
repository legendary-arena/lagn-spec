# Pre-Commit Review — WP-118 (HTTP API Surface Catalog)

**Work Packet:** WP-118 — HTTP API Surface Catalog (Architecture)
**Template:** `docs/ai/prompts/PRE-COMMIT-REVIEW.template.md`
**Commits reviewed:** `4ac8216` (close-out, under review). Prep commit `06149b0`
(WP body amendments) is on the same branch but is its own committed governance
artifact and is therefore out of WP-118 close-out review scope.
**Branch:** `wp-118-http-api-surface-catalog` (not pushed)
**Review date:** 2026-04-30
**Reviewer mode:** Non-implementing gatekeeper (no code or doc changes
proposed; review is textual only).

---

## Executive Verdict (Binary)

**Safe to commit as-is.**

The close-out commit lands exactly the locked 8-file allowlist; no
`apps/`/`packages/`/`data/` paths are touched. The four DECISIONS entries
(D-11801..D-11804) are inserted in numerical order between D-11404 and
D-11901 and match the resolved options in the WP `## Decision Points`
verbatim, including the D-11802 `requestId: conditional-on-server-trace-injection`
semantics and the D-11804 replace-whole-row merge constraint. The new
catalog, the new lint §21, the new `.claude/rules/work-packets.md` clause,
and the cross-link sections in both architecture docs cohere with one
another and with `docs/ai/REFERENCE/00.2-data-requirements.md` canonical
field names. WP-118 is a pure documentation / governance change with no
runtime, persistence, or contract surface affected — it is safe to commit.

---

## Review Axis Assessment

### 1. Scope Discipline — **Pass**

`git show 4ac8216 --name-only` returns exactly the 8 paths declared in
WP-118 §Files Expected to Change and the session prompt §6.1 allowlist:

1. `docs/ai/REFERENCE/api-endpoints.md` (new)
2. `docs/ai/ARCHITECTURE.md` (modified — `## HTTP API Surface` section)
3. `docs/02-ARCHITECTURE.md` (modified — mirror section)
4. `docs/ai/DECISIONS.md` (modified — D-11801..D-11804 inserted)
5. `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (modified — new §21)
6. `.claude/rules/work-packets.md` (modified — new `## API Catalog Update Obligation` section)
7. `docs/ai/STATUS.md` (modified — WP-118 capability block prepended)
8. `docs/ai/work-packets/WORK_INDEX.md` (modified — WP-118 row flipped to `[x]`)

No leakage into adjacent WPs. WP-117 prep work and the WP-115 stub commit
sit on the same branch as separate, earlier commits (`23872a3`, `bfdefe1`)
and are correctly out of this commit's diff. The inherited dirty-tree
items called out in the session prompt §5.2 (`package.json`,
`scripts/architecture-inventory.mjs`, the `EC-119-public-leaderboard-http-endpoints.checklist.md`
untracked file, the two arch-inventory audit outputs) are **not** in the
WP-118 commit — `git status` confirms the EC checklist file remains
untracked, and the others are not present in the commit's file list.

### 2. Contract & Type Correctness — **Pass**

DECISIONS entries D-11801..D-11804 match the resolved options recorded in
WP-118 §Decision Points one-for-one:

- **D-11801** = Option A (Markdown table) ✓ — title and rationale align;
  rejected Options B and C enumerated with rationale.
- **D-11802** = Option C (split: boardgame.io for game endpoints +
  project-specific `{ code, message, requestId? }` for project endpoints) ✓
  — `requestId` semantics recorded as `conditional-on-server-trace-injection`
  exactly as the WP body specifies (present once a future request-handler
  WP lands request-ID middleware; absent until then; never both
  present-on-some and absent-on-others within the same release).
- **D-11803** = Option B (no versioning; catalog is the contract) ✓ —
  breaking-change protocol (Drift annotation + DECISIONS entry) recorded.
- **D-11804** = Option C (lint §21 + work-packets.md rule) ✓ with the
  replace-whole-row merge-semantics lock from copilot-check FIX #6
  encoded in *both* gates (`00.3 §21.2` "Replace-whole-row merge
  semantics" bullet + the new `.claude/rules/work-packets.md` section's
  "The affected row is replaced **entirely** … partial-update is FAIL"
  clause).

Catalog rows use the four-value `Status` closed set (`Wired |
Shipped-but-unwired | Library-only | Pending`) and HTTP-routed rows use
the three-value `Auth` closed set (`guest | handle-required |
authenticated-session-required`) per D-9905. Canonical field names
(`accountId`, `handle`, `matchId`, `replayHash`) appear with the spellings
locked in `00.2-data-requirements.md`; no abbreviations or alternative
casings observed.

The four DECISIONS entries are inserted between D-11404 (line 11905) and
D-11901 (line 11995) — numerically correct.

### 3. Boundary Integrity — **Pass**

Pure documentation / governance change. `git diff --name-only HEAD~1
HEAD -- 'apps/**' 'packages/**' 'data/**'` returns empty. No engine
code, no PostgreSQL queries, no boardgame.io imports, no `G` / `ctx`
access, no runtime helpers introduced. The catalog file is descriptive
prose + Markdown tables; it is not imported by any runtime code and
the commit lands no module that would do so. The Lifecycle Prohibition
declared in the session prompt §4 is honored — no engine state, no
new field on `LegendaryGameState`, no new move, no new phase hook, no
projection change.

### 4. Test Integrity — **Pass (N/A)**

No tests added or removed. Implementing session reports `pnpm -r test`
exits 0 with baseline counts unchanged (977 tests / 175 suites / 0 fail
across 8 workspaces). Per the template's "Assumed Verification" clause,
this is treated as true; nothing in the diff surfaces a contradicting
risk that would warrant re-running the suite.

### 5. Runtime Boundary Check — **Pass (allowance not exercised)**

01.5 (Runtime Wiring Allowance) was **NOT INVOKED**. None of its four
trigger criteria are present:

- Zero new `LegendaryGameState` fields.
- Zero `buildInitialGameState` shape changes.
- Zero new entries in `LegendaryGame.moves`.
- Zero new phase hooks.

`git diff --name-only HEAD~1 HEAD -- 'packages/game-engine/' 'apps/server/'
'apps/arena-client/' 'packages/preplan/'` is empty. No allowlist
exceptions exercised. Stating explicitly: **the runtime wiring allowance
was not used**.

### 6. Governance & EC-Mode Alignment — **Pass**

- **Commit prefix.** `SPEC:` is the correct prefix per `.githooks/commit-msg`
  Rule 5 + D-10001 + 2026-04-26 Amendment: no `apps/`/`packages/`/`data/`
  files staged → Rule 5 not triggered → no `EC-###:` prefix required and
  no EC stub required. Title fits hook constraints.
- **No EC.** Correctly declared in WP-118 `## Execution Checklist` per
  D-10001 risk profile (binary-verifiable, no engine mutation, no
  persistence, no ordering surface, no irreversible side effects).
- **DECISIONS ordering.** D-11801..D-11804 inserted in numerical order
  between D-11404 and D-11901 (verified by line numbers above). No
  re-numbering of existing entries.
- **Lint §21 placement.** New section placed at line 686 immediately
  after §20 (line 576) — sequentially correct.
- **`.claude/rules/work-packets.md` rule.** New `## API Catalog Update
  Obligation (per D-11804)` section added between the existing
  `## Conventions Are Locked` section and `## Adding or Extending Work
  Packets`; encodes both closed sets, the canonical-field-name link to
  `00.2`, the replace-whole-row constraint, and the cross-link to
  `00.3 §21`. Belt-and-suspenders pattern matches the existing
  `.claude/CLAUDE.md` / `00.3 §17.1` / `.claude/rules/work-packets.md`
  duplicated-clause precedent that D-11804's rationale cites.
- **WORK_INDEX flip.** Single-line edit: `[ ] WP-118 …` →
  `[x] WP-118 … ✅ Reviewed (…) — **Completed 2026-04-30** …`. Uses the
  WP-119 close-out precedent (no SHA reference) — see Known Quirks below.
- **STATUS.md.** WP-118 capability block prepended above the WP-119 block;
  layout matches the existing chronological-prepend convention.
- **§17 / §20.** §17 cited per `00.3 §17.1` trigger #3 (player identity);
  triggers #1 (leaderboards) and #2 (replays) cited and correctly
  identified as not-triggered (forward-link only / descriptive only).
  §20 marked N/A with explicit justification (pure documentation;
  no UI surface, no user-visible copy, no funding channel) — passes the
  `§20.4` N/A discipline.

---

## Optional Pre-Commit Nits (Non-Blocking)

- **`Library-only` row Auth column is non-closed-set.** The six
  `Library-only` rows in `api-endpoints.md` use the literal string
  `(n/a — caller-injected DatabaseClient)` in the `Auth` column rather
  than one of the three values from the new closed set. The new lint
  §21.3 FAIL condition reads "if any catalog row's `Auth` column carries
  a value outside the three-value closed set" — read strictly, the
  catalog itself does not satisfy the gate it just established. The
  defensible interpretation (and the one the implementing session
  adopted) is that Auth-posture is an HTTP concept and `Library-only`
  rows have no HTTP boundary, so the closed set applies only to
  HTTP-routed rows. This is the right call for content but the lint
  rule's wording could read either way. Not blocking — the spirit of
  the rule is clear, content is internally consistent — but a
  follow-up clarification (either narrowing the §21.3 wording to
  "HTTP-routed catalog rows" or adding a sentinel value such as `n/a`
  to the closed set for non-HTTP rows) would close the literal-reading
  gap. Strictly out of WP-118 scope; flag only.
- **`Pending: WP-115 (STUB DRAFT 2026-04-29)` is a long Status string.**
  The WP-115 rows put the full formatted state in the `Status` column,
  which is technically not the bare token `Pending` from the closed
  set. The catalog header explicitly defines this format
  (`Pending: WP-NNN (STATE YYYY-MM-DD)`) and the lint §21.2 bullet
  authorizes it, so the closed-set check is "starts with `Pending`" by
  intent. Internally consistent; flag only as a literal-vs-spirit nit.

If neither of the above is addressed, no harm done — the commit lands a
working catalog and a working enforcement gate, and any follow-up tightening
fits cleanly into a future hygiene WP under the D-11804 update obligation.

---

## Explicit Deferrals (Correctly NOT in This WP)

The following were appropriately omitted, reinforcing scope discipline:

- **No endpoint behavior changes.** The catalog records the live HTTP
  surface as-is; no URL, method, request shape, response shape, or
  status code is modified.
- **No code-vs-WP drift reconciliation.** Where code and a WP's
  documented contract diverge, the catalog records a `Drift:` annotation;
  fixes are left to follow-up WPs per `## Non-Negotiable Constraints`.
- **No OpenAPI / JSON-Schema companion.** D-11801 = A explicitly defers
  the OpenAPI path; the WP only writes the human-first Markdown index
  and preserves the option for a future tooling consumer.
- **No client wrapper / SDK changes.** `apps/arena-client/src/*/Api.ts`
  files are clients of the catalog, not catalog entries.
- **No HTTP middleware policy.** Rate limiting, CORS, request-ID
  propagation are explicitly deferred. The `requestId` field semantics
  in D-11802 are documented as `conditional-on-server-trace-injection`
  awaiting the future request-handler WP.
- **No prose audit beyond the two `## HTTP API Surface` insertions.**
  Other places in the architecture docs that incidentally enumerate
  HTTP affordances are left untouched per the WP-119 PS-5 disposition
  precedent.
- **No EC file or `EC_INDEX.md` row.** Correctly omitted per D-10001
  risk profile + the no-`apps/`-files commit-hook path.
- **01.6 post-mortem not authored.** Optional under the WP-066 / WP-094
  / WP-119 governance-WP precedent; appropriately skipped (no new
  contracts, projections, setup artifacts, or long-lived abstractions).
- **CLI scripts and arena-client API wrappers not catalogued.**
  Correctly excluded as catalog clients per `.claude/rules/server.md`
  §"CLI Scripts".

---

## Commit Hygiene Recommendations

- **Commit message.** `SPEC: close WP-118 governance -- HTTP API surface
  catalog shipped` is appropriate (WP-119 close-out precedent). Body
  enumerates the four DECISIONS entries, the enforcement landings, and
  the verification anchors. No changes recommended.
- **Self-referential SHA in WORK_INDEX.** The implementing session
  switched to the WP-119 precedent (`**Completed 2026-04-30**` with no
  SHA reference) mid-execution after recognizing the self-referential
  problem with embedding the commit's own SHA in the commit. This is
  consistent with the WP-119 row in WORK_INDEX (line 2425 area in the
  same file). No further amendment recommended — the date stamp + the
  branch name + the `git log` history is sufficient traceability.
- **Pre-amend reflog entries (`e9c93fb`, `3a4440d`).** Documented in the
  user's review prompt; not visible in `git log` but present in the
  reflog. Harmless — they are dangling commits that GC will collect.
  No action needed.

---

## Conclusion

WP-118 meets its contract. The eight-file allowlist is honored exactly,
the four DECISIONS entries match the resolved options including the
copilot-check FIX #6 merge-semantics lock, the catalog and its two
enforcement gates cohere, no runtime boundary is crossed, and no out-of-scope
artifacts are staged. The two non-blocking nits above are literal-reading
gaps that do not affect commit safety and can be addressed by a future
hygiene WP under the D-11804 update obligation if desired.

**Affirm readiness to commit.** Push authorization is the user's to give.

Per `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md`, this review
itself should be staged and committed as a follow-up `SPEC:` artifact (no
EC required — `docs/ai/reviews/**` is a docs-only path). Suggested commit
title: `SPEC: pre-commit review WP-118 -- safe to commit as-is`.
