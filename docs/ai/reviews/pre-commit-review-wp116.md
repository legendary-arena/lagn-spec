# Pre-Commit Review — WP-116 (Disconnect & Reconnect Semantics)

**Work Packet:** WP-116 — Disconnect & Reconnect Semantics (Architecture)
**Template:** `docs/ai/prompts/PRE-COMMIT-REVIEW.template.md`
**Commit reviewed:** `1b4ce07` (close-out, under review). Prep commit
`cddfa3f` and v1.1 refresh `ea674a8` are already on `main` and out of
scope for this review.
**Branch:** `wp-116-disconnect-reconnect-semantics` (descends from
`main` HEAD `ea674a8`; the close-out commit was originally authored as
`1dd95c2` against pre-v1.1 main HEAD `cddfa3f` on 2026-05-01, then
rebased onto `ea674a8` on 2026-05-02 with two conflict resolutions —
STATUS.md repositioning + v1.1 baseline updates, WORK_INDEX.md row body
replacement — landing as the current `1b4ce07`).
**Review date:** 2026-05-02
**Reviewer mode:** Non-implementing gatekeeper.

---

## Executive Verdict (Binary)

**Safe to commit as-is.**

The close-out commit lands exactly the 6-file allowlist declared in
WP-116 `## Files Expected to Change` plus the session-prompt §6.1
scope-lock. The six DECISIONS entries (D-11601..D-11606) match the
resolved options verbatim from WP-116 `## Decision Points` (B/B/B/A/A
plus the A-default-defer for D-11606), are inserted in numerical order
between D-11404 and D-11701, and each carries the required Rationale +
Rejected + Reinforces + Status fields. The new `## Disconnect &
Reconnect Semantics` section in `docs/ai/ARCHITECTURE.md` includes the
mandatory 12-cell phase × event matrix (no `—` / `TBD` placeholders),
the turn-stage adjacency note for `play.main`, and both required
literal statements byte-identical. WP-116 is a pure documentation /
governance change on top of WP-090's already-shipped Socket.IO
transport; no runtime, persistence, contract, or framework-config
surface is touched — safe to commit.

---

## Review Axis Assessment

### 1. Scope Discipline — **Pass**

`git show 1b4ce07 --stat` returns exactly the 6 paths declared in
WP-116 `## Files Expected to Change`:

1. `docs/ai/ARCHITECTURE.md` — `## Disconnect & Reconnect Semantics`
   section appended after `## Internationalization` (32 line additions)
2. `docs/02-ARCHITECTURE.md` — mirror section between `## Transport`
   (line 150) and `## HTTP API Surface` (line 168) (6 line additions)
3. `docs/ai/DECISIONS.md` — D-11601..D-11606 inserted between D-11404
   (line 11905) and D-11701 (line 12018) (99 line additions)
4. `.claude/rules/architecture.md` — one-line cross-link subheading
   under `## Layer Boundary` at line 346 (4 line additions)
5. `docs/ai/STATUS.md` — WP-116 capability block prepended above the
   WP-115 block (the new top entry on main as of 2026-05-01 EC-119
   close); 20 line additions (v1.1 baseline paragraph runs ~2 lines
   longer than the v1.0 draft)
6. `docs/ai/work-packets/WORK_INDEX.md` — WP-116 row replaced
   `[ ]` → `[x]` with the v1.1-refreshed body swapped for the
   post-execution summary (1 line replaced)

No `apps/`, `packages/`, or `data/` paths touched
(`git diff --name-only HEAD~1 HEAD -- 'apps/**' 'packages/**' 'data/**'`
empty). No `package.json` or `pnpm-lock.yaml` edit (no dependency
added per WP-116 `## Non-Negotiable Constraints` line 91). No
boardgame.io configuration change (no `Server()` config, no `Client()`
`socketOpts`). No EC stub (D-10001 + 2026-04-26 Amendment apply
cleanly under the no-`apps/`-staged path). No `docs/ai/REFERENCE/api-endpoints.md`
edit (D-11804 §21 not triggered — no HTTP endpoint touched, no
`apps/server/src/**` library function added).

The inherited dirty-tree item
(`docs/ai/invocations/copilot-check-wp115.md`, a leftover WP-115
copilot-check scratchpad that is gitignored-by-spirit but not covered
by the `copilot-wp*.md` glob) remains untracked and is correctly
excluded from the WP-116 close-out commit per the WP body's §Out of
Scope unrelated-untracked-files rule and the session prompt §5.2
inherited-dirty-tree-items list. (The original v1.0 close-out reviewed
2026-05-01 cited a different inherited dirty-tree item — the EC-119
checklist — which has since shipped as part of EC-119 commit `ab9bcce`
and is no longer untracked.)

### 2. Contract & Type Correctness — **Pass**

DECISIONS entries D-11601..D-11606 match the resolved options recorded
in WP-116 `## Decision Points`:

- **D-11601** = Option B (phase-aware grace window) ✓ — title and
  rationale align; magnitudes deferred to future implementation WP;
  Option A (fixed) and Option C (boardgame.io defaults) rejected with
  Vision §14 silent-drift cite for Option C.
- **D-11602** = Option B (pause match during `play.main`) ✓ —
  structural pause definition reproduces the WP-116 line 95 prohibition
  on `ctx.events.endTurn()` / `ctx.events.setPhase()` calls as side
  effects of disconnect; Option A (auto-pass) rejected with Vision §3
  strategic-decision covenant cite; Option C (host-decides) rejected
  as premature without a concrete consumer.
- **D-11603** = Option B (lobby ready-state cleared on disconnect) ✓
  — `G.lobby.ready[playerId]` mechanism named; flapping-connection
  failure mode named; Option A rejected with Vision §3
  implicit-state-confirmation covenant cite.
- **D-11604** = Option A (hard-timeout abandonment) ✓ — emits replay
  with `endReason: 'abandoned'` per D-11605 wiring; full `endReason`
  closed-set forward-linked to future implementation WP per WP-118
  D-11804 status-enum closed-set pattern; Option B (vote-to-abandon)
  and Option C (no auto-abandonment) rejected.
- **D-11605** = Option A (replay always emitted with explicit
  `endReason`) ✓ — Vision §22 byte-replayability constraint
  preserved verbatim; Option B (stub records on abandonment) rejected
  with bifurcation-cost rationale.
- **D-11606** = Option A default-defer (spectator behavior) ✓ —
  recorded as a standalone DECISIONS entry rather than a preamble
  marker (the session prompt §6.1 / §7.3 resolution explicitly cites
  the WP-117 D-11703 interpretation precedent for this choice;
  see Optional Nit 1 below).

The six entries are inserted between D-11404 (line 11905) and D-11701
(line 12018) — numerically correct. `Reinforces:` and `Status:` lines
are present and consistent with surrounding DECISIONS entries.

The `## Disconnect & Reconnect Semantics` section in
`docs/ai/ARCHITECTURE.md` (line 1656) contains a 4×3 phase × event
matrix with explicit outcomes in every cell (verified: `lobby` /
`setup` / `play` / `end` × `disconnect` / `reconnect` / `timeout` =
12 cells, no `—` / `TBD` placeholders). The turn-stage adjacency note
for `play.main` is present as adjacent prose after the matrix per the
session prompt §7.1 placement choice. Both required literal statements
are present byte-identical:

- "Disconnect tracking does not mutate `G`."
- "Disconnect / reconnect events do not advance RNG state,
  auto-resolve randomness, or implicitly execute turn logic."

Phase and turn-stage names match the canonical locked values
(`'lobby' | 'setup' | 'play' | 'end'` and `'start' | 'main' |
'cleanup'`) per `packages/game-engine/src/turn/turnPhases.types.ts`.

### 3. Boundary Integrity — **Pass**

Pure documentation / governance change. No engine code, no PostgreSQL,
no boardgame.io imports, no `G` / `ctx` access, no runtime helpers,
no socket handlers, no reconnect plumbing wired. The Lifecycle
Prohibition declared in the WP-116 session prompt §4 is honored. The
WP body's Non-Negotiable Constraint forbidding new state surfaces in
`G` is reinforced by the architecture-doc text itself ("Disconnect
tracking, if added later, lives in `boardgame.io` framework state or
in server-side session storage — never in `G`."). The `G.messages:
string[]` recording surface (cited via
`packages/game-engine/src/types.ts:442`) is referenced by file path
only, not modified.

The `.claude/rules/architecture.md` cross-link is exactly one
subheading + one paragraph (4 lines added including the heading,
blank-line separator, and content) at line 346, between the existing
`## Layer Boundary` section's content (which ends with the `### Final
Principle` subsection and its `Source: ARCHITECTURE.md, Package
Import Rules` line) and the `---` separator that precedes
`## Prohibited AI Failure Patterns [Guardrail]` at line 352. Within
the §7.4 budget of "no more than ~3 lines of new content"; no policy
text duplicated.

### 4. Test Integrity — **Pass (N/A)**

No tests added or removed. Implementing session ran `pnpm -r test`
post-rebase and confirmed exit 0 with the v1.1 baselines: registry 31,
vue-sfc-loader 11, game-engine 604, registry-viewer 31 (post-WP-125
chip-ribbon expansion), replay-producer 4, preplan 52, server `pass
56 / fail 0 / skipped 32` (post-WP-054 cherry-pick + WP-115 +8
logic-pure tests), arena-client 182. The STATUS block at the new
top-of-list position records the v1.1 baselines verbatim and
acknowledges the v1.0 → v1.1 baseline shifts (registry-viewer 22 →
31, server 47+24 → 56+32). `pnpm -r build` exits 0 (no dependency
changes). Treated as true per the template's Assumed Verification
clause; no contradiction in the diff to warrant re-running here.

### 5. Runtime Boundary Check — **Pass (allowance not exercised)**

01.5 (Runtime Wiring Allowance) was **NOT INVOKED**. None of its four
trigger criteria are present:

- Zero new `LegendaryGameState` fields. (The `endReason` field cited
  in D-11604 / D-11605 lives in **future replay-record schema** owned
  by a future implementation WP, not in `G`.)
- Zero `buildInitialGameState` shape changes.
- Zero new `LegendaryGame.moves` entries.
- Zero new phase hooks. (The four phases referenced by name in the
  matrix are existing phases; no new phase introduced; no
  `phases.X.onBegin` / `onEnd` hook added.)

`git diff --name-only HEAD~1 HEAD -- 'packages/game-engine/'
'apps/server/' 'apps/arena-client/' 'packages/preplan/'` is empty.
Stating explicitly: **the runtime wiring allowance was not used**.

### 6. Governance & EC-Mode Alignment — **Pass**

- **Commit prefix.** `SPEC:` is correct under D-10001 + 2026-04-26
  Amendment; no `apps/`/`packages/`/`data/` files staged → `.githooks/commit-msg`
  Rule 5 not triggered → no `EC-###:` prefix and no EC stub required.
  Title `SPEC: close WP-116 governance -- disconnect/reconnect policy
  locked` fits hook constraints.
- **No EC.** Correctly declared in WP-116 `## Execution Checklist (EC)`
  per D-10001 risk profile (binary-verifiable, no engine mutation, no
  persistence, no ordering surface, no irreversible side effects).
- **DECISIONS ordering.** D-11601..D-11606 inserted between D-11404
  and D-11701 (verified by line numbers post-insertion: 11919 / 11935
  / 11951 / 11966 / 11984 / 12001). No re-numbering of existing
  entries. Matches the session prompt §7.3 explicit insertion
  instruction "between the existing `### D-11404` and the existing
  `### D-11701`". (See Optional Nit 4 below for a pre-existing
  WP-115 misorder observation.)
- **Architecture doc placement (`docs/ai/ARCHITECTURE.md`).**
  `## Disconnect & Reconnect Semantics` placed after `## Internationalization`
  at line 1656 (the last sequential top-level section before the
  trailing `---` divider and footer). Matches the session prompt §7.1
  + the pre-flight PS-1 resolution.
- **Architecture doc placement (`docs/02-ARCHITECTURE.md`).** Mirror
  section placed between `## Transport` (line 150) and `## HTTP API
  Surface` (line 168), at line 162. Keeps transport + disconnect/reconnect
  adjacent per session prompt §7.2.
- **Rules cross-link placement (`.claude/rules/architecture.md`).**
  New `### Disconnect & Reconnect Posture (Cross-Reference)` subheading
  inserted at line 346, at the end of the `## Layer Boundary
  (Enforcement — Canonical Source Is ARCHITECTURE.md)` section, after
  the existing `### Final Principle` subsection's closing `Source:
  ARCHITECTURE.md, Package Import Rules` line, and before the `---`
  separator that precedes `## Prohibited AI Failure Patterns
  [Guardrail]` at line 352. Matches the session prompt §7.4 placement
  guidance and respects the "no more than ~3 lines of new content"
  budget.
- **WORK_INDEX flip.** Single-line edit at line 2464: the v1.1-refreshed
  READY-FOR-EXECUTION row (`[ ] WP-116 ... DRAFT v1.1 ...`) is replaced
  with the post-execution summary (`[x] WP-116 ... ✅ Reviewed ... —
  **Completed 2026-05-02**`). Uses the WP-117 / WP-118 / WP-119
  close-out precedent (no SHA reference; "Completed YYYY-MM-DD" form
  avoids the self-referential SHA-amend cycle problem documented in
  WP-118's close-out summary). The post-execution row body acknowledges
  the v1.1 refresh provenance ("v1.1 refresh at `ea674a8` 2026-05-02
  introduced no new PS items") and corrects the WP-115 misclassification
  ("WP-115 ships read-only HTTP, not a live-match surface").
- **STATUS.md.** WP-116 capability block prepended above the WP-115
  block (the new top entry on main as of EC-119 close 2026-05-01); the
  block matches the chronological-prepend convention. The block
  includes the §17.1 #4 + #2 trigger declaration, the §20 N/A with
  explicit justification, the NG-1..NG-7 not-crossed declaration, the
  determinism-preservation declaration, the 01.5 NOT INVOKED
  declaration, the 01.6 OPTIONAL declaration, and the v1.1 refresh
  provenance paragraph (refreshed baselines, v1.1 refresh narrative,
  copilot-check RISK-finding resolution numbers).
- **§17 / §20.** §17.1 #4 (multiplayer reconnection — Vision §4) is
  the primary trigger; §17.1 #2 (replays — Vision §22, §24) is the
  secondary trigger via D-11605 = A. Both cited in the architecture
  doc, the DECISIONS entries, the STATUS block, and the commit message.
  §20 N/A with explicit justification (pure governance / architectural-policy
  update; no UI surface, no user-visible copy, no funding channel) —
  passes N/A discipline.
- **D-11804 §21 catalog gate not triggered.** No HTTP endpoint
  touched; no `apps/server/src/**` library function added or altered.
  The WP-118 catalog is correctly not modified.

---

## Optional Pre-Commit Nits (Non-Blocking)

- **D-11606 placement choice.** WP-116 body line 159 says the spectator
  deferral should be recorded as "a one-line preamble marker" rather
  than a full DECISIONS entry. The session prompt §6.1 / §7.3 (which
  is authoritative for execution per session prompt §1 conflict
  resolution) explicitly resolves this differently — D-11606 is
  recorded as a standalone DECISIONS entry citing the WP-117 D-11703
  interpretation precedent ("standalone entry is more grep-discoverable
  -- a deliberate interpretation improvement, not a discrepancy", per
  WP-117 close-out commit `b6a6d5b`). The implementing session followed
  the session prompt verbatim. This is the better choice for the same
  reason WP-117's review flagged it as nit-and-improvement: a full
  entry is grep-discoverable (`grep -n 'D-11606' DECISIONS.md` returns
  a single explicit hit) and parallels how N/A / deferred decisions
  are recorded elsewhere in the project. Not a discrepancy worth
  blocking on; flag as a deliberate interpretation choice that
  improves on the WP body's literal suggestion. The pattern is now
  doubly precedented (WP-117 D-11703, WP-116 D-11606) and should be
  considered the project default for N/A / deferred decisions going
  forward.

- **No `<!-- why: -->` placement-justification comment in the new
  ARCHITECTURE.md section.** WP-117 (and WP-118 / WP-119 per WP-117
  review's §6 observation) included a `<!-- why: -->` HTML comment at
  the head of new architecture-doc sections explaining the placement
  choice. WP-116's `## Disconnect & Reconnect Semantics` section is
  appended at the end of the file (after `## Internationalization`,
  before only the trailing footer) — the placement is essentially
  "end of file" rather than "between two specific sections", so the
  comment-precedent is less applicable than for WP-117's mid-file
  insertion. The session prompt §7.1 Suggested skeleton does not
  authorize the comment. Not a discrepancy worth blocking on; flag as
  a stylistic deviation from the WP-117/118/119 pattern that is
  justified by the trivially-end-of-file placement.

- **`docs/ai/ARCHITECTURE.md` footer "Last updated" line not touched.**
  The footer's "Last updated" line currently credits WP-119 as the
  last touch; WP-116's append-section diff did not update it. Same
  behavior as the WP-117 close-out (which also did not touch the
  footer despite adding `## Client Routing`). This is a minimal-diff
  discipline choice consistent with the session prompt's six-file
  scope-lock. Worth tracking as a project-level convention question
  (do append-section WPs get a footer mention?), not blocking. If a
  future WP wants to backfill, the WP-116 + WP-117 close-outs are
  the two missing entries.

- **Pre-existing WP-115 DECISIONS misorder (NOT introduced by WP-116).**
  WP-115's close-out (commit `ab9bcce` 2026-05-01) appended D-11501..D-11506
  at lines 12382+ in `docs/ai/DECISIONS.md` — i.e., AFTER D-11704 —
  rather than between D-11404 and D-11601 where the numerical-order
  rule places them. WP-116's auto-merge correctly placed D-11601..D-11606
  between D-11404 and D-11701 per session prompt §7.3, so the relative
  order with respect to D-11601..D-11606 is correct: D-11404 →
  D-11601..D-11606 → D-11701..D-11704 → D-11501..D-11506 (D-11501..D-11506
  out of position). This is a pre-existing WP-115 issue, not something
  WP-116 introduced or can fix without exceeding its six-file
  scope-lock. Flag as a follow-up: a separate hygiene WP should
  relocate D-11501..D-11506 to the slot between D-11404 and D-11601
  (where WP-116's v1.1 refresh §Update Log already implicitly assumes
  they live).

- **Rebase + reconcile narrative.** The close-out commit was originally
  authored as `1dd95c2` on 2026-05-01 against pre-v1.1 main HEAD
  `cddfa3f`; on 2026-05-02 the executing session rebased it onto v1.1
  main HEAD `ea674a8` (after WP-115 / EC-119 / WP-054 cherry-pick /
  WP-116 v1.1 refresh landed on main), resolving STATUS.md conflicts
  by repositioning the WP-116 entry above the new top entry (WP-115)
  and updating the test-baseline numbers to v1.1 values, and resolving
  the WORK_INDEX.md conflict by replacing the v1.1-refreshed READY row
  body with the §7.6 post-execution summary. No new content was
  introduced beyond what the session prompt §7.5 / §7.6 already
  specified for v1.1; the rebase preserved the six-file allowlist
  exactly. Not a discrepancy; flag as provenance documentation for
  reviewers comparing the original `1dd95c2` SHA against the current
  `1b4ce07` SHA.

If none of these are addressed, no harm done.

---

## Explicit Deferrals (Correctly NOT in This WP)

- **No reconnect handler in `apps/server/src/server.mjs`.** The
  policy is descriptive governance only; the future implementation WP
  that wires reconnect plumbing owns its own scope (server reconnect
  handler, client `socketOpts`, per-phase grace-window magnitudes,
  hard-timeout magnitude, full closed `endReason` enum, EC stub).
  Confirmed via `apps/server/src/server.mjs` reading at HEAD `ea674a8`
  during pre-flight: the file now has 151 lines (was 135 lines at the
  original verification against `cddfa3f`) due to WP-115's pg.Pool /
  route-register / SIGTERM closePool additions, but still no existing
  reconnect handler, no socket-disconnect listener, no grace-window
  logic. The three new disconnect/reconnect/grace grep hits at lines
  81 / 86 / 126 are unrelated to player-disconnect (graceful-shutdown
  JSDoc, D-5101 partial-registry comment, WP-115 pool-close `// why:`
  block). The WP correctly preserves the file as untouched.
- **No client-side reconnect parameter in `apps/arena-client/src/client/bgioClient.ts`.**
  Confirmed via reading at HEAD `cddfa3f` during pre-flight: 200
  lines, no `socketOpts` overrides for grace / retry / heartbeat, no
  listeners on `socket.on('disconnect', ...)`. The WP correctly
  preserves the file as untouched.
- **No timer / timeout numerical values committed.** Concrete grace
  window magnitudes per phase and the hard-timeout magnitude are
  deferred to a future implementation WP that gathers production
  telemetry. WP-116 commits only the *class* of policy
  (phase-aware / pause-on-drop / hard-timeout / replay-always-emitted)
  per its own `## Decision Points` discipline.
- **No full closed `endReason` enum lock.** D-11604 commits only
  that the field is required and that `'abandoned'` is one valid
  value. The full enum (e.g., `'natural-victory' | 'natural-defeat' |
  'abandoned' | ...`) is locked at the future implementation WP per
  the WP-118 D-11804 status-enum closed-set pattern.
- **No spectator-disconnect handling.** D-11606 = A default-defer.
  A future spectator-focused WP owns the supersession with full §17
  Vision Alignment treatment if/when a spectator surface ships.
- **No leaderboard / ranking interaction.** Downstream policy.
  WP-115 (now shipped) is referenced as a future consumer of the
  `endReason` discriminator, not modified.
- **No engine, persistence, or transport touch.** Pure governance
  posture lock on top of WP-090's already-shipped Socket.IO transport.
- **No EC file or EC_INDEX row.** Correctly omitted under D-10001
  no-EC governance precedent + 2026-04-26 Amendment.
- **01.6 post-mortem not authored.** Optional under WP-066 / WP-094
  / WP-117 / WP-118 / WP-119 governance-WP precedent; appropriately
  skipped (no new contracts, no projections, no setup artifacts, no
  long-lived abstractions).
- **No `docs/ai/REFERENCE/api-endpoints.md` edit.** D-11804 §21 not
  triggered — no HTTP endpoint touched; no `apps/server/src/**`
  library function added or altered.

---

## Commit Hygiene Recommendations

- **Commit message.** `SPEC: close WP-116 governance --
  disconnect/reconnect policy locked` is appropriate (WP-117 / WP-118
  / WP-119 close-out precedent). Body enumerates the six DECISIONS
  entries, the architecture doc additions, the rules cross-link, and
  the verification anchors. The use of `--` (double-dash) instead of
  `—` (em-dash) in the body matches WP-117 commit message style and
  avoids unicode rendering issues in pure-ASCII tools. No changes
  recommended. (The body still references the original `cddfa3f`
  prep-commit context; the rebase onto `ea674a8` preserved the body
  text verbatim, which is appropriate since the prep commit remains
  the load-bearing "decisions resolved" anchor regardless of which
  main-HEAD ancestor the close-out lands on.)
- **Branch shape.** `wp-116-disconnect-reconnect-semantics` is now a
  single-commit linear descendant of `ea674a8` (which is on `main`).
  Pushing this branch and opening a PR will produce a clean two-line
  view (the WP-116 close-out commit + this review's eventual commit).
- **Review-commit follow-up.** Per `01.3-commit-hygiene-under-ec-mode.md`,
  this review file should be staged and committed as a follow-up
  `SPEC:` artifact (no EC required — `docs/ai/reviews/**` is a
  docs-only path). Suggested commit title: `SPEC: pre-commit review
  WP-116 -- safe to commit as-is`.

---

## Conclusion

WP-116 meets its contract. The 6-file allowlist is honored exactly,
the six DECISIONS entries match the resolved options verbatim, no
runtime boundary is crossed, the architecture doc additions land in
the correct sequential positions in both `docs/ai/ARCHITECTURE.md`
(end-of-file after `## Internationalization`) and `docs/02-ARCHITECTURE.md`
(transport-adjacent, between `## Transport` and `## HTTP API
Surface`), the 12-cell phase × event matrix is complete with no
placeholders, both required literal statements are present byte-identical,
the v1.1 baselines + v1.1 refresh provenance are recorded in the
STATUS and WORK_INDEX entries, and no out-of-scope artifacts are
staged. The five non-blocking nits above are interpretation choices,
stylistic deviations, a pre-existing WP-115 misorder observation, and
rebase-provenance documentation — not content errors.

**Affirm readiness to commit.** Push authorization is the user's to
give.
