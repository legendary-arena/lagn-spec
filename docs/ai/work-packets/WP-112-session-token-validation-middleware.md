# WP-112 — Session Token Validation Middleware

**Status:** Draft (drafted 2026-05-02; lint-gate self-review **PASS** — see §Lint Self-Review at the foot)
**Primary Layer:** Server (`apps/server/src/auth/**` — sibling to `apps/server/src/identity/**`)
**Dependencies:** WP-099 §A "Session Validation Middleware" (policy contract, F-1..F-7 Future-Auth Gates); WP-052 (identity model: `AccountId`, `PlayerAccount`, `authProvider`, `authProviderId`, `legendary.players` table)
**Renumbered from:** "WP-100" per D-10002 (the WP-100 slot was reassigned to Interactive Gameplay Surface on 2026-04-26)

---

## Session Context

WP-099 (executed 2026-04-27) selected Hanko as Legendary Arena's
authentication broker and locked the `apps/server/src/auth/hanko/`
module path under D-9904. WP-099 §A "Session Validation Middleware"
named WP-112 as the implementation packet for the
`requireAuthenticatedSession(req): Promise<AccountId>` provider that
WP-101 / WP-102 / WP-104 already cite as a soft-dep via the
caller-injected provider pattern. WP-099 §A also locked seven
Future-Auth Gates (F-1..F-7) that any auth-implementation packet must
satisfy before merging.

This WP drafts the implementation contract for that middleware.
Architectural choice locked at draft time (per **D-11201** in
§Decision Points): WP-112 ships the **broker-agnostic orchestrator**
plus a `SessionVerifier` interface; the Hanko-specific verifier (SDK
wiring, JWKS fetch/cache, JWT validation, claim extraction) is deferred
to a sibling implementation WP — **WP-126** "External Authentication
Integration (Hanko Session Verifier)" — whose deferred-placeholder row
is added to `WORK_INDEX.md` in the same `SPEC:` drafting commit as this
WP. WP-126 supplies a concrete `SessionVerifier` that production
wiring (a future request-handler WP) injects into the orchestrator at
startup.

WP-101, WP-102, and WP-104 do **not** require WP-112 to land first
because all three accept the provider as an argument (the caller-
injected provider pattern). WP-112's job is to ship the actual
production-grade orchestrator implementation that production code wires
in once WP-126 (the Hanko adapter) has also landed.

---

## Goal

After this session, `apps/server/src/auth/` contains a
production-grade, broker-agnostic session-validation orchestrator that:

- Exports a `requireAuthenticatedSession(req, options): Promise<Result<AccountId>>` function whose contract matches the soft-dep references in WP-101 / WP-102 / WP-104.
- Defines a `SessionVerifier` interface (one method: `verify(token): Promise<Result<VerifiedSessionClaim>>`) so the orchestrator carries no broker-specific code. WP-126 implements this interface against Hanko; a future replacement broker (per the D-9901 replacement-safety contract) implements it against whatever signer is chosen.
- Resolves the verified caller's `(authProvider, authProviderSub)` claim pair to an `AccountId` via a new lookup helper `findAccountByAuthProviderSub(authProvider, authProviderSub, database)` in `apps/server/src/auth/accountLookup.logic.ts`. The helper queries `legendary.players` (read-only SELECT) without modifying any WP-052 contract file.
- Fails closed when no `SessionVerifier` is wired (the unconfigured-default state during the WP-112-shipped / WP-126-not-yet-shipped window): every authenticated request returns `Result.fail` with code `'session_verifier_not_configured'`. No request silently passes.
- Carries logic-pure tests using `node:test` and a fake `SessionVerifier` plus a fake `findAccountByAuthProviderSub` injection seam — no live Hanko, no live database.
- Adds the new library function(s) as `Library-only` rows in `docs/ai/REFERENCE/api-endpoints.md` per the D-11804 catalog-update obligation.

**Invariant:** WP-112 ships orchestration + lookup + tests only — no
Hanko import, no JWT library, no JWKS endpoint, no SDK installation.
All broker-specific code is owned by WP-126.

**Non-Goals Reminder.** This WP intentionally does **not** define how
authenticated routes are wired; it only defines the validation
contract consumed by future request-handler WPs.

---

## Vision Alignment

> Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. WP-112
> touches identity, authentication, and the platform's posture toward
> third-party services; a Vision Alignment block is mandatory.

**Vision clauses touched:** §3 (Player Trust & Fairness), §11
(Stateless Client Philosophy), §14 (Explicit Decisions, No Silent
Drift), §15 (Built for Contributors), Non-Goals NG-1, NG-3, NG-6.

**Conflict assertion:** **No conflict: this WP preserves all touched
clauses.**

- **§3 Player Trust & Fairness.** A broker-agnostic orchestrator with a
  fail-closed unconfigured-default preserves the Vision §3 trust
  posture: misconfiguration cannot accidentally treat an unauthenticated
  request as authenticated. The `SessionVerifier` boundary keeps the
  trust surface auditable — the orchestrator records *who* the
  authenticated caller is, the verifier records *which proof* the
  broker accepted, and the auditable boundary is the WP boundary, not a
  file-system grep.
- **§11 Stateless Client Philosophy.** The orchestrator carries no
  per-request state beyond the request-scoped `Result<AccountId>` it
  returns. No session cache, no in-memory token store, no per-process
  shared state outside the JWKS cache that WP-126 owns.
- **§14 Explicit Decisions, No Silent Drift.** The architectural choice
  (sibling WP, not inline) is locked under D-11201 with rejected
  alternatives recorded. The four decisions surfaced under §Decision
  Points are explicit — three remain `[DECISION REQUIRED]` for the
  executor to lock at execution time per the WP-099 D-9904 amendment
  rule (no silent extension of the auth contract).
- **§15 Built for Contributors.** The `SessionVerifier` interface is
  written so a contributor can plug in a self-hosted JWT signer
  (`jsonwebtoken` + a project-issued key pair) without WP-126's Hanko
  dependency. Replacement-safety per D-9904 is structural at the WP
  boundary, not at the file boundary.

**Non-Goal proximity check:** Confirmed clear.

- **NG-1 (pay-to-win):** Authentication unlocks account-only
  conveniences (per D-9905), never gameplay or competitive surfaces.
  WP-112 introduces no gating that touches gameplay.
- **NG-3 (content withheld):** WP-112 is request-routing infrastructure
  only. It does not gate any content, hero, scenario, or rule.
- **NG-6 (dark patterns):** The orchestrator is server-authoritative;
  there is no UI surface in WP-112 (no login screens, no upsell
  prompts, no countdown timers).
- **NG-2, NG-4, NG-5, NG-7:** N/A — WP-112 introduces no randomized
  purchases, energy systems, advertising, or apologetic monetization.

**Determinism preservation:** **N/A.** WP-112 touches no engine,
registry, scoring, replay, RNG, or simulation surface. Authentication
is a server-layer access concern, never an input to deterministic
gameplay state. Replay determinism (Vision §22, §24) is unaffected by
construction.

---

## WP-099 Future-Auth Gate (F-1..F-7) Disposition

> WP-099 §C locked seven Future-Auth Gates that every auth-broker
> integration WP must satisfy before merging. WP-112 enumerates each
> gate and explains its compliance posture inline. Per WP-099 §C
> "Audit discipline", silent omission of a gate item is a §17 lint
> FAIL.

**Applicability declared:** This WP touches WP-099 §A "Session
Validation Middleware" — the gate runs.

- **F-1 No `'hanko'` enum value.** **PASS by construction.** WP-112
  introduces no `auth_provider` enum value, no fixture, no seed, no
  string literal containing `'hanko'`. The orchestrator reads the
  existing `AuthProvider` union from `apps/server/src/identity/identity.types.ts`
  unchanged (`'email' | 'google' | 'discord'`). Verified by grep gate
  at §Verification Steps.
- **F-2 Hanko code is contained.** **PASS by construction.** WP-112
  files live under `apps/server/src/auth/` (sibling to
  `apps/server/src/identity/`); none under `apps/server/src/auth/hanko/`.
  No `@teamhanko/*` import, no `hanko.io` string literal, no
  Hanko-specific type or claim shape appears in any WP-112 file. The
  `SessionVerifier` interface is broker-agnostic by design; WP-126
  owns the Hanko-specific implementation under
  `apps/server/src/auth/hanko/`. Verified by grep gate at §Verification
  Steps.
- **F-3 `AccountId` is server-generated.** **PASS by construction.**
  WP-112 never generates an `AccountId`. The orchestrator looks up an
  *existing* `AccountId` from `legendary.players` keyed on the verifier-
  produced `(authProvider, authProviderSub)` claim pair. Account
  creation remains the responsibility of WP-052
  `createPlayerAccount`, which uses `node:crypto.randomUUID()` per
  D-5201 / D-9902.
- **F-4 Guests still play.** **PASS by construction.** WP-112's
  orchestrator is invoked only on routes that explicitly require an
  authenticated session. Guest-accessible routes (every existing
  `/api/leaderboards/*`, `/api/players/:handle/profile`, the
  boardgame.io built-ins) do not call `requireAuthenticatedSession`.
  No change to the existing guest path is in scope. Verified by the
  acceptance criterion "no existing guest-accessible route is wired
  through the new orchestrator" at §Acceptance Criteria.
- **F-5 No package-list expansion beyond Hanko.** **PASS by
  construction.** WP-112 introduces zero new npm dependencies. No
  `@teamhanko/*`, no `jsonwebtoken`, no `jwks-rsa`, no `bcrypt`, no
  `argon2`, no `scrypt`, no password-hashing library, no Auth0 / Clerk
  / Passport package. The only imports are Node built-ins (`node:test`,
  `node:assert`, `node:crypto` if needed for constant-time compare),
  the existing `pg` Pool, and existing identity-layer types
  re-imported from `../identity/identity.types.js`. WP-126 will add
  the `@teamhanko/*` package per WP-099 §B; that's WP-126's scope, not
  WP-112's.
- **F-6 Replacement-safety smoke check.** **PASS by construction.**
  Thought experiment: "If we removed Hanko tomorrow, what would
  change?" Answer: nothing in WP-112. WP-112 imports no Hanko symbol;
  the `SessionVerifier` interface admits any OIDC-compliant or
  self-hosted verifier. The replacement-safety surface is the WP-126
  adapter; WP-112 stays untouched.
- **F-7 Vision Alignment.** **PASS.** §Vision Alignment block above
  cites §3, §11, §14, §15, NG-1, NG-3, NG-6 with a no-conflict
  assertion and an N/A determinism line per WP-099 §C requirement.

---

## API Catalog Update Obligation (`00.3 §21` + D-11804)

> Per D-11804 (single `SPEC:` commit, 2026-04-30): every WP that adds,
> modifies, removes, or changes the status of an HTTP endpoint OR a
> library function reachable via direct import from
> `apps/server/src/**` MUST update `docs/ai/REFERENCE/api-endpoints.md`
> in the same commit. WP-112 adds new library functions reachable via
> direct import — `requireAuthenticatedSession`,
> `findAccountByAuthProviderSub` — so the catalog update obligation
> fires.

**Trigger surfaces (per §21.1):**
- Adds new library functions reachable via direct import from
  `apps/server/src/**` (the `requireAuthenticatedSession` orchestrator
  and the `findAccountByAuthProviderSub` lookup helper). Per the
  `Library-only` taxonomy in `api-endpoints.md`, both functions are
  cataloged with `Status: Library-only` because WP-112 itself does
  not register an HTTP route — that is a future request-handler WP's
  responsibility.

**Required catalog update (per §21.2 and the locked replace-whole-row
merge semantics from D-11804):**

- Add two new `Library-only` rows in the `## Library-only — Function
  Reachable Via Direct Import, No HTTP Surface Today` section. Each
  row carries:
  - `Status`: `Library-only` (closed-set value per D-11804).
  - `Method` / `Path`: `(n/a)` / `(n/a — function <name>)` matching
    the WP-103 / WP-101 precedent rows in the same section.
  - `Auth`: `(n/a — caller-injected dependencies)` matching the
    precedent for caller-injected `DatabaseClient` rows.
  - `Request Schema (file ref)`: function args linked to the new
    file paths via `[apps/server/src/auth/sessionToken.logic.ts:N]`
    and `[apps/server/src/auth/accountLookup.logic.ts:N]` line refs
    (line numbers filled in at execution time).
  - `Response Schema (file ref)`: `Result<AccountId, SessionValidationErrorCode>` and `Result<{ accountId, authProvider, authProviderSub }, AccountLookupErrorCode>` respectively.
  - `Authorizing WP`: `WP-112` (this WP).
  - `Notes`: cite WP-099 §A as the policy contract; cite F-1..F-7
    disposition; note the unconfigured-default fail-closed posture
    per D-11201 (and any draft-time `[DECISION REQUIRED]` items
    locked at execution).

**Replace-whole-row semantics (per D-11804):** these are insertions
of new rows, not edits of existing rows; no replace-whole-row pattern
applies. The two rows are appended to the existing `Library-only`
section, immediately after the WP-053 `submitCompetitiveScore` row.

**Field-name canonicalization (per §21.2):** every field name in the
new rows' request and response schemas (`accountId`, `authProvider`,
`authProviderSub`, etc.) matches `docs/ai/REFERENCE/00.2-data-requirements.md`
exactly. `accountProviderSub` is **not** introduced as a new canonical
name — it reuses the WP-052 `authProviderId` field name verbatim from
`PlayerAccount`. (The verifier's claim shape uses `authProviderSub`
locally because OIDC nomenclature uses `sub`; the lookup helper
translates it to `authProviderId` at the SQL boundary. The canonical
spelling on the wire and in the catalog is `authProviderId`.) **Translation site (locked).** The translation from `authProviderSub` →
`authProviderId` occurs **exclusively** inside `findAccountByAuthProviderSub`
at the SQL boundary; no other site in WP-112 performs the rename.
This makes future audits and greps deterministic — the only place
the two spellings coexist is inside that single helper, and the
orchestrator treats the lookup helper's output as canonical.

---

## Decision Points

> Four decisions are surfaced at draft time. **D-11201** is locked
> here with rationale and rejected alternatives — the executor copies
> it verbatim into `docs/ai/DECISIONS.md` at the WP-112 close-out
> commit. The remaining three are `[DECISION REQUIRED]` blocks for the
> executor to resolve at execution time, with constraints documented
> here so the executor can lock them without re-litigating at coding
> time.

### D-11201 — WP-112 Architectural Choice: SIBLING WP (Not Inline) [LOCKED AT DRAFT]

**Decision:** WP-112 ships the broker-agnostic orchestrator + the
`SessionVerifier` interface + the `findAccountByAuthProviderSub`
lookup helper + tests. The Hanko-specific verifier (SDK initialization,
JWKS fetch/cache/refresh, JWT signature verification, claim extraction)
is deferred to a sibling implementation WP — **WP-126** "External
Authentication Integration (Hanko Session Verifier)" — whose
deferred-placeholder row is added to `WORK_INDEX.md` in the same
`SPEC:` drafting commit as this WP.

**Rationale.**
- **WP-099 §B already names the sibling WP.** WP-099 §B "Hanko Wiring
  Module (Future Implementation WP)" was authored 2026-04-27 with the
  provisional name "WP-1XX External Authentication Integration
  (Hanko)". WP-112's sibling-WP choice locks that provisional name to
  `WP-126`. No new architectural surface is introduced.
- **D-9904 module-path lock is preserved at the WP boundary.** D-9904
  locks `apps/server/src/auth/hanko/` as the home for Hanko-specific
  code. SIBLING means **zero** Hanko imports in WP-112's files; ALL
  Hanko code lives in WP-126's `apps/server/src/auth/hanko/`. INLINE
  would distribute Hanko code across WP-112's `auth/` root and WP-126's
  `auth/hanko/` — a less crisp boundary. SIBLING preserves the
  D-9904 replacement-safety guarantee at the WP boundary, not just the
  file boundary.
- **Tests stay logic-pure.** WP-112's tests inject a fake
  `SessionVerifier`. No need for a fake JWKS endpoint, fake JWT
  generator, or fake Hanko tenant fixture at test time.
- **The `[DECISION REQUIRED]` blocks below stay scoped.** The Hanko
  SDK selection (which `@teamhanko/*` package, which version pin,
  which JWKS refresh policy) is a WP-126-time concern, not a
  WP-112-time concern. SIBLING keeps the WP-112 lint gate clear of
  decisions WP-099 has not pre-locked.

**Rejected alternative — INLINE.** WP-112 ships orchestrator + Hanko
adapter together. Rejected because: (a) it expands WP-112's scope to
include the Hanko SDK selection that WP-099 explicitly deferred to a
future WP; (b) it pushes the file count toward the ≤8 cap, especially
once JWKS cache + refresh policy + Hanko-specific test fixtures land;
(c) it dilutes the `SessionVerifier` interface's broker-agnosticism
because the only concrete implementation in the same WP becomes the
de-facto contract; (d) it makes a future broker swap a multi-file
edit instead of a directory-replacement.

**Status:** Active. Status flips to `Resolved` once WP-126 lands.

**Citation:** WP-099 §A "Session Validation Middleware"; WP-099 §B
"Hanko Wiring Module (Future Implementation WP)"; D-9904
(`apps/server/src/auth/hanko/` module-path lock); D-9901
(replacement-safety constraint); WP-126 deferred-placeholder row in
`WORK_INDEX.md`.

### D-11202 — Token Extraction Source [DECISION REQUIRED]

**Question.** Does `requireAuthenticatedSession` extract the bearer
token from (a) the HTTP `Authorization: Bearer <token>` header only,
(b) a session cookie only, (c) Authorization header preferred, cookie
fallback, or (d) some other source?

**Constraints (locked at draft time):**
- WP-099 §A neither locks nor forecloses any token-source choice. The
  contract permits "Hanko-issued tokens directly OR a server-issued
  downstream session token bound to an `AccountId`." The choice is
  WP-112's design decision.
- The choice MUST be deterministic and observable per Vision §3
  (Player Trust & Fairness). Multi-source fallback (option c) creates
  a request-routing surface where the client doesn't know which token
  was honored — that's a debuggability hazard.
- Cookies (option b or c) require CSRF protection. WP-112 introduces
  no CSRF middleware; if cookies are chosen, the executor must
  surface the CSRF surface as an additional decision point or defer
  cookie support to WP-126 / a future hardening WP.
- The choice MUST NOT preclude a future `Sec-WebSocket-Protocol`
  carrier path for the boardgame.io WebSocket reconnect surface
  (WP-116) — that path is not in WP-112's scope, but the orchestrator
  signature should accept either an `IncomingMessage`-shaped object
  or a thin `{ headers, cookies? }` adapter so WP-116 can wire its
  own carrier without re-litigating WP-112.

**Recommended default (executor may override):** Option (a) — bearer
header only. Cookie support deferred to WP-126 (which can choose,
e.g., a Hanko session cookie format) or a future hardening WP. CSRF
protection becomes a paired concern at that point.

### D-11203 — `findAccountByAuthProviderSub` Signature [DECISION REQUIRED]

**Question.** What is the exact signature of the new lookup helper —
specifically: (a) does it accept `(authProvider, authProviderSub,
database)` separately, or `({ authProvider, authProviderSub },
database)` as a struct? (b) what error codes appear in
`AccountLookupErrorCode`?

**Constraints (locked at draft time):**
- The helper MUST be a read-only SELECT against `legendary.players`
  with `WHERE auth_provider = $1 AND auth_provider_id = $2`. No
  `INSERT`, no `UPDATE`, no `DELETE`. Account creation remains
  WP-052 `createPlayerAccount`'s responsibility per D-9902.
- The helper MUST NOT modify WP-052 contract files
  (`apps/server/src/identity/identity.logic.ts`,
  `apps/server/src/identity/identity.types.ts`,
  `data/migrations/004_create_players_table.sql`,
  `data/migrations/005_create_replay_ownership_table.sql`). It lives
  in a NEW file `apps/server/src/auth/accountLookup.logic.ts`.
- The error code set MUST be a closed union mirroring the WP-052
  `IdentityErrorCode` precedent (e.g., `'unknown_account'` and any
  future `'lookup_failed'` for unrecoverable DB errors). The
  executor names the codes based on actual call-site dispatch needs
  in the orchestrator.
- The function MUST return the locked `Result<T>` discriminated union
  re-imported from `../identity/identity.types.js` (per WP-052 D-5201
  contract — never redeclared).

**Recommended default (executor may override):** Signature `(authProvider:
AuthProvider, authProviderSub: string, database: DatabaseClient):
Promise<Result<{ accountId: AccountId; authProvider: AuthProvider;
authProviderId: string } | null, AccountLookupErrorCode>>` with
`AccountLookupErrorCode = 'lookup_failed'`. The `null` return on no
match (rather than an `'unknown_account'` error) preserves the
distinction between "the lookup ran successfully but no account
matched" (a normal first-time-Hanko-callback condition) and "the
database query itself failed" (a server fault).

### D-11204 — Unconfigured-Default Behavior [DECISION REQUIRED]

**Question.** When no `SessionVerifier` is wired (the WP-112-shipped
/ WP-126-not-yet-shipped window, or a misconfigured production
deployment), how does `requireAuthenticatedSession` behave?

**Constraints (locked at draft time):**
- The behavior MUST be fail-closed. A missing verifier MUST NOT
  cause every request to silently succeed. Per Vision §3 (Player
  Trust & Fairness), misconfiguration cannot accidentally treat an
  unauthenticated request as authenticated.
- The behavior MUST be observable from production logs so an operator
  can diagnose "why is every authenticated route returning 401?" in
  one log lookup.
- The behavior MUST NOT throw — per ARCHITECTURE.md, server-layer
  helpers do not throw on caller error; they return `Result<T>` per
  the WP-052 D-5201 precedent.

**Recommended default (executor may override):** Return `Result.fail`
with `code: 'session_verifier_not_configured'` and a full-sentence
`reason` field per code-style Rule 11 (e.g., `"No session verifier is
configured. Production startup must call configureSessionValidation({
verifier, accountResolver }) before authenticated routes accept
traffic."`). The unconfigured-default check fires when invoked with no
`verifier` configured in the injected options (i.e., `options.verifier`
is missing or `undefined`); `options` itself remains a required
argument — the type system does not permit omitting it. Production
wiring (a future request-handler WP) calls
`configureSessionValidation(...)` exactly once at startup; if it
doesn't, every authenticated route returns 401 with a recognizable
error code that maps to a `console.error` log line at server startup.

---

## Assumes

- WP-099 complete. Specifically:
  - `docs/ai/work-packets/WP-099-auth-provider-selection.md §A "Session Validation Middleware"` exists and locks the F-1..F-7 Future-Auth Gates referenced above.
  - `docs/ai/work-packets/WP-099-auth-provider-selection.md §B "Hanko Wiring Module"` exists and locks `apps/server/src/auth/hanko/` as the Hanko-specific module path.
  - `docs/ai/DECISIONS.md` D-9901..D-9905 exist.
- WP-052 complete. Specifically:
  - `apps/server/src/identity/identity.types.ts` exports `AccountId`, `PlayerAccount`, `AuthProvider`, `AUTH_PROVIDERS`, `Result<T>`, `IdentityErrorCode`, `DatabaseClient` (verified 2026-05-02 at `apps/server/src/identity/identity.types.ts:33,47,58,66,139,149`).
  - `apps/server/src/identity/identity.logic.ts` exports `createPlayerAccount`, `findPlayerByAccountId`, `findPlayerByEmail`.
  - `data/migrations/004_create_players_table.sql` is applied with `auth_provider` and `auth_provider_id` columns (the lookup helper SELECTs against these).
  - `legendary.players.ext_id` is the `AccountId` value (per D-5201).
- WP-101 complete. Specifically:
  - `apps/server/src/identity/handle.logic.ts` exists and exports `findAccountByHandle` (the structural precedent for the new `findAccountByAuthProviderSub` lookup).
- `apps/server/src/auth/` directory does not yet exist (verified 2026-05-02 — `apps/server/src/identity/` is the only `src/` subdirectory containing identity-layer code; the new `auth/` directory is created by this WP).
- `apps/server/src/auth/hanko/` does not yet exist (created by WP-126).
- `pnpm -r build` exits 0 on `main` HEAD.
- `pnpm --filter @legendary-arena/server test` exits 0 on `main` HEAD.

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/work-packets/WP-099-auth-provider-selection.md §A "Session Validation Middleware"` — the policy contract WP-112 implements. F-1..F-7 Future-Auth Gates are the pre-merge checklist.
- `docs/ai/work-packets/WP-099-auth-provider-selection.md §B "Hanko Wiring Module (Future Implementation WP)"` — the sibling WP (WP-126) that WP-112's `SessionVerifier` interface admits.
- `docs/ai/work-packets/WP-099-auth-provider-selection.md §C "Future-Auth Gate (Pre-Merge Checklist)"` — the F-1..F-7 gate items.
- `docs/ai/DECISIONS.md` D-9901, D-9902, D-9903, D-9904, D-9905 — the Hanko governance set; WP-112 cites all five.
- `docs/ai/DECISIONS.md` D-10002 — the WP-100 → WP-112 renumber rationale.
- `docs/ai/DECISIONS.md` D-11804 — the API catalog-update obligation.
- `docs/ai/DECISIONS.md` D-5201 — `AccountId` is server-generated; WP-112 looks up existing `AccountId`s, never creates them.
- `docs/ai/work-packets/WP-052-player-identity-replay-ownership.md §Scope (In) A` — the `PlayerAccount` shape and `'email' | 'google' | 'discord'` enum WP-112 reads (read-only).
- `apps/server/src/identity/identity.types.ts` — read `AccountId`, `PlayerAccount`, `AuthProvider`, `Result<T>`, `IdentityErrorCode`, `DatabaseClient` verbatim (lines 33–153). WP-112 re-imports these; never redeclares.
- `apps/server/src/identity/handle.logic.ts §findAccountByHandle` — the structural precedent for the new `findAccountByAuthProviderSub` lookup. Same `Result<T>`-returning pattern, same caller-injected `DatabaseClient`, same locked SELECT.
- `apps/server/src/profile/profile.routes.ts` — the canonical Koa-router-adapter pattern WP-112's future consumer (a request-handler WP) will follow when wiring `requireAuthenticatedSession` into authenticated routes. WP-112 does NOT add a route adapter; it ships only the orchestrator that adapters call.
- `docs/ai/REFERENCE/api-endpoints.md` — the catalog WP-112 must update per D-11804. Read the `Library-only` section format (existing rows for `claimHandle`, `findAccountByHandle`, `getHandleForAccount`, `storeReplay`, `loadReplay`, `submitCompetitiveScore`).
- `docs/ai/REFERENCE/00.2-data-requirements.md §"Identity / Account Fields"` — canonical field-name spellings (`accountId`, `authProvider`, `authProviderId`, `displayName`, etc.) for the new catalog rows.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations — `database` not `db`, `verifier` not `vfr`), Rule 6 (`// why:` on non-obvious decisions), Rule 11 (full-sentence error messages), Rule 13 (ESM only), Rule 14 (canonical field names), Rule 15 (try/catch on every async I/O).
- `docs/ai/REFERENCE/02-CODE-CATEGORIES.md §server` — `apps/server/` directory classification. WP-112's new `apps/server/src/auth/` subdirectory inherits the `server` category by precedent (D-5202, D-10201, D-10301). Whether to add an explicit D-11202 classification entry per the WP-102 / WP-103 precedent is an executor concern.
- `.claude/rules/server.md` — server is a wiring layer; no game logic; no engine import; no `boardgame.io` import in `auth/`.
- `.claude/rules/architecture.md "Authority Hierarchy"` — VISION.md (#3) wins over WPs (#6) on conflict.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (N/A here — no engine touch; constraint preserved for template completeness).
- Never throw inside boardgame.io move functions — return void on invalid input (N/A here — no engine touch).
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3 (N/A here — no engine touch).
- `G` must be JSON-serializable at all times (N/A here — no engine touch).
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, `node:crypto` if used).
- Test files use `.test.ts` extension — never `.test.mjs`.
- No database or network access inside move functions or pure helpers (N/A here — no engine touch).
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- **No Hanko-specific code in WP-112.** Zero `@teamhanko/*` import, zero `hanko.io` string literal, zero Hanko-specific type, zero Hanko-specific claim shape, zero file under `apps/server/src/auth/hanko/`. All Hanko-specific code is WP-126's scope. Verified by grep gate at §Verification Steps.
- **No new npm dependencies.** WP-112 introduces zero entries in `apps/server/package.json` `dependencies` or `devDependencies`. The orchestrator uses Node built-ins, the existing `pg` Pool, and existing identity-layer types. WP-126 (sibling) will add Hanko SDK packages; that is WP-126's scope.
- **No modification to WP-052 contract files.** `apps/server/src/identity/identity.types.ts`, `apps/server/src/identity/identity.logic.ts`, `data/migrations/004_create_players_table.sql`, and `data/migrations/005_create_replay_ownership_table.sql` are locked. The new lookup helper lives in `apps/server/src/auth/accountLookup.logic.ts` — a new file, not a modification of identity-layer files.
- **No modification to WP-099 governance artifacts.** `docs/ai/work-packets/WP-099-auth-provider-selection.md` is locked. The F-1..F-7 disposition above cites WP-099 §A / §B / §C; it does not extend or amend them.
- **No modification to `.claude/rules/*.md`.** WP-112 introduces no new layer rule, no new architectural constraint, and no new authority. The new `apps/server/src/auth/` subdirectory inherits the `server` code-category classification by precedent.
- **No write paths.** No `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`, `ALTER`, or migration in any file in scope. The new lookup helper is a read-only SELECT against `legendary.players`.
- **No engine imports, no `boardgame.io` imports.** No file in scope imports from `packages/game-engine/`, `packages/registry/`, `packages/preplan/`, or `boardgame.io`. Per `.claude/rules/architecture.md` "Layer Boundary".
- **Result-typed, never throws.** Every async function returns the locked `Result<T>` discriminated union. Caller-error never throws. Per WP-052 D-5201 precedent.
- **Per-call dependency injection.** The orchestrator accepts the `SessionVerifier` and the `findAccountByAuthProviderSub` lookup as caller-injected options at every call site, mirroring the WP-101 / WP-102 / WP-104 caller-injected provider pattern. No global singleton state.
- **Configure-once at startup.** A `configureSessionValidation({ verifier, accountResolver })` factory MAY be exported as a convenience for production wiring (a future request-handler WP). The factory binds the verifier + resolver and returns a closure with the locked signature `(req) => Promise<Result<AccountId>>`. Tests do NOT use the factory; they construct the orchestrator with explicit injected fakes.
- **No CSRF / cookie / WebSocket carrier in WP-112.** Token extraction is whatever D-11202 locks at execution time (recommended default: `Authorization: Bearer <token>` header only). Cookie / WebSocket / Sec-WebSocket-Protocol carriers are deferred to WP-126 or a future request-handler / reconnect WP.
- **No registry-viewer or arena-client modifications.** WP-112 is server-only.
- **Logic-pure tests.** All tests use `node:test` + `node:assert`. No live database, no live Hanko, no network. Fakes injected at construction time.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human before proceeding — never guess or invent field names, type shapes, or file paths.
- If WP-099 §A / §B / §C wording cannot be reconciled with the orchestrator design, STOP and surface the conflict — never silently paraphrase or "smooth over" a divergence.
- If the executor disagrees with the SIBLING choice locked in D-11201, the WP must be re-drafted; do not silently switch to INLINE at execution time.

**Locked contract values:**
- **Module path:** `apps/server/src/auth/` (sibling to `apps/server/src/identity/`, never nested inside it). Per D-9904 precedent for the structural sibling layout.
- **WP-112 file allowlist (≤8 production / reference files):**
  - `apps/server/src/auth/sessionToken.types.ts`
  - `apps/server/src/auth/sessionToken.logic.ts`
  - `apps/server/src/auth/sessionToken.logic.test.ts`
  - `apps/server/src/auth/accountLookup.logic.ts`
  - `apps/server/src/auth/accountLookup.logic.test.ts`
  - `docs/ai/REFERENCE/api-endpoints.md` (modified — adds 2 `Library-only` rows)
- **Orchestrator function name (verbatim):** `requireAuthenticatedSession`. Matches the WP-099 §A / WP-101 / WP-102 / WP-104 verbatim spelling. Do not rename.
- **Lookup helper function name (verbatim):** `findAccountByAuthProviderSub`. Mirrors the WP-101 `findAccountByHandle` naming convention (verb-by-key).
- **`SessionVerifier` interface name (verbatim):** `SessionVerifier`. Single method `verify(token: string): Promise<Result<VerifiedSessionClaim, SessionVerificationErrorCode>>`.
- **`VerifiedSessionClaim` shape (verbatim):** `{ authProvider: AuthProvider; authProviderSub: string; expiresAt: string; }` — `authProvider` reuses WP-052's `AuthProvider` union; `authProviderSub` is the verifier-produced subject identifier; `expiresAt` is ISO-8601 UTC for orchestrator-side expiry checks (defense-in-depth in case the verifier doesn't reject expired tokens). The orchestrator treats `expiresAt <= now()` as expired (boundary inclusive). No clock-skew tolerance is applied at this layer; any skew allowance is the verifier's responsibility (WP-126 owns Hanko's skew posture; future replacement brokers own theirs). This keeps WP-112 deterministic and prevents two implementations from "helpfully" adding different skews later.
- **Token-extraction source:** locked by D-11202 at execution (recommended default: bearer header only).
- **Lookup helper signature:** locked by D-11203 at execution (recommended default in the §Decision Points block).
- **Unconfigured-default behavior:** locked by D-11204 at execution (recommended default: fail-closed with `code: 'session_verifier_not_configured'`).
- **Catalog rows added:** exactly two `Library-only` rows in `docs/ai/REFERENCE/api-endpoints.md` for `requireAuthenticatedSession` and `findAccountByAuthProviderSub`. Per D-11804 catalog-update obligation.
- **F-1..F-7 disposition:** all seven gate items addressed in §WP-099 Future-Auth Gate Disposition above. Per WP-099 §C "Audit discipline" and "No silent exceptions".

---

## Scope (In)

### A) `apps/server/src/auth/sessionToken.types.ts` — new

Locked exports (signatures may be refined at execution time per the
`[DECISION REQUIRED]` blocks but the names are locked):

- `SessionVerifier` interface — single method `verify(token: string): Promise<Result<VerifiedSessionClaim, SessionVerificationErrorCode>>`. Implementations live in sibling WPs (WP-126 ships the Hanko adapter).
- `VerifiedSessionClaim` interface — `{ authProvider: AuthProvider; authProviderSub: string; expiresAt: string; }`.
- `SessionVerificationErrorCode` union — closed set, executor-determined per call-site needs (e.g., `'invalid_token' | 'expired_token' | 'unknown_provider' | 'verification_failed'`).
- `SessionValidationErrorCode` union — closed set spanning the orchestrator's failure modes (e.g., `'missing_token' | 'invalid_token' | 'expired_token' | 'unknown_account' | 'session_verifier_not_configured' | 'lookup_failed'`).
- `RequireAuthenticatedSessionOptions` interface — caller-injected `{ verifier: SessionVerifier; accountResolver: (claim: VerifiedSessionClaim, database: DatabaseClient) => Promise<Result<AccountId, AccountLookupErrorCode>>; database: DatabaseClient }`. `RequireAuthenticatedSessionOptions` is a **required argument** when calling `requireAuthenticatedSession`. The unconfigured-default failure applies when `options.verifier` is missing or `undefined`, not when `options` is omitted entirely (it cannot be — the type system requires it).
- `AccountLookupErrorCode` union — closed set per D-11203.
- `Result<T, E>` re-imported from `../identity/identity.types.js` (per WP-052 contract — never redeclared).
- `AccountId`, `AuthProvider`, `DatabaseClient` re-imported from `../identity/identity.types.js`.

### B) `apps/server/src/auth/sessionToken.logic.ts` — new

Locked exports:

- `requireAuthenticatedSession(req, options): Promise<Result<AccountId, SessionValidationErrorCode>>` — the orchestrator. Steps in order: (1) extract token from request per D-11202 lock; (2) call `options.verifier.verify(token)`; (3) if the verifier returns `ok: false`, return `Result.fail` with the matching `SessionValidationErrorCode`; (4) otherwise call `options.accountResolver(claim, options.database)`; (5) return its `Result<AccountId>`. **Error-code ownership.** The orchestrator defines the authoritative mapping from `SessionVerificationErrorCode` to `SessionValidationErrorCode`. Verifier implementations MUST NOT assume their error codes propagate verbatim to callers; verifier-side codes are an internal contract between the verifier and the orchestrator, not part of the orchestrator's public surface. This preserves separation of concerns and audit clarity — a future verifier swap (e.g., Hanko → self-hosted JWT signer) can introduce new `SessionVerificationErrorCode` variants without breaking existing route-handler dispatch on `SessionValidationErrorCode`.
- `configureSessionValidation({ verifier, accountResolver, database })` — convenience factory returning a bound `(req) => Promise<Result<AccountId>>` closure. Production-wiring use only; tests inject directly.
- `extractBearerToken(req)` — a private helper (named export only if tests need it directly; otherwise file-local). Implementation locked by D-11202.

### C) `apps/server/src/auth/sessionToken.logic.test.ts` — new

`node:test` suite, all logic-pure (no DB, no network). One `describe('requireAuthenticatedSession (WP-112)', ...)` block. Test count target: **10–14 cases** covering:

- Happy path: verifier returns valid claim; resolver returns `AccountId`; orchestrator returns `Result.ok(accountId)`.
- Missing token (per D-11202): orchestrator returns `Result.fail({ code: 'missing_token' })`.
- Verifier returns `ok: false` with each `SessionVerificationErrorCode` variant: orchestrator translates to the matching `SessionValidationErrorCode`.
- Verifier returns valid claim with `expiresAt` in the past: orchestrator returns `Result.fail({ code: 'expired_token' })` (defense-in-depth).
- Resolver returns `Result.ok(null)` (no matching account): orchestrator returns `Result.fail({ code: 'unknown_account' })`.
- Resolver returns `Result.fail({ code: 'lookup_failed' })`: orchestrator forwards.
- Unconfigured default (per D-11204): orchestrator returns `Result.fail({ code: 'session_verifier_not_configured' })` when invoked with no `verifier` configured in the injected options (`options.verifier` missing or `undefined`).
- `configureSessionValidation` produces a closure that delegates correctly to `requireAuthenticatedSession`.

### D) `apps/server/src/auth/accountLookup.logic.ts` — new

Locked exports:

- `findAccountByAuthProviderSub(authProvider, authProviderSub, database): Promise<Result<...>>` — read-only SELECT against `legendary.players` keyed on `(auth_provider, auth_provider_id)`. Locked SQL: `SELECT ext_id, auth_provider, auth_provider_id FROM legendary.players WHERE auth_provider = $1 AND auth_provider_id = $2 LIMIT 1`. Returns `Result.ok(null)` on no match; `Result.fail({ code: 'lookup_failed' })` on DB error; `Result.ok({ accountId: ext_id-as-AccountId, authProvider, authProviderId })` on hit. Exact `Result<T>` payload shape locked by D-11203.

### E) `apps/server/src/auth/accountLookup.logic.test.ts` — new

`node:test` suite. DB-required tests use the existing `hasTestDatabase` skip pattern from `apps/server/src/identity/`. Test count target: **5–8 cases** covering happy path (existing `'email'` / `'google'` / `'discord'` row), no-match case (returns `Result.ok(null)`), DB error path (returns `Result.fail({ code: 'lookup_failed' })`), and case-folding / canonicalization edge cases (the helper does NOT canonicalize the input — it queries verbatim, mirroring the existing `findAccountByHandle` precedent).

### F) `docs/ai/REFERENCE/api-endpoints.md` — modified

Add two `Library-only` rows in the `## Library-only — Function Reachable Via Direct Import, No HTTP Surface Today` section, immediately after the WP-053 `submitCompetitiveScore` row. Each row mirrors the WP-101 `claimHandle` / `findAccountByHandle` row format. Field names match `00.2-data-requirements.md` exactly. `Authorizing WP`: `WP-112`. `Notes`: cite WP-099 §A and the F-1..F-7 disposition; cite the unconfigured-default fail-closed posture per D-11204; note "no HTTP surface in WP-112; future request-handler WP wires `requireAuthenticatedSession` into authenticated route handlers". Per D-11804: insertion-only, no replace-whole-row pattern applies (no existing row is being modified).

Plus governance close-out in the same commit (per the recent
WP-115 / WP-122 / WP-125 precedent — ledger updates land in the same
commit as the production files):

- `docs/ai/STATUS.md` — `### WP-112 / EC-112 Executed — Session Token Validation Middleware ({YYYY-MM-DD})` block at top of `## Current State`.
- `docs/ai/DECISIONS.md` — D-11201 (locked here) plus D-11202 / D-11203 / D-11204 (locked at execution); plus an optional D-11205 if the executor adds an explicit `apps/server/src/auth/` directory classification per the D-5202 / D-10201 / D-10301 precedent.
- `docs/ai/work-packets/WORK_INDEX.md` — WP-112 row checked off with date + commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-112 row flipped Draft → Done.

---

## Out of Scope

- **No Hanko SDK installation, configuration, or wiring.** All Hanko-specific code is WP-126's scope per D-11201.
- **No JWT validation library, no JWKS endpoint, no signature verification.** WP-126 owns these.
- **No HTTP route registration.** WP-112 ships the orchestrator as a library function. Wiring `requireAuthenticatedSession` into a Koa route handler is a future request-handler WP's scope (mirrors the WP-053 `submitCompetitiveScore` "ships fail-closed unwired" precedent).
- **No `apps/server/src/identity/` modifications.** Per D-9904 / WP-099 §B, `identity/` remains broker-free; the new lookup lives in `auth/`.
- **No login UI, no account-creation flow, no `/account` surface.** Future work — likely a Hanko-implementation-WP-paired UI WP.
- **No CSRF middleware, no cookie support, no WebSocket carrier.** Token extraction per D-11202 (recommended default: bearer header only).
- **No rate limiting, no IP-based throttling, no replay-attack defense beyond `expiresAt` check.** Future hardening WP.
- **No multi-device session management, no session revocation API.** Future hardening WP.
- **No `legendary.sessions` table, no session-token storage in PostgreSQL.** WP-112 is stateless on the server side; the verifier owns whatever stateful refresh / revocation surface exists.
- **No modifications to the boardgame.io built-in routes.** Authentication does not gate match creation, lobby join, or play — those routes remain `guest` per the existing `api-endpoints.md` rows.
- **No modifications to `apps/server/src/profile/`, `apps/server/src/leaderboards/`, or any other existing route module.** Wiring `requireAuthenticatedSession` into existing routes is the future request-handler WP's scope.
- **No `'hanko'` enum value introduction.** F-1 of WP-099 §C is preserved by construction.
- **No category-wide `auth_provider` enum extension.** Per D-9902, the existing `'email' | 'google' | 'discord'` enum is unchanged.
- Refactors, cleanups, or "while I'm here" improvements are **out of scope** unless explicitly listed in Scope (In) above.

---

## Files Expected to Change

- `apps/server/src/auth/sessionToken.types.ts` — **new** — `SessionVerifier`, `VerifiedSessionClaim`, error-code unions, `RequireAuthenticatedSessionOptions`.
- `apps/server/src/auth/sessionToken.logic.ts` — **new** — `requireAuthenticatedSession`, `configureSessionValidation`, token extraction.
- `apps/server/src/auth/sessionToken.logic.test.ts` — **new** — logic-pure `node:test` suite (10–14 cases).
- `apps/server/src/auth/accountLookup.logic.ts` — **new** — `findAccountByAuthProviderSub` read-only SELECT.
- `apps/server/src/auth/accountLookup.logic.test.ts` — **new** — DB-required + DB-skip `node:test` suite (5–8 cases).
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — add two `Library-only` rows per D-11804.

No other files may be modified.

Plus governance close-out (per the recent WP-115 / WP-122 / WP-125
precedent — ledger updates land in the same commit as the production
files):

- `docs/ai/STATUS.md` — execution entry at top of `## Current State`.
- `docs/ai/DECISIONS.md` — D-11201 (verbatim from §Decision Points) + D-11202 / D-11203 / D-11204 (locked at execution from the recommended defaults or executor-chosen alternatives) + optional D-11205 (`apps/server/src/auth/` directory classification).
- `docs/ai/work-packets/WORK_INDEX.md` WP-112 row checked off with date + commit hash.
- `docs/ai/execution-checklists/EC_INDEX.md` EC-112 row flipped Draft → Done.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Module Layout
- [ ] `apps/server/src/auth/` directory exists and contains exactly **five** new TypeScript files: three production `.ts` files (`sessionToken.types.ts`, `sessionToken.logic.ts`, `accountLookup.logic.ts`) plus two `.test.ts` files (`sessionToken.logic.test.ts`, `accountLookup.logic.test.ts`). Test files are NOT folded; each production logic file has its own paired test file.
- [ ] `apps/server/src/auth/hanko/` directory does **not** exist (created by WP-126, not WP-112).
- [ ] No file in scope imports `@teamhanko/*`, `hanko.io`, or any Hanko-specific symbol (verified by grep at §Verification Steps).

### `SessionVerifier` Contract
- [ ] `apps/server/src/auth/sessionToken.types.ts` exports `SessionVerifier` interface with method `verify(token: string): Promise<Result<VerifiedSessionClaim, SessionVerificationErrorCode>>`.
- [ ] `VerifiedSessionClaim` shape is exactly `{ authProvider: AuthProvider; authProviderSub: string; expiresAt: string; }` — no additional fields.
- [ ] `SessionVerificationErrorCode` and `SessionValidationErrorCode` are closed unions (no `| string`).

### Orchestrator Behavior

> *Why `Result<T>` rather than `throw`:* preserves the WP-052 / D-5201
> identity-layer precedent (every fallible identity operation returns
> a discriminated-union `Result<T>` with a closed `code` union and a
> full-sentence `reason`); ensures authentication failures are
> observable, typed, and non-exceptional control flow rather than
> framework-level exceptions; and keeps the orchestrator
> caller-portable (handlers, CLI scripts, tests, future request-
> handler WPs) without wrapping every call site in `try/catch`.

- [ ] `requireAuthenticatedSession` is exported from `apps/server/src/auth/sessionToken.logic.ts` with signature `(req, options): Promise<Result<AccountId, SessionValidationErrorCode>>`.
- [ ] Orchestrator never throws. Every failure path returns `Result.fail` with a closed-union `code` and a full-sentence `reason`.
- [ ] Unconfigured-default behavior matches the lock from D-11204 (recommended default: returns `Result.fail({ code: 'session_verifier_not_configured', reason: <full sentence> })`).
- [ ] Token extraction matches the source locked under D-11202.
- [ ] Orchestrator checks `expiresAt` on `VerifiedSessionClaim` and returns `Result.fail({ code: 'expired_token' })` if the claim is expired (defense-in-depth).

### Lookup Helper
- [ ] `findAccountByAuthProviderSub` is exported from `apps/server/src/auth/accountLookup.logic.ts` with signature locked under D-11203.
- [ ] Helper executes exactly one SELECT against `legendary.players` per call (`SELECT ext_id, auth_provider, auth_provider_id FROM legendary.players WHERE auth_provider = $1 AND auth_provider_id = $2 LIMIT 1`).
- [ ] Helper returns `Result.ok(null)` on no match, `Result.ok({ accountId, authProvider, authProviderId })` on hit, `Result.fail({ code: 'lookup_failed' })` on DB error. Never throws.
- [ ] No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP appears in `accountLookup.logic.ts` (verified by grep).

### F-1..F-7 Future-Auth Gate
- [ ] **F-1:** No file in scope contains the literal `'hanko'` or `"hanko"` (verified by grep).
- [ ] **F-2:** All Hanko-specific imports / types / literals are absent from `apps/server/src/auth/` and from `apps/server/src/identity/`, `packages/game-engine/`, `packages/registry/`, `apps/registry-viewer/`, `apps/arena-client/`. (`grep -rE "@teamhanko|hanko\.io" apps/server/src/identity packages apps/registry-viewer apps/arena-client apps/server/src/auth` returns zero matches.)
- [ ] **F-3:** No call to `node:crypto.randomUUID()` in any WP-112 file. The helper looks up existing `AccountId`s, never creates them.
- [ ] **F-4:** No existing guest-accessible route is modified to require authentication. (Verified: `git diff apps/server/src/server.mjs` shows no new `requireAuthenticatedSession` invocation; `git diff apps/server/src/leaderboards/ apps/server/src/profile/` shows no changes.)
- [ ] **F-5:** Zero new entries in `apps/server/package.json` `dependencies` or `devDependencies`. (`git diff apps/server/package.json` is clean.)
- [ ] **F-6:** Replacement-safety thought experiment passes: removing Hanko (when WP-126 lands later) requires no change to any WP-112 file. The orchestrator imports zero Hanko symbol; the `SessionVerifier` interface admits any OIDC-compliant or self-hosted verifier.
- [ ] **F-7:** WP-112 contains a `## Vision Alignment` block citing §3, §11, §14, §15, NG-1, NG-3, NG-6 with a no-conflict assertion and an N/A determinism line.

### Layer Boundary
- [ ] No `boardgame.io` import in any WP-112 file (verified by grep).
- [ ] No import from `packages/game-engine/`, `packages/registry/`, or `packages/preplan/` in any WP-112 file.
- [ ] No import from `apps/registry-viewer/` or `apps/arena-client/` in any WP-112 file.
- [ ] All WP-112 files live under `apps/server/src/auth/` exclusively.

### Tests
- [ ] All `sessionToken.logic.test.ts` tests pass without a live database (logic-pure, fakes injected).
- [ ] `accountLookup.logic.test.ts` uses the existing `hasTestDatabase` skip pattern; passes against a configured `TEST_DATABASE_URL` and skips cleanly without one.
- [ ] No `boardgame.io` import in any test file.
- [ ] All test files use `.test.ts` extension.
- [ ] All tests use `node:test` and `node:assert` only.

### Scope Enforcement
- [ ] `git diff apps/server/src/identity/ data/migrations/004_create_players_table.sql data/migrations/005_create_replay_ownership_table.sql docs/ai/work-packets/WP-099-auth-provider-selection.md docs/ai/work-packets/WP-052-player-identity-replay-ownership.md .claude/` returns no changes.
- [ ] `git diff --name-only` lists only the six production / reference files in §Files Expected to Change plus the four governance ledgers (STATUS / DECISIONS / WORK_INDEX / EC_INDEX) — exactly 10 files at session close.
- [ ] No SQL write operations in any WP-112 file (verified by grep).

### API Catalog (per `00.3 §21` + D-11804)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated in the same commit as the new `apps/server/src/auth/` files (D-11804 same-commit constraint).
- [ ] Two new rows added in the `## Library-only` section: one for `requireAuthenticatedSession`, one for `findAccountByAuthProviderSub`.
- [ ] Each new row's `Status` column is exactly `Library-only` (closed-set value per D-11804).
- [ ] Each new row's `Auth` column is exactly `(n/a — caller-injected dependencies)` matching the precedent for caller-injected `DatabaseClient` rows in the same section.
- [ ] Each new row's `Authorizing WP` column is `WP-112`.
- [ ] Field names in each row's request and response schemas (`accountId`, `authProvider`, `authProviderId`, etc.) match `00.2-data-requirements.md` verbatim. `accountProviderSub` does **not** appear (the on-the-wire / catalog spelling is `authProviderId` per WP-052).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run server tests (post-WP-112 baseline)
pnpm --filter "@legendary-arena/server" test
# Expected: pre-WP-112 baseline + new tests, 0 failing. The existing
# hasTestDatabase skip pattern continues to handle DB-required cases.

# Step 3 — run engine tests (must be unchanged)
pnpm --filter "@legendary-arena/game-engine" test
# Expected: engine baseline unchanged, 0 failing.

# Step 4 — F-1: no 'hanko' literal in scope files
Select-String -Path "apps\server\src\auth" -Pattern "'hanko'|""hanko""" -Recurse
# Expected: no output.

# Step 5 — F-2: no Hanko-specific imports anywhere outside the (not-yet-created) hanko/ subdirectory
Select-String -Path "apps\server\src\identity","packages","apps\registry-viewer","apps\arena-client","apps\server\src\auth" -Pattern "@teamhanko|hanko\.io" -Recurse
# Expected: no output.

# Step 6 — F-5: no new npm deps
git diff apps/server/package.json
# Expected: no output.

# Step 7 — no boardgame.io import in WP-112 files
Select-String -Path "apps\server\src\auth" -Pattern "from .['\"]boardgame\.io" -Recurse
# Expected: no output.

# Step 8 — no engine / registry / preplan import in WP-112 files
Select-String -Path "apps\server\src\auth" -Pattern "@legendary-arena/(game-engine|registry|preplan)" -Recurse
# Expected: no output.

# Step 9 — no SQL write operations in scope files
Select-String -Path "apps\server\src\auth" -Pattern "INSERT |UPDATE |DELETE |CREATE |DROP |ALTER " -Recurse
# Expected: no output (the sole SELECT in accountLookup.logic.ts is the only SQL).

# Step 10 — exactly one SELECT against legendary.players in scope
Select-String -Path "apps\server\src\auth" -Pattern "FROM legendary\.players" -Recurse
# Expected: exactly one match (in accountLookup.logic.ts).

# Step 11 — orchestrator never throws (no `throw` keyword in scope production files)
Select-String -Path "apps\server\src\auth\sessionToken.logic.ts","apps\server\src\auth\accountLookup.logic.ts" -Pattern "^\s*throw " -Recurse
# Expected: no output. Every failure path returns Result.fail.

# Step 12 — no WP-052 / WP-099 contract files modified
git diff apps/server/src/identity/ data/migrations/004_create_players_table.sql data/migrations/005_create_replay_ownership_table.sql docs/ai/work-packets/WP-099-auth-provider-selection.md docs/ai/work-packets/WP-052-player-identity-replay-ownership.md .claude/
# Expected: no output.

# Step 13 — only the expected files changed
git diff --name-only
# Expected: exactly the six production / reference files plus the four governance ledgers (10 files).

# Step 14 — D-11804 catalog update present
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "requireAuthenticatedSession|findAccountByAuthProviderSub"
# Expected: at least two matches (one per new Library-only row).

# Step 15 — closed-set Status taxonomy compliance for the new rows
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "WP-112"
# Expected: matches present in the two new Library-only rows; manually verify
# Status column carries exactly `Library-only` and no other value.
```

---

## Definition of Done

> Claude Code must execute every verification command in
> `## Verification Steps` before checking any item below. Reading the
> code is not sufficient — run the commands.
>
> Every item must be true before this packet is considered complete.

This packet is complete when ALL of the following are true:

- [ ] All §Acceptance Criteria pass (binary).
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 with all pre-existing baselines preserved plus the new WP-112 tests.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with engine baseline unchanged.
- [ ] No file under `apps/server/src/auth/hanko/` was created (WP-126's scope, not WP-112).
- [ ] No file under `apps/server/src/identity/`, `packages/`, or `data/migrations/004*.sql` / `005*.sql` was modified.
- [ ] No file under `docs/ai/work-packets/WP-099-auth-provider-selection.md` or `docs/ai/work-packets/WP-052-player-identity-replay-ownership.md` was modified.
- [ ] No file under `.claude/rules/*.md` was modified.
- [ ] No new npm dependencies introduced (`apps/server/package.json` clean).
- [ ] F-1..F-7 disposition matches the §WP-099 Future-Auth Gate Disposition block above.
- [ ] D-11201 entered into `docs/ai/DECISIONS.md` verbatim from §Decision Points; D-11202 / D-11203 / D-11204 entered with the executor's locked choices.
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries two new `Library-only` rows for `requireAuthenticatedSession` and `findAccountByAuthProviderSub`. Per D-11804 catalog-update obligation.
- [ ] `docs/ai/STATUS.md` updated with a `### WP-112 / EC-112 Executed` block at the top of `## Current State`.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-112 row checked off with today's date and the commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-112 row flipped from `Draft` to `Done {YYYY-MM-DD}`.
- [ ] No files outside `## Files Expected to Change` were modified.

---

## Lint Self-Review

> Performed at draft time (2026-05-02). Re-confirm before execution.
> Covers `00.3-prompt-lint-checklist.md §1–§21`.

| § | Item | Status |
|---|---|---|
| §1 | All required WP sections present (Goal, Assumes, Context, Scope (In), Out of Scope, Files Expected to Change, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done) | PASS |
| §1 | `## Out of Scope` non-empty (≥2 items) | PASS (15 items listed) |
| §2 | Non-Negotiable Constraints with engine-wide + packet-specific + session protocol + locked values | PASS |
| §2 | Constraints reference `00.6-code-style.md` | PASS (Engine-wide bullet 10) |
| §2 | Full file contents required, no diffs/snippets | PASS |
| §3 | `## Assumes` lists prior state and dependency files with verifiable line refs | PASS (WP-099, WP-052, WP-101 + line refs to `identity.types.ts:33,47,58,66,139,149`) |
| §4 | `## Context (Read First)` is specific (no "read the docs") | PASS (WP-099 §A/§B/§C; D-9901..D-9905; D-10002; D-11804; D-5201; explicit file paths) |
| §4 | Architectural sections cited where relevant | PASS (`.claude/rules/server.md`, `.claude/rules/architecture.md` "Authority Hierarchy"; `02-CODE-CATEGORIES.md §server`) |
| §4 | DECISIONS.md scan instruction included | PASS (Context bullets 4–7 cite D-9901..D-9905, D-10002, D-11804, D-5201) |
| §5 | Every file is `new` or `modified` with one-line description | PASS (six entries in §Files Expected to Change with explicit new/modified labels) |
| §5 | No ambiguous "update this section" language | PASS |
| §5 | File count ≤8 (production / reference) | PASS (6 production / reference files; 4 governance ledgers in same commit per WP-115 precedent) |
| §6 | Naming consistency (no abbreviations, canonical paths) | PASS (`database` not `db`, `verifier` not `vfr`, `authProviderId` matches `00.2`, `AccountId` brand preserved) |
| §6 | Setup payload field names: N/A — WP-112 does not touch `MatchSetupConfig` | N/A |
| §7 | No new npm dependencies | PASS (zero deps; `F-5` gate item enforces) |
| §7 | Hanko carve-out compliance | PASS — WP-112 introduces no Hanko-specific code; the §7 Hanko bullet (per D-9903) authorizes Hanko under WP-099, but WP-112 itself is broker-agnostic and does not add `@teamhanko/*` |
| §8 | Layer boundaries respected (no engine / registry / preplan / boardgame.io imports; new code lives in `apps/server/src/auth/`) | PASS |
| §8 | Persistence boundary: G / ctx untouched; PostgreSQL access read-only via existing `pg.Pool` pattern | PASS |
| §9 | Cross-platform commands (Verification Steps use `pwsh` `Select-String` per WP-115 precedent + `git diff`) | PASS |
| §10 | Env vars: N/A — WP-112 introduces no new env vars (DATABASE_URL pre-existing; Hanko env vars are WP-126's scope) | N/A |
| §11 | Auth: WP-112 implements the WP-099 §A contract; identity model is `AccountId` server-generated (Option B-equivalent, credentials-only via WP-099 Hanko broker carve-out); `## Limitations` covered by §Out of Scope (no UI, no CSRF, no cookies, no session revocation) | PASS |
| §12 | Tests: all logic-pure (`node:test`); fakes injected; no live DB / network in `sessionToken.logic.test.ts`; `accountLookup.logic.test.ts` uses existing `hasTestDatabase` skip pattern | PASS |
| §13 | Verification commands are exact with expected output | PASS (15 steps; each has expected output) |
| §14 | Acceptance criteria are 6–12 binary observable items grouped by sub-task | PASS (8 AC groups; each group has 3–7 binary items; total ~38 items — exceeds 12 because of the F-1..F-7 sub-checks per WP-099 §C audit-discipline; each is binary) |
| §15 | DoD includes STATUS.md + DECISIONS.md + WORK_INDEX.md + scope-boundary check | PASS |
| §16 | Code style: applies to the production deliverables; locked to `00.6-code-style.md` rules in §Non-Negotiable Constraints; `// why:` comments required at every `setPhase` / `endTurn` / `ctx.random.*` (N/A here — no engine touch) and at every fail-closed default per D-11204 lock | PASS |
| §17 | Vision Alignment block present with cited clauses (§3, §11, §14, §15, NG-1, NG-3, NG-6) + no-conflict assertion + N/A determinism line | PASS |
| §18 | Prose-vs-grep discipline: forbidden tokens cited via D-9901..D-9905 / WP-099 references, not enumerated verbatim near literal-string greps. The F-1 `'hanko'` grep at Verification Step 4 targets a forbidden literal; the prose nearby uses prose framing (`'hanko'` enum value) rather than the literal token unquoted | PASS |
| §19 | Bridge-vs-HEAD staleness: N/A — this WP is not a repo-state-summarizing artifact | N/A |
| §20 | Funding Surface Gate Trigger: N/A — WP-112 introduces no funding surface. None of the five §20.1 trigger surfaces apply: (a) no donate / contribute / sponsor / fund affordances; (b) no registry-viewer funding affordances; (c) no user-profile or account funding-attribution surface; (d) no tournament-funding-channel integration; (e) no user-visible copy referencing donate / support / tournament funding. WP-112's subject is server-side session-validation infrastructure, which is governed by WP-099 D-9901..D-9905 — *not* a money-flow surface. Justification names a concrete reason (auth identity vs. funding domain) and is not tautological. | N/A |
| §21 | API Catalog Update: triggered (WP-112 adds new library functions reachable via direct import from `apps/server/src/**`); `docs/ai/REFERENCE/api-endpoints.md` is in §Files Expected to Change; two new `Library-only` rows specified per §API Catalog Update Obligation block above; closed-set Status / Auth taxonomies preserved per D-11804 | PASS |

**Final Gate verdict:** PASS at draft time (2026-05-02). Re-confirm
before execution by re-running the §1–§21 walkthrough against the
post-amendment state of this WP file (no amendments expected; WP-112
is a forward-only draft).
