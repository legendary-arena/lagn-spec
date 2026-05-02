# WP-104 — Owner Profile Data Model & `/me` Edit

**Status:** Draft (drafted 2026-05-02; lint-gate self-review **PASS** — see §Lint Self-Review at foot)
**Primary Layer:** Server (`apps/server/src/profile/**` extension; `data/migrations/009`) + Arena Client (`apps/arena-client/src/{pages,lib/api}/`, `App.vue`)
**Dependencies:** WP-102 (`apps/server/src/profile/` module + page conventions; landed 2026-04-28 at Commit A `369c0a4`); WP-112 (session-token validation orchestrator + `requireAuthenticatedSession(req, options)` contract; landed 2026-05-02 at `EC-112:`); WP-052 (`legendary.players` + `AccountId` + `Result<T>` + `DatabaseClient` contracts); WP-101 (handle claim flow — `findAccountByHandle` consumed by the future surface-integration WP that joins owner-edit fields onto the public profile; WP-104 itself does NOT modify the public profile)

---

## Session Context

WP-102 (executed 2026-04-28) introduced `apps/server/src/profile/`
with `profile.types.ts` / `profile.logic.ts` / `profile.routes.ts` /
`profile.logic.test.ts` and the public read-only
`GET /api/players/:handle/profile` endpoint, plus the arena-client
query-string router pattern (`?profile=<handle>` extending
`type AppRoute`). WP-112 (executed 2026-05-02) shipped the
broker-agnostic `requireAuthenticatedSession(req, options):
Promise<Result<AccountId>>` orchestrator + the `SessionVerifier`
interface + the caller-injected provider pattern that
WP-101 / WP-102 / WP-104 already designed for. WP-126 (Hanko-specific
verifier — deferred placeholder) is NOT a hard-dep for WP-104:
WP-104's owner-only routes accept the caller-injected
`requireAuthenticatedSession` provider as a parameter at registration
time, so the routes can be wired before WP-126 lands; until WP-126
provisions a real `SessionVerifier`, every authenticated request
returns `Result.fail({ code: 'session_verifier_not_configured' })`
per D-11204 — fail-closed by construction.

This packet adds the **owner-edit half** of the profile surface
that WP-102 deliberately deferred: a new `legendary.player_profiles`
table (1:1 with `legendary.players`) carrying optional editable
fields (`avatar_url`, `about_me`) plus per-section privacy toggles
plus an `updated_at` audit timestamp; a new `legendary.player_links`
table (many-to-1 with `legendary.players`) carrying provider /
URL / per-link visibility; three owner-only HTTP endpoints under
`/api/me/`; and a new `MyProfilePage.vue` at the arena-client
`?route=me` path with edit forms.

WP-104 does NOT integrate the new fields into WP-102's public
`PublicProfileView` — that integration (joining owner-edit fields
onto the `GET /api/players/:handle/profile` response, with
visibility filtering driven by the new privacy toggles) is a
separate future surface-integration WP that cites WP-104 + WP-102
together. WP-104 ships only the owner-side data model + edit
endpoints + edit page; the public profile remains byte-identical
to its WP-102 shape for now.

**Scope deliberately excluded from this packet:**
- Avatar **upload** pipeline (R2 + MIME / size validation) — WP-106 owns it; WP-104 stores `avatar_url` only.
- Public-profile integration (join onto `PublicProfileView`) — separate future WP per the WP-104B / WP-102 amendment pattern.
- Badges (WP-105), integrity admin (WP-107+), payments (WP-108+), tournament identity (WP-109+).
- Authentication broker wiring (WP-126) — caller-injected; WP-104 does not invoke any broker.
- Account deletion / GDPR endpoints — out of scope; covered by future WP that extends WP-052 `deletePlayerData`.
- Friend graphs / follow models — out of scope; the per-section `'friends'` privacy value falls back to `'private'` server-side until a friend-graph WP lands.

---

## Goal

After this session, an authenticated owner can navigate to the
arena-client's `?route=me` URL, read their own profile (avatar URL,
about-me text, per-section privacy toggles, ordered link list), and
edit any of those fields via three new owner-only HTTP endpoints
(`GET /api/me/profile`, `PATCH /api/me/profile`, `PUT /api/me/links`)
gated by the WP-112 `requireAuthenticatedSession(req, options)`
orchestrator. The server side ships:

- A new migration `data/migrations/009_create_player_profiles_and_links.sql`
  creating `legendary.player_profiles` (1:1 with `legendary.players`,
  `ON DELETE CASCADE`) and `legendary.player_links` (many-to-1, also
  `ON DELETE CASCADE`) idempotently.
- A new `apps/server/src/profile/` quartet (`ownerProfile.types.ts` /
  `ownerProfile.logic.ts` / `ownerProfile.logic.test.ts` /
  `ownerProfile.routes.ts`) implementing `getOwnerProfile`,
  `upsertOwnerProfile`, `replaceOwnerLinks`, and the Koa router
  adapter `registerOwnerProfileRoutes(router, database, deps)` —
  caller-injected dependencies per the WP-101 / WP-102 / WP-112 /
  WP-115 caller-injected pattern.
- A `server.mjs` modification (single line, per D-DEC-6 = (a) default)
  registering the three new routes alongside the existing
  `registerLeaderboardRoutes` call, with the long-lived `pg.Pool`
  passed through per the WP-115 lifecycle precedent.

The arena-client side ships `MyProfilePage.vue` (owner-edit page with
three regions: header, profile form, links manager),
`ownerProfileApi.ts` (typed `fetch` wrappers for the three endpoints),
and a minimal `App.vue` modification (extend `type AppRoute` with
`'me'` plus a lazy-imported `<v-if>` branch).

The public profile surface (WP-102's `GET /api/players/:handle/profile`
and `PlayerProfilePage.vue`) is **byte-identical** post-WP-104 — the
join of owner-edit fields onto `PublicProfileView` with per-section
visibility filtering is deferred to a separate future surface-
integration WP.

**Invariant locked here:** privacy defaults are most-private. A
never-edited account leaks nothing to the eventual public-profile
join. Owner writes are the only path that flips a section to
`'public'`; the migration's column defaults are `'private'` (or the
boolean equivalent per D-DEC-1's resolved option). Vision §3 fail-
closed posture preserved by construction.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-104
> touches player identity (Vision §3, §11), owner-controlled
> visibility (§3, §11, §14), and an authenticated-write surface that
> non-trivially interacts with the trust posture (§3) — Vision
> Alignment is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §15 (Built for Contributors), §17 (Accessibility — touched
through the form surfaces but no new accessibility constraints
introduced beyond the existing arena-client conventions),
Non-Goals NG-1, NG-3, NG-6.

**Conflict assertion:** **No conflict: this WP preserves all
touched clauses.**

- **§3 Player Trust & Fairness.** Owner-only writes are gated
  by the WP-112 `requireAuthenticatedSession` orchestrator with
  fail-closed unconfigured-default (D-11204). The public profile
  surface (WP-102) is byte-identical post-WP-104 — no owner edit
  changes what the public sees until a future surface-integration
  WP lands. Privacy toggles default to the most-private value at
  row creation so a never-edited account profile leaks nothing.
- **§11 Stateless Client Philosophy.** The arena-client's edit page
  is a stateless edit-and-submit surface — every PATCH / PUT
  re-fetches the canonical record on success; no client-side
  diffing, no localStorage edit cache, no partial-state recovery
  beyond the form's own `<input>` values during a single edit
  session.
- **§14 Explicit Decisions, No Silent Drift.** The privacy model,
  the `player_links` schema, the avatar-URL validation posture,
  and the PATCH semantics are all surfaced as `[DECISION REQUIRED]`
  blocks in §Decision Points with rationale + rejected alternatives
  documented; the executor copies the locked choices into
  `DECISIONS.md` at execution. No silent design.
- **§15 Built for Contributors.** The `requireAuthenticatedSession`
  caller-injected pattern means a contributor running locally
  without a configured broker sees fail-closed 401 / 500 responses
  with a recognizable code, not silent success. Production wiring
  (a future request-handler WP) configures the verifier exactly
  once at startup.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** Owner profile editing is a presentation
  surface only. No gameplay state, no scoring input, no leaderboard
  visibility, no monetization flow. The "Avatar" field stores a
  URL string; a future R2-upload WP (WP-106) provides the upload
  pipeline.
- **NG-3 (content withheld):** WP-104 introduces no content gate.
  The new `MyProfilePage.vue` is owner-self-service; non-owners
  see the WP-102 public surface (unchanged by this WP).
- **NG-6 (dark patterns):** No FOMO timers, no upsell prompts,
  no manipulative re-prompts on the edit form. Privacy toggles
  default to the most-private value (per D-DEC-1's recommended
  default).
- **NG-2, NG-4, NG-5, NG-7:** N/A — no randomized purchases,
  energy systems, advertising, or apologetic monetization.

**Funding Surface Gate (§20):** **N/A.** WP-104 introduces no
funding surface. None of the §20.1 trigger surfaces apply: (a) no
donate / contribute / sponsor / fund affordances in any new file;
(b) no registry-viewer touch; (c) no funding-attribution surface
on the user profile (the avatar / about_me / links surfaces are
identity / presentation, not money-flow); (d) no tournament-
funding integration; (e) no user-visible copy referencing donate
or tournament funding. WP-104's subject is owner-controlled
identity presentation, not a funding flow. Justification:
authenticated-write owner-edit page; the `player_links` rows
permit any URL by default (D-DEC-2 recommended default), so a
user *could* paste a funding link into their own profile, but
the link table is a presentation surface (display strings the
owner chooses), not an in-product funding affordance — no
WP-097 §A / §B / §C surface is implemented or proposed.

**Determinism preservation:** **N/A.** WP-104 touches no engine,
registry, scoring, replay, RNG, or simulation surface.
Authentication-gated owner-edit endpoints are server-layer access
and presentation concerns, never inputs to deterministic gameplay.
Replay determinism (Vision §22, §24) is unaffected by construction.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

> Per D-11804 (single `SPEC:` commit, 2026-04-30): every WP that
> adds, modifies, removes, or changes the status of an HTTP endpoint
> exposed by `apps/server` MUST update
> `docs/ai/REFERENCE/api-endpoints.md` in the same commit. WP-104
> adds three new HTTP endpoints under `/api/me/`, so the catalog
> update obligation fires.

**Trigger surfaces (per §21.1):**
- Adds three new HTTP endpoints registered on the existing Koa
  router from `apps/server/src/server.mjs`:
  - `GET /api/me/profile`
  - `PATCH /api/me/profile`
  - `PUT /api/me/links`

**Required catalog update (per §21.2 and the locked replace-whole-row
merge semantics from D-11804):**

- Add three new rows in the `## Wired — Reachable Over HTTP Today`
  → `### Server-Registered Routes` section. Each row carries:
  - `Status`: `Wired` (closed-set value per D-11804) — assumes
    server.mjs wiring lands in the same commit per the WP-115
    precedent. If the executor defers wiring to a future WP per
    the WP-053 / WP-054 ships-fail-closed-unwired precedent, the
    rows transition to `Shipped-but-unwired` instead and a future
    request-handler WP graduates them to `Wired`. This trade-off
    is surfaced as **D-DEC-6** in §Decision Points.
  - `Auth`: `authenticated-session-required` (closed-set value
    per D-9905). All three endpoints invoke
    `requireAuthenticatedSession(req, options)` as the first
    middleware step.
  - `Authorizing WP`: `WP-104`.
  - Field names match `00.2-data-requirements.md` and the existing
    catalog spellings verbatim — `accountId`, `avatarUrl`,
    `aboutMe`, `links`, `provider`, `url`, `isPublic`, etc.
  - `Notes`: cite WP-112 (session-token gate); cite the privacy
    toggles closed set (per D-DEC-1); cite the per-link visibility
    closed set (per D-DEC-1).

**Replace-whole-row semantics (per D-11804):** these are insertions
of new rows, not edits of existing rows; no replace-whole-row
pattern applies. The three rows are appended to the existing
`Server-Registered Routes` section in the order shown above.

**Field-name canonicalization (per §21.2):** every field name in
the new rows' request and response schemas (`accountId`, `avatarUrl`,
`aboutMe`, `links`, `provider`, `url`, `isPublic`, `aboutMeVisibility`,
`linksVisibility`, `avatarVisibility`, `updatedAt`) is locked under
**D-DEC-1** + **D-DEC-2** in §Decision Points; the executor
confirms each spelling against `00.2-data-requirements.md` at
execution time and adds new rows to `00.2 §4.1 Table Inventory`
for `legendary.player_profiles` and `legendary.player_links` in
the same commit if they are not yet present.

---

## Decision Points

> Six decisions are surfaced at draft time. **D-10401** and **D-10402**
> are locked here with rationale and rejected alternatives — the
> executor copies them verbatim into `docs/ai/DECISIONS.md` at the
> close-out commit. The remaining four are `[DECISION REQUIRED]`
> blocks for the executor to resolve at execution time, with
> constraints documented here so the executor can lock them without
> re-litigating at coding time.
>
> **Note on numbering.** The `D-DEC-N` identifiers below are
> temporary draft-time placeholders. At execution close-out they are
> renumbered and recorded as **D-10403** (D-DEC-1) / **D-10404**
> (D-DEC-2) / **D-10405** (D-DEC-3) / **D-10406** (D-DEC-4) /
> **D-10407** (D-DEC-5) / **D-10408** (D-DEC-6) in `DECISIONS.md`,
> preserving order and rationale verbatim. The `D-DEC-N` names
> appear nowhere outside this WP file and the paired EC-128
> checklist; production code, test files, and the catalog must cite
> only the executed `D-104NN` numbers.

### D-10401 — WP-104 Module Path: Extend `apps/server/src/profile/` (Not New `apps/server/src/account/`) [LOCKED AT DRAFT]

**Decision:** Owner-edit code lives under `apps/server/src/profile/`
as siblings to the WP-102 read-only files. Specifically:
`apps/server/src/profile/ownerProfile.types.ts`,
`apps/server/src/profile/ownerProfile.logic.ts`,
`apps/server/src/profile/ownerProfile.logic.test.ts`,
`apps/server/src/profile/ownerProfile.routes.ts`. WP-102's existing
files (`profile.types.ts`, `profile.logic.ts`, `profile.routes.ts`,
`profile.logic.test.ts`) are NOT modified — they remain locked
contract files per their WP-102 close.

**Rationale.**
- **Single home for profile concerns.** Profile is a domain, not
  a routing partition. The public read surface (WP-102) and the
  owner-write surface (WP-104) are the two halves of the same
  domain; splitting them across `profile/` and `account/` would
  fork the directory classification.
- **D-10201 / D-5202 / D-10301 module-path precedent.** Each
  server domain (`identity/`, `replay/`, `competition/`, `profile/`)
  is a sibling of the others; new domains extend their own
  subdirectory rather than fragmenting across new ones. WP-104
  is profile-domain work — it extends `profile/`.
- **Naming prefix prevents collision with WP-102 files.** Every
  new file uses the `ownerProfile.*` prefix so there is no
  filename collision with `profile.*` files; the executor and
  reviewers can grep `ownerProfile` to find WP-104 surface and
  `profile.` (terminal dot) to find WP-102 surface.

**Rejected alternative — new `apps/server/src/account/` directory.**
WP-104 ships under `apps/server/src/account/`. Rejected because:
(a) profile is a domain, not a routing partition — the read and
write halves belong together; (b) it would require a new D-entry
per the D-5202 / D-10301 module-path classification precedent for
no clear benefit; (c) the future surface-integration WP (joining
owner fields onto the public profile) would import from both
directories, creating a circular-feeling layout where one half
of the profile read path lives in `account/`.

**Status:** Active. Status flips to `Resolved` once WP-104 lands.

**Citation:** WP-102 §Locked contract values "Module path
(locked): `apps/server/src/profile/`"; WP-103 D-10301
(`apps/server/src/replay/` directory classification — sibling
to `identity/`); WP-052 D-5202 (`apps/server/src/identity/`
directory classification).

### D-10402 — WP-104 Migration Slot: `009_create_player_profiles_and_links.sql` [LOCKED AT DRAFT]

**Decision:** WP-104 introduces both new tables in a single
migration file at slot **009**:
`data/migrations/009_create_player_profiles_and_links.sql`. The
file creates `legendary.player_profiles` (1:1 with
`legendary.players`) and `legendary.player_links` (many-to-1 with
`legendary.players`) in one idempotent script.

**Rationale.**
- **Slot 009 is next free.** Slots 001–008 are all taken (001–003
  server schema / rules / sessions; 004 players; 005
  replay_ownership; 006 replay_blobs; 007 competitive_scores; 008
  add_handle_to_players). No prior WP has reserved slot 009.
- **Single migration file for two related tables.** Both tables
  are owned by WP-104 and are introduced together at a single
  point in time. Splitting across `009_create_player_profiles.sql`
  and `010_create_player_links.sql` would consume two slots for
  no operational benefit — there is no scenario in which one
  table is wanted without the other within WP-104's scope.
- **`CREATE TABLE IF NOT EXISTS` idempotency.** The migration
  uses `IF NOT EXISTS` for both tables and for every index, so
  re-applying the script is a no-op (mirrors the WP-101 migration
  008 idempotency pattern).

**Rejected alternative — split into `009` + `010`.** Two migrations,
one per table. Rejected because: (a) consumes two slots for one
WP; (b) introduces a transient state where `legendary.player_profiles`
exists without `legendary.player_links`, which the executor would
have to reason about during partial-application recovery; (c) the
WP-101 precedent for adding three columns + one partial unique
index to `legendary.players` shipped as a single migration file —
the equivalent precedent for two related new tables is a single
file.

**Status:** Active. Status flips to `Resolved` once WP-104 lands.

**Citation:** `data/migrations/008_add_handle_to_players.sql`
(WP-101 precedent — single migration, multiple `ADD COLUMN IF
NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`); WP-052
migration `004_create_players_table.sql`; WP-103 migration
`006_create_replay_blobs_table.sql`.

### D-DEC-1 — Privacy Model Granularity [DECISION REQUIRED]

**Question.** How granular are the privacy toggles on
`legendary.player_profiles`? Options:

(a) **Per-section closed-set enum** (recommended default):
three columns `avatar_visibility`, `about_me_visibility`,
`links_visibility` each `text NOT NULL DEFAULT 'private'`,
constrained to `('private', 'public')`. Each section can be
hidden independently. The future surface-integration WP joins
these onto `PublicProfileView` and filters per-section.

(b) **Per-section booleans:** three columns `avatar_is_public`,
`about_me_is_public`, `links_is_public` each `boolean NOT NULL
DEFAULT false`. Same granularity as (a) but no extensibility for
future visibility values (e.g., `'friends'` once a friend-graph
WP lands).

(c) **Single profile-level enum:** one column
`profile_visibility` `text NOT NULL DEFAULT 'private'` constrained
to `('private', 'public')`. Coarser; an account is either fully
hidden or fully visible.

(d) **Single profile-level boolean + per-link override:** one
column `profile_is_public` on `player_profiles` plus per-row
`is_public` boolean on `player_links` (links granular, profile
all-or-nothing). Hybrid.

**Constraints (locked at draft time):**
- Whatever the executor picks, the default at row creation MUST
  be the most-private value (Vision §3 fail-closed posture) so
  a never-edited account leaks nothing.
- The closed set MUST NOT include `'friends'` at this lock —
  no friend-graph surface exists yet; introducing the value
  without a surface that consumes it creates dead-code risk.
- The PATCH endpoint MUST accept exactly the locked field set;
  unknown fields trigger a 400 with `{ error: 'invalid_request' }`.
- The future surface-integration WP (joining onto
  `PublicProfileView`) reads these fields and filters per-section;
  the join SQL MUST work with whichever shape (a/b/c/d) the
  executor picks.

**Recommended default (executor may override):** Option (a) —
per-section closed-set enum. Rationale: the closed-set values
(`'private'` / `'public'`) extend cleanly to `'friends'` once
a friend-graph WP lands, and per-section granularity matches
user expectations for "I want my avatar visible but my about-me
private". Booleans (option b) tie us to two values forever; a
single profile-level toggle (option c) loses granularity that
users typically want; the hybrid (option d) splits the model
across two tables with mismatched value spaces.

### D-DEC-2 — `player_links.provider` Validation [DECISION REQUIRED]

**Question.** What values are accepted for the `provider` column on
`legendary.player_links`?

(a) **Closed-set enum** (recommended default): a `text` column
constrained to a small allowlist (e.g.,
`('twitter', 'github', 'twitch', 'discord', 'youtube', 'website')`).
Adding a provider requires a migration + a DECISIONS.md entry.

(b) **Freeform string with length cap.** `text NOT NULL CHECK
(char_length(provider) BETWEEN 1 AND 32)`. Users type whatever
they want.

(c) **Closed set + freeform `'other'` fallback.** Same as (a)
plus an `'other'` value plus a `provider_label` column
(`text NULL CHECK (provider != 'other' OR provider_label IS NOT
NULL)`).

**Constraints (locked at draft time):**
- The set (or the freeform validation) MUST NOT permit values
  longer than 32 characters (URL-safe / display-safe limit).
- If the closed-set path is chosen, the initial set MUST be small
  enough to fit on one screen of the edit form (≤8 entries).
- The `url` column is always validated against an HTTPS-only
  pattern regardless of provider — this is locked under D-DEC-3
  below.

**Recommended default (executor may override):** Option (a) —
small closed-set allowlist with the initial values
`('twitter', 'github', 'twitch', 'discord', 'youtube', 'website')`.
Rationale: closed-set values give the UI predictable iconography
without per-row provider-icon configuration; freeform strings
(option b) push the icon problem to the client and create a
display surface that grows without governance; the hybrid
(option c) is more flexible but adds a second column for limited
benefit at MVP scope.

### D-DEC-3 — `avatar_url` and `player_links.url` Validation [DECISION REQUIRED]

**Question.** What URL validation does the server apply to the
two URL-typed columns?

(a) **HTTPS-only, any host** (recommended default for both):
column constraint `CHECK (avatar_url IS NULL OR avatar_url ~
'^https://')`. Same for `player_links.url`. Owner can paste any
HTTPS URL.

(b) **Closed origin allowlist for `avatar_url`** (e.g., only
`https://images.barefootbetters.com/...`); HTTPS-only any host
for `player_links.url`. Avatars constrained to the project's R2
host so the future avatar-upload WP (WP-106) is the only path
that produces avatar URLs.

(c) **HTTPS-only any host for both, with an additional
`isImageUrl` heuristic on `avatar_url`** (e.g., must end in
`.jpg`/`.jpeg`/`.png`/`.webp`).

**Constraints (locked at draft time):**
- The validation MUST happen at the SQL CHECK constraint level
  (defense-in-depth) AND at the application-layer validator (so
  the PATCH endpoint can return a typed 400 with a descriptive
  error message instead of a raw constraint-violation 500).
- The application-layer validator returns a typed `Result.fail`
  with code `'invalid_avatar_url'` or `'invalid_link_url'`; no
  exception is thrown.
- The validator MUST NOT attempt an HTTP HEAD / GET on the URL —
  no network calls at request time per the server-layer
  read-only-against-runtime-state discipline.

**Recommended default (executor may override):** Option (a) —
HTTPS-only, any host, for both columns. Rationale: the avatar
upload pipeline (WP-106) is a separate surface; gating
`avatar_url` to a closed origin in WP-104 would prevent users
from pasting a manually-uploaded image URL during the
WP-104-shipped / WP-106-not-yet-shipped window. Option (b) is
the right model once WP-106 lands but premature today. Option (c)
adds heuristics that reject legitimate URLs (e.g., URLs without
file extensions like CDN-served avatars).

### D-DEC-4 — `PATCH /api/me/profile` Semantics [DECISION REQUIRED]

**Question.** What are the merge semantics of the PATCH endpoint?

(a) **Sparse partial update** (recommended default): the request
body lists only the fields the owner wants to change; omitted
fields are left untouched. The endpoint distinguishes "set to
null" (explicit `"avatarUrl": null` in the body) from "leave
unchanged" (field key absent from the body).

(b) **Full replace.** The request body MUST list every editable
field; missing fields are set to `null`. Equivalent to a
`PUT /api/me/profile` semantically — the verb `PATCH` is a
misnomer in this option. Not recommended.

(c) **Sparse partial with explicit-null rejection.** Same as (a)
but rejects `"avatarUrl": null` (use a separate
`DELETE /api/me/profile/avatar` endpoint to clear). Adds
endpoint count.

**Constraints (locked at draft time):**
- Whatever the executor picks, the endpoint MUST be idempotent:
  identical request body twice produces identical row state
  twice. The `updated_at` column is updated on every successful
  PATCH regardless of whether any field actually changed (same
  pattern as `legendary.players.updated_at`).
- The endpoint MUST validate the entire request body before
  applying any change; partial-application of a multi-field
  PATCH is forbidden (transaction semantics).
- The endpoint MUST return the updated `OwnerProfileView` shape
  on success; clients re-render from the server response, never
  from a locally-merged copy.

**Recommended default (executor may override):** Option (a) —
sparse partial. Rationale: matches the JSON Merge Patch RFC 7396
semantics that JS clients commonly assume; matches the WP-052
`updatePlayerAccount` (if it existed — currently no update path
on the players table) intent; option (b) inverts the verb's
meaning; option (c) adds endpoints without clear benefit at
MVP scope.

**Norm (locked regardless of which option the executor picks):**
explicit `null` in the request body **clears** the corresponding
nullable field; key absence **leaves the field unchanged**. No
other interpretation is permitted — in particular, a string
literal `"null"` is treated as the literal four-character string,
not as a clear-intent signal. The validator distinguishes these
three cases at the top of `upsertOwnerProfile` before any SQL
issues.

**No companion `PUT /api/me/profile` endpoint.** A full-replace
PUT is intentionally omitted: it would invite accidental full-row
nulling on partial-form submissions and complicate the
audit-friendly sparse-update story. PATCH-only is the locked
verb posture for this surface; if a future surface needs
all-or-nothing replace semantics it MUST justify the addition in
its own DECISIONS.md entry rather than retroactively adding PUT
here.

### D-DEC-5 — `PUT /api/me/links` Semantics [DECISION REQUIRED]

**Question.** What are the semantics of the links endpoint?

(a) **Replace-all-by-list** (recommended default): the request
body is the full new array of `{ provider, url, isPublic }`
objects. The server transactionally `DELETE`s all existing rows
for the account and `INSERT`s the new array. Clients always send
the full list.

(b) **Upsert-by-id with separate DELETE.** Each link has a
server-assigned `linkId` (`bigserial`); PUT accepts an array of
`{ linkId?, provider, url, isPublic }` and upserts (INSERT if
`linkId` absent, UPDATE if present). A separate
`DELETE /api/me/links/:linkId` endpoint removes individual rows.

(c) **POST-add / DELETE-remove only** (no PUT): each operation
is an individual endpoint. Adds endpoint count.

**Constraints (locked at draft time):**
- Whatever the executor picks, the new state MUST be visible
  atomically — partial-state where some old rows persist
  alongside some new rows is forbidden (transaction semantics).
- The list SHALL be ordered (the server preserves the order
  the client sent); display order matters.
- The maximum number of links per account is locked at **10**
  (executor may override but must justify); over-cap requests
  return a typed 400 with `code: 'too_many_links'`.

**Recommended default (executor may override):** Option (a) —
replace-all-by-list. Rationale: simplest transactional shape;
clients render the existing list, let the user reorder /
add / remove via in-place form edits, and submit the full
array; no client-side ID tracking; mirrors the
`/api/me/links` semantics commonly seen in similar profile
surfaces (e.g., GitHub social accounts). Option (b) requires
the client to track server-assigned IDs across edit sessions;
option (c) bloats the endpoint count for marginal gain.

### D-DEC-6 — Route-Wiring Posture: Same-Commit vs Deferred [DECISION REQUIRED]

**Question.** Does WP-104 register the three new owner-only routes
in `apps/server/src/server.mjs` in the same commit, or ship them
as `Library-only` (mirroring WP-053 / WP-054 / WP-115's
ships-fail-closed-unwired precedent)?

(a) **Same-commit wiring** (recommended default): `server.mjs`
gains a `registerOwnerProfileRoutes(server.router, pool, {
requireAuthenticatedSession })` call alongside the existing
`registerHealthRoute` / `registerLeaderboardRoutes` calls. The
three catalog rows in `api-endpoints.md` are inserted with
`Status: Wired`. WP-104 ships a complete, end-to-end working
surface (modulo the WP-126 broker — which is fail-closed by
construction per D-11204).

(b) **Deferred wiring (`Library-only` rows).** WP-104 ships
the four production TS files + the migration + the Vue page
+ the `ownerProfileApi.ts` client; `server.mjs` is unmodified.
The three catalog rows are inserted with `Status:
Library-only`. A future request-handler WP wires the routes
and graduates the rows to `Wired`. Mirrors the WP-053 /
WP-054 / WP-102 (route-registration deferred per D-10202) /
WP-115 (eventually wired) precedent.

**Constraints (locked at draft time):**
- If (a), the executor MUST verify `pnpm --filter
@legendary-arena/server test` exits 0 with the new routes
wired (the existing `apps/server/src/server.mjs` route-wiring
contract test from WP-113 PS-5 must continue to pass).
- If (b), the catalog rows MUST carry the literal value
  `Library-only` and a `Notes` annotation citing the deferral
  rationale; the future request-handler WP that wires them
  graduates the rows to `Wired` per D-11804 single-row-graduation
  semantics.
- Whichever path is picked, the `requireAuthenticatedSession`
  provider MUST be caller-injected into
  `registerOwnerProfileRoutes` (not imported and called
  directly inside `ownerProfile.routes.ts`); this preserves the
  WP-101 / WP-102 / WP-104 caller-injected pattern and lets
  tests inject a fake session provider.

**Recommended default (executor may override):** Option (a) —
same-commit wiring. Rationale: WP-115 set the precedent for
wiring routes in the same commit as their library functions
(landed 2026-05-01 at `EC-119:`); WP-102's profile route was
deferred per D-10202 (long-lived `pg.Pool` lifecycle anchor
not yet existed) — but WP-115 introduced that anchor, so the
D-10202 deferral rationale no longer applies. WP-104's
`registerOwnerProfileRoutes` can wire alongside the existing
`registerLeaderboardRoutes` without scope creep.

---

## Assumes

- WP-102 complete. Specifically:
  - `apps/server/src/profile/profile.types.ts` exports
    `PublicProfileView`, `PublicReplaySummary`, `ProfileResult<T>`,
    `ProfileErrorCode`, `PROFILE_ERROR_CODES` (verified
    2026-04-28 at Commit A `369c0a4`).
  - `apps/server/src/profile/profile.logic.ts` exports
    `getPublicProfileByHandle`.
  - `apps/server/src/profile/profile.routes.ts` exports
    `registerProfileRoutes` (deferred per D-10202; not
    yet wired into `server.mjs` at session-context-WP-115
    time — WP-104 does NOT depend on the public route being
    wired).
  - `apps/arena-client/src/pages/PlayerProfilePage.vue` exists
    and renders the public profile via `?profile=<handle>`
    query parameter.
  - `apps/arena-client/src/App.vue` has `type AppRoute = 'fixture'
    | 'live' | 'lobby' | 'profile'`. WP-104 extends this to
    `... | 'me'`.
- WP-112 complete. Specifically:
  - `apps/server/src/auth/sessionToken.types.ts` exports
    `RequireAuthenticatedSessionOptions`, `SessionTokenRequest`,
    `SessionVerifier`, `AccountResolver`,
    `SessionValidationErrorCode`.
  - `apps/server/src/auth/sessionToken.logic.ts` exports
    `requireAuthenticatedSession`, `configureSessionValidation`,
    `extractBearerToken`.
  - The orchestrator returns
    `Result.fail({ code: 'session_verifier_not_configured' })`
    when no verifier is configured (D-11204 fail-closed posture);
    this is the production state until WP-126 lands. WP-104's
    routes invoke `requireAuthenticatedSession` and forward its
    `Result.fail` codes verbatim; no broker-specific error
    handling.
- WP-052 complete. Specifically:
  - `apps/server/src/identity/identity.types.ts` exports
    `AccountId`, `PlayerAccount`, `Result<T>`, `IdentityErrorCode`,
    `DatabaseClient`.
  - `apps/server/src/identity/identity.logic.ts` exports
    `findPlayerByAccountId`.
  - `data/migrations/004_create_players_table.sql` is applied
    with `legendary.players` carrying `(player_id bigserial PK,
    ext_id text UNIQUE, email text UNIQUE, display_name text,
    auth_provider text, auth_provider_id text, created_at,
    updated_at)`. WP-104's `legendary.player_profiles` and
    `legendary.player_links` carry FK to `legendary.players(player_id)`.
- WP-115 complete. Specifically:
  - `apps/server/src/db/database.ts` exports `createPool` /
    `closePool` over `pg.Pool`; `apps/server/src/server.mjs`
    constructs the pool exactly once at startup and passes it
    to `register*Routes(...)` registration helpers. WP-104
    extends this pattern with
    `registerOwnerProfileRoutes(server.router, pool, deps)`.
- `apps/arena-client/src/lib/api/profileApi.ts` exists (from
  WP-102) — WP-104 adds a sibling `ownerProfileApi.ts`, not a
  modification of `profileApi.ts`.
- `pnpm -r build` exits 0 on `main` HEAD post-WP-112 (verified
  2026-05-02 at `EC-112:`).
- `pnpm --filter @legendary-arena/server test` exits 0 on `main`
  HEAD (verified 2026-05-02: `pass 73 / fail 0 / skipped 36`).

If any of the above is false, this packet is **BLOCKED** and
must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"` —
  confirms `apps/server/**` may import `pg` and `apps/server/src/auth/**`;
  `apps/arena-client/**` may not import `apps/server/**` runtime
  code (only via fetch). WP-104 honors both.
- `docs/ai/ARCHITECTURE.md §"Persistence Boundaries"` — `G` /
  `ctx` are runtime-only; profile state is server-layer access
  metadata. WP-104 introduces no engine touch.
- `.claude/rules/server.md §"Server Role"` — server is a wiring
  layer; no game logic. WP-104's owner-edit routes are
  presentation / access concerns, not game logic.
- `.claude/rules/architecture.md §"Layer Boundary"` — runtime
  enforcement of the import rules.
- `docs/ai/work-packets/WP-102-public-profile-page.md §Locked
  contract values` — read the `PublicProfileView` shape and the
  module-path lock. WP-104 does NOT modify the public surface;
  the future surface-integration WP does.
- `docs/ai/work-packets/WP-112-session-token-validation-middleware.md
  §Scope (In) §B` — read the `requireAuthenticatedSession`
  signature and the `RequireAuthenticatedSessionOptions` shape.
  WP-104's routes invoke this contract via caller-injection.
- `docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md
  §Scope (In)` — read the `registerLeaderboardRoutes` pattern
  (Koa router adapter + caller-injected dependencies + same-commit
  wiring in `server.mjs`). WP-104's `registerOwnerProfileRoutes`
  mirrors this shape (per D-DEC-6 recommended default).
- `docs/ai/work-packets/WP-052-player-identity-replay-ownership.md
  §Locked contract values` — read the `legendary.players` table
  shape (column names verbatim). WP-104's FK references `player_id`.
- `docs/ai/REFERENCE/00.2-data-requirements.md §1, §4.1` —
  PostgreSQL namespace `legendary.*`; cross-service IDs use
  `ext_id text`. WP-104 follows both. Field names locked under
  D-DEC-1 + D-DEC-2 are added to §4.1 in the same commit if not
  yet present.
- `docs/ai/REFERENCE/00.6-code-style.md` — full English words
  (no abbreviations: `database` not `db`, `provider` not `prov`),
  `// why:` comments where reason is non-obvious, no `.reduce()`
  for branching loops, JSDoc on every function, named imports
  only, full-sentence error messages.
- `docs/ai/REFERENCE/api-endpoints.md` — read the `Wired —
  Reachable Over HTTP Today` → `Server-Registered Routes` section
  format. WP-104 inserts three new rows there per D-DEC-6
  recommended default.
- `docs/ai/DECISIONS.md` — scan recent entries (D-9901..D-9905,
  D-11201..D-11204, D-11501..D-11506, D-11804) to confirm the
  current state of identity / auth / catalog governance before
  drafting.
- `docs/ai/work-packets/WP-101-handle-claim-flow.md §Locked
  contract values` — the `legendary.players.handle_canonical`
  partial UNIQUE pattern is the locked precedent for the
  `legendary.player_profiles` 1:1 mapping (one row per
  `legendary.players.player_id`); WP-104 follows the same
  idempotent-migration shape.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all engine randomness uses
  `ctx.random.*` only. **N/A here** (no engine touch).
- Never throw inside boardgame.io move functions — return void on
  invalid input. **N/A here** (no moves introduced).
- Never persist `G`, `ctx`, or any runtime state. **N/A here**
  (no engine state touched).
- `G` must be JSON-serializable at all times. **N/A here**.
- ESM only, Node v22+ — all new files use `import`/`export`,
  never `require()`.
- `node:` prefix on all Node.js built-in imports (`node:test`,
  `node:assert`, `node:crypto` if used).
- Test files use `.test.ts` extension — never `.test.mjs`.
- No database or network access inside move functions or pure
  helpers. **N/A here** (no moves).
- Full file contents required for every new or modified file in
  the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- **No modification to WP-102 contract files.**
  `apps/server/src/profile/profile.types.ts`,
  `apps/server/src/profile/profile.logic.ts`,
  `apps/server/src/profile/profile.routes.ts`,
  `apps/server/src/profile/profile.logic.test.ts`,
  `apps/arena-client/src/pages/PlayerProfilePage.vue`, and
  `apps/arena-client/src/lib/api/profileApi.ts` are locked.
  WP-104 introduces sibling files (`ownerProfile.*` prefix and
  `MyProfilePage.vue` / `ownerProfileApi.ts`) instead of
  modifying the locked WP-102 set.
- **No modification to WP-052 contract files.**
  `apps/server/src/identity/identity.types.ts`,
  `apps/server/src/identity/identity.logic.ts`, migrations 004
  and 005 are locked.
- **No modification to WP-112 contract files.**
  `apps/server/src/auth/sessionToken.types.ts`,
  `apps/server/src/auth/sessionToken.logic.ts`,
  `apps/server/src/auth/accountLookup.logic.ts`, migrations are
  locked.
- **No modification to `.claude/rules/*.md`.** WP-104 introduces
  no new layer rule, no new architectural constraint, and no new
  authority. The existing `apps/server/src/profile/` directory
  classification (D-10201) covers WP-104's new files by precedent.
- **Owner-only writes go through `requireAuthenticatedSession`.**
  Every PATCH / PUT / GET handler invokes the caller-injected
  `requireAuthenticatedSession(req, options)` orchestrator as its
  first step; on any `Result.fail`, the handler returns the
  appropriate HTTP status with a typed `{ error: <code> }` body
  per the locked closed-set mapping below. No request silently
  passes.

  | `SessionValidationErrorCode` | HTTP status | Body |
  |---|---|---|
  | `'missing_token'` | **401** | `{ error: 'missing_token' }` |
  | `'invalid_token'` | **401** | `{ error: 'invalid_token' }` |
  | `'expired_token'` | **401** | `{ error: 'expired_token' }` |
  | `'unknown_account'` | **401** | `{ error: 'unknown_account' }` |
  | `'session_verifier_not_configured'` | **500** | `{ error: 'session_verifier_not_configured' }` |
  | `'lookup_failed'` | **500** | `{ error: 'lookup_failed' }` |

  **`'unknown_account'` returns 401, NOT 403.** Locked rationale:
  a 403 would distinguish "your token is valid but no account
  row exists" from "your token is invalid", giving an attacker
  an account-existence probe — they could enumerate which
  `(authProvider, authProviderSub)` pairs correspond to
  provisioned vs. unprovisioned accounts by counting 401-vs-403
  responses. Collapsing both to 401 with distinct `error`
  payload codes preserves the closed-set diagnostic surface for
  legitimate callers without leaking presence-vs-absence to
  attackers. Mirrors the WP-102 `{ "error": "player_not_found" }`
  no-information-leak posture verbatim.
- **Read-only against existing tables; writes only to new tables.**
  No `INSERT`, `UPDATE`, or `DELETE` against
  `legendary.players`, `legendary.replay_ownership`,
  `legendary.replay_blobs`, or `legendary.competitive_scores` in
  any file under `apps/server/src/profile/ownerProfile.*`. Writes
  only target the new `legendary.player_profiles` and
  `legendary.player_links` tables.
- **No engine import.** No file under
  `apps/server/src/profile/ownerProfile.*` or
  `apps/arena-client/src/pages/MyProfilePage.vue` /
  `apps/arena-client/src/lib/api/ownerProfileApi.ts` may import
  `boardgame.io`, `@legendary-arena/game-engine`,
  `@legendary-arena/registry`, or `@legendary-arena/preplan`.
  Verified via `Select-String` in §Verification Steps.
- **No new npm dependencies.** All wiring uses Node's built-in
  `fetch`, the existing Vue 3 / Pinia stack (no `vue-router`),
  the existing `pg` client, and the existing WP-112 / WP-115
  caller-injected patterns. Verified via `git diff` of every
  `package.json` after the close-out commit.
- **Hanko is invisible.** No `'hanko'` literal, no
  `@teamhanko/*` import, no `hanko.io` reference, no Hanko-
  specific type or fixture in any WP-104 file. Per WP-099 D-9904.
  Verified via grep at §Verification Steps.
- **No `'hanko'` as `auth_provider` value.** Per WP-099 D-9902.
  WP-104 does NOT echo `auth_provider` to clients;
  `OwnerProfileView` does not include the field.
- **`OwnerProfileView` excludes private fields.** The DTO MUST
  NOT include `email`, `auth_provider`, `auth_provider_id`, or
  `created_at` from `legendary.players`. The DTO carries only
  the owner-editable fields (`avatarUrl`, `aboutMe`, privacy
  toggles per D-DEC-1, `links` array per D-DEC-2/D-DEC-5,
  `updatedAt`).
- **Privacy defaults are most-private.** Per D-DEC-1's locked
  constraint, the default value at row creation is the most-
  private value (e.g., `'private'` for the closed-set option,
  `false` for the boolean option). A never-edited account leaks
  nothing.
- **Atomic writes only.** PATCH `/api/me/profile` and PUT
  `/api/me/links` execute their multi-statement updates inside
  a single PostgreSQL transaction (`BEGIN; ... COMMIT;`).
  Partial-application is forbidden.
- **No CSRF middleware in scope.** Per D-11202 (bearer header
  only), the auth carrier is the `Authorization: Bearer`
  header; cookies are not consulted. No CSRF surface is
  introduced; cookie support is deferred to WP-126 or a future
  hardening WP that introduces both cookies and CSRF together.
- **Lifecycle prohibition (locked, mirrors WP-102 RISK #16
  precedent).** The four exported owner-profile functions —
  `getOwnerProfile`, `upsertOwnerProfile`, `replaceOwnerLinks`,
  `registerOwnerProfileRoutes` — plus the implicit consumer
  surface `fetchOwnerProfile` / `updateOwnerProfile` /
  `replaceOwnerLinks` on the client (`ownerProfileApi.ts`)
  MUST NOT be called from any of the following sites: `game.ts`,
  any `LegendaryGame.moves` entry, any phase hook (`onBegin` /
  `onEnd` / `endIf`), any file under `packages/` (`game-engine`,
  `registry`, `preplan`, `vue-sfc-loader`), any file under
  `apps/replay-producer/` or `apps/registry-viewer/`, any file
  under `apps/server/src/identity/`, `apps/server/src/replay/`,
  `apps/server/src/competition/`, `apps/server/src/par/`,
  `apps/server/src/rules/`, or `apps/server/src/game/`. They are
  consumed only by their own test file
  (`ownerProfile.logic.test.ts`), by `ownerProfile.routes.ts`
  (route adapter), by `apps/server/src/server.mjs` (one-line
  registration call per D-DEC-6 = (a) default), and by
  `apps/arena-client/src/pages/MyProfilePage.vue` via
  `ownerProfileApi.ts`. Verified at execution by grep — the
  EC-128 §2 verification gates enforce zero forbidden-import
  matches in the four listed sites. Mirrors the WP-101 / EC-114
  and WP-102 / EC-117 lifecycle-prohibition precedents.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop
  and ask the human before proceeding — never guess or invent
  field names, type shapes, or file paths.
- If WP-102 / WP-112 / WP-052 / WP-115 contract files have
  drifted from the §Assumes references (e.g., a WP-126 landing
  has changed `requireAuthenticatedSession`'s signature),
  STOP and re-run pre-flight; do not silently paraphrase.
- If during execution any of the six `[DECISION REQUIRED]`
  blocks cannot be resolved at the recommended default,
  STOP and ask before coding; the decision is recorded in
  `DECISIONS.md` at the close-out commit.

**Locked contract values:**
- **Module path:** `apps/server/src/profile/` (per D-10401).
  Owner-edit files use the `ownerProfile.*` filename prefix.
- **Migration slot:** `data/migrations/009_create_player_profiles_and_links.sql`
  (per D-10402).
- **HTTP routes (locked):**
  - `GET /api/me/profile` — returns `OwnerProfileView` for the
    authenticated owner. Auth: `authenticated-session-required`
    per D-9905.
  - `PATCH /api/me/profile` — sparse partial update per D-DEC-4.
    Auth: `authenticated-session-required`.
  - `PUT /api/me/links` — replace-all-by-list per D-DEC-5. Auth:
    `authenticated-session-required`.
- **`OwnerProfileView` shape (composite — exact field set
  locked under D-DEC-1 / D-DEC-2 at execution; the executor
  pastes the resolved shape into `ownerProfile.types.ts` per
  the WP-102 `PublicProfileView` precedent).**
- **`OwnerProfileView.links` ordering invariant (locked).**
  The `links` array is ALWAYS returned sorted ascending by
  `displayOrder` (ties broken by `link_id` ascending — should
  not occur given the UNIQUE `(player_id, display_order)`
  constraint, but defended in code). Both the SELECT inside
  `getOwnerProfile` and the SELECT inside `replaceOwnerLinks`'s
  post-write composition path apply `ORDER BY display_order
  ASC, link_id ASC` verbatim. Clients MUST NOT defensively
  re-sort the array; the server is authoritative on order.
- **`OwnerProfileErrorCode` union (closed; minimal shape locked
  here, executor extends per D-DEC-3 / D-DEC-4 / D-DEC-5):**
  `'invalid_request' | 'invalid_avatar_url' | 'invalid_link_url'
  | 'too_many_links' | 'unknown_account'` (the WP-052
  `unknown_account` value reused; **NO** `Result<T>` re-import
  from `../identity/identity.types.js` because that union is
  keyed on `IdentityErrorCode` per the WP-102 PS-5 precedent —
  WP-104 declares its own `OwnerProfileResult<T>` locally
  mirroring the WP-102 `ProfileResult<T>` pattern).
- **Request-shape locks per endpoint:** the executor pastes
  the exact JSON shape into `ownerProfile.types.ts` at
  execution; the shape is locked under D-DEC-4 / D-DEC-5 (PATCH
  sparse partial; PUT full-replace-by-list).
- **404 / 401 / 500 body discipline:** every error response
  body is the literal `{ error: <code> }` shape (mirrors WP-102
  `{ error: 'player_not_found' }` precedent); no information
  about whether the failure was missing token / invalid token
  / expired token / unknown account beyond the closed-set
  `code` value.
- **Vue surface route:** `?route=me` query parameter on the
  arena-client root URL (extends `type AppRoute` with
  `'me'`). Same hand-rolled query-string router as WP-102's
  `?profile=<handle>` extension.

---

## Scope (In)

### A) `data/migrations/009_create_player_profiles_and_links.sql` — new

Idempotent DDL for two new tables in the `legendary.*` namespace:

- `legendary.player_profiles` — 1:1 with `legendary.players`:
  - `player_id bigint PRIMARY KEY REFERENCES legendary.players(player_id) ON DELETE CASCADE`
  - `avatar_url text NULL` with `CHECK (avatar_url IS NULL OR avatar_url ~ '^https://')` per D-DEC-3 default
  - `about_me text NULL` with `CHECK (about_me IS NULL OR char_length(about_me) <= 500)`
  - Privacy toggle columns per D-DEC-1's locked option (recommended default: three `text NOT NULL DEFAULT 'private' CHECK (... IN ('private', 'public'))` columns named `avatar_visibility` / `about_me_visibility` / `links_visibility`).
  - `updated_at timestamptz NOT NULL DEFAULT now()`.
- `legendary.player_links` — many-to-1 with `legendary.players`:
  - `link_id bigserial PRIMARY KEY`
  - `player_id bigint NOT NULL REFERENCES legendary.players(player_id) ON DELETE CASCADE`
  - `provider text NOT NULL` with the closed-set CHECK constraint per D-DEC-2 default
  - `url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 2048)` per D-DEC-3 default
  - `is_public boolean NOT NULL DEFAULT false` (most-private default)
  - `display_order int NOT NULL DEFAULT 0` (preserves the order the client sent per D-DEC-5)
  - Unique constraint `(player_id, display_order)` so reordering is deterministic.
  - `CREATE INDEX IF NOT EXISTS idx_player_links_player_id ON legendary.player_links(player_id);` — every read path
    on this table filters by `player_id` first; the explicit
    index protects the hot path against PostgreSQL's planner
    choosing a sequential scan as the table grows. The
    `(player_id, display_order)` UNIQUE index alone is
    sufficient for prefix lookups, but a dedicated single-column
    index on `player_id` is the cheaper plan for the common
    `WHERE player_id = $1 ORDER BY display_order` shape and
    is consistent with the WP-052 / WP-101 single-column-FK
    indexing posture on `legendary.replay_ownership`.
- All `CREATE TABLE`, `CREATE INDEX`, and `CHECK` constraints use `IF NOT EXISTS` (idempotent re-application — mirrors migration 008).

### B) `apps/server/src/profile/ownerProfile.types.ts` — new

Locked exports:

- `interface OwnerProfileView` — owner's editable view of own
  profile. Locked field set per D-DEC-1 / D-DEC-2 / D-DEC-3 at
  execution.
- `interface OwnerProfileLink` — `{ provider, url, isPublic,
  displayOrder }`.
- `type OwnerProfileErrorCode` — closed union; locked initial
  set above; executor extends per resolved decisions.
- `OWNER_PROFILE_ERROR_CODES: readonly OwnerProfileErrorCode[]`
  — canonical readonly array paired with the union (drift test
  in §Scope (In) §D).
- `type OwnerProfileResult<T>` — declared locally mirroring
  WP-102 `ProfileResult<T>` (NOT re-imported from
  `../identity/identity.types.js` — `IdentityErrorCode` cannot
  carry the WP-104 codes).
- Re-imports `AccountId`, `PlayerAccount`, `DatabaseClient`,
  `Result` from `../identity/identity.types.js` for type
  passthrough where caller boundaries already use them. Does
  NOT redeclare these.
- Re-imports
  `RequireAuthenticatedSessionOptions`, `SessionTokenRequest`
  from `../auth/sessionToken.types.js` for the route handler
  signatures.

### C) `apps/server/src/profile/ownerProfile.logic.ts` — new

All exports take `database: DatabaseClient` (caller-injected per
WP-052 / WP-101 / WP-102 precedent).

- `getOwnerProfile(accountId, database):
  Promise<OwnerProfileResult<OwnerProfileView>>` — read the
  authenticated owner's own profile + links. Issues two
  read-only SELECTs (one against `legendary.player_profiles`,
  one against `legendary.player_links`), composes the view as
  a fresh literal per call (aliasing-prevention discipline
  from WP-102 RISK #17), returns `Result.ok(view)`. On
  `unknown_account` (extremely rare race — the
  `requireAuthenticatedSession` orchestrator just produced the
  `accountId`), returns `Result.fail({ code: 'unknown_account' })`.
- **Read invariant (locked).** `getOwnerProfile` MUST NOT
  create, update, or delete any row. If no
  `legendary.player_profiles` row exists for the supplied
  `accountId` (a never-edited account), the helper returns a
  **synthesized default view** — every owner-editable field at
  its locked default per D-DEC-1 (most-private privacy values,
  `null` avatar URL, `null` about-me, empty `links` array),
  `updatedAt` set to the row-equivalent of "no edit yet" (per
  D-DEC-1's resolved option — the executor picks either `null`
  or the account's `created_at` timestamp; recommended:
  `null` to make the no-edit-yet state explicit on the wire).
  No INSERT fires on the read path. The first PATCH is the
  sole site that creates the `legendary.player_profiles` row
  (via the `INSERT ... ON CONFLICT (player_id) DO UPDATE`
  upsert pattern in `upsertOwnerProfile`).
- `upsertOwnerProfile(accountId, patch, database):
  Promise<OwnerProfileResult<OwnerProfileView>>` — sparse
  partial update per D-DEC-4. Validates the entire request
  body before applying. Single PostgreSQL transaction. On
  validation failure, returns the appropriate
  `Result.fail({ code: 'invalid_request' | 'invalid_avatar_url' })`.
  Uses an `INSERT ... ON CONFLICT (player_id) DO UPDATE SET ...`
  pattern so the first PATCH on a never-edited account creates
  the row.
- **Three-state input discrimination (locked under D-DEC-4).**
  The validator distinguishes the three input states via
  explicit `Object.hasOwn` checks; inline ternaries returning
  `T | undefined` are forbidden under
  `exactOptionalPropertyTypes`. Pattern (locked verbatim):

  ```ts
  // why: Object.hasOwn distinguishes "key absent" (leave
  // unchanged) from "key present, value null" (clear).
  // typeof check distinguishes "value is the literal four-
  // character string 'null'" (set the field to that string)
  // from "value is the JSON null sentinel" (clear).
  if (Object.hasOwn(patch, 'avatarUrl') === false) {
    // leave avatar_url unchanged — do not append to the SET clause
  } else if (patch.avatarUrl === null) {
    setClauseParts.push('avatar_url = NULL');
  } else if (typeof patch.avatarUrl === 'string') {
    setClauseParts.push(`avatar_url = $${paramIndex++}`);
    params.push(patch.avatarUrl);
  } else {
    return { ok: false, code: 'invalid_request', reason: '...' };
  }
  ```

  Conditional assignment (build the SET clause without the
  field, then conditionally append) is the locked pattern;
  inline ternaries that yield `T | undefined` for the value
  branch fail TypeScript's `exactOptionalPropertyTypes` check
  and are forbidden. The same `Object.hasOwn` discrimination
  applies to `aboutMe` and to every privacy-toggle field.
- `replaceOwnerLinks(accountId, links, database):
  Promise<OwnerProfileResult<OwnerProfileView>>` — replace-all-
  by-list per D-DEC-5. Validates the entire array before
  applying. Single PostgreSQL transaction
  (`BEGIN; DELETE; INSERT...; COMMIT;`). Returns the updated
  full `OwnerProfileView` so clients re-render from the server
  authoritative state.
- Validators (`validateAvatarUrl`, `validateLinkUrl`,
  `validateAboutMe`, `validateLinks`) — pure functions; no DB
  access; return typed Results.

### D) `apps/server/src/profile/ownerProfile.logic.test.ts` — new

Uses `node:test` and `node:assert` only. No `boardgame.io` import.
No `@legendary-arena/game-engine` import.

**Suite wrapping:** all tests in this file are wrapped in a
single top-level `describe('owner profile logic (WP-104)',
...)` block. Adds **+1 suite** to the server baseline (post-WP-112:
14 → 15).

**Test count target: 10–14 cases** covering:
- `OWNER_PROFILE_ERROR_CODES` matches the union (drift, forward
  + backward inclusion).
- `validateAvatarUrl` accepts an HTTPS URL, rejects HTTP, rejects
  non-URL strings.
- `validateLinks` rejects an over-cap array (> 10 entries per
  D-DEC-5 default), rejects an entry whose provider is outside
  the closed set.
- `getOwnerProfile` returns the row when one exists (DB-required).
- `getOwnerProfile` returns the privacy-default initial state
  when no row exists (DB-required).
- `upsertOwnerProfile` sparse partial preserves un-listed fields
  (DB-required).
- `upsertOwnerProfile` rejects an invalid avatar URL with code
  `'invalid_avatar_url'` (DB-required).
- `replaceOwnerLinks` transactionally replaces the full list
  (DB-required).
- `replaceOwnerLinks` rejects over-cap with code `'too_many_links'`
  (pure — no DB needed).

DB-required tests SHALL use the locked WP-052 / WP-101 /
EC-112 fixture pattern verbatim — no ad-hoc environment checks.
The pattern is:

```ts
const hasTestDatabase = process.env.TEST_DATABASE_URL !== undefined;
// ...inside each DB-required test:
test(
  'description',
  hasTestDatabase ? {} : { skip: 'requires test database' },
  async () => { /* ... */ },
);
```

The boolean lives at module scope (top of the test file, after
imports); each per-test option object is the literal
`hasTestDatabase ? {} : { skip: 'requires test database' }`
expression. Bespoke spellings like `if (!hasTestDatabase) return`,
manual `t.skip()` calls, or `{ skip: <other-string> }` variants
are forbidden — they trip drift detection and break the
homogeneous skip-output that `pnpm --filter
@legendary-arena/server test` emits.

Test cleanup follows the EC-112 lesson — each DB-required test
generates unique `player_id` values via per-suite-run identifiers
(NOT `beforeEach` `DELETE`) so the §2 grep gates pass. Mirror the
EC-112 `accountLookup.logic.test.ts` per-suite-run-uniqueness
pattern verbatim.

### E) `apps/server/src/profile/ownerProfile.routes.ts` — new

- `registerOwnerProfileRoutes(router, database, deps): void` —
  Koa router adapter. `deps` is `{ requireAuthenticatedSession:
  (req, options) => Promise<Result<AccountId>> }` plus the
  options needed by the orchestrator (`{ verifier?,
  accountResolver?, database }`); caller-injected per the
  WP-101 / WP-102 / WP-104 / WP-115 precedent.
- Three handlers:
  - `GET /api/me/profile` — invoke `requireAuthenticatedSession`,
    on success call `getOwnerProfile`, return 200 / 401 / 500.
  - `PATCH /api/me/profile` — invoke `requireAuthenticatedSession`,
    parse + validate request body, call `upsertOwnerProfile`,
    return 200 / 400 / 401 / 500.
  - `PUT /api/me/links` — invoke `requireAuthenticatedSession`,
    parse + validate request body, call `replaceOwnerLinks`,
    return 200 / 400 / 401 / 500.
- Sets `Cache-Control: no-store` as the first statement of every
  handler (mirrors the WP-115 D-11504 lock for response error
  paths).
- Never throws lexically — every failure path returns a typed
  HTTP response with the locked `{ error: <code> }` body shape.
- Mirrors the WP-115 `leaderboard.routes.ts` structure.

### F) `apps/server/src/server.mjs` — modified (per D-DEC-6 default)

> If D-DEC-6 = (a) — same-commit wiring (recommended default).
> If D-DEC-6 = (b) — deferred wiring — this file is unmodified
> and the catalog rows ship as `Library-only`.

Add a single line wiring
`registerOwnerProfileRoutes(server.router, pool, {
requireAuthenticatedSession })` alongside the existing
`registerLeaderboardRoutes` call. The
`requireAuthenticatedSession` provider is imported from
`./auth/sessionToken.logic.js` at module top-level; the
`{ verifier, accountResolver, database }` options are bundled
by the route adapter at request time per the WP-115 precedent.
The line is inserted immediately after the existing
`registerLeaderboardRoutes(...)` call and before `Server({...})`
construction (per the WP-115 / WP-113 PS-5 wiring-ordering
invariant).

### G) `apps/arena-client/src/lib/api/ownerProfileApi.ts` — new

- `fetchOwnerProfile(authToken): Promise<OwnerProfileView>` —
  GET wrapper.
- `updateOwnerProfile(authToken, patch): Promise<OwnerProfileView>`
  — PATCH wrapper.
- `replaceOwnerLinks(authToken, links): Promise<OwnerProfileView>`
  — PUT wrapper.
- All wrappers call Node's built-in `fetch`. No `axios`, no
  `node-fetch`. The `authToken` is sourced from a future
  client-side auth-store integration (deferred — WP-104's
  client surface is presentation-only; auth-store integration
  is paired with WP-126's broker integration).
- During the WP-104-shipped / WP-126-not-yet-shipped window,
  the client surface is reachable but every authenticated
  request returns 500 with `code:
  'session_verifier_not_configured'` per D-11204. The Vue page
  surfaces this gracefully — see §H.

### H) `apps/arena-client/src/pages/MyProfilePage.vue` — new

Vue 3 SFC mirroring `PlayerProfilePage.vue`'s structure
(separate-compile via `defineComponent({ setup() {...} })` per
D-6512 / P6-30).

- Renders three regions:
  1. **Profile header section** — avatar preview (URL-bound
     `<img>`), display name (read-only from the authenticated
     `accountId`'s `legendary.players` row via WP-052
     `findPlayerByAccountId`), about-me preview.
  2. **Edit form** — three text inputs (`avatarUrl`, `aboutMe`,
     plus the privacy-toggle controls per D-DEC-1's resolved
     option) and a "Save changes" submit button.
  3. **Links manager** — a list of link rows (provider dropdown,
     URL text input, "Public" checkbox), drag-or-button reorder,
     "Add link" button, "Save links" submit button.
- Calls `fetchOwnerProfile` on mount.
- On edit-form submit, calls `updateOwnerProfile`; on success,
  re-renders from the server response (no client-side merge).
- On links-form submit, calls `replaceOwnerLinks`; on success,
  re-renders from the server response.
- On any 500 response carrying `{ error:
  'session_verifier_not_configured' }`, surfaces a banner with
  the locked verbatim copy: **"Authentication is not yet
  configured on this server. Owner profile editing is
  temporarily unavailable."** Per D-11204 fail-closed posture
  during the WP-104-shipped / WP-126-not-yet-shipped window.
  The copy avoids "please try again later" because retry will
  not change the outcome — only a server-side wiring change
  (when WP-126 lands and production wiring calls
  `configureSessionValidation` at startup) flips the response.
  On a generic 500 (`{ error: 'lookup_failed' }`), surface a
  separate banner: **"Server error — owner profile editing is
  temporarily unavailable. Try again in a moment."** (where
  retry IS appropriate because the underlying database fault
  is typically transient).
- All form inputs have associated `<label>` elements; arena-
  client's existing `vuejs-accessibility` lint rules are
  preserved (per the EC-120 LoadoutBuilder a11y precedent).

### I) `apps/arena-client/src/App.vue` — modified

Apply the **minimum** diff:

1. Extend the route union to `type AppRoute = 'fixture' | 'live'
   | 'lobby' | 'profile' | 'me'`.
2. Extend `parseQuery()` to read `?route=me`. Priority: a `route=me`
   query value resolves before the existing `?profile=` /
   `?match=` / `?fixture=` keys (the owner's view of their own
   profile takes priority over any other route value when
   present).
3. Conditionally render `<MyProfilePage />` in the template's
   `<v-if="route === 'me'">` branch (mirrors the existing
   `'profile'` / `'live'` / `'lobby'` branches).
4. Lazy-import via `defineAsyncComponent(() => import(
   './pages/MyProfilePage.vue'))` (matches WP-102's
   `PlayerProfilePage.vue` lazy-import precedent).
5. No `vue-router` import. No `<router-view>`. No `<router-link>`.
6. No route guard added at this layer; the server-side
   `requireAuthenticatedSession` is the gate, not a client-side
   redirect.

### J) `docs/ai/REFERENCE/api-endpoints.md` — modified

Add three new rows in the `## Wired — Reachable Over HTTP Today`
→ `### Server-Registered Routes` section (per D-DEC-6 = (a)
default), or in the `## Library-only — Function Reachable Via
Direct Import, No HTTP Surface Today` section (per D-DEC-6 =
(b)). Each row carries:
- `Status`: per D-DEC-6 — `Wired` (default) or `Library-only`.
- `Auth`: `authenticated-session-required` (closed-set value
  per D-9905).
- `Method` / `Path`: the three values from §Locked contract values
  above.
- `Authorizing WP`: `WP-104`.
- `Notes`: cite WP-112 (session-token gate); cite the privacy
  defaults; cite the WP-126 fail-closed window per D-11204.

Plus governance close-out in the same commit (per the recent
WP-115 / WP-122 / WP-125 / EC-112 precedent — ledger updates land
in the same commit as the production files):

- `docs/ai/STATUS.md` — `### WP-104 / EC-128 Executed — Owner
  Profile Data Model & /me Edit ({YYYY-MM-DD})` block at top of
  `## Current State`.
- `docs/ai/DECISIONS.md` — D-10401 + D-10402 (locked here)
  plus the four executor-locked decisions (D-DEC-1 → D-10403,
  D-DEC-2 → D-10404, D-DEC-3 → D-10405, D-DEC-4 → D-10406,
  D-DEC-5 → D-10407, D-DEC-6 → D-10408) inserted in numeric
  order.
- `docs/ai/work-packets/WORK_INDEX.md` — WP-104 row checked off
  with date + commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-128 row flipped
  Draft → Done.

---

## Out of Scope

- **Avatar upload pipeline.** WP-104 stores `avatar_url` only;
  the R2 + MIME / size validation pipeline is WP-106's scope.
  The avatar-URL CHECK constraint per D-DEC-3 default permits
  any HTTPS URL — including a manually-uploaded image URL during
  the WP-104-shipped / WP-106-not-yet-shipped window.
- **Public-profile integration.** WP-104 does NOT modify
  WP-102's `PublicProfileView` or `getPublicProfileByHandle`.
  The future surface-integration WP joins owner-edit fields onto
  the public view with per-section visibility filtering driven
  by the privacy toggles introduced here.
- **Badges (WP-105).** No badge surfacing on the edit page or
  the underlying tables. WP-105 owns its own table and
  rendering.
- **Integrity admin (WP-107+).** No admin endpoints introduced.
- **Payments / supporter tiers (WP-108+).** Out of scope.
- **Tournament identity (WP-109).** WP-109 extends
  `legendary.player_profiles` with team-affiliation data; that
  extension is WP-109's scope, not WP-104's. WP-104's table
  shape is forward-compatible (column-additive) per the
  migration-additivity precedent. **Premature-schema-creep
  prohibition (locked).** WP-104 MUST NOT introduce nullable
  placeholder columns for future team / cohort / friend-graph
  data on either new table — no `team_id NULL`, no
  `cohort_label NULL`, no `friends_visibility` enum value, no
  forward-reference fields of any kind. Every such extension
  is column-additive in the WP that authors it (WP-109 for
  teams; a future friend-graph WP for friends). Forward-
  reference columns rot when their authoring WP shifts scope
  or is canceled, and dead columns are expensive to remove
  once any code path has touched them.
- **Account deletion / GDPR endpoints.** Future WP that extends
  WP-052 `deletePlayerData`.
- **Friend graphs / follow models.** No friend-graph table, no
  follow / unfollow endpoints. Per D-DEC-1's locked constraint,
  the closed set does NOT include `'friends'` at this lock.
- **Authentication broker wiring.** WP-126 supplies the
  `SessionVerifier` implementation; WP-104 does not invoke any
  broker. During the WP-104-shipped / WP-126-not-yet-shipped
  window, every authenticated route returns 500 per D-11204
  fail-closed posture.
- **CSRF / cookie carriers.** Per D-11202, the auth carrier is
  the bearer header only; no cookie path, no CSRF middleware.
- **Rate limiting.** Per D-11503, rate limiting is deferred to
  a future hardening WP.
- **Multi-device session management.** Out of scope.
- **Refactors, cleanups, or "while I'm here" improvements.** Out
  of scope unless explicitly listed in §Scope (In).

---

## Files Expected to Change

- `data/migrations/009_create_player_profiles_and_links.sql` — **new** — migration creating both new tables.
- `apps/server/src/profile/ownerProfile.types.ts` — **new** — types + closed-union error codes.
- `apps/server/src/profile/ownerProfile.logic.ts` — **new** — `getOwnerProfile`, `upsertOwnerProfile`, `replaceOwnerLinks`, validators.
- `apps/server/src/profile/ownerProfile.logic.test.ts` — **new** — `node:test` suite (10–14 cases).
- `apps/server/src/profile/ownerProfile.routes.ts` — **new** — Koa router adapter for the three new endpoints.
- `apps/server/src/server.mjs` — **modified** — single line registering `registerOwnerProfileRoutes` (per D-DEC-6 = (a) default).
- `apps/arena-client/src/lib/api/ownerProfileApi.ts` — **new** — typed `fetch` wrappers for the three endpoints.
- `apps/arena-client/src/pages/MyProfilePage.vue` — **new** — owner-edit page with three regions (header, profile form, links manager).
- `apps/arena-client/src/App.vue` — **modified** — extend `AppRoute` with `'me'` + lazy-import the new page.
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — three new rows per D-11804.

Plus governance close-out (per the recent WP-115 / WP-122 / WP-125 / EC-112 precedent — ledger updates land in the same commit as the production files):

- `docs/ai/STATUS.md` — execution entry.
- `docs/ai/DECISIONS.md` — D-10401..D-10408 inserted in numeric order.
- `docs/ai/work-packets/WORK_INDEX.md` — WP-104 row checked off.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-128 row Draft → Done.

**Total staged set at session close:** 10 production / reference files + 4 governance ledgers = **14 files**. Within the WP-115-precedent budget.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Module Layout
- [ ] `apps/server/src/profile/` directory contains exactly four NEW WP-104 files (`ownerProfile.types.ts`, `ownerProfile.logic.ts`, `ownerProfile.logic.test.ts`, `ownerProfile.routes.ts`); WP-102's existing four files are byte-identical pre- and post-WP-104.
- [ ] `data/migrations/009_create_player_profiles_and_links.sql` exists and is idempotent (`CREATE TABLE IF NOT EXISTS` everywhere).

### Schema
- [ ] `legendary.player_profiles` table exists with the locked column set (per D-DEC-1) including `player_id PK FK`, `avatar_url`, `about_me`, the privacy-toggle columns, and `updated_at`.
- [ ] `legendary.player_links` table exists with the locked column set (per D-DEC-2 / D-DEC-5) including `link_id`, `player_id FK`, `provider`, `url`, `is_public`, `display_order`.
- [ ] All FK references use `ON DELETE CASCADE` so WP-052's `deletePlayerData` removes child rows.
- [ ] Privacy defaults are most-private per D-DEC-1's locked constraint.

### `requireAuthenticatedSession` Gating
- [ ] Every PATCH / PUT / GET handler under `apps/server/src/profile/ownerProfile.routes.ts` invokes `requireAuthenticatedSession` as the first step before any business logic.
- [ ] On any `Result.fail` from the orchestrator, the handler returns a typed HTTP response (401 / 500 per the locked mapping).
- [ ] No handler catches and silently ignores the orchestrator's failure code.

### Endpoint Behavior
- [ ] `GET /api/me/profile` returns 200 with `OwnerProfileView` for the authenticated owner; 401 / 500 per the closed-union code mapping.
- [ ] `PATCH /api/me/profile` accepts a sparse partial body per D-DEC-4's recommended default; returns 200 with the updated `OwnerProfileView`; rejects invalid avatar URLs with 400 / `'invalid_avatar_url'`.
- [ ] `PUT /api/me/links` accepts a full-replace array per D-DEC-5's recommended default; returns 200 with the updated `OwnerProfileView`; rejects over-cap (> 10) with 400 / `'too_many_links'`.
- [ ] All handlers set `Cache-Control: no-store` as the first statement of every response path.
- [ ] All multi-statement writes execute inside a single PostgreSQL transaction.

### `OwnerProfileView` DTO Hygiene
- [ ] `OwnerProfileView` does NOT include `email`, `auth_provider`, `auth_provider_id`, or `created_at` from `legendary.players`.
- [ ] `OwnerProfileView.links` array elements have exactly the fields locked under D-DEC-2 / D-DEC-5; no `playerId`, no `linkId` (server-internal).

### Layer Boundary
- [ ] No `boardgame.io` import in any WP-104 file (verified by grep).
- [ ] No import from `packages/game-engine/`, `packages/registry/`, `packages/preplan/` in any WP-104 file.
- [ ] No `'hanko'` literal, no `@teamhanko/*` import, no `hanko.io` reference in any WP-104 file (verified by grep).

### Tests
- [ ] All `ownerProfile.logic.test.ts` tests pass; pure tests always run; DB-required tests skip cleanly without `TEST_DATABASE_URL`.
- [ ] Server test baseline preserved + new tests pass: post-WP-112 `pass 73 / fail 0 / skipped 36` → post-WP-104 grows by 10–14 always-runs + DB-required-skipped count.
- [ ] Engine test baseline `604 / 132 / 0` UNCHANGED.

### Scope Enforcement
- [ ] `git diff apps/server/src/profile/profile.{types,logic,routes}.ts apps/server/src/profile/profile.logic.test.ts apps/arena-client/src/pages/PlayerProfilePage.vue apps/arena-client/src/lib/api/profileApi.ts` returns no output (WP-102 contract files unmodified).
- [ ] `git diff apps/server/src/identity/ apps/server/src/auth/ data/migrations/00{4,5,6,7,8}_*.sql .claude/` returns no output.
- [ ] `git diff apps/server/package.json apps/arena-client/package.json` returns no output (zero new npm deps).
- [ ] `git diff --name-only` lists exactly the 10 production / reference files in §Files Expected to Change plus the 4 governance ledgers — exactly 14 files at session close.

### API Catalog (per `00.3 §21` + D-11804)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated in the same commit per D-11804.
- [ ] Three new rows added per D-DEC-6's resolved option (Wired or Library-only).
- [ ] Each row's `Status` is exactly one of the four closed-set values.
- [ ] Each row's `Auth` column is exactly `authenticated-session-required` per D-9905.
- [ ] Each row's `Authorizing WP` column is `WP-104`.
- [ ] Field names in each row's request and response schemas match `00.2-data-requirements.md` verbatim.

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run server tests (post-WP-104 baseline)
pnpm --filter "@legendary-arena/server" test
# Expected: pre-WP-104 baseline 73/0/36 + new WP-104 tests, 0 failing.

# Step 3 — run engine tests (must be unchanged)
pnpm --filter "@legendary-arena/game-engine" test
# Expected: engine baseline 604/132/0 UNCHANGED.

# Step 4 — no 'hanko' literal in scope files
Select-String -Path "apps\server\src\profile\ownerProfile.types.ts","apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.logic.test.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "'hanko'|""hanko""" -Recurse
# Expected: no output.

# Step 5 — no Hanko-specific imports
Select-String -Path "apps\server\src\profile" -Pattern "@teamhanko|hanko\.io" -Recurse
# Expected: no output.

# Step 6 — no new npm deps
git diff apps/server/package.json apps/arena-client/package.json
# Expected: no output.

# Step 7 — no boardgame.io import in WP-104 files
Select-String -Path "apps\server\src\profile\ownerProfile.types.ts","apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "from .['\"]boardgame\.io" -Recurse
# Expected: no output.

# Step 8 — no engine / registry / preplan import in WP-104 files
Select-String -Path "apps\server\src\profile\ownerProfile.types.ts","apps\server\src\profile\ownerProfile.logic.ts","apps\server\src\profile\ownerProfile.routes.ts" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse
# Expected: no output.

# Step 9 — only the expected scope files changed
git diff --name-only
# Expected: exactly the 10 production / reference files plus the 4 governance ledgers (14 files total).

# Step 10 — D-11804 catalog update present
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "GET /api/me/profile|PATCH /api/me/profile|PUT /api/me/links"
# Expected: at least three matches (one per new row).

# Step 11 — WP-102 contract files unmodified
git diff apps/server/src/profile/profile.types.ts apps/server/src/profile/profile.logic.ts apps/server/src/profile/profile.routes.ts apps/server/src/profile/profile.logic.test.ts apps/arena-client/src/pages/PlayerProfilePage.vue apps/arena-client/src/lib/api/profileApi.ts
# Expected: no output.

# Step 12 — WP-052 / WP-112 contract files unmodified
git diff apps/server/src/identity/ apps/server/src/auth/ data/migrations/004_create_players_table.sql data/migrations/005_create_replay_ownership_table.sql .claude/
# Expected: no output.
```

---

## Definition of Done

> Claude Code must execute every verification command in
> `## Verification Steps` before checking any item below.
>
> Every item must be true before this packet is considered complete.

This packet is complete when ALL of the following are true:

- [ ] All §Acceptance Criteria pass (binary).
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with all pre-existing baselines preserved plus the new WP-104 tests.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with engine baseline unchanged.
- [ ] No file under `apps/server/src/profile/profile.*` (WP-102 contract files) was modified.
- [ ] No file under `apps/server/src/identity/`, `apps/server/src/auth/`, or `data/migrations/00{4,5,6,7,8}_*.sql` was modified.
- [ ] No file under `.claude/rules/*.md` was modified.
- [ ] No new npm dependencies introduced.
- [ ] D-10401 + D-10402 entered into `docs/ai/DECISIONS.md` verbatim from §Decision Points; D-10403..D-10408 entered with the executor's locked choices.
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries three new rows per D-11804.
- [ ] `docs/ai/STATUS.md` updated with a `### WP-104 / EC-128 Executed` block at the top of `## Current State`.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-104 row checked off with date + commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-128 row flipped from `Draft` to `Done {YYYY-MM-DD}`.
- [ ] No files outside `## Files Expected to Change` were modified.

---

## Lint Self-Review

> Performed at draft time (2026-05-02). Re-confirm before execution.
> Covers `00.3-prompt-lint-checklist.md §1–§21`.

| § | Item | Status |
|---|---|---|
| §1 | All required WP sections present | PASS |
| §1 | `## Out of Scope` non-empty (≥2 items) | PASS (12 items) |
| §2 | Non-Negotiable Constraints with engine-wide + packet-specific + session protocol + locked values | PASS |
| §2 | Constraints reference `00.6-code-style.md` | PASS |
| §2 | Full file contents required, no diffs/snippets | PASS |
| §3 | `## Assumes` lists prior state with verifiable refs | PASS (WP-052, WP-101, WP-102, WP-112, WP-115 cited) |
| §4 | `## Context (Read First)` is specific | PASS (WP-102, WP-112, WP-115, ARCHITECTURE.md sections cited) |
| §4 | Architectural sections cited | PASS |
| §4 | DECISIONS.md scan instruction included | PASS |
| §5 | Every file is `new` or `modified` with one-line description | PASS |
| §5 | No ambiguous "update this section" language | PASS |
| §5 | File count ≤8 (production / reference) | **DEVIATION**: 10 production / reference (within WP-115 precedent of 6 production + 5 governance = 11; WP-104 totals 14 including governance — within recent precedent). Justified at execution time as a single coherent owner-edit slice. |
| §6 | Naming consistency (no abbreviations, canonical paths) | PASS |
| §7 | No new npm dependencies | PASS (zero) |
| §7 | Hanko carve-out compliance | PASS — WP-104 introduces no Hanko-specific code |
| §8 | Layer boundaries respected | PASS |
| §8 | Persistence boundary: G / ctx untouched; PostgreSQL access via `pg.Pool` | PASS |
| §9 | Cross-platform commands (Verification Steps use pwsh `Select-String`) | PASS |
| §10 | Env vars: TEST_DATABASE_URL pre-existing; no new env vars | N/A |
| §11 | Auth: WP-104 implements the WP-099 §A contract via WP-112 caller-injected provider; identity model is `AccountId` server-generated; `## Limitations` covered by §Out of Scope | PASS |
| §12 | Tests: logic-pure + DB-required with WP-052 skip pattern | PASS |
| §13 | Verification commands are exact with expected output | PASS |
| §14 | Acceptance criteria are binary, observable | PASS (~25 items grouped by sub-task) |
| §15 | DoD includes STATUS.md + DECISIONS.md + WORK_INDEX.md + scope-boundary check | PASS |
| §16 | Code style applies to deliverables; locked to `00.6-code-style.md` | PASS |
| §17 | Vision Alignment block present with cited clauses (§3, §11, §14, §15, NG-1, NG-3, NG-6) + no-conflict assertion + N/A determinism | PASS |
| §18 | Prose-vs-grep discipline: forbidden tokens cited via D-9904 references | PASS |
| §19 | Bridge-vs-HEAD staleness: N/A — not a repo-state-summarizing artifact | N/A |
| §20 | Funding Surface Gate: N/A with explicit justification (owner identity / presentation surface, not money-flow) | N/A |
| §21 | API Catalog Update: triggered (3 new endpoints); `api-endpoints.md` in §Files Expected to Change; closed-set Status / Auth taxonomies preserved per D-11804 | PASS |

**Final Gate verdict:** PASS at draft time (2026-05-02). Re-confirm before execution by re-running the §1–§21 walkthrough against the post-amendment state of this WP file.
