# WP-118 — HTTP API Surface Catalog (Architecture)

**Status:** Draft (stub — pre-lint, pre-pre-flight; decisions marked `[DECISION REQUIRED]` must be resolved before lint-gate self-review)
**Primary Layer:** Governance / Policy (no runtime code; produces a new REFERENCE doc + DECISIONS entries; no API behavior changed)
**Dependencies:** WP-011 (match creation/lobby flow), WP-012 (match list/join/reconnect), WP-101 (handle claim flow), WP-102 (public profile page), WP-115 (public leaderboard endpoints — drafted, not yet executed) — every WP that has shipped or drafted an HTTP endpoint.

---

## Session Context

Multiple HTTP endpoints have shipped or are queued (`POST /games/legendary-arena/create`, `POST /games/legendary-arena/{matchID}/join`, profile endpoints from WP-102, leaderboard endpoints from WP-115), but there is no single source of truth listing them, no shared error contract, no versioning policy, and no convention requiring future WPs to update a catalog. This packet creates the catalog, backfills shipped endpoints, and locks the conventions before WP-115 (leaderboard) lands so the very next API-bearing WP has a place to register itself.

---

## Goal

After this session:

- A new file `docs/ai/REFERENCE/api-endpoints.md` exists and is the authoritative catalog of every HTTP endpoint exposed by `apps/server`.
- The catalog is backfilled with every endpoint that has already shipped (lobby create/join, profile, any others surfaced during this WP).
- Every drafted-but-not-executed WP that adds endpoints (WP-115 leaderboard at minimum) has a "Pending" entry in the catalog with a forward-link.
- `docs/02-ARCHITECTURE.md` and `docs/ai/ARCHITECTURE.md` gain a `## HTTP API Surface` section that summarizes the catalog and links to it.
- `docs/ai/DECISIONS.md` has new entries committing: catalog format, error-response shape, versioning policy, and the rule that all future endpoint-bearing WPs must update the catalog.
- `.claude/rules/work-packets.md` gains a one-line rule requiring catalog updates whenever a WP adds or modifies an endpoint.
- The lint checklist (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) gains a §X line requiring API-touching WPs to confirm the catalog is updated.

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

## Decision Points (Must be resolved before lint-gate self-review)

### [DECISION REQUIRED] D-11801 — Catalog format
- **Option A:** Markdown table per endpoint group (lobby, profile, leaderboard, etc.) with columns: Method, Path, Auth, Request Schema (file ref), Response Schema (file ref), Authorizing WP.
- **Option B:** OpenAPI YAML/JSON (machine-readable, can drive tooling later).
- **Option C:** Hybrid — Markdown as the human-facing index, OpenAPI as a generated/maintained companion.
- *Tradeoff:* A is fastest and matches the project's existing reference-doc style; B unlocks future tooling (codegen, contract tests) but is harder to keep current; C is best long-term but doubles the maintenance burden until tooling consumes the OpenAPI.

### [DECISION REQUIRED] D-11802 — Error response shape
- **Option A:** RFC 9457 Problem Details (`{ type, title, status, detail, instance }`).
- **Option B:** Project-specific shape (e.g., `{ code: string, message: string, requestId?: string }`).
- **Option C:** boardgame.io's own error semantics for game-related endpoints + Option B for everything else.
- *Tradeoff:* A is the standard and the most predictable for clients; B is simpler and matches the existing `MoveError` shape (`{ code, message, path }`) — note this is engine-internal, not HTTP; C is honest about the existing split.

### [DECISION REQUIRED] D-11803 — Versioning policy
- **Option A:** Path versioning (`/v1/games/...`). Breaking changes require new path.
- **Option B:** No versioning — the catalog is the contract; breaking changes require coordinated client + server release.
- **Option C:** Header-based (`Accept-Version`).
- *Tradeoff:* A is the most boring + safest; B fits a tightly-coupled client + server but breaks once a third-party integrator (e.g., the public registry viewer fetching leaderboard data) shows up; C is rare in practice and adds CDN/cache complications.

### [DECISION REQUIRED] D-11804 — Catalog-update obligation enforcement
- **Option A:** Add a §X to `00.3-prompt-lint-checklist.md` requiring API-touching WPs to confirm catalog updates.
- **Option B:** Add a one-line rule to `.claude/rules/work-packets.md` and rely on rule enforcement.
- **Option C:** Both A and B.
- *Tradeoff:* A is enforced at WP draft time; B is enforced during execution. C is belt-and-suspenders but matches how other governance decisions in this repo are anchored.

---

## Scope (In)

### A) New REFERENCE doc
- **`docs/ai/REFERENCE/api-endpoints.md`** — new: the catalog itself. Per D-11801 chosen format, with one row/section per endpoint. Backfills:
  - boardgame.io built-ins: `POST /games/legendary-arena/create`, `POST /games/legendary-arena/{matchID}/join`, `GET /games/legendary-arena` (list)
  - WP-101 / WP-102 profile + handle endpoints (verify list at execution)
  - WP-103 replay endpoints (verify list at execution)
  - WP-115 leaderboard endpoints (Pending status; forward-link)
  - Health endpoint, if any
- Includes header sections: Catalog format (per D-11801), Error contract (per D-11802), Versioning (per D-11803), Update obligation (per D-11804).

### B) Architecture-doc cross-link
- **`docs/ai/ARCHITECTURE.md`** — modified: add `## HTTP API Surface` section (or extend `## Transport`) with a one-paragraph summary + link to the new REFERENCE doc.
- **`docs/02-ARCHITECTURE.md`** — modified: mirror.

### C) DECISIONS entries
- **`docs/ai/DECISIONS.md`** — modified: append D-11801..D-11804.

### D) Update-obligation enforcement
- **`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`** — modified (only if D-11804 = A or C): add §X "API Catalog Update" with trigger surfaces and FAIL conditions.
- **`.claude/rules/work-packets.md`** — modified (only if D-11804 = B or C): add a one-line rule requiring catalog updates.

### E) STATUS + WORK_INDEX
- **`docs/ai/STATUS.md`** — modified: capability line.
- **`docs/ai/work-packets/WORK_INDEX.md`** — modified: check WP-118 off.

---

## Out of Scope

- **No endpoint behavior changes.** This is a documentation and governance WP.
- **No reconciliation of code-vs-WP drift.** Drift entries are recorded in the catalog with `Drift: <description>` annotations; fixes are follow-up WPs.
- **No OpenAPI tooling integration.** Even if D-11801 = B/C, this WP only writes the spec — codegen / contract tests are deferred.
- **No client wrapper / SDK.** `apps/arena-client/src/*/Api.ts` files stay as they are.
- **No HTTP middleware (rate limiting, request ID propagation, CORS) policy.** Each is its own future WP if needed.

---

## Files Expected to Change

Worst case (D-11804 = C, both lint + rules updated):

- `docs/ai/REFERENCE/api-endpoints.md` — **new** — the catalog
- `docs/ai/ARCHITECTURE.md` — **modified** — `## HTTP API Surface` section
- `docs/02-ARCHITECTURE.md` — **modified** — mirror section
- `docs/ai/DECISIONS.md` — **modified** — D-11801..D-11804
- `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` — **modified** — new §X (conditional on D-11804)
- `.claude/rules/work-packets.md` — **modified** — catalog-update rule (conditional on D-11804)
- `docs/ai/STATUS.md` — **modified** — capability line
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off

8 files at worst — at the `~8 files` split-recommendation cap per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §10` (line 126). If D-11804 = A or B, the file count drops to 7. The executing session must compare its actual diff against the *resolved* (non-worst-case) list, not against this worst-case enumeration.

---

## Acceptance Criteria

### Catalog
- [ ] `docs/ai/REFERENCE/api-endpoints.md` exists
- [ ] Catalog contains an entry for every endpoint surfaced by `git grep -rE 'app\.(get|post|put|delete)' apps/server/src/`
- [ ] Catalog contains a "Pending" entry for WP-115 leaderboard endpoints with forward-link
- [ ] Each catalog entry states: method, path, auth posture (guest/handle/authenticated), authorizing WP, request schema location, response schema location
- [ ] Header sections cover: format (D-11801), error contract (D-11802), versioning (D-11803), update obligation (D-11804)

### Architecture doc
- [ ] `docs/ai/ARCHITECTURE.md` contains `## HTTP API Surface` section (or extension)
- [ ] Section links to the catalog file
- [ ] `docs/02-ARCHITECTURE.md` mirrors

### DECISIONS
- [ ] D-11801..D-11804 entries exist with chosen options + rationale

### Update-obligation enforcement
- [ ] If D-11804 = A or C: lint checklist contains a new §X with trigger conditions and FAIL line
- [ ] If D-11804 = B or C: `.claude/rules/work-packets.md` contains the one-line catalog-update rule

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
# Express-style sub-routers are mounted alongside `app.<verb>(...)` in apps/server.

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
# Expected: only files in the resolved (D-11804-conditional) `## Files Expected to Change` list.
#   - If D-11804 = A: 7 files (no `.claude/rules/work-packets.md`)
#   - If D-11804 = B: 7 files (no `00.3-prompt-lint-checklist.md`)
#   - If D-11804 = C: 8 files (both)

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

> To be filled in by the packet author after `[DECISION REQUIRED]` blocks are resolved.
