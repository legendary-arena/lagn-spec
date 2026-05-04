# WP-132 — Entitlements Data Model & `/me/entitlements` Read API

**Status:** Draft (drafted 2026-05-03; lint-gate self-review **PASS** — see §Lint Self-Review at foot)
**Primary Layer:** Server (`apps/server/src/entitlements/**`; `data/migrations/011`)
**Dependencies:** WP-052 (`AccountId` brand + `legendary.players` table + `Result<T>` + `DatabaseClient` contracts); WP-112 (`SessionVerifier` interface + `requireAuthenticatedSession` orchestrator + `AccountResolver` caller-injected pattern); WP-115 (long-lived `pg.Pool` lifecycle anchor at `apps/server/src/server.mjs`); WP-118 (HTTP API catalog + `D-11804` update obligation); WP-131 (production wiring of `requireAuthenticatedSession`'s `verifier` + `accountResolver` deps — required before `/api/me/entitlements` is genuinely authenticated rather than fail-closed `'session_verifier_not_configured'`).

**Slot note:** WP-128 / WP-129 / WP-130 + EC-131 / EC-132 / EC-133 reserved by the board-layout chain; WP-131 + EC-134 reserved by the auth-wiring WP. WP-132 + EC-135 is the next free pair.

---

## Session Context

WP-052 (executed 2026-04-19) shipped the `AccountId` branded type, the
`legendary.players` table, the `auth_provider` closed-set enum (`'email'
| 'google' | 'discord'`), the `Result<T>` shape, and the `DatabaseClient`
contract. WP-112 (executed 2026-05-02) shipped the broker-agnostic
`requireAuthenticatedSession(req, options)` orchestrator + the
`SessionVerifier` interface + the `findAccountByAuthProviderSub` lookup +
the `AccountResolver` caller-injected provider pattern. WP-118 (executed
2026-04-30) locked the HTTP API catalog at
`docs/ai/REFERENCE/api-endpoints.md` plus the same-commit update
obligation per D-11804. WP-104 (executed 2026-05-02) shipped the
`apps/server/src/profile/` pattern for owner-only authenticated routes
under `/api/me/*` registered via `registerOwnerProfileRoutes(router,
pool, deps)` — WP-132 mirrors that module structure verbatim.

This packet introduces **the entitlements substrate** — the authoritative
record of what cosmetic / supporter benefits an account has been granted.
WP-132 ships the data model (a single new table) plus a single
read-only authenticated endpoint (`GET /api/me/entitlements`) that
returns the requesting account's current entitlement set. WP-132 ships
**zero grant paths**: no INSERT site for `legendary.entitlements` exists
after this WP lands, by construction. Grant paths land in WP-134
(webhook → entitlement fulfillment processor); the Stripe wiring that
feeds WP-134 lands in WP-133. WP-132 is the contract these later WPs
write against.

**Scope deliberately excluded from this packet:**
- Stripe SDK, checkout session creation, webhook ingestion — WP-133.
- Fulfillment processor (event → entitlement INSERT) — WP-134.
- Revocation endpoint or admin-side grant — out of scope; future WP.
- Refund handling — out of scope; the schema accommodates a
  `revoked_at` column but no code path writes to it at WP-132 close.
- UI surfaces (Profile-page "current benefits" list, "Upgrade" button) —
  out of scope; arena-client integration is a future WP that consumes
  `GET /api/me/entitlements`.
- Tournament / org-play licensing entitlements (Vision §794) — out of
  scope; the closed-set `EntitlementKey` at WP-132 covers cosmetic /
  supporter MVP only.

---

## Goal

After this session, the production server can answer "what entitlements
does this account hold?" via a single authenticated HTTP endpoint backed
by an authoritative database table. Specifically:

- A new migration `data/migrations/011_create_entitlements.sql` creates
  `legendary.entitlements` (many-to-1 with `legendary.players`,
  `ON DELETE CASCADE`) idempotently. Columns: `id bigserial PRIMARY KEY`,
  `account_id text NOT NULL REFERENCES legendary.players(account_id) ON
  DELETE CASCADE`, `entitlement_key text NOT NULL CHECK (entitlement_key
  IN (...closed set per D-DEC-3...))`, `source text NOT NULL CHECK
  (source IN ('stripe', 'admin_grant', 'comp'))`, `source_ref text NULL`
  (e.g., Stripe `cs_*` session ID for `source = 'stripe'` rows),
  `granted_at timestamptz NOT NULL DEFAULT now()`, `revoked_at timestamptz
  NULL`. UNIQUE constraint on `(account_id, entitlement_key) WHERE
  revoked_at IS NULL` so a re-grant of an already-active entitlement is
  a no-op (idempotency for WP-134's webhook retries).
- A new `apps/server/src/entitlements/` quartet:
  `entitlements.types.ts` (the `Entitlement` type, the `EntitlementKey`
  closed union, `EntitlementsResult<T>` mirror of `Result<T>`),
  `entitlements.logic.ts` (`getEntitlementsForAccount(accountId,
  database): Promise<EntitlementsResult<Entitlement[]>>` — read-only;
  no INSERT site by construction), `entitlements.logic.test.ts` (covers
  empty / single / multiple / database-fault), `entitlements.routes.ts`
  (`registerEntitlementRoutes(router, pool, deps)` registers `GET
  /api/me/entitlements`, gated by
  `deps.requireAuthenticatedSession(req, { verifier:
  deps.verifier, accountResolver: deps.accountResolver, database:
  pool })`).
- A `server.mjs` modification (single line, mirrors the WP-104 / WP-109
  pattern) calling `registerEntitlementRoutes(server.router, pool, {
  requireAuthenticatedSession, verifier, accountResolver })` — same
  `deps` bundle shape WP-131 already threads to `registerOwnerProfileRoutes`
  and `registerTeamRoutes`.
- One new HTTP catalog row at `docs/ai/REFERENCE/api-endpoints.md`
  under `## Wired — Reachable Over HTTP Today → ### Server-Registered
  Routes` for `GET /api/me/entitlements` with `Auth:
  authenticated-session-required`, `Authorizing WP: WP-132`. If WP-131
  has not yet executed at WP-132 close, the row carries `Status:
  Wired` but the Notes column flags that until WP-131 lands the
  endpoint returns 500 with `code: 'session_verifier_not_configured'`
  on every request (per D-11204).

**Invariant locked here:** entitlement read is the only path. WP-132
introduces **zero** code path that mutates `legendary.entitlements`.
Tests assert this via grep (`Select-String -Path
"apps\server\src\entitlements" -Pattern "INSERT INTO|UPDATE
legendary\.entitlements|DELETE FROM legendary\.entitlements"` returns
no matches outside the migration file). WP-134 is the WP that adds
the INSERT site.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-132
> touches monetization (Vision §765–794 Financial Sustainability +
> NG-1..NG-7). Vision Alignment is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §765–794 (Financial Sustainability), Non-Goals NG-1, NG-2,
NG-3, NG-4, NG-5, NG-6, NG-7.

**Conflict assertion:** **No conflict: this WP preserves all touched
clauses.**

- **§3 Player Trust & Fairness.** Entitlements are read-only at the
  account boundary; the requesting account can see only its own
  entitlements (the route filters by `accountId` from the validated
  session). No cross-account leak, no admin-visible diff against
  other accounts.
- **§11 Stateless Client Philosophy.** The endpoint is a pure read.
  Every request re-derives the account's entitlement set from the
  authoritative `legendary.entitlements` row set; no client-side
  cache discipline, no localStorage entitlement mirror, no
  reconciliation logic.
- **§14 Explicit Decisions, No Silent Drift.** The closed-set
  `EntitlementKey` union is enumerated in a single source file
  (`entitlements.types.ts`) AND in the migration's CHECK constraint.
  A drift-detection test machine-enforces parity between the
  TypeScript union and the canonical `ENTITLEMENT_KEYS` array; SQL
  CHECK parity is human-reviewed at migration time and locked by
  convention (per D-DEC-6 option (a)). Adding a key requires updating
  the union, the canonical array, the migration's CHECK constraint,
  AND adding a `DECISIONS.md` entry.
- **§765–794 Financial Sustainability.** The substrate enables the
  Vision-locked supporter subscription / cosmetic purchase model
  (#1 + #2 of the four sustainable revenue streams). Without an
  authoritative entitlement record, a future Stripe purchase has
  nowhere to land. WP-132 is the data-model precondition.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** The closed-set `EntitlementKey` allowlist
  is locked to **cosmetic / access / presentation values only** at
  D-DEC-3. No entitlement key in the initial set affects gameplay,
  RNG, scoring, deck composition, card behavior, or any
  match-state mutation. The engine never reads
  `legendary.entitlements`; the engine cannot import from
  `apps/server/src/entitlements/` per `.claude/rules/architecture.md`
  Layer Boundary. A future WP that adds a gameplay-affecting
  entitlement key would FAIL §17 Vision Alignment by construction.
- **NG-2 (gacha / loot boxes):** No randomized purchases. Each
  entitlement key is a deterministic, fully-disclosed grant.
- **NG-3 (content withheld):** No core game content gated by
  entitlements. The closed set covers cosmetic flair only —
  alternate playmats, card-back designs, UI themes, custom
  avatars, supporter badge. Permanent free access to all rules,
  all official content, full multiplayer, scoring, replays,
  exports — preserved.
- **NG-4 (energy / fatigue), NG-5 (advertising), NG-6 (dark
  patterns), NG-7 (apologetic monetization):** N/A — no time
  gates, no ads, no upsell prompts, no countdown-to-pay.

**Determinism preservation:** **N/A.** WP-132 touches no engine,
registry, scoring, replay, RNG, or simulation surface. The engine
never imports from `apps/server/src/entitlements/`; the Layer
Boundary (`.claude/rules/architecture.md`) makes this enforceable
at lint time. Replay determinism (Vision §22, §24) unaffected by
construction.

---

## Funding Surface Gate (§20)

**§20 N/A.** **Justification:** WP-097 / D-9701 / D-9801 anchor §20
to **tournament-funding** affordances (Open Collective, PayPal,
equivalent per `docs/TOURNAMENT-FUNDING.md`). WP-132 introduces no
tournament-funding affordance, no global navigation funding
surface (WP-097 §A), no registry-viewer funding surface (WP-097 §B),
no user-profile funding-attribution surface (WP-097 §C — the
entitlements list is a presentation of *granted benefits*, not a
money-flow attribution surface), no tournament-specific funding
integration, and no user-visible copy referencing "donate" /
"support tournaments" / "tournament funding". Vision §765–794
distinguishes Legendary Supporter subscriptions (#1) and one-time
cosmetic purchases (#2) — both **paid-tier** revenue — from
community support tiers / donations (#3, the §20 surface) and
enterprise / org-play licensing (#4). WP-132's `EntitlementKey`
closed set covers #1 + #2 only at MVP per D-DEC-3 (the supporter
subscription benefit set + one-time cosmetic purchase keys); no
donation surface is introduced. The future WP that adds a
tournament-funding affordance to a profile or registry-viewer
surface is a separate WP that triggers §20.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

WP-132 adds one new HTTP endpoint, so §21 fires.

**Required catalog update:** Add one row in `## Wired — Reachable
Over HTTP Today → ### Server-Registered Routes`:

- `Status`: `Wired` (assuming server.mjs wiring lands in the same
  commit per WP-104 / WP-115 / WP-131 same-commit precedent — see
  D-DEC-5).
- `Method`: `GET`
- `Path`: `/api/me/entitlements`
- `Auth`: `authenticated-session-required` (per D-9905 closed set;
  the route invokes `requireAuthenticatedSession` as the first
  middleware step, identical posture to the WP-104 `/api/me/*`
  routes)
- `Request Schema`: `(none — empty body)` ; bearer session token
  via the `Authorization` header per WP-112 contract
- `Response Schema`: `{ entitlements: Entitlement[] }` per
  `apps/server/src/entitlements/entitlements.types.ts`; on
  `'session_verifier_not_configured'` returns 500 (until WP-131
  wiring lands); on database fault returns 500 with body `{ error:
  'internal_error' }` (project-owned envelope per D-11802 = C);
  status-code domain `{200, 401, 500}`. `Cache-Control: no-store`
  is the first statement of every response per the WP-115
  precedent.
- `Authorizing WP`: `WP-132`
- `Notes`: cite WP-112 (session-token gate); cite the closed-set
  `EntitlementKey` allowlist (per D-DEC-3); cite the entitlements
  table's UNIQUE constraint preventing duplicate active entries;
  state explicitly that response entitlements are ordered by
  `grantedAt` ASC; state that revoked entitlements are EXCLUDED
  by contract (the response never carries a row with
  `revokedAt !== null`); state that all timestamps are ISO-8601 UTC
  strings (Postgres `timestamptz` JSON serialization).

**Replace-whole-row semantics (per D-11804):** insertion of a new
row, not edit of an existing row; replace-whole-row pattern N/A.

---

## Assumes

- WP-052 complete. Specifically:
  - `apps/server/src/identity/identity.types.ts` exports
    `AccountId` (branded `string`), `Result<T>`, `DatabaseClient`,
    `PlayerAccount`.
  - `legendary.players` table exists with `account_id text PRIMARY
    KEY` (per migration `004_create_players_table.sql`).
- WP-112 complete. Specifically:
  - `apps/server/src/auth/sessionToken.logic.ts` exports
    `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>`.
  - `apps/server/src/auth/sessionToken.types.ts` exports the
    `SessionVerifier` interface and the `AccountResolver` type.
- WP-115 complete. Specifically:
  - `apps/server/src/server.mjs` constructs a long-lived `pg.Pool`
    once at startup and threads it into route registrants.
- WP-118 complete. Specifically:
  - `docs/ai/REFERENCE/api-endpoints.md` exists with the
    Status / Auth closed-set headers and the locked replace-whole-row
    update obligation.
- `pnpm --filter @legendary-arena/server build` exits 0
- `pnpm --filter @legendary-arena/server test` exits 0
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists
- Migrations 001..010 applied to local Postgres; slot 011 unused.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirm
  `apps/server/src/entitlements/` belongs in the Server layer; the
  engine, registry, preplan, and arena-client packages MUST NOT
  import from it.
- `docs/ai/ARCHITECTURE.md §Persistence Boundary` — `legendary.entitlements`
  is server-only; `G` and `ctx` never reference entitlements at runtime.
- `.claude/rules/architecture.md "Layer Boundary"` — mirror enforcement.
- `docs/ai/work-packets/WP-104-owner-profile-data-model-and-me-edit.md` —
  module-structure precedent (`apps/server/src/profile/` quartet);
  `registerOwnerProfileRoutes(router, pool, deps)` registration shape;
  D-10403 / D-10404 closed-set CHECK constraint precedent.
- `docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md` —
  long-lived `pg.Pool` lifecycle precedent; `Cache-Control: no-store`
  first-statement-of-response posture; project-owned 500 envelope
  shape `{ error: 'internal_error' }` per D-11802.
- `docs/ai/work-packets/WP-131-authenticated-routes-production-wiring.md` —
  the `verifier` + `accountResolver` deps bundle WP-132 inherits
  unchanged.
- `docs/ai/REFERENCE/api-endpoints.md` — current catalog state;
  WP-132's row insertion site is the `### Server-Registered Routes`
  table.
- `docs/ai/REFERENCE/00.2-data-requirements.md §4 Table Inventory` —
  add `legendary.entitlements` to the inventory in the same commit
  per WP-104 precedent.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4 (no abbreviations),
  6 (`// why:` comments), 9 (`node:` prefix), 11 (full-sentence
  errors), 13 (ESM only), 14 (canonical field names).
- `docs/01-VISION.md §765–794 Financial Sustainability` + §NG-1..NG-7
  Non-Goals — closed-set `EntitlementKey` allowlist (D-DEC-3) MUST
  satisfy these clauses.
- `docs/ai/DECISIONS.md` — scan for D-104NN (WP-104 closed-set CHECK
  constraint precedent), D-11202..D-11204 (`SessionVerifier` deferral
  + fail-closed default), D-9905 (auth taxonomy), D-11804 (catalog
  update obligation).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Persistence Boundary
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import` / `export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers (helper here means engine pure helpers; `apps/server/src/entitlements/entitlements.logic.ts` is a server-layer module and explicitly DOES query Postgres — that is the layer's job per `.claude/rules/architecture.md`)
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- `apps/server/src/entitlements/entitlements.logic.ts` MUST contain
  zero INSERT / UPDATE / DELETE statements targeting
  `legendary.entitlements`. Confirmed via `Select-String` in
  Verification Steps. WP-134 is the WP that adds the INSERT site.
- The `EntitlementKey` TypeScript union, the canonical
  `ENTITLEMENT_KEYS` array, and the SQL CHECK constraint MUST list
  the same values. Compile-time parity between the union and the
  canonical array is machine-enforced by the drift-detection test
  (per D-DEC-6 option (a) — exhaustive `switch` over `EntitlementKey`
  consuming each member of `ENTITLEMENT_KEYS`). SQL CHECK parity
  with the canonical array is enforced at migration-review time and
  locked by convention; the runtime guard at the route layer
  (rejecting SELECT-returned values not in the union) catches drift
  if it occurs (mirrors `MATCH_PHASES` / `TURN_STAGES` drift pattern
  for the TS-side parity).
- The closed-set `EntitlementKey` allowlist MUST contain only
  cosmetic / access / presentation values at this WP. Adding a
  gameplay-affecting key requires Vision Alignment review and a
  separate WP. The initial set is locked under D-DEC-3.
- The `source` column closed set is `('stripe', 'admin_grant',
  'comp')`. `'stripe'` rows are the WP-134 fulfillment path;
  `'admin_grant'` is a future-WP admin tool (no code path in
  WP-132); `'comp'` is for engineering / customer-support manual
  grants outside the Stripe flow. CHECK constraint enforces.
- The `GET /api/me/entitlements` route returns ONLY entitlements
  for the requesting account (filtered by validated `AccountId`).
  Cross-account read is forbidden; tests assert the SQL `WHERE
  account_id = $1` clause is present.
- The route MUST set `Cache-Control: no-store` as the FIRST
  statement of every response (200, 401, 500), mirroring the
  WP-115 precedent.
- The route MUST use the `requireAuthenticatedSession(req,
  options)` orchestrator from WP-112 — never inline session
  validation, never bypass the orchestrator.
- The migration MUST be idempotent (`CREATE TABLE IF NOT EXISTS`,
  `CREATE UNIQUE INDEX IF NOT EXISTS`); re-applying must be a no-op.
- No new npm dependencies. WP-132 uses only existing `pg`, the
  in-tree `requireAuthenticatedSession`, and Node v22 built-ins.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask
  the human before proceeding — never guess or invent field names,
  type shapes, or file paths.

**Locked contract values:**

- **`legendary.entitlements` columns:** `id bigserial PRIMARY KEY`,
  `account_id text NOT NULL`, `entitlement_key text NOT NULL`,
  `source text NOT NULL`, `source_ref text NULL`, `granted_at
  timestamptz NOT NULL DEFAULT now()`, `revoked_at timestamptz NULL`.
- **`source` closed set:** `('stripe', 'admin_grant', 'comp')`.
- **`source_ref` per-source semantics (locked at draft, enforced
  by WP-134 at write time):**
  - `source = 'stripe'` → `source_ref` MUST be non-NULL and contain
    the Stripe Checkout Session ID (`cs_*`) or Payment Intent ID
    (`pi_*`); WP-134 writes the session ID.
  - `source = 'admin_grant'` → `source_ref` is OPTIONAL; when
    present, it carries the admin tool's audit reference (future WP).
  - `source = 'comp'` → `source_ref` is REQUIRED and MUST cite a
    `DECISIONS.md` entry ID (e.g., `D-NNNNN`) documenting the manual
    grant rationale. WP-132 ships no code path that writes `'comp'`
    rows; this column convention applies to future direct-SQL
    interventions and is enforced by review, not code.
- **`EntitlementKey` initial closed set (per D-DEC-3 recommended
  default — executor may override):**
  `'supporter_tier_basic_2026'` |
  `'cosmetic_playmat_classic'` |
  `'cosmetic_playmat_comic'` |
  `'cosmetic_playmat_minimal'` |
  `'cosmetic_cardback_default_plus'` |
  `'cosmetic_avatar_frame_supporter'`.
- **UNIQUE constraint:** `CREATE UNIQUE INDEX IF NOT EXISTS
  entitlements_active_unique ON legendary.entitlements (account_id,
  entitlement_key) WHERE revoked_at IS NULL;` — partial unique index
  so a re-grant of an already-active entitlement is a no-op.
- **HTTP route:** `GET /api/me/entitlements` →
  `{ entitlements: Entitlement[] }`. Auth:
  `authenticated-session-required`. Status-code domain: `{200, 401,
  500}`. Result ordering is `grantedAt` ASC (oldest first) — part
  of the public contract per Acceptance Criteria. Revoked
  entitlements (`revokedAt IS NOT NULL`) are EXCLUDED by contract;
  the response NEVER includes a row with non-null `revokedAt`. All
  timestamps in the response body are ISO-8601 UTC strings (the
  Postgres `timestamptz` JSON serialization).
- **Module path:** `apps/server/src/entitlements/` (per D-DEC-1).
- **Migration slot:** `011_create_entitlements.sql` (per D-DEC-2).

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via
deterministic reproduction and state inspection.

- The `getEntitlementsForAccount(accountId, database)` helper is a
  pure SQL `SELECT` over `legendary.entitlements`. Given identical
  database state and identical input, output is bytewise-identical.
- Every response sets `Cache-Control: no-store` as the first statement
  so production cache infrastructure cannot mask state.
- The route returns explicit error codes (`'unauthorized'`,
  `'session_verifier_not_configured'`, `'internal_error'`) — no
  silent swallow.
- `legendary.entitlements` rows carry `granted_at` timestamps so
  forensics can reconstruct the exact grant order even after
  millions of rows.
- The drift-detection test machine-enforces parity between the
  `EntitlementKey` TypeScript union and the canonical
  `ENTITLEMENT_KEYS` array (per D-DEC-6 option (a)). SQL CHECK
  parity with the canonical array is human-reviewed at migration
  time and locked by convention; the runtime route-layer guard
  rejecting SELECT-returned values not in the union catches drift
  if it slips past review.

---

## Scope (In)

### A) Migration

- **`data/migrations/011_create_entitlements.sql`** — new:
  - `CREATE TABLE IF NOT EXISTS legendary.entitlements (id bigserial
    PRIMARY KEY, account_id text NOT NULL REFERENCES
    legendary.players(account_id) ON DELETE CASCADE, entitlement_key
    text NOT NULL CHECK (entitlement_key IN
    ('supporter_tier_basic_2026', 'cosmetic_playmat_classic', ...)),
    source text NOT NULL CHECK (source IN ('stripe', 'admin_grant',
    'comp')), source_ref text NULL, granted_at timestamptz NOT NULL
    DEFAULT now(), revoked_at timestamptz NULL);`
  - `CREATE UNIQUE INDEX IF NOT EXISTS entitlements_active_unique ON
    legendary.entitlements (account_id, entitlement_key) WHERE
    revoked_at IS NULL;`
  - `CREATE INDEX IF NOT EXISTS entitlements_account_idx ON
    legendary.entitlements (account_id) WHERE revoked_at IS NULL;`
  - Add `// why:` SQL comment on the partial unique index:
    `-- why: Enforces idempotency for entitlement grants. WP-134's
    fulfillment processor INSERTs entitlement rows on
    checkout.session.completed events; Stripe's at-least-once
    delivery contract means the same event may arrive multiple
    times. A webhook retry or duplicate fulfillment event
    attempting to grant an already-active entitlement results in
    a no-op (ON CONFLICT ... DO NOTHING) rather than a second row.
    See WP-134 §Locked contract values for the matching ON CONFLICT
    clause.`

### B) `apps/server/src/entitlements/entitlements.types.ts` — new

- Export `EntitlementKey` as a closed union type with the values
  from D-DEC-3 (recommended default).
- Export `ENTITLEMENT_KEYS: readonly EntitlementKey[]` — the
  canonical array used by the drift-detection test and the runtime
  validation (route layer asserts SELECT-returned `entitlement_key`
  values are members of the union; an out-of-set value indicates a
  migration / type drift and triggers a `500` with operator-facing
  diagnostic).
- Export `EntitlementSource = 'stripe' | 'admin_grant' | 'comp'`.
- Export `Entitlement = { entitlementKey: EntitlementKey; source:
  EntitlementSource; sourceRef: string | null; grantedAt: string;
  revokedAt: string | null }`.
- Export `EntitlementsResult<T>` as a domain-local **alias** of
  WP-052 `Result<T>` restricted to the failure codes reachable by
  the entitlements read path (`'unauthorized' |
  'session_verifier_not_configured' | 'lookup_failed'`). No new
  result semantics are introduced — the alias narrows the failure
  type for documentation / IDE benefit only. Mirrors the WP-104
  `ProfileResult<T>` precedent (pre-flight 2026-04-28 PS-5: declared
  locally, not re-imported).

### C) `apps/server/src/entitlements/entitlements.logic.ts` — new

- Export `getEntitlementsForAccount(accountId: AccountId, database:
  DatabaseClient): Promise<EntitlementsResult<Entitlement[]>>`.
- Single SQL `SELECT entitlement_key, source, source_ref, granted_at,
  revoked_at FROM legendary.entitlements WHERE account_id = $1 AND
  revoked_at IS NULL ORDER BY granted_at ASC`.
- Database fault → `Result.fail({ code: 'lookup_failed' })`.
- No INSERT / UPDATE / DELETE in this file (verified by
  `Select-String` in Verification Steps). WP-134 is the WP that adds
  the INSERT site.

### D) `apps/server/src/entitlements/entitlements.logic.test.ts` — new

`node:test` coverage:
- Empty result set returns `Result.ok([])`.
- Single active entitlement returns one-element array.
- Multiple active entitlements ordered by `granted_at ASC`.
- Revoked entitlements are filtered out by the `WHERE revoked_at IS
  NULL` clause.
- Database fault returns `Result.fail({ code: 'lookup_failed' })`.
- Drift-detection test: `ENTITLEMENT_KEYS` array exactly matches the
  `EntitlementKey` union (compile-time assertion via exhaustive
  switch).
- Test inline-skips when `hasTestDatabase` is false (per D-5201 §3.1
  precedent).

### E) `apps/server/src/entitlements/entitlements.routes.ts` — new

- Export `registerEntitlementRoutes(router, pool, deps)`. `deps`
  shape: `{ requireAuthenticatedSession, verifier, accountResolver
  }`. Identical shape to `OwnerProfileRouteDependencies` /
  `TeamRouteDependencies` (per WP-131 caller-injected pattern).
- `GET /api/me/entitlements` handler:
  - `Cache-Control: no-store` set as the first statement.
  - `await deps.requireAuthenticatedSession(req, { verifier:
    deps.verifier, accountResolver: deps.accountResolver, database:
    pool })`.
  - On `Result.fail`: map `'unauthorized'` → 401 / `code:
    'unauthorized'`; map `'session_verifier_not_configured'` → 500
    / `code: 'session_verifier_not_configured'` (per D-11204);
    other → 500 / `code: 'internal_error'`.
  - On `Result.ok(accountId)`: call
    `getEntitlementsForAccount(accountId, pool)`. On
    `Result.fail({ code: 'lookup_failed' })` → 500 / `error:
    'internal_error'`. On `Result.ok(entitlements)` → 200 / body
    `{ entitlements }`.

### F) `apps/server/src/server.mjs` — modified

Single line addition (mirrors WP-104 / WP-109 / WP-131 pattern):
`registerEntitlementRoutes(server.router, pool, {
requireAuthenticatedSession, verifier, accountResolver });`. Placed
adjacent to the existing `registerOwnerProfileRoutes` and
`registerTeamRoutes` calls.

### G) `docs/ai/REFERENCE/api-endpoints.md` — modified

- Add one new row to `## Wired — Reachable Over HTTP Today → ###
  Server-Registered Routes` per the catalog format above.
- Append one `Library-only` row for `getEntitlementsForAccount` to
  the `## Library-only` section (per the WP-104 / WP-115 precedent
  of cataloguing the request-handler-reachable library function).

### H) `docs/ai/REFERENCE/00.2-data-requirements.md` — modified

- Add `legendary.entitlements` to `§4 Table Inventory` with column
  list and the partial-unique-index documentation.
- Add the canonical field-name spellings (`entitlementKey`, `source`,
  `sourceRef`, `grantedAt`, `revokedAt`) to the relevant section.

### I) Tests — `apps/server/src/entitlements/entitlements.routes.test.ts` — new

- Successful 200 with single entitlement.
- 401 when `requireAuthenticatedSession` returns `'unauthorized'`.
- 500 with `code: 'session_verifier_not_configured'` when verifier
  unset (preserves WP-104 / WP-109 fail-closed posture; once WP-131
  lands, this branch is no longer reachable via missing config).
- 500 with `error: 'internal_error'` when `getEntitlementsForAccount`
  returns `'lookup_failed'`.
- `Cache-Control: no-store` present on all three branches.

### J) STATUS / DECISIONS / WORK_INDEX updates

- `docs/ai/STATUS.md` — append entry: WP-132 closed; entitlements
  data model + read API live; no grant path yet (WP-134 owns).
- `docs/ai/DECISIONS.md` — append D-13201..D-13206 (renumbered from
  D-DEC-N at execution close) with rationale + rejected alternatives.
- `docs/ai/work-packets/WORK_INDEX.md` — check off WP-132; append
  the locked-conventions row for the `legendary.entitlements`
  partial-unique-index idempotency pattern.

---

## Out of Scope

- Stripe SDK, `POST /api/billing/checkout-session`, webhook ingestion — WP-133.
- Entitlement INSERT site, fulfillment processor, refund/reversal handling — WP-134.
- Profile-page "current benefits" UI list — future arena-client WP.
- Profile-page "Upgrade to Legendary Supporter" button — future arena-client WP.
- Admin grant tool (web UI or CLI for `source = 'admin_grant'`) — future WP.
- `'comp'`-source manual grant migration helpers — future WP.
- Tournament / org-play licensing entitlements — future WP that
  extends `EntitlementKey` AFTER WP-097 §F Funding Surface Gate
  review.
- Entitlement expiry / time-boxed grants (`expires_at` column or
  equivalent) — future WP. The current schema accommodates
  revocation via `revoked_at` (nullable) but does NOT model
  scheduled expiry. A future WP that introduces expiry must
  document its semantics under a Decision Point (e.g., does the
  read endpoint filter by `expires_at < now()`? Does WP-134's
  fulfillment processor write `expires_at` based on price metadata?).
- Refactors, cleanups, or "while I'm here" improvements are **out of
  scope** unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `data/migrations/011_create_entitlements.sql` — **new** — table + 2 indexes
- `apps/server/src/entitlements/entitlements.types.ts` — **new** — `Entitlement`, `EntitlementKey`, `ENTITLEMENT_KEYS`, `EntitlementsResult`
- `apps/server/src/entitlements/entitlements.logic.ts` — **new** — `getEntitlementsForAccount`
- `apps/server/src/entitlements/entitlements.logic.test.ts` — **new** — five branches + drift test
- `apps/server/src/entitlements/entitlements.routes.ts` — **new** — `registerEntitlementRoutes` + `GET /api/me/entitlements`
- `apps/server/src/entitlements/entitlements.routes.test.ts` — **new** — 200 / 401 / 500-unconfigured / 500-fault + Cache-Control
- `apps/server/src/server.mjs` — **modified** — register the new route
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — one new `Wired` row + one new `Library-only` row
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified** — add `legendary.entitlements` to `§4 Table Inventory`
- `docs/ai/STATUS.md` — **modified** — append WP-132 close entry
- `docs/ai/DECISIONS.md` — **modified** — append D-13201..D-13206
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-132

No other files may be modified.

---

## Decision Points

> Six decisions are surfaced at draft time. **D-13201** and **D-13202**
> are locked here with rationale (mirror the WP-104 D-10401 / D-10402
> module-path / migration-slot precedent). **D-13203** is the most
> consequential decision and surfaces the `EntitlementKey` closed set
> for executor confirmation. **D-13204..D-13206** are `[DECISION
> REQUIRED]` blocks for the executor to lock at execution close.
> Renumbered as D-13201..D-13206 in `DECISIONS.md` at close-out.

### D-DEC-1 — Module Path: `apps/server/src/entitlements/` [LOCKED AT DRAFT]

**Decision:** Entitlements code lives under
`apps/server/src/entitlements/`. Sibling to existing `profile/` /
`teams/` / `identity/` / `replay/` / `competition/` / `leaderboards/`
/ `auth/` / `par/` / `db/` / `game/` / `rules/`.

**Rationale.** Mirrors the WP-052 / WP-102 / WP-104 / WP-109 precedent
of one directory per server domain, sibling-flat. Entitlements are a
standalone domain (granted-benefits authoritative record) distinct
from auth / identity / billing — splitting Stripe wiring (WP-133
under `apps/server/src/billing/`) from the entitlement substrate
(WP-132 under `apps/server/src/entitlements/`) keeps the entitlement
read path independent of the payment provider. A future second
payment provider (or admin grant tool) would write to the same
`legendary.entitlements` table without WP-132 file changes.

**Rejected alternative — `apps/server/src/billing/entitlements/`.**
Rejected because: (a) couples the entitlement substrate to the
payment provider; (b) a second provider or admin grant tool would
have to import "across the street" into `billing/`, inverting the
intended dependency direction; (c) the WP-104 / WP-109 sibling-flat
precedent is consistent and easy to grep.

**Status:** Active. Flips to Resolved at WP-132 close.

### D-DEC-2 — Migration Slot: `011_create_entitlements.sql` [LOCKED AT DRAFT]

**Decision:** Single migration file at slot **011** creating
`legendary.entitlements` plus its two indexes idempotently.

**Rationale.** Slots 001..010 are taken (001..003 server schema /
rules / sessions; 004 players; 005 replay_ownership; 006 replay_blobs;
007 competitive_scores; 008 add_handle_to_players; 009
player_profiles_and_links per WP-104; 010 teams_and_membership per
WP-109). Slot 011 is the next free per the WP-104 D-10402 +
WP-109 D-10906 sequential-non-recyclable convention. Single
migration file because the table and its two indexes are introduced
together at one point in time.

**Status:** Active. Flips to Resolved at WP-132 close.

### D-DEC-3 — `EntitlementKey` Closed Set [DECISION REQUIRED]

**Question.** What is the initial closed set of `EntitlementKey`
values?

(a) **Six-key cosmetic-only set (recommended default):**
`'supporter_tier_basic_2026'` (the supporter subscription bundle key
per Vision §784–786 #1), `'cosmetic_playmat_classic'`,
`'cosmetic_playmat_comic'`, `'cosmetic_playmat_minimal'` (the three
playmats already locked under WP-130 D-13003 — the supporter tier
unlocks all three), `'cosmetic_cardback_default_plus'` (alternate
card-back design, Vision §785 example), `'cosmetic_avatar_frame_supporter'`
(supporter-tier avatar frame).

(b) **Single key (`'supporter_tier_basic_2026'`):** Coarsest. The
supporter tier unlocks every cosmetic the project ships at MVP; no
per-cosmetic granularity. Future cosmetic SKUs require a new key +
migration.

(c) **Two-key (`'supporter_subscription_2026'` +
`'one_time_cosmetic_pack_2026'`):** Splits the Vision §784 #1
recurring-subscription stream from the §788 #2 one-time-purchase
stream. No per-cosmetic granularity within either stream.

(d) **Open string (no CHECK constraint):** Reject — WP-132 explicitly
locks a closed set (Vision §14 Explicit Decisions, No Silent Drift).

**Constraints (locked at draft time):**
- Every key in the chosen set MUST be cosmetic / access /
  presentation only (Vision NG-1..NG-7). No gameplay / RNG /
  scoring / deck-composition / card-behavior key.
- The compile-time drift-detection test (per D-DEC-6 option (a))
  MUST machine-enforce that `EntitlementKey` and
  `ENTITLEMENT_KEYS` carry the same values; the migration's SQL
  CHECK constraint MUST list the same values, enforced by
  migration review.
- The set MUST be human-grep-able from a single source-of-truth
  file (`entitlements.types.ts`).
- Adding a future key requires a new WP that updates the
  union + the migration's CHECK + the canonical array + a
  `DECISIONS.md` entry + a Vision Alignment §17 review.

**Recommended default (executor may override):** Option (a) —
six-key cosmetic-only set. Rationale: gives the future arena-client
"current benefits" surface enough granularity to render a real list
("✓ Supporter Tier (2026), ✓ Comic playmat unlocked, ✓ Supporter
avatar frame") without flattening every benefit into one
yes/no toggle. Each key maps cleanly to a specific Vision §785
example. Option (b) is too coarse for a meaningful UX. Option (c)
is fine but the supporter tier and the cosmetic packs already
overlap at the playmat / cardback level — splitting them at the
key level forces the WP-134 fulfillment path to grant multiple
keys per single Stripe purchase, which complicates the WP-134
"one purchase = one key" invariant (locked under WP-134 D-13403).
Option (d) violates §14.

### D-DEC-4 — `source` Column Closed Set [DECISION REQUIRED]

**Question.** What `source` values are accepted on
`legendary.entitlements`?

(a) **Three-value (recommended default):** `'stripe'`,
`'admin_grant'`, `'comp'`. Stripe webhook fulfillment writes
`'stripe'` rows (WP-134); a future admin tool writes `'admin_grant'`
rows (out of scope here); engineering / customer-support manual
grants write `'comp'` rows via direct SQL with a
`DECISIONS.md`-citing comment.

(b) **Two-value:** `'stripe'`, `'admin_grant'`. Drop `'comp'` —
manual grants happen via `'admin_grant'` instead.

(c) **Five-value:** Add `'gift'` (account A purchases for account
B) and `'tournament_prize'` (org-play licensing per Vision §794).
Premature; both are future surfaces.

**Constraints (locked at draft time):**
- The set MUST be a CHECK constraint on the migration column
  (defense-in-depth) AND a closed-union TypeScript type at the
  application layer.
- Every value MUST be reachable by a documented code path or
  out-of-WP manual procedure; orphan values are forbidden.
- **`'comp'`-source writes governance:** every direct-SQL INSERT
  with `source = 'comp'` MUST cite a `DECISIONS.md` entry ID
  (e.g., `D-NNNNN`) in its `source_ref` column documenting the
  manual grant rationale (matching the §Locked contract values
  per-source semantics). Per-row enforcement is by review (the
  WP-132 schema does not encode a CHECK that `source = 'comp'`
  implies non-NULL `source_ref`; review-time discipline is the
  control). Adding this CHECK is a candidate future-WP refinement
  if `'comp'` rows become frequent.

**Recommended default (executor may override):** Option (a) —
three-value. Rationale: `'comp'` is operationally distinct from
`'admin_grant'` (one is a database-direct intervention with a
DECISIONS-cited reason, the other is a future admin-tool path with
audit logs). Forensics benefits from distinguishing them.

### D-DEC-5 — Route-Wiring Posture [DECISION REQUIRED]

**Question.** Does WP-132 wire the route in `server.mjs` in the
same commit, or ship `Shipped-but-unwired`?

(a) **Same-commit wiring (recommended default):** WP-132's commit
adds the `registerEntitlementRoutes(...)` call to `server.mjs`. The
catalog row is `Wired` from day one. Until WP-131 lands, the route
returns 500 with `code: 'session_verifier_not_configured'` per
D-11204 (matches WP-104 / WP-109 fail-closed posture).

(b) **Shipped-but-unwired:** WP-132's commit ships the
`registerEntitlementRoutes` helper but does NOT modify `server.mjs`.
A future request-handler WP graduates the route to `Wired`. The
catalog row is `Shipped-but-unwired`.

**Constraints (locked at draft time):**
- Whichever path the executor picks, the catalog row's `Status`
  column MUST match the actual server.mjs state at commit time
  (per D-11804 closed-set enforcement).

**Recommended default (executor may override):** Option (a) —
same-commit wiring. Rationale: matches the WP-104 / WP-109 / WP-115
precedent. The fail-closed-until-WP-131 posture is already a
locked convention for `/api/me/*` routes.

### D-DEC-6 — Drift-Detection Test Posture [DECISION REQUIRED]

**Question.** How does the test file assert TypeScript union ↔ SQL
CHECK ↔ canonical array drift?

(a) **Compile-time exhaustive switch (recommended default):**
`entitlements.logic.test.ts` includes a function `assertExhaustive(
key: EntitlementKey): void { switch (key) { case 'supporter_tier_basic_2026':
return; ... default: const _: never = key; throw new Error(`Drift:
${_}`) } }`. TypeScript fails the build if the union changes
without the switch updating; the canonical `ENTITLEMENT_KEYS` array
is run through the function at test time.

(b) **Live-DB query:** Test queries
`information_schema.check_constraints` for the
`legendary.entitlements_entitlement_key_check` constraint definition,
parses the IN-list, and asserts string-equality against
`ENTITLEMENT_KEYS`. Tighter coupling but requires a live DB at
test time.

(c) **Both (a) and (b):** Compile-time + DB-validated.

**Constraints (locked at draft time):**
- The test MUST fail loudly when the TS union and the canonical
  array drift; this is the floor under all three options.
- Under option (a), SQL CHECK parity with the canonical array is
  NOT machine-enforced at test time — it is locked by migration
  review and by the runtime route-layer guard that rejects
  SELECT-returned values outside the union. The drift posture is
  honest about which sources are mechanically enforced and which
  are review-locked.
- Under (b) or (c), SQL CHECK parity IS machine-enforced at test
  time, at the cost of a live test DB dependency.
- The test MUST run without network / external services if (a)
  is chosen; (b) and (c) require a test DB and inline-skip when
  unavailable per D-5201 §3.1.

**Recommended default (executor may override):** Option (a) —
compile-time only. Rationale: TypeScript is the canonical source
in code; SQL CHECK is enforced at DB write time; the migration
file is human-reviewed in the same PR. Adding a DB query for
parity is belt-and-suspenders that depends on test infrastructure
that is itself still maturing (D-5201 §3.1 inline-skip pattern).

---

## Acceptance Criteria

### Migration
- [ ] `data/migrations/011_create_entitlements.sql` exists and is idempotent (re-applying twice is a no-op)
- [ ] Table has exactly the 7 columns from §Locked contract values
- [ ] CHECK constraint on `entitlement_key` matches the locked set verbatim
- [ ] CHECK constraint on `source` matches `('stripe', 'admin_grant', 'comp')` verbatim
- [ ] Partial unique index `(account_id, entitlement_key) WHERE revoked_at IS NULL` exists
- [ ] FK to `legendary.players(account_id)` with `ON DELETE CASCADE`

### Library
- [ ] `entitlements.logic.ts` exports `getEntitlementsForAccount(accountId, database)`
- [ ] No `INSERT INTO`, `UPDATE`, or `DELETE FROM` targeting `legendary.entitlements` in `entitlements.logic.ts` (confirmed with `Select-String`)
- [ ] `entitlements.types.ts` exports `EntitlementKey`, `ENTITLEMENT_KEYS`, `EntitlementSource`, `Entitlement`, `EntitlementsResult`
- [ ] Drift test (per D-DEC-6 option (a)) machine-enforces `EntitlementKey` union ↔ `ENTITLEMENT_KEYS` array parity at compile time via exhaustive `switch`
- [ ] Migration's SQL CHECK list matches `ENTITLEMENT_KEYS` verbatim (human-reviewed — confirmed by reading the migration file alongside `entitlements.types.ts` during PR review)

### Route
- [ ] `entitlements.routes.ts` exports `registerEntitlementRoutes(router, pool, deps)`
- [ ] `GET /api/me/entitlements` invokes `requireAuthenticatedSession` as the first business-logic step
- [ ] Response is `{ entitlements: Entitlement[] }`
- [ ] Response entitlements are ordered by `grantedAt` ASC (oldest first) — verified by a multi-row test asserting iteration order
- [ ] Response excludes any row with `revokedAt !== null` — verified by a test that inserts one revoked + one active row and asserts only the active row appears
- [ ] Response timestamps are ISO-8601 UTC strings — verified by regex assertion against `grantedAt` in a happy-path test
- [ ] `Cache-Control: no-store` is the first statement of every response (confirmed with `Select-String`)
- [ ] Status-code domain is `{200, 401, 500}` (confirmed with grep over the routes file)

### Wiring
- [ ] `apps/server/src/server.mjs` calls `registerEntitlementRoutes(server.router, pool, { requireAuthenticatedSession, verifier, accountResolver })`

### Catalog
- [ ] `docs/ai/REFERENCE/api-endpoints.md` has one new `Wired` row for `GET /api/me/entitlements`
- [ ] Row's `Auth` column is `authenticated-session-required`
- [ ] Row's `Authorizing WP` column is `WP-132`
- [ ] One new `Library-only` row for `getEntitlementsForAccount`

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] Tests cover empty / single / multiple / revoked-filtered / DB-fault / drift-detection
- [ ] Tests inline-skip when `hasTestDatabase` is false (per D-5201 §3.1)
- [ ] Test files use `node:test` and `node:assert` only

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/server build
# Expected: exits 0, no TypeScript errors

# Step 2 — tests
pnpm --filter @legendary-arena/server test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — confirm zero mutation site in entitlements.logic.ts
Select-String -Path "apps\server\src\entitlements\entitlements.logic.ts" -Pattern "INSERT INTO legendary\.entitlements|UPDATE legendary\.entitlements|DELETE FROM legendary\.entitlements"
# Expected: no output

# Step 4 — confirm Cache-Control: no-store first statement on every branch
Select-String -Path "apps\server\src\entitlements\entitlements.routes.ts" -Pattern "Cache-Control"
# Expected: at least one match (the route file sets it; reviewer confirms position-of-statement manually)

# Step 5 — confirm requireAuthenticatedSession is the first middleware
Select-String -Path "apps\server\src\entitlements\entitlements.routes.ts" -Pattern "requireAuthenticatedSession"
# Expected: matches inside the GET /api/me/entitlements handler

# Step 6 — confirm no boardgame.io import in server module
Select-String -Path "apps\server\src\entitlements" -Pattern "from 'boardgame\.io'" -Recurse
# Expected: no output (server-layer code may import boardgame.io for the Server() wiring; the entitlements module itself MUST NOT)

# Step 7 — confirm migration is idempotent (apply twice locally)
node --env-file=.env scripts/run-migrations.mjs
node --env-file=.env scripts/run-migrations.mjs
# Expected: second run is a no-op (no errors, no duplicate-creation messages)

# Step 8 — confirm catalog row exists
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "GET.*\/api\/me\/entitlements"
# Expected: one match in the Server-Registered Routes table

# Step 9 — confirm scope boundary
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] No `INSERT|UPDATE|DELETE` of `legendary.entitlements` in `entitlements.logic.ts`
- [ ] Drift-detection test passes (TS union ↔ canonical array)
- [ ] Migration applies idempotently (verified by double-run)
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated per D-11804 replace-whole-row semantics
- [ ] `docs/ai/STATUS.md` updated — what entitlement read capability is now available; explicitly notes WP-132 ships zero grant path
- [ ] `docs/ai/DECISIONS.md` updated — D-13201..D-13206 appended with rationale + rejected alternatives
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-132 checked off with today's date
- [ ] 01.5 NOT INVOKED (per WP-132 zero-engine-touch declaration)
- [ ] 01.6 post-mortem OPTIONAL per server-layer-only WP precedent

---

## Lint Self-Review (00.3 Prompt Lint Checklist)

- §1 Structure — PASS (all required sections present, none empty)
- §2 Constraints block — PASS (engine-wide + packet-specific + session protocol + locked values; full file contents required; ESM only; references 00.6)
- §3 Assumes — PASS (WP-052, WP-112, WP-115, WP-118 listed with specific exports)
- §4 Context — PASS (ARCHITECTURE.md §Layer Boundary + §Persistence + WP-104 / WP-115 / WP-131 precedents + 00.2 §4 + 00.6 + DECISIONS scan)
- §5 Files Expected — PASS (12 files, all marked new/modified, all have one-line descriptions; bounded under §5's ~8-file guidance with the additional governance/catalog files explicitly enumerated; no ambiguous output language)
- §6 Naming — PASS (`accountId`, `entitlementKey`, `grantedAt`, `revokedAt` match 00.2 conventions)
- §7 Dependencies — PASS (no new npm dependencies; no axios / node-fetch / Jest / Mocha / Passport / Auth0 / Clerk; Hanko is the auth broker per WP-126; pg only)
- §8 Architectural Boundaries — PASS (server-layer code only; no engine import; no `G` / `ctx` reference; layer-boundary clarified for `apps/server/src/entitlements/`)
- §9 Windows compatibility — PASS (PowerShell `Select-String` in Verification Steps; `\` separators)
- §10 Env vars — N/A (WP-132 introduces no new env vars; `STRIPE_*` env vars land in WP-133)
- §11 Authentication clarity — PASS (caller-injected `requireAuthenticatedSession` per WP-112; no JWT_SECRET introduced)
- §12 Test quality — PASS (`node:test` only; no boardgame.io import; inline-skip pattern per D-5201 §3.1)
- §13 Verification commands — PASS (pnpm only; `Select-String` exact patterns; expected outputs inline)
- §14 Acceptance criteria — PASS (binary, observable, references actual files / functions; ~24 items grouped by sub-task)
- §15 Definition of Done — PASS (acceptance / build / test / STATUS / DECISIONS / WORK_INDEX / scope-boundary all present)
- §16 Code style — PASS (no premature abstraction; no nested ternaries; full English names; functions ≤30 lines; full-sentence error messages)
- §17 Vision Alignment — PASS (clauses §3 / §11 / §14 / §765–794 / NG-1..NG-7 cited by ID; no-conflict assertion; non-goal proximity check; determinism N/A with rationale)
- §18 Prose-vs-grep discipline — PASS (no Verification Step grep targets prose-enumerable forbidden tokens; the `INSERT|UPDATE|DELETE` grep is scoped to a single source file and the rule is enforced by code, not prose)
- §19 Bridge-vs-HEAD staleness — N/A at draft; commit-time discipline applies at execution
- §20 Funding Surface Gate — PASS via N/A path (one-line justification distinguishing supporter-tier paid revenue from tournament-funding donate flows; cites Vision §765–794 streams #1/#2 vs #3)
- §21 API Catalog — PASS (one new `Wired` row; one new `Library-only` row; `Auth: authenticated-session-required`; `Status: Wired` per D-DEC-5 same-commit wiring; canonical field names match 00.2)
