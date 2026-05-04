# Copilot Check — WP-115 (Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap)

> **Disposition:** Scratchpad per `.claude/rules/work-packets.md`
> §"Invocation Artifacts (Commit Policy)". Path is gitignored. Not
> committed unless an EC explicitly cites it as a normative input.

**Date:** 2026-05-01
**Pre-flight verdict under review:** DO NOT EXECUTE YET (2026-05-01)
**Inputs reviewed:**
- EC: `docs/ai/execution-checklists/EC-119-public-leaderboard-http-endpoints.checklist.md` (v1.1)
- WP: `docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md` (v1.1)
- Pre-flight: `docs/ai/invocations/preflight-wp115.md` (in-session)

---

## Posture Note

`01.7 §Workflow Position` requires this check to run **after** `01.4`
returns `READY TO EXECUTE`. The current pre-flight verdict is **DO NOT
EXECUTE YET** pending PS-1 (WP-054 merge) and PS-2 (WORK_INDEX row
addition).

This artifact is therefore a **forward-looking scan**: I apply the
30-issue lens to WP-115 v1.1 + EC-119 v1.1 + pre-flight as if PS-1 and
PS-2 were resolved, so the operator can see what would block, what
already passes, and what needs governance follow-up *parallel to* the
WP-054 merge prep — instead of waiting for the merge before learning
about copilot-class issues. The §Pre-Flight Verdict Disposition at the
bottom is accordingly **SUSPEND** under the strict 01.7 reading;
once PS-1 + PS-2 are resolved, I expect this to flip to `CONFIRM`
without further scope-neutral fixes (none are required by the 30-issue
scan below).

If you want the strict-01.7-compliant artifact (i.e., this file
only re-runs after pre-flight READY), treat this version as the
**conditional CONFIRM** that the post-PS-1/PS-2 re-run will confirm.

---

## Overall Judgment

**RISK** (under the strict reading; conditional **PASS** post-PS-1 +
PS-2 + the documentation-only governance follow-ups listed below).

The pre-flight verdict still holds: WP-054 merge is the only architectural
blocker. The 30-issue scan finds **two RISK items**, both
documentation-only and scope-neutral (one missing reaffirmation language;
one Pool log message specification). All Determinism, Persistence,
Mutation, Type-Safety, and Layer-Boundary categories return clean PASSes.
No finding would cause architectural or determinism damage if execution
proceeded after PS-1 + PS-2 resolution. The `RISK` label is honest
calibration — these are the kinds of polish items pre-flight typically
catches but the 30-issue lens explicitly enforces.

---

## Findings

### 1. Separation of Concerns & Boundaries

**1. Engine vs UI / App Boundary Drift** — **PASS** —
WP-115 §Non-Negotiable Constraints explicitly forbids `boardgame.io`,
`@legendary-arena/game-engine`, and registry imports in
`leaderboard.routes.ts` and `database.ts`. EC-119 §After Completing
grep gates (Steps 6, 7, 10) enforce mechanically.
Local structural `KoaRouter` / `KoaLeaderboardContext` interfaces
mirror the WP-102 PS-1 precedent. Server category (`apps/server/`)
boundary respected.

**9. UI Re-implements or Re-interprets Engine Logic** — **PASS** —
N/A; WP-115 is server wiring with no UI surface. The HTTP envelope is
purely a transport projection of WP-054's already-verified projection.

**16. Lifecycle Wiring Creep** — **PASS** —
WP-115 §Out of Scope explicitly forbids wiring `registerProfileRoutes`
from `server.mjs` (D-10202 deferral preserved). EC-119 §After
Completing Step 9 grep-gates `registerProfileRoutes` returns no
matches in `server.mjs`. The Pool lifecycle is owned by `index.mjs`
SIGTERM, never by handlers.

**29. Assumptions Leaking Across Layers** — **PASS** —
The route layer treats WP-054 helpers as black-box; no assumption
about SQL row internals. The Patch 3 `leaderboardLogic?` injection
seam reinforces this — tests fake the contract without depending on
SQL shape.

### 2. Determinism & Reproducibility

**2. Non-Determinism Introduced by Convenience** — **PASS** —
WP-115 §Non-Negotiable Constraints bans `Math.random()` and the
broader determinism suite; EC-119 §After Completing carries the grep
gate. No time / RNG / locale calls in scope. Pagination is explicit
`limit` / `offset` (no implicit ordering).

**8. No Single Debugging Truth Artifact** — **PASS** —
Identical request inputs → identical response bodies (locked under
WP-115 §Debuggability & Diagnostics invariants). No caching layer
introduced. Replay artifacts (WP-103) remain the single source of
truth one layer up.

**23. Lack of Deterministic Ordering Guarantees** — **PASS** —
WP-054 owns the deterministic sort order (`finalScore` ascending,
`createdAt` ascending tie-break — locked at WP-054 §Locked Contract
Values); WP-115 wraps the projection without re-sorting. `for...of`
over arrays is the only iteration pattern needed.

### 3. Immutability & Mutation Discipline

**3. Confusion Between Pure Functions and Immer Mutation** — **PASS** —
N/A; no `G` mutation, no Immer use. Pure helpers (`parsePaginationQuery`,
`createPool`, `closePool`) return new values. Move-validation
contract not in scope.

**17. Hidden Mutation via Aliasing** — **PASS** —
Response bodies serialize WP-054's projection via `koaContext.body =`;
no shared array / object reference flows back into G or registry. The
locked error envelopes are object literals (`{ "error": ..., "message": ...}`)
constructed fresh per response — no aliasing surface.

### 4. Type Safety & Contract Integrity

**4. Contract Drift Between Types, Tests, and Runtime** — **PASS** —
WP-115 v1.1 §Locked contract values copies WP-054's exported names
verbatim (`PublicLeaderboardEntry`, `ScenarioLeaderboard`,
`LeaderboardQueryOptions`, `LeaderboardDependencies`,
`PRODUCTION_DEPENDENCIES`). EC-119 §Locked Values cross-references
WP-115 verbatim ("All items below must match WP-115 §Locked contract
values verbatim"). The Patch 3 `LeaderboardLogic` interface uses
`typeof import('./leaderboard.logic.js').<fn>` to lock to the actual
WP-054 export shape post-merge — drift detection by construction.

**5. Optional Field Ambiguity (`exactOptionalPropertyTypes`)** — **PASS** —
`leaderboardLogic?` (Patch 3) is the only optional parameter
introduced. Default-vs-omit handling is explicit: when omitted,
production callers resolve to imported WP-054 functions; when passed,
tests use the fake. No inline `T | undefined` hacks.

**6. Undefined Merge Semantics (Replace vs Append)** — **PASS** —
N/A; WP-115 has no merge semantics. Pagination defaults are
locked-replace (no append-style). Catalog row replacement is
explicit-wholesale (D-11804) — no merge.

**10. Stringly-Typed Outcomes and Results** — **PASS** —
Error envelopes are locked literals (`'invalid_query'`,
`'score_not_found'`, `'internal_error'`); status codes are a closed
set `{200, 400, 404, 500}` (locked under §Locked contract values).
No free-form result strings. Pagination errors carry full-sentence
human-readable `message` field but the discriminator is the locked
`error` literal.

**21. Type Widening at Boundaries** — **PASS** —
`replayHash`, `scenarioKey`, and `accountId` field names match
`00.2-data-requirements.md` exactly per the Catalog row update
obligation. WP-115 §Locked contract values cites canonical spellings
explicitly. No `any` / `unknown` widening at the response-body
boundary.

**27. Weak Canonical Naming Discipline** — **PASS** —
`registerLeaderboardRoutes`, `createPool`, `closePool`,
`parsePaginationQuery`, `LeaderboardLogic`, `KoaLeaderboardContext`
all use full English (00.6 Rule 4); no abbreviations. Field names
align with `00.2-data-requirements.md` (canonical-spelling FAIL
condition codified at EC-119 §After Completing).

### 5. Persistence & Serialization

**7. Persisting Runtime State by Accident** — **PASS** —
`pg.Pool` is application-layer infrastructure (process lifetime),
not snapshot, not G. WP-115 §Debuggability & Diagnostics explicitly
states "this packet must not introduce any database state mutation;
the only state introduced is the `pg.Pool` connection cache, which is
process-local and discarded on shutdown." No write paths.

**19. Weak JSON-Serializability Guarantees** — **PASS** —
Response bodies are pure JSON (object literals, arrays, primitives).
No functions, Maps, Sets, or class instances. WP-054's
`PublicLeaderboardEntry` is JSON-clean by construction.

**24. Mixed Persistence Concerns** — **PASS** —
Persistence taxonomy clean: `pg.Pool` is runtime infrastructure;
`legendary.competitive_scores` etc. are persisted (read-only by this
WP); G / ctx are runtime-only (untouched by this WP). No blurring.

### 6. Testing & Invariant Enforcement

**11. Tests Validate Behavior, Not Invariants** — **PASS** —
WP-115 §Scope (In) E test #1 is an explicit drift / surface
assertion (the module exports exactly one symbol; registers exactly
three handlers at the locked paths in the locked order). Test #5
sub-asserts every locked 400 case (8 sub-assertions per Patch 5).
Test #8 asserts `Cache-Control: no-store` on success AND error paths
(per Patch 8) — invariant-focused.

### 7. Scope & Execution Governance

**12. Scope Creep During "Small" Packets** — **PASS** —
WP-115 v1.1 §Files Expected to Change locks the six files (Patch 7
locked the catalog file as the sixth). EC-119 §Locked Values + §After
Completing both enforce mechanically. The "anything not explicitly
allowed is forbidden" rule is cited verbatim. The mid-execution
amendment posture (EC-127 §0 D-12501 precedent) is named explicitly
in pre-flight RS-15.

**13. Unclassified Directories and Ownership Ambiguity** — **RISK** —
`apps/server/src/db/` is a new subdirectory not currently named in
`docs/ai/REFERENCE/02-CODE-CATEGORIES.md`. Pre-flight PS-3 already
flags this as recommended-but-non-blocking. Per `01.7 §Discipline`,
this is exactly the governance-fix class the copilot check is meant
to surface.
**FIX:** Land PS-3 (one-line clarification in `02-CODE-CATEGORIES.md`
§`server` row) before WP-115 execution. Suggested wording in
pre-flight PS-3.

**30. Missing Pre-Session Governance Fixes** — **PASS** —
Pre-flight surfaces three explicit Pre-Session Actions (PS-1
blocking, PS-2 blocking, PS-3 recommended) with verification
commands and resolution paths. Status logged in §Authorized Next
Step ready for fill-in. WP-117 / WP-118 precedent followed.

### 8. Extensibility & Future-Proofing

**14. No Extension Seams for Future Growth** — **PASS** —
The Patch 3 optional `leaderboardLogic?` parameter is the explicit
test-time extension seam. The locked status-code-domain
`{200, 400, 404, 500}` and locked error-envelope shape are the
explicit future-hardening seam — rate-limit / response-cache /
observability WPs can add behavior without churning route handlers.
Pool sizing constants (`max: 10`, etc.) are intentionally hardcoded
in this WP; a future env-driven tuning WP can parameterize
`createPool()` without breaking callers.

**28. No Upgrade or Deprecation Story** — **PASS** —
WP-115 §Out of Scope explicitly defers rate limiting, response
caching, CORS list changes, structured logging, and authentication.
Each deferred item names the future hardening WP and the
`Cache-Control: no-store` lock that backstops correctness in the
interim. The `LeaderboardLogic` injection seam is forward-compatible
with future test-harness expansion.

### 9. Documentation & Intent Clarity

**15. Missing "Why" for Invariants and Boundaries** — **PASS** —
WP-115 §Required `// why:` Comments enumerates six clauses (Pool
construction, Pool sizing, file-level on routes, Handler 1
discoverability, Handler 2 explicit deps injection, Pool lifecycle
in `server.mjs`/`index.mjs`). EC-119 §Required `// why:` Comments
mirrors verbatim. Patch 3's optional 4th parameter has its own
`// why:` clause. Patch 8's Cache-Control-on-error-paths has its
own clause. Patch 9's pool-log-location has its own clause.

**20. Ambiguous Authority Chain** — **PASS** —
Pre-flight RS-13 explicitly resolves: EC > WP for execution
correctness; WP > EC for design intent; `00.3 §21` is the lint-time
companion to `.claude/rules/work-packets.md` execution-time companion.
No cross-document conflicts identified.

**26. Implicit Content Semantics** — **PASS** —
Locked envelope literals, status codes, sort order, visibility
filter, and PAR fail-closed semantics are all explicitly stated in
the WP body (not "convention-based"). The catalog-row interpretation
(single-row graduation; delete Pending) is explicitly locked under
Patch 7 with the catalog footer language quoted.

### 10. Error Handling & Failure Semantics

**18. Outcome Evaluation Timing Ambiguity** — **PASS** —
N/A; no game-state outcome evaluation (this is HTTP transport).
The empty-leaderboard fail-closed semantics (PAR-missing → 200 with
`entries: []`, NEVER 404) is locked under §Locked contract values
and asserted by test #6.

**22. Silent Failure vs Loud Failure Decisions Made Late** — **PASS** —
Failure semantics are explicit:
- Validation errors → 400 with locked envelope (loud, structured)
- Score not found → 404 with locked envelope (loud, structured)
- Uncaught error → 500 with locked envelope (loud, structured;
  no stack trace / SQL state / exception text per D-5201)
- Empty leaderboard → 200 with `entries: []` (silent, by design,
  per WP-054 fail-closed)
00.6 Rule 11 full-sentence error messages enforced in WP-115
§Non-Negotiable Constraints.

### 11. Single Responsibility & Logic Clarity

**25. Overloaded Function Responsibilities** — **PASS** —
`parsePaginationQuery` is pure: parses query → returns
`{ limit, offset } | { error }`. Each handler does exactly: set
header → try { call WP-054 → set status + body } catch { 500 +
locked envelope }. `createPool` constructs; `closePool` ends. No
function does merging + validation + evaluation + mutation in the
same body.

---

## Additional RISK item (outside the strict 30-issue lens but
adjacent — flagging for completeness)

**Pool-construction log message not specified verbatim** — **RISK** —
WP-115 §Debuggability & Diagnostics requires "exactly one Pool
construction log event" but does not specify the literal message
string. Patch 9 downgraded this from `must` to `should` and moved
the location to `server.mjs`, but did not lock the message text.
Without a literal lock, future changes could alter the message and
break a downstream observability WP that greps for it.
**FIX (scope-neutral):** Add a one-liner to WP-115 §Locked contract
values (already extended by Patch 9): *"If a log is emitted in
`server.mjs` after `createPool()`, the message text is `'[server]
pg.Pool constructed (max=10)'` exactly. Future changes require
explicit grep-impact analysis."* This is a transcription artifact;
no scope change.

This RISK is below the 30-issue lens threshold (it doesn't map cleanly
to any of the 30 categories) but worth fixing in the same governance
pass as PS-3.

---

## Mandatory Governance Follow-ups

- **`docs/ai/REFERENCE/02-CODE-CATEGORIES.md`:** Add the one-line
  `apps/server/src/db/` clarification per pre-flight PS-3. Land before
  WP-115 execution. (RISK from issue **13**.)
- **WP-115 §Locked contract values (already extended by Patch 9):**
  Add the literal Pool-construction log message text per the
  additional RISK item above. Land before WP-115 execution.
- **`docs/ai/work-packets/WORK_INDEX.md`:** Add the WP-115 row per
  pre-flight PS-2. Mandatory. (Tracked under PS-2; not a
  copilot-discovered issue.)
- **DECISIONS.md (D-115NN entries at execution-Commit B):** Pool
  location, sizing rationale, rate-limit deferral, `Cache-Control:
  no-store` v1 lock, profile-route wiring still-deferred (D-10202
  reaffirmation), D-11804 replace-whole-row applied to catalog rows,
  pool-log-message verbatim lock (per the additional RISK above).
  Tracked under WP-115 §Definition of Done; not a copilot blocker.

No `DECISIONS.md` entry is needed for the PS-3 / log-message fixes
themselves — they are scope-neutral wording polish per `01.7
§Discipline` ("Governance fixes are explicitly permitted and
expected as remediation").

---

## Pre-Flight Verdict Disposition (Re-Run, 2026-05-01)

**Re-run trigger:** Pre-flight re-confirmed READY at 2026-05-01 after
PS-1 (WP-054 cherry-pick at `35572df`) + PS-2 (WP-115 WORK_INDEX row
at `74d439d`) + PS-3 (`02-CODE-CATEGORIES.md` clarification at
`74d439d`) + Pool-log-message verbatim lock (at `74d439d`) all landed
on `main`.

Re-application of the 30-issue lens against the post-PS state:

- **Issue 13 (Unclassified Directories)** — was RISK in the original
  scan; now **PASS**. `02-CODE-CATEGORIES.md:231` now contains
  `apps/server/src/db/` (per WP-115 PS-3, 2026-05-01) under the
  `server` category with the inclusion clause covering all server
  subdirectories.
- **Pool-construction log message verbatim** (the adjacent RISK
  outside the strict 30) — was RISK in the original scan; now
  **PASS**. WP-115 §Locked contract values lines 91 + 724 contain the
  literal lock `'[server] pg.Pool constructed (max=10)'` with explicit
  grep-impact-analysis discipline for future changes.
- **All other 28 PASS verdicts** are structurally unchanged by the
  PS-1 / PS-2 commits — the cherry-pick added pure-additive code
  (3 new files; no shared-state mutation) and the SPEC commit added
  pure-additive governance rows. No 30-issue category re-evaluates
  to RISK as a side effect.

- [x] **CONFIRM** — Pre-flight READY TO EXECUTE verdict stands. Session
      prompt generation authorized. The 30-issue lens returns 30 PASS
      verdicts (was 28 PASS / 2 RISK at the original scan; both RISKs
      resolved by the scope-neutral fixes). No remaining FIXes; no
      governance follow-ups beyond what's already landed.
- [ ] **HOLD** — Not invoked.
- [ ] **SUSPEND** — Resolved via the PS-1 + PS-2 + scope-neutral fix
      commits.

---

## Re-Run Plan (post PS-1 + PS-2)

After PS-1 and PS-2 are resolved:

1. Re-run pre-flight `§Before Starting` grep gates only (no full
   01.4 re-run; resolution does not change scope per
   `01.4 §Pre-Flight Verdict (Binary)`). Re-confirm verdict.
2. Apply scope-neutral copilot fixes:
   - Land PS-3 (`02-CODE-CATEGORIES.md` clarification).
   - Land the Pool-log-message verbatim lock in WP-115 §Locked
     contract values.
3. Re-run this copilot check. Expected disposition: **CONFIRM**.
4. Generate session-execution prompt at
   `docs/ai/invocations/session-wp115-public-leaderboard-http-endpoints.md`.
5. Begin execution under EC-mode in a new session.

---

## Final Instruction

The copilot check exists to **prevent premature execution and
preventable long-term pain**.

WP-115 v1.1 + EC-119 v1.1 + the 2026-05-01 pre-flight are
strongly-shaped. The 30-issue scan returns 28 PASS verdicts and 2 RISK
items (one inside-lens for issue **13**, one adjacent for the
Pool-log-message); both are documentation-only and scope-neutral.

The hard blocker is structural (WP-054 merge), not architectural —
the WP itself is shaped to prevent the 30 known failure modes. Once
PS-1 + PS-2 + the two copilot RISK fixes are landed, expect a clean
**CONFIRM** at the post-PS re-run.

**DO NOT AUTHORIZE SESSION PROMPT GENERATION** until pre-flight is
re-confirmed READY and this copilot check is re-run with disposition
**CONFIRM**.
