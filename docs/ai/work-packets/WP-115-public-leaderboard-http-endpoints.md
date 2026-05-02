# WP-115 — Public Leaderboard HTTP Endpoints + pg.Pool Bootstrap

**Status:** Draft (BLOCKED on WP-054 merge — see §Assumes)
**Primary Layer:** Server (`apps/server/**`) — wiring layer
**Version:** 1.1
**Last Updated:** 2026-05-01
**Dependencies:** WP-054 (library surface — **NOT YET ON `main`**, see §Assumes), WP-051 (parGate), WP-053 (competitive_scores table), WP-053a (parGate scoringConfig shape), WP-052 (replay_ownership / visibility), WP-103 (replay_blobs), WP-004 (server bootstrap), **WP-118** (HTTP API Catalog — D-11804 update obligation; see §API Catalog Update Obligation)

---

## v1.1 Update Log (2026-05-01)

Post-draft governance refresh. Substantive changes since v1.0
(2026-04-29):

1. **§Assumes WP-054 status downgrade.** At v1.0 draft time WP-054
   was assumed merged to `main`. As of 2026-05-01, WP-054's
   implementation (commit `f34e917` adding
   `apps/server/src/leaderboards/{leaderboard.logic.ts,
   leaderboard.types.ts, leaderboard.logic.test.ts}`) lives only on
   side-branch `wp-054-public-leaderboards-read-only` and is **not
   reachable from `main` HEAD**. The `EC-054:` commits on `main`
   (`a973c19`, `eb23c47`) are the parGate-seam TODO + governance
   close — docs and 12 lines of `server.mjs`, no library code.
   `WORK_INDEX.md:1351` carries `[ ]` (unchecked) for WP-054. WP-115
   is therefore **BLOCKED on the WP-054 branch merge** and cannot
   execute until that lands. See §Assumes for the verification
   command.
2. **§API Catalog Update Obligation (NEW).** WP-118 (Done
   2026-04-30, commits `4ac8216` / `06149b0`) introduced the HTTP
   API Catalog at `docs/ai/REFERENCE/api-endpoints.md` and the
   D-11804 update obligation. WP-115 IS triggered by `00.3 §21.1`
   (adds three new HTTP endpoints; transitions WP-054's library
   functions from `Library-only` — once merged — to `Wired`). The
   same commit that lands the route registration MUST transition
   WP-054's three `Library-only` rows wholesale to `Wired` rows
   (single-row graduation per the catalog footer's *"replaces the
   affected row wholesale (status → `Wired`, columns re-populated
   for the HTTP shape)"* language) AND delete the three
   `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows (forward-references
   that become redundant once the network surface exists in
   `## Wired`). Per D-11804 replace-whole-row merge semantics —
   no in-row column edits. New §API Catalog Update Obligation
   section below codifies the contract; `api-endpoints.md` is
   added as a sixth file under §Files Expected to Change.
3. **Test baselines refreshed.** Engine baseline `570/126/0` →
   `604/132/0` (post-WP-053a / WP-103 / WP-113 cumulative). Server
   baseline at `main` HEAD (without `DATABASE_URL` env): `47 pass /
   24 skipped / 0 fail` (the 24 skipped are DB-required tests
   under the existing skip-when-no-DB pattern; pass count is what
   `pnpm --filter @legendary-arena/server test` reports today
   absent the env var). Post-WP-054-merge baseline (Commit A
   `f34e917` claim): `56 pass / 24 skipped / 0 fail` — that's the
   number this WP must preserve plus the +8 leaderboard-route tests
   it adds (`64 pass / 24 skipped / 0 fail`). **Per reviewer Patch
   6:** suite counts are intentionally not locked because they
   shift with harmless refactors; only `pass / fail / skipped`
   totals are governance-significant. The `+8 tests / +1 suite`
   delta is the load-bearing invariant; suite-count drift in
   either direction is acceptable as long as the pass-count delta
   holds.
4. **EC-127 §0 pre-execution amendment pattern noted as
   precedent.** If, during WP-115 execution prep, a mechanical
   scope gap surfaces (e.g., a closed-union extension required for
   a new client to compile), follow the EC-127 §0 amendment path
   from D-12501: amend the contract before execution rather than
   retro-document. WP-086 (commit `ccc6d0e`) used the older
   audit-trail-after-the-fact pattern and is the legacy precedent;
   WP-125 / EC-127 (commit `97ddb96`) is the modern precedent.
5. **D-9905 Auth taxonomy reference.** `api-endpoints.md` Auth
   column carries exactly one of `guest | handle-required |
   authenticated-session-required` per D-9905. WP-115's three
   endpoints all use `guest` per the existing §Vision Alignment
   "anonymous access" lock; this WP introduces no values outside
   the closed set.
6. **PS-3 governance follow-up landed (2026-05-01).** Pre-flight
   `preflight-wp115.md` PS-3 + copilot-check Issue 13
   (Unclassified Directories) flagged `apps/server/src/db/` as a
   new subdirectory not currently named in
   `02-CODE-CATEGORIES.md`. Resolution: a one-line clarification
   added to the `server` category at `02-CODE-CATEGORIES.md:230`
   noting that `apps/server/src/db/` (and other server
   subdirectories) fall under the existing `server` category by
   inclusion. Scope-neutral governance polish; lands in the same
   commit that records WP-115 v1.1.
7. **Pool-construction log message verbatim lock (2026-05-01).**
   Copilot-check adjacent finding: Patch 9 downgraded the log
   from `must` to `should` and moved its location to `server.mjs`
   but did not lock the message text. Resolution: §Locked
   contract values now contains the literal message text
   `'[server] pg.Pool constructed (max=10)'`. Scope-neutral
   transcription; lands in the same commit that records WP-115
   v1.1. A future observability WP that greps for this string
   (e.g., to drive a Render log-based metric) is unblocked
   without further WP-115 governance action.

---

## Session Context

WP-054 (drafted v1.3, Status `Ready for Implementation`) ships three
library functions in `apps/server/src/leaderboards/leaderboard.logic.ts`
(`getScenarioLeaderboard`, `getPublicScoreByReplayHash`,
`listScenarioKeys`) that are unit-tested but **not network-reachable** —
its `## Lifecycle Prohibition` section locks a deferral of all HTTP
wiring, rate limiting, CORS, and `pg.Pool` lifecycle to "the future
request-handler WP." This packet is that WP for the leaderboard surface.
WP-102 (Done 2026-04-28 at `369c0a4`) shipped an analogous deferred
route file at `apps/server/src/profile/profile.routes.ts` whose
`registerProfileRoutes(router, database)` is also waiting on a
long-lived `pg.Pool`; per WP-102 D-10202, profile-route wiring is
explicitly deferred to its own follow-up WP and is **out of scope**
here even though the `pg.Pool` introduced in this packet would also
satisfy it.

---

## Why This Packet Matters

Without this packet, every public leaderboard query exists only as an
import-callable library. With it, the verified competitive results
written by WP-053 become viewable via `GET /api/leaderboards/...` from
any browser or CLI client — closing the loop on Vision §23(a)
scenario-benchmarking by giving the data a public surface. This
packet also introduces the long-lived `pg.Pool` that WP-102 and every
future request-handler WP requires.

---

## Vision Alignment

> Required by `00.3 §17.1` — this WP touches scoring/leaderboards
> (Vision §20-26, §22, §23, §24), replays/replay verification
> (§18, §22, §24), and player identity/visibility (§3, §11). Mirrors
> WP-054's Vision Alignment block; this packet is a transport surface
> over WP-054's projection.

**Vision clauses touched:**
`§3 (Player Trust & Fairness), §11 (Stateless Client Philosophy),
§18 (Replayability & Spectation), §20 (PAR-Based Scenario Scoring),
§22 (Deterministic & Reproducible Evaluation), §23 (Competitive
Leaderboards & Submission), §24 (Replay-Verified Competitive
Integrity), §25 (Skill Over Repetition — non-ranking telemetry
carve-out)`

**Conflict assertion:** No conflict — this WP preserves all touched
clauses. The HTTP surface is a transport adapter over WP-054's
verified, replay-anchored, PAR-gated projection; no scoring logic is
implemented here; no identity correlation surface is introduced; sort
order, visibility filter, and PAR-fail-closed semantics are inherited
from WP-054 and not re-derived.

**Non-Goal proximity (NG-1..7):** none crossed. The endpoints are
read-only over a non-monetized competitive surface (NG-1, NG-2, NG-3,
NG-7), with no time-pressure or FOMO mechanic (NG-4), no advertising
(NG-5), and no dark-pattern UX (NG-6). Anonymous access — no
auth-broker session check, no per-request authorization.

**Determinism preservation:** identical query parameters produce
identical responses (sort order from WP-054 is total; pagination is
explicit `limit`/`offset`); no caching layer is introduced; no
time-windowed aggregation; the response body is a JSON projection of
WP-054's already-verified records.

**Funding Surface Gate (`00.3 §20`):** **N/A — this WP introduces no
payment, donation, subscription, supporter-tier, or
tournament-funding surface.** Per `01-VISION.md §Financial
Sustainability`, monetization must never alter competitive integrity;
this WP is a read-only transport adapter over a non-monetized
competitive surface and cannot be a monetization vector by
construction.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

> Introduced post-v1.0 by the v1.1 update log (2026-05-01) to fold
> WP-118's catalog-update obligation. WP-118 (Done 2026-04-30,
> commits `06149b0` / `4ac8216`) created
> `docs/ai/REFERENCE/api-endpoints.md` and the D-11801..D-11804
> governance set; this section codifies WP-115's responsibilities
> under that contract.

**§21.1 trigger evaluation:** **TRIGGERED.** This WP touches every
catalog trigger surface:

- Adds three new HTTP endpoints to `apps/server` (registered via
  `registerLeaderboardRoutes(server.router, pool, parGate)` in
  `server.mjs`).
- Changes the `Status` of WP-054's three `Library-only` rows
  (`getScenarioLeaderboard`, `getPublicScoreByReplayHash`,
  `listScenarioKeys`) → `Wired`, with the `Path` column populated
  for the HTTP surface (per the catalog footer's graduation
  language: *"the wiring WP replaces the affected row wholesale
  (status → `Wired`, columns re-populated for the HTTP shape)"*).
- Removes the three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows
  from `## Pending — Drafted In A Future WP, Not Yet Executed`
  (the rows seeded by WP-118's catalog write at lines 173–185 of
  `api-endpoints.md`) — they were forward-references awaiting
  this exact transition; the underlying network surface is now
  fully described by the `Library-only → Wired` graduations and
  retaining the `Pending` rows would create row duplication
  inconsistent with the catalog's one-row-per-surface model.

**Catalog-row interpretation lock (resolved per Patch 7,
2026-05-01):** the catalog's per-section header at
`api-endpoints.md` line 33-34 (*"`Library-only`... May graduate to
`Wired` via a future request-handler WP"*) and the footer at line
192-198 (*"Graduation, when it happens, is the wiring WP's
responsibility... replaces the affected row wholesale (status →
`Wired`, columns re-populated for the HTTP shape)"*) describe a
**single-row transition** model: the library row IS the row that
graduates. The `Pending` rows in the WP-118 seed were placeholders
for the network surface BEFORE WP-054's library existed; once the
library exists (post-WP-054 merge) and graduates (this WP), the
`Pending` rows become redundant duplicates and are removed. End
state: three rows total in the `## Wired` section for the three
endpoints; zero `Library-only` rows for these functions; zero
`Pending: WP-115` rows. This is the only interpretation
consistent with both header texts; the alternative
"library + endpoint = two rows" interpretation would require
amending the catalog's header taxonomy and is out of scope for
this WP.

**§21.2 required content:** the same commit that lands the route
registration MUST update `docs/ai/REFERENCE/api-endpoints.md` with
all of the following:

- **Transition WP-054's three `Library-only` rows** wholesale to
  `Wired` rows (per the catalog footer graduation language).
  Each replaced row's `Status` flips `Library-only` → `Wired`;
  `Method` populates from `(n/a)` to `GET`; `Path` populates
  from `(n/a — function NAME)` to the locked endpoint path;
  `Auth` populates from `(n/a — caller-injected DatabaseClient)`
  to `guest`; `Request Schema` populates with the path/query
  spec; `Response Schema` populates with the locked envelope
  reference; `Authorizing WP` flips to `WP-115`; `Notes`
  populates with the locked Cache-Control / status-code-domain /
  error-envelope text.
- **Delete the three `Pending: WP-115 (STUB DRAFT 2026-04-29)`
  rows** at `api-endpoints.md` lines 183–185 (along with the
  surrounding `### Pending: WP-115 (STUB DRAFT 2026-04-29)`
  subsection header at line 173 if no other rows remain in that
  subsection — at session close the `## Pending` section may be
  empty; that's acceptable per the catalog's descriptive nature).
- Partial-column updates of any row are FAIL per D-11804
  replace-whole-row merge semantics — every transitioning row is
  a complete deletion + complete reinsertion in the diff, not an
  in-row column edit.
- Every transitioned row's `Status` column carries exactly one of
  the four locked values `Wired | Shipped-but-unwired | Library-only |
  Pending` (closed set per `00.3 §21.2`); status-line FAIL on any
  other string.
- Every transitioned row's `Auth` column carries exactly `guest` per
  D-9905 (closed set `guest | handle-required |
  authenticated-session-required`; `guest` is the only valid
  value for this WP per §Vision Alignment "anonymous access").
- Every field name in the `Request Schema` and `Response Schema`
  columns matches the canonical spelling in `00.2-data-requirements.md`
  exactly: `replayHash`, `scenarioKey`, `accountId` (negative —
  never appears in any response body per D-5201), `finalScore`,
  `createdAt`, `displayName`, `displayHandle`, `handleCanonical`,
  `parValue`, `parVersion`. Spelling drift is FAIL per `00.3 §21.3`.
- Every transitioned row's `Authorizing WP` column names `WP-115`
  (this WP) — replacing WP-054 since the row is now describing a
  network-reachable surface authorized by this WP.
- Each transitioned row carries `Notes` text that names the locked
  `Cache-Control: no-store` header (set on every response,
  including 400/404/500 error paths per Patch 8), the locked
  status-code domain `{200, 400, 404, 500}`, and the locked
  error-envelope shape (`{ "error": "invalid_query", "message":
  <sentence> }` / `{ "error": "score_not_found" }` /
  `{ "error": "internal_error" }`). The error-envelope shape
  per-row referencing the project-specific `{ code, message,
  requestId? }` contract from D-11802 = C is the canonical
  phrasing — but WP-115 v1.0 locked the literal envelope shapes
  above, so the `Notes` column may quote those literals while
  citing D-11802 inline (e.g., *"Project-owned envelope per
  D-11802 = C; literal shapes locked at WP-115 v1.0 §Locked
  contract values"*).

**§21.3 FAIL conditions checked at execution:** all four FAIL
conditions in `00.3 §21.3` are mechanically grep-able from the
catalog file post-execution. The §Verification Steps section adds
explicit grep commands; the §Acceptance Criteria adds binary
assertions.

**§21.4 N/A path:** **NOT INVOKED.** This WP is squarely §21.1
triggered (three new endpoints + three status transitions); claiming
N/A would be a §21.4 lint FAIL.

**Cross-link:** `.claude/rules/work-packets.md` §"API Catalog Update
Obligation (per D-11804)" is the execution-time enforcement
companion of `00.3 §21` — both gates encode the same
replace-whole-row constraint per D-11804 merge semantics, so a
slipped catalog update is caught at execution-time even if it slips
past the lint gate.

---

## Goal

Expose WP-054's three library functions as public, anonymous,
read-only HTTP endpoints under `/api/leaderboards/*` on the existing
boardgame.io Koa router. After this session, the server:

- Constructs and owns a long-lived `pg.Pool` instance at startup
- Closes the `pg.Pool` cleanly on `SIGTERM`
- Binds the WP-051 `parGate` (1-arg curried form from
  `createParGate(...)`) into the WP-054 `LeaderboardDependencies`
  injection seam
- Registers three new Koa route handlers:
  - `GET /api/leaderboards/scenarios`
  - `GET /api/leaderboards/scenarios/:scenarioKey`
  - `GET /api/leaderboards/scores/:replayHash`
- Rejects malformed `limit` / `offset` query parameters with `400`
  and a structured error envelope
- Returns `404` with a structured error envelope when a `replayHash`
  lookup misses
- Returns `500` with a structured error envelope on uncaught errors
  (no stack trace leakage)

**Invariant:** Wiring only — see `## Non-Negotiable Constraints` for
the canonical statement of what is and is not in scope.

---

## Assumes

> ⚠️ **Critical blocker (verified 2026-05-01):** WP-054's
> implementation is **not on `main`**. The library files asserted
> below currently exist only on side-branch
> `wp-054-public-leaderboards-read-only` (branch tip commit
> `f34e917` — "EC-054: introduce public leaderboard read surface
> and PAR-gated projection helpers"). The `EC-054:` commits on
> `main` (`a973c19` parGate-seam TODO + `eb23c47` governance
> close) shipped 12 lines of `server.mjs` plus docs only;
> `WORK_INDEX.md:1351` carries `[ ]` for WP-054. **This WP cannot
> execute until the WP-054 branch is merged to `main`.** The
> verification command at the end of this section grep-checks for
> the merge state; if it fails, this packet is **BLOCKED** per the
> §Non-Negotiable Constraints session protocol.

- WP-054 complete **and merged to `main`**. Specifically:
  - `apps/server/src/leaderboards/leaderboard.types.ts` exists at
    `main` HEAD and exports `PublicLeaderboardEntry`,
    `ScenarioLeaderboard`, `LeaderboardQueryOptions`,
    `LeaderboardDependencies`
  - `apps/server/src/leaderboards/leaderboard.logic.ts` exists at
    `main` HEAD and exports `getScenarioLeaderboard(options,
    database, deps?)`, `getPublicScoreByReplayHash(replayHash,
    database)`, `listScenarioKeys(database)`, and
    `PRODUCTION_DEPENDENCIES`
  - The `LeaderboardDependencies` shape is
    `{ checkParPublished: (scenarioKey: string) => ParGateHit | null }`
  - All three helpers fail closed on missing data and never throw
  - WP-054's catalog rows in `docs/ai/REFERENCE/api-endpoints.md`
    have been added by the WP-054 merge commit at `Status:
    Library-only` (per D-11804 — the WP-054 merge owns the initial
    `Library-only` row insert; this WP owns the
    `Library-only → Wired` transition). If WP-054 merges without
    a catalog update, that's a §21 FAIL on the WP-054 side and
    the missing rows must be added by a SPEC: reconciliation
    commit before this WP executes.
- WP-051 complete. Specifically:
  - `apps/server/src/par/parGate.mjs` exports `createParGate(basePath,
    parVersion)` returning an object whose `.checkParPublished` is the
    bound 1-arg curried form `(scenarioKey) => ParGateHit | null`
- WP-053 complete. Specifically:
  - `legendary.competitive_scores` exists with the locked WP-053
    schema; only WP-054 reads from it via the JOINs documented in
    WP-054 §Scope (In) §B
- WP-053a complete. Specifically:
  - `ParGateHit` carries `{ parValue, parVersion, source,
    scoringConfig }`; this WP reads only the bound function shape and
    does not destructure the hit
- WP-052 complete. Specifically:
  - `legendary.replay_ownership.visibility` exists with `'private' |
    'link' | 'public'`
  - `legendary.players.display_name` exists `text NOT NULL`
- WP-103 complete. Specifically:
  - `legendary.replay_blobs` exists; this WP does not read it but its
    presence is a precondition for WP-053 records to exist
- WP-004 complete. Specifically:
  - `apps/server/src/server.mjs` exports `startServer()` and wires
    `LegendaryGame` into boardgame.io `Server({...})`
  - `apps/server/src/index.mjs` is the process entrypoint and handles
    SIGTERM
  - `boardgame.io/server`'s `Server({...}).router` exposes a Koa
    `Router#get(path, handler)` surface (transitive `@koa/router`
    dependency — no direct dep added; see WP-102 §Files Expected to
    Change pre-flight PS-1)
- `DATABASE_URL` (or equivalent `pg`-compatible connection string env
  var read by the existing rules loader) is documented and set in all
  environments
- WP-118 complete (Done 2026-04-30, commits `06149b0` /
  `4ac8216`). Specifically:
  - `docs/ai/REFERENCE/api-endpoints.md` exists at `main` HEAD and
    carries the closed-set `Status` and `Auth` taxonomies (per
    D-11801..D-11804).
  - The three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows at
    lines 173–185 are present (this WP **deletes** them per
    §API Catalog Update Obligation — they were forward-references
    awaiting the `Library-only → Wired` graduation that this WP
    performs).
  - `00.3 §21` (API Catalog Update) is the lint-time companion;
    `.claude/rules/work-packets.md §"API Catalog Update Obligation
    (per D-11804)"` is the execution-time companion. Both gates
    encode the replace-whole-row constraint per D-11804.
- `pnpm -r build` exits 0
- `pnpm test` exits 0 with all existing baselines preserved.
  Verified baselines on `main` HEAD as of 2026-05-01:
  - `pnpm --filter @legendary-arena/game-engine test` → `tests
    604 / pass 604 / fail 0` (refreshed from v1.0's stale
    `570/126/0` after WP-053a / WP-103 / WP-113 cumulative
    additions; suite count informational only per Patch 6 — the
    `pass 604 / fail 0` is the load-bearing invariant).
  - `pnpm --filter @legendary-arena/server test` → `pass 47 /
    fail 0 / skipped 24` on `main` HEAD absent `DATABASE_URL` (the
    24 skipped are DB-required tests under the existing
    skip-when-no-DB pattern; suite count drifts with refactors so
    is informational only per Patch 6).
  - Post-WP-054-merge expected baseline: `pass 56 / fail 0 /
    skipped 24` (per the WP-054 Commit A claim at `f34e917`;
    suite count informational only). After this WP's +8 tests /
    +1 suite delta, the expected post-execution baseline is
    `pass 64 / fail 0 / skipped 24` (suite count informational).
  - The leaderboard library tests added by WP-054 must already
    pass; if WP-054 has not yet merged to `main` at execution
    time, this packet is **BLOCKED**.

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

**WP-054 merge-state verification command (mandatory pre-execution):**

```pwsh
# Returns the file path if and only if WP-054 has merged to main.
# No output → WP-054 is still on the side branch; this packet is BLOCKED.
git ls-tree -r --name-only HEAD apps/server/src/leaderboards/leaderboard.logic.ts
```

If the command returns no output, STOP and surface the WP-054 merge
gap — do not proceed. The WP-054 branch
(`wp-054-public-leaderboards-read-only`, tip `f34e917`) must merge
to `main` first, with its own catalog-update commit per D-11804
adding three `Library-only` rows for the leaderboard library
functions.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Section 1 "Monorepo Package Boundaries"`
  and `.claude/rules/server.md` — the server is a wiring layer only;
  no game logic; this packet adds wiring and nothing else.
- `docs/ai/ARCHITECTURE.md §Persistence Boundaries` — the `pg.Pool`
  introduced here is application-layer infrastructure. No `G`/`ctx`
  is touched by any code in scope. Per `.claude/rules/persistence.md`
  Class 1, `G` is never persisted; this packet does not change that.
- `docs/ai/work-packets/WP-054-public-leaderboards-read-only.md` —
  read `## Lifecycle Prohibition`, `## Scope (In)`, and `## Locked
  Contract Values`. The library shape this packet wraps is locked;
  nothing in WP-054's contract may be modified here.
- `apps/server/src/profile/profile.routes.ts` — the canonical pattern
  for a Koa-router adapter on this codebase. Mirrors structurally:
  local `KoaRouter` interface, `try/catch` swallowing the value,
  status + body assignments, no global error middleware. This packet
  follows the same pattern verbatim.
- `apps/server/src/server.mjs` — read the existing `startServer()`
  end-to-end. Note the `Promise.all([loadRegistry(), loadRules(),
  createParGate(...)])` startup pattern; this packet adds a long-lived
  `pg.Pool` construction step alongside the existing startup
  `Promise.all(...)` results (Pool construction is synchronous;
  connections are established lazily on first query) and a
  single-line route registration.
- `apps/server/src/index.mjs` — the entrypoint; SIGTERM handler lives
  here. This packet adds a `pool.end()` call to the SIGTERM path.
- `apps/server/src/par/parGate.mjs` — read the `ParGate` interface
  and the bound 1-arg `checkParPublished` shape. This packet supplies
  exactly that bound function as the `LeaderboardDependencies` value.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations — `database` not `db`, `error` not `e`), Rule 6
  (`// why:` on non-obvious decisions), Rule 11 (full-sentence error
  messages), Rule 13 (ESM only), Rule 14 (canonical field names).
- `docs/ai/DECISIONS.md` — D-5201 (server identity is `AccountId`,
  never `playerId`), D-10202 (WP-102 profile route wiring deferred —
  this packet does **not** un-defer it), D-3103 (mid-execution
  amendment precedent if scope drifts), D-9904 (Hanko code lives only
  under `apps/server/src/auth/hanko/` — this packet introduces no
  auth code).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- **Wiring only:** this packet contains zero scoring logic, zero
  replay re-execution, zero data validation beyond query-string
  parsing. All semantics — visibility filter, PAR fail-closed,
  deterministic sort, sensitive-field stripping — are inherited from
  WP-054 and must not be re-derived.
- **No new npm dependencies.** The Koa router reaches us as a
  transitive of `boardgame.io/server` (see WP-102 §Files Expected to
  Change pre-flight PS-1); `pg` is already a direct dependency.
  **No `koa-ratelimit`, no `koa-bodyparser`, no Express, no Fastify,
  no `cors` package.** CORS is already configured in the existing
  `Server({ origins: [...] })` call and is inherited.
- **No write paths.** No `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`,
  or migration is permitted in any file in scope.
- **No new tables, no new migrations.** `legendary.competitive_scores`,
  `legendary.replay_ownership`, and `legendary.players` are read by
  WP-054's library; this packet does not touch the schema.
- **No authentication.** Routes are anonymous. No
  `requireAuthenticatedSession` import, no Hanko reference, no
  per-request authorization. The visibility gate from WP-052 already
  governs what is publicly visible.
- **No `accountId` exposure.** Per D-5201, `accountId` is the
  server-side identity correlation handle and never appears in any
  response body. WP-054's `PublicLeaderboardEntry` already strips it;
  this packet does not re-introduce it.
- **No structured logging beyond `console.error`.** Existing server
  logging is `console.log` / `console.error`. This packet matches
  that pattern. A future observability WP may attach a logger via
  the structural router parameter without changing this surface.
- **No request-scoped `pg.Pool` creation.** Exactly one `pg.Pool`
  instance is constructed at startup and shared by every handler.
  Per-request pool creation is a known anti-pattern and is forbidden.
- **No `pg.Client` outside the Pool.** All database access goes
  through the Pool's connection-checkout path. Direct `new
  pg.Client(...)` is forbidden.
- **No registry-viewer or arena-client modifications.** This packet
  is server-only.
- **No engine imports.** No import from `packages/game-engine/`
  runtime; type-only imports already permitted by WP-054 are not
  re-introduced here.
- **No modification of WP-054 contract files.**
  `apps/server/src/leaderboards/leaderboard.types.ts` and
  `apps/server/src/leaderboards/leaderboard.logic.ts` are locked.
- **No modification of WP-102 contract files.**
  `apps/server/src/profile/profile.routes.ts` and
  `apps/server/src/profile/profile.logic.ts` are locked.
- **No wiring of WP-102's `registerProfileRoutes`.** Per D-10202,
  WP-102's route registration is a separate follow-up. Wiring it
  here would be a "while I'm here" violation even though the
  `pg.Pool` introduced in this packet would also satisfy it.
- **No rate limiting.** Defense-in-depth rate limiting is deferred
  to a future hardening WP. The CDN edge in front of this server
  (Cloudflare for `cards.barefootbetters.com`) provides initial DDoS
  protection. A rate-limit WP must justify its dependency and gate
  itself separately.
- **No response caching.** `Cache-Control: no-store` on all responses
  in this packet (deterministic correctness over hit rate). A
  future caching WP may revisit; the WP-054 §Lifecycle Prohibition
  already names cache-control as that future WP's responsibility.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask
  the human before proceeding — never guess or invent field names,
  type shapes, or file paths.
- If WP-054 has not landed at execution time, this packet is
  **BLOCKED**. Do not stub WP-054's exports. Do not implement the
  library inline. Stop and surface the dependency gap.

**Locked contract values:**

- **Three endpoint paths (canonical):**
  - `GET /api/leaderboards/scenarios`
  - `GET /api/leaderboards/scenarios/:scenarioKey`
  - `GET /api/leaderboards/scores/:replayHash`

  No alternative paths, prefixes, or aliases are permitted. The
  `/api/` prefix matches the existing `/api/players/:handle/profile`
  precedent from WP-102.

- **Query-parameter defaults and bounds (for
  `GET /api/leaderboards/scenarios/:scenarioKey`):**
  - `limit`: default `25`, minimum `1`, maximum `100`
  - `offset`: default `0`, minimum `0`, maximum `10000`

  Out-of-range or non-integer values yield `400` with the structured
  error envelope below. The maxima are picked to bound a single
  response payload and prevent unbounded scans; they are not load
  guarantees. **Precedence:** if both `limit` and `offset` are
  invalid, the handler returns `400` based on the first detected
  error; error ordering is not user-significant and tests must not
  assume a specific ordering.

- **Array-value query policy (added in v1.1 per Patch 5):** Koa
  surfaces duplicate query params (e.g., `?limit=10&limit=20`) as
  `string[]`. The pagination parser accepts arrays of length 1
  (treats as that single value) and rejects arrays of any other
  length with `{ error: 'invalid_query', message: "Query parameter
  '<name>' must be a single integer." }`. This prevents a
  silent-pick footgun where Koa would otherwise pick a single
  value non-deterministically.

- **Path-parameter validation (added in v1.1 per Patch 4):** before
  any WP-054 call site, the handler validates path parameters as
  transport-level shape checks (NOT WP-054 logic):
  - Missing or empty `:scenarioKey` → `400 { error: 'invalid_query',
    message: 'Scenario key is required.' }`.
  - Missing or empty `:replayHash` → `400 { error: 'invalid_query',
    message: 'Replay hash is required.' }`.
  These checks live in the route layer per the same separation that
  keeps query parsing in the route layer; they are not WP-054
  validation.

- **Response status codes:**
  - `200` — success, body is the JSON projection
  - `400` — malformed query (invalid `limit` / `offset`)
  - `404` — `getPublicScoreByReplayHash` returned `null`
  - `500` — uncaught error path

  Note: `getScenarioLeaderboard` returns an empty leaderboard (not
  `404`) when PAR is missing or no eligible scores exist, per WP-054
  §Locked Contract Values fail-closed semantics.

- **Error envelope shape (locked, mirrors WP-102):**
  - `400` body: `{ "error": "invalid_query", "message": "<sentence>" }`
  - `404` body: `{ "error": "score_not_found" }`
  - `500` body: `{ "error": "internal_error" }`

  No stack trace, no internal exception detail, no SQL state, no
  pool diagnostics may appear in any response body.

- **`Cache-Control` header (locked, expanded per Patch 8 in v1.1):**
  `no-store` on **every response** in this packet — including the
  400 (invalid query, missing path param, array-value query),
  404 (score not found), and 500 (uncaught error) error paths.
  The `koaContext.set('Cache-Control', 'no-store')` call MUST be
  the first statement in every handler body, before any status
  assignment, body assignment, or `await` of WP-054 code, so a
  thrown exception in the WP-054 call still leaves the header set
  on the eventual 500 response. Test #8 asserts the header is set
  on at least one error path (400 from test #5) in addition to
  the success paths to lock the always-set discipline. Future
  caching policy is a separate WP.

- **`PRODUCTION_DEPENDENCIES` non-use (locked):** Handlers MUST NOT
  rely on WP-054's `PRODUCTION_DEPENDENCIES` default. Explicit
  injection of `{ checkParPublished: parGate.checkParPublished }`
  at every handler call site is required. Relying on the
  fail-closed default would silently empty every scenario response;
  this lock prevents a future "simplification" from reintroducing
  that failure mode.

- **Pool sizing (locked default):** `max: 10`, `idleTimeoutMillis:
  30000`, `connectionTimeoutMillis: 5000`. Override via env vars is
  out of scope; if production load demands tuning, a future WP owns
  it.

- **`legendary.*` namespace:** All tables live in `legendary.*`. This
  packet creates no new tables.

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via
deterministic reproduction and state inspection.

The following requirements are mandatory:

- Behavior introduced by this packet must be fully reproducible given:
  - identical database state
  - identical query parameters
  - identical request path

- Execution must be externally observable via deterministic response
  bodies. Invisible or implicit side effects are not permitted.

- This packet must not introduce any database state mutation. The
  only state introduced is the `pg.Pool` connection cache, which is
  process-local and discarded on shutdown.

- The following invariants must always hold after execution:
  - Identical request inputs produce identical response bodies
  - No competitive records are modified by any handler
  - No replay ownership records are modified by any handler
  - Private replays never appear in any response body
  - Scenarios without published PAR always return empty leaderboards
    (status `200` with `entries: []`), never `404` or `500`
  - `accountId`, `submissionId`, `email`, `authProvider`,
    `authProviderId`, `stateHash`, and `scoreBreakdown` never appear
    in any response body
  - `pg.Pool` is constructed exactly once per process
  - `pg.Pool.end()` is called exactly once on `SIGTERM`

- Failures attributable to this packet must be localizable via:
  - response status code mismatch against the locked status table, or
  - response body shape mismatch against the locked envelope, or
  - presence of any never-expose field in a response body, or
  - more than one `pg.Pool` construction observed at startup.

- Server startup logs **should** show exactly one Pool
  construction event (downgraded from "must" in v1.1 per Patch 9
  — the load-bearing invariant is the static-grep "exactly one
  `new Pool(...)` call across `apps/server/src/`" which is
  enforced as a hard gate; the runtime log is a debuggability aid,
  not an architectural invariant). If a log is emitted, it lives
  in the wiring layer (`apps/server/src/server.mjs`) right after
  the `createPool()` call rather than inside `database.ts`, which
  keeps `database.ts` pure of console output. The grep gate
  against `apps/server/src/` for `new Pool(` returning exactly
  one match remains the hard `must` invariant.
- **Pool-construction log message text (locked verbatim per
  copilot-check follow-up, 2026-05-01):** if the log is emitted
  in `server.mjs` after `createPool()`, the message text is
  `'[server] pg.Pool constructed (max=10)'` exactly. Future
  changes to the message text require explicit grep-impact
  analysis against any downstream observability WP that may
  greplog this string. The `[server]` prefix matches the existing
  `console.log('[server] ...')` pattern at `server.mjs:121, 124`
  (registry-loaded line and listening-on-port line). The
  `(max=10)` suffix is informational — it should track the
  locked Pool sizing values; if a future WP changes pool sizing,
  the log suffix is updated in the same commit and the new text
  becomes the new locked verbatim.

---

## Scope (In)

### A) `apps/server/src/db/database.ts` — new

A small module that owns the `pg.Pool` lifecycle.

- `import { Pool } from 'pg';`
- `export function createPool(): Pool` — constructs and returns a
  `pg.Pool` with the locked sizing values. Reads connection
  configuration from the environment via the same env-var contract
  the existing `apps/server/src/rules/loader.mjs` consumes (do not
  invent a new env-var name; if the rules loader uses
  `DATABASE_URL`, this module uses `DATABASE_URL`).
- `export async function closePool(pool: Pool): Promise<void>` —
  thin wrapper over `pool.end()` for symmetry and testability.
- `// why:` comment on `createPool`: a single long-lived Pool is the
  required pattern per `00.3 §8 Backend` ("`pg` pool used for all
  database connections (not a single client)"); per-request Pools
  exhaust connections and lose checkout semantics.
- `// why:` comment on the locked sizing: defaults chosen for a
  Render starter instance; production tuning is a future WP per
  §Locked Contract Values.

### B) `apps/server/src/leaderboards/leaderboard.routes.ts` — new

Mirror the structural shape of `apps/server/src/profile/profile.routes.ts`
verbatim — local `KoaRouter` and `KoaContext` interfaces, no direct
`@koa/router` import, no boardgame.io import, no engine import.

- Local interfaces:
  - `interface KoaLeaderboardContext { params: { scenarioKey?: string; replayHash?: string }; query: Record<string, string | string[] | undefined>; status: number; body: unknown; set(field: string, value: string): void }`
  - `interface KoaRouter { get(path: string, handler: (koaContext: KoaLeaderboardContext) => Promise<void> | void): unknown }`
  - `interface LeaderboardLogic { listScenarioKeys: typeof import('./leaderboard.logic.js').listScenarioKeys; getScenarioLeaderboard: typeof import('./leaderboard.logic.js').getScenarioLeaderboard; getPublicScoreByReplayHash: typeof import('./leaderboard.logic.js').getPublicScoreByReplayHash }`
- `export function registerLeaderboardRoutes(router: KoaRouter, database: Pool, parGate: ParGate, leaderboardLogic?: LeaderboardLogic): void`
  - Where `ParGate` is the existing JSDoc-typed object from
    `apps/server/src/par/parGate.mjs`; mirror via a local structural
    interface `{ checkParPublished: (scenarioKey: string) => ParGateHit | null }`
    rather than importing the JSDoc typedef (mirrors WP-054
    `LeaderboardDependencies` precedent).
  - **`leaderboardLogic?` is a test-only injection seam** (added in
    v1.1 per reviewer Patch 3). Production callers in `server.mjs`
    omit the 4th parameter; the handler resolves to the imported
    WP-054 functions (`listScenarioKeys`, `getScenarioLeaderboard`,
    `getPublicScoreByReplayHash`) at module-load time. Tests pass
    a fake object whose three methods return canned results,
    obviating any need to mock the WP-054 SQL shape. **Contract-safe:**
    optional parameter; default value is the imported binding;
    server.mjs continues to call `registerLeaderboardRoutes(server.router,
    pool, parGate)` with three args unchanged.
  - `// why:` comment on the optional fourth parameter: separating
    the route layer's transport contract (status codes, envelopes,
    headers, pagination parsing) from WP-054's SQL contract via this
    seam keeps the test suite logic-pure — tests assert
    envelope/status/header/pagination behavior without depending on
    WP-054's SQL row shapes; future WP-054 SQL changes don't churn
    these tests. Reviewer Patch 3 (2026-05-01) introduced the seam
    after the v1.0 draft's "no real DB" claim was found to require
    SQL-shape mocking that would be brittle to WP-054 internal
    changes.
- Three handlers, each:
  1. Sets `koaContext.set('Cache-Control', 'no-store')` first.
  2. Wraps the WP-054 call in `try/catch`; the catch block discards
     the value (mirrors WP-102 `void caughtError;` pattern) and
     returns `500` with `{ error: 'internal_error' }`.
  3. Returns the locked response envelope.
- Handler 1 — `GET /api/leaderboards/scenarios`:
  - Calls `listScenarioKeys(database)`.
  - Returns `200` with `{ scenarioKeys: string[] }`.
  - `// why:` comment on the handler: exposes the canonical list of
    scenario keys so clients can enumerate available leaderboards
    without prior registry knowledge — the discoverability seam
    that lets a leaderboard UI render a scenario picker without
    duplicating registry contents in the client bundle.
- Handler 2 — `GET /api/leaderboards/scenarios/:scenarioKey`:
  - **Validates `params.scenarioKey` is a non-empty string first**
    (added in v1.1 per Patch 4 — transport-level shape validation,
    not WP-054 logic). On `undefined` or empty string, returns `400`
    with `{ error: 'invalid_query', message: 'Scenario key is required.' }`.
  - Parses `query.limit` and `query.offset` via a local pure helper
    `parsePaginationQuery(query): { limit: number; offset: number } | { error: string }`.
    The helper rejects non-integer, negative, or out-of-range values
    with a full-sentence error message; the handler returns `400`
    with `{ error: 'invalid_query', message: <sentence> }`.
  - **Array-value policy (added in v1.1 per Patch 5):** if either
    `query.limit` or `query.offset` is a `string[]` (Koa surfaces
    duplicate query params as arrays — e.g.,
    `?limit=10&limit=20`), the helper accepts arrays of length 1
    (treating as that single value) and rejects arrays of any
    other length with `{ error: 'invalid_query', message:
    "Query parameter '<name>' must be a single integer." }`. This
    prevents the silent-pick footgun where Koa would otherwise
    silently keep the last (or first) value depending on Node
    version.
  - Builds `LeaderboardQueryOptions` from `params.scenarioKey` and
    the parsed pagination.
  - Calls `getScenarioLeaderboard(options, database, { checkParPublished: parGate.checkParPublished })`
    (or, when the test injection seam is active, the fake
    `leaderboardLogic.getScenarioLeaderboard`).
  - Returns `200` with the `ScenarioLeaderboard` directly as the
    body. Empty results (no PAR, no eligible scores) still return
    `200` with `entries: []` per WP-054 fail-closed semantics.
  - `// why:` comment on the explicit `deps` injection: the handler
    must pass the bound `parGate.checkParPublished` rather than
    rely on `PRODUCTION_DEPENDENCIES` (which fail-closes to `null`
    by design); WP-054's PRODUCTION_DEPENDENCIES is a safety
    default for callers that have not yet wired the gate.
- Handler 3 — `GET /api/leaderboards/scores/:replayHash`:
  - **Validates `params.replayHash` is a non-empty string first**
    (added in v1.1 per Patch 4). On `undefined` or empty string,
    returns `400` with `{ error: 'invalid_query', message:
    'Replay hash is required.' }`.
  - Calls `getPublicScoreByReplayHash(params.replayHash, database)`.
  - Returns `200` with the `PublicLeaderboardEntry` on hit, or `404`
    with `{ error: 'score_not_found' }` on `null`.
- `// why:` comment on the file-level: this module is a thin Koa
  adapter — all leaderboard logic lives in `leaderboard.logic.ts`
  per WP-054. The route layer parses query strings, applies status
  codes, and serializes envelopes; nothing else.

### C) `apps/server/src/server.mjs` — modified

Three surgical changes, each independently reviewable:

1. Import `createPool` from `./db/database.js` and
   `registerLeaderboardRoutes` from
   `./leaderboards/leaderboard.routes.js`.
2. Inside `startServer()`, replace `void parGate;` with code that
   constructs the pool via `createPool()`, registers the leaderboard
   routes after `registerHealthRoute(server.router)`:
   ```
   const pool = createPool();
   registerLeaderboardRoutes(server.router, pool, parGate);
   ```
   Add a `// why:` comment noting that the pool's lifetime is the
   process lifetime, that close-on-SIGTERM is owned by `index.mjs`,
   and that `parGate` is now bound (no longer dangling per the
   pre-existing `void parGate;` placeholder).
3. Return `{ appServer, pool }` instead of `appServer` so
   `index.mjs` can attach `closePool(pool)` to the SIGTERM path.

No other behavior in `server.mjs` changes — registry load, rules
load, parGate construction, CORS, port binding, and the existing
`/health` route are unmodified.

### D) `apps/server/src/index.mjs` — modified

One surgical change: the SIGTERM handler must call `closePool(pool)`
**only after the HTTP server's `close()` callback or promise
resolves** — i.e., only once boardgame.io has signaled that no
in-flight requests remain. The exact implementation depends on the
existing SIGTERM shape; reference WP-004's structure and add the
pool-close as the last step before `process.exit(0)`. Add a `// why:`
comment explaining that closing the pool before HTTP shutdown
resolves would sever in-flight handlers mid-query.

### E) Tests — `apps/server/src/leaderboards/leaderboard.routes.test.ts` — new

Uses `node:test` and `node:assert` only. No boardgame.io import. No
HTTP listener. No real `pg.Pool` connection. **No SQL-shape mocks
required** (per the §Scope (In) B optional `leaderboardLogic?`
injection seam introduced in v1.1 reviewer Patch 3 — tests pass a
fake `LeaderboardLogic` object whose three methods return canned
results, completely sidestepping WP-054's SQL row shapes).

All tests live in **one** `describe('leaderboard routes (WP-115)', ...)`
block (mirrors WP-054 / WP-101 / WP-102 single-describe convention).

A minimal mock router captures registered handlers; tests invoke
each handler with a hand-built mock `koaContext` (matching the
locally-declared `KoaLeaderboardContext` shape) and a hand-built
fake `leaderboardLogic` whose three methods (`listScenarioKeys`,
`getScenarioLeaderboard`, `getPublicScoreByReplayHash`) return
canned results that exercise each branch. The `database` parameter
is passed through as a sentinel object since the fake never uses
it; `parGate` is a fake whose `checkParPublished` returns a
sentinel `ParGateHit | null` for the deps-injection assertion.

- Eight tests:
  1. **Drift / surface assertion (logic-pure, no DB):** the module
     exports exactly one symbol, `registerLeaderboardRoutes`, and
     calling it with a mock router + fake `leaderboardLogic`
     registers exactly three GET handlers at the three locked
     paths in the locked order.
  2. `GET /api/leaderboards/scenarios` returns `200` with
     `{ scenarioKeys: [...] }` when the fake's `listScenarioKeys`
     returns a non-empty array.
  3. `GET /api/leaderboards/scenarios` returns `200` with
     `{ scenarioKeys: [] }` when the fake's `listScenarioKeys`
     returns `[]`.
  4. `GET /api/leaderboards/scenarios/:scenarioKey` returns `200`
     with the `ScenarioLeaderboard` when the fake's
     `getScenarioLeaderboard` returns canned data; the response
     body's `entries` length matches the `limit` query parameter
     applied client-side by the handler.
  5. `GET /api/leaderboards/scenarios/:scenarioKey` returns `400`
     with `{ error: 'invalid_query', message: <sentence> }` for each
     of: non-integer `limit`, `limit=0`, `limit=101`, negative
     `offset`, `offset=10001`, `limit` as a multi-value array
     (e.g., `?limit=10&limit=20`), missing `params.scenarioKey`
     (the path-param is `undefined`), and (for handler 3 invoked
     in the same test, sharing the assertion harness) missing
     `params.replayHash`. **Eight sub-assertions in one test**
     (five original pagination cases per v1.0 + one array-limit
     case per Patch 5 + two missing-path-param cases per Patch 4).
     Cache-Control assertion (Patch 8) is folded into test #8;
     this test asserts only the status code + envelope shape.
  6. `GET /api/leaderboards/scenarios/:scenarioKey` returns `200`
     with `entries: []` when the fake's `getScenarioLeaderboard`
     returns an empty leaderboard (fail-closed PAR-missing path)
     — confirms the handler does not translate empty results to
     `404`.
  7. `GET /api/leaderboards/scores/:replayHash` returns `200` with
     the entry on hit (fake returns a `PublicLeaderboardEntry`),
     and `404` with `{ error: 'score_not_found' }` on `null`
     (fake returns `null`).
  8. **Cache header assertion (logic-pure, expanded per Patch 8):**
     every handler invocation — including the error paths
     (400 from test #5, 404 from test #7, 500 simulated by a fake
     that throws) — sets `Cache-Control: no-store` before
     returning. A direct `set()` mock captures the call and
     asserts the value AND the call ordering (header before
     status/body).

All eight tests are logic-pure — they use a fake `leaderboardLogic`
object plus mock `database` / `parGate` / `koaContext` and never
touch the network or PostgreSQL. No `hasTestDatabase` skip pattern
is needed because no test requires a DB. **The injection seam from
Patch 3 means the test suite is decoupled from WP-054's SQL shape
entirely** — future WP-054 internal changes don't churn these
tests.

---

## Out of Scope

- **No score submission, no replay verification, no replay
  re-execution.** That is WP-053 / WP-103.
- **No leaderboard library logic.** That is WP-054 — its three
  helpers are imported and wrapped, not modified.
- **No WP-102 profile route wiring.** Per D-10202 and the explicit
  packet-specific constraint above, `registerProfileRoutes` from
  `apps/server/src/profile/profile.routes.ts` is **not** invoked in
  this WP. A separate one-line follow-up WP wires it. The
  `pg.Pool` introduced here is the lifecycle anchor that follow-up
  needs, but consuming it is not this packet's responsibility.
- **No rate limiting.** Edge / CDN handles initial DDoS; defense-in-
  depth rate limiting is a future hardening WP that owns the
  `koa-ratelimit` (or equivalent) dependency justification.
- **No response caching.** Locked `Cache-Control: no-store`. A
  future caching WP may revisit per WP-054 §Lifecycle Prohibition.
- **No CORS changes.** The existing `Server({ origins: [...] })`
  list in `server.mjs` is inherited unchanged. If the
  `arena-client` production origin is missing from that list, that
  is a separate WP.
- **No new database migrations, no new tables, no new indexes.**
  Index tuning for `(scenario_key, final_score, created_at)` was
  deferred by WP-054 to a future performance WP and remains out of
  scope here.
- **No authentication, no admin surface, no `/api/admin/*` paths.**
  All endpoints are anonymous public reads.
- **No structured logging framework.** Existing `console.log` /
  `console.error` is matched. Observability tooling is a future WP.
- **No UI rendering, no `arena-client` modifications, no
  `registry-viewer` modifications.** This packet is server-only;
  the leaderboard UI WP is a separate Client-layer packet.
- **No engine imports, no boardgame.io imports.** The Koa router is
  reached structurally via the route file's local `KoaRouter`
  interface (mirrors WP-102 PS-1).
- Refactors, cleanups, or "while I'm here" improvements are **out
  of scope** unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `apps/server/src/db/database.ts` — **new** — `createPool` +
  `closePool` over `pg.Pool` with locked sizing
- `apps/server/src/leaderboards/leaderboard.routes.ts` — **new** —
  Koa adapter for WP-054's three helpers + pagination parser
- `apps/server/src/leaderboards/leaderboard.routes.test.ts` —
  **new** — `node:test` coverage (8 tests, all logic-pure)
- `apps/server/src/server.mjs` — **modified** — construct `pool`,
  bind `parGate`, register leaderboard routes, return
  `{ appServer, pool }`
- `apps/server/src/index.mjs` — **modified** — call `closePool(pool)`
  in the SIGTERM handler after HTTP shutdown
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — replace the
  three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows wholesale
  with `Wired` rows; replace WP-054's three `Library-only` rows
  wholesale with `Wired` rows whose `Path` columns are filled in
  for the HTTP surface. Per D-11804 replace-whole-row merge
  semantics; partial-column updates are FAIL. **Added in v1.1
  per §API Catalog Update Obligation.**

No other files may be modified.

Plus governance close-out (per the recent WP-122 / WP-123 / WP-124
/ WP-125 precedent — ledger updates land in the same commit as the
production files, not a separate close-out commit unless §19
Bridge-vs-HEAD reconciliation is required):

- `docs/ai/STATUS.md` — execution entry at top of `## Current
  State`.
- `docs/ai/DECISIONS.md` — at minimum: D-115NN entries for Pool
  location, sizing rationale, rate-limit deferral,
  `Cache-Control: no-store` v1 lock, profile-route wiring
  still-deferred (D-10202 reaffirmation), and the catalog-row
  replacement under D-11804.
- `docs/ai/work-packets/WORK_INDEX.md` WP-115 row checked off
  with date + commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` EC-119 row flipped
  Draft → Done.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Pool Lifecycle
- [ ] `apps/server/src/db/database.ts` exports `createPool` and
      `closePool`
- [ ] Exactly one `new Pool(...)` call exists across the entire
      `apps/server/src/` tree (confirmed with `Select-String`)
- [ ] `closePool(pool)` is invoked from the SIGTERM handler in
      `index.mjs` after the HTTP server's graceful-shutdown step

### Routes
- [ ] `registerLeaderboardRoutes` registers exactly three handlers
      at the three locked paths in the locked order
- [ ] `Cache-Control: no-store` is set on every response (confirmed
      by test 8)
- [ ] No handler ever sets a status code outside `{200, 400, 404, 500}`

### Response Bodies
- [ ] No response body contains any of: `accountId`, `submissionId`,
      `email`, `authProvider`, `authProviderId`, `stateHash`,
      `scoreBreakdown` (confirmed with `Select-String` against the
      route file)
- [ ] `404` body shape is exactly `{ "error": "score_not_found" }`
- [ ] `400` body shape is exactly
      `{ "error": "invalid_query", "message": <string> }`
- [ ] `500` body shape is exactly `{ "error": "internal_error" }`
      and contains no stack trace, SQL state, or exception text

### Pagination
- [ ] `limit` defaults to `25`; rejects non-integer, `<1`, or `>100`
      with `400`
- [ ] `offset` defaults to `0`; rejects non-integer, `<0`, or
      `>10000` with `400`

### Layer Boundary
- [ ] No imports from `packages/game-engine/` runtime in any file
      in scope (type-only imports already permitted by WP-054 are
      not re-introduced here)
- [ ] No `boardgame.io` import in `leaderboard.routes.ts` or
      `database.ts`
- [ ] No imports from `apps/server/src/competition/competition.logic.ts`
- [ ] No `requireAuthenticatedSession` import in any file in scope
- [ ] No Hanko / auth-broker reference in any file in scope
- [ ] No `apps/registry-viewer/` or `apps/arena-client/` files
      modified

### Dependency Discipline
- [ ] No new entries in `apps/server/package.json` `dependencies`
      or `devDependencies` (`pg` and `boardgame.io` already present;
      no `koa-ratelimit`, `koa-bodyparser`, `express`, `fastify`, or
      `cors` added)
- [ ] No `require()` in any new or modified file
- [ ] No `Math.random` in any new or modified file

### WP-054 / WP-102 Contract Lock
- [ ] `apps/server/src/leaderboards/leaderboard.types.ts` unmodified
      (`git diff` clean)
- [ ] `apps/server/src/leaderboards/leaderboard.logic.ts` unmodified
- [ ] `apps/server/src/profile/profile.routes.ts` unmodified
- [ ] `apps/server/src/profile/profile.logic.ts` unmodified
- [ ] `registerProfileRoutes` is **not** called from `server.mjs`
      (confirmed with `Select-String`)

### Tests
- [ ] All 8 tests pass (all logic-pure; no `hasTestDatabase` skip
      pattern used)
- [ ] Test file uses `.test.ts` extension
- [ ] Tests use `node:test` and `node:assert` only
- [ ] No `boardgame.io` import in the test file
- [ ] All 8 tests live inside one `describe('leaderboard routes (WP-115)', …)`
      block

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] No SQL write operations (`INSERT`, `UPDATE`, `DELETE`,
      `CREATE`, `DROP`, `ALTER`) anywhere in scope
- [ ] WP-054 / WP-053 / WP-053a / WP-052 / WP-051 contract files
      unmodified

### API Catalog (per `00.3 §21` + D-11804 — added in v1.1)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated in the same
      commit that lands the route registration (D-11804
      same-commit constraint).
- [ ] WP-054's three `Library-only` rows
      (`getScenarioLeaderboard`, `getPublicScoreByReplayHash`,
      `listScenarioKeys`) are transitioned wholesale to `Wired`
      rows: `Status` flips `Library-only` → `Wired`; `Method`
      `(n/a)` → `GET`; `Path` `(n/a — function …)` → the locked
      endpoint path; `Auth` `(n/a — caller-injected …)` →
      `guest`; `Authorizing WP` flips to `WP-115`. Per the
      catalog-row interpretation lock in §API Catalog Update
      Obligation, this is a single-row graduation, not a
      duplicate-row insertion.
- [ ] The three `Pending: WP-115 (STUB DRAFT 2026-04-29)` rows
      previously at lines 173–185 of `api-endpoints.md` are
      **deleted** (they were forward-references; the underlying
      network surface is now fully described by the
      `Library-only → Wired` graduations above, and retaining
      `Pending` rows would duplicate the surface entries).
      Confirmed with `Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Pending: WP-115"` returning no matches.
- [ ] Net catalog row delta: −3 `Pending` rows, −3 `Library-only`
      rows for these functions, +3 `Wired` rows for the three
      endpoints. End state: exactly three rows total describing
      the leaderboard surface, all in the `## Wired` section.
- [ ] All transitioned rows are complete-row deletion +
      complete-row insertion in the diff (no in-row column
      edits) per D-11804 replace-whole-row merge semantics.
- [ ] Every transitioned row's `Status` column carries exactly
      one of `Wired | Shipped-but-unwired | Library-only |
      Pending` (closed set per `00.3 §21.2` — FAIL on any other
      string).
- [ ] Every transitioned row's `Auth` column carries exactly
      `guest` (closed set `guest | handle-required |
      authenticated-session-required` per D-9905; only `guest`
      is valid for this WP per §Vision Alignment "anonymous
      access").
- [ ] Every field name in a transitioned row's `Request Schema` /
      `Response Schema` columns matches the canonical spelling
      in `docs/ai/REFERENCE/00.2-data-requirements.md` exactly
      (`replayHash`, `scenarioKey`, etc.). Spelling drift is
      FAIL.
- [ ] No transitioned row's `Notes` column references unmerged WP
      branches, side-branch commit hashes, or any string outside
      the catalog-format conventions established by WP-118.

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run server tests
pnpm --filter "@legendary-arena/server" test
# Expected: server baseline (post-WP-054) → +8 tests / +1 suite, 0 failing

# Step 3 — run engine tests (must be unchanged)
pnpm --filter "@legendary-arena/game-engine" test
# Expected: engine baseline tests 604 / suites 132 / pass 604 / fail 0 unchanged

# Step 4 — confirm exactly one Pool construction
Select-String -Path "apps\server\src" -Pattern "new Pool\(" -Recurse
# Expected: exactly one match, in apps/server/src/db/database.ts

# Step 5 — confirm no never-expose fields appear in route file
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts" -Pattern "accountId|submissionId|email|authProvider|stateHash|scoreBreakdown"
# Expected: no output

# Step 6 — confirm no boardgame.io import in route file or db file
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "from .['\"]boardgame\.io"
# Expected: no output

# Step 7 — confirm no engine runtime import in scope files
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "@legendary-arena/game-engine"
# Expected: no output

# Step 8 — confirm no SQL write operations in scope
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "INSERT |UPDATE |DELETE |CREATE |DROP |ALTER "
# Expected: no output

# Step 9 — confirm WP-102 profile route is not wired in this WP
Select-String -Path "apps\server\src\server.mjs" -Pattern "registerProfileRoutes"
# Expected: no output (WP-102 wiring stays deferred per D-10202)

# Step 10 — confirm no auth references in scope
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "requireAuthenticatedSession|hanko|@anthropic|jwt"
# Expected: no output

# Step 11 — confirm no forbidden routing libs added
Select-String -Path "apps\server\package.json" -Pattern "express|fastify|cors|koa-ratelimit|koa-bodyparser|axios|node-fetch"
# Expected: no output

# Step 12 — confirm WP-054 / WP-102 contract files unmodified
git diff apps/server/src/leaderboards/leaderboard.types.ts apps/server/src/leaderboards/leaderboard.logic.ts apps/server/src/profile/
# Expected: no changes

# Step 13 — confirm no require() in any new or modified file
Select-String -Path "apps\server\src\leaderboards\leaderboard.routes.ts","apps\server\src\db\database.ts" -Pattern "require\("
# Expected: no output

# Step 14 — confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change (six
# production / governance files plus the four governance ledgers
# STATUS.md / DECISIONS.md / WORK_INDEX.md / EC_INDEX.md)

# Step 15 — confirm api-endpoints.md no longer carries Pending: WP-115 rows
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "Pending: WP-115"
# Expected: no output (D-11804 replace-whole-row applied)

# Step 16 — confirm api-endpoints.md carries the three new Wired rows for WP-115
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/leaderboards/scenarios"
# Expected: at least three matches (the three endpoint paths now in Wired rows)
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/leaderboards/scores"
# Expected: at least one match

# Step 17 — confirm closed-set Status taxonomy compliance
# (every catalog row's Status column carries exactly one of the four locked values)
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "^\| ``Wired``|^\| ``Shipped-but-unwired``|^\| ``Library-only``|^\| ``Pending"
# Expected: this is informational — manually verify no row carries any other Status string

# Step 18 — confirm closed-set Auth taxonomy compliance per D-9905
# (every catalog row's Auth column carries exactly one of the three locked values)
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "``guest``|``handle-required``|``authenticated-session-required``"
# Expected: matches present; manually verify no row carries any other Auth string
```

---

## Definition of Done

> Claude Code must execute every verification command in
> `## Verification Steps` before checking any item below. Reading the
> code is not sufficient — run the commands.
>
> Every item must be true before this packet is considered complete.

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 (post-WP-054
      baseline + 8 tests / +1 suite)
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (engine
      baseline unchanged)
- [ ] Exactly one `new Pool(...)` call across `apps/server/src/`
- [ ] `closePool(pool)` invoked in SIGTERM handler in `index.mjs`
- [ ] No never-expose fields in `leaderboard.routes.ts`
- [ ] No `boardgame.io`, no engine runtime, no `requireAuthenticatedSession`
      import in scope files
- [ ] WP-054 / WP-053 / WP-053a / WP-052 / WP-051 / WP-102 contract
      files unmodified (`git diff` clean across each)
- [ ] `registerProfileRoutes` is not called from `server.mjs` (WP-102
      wiring stays deferred per D-10202)
- [ ] No new npm dependencies in `apps/server/package.json`
- [ ] No `require()`, no `Math.random` in any new or modified file
- [ ] No SQL write operations anywhere in scope
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] `docs/ai/STATUS.md` updated — public leaderboard endpoints
      live; `/api/leaderboards/scenarios`,
      `/api/leaderboards/scenarios/:scenarioKey`,
      `/api/leaderboards/scores/:replayHash` reachable; long-lived
      `pg.Pool` introduced; WP-102 profile route wiring still
      deferred (separate follow-up)
- [ ] `docs/ai/DECISIONS.md` updated — at minimum: why the `pg.Pool`
      lives in `apps/server/src/db/`; why pool sizing defaults are
      what they are; why rate limiting is deferred to a future
      hardening WP; why `Cache-Control: no-store` is locked for v1;
      why WP-102's profile route is **not** wired here despite the
      `pg.Pool` becoming available; **D-11804 replace-whole-row
      semantics applied to the three `Pending: WP-115` and three
      WP-054 `Library-only` rows in `api-endpoints.md`** (added in
      v1.1)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-115 row added (if
      not already present at draft time) and checked off with
      today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-119 row
      flipped Draft → Done with today's date
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated in the same
      commit per `00.3 §21` + D-11804 (added in v1.1; see §API
      Catalog Update Obligation for the full requirement set)
