# WP-118 — HTTP API Surface Catalog (Architecture)

**Status:** Ready for execution — decisions resolved 2026-04-30 (D-11801 = A, D-11802 = C, D-11803 = B, D-11804 = C with replace-whole-row merge semantics); pre-flight 2026-04-30 surfaced 6 BLOCKING + 5 RECOMMENDED PS items, all 11 resolved (PS-2 landed at commit `bfdefe1` 2026-04-30 as a separate `SPEC:` stub commit); copilot-check re-run 2026-04-30 PASS (3 HOLD-class FIXes applied in-place: D-11804 merge-semantics lock, stale-conditional cleanup, Verification Step 2 `// why:` comment); lint self-review filled in below; session prompt generation authorized.
**Primary Layer:** Governance / Policy (no runtime code; produces a new REFERENCE doc + DECISIONS entries; no API behavior changed)
**Dependencies:** WP-011 (match creation/lobby flow), WP-012 (match list/join/reconnect), WP-101 (handle claim flow — library-only, no HTTP route today), WP-102 (public profile page — route exported but unwired per D-10202), WP-103 (replay storage/loader — explicitly no HTTP endpoints per WP-103 Out of Scope), WP-115 (public leaderboard endpoints — drafted, not yet executed) — every WP that has shipped or drafted code that touches the HTTP surface, including the deliberately library-only ones. Reconciled with `docs/ai/work-packets/WORK_INDEX.md` line 2427 per pre-flight 2026-04-30 PS-1.

---

## Session Context

Several HTTP endpoints have shipped via boardgame.io's built-in lobby surface (`POST /games/legendary-arena/create`, `POST /games/legendary-arena/{matchID}/join`, `GET /games/legendary-arena`) plus a server-registered `GET /health` route. Additional handler code has shipped behind library functions or unregistered routers (WP-102 profile, WP-101 handle, WP-103 replay, WP-053 competition) — these are reachable via direct import only, not over HTTP, until a future request-handler WP wires them per the D-10202 / WP-053 precedent. WP-115 leaderboard endpoints are drafted but not executed. There is no single source of truth listing any of this, no shared error contract, no versioning policy, and no convention requiring future WPs to update a catalog. This packet creates the catalog, backfills the live surface, registers the shipped-but-unwired and library-only handlers under an explicit status taxonomy (so the catalog never claims an endpoint is reachable when it isn't), and locks the conventions before WP-115 (leaderboard) lands so the very next API-bearing WP has a place to register itself.

**Status taxonomy (locked per pre-flight 2026-04-30 PS-3):** every catalog row carries one of four `Status` values, and the catalog header enumerates them as a closed set:

- `Wired` — route registered in `apps/server/src/server.mjs` (or via boardgame.io built-ins) and reachable over HTTP today.
- `Shipped-but-unwired` — handler code exists in `apps/server/src/**` and exports a `register*Routes(...)`-style function, but route registration is deferred per a `DECISIONS.md` entry (e.g., D-10202 profile route awaiting long-lived `pg.Pool`).
- `Library-only` — function exists in `apps/server/src/**` with no HTTP surface planned in the originating WP. May graduate to `Wired` via a future WP, or may remain library-only by design (e.g., WP-103 replay helpers, which the WP-103 §Out of Scope explicitly forbids exposing as HTTP). Each library-only entry MUST cite either the originating WP's intentional choice or the deferral decision.
- `Pending` — drafted in a future WP that has not yet executed (e.g., WP-115 leaderboard); the row names both the drafting WP and the WP's current state at catalog-write time (e.g., `Pending: WP-115 (STUB DRAFT 2026-04-29)`). When the drafting WP executes, the catalog row is updated in that WP's own commit per the D-11804 update obligation.

---

## Goal

After this session:

- A new file `docs/ai/REFERENCE/api-endpoints.md` exists and is the authoritative catalog of every HTTP endpoint exposed (or coded but not yet exposed) by `apps/server`.
- The catalog header enumerates the four-value `Status` closed set: `Wired | Shipped-but-unwired | Library-only | Pending` (per §Session Context). Every row carries exactly one of these values.
- Every endpoint surfaced by `git grep -rE 'app\.(get|post|put|delete)|router\.(get|post|put|delete)' apps/server/src/` is catalogued as `Wired` or `Shipped-but-unwired` (boardgame.io built-ins are catalogued descriptively under `Wired`).
- Every WP-shipped library function reachable via direct import but not over HTTP (WP-101 `claimHandle` / `findAccountByHandle` / `getHandleForAccount`, WP-103 `storeReplay` / `loadReplay`, WP-053 `submitCompetitiveScore`) has a `Library-only` row that cites the originating WP's intentional choice or the deferral decision.
- Every drafted-but-not-executed WP that adds endpoints (WP-115 leaderboard at minimum) has a `Pending` entry that names both the drafting WP and its current state at catalog-write time (e.g., `Pending: WP-115 (STUB DRAFT 2026-04-29)`).
- `docs/02-ARCHITECTURE.md` and `docs/ai/ARCHITECTURE.md` gain a `## HTTP API Surface` section that summarizes the catalog and links to it.
- `docs/ai/DECISIONS.md` has new entries committing: catalog format (D-11801), error-response shape (D-11802), versioning policy (D-11803), and the rule that all future endpoint-bearing WPs must update the catalog (D-11804).
- `.claude/rules/work-packets.md` gains a one-line rule requiring catalog updates whenever a WP adds or modifies an HTTP endpoint (per D-11804 = C, locked below).
- The lint checklist (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) gains a new §21 "API Catalog Update" with trigger surfaces and FAIL conditions (per D-11804 = C, locked below).

This WP changes no endpoint behavior. It is a documentation and governance change.

---

## Vision Alignment

> Trigger surfaces from §17.1 (00.3 §17.1) evaluated:
> - #1 (Scoring/PAR/leaderboards): **Not triggered.** The catalog registers a Pending forward-link to WP-115 but commits no leaderboard content; WP-115 owns its own §17 alignment.
> - #2 (Replays): **Not triggered.** Any shipped replay-loader endpoints (WP-103) are catalogued descriptively only; URLs, methods, and shapes are unchanged. Determinism and replay-faithfulness are preserved by construction (no behavior touched).
> - #3 (Player identity): **Triggered.** The catalog references shipped profile + handle endpoints by URL and exposes canonical field names (`accountId`, `handle`).

**Vision clauses touched:** §3 (Player Trust & Fairness), §11 (Stateless Client Philosophy), §14 (Explicit Decisions, No Silent Drift). NG-1..NG-7 not crossed (no monetization).

**Conflict assertion:** No conflict — catalog is descriptive, not prescriptive of new behavior.

**Determinism preservation:** N/A — no engine / replay / RNG surface touched. Cataloging shipped endpoints does not alter their behavior.

**§20 Funding Surface Gate:** N/A — no funding affordances touched per WP-097 §A/§B/§C. Catalog enumerates technical endpoints; if a future tournament-funding endpoint exists, it is added under a §20-compliant WP at that time.

---

## Execution Checklist (EC)

**No EC is required for WP-118.** No `EC-*-*.checklist.md` file is created for this WP; no `EC_INDEX.md` row is added. This Work Packet is the sole authoritative execution contract.

> **Slot-naming note:** Per repo precedent, EC slot numbers do not have to match WP numbers (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-102 → EC-117, EC-111 → EC-118, etc.). The EC-118 slot is already occupied by `EC-118-uistate-card-display-projection.checklist.md` (WP-111). This is irrelevant to WP-118 because no EC file is created.

**Rationale:** WP-118 matches the D-10001 risk profile (binary-verifiable, no engine mutation, no persistence, no ordering surface, no irreversible side effects). It modifies only `docs/**` and `.claude/rules/**` — **no files under `packages/` or `apps/` are staged**, so the commit-msg hook (`.githooks/commit-msg` Rule 5) does not require an `EC-###:` prefix and the D-10001 Amendment 2026-04-26 stub-workaround does not apply. WP-118 commits use `SPEC:` prefix, which Rule 5 permits when no code is staged.

The verification machinery an EC would normally extract is already inlined: `## Acceptance Criteria` carries 14 binary checks across five sub-groups (Catalog / Architecture doc / DECISIONS / Update-obligation enforcement / Hygiene); `## Verification Steps` carries 7 commands; `## Definition of Done` re-asserts the build / test / scope gates. A separate EC would duplicate these without adding new safeguards.

**Citation:** `DECISIONS.md` D-10001 + Amendment 2026-04-26 (controlling precedent for no-EC WPs).

---

## Assumes

- `apps/server/src/server.mjs` exposes `boardgame.io` Server() and any custom routes added by WP-011, WP-012, WP-101, WP-102, etc.
- WP-115 is drafted (per `docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md`) but not yet executed.
- `docs/ai/REFERENCE/` exists and is the conventional location for new reference docs.
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` is editable and accepts new section additions per its own change-policy.
- `docs/ai/DECISIONS.md` exists.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Transport` — read to confirm match lifecycle endpoints already documented in summary form.
- `apps/server/src/server.mjs` — read to enumerate every HTTP route that's actually wired today.
- `apps/server/scripts/create-match.mjs`, `apps/server/scripts/list-matches.mjs`, `apps/server/scripts/join-match.mjs` — confirm the URLs they hit; these are the de-facto contract today.
- `apps/arena-client/src/lobby/lobbyApi.ts` and `apps/arena-client/src/profile/profileApi.ts` — enumerate every URL the client calls; cross-reference against server-side wiring.
- `docs/ai/work-packets/WP-011-match-creation-lobby-flow.md`, `WP-012-match-list-join-reconnect.md`, `WP-101-handle-claim-flow.md`, `WP-102-public-profile-page.md`, `WP-115-public-leaderboard-http-endpoints.md` — read each to extract the endpoint contract documented at WP draft time.
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — read its change-policy footer; the addition this WP makes must respect that policy.
- `.claude/rules/work-packets.md` — find the right place to insert the catalog-update rule.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file — no diffs, no snippets

**Packet-specific:**
- **Catalog is descriptive, not prescriptive.** This WP must not change any endpoint's URL, method, request shape, response shape, or status codes. If a discrepancy is found between code and a WP's documented contract, the discrepancy is recorded in the catalog as a "Drift" entry; reconciliation is a follow-up WP.
- **No new dependencies.**
- **No code changes** to `apps/server/`, `apps/arena-client/`, `apps/registry-viewer/`, or any package.
- **The error-contract decision (D-11802 below) does not retroactively reshape shipped responses.** If shipped endpoints don't match the locked shape, they are documented as "Drift" and a follow-up WP fixes them.
- **Naming consistency:** the catalog uses canonical field names from `docs/ai/REFERENCE/00.2-data-requirements.md`. Endpoints exposing `accountId`, `handle`, `matchId`, etc. use those exact spellings.
- **Auth posture per endpoint:** every catalog row states explicitly: guest / handle-required / authenticated-session-required (per WP-099 D-9905).

**Session protocol:**
- If an endpoint exists in code but no WP documents it, the catalog row is annotated `Undocumented:` (auth posture / request shape / response shape inferred from code, not from a governance source) and the executing session continues. Do **not** stop the session — flag the undocumented endpoint in the WP-118 commit message body and in `## Lint Self-Review` so a follow-up WP can backfill the governance record.
- If an endpoint exists in code but contradicts its authorizing WP's documented contract, the catalog row is annotated `Drift: <one-line description>`. Reconciliation is a follow-up WP, not in scope here.

**Locked contract values:**
- **AccountId** = server-generated UUID v4 (per WP-052 D-5201) — never invented at endpoint boundary.
- **Phase names, TurnStage values, MatchSetupConfig fields** — referenced by spelling only when an endpoint exposes them; canonical names per template.

**Forbidden packages (per `00.3 §7`):**
- This WP introduces none.

---

## Decision Points (Resolved 2026-04-30 per pre-flight PS-5)

All four decisions resolved before lint-gate self-review per the WP's own header gate. Each entry below records the chosen option, one-line rationale, and the rejected options. The corresponding `DECISIONS.md` entries (D-11801..D-11804) are appended at execution time per `## Definition of Done`.

### D-11801 — Catalog format → **Option A (Markdown table)**

Markdown table per endpoint group (lobby, profile, leaderboard, etc.) with columns: `Status`, `Method`, `Path`, `Auth`, `Request Schema (file ref)`, `Response Schema (file ref)`, `Authorizing WP`, `Notes`.

- *Rationale:* Matches the project's existing reference-doc style (`docs/ai/REFERENCE/00.2-data-requirements.md`, `02-CODE-CATEGORIES.md`); zero new tooling; trivially diff-able in PRs; the catalog is read by future WP authors first and client devs second, so human-first format wins. A future WP may add an OpenAPI companion without breaking the Markdown index — that path is preserved, not foreclosed.
- *Rejected:*
  - Option B (OpenAPI YAML/JSON only): unlocks future tooling but no consumer exists today; would create a second source of truth that drifts faster than the Markdown.
  - Option C (Hybrid Markdown + OpenAPI): doubles maintenance burden until tooling consumes the OpenAPI; deferred to a future WP if/when that tooling lands.

### D-11802 — Error response shape → **Option C (split: boardgame.io for game endpoints + project-specific `{ code, message, requestId? }` for project endpoints)**

`Wired` rows whose handler is owned by boardgame.io's lobby surface (create/join/list) document boardgame.io's own error semantics descriptively (catalog does not reshape them). All project-owned handlers (current `Shipped-but-unwired` profile route, future leaderboard routes per WP-115, future handle/replay/competition routes) use the project-specific shape `{ code: string, message: string, requestId?: string }`.

- *Rationale:* Honest about the existing split — the boardgame.io endpoints are owned by an upstream framework and reshaping them is out of scope for a documentation packet; the project-specific shape matches the existing `MoveError` `{ code, message, path }` discriminated-union style and preserves a discriminated tag (`code`) for future client-side switches. Drift entries dominate the initial catalog and reconciliation is out of scope here per `## Non-Negotiable Constraints`.
- *Optional-field semantics (per copilot check #5 follow-up):* `requestId` is `conditional-on-server-trace-injection` — present when the future request-handler WP introduces request-ID middleware; absent on every endpoint until then; never absent once the middleware lands. Catalog rows that diverge from these semantics are recorded as `Drift:` annotations.
- *Rejected:*
  - Option A (RFC 9457 Problem Details): standard but reshapes the existing surface; would force `Drift:` annotations on every shipped or shipped-but-unwired endpoint and a follow-up reconciliation WP that this packet's `## Non-Negotiable Constraints` already forbids.
  - Option B (project-specific shape uniformly): can't apply to boardgame.io's own error surface without reshaping it, which is out of scope.

### D-11803 — Versioning policy → **Option B (no versioning; catalog is the contract)**

Endpoints live at their natural path (`/api/players/:handle/profile`, `/api/leaderboards/scenarios`, etc.) with no `/v1/` prefix. Breaking changes require coordinated client + server release plus a `Drift:` annotation in the catalog row + a `DECISIONS.md` entry justifying the break.

- *Rationale:* Matches the current tightly-coupled client+server reality (the only HTTP clients are `apps/arena-client/`, the registry viewer's leaderboard fetch under WP-115, and the CLI scripts in `apps/server/scripts/`). No third-party integrator on the planning horizon. Fully reversible — adding `/v1/` later is a mechanical rename + catalog row update. Path versioning today would be dead-weight ceremony.
- *Rejected:*
  - Option A (path versioning `/v1/...`): correct only if a third-party integrator is on the near horizon; would force a rename of every existing path today for no operational benefit.
  - Option C (header-based `Accept-Version`): rare in practice; adds CDN/cache complications and requires versioning logic on every handler before any consumer needs it.

### D-11804 — Catalog-update obligation enforcement → **Option C (both lint-checklist §21 + `.claude/rules/work-packets.md` rule)**

Belt-and-suspenders enforcement matching the project's existing governance pattern (the lint-gate clause itself is duplicated across `.claude/CLAUDE.md`, `00.3 §17.1`, `.claude/rules/work-packets.md`).

- *Rationale:* Lint checklist §21 (new) catches at WP-draft time; `.claude/rules/work-packets.md` rule catches during execution. A future API-touching WP that slips past either gate alone is still caught by the other. Marginal maintenance cost (one one-line edit on each side) is dwarfed by the cost of a missed catalog update.
- *Merge semantics (per copilot-check re-run 2026-04-30 FIX #6):* any future WP that modifies an existing endpoint must **replace the entire catalog row** in the same commit; partial-update is FAIL. Status transitions (e.g., `Pending: WP-115 (STUB DRAFT 2026-04-29)` → `Wired` when WP-115 lands) are full-row replacements, never field-level edits. Both the new lint §21 and the new `.claude/rules/work-packets.md` rule must encode this constraint when WP-118 executes.
- *Rejected:*
  - Option A (lint-checklist only): only catches at WP-draft time; an executing session that adds an endpoint mid-flight could bypass it.
  - Option B (rule only): only catches during execution; a WP drafted with a missing catalog row could pass review.

**File-allowlist consequence:** D-11804 = C ⇒ resolved file count is **8** (worst case from `## Files Expected to Change`). The executing session must verify `git diff --name-only` matches all 8 files exactly; any other file modified is a scope violation.

---

## Scope (In)

### A) New REFERENCE doc
- **`docs/ai/REFERENCE/api-endpoints.md`** — new: the catalog itself. Markdown table per D-11801 = A, with one row per endpoint, organized by `Status` group then by endpoint group (lobby, profile, leaderboard, replay, competition, health). Backfills, by status (per the four-state taxonomy locked in `## Session Context`):
  - **`Wired`** — boardgame.io built-ins: `POST /games/legendary-arena/create`, `POST /games/legendary-arena/{matchID}/join`, `GET /games/legendary-arena` (list); plus the server-registered `GET /health` from `apps/server/src/server.mjs:30-34`. (Verify the boardgame.io-built-in list against `apps/server/scripts/{create-match,list-matches,join-match}.mjs` clients at execution.)
  - **`Shipped-but-unwired`** — `GET /api/players/:handle/profile` (WP-102, `apps/server/src/profile/profile.routes.ts:registerProfileRoutes`; route registration deferred per D-10202 awaiting long-lived `pg.Pool`).
  - **`Library-only`** — WP-101 handle helpers (`claimHandle`, `findAccountByHandle`, `getHandleForAccount` in `apps/server/src/identity/handle.logic.ts`); WP-103 replay helpers (`storeReplay`, `loadReplay` in `apps/server/src/replay/replay.logic.ts`; explicitly route-less per WP-103 §Out of Scope); WP-053 competition helper (`submitCompetitiveScore` in `apps/server/src/competition/competition.logic.ts`; ships fail-closed unwired). Each row cites the originating WP's intentional choice or the deferral decision.
  - **`Pending`** — WP-115 leaderboard endpoints (`GET /api/leaderboards/scenarios`, `GET /api/leaderboards/scenarios/:scenarioKey`, `GET /api/leaderboards/scores/:replayHash`; row formatted as `Pending: WP-115 (STUB DRAFT 2026-04-29)` per the row-format lock).
- Includes header sections: Catalog format (per D-11801 = A), Error contract (per D-11802 = C), Versioning (per D-11803 = B), Update obligation (per D-11804 = C with replace-whole-row merge semantics), Status taxonomy (four-value closed set), Auth taxonomy (three-value closed set per D-9905), Primary audience note.

### B) Architecture-doc cross-link
- **`docs/ai/ARCHITECTURE.md`** — modified: add `## HTTP API Surface` section (or extend `## Transport`) with a one-paragraph summary + link to the new REFERENCE doc.
- **`docs/02-ARCHITECTURE.md`** — modified: mirror.

### C) DECISIONS entries
- **`docs/ai/DECISIONS.md`** — modified: append D-11801..D-11804.

### D) Update-obligation enforcement (per D-11804 = C, locked)
- **`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`** — modified: add §21 "API Catalog Update" with trigger surfaces (any WP that adds, modifies, removes, or changes the status of an HTTP endpoint or library function reachable via direct import) and FAIL conditions (catalog row missing; status string outside the four-value closed set; auth string outside the three-value closed set; canonical field-name spelling diverging from `00.2`; partial-update of an existing row instead of full replacement per D-11804 merge semantics).
- **`.claude/rules/work-packets.md`** — modified: add a one-line rule requiring catalog updates whenever a WP adds, modifies, removes, or changes the status of an HTTP endpoint, with replace-whole-row merge semantics per D-11804.

### E) STATUS + WORK_INDEX
- **`docs/ai/STATUS.md`** — modified: capability line.
- **`docs/ai/work-packets/WORK_INDEX.md`** — modified: check WP-118 off.

---

## Out of Scope

- **No endpoint behavior changes.** This is a documentation and governance WP.
- **No reconciliation of code-vs-WP drift.** Drift entries are recorded in the catalog with `Drift: <description>` annotations; fixes are follow-up WPs.
- **No promise that `Library-only` entries will graduate to HTTP.** Cataloguing a library function as `Library-only` records its current state; it does not commit a future WP to wiring it. Each `Library-only` row must cite either the originating WP's intentional choice (e.g., WP-103 §Out of Scope explicitly forbids HTTP exposure of `storeReplay` / `loadReplay`) or the deferral decision (e.g., D-10202 for the WP-102 profile route awaiting long-lived `pg.Pool`). Graduation, when it happens, is the wiring WP's responsibility under the D-11804 catalog-update obligation.
- **CLI scripts (`apps/server/scripts/*.mjs`) and client wrappers (`apps/arena-client/src/*/Api.ts`, `apps/arena-client/src/lib/api/*.ts`) are clients of the catalog, not catalog entries.** They must be cross-referenced during catalog drafting to confirm URL spellings, but they are not themselves enumerated in the catalog (per `.claude/rules/server.md` §"CLI Scripts", which classifies CLI scripts as clients).
- **No OpenAPI tooling integration.** Per D-11801 = A (Markdown), this WP only writes the human-facing index. A future WP may add OpenAPI as a companion without breaking the Markdown — that path is preserved, not foreclosed; codegen / contract tests are deferred to that future WP.
- **No client wrapper / SDK.** `apps/arena-client/src/*/Api.ts` files stay as they are.
- **No HTTP middleware (rate limiting, request ID propagation, CORS) policy.** Each is its own future WP if needed. (Note: `requestId` field semantics under D-11802 = C are documented as `conditional-on-server-trace-injection` — present once the request-handler middleware lands, absent until then.)
- **No prose enumeration audit beyond the `## HTTP API Surface` insertion in the two architecture docs.** Mirrors WP-119 PS-5 disposition: this WP locks the section + the catalog cross-link; any other prose in `docs/02-ARCHITECTURE.md` or `docs/ai/ARCHITECTURE.md` that incidentally enumerates HTTP affordances may remain as-is until a future hygiene WP audits it.

**Session protocol — unrelated untracked files (per pre-flight 2026-04-30 PS-9, mirroring WP-030 / D-3001 mystery-untracked-file precedent):** the execution session may observe unrelated uncommitted / untracked files in `git status` (e.g., `package.json` + `scripts/architecture-inventory.mjs` tooling, `EC-119-public-leaderboard-http-endpoints.checklist.md` for WP-115). These are out of WP-118 scope. Do not stage, modify, or comment on them. The WP-118 close-out commit must contain only the resolved-allowlist file diffs and nothing else.

---

## Files Expected to Change

Resolved file count: **8** (per D-11804 = C, locked in `## Decision Points`). Verification Step 6 must compare `git diff --name-only` against this exact list:

1. `docs/ai/REFERENCE/api-endpoints.md` — **new** — the catalog (Markdown table per D-11801 = A; status taxonomy header; canonical field-name cross-checks)
2. `docs/ai/ARCHITECTURE.md` — **modified** — `## HTTP API Surface` section + cross-link to (1)
3. `docs/02-ARCHITECTURE.md` — **modified** — mirror section + cross-link to (1)
4. `docs/ai/DECISIONS.md` — **modified** — append D-11801, D-11802, D-11803, D-11804 entries (with chosen options + rationale matching `## Decision Points`)
5. `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — **modified** — new §21 "API Catalog Update" with trigger surfaces and FAIL conditions (per D-11804 = C)
6. `.claude/rules/work-packets.md` — **modified** — append one-line catalog-update rule (per D-11804 = C)
7. `docs/ai/STATUS.md` — **modified** — capability line for the catalog
8. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-118 with date + commit hash; replace any residual `D-NNN0[1-4]` placeholder phrasing in the WP-118 row body with the resolved `D-11801..D-11804` IDs (mirrors WP-119 PS-6 disposition)

8 files at the `~8 files` split-recommendation cap per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §5` (line 126). Justified inline in `## Lint Self-Review §5` below (the cap is a soft recommendation; this WP's eight files are tightly co-dependent and splitting them would produce two separately-incomplete commits).

---

## Acceptance Criteria

### Catalog
- [ ] `docs/ai/REFERENCE/api-endpoints.md` exists
- [ ] Catalog contains an entry for every endpoint surfaced by `git grep -rE 'app\.(get|post|put|delete)|router\.(get|post|put|delete)' apps/server/src/` (pattern matches Verification Step 2 verbatim — corrected per pre-flight 2026-04-30 PS-7; the project uses Koa via boardgame.io's `Server({...}).router`, not Express)
- [ ] Catalog contains a `Library-only` entry for every WP-shipped library function reachable via direct import but not over HTTP: WP-101 `claimHandle` / `findAccountByHandle` / `getHandleForAccount`, WP-103 `storeReplay` / `loadReplay`, WP-053 `submitCompetitiveScore`. Each row cites the originating WP's intentional choice or the deferral decision (e.g., D-10202 for the WP-102 profile route).
- [ ] Catalog contains a `Pending` entry for WP-115 leaderboard endpoints with forward-link, formatted to name both the drafting WP and its current state at catalog-write time (e.g., `Pending: WP-115 (STUB DRAFT 2026-04-29)`)
- [ ] Catalog header enumerates the four-value `Status` closed set as a one-line table: `Wired | Shipped-but-unwired | Library-only | Pending`. Every row carries exactly one of these values (verified by grep).
- [ ] Catalog header enumerates the three-value `Auth` closed set: `guest | handle-required | authenticated-session-required` (per D-9905). Every row's `Auth` column matches exactly one of these strings (verified by grep).
- [ ] Each catalog entry states: status (closed-set), method, path, auth posture (closed-set), authorizing WP, request schema location, response schema location
- [ ] Catalog header includes a "Primary audience" note: future Work Packet authors first; client devs may read directly until OpenAPI lands; ops should consult `apps/server/src/server.mjs` for ground truth
- [ ] For every canonical field name appearing in catalog request/response schemas (`accountId`, `handle`, `matchId`, `replayHash`, etc.), the spelling matches `docs/ai/REFERENCE/00.2-data-requirements.md` exactly (verified by grep against canonical source)
- [ ] Header sections cover: format (D-11801 = A), error contract (D-11802 = C), versioning (D-11803 = B), update obligation (D-11804 = C)

### Architecture doc
- [ ] `docs/ai/ARCHITECTURE.md` contains `## HTTP API Surface` section (or extension)
- [ ] Section links to the catalog file
- [ ] `docs/02-ARCHITECTURE.md` mirrors

### DECISIONS
- [ ] D-11801..D-11804 entries exist with chosen options + rationale

### Update-obligation enforcement (per D-11804 = C, locked)
- [ ] `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` contains a new §21 "API Catalog Update" with trigger conditions and FAIL line, including the FAIL condition for partial-update of an existing catalog row (replace-whole-row semantics per D-11804)
- [ ] `.claude/rules/work-packets.md` contains the one-line catalog-update rule, with explicit replace-whole-row merge semantics per D-11804
- [ ] Both §21 and the work-packets.md rule explicitly state replace-whole-row semantics (no partial updates) per D-11804 merge-semantics lock (FIX #6 from copilot-check re-run 2026-04-30)

### Hygiene
- [ ] STATUS + WORK_INDEX updated
- [ ] No code files modified (`git diff -- 'apps/**' 'packages/**'` is empty)
- [ ] No files outside `## Files Expected to Change` modified

---

## Verification Steps

```pwsh
# Step 1 — confirm new catalog file exists
Test-Path "docs\ai\REFERENCE\api-endpoints.md"
# Expected: True

# Step 2 — confirm every shipped endpoint is in the catalog
# (manual cross-check; this command lists what should be in the catalog)
Get-ChildItem -Path "apps\server\src" -Recurse -Include "*.mjs","*.ts","*.js" |
  Select-String -Pattern "app\.(get|post|put|delete)|router\.(get|post|put|delete)"
# Expected output is the list to verify against the catalog
# why: Select-String has no -Recurse flag; Get-ChildItem -Recurse pipes the file
# set into Select-String. Pattern also covers `router.<verb>(...)` since
# boardgame.io's Koa router (`Server({...}).router`) registers routes via
# `router.<verb>(...)` — see `apps/server/src/server.mjs:30-34` (health route)
# and `apps/server/src/profile/profile.routes.ts:91-136` (deferred profile route)
# for current usage. Both `router.<verb>` and `app.<verb>` patterns are matched
# defensively so the verification step survives a hypothetical future framework
# swap; the project is Koa today, not Express.

# Step 3 — architecture-doc section
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "^## HTTP API Surface"
# Expected: one match (or "## Transport" extension confirmed visually)

# Step 4 — DECISIONS entries
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^### D-1180[1-4]|^## D-1180[1-4]"
# Expected: 4 matches (the two header forms cover both `### D-NNNNN` and `## D-NNNNN` precedents in DECISIONS.md)

# Step 5 — no code touched
git diff --name-only -- "apps/**" "packages/**" "data/**"
# Expected: no output

# Step 6 — scope check
git diff --name-only
# Expected: exactly these 8 files (per D-11804 = C, locked in `## Decision Points`):
#   docs/ai/REFERENCE/api-endpoints.md
#   docs/ai/ARCHITECTURE.md
#   docs/02-ARCHITECTURE.md
#   docs/ai/DECISIONS.md
#   docs/ai/REFERENCE/00.3-prompt-lint-checklist.md
#   .claude/rules/work-packets.md
#   docs/ai/STATUS.md
#   docs/ai/work-packets/WORK_INDEX.md
# Any other path in `git diff --name-only` is a scope violation; abort and investigate.

# Step 7 — full test suite (no behavior changes)
pnpm -r test
# Expected: exits 0; baseline unchanged
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] All `[DECISION REQUIRED]` blocks resolved
- [ ] Catalog backfilled with every shipped endpoint (drift entries recorded where contracts diverge from WPs)
- [ ] WP-115 leaderboard appears as "Pending" with forward-link
- [ ] `pnpm -r test` exits 0 (regression check)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-118 checked off with date + commit hash
- [ ] No files outside `## Files Expected to Change` modified
- [ ] Lint-gate self-review passes (§17.1 trigger #3 confirmed; §20 N/A justified)

---

## Lint Self-Review

> Filled in 2026-04-30 per pre-flight PS-6, after `[DECISION REQUIRED]` blocks D-11801..D-11804 were resolved in `## Decision Points`. Reviewed against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §1-§20.

| § | Verdict | Justification |
|---|---|---|
| §1 — Work Packet Structure | **PASS** | All required sections present and non-empty: `## Goal`, `## Assumes`, `## Context (Read First)`, `## Scope (In)`, `## Out of Scope` (with two+ explicit exclusions), `## Files Expected to Change`, `## Non-Negotiable Constraints`, `## Acceptance Criteria` (14 binary checks across 5 sub-groups), `## Verification Steps` (7 commands), `## Definition of Done` (10 items). |
| §2 — Non-Negotiable Constraints Block | **PASS** | Engine-wide constraints (ESM only, Node v22+, human-style code per `00.6-code-style.md`, full file contents — no diffs / snippets). Packet-specific constraints (descriptive-not-prescriptive, no new dependencies, no code changes, no error-contract retroactive reshaping, canonical field names per `00.2`, auth posture per D-9905). Session protocol (`Undocumented:` and `Drift:` annotation rules; do-not-touch rule for unrelated untracked files added in this revision per pre-flight PS-9). Locked contract values (AccountId server-generated UUID v4 per WP-052 D-5201; auth posture three-value closed set per D-9905). |
| §3 — Prerequisites (`## Assumes`) | **PASS** | Five explicit assumptions (server.mjs Server() exposure, WP-115 drafted state, REFERENCE/ exists, lint checklist editable, DECISIONS.md exists). Each is grep-verifiable; failure of any is explicitly marked BLOCKED. WP-103 added to deps (per pre-flight PS-1) with explicit "library-only by design" annotation so the executor cannot silently miss its existence. |
| §4 — Context References (`## Context (Read First)`) | **PASS** | Specific section references: `ARCHITECTURE.md §Transport`, `server.mjs`, three CLI scripts, `lobbyApi.ts` and `profileApi.ts`, five dependency WPs by file, `00.3 §17.1` change-policy, `.claude/rules/work-packets.md` insertion site. No vague "read the docs" references. |
| §5 — Output Completeness (`## Files Expected to Change`) | **PASS-with-note** | All 8 files listed with `— new` / `— modified` markers and one-line descriptions per file. File count is at the `~8 files` soft cap per §5 line 126; justified by tight co-dependence — splitting into two commits would land a catalog file (1) without its enforcement entries (5, 6) or a partial cross-link (2, 3) ahead of the catalog (1), creating a broken intermediate state. The split would produce two separately-incomplete commits, both of which would fail their own acceptance criteria. Per §5's own language, the cap is a recommendation; a justified single commit is preferable to two broken ones. |
| §6 — Naming Consistency | **PASS** | Canonical field names cited per Non-Negotiable Constraints "Locked contract values" block (`accountId`, `handle`, `matchId`, `replayHash` per `00.2`); auth posture three-value closed set named per D-9905 (`guest | handle-required | authenticated-session-required`); status taxonomy four-value closed set named in `## Session Context` (`Wired | Shipped-but-unwired | Library-only | Pending`). New AC item locks per-row canonical-field-name verification by grep against `00.2`. |
| §7 — Dependency Discipline | **PASS** | "**No new dependencies.**" stated explicitly in Non-Negotiable Constraints "Forbidden packages" block. The catalog enumerates HTTP endpoints; it imports nothing. |
| §8 — Architectural Boundaries | **PASS** | Catalog is descriptive only; no engine code, no move logic, no `G` / `ctx` access, no PostgreSQL queries, no boardgame.io imports outside the existing `apps/server/src/server.mjs` wiring (which this WP only documents, never modifies). Layer Boundary per `.claude/rules/architecture.md` is preserved by construction — no code is touched. Server-layer rules per `.claude/rules/server.md` honored: catalog distinguishes wiring-layer routes from library-only helpers. |
| §9 — Windows Compatibility | **PASS** | Verification Steps use PowerShell-compatible commands (`Test-Path`, `Get-ChildItem -Recurse | Select-String`, `Select-String -Path` with `\` separators, `pnpm -r test`); no bash-specific syntax. `Select-String` -Recurse caveat documented inline with `// why:` comment in Verification Step 2. |
| §10 — Environment Variable Hygiene | **N/A** | No environment variables introduced or referenced. The catalog enumerates HTTP surface; it has no runtime configuration. |
| §11 — Authentication Clarity | **PASS** | Auth posture enumerated as a three-value closed set per WP-099 D-9905 (`guest | handle-required | authenticated-session-required`); each catalog row carries exactly one value (verified by AC grep). The catalog does not implement auth — it documents the auth posture each shipped or pending endpoint declares. The current shipped surface is mostly `guest` (boardgame.io built-ins, `/health`); the deferred profile route is `guest` per its `// why:` comment in `profile.routes.ts:71-79`. |
| §12 — Test Quality | **N/A** | No tests produced. WP changes no behavior; no test additions or deletions expected. AC line "no code files modified" + Verification Step 7 (`pnpm -r test` exits 0, baseline unchanged) enforces. |
| §13 — Commands and Verification | **PASS** | All commands use `pnpm -r test` (Step 7) or PowerShell-native (`Test-Path`, `Get-ChildItem`, `Select-String`); each step has expected-output annotation. Step 6 lists the resolved 8-file allowlist exactly. Step 2 covers both `app.<verb>` and `router.<verb>` patterns to match the project's actual Koa-via-boardgame.io wiring (corrected per pre-flight PS-7). |
| §14 — Acceptance Criteria Quality | **PASS** | 14 binary checks across 5 sub-groups (Catalog, Architecture doc, DECISIONS, Update-obligation enforcement, Hygiene). Every item is observable via the corresponding Verification Step. No subjective items ("works correctly", "looks good"). Cap of 12 exceeded by 2 — justified by D-11804 = C requiring two enforcement-file checks (lint §21 + work-packets rule) plus the new status-taxonomy / closed-set / canonical-naming items added per pre-flight PS-3. The 14 items align exactly with the 8 deliverables; no phantom checks. |
| §15 — Definition of Done | **PASS** | Section exists with 10 checkboxes covering: all AC pass, all `[DECISION REQUIRED]` blocks resolved, catalog backfilled, WP-115 Pending entry, `pnpm -r test` exit 0, STATUS / DECISIONS / WORK_INDEX updates, scope-boundary check ("no files outside `## Files Expected to Change` modified"), lint-gate self-review pass. |
| §16 — Code Style | **N/A** | No code produced. Doc-only WP. Prose follows `00.6-code-style.md` guidance for documentation files (full sentences, decision-ID citations, no abbreviations in field names). |
| §17 — Vision Alignment | **PASS** | `## Vision Alignment` block present (lines 32-44). §17.1 trigger #3 (player identity) cited and triggered; #1 (leaderboards) and #2 (replays) cited and correctly noted as not-triggered (forward-link only / descriptive only). Vision clauses listed by number: `§3, §11, §14`. Conflict assertion: "No conflict — catalog is descriptive, not prescriptive of new behavior." Determinism preservation: `N/A — no engine / replay / RNG surface touched`. Non-Goal proximity: `NG-1..NG-7 not crossed (no monetization)`. |
| §18 — Prose-vs-Grep Discipline | **PASS** | Verification Steps 2 and 3 use scoped patterns (`app\.(get|post|put|delete)|router\.(get|post|put|delete)` — matches code import / call sites only, not prose discussion of HTTP verbs); Step 5 (`git diff --name-only -- "apps/**" "packages/**" "data/**"`) is path-scoped; Step 6 is `git diff --name-only` with no token pattern. The catalog file (1) will discuss HTTP methods in prose, but the verification greps target only `apps/server/src/**`, not `docs/**`, so no false-positive risk. |
| §19 — Bridge-vs-HEAD Staleness Rule | **PASS** | This is a forward-locking governance WP, not a repo-state-summarizing artifact. The catalog enumerates current state at execution-time (the executing session re-runs Verification Step 2 to populate rows) — staleness is by-construction prevented because the catalog is generated against `HEAD` at execution, not against this WP's drafting-time snapshot. The `Pending: WP-115 (STUB DRAFT 2026-04-29)` annotation pattern (per pre-flight PS-11) is the only place a date-stamped status appears, and the format explicitly anticipates that WP-115 will graduate; the catalog row update is the responsibility of WP-115's own commit per D-11804. |
| §20 — Funding Surface Gate Trigger | **N/A** | Pure documentation / governance update; no UI surfaces, no user-visible copy, no funding channels referenced. The catalog enumerates technical HTTP endpoints; if a future tournament-funding endpoint is added, it goes through a §20-compliant WP at that time, and the catalog row is added under the D-11804 update obligation. Per §20.1 governance-doc carve-out (line 619-627), this WP only mentions WP-097 / D-9701 / §20 conceptually if at all (it does not — except for this lint-self-review entry citing §20 itself, which is the kind of meta-document the carve-out covers). |

**Summary:** 16 PASS (one PASS-with-note for §5, one PASS-with-note for §14), 4 N/A (each justified per §10 / §12 / §16 / §20 N/A discipline). Zero FAIL. Lint gate satisfied.

**Pre-Session Actions Resolved (2026-04-30):**

- [x] PS-1 — Dependencies line reconciled with WORK_INDEX (WP-103 added with library-only-by-design annotation).
- [x] PS-3 — Session Context rewritten with three-state shipped-state reality; four-value status taxonomy locked at top of `## Session Context`; AC enforces closed-set, canonical-naming, primary-audience note; Out of Scope clarifies library-only entries don't promise graduation; CLI scripts excluded from catalog as clients-not-entries.
- [x] PS-5 — D-11801 = A (Markdown), D-11802 = C (split: boardgame.io for game endpoints + project-specific `{ code, message, requestId? }` for project endpoints), D-11803 = B (no versioning), D-11804 = C (lint §21 + work-packets rule). All four resolved with rationale and rejected-options enumerated in `## Decision Points`.
- [x] PS-6 — `## Lint Self-Review` filled (this section).
- [x] PS-7 — AC line 203 grep pattern updated to `app\.(get|post|put|delete)|router\.(get|post|put|delete)` to match Verification Step 2 verbatim (Koa, not Express).
- [x] PS-8 (recommended; accepted) — Resolved 8-file allowlist pinned at top of `## Files Expected to Change`; Verification Step 6 enumerates the 8 paths exactly.
- [x] PS-9 (recommended; accepted) — `## Out of Scope` adds explicit do-not-touch rule for unrelated uncommitted/untracked files (`package.json`, `scripts/architecture-inventory.mjs`, `EC-119-public-leaderboard-http-endpoints.checklist.md`, etc.); mirrors WP-030 / D-3001 mystery-untracked-file precedent.
- [x] PS-10 (recommended; accepted) — `## Out of Scope` clarifies CLI scripts and client wrappers are clients of the catalog, not catalog entries (per `.claude/rules/server.md` §"CLI Scripts").
- [x] PS-11 (recommended; accepted) — `Pending` row format locked as `Pending: WP-115 (STUB DRAFT 2026-04-29)` so it survives WP-115's eventual graduation through draft → reviewed → executed via the D-11804 update obligation.
- [x] PS-2 — WP-115 stub draft committed at `bfdefe1` (2026-04-30) as a separate `SPEC:` commit. Path-(a) resolution: `git add docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md` then `git commit -m 'SPEC: WP-115 stub draft -- public leaderboard HTTP endpoints + pg.Pool bootstrap'`. Mirrors the WP-116/117/118 stub-commit precedent at `242e203`. WP-118's `Pending: WP-115 (STUB DRAFT 2026-04-29)` forward-link now resolves to a tracked artifact in committed history.

**Pre-flight verdict disposition:** All 6 BLOCKING items resolved (PS-1, PS-2, PS-3, PS-5, PS-6, PS-7). All 5 RECOMMENDED items accepted and applied (PS-4, PS-8, PS-9, PS-10, PS-11). Pre-flight verdict flipped to **READY 2026-04-30**. Per `01.7-copilot-check.md` workflow, the copilot check must be re-run before authorizing session prompt generation (PS-3 reshaped the catalog's status semantics — a scope change). Expected re-run outcome: BLOCK → PASS, since PS-3's four-state taxonomy + AC closed-set verification + canonical-field-name AC item directly close the copilot-check #6 / #10 / #27 RISK findings from the earlier pass. Once that re-run flips to PASS, session prompt generation is authorized.
