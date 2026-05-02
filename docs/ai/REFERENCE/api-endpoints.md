# HTTP API Endpoints — Authoritative Catalog

> Authoritative catalog of every HTTP endpoint exposed (or coded but not yet
> exposed) by `apps/server`, plus every library function reachable via direct
> import from `apps/server/src/**` that future request-handler WPs may
> graduate to an HTTP route. Created by
> [WP-118](../work-packets/WP-118-http-api-surface-catalog.md) (single `SPEC:`
> commit, 2026-04-30) per `D-11801`..`D-11804` in
> [`DECISIONS.md`](../DECISIONS.md).

**Primary audience.** Future Work Packet authors first; client developers may
read this directly until OpenAPI tooling lands; ops should consult
[`apps/server/src/server.mjs`](../../../apps/server/src/server.mjs) for
ground truth on what is currently registered with the boardgame.io Koa
router. The catalog is descriptive, not prescriptive — it records the
shipped, deferred, library-only, and pending HTTP surface as of catalog
write time and is updated by every endpoint-touching WP per the D-11804
update obligation.

---

## Status Taxonomy (Closed Set)

Every catalog row carries exactly one of the following four `Status` values.
Any other string is FAIL under both lint §21 and the
[`.claude/rules/work-packets.md`](../../../.claude/rules/work-packets.md)
catalog-update rule.

| Status | Meaning |
|---|---|
| `Wired` | Route registered in `apps/server/src/server.mjs` (or via boardgame.io built-ins surfaced by `Server({games:[LegendaryGame]})`) and reachable over HTTP today. |
| `Shipped-but-unwired` | Handler code exists in `apps/server/src/**` and exports a `register*Routes(...)`-style function, but route registration is deferred per a `DECISIONS.md` entry (e.g., `D-10202` for the WP-102 profile route awaiting long-lived `pg.Pool`). |
| `Library-only` | Function exists in `apps/server/src/**` with no HTTP surface planned in the originating WP. May graduate to `Wired` via a future request-handler WP, or may remain library-only by design (e.g., WP-103 replay helpers — WP-103 §Out of Scope explicitly forbids HTTP exposure). Each `Library-only` row cites either the originating WP's intentional choice or the deferral decision. |
| `Pending` | Drafted in a future WP that has not yet executed (e.g., WP-115 leaderboard endpoints). The row names both the drafting WP and its current state at catalog-write time, formatted `Pending: WP-NNN (STATE YYYY-MM-DD)`. When the drafting WP executes, its commit replaces these rows per D-11804 replace-whole-row merge semantics. |

---

## Auth Taxonomy (Closed Set per D-9905)

Every catalog row's `Auth` column carries exactly one of the following three
values. Any other string is FAIL under lint §21 closed-set verification.

| Auth | Meaning |
|---|---|
| `guest` | Endpoint accepts unauthenticated requests; no session token required. The current shipped surface (boardgame.io built-ins, `/health`, the deferred profile route) is `guest`. |
| `handle-required` | Endpoint requires a claimed handle (per WP-101) on the requesting account; session validation is performed by the future `requireAuthenticatedSession` middleware (WP-112 deferral). No endpoint uses this value today. |
| `authenticated-session-required` | Endpoint requires a validated Hanko session (per D-9905) on the requesting account; session validation is performed by the future `requireAuthenticatedSession` middleware (WP-112 deferral). No endpoint uses this value today. |

---

## Catalog Format (per D-11801 = A)

Each endpoint group below is a Markdown table with the following columns,
in this order: `Status`, `Method`, `Path`, `Auth`, `Request Schema (file
ref)`, `Response Schema (file ref)`, `Authorizing WP`, `Notes`. Canonical
field-name spellings (`accountId`, `handle`, `matchId`, `replayHash`, etc.)
match [`docs/ai/REFERENCE/00.2-data-requirements.md`](00.2-data-requirements.md)
exactly; any divergence is FAIL under lint §21 canonical-field-name
verification.

---

## Error Contract (per D-11802 = C)

The catalog records two distinct error-response contracts, one per
ownership domain:

1. **boardgame.io built-in lobby endpoints** — error semantics are owned by
   the upstream `boardgame.io` framework. The catalog documents them
   descriptively only and never reshapes them; any divergence is recorded
   as a `Drift:` annotation, not normalized in WP-118.
2. **Project-owned handlers** — error responses use the project-specific
   shape `{ code: string, message: string, requestId?: string }`. The
   `requestId` field is `conditional-on-server-trace-injection`: present
   on every project-owned endpoint once a future request-handler WP lands
   request-ID middleware; absent until then; never both present-on-some
   and absent-on-others within the same release.

---

## Versioning Policy (per D-11803 = B)

Endpoints live at their natural path with no `/v1/` prefix and no
header-based content negotiation. The catalog itself is the contract: every
consumer reads the relevant catalog row to learn the current shape.
Breaking changes require a coordinated client + server release plus a
`Drift:` annotation in the affected catalog row plus a corresponding
`DECISIONS.md` entry justifying the break.

---

## Update Obligation (per D-11804 = C)

Every Work Packet that adds, modifies, removes, or changes the status of an
HTTP endpoint or a library function reachable via direct import from
`apps/server/src/**` MUST update this catalog in the same commit, replacing
the **entire** affected row (no partial-column updates). Status transitions
(e.g., a `Pending` placeholder row → `Wired` when the drafting WP executes)
are full-row replacements, never field-level edits. Enforcement is
duplicated across:

- [`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §21`](00.3-prompt-lint-checklist.md) — catches at WP-draft time during the Lint Gate.
- [`.claude/rules/work-packets.md`](../../../.claude/rules/work-packets.md) — catches during execution.

Both gates encode the replace-whole-row constraint per D-11804 merge
semantics. A future API-touching WP that slips past one gate is still
caught by the other.

---

## `Wired` — Reachable Over HTTP Today

### Server-Registered Routes

| Status | Method | Path | Auth | Request Schema (file ref) | Response Schema (file ref) | Authorizing WP | Notes |
|---|---|---|---|---|---|---|---|
| `Wired` | `GET` | `/health` | `guest` | (none — empty body) | `{ status: 'ok' }` literal at [`apps/server/src/server.mjs:31-33`](../../../apps/server/src/server.mjs) | WP-004 (server bootstrap) | Render health-check + `pnpm check` target. Registered via `registerHealthRoute(server.router)` at [`apps/server/src/server.mjs:120`](../../../apps/server/src/server.mjs); definition at [`apps/server/src/server.mjs:30-34`](../../../apps/server/src/server.mjs). |
| `Wired` | `GET` | `/api/leaderboards/scenarios` | `guest` | (none — empty body) | `{ scenarioKeys: string[] }` per [`apps/server/src/leaderboards/leaderboard.routes.ts`](../../../apps/server/src/leaderboards/leaderboard.routes.ts); on uncaught error returns `500` with body `{ "error": "internal_error" }` (project-owned envelope per D-11802 = C; literal shape locked at WP-115 v1.0 §Locked contract values) | WP-115 (public leaderboard endpoints) | Discoverability seam — returns the deduplicated set of `scenarioKey` values present in `legendary.competitive_scores` so clients can enumerate available leaderboards without prior registry knowledge. Wraps WP-054 `listScenarioKeys(database)` at [`apps/server/src/leaderboards/leaderboard.logic.ts:281`](../../../apps/server/src/leaderboards/leaderboard.logic.ts). Registered via `registerLeaderboardRoutes(server.router, pool, parGate)` in [`apps/server/src/server.mjs`](../../../apps/server/src/server.mjs). `Cache-Control: no-store` set as the first statement of every response (including 500 error paths per WP-115 v1.1 Patch 8). Status-code domain locked to `{200, 500}` for this handler. |
| `Wired` | `GET` | `/api/leaderboards/scenarios/:scenarioKey` | `guest` | `:scenarioKey` path param (required, non-empty); query params `limit` (default 25, range 1–100, integer) and `offset` (default 0, range 0–10000, integer); duplicate query params (Koa `string[]`) accepted only for arrays of length 1 per WP-115 v1.1 Patch 5 | `ScenarioLeaderboard` `{ scenarioKey, entries: PublicLeaderboardEntry[], totalEligibleEntries }` per WP-054 contract at [`apps/server/src/leaderboards/leaderboard.types.ts:107-111`](../../../apps/server/src/leaderboards/leaderboard.types.ts); on missing path param or malformed `limit` / `offset` returns `400` with body `{ "error": "invalid_query", "message": <sentence> }` (per WP-115 v1.1 Patches 4 / 5); on uncaught error returns `500` with body `{ "error": "internal_error" }` (project-owned envelope per D-11802 = C; literal shapes locked at WP-115 v1.0 §Locked contract values) | WP-115 (public leaderboard endpoints) | Per-scenario score list with PAR fail-closed semantics inherited from WP-054. Wraps `getScenarioLeaderboard(options, database, deps)` at [`apps/server/src/leaderboards/leaderboard.logic.ts:151`](../../../apps/server/src/leaderboards/leaderboard.logic.ts) with explicit `deps: { checkParPublished: parGate.checkParPublished }` injection at every call site (WP-054 `PRODUCTION_DEPENDENCIES` default fail-closes scenarios to empty by design). Empty leaderboard (no PAR or no eligible scores) returns `200` with `entries: []`, never `404`. `Cache-Control: no-store` set as the first statement of every response (including 400 / 500 error paths per WP-115 v1.1 Patch 8). Status-code domain locked to `{200, 400, 500}` for this handler. Sensitive fields (`accountId`, `submissionId`, `email`, `authProvider`, `authProviderId`, `stateHash`, `scoreBreakdown`) are stripped at the WP-054 type boundary (`PublicLeaderboardEntry`) per D-5201 and never re-introduced at the route layer. |
| `Wired` | `GET` | `/api/leaderboards/scores/:replayHash` | `guest` | `:replayHash` path param (required, non-empty; verbatim spelling per `00.2-data-requirements.md`) | `PublicLeaderboardEntry` per WP-054 contract at [`apps/server/src/leaderboards/leaderboard.types.ts:84-94`](../../../apps/server/src/leaderboards/leaderboard.types.ts); on miss returns `404` with body `{ "error": "score_not_found" }`; on missing path param returns `400` with body `{ "error": "invalid_query", "message": "Replay hash is required." }`; on uncaught error returns `500` with body `{ "error": "internal_error" }` (project-owned envelope per D-11802 = C; literal shapes locked at WP-115 v1.0 §Locked contract values) | WP-115 (public leaderboard endpoints) | Single-score detail via cryptographic replay-hash permalink. Wraps `getPublicScoreByReplayHash(replayHash, database)` at [`apps/server/src/leaderboards/leaderboard.logic.ts:238`](../../../apps/server/src/leaderboards/leaderboard.logic.ts); WP-054 returns `null` on miss, this route translates to `404` with the locked envelope. Visibility filter (`visibility IN ('public', 'link')`) inherited from WP-054 — private replays never surface. Returned entry's `rank` field is `0` per WP-054 single-record sentinel (callers wanting rank context call `getScenarioLeaderboard` instead). `Cache-Control: no-store` set as the first statement of every response (including 400 / 404 / 500 error paths per WP-115 v1.1 Patch 8). Status-code domain locked to `{200, 400, 404, 500}` for this handler. |

### boardgame.io Built-In Lobby Endpoints

These endpoints are registered by `Server({games:[LegendaryGame]})` at
[`apps/server/src/server.mjs:110-118`](../../../apps/server/src/server.mjs).
Their request and response shapes are owned by the upstream `boardgame.io`
framework; this catalog documents them descriptively only. The CLI clients
under `apps/server/scripts/{create-match,list-matches,join-match}.mjs` are
the de-facto contract today (per `.claude/rules/server.md` §"CLI Scripts" —
they are clients of the catalog, not catalog entries).

| Status | Method | Path | Auth | Request Schema (file ref) | Response Schema (file ref) | Authorizing WP | Notes |
|---|---|---|---|---|---|---|---|
| `Wired` | `POST` | `/games/legendary-arena/create` | `guest` | boardgame.io match-create payload (`{ numPlayers, setupData: MatchSetupConfig }` per [`docs/ai/ARCHITECTURE.md` §"Match Lifecycle"](../ARCHITECTURE.md)) | `{ matchID }` per boardgame.io defaults | WP-011 (match creation / lobby flow) | Error semantics owned by boardgame.io (per D-11802 = C). The `setupData` payload is the 9-field `MatchSetupConfig` per `00.2 §8.1`; canonical field names (`schemeId`, `mastermindId`, etc.) match `00.2` verbatim. |
| `Wired` | `GET` | `/games/legendary-arena` | `guest` | Query params per boardgame.io defaults | `{ matches: [...] }` per boardgame.io defaults | WP-012 (match list / join / reconnect) | List of active matches. Error semantics owned by boardgame.io (per D-11802 = C). Consumed by `apps/server/scripts/list-matches.mjs` and the arena-client lobby. |
| `Wired` | `POST` | `/games/legendary-arena/{matchID}/join` | `guest` | `{ playerID, playerName }` per boardgame.io defaults | `{ playerCredentials }` per boardgame.io defaults | WP-011 (match creation), WP-012 (join / reconnect) | Players join via this built-in. Error semantics owned by boardgame.io (per D-11802 = C). After join the match begins in the `lobby` phase per [`docs/ai/ARCHITECTURE.md`](../ARCHITECTURE.md). |
| `Wired` | (boardgame.io built-ins as surfaced by `Server({...})` — `leave`, `playAgain`, etc. if present) | (per `Server({...})` defaults) | `guest` | per boardgame.io defaults | per boardgame.io defaults | boardgame.io built-in (no project WP authorized them explicitly) | Any additional built-ins surfaced by the verification grep (Step 2) at execution time of an endpoint-touching WP are catalogued descriptively under this row when discovered. boardgame.io error semantics apply. |

---

## `Shipped-but-unwired` — Handler Code Exists, Route Registration Deferred

| Status | Method | Path | Auth | Request Schema (file ref) | Response Schema (file ref) | Authorizing WP | Notes |
|---|---|---|---|---|---|---|---|
| `Shipped-but-unwired` | `GET` | `/api/players/:handle/profile` | `guest` | `:handle` path param (string matching `HANDLE_REGEX` per WP-101 — `^[a-z][a-z0-9_]{2,23}$`) | `PublicProfileView` shape `{ handleCanonical, displayHandle, displayName, publicReplays }` per WP-102 contract; on miss returns `404` with body `{ "error": "player_not_found" }` (project-specific shape per D-11802) | WP-102 (public profile page) | Handler exported as `registerProfileRoutes(router, database)` at [`apps/server/src/profile/profile.routes.ts:91-136`](../../../apps/server/src/profile/profile.routes.ts). Route registration deferred per **D-10202** awaiting a future request-handler WP that owns the long-lived `pg.Pool` lifecycle. During the deferral window, `?profile=<handle>` returns 404 from the dev server's default handler; `PlayerProfilePage.vue` renders the locked "No player has claimed this handle." empty-state. |

---

## `Library-only` — Function Reachable Via Direct Import, No HTTP Surface Today

Cataloging a `Library-only` function does not promise it will graduate to
HTTP. Each row cites either the originating WP's intentional choice (e.g.,
WP-103 §Out of Scope explicitly forbids HTTP exposure of `storeReplay` /
`loadReplay`) or the deferral decision (e.g., D-10202 for the WP-102
profile route awaiting long-lived `pg.Pool`).

| Status | Method | Path | Auth | Request Schema (file ref) | Response Schema (file ref) | Authorizing WP | Notes |
|---|---|---|---|---|---|---|---|
| `Library-only` | (n/a) | (n/a — function `claimHandle`) | (n/a — caller-injected `DatabaseClient`) | Function args per [`apps/server/src/identity/handle.logic.ts:157`](../../../apps/server/src/identity/handle.logic.ts) — `(accountId, displayHandle, database)` | `Result<HandleClaim, HandleErrorCode>` per WP-101 | WP-101 (handle claim flow) | No HTTP layer planned in originating WP. Pure library function consumed by future request-handler WPs that will wire the claim endpoint. The locked claim SQL is the SOLE writer for the three handle columns on `legendary.players`. |
| `Library-only` | (n/a) | (n/a — function `findAccountByHandle`) | (n/a — caller-injected `DatabaseClient`) | `(handleCanonical, database)` per [`apps/server/src/identity/handle.logic.ts:260`](../../../apps/server/src/identity/handle.logic.ts) | `Result<{ accountId, handleCanonical, displayHandle, handleLockedAt } \| null, HandleErrorCode>` per WP-101 | WP-101 (handle claim flow) | No HTTP layer planned in originating WP. Pure library function used by WP-102 `getPublicProfileByHandle` and any future surface that resolves handle → `AccountId`. Per `DESIGN-RANKING.md` lines 485-487, handles are presentation aliases — every consumer dereferences to `AccountId` at point of use. |
| `Library-only` | (n/a) | (n/a — function `getHandleForAccount`) | (n/a — caller-injected `DatabaseClient`) | `(accountId, database)` per [`apps/server/src/identity/handle.logic.ts:298`](../../../apps/server/src/identity/handle.logic.ts) | `Result<{ handleCanonical, displayHandle, handleLockedAt } \| null, HandleErrorCode>` per WP-101 | WP-101 (handle claim flow) | No HTTP layer planned in originating WP. Pure library function used by WP-102 to populate the case-preserved `displayHandle` field on `PublicProfileView`. |
| `Library-only` | (n/a) | (n/a — function `storeReplay`) | (n/a — caller-injected `DatabaseClient`) | `(replayInput, database)` per [`apps/server/src/replay/replay.logic.ts:60`](../../../apps/server/src/replay/replay.logic.ts) | `Result<{ replayHash }, ReplayErrorCode>` per WP-103 | WP-103 (replay storage / loader) | **Route-less by design.** WP-103 §Out of Scope explicitly forbids HTTP exposure of replay storage; this function is consumed only by future internal pipelines (replay-producer CLI, future submission flows). Any future WP that would expose this over HTTP must explicitly supersede the WP-103 §Out of Scope clause and update this catalog row. |
| `Library-only` | (n/a) | (n/a — function `loadReplay`) | (n/a — caller-injected `DatabaseClient`) | `(replayHash, database)` per [`apps/server/src/replay/replay.logic.ts:103`](../../../apps/server/src/replay/replay.logic.ts) | `Result<ReplayBlob \| null, ReplayErrorCode>` per WP-103 | WP-103 (replay storage / loader) | **Route-less by design** (same as `storeReplay` — WP-103 §Out of Scope). Future leaderboard score-detail surfaces (WP-115 `GET /api/leaderboards/scores/:replayHash`) read replay metadata through their own SQL projection rather than calling this function across the HTTP boundary. |
| `Library-only` | (n/a) | (n/a — function `submitCompetitiveScore`) | (n/a — caller-injected `DatabaseClient`) | `(submission, database)` per [`apps/server/src/competition/competition.logic.ts:281`](../../../apps/server/src/competition/competition.logic.ts) | `Result<CompetitiveScoreReceipt, CompetitionErrorCode>` per WP-053 | WP-053 (competitive score submission) | **Ships fail-closed unwired.** No HTTP layer planned in originating WP; route wiring deferred to a future request-handler WP that owns long-lived `pg.Pool` lifecycle (mirrors WP-102 / D-10202 precedent). Library function pre-exists this catalog. |

---

## `Pending` — Drafted In A Future WP, Not Yet Executed

Each `Pending` row names both the drafting WP and its current state at
catalog-write time. When the drafting WP executes, its commit replaces
these rows per D-11804 replace-whole-row merge semantics — the row is
re-written wholesale (status → `Wired`, file refs filled in, etc.), never
edited column-by-column.

*No `Pending` rows at catalog-write time. The three forward-reference
placeholder rows previously seeded by WP-118 for the WP-115 leaderboard
endpoints were graduated to `Wired` in the WP-115 execution commit
(2026-05-01) per D-11804 single-row-graduation semantics; the underlying
network surface is now fully described by the three new `Wired` rows in
the `Server-Registered Routes` section above.*

---

## Footer

Cataloging a `Library-only` function does not promise it will graduate to
HTTP. Each `Library-only` row cites either the originating WP's intentional
choice (e.g., WP-103 §Out of Scope) or the deferral decision (e.g.,
D-10202 for the WP-102 profile route). Graduation, when it happens, is the
wiring WP's responsibility under the D-11804 catalog-update obligation —
the wiring WP replaces the affected row wholesale (status → `Wired`,
columns re-populated for the HTTP shape) in the same commit that lands
the new route registration in [`apps/server/src/server.mjs`](../../../apps/server/src/server.mjs).

*Last updated: WP-118 (single `SPEC:` commit, 2026-04-30).*
